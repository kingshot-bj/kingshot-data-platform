import { runSystemOperation, createSystemTrace } from "./system-log.js";
const HISTORY_BUFFER_LIMIT = 50;
const HISTORY_BUFFER_MAX_BYTES = 8 * 1024 * 1024;

export async function ensureHistoryEmergencyBufferSchema(db) {
  // Schema is provisioned by migrations/0015. Never perform request-time DDL.
  return Boolean(db);
}

async function assertEmergencyCapacity(db, incomingBytes) {
  const row = await db.prepare(
    "SELECT COUNT(*) AS count, COALESCE(SUM(payload_bytes),0) AS bytes FROM history_emergency_buffer WHERE status IN ('PENDING','DRAINING')"
  ).first();
  const count = Number(row?.count || 0);
  const bytes = Number(row?.bytes || 0);
  if (count >= HISTORY_BUFFER_LIMIT || bytes + Number(incomingBytes || 0) > HISTORY_BUFFER_MAX_BYTES) {
    const error = new Error("HISTORY_EMERGENCY_BUFFER_FULL");
    error.code = "HISTORY_EMERGENCY_BUFFER_FULL";
    error.details = { count, bytes, maxCount: HISTORY_BUFFER_LIMIT, maxBytes: HISTORY_BUFFER_MAX_BYTES };
    throw error;
  }
}

async function enqueueHistoryEmergencyBufferInternal(db, {
  historyType,
  kid = null,
  board = null,
  governorId = null,
  observedAt,
  sourceObservedAt = null,
  sourceObservationId = null,
  payload
}) {
  if (!db) throw new Error("D1 database binding is not configured.");
  await ensureHistoryEmergencyBufferSchema(db);

  const payloadJson = JSON.stringify(payload);
  const payloadBytes = new TextEncoder().encode(payloadJson).byteLength;
  if (payloadBytes > 1_500_000) {
    const error = new Error("HISTORY_EMERGENCY_PAYLOAD_TOO_LARGE");
    error.code = "HISTORY_EMERGENCY_PAYLOAD_TOO_LARGE";
    throw error;
  }
  await assertEmergencyCapacity(db, payloadBytes);

  const now = Math.floor(Date.now() / 1000);
  const bufferId = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO history_emergency_buffer (buffer_id, history_type, kid, board, governor_id, observed_at, source_observed_at, source_observation_id, payload_json, payload_bytes, attempts, last_error, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 'PENDING', ?, ?)"
  ).bind(
    bufferId, String(historyType), kid == null ? null : Number(kid), board == null ? null : String(board),
    governorId == null ? null : String(governorId), Number(observedAt), sourceObservedAt,
    sourceObservationId, payloadJson, payloadBytes, now, now
  ).run();

  return { bufferId, payloadBytes };
}

async function archiveBufferedRow(bucket, row) {
  const payload = JSON.parse(row.payload_json);
  if (row.history_type === "RANKING") {
    const { archiveRankingHistoryBatch } = await import("./r2-archive.js");
    return archiveRankingHistoryBatch(bucket, {
      kid: row.kid,
      board: row.board,
      entries: payload.entries,
      observedAt: row.observed_at,
      sourceObservedAt: row.source_observed_at,
      sourceObservationId: row.source_observation_id
    });
  }
  if (row.history_type === "PLAYER") {
    const { archivePlayerHistoryBatch } = await import("./r2-archive.js");
    return archivePlayerHistoryBatch(bucket, {
      governorId: row.governor_id,
      observationId: row.source_observation_id,
      observedAt: row.observed_at,
      player: payload.player
    });
  }
  if (row.history_type === "PLAYER_RANK") {
    const { archivePlayerRankHistoryBatch } = await import("./r2-archive.js");
    return archivePlayerRankHistoryBatch(bucket, {
      governorId: row.governor_id,
      uid: payload.uid,
      kid: row.kid,
      ranks: payload.ranks,
      observedAt: row.observed_at,
      sourceObservedAt: row.source_observed_at,
      sourceObservationId: row.source_observation_id
    });
  }
  if (row.history_type === "ALLIANCE") {
    const { archiveAllianceHistoryBatch } = await import("./r2-archive.js");
    return archiveAllianceHistoryBatch(bucket, {
      kid: row.kid,
      aid: payload.aid,
      observedAt: row.observed_at,
      sourceObservedAt: row.source_observed_at,
      payload: payload.data
    });
  }
  throw new Error("HISTORY_EMERGENCY_UNKNOWN_TYPE:" + row.history_type);
}

