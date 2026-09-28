const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
const DISCORD_ME_URL = "https://discord.com/api/users/@me";
const CALLBACK_PATH = "/api/auth/callback";
const DEFAULT_DISCORD_REDIRECT_URI = "https://kingshot-data-platform.black-jack-kingshot.workers.dev/api/auth/callback";
const SESSION_COOKIE = "eagleeye_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

import { mightPulseFetch, getMightPulsePlayer, getMightPulsePlayerRanks, getMightPulseKingdomRanks, getMightPulseKingdomAllRankings } from "./mightpulse.js";
import { MIGHTPULSE_RESEARCH_CANDIDATES, runMightPulseResearch } from "./mightpulse-research.js";
import { savePlayerRankSnapshot, buildPlayerRankSnapshotStatement, saveKingdomRankingBoard, getLatestKingdomRankings, getRankingHistory, getPlayerRankHistory, getKingdomRankingChanges, normalizeGovernorId } from "./ranking-store.js";
import { observationEnvelope } from "./mightpulse-normalizer.js";
import { saveApiObservation } from "./api-observations.js";
import { getLatestPlayerObservation, materializePlayer, getPlayer, getPlayerHistory, getPlayerNameHistory } from "./player-store.js";
import { configureApiPoolEncryption, addApiPoolKey, listApiPoolKeys, leaseApiKey, leaseApiKeyForHealthCheck, recordApiPoolSuccess, recordApiPoolFailure, getPoolStats, releaseExpiredLeases } from "./api-pool.js";
import { getRetentionSettings, updateRetentionSettings, runRetentionCleanup } from "./retention.js";
import { exportToGoogleSheet } from "./google-sheets.js";
import { ensureDiagnosticSchema, diagnosticTraceId, recordDiagnostic, getSystemDiagnostics, DIAGNOSTIC_SERVICES } from "./diagnostics.js";
import { getCloudflareD1Usage, cloudflareUsageLabel } from "./cloudflare-analytics.js";
import { handleGatewayApi } from "./gateway-api.js";
import { getOperationalStatus } from "./status-ops.js";
import { drainHistoryEmergencyBuffer } from "./history-emergency-buffer.js";

