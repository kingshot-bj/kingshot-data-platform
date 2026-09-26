const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
const DISCORD_ME_URL = "https://discord.com/api/users/@me";
const CALLBACK_PATH = "/api/auth/callback";
const DEFAULT_DISCORD_REDIRECT_URI = "https://kingshot-data-platform.black-jack-kingshot.workers.dev/api/auth/callback";
const SESSION_COOKIE = "eagleeye_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

import { mightPulseFetch, getMightPulsePlayer, getMightPulsePlayerRanks, getMightPulseKingdomRanks, getMightPulseKingdomAllRankings } from "./mightpulse.js";
import { savePlayerRankSnapshot, saveKingdomRankingBoard, getLatestKingdomRankings, getRankingHistory, detectRankingChanges } from "./ranking-store.js";
import { observationEnvelope } from "./mightpulse-normalizer.js";
import { saveApiObservation } from "./api-observations.js";
import { getLatestPlayerObservation, materializePlayer, getPlayer } from "./player-store.js";
import { configureApiPoolEncryption, addApiPoolKey, listApiPoolKeys, leaseApiKey, recordApiPoolSuccess, recordApiPoolFailure, getPoolStats } from "./api-pool.js";
import { getRetentionSettings, updateRetentionSettings, runRetentionCleanup } from "./retention.js";
import { exportToGoogleSheet } from "./google-sheets.js";

async function runDataRetentionJob(env) {
  if (!env.DB) return;
  try {
    const result = await runRetentionCleanup(env.DB, { batchSize: 1000 });
    console.log("data_retention_cleanup_ok", result.deleted);
  } catch (error) {
    console.error("data_retention_cleanup_failed", error?.message || error);
  }
}

const WATCHLIST_LOCK_TTL_SECONDS = 600;

async function acquireKingdomWatchlistLock(env, watchlistId) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS kingdom_watchlist_locks (
      watchlist_id TEXT PRIMARY KEY,
      lock_token TEXT NOT NULL,
      lock_until INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `).run();

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
  { key: "ranks_core", category: "ランキング", label: "主要個人ランキング", description: "戦力・撃破・役場・移民・ミスティック順位" },
  { key: "ranks_leaderboards", category: "ランキング", label: "その他個人ランキング", description: "leaderboards配列" },
  { key: "gov_gear_list", category: "領主装備", label: "領主装備一覧", description: "領主装備のスロット・品質・ティア・星・強化・スコア・戦闘力" },
  { key: "gov_gear_gems", category: "領主装備", label: "領主装備の宝石", description: "装着宝石のスロット・ID" }
];

async function ensurePlayerVisibilityTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS player_visibility_settings (
      item_key TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      label TEXT NOT NULL,
      description TEXT,
      basic_enabled INTEGER NOT NULL DEFAULT 0,
      advanced_enabled INTEGER NOT NULL DEFAULT 0,
      admin_enabled INTEGER NOT NULL DEFAULT 1,
      owner_enabled INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL,
      updated_by TEXT
    )
  `).run();

  const now = Math.floor(Date.now() / 1000);
  for (const item of PLAYER_VISIBILITY_ITEMS) {
    const defaults = {
      basic_enabled: ["base_identity","base_power","base_kills","base_activity","alliance_identity"].includes(item.key) ? 1 : 0,
      advanced_enabled: 1,
      admin_enabled: 1,
      owner_enabled: 1
    };
    await db.prepare(`
      INSERT INTO player_visibility_settings
        (item_key, category, label, description, basic_enabled, advanced_enabled, admin_enabled, owner_enabled, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(item_key) DO NOTHING
    `).bind(item.key, item.category, item.label, item.description, defaults.basic_enabled, defaults.advanced_enabled, defaults.admin_enabled, defaults.owner_enabled, now).run();
  }
}

async function getPlayerVisibilitySettings(db) {
  await ensurePlayerVisibilityTable(db);
  const result = await db.prepare(
    "SELECT item_key, category, label, description, basic_enabled, advanced_enabled, admin_enabled, owner_enabled, updated_at, updated_by FROM player_visibility_settings ORDER BY rowid"
  ).all();
  return result.results || [];
}

