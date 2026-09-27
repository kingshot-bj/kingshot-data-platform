const PLAYER_RANK_FIELDS = [
  ["power", "power_rank"],
  ["kills", "kills_rank"],
  ["town_center_level", "town_center_rank"],
  ["migrant_score", "migrant_rank"],
  ["mystic_trial", "mystic_rank"]
];

export async function savePlayerRankSnapshot(db, { governorId, uid = null, kid = null, ranks, observedAt, sourceObservedAt = null, sourceObservationId = null }) {
  if (!db) throw new Error("D1 database binding is not configured.");
  if (!governorId || !ranks || typeof ranks !== "object") throw new Error("Player ranking snapshot requires governorId and ranks.");
  const id = crypto.randomUUID();
  await db.prepare(
    'INSERT INTO player_rank_snapshots (' +
    'player_rank_snapshot_id, governor_id, uid, kid, power, power_rank, kills, kills_rank, ' +
    'town_center_level, town_center_rank, migrant_score, migrant_rank, mystic_trial, mystic_rank, ' +
    'leaderboards_json, observed_at, source_observed_at, source_observation_id, created_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id, String(governorId), uid ?? null, kid ?? null,
    ranks.power ?? null, ranks.power_rank ?? null,
    ranks.kills ?? null, ranks.kills_rank ?? null,
    ranks.town_center_level ?? null, ranks.town_center_rank ?? null,
    ranks.migrant_score ?? null, ranks.migrant_rank ?? null,
    ranks.mystic_trial ?? null, ranks.mystic_rank ?? null,
    JSON.stringify(Array.isArray(ranks.leaderboards) ? ranks.leaderboards : []),
    observedAt, sourceObservedAt, sourceObservationId, observedAt
  ).run();
  return id;
}

export async function getLatestKingdomRankingBoard(db, { kid, board }) {
  if (!db) throw new Error("D1 database binding is not configured.");
  if (!kid || !board) throw new Error("Kingdom ranking board requires kid and board.");
  const result = await db.prepare(
    "SELECT kid, board, target_type, target_id, rank, score, uid, governor_id, nick_name, aid, abbr, name, observed_at, source_observed_at, source_observation_id " +
    "FROM kingdom_ranking_current WHERE kid = ? AND board = ? ORDER BY rank ASC"
  ).bind(Number(kid), String(board)).all();
  return result.results || [];
}

function normalizeRankingValue(value) {
  if (value === null || value === undefined) return null;
  return String(value);
}

function rankingEntryTarget(board, entry, index, kid) {
  const targetType = isAllianceEntry(board, entry) ? "ALLIANCE" : "PLAYER";
  const targetId = targetType === "ALLIANCE"
    ? firstString(entry.aid, entry.id, entry.abbr, `${kid}:${board}:${index}`)
    : firstString(entry.governor_id, entry.governorId, entry.uid, `${kid}:${board}:${index}`);
  return { targetType, targetId: String(targetId) };
}

function rankingEntryChanged(previous, current) {
  if (!previous) return true;
  return Number(previous.rank) !== Number(current.rank)
    || normalizeRankingValue(previous.score) !== normalizeRankingValue(current.score)
    || normalizeRankingValue(previous.uid) !== normalizeRankingValue(current.uid)
    || normalizeRankingValue(previous.governor_id) !== normalizeRankingValue(current.governor_id)
    || normalizeRankingValue(previous.nick_name) !== normalizeRankingValue(current.nick_name)
    || normalizeRankingValue(previous.aid) !== normalizeRankingValue(current.aid)
    || normalizeRankingValue(previous.abbr) !== normalizeRankingValue(current.abbr)
    || normalizeRankingValue(previous.name) !== normalizeRankingValue(current.name);
}

export async function getKingdomRankingChanges(db, { kid, board, entries, observedAt, sourceObservationId = null }) {
  if (!db) throw new Error("D1 database binding is not configured.");
  if (!Number.isFinite(Number(kid)) || !board || !Array.isArray(entries)) return { changedEntries: [], rankingChanges: [], removedTargets: [] };
  const previousRows = await getLatestKingdomRankingBoard(db, { kid, board });
  const previousByKey = new Map(previousRows.map(row => [String(row.target_type) + ":" + String(row.target_id), row]));
  const currentKeys = new Set();
  const changedEntries = [];
  const rankingChanges = [];
  entries.forEach((entry, index) => {
    const target = rankingEntryTarget(board, entry, index, kid);
    const current = {
      board: String(board), targetType: target.targetType, targetId: target.targetId, rank: index + 1,
      score: entry.score ?? entry.value ?? null, uid: entry.uid ?? null, governor_id: entry.governor_id ?? null,
      nick_name: entry.nick_name ?? null, aid: entry.aid ?? null, abbr: entry.abbr ?? null, name: entry.name ?? null
    };
    const key = target.targetType + ":" + target.targetId;
    currentKeys.add(key);
    const previous = previousByKey.get(key);
    if (rankingEntryChanged(previous, current)) {
      entry.__eagleeye_rank = index + 1;
      changedEntries.push(entry);
    }
    if (previous && Number(previous.rank) !== Number(current.rank)) {
      rankingChanges.push({
        targetType: current.targetType, targetId: current.targetId, changeType: "RANK_CHANGED",
        oldValue: previous.rank, newValue: current.rank, oldScore: previous.score, newScore: current.score,
        observedAt, sourceObservationId
      });
    }
  });
  const removedTargets = previousRows.filter(row => !currentKeys.has(String(row.target_type) + ":" + String(row.target_id)))
    .map(row => ({ targetType: String(row.target_type), targetId: String(row.target_id) }));
  return { changedEntries, rankingChanges, removedTargets };
}

