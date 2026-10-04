const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
const DISCORD_ME_URL = "https://discord.com/api/users/@me";
const CALLBACK_PATH = "/api/auth/callback";
const DEFAULT_DISCORD_REDIRECT_URI = "https://kingshot-data-platform.black-jack-kingshot.workers.dev/api/auth/callback";
const SESSION_COOKIE = "eagleeye_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

import { mightPulseFetch, getMightPulsePlayer, getMightPulsePlayerRanks, getMightPulseKingdomRanks, getMightPulseKingdomAllRankings } from "./mightpulse.js";
import { MIGHTPULSE_RESEARCH_CANDIDATES, runMightPulseResearch } from "./mightpulse-research.js";
import { savePlayerRankSnapshot, buildPlayerRankSnapshotStatement, saveKingdomRankingBoard, getLatestKingdomRankings, getRankingHistory, getPlayerRankHistory, getKingdomRankingChanges, normalizeGovernorId } from "./ranking-store.js";
import { observationEnvelope } from "./mightpulse-normalizer.js";
import { saveApiObservation } from "./api-observations.js";
import { getLatestPlayerObservation, materializePlayer, getPlayer, getPlayerHistory, getPlayerNameHistory } from "./player-store.js";
import { configureApiPoolEncryption, addApiPoolKey, listApiPoolKeys, leaseApiKey, leaseApiKeyForHealthCheck, recordApiPoolSuccess, recordApiPoolFailure, getPoolStats, getApiPoolAvailability, getApiPoolBudgetSnapshot, releaseExpiredLeases } from "./api-pool.js";
import { getRetentionSettings, updateRetentionSettings, runRetentionCleanup } from "./retention.js";
import { exportToGoogleSheet } from "./google-sheets.js";
import { ensureDiagnosticSchema, diagnosticTraceId, recordDiagnostic, getSystemDiagnostics, DIAGNOSTIC_SERVICES } from "./diagnostics.js";
import { getCloudflareD1Usage, cloudflareUsageLabel } from "./cloudflare-analytics.js";
import { handleGatewayApi } from "./gateway-api.js";
import { getOperationalStatus } from "./status-ops.js";
import { buildSafetySnapshot, evaluateSafetyGate, SAFETY_PRIORITIES } from "./safety-gate.js";
import { createCollectionSemaphoreLimiter } from "./collection-semaphore.js";
import { collectMightPulseThroughGuards, collectKingdomRanking, collectPlayerDetail } from "./data-collection-engine.js";
import { runKingdomCatalogDiscovery } from "./kingdom-catalog.js";
import { drainHistoryEmergencyBuffer } from "./history-emergency-buffer.js";
import { recordServiceUsage } from "./service-usage.js";
import { handleServiceUsageQueue } from "./service-usage-archive.js";
import { getGoogleDriveOAuthAuthorizationUrl, exchangeGoogleDriveOAuthCode, createGoogleDriveArchiveFolder, getGoogleDriveConnectionStatus, verifyGoogleDriveRefreshToken } from "./google-drive.js";
import { getUserPlayerLink, getUserPlayerLinks, getUserPlayerLinksWithPlayers, saveUserPlayerLink, disableUserPlayerLink, validateGovernorId, findActiveGovernorOwner, createOwnershipSupportRequest, verifyAndTransferPlayerLink } from "./user-player-link.js";
import { registerUserMightPulseApiKey, getAdvancedEligibility, evaluateAdvancedEligibility } from "./user-eligibility.js";
import { handleSupportApi, handleSupportContextApi, handleSupportInteraction, registerSupportCommands, SUPPORT_CATALOG } from "./discord-support.js";
import { normalizeCompareGovernorIds, buildPlayerCompareSeries, extractOptionalPlayerAssets } from "./player-compare.js";
import { handleApiRawDataApi, handleApiRawHistoryApi, renderApiRawDataPage } from "./api-raw-inspector.js";
import { renderAdminDataCoveragePage } from "./admin-data-coverage.js";
import { handleOwnerKingdomLoadTestApi, handleOwnerKingdomLoadTestStatusApi, handleOwnerKingdomLoadTestHistoryApi, handleOwnerKingdomLoadTestCancelApi, handleOwnerKingdomLoadTestExportApi, renderOwnerKingdomLoadTestPage } from "./admin-kingdom-load-test.js";
import { handleAdminSystemLogApi, renderAdminSystemLogPage } from "./admin-system-log.js";
import { recordSystemEvent, systemTraceId } from "./system-log.js";
import { archiveSystemEventLog } from "./retention.js";

async function runDiagnosticHealthChecks(env) {
  if (!env?.DB) return;
  const now = Math.floor(Date.now() / 1000);
  try {
    const recent = await env.DB.prepare(
      "SELECT service, MAX(created_at) AS created_at FROM diagnostic_events GROUP BY service"
    ).all();
    const lastByService = new Map((recent.results || []).map(row => [String(row.service), Number(row.created_at || 0)]));
    const due = service => !lastByService.has(service) || now - lastByService.get(service) >= 3600;
    const write = input => recordDiagnostic(env.DB, { ...input, feature: input.feature || "diagnostic_probe", operation: input.operation || "HEALTH_CHECK" });

    if (due("d1")) {
      const started = Date.now();
      try {
        await env.DB.prepare("SELECT 1 AS ok").first();
        await write({ service:"d1", status:"SUCCESS", message:"D1診断プローブ成功", elapsedMs:Date.now()-started });
      } catch (error) {
        await write({ service:"d1", status:"FAILED", errorCode:"D1_HEALTH_CHECK_FAILED", message:error?.message || "D1診断に失敗しました。", elapsedMs:Date.now()-started });
      }
    }

    if (due("api_pool") || due("mightpulse")) {
      const started = Date.now();
      configureApiPoolEncryption(env.EAGLEEYE_SESSION_SECRET);
      const key = await env.DB.prepare(
        "SELECT key_id, pool_type FROM api_pool_keys WHERE provider = 'MIGHTPULSE' AND status = 'AVAILABLE' AND (leased_until IS NULL OR leased_until <= ?) ORDER BY COALESCE(last_used_at, 0) ASC LIMIT 1"
      ).bind(now).first();

      if (!key) {
        const message = "診断用に利用できるMightPulse APIキーがありません。";
        if (due("api_pool")) await write({ service:"api_pool", status:"WARNING", errorCode:"NO_API_POOL_KEY_AVAILABLE", message });
        if (due("mightpulse")) await write({ service:"mightpulse", status:"WARNING", errorCode:"NO_API_POOL_KEY_AVAILABLE", message });
      } else {
        let lease = null;
        try {
          lease = await leaseApiKeyForHealthCheck(env.DB, {
            keyId: key.key_id,
            purpose: "DIAGNOSTIC_HEALTH_CHECK",
            targetType: "API_KEY",
            targetId: String(env.MIGHTPULSE_HEALTHCHECK_GOVERNOR_ID || "225623582")
          });
          const result = await getMightPulsePlayer(env, String(env.MIGHTPULSE_HEALTHCHECK_GOVERNOR_ID || "225623582"), {
            include: "base",
            apiKey: lease.api_key
          });
          await recordApiPoolSuccess(env.DB, {
            keyId: lease.key_id,
            leaseId: lease.lease_id,
            poolType: lease.pool_type,
            endpoint: "/players/:governor_id",
            targetType: "API_KEY",
            targetId: String(env.MIGHTPULSE_HEALTHCHECK_GOVERNOR_ID || "225623582"),
            purpose: "DIAGNOSTIC_HEALTH_CHECK",
            httpStatus: result.status,
            remainingMinute: parseHeaderNumber(result.headers, "x-ratelimit-remaining"),
            remainingDay: parseHeaderNumber(result.headers, "x-ratelimit-day-remaining")
          });
          const elapsed = Date.now() - started;
          if (due("api_pool")) await write({ service:"api_pool", status:"SUCCESS", message:"API Pool診断プローブ成功", provider:"MIGHTPULSE", targetType:"API_KEY", targetId:lease.key_id, elapsedMs:elapsed, metadata:{ poolType:lease.pool_type } });
          if (due("mightpulse")) await write({ service:"mightpulse", status:"SUCCESS", message:"MightPulse API診断プローブ成功", provider:"MIGHTPULSE", targetType:"API_KEY", targetId:lease.key_id, elapsedMs:elapsed, metadata:{ httpStatus:result.status, poolType:lease.pool_type } });
        } catch (error) {
          if (lease) {
            const status = Number(error?.status || 0);
            const cooldown = status === 429 ? 60 : status >= 500 || error?.code === "MIGHTPULSE_TIMEOUT" || error?.code === "MIGHTPULSE_NETWORK_ERROR" ? 15 : 0;
            const disable = status === 401 || status === 403;
            const keepAvailable = !disable && cooldown === 0 && (status === 400 || status === 404);
            await recordApiPoolFailure(env.DB, {
              keyId: lease.key_id, leaseId: lease.lease_id, poolType: lease.pool_type,
              endpoint:"/players/:governor_id", targetType:"API_KEY", targetId:String(env.MIGHTPULSE_HEALTHCHECK_GOVERNOR_ID || "225623582"),
              purpose:"DIAGNOSTIC_HEALTH_CHECK", httpStatus:status, errorCode:error?.code || "MIGHTPULSE_REQUEST_FAILED",
              errorMessage:error?.message || null, cooldownSeconds:cooldown, disable, keepAvailable
            });
          }
          const message = error?.message || "MightPulse診断プローブに失敗しました。";
          const code = error?.code || "MIGHTPULSE_HEALTH_CHECK_FAILED";
          if (due("api_pool")) await write({ service:"api_pool", status:"FAILED", errorCode:code, message:"API Pool診断中のMightPulse接続に失敗: " + message, provider:"MIGHTPULSE", elapsedMs:Date.now()-started });
          if (due("mightpulse")) await write({ service:"mightpulse", status:"FAILED", errorCode:code, message, provider:"MIGHTPULSE", elapsedMs:Date.now()-started });
        }
      }
    }

    if (due("discord")) {
      const configured = Boolean(env.DISCORD_CLIENT_ID && env.EAGLEEYE_SESSION_SECRET);
      await write({
        service:"discord",
        status:configured ? "SUCCESS" : "WARNING",
        errorCode:configured ? null : "DISCORD_AUTH_NOT_CONFIGURED",
        message:configured ? "Discord認証設定の診断確認成功" : "Discord認証に必要な設定が未構成です。"
      });
    }

    if (due("discord_support")) {
      const configured = Boolean(
        env.DISCORD_SUPPORT_GUILD_ID &&
        env.DISCORD_SUPPORT_CATEGORY_ID &&
        env.DISCORD_SUPPORT_ROLE_ID &&
        env.DISCORD_SUPPORT_ARCHIVE_CATEGORY_ID &&
        env.DISCORD_BOT_TOKEN &&
        env.DISCORD_PUBLIC_KEY
      );
      await write({
        service:"discord_support",
        status:configured ? "SUCCESS" : "WARNING",
        errorCode:configured ? null : "DISCORD_SUPPORT_NOT_CONFIGURED",
        message:configured ? "Discord Support設定の診断確認成功" : "Discord Supportに必要な設定が未構成です。"
      });
    }

    if (due("retention")) {
      await write({
        service:"retention",
        status:env.DB ? "SUCCESS" : "WARNING",
        errorCode:env.DB ? null : "D1_NOT_CONFIGURED",
        message:env.DB ? "データ保持機能の診断確認成功" : "データ保持機能にD1が必要です。"
      });
    }

    if (due("history_storage")) {
      const configured = Boolean(env.DB && env.ARCHIVE);
      await write({
        service:"history_storage",
        status:configured ? "SUCCESS" : "WARNING",
        errorCode:configured ? null : "HISTORY_STORAGE_NOT_CONFIGURED",
        message:configured ? "履歴ストレージ設定の診断確認成功" : "履歴ストレージに必要なD1/R2設定が未構成です。",
        metadata: { mode: String(env.HISTORY_STORAGE_MODE || "R2_ONLY") }
      });
    }

    if (due("google_sheets")) {
      const spreadsheetConfigured = Boolean(env.GOOGLE_SHEETS_SPREADSHEET_ID);
      const serviceAccountConfigured = Boolean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
      const appsScriptConfigured = Boolean(env.GOOGLE_SHEETS_WEBAPP_URL && env.GOOGLE_SHEETS_WEBAPP_SECRET);
      const configured = spreadsheetConfigured && (serviceAccountConfigured || appsScriptConfigured);
      const transport = appsScriptConfigured ? "Apps Script Web App" : serviceAccountConfigured ? "Google Sheets API" : null;
      await write({
        service:"google_sheets",
        status:configured ? "SUCCESS" : "WARNING",
        errorCode:configured ? null : "GOOGLE_SHEETS_NOT_CONFIGURED",
        message:configured
          ? "Google Sheets連携設定の診断確認成功"
          : "Google Sheets連携設定が未構成です。",
        metadata: transport ? { transport } : undefined
      });
    }

    if (due("notifications")) {
      await write({
        service:"notifications",
        status:"WARNING",
        errorCode:"NOTIFICATION_PROBE_NOT_CONFIGURED",
        message:"通知送信経路の自動診断プローブは未構成です。"
      });
    }
  } catch (error) {
    console.error("diagnostic_health_check_failed", error?.message || error);
  }
}

async function runDataRetentionJob(env) {
  if (!env.DB) return;
  await ensureDiagnosticSchema(env.DB);

  try {
    const result = await runRetentionCleanup(env.DB, {
      batchSize: 1000,
      archiveBucket: env.ARCHIVE
    });
    await recordDiagnostic(env.DB, {
      service: "retention",
      feature: "data_retention",
      operation: "CLEANUP",
      status: "SUCCESS",
      message: "データ保持期間クリーンアップ成功",
      metadata: {
        deleted: result.deleted,
        archived: result.archived
      }
    });
    console.log("data_retention_cleanup_ok", result.deleted);
  } catch (error) {
    await recordDiagnostic(env.DB, {
      service: "retention",
      feature: "data_retention",
      operation: "CLEANUP",
      status: "FAILED",
      errorCode: String(error?.message || "RETENTION_CLEANUP_FAILED").split(":")[0],
      message: String(error?.message || error).slice(0, 2000)
    });
    console.error("data_retention_cleanup_failed", error?.message || error);
  }

  // System Log retention is intentionally independent from the configurable
  // data-retention tables. A failure in another retention target must not
  // prevent the 24h System Log archive from running.
  try {
    const systemLogArchive = await archiveSystemEventLog(
      env.DB,
      env.ARCHIVE,
      { batchSize: 1000 }
    );
    await recordDiagnostic(env.DB, {
      service: "system_log",
      feature: "system_log_archive",
      operation: "ARCHIVE_EXPIRED_SYSTEM_EVENTS",
      status: systemLogArchive?.skipped ? "WARNING" : "SUCCESS",
      message: systemLogArchive?.skipped
        ? "System Log R2アーカイブを実行できませんでした。D1のイベントは削除していません。"
        : "System Logの24時間Retention処理成功",
      metadata: systemLogArchive
    });
    console.log("system_log_archive_ok", systemLogArchive);
  } catch (error) {
    await recordDiagnostic(env.DB, {
      service: "system_log",
      feature: "system_log_archive",
      operation: "ARCHIVE_EXPIRED_SYSTEM_EVENTS",
      status: "FAILED",
      errorCode: String(error?.message || "SYSTEM_LOG_ARCHIVE_FAILED").split(":")[0],
      message: String(error?.message || error).slice(0, 2000)
    });
    console.error("system_log_archive_failed", error?.message || error);
  }
}

const API_REQUEST_LOCK_TTL_SECONDS = 180;

let apiRequestLockSchemaPromise = null;

async function ensureApiRequestLockSchema(db) {
  if (apiRequestLockSchemaPromise) return apiRequestLockSchemaPromise;
  apiRequestLockSchemaPromise = db.prepare(`
    CREATE TABLE IF NOT EXISTS api_request_locks (
      lock_key TEXT PRIMARY KEY,
      lock_token TEXT NOT NULL,
      lock_until INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `).run().then(() => undefined);
  try {
    return await apiRequestLockSchemaPromise;
  } catch (error) {
    apiRequestLockSchemaPromise = null;
    throw error;
  }
}

async function acquireApiRequestLock(env, lockKey, ttlSeconds = API_REQUEST_LOCK_TTL_SECONDS) {
  if (!env.DB) return null;
  await ensureApiRequestLockSchema(env.DB);
  const now = Math.floor(Date.now() / 1000);
  const token = crypto.randomUUID();
  const lockUntil = now + Math.max(30, Number(ttlSeconds) || API_REQUEST_LOCK_TTL_SECONDS);
  const result = await env.DB.prepare(`
    INSERT INTO api_request_locks (lock_key, lock_token, lock_until, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(lock_key) DO UPDATE SET
      lock_token = excluded.lock_token,
      lock_until = excluded.lock_until,
      updated_at = excluded.updated_at
    WHERE api_request_locks.lock_until <= ?
  `).bind(lockKey, token, lockUntil, now, now).run();
  return result?.meta?.changes === 1 ? token : null;
}

async function releaseApiRequestLock(env, lockKey, token) {
  if (!env.DB || !lockKey || !token) return;
  await env.DB.prepare(
    "DELETE FROM api_request_locks WHERE lock_key = ? AND lock_token = ?"
  ).bind(lockKey, token).run();
}

function apiRequestLockConflict(lockKey) {
  const error = new Error("API_REQUEST_IN_PROGRESS");
  error.code = "API_REQUEST_IN_PROGRESS";
  error.status = 409;
  error.lockKey = lockKey;
  return error;
}

const WATCHLIST_LOCK_TTL_SECONDS = 600;

async function acquireKingdomWatchlistLock(env, watchlistId) {
  const now = Math.floor(Date.now() / 1000);
  const lockToken = crypto.randomUUID();
  const lockUntil = now + WATCHLIST_LOCK_TTL_SECONDS;
  const result = await env.DB.prepare(`
    INSERT INTO kingdom_watchlist_locks (watchlist_id, lock_token, lock_until, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(watchlist_id) DO UPDATE SET
      lock_token = excluded.lock_token,
      lock_until = excluded.lock_until,
      updated_at = excluded.updated_at
    WHERE kingdom_watchlist_locks.lock_until <= ?
  `).bind(watchlistId, lockToken, lockUntil, now, now).run();

  return result?.meta?.changes === 1 ? lockToken : null;
}

async function releaseKingdomWatchlistLock(env, watchlistId, lockToken) {
  await env.DB.prepare(
    "DELETE FROM kingdom_watchlist_locks WHERE watchlist_id = ? AND lock_token = ?"
  ).bind(watchlistId, lockToken).run();
}

const KINGDOM_RANKING_BOARDS = [
  "alliance_power", "alliance_kills", "personal_power", "kills", "town_center",
  "rebel_conquest", "single_hero", "hero_total", "troop_power", "building_power",
  "research_power", "hero_no_equip", "hero_equip", "gov_gear", "gov_charm",
  "pet_power", "island_prosperity", "migrant_score", "mystic_trial", "coliseum",
  "forest_of_life", "crystal_cave", "knowledge_nexus", "molten_fort", "radiant_spire",
  "master_power"
];

const PLAYER_WATCHLIST_RANKING_VALUES_SQL = KINGDOM_RANKING_BOARDS.map(board => "('" + board + "')").join(",");

const RANKING_BOARD_LABELS = {
  alliance_power: "同盟総力",
  alliance_kills: "同盟撃破",
  personal_power: "個人総力",
  kills: "個人撃破",
  town_center: "役場Lv.",
  rebel_conquest: "反乱軍討伐ステージ",
  single_hero: "英雄総力",
  hero_total: "英雄全体総力",
  troop_power: "部隊総力",
  building_power: "建物総力",
  research_power: "研究総力",
  hero_no_equip: "英雄総力（装備除外）",
  hero_equip: "英雄総力（装備込み）",
  gov_gear: "領主装備",
  gov_charm: "領主宝石",
  pet_power: "ペット総合実力",
  island_prosperity: "島の繁栄度",
  migrant_score: "移民スコア",
  mystic_trial: "秘境の試練",
  coliseum: "闘技場",
  forest_of_life: "生命の森",
  crystal_cave: "水晶鉱山",
  knowledge_nexus: "知識の枢軸",
  molten_fort: "溶岩要塞",
  radiant_spire: "輝光の塔",
  master_power: "マスター全体総力"
};

const PLAYER_VISIBILITY_ITEMS = [
  { key: "base_identity", category: "基本情報", label: "プレイヤー識別情報", description: "領主ID・UID・FID・プレイヤー名・王国" },
  { key: "base_power", category: "基本情報", label: "戦力・役場", description: "戦力・役場レベル" },
  { key: "base_vip", category: "基本情報", label: "VIP", description: "VIPレベル" },
  { key: "base_coordinates", category: "基本情報", label: "座標", description: "X/Y座標" },
  { key: "base_kills", category: "基本情報", label: "撃破数", description: "撃破数" },
  { key: "base_activity", category: "基本情報", label: "オンライン・最終活動", description: "オンライン状態・最終活動・最終ログイン" },
  { key: "base_profile", category: "基本情報", label: "プロフィール補助情報", description: "アバター・言語・シールド・炎上状態・役職" },
  { key: "alliance_identity", category: "同盟", label: "同盟基本情報", description: "同盟ID・略称・同盟名" },
  { key: "alliance_rank", category: "同盟", label: "同盟順位情報", description: "同盟内順位・順位ラベル" },
  { key: "alliance_stats", category: "同盟", label: "同盟戦力・人数", description: "同盟戦力・人数・盟主・旗" },
  { key: "heroes_list", category: "英雄", label: "英雄一覧", description: "英雄名・レベル・星・品質・戦力・配置" },
  { key: "heroes_skills", category: "英雄", label: "英雄スキル", description: "各英雄のスキルレベル" },
  { key: "heroes_exclusive_gear", category: "英雄", label: "英雄専用装備", description: "専用装備・補正・SLG属性" },
  { key: "heroes_gear", category: "英雄", label: "英雄通常装備", description: "兜・手袋・鎧・靴の装備情報" },
  { key: "hero_rankings", category: "ランキング", label: "英雄ランキング", description: "単英雄・英雄全体・装備除外・装備込みの公式ランキングデータ" },
  { key: "ranks_core", category: "ランキング", label: "主要個人ランキング", description: "戦力・撃破・役場・移民・秘境の試練順位" },
  { key: "ranks_leaderboards", category: "ランキング", label: "その他個人ランキング", description: "leaderboards配列" },
  { key: "gov_gear_list", category: "領主装備", label: "領主装備一覧", description: "領主装備のスロット・品質・ティア・星・強化・スコア・戦闘力" },
  { key: "gov_gear_gems", category: "領主装備", label: "領主装備の宝石", description: "装着宝石のスロット・ID" }
];

let playerVisibilitySchemaPromise = null;
let playerVisibilityCache = null;
let watchlistLimitsCache = null;
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;

async function getWatchlistLimits(db) {
  const now = Date.now();
  if (watchlistLimitsCache && now - watchlistLimitsCache.at < CONFIG_CACHE_TTL_MS) return watchlistLimitsCache.rows;
  const rows = await db.prepare(
    "SELECT role, kingdom_limit, player_limit, updated_at, updated_by FROM watchlist_limits ORDER BY CASE role WHEN 'BASIC' THEN 1 WHEN 'ADVANCED' THEN 2 WHEN 'ADMIN' THEN 3 ELSE 4 END"
  ).all();
  const result = rows.results || [];
  watchlistLimitsCache = { at: now, rows: result };
  return result;
}

function getRoleWatchlistLimit(limits, role, type) {
  const row = (limits || []).find(item => String(item.role).toUpperCase() === String(role).toUpperCase());
  return row ? Number(type === "kingdom" ? row.kingdom_limit : row.player_limit) : 0;
}