async function runDataRetentionJob(env) {
  if (!env.DB) return;
  await ensureDiagnosticSchema(env.DB);
  try {
    const result = await runRetentionCleanup(env.DB, { batchSize: 1000, archiveBucket: env.ARCHIVE });
    console.log("data_retention_cleanup_ok", result.deleted);
  } catch (error) {
    console.error("data_retention_cleanup_failed", error?.message || error);
  }
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
  if (visibilityEnabled(settings, "base_activity", role)) for (const key of ["online","last_active_at","last_login"]) if (player[key] !== undefined) visible[key] = player[key];
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

async function runKingdomWatchlistJobs(env) {
  if (!env.DB) return;
  await ensureKingdomWatchlistFreshnessSchema(env.DB);
  const now = Math.floor(Date.now() / 1000);
  const rows = await env.DB.prepare(
    "SELECT watchlist_id, kid, top_n, interval_hours, last_run_at FROM kingdom_watchlists WHERE enabled = 1 ORDER BY created_at ASC"
  ).all();

  // Read all active jobs once. This replaces one D1 SELECT per not-due watchlist.
  const activeJobRows = await env.DB.prepare(
    "SELECT watchlist_id FROM kingdom_watchlist_jobs WHERE status IN ('RANKINGS','PLAYERS')"
  ).all();
  const activeWatchlistIds = new Set((activeJobRows.results || []).map(item => String(item.watchlist_id)));

  for (const row of rows.results || []) {
    const due = !row.last_run_at || now - Number(row.last_run_at) >= Number(row.interval_hours) * 3600;
    // Do not write a lock for an idle watchlist that is not due.
    if (!due && !activeWatchlistIds.has(String(row.watchlist_id))) continue;
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
        const result = await processKingdomWatchlistJob(env, job);
        if (result.completed) {
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

async function processKingdomWatchlistJob(env, job) {
  const now = Math.floor(Date.now() / 1000);

  if (job.status === "RANKINGS") {
    const startIndex = Number(job.board_index || 0);
    const concurrency = await getWatchlistApiConcurrency(env);
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
        const fetched = await fetchKingdomRankingThroughApiPool(
          env, job.kid, board, WATCHLIST_RANKING_LIMIT, "KINGDOM_WATCHLIST_RANKING"
        );
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

      if (!entries.length) {
        await recordDiagnostic(env.DB, {
          traceId, service: "ranking", feature: "kingdom_watchlist",
          operation: "FETCH_PARSE", status: "FAILED",
          errorCode: "RANKING_ENTRIES_EMPTY",
          message: "ランキングAPIは応答しましたが、ランキング配列を抽出できませんでした。",
          provider: "MIGHTPULSE", targetType: "KINGDOM", targetId: job.kid,
          startedAt: Math.floor(startedAtMs / 1000), completedAt: Math.floor(Date.now() / 1000),
          elapsedMs: Date.now() - startedAtMs, sourceObservedAt,
          rowsReceived: 0, rowsSaved: 0,
          metadata: { board, upstreamStatus: fetched.result?.status ?? 200, payloadType: Array.isArray(payload) ? "array" : typeof payload, payloadKeys, rankingPayloadShape, poolType: fetched.pool_type }
        });
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

      await env.DB.prepare(
        "UPDATE kingdom_watchlist_jobs SET board_index = ?, ranking_rows = ?, source_first_at = CASE WHEN ? IS NULL THEN source_first_at WHEN source_first_at IS NULL OR ? < source_first_at THEN ? ELSE source_first_at END, source_last_at = CASE WHEN ? IS NULL THEN source_last_at WHEN source_last_at IS NULL OR ? > source_last_at THEN ? ELSE source_last_at END, updated_at = ? WHERE job_id = ?"
      ).bind(
        KINGDOM_RANKING_BOARDS.indexOf(board) + 1,
        rankingRows,
        sourceObservedAt, sourceObservedAt, sourceObservedAt,
        sourceObservedAt, sourceObservedAt, sourceObservedAt,
        Math.floor(Date.now() / 1000),
        job.job_id
      ).run();
    }

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

    const concurrency = await getWatchlistApiConcurrency(env);
    const fetchedPlayers = await fetchWithConcurrency(batchIds, concurrency, async governorId => {
      try {
        return { governorId, fetched: await fetchPlayerDetailThroughApiPool(env, governorId) };
      } catch (error) {
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

async function getWatchlistApiConcurrency(env) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM api_pool_keys WHERE provider = 'MIGHTPULSE' AND pool_type IN ('SYSTEM_WATCHLIST','SYSTEM_GENERAL') AND status = 'AVAILABLE'"
  ).first();
  return Math.max(1, Math.min(4, Number(row?.count || 1)));
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
        var refresh=document.createElement("button"); refresh.textContent=active?"更新中…":"今すぐ更新"; refresh.disabled=active; refresh.onclick=function(){refreshWatch(w.watchlist_id);};
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
          if(!finished) pollTimer=setTimeout(poll,2000);
        }).catch(function(){
          if(!finished) pollTimer=setTimeout(poll,1000);
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
          return load().then(function(){ return new Promise(function(resolve){setTimeout(resolve,300);}); }).then(step);
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
  el("create").addEventListener("click",function(){
    var kidValue=String(el("kid").value||"").trim();
    var topValue=String(el("top").value||"").trim();
    var intervalValue=String(el("interval").value||"").trim();
    if(!kidValue){
      el("msg").innerHTML="<span class='error'>登録失敗: 王国番号を入力してください。</span>";
      el("kid").focus();
      return;
    }
    var payload={kid:Number(kidValue),top_n:Number(topValue),interval_hours:Number(intervalValue)};
    api("/api/kingdom-watchlist?action=create",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)})
    .then(function(){el("kid").value="";el("msg").innerHTML="<span class='ok'>監視対象を登録しました。</span>";return load();})
    .catch(function(e){
      el("msg").innerHTML="<span class='error'>登録失敗: "+esc(e.message)+"</span>";
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

  const players = await env.DB.prepare(
    "WITH top_players AS (SELECT DISTINCT CASE WHEN governor_id LIKE '%.0' THEN substr(governor_id, 1, length(governor_id) - 2) ELSE governor_id END AS governor_id FROM kingdom_ranking_current WHERE kid = ? AND board = 'personal_power' AND target_type = 'PLAYER' AND governor_id IS NOT NULL AND rank <= ?) SELECT p.governor_id, p.uid, p.nick_name, p.kid, p.power, p.town_center_level, p.vip, p.kills, p.x, p.y, p.alliance_abbr, p.alliance_name, p.online, p.last_active_at, p.observed_at FROM players p JOIN top_players t ON t.governor_id = CASE WHEN p.governor_id LIKE '%.0' THEN substr(p.governor_id, 1, length(p.governor_id) - 2) ELSE p.governor_id END ORDER BY p.power DESC, p.governor_id ASC"
  ).bind(watch.kid, watch.top_n).all();

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
    return json({ ok: true, governor_id: governorId, enabled: enabled === 1 });
  }

  if (request.method === "DELETE") {
    const governorId = normalizeGovernorId(url.searchParams.get("governor_id"));
    if (!governorId) return json({ ok: false, error: "GOVERNOR_ID_REQUIRED" }, 400);
    const result = await env.DB.prepare(
      "DELETE FROM player_watchlists WHERE discord_id = ? AND governor_id = ?"
    ).bind(auth.discord_id, governorId).run();
    if (!result?.meta?.changes) return json({ ok: false, error: "WATCHLIST_ITEM_NOT_FOUND" }, 404);
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
.actions{display:flex;gap:7px;margin-top:12px;flex-wrap:wrap}.action{display:inline-flex;align-items:center;justify-content:center;padding:9px 11px;border:1px solid #334155;border-radius:9px;background:#0f1220;color:#e2e8f0;text-decoration:none;font-size:12px;font-weight:800;cursor:pointer}.action.primary{background:#f59e0b;color:#111827;border-color:#f59e0b}.danger{color:#fecaca;border-color:#7f1d1d}.empty,.error{padding:18px;border:1px dashed #475569;border-radius:14px;color:#94a3b8;text-align:center}.error{color:#fecaca;border-style:solid;border-color:#7f1d1d}.loading{color:#94a3b8;padding:18px;text-align:center}
@media(max-width:520px){.head{display:block}.head .action{margin-top:10px}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style></head><body><main>
<div class="head"><div><a class="back" href="/">← EagleEye</a><h1 class="title">プレイヤーウォッチリスト</h1><div class="sub">登録したプレイヤーの現在値と変化を確認できます</div></div><a class="action" href="/players">プレイヤー検索</a></div>
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
          '<div class="actions"><a class="action primary" href="/player?governor_id='+encodeURIComponent(x.governor_id)+'">プレイヤー詳細</a><a class="action" href="/player/changes?governor_id='+encodeURIComponent(x.governor_id)+'">変更履歴</a><button class="action danger" data-g="'+esc(x.governor_id)+'">削除</button></div>'+
        '</article>';
      }).join("");
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

    const now = Math.floor(Date.now() / 1000);
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO kingdom_watchlists (watchlist_id, discord_id, kid, top_n, interval_hours, enabled, last_run_at, last_success_at, last_error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, NULL, NULL, NULL, ?, ?)"
    ).bind(id, auth.discord_id, kid, topN, intervalHours, now, now).run();
    return json({ ok: true, watchlist_id: id });
  }

  if (request.method === "POST" && action === "refresh") {
    try {
      // Reuse the shared cached schema bootstrap so manual refresh does not
      // repeat DDL/metadata work on every request.
      await ensureKingdomWatchlistFreshnessSchema(env.DB);
      const body = await request.json().catch(() => ({}));
      const watchlistId = String(body.watchlist_id || "").trim();
      if (!watchlistId) return json({ ok: false, error: "WATCHLIST_ID_REQUIRED" }, 400);
  
      const watch = await env.DB.prepare(
        "SELECT watchlist_id, kid, top_n FROM kingdom_watchlists WHERE watchlist_id = ? AND discord_id = ?"
      ).bind(watchlistId, auth.discord_id).first();
      if (!watch) return json({ ok: false, error: "WATCHLIST_NOT_FOUND" }, 404);
  
      const now = Math.floor(Date.now() / 1000);
      const lockToken = await acquireKingdomWatchlistLock(env, watchlistId);
      if (!lockToken) {
        return json({
          ok: false,
          error: "WATCHLIST_REFRESH_IN_PROGRESS",
          message: "この監視対象は現在更新中です。処理完了を待ってください。"
        }, 409);
      }

      try {
        let job = await env.DB.prepare(
          "SELECT * FROM kingdom_watchlist_jobs WHERE watchlist_id = ? AND status IN ('RANKINGS','PLAYERS') ORDER BY created_at DESC LIMIT 1"
        ).bind(watchlistId).first();
    
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
            await env.DB.prepare(
              "UPDATE kingdom_watchlists SET last_error = NULL, updated_at = ? WHERE watchlist_id = ?"
            ).bind(now, watchlistId).run();
          }
          return json({ ok: true, watchlist_id: watchlistId, job_id: job.job_id, status: result.phase, result });
        } catch (error) {
          const message = String(error?.message || error).slice(0, 1000);
          await env.DB.prepare(
            "UPDATE kingdom_watchlist_jobs SET status = 'FAILED', last_error = ?, updated_at = ? WHERE job_id = ?"
          ).bind(message, now, job.job_id).run();
          await env.DB.prepare(
            "UPDATE kingdom_watchlists SET last_error = ?, updated_at = ? WHERE watchlist_id = ?"
          ).bind(message, now, watchlistId).run();
          console.error("kingdom_watchlist_manual_refresh_failed", watchlistId, message);
          return json({ ok: false, error: "WATCHLIST_REFRESH_FAILED", message }, 500);
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
    await env.DB.prepare(
      "UPDATE kingdom_watchlists SET enabled = ?, updated_at = ? WHERE watchlist_id = ? AND discord_id = ?"
    ).bind(enabled, Math.floor(Date.now() / 1000), watchlistId, auth.discord_id).run();
    return json({ ok: true });
  }

  if (request.method === "DELETE") {
    await env.DB.prepare(
      "DELETE FROM kingdom_watchlists WHERE watchlist_id = ? AND discord_id = ?"
    ).bind(url.searchParams.get("watchlist_id"), auth.discord_id).run();
    return json({ ok: true });
  }

  return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
}
async function handleAdminDiagnosticsApi(request, env) {
  try {
    const guard = await requireAdmin(request, env);
    if (guard.error) return guard.error;
    const data = await getSystemDiagnostics(env.DB, { recentLimit: 100 });
    return json({ ok: true, ...data });
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
    const when = s.last_event_at ? new Date(Number(s.last_event_at)*1000).toLocaleString("ja-JP") : "未確認";
    return `<div class="service"><div class="service-icon ${st.tone}">${st.icon}</div><div class="service-main"><div class="service-name">${esc(s.label)}</div><div class="service-time">${esc(when)}</div></div><div class="service-state ${st.tone}">${st.label}</div></div>`;
  }).join("");

  function jsonBlock(value) {
    if (value == null) return "<span class='muted'>なし</span>";
    let text; try { text = JSON.stringify(value, null, 2); } catch { text = String(value); }
    return "<pre class='json'>"+esc(text)+"</pre>";
  }

  const events = data.events.slice(0,40).map((e,index) => {
    const st = serviceState(e.status);
    const when = e.created_at ? new Date(Number(e.created_at)*1000).toLocaleString("ja-JP") : "-";
    const shape = e.metadata?.rankingPayloadShape;
    const shapeHtml = shape ? "<details><summary>ランキングレスポンス構造を見る</summary>"+jsonBlock(shape)+"</details>" : "";
    const facts = (e.rows_received != null || e.rows_saved != null)
      ? "<div class='facts'>"+(e.rows_received != null ? "<span>受信 "+esc(e.rows_received)+"件</span>":"")+(e.rows_saved != null ? "<span>保存 "+esc(e.rows_saved)+"件</span>":"")+(e.elapsed_ms != null ? "<span>"+esc(e.elapsed_ms)+"ms</span>":"")+"</div>" : "";
    return "<details class='event' "+(index===0 && e.status==="FAILED" ? "open":"")+"><summary><span class='mini-icon "+st.tone+"'>"+st.icon+"</span><span class='event-title'>"+esc(e.feature)+"</span><span class='event-op'>"+esc(e.operation)+"</span><span class='event-time'>"+esc(when)+"</span></summary><div class='event-body'><div class='event-status "+st.tone+"'>"+st.label+(e.error_code?" · "+esc(e.error_code):"")+"</div><p>"+esc(e.message||"メッセージなし")+"</p>"+facts+"<div class='details-grid'><div><small>対象</small><b>"+esc((e.target_type||"-")+" "+(e.target_id||""))+"</b></div><div><small>Provider</small><b>"+esc(e.provider||"-")+"</b></div><div><small>Trace ID</small><b>"+esc(e.trace_id||"-")+"</b></div></div>"+shapeHtml+(e.metadata&&!shape?"<details><summary>メタデータを見る</summary>"+jsonBlock(e.metadata)+"</details>":"")+"</div></details>";
  }).join("") || "<div class='empty'>診断イベントはありません。</div>";

  return eagleEyeHtmlResponse(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="30"><title>システム状況 | EagleEye</title><style>
*{box-sizing:border-box}html{background:#f5f5f7}body{margin:0;background:#f5f5f7;color:#1d1d1f;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text",system-ui,sans-serif;-webkit-font-smoothing:antialiased}.wrap{max-width:860px;margin:auto;padding:20px 16px 50px}.nav{display:flex;align-items:center;justify-content:space-between;padding:4px 4px 22px}.back{color:#0071e3;text-decoration:none;font-size:14px;font-weight:600}.live{display:flex;align-items:center;gap:7px;color:#86868b;font-size:12px}.live-dot{width:7px;height:7px;border-radius:50%;background:#34c759}.hero{background:#fff;border-radius:28px;padding:30px 26px;border:1px solid #d2d2d7;box-shadow:0 6px 24px rgba(0,0,0,.05)}.hero-line{display:flex;align-items:center;gap:16px}.hero-icon{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;font-size:25px;font-weight:800}.hero-icon.good{background:#e8f8ed;color:#1b8a3e}.hero-icon.warn{background:#fff4d6;color:#b77900}.hero-icon.bad{background:#ffe9e7;color:#d70015}.hero-icon.neutral{background:#f2f2f7;color:#6e6e73}.eyebrow{color:#86868b;font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase}.hero h1{margin:3px 0 0;font-size:30px;letter-spacing:-.035em}.note{margin:20px 0 0;color:#6e6e73;line-height:1.55}.stats{display:grid;grid-template-columns:repeat(4,1fr);margin-top:24px;border-top:1px solid #e5e5ea;padding-top:20px}.stat{text-align:center;border-right:1px solid #e5e5ea}.stat:last-child{border-right:0}.stat b{display:block;font-size:22px;letter-spacing:-.03em}.stat span{display:block;margin-top:4px;color:#86868b;font-size:11px}.section{margin-top:28px}.section-head{display:flex;align-items:end;justify-content:space-between;padding:0 5px 10px}.section-head h2{margin:0;font-size:20px;letter-spacing:-.02em}.section-head span{color:#86868b;font-size:11px}.card{background:#fff;border:1px solid #d2d2d7;border-radius:22px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,.035)}.service{display:flex;align-items:center;gap:13px;padding:16px 18px;border-bottom:1px solid #e5e5ea}.service:last-child{border-bottom:0}.service-icon,.mini-icon{flex:0 0 auto;width:27px;height:27px;border-radius:50%;display:grid;place-items:center;font-size:13px;font-weight:800}.service-main{flex:1;min-width:0}.service-name{font-size:15px;font-weight:650}.service-time{margin-top:3px;color:#86868b;font-size:11px}.service-state{font-size:12px;font-weight:700}.good{color:#1b8a3e}.warn{color:#b77900}.bad{color:#d70015}.neutral{color:#6e6e73}.event{border-bottom:1px solid #e5e5ea}.event:last-child{border-bottom:0}.event summary{list-style:none;cursor:pointer;padding:16px 18px;display:flex;align-items:center;gap:10px}.event summary::-webkit-details-marker{display:none}.event-title{font-size:14px;font-weight:650}.event-op{color:#86868b;font-size:11px}.event-time{margin-left:auto;color:#86868b;font-size:11px;text-align:right}.event-body{padding:0 18px 18px}.event-status{font-size:12px;font-weight:700}.event-body p{margin:9px 0 14px;color:#6e6e73;font-size:13px;line-height:1.6;word-break:break-word}.facts{display:flex;gap:7px;flex-wrap:wrap;margin:8px 0 14px}.facts span{padding:6px 9px;background:#f5f5f7;border-radius:9px;color:#6e6e73;font-size:11px}.details-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.details-grid div{background:#f5f5f7;border-radius:11px;padding:9px}.details-grid small{display:block;color:#86868b;font-size:10px}.details-grid b{display:block;margin-top:3px;font-size:11px;word-break:break-all}.event details{margin-top:10px;border-top:1px solid #e5e5ea}.event details summary{padding:11px 0;font-size:11px;color:#0071e3}.json{margin:0;padding:12px;background:#1d1d1f;color:#f5f5f7;border-radius:12px;max-height:360px;overflow:auto;white-space:pre-wrap;word-break:break-word;font-size:10px;line-height:1.5}.empty{padding:28px;text-align:center;color:#86868b;font-size:13px}.footer{display:flex;justify-content:space-between;gap:12px;margin:18px 4px;color:#86868b;font-size:11px}.footer a{color:#0071e3;text-decoration:none}@media(max-width:600px){.wrap{padding:12px 10px 40px}.hero{padding:23px 18px;border-radius:22px}.hero h1{font-size:25px}.stats{grid-template-columns:repeat(2,1fr);gap:14px}.stat{border-right:0}.stat:nth-child(-n+2){padding-bottom:3px;border-bottom:1px solid #e5e5ea}.service{padding:14px}.service-time{font-size:10px}.event summary{padding:14px}.event-op{display:none}.event-time{font-size:10px}.details-grid{grid-template-columns:1fr}.footer{flex-direction:column}}
</style></head><body><main class="wrap"><nav class="nav"><a class="back" href="/admin">‹ 管理画面</a><div class="live"><span class="live-dot"></span>30秒ごとに自動更新</div></nav><section class="hero"><div class="hero-line"><div class="hero-icon ${state.tone}">${state.icon}</div><div><div class="eyebrow">EagleEye System Status</div><h1>${state.label}</h1></div></div><p class="note">${state.note}</p><div class="stats"><div class="stat"><b>${data.counts.healthy}</b><span>正常</span></div><div class="stat"><b>${data.counts.warning}</b><span>注意</span></div><div class="stat"><b>${data.counts.failed}</b><span>障害</span></div><div class="stat"><b>${data.counts.unknown}</b><span>未診断</span></div></div></section><section class="section"><div class="section-head"><h2>サービス</h2><span>${data.services.length}項目</span></div><div class="card">${services}</div></section><section class="section"><div class="section-head"><h2>最近の診断</h2><span>最新40件</span></div><div class="card">${events}</div></section><footer class="footer"><span>EagleEye Diagnostics</span><a href="/admin">管理画面へ戻る</a></footer></main></body></html>`);
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
  let poolType = spec.targetType === "KINGDOM" ? "SYSTEM_WATCHLIST" : "SYSTEM_GENERAL";

  try {
    try {
      lease = await leaseApiKey(env.DB, {
        poolType,
        purpose: "MIGHTPULSE_PROBE",
        targetType: spec.targetType,
        targetId: spec.targetId
      });
    } catch (error) {
      if (poolType !== "SYSTEM_WATCHLIST" || error?.message !== "NO_API_POOL_KEY_AVAILABLE") throw error;
      poolType = "SYSTEM_GENERAL";
      lease = await leaseApiKey(env.DB, {
        poolType,
        purpose: "MIGHTPULSE_PROBE",
        targetType: spec.targetType,
        targetId: spec.targetId
      });
    }

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
  '<b>Payload keys</b><span class=\"mono\">'+esc((p.payload_keys||[]).join(', '))+'</span>'+
  '<b>HTTP headers</b><span class=\"mono\">'+esc(JSON.stringify(h,null,2))+'</span>'+
  '<b>Timestamp-like fields</b><span>'+th+'</span>'+
  '<b>Response SHA-256</b><span class=\"mono\">'+esc(p.response_sha256)+'</span>'+
  '<b>Section SHA-256</b><span>'+sh+'</span>'+
  '<b>比較</b><span><strong>'+esc(comparison.title)+'</strong><br>'+comparison.items.map(function(x){return '• '+esc(x);}).join('<br>')+'</span>'+
  '</div></div>';}async function probe(type){var q=new URLSearchParams({type:type});if(type==='PLAYER'){q.set('governor_id',document.getElementById('governorId').value.trim());q.set('include',document.getElementById('include').value);}else{q.set('kid',document.getElementById('kid').value.trim());if(type==='KINGDOM_RANKING')q.set('board',document.getElementById('board').value);}document.getElementById('status').textContent='取得中…';try{var r=await fetch('/api/admin/mightpulse-probe?'+q.toString(),{cache:'no-store',credentials:'same-origin'});var d=await r.json();if(!r.ok||!d.ok)throw new Error(d.message||d.error||('HTTP '+r.status));var p=d.probe;p.client_received_at=Date.now();var rows=read();var previous=rows.find(function(x){return x.type===p.type&&String(x.target_id)===String(p.target_id);})||null;rows.unshift({client_received_at:p.client_received_at,type:p.type,target_id:p.target_id,fresh:p.fresh,cached_at:p.cached_at,age_seconds:p.age_seconds,http_status:p.http_status,elapsed_ms:p.elapsed_ms,hash:p.response_sha256});write(rows);draw();showLatest(p,previous);document.getElementById('status').innerHTML='<span class=\"ok\">取得成功。履歴に追加しました。</span>';}catch(e){document.getElementById('status').innerHTML='<span class=\"error\">Probe失敗: '+esc(e.message||e)+'</span>';}}document.querySelectorAll('button[data-type]').forEach(function(btn){btn.addEventListener('click',function(){probe(btn.getAttribute('data-type'));});});document.getElementById('clearHistory').addEventListener('click',function(){localStorage.removeItem(key);draw();document.getElementById('latest').innerHTML='';});draw();}());</script></body></html>`;
}
export default {
  async scheduled(controller, env, ctx) {
    if (env.DB && env.ARCHIVE) {
      try {
        const drained = await drainHistoryEmergencyBuffer(env.DB, env.ARCHIVE, { limit: 10 });
        if (drained.attempted) console.log("history_emergency_buffer_drain", drained);
      } catch (error) {
        console.error("history_emergency_buffer_drain_failed", error?.message || error);
      }
    }
    await runKingdomWatchlistJobs(env);
    const minute = new Date(controller.scheduledTime || Date.now()).getUTCMinutes();
    if (minute === 0) await runDataRetentionJob(env);
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/gateway/v1/")) return await handleGatewayApi(request, env);
      if (url.pathname === "/api/player-watchlist") return await handlePlayerWatchlistApi(request, env);
      if (url.pathname === "/player-watchlist") return eagleEyeHtmlResponse(await renderPlayerWatchlistPage(request, env));
      if (url.pathname === "/api/kingdom-watchlist/history") return await handleKingdomRankingHistoryApi(request, env);
      if (url.pathname === "/api/kingdom-watchlist/data") return await handleKingdomWatchlistDataApi(request, env);
      if (url.pathname === "/api/kingdom-watchlist") return await handleKingdomWatchlistApi(request, env);
      if (url.pathname === "/kingdom-watchlist") return eagleEyeHtmlResponse(await renderKingdomWatchlistPage(request, env));
      if (url.pathname === "/api/auth/discord") return await startDiscordLogin(request, env);
      if (url.pathname === CALLBACK_PATH) return await handleDiscordCallback(request, env);
      if (url.pathname === "/api/auth/logout") return logout(request);
      if (url.pathname === "/api/debug/player-gear") return await handleDebugPlayerGear(request, env);
      if (url.pathname === "/api/debug/player-icons") return await handleDebugPlayerIcons(request, env);
      if (url.pathname === "/api/me") return await handleMe(request, env);
      if (url.pathname === "/api/admin/mightpulse/player") return await handleMightPulsePlayerTest(request, env);
      if (url.pathname === "/api/admin/mightpulse-probe") return await handleMightPulseProbeApi(request, env);
      if (url.pathname === "/api/admin/mightpulse-research") return await handleMightPulseResearchApi(request, env);
      if (url.pathname === "/api/admin/rankings/player") return await handleRankingPlayerTest(request, env);
      if (url.pathname === "/api/admin/rankings/board") return await handleRankingBoardTest(request, env);
      if (url.pathname === "/api/admin/data-retention") return await handleDataRetentionApi(request, env);
      if (url.pathname === "/api/admin/player-visibility") return await handlePlayerVisibilityApi(request, env);
      if (url.pathname === "/api/admin/player-export") return await handlePlayerSectionExport(request, env);
      if (url.pathname === "/api/admin/kingdom-rankings") return await handleAdminKingdomRankingApi(request, env);
      if (url.pathname === "/api/admin/kingdom-ranking-export") return await handleAdminKingdomRankingExport(request, env);
      if (url.pathname === "/api/admin/diagnostics") return await handleAdminDiagnosticsApi(request, env);
      if (url.pathname === "/api/admin/monitoring-profile") return await handleMonitoringProfileApi(request, env);
      if (url.pathname === "/api/admin/r2-archive-objects") return await handleR2ArchiveObjectsApi(request, env);
      if (url.pathname === "/api/admin/api-pool/keys") return await handleApiPoolKeys(request, env);
      if (url.pathname === "/api/admin/api-pool/add") return await handleApiPoolAdd(request, env);
      if (url.pathname === "/api/admin/api-pool/move") return await handleApiPoolMove(request, env);
      if (url.pathname === "/api/admin/api-pool/revoke") return await handleApiPoolRevoke(request, env);
      if (url.pathname === "/api/admin/api-pool/health-check") return await handleApiPoolHealthCheck(request, env);
      if (url.pathname === "/api/admin/api-pool/delete") return await handleApiPoolDelete(request, env);
      if (url.pathname === "/api/admin/api-pool/test-player") return await handleApiPoolTestPlayer(request, env);
      if (url.pathname === "/api/admin/api-pool/test-ranking") return await handleApiPoolTestRanking(request, env);
      if (url.pathname === "/api/owner/users") return await handleOwnerUsersApi(request, env);
      if (url.pathname === "/api/owner/users/watchlists") return await handleOwnerUserWatchlistsApi(request, env);
      if (url.pathname === "/api/owner/users/role") return await handleOwnerUserRoleApi(request, env);
      if (url.pathname === "/api/owner/users/status") return await handleOwnerUserStatusApi(request, env);
      if (url.pathname === "/api/owner/users/login-history") return await handleOwnerLoginHistoryApi(request, env);
      if (url.pathname === "/api/owner/audit-log") return await handleOwnerAuditLogApi(request, env);
      if (url.pathname === "/owner") return eagleEyeHtmlResponse(await renderOwnerAdminPage(request, env));
      if (url.pathname === "/admin") return eagleEyeHtmlResponse(await renderAdminControlPage(request, env));
      if (url.pathname === "/admin/data-retention") return eagleEyeHtmlResponse(await renderDataRetentionPage(request, env));
      if (url.pathname === "/admin/player-visibility") return eagleEyeHtmlResponse(await renderPlayerVisibilityPage(request, env));
      if (url.pathname === "/admin/kingdom-rankings") return eagleEyeHtmlResponse(await renderAdminKingdomRankingsPage(request, env));
      if (url.pathname === "/status") return await renderPublicStatusPage(request, env);
      if (url.pathname === "/admin/diagnostics") return await renderAdminDiagnosticsPage(request, env);
      if (url.pathname === "/admin/mightpulse-probe") return eagleEyeHtmlResponse(await renderMightPulseProbePage(request, env));
      if (url.pathname === "/admin/mightpulse-research") return eagleEyeHtmlResponse(await renderMightPulseResearchPage(request, env));
      if (url.pathname === "/admin/api-pool") return eagleEyeHtmlResponse(await renderApiPoolAdminPage(request, env));
      if (url.pathname === "/api/player/refresh") return await handlePlayerRefresh(request, env);
      if (url.pathname === "/api/player") return await handlePlayerApi(request, env);
      if (url.pathname === "/api/player/history") return await handlePlayerHistoryApi(request, env);
      if (url.pathname === "/api/player/rank-history") return await handlePlayerRankHistoryApi(request, env);
      if (url.pathname === "/api/player/changes") return await handlePlayerChangesApi(request, env);
      if (url.pathname === "/players") return eagleEyeHtmlResponse(await renderPlayerSearchPage(request, env));
      if (url.pathname === "/player/history") return eagleEyeHtmlResponse(await renderPlayerHistoryPage(request, env));
      if (url.pathname === "/player/changes") return eagleEyeHtmlResponse(await renderPlayerChangesPage(request, env));
      if (url.pathname === "/player") return eagleEyeHtmlResponse(await renderPlayerPage(request, env));
      return eagleEyeHtmlResponse(await renderHome(request, env));
    } catch (error) {
      console.error("EagleEye request error:", error);
      return json({ ok: false, error: "INTERNAL_ERROR" }, 500);
    }
  }
};

const EAGLEEYE_THEME_CSS = `
<style id="eagleeye-theme">
:root{color-scheme:dark}
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
html[data-eagle-theme="light"] button{background:#f59e0b !important;color:#172033 !important}
html[data-eagle-theme="light"] .search input{background:#fff !important;color:#172033 !important}
html[data-eagle-theme="light"] .table-wrap{border-color:#d6deea !important}
html[data-eagle-theme="light"] th,html[data-eagle-theme="light"] td{border-color:#e2e8f0 !important;color:#172033 !important}
html[data-eagle-theme="light"] th{color:#64748b !important}
html[data-eagle-theme="light"] .field label{color:#334155 !important}
html[data-eagle-theme="light"] .status{background:#ecfdf3 !important;color:#15803d !important}
html[data-eagle-theme="light"] .error{background:#fef2f2 !important;color:#b91c1c !important}
html[data-eagle-theme="light"] .btn.secondary{background:#e2e8f0 !important;color:#172033 !important}
html[data-eagle-theme="light"] .badge{background:#fff7ed !important;color:#b45309 !important}

.eagle-theme-toggle{position:fixed;right:14px;top:14px;z-index:9999;width:42px;height:42px;border:1px solid #475569;border-radius:12px;background:rgba(15,23,42,.92);color:#fff;display:flex;align-items:center;justify-content:center;font-size:19px;line-height:1;cursor:pointer;box-shadow:0 8px 22px rgba(0,0,0,.2);backdrop-filter:blur(8px)}
html[data-eagle-theme="light"] .eagle-theme-toggle{background:#fff;color:#172033;border-color:#cbd5e1}
</style>`;

const EAGLEEYE_THEME_SCRIPT = `
<script id="eagleeye-theme-script">
(function(){
  try {
    var saved=localStorage.getItem("eagleeye-theme");
    var theme=saved==="light"||saved==="dark"?saved:(window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");
    document.documentElement.setAttribute("data-eagle-theme",theme);
    function setup(){
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
        var isLight=document.documentElement.getAttribute("data-eagle-theme")==="light";
        btn.textContent=isLight?"☀️":"🌙";
        btn.setAttribute("aria-label",isLight?"ダークモードに切替":"ライトモードに切替");
        if(existing) existing.style.display="none";
      }
      btn.onclick=function(){
        var next=document.documentElement.getAttribute("data-eagle-theme")==="light"?"dark":"light";
        document.documentElement.setAttribute("data-eagle-theme",next);
        localStorage.setItem("eagleeye-theme",next);
        paint();
      };
      paint();
    }
    if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",setup); else setup();
  } catch(e) {}
})();
</script>`;

function applyEagleEyeTheme(html) {
  if (typeof html !== "string" || !html.includes("<html")) return html;
  if (!html.includes('id="eagleeye-theme"')) html=html.replace("</head>",EAGLEEYE_THEME_CSS+"</head>");
  if (!html.includes('id="eagleeye-theme-script"')) html=html.replace("</body>",EAGLEEYE_THEME_SCRIPT+"</body>");
  return html;
}

function eagleEyeHtmlResponse(html) {
  return new Response(applyEagleEyeTheme(html), { headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" } });
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
  authorize.searchParams.set("scope", "identify");
  authorize.searchParams.set("state", state);

  return new Response(null, {
    status: 302,
    headers: {
      "Location": authorize.toString(),
      "Cache-Control": "no-store"
    }
  });
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
    console.error("Discord token exchange failed:", tokenResponse.status);
    return json({ ok: false, error: "DISCORD_TOKEN_EXCHANGE_FAILED" }, 502);
  }

  const token = await tokenResponse.json();
  const userResponse = await fetch(DISCORD_ME_URL, {
    headers: { Authorization: "Bearer " + token.access_token }
  });

  if (!userResponse.ok) {
    console.error("Discord user lookup failed:", userResponse.status);
    return json({ ok: false, error: "DISCORD_USER_LOOKUP_FAILED" }, 502);
  }

  const discordUser = await userResponse.json();
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
}

async function handleRankingBoardTest(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  const url = new URL(request.url);
  const kid = url.searchParams.get("kid");
  const board = url.searchParams.get("board");
  if (!kid || !board) return json({ ok: false, error: "KID_AND_BOARD_REQUIRED" }, 400);

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
}

async function handleMightPulsePlayerTest(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (auth.status !== "ACTIVE") return json({ ok: false, error: "USER_DISABLED" }, 403);
  if (auth.role !== "ADMIN" && auth.role !== "OWNER") return json({ ok: false, error: "ADMIN_REQUIRED" }, 403);

  const url = new URL(request.url);
  const governorId = url.searchParams.get("governor_id");
  if (!governorId) return json({ ok: false, error: "GOVERNOR_ID_REQUIRED" }, 400);

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
    return new Response(`<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>保存しました - EagleEye</title>
<style>
:root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
.card{text-align:center;padding:32px 28px;border:1px solid #334155;border-radius:16px;background:#162238;box-shadow:0 12px 40px rgba(0,0,0,.25)}
.ok{font-size:42px;margin-bottom:8px}.title{font-size:24px;font-weight:900}.sub{margin-top:8px;color:#94a3b8}
</style>
<meta http-equiv="refresh" content="1;url=/admin/data-retention">
</head><body><div class="card"><div class="ok">✓</div><div class="title">保存しました</div><div class="sub">データ保存期間の設定を更新しました。</div></div></body></html>`, {
      headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" }
    });
  } catch (error) {
    console.error("Data retention settings error:", error);
    return json({ ok: false, error: error?.message || "RETENTION_UPDATE_FAILED" }, 400);
  }
}

async function handleApiPoolKeys(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  try {
    const keys = await listApiPoolKeys(env.DB);
    return json({ ok: true, keys: keys.map(k => ({
      ...k,
      key_fingerprint: k.key_fingerprint ? String(k.key_fingerprint).slice(0, 16) + "…" : null,
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
    const key = await env.DB.prepare("SELECT key_id, status, pool_type FROM api_pool_keys WHERE key_id = ? LIMIT 1").bind(keyId).first();
    if (!key) return json({ ok: false, error: "API_POOL_KEY_NOT_FOUND" }, 404);
    if (key.status === "REVOKED") return json({ ok: false, error: "API_POOL_KEY_REVOKED" }, 409);
    if (key.status === "COOLDOWN") return json({ ok: false, error: "API_POOL_KEY_COOLDOWN" }, 409);

    configureApiPoolEncryption(env.EAGLEEYE_SESSION_SECRET);
    const probeGovernorId = String(env.MIGHTPULSE_HEALTHCHECK_GOVERNOR_ID || "225623582").trim();
    let lease = null;
    try {
      lease = await leaseApiKeyForHealthCheck(env.DB, { keyId, purpose: "API_POOL_HEALTH_CHECK", targetType: "API_KEY", targetId: probeGovernorId });
      const result = await getMightPulsePlayer(env, probeGovernorId, { include: "base", apiKey: lease.api_key });
      await recordApiPoolSuccess(env.DB, {
        keyId: lease.key_id,
        leaseId: lease.lease_id,
      poolType: lease.pool_type,
        endpoint: "/players/:governor_id",
        targetType: "API_KEY",
        targetId: probeGovernorId,
        purpose: "API_POOL_HEALTH_CHECK",
        httpStatus: result.status,
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
          keepAvailable
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
    console.error("API pool health check error:", error);
    return json({ ok: false, error: error?.message || "API_POOL_HEALTH_CHECK_FAILED" }, 400);
  }
}

async function handleApiPoolDelete(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  try {
    const contentType = request.headers.get("content-type") || "";
    let body = {};
    if (contentType.includes("application/json")) body = await request.json();
    else body = Object.fromEntries((await request.formData()).entries());

    const keyId = String(body.key_id || "").trim();
    if (!keyId) return json({ ok: false, error: "KEY_ID_REQUIRED" }, 400);

    const row = await env.DB.prepare(
      "SELECT key_id, status FROM api_pool_keys WHERE key_id = ? LIMIT 1"
    ).bind(keyId).first();
    if (!row) return json({ ok: false, error: "API_POOL_KEY_NOT_FOUND" }, 404);

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
    const result = await getMightPulsePlayer(env, governorId, { include: "base", apiKey: lease.api_key });
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
    return new Response(renderApiPoolTestResult(governorId, payload, guard.auth.role), {
      headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" }
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
        targetType: "PLAYER",
        targetId: governorId,
        purpose: "ADMIN_TEST",
        httpStatus: status,
        errorCode: error?.code || "MIGHTPULSE_REQUEST_FAILED",
        errorMessage: error?.message || null,
        cooldownSeconds: cooldown,
        disable,
        keepAvailable
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
    return new Response(renderApiPoolTestResult(governorId, payload), {
      headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" }
    });
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
    let testPoolType = "SYSTEM_WATCHLIST";
    try {
      lease = await leaseApiKey(env.DB, {
        poolType: testPoolType,
        purpose: "ADMIN_TEST",
        targetType: "KINGDOM",
        targetId: kid
      });
    } catch (error) {
      if (error?.message !== "NO_API_POOL_KEY_AVAILABLE") throw error;
      testPoolType = "SYSTEM_GENERAL";
      lease = await leaseApiKey(env.DB, {
        poolType: testPoolType,
        purpose: "ADMIN_TEST",
        targetType: "KINGDOM",
        targetId: kid
      });
    }
    const startedAt = Date.now();
    const result = await getMightPulseKingdomRanks(env, kid, {
      board,
      limit: 100,
      apiKey: lease.api_key
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
    return new Response(renderApiPoolRankingTestResult(kid, board, response, guard.auth.role), {
      headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" }
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
        endpoint: "/kingdoms/:kid/ranks",
        targetType: "KINGDOM",
        targetId: kid,
        purpose: "ADMIN_TEST",
        httpStatus: status,
        errorCode: error?.code || "MIGHTPULSE_RANKING_REQUEST_FAILED",
        errorMessage: error?.message || null,
        cooldownSeconds: cooldown,
        disable,
        keepAvailable
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
    return new Response(renderApiPoolRankingTestResult(kid, board, response, guard.auth.role), {
      headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" },
      status: responseStatus
    });
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

      if (!["BASIC", "ADVANCED", "ADMIN", "OWNER"].includes(role) ||
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
    if (!["BASIC", "ADVANCED", "ADMIN", "OWNER"].includes(minRole)) {
      return json({ ok: false, error: "INVALID_MIN_ROLE" }, 400);
    }
    if (guard.auth.role === "ADMIN" && minRole === "OWNER") {
      return json({ ok: false, error: "OWNER_SETTING_REQUIRES_OWNER" }, 403);
    }

    const roleRank = { BASIC: 1, ADVANCED: 2, ADMIN: 3, OWNER: 4 };
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
    const minRole = ["BASIC", "ADVANCED", "ADMIN", "OWNER"].includes(String(item.min_role || "").toUpperCase())
      ? String(item.min_role).toUpperCase()
      : "OWNER";
    const options = ["BASIC", "ADVANCED", "ADMIN", "OWNER"].map(role =>
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
    ".badge{position:fixed;top:14px;right:14px;padding:7px 10px;border:1px solid #f59e0b;border-radius:999px;background:#241a08;color:#fbbf24;font-size:11px;font-weight:900;max-width:calc(100vw - 28px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".wrap{max-width:1050px;margin:auto;padding:56px 14px 30px}.back{color:#94a3b8;text-decoration:none}.title{font-size:28px;margin:12px 0 6px}" +
    ".hint{color:#94a3b8;font-size:13px;line-height:1.7}.card{margin-top:16px;padding:16px;border:1px solid #334155;border-radius:14px;background:#162238}" +
    ".card h2{margin:0 0 8px;font-size:19px}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;min-width:0}" +
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
  return "<!DOCTYPE html><html lang='ja'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>EagleEye データ保存期間</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.admin-badge{position:fixed;top:14px;right:14px;z-index:10;padding:7px 10px;border:1px solid #f59e0b;border-radius:999px;background:#241a08;color:#fbbf24;font-size:11px;font-weight:900;letter-spacing:.6px;box-shadow:0 6px 20px rgba(0,0,0,.25)}.wrap{max-width:760px;margin:auto;padding:56px 16px 24px}.back{color:#94a3b8;text-decoration:none}.title{font-size:28px}.card{padding:18px;margin-top:14px;border:1px solid #334155;border-radius:14px;background:#162238}.hint{color:#94a3b8;font-size:13px;line-height:1.7}label{display:block;margin-top:14px}label span{display:block;font-weight:800;font-size:14px}select{width:100%;padding:12px;margin-top:7px;border-radius:9px;border:1px solid #334155;background:#0b1220;color:white}small{display:block;margin-top:5px;color:#94a3b8;line-height:1.5}button{margin-top:18px;padding:13px 17px;border:0;border-radius:9px;background:#f59e0b;color:#111827;font-weight:900;width:100%}.danger{border-color:#7f1d1d}.mono{font-family:ui-monospace,SFMono-Regular,monospace;font-size:12px}</style></head><body><div class='admin-badge'>🔐 ADMIN MODE · " + adminRole + "</div><main class='wrap'><a class='back' href='/admin/api-pool'>← API Pool管理へ戻る</a><h1 class='title'>データ保存期間</h1><div class='card'><b>自動クリーンアップ</b><div class='hint'>毎時の定期処理で古い履歴を少しずつ削除します。現在値・最新状態は維持します。「永久保存」を選ぶと、そのデータ種別は自動削除しません。</div><div class='mono' style='margin-top:10px'>最終設定更新: " + esc(updated) + "</div></div><form method='post' action='/api/admin/data-retention'><div class='card'>" +
    field("api_observations_days","API観測データ","MightPulseの生レスポンス。容量が最も増えやすいデータです。最新の対象データは保持します。") +
    field("player_snapshots_days","プレイヤースナップショット","プレイヤー状態の時系列履歴。") +
    field("ranking_snapshots_days","ランキングスナップショット","王国ランキングの順位・スコア履歴。") +
    field("player_rank_snapshots_days","プレイヤーランキング履歴","プレイヤー個人のランキング情報の履歴。") +
    field("change_events_days","変更イベント","順位変動・戦力変動などEagleEyeが検出した変更履歴。") +
    field("api_pool_usage_days","API Pool使用履歴","APIキーの利用・残量・結果の監査ログ。") +
    "<button type='submit'>保存期間を更新</button></div></form><div class='card'><b>推奨初期値</b><div class='hint'>API観測14日 / プレイヤー90日 / ランキング180日 / プレイヤーランキング180日 / 変更イベント2年 / API Pool使用90日。必要になったら後から延長できます。</div></div></main></body></html>";
}

async function renderApiPoolAdminPage(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return "<!DOCTYPE html><html lang='ja'><body style='background:#0f172a;color:white;font-family:system-ui;padding:32px'><h1>管理者権限が必要です</h1></body></html>";
  const keys = await listApiPoolKeys(env.DB);
  const stats = await getPoolStats(env.DB);
  const rows = keys.map(k => {
    const errorInfo = (k.last_error_code || k.last_error_message)
      ? "<div class='pool-error'><b>" + escapeHtml(k.last_error_code || "ERROR") + "</b>" +
        (k.last_error_message ? "<div>" + escapeHtml(k.last_error_message) + "</div>" : "") +
        (k.last_error_at ? "<small>" + escapeHtml(formatUnix(k.last_error_at)) + "</small>" : "") +
        "</div>"
      : "<span class='muted'>-</span>";
    return "<tr><td>" + escapeHtml(k.pool_type) + "</td><td>" + escapeHtml(k.label || "-") + "</td><td><b>" + escapeHtml(k.status) + "</b>" + errorInfo + "</td><td>" + escapeHtml(k.key_fingerprint ? String(k.key_fingerprint).slice(0,16) + "…" : "-") + "</td><td>" + escapeHtml(k.remaining_minute ?? "-") + "</td><td>" + escapeHtml(formatUnix(k.last_used_at)) + "</td><td>" + (k.status === "REVOKED" ? "-" : "<form method=\"post\" action=\"/api/admin/api-pool/move\" style=\"display:flex;gap:6px;align-items:center\"><input type=\"hidden\" name=\"key_id\" value=\"" + escapeHtml(k.key_id) + "\"><select name=\"pool_type\" style=\"margin:0;padding:7px;width:auto\"><option value=\"SYSTEM_GENERAL\"" + (k.pool_type === "SYSTEM_GENERAL" ? " selected" : "") + ">GENERAL</option><option value=\"SYSTEM_WATCHLIST\"" + (k.pool_type === "SYSTEM_WATCHLIST" ? " selected" : "") + ">WATCHLIST</option></select><button type=\"submit\" style=\"margin:0;padding:7px 9px\">移動</button></form><form method=\"post\" action=\"/api/admin/api-pool/health-check\" style=\"display:inline\" onsubmit=\"return confirm('このキーの接続確認を実行しますか？')\"><input type=\"hidden\" name=\"key_id\" value=\"" + escapeHtml(k.key_id) + "\"><button type=\"submit\" style=\"margin:0;padding:7px 9px;background:#166534;color:#fff\">更新</button></form><form method=\"post\" action=\"/api/admin/api-pool/revoke\" style=\"display:inline\"><input type=\"hidden\" name=\"key_id\" value=\"" + escapeHtml(k.key_id) + "\"><button type=\"submit\" style=\"margin:0;padding:7px 9px;background:#7f1d1d;color:#fff\">無効化</button></form><form method=\"post\" action=\"/api/admin/api-pool/delete\" style=\"display:inline\"><input type=\"hidden\" name=\"key_id\" value=\"" + escapeHtml(k.key_id) + "\"><button type=\"submit\" style=\"margin:0;padding:7px 9px;background:#991b1b;color:#fff\">完全削除</button></form>") + "</td></tr>";
  }).join("");
  const statText = stats.map(s => s.pool_type + ": " + s.status + "=" + s.count).join(" / ");
  const adminRole = guard.auth.role === "OWNER" ? "OWNER" : "ADMIN";
  return "<!DOCTYPE html><html lang='ja'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>EagleEye API Pool</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.admin-badge{position:fixed;top:14px;right:14px;z-index:10;padding:7px 10px;border:1px solid #f59e0b;border-radius:999px;background:#241a08;color:#fbbf24;font-size:11px;font-weight:900;letter-spacing:.6px;box-shadow:0 6px 20px rgba(0,0,0,.25)}.wrap{max-width:900px;margin:auto;padding:56px 16px 24px}.back{color:#94a3b8}.title{font-size:28px}.card{padding:16px;margin-top:14px;border:1px solid #334155;border-radius:14px;background:#162238}.hint{color:#94a3b8;font-size:13px;line-height:1.7}input,select{width:100%;padding:12px;margin-top:7px;border-radius:9px;border:1px solid #334155;background:#0b1220;color:white}button{margin-top:12px;padding:12px 16px;border:0;border-radius:9px;background:#f59e0b;color:#111827;font-weight:900}table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}th,td{text-align:left;padding:9px;border-bottom:1px solid #334155;white-space:nowrap}.muted{color:#64748b}.pool-error{margin-top:6px;padding:7px 8px;border-radius:8px;background:#2a1115;border:1px solid #7f1d1d;color:#fecaca;white-space:normal;max-width:300px;line-height:1.45}.pool-error b{display:block;color:#fca5a5;font-size:11px}.pool-error div{margin-top:2px;color:#fecaca;font-size:11px;overflow-wrap:anywhere}.pool-error small{display:block;margin-top:3px;color:#fda4af;font-size:10px}.scroll{overflow:auto}label{display:block;margin-top:10px;font-size:12px;color:#cbd5e1}</style></head><body><main class='wrap'><a class='back' href='/'>← EagleEye</a><h1 class='title'>API Pool 管理</h1><div class='card'><a href='/admin/data-retention' style='color:#f59e0b;font-weight:900;text-decoration:none'>データ保存期間を管理 →</a><div class='hint'>履歴・生APIデータの自動削除期間を設定できます。</div></div><div class='card'><b>Pool Status</b><div class='hint'>" + escapeHtml(statText || "登録キーなし") + "</div></div><div class='card'><b>APIキー登録</b><div class='hint'>キー本体は保存時に暗号化され、画面には表示しません。</div><form method='post' action='/api/admin/api-pool/add'><label>Pool<select name='pool_type'><option>SYSTEM_GENERAL</option><option>SYSTEM_WATCHLIST</option><option>USER_CONTRIBUTED</option></select></label><label>ラベル<input name='label' placeholder='例: Main Key'></label><label>MightPulse API Key<input name='api_key' type='password' autocomplete='off' required></label><button type='submit'>登録</button></form></div><div class='card'><b>登録済みキー</b><div class='scroll'><table><thead><tr><th>Pool</th><th>Label</th><th>Status</th><th>Fingerprint</th><th>Remaining/min</th><th>Last Used</th><th>操作</th></tr></thead><tbody>" + (rows || "<tr><td colspan='7'>なし</td></tr>") + "</tbody></table></div></div><div class='card'><b>テスト</b><form method='get' action='/api/admin/api-pool/test-player'><label>領主ID<input name='governor_id' id='gid' placeholder='223636495' required></label><button type='submit'>プレイヤーをPool経由で取得</button></form><form method='get' action='/api/admin/api-pool/test-ranking'><label>王国番号（鯖番号）<input name='kid' placeholder='1524' required></label><label>ランキング<select name='board' required><option value='' selected disabled>ランキングを選択</option>" + KINGDOM_RANKING_BOARDS.map(board => "<option value='" + escapeHtml(board) + "'>" + escapeHtml(RANKING_BOARD_LABELS[board] || board) + "</option>").join("") + "</select></label><button type='submit'>王国ランキングをPool経由で取得</button></form></div></main></body></html>";
}

async function fetchThroughWatchlistApiPool(env, {
  path,
  endpoint = path,
  targetType,
  targetId,
  purpose,
  include = null,
  query = null
}) {
  configureApiPoolEncryption(env.EAGLEEYE_SESSION_SECRET);
  let lease = null;
  let poolType = "SYSTEM_WATCHLIST";
  try {
    try {
      lease = await leaseApiKey(env.DB, {
        poolType: "SYSTEM_WATCHLIST",
        purpose,
        targetType,
        targetId
      });
    } catch (error) {
      if (error?.message !== "NO_API_POOL_KEY_AVAILABLE") throw error;
      poolType = "SYSTEM_GENERAL";
      lease = await leaseApiKey(env.DB, {
        poolType,
        purpose,
        targetType,
        targetId
      });
    }

    const result = await mightPulseFetch(env, path, {
      query: query || (include ? { include } : undefined),
      apiKey: lease.api_key
    });

    await recordApiPoolSuccess(env.DB, {
      keyId: lease.key_id,
      leaseId: lease.lease_id,
      poolType: lease.pool_type,
      endpoint,
      targetType,
      targetId,
      purpose,
      httpStatus: result.status,
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

async function fetchKingdomRankingThroughApiPool(env, kid, board, limit, purpose = "KINGDOM_WATCHLIST_RANKING") {
  return fetchThroughWatchlistApiPool(env, {
    path: `/kingdoms/${encodeURIComponent(kid)}/ranks`,
    endpoint: "/kingdoms/:kid/ranks",
    targetType: "KINGDOM",
    targetId: String(kid),
    purpose,
    query: { board, limit }
  });
}

async function fetchPlayerDetailThroughApiPool(env, governorId, purpose = "KINGDOM_WATCHLIST_PLAYER") {
  return fetchThroughWatchlistApiPool(env, {
    path: `/players/${encodeURIComponent(governorId)}`,
    endpoint: "/players/:governor_id",
    targetType: "PLAYER",
    targetId: String(governorId),
    purpose,
    query: { include: "base,heroes,ranks,gov_gear" }
  });
}

async function fetchPlayerThroughApiPool(env, governorId, purpose = "PLAYER_LOOKUP") {
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
  try {
    lease = await leaseApiKey(env.DB, {
      poolType: "SYSTEM_GENERAL",
      purpose,
      targetType: "PLAYER",
      targetId: id
    });

    const result = await getMightPulsePlayer(env, id, {
      include: "base,heroes,ranks,gov_gear",
      apiKey: lease.api_key
    });

    const observationEnvelopeData = observationEnvelope({
      endpoint: "/players/:governor_id",
      httpStatus: result.status,
      raw: result.data,
      sourceObservedAt: getMightPulseSourceTimestamp(result.data)
    });
    const savedObservation = await saveApiObservation(env.DB, observationEnvelopeData);
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
        keepAvailable
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
  if (!governorId) return json({ ok: false, error: "GOVERNOR_ID_REQUIRED" }, 400);
  if (!env.DB) return json({ ok: false, error: "DB_NOT_CONFIGURED" }, 503);

  try {
    let player = await getPlayer(env.DB, governorId);
    let observation = await getLatestPlayerObservation(env.DB, governorId);
    let source = "D1";
    const needsRichProfile = !observation?.payload?.heroes || !observation?.payload?.ranks || !observation?.payload?.gov_gear;

    if (!observation || refresh || needsRichProfile) {
      const fetched = await fetchPlayerThroughApiPool(env, governorId, refresh ? "PLAYER_REFRESH" : "PLAYER_LOOKUP");
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
    const fetched = await fetchPlayerThroughApiPool(env, governorId, "PLAYER_REFRESH");
    const player = await materializePlayer(env.DB, fetched.observation, undefined, env.ARCHIVE, env.HISTORY_STORAGE_MODE);
    const visibilitySettings = await getPlayerVisibilitySettings(env.DB);
    return json({
      ok: true,
      player: filterPlayerForRole(player, auth.role, fetched.observation.payload, visibilitySettings),
      profile: filterPlayerProfileForRole(fetched.observation.payload, auth.role, visibilitySettings),
      refreshed: true,
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
    return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EagleEye Player Search</title></head><body style="background:#0f172a;color:white;font-family:system-ui;padding:32px"><h1>ログインが必要です</h1><a href="/api/auth/discord" style="color:#f59e0b">Discordでログイン</a></body></html>`;
  }

  const url = new URL(request.url);
  const q = String(url.searchParams.get("q") || "").trim();
  let rows = [];

  if (q && env.DB) {
    const like = `%${q}%`;
    const searchResult = await env.DB.prepare(
      `SELECT governor_id, nick_name, kid, power, town_center_level, alliance_name, observed_at
       FROM players
       WHERE governor_id LIKE ?
          OR nick_name LIKE ?
          OR CAST(kid AS TEXT) LIKE ?
          OR alliance_name LIKE ?
       ORDER BY power DESC
       LIMIT 30`
    ).bind(like, like, like, like).all();
    rows = searchResult.results || [];
  }

  const results = rows.map(row => `
    <a class="result" href="/player?governor_id=${encodeURIComponent(row.governor_id)}">
      <div class="result-main">
        <div class="name">${escapeHtml(row.nick_name || "Unknown Player")}</div>
        <div class="sub">領主ID ${escapeHtml(row.governor_id)} · 王国 ${escapeHtml(row.kid ?? "-")}</div>
        <div class="sub">${escapeHtml(row.alliance_name || "同盟なし")}</div>
      </div>
      <div class="power">${escapeHtml(formatNumber(row.power))}</div>
    </a>`).join("");

  const numericGovernorId = /^\d{7,12}$/.test(q);
  const body = q
    ? (rows.length > 0 ? results : (numericGovernorId
      ? `<a class="lookup" href="/player?governor_id=${encodeURIComponent(q)}">領主ID ${escapeHtml(q)} をデータ取得して表示する →</a>`
      : `<div class="empty">該当するプレイヤーが見つかりません。<br><span>領主名・領主ID・王国・同盟名は、EagleEyeに保存済みのデータから検索します。</span></div>`))
    : `<div class="hint">領主名・領主ID・王国・同盟名から検索できます。<br><span>領主IDで検索した領主が未登録でも、EagleEyeが取得して詳細を表示します。</span></div>`;

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EagleEye Player Search</title><style>
  :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:760px;margin:0 auto;padding:28px 18px}.back{color:#94a3b8;text-decoration:none}.eyebrow{margin-top:24px;color:#f59e0b;font-size:11px;font-weight:800;letter-spacing:2px}.title{margin:5px 0 8px;font-size:30px}.desc{color:#94a3b8;margin:0 0 18px}.search{display:flex;gap:8px}.search input{flex:1;min-width:0;padding:14px;border-radius:12px;border:1px solid #334155;background:#0b1220;color:white;font-size:16px}.search button{padding:14px 17px;border:0;border-radius:12px;background:#f59e0b;color:#111827;font-weight:900}.results{margin-top:18px;display:grid;gap:10px}.result{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px;border:1px solid #334155;border-radius:14px;background:#162238;color:white;text-decoration:none}.result:active{transform:translateY(1px)}.name{font-size:17px;font-weight:800;overflow-wrap:anywhere}.sub{margin-top:4px;color:#94a3b8;font-size:12px;overflow-wrap:anywhere}.power{font-weight:900;color:#f59e0b;white-space:nowrap}.hint,.empty,.lookup{margin-top:18px;padding:18px;border:1px solid #334155;border-radius:14px;background:#111c31;color:#94a3b8}.empty{color:#fca5a5}.lookup{display:block;color:#f59e0b;text-decoration:none;font-weight:800}.hint span,.empty span{font-size:12px}
  </style></head><body><main class="wrap"><a class="back" href="/">← EagleEye</a><div class="eyebrow">PLAYER DATABASE</div><h1 class="title">プレイヤー検索</h1><p class="desc">領主名・領主ID・王国・同盟名から検索</p><form class="search" method="get" action="/players" onsubmit="const v=this.q.value.trim();if(/^\d{7,12}$/.test(v)){this.action='/player';this.q.name='governor_id';}return true;"><input name="q" value="${escapeHtml(q)}" placeholder="領主名 / 領主ID / 王国 / 同盟"><button>検索</button></form><div class="results">${body}</div></main></body></html>`;
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
    if (role === "ADVANCED" || role === "ADMIN" || role === "OWNER") return true;
    return !["vip", "x", "y"].includes(String(change.field_name || ""));
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
  const labels = { power:"戦力", town_center_level:"役場", vip:"VIP", x:"X座標", y:"Y座標", kills:"撃破数", online:"オンライン", last_active_at:"最終活動", alliance_aid:"同盟ID", alliance_name:"同盟", alliance_rank:"同盟ランク", alliance_power:"同盟戦力", alliance_count:"同盟人数" };
  return labels[field] || field || "不明";
}

function formatChangeValue(field, value) {
  if (value === null || value === undefined || value === "") return "-";
  if (["power","kills","alliance_power","alliance_count","alliance_aid"].includes(field)) return formatNumber(value);
  if (field === "town_center_level") return formatTownCenterLevel(value);
  if (field === "online") return Number(value) ? "オンライン" : "オフライン";
  if (field === "last_active_at") return formatRelativeActivity(value);
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
    const rows = (result.results || []).map(row => {
      let p = {};
      try { p = filterPlayerForRole(JSON.parse(row.payload_json), auth.role); } catch {}
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
        "最終活動": p.last_active_at, "最終ログイン": p.last_login, "言語": p.language, "役職": p.office,
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
    return new Response(null, { status: 303, headers: { location: result.url, "cache-control": "no-store" } });
  } catch (error) {
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
    let observation = await getLatestPlayerObservation(env.DB, governorId);
    const needsRichProfile = !observation?.payload?.heroes || !observation?.payload?.ranks || !observation?.payload?.gov_gear;

    if (!observation || refresh || needsRichProfile) {
      const fetched = await fetchPlayerThroughApiPool(env, governorId, refresh ? "PLAYER_REFRESH" : "PLAYER_LOOKUP");
      observation = fetched.observation;
    }

    let player = await getPlayer(env.DB, governorId);
    if (!player || String(player.source_observation_id) !== String(observation.observation_id)) {
      player = await materializePlayer(env.DB, observation, player, env.ARCHIVE, env.HISTORY_STORAGE_MODE);
    }

    const visibilitySettings = await getPlayerVisibilitySettings(env.DB);
    const visiblePlayer = filterPlayerForRole(player, auth.role, observation.payload, visibilitySettings);
    const visibleProfile = filterPlayerProfileForRole(observation.payload, auth.role, visibilitySettings);
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
    if (role === "ADVANCED" || role === "ADMIN" || role === "OWNER") return player;
    const visible = { ...player };
    delete visible.vip;
    delete visible.x;
    delete visible.y;
    return visible;
  }
  const visible = { ...player };
  if (!visibilityEnabled(settings, "base_vip", role)) delete visible.vip;
  if (!visibilityEnabled(settings, "base_coordinates", role)) { delete visible.x; delete visible.y; }
  if (!visibilityEnabled(settings, "base_identity", role)) { delete visible.uid; delete visible.governor_id; delete visible.fid; delete visible.nick_name; delete visible.kid; }
  if (!visibilityEnabled(settings, "base_power", role)) { delete visible.power; delete visible.town_center_level; }
  if (!visibilityEnabled(settings, "base_kills", role)) delete visible.kills;
  if (!visibilityEnabled(settings, "base_activity", role)) { delete visible.online; delete visible.last_active_at; delete visible.last_login; }
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
  const noticeHtml = notice ? '<div class="notice">' + esc(notice) + '</div>' : "";
  const content = player ? `
    <div class="hero"><div class="player-identity-main">${p.avatar_url ? '<img class="player-avatar-main" src="' + esc(normalizeProfileAssetUrl(p.avatar_url)) + '" alt="" loading="lazy">': '<span class="player-avatar-main player-avatar-empty">?</span>'}<div><div class="eyebrow">PLAYER PROFILE</div><h1>${esc(p.nick_name || "Unknown Player")}</h1><div class="sub">領主ID ${esc(p.governor_id)}</div><div class="profile-meta">${profile?.language ? '<span>言語：' + esc(formatProfileValue(profile.language)) + '</span>' : ""}${profile?.office ? '<span>役職：' + esc(formatProfileValue(profile.office)) + '</span>' : ""}${profile?.shield_endtime ? '<span>シールド終了：' + esc(formatUnix(profile.shield_endtime)) + '</span>' : ""}${profile?.burn_endtime ? '<span>炎上終了：' + esc(formatUnix(profile.burn_endtime)) + '</span>' : ""}</div>${canExport ? '<a class="section-export hero-export" href="/api/admin/player-export?governor_id=' + encodeURIComponent(governorId) + '&section=profile">スプレッドシート出力</a>' : ""}</div></div><div class="kid">王国 ${esc(p.kid ?? "-")}</div></div>
    <div class="grid">
      ${card("戦力", formatNumber(p.power))}
      ${card("役場", formatTownCenterLevel(p.town_center_level))}
      ${card("VIP", p.vip ?? "-")}
      ${card("撃破数", formatNumber(p.kills))}
      ${card("座標", p.x != null && p.y != null ? `${p.x}, ${p.y}` : "-")}
      ${card("オンライン", p.online ? "オンライン" : "オフライン")}
      ${card("最終活動", formatRelativeActivity(p.last_active_at, p.last_login))}
      ${card("同盟", p.alliance_name || "-")}
    </div>
    ${noticeHtml}
    ${profile?.name_history?.length ? '<section class="profile-section name-history-section"><div class="section-heading"><h2>過去の名前</h2><span class="label">同一領主IDの名称履歴</span></div><div class="name-history-list">' + profile.name_history.map((item, index) => '<div class="name-history-row"><div><strong>' + esc(item.name) + '</strong><span>' + esc(index === 0 ? '現在' : '過去') + '</span></div><small>' + esc(index === 0 ? '現在の名前' : formatUnix(item.first_seen_at) + ' ～ ' + formatUnix(item.last_seen_at)) + '</small></div>').join('') + '</div></section>' : ''}
    ${renderPlayerAdvancedSections(profile, governorId, canExport)}
    <div class="actions"><a class="action primary" href="/player?governor_id=${encodeURIComponent(governorId)}&refresh=1">最新情報を取得</a><button type="button" class="action" id="player-watchlist-toggle" data-governor-id="${esc(governorId)}">☆ ウォッチリスト</button><a class="action" href="/player/history?governor_id=${encodeURIComponent(governorId)}">スナップショット履歴</a><a class="action" href="/player/changes?governor_id=${encodeURIComponent(governorId)}">変更履歴</a></div>
    <div class="meta">
      <div><b>データ鮮度</b> ${freshness.age_seconds != null ? Math.round(freshness.age_seconds / 3600) + "時間前" : "不明"}</div>
      <div><b>データ状態</b> ${freshness.fresh === true ? "最新" : "キャッシュ"}</div>
      <div><b>観測時刻</b> ${formatUnix(p.observed_at)}</div>
    </div>` : `${noticeHtml}<div class="message">${esc(message)}</div>`;

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EagleEye Player</title><style>
  :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:760px;margin:0 auto;padding:28px 18px}.back{color:#94a3b8;text-decoration:none}.hero{margin-top:22px;padding:22px;border:1px solid #334155;border-radius:18px;background:#111c31;display:flex;justify-content:space-between;gap:16px}.eyebrow{color:#f59e0b;font-size:11px;font-weight:800;letter-spacing:2px}.hero h1{margin:5px 0;font-size:26px;overflow-wrap:anywhere}.sub{color:#94a3b8}.profile-language{margin-top:3px;color:#cbd5e1;font-size:11px}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 12px}.section-heading h2{margin:0}.section-export{display:inline-flex;align-items:center;justify-content:center;padding:6px 9px;border:1px solid #475569;border-radius:8px;background:#162238;color:#f59e0b;text-decoration:none;font-size:10px;font-weight:800;white-space:nowrap}.hero-export{margin-top:7px}.kid{font-size:22px;font-weight:900;color:#f59e0b}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:14px}.card{padding:16px;border:1px solid #334155;border-radius:14px;background:#162238}.label{font-size:12px;color:#94a3b8}.value{font-size:19px;font-weight:800;margin-top:5px;overflow-wrap:anywhere}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.action{display:inline-flex;align-items:center;justify-content:center;padding:11px 13px;border:1px solid #334155;border-radius:10px;background:#162238;color:#e2e8f0;text-decoration:none;font-size:13px;font-weight:800}.action.primary{background:#f59e0b;color:#111827;border-color:#f59e0b}.meta{margin-top:14px;padding:15px;border-radius:14px;background:#0b1220;color:#94a3b8;font-size:13px;line-height:1.9}.meta b{color:#e2e8f0}.profile-section{margin-top:14px;padding:16px;border:1px solid #334155;border-radius:14px;background:#111c31}.profile-section h2{margin:0 0 12px;font-size:18px}.alliance-collapsible{padding:0;overflow:hidden}.alliance-collapsible details{width:100%}.alliance-collapsible summary{list-style:none;cursor:pointer;padding:15px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px}.alliance-collapsible summary::-webkit-details-marker{display:none}.alliance-collapsible summary>span:first-child{min-width:0}.alliance-collapsible summary b{display:block;font-size:16px}.alliance-collapsible summary small{display:block;margin-top:3px;color:#94a3b8;font-size:10px}.collapse-mark{width:28px;height:28px;border-radius:9px;background:#162238;color:#f59e0b;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;flex:0 0 28px}.alliance-collapsible details[open] .collapse-mark{transform:rotate(45deg)}.collapse-body{padding:0 16px 16px}.mini-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.mini-card{padding:12px;border-radius:10px;background:#162238;border:1px solid #334155}.mini-card span{display:block;color:#94a3b8;font-size:11px}.mini-card b{display:block;margin-top:4px}.hero-list,.gear-list{display:grid;gap:10px;margin-top:12px}.hero-card,.gear-card{padding:13px;border:1px solid #334155;border-radius:11px;background:#162238}.profile-identity{display:flex;align-items:center;gap:10px}.profile-identity>div{min-width:0}.profile-identity span{display:block;color:#94a3b8;font-size:10px}.profile-identity b{display:block;margin-top:2px;font-size:12px}.profile-avatar{width:42px;height:42px;border-radius:10px;object-fit:cover;background:#0f172a;border:1px solid #475569}.player-identity-main{display:flex;align-items:center;gap:11px;min-width:0}.player-avatar-main{width:48px;height:48px;flex:0 0 48px;border-radius:12px;object-fit:cover;background:#0f172a;border:1px solid #475569}.player-avatar-empty{display:flex;align-items:center;justify-content:center;color:#64748b;font-size:17px}.flag-value{display:flex!important;align-items:center;gap:7px}.alliance-flag{width:24px;height:24px;border-radius:6px;object-fit:cover;background:#0f172a;border:1px solid #475569}.hero-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.hero-title{display:flex;align-items:center;gap:10px;min-width:0}.hero-title>div{min-width:0}.hero-title strong{display:block;font-size:15px;overflow-wrap:anywhere}.hero-icon{width:42px;height:42px;flex:0 0 42px;border-radius:9px;object-fit:cover;background:#0f172a;border:1px solid #475569}.hero-icon-empty{display:flex;align-items:center;justify-content:center;color:#64748b;font-size:16px}.hero-level{margin-top:2px;color:#94a3b8;font-size:11px;font-weight:700}.hero-head span{display:inline-flex;flex:0 0 auto;padding:3px 7px;border-radius:999px;background:#0f172a;color:#94a3b8;font-size:10px;margin:0}.hero-meta{display:block;color:#cbd5e1;font-size:12px;line-height:1.55;margin-top:7px;overflow-wrap:anywhere}.hero-meta:first-of-type{color:#f8fafc;font-weight:700}.detail-list{display:grid;gap:7px;margin-top:10px}.detail-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 10px;border-radius:9px;background:#162238;border:1px solid #334155}.detail-row span{color:#cbd5e1;font-size:12px;min-width:0;overflow-wrap:anywhere}.detail-row b{color:#f8fafc;font-size:12px;white-space:nowrap}.ranking-group-title{margin:14px 0 8px;font-size:13px;color:#f59e0b}.gear-card strong{display:block;font-size:14px}.gear-head{display:flex;align-items:center;gap:10px}.gear-head>div{min-width:0}.gear-icon{width:44px;height:44px;flex:0 0 44px;border-radius:9px;object-fit:cover;background:#0f172a;border:1px solid #475569}.gear-icon-empty{display:flex;align-items:center;justify-content:center;color:#64748b;font-size:16px}.gear-name{margin-top:2px;color:#94a3b8;font-size:10px;overflow-wrap:anywhere}.gear-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:9px}.gear-stat{padding:7px 8px;border-radius:8px;background:#0f172a;color:#94a3b8;font-size:11px;line-height:1.35}.gear-stat b{display:block;color:#e2e8f0;font-size:12px;margin-top:2px;overflow-wrap:anywhere}.gear-gems{margin-top:8px;padding:8px 9px;border-radius:8px;background:#0f172a;color:#94a3b8;font-size:11px;line-height:1.5;overflow-wrap:anywhere}.gear-gems b{color:#e2e8f0}.name-history-list{display:grid;gap:8px}.name-history-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:10px;background:#162238;border:1px solid #334155}.name-history-row strong{display:block;overflow-wrap:anywhere}.name-history-row span{display:inline-block;margin-left:7px;color:#f59e0b;font-size:10px}.name-history-row small{color:#94a3b8;font-size:10px;text-align:right;white-space:nowrap}.message{padding:14px;border:1px solid #334155;border-radius:12px;background:#111c31;color:#cbd5e1}.notice{margin-top:14px;padding:12px 14px;border:1px solid #7f1d1d;border-radius:10px;background:#2a1115;color:#fecaca;font-size:12px;line-height:1.6}.search{margin-top:18px;display:flex;gap:8px}.search input{flex:1;padding:12px;border-radius:10px;border:1px solid #334155;background:#0b1220;color:white}.search button{padding:12px 15px;border:0;border-radius:10px;background:#f59e0b;color:#111827;font-weight:900}@media(max-width:520px){.hero{display:block}.kid{margin-top:12px}.grid{grid-template-columns:1fr}.mini-grid{grid-template-columns:1fr}.gear-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.detail-row{align-items:flex-start}.detail-row b{white-space:normal;text-align:right}}
  </style></head><body><main class="wrap"><a class="back" href="/">← EagleEye</a><form class="search" method="get" action="/player"><input name="governor_id" value="${esc(governorId)}" placeholder="領主ID"><button>検索</button></form>${content}</main><script>
(function(){
  const btn=document.getElementById("player-watchlist-toggle");
  if(!btn)return;
  const gid=btn.dataset.governorId;
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  async function sync(){
    try{
      const r=await fetch("/api/player-watchlist",{cache:"no-store"});const d=await r.json();
      if(!r.ok||!d.ok)return;
      const item=(d.watchlist||[]).find(x=>String(x.governor_id)===String(gid));
      btn.dataset.watching=item?"1":"0";
      btn.textContent=item?(item.enabled?"★ ウォッチ中":"☆ ウォッチ再開"):"☆ ウォッチリスト";
    }catch{}
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
const HERO_GEAR_SLOT_JA = { Helmet: "兜", Gloves: "手袋", Armor: "鎧", Boots: "靴" };
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
function localizeHeroGearSlot(value) { return HERO_GEAR_SLOT_JA[value] || value || "-"; }
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

function renderPlayerAdvancedSections(profile, governorId = "", canExport = false) {
  const exportButton = (section) => canExport && governorId
    ? '<a class="section-export" href="/api/admin/player-export?governor_id=' + encodeURIComponent(governorId) + '&section=' + encodeURIComponent(section) + '">スプレッドシート出力</a>'
    : "";
  const p = profile || {};
  const esc = escapeHtml;
  let html = "";
  const heroes = Array.isArray(p.heroes) ? p.heroes : [];

  if (p.alliance && typeof p.alliance === "object") {
    const a = p.alliance;
    html += '<section class="profile-section alliance-collapsible"><details><summary><span><b>同盟情報</b><small>タップして詳細を表示</small></span><span class="collapse-mark">＋</span></summary><div class="collapse-body"><div class="section-heading"><h2>同盟情報</h2>' + exportButton("alliance") + '</div><div class="mini-grid">';
    if (a.aid) html += '<div class="mini-card"><span>同盟ID</span><b>' + esc(formatProfileValue(a.aid)) + '</b></div>';
    if (a.abbr || a.name) html += '<div class="mini-card"><span>同盟</span><b>' + esc([a.abbr, a.name].filter(Boolean).join(" ")) + '</b></div>';
    if (a.rank !== undefined || a.rank_label) html += '<div class="mini-card"><span>同盟内順位</span><b>' + esc([a.rank_label, a.rank != null ? a.rank + "位" : ""].filter(Boolean).join(" ")) + '</b></div>';
    if (a.power !== undefined) html += '<div class="mini-card"><span>同盟戦力</span><b>' + esc(formatCompactNumber(a.power)) + '</b></div>';
    if (a.count !== undefined) html += '<div class="mini-card"><span>同盟人数</span><b>' + esc(formatProfileValue(a.count)) + '</b></div>';
    if (a.leader_name) html += '<div class="mini-card"><span>盟主</span><b>' + esc(formatProfileValue(a.leader_name)) + '</b></div>';
    if (a.flag_url) {
      const flagUrl = normalizeProfileAssetUrl(a.flag_url);
      html += '<div class="mini-card"><span>同盟旗</span><b class="flag-value"><img class="alliance-flag" src="' + esc(flagUrl) + '" alt="" loading="lazy"><span>表示</span></b></div>';
    }
    html += '</div></div></details></section>';
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
    html += (heroRankings.length ? "</div>" : "") + '<div class="mini-grid"><div class="mini-card"><span>最高レベル（取得データ内）</span><b>Lv.' + esc(maxLevel || "-") + '</b></div><div class="mini-card"><span>取得英雄数</span><b>' + esc(heroes.length) + '</b></div></div><div class="hero-list">';
    heroes.forEach(hero => {
      const gear = Array.isArray(hero.gear) ? hero.gear : [];
      const heroName = localizeHeroName(hero.name || hero.id);
      const heroIconUrl = normalizeProfileAssetUrl(hero.icon);
      html += '<article class="hero-card"><div class="hero-head"><div class="hero-title">' +
        (heroIconUrl ? '<img class="hero-icon" src="' + esc(heroIconUrl) + '" alt="" loading="lazy">' : '<span class="hero-icon hero-icon-empty">?</span>') +
        '<div><strong>' + esc(heroName) + '</strong><div class="hero-level">Lv.' + esc(hero.level ?? "-") + '</div></div></div>' +
        '<span>' + esc(hero.position ? "配置 " + hero.position : "") + '</span></div>' +
        '<div class="hero-meta">' + esc(hero.star_label || ("星" + (hero.star ?? hero.stars ?? "-"))) + ' / 品質 ' + esc(hero.quality ?? "-") + ' / 戦力 ' + esc(formatCompactNumber(hero.power)) + '</div>';
      if (hero.skill_levels) html += '<div class="hero-meta">スキル: ' + esc(hero.skill_levels.map((s, i) => "スキル" + (i + 1) + " Lv." + (s.level ?? "-")).join(" / ")) + '</div>';
      if (hero.exclusive_gear || hero.exclusive_gear_level !== undefined) {
        const eg = hero.exclusive_gear || {};
        html += '<div class="hero-meta">専用装備: ' + esc(localizeExclusiveGearName(eg.name)) + ' Lv.' + esc(hero.exclusive_gear_level ?? eg.level ?? "-") + '</div>';
      }
      if (gear.length) html += '<div class="hero-meta">英雄装備: ' + esc(gear.map(g => localizeHeroGearSlot(g.slot || g.name) + " +" + (g.enhancement_level ?? "-")).join(" / ")) + '</div>';
      html += '</article>';
    });
    html += '</div></section>';
  }

  if (p.ranks && typeof p.ranks === "object") {
    const r = p.ranks;
    html += '<section class="profile-section"><div class="section-heading"><h2>個人ランキング</h2>' + exportButton("rankings") + '</div><div class="mini-grid">';
    [["戦力",r.power,r.power_rank],["撃破数",r.kills,r.kills_rank],["役場",r.town_center_level,r.town_center_rank],["移民スコア",r.migrant_score,r.migrant_rank],["秘境の試練",r.mystic_trial,r.mystic_rank]].forEach(item => {
      if (item[1] !== undefined || item[2] !== undefined) html += '<div class="mini-card"><span>' + esc(item[0]) + '</span><b>' + esc(formatCompactNumber(item[1])) + ' / ' + esc(item[2] ?? "-") + '位</b></div>';
    });
    if (Array.isArray(r.leaderboards) && r.leaderboards.length) {
      html += '</div><h3>その他ランキング</h3><div class="detail-list">';
      for (const board of r.leaderboards) {
        const label = localizeLeaderboardLabel(board);
        const score = board?.score ?? board?.value ?? board?.rank_value;
        const rank = board?.rank ?? board?.ranking;
        html += '<div class="detail-row"><span>' + esc(formatProfileValue(label)) + '</span><b>' + esc(score !== undefined ? formatCompactNumber(score) : "-") + (rank !== undefined ? ' / ' + esc(rank) + '位' : '') + '</b></div>';
      }
      html += '</div>';
    } else {
      html += '</div>';
    }
    html += '</section>';
  }

  if (p.gov_gear && typeof p.gov_gear === "object") {
    const g = p.gov_gear;
    const items = Array.isArray(g.items) ? g.items : [];
    html += '<section class="profile-section"><div class="section-heading"><h2>領主装備</h2>' + exportButton("gov_gear") + '</div><div class="mini-grid"><div class="mini-card"><span>状態</span><b>' + esc(g.hidden ? "非公開" : items.length + "件") + '</b></div></div>';
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

async function getAuthenticatedUser(request, env) {
  const secret = env.EAGLEEYE_SESSION_SECRET;
  const token = parseCookie(request.headers.get("Cookie") || "")[SESSION_COOKIE];
  if (!token || !secret) return null;
  const session = await verifyPayload(token, secret);
  if (!session) return null;

  if (!env.DB) return null;

  try {
    const user = await env.DB.prepare(
      "SELECT user_id, discord_id, role, status FROM users WHERE discord_id = ? LIMIT 1"
    ).bind(session.sub).first();
    return user || null;
  } catch (error) {
    // D1 outage must not turn the public/home page into a 500.
    // Protected routes still fail closed because they require a DB-backed user.
    console.error("authenticated_user_lookup_failed", error?.message || error);
    return null;
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

    return new Response(
      '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gear Icon Debug</title>' +
      '<style>body{margin:0;background:#0f172a;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;padding:20px}.wrap{max-width:1000px;margin:auto}.note{color:#94a3b8}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}.card{background:#1e293b;border:1px solid #334155;border-radius:14px;padding:16px}.card h2{margin:0 0 8px}.card p{font-size:13px;color:#94a3b8;word-break:break-all}.preview{min-height:190px;border:1px dashed #475569;border-radius:10px;background:#020617;display:flex;align-items:center;justify-content:center;position:relative}.preview img{max-width:180px;max-height:180px}.preview .error{display:none;color:#fca5a5;font-size:12px}.preview img:not([src=""]){}</style>' +
      '</head><body><main class="wrap"><h1>領主装備アイコン確認</h1><p class="note">Governor ID: ' + escapeHtml(governorId) + '<br>APIから取得した確認済みiconパスを直接表示しています。MightPulse APIの再取得は行いません。</p><div class="grid">' + cards + '</div></main></body></html>',
      { status: 200, headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" } }
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

      return new Response(
        '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Player Icon Debug</title>' +
        '<style>body{margin:0;background:#0f172a;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;padding:20px}.wrap{max-width:1100px;margin:auto}.note,.muted{color:#94a3b8}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;margin-top:16px}.card{background:#1e293b;border:1px solid #334155;border-radius:14px;padding:16px}.card h2{margin:0 0 12px}.hero-title{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:20px;font-weight:900}.hero-title img{width:64px;height:64px;object-fit:contain;border-radius:10px;background:#020617}.sub{margin-top:12px;padding-top:10px;border-top:1px solid #334155}.row{display:grid;grid-template-columns:110px 56px minmax(0,1fr);gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid #334155}.row img{width:48px;height:48px;object-fit:contain;border-radius:8px;background:#020617}.row code,.sub>code{display:block;margin-top:5px;color:#94a3b8;font-size:11px;word-break:break-all}.row code{grid-column:2 / 4}.missing{display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:8px;background:#0b1220;color:#64748b;font-size:10px}.sub pre{white-space:pre-wrap;overflow:auto;padding:10px;border-radius:8px;background:#0b1220;color:#cbd5e1;font-size:11px}</style>' +
        '</head><body><main class="wrap"><h1>プレイヤーアイコン確認</h1><p class="note">Governor ID: ' + escapeHtml(governorId) + '<br>APIから実際に取得したアイコン関連データを確認します。ここでは表示確認のみで、本番UIは変更しません。</p><div class="grid">' + heroCards + '</div>' + misc + '</main></body></html>',
        { status: 200, headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" } }
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
    return new Response(null,{status:303,headers:{location:result.url,"cache-control":"no-store"}});
  } catch (error) {
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
    "<div class=\"grid\"><a class=\"card\" href=\"/admin/api-pool\"><b>API Pool管理</b><span>APIキー・Pool状態・利用状況・テスト</span></a><a class=\"card\" href=\"/admin/diagnostics\"><b>システムログ</b><span>サービス状態・診断イベント・障害詳細を確認</span></a><a class=\"card\" href=\"/admin/mightpulse-probe\"><b>MightPulse Probe</b><span>cached_at・age_seconds・HTTPヘッダー・時刻候補を比較</span></a><a class=\"card\" href=\"/admin/data-retention\"><b>データ保存期間</b><span>D1履歴の保持期間とR2アーカイブ対象を管理</span></a>" + visibilityLink + "<a class=\"card\" href=\"/players\"><b>プレイヤーDB</b><span>検索・詳細・履歴・変更イベント・必要なデータ更新</span></a><a class=\"card\" href=\"/kingdom-watchlist\"><b>王国ウォッチリスト</b><span>監視対象・ランキング監視・進捗を確認</span></a></div>" +
    "<div class=\"section\"><h2>権限について</h2><div class=\"notice\">ADMINは運用・データ管理を担当します。ユーザーのロール変更、ユーザー停止、ログイン履歴、OWNER監査ログなどのアカウント管理はOWNER CONTROLからOWNERのみが行います。</div></div>" + ownerLink +
    "</main></body></html>";
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
  const result = await env.DB.prepare(`SELECT u.user_id,u.discord_id,u.username,u.global_name,u.avatar,u.role,u.status,u.created_at,u.updated_at,u.last_login_at,COUNT(l.login_id) AS login_count FROM users u LEFT JOIN login_history l ON l.user_id=u.user_id WHERE (?='' OR u.discord_id LIKE ? OR COALESCE(u.username,'') LIKE ? OR COALESCE(u.global_name,'') LIKE ?) GROUP BY u.user_id ORDER BY CASE u.role WHEN 'OWNER' THEN 0 WHEN 'ADMIN' THEN 1 WHEN 'ADVANCED' THEN 2 ELSE 3 END,u.last_login_at DESC LIMIT ?`)
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
  if (!targetUserId || !["BASIC","ADVANCED","ADMIN","OWNER"].includes(role)) return json({ok:false,error:"INVALID_USER_OR_ROLE"},400);
  const target=await env.DB.prepare("SELECT user_id,discord_id,role FROM users WHERE user_id=? LIMIT 1").bind(targetUserId).first();
  if(!target) return json({ok:false,error:"USER_NOT_FOUND"},404);
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
async function renderOwnerAdminPage(request,env){
  const guard=await requireOwner(request,env);
  if(guard.error)return "<!doctype html><html lang='ja'><body style='background:#0f172a;color:white;font-family:system-ui;padding:32px'><h1>OWNER権限が必要です</h1><a href='/' style='color:#f59e0b'>EagleEyeへ戻る</a></body></html>";
  const [users,logs,kingdomCounts,playerCounts]=await Promise.all([
    env.DB.prepare("SELECT u.user_id,u.discord_id,u.username,u.global_name,u.avatar,u.role,u.status,u.created_at,u.last_login_at,COUNT(l.login_id) AS login_count FROM users u LEFT JOIN login_history l ON l.user_id=u.user_id GROUP BY u.user_id ORDER BY CASE u.role WHEN 'OWNER' THEN 0 WHEN 'ADMIN' THEN 1 WHEN 'ADVANCED' THEN 2 ELSE 3 END,u.last_login_at DESC").all(),
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
<div class="card"><h2>管理機能</h2><div class="links"><a class="link" href="/admin/api-pool"><b>API Pool管理</b><span>APIキー・Pool・テスト</span></a><a class="link" href="/admin/diagnostics"><b>システムログ</b><span>サービス状態・診断イベント・障害詳細</span></a><a class="link" href="/admin/kingdom-rankings"><b>王国ランキング</b><span>必要なランキングだけ取得・閲覧・Sheets出力</span></a><a class="link" href="/admin/data-retention"><b>データ保存期間</b><span>D1履歴・R2アーカイブ</span></a><a class="link" href="/admin/player-visibility"><b>データ公開設定</b><span>ロール別公開範囲</span></a><a class="link" href="/players"><b>プレイヤーDB</b><span>検索・詳細・履歴・変更</span></a><a class="link" href="/kingdom-watchlist"><b>王国ウォッチリスト</b><span>監視対象・ランキング</span></a></div></div>
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
    ["BASIC","ADVANCED","ADMIN","OWNER"].forEach(function(role){
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

  const apiPoolCritical = operational.apiPool.totalKeys > 0 && operational.apiPool.availableKeys === 0;
  const watchlistWarning = operational.watchlist.enabled > 0 && operational.watchlist.enabledErrors > 0;
  const usageCritical = ["CRITICAL", "EXHAUSTED"].includes(usage.status);
  const usageWarning = usage.status === "WARNING";
  const state = usageCritical || data.overall === "CRITICAL" || apiPoolCritical
    ? {label:"Service Disruption",tone:"bad",icon:"!",desc:"主要サービス、API Pool、またはCloudflareリソースの一部で障害・上限到達が検知されています。"}
    : usageWarning || data.overall === "DEGRADED" || watchlistWarning
      ? {label:"Some Services Degraded",tone:"warn",icon:"i",desc:"一部のサービス、API Pool、ウォッチリスト、またはCloudflareリソースで注意が必要です。"}
      : {label:"System Operational",tone:"good",icon:"✓",desc:"EagleEyeの監視対象サービス、API Pool、ウォッチリスト、Cloudflareリソースは正常範囲です。"};

  const rows = data.services.map(s => {
    const st = s.status === "SUCCESS" ? {label:"正常",tone:"good",icon:"✓"} : s.status === "FAILED" ? {label:"障害",tone:"bad",icon:"!"} : s.status === "WARNING" ? {label:"注意",tone:"warn",icon:"!"} : {label:"未確認",tone:"neutral",icon:"—"};
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
  const monitoringBudgetLabel = monitoringProfile === "PAID_5USD"
    ? "$5.00 Paid枠・安全上限の最大使用率"
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
    ["MightPulse", "Base URL", Boolean(env.MIGHTPULSE_BASE_URL)],
    ["Discord", "OAuth / Session", Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.EAGLEEYE_SESSION_SECRET)],
    ["Google Sheets Apps Script", "Web App", Boolean(env.GOOGLE_SHEETS_WEBAPP_URL && env.GOOGLE_SHEETS_WEBAPP_SECRET)],
    ["Google Sheets Service Account", "Spreadsheet / Service Account", Boolean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY && env.GOOGLE_SHEETS_SPREADSHEET_ID)],
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
          ` : ""}
          ${monitoringProfile === "PAID_5USD" ? `<div class="resource-head"><div><b>${escapeHtml(monitoringBudgetLabel)}</b><small>監視プロファイル: PAID_5USD · 請求サイクルはCloudflare側を基準</small></div><strong class="${cloudflareUsageLabel(monitoringBudgetState).tone}">${formatPercent(monitoringBudgetPercent)}</strong></div>` : ""}
          ${monitoringProfile === "PAID_5USD" ? `<div class="resource-row"><div><b>推定月額</b><small>基本料金 + 現時点の超過推計 · USD ${monitoringEstimatedCostUsd == null ? "—" : Number(monitoringEstimatedCostUsd).toFixed(4)}</small></div><strong>${formatYen(monitoringEstimatedCostJpy)}</strong></div><div class="resource-row"><div><b>推定超過</b><small>D1 / Workersの現時点請求指標から算出 · USD ${monitoringEstimatedOverageUsd == null ? "—" : Number(monitoringEstimatedOverageUsd).toFixed(4)}</small></div><strong>${formatYen(monitoringEstimatedOverageJpy)}</strong></div><div class="resource-note">円換算: 1 USD = ${monitoringUsdJpyRate == null ? "—" : Number(monitoringUsdJpyRate).toFixed(2)} JPY（表示用）</div>` : ""}
          ${resourceRow("Rows Read", usage.account?.rowsRead, usage.limits?.d1?.rowsRead, usage.account?.rowsReadPercent, usage.account?.rowsReadState)}
          ${resourceRow("Rows Written", usage.account?.rowsWritten, usage.limits?.d1?.rowsWritten, usage.account?.rowsWrittenPercent, usage.account?.rowsWrittenState)}
          <div class="resource-row"><div><b>D1 Storage</b><small>${formatInt(usage.database?.databaseSizeBytes)} / ${formatInt(usage.limits?.d1?.storageBytes)} bytes</small></div><strong class="${cloudflareUsageLabel(usage.database?.storageState).tone}">${formatPercent(usage.database?.storagePercent)} · ${cloudflareUsageLabel(usage.database?.storageState).label}</strong></div>
          <div class="resource-head"><div><b>${monitoringProfile === "PAID_5USD" ? "Workers Paid $5 Included" : "Workers Free Tier"}</b><small>${escapeHtml(usage.workers?.scriptName || "kingshot-data-platform")} · ${monitoringProfile === "PAID_5USD" ? "請求サイクル内" : "当日UTC"}</small></div><span class="state ${usage.workers?.available ? cloudflareUsageLabel(usage.workers.requestsState).tone : "neutral"}">${usage.workers?.available ? cloudflareUsageLabel(usage.workers.requestsState).label : "未確認"}</span></div>
          ${usage.workers?.available ? resourceRow("Worker Requests", usage.workers.requests, usage.limits?.workers?.requestsPerMonth ?? usage.limits?.workers?.requestsPerDay, usage.workers.requestsPercent, usage.workers.requestsState) : ""}
          <div class="resource-head"><div><b>R2 ${monitoringProfile === "PAID_5USD" ? "Included" : "Free Tier"}</b><small>${escapeHtml(usage.r2?.monthStart ? new Date(usage.r2.monthStart).toLocaleDateString("ja-JP") : "—")}〜 · 月次</small></div><span class="state ${usage.r2?.available ? cloudflareUsageLabel(usage.r2.classAState).tone : "neutral"}">${usage.r2?.available ? cloudflareUsageLabel(usage.r2.classAState).label : "未確認"}</span></div>
          ${usage.r2?.available ? resourceRow("Class A Operations", usage.r2.classAOperations, usage.limits?.r2?.classAOperationsPerMonth, usage.r2.classAPercent, usage.r2.classAState) : ""}
          ${usage.r2?.available ? resourceRow("Class B Operations", usage.r2.classBOperations, usage.limits?.r2?.classBOperationsPerMonth, usage.r2.classBPercent, usage.r2.classBState) : ""}
          ${usage.r2?.available ? resourceRow("R2 Storage", usage.r2.storageBytes, usage.limits?.r2?.storageBytes, usage.r2.storagePercent, usage.r2.storageState) : ""}
          <div class="resource-note">${escapeHtml(usage.note || "Cloudflare Analyticsの集計値です。")}</div>
          ${monitoringProfile === "PAID_5USD" ? `<div class="resource-note">PAID_5USD はCloudflare Workers Paidの月次込み枠を基準に、EagleEye側で90%を安全上限として監視します。無料へ戻す場合は <code>CLOUDFLARE_MONITORING_PROFILE=FREE</code> に切り替えて再デプロイすると、従来のFree監視へ戻せます。</div>` : `<div class="resource-note">現在はFree監視プロファイルです。Paid移行時は <code>CLOUDFLARE_MONITORING_PROFILE=PAID_5USD</code> に切り替えます。</div>`}
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
</style></head><body><main class="wrap"><nav class="nav"><a class="back" href="/">‹ EagleEye</a><span class="refresh">60秒ごとに更新</span></nav><section class="hero"><div class="hero-line"><div class="icon ${state.tone}">${state.icon}</div><div><div class="eyebrow">EagleEye System Status</div><h1 class="title">${state.label}</h1></div></div><p class="desc">${state.desc}</p><div class="stats"><div class="stat"><b>${data.counts.healthy}</b><span>正常</span></div><div class="stat"><b>${data.counts.warning}</b><span>注意</span></div><div class="stat"><b>${data.counts.failed}</b><span>障害</span></div><div class="stat"><b>${data.counts.unknown}</b><span>未確認</span></div></div></section>${usageSection}${operationalSection}<section class="section"><h2>サービス状況</h2><div class="card">${rows}</div></section><p class="foot">Cloudflareリソース監視はD1とは独立したGraphQL Analytics APIを使用します。Analyticsの集計には遅延が発生する場合があります。</p>

${canViewDetailedUsage ? `<script>
(function(){
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

async function renderHome(request, env) {
  const configured = Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.EAGLEEYE_SESSION_SECRET);
  const token = parseCookie(request.headers.get("Cookie") || "")[SESSION_COOKIE];
  const session = configured && token ? await verifyPayload(token, env.EAGLEEYE_SESSION_SECRET) : null;

  const auth = session ? await getAuthenticatedUser(request, env) : null;
  const authUi = session
    ? `
      <section class="account">
        <div class="account-avatar">${session.avatar ? `<img src="https://cdn.discordapp.com/avatars/${encodeURIComponent(session.sub)}/${encodeURIComponent(session.avatar)}.png?size=128" alt="">` : "<span>BJ</span>"}</div>
        <div class="account-info">
          <div class="account-label">DISCORD CONNECTED</div>
          <div class="account-name">${escapeHtml(session.global_name || session.username || "Discord User")}</div>
          <div class="account-tag">@${escapeHtml(session.username || "")}</div>
        </div>
        <a class="logout" href="/api/auth/logout">ログアウト</a>
      </section>
      <nav class="nav"><a href="/players">プレイヤー検索</a><a href="/player-watchlist">プレイヤーウォッチリスト</a><a href="/kingdom-watchlist">王国ウォッチリスト</a>${auth && (auth.role === "ADMIN" || auth.role === "OWNER") ? '<a href="/admin">ADMIN CONTROL</a>' : ""}${auth && auth.role === "OWNER" ? '<a href="/owner">OWNER CONTROL</a>' : ""}</nav>`
    : `
      <a class="login" href="/api/auth/discord">Discordでログイン</a>`;

  const note = configured ? "" : '<p class="note">Discord認証はCloudflare側の設定後に有効になります。</p>';

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>KingShot Data Platform — EagleEye</title><style>
  :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;color:white;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.container{text-align:center;padding:32px 24px;max-width:680px;width:100%}h1{font-size:clamp(28px,7vw,42px);line-height:1.15;margin:0 0 12px}.subtitle{font-size:18px;font-weight:800;letter-spacing:5px;color:#f59e0b;margin-bottom:24px;text-transform:uppercase}p{color:#94a3b8;font-size:16px;line-height:1.7}.status{display:inline-block;margin-top:20px;padding:10px 16px;border-radius:999px;background:#1e293b;color:#cbd5e1;font-weight:700;text-decoration:none;border:1px solid #334155}.status:hover{background:#334155}.login,.logout{display:inline-flex;align-items:center;justify-content:center;margin-top:28px;padding:13px 22px;border-radius:10px;color:white;text-decoration:none;font-weight:800}.login{background:#5865f2}.login:active,.logout:active{transform:translateY(1px)}.account{margin:28px auto 0;max-width:460px;padding:18px;display:flex;align-items:center;gap:14px;text-align:left;background:rgba(30,41,59,.78);border:1px solid #334155;border-radius:16px;box-shadow:0 12px 30px rgba(0,0,0,.2)}.account-avatar{width:58px;height:58px;flex:0 0 58px;border-radius:50%;overflow:hidden;background:#1e293b;display:flex;align-items:center;justify-content:center;color:#f59e0b;font-weight:900}.account-avatar img{width:100%;height:100%;object-fit:cover}.account-info{min-width:0;flex:1}.account-label{font-size:11px;letter-spacing:1.5px;color:#86efac;font-weight:800}.account-name{font-size:17px;font-weight:800;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.account-tag{font-size:13px;color:#94a3b8;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.logout{margin:0;padding:10px 14px;background:#334155;border:1px solid #475569;font-size:13px;flex:0 0 auto}.logout:hover{background:#475569}.nav{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:16px}.nav a{padding:10px 13px;border:1px solid #334155;border-radius:10px;background:#162238;color:#e2e8f0;text-decoration:none;font-size:13px;font-weight:800}.note{font-size:13px;margin-top:18px}
  </style></head><body><main class="container"><h1>KingShot Data Platform</h1><div class="subtitle">EagleEye</div><p>KingShotのデータを集約・分析するプラットフォーム</p><a class="status" href="/status">● システム状況を確認</a>${authUi}${note}</main></body></html>`;
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