function getRankingEntryRank(entry, index) {
  const explicit = entry?.__eagleeye_rank ?? entry?.rank;
  const numeric = Number(explicit);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : index + 1;
}

function buildKingdomRankingInsertStatements(db, { kid, board, entries, observedAt, sourceObservedAt = null, sourceObservationId = null }) {
  return entries.map((entry, index) => {
    const rank = getRankingEntryRank(entry, index);
    const { targetType, targetId } = rankingEntryTarget(board, entry, rank - 1, kid);
    return db.prepare(
      'INSERT INTO ranking_snapshots (' +
      'ranking_snapshot_id, kid, board, target_type, target_id, rank, score, uid, governor_id, nick_name, ' +
      'aid, abbr, name, observed_at, source_observed_at, source_observation_id, created_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      crypto.randomUUID(), Number(kid), String(board), targetType, targetId, rank,
      entry.score ?? entry.value ?? null, entry.uid ?? null, entry.governor_id ?? null, entry.nick_name ?? null,
      entry.aid ?? null, entry.abbr ?? null, entry.name ?? null, observedAt, sourceObservedAt, sourceObservationId, observedAt
    );
  });
}

async function insertRankingStatements(db, statements) {
  const batchSize = 50;
  for (let i = 0; i < statements.length; i += batchSize) {
    await db.batch(statements.slice(i, i + batchSize));
  }
}

export async function saveKingdomRankingBoard(db, {
  kid, board, entries, observedAt, sourceObservedAt = null, sourceObservationId = null,
  entriesAlreadyFiltered = false, removedTargets = [], checkedAt = Math.floor(Date.now() / 1000)
}) {
  if (!db) throw new Error("D1 database binding is not configured.");
  if (!kid || !board || !Array.isArray(entries)) throw new Error("Kingdom ranking board requires kid, board and entries.");
  let comparison = null;
  if (!entriesAlreadyFiltered) comparison = await getKingdomRankingChanges(db, { kid, board, entries, observedAt, sourceObservationId });
  const filteredEntries = entriesAlreadyFiltered ? entries : comparison.changedEntries;
  const removals = entriesAlreadyFiltered ? removedTargets : comparison.removedTargets;
  const statements = [];
  for (const entry of filteredEntries) {
    const rank = getRankingEntryRank(entry, filteredEntries.indexOf(entry));
    const { targetType, targetId } = rankingEntryTarget(board, entry, rank - 1, kid);
    statements.push(db.prepare(
      'INSERT INTO kingdom_ranking_current (kid, board, target_type, target_id, rank, previous_rank, score, uid, governor_id, nick_name, aid, abbr, name, observed_at, source_observed_at, source_observation_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(kid, board, target_type, target_id) DO UPDATE SET previous_rank=kingdom_ranking_current.rank, rank=excluded.rank, score=excluded.score, uid=excluded.uid, governor_id=excluded.governor_id, nick_name=excluded.nick_name, aid=excluded.aid, abbr=excluded.abbr, name=excluded.name, observed_at=excluded.observed_at, source_observed_at=excluded.source_observed_at, source_observation_id=excluded.source_observation_id, updated_at=excluded.updated_at'
    ).bind(
      Number(kid), String(board), targetType, targetId, rank, null, entry.score ?? entry.value ?? null,
      entry.uid ?? null, entry.governor_id ?? null, entry.nick_name ?? null, entry.aid ?? null,
      entry.abbr ?? null, entry.name ?? null, observedAt, sourceObservedAt, sourceObservationId, Number(checkedAt)
    ));
  }
  for (const removed of removals) {
    statements.push(db.prepare(
      "DELETE FROM kingdom_ranking_current WHERE kid = ? AND board = ? AND target_type = ? AND target_id = ?"
    ).bind(Number(kid), String(board), String(removed.targetType), String(removed.targetId)));
  }
  statements.push(...buildKingdomRankingInsertStatements(db, {
    kid, board, entries: filteredEntries, observedAt, sourceObservedAt, sourceObservationId
  }));
  statements.push(db.prepare(
    "INSERT INTO kingdom_ranking_board_state (kid, board, last_checked_at, source_observed_at, checked_rows, changed_rows, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(kid, board) DO UPDATE SET last_checked_at=excluded.last_checked_at, source_observed_at=excluded.source_observed_at, checked_rows=excluded.checked_rows, changed_rows=excluded.changed_rows, updated_at=excluded.updated_at"
  ).bind(Number(kid), String(board), Number(checkedAt), sourceObservedAt, entries.length, filteredEntries.length, Number(checkedAt)));
  await insertRankingStatements(db, statements);
  return filteredEntries.length;
}

