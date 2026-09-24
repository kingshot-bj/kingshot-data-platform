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

export async function materializePlayer(db, observation) {
  const player = observation?.payload?.player;
  if (!player || typeof player !== "object") {
    throw new Error("MightPulse player payload is missing player data.");
  }

  const alliance = player.alliance || {};
  const now = Math.floor(Date.now() / 1000);
  const governorId = String(player.governor_id ?? observation.payload.governor_id);

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
    governorId, player.uid ?? null, player.fid != null ? String(player.fid) : null,
    player.nick_name ?? null, player.kid ?? null, player.power ?? null,
    player.town_center_level ?? null, player.vip ?? null, player.x ?? null, player.y ?? null,
    player.kills ?? null, player.office ?? null, player.online ? 1 : 0,
    player.last_active_at ?? null, player.last_login ?? null, player.avatar_url ?? null,
    player.language ?? null, player.shield_endtime ?? null, player.burn_endtime ?? null,
    alliance.aid ?? null, alliance.abbr ?? null, alliance.name ?? null, alliance.rank ?? null,
    alliance.rank_label ?? null, alliance.power ?? null, alliance.count ?? null,
    alliance.leader_name ?? null, observation.observed_at, observation.observation_id, now
  ).run();

  await db.prepare(
    `INSERT INTO player_snapshots (
      snapshot_id, governor_id, observation_id, observed_at, payload_json
    ) VALUES (?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(), governorId, observation.observation_id,
    observation.observed_at, JSON.stringify(player)
  ).run();

  return getPlayer(db, governorId);
}

export async function getPlayer(db, governorId) {
  return db.prepare(
    `SELECT * FROM players WHERE governor_id = ? LIMIT 1`
  ).bind(String(governorId)).first();
}
