import { renderKingdomWatchlistPageReplacement } from "./kingdom-watchlist-page.js";
import { RANKING_BOARD_LABELS } from "./kingdom-terminology.js";
import { renderHeroCatalogPage } from "./hero-catalog-page.js";
import { queueHeroIconCandidates, runHeroIconAssetWorker, getSavedHeroIconMap, serveHeroIconAsset } from "./hero-icon-store.js";
import { PLAYER_COMPARE_ENHANCEMENTS } from "./player-compare-enhancements.js";
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
import { validateManualProbeCommand, redactProbeSecrets, archiveMightPulseProbeRecord, MIGHTPULSE_PROBE_COMMANDS, buildCatalogProbeCommand, buildProbeFieldDictionary, extractProbeReferences } from "./mightpulse-probe.js";
import { MIGHTPULSE_RESEARCH_CANDIDATES, runMightPulseResearch } from "./mightpulse-research.js";
import { savePlayerRankSnapshot, buildPlayerRankSnapshotStatement, saveKingdomRankingBoard, getLatestKingdomRankings, getRankingHistory, getPlayerRankHistory, getKingdomRankingChanges, normalizeGovernorId } from "./ranking-store.js";
import { observationEnvelope } from "./mightpulse-normalizer.js";
import { saveApiObservation } from "./api-observations.js";
import { getLatestPlayerObservation, materializePlayer, getPlayer, getPlayerHistory, getPlayerNameHistory } from "./player-store.js";
import { configureApiPoolEncryption, addApiPoolKey, listApiPoolKeys, getApiPoolKeysWithContributors, leaseApiKey, leaseApiKeyForHealthCheck, releaseApiLease, setApiPoolMightyMetadata, recordApiPoolSuccess, recordApiPoolFailure, getPoolStats, getApiPoolAvailability, getApiPoolBudgetSnapshot, releaseExpiredLeases } from "./api-pool.js";
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
import { runKingdomCatalogDailyRefresh } from "./kingdom-catalog-scheduler.js";
import { runKingdomCatalogR2Backfill } from "./kingdom-catalog-r2-backfill.js";
import { renderKingdomCatalogR2BackfillPage } from "./kingdom-catalog-r2-backfill-page.js";
import { verifyKingdomCatalogR2Backfill } from "./kingdom-catalog-r2-backfill-verify.js";
import { runKingdomSeeder } from "./kingdom-seeder.js";
import { runKingdomRankingRoller } from "./kingdom-ranking-roller.js";
import { runAllianceRoller } from "./alliance-catalog.js";
import { runPlayerRoller } from "./player-roller.js";
import { recordKingdomCollectionSuccess } from "./kingdom-collection-stats.js";
import { drainHistoryEmergencyBuffer } from "./history-emergency-buffer.js";
import { recordServiceUsage } from "./service-usage.js";
import { handleServiceUsageQueue } from "./service-usage-archive.js";
import { getGoogleDriveOAuthAuthorizationUrl, exchangeGoogleDriveOAuthCode, createGoogleDriveArchiveFolder, getGoogleDriveConnectionStatus, verifyGoogleDriveRefreshToken } from "./google-drive.js";
import { getUserPlayerLink, getUserPlayerLinks, getUserPlayerLinksWithPlayers, saveUserPlayerLink, disableUserPlayerLink, validateGovernorId, findActiveGovernorOwner, createOwnershipSupportRequest, verifyAndTransferPlayerLink } from "./user-player-link.js";
import { registerUserMightPulseApiKey, getAdvancedEligibility, evaluateAdvancedEligibility, getVipEligibility, evaluateVipEligibility } from "./user-eligibility.js";
import { handleSupportApi, handleSupportContextApi, handleSupportInteraction, registerSupportCommands, SUPPORT_CATALOG } from "./discord-support.js";
import { normalizeCompareGovernorIds, buildPlayerCompareSeries, extractOptionalPlayerAssets } from "./player-compare.js";
import { handleApiRawDataApi, handleApiRawHistoryApi, renderApiRawDataPage } from "./api-raw-inspector.js";
import { renderAdminDataCoveragePage } from "./admin-data-coverage.js";
import { renderKingdomCatalogPage } from "./kingdom-catalog-page.js";
import { renderKingdomDetailPage, renderKingdomRankingsPage, renderAllianceListPage, renderAlliancePage, renderKingdomComparePage, renderKingdomChangesPage, renderKingdomWatchlistAnalyticsPage, renderKingdomMightyPage, handleKingdomPortalApi } from "./kingdom-portal.js";
import { handleOwnerKingdomLoadTestApi, handleOwnerKingdomLoadTestStatusApi, handleLoadTestNoticeStatusApi, handleOwnerKingdomLoadTestHistoryApi, handleOwnerKingdomLoadTestCancelApi, handleOwnerKingdomLoadTestExportApi, handleOwnerKingdomLoadTestSystemJsonApi, renderOwnerKingdomLoadTestPage, runKingdomLoadTestQueue } from "./admin-kingdom-load-test.js";
import { handleAdminSystemLogApi, renderAdminSystemLogPage } from "./admin-system-log.js";
import { handleAdminSystemLogExportApi, handleAdminSystemLogExportDownloadApi } from "./system-log-export.js";
import { recordSystemEvent, systemTraceId, setSystemEventQueue } from "./system-log.js";
import { handleClientTelemetry, clientTelemetryScript } from "./client-telemetry.js";
import { handleSystemEventQueue } from "./system-event-queue.js";
import { archiveSystemEventLog } from "./retention.js";
import { runKingdomDiscordNotifications } from "./discord-notifications.js";
import { EAGLEEYE_NAV_CSS, EAGLEEYE_DRAWER_INIT, renderEagleEyeOtherMenu, renderEagleEyeNavigation, EAGLEEYE_BJNYAN, EAGLEEYE_UI_TOKENS, EAGLEEYE_THEME_BASE_CSS, EAGLEEYE_ROLE_AVATAR_CSS, normalizeAllianceRole } from "./eagleeye-ui.js";

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
        if (due("api_pool")) await write({ service:"api_pool", status:"WAITING", errorCode:"NO_API_POOL_KEY_AVAILABLE", message });
        if (due("mightpulse")) await write({ service:"mightpulse", status:"WAITING", errorCode:"NO_API_POOL_KEY_AVAILABLE", message });
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
            apiKey: lease.api_key,
            metadata: { leaseId: lease.lease_id, poolType: lease.pool_type }
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
      requestCount: Math.max(1, Number(result.attempts) || 1),
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
              errorMessage:error?.message || null, cooldownSeconds:cooldown, disable, keepAvailable,
              requestCount: Math.max(1, Number(error?.attempts) || 1)
            });
          }
          const message = error?.message || "MightPulse診断プローブに失敗しました。";
          const capacityWaitCode = getApiPoolCapacityWaitCode(error);
          const code = capacityWaitCode || error?.code || "MIGHTPULSE_HEALTH_CHECK_FAILED";
          const status = capacityWaitCode ? "WAITING" : "FAILED";
          if (due("api_pool")) await write({ service:"api_pool", status, errorCode:code, message:capacityWaitCode ? "診断用APIキーの確保待ちです。" : "API Pool診断中のMightPulse接続に失敗: " + message, provider:"MIGHTPULSE", elapsedMs:Date.now()-started });
          if (due("mightpulse")) await write({ service:"mightpulse", status, errorCode:code, message, provider:"MIGHTPULSE", elapsedMs:Date.now()-started });
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
      { batchSize: 1000, googleDriveEnv: env }
    );
    await recordDiagnostic(env.DB, {
      service: "system_log",
      feature: "system_log_archive",
      operation: "ARCHIVE_EXPIRED_SYSTEM_EVENTS",
      status: systemLogArchive?.skipped || (systemLogArchive?.googleDrive && !systemLogArchive.googleDrive.uploaded)
        ? "WARNING"
        : "SUCCESS",
      message: systemLogArchive?.skipped
        ? "System Log R2アーカイブを実行できませんでした。D1のイベントは削除していません。"
        : systemLogArchive?.googleDrive && !systemLogArchive.googleDrive.uploaded
          ? "System LogのR2アーカイブは成功しましたが、Google Driveミラーは未完了です。"
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

async function ensureApiRequestLockSchema(db) {
  // Schema is provisioned by migrations/0035. Never perform request-time DDL.
  return Boolean(db);
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

// Canonical labels are maintained in ./kingdom-terminology.js.

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
    "SELECT role, kingdom_limit, player_limit, updated_at, updated_by FROM watchlist_limits ORDER BY CASE role WHEN 'BASIC' THEN 1 WHEN 'ADVANCED' THEN 2 WHEN 'VIP' THEN 3 WHEN 'ADMIN' THEN 4 ELSE 5 END"
  ).all();
  const result = rows.results || [];
  watchlistLimitsCache = { at: now, rows: result };
  return result;
}

function getRoleWatchlistLimit(limits, role, type) {
  const normalizedRole = String(role || "").toUpperCase();
  let row = (limits || []).find(item => String(item.role).toUpperCase() === normalizedRole);
  // VIP inherits Advanced watchlist capacity unless a dedicated VIP limit is configured.
  if (!row && normalizedRole === "VIP") {
    row = (limits || []).find(item => String(item.role).toUpperCase() === "ADVANCED");
  }
  return row ? Number(type === "kingdom" ? row.kingdom_limit : row.player_limit) : 0;
}

async function ensurePlayerVisibilityTable(db) {
  // Stable schema is provisioned by migrations/0009.
  // The current migration set includes min_role, so runtime DDL/ALTER is forbidden here.
  if (!db) return;
  if (playerVisibilitySchemaPromise) return playerVisibilitySchemaPromise;
  playerVisibilitySchemaPromise = (async () => {
    const existingRows = await db.prepare(
      "SELECT item_key, min_role, basic_enabled, advanced_enabled, admin_enabled, owner_enabled FROM player_visibility_settings"
    ).all();
    const existingByKey = new Map(
      (existingRows.results || []).map(row => [String(row.item_key), row])
    );
    const now = Math.floor(Date.now() / 1000);
    const statements = [];
    for (const item of PLAYER_VISIBILITY_ITEMS) {
      if (existingByKey.has(item.key)) continue;
      const minRole = ["base_identity","base_power","base_kills","base_activity","alliance_identity"].includes(item.key)
        ? "BASIC"
        : "ADVANCED";
      statements.push(db.prepare(
        "INSERT INTO player_visibility_settings (item_key, category, label, description, min_role, basic_enabled, advanced_enabled, admin_enabled, owner_enabled, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, 1, 1, 1, 1, ?, NULL) ON CONFLICT(item_key) DO NOTHING"
      ).bind(item.key, item.category, item.label, item.description, minRole, now));
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
  const roleRank = { BASIC: 1, ADVANCED: 2, VIP: 3, ADMIN: 4, OWNER: 5 };
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

  const heroes = Array.isArray(source.heroes) ? source.heroes : Array.isArray(player.heroes) ? player.heroes : [];
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

  const rankSource = source.ranks && typeof source.ranks === "object" ? source.ranks : player.ranks && typeof player.ranks === "object" ? player.ranks : null;
  if (rankSource) {
    const ranks = {};
    if (visibilityEnabled(settings, "ranks_core", role)) for (const key of ["power","power_rank","kills","kills_rank","town_center_level","town_center_rank","migrant_score","migrant_rank","mystic_trial","mystic_rank"]) if (rankSource[key] !== undefined) ranks[key] = rankSource[key];
    if (visibilityEnabled(settings, "ranks_leaderboards", role) && rankSource.leaderboards !== undefined) ranks.leaderboards = rankSource.leaderboards;
    if (Object.keys(ranks).length) visible.ranks = ranks;
  }

  const gearSource = source.gov_gear && typeof source.gov_gear === "object" ? source.gov_gear : player.gov_gear && typeof player.gov_gear === "object" ? player.gov_gear : null;
  if (gearSource) {
    const gear = {};
    if (visibilityEnabled(settings, "gov_gear_list", role)) for (const key of ["hidden","message","items"]) if (gearSource[key] !== undefined) gear[key] = gearSource[key];
    if (visibilityEnabled(settings, "gov_gear_gems", role) && Array.isArray(gear.items)) gear.items = gear.items.map(item => ({ ...item, gems: item.gems || [] }));
    if (Object.keys(gear).length) visible.gov_gear = gear;
  }

  return visible;
}

const WATCHLIST_RANKING_LIMIT = 100;

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

async function ensureKingdomWatchlistFreshnessSchema(db) {
  // Stable schema and current-ranking fields are provisioned by D1 migrations.
  // Never perform request-time DDL or compatibility ALTERs.
  return Boolean(db);
}

const KINGDOM_WATCHLIST_JOB_RETENTION_SECONDS = 24 * 60 * 60;
const KINGDOM_WATCHLIST_JOB_CLEANUP_BATCH = 100;

async function runKingdomWatchlistJobs(env) {
  if (!env.DB) return;
  const schedulerStartedAtMs = Date.now();
  const schedulerTraceId = systemTraceId("watchlist-cron");
  let jobsAttempted = 0;
  let jobsCompleted = 0;
  let locksContended = 0;
  let capacityWaits = 0;
  let jobFailures = 0;
  await ensureKingdomWatchlistFreshnessSchema(env.DB);
  const now = Math.floor(schedulerStartedAtMs / 1000);

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
    "SELECT w.watchlist_id, w.kid, w.top_n, w.interval_hours, w.last_run_at, " +
    "(SELECT MIN(j.updated_at) FROM kingdom_watchlist_jobs j WHERE j.watchlist_id = w.watchlist_id AND j.status IN ('RANKINGS','PLAYERS')) AS active_job_updated_at " +
    "FROM kingdom_watchlists w WHERE w.enabled = 1 " +
    "ORDER BY CASE WHEN active_job_updated_at IS NULL THEN 1 ELSE 0 END, active_job_updated_at ASC, w.created_at ASC"
  ).all();

  // Read all active jobs once. This replaces one D1 SELECT per not-due watchlist.
  const activeJobRows = await env.DB.prepare(
    "SELECT watchlist_id, status, last_error, updated_at FROM kingdom_watchlist_jobs WHERE status IN ('RANKINGS','PLAYERS') OR (status = 'FAILED' AND last_error LIKE 'RETRYABLE:%')"
  ).all();
  const activeWatchlistIds = new Set((activeJobRows.results || []).filter(item => {
    if (item.status !== "FAILED") return true;
    const retry = String(item.last_error || "").match(/^RETRYABLE:(RANKINGS|PLAYERS):(\d+):/);
    if (!retry) return false;
    const retryCount = Number(retry[2]) || 1;
    const delaySeconds = Math.min(3600, 300 * Math.pow(2, Math.max(0, retryCount - 1)));
    return retryCount <= 5 && now - Number(item.updated_at || 0) >= delaySeconds;
  }).map(item => String(item.watchlist_id)));

  // New background watchlist jobs are admitted by the real API Pool lease/request
  // path below. Do not pre-block them using a guessed fixed request count: the
  // ranking set, available keys, and actual provider quota can vary. Existing
  // per-request lease/cooldown handling remains the source of truth.

  for (const row of rows.results || []) {
    const due = !row.last_run_at || now - Number(row.last_run_at) >= Number(row.interval_hours) * 3600;
    // Do not write a lock for an idle watchlist that is not due.
    if (!due && !activeWatchlistIds.has(String(row.watchlist_id))) continue;
    // Let the API Pool lease/request path decide whether work can proceed.
    // Jobs are resumable, so capacity/quota failures are handled at the request
    // boundary instead of rejecting the whole job from an estimated budget.
    const lockToken = await acquireKingdomWatchlistLock(env, row.watchlist_id);
    if (!lockToken) { locksContended++; continue; }

    try {
      let active = await env.DB.prepare(
        "SELECT * FROM kingdom_watchlist_jobs WHERE watchlist_id = ? AND (status IN ('RANKINGS','PLAYERS') OR (status = 'FAILED' AND last_error LIKE 'RETRYABLE:%' AND updated_at <= ?)) ORDER BY created_at DESC LIMIT 1"
      ).bind(row.watchlist_id, now - 300).first();
      if (active?.status === "FAILED") {
        const retry = String(active.last_error || "").match(/^RETRYABLE:(RANKINGS|PLAYERS):(\d+):/);
        if (!retry) active = null;
        else {
          const retryPhase = retry[1];
          const retryCount = Number(retry[2]) || 1;
          const delaySeconds = Math.min(3600, 300 * Math.pow(2, Math.max(0, retryCount - 1)));
          if (now - Number(active.updated_at || 0) < delaySeconds || retryCount > 5) active = null;
          else {
            await env.DB.prepare(
              "UPDATE kingdom_watchlist_jobs SET status = ?, updated_at = ? WHERE job_id = ? AND status = 'FAILED'"
            ).bind(retryPhase, now, active.job_id).run();
            active = { ...active, status: retryPhase, updated_at: now };
          }
        }
      }
      if (!active && !due) continue;

      let job = active;
      if (!job) {
        const jobId = crypto.randomUUID();
        await env.DB.prepare(
          "INSERT INTO kingdom_watchlist_jobs (job_id, watchlist_id, kid, top_n, status, board_index, player_cursor, player_ids_json, observed_at, source_first_at, source_last_at, ranking_rows, player_rows, collection_source, created_at, updated_at) VALUES (?, ?, ?, ?, 'RANKINGS', 0, 0, '[]', ?, NULL, NULL, 0, 0, 'OPERATOR', ?, ?)"
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
          collection_source: "OPERATOR",
          created_at: now,
          updated_at: now
        };
      }

      try {
        await recordSystemEvent(env.DB, { traceId: job.job_id, eventType:"START", service:"watchlist", feature:"kingdom_watchlist", operation:"WATCHLIST_JOB", status:"STARTED", targetType:"KINGDOM", targetId:String(row.kid), metadata:{ watchlistId:row.watchlist_id, jobId:job.job_id, status:job.status } });
        jobsAttempted++;
        const result = await processKingdomWatchlistJob(env, job);
        if (result.completed) {
          jobsCompleted++;
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
        const rawError = String(error?.message || error).slice(0, 850);
        const previousRetry = String(job.last_error || "").match(/^RETRYABLE:(RANKINGS|PLAYERS):(\d+):/);
        const capacityWaitCode = getApiPoolCapacityWaitCode(error);
        jobFailures++;
        if (capacityWaitCode) capacityWaits++;
        const retryCount = Math.min(99, (Number(previousRetry?.[2]) || 0) + 1);
        const retryPhase = job.status === "PLAYERS" ? "PLAYERS" : "RANKINGS";
        const retryable = Boolean(capacityWaitCode) || (retryCount <= 5 &&
          !rawError.startsWith("USER_CANCELLED:"));
        const storedError = retryable
          ? "RETRYABLE:" + retryPhase + ":" + (capacityWaitCode ? 1 : retryCount) + ":" + rawError
          : rawError;
        const failedAt = Math.floor(Date.now() / 1000);
        await env.DB.prepare(
          "UPDATE kingdom_watchlist_jobs SET status = 'FAILED', last_error = ?, updated_at = ? WHERE job_id = ? AND status IN ('RANKINGS','PLAYERS')"
        ).bind(storedError.slice(0, 1000), failedAt, job.job_id).run();
        // Preserve the committed cursor and start the retry delay at failure time.
        await env.DB.prepare(
          "UPDATE kingdom_watchlists SET last_run_at = ?, last_error = ?, updated_at = ? WHERE watchlist_id = ? AND EXISTS (SELECT 1 FROM kingdom_watchlist_jobs WHERE job_id = ? AND status = 'FAILED' AND last_error = ?)"
        ).bind(failedAt, capacityWaitCode ? null : rawError, failedAt, row.watchlist_id, job.job_id, storedError.slice(0, 1000)).run();
        await recordSystemEvent(env.DB, { traceId: job.job_id, eventType:capacityWaitCode ? "WAITING" : "ERROR", service:"watchlist", feature:"kingdom_watchlist", operation:"WATCHLIST_JOB", status:capacityWaitCode ? "WAITING" : "FAILED", targetType:"KINGDOM", targetId:String(row.kid), errorCode:capacityWaitCode || String(error?.message||"WATCHLIST_JOB_FAILED").split(":")[0], message:String(error?.message||error).slice(0,2000), metadata:{ watchlistId:row.watchlist_id, jobId:job.job_id } });
        await recordDiagnostic(env.DB, {
          service: "watchlist", feature: "kingdom_watchlist", operation: "RUN",
          status: capacityWaitCode ? "WAITING" : "FAILED", errorCode: capacityWaitCode || String(error?.message || "WATCHLIST_JOB_FAILED").split(":")[0],
          message: String(error?.message || error).slice(0, 2000),
          targetType: "KINGDOM", targetId: row.kid,
          metadata: { watchlistId: row.watchlist_id, jobId: job.job_id }
        });
        console.error("kingdom_watchlist_job_failed", row.watchlist_id, error?.message || error);
      }
      // One batch per scheduled invocation; the next invocation prioritizes the least recently advanced active job.
    } finally {
      await releaseKingdomWatchlistLock(env, row.watchlist_id, lockToken);
    }
  }
  console.info("kingdom_watchlist_scheduler_run_completed", {
    traceId: schedulerTraceId,
    startedAt: new Date(schedulerStartedAtMs).toISOString(),
    durationMs: Date.now() - schedulerStartedAtMs,
    watchlistsConsidered: (rows.results || []).length,
    activeJobsSeen: (activeJobRows.results || []).length,
    jobsAttempted,
    jobsCompleted,
    locksContended,
    capacityWaits,
    jobFailures
  });
  await recordSystemEvent(env.DB, {
    traceId: schedulerTraceId,
    eventType: "SCHEDULER_RUN",
    service: "watchlist",
    feature: "kingdom_watchlist",
    operation: "WATCHLIST_CRON",
    status: jobFailures > 0 ? "WARNING" : "SUCCESS",
    message: "王国ウォッチリストCron実行集計",
    startedAt: Math.floor(schedulerStartedAtMs / 1000),
    completedAt: Math.floor(Date.now() / 1000),
    elapsedMs: Date.now() - schedulerStartedAtMs,
    metadata: {
      watchlistsConsidered: (rows.results || []).length,
      activeJobsSeen: (activeJobRows.results || []).length,
      jobsAttempted,
      jobsCompleted,
      locksContended,
      capacityWaits,
      jobFailures
    }
  });
}

async function processKingdomWatchlistJob(env, job, options = {}) {
  const now = Math.floor(Date.now() / 1000);
  const reserveApiKeys = Math.max(0, Number(options?.reserveApiKeys) || 0);
  const apiLimiter = options?.apiLimiter || null;
  const loadTestContext = options?.loadTestContext || null;
  const loadTestRunId = loadTestContext?.runId ? String(loadTestContext.runId) : null;
  const loadTestJobId = loadTestContext?.jobId ? String(loadTestContext.jobId) : String(job?.job_id || "");
  const loadTestJobTraceId = loadTestContext?.traceId || null;
  // A load-test Run already has one process-wide API limiter shared by all
  // kingdom workers in this Worker invocation. Do not add the D1-backed global
  // semaphore on top of it: that semaphore is for independent production
  // collection jobs across Worker invocations. Keeping it out of the load test
  // prevents a schema/lease problem in the semaphore from blocking the first
  // MightPulse request entirely.
  const globalCollectionLimiter = options?.globalCollectionLimiter || (
    apiLimiter ? null : createCollectionSemaphoreLimiter(env.DB, WATCHLIST_MAX_API_CONCURRENCY)
  );

  if (job.status === "RANKINGS") {
    const startIndex = Number(job.board_index || 0);
    // Keep board_index as the committed/resume cursor. player_cursor is reused
    // only during RANKINGS to expose in-flight fetch progress without skipping
    // boards if a Worker invocation ends before the batch is persisted.
    await env.DB.prepare("UPDATE kingdom_watchlist_jobs SET player_cursor = 0, updated_at = ? WHERE job_id = ?").bind(Math.floor(Date.now() / 1000), job.job_id).run();
    const concurrency = apiLimiter
      ? Math.max(0, Math.min(Number(apiLimiter.capacity ?? 1), KINGDOM_RANKING_BOARDS.length - startIndex, WATCHLIST_MAX_API_CONCURRENCY))
      : await getWatchlistApiConcurrency(env, { reserveApiKeys });
    if (concurrency < 1) {
      const code = apiLimiter ? "API_POOL_LOAD_TEST_CAPACITY_WAIT" : "NO_API_POOL_KEY_AVAILABLE";
      const error = new Error(code);
      error.code = code;
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
      const requestTraceId = loadTestJobTraceId ? systemTraceId("load-req") : traceId;
      const startedAtMs = Date.now();
      console.log("kingdom_watchlist_ranking_fetch_started", { jobId: job.job_id, kid: job.kid, board, traceId: requestTraceId, startedAt: Math.floor(startedAtMs / 1000) });
      try {
        const requestLimiter = apiLimiter;
        if (apiLimiter) apiLimiter.globalLimiter = globalCollectionLimiter || null;
        const fetched = await fetchWithLoadTestApiLimiter(requestLimiter, () => fetchKingdomRankingThroughApiPool(
          env, job.kid, board, WATCHLIST_RANKING_LIMIT, "KINGDOM_WATCHLIST_RANKING",
          { useGlobalSemaphore: !apiLimiter, globalLimiter: globalCollectionLimiter, traceId: requestTraceId, parentTraceId: loadTestJobTraceId, jobId: loadTestJobId, runId: loadTestRunId, reserveApiKeys }
        ));
        await env.DB.prepare("UPDATE kingdom_watchlist_jobs SET player_cursor = player_cursor + 1, updated_at = ? WHERE job_id = ? AND status = 'RANKINGS'").bind(Math.floor(Date.now() / 1000), job.job_id).run();
        return { board, traceId: requestTraceId, startedAtMs, fetched };
      } catch (error) {
        const capacityWaitCode = getApiPoolCapacityWaitCode(error);
        if (capacityWaitCode) {
          return { board, traceId, startedAtMs, error, capacityWaitCode };
        }
        const message = "RANKING_FETCH_FAILED:" + board + ":" + String(error?.message || error).slice(0, 500);
        const failure = new Error(message);
        failure.cause = error;
        failure.rankingBoard = board;
        failure.rankingTraceId = traceId;
        failure.rankingStartedAtMs = startedAtMs;
        // Do not set job.last_error until the whole parallel batch settles:
        // the status API treats last_error as a terminal/stale signal.
        await recordDiagnostic(env.DB, {
          traceId, service: "ranking", feature: "kingdom_watchlist",
          operation: "FETCH", status: "FAILED", errorCode: "RANKING_FETCH_FAILED",
          message, provider: "MIGHTPULSE", targetType: "KINGDOM", targetId: job.kid,
          startedAt: Math.floor(startedAtMs / 1000), completedAt: Math.floor(Date.now() / 1000),
          elapsedMs: Date.now() - startedAtMs, metadata: { board, jobId: job.job_id, phase: "FETCH" }
        }).catch(() => {});
        return { board, traceId, startedAtMs, error: failure };
      }
    });

    // Cancellation is durable in D1. Let in-flight API requests settle, then
    // stop before persisting this batch if the user cancelled while it was running.
    const liveJob = await env.DB.prepare(
      "SELECT status, last_error FROM kingdom_watchlist_jobs WHERE job_id = ? LIMIT 1"
    ).bind(job.job_id).first();
    if (liveJob?.status !== "RANKINGS") {
      if (liveJob?.status === "FAILED" && String(liveJob.last_error || "").startsWith("USER_CANCELLED:")) {
        return { completed: false, cancelled: true, phase: "CANCELLED", rankingRows: Number(job.ranking_rows || 0) };
      }
      throw new Error("WATCHLIST_JOB_STATE_CHANGED:" + String(liveJob?.status || "MISSING"));
    }

    // board_index advances as each parallel fetch succeeds, so the UI can show
    // live progress before the slowest request finishes. Persistence below
    // updates ranking_rows independently; failed jobs are never resumed in-place.
    for (let itemIndex = 0; itemIndex < fetchedBoards.length; itemIndex++) {
      const item = fetchedBoards[itemIndex];
      if (item.error) {
        // Earlier boards in this ordered batch have already been persisted.
        // Commit the cursor at the first failed board so a retry does not
        // repeat successful boards or skip the failed one.
        await env.DB.prepare("UPDATE kingdom_watchlist_jobs SET board_index = ?, ranking_rows = ?, updated_at = ? WHERE job_id = ? AND status = 'RANKINGS'")
          .bind(startIndex + itemIndex, rankingRows, Math.floor(Date.now() / 1000), job.job_id).run();
        if (item.capacityWaitCode) {
          await recordDiagnostic(env.DB, {
            traceId: item.traceId,
            service: "ranking",
            feature: "kingdom_watchlist",
            operation: "FETCH",
            status: "WAITING",
            errorCode: item.capacityWaitCode,
            message: "API Poolの空き待ちです。未処理ランキングから自動再試行します。",
            provider: "MIGHTPULSE",
            targetType: "KINGDOM",
            targetId: job.kid,
            metadata: { board: item.board, jobId: job.job_id, phase: "FETCH" }
          });
          const error = new Error(item.capacityWaitCode);
          error.code = item.capacityWaitCode;
          throw error;
        }
        throw item.error;
      }
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

    }

    const batchSourceTimes = fetchedBoards
      .map(item => getMightPulseSourceTimestamp(item.fetched.result?.data))
      .filter(value => Number.isFinite(Number(value)) && Number(value) > 0)
      .map(value => Number(value));
    const batchSourceFirstAt = batchSourceTimes.length ? Math.min(...batchSourceTimes) : null;
    const batchSourceLastAt = batchSourceTimes.length ? Math.max(...batchSourceTimes) : null;
    await env.DB.prepare(
      "UPDATE kingdom_watchlist_jobs SET board_index = ?, player_cursor = 0, ranking_rows = ?, source_first_at = CASE WHEN ? IS NULL THEN source_first_at WHEN source_first_at IS NULL OR ? < source_first_at THEN ? ELSE source_first_at END, source_last_at = CASE WHEN ? IS NULL THEN source_last_at WHEN source_last_at IS NULL OR ? > source_last_at THEN ? ELSE source_last_at END, updated_at = ? WHERE job_id = ? AND status = 'RANKINGS'"
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
      "UPDATE kingdom_watchlist_jobs SET status = 'PLAYERS', board_index = ?, player_cursor = 0, player_ids_json = ?, ranking_rows = ?, updated_at = ? WHERE job_id = ? AND status = 'RANKINGS'"
    ).bind(KINGDOM_RANKING_BOARDS.length, JSON.stringify(playerIds), rankingRows, Math.floor(Date.now() / 1000), job.job_id).run();

    return { completed: false, phase: "PLAYERS", playerCount: playerIds.length, rankingRows, concurrency };
  }

  if (job.status === "PLAYERS") {
    let ids = [];
    try { ids = JSON.parse(job.player_ids_json || "[]"); } catch {}
    if (!Array.isArray(ids)) ids = [];

    const cursor = Number(job.player_cursor || 0);

    if (cursor >= ids.length) {
      // Cancellation may arrive while a batch is in flight. Never overwrite it
      // with COMPLETED, and only count collection after the terminal transition succeeds.
      const terminal = await env.DB.prepare(
        "UPDATE kingdom_watchlist_jobs SET status = 'COMPLETED', last_error = NULL, completed_at = ?, updated_at = ? WHERE job_id = ? AND status = 'PLAYERS'"
      ).bind(now, now, job.job_id).run();
      if (Number(terminal?.meta?.changes || 0) !== 1) {
        return { completed: false, cancelled: true, phase: "CANCELLED", playerRows: Number(job.player_rows || 0) };
      }
      await recordKingdomCollectionSuccess(env.DB, {
        kid: job.kid,
        source: String(job.collection_source || "OPERATOR").toUpperCase(),
        collectedAt: now
      });
      return { completed: true, phase: "COMPLETED", playerRows: Number(job.player_rows || 0) };
    }

    const remaining = ids.length - cursor;
    const concurrency = apiLimiter
      ? Math.max(0, Math.min(Number(apiLimiter.capacity ?? 1), remaining, WATCHLIST_MAX_API_CONCURRENCY))
      : await getWatchlistApiConcurrency(env, { reserveApiKeys });
    if (concurrency < 1) {
      const error = new Error("NO_API_POOL_KEY_AVAILABLE");
      error.code = "NO_API_POOL_KEY_AVAILABLE";
      throw error;
    }
    // The work size follows current pool capacity; no fixed player batch.
    const batchIds = ids.slice(cursor, cursor + concurrency);
    const fetchedPlayers = await fetchWithConcurrency(batchIds, concurrency, async governorId => {
      try {
        const requestTraceId = loadTestJobTraceId ? systemTraceId("load-req") : null;
        return { governorId, fetched: await fetchWithLoadTestApiLimiter(apiLimiter, () => fetchPlayerDetailThroughApiPool(env, governorId, "KINGDOM_WATCHLIST_PLAYER", { useGlobalSemaphore: !apiLimiter, globalLimiter: globalCollectionLimiter, traceId: requestTraceId, parentTraceId: loadTestJobTraceId, jobId: loadTestJobId, runId: loadTestRunId, reserveApiKeys })) };
      } catch (error) {
        const capacityWaitCode = getApiPoolCapacityWaitCode(error);
        // Capacity waits are recorded once at the job level below. Writing one
        // warning row per player would add avoidable D1 writes during pool exhaustion.
        if (!capacityWaitCode) {
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
        }
        return { governorId, error, capacityWaitCode };
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

    const deferredPlayerIds = fetchedPlayers.filter(item => item.capacityWaitCode).map(item => item.governorId);
    const deferredSet = new Set(deferredPlayerIds.map(String));
    const consumedBatchIds = batchIds.filter(id => !deferredSet.has(String(id)));
    // Keep completed targets before the cursor, then retry deferred targets,
    // then retain the untouched queue. Successful players are not fetched again.
    const nextIds = ids.slice(0, cursor).concat(
      consumedBatchIds,
      deferredPlayerIds,
      ids.slice(cursor + batchIds.length)
    );
    const nextCursor = cursor + consumedBatchIds.length;
    const completed = deferredPlayerIds.length === 0 && nextCursor >= nextIds.length;
    const playerUpdate = await env.DB.prepare(
      "UPDATE kingdom_watchlist_jobs SET player_ids_json = ?, player_cursor = ?, player_rows = ?, status = ?, completed_at = ?, source_first_at = CASE WHEN ? IS NULL THEN source_first_at WHEN source_first_at IS NULL OR ? < source_first_at THEN ? ELSE source_first_at END, source_last_at = CASE WHEN ? IS NULL THEN source_last_at WHEN source_last_at IS NULL OR ? > source_last_at THEN ? ELSE source_last_at END, updated_at = ? WHERE job_id = ? AND status = 'PLAYERS'"
    ).bind(
      JSON.stringify(nextIds),
      nextCursor,
      playerRows,
      completed ? "COMPLETED" : "PLAYERS",
      completed ? now : null,
      sourceFirstAt, sourceFirstAt, sourceFirstAt,
      sourceLastAt, sourceLastAt, sourceLastAt,
      now,
      job.job_id
    ).run();
    if (Number(playerUpdate?.meta?.changes || 0) !== 1) {
      return { completed: false, cancelled: true, phase: "CANCELLED", playerRows };
    }

    if (deferredPlayerIds.length) {
      const capacityWaitCode = fetchedPlayers.find(item => item.capacityWaitCode)?.capacityWaitCode || "NO_API_POOL_KEY_AVAILABLE";
      const error = new Error(capacityWaitCode);
      error.code = capacityWaitCode;
      throw error;
    }

    return { completed, phase: completed ? "COMPLETED" : "PLAYERS", playerCursor: nextCursor, playerCount: nextIds.length, playerRows, concurrency };
  }

  return { completed: true, phase: job.status };
}

const WATCHLIST_MAX_API_CONCURRENCY = 26;

function getApiPoolCapacityWaitCode(error) {
  const code = String(error?.code || error?.message || "").split(":")[0].trim();
  return ["NO_API_POOL_KEY_AVAILABLE", "GLOBAL_COLLECTION_SEMAPHORE_FULL", "API_POOL_LOAD_TEST_CAPACITY_WAIT"].includes(code)
    ? code
    : null;
}

async function getWatchlistApiConcurrency(env, { reserveApiKeys = 0 } = {}) {
  const availability = await getApiPoolAvailability(env.DB, {
    provider: "MIGHTPULSE",
    poolTypes: ["SYSTEM_WATCHLIST", "SYSTEM_GENERAL", "USER_CONTRIBUTED"]
  });
  const available = Number(availability?.totals?.available || 0);
  const reserve = Math.max(0, Number(reserveApiKeys) || 0);
  const usable = Math.max(0, available - reserve);

  // A snapshot is only a planning signal. If no capacity is available, wait
  // for the next scheduled run instead of forcing a request with zero keys.
  return Math.min(WATCHLIST_MAX_API_CONCURRENCY, usable);
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
  return renderKingdomWatchlistPageReplacement();
}

async function handleKingdomRankingHistoryApi(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") return json({ ok: false, error: "UNAUTHORIZED" }, 401);
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
  if (!auth || auth.status !== "ACTIVE") return json({ ok: false, error: "UNAUTHORIZED" }, 401);
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
  const topGovernorIds = [...new Set([
    ...(topPlayerRows.results || []).map(row => String(row.governor_id || "").trim()),
    ...(rankings.results || []).filter(row => row.target_type === "PLAYER").flatMap(row =>
      [row.governor_id, row.target_id, row.uid].map(value => String(value || "").trim())
    )
  ].filter(Boolean))];
  const playerGovernorCandidates = [...new Set(
    topGovernorIds.flatMap(id => /^\d+$/.test(id) ? [id, id + ".0"] : [id])
  )];

  let players = { results: [] };
  if (playerGovernorCandidates.length) {
    const placeholders = playerGovernorCandidates.map(() => "?").join(",");
    players = await env.DB.prepare(
      "SELECT governor_id, uid, nick_name, kid, power, town_center_level, vip, kills, x, y, alliance_abbr, alliance_name, avatar_url, online, last_active_at, observed_at FROM players WHERE governor_id IN (" + placeholders + ") ORDER BY power DESC, governor_id ASC"
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


async function ensurePlayerWatchlistSchema(db) {
  // Schema and indexes are provisioned by migrations/0012.
  return Boolean(db);
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
      const vipEligibility = await evaluateVipEligibility(env.DB, { env, userId: auth.user_id });
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
        role: vipEligibility.role || eligibility.role,
        hasPlayerLink: eligibility.hasPlayerLink,
        hasMightPulseKey: eligibility.hasMightPulseKey,
        vip: {
          eligible: Boolean(vipEligibility.eligible),
          promoted: Boolean(vipEligibility.promoted)
        }
      });
    }

    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  } catch (error) {
    console.error("my_advanced_api_failed", error?.code || error?.message || error);
    const code = error?.code || "MY_ADVANCED_API_FAILED";
    const userMessage = error?.userMessage || (
      code === "PLAYER_LINK_REQUIRED_FOR_KEY_VALIDATION"
        ? "先にKingShot領主IDを登録してください。"
        : code === "MIGHTPULSE_API_KEY_LIMIT_REACHED"
        ? "MightPulse APIキーの登録上限に達しました。"
        : "Advanced昇格条件の処理に失敗しました。"
    );
    const status = [
      "MIGHTPULSE_API_KEY_INVALID",
      "MIGHTPULSE_PLAYER_NOT_AVAILABLE",
      "MIGHTPULSE_PLAYER_MISMATCH",
      "PLAYER_LINK_REQUIRED_FOR_KEY_VALIDATION",
      "MIGHTPULSE_API_KEY_ALREADY_REGISTERED",
      "MIGHTPULSE_API_KEY_LIMIT_REACHED"
    ].includes(code) ? 400 : 500;
    return json({ ok: false, error: code, message: userMessage }, status);
  }
}

async function handleMyMightyCheckApi(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (!env.DB) return json({ ok: false, error: "DB_NOT_CONFIGURED" }, 503);
  if (request.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    configureApiPoolEncryption(env.EAGLEEYE_SESSION_SECRET);
    const keysResult = await env.DB.prepare(
      "SELECT key_id, mighty_capable, mighty_check_status FROM api_pool_keys WHERE provider='MIGHTPULSE' AND pool_type='USER_CONTRIBUTED' AND contributed_by_user_id=? AND status != 'REVOKED' ORDER BY CASE WHEN mighty_check_status='CONFIRMED' THEN 1 ELSE 0 END, contributed_at ASC"
    ).bind(auth.user_id).all();
    const keys = keysResult.results || [];
    if (!keys.length) return json({ ok:false, error:"NO_MIGHTPULSE_KEYS", message:"先にMightPulse APIキーを登録してください。" }, 409);

    let checked = 0, confirmed = 0, transient = false;
    for (const row of keys) {
      let lease = null;
      try {
        lease = await leaseApiKeyForHealthCheck(env.DB, { keyId: row.key_id, purpose:"USER_MIGHTY_CHECK", targetType:"USER", targetId:auth.user_id });
        const result = await mightPulseFetch(env, "/kvk/matchups", { apiKey: lease.api_key, timeoutMs:15000, maxRetries:1, metadata: { leaseId: lease.lease_id, poolType: lease.pool_type } });
        checked++;
        confirmed++;
        await recordApiPoolSuccess(env.DB, { keyId:lease.key_id, leaseId:lease.lease_id, poolType:lease.pool_type, endpoint:"/kvk/matchups", targetType:"USER", targetId:auth.user_id, purpose:"USER_MIGHTY_CHECK", httpStatus:result.status,
      requestCount: Math.max(1, Number(result.attempts) || 1), remainingMinute:parseHeaderNumber(result.headers,"x-ratelimit-remaining"), remainingDay:parseHeaderNumber(result.headers,"x-ratelimit-day-remaining") });
        await setApiPoolMightyMetadata(env.DB, { keyId:row.key_id, mightyCapable:true, status:"CONFIRMED", errorCode:null });
        // Do not stop after the first confirmed key. Every user-contributed
        // key must be checked so the API pool can rotate across all confirmed
        // Mighty-capable keys.
        continue;
      } catch (error) {
        const status = Number(error?.status || 0);
        if (lease) {
          if (status === 403) {
            checked++;
            await setApiPoolMightyMetadata(env.DB, { keyId:row.key_id, mightyCapable:false, status:"NOT_MIGHTY", errorCode:"MIGHTY_REQUIRED" });
            await releaseApiLease(env.DB, lease.lease_id);
          } else {
            transient = true;
            await recordApiPoolFailure(env.DB, { keyId:lease.key_id, leaseId:lease.lease_id, poolType:lease.pool_type, endpoint:"/kvk/matchups", targetType:"USER", targetId:auth.user_id, purpose:"USER_MIGHTY_CHECK", httpStatus:status, errorCode:error?.code || "MIGHTY_CHECK_FAILED", errorMessage:error?.message || null, cooldownSeconds:status===429?60:(status>=500 || error?.retryable ? 15 : 0), disable:status===401, requestCount: Math.max(1, Number(error?.attempts) || 1) });
          }
        }
        if (status === 403) continue;
        if (status === 401 || status === 429 || status >= 500 || error?.retryable) continue;
      }
    }

    if (confirmed > 0) {
      const eligibility = await evaluateVipEligibility(env.DB, { userId:auth.user_id });
      return json({
        ok:true,
        mighty_capable:true,
        status:"CONFIRMED",
        checked_key_count:checked,
        confirmed_key_count:confirmed,
        ...eligibility
      });
    }
    if (transient && checked === 0) {
      const eligibility = await getVipEligibility(env.DB, { userId:auth.user_id });
      return json({ ok:true, mighty_capable:Boolean(eligibility.hasMightyKey), status:"UNDETERMINED", checked_key_count:checked, ...eligibility, message:"一時的な通信・レート制限のためMighty判定を確定できませんでした。時間を置いて再確認してください。" });
    }
    const eligibility = await evaluateVipEligibility(env.DB, { userId:auth.user_id });
    return json({ ok:true, mighty_capable:false, status:"NOT_MIGHTY", checked_key_count:checked, ...eligibility, message:"登録済みのAPIキーではMighty対応を確認できませんでした。" });
  } catch (error) {
    console.error("my_mighty_check_failed", error?.code || error?.message || error);
    return json({ ok:false, error:error?.code || "MY_MIGHTY_CHECK_FAILED", message:error?.userMessage || "Mighty対応確認に失敗しました。" }, Number(error?.status) >= 400 ? Number(error.status) : 500);
  }
}

async function handleMyVipApi(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (!env.DB) return json({ ok: false, error: "DB_NOT_CONFIGURED" }, 503);

  if (request.method !== "GET") {
    return json({
      ok: false,
      error: "MIGHTY_CREDENTIAL_REGISTRATION_REMOVED",
      message: "別途Mighty APIキーを登録する必要はありません。登録済みのMightPulse APIキーから自動判定します。"
    }, 410);
  }

  try {
    const eligibility = await evaluateVipEligibility(env.DB, { userId: auth.user_id });
    return json({ ok: true, ...eligibility });
  } catch (error) {
    console.error("my_vip_api_failed", error?.code || error?.message || error);
    return json({
      ok: false,
      error: error?.code || "MY_VIP_API_FAILED",
      message: error?.userMessage || "VIP条件の確認に失敗しました。"
    }, 500);
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
:root{color-scheme:dark;--ee-bg:#050b14;--ee-panel:#0a1728;--ee-panel2:#0d2035;--ee-line:#23415f;--ee-text:#eff8ff;--ee-sub:#8098b0;--ee-cyan:#20d7f2;--ee-blue:#4ea9ff;--ee-gold:#f6c84b;--ee-green:#49e69a}
*{box-sizing:border-box}
html{min-height:100%;background:var(--ee-bg)}
body{margin:0;min-height:100%;background:radial-gradient(ellipse at 50% -180px,rgba(32,215,242,.11),transparent 65%),linear-gradient(180deg,#071321 0%,var(--ee-bg) 420px);color:var(--ee-text);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.wrap{width:min(100%,760px);margin:0 auto;padding:18px 16px calc(44px + env(safe-area-inset-bottom))}
.back{display:inline-flex;align-items:center;gap:7px;color:#8fa9c1;text-decoration:none;font-size:12px;font-weight:850;letter-spacing:.04em;padding:8px 0}
.back:hover{color:var(--ee-cyan)}
.eyebrow{margin-top:23px;color:var(--ee-cyan);font-size:10px;font-weight:950;letter-spacing:.22em}
.title{font-size:clamp(28px,6vw,36px);line-height:1.12;letter-spacing:-.04em;margin:7px 0 10px;font-weight:900}
.sub{color:#9cb1c7;line-height:1.75;font-size:13px;margin:0;max-width:620px}
#app{margin-top:22px}
.card{margin-top:15px;padding:18px;border:1px solid rgba(54,91,123,.7);border-radius:19px;background:linear-gradient(145deg,rgba(13,32,53,.98),rgba(7,19,33,.98));box-shadow:0 12px 30px rgba(0,0,0,.16);overflow:hidden}
.card h2{font-size:17px;line-height:1.35;font-weight:900;letter-spacing:-.02em;color:#f0f8ff}
.label{display:block;margin:16px 0 8px;color:#c6d8e8;font-size:12px;font-weight:850}
.input,.select{width:100%;min-height:48px;padding:13px 14px;border-radius:12px;border:1px solid #2d4a66;background:#06111e;color:#f3f9ff;font-size:16px;box-sizing:border-box;outline:none}
.input:focus,.select:focus{border-color:var(--ee-cyan);box-shadow:0 0 0 3px rgba(32,215,242,.12)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;margin-top:12px;width:100%;min-height:47px;padding:12px 14px;border:1px solid rgba(32,215,242,.4);border-radius:12px;background:linear-gradient(135deg,#16b9d4,#168dbd);color:#03121c;font-weight:900;font-size:14px;cursor:pointer;transition:filter .15s,transform .15s}
.btn:hover{filter:brightness(1.08)}.btn:active{transform:scale(.99)}.btn:disabled{opacity:.55;cursor:wait}
.btn.danger,.danger{background:#351b28;border:1px solid #71364b;color:#ffd8e2}
.muted{color:#8fa8bf;font-size:12px;line-height:1.75}
.ok{color:#6ff0ad}.warn{color:var(--ee-gold)}.error{margin-top:12px;color:#ff9cae;line-height:1.6}
.row{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding:11px 0;border-bottom:1px solid rgba(54,82,109,.5);font-size:13px;color:#a9bfd3}
.row:last-child{border-bottom:0}.value{font-weight:850;text-align:right;overflow-wrap:anywhere;color:#eaf5ff}
.account{margin-top:13px;padding:14px;border:1px solid #24425e;border-radius:15px;background:rgba(4,15,27,.72)}
.account-head{display:flex;justify-content:space-between;gap:8px;align-items:center;color:#eff8ff}
.badge{padding:5px 9px;border-radius:999px;background:#1b344b;color:#c5d9e9;font-size:10px;font-weight:900;white-space:nowrap}
.badge.main{background:rgba(246,200,75,.15);color:#f9d66d;border:1px solid rgba(246,200,75,.3)}
.badge.sub{background:rgba(78,169,255,.14);color:#8cc7ff;border:1px solid rgba(78,169,255,.28)}
.check{display:flex;align-items:center;gap:10px;margin:11px 0;color:#d7e7f5;font-size:13px}
.check-icon{flex:0 0 23px;width:23px;height:23px;border-radius:50%;display:grid;place-items:center;background:#1a3045;color:#7893aa;font-size:12px;font-weight:900;border:1px solid #2d4b65}
.check-icon.ok{background:rgba(73,230,154,.13);border-color:rgba(73,230,154,.35);color:var(--ee-green)}
.vip-card{border-color:rgba(246,200,75,.35);background:linear-gradient(145deg,rgba(37,34,27,.65),rgba(9,20,32,.98))}
.vip-card h2{color:var(--ee-gold)!important}
#msg,#key-msg,#mighty-msg{font-size:12px;line-height:1.7}
button:focus-visible,a:focus-visible{outline:2px solid var(--ee-cyan);outline-offset:3px}
/* Compact mobile-first sizing aligned with the home dashboard */
.wrap{width:min(100%,720px);padding:14px 12px calc(34px + env(safe-area-inset-bottom))}
.back{font-size:11px;padding:5px 0}
.eyebrow{margin-top:18px;font-size:9px;letter-spacing:.18em}
.title{font-size:clamp(24px,7vw,30px);margin:5px 0 7px}
.sub{font-size:12px;line-height:1.65}
#app{margin-top:16px}
.card{margin-top:12px;padding:14px;border-radius:16px;box-shadow:0 8px 24px rgba(0,0,0,.13)}
.card h2{font-size:15px}
.account{margin-top:10px;padding:11px;border-radius:13px}
.account-head{font-size:13px}
.row{gap:10px;padding:9px 0;font-size:12px}
.value{max-width:65%;font-size:12px}
.input,.select{min-height:44px;padding:11px 12px;font-size:15px}
.btn{min-height:43px;padding:10px 12px;font-size:13px}
.muted{font-size:11px;line-height:1.65}
.check{font-size:12px;margin:9px 0}
@media(min-width:600px){.wrap{padding:22px 18px 44px}.card{padding:18px}.account{padding:14px}.title{font-size:32px}.sub{font-size:13px}.row{font-size:13px}.value{font-size:13px}}

/* Compact expandable API key list */
.key-list-details{margin-top:10px;border:1px solid rgba(43,77,107,.55);border-radius:12px;background:rgba(4,15,27,.42);overflow:hidden}.key-list-details summary{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 12px;cursor:pointer;list-style:none;color:#d6e7f5;font-size:11px;font-weight:850}.key-list-details summary::-webkit-details-marker{display:none}.key-list-details summary .muted{font-size:10px}.key-list-rows{padding:0 12px 4px}.key-list-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid rgba(54,82,109,.35);font-size:11px;color:#a9bfd3}.key-list-row small{display:block;margin-top:3px;color:#728da5;font:10px ui-monospace,SFMono-Regular,Menlo,monospace}.key-list-row strong{font-size:11px;white-space:nowrap}
/* My Kingshot information hierarchy */
.section-block{margin-top:22px}
.section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 2px 8px}
.section-heading h2{margin:3px 0 0;font-size:17px;font-weight:900;letter-spacing:-.025em}
.section-kicker{display:block;color:var(--ee-cyan);font-size:8px;font-weight:950;letter-spacing:.17em}
.section-count,.role-pill{flex:0 0 auto;padding:5px 9px;border:1px solid rgba(32,215,242,.24);border-radius:999px;background:rgba(32,215,242,.07);color:#8ceaf6;font-size:10px;font-weight:900}
.role-pill{border-color:rgba(143,168,191,.22);background:rgba(143,168,191,.07);color:#a9bfd3}
.role-pill.role-active{border-color:rgba(73,230,154,.25);background:rgba(73,230,154,.08);color:#6ff0ad}
.section-note{margin:0 2px 10px}
.account-list{margin-top:0;padding:10px 12px}
.account{margin-top:8px;padding:12px}
.account .btn{margin-top:10px}
.usage-line{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px;padding:10px 2px 0;border-top:1px solid rgba(54,82,109,.45);color:#829bb2;font-size:10px}
.usage-line strong{color:#c9dbea;font-size:10px;text-align:right}
.usage-line i{font-style:normal;color:#57718a}
.action-details{margin-top:10px;border:1px solid rgba(43,77,107,.7);border-radius:15px;background:rgba(8,22,37,.7);overflow:hidden}
.action-details summary{display:flex;align-items:center;gap:11px;list-style:none;cursor:pointer;padding:12px}
.action-details summary::-webkit-details-marker{display:none}
.summary-icon{display:grid;place-items:center;flex:0 0 31px;width:31px;height:31px;border:1px solid rgba(32,215,242,.3);border-radius:10px;background:rgba(32,215,242,.08);color:var(--ee-cyan);font-size:20px}
.action-details summary strong,.action-details summary small{display:block}
.action-details summary strong{font-size:12px;color:#eaf5ff}
.action-details summary small{margin-top:3px;color:#819ab1;font-size:10px}
.summary-chevron{margin-left:auto;color:#7f9bb3;font-size:17px;transition:transform .15s}
.action-details[open] .summary-chevron{transform:rotate(180deg)}
.action-card{margin:0;border:0;border-top:1px solid rgba(43,77,107,.5);border-radius:0;box-shadow:none;background:rgba(4,15,27,.48)}
.action-card .label:first-child{margin-top:2px}
.form-help{margin-top:10px}
.subsection-title{margin:0 0 5px;font-size:14px;font-weight:900}
.section-block>.card{margin-top:0}
.section-block .vip-card{margin-top:0}


/* Collapsed account cards: keep the important identity visible, move details/actions behind a tap. */
.account-details{padding:0;overflow:hidden}
.account-summary{display:flex;align-items:center;gap:10px;list-style:none;cursor:pointer;padding:12px}
.account-summary::-webkit-details-marker{display:none}
.account-summary-main{min-width:0;flex:1}
.account-summary-main strong,.account-summary-main small{display:block;overflow-wrap:anywhere}
.account-summary-main strong{font-size:12px;color:#eff8ff}
.account-summary-main small{margin-top:4px;color:#91a9bf;font-size:10px;line-height:1.5}
.account-summary .badge{font-size:9px}
.account-summary .summary-chevron{flex:0 0 auto;margin-left:0}
.account-details[open] .account-summary{border-bottom:1px solid rgba(54,82,109,.5)}
.account-detail-body{padding:2px 12px 12px}
.account-detail-body .row:first-child{margin-top:2px}
.account-link{display:inline-flex;align-items:center;justify-content:flex-end;gap:6px;max-width:70%;color:#8ceaf6;text-decoration:none;font-weight:850;text-align:right;overflow-wrap:anywhere}
.account-link:hover{color:#d5fbff;text-decoration:underline;text-underline-offset:3px}
.account-link:focus-visible{outline:2px solid var(--ee-cyan);outline-offset:3px;border-radius:4px}
.account-link-icon{display:inline-grid;place-items:center;flex:0 0 19px;width:19px;height:19px;border:1px solid rgba(32,215,242,.25);border-radius:6px;background:rgba(32,215,242,.08);font-size:11px;line-height:1}
.account-summary-main .account-summary-player{display:inline;color:#8ceaf6;text-decoration:none}
.account-summary-main .account-summary-player:hover{text-decoration:underline;text-underline-offset:3px}
.key-register-details{margin-top:14px;border:1px solid rgba(43,77,107,.6);border-radius:13px;background:rgba(4,15,27,.45);overflow:hidden}
.key-register-details>summary{display:flex;align-items:center;gap:10px;list-style:none;cursor:pointer;padding:12px;color:#d8edf8;font-size:12px;font-weight:850}
.key-register-details>summary::-webkit-details-marker{display:none}
.key-register-details>summary:after{content:"＋";margin-left:auto;color:var(--ee-cyan);font-size:17px}
.key-register-details[open]>summary:after{content:"−"}
.key-register-body{padding:0 12px 12px;border-top:1px solid rgba(43,77,107,.45)}
.key-register-body .label:first-child{margin-top:12px}

@media(prefers-reduced-motion:reduce){*,*:before,*:after{transition:none!important;animation:none!important}}
</style></head><body><main class="wrap"><a class="back" href="/">← EagleEye</a><div class="eyebrow">PLAYER & ACCOUNT</div><h1 class="title">マイKingshot</h1><p class="sub">領主アカウント、APIキー、利用権限をここで管理できます。登録や確認の操作は、内容を確認してから実行してください。</p><div id="app"><div class="card">読み込み中…</div></div></main><script>
(function(){
  const app=document.getElementById("app");
  function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  let loadResponsesCompleted=0;
  let loadProgressActive=false;
  function showLoadProgress(completed){
    if(!loadProgressActive) return;
    const total=3;
    const percent=Math.round(completed/total*100);
    app.innerHTML='<section class="card" role="status" aria-live="polite"><h2 style="margin:0 0 8px">マイKingshotを読み込み中</h2><p class="muted" style="margin:0 0 14px">登録プレイヤー・権限・VIP情報の応答を確認しています。</p><div style="height:6px;border-radius:99px;overflow:hidden;background:#20384f"><div style="height:100%;width:'+percent+'%;border-radius:99px;background:linear-gradient(90deg,#20d7f2,#49e69a);transition:width .18s ease"></div></div><div style="display:flex;justify-content:space-between;gap:12px;margin-top:9px;font-size:12px"><span class="muted">API応答の処理</span><strong style="color:var(--ee-cyan)">'+completed+' / '+total+'</strong></div></section>';
  }
  async function fetchLoadPart(url){
    const response=await fetch(url,{credentials:"same-origin",cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    loadResponsesCompleted++;
    showLoadProgress(loadResponsesCompleted);
    return {response,data};
  }
  async function getData(){
    loadResponsesCompleted=0;
    loadProgressActive=true;
    showLoadProgress(0);
    let parts;
    try{
      parts=await Promise.all([
        fetchLoadPart("/api/me/player"),
        fetchLoadPart("/api/me/advanced"),
        fetchLoadPart("/api/me/vip")
      ]);
    }catch(error){
      loadProgressActive=false;
      throw error;
    }
    loadProgressActive=false;
    const [playerPart,advancedPart,vipPart]=parts;
    const playerRes=playerPart.response, player=playerPart.data;
    const advancedRes=advancedPart.response, advanced=advancedPart.data;
    const vipRes=vipPart.response, vip=vipPart.data;
    if(!playerRes.ok||!player.ok) throw new Error(player.message||player.error||("HTTP "+playerRes.status));
    if(!advancedRes.ok||!advanced.ok) throw new Error(advanced.message||advanced.error||("HTTP "+advancedRes.status));
    if(!vipRes.ok||!vip.ok) throw new Error(vip.message||vip.error||("HTTP "+vipRes.status));
    return {player,advanced,vip};
  }
  async function load(){
    try{
      render(await getData());
      return true;
    }catch(error){
      loadProgressActive=false;
      app.innerHTML='<div class="card error">'+esc(error.message||String(error))+'</div>';
      return false;
    }
  }
  function render(d){
    const rows=(d.player.links||[]).filter(x=>x.status==="ACTIVE");
    const limits=d.player.limits||{};
    let html='<section class="section-block"><div class="section-heading"><div><span class="section-kicker">PLAYER ACCOUNTS</span><h2>登録済みの領主</h2></div><span class="section-count">'+esc(rows.length)+'件</span></div><p class="muted section-note">無料枠：最大2王国・各王国メイン1＋サブ1</p><div class="card account-list">';
    if(!rows.length) html+='<p class="muted">まだ登録されていません。</p>';
    for(const l of rows){
      const p=l.player||{};
      const playerName=String(p.nick_name||"プレイヤー名未取得");
      const allianceName=String(p.alliance_name||p.alliance_abbr||"");
      const allianceLabel=String(p.alliance_abbr||p.alliance_name||"同盟未取得");
      const playerUrl="/player?governor_id="+encodeURIComponent(l.governor_id);
      const allianceUrl="/alliance?kid="+encodeURIComponent(p.kid??l.kingdom_id??"")+"&tag="+encodeURIComponent(p.alliance_abbr||p.alliance_name||"");
      html+='<details class="account account-details"><summary class="account-summary"><span class="account-summary-main"><strong>王国 '+esc(l.kingdom_id)+' · '+(l.account_type==="MAIN"?"メイン":"サブ")+'</strong><small><a class="account-summary-player" href="'+playerUrl+'">♙ '+esc(playerName)+'</a>　・　戦力 '+esc(p.power!=null?Number(p.power).toLocaleString("ja-JP"):"未取得")+'<br>'+(allianceName?'<a class="account-summary-player" href="'+allianceUrl+'">⚑ '+esc(allianceLabel)+'</a>':'⚑ '+esc(allianceLabel))+'</small></span><span class="badge '+(l.account_type==="MAIN"?"main":"sub")+'">'+(l.account_type==="MAIN"?"メイン":"サブ")+'</span><span class="summary-chevron">⌄</span></summary><div class="account-detail-body">'+
        '<div class="row"><span>領主ID</span><span class="value">'+esc(l.governor_id)+'</span></div>'+
        '<div class="row"><span>プレイヤー名</span><a class="account-link" href="'+playerUrl+'"><span class="account-link-icon" aria-hidden="true">♙</span>'+esc(playerName)+'</a></div>'+
        '<div class="row"><span>戦力</span><span class="value">'+esc(p.power!=null?Number(p.power).toLocaleString("ja-JP"):"未取得")+'</span></div>'+
        '<div class="row"><span>同盟名</span>'+(allianceName?'<a class="account-link" href="'+allianceUrl+'"><span class="account-link-icon" aria-hidden="true">⚑</span>'+esc(allianceLabel)+'</a>':'<span class="value">未取得</span>')+'</div>'+
        '<div class="row"><span>登録状態</span><span class="value ok">'+(l.official_verified_at?"✓ EagleEye公式認証":(l.verified?"管理者確認済み":"自己申告・未認証"))+'</span></div>'+
        '<button class="btn danger remove" data-governor="'+esc(l.governor_id)+'">この登録を解除</button></div></details>';
    }
    html+='<div class="usage-line"><span>登録状況</span><strong>'+esc(limits.registeredKingdoms||0)+' / 2 王国 <i>・</i> '+esc(limits.activeAccounts||0)+' アカウント</strong></div></div></section>';
    html+='<details class="action-details"><summary><span class="summary-icon">＋</span><span><strong>アカウントを追加</strong><small>領主IDを新しく登録する</small></span><span class="summary-chevron">⌄</span></summary><div class="card action-card"><label class="label" for="gid">領主ID</label><input id="gid" class="input" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="例: 123456789"><label class="label" for="atype">区分</label><select id="atype" class="select"><option value="MAIN">メイン</option><option value="SUB">サブ</option></select><button class="btn" id="save">登録する</button><div class="muted form-help">同じ王国ではメイン1件＋サブ1件まで登録できます。</div><div id="msg"></div></div></details>';
    const a=d.advanced||{}; const role=String(d.vip?.role||a.role||"BASIC").toUpperCase(); const promoted=["ADVANCED","VIP","ADMIN","OWNER"].includes(role);
    const keyCount=Number(a.mightPulseKeyCount||0);
    const keyRows=Array.isArray(a.apiKeys)?a.apiKeys:[];
    const vipKeyCount=Number(d.vip?.keyCount||keyCount);
    const mightyKeyCount=Number(d.vip?.mightyKeyCount||0);
    let keyHtml='<div class="muted" style="margin-top:12px">登録済みAPIキー：'+esc(keyCount)+'本　／　⚡ Mighty対応：'+esc(mightyKeyCount)+'本</div>';
    if(keyRows.length) keyHtml+='<details class="key-list-details"><summary><span>登録済みキーの内訳</span><span class="muted">'+esc(keyRows.length)+'本を表示　⌄</span></summary><div class="key-list-rows">'+keyRows.map((k,i)=>{const vipKey=d.vip?.apiKeys?.[i]||{}; const prefix=String(k.api_key_prefix||"").trim(); const mighty=Boolean(vipKey.mighty_capable); return '<div class="key-list-row"><span>キー '+(i+1)+(prefix?'<small>'+esc(prefix)+'</small>':'')+'</span><strong class="'+(mighty?'warn':'ok')+'">'+(mighty?'⚡ Mighty':'✓ 提供済み')+'</strong></div>';}).join('')+'</div></details>';
    html+='<section class="section-block"><div class="section-heading"><div><span class="section-kicker">ACCESS LEVEL</span><h2>利用権限・APIキー</h2></div><span class="role-pill '+(promoted?'role-active':'')+'">'+esc(role)+'</span></div><div class="card"><h3 class="subsection-title">Advanced昇格条件</h3><p class="muted section-note">以下の2つを満たすとBASICからAdvancedへ昇格します。</p>'+
      '<div class="check"><span class="check-icon '+(a.hasPlayerLink?"ok":"")+'">'+(a.hasPlayerLink?"✓":"")+'</span><span>領主IDを1つ以上登録</span></div>'+
      '<div class="check"><span class="check-icon '+(a.hasMightPulseKey?"ok":"")+'">'+(a.hasMightPulseKey?"✓":"")+'</span><span>MightPulse APIキーを1本以上Poolへ提供</span></div>'+
      '<div class="row" style="margin-top:10px"><span>現在の権限</span><span class="value '+(promoted?"ok":"")+'">'+esc(role)+'</span></div>'+keyHtml+
      '<details class="key-register-details"><summary>＋ MightPulse APIキーをPoolへ提供</summary><div class="key-register-body"><label class="label" for="mpkey">MightPulse APIキー</label><input id="mpkey" class="input" type="password" autocomplete="off" placeholder="MightPulse APIキーを入力"><button class="btn" id="register-key">APIキーをPoolへ提供する</button><div class="muted" style="margin-top:12px">登録時に通常APIの有効性と⚡ Mighty対応を自動確認します（Mighty確認で1回APIを使用）。登録本数に上限はありません。同じAPIキーの重複登録はできません。提供したキーは暗号化してPoolへ保存され、画面には照合用の先頭部分のみ表示します。</div><div id="key-msg"></div></div></details></div></section>';
    const v=d.vip||{};
    const mightyConnected=Boolean(v.hasMightyKey);
    const mightyStatus=mightyConnected?"CONFIRMED":String(v.mightyKeyStatus||"UNCONFIRMED").toUpperCase();
    const isElevatedMightyRole=["ADMIN","OWNER"].includes(String(v.role||role).toUpperCase());
    html+='<section class="section-block"><div class="section-heading"><div><span class="section-kicker">MIGHTY ACCESS</span><h2>VIP・Mighty機能</h2></div><span class="role-pill '+(mightyConnected?'role-active':'')+'">'+(mightyConnected?'確認済み':'未確認')+'</span></div><div class="card vip-card"><h2 style="margin:0 0 6px;color:#f6d365">⚡ '+(isElevatedMightyRole?"Mighty機能の利用確認":"VIPロールへの昇格")+'</h2><p class="muted" style="margin:0 0 12px">'+(isElevatedMightyRole?"Mighty対応を確認すると、VIP向けMighty機能を利用できます。現在の管理者ロールは変更されません。":"Mighty対応のMightPulse APIキーを確認すると、VIPロールへ昇格できます。")+'</p>'+
      '<div class="check"><span class="check-icon '+(mightyConnected?"ok":"")+'">'+(mightyConnected?"✓":"")+'</span><span>Mighty対応 '+(mightyConnected?"確認済み":"未確認")+'</span></div>'+
      '<div class="row"><span>現在の権限</span><span class="value '+(String(v.role||"") === "VIP"?"ok":"")+'">'+esc(v.role||role)+'</span></div>'+
      '<div id="mighty-check-area" style="margin-top:12px"><button class="btn" id="mighty-check">⚡ '+(mightyStatus==="CONFIRMED"?(isElevatedMightyRole?"Mighty機能を再確認":"VIPロールを再確認"):(isElevatedMightyRole?"Mighty機能の利用を確認":"VIPロールへの昇格を確認"))+'</button><div id="mighty-msg" class="muted" style="margin-top:10px"></div></div>'+
      (mightyStatus==="CONFIRMED"?'<div class="muted" style="margin-top:10px;color:#86efac">⚡ Mighty対応確認済み。'+(isElevatedMightyRole?"Mighty機能を利用できます。":"VIPロール判定済みです。")+'</div>':"")+
      '<div class="muted" style="margin-top:12px">登録済みのMightPulse APIキーを実際にMighty専用APIで確認した結果に基づいて判定を行います。</div></div></section>';
    app.innerHTML=html;
    document.getElementById("save").onclick=save;
    document.querySelectorAll(".remove").forEach(b=>b.onclick=()=>remove(b.dataset.governor,b));
    if(document.getElementById("register-key")) document.getElementById("register-key").onclick=registerKey;
    const mightyButton=document.getElementById("mighty-check");
    if(mightyButton) mightyButton.onclick=checkMighty;
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
  async function remove(governorId,button){
    if(!confirm("このKingShotアカウントの登録を解除しますか？")) return;
    if(button){button.disabled=true;button.textContent="解除しています…";}
    try{
      const r=await fetch("/api/me/player",{method:"DELETE",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify({governor_id:governorId})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok||!d.ok) throw new Error(d.message||d.error||("HTTP "+r.status));
      await load();
    }catch(error){
      alert(error.message||"解除に失敗しました");
    }finally{
      if(button){button.disabled=false;button.textContent="この登録を解除";}
    }
  }
  async function checkMighty(){
    const button=document.getElementById("mighty-check"), msg=document.getElementById("mighty-msg");
    button.disabled=true; button.textContent="確認中…"; msg.className="muted"; msg.textContent="登録済みのAPIキーを確認しています。";
    try{
      const r=await fetch("/api/me/vip/mighty-check",{method:"POST",credentials:"same-origin",cache:"no-store"});
      const d=await r.json().catch(()=>({}));
      if(!r.ok||!d.ok) throw new Error(d.message||d.error||("HTTP "+r.status));
      if(d.status==="CONFIRMED"){msg.className="ok";msg.textContent="⚡ Mighty対応を確認しました。"+(["ADMIN","OWNER"].includes(String(d.role||"").toUpperCase())?"管理者ロールは維持したまま、Mighty機能を利用できます。":"VIP権限を更新しました。");button.textContent=(["ADMIN","OWNER"].includes(String(d.role||"").toUpperCase())?"⚡ Mighty機能を再確認":"⚡ VIPロールを再確認");setTimeout(load,500);}
      else if(d.status==="NOT_MIGHTY"){msg.className="warn";msg.textContent="登録済みのAPIキーではMighty対応を確認できませんでした。";setTimeout(load,500);}
      else {msg.className="warn";msg.textContent=d.message||"一時的に判定できませんでした。時間を置いて再確認してください。";button.disabled=false;button.textContent="⚡ Mighty対応を確認";}
    }catch(e){msg.className="error";msg.textContent=e.message||String(e);button.disabled=false;button.textContent="⚡ Mighty対応を確認";}
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
             p.alliance_rank, p.alliance_rank_label, p.observed_at
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
             p.alliance_rank, p.alliance_rank_label, p.observed_at
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

async function renderWatchlistHubPage(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") {
    return applyEagleEyeTheme(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ウォッチリスト｜EagleEye</title></head><body><main style="max-width:720px;margin:40px auto;padding:20px"><h1>ログインが必要です</h1><p>ウォッチリストを利用するにはログインしてください。</p><a href="/api/auth/discord">Discordでログイン</a></main></body></html>`);
  }
  return applyEagleEyeTheme(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>ウォッチリスト｜EagleEye</title>
<style>
html,body{width:100%;height:100%;min-height:0;overflow:hidden;overscroll-behavior:none;background:#050b14}body{box-sizing:border-box;margin:0;padding:18px 14px calc(88px + env(safe-area-inset-bottom));font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:linear-gradient(180deg,#071321 0%,#050b14 320px)}
.watch-hub{max-width:760px;margin:0 auto}.watch-head{display:flex;align-items:center;gap:12px;margin-bottom:20px}.watch-back{color:#20d7f2;text-decoration:none;font-weight:800}.watch-head h1{margin:8px 0 0;font-size:25px}.watch-intro{color:#8da2b8;margin:0 0 18px;font-size:13px}
.watch-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.watch-option{display:flex;min-height:190px;flex-direction:column;justify-content:space-between;gap:10px;padding:16px;border:1px solid rgba(44,93,137,.7);border-radius:20px;background:linear-gradient(145deg,rgba(12,41,65,.95),rgba(6,17,29,.98));color:#eff8ff;text-decoration:none;transition:transform .14s,border-color .14s;overflow:hidden}.watch-option:active{transform:scale(.98);border-color:#20d7f2}.watch-option-top{display:flex;align-items:center;gap:8px;min-height:104px}.watch-option-art{display:block;width:42%;max-width:150px;max-height:140px;object-fit:contain;flex:0 0 auto}.watch-option-copy{min-width:0;flex:1}.watch-option h2{font-size:17px;line-height:1.35;margin:0 0 7px}.watch-option p{font-size:12px;line-height:1.55;color:#91a8bf;margin:0}.watch-go{font-size:12px;font-weight:900;color:#20d7f2}.watch-foot{margin-top:16px;color:#7189a2;font-size:11px}
@media(max-width:520px){.watch-options{grid-template-columns:1fr}.watch-option{min-height:150px;padding:15px}.watch-option-top{min-height:90px}.watch-option-art{width:35%;max-height:112px}.watch-option h2{font-size:17px}.watch-head h1{font-size:22px}}
</style></head><body><main class="watch-hub">
<div class="watch-head"><div><a class="watch-back" href="/">← EAGLEEYE / HOME</a><h1>ウォッチリスト</h1></div></div>
<p class="watch-intro">追跡したい対象を選択してください。</p>
<section class="watch-options">
<a class="watch-option" href="/player-watchlist"><div class="watch-option-top"><img class="watch-option-art" src="/assets/eagleeye/bjnyan/player_watchlist.png" alt="" loading="eager" decoding="async"><div class="watch-option-copy"><h2>プレイヤーウォッチリスト</h2><p>登録したプレイヤーの順位やデータの変化を追跡します。</p></div></div><span class="watch-go">プレイヤーを確認する →</span></a>
<a class="watch-option" href="/kingdom-watchlist"><div class="watch-option-top"><img class="watch-option-art" src="/assets/eagleeye/bjnyan/kingdom_watchlist.png" alt="" loading="eager" decoding="async"><div class="watch-option-copy"><h2>王国ウォッチリスト</h2><p>監視対象の王国を管理し、王国の動きを追跡します。</p></div></div><span class="watch-go">王国を確認する →</span></a>
</section><p class="watch-foot">プレイヤーと王国のウォッチリストは、それぞれ独立して管理されます。</p>
</main></body></html>`);
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
.compare-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px;padding:12px 14px;border:1px solid #334155;border-radius:14px;background:#111c31}.compare-toolbar span{display:block;margin-top:3px;color:#94a3b8;font-size:11px}.compare-check{display:inline-flex;align-items:center;gap:6px;color:#cbd5e1;font-size:12px;font-weight:800}.compare-check input{accent-color:var(--ee-cyan,#22d3ee)}.actions{display:flex;gap:7px;margin-top:12px;flex-wrap:wrap}.action{display:inline-flex;align-items:center;justify-content:center;padding:9px 11px;border:1px solid #334155;border-radius:9px;background:#0f1220;color:#e2e8f0;text-decoration:none;font-size:12px;font-weight:800;cursor:pointer}.action.primary{background:var(--ee-cyan,#22d3ee);color:#062033;border-color:var(--ee-cyan,#22d3ee)}.danger{color:#fecaca;border-color:#7f1d1d}.empty,.error{padding:18px;border:1px dashed #475569;border-radius:14px;color:#94a3b8;text-align:center}.error{color:#fecaca;border-style:solid;border-color:#7f1d1d}.loading{color:#94a3b8;padding:18px;text-align:center}
@media(max-width:520px){.head{display:block}.head .action{margin-top:10px}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}}

/* Player Watchlist — unified EagleEye theme */
body{max-width:980px;padding:18px 14px 100px;background:var(--ee-bg);color:var(--ee-text)}
.head{align-items:center;margin-bottom:20px}
.back{display:inline-flex;align-items:center;gap:6px;color:#4dd8f2;font-size:14px;font-weight:750}
.title{margin:12px 0 5px;font-size:clamp(25px,5vw,32px);line-height:1.15;letter-spacing:-.5px;color:#f3f8ff}
.sub{font-size:13px;line-height:1.5;color:#8ea4bc}
.list{gap:14px}
.item{position:relative;overflow:hidden;padding:15px;border:1px solid var(--ee-border);border-radius:20px;background:linear-gradient(145deg,var(--ee-panel) 0%,var(--ee-panel-deep) 100%);box-shadow:0 7px 18px rgba(0,0,0,.16)}
.item:before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:linear-gradient(180deg,#28cde9,#2475a8);opacity:.9}
.top{gap:11px;align-items:center}
.avatar{flex:0 0 48px;width:48px;height:48px;border-radius:13px;border:2px solid #92a8bc;background:#071321;box-shadow:0 0 0 2px #071321,inset 0 1px 2px rgba(255,255,255,.2),0 3px 9px rgba(0,0,0,.4)}
.name{font-size:16px;line-height:1.25;color:#f3f8ff}
.id{font-size:11px;color:#8ea4bc}
.state{flex-shrink:0;padding:5px 8px;border:1px solid rgba(74,222,128,.25);background:rgba(22,101,52,.24);color:#8ff0b0}
.state.off{border-color:rgba(248,113,113,.25);background:rgba(127,29,29,.22);color:#fca5a5}
.pill-row{gap:7px;margin-top:12px}
.pill{padding:5px 9px;border:1px solid #263f5a;border-radius:8px;background:#0a1728;color:#b5c7d9;font-size:11px;line-height:1.3}
.stats{gap:7px;margin-top:12px}
.stat{min-width:0;padding:9px 10px;border:1px solid #263f5a;border-radius:11px;background:rgba(6,17,32,.72)}
.stat span{font-size:10px;color:#8299b2;letter-spacing:.2px}
.stat b{font-size:14px;line-height:1.25;color:#eaf5ff;overflow-wrap:anywhere}
.stat:first-child b{color:#42d7f2;font-size:16px}
.change-box{margin-top:11px;padding:11px;border:1px solid #223b55;border-radius:13px;background:rgba(5,15,29,.72)}
.change-title{color:#49cde7;font-size:10px;letter-spacing:1px}
.change-row{gap:12px;margin-top:8px;font-size:12px}
.change-row .label{color:#9cb0c6}
.change-row .value{color:#e4edf7}
.ranking-changes{gap:6px;margin-top:9px}
.ranking-row{padding:8px 9px;border:1px solid #1e344b;border-radius:9px;background:#0b1829;font-size:11px}
.ranking-row .label{color:#a9bdd1}
.up{color:#65e6a3}.down{color:#ff929c}.flat,.muted{color:#8499b0}
.compare-toolbar{position:relative;gap:10px;margin:0 0 14px;padding:13px;border:1px solid var(--ee-border);border-radius:var(--ee-radius-lg);background:linear-gradient(120deg,var(--ee-panel),var(--ee-panel-deep))}
.compare-toolbar strong{font-size:16px;color:#eef7ff}
.compare-toolbar span{font-size:11px;color:#8ea4bc}
.compare-check{color:#b7c8da}
.compare-check input{width:16px;height:16px;accent-color:#25cde8}
.actions{gap:7px;margin-top:13px;padding-top:11px;border-top:1px solid rgba(47,75,103,.55)}
.action{min-height:38px;padding:9px 12px;border:1px solid #2a4967;border-radius:10px;background:#102137;color:#dceaf8;font-size:12px;font-weight:800;transition:filter .15s ease}
.action:active{filter:brightness(1.18)}
.action.primary{border-color:var(--ee-cyan);background:var(--ee-cyan);color:#062033}
.action.danger{border-color:#6f3542;background:rgba(100,27,42,.24);color:#ffb4bc}
button.action:disabled{opacity:.45;cursor:not-allowed}
.empty,.error,.loading{border-radius:14px;background:#0d1a2b}
.empty{border:1px dashed #2a4967;color:#9db1c6}
.error{border:1px solid #71343d;color:#ffb4bc}
.loading{border:1px solid #223b55;color:#9db1c6}
@media(max-width:520px){
 body{padding:15px 12px 100px}
 .head{display:block;margin-bottom:17px}
 .head .action{margin-top:12px}
 .title{font-size:26px}
 .item{padding:13px 12px;border-radius:17px}
 .top{gap:9px}
 .avatar{flex-basis:44px;width:44px;height:44px;border-radius:12px}
 .name{font-size:15px}
 .stats{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
 .stat{padding:9px}
 .compare-toolbar{align-items:flex-start;flex-direction:column}
 .compare-toolbar #compare-open{width:100%}
 .actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
 .actions .compare-check{grid-column:1/-1;padding:3px 0}
 .actions .action{width:100%;box-sizing:border-box}
 .change-row{align-items:flex-start}
 .change-row .value{max-width:68%}
}

/* Compact app-style watchlist cards */
.item{padding:13px 14px 11px;border-radius:var(--ee-radius-lg);background:var(--ee-panel-deep);border:1px solid var(--ee-border-soft);box-shadow:none}
.item:before{width:2px;opacity:.7}
.compact-main{display:flex;align-items:center;gap:11px;min-width:0}
.compact-main .avatar{flex:0 0 48px;width:48px;height:48px}
.compact-main .main{min-width:0;flex:1}
.compact-main .name{font-size:15px;line-height:1.25}
.compact-main .id{font-size:10px;margin-top:3px}
.identity-tags{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:7px}
.identity-tags .pill{margin:0;padding:3px 6px;font-size:10px;max-width:100%;overflow-wrap:anywhere}
.role-pill{display:inline-flex;align-items:center;justify-content:center;padding:3px 6px;border:1px solid;border-radius:6px;font-size:10px;font-weight:900;line-height:1.2}
.role-5{color:#f0c75e;background:#f0c75e18;border-color:#8c6c2c}
.role-4{color:#c5a7ff;background:#bca0ff18;border-color:#7555a7}
.role-3{color:#70dfff;background:#70dfff18;border-color:#31718a}
.role-2{color:#79e5a5;background:#79e5a518;border-color:#367c57}
.role-1{color:#a9bacb;background:#a9bacb18;border-color:#596a7a}
.power-block{flex:0 0 auto;display:flex;flex-direction:column;align-items:flex-end;gap:3px;min-width:74px}
.power-block>span:first-child{font-size:9px;letter-spacing:1px;color:#8299b2;font-weight:800}
.power-block strong{font-size:19px;line-height:1.1;color:#42d7f2;white-space:nowrap}
.power-block .state{font-size:9px;padding:3px 6px}
.quick-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:12px;padding-top:10px;border-top:1px solid #1c3148}
.quick-stats>div{min-width:0;display:flex;flex-direction:column;gap:3px}
.quick-stats span{font-size:10px;color:#8299b2}
.quick-stats b{font-size:13px;color:#e5f0fc;overflow-wrap:anywhere}
.detail-drawer{margin-top:10px;border-top:1px solid #1c3148}
.detail-drawer summary{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 2px 2px;list-style:none;cursor:pointer;color:#a9bdd1;font-size:11px;font-weight:800}
.detail-drawer summary::-webkit-details-marker{display:none}
.detail-drawer summary:after{content:"＋";color:#42d7f2;font-size:16px}
.detail-drawer[open] summary:after{content:"−"}
.detail-drawer summary span{margin-left:auto;color:#6f879f;font-size:10px;font-weight:500}
.detail-drawer .stats{margin-top:9px}
.detail-drawer .actions{margin-top:12px}
@media(max-width:520px){
 .item{padding:12px 11px 9px;border-radius:15px}
 .compact-main{gap:9px}
 .compact-main .avatar{flex-basis:44px;width:44px;height:44px}
 .compact-main .name{font-size:14px}
 .power-block{min-width:66px}
 .power-block strong{font-size:17px}
 .quick-stats{margin-top:10px;padding-top:9px}
 .quick-stats b{font-size:12px}
 .detail-drawer summary{font-size:10px}
 .actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
 .actions .compare-check{grid-column:1/-1}
 .actions .action{width:100%;box-sizing:border-box}
}

/* Large, easy-to-hit compare selector */
.compact-main{position:relative}
.compare-toggle{flex:0 0 42px;width:42px;min-height:48px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border:1px solid #2a4967;border-radius:11px;background:var(--ee-panel-raised);color:var(--ee-subtext);cursor:pointer;box-sizing:border-box;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.compare-toggle input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.compare-mark{display:flex;align-items:center;justify-content:center;width:23px;height:23px;border:2px solid #66839f;border-radius:7px;color:#9fb5ca;font-size:17px;font-weight:900;line-height:1}
.compare-label{font-size:9px;font-weight:800;line-height:1}
.compare-toggle.is-checked{border-color:var(--ee-cyan);background:rgba(34,211,238,.13);color:#64e7fa;box-shadow:0 0 0 1px rgba(41,213,239,.22) inset}
.compare-toggle.is-checked .compare-mark{background:var(--ee-cyan);border-color:var(--ee-cyan);color:#062033}
.compare-toggle.is-disabled{opacity:.3;cursor:not-allowed}
.item.is-selected{border-color:#29cde8;background:linear-gradient(140deg,#103448,#091728);box-shadow:0 0 0 1px rgba(41,205,232,.24),0 0 14px rgba(41,205,232,.08)}
.item.is-selected:before{background:#29d5ef;opacity:1}
@media(max-width:520px){
 .compact-main{gap:7px}
 .compare-toggle{flex-basis:36px;width:36px;min-height:46px;border-radius:9px}
 .compare-mark{width:21px;height:21px}
 .compare-label{font-size:8px}
 .power-block{min-width:58px}
 .power-block strong{font-size:15px}
}
</style></head><body><main>
<div class="head"><div><a class="back" href="/">← EagleEye</a><h1 class="title">プレイヤーウォッチリスト</h1><div class="sub">登録したプレイヤーの現在値と変化を確認できます</div></div><a class="action" href="/players">プレイヤー検索</a></div>
<div class="compare-toolbar"><div><strong>プレイヤー比較</strong><span id="compare-count">0 / 4人選択</span></div><button id="compare-open" class="action primary" type="button" disabled>選択したプレイヤーを比較</button></div>
<div id="watchlist" class="list"><div class="loading">読み込み中…</div></div>
</main>
<script>
(function(){
  const root=document.getElementById("watchlist");
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const normalizeAllianceRole=(value,label="")=>{const text=String(label??"").trim();const named=text.match(/(?:^|\\D)R([1-5])(?:$|\\D)/i);if(named)return Number(named[1]);const lower=text.toLowerCase();if(/(leader|president|chief|盟主|会長)/i.test(lower))return 5;if(/(officer|vice|副盟主|副会長)/i.test(lower))return 4;const raw=String(value??"").trim().match(/^R([1-5])$/i);return raw?Number(raw[1]):null;};
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
      window.__eagleEyePlayerWatchlistCount=(d.watchlist||[]).filter(function(item){return item.enabled!==false;}).length;
      if(typeof window.__eagleEyeSetPlayerWatchlistCount==="function")window.__eagleEyeSetPlayerWatchlistCount(window.__eagleEyePlayerWatchlistCount);
      if(!(d.watchlist||[]).length){root.innerHTML='<div class="empty">ウォッチリストは空です。プレイヤー画面から追加できます。</div>';return;}
      root.innerHTML=d.watchlist.map(x=>{
        const s=x.summary||{};
        const powerChange=powerChangeText(s);
        const rankingChanges=Array.isArray(s.ranking_changes)?s.ranking_changes:[];
        const rankingRows=rankingChanges
          .filter(r=>r.current!=null||r.previous!=null)
          .map(r=>'<div class="ranking-row"><span class="label">'+esc(r.label)+'</span><span class="value">'+rankText(r)+'</span></div>')
          .join("") || '<div class="muted">ランキングデータなし</div>';
        const role=normalizeAllianceRole(x.alliance_rank,x.alliance_rank_label);
        return '<article class="item">'+
          '<div class="compact-main">'+
            (x.avatar_url?'<img class="avatar ee-role-avatar" data-role="'+esc(role||"")+'" src="'+esc(x.avatar_url)+'" alt="">' :'<div class="avatar ee-role-avatar" data-role="'+esc(role||"")+'"></div>')+
            '<div class="main"><div class="name">'+esc(x.nick_name||x.label||"Unknown Player")+'</div>'+
            '<div class="id">ID '+esc(x.governor_id)+'</div>'+
            '<div class="identity-tags"><span class="pill">王国 '+esc(x.kid??"-")+'</span><span class="pill alliance-pill">'+(x.alliance_abbr?"【"+esc(x.alliance_abbr)+"】 ":"")+esc(x.alliance_name||"-")+'</span>'+(role?'<span class="role-pill role-'+role+'">R'+role+'</span>':'')+'</div></div>'+
            '<div class="power-block"><span>戦力</span><strong>'+esc(compact(x.power))+'</strong><span class="'+(x.enabled?"state":"state off")+'">'+(x.enabled?"監視中":"停止中")+'</span></div>'+
            '<label class="compare-toggle" aria-label="このプレイヤーを比較対象にする"><input type="checkbox" class="compare-player" data-governor-id="'+esc(x.governor_id)+'"><span class="compare-mark">＋</span><span class="compare-label">比較</span></label>'+
          '</div>'+
          '<div class="quick-stats"><div><span>役場</span><b>'+esc(x.town_center_level==null?"-":x.town_center_level)+'</b></div><div><span>VIP</span><b>'+esc(x.vip??"-")+'</b></div><div><span>撃破数</span><b>'+esc(compact(x.kills))+'</b></div></div>'+
          '<details class="detail-drawer"><summary>変化・ランキング・操作 <span>詳細を開く</span></summary>'+
            '<div class="stats"><div class="stat"><span>最終観測</span><b>'+esc(fmtTime(x.observed_at))+'</b></div></div>'+
            '<div class="change-box"><div class="change-title">前回からの変化</div>'+
              '<div class="change-row"><span class="label">戦力</span><span class="value">'+powerChange+'</span></div>'+
              '<div class="change-row"><span class="label">役場</span><span class="value">'+simpleChangeText(s.town_center_change,c=>c==null?"-":String(c)+"")+'</span></div>'+
              '<div class="change-row"><span class="label">同盟</span><span class="value">'+simpleChangeText(s.alliance_change,c=>c==null?"-":String(c)+"")+'</span></div>'+
              '<div class="change-title" style="margin-top:12px">ランキング順位変動</div>'+
              '<div class="ranking-changes">'+rankingRows+'</div>'+
            '</div>'+
            '<div class="actions"><a class="action primary" href="/player?governor_id='+encodeURIComponent(x.governor_id)+'">プレイヤー詳細</a><a class="action" href="/player/changes?governor_id='+encodeURIComponent(x.governor_id)+'">変更履歴</a><button class="action danger" data-g="'+esc(x.governor_id)+'">削除</button></div>'+
          '</details></article>';
      }).join("");
      const compareChecks=[...root.querySelectorAll(".compare-player")];
      const compareCount=document.getElementById("compare-count");
      const compareOpen=document.getElementById("compare-open");
      const selected=new Set();
      const preselect=new URLSearchParams(location.search).get("compare");
      function syncCompare(){
        compareCount.textContent=selected.size+" / 4人選択";
        compareOpen.disabled=selected.size<2;
        compareChecks.forEach(function(input){const isSelected=selected.has(String(input.dataset.governorId));input.checked=isSelected;input.closest(".item")?.classList.toggle("is-selected",isSelected);input.disabled=!isSelected&&selected.size>=4;const label=input.closest(".compare-toggle");if(label){label.classList.toggle("is-checked",isSelected);label.classList.toggle("is-disabled",input.disabled);label.querySelector(".compare-mark").textContent=isSelected?"✓":"＋";}});
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
    }catch(e){
      window.__eagleEyePlayerWatchlistCount=null;
      if(typeof window.__eagleEyeSetPlayerWatchlistCount==="function")window.__eagleEyeSetPlayerWatchlistCount(null);
      root.innerHTML='<div class="error">'+esc(e.message)+'</div>';
    }
  }
  load();
})();
</script></body></html>`);
}
async function handleKingdomWatchlistApi(request, env, requestTraceId = null) {
  const operationTraceId = String(requestTraceId || request.headers.get("x-eagle-eye-trace-id") || systemTraceId("watchlist-http"));
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "list";

  if (request.method === "GET" && action === "list") {
    // Return all watchlists and each watchlist's latest job in one D1 query.
    // The browser polls this endpoint during long-running jobs; an N+1 query
    // here multiplied reads by watchlist count on every 4-second poll.
    const rows = await env.DB.prepare(
      "SELECT w.watchlist_id, w.kid, w.top_n, w.interval_hours, w.enabled, w.last_run_at, w.last_success_at, w.last_error, w.created_at, w.updated_at, " +
      "j.job_id, j.status AS job_status, j.board_index, j.player_cursor, j.player_ids_json, j.observed_at, j.source_first_at, j.source_last_at, j.ranking_rows, j.player_rows, j.last_error AS job_last_error, j.created_at AS job_created_at, j.updated_at AS job_updated_at, j.completed_at " +
      "FROM kingdom_watchlists w LEFT JOIN kingdom_watchlist_jobs j ON j.job_id = (" +
      "SELECT j2.job_id FROM kingdom_watchlist_jobs j2 WHERE j2.watchlist_id = w.watchlist_id ORDER BY j2.created_at DESC LIMIT 1) " +
      "WHERE w.discord_id = ? ORDER BY w.created_at DESC"
    ).bind(auth.discord_id).all();

    const watchlists = [];
    for (const row of rows.results || []) {
      const watch = {
        watchlist_id: row.watchlist_id,
        kid: row.kid,
        top_n: row.top_n,
        interval_hours: row.interval_hours,
        enabled: row.enabled,
        last_run_at: row.last_run_at,
        last_success_at: row.last_success_at,
        last_error: row.last_error,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
      let job = row.job_id ? {
        job_id: row.job_id,
        status: row.job_status,
        board_index: row.board_index,
        player_cursor: row.player_cursor,
        player_ids_json: row.player_ids_json,
        observed_at: row.observed_at,
        source_first_at: row.source_first_at,
        source_last_at: row.source_last_at,
        ranking_rows: row.ranking_rows,
        player_rows: row.player_rows,
        last_error: row.job_last_error,
        created_at: row.job_created_at,
        updated_at: row.job_updated_at,
        completed_at: row.completed_at
      } : null;

      // Recover genuinely stale jobs, but only reflect the transition in this
      // response if this request won the conditional D1 state transition. This
      // prevents a concurrent cancel from being shown as retryable in the UI.
      if (job && (job.status === "RANKINGS" || job.status === "PLAYERS")) {
        const staleByError = Boolean(job.last_error) && !String(job.last_error).startsWith("RETRYABLE:");
        const staleByAge = Number(job.updated_at || job.created_at || 0) > 0 &&
          (Math.floor(Date.now() / 1000) - Number(job.updated_at || job.created_at)) > 15 * 60;
        if (staleByError || staleByAge) {
          const recoveryDetail = job.last_error
            ? String(job.last_error).replace(/^RETRYABLE:(?:RANKINGS|PLAYERS):\d+:/, "").slice(0, 800)
            : "ウォッチリスト更新ジョブが15分以上進行していないため再開待ちです。";
          const recoveryMessage = "RETRYABLE:" + job.status + ":1:" + recoveryDetail;
          const recovered = await env.DB.prepare(
            "UPDATE kingdom_watchlist_jobs SET status = 'FAILED', last_error = ?, updated_at = ? WHERE job_id = ? AND status IN ('RANKINGS','PLAYERS')"
          ).bind(recoveryMessage, Math.floor(Date.now() / 1000), job.job_id).run();
          if (Number(recovered?.meta?.changes || 0) === 1) {
            job = { ...job, status: "FAILED", last_error: recoveryMessage };
          } else {
            const latest = await env.DB.prepare(
              "SELECT status, last_error, updated_at FROM kingdom_watchlist_jobs WHERE job_id = ? LIMIT 1"
            ).bind(job.job_id).first();
            if (latest) job = { ...job, status: latest.status, last_error: latest.last_error, updated_at: latest.updated_at };
          }
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
          ranking_fetch_progress: Math.min(KINGDOM_RANKING_BOARDS.length, Number(job.board_index || 0) + ((job.status === "RANKINGS" || job.status === "FAILED") && Number(job.board_index || 0) < KINGDOM_RANKING_BOARDS.length ? Number(job.player_cursor || 0) : 0)),
          player_cursor: Number(job.player_cursor || 0),
          player_count: playerCount,
          ranking_rows: Number(job.ranking_rows || 0),
          player_rows: Number(job.player_rows || 0),
          last_error: job.last_error && !String(job.last_error).startsWith("RETRYABLE:") ? job.last_error : null,
          retryable: job.status === "FAILED" && String(job.last_error || "").startsWith("RETRYABLE:"),
          retry_attempt: Number((String(job.last_error || "").match(/^RETRYABLE:(?:RANKINGS|PLAYERS):(\d+):/) || [])[1] || 0),
          retry_after_at: job.status === "FAILED" && String(job.last_error || "").startsWith("RETRYABLE:")
            ? Number(job.updated_at || 0) + Math.min(3600, 300 * Math.pow(2, Math.max(0, Number((String(job.last_error || "").match(/^RETRYABLE:(?:RANKINGS|PLAYERS):(\d+):/) || [])[1] || 1) - 1)))
            : null,
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

    // Create a resumable job immediately. The browser starts collection
    // through the existing action=refresh continuation loop after this
    // registration response has returned.
    await ensureKingdomWatchlistFreshnessSchema(env.DB);
    const now = Math.floor(Date.now() / 1000);
    const id = crypto.randomUUID();
    const inserted = await env.DB.prepare(
      "INSERT INTO kingdom_watchlists (watchlist_id, discord_id, kid, top_n, interval_hours, enabled, last_run_at, last_success_at, last_error, created_at, updated_at) " +
      "SELECT ?, ?, ?, ?, ?, 1, ?, NULL, NULL, ?, ? " +
      "WHERE NOT EXISTS (SELECT 1 FROM kingdom_watchlists WHERE discord_id = ? AND kid = ? AND enabled = 1) " +
      "RETURNING watchlist_id"
    ).bind(id, auth.discord_id, kid, topN, intervalHours, now, now, now, auth.discord_id, kid).first();

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

    // Persist the watchlist and its resumable job, then return immediately.
    // Initial data collection is driven by the existing client continuation
    // loop via action=refresh. Keeping network collection out of this request
    // prevents the create request from timing out before the UI learns that
    // registration succeeded.
    const jobId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO kingdom_watchlist_jobs (job_id, watchlist_id, kid, top_n, status, board_index, player_cursor, player_ids_json, observed_at, source_first_at, source_last_at, ranking_rows, player_rows, collection_source, created_at, updated_at) VALUES (?, ?, ?, ?, 'RANKINGS', 0, 0, '[]', ?, NULL, NULL, 0, 0, 'USER', ?, ?)"
    ).bind(jobId, id, kid, topN, now, now, now).run();

    await recordSystemEvent(env.DB, {
      traceId: jobId,
      parentTraceId: operationTraceId,
      eventType: "REGISTERED",
      service: "watchlist",
      feature: "kingdom_watchlist",
      operation: "REGISTER",
      status: "QUEUED",
      targetType: "KINGDOM",
      targetId: String(kid),
      message: "王国ウォッチリスト登録・初期ジョブ作成",
      metadata: { watchlistId: id, jobId, kid, topN, intervalHours, source: "USER" }
    }).catch(error => console.error("kingdom_watchlist_registration_event_failed", error?.message || error));

    await trackServiceUsage(env, auth, "KINGDOM_WATCHLIST_ADD", {
      targetType: "KINGDOM",
      targetId: kid,
      metadata: { top_n: topN, interval_hours: intervalHours, enabled: true }
    });

    return json({
      ok: true,
      watchlist_id: id,
      job_id: jobId,
      initial_refresh_started: true,
      initial_refresh_status: "RANKINGS",
      result: { completed: false, phase: "RANKINGS" }
    });
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
        "SELECT w.watchlist_id, w.kid, w.top_n, j.job_id, j.status, j.last_error, j.board_index, j.player_cursor, j.player_ids_json, j.observed_at, j.source_first_at, j.source_last_at, j.ranking_rows, j.player_rows, j.collection_source, j.created_at, j.updated_at FROM kingdom_watchlists w LEFT JOIN kingdom_watchlist_jobs j ON j.watchlist_id = w.watchlist_id AND (j.status IN ('RANKINGS','PLAYERS') OR (j.status = 'FAILED' AND j.last_error LIKE 'RETRYABLE:%')) WHERE w.watchlist_id = ? AND w.discord_id = ? ORDER BY j.created_at DESC LIMIT 1"
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
      if (active.status === "FAILED" && String(active.last_error || "").startsWith("RETRYABLE:")) {
        const retry = String(active.last_error).match(/^RETRYABLE:(RANKINGS|PLAYERS):(\d+):/);
        if (retry) active.status = retry[1];
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
        if (active.job_id && active.last_error && String(active.last_error).startsWith("RETRYABLE:") && active.status !== "FAILED") {
          await env.DB.prepare(
            "UPDATE kingdom_watchlist_jobs SET status = ?, updated_at = ? WHERE job_id = ? AND status = 'FAILED'"
          ).bind(active.status, now, active.job_id).run();
        }
        let job = active.job_id ? {
          job_id: active.job_id,
          watchlist_id: active.watchlist_id,
          kid: Number(active.kid),
          top_n: Number(active.top_n),
          status: active.status,
          last_error: active.last_error || null,
          board_index: Number(active.board_index || 0),
          player_cursor: Number(active.player_cursor || 0),
          player_ids_json: active.player_ids_json || "[]",
          observed_at: Number(active.observed_at || 0),
          source_first_at: active.source_first_at ?? null,
          source_last_at: active.source_last_at ?? null,
          ranking_rows: Number(active.ranking_rows || 0),
          player_rows: Number(active.player_rows || 0),
          collection_source: String(active.collection_source || "OPERATOR"),
          created_at: active.created_at,
          updated_at: active.updated_at
        } : null;
    
        if (!job) {
          const jobId = crypto.randomUUID();
          await env.DB.prepare(
            "INSERT INTO kingdom_watchlist_jobs (job_id, watchlist_id, kid, top_n, status, board_index, player_cursor, player_ids_json, observed_at, source_first_at, source_last_at, ranking_rows, player_rows, collection_source, created_at, updated_at) VALUES (?, ?, ?, ?, 'RANKINGS', 0, 0, '[]', ?, NULL, NULL, 0, 0, 'USER', ?, ?)"
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
          const message = String(error?.userMessage || error?.message || error).slice(0, 850);
          const capacityWaitCode = getApiPoolCapacityWaitCode(error);
          const previousRetry = String(job.last_error || "").match(/^RETRYABLE:(RANKINGS|PLAYERS):(\d+):/);
          const retryCount = Math.min(99, (Number(previousRetry?.[2]) || 0) + 1);
          const retryPhase = job.status === "PLAYERS" ? "PLAYERS" : "RANKINGS";
          const retryable = Boolean(capacityWaitCode) || (retryCount <= 5 &&
            !message.startsWith("USER_CANCELLED:"));
          const storedError = retryable
            ? "RETRYABLE:" + retryPhase + ":" + (capacityWaitCode ? 1 : retryCount) + ":" + message
            : message;
          const failedAt = Math.floor(Date.now() / 1000);
          await env.DB.prepare(
            "UPDATE kingdom_watchlist_jobs SET status = 'FAILED', last_error = ?, updated_at = ? WHERE job_id = ? AND status IN ('RANKINGS','PLAYERS')"
          ).bind(storedError.slice(0, 1000), failedAt, job.job_id).run();
          await env.DB.prepare(
            "UPDATE kingdom_watchlists SET last_run_at = ?, last_error = ?, updated_at = ? WHERE watchlist_id = ? AND EXISTS (SELECT 1 FROM kingdom_watchlist_jobs WHERE job_id = ? AND status = 'FAILED' AND last_error = ?)"
          ).bind(failedAt, capacityWaitCode ? null : message, failedAt, watchlistId, job.job_id, storedError.slice(0, 1000)).run();
          await recordDiagnostic(env.DB, {
            service: "watchlist",
            feature: "kingdom_watchlist",
            operation: "MANUAL_REFRESH",
            status: capacityWaitCode ? "WAITING" : "FAILED",
            errorCode: capacityWaitCode || String(error?.code || message || "WATCHLIST_REFRESH_FAILED").split(":")[0],
            message,
            targetType: "WATCHLIST",
            targetId: watchlistId,
            metadata: { jobId: job.job_id, source: "MANUAL", poolAvailability: error?.poolAvailability || null }
          });
          if (capacityWaitCode) {
            return json({
              ok: true,
              watchlist_id: watchlistId,
              job_id: job.job_id,
              status: "WAITING",
              retryable: true,
              retry_after_at: failedAt + 300,
              message: "API Poolの空き待ちです。空きができ次第、自動再試行します。"
            }, 202);
          }
          console.error("kingdom_watchlist_manual_refresh_failed", watchlistId, message);
          return json({ ok: false, error: "WATCHLIST_REFRESH_FAILED", message, pool_availability: error?.poolAvailability || null }, 500);
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
      "SELECT watchlist_id, kid, (SELECT job_id FROM kingdom_watchlist_jobs WHERE watchlist_id = kingdom_watchlists.watchlist_id ORDER BY created_at DESC LIMIT 1) AS job_id FROM kingdom_watchlists WHERE watchlist_id = ? AND discord_id = ? LIMIT 1"
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
    await recordSystemEvent(env.DB, {
      traceId: target.job_id || operationTraceId,
      parentTraceId: operationTraceId,
      eventType: "CANCEL_REQUESTED",
      service: "watchlist",
      feature: "kingdom_watchlist",
      operation: "CANCEL",
      status: "CANCELLED",
      targetType: "KINGDOM",
      targetId: String(target.kid),
      message: "王国ウォッチリストの中断要求を受け付けました。",
      metadata: { watchlistId, jobId: target.job_id || null, source: "USER" }
    }).catch(error => console.error("kingdom_watchlist_cancel_event_failed", error?.message || error));

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
  let operational;
  try {
    [data, operational] = await Promise.all([
      getSystemDiagnostics(env.DB, { recentLimit: 100 }),
      getOperationalStatus(env.DB).catch(() => null)
    ]);
  } catch (error) {
    const message = String(error?.message || error);
    console.error("diagnostics_page_failed", message);
    return eagleEyeHtmlResponse(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>System Status | EagleEye</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f5f7;color:#1d1d1f;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text",system-ui,sans-serif}.wrap{max-width:760px;margin:auto;padding:48px 20px}.panel{background:#fff;border:1px solid #d2d2d7;border-radius:28px;padding:28px;box-shadow:0 4px 18px rgba(0,0,0,.05)}.icon{width:52px;height:52px;border-radius:50%;background:#ff3b30;color:#fff;display:grid;place-items:center;font-size:25px;font-weight:800}.eyebrow{margin-top:22px;color:#86868b;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.title{margin:7px 0;font-size:30px;letter-spacing:-.03em}.message{color:#6e6e73;line-height:1.6}.error{margin-top:20px;padding:14px 16px;background:#f5f5f7;border-radius:14px;color:#6e6e73;font-size:12px;word-break:break-word}.back{display:inline-block;margin-top:22px;color:#0071e3;text-decoration:none;font-weight:600}</style></head><body><main class="wrap"><section class="panel"><div class="icon">!</div><div class="eyebrow">EagleEye System Status</div><h1 class="title">システム状況を取得できません</h1><p class="message">診断データの読み込みに失敗しました。現在の状態を確認できるまで、エラー内容を保持しています。</p><div class="error">${escapeHtml(message)}</div><a class="back" href="/admin">管理画面へ戻る →</a></section></main></body></html>`);
  }

  const overall = data.overall;
  const state = overall === "SUCCESS" ? { label:"すべて正常", tone:"good", icon:"✓", note:"すべての監視対象サービスが正常に動作しています。" }
    : overall === "CRITICAL" ? { label:"主要サービスに障害", tone:"bad", icon:"!", note:"主要サービスの一部で障害が発生しています。詳細を確認してください。" }
    : overall === "WAITING" ? { label:"一時待機中", tone:"neutral", icon:"…", note:"API Poolの空き待ちです。実障害とは区別して表示しています。" }
    : { label:"一部注意", tone:"warn", icon:"i", note:"一部のサービスで注意または未診断の状態があります。" };

  const serviceState = (status) => status === "SUCCESS"
    ? {label:"正常",tone:"good",icon:"✓"}
    : status === "FAILED" ? {label:"障害",tone:"bad",icon:"!"}
    : status === "WARNING" ? {label:"注意",tone:"warn",icon:"!"}
    : status === "WAITING" ? {label:"待機中",tone:"neutral",icon:"…"}
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

  const collectorItems = [
    {
      label: "Kingdom Discovery",
      state: operational?.kingdomCatalog?.state || "UNKNOWN",
      detail: operational?.kingdomCatalog ? "Page " + operational.kingdomCatalog.nextPage + " / 発見 " + operational.kingdomCatalog.kingdomsSeen + " / Catalog " + operational.kingdomCatalog.catalogTotal : "状態取得不可"
    },
    {
      label: "Kingdom Seeder",
      state: operational?.kingdomSeeder?.state || "UNKNOWN",
      detail: operational?.kingdomSeeder ? "Cursor " + operational.kingdomSeeder.catalogCursor + " / 成功 " + operational.kingdomSeeder.successCount + " / 失敗 " + operational.kingdomSeeder.failedCount : "状態取得不可"
    },
    {
      label: "Alliance Roller",
      state: operational?.allianceRoller?.state || "UNKNOWN",
      detail: operational?.allianceRoller ? "Cursor " + operational.allianceRoller.catalogCursor + " / 成功 " + operational.allianceRoller.successCount + " / 失敗 " + operational.allianceRoller.failedCount : "状態取得不可"
    },
    {
      label: "Player Roller",
      state: operational?.playerRoller?.state || "UNKNOWN",
      detail: operational?.playerRoller ? "KID " + (operational.playerRoller.lastKid ?? "—") + " / Player " + (operational.playerRoller.lastGovernorId ?? "—") + " / 成功 " + operational.playerRoller.successCount + " / 失敗 " + operational.playerRoller.failedCount : "状態取得不可"
    },
    {
      label: "Ranking Roller",
      state: operational?.kingdomRankingRoller?.state || "UNKNOWN",
      detail: operational?.kingdomRankingRoller ? "KID " + (operational.kingdomRankingRoller.lastKid ?? "—") + " / Board " + (operational.kingdomRankingRoller.lastBoard ?? "—") + " / 成功 " + operational.kingdomRankingRoller.successCount + " / 失敗 " + operational.kingdomRankingRoller.failedCount : "状態取得不可"
    },
    {
      label: "Kingdom Portal",
      state: operational?.kingdomPortal?.state || "UNKNOWN",
      detail: operational?.kingdomPortal ? (operational.kingdomPortal.lastOperation || "未実行") + " / " + (operational.kingdomPortal.lastEventAt ? new Date(operational.kingdomPortal.lastEventAt * 1000).toLocaleString("ja-JP") : "時刻なし") : "状態取得不可"
    },
    {
      label: "Mighty Events / KvK",
      state: operational?.kingdomMighty?.state || "UNKNOWN",
      detail: operational?.kingdomMighty ? (operational.kingdomMighty.lastOperation || "未実行") + " / " + (operational.kingdomMighty.lastEventAt ? new Date(operational.kingdomMighty.lastEventAt * 1000).toLocaleString("ja-JP") : "時刻なし") : "状態取得不可"
    },
    {
      label: "Discord Change Notification",
      state: operational?.discordNotification?.state || "UNKNOWN",
      detail: operational?.discordNotification ? (operational.discordNotification.lastOperation || "未実行") + " / " + (operational.discordNotification.lastEventAt ? new Date(operational.discordNotification.lastEventAt * 1000).toLocaleString("ja-JP") : "時刻なし") : "状態取得不可"
    },
    {
      label: "Global Collection Semaphore",
      state: operational?.collectionSemaphore?.state || "UNKNOWN",
      detail: operational?.collectionSemaphore ? "Active " + (operational.collectionSemaphore.active ?? "—") + " / Available " + (operational.collectionSemaphore.available ?? "—") + " / Capacity " + (operational.collectionSemaphore.capacity ?? 26) : "状態取得不可"
    }
  ].map(item => {
    const st = item.state === "AVAILABLE" || item.state === "IDLE" || item.state === "SUCCESS" || item.state === "NORMAL"
      ? { tone:"good", label:"正常" }
      : item.state === "WARNING" || item.state === "PAUSED" || item.state === "CAUTION"
        ? { tone:"warn", label:"注意" }
        : item.state === "UNKNOWN"
          ? { tone:"neutral", label:"未確認" }
          : { tone:"bad", label:"停止/障害" };
    return "<div class='collector-row'><div><b>"+esc(item.label)+"</b><small>"+esc(item.detail)+"</small></div><span class='"+st.tone+"'>"+st.label+"</span></div>";
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
*{box-sizing:border-box}html{background:#f5f5f7}body{margin:0;background:#f5f5f7;color:#1d1d1f;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text",system-ui,sans-serif;-webkit-font-smoothing:antialiased}.wrap{max-width:860px;margin:auto;padding:20px 16px 50px}.nav{display:flex;align-items:center;justify-content:space-between;padding:4px 4px 22px}.back{color:#0071e3;text-decoration:none;font-size:14px;font-weight:600}.live{display:flex;align-items:center;gap:7px;color:#86868b;font-size:12px}.live-dot{width:7px;height:7px;border-radius:50%;background:#34c759}.hero{background:#fff;border-radius:28px;padding:30px 26px;border:1px solid #d2d2d7;box-shadow:0 6px 24px rgba(0,0,0,.05)}.hero-line{display:flex;align-items:center;gap:16px}.hero-icon{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;font-size:25px;font-weight:800}.hero-icon.good{background:#e8f8ed;color:#1b8a3e}.hero-icon.warn{background:#fff4d6;color:#b77900}.hero-icon.bad{background:#ffe9e7;color:#d70015}.hero-icon.neutral{background:#f2f2f7;color:#6e6e73}.eyebrow{color:#86868b;font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase}.hero h1{margin:3px 0 0;font-size:30px;letter-spacing:-.035em}.note{margin:20px 0 0;color:#6e6e73;line-height:1.55}.stats{display:grid;grid-template-columns:repeat(4,1fr);margin-top:24px;border-top:1px solid #e5e5ea;padding-top:20px}.stat{text-align:center;border-right:1px solid #e5e5ea}.stat:last-child{border-right:0}.stat b{display:block;font-size:22px;letter-spacing:-.03em}.stat span{display:block;margin-top:4px;color:#86868b;font-size:11px}.section{margin-top:28px}.section-head{display:flex;align-items:end;justify-content:space-between;padding:0 5px 10px}.section-head h2{margin:0;font-size:20px;letter-spacing:-.02em}.section-head span{color:#86868b;font-size:11px}.card{background:#fff;border:1px solid #d2d2d7;border-radius:22px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,.035)}.collector-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:15px 18px;border-bottom:1px solid #e5e5ea}.collector-row:last-child{border-bottom:0}.collector-row b{display:block;font-size:14px}.collector-row small{display:block;margin-top:4px;color:#86868b;font-size:11px}.collector-row>span{font-size:12px;font-weight:700;white-space:nowrap}.service{display:flex;align-items:center;gap:13px;padding:16px 18px;border-bottom:1px solid #e5e5ea}.service:last-child{border-bottom:0}.service-icon,.mini-icon{flex:0 0 auto;width:27px;height:27px;border-radius:50%;display:grid;place-items:center;font-size:13px;font-weight:800}.service-main{flex:1;min-width:0}.service-name{font-size:15px;font-weight:650}.service-time{margin-top:3px;color:#86868b;font-size:11px}.service-state{font-size:12px;font-weight:700}.good{color:#1b8a3e}.warn{color:#b77900}.bad{color:#d70015}.neutral{color:#6e6e73}.event{border-bottom:1px solid #e5e5ea}.event:last-child{border-bottom:0}.event summary{list-style:none;cursor:pointer;padding:16px 18px;display:flex;align-items:center;gap:10px}.event summary::-webkit-details-marker{display:none}.event-title{font-size:14px;font-weight:650}.event-op{color:#86868b;font-size:11px}.event-time{margin-left:auto;color:#86868b;font-size:11px;text-align:right}.event-body{padding:0 18px 18px}.event-status{font-size:12px;font-weight:700}.event-body p{margin:9px 0 14px;color:#6e6e73;font-size:13px;line-height:1.6;word-break:break-word}.facts{display:flex;gap:7px;flex-wrap:wrap;margin:8px 0 14px}.facts span{padding:6px 9px;background:#f5f5f7;border-radius:9px;color:#6e6e73;font-size:11px}.details-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.details-grid div{background:#f5f5f7;border-radius:11px;padding:9px}.discord-config-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 16px;border-bottom:1px solid #e5e5ea}.discord-config-row:last-child{border-bottom:0}.discord-config-row b{display:block;font-size:12px}.discord-config-row small{display:block;margin-top:3px;color:#86868b;font-size:9px}.discord-config-value{text-align:right;font-size:11px;font-weight:800}.discord-config-value span{display:block;margin-top:3px;color:#6e6e73;font-size:9px;font-weight:500;word-break:break-all;max-width:260px}.details-grid small{display:block;color:#86868b;font-size:10px}.details-grid b{display:block;margin-top:3px;font-size:11px;word-break:break-all}.event details{margin-top:10px;border-top:1px solid #e5e5ea}.event details summary{padding:11px 0;font-size:11px;color:#0071e3}.json{margin:0;padding:12px;background:#1d1d1f;color:#f5f5f7;border-radius:12px;max-height:360px;overflow:auto;white-space:pre-wrap;word-break:break-word;font-size:10px;line-height:1.5}.empty{padding:28px;text-align:center;color:#86868b;font-size:13px}.footer{display:flex;justify-content:space-between;gap:12px;margin:18px 4px;color:#86868b;font-size:11px}.footer a{color:#0071e3;text-decoration:none}@media(max-width:600px){.wrap{padding:12px 10px 40px}.hero{padding:23px 18px;border-radius:22px}.hero h1{font-size:25px}.stats{grid-template-columns:repeat(2,1fr);gap:14px}.stat{border-right:0}.stat:nth-child(-n+2){padding-bottom:3px;border-bottom:1px solid #e5e5ea}.service{padding:14px}.service-time{font-size:10px}.event summary{padding:14px}.event-op{display:none}.event-time{font-size:10px}.details-grid{grid-template-columns:1fr}.footer{flex-direction:column}}
</style></head><body><main class="wrap"><nav class="nav"><a class="back" href="/admin">‹ 管理画面</a><div class="live"><span class="live-dot"></span>30秒ごとに自動更新</div></nav><section class="hero"><div class="hero-line"><div class="hero-icon ${state.tone}">${state.icon}</div><div><div class="eyebrow">EagleEye System Status</div><h1>${state.label}</h1></div></div><p class="note">${state.note}</p><div class="stats"><div class="stat"><b>${data.counts.healthy}</b><span>正常</span></div><div class="stat"><b>${data.counts.warning}</b><span>注意</span></div><div class="stat"><b>${data.counts.failed}</b><span>障害</span></div><div class="stat"><b>${data.counts.unknown}</b><span>未診断</span></div></div></section><section class="section"><div class="section-head"><h2>サービス</h2><span>${data.services.length}項目</span></div><div class="card">${services}</div></section><section class="section"><div class="section-head"><h2>データ収集基盤</h2><span>Catalog / Seeder / Alliance / Player / Ranking / Semaphore</span></div><div class="card">${collectorItems}</div></section><section class="section"><div class="section-head"><h2>Discord Support 設定</h2><span>秘密情報は非表示</span></div><div class="card"><div class="discord-config-row"><div><b>Interactions Endpoint</b><small>Discord Developer Portal に設定するURL</small></div><div class="discord-config-value good"><span>${esc(discordConfig.endpoint)}</span></div></div>${discordRows}</div></section><section class="section"><div class="section-head"><h2>最近の診断</h2><span>最新40件</span></div><div class="card">${events}</div></section><footer class="footer"><span>EagleEye Diagnostics</span><a href="/admin">管理画面へ戻る</a></footer></main></body></html>`);
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

async function fetchMightPulseProbeThroughPool(env, spec, actor = null) {
  configureApiPoolEncryption(env.EAGLEEYE_SESSION_SECRET);
  let lease = null;
  let poolType = null;
  let probeStartedAt = Date.now();

  try {
    lease = await leaseProbeApiKey(env, {
      mightyRequired:false, purpose:"MIGHTPULSE_PROBE",
      targetType:spec.targetType, targetId:spec.targetId
    });
    poolType = lease.pool_type;

    probeStartedAt = Date.now();
    const requestStartedAt = probeStartedAt;
    const result = await mightPulseFetch(env, spec.path, { query: spec.query, apiKey: lease.api_key, metadata: { leaseId: lease.lease_id, poolType: lease.pool_type } });
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

    // Comparison investigation mode: expose game-profile fields needed to validate
    // the MightPulse schema. Never include request headers, API keys, or tokens.
    const diagnosticPayload = (() => {
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
      const allowed = ["player", "heroes", "gov_gear", "ranks", "base", "data"];
      const out = {};
      for (const key of allowed) {
        if (payload[key] !== undefined) out[key] = payload[key];
      }
      const player = out.player && typeof out.player === "object" ? out.player : null;
      if (player) {
        for (const key of ["heroes", "gov_gear", "ranks", "base"]) {
          if (player[key] !== undefined && out[key] === undefined) out[key] = player[key];
        }
      }
      return out;
    })();

    await releaseProbeApiKey(env, lease, {
      success:true, endpoint:spec.endpoint, targetType:spec.targetType, targetId:spec.targetId,
      purpose:"MIGHTPULSE_PROBE", httpStatus:result.status,
      remainingMinute:parseHeaderNumber(result.headers,"x-ratelimit-remaining"),
      remainingDay:parseHeaderNumber(result.headers,"x-ratelimit-day-remaining")
    });

    const safePayload = redactProbeSecrets(payload);
    let productionSave={saved:false,destination:"R2",reason:"NO_CONFIRMED_PRODUCTION_MAPPING"};
    try { productionSave=await persistKnownProbeResponse(env,{path:spec.path,query:spec.query||{},payload:safePayload,httpStatus:result.status,actorRole:actor?.role||null}); }
    catch(saveError) { productionSave={saved:false,destination:"R2",reason:"PRODUCTION_SAVE_FAILED",error:safeProbeErrorMessage(saveError,lease?.api_key).slice(0,300)}; }
    const archiveRecord = {
      request_id: crypto.randomUUID(), user_id: actor?.user_id || null, actor_discord_id: actor?.discord_id || null, actor_label: actor?.global_name || actor?.username || (actor?.discord_id ? "Discord " + actor.discord_id : "Admin"), actor_role: actor?.role || null, command_type: spec.targetType, endpoint: spec.endpoint,
      query: spec.query, status: "SUCCESS", http_status: result.status,
      elapsed_ms: responseReceivedAt - requestStartedAt,
      started_at: new Date(requestStartedAt).toISOString(), completed_at: new Date(responseReceivedAt).toISOString(),
      trigger_reason: "MANUAL", raw_payload: safePayload, field_dictionary:buildProbeFieldDictionary(safePayload), production_save:productionSave,
      save_destination:productionSave.saved?"R2+PRODUCTION":"R2", key_source:lease?.pool_type || lease?.source_type || null, key_id:lease?.key_id || null, key_owner_user_id:lease?.key_owner_user_id || lease?.contributed_by_user_id || null
    };
    let archive = null;
    try { archive = await archiveMightPulseProbeRecord(env, archiveRecord); }
    catch (archiveError) { archive = { request_id: archiveRecord.request_id, r2_saved:false, metadata_saved:false, archive_error:safeProbeErrorMessage(archiveError,lease?.api_key).slice(0,300) }; }

    return {
      ok: true,
      probe: {
        request_id: archiveRecord.request_id,
        actor: { user_id: actor?.user_id || null, discord_id: actor?.discord_id || null, label: actor?.global_name || actor?.username || (actor?.discord_id ? "Discord " + actor.discord_id : "Admin"), role: actor?.role || null },
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
        diagnostic_payload: redactProbeSecrets(diagnosticPayload),
        raw_payload: safePayload,
        field_dictionary: buildProbeFieldDictionary(safePayload),
        production_save: productionSave,
        archive,
        timestamp_like_fields: timestampFields,
        response_sha256: responseHash,
        section_sha256: sectionHashes
      }
    };
  } catch (error) {
    const status = Number(error?.status || 0);
    if (lease) {
      const cooldown = status === 429 ? 60 : status >= 500 || error?.code === "MIGHTPULSE_TIMEOUT" || error?.code === "MIGHTPULSE_NETWORK_ERROR" ? 15 : 0;
      const keepAvailable = cooldown === 0 && (status === 400 || status === 403 || status === 404);
      try {
        await releaseProbeApiKey(env, lease, {
          endpoint:spec.endpoint, targetType:spec.targetType, targetId:spec.targetId,
          purpose:"MIGHTPULSE_PROBE", httpStatus:status,
          errorCode:error?.code || "MIGHTPULSE_REQUEST_FAILED",
          errorMessage:safeProbeErrorMessage(error,lease?.api_key) || null, cooldownSeconds:cooldown, keepAvailable
        });
      } catch {}
    }
    const failedAt = Date.now();
    try {
      await archiveMightPulseProbeRecord(env, {
        request_id: crypto.randomUUID(), user_id: actor?.user_id || null, actor_discord_id: actor?.discord_id || null, actor_label: actor?.global_name || actor?.username || (actor?.discord_id ? "Discord " + actor.discord_id : "Admin"), actor_role: actor?.role || null, command_type: spec.targetType,
        endpoint: spec.endpoint, query: spec.query, status: "FAILED", http_status: status || null,
        elapsed_ms: failedAt - probeStartedAt, retry_count:Math.max(0,Number(error?.attempts||1)-1), started_at: new Date(probeStartedAt).toISOString(),
        completed_at: new Date(failedAt).toISOString(), trigger_reason: "MANUAL",
        key_source:lease?.pool_type||lease?.source_type||null,key_id:lease?.key_id||null,key_owner_user_id:lease?.key_owner_user_id||lease?.contributed_by_user_id||null,
        error_code: error?.code || "MIGHTPULSE_REQUEST_FAILED",
        error_message: safeProbeErrorMessage(error,lease?.api_key),
        diagnostic: safeProbeDiagnostic(error?.details || null,lease?.api_key)
      });
    } catch {}
    try {
      error.message = safeProbeErrorMessage(error, lease?.api_key);
      if (error?.details != null) error.details = safeProbeDiagnostic(error.details, lease?.api_key);
    } catch {}
    throw error;
  }
}

async function handleKingdomCatalogR2BackfillApi(request, env) {
  const guard = await requireOwner(request, env);
  if (guard.error) return guard.error;

  try {
    if (request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      if (String(body?.action || "").toLowerCase() === "verify") {
        return json({ ok: true, verification: await verifyKingdomCatalogR2Backfill(env) });
      }
    }

    if (request.method === "GET") {
      const row = await env.DB.prepare(
        "SELECT migration_key, last_kid, state, batches_run, rows_archived, last_batch_count, last_batch_at, last_success_at, last_error, updated_at FROM kingdom_catalog_r2_migration WHERE migration_key = 'KINGDOM_CATALOG_R2_BACKFILL' LIMIT 1"
      ).first();
      if (!row) return json({ ok:false, error:"R2_BACKFILL_STATE_NOT_FOUND" }, 503);
      return json({
        ok:true,
        migrationKey: row.migration_key,
        state: row.state,
        lastKid: Number(row.last_kid || 0),
        batchesRun: Number(row.batches_run || 0),
        rowsArchived: Number(row.rows_archived || 0),
        lastBatchCount: Number(row.last_batch_count || 0),
        lastBatchAt: row.last_batch_at == null ? null : Number(row.last_batch_at),
        lastSuccessAt: row.last_success_at == null ? null : Number(row.last_success_at),
        lastError: row.last_error || null,
        updatedAt: row.updated_at == null ? null : Number(row.updated_at)
      });
    }

    if (request.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
    const body = await request.json().catch(() => ({}));
    const batchSize = Math.min(100, Math.max(1, Number(body?.batch_size) || 10));
    const result = await runKingdomCatalogR2Backfill(env, { batchSize });
    const verification = result.archived > 0
      ? await verifyKingdomCatalogR2Backfill(env, { batchSize: result.archived })
      : { checked: 0, r2: 0, pointer: 0, rawNull: 0, boardsNull: 0, failed: 0, rows: [] };
    return json({ ...result, verification });
  } catch (error) {
    return json({
      ok: false,
      error: error?.code || error?.message || "KINGDOM_CATALOG_R2_BACKFILL_FAILED",
      message: String(error?.message || error).slice(0, 2000)
    }, 500);
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

function safeProbeErrorMessage(error, apiKey = null) {
  let message = String(error?.message || error || "MIGHTPULSE_REQUEST_FAILED");
  const secret = String(apiKey || "");
  if (secret) message = message.split(secret).join("[REDACTED]");
  message = message
    .replace(/(authorization\s*[:=]\s*)(?:bearer\s+)?[^\s,;]+/ig, "$1[REDACTED]")
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|credential)\s*[:=]\s*)[^\s,;]+/ig, "$1[REDACTED]");
  return message.slice(0, 1000);
}

function safeProbeDiagnostic(value, apiKey = null) {
  const walk = input => {
    if (typeof input === "string") return safeProbeErrorMessage(input, apiKey);
    if (Array.isArray(input)) return input.map(walk);
    if (!input || typeof input !== "object") return input;
    const out = {};
    for (const [key, child] of Object.entries(input)) {
      out[key] = SECRET_PROBE_DIAGNOSTIC_FIELD.test(key) ? "[REDACTED]" : walk(child);
    }
    return out;
  };
  return walk(redactProbeSecrets(value));
}
const SECRET_PROBE_DIAGNOSTIC_FIELD = /(?:^key$|api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|secret|password|credential)/i;


async function leaseProbeApiKey(env, { mightyRequired = false, purpose = "MIGHTPULSE_PROBE", targetType = null, targetId = null } = {}) {
  configureApiPoolEncryption(env.EAGLEEYE_SESSION_SECRET);
  // Probe shares every existing API Pool class. Keep at least one otherwise-eligible
  // key unleased for normal EagleEye users/jobs; the atomic claim query enforces this
  // reserve even when several Probe commands start concurrently.
  const borrowed = await leaseApiKey(env.DB, {
    poolTypes: ["SYSTEM_GENERAL", "SYSTEM_WATCHLIST", "USER_CONTRIBUTED"],
    mightyOnly: mightyRequired,
    reserveAvailableKeys: 1,
    // Ordinary commands prefer non-Mighty keys and leave one confirmed Mighty key
    // available when such a key exists; Mighty-required commands reserve one eligible Mighty key.
    reserveMightyKeys: mightyRequired ? 0 : 1,
    preferNonMighty: !mightyRequired,
    purpose,
    targetType,
    targetId
  });
  return {
    ...borrowed,
    source_type: "API_POOL",
    key_owner_user_id: borrowed.contributed_by_user_id || null
  };
}

async function releaseProbeApiKey(env, lease, options = {}) {
  if (!lease) return;
  if (options.success) {
    await recordApiPoolSuccess(env.DB, {
      keyId: lease.key_id, leaseId: lease.lease_id, poolType: lease.pool_type,
      endpoint: options.endpoint || null, targetType: options.targetType || null,
      targetId: options.targetId || null, purpose: options.purpose || "MIGHTPULSE_PROBE",
      httpStatus: options.httpStatus || 200,
      remainingMinute: options.remainingMinute ?? null, remainingDay: options.remainingDay ?? null
    });
  } else if (options.errorCode || options.cooldownSeconds) {
    await recordApiPoolFailure(env.DB, {
      keyId: lease.key_id, leaseId: lease.lease_id, poolType: lease.pool_type,
      endpoint: options.endpoint || null, targetType: options.targetType || null,
      targetId: options.targetId || null, purpose: options.purpose || "MIGHTPULSE_PROBE",
      httpStatus: options.httpStatus || 0, errorCode: options.errorCode || "MIGHTPULSE_REQUEST_FAILED",
      errorMessage: options.errorMessage || null, cooldownSeconds: options.cooldownSeconds || 0,
      disable: false, keepAvailable: options.keepAvailable === true,
      requestCount: Math.max(1, Number(options.requestCount) || 1)
    });
  } else {
    await releaseApiLease(env.DB, lease.lease_id);
  }
}

async function executeManualMightPulseProbe(request, env, guard, body) {
  const command = validateManualProbeCommand(body || {});
  const apiLockKey = "ADMIN_MIGHTPULSE_PROBE:MANUAL:" + (await sha256HexForProbe({path:command.path,query:command.query})).slice(0,32);
  const apiLockToken = await acquireApiRequestLock(env, apiLockKey);
  if (!apiLockToken) return json({ ok:false, error:"API_REQUEST_IN_PROGRESS", message:"同じコマンドが実行中です。" }, 409);
  configureApiPoolEncryption(env.EAGLEEYE_SESSION_SECRET);
  let lease = null;
  let leaseReleased = false;
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  try {
    lease = await leaseProbeApiKey(env, {
      // Arbitrary manual probes default to ordinary API access; callers may explicitly require Mighty.
      mightyRequired: body?.mighty_required === true,
      purpose: "MIGHTPULSE_PROBE_MANUAL",
      targetType: "MANUAL_COMMAND",
      targetId: command.path
    });
    const result = await mightPulseFetch(env, command.path, {
      method: "GET",
      query: command.query,
      apiKey: lease.api_key,
      maxRetries: 0,
      metadata: { leaseId: lease.lease_id, poolType: lease.pool_type, probeRequestId: requestId }
    });
    const completedAt = Date.now();
    const safePayload = redactProbeSecrets(result.data);
    let productionSave={saved:false,destination:"R2",reason:"NO_CONFIRMED_PRODUCTION_MAPPING"};
    try { productionSave=await persistKnownProbeResponse(env,{path:command.path,query:command.query,payload:safePayload,httpStatus:result.status,actorRole:guard?.auth?.role||null}); }
    catch(saveError) { productionSave={saved:false,destination:"R2",reason:"PRODUCTION_SAVE_FAILED",error:safeProbeErrorMessage(saveError,lease?.api_key).slice(0,300)}; }
    await releaseProbeApiKey(env, lease, {
      success:true, endpoint:command.path, targetType:"MANUAL_COMMAND", targetId:command.path,
      purpose:"MIGHTPULSE_PROBE_MANUAL", httpStatus:result.status,
      remainingMinute:parseHeaderNumber(result.headers,"x-ratelimit-remaining"),
      remainingDay:parseHeaderNumber(result.headers,"x-ratelimit-day-remaining")
    });
    leaseReleased = true;
    const record = {
      request_id: requestId, user_id: guard?.auth?.user_id || guard?.auth?.id || null,
      actor_discord_id: guard?.auth?.discord_id || null,
      actor_label: guard?.auth?.global_name || guard?.auth?.username || (guard?.auth?.discord_id ? "Discord " + guard.auth.discord_id : "Admin"),
      actor_role: guard?.auth?.role || null,
      command_type: "MANUAL", endpoint: command.path, query: command.query,
      status: "SUCCESS", http_status: result.status, elapsed_ms: completedAt-startedAt,
      started_at: new Date(startedAt).toISOString(), completed_at: new Date(completedAt).toISOString(),
      trigger_reason: "MANUAL", raw_payload: safePayload, field_dictionary:buildProbeFieldDictionary(safePayload),
      production_save:productionSave, save_destination:productionSave.saved?"R2+PRODUCTION":"R2",
      key_source:lease?.pool_type||lease?.source_type||null, key_id:lease?.key_id||null, key_owner_user_id:lease?.key_owner_user_id||lease?.contributed_by_user_id||null
    };
    let archive = null;
    try { archive = await archiveMightPulseProbeRecord(env, record); }
    catch (archiveError) { archive = { request_id: requestId, r2_saved:false, metadata_saved:false, archive_error:safeProbeErrorMessage(archiveError,lease?.api_key).slice(0,300) }; }
    return json({ ok:true, probe:{
      request_id: requestId, actor:{user_id:guard?.auth?.user_id||null,discord_id:guard?.auth?.discord_id||null,label:guard?.auth?.global_name||guard?.auth?.username||(guard?.auth?.discord_id?"Discord "+guard.auth.discord_id:"Admin"),role:guard?.auth?.role||null}, type:"MANUAL " + command.path, target_type:"MANUAL_COMMAND",
      target_id: command.path, endpoint: command.path, request_path: command.path,
      query: command.query, pool_type: lease.pool_type, http_status: result.status,
      request_started_at_iso: record.started_at, response_received_at_iso: record.completed_at,
      elapsed_ms: record.elapsed_ms, payload_keys: safePayload && typeof safePayload === "object" && !Array.isArray(safePayload) ? Object.keys(safePayload) : [],
      raw_payload: safePayload, field_dictionary:buildProbeFieldDictionary(safePayload), production_save:productionSave, response_sha256: await sha256HexForProbe(safePayload), archive
    }});
  } catch (error) {
    const status = Number(error?.status || 0);
    if (lease) {
      const cooldown = status === 429 ? 60 : status >= 500 || error?.code === "MIGHTPULSE_TIMEOUT" || error?.code === "MIGHTPULSE_NETWORK_ERROR" ? 15 : 0;
      const keepAvailable = status === 400 || status === 403 || status === 404;
      try {
        await releaseProbeApiKey(env, lease, {
          endpoint:command.path, targetType:"MANUAL_COMMAND", targetId:command.path,
          purpose:"MIGHTPULSE_PROBE_MANUAL", httpStatus:status,
          errorCode:error?.code || "MIGHTPULSE_REQUEST_FAILED",
          errorMessage:safeProbeErrorMessage(error,lease?.api_key) || null, cooldownSeconds:cooldown, keepAvailable
        });
        leaseReleased = true;
      } catch {}
    }
    const completedAt = Date.now();
    const record = {
      request_id: requestId, user_id: guard?.auth?.user_id || guard?.auth?.id || null,
      actor_discord_id: guard?.auth?.discord_id || null,
      actor_label: guard?.auth?.global_name || guard?.auth?.username || (guard?.auth?.discord_id ? "Discord " + guard.auth.discord_id : "Admin"),
      actor_role: guard?.auth?.role || null,
      command_type:"MANUAL", endpoint:command.path, query:command.query,
      status:"FAILED", http_status:status || null, elapsed_ms:completedAt-startedAt,
      started_at:new Date(startedAt).toISOString(), completed_at:new Date(completedAt).toISOString(),
      trigger_reason:"MANUAL", key_source:lease?.pool_type||lease?.source_type||null, key_id:lease?.key_id||null, key_owner_user_id:lease?.key_owner_user_id||lease?.contributed_by_user_id||null,
      error_code:error?.code || "MIGHTPULSE_REQUEST_FAILED",
      error_message:safeProbeErrorMessage(error,lease?.api_key),
      diagnostic:safeProbeDiagnostic(error?.details || null,lease?.api_key)
    };
    try { await archiveMightPulseProbeRecord(env, record); } catch {}
    return json({ ok:false, request_id:requestId, error:error?.code || "MIGHTPULSE_PROBE_FAILED",
      status, message:safeProbeErrorMessage(error,lease?.api_key) || null, diagnostic:safeProbeDiagnostic(error?.details || null,lease?.api_key) },
      status >= 400 && status < 600 ? status : 502);
  } finally {
    if (lease && !leaseReleased) { try { await releaseProbeApiKey(env, lease); } catch {} }
    await releaseApiRequestLock(env, apiLockKey, apiLockToken);
  }
}

function identifyKnownProbeCommand(path, query = {}) {
  const normalizedPath = String(path || "");
  const include = String(query?.include || "base");
  const player = normalizedPath.match(/^\/players\/([^/]+)$/);
  if (player) {
    const idType = String(query?.id_type || "");
    if (idType === "uid") return null;
    if (include === "base,heroes,ranks,gov_gear") return { id:"player_full", params:{governor_id:decodeURIComponent(player[1])}, kind:"PLAYER" };
    if (include === "ranks" || include === "base,ranks") return { id:"player_ranks", params:{governor_id:decodeURIComponent(player[1])}, kind:"PLAYER" };
    if (include === "base") return { id:"player_base", params:{governor_id:decodeURIComponent(player[1])}, kind:"PLAYER" };
  }
  const ranking = normalizedPath.match(/^\/kingdoms\/(\d+)\/ranks$/);
  if (ranking && query?.board && KINGDOM_RANKING_BOARDS.includes(String(query.board))) {
    return { id:"kingdom_rank_board", params:{kid:ranking[1],board:String(query.board),limit:Math.min(100,Math.max(1,Number(query.limit)||100))}, kind:"KINGDOM_RANKING" };
  }
  return null;
}

async function persistKnownProbeResponse(env, { path, query = {}, payload, httpStatus = 200, commandId = null, actorRole = null } = {}) {
  if (!env?.DB || Number(httpStatus) < 200 || Number(httpStatus) >= 300 || !payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { saved:false, destination:"R2", reason:"NOT_A_VALID_SUCCESS_RESPONSE" };
  }
  const playerCommandIds = new Set(["player_base","player_full","player_ranks","eagleeye_player_refresh","eagleeye_player_rank_refresh"]);
  const rankingCommandIds = new Set(["kingdom_rank_board","eagleeye_kingdom_rank_refresh"]);
  const identified = commandId ? { id:commandId, kind:playerCommandIds.has(commandId) ? "PLAYER" : rankingCommandIds.has(commandId) ? "KINGDOM_RANKING" : "OTHER", params:{} } : identifyKnownProbeCommand(path,query);
  if (!identified) return { saved:false, destination:"R2", reason:"NO_CONFIRMED_PRODUCTION_MAPPING" };
  const safePayload = redactProbeSecrets(payload);
  const sourceObservedAt = getMightPulseSourceTimestamp(safePayload);
  const now = Math.floor(Date.now()/1000);

  if (identified.kind === "PLAYER") {
    // materializePlayer requires the documented observation envelope to contain a player object.
    // Reject unknown response shapes before writing even an API observation to production D1.
    if (!safePayload.player || typeof safePayload.player !== "object" || Array.isArray(safePayload.player)) {
      return { saved:false, destination:"R2", reason:"PLAYER_PAYLOAD_SHAPE_UNCONFIRMED" };
    }
    const playerPayload = safePayload.player;
    // Never infer the returned player's identity from the request path alone.
    // Use only explicit governor_id values and validate the response against the requested target.
    const governorId = normalizeGovernorId(playerPayload.governor_id ?? safePayload.governor_id);
    if (!governorId) return { saved:false, destination:"R2", reason:"PLAYER_ID_MISSING" };
    const pathMatch=String(path||"").match(/^\/players\/([^/]+)$/);
    const requestedId=identified.params?.governor_id || (pathMatch&&String(query?.id_type||"")!=="uid"?decodeURIComponent(pathMatch[1]):null);
    if (requestedId && identified.id !== "player_uid" && normalizeGovernorId(requestedId) !== governorId) return { saved:false, destination:"R2", reason:"PLAYER_ID_MISMATCH" };
    const observationData = observationEnvelope({ endpoint:"/players/:governor_id", httpStatus:Number(httpStatus)||200, raw:safePayload, sourceObservedAt });
    const savedObservation = await saveApiObservation(env.DB,observationData);
    const observation = { ...observationData, observation_id:savedObservation.observation_id, payload:safePayload };
    const existing = await getPlayer(env.DB,governorId);
    await materializePlayer(env.DB,observation,existing,env.ARCHIVE,env.HISTORY_STORAGE_MODE);
    const heroPayload = Array.isArray(safePayload.heroes) ? safePayload.heroes : Array.isArray(playerPayload.heroes) ? playerPayload.heroes : [];
    if (heroPayload.length) { try { await queueHeroIconCandidates(env.DB,heroPayload,value=>localizeHeroName(value)); } catch (error) { console.error("probe_hero_icon_queue_failed",error?.message||error); } }
    const ranks = playerPayload.ranks || safePayload.ranks;
    let rankSnapshotSaved=false;
    if (ranks && typeof ranks==="object" && !Array.isArray(ranks) && Object.keys(ranks).length) {
      const visibilitySettings=await getPlayerVisibilitySettings(env.DB);
      const role=String(actorRole||"ADMIN").toUpperCase();
      const ranksVisible=visibilityEnabled(visibilitySettings,"ranks_core",role)||visibilityEnabled(visibilitySettings,"ranks_leaderboards",role);
      if (ranksVisible) {
        await savePlayerRankSnapshot(env.DB,{governorId,uid:playerPayload.uid??safePayload.uid??null,kid:playerPayload.kid??safePayload.kid??null,ranks,observedAt:observation.observed_at,sourceObservedAt:observation.source_observed_at??null,sourceObservationId:observation.observation_id,archiveBucket:env.ARCHIVE,historyMode:env.HISTORY_STORAGE_MODE});
        rankSnapshotSaved=true;
      }
    }
    return { saved:true,destination:rankSnapshotSaved?"API_OBSERVATIONS+PLAYER_CURRENT+PLAYER_RANK_SNAPSHOTS":"API_OBSERVATIONS+PLAYER_CURRENT",observation_id:observation.observation_id,governor_id:governorId,rank_snapshot_saved:rankSnapshotSaved };
  }
  if (identified.kind === "KINGDOM_RANKING") {
    const pathMatch=String(path||"").match(/^\/kingdoms\/(\d+)\/ranks$/);
    const kid=Number(identified.params?.kid ?? pathMatch?.[1]);
    const board=String(identified.params?.board||query?.board||"");
    if (!Number.isInteger(kid)||kid<0||!KINGDOM_RANKING_BOARDS.includes(board)) return {saved:false,destination:"R2",reason:"RANKING_TARGET_INVALID"};
    await ensureKingdomWatchlistFreshnessSchema(env.DB);
    const entries=extractKingdomRankingEntries(safePayload).slice(0,100);
    if (!entries.length) return {saved:false,destination:"R2",reason:"RANKING_ENTRIES_EMPTY"};
    const comparison=await getKingdomRankingChanges(env.DB,{kid,board,entries,observedAt:now});
    const savedRows=await saveKingdomRankingBoard(env.DB,{kid,board,entries:comparison.changedEntries,removedTargets:comparison.removedTargets,entriesAlreadyFiltered:true,observedAt:now,sourceObservedAt,checkedAt:now,archiveBucket:env.ARCHIVE,historyMode:env.HISTORY_STORAGE_MODE});
    return {saved:true,destination:"KINGDOM_RANKING_CURRENT+HISTORY",kid,board,rows_saved:savedRows};
  }
  return {saved:false,destination:"R2",reason:"NO_CONFIRMED_PRODUCTION_MAPPING"};
}

function probeResponseCount(payload) {
  if (Array.isArray(payload)) return payload.length;
  if (!payload || typeof payload !== "object") return 0;
  for (const value of Object.values(payload)) if (Array.isArray(value)) return value.length;
  return 1;
}

function probeBatchItemKey(item) {
  try {
    const command=buildCatalogProbeCommand(item.command_id,item.params||{});
    return command.path+":"+JSON.stringify(command.query||{});
  } catch {
    const entry=MIGHTPULSE_PROBE_COMMANDS.find(command=>command.id===item.command_id);
    return (entry?.endpoint||String(item.command_id||""))+":"+JSON.stringify(entry?.query||{})+":"+JSON.stringify(item.params||{});
  }
}

async function executeCatalogProbeItem(env, guard, batchId, item) {
  const entry = MIGHTPULSE_PROBE_COMMANDS.find(command => command.id === item.command_id);
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  let command = null;
  let lease = null;
  try {
    command = buildCatalogProbeCommand(item.command_id, item.params || {});
  } catch (error) {
    const record = {
      request_id:requestId, user_id:guard?.auth?.user_id || guard?.auth?.id || null,
      actor_discord_id:guard?.auth?.discord_id || null, actor_label:guard?.auth?.global_name || guard?.auth?.username || null, actor_role:guard?.auth?.role || null,
      command_type:item.command_id || "UNKNOWN", endpoint:entry?.endpoint || "",
      status:"SKIPPED", http_status:null, elapsed_ms:0, trigger_reason:item.trigger_reason || "MANUAL",
      batch_id:batchId, sequence_no:item.sequence_no, discovered_from:item.discovered_from || null,
      response_count:0, retry_count:0, save_destination:"R2",
      error_code:String(error?.message || "PROBE_COMMAND_SKIPPED").slice(0,100)
    };
    let archive = null;
    try { archive = await archiveMightPulseProbeRecord(env, record); } catch {}
    return { ok:false, status:"SKIPPED", command_id:item.command_id, sequence_no:item.sequence_no, endpoint:entry?.endpoint || "", error:record.error_code, archive };
  }

  try {
    lease = await leaseProbeApiKey(env, {
      mightyRequired:command.requiresMighty,
      purpose:"MIGHTPULSE_PROBE_BATCH",
      targetType:command.category,
      targetId:command.path
    });
    const result = await mightPulseFetch(env, command.path, {
      method:"GET", query:command.query, apiKey:lease.api_key, maxRetries:1,
      metadata:{ leaseId:lease.lease_id, poolType:lease.pool_type, probeBatchId:batchId, probeSequence:item.sequence_no }
    });
    const completedAt = Date.now();
    const payload = redactProbeSecrets(result.data);
    let productionSave={saved:false,destination:"R2",reason:"NO_CONFIRMED_PRODUCTION_MAPPING"};
    try { productionSave=await persistKnownProbeResponse(env,{path:command.path,query:command.query,payload,httpStatus:result.status,commandId:item.command_id,actorRole:guard?.auth?.role||null}); }
    catch(saveError) { productionSave={saved:false,destination:"R2",reason:"PRODUCTION_SAVE_FAILED",error:safeProbeErrorMessage(saveError,lease?.api_key).slice(0,300)}; }
    await releaseProbeApiKey(env, lease, {
      success:true, endpoint:command.endpoint, targetType:command.category, targetId:command.path,
      purpose:"MIGHTPULSE_PROBE_BATCH", httpStatus:result.status,
      remainingMinute:parseHeaderNumber(result.headers,"x-ratelimit-remaining"),
      remainingDay:parseHeaderNumber(result.headers,"x-ratelimit-day-remaining")
    });
    const record = {
      request_id:requestId, user_id:guard?.auth?.user_id || guard?.auth?.id || null,
      actor_discord_id:guard?.auth?.discord_id || null, actor_label:guard?.auth?.global_name || guard?.auth?.username || null, actor_role:guard?.auth?.role || null,
      command_type:item.command_id, endpoint:command.endpoint, query:command.query,
      status:"SUCCESS", http_status:result.status, elapsed_ms:completedAt-startedAt,
      started_at:new Date(startedAt).toISOString(), completed_at:new Date(completedAt).toISOString(),
      trigger_reason:item.trigger_reason || "MANUAL", batch_id:batchId,
      sequence_no:item.sequence_no, discovered_from:item.discovered_from || null,
      response_count:probeResponseCount(payload), retry_count:Math.max(0,Number(result.attempts||1)-1), save_destination:productionSave.saved?"R2+PRODUCTION":"R2",
      raw_payload:payload, field_dictionary:buildProbeFieldDictionary(payload), production_save:productionSave,
      key_source:lease?.pool_type||lease?.source_type||null, key_id:lease?.key_id||null, key_owner_user_id:lease?.key_owner_user_id||lease?.contributed_by_user_id||null
    };
    let archive = null;
    try { archive = await archiveMightPulseProbeRecord(env,record); }
    catch (archiveError) { archive={r2_saved:false,metadata_saved:false,archive_error:safeProbeErrorMessage(archiveError,lease?.api_key).slice(0,250)}; }
    return {
      ok:true,request_id:requestId,status:"SUCCESS",command_id:item.command_id,category:command.category,
      sequence_no:item.sequence_no,trigger_reason:item.trigger_reason||"MANUAL",
      discovered_from:item.discovered_from||null,endpoint:command.endpoint,path:command.path,
      query:command.query,http_status:result.status,elapsed_ms:record.elapsed_ms,
      response_count:record.response_count,field_count:record.field_dictionary.length,production_save:productionSave,
      archive,discovered_references:extractProbeReferences(payload,{maxReferences:10,kingdomId:item.params?.kid})
    };
  } catch (error) {
    const status = Number(error?.status || 0);
    if (lease) {
      const cooldown = status === 429 ? 60 : status >= 500 || error?.code === "MIGHTPULSE_TIMEOUT" || error?.code === "MIGHTPULSE_NETWORK_ERROR" ? 15 : 0;
      try {
        await releaseProbeApiKey(env,lease,{
          endpoint:command.endpoint,targetType:command.category,targetId:command.path,
          purpose:"MIGHTPULSE_PROBE_BATCH",httpStatus:status,errorCode:error?.code||"MIGHTPULSE_REQUEST_FAILED",
          errorMessage:safeProbeErrorMessage(error,lease?.api_key) || null,cooldownSeconds:cooldown,keepAvailable:cooldown===0&&(status===400||status===403||status===404)
        });
      } catch {}
    }
    const completedAt=Date.now();
    const record={
      request_id:requestId,user_id:guard?.auth?.user_id||guard?.auth?.id||null,
      actor_discord_id:guard?.auth?.discord_id||null,actor_label:guard?.auth?.global_name||guard?.auth?.username||null,actor_role:guard?.auth?.role||null,
      command_type:item.command_id,endpoint:command?.endpoint||entry?.endpoint||"",query:command?.query||item.params||{},
      status:"FAILED",http_status:status||null,elapsed_ms:completedAt-startedAt,
      started_at:new Date(startedAt).toISOString(),completed_at:new Date(completedAt).toISOString(),
      trigger_reason:item.trigger_reason||"MANUAL",batch_id:batchId,sequence_no:item.sequence_no,
      discovered_from:item.discovered_from||null,response_count:0,retry_count:Math.max(0,Number(error?.attempts||1)-1),save_destination:"R2",key_source:lease?.pool_type||lease?.source_type||null,key_id:lease?.key_id||null,key_owner_user_id:lease?.key_owner_user_id||lease?.contributed_by_user_id||null,
      error_code:error?.code||safeProbeErrorMessage(error,lease?.api_key).slice(0,100),
      error_message:safeProbeErrorMessage(error,lease?.api_key),diagnostic:safeProbeDiagnostic(error?.details||null,lease?.api_key),retry_count:Math.max(0,Number(error?.attempts||1)-1)
    };
    let archive=null;
    try { archive=await archiveMightPulseProbeRecord(env,record); } catch {}
    return {ok:false,status:"FAILED",command_id:item.command_id,sequence_no:item.sequence_no,endpoint:record.endpoint,error:record.error_code,http_status:status||null,elapsed_ms:record.elapsed_ms,archive};
  }
}

async function handleMightPulseProbeBatchApi(request, env, guard, body) {
  if (!env.DB) return json({ok:false,error:"D1_NOT_CONFIGURED"},503);
  const mode=String(body?.mode||"batch");
  const userId=guard?.auth?.user_id||guard?.auth?.id||null;
  let batchId=String(body?.batch_id||"").trim();
  let queue=[],seen=new Set(),nextSequence=1,completed=0,totalCommands=0;
  let concurrency=2,maxCommands=30,batchType="all",createdAt=Math.floor(Date.now()/1000);
  const leaseToken=crypto.randomUUID();
  let leaseAcquired=false;
  const nowSeconds=()=>Math.floor(Date.now()/1000);
  if (mode==="resume") {
    if (!batchId) return json({ok:false,error:"BATCH_ID_REQUIRED"},400);
    const row=await env.DB.prepare("SELECT * FROM mightpulse_probe_batches WHERE batch_id=? LIMIT 1").bind(batchId).first();
    if (!row) return json({ok:false,error:"PROBE_BATCH_NOT_FOUND"},404);
    // History is shared for visibility, but execution/resume belongs to the creator.
    if (!userId || !row.user_id || String(row.user_id)!==String(userId)) {
      return json({ok:false,error:"PROBE_BATCH_OWNER_MISMATCH",message:"このバッチを再開できるのは作成した管理者のみです。"},403);
    }
    const now=nowSeconds();
    const claim=await env.DB.prepare(
      "UPDATE mightpulse_probe_batches SET lease_token=?,lease_until=?,updated_at=? WHERE batch_id=? AND (lease_until IS NULL OR lease_until<=?) RETURNING batch_id"
    ).bind(leaseToken,now+180,now,batchId,now).first();
    if (!claim) return json({ok:false,error:"PROBE_BATCH_ALREADY_RUNNING",message:"このバッチは別の実行処理が使用中です。しばらく待ってから再開してください。"},409);
    leaseAcquired=true;
    queue=JSON.parse(row.pending_json||"[]");
    seen=new Set(JSON.parse(row.seen_json||"[]"));
    nextSequence=Math.max(1,Number(row.next_sequence)||1);
    completed=Number(row.completed_commands||0);
    totalCommands=Number(row.total_commands||0);
    concurrency=Math.min(4,Math.max(1,Number(row.concurrency)||2));
    maxCommands=Math.min(30,Math.max(1,Number(row.max_commands)||30));
    batchType=String(row.batch_type||"resumed");
    createdAt=Number(row.created_at)||createdAt;
    if (!queue.length) {
      await env.DB.prepare("UPDATE mightpulse_probe_batches SET state='COMPLETED',updated_at=?,lease_token=NULL,lease_until=NULL WHERE batch_id=? AND lease_token=?").bind(nowSeconds(),batchId,leaseToken).run();
      return json({ok:true,batch_id:batchId,state:"COMPLETED",completed_commands:completed,total_commands:totalCommands,results:[]});
    }
  } else {
    batchId=batchId||crypto.randomUUID();
    batchType=String(body?.batch_type||"all");
    concurrency=Math.min(4,Math.max(1,Number(body?.concurrency)||2));
    maxCommands=Math.min(30,Math.max(1,Number(body?.max_commands)||30));
    const params={
      governor_id:String(body?.params?.governor_id||"").trim(),
      uid:String(body?.params?.uid||"").trim(),
      kid:String(body?.params?.kid||"").trim(),
      tag:String(body?.params?.tag||"").trim(),
      board:String(body?.params?.board||"personal_power"),
      limit:Math.min(100,Math.max(1,Number(body?.params?.limit)||100))
    };
    let selected=MIGHTPULSE_PROBE_COMMANDS;
    if (batchType==="category") {
      const category=String(body?.category||"");
      selected=selected.filter(command=>command.category===category);
    } else if (batchType==="selected") {
      const ids=Array.isArray(body?.command_ids)?body.command_ids.map(String):[];
      selected=selected.filter(command=>ids.includes(command.id));
    }
    const initial=selected.slice(0,maxCommands).map(command=>({command_id:command.id,params,trigger_reason:"MANUAL",discovered_from:null,depth:0}));
    for (const item of initial) {
      const key=probeBatchItemKey(item);
      if (!seen.has(key)) { seen.add(key); queue.push(item); }
    }
    totalCommands=seen.size;
    const now=nowSeconds();
    await env.DB.prepare(
      "INSERT INTO mightpulse_probe_batches (batch_id,created_at,updated_at,user_id,state,batch_type,total_commands,completed_commands,pending_json,seen_json,next_sequence,concurrency,max_commands,last_error,lease_token,lease_until) VALUES (?,?,?,?,'RUNNING',?,?,0,?,?,?,?,?,NULL,?,?)"
    ).bind(batchId,createdAt,createdAt,userId,batchType,totalCommands,JSON.stringify(queue),JSON.stringify([...seen]),nextSequence,concurrency,maxCommands,leaseToken,now+180).run();
    leaseAcquired=true;
  }

  const results=[];
  const inFlight=new Map();
  let poolUnavailable=false;
  let saveChain=Promise.resolve();
  const saveProgress=async(state,lastError=null)=>{
    const pending=[...queue,...inFlight.values()];
    const now=nowSeconds();
    const terminal=state==="COMPLETED"||state==="INTERRUPTED";
    const snapshot={state,now,totalCommands,completed,pendingJson:JSON.stringify(pending),seenJson:JSON.stringify([...seen]),nextSequence,lastError,batchId,leaseToken,leaseUntil:terminal?null:now+180};
    const operation=()=>env.DB.prepare(
      "UPDATE mightpulse_probe_batches SET state=?,updated_at=?,total_commands=?,completed_commands=?,pending_json=?,seen_json=?,next_sequence=?,last_error=?,lease_token=?,lease_until=? WHERE batch_id=? AND lease_token=?"
    ).bind(snapshot.state,snapshot.now,snapshot.totalCommands,snapshot.completed,snapshot.pendingJson,snapshot.seenJson,snapshot.nextSequence,snapshot.lastError,terminal?null:snapshot.leaseToken,snapshot.leaseUntil,snapshot.batchId,snapshot.leaseToken).run();
    saveChain=saveChain.then(operation,operation);
    const result=await saveChain;
    if (Number(result?.meta?.changes||0)!==1) throw new Error("PROBE_BATCH_LEASE_LOST");
  };
  const scheduleDiscovered=(result,item)=>{
    if (body?.automatic_discovery===false||!result?.ok||Number(item.depth||0)>=2) return;
    const refs=Array.isArray(result.discovered_references)?result.discovered_references:[];
    for (const ref of refs) {
      const candidates=[];
      if (ref.type==="PLAYER") {
        candidates.push({command_id:"player_base",params:{...item.params,governor_id:ref.governor_id,kid:ref.kid||item.params?.kid}});
        candidates.push({command_id:"player_full",params:{...item.params,governor_id:ref.governor_id,kid:ref.kid||item.params?.kid}});
      } else if (ref.type==="KINGDOM") {
        candidates.push({command_id:"kingdom_detail",params:{...item.params,kid:ref.kid}});
        candidates.push({command_id:"kingdom_boards",params:{...item.params,kid:ref.kid}});
        candidates.push({command_id:"kingdom_ranks",params:{...item.params,kid:ref.kid}});
      } else if (ref.type==="ALLIANCE") {
        candidates.push({command_id:"alliance_detail",params:{...item.params,kid:ref.kid,tag:ref.tag}});
      }
      for (const candidate of candidates) {
        if (queue.length+inFlight.size+completed>=maxCommands) return;
        const queued={...candidate,trigger_reason:"AUTO_DISCOVERED",discovered_from:item.command_id+"#"+item.sequence_no,depth:Number(item.depth||0)+1};
        const key=probeBatchItemKey(queued);
        if (!seen.has(key)) { seen.add(key);queue.push(queued);totalCommands++; }
      }
    }
  };

  try {
    await saveProgress("RUNNING");
    const worker=async()=>{
      while(true) {
        if(poolUnavailable) return;
        const item=queue.shift();
        if(!item) return;
        if(!item.sequence_no) item.sequence_no=nextSequence++;
        inFlight.set(item.sequence_no,item);
        await saveProgress("RUNNING");
        const result=await executeCatalogProbeItem(env,guard,batchId,item);
        inFlight.delete(item.sequence_no);
        if(!result?.ok && result?.error==="NO_API_POOL_KEY_AVAILABLE") {
          // No upstream request was made. Keep the item queued so the batch can
          // resume when the shared API Pool has capacity again.
          queue.unshift(item);
          poolUnavailable=true;
          results.push({...result,status:"WAITING_FOR_API_POOL"});
          await saveProgress("RUNNING","NO_API_POOL_KEY_AVAILABLE");
          return;
        }
        results.push(result);
        completed++;
        scheduleDiscovered(result,item);
        await saveProgress("RUNNING");
      }
    };
    await Promise.all(Array.from({length:concurrency},()=>worker()));
    if(poolUnavailable) {
      await saveProgress("INTERRUPTED","NO_API_POOL_KEY_AVAILABLE");
      leaseAcquired=false;
      return json({
        ok:false,batch_id:batchId,state:"INTERRUPTED",waiting_for_api_pool:true,
        completed_commands:completed,total_commands:totalCommands,concurrency,
        error:"NO_API_POOL_KEY_AVAILABLE",
        message:"通常処理向けのAPIキー予備枠を維持するため、Probeバッチを一時停止しました。API Poolに空きができたら履歴から再開できます。",
        results
      },503);
    }
    await saveProgress("COMPLETED");
    leaseAcquired=false;
    return json({ok:true,batch_id:batchId,state:"COMPLETED",completed_commands:completed,total_commands:totalCommands,concurrency,results});
  } catch(error) {
    try { await saveProgress("INTERRUPTED",String(error?.message||error).slice(0,500)); leaseAcquired=false; } catch {}
    return json({ok:false,batch_id:batchId,state:"INTERRUPTED",completed_commands:completed,total_commands:totalCommands,error:error?.message||"PROBE_BATCH_FAILED",results},500);
  } finally {
    if (leaseAcquired) {
      try { await env.DB.prepare("UPDATE mightpulse_probe_batches SET lease_token=NULL,lease_until=NULL,updated_at=? WHERE batch_id=? AND lease_token=?").bind(nowSeconds(),batchId,leaseToken).run(); } catch {}
    }
  }
}

async function handleMightPulseProbeApi(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  if (request.method === "POST") {
    const body = await request.json().catch(() => null);
    if (!body) return json({ok:false,error:"INVALID_PROBE_REQUEST"},400);
    if (String(body.mode||"")==="batch" || String(body.mode||"")==="resume") return await handleMightPulseProbeBatchApi(request,env,guard,body);
    if (String(body.mode||"")!=="manual") return json({ok:false,error:"INVALID_PROBE_REQUEST"},400);
    try { return await executeManualMightPulseProbe(request, env, guard, body); }
    catch (error) { return json({ok:false,error:error?.message || "INVALID_PROBE_COMMAND"},400); }
  }
  if (request.method !== "GET") return json({ok:false,error:"METHOD_NOT_ALLOWED"},405);
  const url = new URL(request.url);
  if (url.searchParams.get("history") === "1") {
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));
    const result = await env.DB.prepare("SELECT request_id, created_at, user_id, actor_discord_id, actor_label, actor_role, command_type, endpoint, status, http_status, elapsed_ms, response_bytes, r2_object_key, error_code, trigger_reason, batch_id, sequence_no, discovered_from, response_count, retry_count, save_destination, key_source, key_id, key_owner_user_id FROM mightpulse_probe_runs ORDER BY created_at DESC LIMIT ?").bind(limit).all();
    return json({ ok:true, history: result.results || [] });
  }
  const requestId = String(url.searchParams.get("request_id") || "").trim();
  if (requestId) {
    const row = await env.DB.prepare("SELECT request_id, r2_object_key FROM mightpulse_probe_runs WHERE request_id=? LIMIT 1").bind(requestId).first();
    if (!row) return json({ok:false,error:"PROBE_RUN_NOT_FOUND"},404);
    if (!row.r2_object_key || !env.ARCHIVE?.get) return json({ok:false,error:"PROBE_RAW_RESPONSE_NOT_ARCHIVED",request_id:requestId},404);
    const object = await env.ARCHIVE.get(row.r2_object_key);
    if (!object) return json({ok:false,error:"PROBE_R2_OBJECT_NOT_FOUND",request_id:requestId},404);
    return json({ok:true,request_id:requestId,record:JSON.parse(await object.text())});
  }
  const type = String(url.searchParams.get("type") || "PLAYER").trim().toUpperCase();
  const governorId = String(url.searchParams.get("governor_id") || "").trim();
  const kid = String(url.searchParams.get("kid") || "").trim();
  const board = String(url.searchParams.get("board") || "").trim();
  const include = String(url.searchParams.get("include") || "base").trim();
  const apiLockKey = "ADMIN_MIGHTPULSE_PROBE:" + type + ":" + String(governorId || kid || "") + ":" + String(board || "") + ":" + include;
  const apiLockToken = await acquireApiRequestLock(env, apiLockKey);
  if (!apiLockToken) return json({ok:false,error:"API_REQUEST_IN_PROGRESS",message:"同じ対象への処理が現在実行中です。完了を待ってから再試行してください。",lock_key:apiLockKey},409);
  try {
    const spec = mightPulseProbeRequestSpec(type, { governorId, kid, board, include });
    return json(await fetchMightPulseProbeThroughPool(env, spec, guard.auth));
  } catch (error) {
    const status = Number(error?.status || 0);
    return json({ok:false,error:error?.code || "MIGHTPULSE_PROBE_FAILED",status,message:safeProbeErrorMessage(error) || null,diagnostic:safeProbeDiagnostic(error?.details || null)},status >= 400 && status < 600 ? status : 502);
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
  const probeCatalogJson = JSON.stringify(MIGHTPULSE_PROBE_COMMANDS).replace(/</g, "\\u003c");

  return "<!doctype html><html lang='ja'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><meta name='color-scheme' content='dark'><title>MightPulse Probe | EagleEye</title>" +
  "<style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.wrap{max-width:980px;margin:auto;padding:24px 14px 50px}.top{display:flex;justify-content:space-between;gap:12px;align-items:center}.back{color:#94a3b8;text-decoration:none}.badge{padding:6px 9px;border:1px solid #f59e0b;border-radius:999px;color:#fbbf24;background:#241a08;font-size:11px;font-weight:900}.card{margin-top:14px;padding:16px;border:1px solid #334155;border-radius:16px;background:#162238}.hint{color:#94a3b8;font-size:12px;line-height:1.65}.form{display:grid;grid-template-columns:1fr 1fr;gap:10px}.field{display:grid;gap:6px}.field input,.field select,.field textarea{width:100%;min-width:0;padding:12px;border-radius:10px;border:1px solid #475569;background:#0b1220;color:#fff;font-family:inherit;font-size:16px;line-height:1.4;-webkit-appearance:none;appearance:none}.field input:focus,.field select:focus,.field textarea:focus{font-size:16px}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.btn{padding:12px 15px;border:0;border-radius:10px;background:#f59e0b;color:#111827;font-weight:900}.btn.secondary{background:#334155;color:#e2e8f0}.btn.is-clicked{background:#38bdf8!important;color:#082f49!important;box-shadow:0 0 0 3px #38bdf855;transform:translateY(1px)}.btn.is-running{background:#facc15!important;color:#422006!important;cursor:progress}.btn.is-success{background:#22c55e!important;color:#052e16!important}.btn.is-error{background:#ef4444!important;color:#fff!important}.btn:focus-visible{outline:3px solid #7dd3fc;outline-offset:3px}.btn:disabled{opacity:.72;cursor:not-allowed;filter:saturate(.7)}.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;word-break:break-all}.kv{display:grid;grid-template-columns:180px minmax(0,1fr);gap:7px 10px}.kv b{color:#94a3b8;font-size:11px}.kv span{font-size:12px;word-break:break-word}.table-wrap{overflow:auto;max-width:100%}table{width:100%;border-collapse:collapse;min-width:720px}th,td{padding:8px;border-bottom:1px solid #334155;text-align:left;font-size:11px;vertical-align:top}th{color:#94a3b8}.field-dictionary{display:grid;gap:6px;max-width:100%}.field-entry{border:1px solid #334155;border-radius:8px;background:#0b1220;min-width:0;overflow:hidden}.field-entry summary{display:flex;align-items:center;gap:8px;padding:9px;cursor:pointer;min-width:0;list-style:none}.field-entry summary::-webkit-details-marker{display:none}.field-entry summary:before{content:'＋';color:#7dd3fc;flex:none}.field-entry[open] summary:before{content:'−'}.field-path{font:11px ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere;word-break:break-word;min-width:0;flex:1}.field-type{font-size:10px;color:#93c5fd;flex:none;background:#172554;padding:3px 5px;border-radius:5px}.field-sample{padding:0 10px 10px;font-size:12px;line-height:1.55;overflow-wrap:anywhere;word-break:break-word}.field-sample>div{margin-top:4px;white-space:pre-wrap}.ok{color:#86efac}.error{color:#fca5a5}.pill{display:inline-block;padding:3px 6px;border-radius:7px;background:#0b1220;margin:2px}.small{font-size:10px;color:#94a3b8}.catalog-list{display:grid;grid-template-columns:1fr;gap:8px;margin-top:12px}.catalog-group{border:1px solid #334155;border-radius:12px;background:#0b1220;overflow:hidden}.catalog-group>summary{list-style:none;display:flex;align-items:center;gap:10px;padding:14px 12px;cursor:pointer;font-size:14px;font-weight:800;min-height:52px;background:#142238}.catalog-group>summary::-webkit-details-marker{display:none}.catalog-group>summary:before{content:'＋';color:#7dd3fc;font-size:16px;width:18px;flex:none}.catalog-group[open]>summary:before{content:'−'}.catalog-group .group-count{margin-left:auto;font-size:11px;color:#94a3b8;font-weight:600;white-space:nowrap}.catalog-group .group-items{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:8px}.catalog-item{border:1px solid #26364b;border-radius:10px;padding:11px;background:#101b2d;min-width:0;display:flex;flex-direction:column;gap:6px}.catalog-item h3{font-size:13px;line-height:1.4;margin:0}.catalog-item .purpose{font-size:11px;color:#cbd5e1;line-height:1.5;margin:0}.catalog-item .actions{margin-top:auto;display:grid;grid-template-columns:1fr;gap:6px;padding-top:4px}.catalog-item .btn{width:100%;padding:9px 8px;font-size:11px;white-space:normal;min-height:42px}.catalog-item .details{border-top:1px solid #26364b;padding-top:5px}.catalog-item .details summary{cursor:pointer;color:#93c5fd;font-size:11px;font-weight:700;padding:5px 0}.catalog-item .detail-body{font-size:11px;color:#cbd5e1;line-height:1.6;overflow-wrap:anywhere}.catalog-item .detail-body b{display:block;color:#94a3b8;font-size:10px;margin-top:6px}.catalog-tag{display:inline-block;align-self:flex-start;border-radius:6px;background:#1e293b;color:#cbd5e1;padding:3px 6px;font-size:9px}.catalog-tag.mighty{background:#3b2c12;color:#fcd34d}.catalog-tag.internal{background:#172554;color:#bfdbfe}.catalog-toolbar{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:10px}.catalog-toolbar label{min-width:0}.catalog-toolbar select,.catalog-toolbar input{min-width:0}.section-help{border-left:3px solid #38bdf8;padding:8px 10px;background:#0b1220;border-radius:0 8px 8px 0}@media(max-width:600px){.catalog-group .group-items{grid-template-columns:1fr;gap:7px;padding:7px}.catalog-group>summary{padding:13px 11px}.catalog-item{padding:10px}.catalog-item .actions{grid-template-columns:1fr 1fr}.catalog-item .btn{min-height:44px;padding:9px 6px}.catalog-toolbar{grid-template-columns:1fr}.wrap{padding:18px 10px 40px}.form{grid-template-columns:1fr}.kv{grid-template-columns:1fr;gap:2px}.kv b{margin-top:8px}table{min-width:620px}}</style></head><body><main class='wrap'>" +
  "<div class='top'><a class='back' href='/admin'>← ADMIN CONTROL</a><div class='badge'>ADMIN / OWNER · PROBE</div></div>" +
  "<h1>MightPulse Probe</h1><p class='hint'>MightPulseのレスポンス時刻・HTTPキャッシュヘッダー・cached_at / age_seconds / fresh・タイムスタンプ候補を調べる画面です。APIキー本体は表示・保存せず、取得したレスポンスJSONは画面で確認しR2に保管します。</p>" +
  "<div class='card'><h2>1. 対象を指定</h2><div class='form'>" +
  "<label class='field'><span>Player 領主ID</span><input id='governorId' inputmode='numeric' placeholder='例: 223636495'></label>" +
  "<label class='field'><span>Kingdom 王国番号</span><input id='kid' inputmode='numeric' placeholder='例: 1524'></label>" +
  "<label class='field'><span>Alliance タグ</span><input id='manualAllianceTag' placeholder='例: ABC'></label>" +
  "<label class='field'><span>Player include</span><select id='include'><option value='base'>base</option><option value='base,ranks'>base,ranks</option><option value='base,heroes,ranks,gov_gear'>base,heroes,ranks,gov_gear</option></select></label>" +
  "<label class='field'><span>Kingdom ranking</span><select id='board'>" + boardOptions + "</select></label>" +
  "</div><div class='actions'><button class='btn' data-type='PLAYER'>Playerを取得</button><button class='btn secondary' data-type='KINGDOM'>Kingdomを取得</button><button class='btn secondary' data-type='KINGDOM_RANKING'>Kingdom Rankingを取得</button><button class='btn secondary' id='clearHistory' type='button'>履歴クリア</button></div><div id='status' class='hint'></div></div>" +
  "<div class='card' id='catalogCard'><h2>コマンド台帳</h2><p class='hint section-help'>各カードに「何を調べるコマンドか」を表示します。「コマンドの詳細」で実際のAPIパス・クエリ・必要権限を確認できます。単体実行は選んだ1コマンドだけを実行します。</p><div class='catalog-toolbar'><label class='field'><span>カテゴリで絞り込み</span><select id='catalogCategory'><option value='ALL'>すべてのカテゴリ</option><option>Player</option><option>Kingdom</option><option>Ranking</option><option>Alliance</option><option>Mighty</option><option>EagleEye Retrieval</option></select></label><label class='field'><span>コマンド名・内容で検索</span><input id='catalogSearch' placeholder='英雄、ランキング、KvK…' autocomplete='off'></label></div><div id='catalogCommandForm' class='card' hidden style='margin-top:12px;border-color:#0891b2'><h3 id='catalogFormTitle' style='margin:0 0 8px'>コマンド実行</h3><p id='catalogFormHelp' class='hint'>このコマンドに必要な項目だけ入力してください。</p><div id='catalogFormFields' class='form'></div><div class='actions'><button class='btn' id='catalogFormRun' type='button'>この内容で実行</button><button class='btn secondary' id='catalogFormCancel' type='button'>閉じる</button></div><div id='catalogFormStatus' class='hint'></div></div><div id='catalogList' class='catalog-list'></div><div id='catalogStatus' class='hint'></div></div>" +
  "<div class='card'><details><summary style='cursor:pointer;font-weight:800'>未知のAPIを手入力で試す（詳細）</summary><p class='hint'>相対パスとクエリJSONを指定してGETを1回実行します。外部URLは指定できません。</p><div class='form'><label class='field'><span>APIパス</span><input id='manualPath' autocomplete='off' placeholder='/players/223636495'></label><label class='field'><span>クエリJSON</span><input id='manualQuery' autocomplete='off' placeholder='{&quot;include&quot;:&quot;base,ranks&quot;}'></label></div><label class='field' style='margin-top:10px'><span>必要なAPI権限</span><select id='manualMightyRequired'><option value='false'>通常権限でも可</option><option value='true'>Mighty権限が必要</option></select></label><div class='actions'><button class='btn' id='runManual' type='button'>手入力コマンドを実行</button></div><div id='manualStatus' class='hint'></div></details></div>" +
  "<div class='card'><h2>コマンド台帳・一括実行</h2><p class='hint'>公式APIのコマンド一覧からカテゴリ単位・全件を実行します。一括実行ではレスポンス内のプレイヤー・王国・同盟参照を検出し、重複を避けながら関連コマンドを追加調査します。単体実行ボタンは連鎖しません。</p><div class='form'><label class='field'><span>カテゴリ</span><select id='probeBatchCategory'><option>Player</option><option>Kingdom</option><option>Ranking</option><option>Alliance</option><option>Mighty</option><option>EagleEye Retrieval</option></select></label><label class='field'><span>同時実行数（1〜4）</span><select id='probeBatchConcurrency'><option value='1'>1</option><option value='2' selected>2</option><option value='3'>3</option><option value='4'>4</option></select></label></div><div class='actions'><button class='btn secondary' id='runCategoryBatch' type='button'>このカテゴリを一括実行</button><button class='btn' id='runAllBatch' type='button'>全コマンド一括実行</button><button class='btn secondary' id='resumeBatch' type='button'>中断したバッチを再開</button></div><div id='batchStatus' class='hint'></div><div id='batchResults' class='table-wrap'></div></div>" +
  "<div id='latest'></div><div class='card'><h2>Probe履歴</h2><div class='hint'>同じ対象を時間を空けて再取得し、cached_at・age_seconds・レスポンスハッシュ・HTTPヘッダーを比較してください。概要はこのブラウザに保持し、実行記録と生レスポンスはD1の最小メタデータとR2に保存します。</div><div class='table-wrap'><table><thead><tr><th>時刻</th><th>実行者</th><th>Type</th><th>fresh</th><th>cached_at</th><th>age_seconds</th><th>HTTP</th><th>elapsed</th><th>hash</th></tr></thead><tbody id='history'></tbody></table></div></div>" +
  `<script>(function(){var probeCatalog=${probeCatalogJson};var key='eagleeye_mightpulse_probe_history_v1';function esc(v){return String(v==null?'':v).replace(/[&<>\"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[m]||m;});}function read(){try{return JSON.parse(localStorage.getItem(key)||'[]');}catch(e){return [];}}function write(rows){try{localStorage.setItem(key,JSON.stringify(rows.slice(0,30)));}catch(e){}}function commandPurpose(c){var d={player_base:'領主の基本プロフィールを取得します。名前・所属などの基本項目を確認する入口です。',player_ranks:'指定プレイヤーのランキング情報を取得します。順位系フィールドが返るか調べます。',player_full:'基本情報・英雄・ランキング・領主装備をまとめて取得し、返却範囲を確認します。',player_uid:'領主IDではなく内部UIDを指定してプレイヤー検索を試します。',kingdom_list:'ページ単位で王国一覧を取得します。ページング仕様の確認向けです。',kingdom_detail:'指定した王国の基本情報を取得します。',kingdom_boards:'王国が持つランキングボード一覧を取得します。',kingdom_ranks:'指定王国のランキング一覧を取得します。',kingdom_rank_board:'選択したランキング種別の順位データを取得します。',alliance_detail:'指定王国・同盟タグの同盟情報とメンバー一覧を取得します。',kingdom_events:'Mighty権限で王国イベント情報を取得します。',kingdom_kvk:'Mighty権限で王国のKvK情報を取得します。',kingdom_kvk_scores:'Mighty権限でKvKのスコア情報を取得します。',kvk_matchups:'Mighty権限でKvKのマッチアップ一覧を取得します。',eagleeye_player_refresh:'EagleEye側のプレイヤー詳細更新経路を調べます。外部API直呼びではなく内部取得フローの検証用です。',eagleeye_player_rank_refresh:'EagleEye側のプレイヤーランキング更新フローを検証します。',eagleeye_kingdom_rank_refresh:'EagleEye側で王国ランキングを保存する内部処理を検証します.'};if(d[c.id])return d[c.id];if(c.command_kind==='EAGLEEYE_INTERNAL')return 'EagleEye内部の取得・保存フローを検証するコマンドです。';return 'このAPIの返却内容・フィールド構造を確認します。';}function commandInputs(c){var refs=c.references||[];var names={governor_id:'領主ID',uid:'内部UID',kid:'王国番号',alliance_tag:'同盟タグ'};return refs.map(function(x){return names[x]||x;}).join('、')||'追加の対象入力なし';}function renderCatalog(){var cat=document.getElementById('catalogCategory').value;var term=document.getElementById('catalogSearch').value.trim().toLowerCase();var list=probeCatalog.filter(function(c){return (cat==='ALL'||c.category===cat)&&(!term||(c.label+' '+c.endpoint+' '+c.category+' '+c.id+' '+commandPurpose(c)).toLowerCase().indexOf(term)>=0);});var groups={};list.forEach(function(c){(groups[c.category]||(groups[c.category]=[])).push(c);});var order=['Player','Kingdom','Ranking','Alliance','Mighty','EagleEye Retrieval'];var labels={Player:'プレイヤー情報',Kingdom:'王国情報',Ranking:'ランキング',Alliance:'同盟情報',Mighty:'Mighty専用API', 'EagleEye Retrieval':'EagleEye内部処理'};document.getElementById('catalogList').innerHTML=order.filter(function(k){return groups[k]&&groups[k].length;}).map(function(k){var cards=groups[k].map(function(c){var internal=String(c.command_kind||'').indexOf('EAGLEEYE_INTERNAL')===0;var query=JSON.stringify(c.query||{},null,2);return '<article class="catalog-item"><span class="catalog-tag '+(internal?'internal':c.requiresMighty?'mighty':'')+'">'+esc(internal?'EAGLEEYE内部':c.requiresMighty?'MIGHTY権限':'通常権限')+'</span><h3>'+esc(c.label)+'</h3><p class="purpose">'+esc(commandPurpose(c))+'</p><div class="actions"><button class="btn secondary" type="button" data-config-catalog="'+esc(c.id)+'">必要項目を入力</button><button class="btn" type="button" data-run-catalog="'+esc(c.id)+'">入力して実行</button></div><details class="details"><summary>API・入力の詳細</summary><div class="detail-body"><b>コマンドID</b>'+esc(c.id)+'<b>実行先・HTTPメソッド</b>'+esc(c.method||'GET')+' '+esc(c.endpoint)+'<b>初期クエリ</b><pre style="white-space:pre-wrap;margin:3px 0">'+esc(query)+'</pre><b>必要な入力</b>'+esc(commandInputs(c))+'<b>実行方式</b>'+esc(internal?'EagleEye内部の取得・保存フロー': 'MightPulse APIを1回呼び出し')+'</div></details></article>';}).join('');return '<details class="catalog-group"'+(term?' open':'')+'><summary>'+esc(labels[k]||k)+'<span class="group-count">'+groups[k].length+' コマンド</span></summary><div class="group-items">'+cards+'</div></details>';}).join('')||'<p class="hint">該当するコマンドがありません。</p>';document.getElementById('catalogStatus').textContent=list.length+'件表示 / 登録済み'+probeCatalog.length+'件。カテゴリを開いてコマンドを選択してください。';}var activeProbeActions=new WeakSet();function setButtonState(btn,state,label){if(!btn)return;btn.classList.remove('is-clicked','is-running','is-success','is-error');if(state)btn.classList.add('is-'+state);if(label!=null){if(!btn.dataset.originalLabel)btn.dataset.originalLabel=btn.textContent;btn.textContent=label;} }async function runButtonAction(btn,fn,statusEl){if(btn&&activeProbeActions.has(btn))return;if(btn)activeProbeActions.add(btn);var originalLabel=btn?btn.textContent:'';if(btn){setButtonState(btn,'clicked');btn.disabled=true;}if(statusEl)statusEl.textContent='クリックを受け付けました。処理を開始します…';await Promise.resolve();if(btn)setButtonState(btn,'running','実行中…');try{await fn();var message=statusEl?String(statusEl.textContent||''):'';var failed=/失敗|エラー|FAILED|空き待ち|中断|入力してください|正しくありません|ありません|MISSING|HTTP [45]\\d{2}/i.test(message);var successful=/成功|完了|SUCCESS|HTTP \d{3}/i.test(message);if(btn){if(failed)setButtonState(btn,'error','失敗');else if(successful)setButtonState(btn,'success','完了');else setButtonState(btn,'success','受付完了');}}catch(error){if(statusEl)statusEl.textContent='実行失敗: '+String(error&&error.message||error);if(btn)setButtonState(btn,'error','失敗');}finally{if(btn){btn.disabled=false;activeProbeActions.delete(btn);setTimeout(function(){setButtonState(btn,'',null);btn.textContent=originalLabel;},2200);}}}function draw(){var rows=read();document.getElementById('history').innerHTML=rows.map(function(p){return '<tr><td>'+new Date(p.client_received_at||0).toLocaleString('ja-JP')+'</td><td>'+esc(p.actor_label||'-')+'</td><td>'+esc(p.type||'-')+'<br><span class="small">'+esc(p.target_id||'')+'</span></td><td>ブラウザ履歴</td><td>MANUAL</td><td>-</td><td>'+esc(p.http_status||'-')+'</td><td>'+esc(p.elapsed_ms==null?'-':p.elapsed_ms)+' ms</td><td>'+ (p.request_id?'<button type="button" data-open-probe="'+esc(p.request_id)+'">開く</button>':'-')+'</td></tr>';}).join('')||'<tr><td colspan="9" class="small">まだProbe結果がありません。</td></tr>';}function compareProbe(p, previous){
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
function renderFieldDictionary(fields){if(!Array.isArray(fields)||!fields.length)return '<span class="small">観測できたフィールドがありません。</span>';function sampleText(samples){if(!Array.isArray(samples)||!samples.length)return 'サンプルなし';return samples.slice(0,2).map(function(v){if(v===null)return 'null';if(typeof v==='object'){try{return JSON.stringify(v);}catch(e){return '[object]';}}return String(v);}).join(' / ');}return '<div class="field-dictionary">'+fields.map(function(f){return '<details class="field-entry"><summary><span class="field-path">'+esc(f.path)+'</span><span class="field-type">'+esc(f.type)+'</span></summary><div class="field-sample"><span class="small">観測 '+esc(f.observations||1)+' 回</span><div>'+esc(sampleText(f.samples))+'</div></div></details>';}).join('')+'</div>';}function renderPlayerActivity(a){if(!a)return '<span class="small">Player payloadなし</span>';function one(label,v){if(!v||!v.present)return '<div><b>'+label+'</b>: <span class="small">未提供</span></div>';return '<div><b>'+label+'</b>: '+esc(v.raw)+'<br><span class="small">'+esc(v.iso||'-')+'</span></div>';}return one('last_active_at',a.last_active_at)+one('last_login',a.last_login)+one('online',a.online);}
function showLatest(p){var h=p.headers||{},t=p.timestamp_like_fields||[],s=p.section_sha256||{};
  var rows=read();var previous=rows.find(function(x){return x.type===p.type&&String(x.target_id)===String(p.target_id)&&String(x.hash||"")!==String(p.response_sha256||"");})||rows.find(function(x){return x.type===p.type&&String(x.target_id)===String(p.target_id);});
  var comparison=compareProbe(p,previous);var th=t.length?t.map(function(x){return '<div class=\"pill\"><b>'+esc(x.path)+'</b> = '+esc(x.raw)+'<br><span class=\"small\">'+esc(x.iso)+'</span></div>';}).join(''):'<span class=\"small\">候補なし</span>';var sh=Object.keys(s).length?Object.keys(s).map(function(k){return '<div class=\"pill\">'+esc(k)+': '+esc(String(s[k]).slice(0,20))+'…</div>';}).join(''):'<span class=\"small\">なし</span>';document.getElementById('latest').innerHTML='<div class=\"card\"><div style=\"display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap\"><h2 style=\"margin:0\">最新Probe</h2><div class=\"actions\"><button type=\"button\" id=\"copyLatestProbe\" class=\"btn\">結果をコピー</button><button type=\"button\" id=\"downloadLatestProbe\" class=\"btn secondary\">JSONを書き出す</button></div></div><div class=\"kv\">'+
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
  '<b>フィールド辞書</b><span>'+renderFieldDictionary(p.field_dictionary||[])+'</span>'+
  '<b>検証用データ（英雄・装備・スキル）</b><span class=\"mono\" style=\"white-space:pre-wrap;display:block;max-height:420px;overflow:auto\">'+esc(JSON.stringify(p.diagnostic_payload||null,null,2))+'</span>'+
  '<b>レスポンスJSON（全体）</b><span class=\"mono\" style=\"white-space:pre-wrap;display:block;max-height:560px;overflow:auto\">'+esc(JSON.stringify(p.raw_payload===undefined?p.diagnostic_payload:p.raw_payload,null,2))+'</span>'+
  '<b>HTTP headers</b><span class=\"mono\">'+esc(JSON.stringify(h,null,2))+'</span>'+
  '<b>Timestamp-like fields</b><span>'+th+'</span>'+
  '<b>Response SHA-256</b><span class=\"mono\">'+esc(p.response_sha256)+'</span>'+
  '<b>Section SHA-256</b><span>'+sh+'</span>'+
  '<b>比較</b><span><strong>'+esc(comparison.title)+'</strong><br>'+comparison.items.map(function(x){return '• '+esc(x);}).join('<br>')+'</span>'+
  '</div></div>';var copyButton=document.getElementById('copyLatestProbe');if(copyButton){copyButton.addEventListener('click',async function(){var copyText=JSON.stringify({request_id:p.request_id,type:p.type,target_type:p.target_type,target_id:p.target_id,request_started_at_iso:p.request_started_at_iso,response_received_at_iso:p.response_received_at_iso,elapsed_ms:p.elapsed_ms,http_status:p.http_status,fresh:p.fresh,cached_at:p.cached_at,cached_at_iso:p.cached_at_iso,age_seconds:p.age_seconds,player_activity:p.player_activity,payload_keys:p.payload_keys,timestamp_like_fields:p.timestamp_like_fields,response_sha256:p.response_sha256,section_sha256:p.section_sha256,diagnostic_payload:p.diagnostic_payload||null,field_dictionary:p.field_dictionary||[],raw_payload:p.raw_payload===undefined?p.diagnostic_payload:p.raw_payload,archive:p.archive||null},null,2);try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(copyText);}else{var area=document.createElement('textarea');area.value=copyText;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.focus();area.select();var copied=document.execCommand('copy');area.remove();if(!copied)throw new Error('COPY_FAILED');}var oldLabel=copyButton.textContent;copyButton.textContent='コピーしました';setTimeout(function(){if(copyButton.isConnected)copyButton.textContent=oldLabel;},1800);}catch(error){copyButton.textContent='コピー失敗';setTimeout(function(){if(copyButton.isConnected)copyButton.textContent='結果をコピー';},1800);}});}var downloadButton=document.getElementById('downloadLatestProbe');if(downloadButton){downloadButton.addEventListener('click',async function(){var oldLabel=downloadButton.textContent;var objectUrl=null;downloadButton.disabled=true;downloadButton.textContent='JSONを検証中…';function finish(label){downloadButton.disabled=false;downloadButton.textContent=label;setTimeout(function(){if(downloadButton.isConnected)downloadButton.textContent=oldLabel;},3500);}try{if(p.raw_payload===undefined||p.raw_payload===null){throw new Error('取得レスポンス本文がありません。Probeを再実行してから書き出してください。');}var exportPayload={format:'MightPulse Probe JSON',format_version:1,request_id:p.request_id,type:p.type,target_type:p.target_type,target_id:p.target_id,endpoint:p.endpoint,query:p.query,request_started_at_iso:p.request_started_at_iso,response_received_at_iso:p.response_received_at_iso,elapsed_ms:p.elapsed_ms,http_status:p.http_status,fresh:p.fresh,cached_at:p.cached_at,cached_at_iso:p.cached_at_iso,age_seconds:p.age_seconds,player_activity:p.player_activity,payload_keys:p.payload_keys||[],timestamp_like_fields:p.timestamp_like_fields||[],response_sha256:p.response_sha256,section_sha256:p.section_sha256,diagnostic_payload:p.diagnostic_payload||null,field_dictionary:p.field_dictionary||[],raw_payload:p.raw_payload,archive:p.archive||null};var data=JSON.stringify(exportPayload,null,2);var verified=JSON.parse(data);if(!verified||verified.format!=='MightPulse Probe JSON'||verified.raw_payload===undefined||verified.raw_payload===null){throw new Error('JSON検証に失敗しました。データは書き出していません。');}if(data.length<100){throw new Error('JSONの内容が不自然に短いため、書き出しを中止しました。');}var blob=new Blob([data],{type:'application/json;charset=utf-8'});var fileName='mightpulse-probe-'+String(p.request_id||Date.now())+'.json';var isAppleMobile=/iPad|iPhone|iPod/.test(navigator.userAgent)||((navigator.platform==='MacIntel')&&navigator.maxTouchPoints>1);var file=new File([blob],fileName,{type:'application/json'});if(isAppleMobile&&typeof navigator.share==='function'&&typeof navigator.canShare==='function'&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title:fileName});finish('JSONファイルを共有しました');return;}catch(shareError){if(shareError&&shareError.name==='AbortError'){finish('共有をキャンセルしました');return;}throw new Error('JSONファイルの共有に失敗しました: '+String(shareError&&shareError.message||shareError));}}objectUrl=URL.createObjectURL(blob);var link=document.createElement('a');link.href=objectUrl;link.download=fileName;link.style.display='none';document.body.appendChild(link);link.click();link.remove();setTimeout(function(){if(objectUrl)URL.revokeObjectURL(objectUrl);},10000);finish('JSONを書き出しました');}catch(error){if(objectUrl)setTimeout(function(){URL.revokeObjectURL(objectUrl);},60000);downloadButton.disabled=false;downloadButton.textContent='書き出し失敗: '+String(error&&error.message||error).slice(0,45);setTimeout(function(){if(downloadButton.isConnected)downloadButton.textContent=oldLabel;},6000);}});}}async function manualProbe(){var path=document.getElementById('manualPath').value.trim();var queryText=document.getElementById('manualQuery').value.trim();var query={};if(queryText){try{query=JSON.parse(queryText);}catch(e){document.getElementById('manualStatus').textContent='クエリJSONの形式が正しくありません。';return;}}document.getElementById('manualStatus').textContent='手入力コマンド実行中…';try{var r=await fetch('/api/admin/mightpulse-probe',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify({mode:'manual',path:path,query:query,mighty_required:document.getElementById('manualMightyRequired').value!=='false'})});var d=await r.json();if(!r.ok||!d.ok)throw new Error(d.message||d.error||('HTTP '+r.status));var p=d.probe;p.client_received_at=Date.now();var rows=read();rows.unshift({client_received_at:p.client_received_at,request_id:p.request_id,type:p.type,target_id:p.target_id,actor:p.actor||null,actor_label:p.actor&&p.actor.label||"-",actor_role:p.actor&&p.actor.role||"",http_status:p.http_status,elapsed_ms:p.elapsed_ms,hash:p.response_sha256});write(rows);draw();showLatest(p);document.getElementById('manualStatus').textContent='取得成功。R2保存: '+(p.archive&&p.archive.r2_saved?'成功':'未確認')+' / メタデータ: '+(p.archive&&p.archive.metadata_saved?'保存':'未保存');}catch(e){document.getElementById('manualStatus').textContent='実行失敗: '+esc(e.message||e);}}document.getElementById('runManual').addEventListener('click',function(ev){runButtonAction(ev.currentTarget,manualProbe,document.getElementById('manualStatus'));});document.getElementById('catalogCategory').addEventListener('change',renderCatalog);document.getElementById('catalogSearch').addEventListener('input',renderCatalog);async function runCatalogCommand(cmd){
if(!activeCatalogCommand||activeCatalogCommand.id!==cmd.id){configureCatalogCommand(cmd);return;}
var readInput=function(key,fallback){var el=document.getElementById('catalogInput_'+key);return el?el.value.trim():fallback;};
var governor=readInput('governor_id',readInput('uid',document.getElementById('governorId').value.trim()));
var kid=readInput('kid',document.getElementById('kid').value.trim());
var tag=readInput('tag',document.getElementById('manualAllianceTag').value.trim());
var path=cmd.endpoint.replace(/\\{governor_id\\}/g,governor||'{governor_id}').replace(/\\{uid\\}/g,governor||'{uid}').replace(/\\{kid\\}/g,kid||'{kid}').replace(/\\{tag\\}/g,tag||'{tag}');
var missing=[];
if(path.indexOf('{governor_id}')>=0||path.indexOf('{uid}')>=0)missing.push(['Player 領主ID','governorId']);
if(path.indexOf('{kid}')>=0)missing.push(['王国番号','kid']);
if(path.indexOf('{tag}')>=0)missing.push(['Alliance タグ','manualAllianceTag']);
if(missing.length){document.getElementById('catalogFormStatus').textContent='入力してください：'+missing.map(function(x){return x[0];}).join('、');var key=missing[0][0]==='王国番号'?'kid':missing[0][0]==='Alliance タグ'?'tag':'governor_id';var el=document.getElementById('catalogInput_'+key);if(el)el.focus();return;}
document.getElementById('catalogFormStatus').textContent='「'+cmd.label+'」を実行中…';
try{
var params={governor_id:governor,uid:readInput('uid',governor),kid:kid,tag:tag,board:readInput('board',document.getElementById('board').value),limit:Number(readInput('size','100'))||100,page:Number(readInput('page','1'))||1,size:Math.min(24,Number(readInput('size','24'))||24)};
var r=await fetch('/api/admin/mightpulse-probe',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify({mode:'batch',batch_type:'selected',command_ids:[cmd.id],params:params,concurrency:1,max_commands:1,automatic_discovery:false})});
var d=await r.json();
if(!r.ok||(!d.ok&&!d.batch_id))throw new Error(d.message||d.error||('HTTP '+r.status));
if(d.batch_id){try{localStorage.setItem('eagleeye_mightpulse_probe_last_batch_v1',d.batch_id);}catch(e){}}
var item=(d.results||[])[0];
renderBatchResults(d.results||[]);
if(!d.ok&&d.batch_id){document.getElementById('catalogFormStatus').textContent='API Poolの空き待ちで一時停止しました。Batch IDを保存しました。「中断したバッチを再開」から再試行できます。';return;}
if(!item)throw new Error('PROBE_RESULT_MISSING');
if(item.request_id){
var hr=await fetch('/api/admin/mightpulse-probe?request_id='+encodeURIComponent(item.request_id),{credentials:'same-origin',cache:'no-store'});
var hd=await hr.json();
if(hr.ok&&hd.ok&&hd.record){var rec=hd.record;showLatest({request_id:rec.request_id,type:rec.command_type||cmd.id,target_type:cmd.category,target_id:rec.endpoint||item.path||'',endpoint:rec.endpoint||item.path||'',query:rec.query||cmd.query||{},http_status:rec.http_status,elapsed_ms:rec.elapsed_ms,raw_payload:rec.raw_payload||null,diagnostic_payload:rec.diagnostic||null,field_dictionary:rec.field_dictionary||[],archive:rec.archive||item.archive||null});}
}
document.getElementById('catalogFormStatus').textContent='「'+cmd.label+'」: '+(item.status||'完了')+' / HTTP '+(item.http_status||'-')+' / '+(item.elapsed_ms==null?'-':item.elapsed_ms+' ms');
}catch(e){document.getElementById('catalogFormStatus').textContent='実行失敗: '+esc(e.message||e);}
}
var activeCatalogCommand=null;function configureCatalogCommand(cmd){activeCatalogCommand=cmd;var fields=[];var endpoint=cmd.endpoint||'';if(endpoint.indexOf('{governor_id}')>=0)fields.push({key:'governor_id',label:'領主ID',placeholder:'例: 223636495',inputmode:'numeric'});if(endpoint.indexOf('{uid}')>=0)fields.push({key:'uid',label:'領主UID',placeholder:'UIDを入力',inputmode:'numeric'});if(endpoint.indexOf('{kid}')>=0)fields.push({key:'kid',label:'王国番号',placeholder:'例: 1524',inputmode:'numeric'});if(endpoint.indexOf('{tag}')>=0)fields.push({key:'tag',label:'同盟タグ',placeholder:'例: ABC'});if(cmd.id==='kingdom_rank_board')fields.push({key:'board',label:'ランキング種別',select:true});if(cmd.id==='kingdom_list'){fields.push({key:'page',label:'ページ番号',placeholder:'1',inputmode:'numeric'});fields.push({key:'size',label:'取得件数（最大24）',placeholder:'24',inputmode:'numeric'});}document.getElementById('catalogFormTitle').textContent=cmd.label;document.getElementById('catalogFormHelp').textContent=commandPurpose(cmd)+' 必要な項目だけ入力すれば実行できます。APIパスやクエリJSONの編集は不要です。';document.getElementById('catalogFormFields').innerHTML=fields.map(function(f){if(f.select)return '<label class="field"><span>'+esc(f.label)+'</span><select id="catalogInput_'+f.key+'">'+document.getElementById('board').innerHTML+'</select></label>';var prior=f.key==='governor_id'||f.key==='uid'?document.getElementById('governorId').value:f.key==='kid'?document.getElementById('kid').value:f.key==='tag'?document.getElementById('manualAllianceTag').value:'';return '<label class="field"><span>'+esc(f.label)+'</span><input id="catalogInput_'+f.key+'" '+(f.inputmode?'inputmode="'+f.inputmode+'" ':'')+'autocomplete="off" placeholder="'+esc(f.placeholder||'')+'" value="'+esc(prior)+'"></label>';}).join('')||'<p class="hint">追加の入力は不要です。</p>';document.getElementById('catalogFormStatus').textContent='必要項目: '+(fields.map(function(f){return f.label;}).join('・')||'なし')+(cmd.requiresMighty?' / Mighty権限が必要':'');document.getElementById('catalogCommandForm').hidden=false;document.getElementById('catalogCommandForm').scrollIntoView({behavior:'smooth',block:'start'});var first=document.querySelector('#catalogFormFields input, #catalogFormFields select');if(first)first.focus({preventScroll:true});}document.getElementById('catalogFormRun').addEventListener('click',function(ev){if(activeCatalogCommand)runButtonAction(ev.currentTarget,function(){return runCatalogCommand(activeCatalogCommand);},document.getElementById('catalogFormStatus'));});document.getElementById('catalogFormCancel').addEventListener('click',function(){document.getElementById('catalogCommandForm').hidden=true;activeCatalogCommand=null;});document.getElementById('catalogList').addEventListener('click',function(ev){var config=ev.target.closest('[data-config-catalog]');if(config){var selected=probeCatalog.find(function(c){return c.id===config.getAttribute('data-config-catalog');});if(selected){setButtonState(config,'clicked');configureCatalogCommand(selected);document.getElementById('catalogFormStatus').textContent='設定フォームを開きました。入力後に「この内容で実行」を押してください。';setTimeout(function(){setButtonState(config,'',null);},900);}return;}var btn=ev.target.closest('[data-run-catalog]');if(!btn)return;var cmd=probeCatalog.find(function(c){return c.id===btn.getAttribute('data-run-catalog');});if(!cmd)return;var needsInput=/\{(governor_id|uid|kid|tag)\}/.test(cmd.endpoint||'')||cmd.id==='kingdom_list'||cmd.id==='kingdom_rank_board';if(needsInput){setButtonState(btn,'clicked');configureCatalogCommand(cmd);document.getElementById('catalogFormStatus').textContent='入力フォームを開きました。必要項目を確認して「この内容で実行」を押してください。';setTimeout(function(){setButtonState(btn,'',null);},900);return;}activeCatalogCommand=cmd;runButtonAction(btn,function(){return runCatalogCommand(cmd);},document.getElementById('catalogFormStatus'));});renderCatalog();async function probe(type){var q=new URLSearchParams({type:type});if(type==='PLAYER'){q.set('governor_id',document.getElementById('governorId').value.trim());q.set('include',document.getElementById('include').value);}else{q.set('kid',document.getElementById('kid').value.trim());if(type==='KINGDOM_RANKING')q.set('board',document.getElementById('board').value);}document.getElementById('status').textContent='取得中…';try{var r=await fetch('/api/admin/mightpulse-probe?'+q.toString(),{cache:'no-store',credentials:'same-origin'});var d=await r.json();if(!r.ok||!d.ok)throw new Error(d.message||d.error||('HTTP '+r.status));var p=d.probe;p.client_received_at=Date.now();var rows=read();var previous=rows.find(function(x){return x.type===p.type&&String(x.target_id)===String(p.target_id);})||null;rows.unshift({client_received_at:p.client_received_at,type:p.type,target_id:p.target_id,actor:p.actor||null,actor_label:p.actor&&p.actor.label||"-",actor_role:p.actor&&p.actor.role||"",fresh:p.fresh,cached_at:p.cached_at,age_seconds:p.age_seconds,http_status:p.http_status,elapsed_ms:p.elapsed_ms,hash:p.response_sha256});write(rows);draw();showLatest(p,previous);document.getElementById('status').innerHTML='<span class=\"ok\">取得成功。履歴に追加しました。</span>';}catch(e){document.getElementById('status').innerHTML='<span class=\"error\">Probe失敗: '+esc(e.message||e)+'</span>';}}document.querySelectorAll('button[data-type]').forEach(function(btn){btn.addEventListener('click',function(){var type=btn.getAttribute('data-type');runButtonAction(btn,function(){return probe(type);},document.getElementById('status'));});});document.getElementById('clearHistory').addEventListener('click',function(){localStorage.removeItem(key);draw();document.getElementById('latest').innerHTML='';});var lastBatchKey='eagleeye_mightpulse_probe_last_batch_v1';function renderBatchResults(results){document.getElementById('batchResults').innerHTML='<table><thead><tr><th>#</th><th>コマンド</th><th>起動理由</th><th>HTTP</th><th>結果</th><th>保存先</th></tr></thead><tbody>'+(results||[]).map(function(x){return '<tr><td>'+esc(x.sequence_no||'-')+'</td><td>'+esc(x.command_id||x.type||'-')+'<br><span class="small">'+esc(x.endpoint||x.path||'')+'</span></td><td>'+esc(x.trigger_reason||'MANUAL')+'</td><td>'+esc(x.http_status||'-')+'</td><td>'+esc(x.status|| (x.ok?'SUCCESS':'FAILED'))+' '+esc(x.error||'')+'</td><td>'+esc(x.archive&&x.archive.r2_saved?'R2':'未保存')+'</td></tr>';}).join('')+'</tbody></table>'; }async function runBatch(mode,batchType,category){var id=mode==='resume'?localStorage.getItem(lastBatchKey):null;if(mode==='resume'&&!id){document.getElementById('batchStatus').textContent='再開できるバッチIDがありません。';return;}if(mode!=='resume'){id=(crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random());localStorage.setItem(lastBatchKey,id);}document.getElementById('batchStatus').textContent=mode==='resume'?'バッチ再開中…':'一括実行中…';var params={governor_id:document.getElementById('governorId').value.trim(),kid:document.getElementById('kid').value.trim(),tag:document.getElementById('manualAllianceTag')?document.getElementById('manualAllianceTag').value.trim():'',board:document.getElementById('board').value};try{var r=await fetch('/api/admin/mightpulse-probe',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify({mode:mode==='resume'?'resume':'batch',batch_id:id,batch_type:batchType,category:category,params:params,concurrency:Number(document.getElementById('probeBatchConcurrency').value)||2,max_commands:60,automatic_discovery:true})});var d=await r.json();if(d.batch_id)localStorage.setItem(lastBatchKey,d.batch_id);renderBatchResults(d.results||[]);document.getElementById('batchStatus').textContent='状態: '+(d.state||'FAILED')+' / 完了 '+(d.completed_commands||0)+' / 対象 '+(d.total_commands||0)+' / Batch ID '+(d.batch_id||id)+(d.error?' / '+d.error:'');}catch(e){document.getElementById('batchStatus').textContent='一括実行が中断された可能性があります。Batch IDを保持しています。再開を押してください。';}}document.getElementById('runCategoryBatch').addEventListener('click',function(ev){runButtonAction(ev.currentTarget,function(){return runBatch('batch','category',document.getElementById('probeBatchCategory').value);},document.getElementById('batchStatus'));});document.getElementById('runAllBatch').addEventListener('click',function(ev){if(confirm('最大60コマンドを実行し、ランキングや関連データを追加調査します。APIリクエスト数が増える可能性があります。続けますか？'))runButtonAction(ev.currentTarget,function(){return runBatch('batch','all','');},document.getElementById('batchStatus'));});document.getElementById('resumeBatch').addEventListener('click',function(ev){runButtonAction(ev.currentTarget,function(){return runBatch('resume','resume','');},document.getElementById('batchStatus'));});draw();fetch('/api/admin/mightpulse-probe?history=1&limit=50',{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.json();}).then(function(d){if(!d||!d.ok||!Array.isArray(d.history))return;document.getElementById('history').innerHTML=d.history.map(function(p){return '<tr><td>'+new Date(Number(p.created_at||0)*1000).toLocaleString('ja-JP')+'</td><td>'+esc(p.actor_label||p.actor_discord_id||'-')+'<br><span class="small">'+esc(p.actor_role||'')+'</span></td><td>'+esc(p.command_type||'')+'<br><span class="small">'+esc(p.endpoint||'')+'</span></td><td>'+esc(p.status||'-')+'</td><td>'+esc(p.trigger_reason||'MANUAL')+(p.discovered_from?' · '+esc(p.discovered_from):'')+(p.key_source?' · '+esc(p.key_source):'')+(p.key_owner_user_id?' · lender '+esc(p.key_owner_user_id):'')+'</td><td>'+esc(p.response_count==null?'-':p.response_count)+' / retry '+esc(p.retry_count==null?0:p.retry_count)+'</td><td>'+esc(p.http_status||'-')+'</td><td>'+esc(p.elapsed_ms==null?'-':p.elapsed_ms)+' ms</td><td><button type="button" data-open-probe="'+esc(p.request_id)+'">開く</button></td></tr>';}).join('')||'<tr><td colspan=\\\"9\\\" class=\\\"small\\\">履歴なし</td></tr>';}).catch(function(){});document.getElementById('history').addEventListener('click',function(event){var button=event.target.closest('[data-open-probe]');if(!button)return;var id=button.getAttribute('data-open-probe');button.textContent='読込中…';fetch('/api/admin/mightpulse-probe?request_id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.json().then(function(d){if(!r.ok||!d.ok)throw new Error(d.error||'HISTORY_LOAD_FAILED');return d;});}).then(function(d){var rec=d.record||{};showLatest({request_id:rec.request_id||id,type:rec.command_type||'Probe履歴',target_type:rec.target_type||'',target_id:rec.endpoint||'',endpoint:rec.endpoint||'',query:rec.query||{},http_status:rec.http_status,elapsed_ms:rec.elapsed_ms,raw_payload:rec.raw_payload||null,diagnostic_payload:rec.diagnostic||null,field_dictionary:rec.field_dictionary||[],archive:{r2_saved:true,metadata_saved:true}});}).catch(function(e){document.getElementById('status').textContent='履歴読込失敗: '+esc(e.message||e);}).finally(function(){button.textContent='開く';});});}());</script></body></html>`;}
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

async function runApiPoolAutoRecovery(env, { limit = 4 } = {}) {
  if (!env?.DB) return { checked: 0, recovered: 0, disabled: 0, failed: 0 };
  configureApiPoolEncryption(env.EAGLEEYE_SESSION_SECRET);
  const now = Math.floor(Date.now() / 1000);
  const rows = await env.DB.prepare(
    "SELECT key_id, status, pool_type, last_error_at FROM api_pool_keys " +
    "WHERE provider = 'MIGHTPULSE' " +
    "AND status IN ('ERROR','COOLDOWN') " +
    "AND (cooldown_until IS NULL OR cooldown_until <= ?) " +
    "AND (leased_until IS NULL OR leased_until <= ?) " +
    "ORDER BY COALESCE(last_error_at, 0) ASC, created_at ASC LIMIT ?"
  ).bind(now, now, Math.max(1, Math.min(10, Number(limit) || 4))).all();

  let checked = 0, recovered = 0, disabled = 0, failed = 0;
  const probeGovernorId = String(env.MIGHTPULSE_HEALTHCHECK_GOVERNOR_ID || "225623582").trim();

  for (const row of (rows.results || [])) {
    let lease = null;
    checked++;
    try {
      lease = await leaseApiKeyForHealthCheck(env.DB, {
        keyId: String(row.key_id),
        purpose: "API_POOL_AUTO_RECOVERY",
        targetType: "API_KEY",
        targetId: probeGovernorId
      });
      const result = await getMightPulsePlayer(env, probeGovernorId, {
        include: "base",
        apiKey: lease.api_key,
        metadata: { leaseId: lease.lease_id, poolType: lease.pool_type }
      });
      await recordApiPoolSuccess(env.DB, {
        keyId: lease.key_id,
        leaseId: lease.lease_id,
        poolType: lease.pool_type,
        endpoint: "/players/:governor_id",
        targetType: "API_KEY",
        targetId: probeGovernorId,
        purpose: "API_POOL_AUTO_RECOVERY",
        httpStatus: result.status,
      requestCount: Math.max(1, Number(result.attempts) || 1),
        remainingMinute: parseHeaderNumber(result.headers, "x-ratelimit-remaining"),
        remainingDay: parseHeaderNumber(result.headers, "x-ratelimit-day-remaining")
      });
      recovered++;
    } catch (error) {
      failed++;
      if (lease) {
        const status = Number(error?.status || 0);
        const cooldown = status === 429 ? 300
          : status >= 500 || error?.code === "MIGHTPULSE_TIMEOUT" || error?.code === "MIGHTPULSE_NETWORK_ERROR" ? 60
          : 300;
        const disable = status === 401 || status === 403;
        await recordApiPoolFailure(env.DB, {
          keyId: lease.key_id,
          leaseId: lease.lease_id,
          poolType: lease.pool_type,
          endpoint: "/players/:governor_id",
          targetType: "API_KEY",
          targetId: probeGovernorId,
          purpose: "API_POOL_AUTO_RECOVERY",
          httpStatus: status,
          errorCode: error?.code || "MIGHTPULSE_REQUEST_FAILED",
          errorMessage: error?.message || null,
          cooldownSeconds: disable ? 0 : cooldown,
          disable,
          keepAvailable: false,
          requestCount: Math.max(1, Number(error?.attempts) || 1)
        });
        if (disable) disabled++;
      }
    }
  }

  return { checked, recovered, disabled, failed };
}

export default {
  async fetch(request, env, executionContext) {
    setSystemEventQueue(env.SYSTEM_EVENT_QUEUE);
    const url = new URL(request.url);
    const requestTraceId = request.headers.get("x-eagle-eye-trace-id") || systemTraceId("http");
    try {
      if (url.pathname === "/kingdom-watchlist-lab.html" || url.pathname === "/kingdom-watchlist-lab") { const assetResponse = await env.ASSETS.fetch(new Request(new URL("/kingdom-watchlist-lab.html", request.url), request)); if (!assetResponse.ok) return assetResponse; return new Response(await assetResponse.text(), { status: assetResponse.status, headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } }); }
      if (url.pathname === "/status-json-comparator" || url.pathname === "/status-json-comparator.html") { const assetResponse = await env.ASSETS.fetch(new Request(new URL("/status-json-comparator.html", request.url), request)); if (!assetResponse.ok) return assetResponse; return eagleEyeHtmlResponse(await assetResponse.text()); }
      if (url.pathname === "/api/client-telemetry") return await handleClientTelemetry(request, env);
      if (url.pathname.startsWith("/api/gateway/v1/")) return await handleGatewayApi(request, env);
      if (url.pathname === "/api/kingdom-rankings/preferences") return await handleKingdomRankingPreferencesApi(request, env);
      if (url.pathname === "/api/kingdom-portal/ranking") return await handleKingdomPortalApi(request, env);
      if (url.pathname === "/api/kingdom-portal/status") { const guard = await requireAdmin(request, env); if (guard.error) return guard.error; return await handleKingdomPortalApi(request, env, guard.auth); }
      if (url.pathname === "/api/player-watchlist") return await handlePlayerWatchlistApi(request, env);
      if (url.pathname === "/watchlist") return eagleEyeHtmlResponse(await renderWatchlistHubPage(request, env));
      if (url.pathname === "/player-watchlist") return eagleEyeHtmlResponse(await renderPlayerWatchlistPage(request, env));
      if (url.pathname === "/api/kingdom-watchlist/history") return await handleKingdomRankingHistoryApi(request, env);
      if (url.pathname === "/api/kingdom-watchlist/data") return await handleKingdomWatchlistDataApi(request, env);
      if (url.pathname === "/api/kingdom-watchlist") return await handleKingdomWatchlistApi(request, env, requestTraceId);
      if (url.pathname === "/kingdom-watchlist") return eagleEyeHtmlResponse(await renderKingdomWatchlistPage(request, env));
      if (url.pathname === "/api/auth/ui-state") {
        const auth = await getAuthenticatedUser(request, env);
        const active = Boolean(auth && auth.status === "ACTIVE");
        return json({ authenticated: active, role: active ? auth.role : null });
      }
      if (url.pathname === "/api/auth/discord") return await startDiscordLogin(request, env);
      if (url.pathname === CALLBACK_PATH) return await handleDiscordCallback(request, env);
      if (url.pathname === "/api/auth/logout") return logout(request);
      if (url.pathname === "/api/admin/google-drive/authorize") return await handleGoogleDriveAuthorizeApi(request, env);
      if (url.pathname === "/api/admin/google-drive/verify") return await handleGoogleDriveVerifyApi(request, env);
      if (url.pathname === "/api/admin/google-drive/callback") return await handleGoogleDriveOAuthCallback(request, env);
      if (url.pathname === "/api/debug/player-gear") return await handleDebugPlayerGear(request, env);
      if (url.pathname === "/api/debug/player-icons") return await handleDebugPlayerIcons(request, env);
      if (url.pathname === "/api/discord/interactions") return await handleSupportInteraction(request, env);
      if (url.pathname === "/api/admin/discord-support/register-command") return await handleDiscordSupportCommandRegistrationApi(request, env);
      if (url.pathname === "/api/support") { const auth = await getAuthenticatedUser(request, env); return await handleSupportApi(request, env, auth); } if (url.pathname === "/api/support/context") { const auth = await getAuthenticatedUser(request, env); return await handleSupportContextApi(request, env, auth); }
      if (url.pathname === "/api/me") return await handleMe(request, env);
      if (url.pathname === "/api/admin/mightpulse/player") return await handleMightPulsePlayerTest(request, env);
      if (url.pathname === "/api/admin/mightpulse-probe") return await handleMightPulseProbeApi(request, env);
      if (url.pathname === "/api/admin/mightpulse-research") return await handleMightPulseResearchApi(request, env);
      if (url.pathname === "/api/admin/rankings/player") return await handleRankingPlayerTest(request, env);
      if (url.pathname === "/api/admin/rankings/board") return await handleRankingBoardTest(request, env);
      if (url.pathname === "/api/admin/data-retention") return await handleDataRetentionApi(request, env);
      if (url.pathname === "/api/admin/kingdom-catalog-r2-backfill") return await handleKingdomCatalogR2BackfillApi(request, env);
      if (url.pathname === "/api/admin/player-visibility") return await handlePlayerVisibilityApi(request, env);
      if (url.pathname === "/api/admin/player-export") return await handlePlayerSectionExport(request, env);
      if (url.pathname === "/api/admin/kingdom-rankings") return await handleAdminKingdomRankingApi(request, env);
      if (url.pathname === "/api/admin/kingdom-ranking-export") return await handleAdminKingdomRankingExport(request, env);
      if (url.pathname === "/api/admin/diagnostics") return await handleAdminDiagnosticsApi(request, env);
      if (url.pathname === "/api/admin/system-log") { const guard = await requireAdmin(request, env); if (guard.error) return guard.error; return await handleAdminSystemLogApi(request, env, guard.auth); }
      if (url.pathname === "/api/admin/system-log/export") { const guard = await requireAdmin(request, env); if (guard.error) return guard.error; return await handleAdminSystemLogExportApi(request, env, guard.auth); }
      if (url.pathname === "/api/admin/system-log/export/download") { const guard = await requireAdmin(request, env); if (guard.error) return guard.error; return await handleAdminSystemLogExportDownloadApi(request, env, guard.auth); }
      if (url.pathname === "/api/admin/discord/roles") return await handleDiscordRolesLookupApi(request, env);
      if (url.pathname === "/api/admin/monitoring-profile") return await handleMonitoringProfileApi(request, env);
      if (url.pathname === "/api/admin/r2-archive-objects") return await handleR2ArchiveObjectsApi(request, env);
      if (url.pathname === "/api/admin/api-pool/keys") return await handleApiPoolKeys(request, env);
      if (url.pathname === "/api/admin/api-pool/add") return await handleApiPoolAdd(request, env);
      if (url.pathname === "/api/admin/api-raw-data") { const guard = await requireAdmin(request, env); if (guard.error) return guard.error; return await handleApiRawDataApi(request, env, guard.auth); }
      if (url.pathname === "/api/admin/api-raw-history") { const guard = await requireAdmin(request, env); if (guard.error) return guard.error; return await handleApiRawHistoryApi(request, env, guard.auth); }
      if (url.pathname === "/api/admin/api-pool/move") return await handleApiPoolMove(request, env);
      if (url.pathname === "/api/admin/api-pool/revoke") return await handleApiPoolRevoke(request, env);
      if (url.pathname === "/api/admin/api-pool/mighty-check") return await handleApiPoolMightyCheck(request, env);
      if (url.pathname === "/api/admin/api-pool/health-check") return await handleApiPoolHealthCheck(request, env);
      if (url.pathname === "/api/admin/api-pool/delete") return await handleApiPoolDelete(request, env);
      if (url.pathname === "/api/admin/api-pool/test-player") return await handleApiPoolTestPlayer(request, env);
      if (url.pathname === "/api/admin/api-pool/test-ranking") return await handleApiPoolTestRanking(request, env);
      if (url.pathname === "/api/owner/kingdom-load-test/system-json") { const guard = await requireOwner(request, env); if (guard.error) return guard.error; return await handleOwnerKingdomLoadTestSystemJsonApi(request, env); }
      if (url.pathname === "/api/owner/kingdom-load-test/history") { const guard = await requireOwner(request, env); if (guard.error) return guard.error; return await handleOwnerKingdomLoadTestHistoryApi(request, env); }
      if (url.pathname === "/api/owner/kingdom-load-test/status") { const guard = await requireOwner(request, env); if (guard.error) return guard.error; return await handleOwnerKingdomLoadTestStatusApi(request, env); }
      if (url.pathname === "/api/load-test/notice-status") return await handleLoadTestNoticeStatusApi(request, env);
      if (url.pathname === "/api/owner/kingdom-load-test/cancel") { const guard = await requireOwner(request, env); if (guard.error) return guard.error; return await handleOwnerKingdomLoadTestCancelApi(request, env, guard.auth); }
      if (url.pathname === "/api/owner/kingdom-load-test") { const guard = await requireOwner(request, env); if (guard.error) return guard.error; return await handleOwnerKingdomLoadTestApi(request, env, guard.auth, requestTraceId, processKingdomWatchlistJob, executionContext); }
      if (url.pathname === "/api/owner/users") return await handleOwnerUsersApi(request, env);
      if (url.pathname === "/api/owner/users/watchlists") return await handleOwnerUserWatchlistsApi(request, env);
      if (url.pathname === "/api/owner/users/role") return await handleOwnerUserRoleApi(request, env);
      if (url.pathname === "/api/owner/users/status") return await handleOwnerUserStatusApi(request, env);
      if (url.pathname === "/api/owner/users/login-history") return await handleOwnerLoginHistoryApi(request, env);
      if (url.pathname === "/api/owner/audit-log") return await handleOwnerAuditLogApi(request, env);
      if (url.pathname === "/owner") return eagleEyeHtmlResponse(await renderOwnerAdminPage(request, env));
      if (url.pathname === "/owner/player-link-support") return eagleEyeHtmlResponse(await renderOwnerPlayerLinkSupportPage(request, env));
      if (url.pathname === "/admin") return eagleEyeHtmlResponse(await renderAdminControlPage(request, env));
      if (url.pathname === "/admin/google-drive") return await renderGoogleDriveSetupPage(request, env);
      if (url.pathname === "/admin/data-retention") return eagleEyeHtmlResponse(await renderDataRetentionPage(request, env));
      if (url.pathname === "/admin/player-visibility") return eagleEyeHtmlResponse(await renderPlayerVisibilityPage(request, env));
      if (url.pathname === "/admin/kingdom-rankings") return eagleEyeHtmlResponse(await renderAdminKingdomRankingsPage(request, env));
      if (url.pathname === "/support") return eagleEyeHtmlResponse(await renderSupportPage(request, env));
      if (url.pathname === "/status") return await renderPublicStatusPage(request, env);
      if (url.pathname === "/admin/diagnostics") return await renderAdminDiagnosticsPage(request, env);
      if (url.pathname === "/admin/system-log") { const guard = await requireAdmin(request, env); if (guard.error) return guard.error; return eagleEyeHtmlResponse(renderAdminSystemLogPage()); }
      if (url.pathname === "/admin/data-coverage") { const guard = await requireAdmin(request, env); if (guard.error) return guard.error; return eagleEyeHtmlResponse(await renderAdminDataCoveragePage(env, guard.auth)); }
      if (url.pathname === "/kingdom-catalog") { if (url.searchParams.get("suggest") === "1") return await renderKingdomCatalogPage(request, env); return eagleEyeHtmlResponse(await renderKingdomCatalogPage(request, env)); }
      if (url.pathname.startsWith("/hero-icons/assets/")) return await serveHeroIconAsset(request, env, url.pathname);
      if (url.pathname === "/hero-catalog") {
        let iconByName = {};
        try {
          iconByName = await getSavedHeroIconMap(env.DB);
        } catch (error) {
          console.error("hero_icon_catalog_lookup_failed", error?.message || error);
        }
        return await renderHeroCatalogPage(iconByName);
      }
      if (url.pathname === "/kingdom") return eagleEyeHtmlResponse(await renderKingdomDetailPage(request, env));
      if (url.pathname === "/kingdom/rankings") { const auth = await getAuthenticatedUser(request, env); return eagleEyeHtmlResponse(await renderKingdomRankingsPage(request, env, auth)); }
      if (url.pathname === "/kingdom/alliances") return eagleEyeHtmlResponse(await renderAllianceListPage(request, env));
      if (url.pathname === "/alliance") return eagleEyeHtmlResponse(await renderAlliancePage(request, env));
      if (url.pathname === "/kingdom/compare") return eagleEyeHtmlResponse(await renderKingdomComparePage(request, env));
      if (url.pathname === "/kingdom/mighty") { const auth = await getAuthenticatedUser(request, env); return eagleEyeHtmlResponse(await renderKingdomMightyPage(request, env, auth)); }
      if (url.pathname === "/kingdom/changes") return eagleEyeHtmlResponse(await renderKingdomChangesPage(request, env));
      if (url.pathname === "/kingdom-watchlist/analytics") { const auth = await getAuthenticatedUser(request, env); if (!auth || auth.status !== "ACTIVE") return json({ ok: false, error: "UNAUTHORIZED" }, 401); return eagleEyeHtmlResponse(await renderKingdomWatchlistAnalyticsPage(request, env, auth)); }
      if (url.pathname === "/admin/mightpulse-probe") return eagleEyeHtmlResponse(await renderMightPulseProbePage(request, env));
      if (url.pathname === "/admin/api-raw-data") { const guard = await requireAdmin(request, env); if (guard.error) return guard.error; return eagleEyeHtmlResponse(renderApiRawDataPage(guard.auth)); }
      if (url.pathname === "/admin/mightpulse-research") return eagleEyeHtmlResponse(await renderMightPulseResearchPage(request, env));
      if (url.pathname === "/admin/api-pool") return eagleEyeHtmlResponse(await renderApiPoolAdminPage(request, env));
      if (url.pathname === "/owner/kingdom-load-test") { const guard = await requireOwner(request, env); if (guard.error) return guard.error; return eagleEyeHtmlResponse(renderOwnerKingdomLoadTestPage()); }
      if (url.pathname === "/owner/kingdom-catalog-r2-backfill") {
        const guard = await requireOwner(request, env);
        if (guard.error) return guard.error;
        if (request.method === "POST") {
          const form = await request.formData().catch(() => null);
          if (["run", "run_all"].includes(String(form?.get("action") || ""))) {
            try {
              const runAll = String(form?.get("action") || "") === "run_all";
              const requestedBatchSize = runAll ? 100 : Math.min(100, Math.max(1, Number(form?.get("batch_size") || 10)));
              const submittedTotalTargetCount = Number(form?.get("totalTargetCount"));
              const totalTargetCount = Number.isFinite(submittedTotalTargetCount) && submittedTotalTargetCount >= 0
                ? submittedTotalTargetCount
                : null;
              const result = await runKingdomCatalogR2Backfill(env, { batchSize: requestedBatchSize });
              const verification = result.archived > 0 ? await verifyKingdomCatalogR2Backfill(env, { batchSize: result.archived }) : { checked: 0, r2: 0, pointer: 0, rawNull: 0, boardsNull: 0, failed: 0, rows: [] };
              if (verification.failed > 0) {
                await env.DB.prepare("UPDATE kingdom_catalog_r2_migration SET state = 'FAILED', last_error = ?, updated_at = ? WHERE migration_key = 'KINGDOM_CATALOG_R2_BACKFILL'")
                  .bind("VERIFICATION_FAILED:" + verification.failed, Math.floor(Date.now() / 1000)).run();
              }
              return eagleEyeHtmlResponse(await renderKingdomCatalogR2BackfillPage(env, { ...result, verification, totalTargetCount, autoContinue: runAll && !result.complete && Number(verification.failed || 0) === 0 }));
            } catch (error) {
              return eagleEyeHtmlResponse(await renderKingdomCatalogR2BackfillPage(env, { ok:false, error:error?.message || String(error) }));
            }
          }
        }
        return eagleEyeHtmlResponse(await renderKingdomCatalogR2BackfillPage(env));
      }

      if (url.pathname === "/api/me/player") return await handleMyPlayerApi(request, env);
      if (url.pathname === "/api/me/advanced" || url.pathname === "/api/me/mightpulse-key") return await handleMyAdvancedApi(request, env);
      if (url.pathname === "/api/me/vip/mighty-check") return await handleMyMightyCheckApi(request, env);
      if (url.pathname === "/api/me/vip") return await handleMyVipApi(request, env);
      if (url.pathname === "/api/owner/player-link-support") return await handleOwnerPlayerLinkSupportApi(request, env);
      if (url.pathname === "/api/owner/api-pool/reassign") return await handleOwnerApiPoolReassign(request, env);
      if (url.pathname === "/api/player/refresh") return await handlePlayerRefresh(request, env);
      if (url.pathname === "/api/player") return await handlePlayerApi(request, env);
      if (url.pathname === "/api/player/history") return await handlePlayerHistoryApi(request, env);
      if (url.pathname === "/api/player/rank-history") return await handlePlayerRankHistoryApi(request, env);
      if (url.pathname === "/api/player/changes") return await handlePlayerChangesApi(request, env);
      if (url.pathname === "/my-player") return eagleEyeHtmlResponse(await renderMyPlayerPage(request, env));
      if (url.pathname === "/players") return eagleEyeHtmlResponse(await renderPlayerSearchPage(request, env));
      if (url.pathname === "/api/player-compare/refresh-capacity") return await handlePlayerCompareRefreshCapacityApi(request, env);
      if (url.pathname === "/api/player-compare") return await handlePlayerCompareApi(request, env);
      if (url.pathname === "/player/history") return eagleEyeHtmlResponse(await renderPlayerHistoryPage(request, env));
      if (url.pathname === "/player/changes") return eagleEyeHtmlResponse(await renderPlayerChangesPage(request, env));
      if (url.pathname === "/player/compare") return await renderPlayerComparePage(request, env);
      if (url.pathname === "/player") return eagleEyeHtmlResponse(await renderPlayerPage(request, env));
      return eagleEyeHtmlResponse(await renderHome(request, env));
    } catch (error) {
      console.error("EagleEye request error:", error);
      return json({ ok: false, error: "INTERNAL_ERROR" }, 500);
    }
  },
  async scheduled(event, env, executionContext) {
    try {
      await runApiPoolAutoRecovery(env, { limit: 4 });
    } catch (error) {
      console.error("api_pool_auto_recovery_failed", error?.message || error);
    }
    try {
      await runKingdomCatalogDailyRefresh(env);
    } catch (error) {
      console.error("kingdom_catalog_daily_refresh_failed", error?.message || error);
    }
    try {
      await runHeroIconAssetWorker(env, { limit: 5 });
    } catch (error) {
      console.error("hero_icon_asset_worker_failed", error?.message || error);
    }
    try {
      await runKingdomWatchlistJobs(env);
    } catch (error) {
      console.error("kingdom_watchlist_scheduler_failed", error?.message || error);
    }
    try {
      await runKingdomDiscordNotifications(env, { lookbackSeconds: 600, maxEvents: 20 });
    } catch (error) {
      console.error("kingdom_discord_notifications_failed", error?.message || error);
    }
  },
  async queue(batch, env) {
    setSystemEventQueue(env.SYSTEM_EVENT_QUEUE);
    const messages = batch?.messages || [];
    const systemEventMessages = messages.filter(message => message?.body?.type === "SYSTEM_EVENT");
    const loadTestMessages = messages.filter(message => message?.body?.type === "KINGDOM_LOAD_TEST_RUN");
    const serviceUsageMessages = messages.filter(message =>
      message?.body?.type !== "KINGDOM_LOAD_TEST_RUN" &&
      message?.body?.type !== "SYSTEM_EVENT"
    );

    if (systemEventMessages.length) {
      await handleSystemEventQueue({ ...batch, messages: systemEventMessages }, env);
    }

    for (const message of loadTestMessages) {
      try {
        await runKingdomLoadTestQueue(env, message.body, processKingdomWatchlistJob);
        message.ack();
      } catch (error) {
        console.error("kingdom_load_test_queue_consumer_failed", error?.message || error);
        message.retry();
      }
    }

    if (serviceUsageMessages.length) {
      await handleServiceUsageQueue({ ...batch, messages: serviceUsageMessages }, env);
    }
  }
};

const EAGLEEYE_THEME_CSS = `
<style id="eagleeye-theme">
:root{color-scheme:dark}
${EAGLEEYE_THEME_BASE_CSS}

/* Canonical dark-theme controls and navigation surfaces. Keep page layouts local. */
html:not([data-eagle-theme="light"]) .ee-global-nav{background:rgba(10,20,36,.97)!important;border-color:var(--ee-border-soft,#1d344d)!important}
html:not([data-eagle-theme="light"]) .ee-global-nav-drawer{background:rgba(3,12,23,.66)!important}
html:not([data-eagle-theme="light"]) .ee-global-nav-panel{background:linear-gradient(180deg,#10243a,#0a1728)!important;border-color:var(--ee-border,#2a4664)!important;color:var(--ee-text,#e8f3ff)!important}
html:not([data-eagle-theme="light"]) .ee-global-nav-panel-head{background:linear-gradient(180deg,#10243a,#10243a)!important}
html:not([data-eagle-theme="light"]) :where(.ee-button-primary,.action.primary,.btn-primary,button.primary,input[type="submit"]){background:var(--ee-cyan,#22d3ee)!important;border-color:var(--ee-cyan,#22d3ee)!important;color:#062033!important}
html:not([data-eagle-theme="light"]) :where(.ee-button-danger,.action.danger,.btn-danger,button.danger){background:#321b2a!important;border-color:#713944!important;color:#ffb4bc!important}
html:not([data-eagle-theme="light"]) :where(.ee-button,.action,.btn,.pager-btn){border-radius:var(--ee-radius-sm,9px);font-weight:800;-webkit-tap-highlight-color:transparent;touch-action:manipulation}

/* Shared component surfaces win over legacy page-local color declarations. */
html:not([data-eagle-theme="light"]) :where(.ee-card,.card,.item,.panel,.profile-section,.compare-toolbar,.hero-card,.mini-card,.stat,.change-box,.compare-metrics div,.search-panel,.player-result,.player-lookup,.search-intro,.search-state,.account,.account-summary,.action-card,.vip-card,.watch-option,.watch-hub,.hero,.notice,.detail-row,.favorite-ranking-card,.ranking-setting-option,.name-history-row,.user-card,.user-stats,.audit,.service,.event,.details-grid,.link,.links a,.choice,.result,.discord-config-row,.collector-row,.facts,.user-list){background:var(--ee-panel,#0f2035)!important;border-color:var(--ee-border-soft,#1d344d)!important;color:var(--ee-text,#e8f3ff)!important;box-shadow:none}
html:not([data-eagle-theme="light"]) :where(.ee-muted,.muted,.sub,.hint,.label,.meta-label,.id,.meta){color:var(--ee-subtext,#91a7bf)}
html:not([data-eagle-theme="light"]) :where(input:not([type="checkbox"]):not([type="radio"]),select,textarea){background-color:var(--ee-panel-deep,#0b192b);color:var(--ee-text,#e8f3ff);border-color:var(--ee-border,#2a4664)}
html:not([data-eagle-theme="light"]) :where(.action,.btn,.pager-btn,.ee-button){background-color:var(--ee-panel-raised,#172a40);border-color:var(--ee-border,#2a4664);color:var(--ee-text,#e8f3ff)}
html:not([data-eagle-theme="light"]) :where(.action.primary,.btn-primary,.ee-button-primary,button.primary,input[type="submit"]){background:var(--ee-cyan,#22d3ee)!important;border-color:var(--ee-cyan,#22d3ee)!important;color:#062033!important}
html[data-eagle-theme="light"]{color-scheme:light}
html[data-eagle-theme="light"] body{background:#f3f6fb !important;color:#172033 !important}
html[data-eagle-theme="light"] a{color:#475569}
html[data-eagle-theme="light"] input,html[data-eagle-theme="light"] select,html[data-eagle-theme="light"] textarea{background:#fff !important;color:#172033 !important;border-color:#cbd5e1 !important}
html[data-eagle-theme="light"] button{color:#172033}
html[data-eagle-theme="light"] .card,
html[data-eagle-theme="light"] .profile-section,
html[data-eagle-theme="light"] .hero,
html[data-eagle-theme="light"] .message,
html[data-eagle-theme="light"] .meta,
html[data-eagle-theme="light"] .mini-card,
html[data-eagle-theme="light"] .hero-card,
html[data-eagle-theme="light"] .gear-card,
html[data-eagle-theme="light"] .detail-row,
html[data-eagle-theme="light"] .notice,
html[data-eagle-theme="light"] .account,
html[data-eagle-theme="light"] .pool-error{background:#fff !important;color:#172033 !important;border-color:#d6deea !important;box-shadow:0 8px 22px rgba(15,23,42,.06)}
html[data-eagle-theme="light"] .meta,
html[data-eagle-theme="light"] .gear-stat,
html[data-eagle-theme="light"] .gear-gems{background:#f8fafc !important}
html[data-eagle-theme="light"] .label,
html[data-eagle-theme="light"] .sub,
html[data-eagle-theme="light"] .hero-meta,
html[data-eagle-theme="light"] .detail-row span,
html[data-eagle-theme="light"] .muted,
html[data-eagle-theme="light"] .hint,
html[data-eagle-theme="light"] .gear-name,
html[data-eagle-theme="light"] .gear-stat,
html[data-eagle-theme="light"] .gear-gems{color:#64748b !important}
html[data-eagle-theme="light"] .value,
html[data-eagle-theme="light"] .mini-card b,
html[data-eagle-theme="light"] .hero-title strong,
html[data-eagle-theme="light"] .gear-card strong,
html[data-eagle-theme="light"] .detail-row b{color:#172033 !important}
html[data-eagle-theme="light"] .action{background:#fff !important;color:#334155 !important;border-color:#cbd5e1 !important}
html[data-eagle-theme="light"] .action.primary,
html[data-eagle-theme="light"] button{background:#22d3ee !important;border-color:#22d3ee !important;color:#062033 !important}
html[data-eagle-theme="light"] .search input{background:#fff !important;color:#172033 !important}
html[data-eagle-theme="light"] .table-wrap{border-color:#d6deea !important}
html[data-eagle-theme="light"] th,html[data-eagle-theme="light"] td{border-color:#e2e8f0 !important;color:#172033 !important}
html[data-eagle-theme="light"] th{color:#64748b !important}
html[data-eagle-theme="light"] .field label{color:#334155 !important}
html[data-eagle-theme="light"] .status{background:#ecfdf3 !important;color:#15803d !important}
html[data-eagle-theme="light"] .error{background:#fef2f2 !important;color:#b91c1c !important}
html[data-eagle-theme="light"] .btn.secondary{background:#e2e8f0 !important;color:#172033 !important}
html[data-eagle-theme="light"] .badge{background:#fff7ed !important;color:#b45309 !important}

.eagle-preview-banner{display:none;position:fixed;left:12px;top:42px;z-index:10000;padding:8px 12px;border:1px solid #f59e0b;border-radius:999px;background:rgba(68,39,0,.96);color:#fde68a;font-size:11px;font-weight:900;letter-spacing:.04em;box-shadow:0 8px 22px rgba(0,0,0,.25);backdrop-filter:blur(8px)}html[data-eagle-preview="1"] .eagle-preview-banner{display:block}.eagle-theme-toggle{position:fixed;right:14px;top:42px;z-index:9999;width:42px;height:42px;border:1px solid #475569;border-radius:12px;background:rgba(15,23,42,.92);color:#fff;display:flex;align-items:center;justify-content:center;font-size:19px;line-height:1;cursor:pointer;box-shadow:0 8px 22px rgba(0,0,0,.2);backdrop-filter:blur(8px)}
html[data-eagle-theme="light"] .eagle-theme-toggle{background:#fff;color:#172033;border-color:#cbd5e1}
.eagle-role-bar{position:fixed;left:0;right:0;top:0;z-index:9998;display:flex;align-items:center;justify-content:center;gap:6px;padding:6px 46px 6px 10px;background:rgba(10,15,28,.94);border-bottom:1px solid #334155;box-shadow:0 6px 18px rgba(0,0,0,.2);backdrop-filter:blur(10px);font-size:10px;font-weight:900;letter-spacing:.04em;white-space:nowrap;overflow-x:auto}.eagle-role-bar-label{color:#64748b;margin-right:3px}.eagle-role-item{padding:4px 7px;border:1px solid #334155;border-radius:999px;color:#64748b;background:#111827}.eagle-role-item.current{color:#f8fafc;border-color:#64748b;background:#1e293b}.eagle-role-item.vip.current,.eagle-role-item.vip{color:#f6d365;border-color:#a16207;background:rgba(120,75,0,.22);text-shadow:0 0 8px rgba(246,211,101,.25)}.eagle-role-item.admin.current,.eagle-role-item.owner.current{color:#fde68a;border-color:#d97706;background:rgba(120,53,15,.28)}html[data-eagle-theme="light"] .eagle-role-bar{background:rgba(255,255,255,.94);border-color:#d6deea}.eagle-role-bar-spacer{height:34px}
/* Global interaction feedback: consistent pressed and busy states */
:where(button,[role="button"],.action,.btn,.ee-tile,.ee-nav a,.ee-nav button,.ee-drawer-grid a,input[type="submit"]){-webkit-tap-highlight-color:transparent;touch-action:manipulation;transition:filter .12s ease,transform .12s ease,opacity .12s ease,box-shadow .12s ease,border-color .12s ease}
:where(button,[role="button"],.action,.btn,.ee-tile,.ee-nav a,.ee-nav button,.ee-drawer-grid a,input[type="submit"]):active{filter:brightness(1.28);transform:scale(.975)}
:where(a,button,[role="button"],.action,.btn):focus-visible{outline:2px solid #20d7f2!important;outline-offset:3px}
.eagle-action-busy{opacity:.82!important;cursor:wait!important;filter:saturate(.75);position:relative}
.eagle-action-busy:after{content:"";display:inline-block;width:12px;height:12px;margin-left:8px;vertical-align:-2px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:eagleActionSpin .7s linear infinite}
@keyframes eagleActionSpin{to{transform:rotate(360deg)}}

/* Shared bottom navigation across EagleEye pages */
.ee-global-nav{position:fixed;left:0;right:0;bottom:0;z-index:9000;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px;padding:7px 8px calc(7px + env(safe-area-inset-bottom));background:rgba(3,9,17,.97);border-top:1px solid #1e3349;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
.ee-global-nav a,.ee-global-nav button{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-width:0;min-height:52px;padding:5px 2px;border:0;border-radius:13px;background:transparent;color:#71869e;text-decoration:none;font:800 10px/1.2 system-ui,-apple-system,sans-serif;cursor:pointer}
.ee-global-nav .ee-global-nav-icon{font-size:20px;line-height:1.1}.ee-global-nav a.active{color:#20d7f2;background:linear-gradient(180deg,rgba(32,215,242,.12),rgba(32,215,242,.025))}.ee-global-nav a.active:before{content:"";position:absolute;top:0;left:25%;right:25%;height:3px;border-radius:4px;background:#20d7f2;box-shadow:0 0 12px rgba(32,215,242,.65)}
.ee-global-nav-badge{position:absolute;top:1px;left:calc(50% + 10px);min-width:15px;height:15px;padding:0 4px;border-radius:99px;background:#ef4444;color:#fff;font-size:9px;display:grid;place-items:center}
.ee-global-nav-drawer{position:fixed;inset:0;z-index:9001;display:none;align-items:flex-end;background:rgba(0,0,0,.58);backdrop-filter:blur(5px);padding-top:env(safe-area-inset-top)}.ee-global-nav-drawer.open{display:flex}.ee-global-nav-panel{box-sizing:border-box;width:100%;max-height:calc(100dvh - env(safe-area-inset-top) - 12px);overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:16px 16px calc(20px + env(safe-area-inset-bottom));border:1px solid #24435d;border-bottom:0;border-radius:22px 22px 0 0;background:linear-gradient(180deg,#0c2035,#06111e);color:#eff8ff}.ee-global-nav-panel-head{position:sticky;top:-16px;z-index:2;display:flex;justify-content:space-between;align-items:center;margin:-16px -16px 12px;padding:16px;background:linear-gradient(180deg,#0c2035,#0c2035);border-radius:22px 22px 0 0}.ee-global-nav-panel-head button{flex-shrink:0;border:1px solid #35516b;border-radius:10px;background:#10243a;color:#e5f5ff;padding:7px 12px}.ee-global-nav-links{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.ee-global-nav-links a,.ee-global-nav-links button{box-sizing:border-box;min-width:0;min-height:78px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:9px 6px;border:1px solid #24435d;border-radius:13px;background:#0b1b2c;color:#dceaf7;text-align:center;text-decoration:none;font-size:12px;font-weight:750}.ee-global-nav-links img{display:block;width:42px;height:42px;object-fit:contain;flex:0 0 auto}.ee-global-nav-links span{display:block;max-width:100%;overflow-wrap:anywhere}.ee-global-nav-links small{display:block;font-size:10px;opacity:.7}
body{padding-bottom:calc(82px + env(safe-area-inset-bottom))!important}
@media(min-width:900px){.ee-global-nav{left:50%;right:auto;transform:translateX(-50%);width:min(680px,calc(100% - 32px));border:1px solid #1e3349;border-bottom:0;border-radius:18px 18px 0 0}}
${EAGLEEYE_ROLE_AVATAR_CSS}
</style>`;

const EAGLEEYE_THEME_SCRIPT = `
<script id="eagleeye-theme-script">
(function(){
  function applySavedTheme(){
    try {
      var saved="";
      try { saved=window.localStorage.getItem("eagleeye-theme")||""; } catch(e) {}
      var preferred=(window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches)?"light":"dark";
      var theme=(saved==="light"||saved==="dark")?saved:preferred;
      document.documentElement.setAttribute("data-eagle-theme",theme);
    } catch(e) {}
  }

  function markEnvironment(){
    try {
      var productionHost="kingshot-data-platform.black-jack-kingshot.workers.dev";
      var isPreviewHost=window.location.hostname!==productionHost;
      document.documentElement.setAttribute("data-eagleeye-env",isPreviewHost?"preview":"production");
      if(isPreviewHost){
        document.documentElement.setAttribute("data-eagle-preview","1");
        function mountPreviewBanner(){
          try {
            if(document.body&&!document.querySelector(".eagle-preview-banner")){
              var banner=document.createElement("div");
              banner.className="eagle-preview-banner";
              banner.textContent="🧪 PREVIEW — 開発版 / 本番ユーザーには表示されません";
              document.body.appendChild(banner);
            }
          } catch(e) {}
        }
        if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",mountPreviewBanner,{once:true});
        else mountPreviewBanner();
      }
    } catch(e) {}
  }

  function installMutatingRequestGuard(){
    try {
      if(window.__eagleEyeMutatingRequestGuardInstalled) return;
      window.__eagleEyeMutatingRequestGuardInstalled=true;
      var pending=new Set();
      var originalFetch=window.fetch.bind(window);
      window.fetch=function(input,init){
        try {
          var method=String((init&&init.method)||((input&&input.method)||"GET")).toUpperCase();
          if(["POST","PUT","PATCH","DELETE"].indexOf(method)<0) return originalFetch(input,init);
          var url=typeof input==="string"?input:(input&&input.url)||"";
          var body=init&&init.body!=null?String(init.body):"";
          var key=method+" "+url+" "+body;
          if(pending.has(key)){
            var duplicateError=new Error("同じ操作が現在実行中です。処理完了を待ってください。");
            duplicateError.code="CLIENT_REQUEST_IN_PROGRESS";
            return Promise.reject(duplicateError);
          }
          pending.add(key);
          var actionButton=window.__eagleEyeCurrentActionButton;
          if(actionButton && actionButton.dataset.eagleBusy==="1"){
            actionButton.dataset.eagleFetchBound="1";
          }
          return originalFetch(input,init).finally(function(){
            pending.delete(key);
            if(actionButton && window.__eagleEyeReleaseActionButton){
              window.__eagleEyeReleaseActionButton(actionButton);
            }
          });
        } catch(e) {
          return originalFetch(input,init);
        }
      };
    } catch(e) {}
  }

  function installGlobalActionGuard(){
    try {
      if(window.__eagleEyeGlobalActionGuardInstalled) return;
      window.__eagleEyeGlobalActionGuardInstalled=true;

      function release(button){
        try {
          if(!button) return;
          button.dataset.eagleBusy="";
          button.dataset.eagleFetchBound="";
          button.removeAttribute("aria-disabled");
          if(button.dataset.eagleOriginalAriaLabel){button.setAttribute("aria-label",button.dataset.eagleOriginalAriaLabel);button.dataset.eagleOriginalAriaLabel="";}else if(button.getAttribute("aria-label")&&button.getAttribute("aria-label").endsWith("、処理中"))button.removeAttribute("aria-label");
          button.classList.remove("eagle-action-busy");
          if(button.dataset.eagleAutoDisabled==="1"){
            button.disabled=false;
            button.dataset.eagleAutoDisabled="";
          }
        } catch(e) {}
      }

      function lock(button){
        if(!button || button.disabled || button.dataset.eagleNoGuard==="1") return false;
        if(button.dataset.eagleBusy==="1") return true;
        button.dataset.eagleBusy="1";
        button.setAttribute("aria-disabled","true");
        button.classList.add("eagle-action-busy");
        if(!button.dataset.eagleOriginalAriaLabel && button.hasAttribute("aria-label"))button.dataset.eagleOriginalAriaLabel=button.getAttribute("aria-label");
        if(!button.hasAttribute("aria-label"))button.setAttribute("aria-label",(button.textContent||"ボタン").trim()+"、処理中");
        button.disabled=true;
        button.dataset.eagleAutoDisabled="1";
        return false;
      }

      document.addEventListener("click",function(event){
        try {
          var button=event.target&&event.target.closest?event.target.closest("button"):null;
          if(!button) return;
          if(button.classList.contains("eagle-theme-toggle") || button.id==="themeToggle") return;
          if(button.dataset.eagleBusy==="1"){
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
          }
          if(lock(button)) return;
          window.__eagleEyeCurrentActionButton=button;
          setTimeout(function(){
            if(window.__eagleEyeCurrentActionButton===button) window.__eagleEyeCurrentActionButton=null;
          },0);
          setTimeout(function(){
            if(button.dataset.eagleBusy==="1" && !button.dataset.eagleFetchBound) release(button);
          },1500);
        } catch(e) {}
      },true);

      document.addEventListener("submit",function(event){
        try {
          var form=event.target;
          if(!form) return;
          if(form.dataset.eagleSubmitting==="1"){
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
          }
          form.dataset.eagleSubmitting="1";
          var submitter=event.submitter || form.querySelector("button[type='submit'],input[type='submit']");
          if(submitter){
            if(submitter.dataset.eagleBusy==="1"){
              event.preventDefault();
              event.stopImmediatePropagation();
              return;
            }
            lock(submitter);
          }
          form.querySelectorAll("button[type='submit'],input[type='submit']").forEach(function(b){
            b.disabled=true;
            b.dataset.eagleFormDisabled="1";
          });
        } catch(e) {}
      },true);

      window.__eagleEyeReleaseActionButton=release;
    } catch(e) {}
  }

  function installRoleBar(){
    try {
      if(!document.body) return null;
      var roleBar=document.querySelector(".eagle-role-bar");
      if(!roleBar){
        roleBar=document.createElement("div");
        roleBar.className="eagle-role-bar";
        roleBar.setAttribute("aria-label","EagleEye ロール");
        roleBar.innerHTML="<span class=\"eagle-role-bar-label\">ROLE</span><span class=\"eagle-role-item\" data-role=\"BASIC\">BASIC</span><span class=\"eagle-role-item\" data-role=\"ADVANCED\">ADVANCED</span><span class=\"eagle-role-item vip\" data-role=\"VIP\">⚡ VIP</span><span class=\"eagle-role-item admin\" data-role=\"ADMIN\">ADMIN</span><span class=\"eagle-role-item owner\" data-role=\"OWNER\">OWNER</span>";
        document.body.insertBefore(roleBar,document.body.firstChild);
      }
      if(!document.querySelector(".eagle-role-bar-spacer")){
        var spacer=document.createElement("div");
        spacer.className="eagle-role-bar-spacer";
        document.body.insertBefore(spacer,document.body.children[1]||null);
      }
      return roleBar;
    } catch(e) {
      return null;
    }
  }

  function paintRole(role){
    try {
      var roleBar=document.querySelector(".eagle-role-bar");
      if(!roleBar) return;
      role=String(role||"").toUpperCase();
      roleBar.querySelectorAll("[data-role]").forEach(function(item){
        item.classList.toggle("current",item.getAttribute("data-role")===role);
      });
    } catch(e) {}
  }

  function loadRole(){
    try {
      // Share the request started by the generic drawer, when present, so the
      // shell does not issue duplicate role/eligibility API reads on page load.
      var roleStatePromise=window.__eagleEyeRoleStatePromise;
      if(!roleStatePromise){
        roleStatePromise=fetch("/api/me/advanced",{credentials:"same-origin",cache:"no-store"})
          .then(function(r){return r.ok?r.json():null;})
          .catch(function(){return null;});
        window.__eagleEyeRoleStatePromise=roleStatePromise;
      }
      roleStatePromise.then(function(d){if(d&&d.ok)paintRole(d.role);});
    } catch(e) {}
  }

  function installThemeToggle(){
    try {
      if(!document.body) return;
      var existing=document.querySelector(".theme-toggle");
      var btn=document.querySelector(".eagle-theme-toggle");
      if(!btn){
        btn=document.createElement("button");
        btn.className="eagle-theme-toggle";
        btn.type="button";
        btn.setAttribute("aria-label","テーマ切替");
        btn.setAttribute("title","ライト / ダーク切替");
        document.body.appendChild(btn);
      }
      function paint(){
        try {
          var isLight=document.documentElement.getAttribute("data-eagle-theme")==="light";
          btn.textContent=isLight?"☀️":"🌙";
          btn.setAttribute("aria-label",isLight?"ダークモードに切替":"ライトモードに切替");
          if(existing) existing.style.display="none";
        } catch(e) {}
      }
      btn.onclick=function(){
        try {
          var next=document.documentElement.getAttribute("data-eagle-theme")==="light"?"dark":"light";
          document.documentElement.setAttribute("data-eagle-theme",next);
          try { window.localStorage.setItem("eagleeye-theme",next); } catch(e) {}
          paint();
        } catch(e) {}
      };
      paint();
    } catch(e) {}
  }

  function setup(){
    // Each component is isolated so one Safari/WebKit restriction cannot
    // suppress the remaining global UI.
    applySavedTheme();
    markEnvironment();
    installMutatingRequestGuard();
    installGlobalActionGuard();
    installRoleBar();
    installThemeToggle();
    loadRole();
  }

  try {
    if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",setup,{once:true});
    else setup();
  } catch(e) {
    try { setup(); } catch(_) {}
  }
})();
</script>`;

function applyEagleEyeTheme(html) {
  if (typeof html !== "string" || !html.includes("<html")) return html;
  if (!html.includes('id="eagleeye-theme"')) html=html.replace("</head>",EAGLEEYE_THEME_CSS+"</head>");
  // Apply the shared navigation size contract after page-specific styles so
  // responsive page CSS cannot unexpectedly shrink navigation labels/icons.
  if (!html.includes('id="eagleeye-nav-size-contract"')) {
    html=html.replace("</head>", '<style id="eagleeye-nav-size-contract">'+EAGLEEYE_NAV_CSS+'</style></head>');
  }
  // Install the shared navigation in the HTML response itself. This avoids
  // relying on client-side script execution to create a critical navigation.
  // The home page already owns its richer navigation; leave it untouched.
  // Protected/login-required pages must not show the global navigation.
  // Keep the explicit login prompt as a clean standalone screen.
  const isLoginRequiredPage = html.includes("ログインが必要です") || html.includes("Discordでログイン");
  if (!isLoginRequiredPage && !html.includes('class="ee-nav') && !html.includes('class="ee-global-nav')) {
    const sharedNav = `
${renderEagleEyeNavigation({ badgeId: "globalNavBadge" })}
<div class="ee-global-nav-drawer" aria-hidden="true">
  <section class="ee-global-nav-panel" role="dialog" aria-modal="true" aria-label="その他の機能">
    <div class="ee-global-nav-panel-head"><strong>その他の機能</strong><button type="button" data-close>閉じる ×</button></div>
    <div class="ee-global-nav-links">
      ${renderEagleEyeOtherMenu({ auth: null, includeAccount: false, compact: false })}
    </div>
  </section>
</div>
`;
    html=html.replace("</body>",sharedNav+"</body>");
  }
  if (!html.includes('id="eagleeye-shared-drawer-init"')) html=html.replace("</body>", '<script id="eagleeye-shared-drawer-init">'+EAGLEEYE_DRAWER_INIT+'</script></body>');
  if (!html.includes('id="eagleeye-theme-script"')) html=html.replace("</body>",EAGLEEYE_THEME_SCRIPT+"</body>");
  // Global request progress UI: shared by every HTML page without changing API payloads.
  if (!html.includes('id="eagleeye-global-progress-css"')) html=html.replace("</head>", '<style id="eagleeye-global-progress-css">#ee-global-progress{position:fixed;z-index:2147483000;top:calc(env(safe-area-inset-top,0px) + 7px);left:50%;transform:translate(-50%,-150%);width:min(92vw,520px);box-sizing:border-box;padding:10px 13px 9px;border:1px solid var(--ee-border,#2a4664);border-radius:13px;background:rgba(15,32,53,.97);color:var(--ee-text,#e8f3ff);box-shadow:0 8px 28px #0006;backdrop-filter:blur(12px);font:600 12px/1.4 system-ui,-apple-system,sans-serif;opacity:0;transition:transform .2s ease,opacity .2s ease;pointer-events:none}#ee-global-progress.visible{transform:translate(-50%,0);opacity:1}#ee-global-progress .ee-gp-row{display:flex;align-items:center;gap:9px}#ee-global-progress .ee-gp-spinner{width:14px;height:14px;flex:0 0 14px;border:2px solid #35516d;border-top-color:var(--ee-cyan,#22d3ee);border-radius:50%;animation:ee-gp-spin .8s linear infinite}#ee-global-progress .ee-gp-copy{min-width:0;flex:1}#ee-global-progress .ee-gp-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#ee-global-progress .ee-gp-time{font-variant-numeric:tabular-nums;color:var(--ee-subtext,#91a7bf);font-weight:500}#ee-global-progress .ee-gp-track{height:3px;margin-top:8px;overflow:hidden;border-radius:99px;background:#263b52}#ee-global-progress .ee-gp-bar{height:100%;width:35%;border-radius:99px;background:var(--ee-cyan,#22d3ee);animation:ee-gp-move 1.15s ease-in-out infinite alternate}@keyframes ee-gp-spin{to{transform:rotate(360deg)}}@keyframes ee-gp-move{from{transform:translateX(-15%)}to{transform:translateX(205%)}}@media(prefers-reduced-motion:reduce){#ee-global-progress *,#ee-global-progress:before{animation:none!important;transition:none!important}}</style></head>');
  if (!html.includes('id="eagleeye-global-progress-init"')) html=html.replace("</body>", '<div id="ee-global-progress" role="status" aria-live="polite" aria-atomic="true"><div class="ee-gp-row"><span class="ee-gp-spinner" aria-hidden="true"></span><span class="ee-gp-copy"><span class="ee-gp-label">通信中…</span></span><span class="ee-gp-time">0秒</span></div><div class="ee-gp-track" aria-hidden="true"><div class="ee-gp-bar"></div></div></div><script id="eagleeye-global-progress-init">(function(){if(window.__eeGlobalProgressInstalled)return;window.__eeGlobalProgressInstalled=true;var el=document.getElementById("ee-global-progress");if(!el)return;var label=el.querySelector(".ee-gp-label"),time=el.querySelector(".ee-gp-time"),active=new Map(),seq=0,shownAt=0,showTimer=0,tickTimer=0,tickerStartedAt=0;function describe(input,init){try{var method=String(init&&init.method||input&&input.method||"GET").toUpperCase(),u=new URL(typeof input==="string"?input:input&&input.url||String(input),location.href),p=u.pathname;if(p==="/api/player"&&u.searchParams.get("rich")==="1")return "プレイヤーの詳細情報を取得中…";if(p==="/api/player"&&u.searchParams.get("refresh")==="1")return "プレイヤーの詳細情報を取得中…";if(p==="/api/player/refresh")return "プレイヤーの詳細情報を取得中…";if(p==="/api/me/vip/mighty-check")return "Mighty対応を確認中…";if(p==="/api/me/vip")return "VIP情報を取得中…";if(p==="/api/me/player"&&method==="POST")return "KingShot IDを登録中…";if(p==="/api/me/player"&&method==="DELETE")return "KingShot IDの登録を解除中…";if(p==="/api/me/player")return "マイKingshotのプレイヤー情報を取得中…";if(p==="/api/me/mightpulse-key"&&method==="POST")return "MightPulse APIキーを登録中…";if(p==="/api/me/advanced"||p==="/api/me/mightpulse-key")return "権限・APIキー情報を取得中…";if(p==="/api/owner/kingdom-load-test"&&method==="POST")return "王国負荷テストを実行中…";if(p==="/api/owner/kingdom-load-test/cancel")return "王国負荷テストを停止中…";if(p==="/api/owner/kingdom-load-test/status")return "王国負荷テストの進捗を確認中…";if(p==="/api/owner/kingdom-load-test/history")return "負荷テスト履歴を取得中…";if(p==="/api/owner/kingdom-load-test/system-json")return "負荷テストのシステムログを取得中…";if(p==="/api/owner/kingdom-load-test/export")return "負荷テスト結果をエクスポート中…";if(p==="/api/admin/kingdom-catalog-r2-backfill")return "王国カタログのR2移行を実行中…";if(p==="/api/admin/mightpulse-research")return "MightPulse API調査を実行中…";if(p==="/api/admin/mightpulse-probe")return "MightPulse接続を確認中…";if(p==="/api/admin/api-pool/health-check")return "API Poolの接続確認中…";if(p==="/api/admin/api-pool/mighty-check")return "API PoolのMighty判定中…";if(p==="/api/admin/api-pool/test-player")return "API Poolでプレイヤー取得をテスト中…";if(p==="/api/admin/api-pool/test-ranking")return "API Poolでランキング取得をテスト中…";if(p==="/api/admin/data-retention")return "データ保持処理を実行中…";if(p==="/api/admin/kingdom-ranking-export")return "王国ランキングをエクスポート中…";if(p==="/api/admin/player-export")return "プレイヤーデータをエクスポート中…";if(p==="/api/admin/system-log/export")return "System Logをエクスポート中…";if(p==="/api/kingdom-watchlist/data")return "王国ウォッチリストのデータを取得中…";if(p==="/api/kingdom-watchlist"&&method==="POST"&&u.searchParams.get("action")==="refresh")return "王国ウォッチリストを更新中…";if(p==="/api/kingdom-watchlist"&&method==="POST"&&u.searchParams.get("action")==="create")return "王国ウォッチリストを登録中…";if(p==="/api/kingdom-watchlist"&&method==="DELETE")return "王国ウォッチリストを削除中…";if(p==="/api/kingdom-watchlist"&&method==="POST")return "王国ウォッチリストを保存中…";if(p==="/api/player-watchlist"&&method==="DELETE")return "プレイヤーウォッチリストを削除中…";if(p==="/api/player-watchlist"&&method==="POST")return "プレイヤーウォッチリストを保存中…";if(p==="/api/player/history")return "プレイヤー履歴を取得中…";if(p==="/api/player/rank-history")return "ランキング履歴を取得中…";if(p==="/api/player/changes")return "プレイヤーの変更履歴を取得中…";if(p==="/api/player-compare")return "プレイヤー比較データを取得中…";if(p==="/api/kingdom-portal/ranking")return "王国ランキングを取得中…";if(p==="/api/kingdom-portal/status")return "王国状況を取得中…";if(p==="/api/kingdom-rankings/preferences"&&method!=="GET")return "ランキング表示設定を保存中…";if(p==="/api/admin/diagnostics")return "システム診断を取得中…";if(p==="/api/admin/system-log")return "System Logを取得中…";if(p==="/api/admin/api-raw-data")return "API生データを取得中…";if(p==="/api/admin/api-raw-history")return "API生データ履歴を取得中…";if(p==="/api/admin/r2-archive-objects")return "R2アーカイブ一覧を取得中…";if(p==="/api/admin/google-drive/verify")return "Google Drive接続を確認中…";if(p==="/api/admin/api-pool/add"&&method==="POST")return "API Poolへキーを登録中…";if(p==="/api/admin/api-pool/delete")return "API Poolのキーを削除中…";if(p==="/api/admin/api-pool/revoke")return "API Poolのキーを無効化中…";if(p==="/api/admin/api-pool/move")return "API Poolキーを移動中…";if(p==="/api/owner/users/role")return "ユーザー権限を更新中…";if(p==="/api/owner/users/status")return "ユーザー状態を更新中…";if(p==="/api/owner/api-pool/reassign")return "API Poolキーの担当を変更中…";if(p.indexOf("/api/")===0){var n=p.split("/").filter(Boolean).pop()||"データ";var names={"player-compare":"比較データ","player-watchlist":"プレイヤーウォッチリスト","kingdom-watchlist":"王国ウォッチリスト","player-search":"プレイヤー検索","player":"プレイヤーデータ","players":"プレイヤーデータ","kingdom":"王国データ","rankings":"ランキング","me":"ユーザー情報","advanced":"権限情報","status":"システム状況"};return (names[n]||"データ")+"を取得中…"}return "ページのデータを取得中…"}catch(e){return "データを取得中…"}}function paint(){var count=active.size;label.textContent=count>1?(active.values().next().value.label+" ("+count+"件)"):(active.size?active.values().next().value.label:"通信中…");var elapsedBase=tickerStartedAt||shownAt;time.textContent=Math.max(0,Math.floor((Date.now()-elapsedBase)/1000))+"秒";}function startTicker(){clearInterval(tickTimer);tickerStartedAt=Date.now();paint();tickTimer=setInterval(function(){if(!active.size){clearInterval(tickTimer);tickTimer=0;tickerStartedAt=0;return}paint()},250);}function begin(id,info){active.set(id,info);if(active.size===1){shownAt=Date.now();clearTimeout(showTimer);showTimer=setTimeout(function(){if(active.size){el.classList.add("visible");startTicker()}},350)}else if(el.classList.contains("visible"))paint()}function finish(id){active.delete(id);if(!active.size){clearTimeout(showTimer);clearInterval(tickTimer);tickTimer=0;tickerStartedAt=0;el.classList.remove("visible")}else paint()}var navId=0,navWatchdog=0;function showNavigation(text){if(navId)finish(navId);if(navWatchdog)clearTimeout(navWatchdog);navId=++seq;shownAt=Date.now();active.set(navId,{label:text});clearTimeout(showTimer);el.classList.add("visible");startTicker();navWatchdog=setTimeout(function(){clearNavigation();var notice=document.getElementById("ee-progress-timeout");if(!notice){notice=document.createElement("div");notice.id="ee-progress-timeout";notice.setAttribute("role","status");notice.style.cssText="position:fixed;z-index:10001;left:12px;right:12px;bottom:calc(86px + env(safe-area-inset-bottom));padding:12px 14px;border:1px solid #b45309;border-radius:12px;background:#1f2937;color:#fef3c7;font:600 13px/1.5 system-ui;box-shadow:0 8px 28px #0008";document.body.appendChild(notice)}notice.textContent="ページの読み込みに時間がかかっています。通信またはサーバー応答を確認してください。";notice.style.display="block";setTimeout(function(){if(notice&&notice.parentNode)notice.parentNode.removeChild(notice)},10000)},20000)}function clearNavigation(){if(navWatchdog){clearTimeout(navWatchdog);navWatchdog=0}if(navId){var id=navId;navId=0;finish(id)}}document.addEventListener("click",function(event){if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;var link=event.target&&event.target.closest?event.target.closest("a[href]"):null;if(!link||link.hasAttribute("download")||link.target&&link.target!=="_self")return;var href=link.getAttribute("href")||"";if(!href||href.charAt(0)==="#"||/^javascript:/i.test(href)||/^mailto:/i.test(href)||/^tel:/i.test(href))return;try{var target=new URL(href,location.href);if(target.origin!==location.origin)return;if(target.href===location.href)return;var progressLabel="ページを読み込んでいます…";if(target.pathname==="/player/compare")progressLabel="プレイヤー比較データを読み込んでいます…";else if(target.pathname==="/player"&&target.searchParams.get("refresh")==="1")progressLabel="プレイヤーの詳細情報を取得しています…";else if(target.pathname==="/player"&&target.searchParams.get("rich")==="1")progressLabel="プレイヤーの詳細情報を取得しています…";else if(target.pathname==="/players"&&target.searchParams.has("q"))progressLabel="プレイヤーを検索しています…";else if(target.pathname==="/players")progressLabel="プレイヤー検索を開いています…";else if(target.pathname==="/my-player")progressLabel="マイKingshotを読み込んでいます…";else if(target.pathname==="/player"&&target.searchParams.has("governor_id"))progressLabel="プレイヤー詳細を読み込んでいます…";else if(target.pathname==="/status")progressLabel="システム状況を確認しています…";else if(target.pathname==="/admin/diagnostics")progressLabel="システム診断を読み込んでいます…";else if(target.pathname==="/admin/mightpulse-probe")progressLabel="MightPulse Probeを開いています…";else if(target.pathname==="/owner/kingdom-catalog-r2-backfill")progressLabel="王国カタログR2移行の状況を読み込んでいます…";else if(target.pathname==="/kingdom-catalog")progressLabel="王国カタログを読み込んでいます…";else if(target.pathname==="/kingdom/rankings")progressLabel="王国ランキングを読み込んでいます…";else if(target.pathname==="/kingdom/alliances")progressLabel="王国の同盟一覧を読み込んでいます…";else if(target.pathname==="/alliance")progressLabel="同盟情報を読み込んでいます…";else if(target.pathname==="/player/history")progressLabel="プレイヤー履歴を読み込んでいます…";else if(target.pathname==="/player/changes")progressLabel="プレイヤーの変更履歴を読み込んでいます…";showNavigation(progressLabel);setTimeout(function(){if(event.defaultPrevented)clearNavigation()},0)}catch(e){}},false);document.addEventListener("submit",function(event){var form=event.target;if(!form||form.tagName!=="FORM"||form.target&&form.target!=="_self")return;var method=String(form.method||"get").toUpperCase();var progressLabel=method==="GET"?"ページを更新しています…":"処理を送信しています…";try{var actionUrl=new URL(form.action||form.getAttribute("action")||location.href,location.href);if(actionUrl.pathname==="/owner/kingdom-catalog-r2-backfill"&&method!=="GET")progressLabel="王国カタログのR2移行を実行中…";else if(actionUrl.pathname==="/players"&&method==="GET")progressLabel="プレイヤー検索を実行中…";else if(actionUrl.pathname==="/player"&&actionUrl.searchParams.has("governor_id"))progressLabel="プレイヤー情報を取得しています…";else if(actionUrl.pathname.indexOf("/api/")===0)progressLabel=describe(actionUrl,{method:method});}catch(e){}showNavigation(progressLabel);setTimeout(function(){if(event.defaultPrevented)clearNavigation()},0)},false);window.addEventListener("pageshow",clearNavigation);if(typeof window.fetch==="function"){var original=window.fetch.bind(window);window.fetch=function(input,init){var id=++seq,info={label:describe(input,init)};begin(id,info);var result;try{result=original(input,init)}catch(e){finish(id);throw e}return Promise.resolve(result).then(function(response){setTimeout(function(){finish(id)},0);trackResponseBody(response,info.label);return response},function(error){finish(id);throw error})};function trackResponseBody(response,parentLabel){if(!response||response.__eeProgressBodyTracking)return response;try{response.__eeProgressBodyTracking=true;["arrayBuffer","blob","formData","json","text"].forEach(function(method){var originalMethod=response[method];if(typeof originalMethod!=="function")return;try{response[method]=function(){var bodyId=++seq;begin(bodyId,{label:parentLabel?parentLabel.replace(/…$/,"")+"（応答処理中）":"応答データを処理中…"});var bodyResult;try{bodyResult=originalMethod.apply(this,arguments)}catch(error){finish(bodyId);throw error}return Promise.resolve(bodyResult).then(function(value){finish(bodyId);return value},function(error){finish(bodyId);throw error})}}catch(e){}});var body=response.body;if(body&&typeof body.getReader==="function"&&!body.__eeProgressStreamTracking){var originalGetReader=body.getReader;try{body.getReader=function(){var reader=originalGetReader.apply(this,arguments);if(!reader||reader.__eeProgressReaderTracking)return reader;try{reader.__eeProgressReaderTracking=true;var originalRead=reader.read,originalCancel=reader.cancel,originalReleaseLock=reader.releaseLock,streamId=0;reader.read=function(){if(!streamId){streamId=++seq;begin(streamId,{label:parentLabel||"ストリームデータを処理中…"})}var result;try{result=originalRead.apply(this,arguments)}catch(error){if(streamId){finish(streamId);streamId=0}throw error}return Promise.resolve(result).then(function(value){if(value&&value.done&&streamId){finish(streamId);streamId=0}return value},function(error){if(streamId){finish(streamId);streamId=0}throw error})};reader.cancel=function(){var result;try{result=originalCancel.apply(this,arguments)}catch(error){if(streamId){finish(streamId);streamId=0}throw error}return Promise.resolve(result).then(function(value){if(streamId){finish(streamId);streamId=0}return value},function(error){if(streamId){finish(streamId);streamId=0}throw error})};if(typeof originalReleaseLock==="function")reader.releaseLock=function(){var result=originalReleaseLock.apply(this,arguments);if(streamId){finish(streamId);streamId=0}return result}}catch(e){}return reader};body.__eeProgressStreamTracking=true}catch(e){}}if(body&&typeof Symbol!=="undefined"&&Symbol.asyncIterator&&typeof body[Symbol.asyncIterator]==="function"&&!body.__eeProgressAsyncIteratorTracking){try{var originalAsyncIterator=body[Symbol.asyncIterator];body[Symbol.asyncIterator]=function(){var iterator=originalAsyncIterator.apply(this,arguments);if(!iterator||iterator.__eeProgressIteratorTracking)return iterator;try{iterator.__eeProgressIteratorTracking=true;var streamId=0,originalNext=iterator.next,originalReturn=iterator.return;iterator.next=function(){if(!streamId){streamId=++seq;begin(streamId,{label:parentLabel||"ストリームデータを処理中…"})}var result;try{result=originalNext.apply(this,arguments)}catch(error){if(streamId){finish(streamId);streamId=0}throw error}return Promise.resolve(result).then(function(value){if(value&&value.done&&streamId){finish(streamId);streamId=0}return value},function(error){if(streamId){finish(streamId);streamId=0}throw error})};if(typeof originalReturn==="function")iterator.return=function(){var result;try{result=originalReturn.apply(this,arguments)}catch(error){if(streamId){finish(streamId);streamId=0}throw error}return Promise.resolve(result).then(function(value){if(streamId){finish(streamId);streamId=0}return value},function(error){if(streamId){finish(streamId);streamId=0}throw error})}}catch(e){}return iterator};body.__eeProgressAsyncIteratorTracking=true}catch(e){}}var originalClone=response.clone;if(typeof originalClone==="function"){response.clone=function(){var cloned=originalClone.apply(this,arguments);trackResponseBody(cloned,parentLabel);return cloned}}}catch(e){}return response}}if(typeof XMLHttpRequest!=="undefined"){var open=XMLHttpRequest.prototype.open,send=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.open=function(method,url){this.__eeProgressUrl=url;this.__eeProgressMethod=method;return open.apply(this,arguments)};XMLHttpRequest.prototype.send=function(){var xhr=this,id=++seq;begin(id,{label:describe(xhr.__eeProgressUrl,{method:xhr.__eeProgressMethod})});var done=false;function finishOnce(){if(done)return;done=true;finish(id)}xhr.addEventListener("loadend",finishOnce,{once:true});try{return send.apply(this,arguments)}catch(e){finishOnce();throw e}}}})();</script></body>');
  return html;
}

function eagleEyeHtmlResponse(html, status = 200) {
  const themed = applyEagleEyeTheme(html);
  const telemetry = clientTelemetryScript();
  const instrumented = themed.includes("</body>")
    ? themed.replace("</body>", telemetry + "</body>")
    : themed + telemetry;
  return new Response(instrumented, { status, headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" } });
}

function getConfig(env) {
  return {
    clientId: env.DISCORD_CLIENT_ID,
    clientSecret: env.DISCORD_CLIENT_SECRET,
    sessionSecret: env.EAGLEEYE_SESSION_SECRET,
    redirectUri: env.DISCORD_REDIRECT_URI || DEFAULT_DISCORD_REDIRECT_URI
  };
}

async function startDiscordLogin(request, env) {
  const config = getConfig(env);
  if (!config.clientId || !config.sessionSecret) {
    return json({ ok: false, error: "DISCORD_AUTH_NOT_CONFIGURED" }, 503);
  }

  const redirectUri = config.redirectUri;
  const state = await createStateToken(config.sessionSecret);
  const authorize = new URL(DISCORD_AUTHORIZE_URL);
  authorize.searchParams.set("client_id", config.clientId);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("scope", "identify guilds.join");
  authorize.searchParams.set("state", state);

  return new Response(null, {
    status: 302,
    headers: {
      "Location": authorize.toString(),
      "Cache-Control": "no-store"
    }
  });
}

async function joinDiscordSupportGuild(env, discordUserId, userAccessToken) {
  const guildId = String(env.DISCORD_SUPPORT_GUILD_ID || "").trim();
  const botToken = String(env.DISCORD_BOT_TOKEN || "").trim();
  if (!guildId) throw new Error("DISCORD_SUPPORT_GUILD_ID_NOT_CONFIGURED");
  if (!botToken) throw new Error("DISCORD_BOT_TOKEN_NOT_CONFIGURED");
  if (!discordUserId) throw new Error("DISCORD_USER_ID_REQUIRED");
  if (!userAccessToken) throw new Error("DISCORD_USER_ACCESS_TOKEN_REQUIRED");

  const response = await fetch(
    `https://discord.com/api/v10/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(discordUserId)}`,
    {
      method: "PUT",
      headers: {
        "Authorization": `Bot ${botToken}`,
        "Content-Type": "application/json",
        "User-Agent": "EagleEye/1.0 (support)"
      },
      body: JSON.stringify({
        access_token: userAccessToken
      })
    }
  );

  if (!response.ok) {
    const body = await response.text();
    let data = null;
    try { data = body ? JSON.parse(body) : null; } catch {}
    const error = new Error(data?.message || `Discord guild join failed (HTTP ${response.status})`);
    error.status = response.status;
    error.discord = data;
    throw error;
  }

  return response.status === 201 ? "ADDED" : "ALREADY_MEMBER";
}

async function handleDiscordCallback(request, env) {
  const config = getConfig(env);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!config.clientId || !config.clientSecret || !config.sessionSecret) {
    return json({ ok: false, error: "DISCORD_AUTH_NOT_CONFIGURED" }, 503);
  }
  if (!code || !state) {
    return json({ ok: false, error: "INVALID_OAUTH_STATE", reason: "missing_callback_state" }, 400);
  }
  if (!(await verifyStateToken(state, config.sessionSecret))) {
    return json({ ok: false, error: "INVALID_OAUTH_STATE", reason: "invalid_state_signature" }, 400);
  }

  const redirectUri = config.redirectUri;
  const tokenResponse = await fetch(DISCORD_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    })
  });

  if (!tokenResponse.ok) {
    if (env.DB) await recordDiagnostic(env.DB, {
      service: "discord", feature: "oauth", operation: "TOKEN_EXCHANGE", status: "FAILED",
      errorCode: "DISCORD_TOKEN_EXCHANGE_FAILED", message: `Discord token exchange failed (HTTP ${tokenResponse.status})`,
      metadata: { httpStatus: tokenResponse.status }
    });
    console.error("Discord token exchange failed:", tokenResponse.status);
    return json({ ok: false, error: "DISCORD_TOKEN_EXCHANGE_FAILED" }, 502);
  }

  const token = await tokenResponse.json();
  const userResponse = await fetch(DISCORD_ME_URL, {
    headers: { Authorization: "Bearer " + token.access_token }
  });

  if (!userResponse.ok) {
    if (env.DB) await recordDiagnostic(env.DB, {
      service: "discord", feature: "oauth", operation: "USER_LOOKUP", status: "FAILED",
      errorCode: "DISCORD_USER_LOOKUP_FAILED", message: `Discord user lookup failed (HTTP ${userResponse.status})`,
      metadata: { httpStatus: userResponse.status }
    });
    console.error("Discord user lookup failed:", userResponse.status);
    return json({ ok: false, error: "DISCORD_USER_LOOKUP_FAILED" }, 502);
  }

  const discordUser = await userResponse.json();

  // Support users are automatically added to the private EagleEye Support
  // server after Discord OAuth approval. The OAuth access token is used only
  // for this one-time guild join request and is never stored in the session.
  try {
    const joinResult = await joinDiscordSupportGuild(env, String(discordUser.id), token.access_token);
    if (env.DB) await recordDiagnostic(env.DB, {
      service: "discord", feature: "support_guild_membership", operation: "GUILD_JOIN", status: "SUCCESS",
      message: joinResult === "ADDED" ? "Discord Support Guildへの自動参加成功" : "Discord Support Guildへの参加状態を確認しました。",
      metadata: { result: joinResult }
    });
  } catch (error) {
    // Support guild auto-join is an auxiliary feature and must never block
    // the primary Discord login/session issuance.
    if (env.DB) await recordDiagnostic(env.DB, {
      service: "discord", feature: "support_guild_membership", operation: "GUILD_JOIN", status: "FAILED",
      errorCode: String(error?.message || "DISCORD_SUPPORT_GUILD_JOIN_FAILED").split(":")[0],
      message: String(error?.message || error).slice(0, 2000),
      metadata: { httpStatus: Number(error?.status || 0) || null, discordCode: error?.discord?.code || null }
    });
    console.error("discord_support_guild_join_failed", {
      discord_id: String(discordUser.id),
      status: error?.status || 0,
      discord_code: error?.discord?.code || null,
      message: error?.message || String(error)
    });
  }

  const now = Math.floor(Date.now() / 1000);
  const sessionPayload = {
    sub: String(discordUser.id),
    username: discordUser.username || null,
    global_name: discordUser.global_name || null,
    avatar: discordUser.avatar || null,
    iat: now,
    exp: now + SESSION_MAX_AGE
  };
  if (env.DB) {
    try {
      const userResult = await upsertUser(env.DB, discordUser, now);
      if (userResult?.status === "DISABLED") {
        return json({ ok: false, error: "USER_DISABLED" }, 403);
      }
    } catch (error) {
      // Keep Discord authentication usable during a temporary D1 outage.
      // The signed session is safe to issue, while DB-backed roles remain unavailable.
      await recordDiagnostic(env.DB, {
        service: "discord", feature: "oauth", operation: "USER_PERSIST", status: "FAILED",
        errorCode: String(error?.message || "DISCORD_USER_PERSIST_FAILED").split(":")[0],
        message: String(error?.message || error).slice(0, 2000)
      });
      console.error("discord_user_persist_failed", error?.message || error);
    }
  }

  const session = await signPayload(sessionPayload, config.sessionSecret);

  const responseHeaders = new Headers({
    Location: new URL("/", request.url).toString(),
    "Cache-Control": "no-store"
  });
  responseHeaders.append("Set-Cookie", serializeCookie(SESSION_COOKIE, session, {
    maxAge: SESSION_MAX_AGE, httpOnly: true, secure: true, sameSite: "Lax", path: "/"
  }));
  return new Response(null, {
    status: 302,
    headers: responseHeaders
  });
}
async function upsertUser(db, discordUser, now) {
  const discordId = String(discordUser.id);
  const existing = await db.prepare(
    `SELECT user_id, status FROM users WHERE discord_id = ? LIMIT 1`
  ).bind(discordId).first();

  if (existing?.status === "DISABLED") {
    return { status: "DISABLED" };
  }

  const userId = existing?.user_id || crypto.randomUUID();
  await db.prepare(
    `INSERT INTO users (
      user_id, discord_id, username, global_name, avatar, role, status,
      created_at, updated_at, last_login_at
    ) VALUES (?, ?, ?, ?, ?, 'BASIC', 'ACTIVE', ?, ?, ?)
    ON CONFLICT(discord_id) DO UPDATE SET
      username = excluded.username,
      global_name = excluded.global_name,
      avatar = excluded.avatar,
      updated_at = excluded.updated_at,
      last_login_at = excluded.last_login_at`
  ).bind(
    userId,
    discordId,
    discordUser.username || null,
    discordUser.global_name || null,
    discordUser.avatar || null,
    now,
    now,
    now
  ).run();

  await db.prepare(
    `INSERT INTO login_history (login_id, user_id, discord_id, username, global_name, logged_in_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), userId, discordId, discordUser.username || null, discordUser.global_name || null, now).run();

  return { status: "ACTIVE", user_id: userId };
}

function logout(request) {
  const headers = new Headers({
    Location: new URL("/", request.url).toString(),
    "Cache-Control": "no-store"
  });
  headers.append("Set-Cookie", serializeCookie(SESSION_COOKIE, "", {
    maxAge: 0, httpOnly: true, secure: true, sameSite: "Lax", path: "/"
  }));
  return new Response(null, { status: 302, headers });
}

async function handlePlayerRankHistoryApi(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") return json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const url = new URL(request.url);
  const governorId = String(url.searchParams.get("governor_id") || "").trim();
  if (!governorId) return json({ ok: false, error: "GOVERNOR_ID_REQUIRED" }, 400);

  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200);
  try {
    const history = await getPlayerRankHistory(env.DB, {
      governorId,
      limit,
      archiveBucket: env.ARCHIVE,
      historyMode: env.HISTORY_STORAGE_MODE
    });
    return json({
      ok: true,
      governor_id: governorId,
      history
    });
  } catch (error) {
    console.error("Player rank history API error:", error);
    return json({ ok: false, error: "PLAYER_RANK_HISTORY_READ_FAILED" }, 500);
  }
}

async function handleRankingPlayerTest(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  const url = new URL(request.url);
  const governorId = url.searchParams.get("governor_id");
  if (!governorId) return json({ ok: false, error: "GOVERNOR_ID_REQUIRED" }, 400);
  const apiLockKey = "ADMIN_RANKING_PLAYER:"+String(governorId);
  const apiLockToken = await acquireApiRequestLock(env, apiLockKey);
  if (!apiLockToken) return json({ ok: false, error: "API_REQUEST_IN_PROGRESS", message: "同じ対象への処理が現在実行中です。完了を待ってから再試行してください。", lock_key: apiLockKey }, 409);
  try {

  try {
    await ensureKingdomWatchlistFreshnessSchema(env.DB);
    const result = await getMightPulsePlayerRanks(env, governorId);
    const raw = result.data?.player || result.data;
    const ranks = raw?.ranks || result.data?.ranks;
    if (!ranks) return json({ ok: false, error: "PLAYER_RANKS_MISSING" }, 502);

    const saved = env.DB ? await savePlayerRankSnapshot(env.DB, {
      governorId,
      uid: raw?.uid ?? result.data?.uid ?? null,
      kid: raw?.kid ?? result.data?.kid ?? null,
      ranks,
      observedAt: Math.floor(Date.now() / 1000),
      sourceObservedAt: getMightPulseSourceTimestamp(result.data),
      archiveBucket: env.ARCHIVE,
      historyMode: env.HISTORY_STORAGE_MODE
    }) : null;

    return json({ ok: true, governor_id: governorId, saved_snapshot: Boolean(saved), ranks });
  } catch (error) {
    return json({
      ok: false,
      error: error?.code || "MIGHTPULSE_RANKING_REQUEST_FAILED",
      status: error?.status || 0
    }, error?.status && error.status >= 400 && error.status < 600 ? error.status : 502);
  }

  } finally {
    await releaseApiRequestLock(env, apiLockKey, apiLockToken);
  }
}

async function handleRankingBoardTest(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  const url = new URL(request.url);
  const kid = url.searchParams.get("kid");
  const board = url.searchParams.get("board");
  if (!kid || !board) return json({ ok: false, error: "KID_AND_BOARD_REQUIRED" }, 400);
  const apiLockKey = "ADMIN_RANKING_BOARD:"+String(kid)+":"+String(board);
  const apiLockToken = await acquireApiRequestLock(env, apiLockKey);
  if (!apiLockToken) return json({ ok: false, error: "API_REQUEST_IN_PROGRESS", message: "同じ対象への処理が現在実行中です。完了を待ってから再試行してください。", lock_key: apiLockKey }, 409);
  try {

  try {
    await ensureKingdomWatchlistFreshnessSchema(env.DB);
    const result = await getMightPulseKingdomRanks(env, kid, { board, limit: 100 });
    const payload = result.data;
    const entries = extractKingdomRankingEntries(payload);
    const saved = env.DB ? await saveKingdomRankingBoard(env.DB, {
      kid,
      board,
      entries,
      observedAt: Math.floor(Date.now() / 1000),
      sourceObservedAt: getMightPulseSourceTimestamp(result.data)
    }) : 0;
    return json({ ok: true, kid, board, count: Array.isArray(entries) ? entries.length : 0, saved_rows: saved });
  } catch (error) {
    return json({
      ok: false,
      error: error?.code || "MIGHTPULSE_RANKING_REQUEST_FAILED",
      status: error?.status || 0
    }, error?.status && error.status >= 400 && error.status < 600 ? error.status : 502);
  }

  } finally {
    await releaseApiRequestLock(env, apiLockKey, apiLockToken);
  }
}

async function handleMightPulsePlayerTest(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (auth.status !== "ACTIVE") return json({ ok: false, error: "USER_DISABLED" }, 403);
  if (auth.role !== "ADMIN" && auth.role !== "OWNER") return json({ ok: false, error: "ADMIN_REQUIRED" }, 403);

  const url = new URL(request.url);
  const governorId = url.searchParams.get("governor_id");
  if (!governorId) return json({ ok: false, error: "GOVERNOR_ID_REQUIRED" }, 400);
  const apiLockKey = "ADMIN_MIGHTPULSE_PLAYER:"+String(governorId);
  const apiLockToken = await acquireApiRequestLock(env, apiLockKey);
  if (!apiLockToken) return json({ ok: false, error: "API_REQUEST_IN_PROGRESS", message: "同じ対象への処理が現在実行中です。完了を待ってから再試行してください。", lock_key: apiLockKey }, 409);
  try {

  try {
    await ensureKingdomWatchlistFreshnessSchema(env.DB);
    const result = await getMightPulsePlayer(env, governorId, { include: "base" });
    if (env.DB) {
      const observation = observationEnvelope({
        endpoint: "/players/:governor_id",
        httpStatus: result.status,
        raw: result.data
      });
      await saveApiObservation(env.DB, observation);
    }
    return json({
      ok: true,
      provider: "MIGHTPULSE",
      target_type: "PLAYER",
      target_id: governorId,
      upstream_status: result.status,
      saved_observation: Boolean(env.DB)
    });
  } catch (error) {
    return json({
      ok: false,
      error: error?.code || "MIGHTPULSE_REQUEST_FAILED",
      status: error?.status || 0,
      diagnostic: {
        name: error?.name || null,
        message: error?.message || null,
        details: error?.details || null
      }
    }, error?.status && error.status >= 400 && error.status < 600 ? error.status : 502);
  }

  } finally {
    await releaseApiRequestLock(env, apiLockKey, apiLockToken);
  }
}


async function requireAdmin(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") return { error: json({ ok: false, error: "UNAUTHORIZED" }, 401) };
  if (auth.role !== "ADMIN" && auth.role !== "OWNER") return { error: json({ ok: false, error: "ADMIN_REQUIRED" }, 403) };
  if (!env.DB) return { error: json({ ok: false, error: "DB_NOT_CONFIGURED" }, 503) };
  configureApiPoolEncryption(env.EAGLEEYE_SESSION_SECRET);
  return { auth };
}

async function handleDataRetentionApi(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  try {
    if (request.method === "GET") {
      return json({ ok: true, settings: await getRetentionSettings(env.DB) });
    }
    if (request.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
    const contentType = request.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
    const settings = await updateRetentionSettings(env.DB, body, guard.auth.user_id);
    if (contentType.includes("application/json")) {
      return json({ ok: true, settings });
    }
    return eagleEyeHtmlResponse(`<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>保存しました - EagleEye</title>
<style>
:root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
.card{text-align:center;padding:32px 28px;border:1px solid #334155;border-radius:16px;background:#162238;box-shadow:0 12px 40px rgba(0,0,0,.25)}
.ok{font-size:42px;margin-bottom:8px}.title{font-size:24px;font-weight:900}.sub{margin-top:8px;color:#94a3b8}
</style>
<meta http-equiv="refresh" content="1;url=/admin/data-retention">
</head><body><div class="card"><div class="ok">✓</div><div class="title">保存しました</div><div class="sub">データ保存期間の設定を更新しました。</div></div></body></html>`);
  } catch (error) {
    console.error("Data retention settings error:", error);
    return json({ ok: false, error: error?.message || "RETENTION_UPDATE_FAILED" }, 400);
  }
}

async function handleApiPoolKeys(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  try {
    const keys = await getApiPoolKeysWithContributors(env.DB);
    return json({ ok: true, keys: keys.map(k => ({
      ...k,
      key_fingerprint: k.key_fingerprint ? String(k.key_fingerprint).slice(0, 16) + "…" : null,
      api_key_prefix: k.api_key_prefix || null,
      last_error_message: k.last_error_message || null
    })), stats: await getPoolStats(env.DB) });
  } catch (error) {
    console.error("API pool list error:", error);
    return json({ ok: false, error: "API_POOL_READ_FAILED" }, 500);
  }
}

async function handleApiPoolAdd(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  try {
    const contentType = request.headers.get("content-type") || "";
    let body = {};
    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      const form = await request.formData();
      body = Object.fromEntries(form.entries());
    }
    const poolType = String(body.pool_type || "SYSTEM_GENERAL");
    const result = await addApiPoolKey(env.DB, {
      poolType,
      label: String(body.label || "").trim() || null,
      apiKey: String(body.api_key || "").trim(),
      contributedByUserId: poolType === "USER_CONTRIBUTED" ? guard.auth.user_id : null,
      consentVersion: poolType === "USER_CONTRIBUTED" ? "v1" : null
    });
    if (contentType.includes("application/json")) return json({ ok: true, key: result }, 201);
    return new Response(null, { status: 302, headers: { Location: "/admin/api-pool", "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("API pool add error:", error);
    return json({ ok: false, error: error?.message || "API_POOL_ADD_FAILED" }, 400);
  }
}

async function handleApiPoolMove(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;

  try {
    const contentType = request.headers.get("content-type") || "";
    let body = {};
    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      const form = await request.formData();
      body = Object.fromEntries(form.entries());
    }

    const keyId = String(body.key_id || "").trim();
    const poolType = String(body.pool_type || "").trim();
    const allowed = ["SYSTEM_GENERAL", "SYSTEM_WATCHLIST", "USER_CONTRIBUTED"];
    if (!keyId || !allowed.includes(poolType)) {
      return json({ ok: false, error: "INVALID_POOL_MOVE" }, 400);
    }

    const row = await env.DB.prepare(
      "SELECT key_id, pool_type, status FROM api_pool_keys WHERE key_id = ? LIMIT 1"
    ).bind(keyId).first();

    if (!row) return json({ ok: false, error: "API_POOL_KEY_NOT_FOUND" }, 404);
    if (row.status === "REVOKED") return json({ ok: false, error: "API_POOL_KEY_REVOKED" }, 409);

    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      "UPDATE api_pool_keys SET pool_type = ?, updated_at = ? WHERE key_id = ?"
    ).bind(poolType, now, keyId).run();

    if (contentType.includes("application/json")) {
      return json({ ok: true, key_id: keyId, pool_type: poolType });
    }

    return new Response(null, {
      status: 302,
      headers: { Location: "/admin/api-pool", "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error("API pool move error:", error);
    return json({ ok: false, error: error?.message || "API_POOL_MOVE_FAILED" }, 400);
  }
}


async function handleApiPoolRevoke(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  try {
    const contentType = request.headers.get("content-type") || "";
    let body = {};
    if (contentType.includes("application/json")) body = await request.json();
    else body = Object.fromEntries((await request.formData()).entries());

    const keyId = String(body.key_id || "").trim();
    if (!keyId) return json({ ok: false, error: "KEY_ID_REQUIRED" }, 400);

    const row = await env.DB.prepare("SELECT key_id, status FROM api_pool_keys WHERE key_id = ? LIMIT 1").bind(keyId).first();
    if (!row) return json({ ok: false, error: "API_POOL_KEY_NOT_FOUND" }, 404);
    if (row.status === "REVOKED") return json({ ok: false, error: "API_POOL_KEY_ALREADY_REVOKED" }, 409);

    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare("UPDATE api_pool_keys SET status = 'REVOKED', revoked_at = ?, cooldown_until = NULL, updated_at = ? WHERE key_id = ?").bind(now, now, keyId).run();

    if (contentType.includes("application/json")) return json({ ok: true, key_id: keyId, status: "REVOKED" });
    return new Response(null, { status: 302, headers: { Location: "/admin/api-pool", "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("API pool revoke error:", error);
    return json({ ok: false, error: error?.message || "API_POOL_REVOKE_FAILED" }, 400);
  }
}



async function handleOwnerApiPoolReassign(request, env) {
  const guard = await requireOwner(request, env);
  if (guard.error) return guard.error;
  if (request.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const contentType = request.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
    const keyId = String(body.key_id || "").trim();
    const newUserId = String(body.user_id || "").trim();
    if (!keyId || !newUserId) return json({ ok: false, error: "KEY_ID_AND_USER_ID_REQUIRED" }, 400);

    const [key, target] = await Promise.all([
      env.DB.prepare("SELECT key_id, provider, pool_type, status, contributed_by_user_id FROM api_pool_keys WHERE key_id = ? LIMIT 1").bind(keyId).first(),
      env.DB.prepare("SELECT user_id, discord_id, username, global_name FROM users WHERE user_id = ? LIMIT 1").bind(newUserId).first()
    ]);
    if (!key) return json({ ok: false, error: "API_POOL_KEY_NOT_FOUND" }, 404);
    if (key.status === "REVOKED") return json({ ok: false, error: "API_POOL_KEY_REVOKED" }, 409);
    if (!target) return json({ ok: false, error: "USER_NOT_FOUND" }, 404);
    if (key.pool_type !== "USER_CONTRIBUTED") return json({ ok: false, error: "ONLY_USER_CONTRIBUTED_KEYS_CAN_BE_REASSIGNED" }, 409);

    const previousUserId = key.contributed_by_user_id ? String(key.contributed_by_user_id) : null;
    const now = Math.floor(Date.now() / 1000);
    if (previousUserId === newUserId) {
      return json({ ok: true, key_id: keyId, contributed_by_user_id: newUserId, changed: false });
    }

    await env.DB.prepare(
      "UPDATE api_pool_keys SET contributed_by_user_id = ?, updated_at = ? WHERE key_id = ?"
    ).bind(newUserId, now, keyId).run();

    const [previous, previousLink, targetLink] = await Promise.all([
      previousUserId
        ? env.DB.prepare("SELECT user_id, discord_id, username, global_name FROM users WHERE user_id = ? LIMIT 1").bind(previousUserId).first()
        : Promise.resolve(null),
      previousUserId
        ? env.DB.prepare("SELECT l.governor_id, l.kingdom_id, p.nick_name FROM user_player_links l LEFT JOIN players p ON p.governor_id = l.governor_id WHERE l.user_id = ? AND l.status = 'ACTIVE' ORDER BY CASE l.account_type WHEN 'MAIN' THEN 0 ELSE 1 END, l.created_at ASC LIMIT 1").bind(previousUserId).first()
        : Promise.resolve(null),
      env.DB.prepare("SELECT l.governor_id, l.kingdom_id, p.nick_name FROM user_player_links l LEFT JOIN players p ON p.governor_id = l.governor_id WHERE l.user_id = ? AND l.status = 'ACTIVE' ORDER BY CASE l.account_type WHEN 'MAIN' THEN 0 ELSE 1 END, l.created_at ASC LIMIT 1").bind(newUserId).first()
    ]);
    await writeOwnerAuditLog(env, guard.auth, "API_POOL_OWNER_REASSIGN", newUserId, target.discord_id, {
      key_id: keyId,
      previous_user_id: previousUserId,
      previous_discord_id: previous?.discord_id || null,
      new_user_id: newUserId,
      new_discord_id: target.discord_id,
      previous_governor_id: previousLink?.governor_id || null,
      previous_governor_name: previousLink?.nick_name || null,
      new_governor_id: targetLink?.governor_id || null,
      new_governor_name: targetLink?.nick_name || null
    });
    return json({ ok: true, key_id: keyId, contributed_by_user_id: newUserId, changed: true });
  } catch (error) {
    console.error("Owner API pool reassign error:", error);
    return json({ ok: false, error: error?.message || "API_POOL_REASSIGN_FAILED" }, 400);
  }
}



async function handleApiPoolMightyCheck(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  if (request.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const contentType = request.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
    const keyId = String(body.key_id || "").trim();
    if (!keyId) return json({ ok: false, error: "KEY_ID_REQUIRED" }, 400);

    const key = await env.DB.prepare(
      "SELECT key_id, provider, pool_type, status FROM api_pool_keys WHERE key_id = ? LIMIT 1"
    ).bind(keyId).first();
    if (!key) return json({ ok: false, error: "API_POOL_KEY_NOT_FOUND" }, 404);
    if (key.status === "REVOKED") return json({ ok: false, error: "API_POOL_KEY_REVOKED" }, 409);

    configureApiPoolEncryption(env.EAGLEEYE_SESSION_SECRET);
    const lease = await leaseApiKeyForHealthCheck(env.DB, {
      keyId,
      purpose: "API_POOL_MIGHTY_CHECK",
      targetType: "API_KEY",
      targetId: keyId
    });

    let mightyCapable = false;
    let checkStatus = "UNKNOWN";
    let errorCode = null;
    try {
      const result = await mightPulseFetch(env, "/kvk/matchups", {
        apiKey: lease.api_key,
        operation: "API_POOL_MIGHTY_CHECK",
        targetType: "API_KEY",
        targetId: keyId,
        metadata: { leaseId: lease.lease_id, poolType: lease.pool_type }
      });
      mightyCapable = Number(result.status) >= 200 && Number(result.status) < 300;
      checkStatus = mightyCapable ? "CONFIRMED" : "UNKNOWN";
      await recordApiPoolSuccess(env.DB, {
        keyId: lease.key_id,
        leaseId: lease.lease_id,
        poolType: lease.pool_type,
        endpoint: "/kvk/matchups",
        targetType: "API_KEY",
        targetId: keyId,
        purpose: "API_POOL_MIGHTY_CHECK",
        httpStatus: result.status,
      requestCount: Math.max(1, Number(result.attempts) || 1),
        remainingMinute: parseHeaderNumber(result.headers, "x-ratelimit-remaining"),
        remainingDay: parseHeaderNumber(result.headers, "x-ratelimit-day-remaining")
      });
    } catch (error) {
      const status = Number(error?.status || 0);
      errorCode = error?.code || null;
      if (status === 403 || error?.code === "MIGHTY_REQUIRED") {
        checkStatus = "NOT_MIGHTY";
        mightyCapable = false;
      } else if (status === 401) {
        checkStatus = "ERROR";
        mightyCapable = false;
      } else {
        checkStatus = "UNKNOWN";
      }
      const cooldown = status === 429 ? 60 : status >= 500 || error?.code === "MIGHTPULSE_TIMEOUT" || error?.code === "MIGHTPULSE_NETWORK_ERROR" ? 15 : 0;
      const disable = status === 401;
      const keepAvailable = !disable && cooldown === 0;
      await recordApiPoolFailure(env.DB, {
        keyId: lease.key_id,
        leaseId: lease.lease_id,
        poolType: lease.pool_type,
        endpoint: "/kvk/matchups",
        targetType: "API_KEY",
        targetId: keyId,
        purpose: "API_POOL_MIGHTY_CHECK",
        httpStatus: status,
        errorCode: error?.code || "MIGHTPULSE_MIGHTY_CHECK_FAILED",
        errorMessage: error?.message || null,
        cooldownSeconds: cooldown,
        disable,
        keepAvailable,
        requestCount: Math.max(1, Number(error?.attempts) || 1)
      });
      if (status !== 403) {
        await env.DB.prepare(
          "UPDATE api_pool_keys SET mighty_capable = ?, mighty_checked_at = ?, mighty_check_status = ?, mighty_last_error_code = ?, updated_at = ? WHERE key_id = ?"
        ).bind(0, Math.floor(Date.now() / 1000), checkStatus, errorCode, Math.floor(Date.now() / 1000), keyId).run();
        return json({ ok: false, error: error?.code || "MIGHTY_CHECK_FAILED", status, mighty_capable: false, mighty_check_status: checkStatus });
      }
    }

    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      "UPDATE api_pool_keys SET mighty_capable = ?, mighty_checked_at = ?, mighty_check_status = ?, mighty_last_error_code = ?, updated_at = ? WHERE key_id = ?"
    ).bind(mightyCapable ? 1 : 0, now, checkStatus, errorCode, now, keyId).run();

    return json({
      ok: true,
      key_id: keyId,
      mighty_capable: mightyCapable,
      mighty_check_status: checkStatus,
      mighty_checked_at: now
    });
  } catch (error) {
    console.error("API pool Mighty check error:", error);
    return json({ ok: false, error: error?.message || "API_POOL_MIGHTY_CHECK_FAILED" }, 400);
  }
}


async function handleApiPoolHealthCheck(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  try {
    const contentType = request.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
      ? await request.json().catch(() => ({}))
      : Object.fromEntries((await request.formData()).entries());
    const keyId = String(body.key_id || "").trim();
    if (!keyId) return json({ ok: false, error: "KEY_ID_REQUIRED" }, 400);
    const now = Math.floor(Date.now() / 1000);
    const key = await env.DB.prepare("SELECT key_id, status, pool_type, leased_until, lease_job_id, lease_purpose, lease_target_type, lease_target_id FROM api_pool_keys WHERE key_id = ? LIMIT 1").bind(keyId).first();
    if (!key) return json({ ok: false, error: "API_POOL_KEY_NOT_FOUND" }, 404);
    if (key.status === "REVOKED") return json({ ok: false, error: "API_POOL_KEY_REVOKED", message: "このAPIキーは手動で無効化されています。" }, 409);
    if (key.status === "COOLDOWN") return json({ ok: false, error: "API_POOL_KEY_COOLDOWN", message: "このAPIキーは現在COOLDOWN中です。しばらく待ってから更新してください。" }, 409);
    if (key.leased_until && Number(key.leased_until) > now) {
      const remainingSeconds = Math.max(1, Number(key.leased_until) - now);
      return json({
        ok: false,
        error: "API_POOL_KEY_LEASED",
        message: "このAPIキーは現在リース中（処理中）です。無効キーとは限りません。処理完了またはリース期限切れ後に再度更新してください。",
        leased_until: Number(key.leased_until),
        remaining_seconds: remainingSeconds,
        lease_job_id: key.lease_job_id || null,
        lease_purpose: key.lease_purpose || null,
        lease_target_type: key.lease_target_type || null,
        lease_target_id: key.lease_target_id || null
      }, 409);
    }

    configureApiPoolEncryption(env.EAGLEEYE_SESSION_SECRET);
    const probeGovernorId = String(env.MIGHTPULSE_HEALTHCHECK_GOVERNOR_ID || "225623582").trim();
    let lease = null;
    try {
      lease = await leaseApiKeyForHealthCheck(env.DB, { keyId, purpose: "API_POOL_HEALTH_CHECK", targetType: "API_KEY", targetId: probeGovernorId });
      const result = await getMightPulsePlayer(env, probeGovernorId, { include: "base", apiKey: lease.api_key, metadata: { leaseId: lease.lease_id, poolType: lease.pool_type } });
      await recordApiPoolSuccess(env.DB, {
        keyId: lease.key_id,
        leaseId: lease.lease_id,
      poolType: lease.pool_type,
        endpoint: "/players/:governor_id",
        targetType: "API_KEY",
        targetId: probeGovernorId,
        purpose: "API_POOL_HEALTH_CHECK",
        httpStatus: result.status,
      requestCount: Math.max(1, Number(result.attempts) || 1),
        remainingMinute: parseHeaderNumber(result.headers, "x-ratelimit-remaining"),
        remainingDay: parseHeaderNumber(result.headers, "x-ratelimit-day-remaining")
      });
      if (contentType.includes("application/json")) {
        return json({ ok: true, key_id: keyId, status: "AVAILABLE", upstream_status: result.status, message: "接続確認成功。APIキーをAVAILABLEにしました。" });
      }
      return new Response(null, {
        status: 302,
        headers: { Location: "/admin/api-pool", "Cache-Control": "no-store" }
      });
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
          endpoint: "/players/:governor_id",
          targetType: "API_KEY",
          targetId: probeGovernorId,
          purpose: "API_POOL_HEALTH_CHECK",
          httpStatus: status,
          errorCode: error?.code || "MIGHTPULSE_REQUEST_FAILED",
          errorMessage: error?.message || null,
          cooldownSeconds: cooldown,
          disable,
          keepAvailable,
          requestCount: Math.max(1, Number(error?.attempts) || 1)
        });
      }
      const status = Number(error?.status || 0);
      const nextStatus = status === 401 || status === 403 ? "DISABLED"
        : status === 429 || status >= 500 || error?.code === "MIGHTPULSE_TIMEOUT" || error?.code === "MIGHTPULSE_NETWORK_ERROR" ? "COOLDOWN"
        : status === 400 || status === 404 ? "AVAILABLE" : "ERROR";
      console.error("API pool health check upstream failure", {
        keyId,
        probeGovernorId,
        status,
        code: error?.code || "MIGHTPULSE_REQUEST_FAILED",
        name: error?.name || null,
        message: error?.message || null,
        details: error?.details || null
      });
      return json({
        ok: false,
        key_id: keyId,
        status: nextStatus,
        upstream_status: status,
        error: error?.code || "MIGHTPULSE_REQUEST_FAILED",
        message: nextStatus === "DISABLED"
          ? "APIキーの認証・権限エラーです。"
          : nextStatus === "COOLDOWN"
            ? "一時的な障害またはレート制限のためCOOLDOWNにしました。"
            : nextStatus === "AVAILABLE"
              ? "APIキーへの接続は確認できました。対象データ側の応答のためAVAILABLEを維持しました。"
              : "接続確認に失敗したためERRORのままです。",
        diagnostic: {
          code: error?.code || "MIGHTPULSE_REQUEST_FAILED",
          error_name: error?.name || null,
          error_message: error?.message || null,
          details: error?.details || null
        }
      }, 200);
    }
  } catch (error) {
    await recordDiagnostic(env.DB, {
      service: "api_pool",
      feature: "api_pool",
      operation: "HEALTH_CHECK",
      status: "FAILED",
      errorCode: String(error?.code || error?.message || "API_POOL_HEALTH_CHECK_FAILED").split(":")[0],
      message: String(error?.message || error).slice(0, 2000),
      targetType: "API_KEY",
      targetId: keyId
    });
    console.error("API pool health check error:", error);
    return json({ ok: false, error: error?.message || "API_POOL_HEALTH_CHECK_FAILED" }, 400);
  }
}

async function handleApiPoolDelete(request, env) {
  const guard = await requireOwner(request, env);
  if (guard.error) return guard.error;
  try {
    const contentType = request.headers.get("content-type") || "";
    let body = {};
    if (contentType.includes("application/json")) body = await request.json();
    else body = Object.fromEntries((await request.formData()).entries());

    const keyId = String(body.key_id || "").trim();
    if (!keyId) return json({ ok: false, error: "KEY_ID_REQUIRED" }, 400);

    const row = await env.DB.prepare(
      "SELECT key_id, status, leased_until, lease_id FROM api_pool_keys WHERE key_id = ? LIMIT 1"
    ).bind(keyId).first();
    if (!row) return json({ ok: false, error: "API_POOL_KEY_NOT_FOUND" }, 404);

    const now = Math.floor(Date.now() / 1000);
    if (row.leased_until && Number(row.leased_until) > now) {
      return json({
        ok: false,
        error: "API_POOL_KEY_LEASED",
        message: "このAPIキーは現在リース中（処理中）のため削除できません。処理完了またはリース期限切れ後に削除してください。",
        leased_until: Number(row.leased_until)
      }, 409);
    }

    // Hard delete: remove leases and usage history, then remove the encrypted key record.
    await env.DB.batch([
      env.DB.prepare("DELETE FROM api_leases WHERE key_id = ?").bind(keyId),
      env.DB.prepare("DELETE FROM api_pool_usage WHERE key_id = ?").bind(keyId),
      env.DB.prepare("DELETE FROM api_pool_keys WHERE key_id = ?").bind(keyId)
    ]);

    if (contentType.includes("application/json")) {
      return json({ ok: true, key_id: keyId, deleted: true });
    }

    return new Response(null, {
      status: 302,
      headers: { Location: "/admin/api-pool", "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error("API pool hard delete error:", error);
    return json({ ok: false, error: error?.message || "API_POOL_DELETE_FAILED" }, 400);
  }
}

async function handleApiPoolTestPlayer(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  const url = new URL(request.url);
  const governorId = String(url.searchParams.get("governor_id") || "").trim();
  if (!governorId) return json({ ok: false, error: "GOVERNOR_ID_REQUIRED" }, 400);

  let lease = null;
  try {
    await ensureKingdomWatchlistFreshnessSchema(env.DB);
    lease = await leaseApiKey(env.DB, {
      poolType: "SYSTEM_GENERAL",
      purpose: "ADMIN_TEST",
      targetType: "PLAYER",
      targetId: governorId
    });
    const upstreamStartedAt = Date.now();
    const result = await getMightPulsePlayer(env, governorId, { include: "base", apiKey: lease.api_key, metadata: { leaseId: lease.lease_id, poolType: lease.pool_type } });
    const upstreamElapsedMs = Date.now() - upstreamStartedAt;
    await recordApiPoolSuccess(env.DB, {
      keyId: lease.key_id,
      leaseId: lease.lease_id,
      poolType: lease.pool_type,
      endpoint: "/players/:governor_id",
      targetType: "PLAYER",
      targetId: governorId,
      purpose: "ADMIN_TEST",
      httpStatus: result.status,
      requestCount: Math.max(1, Number(result.attempts) || 1),
      remainingMinute: parseHeaderNumber(result.headers, "x-ratelimit-remaining")
    });
    const sourcePlayer = result?.data?.player || {};
    const sourceTownCenterLevel = sourcePlayer.town_center_level ?? null;
    const sourceFresh = result?.data?.fresh ?? null;
    const sourceAgeSeconds = result?.data?.age_seconds ?? null;
    const payload = {
      ok: true,
      provider: "MIGHTPULSE",
      target_type: "PLAYER",
      target_id: governorId,
      upstream_status: result.status,
      key_id: lease.key_id,
      source_town_center_level: sourceTownCenterLevel,
      source_fresh: sourceFresh,
      source_age_seconds: sourceAgeSeconds,
      upstream_elapsed_ms: upstreamElapsedMs,
      eagleeye_town_center_display: formatTownCenterLevel(sourceTownCenterLevel)
    };
    if (new URL(request.url).searchParams.get("format") === "json") {
      return json(payload);
    }
    return eagleEyeHtmlResponse(renderApiPoolTestResult(governorId, payload, guard.auth.role));
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
        endpoint: "/players/:governor_id",
        targetType: "PLAYER",
        targetId: governorId,
        purpose: "ADMIN_TEST",
        httpStatus: status,
        errorCode: error?.code || "MIGHTPULSE_REQUEST_FAILED",
        errorMessage: error?.message || null,
        cooldownSeconds: cooldown,
        disable,
        keepAvailable,
        requestCount: Math.max(1, Number(error?.attempts) || 1)
      });
    }
    const status = Number(error?.status || 0);
    const responseStatus = status >= 400 && status < 600 ? status : 502;
    const payload = {
      ok: false,
      error: error?.code || "MIGHTPULSE_REQUEST_FAILED",
      status,
      diagnostic: error?.details || null
    };
    if (new URL(request.url).searchParams.get("format") === "json") {
      return json(payload, responseStatus);
    }
    return eagleEyeHtmlResponse(renderApiPoolTestResult(governorId, payload));
  }
}

async function handleApiPoolTestRanking(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  const url = new URL(request.url);
  const kid = String(url.searchParams.get("kid") || "").trim();
  const board = String(url.searchParams.get("board") || "").trim();
  if (!kid || !board) return json({ ok: false, error: "KID_AND_BOARD_REQUIRED" }, 400);

  let lease = null;
  try {
    await ensureKingdomWatchlistFreshnessSchema(env.DB);
    const testPoolTypes = ["SYSTEM_WATCHLIST", "SYSTEM_GENERAL", "USER_CONTRIBUTED"];
    let testPoolType = null;
    let lastNoKeyError = null;
    for (const candidatePoolType of testPoolTypes) {
      try {
        lease = await leaseApiKey(env.DB, {
          poolType: candidatePoolType,
          purpose: "ADMIN_TEST",
          targetType: "KINGDOM",
          targetId: kid
        });
        testPoolType = candidatePoolType;
        break;
      } catch (error) {
        if (error?.message !== "NO_API_POOL_KEY_AVAILABLE") throw error;
        lastNoKeyError = error;
      }
    }
    if (!lease) throw lastNoKeyError || new Error("NO_API_POOL_KEY_AVAILABLE");
    const startedAt = Date.now();
    const result = await getMightPulseKingdomRanks(env, kid, {
      board,
      limit: 100,
      apiKey: lease.api_key,
      metadata: { leaseId: lease.lease_id, poolType: lease.pool_type }
    });
    const elapsedMs = Date.now() - startedAt;
    const payload = result?.data || {};
    const entries = extractKingdomRankingEntries(payload);
    await recordApiPoolSuccess(env.DB, {
      keyId: lease.key_id,
      leaseId: lease.lease_id,
      poolType: lease.pool_type,
      endpoint: "/kingdoms/:kid/ranks",
      targetType: "KINGDOM",
      targetId: kid,
      purpose: "ADMIN_TEST",
      httpStatus: result.status,
      requestCount: Math.max(1, Number(result.attempts) || 1),
      remainingMinute: parseHeaderNumber(result.headers, "x-ratelimit-remaining")
    });
    const response = {
      ok: true,
      provider: "MIGHTPULSE",
      target_type: "KINGDOM",
      target_id: kid,
      board,
      upstream_status: result.status,
      key_id: lease.key_id,
      pool_type: testPoolType,
      entry_count: entries.length,
      source_observed_at: getMightPulseSourceTimestamp(payload),
      upstream_elapsed_ms: elapsedMs
    };
    if (url.searchParams.get("format") === "json") return json(response);
    return eagleEyeHtmlResponse(renderApiPoolRankingTestResult(kid, board, response, guard.auth.role));
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
        endpoint: "/kingdoms/:kid/ranks",
        targetType: "KINGDOM",
        targetId: kid,
        purpose: "ADMIN_TEST",
        httpStatus: status,
        errorCode: error?.code || "MIGHTPULSE_RANKING_REQUEST_FAILED",
        errorMessage: error?.message || null,
        cooldownSeconds: cooldown,
        disable,
        keepAvailable,
        requestCount: Math.max(1, Number(error?.attempts) || 1)
      });
    }
    const status = Number(error?.status || 0);
    const errorCode = error?.code || error?.message || "MIGHTPULSE_RANKING_REQUEST_FAILED";
    const responseStatus = status >= 400 && status < 600 ? status : 502;
    const response = {
      ok: false,
      error: errorCode,
      status,
      diagnostic: error?.details || null,
      message: error?.message || null
    };
    if (url.searchParams.get("format") === "json") return json(response, responseStatus);
    return eagleEyeHtmlResponse(renderApiPoolRankingTestResult(kid, board, response, guard.auth.role), responseStatus);
  }
}

function renderApiPoolRankingTestResult(kid, board, result, adminRole = "ADMIN") {
  const esc = escapeHtml;
  const ok = result?.ok === true;
  const title = ok ? "王国ランキング テスト成功" : "王国ランキング テスト失敗";
  const status = result?.status ?? result?.upstream_status ?? "-";
  const diagnostic = result?.diagnostic || null;
  const details = ok
    ? "<div class='detail'><b>取得確認</b><div class='meta'>王国ID: " + esc(kid) + "<br>Pool: " + esc(result?.pool_type ?? "-") + "<br>Board: " + esc(board) + "<br>取得件数: " + esc(result?.entry_count ?? "-") + "<br>MightPulse取得時間: " + esc(result?.upstream_elapsed_ms != null ? result.upstream_elapsed_ms + " ms" : "-") + "<br>Source基準時刻: " + esc(result?.source_observed_at ?? "未取得") + "</div></div>"
    : "<div class='detail'><b>エラーコード</b><div class='meta'>" + esc(result?.error || "UNKNOWN_ERROR") + (result?.message ? "<br>メッセージ: " + esc(result.message) : "") + (diagnostic ? "<br><br>詳細<pre>" + esc(JSON.stringify(diagnostic, null, 2)) + "</pre>" : "") + "</div></div>";
  return "<!DOCTYPE html><html lang='ja'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>" + title + "</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.wrap{max-width:700px;margin:auto;padding:28px 18px}.back{color:#94a3b8;text-decoration:none}.card{margin-top:20px;padding:20px;border:1px solid #334155;border-radius:16px;background:#162238}.status{font-size:20px;font-weight:900}.ok{color:#86efac}.ng{color:#fca5a5}.meta{margin-top:12px;color:#cbd5e1;line-height:1.8}.detail{margin-top:16px}.detail pre{white-space:pre-wrap;overflow:auto;padding:12px;border-radius:10px;background:#0b1220;color:#cbd5e1;font-size:12px}.btn{display:inline-block;margin-top:16px;padding:11px 14px;border-radius:10px;background:#f59e0b;color:#111827;text-decoration:none;font-weight:900}</style></head><body><div class='admin-badge'>🔐 ADMIN MODE · " + adminRole + "</div><main class='wrap'><a class='back' href='/admin/api-pool'>← API Pool管理へ戻る</a><div class='card'><div class='status " + (ok ? "ok" : "ng") + "'>" + title + "</div><div class='meta'>" + (ok ? "王国ランキングの取得に成功しました。" : "MightPulseへの王国ランキングリクエストに失敗しました。") + "<br>HTTP Status: " + esc(status) + "</div>" + details + "<a class='btn' href='/admin/api-pool'>管理画面へ戻る</a></div></main></body></html>";
}


function renderApiPoolTestResult(governorId, result, adminRole = "ADMIN") {
  const esc = escapeHtml;
  const ok = result?.ok === true;
  const title = ok ? "API Pool テスト成功" : "API Pool テスト失敗";
  const status = result?.status ?? result?.upstream_status ?? "-";
  const diagnostic = result?.diagnostic || null;
  const sourceDiagnostics = ok
    ? "<div class='detail'><b>元データ確認</b><div class='meta'>MightPulseの役場レベル: " + esc(result?.source_town_center_level ?? "-") + "<br>EagleEye表示: " + esc(result?.eagleeye_town_center_display ?? "-") + "<br>Provider Fresh: " + esc(result?.source_fresh === true ? "YES" : "NO / cached") + "<br>Provider Age: " + esc(result?.source_age_seconds != null ? Math.round(result.source_age_seconds / 3600) + "時間" : "-") + "<br>MightPulse取得時間: " + esc(result?.upstream_elapsed_ms != null ? result.upstream_elapsed_ms + " ms" : "-") + "</div></div>"
    : "";
  const details = diagnostic
    ? "<div class='detail'><b>詳細</b><pre>" + esc(JSON.stringify(diagnostic, null, 2)) + "</pre></div>"
    : "";
  const message = ok
    ? "領主ID " + esc(governorId) + " のデータ取得に成功しました。API Pool → MightPulse の接続は正常です。"
    : "MightPulseへの接続またはAPIリクエストに失敗しました。";
  return "<!DOCTYPE html><html lang='ja'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>" + title + "</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.wrap{max-width:700px;margin:auto;padding:28px 18px}.back{color:#94a3b8;text-decoration:none}.card{margin-top:20px;padding:20px;border:1px solid #334155;border-radius:16px;background:#162238}.status{font-size:20px;font-weight:900}.ok{color:#86efac}.ng{color:#fca5a5}.meta{margin-top:12px;color:#cbd5e1;line-height:1.8}.detail{margin-top:16px}.detail pre{white-space:pre-wrap;overflow:auto;padding:12px;border-radius:10px;background:#0b1220;color:#cbd5e1;font-size:12px}.btn{display:inline-block;margin-top:16px;padding:11px 14px;border-radius:10px;background:#f59e0b;color:#111827;text-decoration:none;font-weight:900}</style></head><body><div class='admin-badge'>🔐 ADMIN MODE · " + adminRole + "</div><main class='wrap'><a class='back' href='/admin/api-pool'>← API Pool管理へ戻る</a><div class='card'><div class='status " + (ok ? "ok" : "ng") + "'>" + title + "</div><div class='meta'>" + message + "<br>HTTP Status: " + esc(status) + (ok ? "" : "<br>対象: 領主ID " + esc(governorId)) + "</div>" + sourceDiagnostics + details + "<a class='btn' href='/admin/api-pool'>管理画面へ戻る</a></div></main></body></html>";
}

function parseHeaderNumber(headers, name) {
  const value = headers?.get?.(name);
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function handlePlayerVisibilityApi(request, env) {
  const guard = await requireOwner(request, env);
  if (guard.error) return guard.error;
  try {
    if (request.method === "GET") {
      return json({
        ok: true,
        settings: await getPlayerVisibilitySettings(env.DB),
        watchlist_limits: await getWatchlistLimits(env.DB)
      });
    }
    if (request.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);

    const body = await request.json().catch(() => ({}));

    if (body.action === "watchlist_limit") {
      const role = String(body.role || "").trim().toUpperCase();
      const kingdomLimit = Number(body.kingdom_limit);
      const playerLimit = Number(body.player_limit);

      if (!["BASIC", "ADVANCED", "VIP", "ADMIN", "OWNER"].includes(role) ||
          !Number.isInteger(kingdomLimit) || kingdomLimit < 0 || kingdomLimit > 1000 ||
          !Number.isInteger(playerLimit) || playerLimit < 0 || playerLimit > 5000) {
        return json({ ok: false, error: "INVALID_WATCHLIST_LIMIT" }, 400);
      }

      if (guard.auth.role === "ADMIN" && role === "OWNER") {
        return json({ ok: false, error: "OWNER_SETTING_REQUIRES_OWNER" }, 403);
      }

      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare(
        "UPDATE watchlist_limits SET kingdom_limit = ?, player_limit = ?, updated_at = ?, updated_by = ? WHERE role = ?"
      ).bind(kingdomLimit, playerLimit, now, guard.auth.user_id, role).run();
      watchlistLimitsCache = null;

      return json({
        ok: true,
        watchlist_limits: await getWatchlistLimits(env.DB)
      });
    }

    const itemKey = String(body.item_key || "").trim();
    const minRole = String(body.min_role || "").trim().toUpperCase();
    if (!PLAYER_VISIBILITY_ITEMS.some(item => item.key === itemKey)) {
      return json({ ok: false, error: "UNKNOWN_VISIBILITY_ITEM" }, 400);
    }
    if (!["BASIC", "ADVANCED", "VIP", "ADMIN", "OWNER"].includes(minRole)) {
      return json({ ok: false, error: "INVALID_MIN_ROLE" }, 400);
    }
    if (guard.auth.role === "ADMIN" && minRole === "OWNER") {
      return json({ ok: false, error: "OWNER_SETTING_REQUIRES_OWNER" }, 403);
    }

    const roleRank = { BASIC: 1, ADVANCED: 2, VIP: 3, ADMIN: 4, OWNER: 5 };
    const threshold = roleRank[minRole];
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      "UPDATE player_visibility_settings SET min_role = ?, basic_enabled = ?, advanced_enabled = ?, admin_enabled = ?, owner_enabled = ?, updated_at = ?, updated_by = ? WHERE item_key = ?"
    ).bind(
      minRole,
      threshold <= 1 ? 1 : 0,
      threshold <= 2 ? 1 : 0,
      threshold <= 3 ? 1 : 0,
      threshold <= 4 ? 1 : 0,
      now,
      guard.auth.user_id,
      itemKey
    ).run();

    return json({
      ok: true,
      settings: await getPlayerVisibilitySettings(env.DB),
      watchlist_limits: await getWatchlistLimits(env.DB)
    });
  } catch (error) {
    console.error("Player visibility settings error:", error);
    return json({ ok: false, error: error?.message || "PLAYER_VISIBILITY_UPDATE_FAILED" }, 400);
  }
}
async function renderPlayerVisibilityPage(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) {
    return "<!DOCTYPE html><html lang='ja'><body style='background:#0f172a;color:white;font-family:system-ui;padding:32px'><h1>管理者権限が必要です</h1></body></html>";
  }

  const settings = await getPlayerVisibilitySettings(env.DB);
  const watchlistLimits = await getWatchlistLimits(env.DB);
  const adminRole = guard.auth.role === "OWNER" ? "OWNER" : "ADMIN";

  const rows = settings.map(item => {
    const minRole = ["BASIC", "ADVANCED", "VIP", "ADMIN", "OWNER"].includes(String(item.min_role || "").toUpperCase())
      ? String(item.min_role).toUpperCase()
      : "OWNER";
    const options = ["BASIC", "ADVANCED", "VIP", "ADMIN", "OWNER"].map(role =>
      "<option value='" + role + "'" + (role === minRole ? " selected" : "") + ">" + role + "以上</option>"
    ).join("");
    const disabledOwner = guard.auth.role === "ADMIN" && minRole === "OWNER" ? " disabled" : "";
    return "<tr><td class='item-cell'><b>" + escapeHtml(item.category) + "</b><br><strong>" +
      escapeHtml(item.label) + "</strong><br><small>" + escapeHtml(item.description || "") +
      "</small></td><td class='role-cell'><select class='role-select' data-item='" +
      escapeHtml(item.item_key) + "'" + disabledOwner + ">" + options + "</select></td></tr>";
  }).join("");

  const watchlistLimitRows = watchlistLimits.map(item => {
    const role = String(item.role).toUpperCase();
    const disabled = guard.auth.role === "ADMIN" && role === "OWNER" ? " disabled" : "";
    return "<tr>" +
      "<td><strong>" + escapeHtml(role) + "</strong></td>" +
      "<td><input class='limit-input' type='number' min='0' max='1000' inputmode='numeric' data-role='" + escapeHtml(role) +
      "' data-type='kingdom' value='" + Number(item.kingdom_limit) + "'" + disabled + "></td>" +
      "<td><input class='limit-input' type='number' min='0' max='5000' inputmode='numeric' data-role='" + escapeHtml(role) +
      "' data-type='player' value='" + Number(item.player_limit) + "'" + disabled + "></td>" +
      "</tr>";
  }).join("");

  return "<!DOCTYPE html><html lang='ja'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'>" +
    "<title>EagleEye データ公開設定</title><style>" +
    ":root{color-scheme:dark}*{box-sizing:border-box}" +
    "body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}" +
    ".badge{display:inline-block;margin:8px 0 0;padding:7px 10px;border:1px solid #f59e0b;border-radius:999px;background:#241a08;color:#fbbf24;font-size:11px;font-weight:900;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".wrap{max-width:1050px;margin:auto;padding:56px 14px 30px}.back{color:#94a3b8;text-decoration:none}.title{font-size:28px;margin:12px 0 6px}" +
    ".hint{color:#94a3b8;font-size:13px;line-height:1.7}.card{margin-top:16px;padding:16px;border:1px solid #334155;border-radius:14px;background:#162238}" +
    ".card h2{margin:0 0 8px;font-size:19px}.scroll{width:100%;overflow:visible}@media(max-width:720px){table,thead,tbody,tr,th,td{display:block;width:100%}thead{display:none}tbody{display:grid;gap:10px}tr{border:1px solid #334155;border-radius:12px;background:#0b1220;padding:10px}td{display:grid;grid-template-columns:96px minmax(0,1fr);gap:10px;padding:7px 4px;border-bottom:1px solid #1e293b;white-space:normal;overflow-wrap:anywhere}td:last-child{border-bottom:0}.pool-actions{min-width:0;display:flex;flex-wrap:wrap;gap:6px;align-items:flex-start}.pool-actions:before{width:100%;flex:0 0 100%}.pool-actions form{margin:0}.pool-actions select{width:auto;margin:0}.pool-actions button{margin:0}.pool-error{max-width:none}.scroll{overflow:visible}}table{width:100%;border-collapse:collapse;min-width:0}" +
    "th,td{padding:11px 9px;border-bottom:1px solid #334155;text-align:left;vertical-align:middle}th:last-child,td:last-child{text-align:center;width:180px}" +
    "td small{color:#94a3b8;line-height:1.5}.role-select{width:170px;max-width:100%;padding:9px 30px 9px 10px;border:1px solid #475569;border-radius:10px;background:#0f172a;color:#f8fafc;font-weight:800}" +
    ".role-select:disabled,.limit-input:disabled{opacity:.5}.limit-input{width:100%;min-width:88px;padding:9px 10px;border:1px solid #475569;border-radius:10px;background:#0f172a;color:#f8fafc;font-weight:800;text-align:right}" +
    ".status{margin-top:10px;color:#86efac;font-size:13px;min-height:20px}.limit-note{margin-top:8px;color:#64748b;font-size:11px;line-height:1.6}" +
    "@media(max-width:720px){.wrap{padding:58px 10px 24px}.card{padding:12px}.scroll{overflow:visible}table{width:100%}th,td{padding:10px 6px}" +
    "th:last-child,td:last-child{width:120px}.role-select{width:112px;padding:8px;font-size:12px}.limit-input{min-width:70px;padding:8px 7px;font-size:13px}.title{font-size:24px}.badge{font-size:10px}}" +
    "</style></head><body><div class='badge'>🔐 " + adminRole + " · DATA VISIBILITY</div><main class='wrap'>" +
    "<a class='back' href='/'>← EagleEye</a><h1 class='title'>プレイヤーデータ公開設定</h1>" +
    "<div class='hint'>MightPulseから取得・保存するデータと、各ロールに表示するデータを分離しています。ここでは表示権限とウォッチリスト登録上限を変更できます。変更は即時反映されます。ADMINは「OWNERのみ」を設定できません。</div>" +
    "<div id='status' class='status'></div>" +
    "<section class='card'><div class='scroll'><table><thead><tr><th>項目</th><th>閲覧可能ロール</th></tr></thead><tbody>" + rows + "</tbody></table></div></section>" +
    "<section class='card'><h2>ウォッチリスト登録上限</h2>" +
    "<div class='hint'>ロールごとに「有効な登録数」の上限を設定します。王国ウォッチリストは定期ランキング取得、プレイヤーウォッチリストは監視・変更履歴の対象になるため、無制限登録を防ぎます。</div>" +
    "<div class='limit-note'>0を設定した場合は無制限です。D1/API負荷を抑える目的なら、各ロールに有限値を設定してください。</div>" +
    "<div class='scroll'><table><thead><tr><th>ロール</th><th>王国ウォッチリスト</th><th>プレイヤーウォッチリスト</th></tr></thead><tbody>" + watchlistLimitRows + "</tbody></table></div></section>" +
    "</main><script>(function(){function setStatus(text,error){var s=document.getElementById('status');s.textContent=text;s.style.color=error?'#fca5a5':'#86efac';}" +
    "document.querySelectorAll('select[data-item]').forEach(function(select){select.addEventListener('change',function(){var previous=select.value;select.disabled=true;" +
    "fetch('/api/admin/player-visibility',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({item_key:select.getAttribute('data-item'),min_role:select.value})})" +
    ".then(function(r){return r.json().then(function(d){if(!r.ok||d.ok===false)throw new Error(d.message||d.error||'更新失敗');return d;});})" +
    ".then(function(){setStatus('公開設定を保存しました。'+select.value+'以上が閲覧できます。',false);})" +
    ".catch(function(e){select.value=previous;setStatus('更新失敗: '+e.message,true);})" +
    ".finally(function(){select.disabled=false;});});});" +
    "document.querySelectorAll('.limit-input').forEach(function(input){input.addEventListener('change',function(){var role=input.getAttribute('data-role');" +
     "var group=Array.prototype.slice.call(document.querySelectorAll('.limit-input[data-role=\"'+role+'\"]'));var kingdom=0,player=0;" +
    "group.forEach(function(x){if(x.getAttribute('data-type')==='kingdom')kingdom=Number(x.value);if(x.getAttribute('data-type')==='player')player=Number(x.value);});" +
    "if(!Number.isInteger(kingdom)||kingdom<0||kingdom>1000||!Number.isInteger(player)||player<0||player>5000){setStatus('上限値が不正です。王国0〜1000、プレイヤー0〜5000で設定してください。',true);return;}" +
    "group.forEach(function(x){x.disabled=true;});" +
    "fetch('/api/admin/player-visibility',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'watchlist_limit',role:role,kingdom_limit:kingdom,player_limit:player})})" +
    ".then(function(r){return r.json().then(function(d){if(!r.ok||d.ok===false)throw new Error(d.message||d.error||'更新失敗');return d;});})" +
    ".then(function(){setStatus(role+'のウォッチリスト上限を保存しました。',false);})" +
    ".catch(function(e){setStatus('更新失敗: '+e.message,true);})" +
    ".finally(function(){group.forEach(function(x){x.disabled=false;});});});});}());</script></body></html>";
}
async function renderDataRetentionPage(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return "<!DOCTYPE html><html lang='ja'><body style='background:#0f172a;color:white;font-family:system-ui;padding:32px'><h1>管理者権限が必要です</h1></body></html>";
  const s = await getRetentionSettings(env.DB);
  const esc = escapeHtml;
  const options = (selected) => [
    [0, "永久保存"],
    [7, "7日"],
    [14, "14日"],
    [30, "30日"],
    [60, "60日"],
    [90, "90日"],
    [180, "180日"],
    [365, "1年"],
    [730, "2年"],
    [1095, "3年"],
    [1825, "5年"],
    [3650, "10年"]
  ].map(([v,l]) => "<option value='" + v + "'" + (Number(selected) === v ? " selected" : "") + ">" + l + "</option>").join("");
  const field = (name,label,hint) => "<label><span>" + esc(label) + "</span><select name='" + name + "'>" + options(s[name]) + "</select><small>" + esc(hint) + "</small></label>";
  const updated = s.updated_at ? formatUnix(s.updated_at) : "-";
  const adminRole = guard.auth.role === "OWNER" ? "OWNER" : "ADMIN";
  return "<!DOCTYPE html><html lang='ja'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>EagleEye データ保存期間</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.admin-badge{display:inline-block;margin-top:8px;padding:7px 10px;border:1px solid #f59e0b;border-radius:999px;background:#241a08;color:#fbbf24;font-size:11px;font-weight:900;letter-spacing:.6px;box-shadow:0 6px 20px rgba(0,0,0,.25)}.wrap{max-width:760px;margin:auto;padding:56px 16px 24px}.back{color:#94a3b8;text-decoration:none}.title{font-size:28px}.card{padding:18px;margin-top:14px;border:1px solid #334155;border-radius:14px;background:#162238}.hint{color:#94a3b8;font-size:13px;line-height:1.7}label{display:block;margin-top:14px}label span{display:block;font-weight:800;font-size:14px}select{width:100%;padding:12px;margin-top:7px;border-radius:9px;border:1px solid #334155;background:#0b1220;color:white}small{display:block;margin-top:5px;color:#94a3b8;line-height:1.5}button{margin-top:18px;padding:13px 17px;border:0;border-radius:9px;background:#f59e0b;color:#111827;font-weight:900;width:100%}.danger{border-color:#7f1d1d}.mono{font-family:ui-monospace,SFMono-Regular,monospace;font-size:12px}</style></head><body><div class='admin-badge'>🔐 ADMIN MODE · " + adminRole + "</div><main class='wrap'><a class='back' href='/admin/api-pool'>← API Pool管理へ戻る</a><h1 class='title'>データ保存期間</h1><div class='card'><b>自動クリーンアップ</b><div class='hint'>毎時の定期処理で古い履歴を少しずつ削除します。現在値・最新状態は維持します。「永久保存」を選ぶと、そのデータ種別は自動削除しません。</div><div class='mono' style='margin-top:10px'>最終設定更新: " + esc(updated) + "</div></div><form method='post' action='/api/admin/data-retention'><div class='card'>" +
    field("api_observations_days","API観測データ","MightPulseの生レスポンス。容量が最も増えやすいデータです。最新の対象データは保持します。") +
    field("player_snapshots_days","プレイヤースナップショット","プレイヤー状態の時系列履歴。") +
    field("ranking_snapshots_days","ランキングスナップショット","王国ランキングの順位・スコア履歴。") +
    field("player_rank_snapshots_days","プレイヤーランキング履歴","プレイヤー個人のランキング情報の履歴。") +
    field("change_events_days","変更イベント","順位変動・戦力変動などEagleEyeが検出した変更履歴。") +
    field("api_pool_usage_days","API Pool使用履歴","APIキーの利用・残量・結果の監査ログ。") +
    field("player_identity_history_days","プレイヤー名称履歴","プレイヤー名の初回確認・名称変更の履歴。R2へアーカイブして長期保存します。") +
    "<button type='submit'>保存期間を更新</button></div></form><div class='card'><b>推奨初期値</b><div class='hint'>API観測14日 / プレイヤー90日 / ランキング180日 / プレイヤーランキング180日 / 変更イベント2年 / API Pool使用90日 / プレイヤー名称履歴90日。R2アーカイブ対象はD1削除前に退避されます。</div></div></main></body></html>";
}

async function renderApiPoolAdminPage(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return "<!DOCTYPE html><html lang='ja'><body style='background:#0f172a;color:white;font-family:system-ui;padding:32px'><h1>管理者権限が必要です</h1></body></html>";
  const keys = await getApiPoolKeysWithContributors(env.DB);
  const stats = await getPoolStats(env.DB);
  const now = Math.floor(Date.now() / 1000);
  const users = await env.DB.prepare("SELECT user_id, discord_id, username, global_name FROM users WHERE status = 'ACTIVE' ORDER BY COALESCE(global_name, username, discord_id)").all();
  const keyJson = JSON.stringify(keys.map(k => ({
    ...k,
    key_fingerprint: k.key_fingerprint ? String(k.key_fingerprint).slice(0, 16) + "…" : null,
    api_key_prefix: k.api_key_prefix || null,
    last_error_message: k.last_error_message || null
  }))).replace(/</g, "\\u003c");
  const userJson = JSON.stringify(users.results || []).replace(/</g, "\\u003c");
  const statusClass = status => {
    const value = String(status || "").toUpperCase();
    return value === "AVAILABLE" ? "available" : value === "LEASED" ? "leased" : value === "COOLDOWN" ? "cooldown" : value === "ERROR" ? "error" : value === "REVOKED" ? "revoked" : "disabled";
  };
  const statusLabel = status => {
    const value = String(status || "").toUpperCase();
    return value === "AVAILABLE" ? "🟢 AVAILABLE" : value === "LEASED" ? "🔵 LEASED" : value === "COOLDOWN" ? "🟡 COOLDOWN" : value === "ERROR" ? "🔴 ERROR" : value === "REVOKED" ? "⚫ REVOKED" : "⚪ " + value;
  };
  const rows = keys.map(k => {
    const c = k.contributor || {};
    const isLeased = k.leased_until && Number(k.leased_until) > now;
    const status = isLeased ? "LEASED" : k.status;
    const mighty = String(k.mighty_check_status || "UNCONFIRMED").toUpperCase();
    const mightyConfirmed = mighty === "CONFIRMED" || Number(k.mighty_capable) === 1;
    const mightyInUse = Boolean(isLeased) && /MIGHTY/i.test(String(k.lease_purpose || ""));
    const mightyClass = mightyConfirmed ? (mightyInUse ? " mighty-confirmed mighty-in-use" : " mighty-confirmed") : "";
    const mightyLabel = mightyInUse ? "⚡ MIGHTY使用中" : mightyConfirmed ? "⚡ MIGHTY対応" : mighty === "NOT_MIGHTY" ? "通常キー" : "未確認";
    const detailStatus = statusLabel(status);
    const detailMighty = mightyConfirmed ? "⚡ Mighty対応" : mighty === "NOT_MIGHTY" ? "通常キー" : "未確認";
    const ownerControls = guard.auth.role === "OWNER" && k.pool_type === "USER_CONTRIBUTED" && k.status !== "REVOKED"
      ? "<div class='actions'><select data-reassign-user='" + escapeHtml(k.key_id) + "'><option value=''>提供者を変更…</option>" + users.results.map(u => "<option value='" + escapeHtml(u.user_id) + "'>" + escapeHtml(u.global_name || u.username || u.discord_id) + "</option>").join("") + "</select><button type='button' class='action' data-reassign-key='" + escapeHtml(k.key_id) + "'>提供者を変更</button></div>"
      : "";
    return "<details class='key-row " + statusClass(status) + mightyClass + "' data-key-id='" + escapeHtml(k.key_id) + "'>" +
      "<summary class='key-summary'>" +
        "<span class='key-main'><b>" + escapeHtml(c.governor_name || "領主未登録") + "</b><small>" + escapeHtml(c.global_name || c.username || c.discord_id || "提供者未登録") + (k.api_key_prefix ? " <span class='api-key-prefix'>" + escapeHtml(k.api_key_prefix) + "</span>" : "") + "</small></span>" +
        "<span class='key-meta'><span>" + escapeHtml(statusLabel(status)) + "</span><span>" + escapeHtml(k.pool_type) + "</span><span class='mighty-pill'>" + escapeHtml(mightyLabel) + "</span></span>" +
      "</summary>" +
      "<div class='key-detail-panel'><div class='detail-grid'>" +
        "<div class='detail-item'><small>状態</small><b>" + escapeHtml(detailStatus) + "</b></div>" +
        "<div class='detail-item'><small>Pool</small><b>" + escapeHtml(k.pool_type) + "</b></div>" +
        "<div class='detail-item'><small>提供者</small><b>" + escapeHtml(c.global_name || c.username || c.discord_id || "未登録") + "</b></div>" +
        "<div class='detail-item'><small>領主</small><b>" + escapeHtml(c.governor_name || "未登録") + "</b></div>" +
        "<div class='detail-item'><small>王国</small><b>" + escapeHtml(c.kingdom_id || "未登録") + "</b></div>" +
        "<div class='detail-item'><small>Discord ID</small><b>" + escapeHtml(c.discord_id || "未登録") + "</b></div>" +
        "<div class='detail-item'><small>Mighty</small><b>" + escapeHtml(detailMighty) + "</b></div>" +
        "<div class='detail-item'><small>判定日時</small><b>" + escapeHtml(k.mighty_checked_at ? new Date(Number(k.mighty_checked_at) * 1000).toLocaleString("ja-JP") : "-") + "</b></div>" +
        "<div class='detail-item'><small>推定残量 / 分</small><b>" + escapeHtml(k.remaining_minute ?? "-") + "</b></div>" +
        "<div class='detail-item'><small>推定残量 / 日</small><b>" + escapeHtml(k.remaining_day ?? "-") + "</b></div>" +
        "<div class='detail-item'><small>Lease用途</small><b>" + escapeHtml(k.lease_purpose || "-") + "</b></div>" +
        "<div class='detail-item'><small>Lease対象</small><b>" + escapeHtml(k.lease_target_type && k.lease_target_id ? k.lease_target_type + " / " + k.lease_target_id : "-") + "</b></div>" +
        "<div class='detail-item'><small>最終使用</small><b>" + escapeHtml(k.last_used_at ? new Date(Number(k.last_used_at) * 1000).toLocaleString("ja-JP") : "-") + "</b></div>" +
        "<div class='detail-item'><small>最終成功</small><b>" + escapeHtml(k.last_success_at ? new Date(Number(k.last_success_at) * 1000).toLocaleString("ja-JP") : "-") + "</b></div>" +
        "<div class='detail-item'><small>最終エラー</small><b>" + escapeHtml(k.last_error_code || "-") + "</b></div>" +
        "<div class='detail-item'><small>APIキー識別</small><b>" + escapeHtml(k.api_key_prefix || "-") + "</b></div>" +
        "<div class='detail-item'><small>Fingerprint</small><b>" + escapeHtml(k.key_fingerprint || "-") + "</b></div>" +
      "</div><div class='actions'><button type='button' class='action ok' data-mighty-check='" + escapeHtml(k.key_id) + "'>⚡ Mighty判定</button>" + (guard.auth.role === "OWNER" ? "<button type='button' class='action danger' data-delete-key='" + escapeHtml(k.key_id) + "'>🗑️ キーを削除</button>" : "") + "</div>" + ownerControls + "</div>" +
    "</details>";
  }).join("");
  const statText = stats.map(s => s.pool_type + ": " + s.status + "=" + s.count).join(" / ");
  return "<!DOCTYPE html><html lang='ja'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>EagleEye API Pool</title><style>" +
    ":root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.wrap{max-width:900px;margin:auto;padding:28px 14px 50px}.back{color:#94a3b8;text-decoration:none}.title{font-size:28px;margin:14px 0 4px}.hint{color:#94a3b8;font-size:13px;line-height:1.65}.card{padding:15px;margin-top:14px;border:1px solid #334155;border-radius:14px;background:#162238}.stats{font-size:12px;color:#cbd5e1;line-height:1.7}.key-list{display:grid;gap:8px;margin-top:12px}.key-row{width:100%;display:block;padding:0;border:1px solid #334155;border-radius:12px;background:#0b1220;color:#f8fafc;overflow:hidden}.key-row:hover{border-color:#64748b}.actions button[data-busy='1']{opacity:.6;cursor:wait}.key-summary{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px;cursor:pointer;list-style:none}.key-summary::-webkit-details-marker{display:none}.key-summary::after{content:'›';font-size:22px;color:#64748b;transition:transform .15s ease}.key-row[open] .key-summary::after{transform:rotate(90deg)}.key-detail-panel{padding:0 13px 13px;border-top:1px solid #26364d}.key-detail-panel .detail-grid{margin-top:12px}.key-row.available{border-left:4px solid #22c55e}.key-row.leased{border-left:4px solid #3b82f6;background:#101f3b}.key-row.cooldown{border-left:4px solid #eab308}.key-row.error{border-left:4px solid #ef4444;background:#241419}.key-row.revoked{opacity:.55}.key-row.mighty-confirmed{border-left:4px solid #f59e0b;background:linear-gradient(90deg,#2a210d 0%,#101827 62%);box-shadow:inset 0 0 0 1px rgba(245,158,11,.18)}.key-row.mighty-confirmed .mighty-pill{color:#fbbf24;border-color:#a16207;background:rgba(245,158,11,.10);font-weight:900}.key-row.mighty-in-use{border-left-color:#facc15;background:linear-gradient(90deg,#46320a 0%,#171b24 68%);box-shadow:inset 0 0 0 1px rgba(250,204,21,.38),0 0 14px rgba(245,158,11,.12)}.key-row.mighty-in-use .mighty-pill{color:#fde68a;border-color:#d97706;background:rgba(245,158,11,.22);font-weight:1000;animation:mightyPulse 1.6s ease-in-out infinite}@keyframes mightyPulse{0%,100%{box-shadow:0 0 0 rgba(245,158,11,0)}50%{box-shadow:0 0 10px rgba(245,158,11,.28)}}.key-main{min-width:0;display:flex;flex-direction:column;gap:3px}.key-main b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.key-main small{color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.api-key-prefix{display:inline-block;margin-left:7px;color:#cbd5e1;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;font-weight:700}.key-meta{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end;font-size:10px;color:#cbd5e1}.key-meta span{padding:4px 6px;border:1px solid #334155;border-radius:999px}.detail{display:none}.detail.show{display:block}.detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.detail-item{padding:9px;border-radius:9px;background:#0b1220;border:1px solid #26364d}.detail-item small{display:block;color:#64748b;font-size:10px}.detail-item b{display:block;margin-top:3px;overflow-wrap:anywhere}.danger{background:#7f1d1d!important;color:#fff!important}.ok{background:#166534!important;color:#fff!important}select,input{width:100%;padding:10px;margin-top:6px;border-radius:9px;border:1px solid #334155;background:#0b1220;color:#fff}button.action{padding:9px 12px;border:0;border-radius:9px;background:#f59e0b;color:#111827;font-weight:900;cursor:pointer}.actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.scroll{overflow:auto}@media(max-width:600px){.detail-grid{grid-template-columns:1fr}.key-summary{align-items:flex-start;flex-direction:column}.key-meta{justify-content:flex-start}.key-summary::after{position:absolute;right:28px;margin-top:0}.key-row{position:relative}}" +
    "</style></head><body><main class='wrap'><a class='back' href='/'>← EagleEye</a><h1 class='title'>API Pool 管理</h1><div class='hint'>一覧はスマホでも横スクロール不要。キーをタップすると詳細を表示します。MightPulseキーは照合用の先頭部分のみ表示します。 残量は公開仕様に残量ヘッダーの記載がないため、EagleEyeが記録した直近60秒・24時間のリクエスト数から算出する推定値です。</div>" +
    "<div class='card'><b>Pool Status</b><div class='stats'>" + escapeHtml(statText || "登録キーなし") + "</div></div>" +
    "<div class='card'><b>登録済みキー</b><div class='key-list'>" + (rows || "<div class='hint'>登録キーなし</div>") + "</div></div>" +
    "" +
    "<div class='card'><b>APIキー登録</b><div class='hint'>キー本体は暗号化保存され、画面には表示しません。</div><form method='post' action='/api/admin/api-pool/add'><label>Pool<select name='pool_type'><option>SYSTEM_GENERAL</option><option>SYSTEM_WATCHLIST</option><option>USER_CONTRIBUTED</option></select></label><label>ラベル<input name='label' placeholder='例: Main Key'></label><label>MightPulse API Key<input name='api_key' type='password' autocomplete='off' required></label><button class='action' type='submit'>登録</button></form></div>" +
    "<div class='card'><b>テスト</b><form method='get' action='/api/admin/api-pool/test-player'><label>領主ID<input name='governor_id' placeholder='223636495' required></label><button class='action' type='submit'>プレイヤーをPool経由で取得</button></form><form method='get' action='/api/admin/api-pool/test-ranking'><label>王国番号<input name='kid' placeholder='1524' required></label><label>ランキング<select name='board' required><option value='' selected disabled>ランキングを選択</option>" + KINGDOM_RANKING_BOARDS.map(board => "<option value='" + escapeHtml(board) + "'>" + escapeHtml(RANKING_BOARD_LABELS[board] || board) + "</option>").join("") + "</select></label><button class='action' type='submit'>王国ランキングをPool経由で取得</button></form></div>" +
    `<script>const KEYS=${keyJson}, USERS=${userJson}, NOW=${now}, IS_OWNER=${guard.auth.role === "OWNER" ? "true" : "false"};const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const detail=document.getElementById('detail'),body=document.getElementById('detailBody');function fmt(v){return v?new Date(Number(v)*1000).toLocaleString('ja-JP'):'-'}function status(v,lease){if(lease&&Number(lease)>NOW)return '🔵 LEASED';v=String(v||'');return v==='AVAILABLE'?'🟢 AVAILABLE':v==='COOLDOWN'?'🟡 COOLDOWN':v==='ERROR'?'🔴 ERROR':v==='REVOKED'?'⚫ REVOKED':'⚪ '+v}document.addEventListener('click',event=>{
  const mightyButton=event.target.closest('[data-mighty-check]');
  if(mightyButton){
    event.preventDefault();
    event.stopPropagation();
    mightyCheck(mightyButton.dataset.mightyCheck, mightyButton);
    return;
  }
  const reassignButton=event.target.closest('[data-reassign-key]');
  if(reassignButton){
    event.preventDefault();
    event.stopPropagation();
    reassign(reassignButton.dataset.reassignKey, reassignButton);
    return;
  }
  const deleteButton=event.target.closest('[data-delete-key]');
  if(deleteButton){
    event.preventDefault();
    event.stopPropagation();
    deleteKey(deleteButton.dataset.deleteKey, deleteButton);
    return;
  }
});
function setActionBusy(button, label){
  if(!button) return;
  if(button.dataset.busy === '1') return;
  button.dataset.busy = '1';
  button.disabled = true;
  button.setAttribute('aria-disabled','true');
  if(label) button.textContent = label;
}
async function mightyCheck(id,button){if(button?.dataset.busy==='1')return;if(!confirm('このキーでMighty判定を実行しますか？\\nMighty専用APIを1回呼び出します。'))return;setActionBusy(button,'⏳ 判定中…');try{const r=await fetch('/api/admin/api-pool/mighty-check',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({key_id:id})});const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok){alert(d.error||'Mighty判定に失敗しました');return}alert(d.mighty_capable?'⚡ Mighty対応キーです':'通常キーです');location.reload()}catch(e){alert('Mighty判定に失敗しました');}finally{if(button&&!document.hidden){button.disabled=false;button.dataset.busy='';button.removeAttribute('aria-disabled');}}}async function reassign(id,button){if(button?.dataset.busy==='1')return;const row=button?.closest('[data-key-id]');const select=row?.querySelector('[data-reassign-user]');const u=select?.value||'';if(!u){alert('変更先ユーザーを選択してください');return}if(!confirm('このAPIキーの提供者を変更しますか？'))return;setActionBusy(button,'⏳ 変更中…');try{const r=await fetch('/api/owner/api-pool/reassign',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({key_id:id,user_id:u})});const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok){alert(d.error||'変更に失敗しました');return}location.reload()}catch(e){alert('変更に失敗しました')}finally{if(button&&!document.hidden){button.disabled=false;button.dataset.busy='';button.removeAttribute('aria-disabled');}}};async function deleteKey(id,button){if(button?.dataset.busy==='1')return;if(!confirm('このAPIキーを完全に削除しますか？\\n\\nAPIキー本体だけでなく、このキーのリース情報・使用履歴も削除されます。'))return;setActionBusy(button,'⏳ 削除中…');try{const r=await fetch('/api/admin/api-pool/delete',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({key_id:id})});const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok){alert(d.message||d.error||'キーの削除に失敗しました');return}location.reload()}catch(e){alert('キーの削除に失敗しました')}finally{if(button&&!document.hidden){button.disabled=false;button.dataset.busy='';button.removeAttribute('aria-disabled');}}};</script></main></body></html>`;
}


async function fetchThroughWatchlistApiPool(env, {
  path,
  endpoint = path,
  targetType,
  targetId,
  purpose,
  include = null,
  query = null,
  traceId = null,
  parentTraceId = null,
  jobId = null,
  runId = null,
  reserveApiKeys = 0
}) {
  configureApiPoolEncryption(env.EAGLEEYE_SESSION_SECRET);
  const reserve = Math.max(0, Math.floor(Number(reserveApiKeys) || 0));
  let lease = null;
  let poolType = null;
  const requestStartedAt = Math.floor(Date.now() / 1000);
  const automaticPoolTypes = ["SYSTEM_WATCHLIST", "SYSTEM_GENERAL", "USER_CONTRIBUTED"];
  try {
    let lastNoKeyError = null;
    for (const candidatePoolType of automaticPoolTypes) {
      try {
        lease = await leaseApiKey(env.DB, {
          poolType: candidatePoolType,
          purpose,
          targetType,
          targetId,
          jobId,
          reserveAvailableKeys: reserve
        });
        poolType = candidatePoolType;
        break;
      } catch (error) {
        if (error?.message !== "NO_API_POOL_KEY_AVAILABLE") throw error;
        lastNoKeyError = error;
      }
    }
    if (!lease) {
      // The batch planner already checked pool availability. Avoid issuing a
      // second availability query for every failed concurrent request when
      // another feature claims the remaining keys between planning and leasing.
      const error = lastNoKeyError || new Error("NO_API_POOL_KEY_AVAILABLE");
      error.code = "NO_API_POOL_KEY_AVAILABLE";
      error.poolAvailability = null;
      error.userMessage = "現在、利用可能なMightPulse APIキーを確保できません。空きが回復するまで待機し、自動再試行します。";
      throw error;
    }

    const result = await mightPulseFetch(env, path, {
      query: query || (include ? { include } : undefined),
      apiKey: lease.api_key,
      traceId,
      parentTraceId,
      operation: purpose || "MIGHTPULSE_REQUEST",
      targetType,
      targetId,
      metadata: { runId, jobId, leaseId: lease.lease_id, poolType: lease.pool_type, endpoint }
    });

    await recordApiPoolSuccess(env.DB, {
      keyId: lease.key_id,
      leaseId: lease.lease_id,
      poolType: lease.pool_type,
      endpoint,
      targetType,
      targetId,
      purpose,
      jobId,
      httpStatus: result.status,
      requestCount: Math.max(1, Number(result.attempts) || 1),
      traceId,
      parentTraceId,
      runId,
      startedAt: requestStartedAt,
      completedAt: Math.floor(Date.now() / 1000),
      remainingMinute: parseHeaderNumber(result.headers, "x-ratelimit-remaining"),
      remainingDay: parseHeaderNumber(result.headers, "x-ratelimit-day-remaining")
    });

    return { result, pool_type: poolType, key_id: lease.key_id };
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
        endpoint,
        targetType,
        targetId,
        purpose,
        jobId,
        httpStatus: status,
        traceId,
        parentTraceId,
        runId,
        startedAt: requestStartedAt,
        completedAt: Math.floor(Date.now() / 1000),
        errorCode: error?.code || "MIGHTPULSE_REQUEST_FAILED",
        errorMessage: error?.message || null,
        cooldownSeconds: cooldown,
        disable,
        keepAvailable,
        requestCount: Math.max(1, Number(error?.attempts) || 1)
      });
    }
    throw error;
  }
}

async function fetchKingdomRankingThroughApiPool(env, kid, board, limit, purpose = "KINGDOM_WATCHLIST_RANKING", correlation = {}) {
  return fetchThroughWatchlistApiPool(env, {
    path: `/kingdoms/${encodeURIComponent(kid)}/ranks`,
    endpoint: "/kingdoms/:kid/ranks",
    targetType: "KINGDOM",
    targetId: String(kid),
    purpose,
    query: { board, limit },
    ...correlation
  });
}

async function fetchPlayerDetailThroughApiPool(env, governorId, purpose = "KINGDOM_WATCHLIST_PLAYER", correlation = {}) {
  return fetchThroughWatchlistApiPool(env, {
    path: `/players/${encodeURIComponent(governorId)}`,
    endpoint: "/players/:governor_id",
    targetType: "PLAYER",
    targetId: String(governorId),
    purpose,
    query: { include: "base,heroes,ranks,gov_gear" },
    ...correlation
  });
}

async function fetchPlayerThroughApiPool(env, governorId, purpose = "PLAYER_LOOKUP", include = "base") {
  if (!env.DB) throw new Error("DB_NOT_CONFIGURED");
  configureApiPoolEncryption(env.EAGLEEYE_SESSION_SECRET);

  const id = String(governorId || "").trim();
  if (!id) {
    const error = new Error("GOVERNOR_ID_REQUIRED");
    error.code = "GOVERNOR_ID_REQUIRED";
    error.status = 400;
    throw error;
  }

  let lease = null;
  let poolType = null;
  try {
    const automaticPoolTypes = ["SYSTEM_GENERAL", "USER_CONTRIBUTED"];
    let lastNoKeyError = null;
    for (const candidatePoolType of automaticPoolTypes) {
      try {
        lease = await leaseApiKey(env.DB, {
          poolType: candidatePoolType,
          purpose,
          targetType: "PLAYER",
          targetId: id
        });
        poolType = candidatePoolType;
        break;
      } catch (error) {
        if (error?.message !== "NO_API_POOL_KEY_AVAILABLE") throw error;
        lastNoKeyError = error;
      }
    }
    if (!lease) throw lastNoKeyError || new Error("NO_API_POOL_KEY_AVAILABLE");

    const result = await getMightPulsePlayer(env, id, {
      include: ["base","base,ranks","base,heroes,ranks,gov_gear"].includes(String(include)) ? String(include) : "base",
      apiKey: lease.api_key,
      metadata: { leaseId: lease.lease_id, poolType: lease.pool_type }
    });

    const observationEnvelopeData = observationEnvelope({
      endpoint: "/players/:governor_id",
      httpStatus: result.status,
      raw: result.data,
      sourceObservedAt: getMightPulseSourceTimestamp(result.data)
    });
    const savedObservation = await saveApiObservation(env.DB, observationEnvelopeData);
    const heroPayload = Array.isArray(result?.data?.heroes)
      ? result.data.heroes
      : Array.isArray(result?.data?.player?.heroes) ? result.data.player.heroes : [];
    if (heroPayload.length) {
      try {
        await queueHeroIconCandidates(env.DB, heroPayload, value => localizeHeroName(value));
      } catch (error) {
        console.error("hero_icon_queue_failed", error?.message || error);
      }
    }
    const observation = {
      ...observationEnvelopeData,
      observation_id: savedObservation.observation_id,
      payload: result.data
    };

    await recordApiPoolSuccess(env.DB, {
      keyId: lease.key_id,
      leaseId: lease.lease_id,
      poolType: lease.pool_type,
      endpoint: "/players/:governor_id",
      targetType: "PLAYER",
      targetId: id,
      purpose,
      httpStatus: result.status,
      requestCount: Math.max(1, Number(result.attempts) || 1),
      remainingMinute: parseHeaderNumber(result.headers, "x-ratelimit-remaining")
    });

    return { result, observation, key_id: lease.key_id };
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
        endpoint: "/players/:governor_id",
        targetType: "PLAYER",
        targetId: id,
        purpose,
        httpStatus: status,
        errorCode: error?.code || "MIGHTPULSE_REQUEST_FAILED",
        errorMessage: error?.message || null,
        cooldownSeconds: cooldown,
        disable,
        keepAvailable,
        requestCount: Math.max(1, Number(error?.attempts) || 1)
      });
    }
    throw error;
  }
}

async function handlePlayerApi(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (auth.status !== "ACTIVE") return json({ ok: false, error: "USER_DISABLED" }, 403);

  const url = new URL(request.url);
  const governorId = String(url.searchParams.get("governor_id") || "").trim();
  const refresh = url.searchParams.get("refresh") === "1";
  const rich = url.searchParams.get("rich") === "1";
  if (!governorId) return json({ ok: false, error: "GOVERNOR_ID_REQUIRED" }, 400);
  if (!env.DB) return json({ ok: false, error: "DB_NOT_CONFIGURED" }, 503);

  try {
    let player = await getPlayer(env.DB, governorId);
    let observation = await getLatestPlayerObservation(env.DB, governorId);
    let source = "D1";
    const richPayload = observation?.payload || {};
    const richPlayer = richPayload.player && typeof richPayload.player === "object" ? richPayload.player : richPayload;
    const hasHeroesPayload = Array.isArray(richPayload.heroes) || Array.isArray(richPlayer.heroes);
    const hasRanksPayload = Boolean((richPayload.ranks && typeof richPayload.ranks === "object") || (richPlayer.ranks && typeof richPlayer.ranks === "object"));
    const hasGovGearPayload = Boolean((richPayload.gov_gear && typeof richPayload.gov_gear === "object") || (richPlayer.gov_gear && typeof richPlayer.gov_gear === "object"));
    const needsRichProfile = !hasHeroesPayload || !hasRanksPayload || !hasGovGearPayload;
    const hasRichProfile = hasHeroesPayload && hasRanksPayload && hasGovGearPayload;
    const fetchRich = rich || refresh;

    if (!observation || refresh || (rich && needsRichProfile)) {
      const fetched = await fetchPlayerThroughApiPool(env, governorId, refresh ? "PLAYER_REFRESH" : (rich ? "PLAYER_RICH_LOOKUP" : "PLAYER_LOOKUP"), fetchRich ? "base,heroes,ranks,gov_gear" : "base");
      observation = fetched.observation;
      player = await materializePlayer(env.DB, observation, player, env.ARCHIVE, env.HISTORY_STORAGE_MODE);
      source = "MIGHTPULSE";
    } else if (!player || String(player.source_observation_id) !== String(observation.observation_id)) {
      player = await materializePlayer(env.DB, observation, player, env.ARCHIVE, env.HISTORY_STORAGE_MODE);
    }

    const visibilitySettings = await getPlayerVisibilitySettings(env.DB);
    const visiblePlayer = filterPlayerForRole(player, auth.role, observation.payload, visibilitySettings);
    const profile = filterPlayerProfileForRole(observation.payload, auth.role, visibilitySettings);
    if (visibilityEnabled(visibilitySettings, "base_identity", auth.role)) {
      profile.name_history = await getPlayerNameHistory(env.DB, governorId);
    }

    await trackServiceUsage(env, auth, refresh ? "PLAYER_REFRESH" : "PLAYER_VIEW", {
      targetType: "PLAYER",
      targetId: governorId,
      metadata: {
        source,
        kid: player?.kid,
        power: player?.power,
        town_center_level: player?.town_center_level,
        vip: player?.vip,
        alliance_aid: player?.alliance_aid,
        alliance_abbr: player?.alliance_abbr,
        alliance_name: player?.alliance_name,
        alliance_rank: player?.alliance_rank,
        kills: player?.kills,
        x: player?.x,
        y: player?.y,
        online: player?.online,
        observed_at: observation.observed_at,
        cached_at: observation.payload?.cached_at ?? null,
        age_seconds: observation.payload?.age_seconds ?? null
      }
    });
    return json({
      ok: true,
      player: visiblePlayer,
      profile,
      source,
      freshness: {
        provider: "MIGHTPULSE",
        fresh: observation.payload?.fresh ?? null,
        cached_at: observation.payload?.cached_at ?? null,
        age_seconds: observation.payload?.age_seconds ?? null,
        eagleeye_observed_at: observation.observed_at
      }
    });
  } catch (error) {
    console.error("Player API error:", error);
    const status = Number(error?.status || 0);
    if (error?.message === "NO_API_POOL_KEY_AVAILABLE") {
      return json({ ok: false, error: "NO_API_POOL_KEY_AVAILABLE" }, 503);
    }
    if (status === 404) return json({ ok: false, error: "PLAYER_NOT_FOUND" }, 404);
    if (status === 401) return json({ ok: false, error: "MIGHTPULSE_UNAUTHORIZED" }, 502);
    return json({
      ok: false,
      error: error?.code || "PLAYER_READ_FAILED"
    }, status >= 400 && status < 600 ? status : 502);
  }
}

async function handlePlayerRefresh(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") return json({ ok: false, error: "UNAUTHORIZED" }, 401);

  const url = new URL(request.url);
  const governorId = String(url.searchParams.get("governor_id") || "").trim();
  if (!governorId) return json({ ok: false, error: "GOVERNOR_ID_REQUIRED" }, 400);

  try {
    const visibilitySettings = await getPlayerVisibilitySettings(env.DB);
    const requestedInclude = String(url.searchParams.get("include") || "base");
    const requestedRich = requestedInclude === "base,heroes,ranks,gov_gear";
    const requestedRanks = requestedInclude === "base,ranks" || requestedRich;
    const ranksVisible = visibilityEnabled(visibilitySettings, "ranks_core", auth.role) || visibilityEnabled(visibilitySettings, "ranks_leaderboards", auth.role);
    const heroesVisible = ["heroes_list","heroes_skills","heroes_exclusive_gear","heroes_gear"].some(key => visibilityEnabled(visibilitySettings, key, auth.role));
    const gearVisible = visibilityEnabled(visibilitySettings, "gov_gear_list", auth.role) || visibilityEnabled(visibilitySettings, "gov_gear_gems", auth.role);
    const richVisible = heroesVisible || gearVisible;
    const include = requestedRich && richVisible ? "base,heroes,ranks,gov_gear" : requestedRanks && ranksVisible ? "base,ranks" : "base";
    const fetched = await fetchPlayerThroughApiPool(env, governorId, "PLAYER_REFRESH", include);
    const player = await materializePlayer(env.DB, fetched.observation, undefined, env.ARCHIVE, env.HISTORY_STORAGE_MODE);
    const payload = fetched.observation.payload || {};
    const rankPlayer = payload.player && typeof payload.player === "object" ? payload.player : payload;
    const ranks = rankPlayer.ranks || payload.ranks;
    let rankSnapshotSaved = false;
    const rankRefreshExpected = include.includes("ranks") && ranksVisible;
    if (rankRefreshExpected && ranks && typeof ranks === "object" && !Array.isArray(ranks) && Object.keys(ranks).length > 0) {
      await savePlayerRankSnapshot(env.DB, {
        governorId,
        uid: rankPlayer.uid ?? payload.uid ?? null,
        kid: rankPlayer.kid ?? payload.kid ?? player?.kid ?? null,
        ranks,
        observedAt: fetched.observation.observed_at,
        sourceObservedAt: fetched.observation.source_observed_at ?? null,
        sourceObservationId: fetched.observation.observation_id,
        archiveBucket: env.ARCHIVE,
        historyMode: env.HISTORY_STORAGE_MODE
      });
      rankSnapshotSaved = true;
    }
    await trackServiceUsage(env, auth, "PLAYER_REFRESH", {
      targetType: "PLAYER",
      targetId: governorId,
      metadata: {
        source: "MIGHTPULSE",
        refresh_reason: "EXPLICIT_REFRESH",
        new_observed_at: fetched.observation.observed_at,
        new_source_observed_at: fetched.observation.source_observed_at ?? null,
        upstream_fresh: fetched.observation.payload?.fresh ?? null,
        upstream_age_seconds: fetched.observation.payload?.age_seconds ?? null,
        kid: player?.kid,
        power: player?.power,
        town_center_level: player?.town_center_level,
        vip: player?.vip,
        alliance_aid: player?.alliance_aid,
        alliance_abbr: player?.alliance_abbr,
        alliance_name: player?.alliance_name,
        alliance_rank: player?.alliance_rank,
        kills: player?.kills,
        x: player?.x,
        y: player?.y,
        online: player?.online,
        observed_at: fetched.observation.observed_at,
        source_observed_at: fetched.observation.source_observed_at ?? null
      }
    });
    return json({
      ok: true,
      player: filterPlayerForRole(player, auth.role, fetched.observation.payload, visibilitySettings),
      profile: filterPlayerProfileForRole(fetched.observation.payload, auth.role, visibilitySettings),
      refreshed: true,
      requested_include: include,
      rank_snapshot_saved: rankSnapshotSaved,
      rank_refresh_expected: rankRefreshExpected,
      freshness: {
        provider: "MIGHTPULSE",
        fresh: fetched.observation.payload?.fresh ?? null,
        cached_at: fetched.observation.payload?.cached_at ?? null,
        age_seconds: fetched.observation.payload?.age_seconds ?? null,
        eagleeye_observed_at: fetched.observation.observed_at
      }
    });
  } catch (error) {
    console.error("Player refresh error:", error);
    const status = Number(error?.status || 0);
    if (error?.message === "NO_API_POOL_KEY_AVAILABLE") return json({ ok: false, error: "NO_API_POOL_KEY_AVAILABLE" }, 503);
    if (status === 404) return json({ ok: false, error: "PLAYER_NOT_FOUND" }, 404);
    return json({ ok: false, error: error?.code || "PLAYER_REFRESH_FAILED" }, status >= 400 && status < 600 ? status : 502);
  }
}

async function renderPlayerSearchPage(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") {
    return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EagleEye</title></head><body style="background:#050b14;color:#f1f8ff;font-family:system-ui;padding:32px"><h1>ログインが必要です</h1><a href="/api/auth/discord" style="color:#20c8e8">Discordでログイン</a></body></html>`;
  }

  const url = new URL(request.url);
  const q = String(url.searchParams.get("q") || "").trim();
  const requestedMode = String(url.searchParams.get("mode") || "all").toLowerCase();
  const allowedModes = new Set(["all", "kingdom", "governor", "name", "alliance"]);
  const mode = allowedModes.has(requestedMode) ? requestedMode : "all";
  const numericGovernorId = /^[0-9]{7,12}$/.test(q);
  let rows = [];

  if (q && env.DB) {
    const columns = "governor_id, nick_name, kid, power, town_center_level, alliance_name, alliance_abbr, avatar_url, alliance_rank, alliance_rank_label, observed_at";
    const like = `%${q}%`;
    let searchResult;
    if (mode === "governor") {
      searchResult = await env.DB.prepare(
        `SELECT ${columns} FROM players WHERE governor_id = ? ORDER BY power DESC LIMIT 30`
      ).bind(q).all();
    } else if (mode === "kingdom") {
      searchResult = await env.DB.prepare(
        `SELECT ${columns} FROM players WHERE CAST(kid AS TEXT) LIKE ? ORDER BY power DESC LIMIT 30`
      ).bind(like).all();
    } else if (mode === "name") {
      searchResult = await env.DB.prepare(
        `SELECT ${columns} FROM players WHERE nick_name LIKE ? ORDER BY power DESC LIMIT 30`
      ).bind(like).all();
    } else if (mode === "alliance") {
      searchResult = await env.DB.prepare(
        `SELECT ${columns} FROM players WHERE alliance_name LIKE ? OR alliance_abbr LIKE ? ORDER BY power DESC LIMIT 30`
      ).bind(like, like).all();
    } else if (numericGovernorId) {
      // In all-search mode, numeric input may be either an exact governor ID or a kingdom number.
      searchResult = await env.DB.prepare(
        `SELECT ${columns} FROM players
         WHERE governor_id = ? OR CAST(kid AS TEXT) LIKE ? OR nick_name LIKE ? OR alliance_name LIKE ? OR alliance_abbr LIKE ?
         ORDER BY power DESC LIMIT 30`
      ).bind(q, like, like, like, like).all();
    } else {
      searchResult = await env.DB.prepare(
        `SELECT ${columns} FROM players
         WHERE governor_id LIKE ? OR nick_name LIKE ? OR CAST(kid AS TEXT) LIKE ? OR alliance_name LIKE ? OR alliance_abbr LIKE ?
         ORDER BY power DESC LIMIT 30`
      ).bind(like, like, like, like, like).all();
    }
    rows = searchResult.results || [];
  }

  const results = rows.map(row => `
    <a class="player-result" href="/player?governor_id=${encodeURIComponent(row.governor_id)}">
      ${row.avatar_url ? '<img class="player-result-avatar ee-role-avatar" data-role="' + escapeHtml(normalizeAllianceRole(row.alliance_rank, row.alliance_rank_label) || "") + '" src="' + escapeHtml(normalizeProfileAssetUrl(row.avatar_url)) + '" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false">' : ''}
      <div class="player-result-avatar player-result-avatar-fallback ee-role-avatar" data-role="${escapeHtml(normalizeAllianceRole(row.alliance_rank, row.alliance_rank_label) || "")}" ${row.avatar_url ? 'hidden' : ''} aria-hidden="true">♟</div>
      <div class="player-result-main">
        <div class="player-result-name">${escapeHtml(row.nick_name || "Unknown Player")}</div>
        <div class="player-result-meta">領主ID ${escapeHtml(row.governor_id)} <span>·</span> 王国 ${escapeHtml(row.kid ?? "-")}</div>
        <div class="player-result-alliance">${escapeHtml(row.alliance_name || "同盟なし")}</div>
      </div>
      <div class="player-result-power"><span>POWER</span><strong>${escapeHtml(formatNumber(row.power))}</strong></div>
      <span class="player-result-arrow" aria-hidden="true">›</span>
    </a>`).join("");

  if (q) {
    await trackServiceUsage(env, auth, "PLAYER_SEARCH", {
      metadata: {
        search_type: mode.toUpperCase(),
        result_count: rows.length,
        result_has_match: rows.length > 0,
        selected_result: rows.length === 1 ? rows[0]?.governor_id ?? null : null,
        direct_lookup: mode === "governor" && numericGovernorId
      }
    });
  }

  const body = q
    ? (rows.length > 0
      ? `<div class="results-heading"><span>検索結果</span><strong>${rows.length}${rows.length === 30 ? "+" : ""} 件</strong></div>${results}`
      : (mode === "governor" && numericGovernorId
        ? `<a class="player-lookup" href="/player?governor_id=${encodeURIComponent(q)}"><span class="lookup-icon">↗</span><span><strong>領主ID ${escapeHtml(q)} を開く</strong><small>未登録の場合はAPIから自動取得して詳細を表示します</small></span><span class="lookup-arrow">→</span></a>`
        : `<div class="search-state"><span class="state-icon">⌕</span><strong>該当するプレイヤーが見つかりません</strong><p>${mode === "kingdom" ? "王国番号" : mode === "governor" ? "領主ID" : mode === "name" ? "領主名" : mode === "alliance" ? "同盟名・同盟タグ" : "領主ID・領主名・王国番号・同盟名・同盟タグ"}で、保存済みデータを検索します。</p></div>`))
    : `<section class="search-intro"><div class="search-intro-art"><img src="/assets/eagleeye/bjnyan/bjnyan-player-search.png" alt="プレイヤー情報を検索するBJにゃん" loading="eager"></div><div><strong>プレイヤーを探す</strong><p>領主名・領主ID・王国・同盟名から検索。</p><p class="search-intro-note">未登録の領主IDも自動取得。</p></div></section>`;

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#050b14"><title>EagleEye / Search</title><style>
  :root{color-scheme:dark;--bg:#050b14;--panel:#091827;--panel2:#0c2032;--line:#203b53;--cyan:#20c8e8;--muted:#8ba1b8;--text:#eff8ff}
  *{box-sizing:border-box}html{min-height:100%;background:var(--bg)}body{margin:0;min-height:100vh;background:linear-gradient(180deg,#071321 0%,var(--bg) 320px);color:var(--text);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
  .search-wrap{width:min(100%,860px);margin:0 auto;padding:22px 20px calc(108px + env(safe-area-inset-bottom))}
  .search-topline{display:flex;align-items:center;justify-content:space-between;padding:0 0 18px;border-bottom:1px solid rgba(45,76,103,.65)}
  .brand{font-size:17px;letter-spacing:3px;font-weight:950;color:var(--cyan)}.brand span{font-size:11px;letter-spacing:2px;color:#8298b0;margin-left:8px}
  .search-back{color:#8ba1b8;text-decoration:none;font-size:13px;font-weight:750;white-space:nowrap}
  .search-back:active{color:var(--cyan)}
  .search-heading{padding:24px 0 20px}.eyebrow{color:#6edff3;font-size:10px;font-weight:900;letter-spacing:2.2px}.title{margin:7px 0 7px;font-size:clamp(27px,6vw,34px);line-height:1.2;letter-spacing:.01em}.desc{margin:0;color:var(--muted);font-size:14px;line-height:1.6}
  .search-panel{padding:12px;border:1px solid var(--line);border-radius:19px;background:linear-gradient(145deg,rgba(12,32,50,.98),rgba(6,17,29,.98));box-shadow:0 12px 32px rgba(0,0,0,.12)}
  .search-form{display:flex;flex-direction:column;gap:10px}.search-modes{display:flex;flex-wrap:wrap;gap:7px}.search-mode{position:relative;cursor:pointer}.search-mode input{position:absolute;opacity:0;width:1px;height:1px}.search-mode span{display:block;padding:9px 11px;border:1px solid #29465f;border-radius:999px;background:#071321;color:#91a8bd;font-size:12px;font-weight:750;white-space:nowrap}.search-mode input:checked+span{border-color:var(--cyan);background:rgba(32,200,232,.13);color:#8deeff;box-shadow:inset 0 0 0 1px rgba(32,200,232,.12)}.search-mode input:focus-visible+span{outline:2px solid var(--cyan);outline-offset:2px}.search-input-row{display:flex;gap:9px}.search-input-row input{display:block;width:100%;min-width:0;height:52px;padding:0 14px;border-radius:12px;border:1px solid #2b4963;outline:none;background:#050e19;color:var(--text);font:600 16px/1.2 system-ui,-apple-system,sans-serif}.search-input-row input::placeholder{color:#6e849b;font-weight:450}.search-input-row input:focus{border-color:var(--cyan);box-shadow:0 0 0 3px rgba(32,200,232,.12)}
  .search-input-row button{flex:0 0 84px;border:1px solid #20c8e8;border-radius:12px;background:linear-gradient(180deg,#28d4ed,#12b6d7);color:#04121c;font-size:14px;font-weight:950;cursor:pointer}.search-input-row button:active{transform:scale(.98)}
  .search-tip{display:flex;gap:7px;align-items:flex-start;margin:10px 3px 0;color:#7f95ac;font-size:11px;line-height:1.5}.search-tip span{color:var(--cyan);font-weight:900}
  .results{margin-top:17px}.results-heading{display:flex;justify-content:space-between;align-items:center;margin:0 2px 10px;color:#9bb0c4;font-size:12px;font-weight:750}.results-heading strong{color:var(--cyan);font-variant-numeric:tabular-nums}
  .player-result{display:flex;align-items:center;gap:12px;margin-top:9px;padding:14px;border:1px solid var(--line);border-radius:15px;background:linear-gradient(135deg,#0b1d2e,#071321);color:var(--text);text-decoration:none;min-width:0}.player-result:active{border-color:var(--cyan);background:#0c2638}
  .player-result-avatar{width:54px;height:54px;flex:0 0 54px;border-radius:13px;object-fit:cover;background:#10243a;border:1px solid #31516f}.player-result-avatar-fallback{display:grid;place-items:center;color:var(--muted);font-size:25px}.player-result-avatar-fallback[hidden]{display:none}
  .player-result-main{flex:1;min-width:0}.player-result-name{font-size:15px;font-weight:850;overflow-wrap:anywhere}.player-result-meta,.player-result-alliance{margin-top:5px;color:var(--muted);font-size:11px;overflow-wrap:anywhere}.player-result-meta span{color:#3c5b75;padding:0 3px}
  .player-result-power{display:flex;flex-direction:column;align-items:flex-end;gap:3px;white-space:nowrap}.player-result-power span{font-size:8px;letter-spacing:1.3px;color:#6f879e;font-weight:900}.player-result-power strong{font-size:13px;color:var(--cyan);font-variant-numeric:tabular-nums}.player-result-arrow{font-size:24px;line-height:1;color:#6b849c}
  .player-lookup{display:flex;align-items:center;gap:12px;margin-top:16px;padding:17px;border:1px solid rgba(32,200,232,.48);border-radius:15px;background:linear-gradient(135deg,rgba(11,39,57,.98),rgba(6,20,33,.98));color:var(--text);text-decoration:none}.lookup-icon{display:grid;place-items:center;width:38px;height:38px;flex:0 0 38px;border:1px solid rgba(32,200,232,.35);border-radius:12px;color:var(--cyan);font-size:21px}.player-lookup>span:nth-child(2){flex:1;min-width:0}.player-lookup strong{display:block;font-size:14px}.player-lookup small{display:block;margin-top:5px;color:var(--muted);font-size:11px;line-height:1.5}.lookup-arrow{color:var(--cyan);font-size:21px;font-weight:900}
  .search-intro,.search-state{display:flex;align-items:center;gap:13px;margin-top:16px;padding:17px;border:1px solid var(--line);border-radius:16px;background:rgba(8,24,39,.78)}.search-intro-art{display:flex;align-items:center;justify-content:center;flex:0 0 112px;width:112px;min-width:0}.search-intro-art img{display:block;width:100%;height:auto;max-height:132px;object-fit:contain}.state-icon{display:grid;place-items:center;flex:0 0 38px;height:38px;border-radius:12px;background:rgba(32,200,232,.1);color:var(--cyan);font-size:24px}.search-intro strong,.search-state strong{font-size:14px}.search-intro p,.search-state p{margin:6px 0 0;color:var(--muted);font-size:12px;line-height:1.6}.search-intro-note{color:#6edff3!important}
  @media(max-width:520px){.search-wrap{padding:17px 18px calc(100px + env(safe-area-inset-bottom))}.search-topline{padding-bottom:14px}.brand{font-size:15px;letter-spacing:2.5px}.brand span{font-size:10px;margin-left:5px}.search-heading{padding:20px 0 16px}.title{font-size:28px}.desc{font-size:13px}.search-panel{padding:10px;border-radius:16px}.search-input-row{gap:8px}.search-input-row input{height:50px;padding:0 12px;font-size:16px}.search-input-row button{flex-basis:76px}.search-mode span{padding:8px 10px;font-size:11px}.player-result{padding:12px;gap:9px}.player-result-name{font-size:14px}.player-result-power strong{font-size:12px}.search-intro,.search-state{padding:14px;gap:10px}.search-intro-art{flex-basis:88px;width:88px}.search-intro-art img{max-height:104px}.search-intro p{font-size:11px}}
  </style></head><body><main class="search-wrap"><header class="search-topline"><div class="brand">EAGLEEYE<span>/ SEARCH</span></div><a class="search-back" href="/">← HOME</a></header><section class="search-heading"><div class="eyebrow">PLAYER DATABASE</div><h1 class="title">プレイヤー検索</h1><p class="desc">検索対象を選んで、領主・王国・同盟を探します。</p></section><section class="search-panel"><form class="search-form" method="get" action="/players"><div class="search-modes" role="radiogroup" aria-label="検索対象">
    <label class="search-mode"><input type="radio" name="mode" value="all" ${mode === "all" ? "checked" : ""}><span>全体検索</span></label>
    <label class="search-mode"><input type="radio" name="mode" value="kingdom" ${mode === "kingdom" ? "checked" : ""}><span>王国番号</span></label>
    <label class="search-mode"><input type="radio" name="mode" value="governor" ${mode === "governor" ? "checked" : ""}><span>領主ID</span></label>
    <label class="search-mode"><input type="radio" name="mode" value="name" ${mode === "name" ? "checked" : ""}><span>領主名</span></label>
    <label class="search-mode"><input type="radio" name="mode" value="alliance" ${mode === "alliance" ? "checked" : ""}><span>同盟名・タグ</span></label>
  </div><div class="search-input-row"><input name="q" value="${escapeHtml(q)}" placeholder="${mode === "all" ? "領主名 / 領主ID / 王国 / 同盟名・タグ" : mode === "kingdom" ? "王国番号を入力" : mode === "governor" ? "領主IDを入力" : mode === "name" ? "領主名を入力" : "同盟名またはタグを入力"}" aria-label="プレイヤー検索" autocomplete="off"><button type="submit">検索</button></div></form><div class="search-tip"><span>i</span><div>${mode === "governor" ? "領主IDは完全一致で検索します。未登録のIDは直接取得できます。" : mode === "kingdom" ? "王国番号だけを検索します。" : mode === "name" ? "領主名だけを検索します。" : mode === "alliance" ? "同盟名と同盟タグを検索します。" : "領主ID・領主名・王国番号・同盟名・同盟タグをまとめて検索します。"}</div></div></section><section class="results" aria-live="polite">${body}</section></main></body></html>`;
}

async function handlePlayerHistoryApi(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const url = new URL(request.url);
  const governorId = String(url.searchParams.get("governor_id") || "").trim();
  if (!governorId) return json({ ok: false, error: "GOVERNOR_ID_REQUIRED" }, 400);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 30), 1), 100);
  if (!env.DB) return json({ ok: false, error: "DB_NOT_CONFIGURED" }, 503);
  try {
    const visibilitySettings = await getPlayerVisibilitySettings(env.DB);
    const snapshots = await getPlayerHistory(env.DB, governorId, limit, env.ARCHIVE);
    await trackServiceUsage(env, auth, "PLAYER_HISTORY_VIEW", {
      targetType: "PLAYER",
      targetId: governorId,
      metadata: { limit, displayed_snapshot_count: snapshots.length }
    });
    const visibleSnapshots = snapshots.map(row => ({
      snapshot_id: row.snapshot_id,
      governor_id: row.governor_id,
      observation_id: row.observation_id,
      observed_at: row.observed_at,
      player: filterPlayerForRole(row.player || {}, auth.role, row.profile || {}, visibilitySettings),
      profile: filterPlayerProfileForRole(row.profile || {}, auth.role, visibilitySettings)
    }));
    return json({ ok: true, governor_id: governorId, snapshots: visibleSnapshots });
  } catch (error) {
    console.error("Player history API error:", error);
    return json({ ok: false, error: "PLAYER_HISTORY_READ_FAILED" }, 500);
  }
}



async function handlePlayerCompareRefreshCapacityApi(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") return json({ok:false,error:"UNAUTHORIZED"},401);
  if (!env.DB) return json({ok:false,error:"DB_NOT_CONFIGURED"},503);
  try {
    const availability = await getApiPoolAvailability(env.DB, {provider:"MIGHTPULSE",poolTypes:["SYSTEM_GENERAL","USER_CONTRIBUTED"]});
    const available = Math.max(0, Number(availability?.totals?.available || 0));
    return json({ok:true,available,reserved:1,usable:Math.max(0,available-1)});
  } catch (error) {
    console.error("player_compare_refresh_capacity_failed", error?.message || error);
    return json({ok:false,error:"API_POOL_CAPACITY_READ_FAILED"},503);
  }
}

async function handlePlayerCompareApi(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") return json({ok:false,error:"UNAUTHORIZED"},401);
  if (!env.DB) return json({ok:false,error:"DB_NOT_CONFIGURED"},503);
  const url = new URL(request.url);
  const ids = normalizeCompareGovernorIds(url.searchParams.getAll("governor_id"));
  if (ids.length < 2) return json({ok:false,error:"COMPARE_REQUIRES_TWO_PLAYERS",message:"比較するプレイヤーを2人以上選択してください。"},400);
  try {
    const visibility = await getPlayerVisibilitySettings(env.DB);
    const canReadCoreRanks = visibilityEnabled(visibility,"ranks_core",auth.role);
    const canReadLeaderboardRanks = visibilityEnabled(visibility,"ranks_leaderboards",auth.role);
    const from = Math.floor(Date.now()/1000)-30*86400;
    const players = await Promise.all(ids.map(async id => {
      const [raw, storedHistory, rankRows] = await Promise.all([
        env.DB.prepare("SELECT p.*, o.payload_json AS current_observation_payload_json FROM players p LEFT JOIN api_observations o ON o.observation_id = p.source_observation_id WHERE p.governor_id = ? LIMIT 1").bind(id).first(),
        getPlayerHistory(env.DB,id,30,env.ARCHIVE,env.HISTORY_STORAGE_MODE),
        (canReadCoreRanks || canReadLeaderboardRanks)
          ? getPlayerRankHistory(env.DB,{governorId:id,limit:1,archiveBucket:env.ARCHIVE,historyMode:env.HISTORY_STORAGE_MODE})
          : Promise.resolve([])
      ]);
      if (!raw) return {governor_id:id,missing:true};
      let observationPayload = {};
      try { observationPayload = JSON.parse(raw.current_observation_payload_json || "{}"); } catch {}
      const playerRow = { ...raw };
      delete playerRow.current_observation_payload_json;
      const player = filterPlayerForRole(playerRow,auth.role,{},visibility);
      const profile = filterPlayerProfileForRole(observationPayload,auth.role,visibility);
      const heroesVisible = ["heroes_list","heroes_skills","heroes_exclusive_gear","heroes_gear"].some(key => visibilityEnabled(visibility,key,auth.role));
      const gearVisible = visibilityEnabled(visibility,"gov_gear_list",auth.role) || visibilityEnabled(visibility,"gov_gear_gems",auth.role);
      const observationPlayer = observationPayload.player && typeof observationPayload.player === "object" ? observationPayload.player : observationPayload;
      const observedHeroes = Array.isArray(observationPayload.heroes) ? observationPayload.heroes : observationPlayer.heroes;
      const observedGovGear = observationPayload.gov_gear && typeof observationPayload.gov_gear === "object" ? observationPayload.gov_gear : observationPlayer.gov_gear;
      const profileNeedsRich = (heroesVisible && !Array.isArray(observedHeroes)) || (gearVisible && !(observedGovGear && Array.isArray(observedGovGear.items)));
      const snapshots = (storedHistory||[]).map(row=>({observed_at:row.observed_at,player:filterPlayerForRole(row.player||{},auth.role,row.profile||{},visibility)}));
      const latestRankRow = Array.isArray(rankRows) ? rankRows[0] : null;
      let leaderboardData = [];
      if (latestRankRow && canReadLeaderboardRanks) {
        if (Array.isArray(latestRankRow.leaderboards)) {
          leaderboardData = latestRankRow.leaderboards;
        } else {
          try {
            const parsed = JSON.parse(latestRankRow.leaderboards_json || "[]");
            if (Array.isArray(parsed)) leaderboardData = parsed;
          } catch {}
        }
      }
      const rankTypeBoardKeys = {3:"personal_power",4:"kills",5:"town_center",19:"migrant_score",20:"mystic_trial",21:"coliseum",22:"forest_of_life",23:"crystal_cave",24:"knowledge_nexus",25:"molten_fort",26:"radiant_spire"};
      const normalizeBoardKey = entry => {
        const rankType = Number(entry?.rank_type);
        if (rankTypeBoardKeys[rankType]) return rankTypeBoardKeys[rankType];
        const rawKey = String(entry?.key ?? entry?.board ?? entry?.id ?? entry?.name ?? entry?.label ?? "").toLowerCase().replace(/[^a-z0-9]/g,"");
        const aliases = {personalpower:"personal_power",killcount:"kills",towncenterlevel:"town_center",migrantscore:"migrant_score",mystictrial:"mystic_trial"};
        return aliases[rawKey] || rawKey;
      };
      if (canReadLeaderboardRanks && raw.kid != null && Number.isFinite(Number(raw.kid))) {
        const playerTargetIds = [...new Set([id, raw.uid, raw.fid].map(value => String(value ?? "").trim()).filter(Boolean))];
        const allianceTargetIds = raw.alliance_aid == null ? [] : [String(raw.alliance_aid).trim()].filter(Boolean);
        const queryBoards = allianceTargetIds.length
          ? KINGDOM_RANKING_BOARDS
          : KINGDOM_RANKING_BOARDS.filter(board => board !== "alliance_power" && board !== "alliance_kills");
        if (playerTargetIds.length) {
          const boardPlaceholders = queryBoards.map(() => "?").join(",");
          const playerPlaceholders = playerTargetIds.map(() => "?").join(",");
          const allianceClause = allianceTargetIds.length
            ? " OR (target_type = 'ALLIANCE' AND target_id IN (" + allianceTargetIds.map(() => "?").join(",") + "))"
            : "";
          const stored = await env.DB.prepare(
            "SELECT board, target_type, target_id, rank, score, observed_at, source_observed_at " +
            "FROM kingdom_ranking_current WHERE kid = ? AND board IN (" + boardPlaceholders + ") AND " +
            "((target_type = 'PLAYER' AND target_id IN (" + playerPlaceholders + "))" + allianceClause + ")"
          ).bind(Number(raw.kid), ...queryBoards, ...playerTargetIds, ...allianceTargetIds).all();
          const knownBoards = new Set(leaderboardData.map(normalizeBoardKey));
          for (const row of stored.results || []) {
            if (row.score == null || row.score === "") continue;
            const numericScore = Number(row.score);
            const scoreValue = Number.isFinite(numericScore) ? numericScore : String(row.score);
            const boardKey = String(row.board || "");
            if (row.target_type === "PLAYER") {
              if (knownBoards.has(boardKey)) {
                const existingIndex = leaderboardData.findIndex(entry => normalizeBoardKey(entry) === boardKey);
                if (existingIndex >= 0) {
                  const existing = leaderboardData[existingIndex];
                  if (existing.kingdom_rank == null && !existing.kingdom_rank_label && row.rank != null) {
                    leaderboardData[existingIndex] = {...existing, kingdom_rank:row.rank, kingdom_rank_label:"#"+row.rank, observed_at:existing.observed_at ?? row.observed_at, source_observed_at:existing.source_observed_at ?? row.source_observed_at};
                  }
                }
                continue;
              }
              leaderboardData.push({key:boardKey,board:boardKey,name:RANKING_BOARD_LABELS[boardKey] || boardKey,label:RANKING_BOARD_LABELS[boardKey] || boardKey,value:scoreValue,kingdom_rank:row.rank,kingdom_rank_label:row.rank == null ? null : "#"+row.rank,observed_at:row.observed_at ?? null,source_observed_at:row.source_observed_at ?? null,data_source:"KINGDOM_RANKING_CURRENT"});
              knownBoards.add(boardKey);
            } else if (row.target_type === "ALLIANCE") {
              const allianceKey = boardKey + "_alliance";
              if (leaderboardData.some(entry => String(entry.key || "") === allianceKey)) continue;
              const label = (RANKING_BOARD_LABELS[boardKey] || boardKey) + "（所属同盟）";
              leaderboardData.push({key:allianceKey,board:boardKey,name:label,label,value:scoreValue,kingdom_rank:row.rank,kingdom_rank_label:row.rank == null ? null : "#"+row.rank,observed_at:row.observed_at ?? null,source_observed_at:row.source_observed_at ?? null,data_source:"KINGDOM_RANKING_CURRENT",target_type:"ALLIANCE"});
            }
          }
        }
      }
      leaderboardData = leaderboardData.map(entry => {
        const boardKey = normalizeBoardKey(entry);
        const label = RANKING_BOARD_LABELS[boardKey];
        return label && !String(entry.key || "").endsWith("_alliance")
          ? {...entry,key:boardKey,name:label,label}
          : entry;
      });
      const rankings = latestRankRow || leaderboardData.length ? {
        observed_at: latestRankRow?.observed_at ?? null,
        source_observed_at: latestRankRow?.source_observed_at ?? null,
        ...(canReadCoreRanks && latestRankRow ? {
          power: latestRankRow.power ?? null, power_rank: latestRankRow.power_rank ?? null,
          kills: latestRankRow.kills ?? null, kills_rank: latestRankRow.kills_rank ?? null,
          town_center_level: latestRankRow.town_center_level ?? null, town_center_rank: latestRankRow.town_center_rank ?? null,
          migrant_score: latestRankRow.migrant_score ?? null, migrant_rank: latestRankRow.migrant_rank ?? null,
          mystic_trial: latestRankRow.mystic_trial ?? null, mystic_rank: latestRankRow.mystic_rank ?? null
        } : {}),
        leaderboards: leaderboardData
      } : null;
      const series = buildPlayerCompareSeries({playerHistory:snapshots,rankHistory:[],fromUnix:from});
      const history = series.power;
      const first = history[0], last = history[history.length-1];
      await trackServiceUsage(env,auth,"PLAYER_COMPARE_VIEW",{targetType:"PLAYER",targetId:id,metadata:{comparison_count:ids.length,history_days:30,rank_snapshot_available:!!latestRankRow}});
      return {governor_id:id,player,profile,profileNeedsRich,rankings,rankingsExpected:canReadCoreRanks||canReadLeaderboardRanks,history,rankHistory:[],period:{powerDelta:first&&last?last.power-first.power:null,observations:history.length}};
    }));
    return json({ok:true,players,period_days:30});
  } catch (error) {
    console.error("Player compare API error:",error);
    return json({ok:false,error:"PLAYER_COMPARE_READ_FAILED",message:"比較データを読み込めませんでした。時間をおいて再試行してください。"},500);
  }
}

async function renderPlayerComparePage(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") return json({ok:false,error:"UNAUTHORIZED"},401);
  const ids = normalizeCompareGovernorIds(new URL(request.url).searchParams.getAll("governor_id"));
  const initial = JSON.stringify(ids);
  const escSkill = value => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const html = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>プレイヤー比較 | EagleEye</title><style>'+
  ':root{color-scheme:dark;--bg:var(--ee-bg,#0a1424);--panel:var(--ee-panel,#0f2035);--raised:var(--ee-panel-raised,#172a40);--border:var(--ee-border-soft,#1d344d);--text:var(--ee-text,#e8f3ff);--sub:var(--ee-subtext,#91a7bf);--cyan:var(--ee-cyan,#22d3ee);--ring-1:var(--ee-cyan,#22d3ee);--ring-2:var(--ee-blue,#60a5fa);--ring-3:var(--ee-gold,#f0c75e);--ring-4:var(--ee-success,#22c55e)}:root[data-eagle-theme="light"]{--ring-1:var(--accent,var(--ee-cyan,#22d3ee));--ring-2:var(--accent-strong,var(--ee-blue,#60a5fa));--ring-3:var(--warning,var(--ee-gold,#f0c75e));--ring-4:var(--ok,var(--ee-success,#22c55e))}*{box-sizing:border-box}body{margin:0;padding:16px 12px 40px;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,sans-serif}.wrap{max-width:1100px;margin:auto}.back{display:inline-block;color:var(--cyan);text-decoration:none;font-weight:800;margin-bottom:14px}.head h1{font-size:24px;margin:0 0 6px}.sub,.count,.metric,.footnote{font-size:12px;color:var(--sub);line-height:1.6}.toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:18px 0}button{border:1px solid var(--border);border-radius:10px;background:var(--raised);color:var(--text);padding:11px 14px;font:inherit;font-size:13px;font-weight:800}.panel{background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:14px;margin:12px 0}.status{padding:22px;text-align:center;color:var(--sub)}.error{color:#ff8d96}.power-showcase{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px;margin:12px 0 18px}.power-card{display:flex;align-items:center;gap:14px;min-width:0;padding:14px;border:1px solid var(--border);border-radius:16px;background:linear-gradient(145deg,var(--panel),var(--raised));overflow:hidden}.power-ring{width:112px;height:112px;flex:0 0 112px;position:relative}.power-ring svg{display:block;width:100%;height:100%;overflow:visible}.ring-base,.ring-value{fill:none;stroke-width:8}.ring-base{stroke:var(--border)}.ring-value{stroke:var(--ring-color,var(--cyan));stroke-linecap:round;stroke-dasharray:263.9;stroke-dashoffset:263.9;transform:rotate(-90deg);transform-origin:50% 50%;transition:stroke-dashoffset 950ms cubic-bezier(.2,.7,.2,1),stroke .25s ease;filter:drop-shadow(0 0 4px color-mix(in srgb,var(--ring-color,var(--cyan)) 45%,transparent))}.power-ring.ready .ring-value{stroke-dashoffset:var(--ring-offset,0)}.ring-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;text-align:center}.ring-number{font-size:17px;font-weight:900;letter-spacing:-.04em;font-variant-numeric:tabular-nums}.ring-caption{font-size:9px;color:var(--sub)}.power-info{min-width:0;flex:1}.power-info .pname{font-size:14px;overflow-wrap:anywhere}.power-info .pid{font-size:11px;overflow-wrap:anywhere}.power-label{font-size:10px;color:var(--sub);margin-top:7px}.power-value{font-size:18px;font-weight:900;overflow-wrap:anywhere}.power-ratio{font-size:11px;color:var(--sub);margin-top:3px}.table-wrap{overflow:visible;border:0;border-radius:14px}.compare-table{width:100%;min-width:0;border-collapse:collapse;font-size:13px;table-layout:fixed}.compare-table th,.compare-table td{overflow-wrap:anywhere}.compare-table th:first-child{width:118px}.compare-controls{display:flex;flex-wrap:wrap;gap:7px;margin:8px 0 12px}.compare-controls label{display:flex;align-items:center;gap:6px;padding:8px 10px;border:1px solid var(--border);border-radius:10px;background:var(--raised);font-size:12px}.compare-controls input{accent-color:var(--cyan)}.compare-table th,.compare-table td{padding:12px;border-bottom:1px solid var(--border);text-align:left;vertical-align:middle}.compare-table th{background:var(--raised);min-width:0}.player-head{display:flex;align-items:center;gap:8px}.avatar{width:38px;height:38px;border-radius:9px;object-fit:cover;background:var(--raised)}.pname{font-weight:900}.pid{font-size:10px;color:var(--sub);margin-top:3px}.value{font-size:14px;font-weight:850;overflow-wrap:anywhere}.section-title{font-size:15px}.chart{display:flex;align-items:end;gap:4px;height:115px;padding:10px 2px 20px;border-bottom:1px solid var(--border)}.bar-group{flex:1;min-width:5px;height:100%;display:flex;align-items:end;position:relative}.bar{width:100%;min-height:2px;border-radius:3px 3px 0 0;background:var(--cyan)}.bar-label{position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);font-size:9px;color:var(--sub);white-space:nowrap}.compare-item-selector{margin:10px 0;padding:10px;border:1px solid var(--border);border-radius:12px;background:var(--panel)}.compare-item-selector summary{cursor:pointer;font-weight:800}.compare-item-actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.compare-item-actions button{padding:6px 9px;font-size:11px}.compare-item-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:6px;max-height:260px;overflow:auto}.compare-item-list label{display:flex;align-items:flex-start;gap:6px;font-size:11px;color:var(--sub);padding:5px;border:1px solid var(--border);border-radius:8px;overflow-wrap:anywhere}.compare-player-cards{display:none}.compare-player-card{border:1px solid var(--border);border-radius:14px;background:var(--panel);padding:12px;min-width:0}.compare-player-card-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}.compare-player-card-head img{width:34px;height:34px;border-radius:8px;object-fit:cover}.compare-player-metrics{display:grid;gap:0}.compare-metric{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:12px}.compare-metric span{color:var(--sub);overflow-wrap:anywhere}.compare-metric strong{font-size:12px;text-align:right;overflow-wrap:anywhere}.compare-metric small{grid-column:1/-1;color:var(--sub);font-size:10px}@media(max-width:480px){.power-card{padding:11px;gap:10px}.power-ring{width:94px;height:94px;flex-basis:94px}.ring-number{font-size:15px}.power-value{font-size:16px}.table-wrap{display:none}#hero-skill-catalog .table-wrap{display:block;overflow-x:auto}#hero-skill-catalog .compare-table{min-width:600px}.compare-player-cards{display:grid;grid-template-columns:1fr;gap:10px}.compare-player-card{padding:10px}.compare-metric{font-size:11px;gap:6px}.compare-metric strong{font-size:11px}}.mystic-section{isolation:isolate;position:relative;overflow:hidden;margin:14px 0 18px;padding:16px;border:1px solid #22d3ee55;border-radius:20px;background:radial-gradient(ellipse at 50% 0%,#22d3ee20,transparent 65%),linear-gradient(150deg,var(--panel),var(--raised));box-shadow:0 0 28px #22d3ee17}.mystic-title{text-align:center;font-size:15px;letter-spacing:.08em;font-weight:900;margin:0 0 12px}.mystic-card{--a:var(--ring-1);--b:var(--ring-2);position:relative;min-width:0;border:1px solid #22d3ee44;border-radius:16px;background:var(--panel);padding:12px 8px;text-align:center;overflow:hidden}.mystic-card.is-main{width:100%;max-width:460px;padding:16px 12px 14px;--a:#ffd166;--b:#ff5b35;border-color:#ff9a4277;box-shadow:0 0 30px #ff8a2422,inset 0 0 28px #ff8a2410}.mystic-card.is-sub{--a:#42d9ff;--b:#a18aff;padding:10px 6px}.mystic-name{font-size:13px;font-weight:900;line-height:1.3}.mystic-card.is-main .mystic-name{font-size:18px}.mystic-ring{position:relative;width:clamp(142px,45vw,190px);aspect-ratio:1;margin:6px auto 2px}.mystic-card.is-main .mystic-ring{width:clamp(205px,64vw,280px);margin:8px auto 4px}.mystic-ring svg{width:100%;height:100%;display:block;overflow:visible}.mystic-track,.mystic-arc{fill:none;stroke-width:7}.mystic-track{stroke:var(--border);opacity:.85}.mystic-arc{stroke-linecap:round;stroke-dasharray:565.49;stroke-dashoffset:565.49;transform:rotate(-90deg);transform-origin:50% 50%;filter:drop-shadow(0 0 5px currentColor);transition:stroke-dashoffset 1300ms cubic-bezier(.14,.8,.2,1)}.mystic-arc.a{stroke:var(--a);color:var(--a)}.mystic-arc.b{stroke:var(--b);color:var(--b);stroke-width:5}.mystic-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;pointer-events:none}.mystic-delta{font-size:clamp(20px,6vw,29px);font-weight:950;letter-spacing:-.05em;font-variant-numeric:tabular-nums}.mystic-card.is-main .mystic-delta{font-size:clamp(27px,8vw,38px)}.mystic-delta-label{font-size:10px;color:var(--sub)}.mystic-values{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:5px}.mystic-value{font-size:clamp(13px,3.7vw,17px);font-weight:900;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.mystic-value small{display:block;font-size:10px;font-weight:800;color:var(--sub);margin-bottom:2px}.mystic-value.a small{color:var(--a)}.mystic-value.b small{color:var(--b)}.mystic-ranks{font-size:10px;color:var(--sub);margin-top:3px}.mystic-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:10px}.mystic-card.is-sub .mystic-ring{width:clamp(104px,30vw,142px);margin:4px auto 0}.mystic-card.is-sub .mystic-track,.mystic-card.is-sub .mystic-arc{stroke-width:6}.mystic-card.is-sub .mystic-arc.b{stroke-width:4}.mystic-card.is-sub .mystic-delta{font-size:clamp(14px,4vw,20px)}.mystic-card.is-sub .mystic-delta-label,.mystic-card.is-sub .mystic-value small,.mystic-card.is-sub .mystic-ranks{font-size:9px}.mystic-card.is-sub .mystic-value{font-size:12px}.mystic-sparks{position:absolute;inset:0;pointer-events:none;overflow:hidden}.mystic-spark{position:absolute;left:50%;top:50%;width:3px;height:3px;border-radius:50%;background:var(--spark,#ffe29a);box-shadow:0 0 8px 2px var(--spark,#ffe29a);opacity:0;animation:mystic-spark-burst 850ms ease-out both;animation-delay:var(--delay,0ms)}.mystic-card.is-main .mystic-spark{width:4px;height:4px}.mystic-card.ignite.is-main{animation:mystic-impact 700ms cubic-bezier(.2,.8,.2,1) both}.mystic-card.ignite.is-main:after{content:\"\";position:absolute;inset:8%;border:1px solid #ffbd5a88;border-radius:50%;pointer-events:none;animation:mystic-shockwave 850ms ease-out both}.mystic-card.is-sub.ignite{animation:mystic-sub-impact 500ms ease-out both}@keyframes mystic-spark-burst{0%{transform:translate(-50%,-50%) rotate(var(--angle)) translateY(0) scale(1);opacity:0}12%{opacity:1}100%{transform:translate(-50%,-50%) rotate(var(--angle)) translateY(calc(-1 * var(--distance))) scale(.1);opacity:0}}@keyframes mystic-impact{0%{filter:brightness(1);transform:scale(.985)}24%{filter:brightness(1.65);transform:scale(1.012)}52%{filter:brightness(1.1);transform:scale(.998)}100%{filter:brightness(1);transform:scale(1)}}@keyframes mystic-sub-impact{0%{filter:brightness(1)}35%{filter:brightness(1.5)}100%{filter:brightness(1)}}@keyframes mystic-shockwave{0%{transform:scale(.72);opacity:.9}100%{transform:scale(1.18);opacity:0}}@media(min-width:620px){.mystic-section{padding:20px}.mystic-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.mystic-card.is-sub .mystic-ring{width:clamp(110px,15vw,145px)}}@media(prefers-reduced-motion:reduce){.mystic-spark,.mystic-card,.mystic-card:after{animation:none!important}.mystic-arc{transition:none}}@media(prefers-reduced-motion:reduce){.ring-value{transition:none}}@media(min-width:760px){body{padding:26px}.panel{padding:20px}}'+
  '</style></head><body><main class="wrap"><a class="back" href="/watchlist">← プレイヤーウォッチリストへ戻る</a><header class="head"><h1>プレイヤー比較</h1><div class="sub">2〜4人を横並びで比較します。推移は保存済みの過去30日データのみを使用します。</div></header><div class="toolbar"><span class="count" id="count"></span><button id="retry">再読み込み</button><button id="refresh">最新データで比較</button></div><div id="content" class="panel"><div class="status">比較データを読み込み中…</div></div></main><script>(function(){var startedAt=Date.now();var timer=setInterval(function(){var box=document.getElementById("content");if(!box){clearInterval(timer);return}var status=box.querySelector(".status");if(status&&status.textContent.trim()==="比較データを読み込み中…"){if(Date.now()-startedAt>=5000){status.className="status error";status.textContent="比較画面の初期化が完了しませんでした。JavaScriptエラーまたは古い画面データの可能性があります。再読み込みしてください。";clearInterval(timer)}}else{clearInterval(timer)}},1000);window.addEventListener("error",function(){var box=document.getElementById("content");var status=box&&box.querySelector(".status");if(status&&status.textContent.trim()==="比較データを読み込み中…"){status.className="status error";status.textContent="比較画面のJavaScript初期化エラーを検出しました。再読み込みしてください。";clearInterval(timer)}})})();</script><script>(function(){const ids='+initial+';const box=document.getElementById("content"),count=document.getElementById("count"),retry=document.getElementById("retry");'+
  'const esc=v=>String(v==null?"—":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(new RegExp(String.fromCharCode(34),"g"),"&quot;").split(String.fromCharCode(39)).join("&#39;");const num=v=>v==null||v===""||!Number.isFinite(Number(v))?"—":Number(v).toLocaleString("ja-JP");const compact=v=>{if(v==null||!Number.isFinite(Number(v)))return "—";const n=Number(v),a=Math.abs(n);return a>=1e9?(n/1e9).toFixed(1)+"B":a>=1e6?(n/1e6).toFixed(1)+"M":a>=1e3?(n/1e3).toFixed(1)+"K":num(n)};const date=v=>v?new Date(Number(v)*1000).toLocaleDateString("ja-JP",{month:"numeric",day:"numeric"}):"";'+
  "function render(d){box.querySelectorAll('.status').forEach(el=>el.remove());const ps=d.players||[];const observed=ps.filter(p=>!p.missing&&Number(p.player&&p.player.observed_at)>0).map(p=>Number(p.player.observed_at));const oldest=observed.length?Math.min.apply(null,observed):0;count.textContent=ps.length+\"人を比較中 · 過去30日 · 最終取得 \"+(oldest?new Date(oldest*1000).toLocaleString(\"ja-JP\"):\"日時不明\");const fields=[[\"戦力\",\"power\",compact],[\"役場レベル\",\"town_center_level\",num],[\"VIP\",\"vip\",num],[\"撃破数\",\"kills\",compact],[\"王国\",\"kid\",num],[\"同盟略称\",\"alliance_abbr\",v=>v||\"—\"],[\"同盟名\",\"alliance_name\",v=>v||\"—\"],[\"同盟役職\",\"alliance_rank_label\",v=>v||\"—\"],[\"座標 X\",\"x\",num],[\"座標 Y\",\"y\",num]];let h=\"<div class=\\\"table-wrap\\\"><table class=\\\"compare-table\\\"><thead><tr><th>比較項目</th>\"+ps.map(p=>\"<th><div class=\\\"player-head\\\">\"+(p.player&&p.player.avatar_url?\"<img class=\\\"avatar\\\" src=\\\"\"+esc(p.player.avatar_url)+\"\\\" alt=\\\"\\\" loading=\\\"lazy\\\">\":\"<div class=\\\"avatar\\\"></div>\")+\"<div><div class=\\\"pname\\\">\"+esc(p.player&&p.player.nick_name||\"データなし\")+\"</div><div class=\\\"pid\\\">ID \"+esc(p.governor_id)+\"</div></div></div></th>\").join(\"\")+\"</tr></thead><tbody>\";fields.forEach(f=>{h+=\"<tr><th>\"+f[0]+\"</th>\"+ps.map(p=>\"<td><span class=\\\"value\\\">\"+esc(p.missing?\"データなし\":f[2](p.player&&p.player[f[1]]))+\"</span></td>\").join(\"\")+\"</tr>\"});const coreRankRows=[];const coreRankScoreRows=[];const rankTypeBoardKeys={3:\"personal_power\",4:\"kills\",5:\"town_center\",19:\"migrant_score\",20:\"mystic_trial\",21:\"coliseum\",22:\"forest_of_life\",23:\"crystal_cave\",24:\"knowledge_nexus\",25:\"molten_fort\",26:\"radiant_spire\"};const boardNameAliases={personalpower:\"personal_power\",killcount:\"kills\",towncenterlevel:\"town_center\",migrantscore:\"migrant_score\",mystictrial:\"mystic_trial\"};const leaderboardRows=new Map();ps.forEach(p=>{const lists=[p.rankings&&p.rankings.leaderboards,p.profile&&p.profile.leaderboards,p.player&&p.player.leaderboards];lists.forEach(list=>{if(!Array.isArray(list))return;list.forEach(board=>{if(!board||typeof board!==\"object\")return;const label=String(board.label??board.name??board.board_name??board.key??board.board??board.id??\"\").trim();if(!label)return;const rawScore=board.value??board.score??board.rank_value??board.points;if(rawScore==null||rawScore===\"\")return;const numericScore=Number(rawScore);const displayScore=Number.isFinite(numericScore)?numericScore:String(rawScore);const rawBoardKey=String(board.key??board.board??board.id??board.name??label).toLowerCase().replace(/[^a-z0-9]/g,\"\");const key=rankTypeBoardKeys[Number(board.rank_type)]||boardNameAliases[rawBoardKey]||rawBoardKey||label;if(!leaderboardRows.has(key))leaderboardRows.set(key,{label,byId:{}});leaderboardRows.get(key).byId[p.governor_id]={...board,value:displayScore};})})});leaderboardRows.forEach(row=>{h+=\"<tr><th>\"+esc(\"ランキング：\"+row.label)+\"</th>\"+ps.map(p=>{const board=row.byId[p.governor_id];if(!board)return \"<td>—</td>\";const score=board.value??board.score??board.rank_value;const rank=board.kingdom_rank??board.rank??board.ranking;const rankLabel=rank!=null?num(rank):(board.kingdom_rank_label||\"\");const meta=[];if(rankLabel)meta.push(\"王国内順位 \"+rankLabel+(p.player&&p.player.kid!=null?\"（王国 \"+num(p.player.kid)+\"）\":\"\"));if(board.observed_at)meta.push(\"EagleEye保存 \"+new Date(Number(board.observed_at)*1000).toLocaleString(\"ja-JP\"));const formattedScore=score==null?\"—\":Number.isFinite(Number(score))?compact(score):String(score);const display=board.value_label||formattedScore;const apiNote=board.value_label&&score!=null?\"<div class=\\\"metric\\\">API値 \"+esc(formattedScore)+\"</div>\":\"\";return \"<td><span class=\\\"value\\\">\"+esc(display)+\"</span>\"+apiNote+(meta.length?\"<div class=\\\"metric\\\">\"+esc(meta.join(\" · \"))+\"</div>\":\"\")+\"</td>\"}).join(\"\")+\"</tr>\"});const heroRows=new Map();ps.forEach(p=>{(Array.isArray(p.profile&&p.profile.heroes)?p.profile.heroes:[]).forEach(hero=>{const key=String(hero&&(hero.id??hero.name)||\"\").trim();if(!key)return;if(!heroRows.has(key))heroRows.set(key,{label:String(hero.name||hero.id||key),byId:{}});heroRows.get(key).byId[p.governor_id]=hero})});heroRows.forEach(row=>{h+=\"<tr><th>\"+esc(\"闘技場防衛編成：\"+row.label)+\"</th>\"+ps.map(p=>{const hero=row.byId[p.governor_id];if(!hero)return \"<td>—</td>\";const parts=[];if(hero.level!=null)parts.push(\"Lv.\"+hero.level);if(hero.star!=null||hero.stars!=null)parts.push(\"★\"+(hero.star??hero.stars));if(hero.exclusive_gear_level!=null)parts.push(\"専用装備 \"+hero.exclusive_gear_level);return \"<td>\"+esc(parts.join(\" · \")||\"データなし\")+\"</td>\"}).join(\"\")+\"</tr>\"});const heroGearRows=new Map();ps.forEach(p=>{(Array.isArray(p.profile&&p.profile.heroes)?p.profile.heroes:[]).forEach(hero=>{const heroKey=String(hero&&(hero.id??hero.name)||\"\").trim();const heroLabel=String(hero&& (hero.name||hero.id)||heroKey);(Array.isArray(hero&&hero.gear)?hero.gear:[]).forEach(item=>{const slot=String(item&&(item.slot??item.sid??item.name)||\"\").trim();if(!slot)return;const key=heroKey+\"::\"+slot;if(!heroGearRows.has(key))heroGearRows.set(key,{label:heroLabel+\" / \"+slot,byId:{}});heroGearRows.get(key).byId[p.governor_id]=item;});});});heroGearRows.forEach(row=>{h+=\"<tr><th>\"+esc(\"防衛編成装備：\"+row.label)+\"</th>\"+ps.map(p=>{const item=row.byId[p.governor_id];if(!item)return \"<td>装備情報なし</td>\";const parts=[];if(item.name)parts.push(String(item.name));if(item.quality_label||item.quality)parts.push(String(item.quality_label||item.quality));if(item.enhancement_level!=null)parts.push(\"強化 +\"+item.enhancement_level);if(item.refine_level!=null)parts.push(\"精錬 \"+item.refine_level);if(item.gear_level!=null)parts.push(\"装備Lv. \"+item.gear_level);if(item.red===true)parts.push(\"赤装備\");if(item.troop_label||item.troop)parts.push(String(item.troop_label||item.troop));return \"<td>\"+esc(parts.join(\" · \")||\"データなし\")+\"</td>\";}).join(\"\")+\"</tr>\"});const heroSkillRows=new Map();ps.forEach(p=>{(Array.isArray(p.profile&&p.profile.heroes)?p.profile.heroes:[]).forEach(hero=>{const heroKey=String(hero&&(hero.id??hero.name)||\"\").trim();const heroLabel=String(hero&&(hero.name||hero.id)||heroKey);(Array.isArray(hero&&hero.skill_levels)?hero.skill_levels:[]).forEach(skill=>{const skillKey=String(skill&&(skill.id??skill.name)||\"\").trim();if(!skillKey)return;const key=heroKey+\"::\"+skillKey;if(!heroSkillRows.has(key))heroSkillRows.set(key,{label:heroLabel+\" / \"+skillKey,byId:{}});heroSkillRows.get(key).byId[p.governor_id]=skill;});});});heroSkillRows.forEach(row=>{h+=\"<tr><th>\"+esc(\"英雄スキル：\"+row.label)+\"</th>\"+ps.map(p=>{const skill=row.byId[p.governor_id];if(!skill)return \"<td>スキル情報なし</td>\";return \"<td>\"+esc(skill.level==null?\"データなし\":\"Lv. \"+skill.level)+\"</td>\"}).join(\"\")+\"</tr>\"});const heroExclusiveRows=new Map();ps.forEach(p=>{(Array.isArray(p.profile&&p.profile.heroes)?p.profile.heroes:[]).forEach(hero=>{const key=String(hero&&(hero.id??hero.name)||\"\").trim();if(!key)return;const gear=hero.exclusive_gear;const level=hero.exclusive_gear_level;if((gear==null)&&(level==null))return;if(!heroExclusiveRows.has(key))heroExclusiveRows.set(key,{label:String(hero.name||hero.id||key),byId:{}});heroExclusiveRows.get(key).byId[p.governor_id]={gear,level};});});heroExclusiveRows.forEach(row=>{h+=\"<tr><th>\"+esc(\"専用装備：\"+row.label)+\"</th>\"+ps.map(p=>{const entry=row.byId[p.governor_id];if(!entry)return \"<td>専用装備情報なし</td>\";const gear=entry.gear;const parts=[];if(gear&&gear.name)parts.push(String(gear.name));const level=gear&&gear.level!=null?gear.level:entry.level;if(level!=null)parts.push(\"Lv. \"+level);if(gear&&gear.slot!=null)parts.push(\"スロット \"+gear.slot);if(gear&&gear.atk_ratio!=null)parts.push(\"攻撃補正 \"+gear.atk_ratio);if(gear&&gear.hp_ratio!=null)parts.push(\"HP補正 \"+gear.hp_ratio);if(gear&&gear.def_ratio!=null)parts.push(\"防御補正 \"+gear.def_ratio);if(gear&&gear.power_ratio!=null)parts.push(\"戦力補正 \"+gear.power_ratio);if(gear&&Array.isArray(gear.slg_attr)&&gear.slg_attr.length)parts.push(\"SLG属性 \"+gear.slg_attr.length+\"件\");if(gear==null&&level!=null)parts.push(\"詳細未提供\");return \"<td>\"+esc(parts.join(\" · \")||\"未取得\")+\"</td>\";}).join(\"\")+\"</tr>\"});const gearRows=new Map();ps.forEach(p=>{(Array.isArray(p.profile&&p.profile.gov_gear&&p.profile.gov_gear.items)?p.profile.gov_gear.items:[]).forEach(item=>{const key=String(item&&(item.slot??item.id??item.name)||\"\").trim();if(!key)return;if(!gearRows.has(key))gearRows.set(key,{label:key,byId:{}});gearRows.get(key).byId[p.governor_id]=item})});gearRows.forEach(row=>{h+=\"<tr><th>\"+esc(\"領主装備：\"+row.label)+\"</th>\"+ps.map(p=>{const item=row.byId[p.governor_id];if(!item)return \"<td>—</td>\";const parts=[];if(item.quality!=null)parts.push(String(item.quality));if(item.tier!=null)parts.push(\"T\"+item.tier);if(item.star!=null)parts.push(\"★\"+item.star);if(item.strength_level!=null)parts.push(\"強化 \"+item.strength_level);if(item.score!=null)parts.push(\"スコア \"+compact(item.score));if(item.combat!=null)parts.push(\"戦闘力 \"+compact(item.combat));if(Array.isArray(item.gems)&&item.gems.length)parts.push(\"宝石 \"+item.gems.length);return \"<td>\"+esc(parts.join(\" · \")||\"データなし\")+\"</td>\"}).join(\"\")+\"</tr>\"});h+=\"<tr><th>30日間の戦力変化</th>\"+ps.map(p=>\"<td><span class=\\\"value\\\">\"+(p.period&&p.period.powerDelta!=null?((p.period.powerDelta>0?\"+\":\"\")+esc(compact(p.period.powerDelta))):\"—\")+\"</span><div class=\\\"metric\\\">\"+esc(p.period&&p.period.observations||0)+\"件の履歴</div></td>\").join(\"\")+\"</tr></tbody></table></div><section class=\\\"panel\\\"><h2 class=\\\"section-title\\\">戦力推移（30日）</h2>\";const active=ps.filter(p=>!p.missing&&(p.history||[]).length>1);if(!active.length)h+=\"<div class=\\\"status\\\">比較できる履歴がまだありません。履歴が蓄積するとここに推移を表示します。</div>\";else{const vals=active.flatMap(p=>p.history.map(x=>Number(x.power))).filter(Number.isFinite),lo=Math.min.apply(null,vals),hi=Math.max.apply(null,vals),range=hi-lo||1;active.forEach(p=>{h+=\"<div class=\\\"metric\\\">\"+esc(p.player.nick_name||p.governor_id)+\" · \"+p.history.length+\"件</div><div class=\\\"chart\\\">\"+p.history.slice(-30).map((x,i,a)=>\"<div class=\\\"bar-group\\\"><div class=\\\"bar\\\" title=\\\"\"+esc(date(x.observed_at)+\" · \"+compact(x.power))+\"\\\" style=\\\"height:\"+Math.max(3,(Number(x.power)-lo)/range*100)+\"%\\\"></div>\"+(i===0||i===a.length-1?\"<span class=\\\"bar-label\\\">\"+esc(date(x.observed_at))+\"</span>\":\"\")+\"</div>\").join(\"\")+\"</div>\"})}h+=\"<div class=\\\"footnote\\\">保存済みデータを使用し、比較のための外部API追加取得は行いません。未取得の項目は「—」で表示します。</div></section>\";function addMysticTrialComparison(players){const boards=[[\"mystic_trial\",\"秘境の試練\"],[\"coliseum\",\"闘技場\"],[\"forest_of_life\",\"生命の森\"],[\"crystal_cave\",\"水晶鉱山\"],[\"knowledge_nexus\",\"知識の枢軸\"],[\"molten_fort\",\"溶岩要塞\"],[\"radiant_spire\",\"輝光の塔\"]];const entry=(p,k)=>{const srcs=[p.rankings,p.profile&&p.profile.ranks,p.player&&p.player.ranks,p.profile&&p.profile.leaderboards,p.player&&p.player.leaderboards];for(const s of srcs){if(!s)continue;if(s[k]!=null)return k===\"mystic_trial\"&&s.mystic_rank!=null?{score:s[k],kingdom_rank:s.mystic_rank}:s[k];const arr=Array.isArray(s)?s:Array.isArray(s.leaderboards)?s.leaderboards:[];const x=arr.find(x=>{const id=String(x&&(x.board??x.key??x.id??x.type??x.name??x.slug)||\"\").toLowerCase().replace(/[^a-z0-9]/g,\"\");return id===k.replace(/_/g,\"\")||String(x&&x.label||\"\").includes(boards.find(b=>b[0]===k)[1])});if(x)return x}return null};const unpack=e=>{if(e==null)return{score:null,rank:null,label:null,rankType:null};if(typeof e===\"number\"||(typeof e===\"string\"&&e.trim()!==\"\"&&Number.isFinite(Number(e))))return{score:Number(e),rank:null,label:null,rankType:null};if(typeof e!==\"object\")return{score:null,rank:null,label:null,rankType:null};const pick=ks=>{for(const k of ks)if(e[k]!=null&&e[k]!==\"\"&&Number.isFinite(Number(e[k])))return Number(e[k]);return null};return{score:pick([\"value\",\"score\",\"rank_value\",\"points\",\"power\",\"current_value\",\"total\"]),rank:pick([\"kingdom_rank\",\"rank\",\"position\",\"ranking\",\"leaderboard_rank\",\"rank_no\"]),rankLabel:e.kingdom_rank_label==null?null:String(e.kingdom_rank_label),label:e.value_label==null?null:String(e.value_label),rankType:e.rank_type==null?null:String(e.rank_type)}};const vals=players.map(p=>({id:String(p.governor_id),name:String(p.player&&p.player.nick_name||p.governor_id),data:Object.fromEntries(boards.map(([k])=>[k,unpack(entry(p,k))]))}));const sec=document.createElement(\"section\");sec.className=\"mystic-section\";const title=document.createElement(\"h2\");title.className=\"mystic-title\";title.textContent=\"秘境の試練\";sec.appendChild(title);const colors=[\"#ffd166\",\"#42d9ff\",\"#a18aff\",\"#5ee6a8\"];const card=(key,label,main)=>{const c=document.createElement(\"article\");c.className=\"mystic-card \"+(main?\"is-main\":\"is-sub\");const n=document.createElement(\"div\");n.className=\"mystic-name\";n.textContent=label;c.appendChild(n);const values=document.createElement(\"div\");values.className=\"mystic-values\";const entries=vals.map(p=>({player:p,value:p.data[key]}));entries.forEach((entry,i)=>{const cell=document.createElement(\"div\");cell.className=\"mystic-value\";cell.style.color=colors[i%colors.length];const name=document.createElement(\"small\");name.textContent=entry.player.name;name.style.color=colors[i%colors.length];cell.appendChild(name);const score=document.createElement(\"span\");score.className=\"counter\";score.dataset.target=(entry.value.label||entry.value.score==null)?\"\":String(entry.value.score);score.dataset.stageValue=entry.value.label?\"1\":\"\";score.textContent=entry.value.label||(entry.value.score==null?\"未取得\":num(entry.value.score));cell.appendChild(score);if(entry.value.label){const stage=document.createElement(\"small\");stage.textContent=\"ゲーム表示値\";stage.style.display=\"block\";stage.style.marginTop=\"2px\";stage.style.color=\"var(--text,#e8f3ff)\";cell.appendChild(stage)}const rawLabel=document.createElement(\"small\");rawLabel.textContent=\"API値: \"+(entry.value.score==null?\"未取得\":num(entry.value.score));rawLabel.style.display=\"block\";rawLabel.style.marginTop=\"4px\";cell.appendChild(rawLabel);const rank=document.createElement(\"small\");rank.textContent=\"王国内順位: \"+(entry.value.rank!=null?num(entry.value.rank):entry.value.rankLabel||\"未取得\");rank.style.display=\"block\";rank.style.marginTop=\"3px\";cell.appendChild(rank);if(entry.value.rankType){const type=document.createElement(\"small\");type.textContent=\"rank_type: \"+entry.value.rankType;type.style.display=\"block\";type.style.marginTop=\"2px\";cell.appendChild(type)}values.appendChild(cell)});c.appendChild(values);const note=document.createElement(\"div\");note.className=\"mystic-ranks\";note.textContent=\"API値はステージ表記を符号化した生データです。強さのスコアではないため、差分や割合を強さとして表示していません。\";c.appendChild(note);return c};const big=card(\"mystic_trial\",\"秘境の試練\",true);sec.appendChild(big);const grid=document.createElement(\"div\");grid.className=\"mystic-grid\";boards.slice(1).forEach(([k,l])=>grid.appendChild(card(k,l,false)));sec.appendChild(grid);const old=box.querySelector(\".mystic-section\");if(old)old.remove();const table=box.querySelector(\".table-wrap\");if(table)table.before(sec);else box.insertBefore(sec,box.firstChild);}addMysticTrialComparison(ps);const controls=document.createElement(\"div\");controls.className=\"compare-controls\";controls.innerHTML=\"<label><input type=checkbox data-compare-group=basic checked>基本</label><label><input type=checkbox data-compare-group=combat checked>戦闘</label><label><input type=checkbox data-compare-group=affiliation checked>所属・位置</label>\";box.insertBefore(controls,box.firstChild);const itemLabels=[...new Set([...fields.map(f=>f[0]),...coreRankRows.map(f=>f[0]),...coreRankScoreRows.map(f=>f[0]),...[...leaderboardRows.values()].map(row=>\"ランキング：\"+row.label),...[...heroRows.values()].map(row=>\"闘技場防衛編成：\"+row.label),...[...heroGearRows.values()].map(row=>\"防衛編成装備：\"+row.label),...[...heroSkillRows.values()].map(row=>\"英雄スキル：\"+row.label),...[...heroExclusiveRows.values()].map(row=>\"専用装備：\"+row.label),...[...gearRows.values()].map(row=>\"領主装備：\"+row.label),\"30日間の戦力変化\",\"EagleEye取得\",\"元データ時刻\"])];const recommendedItems=new Set([\"戦力\",\"役場レベル\",\"VIP\",\"撃破数\",\"王国\",\"同盟略称\",\"ランキングスコア：秘境の試練\",\"30日間の戦力変化\",\"EagleEye取得\",\"元データ時刻\"]);const selectedCompareItems=new Set(itemLabels.filter(label=>recommendedItems.has(label)||label.startsWith(\"闘技場防衛編成：\")||label.startsWith(\"防衛編成装備：\")||label.startsWith(\"英雄スキル：\")||label.startsWith(\"専用装備：\")));try{const saved=JSON.parse(localStorage.getItem(\"eagleeye-player-compare-items-v1\")||\"null\");if(Array.isArray(saved)){selectedCompareItems.clear();saved.filter(label=>itemLabels.includes(label)).forEach(label=>selectedCompareItems.add(label));if(!selectedCompareItems.size){recommendedItems.forEach(label=>{if(itemLabels.includes(label))selectedCompareItems.add(label)});itemLabels.filter(label=>label.startsWith(\"闘技場防衛編成：\")||label.startsWith(\"防衛編成装備：\")||label.startsWith(\"英雄スキル：\")||label.startsWith(\"専用装備：\")).forEach(label=>selectedCompareItems.add(label));}}}catch{}const itemSelector=document.createElement(\"details\");itemSelector.className=\"compare-item-selector\";const itemSummary=document.createElement(\"summary\");itemSummary.textContent=\"比較項目を選択（おすすめ項目を初期表示）\";itemSelector.appendChild(itemSummary);const itemActions=document.createElement(\"div\");itemActions.className=\"compare-item-actions\";const resetItems=document.createElement(\"button\");resetItems.type=\"button\";resetItems.textContent=\"おすすめに戻す\";const showAllItems=document.createElement(\"button\");showAllItems.type=\"button\";showAllItems.textContent=\"すべて表示\";itemActions.appendChild(resetItems);itemActions.appendChild(showAllItems);itemSelector.appendChild(itemActions);const itemList=document.createElement(\"div\");itemList.className=\"compare-item-list\";const itemCheckboxes=[];itemLabels.forEach(label=>{const wrapper=document.createElement(\"label\");const input=document.createElement(\"input\");input.type=\"checkbox\";input.checked=selectedCompareItems.has(label);const textNode=document.createElement(\"span\");textNode.textContent=label;wrapper.appendChild(input);wrapper.appendChild(textNode);itemList.appendChild(wrapper);itemCheckboxes.push({label,input})});itemSelector.appendChild(itemList);box.insertBefore(itemSelector,controls.nextSibling);resetItems.addEventListener(\"click\",()=>{selectedCompareItems.clear();recommendedItems.forEach(label=>{if(itemLabels.includes(label))selectedCompareItems.add(label)});itemLabels.filter(label=>label.startsWith(\"闘技場防衛編成：\")||label.startsWith(\"防衛編成装備：\")||label.startsWith(\"専用装備：\")).forEach(label=>selectedCompareItems.add(label));itemCheckboxes.forEach(x=>x.input.checked=selectedCompareItems.has(x.label));try{localStorage.setItem(\"eagleeye-player-compare-items-v1\",JSON.stringify([...selectedCompareItems]));}catch{}applyCompareGroups()});showAllItems.addEventListener(\"click\",()=>{itemLabels.forEach(label=>selectedCompareItems.add(label));itemCheckboxes.forEach(x=>x.input.checked=true);try{localStorage.setItem(\"eagleeye-player-compare-items-v1\",JSON.stringify([...selectedCompareItems]));}catch{}applyCompareGroups()});itemCheckboxes.forEach(x=>x.input.addEventListener(\"change\",()=>{if(x.input.checked)selectedCompareItems.add(x.label);else selectedCompareItems.delete(x.label);try{localStorage.setItem(\"eagleeye-player-compare-items-v1\",JSON.stringify([...selectedCompareItems]));}catch{}applyCompareGroups()}));const compareGroupForLabel=label=>[\"戦力\",\"役場レベル\",\"VIP\",\"王国\"].includes(label)?\"basic\":label===\"撃破数\"||label===\"30日間の戦力変化\"||label.startsWith(\"王国内順位：\")||label.startsWith(\"ランキング：\")||label.startsWith(\"ランキングスコア：\")||label.startsWith(\"闘技場防衛編成：\")||label.startsWith(\"防衛編成装備：\")||label.startsWith(\"英雄スキル：\")||label.startsWith(\"専用装備：\")||label.startsWith(\"領主装備：\")?\"combat\":\"affiliation\";function applyCompareGroups(){const enabled={basic:controls.querySelector(\"[data-compare-group=basic]\").checked,combat:controls.querySelector(\"[data-compare-group=combat]\").checked,affiliation:controls.querySelector(\"[data-compare-group=affiliation]\").checked};box.querySelectorAll(\".compare-table tbody tr\").forEach(function(row){const th=row.querySelector(\"th\");const label=th?th.textContent.trim():\"\";const group=compareGroupForLabel(label);row.hidden=!enabled[group]||!selectedCompareItems.has(label)});box.querySelectorAll(\".compare-metric\").forEach(function(row){const label=row.getAttribute(\"data-compare-label\");row.hidden=!enabled[row.getAttribute(\"data-compare-group\")]||(label&&!selectedCompareItems.has(label))})}controls.querySelectorAll(\"input\").forEach(function(input){input.addEventListener(\"change\",applyCompareGroups)});applyCompareGroups();\n\nconst mobileCards=document.createElement(\"div\");mobileCards.className=\"compare-player-cards\";\nps.forEach(p=>{const card=document.createElement(\"article\");card.className=\"compare-player-card\";const head=document.createElement(\"div\");head.className=\"compare-player-card-head\";if(p.player&&p.player.avatar_url){const img=document.createElement(\"img\");img.src=String(p.player.avatar_url);img.alt=\"\";img.loading=\"lazy\";head.appendChild(img)}const heading=document.createElement(\"div\");const playerName=document.createElement(\"div\");playerName.className=\"pname\";playerName.textContent=String(p.player&&p.player.nick_name||\"データなし\");const playerMeta=document.createElement(\"div\");playerMeta.className=\"pid\";playerMeta.textContent=\"ID \"+String(p.governor_id||\"—\")+\" · 王国 \"+String(p.player&&p.player.kid||\"—\");heading.appendChild(playerName);heading.appendChild(playerMeta);head.appendChild(heading);card.appendChild(head);const metrics=document.createElement(\"div\");metrics.className=\"compare-player-metrics\";const addMetric=(label,value,group,detail)=>{const row=document.createElement(\"div\");row.className=\"compare-metric\";row.setAttribute(\"data-compare-group\",group);row.setAttribute(\"data-compare-label\",label);const labelNode=document.createElement(\"span\");labelNode.textContent=label;const valueNode=document.createElement(\"strong\");valueNode.textContent=String(value==null?\"—\":value);row.appendChild(labelNode);row.appendChild(valueNode);if(detail){const detailNode=document.createElement(\"small\");detailNode.textContent=detail;row.appendChild(detailNode)}metrics.appendChild(row)};fields.forEach(f=>addMetric(f[0],p.missing?\"データなし\":f[2](p.player&&p.player[f[1]]),compareGroupForLabel(f[0])));coreRankRows.forEach(f=>{const v=p.rankings&&p.rankings[f[1]];addMetric(f[0],v==null||v===\"\"?\"—\":\"#\"+num(v),\"combat\")});coreRankScoreRows.forEach(f=>{const v=p.rankings&&p.rankings[f[1]];addMetric(f[0],v==null||v===\"\"?\"—\":compact(v),\"combat\")});leaderboardRows.forEach(row=>{const board=row.byId[p.governor_id];const score=board&&(board.value??board.score??board.rank_value);const rank=board&&(board.kingdom_rank??board.rank??board.ranking);const rankLabel=rank!=null?num(rank):(board&&board.kingdom_rank_label||\"\");const meta=[];if(board&&board.value_label&&score!=null)meta.push(\"API値 \"+compact(score));if(rankLabel)meta.push(\"王国内順位 \"+rankLabel+(p.player&&p.player.kid!=null?\"（王国 \"+num(p.player.kid)+\"）\":\"\"));if(board&&board.observed_at)meta.push(\"EagleEye保存 \"+new Date(Number(board.observed_at)*1000).toLocaleString(\"ja-JP\"));const formattedScore=score==null?\"—\":Number.isFinite(Number(score))?compact(score):String(score);const display=board&&board.value_label?board.value_label:formattedScore;addMetric(\"ランキング：\"+row.label,display,\"combat\",meta.join(\" · \"));const metric=metrics.lastElementChild;if(metric&&score!=null&&Number.isFinite(Number(score))&&!(board&&board.value_label))metric.dataset.rankScore=String(score)});(Array.isArray(p.profile&&p.profile.heroes)?p.profile.heroes:[]).forEach(hero=>{const parts=[];if(hero.level!=null)parts.push(\"Lv.\"+hero.level);if(hero.star!=null||hero.stars!=null)parts.push(\"★\"+(hero.star??hero.stars));if(hero.exclusive_gear_level!=null)parts.push(\"専用装備 \"+hero.exclusive_gear_level);addMetric(\"英雄：\"+String(hero.name||hero.id||\"英雄\"),parts.join(\" · \")||\"データなし\",\"combat\")});(Array.isArray(p.profile&&p.profile.gov_gear&&p.profile.gov_gear.items)?p.profile.gov_gear.items:[]).forEach(item=>{const parts=[];if(item.quality!=null)parts.push(String(item.quality));if(item.tier!=null)parts.push(\"T\"+item.tier);if(item.star!=null)parts.push(\"★\"+item.star);if(item.strength_level!=null)parts.push(\"強化 \"+item.strength_level);if(item.score!=null)parts.push(\"スコア \"+compact(item.score));if(item.combat!=null)parts.push(\"戦闘力 \"+compact(item.combat));if(Array.isArray(item.gems)&&item.gems.length)parts.push(\"宝石 \"+item.gems.length);addMetric(\"領主装備：\"+String(item.slot||item.id||item.name||\"装備\"),parts.join(\" · \")||\"データなし\",\"combat\")});const delta=p.period&&p.period.powerDelta;addMetric(\"30日間の戦力変化\",delta==null?\"—\":(delta>0?\"+\":\"\")+compact(delta),\"combat\",String(p.period&&p.period.observations||0)+\"件の履歴\");const eeAt=Number(p.player&&p.player.observed_at);const sourceAt=Number(p.player&&p.player.source_observed_at);addMetric(\"EagleEye取得\",eeAt?new Date(eeAt*1000).toLocaleString(\"ja-JP\"):\"不明\",\"affiliation\");addMetric(\"元データ時刻\",sourceAt?new Date(sourceAt*1000).toLocaleString(\"ja-JP\")+(Math.floor(Date.now()/1000)-sourceAt>900?\"（15分以上前）\":\"\"):\"時刻不明\",\"affiliation\");card.appendChild(metrics);mobileCards.appendChild(card)});box.insertBefore(mobileCards,itemSelector.nextSibling);applyCompareGroups();\nconst validPowers=ps.map(p=>({p,value:Number(p.player&&p.player.power)})).filter(x=>!x.p.missing&&Number.isFinite(x.value)&&x.value>=0);const maxPower=validPowers.length?Math.max.apply(null,validPowers.map(x=>x.value)):0;const ns=\"http://www.w3.org/2000/svg\";const showcase=document.createElement(\"section\");showcase.className=\"power-showcase-wrap\";const title=document.createElement(\"h2\");title.className=\"section-title\";title.textContent=\"戦力バランス\";showcase.appendChild(title);const note=document.createElement(\"div\");note.className=\"sub\";note.textContent=\"円の長さは比較対象内の最大戦力を100%とした目安です。中央の数値は実際の戦力です。\";showcase.appendChild(note);const grid=document.createElement(\"div\");grid.className=\"power-showcase\";showcase.appendChild(grid);const ringColors=[\"var(--ring-1)\",\"var(--ring-2)\",\"var(--ring-3)\",\"var(--ring-4)\"];const ringNodes=[];const counterNodes=[];\nps.forEach((p,i)=>{const power=Number(p.player&&p.player.power);const valid=!p.missing&&Number.isFinite(power)&&power>=0;const ratio=valid&&maxPower>0?Math.min(1,power/maxPower):0;const card=document.createElement(\"article\");card.className=\"power-card\";const ring=document.createElement(\"div\");ring.className=\"power-ring\";const svg=document.createElementNS(ns,\"svg\");svg.setAttribute(\"viewBox\",\"0 0 100 100\");svg.setAttribute(\"role\",\"img\");svg.setAttribute(\"aria-label\",String(p.player&&p.player.nick_name||\"プレイヤー\")+\"の戦力比較ゲージ\");const base=document.createElementNS(ns,\"circle\");base.setAttribute(\"class\",\"ring-base\");base.setAttribute(\"cx\",\"50\");base.setAttribute(\"cy\",\"50\");base.setAttribute(\"r\",\"42\");const valueCircle=document.createElementNS(ns,\"circle\");valueCircle.setAttribute(\"class\",\"ring-value\");valueCircle.setAttribute(\"cx\",\"50\");valueCircle.setAttribute(\"cy\",\"50\");valueCircle.setAttribute(\"r\",\"42\");valueCircle.style.setProperty(\"--ring-color\",ringColors[i%ringColors.length]);valueCircle.style.strokeDashoffset=\"263.9\";svg.appendChild(base);svg.appendChild(valueCircle);ring.appendChild(svg);const center=document.createElement(\"div\");center.className=\"ring-center\";const number=document.createElement(\"span\");number.className=\"ring-number\";number.textContent=valid?\"0\":\"—\";const caption=document.createElement(\"span\");caption.className=\"ring-caption\";caption.textContent=\"戦力\";center.appendChild(number);center.appendChild(caption);ring.appendChild(center);card.appendChild(ring);const info=document.createElement(\"div\");info.className=\"power-info\";const name=document.createElement(\"div\");name.className=\"pname\";name.textContent=String(p.player&&p.player.nick_name||\"データなし\");const id=document.createElement(\"div\");id.className=\"pid\";id.textContent=\"ID \"+String(p.governor_id||\"—\")+\" · 王国 \"+String(p.player&&p.player.kid||\"—\");const label=document.createElement(\"div\");label.className=\"power-label\";label.textContent=\"取得した元の数値\";const raw=document.createElement(\"div\");raw.className=\"power-value\";raw.textContent=valid?compact(power):\"データなし\";const relative=document.createElement(\"div\");relative.className=\"power-ratio\";relative.textContent=valid&&maxPower>0?Math.round(ratio*100)+\"%（比較対象内）\":\"比較不可\";info.appendChild(name);info.appendChild(id);const freshness=document.createElement(\"div\");freshness.className=\"pid\";const eeAt=Number(p.player&&p.player.observed_at);const sourceAt=Number(p.player&&p.player.source_observed_at);freshness.textContent=\"EagleEye: \"+(eeAt?new Date(eeAt*1000).toLocaleString(\"ja-JP\",{month:\"numeric\",day:\"numeric\",hour:\"2-digit\",minute:\"2-digit\"}):\"不明\")+\" · 元データ: \"+(sourceAt?new Date(sourceAt*1000).toLocaleString(\"ja-JP\",{month:\"numeric\",day:\"numeric\",hour:\"2-digit\",minute:\"2-digit\"})+(Math.floor(Date.now()/1000)-sourceAt>900?\"（15分以上前）\":\"\"):\"時刻不明\");info.appendChild(freshness);const rankFreshness=document.createElement(\"div\");rankFreshness.className=\"pid\";const rankAt=Number(p.rankings&&p.rankings.observed_at);const rankSourceAt=Number(p.rankings&&p.rankings.source_observed_at);rankFreshness.textContent=\"ランキング EE: \"+(rankAt?new Date(rankAt*1000).toLocaleString(\"ja-JP\",{month:\"numeric\",day:\"numeric\",hour:\"2-digit\",minute:\"2-digit\"}):\"未取得\")+\" · 元データ: \"+(rankSourceAt?new Date(rankSourceAt*1000).toLocaleString(\"ja-JP\",{month:\"numeric\",day:\"numeric\",hour:\"2-digit\",minute:\"2-digit\"})+(Math.floor(Date.now()/1000)-rankSourceAt>900?\"（15分以上前）\":\"\"):\"時刻不明\");info.appendChild(rankFreshness);info.appendChild(label);info.appendChild(raw);info.appendChild(relative);card.appendChild(info);grid.appendChild(card);if(valid){ringNodes.push({ring,valueCircle,offset:263.9*(1-ratio)});counterNodes.push({node:number,target:power})}});\nbox.insertBefore(showcase,box.firstChild);requestAnimationFrame(()=>{ringNodes.forEach(x=>{x.valueCircle.style.strokeDashoffset=String(x.offset);x.ring.classList.add(\"ready\")});const duration=900;const started=performance.now();function tick(now){const progress=Math.min(1,(now-started)/duration);const eased=1-Math.pow(1-progress,3);counterNodes.forEach(x=>{x.node.textContent=compact(x.target*eased)});if(progress<1)requestAnimationFrame(tick);else counterNodes.forEach(x=>{x.node.textContent=compact(x.target)})}if(counterNodes.length)requestAnimationFrame(tick)})}" + "async function fetchJsonWithTimeout(url,options,timeoutMs){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs||15000);try{const response=await fetch(url,{...(options||{}),signal:controller.signal,cache:\"no-store\"});const data=await response.json();return {response,data}}finally{clearTimeout(timer)}}async function runCompareRefreshBatch(items,concurrency,worker,onProgress){let cursor=0,completed=0;const results=new Array(items.length);async function run(){while(true){const index=cursor++;if(index>=items.length)return;try{results[index]=await worker(items[index],index)}catch(error){results[index]={error}}completed++;if(onProgress)onProgress(completed,items.length)}}await Promise.all(Array.from({length:Math.min(concurrency,items.length)},()=>run()));return results}let staleRefreshAttempted=false;async function load(){if(ids.length<2){count.textContent=\"2〜4人必要です\";box.innerHTML=\"<div class=\\\"status error\\\">比較対象が不足しています。ウォッチリストで2人以上を選択してください。</div>\";return}retry.disabled=true;box.innerHTML=\"<div class=status id=compareLoadStatus>比較データを読み込み中…（0秒）</div>\";let loadPhase=\"比較データを読み込み中\";const loadStartedAt=Date.now();const loadTimer=setInterval(function(){const status=document.getElementById(\"compareLoadStatus\");if(status)status.textContent=loadPhase+\"…（経過 \"+Math.floor((Date.now()-loadStartedAt)/1000)+\"秒）\";},1000);try{const q=new URLSearchParams();ids.forEach(id=>q.append(\"governor_id\",id));const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);let r,d;try{r=await fetch(\"/api/player-compare?\"+q.toString(),{cache:\"no-store\",signal:controller.signal});d=await r.json()}finally{clearTimeout(timeout)}if(!r.ok||!d.ok)throw new Error(d.message||\"比較データの取得に失敗しました。\");let autoRefreshFailures=[];if(!staleRefreshAttempted){const now=Math.floor(Date.now()/1000);const stale=(d.players||[]).filter(p=>{const eeAt=Number(p.player&&p.player.observed_at)||0;const sourceAt=Number(p.player&&p.player.source_observed_at)||0;const rankAt=Number(p.rankings&&p.rankings.observed_at)||0;const rankSourceAt=Number(p.rankings&&p.rankings.source_observed_at)||0;return !p.missing&&(!eeAt||now-eeAt>900||(sourceAt>0&&now-sourceAt>900)||(p.rankingsExpected&&(!rankAt||now-rankAt>900||(rankSourceAt>0&&now-rankSourceAt>900)))||p.profileNeedsRich);});if(stale.length){staleRefreshAttempted=true;loadPhase=\"古いデータを自動更新中\";count.textContent=\"古いデータを自動更新中… \"+stale.length+\"人\";const capacityResponse=await fetchJsonWithTimeout(\"/api/player-compare/refresh-capacity\",null,5000);const capacityData=capacityResponse.data;if(!capacityResponse.response.ok||!capacityData.ok)throw new Error(\"API Poolの空き状況を確認できません\");const refreshConcurrency=Math.min(stale.length,Math.max(0,Number(capacityData.usable)||0));const refreshResults=refreshConcurrency>0?await runCompareRefreshBatch(stale,refreshConcurrency,async p=>{for(let attempt=0;attempt<3;attempt++){try{const refreshResult=await fetchJsonWithTimeout(\"/api/player/refresh?governor_id=\"+encodeURIComponent(p.governor_id)+\"&include=base%2Cheroes%2Cranks%2Cgov_gear\",null,15000);const rr=refreshResult.response,rd=refreshResult.data;if(rr.status===503&&rd.error===\"NO_API_POOL_KEY_AVAILABLE\"&&attempt<2){await new Promise(resolve=>setTimeout(resolve,2000));continue}if(!rr.ok||!rd.ok||(rd.rank_refresh_expected&&!rd.rank_snapshot_saved))throw new Error(rd.error||String(rr.status));return {ok:true}}catch(error){if(error&&error.message===\"NO_API_POOL_KEY_AVAILABLE\"&&attempt<2){await new Promise(resolve=>setTimeout(resolve,2000));continue}throw error}}throw new Error(\"NO_API_POOL_KEY_AVAILABLE\")},(completed,total)=>{count.textContent=\"古いデータを自動更新中… \"+completed+\"/\"+total+\"人\"}):[];refreshResults.forEach((result,index)=>{if(!result||!result.ok){autoRefreshFailures.push(stale[index].governor_id);console.warn(\"compare_auto_refresh_failed\",stale[index].governor_id,result&&result.error&&result.error.message||\"refresh_failed\")}});loadPhase=\"比較データを再取得中\";const refreshedResult=await fetchJsonWithTimeout(\"/api/player-compare?\"+q.toString(),null,12000);const refreshed=refreshedResult.response,refreshedData=refreshedResult.data;if(refreshed.ok&&refreshedData.ok)d=refreshedData;}}render(d);if(autoRefreshFailures.length)count.textContent+=\" · 自動更新失敗 \"+autoRefreshFailures.length+\"人\"}catch(e){const message=e&&e.name===\"AbortError\"?\"取得が12秒以内に完了しませんでした。サーバー側の処理が遅延しています。再読み込みするか、時間をおいて再試行してください。\":(e.message||\"比較データの取得に失敗しました。\");box.innerHTML=\"<div class=\\\"status error\\\">\"+esc(message)+\"</div>\"}finally{clearInterval(loadTimer);retry.disabled=false}}retry.addEventListener(\"click\",load);document.getElementById(\"refresh\").addEventListener(\"click\",async function(){if(!confirm(\"比較対象のプレイヤーを順番に最新データへ更新します。API Poolを使用します。続けますか？\"))return;var btn=this;btn.disabled=true;retry.disabled=true;var status=document.getElementById(\"count\");try{var failures=[];var refreshStartedAt=Date.now();var refreshIndex=0;var refreshTimer=setInterval(function(){status.textContent=\"最新データを取得中… \"+refreshIndex+\"/\"+ids.length+\"人 · 残り \"+(ids.length-refreshIndex)+\"人 · 経過 \"+Math.floor((Date.now()-refreshStartedAt)/1000)+\"秒\"},1000);var capacityResponse=await fetchJsonWithTimeout(\"/api/player-compare/refresh-capacity\",null,5000);var capacityData=capacityResponse.data;if(!capacityResponse.response.ok||!capacityData.ok)throw new Error(\"API Poolの空き状況を確認できません\");var refreshConcurrency=Math.min(ids.length,Math.max(0,Number(capacityData.usable)||0));if(refreshConcurrency<1)throw new Error(\"通常利用向けAPIキーを確保するため、最新データを取得できません。少し待ってから再試行してください。\");var refreshResults=await runCompareRefreshBatch(ids,refreshConcurrency,async function(id){for(var attempt=0;attempt<3;attempt++){try{var refreshResult=await fetchJsonWithTimeout(\"/api/player/refresh?governor_id=\"+encodeURIComponent(id)+\"&include=base%2Cheroes%2Cranks%2Cgov_gear\",null,15000);var rr=refreshResult.response,rd=refreshResult.data;if(rr.status===503&&rd.error===\"NO_API_POOL_KEY_AVAILABLE\"&&attempt<2){await new Promise(function(resolve){setTimeout(resolve,2000)});continue}if(!rr.ok||!rd.ok||(String(rd.requested_include||\"\").includes(\"ranks\")&&!rd.rank_snapshot_saved))throw new Error(rd.error||String(rr.status));return {ok:true}}catch(error){if(error&&error.message===\"NO_API_POOL_KEY_AVAILABLE\"&&attempt<2){await new Promise(function(resolve){setTimeout(resolve,2000)});continue}throw error}}throw new Error(\"NO_API_POOL_KEY_AVAILABLE\")},function(completed,total){refreshIndex=completed;status.textContent=\"最新データを取得中… \"+completed+\"/\"+total+\"人 · 残り \"+(total-completed)+\"人 · 経過 \"+Math.floor((Date.now()-refreshStartedAt)/1000)+\"秒\"});refreshResults.forEach(function(result,index){if(!result||!result.ok)failures.push(ids[index])});await load();if(failures.length)count.textContent+=\" · 更新失敗 \"+failures.length+\"人\"}catch(e){alert(e.message||\"最新データを取得できませんでした\")}finally{clearInterval(refreshTimer);btn.disabled=false;retry.disabled=false}});load()})();</script></body></html>";
  return eagleEyeHtmlResponse(html.replace("</body>", PLAYER_COMPARE_ENHANCEMENTS + "</body>"));
}

async function handlePlayerChangesApi(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const url = new URL(request.url);
  const governorId = String(url.searchParams.get("governor_id") || "").trim();
  if (!governorId) return json({ ok: false, error: "GOVERNOR_ID_REQUIRED" }, 400);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 100);
  if (!env.DB) return json({ ok: false, error: "DB_NOT_CONFIGURED" }, 503);

  try {
    const result = await env.DB.prepare(
      `SELECT event_id, target_type, target_id, change_type, field_name,
              old_value_json, new_value_json, observation_id, detected_at, created_at
       FROM change_events
       WHERE target_type = 'PLAYER' AND target_id = ?
       ORDER BY detected_at DESC, created_at DESC
       LIMIT ?`
    ).bind(governorId, limit).all();

    const rawChangeRows = result.results || [];
    await trackServiceUsage(env, auth, "PLAYER_CHANGES_VIEW", {
      targetType: "PLAYER",
      targetId: governorId,
      metadata: { limit, result_count: rawChangeRows.length }
    });

    const changes = (result.results || []).map(row => {
      let oldValue = null;
      let newValue = null;
      try { oldValue = JSON.parse(row.old_value_json); } catch {}
      try { newValue = JSON.parse(row.new_value_json); } catch {}
      return {
        event_id: row.event_id, target_type: row.target_type, target_id: row.target_id,
        change_type: row.change_type, field_name: row.field_name,
        old_value: oldValue, new_value: newValue, observation_id: row.observation_id,
        detected_at: row.detected_at, created_at: row.created_at
      };
    });
    const visibilitySettings = await getPlayerVisibilitySettings(env.DB);
    const visibleChanges = changes.filter(change => isChangeVisibleForRole(change, auth.role, visibilitySettings));

    return json({ ok: true, governor_id: governorId, changes: visibleChanges });
  } catch (error) {
    console.error("Player changes API error:", error);
    return json({ ok: false, error: "PLAYER_CHANGES_READ_FAILED" }, 500);
  }
}

async function renderPlayerChangesPage(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") {
    return '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>EagleEye</title></head><body style="background:#0f172a;color:white;font-family:system-ui;padding:32px"><h1>ログインが必要です</h1><a href="/api/auth/discord" style="color:#f59e0b">Discordでログイン</a></body></html>';
  }
  const url = new URL(request.url);
  const governorId = String(url.searchParams.get("governor_id") || "").trim();
  if (!governorId) return renderChangesShell("領主IDを指定してください。", "");
  if (!env.DB) return renderChangesShell("データベースが設定されていません。", governorId);

  try {
    const result = await env.DB.prepare(
      `SELECT event_id, target_type, target_id, change_type, field_name,
              old_value_json, new_value_json, observation_id, detected_at, created_at
       FROM change_events
       WHERE target_type = 'PLAYER' AND target_id = ?
       ORDER BY detected_at DESC, created_at DESC
       LIMIT 100`
    ).bind(governorId).all();

    const changes = (result.results || []).map(row => {
      let oldValue = null;
      let newValue = null;
      try { oldValue = JSON.parse(row.old_value_json); } catch {}
      try { newValue = JSON.parse(row.new_value_json); } catch {}
      return { ...row, oldValue, newValue };
    });
    const visibilitySettings = await getPlayerVisibilitySettings(env.DB);
    const visibleChanges = changes.filter(change => isChangeVisibleForRole(change, auth.role, visibilitySettings));

    if (!visibleChanges.length) return renderChangesShell("このプレイヤーの変更履歴はまだありません。", governorId);

    const cards = visibleChanges.map(change => {
      const label = changeFieldLabel(change.field_name);
      const oldText = formatChangeValue(change.field_name, change.oldValue);
      const newText = formatChangeValue(change.field_name, change.newValue);
      return `<article class="change"><div class="time">${escapeHtml(formatUnix(change.detected_at))}</div><div class="headline"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(changeTypeLabel(change.change_type))}</span></div><div class="transition"><span class="old">${escapeHtml(oldText)}</span><span class="arrow">→</span><span class="new">${escapeHtml(newText)}</span></div></article>`;
    }).join("");

    return renderChangesShell("", governorId, cards);
  } catch (error) {
    console.error("Player changes page error:", error);
    return renderChangesShell("変更履歴の読み込みに失敗しました。", governorId);
  }
}

function renderChangesShell(message, governorId, cards = "") {
  const content = cards ? '<div class="timeline">' + cards + '</div>' : '<div class="message">' + escapeHtml(message) + '</div>';
  return '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EagleEye Change History</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:760px;margin:0 auto;padding:28px 18px}.back{color:#94a3b8;text-decoration:none}.eyebrow{margin-top:24px;color:#f59e0b;font-size:11px;font-weight:800;letter-spacing:2px}.title{margin:5px 0 8px;font-size:27px}.sub{color:#94a3b8}.timeline{margin-top:20px;display:grid;gap:10px}.change{padding:16px;border:1px solid #334155;border-radius:14px;background:#162238}.time{color:#94a3b8;font-size:12px}.headline{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:7px}.headline strong{font-size:17px}.headline span{font-size:11px;color:#94a3b8;padding:4px 7px;border-radius:7px;background:#0b1220}.transition{display:flex;align-items:center;gap:10px;margin-top:12px;min-width:0}.old,.new{padding:9px 10px;border-radius:9px;overflow-wrap:anywhere;word-break:break-word}.old{background:#0b1220;color:#94a3b8}.new{background:#182f25;color:#bbf7d0;font-weight:800}.arrow{color:#f59e0b;font-weight:900}.message{margin-top:22px;padding:20px;border:1px solid #334155;border-radius:14px;background:#111c31;color:#94a3b8}@media(max-width:520px){.transition{align-items:stretch}.old,.new{flex:1}.arrow{align-self:center}}</style></head><body><main class="wrap"><a class="back" href="/player?governor_id=' + encodeURIComponent(governorId) + '">← プレイヤー詳細</a><div class="eyebrow">CHANGE EVENTS</div><h1 class="title">変更履歴</h1><div class="sub">領主ID ' + escapeHtml(governorId) + '</div>' + content + '</main></body></html>';
}

function isChangeVisibleForRole(change, role, settings = null) {
  if (!settings) {
    // Visibility settings are authoritative. Never fail open when unavailable.
    return false;
  }
  const field = String(change.field_name || "");
  const key = field === "vip" ? "base_vip"
    : field === "x" || field === "y" ? "base_coordinates"
    : field === "power" || field === "town_center_level" ? "base_power"
    : field === "kills" ? "base_kills"
    : field === "online" || field === "last_active_at" ? "base_activity"
    : field.startsWith("alliance_") ? (field === "alliance_rank" ? "alliance_rank" : field === "alliance_power" || field === "alliance_count" ? "alliance_stats" : "alliance_identity")
    : "base_profile";
  return visibilityEnabled(settings, key, role);
}

function changeTypeLabel(value) {
  const labels = { POWER_CHANGED:"戦力変更", TOWN_CENTER_CHANGED:"役場変更", ALLIANCE_CHANGED:"同盟変更", COORDINATES_CHANGED:"座標変更", ACTIVITY_CHANGED:"活動状況変更", KILLS_CHANGED:"撃破数変更", PLAYER_FIELD_CHANGED:"プレイヤー情報変更" };
  return labels[value] || value || "変更";
}

function changeFieldLabel(field) {
  const labels = { power:"戦力", town_center_level:"役場", vip:"VIP", x:"X座標", y:"Y座標", kills:"撃破数", online:"オンライン", alliance_aid:"同盟ID", alliance_name:"同盟", alliance_rank:"同盟ランク", alliance_power:"同盟戦力", alliance_count:"同盟人数" };
  return labels[field] || field || "不明";
}

function formatChangeValue(field, value) {
  if (value === null || value === undefined || value === "") return "-";
  if (["power","kills","alliance_power","alliance_count","alliance_aid"].includes(field)) return formatNumber(value);
  if (field === "town_center_level") return formatTownCenterLevel(value);
  if (field === "online") return Number(value) ? "オンライン" : "オフライン";
  if (field === "x" || field === "y") return formatNumber(value);
  return String(value);
}

async function renderPlayerHistoryPage(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") return '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>EagleEye</title></head><body style="background:#0f172a;color:white;font-family:system-ui;padding:32px"><h1>ログインが必要です</h1><a href="/api/auth/discord" style="color:#f59e0b">Discordでログイン</a></body></html>';
  const url = new URL(request.url);
  const governorId = String(url.searchParams.get("governor_id") || "").trim();
  if (!governorId) return renderHistoryShell("領主IDを指定してください。", "");
  if (!env.DB) return renderHistoryShell("データベースが設定されていません。", governorId);
  try {
    const result = await env.DB.prepare(
      'SELECT snapshot_id, governor_id, observation_id, observed_at, payload_json FROM player_snapshots WHERE governor_id = ? ORDER BY observed_at DESC LIMIT 100'
    ).bind(governorId).all();
    const visibilitySettings = await getPlayerVisibilitySettings(env.DB);
    const rows = (result.results || []).map(row => {
      let p = {};
      try { p = filterPlayerForRole(JSON.parse(row.payload_json), auth.role, JSON.parse(row.payload_json), visibilitySettings); } catch {}
      return { ...row, player: p };
    });
    if (!rows.length) return renderHistoryShell("このプレイヤーの履歴はまだありません。", governorId);
    const cards = rows.map((row, index) => {
      const p = row.player || {};
      const previous = rows[index + 1]?.player || null;
      const powerDiff = previous && p.power != null && previous.power != null ? Number(p.power) - Number(previous.power) : null;
      return '<article class="snapshot"><div class="time">' + escapeHtml(formatUnix(row.observed_at)) + '</div><div class="headline"><span>戦力</span><strong>' + escapeHtml(formatNumber(p.power)) + '</strong>' + (powerDiff !== null ? '<em class="' + (powerDiff > 0 ? 'up' : powerDiff < 0 ? 'down' : '') + '">' + (powerDiff > 0 ? '+' : '') + escapeHtml(formatNumber(powerDiff)) + '</em>' : '') + '</div><div class="details"><span>役場 ' + escapeHtml(formatTownCenterLevel(p.town_center_level)) + '</span><span>撃破数 ' + escapeHtml(formatNumber(p.kills)) + '</span><span>同盟 ' + escapeHtml(p.alliance_name || '-') + '</span></div></article>';
    }).join("");
    return renderHistoryShell("", governorId, cards);
  } catch (error) {
    console.error("Player history page error:", error);
    return renderHistoryShell("履歴の読み込みに失敗しました。", governorId);
  }
}

function renderHistoryShell(message, governorId, cards = "") {
  const content = cards ? '<div class="timeline">' + cards + '</div>' : '<div class="message">' + escapeHtml(message) + '</div>';
  return '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EagleEye Player History</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:760px;margin:0 auto;padding:28px 18px}.back{color:#94a3b8;text-decoration:none}.eyebrow{margin-top:24px;color:#f59e0b;font-size:11px;font-weight:800;letter-spacing:2px}.title{margin:5px 0 8px;font-size:27px}.sub{color:#94a3b8}.timeline{margin-top:20px;display:grid;gap:10px}.snapshot{padding:16px;border:1px solid #334155;border-radius:14px;background:#162238}.time{color:#94a3b8;font-size:12px}.headline{display:flex;align-items:baseline;gap:10px;margin-top:8px}.headline span{color:#94a3b8;font-size:13px}.headline strong{font-size:21px}.headline em{font-style:normal;font-size:13px}.up{color:#86efac}.down{color:#fca5a5}.details{display:flex;flex-wrap:wrap;gap:8px;margin-top:11px;color:#cbd5e1;font-size:12px}.details span{padding:5px 8px;border-radius:8px;background:#0b1220}.message{margin-top:22px;padding:20px;border:1px solid #334155;border-radius:14px;background:#111c31;color:#94a3b8}</style></head><body><main class="wrap"><a class="back" href="/player?governor_id=' + encodeURIComponent(governorId) + '">← プレイヤー詳細</a><div class="eyebrow">PLAYER HISTORY</div><h1 class="title">プレイヤー履歴</h1><div class="sub">領主ID ' + escapeHtml(governorId) + '</div>' + content + '</main></body></html>';
}

function csvEscape(value) {
  const raw = value === null || value === undefined ? "" : String(value);
  return '"' + raw.replace(/"/g, '""') + '"';
}

function csvResponse(filename, headers, rows) {
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map(row => headers.map(header => csvEscape(row?.[header])).join(","))
  ];
  const body = "\uFEFF" + lines.join("\r\n") + "\r\n";
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="' + filename.replace(/[^A-Za-z0-9._-]/g, "_") + '"',
      "cache-control": "no-store"
    }
  });
}

function flattenCsvValue(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value) || typeof value === "object") return JSON.stringify(value);
  return String(value);
}



async function handlePlayerSectionExport(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;

  const url = new URL(request.url);
  const governorId = String(url.searchParams.get("governor_id") || "").trim();
  const section = String(url.searchParams.get("section") || "").trim().toLowerCase();
  if (!governorId) return json({ ok: false, error: "GOVERNOR_ID_REQUIRED" }, 400);

  const allowedSections = ["profile", "alliance", "heroes", "rankings", "gov_gear"];
  if (!allowedSections.includes(section)) return json({ ok: false, error: "INVALID_EXPORT_SECTION" }, 400);

  try {
    const observation = await getLatestPlayerObservation(env.DB, governorId);
    if (!observation?.payload) return json({ ok: false, error: "PLAYER_DATA_NOT_FOUND" }, 404);

    const visibilitySettings = await getPlayerVisibilitySettings(env.DB);
    const player = await getPlayer(env.DB, governorId);
    const visiblePlayer = filterPlayerForRole(player, guard.auth.role, observation.payload, visibilitySettings);
    const visibleProfile = filterPlayerProfileForRole(observation.payload, guard.auth.role, visibilitySettings);

    if (visibilityEnabled(visibilitySettings, "hero_rankings", guard.auth.role)) {
      const kid = observation.payload?.player?.kid ?? observation.payload?.kid ?? player?.kid;
      visibleProfile.hero_rankings = await getLatestPlayerHeroRankings(env.DB, kid, governorId);
    }

    const exportedAt = new Date().toISOString();
    let sheetTitle = "";
    let headers = [];
    let rows = [];

    if (section === "profile") {
      sheetTitle = "プロフィール";
      headers = ["出力日時","領主ID","UID","FID","プレイヤー名","王国","戦力","役場","VIP","撃破数","座標X","座標Y","オンライン","最終活動","最終ログイン","言語","役職","シールド終了","炎上終了"];
      const p = visiblePlayer || {};
      rows = [{
        "出力日時": exportedAt, "領主ID": p.governor_id, "UID": p.uid, "FID": p.fid, "プレイヤー名": p.nick_name, "王国": p.kid,
        "戦力": p.power, "役場": p.town_center_level, "VIP": p.vip, "撃破数": p.kills,
        "座標X": p.x, "座標Y": p.y, "オンライン": p.online ? "オンライン" : "オフライン",
        "言語": p.language, "役職": p.office,
        "シールド終了": p.shield_endtime, "炎上終了": p.burn_endtime
      }];
    } else if (section === "alliance") {
      sheetTitle = "同盟";
      headers = ["出力日時","領主ID","同盟ID","同盟略称","同盟名","同盟内順位","順位ラベル","同盟戦力","同盟人数","盟主","旗URL"];
      const a = visiblePlayer?.alliance || {};
      rows = [{
        "出力日時": exportedAt, "領主ID": governorId, "同盟ID": a.aid, "同盟略称": a.abbr, "同盟名": a.name,
        "同盟内順位": a.rank, "順位ラベル": a.rank_label, "同盟戦力": a.power,
        "同盟人数": a.count, "盟主": a.leader_name, "旗URL": a.flag_url
      }];
    } else if (section === "heroes") {
      sheetTitle = "英雄";
      headers = ["出力日時","領主ID","英雄ID","英雄名","レベル","星","星ラベル","品質","戦力","配置","スキル","専用装備Lv","専用装備","通常装備"];
      const heroes = Array.isArray(visibleProfile.heroes) ? visibleProfile.heroes : [];
      rows = heroes.map(hero => ({
        "出力日時": exportedAt, "領主ID": governorId, "英雄ID": hero.id, "英雄名": localizeHeroName(hero.name || hero.id),
        "レベル": hero.level, "星": hero.star ?? hero.stars, "星ラベル": hero.star_label,
        "品質": hero.quality, "戦力": hero.power, "配置": hero.position,
        "スキル": flattenCsvValue(hero.skill_levels), "専用装備Lv": hero.exclusive_gear_level,
        "専用装備": flattenCsvValue(hero.exclusive_gear), "通常装備": flattenCsvValue(hero.gear)
      }));
    } else if (section === "rankings") {
      sheetTitle = "ランキング";
      headers = ["出力日時","領主ID","ランキング","順位","スコア","観測時刻"];
      const ranks = visibleProfile.ranks || {};
      const core = [
        ["戦力", ranks.power, ranks.power_rank], ["撃破数", ranks.kills, ranks.kills_rank],
        ["役場", ranks.town_center_level, ranks.town_center_rank], ["移民スコア", ranks.migrant_score, ranks.migrant_rank],
        ["秘境の試練", ranks.mystic_trial, ranks.mystic_rank]
      ];
      for (const [label, score, rank] of core) rows.push({"出力日時":exportedAt,"領主ID":governorId,"ランキング":label,"順位":rank,"スコア":score,"観測時刻":""});
      for (const board of Array.isArray(ranks.leaderboards) ? ranks.leaderboards : []) rows.push({
        "出力日時":exportedAt, "領主ID":governorId, "ランキング":localizeLeaderboardLabel(board),
        "順位":board?.rank ?? board?.ranking, "スコア":board?.score ?? board?.value ?? board?.rank_value,
        "観測時刻":board?.observed_at ?? ""
      });
      for (const board of Array.isArray(visibleProfile.hero_rankings) ? visibleProfile.hero_rankings : []) rows.push({
        "出力日時":exportedAt, "領主ID":governorId, "ランキング":RANKING_BOARD_LABELS[board.board] || board.board,
        "順位":board.rank, "スコア":board.score, "観測時刻":board.observed_at
      });
    } else {
      sheetTitle = "領主装備";
      headers = ["出力日時","領主ID","スロット","品質","Tier","星","強化","スコア","戦闘力","宝石"];
      const items = Array.isArray(visibleProfile.gov_gear?.items) ? visibleProfile.gov_gear.items : [];
      rows = items.map(item => ({
        "出力日時": exportedAt, "領主ID":governorId, "スロット":localizeGovernorGearSlot(item.slot),
        "品質":localizeGovernorGearQuality(item.quality), "Tier":localizeGovernorGearTier(item.tier),
        "星":item.star, "強化":item.strength_level, "スコア":item.score, "戦闘力":item.combat,
        "宝石":Array.isArray(item.gems) ? item.gems.map(gem => {
          const level = localizeGemLevel(gem);
          return level ? "Lv." + level : "宝石";
        }).join(", ") : ""
      }));
    }

    const result = await exportToGoogleSheet(env, { sheetTitle, headers, rows });
    await recordDiagnostic(env.DB, {
      service: "google_sheets", feature: "player_export", operation: "EXPORT", status: "SUCCESS",
      message: "プレイヤーGoogle Sheets出力成功", rowsReceived: rows.length, rowsSaved: rows.length,
      metadata: { section, columnCount: headers.length }
    });
    await trackServiceUsage(env, guard.auth, "PLAYER_EXPORT", {
      targetType: "PLAYER",
      targetId: governorId,
      metadata: {
        format: "google_sheets",
        section,
        row_count: rows.length,
        column_count: headers.length,
        target_player_count: 1,
        success: true
      }
    });
    return new Response(null, { status: 303, headers: { location: result.url, "cache-control": "no-store" } });
  } catch (error) {
    await recordDiagnostic(env.DB, {
      service: "google_sheets", feature: "player_export", operation: "EXPORT", status: "FAILED",
      errorCode: String(error?.code || error?.message || "PLAYER_EXPORT_FAILED").split(":")[0],
      message: String(error?.message || error).slice(0, 2000),
      metadata: { section }
    });
    console.error("Player section Google Sheets export error:", error);
    if (error?.code === "GOOGLE_SHEETS_NOT_CONFIGURED") return json({
      ok: false, error: "GOOGLE_SHEETS_NOT_CONFIGURED",
      message: "Google Sheets連携が未設定です。GOOGLE_SHEETS_SPREADSHEET_ID / GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY を設定してください。"
    }, 503);
    return json({ ok: false, error: error?.code || "PLAYER_EXPORT_FAILED", message: error?.message || "Google Sheetsへの出力に失敗しました。", status: error?.status || 0 }, 502);
  }
}
async function renderPlayerPage(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") {
    return applyEagleEyeTheme(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EagleEye</title></head><body style="background:#0f172a;color:white;font-family:system-ui;padding:32px"><h1>ログインが必要です</h1><a href="/api/auth/discord" style="color:#f59e0b">Discordでログイン</a></body></html>`);
  }

  const url = new URL(request.url);
  const governorId = String(url.searchParams.get("governor_id") || "").trim();
  if (!governorId) {
    return renderPlayerShell("領主IDを指定してください。", "");
  }

  try {
    const refresh = url.searchParams.get("refresh") === "1";
    const rich = url.searchParams.get("rich") === "1";
    let observation = await getLatestPlayerObservation(env.DB, governorId);
    const richPayload = observation?.payload || {};
    const richPlayer = richPayload.player && typeof richPayload.player === "object" ? richPayload.player : richPayload;
    const hasHeroesPayload = Array.isArray(richPayload.heroes) || Array.isArray(richPlayer.heroes);
    const hasRanksPayload = Boolean((richPayload.ranks && typeof richPayload.ranks === "object") || (richPlayer.ranks && typeof richPlayer.ranks === "object"));
    const hasGovGearPayload = Boolean((richPayload.gov_gear && typeof richPayload.gov_gear === "object") || (richPlayer.gov_gear && typeof richPlayer.gov_gear === "object"));
    const needsRichProfile = !hasHeroesPayload || !hasRanksPayload || !hasGovGearPayload;
    const hasRichProfile = hasHeroesPayload && hasRanksPayload && hasGovGearPayload;
    const fetchRich = rich || refresh;

    if (!observation || refresh || (rich && needsRichProfile)) {
      const fetched = await fetchPlayerThroughApiPool(env, governorId, refresh ? "PLAYER_REFRESH" : (rich ? "PLAYER_RICH_LOOKUP" : "PLAYER_LOOKUP"), fetchRich ? "base,heroes,ranks,gov_gear" : "base");
      observation = fetched.observation;
    }

    let player = await getPlayer(env.DB, governorId);
    if (!player || String(player.source_observation_id) !== String(observation.observation_id)) {
      player = await materializePlayer(env.DB, observation, player, env.ARCHIVE, env.HISTORY_STORAGE_MODE);
    }

    const visibilitySettings = await getPlayerVisibilitySettings(env.DB);
    const visiblePlayer = filterPlayerForRole(player, auth.role, observation.payload, visibilitySettings);
    const visibleProfile = filterPlayerProfileForRole(observation.payload, auth.role, visibilitySettings);
    // Supplement missing leaderboard ranks from the already-collected kingdom current table.
    // Keep this to one bounded query; never read ranking_snapshots here.
    if (visibleProfile?.ranks && Array.isArray(visibleProfile.ranks.leaderboards)) {
      const rankBoards = ["coliseum", "forest_of_life", "crystal_cave", "knowledge_nexus", "molten_fort", "radiant_spire"];
      const kid = observation.payload?.player?.kid ?? observation.payload?.kid ?? player?.kid;
      const normalizedGovernorId = normalizeGovernorId(governorId);
      if (kid !== undefined && kid !== null && normalizedGovernorId) {
        const placeholders = rankBoards.map(() => "?").join(",");
        const storedRanks = await env.DB.prepare(
          "SELECT board, rank FROM kingdom_ranking_current " +
          "WHERE kid = ? AND target_type = 'PLAYER' AND (governor_id = ? OR target_id = ?) " +
          "AND board IN (" + placeholders + ")"
        ).bind(Number(kid), normalizedGovernorId, normalizedGovernorId, ...rankBoards).all();
        const rankByBoard = new Map((storedRanks.results || []).map(row => [String(row.board), row.rank]));
        const boardAliases = {
          "Coliseum": "coliseum",
          "Forest of Life": "forest_of_life",
          "Crystal Cave": "crystal_cave",
          "Knowledge Nexus": "knowledge_nexus",
          "Molten Fort": "molten_fort",
          "Radiant Spire": "radiant_spire",
          "闘技場": "coliseum",
          "生命の森": "forest_of_life",
          "水晶鉱山": "crystal_cave",
          "知識の枢軸": "knowledge_nexus",
          "溶岩要塞": "molten_fort",
          "輝光の塔": "radiant_spire"
        };
        visibleProfile.ranks.leaderboards = visibleProfile.ranks.leaderboards.map(board => {
          const boardCandidates = [board?.key, board?.board, board?.id, board?.name, board?.label].filter(Boolean).map(String);
          const boardKey = boardCandidates.map(candidate => boardAliases[candidate] || candidate).find(candidate => rankBoards.includes(candidate));
          const storedRank = boardKey ? rankByBoard.get(boardKey) : undefined;
          const existingRank = board?.rank ?? board?.ranking ?? board?.rank_no;
          if (existingRank !== undefined && existingRank !== null && existingRank !== "") return board;
          if (storedRank === undefined || storedRank === null) return board;
          return { ...board, rank: storedRank };
        });
      }
    }
    visibleProfile.optional_assets = extractOptionalPlayerAssets(observation.payload);
    if (visibilityEnabled(visibilitySettings, "base_identity", auth.role)) {
      visibleProfile.name_history = await getPlayerNameHistory(env.DB, governorId);
    }
    if (visibilityEnabled(visibilitySettings, "hero_rankings", auth.role)) {
      const kid = observation.payload?.player?.kid ?? observation.payload?.kid ?? player?.kid;
      visibleProfile.hero_rankings = await getLatestPlayerHeroRankings(env.DB, kid, governorId);
    }
    return renderPlayerShell("", governorId, visiblePlayer, observation.payload, null, visibleProfile, auth.role === "ADMIN" || auth.role === "OWNER");
  } catch (error) {
    console.error("Player page error:", error);
    const code = String(error?.code || error?.message || "PLAYER_READ_FAILED");
    const status = Number(error?.status || 0);
    if (error?.message === "NO_API_POOL_KEY_AVAILABLE") {
      return renderPlayerShell("現在、プレイヤーデータを取得できません。API Poolに利用可能なキーがありません。", governorId);
    }
    if (status === 404) {
      return renderPlayerShell("該当するプレイヤーが見つかりませんでした。", governorId);
    }
    return renderPlayerShell("プレイヤーデータの更新に失敗しました。", governorId, null, null, "エラーコード: " + code + (status ? " / HTTP " + status : ""));
  }
}

function filterPlayerForRole(player, role, payload = null, settings = null) {
  if (!player) return player;
  if (!payload || !settings) {
    // Visibility settings are authoritative. Never fail open when they are unavailable.
    const visible = { ...player };
    delete visible.vip;
    delete visible.x;
    delete visible.y;
    delete visible.uid;
    delete visible.governor_id;
    delete visible.fid;
    delete visible.nick_name;
    delete visible.kid;
    delete visible.power;
    delete visible.town_center_level;
    delete visible.kills;
    delete visible.online;
    delete visible.last_active_at;
    delete visible.last_login;
    delete visible.avatar_url;
    delete visible.language;
    delete visible.shield_endtime;
    delete visible.burn_endtime;
    delete visible.office;
    if (visible.alliance) {
      const a = { ...visible.alliance };
      delete a.aid;
      delete a.abbr;
      delete a.name;
      delete a.rank;
      delete a.rank_label;
      delete a.power;
      delete a.count;
      delete a.flag_url;
      delete a.leader_name;
      visible.alliance = a;
    }
    return visible;
  }
  const visible = { ...player };
  if (!visibilityEnabled(settings, "base_vip", role)) delete visible.vip;
  if (!visibilityEnabled(settings, "base_coordinates", role)) { delete visible.x; delete visible.y; }
  if (!visibilityEnabled(settings, "base_identity", role)) { delete visible.uid; delete visible.governor_id; delete visible.fid; delete visible.nick_name; delete visible.kid; }
  if (!visibilityEnabled(settings, "base_power", role)) { delete visible.power; delete visible.town_center_level; }
  if (!visibilityEnabled(settings, "base_kills", role)) delete visible.kills;
  if (!visibilityEnabled(settings, "base_activity", role)) { delete visible.online; }
  delete visible.last_active_at;
  delete visible.last_login;
  if (!visibilityEnabled(settings, "base_profile", role)) { delete visible.avatar_url; delete visible.language; delete visible.shield_endtime; delete visible.burn_endtime; delete visible.office; }
  if (visible.alliance) {
    const a = { ...visible.alliance };
    if (!visibilityEnabled(settings, "alliance_identity", role)) { delete a.aid; delete a.abbr; delete a.name; }
    if (!visibilityEnabled(settings, "alliance_rank", role)) { delete a.rank; delete a.rank_label; }
    if (!visibilityEnabled(settings, "alliance_stats", role)) { delete a.power; delete a.count; delete a.flag_url; delete a.leader_name; }
    visible.alliance = a;
  }
  return visible;
}

function renderPlayerShell(message, governorId, player = null, payload = null, notice = null, profile = null, canExport = false) {
  const p = player || {};
  const freshness = payload || {};
  const esc = escapeHtml;
  const avatarRole = normalizeAllianceRole(p.alliance_role ?? p.alliance_rank, p.alliance_rank_label ?? p.alliance_role_label);
  const avatarRoleAttr = avatarRole ? ` data-role="${avatarRole}"` : "";
  const noticeHtml = notice ? '<div class="notice">' + esc(notice) + '</div>' : "";
  const content = player ? `
    <div class="hero"><div class="player-identity-main">${p.avatar_url ? '<img class="player-avatar-main ee-role-avatar"' + avatarRoleAttr + ' src="' + esc(normalizeProfileAssetUrl(p.avatar_url)) + '" alt="" loading="lazy">': '<span class="player-avatar-main player-avatar-empty ee-role-avatar"' + avatarRoleAttr + '>?</span>'}<div><div class="eyebrow">PLAYER PROFILE</div><h1>${esc(p.nick_name || "Unknown Player")}</h1><div class="sub">領主ID ${esc(p.governor_id)}</div><div class="profile-meta"><span>王国：${p.kid != null ? '<a href="/kingdom?kid=' + encodeURIComponent(p.kid) + '" style="color:#f59e0b;text-decoration:none">王国 ' + esc(p.kid) + '</a>' : '—'}</span>${p.alliance_name ? '<span>同盟：<a href="/alliance?kid=' + encodeURIComponent(p.kid || '') + '&tag=' + encodeURIComponent(p.alliance_abbr || p.alliance_name) + '" style="color:#f59e0b;text-decoration:none">' + esc(p.alliance_name) + '</a></span>' : ''}${profile?.language ? '<span>言語：' + esc(formatProfileValue(profile.language)) + '</span>' : ""}${profile?.office ? '<span>役職：' + esc(formatProfileValue(profile.office)) + '</span>' : ""}${profile?.shield_endtime ? '<span>シールド終了：' + esc(formatUnix(profile.shield_endtime)) + '</span>' : ""}${profile?.burn_endtime ? '<span>炎上終了：' + esc(formatUnix(profile.burn_endtime)) + '</span>' : ""}</div>${canExport ? '<a class="section-export hero-export" href="/api/admin/player-export?governor_id=' + encodeURIComponent(governorId) + '&section=profile">スプレッドシート出力</a>' : ""}</div></div><div class="kid">王国 ${esc(p.kid ?? "-")}</div></div>
    <div class="grid">
      ${card("戦力", formatNumber(p.power))}
      ${card("役場", formatTownCenterLevel(p.town_center_level))}
      ${card("VIP", p.vip ?? "-")}
      ${card("撃破数", formatNumber(p.kills))}
      ${card("座標", p.x != null && p.y != null ? `${p.x}, ${p.y}` : "-")}
      ${card("オンライン", p.online ? "オンライン" : "オフライン")}
      ${card("同盟", p.alliance_name || "-")}
    </div>
    ${noticeHtml}
    ${profile?.name_history?.length > 1 ? '<section class="profile-section name-history-section"><div class="section-heading"><h2>過去の名前</h2><span class="label">同一領主IDの名称履歴</span></div><div class="name-history-list">' + profile.name_history.map((item, index) => '<div class="name-history-row"><div><strong>' + esc(item.name) + '</strong><span>' + esc(index === 0 ? '現在' : '過去') + '</span></div><small>' + esc(index === 0 ? '現在の名前' : formatUnix(item.first_seen_at) + ' ～ ' + formatUnix(item.last_seen_at)) + '</small></div>').join('') + '</div></section>' : ''}
    ${renderPlayerAdvancedSections(profile, governorId, canExport)}
    <div class="actions"><a class="action primary" href="/player?governor_id=${encodeURIComponent(governorId)}&refresh=1">詳細情報を取得</a><button type="button" class="action" id="player-watchlist-toggle" data-governor-id="${esc(governorId)}">☆ ウォッチリスト</button><a class="action" href="/player/history?governor_id=${encodeURIComponent(governorId)}">スナップショット履歴</a><a class="action" href="/player/changes?governor_id=${encodeURIComponent(governorId)}">変更履歴</a></div>
    <div class="meta">
      <div><b>データ鮮度</b> ${freshness.age_seconds != null ? Math.round(freshness.age_seconds / 3600) + "時間前" : "不明"}</div>
      <div><b>データ状態</b> ${freshness.fresh === true ? "最新" : "キャッシュ"}</div>
      <div><b>観測時刻</b> ${formatUnix(p.observed_at)}</div>
    </div>` : `${noticeHtml}<div class="message">${esc(message)}</div>`;

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EagleEye Player</title><style>
  :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:760px;margin:0 auto;padding:28px 18px}.back{color:#94a3b8;text-decoration:none}.hero{margin-top:22px;padding:22px;border:1px solid #334155;border-radius:18px;background:#111c31;display:flex;justify-content:space-between;gap:16px}.eyebrow{color:#f59e0b;font-size:11px;font-weight:800;letter-spacing:2px}.hero h1{margin:5px 0;font-size:26px;overflow-wrap:anywhere}.sub{color:#94a3b8}.profile-language{margin-top:3px;color:#cbd5e1;font-size:11px}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 12px}.section-heading h2{margin:0}.section-export{display:inline-flex;align-items:center;justify-content:center;padding:6px 9px;border:1px solid #475569;border-radius:8px;background:#162238;color:#f59e0b;text-decoration:none;font-size:10px;font-weight:800;white-space:nowrap}.hero-export{margin-top:7px}.kid{font-size:22px;font-weight:900;color:#f59e0b}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:14px}.card{padding:16px;border:1px solid #334155;border-radius:14px;background:#162238}.label{font-size:12px;color:#94a3b8}.value{font-size:19px;font-weight:800;margin-top:5px;overflow-wrap:anywhere}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.action{display:inline-flex;align-items:center;justify-content:center;padding:11px 13px;border:1px solid #334155;border-radius:10px;background:#162238;color:#e2e8f0;text-decoration:none;font-size:13px;font-weight:800}.action.primary{background:var(--ee-cyan,#22d3ee);color:#062033;border-color:var(--ee-cyan,#22d3ee)}.meta{margin-top:14px;padding:15px;border-radius:14px;background:#0b1220;color:#94a3b8;font-size:13px;line-height:1.9}.meta b{color:#e2e8f0}.profile-section{margin-top:14px;padding:16px;border:1px solid #334155;border-radius:14px;background:#111c31}
.alliance-profile-details{display:flex;flex-wrap:wrap;gap:4px 8px;margin:3px 0 0;color:#94a3b8;font-size:9px;line-height:1.35}.alliance-profile-details span{overflow-wrap:anywhere}.profile-alliance-export{margin-top:4px}.gov-gear-private{display:flex;align-items:center;gap:7px;margin-top:8px;padding:6px 9px;border:1px solid #334155;border-radius:8px;background:#111c31;color:#94a3b8;font-size:10px}.gov-gear-private b{color:#e2e8f0}.gov-gear-private .section-export{margin-left:auto;padding:3px 5px;font-size:9px}
/* Compact player stats grid: keep all seven fields, reduce vertical scrolling. */
.hero + .grid{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:6px;margin-top:7px}
.hero + .grid .card{min-width:0;padding:8px 7px;border-radius:9px}
.hero + .grid .label{font-size:10px;line-height:1.15}
.hero + .grid .value{margin-top:3px;font-size:13px;line-height:1.2;overflow-wrap:anywhere}
@media(max-width:520px){.hero + .grid{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:5px;margin-top:6px}.hero + .grid .card{padding:7px 6px}.hero + .grid .label{font-size:9px}.hero + .grid .value{font-size:11px}}
/* Hero rankings and summary facts use the same compact grid treatment. */
.profile-section:has(> .section-heading > h2) .mini-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}
.profile-section:has(> .section-heading > h2) .mini-grid .mini-card{padding:7px 8px;min-width:0}
.profile-section:has(> .section-heading > h2) .mini-grid .mini-card span{font-size:9px;line-height:1.2}
.profile-section:has(> .section-heading > h2) .mini-grid .mini-card b{font-size:11px;line-height:1.25;overflow-wrap:anywhere}
.profile-section:has(> .section-heading > h2) .hero-list{margin-top:6px}
@media(max-width:520px){.profile-section:has(> .section-heading > h2) .mini-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}.profile-section:has(> .section-heading > h2) .mini-grid .mini-card{padding:6px}.profile-section:has(> .section-heading > h2) .mini-grid .mini-card span{font-size:8px}.profile-section:has(> .section-heading > h2) .mini-grid .mini-card b{font-size:10px}}
/* Dense profile facts: preserve every field, reduce card height on mobile. */
.mini-grid{gap:5px}.mini-card{padding:7px 8px;border-radius:8px;min-width:0}.mini-card span{font-size:10px;line-height:1.2}.mini-card b{margin-top:2px;font-size:12px;line-height:1.25;overflow-wrap:anywhere}.profile-section{margin-top:8px;padding:10px;border-radius:11px}.profile-section h2{margin-bottom:7px;font-size:15px}.section-heading{gap:6px}.section-heading h2{font-size:15px}.profile-identity{gap:7px}.profile-identity .mini-grid{gap:5px}@media(max-width:520px){.profile-section{margin-top:6px;padding:8px}.profile-section h2{margin-bottom:6px}.mini-grid{gap:4px}.mini-card{padding:6px}.mini-card span{font-size:9px}.mini-card b{font-size:11px}}.profile-section h2{margin:0 0 12px;font-size:18px}.alliance-collapsible{padding:0;overflow:hidden}.alliance-collapsible details{width:100%}.alliance-collapsible summary{list-style:none;cursor:pointer;padding:15px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px}.alliance-collapsible summary::-webkit-details-marker{display:none}.alliance-collapsible summary>span:first-child{min-width:0}.alliance-collapsible summary b{display:block;font-size:16px}.alliance-collapsible summary small{display:block;margin-top:3px;color:#94a3b8;font-size:10px}.collapse-mark{width:28px;height:28px;border-radius:9px;background:#162238;color:#f59e0b;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;flex:0 0 28px}.alliance-collapsible details[open] .collapse-mark{transform:rotate(45deg)}.collapse-body{padding:0 16px 16px}.mini-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.mini-card{padding:12px;border-radius:10px;background:#162238;border:1px solid #334155}.mini-card span{display:block;color:#94a3b8;font-size:11px}.mini-card b{display:block;margin-top:4px}.hero-stars-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:7px;padding:7px 10px;border:1px solid #334155;border-radius:9px;background:#0f172a}.hero-stars{display:flex;align-items:center;gap:2px;min-width:0}.hero-star{width:24px;height:24px;display:block;flex:0 0 24px;overflow:visible}.hero-star-petal{stroke:#9b7a28;stroke-width:1.05;stroke-linejoin:round}.hero-star-petal.is-filled{fill:#ffe98a}.hero-star-petal.is-empty{fill:#334155;opacity:.78}.hero-star-center{fill:#fff2ad;stroke:#9b7a28;stroke-width:1.05}.hero-star-divider{fill:none;stroke:#9b7a28;stroke-width:1.05;stroke-linecap:round}.hero-stars-label{font-size:12px;font-weight:800;color:#e2e8f0;white-space:nowrap}.hero-gear-section{margin-top:10px}.hero-gear-title{font-size:11px;font-weight:700;color:#94a3b8;margin-bottom:7px}.hero-gear-list{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}.hero-gear-item{min-width:0;text-align:center;padding:6px 4px;border:1px solid #334155;border-radius:9px;background:#0f172a}.hero-gear-image{width:48px;height:48px;display:block;margin:0 auto 4px;object-fit:contain;border-radius:8px;background:#111827;border:1px solid #475569}.hero-gear-image-empty{display:grid;place-items:center;color:#64748b;font-size:10px}.hero-gear-slot{display:block;font-size:9px;color:#cbd5e1;overflow-wrap:anywhere}.hero-gear-level{display:block;margin-top:2px;font-size:10px;font-weight:700;color:#fbbf24}.hero-gear-name{display:block;margin-top:2px;font-size:8px;color:#94a3b8;overflow-wrap:anywhere}.hero-list,.gear-list{display:grid;gap:10px;margin-top:12px}.hero-card,.gear-card{padding:13px;border:1px solid #334155;border-radius:11px;background:#162238}
/* Readability pass: restore text size and save height through layout, not tiny type. */
@media(max-width:520px){.profile-section:has(> .section-heading > h2) .mini-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}.profile-section:has(> .section-heading > h2) .mini-grid .mini-card{padding:6px 5px}.profile-section:has(> .section-heading > h2) .mini-grid .mini-card span{font-size:9px}.profile-section:has(> .section-heading > h2) .mini-grid .mini-card b{font-size:11px}.hero .sub{font-size:11px;line-height:1.25}.hero .profile-meta{font-size:10px;line-height:1.25}.hero .kid{font-size:16px}.hero-title-text strong{font-size:14px}.hero-name-line{display:flex;align-items:center;flex-wrap:wrap;gap:5px;min-width:0}.hero-troop-badge{display:inline-flex;align-items:center;gap:3px;font-size:10px;line-height:1.2;font-weight:700;white-space:nowrap;padding:2px 5px;border:1px solid var(--ee-border,#2a4664);border-radius:999px;color:var(--ee-text,#e8f3ff);background:var(--ee-panel-raised,#172a40)}.hero-troop-badge img{display:block;width:32px;height:32px;object-fit:contain;flex:0 0 32px}.hero-level{font-size:11px}.hero-inline-stars .hero-star{width:11px;height:11px;flex-basis:11px}.hero-inline-stars span{font-size:8px}.hero-meta{font-size:10px;line-height:1.3}.hero-gear-slot{font-size:9px}.hero-gear-level{font-size:9px}.hero-gear-name{font-size:8px}}
/* Compact layout pass: reduce repeated vertical spacing without hiding data. */
.wrap{padding-top:10px;padding-bottom:10px}.profile-section{margin-top:5px;padding:7px}.section-heading{margin-bottom:5px}.mini-grid{gap:3px}.mini-card{padding:5px}.hero{margin-top:5px;padding:7px;gap:5px}.player-avatar-main{width:34px;height:34px;flex-basis:34px}.hero h1{margin:1px 0;font-size:17px}.sub{font-size:10px;line-height:1.2}.profile-meta{gap:2px;font-size:9px;line-height:1.2}.hero .kid{font-size:15px;margin-top:2px}.hero-list{gap:4px;margin-top:5px}.hero-card{padding:5px}.hero-meta{margin-top:1px;font-size:9px;line-height:1.2}.hero-gear-section{margin-top:3px}.hero-gear-image{width:26px;height:26px;margin-bottom:1px}.hero-inline-stars{margin-top:1px}.hero-inline-stars .hero-star{width:10px;height:10px;flex-basis:10px}@media(max-width:520px){.wrap{padding:8px 7px}.profile-section{margin-top:4px;padding:6px}.hero{margin-top:4px;padding:6px}.player-avatar-main{width:32px;height:32px;flex-basis:32px}.hero h1{font-size:16px}.hero .kid{font-size:14px}.hero-card{padding:4px}.hero-gear-image{width:24px;height:24px}}
/* Compact player hero cards: preserve all stats and segmented stars while reducing vertical space. */
.hero-list{gap:5px;margin-top:7px}.hero-card{padding:7px 8px;border-radius:9px}.hero-head{gap:5px}.hero-title{gap:6px}.hero-icon{width:42px;height:42px;flex:0 0 42px}.hero-stars-row{margin-top:3px;padding:2px 5px;gap:5px}.hero-star{width:16px;height:16px;flex:0 0 16px}.hero-stars{gap:0}.hero-stars-label{font-size:9px}
.hero-inline-stars{display:flex;align-items:center;gap:2px;margin-top:2px;min-width:0}.hero-inline-stars .hero-star{width:11px;height:11px;flex:0 0 11px}.hero-inline-stars span{font-size:7px;color:#cbd5e1;white-space:nowrap}.hero-troop-badge{display:inline-flex;align-items:center;gap:4px;margin:4px 0 2px;padding:2px 7px;border:1px solid var(--ee-border);border-radius:6px;background:rgba(32,201,232,.10);color:var(--ee-text);font-size:11px;font-weight:800;line-height:1.5}.hero-inline-stars{align-items:center;flex-wrap:wrap;row-gap:3px}.hero-inline-stars .hero-troop-badge{align-self:center;margin:0 0 0 6px;padding:0 5px;gap:3px;font-size:10px;line-height:1;white-space:nowrap;flex:0 0 auto;min-height:28px;box-sizing:border-box}.hero-inline-stars .hero-troop-badge img{width:26px;height:26px;flex:0 0 26px}.hero-title-text{min-width:0}.hero-title-text strong{font-size:13px}.hero-level{font-size:10px;color:#94a3b8}.hero-meta{margin-top:2px;font-size:10px;line-height:1.25}.hero-gear-section{margin-top:4px}.hero-gear-title{margin-bottom:3px;font-size:9px}.hero-gear-list{grid-template-columns:repeat(4,minmax(0,1fr));gap:3px}.hero-gear-item{padding:3px 2px;border-radius:6px}.hero-gear-image{width:30px;height:30px;margin-bottom:2px;border-radius:5px}.hero-gear-slot{font-size:8px;line-height:1.1}.hero-gear-level{margin-top:1px;font-size:8px}.hero-gear-name{font-size:7px;line-height:1.1}.hero-gear-slot{font-size:9px}.hero-gear-name{overflow-wrap:anywhere}@media(max-width:520px){.hero-card{padding:6px}.hero-icon{width:38px;height:38px;flex-basis:38px}.hero-gear-list{gap:3px}.hero-gear-image{width:28px;height:28px}.hero-star{width:15px;height:15px;flex-basis:15px}.hero-stars-label{font-size:8px}}.optional-assets-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.optional-asset-card{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid #334155;border-radius:11px;background:#162238;min-width:0}.optional-asset-image{width:56px;height:56px;flex:0 0 56px;object-fit:contain;border-radius:10px;background:#0f172a;border:1px solid #475569}.optional-asset-info{min-width:0}.optional-asset-info b{display:block;font-size:12px;overflow-wrap:anywhere}.optional-asset-info span{display:block;margin-top:3px;color:#94a3b8;font-size:10px;overflow-wrap:anywhere}.profile-identity{display:flex;align-items:center;gap:10px}.profile-identity>div{min-width:0}.profile-identity span{display:block;color:#94a3b8;font-size:10px}.profile-identity b{display:block;margin-top:2px;font-size:12px}.profile-avatar{width:42px;height:42px;border-radius:10px;object-fit:cover;background:#0f172a;border:1px solid #475569}.player-identity-main{display:flex;align-items:center;gap:11px;min-width:0}
/* Tighten player profile header without removing identity metadata. */
.hero{margin-top:10px;padding:12px;gap:8px;border-radius:12px}.player-identity-main{gap:7px}.player-avatar-main{width:40px;height:40px;flex-basis:40px;border-radius:9px}.eyebrow{font-size:9px;letter-spacing:1.5px}.hero h1{margin:2px 0;font-size:20px}.sub{font-size:11px;line-height:1.3}.profile-meta{gap:3px;font-size:10px;line-height:1.3}.hero .kid{font-size:18px;margin-top:4px}.hero .section-export{padding:4px 6px;font-size:9px}@media(max-width:520px){.hero{margin-top:8px;padding:10px}.player-avatar-main{width:36px;height:36px;flex-basis:36px}.hero h1{font-size:18px}.hero .kid{font-size:16px}}.player-avatar-main{width:48px;height:48px;flex:0 0 48px;border-radius:12px;object-fit:cover;background:#0f172a;border:1px solid #475569}.player-avatar-empty{display:flex;align-items:center;justify-content:center;color:#64748b;font-size:17px}.flag-value{display:flex!important;align-items:center;gap:7px}.alliance-flag{width:24px;height:24px;border-radius:6px;object-fit:cover;background:#0f172a;border:1px solid #475569}.hero-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.hero-title{display:flex;align-items:center;gap:10px;min-width:0}.hero-title>div{min-width:0}.hero-title strong{display:block;font-size:15px;overflow-wrap:anywhere}.hero-icon{width:42px;height:42px;flex:0 0 42px;border-radius:9px;object-fit:cover;background:#0f172a;border:1px solid #475569}.hero-icon-empty{display:flex;align-items:center;justify-content:center;color:#64748b;font-size:16px}.hero-level{margin-top:2px;color:#94a3b8;font-size:11px;font-weight:700}.hero-head span{display:inline-flex;flex:0 0 auto;padding:3px 7px;border-radius:999px;background:#0f172a;color:#94a3b8;font-size:10px;margin:0}.hero-meta{display:block;color:#cbd5e1;font-size:12px;line-height:1.55;margin-top:7px;overflow-wrap:anywhere}.hero-meta:first-of-type{color:#f8fafc;font-weight:700}.detail-list{display:grid;gap:7px;margin-top:10px}.detail-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 10px;border-radius:9px;background:#162238;border:1px solid #334155}.detail-row span{color:#cbd5e1;font-size:12px;min-width:0;overflow-wrap:anywhere}.detail-row b{color:#f8fafc;font-size:12px;white-space:nowrap}.ranking-group-title{margin:14px 0 8px;font-size:13px;color:#f59e0b}.gear-card strong{display:block;font-size:14px}.gear-head{display:flex;align-items:center;gap:10px}.gear-head>div{min-width:0}.gear-icon{width:44px;height:44px;flex:0 0 44px;border-radius:9px;object-fit:cover;background:#0f172a;border:1px solid #475569}.gear-icon-empty{display:flex;align-items:center;justify-content:center;color:#64748b;font-size:16px}.gear-name{margin-top:2px;color:#94a3b8;font-size:10px;overflow-wrap:anywhere}.gear-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:9px}.gear-stat{padding:7px 8px;border-radius:8px;background:#0f172a;color:#94a3b8;font-size:11px;line-height:1.35}.gear-stat b{display:block;color:#e2e8f0;font-size:12px;margin-top:2px;overflow-wrap:anywhere}.gear-gems{margin-top:8px;padding:8px 9px;border-radius:8px;background:#0f172a;color:#94a3b8;font-size:11px;line-height:1.5;overflow-wrap:anywhere}.gear-gems b{color:#e2e8f0}.name-history-list{display:grid;gap:8px}.name-history-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:10px;background:#162238;border:1px solid #334155}.name-history-row strong{display:block;overflow-wrap:anywhere}.name-history-row span{display:inline-block;margin-left:7px;color:#f59e0b;font-size:10px}.name-history-row small{color:#94a3b8;font-size:10px;text-align:right;white-space:nowrap}.message{padding:14px;border:1px solid #334155;border-radius:12px;background:#111c31;color:#cbd5e1}.notice{margin-top:14px;padding:12px 14px;border:1px solid #7f1d1d;border-radius:10px;background:#2a1115;color:#fecaca;font-size:12px;line-height:1.6}.search{margin-top:18px;display:flex;gap:8px}.search input{flex:1;padding:12px;border-radius:10px;border:1px solid #334155;background:#0b1220;color:white}.search button{padding:12px 15px;border:0;border-radius:10px;background:#f59e0b;color:#111827;font-weight:900}@media(max-width:520px){.hero{display:block}.kid{margin-top:12px}.grid{grid-template-columns:1fr}.mini-grid{grid-template-columns:1fr}.gear-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.detail-row{align-items:flex-start}.detail-row b{white-space:normal;text-align:right}}
  
  /* EagleEye shared theme alignment */
  body{background:var(--ee-bg,#050b14);color:var(--ee-text,#eff8ff)}
  .wrap{max-width:820px;padding:22px 16px}
  .back{color:var(--ee-cyan,#20d7f2)}
  .hero,.card,.profile-section,.hero-card,.gear-card,.detail-row,.mini-card,.message{background:var(--ee-panel,#0a1728);border-color:var(--ee-line,#23415f)}
  .hero{box-shadow:0 12px 32px rgba(0,0,0,.16)}
  .eyebrow,.kid,.ranking-group-title{color:var(--ee-cyan,#20d7f2)}
  .section-export{border-color:var(--ee-line,#23415f);background:var(--ee-panel2,#0d2035);color:var(--ee-cyan,#20d7f2)}
  .action{border-color:var(--ee-line,#23415f);background:var(--ee-panel2,#0d2035)}
  .action.primary{background:var(--ee-cyan,#20d7f2);border-color:var(--ee-cyan,#20d7f2);color:#04111c}
  .label,.sub,.meta,.detail-row span,.hero-meta,.profile-language{color:var(--ee-sub,#8098b0)}
  .value,.detail-row b,.mini-card b,.hero h1{color:var(--ee-text,#eff8ff)}
  .other-ranking-list .detail-row{border-left:3px solid var(--ee-cyan,#20d7f2)}
  .hero-stars-row,.mini-card,.gear-stat,.gear-gems{background:var(--ee-panel2,#0d2035);border-color:var(--ee-line,#23415f)}
  @media(max-width:520px){.wrap{padding:16px 12px}.profile-section{padding:13px}.hero{padding:16px}}

  .ranking-dashboard .section-heading{margin-bottom:10px}
  .favorite-rankings-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
  .favorite-ranking-card{min-width:0;background:var(--ee-panel2,#0d2035);border:1px solid var(--ee-line,#23415f);border-radius:10px;padding:9px 6px;display:flex;flex-direction:column;gap:7px}
  .favorite-ranking-label{font-size:clamp(9px,2.4vw,12px);line-height:1.25;color:var(--ee-sub,#8098b0);overflow-wrap:anywhere;min-height:2.5em}
  .favorite-ranking-score{font-size:clamp(11px,3vw,16px);font-weight:800;color:var(--ee-text,#eff8ff);line-height:1.2;overflow-wrap:anywhere}
  .favorite-ranking-rank{font-size:clamp(10px,2.5vw,12px);font-weight:700;color:var(--ee-cyan,#20d7f2)}
  .ranking-dashboard-actions{display:flex;gap:8px;margin-top:10px}
  .ranking-dashboard-actions button,.ranking-settings-footer button{font:inherit;font-size:12px;border:1px solid var(--ee-line,#23415f);border-radius:9px;padding:8px 10px;background:var(--ee-panel2,#0d2035);color:var(--ee-cyan,#20d7f2);cursor:pointer}
  .ranking-rest-toggle{flex:1;text-align:left}
  .ranking-settings-panel,.ranking-rest-panel{margin-top:10px;padding:10px;border:1px solid var(--ee-line,#23415f);border-radius:12px;background:var(--ee-panel,#0a1728)}
  .ranking-settings-heading{display:flex;justify-content:space-between;gap:8px;color:var(--ee-text,#eff8ff);font-size:13px;margin-bottom:8px}
  .ranking-settings-heading span{color:var(--ee-cyan,#20d7f2)}
  .ranking-settings-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
  .ranking-setting-option{display:flex;align-items:center;gap:7px;min-width:0;padding:8px;border:1px solid var(--ee-line,#23415f);border-radius:8px;color:var(--ee-text,#eff8ff);font-size:12px}
  .ranking-setting-option input{accent-color:var(--ee-cyan,#20d7f2);flex-shrink:0}
  .ranking-settings-footer{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}
  .ranking-rest-panel .detail-row{border-left:3px solid var(--ee-cyan,#20d7f2)}
  @media(max-width:360px){.favorite-rankings-grid{gap:4px}.favorite-ranking-card{padding:7px 4px}.ranking-dashboard-actions button{font-size:11px;padding:7px 6px}}
</style></head><body><main class="wrap"><a class="back" href="/">← EagleEye</a><form class="search" method="get" action="/player"><input name="governor_id" value="${esc(governorId)}" placeholder="領主ID"><button>検索</button></form>${content}</main><script>
(function(){
  const btn=document.getElementById("player-watchlist-toggle");
  if(!btn)return;
  const gid=btn.dataset.governorId;
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  async function sync(){
    try{
      const r=await fetch("/api/player-watchlist",{cache:"no-store"});const d=await r.json();
      if(!r.ok||!d.ok){
        window.__eagleEyePlayerWatchlistCount=null;
        if(typeof window.__eagleEyeSetPlayerWatchlistCount==="function")window.__eagleEyeSetPlayerWatchlistCount(null);
        return;
      }
      window.__eagleEyePlayerWatchlistCount=(d.watchlist||[]).filter(function(item){return item.enabled!==false;}).length;
      if(typeof window.__eagleEyeSetPlayerWatchlistCount==="function")window.__eagleEyeSetPlayerWatchlistCount(window.__eagleEyePlayerWatchlistCount);
      const item=(d.watchlist||[]).find(x=>String(x.governor_id)===String(gid));
      btn.dataset.watching=item?"1":"0";
      btn.textContent=item?(item.enabled?"★ ウォッチ中":"☆ ウォッチ再開"):"☆ ウォッチリスト";
    }catch{
      window.__eagleEyePlayerWatchlistCount=null;
      if(typeof window.__eagleEyeSetPlayerWatchlistCount==="function")window.__eagleEyeSetPlayerWatchlistCount(null);
    }
  }
  btn.addEventListener("click",async()=>{
    btn.disabled=true;
    try{
      const watching=btn.dataset.watching==="1";
      if(watching){
        const r=await fetch("/api/player-watchlist?governor_id="+encodeURIComponent(gid),{method:"DELETE"});
        if(!r.ok)throw new Error("ウォッチリストから削除できませんでした");
      }else{
        const r=await fetch("/api/player-watchlist",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({governor_id:gid})});
        if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||"ウォッチリストに追加できませんでした");}
      }
      await sync();
    }catch(e){btn.textContent="エラー: "+esc(e.message)}
    finally{btn.disabled=false}
  });
  sync();
})();
</script><script>
(function(){
  const root=document.querySelector("[data-ranking-dashboard]");
  if(!root)return;
  const dataNode=root.querySelector("[data-ranking-data]");
  let boards=[];try{boards=JSON.parse(dataNode?.textContent||"[]")}catch(_){}
  const key="eagleeye-ranking-favorites:"+String(root.dataset.playerKey||"");
  const defaults=["personal_power","kills","coliseum","crystal_cave"];
  const grid=root.querySelector("[data-favorite-grid]");
  const rest=root.querySelector("[data-ranking-rest-list]");
  const restPanel=root.querySelector("[data-ranking-rest-panel]");
  const settingsPanel=root.querySelector("[data-ranking-settings-panel]");
  const settingsList=root.querySelector("[data-ranking-settings-list]");
  const count=root.querySelector("[data-ranking-selection-count]");
  const restCount=root.querySelector("[data-rest-count]");
  const restToggle=root.querySelector("[data-ranking-rest-toggle]");
  let favorites=defaults.filter(k=>boards.some(b=>b.key===k)).slice(0,4);
  try{const saved=JSON.parse(localStorage.getItem(key)||"null");if(Array.isArray(saved))favorites=saved.filter(k=>boards.some(b=>b.key===k)).slice(0,4)}catch(_){}
  while(favorites.length<Math.min(4,boards.length)){const next=boards.find(b=>!favorites.includes(b.key));if(!next)break;favorites.push(next.key)}
  let draft=favorites.slice();
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const renderCard=b=>'<div class="favorite-ranking-card"><div class="favorite-ranking-label">'+esc(b.label)+'</div><div class="favorite-ranking-score">'+(b.rank!==undefined&&b.rank!==null&&b.rank!==""?esc(b.rank)+"位":"順位なし")+'</div><div class="favorite-ranking-rank">スコア '+esc(b.displayScore??(b.score!==undefined&&b.score!==null?b.score:"-"))+'</div></div>';
  const renderRow=b=>'<div class="detail-row"><span>'+esc(b.label)+'</span><b>'+(b.rank!==undefined&&b.rank!==null&&b.rank!==""?esc(b.rank)+"位":"順位なし")+' <small>（スコア '+esc(b.score!==undefined&&b.score!==null?String(b.score).length>8?Number(b.score).toLocaleString("en-US",{notation:"compact",maximumFractionDigits:2}):b.score:"-")+'）</small></b></div>';
  function render(){grid.innerHTML=favorites.map(k=>boards.find(b=>b.key===k)).filter(Boolean).map(renderCard).join("");const others=boards.filter(b=>!favorites.includes(b.key));rest.innerHTML=others.map(renderRow).join("")||'<div class="detail-row"><span>ほかのランキングはありません</span></div>';restCount.textContent=others.length?"("+others.length+"項目)":"";restToggle.hidden=others.length===0;}
  function renderSettings(){settingsList.innerHTML=boards.map(b=>'<label class="ranking-setting-option"><input type="checkbox" value="'+esc(b.key)+'" '+(draft.includes(b.key)?"checked":"")+' '+(!draft.includes(b.key)&&draft.length>=4?"disabled":"")+'><span>'+esc(b.label)+'</span></label>').join("");count.textContent=draft.length+" / 4";settingsList.querySelectorAll("input").forEach(input=>input.addEventListener("change",()=>{if(input.checked){if(draft.length<4)draft.push(input.value)}else draft=draft.filter(k=>k!==input.value);renderSettings()}));}
  root.querySelector("[data-ranking-settings-toggle]").addEventListener("click",()=>{settingsPanel.hidden=!settingsPanel.hidden;draft=favorites.slice();renderSettings()});
  root.querySelector("[data-ranking-settings-cancel]").addEventListener("click",()=>{settingsPanel.hidden=true;draft=favorites.slice()});
  root.querySelector("[data-ranking-settings-save]").addEventListener("click",()=>{if(draft.length!==4){count.textContent="4項目選択してください";return}favorites=draft.slice();try{localStorage.setItem(key,JSON.stringify(favorites))}catch(_){}settingsPanel.hidden=true;render()});
  restToggle.addEventListener("click",()=>{const open=restPanel.hidden;restPanel.hidden=!open;restToggle.setAttribute("aria-expanded",String(open));restToggle.querySelector("[data-rest-chevron]").textContent=open?"－":"＋";restToggle.childNodes[0].textContent=open?"残りのランキングを閉じる ":"残りのランキングを表示 "});
  render();
})();
</script></main></body></html>`;
}

const HERO_NAME_JA = {
  Howard: "ハワード", Zoe: "ゾーイ", Chenko: "チェンコ", Jabel: "ジェベル", Rosa: "ローザ",
  Amadeus: "アマデウス", Marlin: "マーリン", Hilde: "ヒルデ", Petra: "ペーラ",
  Jaeger: "イェーガー", Eric: "エリック", Alcar: "アルカ", Margot: "マーゴ",
  Vivian: "ビビアン", "Long Fei": "龍飛", Thrud: "スルード", Yang: "ヤン",
  Triton: "トリトン", Sophia: "ソフィア", Ava: "エヴァ", Charles: "チャールズ",
  "Wee & Woo": "レン&ロン", Yeonwoo: "インウー", Amane: "あまね",
  Helga: "ヘルガ", Saul: "サロ", Gordon: "ゴードン", Quinn: "クイン",
  Fahd: "ファハド", Diana: "ダイアナ", Olive: "オリーブ", Forrest: "フォルスト",
  Edwin: "エドウィン", Seth: "セス", Diego: "ディエゴ", Liz: "リズ", Luna: "ルナ"
};
const HERO_GEAR_SLOT_JA = {
  helmet: "兜", helm: "兜", head: "兜",
  gloves: "手袋", glove: "手袋", gauntlets: "手袋", gauntlet: "手袋",
  armor: "鎧", armour: "鎧", chest: "鎧", chestplate: "鎧",
  boots: "靴", boot: "靴", footwear: "靴"
};
const HERO_GEAR_NAME_JA = {
  Helmet: "兜", Helm: "兜", Gloves: "手袋", Glove: "手袋",
  Armor: "鎧", Armour: "鎧", Boots: "靴", Boot: "靴",
  "Exclusive Gear": "専用装備", Weapon: "武器", Ring: "指輪",
  Necklace: "首飾り", Accessory: "装飾品"
};
const HERO_EXCLUSIVE_GEAR_JA = { "The Unrighteous": "不義", "Banner of Faith": "信仰の旗", Aeolian: "エオリアン" };
const GOVERNOR_GEAR_SLOT_JA = {
  head: "帽子", helmet: "帽子", hat: "帽子",
  necklace: "装飾", accessory: "装飾", ornament: "装飾", decoration: "装飾",
  cloak: "ローブ", robe: "ローブ", mantle: "ローブ",
  pants: "ズボン", trousers: "ズボン",
  ring: "指輪",
  weapon: "杖", staff: "杖", rod: "杖"
};
const GOVERNOR_GEAR_TIER_JA = {
  Green: "グッド",
  Blue: "レア",
  Purple: "エピック",
  Gold: "レジェンド",
  Red: "神話"
};
const GOVERNOR_GEAR_QUALITY_JA = {
  Green: "グッド", Blue: "レア", Purple: "エピック", Gold: "レジェンド", Red: "神話",
  Common: "通常", Rare: "レア", Epic: "エピック", Legendary: "レジェンド", Mythic: "神話"
};

function localizeHeroName(value) { return HERO_NAME_JA[value] || value || "-"; }
function localizeHeroGearSlot(value) {
  const raw = String(value ?? "").trim();
  const key = raw.toLowerCase().replace(/[ _-]+/g, "");
  return HERO_GEAR_SLOT_JA[key] || HERO_GEAR_NAME_JA[raw] || (/[A-Za-z]/.test(raw) ? "装備" : raw) || "-";
}
function localizeHeroGearName(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (HERO_GEAR_NAME_JA[raw]) return HERO_GEAR_NAME_JA[raw];
  const slot = localizeHeroGearSlot(raw);
  return slot !== "装備" ? slot : (/[A-Za-z]/.test(raw) ? "" : raw);
}
function localizeExclusiveGearName(value) { return HERO_EXCLUSIVE_GEAR_JA[value] || value || "-"; }
function localizeGovernorGearSlot(value) {
  const raw = String(value ?? "").trim();
  const key = raw.toLowerCase().replace(/[ _-]+/g, "_");
  return GOVERNOR_GEAR_SLOT_JA[key] || GOVERNOR_GEAR_SLOT_JA[raw.toLowerCase()] || raw || "-";
}
function localizeGovernorGearQuality(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  return GOVERNOR_GEAR_QUALITY_JA[raw] || raw;
}

function localizeGovernorGearTier(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const match = raw.match(/^(Green|Blue|Purple|Gold|Red)(?:[ _-]?T(\d+))?$/i);
  if (!match) return raw;
  const base = GOVERNOR_GEAR_TIER_JA[match[1][0].toUpperCase() + match[1].slice(1).toLowerCase()] || match[1];
  return match[2] ? base + " T" + match[2] : base;
}

const LEADERBOARD_NAME_JA = {
  "Personal Power": "個人総力",
  "Kill Count": "個人撃破",
  "Town Center Level": "役場Lv.",
  "Migrant Score": "移民スコア",
  "Mystic Trial": "秘境の試練",
  "Coliseum": "闘技場",
  "Forest of Life": "生命の森",
  "Crystal Cave": "水晶鉱山",
  "Knowledge Nexus": "知識の枢軸",
  "Molten Fort": "溶岩要塞",
  "Radiant Spire": "輝光の塔",
  "Master Power": "マスター全体総力"
};
function localizeLeaderboardLabel(board) {
  const candidates = [board?.key, board?.board, board?.name, board?.label].filter(Boolean);
  for (const candidate of candidates) {
    if (RANKING_BOARD_LABELS[candidate]) return RANKING_BOARD_LABELS[candidate];
    if (LEADERBOARD_NAME_JA[candidate]) return LEADERBOARD_NAME_JA[candidate];
  }
  return candidates[0] || "ランキング";
}

async function getLatestPlayerHeroRankings(db, kid, governorId) {
  if (!db || kid === undefined || kid === null || !governorId) return [];
  const result = await db.prepare(
    `SELECT board, rank, score, observed_at
     FROM kingdom_ranking_current
     WHERE kid = ?
       AND target_type = 'PLAYER'
       AND target_id = ?
       AND board IN ('single_hero', 'hero_total', 'hero_no_equip', 'hero_equip')
     ORDER BY CASE board
       WHEN 'single_hero' THEN 1
       WHEN 'hero_total' THEN 2
       WHEN 'hero_no_equip' THEN 3
       WHEN 'hero_equip' THEN 4
       ELSE 99
     END`
  ).bind(Number(kid), String(governorId)).all();
  return result.results || [];
}

function localizeGemLevel(gem) {
  const direct = gem?.level ?? gem?.lv ?? gem?.gem_level;
  if (direct !== null && direct !== undefined && direct !== "") return String(direct);

  // MightPulseの宝石データがID文字列/数値として返るケースにも対応。
  const raw = String(
    gem && typeof gem === "object"
      ? (gem.id ?? "")
      : (gem ?? "")
  ).trim();

  const match = raw.match(/^(\d)0\1$/);
  return match ? match[1] : "";
}

function formatProfileValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function normalizeProfileAssetUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return "https://api.mightpulse.com" + (raw.startsWith("/") ? raw : "/" + raw);
}

function renderSegmentedHeroStar(label, filledSegments = 0) {
  const aria = escapeHtml(label || "Star");
  const filled = Math.max(0, Math.min(6, Math.floor(Number(filledSegments) || 0)));

  // ゲーム内の英雄ランク表示は「6個のダイヤ形パーツを中心で接続」
  // した花形。各ダイヤを独立した1セグメントとして描画する。
  const cx = 20;
  const cy = 20;
  const innerRadius = 1.2;
  const outerRadius = 17.2;
  const sideRadius = 7.8;
  const sideWidth = 4.2;
  const petals = [];

  for (let i = 0; i < 6; i += 1) {
    const angle = -Math.PI / 2 + i * (Math.PI / 3);
    const radial = [Math.cos(angle), Math.sin(angle)];
    const tangent = [-Math.sin(angle), Math.cos(angle)];
    const point = (radius, width) => [
      cx + radial[0] * radius + tangent[0] * width,
      cy + radial[1] * radius + tangent[1] * width
    ];

    // 1枚のダイヤ：中心側の先端 → 左肩 → 外側の先端 → 右肩。
    petals.push([
      point(innerRadius, 0),
      point(sideRadius, -sideWidth),
      point(outerRadius, 0),
      point(sideRadius, sideWidth)
    ]);
  }

  const segments = petals.map((points, index) =>
    '<polygon class="hero-star-petal ' + (index < filled ? 'is-filled' : 'is-empty') + '" points="' +
    points.map(point => point.join(",")).join(" ") +
    '"></polygon>'
  ).join("");

  return '<svg class="hero-star" viewBox="0 0 40 40" role="img" aria-label="' + aria + '" focusable="false">' +
    segments +
    '</svg>';
}
function renderPlayerOptionalAssets(assets, canExport = false) {
  const list = Array.isArray(assets) ? assets : [];
  if (!list.length) return "";
  const esc = escapeHtml;
  const image = item => {
    const url = normalizeProfileAssetUrl(item?.url || item?.icon || item?.image);
    if (!url) return "";
    return '<img class="optional-asset-image" src="' + esc(url) + '" alt="" loading="lazy">';
  };
  const label = item => {
    const path = String(item?.path || "").trim();
    if (/castle|city/i.test(path)) return "城スキン";
    if (/march/i.test(path)) return "行軍スキン";
    if (/frame/i.test(path)) return "プロフィールフレーム";
    if (/avatar|profile/i.test(path)) return "プロフィール素材";
    if (/skin/i.test(path)) return "スキン";
    return "追加素材";
  };
  const cards = list.map(item => '<div class="optional-asset-card">' +
    image(item) +
    '<div class="optional-asset-info"><b>' + esc(item?.label || label(item)) + '</b><span>' + esc(item?.name || item?.type || item?.path || "取得データ") + '</span></div>' +
    '</div>').join("");
  return '<section class="profile-section"><div class="section-heading"><h2>プロフィール素材</h2>' +
    (canExport ? '<span class="label">追加素材は取得できたもののみ表示</span>' : '') +
    '</div><div class="optional-assets-list">' + cards + '</div></section>';
}

function renderPlayerAdvancedSections(profile, governorId = "", canExport = false) {
  const exportButton = (section) => canExport && governorId
    ? '<a class="section-export" href="/api/admin/player-export?governor_id=' + encodeURIComponent(governorId) + '&section=' + encodeURIComponent(section) + '">スプレッドシート出力</a>'
    : "";
  const p = profile || {};
  const esc = escapeHtml;
  let html = "";
  const heroes = Array.isArray(p.heroes) ? p.heroes : [];

  // 同盟の概要はプロフィール上部にあるため、独立した折りたたみカードは表示しない。
  // 追加の同盟データは補助情報としてプロフィールに集約し、データ自体は保持する。
  if (p.alliance && typeof p.alliance === "object") {
    const a = p.alliance;
    const details = [
      a.aid ? "同盟ID " + formatProfileValue(a.aid) : "",
      a.rank !== undefined || a.rank_label ? "同盟内順位 " + [a.rank_label, a.rank != null ? a.rank + "位" : ""].filter(Boolean).join(" ") : "",
      a.power !== undefined ? "同盟戦力 " + formatCompactNumber(a.power) : "",
      a.count !== undefined ? "同盟人数 " + formatProfileValue(a.count) : "",
      a.leader_name ? "盟主 " + formatProfileValue(a.leader_name) : ""
    ].filter(Boolean);
    if (details.length) html += '<div class="alliance-profile-details">' + details.map(value => '<span>' + esc(value) + '</span>').join('') + '</div>';
    if (canExport && governorId) html += '<div class="profile-alliance-export">' + exportButton("alliance") + '</div>';
  }

  if (heroes.length) {
    const maxLevel = heroes.reduce((max, hero) => Math.max(max, Number(hero.level) || 0), 0);
    const heroRankings = Array.isArray(p.hero_rankings) ? p.hero_rankings : [];
    const heroRankingLabels = {
      single_hero: "英雄総力",
      hero_total: "英雄全体総力",
      hero_no_equip: "英雄総力（装備除外）",
      hero_equip: "英雄総力（装備込み）"
    };
    html += '<section class="profile-section"><div class="section-heading"><h2>英雄</h2>' + exportButton("heroes") + '</div>' + (heroRankings.length ? '<div class="mini-grid">' : "");
    for (const ranking of heroRankings) {
      html += '<div class="mini-card"><span>' + esc(heroRankingLabels[ranking.board] || ranking.board) + '</span><b>' + esc(formatCompactNumber(ranking.score)) + ' / ' + esc(ranking.rank ?? "-") + '位</b></div>';
    }
    html += (heroRankings.length ? "</div>" : "") + '<div class="mini-grid"><div class="mini-card"><span>最高レベル</span><b>Lv.' + esc(maxLevel || "-") + '</b></div><div class="mini-card"><span>取得英雄数</span><b>' + esc(heroes.length) + '</b></div></div><div class="hero-list">';
    heroes.forEach(hero => {
      const gear = Array.isArray(hero.gear) ? hero.gear : [];
      const heroName = localizeHeroName(hero.name || hero.id);
      const troopRaw = [hero.troop_type, hero.unit_type, hero.army_type].find(value => value != null && String(value).trim() !== "");
      const troopText = (() => {
        const value = String(troopRaw ?? "").trim().toLowerCase();
        if (/infantry|步兵|歩兵/.test(value)) return "歩兵";
        if (/cavalry|骑兵|騎兵/.test(value)) return "騎兵";
        if (/archer|marksman|弓兵|射手/.test(value)) return "弓兵";
        const key = String(hero.name || hero.id || "").trim().toLowerCase().replace(/[ _-]+/g, "");
        const verifiedHeroTroops = {
          amadeus: "歩兵", alcar: "歩兵", charles: "歩兵", chenko: "騎兵",
          diana: "弓兵", edwin: "騎兵", eric: "歩兵", fahd: "騎兵",
          forrest: "歩兵", gordon: "騎兵", helga: "歩兵", hilde: "騎兵",
          howard: "歩兵", jaeger: "弓兵", jabel: "騎兵", longfei: "歩兵",
          marlin: "弓兵", margot: "騎兵", olive: "弓兵", petra: "騎兵",
          quinn: "弓兵", rosa: "弓兵", saul: "弓兵", seth: "歩兵",
          sophia: "騎兵", thrud: "騎兵", triton: "歩兵", vivian: "弓兵",
          "wee&woo": "弓兵", yang: "弓兵", yeonwoo: "弓兵", zoe: "歩兵",
          amane: "弓兵", ava: "騎兵"
        };
        return verifiedHeroTroops[key] || "";
      })();
      const troopIconUrl = troopText === "歩兵" ? "/assets/eagleeye/hero-troop/infantry.PNG"
        : troopText === "騎兵" ? "/assets/eagleeye/hero-troop/cavalry.PNG"
        : troopText === "弓兵" ? "/assets/eagleeye/hero-troop/archer.PNG" : "";
      const rawStarProgress = Number(hero.star);
      const hasStarProgress = Number.isFinite(rawStarProgress);
      const starProgress = hasStarProgress ? Math.max(0, Math.floor(rawStarProgress)) : 0;
      const labelMatch = String(hero.star_label ?? "").match(/\d+/);
      const wholeStarCount = Number.isFinite(Number(hero.stars))
        ? Math.max(0, Math.floor(Number(hero.stars)))
        : (labelMatch ? Number(labelMatch[0]) : (hasStarProgress ? Math.floor(starProgress / 6) : 0));
      const starLabel = hero.star_label || (wholeStarCount > 0 ? (wholeStarCount + "-Star") : "Star -");

      // MightPulse の raw hero.star は、画面上の星数ではなく6分割単位の進捗値として観測される。
      // 例: star=30 / stars=5 → 5個すべて満タン、star=27 / stars=4 → 4個満タン + 5個目3/6。
      let starSegments;
      if (hasStarProgress) {
        const fullStars = Math.min(5, Math.floor(starProgress / 6));
        const partialSegments = Math.min(6, starProgress % 6);
        starSegments = Array.from({ length: 5 }, (_, index) => {
          if (index < fullStars) return 6;
          if (index === fullStars && partialSegments > 0) return partialSegments;
          return 0;
        });
      } else {
        const fullStars = Math.min(5, wholeStarCount);
        starSegments = Array.from({ length: 5 }, (_, index) => index < fullStars ? 6 : 0);
      }

      const starIcons = starSegments.map(segments => renderSegmentedHeroStar(starLabel, segments)).join("");
      const heroIconUrl = normalizeProfileAssetUrl(hero.icon);
      html += '<article class="hero-card"><div class="hero-head"><div class="hero-title">' +
        (heroIconUrl ? '<img class="hero-icon" src="' + esc(heroIconUrl) + '" alt="" loading="lazy">' : '<span class="hero-icon hero-icon-empty">?</span>') +
        '<div class="hero-title-text"><div class="hero-name-line"><strong>' + esc(heroName) + '</strong></div><div class="hero-level">Lv.' + esc(hero.level ?? "-") + '</div><div class="hero-inline-stars" aria-label="' + esc(starLabel) + '">' + starIcons + '<span>' + esc(starLabel) + '</span>' + (troopText ? '<span class="hero-troop-badge" aria-label="兵種：' + esc(troopText) + '"><img src="' + esc(troopIconUrl) + '" alt="" loading="lazy">' + esc(troopText) + '</span>' : '') + '</div></div></div>' +
        '<span>' + esc(hero.position ? "配置 " + hero.position : "") + '</span></div>';
      html += '<div class="hero-meta">品質 ' + esc(hero.quality ?? "-") + ' / 戦力 ' + esc(formatCompactNumber(hero.power)) + '</div>';
      if (hero.skill_levels) html += '<div class="hero-meta">スキル: ' + esc(hero.skill_levels.map((s, i) => "スキル" + (i + 1) + " Lv." + (s.level ?? "-")).join(" / ")) + '</div>';
      if (hero.exclusive_gear || hero.exclusive_gear_level !== undefined) {
        const eg = hero.exclusive_gear || {};
        html += '<div class="hero-meta">専用装備: ' + esc(localizeExclusiveGearName(eg.name)) + ' Lv.' + esc(hero.exclusive_gear_level ?? eg.level ?? "-") + '</div>';
      }
      if (gear.length) {
        html += '<div class="hero-gear-section"><div class="hero-gear-title">英雄通常装備</div><div class="hero-gear-list">';
        for (const item of gear) {
          const iconUrl = normalizeProfileAssetUrl(item?.icon);
          const slotLabel = localizeHeroGearSlot(item?.slot || item?.name);
          const level = item?.enhancement_level ?? item?.level ?? "-";
          const name = localizeHeroGearName(item?.name || item?.slot || "");
          html += '<div class="hero-gear-item">';
          html += iconUrl
            ? '<img class="hero-gear-image" src="' + esc(iconUrl) + '" alt="" loading="lazy">'
            : '<div class="hero-gear-image hero-gear-image-empty">画像なし</div>';
          html += '<span class="hero-gear-slot">' + esc(slotLabel) + '</span>';
          html += '<span class="hero-gear-level">+' + esc(level) + '</span>';
          if (name && name !== item?.slot) html += '<span class="hero-gear-name">' + esc(name) + '</span>';
          html += '</div>';
        }
        html += '</div></div>';
      }
      html += '</article>';
    });
    html += '</div></section>';
  }

  if (p.ranks && typeof p.ranks === "object") {
    const r = p.ranks;
    const coreBoards = [
      { key: "personal_power", label: "個人総力", score: r.power, displayScore: formatCompactNumber(r.power), rank: r.power_rank },
      { key: "kills", label: "個人撃破", score: r.kills, displayScore: formatCompactNumber(r.kills), rank: r.kills_rank },
      { key: "town_center", label: "役場Lv.", score: r.town_center_level, displayScore: formatCompactNumber(r.town_center_level), rank: r.town_center_rank },
      { key: "migrant_score", label: "移民スコア", score: r.migrant_score, displayScore: formatCompactNumber(r.migrant_score), rank: r.migrant_rank },
      { key: "mystic_trial", label: "秘境の試練", score: r.mystic_trial, displayScore: formatCompactNumber(r.mystic_trial), rank: r.mystic_rank }
    ].filter(item => item.score !== undefined || item.rank !== undefined);
    const aliases = {
      "Personal Power":"personal_power", "個人総力":"personal_power", "戦力":"personal_power",
      "Kill Count":"kills", "個人撃破":"kills", "撃破数":"kills",
      "Town Center Level":"town_center", "役場Lv.":"town_center", "役場":"town_center",
      "Migrant Score":"migrant_score", "移民スコア":"migrant_score",
      "Mystic Trial":"mystic_trial", "秘境の試練":"mystic_trial"
    };
    const boards = [...coreBoards, ...(Array.isArray(r.leaderboards) ? r.leaderboards.map((board, index) => {
      const candidates = [board?.key, board?.board, board?.id, board?.name, board?.label].filter(Boolean).map(String);
      const key = candidates.map(value => aliases[value] || value).find(value => Object.values(aliases).includes(value) || /^[a-z][a-z0-9_]*$/.test(value)) || "other_" + index;
      return { key, label: localizeLeaderboardLabel(board), score: board?.score ?? board?.value ?? board?.rank_value, displayScore: formatCompactNumber(board?.score ?? board?.value ?? board?.rank_value), rank: board?.rank ?? board?.ranking ?? board?.rank_no };
    }).filter(item => !coreBoards.some(core => core.key === item.key)) : [])];
    const boardJson = JSON.stringify(boards).replace(/</g, "\\u003c");
    html += '<section class="profile-section ranking-dashboard" data-ranking-dashboard data-player-key="' + esc(governorId) + '"><div class="section-heading"><h2>ランキング</h2>' + exportButton("rankings") + '</div>';
    html += '<div class="favorite-rankings-grid" data-favorite-grid></div><div class="ranking-dashboard-actions"><button type="button" class="ranking-settings-toggle" data-ranking-settings-toggle>表示項目を設定</button><button type="button" class="ranking-rest-toggle" data-ranking-rest-toggle aria-expanded="false">残りのランキングを表示 <span data-rest-count></span> <span data-rest-chevron>＋</span></button></div>';
    html += '<div class="ranking-settings-panel" data-ranking-settings-panel hidden><div class="ranking-settings-heading"><b>表示する4項目を選択</b><span data-ranking-selection-count>0 / 4</span></div><div class="ranking-settings-list" data-ranking-settings-list></div><div class="ranking-settings-footer"><button type="button" data-ranking-settings-cancel>キャンセル</button><button type="button" data-ranking-settings-save>保存</button></div></div>';
    html += '<div class="ranking-rest-panel" data-ranking-rest-panel hidden><div class="detail-list other-ranking-list" data-ranking-rest-list></div></div><script type="application/json" data-ranking-data>' + boardJson + '</script></section>';
  }

  if (p.gov_gear && typeof p.gov_gear === "object") {
    const g = p.gov_gear;
    const items = Array.isArray(g.items) ? g.items : [];
    if (g.hidden) {
      // 非公開時は大きな独立カードを作らず、短い状態表示にする。
      html += '<div class="gov-gear-private"><span>領主装備</span><b>非公開</b>' + exportButton("gov_gear") + '</div>';
    } else {
      html += '<section class="profile-section"><div class="section-heading"><h2>領主装備</h2>' + exportButton("gov_gear") + '</div><div class="mini-grid"><div class="mini-card"><span>状態</span><b>' + esc(items.length + "件") + '</b></div></div>';
    if (!g.hidden && items.length) {
      html += '<div class="gear-list">' + items.map(item => {
        const gems = Array.isArray(item.gems) ? item.gems : [];
        const gemText = gems.length ? gems.map(gem => {
          const level = localizeGemLevel(gem);
          const label = gem?.name || gem?.slot || "宝石";
          return level ? label + " Lv." + level : "宝石";
        }).join(", ") : "";
        const gearIconUrl = normalizeProfileAssetUrl(item.icon);
        return '<div class="gear-card"><div class="gear-head">' +
          (gearIconUrl ? '<img class="gear-icon" src="' + esc(gearIconUrl) + '" alt="" loading="lazy">' : '<span class="gear-icon gear-icon-empty">?</span>') +
          '<div><strong>' + esc(localizeGovernorGearSlot(item.slot)) + '</strong></div>' +
          '</div><div class="gear-stats">' +
          '<div class="gear-stat">スロット<b>' + esc(localizeGovernorGearSlot(item.slot)) + '</b></div>' +
          '<div class="gear-stat">品質<b>' + esc(localizeGovernorGearQuality(item.quality)) + '</b></div>' +
          '<div class="gear-stat">Tier<b>' + esc(localizeGovernorGearTier(item.tier)) + '</b></div>' +
          '<div class="gear-stat">★<b>' + esc(item.star ?? "-") + '</b></div>' +
          '<div class="gear-stat">強化<b>' + esc(item.strength_level ?? "-") + '</b></div>' +
          '<div class="gear-stat">スコア<b>' + esc(formatCompactNumber(item.score)) + '</b></div>' +
          '<div class="gear-stat">戦闘力<b>' + esc(formatCompactNumber(item.combat)) + '</b></div>' +
          '</div>' +
          (gemText ? '<div class="gear-gems">宝石 <b>' + esc(gemText) + '</b></div>' : '') +
          '</div>';
      }).join("") + '</div>';
    }
    html += '</section>';
    }
  }

  return html;
}
function card(label, value) {
  return `<div class="card"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`;
}

function formatTownCenterLevel(value) {
  if (value === null || value === undefined || value === "") return "-";
  const level = Number(value);
  if (!Number.isFinite(level)) return String(value);
  if (level <= 30) return `Lv.${level}`;
  // Lv.30の後は30-1〜30-4を経て黄金1に入り、以降は各黄金レベル5段階。
  if (level <= 34) return `Lv.30-${level - 30}`;
  const goldLevel = Math.floor((level - 35) / 5) + 1;
  const stage = ((level - 35) % 5) + 1;
  return `黄金${goldLevel}（${stage}/5）`;
}

function formatRelativeActivity(lastActiveAt, fallback = null) {
  if (lastActiveAt !== null && lastActiveAt !== undefined && lastActiveAt !== "") {
    const timestamp = Number(lastActiveAt);
    if (Number.isFinite(timestamp)) {
      const diffSeconds = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
      if (diffSeconds < 60) return "1分未満前";
      if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}分前`;
      if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}時間前`;
      if (diffSeconds < 86400 * 30) return `${Math.floor(diffSeconds / 86400)}日前`;
      if (diffSeconds < 86400 * 365) return `${Math.floor(diffSeconds / (86400 * 30))}か月前`;
      return `${Math.floor(diffSeconds / (86400 * 365))}年前`;
    }
  }
  return fallback ? translateLastLogin(fallback) : "-";
}

function translateLastLogin(value) {
  return String(value)
    .replace(/^Last active (\\d+)d ago$/i, "$1日前")
    .replace(/^Last active (\\d+)h ago$/i, "$1時間前")
    .replace(/^Last active (\\d+)m ago$/i, "$1分前")
    .replace(/^Last active (just now)$/i, "直近");
}

function formatCompactNumber(value) {
  if (value === null || value === undefined || value === "") return "-";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const abs = Math.abs(n);
  if (abs >= 1e9) return formatCompactUnit(n, 1e9, "B");
  if (abs >= 1e6) return formatCompactUnit(n, 1e6, "M");
  if (abs >= 1e3) return formatCompactUnit(n, 1e3, "K");
  return n.toLocaleString("ja-JP");
}

function formatCompactUnit(value, divisor, suffix) {
  const scaled = value / divisor;
  const decimals = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
  return scaled.toFixed(decimals).replace(/\.?0+$|\.$/, "") + suffix;
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "-";
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("ja-JP") : String(value);
}

function formatUnix(value) {
  if (!value) return "-";
  const date = new Date(Number(value) * 1000);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

async function handleKingdomRankingPreferencesApi(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (request.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  const body = await request.json().catch(() => ({}));
  const kid = Number(body.kid);
  if (!Number.isInteger(kid) || kid < 1) return json({ ok: false, error: "INVALID_KINGDOM_ID", message: "王国IDを確認してください。" }, 400);
  const kingdom = await env.DB.prepare("SELECT kid FROM kingdom_catalog WHERE kid = ? LIMIT 1").bind(kid).first();
  if (!kingdom) return json({ ok: false, error: "KINGDOM_NOT_FOUND", message: "王国カタログに存在する王国を指定してください。" }, 404);
  const allowedBoards = ["personal_power","kills","town_center","hero_total","troop_power","building_power","research_power","hero_no_equip","hero_equip","gov_gear","gov_charm","pet_power","island_prosperity","migrant_score","mystic_trial","coliseum","forest_of_life","crystal_cave","knowledge_nexus","molten_fort","radiant_spire","master_power","rebel_conquest","single_hero","alliance_power","alliance_kills"];
  const boards = [...new Set(Array.isArray(body.boards) ? body.boards.map(v => String(v)) : [])].filter(v => allowedBoards.includes(v));
  if (!boards.length) return json({ ok: false, error: "BOARD_REQUIRED", message: "ランキングを1つ以上選択してください。" }, 400);
  const primary = String(body.primary_board || boards[0]);
  if (!boards.includes(primary)) return json({ ok: false, error: "INVALID_PRIMARY_BOARD", message: "最初に表示するランキングは選択済みのランキングから指定してください。" }, 400);
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(`INSERT INTO user_kingdom_ranking_preferences (user_id,kid,boards_json,primary_board,created_at,updated_at)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET kid=excluded.kid,boards_json=excluded.boards_json,primary_board=excluded.primary_board,updated_at=excluded.updated_at`)
    .bind(String(auth.user_id), kid, JSON.stringify(boards), primary, now, now).run();
  return json({ ok: true, kid, boards, primary_board: primary });
}

async function getAuthenticatedUser(request, env) {
  const secret = env.EAGLEEYE_SESSION_SECRET;
  const token = parseCookie(request.headers.get("Cookie") || "")[SESSION_COOKIE];
  if (!token || !secret) return null;
  const session = await verifyPayload(token, secret);
  if (!session) return null;

  if (!env.DB) return null;

  try {
    const user = await env.DB.prepare(
      "SELECT user_id, discord_id, username, global_name, role, status FROM users WHERE discord_id = ? LIMIT 1"
    ).bind(session.sub).first();
    return user || null;
  } catch (error) {
    // D1 outage must not turn the public/home page into a 500.
    // Protected routes still fail closed because they require a DB-backed user.
    console.error("authenticated_user_lookup_failed", error?.message || error);
    return null;
  }
}

async function trackServiceUsage(env, auth, operation, { targetType = null, targetId = null, metadata = {} } = {}) {
  if (!auth?.user_id) return;
  try {
    await recordServiceUsage(env, {
      operation,
      actorUserId: auth.user_id,
      targetType,
      targetId,
      metadata
    });
  } catch (error) {
    // Usage telemetry must never break the originating user action.
    console.error("service_usage_track_failed", operation, error?.message || error);
  }
}


async function handleDebugPlayerGear(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE" || !["ADMIN","OWNER"].includes(auth.role)) {
    return json({ ok: false, error: "FORBIDDEN" }, 403);
  }

  const url = new URL(request.url);
  const governorId = String(url.searchParams.get("governor_id") || "").trim();
  if (!governorId) return json({ ok: false, error: "governor_id_required" }, 400);

  const items = [
    { slot: "Helmet", icon: "/assets/icons/lordsequipment_icon_1002.png", tier: "Blue", star: 3 },
    { slot: "Charm", icon: "/assets/icons/lordsequipment_icon_2002.png", tier: "Blue", star: 1 },
    { slot: "Chest", icon: "/assets/icons/lordsequipment_icon_3003.png", tier: "Purple", star: null },
    { slot: "Legs", icon: "/assets/icons/lordsequipment_icon_4003.png", tier: "Purple", star: null },
    { slot: "Accessory", icon: "/assets/icons/lordsequipment_icon_5003.png", tier: "Purple T1", star: null },
    { slot: "Weapon", icon: "/assets/icons/lordsequipment_icon_6003.png", tier: "Purple", star: null }
  ];

  if (url.searchParams.get("format") === "html") {
    const cards = items.map(item => {
      const iconUrl = "https://api.mightpulse.com" + item.icon;
      return '<article class="card">' +
        '<h2>' + escapeHtml(item.slot) + '</h2>' +
        '<p>icon: <code>' + escapeHtml(item.icon) + '</code></p>' +
        '<p>Tier: ' + escapeHtml(item.tier) + ' / ★: ' + escapeHtml(item.star ?? "-") + '</p>' +
        '<div class="preview"><img src="' + escapeHtml(iconUrl) + '" alt="' + escapeHtml(item.slot) + '"><div class="error">画像を読み込めませんでした</div></div>' +
        '</article>';
    }).join("");

    return eagleEyeHtmlResponse(
      '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gear Icon Debug</title>' +
      '<style>body{margin:0;background:#0f172a;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;padding:20px}.wrap{max-width:1000px;margin:auto}.note{color:#94a3b8}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}.card{background:#1e293b;border:1px solid #334155;border-radius:14px;padding:16px}.card h2{margin:0 0 8px}.card p{font-size:13px;color:#94a3b8;word-break:break-all}.preview{min-height:190px;border:1px dashed #475569;border-radius:10px;background:#020617;display:flex;align-items:center;justify-content:center;position:relative}.preview img{max-width:180px;max-height:180px}.preview .error{display:none;color:#fca5a5;font-size:12px}.preview img:not([src=""]){}</style>' +
      '</head><body><main class="wrap"><h1>領主装備アイコン確認</h1><p class="note">Governor ID: ' + escapeHtml(governorId) + '<br>APIから取得した確認済みiconパスを直接表示しています。MightPulse APIの再取得は行いません。</p><div class="grid">' + cards + '</div></main></body></html>'
    );
  }

  return json({ ok: true, governor_id: governorId, items });
}

async function handleDebugPlayerIcons(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE" || !["ADMIN","OWNER"].includes(auth.role)) {
    return json({ ok: false, error: "FORBIDDEN" }, 403);
  }

  const url = new URL(request.url);
  const governorId = String(url.searchParams.get("governor_id") || "").trim();
  if (!governorId) return json({ ok: false, error: "governor_id_required" }, 400);

  try {
    const fetched = await fetchPlayerThroughApiPool(env, governorId, "DEBUG_PLAYER_ICONS");
    const data = fetched?.result?.data || {};
    const player = data.player || data;
    const heroes = Array.isArray(data.heroes) ? data.heroes : [];
    const alliance = player?.alliance && typeof player.alliance === "object" ? player.alliance : null;

    const result = {
      ok: true,
      governor_id: governorId,
      avatar_url: player?.avatar_url ?? null,
      alliance_flag_url: alliance?.flag_url ?? null,
      heroes: heroes.map(hero => ({
        id: hero?.id ?? null,
        name: hero?.name ?? null,
        icon: hero?.icon ?? null,
        exclusive_gear: hero?.exclusive_gear ?? null,
        gear: Array.isArray(hero?.gear) ? hero.gear.map(item => ({
          slot: item?.slot ?? null,
          name: item?.name ?? null,
          icon: item?.icon ?? null
        })) : []
      }))
    };

    if (url.searchParams.get("format") === "html") {
      const normalizeAssetUrl = value => {
        if (!value) return null;
        const raw = String(value);
        if (/^https?:\/\//i.test(raw)) return raw;
        return "https://api.mightpulse.com" + (raw.startsWith("/") ? raw : "/" + raw);
      };
      const image = (src, alt) => src
        ? '<img src="' + escapeHtml(normalizeAssetUrl(src)) + '" alt="' + escapeHtml(alt || "") + '">'
        : '<div class="missing">iconなし</div>';

      const heroCards = result.heroes.map(hero => {
        const heroGear = hero.gear.length
          ? '<div class="sub"><b>英雄通常装備</b>' + hero.gear.map(item =>
              '<div class="row"><span>' + escapeHtml(item.slot || item.name || "-") + '</span>' +
              (item.icon ? image(item.icon, item.name || item.slot) : '<span class="muted">iconなし</span>') +
              '<code>' + escapeHtml(item.icon || "-") + '</code></div>'
            ).join("") + '</div>'
          : '<div class="sub"><b>英雄通常装備</b><div class="muted">データなし</div></div>';

        const exclusive = hero.exclusive_gear && typeof hero.exclusive_gear === "object"
          ? '<div class="sub"><b>専用装備</b><pre>' + escapeHtml(JSON.stringify(hero.exclusive_gear, null, 2)) + '</pre></div>'
          : '<div class="sub"><b>専用装備</b><div class="muted">データなし</div></div>';

        return '<article class="card"><div class="hero-title"><div>' + escapeHtml(hero.name || hero.id || "-") + '</div>' + image(hero.icon, hero.name || hero.id) + '</div>' +
          '<div class="sub"><b>Hero icon</b><code>' + escapeHtml(hero.icon || "-") + '</code></div>' + exclusive + heroGear + '</article>';
      }).join("");

      const misc = '<section class="card"><h2>その他</h2>' +
        '<div class="row"><span>プレイヤーアバター</span>' + image(result.avatar_url, "avatar") + '<code>' + escapeHtml(result.avatar_url || "-") + '</code></div>' +
        '<div class="row"><span>同盟旗</span>' + image(result.alliance_flag_url, "alliance flag") + '<code>' + escapeHtml(result.alliance_flag_url || "-") + '</code></div>' +
        '</section>';

      return eagleEyeHtmlResponse(
        '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Player Icon Debug</title>' +
        '<style>body{margin:0;background:#0f172a;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;padding:20px}.wrap{max-width:1100px;margin:auto}.note,.muted{color:#94a3b8}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;margin-top:16px}.card{background:#1e293b;border:1px solid #334155;border-radius:14px;padding:16px}.card h2{margin:0 0 12px}.hero-title{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:20px;font-weight:900}.hero-title img{width:64px;height:64px;object-fit:contain;border-radius:10px;background:#020617}.sub{margin-top:12px;padding-top:10px;border-top:1px solid #334155}.row{display:grid;grid-template-columns:110px 56px minmax(0,1fr);gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid #334155}.row img{width:48px;height:48px;object-fit:contain;border-radius:8px;background:#020617}.row code,.sub>code{display:block;margin-top:5px;color:#94a3b8;font-size:11px;word-break:break-all}.row code{grid-column:2 / 4}.missing{display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:8px;background:#0b1220;color:#64748b;font-size:10px}.sub pre{white-space:pre-wrap;overflow:auto;padding:10px;border-radius:8px;background:#0b1220;color:#cbd5e1;font-size:11px}</style>' +
        '</head><body><main class="wrap"><h1>プレイヤーアイコン確認</h1><p class="note">Governor ID: ' + escapeHtml(governorId) + '<br>APIから実際に取得したアイコン関連データを確認します。ここでは表示確認のみで、本番UIは変更しません。</p><div class="grid">' + heroCards + '</div>' + misc + '</main></body></html>'
      );
    }

    return json(result);
  } catch (error) {
    return json({
      ok: false,
      error: error?.code || "PLAYER_ICON_DEBUG_FAILED",
      status: Number(error?.status || 0),
      diagnostic: error?.details || error?.message || null
    }, error?.status && error.status >= 400 && error.status < 600 ? error.status : 502);
  }
}



async function getLatestAdminKingdomRankingSnapshot(env, kid, board, limit = 100) {
  const state = await env.DB.prepare(
    "SELECT last_checked_at, source_observed_at FROM kingdom_ranking_board_state WHERE kid = ? AND board = ?"
  ).bind(Number(kid), String(board)).first();
  const result = await env.DB.prepare(
    "SELECT ranking_snapshot_id, kid, board, target_type, target_id, rank, score, uid, governor_id, nick_name, aid, abbr, name, observed_at, source_observed_at FROM kingdom_ranking_current WHERE kid = ? AND board = ? ORDER BY rank ASC LIMIT ?"
  ).bind(Number(kid), String(board), Number(limit)).all();
  const rows = result.results || [];
  const sourceValues = rows.map(row => Number(row.source_observed_at || 0)).filter(value => Number.isFinite(value) && value > 0);
  return {
    observedAt: state?.last_checked_at ? Number(state.last_checked_at) : null,
    sourceObservedAt: state?.source_observed_at ? Number(state.source_observed_at) : (sourceValues.length ? Math.min(...sourceValues) : null),
    rows
  };
}

function adminKingdomRankingName(row) {
  if (row?.target_type === "ALLIANCE") {
    const abbr = String(row.abbr || "").trim();
    const name = String(row.name || "").trim();
    return abbr && name ? "[" + abbr + "] " + name : abbr || name || row.target_id || "-";
  }
  return String(row?.nick_name || row?.governor_id || row?.uid || row?.target_id || "-");
}

async function handleAdminKingdomRankingApi(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  const url = new URL(request.url);
  const kid = String(url.searchParams.get("kid") || "").trim();
  const board = String(url.searchParams.get("board") || "").trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 100);
  const refresh = url.searchParams.get("refresh") === "1";
  if (!/^\\d+$/.test(kid)) return json({ ok:false, error:"INVALID_KID" },400);
  if (!KINGDOM_RANKING_BOARDS.includes(board)) return json({ ok:false, error:"INVALID_BOARD" },400);

  try {
    if (refresh) {
      await ensureKingdomWatchlistFreshnessSchema(env.DB);
      const startedAt = Date.now();
      const fetched = await fetchKingdomRankingThroughApiPool(env, kid, board, 100, "ADMIN_KINGDOM_RANKING");
      const elapsedMs = Date.now() - startedAt;
      const payload = fetched.result?.data;
      const sourceObservedAt = getMightPulseSourceTimestamp(payload);
      const entries = extractKingdomRankingEntries(payload);
      if (!entries.length) {
        const payloadKeys = payload && typeof payload === "object" && !Array.isArray(payload) ? Object.keys(payload).slice(0, 30) : [];
        return json({
          ok:false,
          error:"RANKING_ENTRIES_EMPTY",
          message:"ランキングAPIは成功しましたが、ランキング配列を抽出できませんでした。",
          upstream_status:fetched.result?.status ?? 200,
          payload_type:Array.isArray(payload) ? "array" : typeof payload,
          payload_keys:payloadKeys
        },502);
      }
      const observedAt = Math.floor(Date.now() / 1000);
      const rankingComparison = await getKingdomRankingChanges(env.DB, {
        kid: Number(kid), board, entries, observedAt
      });
      const savedRows = await saveKingdomRankingBoard(env.DB, {
        kid: Number(kid), board, entries: rankingComparison.changedEntries,
        removedTargets: rankingComparison.removedTargets,
        entriesAlreadyFiltered: true, observedAt, sourceObservedAt,
        checkedAt: Math.floor(Date.now() / 1000),
        archiveBucket: env.ARCHIVE,
        historyMode: env.HISTORY_STORAGE_MODE
      });
      const snapshot = await getLatestAdminKingdomRankingSnapshot(env, kid, board, limit);
      return json({
        ok:true, kid:Number(kid), board, label:RANKING_BOARD_LABELS[board] || board,
        limit, refreshed:true, entry_count:entries.length, saved_rows:savedRows,
        upstream_elapsed_ms:elapsedMs, source_observed_at:sourceObservedAt,
        observed_at:snapshot.observedAt, rows:snapshot.rows, pool_type:fetched.pool_type
      });
    }
    const snapshot = await getLatestAdminKingdomRankingSnapshot(env, kid, board, limit);
    return json({
      ok:true, kid:Number(kid), board, label:RANKING_BOARD_LABELS[board] || board,
      limit, refreshed:false, entry_count:snapshot.rows.length,
      source_observed_at:snapshot.sourceObservedAt, observed_at:snapshot.observedAt,
      rows:snapshot.rows
    });
  } catch (error) {
    console.error("Admin kingdom ranking error:", error);
    return json({
      ok:false, error:error?.code || error?.message || "KINGDOM_RANKING_READ_FAILED",
      status:Number(error?.status || 0), message:error?.message || null
    }, error?.status >= 400 && error?.status < 600 ? error.status : 502);
  }
}

async function handleAdminKingdomRankingExport(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  const url = new URL(request.url);
  const kid = String(url.searchParams.get("kid") || "").trim();
  const board = String(url.searchParams.get("board") || "").trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 100);
  if (!/^\\d+$/.test(kid)) return json({ok:false,error:"INVALID_KID"},400);
  if (!KINGDOM_RANKING_BOARDS.includes(board)) return json({ok:false,error:"INVALID_BOARD"},400);
  try {
    const snapshot = await getLatestAdminKingdomRankingSnapshot(env, kid, board, limit);
    if (!snapshot.rows.length) return json({ok:false,error:"RANKING_DATA_NOT_FOUND",message:"先にランキングを取得してください。"},404);
    const exportedAt = new Date().toISOString();
    const label = RANKING_BOARD_LABELS[board] || board;
    const headers = ["出力日時","王国","ランキング","順位","対象種別","領主ID","UID","プレイヤー名","同盟ID","同盟略称","同盟名","スコア","EagleEye取得時刻","MightPulseデータ基準時刻"];
    const rows = snapshot.rows.map(row => ({
      "出力日時":exportedAt,"王国":kid,"ランキング":label,"順位":row.rank,
      "対象種別":row.target_type === "ALLIANCE" ? "同盟" : "プレイヤー",
      "領主ID":row.governor_id || "","UID":row.uid || "","プレイヤー名":row.nick_name || "",
      "同盟ID":row.aid || "","同盟略称":row.abbr || "","同盟名":row.name || "","スコア":row.score,
      "EagleEye取得時刻":row.observed_at ? formatUnix(row.observed_at) : "",
      "MightPulseデータ基準時刻":row.source_observed_at ? formatUnix(row.source_observed_at) : ""
    }));
    const result = await exportToGoogleSheet(env, {
      sheetTitle:"王国" + kid + "_" + label, headers, rows
    });
    await recordDiagnostic(env.DB, {
      service: "google_sheets", feature: "kingdom_export", operation: "EXPORT", status: "SUCCESS",
      targetType: "KINGDOM", targetId: kid, message: "王国ランキングGoogle Sheets出力成功",
      rowsReceived: rows.length, rowsSaved: rows.length,
      metadata: { board, limit, columnCount: headers.length }
    });
    await trackServiceUsage(env, guard.auth, "KINGDOM_EXPORT", {
      targetType: "KINGDOM",
      targetId: kid,
      metadata: {
        format: "google_sheets",
        kid,
        board,
        limit,
        row_count: rows.length,
        success: true
      }
    });
    return new Response(null,{status:303,headers:{location:result.url,"cache-control":"no-store"}});
  } catch (error) {
    await recordDiagnostic(env.DB, {
      service: "google_sheets", feature: "kingdom_export", operation: "EXPORT", status: "FAILED",
      errorCode: String(error?.code || error?.message || "KINGDOM_RANKING_EXPORT_FAILED").split(":")[0],
      message: String(error?.message || error).slice(0, 2000), targetType: "KINGDOM", targetId: kid,
      metadata: { board, limit }
    });
    console.error("Admin kingdom ranking export error:", error);
    if (error?.code === "GOOGLE_SHEETS_NOT_CONFIGURED" || error?.code === "GOOGLE_SHEETS_WEBAPP_NOT_CONFIGURED") {
      return json({ok:false,error:error.code,message:"Google Sheets連携が未設定です。"},503);
    }
    return json({ok:false,error:error?.code || "KINGDOM_RANKING_EXPORT_FAILED",message:error?.message || "Google Sheetsへの出力に失敗しました。"},502);
  }
}


async function renderAdminKingdomRankingsPage(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  const url = new URL(request.url);
  const kid = String(url.searchParams.get("kid") || "").trim();
  const board = String(url.searchParams.get("board") || KINGDOM_RANKING_BOARDS[0]).trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 100);
  const refresh = url.searchParams.get("refresh") === "1";
  let state = { rows:[], observedAt:null, sourceObservedAt:null, elapsedMs:null, poolType:null, error:null };

  if (kid && /^\\d+$/.test(kid) && KINGDOM_RANKING_BOARDS.includes(board)) {
    if (refresh) {
      const apiUrl = new URL("/api/admin/kingdom-rankings", request.url);
      apiUrl.searchParams.set("kid",kid);
      apiUrl.searchParams.set("board",board);
      apiUrl.searchParams.set("limit",String(limit));
      apiUrl.searchParams.set("refresh","1");
      const api = await handleAdminKingdomRankingApi(new Request(apiUrl.toString(), { headers: request.headers }), env);
      const data = await api.json().catch(() => ({ok:false,error:"INVALID_RESPONSE"}));
      if (api.ok && data.ok) {
        state.rows=data.rows||[];
        state.observedAt=data.observed_at||null;
        state.sourceObservedAt=data.source_observed_at||null;
        state.elapsedMs=data.upstream_elapsed_ms ?? null;
        state.poolType=data.pool_type||null;
      } else {
        state.error=data.message||data.error||"ランキング取得に失敗しました。";
      }
    } else {
      const snapshot = await getLatestAdminKingdomRankingSnapshot(env,kid,board,limit);
      state.rows=snapshot.rows;
      state.observedAt=snapshot.observedAt;
      state.sourceObservedAt=snapshot.sourceObservedAt;
    }
  }

  const esc=escapeHtml;
  const options=KINGDOM_RANKING_BOARDS.map(item =>
    "<option value='"+esc(item)+"'"+(item===board?" selected":"")+">"+esc(RANKING_BOARD_LABELS[item]||item)+"</option>"
  ).join("");
  const rowsHtml=state.rows.map(row =>
    "<tr><td>"+esc(row.rank)+"</td><td><b>"+esc(adminKingdomRankingName(row))+"</b><small>"+
    (row.target_type==="ALLIANCE" ? "同盟ID "+esc(row.aid||row.target_id||"-") : "領主ID "+esc(row.governor_id||row.uid||row.target_id||"-"))+
    "</small></td><td>"+esc(formatCompactNumber(row.score))+"</td></tr>"
  ).join("") || "<tr><td colspan='3' class='empty'>表示できるランキングデータがありません。<br>王国番号・ランキングを選択して「最新データを取得」を押してください。</td></tr>";

  const exportLink=state.rows.length
    ? "/api/admin/kingdom-ranking-export?kid="+encodeURIComponent(kid)+"&board="+encodeURIComponent(board)+"&limit="+limit
    : "";
  const status=[];
  if(state.observedAt) status.push("EagleEye取得時刻: "+formatUnix(state.observedAt));
  if(state.sourceObservedAt) status.push("MightPulseデータ基準時刻: "+formatUnix(state.sourceObservedAt));
  if(state.elapsedMs!=null) status.push("取得時間: "+state.elapsedMs+" ms");
  if(state.poolType) status.push("Pool: "+state.poolType);
  const statusHtml=status.length ? "<div class='status'>"+esc(status.join(" / "))+"</div>" : "";
  const errorHtml=state.error ? "<div class='error'>"+esc(state.error)+"</div>" : "";

  return "<!doctype html><html lang='ja'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>EagleEye 王国ランキング</title><style>"+
    ":root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.wrap{max-width:900px;margin:auto;padding:28px 14px 48px}.top{display:flex;align-items:center;justify-content:space-between;gap:10px}.back{color:#94a3b8;text-decoration:none}.badge{padding:6px 9px;border:1px solid #f59e0b;border-radius:999px;color:#fbbf24;background:#241a08;font-size:11px;font-weight:900}.eyebrow{margin-top:24px;color:#f59e0b;font-size:11px;font-weight:900;letter-spacing:2px}.title{font-size:29px;margin:5px 0}.sub{color:#94a3b8;font-size:13px;line-height:1.7}.card{margin-top:14px;padding:16px;border:1px solid #334155;border-radius:16px;background:#162238}.form{display:grid;grid-template-columns:1fr 1.6fr 110px auto;gap:9px;align-items:end}.field{display:grid;gap:6px}.field label{font-size:12px;font-weight:800;color:#cbd5e1}.field input,.field select{width:100%;padding:12px;border-radius:10px;border:1px solid #475569;background:#0b1220;color:#f8fafc}.btn{display:inline-flex;align-items:center;justify-content:center;padding:12px 14px;border-radius:10px;border:0;background:#f59e0b;color:#111827;text-decoration:none;font-weight:900;cursor:pointer;white-space:nowrap}.btn.secondary{background:#334155;color:#e2e8f0}.status{margin-top:12px;padding:11px;border-radius:10px;background:#0f2a1c;color:#86efac;font-size:12px;line-height:1.7}.error{margin-top:12px;padding:11px;border-radius:10px;background:#3a1418;color:#fca5a5;font-size:12px}.table-wrap{margin-top:14px;overflow:auto;border:1px solid #334155;border-radius:12px}table{width:100%;border-collapse:collapse;min-width:520px}th,td{padding:10px 9px;border-bottom:1px solid #334155;text-align:left;font-size:12px}th{color:#94a3b8;font-size:11px}td:first-child{width:58px;color:#f59e0b;font-weight:900}td:last-child{text-align:right;font-weight:900;white-space:nowrap}td small{display:block;color:#94a3b8;margin-top:3px}.empty{text-align:center!important;color:#94a3b8!important;line-height:1.7;padding:24px!important;font-weight:400!important}@media(max-width:700px){.form{grid-template-columns:1fr 1fr}.form .field:nth-child(2){grid-column:1 / -1}.form .btn{grid-column:1 / -1;width:100%}}@media(max-width:430px){.form{grid-template-columns:1fr}.form .field:nth-child(2){grid-column:auto}}"+
    "</style></head><body><main class='wrap'><div class='top'><a class='back' href='/admin'>← ADMIN CONTROL</a><div class='badge'>ADMIN / OWNER</div></div><div class='eyebrow'>KINGDOM RANKINGS</div><h1 class='title'>王国ランキング</h1><p class='sub'>必要なランキングだけを選択して取得・閲覧します。ウォッチリストの全ランキング監視とは分離しています。</p>"+
    "<div class='card'><form class='form' method='get' action='/admin/kingdom-rankings'><div class='field'><label>王国番号（鯖番号）</label><input name='kid' inputmode='numeric' pattern='[0-9]+' value='"+esc(kid)+"' placeholder='例: 1524' required></div><div class='field'><label>ランキング</label><select name='board'>"+options+"</select></div><div class='field'><label>表示件数</label><select name='limit'><option value='10'"+(limit===10?" selected":"")+">10位</option><option value='50'"+(limit===50?" selected":"")+">50位</option><option value='100'"+(limit===100?" selected":"")+">100位</option></select></div><button class='btn' name='refresh' value='1'>最新データを取得</button></form></div>"+
    "<div class='card'><div>"+(state.rows.length ? "<a class='btn secondary' href='"+exportLink+"'>スプレッドシートへ出力</a>" : "")+"</div>"+errorHtml+statusHtml+"<div class='table-wrap'><table><thead><tr><th>順位</th><th>プレイヤー / 同盟</th><th>スコア</th></tr></thead><tbody>"+rowsHtml+"</tbody></table></div></div></main></body></html>";
}

async function renderAdminControlPage(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  const isOwner = guard.auth.role === "OWNER";
  const ownerLink = isOwner ? "<div class=\"section\"><a class=\"card\" href=\"/owner\"><b>OWNER CONTROLへ</b><span>OWNER専用のユーザー・監査管理</span></a></div>" : "";
  const visibilityLink = isOwner ? "<a class=\"card\" href=\"/admin/player-visibility\"><b>データ公開設定</b><span>ロール別公開範囲を管理</span></a>" : "";
  return "<!doctype html><html lang=\"ja\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>EagleEye ADMIN CONTROL</title>" +
    "<style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif}.wrap{max-width:820px;margin:auto;padding:28px 18px}.back{color:#94a3b8;text-decoration:none}.eyebrow{margin-top:24px;color:#f59e0b;font-size:11px;font-weight:900;letter-spacing:2px}.title{margin:5px 0 8px;font-size:30px}.sub{color:#94a3b8;line-height:1.6}.badge{display:inline-block;margin-top:12px;padding:6px 10px;border:1px solid #f59e0b;border-radius:999px;color:#fbbf24;background:#241a08;font-size:12px;font-weight:900}.grid{display:grid;gap:12px;margin-top:22px}.card{display:block;padding:18px;border:1px solid #334155;border-radius:14px;background:#162238;color:#f8fafc;text-decoration:none}.card:hover{border-color:#64748b;background:#1b2a42}.card b{display:block;font-size:16px}.card span{display:block;margin-top:5px;color:#94a3b8;font-size:13px}.section{margin-top:28px}.section h2{font-size:15px;color:#cbd5e1;margin:0 0 10px}.notice{padding:14px;border:1px solid #334155;border-radius:12px;background:#111c30;color:#cbd5e1;font-size:13px;line-height:1.6}</style></head><body><main class=\"wrap\"><a class=\"back\" href=\"/\">← EagleEye</a><div class=\"eyebrow\">ADMIN CONSOLE</div><h1 class=\"title\">ADMIN CONTROL</h1><p class=\"sub\">EagleEyeの運用・データ管理をまとめて操作できます。</p><div class=\"badge\">ROLE: " + escapeHtml(guard.auth.role) + "</div>" +
    "<div class=\"grid\"><a class=\"card\" href=\"/admin/api-pool\"><b>API Pool管理</b><span>APIキー・Pool状態・利用状況・テスト</span></a><a class=\"card\" href=\"/admin/google-drive\"><b>Google Drive連携</b><span>接続状態・OAuth設定・Driveアーカイブ設定（操作はOWNERのみ）</span></a><a class=\"card\" href=\"/admin/diagnostics\"><b>システムログ</b><span>サービス状態・診断イベント・障害詳細を確認</span></a><a class=\"card\" href=\"/admin/mightpulse-probe\"><b>MightPulse Probe</b><span>cached_at・age_seconds・HTTPヘッダー・時刻候補を比較</span></a><a class=\"card\" href=\"/admin/data-retention\"><b>データ保存期間</b><span>D1履歴の保持期間とR2アーカイブ対象を管理</span></a>" + visibilityLink + "<a class=\"card\" href=\"/players\"><b>プレイヤーDB</b><span>検索・詳細・履歴・変更イベント・必要なデータ更新</span></a><a class=\"card\" href=\"/kingdom-watchlist\"><b>王国ウォッチリスト</b><span>監視対象・ランキング監視・進捗を確認</span></a></div>" +
    "<div class=\"section\"><h2>権限について</h2><div class=\"notice\">ADMINは運用・データ管理を担当します。ユーザーのロール変更、ユーザー停止、ログイン履歴、OWNER監査ログなどのアカウント管理はOWNER CONTROLからOWNERのみが行います。</div></div>" + ownerLink +
    "</main></body></html>";
}
async function handleDiscordRolesLookupApi(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  if (request.method !== "GET") return json({ ok:false, error:"METHOD_NOT_ALLOWED" }, 405);
  const guildId = String(new URL(request.url).searchParams.get("guild_id") || "").trim();
  if (!/^\d{15,25}$/.test(guildId)) return json({ ok:false, error:"INVALID_GUILD_ID" }, 400);
  if (!env.DISCORD_BOT_TOKEN) return json({ ok:false, error:"DISCORD_BOT_TOKEN_NOT_CONFIGURED" }, 500);
  try {
    const response = await fetch("https://discord.com/api/v10/guilds/" + encodeURIComponent(guildId) + "/roles", {
      headers: {
        "Authorization": "Bot " + env.DISCORD_BOT_TOKEN,
        "User-Agent": "EagleEye/1.0 (admin)"
      }
    });
    const body = await response.text();
    let data = null;
    try { data = body ? JSON.parse(body) : null; } catch { data = null; }
    if (!response.ok) return json({ ok:false, error:"DISCORD_API_ERROR", status:response.status, message:data?.message || "Discord API error" }, response.status);
    const roles = Array.isArray(data) ? data.map(role => ({
      id: String(role.id),
      name: String(role.name || ""),
      position: Number(role.position || 0),
      managed: Boolean(role.managed)
    })).sort((a,b) => b.position - a.position) : [];
    return json({ ok:true, guild_id:guildId, roles });
  } catch (error) {
    return json({ ok:false, error:"DISCORD_ROLE_LOOKUP_FAILED", message:String(error?.message || error) }, 500);
  }
}

async function requireOwner(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") return { error: json({ ok: false, error: "UNAUTHORIZED" }, 401) };
  if (auth.role !== "OWNER") return { error: json({ ok: false, error: "OWNER_REQUIRED" }, 403) };
  if (!env.DB) return { error: json({ ok: false, error: "DB_NOT_CONFIGURED" }, 503) };
  return { auth };
}
async function writeOwnerAuditLog(env, actor, action, targetUserId, targetDiscordId, details = null) {
  await env.DB.prepare(`INSERT INTO owner_audit_log (audit_id, actor_user_id, actor_discord_id, action, target_user_id, target_discord_id, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), actor.user_id, actor.discord_id, action, targetUserId || null, targetDiscordId || null, details ? JSON.stringify(details) : null, Math.floor(Date.now() / 1000)).run();
}
async function handleOwnerUsersApi(request, env) {
  const guard = await requireOwner(request, env); if (guard.error) return guard.error;
  const url = new URL(request.url), q = String(url.searchParams.get("q") || "").trim(), like = "%" + q + "%";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 250);
  const result = await env.DB.prepare(`SELECT u.user_id,u.discord_id,u.username,u.global_name,u.avatar,u.role,u.status,u.created_at,u.updated_at,u.last_login_at,COUNT(l.login_id) AS login_count FROM users u LEFT JOIN login_history l ON l.user_id=u.user_id WHERE (?='' OR u.discord_id LIKE ? OR COALESCE(u.username,'') LIKE ? OR COALESCE(u.global_name,'') LIKE ?) GROUP BY u.user_id ORDER BY CASE u.role WHEN 'OWNER' THEN 0 WHEN 'ADMIN' THEN 1 WHEN 'VIP' THEN 2 WHEN 'ADVANCED' THEN 3 ELSE 4 END,u.last_login_at DESC LIMIT ?`)
    .bind(q, like, like, like, limit).all();
  const users = result.results || [];
  const [kingdomCounts, playerCounts] = await Promise.all([
    env.DB.prepare("SELECT discord_id, COUNT(*) AS count FROM kingdom_watchlists GROUP BY discord_id").all(),
    env.DB.prepare("SELECT discord_id, COUNT(*) AS count FROM player_watchlists GROUP BY discord_id").all()
  ]);
  const kingdomByDiscord = new Map((kingdomCounts.results || []).map(row => [String(row.discord_id), Number(row.count || 0)]));
  const playerByDiscord = new Map((playerCounts.results || []).map(row => [String(row.discord_id), Number(row.count || 0)]));
  return json({ ok: true, users: users.map(user => ({
    ...user,
    kingdom_watchlist_count: kingdomByDiscord.get(String(user.discord_id)) || 0,
    player_watchlist_count: playerByDiscord.get(String(user.discord_id)) || 0
  })) });
}

async function handleOwnerUserWatchlistsApi(request, env) {
  const guard = await requireOwner(request, env);
  if (guard.error) return guard.error;
  const url = new URL(request.url);
  const targetUserId = String(url.searchParams.get("user_id") || "").trim();
  if (!targetUserId) return json({ ok: false, error: "USER_ID_REQUIRED" }, 400);
  const target = await env.DB.prepare("SELECT user_id, discord_id, username, global_name, role FROM users WHERE user_id = ? LIMIT 1").bind(targetUserId).first();
  if (!target) return json({ ok: false, error: "USER_NOT_FOUND" }, 404);
  if (target.user_id === guard.auth.user_id) return json({ ok: false, error: "SELF_WATCHLIST_MANAGEMENT_FORBIDDEN" }, 409);
  if (request.method === "GET") {
    const [kingdom, player] = await Promise.all([
      env.DB.prepare("SELECT watchlist_id, kid, top_n, interval_hours, enabled, last_run_at, last_success_at, last_error, created_at, updated_at FROM kingdom_watchlists WHERE discord_id = ? ORDER BY created_at DESC").bind(target.discord_id).all(),
      env.DB.prepare("SELECT watchlist_id, governor_id, label, enabled, created_at, updated_at FROM player_watchlists WHERE discord_id = ? ORDER BY created_at DESC").bind(target.discord_id).all()
    ]);
    return json({ ok: true, user: target, kingdom_watchlists: kingdom.results || [], player_watchlists: player.results || [] });
  }
  if (request.method !== "DELETE") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  const type = String(url.searchParams.get("type") || "").trim().toUpperCase();
  const watchlistId = String(url.searchParams.get("watchlist_id") || "").trim();
  if (!["KINGDOM", "PLAYER"].includes(type) || !watchlistId) return json({ ok: false, error: "INVALID_WATCHLIST_TARGET" }, 400);
  if (type === "KINGDOM") {
    const targetWatchlist = await env.DB.prepare("SELECT watchlist_id, kid FROM kingdom_watchlists WHERE watchlist_id = ? AND discord_id = ? LIMIT 1").bind(watchlistId, target.discord_id).first();
    if (!targetWatchlist) return json({ ok: false, error: "WATCHLIST_NOT_FOUND" }, 404);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM kingdom_watchlist_jobs WHERE watchlist_id = ?").bind(watchlistId),
      env.DB.prepare("DELETE FROM kingdom_watchlist_locks WHERE watchlist_id = ?").bind(watchlistId),
      env.DB.prepare("DELETE FROM kingdom_watchlists WHERE watchlist_id = ? AND discord_id = ?").bind(watchlistId, target.discord_id)
    ]);
    await writeOwnerAuditLog(env, guard.auth, "WATCHLIST_DELETED", target.user_id, target.discord_id, { type: "KINGDOM", watchlist_id: watchlistId, kid: Number(targetWatchlist.kid) });
  } else {
    const targetWatchlist = await env.DB.prepare("SELECT watchlist_id, governor_id, label FROM player_watchlists WHERE watchlist_id = ? AND discord_id = ? LIMIT 1").bind(watchlistId, target.discord_id).first();
    if (!targetWatchlist) return json({ ok: false, error: "WATCHLIST_NOT_FOUND" }, 404);
    await env.DB.prepare("DELETE FROM player_watchlists WHERE watchlist_id = ? AND discord_id = ?").bind(watchlistId, target.discord_id).run();
    await writeOwnerAuditLog(env, guard.auth, "WATCHLIST_DELETED", target.user_id, target.discord_id, { type: "PLAYER", watchlist_id: watchlistId, governor_id: Number(targetWatchlist.governor_id), label: targetWatchlist.label || null });
  }
  return json({ ok: true, deleted: { type, watchlist_id: watchlistId } });
}
async function handleOwnerUserRoleApi(request, env) {
  const guard = await requireOwner(request, env); if (guard.error) return guard.error;
  if (request.method !== "POST") return json({ ok:false,error:"METHOD_NOT_ALLOWED" },405);
  const body = await request.json().catch(() => ({})), targetUserId=String(body.user_id||"").trim(), role=String(body.role||"").trim().toUpperCase();
  if (!targetUserId || !["BASIC","ADVANCED","VIP","ADMIN","OWNER"].includes(role)) return json({ok:false,error:"INVALID_USER_OR_ROLE"},400);
  const target=await env.DB.prepare("SELECT user_id,discord_id,role FROM users WHERE user_id=? LIMIT 1").bind(targetUserId).first();
  if(!target) return json({ok:false,error:"USER_NOT_FOUND"},404);
  if (role === "VIP") {
    const vipEligibility = await evaluateVipEligibility(env.DB, { env, userId: targetUserId });
    if (!vipEligibility.eligible) {
      return json({
        ok: false,
        error: "VIP_ELIGIBILITY_REQUIRED",
        message: "VIPは通常APIキー2本とMighty APIキー1本が有効なユーザーのみ設定できます。",
        eligibility: vipEligibility
      }, 409);
    }
  }
  if(target.user_id===guard.auth.user_id && role!=="OWNER") return json({ok:false,error:"SELF_OWNER_DOWNGRADE_FORBIDDEN"},409);
  const now=Math.floor(Date.now()/1000);
  await env.DB.prepare("UPDATE users SET role=?,updated_at=? WHERE user_id=?").bind(role,now,targetUserId).run();
  await writeOwnerAuditLog(env,guard.auth,"ROLE_CHANGED",target.user_id,target.discord_id,{from_role:target.role,to_role:role});
  return json({ok:true,user_id:target.user_id,role});
}

async function handleOwnerLoginHistoryApi(request, env) {
  const guard = await requireOwner(request, env);
  if (guard.error) return guard.error;
  const userId = String(new URL(request.url).searchParams.get("user_id") || "").trim();
  if (!userId) return json({ ok: false, error: "USER_ID_REQUIRED" }, 400);
  const target = await env.DB.prepare("SELECT user_id, discord_id, username, global_name FROM users WHERE user_id = ? LIMIT 1").bind(userId).first();
  if (!target) return json({ ok: false, error: "USER_NOT_FOUND" }, 404);
  const limit = Math.min(Math.max(Number(new URL(request.url).searchParams.get("limit") || 100), 1), 500);
  const result = await env.DB.prepare("SELECT login_id, discord_id, username, global_name, logged_in_at FROM login_history WHERE user_id = ? ORDER BY logged_in_at DESC LIMIT ?").bind(userId, limit).all();
  return json({ ok: true, user: target, history: result.results || [] });
}

async function handleOwnerUserStatusApi(request, env) {
  const guard=await requireOwner(request,env); if(guard.error)return guard.error;
  if(request.method!=="POST")return json({ok:false,error:"METHOD_NOT_ALLOWED"},405);
  const body=await request.json().catch(()=>({})), targetUserId=String(body.user_id||"").trim(), status=String(body.status||"").trim().toUpperCase();
  if(!targetUserId||!["ACTIVE","DISABLED"].includes(status))return json({ok:false,error:"INVALID_USER_OR_STATUS"},400);
  const target=await env.DB.prepare("SELECT user_id,discord_id,role,status FROM users WHERE user_id=? LIMIT 1").bind(targetUserId).first();
  if(!target)return json({ok:false,error:"USER_NOT_FOUND"},404);
  if(target.user_id===guard.auth.user_id&&status!=="ACTIVE")return json({ok:false,error:"SELF_DISABLE_FORBIDDEN"},409);
  if(target.role==="OWNER"&&status!=="ACTIVE")return json({ok:false,error:"OWNER_DISABLE_FORBIDDEN"},409);
  const now=Math.floor(Date.now()/1000);
  await env.DB.prepare("UPDATE users SET status=?,updated_at=? WHERE user_id=?").bind(status,now,targetUserId).run();
  await writeOwnerAuditLog(env,guard.auth,"STATUS_CHANGED",target.user_id,target.discord_id,{from_status:target.status,to_status:status});
  return json({ok:true,user_id:target.user_id,status});
}
async function handleOwnerAuditLogApi(request,env){
  const guard=await requireOwner(request,env);if(guard.error)return guard.error;
  const limit=Math.min(Math.max(Number(new URL(request.url).searchParams.get("limit")||100),1),250);
  const result=await env.DB.prepare("SELECT audit_id,actor_user_id,actor_discord_id,action,target_user_id,target_discord_id,details_json,created_at FROM owner_audit_log ORDER BY created_at DESC LIMIT ?").bind(limit).all();
  return json({ok:true,logs:result.results||[]});
}
async function renderOwnerPlayerLinkSupportPage(request, env) {
  const guard = await requireOwner(request, env);
  if (guard.error) return eagleEyeHtmlResponse(guard.error);
  return eagleEyeHtmlResponse(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KingShot所有権サポート | EagleEye</title><style>
  :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,sans-serif}.wrap{max-width:900px;margin:auto;padding:24px 16px}.back{color:#94a3b8}.card{margin-top:14px;padding:16px;border:1px solid #334155;border-radius:14px;background:#162238}.item{padding:14px;border:1px solid #334155;border-radius:12px;background:#0f1b30;margin-top:10px}.row{display:flex;justify-content:space-between;gap:12px;padding:5px 0}.muted{color:#94a3b8;font-size:12px;line-height:1.6}.btn{padding:10px 12px;border:0;border-radius:9px;background:#f59e0b;color:#111827;font-weight:900}.danger{background:#7f1d1d;color:white}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}textarea{width:100%;min-height:70px;background:#0b1220;color:white;border:1px solid #334155;border-radius:9px;padding:9px}</style></head><body><main class="wrap"><a class="back" href="/owner">← OWNER CONTROL</a><h1>KingShot所有権サポート</h1><p class="muted">ゲーム内スクリーンショット等で本人確認した案件をここで処理します。移管時には旧リンクを解除し、申請者をADMIN_VERIFIEDとして公式認証します。不正利用が疑われる旧アカウントへの警告・停止判断は証拠を確認した上で別途行ってください。</p><div id="list" class="card">読み込み中…</div></main><script>
(async function(){
 const list=document.getElementById("list");
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 async function load(){
  const r=await fetch("/api/owner/player-link-support",{credentials:"same-origin",cache:"no-store"});
  const d=await r.json(); if(!r.ok||!d.ok) throw new Error(d.message||d.error||"取得失敗");
  if(!d.requests.length){list.innerHTML="<div class='muted'>未処理の所有権申請はありません。</div>";return;}
  list.innerHTML=d.requests.map(x=>"<article class='item'><div class='row'><b>領主ID</b><b>"+esc(x.governor_id)+"</b></div><div class='row'><span>申請者 Discord ID</span><span>"+esc(x.requester_discord_id||"-")+"</span></div><div class='row'><span>既存登録 Discord ID</span><span>"+esc(x.conflicting_discord_id||"-")+"</span></div><div class='row'><span>プレイヤー</span><span>"+esc(x.nick_name||"-")+" / 王国 "+esc(x.kid||"-")+"</span></div><p class='muted'>問い合わせ番号: "+esc(x.request_id)+"</p><textarea id='note-"+esc(x.request_id)+"' placeholder='本人確認内容・判断理由'></textarea><div class='actions'><button class='btn' onclick='resolve(""+esc(x.request_id)+"","VERIFY_TRANSFER")'>本人確認済み・移管＋公式認証</button><button class='btn danger' onclick='resolve(""+esc(x.request_id)+"","REJECT")'>却下</button></div></article>").join("");
 }
 window.resolve=async function(id,action){
  const note=document.getElementById("note-"+id)?.value||"";
  if(action==="VERIFY_TRANSFER"&&!confirm("本人確認済みとして移管し、公式認証を付与しますか？"))return;
  const r=await fetch("/api/owner/player-link-support",{method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify({request_id:id,action,resolution_note:note})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||!d.ok){alert(d.message||d.error||"処理に失敗しました");return;}
  await load();
 };
 try{await load();}catch(e){list.textContent=e.message||String(e);}
}());
</script></body></html>`);
}

async function renderOwnerAdminPage(request,env){
  const guard=await requireOwner(request,env);
  if(guard.error)return "<!doctype html><html lang='ja'><body style='background:#0f172a;color:white;font-family:system-ui;padding:32px'><h1>OWNER権限が必要です</h1><a href='/' style='color:#f59e0b'>EagleEyeへ戻る</a></body></html>";
  const [users,logs,kingdomCounts,playerCounts]=await Promise.all([
    env.DB.prepare("SELECT u.user_id,u.discord_id,u.username,u.global_name,u.avatar,u.role,u.status,u.created_at,u.last_login_at,COUNT(l.login_id) AS login_count FROM users u LEFT JOIN login_history l ON l.user_id=u.user_id GROUP BY u.user_id ORDER BY CASE u.role WHEN 'OWNER' THEN 0 WHEN 'ADMIN' THEN 1 WHEN 'VIP' THEN 2 WHEN 'ADVANCED' THEN 3 ELSE 4 END,u.last_login_at DESC").all(),
    env.DB.prepare("SELECT audit_id,actor_discord_id,action,target_discord_id,details_json,created_at FROM owner_audit_log ORDER BY created_at DESC LIMIT 50").all(),
    env.DB.prepare("SELECT discord_id, COUNT(*) AS count FROM kingdom_watchlists GROUP BY discord_id").all(),
    env.DB.prepare("SELECT discord_id, COUNT(*) AS count FROM player_watchlists GROUP BY discord_id").all()
  ]);
  const kingdomByDiscord = new Map((kingdomCounts.results || []).map(row => [String(row.discord_id), Number(row.count || 0)]));
  const playerByDiscord = new Map((playerCounts.results || []).map(row => [String(row.discord_id), Number(row.count || 0)]));
  (users.results || []).forEach(user => {
    user.kingdom_watchlist_count = kingdomByDiscord.get(String(user.discord_id)) || 0;
    user.player_watchlist_count = playerByDiscord.get(String(user.discord_id)) || 0;
  });
  const ownerUsers=users.results || [];
  const initialUsersHtml = ownerUsers.map(user => {
    const self = user.user_id === guard.auth.user_id;
    const watchAction = self
      ? '<span class="muted">自分は対象外</span>'
      : '<button type="button" class="secondary" data-a="watchlists" data-id="' + escapeHtml(user.user_id) + '">監視管理</button>';
    return '<article class="user-card"><div class="user-head"><div class="user-name"><b>' +
      escapeHtml(user.global_name || user.username || "Discord User") +
      '</b><span class="muted">@' + escapeHtml(user.username || "") +
      '</span><div class="user-id">' + escapeHtml(user.discord_id) +
      '</div></div><div class="badges"><span class="role">' + escapeHtml(user.role) +
      '</span><span class="status">' + escapeHtml(user.status) +
      '</span></div></div><div class="user-stats">' +
      '<div class="stat"><span>登録</span><b>' + (user.created_at ? new Date(Number(user.created_at) * 1000).toLocaleString("ja-JP") : "-") + '</b></div>' +
      '<div class="stat"><span>最終ログイン</span><b>' + (user.last_login_at ? new Date(Number(user.last_login_at) * 1000).toLocaleString("ja-JP") : "-") + '</b></div>' +
      '<div class="stat"><span>ログイン回数</span><b>' + escapeHtml(user.login_count || 0) + '</b></div>' +
      '<div class="stat"><span>王国ウォッチ</span><b>' + escapeHtml(user.kingdom_watchlist_count || 0) + '件</b></div>' +
      '<div class="stat"><span>プレイヤーウォッチ</span><b>' + escapeHtml(user.player_watchlist_count || 0) + '件</b></div>' +
      '</div><div class="actions">' + watchAction + '</div></article>';
  }).join("") || '<div class="muted">ユーザーが登録されていません</div>';
  const usersJson=JSON.stringify(ownerUsers).replace(/</g,"\\u003c"), logsJson=JSON.stringify(logs.results||[]).replace(/</g,"\\u003c"), ownerId=JSON.stringify(guard.auth.user_id);
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EagleEye OWNER CONTROL</title>
<style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:1100px;margin:auto;padding:28px 16px 48px}.top{display:flex;justify-content:space-between;align-items:center;gap:12px}.back{color:#94a3b8}.badge{padding:7px 10px;border:1px solid #f59e0b;border-radius:999px;color:#fbbf24}.card{padding:16px;margin-top:14px;border:1px solid #334155;border-radius:14px;background:#162238}.links{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}.link{padding:13px;border:1px solid #334155;border-radius:10px;background:#0f1b30;color:#e2e8f0;text-decoration:none}.link b,.link span{display:block}.link span,.sub,.muted{color:#94a3b8;font-size:12px}.toolbar{display:flex;gap:8px;margin-bottom:12px}.toolbar input{flex:1;padding:11px;border-radius:9px;border:1px solid #334155;background:#0b1220;color:white}.toolbar button,.actions button{padding:9px 11px;border:0;border-radius:8px;background:#f59e0b;color:#111827;font-weight:800;cursor:pointer}.toolbar button:disabled,.actions button:disabled{opacity:.55;cursor:default}.msg{color:#86efac;font-size:13px;min-height:18px}.user-list{display:grid;gap:10px}.user-card{padding:14px;border:1px solid #334155;border-radius:12px;background:#0f1b30}.user-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.user-name{min-width:0}.user-name b{display:block;font-size:15px;overflow-wrap:anywhere}.user-name .muted{display:block;margin-top:2px}.user-id{margin-top:5px;color:#94a3b8;font-size:11px;word-break:break-all}.badges{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.role,.status{padding:4px 7px;border-radius:7px;background:#0b1220;font-size:11px;font-weight:800}.user-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}.stat{padding:9px;border-radius:9px;background:#162238;border:1px solid #334155}.stat span{display:block;color:#94a3b8;font-size:10px}.stat b{display:block;margin-top:3px;font-size:13px;overflow-wrap:anywhere}.actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}.actions button.secondary{background:#334155;color:#e2e8f0}.actions button.danger{background:#7f1d1d;color:#fff}.watchlist-panel{margin-top:12px;padding:12px;border:1px solid #334155;border-radius:10px;background:#0b1220}.watchlist-head{display:flex;justify-content:space-between;align-items:center;gap:10px}.watchlist-list{display:grid;gap:8px;margin-top:10px}.watchlist-item{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px;border-radius:9px;background:#162238;border:1px solid #334155}.watchlist-meta{min-width:0;color:#e2e8f0;font-size:12px}.watchlist-meta small{display:block;color:#94a3b8;margin-top:3px;overflow-wrap:anywhere}.audit{display:grid;gap:8px}.audit-item{padding:10px;border-radius:9px;background:#0b1220;border:1px solid #334155}.audit-item small{color:#94a3b8}@media(max-width:600px){.wrap{padding:18px 10px 40px}.top{align-items:flex-start}.user-head{display:block}.badges{justify-content:flex-start;margin-top:8px}.user-stats{grid-template-columns:1fr 1fr}.actions button{min-height:42px;padding:10px 12px}.watchlist-item{align-items:flex-start;flex-direction:column}.watchlist-item button{width:100%}}</style></head><body><main class="wrap"><div class="top"><a class="back" href="/">← EagleEye</a><div class="badge">OWNER CONTROL</div></div><h1>EagleEye オーナー管理</h1><p class="sub">OWNER権限で操作できる機能を集約</p>
<div class="card"><h2>管理機能</h2><div class="links"><a class="link" href="/admin/api-pool"><b>API Pool管理</b><span>APIキー・Pool・テスト</span></a><a class="link" href="/admin/google-drive"><b>Google Drive連携</b><span>接続状態・OAuth設定・Driveアーカイブ設定</span></a><a class="link" href="/admin/diagnostics"><b>システムログ</b><span>サービス状態・診断イベント・障害詳細</span></a><a class="link" href="/admin/data-coverage"><b>データ登録状況</b><span>現在登録されているプレイヤー数・王国数を確認</span></a><a class="link" href="/admin/api-raw-data"><b>API Raw Inspector</b><span>MightPulse保存生データと画像リソースを実画像で照合</span></a><a class="link" href="/owner/kingdom-load-test"><b>王国Watchlist実処理負荷テスト</b><span>本番と同じ取得・保存パイプラインを実行</span></a><a class="link" href="/owner/kingdom-catalog-r2-backfill"><b>王国Catalog R2バックフィル</b><span>既存詳細JSONを最大10件ずつR2へ退避</span></a><a class="link" href="/admin/kingdom-rankings"><b>王国ランキング</b><span>必要なランキングだけ取得・閲覧・Sheets出力</span></a><a class="link" href="/admin/data-retention"><b>データ保存期間</b><span>D1履歴・R2アーカイブ</span></a><a class="link" href="/admin/player-visibility"><b>データ公開設定</b><span>ロール別公開範囲</span></a><a class="link" href="/players"><b>プレイヤーDB</b><span>検索・詳細・履歴・変更</span></a><a class="link" href="/kingdom-watchlist"><b>王国ウォッチリスト</b><span>監視対象・ランキング</span></a></div></div>
<div class="card"><h2>ユーザー・権限管理</h2><div class="toolbar"><input id="search" placeholder="Discord ID / ユーザー名"><button id="reload" type="button">更新</button></div><div id="msg" class="msg"></div><div id="users" class="user-list">${initialUsersHtml}</div></div>
<div class="card"><h2>OWNER監査ログ</h2><div id="audit" class="audit"></div></div></main>
<script>
(function(){
var initialUsers=${usersJson}, initialLogs=${logsJson}, ownerId=${ownerId};
var users=Array.isArray(initialUsers)?initialUsers:[], activeWatchUserId=null;
var ue=document.getElementById("users"), ae=document.getElementById("audit"), msg=document.getElementById("msg"), search=document.getElementById("search");

function esc(s){
  return String(s==null?"":s).replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}
function fmt(t){
  return t ? new Date(Number(t)*1000).toLocaleString("ja-JP") : "-";
}
function button(label, action, id, extra, disabled, value){
  var attr=value ? (action==="role" ? ' data-role="'+esc(value)+'"' : ' data-status="'+esc(value)+'"') : "";
  return '<button type="button" class="'+(extra||"")+'" data-a="'+action+'" data-id="'+esc(id||"")+'"'+attr+(disabled?' disabled':'')+'>'+label+'</button>';
}
function draw(){
  var q=(search.value||"").trim().toLowerCase();
  var rows=users.filter(function(u){
    return !q ||
      String(u.discord_id||"").indexOf(q)>=0 ||
      String(u.username||"").toLowerCase().indexOf(q)>=0 ||
      String(u.global_name||"").toLowerCase().indexOf(q)>=0;
  });
  ue.innerHTML=rows.map(function(u){
    var self=u.user_id===ownerId;
    var actions=button("履歴","history",u.user_id,"secondary",false);
    ["BASIC","ADVANCED","VIP","ADMIN","OWNER"].forEach(function(role){
      if(role!==u.role) actions+=button(role+"へ","role",u.user_id,"",self&&role!=="OWNER",role);
    });
    if(u.status==="ACTIVE"){
      actions+=button("無効化","status",u.user_id,"danger",self||u.role==="OWNER","DISABLED");
    }else{
      actions+=button("有効化","status",u.user_id,"secondary",false,"ACTIVE");
    }
    if(self){
      actions+='<span class="muted">自分は対象外</span>';
    }else{
      actions+=button("監視管理","watchlists",u.user_id,"secondary",false);
    }
    var panel=activeWatchUserId===u.user_id
      ? '<div class="watchlist-panel" data-watch-panel="'+esc(u.user_id)+'"><div class="muted">監視データを読み込み中…</div></div>'
      : "";
    return '<article class="user-card"><div class="user-head"><div class="user-name"><b>'+
      esc(u.global_name||u.username||"Discord User")+
      '</b><span class="muted">@'+esc(u.username||"")+
      '</span><div class="user-id">'+esc(u.discord_id)+
      '</div></div><div class="badges"><span class="role">'+esc(u.role)+
      '</span><span class="status">'+esc(u.status)+
      '</span></div></div><div class="user-stats">'+
      '<div class="stat"><span>登録</span><b>'+fmt(u.created_at)+'</b></div>'+
      '<div class="stat"><span>最終ログイン</span><b>'+fmt(u.last_login_at)+'</b></div>'+
      '<div class="stat"><span>ログイン回数</span><b>'+esc(u.login_count||0)+'</b></div>'+
      '<div class="stat"><span>王国ウォッチ</span><b>'+esc(u.kingdom_watchlist_count||0)+'件</b></div>'+
      '<div class="stat"><span>プレイヤーウォッチ</span><b>'+esc(u.player_watchlist_count||0)+'件</b></div>'+
      '</div><div class="actions">'+actions+'</div>'+panel+'</article>';
  }).join("") || '<div class="muted">該当ユーザーなし</div>';
}
function drawAudit(ls){
  ae.innerHTML=(ls||[]).map(function(x){
    return '<div class="audit-item"><b>'+esc(x.action)+
      '</b> · target '+esc(x.target_discord_id||"-")+
      '<br><small>'+fmt(x.created_at)+' · actor '+esc(x.actor_discord_id||"-")+
      '<br>'+esc(x.details_json||"")+'</small></div>';
  }).join("") || '<div class="muted">監査ログなし</div>';
}
function jsonFetch(url, options){
  return fetch(url, options).then(function(r){
    return r.json().catch(function(){return {ok:false,error:"INVALID_RESPONSE"};}).then(function(d){
      if(!r.ok || d.ok===false) throw new Error(d.error||"リクエスト失敗");
      return d;
    });
  });
}
function showHistory(id){
  return jsonFetch("/api/owner/users/login-history?user_id="+encodeURIComponent(id),{cache:"no-store",credentials:"same-origin"})
    .then(function(d){
      var text=(d.history||[]).map(function(x){
        return fmt(x.logged_in_at)+" · "+esc(x.global_name||x.username||x.discord_id);
      }).join("\\n") || "ログイン履歴なし";
      alert("ログイン履歴\\n\\n"+text);
    });
}
function findWatchPanel(id){
  var panels=ue.querySelectorAll("[data-watch-panel]");
  for(var i=0;i<panels.length;i++){
    if(panels[i].getAttribute("data-watch-panel")===String(id)) return panels[i];
  }
  return null;
}
function loadWatchlists(id){
  activeWatchUserId=id;
  draw();
  var panel=findWatchPanel(id);
  if(!panel) return Promise.reject(new Error("監視パネルを表示できませんでした"));
  return jsonFetch("/api/owner/users/watchlists?user_id="+encodeURIComponent(id),{cache:"no-store",credentials:"same-origin"})
    .then(function(d){
      var items=[];
      (d.kingdom_watchlists||[]).forEach(function(w){
        items.push('<div class="watchlist-item"><div class="watchlist-meta"><b>王国 '+esc(w.kid)+'</b><small>TOP '+esc(w.top_n)+' / '+esc(w.interval_hours)+'時間 / '+(w.enabled?"有効":"停止")+' / ID '+esc(w.watchlist_id)+'</small></div><button type="button" class="danger" data-wtype="KINGDOM" data-wid="'+esc(w.watchlist_id)+'" data-uid="'+esc(id)+'">削除</button></div>');
      });
      (d.player_watchlists||[]).forEach(function(w){
        items.push('<div class="watchlist-item"><div class="watchlist-meta"><b>プレイヤー '+esc(w.governor_id)+'</b><small>'+esc(w.label||"")+' / '+(w.enabled?"有効":"停止")+' / ID '+esc(w.watchlist_id)+'</small></div><button type="button" class="danger" data-wtype="PLAYER" data-wid="'+esc(w.watchlist_id)+'" data-uid="'+esc(id)+'">削除</button></div>');
      });
      panel.innerHTML='<div class="watchlist-head"><b>'+esc(d.user&& (d.user.global_name||d.user.username) || "ユーザー")+' の監視管理</b><button type="button" class="secondary" data-a="close-watch">閉じる</button></div><div class="muted" style="margin-top:6px">王国 '+(d.kingdom_watchlists||[]).length+'件 / プレイヤー '+(d.player_watchlists||[]).length+'件</div><div class="watchlist-list">'+(items.length?items.join(""):'<div class="muted">ウォッチリストはありません。</div>')+'</div>';
    })
    .catch(function(e){
      panel.innerHTML='<div style="color:#fca5a5">読み込み失敗: '+esc(e.message||e)+'</div>';
      throw e;
    });
}
function deleteWatchlist(type,id,userId,buttonEl){
  if(!confirm((type==="KINGDOM"?"王国":"プレイヤー")+"ウォッチリストを削除しますか？\\nこの操作はOWNERによる復旧操作です。")) return Promise.resolve();
  buttonEl.disabled=true;
  return jsonFetch("/api/owner/users/watchlists?user_id="+encodeURIComponent(userId)+"&type="+encodeURIComponent(type)+"&watchlist_id="+encodeURIComponent(id),{
    method:"DELETE",credentials:"same-origin"
  }).then(function(){
    msg.textContent="ウォッチリストを削除しました。";
    return refresh();
  }).then(function(){
    return loadWatchlists(userId);
  }).catch(function(e){
    msg.textContent="削除失敗: "+(e.message||e);
    buttonEl.disabled=false;
  });
}
function post(url,body){
  return jsonFetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),credentials:"same-origin"});
}
function refresh(){
  msg.textContent="更新中…";
  var btn=document.getElementById("reload");
  if(btn) btn.disabled=true;
  return jsonFetch("/api/owner/users?limit=250",{cache:"no-store",credentials:"same-origin"})
    .then(function(d){
      users=d.users||[];
      activeWatchUserId=null;
      draw();
      return jsonFetch("/api/owner/audit-log?limit=250",{cache:"no-store",credentials:"same-origin"}).then(function(a){
        drawAudit(a.logs||[]);
        msg.textContent="更新しました。 "+users.length+"ユーザー";
      });
    })
    .catch(function(e){
      msg.textContent="読み込み失敗: "+(e.message||e);
    })
    .then(function(){
      if(btn) btn.disabled=false;
    });
}
search.addEventListener("input",draw);
ue.addEventListener("click",function(e){
  var node=e.target;
  while(node && node!==ue && node.tagName!=="BUTTON") node=node.parentNode;
  if(!node || node===ue) return;
  var action=node.getAttribute("data-a");
  if(node.getAttribute("data-wtype")){
    deleteWatchlist(node.getAttribute("data-wtype"),node.getAttribute("data-wid"),node.getAttribute("data-uid"),node);
    return;
  }
  if(action==="watchlists"){
    node.disabled=true;
    node.textContent="読み込み中…";
    loadWatchlists(node.getAttribute("data-id")).then(function(){
      node.disabled=false;
      node.textContent="監視管理";
    }).catch(function(e){
      msg.textContent="監視管理エラー: "+(e.message||e);
      node.disabled=false;
      node.textContent="監視管理";
    });
    return;
  }
  if(action==="close-watch"){
    activeWatchUserId=null;
    draw();
    return;
  }
  if(action==="history"){
    showHistory(node.getAttribute("data-id")).catch(function(e){msg.textContent=e.message||String(e);});
    return;
  }
  if(action!=="role" && action!=="status") return;
  var question=action==="role" ? "権限を "+node.getAttribute("data-role")+" に変更しますか？" : "状態を "+node.getAttribute("data-status")+" に変更しますか？";
  if(!confirm(question)) return;
  node.disabled=true;
  var body=action==="role"
    ? {user_id:node.getAttribute("data-id"),role:node.getAttribute("data-role")}
    : {user_id:node.getAttribute("data-id"),status:node.getAttribute("data-status")};
  post(action==="role"?"/api/owner/users/role":"/api/owner/users/status",body)
    .then(function(){msg.textContent="保存しました。";return refresh();})
    .catch(function(e){msg.textContent=e.message||String(e);node.disabled=false;});
});
document.getElementById("reload").addEventListener("click",refresh);
draw();
drawAudit(initialLogs);
})();
</script></body></html>`;
}


async function handleDiscordSupportCommandRegistrationApi(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE" || !["ADMIN", "OWNER"].includes(String(auth.role || "").toUpperCase())) {
    return json({ ok: false, error: "FORBIDDEN" }, 403);
  }
  if (request.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const commands = await registerSupportCommands(env);
    return json({ ok: true, commands: commands.map(command => ({ id: command?.id || null, name: command?.name || null, type: command?.type || null })) });
  } catch (error) {
    console.error("discord_support_command_registration_failed", error?.message || error);
    return json({ ok: false, error: String(error?.message || "DISCORD_SUPPORT_COMMAND_REGISTRATION_FAILED") }, Number(error?.status) || 503);
  }
}

async function handleMe(request, env) {
  const secret = env.EAGLEEYE_SESSION_SECRET;
  const token = parseCookie(request.headers.get("Cookie") || "")[SESSION_COOKIE];
  if (!token || !secret) return json({ ok: true, authenticated: false });

  const session = await verifyPayload(token, secret);
  if (!session) return json({ ok: true, authenticated: false });

  const dbUser = env.DB
    ? await env.DB.prepare(
        "SELECT user_id, discord_id, role, status FROM users WHERE discord_id = ? LIMIT 1"
      ).bind(session.sub).first()
    : null;

  return json({
    ok: true,
    authenticated: true,
    user: {
      discord_id: session.sub,
      username: session.username,
      global_name: session.global_name,
      avatar: session.avatar,
      role: dbUser?.role || "BASIC",
      status: dbUser?.status || "ACTIVE"
    }
  });
}

const RUNTIME_MONITORING_PROFILE_COOKIE = "EAGLEEYE_MONITORING_PROFILE";
let runtimeMonitoringProfileCache = { profile: null, source: null, updatedAt: null, updatedBy: null, expiresAt: 0 };

function normalizeMonitoringProfile(value, fallback = "FREE") {
  const profile = String(value || "").trim().toUpperCase();
  return profile === "PAID_5USD" || profile === "FREE" ? profile : fallback;
}

function getRuntimeMonitoringProfile(request, env) {
  const cookies = parseCookie(request.headers.get("Cookie") || "");
  const cookieProfile = normalizeMonitoringProfile(cookies[RUNTIME_MONITORING_PROFILE_COOKIE], "");
  if (cookieProfile) return { profile: cookieProfile, source: "COOKIE", updatedAt: null, updatedBy: null };
  return { profile: normalizeMonitoringProfile(env.CLOUDFLARE_MONITORING_PROFILE, "FREE"), source: "ENV", updatedAt: null, updatedBy: null };
}

async function handleMonitoringProfileApi(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE" || !["ADMIN", "OWNER"].includes(String(auth.role || "").toUpperCase())) {
    return json({ ok: false, error: "FORBIDDEN" }, 403);
  }
  if (request.method === "GET") {
    const setting = getRuntimeMonitoringProfile(request, env);
    return json({ ok: true, profile: setting.profile, source: setting.source });
  }
  if (request.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "INVALID_JSON" }, 400); }
  const profile = normalizeMonitoringProfile(body?.profile, "");
  if (!profile) return json({ ok: false, error: "INVALID_PROFILE" }, 400);

  const response = json({ ok: true, profile, source: "COOKIE" });
  response.headers.set("Set-Cookie", serializeCookie(RUNTIME_MONITORING_PROFILE_COOKIE, profile, {
    maxAge: 60 * 60 * 24 * 365, httpOnly: true, secure: true, sameSite: "Lax", path: "/"
  }));
  return response;
}
async function handleR2ArchiveObjectsApi(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE" || !["ADMIN", "OWNER"].includes(String(auth.role || "").toUpperCase())) {
    return json({ ok: false, error: "FORBIDDEN" }, 403);
  }
  if (request.method !== "GET") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!env.ARCHIVE) return json({ ok: false, error: "R2_ARCHIVE_NOT_CONFIGURED" }, 503);

  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") || 50);
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 50, 1), 100);
  const requestedPrefix = String(url.searchParams.get("prefix") || "").trim();
  const prefixes = requestedPrefix ? [requestedPrefix.slice(0, 120)] : ["history/v1/", "archive/v1/"];
  const checkedAt = Date.now();
  const results = [];
  const prefixStatus = [];

  for (const prefix of prefixes) {
    try {
      const listed = await env.ARCHIVE.list({ prefix, limit });
      const objects = (listed.objects || []).slice(0, limit).map(object => ({
        key: object.key,
        size: Number(object.size || 0),
        uploaded: object.uploaded || null,
        etag: object.etag || null,
        httpEtag: object.httpEtag || null
      }));
      results.push(...objects);
      prefixStatus.push({ prefix, listedCount: objects.length, truncated: Boolean(listed.truncated), cursorAvailable: Boolean(listed.cursor) });
    } catch (error) {
      prefixStatus.push({ prefix, listedCount: 0, truncated: false, cursorAvailable: false, error: String(error?.message || error).slice(0, 500) });
    }
  }

  results.sort((a, b) => String(b.uploaded || "").localeCompare(String(a.uploaded || "")) || String(a.key).localeCompare(String(b.key)));
  return json({ ok: true, bucket: "eagleeye-archive", checkedAt, limit, objectCountListed: results.length, prefixes: prefixStatus, objects: results.slice(0, limit) });
}

async function renderPublicStatusPage(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  const canViewDetailedUsage = Boolean(
    auth &&
    auth.status === "ACTIVE" &&
    ["ADMIN", "OWNER"].includes(String(auth.role || "").toUpperCase())
  );

  const monitoringProfileSetting = canViewDetailedUsage
    ? await getRuntimeMonitoringProfile(request, env)
    : { profile: normalizeMonitoringProfile(env.CLOUDFLARE_MONITORING_PROFILE, "FREE"), source: "ENV", updatedAt: null, updatedBy: null };

  // Cloudflare Analytics is intentionally queried outside D1. If D1 has hit
  // its free-tier row limit, this monitor must still be able to report usage.
  const [usageResult, diagnosticsResult, operationalResult, historyStorageResult] = await Promise.allSettled([
    canViewDetailedUsage
      ? getCloudflareD1Usage(env, { includeQueryInsights: true, monitoringProfile: monitoringProfileSetting.profile })
      : Promise.resolve({
          configured: false,
          status: "HIDDEN",
          message: "Cloudflareの詳細使用量はADMIN / OWNERのみ確認できます。"
        }),
    getSystemDiagnostics(env.DB, { recentLimit: 100 }),
    getOperationalStatus(env.DB),
    canViewDetailedUsage
      ? (async () => {
          const mode = String(env.HISTORY_STORAGE_MODE || "UNSET").trim().toUpperCase();
          if (!env.ARCHIVE) return { mode, archiveBindingConfigured: false, archiveReadProbe: "NOT_CONFIGURED", archiveReadOnly: true };
          try {
            await env.ARCHIVE.head("__eagleeye_runtime_probe__");
            return { mode, archiveBindingConfigured: true, archiveReadProbe: "OK", archiveReadOnly: true };
          } catch (error) {
            return { mode, archiveBindingConfigured: true, archiveReadProbe: "FAILED", archiveReadOnly: true, archiveReadError: String(error?.message || error).slice(0, 500) };
          }
        })()
      : Promise.resolve({ mode: String(env.HISTORY_STORAGE_MODE || "UNSET").trim().toUpperCase(), archiveBindingConfigured: Boolean(env.ARCHIVE), archiveReadProbe: "HIDDEN", archiveReadOnly: true })
  ]);

  const usage = usageResult.status === "fulfilled" ? usageResult.value : {
    configured: Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_ANALYTICS_TOKEN),
    status: "UNKNOWN",
    message: usageResult.reason?.message || "Cloudflare Analytics APIの取得に失敗しました。"
  };

  const historyStorage = historyStorageResult.status === "fulfilled" ? historyStorageResult.value : {
    mode: String(env.HISTORY_STORAGE_MODE || "UNSET").trim().toUpperCase(),
    archiveBindingConfigured: Boolean(env.ARCHIVE),
    archiveReadProbe: "UNKNOWN",
    archiveReadOnly: true,
    archiveReadError: historyStorageResult.reason?.message || "HISTORY_STORAGE_STATUS_UNAVAILABLE"
  };

  const operational = operationalResult.status === "fulfilled" ? operationalResult.value : {
    apiPool: {
      pools: {},
      totals: { AVAILABLE: 0, COOLDOWN: 0, ERROR: 0, DISABLED: 0, REVOKED: 0 },
      totalKeys: 0,
      availableKeys: 0,
      activeLeases: 0,
      expiredActiveLeases: 0,
      latestKey: null
    },
    watchlist: {
      total: 0,
      enabled: 0,
      enabledErrors: 0,
      latestSuccessAt: null,
      latestUpdatedAt: null,
      latestJob: null
    }
  };
  if (operationalResult.status !== "fulfilled") {
    console.error("public_status_operational_unavailable", operationalResult.reason?.message || operationalResult.reason);
  }

  let data;
  if (diagnosticsResult.status === "fulfilled") {
    data = diagnosticsResult.value;
  } else {
    const services = DIAGNOSTIC_SERVICES.map(([key, label, severity]) => ({
      key,
      label,
      severity,
      status: key === "d1" ? "FAILED" : "UNKNOWN",
      last_event_at: null,
      last_error_code: diagnosticsResult.reason?.code || "D1_DIAGNOSTICS_UNAVAILABLE",
      last_message: key === "d1" ? "D1診断データを取得できません。" : null,
      last_trace_id: null,
      last_target_id: null
    }));
    data = {
      overall: "CRITICAL",
      counts: {
        failed: 1,
        criticalFailed: 1,
        warning: 0,
        unknown: services.filter(item => item.status === "UNKNOWN").length,
        criticalUnknown: 0,
        healthy: 0
      },
      services,
      events: []
    };
    console.error("public_status_diagnostics_unavailable", diagnosticsResult.reason?.message || diagnosticsResult.reason);
  }

  const poolTotals = operational.apiPool.totals || {};
  const terminalKeyStates = Number(poolTotals.ERROR || 0) + Number(poolTotals.DISABLED || 0) + Number(poolTotals.REVOKED || 0);
  const apiPoolCritical = operational.apiPool.totalKeys > 0 &&
    operational.apiPool.availableKeys === 0 &&
    Number(poolTotals.COOLDOWN || 0) === 0 &&
    Number(operational.apiPool.activeLeases || 0) === 0 &&
    terminalKeyStates >= Number(operational.apiPool.totalKeys || 0);
  const watchlistWarning = operational.watchlist.enabled > 0 && operational.watchlist.enabledErrors > 0;
  const usageCritical = ["CRITICAL", "EXHAUSTED"].includes(usage.status);
  const usageWarning = usage.status === "WARNING";
  const state = usageCritical || data.overall === "CRITICAL" || apiPoolCritical
    ? {label:"Service Disruption",tone:"bad",icon:"!",desc:"主要サービス、API Pool、またはCloudflareリソースの一部で障害・上限到達が検知されています。"}
    : data.overall === "WAITING" && !usageWarning && !watchlistWarning
      ? {label:"Capacity Waiting",tone:"neutral",icon:"…",desc:"API Poolの空き待ちです。収集処理は自動再試行の対象で、障害とは区別されています。"}
      : usageWarning || data.overall === "DEGRADED" || watchlistWarning
        ? {label:"Some Services Degraded",tone:"warn",icon:"i",desc:"一部のサービス、API Pool、ウォッチリスト、またはCloudflareリソースで注意が必要です。"}
        : {label:"System Operational",tone:"good",icon:"✓",desc:"EagleEyeの監視対象サービス、API Pool、ウォッチリスト、Cloudflareリソースは正常範囲です。"};

  const rows = data.services.map(s => {
    const st = s.status === "SUCCESS" ? {label:"正常",tone:"good",icon:"✓"} : s.status === "FAILED" ? {label:"障害",tone:"bad",icon:"!"} : s.status === "WARNING" ? {label:"注意",tone:"warn",icon:"!"} : s.status === "WAITING" ? {label:"待機中",tone:"neutral",icon:"…"} : {label:"未確認",tone:"neutral",icon:"—"};
    return `<div class="row"><span class="dot ${st.tone}">${st.icon}</span><span class="name">${escapeHtml(s.label)}</span><span class="state ${st.tone}">${st.label}</span></div>`;
  }).join("");

  const usageLabel = cloudflareUsageLabel(usage.status);
  const formatInt = value => Number(value || 0).toLocaleString("ja-JP");
  const formatBytes = value => {
    const bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes < 1024) return Math.round(bytes).toLocaleString("ja-JP") + " B";
    const units = ["KB", "MB", "GB", "TB"];
    let size = bytes;
    let unit = -1;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }
    return size.toFixed(size >= 100 ? 0 : size >= 10 ? 1 : 2) + " " + units[unit];
  };
  const formatPercent = value => value == null ? "—" : Number(value).toFixed(1) + "%";
  const formatYen = value => value == null ? "—" : "¥" + Math.round(Number(value)).toLocaleString("ja-JP");
  const workerVersion = env.CF_VERSION_METADATA ? { id: env.CF_VERSION_METADATA.id || null, tag: env.CF_VERSION_METADATA.tag || null, timestamp: env.CF_VERSION_METADATA.timestamp || null } : null;
  const monitoringProfile = usage.monitoring?.profile || monitoringProfileSetting.profile || "FREE";
  const monitoringLabel = usage.monitoring?.label || "Workers Free";
  const monitoringBudgetPercent = usage.monitoring?.budgetUtilizationPercent ?? null;
  const monitoringBudgetState = usage.monitoring?.budgetState || "UNKNOWN";
  const monitoringEstimatedCostUsd = usage.monitoring?.estimatedMonthlyCostUsd ?? null;
  const monitoringEstimatedOverageUsd = usage.monitoring?.estimatedOverageUsd ?? null;
  const monitoringEstimatedCostJpy = usage.monitoring?.estimatedMonthlyCostJpy ?? null;
  const monitoringEstimatedOverageJpy = usage.monitoring?.estimatedOverageJpy ?? null;
  const monitoringUsdJpyRate = usage.monitoring?.usdJpyRate ?? null;
  const usagePeriod = usage.usagePeriod || null;
  const billingCycle = usage.monitoring?.billingCycle || usagePeriod?.billingCycle || null;
  const formatPeriodDate = value => value ? new Date(value).toLocaleString("ja-JP", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
  const billingPeriodLabel = monitoringProfile === "PAID_5USD"
    ? (usagePeriod?.basis === "CLOUDFLARE_BILLING_CYCLE"
      ? "請求サイクル: " + formatPeriodDate(usagePeriod.start) + " ～ " + formatPeriodDate(usagePeriod.end) + "（UTC）"
      : "請求サイクル未取得：カレンダー月フォールバック中")
    : "Free監視: UTC日次";
  const monitoringBudgetLabel = monitoringProfile === "PAID_5USD"
    ? "最大使用率（CPU推定を含む）"
    : "Freeプラン現行監視の最大使用率";
  const resourceRow = (label, used, limit, percentValue, stateValue) => {
    const item = cloudflareUsageLabel(stateValue);
    return `<div class="resource-row"><div><b>${escapeHtml(label)}</b><small>${formatInt(used)} / ${formatInt(limit)}</small></div><strong class="${item.tone}">${formatPercent(percentValue)} · ${item.label}</strong></div>`;
  };

  const formatUnixStatus = value => value ? new Date(Number(value) * 1000).toLocaleString("ja-JP") : "—";
  const poolTypeLabel = type => ({
    SYSTEM_GENERAL: "SYSTEM_GENERAL",
    SYSTEM_WATCHLIST: "SYSTEM_WATCHLIST",
    USER_CONTRIBUTED: "USER_CONTRIBUTED"
  })[type] || type;
  const poolRows = Object.entries(operational.apiPool.pools).map(([type, statuses]) => `
    <div class="resource-row">
      <div><b>${escapeHtml(poolTypeLabel(type))}</b><small>登録 ${formatInt(Object.values(statuses).reduce((a,b)=>a+Number(b||0),0))} · AVAILABLE / ERROR / COOLDOWN / DISABLED</small></div>
      <strong>${formatInt(statuses.AVAILABLE)} / ${formatInt(statuses.ERROR + statuses.COOLDOWN + statuses.DISABLED + statuses.REVOKED)}</strong>
    </div>`).join("") || '<div class="resource-note">APIキーが登録されていません。</div>';
  const latestKey = operational.apiPool.latestKey;
  const apiPoolSection = `
    <section class="section">
      <h2>API Pool Health</h2>
      <div class="card resource-card">
        <div class="resource-head"><div><b>現在のPool状態</b><small>${formatInt(operational.apiPool.availableKeys)} / ${formatInt(operational.apiPool.totalKeys)} keys がAVAILABLE</small></div><span class="state ${apiPoolCritical ? "bad" : operational.apiPool.availableKeys > 0 ? "good" : "neutral"}">${apiPoolCritical ? "利用可能キーなし" : operational.apiPool.availableKeys > 0 ? "利用可能" : "未登録"}</span></div>
        ${poolRows}
        <div class="resource-row"><div><b>ACTIVE Lease</b><small>現在有効なAPIキー貸出</small></div><strong>${formatInt(operational.apiPool.activeLeases)}</strong></div>
        <div class="resource-row"><div><b>Pool合計</b><small>AVAILABLE / COOLDOWN / ERROR / DISABLED / REVOKED</small></div><strong>${formatInt(operational.apiPool.totals.AVAILABLE)} / ${formatInt(operational.apiPool.totals.COOLDOWN)} / ${formatInt(operational.apiPool.totals.ERROR)} / ${formatInt(operational.apiPool.totals.DISABLED)} / ${formatInt(operational.apiPool.totals.REVOKED)}</strong></div>
        ${latestKey ? `<div class="resource-row"><div><b>直近キー状態</b><small>${escapeHtml(latestKey.poolType || "—")} · ${escapeHtml(latestKey.label || "ラベルなし")}</small></div><strong>${escapeHtml(latestKey.status || "—")}</strong></div>` : ""}
        ${latestKey?.lastErrorAt ? `<div class="resource-row"><div><b>直近エラー履歴</b><small>${formatUnixStatus(latestKey.lastErrorAt)} · ${escapeHtml(latestKey.lastErrorCode || "ERROR")}</small></div><strong>${escapeHtml(latestKey.lastErrorMessage || "メッセージなし")}</strong></div>` : ""}
      </div>
    </section>`;

  const mightPulseService = data.services.find(item => item.key === "mightpulse");
  const mightPulseSection = `
    <section class="section">
      <h2>MightPulse</h2>
      <div class="card resource-card">
        <div class="resource-head"><div><b>MightPulse API</b><small>直近の診断イベントに基づく状態</small></div><span class="state ${mightPulseService?.status === "FAILED" ? "bad" : mightPulseService?.status === "SUCCESS" ? "good" : "warn"}">${mightPulseService?.status === "FAILED" ? "障害" : mightPulseService?.status === "SUCCESS" ? "正常" : mightPulseService?.status === "WARNING" ? "注意" : "未確認"}</span></div>
        <div class="resource-row"><div><b>直近イベント</b><small>${formatUnixStatus(mightPulseService?.last_event_at)}</small></div><strong>${escapeHtml(mightPulseService?.last_error_code || mightPulseService?.last_message || "—")}</strong></div>
      </div>
    </section>`;

  const watch = operational.watchlist;
  const latestJob = watch.latestJob;
  const watchlistSection = `
    <section class="section">
      <h2>ウォッチリスト</h2>
      <div class="card resource-card">
        <div class="resource-head"><div><b>王国ウォッチリスト</b><small>有効 ${formatInt(watch.enabled)} / 登録 ${formatInt(watch.total)}</small></div><span class="state ${watch.enabled === 0 ? "neutral" : watch.enabledErrors > 0 ? "warn" : "good"}">${watch.enabled === 0 ? "監視なし" : watch.enabledErrors > 0 ? "注意" : "正常"}</span></div>
        <div class="resource-row"><div><b>有効監視エラー</b><small>last_error が残っている有効監視</small></div><strong>${formatInt(watch.enabledErrors)}</strong></div>
        ${latestJob ? `<div class="resource-row"><div><b>最新ジョブ</b><small>${formatUnixStatus(latestJob.updatedAt)} · ranking ${formatInt(latestJob.rankingRows)} / player ${formatInt(latestJob.playerRows)}</small></div><strong>${escapeHtml(latestJob.status || "—")}</strong></div>` : '<div class="resource-note">まだウォッチリストジョブはありません。</div>'}
        ${latestJob?.lastError ? `<div class="resource-row"><div><b>最新ジョブエラー</b><small>${formatUnixStatus(latestJob.updatedAt)}</small></div><strong>${escapeHtml(latestJob.lastError)}</strong></div>` : ""}
      </div>
    </section>`;

  const databaseSection = `
    <section class="section">
      <h2>Database</h2>
      <div class="card resource-card">
        <div class="resource-head"><div><b>D1 Database</b><small>eagleeye-db · ${escapeHtml(data.services.find(item => item.key === "d1")?.status || "UNKNOWN")}</small></div><span class="state ${data.services.find(item => item.key === "d1")?.status === "FAILED" ? "bad" : "good"}">${data.services.find(item => item.key === "d1")?.status === "FAILED" ? "障害" : "稼働"}</span></div>
        <div class="resource-row"><div><b>D1 Storage</b><small>Cloudflare Analytics ${usage.database?.databaseSizeBytes != null ? "取得済み" : "未確認"}</small></div><strong>${usage.database?.databaseSizeBytes != null ? formatBytes(usage.database.databaseSizeBytes) : "—"}</strong></div>
        <div class="resource-note">D1のRows Read / Rows Written / Storageの使用量はCloudflareリソース監視に表示しています。</div>
      </div>
    </section>`;

  const r2Section = `
    <section class="section">
      <h2>R2 Archive</h2>
      <div class="card resource-card">
        <div class="resource-head"><div><b>eagleeye-archive</b><small>D1履歴のアーカイブ先</small></div><span class="state ${env.ARCHIVE ? "good" : "bad"}">${env.ARCHIVE ? "接続済み" : "未設定"}</span></div>
        <div class="resource-row"><div><b>アーカイブ対象</b><small>operational archive tables</small></div><strong>5 tables</strong></div>
        <div class="resource-row"><div><b>対象</b><small>api_observations / player_snapshots / ranking_snapshots</small></div><strong>R2</strong></div>
        <div class="resource-note">R2の月次使用量・オブジェクト数・OperationsはCloudflareリソース監視に表示しています。</div>
      </div>
    </section>`;

  const r2ObjectInventorySection = canViewDetailedUsage ? `
    <section class="section">
      <h2>R2 実オブジェクト確認</h2>
      <div class="card resource-card">
        <div class="resource-head">
          <div><b>eagleeye-archive</b><small>R2に実際に保存されているアーカイブオブジェクトを手動確認</small></div>
          <button type="button" id="r2-object-check" class="monitoring-switch-btn" style="border:1px solid #d2d2d7;background:#f2f2f7">実オブジェクトを確認</button>
        </div>
        <div id="r2-object-check-result" class="resource-note">未確認。ボタンを押した時だけR2 LISTを実行します（D1は使用しません）。</div>
      </div>
    </section>` : "";
  const googleModes = [
    env.GOOGLE_SHEETS_WEBAPP_URL && env.GOOGLE_SHEETS_WEBAPP_SECRET ? "Apps Script Web App" : null,
    env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY && env.GOOGLE_SHEETS_SPREADSHEET_ID ? "Service Account" : null
  ].filter(Boolean);
  const googleSection = `
    <section class="section">
      <h2>Google連携</h2>
      <div class="card resource-card">
        <div class="resource-head"><div><b>Google Sheets</b><small>管理者向けエクスポート連携</small></div><span class="state ${googleModes.length ? "good" : "neutral"}">${googleModes.length ? "設定済み" : "未設定"}</span></div>
        <div class="resource-row"><div><b>接続方式</b><small>利用可能な設定</small></div><strong>${escapeHtml(googleModes.join(" / ") || "未設定")}</strong></div>
      </div>
    </section>`;

  const runtimeSection = `
    <section class="section">
      <h2>Runtime / Cron</h2>
      <div class="card resource-card">
        <div class="resource-row"><div><b>Worker</b><small>kingshot-data-platform</small></div><strong>稼働</strong></div>
        <div class="resource-row"><div><b>Cron</b><small>Worker scheduled trigger</small></div><strong>5分ごと</strong></div>
        <div class="resource-row"><div><b>Retention</b><small>毎時00分に実行</small></div><strong>設定済み</strong></div>
      </div>
    </section>`;

  const runtimeConfigRows = [
    ["Worker", "kingshot-data-platform", true],
    ["Worker Version ID", workerVersion?.id || "未取得", Boolean(workerVersion?.id)],
    ["Worker Version Tag", workerVersion?.tag || "未取得", Boolean(workerVersion?.tag)],
    ["Worker Version Created", workerVersion?.timestamp ? new Date(workerVersion.timestamp).toLocaleString("ja-JP") : "未取得", Boolean(workerVersion?.timestamp)],
    ["Monitoring Profile", monitoringProfile + " / " + monitoringLabel, Boolean(env.CLOUDFLARE_MONITORING_PROFILE)],
    ["DB Binding", "D1", Boolean(env.DB)],
    ["ARCHIVE Binding", "R2", Boolean(env.ARCHIVE)],
    ["HISTORY_STORAGE_MODE", historyStorage.mode, Boolean(env.HISTORY_STORAGE_MODE)],
    ["Cloudflare Analytics", "Account / Token / D1 Database", Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_ANALYTICS_TOKEN && env.CLOUDFLARE_D1_DATABASE_ID)],
    ["MightPulse", "Base URL", Boolean(env.MIGHTPULSE_API_BASE_URL)],
    ["Discord", "OAuth / Session", Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.EAGLEEYE_SESSION_SECRET)],
    ["Google Sheets Apps Script", "Web App", Boolean(env.GOOGLE_SHEETS_WEBAPP_URL && env.GOOGLE_SHEETS_WEBAPP_SECRET)],
    ["Google Sheets Service Account", "Spreadsheet / Service Account", Boolean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY && env.GOOGLE_SHEETS_SPREADSHEET_ID)],
    ["Google Drive OAuth", "OAuth Client / Refresh Token / Folder", Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET && env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI && env.GOOGLE_DRIVE_REFRESH_TOKEN && env.GOOGLE_DRIVE_FOLDER_ID)],
    ["Gateway", "Read-only Status API", Boolean(env.EAGLEEYE_GATEWAY_TOKEN)]
  ];
  const runtimeConfigSection = canViewDetailedUsage ? `
    <section class="section">
      <h2>Runtime / Configuration</h2>
      <div class="card resource-card">
        <div class="resource-head"><div><b>実行時構成</b><small>秘密値そのものは表示しません</small></div><span class="state good">取得済み</span></div>
        ${runtimeConfigRows.map(([label, detail, configured]) => `
          <div class="resource-row"><div><b>${escapeHtml(label)}</b><small>${escapeHtml(detail)}</small></div><strong class="${configured ? "good" : "neutral"}">${configured ? "設定済み" : "未設定"}</strong></div>
        `).join("")}
        <div class="resource-row"><div><b>Worker Version</b><small>Cloudflare Version Metadata · 本番で実行されたWorkerの版を識別</small></div><strong>${workerVersion?.id ? escapeHtml(workerVersion.id) : "未取得"}</strong></div>
        <div class="resource-row"><div><b>R2 Runtime Probe</b><small>read-only HeadObject</small></div><strong class="${historyStorage.archiveReadProbe === "OK" ? "good" : historyStorage.archiveReadProbe === "FAILED" ? "bad" : "neutral"}">${escapeHtml(historyStorage.archiveReadProbe)}</strong></div>
        ${historyStorage.archiveReadError ? `<div class="resource-note">${escapeHtml(historyStorage.archiveReadError)}</div>` : ""}
      </div>
    </section>` : "";

  const workerDetailSection = canViewDetailedUsage && usage.workers?.available ? `
    <section class="section">
      <h2>Workers 詳細</h2>
      <div class="card resource-card">
        <div class="resource-row"><div><b>Requests</b><small>${monitoringProfile === "PAID_5USD" ? "請求サイクル内 / Paid込み枠安全上限" : "当日UTC / Free Tier 100,000"}</small></div><strong>${formatInt(usage.workers.requests)} · ${formatPercent(usage.workers.requestsPercent)}</strong></div>
        <div class="resource-row"><div><b>Errors</b><small>当日UTC</small></div><strong>${formatInt(usage.workers.errors)}</strong></div>
        <div class="resource-row"><div><b>Subrequests</b><small>平均 / invocation</small></div><strong>${formatInt(usage.workers.subrequests)} · avg ${Number(usage.workers.averageSubrequests || 0).toFixed(2)}</strong></div>
        <div class="resource-row"><div><b>CPU P50 / P90 / P99</b><small>ms / invocation</small></div><strong>${Number(usage.workers.cpuTimeP50 || 0).toFixed(2)} / ${Number(usage.workers.cpuTimeP90 || 0).toFixed(2)} / ${Number(usage.workers.cpuTimeP99 || 0).toFixed(2)} ms</strong></div>
        <div class="resource-note">WorkersのFree Tier上限だけでなく、Errors・Subrequests・CPU分位点も同時表示しています。</div>
      </div>
    </section>` : "";

  const r2DetailSection = canViewDetailedUsage && usage.r2?.available ? `
    <section class="section">
      <h2>R2 詳細</h2>
      <div class="card resource-card">
        <div class="resource-row"><div><b>Operations</b><small>Total / Success / Failed</small></div><strong>${formatInt(usage.r2.totalOperations)} / ${formatInt(usage.r2.successfulOperations)} / ${formatInt(usage.r2.failedOperations)}</strong></div>
        <div class="resource-row"><div><b>Failed Rate</b><small>R2 operations</small></div><strong>${formatPercent(usage.r2.failedPercent)}</strong></div>
        <div class="resource-row"><div><b>Upload / Download</b><small>Bandwidth</small></div><strong>${formatBytes(usage.r2.bytesUpload)} / ${formatBytes(usage.r2.bytesDownload)}</strong></div>
        <div class="resource-row"><div><b>Payload / Metadata</b><small>latest aggregated storage</small></div><strong>${formatBytes(usage.r2.payloadBytes)} / ${formatBytes(usage.r2.metadataBytes)}</strong></div>
        <div class="resource-row"><div><b>Objects / Upload Count</b><small>latest storage snapshot</small></div><strong>${formatInt(usage.r2.objectCount)} / ${formatInt(usage.r2.uploadCount)}</strong></div>
        <div class="resource-row"><div><b>Storage Delta</b><small>first → latest Analytics sample</small></div><strong>${usage.r2.storageDeltaBytes == null ? "—" : formatBytes(usage.r2.storageDeltaBytes)} ${usage.r2.storageDeltaPercent == null ? "" : "(" + Number(usage.r2.storageDeltaPercent).toFixed(2) + "%)"}</strong></div>
        <div class="resource-row"><div><b>Object Delta</b><small>first → latest Analytics sample</small></div><strong>${usage.r2.objectDelta == null ? "—" : formatInt(usage.r2.objectDelta)}</strong></div>
        ${(usage.r2.buckets || []).map(b => `<div class="insight-query"><div class="insight-query-head"><span>${escapeHtml(b.bucketName || "(default)")}</span><span>${formatInt(b.operations)} ops</span></div><small>A ${formatInt(b.classAOperations)} · B ${formatInt(b.classBOperations)} · Free ${formatInt(b.freeOperations)} · Success ${formatInt(b.successfulOperations)} · Failed ${formatInt(b.failedOperations)}</small><small>Storage ${formatBytes(b.storageBytes)} · Objects ${formatInt(b.objectCount)} · Upload ${formatBytes(b.bytesUpload)} / Download ${formatBytes(b.bytesDownload)}</small></div>`).join("")}
        <details open><summary style="padding:12px 17px;font-size:11px;font-weight:800;cursor:pointer">全R2 Operation Group</summary>
          <div class="insight-list">${(usage.r2.operations || []).map(op => `<div class="insight-query"><div class="insight-query-head"><span>${escapeHtml(op.actionType)} · ${escapeHtml(op.actionStatus)}</span><span>${formatInt(op.requests)}</span></div><small>${escapeHtml(op.bucketName || "(default)")}</small></div>`).join("") || '<div class="resource-note">Operation dataなし</div>'}</div>
        </details>
      </div>
    </section>` : "";

  const d1QueryDetailSection = canViewDetailedUsage && usage.queryInsights?.available ? `
    <section class="section">
      <h2>D1 Query Insights 詳細</h2>
      <div class="card resource-card">
        <div class="resource-row"><div><b>Unique Query Groups</b><small>全取得件数</small></div><strong>${formatInt(usage.queryInsights.queryCount)}</strong></div>
        <details open><summary style="padding:12px 17px;font-size:11px;font-weight:800;cursor:pointer">全Query Groupを見る</summary>
          <div class="insight-list">${(usage.queryInsights.queries || []).map(q => `<div class="insight-query"><div class="insight-query-head"><span>${escapeHtml(q.category)}</span><span>${formatInt(q.count)} 回</span></div><small>Read ${formatInt(q.rowsRead)} · Written ${formatInt(q.rowsWritten)} · Returned ${formatInt(q.rowsReturned)} · Duration ${formatInt(q.durationMs)} ms</small><code>${escapeHtml(q.query)}</code></div>`).join("") || '<div class="resource-note">Query dataなし</div>'}</div>
        </details>
      </div>
    </section>` : "";

  const usageSection = canViewDetailedUsage && usage.configured && usage.status !== "UNKNOWN" && usage.limits
    ? `
      <section class="section">
        <h2>Cloudflare リソース監視</h2>
        <div class="card resource-card">
          <div class="resource-head"><div><b>${escapeHtml(monitoringLabel)}</b><small>${escapeHtml(usage.date || "—")} · Cloudflare Analytics API</small></div><span class="state ${usageLabel.tone}">${usageLabel.label}</span></div>
          ${canViewDetailedUsage ? `
          <div class="resource-row monitoring-switch-row">
            <div><b>監視プロファイル</b><small>監視基準だけを変更します。Cloudflareの契約・請求プランは変更しません。</small></div>
            <div class="monitoring-switch" role="group" aria-label="Cloudflare監視プロファイル">
              <button type="button" class="monitoring-switch-btn ${monitoringProfile === "FREE" ? "active" : ""}" data-monitoring-profile="FREE">🆓 Free枠</button>
              <button type="button" class="monitoring-switch-btn ${monitoringProfile === "PAID_5USD" ? "active" : ""}" data-monitoring-profile="PAID_5USD">💰 $5枠</button>
            </div>
          </div>
          <div class="resource-note" id="monitoring-profile-message">現在: <b>${escapeHtml(monitoringProfile === "PAID_5USD" ? "Workers Paid $5" : "Workers Free")}</b> · ${escapeHtml(monitoringProfileSetting.source === "DB" ? "保存済み設定" : "環境変数の既定値")}</div>
          ${monitoringProfile === "PAID_5USD" ? `<div class="resource-row"><div><b>請求サイクル</b><small>Cloudflare Billing APIのbilling_cycle_anchor_timestamp基準</small></div><strong class="${billingCycle?.available ? "good" : "warn"}">${escapeHtml(billingPeriodLabel)}</strong></div>` : `<div class="resource-note">${escapeHtml(billingPeriodLabel)}</div>`}
          ` : ""}
          ${monitoringProfile === "PAID_5USD" ? `<div class="resource-head"><div><b>${escapeHtml(monitoringBudgetLabel)}</b><small>請求サイクル内のD1 / Workers / R2各使用率の最大値。CPUはRequests × CPU P50の推定値</small></div><strong class="${cloudflareUsageLabel(monitoringBudgetState).tone}">${formatPercent(monitoringBudgetPercent)}</strong></div><div class="resource-note">この割合は「$5を使った割合」ではありません。CPU使用率が最大値になった場合は、Workersの月間CPU安全上限に対する推定値（CPU P50基準）です。</div>` : ""}
          ${monitoringProfile === "PAID_5USD" ? `<div class="resource-row"><div><b>推定月額</b><small>基本料金 + 現時点の超過推計 · USD ${monitoringEstimatedCostUsd == null ? "—" : Number(monitoringEstimatedCostUsd).toFixed(4)}</small></div><strong>${formatYen(monitoringEstimatedCostJpy)}</strong></div><div class="resource-row"><div><b>推定超過</b><small>D1 / Workersの現時点請求指標から算出 · USD ${monitoringEstimatedOverageUsd == null ? "—" : Number(monitoringEstimatedOverageUsd).toFixed(4)}</small></div><strong>${formatYen(monitoringEstimatedOverageJpy)}</strong></div><div class="resource-note">円換算: 1 USD = ${monitoringUsdJpyRate == null ? "—" : Number(monitoringUsdJpyRate).toFixed(2)} JPY（表示用）</div>` : ""}
          ${resourceRow("Rows Read", usage.account?.rowsRead, usage.limits?.d1?.rowsRead, usage.account?.rowsReadPercent, usage.account?.rowsReadState)}
          ${resourceRow("Rows Written", usage.account?.rowsWritten, usage.limits?.d1?.rowsWritten, usage.account?.rowsWrittenPercent, usage.account?.rowsWrittenState)}
          <div class="resource-row"><div><b>D1 Storage</b><small>${formatInt(usage.database?.databaseSizeBytes)} / ${formatInt(usage.limits?.d1?.storageBytes)} bytes</small></div><strong class="${cloudflareUsageLabel(usage.database?.storageState).tone}">${formatPercent(usage.database?.storagePercent)} · ${cloudflareUsageLabel(usage.database?.storageState).label}</strong></div>
          <div class="resource-head"><div><b>${monitoringProfile === "PAID_5USD" ? "Workers Paid $5 Included" : "Workers Free Tier"}</b><small>${escapeHtml(usage.workers?.scriptName || "kingshot-data-platform")} · ${monitoringProfile === "PAID_5USD" ? "請求サイクル内" : "当日UTC"}</small></div><span class="state ${usage.workers?.available ? cloudflareUsageLabel(usage.workers.requestsState).tone : "neutral"}">${usage.workers?.available ? cloudflareUsageLabel(usage.workers.requestsState).label : "未確認"}</span></div>
          ${usage.workers?.available ? resourceRow("Worker Requests", usage.workers.requests, usage.limits?.workers?.requestsPerMonth ?? usage.limits?.workers?.requestsPerDay, usage.workers.requestsPercent, usage.workers.requestsState) : ""}
          <div class="resource-head"><div><b>R2 ${monitoringProfile === "PAID_5USD" ? "Included" : "Free Tier"}</b><small>${monitoringProfile === "PAID_5USD" && usagePeriod?.basis === "CLOUDFLARE_BILLING_CYCLE" ? escapeHtml(formatPeriodDate(usagePeriod.start) + " ～ " + formatPeriodDate(usagePeriod.end) + " · 請求サイクル") : escapeHtml(usage.r2?.monthStart ? new Date(usage.r2.monthStart).toLocaleDateString("ja-JP") : "—") + "〜 · 月次"}</small></div><span class="state ${usage.r2?.available ? cloudflareUsageLabel(usage.r2.classAState).tone : "neutral"}">${usage.r2?.available ? cloudflareUsageLabel(usage.r2.classAState).label : "未確認"}</span></div>
          ${usage.r2?.available ? resourceRow("Class A Operations", usage.r2.classAOperations, usage.limits?.r2?.classAOperationsPerMonth, usage.r2.classAPercent, usage.r2.classAState) : ""}
          ${usage.r2?.available ? resourceRow("Class B Operations", usage.r2.classBOperations, usage.limits?.r2?.classBOperationsPerMonth, usage.r2.classBPercent, usage.r2.classBState) : ""}
          ${usage.r2?.available ? resourceRow("R2 Storage", usage.r2.storageBytes, usage.limits?.r2?.storageBytes, usage.r2.storagePercent, usage.r2.storageState) : ""}
          <div class="resource-note">${escapeHtml(usage.note || "Cloudflare Analyticsの集計値です。")}</div>
          ${monitoringProfile === "PAID_5USD" ? `<div class="resource-note">PAID_5USD はCloudflare Workers Paidの請求サイクル内込み枠を基準に、EagleEye側で90%を安全上限として監視します。無料へ戻す場合は <code>CLOUDFLARE_MONITORING_PROFILE=FREE</code> に切り替えて再デプロイすると、従来のFree監視へ戻せます。</div>` : `<div class="resource-note">現在はFree監視プロファイルです。Paid移行時は <code>CLOUDFLARE_MONITORING_PROFILE=PAID_5USD</code> に切り替えます。</div>`}
        </div>
      </section>
    `
    : `
      <section class="section">
        <h2>Cloudflare リソース監視</h2>
        <div class="card resource-card">
          <div class="resource-head"><div><b>Cloudflare Usage</b><small>詳細使用量は管理者向け</small></div><span class="state neutral">制限付き表示</span></div>
          <div class="resource-note">D1 / Workers / R2の詳細使用量とD1 Query InsightsはADMIN / OWNERのみ確認できます。</div>
        </div>
      </section>`;

  const queryInsights = usage.queryInsights?.available ? usage.queryInsights : null;
  const queryInsightCategories = (queryInsights?.categories || []).slice(0, 6);
  const queryInsightsSection = queryInsights ? `
    <section class="section">
      <h2>D1 Query Insights</h2>
      <div class="card resource-card">
        <div class="resource-head"><div><b>Database Query Insights</b><small>Cloudflare Analytics · 当日のクエリ集計</small></div><span class="state good">取得済み</span></div>
        <div class="resource-row"><div><b>クエリ種類</b><small>集計されたユニーククエリ</small></div><strong>${formatInt(queryInsights.queryCount)}</strong></div>
        ${queryInsightCategories.length ? `
          <div class="insight-list">
            ${queryInsightCategories.map(item => `
              <div class="insight-query">
                <div class="insight-query-head"><span>${escapeHtml(item.category)}</span><span>${formatInt(item.count)} 回</span></div>
                <small>Rows Read ${formatInt(item.rowsRead)} · Rows Written ${formatInt(item.rowsWritten)}</small>
              </div>
            `).join("")}
          </div>` : '<div class="resource-note">当日のクエリ集計はまだありません。</div>'}
        <div class="resource-note">公開ステータスではSQL本文を表示せず、カテゴリ別の集計のみ表示します。詳細なSQL調査は管理者向け診断画面で行います。</div>
      </div>
    </section>` : "";

  const diagnosticsDetailSection = canViewDetailedUsage ? `
    <section class="section">
      <h2>Diagnostics 詳細</h2>
      <div class="card resource-card">
        <div class="resource-head"><div><b>直近診断イベント</b><small>最大100件 · 最新→過去</small></div><span class="state good">${escapeHtml(data.overall)}</span></div>
        <div class="resource-row"><div><b>Healthy / Warning / Failed / Unknown</b><small>サービス集計</small></div><strong>${formatInt(data.counts.healthy)} / ${formatInt(data.counts.warning)} / ${formatInt(data.counts.failed)} / ${formatInt(data.counts.unknown)}</strong></div>
        <details open><summary style="padding:12px 17px;font-size:11px;font-weight:800;cursor:pointer">全診断イベント</summary>
          <div class="insight-list">${(data.events || []).map(e => `
            <div class="insight-query">
              <div class="insight-query-head"><span>${escapeHtml(e.service || e.feature || "unknown")} · ${escapeHtml(e.status || "UNKNOWN")}</span><span>${formatUnixStatus(e.created_at)}</span></div>
              <small>${escapeHtml(e.feature || "—")} / ${escapeHtml(e.operation || "—")} · ${escapeHtml(e.error_code || "—")}</small>
              <small>trace ${escapeHtml(e.trace_id || "—")} · ${escapeHtml(e.provider || "—")} · ${escapeHtml((e.target_type || "—") + " " + (e.target_id || ""))}</small>
              <small>elapsed ${e.elapsed_ms == null ? "—" : formatInt(e.elapsed_ms) + " ms"} · received ${e.rows_received == null ? "—" : formatInt(e.rows_received)} · saved ${e.rows_saved == null ? "—" : formatInt(e.rows_saved)}</small>
              <div style="margin-top:5px;font-size:10px;line-height:1.45;word-break:break-word">${escapeHtml(e.message || "メッセージなし")}</div>
            </div>`).join("") || '<div class="resource-note">診断イベントはありません。</div>'}</div>
        </details>
      </div>
    </section>` : "";

  const operationalSection = apiPoolSection + mightPulseSection + watchlistSection + databaseSection + r2Section + r2ObjectInventorySection + googleSection + runtimeSection + queryInsightsSection + runtimeConfigSection + workerDetailSection + r2DetailSection + d1QueryDetailSection + diagnosticsDetailSection;


  return eagleEyeHtmlResponse(`<!doctype html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="60"><title>システム状況 | EagleEye</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f5f7;color:#1d1d1f;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text",system-ui,sans-serif;-webkit-font-smoothing:antialiased}.wrap{max-width:760px;margin:auto;padding:20px 16px 45px}.nav{display:flex;justify-content:space-between;align-items:center;padding:3px 3px 20px}.back{color:#0071e3;text-decoration:none;font-size:14px;font-weight:600}.refresh{color:#86868b;font-size:11px}.hero{background:#fff;border:1px solid #d2d2d7;border-radius:27px;padding:28px;box-shadow:0 5px 20px rgba(0,0,0,.05)}.hero-line{display:flex;gap:15px;align-items:center}.icon{width:52px;height:52px;border-radius:50%;display:grid;place-items:center;font-size:23px;font-weight:800}.good{color:#1b8a3e}.warn{color:#b77900}.bad{color:#d70015}.neutral{color:#6e6e73}.icon.good{background:#e8f8ed}.icon.warn{background:#fff4d6}.icon.bad{background:#ffe9e7}.icon.neutral{background:#f2f2f7}.eyebrow{color:#86868b;font-size:11px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase}.title{margin:3px 0 0;font-size:27px;letter-spacing:-.03em}.desc{margin:19px 0 0;color:#6e6e73;line-height:1.6}.stats{display:grid;grid-template-columns:repeat(4,1fr);margin-top:22px;padding-top:18px;border-top:1px solid #e5e5ea}.stat{text-align:center;border-right:1px solid #e5e5ea}.stat:last-child{border:0}.stat b{display:block;font-size:21px}.stat span{color:#86868b;font-size:10px}.section{margin-top:26px}.section h2{font-size:19px;margin:0 5px 10px}.card{background:#fff;border:1px solid #d2d2d7;border-radius:21px;overflow:hidden;box-shadow:0 3px 14px rgba(0,0,0,.035)}.row{display:flex;align-items:center;gap:11px;padding:15px 17px;border-bottom:1px solid #e5e5ea}.row:last-child{border:0}.dot{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:#f2f2f7;font-size:12px;font-weight:800}.dot.good{background:#e8f8ed}.dot.warn{background:#fff4d6}.dot.bad{background:#ffe9e7}.name{flex:1;font-size:14px;font-weight:650}.state{font-size:11px;font-weight:700}.resource-card{padding:0}.resource-head,.resource-row{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:15px 17px;border-bottom:1px solid #e5e5ea}.resource-head small,.resource-row small{display:block;color:#86868b;font-size:10px;margin-top:3px}.resource-row strong{font-size:12px;text-align:right;white-space:nowrap}.resource-note{padding:12px 17px;color:#86868b;font-size:10px;line-height:1.5}.monitoring-switch{display:flex;gap:5px;padding:4px;background:#f2f2f7;border-radius:12px}.monitoring-switch-btn{border:0;border-radius:9px;padding:9px 10px;background:transparent;color:#6e6e73;font-size:11px;font-weight:800;white-space:nowrap;cursor:pointer}.monitoring-switch-btn.active{background:#fff;color:#1d1d1f;box-shadow:0 2px 8px rgba(0,0,0,.10)}.monitoring-switch-btn:disabled{opacity:.55;cursor:wait}.insight-list{border-top:1px solid #e5e5ea}.insight-query{padding:12px 17px;border-bottom:1px solid #e5e5ea}.insight-query:last-child{border:0}.insight-query-head{display:flex;justify-content:space-between;gap:10px;font-size:11px}.insight-query-head span{font-weight:800}.insight-query code{display:block;margin-top:7px;color:#4b5563;font-size:9px;line-height:1.45;word-break:break-word;white-space:pre-wrap}.insight-query small{display:block;margin-top:5px;color:#86868b;font-size:9px}.foot{margin:17px 4px;color:#86868b;font-size:11px;line-height:1.5}@media(max-width:600px){.hero{padding:22px 18px}.stats{grid-template-columns:repeat(2,1fr);gap:13px}.stat:nth-child(2){border:0}.stat:nth-child(-n+2){padding-bottom:10px;border-bottom:1px solid #e5e5ea}.resource-row{align-items:flex-start}}
</style></head><body><main class="wrap"><nav class="nav"><a class="back" href="/">‹ EagleEye</a><span class="refresh">60秒ごとに更新</span></nav><section class="hero"><div class="hero-line"><div class="icon ${state.tone}">${state.icon}</div><div><div class="eyebrow">EagleEye System Status</div><h1 class="title">${state.label}</h1></div></div><p class="desc">${state.desc}</p><div class="stats"><div class="stat"><b>${data.counts.healthy}</b><span>正常</span></div><div class="stat"><b>${data.counts.warning}</b><span>注意</span></div><div class="stat"><b>${data.counts.failed}</b><span>障害</span></div><div class="stat"><b>${data.counts.unknown}</b><span>未確認</span></div></div></section>${usageSection}${operationalSection}<section class="section" id="service-status"><h2>サービス状況</h2><div class="card">${rows}</div></section><p class="foot">Cloudflareリソース監視はD1とは独立したGraphQL Analytics APIを使用します。Analyticsの集計には遅延が発生する場合があります。</p>

${canViewDetailedUsage ? `<script>
(function(){
  // This script runs in the browser; server-side helpers are not in scope here.
  function escapeHtml(value){
    return String(value == null ? "" : value).replace(/[&<>"']/g,function(char){
      return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char];
    });
  }
  function formatBytes(value){
    var bytes=Number(value||0);
    if(!Number.isFinite(bytes)||bytes<1024)return Math.round(bytes).toLocaleString("ja-JP")+" B";
    var units=["KB","MB","GB","TB"],size=bytes,unit=-1;
    while(size>=1024&&unit<units.length-1){size/=1024;unit++;}
    return size.toFixed(size>=100?0:size>=10?1:2)+" "+units[unit];
  }
  document.querySelectorAll("[data-monitoring-profile]").forEach(function(btn){
    btn.addEventListener("click", async function(){
      var profile=btn.getAttribute("data-monitoring-profile");
      var buttons=Array.from(document.querySelectorAll("[data-monitoring-profile]"));
      buttons.forEach(function(b){b.disabled=true;});
      var msg=document.getElementById("monitoring-profile-message");
      if(msg) msg.textContent="監視プロファイルを切り替えています…";
      try{
        var res=await fetch("/api/admin/monitoring-profile",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({profile:profile}),credentials:"same-origin"});
        var data=await res.json().catch(function(){return {};});
        if(!res.ok||!data.ok) throw new Error(data.error||"切替に失敗しました");
        window.location.reload();
      }catch(error){
        if(msg) msg.textContent="切替失敗: "+(error.message||String(error));
        buttons.forEach(function(b){b.disabled=false;});
      }
    });
  });

  var button=document.getElementById("r2-object-check");
  var result=document.getElementById("r2-object-check-result");
  if(button&&result){
    button.addEventListener("click",async function(){
      button.disabled=true;
      button.textContent="確認中…";
      result.textContent="R2実オブジェクトを取得しています…";
      try{
        var res=await fetch("/api/admin/r2-archive-objects?limit=50",{cache:"no-store",credentials:"same-origin"});
        var data=await res.json().catch(function(){return {};});
        if(!res.ok||!data.ok)throw new Error(data.error||("HTTP "+res.status));
        var objects=data.objects||[];
        var prefixText=(data.prefixes||[]).map(function(p){return p.prefix+" "+p.listedCount+"件"+(p.truncated?"（続きあり）":"");}).join(" / ");
        var html="<div><b>確認時刻</b> "+new Date(data.checkedAt||Date.now()).toLocaleString("ja-JP")+" · <b>一覧取得</b> "+objects.length+"件</div>";
        html+="<div style='margin-top:5px'>"+prefixText+"</div>";
        if(objects.length){
          html+="<div class='insight-list' style='margin:10px -17px -12px'>";
          objects.forEach(function(o){
            html+="<div class='insight-query'><div class='insight-query-head'><span>"+escapeHtml(o.key)+"</span><span>"+formatBytes(o.size)+"</span></div><small>"+(o.uploaded?new Date(o.uploaded).toLocaleString("ja-JP"):"—")+" · ETag "+escapeHtml(o.etag||o.httpEtag||"—")+"</small></div>";
          });
          html+="</div>";
        }else{
          html+="<div style='margin-top:6px'><b>実オブジェクトなし</b></div>";
        }
        result.innerHTML=html;
      }catch(error){
        result.textContent="R2実オブジェクト確認失敗: "+(error.message||String(error));
      }finally{
        button.disabled=false;
        button.textContent="再確認";
      }
    });
  }
})();
</script>` : ""}
<style>@media print{body{background:#fff!important}.wrap{max-width:none;padding:8mm}.nav .back{display:none}.hero,.card{box-shadow:none!important;break-inside:avoid}.section{break-inside:avoid}.resource-row,.row{break-inside:avoid}.foot{font-size:9px}details>summary{display:none!important}details> :not(summary){display:block!important}}</style></main></body></html>`);
}


async function renderSupportPage(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") return `<!doctype html><html lang="ja"><body style="margin:0;background:#0f172a;color:#fff;font-family:system-ui;padding:28px"><div style="max-width:620px;margin:auto"><h1>お問い合わせ</h1><p style="color:#94a3b8">お問い合わせにはDiscordログインが必要です。</p><a href="/api/auth/discord" style="color:#f59e0b;font-weight:800">Discordでログイン</a></div></body></html>`;
  const supportCatalogJson = JSON.stringify(SUPPORT_CATALOG).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>お問い合わせ | EagleEye</title><style>
  *{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:680px;margin:auto;padding:22px 16px 45px}.nav{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}.nav a{color:#f59e0b;text-decoration:none;font-weight:800}.card{background:#111c30;border:1px solid #334155;border-radius:22px;padding:22px}h1{margin:0 0 8px;font-size:28px}p{color:#94a3b8;line-height:1.7}.choices{display:grid;gap:9px;margin-top:10px}.choice{width:100%;padding:14px;text-align:left;border:1px solid #334155;border-radius:13px;background:#0b1424;color:#f8fafc;font:inherit;cursor:pointer}.choice:hover{border-color:#f59e0b}.back{margin-top:10px;background:transparent;color:#94a3b8;border:0;padding:8px 0;cursor:pointer}.qa{margin-top:14px;padding:14px;border:1px solid #365314;border-radius:14px;background:#14210f;color:#d9f99d}.incident{margin-top:14px;padding:14px;border:1px solid #7f1d1d;border-radius:14px;background:#2a1114;color:#fecaca}.field{margin-top:14px}.field label{display:block;font-size:12px;font-weight:800;color:#cbd5e1;margin-bottom:7px}.field input,.field textarea{width:100%;border:1px solid #334155;border-radius:12px;background:#0b1424;color:#f8fafc;padding:12px;font:inherit;outline:none}.field textarea{min-height:100px;resize:vertical}.submit{width:100%;margin-top:18px;border:0;border-radius:13px;padding:14px;background:#f59e0b;color:#172033;font-weight:900;font-size:15px}.result{display:none;margin-top:18px;border-radius:14px;padding:14px;line-height:1.6;font-size:13px}.result.ok{display:block;background:#12301f;border:1px solid #245b3a;color:#bbf7d0}.result.error{display:block;background:#32171b;border:1px solid #6b2730;color:#fecaca}.ticket{font-size:18px;font-weight:900;margin-bottom:6px}.muted{font-size:12px;color:#94a3b8}
  </style></head><body><main class="wrap"><nav class="nav"><a href="/">‹ EagleEye</a><span style="color:#64748b;font-size:11px">Discord Support</span></nav><section class="card"><h1>お問い合わせ</h1><p>カテゴリを選択すると、既知の解決方法や現在の障害状況を確認できます。解決しない場合だけ問い合わせへ進みます。</p><div id="incident"></div><div id="wizard"></div><div id="result" class="result"></div></section></main><script>
(function(){var catalog=${supportCatalogJson},params=new URLSearchParams(location.search),state={category:(params.get("category")||"").toUpperCase()||null,subcategory:(params.get("subcategory")||"").toUpperCase()||null,child:null,incident:null,governorId:(params.get("governor_id")||"").trim()};var wizard=document.getElementById("wizard"),incident=document.getElementById("incident"),result=document.getElementById("result");
function esc(v){return String(v==null?"":v).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
function render1(){wizard.innerHTML="<strong>1. 何について困っていますか？</strong><div class='choices'>"+catalog.map(function(x){return "<button class='choice' data-c='"+esc(x.key)+"'>"+esc(x.label)+"</button>";}).join("")+"</div>";wizard.querySelectorAll("[data-c]").forEach(function(b){b.onclick=function(){state.category=b.dataset.c;render2();};});}
function render2(){var p=catalog.find(function(x){return x.key===state.category;});wizard.innerHTML="<strong>2. 具体的には？</strong><div class='choices'>"+p.children.map(function(x){return "<button class='choice' data-s='"+esc(x.key)+"'>"+esc(x.label)+"</button>";}).join("")+"</div><button class='back' id='back1'>← カテゴリを戻す</button>";wizard.querySelectorAll("[data-s]").forEach(function(b){b.onclick=function(){state.subcategory=b.dataset.s;state.child=p.children.find(function(x){return x.key===state.subcategory;});render3();};});document.getElementById("back1").onclick=render1;}
function render3(){var p=catalog.find(function(x){return x.key===state.category}),c=p.children.find(function(x){return x.key===state.subcategory}),html="<strong>3. 確認</strong><div class='muted' style='margin-top:7px'>"+esc(p.label)+" → "+esc(c.label)+"</div>";if(c.qa)html+="<div class='qa'><b>まずはこちらをご確認ください</b><div style='margin-top:6px'>"+esc(c.qa)+"</div><button class='choice' id='qyes' style='margin-top:10px'>解決した</button><button class='choice' id='qno' style='margin-top:8px'>解決しなかった</button></div>";html+="<div id='intake' style='"+(c.qa?"display:none":"")+"'><div class='field'><label>件名</label><input id='subject' maxlength='120' placeholder='例：データが表示されない'></div>";var labels={governor_id:"領主ID",kid:"王国番号",field:"問題の項目",displayed_value:"EagleEyeの表示値",expected_value:"正しいと思う値",target:"対象・画面",board:"ランキングボード",message:"状況の補足"};(c.fields||[]).forEach(function(f){html+="<div class='field'><label>"+labels[f]+"</label><input data-d='"+f+"' maxlength='1000' value='"+(f==="governor_id"?esc(state.governorId):"")+"'></div>";});html+="<div class='field'><label>補足（任意）</label><textarea id='message' maxlength='4000' placeholder='必要な場合だけ補足してください'></textarea></div><button id='submit' class='submit'>問い合わせを送信</button></div><button class='back' id='back2'>← 症状を戻す</button>";wizard.innerHTML=html;var y=document.getElementById("qyes"),n=document.getElementById("qno");if(y)y.onclick=function(){wizard.innerHTML="<strong>解決しました。</strong><p class='muted'>お問い合わせは不要です。</p>";};if(n)n.onclick=function(){document.getElementById("intake").style.display="block";};document.getElementById("back2").onclick=render2;document.getElementById("submit").onclick=submit;}
async function submit(){var b=document.getElementById("submit");b.disabled=true;b.textContent="送信中…";var c=state.child,details={};(c.fields||[]).forEach(function(f){var e=document.querySelector("[data-d='"+f+"']");if(e&&e.value.trim())details[f]=e.value.trim();});var subject=(document.getElementById("subject").value.trim()||catalog.find(function(x){return x.key===state.category;}).label+" / "+c.label);var message=document.getElementById("message").value.trim();try{var r=await fetch("/api/support",{method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify({category:state.category,subcategory:state.subcategory,subject:subject,message:message,details:details,qna_id:c.qa?state.category+"_"+state.subcategory:null})});var d=await r.json().catch(function(){return {}});if(!r.ok||!d.ok)throw new Error(d.error||("HTTP "+r.status));result.className="result ok";result.innerHTML="<div class='ticket'>"+esc(d.ticketId)+"</div><div>お問い合わせを受け付けました。Discordに専用の非公開チャンネルを作成しました。</div>"+(d.channelUrl?"<div style='margin-top:8px'><a href='"+esc(d.channelUrl)+"' target='_blank' rel='noopener'>Discordの問い合わせチャンネルを開く →</a></div>":"");wizard.innerHTML="<strong>送信完了</strong><p class='muted'>必要な情報はサポート担当者に引き継がれています。</p>";}catch(e){result.className="result error";result.textContent="送信できませんでした: "+(e.message||String(e));b.disabled=false;b.textContent="問い合わせを送信";}}
function renderInitial(){var p=catalog.find(function(x){return x.key===state.category;}),ch=p&&p.children.find(function(x){return x.key===state.subcategory;});if(p&&ch){state.child=ch;render3();}else{render1();}}async function boot(){renderInitial();try{var r=await fetch("/api/support/context",{credentials:"same-origin",cache:"no-store"});var d=await r.json();if(!r.ok||!d.ok)throw new Error("context");state.incident=d.incident;if(state.incident&&state.incident.active){var incidentService={api_pool:"API Pool",mightpulse:"MightPulse API",ranking:"ランキング取得",player:"プレイヤー取得",watchlist:"王国ウォッチリスト",d1:"D1 Database",discord:"Discord認証",discord_support:"Discord Support",google_sheets:"Google Sheets",notifications:"通知システム"}[state.incident.service]||state.incident.service;var incidentStatus=state.incident.status==="FAILED"?"障害":"注意";var incidentTitle=state.incident.status==="FAILED"?"現在、EagleEyeで障害を検知しています":"現在、EagleEyeで注意状態を検知しています";incident.innerHTML="<div class='incident'><b>⚠ "+incidentTitle+"</b><div style='margin-top:6px'>"+esc(incidentService)+" / "+incidentStatus+"</div><div style='margin-top:6px'>同じ症状に関する問い合わせは、まず障害情報をご確認ください。</div><div style='margin-top:10px'><a href='\/status#service-status' style='color:#fecaca;font-weight:900;text-decoration:underline'>障害情報を確認する →</a></div></div>";}}catch(e){}}
boot();})();</script></body></html>`;
}

async function renderHome(request, env) {
  const configured = Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.EAGLEEYE_SESSION_SECRET);
  const token = parseCookie(request.headers.get("Cookie") || "")[SESSION_COOKIE];
  const session = configured && token ? await verifyPayload(token, env.EAGLEEYE_SESSION_SECRET) : null;
  const auth = session ? await getAuthenticatedUser(request, env) : null;
  // Only an ACTIVE database-backed user may receive role-gated drawer links.
  const menuAuth = auth?.status === "ACTIVE" ? auth : (session ? { role: "BASIC" } : null);
  const role = menuAuth?.role || "BASIC";
  const roleLabel = role === "OWNER" ? "OWNER" : role === "ADMIN" ? "ADMIN" : role === "VIP" ? "VIP" : role === "ADVANCED" ? "ADVANCED" : "BASIC";
  const userName = escapeHtml(session?.global_name || session?.username || "ゲスト");
  const avatar = session?.avatar
    ? `<img src="https://cdn.discordapp.com/avatars/${encodeURIComponent(session.sub)}/${encodeURIComponent(session.avatar)}.png?size=96" alt="">`
    : "<span>BJ</span>";
  const loginBlock = session
    ? `<a class="ee-profile" href="/my-player" aria-label="マイKingshotを開く"><span class="ee-avatar">${avatar}</span><span class="ee-profile-copy"><b>${userName}</b><small>${roleLabel}</small></span></a>`
    : `<a class="ee-profile ee-login-trigger" href="/api/auth/discord" aria-label="Discordでログイン"><span class="ee-avatar">BJ</span><span class="ee-profile-copy"><b class="ee-login-label">ログイン</b><small class="ee-login-state">未ログイン</small></span><span class="ee-login-spinner" aria-hidden="true"></span></a>`;
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#06101d"><title>EagleEye</title><style>
:root{color-scheme:dark;--bg:#050b14;--panel:#0a1728;--panel2:#0d2035;--line:#23415f;--text:#eff8ff;--sub:#8098b0;--cyan:#20d7f2;--blue:#4ea9ff;--gold:#f6c84b;--green:#49e69a}
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}body{background:radial-gradient(circle at 50% 8%,rgba(34,211,238,.08),transparent 30%),linear-gradient(180deg,#06101d,#030811 75%);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a,button{touch-action:manipulation}a{color:inherit;text-decoration:none}
.ee-app{height:100dvh;min-height:0;display:grid;grid-template-rows:60px minmax(0,1fr) 72px;overflow:hidden}.ee-top{display:flex;align-items:center;justify-content:space-between;padding:0 max(18px,calc((100vw - 1100px)/2));border-bottom:1px solid rgba(35,65,95,.7);background:rgba(4,10,18,.86);backdrop-filter:blur(18px);z-index:10}.ee-brand{font-weight:950;letter-spacing:.09em;font-size:16px}.ee-brand span{color:var(--cyan)}.ee-brand b{color:#7189a2;font-size:11px;margin-left:7px}.ee-profile{display:flex;align-items:center;gap:8px}.ee-avatar{width:35px;height:35px;border:1px solid #31516f;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:#0b1c2e;color:var(--gold);font-weight:950;font-size:10px}.ee-avatar img{width:100%;height:100%;object-fit:cover}.ee-profile-copy{display:grid;line-height:1.05}.ee-profile-copy b{font-size:13px}.ee-profile-copy small{margin-top:4px;color:var(--gold);font-size:10px;font-weight:900;letter-spacing:.08em}
.ee-main{min-height:0;overflow:hidden;overscroll-behavior:none;padding:20px 14px 10px}.ee-screen{width:min(920px,100%);margin:auto}.ee-welcome{position:relative;min-height:116px;display:flex;align-items:center;overflow:hidden;padding:15px 18px;border:1px solid rgba(44,93,137,.8);border-radius:20px;background:radial-gradient(circle at 75% 50%,rgba(34,211,238,.25),transparent 35%),linear-gradient(135deg,#0c2945,#071525 72%);box-shadow:0 14px 40px rgba(0,0,0,.24)}.ee-welcome-copy{position:relative;z-index:2;max-width:58%}.ee-kicker{font-size:10px;letter-spacing:.16em;color:var(--cyan);font-weight:950}.ee-welcome h1{margin:5px 0 2px;font-size:22px;letter-spacing:-.04em}.ee-welcome p{margin:0;color:#a1b7ca;font-size:11px;line-height:1.5}.ee-welcome-state{display:inline-flex;margin-top:8px;align-items:center;gap:5px;color:#8ff0ba;font-size:10px;font-weight:900}.ee-welcome-state i{width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 12px rgba(73,230,154,.8)}.ee-welcome-bj{position:absolute;right:4%;bottom:-18px;width:150px;height:150px;object-fit:contain;filter:drop-shadow(0 14px 18px rgba(0,0,0,.5));animation:heroIn .85s cubic-bezier(.2,.8,.2,1) both}.ee-menu-title{display:flex;align-items:end;justify-content:space-between;margin:14px 3px 7px}.ee-menu-title b{font-size:15px;letter-spacing:.08em}.ee-menu-title span{font-size:10px;color:#6f879e}
.ee-mainmenu{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.ee-tile{position:relative;min-height:96px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border:1px solid rgba(39,75,108,.85);border-radius:16px;background:linear-gradient(180deg,rgba(12,34,55,.94),rgba(7,20,34,.96));box-shadow:inset 0 1px rgba(255,255,255,.03);transition:transform .16s,border-color .16s,box-shadow .16s}.ee-tile:active{transform:scale(.97)}.ee-tile.primary{border-color:rgba(34,211,238,.42)}.ee-tile img{width:48px;height:48px;object-fit:contain;filter:drop-shadow(0 6px 10px rgba(0,0,0,.38))}.ee-tile strong{font-size:13px;font-weight:950}.ee-tile small{font-size:9px;color:#718aa2;font-weight:800}.ee-tile .badge{position:absolute;right:7px;top:7px;min-width:20px;height:20px;padding:0 5px;display:grid;place-items:center;border-radius:999px;background:var(--cyan);color:#04111c;font-size:10px;font-weight:950}
.ee-summary{display:grid;grid-template-columns:repeat(2,1fr);gap:7px;margin-top:14px}.ee-stat{min-height:58px;padding:9px 11px;border:1px solid rgba(35,65,95,.82);border-radius:14px;background:rgba(8,21,35,.84)}.ee-stat-label{font-size:9px;color:#7089a1;font-weight:900;letter-spacing:.1em}.ee-stat-value{margin-top:4px;font-size:18px;font-weight:950}.ee-stat-value em{font-style:normal;color:var(--cyan)}.ee-stat-sub{margin-top:2px;color:#5f7891;font-size:9px}
.ee-more{width:100%;margin-top:9px;border:1px solid rgba(44,78,109,.85);border-radius:15px;background:rgba(9,23,39,.92);color:var(--text);text-align:left;padding:11px 13px;display:flex;align-items:center;justify-content:space-between;cursor:pointer}.ee-more-copy{display:flex;align-items:center;gap:10px}.ee-more img{width:34px;height:34px;object-fit:contain}.ee-more strong{display:block;font-size:12px}.ee-more small{display:block;color:#7089a1;font-size:9px;margin-top:2px}.ee-more b{color:#6e8ba5;font-size:16px}
.ee-drawer{position:fixed;inset:0;z-index:30;display:none;align-items:flex-end;background:rgba(0,0,0,.55);backdrop-filter:blur(5px);padding-top:env(safe-area-inset-top)}.ee-drawer.open{display:flex}.ee-drawer-panel{box-sizing:border-box;width:min(920px,100%);max-height:calc(100dvh - env(safe-area-inset-top) - 12px);overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;margin:auto auto 0;padding:14px 14px calc(18px + env(safe-area-inset-bottom));border:1px solid rgba(50,92,129,.9);border-bottom:0;border-radius:24px 24px 0 0;background:linear-gradient(180deg,#0c2035,#06111e);box-shadow:0 -20px 70px rgba(0,0,0,.55);animation:drawerIn .25s ease-out both}.ee-drawer-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.ee-drawer-head b{font-size:14px;letter-spacing:.1em}.ee-close{border:0;background:transparent;color:#8ba2b8;font-size:23px;padding:3px 7px}.ee-drawer-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.ee-drawer-grid a{min-height:66px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border:1px solid rgba(43,78,110,.65);border-radius:12px;background:rgba(8,22,37,.82)}.ee-drawer-grid img{width:31px;height:31px;object-fit:contain}.ee-drawer-grid span{font-size:10px;font-weight:900}.ee-drawer-grid a.owner{border-color:rgba(246,200,75,.5)}.ee-drawer-grid a.owner span{color:var(--gold)}
.ee-nav{display:grid;grid-template-columns:repeat(5,1fr);height:100%;padding:6px max(10px,calc((100vw - 760px)/2));padding-bottom:max(6px,env(safe-area-inset-bottom));gap:4px;border-top:1px solid rgba(35,65,95,.8);background:rgba(4,10,18,.95);backdrop-filter:blur(20px);z-index:20}.ee-nav a,.ee-nav button{position:relative;border:0;background:transparent;display:grid;place-items:center;align-content:center;gap:4px;border-radius:12px;color:#617a93;font-size:10px;font-weight:900;letter-spacing:.03em}.ee-nav-icon{font-size:23px;line-height:1.05;display:block;transform:scale(1.08);transform-origin:center}.ee-nav a.active{color:var(--cyan);background:rgba(34,211,238,.08)}.ee-nav a.active:before{content:"";position:absolute;top:0;left:27%;right:27%;height:2px;border-radius:2px;background:var(--cyan);box-shadow:0 0 12px rgba(34,211,238,.7)}.ee-nav-badge{position:absolute;top:5px;margin-left:24px;min-width:17px;height:17px;padding:0 4px;border-radius:99px;background:#ef4444;color:#fff;font-size:9px;display:grid;place-items:center}
@keyframes heroIn{from{opacity:0;transform:translate(35px,15px) scale(.8)}to{opacity:1;transform:translate(0,0) scale(1)}}@keyframes drawerIn{from{opacity:0;transform:translateY(35px)}to{opacity:1;transform:none}}
@media(min-width:760px){.ee-main{padding:18px 24px 24px}.ee-welcome{min-height:150px;padding:22px 24px}.ee-welcome h1{font-size:28px}.ee-welcome-bj{width:205px;height:205px;right:7%;bottom:-28px}.ee-mainmenu{gap:9px}.ee-tile{min-height:128px}.ee-tile img{width:62px;height:62px}.ee-tile strong{font-size:13px}.ee-summary{grid-template-columns:repeat(4,1fr)}}@media(max-width:520px){.ee-welcome{min-height:108px}.ee-welcome-copy{max-width:62%}.ee-welcome h1{font-size:20px}.ee-welcome-bj{width:150px;height:150px;right:-4%;bottom:-13px}.ee-mainmenu{gap:6px}.ee-tile{min-height:91px;border-radius:14px}.ee-tile img{width:43px;height:43px}.ee-tile strong{font-size:12px}.ee-summary{gap:6px}.ee-stat{min-height:55px;padding:8px 9px}.ee-stat-value{font-size:16px}.ee-drawer-grid{grid-template-columns:repeat(3,1fr)}}@media(max-height:700px){.ee-main{padding-top:8px}.ee-welcome{min-height:96px}.ee-welcome-bj{width:112px;height:112px}.ee-tile{min-height:80px}.ee-tile img{width:38px;height:38px}.ee-summary{margin-top:9px}.ee-stat{min-height:48px;padding:7px 8px}.ee-more{margin-top:7px;padding:8px 11px}}
/* Home UI refresh v1 */
.ee-welcome-link{display:block;color:inherit;text-decoration:none;border-radius:22px;outline-offset:4px}.ee-welcome-link:active .ee-welcome{filter:brightness(1.14);transform:scale(.995)}.ee-welcome{transition:filter .16s,transform .16s;cursor:pointer}.ee-welcome-link:focus-visible{outline:2px solid var(--cyan)}
.ee-login-trigger{position:relative;min-width:105px;justify-content:center}.ee-login-trigger[aria-busy="true"]{opacity:.92;pointer-events:none;border-color:rgba(32,215,242,.7)}.ee-login-trigger[aria-busy="true"] .ee-login-label{color:var(--cyan)}.ee-login-spinner{display:none;width:13px;height:13px;border:2px solid rgba(32,215,242,.25);border-top-color:var(--cyan);border-radius:50%;animation:eeLoginSpin .75s linear infinite}.ee-login-trigger[aria-busy="true"] .ee-login-spinner{display:block}.ee-login-trigger[aria-busy="true"] .ee-profile-copy small{color:#9dddeb}.ee-drawer-grid a.logout{border-color:rgba(248,113,113,.42)}.ee-drawer-grid a.logout span{color:#fca5a5}@keyframes eeLoginSpin{to{transform:rotate(360deg)}}
.ee-app{grid-template-rows:60px minmax(0,1fr) 72px}.ee-top{padding-left:max(18px,calc((100vw - 1040px)/2));padding-right:max(18px,calc((100vw - 1040px)/2));background:rgba(3,9,17,.94)}
.ee-brand{font-size:15px;letter-spacing:.13em}.ee-brand b{font-size:9px;letter-spacing:.12em;color:#718aa2}.ee-profile{padding:5px 9px 5px 5px;border:1px solid rgba(49,81,111,.62);border-radius:999px;background:rgba(11,28,46,.72)}.ee-profile-copy b{font-size:11px}.ee-profile-copy small{font-size:8px;color:var(--cyan);letter-spacing:.04em}
.ee-main{padding:14px 14px 22px;overscroll-behavior:contain}.ee-screen{width:min(860px,100%)}
.ee-welcome{min-height:148px;padding:20px;border-radius:22px;border-color:rgba(32,215,242,.34);background:radial-gradient(ellipse at 85% 40%,rgba(32,215,242,.18),transparent 38%),linear-gradient(135deg,#0b2944 0%,#08192b 55%,#061321 100%);box-shadow:0 14px 36px rgba(0,0,0,.18),inset 0 1px rgba(255,255,255,.04)}
.ee-welcome-copy{max-width:66%}.ee-welcome-copy:before{content:"KINGSHOT INTELLIGENCE";display:block;margin-bottom:8px;color:#66e7f6;font-size:9px;font-weight:950;letter-spacing:.18em}.ee-welcome-copy:after{content:"王国とプレイヤーの動きを、ひと目で。";display:block;margin-top:7px;color:#9db4c8;font-size:11px;line-height:1.65}
.ee-welcome-state{margin-top:0;padding:5px 8px;border:1px solid rgba(73,230,154,.22);border-radius:999px;background:rgba(73,230,154,.06);font-size:9px}.ee-welcome-bj{right:3%;bottom:-10px;width:158px;height:158px}
.ee-menu-title{margin:20px 3px 10px;align-items:center}.ee-menu-title b{font-size:13px;letter-spacing:.04em}.ee-menu-title span{font-size:9px}.ee-mainmenu{gap:9px}
.ee-tile{min-height:112px;padding:10px 5px;border-radius:17px;background:linear-gradient(155deg,rgba(13,34,54,.98),rgba(6,18,31,.98));border-color:rgba(43,77,107,.68);transition:transform .16s,border-color .16s,background .16s}.ee-tile.primary{border-color:rgba(32,215,242,.5);background:linear-gradient(155deg,rgba(10,45,65,.98),rgba(6,20,34,.98))}.ee-tile:active{transform:scale(.965);background:#102b43}.ee-tile img{width:48px;height:48px}.ee-tile strong{font-size:11px}.ee-tile small{font-size:8px;color:#89a1b8}.ee-tile .badge{right:8px;top:8px;min-width:18px;height:18px;box-shadow:0 0 15px rgba(32,215,242,.18)}
.ee-summary{gap:8px;margin-top:17px}.ee-stat{padding:11px 12px;border-radius:15px;background:linear-gradient(150deg,rgba(10,25,41,.95),rgba(6,16,28,.95));border-color:rgba(35,65,95,.62)}.ee-stat-label{font-size:8px;letter-spacing:.08em}.ee-stat-value{font-size:17px}.ee-stat-sub{font-size:8px;color:#7892aa}.ee-more{display:none}
.ee-milestone-card{width:100%;display:flex;align-items:center;gap:12px;margin-top:12px;padding:13px 15px;text-align:left;border:1px solid rgba(246,200,75,.25);border-radius:16px;background:linear-gradient(110deg,rgba(48,39,18,.52),rgba(8,22,37,.92));color:#e7edf5;opacity:.78;cursor:not-allowed}
.ee-milestone-icon{display:grid;place-items:center;flex:0 0 40px;width:40px;height:40px;border:1px solid rgba(246,200,75,.35);border-radius:12px;color:#f6c84b;font-size:24px}
.ee-milestone-copy{display:flex;flex:1;min-width:0;flex-direction:column;gap:4px}.ee-milestone-copy strong{font-size:12px;font-weight:950}.ee-milestone-copy small{font-size:9px;color:#8da2b8}.ee-milestone-status{flex:0 0 auto;padding:6px 8px;border:1px solid rgba(246,200,75,.24);border-radius:999px;color:#f6d98b;font-size:9px;font-weight:900;white-space:nowrap}
.ee-drawer-grid button.ee-drawer-milestone{min-height:82px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:7px;border:1px solid rgba(246,200,75,.22);border-radius:15px;background:linear-gradient(150deg,rgba(13,34,54,.7),rgba(6,17,29,.7));color:#8da2b8;opacity:.65;cursor:not-allowed}
.ee-drawer-milestone-icon{color:#f6c84b;font-size:23px}.ee-drawer-grid .ee-drawer-milestone span{font-size:9px;font-weight:900}.ee-drawer-grid .ee-drawer-milestone small{display:block;margin-top:3px;color:#d0b66e;font-size:8px}
.ee-nav{padding-top:7px;gap:5px;background:rgba(3,9,17,.97);padding-bottom:max(7px,env(safe-area-inset-bottom))}.ee-nav a,.ee-nav button{min-height:49px;font-size:8px;border-radius:13px;gap:4px}.ee-nav-icon{font-size:20px}.ee-nav a.active{background:linear-gradient(180deg,rgba(32,215,242,.11),rgba(32,215,242,.025))}
.ee-drawer{z-index:1000;align-items:flex-end;padding-top:env(safe-area-inset-top)}.ee-drawer-panel{box-sizing:border-box;position:relative;flex:0 1 auto;min-height:0;width:min(920px,100%);height:min(82vh,calc(100vh - env(safe-area-inset-top) - 12px));height:min(82dvh,calc(100dvh - env(safe-area-inset-top) - 12px));max-height:calc(100vh - env(safe-area-inset-top) - 12px);max-height:calc(100dvh - env(safe-area-inset-top) - 12px);overflow-x:hidden;overflow-y:scroll;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y;padding:16px 16px calc(22px + env(safe-area-inset-bottom));border-radius:25px 25px 0 0;background:linear-gradient(180deg,#0d2339,#050e19)}.ee-drawer-head{position:sticky;top:-16px;z-index:3;display:flex;align-items:center;justify-content:space-between;margin:-16px -16px 14px;padding:16px;background:linear-gradient(180deg,#0d2339,#0d2339);border-radius:25px 25px 0 0}.ee-drawer-head b{font-size:14px;letter-spacing:.03em}.ee-close{flex-shrink:0;width:36px;height:36px;border:1px solid rgba(80,115,145,.4);border-radius:50%;background:rgba(255,255,255,.04)}.ee-drawer-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.ee-drawer-grid a{min-height:82px;border-radius:15px;background:linear-gradient(150deg,rgba(13,34,54,.96),rgba(6,17,29,.96));border-color:rgba(43,78,110,.7)}.ee-drawer-grid img{width:37px;height:37px}.ee-drawer-grid span{font-size:9px}
@media(min-width:760px){.ee-welcome{min-height:172px;padding:26px}.ee-welcome-bj{width:205px;height:205px;right:7%;bottom:-24px}.ee-tile{min-height:132px}.ee-tile img{width:58px;height:58px}.ee-summary{grid-template-columns:repeat(4,1fr)}}
@media(max-width:520px){.ee-main{padding:12px 12px 18px}.ee-welcome{min-height:132px;padding:16px}.ee-welcome-copy{max-width:68%}.ee-welcome-copy:before{font-size:8px;letter-spacing:.13em}.ee-welcome-copy:after{font-size:10px;max-width:205px}.ee-welcome-bj{width:137px;height:137px;right:-2%;bottom:-8px}.ee-menu-title{margin-top:17px}.ee-mainmenu{gap:7px}.ee-tile{min-height:101px;padding:8px 3px}.ee-tile img{width:42px;height:42px}.ee-tile strong{font-size:10px}.ee-tile small{font-size:7px}.ee-summary{margin-top:13px}.ee-stat{padding:9px 10px}.ee-stat-value{font-size:15px}.ee-nav{padding-left:8px;padding-right:8px}.ee-nav-icon{font-size:19px}}
@media(max-height:700px){.ee-welcome{min-height:112px}.ee-welcome-bj{width:118px;height:118px}.ee-welcome-copy:after{margin-top:4px}.ee-tile{min-height:86px}.ee-tile img{width:36px;height:36px}.ee-summary{margin-top:10px}}
/* Home is a strict no-scroll surface. Compact vertically as the usable viewport shrinks. */
@media(max-width:520px) and (max-height:820px){
  .ee-main{padding:6px 10px 6px}
  .ee-welcome{min-height:100px;padding:10px}
  .ee-welcome-bj{width:108px;height:108px;right:0;bottom:-6px}
  .ee-welcome-copy:before{margin-bottom:3px;font-size:7px}
  .ee-welcome-copy:after{margin-top:3px;font-size:8px;line-height:1.35}
  .ee-welcome-state{padding:3px 6px;font-size:7px}
  .ee-menu-title{margin:8px 3px 5px}
  .ee-mainmenu{gap:5px}
  .ee-tile{min-height:72px;padding:4px 2px;border-radius:12px}
  .ee-tile img{width:29px;height:29px}
  .ee-tile strong{font-size:8px}
  .ee-tile small{font-size:6px}
  .ee-summary{gap:5px;margin-top:6px}
  .ee-stat{min-height:45px;padding:5px 7px;border-radius:11px}
  .ee-stat-label{font-size:6px}
  .ee-stat-value{margin-top:1px;font-size:12px}
  .ee-stat-sub{font-size:6px}
  .ee-milestone-card{gap:7px;margin-top:6px;padding:6px 8px;border-radius:12px}
  .ee-milestone-icon{flex-basis:28px;width:28px;height:28px;font-size:17px}
  .ee-milestone-copy{gap:2px}.ee-milestone-copy strong{font-size:9px}.ee-milestone-copy small{font-size:7px}
  .ee-milestone-status{padding:4px 6px;font-size:7px}
  .ee-nav{padding-top:4px;gap:3px}
  .ee-nav a,.ee-nav button{min-height:42px;font-size:7px;gap:2px}
  .ee-nav-icon{font-size:17px}
}
@media(max-width:520px) and (max-height:680px){
  .ee-app{grid-template-rows:48px minmax(0,1fr) 54px}
  .ee-top{padding-left:10px;padding-right:10px}
  .ee-brand{font-size:12px}.ee-brand b{font-size:8px}
  .ee-profile{padding:3px 6px 3px 3px}.ee-avatar{width:28px;height:28px}
  .ee-main{padding:4px 8px}
  .ee-welcome{min-height:80px;padding:7px}
  .ee-welcome-bj{width:82px;height:82px;right:0;bottom:-5px}
  .ee-welcome-copy:before{font-size:6px;letter-spacing:.1em}
  .ee-welcome-copy:after{font-size:7px}
  .ee-menu-title{margin:5px 2px 3px}.ee-menu-title b{font-size:10px}.ee-menu-title span{font-size:7px}
  .ee-mainmenu{gap:4px}
  .ee-tile{min-height:58px;padding:3px 1px}.ee-tile img{width:23px;height:23px}.ee-tile strong{font-size:7px}.ee-tile small{font-size:5px}
  .ee-summary{gap:4px;margin-top:4px}.ee-stat{min-height:36px;padding:4px 5px}.ee-stat-label,.ee-stat-sub{font-size:5px}.ee-stat-value{font-size:10px}
  .ee-milestone-card{margin-top:4px;padding:4px 6px}.ee-milestone-icon{flex-basis:22px;width:22px;height:22px;font-size:14px}.ee-milestone-copy strong{font-size:8px}.ee-milestone-copy small,.ee-milestone-status{font-size:6px}
  .ee-nav{padding:2px 5px; padding-bottom:max(2px,env(safe-area-inset-bottom));}
  .ee-nav a,.ee-nav button{min-height:35px;font-size:6px}.ee-nav-icon{font-size:14px}
}
/* Compact home layout for common iPhone viewport heights: keep the milestone card above the fixed bottom navigation */
@media(max-width:520px) and (min-height:701px) and (max-height:900px){
  .ee-main{padding:8px 12px 10px}
  .ee-welcome{min-height:112px;padding:12px}
  .ee-welcome-bj{width:120px;height:120px;right:-1%;bottom:-7px}
  .ee-welcome-copy:before{margin-bottom:5px;font-size:7px}
  .ee-welcome-copy:after{margin-top:4px;font-size:9px}
  .ee-welcome-state{padding:4px 7px;font-size:8px}
  .ee-menu-title{margin:11px 3px 7px}
  .ee-mainmenu{gap:6px}
  .ee-tile{min-height:83px;padding:6px 3px;border-radius:14px}
  .ee-tile img{width:34px;height:34px}
  .ee-tile strong{font-size:9px}
  .ee-tile small{font-size:7px}
  .ee-summary{gap:6px;margin-top:9px}
  .ee-stat{min-height:54px;padding:7px 9px;border-radius:13px}
  .ee-stat-label{font-size:7px}
  .ee-stat-value{margin-top:2px;font-size:14px}
  .ee-stat-sub{font-size:7px}
  .ee-milestone-card{gap:9px;margin-top:8px;padding:8px 10px;border-radius:14px}
  .ee-milestone-icon{flex-basis:32px;width:32px;height:32px;font-size:20px}
  .ee-milestone-copy strong{font-size:10px}
  .ee-milestone-copy small{font-size:8px}
  .ee-milestone-status{padding:5px 7px;font-size:8px}
}

/* Home mobile readability override v2 */
@media(max-width:600px){
.ee-brand{font-size:19px}
.ee-brand b{font-size:13px}
.ee-profile-copy b{font-size:16px}
.ee-profile-copy small{font-size:12px}
.ee-avatar{width:42px;height:42px}
.ee-top{min-height:68px}
.ee-welcome{min-height:128px;padding:18px}
.ee-kicker{font-size:12px}
.ee-welcome p{font-size:14px;line-height:1.55}
.ee-welcome-state{font-size:12px}
.ee-welcome-state i{width:8px;height:8px}
.ee-menu-title{margin-top:16px;margin-bottom:9px}
.ee-menu-title b{font-size:18px}
.ee-menu-title span{font-size:12px}
.ee-mainmenu{gap:8px}
.ee-tile{min-height:106px;gap:5px}
.ee-tile img{width:46px;height:46px}
.ee-tile strong{font-size:14px;line-height:1.25}
.ee-tile small{font-size:11px;line-height:1.3;text-align:center;padding:0 4px}
.ee-tile .badge{min-width:23px;height:23px;font-size:12px}
.ee-summary{gap:8px;margin-top:12px}
.ee-stat{min-height:66px;padding:10px 11px}
.ee-stat-label{font-size:11px;letter-spacing:.07em}
.ee-stat-value{font-size:20px}
.ee-stat-sub{font-size:11px;line-height:1.3}
.ee-more{padding:12px 14px}
.ee-more strong{font-size:14px}
.ee-more small{font-size:11px;line-height:1.35}
.ee-more img{width:38px;height:38px}
.ee-nav a,.ee-nav button{font-size:12px;gap:5px}
.ee-nav-icon{font-size:21px}
.ee-nav-badge{font-size:11px;min-width:19px;height:19px}
.ee-drawer-head b{font-size:16px}
.ee-drawer-grid a{min-height:76px}
.ee-drawer-grid img{width:35px;height:35px}
.ee-drawer-grid span{font-size:12px}
}
@media(max-width:380px){
.ee-welcome{min-height:122px;padding:14px}
.ee-welcome-copy{max-width:65%}
.ee-welcome-bj{width:130px;height:130px}
.ee-tile{min-height:100px}
.ee-tile img{width:42px;height:42px}
.ee-tile strong{font-size:13px}
.ee-tile small{font-size:10px}
.ee-stat-label,.ee-stat-sub{font-size:10px}
.ee-nav a,.ee-nav button{font-size:11px}
}
/* Home typography balanced scale v3 */
@media(max-width:600px){
.ee-brand{font-size:16px}
.ee-brand b{font-size:11px}
.ee-profile-copy b{font-size:13px}
.ee-profile-copy small{font-size:10px}
.ee-avatar{width:37px;height:37px}
.ee-top{min-height:60px}
.ee-welcome{min-height:112px;padding:15px 16px}
.ee-kicker{font-size:10px}
.ee-welcome p{font-size:11px;line-height:1.5}
.ee-welcome-state{font-size:10px}
.ee-welcome-state i{width:6px;height:6px}
.ee-menu-title{margin-top:13px;margin-bottom:7px}
.ee-menu-title b{font-size:15px}
.ee-menu-title span{font-size:10px}
.ee-mainmenu{gap:7px}
.ee-tile{min-height:94px;gap:3px}
.ee-tile img{width:43px;height:43px}
.ee-tile strong{font-size:12px;line-height:1.25}
.ee-tile small{font-size:9px;line-height:1.3;text-align:center;padding:0 4px}
.ee-tile .badge{min-width:20px;height:20px;font-size:10px}
.ee-summary{gap:7px;margin-top:10px}
.ee-stat{min-height:58px;padding:9px 10px}
.ee-stat-label{font-size:9px;letter-spacing:.07em}
.ee-stat-value{font-size:17px}
.ee-stat-sub{font-size:9px;line-height:1.3}
.ee-more{padding:10px 12px}
.ee-more strong{font-size:12px}
.ee-more small{font-size:9px;line-height:1.35}
.ee-more img{width:34px;height:34px}
.ee-nav a,.ee-nav button{font-size:10px;gap:4px}
.ee-nav-icon{font-size:19px}
.ee-nav-badge{font-size:9px;min-width:17px;height:17px}
.ee-drawer-head b{font-size:14px}
.ee-drawer-grid a{min-height:68px}
.ee-drawer-grid img{width:32px;height:32px}
.ee-drawer-grid span{font-size:10px}
}
@media(max-width:380px){
.ee-welcome{min-height:106px;padding:13px}
.ee-welcome-copy{max-width:65%}
.ee-welcome-bj{width:118px;height:118px}
.ee-tile{min-height:90px}
.ee-tile img{width:39px;height:39px}
.ee-tile strong{font-size:11px}
.ee-tile small{font-size:8px}
.ee-stat-label,.ee-stat-sub{font-size:9px}
.ee-nav a,.ee-nav button{font-size:10px}
}
/* Home mobile typography fine-tune v4 */
@media(max-width:600px){
.ee-brand{font-size:14px}
.ee-brand b{font-size:10px}
.ee-profile-copy b{font-size:12px}
.ee-profile-copy small{font-size:9px}
.ee-avatar{width:34px;height:34px}
.ee-top{min-height:56px}
.ee-welcome{min-height:100px;padding:12px 14px}
.ee-kicker{font-size:9px}
.ee-welcome p{font-size:10px;line-height:1.45}
.ee-welcome-state{font-size:9px;margin-top:6px}
.ee-menu-title{margin-top:11px;margin-bottom:6px}
.ee-menu-title b{font-size:14px}
.ee-menu-title span{font-size:9px}
.ee-mainmenu{gap:6px}
.ee-tile{min-height:84px;gap:2px}
.ee-tile img{width:37px;height:37px}
.ee-tile strong{font-size:11px;line-height:1.2}
.ee-tile small{font-size:8px;line-height:1.25;padding:0 3px}
.ee-tile .badge{min-width:18px;height:18px;font-size:9px;right:6px;top:6px}
.ee-summary{gap:6px;margin-top:8px}
.ee-stat{min-height:51px;padding:7px 9px}
.ee-stat-label{font-size:8px;letter-spacing:.06em}
.ee-stat-value{font-size:15px}
.ee-stat-sub{font-size:8px;line-height:1.25}
.ee-more{padding:8px 10px;margin-top:7px}
.ee-more strong{font-size:11px}
.ee-more small{font-size:8px;line-height:1.3}
.ee-more img{width:30px;height:30px}
.ee-nav a,.ee-nav button{font-size:10px;gap:4px}
.ee-nav-icon{font-size:24px;line-height:1.05;transform:scale(1.08)}
.ee-nav-badge{font-size:9px;min-width:17px;height:17px}
.ee-drawer-head b{font-size:13px}
.ee-drawer-grid a{min-height:62px}
.ee-drawer-grid img{width:29px;height:29px}
.ee-drawer-grid span{font-size:9px}
}
@media(max-width:380px){
.ee-welcome{min-height:96px;padding:11px}
.ee-welcome-copy{max-width:65%}
.ee-welcome-bj{width:108px;height:108px}
.ee-tile{min-height:80px}
.ee-tile img{width:34px;height:34px}
.ee-tile strong{font-size:10px}
.ee-tile small{font-size:7px}
.ee-stat-label,.ee-stat-sub{font-size:8px}
.ee-nav a,.ee-nav button{font-size:9px}
}${EAGLEEYE_NAV_CSS}
</style></head><body>
<div class="ee-app">
<header class="ee-top"><div class="ee-brand"><span>EAGLEEYE</span><b>/ HOME</b></div>${loginBlock}</header>
<main class="ee-main"><div class="ee-screen">
<a class="ee-welcome-link" href="/status" aria-label="システム状況を確認"><section class="ee-welcome">
  <div class="ee-welcome-copy">
    <span class="ee-welcome-state"><i></i> システム稼働中</span>
  </div>
  <img class="ee-welcome-bj" src="/assets/eagleeye/bjnyan/hero_bjnyan.png" alt="BJにゃん">
</section></a>
<div class="ee-menu-title"><b>主要メニュー</b><span>必要な入口だけをここに</span></div>
<section class="ee-mainmenu">
  <a class="ee-tile primary" href="/kingdom/rankings"><img src="/assets/eagleeye/bjnyan/12_kingdom_found.png" alt=""><strong>ランキング</strong><small>王国・順位を確認</small></a>
  <a class="ee-tile primary" href="/watchlist"><img src="/assets/eagleeye/bjnyan/10_player_recheck.png" alt=""><strong>ウォッチリスト</strong><small>プレイヤー・王国を追跡</small><b class="badge" id="playerBadge">0</b></a>
  <a class="ee-tile" href="/players"><img src="/assets/eagleeye/bjnyan/01_player_search.png" alt=""><strong>プレイヤー検索</strong><small>プレイヤーを探す</small></a>
  <a class="ee-tile" href="/kingdom-catalog"><img src="/assets/eagleeye/bjnyan/11_kingdom_search.png" alt=""><strong>王国検索</strong><small>王国を探す</small></a>
  <a class="ee-tile" href="/status"><img src="/assets/eagleeye/bjnyan/03_player_searching_data.png" alt=""><strong>システム状況</strong><small>稼働状況を確認</small></a>
  <a class="ee-tile" href="/my-player"><img src="/assets/eagleeye/bjnyan/15_search_complete.png" alt=""><strong>マイKingshot</strong><small>自分のデータ</small></a>
</section>
<section class="ee-summary">
  <div class="ee-stat"><div class="ee-stat-label">PLAYER WATCH</div><div class="ee-stat-value"><em id="playerCount">0</em> 人</div><div class="ee-stat-sub">監視中のプレイヤー</div></div>
  <div class="ee-stat"><div class="ee-stat-label">KINGDOM WATCH</div><div class="ee-stat-value"><em id="kingdomCount">0</em> 王国</div><div class="ee-stat-sub">監視中の王国</div></div>
  <div class="ee-stat"><div class="ee-stat-label">MY KINGSHOT</div><div class="ee-stat-value">DATA</div><div class="ee-stat-sub">登録データへ</div></div>
  <div class="ee-stat"><div class="ee-stat-label">EAGLEEYE</div><div class="ee-stat-value"><em>LIVE</em></div><div class="ee-stat-sub">観測システム稼働中</div></div>
</section>
<button class="ee-milestone-card" type="button" disabled aria-disabled="true">
  <span class="ee-milestone-icon" aria-hidden="true">✦</span>
  <span class="ee-milestone-copy"><strong>マイルストーン</strong><small>デイリー・累計目標と報酬</small></span>
  <span class="ee-milestone-status">近日公開予定</span>
</button>

</div></main>
${renderEagleEyeNavigation({ active: "home", badgeId: "navBadge", home: true })}
<div class="ee-global-nav-drawer" aria-hidden="true">
  <section class="ee-global-nav-panel" role="dialog" aria-modal="true" aria-label="その他の機能">
    <div class="ee-global-nav-panel-head"><strong>その他の機能</strong><button type="button" data-close>閉じる ×</button></div>
    <div class="ee-global-nav-links">
      ${renderEagleEyeOtherMenu({ auth: menuAuth, includeAccount: true, compact: false })}
    </div>
  </section>
</div>
<script>
(function(){
  var loginTrigger=document.querySelector(".ee-login-trigger");
  if(loginTrigger){
    loginTrigger.addEventListener("click",function(){
      if(loginTrigger.getAttribute("aria-busy")==="true")return;
      loginTrigger.setAttribute("aria-busy","true");
      loginTrigger.setAttribute("aria-label","Discordへ接続中");
      var label=loginTrigger.querySelector(".ee-login-label");
      var state=loginTrigger.querySelector(".ee-login-state");
      if(label)label.textContent="接続中…";
      if(state)state.textContent="Discordへ移動";
    });
  }
  // Drawer open/close behavior is shared across all pages.
  var pCount=document.getElementById("playerCount"),kCount=document.getElementById("kingdomCount"),pBadge=document.getElementById("playerBadge"),nBadge=document.getElementById("navBadge");
  function countUp(el,target,duration){
    target=Math.max(0,Number(target)||0);var start=performance.now();
    function tick(now){var t=Math.min(1,(now-start)/duration),e=1-Math.pow(1-t,3);el.textContent=Math.round(target*e);if(t<1)requestAnimationFrame(tick)}
    requestAnimationFrame(tick)
  }
  async function loadCounts(){
    try{
      var p=await fetch("/api/player-watchlist",{credentials:"same-origin",cache:"no-store"}).then(function(r){return r.json()});
      var pc=(p.watchlist||[]).filter(function(x){return x.enabled!==false}).length;
      if(pBadge)pBadge.textContent=pc;
      if(nBadge)nBadge.textContent=pc;
      if(pCount)countUp(pCount,pc,700);
    }catch(e){}
    try{
      var k=await fetch("/api/kingdom-watchlist",{credentials:"same-origin",cache:"no-store"}).then(function(r){return r.json()});
      var kc=(k.watchlists||[]).filter(function(x){return Number(x.enabled)!==0}).length;
      countUp(kCount,kc,700);
    }catch(e){}
  }
  loadCounts();
})();
</script></body></html>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" }
  });
}

function serializeCookie(name, value, options = {}) {
  const parts = [name + "=" + encodeURIComponent(value)];
  if (options.maxAge !== undefined) parts.push("Max-Age=" + options.maxAge);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) parts.push("SameSite=" + options.sameSite);
  if (options.path) parts.push("Path=" + options.path);
  return parts.join("; ");
}

function parseCookie(header) {
  const result = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return result;
}

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64urlEncodeText(text) {
  return base64url(new TextEncoder().encode(text));
}

function base64urlDecodeText(text) {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  return new TextDecoder().decode(Uint8Array.from(atob(padded), char => char.charCodeAt(0)));
}

async function hmac(input, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input)));
}

async function signPayload(payload, secret) {
  const body = base64urlEncodeText(JSON.stringify(payload));
  return body + "." + base64url(await hmac(body, secret));
}

async function verifyPayload(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const body = parts[0];
  const provided = decodeBase64Url(parts[1]);
  const expected = await hmac(body, secret);
  if (!constantTimeEqual(expected, provided)) return null;
  try {
    const payload = JSON.parse(base64urlDecodeText(body));
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function createStateToken(secret) {
  const body = Date.now() + "." + crypto.randomUUID();
  return base64urlEncodeText(body) + "." + base64url(await hmac(body, secret));
}

async function verifyStateToken(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  let body;
  try {
    body = base64urlDecodeText(parts[0]);
  } catch {
    return false;
  }
  const provided = decodeBase64Url(parts[1]);
  const expected = await hmac(body, secret);
  if (!constantTimeEqual(expected, provided)) return false;
  const timestamp = Number(body.split(".")[0]);
  return Number.isFinite(timestamp) && Date.now() - timestamp < 10 * 60 * 1000;
}

function decodeBase64Url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}