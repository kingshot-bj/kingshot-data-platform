
const PROVIDER = "MIGHTPULSE";
const LEASE_SECONDS = 120;
let poolSecret = null;

import { recordSystemEvent, systemTraceId } from "./system-log.js";

export function configureApiPoolEncryption(secret) {
  poolSecret = String(secret || "");
}

export async function addApiPoolKey(db, { provider = PROVIDER, poolType, label = null, apiKey, contributedByUserId = null, consentVersion = null }) {
  const key = String(apiKey || "").trim();
  if (!key) throw new Error("API key is required.");
  if (!["SYSTEM_GENERAL", "SYSTEM_WATCHLIST", "USER_CONTRIBUTED"].includes(poolType)) throw new Error("Invalid API pool type.");
  const now = Math.floor(Date.now() / 1000);
  const fingerprint = await fingerprintKey(key);
  const encrypted = await encryptSecret(key);
  const keyId = crypto.randomUUID();

  await db.prepare(
    "INSERT INTO api_pool_keys (key_id, provider, pool_type, label, encrypted_key, key_fingerprint, status, contributed_by_user_id, consent_version, contributed_at, created_at, updated_at, quota_per_minute, quota_per_day, remaining_minute, remaining_day) VALUES (?, ?, ?, ?, ?, ?, 'AVAILABLE', ?, ?, ?, ?, ?, 60, 5000, 60, 5000)"
  ).bind(keyId, provider, poolType, label || null, encrypted, fingerprint, contributedByUserId, consentVersion, poolType === "USER_CONTRIBUTED" ? now : null, now, now).run();

  return { key_id: keyId, provider, pool_type: poolType, key_fingerprint: fingerprint, status: "AVAILABLE" };
}

export async function listApiPoolKeys(db) {
  const now = Math.floor(Date.now() / 1000);
  const result = await db.prepare(
    `SELECT key_id, provider, pool_type, label, key_fingerprint, encrypted_key, status, contributed_by_user_id, consent_version, contributed_at, revoked_at,
            CASE WHEN mighty_capable = 1 AND mighty_check_status = 'CONFIRMED' THEN MAX(COALESCE(quota_per_minute, 120), 120) ELSE COALESCE(quota_per_minute, 60) END AS quota_per_minute,
            CASE WHEN mighty_capable = 1 AND mighty_check_status = 'CONFIRMED' THEN MAX(COALESCE(quota_per_day, 10000), 10000) ELSE COALESCE(quota_per_day, 5000) END AS quota_per_day,
            MAX(0, (CASE WHEN mighty_capable = 1 AND mighty_check_status = 'CONFIRMED' THEN MAX(COALESCE(quota_per_minute, 120), 120) ELSE COALESCE(quota_per_minute, 60) END) -
              COALESCE((SELECT SUM(request_count) FROM api_pool_usage u WHERE u.key_id = api_pool_keys.key_id AND u.used_at > ? AND u.used_at <= ?), 0)) AS remaining_minute,
            MAX(0, (CASE WHEN mighty_capable = 1 AND mighty_check_status = 'CONFIRMED' THEN MAX(COALESCE(quota_per_day, 10000), 10000) ELSE COALESCE(quota_per_day, 5000) END) -
              COALESCE((SELECT SUM(request_count) FROM api_pool_usage u WHERE u.key_id = api_pool_keys.key_id AND u.used_at > ? AND u.used_at <= ?), 0)) AS remaining_day,
            quota_reset_at, cooldown_until, last_used_at, last_success_at, leased_until, lease_job_id, lease_purpose, lease_target_type, lease_target_id, last_error_at, last_error_code, last_error_message, mighty_capable, mighty_checked_at, mighty_check_status, mighty_last_error_code, created_at, updated_at
     FROM api_pool_keys ORDER BY pool_type, created_at`
  ).bind(now - 60, now, now - 86400, now).all();
  const rows = result.results || [];
  return Promise.all(rows.map(async row => {
    let apiKeyPrefix = null;
    try {
      const decrypted = await decryptSecret(row.encrypted_key);
      const prefixLength = Math.min(12, decrypted.length);
      apiKeyPrefix = prefixLength > 0 ? decrypted.slice(0, prefixLength) + (decrypted.length > prefixLength ? "…" : "") : null;
    } catch {
      apiKeyPrefix = null;
    }
    const { encrypted_key, ...safeRow } = row;
    return { ...safeRow, api_key_prefix: apiKeyPrefix };
  }));
}

