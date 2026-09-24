const DEFAULT_BASE_URL = "https://api.mightpulse.com/v1";
const DEFAULT_TIMEOUT_MS = 100_000;
const DEFAULT_MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000];

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
  maxRetries = DEFAULT_MAX_RETRIES
} = {}) {
  const apiKey = env.MIGHTPULSE_API_KEY;
  if (!apiKey) {
    throw new MightPulseError("MightPulse API key is not configured.", {
      code: "MIGHTPULSE_NOT_CONFIGURED",
      status: 503
    });
  }

  const baseUrl = env.MIGHTPULSE_API_BASE_URL || DEFAULT_BASE_URL;
  const url = new URL(path.replace(/^\\/+/, ""), baseUrl + "/");
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
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

      if (response.ok) {
        const data = await response.json();
        return {
          data,
          status: response.status,
          headers: response.headers
        };
      }

      const body = await safeJson(response);
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
    } catch (error) {
      if (error instanceof MightPulseError) {
        lastError = error;
        if (!error.retryable || attempt >= maxRetries) throw error;
        await sleep(retryDelay(attempt));
        continue;
      }

      lastError = new MightPulseError(
        error?.name === "AbortError" ? "MightPulse API request timed out." : "MightPulse API request failed.",
        {
          code: error?.name === "AbortError" ? "MIGHTPULSE_TIMEOUT" : "MIGHTPULSE_NETWORK_ERROR",
          retryable: true
        }
      );

      if (attempt >= maxRetries) throw lastError;
      await sleep(retryDelay(attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new MightPulseError("MightPulse API request failed.");
}

export async function getMightPulsePlayer(env, governorId, {
  idType,
  include = "base"
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
    query: params
  });
}

export async function getMightPulseAlliance(env, kid, tag, {
  include = "info"
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
    { query: { include } }
  );
}

export async function getMightPulseKingdom(env, kid, {
  include,
  limit
} = {}) {
  const kingdomId = String(kid || "").trim();
  if (!kingdomId) {
    throw new MightPulseError("Kingdom ID is required.", {
      status: 400,
      code: "INVALID_KINGDOM_ID"
    });
  }

  return mightPulseFetch(env, `/kingdoms/${encodeURIComponent(kingdomId)}`, {
    query: { include, limit }
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

async function safeJson(response) {
  try {
    return await response.json();
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
