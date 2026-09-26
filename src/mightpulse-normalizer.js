export const MIGHTPULSE_PROVIDER = "MIGHTPULSE";

export function normalizePlayerObservation(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid MightPulse player payload.");
  }

  return {
    provider: MIGHTPULSE_PROVIDER,
    target_type: "PLAYER",
    target_id: firstString(raw.governor_id, raw.governorId, raw.id, raw.uid),
    payload: raw
  };
}

export function observationEnvelope({ endpoint, httpStatus, raw, observedAt = Math.floor(Date.now() / 1000), sourceObservedAt = null }) {
  const normalized = normalizePlayerObservation(raw);
  return {
    provider: normalized.provider,
    endpoint,
    target_type: normalized.target_type,
    target_id: normalized.target_id,
    observed_at: observedAt,
    source_observed_at: sourceObservedAt,
    http_status: httpStatus,
    payload_json: JSON.stringify(normalized.payload),
    created_at: observedAt
  };
}

function firstString(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value);
    }
  }
  return null;
}
