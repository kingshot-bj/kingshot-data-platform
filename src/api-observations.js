import { runSystemOperation, createSystemTrace } from "./system-log.js";
async function saveApiObservationInternal(db, observation) {
  if (!db) {
    throw new Error("D1 database binding is not configured.");
  }

  const observationId = crypto.randomUUID();

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
    observation.payload_json,
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
