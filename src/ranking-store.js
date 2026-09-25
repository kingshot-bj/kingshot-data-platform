const PLAYER_RANK_FIELDS = [
  ["power", "power_rank"],
  ["kills", "kills_rank"],
  ["town_center_level", "town_center_rank"],
  ["migrant_score", "migrant_rank"],
  ["mystic_trial", "mystic_rank"]
];

export async function savePlayerRankSnapshot(db, { governorId, uid = null, kid = null, ranks, observedAt, sourceObservationId = null }) {
  if (!db) throw new Error("D1 database binding is not configured.");
  if (!governorId || !ranks || typeof ranks !== "object") throw new Error("Player ranking snapshot requires governorId and ranks.");
  const id = crypto.randomUUID();
  await db.prepare(
    'INSERT INTO player_rank_snapshots (' +
    'player_rank_snapshot_id, governor_id, uid, kid, power, power_rank, kills, kills_rank, ' +
    'town_center_level, town_center_rank, migrant_score, migrant_rank, mystic_trial, mystic_rank, ' +
    'leaderboards_json, observed_at, source_observation_id, created_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id, String(governorId), uid ?? null, kid ?? null,
    ranks.power ?? null, ranks.power_rank ?? null,
    ranks.kills ?? null, ranks.kills_rank ?? null,
    ranks.town_center_level ?? null, ranks.town_center_rank ?? null,
    ranks.migrant_score ?? null, ranks.migrant_rank ?? null,
    ranks.mystic_trial ?? null, ranks.mystic_rank ?? null,
    JSON.stringify(Array.isArray(ranks.leaderboards) ? ranks.leaderboards : []),
    observedAt, sourceObservationId, observedAt
  ).run();
  return id;
}

export async function saveKingdomRankingBoard(db, { kid, board, entries, observedAt, sourceObservationId = null }) {
  if (!db) throw new Error("D1 database binding is not configured.");
  if (!kid || !board || !Array.isArray(entries)) throw new Error("Kingdom ranking board requires kid, board and entries.");
  const statements = entries.map((entry, index) => {
    const targetType = isAllianceEntry(board, entry) ? "ALLIANCE" : "PLAYER";
    const targetId = targetType === "ALLIANCE"
      ? firstString(entry.aid, entry.id, entry.abbr, `${kid}:${board}:${index}`)
      : firstString(entry.governor_id, entry.governorId, entry.uid, `${kid}:${board}:${index}`);
    return db.prepare(
      'INSERT INTO ranking_snapshots (' +
      'ranking_snapshot_id, kid, board, target_type, target_id, rank, score, uid, governor_id, nick_name, ' +
      'aid, abbr, name, observed_at, source_observation_id, created_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      crypto.randomUUID(), Number(kid), String(board), targetType, String(targetId), index + 1,
      entry.score ?? entry.value ?? null, entry.uid ?? null, entry.governor_id ?? null, entry.nick_name ?? null,
      entry.aid ?? null, entry.abbr ?? null, entry.name ?? null, observedAt, sourceObservationId, observedAt
    );
  });
  if (statements.length) await db.batch(statements);
  return statements.length;
}

function isAllianceEntry(board, entry) {
  return board === "alliance_power" || board === "alliance_kills" || entry?.aid !== undefined || entry?.abbr !== undefined;
}

function firstString(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value);
  }
  return null;
}

export { PLAYER_RANK_FIELDS };