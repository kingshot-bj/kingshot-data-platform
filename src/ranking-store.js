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

export async function getLatestKingdomRankings(db, kid, board = null, limit = 100) {
  const params = board ? [Number(kid), String(board), Number(limit)] : [Number(kid), Number(limit)];
  const sql = board
    ? "SELECT * FROM ranking_snapshots WHERE kid = ? AND board = ? ORDER BY observed_at DESC, rank ASC LIMIT ?"
    : "SELECT * FROM ranking_snapshots WHERE kid = ? ORDER BY observed_at DESC, board ASC, rank ASC LIMIT ?";
  const result = await db.prepare(sql).bind(...params).all();
  return result.results || [];
}

export async function getRankingHistory(db, { kid, board, targetId, limit = 50 }) {
  const result = await db.prepare(
    "SELECT * FROM ranking_snapshots WHERE kid = ? AND board = ? AND target_id = ? ORDER BY observed_at DESC LIMIT ?"
  ).bind(Number(kid), String(board), String(targetId), Number(limit)).all();
  return result.results || [];
}

export async function detectRankingChanges(db, { kid, board, observedAt, sourceObservationId = null }) {
  const currentResult = await db.prepare(
    "SELECT target_id, rank, score, target_type FROM ranking_snapshots WHERE kid = ? AND board = ? AND observed_at = ? ORDER BY rank ASC"
  ).bind(Number(kid), String(board), Number(observedAt)).all();
  const current = currentResult.results || [];
  if (!current.length) return [];

  const ids = current.map(row => String(row.target_id));
  const placeholders = ids.map(() => "?").join(",");
  const previousResult = await db.prepare(
    "SELECT target_id, rank, score, observed_at FROM ranking_snapshots WHERE kid = ? AND board = ? AND target_id IN (" + placeholders + ") AND observed_at < ? ORDER BY target_id ASC, observed_at DESC"
  ).bind(Number(kid), String(board), ...ids, Number(observedAt)).all();

  const previousByTarget = new Map();
  for (const row of previousResult.results || []) {
    const id = String(row.target_id);
    if (!previousByTarget.has(id)) previousByTarget.set(id, row);
  }

  const events = [];
  for (const row of current) {
    const prev = previousByTarget.get(String(row.target_id));
    if (!prev) continue;
    if (Number(prev.rank) !== Number(row.rank)) {
      events.push({
        targetType: row.target_type,
        targetId: String(row.target_id),
        changeType: "RANK_CHANGED",
        oldValue: prev.rank,
        newValue: row.rank,
        oldScore: prev.score,
        newScore: row.score,
        observedAt,
        sourceObservationId
      });
    }
  }
  return events;
}