async function ensurePlayerVisibilityTable(db) {
  if (playerVisibilitySchemaPromise) return playerVisibilitySchemaPromise;
  playerVisibilitySchemaPromise = (async () => {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS player_visibility_settings (
        item_key TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        label TEXT NOT NULL,
        description TEXT,
        min_role TEXT NOT NULL DEFAULT 'BASIC',
        basic_enabled INTEGER NOT NULL DEFAULT 0,
        advanced_enabled INTEGER NOT NULL DEFAULT 0,
        admin_enabled INTEGER NOT NULL DEFAULT 1,
        owner_enabled INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL,
        updated_by TEXT
      )
    `).run();

    const columns = await db.prepare("PRAGMA table_info(player_visibility_settings)").all();
    const hasMinRole = (columns.results || []).some(col => col.name === "min_role");
    let legacyRows = [];
    if (!hasMinRole) {
      // Capture legacy thresholds before ALTER adds the BASIC default.
      const legacy = await db.prepare(
        "SELECT item_key, basic_enabled, advanced_enabled, admin_enabled, owner_enabled FROM player_visibility_settings"
      ).all();
      legacyRows = legacy.results || [];
      await db.prepare("ALTER TABLE player_visibility_settings ADD COLUMN min_role TEXT NOT NULL DEFAULT 'BASIC'").run();
    }

    // Read all existing rows once. The old implementation issued one SELECT per
    // visibility item, multiplying D1 row reads during cold Worker isolates.
    const existingRows = await db.prepare(
      "SELECT item_key, min_role, basic_enabled, advanced_enabled, admin_enabled, owner_enabled FROM player_visibility_settings"
    ).all();
    const existingByKey = new Map(
      (existingRows.results || []).map(row => [String(row.item_key), row])
    );

    const now = Math.floor(Date.now() / 1000);
    const statements = [];

    if (!hasMinRole && legacyRows.length) {
      for (const row of legacyRows) {
        const minRole =
          Number(row.basic_enabled) === 1 ? "BASIC" :
          Number(row.advanced_enabled) === 1 ? "ADVANCED" :
          Number(row.admin_enabled) === 1 ? "ADMIN" : "OWNER";
        statements.push(
          db.prepare(
            "UPDATE player_visibility_settings SET min_role = ? WHERE item_key = ?"
          ).bind(minRole, row.item_key)
        );
      }
    }

    for (const item of PLAYER_VISIBILITY_ITEMS) {
      if (existingByKey.has(item.key)) continue;

      const minRole = ["base_identity","base_power","base_kills","base_activity","alliance_identity"].includes(item.key)
        ? "BASIC"
        : "ADVANCED";

      statements.push(db.prepare(`
        INSERT INTO player_visibility_settings
          (item_key, category, label, description, min_role, basic_enabled, advanced_enabled, admin_enabled, owner_enabled, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?, 1, 1, 1, 1, ?, NULL)
        ON CONFLICT(item_key) DO NOTHING
      `).bind(
        item.key, item.category, item.label, item.description, minRole, now
      ));
    }

    if (statements.length) await db.batch(statements);
  })();
  try {
    return await playerVisibilitySchemaPromise;
  } catch (error) {
    playerVisibilitySchemaPromise = null;
    throw error;
  }
}

async function getPlayerVisibilitySettings(db) {
  await ensurePlayerVisibilityTable(db);
  const now = Date.now();
  if (playerVisibilityCache && now - playerVisibilityCache.at < CONFIG_CACHE_TTL_MS) return playerVisibilityCache.rows;
  const result = await db.prepare(
    "SELECT item_key, category, label, description, min_role, basic_enabled, advanced_enabled, admin_enabled, owner_enabled, updated_at, updated_by FROM player_visibility_settings ORDER BY rowid"
  ).all();
  const rows = result.results || [];
  playerVisibilityCache = { at: now, rows };
  return rows;
}

function visibilityEnabled(settings, itemKey, role) {
  const row = (settings || []).find(item => item.item_key === itemKey);
  if (!row) return role === "OWNER";
  const roleRank = { BASIC: 1, ADVANCED: 2, ADMIN: 3, OWNER: 4 };
  const userRank = roleRank[String(role).toUpperCase()] || 0;
  const minRank = roleRank[String(row.min_role || "OWNER").toUpperCase()] || 4;
  return userRank >= minRank;
}

function filterPlayerProfileForRole(payload, role, settings) {
  const source = payload && typeof payload === "object" ? payload : {};
  const player = source.player && typeof source.player === "object" ? source.player : source;
  const visible = {};

  if (visibilityEnabled(settings, "base_identity", role)) {
    for (const key of ["uid","governor_id","fid","nick_name","kid"]) if (player[key] !== undefined) visible[key] = player[key];
  }
  if (visibilityEnabled(settings, "base_power", role)) {
    for (const key of ["power","town_center_level"]) if (player[key] !== undefined) visible[key] = player[key];
  }
  if (visibilityEnabled(settings, "base_vip", role) && player.vip !== undefined) visible.vip = player.vip;
  if (visibilityEnabled(settings, "base_coordinates", role)) for (const key of ["x","y"]) if (player[key] !== undefined) visible[key] = player[key];
  if (visibilityEnabled(settings, "base_kills", role) && player.kills !== undefined) visible.kills = player.kills;
  if (visibilityEnabled(settings, "base_activity", role) && player.online !== undefined) visible.online = player.online;
  if (visibilityEnabled(settings, "base_profile", role)) for (const key of ["avatar_url","language","shield_endtime","burn_endtime","office"]) if (player[key] !== undefined) visible[key] = player[key];

  const alliance = player.alliance;
  if (alliance && typeof alliance === "object") {
    const a = {};
    if (visibilityEnabled(settings, "alliance_identity", role)) for (const key of ["aid","abbr","name"]) if (alliance[key] !== undefined) a[key] = alliance[key];
    if (visibilityEnabled(settings, "alliance_rank", role)) for (const key of ["rank","rank_label"]) if (alliance[key] !== undefined) a[key] = alliance[key];
    if (visibilityEnabled(settings, "alliance_stats", role)) for (const key of ["power","count","flag_url","leader_name"]) if (alliance[key] !== undefined) a[key] = alliance[key];
    if (Object.keys(a).length) visible.alliance = a;
  }

  const heroes = Array.isArray(source.heroes) ? source.heroes : [];
  if (heroes.length && (visibilityEnabled(settings, "heroes_list", role) || visibilityEnabled(settings, "heroes_skills", role) || visibilityEnabled(settings, "heroes_exclusive_gear", role) || visibilityEnabled(settings, "heroes_gear", role))) {
    visible.heroes = heroes.map(hero => {
      const h = {};
      if (visibilityEnabled(settings, "heroes_list", role)) for (const key of ["id","name","level","star","stars","star_label","quality","power","icon","position"]) if (hero[key] !== undefined) h[key] = hero[key];
      if (visibilityEnabled(settings, "heroes_skills", role) && hero.skill_levels !== undefined) h.skill_levels = hero.skill_levels;
      if (visibilityEnabled(settings, "heroes_exclusive_gear", role)) {
        if (hero.exclusive_gear_level !== undefined) h.exclusive_gear_level = hero.exclusive_gear_level;
        if (hero.exclusive_gear !== undefined) h.exclusive_gear = hero.exclusive_gear;
      }
      if (visibilityEnabled(settings, "heroes_gear", role) && hero.gear !== undefined) h.gear = hero.gear;
      return h;
    });
  }

  if (source.ranks && typeof source.ranks === "object") {
    const ranks = {};
    if (visibilityEnabled(settings, "ranks_core", role)) for (const key of ["power","power_rank","kills","kills_rank","town_center_level","town_center_rank","migrant_score","migrant_rank","mystic_trial","mystic_rank"]) if (source.ranks[key] !== undefined) ranks[key] = source.ranks[key];
    if (visibilityEnabled(settings, "ranks_leaderboards", role) && source.ranks.leaderboards !== undefined) ranks.leaderboards = source.ranks.leaderboards;
    if (Object.keys(ranks).length) visible.ranks = ranks;
  }

  if (source.gov_gear && typeof source.gov_gear === "object") {
    const gear = {};
    if (visibilityEnabled(settings, "gov_gear_list", role)) for (const key of ["hidden","message","items"]) if (source.gov_gear[key] !== undefined) gear[key] = source.gov_gear[key];
    if (visibilityEnabled(settings, "gov_gear_gems", role) && Array.isArray(gear.items)) gear.items = gear.items.map(item => ({ ...item, gems: item.gems || [] }));
    if (Object.keys(gear).length) visible.gov_gear = gear;
  }

  return visible;
}

const WATCHLIST_RANKING_LIMIT = 100;
const WATCHLIST_PLAYER_BATCH = 8;

function normalizeMightPulseTimestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  }
  const text = String(value).trim();
  if (!text) return null;
  if (/^\\d+(?:\\.\\d+)?$/.test(text)) {
    const n = Number(text);
    return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}

function getMightPulseSourceTimestamp(data) {
  return normalizeMightPulseTimestamp(data?.cached_at);
}

let kingdomWatchlistSchemaPromise = null;

async function ensureKingdomWatchlistFreshnessSchema(db) {
  if (!db) return;
  if (kingdomWatchlistSchemaPromise) return kingdomWatchlistSchemaPromise;
  kingdomWatchlistSchemaPromise = (async () => {
    // Stable tables/indexes are provisioned by D1 migrations.
    // Keep only additive compatibility checks for legacy databases.
  const definitions = {
    kingdom_watchlist_jobs: [
      ["source_first_at", "INTEGER"],
      ["source_last_at", "INTEGER"]
    ],
    api_observations: [["source_observed_at", "INTEGER"]],
    ranking_snapshots: [["source_observed_at", "INTEGER"]],
    player_snapshots: [["source_observed_at", "INTEGER"]],
    players: [["source_observed_at", "INTEGER"]],
    player_rank_snapshots: [["source_observed_at", "INTEGER"]],
    kingdom_ranking_current: [["previous_rank", "INTEGER"]]
  };
  for (const [table, columns] of Object.entries(definitions)) {
    const info = await db.prepare("PRAGMA table_info(" + table + ")").all();
    const existing = new Set((info.results || []).map(row => row.name));
    for (const [column, type] of columns) {
      if (!existing.has(column)) {
        await db.prepare("ALTER TABLE " + table + " ADD COLUMN " + column + " " + type).run();
      }
    }
  }
  })();
  try {
    return await kingdomWatchlistSchemaPromise;
  } catch (error) {
    kingdomWatchlistSchemaPromise = null;
    throw error;
  }
}

const KINGDOM_WATCHLIST_JOB_RETENTION_SECONDS = 24 * 60 * 60;
const KINGDOM_WATCHLIST_JOB_CLEANUP_BATCH = 100;

async function runKingdomWatchlistJobs(env) {
  if (!env.DB) return;
  await ensureKingdomWatchlistFreshnessSchema(env.DB);
  const now = Math.floor(Date.now() / 1000);

  // Job rows are runtime state, not durable ranking history. Keep completed,
  // failed, and user-cancelled rows only long enough for troubleshooting/UI
  // visibility, then remove them in a bounded batch. Run this at the first
  // 5-minute Cron tick after each hour boundary so cleanup adds at most one
  // lightweight D1 statement per hour instead of every Cron invocation.
  const hourBucket = Math.floor(now / 3600);
  const previousHourBucket = Math.floor((now - 300) / 3600);
  if (hourBucket !== previousHourBucket) {
    const cleanupBefore = now - KINGDOM_WATCHLIST_JOB_RETENTION_SECONDS;
    await env.DB.prepare(
      "DELETE FROM kingdom_watchlist_jobs WHERE status IN ('COMPLETED','FAILED') AND updated_at < ? LIMIT ?"
    ).bind(cleanupBefore, KINGDOM_WATCHLIST_JOB_CLEANUP_BATCH).run();
  }
  const rows = await env.DB.prepare(
    "SELECT watchlist_id, kid, top_n, interval_hours, last_run_at FROM kingdom_watchlists WHERE enabled = 1 ORDER BY created_at ASC"
  ).all();

  // Read all active jobs once. This replaces one D1 SELECT per not-due watchlist.
  const activeJobRows = await env.DB.prepare(
    "SELECT watchlist_id FROM kingdom_watchlist_jobs WHERE status IN ('RANKINGS','PLAYERS')"
  ).all();
  const activeWatchlistIds = new Set((activeJobRows.results || []).map(item => String(item.watchlist_id)));

  // Safety is evaluated once per cron invocation, not once per watchlist.
  // This keeps the background control path from multiplying D1/API monitoring
  // reads when many kingdoms are registered.
  let watchlistSafety = null;
  try {
    const poolBudget = await getApiPoolBudgetSnapshot(env.DB, {
      provider: "MIGHTPULSE",
      poolTypes: ["SYSTEM_WATCHLIST", "SYSTEM_GENERAL", "USER_CONTRIBUTED"]
    });
    const availablePoolKeys = Number(poolBudget?.availableKeys || 0);
    let cloudflare = null;
    try {
      cloudflare = await getCloudflareD1Usage(env, { includeQueryInsights: false });
    } catch {
      cloudflare = null;
    }
    watchlistSafety = evaluateSafetyGate({
      operation: "KINGDOM_WATCHLIST",
      priority: SAFETY_PRIORITIES.WATCHLIST,
      plannedRequests: 26 + Math.max(5, Math.min(10, Number(row?.top_n || 10))),
      availablePoolKeys,
      reservedKeys: 0,
      cloudflare,
      apiRemainingMinute: poolBudget?.remainingMinute,
      apiRemainingDay: poolBudget?.remainingDay,
      apiMinRemainingMinute: poolBudget?.minRemainingMinute,
      apiMinRemainingDay: poolBudget?.minRemainingDay,
      apiReserveMinute: poolBudget?.measuredReserveMinute,
      apiReserveDay: poolBudget?.measuredReserveDay,
      force: false
    });
    if (!watchlistSafety.allowed) {
      await recordSystemEvent(env.DB, {
        traceId: systemTraceId("watchlist-safety"),
        eventType: "BLOCKED",
        service: "watchlist",
        feature: "kingdom_watchlist",
        operation: "SAFETY_GATE",
        status: "PAUSED",
        errorCode: watchlistSafety.blockedBy || "SAFETY_GATE_BLOCKED",
        message: "王国ウォッチリストの新規実行をSafety Gateが停止しました。",
        metadata: {
          state: watchlistSafety.state,
          reasons: watchlistSafety.reasons,
          resumeCondition: watchlistSafety.resumeCondition,
          availablePoolKeys: watchlistSafety.availablePoolKeys
        }
      }).catch(() => {});
    }
  } catch (error) {
    watchlistSafety = {
      allowed: false,
      state: "CAUTION",
      blockedBy: "SAFETY_GATE_EVALUATION_FAILED",
      reasons: ["SAFETY_GATE_EVALUATION_FAILED"],
      resumeCondition: "安全状態の再評価後に再開"
    };
    await recordSystemEvent(env.DB, {
      traceId: systemTraceId("watchlist-safety"),
      eventType: "ERROR",
      service: "watchlist",
      feature: "kingdom_watchlist",
      operation: "SAFETY_GATE",
      status: "WARNING",
      errorCode: "SAFETY_GATE_EVALUATION_FAILED",
      message: String(error?.message || error).slice(0, 1000)
    }).catch(() => {});
  }

  for (const row of rows.results || []) {
    const due = !row.last_run_at || now - Number(row.last_run_at) >= Number(row.interval_hours) * 3600;
    // Do not write a lock for an idle watchlist that is not due.
    if (!due && !activeWatchlistIds.has(String(row.watchlist_id))) continue;
    // Active jobs are allowed to continue; Safety Gate only blocks creation
    // of new background work. This avoids abandoning a resumable job halfway.
    if (!activeWatchlistIds.has(String(row.watchlist_id)) && watchlistSafety && !watchlistSafety.allowed) {
      continue;
    }
    const lockToken = await acquireKingdomWatchlistLock(env, row.watchlist_id);
    if (!lockToken) continue;

    try {
      const active = await env.DB.prepare(
        "SELECT * FROM kingdom_watchlist_jobs WHERE watchlist_id = ? AND status IN ('RANKINGS','PLAYERS') ORDER BY created_at DESC LIMIT 1"
      ).bind(row.watchlist_id).first();
      if (!active && !due) continue;

      let job = active;
      if (!job) {
        const jobId = crypto.randomUUID();
        await env.DB.prepare(
          "INSERT INTO kingdom_watchlist_jobs (job_id, watchlist_id, kid, top_n, status, board_index, player_cursor, player_ids_json, observed_at, source_first_at, source_last_at, ranking_rows, player_rows, created_at, updated_at) VALUES (?, ?, ?, ?, 'RANKINGS', 0, 0, '[]', ?, NULL, NULL, 0, 0, ?, ?)"
        ).bind(jobId, row.watchlist_id, Number(row.kid), Number(row.top_n), now, now, now).run();
        job = {
          job_id: jobId,
          watchlist_id: row.watchlist_id,
          kid: Number(row.kid),
          top_n: Number(row.top_n),
          status: "RANKINGS",
          board_index: 0,
          player_cursor: 0,
          player_ids_json: "[]",
          observed_at: now,
          source_first_at: null,
          source_last_at: null,
          ranking_rows: 0,
          player_rows: 0,
          created_at: now,
          updated_at: now
        };
      }

      try {
        await recordSystemEvent(env.DB, { traceId: job.job_id, eventType:"START", service:"watchlist", feature:"kingdom_watchlist", operation:"WATCHLIST_JOB", status:"STARTED", targetType:"KINGDOM", targetId:String(row.kid), metadata:{ watchlistId:row.watchlist_id, jobId:job.job_id, status:job.status } });
        const result = await processKingdomWatchlistJob(env, job);
        if (result.completed) {
          await recordSystemEvent(env.DB, { traceId: job.job_id, eventType:"COMPLETE", service:"watchlist", feature:"kingdom_watchlist", operation:"WATCHLIST_JOB", status:"SUCCESS", targetType:"KINGDOM", targetId:String(row.kid), message:"王国ウォッチリスト更新完了", metadata:{ watchlistId:row.watchlist_id, jobId:job.job_id, rankingRows:Number(result.rankingRows||0), playerRows:Number(result.playerRows||0) } });
          await recordDiagnostic(env.DB, {
            service: "watchlist", feature: "kingdom_watchlist", operation: "RUN",
            status: "SUCCESS", targetType: "KINGDOM", targetId: row.kid,
            message: "王国ウォッチリスト更新完了",
            rowsReceived: Number(result.rankingRows || 0), rowsSaved: Number(result.rankingRows || 0),
            metadata: { watchlistId: row.watchlist_id, playerRows: Number(result.playerRows || 0) }
          });
          await env.DB.prepare(
            "UPDATE kingdom_watchlists SET last_run_at = ?, last_success_at = ?, last_error = NULL, updated_at = ? WHERE watchlist_id = ?"
          ).bind(now, now, now, row.watchlist_id).run();
        }
        console.log("kingdom_watchlist_job_progress", row.watchlist_id, result);
      } catch (error) {
        await env.DB.prepare(
          "UPDATE kingdom_watchlist_jobs SET status = 'FAILED', last_error = ?, updated_at = ? WHERE job_id = ?"
        ).bind(String(error?.message || error).slice(0, 1000), now, job.job_id).run();
        // Record the failed attempt time as well. Otherwise a failed watchlist
        // keeps its old last_run_at and is retried on every 5-minute Cron tick,
        // bypassing the user's configured interval and consuming API/D1 resources.
        await env.DB.prepare(
          "UPDATE kingdom_watchlists SET last_run_at = ?, last_error = ?, updated_at = ? WHERE watchlist_id = ?"
        ).bind(now, String(error?.message || error).slice(0, 1000), now, row.watchlist_id).run();
        await recordSystemEvent(env.DB, { traceId: job.job_id, eventType:"ERROR", service:"watchlist", feature:"kingdom_watchlist", operation:"WATCHLIST_JOB", status:"FAILED", targetType:"KINGDOM", targetId:String(row.kid), errorCode:String(error?.message||"WATCHLIST_JOB_FAILED").split(":")[0], message:String(error?.message||error).slice(0,2000), metadata:{ watchlistId:row.watchlist_id, jobId:job.job_id } });
        await recordDiagnostic(env.DB, {
          service: "watchlist", feature: "kingdom_watchlist", operation: "RUN",
          status: "FAILED", errorCode: String(error?.message || "WATCHLIST_JOB_FAILED").split(":")[0],
          message: String(error?.message || error).slice(0, 2000),
          targetType: "KINGDOM", targetId: row.kid,
          metadata: { watchlistId: row.watchlist_id, jobId: job.job_id }
        });
        console.error("kingdom_watchlist_job_failed", row.watchlist_id, error?.message || error);
      }
      break;
    } finally {
      await releaseKingdomWatchlistLock(env, row.watchlist_id, lockToken);
    }
  }
}

async function processKingdomWatchlistJob(env, job, options = {}) {
  const now = Math.floor(Date.now() / 1000);
  const reserveApiKeys = Math.max(0, Number(options?.reserveApiKeys) || 0);
  const apiLimiter = options?.apiLimiter || null;
  const globalCollectionLimiter = options?.globalCollectionLimiter || createCollectionSemaphoreLimiter(env.DB, WATCHLIST_MAX_API_CONCURRENCY);

  if (job.status === "RANKINGS") {
    const startIndex = Number(job.board_index || 0);
    const concurrency = apiLimiter ? WATCHLIST_MAX_API_CONCURRENCY : await getWatchlistApiConcurrency(env, { reserveApiKeys });
    if (concurrency < 1) {
      const error = new Error("API_POOL_LOAD_TEST_CAPACITY_WAIT");
      error.code = "API_POOL_LOAD_TEST_CAPACITY_WAIT";
      throw error;
    }
    const endIndex = Math.min(startIndex + concurrency, KINGDOM_RANKING_BOARDS.length);
    const boards = KINGDOM_RANKING_BOARDS.slice(startIndex, endIndex);
    let rankingRows = Number(job.ranking_rows || 0);

    // Fetch multiple ranking boards concurrently. The API Pool lease system
    // assigns different available keys to concurrent requests and prevents an
    // actively leased key from being reused until its request is released.
    const fetchedBoards = await fetchWithConcurrency(boards, concurrency, async board => {
      const traceId = diagnosticTraceId("ranking");
      const startedAtMs = Date.now();
      try {
        const requestLimiter = apiLimiter;
        if (apiLimiter) apiLimiter.globalLimiter = globalCollectionLimiter;
        const fetched = await fetchWithLoadTestApiLimiter(requestLimiter, () => fetchKingdomRankingThroughApiPool(
          env, job.kid, board, WATCHLIST_RANKING_LIMIT, "KINGDOM_WATCHLIST_RANKING",
          { useGlobalSemaphore: !apiLimiter, globalLimiter: globalCollectionLimiter }
        ));
        return { board, traceId, startedAtMs, fetched };
      } catch (error) {
        error.rankingBoard = board;
        error.rankingTraceId = traceId;
        error.rankingStartedAtMs = startedAtMs;
        throw error;
      }
    });

    // Persist each completed board in deterministic board order so ranking
    // snapshots/change events remain consistent while API requests run in parallel.
    for (const item of fetchedBoards) {
      const { board, traceId, startedAtMs, fetched } = item;
      const payload = fetched.result?.data;
      const sourceObservedAt = getMightPulseSourceTimestamp(payload);
      const extractedEntries = extractKingdomRankingEntries(payload);
      // Never trust the upstream response to honor ?limit=100. Persist at most
      // the configured watchlist limit, otherwise one oversized response can
      // multiply D1 snapshot/index writes by an uncontrolled factor.
      const entries = extractedEntries.slice(0, WATCHLIST_RANKING_LIMIT);
      const payloadKeys = payload && typeof payload === "object" && !Array.isArray(payload)
        ? Object.keys(payload).slice(0, 30) : [];

      const rankingPayloadShape = describeRankingPayloadShape(payload);

      const upstreamStatus = Number(fetched.result?.status ?? 200);
      if (!entries.length) {
        if (upstreamStatus >= 200 && upstreamStatus < 300) {
          // A successful 2xx ranking response with no entries can be a normal
          // kingdom-state condition: some rankings are unavailable until the
          // corresponding game content is unlocked. Do not fail the whole
          // watchlist job or erase previously stored current data in that case.
          // Keep a diagnostic warning so a genuinely unexpected empty response
          // remains visible for investigation.
          await recordDiagnostic(env.DB, {
            traceId, service: "ranking", feature: "kingdom_watchlist",
            operation: "FETCH_PARSE", status: "WARNING",
            errorCode: "RANKING_ENTRIES_EMPTY_SKIPPED",
            message: "ランキング配列が空のため、このランキングをスキップして次へ進みます。未解放コンテンツの可能性があります。",
            provider: "MIGHTPULSE", targetType: "KINGDOM", targetId: job.kid,
            startedAt: Math.floor(startedAtMs / 1000), completedAt: Math.floor(Date.now() / 1000),
            elapsedMs: Date.now() - startedAtMs, sourceObservedAt,
            rowsReceived: 0, rowsSaved: 0,
            metadata: {
              board,
              skipped: true,
              reason: "EMPTY_RANKING_RESPONSE",
              upstreamStatus,
              payloadType: Array.isArray(payload) ? "array" : typeof payload,
              payloadKeys,
              rankingPayloadShape,
              poolType: fetched.pool_type
            }
          });
          continue;
        }
        throw new Error("RANKING_ENTRIES_EMPTY:" + board);
      }

      const rankingComparison = await getKingdomRankingChanges(env.DB, {
        kid: job.kid,
        board,
        entries,
        observedAt: job.observed_at
      });
      const saved = await saveKingdomRankingBoard(env.DB, {
        kid: job.kid,
        board,
        entries: rankingComparison.changedEntries,
        removedTargets: rankingComparison.removedTargets,
        entriesAlreadyFiltered: true,
        observedAt: job.observed_at,
        sourceObservedAt,
        checkedAt: Math.floor(Date.now() / 1000),
        archiveBucket: env.ARCHIVE,
        historyMode: env.HISTORY_STORAGE_MODE
      });
      rankingRows += saved;
      await recordDiagnostic(env.DB, {
        traceId, service: "ranking", feature: "kingdom_watchlist",
        operation: "FETCH_COMPARE_SAVE", status: sourceObservedAt ? "SUCCESS" : "WARNING",
        errorCode: sourceObservedAt ? null : "SOURCE_TIME_UNAVAILABLE",
        message: sourceObservedAt ? "ランキング取得・比較・保存成功" : "ランキング取得・比較・保存は成功しましたがMightPulse基準時刻を取得できませんでした。",
        provider: "MIGHTPULSE", targetType: "KINGDOM", targetId: job.kid,
        startedAt: Math.floor(startedAtMs / 1000), completedAt: Math.floor(Date.now() / 1000),
        elapsedMs: Date.now() - startedAtMs, sourceObservedAt,
        rowsReceived: entries.length, rowsSaved: saved,
        metadata: { board, payloadKeys, rankingPayloadShape, poolType: fetched.pool_type, changedRows: rankingComparison.changedEntries.length }
      });

      const rankingChanges = rankingComparison.rankingChanges;

      if (rankingChanges.length) {
        const changeStatements = rankingChanges.map(change => env.DB.prepare(
          "INSERT INTO change_events (event_id, target_type, target_id, change_type, field_name, old_value_json, new_value_json, observation_id, detected_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(
          crypto.randomUUID(), change.targetType, change.targetId, change.changeType, "rank",
          JSON.stringify(change.oldValue), JSON.stringify(change.newValue),
          change.sourceObservationId, change.observedAt, now
        ));
        for (let offset = 0; offset < changeStatements.length; offset += 50) {
          await env.DB.batch(changeStatements.slice(offset, offset + 50));
        }
      }

      // Progress is persisted once after the whole concurrent batch, not once per board.
    }

    const batchSourceTimes = fetchedBoards
      .map(item => getMightPulseSourceTimestamp(item.fetched.result?.data))
      .filter(value => Number.isFinite(Number(value)) && Number(value) > 0)
      .map(value => Number(value));
    const batchSourceFirstAt = batchSourceTimes.length ? Math.min(...batchSourceTimes) : null;
    const batchSourceLastAt = batchSourceTimes.length ? Math.max(...batchSourceTimes) : null;
    await env.DB.prepare(
      "UPDATE kingdom_watchlist_jobs SET board_index = ?, ranking_rows = ?, source_first_at = CASE WHEN ? IS NULL THEN source_first_at WHEN source_first_at IS NULL OR ? < source_first_at THEN ? ELSE source_first_at END, source_last_at = CASE WHEN ? IS NULL THEN source_last_at WHEN source_last_at IS NULL OR ? > source_last_at THEN ? ELSE source_last_at END, updated_at = ? WHERE job_id = ?"
    ).bind(
      endIndex,
      rankingRows,
      batchSourceFirstAt, batchSourceFirstAt, batchSourceFirstAt,
      batchSourceLastAt, batchSourceLastAt, batchSourceLastAt,
      Math.floor(Date.now() / 1000),
      job.job_id
    ).run();

    if (endIndex < KINGDOM_RANKING_BOARDS.length) {
      return { completed: false, phase: "RANKINGS", board_index: endIndex, rankingRows, concurrency };
    }

    const playerRows = await env.DB.prepare(
      "SELECT governor_id FROM kingdom_ranking_current " +
      "WHERE kid = ? AND board = 'personal_power' AND target_type = 'PLAYER' AND governor_id IS NOT NULL " +
      "AND rank <= ? ORDER BY rank ASC, governor_id"
    ).bind(Number(job.kid), Number(job.top_n)).all();
    const playerIds = (playerRows.results || []).map(row => String(row.governor_id));

    await env.DB.prepare(
      "UPDATE kingdom_watchlist_jobs SET status = 'PLAYERS', board_index = ?, player_cursor = 0, player_ids_json = ?, ranking_rows = ?, updated_at = ? WHERE job_id = ?"
    ).bind(KINGDOM_RANKING_BOARDS.length, JSON.stringify(playerIds), rankingRows, Math.floor(Date.now() / 1000), job.job_id).run();

    return { completed: false, phase: "PLAYERS", playerCount: playerIds.length, rankingRows, concurrency };
  }

  if (job.status === "PLAYERS") {
    let ids = [];
    try { ids = JSON.parse(job.player_ids_json || "[]"); } catch {}
    if (!Array.isArray(ids)) ids = [];

    const cursor = Number(job.player_cursor || 0);
    const batchIds = ids.slice(cursor, cursor + WATCHLIST_PLAYER_BATCH);

    if (!batchIds.length) {
      await env.DB.prepare(
        "UPDATE kingdom_watchlist_jobs SET status = 'COMPLETED', completed_at = ?, updated_at = ? WHERE job_id = ?"
      ).bind(now, now, job.job_id).run();
      return { completed: true, phase: "COMPLETED", playerRows: Number(job.player_rows || 0) };
    }

    const concurrency = apiLimiter ? Math.min(WATCHLIST_MAX_API_CONCURRENCY, batchIds.length) : await getWatchlistApiConcurrency(env, { reserveApiKeys });
    if (concurrency < 1) {
      const error = new Error("API_POOL_LOAD_TEST_CAPACITY_WAIT");
      error.code = "API_POOL_LOAD_TEST_CAPACITY_WAIT";
      throw error;
    }
    const fetchedPlayers = await fetchWithConcurrency(batchIds, concurrency, async governorId => {
      try {
        return { governorId, fetched: await fetchWithLoadTestApiLimiter(apiLimiter, () => fetchPlayerDetailThroughApiPool(env, governorId, "KINGDOM_WATCHLIST_PLAYER", { useGlobalSemaphore: !apiLimiter, globalLimiter: globalCollectionLimiter })) };
      } catch (error) {
        await recordDiagnostic(env.DB, {
          service: "watchlist",
          feature: "kingdom_watchlist",
          operation: "PLAYER_FETCH",
          status: "FAILED",
          errorCode: String(error?.code || error?.message || "WATCHLIST_PLAYER_FETCH_FAILED").split(":")[0],
          message: String(error?.message || error).slice(0, 2000),
          provider: "MIGHTPULSE",
          targetType: "PLAYER",
          targetId: governorId
        });
        console.error("kingdom_watchlist_player_failed", governorId, error?.message || error);
        return { governorId, error };
      }
    });

    let playerRows = Number(job.player_rows || 0);
    let sourceFirstAt = null;
    let sourceLastAt = null;
    for (const item of fetchedPlayers) {
      if (item.error) continue;
      const result = item.fetched.result;
      const sourceObservedAt = getMightPulseSourceTimestamp(result?.data);
      if (Number.isFinite(Number(sourceObservedAt)) && Number(sourceObservedAt) > 0) {
        const ts = Number(sourceObservedAt);
        sourceFirstAt = sourceFirstAt == null ? ts : Math.min(sourceFirstAt, ts);
        sourceLastAt = sourceLastAt == null ? ts : Math.max(sourceLastAt, ts);
      }
      const raw = result?.data?.player || result?.data;
      if (!raw) continue;

      const observationId = crypto.randomUUID();
      const governorId = normalizeGovernorId(raw.governor_id ?? item.governorId);
      const ranks = result?.data?.ranks || raw?.ranks;
      await env.DB.prepare(
        "INSERT INTO api_observations (observation_id, provider, endpoint, target_type, target_id, observed_at, source_observed_at, http_status, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        observationId, "MIGHTPULSE", "/players/" + governorId + "?include=base,heroes,ranks,gov_gear",
        "PLAYER", governorId, job.observed_at, sourceObservedAt, result?.status ?? 200, JSON.stringify(raw), job.observed_at
      ).run();

      const observation = {
        observation_id: observationId,
        observed_at: job.observed_at,
        source_observed_at: sourceObservedAt,
        http_status: result?.status ?? 200,
        payload: {
          ...result?.data,
          player: raw,
          ranks
        }
      };
      const existingPlayer = await getPlayer(env.DB, governorId);
      await materializePlayer(
        env.DB,
        observation,
        existingPlayer,
        env.ARCHIVE,
        env.HISTORY_STORAGE_MODE
      );

      if (ranks && typeof ranks === "object") {
        await savePlayerRankSnapshot(env.DB, {
          governorId,
          uid: raw.uid ?? null,
          kid: raw.kid ?? job.kid,
          ranks,
          observedAt: job.observed_at,
          sourceObservedAt,
          sourceObservationId: observationId,
          archiveBucket: env.ARCHIVE,
          historyMode: env.HISTORY_STORAGE_MODE
        });
      }
      playerRows++;
    }

    const nextCursor = cursor + batchIds.length;
    const completed = nextCursor >= ids.length;
    await env.DB.prepare(
      "UPDATE kingdom_watchlist_jobs SET player_cursor = ?, player_rows = ?, status = ?, completed_at = ?, source_first_at = CASE WHEN ? IS NULL THEN source_first_at WHEN source_first_at IS NULL OR ? < source_first_at THEN ? ELSE source_first_at END, source_last_at = CASE WHEN ? IS NULL THEN source_last_at WHEN source_last_at IS NULL OR ? > source_last_at THEN ? ELSE source_last_at END, updated_at = ? WHERE job_id = ?"
    ).bind(
      nextCursor,
      playerRows,
      completed ? "COMPLETED" : "PLAYERS",
      completed ? now : null,
      sourceFirstAt, sourceFirstAt, sourceFirstAt,
      sourceLastAt, sourceLastAt, sourceLastAt,
      now,
      job.job_id
    ).run();

    return { completed, phase: completed ? "COMPLETED" : "PLAYERS", playerCursor: nextCursor, playerCount: ids.length, playerRows, concurrency };
  }

  return { completed: true, phase: job.status };
}

const WATCHLIST_MAX_API_CONCURRENCY = 26;

async function getWatchlistApiConcurrency(env, { reserveApiKeys = 0 } = {}) {
  const availability = await getApiPoolAvailability(env.DB, {
    provider: "MIGHTPULSE",
    poolTypes: ["SYSTEM_WATCHLIST", "SYSTEM_GENERAL", "USER_CONTRIBUTED"]
  });
  const available = Number(availability?.totals?.available || 0);
  const reserve = Math.max(0, Number(reserveApiKeys) || 0);
  const usable = Math.max(0, available - reserve);

  // Normal Watchlist processing keeps the historical minimum of one.
  // Load Test processing can explicitly reserve one key for normal users and
  // therefore returns zero when there is no safe capacity instead of violating
  // the reservation.
  if (reserve > 0) {
    return Math.min(WATCHLIST_MAX_API_CONCURRENCY, usable);
  }
  return Math.max(1, Math.min(WATCHLIST_MAX_API_CONCURRENCY, usable));
}

async function fetchWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runWorker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }
  const workers = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i++) workers.push(runWorker());
  await Promise.all(workers);
  return results;
}

async function fetchWithLoadTestApiLimiter(apiLimiter, worker) {
  if (!apiLimiter) return worker();
  const maxRetries = 20;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let release = null;
    let globalRelease = null;
    let poolWaitStartedAt = null;
    try {
      release = await apiLimiter.acquire();
      if (apiLimiter.globalLimiter) globalRelease = await apiLimiter.globalLimiter.acquire();
      return await worker();
    } catch (error) {
      const code = String(error?.code || error?.message || "");
      if (code !== "NO_API_POOL_KEY_AVAILABLE" && code !== "GLOBAL_COLLECTION_SEMAPHORE_FULL") throw error;
      if (attempt >= maxRetries) throw error;
      if (code === "NO_API_POOL_KEY_AVAILABLE") {
        poolWaitStartedAt = typeof apiLimiter.markPoolWaitStart === "function" ? apiLimiter.markPoolWaitStart() : null;
      }
    } finally {
      if (globalRelease) await Promise.resolve(globalRelease()).catch(() => {});
      if (release) await Promise.resolve(release()).catch(() => {});
    }
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
    } finally {
      if (poolWaitStartedAt !== null && typeof apiLimiter.markPoolWaitEnd === "function") {
        apiLimiter.markPoolWaitEnd(poolWaitStartedAt);
      }
    }
  }
  throw new Error("LOAD_TEST_API_RETRY_EXHAUSTED");
}

function describeRankingPayloadShape(payload) {
  const describe = (value, depth = 0) => {
    if (Array.isArray(value)) {
      return {
        type: "array",
        length: value.length,
        itemTypes: [...new Set(value.slice(0, 5).map(item => Array.isArray(item) ? "array" : item === null ? "null" : typeof item))],
        itemKeys: value.slice(0, 3).filter(item => item && typeof item === "object" && !Array.isArray(item))
          .map(item => Object.keys(item).slice(0, 30))
      };
    }
    if (!value || typeof value !== "object") {
      return { type: value === null ? "null" : typeof value, value: typeof value === "string" ? value.slice(0, 120) : value };
    }
    if (depth >= 2) return { type: "object", keys: Object.keys(value).slice(0, 30) };

    const out = { type: "object", keys: Object.keys(value).slice(0, 30) };
    for (const key of ["boards", "board", "rankings", "entries", "items", "results", "leaderboard", "data", "rows"]) {
      if (Object.prototype.hasOwnProperty.call(value, key)) out[key] = describe(value[key], depth + 1);
    }
    return out;
  };
  return describe(payload);
}

function extractKingdomRankingEntries(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  // MightPulse kingdom ranking responses currently expose the selected board
  // under `boards`. Older/other responses may use rankings/entries/items/etc.
  // Walk the known container keys recursively so a harmless response-shape
  // change does not silently turn a successful API call into zero rows.
  const preferredKeys = [
    "rankings", "entries", "items", "results", "leaderboard",
    "boards", "data"
  ];

  const visited = new Set();

  function looksLikeRankingEntry(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;

    // Board wrapper objects can contain generic fields such as name/rank/score,
    // but they are not rows. A real ranking row should carry an identity field
    // and/or a numeric score/value. This prevents board wrappers from being
    // mistaken for a single ranking entry.
    const identityKeys = [
      "governor_id", "governorId", "uid", "player_id",
      "alliance_id", "allianceId", "aid", "abbr", "alliance_abbr"
    ];
    const hasIdentity = identityKeys.some(key => Object.prototype.hasOwnProperty.call(item, key));
    const scoreValue = item.score ?? item.value;
    const hasNumericScore = scoreValue !== undefined && scoreValue !== null &&
      scoreValue !== "" && Number.isFinite(Number(scoreValue));
    const rankValue = item.rank ?? item.ranking ?? item.rank_no;
    const hasNumericRank = rankValue !== undefined && rankValue !== null &&
      rankValue !== "" && Number.isFinite(Number(rankValue));

    return (hasIdentity && (hasNumericRank || hasNumericScore)) ||
      (hasNumericRank && hasNumericScore);
  }

  function findEntries(value, depth = 0) {
    if (Array.isArray(value)) {
      if (!value.length) return [];
      if (value.some(looksLikeRankingEntry)) return value;

      // A `boards` array may contain wrapper objects such as
      // { board: "...", entries: [...] }. Descend into those wrappers
      // instead of mistaking the wrapper array itself for ranking rows.
      for (const item of value) {
        const found = findEntries(item, depth + 1);
        if (found.length) return found;
      }
      return [];
    }

    if (!value || typeof value !== "object" || depth > 5 || visited.has(value)) {
      return [];
    }
    visited.add(value);

    for (const key of preferredKeys) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      const found = findEntries(value[key], depth + 1);
      if (found.length) return found;
    }

    // `boards` can also be an object keyed by board name. Inspect object
    // values after the explicit container keys above.
    for (const [key, child] of Object.entries(value)) {
      if (preferredKeys.includes(key)) continue;
      if (!child || typeof child !== "object") continue;
      const found = findEntries(child, depth + 1);
      if (found.length) return found;
    }

    return [];
  }

  return findEntries(payload);
}

async function renderKingdomWatchlistPage(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") {
    return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><p>ログインが必要です。</p><a href="/api/auth/discord">Discordでログイン</a>`;
  }
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>王国ウォッチリスト｜EagleEye</title>
<style>
:root{
  color-scheme:dark;
  --bg:#0b1220;--bg-soft:#111a2c;--card:#162238;--card-strong:#1b2a43;
  --text:#f8fafc;--text-soft:#cbd5e1;--muted:#94a3b8;--border:#334155;
  --border-strong:#475569;--input:#0b1220;--accent:#f59e0b;--accent-strong:#fbbf24;
  --accent-text:#111827;--ok:#86efac;--ok-bg:#0f2a1c;--danger:#7f1d1d;--shadow:0 12px 30px rgba(0,0,0,.22);
}
:root[data-eagle-theme="light"]{
  color-scheme:light;
  --bg:#f3f6fb;--bg-soft:#eaf0f8;--card:#ffffff;--card-strong:#f8fafc;
  --text:#172033;--text-soft:#334155;--muted:#64748b;--border:#d6deea;
  --border-strong:#b8c5d6;--input:#f8fafc;--accent:#f59e0b;--accent-strong:#d97706;
  --accent-text:#172033;--ok:#15803d;--ok-bg:#ecfdf3;--danger:#b91c1c;--shadow:0 10px 24px rgba(15,23,42,.08);
}
*{box-sizing:border-box}
html{background:var(--bg)}
body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:1000px;margin:auto;padding:18px 14px 48px;background:var(--bg);color:var(--text);min-height:100vh;transition:background .2s,color .2s}
button,input,select{font:inherit}
.topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}
.back{color:var(--muted);text-decoration:none;font-weight:700}
.back:hover{color:var(--text)}
.topbar h1{font-size:clamp(25px,6vw,34px);margin:8px 0 0;letter-spacing:-.02em}
.theme-toggle{width:46px;height:42px;padding:0;border:1px solid var(--border);border-radius:12px;background:var(--card);color:var(--text);display:inline-flex;align-items:center;justify-content:center;font-size:20px;box-shadow:var(--shadow)}
.card{background:var(--card);border:1px solid var(--border);border-radius:18px;padding:18px;margin:14px 0;box-shadow:var(--shadow)}
.add-card{background:linear-gradient(135deg,var(--card),var(--card-strong))}
.card h2{margin:0 0 14px;font-size:20px}
.card p{margin:7px 0}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:end}
.form-field{display:grid;gap:7px;font-weight:800;font-size:13px;flex:1 1 150px}
input,select{width:100%;padding:12px 13px;border:1px solid var(--border-strong);border-radius:12px;background:var(--input);color:var(--text);outline:none}
input:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(245,158,11,.16)}
button{padding:12px 14px;border:0;border-radius:12px;background:var(--accent);color:var(--accent-text);font-weight:900;cursor:pointer;transition:transform .12s,filter .12s,opacity .12s}
button:hover{filter:brightness(1.04);transform:translateY(-1px)}
button:disabled{opacity:.58;cursor:not-allowed;transform:none}
.primary-action{min-width:145px}
.danger{background:var(--danger);color:#fff}
.muted{color:var(--muted)}
.error{color:#ef4444}
.ok{color:var(--ok)}
.status-line{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:13px;margin:8px 2px}
.status-dot{width:8px;height:8px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 4px color-mix(in srgb,var(--ok) 15%,transparent)}
.progress{margin:14px 0;padding:15px;border:1px solid var(--border-strong);border-radius:14px;background:var(--bg-soft);display:grid;gap:5px}
.progress b{font-size:14px}.progress span{font-size:23px;font-weight:950;color:var(--accent)}.progress small{color:var(--muted)}
.progress-track{height:7px;border-radius:999px;background:var(--border);overflow:hidden;margin-top:4px}
.progress-fill{height:100%;border-radius:999px;background:var(--accent);transition:width .2s}
.rank-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.rank{padding:14px;border:1px solid var(--border);border-radius:14px;background:var(--card-strong);min-width:0}
.rank-title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
.rank-title b{font-size:15px}
.rank-key{font-size:10px;color:var(--muted);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.rank-row{display:grid;grid-template-columns:28px minmax(0,1fr) auto auto;align-items:center;gap:8px;padding:8px 0;border-top:1px solid color-mix(in srgb,var(--border) 72%,transparent);font-size:13px}
.rank-row:first-of-type{border-top:0}
.rank-no{width:24px;height:24px;border-radius:8px;background:var(--bg-soft);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:var(--muted)}
.rank-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rank-score{font-weight:900;text-align:right;white-space:nowrap;color:var(--accent-strong)}
.section-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:22px 2px 10px}
.section-title h2{margin:0;font-size:19px}
.section-title span{font-size:11px;color:var(--muted)}
.player-card{padding:14px;border:1px solid var(--border);border-radius:14px;background:var(--card-strong)}
.player-card b{font-size:14px}.player-meta{margin-top:6px;color:var(--muted);font-size:12px;line-height:1.6}
@media(max-width:700px){.rank-grid{grid-template-columns:1fr}}
@media(max-width:520px){
  body{padding:14px 10px 36px}.card{padding:15px;border-radius:16px}
  .topbar h1{font-size:25px}.row>*{width:100%}.form-field{flex-basis:100%}
  .primary-action{width:100%}.rank-row{grid-template-columns:28px minmax(0,1fr) auto;}.rank-score{grid-column:2;text-align:left;margin-top:-4px}
}
</style></head><body>
<div class="topbar">
  <div><a class="back" href="/">← EagleEye</a><h1>王国ウォッチリスト</h1></div>
  <button id="themeToggle" class="theme-toggle" type="button" aria-label="テーマ切り替え" title="テーマ切り替え">🌙</button>
</div>
<div id="msg" class="status-line"><span class="status-dot"></span><span>読み込み中…</span></div>
<section class="card add-card"><h2>王国を監視対象に追加</h2><div class="row">
<label class="form-field">王国番号<input id="kid" type="number" min="1" placeholder="例: 1524"></label>
<label class="form-field">ランキング上位<select id="top"><option value="5">TOP 5</option><option value="10">TOP 10</option></select></label>
<label class="form-field">更新間隔<select id="interval"><option value="1">1時間</option><option value="3">3時間</option><option value="6">6時間</option><option value="12">12時間</option></select></label>
<button id="create" class="primary-action">監視を登録</button></div></section>
<div id="list"></div><div id="detail"></div>
<script>
(function(){
  function el(id){return document.getElementById(id);}
  function esc(v){return String(v == null ? "" : v).replace(/[&<>"]/g,function(m){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m];});}
  var RANKING_BOARD_LABELS = {
    alliance_power:"同盟総力", alliance_kills:"同盟撃破", personal_power:"個人総力", kills:"個人撃破",
    town_center:"役場Lv.", rebel_conquest:"反乱軍討伐ステージ", single_hero:"英雄総力", hero_total:"英雄全体総力",
    troop_power:"部隊総力", building_power:"建物総力", research_power:"研究総力", hero_no_equip:"英雄総力（装備除外）",
    hero_equip:"英雄総力（装備込み）", gov_gear:"領主装備", gov_charm:"領主宝石", pet_power:"ペット総合実力",
    island_prosperity:"島の繁栄度", migrant_score:"移民スコア", mystic_trial:"秘境の試練", coliseum:"闘技場",
    forest_of_life:"生命の森", crystal_cave:"水晶鉱山", knowledge_nexus:"知識の枢軸", molten_fort:"溶岩要塞",
    radiant_spire:"輝光の塔", master_power:"マスター全体総力"
  };
  function formatCompactNumber(value){
    if(value===null||value===undefined||value==="")return "-";
    var n=Number(value);
    if(!Number.isFinite(n))return String(value);
    var abs=Math.abs(n);
    if(abs>=1e9)return formatCompactUnit(n,1e9,"B");
    if(abs>=1e6)return formatCompactUnit(n,1e6,"M");
    if(abs>=1e3)return formatCompactUnit(n,1e3,"K");
    return n.toLocaleString("ja-JP");
  }
  function formatCompactUnit(value,divisor,suffix){
    var scaled=value/divisor;
    var decimals=Math.abs(scaled)>=100?0:Math.abs(scaled)>=10?1:2;
    return scaled.toFixed(decimals).replace(/\\.?0+$|\\.$/,"")+suffix;
  }
  function api(url,options){return fetch(url,options).then(function(r){return r.text().then(function(t){var d;try{d=JSON.parse(t);}catch(e){throw new Error("API応答エラー（HTTP "+r.status+"）");}if(!r.ok||d.ok===false)throw new Error(d.message||d.error||("HTTP "+r.status));return d;});});}
  var running={};
  function isActiveJob(w){
    return w.job && (w.job.status==="RANKINGS" || w.job.status==="PLAYERS");
  }
  var watchlistIdForProgress="";
  function jobProgressHtml(w){
    watchlistIdForProgress=w.watchlist_id;
    var j=w.job;
    if(!j)return "";
    if(j.status==="COMPLETED"){
      var sourceText="";
      if(j.source_first_at&&j.source_last_at){
        var first=new Date(j.source_first_at*1000).toLocaleString("ja-JP");
        var last=new Date(j.source_last_at*1000).toLocaleString("ja-JP");
        sourceText=first===last?first:(first+" ～ "+last);
      }
      var elapsedText="";
      var elapsedKey="eagleeye_watchlist_elapsed_ms_"+String(watchlistIdForProgress||"");
      try{
        var savedElapsed=sessionStorage.getItem(elapsedKey);
        if(savedElapsed&&Number.isFinite(Number(savedElapsed))) elapsedText="<small>今回の更新: "+(Number(savedElapsed)/1000).toFixed(1)+"秒</small>";
      }catch(e){}
      return "<div class='progress ok'><b>✓ 更新完了</b><span>"+(j.completed_at?new Date(j.completed_at*1000).toLocaleString("ja-JP"):"")+"</span>"+(sourceText?"<small>MightPulseデータ基準時刻: "+esc(sourceText)+"</small>":"<small>MightPulseデータ基準時刻: 未取得</small>")+elapsedText+"</div>";
    }
    if(j.status==="RANKINGS"){
      var pct=j.total_boards ? Math.min(100,Math.round((Number(j.board_index)||0)/Number(j.total_boards)*100)) : 0;
      return "<div class='progress'><b>更新中：ランキング</b><span>"+esc(j.board_index)+" / "+esc(j.total_boards)+"</span><div class='progress-track'><div class='progress-fill' style='width:"+pct+"%'></div></div><small>ランキング取得 "+esc(j.ranking_rows)+"件</small></div>";
    }
    if(j.status==="PLAYERS"){
      var count=j.player_count==null?"?":j.player_count;
      var playerPct=count && count!=="?" ? Math.min(100,Math.round((Number(j.player_cursor)||0)/Number(count)*100)) : 0;
      return "<div class='progress'><b>更新中：プレイヤー</b><span>"+esc(j.player_cursor)+" / "+esc(count)+"</span><div class='progress-track'><div class='progress-fill' style='width:"+playerPct+"%'></div></div><small>プレイヤーデータ取得 "+esc(j.player_rows)+"件</small></div>";
    }
    if(j.status==="FAILED"){
      var failedPhase=(Number(j.board_index||0)<Number(j.total_boards||0))?"ランキング":"プレイヤー";
      var failedPct=j.total_boards ? Math.min(100,Math.round((Number(j.board_index)||0)/Number(j.total_boards)*100)) : 0;
      return "<div class='progress'><b>更新停止："+failedPhase+"</b><span>"+esc(j.board_index)+" / "+esc(j.total_boards)+"</span><div class='progress-track'><div class='progress-fill' style='width:"+failedPct+"%'></div></div><small>取得済みランキング "+esc(j.ranking_rows)+"件 / ジョブ停止</small></div>";
    }
    return "";
  }
  function load(){
    return api("/api/kingdom-watchlist").then(function(d){
      el("list").innerHTML="";
      var ws=d.watchlists||[];
      ws.forEach(function(w){
        var active=isActiveJob(w);
        if(!active){
          sessionStorage.removeItem("eagleeye_watchlist_running_"+w.watchlist_id);
          running[w.watchlist_id]=false;
        }
        var card=document.createElement("div"); card.className="card"; card.dataset.watchlistId=w.watchlist_id;
        var errorHtml=(!active&&w.last_error)?"<p class='error'>エラー: "+esc(w.last_error)+"</p>":"";
        var lastSuccessText=w.last_success_at?new Date(w.last_success_at*1000).toLocaleString("ja-JP"):"未実行";
        var completionText=active?(w.last_success_at?lastSuccessText+"（現在更新中）":"更新中…"):lastSuccessText;
        card.innerHTML="<h2>王国 "+esc(w.kid)+"</h2><p>上位"+esc(w.top_n)+"人 <span class='muted'>/</span> "+esc(w.interval_hours)+"時間ごと <span class='muted'>/</span> "+(w.enabled?"<span class='ok'>稼働中</span>":"停止中")+"</p><p class='muted'>🕐 最終チェック: "+esc(completionText)+"</p><p class='ok'>✓ 最新チェック済み</p>"+jobProgressHtml(w)+errorHtml;
        var row=document.createElement("div"); row.className="row";
        var refresh=document.createElement("button"); refresh.textContent=active?"更新を中断":"今すぐ更新"; refresh.disabled=false; refresh.onclick=function(){active?cancelWatch(w.watchlist_id):refreshWatch(w.watchlist_id);}; if(active)refresh.className="danger";
        var view=document.createElement("button"); view.textContent="ランキングを見る"; view.disabled=active; view.onclick=function(){showData(w.watchlist_id);};
        var toggle=document.createElement("button"); toggle.textContent=w.enabled?"停止":"再開"; toggle.disabled=active; toggle.onclick=function(){toggleWatch(w.watchlist_id,!w.enabled);};
        var del=document.createElement("button"); del.textContent="削除"; del.className="danger"; del.disabled=active; del.onclick=function(){deleteWatch(w.watchlist_id);};
        row.appendChild(refresh);row.appendChild(view);row.appendChild(toggle);row.appendChild(del);card.appendChild(row);el("list").appendChild(card);

        if(active && sessionStorage.getItem("eagleeye_watchlist_running_"+w.watchlist_id)==="1" && !running[w.watchlist_id]){
          continueWatch(w.watchlist_id);
        }
      });
      el("msg").innerHTML="<span class='ok'>監視対象 "+ws.length+"件</span>";
    }).catch(function(e){el("msg").innerHTML="<span class='error'>読み込み失敗: "+esc(e.message)+"</span>";});
  }
  function continueWatch(id){
    if(running[id])return;
    running[id]=true;
    function step(){
      var finished=false;
      var pollTimer=null;
      function poll(){
        return load().then(function(){
          if(!finished) pollTimer=setTimeout(poll,4000);
        }).catch(function(){
          if(!finished) pollTimer=setTimeout(poll,2000);
        });
      }
      poll();
      return api("/api/kingdom-watchlist?action=refresh",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({watchlist_id:id})})
        .then(function(d){
          finished=true;
          if(pollTimer)clearTimeout(pollTimer);
          if(d.result && d.result.completed){
            var elapsedMs=null;
            try{
              var startedAt=Number(sessionStorage.getItem("eagleeye_watchlist_started_at_"+id));
              if(Number.isFinite(startedAt)&&startedAt>0){
                elapsedMs=Math.max(0,Date.now()-startedAt);
                sessionStorage.setItem("eagleeye_watchlist_elapsed_ms_"+id,String(elapsedMs));
                sessionStorage.removeItem("eagleeye_watchlist_started_at_"+id);
              }
            }catch(e){}
            sessionStorage.removeItem("eagleeye_watchlist_running_"+id);
            el("msg").innerHTML="<span class='ok'>更新が完了しました。"+(elapsedMs!==null?" 所要時間: "+(elapsedMs/1000).toFixed(1)+"秒":"")+"</span>";
            return load();
          }
          return load().then(function(){ return new Promise(function(resolve){setTimeout(resolve,500);}); }).then(step);
        })
        .catch(function(e){
          finished=true;
          if(pollTimer)clearTimeout(pollTimer);
          running[id]=false;
          setWatchCardBusy(id,false);
          if(e.message==="WATCHLIST_REFRESH_IN_PROGRESS" || e.message.indexOf("現在更新中です")>=0){
            return load();
          }
          sessionStorage.removeItem("eagleeye_watchlist_running_"+id);
          el("msg").innerHTML="<span class='error'>更新失敗: "+esc(e.message)+"</span>";
          return load();
        });
    }
    return step().finally(function(){if(!sessionStorage.getItem("eagleeye_watchlist_running_"+id))running[id]=false;});
  }
  function setWatchCardBusy(id,busy){
    var card=document.querySelector("[data-watchlist-id='"+CSS.escape(String(id))+"']");
    if(!card)return;
    Array.prototype.forEach.call(card.querySelectorAll("button"),function(btn){btn.disabled=busy;});
    var refresh=card.querySelector("button");
    if(refresh)refresh.textContent=busy?"更新中…":"今すぐ更新";
  }
  function refreshWatch(id){
    if(running[id])return;
    try{
      sessionStorage.setItem("eagleeye_watchlist_started_at_"+id,String(Date.now()));
      sessionStorage.removeItem("eagleeye_watchlist_elapsed_ms_"+id);
    }catch(e){}
    sessionStorage.setItem("eagleeye_watchlist_running_"+id,"1");
    setWatchCardBusy(id,true);
    el("msg").innerHTML="<span class='ok'>更新を開始しました。</span>";
    return continueWatch(id);
  }
  function cancelWatch(id){
    if(!confirm("現在実行中の更新を中断しますか？"))return;
    return api("/api/kingdom-watchlist?action=cancel",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({watchlist_id:id})})
      .then(function(d){
        try{
          sessionStorage.removeItem("eagleeye_watchlist_running_"+id);
          sessionStorage.removeItem("eagleeye_watchlist_started_at_"+id);
        }catch(e){}
        running[id]=false;
        el("msg").innerHTML="<span class='ok'>更新を中断しました。現在処理中の1回分が完了後、次の更新には進みません。</span>";
        return load();
      })
      .catch(function(e){
        el("msg").innerHTML="<span class='error'>更新の中断に失敗: "+esc(e.message)+"</span>";
        return load();
      });
  }
  function toggleWatch(id,enabled){
    return api("/api/kingdom-watchlist?action=toggle",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({watchlist_id:id,enabled:enabled})}).then(load).catch(function(e){alert(e.message);});
  }
  function deleteWatch(id){
    if(!confirm("この監視対象を削除しますか？"))return;
    return api("/api/kingdom-watchlist?watchlist_id="+encodeURIComponent(id),{method:"DELETE"}).then(function(){el("detail").innerHTML="";return load();}).catch(function(e){alert(e.message);});
  }
  function togglePlayerWatch(button){
    var governorId=button.getAttribute('data-governor-id');
    var watched=button.getAttribute('data-watched')==='1';
    if(!governorId)return;
    button.disabled=true;
    var request=watched
      ? api("/api/player-watchlist?governor_id="+encodeURIComponent(governorId),{method:"DELETE"})
      : api("/api/player-watchlist",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({governor_id:governorId})});
    request.then(function(){
      var next=!watched;
      button.setAttribute('data-watched',next?'1':'0');
      button.textContent=next?'★':'☆';
      button.title=next?'プレイヤーウォッチリスト登録済み':'プレイヤーウォッチリストに登録';
      button.setAttribute('aria-label',button.title);
    }).catch(function(e){alert(e.message||'ウォッチリスト更新に失敗しました。');})
      .finally(function(){button.disabled=false;});
  }
  window.togglePlayerWatch = togglePlayerWatch;
  if(!document.getElementById("eagleeye-watchlist-player-link-style")){var st=document.createElement("style");st.id="eagleeye-watchlist-player-link-style";st.textContent=".rank-player-link{color:inherit;text-decoration:none;cursor:pointer}.rank-player-link:hover,.rank-player-link:active{text-decoration:underline}.rank-watch-star{margin-left:6px;padding:0 3px;border:0;background:transparent;color:#fbbf24;font-size:16px;line-height:1;cursor:pointer}.rank-watch-star:disabled{opacity:.5}";document.head.appendChild(st);}
  function showData(id){
    el("detail").innerHTML='<div class="card">ランキングデータを読み込み中…</div>';
    api("/api/kingdom-watchlist/data?watchlist_id="+encodeURIComponent(id)).then(function(d){
      var boards={}; (d.rankings||[]).forEach(function(r){if(!boards[r.board])boards[r.board]=[];boards[r.board].push(r);});
      var playerAllianceById={}; (d.players||[]).forEach(function(p){if(p.governor_id)playerAllianceById[String(p.governor_id)]=p.alliance_abbr||null;if(p.uid)playerAllianceById[String(p.uid)]=p.alliance_abbr||null;});
      var h='<div class="card"><div class="section-title"><h2>王国 '+esc(d.watchlist.kid)+' ランキング</h2><span>TOP '+esc(d.watchlist.top_n)+'</span></div><div class="rank-grid">';
      Object.keys(boards).forEach(function(b){
        var label=RANKING_BOARD_LABELS[b]||b;
        h+='<div class="rank"><div class="rank-title"><b>'+esc(label)+'</b><span class="rank-key">'+esc(b)+'</span></div>';
        boards[b].slice(0,d.watchlist.top_n).forEach(function(r){
          var allianceAbbr=(r.abbr||playerAllianceById[String(r.governor_id)]||playerAllianceById[String(r.uid)]||playerAllianceById[String(r.target_id)]||"");
          var displayName=(b==="alliance_power"||b==="alliance_kills")?(allianceAbbr?(("【"+allianceAbbr+"】")+(r.name||"")):(r.name||r.nick_name||r.governor_id||"-")):(allianceAbbr?("【"+allianceAbbr+"】"):"")+(r.nick_name||r.governor_id||r.name||"-");
          var playerLink=(r.target_type==="PLAYER"&&r.governor_id)?('/player?governor_id='+encodeURIComponent(String(r.governor_id))):null;
          var nameHtml=playerLink?'<a class="rank-name rank-player-link" href="'+playerLink+'">'+esc(displayName)+'</a>':'<span class="rank-name">'+esc(displayName)+'</span>';
          var starHtml=(r.target_type==="PLAYER"&&r.governor_id)?'<button type="button" class="rank-watch-star" data-governor-id="'+esc(String(r.governor_id))+'" data-watched="'+(r.watched?'1':'0')+'" title="'+(r.watched?'プレイヤーウォッチリスト登録済み':'プレイヤーウォッチリストに登録')+'" aria-label="'+(r.watched?'プレイヤーウォッチリスト登録済み':'プレイヤーウォッチリストに登録')+'" onclick="togglePlayerWatch(this)">'+(r.watched?'★':'☆')+'</button>':'';
          h+='<div class="rank-row"><span class="rank-no">'+esc(r.rank)+'</span>'+nameHtml+starHtml+'<span class="rank-score">'+esc(formatCompactNumber(r.score))+'</span></div>';
        });
        h+='</div>';
      });
      h+='</div><div class="section-title"><h2>観測プレイヤー</h2><span>'+(d.players||[]).length+'人</span></div><div class="rank-grid">';
      (d.players||[]).forEach(function(p){h+='<div class="player-card"><b>'+esc(p.nick_name||p.governor_id)+'</b><div class="player-meta">戦力 '+esc(formatCompactNumber(p.power))+' / 役場 '+esc(p.town_center_level)+'<br>'+esc(p.alliance_abbr||p.alliance_name||"-")+'</div></div>';});
      h+='</div></div>';el("detail").innerHTML=h;
    }).catch(function(e){el("detail").innerHTML='<div class="card error">読み込み失敗: '+esc(e.message)+'</div>';});
  }
  var creatingWatchlist=false;
  el("create").addEventListener("click",function(){
    if(creatingWatchlist)return;
    var kidValue=String(el("kid").value||"").trim();
    var topValue=String(el("top").value||"").trim();
    var intervalValue=String(el("interval").value||"").trim();
    if(!kidValue){
      el("msg").innerHTML="<span class='error'>登録失敗: 王国番号を入力してください。</span>";
      el("kid").focus();
      return;
    }
    creatingWatchlist=true;
    el("create").disabled=true;
    var originalCreateText=el("create").textContent;
    el("create").textContent="登録中…";
    el("msg").innerHTML="<span class='muted'>監視対象を登録しています…</span>";
    var payload={kid:Number(kidValue),top_n:Number(topValue),interval_hours:Number(intervalValue)};
    api("/api/kingdom-watchlist?action=create",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)})
    .then(function(d){
      el("kid").value="";
      if(d.initial_refresh_status==="FAILED"){
        el("msg").innerHTML="<span class='error'>監視対象を登録しましたが、初回取得に失敗しました。</span>";
        return load();
      }
      if(d.watchlist_id && d.initial_refresh_status && d.initial_refresh_status!=="COMPLETED"){
        try{
          sessionStorage.setItem("eagleeye_watchlist_running_"+d.watchlist_id,"1");
          sessionStorage.setItem("eagleeye_watchlist_started_at_"+d.watchlist_id,String(Date.now()));
        }catch(e){}
        el("msg").innerHTML="<span class='ok'>監視を登録しました。初回データを取得中です。</span>";
        return load().then(function(){return continueWatch(d.watchlist_id);});
      }
      el("msg").innerHTML="<span class='ok'>監視を登録しました。初回データの取得が完了しました。</span>";
      return load();
    })
    .catch(function(e){
      el("msg").innerHTML="<span class='error'>登録失敗: "+esc(e.message)+"</span>";
    })
    .finally(function(){
      creatingWatchlist=false;
      el("create").disabled=false;
      el("create").textContent=originalCreateText;
    });
  });
  load();
}());
</script></body></html>`;
}
async function handleKingdomRankingHistoryApi(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const url = new URL(request.url);
  const kid = Number(url.searchParams.get("kid"));
  const board = url.searchParams.get("board");
  const targetId = url.searchParams.get("target_id");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200);
  if (!Number.isInteger(kid) || kid < 1 || !board || !targetId) return json({ ok: false, error: "KID_BOARD_TARGET_REQUIRED" }, 400);
  const history = await getRankingHistory(env.DB, { kid, board, targetId, limit, archiveBucket: env.ARCHIVE, historyMode: env.HISTORY_STORAGE_MODE });
  await trackServiceUsage(env, auth, "KINGDOM_RANKING_VIEW", {
    targetType: "KINGDOM",
    targetId: kid,
    metadata: { kid, board, limit, display_count: history.length }
  });
  return json({ ok: true, kid, board, target_id: targetId, history });
}

async function handleKingdomWatchlistDataApi(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const url = new URL(request.url);
  const watchlistId = url.searchParams.get("watchlist_id");
  if (!watchlistId) return json({ ok: false, error: "WATCHLIST_ID_REQUIRED" }, 400);

  const watch = await env.DB.prepare(
    "SELECT watchlist_id, kid, top_n, interval_hours, enabled, last_run_at, last_success_at, last_success_at AS last_checked_at, last_error FROM kingdom_watchlists WHERE watchlist_id = ? AND discord_id = ?"
  ).bind(watchlistId, auth.discord_id).first();
  if (!watch) return json({ ok: false, error: "WATCHLIST_NOT_FOUND" }, 404);

  const freshnessJob = await env.DB.prepare(
    "SELECT status, source_first_at, source_last_at, completed_at FROM kingdom_watchlist_jobs WHERE watchlist_id = ? ORDER BY created_at DESC LIMIT 1"
  ).bind(watchlistId).first();

  const board = url.searchParams.get("board");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || watch.top_n), 1), 100);

  let rankings;
  if (board) {
    rankings = await env.DB.prepare(
      `WITH alliance_abbr AS (
        SELECT aid,
          MAX(CASE WHEN board = 'alliance_power' THEN abbr END) AS power_abbr,
          MAX(CASE WHEN board = 'alliance_kills' THEN abbr END) AS kills_abbr
        FROM kingdom_ranking_current
        WHERE kid = ? AND board IN ('alliance_power', 'alliance_kills')
          AND target_type = 'ALLIANCE' AND aid IS NOT NULL
        GROUP BY aid
      )
      SELECT r.board, r.target_type, r.target_id, r.rank, r.score, r.uid, r.governor_id, r.nick_name, r.aid,
        COALESCE(r.abbr, aa.power_abbr, aa.kills_abbr,
          (SELECT p.alliance_abbr FROM players p
           WHERE p.governor_id = r.governor_id OR p.governor_id = r.target_id
              OR p.uid = r.uid OR p.uid = r.target_id LIMIT 1)
        ) AS abbr, r.name, r.observed_at
      FROM kingdom_ranking_current r
      LEFT JOIN alliance_abbr aa ON aa.aid = r.aid
      WHERE r.kid = ? AND r.board = ?
      ORDER BY r.rank ASC LIMIT ?`
    ).bind(watch.kid, watch.kid, board, limit).all();
  } else {
    rankings = await env.DB.prepare(
      `WITH alliance_abbr AS (
        SELECT aid,
          MAX(CASE WHEN board = 'alliance_power' THEN abbr END) AS power_abbr,
          MAX(CASE WHEN board = 'alliance_kills' THEN abbr END) AS kills_abbr
        FROM kingdom_ranking_current
        WHERE kid = ? AND board IN ('alliance_power', 'alliance_kills')
          AND target_type = 'ALLIANCE' AND aid IS NOT NULL
        GROUP BY aid
      )
      SELECT r.board, r.target_type, r.target_id, r.rank, r.score, r.uid, r.governor_id, r.nick_name, r.aid,
        COALESCE(r.abbr, aa.power_abbr, aa.kills_abbr,
          (SELECT p.alliance_abbr FROM players p
           WHERE p.governor_id = r.governor_id OR p.governor_id = r.target_id
              OR p.uid = r.uid OR p.uid = r.target_id LIMIT 1)
        ) AS abbr, r.name, r.observed_at
      FROM kingdom_ranking_current r
      LEFT JOIN alliance_abbr aa ON aa.aid = r.aid
      WHERE r.kid = ? AND r.rank <= ?
      ORDER BY r.board ASC, r.rank ASC`
    ).bind(watch.kid, watch.kid, limit).all();
  }

  await ensurePlayerWatchlistSchema(env.DB);
  const watchedRows = await env.DB.prepare(
    "SELECT governor_id FROM player_watchlists WHERE discord_id = ? AND enabled = 1"
  ).bind(auth.discord_id).all();
  const watchedGovernorIds = new Set((watchedRows.results || []).map(row => normalizeGovernorId(row.governor_id)).filter(Boolean));

  // Ranking current normalizes numeric governor IDs (e.g. "123.0" -> "123").
  // Build a small indexed candidate set instead of normalizing both sides of a
  // players JOIN. The previous expression-based JOIN forced D1 to scan a large
  // portion of players on every watchlist page load.
  const topPlayerRows = await env.DB.prepare(
    "SELECT governor_id FROM kingdom_ranking_current WHERE kid = ? AND board = 'personal_power' AND target_type = 'PLAYER' AND governor_id IS NOT NULL AND rank <= ? ORDER BY rank ASC, governor_id ASC"
  ).bind(watch.kid, watch.top_n).all();
  const topGovernorIds = [...new Set((topPlayerRows.results || [])
    .map(row => String(row.governor_id || "").trim())
    .filter(Boolean))];
  const playerGovernorCandidates = [...new Set(
    topGovernorIds.flatMap(id => /^\d+$/.test(id) ? [id, id + ".0"] : [id])
  )];

  let players = { results: [] };
  if (playerGovernorCandidates.length) {
    const placeholders = playerGovernorCandidates.map(() => "?").join(",");
    players = await env.DB.prepare(
      "SELECT governor_id, uid, nick_name, kid, power, town_center_level, vip, kills, x, y, alliance_abbr, alliance_name, online, last_active_at, observed_at FROM players WHERE governor_id IN (" + placeholders + ") ORDER BY power DESC, governor_id ASC"
    ).bind(...playerGovernorCandidates).all();
  }

  await trackServiceUsage(env, auth, "KINGDOM_RANKING_VIEW", {
    targetType: "KINGDOM",
    targetId: watch.kid,
    metadata: {
      kid: watch.kid,
      board: board || "ALL",
      limit,
      display_count: (rankings.results || []).length,
      observed_at: freshnessJob?.source_last_at ? Number(freshnessJob.source_last_at) : null
    }
  });

  return json({
    ok: true,
    watchlist: {
      ...watch,
      source_first_at: freshnessJob?.source_first_at ? Number(freshnessJob.source_first_at) : null,
      source_last_at: freshnessJob?.source_last_at ? Number(freshnessJob.source_last_at) : null,
      source_completed_at: freshnessJob?.completed_at ? Number(freshnessJob.completed_at) : null
    },
    rankings: (rankings.results || []).map(row => ({ ...row, watched: row.target_type === 'PLAYER' && watchedGovernorIds.has(normalizeGovernorId(row.governor_id || row.target_id)) })),
    players: players.results || []
  });
}


let playerWatchlistSchemaPromise = null;

async function ensurePlayerWatchlistSchema(db) {
  if (playerWatchlistSchemaPromise) return playerWatchlistSchemaPromise;
  playerWatchlistSchemaPromise = (async () => {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS player_watchlists (
        watchlist_id TEXT PRIMARY KEY,
        discord_id TEXT NOT NULL,
        governor_id TEXT NOT NULL,
        label TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(discord_id, governor_id)
      )
    `).run();
    await db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_player_watchlists_user ON player_watchlists(discord_id, enabled, updated_at DESC)"
    ).run();
    await db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_player_watchlists_player ON player_watchlists(governor_id, enabled)"
    ).run();
  })();
  try {
    return await playerWatchlistSchemaPromise;
  } catch (error) {
    playerWatchlistSchemaPromise = null;
    throw error;
  }
}