function visibilityEnabled(settings, itemKey, role) {
  const row = (settings || []).find(item => item.item_key === itemKey);
  if (!row) return role === "OWNER";
  const column = role === "OWNER" ? "owner_enabled" : role === "ADMIN" ? "admin_enabled" : role === "ADVANCED" ? "advanced_enabled" : "basic_enabled";
  return Number(row[column]) === 1;
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
const WATCHLIST_RANKING_BATCH = 8;
const WATCHLIST_PLAYER_BATCH = 8;

async function runKingdomWatchlistJobs(env) {
  if (!env.DB) return;
  const now = Math.floor(Date.now() / 1000);
  const rows = await env.DB.prepare(
    "SELECT watchlist_id, kid, top_n, interval_hours, last_run_at FROM kingdom_watchlists WHERE enabled = 1 ORDER BY created_at ASC"
  ).all();

  for (const row of rows.results || []) {
    const due = !row.last_run_at || now - Number(row.last_run_at) >= Number(row.interval_hours) * 3600;
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
          "INSERT INTO kingdom_watchlist_jobs (job_id, watchlist_id, kid, top_n, status, board_index, player_cursor, player_ids_json, observed_at, ranking_rows, player_rows, created_at, updated_at) VALUES (?, ?, ?, ?, 'RANKINGS', 0, 0, '[]', ?, 0, 0, ?, ?)"
        ).bind(jobId, row.watchlist_id, Number(row.kid), Number(row.top_n), now, now, now).run();
        job = await env.DB.prepare("SELECT * FROM kingdom_watchlist_jobs WHERE job_id = ?").bind(jobId).first();
      }

      try {
        const result = await processKingdomWatchlistJob(env, job);
        if (result.completed) {
          await env.DB.prepare(
            "UPDATE kingdom_watchlists SET last_run_at = ?, last_success_at = ?, last_error = NULL, updated_at = ? WHERE watchlist_id = ?"
          ).bind(now, now, now, row.watchlist_id).run();
        } else {
          await env.DB.prepare(
            "UPDATE kingdom_watchlists SET last_error = NULL, updated_at = ? WHERE watchlist_id = ?"
          ).bind(now, row.watchlist_id).run();
        }
        console.log("kingdom_watchlist_job_progress", row.watchlist_id, result);
      } catch (error) {
        await env.DB.prepare(
          "UPDATE kingdom_watchlist_jobs SET status = ?, last_error = ?, updated_at = ? WHERE job_id = ?"
        ).bind(job.status === "PLAYERS" ? "PLAYERS" : "RANKINGS", String(error?.message || error).slice(0, 1000), now, job.job_id).run();
        await env.DB.prepare(
          "UPDATE kingdom_watchlists SET last_error = ?, updated_at = ? WHERE watchlist_id = ?"
        ).bind(String(error?.message || error).slice(0, 1000), now, row.watchlist_id).run();
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
    const endIndex = Math.min(startIndex + WATCHLIST_RANKING_BATCH, KINGDOM_RANKING_BOARDS.length);
    let rankingRows = Number(job.ranking_rows || 0);

    for (let i = startIndex; i < endIndex; i++) {
      const board = KINGDOM_RANKING_BOARDS[i];
      const fetched = await fetchKingdomRankingThroughApiPool(
        env, job.kid, board, WATCHLIST_RANKING_LIMIT, "KINGDOM_WATCHLIST_RANKING"
      );
      const payload = fetched.result?.data;
      const entries = Array.isArray(payload?.rankings)
        ? payload.rankings
        : Array.isArray(payload?.entries)
          ? payload.entries
          : Array.isArray(payload?.data)
            ? payload.data
            : [];

      rankingRows += await saveKingdomRankingBoard(env.DB, {
        kid: job.kid,
        board,
        entries,
        observedAt: job.observed_at
      });

      const rankingChanges = await detectRankingChanges(env.DB, {
        kid: job.kid,
        board,
        observedAt: job.observed_at
      });

      if (rankingChanges.length) {
        await env.DB.batch(rankingChanges.map(change => env.DB.prepare(
          "INSERT INTO change_events (event_id, target_type, target_id, change_type, field_name, old_value_json, new_value_json, observation_id, detected_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(
          crypto.randomUUID(), change.targetType, change.targetId, change.changeType, "rank",
          JSON.stringify(change.oldValue), JSON.stringify(change.newValue),
          change.sourceObservationId, change.observedAt, now
        )));
      }
    }

    if (endIndex < KINGDOM_RANKING_BOARDS.length) {
      await env.DB.prepare(
        "UPDATE kingdom_watchlist_jobs SET board_index = ?, ranking_rows = ?, updated_at = ? WHERE job_id = ?"
      ).bind(endIndex, rankingRows, now, job.job_id).run();
      return { completed: false, phase: "RANKINGS", board_index: endIndex, rankingRows };
    }

    const playerRows = await env.DB.prepare(
      "SELECT DISTINCT governor_id FROM ranking_snapshots WHERE kid = ? AND observed_at = ? AND target_type = 'PLAYER' AND board = 'personal_power' AND rank <= ? AND governor_id IS NOT NULL ORDER BY rank ASC, governor_id"
    ).bind(Number(job.kid), Number(job.observed_at), Number(job.top_n)).all();
    const playerIds = (playerRows.results || []).map(row => String(row.governor_id));

    await env.DB.prepare(
      "UPDATE kingdom_watchlist_jobs SET status = 'PLAYERS', board_index = ?, player_cursor = 0, player_ids_json = ?, ranking_rows = ?, updated_at = ? WHERE job_id = ?"
    ).bind(KINGDOM_RANKING_BOARDS.length, JSON.stringify(playerIds), rankingRows, now, job.job_id).run();

    return { completed: false, phase: "PLAYERS", playerCount: playerIds.length, rankingRows };
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
    for (const item of fetchedPlayers) {
      if (item.error) continue;
      const result = item.fetched.result;
      const raw = result?.data?.player || result?.data;
      if (!raw) continue;

      const observationId = crypto.randomUUID();
      const governorId = String(raw.governor_id ?? item.governorId);
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO api_observations (observation_id, provider, endpoint, target_type, target_id, observed_at, http_status, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(
          observationId, "MIGHTPULSE", "/players/" + governorId + "?include=base,heroes,ranks,gov_gear",
          "PLAYER", governorId, job.observed_at, result?.status ?? 200, JSON.stringify(raw), job.observed_at
        ),
        env.DB.prepare(
          "INSERT INTO players (governor_id, uid, fid, nick_name, kid, power, town_center_level, vip, x, y, kills, office, online, last_active_at, last_login, avatar_url, language, shield_endtime, burn_endtime, alliance_aid, alliance_abbr, alliance_name, alliance_rank, alliance_rank_label, alliance_power, alliance_count, alliance_leader_name, observed_at, source_observation_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(governor_id) DO UPDATE SET uid=excluded.uid, fid=excluded.fid, nick_name=excluded.nick_name, kid=excluded.kid, power=excluded.power, town_center_level=excluded.town_center_level, vip=excluded.vip, x=excluded.x, y=excluded.y, kills=excluded.kills, office=excluded.office, online=excluded.online, last_active_at=excluded.last_active_at, last_login=excluded.last_login, avatar_url=excluded.avatar_url, language=excluded.language, shield_endtime=excluded.shield_endtime, burn_endtime=excluded.burn_endtime, alliance_aid=excluded.alliance_aid, alliance_abbr=excluded.alliance_abbr, alliance_name=excluded.alliance_name, alliance_rank=excluded.alliance_rank, alliance_rank_label=excluded.alliance_rank_label, alliance_power=excluded.alliance_power, alliance_count=excluded.alliance_count, alliance_leader_name=excluded.alliance_leader_name, observed_at=excluded.observed_at, source_observation_id=excluded.source_observation_id, updated_at=excluded.updated_at"
        ).bind(
          governorId, raw.uid ?? null, raw.fid != null ? String(raw.fid) : null, raw.nick_name ?? null,
          raw.kid ?? job.kid, raw.power ?? null, raw.town_center_level ?? null, raw.vip ?? null,
          raw.x ?? null, raw.y ?? null, raw.kills ?? null, raw.office ?? null, raw.online ? 1 : 0,
          raw.last_active_at ?? null, raw.last_login ?? null, raw.avatar_url ?? null, raw.language ?? null,
          raw.shield_endtime ?? null, raw.burn_endtime ?? null, raw.alliance?.aid ?? null,
          raw.alliance?.abbr ?? null, raw.alliance?.name ?? null, raw.alliance?.rank ?? null,
          raw.alliance?.rank_label ?? null, raw.alliance?.power ?? null, raw.alliance?.count ?? null,
          raw.alliance?.leader_name ?? null, job.observed_at, observationId, now
        ),
        env.DB.prepare(
          "INSERT INTO player_snapshots (snapshot_id, governor_id, observation_id, observed_at, payload_json) VALUES (?, ?, ?, ?, ?)"
        ).bind(crypto.randomUUID(), governorId, observationId, job.observed_at, JSON.stringify(raw))
      ]);

      const ranks = result?.data?.ranks || raw?.ranks;
      if (ranks && typeof ranks === "object") {
        await savePlayerRankSnapshot(env.DB, {
          governorId, uid: raw.uid ?? null, kid: raw.kid ?? job.kid, ranks,
          observedAt: job.observed_at, sourceObservationId: observationId
        });
      }
      playerRows++;
    }

    const nextCursor = cursor + batchIds.length;
    const completed = nextCursor >= ids.length;
    await env.DB.prepare(
      "UPDATE kingdom_watchlist_jobs SET player_cursor = ?, player_rows = ?, status = ?, completed_at = ?, updated_at = ? WHERE job_id = ?"
    ).bind(nextCursor, playerRows, completed ? "COMPLETED" : "PLAYERS", completed ? now : null, now, job.job_id).run();

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
:root[data-theme="light"]{
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
.rank-row{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px 0;border-top:1px solid color-mix(in srgb,var(--border) 72%,transparent);font-size:13px}
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
  .primary-action{width:100%}.rank-row{grid-template-columns:28px minmax(0,1fr);}.rank-score{grid-column:2;text-align:left;margin-top:-4px}
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
  function jobProgressHtml(w){
    var j=w.job;
    if(!j)return "";
    if(j.status==="COMPLETED"){
      return "<div class='progress ok'><b>✓ 更新完了</b><span>"+(j.completed_at?new Date(j.completed_at*1000).toLocaleString("ja-JP"):"")+"</span></div>";
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
    return "";
  }
  function load(){
    return api("/api/kingdom-watchlist").then(function(d){
      el("list").innerHTML="";
      var ws=d.watchlists||[];
      ws.forEach(function(w){
        var active=isActiveJob(w);
        var card=document.createElement("div"); card.className="card";
        card.innerHTML="<h2>王国 "+esc(w.kid)+"</h2><p>上位"+esc(w.top_n)+"人 <span class='muted'>/</span> "+esc(w.interval_hours)+"時間ごと <span class='muted'>/</span> "+(w.enabled?"<span class='ok'>稼働中</span>":"停止中")+"</p><p class='muted'>最終成功: "+(w.last_success_at?new Date(w.last_success_at*1000).toLocaleString("ja-JP"):"未実行")+"</p>"+jobProgressHtml(w)+(w.last_error?"<p class='error'>エラー: "+esc(w.last_error)+"</p>":"");
        var row=document.createElement("div"); row.className="row";
        var refresh=document.createElement("button"); refresh.textContent=active?"更新中…":"今すぐ更新"; refresh.disabled=active; refresh.onclick=function(){refreshWatch(w.watchlist_id);};
        var view=document.createElement("button"); view.textContent="ランキングを見る"; view.onclick=function(){showData(w.watchlist_id);};
        var toggle=document.createElement("button"); toggle.textContent=w.enabled?"停止":"再開"; toggle.onclick=function(){toggleWatch(w.watchlist_id,!w.enabled);};
        var del=document.createElement("button"); del.textContent="削除"; del.className="danger"; del.onclick=function(){deleteWatch(w.watchlist_id);};
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
      return api("/api/kingdom-watchlist?action=refresh",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({watchlist_id:id})})
        .then(function(d){
          if(d.result && d.result.completed){
            sessionStorage.removeItem("eagleeye_watchlist_running_"+id);
            el("msg").innerHTML="<span class='ok'>更新が完了しました。</span>";
            return load();
          }
          return load().then(function(){ return new Promise(function(resolve){setTimeout(resolve,500);}); }).then(step);
        })
        .catch(function(e){
          running[id]=false;
          if(e.message==="WATCHLIST_REFRESH_IN_PROGRESS" || e.message.indexOf("現在更新中です")>=0){
            return load();
          }
          sessionStorage.removeItem("eagleeye_watchlist_running_"+id);
          el("msg").innerHTML="<span class='error'>更新失敗: "+esc(e.message)+"</span>";
        });
    }
    return step().finally(function(){if(!sessionStorage.getItem("eagleeye_watchlist_running_"+id))running[id]=false;});
  }
  function refreshWatch(id){
    if(running[id])return;
    sessionStorage.setItem("eagleeye_watchlist_running_"+id,"1");
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
          h+='<div class="rank-row"><span class="rank-no">'+esc(r.rank)+'</span><span class="rank-name">'+esc(displayName)+'</span><span class="rank-score">'+esc(formatCompactNumber(r.score))+'</span></div>';
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
  function applyTheme(theme){
    document.documentElement.setAttribute("data-theme",theme);
    var button=el("themeToggle");
    if(button){
      button.textContent=theme==="light"?"🌙":"☀️";
      button.title=theme==="light"?"ダークテーマに切り替え":"ライトテーマに切り替え";
      button.setAttribute("aria-label",button.title);
    }
  }
  var savedTheme=null;
  try{savedTheme=localStorage.getItem("eagleeye_theme");}catch(e){}
  applyTheme(savedTheme==="light"?"light":"dark");
  el("themeToggle").addEventListener("click",function(){
    var next=document.documentElement.getAttribute("data-theme")==="light"?"dark":"light";
    applyTheme(next);
    try{localStorage.setItem("eagleeye_theme",next);}catch(e){}
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
  const history = await getRankingHistory(env.DB, { kid, board, targetId, limit });
  return json({ ok: true, kid, board, target_id: targetId, history });
}

async function handleKingdomWatchlistDataApi(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const url = new URL(request.url);
  const watchlistId = url.searchParams.get("watchlist_id");
  if (!watchlistId) return json({ ok: false, error: "WATCHLIST_ID_REQUIRED" }, 400);

  const watch = await env.DB.prepare(
    "SELECT watchlist_id, kid, top_n, interval_hours, enabled, last_run_at, last_success_at, last_error FROM kingdom_watchlists WHERE watchlist_id = ? AND discord_id = ?"
  ).bind(watchlistId, auth.discord_id).first();
  if (!watch) return json({ ok: false, error: "WATCHLIST_NOT_FOUND" }, 404);

  const board = url.searchParams.get("board");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || watch.top_n), 1), 100);

  let rankings;
  if (board) {
    rankings = await env.DB.prepare(
      "WITH latest AS (SELECT MAX(observed_at) AS observed_at FROM ranking_snapshots WHERE kid = ? AND board = ?) SELECT r.board, r.target_type, r.target_id, r.rank, r.score, r.uid, r.governor_id, r.nick_name, r.aid, COALESCE(r.abbr, (SELECT a.abbr FROM ranking_snapshots a WHERE a.kid = r.kid AND a.board = 'alliance_power' AND a.target_type = 'ALLIANCE' AND a.aid = r.aid ORDER BY a.observed_at DESC LIMIT 1), (SELECT a.abbr FROM ranking_snapshots a WHERE a.kid = r.kid AND a.board = 'alliance_kills' AND a.target_type = 'ALLIANCE' AND a.aid = r.aid ORDER BY a.observed_at DESC LIMIT 1), (SELECT p.alliance_abbr FROM players p WHERE p.governor_id = r.governor_id OR p.governor_id = r.target_id OR p.uid = r.uid OR p.uid = r.target_id LIMIT 1)) AS abbr, r.name, r.observed_at FROM ranking_snapshots r WHERE r.kid = ? AND r.board = ? AND r.observed_at = (SELECT observed_at FROM latest) ORDER BY r.rank ASC LIMIT ?"
    ).bind(watch.kid, board, watch.kid, board, limit).all();
  } else {
    rankings = await env.DB.prepare(
      "WITH latest AS (SELECT board, MAX(observed_at) AS observed_at FROM ranking_snapshots WHERE kid = ? GROUP BY board), ranked AS (SELECT r.board, r.target_type, r.target_id, r.rank, r.score, r.uid, r.governor_id, r.nick_name, r.aid, COALESCE(r.abbr, (SELECT a.abbr FROM ranking_snapshots a WHERE a.kid = r.kid AND a.board = 'alliance_power' AND a.target_type = 'ALLIANCE' AND a.aid = r.aid ORDER BY a.observed_at DESC LIMIT 1), (SELECT a.abbr FROM ranking_snapshots a WHERE a.kid = r.kid AND a.board = 'alliance_kills' AND a.target_type = 'ALLIANCE' AND a.aid = r.aid ORDER BY a.observed_at DESC LIMIT 1), (SELECT p.alliance_abbr FROM players p WHERE p.governor_id = r.governor_id OR p.governor_id = r.target_id OR p.uid = r.uid OR p.uid = r.target_id LIMIT 1)) AS abbr, r.name, r.observed_at, ROW_NUMBER() OVER (PARTITION BY r.board, r.target_type ORDER BY r.rank ASC) AS rn FROM ranking_snapshots r JOIN latest l ON l.board = r.board AND l.observed_at = r.observed_at WHERE r.kid = ?) SELECT board, target_type, target_id, rank, score, uid, governor_id, nick_name, aid, abbr, name, observed_at FROM ranked WHERE rn <= ? ORDER BY board ASC, rank ASC"
    ).bind(watch.kid, watch.kid, limit).all();
  }

  const players = await env.DB.prepare(
    "WITH latest AS (SELECT board, MAX(observed_at) AS observed_at FROM ranking_snapshots WHERE kid = ? AND target_type = 'PLAYER' GROUP BY board), ranked AS (SELECT r.governor_id, r.uid, r.nick_name, r.kid, r.rank, r.board, r.observed_at, ROW_NUMBER() OVER (PARTITION BY r.board ORDER BY r.rank ASC) AS rn FROM ranking_snapshots r JOIN latest l ON l.board = r.board AND l.observed_at = r.observed_at WHERE r.kid = ? AND r.target_type = 'PLAYER' AND r.governor_id IS NOT NULL), top_players AS (SELECT DISTINCT governor_id FROM ranked WHERE rn <= ?), latest_players AS (SELECT p.governor_id, p.uid, p.nick_name, p.kid, p.power, p.town_center_level, p.vip, p.kills, p.x, p.y, p.alliance_abbr, p.alliance_name, p.online, p.last_active_at, p.observed_at FROM players p JOIN top_players t ON t.governor_id = p.governor_id) SELECT * FROM latest_players ORDER BY power DESC, governor_id ASC"
  ).bind(watch.kid, watch.kid, watch.top_n).all();

  const changes = await env.DB.prepare(
    "SELECT governor_id, board, rank, score, observed_at FROM ranking_snapshots WHERE kid = ? AND target_type = 'PLAYER' ORDER BY observed_at DESC LIMIT ?"
  ).bind(watch.kid, Math.min(watch.top_n * 26 * 5, 5000)).all();

  return json({
    ok: true,
    watchlist: watch,
    rankings: rankings.results || [],
    players: players.results || [],
    ranking_observations: changes.results || []
  });
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
      const job = await env.DB.prepare(
        "SELECT job_id, status, board_index, player_cursor, player_ids_json, observed_at, ranking_rows, player_rows, last_error, created_at, updated_at, completed_at FROM kingdom_watchlist_jobs WHERE watchlist_id = ? ORDER BY created_at DESC LIMIT 1"
      ).bind(watch.watchlist_id).first();

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
    const now = Math.floor(Date.now() / 1000);
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO kingdom_watchlists (watchlist_id, discord_id, kid, top_n, interval_hours, enabled, last_run_at, last_success_at, last_error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, NULL, NULL, NULL, ?, ?)"
    ).bind(id, auth.discord_id, kid, topN, intervalHours, now, now).run();
    return json({ ok: true, watchlist_id: id });
  }

  if (request.method === "POST" && action === "refresh") {
    try {
      // The job schema is a D1 migration, but deploy does not automatically apply D1 migrations.
      // Bootstrap it here so an existing production database cannot fail with a generic INTERNAL_ERROR.
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS kingdom_watchlist_jobs (
          job_id TEXT PRIMARY KEY,
          watchlist_id TEXT NOT NULL,
          kid INTEGER NOT NULL,
          top_n INTEGER NOT NULL CHECK (top_n IN (5, 10)),
          status TEXT NOT NULL CHECK (status IN ('RANKINGS', 'PLAYERS', 'COMPLETED', 'FAILED')),
          board_index INTEGER NOT NULL DEFAULT 0,
          player_cursor INTEGER NOT NULL DEFAULT 0,
          player_ids_json TEXT NOT NULL DEFAULT '[]',
          observed_at INTEGER NOT NULL,
          ranking_rows INTEGER NOT NULL DEFAULT 0,
          player_rows INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          completed_at INTEGER
        )
      `).run();
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
            "INSERT INTO kingdom_watchlist_jobs (job_id, watchlist_id, kid, top_n, status, board_index, player_cursor, player_ids_json, observed_at, ranking_rows, player_rows, created_at, updated_at) VALUES (?, ?, ?, ?, 'RANKINGS', 0, 0, '[]', ?, 0, 0, ?, ?)"
          ).bind(jobId, watchlistId, watch.kid, watch.top_n, now, now, now).run();
          job = await env.DB.prepare("SELECT * FROM kingdom_watchlist_jobs WHERE job_id = ?").bind(jobId).first();
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
            "UPDATE kingdom_watchlist_jobs SET last_error = ?, updated_at = ? WHERE job_id = ?"
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
    await env.DB.prepare(
      "UPDATE kingdom_watchlists SET enabled = ?, updated_at = ? WHERE watchlist_id = ? AND discord_id = ?"
    ).bind(enabled, Math.floor(Date.now() / 1000), String(body.watchlist_id || ""), auth.discord_id).run();
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
export default {
  async scheduled(controller, env, ctx) {
    await runKingdomWatchlistJobs(env);
    const minute = new Date(controller.scheduledTime || Date.now()).getUTCMinutes();
    if (minute === 0) await runDataRetentionJob(env);
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
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
      if (url.pathname === "/api/admin/rankings/player") return await handleRankingPlayerTest(request, env);
      if (url.pathname === "/api/admin/rankings/board") return await handleRankingBoardTest(request, env);
      if (url.pathname === "/api/admin/data-retention") return await handleDataRetentionApi(request, env);
      if (url.pathname === "/api/admin/player-visibility") return await handlePlayerVisibilityApi(request, env);
      if (url.pathname === "/api/admin/player-export") return await handlePlayerSectionExport(request, env);
      if (url.pathname === "/api/admin/api-pool/keys") return await handleApiPoolKeys(request, env);
      if (url.pathname === "/api/admin/api-pool/add") return await handleApiPoolAdd(request, env);
      if (url.pathname === "/api/admin/api-pool/move") return await handleApiPoolMove(request, env);
      if (url.pathname === "/api/admin/api-pool/revoke") return await handleApiPoolRevoke(request, env);
      if (url.pathname === "/api/admin/api-pool/delete") return await handleApiPoolDelete(request, env);
      if (url.pathname === "/api/admin/api-pool/test-player") return await handleApiPoolTestPlayer(request, env);
      if (url.pathname === "/admin/data-retention") return eagleEyeHtmlResponse(await renderDataRetentionPage(request, env));
      if (url.pathname === "/admin/player-visibility") return eagleEyeHtmlResponse(await renderPlayerVisibilityPage(request, env));
      if (url.pathname === "/admin/api-pool") return eagleEyeHtmlResponse(await renderApiPoolAdminPage(request, env));
      if (url.pathname === "/api/player/refresh") return await handlePlayerRefresh(request, env);
      if (url.pathname === "/api/player") return await handlePlayerApi(request, env);
      if (url.pathname === "/api/player/history") return await handlePlayerHistoryApi(request, env);
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
    const userResult = await upsertUser(env.DB, discordUser, now);
    if (userResult?.status === "DISABLED") {
      return json({ ok: false, error: "USER_DISABLED" }, 403);
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

async function handleRankingPlayerTest(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  const url = new URL(request.url);
  const governorId = url.searchParams.get("governor_id");
  if (!governorId) return json({ ok: false, error: "GOVERNOR_ID_REQUIRED" }, 400);

  try {
    const result = await getMightPulsePlayerRanks(env, governorId);
    const raw = result.data?.player || result.data;
    const ranks = raw?.ranks || result.data?.ranks;
    if (!ranks) return json({ ok: false, error: "PLAYER_RANKS_MISSING" }, 502);

    const saved = env.DB ? await savePlayerRankSnapshot(env.DB, {
      governorId,
      uid: raw?.uid ?? result.data?.uid ?? null,
      kid: raw?.kid ?? result.data?.kid ?? null,
      ranks,
      observedAt: Math.floor(Date.now() / 1000)
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
    const result = await getMightPulseKingdomRanks(env, kid, { board, limit: 100 });
    const payload = result.data;
    const entries = payload?.rankings || payload?.entries || payload?.data || [];
    const saved = env.DB ? await saveKingdomRankingBoard(env.DB, {
      kid,
      board,
      entries,
      observedAt: Math.floor(Date.now() / 1000)
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
    lease = await leaseApiKey(env.DB, {
      poolType: "SYSTEM_GENERAL",
      purpose: "ADMIN_TEST",
      targetType: "PLAYER",
      targetId: governorId
    });
    const result = await getMightPulsePlayer(env, governorId, { include: "base", apiKey: lease.api_key });
    await recordApiPoolSuccess(env.DB, {
      keyId: lease.key_id,
      leaseId: lease.lease_id,
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
      eagleeye_town_center_display: formatTownCenterLevel(sourceTownCenterLevel)
    };
    if (new URL(request.url).searchParams.get("format") === "json") {
      return json(payload);
    }
    return new Response(renderApiPoolTestResult(governorId, payload), {
      headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" }
    });
  } catch (error) {
    if (lease) {
      const cooldown = error?.status === 429 ? 60 : error?.status >= 500 || error?.code === "MIGHTPULSE_TIMEOUT" ? 15 : 0;
      const disable = error?.status === 401;
      await recordApiPoolFailure(env.DB, {
        keyId: lease.key_id,
        leaseId: lease.lease_id,
        endpoint: "/players/:governor_id",
        targetType: "PLAYER",
        targetId: governorId,
        purpose: "ADMIN_TEST",
        httpStatus: error?.status || 0,
        errorCode: error?.code || "MIGHTPULSE_REQUEST_FAILED",
        errorMessage: error?.message || null,
        cooldownSeconds: cooldown,
        disable
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

function renderApiPoolTestResult(governorId, result) {
  const esc = escapeHtml;
  const ok = result?.ok === true;
  const title = ok ? "API Pool テスト成功" : "API Pool テスト失敗";
  const status = result?.status ?? result?.upstream_status ?? "-";
  const diagnostic = result?.diagnostic || null;
  const sourceDiagnostics = ok
    ? "<div class='detail'><b>元データ確認</b><div class='meta'>MightPulseの役場レベル: " + esc(result?.source_town_center_level ?? "-") + "<br>EagleEye表示: " + esc(result?.eagleeye_town_center_display ?? "-") + "<br>Provider Fresh: " + esc(result?.source_fresh === true ? "YES" : "NO / cached") + "<br>Provider Age: " + esc(result?.source_age_seconds != null ? Math.round(result.source_age_seconds / 3600) + "時間" : "-") + "</div></div>"
    : "";
  const details = diagnostic
    ? "<div class='detail'><b>詳細</b><pre>" + esc(JSON.stringify(diagnostic, null, 2)) + "</pre></div>"
    : "";
  const message = ok
    ? "領主ID " + esc(governorId) + " のデータ取得に成功しました。API Pool → MightPulse の接続は正常です。"
    : "MightPulseへの接続またはAPIリクエストに失敗しました。";
  return "<!DOCTYPE html><html lang='ja'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>" + title + "</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.wrap{max-width:700px;margin:auto;padding:28px 18px}.back{color:#94a3b8;text-decoration:none}.card{margin-top:20px;padding:20px;border:1px solid #334155;border-radius:16px;background:#162238}.status{font-size:20px;font-weight:900}.ok{color:#86efac}.ng{color:#fca5a5}.meta{margin-top:12px;color:#cbd5e1;line-height:1.8}.detail{margin-top:16px}.detail pre{white-space:pre-wrap;overflow:auto;padding:12px;border-radius:10px;background:#0b1220;color:#cbd5e1;font-size:12px}.btn{display:inline-block;margin-top:16px;padding:11px 14px;border-radius:10px;background:#f59e0b;color:#111827;text-decoration:none;font-weight:900}</style></head><body><div class='admin-badge'>🔐 ADMIN MODE · " + adminRole + "</div><main class='wrap'><a class='back' href='/admin/api-pool'>← API Pool管理へ戻る</a><div class='card'><div class='status " + (ok ? "ok" : "ng") + "'>" + title + "</div><div class='meta'>" + message + "<br>HTTP Status: " + esc(status) + (ok ? "" : "<br>対象: 領主ID " + esc(governorId)) + "</div>" + details + "<a class='btn' href='/admin/api-pool'>管理画面へ戻る</a></div></main></body></html>";
}

function parseHeaderNumber(headers, name) {
  const value = headers?.get?.(name);
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function handlePlayerVisibilityApi(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  try {
    if (request.method === "GET") return json({ ok: true, settings: await getPlayerVisibilitySettings(env.DB) });
    if (request.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
    const body = await request.json().catch(() => ({}));
    const itemKey = String(body.item_key || "").trim();
    const role = String(body.role || "").trim().toUpperCase();
    const enabled = body.enabled ? 1 : 0;
    if (!PLAYER_VISIBILITY_ITEMS.some(item => item.key === itemKey)) return json({ ok: false, error: "UNKNOWN_VISIBILITY_ITEM" }, 400);
    if (!["BASIC","ADVANCED","ADMIN","OWNER"].includes(role)) return json({ ok: false, error: "INVALID_ROLE" }, 400);
    if (guard.auth.role === "ADMIN" && role === "OWNER") return json({ ok: false, error: "OWNER_SETTING_REQUIRES_OWNER" }, 403);
    const column = role === "OWNER" ? "owner_enabled" : role === "ADMIN" ? "admin_enabled" : role === "ADVANCED" ? "advanced_enabled" : "basic_enabled";
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare("UPDATE player_visibility_settings SET " + column + " = ?, updated_at = ?, updated_by = ? WHERE item_key = ?").bind(enabled, now, guard.auth.user_id, itemKey).run();
    return json({ ok: true, settings: await getPlayerVisibilitySettings(env.DB) });
  } catch (error) {
    console.error("Player visibility settings error:", error);
    return json({ ok: false, error: error?.message || "PLAYER_VISIBILITY_UPDATE_FAILED" }, 400);
  }
}

async function renderPlayerVisibilityPage(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return "<!DOCTYPE html><html lang='ja'><body style='background:#0f172a;color:white;font-family:system-ui;padding:32px'><h1>管理者権限が必要です</h1></body></html>";
  const settings = await getPlayerVisibilitySettings(env.DB);
  const adminRole = guard.auth.role === "OWNER" ? "OWNER" : "ADMIN";
  const rows = settings.map(item => {
    return "<tr><td><b>" + escapeHtml(item.category) + "</b><br><strong>" + escapeHtml(item.label) + "</strong><br><small>" + escapeHtml(item.description || "") + "</small></td>" +
      ["BASIC","ADVANCED","ADMIN","OWNER"].map(role => {
        const key = role.toLowerCase() + "_enabled";
        const checked = Number(item[key]) === 1 ? " checked" : "";
        const disabled = role === "OWNER" && guard.auth.role === "ADMIN" ? " disabled" : "";
        return "<td class='toggle-cell'><label class='switch'><input type='checkbox' data-item='" + escapeHtml(item.item_key) + "' data-role='" + role + "'" + checked + disabled + "><span></span></label></td>";
      }).join("") + "</tr>";
  }).join("");
  return "<!DOCTYPE html><html lang='ja'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>EagleEye データ公開設定</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.badge{position:fixed;top:14px;right:14px;padding:7px 10px;border:1px solid #f59e0b;border-radius:999px;background:#241a08;color:#fbbf24;font-size:11px;font-weight:900}.wrap{max-width:1050px;margin:auto;padding:56px 14px 30px}.back{color:#94a3b8;text-decoration:none}.title{font-size:28px;margin:12px 0 6px}.hint{color:#94a3b8;font-size:13px;line-height:1.7}.card{margin-top:16px;padding:16px;border:1px solid #334155;border-radius:14px;background:#162238}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;min-width:720px}th,td{padding:11px 9px;border-bottom:1px solid #334155;text-align:left;vertical-align:middle}th:not(:first-child),td:not(:first-child){text-align:center}td small{color:#94a3b8;line-height:1.5}.switch{position:relative;display:inline-block;width:46px;height:26px}.switch input{opacity:0;width:0;height:0}.switch span{position:absolute;inset:0;border-radius:999px;background:#334155;cursor:pointer;transition:.15s}.switch span:before{content:'';position:absolute;width:20px;height:20px;left:3px;top:3px;border-radius:50%;background:#fff;transition:.15s}.switch input:checked+span{background:#f59e0b}.switch input:checked+span:before{transform:translateX(20px)}.switch input:disabled+span{opacity:.45;cursor:not-allowed}.status{margin-top:10px;color:#86efac;font-size:13px}</style></head><body><div class='badge'>🔐 " + adminRole + " · DATA VISIBILITY</div><main class='wrap'><a class='back' href='/'>← EagleEye</a><h1 class='title'>プレイヤーデータ公開設定</h1><div class='hint'>MightPulseから取得・保存するデータと、各ロールに表示するデータを分離しています。ここでは表示権限だけをリアルタイムで変更できます。ADMINはOWNER列を変更できません。</div><div id='status' class='status'></div><div class='card'><div class='scroll'><table><thead><tr><th>項目</th><th>BASIC</th><th>ADVANCED</th><th>ADMIN</th><th>OWNER</th></tr></thead><tbody>" + rows + "</tbody></table></div></div></main><script>(function(){document.querySelectorAll('input[data-item]').forEach(function(input){input.addEventListener('change',function(){var previous=!input.checked;input.disabled=true;fetch('/api/admin/player-visibility',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({item_key:input.getAttribute('data-item'),role:input.getAttribute('data-role'),enabled:input.checked})}).then(function(r){return r.json().then(function(d){if(!r.ok||d.ok===false)throw new Error(d.error||'更新失敗');return d;});}).then(function(){document.getElementById('status').textContent='保存しました。表示権限は即時反映されます。';}).catch(function(e){input.checked=previous;document.getElementById('status').textContent='更新失敗: '+e.message;}).finally(function(){input.disabled=false;});});});}());</script></body></html>";
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
    return "<tr><td>" + escapeHtml(k.pool_type) + "</td><td>" + escapeHtml(k.label || "-") + "</td><td><b>" + escapeHtml(k.status) + "</b>" + errorInfo + "</td><td>" + escapeHtml(k.key_fingerprint ? String(k.key_fingerprint).slice(0,16) + "…" : "-") + "</td><td>" + escapeHtml(k.remaining_minute ?? "-") + "</td><td>" + escapeHtml(formatUnix(k.last_used_at)) + "</td><td>" + (k.status === "REVOKED" ? "-" : "<form method=\"post\" action=\"/api/admin/api-pool/move\" style=\"display:flex;gap:6px;align-items:center\"><input type=\"hidden\" name=\"key_id\" value=\"" + escapeHtml(k.key_id) + "\"><select name=\"pool_type\" style=\"margin:0;padding:7px;width:auto\"><option value=\"SYSTEM_GENERAL\"" + (k.pool_type === "SYSTEM_GENERAL" ? " selected" : "") + ">GENERAL</option><option value=\"SYSTEM_WATCHLIST\"" + (k.pool_type === "SYSTEM_WATCHLIST" ? " selected" : "") + ">WATCHLIST</option></select><button type=\"submit\" style=\"margin:0;padding:7px 9px\">移動</button></form><form method=\"post\" action=\"/api/admin/api-pool/revoke\" style=\"display:inline\"><input type=\"hidden\" name=\"key_id\" value=\"" + escapeHtml(k.key_id) + "\"><button type=\"submit\" style=\"margin:0;padding:7px 9px;background:#7f1d1d;color:#fff\">無効化</button></form><form method=\"post\" action=\"/api/admin/api-pool/delete\" style=\"display:inline\"><input type=\"hidden\" name=\"key_id\" value=\"" + escapeHtml(k.key_id) + "\"><button type=\"submit\" style=\"margin:0;padding:7px 9px;background:#991b1b;color:#fff\">完全削除</button></form>") + "</td></tr>";
  }).join("");
  const statText = stats.map(s => s.pool_type + ": " + s.status + "=" + s.count).join(" / ");
  const adminRole = guard.auth.role === "OWNER" ? "OWNER" : "ADMIN";
  return "<!DOCTYPE html><html lang='ja'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>EagleEye API Pool</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.admin-badge{position:fixed;top:14px;right:14px;z-index:10;padding:7px 10px;border:1px solid #f59e0b;border-radius:999px;background:#241a08;color:#fbbf24;font-size:11px;font-weight:900;letter-spacing:.6px;box-shadow:0 6px 20px rgba(0,0,0,.25)}.wrap{max-width:900px;margin:auto;padding:56px 16px 24px}.back{color:#94a3b8}.title{font-size:28px}.card{padding:16px;margin-top:14px;border:1px solid #334155;border-radius:14px;background:#162238}.hint{color:#94a3b8;font-size:13px;line-height:1.7}input,select{width:100%;padding:12px;margin-top:7px;border-radius:9px;border:1px solid #334155;background:#0b1220;color:white}button{margin-top:12px;padding:12px 16px;border:0;border-radius:9px;background:#f59e0b;color:#111827;font-weight:900}table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}th,td{text-align:left;padding:9px;border-bottom:1px solid #334155;white-space:nowrap}.muted{color:#64748b}.pool-error{margin-top:6px;padding:7px 8px;border-radius:8px;background:#2a1115;border:1px solid #7f1d1d;color:#fecaca;white-space:normal;max-width:300px;line-height:1.45}.pool-error b{display:block;color:#fca5a5;font-size:11px}.pool-error div{margin-top:2px;color:#fecaca;font-size:11px;overflow-wrap:anywhere}.pool-error small{display:block;margin-top:3px;color:#fda4af;font-size:10px}.scroll{overflow:auto}label{display:block;margin-top:10px;font-size:12px;color:#cbd5e1}</style></head><body><main class='wrap'><a class='back' href='/'>← EagleEye</a><h1 class='title'>API Pool 管理</h1><div class='card'><a href='/admin/data-retention' style='color:#f59e0b;font-weight:900;text-decoration:none'>データ保存期間を管理 →</a><div class='hint'>履歴・生APIデータの自動削除期間を設定できます。</div></div><div class='card'><b>Pool Status</b><div class='hint'>" + escapeHtml(statText || "登録キーなし") + "</div></div><div class='card'><b>APIキー登録</b><div class='hint'>キー本体は保存時に暗号化され、画面には表示しません。</div><form method='post' action='/api/admin/api-pool/add'><label>Pool<select name='pool_type'><option>SYSTEM_GENERAL</option><option>SYSTEM_WATCHLIST</option><option>USER_CONTRIBUTED</option></select></label><label>ラベル<input name='label' placeholder='例: Main Key'></label><label>MightPulse API Key<input name='api_key' type='password' autocomplete='off' required></label><button type='submit'>登録</button></form></div><div class='card'><b>登録済みキー</b><div class='scroll'><table><thead><tr><th>Pool</th><th>Label</th><th>Status</th><th>Fingerprint</th><th>Remaining/min</th><th>Last Used</th><th>Pool移動</th></tr></thead><tbody>" + (rows || "<tr><td colspan='7'>なし</td></tr>") + "</tbody></table></div></div><div class='card'><b>テスト</b><form method='get' action='/api/admin/api-pool/test-player'><label>領主ID<input name='governor_id' id='gid' placeholder='223636495' required></label><button type='submit'>Pool経由で取得</button></form></div></main></body></html>";
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
      const cooldown = status === 429 ? 60 : status >= 500 || error?.code === "MIGHTPULSE_TIMEOUT" ? 15 : 0;
      const disable = status === 401;
      const keepAvailable = !disable && cooldown === 0 && (status === 400 || status === 404);
      await recordApiPoolFailure(env.DB, {
        keyId: lease.key_id,
        leaseId: lease.lease_id,
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
      raw: result.data
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
      const cooldown = status === 429 ? 60 : status >= 500 || error?.code === "MIGHTPULSE_TIMEOUT" ? 15 : 0;
      const disable = status === 401;
      const keepAvailable = !disable && cooldown === 0 && (status === 400 || status === 404);
      await recordApiPoolFailure(env.DB, {
        keyId: lease.key_id,
        leaseId: lease.lease_id,
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
      player = await materializePlayer(env.DB, observation);
      source = "MIGHTPULSE";
    } else if (!player || String(player.source_observation_id) !== String(observation.observation_id)) {
      player = await materializePlayer(env.DB, observation);
    }

    const visibilitySettings = await getPlayerVisibilitySettings(env.DB);
    const visiblePlayer = filterPlayerForRole(player, auth.role, observation.payload, visibilitySettings);
    const profile = filterPlayerProfileForRole(observation.payload, auth.role, visibilitySettings);

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
    const player = await materializePlayer(env.DB, fetched.observation);
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
    const result = await env.DB.prepare(
      'SELECT snapshot_id, governor_id, observation_id, observed_at, payload_json FROM player_snapshots WHERE governor_id = ? ORDER BY observed_at DESC LIMIT ?'
    ).bind(governorId, limit).all();
    const snapshots = (result.results || []).map(row => {
      let payload = {};
      try { payload = JSON.parse(row.payload_json); } catch {}
      const player = payload.player && typeof payload.player === "object" ? payload.player : payload;
      return {
        snapshot_id: row.snapshot_id,
        governor_id: row.governor_id,
        observation_id: row.observation_id,
        observed_at: row.observed_at,
        player: filterPlayerForRole(player, auth.role, payload, visibilitySettings),
        profile: filterPlayerProfileForRole(payload, auth.role, visibilitySettings)
      };
    });
    return json({ ok: true, governor_id: governorId, snapshots });
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


function pemToArrayBuffer(pem) {
  const clean = String(pem || "")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\\s+/g, "");
  const binary = atob(clean);
  return Uint8Array.from(binary, ch => ch.charCodeAt(0)).buffer;
}

async function createGoogleServiceAccountAccessToken(env) {
  const email = String(env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim();
  const privateKey = String(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").trim();
  if (!email || !privateKey || !env.GOOGLE_SHEETS_SPREADSHEET_ID) {
    const error = new Error("Google Sheets連携が未設定です。");
    error.code = "GOOGLE_SHEETS_NOT_CONFIGURED";
    throw error;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64urlEncodeText(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64urlEncodeText(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }));
  const unsigned = header + "." + claim;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKey.replace(/\\n/g, "\\n")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  ));
  const assertion = unsigned + "." + base64url(signature);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const error = new Error(data.error_description || data.error || "Google OAuth token取得に失敗しました。");
    error.code = "GOOGLE_AUTH_FAILED";
    error.status = response.status;
    throw error;
  }
  return data.access_token;
}

async function googleSheetsRequest(env, path, options = {}) {
  const accessToken = await createGoogleServiceAccountAccessToken(env);
  const response = await fetch("https://sheets.googleapis.com/v4/spreadsheets/" + path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      authorization: "Bearer " + accessToken,
      "content-type": "application/json"
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || "Google Sheets APIエラー");
    error.code = "GOOGLE_SHEETS_API_FAILED";
    error.status = response.status;
    throw error;
  }
  return data;
}

async function ensureGoogleSheetTab(env, spreadsheetId, title) {
  const spreadsheet = await googleSheetsRequest(env, spreadsheetId + "?fields=sheets(properties(sheetId,title))");
  const existing = (spreadsheet.sheets || []).find(sheet => sheet?.properties?.title === title);
  if (existing) return existing.properties.sheetId;

  const created = await googleSheetsRequest(env, spreadsheetId + ":batchUpdate", {
    method: "POST",
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title } } }]
    })
  });
  return created?.replies?.[0]?.addSheet?.properties?.sheetId;
}

function normalizeSheetCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "object") return flattenCsvValue(value);
  return String(value);
}

async function exportToGoogleSheet(env, { sheetTitle, headers, rows }) {
  const spreadsheetId = String(env.GOOGLE_SHEETS_SPREADSHEET_ID || "").trim();
  if (!spreadsheetId || !env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    const error = new Error("Google Sheets連携が未設定です。");
    error.code = "GOOGLE_SHEETS_NOT_CONFIGURED";
    throw error;
  }

  await ensureGoogleSheetTab(env, spreadsheetId, sheetTitle);

  const headerRange = encodeURIComponent(sheetTitle + "!1:1");
  const existing = await googleSheetsRequest(env, spreadsheetId + "/values/" + headerRange);
  const hasHeader = Array.isArray(existing?.values) && existing.values.length > 0 && existing.values[0].some(v => String(v || "").trim() !== "");

  const values = [];
  if (!hasHeader) values.push(headers.map(normalizeSheetCell));
  for (const row of rows) values.push(headers.map(key => normalizeSheetCell(row?.[key])));

  if (values.length) {
    const range = encodeURIComponent(sheetTitle + "!A1");
    await googleSheetsRequest(env, spreadsheetId + "/values/" + range + ":append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS", {
      method: "POST",
      body: JSON.stringify({ majorDimension: "ROWS", values })
    });
  }

  return {
    spreadsheetId,
    sheetTitle,
    url: "https://docs.google.com/spreadsheets/d/" + encodeURIComponent(spreadsheetId) + "/edit#gid=0"
  };
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
      player = await materializePlayer(env.DB, observation);
    }

    const visibilitySettings = await getPlayerVisibilitySettings(env.DB);
    const visiblePlayer = filterPlayerForRole(player, auth.role, observation.payload, visibilitySettings);
    const visibleProfile = filterPlayerProfileForRole(observation.payload, auth.role, visibilitySettings);
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
    ${renderPlayerAdvancedSections(profile, governorId, canExport)}
    <div class="actions"><a class="action primary" href="/player?governor_id=${encodeURIComponent(governorId)}&refresh=1">最新情報を取得</a><a class="action" href="/player/history?governor_id=${encodeURIComponent(governorId)}">スナップショット履歴</a><a class="action" href="/player/changes?governor_id=${encodeURIComponent(governorId)}">変更履歴</a></div>
    <div class="meta">
      <div><b>データ鮮度</b> ${freshness.age_seconds != null ? Math.round(freshness.age_seconds / 3600) + "時間前" : "不明"}</div>
      <div><b>データ状態</b> ${freshness.fresh === true ? "最新" : "キャッシュ"}</div>
      <div><b>観測時刻</b> ${formatUnix(p.observed_at)}</div>
    </div>` : `${noticeHtml}<div class="message">${esc(message)}</div>`;

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EagleEye Player</title><style>
  :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:760px;margin:0 auto;padding:28px 18px}.back{color:#94a3b8;text-decoration:none}.hero{margin-top:22px;padding:22px;border:1px solid #334155;border-radius:18px;background:#111c31;display:flex;justify-content:space-between;gap:16px}.eyebrow{color:#f59e0b;font-size:11px;font-weight:800;letter-spacing:2px}.hero h1{margin:5px 0;font-size:26px;overflow-wrap:anywhere}.sub{color:#94a3b8}.profile-language{margin-top:3px;color:#cbd5e1;font-size:11px}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 12px}.section-heading h2{margin:0}.section-export{display:inline-flex;align-items:center;justify-content:center;padding:6px 9px;border:1px solid #475569;border-radius:8px;background:#162238;color:#f59e0b;text-decoration:none;font-size:10px;font-weight:800;white-space:nowrap}.hero-export{margin-top:7px}.kid{font-size:22px;font-weight:900;color:#f59e0b}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:14px}.card{padding:16px;border:1px solid #334155;border-radius:14px;background:#162238}.label{font-size:12px;color:#94a3b8}.value{font-size:19px;font-weight:800;margin-top:5px;overflow-wrap:anywhere}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.action{display:inline-flex;align-items:center;justify-content:center;padding:11px 13px;border:1px solid #334155;border-radius:10px;background:#162238;color:#e2e8f0;text-decoration:none;font-size:13px;font-weight:800}.action.primary{background:#f59e0b;color:#111827;border-color:#f59e0b}.meta{margin-top:14px;padding:15px;border-radius:14px;background:#0b1220;color:#94a3b8;font-size:13px;line-height:1.9}.meta b{color:#e2e8f0}.profile-section{margin-top:14px;padding:16px;border:1px solid #334155;border-radius:14px;background:#111c31}.profile-section h2{margin:0 0 12px;font-size:18px}.alliance-collapsible{padding:0;overflow:hidden}.alliance-collapsible details{width:100%}.alliance-collapsible summary{list-style:none;cursor:pointer;padding:15px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px}.alliance-collapsible summary::-webkit-details-marker{display:none}.alliance-collapsible summary>span:first-child{min-width:0}.alliance-collapsible summary b{display:block;font-size:16px}.alliance-collapsible summary small{display:block;margin-top:3px;color:#94a3b8;font-size:10px}.collapse-mark{width:28px;height:28px;border-radius:9px;background:#162238;color:#f59e0b;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;flex:0 0 28px}.alliance-collapsible details[open] .collapse-mark{transform:rotate(45deg)}.collapse-body{padding:0 16px 16px}.mini-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.mini-card{padding:12px;border-radius:10px;background:#162238;border:1px solid #334155}.mini-card span{display:block;color:#94a3b8;font-size:11px}.mini-card b{display:block;margin-top:4px}.hero-list,.gear-list{display:grid;gap:10px;margin-top:12px}.hero-card,.gear-card{padding:13px;border:1px solid #334155;border-radius:11px;background:#162238}.profile-identity{display:flex;align-items:center;gap:10px}.profile-identity>div{min-width:0}.profile-identity span{display:block;color:#94a3b8;font-size:10px}.profile-identity b{display:block;margin-top:2px;font-size:12px}.profile-avatar{width:42px;height:42px;border-radius:10px;object-fit:cover;background:#0f172a;border:1px solid #475569}.player-identity-main{display:flex;align-items:center;gap:11px;min-width:0}.player-avatar-main{width:48px;height:48px;flex:0 0 48px;border-radius:12px;object-fit:cover;background:#0f172a;border:1px solid #475569}.player-avatar-empty{display:flex;align-items:center;justify-content:center;color:#64748b;font-size:17px}.flag-value{display:flex!important;align-items:center;gap:7px}.alliance-flag{width:24px;height:24px;border-radius:6px;object-fit:cover;background:#0f172a;border:1px solid #475569}.hero-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.hero-title{display:flex;align-items:center;gap:10px;min-width:0}.hero-title>div{min-width:0}.hero-title strong{display:block;font-size:15px;overflow-wrap:anywhere}.hero-icon{width:42px;height:42px;flex:0 0 42px;border-radius:9px;object-fit:cover;background:#0f172a;border:1px solid #475569}.hero-icon-empty{display:flex;align-items:center;justify-content:center;color:#64748b;font-size:16px}.hero-level{margin-top:2px;color:#94a3b8;font-size:11px;font-weight:700}.hero-head span{display:inline-flex;flex:0 0 auto;padding:3px 7px;border-radius:999px;background:#0f172a;color:#94a3b8;font-size:10px;margin:0}.hero-meta{display:block;color:#cbd5e1;font-size:12px;line-height:1.55;margin-top:7px;overflow-wrap:anywhere}.hero-meta:first-of-type{color:#f8fafc;font-weight:700}.detail-list{display:grid;gap:7px;margin-top:10px}.detail-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 10px;border-radius:9px;background:#162238;border:1px solid #334155}.detail-row span{color:#cbd5e1;font-size:12px;min-width:0;overflow-wrap:anywhere}.detail-row b{color:#f8fafc;font-size:12px;white-space:nowrap}.ranking-group-title{margin:14px 0 8px;font-size:13px;color:#f59e0b}.gear-card strong{display:block;font-size:14px}.gear-head{display:flex;align-items:center;gap:10px}.gear-head>div{min-width:0}.gear-icon{width:44px;height:44px;flex:0 0 44px;border-radius:9px;object-fit:cover;background:#0f172a;border:1px solid #475569}.gear-icon-empty{display:flex;align-items:center;justify-content:center;color:#64748b;font-size:16px}.gear-name{margin-top:2px;color:#94a3b8;font-size:10px;overflow-wrap:anywhere}.gear-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:9px}.gear-stat{padding:7px 8px;border-radius:8px;background:#0f172a;color:#94a3b8;font-size:11px;line-height:1.35}.gear-stat b{display:block;color:#e2e8f0;font-size:12px;margin-top:2px;overflow-wrap:anywhere}.gear-gems{margin-top:8px;padding:8px 9px;border-radius:8px;background:#0f172a;color:#94a3b8;font-size:11px;line-height:1.5;overflow-wrap:anywhere}.gear-gems b{color:#e2e8f0}.message{padding:14px;border:1px solid #334155;border-radius:12px;background:#111c31;color:#cbd5e1}.notice{margin-top:14px;padding:12px 14px;border:1px solid #7f1d1d;border-radius:10px;background:#2a1115;color:#fecaca;font-size:12px;line-height:1.6}.search{margin-top:18px;display:flex;gap:8px}.search input{flex:1;padding:12px;border-radius:10px;border:1px solid #334155;background:#0b1220;color:white}.search button{padding:12px 15px;border:0;border-radius:10px;background:#f59e0b;color:#111827;font-weight:900}@media(max-width:520px){.hero{display:block}.kid{margin-top:12px}.grid{grid-template-columns:1fr}.mini-grid{grid-template-columns:1fr}.gear-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.detail-row{align-items:flex-start}.detail-row b{white-space:normal;text-align:right}}
  </style></head><body><main class="wrap"><a class="back" href="/">← EagleEye</a><form class="search" method="get" action="/player"><input name="governor_id" value="${esc(governorId)}" placeholder="領主ID"><button>検索</button></form>${content}</main></body></html>`;
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
    `WITH ranked AS (
      SELECT board, rank, score, observed_at,
        ROW_NUMBER() OVER (PARTITION BY board ORDER BY observed_at DESC) AS rn
      FROM ranking_snapshots
      WHERE kid = ? AND target_type = 'PLAYER' AND governor_id = ?
        AND board IN ('single_hero', 'hero_total', 'hero_no_equip', 'hero_equip')
    )
    SELECT board, rank, score, observed_at
    FROM ranked
    WHERE rn = 1
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
    [["戦力",r.power,r.power_rank],["撃破数",r.kills,r.kills_rank],["役場",r.town_center_level,r.town_center_rank],["移民スコア",r.migrant_score,r.migrant_rank],["ミスティック試練",r.mystic_trial,r.mystic_rank]].forEach(item => {
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

  if (!env.DB) return { discord_id: session.sub, status: "ACTIVE", role: "ADMIN" };

  const user = await env.DB.prepare(
    "SELECT user_id, discord_id, role, status FROM users WHERE discord_id = ? LIMIT 1"
  ).bind(session.sub).first();
  return user || null;
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
      <nav class="nav"><a href="/players">プレイヤー検索</a><a href="/kingdom-watchlist">王国ウォッチリスト</a>${auth && (auth.role === "ADMIN" || auth.role === "OWNER") ? '<a href="/admin/api-pool">API Pool管理</a>' : ""}</nav>`
    : `
      <a class="login" href="/api/auth/discord">Discordでログイン</a>`;

  const note = configured ? "" : '<p class="note">Discord認証はCloudflare側の設定後に有効になります。</p>';

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>KingShot Data Platform — EagleEye</title><style>
  :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;color:white;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.container{text-align:center;padding:32px 24px;max-width:680px;width:100%}h1{font-size:clamp(28px,7vw,42px);line-height:1.15;margin:0 0 12px}.subtitle{font-size:18px;font-weight:800;letter-spacing:5px;color:#f59e0b;margin-bottom:24px;text-transform:uppercase}p{color:#94a3b8;font-size:16px;line-height:1.7}.status{display:inline-block;margin-top:20px;padding:10px 16px;border-radius:999px;background:#14532d;color:#86efac;font-weight:700}.login,.logout{display:inline-flex;align-items:center;justify-content:center;margin-top:28px;padding:13px 22px;border-radius:10px;color:white;text-decoration:none;font-weight:800}.login{background:#5865f2}.login:active,.logout:active{transform:translateY(1px)}.account{margin:28px auto 0;max-width:460px;padding:18px;display:flex;align-items:center;gap:14px;text-align:left;background:rgba(30,41,59,.78);border:1px solid #334155;border-radius:16px;box-shadow:0 12px 30px rgba(0,0,0,.2)}.account-avatar{width:58px;height:58px;flex:0 0 58px;border-radius:50%;overflow:hidden;background:#1e293b;display:flex;align-items:center;justify-content:center;color:#f59e0b;font-weight:900}.account-avatar img{width:100%;height:100%;object-fit:cover}.account-info{min-width:0;flex:1}.account-label{font-size:11px;letter-spacing:1.5px;color:#86efac;font-weight:800}.account-name{font-size:17px;font-weight:800;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.account-tag{font-size:13px;color:#94a3b8;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.logout{margin:0;padding:10px 14px;background:#334155;border:1px solid #475569;font-size:13px;flex:0 0 auto}.logout:hover{background:#475569}.nav{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:16px}.nav a{padding:10px 13px;border:1px solid #334155;border-radius:10px;background:#162238;color:#e2e8f0;text-decoration:none;font-size:13px;font-weight:800}.note{font-size:13px;margin-top:18px}
  </style></head><body><main class="container"><h1>KingShot Data Platform</h1><div class="subtitle">EagleEye</div><p>KingShotのデータを集約・分析するプラットフォーム</p><div class="status">● System Online</div>${authUi}${note}</main></body></html>`;
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