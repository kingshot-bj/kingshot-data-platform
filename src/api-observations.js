export async function saveApiObservation(db, observation) {
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
      http_status,
      payload_json,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    observationId,
    observation.provider,
    observation.endpoint,
    observation.target_type || null,
    observation.target_id || null,
    observation.observed_at,
    observation.http_status,
    observation.payload_json,
    observation.created_at
  ).run();

  return {
    observation_id: observationId,
    ...observation
  };
}