async function handleOwnerPlayerLinkSupportApi(request, env) {
  const guard = await requireOwner(request, env);
  if (guard.error) return guard.error;
  if (!env.DB) return json({ ok: false, error: "DB_NOT_CONFIGURED" }, 503);

  if (request.method === "GET") {
    const rows = await env.DB.prepare(`
      SELECT s.*, u.discord_id AS requester_discord_id,
             p.nick_name, p.kid, p.power,
             owner.discord_id AS conflicting_discord_id
      FROM user_player_link_support_requests s
      LEFT JOIN users u ON u.user_id = s.requester_user_id
      LEFT JOIN players p ON p.governor_id = s.governor_id
      LEFT JOIN users owner ON owner.user_id = s.conflicting_user_id
      WHERE s.status IN ('OPEN','UNDER_REVIEW')
      ORDER BY s.created_at ASC
      LIMIT 100
    `).all();
    return json({ ok: true, requests: rows.results || [] });
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => null);
    const requestId = String(body?.request_id || "").trim();
    const action = String(body?.action || "").trim();
    if (!requestId || !["VERIFY_TRANSFER","REJECT"].includes(action)) {
      return json({ ok: false, error: "INVALID_REQUEST" }, 400);
    }

    const support = await env.DB.prepare(
      "SELECT * FROM user_player_link_support_requests WHERE request_id = ? LIMIT 1"
    ).bind(requestId).first();
    if (!support) return json({ ok: false, error: "SUPPORT_REQUEST_NOT_FOUND" }, 404);
    if (!["OPEN","UNDER_REVIEW"].includes(support.status)) {
      return json({ ok: false, error: "SUPPORT_REQUEST_ALREADY_RESOLVED" }, 409);
    }

    if (action === "REJECT") {
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare(`
        UPDATE user_player_link_support_requests
        SET status='REJECTED', resolution_note=?, updated_at=?, resolved_at=?, resolved_by_user_id=?
        WHERE request_id=?
      `).bind(
        String(body?.resolution_note || "本人確認を満たさないため登録移管を行いません。").slice(0,1000),
        now, now, guard.auth.user_id, requestId
      ).run();
      return json({ ok: true, status: "REJECTED" });
    }

    const result = await verifyAndTransferPlayerLink(env.DB, {
      requestId,
      ownerUserId: support.conflicting_user_id,
      newUserId: support.requester_user_id,
      resolverUserId: guard.auth.user_id,
      resolutionNote: body?.resolution_note || "ゲーム内情報による本人確認済み。正しい所有者へ移管し、EagleEye公式認証を付与。"
    });
    return json({ ok: true, status: "RESOLVED", link: result });
  }

  return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
}

