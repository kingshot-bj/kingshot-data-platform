const DEFAULT_BASE_URL = "https://api.mightpulse.com/v1";
const DEFAULT_TIMEOUT_MS = 100_000;
const DEFAULT_MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000];
import { recordSystemEvent, systemTraceId } from "./system-log.js";

export class MightPulseError extends Error {
  constructor(message, { status = 0, code = "MIGHTPULSE_ERROR", retryable = false, details = null } = {}) {
    super(message);
    this.name = "MightPulseError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

export async function mightPulseFetch(env, path, {
  method = "GET",
  query = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRetries = DEFAULT_MAX_RETRIES,
  apiKey: providedApiKey = null,
  traceId = null,
  parentTraceId = null,
  operation = "MIGHTPULSE_REQUEST",
  targetType = null,
  targetId = null,
  metadata = null
} = {}) {
  const apiKey = providedApiKey || env.MIGHTPULSE_API_KEY;
  const systemTrace = traceId || systemTraceId("mp");
  const startedAt = Date.now();
  let attempts = 0;
  if (!apiKey) {
    const error = new MightPulseError("MightPulse API key is not configured.", {
      code: "MIGHTPULSE_NOT_CONFIGURED",
      status: 503
    });
    await recordSystemEvent(env.DB, {
      traceId: systemTrace,
      parentTraceId,
      eventType: "EXTERNAL_API",
      service: "mightpulse",
      feature: "mightpulse",
      operation,
      status: "FAILED",
      targetType: targetType || "MIGHTPULSE",
      targetId: targetId || path,
      httpStatus: 503,
      elapsedMs: Date.now() - startedAt,
      errorCode: error.code,
      message: error.message,
      metadata: { path, method, attempts, ...(metadata && typeof metadata === "object" ? metadata : {}) }
    });
    throw error;
  }

  const baseUrl = env.MIGHTPULSE_API_BASE_URL || DEFAULT_BASE_URL;
  const url = new URL(path.replace(/^\/+/, ""), baseUrl + "/");
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    attempts = attempt + 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Authorization": "Bearer " + apiKey,
          "Accept": "application/json"
        },
        signal: controller.signal
      });

      const rawBody = await response.text();
      const body = parseJsonOrNull(rawBody);

      if (response.ok) {
        if (body === null) {
          throw new MightPulseError("MightPulse returned a non-JSON response.", {
            status: response.status,
            code: "MIGHTPULSE_INVALID_RESPONSE",
            retryable: false,
            details: { content_type: response.headers.get("content-type") || null }
          });
        }
        await recordSystemEvent(env.DB, {
          traceId: systemTrace,
          parentTraceId,
          startedAt: Math.floor(startedAt / 1000),
          completedAt: Math.floor(Date.now() / 1000),
          eventType: "EXTERNAL_API",
          service: "mightpulse",
          feature: "mightpulse",
          operation,
          status: "COMPLETED",
          targetType: targetType || "MIGHTPULSE",
          targetId: targetId || path,
          httpStatus: response.status,
          elapsedMs: Date.now() - startedAt,
          metadata: { path, method, attempts, ...(metadata && typeof metadata === "object" ? metadata : {}) }
        });
        return {
          data: body,
          status: response.status,
          headers: response.headers
        };
      }
      const retryable = response.status === 429 || response.status >= 500;

      lastError = new MightPulseError("MightPulse API request failed.", {
        status: response.status,
        code: mightPulseStatusCode(response.status),
        retryable,
        details: sanitizeErrorDetails(body)
      });

      if (!retryable || attempt >= maxRetries) {
        throw lastError;
      }

      await sleep(retryDelay(attempt, response.headers.get("Retry-After")));
      continue;
    } catch (error) {
      if (error instanceof MightPulseError) {
        lastError = error;
        if (!error.retryable || attempt >= maxRetries) {
          await recordSystemEvent(env.DB, {
            traceId: systemTrace,
            parentTraceId,
            startedAt: Math.floor(startedAt / 1000),
            completedAt: Math.floor(Date.now() / 1000),
            eventType: "EXTERNAL_API",
            service: "mightpulse",
            feature: "mightpulse",
            operation,
            status: "FAILED",
            targetType: targetType || "MIGHTPULSE",
            targetId: targetId || path,
            httpStatus: Number(error.status || 0) || null,
            elapsedMs: Date.now() - startedAt,
            errorCode: error.code || "MIGHTPULSE_REQUEST_FAILED",
            message: error.message,
            metadata: { path, method, attempts, ...(metadata && typeof metadata === "object" ? metadata : {}) }
          });
          throw error;
        }
        await sleep(retryDelay(attempt));
        continue;
      }

      lastError = new MightPulseError(
        error?.name === "AbortError" ? "MightPulse API request timed out." : "MightPulse API request failed.",
        {
          code: error?.name === "AbortError" ? "MIGHTPULSE_TIMEOUT" : "MIGHTPULSE_NETWORK_ERROR",
          retryable: true,
          details: {
            attempt: attempt + 1,
            max_attempts: maxRetries + 1,
            error_name: error?.name || null,
            error_message: error?.message || null,
            host: url.host,
            path: url.pathname
          }
        }
      );

      if (attempt >= maxRetries) {
        await recordSystemEvent(env.DB, {
          traceId: systemTrace,
          parentTraceId,
          eventType: "EXTERNAL_API",
          service: "mightpulse",
          feature: "mightpulse",
          operation,
          status: "FAILED",
          targetType: targetType || "MIGHTPULSE",
          targetId: targetId || path,
          httpStatus: Number(lastError?.status || 0) || null,
          elapsedMs: Date.now() - startedAt,
          errorCode: lastError?.code || "MIGHTPULSE_REQUEST_FAILED",
          message: lastError?.message || null,
          metadata: { path, method, attempts, ...(metadata && typeof metadata === "object" ? metadata : {}) }
        });
        throw lastError;
      }
      await sleep(retryDelay(attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new MightPulseError("MightPulse API request failed.");
}

export async function getMightPulsePlayer(env, governorId, {
  idType,
  include = "base",
  apiKey = null
} = {}) {
  const id = String(governorId || "").trim();
  if (!id) {
    throw new MightPulseError("Governor ID is required.", {
      status: 400,
      code: "INVALID_PLAYER_ID"
    });
  }

  const params = { include };
  if (idType) params.id_type = idType;

  return mightPulseFetch(env, `/players/${encodeURIComponent(id)}`, {
    query: params,
    apiKey
  });
}

export async function getMightPulsePlayerRanks(env, governorId, { apiKey = null } = {}) {
  const id = String(governorId || "").trim();
  if (!id) {
    throw new MightPulseError("Governor ID is required.", {
      status: 400,
      code: "INVALID_PLAYER_ID"
    });
  }

  return getMightPulsePlayer(env, id, {
    include: "ranks",
    apiKey
  });
}

export async function getMightPulseKingdomRanks(env, kid, {
  board = null,
  limit = 100,
  apiKey = null,
  traceId = null,
  parentTraceId = null
} = {}) {
  const kingdomId = String(kid || "").trim();
  if (!kingdomId) {
    throw new MightPulseError("Kingdom ID is required.", {
      status: 400,
      code: "INVALID_KINGDOM_ID"
    });
  }

  const numericLimit = Number(limit);
  if (!Number.isInteger(numericLimit) || numericLimit < 1 || numericLimit > 100) {
    throw new MightPulseError("Ranking limit must be between 1 and 100.", {
      status: 400,
      code: "INVALID_RANKING_LIMIT"
    });
  }

  const query = { limit: numericLimit };
  if (board) query.board = String(board).trim();

  return mightPulseFetch(env, `/kingdoms/${encodeURIComponent(kingdomId)}/ranks`, {
    query,
    apiKey,
    traceId,
    parentTraceId,
    operation: "GET_KINGDOM_RANKING",
    targetType: "KINGDOM",
    targetId: kingdomId
  });
}

export async function getMightPulseKingdomAllRankings(env, kid, {
  limit = 100,
  apiKey = null,
  traceId = null,
  parentTraceId = null
} = {}) {
  const kingdomId = String(kid || "").trim();
  if (!kingdomId) {
    throw new MightPulseError("Kingdom ID is required.", {
      status: 400,
      code: "INVALID_KINGDOM_ID"
    });
  }

  return getMightPulseKingdom(env, kingdomId, {
    include: "boards",
    limit,
    apiKey,
    traceId,
    parentTraceId
  }).then(result => {
    if (!result || !result.data) {
      throw new MightPulseError("MightPulse returned no kingdom ranking payload.", {
        status: result?.status || 502,
        code: "MIGHTPULSE_EMPTY_RANKINGS"
      });
    }
    return result;
  });
}

export async function getMightPulseTopKingdomAlliances(env, kid, {
  limit = 10,
  board = "alliance_power",
  apiKey = null
} = {}) {
  const numericLimit = Number(limit);
  if (!Number.isInteger(numericLimit) || numericLimit < 1 || numericLimit > 100) {
    throw new MightPulseError("Alliance ranking limit must be between 1 and 100.", {
      status: 400,
      code: "INVALID_ALLIANCE_RANKING_LIMIT"
    });
  }

  const ranking = await getMightPulseKingdomRanks(env, kid, {
    board,
    limit: numericLimit,
    apiKey
  });
  const payload = ranking?.data || {};
  const entries = Array.isArray(payload?.data) ? payload.data :
    Array.isArray(payload?.rankings) ? payload.rankings :
    Array.isArray(payload?.results) ? payload.results : [];

  const alliances = entries.slice(0, numericLimit).map((entry, index) => ({
    rank: Number(entry?.rank ?? entry?.ranking ?? index + 1),
    aid: entry?.aid ?? entry?.alliance_id ?? entry?.alliance?.aid ?? null,
    abbr: entry?.abbr ?? entry?.alliance_tag ?? entry?.tag ?? entry?.alliance?.abbr ?? null,
    name: entry?.name ?? entry?.alliance_name ?? entry?.alliance?.name ?? null,
    score: entry?.score ?? entry?.power ?? entry?.alliance_power ?? null
  })).filter(entry => entry.abbr);

  return {
    ...ranking,
    data: alliances
  };
}

export async function getMightPulseTopKingdomAllianceRosters(env, kid, {
  limit = 10,
  board = "alliance_power",
  include = "info,roster",
  apiKey = null
} = {}) {
  const ranking = await getMightPulseTopKingdomAlliances(env, kid, {
    limit,
    board,
    apiKey
  });
  const alliances = Array.isArray(ranking?.data) ? ranking.data : [];
  const results = [];
  for (const alliance of alliances) {
    const roster = await getMightPulseAlliance(env, kid, alliance.abbr, { include, apiKey });
    const payload = roster?.data || {};
    const members = Array.isArray(payload?.members) ? payload.members :
      Array.isArray(payload?.roster) ? payload.roster :
      Array.isArray(payload?.data?.members) ? payload.data.members : [];
    results.push({
      ...alliance,
      member_count: members.length,
      members,
      upstream_status: roster.status
    });
  }
  return {
    kingdom_id: String(kid),
    board,
    alliance_limit: alliances.length,
    alliances: results,
    ranking_status: ranking.status
  };
}

export async function getMightPulseAlliance(env, kid, tag, {
  include = "info",
  apiKey = null
} = {}) {
  const kingdomId = String(kid || "").trim();
  const allianceTag = String(tag || "").trim();

  if (!kingdomId || !allianceTag) {
    throw new MightPulseError("Kingdom ID and alliance tag are required.", {
      status: 400,
      code: "INVALID_ALLIANCE_ID"
    });
  }

  return mightPulseFetch(
    env,
    `/alliances/${encodeURIComponent(kingdomId)}/${encodeURIComponent(allianceTag)}`,
    { query: { include }, apiKey }
  );
}

export async function getMightPulseKingdom(env, kid, {
  include,
  limit,
  apiKey = null
} = {}) {
  const kingdomId = String(kid || "").trim();
  if (!kingdomId) {
    throw new MightPulseError("Kingdom ID is required.", {
      status: 400,
      code: "INVALID_KINGDOM_ID"
    });
  }

  return mightPulseFetch(env, `/kingdoms/${encodeURIComponent(kingdomId)}`, {
    query: { include, limit },
    apiKey
  });
}

function mightPulseStatusCode(status) {
  if (status === 400) return "MIGHTPULSE_BAD_REQUEST";
  if (status === 401) return "MIGHTPULSE_UNAUTHORIZED";
  if (status === 404) return "MIGHTPULSE_NOT_FOUND";
  if (status === 429) return "MIGHTPULSE_RATE_LIMITED";
  if (status >= 500) return "MIGHTPULSE_UPSTREAM_ERROR";
  return "MIGHTPULSE_HTTP_ERROR";
}

function retryDelay(attempt, retryAfter) {
  const retryAfterMs = Number.parseFloat(retryAfter);
  if (Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
    return Math.min(retryAfterMs * 1000, 30_000);
  }
  return RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
}

function parseJsonOrNull(rawBody) {
  if (!rawBody) return null;
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

function sanitizeErrorDetails(body) {
  if (!body || typeof body !== "object") return null;
  return {
    ok: body.ok,
    error: typeof body.error === "string" ? body.error : undefined,
    message: typeof body.message === "string" ? body.message : undefined
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