export async function getApiPoolKeysWithContributors(db) {
  const keys = await listApiPoolKeys(db);
  const userIds = [...new Set(keys.map(k => String(k.contributed_by_user_id || "")).filter(Boolean))];
  if (!userIds.length) return keys.map(k => ({ ...k, contributor: null }));

  const placeholders = userIds.map(() => "?").join(",");
  const [usersResult, linksResult] = await Promise.all([
    db.prepare("SELECT user_id, discord_id, username, global_name FROM users WHERE user_id IN (" + placeholders + ")").bind(...userIds).all(),
    db.prepare(
      "SELECT l.user_id, l.governor_id, l.kingdom_id, l.account_type, p.nick_name, p.kid FROM user_player_links l LEFT JOIN players p ON p.governor_id = l.governor_id WHERE l.user_id IN (" + placeholders + ") AND l.status = 'ACTIVE' ORDER BY CASE l.account_type WHEN 'MAIN' THEN 0 ELSE 1 END, l.created_at ASC"
    ).bind(...userIds).all()
  ]);

  const users = new Map((usersResult.results || []).map(u => [String(u.user_id), u]));
  const links = new Map();
  for (const row of (linksResult.results || [])) {
    const uid = String(row.user_id);
    if (!links.has(uid)) links.set(uid, row);
  }

  return keys.map(key => {
    const uid = String(key.contributed_by_user_id || "");
    const user = users.get(uid);
    const link = links.get(uid);
    return {
      ...key,
      contributor: user ? {
        user_id: user.user_id,
        discord_id: user.discord_id,
        username: user.username,
        global_name: user.global_name,
        governor_id: link?.governor_id || null,
        governor_name: link?.nick_name || null,
        kingdom_id: link?.kingdom_id ?? link?.kid ?? null,
        account_type: link?.account_type || null
      } : null
    };
  });
}

async function claimApiPoolKey(db, {
  provider = PROVIDER,
  poolType = "SYSTEM_GENERAL",
  poolTypes = null,
  jobId = null,
  purpose = "GENERAL",
  targetType = null,
  targetId = null,
  leaseSeconds = LEASE_SECONDS,
  reserveAvailableKeys = 0,
  reserveMightyKeys = 0,
  preferNonMighty = false,
  mightyOnly = false,
  contributedByUserId = null
} = {}) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + Math.max(30, Number(leaseSeconds) || LEASE_SECONDS);
  const reserve = Math.max(0, Math.floor(Number(reserveAvailableKeys) || 0));
  const reserveMighty = Math.max(0, Math.floor(Number(reserveMightyKeys) || 0));
  const leaseId = crypto.randomUUID();
  const eligiblePoolTypes = Array.isArray(poolTypes) && poolTypes.length
    ? [...new Set(poolTypes.map(value => String(value || "").trim()).filter(Boolean))]
    : [String(poolType || "SYSTEM_GENERAL")];
  const placeholders = eligiblePoolTypes.map(() => "?").join(",");

  // Do not mix numbered SQLite placeholders (?1, ?8, ...) with anonymous
  // placeholders generated for the dynamic pool-type IN list. D1/SQLite
  // assigns anonymous parameters differently when numbered parameters are
  // present, causing a binding-count error for multi-pool leases.
  const mightyCondition = mightyOnly
    ? " AND mighty_capable = 1 AND mighty_check_status = 'CONFIRMED'"
    : "";
  const contributorCondition = contributedByUserId
    ? " AND contributed_by_user_id = ?"
    : "";
  const reserveMightyCondition = mightyOnly
    ? " AND reserve_keys.mighty_capable = 1 AND reserve_keys.mighty_check_status = 'CONFIRMED'"
    : "";
  const reserveCondition = reserve > 0
    ? " AND (SELECT COUNT(*) FROM api_pool_keys AS reserve_keys WHERE reserve_keys.provider = ? AND reserve_keys.pool_type IN (" + placeholders + ") AND reserve_keys.status IN ('AVAILABLE','COOLDOWN')" + reserveMightyCondition + " AND (reserve_keys.cooldown_until IS NULL OR reserve_keys.cooldown_until <= ?) AND (reserve_keys.leased_until IS NULL OR reserve_keys.leased_until <= ?)) > ?"
    : "";
  const reserveMightyKeyCondition = reserveMighty > 0
    ? " AND (api_pool_keys.mighty_capable != 1 OR api_pool_keys.mighty_check_status != 'CONFIRMED' OR (SELECT COUNT(*) FROM api_pool_keys AS reserve_mighty WHERE reserve_mighty.provider = ? AND reserve_mighty.pool_type IN (" + placeholders + ") AND reserve_mighty.status IN ('AVAILABLE','COOLDOWN') AND reserve_mighty.mighty_capable = 1 AND reserve_mighty.mighty_check_status = 'CONFIRMED' AND (reserve_mighty.cooldown_until IS NULL OR reserve_mighty.cooldown_until <= ?) AND (reserve_mighty.leased_until IS NULL OR reserve_mighty.leased_until <= ?)) > ?)"
    : "";
  const preferNonMightyOrder = preferNonMighty
    ? "CASE WHEN mighty_capable = 1 AND mighty_check_status = 'CONFIRMED' THEN 1 ELSE 0 END, "
    : "";
  const sql = "UPDATE api_pool_keys SET status = 'AVAILABLE', cooldown_until = NULL, lease_id = ?, leased_until = ?, lease_job_id = ?, lease_purpose = ?, lease_target_type = ?, lease_target_id = ?, updated_at = ? " +
    "WHERE key_id = (SELECT key_id FROM api_pool_keys WHERE provider = ? AND pool_type IN (" + placeholders + ") AND status IN ('AVAILABLE','COOLDOWN')" + mightyCondition + contributorCondition + reserveMightyKeyCondition + " AND (cooldown_until IS NULL OR cooldown_until <= ?) AND (leased_until IS NULL OR leased_until <= ?)" +
    reserveCondition +
    " ORDER BY " + preferNonMightyOrder + "CASE WHEN last_used_at IS NULL THEN 0 ELSE 1 END, COALESCE(last_used_at, 0) ASC, created_at ASC LIMIT 1) " +
    "RETURNING key_id, provider, pool_type, encrypted_key, contributed_by_user_id";
  const bindings = [
    leaseId, expiresAt, jobId ?? null, purpose ?? null, targetType ?? null, targetId ?? null, now,
    provider ?? PROVIDER, ...eligiblePoolTypes, ...(contributedByUserId ? [contributedByUserId] : [])
  ];
  if (reserveMighty > 0) bindings.push(provider ?? PROVIDER, ...eligiblePoolTypes, now, now, reserveMighty);
  bindings.push(now, now);
  if (reserve > 0) bindings.push(provider ?? PROVIDER, ...eligiblePoolTypes, now, now, reserve);
  const row = await db.prepare(sql).bind(...bindings).first();

  if (!row) throw new Error("NO_API_POOL_KEY_AVAILABLE");

  return {
    lease_id: leaseId,
    key_id: row.key_id,
    provider: row.provider,
    pool_type: row.pool_type,
    contributed_by_user_id: row.contributed_by_user_id || null,
    api_key: await decryptSecret(row.encrypted_key),
    expires_at: expiresAt
  };
}
export async function leaseApiKey(db, options = {}) {
  return claimApiPoolKey(db, options);
}