async function handleMyAdvancedApi(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (!env.DB) return json({ ok: false, error: "DB_NOT_CONFIGURED" }, 503);

  // User-contributed MightPulse keys are encrypted by api-pool.js.
  // Configure the pool encryption key before the contribution endpoint writes
  // the submitted key; admin/probe paths already do this explicitly.
  configureApiPoolEncryption(env.EAGLEEYE_SESSION_SECRET);

  try {
    if (request.method === "GET") {
      const eligibility = await getAdvancedEligibility(env.DB, auth.user_id);
      return json({ ok: true, ...eligibility });
    }

    if (request.method === "POST") {
      const body = await request.json().catch(() => null);
      const apiKey = String(body?.api_key || "").trim();
      if (!apiKey) return json({ ok: false, error: "MIGHTPULSE_API_KEY_REQUIRED", message: "MightPulse APIキーを入力してください。" }, 400);

      await registerUserMightPulseApiKey(env.DB, {
        env,
        userId: auth.user_id,
        apiKey
      });

      const eligibility = await evaluateAdvancedEligibility(env.DB, auth.user_id);
      await trackServiceUsage(env, auth, "MIGHTPULSE_API_KEY_CONTRIBUTE", {
        targetType: "USER",
        targetId: auth.user_id,
        metadata: { pool_type: "USER_CONTRIBUTED" }
      });
      if (eligibility.promoted) {
        await trackServiceUsage(env, auth, "ADVANCED_PROMOTED", {
          targetType: "USER",
          targetId: auth.user_id,
          metadata: { reason: "PLAYER_LINK_AND_USER_CONTRIBUTED_MIGHTPULSE_KEY" }
        });
      }

      return json({
        ok: true,
        promoted: Boolean(eligibility.promoted),
        role: eligibility.role,
        hasPlayerLink: eligibility.hasPlayerLink,
        hasMightPulseKey: eligibility.hasMightPulseKey
      });
    }

    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  } catch (error) {
    console.error("my_advanced_api_failed", error?.code || error?.message || error);
    const code = error?.code || "MY_ADVANCED_API_FAILED";
    const userMessage = error?.userMessage || (
      code === "PLAYER_LINK_REQUIRED_FOR_KEY_VALIDATION"
        ? "先にKingShot領主IDを登録してください。"
        : "Advanced昇格条件の処理に失敗しました。"
    );
    const status = [
      "MIGHTPULSE_API_KEY_INVALID",
      "MIGHTPULSE_PLAYER_NOT_AVAILABLE",
      "MIGHTPULSE_PLAYER_MISMATCH",
      "PLAYER_LINK_REQUIRED_FOR_KEY_VALIDATION",
      "MIGHTPULSE_API_KEY_LIMIT_REACHED",
      "MIGHTPULSE_API_KEY_ALREADY_REGISTERED"
    ].includes(code) ? 400 : 500;
    return json({ ok: false, error: code, message: userMessage }, status);
  }
}

async function handleMyPlayerApi(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (!env.DB) return json({ ok: false, error: "DB_NOT_CONFIGURED" }, 503);

  try {
    if (request.method === "GET") {
      const rows = await getUserPlayerLinksWithPlayers(env.DB, auth.user_id);
      const links = rows.map(row => ({
        link_id: row.link_id,
        user_id: row.user_id,
        governor_id: row.governor_id,
        kingdom_id: Number(row.kingdom_id),
        account_type: row.account_type,
        status: row.status,
        verification_method: row.verification_method,
        verified: row.verification_method !== "SELF_CLAIM",
        created_at: row.created_at,
        updated_at: row.updated_at,
        verified_at: row.verified_at,
        official_verified_at: row.official_verified_at,
        official_verified_by_user_id: row.official_verified_by_user_id,
        player: row.nick_name == null && row.kid == null ? null : {
          governor_id: row.governor_id,
          nick_name: row.nick_name,
          kid: row.kid,
          power: row.power,
          town_center_level: row.town_center_level,
          vip: row.vip,
          alliance_abbr: row.alliance_abbr,
          alliance_name: row.alliance_name,
          observed_at: row.observed_at
        }
      }));
      const active = links.filter(row => row.status === "ACTIVE");
      const kingdoms = new Set(active.map(row => Number(row.kingdom_id)));
      const byKingdom = {};
      for (const row of active) {
        const key = String(row.kingdom_id);
        byKingdom[key] = (byKingdom[key] || 0) + 1;
      }
      return json({
        ok: true,
        links,
        link: links.find(row => row.account_type === "MAIN" && row.status === "ACTIVE") || active[0] || null,
        limits: {
          freeKingdoms: 2,
          freeAccountsPerKingdom: 2,
          freeSubAccountsPerKingdom: 1,
          registeredKingdoms: kingdoms.size,
          activeAccounts: active.length,
          byKingdom
        }
      });
    }

    if (request.method === "POST") {
      const body = await request.json().catch(() => null);
      const governorId = validateGovernorId(body?.governor_id);
      const accountType = String(body?.account_type || "MAIN").toUpperCase() === "SUB" ? "SUB" : "MAIN";
      if (!governorId) return json({ ok: false, error: "INVALID_GOVERNOR_ID", message: "領主IDは7〜12桁の数字で入力してください。" }, 400);

      let link;
      try {
        // A new user cannot be expected to have an existing EagleEye record.
        // If the player is absent from D1, resolve the ID through the normal
        // API Pool path first, persist the observation, and materialize it.
        const existingPlayer = await getPlayer(env.DB, governorId);
        if (!existingPlayer) {
          const fetched = await fetchPlayerThroughApiPool(env, governorId, "KINGSHOT_ID_REGISTER");
          await materializePlayer(
            env.DB,
            fetched.observation,
            null,
            env.ARCHIVE,
            env.HISTORY_STORAGE_MODE
          );
        }

        link = await saveUserPlayerLink(env.DB, auth.user_id, governorId, accountType, {
          allowExtraAccounts: String(env.KINGSHOT_EXTRA_ACCOUNTS_ENABLED || "").toLowerCase() === "true"
        });
      } catch (error) {
        if (error?.code === "GOVERNOR_ID_ALREADY_LINKED") {
          const supportUrl = String(env.DISCORD_SUPPORT_URL || "").trim() || null;
          const requestRecord = await createOwnershipSupportRequest(env.DB, {
            requesterUserId: auth.user_id,
            governorId,
            conflictingUserId: error.owner?.user_id || null,
            discordSupportUrl: supportUrl
          });
          await trackServiceUsage(env, auth, "KINGSHOT_ID_CONFLICT", { targetType: "PLAYER", targetId: governorId });
          await trackServiceUsage(env, auth, "KINGSHOT_ID_SUPPORT_REQUEST", { targetType: "PLAYER", targetId: governorId });
          return json({
            ok: false,
            error: "GOVERNOR_ID_ALREADY_LINKED",
            message: "この領主IDはすでに別のEagleEyeアカウントに登録されています。",
            support_required: true,
            support_request_id: requestRecord.request_id,
            support_url: supportUrl,
            note: "本人である場合は、KingShotゲーム内で本人しか表示できない情報が確認できるスクリーンショットを添えてEagleEye専用サポートへ問い合わせてください。"
          }, 409);
        }
        if (["PLAYER_NOT_FOUND","KINGDOM_LIMIT_REACHED","MAIN_ACCOUNT_ALREADY_EXISTS","SUB_ACCOUNT_LIMIT_REACHED","ACCOUNT_LIMIT_REACHED","GOVERNOR_ID_ALREADY_REGISTERED"].includes(error?.code)) {
          return json({ ok: false, error: error.code, message: error.userMessage || error.message }, 409);
        }
        if (error?.code === "NO_API_POOL_KEY_AVAILABLE" || error?.message === "NO_API_POOL_KEY_AVAILABLE") {
          return json({ ok: false, error: "NO_API_POOL_KEY_AVAILABLE", message: "現在、プレイヤー情報を取得できるAPIが利用できません。しばらくしてから再度お試しください。" }, 503);
        }
        if (Number(error?.status) === 404 || error?.code === "MIGHTPULSE_NOT_FOUND") {
          return json({ ok: false, error: "PLAYER_NOT_FOUND", message: "その領主IDのプレイヤー情報をMightPulseから取得できませんでした。領主IDをご確認ください。" }, 404);
        }
        throw error;
      }

      await trackServiceUsage(env, auth, "KINGSHOT_ID_REGISTER", {
        targetType: "PLAYER",
        targetId: governorId,
        metadata: { accountType }
      });

      const eligibility = await evaluateAdvancedEligibility(env.DB, auth.user_id);
      if (eligibility.promoted) {
        await trackServiceUsage(env, auth, "ADVANCED_PROMOTED", {
          targetType: "USER",
          targetId: auth.user_id,
          metadata: { reason: "PLAYER_LINK_AND_USER_CONTRIBUTED_MIGHTPULSE_KEY" }
        });
      }

      const rows = await getUserPlayerLinksWithPlayers(env.DB, auth.user_id);
      return json({
        ok: true,
        link,
        links: rows,
        advanced: {
          promoted: Boolean(eligibility.promoted),
          role: eligibility.role,
          hasPlayerLink: eligibility.hasPlayerLink,
          hasMightPulseKey: eligibility.hasMightPulseKey
        }
      }, 200);
    }

    if (request.method === "DELETE") {
      const body = await request.json().catch(() => null);
      const governorId = validateGovernorId(body?.governor_id);
      if (!governorId) return json({ ok: false, error: "INVALID_GOVERNOR_ID", message: "解除対象の領主IDが必要です。" }, 400);
      const result = await disableUserPlayerLink(env.DB, auth.user_id, governorId);
      if (!result.changed) return json({ ok: false, error: "PLAYER_LINK_NOT_FOUND", message: "指定された登録が見つかりません。" }, 404);
      await trackServiceUsage(env, auth, "KINGSHOT_ID_REMOVE", { targetType: "PLAYER", targetId: governorId });
      return json({ ok: true, links: result.links });
    }

    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  } catch (error) {
    console.error("my_player_api_failed", error?.message || error);
    return json({ ok: false, error: error?.code || "MY_PLAYER_API_FAILED", message: error?.message || "KingShot IDの処理に失敗しました。" }, 500);
  }
}