function isAllianceEntry(board, entry) {
  return board === "alliance_power" || board === "alliance_kills";
}

function firstString(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value);
  }
  return null;
}

export { PLAYER_RANK_FIELDS };

export async function detectRankingChangesForBoards(db, { kid, observedAt, boards }) {
  if (!db || !Number.isFinite(Number(kid)) || !Number.isFinite(Number(observedAt))) return [];
  const current = [];
  for (const [board, entries] of Object.entries(boards || {})) {
    if (!Array.isArray(entries)) continue;
    entries.forEach((entry, index) => {
      const targetType = isAllianceEntry(board, entry) ? "ALLIANCE" : "PLAYER";
      const targetId = targetType === "ALLIANCE"
        ? firstString(entry.aid, entry.id, entry.abbr, `${kid}:${board}:${index}`)
        : firstString(entry.governor_id, entry.governorId, entry.uid, `${kid}:${board}:${index}`);
      current.push({ board: String(board), targetType, targetId: String(targetId), rank: index + 1, score: entry.score ?? entry.value ?? null });
    });
  }
  if (!current.length) return [];

  const previousResult = await db.prepare(
    "WITH previous AS (" +
    "SELECT p.board, p.target_id, p.rank, p.score, " +
    "ROW_NUMBER() OVER (PARTITION BY p.board, p.target_id ORDER BY p.observed_at DESC) AS rn " +
    "FROM ranking_snapshots p " +
    "WHERE p.kid = ? AND p.observed_at < ?" +
    ") SELECT board, target_id, rank, score FROM previous WHERE rn = 1"
  ).bind(Number(kid), Number(observedAt)).all();

  const previousByKey = new Map();
  for (const row of previousResult.results || []) previousByKey.set(`${row.board}:${row.target_id}`, row);

  const events = [];
  for (const row of current) {
    const prev = previousByKey.get(`${row.board}:${row.targetId}`);
    if (!prev) continue;
    if (Number(prev.rank) !== Number(row.rank)) {
      events.push({ targetType: row.targetType, targetId: row.targetId, changeType: "RANK_CHANGED", oldValue: prev.rank, newValue: row.rank, oldScore: prev.score, newScore: row.score, observedAt });
    }
  }
  return events;
}

export async function getLatestKingdomRankings(db, kid, board = null, limit = 100) {
  const params = board ? [Number(kid), String(board), Number(limit)] : [Number(kid), Number(limit)];
  const sql = board
    ? "SELECT * FROM kingdom_ranking_current WHERE kid = ? AND board = ? ORDER BY rank ASC LIMIT ?"
    : "SELECT * FROM kingdom_ranking_current WHERE kid = ? ORDER BY board ASC, rank ASC LIMIT ?";
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

  // Cloudflare D1/SQLite has a low bound-variable limit. A single IN (...)
  // query with 100 ranking IDs plus kid/board/observedAt can exceed it.
  // Keep each lookup comfortably below the limit and merge the results.
  const previousByTarget = new Map();
  const DETECTION_ID_BATCH = 80;
  for (let offset = 0; offset < ids.length; offset += DETECTION_ID_BATCH) {
    const batchIds = ids.slice(offset, offset + DETECTION_ID_BATCH);
    if (!batchIds.length) continue;
    const placeholders = batchIds.map(() => "?").join(",");
    const previousResult = await db.prepare(
      "SELECT target_id, rank, score, observed_at FROM ranking_snapshots WHERE kid = ? AND board = ? AND target_id IN (" + placeholders + ") AND observed_at < ? ORDER BY target_id ASC, observed_at DESC"
    ).bind(Number(kid), String(board), ...batchIds, Number(observedAt)).all();

    for (const row of previousResult.results || []) {
      const id = String(row.target_id);
      if (!previousByTarget.has(id)) previousByTarget.set(id, row);
    }
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