export async function leaseUserMightyCheckApiKey(db, {
  userId,
  purpose = "USER_MIGHTY_CHECK",
  targetType = "USER",
  targetId = null,
  leaseSeconds = LEASE_SECONDS
} = {}) {
  if (!userId) throw new Error("USER_ID_REQUIRED");
  return claimApiPoolKey(db, {
    provider: PROVIDER,
    poolTypes: ["USER_CONTRIBUTED"],
    purpose,
    targetType,
    targetId,
    leaseSeconds,
    contributedByUserId: String(userId)
  });
}

export async function leaseUserMightyApiKey(db, {
  userId,
  purpose = "USER_MIGHTY_API_REQUEST",
  targetType = null,
  targetId = null,
  jobId = null,
  leaseSeconds = LEASE_SECONDS
} = {}) {
  if (!userId) throw new Error("USER_ID_REQUIRED");
  return claimApiPoolKey(db, {
    provider: PROVIDER,
    poolTypes: ["USER_CONTRIBUTED"],
    purpose,
    targetType,
    targetId,
    jobId,
    leaseSeconds,
    mightyOnly: true,
    contributedByUserId: String(userId)
  });
}

export async function leaseMightyApiKey(db, {
  purpose = "MIGHTY_API_REQUEST",
  targetType = null,
  targetId = null,
  jobId = null,
  poolTypes = ["SYSTEM_GENERAL", "SYSTEM_WATCHLIST", "USER_CONTRIBUTED"],
  leaseSeconds = LEASE_SECONDS
} = {}) {
  return claimApiPoolKey(db, {
    provider: PROVIDER,
    poolTypes,
    purpose,
    targetType,
    targetId,
    jobId,
    leaseSeconds,
    mightyOnly: true
  });
}