async function renderMyPlayerPage(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") {
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>マイKingShot | EagleEye</title></head><body style="background:#0f172a;color:#f8fafc;font-family:system-ui;padding:28px"><h1>ログインが必要です</h1><a href="/api/auth/discord" style="color:#f59e0b">Discordでログイン</a></body></html>`;
  }

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>マイKingShot | EagleEye</title><style>
  :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:680px;margin:auto;padding:28px 18px 48px}.back{color:#94a3b8;text-decoration:none}.eyebrow{margin-top:24px;color:#f59e0b;font-size:11px;font-weight:900;letter-spacing:2px}.title{font-size:30px;margin:5px 0 8px}.sub{color:#94a3b8;line-height:1.7}.card{margin-top:18px;padding:18px;border:1px solid #334155;border-radius:16px;background:#162238}.label{display:block;margin-bottom:8px;color:#cbd5e1;font-size:13px;font-weight:800}.input,.select{width:100%;padding:14px;border-radius:12px;border:1px solid #475569;background:#0b1220;color:#fff;font-size:18px;box-sizing:border-box}.btn{margin-top:12px;width:100%;padding:14px;border:0;border-radius:12px;background:#f59e0b;color:#111827;font-weight:900;font-size:15px}.danger{background:#3f1d24;color:#fecaca}.muted{color:#94a3b8;font-size:12px;line-height:1.7}.ok{color:#86efac}.warn{color:#fbbf24}.error{margin-top:12px;color:#fca5a5}.row{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid #334155}.row:last-child{border-bottom:0}.value{font-weight:800;text-align:right;overflow-wrap:anywhere}.account{margin-top:14px;padding:14px;border:1px solid #334155;border-radius:14px;background:#101b2d}.account-head{display:flex;justify-content:space-between;gap:8px;align-items:center}.badge{padding:4px 8px;border-radius:999px;background:#334155;font-size:11px;font-weight:900}.badge.main{background:#78350f;color:#fde68a}.badge.sub{background:#1e3a8a;color:#bfdbfe}.check{display:flex;align-items:center;gap:9px;margin:9px 0}.check-icon{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:#334155;font-size:12px;font-weight:900}.check-icon.ok{background:#14532d;color:#86efac}</style></head><body><main class="wrap"><a class="back" href="/">← EagleEye</a><div class="eyebrow">MY KINGSHOT</div><h1 class="title">マイKingShot</h1><p class="sub">Discordアカウントに、自分のKingShot領主IDを複数紐づけできます。無料枠は1王国につきメイン1＋サブ1、最大2王国です。</p><div id="app"><div class="card">読み込み中…</div></div></main><script>
(function(){
  const app=document.getElementById("app");
  function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  async function getData(){
    const [playerRes, advancedRes]=await Promise.all([
      fetch("/api/me/player",{credentials:"same-origin",cache:"no-store"}),
      fetch("/api/me/advanced",{credentials:"same-origin",cache:"no-store"})
    ]);
    const player=await playerRes.json().catch(()=>({})); const advanced=await advancedRes.json().catch(()=>({}));
    if(!playerRes.ok||!player.ok) throw new Error(player.message||player.error||("HTTP "+playerRes.status));
    if(!advancedRes.ok||!advanced.ok) throw new Error(advanced.message||advanced.error||("HTTP "+advancedRes.status));
    return {player,advanced};
  }
  async function load(){render(await getData());}
  function render(d){
    const rows=(d.player.links||[]).filter(x=>x.status==="ACTIVE");
    const limits=d.player.limits||{};
    let html='<div class="card"><h2 style="margin:0 0 6px">登録済みの領主</h2><p class="muted" style="margin:0">無料枠：最大2王国、各王国メイン1＋サブ1</p>';
    if(!rows.length) html+='<p class="muted">まだ登録されていません。</p>';
    for(const l of rows){
      const p=l.player||{};
      html+='<div class="account"><div class="account-head"><strong>王国 '+esc(l.kingdom_id)+'</strong><span class="badge '+(l.account_type==="MAIN"?"main":"sub")+'">'+(l.account_type==="MAIN"?"メイン":"サブ")+'</span></div>'+
        '<div class="row"><span>領主ID</span><span class="value">'+esc(l.governor_id)+'</span></div>'+
        '<div class="row"><span>プレイヤー名</span><span class="value">'+esc(p.nick_name||"未取得")+'</span></div>'+
        '<div class="row"><span>戦力</span><span class="value">'+esc(p.power!=null?Number(p.power).toLocaleString("ja-JP"):"未取得")+'</span></div>'+
        '<div class="row"><span>同盟</span><span class="value">'+esc(p.alliance_abbr||p.alliance_name||"未取得")+'</span></div>'+
        '<div class="row"><span>登録状態</span><span class="value ok">'+(l.official_verified_at?"✓ EagleEye公式認証":(l.verified?"管理者確認済み":"自己申告・未認証"))+'</span></div>'+
        '<button class="btn danger remove" data-governor="'+esc(l.governor_id)+'">この登録を解除</button></div>';
    }
    html+='<div class="muted" style="margin-top:12px">現在 '+esc(limits.registeredKingdoms||0)+' / 2 王国、'+esc(limits.activeAccounts||0)+' アカウントを登録中</div></div>';
    html+='<div class="card"><h2 style="margin:0 0 6px">KingShotアカウントを追加</h2><label class="label" for="gid">領主ID</label><input id="gid" class="input" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="例: 123456789"><label class="label" for="atype" style="margin-top:14px">区分</label><select id="atype" class="select"><option value="MAIN">メイン</option><option value="SUB">サブ</option></select><button class="btn" id="save">登録する</button><div class="muted" style="margin-top:12px">同じ王国ではメイン1件＋サブ1件まで登録できます。</div><div id="msg"></div></div>';
    const a=d.advanced||{}; const role=String(a.role||"BASIC").toUpperCase(); const promoted=["ADVANCED","ADMIN","OWNER"].includes(role);
    const keyCount=Number(a.mightPulseKeyCount||0); const keyLimit=Number(a.mightPulseKeyLimit||3);
    const keyRows=Array.isArray(a.apiKeys)?a.apiKeys:[];
    let keyHtml='<div class="muted" style="margin-top:12px">登録済みAPIキー：'+esc(keyCount)+' / '+esc(keyLimit)+'</div>';
    if(keyRows.length) keyHtml+='<div style="margin-top:8px">'+keyRows.map((k,i)=>'<div class="row"><span>APIキー '+(i+1)+'</span><span class="value ok">✓ 提供済み</span></div>').join('')+'</div>';
    const canAddKey=keyCount<keyLimit;
    html+='<div class="card"><h2 style="margin:0 0 6px">Advanced昇格条件</h2><p class="muted" style="margin:0 0 12px">以下の2つを満たすとBASICからAdvancedへ昇格します。</p>'+
      '<div class="check"><span class="check-icon '+(a.hasPlayerLink?"ok":"")+'">'+(a.hasPlayerLink?"✓":"")+'</span><span>領主IDを1つ以上登録</span></div>'+
      '<div class="check"><span class="check-icon '+(a.hasMightPulseKey?"ok":"")+'">'+(a.hasMightPulseKey?"✓":"")+'</span><span>MightPulse APIキーを1本以上Poolへ提供</span></div>'+
      '<div class="row" style="margin-top:10px"><span>現在の権限</span><span class="value '+(promoted?"ok":"")+'">'+esc(role)+'</span></div>'+
      keyHtml+
      (canAddKey?'<label class="label" for="mpkey" style="margin-top:16px">MightPulse APIキーを追加</label><input id="mpkey" class="input" type="password" autocomplete="off" placeholder="MightPulse APIキーを入力"><button class="btn" id="register-key">APIキーをPoolへ提供する</button><div class="muted" style="margin-top:12px">最大'+esc(keyLimit)+'本まで提供できます。提供したキーは暗号化してPoolへ保存され、キー本体は画面やログには表示しません。</div>':'<div class="muted" style="margin-top:12px">MightPulse APIキーの提供上限（'+esc(keyLimit)+'本）に達しています。</div>')+
      '<div id="key-msg"></div></div>';
    app.innerHTML=html;
    document.getElementById("save").onclick=save;
    document.querySelectorAll(".remove").forEach(b=>b.onclick=()=>remove(b.dataset.governor));
    if(document.getElementById("register-key")) document.getElementById("register-key").onclick=registerKey;
  }
  async function save(){
    const input=document.getElementById("gid"), type=document.getElementById("atype"), msg=document.getElementById("msg"), button=document.getElementById("save");
    button.disabled=true; msg.textContent="";
    try{
      const r=await fetch("/api/me/player",{method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify({governor_id:input.value.trim(),account_type:type.value})});
      const d=await r.json().catch(()=>({}));
      if(r.status===409 && d.error==="GOVERNOR_ID_ALREADY_LINKED"){
        app.innerHTML='<div class="card"><h2 style="margin-top:0">この領主IDは既に登録されています</h2><p class="muted">'+esc(d.message)+'</p><p class="muted">正当な所有者である場合は、KingShotゲーム内で本人しか表示できない情報が分かるスクリーンショットを用意してEagleEye専用サポートへ問い合わせてください。</p>'+('<a class="btn" href="/support?category=ACCOUNT&subcategory=GOVERNOR_ID&governor_id='+encodeURIComponent(input.value.trim())+'">この件について問い合わせる</a>')+'<div class="muted" style="margin-top:12px">問い合わせ番号: '+esc(d.support_request_id)+'</div><button class="btn danger" id="back">戻る</button></div>';
        document.getElementById("back").onclick=load; return;
      }
      if(!r.ok||!d.ok) throw new Error(d.message||d.error||("HTTP "+r.status));
      await load();
    }catch(e){msg.className="error";msg.textContent=e.message||String(e);}
    finally{button.disabled=false;}
  }
  async function remove(governorId){
    if(!confirm("このKingShotアカウントの登録を解除しますか？")) return;
    const r=await fetch("/api/me/player",{method:"DELETE",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify({governor_id:governorId})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.ok){alert(d.message||d.error||"解除に失敗しました");return;}
    await load();
  }
  async function registerKey(){
    const input=document.getElementById("mpkey"), msg=document.getElementById("key-msg"), button=document.getElementById("register-key");
    const key=String(input?.value||"").trim();
    if(!key){msg.className="error";msg.textContent="MightPulse APIキーを入力してください。";return;}
    if(!confirm("このAPIキーをEagleEyeのMightPulse API Poolへ提供しますか？")) return;
    button.disabled=true; msg.className="muted"; msg.textContent="登録しています…";
    try{
      const r=await fetch("/api/me/mightpulse-key",{method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify({api_key:key})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok||!d.ok) throw new Error(d.message||d.error||("HTTP "+r.status));
      msg.className="ok"; msg.textContent=d.promoted?"APIキーを登録しました。Advancedへ昇格しました。":"APIキーを登録しました。領主ID登録後にAdvanced昇格条件を満たします。";
      input.value=""; setTimeout(load,500);
    }catch(e){msg.className="error";msg.textContent=e.message||String(e);}
    finally{button.disabled=false;}
  }
  load().catch(e=>{app.innerHTML='<div class="card error">'+esc(e.message||String(e))+'</div>';});
}());
</script></body></html>`;
}

