import { archivePlayerHistoryBatch, listPlayerHistoryFromR2 } from "./r2-archive.js";

let playerIdentityHistorySchemaPromise = null;

async function ensurePlayerIdentityHistorySchema(db) {
  if (playerIdentityHistorySchemaPromise) return playerIdentityHistorySchemaPromise;
  playerIdentityHistorySchemaPromise = (async () => {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS player_identity_history (
        identity_history_id TEXT PRIMARY KEY,
        governor_id TEXT NOT NULL,
        name TEXT NOT NULL,
        first_seen_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        source_observation_id TEXT,
        created_at INTEGER NOT NULL
      )
    `).run();
    await db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_player_identity_history_governor ON player_identity_history (governor_id, first_seen_at ASC)"
    ).run();
    await db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_player_identity_history_name ON player_identity_history (name, governor_id)"
    ).run();
  })();
  try {
    return await playerIdentityHistorySchemaPromise;
  } catch (error) {
    playerIdentityHistorySchemaPromise = null;
    throw error;
  }
}

export async function getLatestPlayerObservation(db, governorId) {
  const row = await db.prepare(
    `SELECT observation_id, observed_at, http_status, payload_json
     FROM api_observations
     WHERE provider = 'MIGHTPULSE'
       AND target_type = 'PLAYER'
       AND target_id = ?
     ORDER BY observed_at DESC
     LIMIT 1`
  ).bind(String(governorId)).first();

  if (!row) return null;

  let payload;
  try {
    payload = JSON.parse(row.payload_json);
  } catch {
    throw new Error("Stored player observation is not valid JSON.");
  }

  return { ...row, payload };
}

export async function materializePlayer(db, observation, existingPlayer = undefined, archiveBucket = null, historyMode = "DUAL") {
  const player = observation?.payload?.player;
  if (!player || typeof player !== "object") {
    throw new Error("MightPulse player payload is missing player data.");
  }

  const alliance = player.alliance || {};
  const existing = existingPlayer !== undefined
    ? existingPlayer
    : await getPlayer(db, String(player.governor_id ?? observation.payload.governor_id));
  const value = (object, key, fallback = null) =>
    Object.prototype.hasOwnProperty.call(object || {}, key) ? object[key] : fallback;
  const allianceValue = (key, fallback = null) =>
    Object.prototype.hasOwnProperty.call(alliance, key) ? alliance[key] : fallback;
  const now = Math.floor(Date.now() / 1000);
  const governorId = String(player.governor_id ?? observation.payload.governor_id);

  await ensurePlayerIdentityHistorySchema(db);
  await savePlayerIdentityHistory(db, existing, player, observation);
  await savePlayerChangeEvents(db, existing, player, observation);

  const materializedPlayer = {
    governor_id: governorId,
    uid: value(player, "uid", existing?.uid),
    fid: value(player, "fid", existing?.fid) != null ? String(value(player, "fid", existing?.fid)) : null,
    nick_name: value(player, "nick_name", existing?.nick_name),
    kid: value(player, "kid", existing?.kid),
    power: value(player, "power", existing?.power),
    town_center_level: value(player, "town_center_level", existing?.town_center_level),
    vip: value(player, "vip", existing?.vip),
    x: value(player, "x", existing?.x),
    y: value(player, "y", existing?.y),
    kills: value(player, "kills", existing?.kills),
    office: value(player, "office", existing?.office),
    online: value(player, "online", existing?.online) ? 1 : 0,
    last_active_at: value(player, "last_active_at", existing?.last_active_at),
    last_login: value(player, "last_login", existing?.last_login),
    avatar_url: value(player, "avatar_url", existing?.avatar_url),
    language: value(player, "language", existing?.language),
    shield_endtime: value(player, "shield_endtime", existing?.shield_endtime),
    burn_endtime: value(player, "burn_endtime", existing?.burn_endtime),
    alliance_aid: allianceValue("aid", existing?.alliance_aid),
    alliance_abbr: allianceValue("abbr", existing?.alliance_abbr),
    alliance_name: allianceValue("name", existing?.alliance_name),
    alliance_rank: allianceValue("rank", existing?.alliance_rank),
    alliance_rank_label: allianceValue("rank_label", existing?.alliance_rank_label),
    alliance_power: allianceValue("power", existing?.alliance_power),
    alliance_count: allianceValue("count", existing?.alliance_count),
    alliance_leader_name: allianceValue("leader_name", existing?.alliance_leader_name),
    observed_at: observation.observed_at,
    source_observation_id: observation.observation_id,
    updated_at: now
  };

  await db.prepare(
    `INSERT INTO players (
      governor_id, uid, fid, nick_name, kid, power, town_center_level, vip,
      x, y, kills, office, online, last_active_at, last_login, avatar_url,
      language, shield_endtime, burn_endtime, alliance_aid, alliance_abbr,
      alliance_name, alliance_rank, alliance_rank_label, alliance_power,
      alliance_count, alliance_leader_name, observed_at, source_observation_id,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(governor_id) DO UPDATE SET
      uid=excluded.uid, fid=excluded.fid, nick_name=excluded.nick_name,
      kid=excluded.kid, power=excluded.power, town_center_level=excluded.town_center_level,
      vip=excluded.vip, x=excluded.x, y=excluded.y, kills=excluded.kills,
      office=excluded.office, online=excluded.online, last_active_at=excluded.last_active_at,
      last_login=excluded.last_login, avatar_url=excluded.avatar_url,
      language=excluded.language, shield_endtime=excluded.shield_endtime,
      burn_endtime=excluded.burn_endtime, alliance_aid=excluded.alliance_aid,
      alliance_abbr=excluded.alliance_abbr, alliance_name=excluded.alliance_name,
      alliance_rank=excluded.alliance_rank, alliance_rank_label=excluded.alliance_rank_label,
      alliance_power=excluded.alliance_power, alliance_count=excluded.alliance_count,
      alliance_leader_name=excluded.alliance_leader_name,
      observed_at=excluded.observed_at, source_observation_id=excluded.source_observation_id,
      updated_at=excluded.updated_at`
  ).bind(
    materializedPlayer.governor_id, materializedPlayer.uid, materializedPlayer.fid,
    materializedPlayer.nick_name, materializedPlayer.kid, materializedPlayer.power,
    materializedPlayer.town_center_level, materializedPlayer.vip, materializedPlayer.x,
    materializedPlayer.y, materializedPlayer.kills, materializedPlayer.office,
    materializedPlayer.online, materializedPlayer.last_active_at, materializedPlayer.last_login,
    materializedPlayer.avatar_url, materializedPlayer.language, materializedPlayer.shield_endtime,
    materializedPlayer.burn_endtime, materializedPlayer.alliance_aid, materializedPlayer.alliance_abbr,
    materializedPlayer.alliance_name, materializedPlayer.alliance_rank,
    materializedPlayer.alliance_rank_label, materializedPlayer.alliance_power,
    materializedPlayer.alliance_count, materializedPlayer.alliance_leader_name,
    materializedPlayer.observed_at, materializedPlayer.source_observation_id, materializedPlayer.updated_at
  ).run();

  const r2Only = String(historyMode || "").toUpperCase() === "R2_ONLY";
  let archived = false;

  if (archiveBucket) {
    try {
      await archivePlayerHistoryBatch(archiveBucket, {
        governorId,
        observationId: observation.observation_id,
        observedAt: observation.observed_at,
        player
      });
      archived = true;
    } catch (error) {
      console.error("player_history_r2_archive_failed", {
        governorId,
        message: error?.message || String(error)
      });
      if (r2Only) console.warn("player_history_d1_fallback", { governorId });
    }
  }

  if (!r2Only || !archived) {
    await db.prepare(
      `INSERT INTO player_snapshots (
        snapshot_id, governor_id, observation_id, observed_at, payload_json
      ) VALUES (?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(), governorId, observation.observation_id,
      observation.observed_at, JSON.stringify(player)
    ).run();
  }

  return materializedPlayer;
}

export async function getPlayerHistory(db, governorId, limit = 30, archiveBucket = null, historyMode = "DUAL") {
  const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const r2Only = String(historyMode || "").toUpperCase() === "R2_ONLY";
  let d1Rows = [];

  if (!r2Only || !archiveBucket) {
    const d1Result = await db.prepare(
      'SELECT snapshot_id, governor_id, observation_id, observed_at, payload_json FROM player_snapshots WHERE governor_id = ? ORDER BY observed_at DESC LIMIT ?'
    ).bind(String(governorId), safeLimit).all();

    d1Rows = (d1Result.results || []).map(row => {
    let payload = {};
    try { payload = JSON.parse(row.payload_json); } catch {}
    const player = payload.player && typeof payload.player === "object" ? payload.player : payload;
    return {
      snapshot_id: row.snapshot_id,
      governor_id: row.governor_id,
      observation_id: row.observation_id,
      observed_at: row.observed_at,
      player,
      profile: payload
    };
  });

  if (!archiveBucket) return d1Rows;

  let r2Rows = [];
  try {
    r2Rows = await listPlayerHistoryFromR2(archiveBucket, {
      governorId: String(governorId),
      limit: safeLimit
    });
  } catch (error) {
    console.error("player_history_r2_read_failed", {
      governorId: String(governorId),
      message: error?.message || String(error)
    });
  }

  // Migration bridge: merge R2 and D1 by observation_id so the API remains
  // complete while historical data is being migrated. D1 remains the fallback.
  const merged = new Map();
  for (const row of [...d1Rows, ...r2Rows.map(row => ({
    snapshot_id: row.observation_id || null,
    governor_id: String(row.governor_id ?? governorId),
    observation_id: row.observation_id ?? null,
    observed_at: row.observed_at,
    player: row.player && typeof row.player === "object" ? row.player : {},
    profile: row.player && typeof row.player === "object" ? { player: row.player } : {}
  }))]) {
    const key = row.observation_id
      ? `observation:${row.observation_id}`
      : `time:${row.observed_at}`;
    if (!merged.has(key)) merged.set(key, row);
  }

  return [...merged.values()]
    .sort((a, b) => Number(b.observed_at) - Number(a.observed_at))
    .slice(0, safeLimit);
}

export async function getPlayerNameHistory(db, governorId, limit = 20)
  if (!db) throw new Error("D1 database binding is not configured.");
  await ensurePlayerIdentityHistorySchema(db);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const result = await db.prepare(
    `SELECT name, first_seen_at, last_seen_at, source_observation_id
     FROM player_identity_history
     WHERE governor_id = ?
     ORDER BY first_seen_at DESC
     LIMIT ?`
  ).bind(String(governorId), safeLimit).all();
  return result.results || [];
}

export async function getPlayer(db, governorId) {
  return db.prepare(
    `SELECT * FROM players WHERE governor_id = ? LIMIT 1`
  ).bind(String(governorId)).first();
}

async function savePlayerIdentityHistory(db, previous, current, observation) {
  const governorId = String(current?.governor_id ?? observation?.payload?.governor_id ?? "");
  const currentName = current?.nick_name == null ? "" : String(current.nick_name).trim();
  if (!governorId || !currentName) return;

  const now = Math.floor(Date.now() / 1000);
  const observedAt = Number(observation?.observed_at) || now;
  const previousName = previous?.nick_name == null ? "" : String(previous.nick_name).trim();

  // First observation: create the initial identity record.
  // Normal observations with the same name cause no D1 write.
  if (!previousName) {
    await db.prepare(
      `INSERT INTO player_identity_history (
        identity_history_id, governor_id, name, first_seen_at, last_seen_at,
        source_observation_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(), governorId, currentName, observedAt, observedAt,
      observation?.observation_id ?? null, now
    ).run();
    return;
  }

  if (previousName === currentName) return;

  // Name transition: close the previous period and open the new one.
  // This intentionally writes only when the identity actually changes.
  await db.prepare(
    `UPDATE player_identity_history
     SET last_seen_at = ?
     WHERE identity_history_id = (
       SELECT identity_history_id
       FROM player_identity_history
       WHERE governor_id = ? AND name = ?
       ORDER BY last_seen_at DESC
       LIMIT 1
     )`
  ).bind(observedAt, governorId, previousName).run();

  await db.prepare(
    `INSERT INTO player_identity_history (
      identity_history_id, governor_id, name, first_seen_at, last_seen_at,
      source_observation_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(), governorId, currentName, observedAt, observedAt,
    observation?.observation_id ?? null, now
  ).run();
}

async function savePlayerChangeEvents(db, previous, current, observation) {
  if (!previous) return;

  const oldValues = {
    power: previous.power ?? null,
    town_center_level: previous.town_center_level ?? null,
    vip: previous.vip ?? null,
    x: previous.x ?? null,
    y: previous.y ?? null,
    kills: previous.kills ?? null,
    online: previous.online ?? null,
    last_active_at: previous.last_active_at ?? null,
    alliance_aid: previous.alliance_aid ?? null,
    alliance_name: previous.alliance_name ?? null,
    alliance_rank: previous.alliance_rank ?? null,
    alliance_power: previous.alliance_power ?? null,
    alliance_count: previous.alliance_count ?? null
  };

  const alliance = current.alliance || {};
  const newValues = {
    power: current.power ?? null,
    town_center_level: current.town_center_level ?? null,
    vip: current.vip ?? null,
    x: current.x ?? null,
    y: current.y ?? null,
    kills: current.kills ?? null,
    online: current.online == null ? null : (current.online ? 1 : 0),
    last_active_at: current.last_active_at ?? null,
    alliance_aid: alliance.aid ?? null,
    alliance_name: alliance.name ?? null,
    alliance_rank: alliance.rank ?? null,
    alliance_power: alliance.power ?? null,
    alliance_count: alliance.count ?? null
  };

  const statements = [];
  for (const field of Object.keys(newValues)) {
    const sourceObject = field.startsWith("alliance_") ? alliance : current;
    const sourceKey = field.startsWith("alliance_") ? field.slice("alliance_".length) : field;
    if (!Object.prototype.hasOwnProperty.call(sourceObject, sourceKey)) continue;

    const oldValue = oldValues[field];
    const newValue = newValues[field];
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue;

    let changeType = "PLAYER_FIELD_CHANGED";
    if (field === "power") changeType = "POWER_CHANGED";
    else if (field === "town_center_level") changeType = "TOWN_CENTER_CHANGED";
    else if (field === "alliance_aid" || field === "alliance_name") changeType = "ALLIANCE_CHANGED";
    else if (field === "x" || field === "y") changeType = "COORDINATES_CHANGED";
    else if (field === "online" || field === "last_active_at") changeType = "ACTIVITY_CHANGED";
    else if (field === "kills") changeType = "KILLS_CHANGED";

    statements.push(db.prepare(
      `INSERT INTO change_events (
        event_id, target_type, target_id, change_type, field_name,
        old_value_json, new_value_json, observation_id, detected_at, created_at
      ) VALUES (?, 'PLAYER', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(),
      String(current.governor_id ?? observation.payload.governor_id),
      changeType,
      field,
      JSON.stringify(oldValue),
      JSON.stringify(newValue),
      observation.observation_id,
      observation.observed_at,
      Math.floor(Date.now() / 1000)
    ));
  }

  for (let offset = 0; offset < statements.length; offset += 50) {
    await db.batch(statements.slice(offset, offset + 50));
  }
}