export async function setApiPoolMightyMetadata(db, {
  keyId,
  mightyCapable = false,
  status = null,
  errorCode = null
} = {}) {
  if (!keyId) return;
  const now = Math.floor(Date.now() / 1000);
  const checkStatus = status || (mightyCapable ? "CONFIRMED" : "NOT_MIGHTY");
  await db.prepare(
    mightyCapable
      ? "UPDATE api_pool_keys SET status = 'AVAILABLE', cooldown_until = NULL, mighty_capable = ?1, quota_per_minute = CASE WHEN ?1 = 1 AND ?3 = 'CONFIRMED' THEN 120 ELSE 60 END, quota_per_day = CASE WHEN ?1 = 1 AND ?3 = 'CONFIRMED' THEN 10000 ELSE 5000 END, mighty_checked_at = ?2, mighty_check_status = ?3, mighty_last_error_code = ?4, last_error_code = NULL, last_error_message = NULL, updated_at = ?2 WHERE key_id = ?5"
      : "UPDATE api_pool_keys SET mighty_capable = ?1, quota_per_minute = CASE WHEN ?1 = 1 AND ?3 = 'CONFIRMED' THEN 120 ELSE 60 END, quota_per_day = CASE WHEN ?1 = 1 AND ?3 = 'CONFIRMED' THEN 10000 ELSE 5000 END, mighty_checked_at = ?2, mighty_check_status = ?3, mighty_last_error_code = ?4, updated_at = ?2 WHERE key_id = ?5"
  ).bind(mightyCapable ? 1 : 0, now, checkStatus, errorCode, keyId).run();
}

export async function markApiPoolKeyNotMighty(db, {
  keyId,
  leaseId,
  errorCode = "MIGHTY_REQUIRED"
} = {}) {
  if (!keyId || !leaseId) return;
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(
    "UPDATE api_pool_keys SET mighty_capable = 0, mighty_checked_at = ?1, mighty_check_status = 'NOT_MIGHTY', mighty_last_error_code = ?2, last_error_code = ?2, last_error_at = ?1, lease_id = NULL, leased_until = NULL, lease_job_id = NULL, lease_purpose = NULL, lease_target_type = NULL, lease_target_id = NULL, updated_at = ?1 WHERE key_id = ?3 AND lease_id = ?4"
  ).bind(now, errorCode, keyId, leaseId).run();
}

export async function leaseApiKeyForHealthCheck(db, {
  keyId,
  purpose = "API_POOL_HEALTH_CHECK",
  targetType = "API_KEY",
  targetId = null,
  leaseSeconds = 120
} = {}) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + Math.max(30, Number(leaseSeconds) || 120);
  if (!keyId) throw new Error("API_POOL_KEY_ID_REQUIRED");

  const leaseId = crypto.randomUUID();
  const row = await db.prepare(
    `UPDATE api_pool_keys
     SET lease_id = ?1,
         leased_until = ?2,
         lease_job_id = NULL,
         lease_purpose = ?3,
         lease_target_type = ?4,
         lease_target_id = ?5,
         updated_at = ?6
     WHERE key_id = ?7
       AND status IN ('AVAILABLE','ERROR','DISABLED','COOLDOWN')
       AND (cooldown_until IS NULL OR cooldown_until <= ?8)
       AND (leased_until IS NULL OR leased_until <= ?8)
     RETURNING key_id, provider, pool_type, encrypted_key`
  ).bind(
    leaseId, expiresAt, purpose ?? null, targetType ?? null, targetId ?? null, now, keyId, now
  ).first();

  if (!row) throw new Error("API_POOL_KEY_NOT_HEALTH_CHECKABLE");

  return {
    lease_id: leaseId,
    key_id: row.key_id,
    provider: row.provider,
    pool_type: row.pool_type,
    api_key: await decryptSecret(row.encrypted_key),
    expires_at: expiresAt
  };
}

export async function releaseApiLease(db, leaseId) {
  if (!leaseId) return;
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(
    `UPDATE api_pool_keys
     SET lease_id = NULL,
         leased_until = NULL,
         lease_job_id = NULL,
         lease_purpose = NULL,
         lease_target_type = NULL,
         lease_target_id = NULL,
         updated_at = ?1
     WHERE lease_id = ?2`
  ).bind(now, leaseId).run();
}