async function handlePlayerWatchlistApi(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (!env.DB) return json({ ok: false, error: "DB_NOT_CONFIGURED" }, 503);

  await ensurePlayerWatchlistSchema(env.DB);
  const url = new URL(request.url);

  if (request.method === "GET") {
    const rows = await env.DB.prepare(`
      SELECT w.watchlist_id, w.governor_id, w.label, w.enabled,
             w.created_at, w.updated_at,
             p.nick_name, p.kid, p.power, p.town_center_level,
             p.vip, p.kills, p.alliance_abbr, p.alliance_name, p.avatar_url,
             p.observed_at
      FROM player_watchlists w
      LEFT JOIN players p ON p.governor_id = w.governor_id
      WHERE w.discord_id = ?
      ORDER BY w.updated_at DESC, w.created_at DESC
    `).bind(auth.discord_id).all();

    const watchRows = rows.results || [];
    await trackServiceUsage(env, auth, "PLAYER_WATCHLIST_VIEW", {
      metadata: {
        watchlist_count: watchRows.length,
        enabled_count: watchRows.filter(row => Number(row.enabled) === 1).length,
        disabled_count: watchRows.filter(row => Number(row.enabled) !== 1).length
      }
    });
    if (!watchRows.length) return json({ ok: true, watchlist: [] });

    // Watchlist summaries are intentionally derived from the existing targeted
    // history tables. Do not scan all player history: both tables have
    // governor_id + observed_at indexes.
    // Read current ranking state only. The old implementation scanned ranking_snapshots
    // with multiple correlated subqueries for every watchlist player × board.
    // Current state + previous_rank make this O(current rows) and avoid historical scans.
    const rankResult = await env.DB.prepare(
      `
      WITH boards(board) AS (VALUES ` + PLAYER_WATCHLIST_RANKING_VALUES_SQL + `)
      SELECT
        w.governor_id,
        p.kid,
        b.board,
        s.last_checked_at AS board_observed_at,
        r.rank AS current_rank,
        r.previous_rank
      FROM player_watchlists w
      INNER JOIN players p ON p.governor_id = w.governor_id
      CROSS JOIN boards b
      LEFT JOIN kingdom_ranking_current r
        ON r.kid = p.kid
       AND r.board = b.board
       AND r.target_type = 'PLAYER'
       AND (CASE WHEN r.target_id LIKE '%.0' THEN substr(r.target_id, 1, length(r.target_id) - 2) ELSE r.target_id END) =
           (CASE WHEN w.governor_id LIKE '%.0' THEN substr(w.governor_id, 1, length(w.governor_id) - 2) ELSE w.governor_id END)
      LEFT JOIN kingdom_ranking_board_state s
        ON s.kid = p.kid
       AND s.board = b.board
      WHERE w.discord_id = ?
        AND w.enabled = 1
        AND p.kid IS NOT NULL
      ORDER BY w.governor_id, b.board
      `
    ).bind(auth.discord_id).all();

    const playerChangeResult = await env.DB.prepare(`
      WITH ranked AS (
        SELECT ce.target_id AS governor_id,
               ce.change_type,
               ce.field_name,
               ce.old_value_json,
               ce.new_value_json,
               ce.detected_at,
               ce.created_at,
               ROW_NUMBER() OVER (
                 PARTITION BY ce.target_id, ce.change_type
                 ORDER BY ce.detected_at DESC, ce.created_at DESC
               ) AS rn
        FROM change_events ce
        INNER JOIN player_watchlists w
          ON w.governor_id = ce.target_id
         AND w.discord_id = ?
        WHERE w.enabled = 1
          AND ce.target_type = 'PLAYER'
          AND ce.change_type IN ('TOWN_CENTER_CHANGED','ALLIANCE_CHANGED')
      )
      SELECT governor_id, change_type, field_name, old_value_json, new_value_json, detected_at
      FROM ranked
      WHERE rn = 1
    `).bind(auth.discord_id).all();

    const powerChangeResult = await env.DB.prepare(`
      WITH ranked AS (
        SELECT ce.target_id AS governor_id,
               ce.old_value_json,
               ce.new_value_json,
               ce.detected_at,
               ce.created_at,
               ROW_NUMBER() OVER (
                 PARTITION BY ce.target_id
                 ORDER BY ce.detected_at DESC, ce.created_at DESC
               ) AS rn
        FROM change_events ce
        INNER JOIN player_watchlists w
          ON w.governor_id = ce.target_id
         AND w.discord_id = ?
        WHERE w.enabled = 1
          AND ce.target_type = 'PLAYER'
          AND ce.field_name = 'power'
      )
      SELECT governor_id, old_value_json, new_value_json, detected_at
      FROM ranked
      WHERE rn = 1
    `).bind(auth.discord_id).all();

    const playerChangeByGovernor = new Map();
    for (const row of playerChangeResult.results || []) {
      let oldValue = null;
      let newValue = null;
      try { oldValue = JSON.parse(row.old_value_json); } catch {}
      try { newValue = JSON.parse(row.new_value_json); } catch {}
      const key = String(row.governor_id);
      const current = playerChangeByGovernor.get(key) || {};
      const item = {
        field: row.field_name,
        old: oldValue,
        new: newValue,
        detected_at: row.detected_at == null ? null : Number(row.detected_at)
      };
      if (row.change_type === "TOWN_CENTER_CHANGED") current.town_center = item;
      if (row.change_type === "ALLIANCE_CHANGED") current.alliance = item;
      playerChangeByGovernor.set(key, current);
    }

    const rankByGovernor = new Map();
    for (const row of rankResult.results || []) {
      const key = String(row.governor_id);
      const list = rankByGovernor.get(key) || [];
      list.push({
        board: String(row.board),
        label: RANKING_BOARD_LABELS[String(row.board)] || String(row.board),
        current: row.current_rank == null ? null : Number(row.current_rank),
        previous: row.previous_rank == null ? null : Number(row.previous_rank),
        delta: row.current_rank != null && row.previous_rank != null
          ? Number(row.previous_rank) - Number(row.current_rank)
          : null,
        observed_at: row.board_observed_at == null ? null : Number(row.board_observed_at)
      });
      rankByGovernor.set(key, list);
    }

    const powerChangeByGovernor = new Map();
    for (const row of powerChangeResult.results || []) {
      let oldValue = null;
      let newValue = null;
      try { oldValue = JSON.parse(row.old_value_json); } catch {}
      try { newValue = JSON.parse(row.new_value_json); } catch {}
      powerChangeByGovernor.set(String(row.governor_id), {
        old: oldValue,
        new: newValue,
        delta: Number.isFinite(Number(oldValue)) && Number.isFinite(Number(newValue))
          ? Number(newValue) - Number(oldValue)
          : null,
        detected_at: row.detected_at == null ? null : Number(row.detected_at)
      });
    }

    const watchlist = watchRows.map(row => {
      const ranks = rankByGovernor.get(String(row.governor_id)) || [];
      const playerChanges = playerChangeByGovernor.get(String(row.governor_id)) || {};

      return {
        ...row,
        enabled: Number(row.enabled) === 1,
        observed_at: row.observed_at == null ? null : Number(row.observed_at),
        summary: {
          power_change: powerChangeByGovernor.get(String(row.governor_id)) || null,
          town_center_change: playerChanges.town_center || null,
          alliance_change: playerChanges.alliance || null,
          ranking_changes: ranks
        }
      };
    });

    return json({ ok: true, watchlist });
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const governorId = normalizeGovernorId(body.governor_id);
    const label = String(body.label ?? "").trim().slice(0, 80) || null;
    if (!governorId || governorId.length > 64) {
      return json({ ok: false, error: "GOVERNOR_ID_REQUIRED" }, 400);
    }

    const limits = await getWatchlistLimits(env.DB);
    const role = String(auth.role || "BASIC").toUpperCase();
    const playerLimit = getRoleWatchlistLimit(limits, role, "player");
    const existing = await env.DB.prepare(
      "SELECT enabled FROM player_watchlists WHERE discord_id = ? AND governor_id = ? LIMIT 1"
    ).bind(auth.discord_id, governorId).first();
    if (Number(existing?.enabled) !== 1) {
      const usage = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM player_watchlists WHERE discord_id = ? AND enabled = 1"
      ).bind(auth.discord_id).first();
      const used = Number(usage?.count || 0);
      if (playerLimit > 0 && used >= playerLimit) {
        return json({ ok: false, error: "PLAYER_WATCHLIST_LIMIT_REACHED", message: "プレイヤーウォッチリストの登録上限に達しています。", limit: playerLimit, used }, 409);
      }
    }

    const now = Math.floor(Date.now() / 1000);
    const watchlistId = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO player_watchlists
        (watchlist_id, discord_id, governor_id, label, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(discord_id, governor_id) DO UPDATE SET
        label = excluded.label,
        enabled = 1,
        updated_at = excluded.updated_at
    `).bind(watchlistId, auth.discord_id, governorId, label, now, now).run();

    const row = await env.DB.prepare(`
      SELECT w.watchlist_id, w.governor_id, w.label, w.enabled,
             w.created_at, w.updated_at,
             p.nick_name, p.kid, p.power, p.town_center_level,
             p.vip, p.alliance_abbr, p.alliance_name, p.avatar_url,
             p.observed_at
      FROM player_watchlists w
      LEFT JOIN players p ON p.governor_id = w.governor_id
      WHERE w.discord_id = ? AND w.governor_id = ?
      LIMIT 1
    `).bind(auth.discord_id, governorId).first();

    return json({ ok: true, item: row ? { ...row, enabled: Number(row.enabled) === 1 } : null });
  }

  if (request.method === "PATCH") {
    const governorId = normalizeGovernorId(url.searchParams.get("governor_id"));
    if (!governorId) return json({ ok: false, error: "GOVERNOR_ID_REQUIRED" }, 400);
    const body = await request.json().catch(() => ({}));
    const enabled = body.enabled ? 1 : 0;
    if (enabled) {
        const limits = await getWatchlistLimits(env.DB);
      const role = String(auth.role || "BASIC").toUpperCase();
      const limit = getRoleWatchlistLimit(limits, role, "player");
      const usage = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM player_watchlists WHERE discord_id = ? AND enabled = 1 AND governor_id <> ?"
      ).bind(auth.discord_id, governorId).first();
      const used = Number(usage?.count || 0);
      if (limit > 0 && used >= limit) {
        return json({ ok: false, error: "PLAYER_WATCHLIST_LIMIT_REACHED", message: "プレイヤーウォッチリストの登録上限に達しています。", limit, used }, 409);
      }
    }
    const now = Math.floor(Date.now() / 1000);
    const result = await env.DB.prepare(
      "UPDATE player_watchlists SET enabled = ?, updated_at = ? WHERE discord_id = ? AND governor_id = ?"
    ).bind(enabled, now, auth.discord_id, governorId).run();
    if (!result?.meta?.changes) return json({ ok: false, error: "WATCHLIST_ITEM_NOT_FOUND" }, 404);
    await trackServiceUsage(env, auth, enabled === 1 ? "PLAYER_WATCHLIST_ADD" : "PLAYER_WATCHLIST_REMOVE", {
      targetType: "PLAYER",
      targetId: governorId,
      metadata: { source: "PLAYER_WATCHLIST", enabled: enabled === 1 }
    });
    return json({ ok: true, governor_id: governorId, enabled: enabled === 1 });
  }

  if (request.method === "DELETE") {
    const governorId = normalizeGovernorId(url.searchParams.get("governor_id"));
    if (!governorId) return json({ ok: false, error: "GOVERNOR_ID_REQUIRED" }, 400);
    const result = await env.DB.prepare(
      "DELETE FROM player_watchlists WHERE discord_id = ? AND governor_id = ?"
    ).bind(auth.discord_id, governorId).run();
    if (!result?.meta?.changes) return json({ ok: false, error: "WATCHLIST_ITEM_NOT_FOUND" }, 404);
    await trackServiceUsage(env, auth, "PLAYER_WATCHLIST_REMOVE", {
      targetType: "PLAYER",
      targetId: governorId,
      metadata: { source: "PLAYER_WATCHLIST" }
    });
    return json({ ok: true, governor_id: governorId });
  }

  return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
}

async function renderPlayerWatchlistPage(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") {
    return applyEagleEyeTheme(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EagleEye Player Watchlist</title></head><body><main class="wrap"><h1>ログインが必要です</h1><a href="/api/auth/discord">Discordでログイン</a></main></body></html>`);
  }

  return applyEagleEyeTheme(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>プレイヤーウォッチリスト｜EagleEye</title>
<style>
body{max-width:900px;margin:auto;padding:20px 14px 48px;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px}.back{color:#94a3b8;text-decoration:none}.title{margin:8px 0 0;font-size:28px}.sub{color:#94a3b8;font-size:12px}
.list{display:grid;gap:12px}.item{padding:15px;border:1px solid #334155;border-radius:16px;background:#162238}.top{display:flex;align-items:center;gap:12px}.avatar{width:44px;height:44px;border-radius:11px;object-fit:cover;background:#0b1220;border:1px solid #475569}.main{min-width:0;flex:1}.name{font-weight:900;overflow-wrap:anywhere}.id{font-size:11px;color:#94a3b8;margin-top:2px}.pill-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}.pill{padding:4px 8px;border-radius:999px;background:#0f172a;color:#cbd5e1;font-size:10px}.state{padding:4px 8px;border-radius:999px;background:#182f25;color:#bbf7d0;font-size:10px;font-weight:800}.state.off{background:#2a1115;color:#fecaca}
.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}.stat{padding:10px;border-radius:11px;background:#0f172a;border:1px solid #334155}.stat span{display:block;color:#94a3b8;font-size:10px}.stat b{display:block;margin-top:3px;font-size:14px;overflow-wrap:anywhere}
.change-box{margin-top:10px;padding:11px 12px;border-radius:12px;background:#111c31;border:1px solid #334155}.change-title{font-size:10px;color:#94a3b8;font-weight:800;letter-spacing:.5px}.change-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:7px;font-size:12px}.change-row .label{color:#cbd5e1}.change-row .value{font-weight:900;text-align:right}.ranking-changes{display:grid;gap:6px;margin-top:8px}.ranking-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 9px;border-radius:9px;background:#0f172a;border:1px solid #273449;font-size:11px}.ranking-row .label{color:#cbd5e1;min-width:0;overflow-wrap:anywhere}.ranking-row .value{font-weight:900;text-align:right;white-space:nowrap}.up{color:#86efac}.down{color:#fca5a5}.flat{color:#94a3b8}.muted{color:#64748b}
.compare-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px;padding:12px 14px;border:1px solid #334155;border-radius:14px;background:#111c31}.compare-toolbar span{display:block;margin-top:3px;color:#94a3b8;font-size:11px}.compare-check{display:inline-flex;align-items:center;gap:6px;color:#cbd5e1;font-size:12px;font-weight:800}.compare-check input{accent-color:#f59e0b}.actions{display:flex;gap:7px;margin-top:12px;flex-wrap:wrap}.action{display:inline-flex;align-items:center;justify-content:center;padding:9px 11px;border:1px solid #334155;border-radius:9px;background:#0f1220;color:#e2e8f0;text-decoration:none;font-size:12px;font-weight:800;cursor:pointer}.action.primary{background:#f59e0b;color:#111827;border-color:#f59e0b}.danger{color:#fecaca;border-color:#7f1d1d}.empty,.error{padding:18px;border:1px dashed #475569;border-radius:14px;color:#94a3b8;text-align:center}.error{color:#fecaca;border-style:solid;border-color:#7f1d1d}.loading{color:#94a3b8;padding:18px;text-align:center}
@media(max-width:520px){.head{display:block}.head .action{margin-top:10px}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style></head><body><main>
<div class="head"><div><a class="back" href="/">← EagleEye</a><h1 class="title">プレイヤーウォッチリスト</h1><div class="sub">登録したプレイヤーの現在値と変化を確認できます</div></div><a class="action" href="/players">プレイヤー検索</a></div>
<div class="compare-toolbar"><div><strong>プレイヤー比較</strong><span id="compare-count">0 / 4人選択</span></div><button id="compare-open" class="action primary" type="button" disabled>選択したプレイヤーを比較</button></div>
<div id="watchlist" class="list"><div class="loading">読み込み中…</div></div>
</main>
<script>
(function(){
  const root=document.getElementById("watchlist");
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const compact=v=>{
    const n=Number(v);
    if(!Number.isFinite(n))return "-";
    const a=Math.abs(n);
    if(a>=1e9)return (n/1e9).toFixed(a>=1e10?0:1)+"B";
    if(a>=1e6)return (n/1e6).toFixed(a>=1e8?0:1)+"M";
    if(a>=1e3)return (n/1e3).toFixed(a>=1e5?0:1)+"K";
    return n.toLocaleString("ja-JP");
  };
  const number=v=>{const n=Number(v);return Number.isFinite(n)?n.toLocaleString("ja-JP"):"-";};
  const deltaText=(delta,upIsGood=true)=>{
    if(delta==null||!Number.isFinite(Number(delta))||Number(delta)===0)return '<span class="flat">変化なし</span>';
    const n=Number(delta);
    return '<span class="'+(n>0?(upIsGood?"up":"down"):(upIsGood?"down":"up"))+'">'+(n>0?"+":"")+number(n)+'</span>';
  };
  const rankText=s=>{
    const current=s?.current;
    const previous=s?.previous;
    if(current==null&&previous==null)return '<span class="muted">順位データなし</span>';
    if(current==null)return '<span><b>'+number(previous)+'位</b> → <span class="muted">圏外</span> <span class="down">↓</span></span>';
    if(previous==null)return '<span><span class="muted">圏外</span> → <b>'+number(current)+'位</b> <span class="up">↑</span></span>';
    const delta=Number(previous)-Number(current);
    if(delta===0)return '<span>'+number(current)+'位 <span class="flat">→</span></span>';
    const cls=delta>0?"up":"down";
    return '<span>'+number(previous)+'位 → <b>'+number(current)+'位</b> <span class="'+cls+'">'+(delta>0?"↑":"↓")+Math.abs(delta)+'</span></span>';
  };
  const simpleChangeText=(c, formatter)=>{
    if(!c||c.old==null||c.new==null)return '<span class="muted">前回値なし</span>';
    const oldText=formatter(c.old);
    const newText=formatter(c.new);
    if(String(c.old)===String(c.new))return '<span>'+esc(newText)+' <span class="flat">→</span></span>';
    return '<span>'+esc(oldText)+' → <b>'+esc(newText)+'</b></span>';
  };
  const powerChangeText=s=>{
    const c=s?.power_change;
    if(!c||c.old==null||c.new==null)return '<span class="muted">前回値なし</span>';
    const delta=Number(c.delta);
    const cls=delta>0?"up":delta<0?"down":"flat";
    const arrow=delta>0?"↑":delta<0?"↓":"→";
    return '<span>'+compact(c.old)+' → <b>'+compact(c.new)+'</b> <span class="'+cls+'">'+arrow+(delta===0?"":compact(Math.abs(delta)))+'</span></span>';
  };
  const fmtTime=ts=>ts?new Date(Number(ts)*1000).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"}):"-";
  async function load(){
    try{
      const r=await fetch("/api/player-watchlist",{cache:"no-store"});
      const d=await r.json();
      if(!r.ok||!d.ok)throw new Error(d.error||"読み込みに失敗しました");
      if(!d.watchlist.length){root.innerHTML='<div class="empty">ウォッチリストは空です。プレイヤー画面から追加できます。</div>';return;}
      root.innerHTML=d.watchlist.map(x=>{
        const s=x.summary||{};
        const powerChange=powerChangeText(s);
        const rankingChanges=Array.isArray(s.ranking_changes)?s.ranking_changes:[];
        const rankingRows=rankingChanges
          .filter(r=>r.current!=null||r.previous!=null)
          .map(r=>'<div class="ranking-row"><span class="label">'+esc(r.label)+'</span><span class="value">'+rankText(r)+'</span></div>')
          .join("") || '<div class="muted">ランキングデータなし</div>';
        return '<article class="item">'+
          '<div class="top">'+
            (x.avatar_url?'<img class="avatar" src="'+esc(x.avatar_url)+'" alt="">':'<div class="avatar"></div>')+
            '<div class="main"><div class="name">'+esc(x.nick_name||x.label||"Unknown Player")+'</div>'+
            '<div class="id">領主ID '+esc(x.governor_id)+'</div></div>'+
            '<span class="'+(x.enabled?"state":"state off")+'">'+(x.enabled?"監視中":"停止中")+'</span>'+
          '</div>'+
          '<div class="pill-row"><span class="pill">王国 '+esc(x.kid??"-")+'</span><span class="pill">'+(x.alliance_abbr?"【"+esc(x.alliance_abbr)+"】 ":"")+' '+esc(x.alliance_name||"-")+'</span></div>'+
          '<div class="stats">'+
            '<div class="stat"><span>戦力</span><b>'+esc(compact(x.power))+'</b></div>'+
            '<div class="stat"><span>役場</span><b>'+esc(x.town_center_level==null?"-":x.town_center_level)+'</b></div>'+
            '<div class="stat"><span>VIP</span><b>'+esc(x.vip??"-")+'</b></div>'+
            '<div class="stat"><span>撃破数</span><b>'+esc(compact(x.kills))+'</b></div>'+
            '<div class="stat"><span>最終観測</span><b>'+esc(fmtTime(x.observed_at))+'</b></div>'+
          '</div>'+
          '<div class="change-box"><div class="change-title">前回からの変化</div>'+
            '<div class="change-row"><span class="label">戦力</span><span class="value">'+powerChange+'</span></div>'+
            '<div class="change-row"><span class="label">役場</span><span class="value">'+simpleChangeText(s.town_center_change,c=>c==null?"-":String(c)+"")+'</span></div>'+
            '<div class="change-row"><span class="label">同盟</span><span class="value">'+simpleChangeText(s.alliance_change,c=>c==null?"-":String(c)+"")+'</span></div>'+
            '<div class="change-title" style="margin-top:12px">ランキング順位変動</div>'+
            '<div class="ranking-changes">'+rankingRows+'</div>'+
          '</div>'+
          '<div class="actions"><label class="compare-check"><input type="checkbox" class="compare-player" data-governor-id="'+esc(x.governor_id)+'"> 比較対象</label><a class="action primary" href="/player?governor_id='+encodeURIComponent(x.governor_id)+'">プレイヤー詳細</a><a class="action" href="/player/changes?governor_id='+encodeURIComponent(x.governor_id)+'">変更履歴</a><button class="action danger" data-g="'+esc(x.governor_id)+'">削除</button></div>'+
        '</article>';
      }).join("");
      const compareChecks=[...root.querySelectorAll(".compare-player")];
      const compareCount=document.getElementById("compare-count");
      const compareOpen=document.getElementById("compare-open");
      const selected=new Set();
      const preselect=new URLSearchParams(location.search).get("compare");
      function syncCompare(){
        compareCount.textContent=selected.size+" / 4人選択";
        compareOpen.disabled=selected.size<2;
        compareChecks.forEach(function(input){input.checked=selected.has(String(input.dataset.governorId));});
      }
      compareChecks.forEach(function(input){
        input.addEventListener("change",function(){
          const id=String(input.dataset.governorId||"");
          if(input.checked){
            if(selected.size>=4){input.checked=false;alert("比較できるのは最大4人です。");return;}
            selected.add(id);
          }else selected.delete(id);
          syncCompare();
        });
      });
      if(preselect && compareChecks.some(function(input){return String(input.dataset.governorId)===String(preselect);})){
        selected.add(String(preselect));
      }
      syncCompare();
      compareOpen.addEventListener("click",function(){
        if(selected.size<2)return;
        const q=new URLSearchParams();
        [...selected].forEach(function(id){q.append("governor_id",id);});
        location.href="/player/compare?"+q.toString();
      });
      root.querySelectorAll("[data-g]").forEach(b=>b.onclick=async()=>{
        if(!confirm("このプレイヤーをウォッチリストから削除しますか？"))return;
        b.disabled=true;
        try{
          const r=await fetch("/api/player-watchlist?governor_id="+encodeURIComponent(b.dataset.g),{method:"DELETE"});
          if(!r.ok)throw new Error("削除に失敗しました");
          await load();
        }catch(e){alert(e.message);b.disabled=false}
      });
    }catch(e){root.innerHTML='<div class="error">'+esc(e.message)+'</div>';}
  }
  load();
})();
</script></body></html>`);
}
async function handleKingdomWatchlistApi(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "list";

  if (request.method === "GET" && action === "list") {
    const rows = await env.DB.prepare(
      "SELECT watchlist_id, kid, top_n, interval_hours, enabled, last_run_at, last_success_at, last_error, created_at, updated_at FROM kingdom_watchlists WHERE discord_id = ? ORDER BY created_at DESC"
    ).bind(auth.discord_id).all();

    const watchlists = [];
    for (const watch of rows.results || []) {
      let job = await env.DB.prepare(
        "SELECT job_id, status, board_index, player_cursor, player_ids_json, observed_at, source_first_at, source_last_at, ranking_rows, player_rows, last_error, created_at, updated_at, completed_at FROM kingdom_watchlist_jobs WHERE watchlist_id = ? ORDER BY created_at DESC LIMIT 1"
      ).bind(watch.watchlist_id).first();

      // Recover jobs that are visibly stuck in an active state.
      // A failed ranking request used to leave the job as RANKINGS/PLAYERS,
      // which made the UI show "更新中" forever even after the error.
      if (job && (job.status === "RANKINGS" || job.status === "PLAYERS")) {
        const staleByError = Boolean(job.last_error);
        const staleByAge = Number(job.updated_at || job.created_at || 0) > 0 &&
          (Math.floor(Date.now() / 1000) - Number(job.updated_at || job.created_at)) > 15 * 60;
        if (staleByError || staleByAge) {
          const recoveryMessage = job.last_error
            ? String(job.last_error).slice(0, 1000)
            : "ウォッチリスト更新ジョブが15分以上進行していないため停止しました。";
          await env.DB.prepare(
            "UPDATE kingdom_watchlist_jobs SET status = 'FAILED', last_error = ?, updated_at = ? WHERE job_id = ? AND status IN ('RANKINGS','PLAYERS')"
          ).bind(recoveryMessage, Math.floor(Date.now() / 1000), job.job_id).run();
          job = { ...job, status: "FAILED", last_error: recoveryMessage };
        }
      }

      let playerCount = null;
      if (job?.player_ids_json) {
        try {
          const ids = JSON.parse(job.player_ids_json);
          if (Array.isArray(ids)) playerCount = ids.length;
        } catch {}
      }

      watchlists.push({
        ...watch,
        job: job ? {
          job_id: job.job_id,
          status: job.status,
          board_index: Number(job.board_index || 0),
          total_boards: KINGDOM_RANKING_BOARDS.length,
          player_cursor: Number(job.player_cursor || 0),
          player_count: playerCount,
          ranking_rows: Number(job.ranking_rows || 0),
          player_rows: Number(job.player_rows || 0),
          last_error: job.last_error || null,
          observed_at: Number(job.observed_at || 0),
          source_first_at: job.source_first_at ? Number(job.source_first_at) : null,
          source_last_at: job.source_last_at ? Number(job.source_last_at) : null,
          created_at: Number(job.created_at || 0),
          updated_at: Number(job.updated_at || 0),
          completed_at: job.completed_at ? Number(job.completed_at) : null
        } : null
      });
    }

    await trackServiceUsage(env, auth, "KINGDOM_WATCHLIST_VIEW", {
      metadata: {
        watchlist_count: watchlists.length,
        enabled_count: watchlists.filter(w => Number(w.enabled) === 1).length,
        top_n: watchlists.length === 1 ? Number(watchlists[0]?.top_n || 0) || null : null,
        interval_hours: watchlists.length === 1 ? Number(watchlists[0]?.interval_hours || 0) || null : null
      }
    });
    return json({ ok: true, watchlists });
  }

  if (request.method === "POST" && action === "create") {
    const body = await request.json().catch(() => ({}));
    const kidRaw = String(body.kid ?? "").trim();
    const topRaw = String(body.top_n ?? "").trim();
    const intervalRaw = String(body.interval_hours ?? "").trim();
    const kid = Number(kidRaw);
    const topN = Number(topRaw);
    const intervalHours = Number(intervalRaw);
    const invalidFields = [];
    if (!kidRaw || !Number.isInteger(kid) || kid < 1) invalidFields.push("kid");
    if (!topRaw || ![5, 10].includes(topN)) invalidFields.push("top_n");
    if (!intervalRaw || ![1, 3, 6, 12].includes(intervalHours)) invalidFields.push("interval_hours");
    if (invalidFields.length) {
      return json({
        ok: false,
        error: "INVALID_WATCHLIST_SETTINGS",
        message: "監視設定の値が不正です。",
        invalid_fields: invalidFields,
        received: { kid: body.kid ?? null, top_n: body.top_n ?? null, interval_hours: body.interval_hours ?? null }
      }, 400);
    }
    const limits = await getWatchlistLimits(env.DB);
    const role = String(auth.role || "BASIC").toUpperCase();
    const kingdomLimit = getRoleWatchlistLimit(limits, role, "kingdom");
    const usage = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM kingdom_watchlists WHERE discord_id = ? AND enabled = 1"
    ).bind(auth.discord_id).first();
    const used = Number(usage?.count || 0);
    if (kingdomLimit > 0 && used >= kingdomLimit) {
      return json({ ok: false, error: "KINGDOM_WATCHLIST_LIMIT_REACHED", message: "王国ウォッチリストの登録上限に達しています。", limit: kingdomLimit, used }, 409);
    }

    // Start the first watchlist fetch immediately after registration.
    // Reuse the same job/processing path as "今すぐ更新" instead of waiting
    // for the next Cron tick. The job remains resumable if one invocation
    // does not finish all ranking/player phases.
    await ensureKingdomWatchlistFreshnessSchema(env.DB);
    const now = Math.floor(Date.now() / 1000);
    const id = crypto.randomUUID();
    const inserted = await env.DB.prepare(
      "INSERT INTO kingdom_watchlists (watchlist_id, discord_id, kid, top_n, interval_hours, enabled, last_run_at, last_success_at, last_error, created_at, updated_at) " +
      "SELECT ?, ?, ?, ?, ?, 1, NULL, NULL, NULL, ?, ? " +
      "WHERE NOT EXISTS (SELECT 1 FROM kingdom_watchlists WHERE discord_id = ? AND kid = ? AND enabled = 1) " +
      "RETURNING watchlist_id"
    ).bind(id, auth.discord_id, kid, topN, intervalHours, now, now, auth.discord_id, kid).first();

    if (!inserted?.watchlist_id) {
      const existing = await env.DB.prepare(
        "SELECT watchlist_id, kid, top_n, interval_hours FROM kingdom_watchlists WHERE discord_id = ? AND kid = ? AND enabled = 1 ORDER BY created_at DESC LIMIT 1"
      ).bind(auth.discord_id, kid).first();
      return json({
        ok: false,
        error: "KINGDOM_WATCHLIST_ALREADY_EXISTS",
        message: "この王国はすでにウォッチリストへ登録されています。二重登録は実行されていません。",
        watchlist_id: existing?.watchlist_id || null
      }, 409);
    }

    const lockToken = await acquireKingdomWatchlistLock(env, id);
    if (!lockToken) {
      return json({
        ok: true,
        watchlist_id: id,
        initial_refresh_started: false,
        initial_refresh_status: "LOCKED"
      });
    }

    try {
      const jobId = crypto.randomUUID();
      await env.DB.prepare(
        "INSERT INTO kingdom_watchlist_jobs (job_id, watchlist_id, kid, top_n, status, board_index, player_cursor, player_ids_json, observed_at, source_first_at, source_last_at, ranking_rows, player_rows, created_at, updated_at) VALUES (?, ?, ?, ?, 'RANKINGS', 0, 0, '[]', ?, NULL, NULL, 0, 0, ?, ?)"
      ).bind(jobId, id, kid, topN, now, now, now).run();

      const job = {
        job_id: jobId,
        watchlist_id: id,
        kid,
        top_n: topN,
        status: "RANKINGS",
        board_index: 0,
        player_cursor: 0,
        player_ids_json: "[]",
        observed_at: now,
        source_first_at: null,
        source_last_at: null,
        ranking_rows: 0,
        player_rows: 0,
        created_at: now,
        updated_at: now
      };

      try {
        const result = await processKingdomWatchlistJob(env, job);
        if (result.completed) {
          await env.DB.prepare(
            "UPDATE kingdom_watchlists SET last_run_at = ?, last_success_at = ?, last_error = NULL, updated_at = ? WHERE watchlist_id = ?"
          ).bind(now, now, now, id).run();
        }
        await trackServiceUsage(env, auth, "KINGDOM_WATCHLIST_ADD", {
          targetType: "KINGDOM",
          targetId: kid,
          metadata: {
            top_n: topN,
            interval_hours: intervalHours,
            enabled: true
          }
        });
        return json({
          ok: true,
          watchlist_id: id,
          job_id: jobId,
          initial_refresh_started: true,
          initial_refresh_status: result.phase,
          result
        });
      } catch (error) {
        const message = String(error?.userMessage || error?.message || error).slice(0, 1000);
        await env.DB.prepare(
          "UPDATE kingdom_watchlist_jobs SET status = 'FAILED', last_error = ?, updated_at = ? WHERE job_id = ?"
        ).bind(message, now, jobId).run();
        await env.DB.prepare(
          "UPDATE kingdom_watchlists SET last_error = ?, updated_at = ? WHERE watchlist_id = ?"
        ).bind(message, now, id).run();
        await recordDiagnostic(env.DB, {
          service: "watchlist",
          feature: "kingdom_watchlist",
          operation: "INITIAL_REFRESH",
          status: "FAILED",
          errorCode: String(error?.code || message || "WATCHLIST_INITIAL_REFRESH_FAILED").split(":")[0],
          message,
          targetType: "WATCHLIST",
          targetId: id,
          metadata: { jobId, kid, poolAvailability: error?.poolAvailability || null }
        });
        console.error("kingdom_watchlist_initial_refresh_failed", id, message);
        return json({
          ok: true,
          watchlist_id: id,
          job_id: jobId,
          initial_refresh_started: true,
          initial_refresh_status: "FAILED",
          initial_refresh_error: message
        });
      }
    } finally {
      await releaseKingdomWatchlistLock(env, id, lockToken);
    }
  }

  if (request.method === "POST" && action === "refresh") {
    try {
      // Reuse the shared cached schema bootstrap so manual refresh does not
      // repeat DDL/metadata work on every request.
      await ensureKingdomWatchlistFreshnessSchema(env.DB);
      const body = await request.json().catch(() => ({}));
      const watchlistId = String(body.watchlist_id || "").trim();
      if (!watchlistId) return json({ ok: false, error: "WATCHLIST_ID_REQUIRED" }, 400);
  
      const now = Math.floor(Date.now() / 1000);
      // For continuation requests, authenticate the watchlist and find its active
      // job in one indexed lookup. The initial request may still need the watchlist
      // row when no active job exists.
      let active = await env.DB.prepare(
        "SELECT w.watchlist_id, w.kid, w.top_n, j.job_id, j.status, j.board_index, j.player_cursor, j.player_ids_json, j.observed_at, j.source_first_at, j.source_last_at, j.ranking_rows, j.player_rows, j.created_at, j.updated_at FROM kingdom_watchlists w LEFT JOIN kingdom_watchlist_jobs j ON j.watchlist_id = w.watchlist_id AND j.status IN ('RANKINGS','PLAYERS') WHERE w.watchlist_id = ? AND w.discord_id = ? ORDER BY j.created_at DESC LIMIT 1"
      ).bind(watchlistId, auth.discord_id).first();
      if (!active) {
        const latestJob = await env.DB.prepare(
          "SELECT status, last_error FROM kingdom_watchlist_jobs WHERE watchlist_id = ? ORDER BY created_at DESC LIMIT 1"
        ).bind(watchlistId).first();
        if (latestJob?.status === "FAILED" && String(latestJob.last_error || "").startsWith("USER_CANCELLED:")) {
          return json({
            ok: true,
            watchlist_id: watchlistId,
            status: "CANCELLED",
            result: { completed: false, cancelled: true, phase: "CANCELLED" }
          });
        }
        return json({ ok: false, error: "WATCHLIST_NOT_FOUND" }, 404);
      }
      const watch = { watchlist_id: active.watchlist_id, kid: active.kid, top_n: active.top_n };

      const lockToken = await acquireKingdomWatchlistLock(env, watchlistId);
      if (!lockToken) {
        return json({
          ok: false,
          error: "WATCHLIST_REFRESH_IN_PROGRESS",
          message: "この監視対象は現在更新中です。処理完了を待ってください。"
        }, 409);
      }

      try {
        let job = active.job_id ? {
          job_id: active.job_id,
          watchlist_id: active.watchlist_id,
          kid: Number(active.kid),
          top_n: Number(active.top_n),
          status: active.status,
          board_index: Number(active.board_index || 0),
          player_cursor: Number(active.player_cursor || 0),
          player_ids_json: active.player_ids_json || "[]",
          observed_at: Number(active.observed_at || 0),
          source_first_at: active.source_first_at ?? null,
          source_last_at: active.source_last_at ?? null,
          ranking_rows: Number(active.ranking_rows || 0),
          player_rows: Number(active.player_rows || 0),
          created_at: active.created_at,
          updated_at: active.updated_at
        } : null;
    
        if (!job) {
          const jobId = crypto.randomUUID();
          await env.DB.prepare(
            "INSERT INTO kingdom_watchlist_jobs (job_id, watchlist_id, kid, top_n, status, board_index, player_cursor, player_ids_json, observed_at, source_first_at, source_last_at, ranking_rows, player_rows, created_at, updated_at) VALUES (?, ?, ?, ?, 'RANKINGS', 0, 0, '[]', ?, NULL, NULL, 0, 0, ?, ?)"
          ).bind(jobId, watchlistId, watch.kid, watch.top_n, now, now, now).run();
          job = {
            job_id: jobId,
            watchlist_id: watchlistId,
            kid: Number(watch.kid),
            top_n: Number(watch.top_n),
            status: "RANKINGS",
            board_index: 0,
            player_cursor: 0,
            player_ids_json: "[]",
            observed_at: now,
            source_first_at: null,
            source_last_at: null,
            ranking_rows: 0,
            player_rows: 0,
            created_at: now,
            updated_at: now
          };
        }
    
        try {
          const result = await processKingdomWatchlistJob(env, job);
          if (result.completed) {
            await env.DB.prepare(
              "UPDATE kingdom_watchlists SET last_run_at = ?, last_success_at = ?, last_error = NULL, updated_at = ? WHERE watchlist_id = ?"
            ).bind(now, now, now, watchlistId).run();
          } else {
            // Intermediate continuation does not need a D1 write. The final
            // successful step clears last_error together with last_run_at.
          }
          await trackServiceUsage(env, auth, "KINGDOM_WATCHLIST_REFRESH", {
            targetType: "KINGDOM",
            targetId: watch.kid,
            metadata: {
              source: "MANUAL",
              refresh_scope: "WATCHLIST",
              top_n: watch.top_n
            }
          });
          return json({ ok: true, watchlist_id: watchlistId, job_id: job.job_id, status: result.phase, result });
        } catch (error) {
          const message = String(error?.userMessage || error?.message || error).slice(0, 1000);
          await env.DB.prepare(
            "UPDATE kingdom_watchlist_jobs SET status = 'FAILED', last_error = ?, updated_at = ? WHERE job_id = ?"
          ).bind(message, now, job.job_id).run();
          await env.DB.prepare(
            "UPDATE kingdom_watchlists SET last_error = ?, updated_at = ? WHERE watchlist_id = ?"
          ).bind(message, now, watchlistId).run();
          await recordDiagnostic(env.DB, {
            service: "watchlist",
            feature: "kingdom_watchlist",
            operation: "MANUAL_REFRESH",
            status: "FAILED",
            errorCode: String(error?.code || message || "WATCHLIST_REFRESH_FAILED").split(":")[0],
            message,
            targetType: "WATCHLIST",
            targetId: watchlistId,
            metadata: { jobId: job.job_id, source: "MANUAL", poolAvailability: error?.poolAvailability || null }
          });
          console.error("kingdom_watchlist_manual_refresh_failed", watchlistId, message);
          const responseError = error?.code === "NO_API_POOL_KEY_AVAILABLE"
            ? "NO_API_POOL_KEY_AVAILABLE"
            : "WATCHLIST_REFRESH_FAILED";
          return json({ ok: false, error: responseError, message, pool_availability: error?.poolAvailability || null }, responseError === "NO_API_POOL_KEY_AVAILABLE" ? 503 : 500);
        }
      } finally {
        await releaseKingdomWatchlistLock(env, watchlistId, lockToken);
      }
    } catch (error) {
      const message = String(error?.message || error).slice(0, 1000);
      console.error("kingdom_watchlist_refresh_internal_error", message);
      return json({ ok: false, error: "WATCHLIST_REFRESH_INTERNAL", message }, 500);
    }
  }

  if (request.method === "POST" && action === "cancel") {
    const body = await request.json().catch(() => ({}));
    const watchlistId = String(body.watchlist_id || "").trim();
    if (!watchlistId) return json({ ok: false, error: "WATCHLIST_ID_REQUIRED" }, 400);

    const now = Math.floor(Date.now() / 1000);
    const cancelMessage = "USER_CANCELLED: ユーザーが更新を中断しました。";
    const target = await env.DB.prepare(
      "SELECT watchlist_id, kid FROM kingdom_watchlists WHERE watchlist_id = ? AND discord_id = ? LIMIT 1"
    ).bind(watchlistId, auth.discord_id).first();
    if (!target) return json({ ok: false, error: "WATCHLIST_NOT_FOUND" }, 404);

    await env.DB.batch([
      env.DB.prepare(
        "UPDATE kingdom_watchlist_jobs SET status = 'FAILED', last_error = ?, updated_at = ? WHERE watchlist_id = ? AND status IN ('RANKINGS','PLAYERS')"
      ).bind(cancelMessage, now, watchlistId),
      env.DB.prepare(
        "UPDATE kingdom_watchlists SET last_run_at = ?, last_error = ?, updated_at = ? WHERE watchlist_id = ? AND discord_id = ?"
      ).bind(now, cancelMessage, now, watchlistId, auth.discord_id)
    ]);

    return json({
      ok: true,
      watchlist_id: watchlistId,
      cancelled: true,
      message: "現在実行中の更新を中断しました。現在処理中の1回分が完了後、次のステップには進みません。"
    });
  }

  if (request.method === "POST" && action === "toggle") {
    const body = await request.json().catch(() => ({}));
    const enabled = body.enabled ? 1 : 0;
    const watchlistId = String(body.watchlist_id || "");
    if (enabled) {
        const limits = await getWatchlistLimits(env.DB);
      const role = String(auth.role || "BASIC").toUpperCase();
      const limit = getRoleWatchlistLimit(limits, role, "kingdom");
      const usage = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM kingdom_watchlists WHERE discord_id = ? AND enabled = 1 AND watchlist_id <> ?"
      ).bind(auth.discord_id, watchlistId).first();
      const used = Number(usage?.count || 0);
      if (limit > 0 && used >= limit) {
        return json({ ok: false, error: "KINGDOM_WATCHLIST_LIMIT_REACHED", message: "王国ウォッチリストの登録上限に達しています。", limit, used }, 409);
      }
    }
    const targetWatch = await env.DB.prepare(
      "SELECT kid FROM kingdom_watchlists WHERE watchlist_id = ? AND discord_id = ? LIMIT 1"
    ).bind(watchlistId, auth.discord_id).first();
    await env.DB.prepare(
      "UPDATE kingdom_watchlists SET enabled = ?, updated_at = ? WHERE watchlist_id = ? AND discord_id = ?"
    ).bind(enabled, Math.floor(Date.now() / 1000), watchlistId, auth.discord_id).run();
    await trackServiceUsage(env, auth, enabled === 1 ? "KINGDOM_WATCHLIST_ADD" : "KINGDOM_WATCHLIST_REMOVE", {
      targetType: "KINGDOM",
      targetId: targetWatch?.kid ?? null,
      metadata: { enabled: enabled === 1 }
    });
    return json({ ok: true });
  }

  if (request.method === "DELETE") {
    const watchlistId = String(url.searchParams.get("watchlist_id") || "").trim();
    if (!watchlistId) return json({ ok: false, error: "WATCHLIST_ID_REQUIRED" }, 400);
    const target = await env.DB.prepare(
      "SELECT watchlist_id FROM kingdom_watchlists WHERE watchlist_id = ? AND discord_id = ? LIMIT 1"
    ).bind(watchlistId, auth.discord_id).first();
    if (!target) return json({ ok: false, error: "WATCHLIST_NOT_FOUND" }, 404);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM kingdom_watchlist_jobs WHERE watchlist_id = ?").bind(watchlistId),
      env.DB.prepare("DELETE FROM kingdom_watchlist_locks WHERE watchlist_id = ?").bind(watchlistId),
      env.DB.prepare("DELETE FROM kingdom_watchlists WHERE watchlist_id = ? AND discord_id = ?").bind(watchlistId, auth.discord_id)
    ]);
    await trackServiceUsage(env, auth, "KINGDOM_WATCHLIST_REMOVE", {
      targetType: "KINGDOM",
      targetId: target?.kid ?? null
    });
    return json({ ok: true });
  }

  return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
}
function getJapanStatusFilename(date = new Date()) {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `status(${values.year}${values.month}${values.day}-${values.hour}${values.minute}${values.second}).json`;
}

function getDiscordSupportConfigStatus(env, request) {
  const origin = new URL(request.url).origin;
  const fields = [
    ["DISCORD_CLIENT_ID", "Discord Client ID", false],
    ["DISCORD_CLIENT_SECRET", "Discord Client Secret", true],
    ["DISCORD_BOT_TOKEN", "Discord Bot Token", true],
    ["DISCORD_PUBLIC_KEY", "Discord Public Key", true],
    ["DISCORD_SUPPORT_GUILD_ID", "Support Server ID", false],
    ["DISCORD_SUPPORT_CATEGORY_ID", "Support Category ID", false],
    ["DISCORD_SUPPORT_ROLE_ID", "Support Role ID", false],
    ["DISCORD_SUPPORT_ARCHIVE_CATEGORY_ID", "Archive Category ID", false],
    ["EAGLEEYE_SESSION_SECRET", "EagleEye Session Secret", true]
  ];
  const items = Object.fromEntries(fields.map(([key, label, secret]) => {
    const configured = Boolean(String(env?.[key] || "").trim());
    return [key, { label, configured, secret, value: configured && !secret ? String(env[key]) : null }];
  }));
  return { ok:true, endpoint:origin + "/api/discord/interactions", items };
}

async function handleAdminDiagnosticsApi(request, env) {
  try {
    const guard = await requireAdmin(request, env);
    if (guard.error) return guard.error;
    const data = await getSystemDiagnostics(env.DB, { recentLimit: 100 });
    const discord = getDiscordSupportConfigStatus(env, request);
    const filename = getJapanStatusFilename();
    return new Response(JSON.stringify({ ok: true, ...data, discord }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=UTF-8",
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="${filename}"`
      }
    });
  } catch (error) {
    console.error("diagnostics_api_failed", error);
    return json({
      ok: false,
      error: "DIAGNOSTICS_READ_FAILED",
      message: String(error?.message || error),
      name: String(error?.name || "Error")
    }, 500);
  }
}

