import { mightPulseFetch } from "./mightpulse.js";
import {
  configureApiPoolEncryption,
  leaseApiKey,
  recordApiPoolSuccess,
  recordApiPoolFailure
} from "./api-pool.js";

export const MIGHTPULSE_RESEARCH_CANDIDATES = [
  "pet",
  "pets",
  "mail",
  "messages",
  "inbox",
  "record",
  "records",
  "battle",
  "battles",
  "battle_report",
  "battle_reports",
  "combat",
  "combat_report",
  "combat_reports",
  "report",
  "reports",
  "event",
  "events",
  "history",
  "activity",
  "avatar",
  "avatar_frame",
  "frame",
  "frames",
  "skin",
  "skins",
  "castle_skin",
  "city_skin",
  "marching_skin",
  "profile",
  "cosmetics"
];

function summarizePayload(payload) {
  const object = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;
  const player = object?.player && typeof object.player === "object" ? object.player : null;
  return {
    payload_type: Array.isArray(payload) ? "array" : typeof payload,
    payload_keys: object ? Object.keys(object) : [],
    player_keys: player ? Object.keys(player) : [],
    sections: object
      ? Object.keys(object).filter(key => !["ok", "uid", "governor_id", "id_type", "include", "fresh", "cached_at", "age_seconds"].includes(key))
      : []
  };
}

export async function runMightPulseResearch(env, { governorId, candidate }) {
  const id = String(governorId || "").trim();
  const token = String(candidate || "").trim().toLowerCase();
  if (!id) {
    const error = new Error("GOVERNOR_ID_REQUIRED");
    error.code = "GOVERNOR_ID_REQUIRED";
    error.status = 400;
    throw error;
  }
  if (!MIGHTPULSE_RESEARCH_CANDIDATES.includes(token)) {
    const error = new Error("INVALID_RESEARCH_CANDIDATE");
    error.code = "INVALID_RESEARCH_CANDIDATE";
    error.status = 400;
    throw error;
  }

  configureApiPoolEncryption(env.EAGLEEYE_SESSION_SECRET);
  let lease = null;
  const endpoint = "/players/:governor_id";
  const requestedInclude = "base," + token;

  try {
    lease = await leaseApiKey(env.DB, {
      poolType: "SYSTEM_GENERAL",
      purpose: "MIGHTPULSE_RESEARCH",
      targetType: "PLAYER",
      targetId: id
    });

    const startedAt = Date.now();
    const result = await mightPulseFetch(env, "/players/" + encodeURIComponent(id), {
      query: { include: requestedInclude },
      apiKey: lease.api_key
    });
    const elapsedMs = Date.now() - startedAt;
    const summary = summarizePayload(result.data);

    await recordApiPoolSuccess(env.DB, {
      keyId: lease.key_id,
      leaseId: lease.lease_id,
      poolType: lease.pool_type,
      endpoint,
      targetType: "PLAYER",
      targetId: id,
      purpose: "MIGHTPULSE_RESEARCH",
      httpStatus: result.status,
      remainingMinute: Number(result.headers?.get?.("x-ratelimit-remaining")) || null,
      remainingDay: Number(result.headers?.get?.("x-ratelimit-day-remaining")) || null
    });

    return {
      ok: true,
      candidate: token,
      requested_include: requestedInclude,
      http_status: result.status,
      elapsed_ms: elapsedMs,
      fresh: result.data?.fresh ?? null,
      cached_at: result.data?.cached_at ?? null,
      age_seconds: result.data?.age_seconds ?? null,
      ...summary
    };
  } catch (error) {
    if (lease) {
      const status = Number(error?.status || 0);
      const cooldown = status === 429 ? 60
        : status >= 500 || error?.code === "MIGHTPULSE_TIMEOUT" || error?.code === "MIGHTPULSE_NETWORK_ERROR" ? 15
        : 0;
      const disable = status === 401 || status === 403;
      const keepAvailable = !disable && cooldown === 0 && (status === 400 || status === 404);
      await recordApiPoolFailure(env.DB, {
        keyId: lease.key_id,
        leaseId: lease.lease_id,
        poolType: lease.pool_type,
        endpoint,
        targetType: "PLAYER",
        targetId: id,
        purpose: "MIGHTPULSE_RESEARCH",
        httpStatus: status,
        errorCode: error?.code || "MIGHTPULSE_RESEARCH_FAILED",
        errorMessage: error?.message || null,
        cooldownSeconds: cooldown,
        disable,
        keepAvailable
      });
    }
    throw error;
  }
}