function prepareUsageInsert(db, { keyId, provider = PROVIDER, poolType = null, endpoint = null, targetType = null, targetId = null, jobId = null, purpose = null, httpStatus = null, requestCount = 1, measuredQuota = null, measuredRemaining = null, estimated = 0, now }) {
  const usageId = crypto.randomUUID();
  const resolvedPoolType = poolType || "SYSTEM_GENERAL";
  return db.prepare(
    "INSERT INTO api_pool_usage (usage_id, key_id, provider, pool_type, endpoint, target_type, target_id, job_id, purpose, http_status, request_count, measured_quota, measured_remaining, estimated, used_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(usageId, keyId, provider, resolvedPoolType, endpoint, targetType, targetId, jobId, purpose, httpStatus, requestCount, measuredQuota, measuredRemaining, estimated ? 1 : 0, now, now);
}

async function refreshApiPoolLocalRemaining(db, keyId, now) {
  await db.prepare(
    `UPDATE api_pool_keys
     SET quota_per_minute = CASE WHEN mighty_capable = 1 AND mighty_check_status = 'CONFIRMED' THEN MAX(COALESCE(quota_per_minute, 120), 120) ELSE COALESCE(quota_per_minute, 60) END,
         quota_per_day = CASE WHEN mighty_capable = 1 AND mighty_check_status = 'CONFIRMED' THEN MAX(COALESCE(quota_per_day, 10000), 10000) ELSE COALESCE(quota_per_day, 5000) END,
         remaining_minute = MAX(0, (CASE WHEN mighty_capable = 1 AND mighty_check_status = 'CONFIRMED' THEN MAX(COALESCE(quota_per_minute, 120), 120) ELSE COALESCE(quota_per_minute, 60) END) -
           COALESCE((SELECT SUM(request_count) FROM api_pool_usage WHERE key_id = ?1 AND used_at > ?2 AND used_at <= ?3), 0)),
         remaining_day = MAX(0, (CASE WHEN mighty_capable = 1 AND mighty_check_status = 'CONFIRMED' THEN MAX(COALESCE(quota_per_day, 10000), 10000) ELSE COALESCE(quota_per_day, 5000) END) -
           COALESCE((SELECT SUM(request_count) FROM api_pool_usage WHERE key_id = ?1 AND used_at > ?4 AND used_at <= ?3), 0)),
         quota_reset_at = ?3 + 60,
         updated_at = ?3
     WHERE key_id = ?1`
  ).bind(keyId, now - 60, now, now - 86400).run();
}

export async function recordApiPoolSuccess(db, { keyId, leaseId, poolType = null, endpoint = null, targetType = null, targetId = null, jobId = null, purpose = null, httpStatus = 200, remainingMinute = null, remainingDay = null, quotaResetAt = null, traceId = null, parentTraceId = null, runId = null, startedAt = null, completedAt = null, requestCount = 1 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  await prepareUsageInsert(db, { keyId, provider:PROVIDER, poolType, endpoint, targetType, targetId, jobId, purpose, httpStatus, requestCount:Math.max(1, Math.floor(Number(requestCount) || 1)), measuredQuota:null, measuredRemaining:remainingMinute, estimated:0, now }).run();
  await db.prepare(
    "UPDATE api_pool_keys SET status = 'AVAILABLE', cooldown_until = NULL, last_used_at = ?1, last_success_at = ?2, last_error_code = NULL, last_error_message = NULL, lease_id = NULL, leased_until = NULL, lease_job_id = NULL, lease_purpose = NULL, lease_target_type = NULL, lease_target_id = NULL, updated_at = ?3 WHERE key_id = ?4 AND lease_id = ?5"
  ).bind(now, now, now, keyId, leaseId).run();
  await refreshApiPoolLocalRemaining(db, keyId, now);
  await recordSystemEvent(db, { traceId:traceId || jobId || systemTraceId("pool"), parentTraceId, startedAt:startedAt || now, completedAt:completedAt || now, eventType:"API_SUCCESS", service:"api_pool", feature:"api_pool", operation:purpose || "API_REQUEST", status:"SUCCESS", targetType:targetType || "API_KEY", targetId:targetId || keyId, httpStatus, metadata:{ keyId, poolType, endpoint, jobId:jobId || null, leaseId:leaseId || null, traceId:traceId || null, runId:runId || null } });
}

export async function recordApiPoolFailure(db, { keyId, leaseId, poolType = null, endpoint = null, targetType = null, targetId = null, jobId = null, purpose = null, httpStatus = 0, errorCode = null, errorMessage = null, cooldownSeconds = 0, disable = false, keepAvailable = false, traceId = null, parentTraceId = null, runId = null, startedAt = null, completedAt = null, requestCount = 1 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const status = disable ? "DISABLED" : cooldownSeconds > 0 ? "COOLDOWN" : keepAvailable ? "AVAILABLE" : "ERROR";
  const cooldownUntil = cooldownSeconds > 0 ? now + cooldownSeconds : null;

  await prepareUsageInsert(db, { keyId, provider:PROVIDER, poolType, endpoint, targetType, targetId, jobId, purpose, httpStatus, requestCount:Math.max(1, Math.floor(Number(requestCount) || 1)), measuredQuota:null, measuredRemaining:null, estimated:0, now }).run();
  await db.prepare(
    "UPDATE api_pool_keys SET status = ?1, cooldown_until = ?2, last_used_at = ?3, last_error_at = ?4, last_error_code = ?5, last_error_message = ?6, lease_id = NULL, leased_until = NULL, lease_job_id = NULL, lease_purpose = NULL, lease_target_type = NULL, lease_target_id = NULL, updated_at = ?7 WHERE key_id = ?8 AND lease_id = ?9"
  ).bind(status, cooldownUntil, now, now, errorCode ?? null, truncate(errorMessage, 500), now, keyId, leaseId).run();
  await refreshApiPoolLocalRemaining(db, keyId, now);
  await recordSystemEvent(db, { traceId:traceId || jobId || systemTraceId("pool"), parentTraceId, startedAt:startedAt || now, completedAt:completedAt || now, eventType:"API_FAILURE", service:"api_pool", feature:"api_pool", operation:purpose || "API_REQUEST", status:"FAILED", targetType:targetType || "API_KEY", targetId:targetId || keyId, httpStatus, errorCode:errorCode || null, message:errorMessage || null, metadata:{ keyId, poolType, endpoint, jobId:jobId || null, leaseId:leaseId || null, traceId:traceId || null, runId:runId || null, cooldownSeconds, disable, keepAvailable } });
}

export async function getPoolStats(db) {
  const result = await db.prepare(
    "SELECT pool_type, status, COUNT(*) AS count FROM api_pool_keys GROUP BY pool_type, status ORDER BY pool_type ASC, status ASC"
  ).all();
  return (result.results || []).map(row => ({
    pool_type: String(row.pool_type || ""),
    status: String(row.status || ""),
    count: Number(row.count || 0)
  }));
}

export async function getApiPoolBudgetSnapshot(db, {
  provider = PROVIDER,
  poolTypes = ["SYSTEM_WATCHLIST", "SYSTEM_GENERAL", "USER_CONTRIBUTED"],
  now = Math.floor(Date.now() / 1000)
} = {}) {
  const types = Array.isArray(poolTypes) && poolTypes.length
    ? [...new Set(poolTypes.map(value => String(value || "").trim()).filter(Boolean))]
    : ["SYSTEM_WATCHLIST", "SYSTEM_GENERAL", "USER_CONTRIBUTED"];
  const placeholders = types.map(() => "?").join(",");
  // MightPulse's published API documentation specifies 60/minute and 5,000/day
  // per standard key (120/minute and 10,000/day for confirmed Mighty keys), but
  // does not document quota-remaining response headers. Track our own requests
  // instead of interpreting absent headers as zero remaining.
  const rowsResult = await db.prepare(
    `SELECT k.key_id, k.pool_type, k.status, k.cooldown_until, k.leased_until,
            k.quota_per_minute, k.quota_per_day, k.remaining_minute, k.remaining_day,
            k.mighty_capable, k.mighty_check_status, k.updated_at,
            COALESCE((SELECT SUM(u.request_count) FROM api_pool_usage u
                      WHERE u.key_id = k.key_id AND u.used_at >= ? AND u.used_at <= ?), 0) AS used_minute,
            COALESCE((SELECT SUM(u.request_count) FROM api_pool_usage u
                      WHERE u.key_id = k.key_id AND u.used_at >= ? AND u.used_at <= ?), 0) AS used_day
     FROM api_pool_keys k
     WHERE k.provider = ? AND k.pool_type IN (${placeholders})`
  ).bind(now - 60, now, now - 86400, now, provider, ...types).all();
  const rows = rowsResult.results || [];
  let availableKeys = 0;
  let remainingMinute = 0;
  let remainingDay = 0;
  let minRemainingMinute = null;
  let minRemainingDay = null;
  for (const key of rows) {
    const eligible = ["AVAILABLE", "COOLDOWN"].includes(String(key.status || "")) &&
      (key.cooldown_until == null || Number(key.cooldown_until) <= now) &&
      (key.leased_until == null || Number(key.leased_until) <= now);
    if (!eligible) continue;
    availableKeys++;
    const mighty = Number(key.mighty_capable) === 1 && String(key.mighty_check_status || "") === "CONFIRMED";
    const defaultMinuteQuota = mighty ? 120 : 60;
    const defaultDayQuota = mighty ? 10000 : 5000;
    const minuteQuota = Math.max(0, mighty ? Math.max(defaultMinuteQuota, Number(key.quota_per_minute) || 0) : (Number(key.quota_per_minute) > 0 ? Number(key.quota_per_minute) : defaultMinuteQuota));
    const dayQuota = Math.max(0, mighty ? Math.max(defaultDayQuota, Number(key.quota_per_day) || 0) : (Number(key.quota_per_day) > 0 ? Number(key.quota_per_day) : defaultDayQuota));
    const minuteLeft = Math.max(0, minuteQuota - Math.max(0, Number(key.used_minute) || 0));
    const dayLeft = Math.max(0, dayQuota - Math.max(0, Number(key.used_day) || 0));
    remainingMinute += minuteLeft;
    remainingDay += dayLeft;
    minRemainingMinute = minRemainingMinute == null ? minuteLeft : Math.min(minRemainingMinute, minuteLeft);
    minRemainingDay = minRemainingDay == null ? dayLeft : Math.min(minRemainingDay, dayLeft);
  }
  const measuredReserve = await getApiPoolMeasuredReserve(db, { provider, poolTypes: types, now });
  return {
    provider,
    poolTypes: types,
    keyCount: rows.length,
    availableKeys,
    remainingMinute,
    remainingDay,
    minRemainingMinute: minRemainingMinute ?? 0,
    minRemainingDay: minRemainingDay ?? 0,
    measuredReserveMinute: Number(measuredReserve?.measuredMinuteReserve || 0),
    measuredReserveDay: Number(measuredReserve?.measuredDayReserve || 0),
    measuredPeakMinuteRequests: Number(measuredReserve?.peakMinuteRequests || 0),
    measuredUsedDayRequests: Number(measuredReserve?.usedDayRequests || 0),
    measuredReserveCheckedAt: measuredReserve?.checkedAt || now,
    checkedAt: now,
    quotaSource: "LOCAL_REQUEST_ACCOUNTING",
  };
}

export async function getApiPoolMeasuredReserve(db, {
  provider = PROVIDER,
  poolTypes = ["SYSTEM_WATCHLIST", "SYSTEM_GENERAL", "USER_CONTRIBUTED"],
  now = Math.floor(Date.now() / 1000)
} = {}) {
  const types = Array.isArray(poolTypes) && poolTypes.length
    ? [...new Set(poolTypes.map(value => String(value || "").trim()).filter(Boolean))]
    : ["SYSTEM_WATCHLIST", "SYSTEM_GENERAL", "USER_CONTRIBUTED"];
  const placeholders = types.map(() => "?").join(",");
  const minuteRows = await db.prepare(
    `SELECT (used_at / 60) AS minute_bucket, SUM(request_count) AS requests
     FROM api_pool_usage
     WHERE provider = ? AND pool_type IN (${placeholders}) AND used_at >= ? AND used_at <= ?
       AND estimated = 0
     GROUP BY minute_bucket ORDER BY requests DESC LIMIT 1`
  ).bind(provider, ...types, now - 3600, now).first();
  const dayRow = await db.prepare(
    `SELECT COALESCE(SUM(request_count), 0) AS requests
     FROM api_pool_usage
     WHERE provider = ? AND pool_type IN (${placeholders}) AND used_at >= ? AND used_at <= ?
       AND estimated = 0`
  ).bind(provider, ...types, now - 86400, now).first();
  const peakMinute = Math.max(0, Number(minuteRows?.requests || 0));
  const usedDay = Math.max(0, Number(dayRow?.requests || 0));
  const measuredMinuteReserve = Math.ceil(peakMinute * 0.20);
  const measuredDayReserve = Math.ceil(usedDay * 0.05);
  return {
    peakMinuteRequests: peakMinute,
    usedDayRequests: usedDay,
    measuredMinuteReserve,
    measuredDayReserve,
    checkedAt: now
  };
}

export async function getApiPoolAvailability(db, {
  provider = PROVIDER,
  poolTypes = ["SYSTEM_WATCHLIST", "SYSTEM_GENERAL", "USER_CONTRIBUTED"],
  now = Math.floor(Date.now() / 1000)
} = {}) {
  const types = Array.isArray(poolTypes) && poolTypes.length
    ? [...new Set(poolTypes.map(value => String(value || "").trim()).filter(Boolean))]
    : ["SYSTEM_WATCHLIST", "SYSTEM_GENERAL", "USER_CONTRIBUTED"];
  const placeholders = types.map(() => "?").join(",");
  const result = await db.prepare(
    `SELECT pool_type,
            COUNT(*) AS total,
            SUM(CASE WHEN status IN ('AVAILABLE','COOLDOWN')
                       AND (cooldown_until IS NULL OR cooldown_until <= ?)
                       AND (leased_until IS NULL OR leased_until <= ?) THEN 1 ELSE 0 END) AS available,
            SUM(CASE WHEN leased_until IS NOT NULL AND leased_until > ? THEN 1 ELSE 0 END) AS leased,
            SUM(CASE WHEN status = 'COOLDOWN'
                       AND cooldown_until IS NOT NULL AND cooldown_until > ?
                       AND (leased_until IS NULL OR leased_until <= ?) THEN 1 ELSE 0 END) AS cooldown,
            SUM(CASE WHEN status = 'DISABLED' THEN 1 ELSE 0 END) AS disabled,
            SUM(CASE WHEN status = 'ERROR' THEN 1 ELSE 0 END) AS error,
            SUM(CASE WHEN status = 'REVOKED' THEN 1 ELSE 0 END) AS revoked
     FROM api_pool_keys
     WHERE provider = ? AND pool_type IN (${placeholders})
     GROUP BY pool_type
     ORDER BY pool_type ASC`
  ).bind(now, now, now, now, now, provider, ...types).all();

  const byPool = (result.results || []).map(row => ({
    pool_type: String(row.pool_type || ""),
    total: Number(row.total || 0),
    available: Number(row.available || 0),
    leased: Number(row.leased || 0),
    cooldown: Number(row.cooldown || 0),
    disabled: Number(row.disabled || 0),
    error: Number(row.error || 0),
    revoked: Number(row.revoked || 0)
  }));

  const totals = byPool.reduce((acc, row) => {
    for (const key of ["total","available","leased","cooldown","disabled","error","revoked"]) acc[key] += row[key];
    return acc;
  }, { total:0, available:0, leased:0, cooldown:0, disabled:0, error:0, revoked:0 });

  return {
    provider,
    checked_at: now,
    pool_types: types,
    pools: byPool,
    totals,
    exhausted_by_lease: totals.available === 0 && totals.leased > 0
  };
}

export async function recordUsage(db, { keyId, provider = PROVIDER, poolType = null, endpoint = null, targetType = null, targetId = null, jobId = null, purpose = null, httpStatus = null, requestCount = 1, measuredQuota = null, measuredRemaining = null, estimated = 0 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const usageId = crypto.randomUUID();
  if (!poolType) poolType = "SYSTEM_GENERAL";
  await db.prepare(
    "INSERT INTO api_pool_usage (usage_id, key_id, provider, pool_type, endpoint, target_type, target_id, job_id, purpose, http_status, request_count, measured_quota, measured_remaining, estimated, used_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(usageId, keyId, provider, poolType, endpoint, targetType, targetId, jobId, purpose, httpStatus, requestCount, measuredQuota, measuredRemaining, estimated ? 1 : 0, now, now).run();
}

export async function releaseExpiredLeases(db, now = Math.floor(Date.now() / 1000)) {
  // Lease coordination now lives entirely on api_pool_keys.
  // Expired claims are cleared during scheduled maintenance, never in the
  // request hot path.
  await db.prepare(
    `UPDATE api_pool_keys
     SET lease_id = NULL,
         leased_until = NULL,
         lease_job_id = NULL,
         lease_purpose = NULL,
         lease_target_type = NULL,
         lease_target_id = NULL,
         updated_at = ?
     WHERE leased_until IS NOT NULL
       AND leased_until <= ?`
  ).bind(now, now).run();
}

async function fingerprintKey(apiKey) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKey));
  return toHex(new Uint8Array(digest));
}

export async function encryptSecret(secret) {
  const key = await deriveEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(secret));
  return "v1." + toBase64(iv) + "." + toBase64(new Uint8Array(ciphertext));
}

export async function decryptSecret(value) {
  const parts = String(value || "").split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("INVALID_ENCRYPTED_API_KEY");
  const key = await deriveEncryptionKey();
  const iv = fromBase64(parts[1]);
  const ciphertext = fromBase64(parts[2]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

async function deriveEncryptionKey() {
  if (!poolSecret) throw new Error("API_POOL_ENCRYPTION_SECRET_NOT_CONFIGURED");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("EagleEye API Pool Encryption v1:" + poolSecret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function toBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(normalized);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function toHex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

function truncate(value, max) {
  const text = String(value || "");
  return text.length > max ? text.slice(0, max) : text;
}
