import { archiveRankingHistoryBatch, listRankingHistoryFromR2, archivePlayerRankHistoryBatch, listPlayerRankHistoryFromR2 } from "./r2-archive.js";

const PLAYER_RANK_FIELDS = [
  ["power", "power_rank"],
  ["kills", "kills_rank"],
  ["town_center_level", "town_center_rank"],
  ["migrant_score", "migrant_rank"],
  ["mystic_trial", "mystic_rank"]
];

export function buildPlayerRankSnapshotStatement(db, { governorId, uid = null, kid = null, ranks, observedAt, sourceObservedAt = null, sourceObservationId = null }) {
  if (!db) throw new Error("D1 database binding is not configured.");
  if (!governorId || !ranks || typeof ranks !== "object") throw new Error("Player ranking snapshot requires governorId and ranks.");
  const id = crypto.randomUUID();
  const statement = db.prepare(
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
  );
  return { id, statement };
}


export async function savePlayerRankSnapshot(db, options) {
  const { id, statement } = buildPlayerRankSnapshotStatement(db, options);
  await statement.run();

  if (options?.archiveBucket) {
    try {
      await archivePlayerRankHistoryBatch(options.archiveBucket, {
        governorId: options.governorId,
        uid: options.uid,
        kid: options.kid,
        ranks: options.ranks,
        observedAt: options.observedAt,
        sourceObservedAt: options.sourceObservedAt,
        sourceObservationId: options.sourceObservationId
      });
    } catch (error) {
      console.error("player_rank_history_r2_archive_failed", {
        governorId: String(options.governorId),
        message: error?.message || String(error)
      });
    }
  }

  return id;
}

export async function getPlayerRankHistory(db, {
  governorId,
  limit = 50,
  archiveBucket = null
}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const result = await db.prepare(
    "SELECT * FROM player_rank_snapshots WHERE governor_id = ? ORDER BY observed_at DESC LIMIT ?"
  ).bind(String(governorId), safeLimit).all();

  const d1Rows = result.results || [];
  if (!archiveBucket) return d1Rows;

  let r2Rows = [];
  try {
    r2Rows = await listPlayerRankHistoryFromR2(archiveBucket, {
      governorId: String(governorId),
      limit: safeLimit
    });
  } catch (error) {
    console.error("player_rank_history_r2_read_failed", {
      governorId: String(governorId),
      message: error?.message || String(error)
    });
  }

  const merged = new Map();
  for (const row of [...d1Rows, ...r2Rows]) {
    const key = row.source_observation_id
      ? `observation:${row.source_observation_id}`
      : `snapshot:${row.observed_at}:${row.power_rank}:${row.kills_rank}:${row.town_center_rank}`;
    if (!merged.has(key)) merged.set(key, row);
  }

  return [...merged.values()]
    .sort((a, b) => Number(b.observed_at) - Number(a.observed_at))
    .slice(0, safeLimit);
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

export function normalizeGovernorId(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d+\.0+$/.test(text)) return text.slice(0, text.indexOf("."));
  return text;
}

function normalizeRankingValue(value) {
  if (value === null || value === undefined) return null;
  return String(value);
}

