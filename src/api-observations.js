import { runSystemOperation, createSystemTrace } from "./system-log.js";

// MightPulse marks online / last_active_at / last_login as stale; EagleEye
// never stores them, not even in the raw player observations.
const STALE_FIELDS = ["online", "last_active_at", "last_login"];
export function stripStaleActivityFromPayloadJson(targetType, payloadJson) {
  if (String(targetType || "").toUpperCase() !== "PLAYER" || typeof payloadJson !== "string") return payloadJson;
  let payload;
  try { payload = JSON.parse(payloadJson); } catch { return payloadJson; }
  if (!payload || typeof payload !== "object") return payloadJson;
  let changed = false;
  for (const holder of [payload, payload.player]) {
    if (!holder || typeof holder !== "object") continue;
    for (const key of STALE_FIELDS) if (Object.prototype.hasOwnProperty.call(holder, key)) { delete holder[key]; changed = true; }
  }
  return changed ? JSON.stringify(payload) : payloadJson;
}
async function saveApiObservationInternal(db, observation) {
  if (!db) {
    throw new Error("D1 database binding is not configured.");
  }

  const observationId = crypto.randomUUID();
  const payloadJson = stripStaleActivityFromPayloadJson(observation.target_type, observation.payload_json);

  await db.prepare(
    `INSERT INTO api_observations (
      observation_id,
      provider,
      endpoint,
      target_type,
      target_id,
      observed_at,
      source_observed_at,
      http_status,
      payload_json,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    observationId,
    observation.provider,
    observation.endpoint,
    observation.target_type || null,
    observation.target_id || null,
    observation.observed_at,
    observation.source_observed_at ?? null,
    observation.http_status,
    payloadJson,
    observation.created_at
  ).run();

  return {
    observation_id: observationId,
    ...observation
  };
}


export async function saveApiObservation(db, observation) {
  const trace = createSystemTrace({ targetType: observation?.target_type || "OBSERVATION", targetId: observation?.target_id || null });
  return runSystemOperation(db, trace, {
    eventType: "D1_WRITE",
    service: "api_observations",
    feature: "api_observations",
    operation: "SAVE_API_OBSERVATION",
    targetType: trace.targetType,
    targetId: trace.targetId
  }, () => saveApiObservationInternal(db, observation));
}