async function renderAdminDiagnosticsPage(request, env) {
  let guard;
  try {
    guard = await requireAdmin(request, env);
    if (guard.error) return guard.error;
  } catch (error) {
    console.error("diagnostics_page_auth_failed", error);
    return json({ ok: false, error: "DIAGNOSTICS_AUTH_FAILED", message: String(error?.message || error), name: String(error?.name || "Error") }, 500);
  }

  let data;
  try {
    data = await getSystemDiagnostics(env.DB, { recentLimit: 100 });
  } catch (error) {
    const message = String(error?.message || error);
    console.error("diagnostics_page_failed", message);
    return eagleEyeHtmlResponse(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>System Status | EagleEye</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f5f7;color:#1d1d1f;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text",system-ui,sans-serif}.wrap{max-width:760px;margin:auto;padding:48px 20px}.panel{background:#fff;border:1px solid #d2d2d7;border-radius:28px;padding:28px;box-shadow:0 4px 18px rgba(0,0,0,.05)}.icon{width:52px;height:52px;border-radius:50%;background:#ff3b30;color:#fff;display:grid;place-items:center;font-size:25px;font-weight:800}.eyebrow{margin-top:22px;color:#86868b;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.title{margin:7px 0;font-size:30px;letter-spacing:-.03em}.message{color:#6e6e73;line-height:1.6}.error{margin-top:20px;padding:14px 16px;background:#f5f5f7;border-radius:14px;color:#6e6e73;font-size:12px;word-break:break-word}.back{display:inline-block;margin-top:22px;color:#0071e3;text-decoration:none;font-weight:600}</style></head><body><main class="wrap"><section class="panel"><div class="icon">!</div><div class="eyebrow">EagleEye System Status</div><h1 class="title">システム状況を取得できません</h1><p class="message">診断データの読み込みに失敗しました。現在の状態を確認できるまで、エラー内容を保持しています。</p><div class="error">${escapeHtml(message)}</div><a class="back" href="/admin">管理画面へ戻る →</a></section></main></body></html>`);
  }

  const overall = data.overall;
  const state = overall === "SUCCESS" ? { label:"すべて正常", tone:"good", icon:"✓", note:"すべての監視対象サービスが正常に動作しています。" }
    : overall === "CRITICAL" ? { label:"主要サービスに障害", tone:"bad", icon:"!", note:"主要サービスの一部で障害が発生しています。詳細を確認してください。" }
    : { label:"一部注意", tone:"warn", icon:"i", note:"一部のサービスで注意または未診断の状態があります。" };

  const serviceState = (status) => status === "SUCCESS"
    ? {label:"正常",tone:"good",icon:"✓"}
    : status === "FAILED" ? {label:"障害",tone:"bad",icon:"!"}
    : status === "WARNING" ? {label:"注意",tone:"warn",icon:"!"}
    : {label:"未診断",tone:"neutral",icon:"—"};

  const services = data.services.map(s => {
    const st = serviceState(s.status);
    const when = s.last_event_at ? new Date(Number(s.last_event_at)*1000).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"}) : "未確認";
    return `<div class="service"><div class="service-icon ${st.tone}">${st.icon}</div><div class="service-main"><div class="service-name">${esc(s.label)}</div><div class="service-time">${esc(when)}</div></div><div class="service-state ${st.tone}">${st.label}</div></div>`;
  }).join("");

  function jsonBlock(value) {
    if (value == null) return "<span class='muted'>なし</span>";
    let text; try { text = JSON.stringify(value, null, 2); } catch { text = String(value); }
    return "<pre class='json'>"+esc(text)+"</pre>";
  }

  const discordConfig = getDiscordSupportConfigStatus(env, request);
  const discordRows = Object.entries(discordConfig.items).map(([key, item]) => {
    const status = item.configured ? "設定済み" : "未設定";
    const tone = item.configured ? "good" : "bad";
    const value = item.secret ? "" : (item.value || "—");
    return "<div class='discord-config-row'><div><b>"+esc(item.label)+"</b><small>"+esc(key)+"</small></div><div class='discord-config-value "+tone+"'>"+status+(value ? "<span>"+esc(value)+"</span>" : "")+"</div></div>";
  }).join("");

  const events = data.events.slice(0,40).map((e,index) => {
    const st = serviceState(e.status);
    const when = e.created_at ? new Date(Number(e.created_at)*1000).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"}) : "-";
    const shape = e.metadata?.rankingPayloadShape;
    const shapeHtml = shape ? "<details><summary>ランキングレスポンス構造を見る</summary>"+jsonBlock(shape)+"</details>" : "";
    const facts = (e.rows_received != null || e.rows_saved != null)
      ? "<div class='facts'>"+(e.rows_received != null ? "<span>受信 "+esc(e.rows_received)+"件</span>":"")+(e.rows_saved != null ? "<span>保存 "+esc(e.rows_saved)+"件</span>":"")+(e.elapsed_ms != null ? "<span>"+esc(e.elapsed_ms)+"ms</span>":"")+"</div>" : "";
    return "<details class='event' "+(index===0 && e.status==="FAILED" ? "open":"")+"><summary><span class='mini-icon "+st.tone+"'>"+st.icon+"</span><span class='event-title'>"+esc(e.feature)+"</span><span class='event-op'>"+esc(e.operation)+"</span><span class='event-time'>"+esc(when)+"</span></summary><div class='event-body'><div class='event-status "+st.tone+"'>"+st.label+(e.error_code?" · "+esc(e.error_code):"")+"</div><p>"+esc(e.message||"メッセージなし")+"</p>"+facts+"<div class='details-grid'><div><small>対象</small><b>"+esc((e.target_type||"-")+" "+(e.target_id||""))+"</b></div><div><small>Provider</small><b>"+esc(e.provider||"-")+"</b></div><div><small>Trace ID</small><b>"+esc(e.trace_id||"-")+"</b></div></div>"+shapeHtml+(e.metadata&&!shape?"<details><summary>メタデータを見る</summary>"+jsonBlock(e.metadata)+"</details>":"")+"</div></details>";
  }).join("") || "<div class='empty'>診断イベントはありません。</div>";

  return eagleEyeHtmlResponse(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="30"><title>システム状況 | EagleEye</title><style>
*{box-sizing:border-box}html{background:#f5f5f7}body{margin:0;background:#f5f5f7;color:#1d1d1f;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text",system-ui,sans-serif;-webkit-font-smoothing:antialiased}.wrap{max-width:860px;margin:auto;padding:20px 16px 50px}.nav{display:flex;align-items:center;justify-content:space-between;padding:4px 4px 22px}.back{color:#0071e3;text-decoration:none;font-size:14px;font-weight:600}.live{display:flex;align-items:center;gap:7px;color:#86868b;font-size:12px}.live-dot{width:7px;height:7px;border-radius:50%;background:#34c759}.hero{background:#fff;border-radius:28px;padding:30px 26px;border:1px solid #d2d2d7;box-shadow:0 6px 24px rgba(0,0,0,.05)}.hero-line{display:flex;align-items:center;gap:16px}.hero-icon{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;font-size:25px;font-weight:800}.hero-icon.good{background:#e8f8ed;color:#1b8a3e}.hero-icon.warn{background:#fff4d6;color:#b77900}.hero-icon.bad{background:#ffe9e7;color:#d70015}.hero-icon.neutral{background:#f2f2f7;color:#6e6e73}.eyebrow{color:#86868b;font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase}.hero h1{margin:3px 0 0;font-size:30px;letter-spacing:-.035em}.note{margin:20px 0 0;color:#6e6e73;line-height:1.55}.stats{display:grid;grid-template-columns:repeat(4,1fr);margin-top:24px;border-top:1px solid #e5e5ea;padding-top:20px}.stat{text-align:center;border-right:1px solid #e5e5ea}.stat:last-child{border-right:0}.stat b{display:block;font-size:22px;letter-spacing:-.03em}.stat span{display:block;margin-top:4px;color:#86868b;font-size:11px}.section{margin-top:28px}.section-head{display:flex;align-items:end;justify-content:space-between;padding:0 5px 10px}.section-head h2{margin:0;font-size:20px;letter-spacing:-.02em}.section-head span{color:#86868b;font-size:11px}.card{background:#fff;border:1px solid #d2d2d7;border-radius:22px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,.035)}.service{display:flex;align-items:center;gap:13px;padding:16px 18px;border-bottom:1px solid #e5e5ea}.service:last-child{border-bottom:0}.service-icon,.mini-icon{flex:0 0 auto;width:27px;height:27px;border-radius:50%;display:grid;place-items:center;font-size:13px;font-weight:800}.service-main{flex:1;min-width:0}.service-name{font-size:15px;font-weight:650}.service-time{margin-top:3px;color:#86868b;font-size:11px}.service-state{font-size:12px;font-weight:700}.good{color:#1b8a3e}.warn{color:#b77900}.bad{color:#d70015}.neutral{color:#6e6e73}.event{border-bottom:1px solid #e5e5ea}.event:last-child{border-bottom:0}.event summary{list-style:none;cursor:pointer;padding:16px 18px;display:flex;align-items:center;gap:10px}.event summary::-webkit-details-marker{display:none}.event-title{font-size:14px;font-weight:650}.event-op{color:#86868b;font-size:11px}.event-time{margin-left:auto;color:#86868b;font-size:11px;text-align:right}.event-body{padding:0 18px 18px}.event-status{font-size:12px;font-weight:700}.event-body p{margin:9px 0 14px;color:#6e6e73;font-size:13px;line-height:1.6;word-break:break-word}.facts{display:flex;gap:7px;flex-wrap:wrap;margin:8px 0 14px}.facts span{padding:6px 9px;background:#f5f5f7;border-radius:9px;color:#6e6e73;font-size:11px}.details-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.details-grid div{background:#f5f5f7;border-radius:11px;padding:9px}.discord-config-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 16px;border-bottom:1px solid #e5e5ea}.discord-config-row:last-child{border-bottom:0}.discord-config-row b{display:block;font-size:12px}.discord-config-row small{display:block;margin-top:3px;color:#86868b;font-size:9px}.discord-config-value{text-align:right;font-size:11px;font-weight:800}.discord-config-value span{display:block;margin-top:3px;color:#6e6e73;font-size:9px;font-weight:500;word-break:break-all;max-width:260px}.details-grid small{display:block;color:#86868b;font-size:10px}.details-grid b{display:block;margin-top:3px;font-size:11px;word-break:break-all}.event details{margin-top:10px;border-top:1px solid #e5e5ea}.event details summary{padding:11px 0;font-size:11px;color:#0071e3}.json{margin:0;padding:12px;background:#1d1d1f;color:#f5f5f7;border-radius:12px;max-height:360px;overflow:auto;white-space:pre-wrap;word-break:break-word;font-size:10px;line-height:1.5}.empty{padding:28px;text-align:center;color:#86868b;font-size:13px}.footer{display:flex;justify-content:space-between;gap:12px;margin:18px 4px;color:#86868b;font-size:11px}.footer a{color:#0071e3;text-decoration:none}@media(max-width:600px){.wrap{padding:12px 10px 40px}.hero{padding:23px 18px;border-radius:22px}.hero h1{font-size:25px}.stats{grid-template-columns:repeat(2,1fr);gap:14px}.stat{border-right:0}.stat:nth-child(-n+2){padding-bottom:3px;border-bottom:1px solid #e5e5ea}.service{padding:14px}.service-time{font-size:10px}.event summary{padding:14px}.event-op{display:none}.event-time{font-size:10px}.details-grid{grid-template-columns:1fr}.footer{flex-direction:column}}
</style></head><body><main class="wrap"><nav class="nav"><a class="back" href="/admin">‹ 管理画面</a><div class="live"><span class="live-dot"></span>30秒ごとに自動更新</div></nav><section class="hero"><div class="hero-line"><div class="hero-icon ${state.tone}">${state.icon}</div><div><div class="eyebrow">EagleEye System Status</div><h1>${state.label}</h1></div></div><p class="note">${state.note}</p><div class="stats"><div class="stat"><b>${data.counts.healthy}</b><span>正常</span></div><div class="stat"><b>${data.counts.warning}</b><span>注意</span></div><div class="stat"><b>${data.counts.failed}</b><span>障害</span></div><div class="stat"><b>${data.counts.unknown}</b><span>未診断</span></div></div></section><section class="section"><div class="section-head"><h2>サービス</h2><span>${data.services.length}項目</span></div><div class="card">${services}</div></section><section class="section"><div class="section-head"><h2>Discord Support 設定</h2><span>秘密情報は非表示</span></div><div class="card"><div class="discord-config-row"><div><b>Interactions Endpoint</b><small>Discord Developer Portal に設定するURL</small></div><div class="discord-config-value good"><span>${esc(discordConfig.endpoint)}</span></div></div>${discordRows}</div></section><section class="section"><div class="section-head"><h2>最近の診断</h2><span>最新40件</span></div><div class="card">${events}</div></section><footer class="footer"><span>EagleEye Diagnostics</span><a href="/admin">管理画面へ戻る</a></footer></main></body></html>`);
}

async function renderMightPulseResearchPage(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return "<!doctype html><html lang='ja'><body style='background:#0f172a;color:white;font-family:system-ui;padding:32px'><h1>管理者権限が必要です</h1></body></html>";
  return `<!doctype html><html lang='ja'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>MightPulse Research Lab | EagleEye</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.wrap{max-width:900px;margin:auto;padding:26px 14px 48px}.back{color:#94a3b8;text-decoration:none}.eyebrow{margin-top:24px;color:#f59e0b;font-size:11px;font-weight:900;letter-spacing:2px}.title{font-size:30px;margin:5px 0}.sub{color:#94a3b8;line-height:1.7;font-size:13px}.card{margin-top:14px;padding:16px;border:1px solid #334155;border-radius:16px;background:#162238}.field{display:grid;gap:6px}.field label{font-size:12px;font-weight:800;color:#cbd5e1}.field input{width:100%;padding:12px;border-radius:10px;border:1px solid #475569;background:#0b1220;color:#f8fafc}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.actions button,.candidate-grid button{border:1px solid #475569;border-radius:10px;background:#0f172a;color:#e2e8f0;padding:10px 12px;font-weight:800;cursor:pointer}.actions .primary{background:#f59e0b;color:#111827;border-color:#f59e0b}.candidate-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:12px}.result{margin-top:14px}.row{padding:12px;border-top:1px solid #334155}.ok{color:#86efac}.bad{color:#fca5a5}.muted{color:#94a3b8}.mono{font-family:ui-monospace,SFMono-Regular,monospace;font-size:11px;word-break:break-word}.pill{display:inline-block;padding:4px 7px;border-radius:999px;background:#0f2a1c;color:#86efac;margin:2px;font-size:10px}.note{padding:12px;border-radius:10px;background:#111c30;color:#cbd5e1;font-size:12px;line-height:1.6}@media(max-width:600px){.candidate-grid{grid-template-columns:1fr 1fr}.title{font-size:26px}}</style></head><body><main class='wrap'><a class='back' href='/admin'>← ADMIN CONTROL</a><div class='eyebrow'>MIGHTPULSE RESEARCH LAB</div><h1 class='title'>未公開データ候補の構造調査</h1><p class='sub'>公開API仕様に掲載されていない可能性があるinclude候補を、既存の認証済みPlayer APIに対して検証します。APIキー本体・生レスポンスは表示・保存しません。</p><div class='card'><div class='field'><label>Governor ID</label><input id='governorId' inputmode='numeric' placeholder='例: 225623582'></div><div class='actions'><button class='primary' id='all'>全候補を調査</button></div><div class='candidate-grid'><button type='button' data-candidate='pet'>pet</button><button type='button' data-candidate='pets'>pets</button><button type='button' data-candidate='mail'>mail</button><button type='button' data-candidate='messages'>messages</button><button type='button' data-candidate='inbox'>inbox</button><button type='button' data-candidate='record'>record</button><button type='button' data-candidate='records'>records</button><button type='button' data-candidate='battle'>battle</button><button type='button' data-candidate='battles'>battles</button><button type='button' data-candidate='battle_report'>battle_report</button><button type='button' data-candidate='battle_reports'>battle_reports</button><button type='button' data-candidate='combat'>combat</button><button type='button' data-candidate='combat_report'>combat_report</button><button type='button' data-candidate='combat_reports'>combat_reports</button><button type='button' data-candidate='report'>report</button><button type='button' data-candidate='reports'>reports</button><button type='button' data-candidate='event'>event</button><button type='button' data-candidate='events'>events</button><button type='button' data-candidate='history'>history</button><button type='button' data-candidate='activity'>activity</button></div></div><div class='card result'><div id='status' class='muted'>調査対象を選択してください。</div><div id='results'></div></div><div class='card'><div class='note'>これは認証済みPlayer APIで受け付けられる追加includeの有無とレスポンス構造を観測する研究機能です。未公開Endpointへの認証回避やアクセス制御突破は行いません。</div></div></main><script>(function(){function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}function draw(r){var el=document.getElementById('results');var rows=Array.isArray(r)?r:[r];el.innerHTML=rows.map(function(x){if(!x.ok){return '<div class="row bad"><b>'+esc(x.candidate)+'</b> · '+esc(x.error||'ERROR')+' · HTTP '+esc(x.status||0)+'<div>'+esc(x.message||'')+'</div></div>';}return '<div class="row"><b class="ok">'+esc(x.candidate)+'</b> · HTTP '+esc(x.http_status)+' · '+esc(x.elapsed_ms)+'ms<br><span class="mono">include='+esc(x.requested_include)+'</span><div style="margin-top:7px">'+(x.sections||[]).map(function(v){return '<span class="pill">'+esc(v)+'</span>'}).join('')+'</div><div class="muted" style="margin-top:6px">top-level: '+esc((x.payload_keys||[]).join(', ')||'-')+' / player: '+esc((x.player_keys||[]).join(', ')||'-')+'</div></div>';}).join('');}async function run(candidate,all){var id=document.getElementById('governorId').value.trim();if(!id){document.getElementById('status').innerHTML='<span class="bad">Governor IDを入力してください。</span>';return;}document.getElementById('status').textContent=all?'全候補を調査中…':'調査中: '+candidate;try{var q=new URLSearchParams({governor_id:id});if(all)q.set('all','1');else q.set('candidate',candidate);var r=await fetch('/api/admin/mightpulse-research?'+q.toString(),{cache:'no-store',credentials:'same-origin'});var d=await r.json();if(!r.ok||!d.ok)throw new Error(d.message||d.error||('HTTP '+r.status));draw(all?d.results:d.result);document.getElementById('status').innerHTML='<span class="ok">調査完了。結果はこのブラウザには保存していません。</span>';}catch(e){document.getElementById('status').innerHTML='<span class="bad">調査失敗: '+esc(e.message||e)+'</span>';}}document.querySelectorAll('[data-candidate]').forEach(function(b){b.onclick=function(){run(b.getAttribute('data-candidate'),false)}});document.getElementById('all').onclick=function(){if(confirm('20候補を順番に調査します。MightPulse APIリクエストを最大20回使用します。実行しますか？'))run('',true)};})();</script></body></html>`;
}
function stableJsonForProbe(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(stableJsonForProbe);
  if (typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stableJsonForProbe(value[key]);
    return out;
  }
  return value;
}

async function sha256HexForProbe(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(stableJsonForProbe(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function collectMightPulseTimestampFields(value, path = "", depth = 0, output = []) {
  if (depth > 7 || output.length >= 120 || value === null || value === undefined) return output;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length && output.length < 120; i++) {
      collectMightPulseTimestampFields(value[i], path + "[" + i + "]", depth + 1, output);
    }
    return output;
  }
  if (typeof value !== "object") return output;
  for (const [key, child] of Object.entries(value)) {
    if (output.length >= 120) break;
    const childPath = path ? path + "." + key : key;
    const keyLooksTemporal = /(?:cached|observed|updated|created|modified|timestamp|time|date|active|login|endtime|opened_on|refresh)/i.test(key);
    if (keyLooksTemporal && (typeof child === "string" || typeof child === "number")) {
      const normalized = normalizeMightPulseTimestamp(child);
      if (normalized !== null) {
        output.push({ path: childPath, raw: child, unix: normalized, iso: new Date(normalized * 1000).toISOString() });
      }
    }
    if (child && typeof child === "object") {
      collectMightPulseTimestampFields(child, childPath, depth + 1, output);
    }
  }
  return output;
}

function getMightPulseProbePlayerActivity(payload) {
  const player = payload?.player;
  if (!player || typeof player !== "object") return null;
  const result = {};
  for (const key of ["last_active_at", "last_login", "online"]) {
    if (!Object.prototype.hasOwnProperty.call(player, key)) {
      result[key] = { present: false, raw: null, unix: null, iso: null };
      continue;
    }
    const raw = player[key];
    const unix = key === "online" ? null : normalizeMightPulseTimestamp(raw);
    result[key] = {
      present: true,
      raw,
      unix,
      iso: unix !== null ? new Date(unix * 1000).toISOString() : null
    };
  }
  return result;
}

function mightPulseProbeHeaders(headers) {
  const names = [
    "date", "age", "etag", "last-modified", "cache-control", "expires",
    "cf-cache-status", "cf-ray", "x-cache", "via",
    "x-ratelimit-remaining", "x-ratelimit-day-remaining", "content-age", "vary"
  ];
  const result = {};
  for (const name of names) {
    const value = headers?.get?.(name);
    if (value !== null && value !== undefined && value !== "") result[name] = value;
  }
  return result;
}

function mightPulseProbeRequestSpec(type, { governorId, kid, board, include }) {
  if (type === "PLAYER") {
    const id = String(governorId || "").trim();
    if (!id) {
      const error = new Error("GOVERNOR_ID_REQUIRED");
      error.code = "GOVERNOR_ID_REQUIRED";
      error.status = 400;
      throw error;
    }
    const selectedInclude = ["base", "base,ranks", "base,heroes,ranks,gov_gear"].includes(include) ? include : "base";
    return {
      targetType: "PLAYER",
      targetId: id,
      endpoint: "/players/:governor_id",
      path: "/players/" + encodeURIComponent(id),
      query: { include: selectedInclude },
      label: "Player " + selectedInclude
    };
  }

  const kingdomId = String(kid || "").trim();
  if (!/^\d+$/.test(kingdomId)) {
    const error = new Error("INVALID_KID");
    error.code = "INVALID_KID";
    error.status = 400;
    throw error;
  }

  if (type === "KINGDOM") {
    return {
      targetType: "KINGDOM",
      targetId: kingdomId,
      endpoint: "/kingdoms/:kid",
      path: "/kingdoms/" + encodeURIComponent(kingdomId),
      query: {},
      label: "Kingdom"
    };
  }

  const selectedBoard = String(board || "").trim();
  if (!KINGDOM_RANKING_BOARDS.includes(selectedBoard)) {
    const error = new Error("INVALID_BOARD");
    error.code = "INVALID_BOARD";
    error.status = 400;
    throw error;
  }

  return {
    targetType: "KINGDOM",
    targetId: kingdomId,
    endpoint: "/kingdoms/:kid/ranks",
    path: "/kingdoms/" + encodeURIComponent(kingdomId) + "/ranks",
    query: { board: selectedBoard, limit: 20 },
    label: "Kingdom Ranking " + selectedBoard
  };
}

async function fetchMightPulseProbeThroughPool(env, spec) {
  configureApiPoolEncryption(env.EAGLEEYE_SESSION_SECRET);
  let lease = null;
  let poolType = null;

  try {
    const automaticPoolTypes = ["SYSTEM_WATCHLIST", "SYSTEM_GENERAL", "USER_CONTRIBUTED"];
    lease = await leaseApiKey(env.DB, {
      poolTypes: automaticPoolTypes,
      purpose: "MIGHTPULSE_PROBE",
      targetType: spec.targetType,
      targetId: spec.targetId
    });
    poolType = lease.pool_type;

    const requestStartedAt = Date.now();
    const result = await mightPulseFetch(env, spec.path, { query: spec.query, apiKey: lease.api_key });
    const responseReceivedAt = Date.now();
    const payload = result?.data ?? null;

    const responseHash = await sha256HexForProbe(payload);
    const sectionHashes = {};
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      for (const key of ["player", "heroes", "ranks", "gov_gear", "kingdom", "boards", "leaderboards"]) {
        if (payload[key] !== undefined) sectionHashes[key] = await sha256HexForProbe(payload[key]);
      }
    }

    const cachedAt = normalizeMightPulseTimestamp(payload?.cached_at);
    const timestampFields = collectMightPulseTimestampFields(payload);
    const playerActivity = getMightPulseProbePlayerActivity(payload);
    const headers = mightPulseProbeHeaders(result.headers);

    await recordApiPoolSuccess(env.DB, {
      keyId: lease.key_id,
      leaseId: lease.lease_id,
      poolType: lease.pool_type,
      endpoint: spec.endpoint,
      targetType: spec.targetType,
      targetId: spec.targetId,
      purpose: "MIGHTPULSE_PROBE",
      httpStatus: result.status,
      remainingMinute: parseHeaderNumber(result.headers, "x-ratelimit-remaining"),
      remainingDay: parseHeaderNumber(result.headers, "x-ratelimit-day-remaining")
    });

    return {
      ok: true,
      probe: {
        request_id: crypto.randomUUID(),
        type: spec.label,
        target_type: spec.targetType,
        target_id: spec.targetId,
        endpoint: spec.endpoint,
        request_path: spec.path,
        query: spec.query,
        pool_type: poolType,
        http_status: result.status,
        request_started_at_iso: new Date(requestStartedAt).toISOString(),
        response_received_at_iso: new Date(responseReceivedAt).toISOString(),
        elapsed_ms: responseReceivedAt - requestStartedAt,
        server_now_unix: Math.floor(responseReceivedAt / 1000),
        fresh: payload?.fresh ?? null,
        cached_at: payload?.cached_at ?? null,
        cached_at_unix: cachedAt,
        cached_at_iso: cachedAt ? new Date(cachedAt * 1000).toISOString() : null,
        age_seconds: payload?.age_seconds ?? null,
        player_activity: playerActivity,
        headers,
        payload_keys: payload && typeof payload === "object" && !Array.isArray(payload) ? Object.keys(payload) : [],
        timestamp_like_fields: timestampFields,
        response_sha256: responseHash,
        section_sha256: sectionHashes
      }
    };
  } catch (error) {
    if (lease) {
      const status = Number(error?.status || 0);
      const cooldown = status === 429 ? 60 : status >= 500 || error?.code === "MIGHTPULSE_TIMEOUT" || error?.code === "MIGHTPULSE_NETWORK_ERROR" ? 15 : 0;
      const disable = status === 401 || status === 403;
      const keepAvailable = !disable && cooldown === 0 && (status === 400 || status === 404);
      await recordApiPoolFailure(env.DB, {
        keyId: lease.key_id,
        leaseId: lease.lease_id,
      poolType: lease.pool_type,
        endpoint: spec.endpoint,
        targetType: spec.targetType,
        targetId: spec.targetId,
        purpose: "MIGHTPULSE_PROBE",
        httpStatus: status,
        errorCode: error?.code || "MIGHTPULSE_REQUEST_FAILED",
        errorMessage: error?.message || null,
        cooldownSeconds: cooldown,
        disable,
        keepAvailable
      });
    }
    throw error;
  }
}

async function handleMightPulseResearchApi(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  const url = new URL(request.url);
  const governorId = String(url.searchParams.get("governor_id") || "").trim();
  const candidate = String(url.searchParams.get("candidate") || "").trim().toLowerCase();
  const all = url.searchParams.get("all") === "1";
  if (!governorId) return json({ ok: false, error: "GOVERNOR_ID_REQUIRED" }, 400);
  const apiLockKey = "ADMIN_MIGHTPULSE_RESEARCH:"+String(governorId)+":"+(all?"ALL":candidate);
  const apiLockToken = await acquireApiRequestLock(env, apiLockKey);
  if (!apiLockToken) return json({ ok: false, error: "API_REQUEST_IN_PROGRESS", message: "同じ対象への処理が現在実行中です。完了を待ってから再試行してください。", lock_key: apiLockKey }, 409);
  try {
  try {
    if (all) {
      const results = [];
      for (const item of MIGHTPULSE_RESEARCH_CANDIDATES) {
        try { results.push(await runMightPulseResearch(env, { governorId, candidate: item })); }
        catch (error) { results.push({ ok:false, candidate:item, error:error?.code||"MIGHTPULSE_RESEARCH_FAILED", status:Number(error?.status||0), message:error?.message||null }); }
      }
      return json({ ok:true, governor_id:governorId, candidate_count:results.length, results });
    }
    if (!candidate) return json({ ok:false, error:"RESEARCH_CANDIDATE_REQUIRED", candidates:MIGHTPULSE_RESEARCH_CANDIDATES },400);
    return json({ ok:true, governor_id:governorId, result:await runMightPulseResearch(env,{ governorId, candidate }) });
  } catch (error) {
    return json({ ok:false, error:error?.code||"MIGHTPULSE_RESEARCH_FAILED", status:Number(error?.status||0), message:error?.message||null }, error?.status>=400&&error?.status<600?error.status:502);
  }

  } finally {
    await releaseApiRequestLock(env, apiLockKey, apiLockToken);
  }
}

async function handleMightPulseProbeApi(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  const url = new URL(request.url);
  const type = String(url.searchParams.get("type") || "PLAYER").trim().toUpperCase();
  const governorId = String(url.searchParams.get("governor_id") || "").trim();
  const kid = String(url.searchParams.get("kid") || "").trim();
  const board = String(url.searchParams.get("board") || "").trim();
  const include = String(url.searchParams.get("include") || "base").trim();
  const apiLockKey = "ADMIN_MIGHTPULSE_PROBE:"+type+":"+String(governorId||kid||"")+":"+String(board||"")+":"+include;
  const apiLockToken = await acquireApiRequestLock(env, apiLockKey);
  if (!apiLockToken) return json({ ok: false, error: "API_REQUEST_IN_PROGRESS", message: "同じ対象への処理が現在実行中です。完了を待ってから再試行してください。", lock_key: apiLockKey }, 409);
  try {

  try {
    const spec = mightPulseProbeRequestSpec(type, { governorId, kid, board, include });
    return json(await fetchMightPulseProbeThroughPool(env, spec));
  } catch (error) {
    const status = Number(error?.status || 0);
    return json({
      ok: false,
      error: error?.code || "MIGHTPULSE_PROBE_FAILED",
      status,
      message: error?.message || null,
      diagnostic: error?.details || null
    }, status >= 400 && status < 600 ? status : 502);
  }

  } finally {
    await releaseApiRequestLock(env, apiLockKey, apiLockToken);
  }
}

async function renderMightPulseProbePage(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) {
    return "<!doctype html><html lang='ja'><body style='background:#0f172a;color:#fff;font-family:system-ui;padding:32px'><h1>ADMIN権限が必要です</h1><a href='/' style='color:#f59e0b'>EagleEyeへ戻る</a></body></html>";
  }

  const boardOptions = KINGDOM_RANKING_BOARDS.map(board => "<option value='" + escapeHtml(board) + "'>" + escapeHtml(RANKING_BOARD_LABELS[board] || board) + "</option>").join("");

  return "<!doctype html><html lang='ja'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><meta name='color-scheme' content='dark'><title>MightPulse Probe | EagleEye</title>" +
  "<style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.wrap{max-width:980px;margin:auto;padding:24px 14px 50px}.top{display:flex;justify-content:space-between;gap:12px;align-items:center}.back{color:#94a3b8;text-decoration:none}.badge{padding:6px 9px;border:1px solid #f59e0b;border-radius:999px;color:#fbbf24;background:#241a08;font-size:11px;font-weight:900}.card{margin-top:14px;padding:16px;border:1px solid #334155;border-radius:16px;background:#162238}.hint{color:#94a3b8;font-size:12px;line-height:1.65}.form{display:grid;grid-template-columns:1fr 1fr;gap:10px}.field{display:grid;gap:6px}.field input,.field select{width:100%;padding:12px;border-radius:10px;border:1px solid #475569;background:#0b1220;color:#fff}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.btn{padding:12px 15px;border:0;border-radius:10px;background:#f59e0b;color:#111827;font-weight:900}.btn.secondary{background:#334155;color:#e2e8f0}.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;word-break:break-all}.kv{display:grid;grid-template-columns:180px minmax(0,1fr);gap:7px 10px}.kv b{color:#94a3b8;font-size:11px}.kv span{font-size:12px;word-break:break-word}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:720px}th,td{padding:8px;border-bottom:1px solid #334155;text-align:left;font-size:11px;vertical-align:top}th{color:#94a3b8}.ok{color:#86efac}.error{color:#fca5a5}.pill{display:inline-block;padding:3px 6px;border-radius:7px;background:#0b1220;margin:2px}.small{font-size:10px;color:#94a3b8}@media(max-width:600px){.wrap{padding:18px 10px 40px}.form{grid-template-columns:1fr}.kv{grid-template-columns:1fr;gap:2px}.kv b{margin-top:8px}table{min-width:620px}}</style></head><body><main class='wrap'>" +
  "<div class='top'><a class='back' href='/admin'>← ADMIN CONTROL</a><div class='badge'>ADMIN / OWNER · PROBE</div></div>" +
  "<h1>MightPulse Probe</h1><p class='hint'>MightPulseのレスポンス時刻・HTTPキャッシュヘッダー・cached_at / age_seconds / fresh・タイムスタンプ候補を比較するための診断画面です。APIキー本体や生レスポンスは表示・保存しません。</p>" +
  "<div class='card'><h2>1. 対象を指定</h2><div class='form'>" +
  "<label class='field'><span>Player 領主ID</span><input id='governorId' inputmode='numeric' placeholder='例: 223636495'></label>" +
  "<label class='field'><span>Kingdom 王国番号</span><input id='kid' inputmode='numeric' placeholder='例: 1524'></label>" +
  "<label class='field'><span>Player include</span><select id='include'><option value='base'>base</option><option value='base,ranks'>base,ranks</option><option value='base,heroes,ranks,gov_gear'>base,heroes,ranks,gov_gear</option></select></label>" +
  "<label class='field'><span>Kingdom ranking</span><select id='board'>" + boardOptions + "</select></label>" +
  "</div><div class='actions'><button class='btn' data-type='PLAYER'>Playerを取得</button><button class='btn secondary' data-type='KINGDOM'>Kingdomを取得</button><button class='btn secondary' data-type='KINGDOM_RANKING'>Kingdom Rankingを取得</button><button class='btn secondary' id='clearHistory' type='button'>履歴クリア</button></div><div id='status' class='hint'></div></div>" +
  "<div id='latest'></div><div class='card'><h2>Probe履歴</h2><div class='hint'>同じ対象を時間を空けて再取得し、cached_at・age_seconds・レスポンスハッシュ・HTTPヘッダーを比較してください。履歴はこのブラウザのlocalStorageだけに保持します。</div><div class='table-wrap'><table><thead><tr><th>時刻</th><th>Type</th><th>fresh</th><th>cached_at</th><th>age_seconds</th><th>HTTP</th><th>elapsed</th><th>hash</th></tr></thead><tbody id='history'></tbody></table></div></div>" +
  `<script>(function(){var key='eagleeye_mightpulse_probe_history_v1';function esc(v){return String(v==null?'':v).replace(/[&<>\"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[m]||m;});}function read(){try{return JSON.parse(localStorage.getItem(key)||'[]');}catch(e){return [];}}function write(rows){try{localStorage.setItem(key,JSON.stringify(rows.slice(0,30)));}catch(e){}}function draw(){var rows=read();document.getElementById('history').innerHTML=rows.map(function(p){return '<tr><td>'+new Date(p.client_received_at||0).toLocaleString('ja-JP')+'</td><td>'+esc(p.type)+'<br><span class=\"small\">'+esc(p.target_id)+'</span></td><td>'+esc(p.fresh==null?'-':p.fresh)+'</td><td>'+esc(p.cached_at||'-')+'</td><td>'+esc(p.age_seconds==null?'-':p.age_seconds)+'</td><td>'+esc(p.http_status)+'</td><td>'+esc(p.elapsed_ms)+' ms</td><td class=\"mono\">'+esc(String(p.hash||'').slice(0,16))+'…</td></tr>';}).join('')||'<tr><td colspan=\"8\" class=\"small\">まだProbe結果がありません。</td></tr>';}function compareProbe(p, previous){
  if(!previous) return {title:"比較対象なし",tone:"muted",items:["同じ対象・同じProbe種別の過去結果がありません。まず同条件で2回以上取得してください。"]};
  var items=[];
  var cachedSame=String(previous.cached_at||"")===String(p.cached_at||"");
  var agePrev=Number(previous.age_seconds), ageNow=Number(p.age_seconds);
  var ageDelta=Number.isFinite(agePrev)&&Number.isFinite(ageNow)?ageNow-agePrev:null;
  var hashChanged=String(previous.hash||"")!==String(p.response_sha256||"");
  var prevReceived=Number(previous.client_received_at||0);
  var elapsedSince=prevReceived?((Number(p.client_received_at||Date.now())-prevReceived)/1000):null;
  if(cachedSame && hashChanged) items.push("cached_atは同じですがResponse SHA-256が変化しています。cached_atを元データ観測時刻とみなせるか要追加検証。");
  if(cachedSame && ageDelta!==null && elapsedSince!==null && ageDelta>0) items.push("cached_at固定 + age_seconds増加を観測。MightPulse側キャッシュの経過時間を示している可能性があります。");
  if(!cachedSame) items.push("cached_atが前回から変化。キャッシュ更新または別データ時点の可能性があります。");
  if(!hashChanged) items.push("Response SHA-256は同一。レスポンス内容に変化はありません。");
  if(!items.length) items.push("明確な判定材料はありません。複数回の同条件Probeを継続してください。");
  return {title:"前回Probeとの比較",tone:"ok",items:items};
}
function renderPlayerActivity(a){if(!a)return '<span class="small">Player payloadなし</span>';function one(label,v){if(!v||!v.present)return '<div><b>'+label+'</b>: <span class="small">未提供</span></div>';return '<div><b>'+label+'</b>: '+esc(v.raw)+'<br><span class="small">'+esc(v.iso||'-')+'</span></div>';}return one('last_active_at',a.last_active_at)+one('last_login',a.last_login)+one('online',a.online);}
function showLatest(p){var h=p.headers||{},t=p.timestamp_like_fields||[],s=p.section_sha256||{};
  var rows=read();var previous=rows.find(function(x){return x.type===p.type&&String(x.target_id)===String(p.target_id)&&String(x.hash||"")!==String(p.response_sha256||"");})||rows.find(function(x){return x.type===p.type&&String(x.target_id)===String(p.target_id);});
  var comparison=compareProbe(p,previous);var th=t.length?t.map(function(x){return '<div class=\"pill\"><b>'+esc(x.path)+'</b> = '+esc(x.raw)+'<br><span class=\"small\">'+esc(x.iso)+'</span></div>';}).join(''):'<span class=\"small\">候補なし</span>';var sh=Object.keys(s).length?Object.keys(s).map(function(k){return '<div class=\"pill\">'+esc(k)+': '+esc(String(s[k]).slice(0,20))+'…</div>';}).join(''):'<span class=\"small\">なし</span>';document.getElementById('latest').innerHTML='<div class=\"card\"><h2>最新Probe</h2><div class=\"kv\">'+
  '<b>Request ID</b><span class=\"mono\">'+esc(p.request_id)+'</span>'+
  '<b>対象</b><span>'+esc(p.type)+' / '+esc(p.target_type)+' / '+esc(p.target_id)+'</span>'+
  '<b>EagleEye request start</b><span>'+esc(p.request_started_at_iso)+'</span>'+
  '<b>EagleEye response received</b><span>'+esc(p.response_received_at_iso)+'</span>'+
  '<b>Elapsed</b><span>'+esc(p.elapsed_ms)+' ms</span>'+
  '<b>HTTP</b><span>'+esc(p.http_status)+'</span>'+
  '<b>fresh</b><span>'+esc(p.fresh==null?'-':p.fresh)+'</span>'+
  '<b>cached_at</b><span>'+esc(p.cached_at||'-')+' / '+esc(p.cached_at_iso||'-')+'</span>'+
  '<b>age_seconds</b><span>'+esc(p.age_seconds==null?'-':p.age_seconds)+'</span>'+
  '<b>Player activity</b><span>'+renderPlayerActivity(p.player_activity)+'</span>'+
  '<b>Payload keys</b><span class=\"mono\">'+esc((p.payload_keys||[]).join(', '))+'</span>'+
  '<b>HTTP headers</b><span class=\"mono\">'+esc(JSON.stringify(h,null,2))+'</span>'+
  '<b>Timestamp-like fields</b><span>'+th+'</span>'+
  '<b>Response SHA-256</b><span class=\"mono\">'+esc(p.response_sha256)+'</span>'+
  '<b>Section SHA-256</b><span>'+sh+'</span>'+
  '<b>比較</b><span><strong>'+esc(comparison.title)+'</strong><br>'+comparison.items.map(function(x){return '• '+esc(x);}).join('<br>')+'</span>'+
  '</div></div>';}async function probe(type){var q=new URLSearchParams({type:type});if(type==='PLAYER'){q.set('governor_id',document.getElementById('governorId').value.trim());q.set('include',document.getElementById('include').value);}else{q.set('kid',document.getElementById('kid').value.trim());if(type==='KINGDOM_RANKING')q.set('board',document.getElementById('board').value);}document.getElementById('status').textContent='取得中…';try{var r=await fetch('/api/admin/mightpulse-probe?'+q.toString(),{cache:'no-store',credentials:'same-origin'});var d=await r.json();if(!r.ok||!d.ok)throw new Error(d.message||d.error||('HTTP '+r.status));var p=d.probe;p.client_received_at=Date.now();var rows=read();var previous=rows.find(function(x){return x.type===p.type&&String(x.target_id)===String(p.target_id);})||null;rows.unshift({client_received_at:p.client_received_at,type:p.type,target_id:p.target_id,fresh:p.fresh,cached_at:p.cached_at,age_seconds:p.age_seconds,http_status:p.http_status,elapsed_ms:p.elapsed_ms,hash:p.response_sha256});write(rows);draw();showLatest(p,previous);document.getElementById('status').innerHTML='<span class=\"ok\">取得成功。履歴に追加しました。</span>';}catch(e){document.getElementById('status').innerHTML='<span class=\"error\">Probe失敗: '+esc(e.message||e)+'</span>';}}document.querySelectorAll('button[data-type]').forEach(function(btn){btn.addEventListener('click',function(){probe(btn.getAttribute('data-type'));});});document.getElementById('clearHistory').addEventListener('click',function(){localStorage.removeItem(key);draw();document.getElementById('latest').innerHTML='';});draw();}());</script></body></html>`;
}
async function handleGoogleDriveVerifyApi(request, env) {
  const guard = await requireOwner(request, env);
  if (guard.error) return guard.error;
  if (request.method !== "GET") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const result = await verifyGoogleDriveRefreshToken(env);
    return json({
      ok: true,
      verified: true,
      message: "Google Drive Refresh Tokenの交換とDrive API接続に成功しました。",
      sampleFolder: result.sampleFolder
        ? { id: result.sampleFolder.id || null, name: result.sampleFolder.name || null }
        : null
    });
  } catch (error) {
    return json({
      ok: false,
      verified: false,
      error: error?.code || "GOOGLE_DRIVE_VERIFY_FAILED",
      status: error?.status || 0,
      google_error: error?.googleError?.error || null,
      google_error_description: error?.googleError?.error_description || null,
      message: error?.message || "Google Drive接続検証に失敗しました。"
    }, error?.status === 401 || error?.status === 403 ? 502 : 500);
  }
}
async function handleGoogleDriveAuthorizeApi(request, env) {
  const guard = await requireOwner(request, env);
  if (guard.error) return guard.error;
  if (request.method !== "GET") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const state = await createStateToken(env.EAGLEEYE_SESSION_SECRET);
    const url = getGoogleDriveOAuthAuthorizationUrl(env, state);
    return Response.redirect(url, 302);
  } catch (error) {
    return json({
      ok: false,
      error: error?.code || "GOOGLE_DRIVE_OAUTH_CONFIG_FAILED",
      message: error?.message || "Google Drive OAuthが未設定です。"
    }, 503);
  }
}

async function renderGoogleDriveSetupPage(request, env, message = null, error = null) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (!["ADMIN", "OWNER"].includes(String(auth.role || "").toUpperCase())) return json({ ok: false, error: "ADMIN_REQUIRED" }, 403);
  if (!env.DB) return json({ ok: false, error: "DB_NOT_CONFIGURED" }, 503);
  const isOwner = String(auth.role || "").toUpperCase() === "OWNER";
  const status = await getGoogleDriveConnectionStatus(env);
  const authorizeReady = Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET && env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI);
  const esc = escapeHtml;
  return eagleEyeHtmlResponse(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Google Drive設定 | EagleEye</title><style>
body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:760px;margin:auto;padding:28px 16px 48px}.back{color:#94a3b8;text-decoration:none}.eyebrow{margin-top:24px;color:#f59e0b;font-size:11px;font-weight:900;letter-spacing:2px}.title{font-size:29px;margin:5px 0 10px}.sub{color:#94a3b8;line-height:1.7}.card{margin-top:16px;padding:17px;border:1px solid #334155;border-radius:16px;background:#162238}.row{display:flex;justify-content:space-between;gap:14px;padding:11px 0;border-bottom:1px solid #334155}.row:last-child{border:0}.ok{color:#86efac}.bad{color:#fca5a5}.muted{color:#94a3b8}.btn{display:inline-flex;align-items:center;justify-content:center;margin-top:14px;padding:12px 15px;border-radius:10px;background:#f59e0b;color:#111827;text-decoration:none;font-weight:900}.note{margin-top:14px;color:#94a3b8;font-size:12px;line-height:1.7}.message{margin-top:16px;padding:13px;border-radius:10px;background:#0f2a1c;color:#86efac}.error{margin-top:16px;padding:13px;border-radius:10px;background:#3a1418;color:#fca5a5}</style></head><body><main class="wrap"><a class="back" href="${isOwner ? "/owner" : "/admin"}">← ${isOwner ? "OWNER CONTROL" : "ADMIN CONTROL"}</a><div class="eyebrow">GOOGLE DRIVE</div><h1 class="title">Google Drive連携</h1><p class="sub">EagleEye専用の個人GoogleアカウントをOAuthで接続します。WorkspaceやService Accountは使用しません。</p>
${message ? '<div class="message">'+esc(message)+'</div>' : ''}${error ? '<div class="error">'+esc(error)+'</div>' : ''}
<div class="card"><div class="row"><span>OAuth設定</span><strong class="${authorizeReady ? "ok" : "bad"}">${authorizeReady ? "設定済み" : "未設定"}</strong></div><div class="row"><span>Refresh Token</span><strong class="${status.refreshConfigured ? "ok" : "bad"}">${status.refreshConfigured ? "設定済み" : "未設定"}</strong></div><div class="row"><span>DriveフォルダID</span><strong class="${status.folderConfigured ? "ok" : "bad"}">${status.folderConfigured ? "設定済み" : "未設定"}</strong></div><div class="row"><span>接続設定</span><strong class="${status.ready ? "ok" : "muted"}">${status.ready ? "設定済み" : "未設定"}</strong></div></div>
${isOwner ? `<div class="card"><b>Google Drive接続検証</b><div class="note">Cloudflare SecretのRefresh TokenをGoogleへ交換し、Drive APIへ接続できるか確認します。Token自体は表示しません。</div><button id="verify-drive" class="btn" type="button" onclick="verifyDrive()">接続を検証</button><div id="verify-result" class="note"></div></div>
<script>
async function verifyDrive(){
  const button=document.getElementById("verify-drive");
  const result=document.getElementById("verify-result");
  button.disabled=true;
  button.textContent="検証中…";
  result.textContent="";
  try{
    const response=await fetch("/api/admin/google-drive/verify",{credentials:"same-origin"});
    const data=await response.json().catch(()=>({}));
    if(data.ok){
      result.className="message";
      result.textContent="✓ "+(data.message||"Google Drive接続を確認しました。")+(data.sampleFolder?.name?" フォルダ例: "+data.sampleFolder.name:"");
    }else{
      result.className="error";
      const detail=[data.google_error,data.google_error_description].filter(Boolean).join(": ");
      result.textContent="✕ "+(data.message||data.error||"接続検証に失敗しました。")+(detail?" / "+detail:"");
    }
  }catch(error){
    result.className="error";
    result.textContent="✕ 接続検証リクエストに失敗しました。";
  }finally{
    button.disabled=false;
    button.textContent="接続を検証";
  }
}
</script>
${authorizeReady ? '<a class="btn" href="/api/admin/google-drive/authorize">Googleアカウントを接続 / 再認証</a>' : '<div class="note">先にGoogle CloudでOAuthクライアントを作成し、Client ID / Client Secret / Redirect URIをCloudflareへ設定してください。</div>'}
<div class="card"><b>この画面の注意</b><div class="note">認証後に表示されるRefresh TokenはCloudflare Secretへ登録します。画面・URL・GitHubへ保存しないでください。Google公式でもRefresh Tokenは安全な長期保存先で管理するよう案内されています。</div></div>
` : `<div class="card"><b>管理者向け閲覧専用</b><div class="note">ADMINはGoogle Driveの設定状態を確認できますが、接続検証・Googleアカウントの接続／再認証などの操作は実行できません。これらの操作はOWNERのみ利用できます。</div></div>`}</main></body></html>`);
}

async function handleGoogleDriveOAuthCallback(request, env) {
  const guard = await requireOwner(request, env);
  if (guard.error) return guard.error;
  const url = new URL(request.url);
  const state = String(url.searchParams.get("state") || "");
  const code = String(url.searchParams.get("code") || "");
  const oauthError = String(url.searchParams.get("error") || "");
  if (!env.EAGLEEYE_SESSION_SECRET || !state || !(await verifyStateToken(state, env.EAGLEEYE_SESSION_SECRET))) {
    return json({ ok: false, error: "GOOGLE_DRIVE_OAUTH_STATE_INVALID" }, 400);
  }
  if (oauthError) {
    return json({ ok: false, error: "GOOGLE_DRIVE_OAUTH_DENIED", message: oauthError }, 400);
  }
  if (!code) return json({ ok: false, error: "GOOGLE_DRIVE_OAUTH_CODE_MISSING" }, 400);

  try {
    const tokens = await exchangeGoogleDriveOAuthCode(env, code);
    let folder = null;
    let folderError = null;
    if (!env.GOOGLE_DRIVE_FOLDER_ID) {
      try {
        folder = await createGoogleDriveArchiveFolder(tokens.access_token, "EagleEye");
      } catch (error) {
        folderError = String(error?.message || error);
      }
    }

    const refreshToken = String(tokens.refresh_token || "").trim();
    const folderId = String(folder?.id || env.GOOGLE_DRIVE_FOLDER_ID || "").trim();
    const tokenNotice = refreshToken
      ? "Refresh Tokenを1回だけ表示します。Cloudflare Secretへ登録してください。"
      : "今回の認証レスポンスにRefresh Tokenが含まれていません。既存の認可を取り消してから再認証が必要な場合があります。";

    return eagleEyeHtmlResponse(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Google Drive OAuth完了 | EagleEye</title><style>body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:760px;margin:auto;padding:28px 16px 48px}.card{margin-top:16px;padding:17px;border:1px solid #334155;border-radius:16px;background:#162238}.ok{color:#86efac}.warn{color:#fbbf24}.label{color:#94a3b8;font-size:12px}.secret{margin-top:8px;width:100%;min-height:90px;box-sizing:border-box;padding:10px;border:1px solid #475569;border-radius:10px;background:#0b1220;color:#f8fafc;font-family:ui-monospace,monospace;font-size:12px;word-break:break-all}.btn{display:inline-flex;margin-top:12px;padding:11px 14px;border-radius:9px;background:#f59e0b;color:#111827;text-decoration:none;font-weight:900;border:0}.note{color:#94a3b8;font-size:12px;line-height:1.7;margin-top:10px}</style></head><body><main class="wrap"><h1>Google Drive OAuth完了</h1><div class="card"><div class="ok">Googleアカウントの認証コード交換に成功しました。</div><div class="note">${esc(tokenNotice)}</div>${refreshToken ? '<div class="label" style="margin-top:15px">GOOGLE_DRIVE_REFRESH_TOKEN</div><textarea id="token" class="secret" readonly>'+esc(refreshToken)+'</textarea><button class="btn" onclick="navigator.clipboard.writeText(document.getElementById(\'token\').value)">Refresh Tokenをコピー</button>' : ''}${folderId ? '<div class="label" style="margin-top:18px">GOOGLE_DRIVE_FOLDER_ID</div><textarea class="secret" readonly>'+esc(folderId)+'</textarea><button class="btn" onclick="navigator.clipboard.writeText(this.previousElementSibling.value)">Folder IDをコピー</button>' : '<div class="warn" style="margin-top:15px">EagleEyeフォルダの作成に失敗しました。</div><div class="note">'+esc(folderError || "GOOGLE_DRIVE_FOLDER_IDを別途設定してください。")+'</div>'}</div><div class="card"><b>次に行うこと</b><div class="note">1. Refresh TokenをCloudflare Secret「GOOGLE_DRIVE_REFRESH_TOKEN」へ登録<br>2. Folder IDを「GOOGLE_DRIVE_FOLDER_ID」へ設定<br>3. Workerを再デプロイ<br>4. その後、EagleEye側のDrive upload検証を行う</div></div></main></body></html>`);
  } catch (error) {
    return json({ ok: false, error: error?.code || "GOOGLE_DRIVE_OAUTH_CALLBACK_FAILED", message: error?.message || "Google Drive OAuthに失敗しました。", status: error?.status || 0 }, 502);
  }
}

