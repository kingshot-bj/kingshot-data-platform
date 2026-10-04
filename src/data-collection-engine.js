import { mightPulseFetch } from "./mightpulse.js";
import {
  configureApiPoolEncryption,
  leaseApiKey,
  recordApiPoolSuccess,
  recordApiPoolFailure,
  getApiPoolAvailability
} from "./api-pool.js";
import {
  createCollectionSemaphoreLimiter
} from "./collection-semaphore.js";

const DEFAULT_POOL_TYPES = ["SYSTEM_WATCHLIST", "SYSTEM_GENERAL", "USER_CONTRIBUTED"];

function parseHeaderNumber(headers, name) {
  const value = headers?.get?.(name);
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Common guarded MightPulse collection primitive.
 *
 * Ordering is intentional:
 *   1. Global Collection Semaphore
 *   2. API Pool lease
 *   3. MightPulse request
 *   4. API Pool success/failure accounting
 *   5. release semaphore
 *
 * The caller owns retry policy for a full collection job. This primitive does
 * not poll D1 while waiting and does not perform request-time schema changes.
 */
export async function collectMightPulseThroughGuards(env, {
  path,
  endpoint = path,
  targetType,
  targetId,
  purpose,
  query = null,
  include = null,
  poolTypes = DEFAULT_POOL_TYPES,
  globalLimiter = null,
  useGlobalSemaphore = true,
  timeoutMs,
  maxRetries
} = {}) {
  if (!env?.DB) throw new Error("DB_NOT_CONFIGURED");
  if (!path) throw new Error("MIGHTPULSE_PATH_REQUIRED");

  configureApiPoolEncryption(env.EAGLEEYE_SESSION_SECRET);

  const semaphore = useGlobalSemaphore
    ? (globalLimiter || createCollectionSemaphoreLimiter(env.DB))
    : null;

  let releaseGlobal = null;
  let lease = null;

  try {
    if (semaphore) {
      releaseGlobal = await semaphore.acquire();
    }

    lease = await leaseApiKey(env.DB, {
      poolTypes,
      purpose,
      targetType,
      targetId
    });

    if (!lease) {
      const availability = await getApiPoolAvailability(env.DB, {
        provider: "MIGHTPULSE",
        poolTypes
      });
      const exhaustedByLease = Boolean(availability?.exhausted_by_lease);
      const error = new Error("NO_API_POOL_KEY_AVAILABLE");
      error.code = "NO_API_POOL_KEY_AVAILABLE";
      error.poolAvailability = availability;
      error.userMessage = exhaustedByLease
        ? "現在、利用可能なAPIキーがすべて処理中（リース中）のため更新できません。キー自体の無効化とは限りません。しばらく待ってから再試行してください。"
        : "現在、利用可能なMightPulse APIキーを確保できません。キーの無効化・クールダウン等の状態を確認してください。";
      throw error;
    }

    const result = await mightPulseFetch(env, path, {
      query: query || (include ? { include } : undefined),
      apiKey: lease.api_key,
      timeoutMs,
      maxRetries
    });

    await recordApiPoolSuccess(env.DB, {
      keyId: lease.key_id,
      leaseId: lease.lease_id,
      poolType: lease.pool_type,
      endpoint,
      targetType,
      targetId,
      purpose,
      httpStatus: result.status,
      remainingMinute: parseHeaderNumber(result.headers, "x-ratelimit-remaining"),
      remainingDay: parseHeaderNumber(result.headers, "x-ratelimit-day-remaining")
    });

    return {
      result,
      pool_type: lease.pool_type,
      key_id: lease.key_id
    };
  } catch (error) {
    if (lease) {
      const status = Number(error?.status || 0);
      const cooldown = status === 429
        ? 60
        : status >= 500 || error?.code === "MIGHTPULSE_TIMEOUT" || error?.code === "MIGHTPULSE_NETWORK_ERROR"
          ? 15
          : 0;
      const disable = status === 401 || status === 403;
      const keepAvailable = !disable && cooldown === 0 && (status === 400 || status === 404);

      await recordApiPoolFailure(env.DB, {
        keyId: lease.key_id,
        leaseId: lease.lease_id,
        poolType: lease.pool_type,
        endpoint,
        targetType,
        targetId,
        purpose,
        httpStatus: status,
        errorCode: error?.code || "MIGHTPULSE_REQUEST_FAILED",
        errorMessage: error?.message || null,
        cooldownSeconds: cooldown,
        disable,
        keepAvailable
      });
    }
    throw error;
  } finally {
    if (releaseGlobal) {
      await Promise.resolve(releaseGlobal()).catch(() => {});
    }
  }
}

export async function collectKingdomRanking(env, kid, board, {
  limit = 100,
  purpose = "KINGDOM_COLLECTION",
  globalLimiter = null,
  useGlobalSemaphore = true
} = {}) {
  return collectMightPulseThroughGuards(env, {
    path: `/kingdoms/${encodeURIComponent(kid)}/ranks`,
    endpoint: "/kingdoms/:kid/ranks",
    targetType: "KINGDOM",
    targetId: String(kid),
    purpose,
    query: { board, limit },
    globalLimiter,
    useGlobalSemaphore
  });
}

export async function collectPlayerDetail(env, governorId, {
  purpose = "PLAYER_COLLECTION",
  globalLimiter = null,
  useGlobalSemaphore = true
} = {}) {
  return collectMightPulseThroughGuards(env, {
    path: `/players/${encodeURIComponent(governorId)}`,
    endpoint: "/players/:governor_id",
    targetType: "PLAYER",
    targetId: String(governorId),
    purpose,
    query: { include: "base,heroes,ranks,gov_gear" },
    globalLimiter,
    useGlobalSemaphore
  });
}


export async function collectAllianceDetail(env, kid, abbr, {
  purpose = "ALLIANCE_COLLECTION",
  globalLimiter = null,
  useGlobalSemaphore = true
} = {}) {
  return collectMightPulseThroughGuards(env, {
    path: `/alliances/${encodeURIComponent(kid)}/${encodeURIComponent(abbr)}`,
    endpoint: "/alliances/:kid/:tag",
    targetType: "ALLIANCE",
    targetId: `${kid}:${abbr}`,
    purpose,
    query: { include: "info,roster" },
    globalLimiter,
    useGlobalSemaphore
  });
}