async function drainHistoryEmergencyBufferInternal(db, bucket, { limit = 10 } = {}) {
  if (!db || !bucket) return { attempted: 0, archived: 0, failed: 0, remaining: 0 };
  await ensureHistoryEmergencyBufferSchema(db);

  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 20);
  const result = await db.prepare(
    "SELECT * FROM history_emergency_buffer WHERE status IN ('PENDING','FAILED') ORDER BY created_at ASC LIMIT ?"
  ).bind(safeLimit).all();

  let archived = 0;
  let failed = 0;
  for (const row of result.results || []) {
    try {
      await db.prepare(
        "UPDATE history_emergency_buffer SET status = 'DRAINING', updated_at = ? WHERE buffer_id = ?"
      ).bind(Math.floor(Date.now() / 1000), row.buffer_id).run();

      await archiveBufferedRow(bucket, row);

      await db.prepare(
        "DELETE FROM history_emergency_buffer WHERE buffer_id = ?"
      ).bind(row.buffer_id).run();
      archived++;
    } catch (error) {
      failed++;
      await db.prepare(
        "UPDATE history_emergency_buffer SET status = 'FAILED', attempts = attempts + 1, last_error = ?, updated_at = ? WHERE buffer_id = ?"
      ).bind(String(error?.message || error).slice(0, 1000), Math.floor(Date.now() / 1000), row.buffer_id).run();
    }
  }

  const remainingRow = await db.prepare(
    "SELECT COUNT(*) AS count FROM history_emergency_buffer WHERE status IN ('PENDING','DRAINING','FAILED')"
  ).first();

  return {
    attempted: (result.results || []).length,
    archived,
    failed,
    remaining: Number(remainingRow?.count || 0)
  };
}

export async function getHistoryEmergencyBufferStatus(db) {
  if (!db) return { pending: 0, failed: 0, bytes: 0, limit: HISTORY_BUFFER_LIMIT, maxBytes: HISTORY_BUFFER_MAX_BYTES };
  await ensureHistoryEmergencyBufferSchema(db);
  const row = await db.prepare(
    "SELECT COUNT(*) AS count, COALESCE(SUM(payload_bytes),0) AS bytes, SUM(CASE WHEN status='FAILED' THEN 1 ELSE 0 END) AS failed FROM history_emergency_buffer WHERE status IN ('PENDING','DRAINING','FAILED')"
  ).first();
  return {
    pending: Number(row?.count || 0),
    failed: Number(row?.failed || 0),
    bytes: Number(row?.bytes || 0),
    limit: HISTORY_BUFFER_LIMIT,
    maxBytes: HISTORY_BUFFER_MAX_BYTES
  };
}

export const HISTORY_EMERGENCY_BUFFER_LIMIT = HISTORY_BUFFER_LIMIT;
export const HISTORY_EMERGENCY_BUFFER_MAX_BYTES = HISTORY_BUFFER_MAX_BYTES;


export async function enqueueHistoryEmergencyBuffer(db, options) {
  const trace = createSystemTrace({ targetType: options?.historyType || "HISTORY", targetId: options?.governorId || options?.kid || null });
  return runSystemOperation(db, trace, {
    eventType: "D1_WRITE", service: "history_emergency_buffer",
    feature: "history_emergency_buffer", operation: "ENQUEUE_HISTORY_EMERGENCY",
    targetType: trace.targetType, targetId: trace.targetId
  }, () => enqueueHistoryEmergencyBufferInternal(db, options));
}

export async function drainHistoryEmergencyBuffer(db, bucket, options = {}) {
  const trace = createSystemTrace({ targetType: "HISTORY_EMERGENCY_BUFFER" });
  return runSystemOperation(db, trace, {
    eventType: "STORAGE", service: "history_emergency_buffer",
    feature: "history_emergency_buffer", operation: "DRAIN_HISTORY_EMERGENCY",
    targetType: trace.targetType
  }, () => drainHistoryEmergencyBufferInternal(db, bucket, options));
}