export default {
  async queue(batch, env, ctx) {
    const traceId = systemTraceId("queue");
    const startedAt = Date.now();
    try {
      await recordSystemEvent(env.DB, { traceId, eventType:"START", service:"queue", feature:"service_usage_archive", operation:"QUEUE_BATCH", status:"STARTED", targetType:"QUEUE_BATCH", targetId:String(batch?.messages?.length || 0), metadata:{ messageCount:batch?.messages?.length || 0 } });
      const result = await handleServiceUsageQueue(batch, env, ctx);
      await recordSystemEvent(env.DB, { traceId, eventType:"COMPLETE", service:"queue", feature:"service_usage_archive", operation:"QUEUE_BATCH", status:"SUCCESS", targetType:"QUEUE_BATCH", targetId:String(batch?.messages?.length || 0), elapsedMs:Date.now()-startedAt, metadata:{ messageCount:batch?.messages?.length || 0 } });
      return result;
    } catch(error) {
      await recordSystemEvent(env.DB, { traceId, eventType:"ERROR", service:"queue", feature:"service_usage_archive", operation:"QUEUE_BATCH", status:"FAILED", targetType:"QUEUE_BATCH", targetId:String(batch?.messages?.length || 0), elapsedMs:Date.now()-startedAt, errorCode:error?.code||"QUEUE_BATCH_FAILED", message:error?.message||String(error) });
      throw error;
    }
  },
  async scheduled(controller, env, ctx) {
    const traceId = systemTraceId("cron");
    const startedAt = Date.now();
    await recordSystemEvent(env.DB, { traceId, eventType:"START", service:"scheduler", feature:"scheduled", operation:"SCHEDULED_RUN", status:"STARTED", targetType:"CRON", targetId:String(controller?.scheduledTime || "") });
    try {
    if (env.DB && env.ARCHIVE) {
      try {
        const drained = await drainHistoryEmergencyBuffer(env.DB, env.ARCHIVE, { limit: 10 });
        if (drained.attempted) {
          await recordDiagnostic(env.DB, {
            service: "history_storage", feature: "history_emergency_buffer", operation: "DRAIN",
            status: Number(drained.failed || 0) > 0 ? "WARNING" : "SUCCESS",
            errorCode: Number(drained.failed || 0) > 0 ? "HISTORY_EMERGENCY_BUFFER_DRAIN_PARTIAL" : null,
            message: Number(drained.failed || 0) > 0 ? "履歴緊急バッファの排出で一部失敗しました。" : "履歴緊急バッファ排出成功",
            rowsReceived: Number(drained.attempted || 0), rowsSaved: Number(drained.archived || 0),
            metadata: { failed: Number(drained.failed || 0), remaining: Number(drained.remaining || 0) }
          });
          console.log("history_emergency_buffer_drain", drained);
        }
      } catch (error) {
        await recordDiagnostic(env.DB, {
          service: "history_storage", feature: "history_emergency_buffer", operation: "DRAIN",
          status: "FAILED", errorCode: String(error?.message || "HISTORY_EMERGENCY_BUFFER_DRAIN_FAILED").split(":")[0],
          message: String(error?.message || error).slice(0, 2000)
        });
        console.error("history_emergency_buffer_drain_failed", error?.message || error);
      }
    }
    await runKingdomWatchlistJobs(env);
    await runDiagnosticHealthChecks(env);
    // Phase 2: bounded discovery. One page per Cron keeps API/D1 usage predictable.
    try {
      const safety = evaluateSafetyGate({
        operation: "KINGDOM_CATALOG",
        priority: SAFETY_PRIORITIES.CATALOG,
        plannedRequests: 1,
        availablePoolKeys: Number((await getApiPoolBudgetSnapshot(env.DB, {
          provider: "MIGHTPULSE",
          poolTypes: ["SYSTEM_GENERAL", "SYSTEM_WATCHLIST", "USER_CONTRIBUTED"]
        }))?.availableKeys || 0),
        reservedKeys: 1,
        cloudflare: await getCloudflareD1Usage(env, { includeQueryInsights: false }),
        force: false
      });
      if (safety.allowed) {
        await runKingdomCatalogDiscovery(env);
      } else {
        await recordSystemEvent(env.DB, {
          traceId: systemTraceId("kingdom-catalog"),
          eventType: "BLOCKED",
          service: "kingdom_catalog",
          feature: "kingdom_discovery",
          operation: "DISCOVERY_PAGE",
          status: "PAUSED",
          errorCode: safety.blockedBy || "SAFETY_GATE_BLOCKED",
          message: "Kingdom Catalog DiscoveryをSafety Gateが停止しました。",
          metadata: { state: safety.state, reasons: safety.reasons, resumeCondition: safety.resumeCondition }
        }).catch(() => {});
      }
    } catch (error) {
      await recordSystemEvent(env.DB, {
        traceId: systemTraceId("kingdom-catalog"),
        eventType: "ERROR",
        service: "kingdom_catalog",
        feature: "kingdom_discovery",
        operation: "DISCOVERY_PAGE",
        status: "WARNING",
        errorCode: error?.code || "KINGDOM_DISCOVERY_SCHEDULER_FAILED",
        message: String(error?.message || error).slice(0, 2000)
      }).catch(() => {});
    }