function rankingEntryTarget(board, entry, index, kid) {
  const targetType = isAllianceEntry(board, entry) ? "ALLIANCE" : "PLAYER";
  const targetId = targetType === "ALLIANCE"
    ? firstString(entry.aid, entry.id, entry.abbr, `${kid}:${board}:${index}`)
    : normalizeGovernorId(firstString(entry.governor_id, entry.governorId, entry.uid, `${kid}:${board}:${index}`));
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
      score: entry.score ?? entry.value ?? null, uid: entry.uid ?? null, governor_id: normalizeGovernorId(entry.governor_id),
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
      entry.score ?? entry.value ?? null, entry.uid ?? null, normalizeGovernorId(entry.governor_id), entry.nick_name ?? null,
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
  entriesAlreadyFiltered = false, removedTargets = [], checkedAt = Math.floor(Date.now() / 1000), archiveBucket = null
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
      'INSERT INTO kingdom_ranking_current (kid, board, target_type, target_id, rank, previous_rank, score, uid, governor_id, nick_name, aid, abbr, name, observed_at, source_observed_at, source_observation_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(kid, board, target_type, target_id) DO UPDATE SET previous_rank=kingdom_ranking_current.rank, rank=excluded.rank, score=excluded.score, uid=excluded.uid, governor_id=excluded.governor_id, nick_name=excluded.nick_name, aid=excluded.aid, abbr=excluded.abbr, name=excluded.name, observed_at=excluded.observed_at, source_observed_at=excluded.source_observed_at, source_observation_id=excluded.source_observation_id, updated_at=excluded.updated_at'
    ).bind(
      Number(kid), String(board), targetType, targetId, rank, null, entry.score ?? entry.value ?? null,
      entry.uid ?? null, normalizeGovernorId(entry.governor_id), entry.nick_name ?? null, entry.aid ?? null,
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

  // Migration bridge: archive the same logical history rows to R2 without
  // changing the existing D1 history reader yet. R2 failure is deliberately
  // non-fatal during this phase so the existing D1 path remains authoritative.
  if (archiveBucket && filteredEntries.length) {
    try {
      const archiveEntries = filteredEntries.map((entry, index) => {
        const rank = getRankingEntryRank(entry, index);
        const { targetType, targetId } = rankingEntryTarget(board, entry, rank - 1, kid);
        return {
          ...entry,
          __eagleeye_rank: rank,
          target_type: targetType,
          target_id: targetId
        };
      });
      await archiveRankingHistoryBatch(archiveBucket, {
        kid,
        board,
        entries: archiveEntries,
        observedAt,
        sourceObservedAt,
        sourceObservationId
      });
    } catch (error) {
      console.error("ranking_history_r2_archive_failed", {
        kid,
        board,
        message: error?.message || String(error)
      });
    }
  }

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

export async function getLatestKingdomRankings(db, kid, board = null, limit = 100) {
  const params = board ? [Number(kid), String(board), Number(limit)] : [Number(kid), Number(limit)];
  const sql = board
    ? "SELECT * FROM kingdom_ranking_current WHERE kid = ? AND board = ? ORDER BY rank ASC LIMIT ?"
    : "SELECT * FROM kingdom_ranking_current WHERE kid = ? ORDER BY board ASC, rank ASC LIMIT ?";
  const result = await db.prepare(sql).bind(...params).all();
  return result.results || [];
}

export async function getRankingHistory(db, { kid, board, targetId, limit = 50, archiveBucket = null }) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const result = await db.prepare(
    "SELECT * FROM ranking_snapshots WHERE kid = ? AND board = ? AND target_id = ? ORDER BY observed_at DESC LIMIT ?"
  ).bind(Number(kid), String(board), String(targetId), safeLimit).all();

  const d1Rows = result.results || [];
  if (!archiveBucket) return d1Rows;

  let r2Rows = [];
  try {
    r2Rows = await listRankingHistoryFromR2(archiveBucket, {
      kid,
      board,
      targetId,
      limit: safeLimit
    });
  } catch (error) {
    console.error("ranking_history_r2_read_failed", {
      kid,
      board,
      targetId: String(targetId),
      message: error?.message || String(error)
    });
  }

  // Migration bridge: keep D1 as the compatibility fallback while R2 history
  // is introduced. A source observation id is preferred for de-duplication.
  const merged = new Map();
  for (const row of [...d1Rows, ...r2Rows]) {
    const key = row.source_observation_id
      ? `observation:${row.source_observation_id}:${row.target_id}`
      : `snapshot:${row.observed_at}:${row.target_id}:${row.rank}:${row.score}`;
    if (!merged.has(key)) merged.set(key, row);
  }

  return [...merged.values()]
    .sort((a, b) => Number(b.observed_at) - Number(a.observed_at))
    .slice(0, safeLimit);
}

