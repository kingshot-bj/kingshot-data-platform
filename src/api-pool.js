
const PROVIDER = "MIGHTPULSE";
const LEASE_SECONDS = 120;
let poolSecret = null;

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
    "INSERT INTO api_pool_keys (key_id, provider, pool_type, label, encrypted_key, key_fingerprint, status, contributed_by_user_id, consent_version, contributed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'AVAILABLE', ?, ?, ?, ?, ?)"
  ).bind(keyId, provider, poolType, label || null, encrypted, fingerprint, contributedByUserId, consentVersion, poolType === "USER_CONTRIBUTED" ? now : null, now, now).run();

  return { key_id: keyId, provider, pool_type: poolType, key_fingerprint: fingerprint, status: "AVAILABLE" };
}

export async function listApiPoolKeys(db) {
  const result = await db.prepare(
    "SELECT key_id, provider, pool_type, label, key_fingerprint, status, contributed_by_user_id, consent_version, contributed_at, revoked_at, quota_per_minute, quota_per_day, remaining_minute, remaining_day, quota_reset_at, cooldown_until, last_used_at, last_success_at, last_error_at, last_error_code, last_error_message, created_at, updated_at FROM api_pool_keys ORDER BY pool_type, created_at"
  ).all();
  return result.results || [];
}

async function claimApiPoolKey(db, {
  provider = PROVIDER,
  poolType = "SYSTEM_GENERAL",
  jobId = null,
  purpose = "GENERAL",
  targetType = null,
  targetId = null,
  leaseSeconds = LEASE_SECONDS
} = {}) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + Math.max(30, Number(leaseSeconds) || LEASE_SECONDS);
  const leaseId = crypto.randomUUID();

  // Claim the least-recently-used eligible key in the same write statement that
  // establishes the lease. This removes the old SELECT -> INSERT race window.
  const claim = await db.prepare(
    `UPDATE api_pool_keys
     SET status = 'AVAILABLE',
         cooldown_until = NULL,
         lease_id = ?,
         leased_until = ?,
         lease_job_id = ?,
         lease_purpose = ?,
         lease_target_type = ?,
         lease_target_id = ?,
         updated_at = ?
     WHERE key_id = (
       SELECT key_id
       FROM api_pool_keys
       WHERE provider = ?
         AND pool_type = ?
         AND status = 'AVAILABLE'
         AND (cooldown_until IS NULL OR cooldown_until <= ?)
         AND (leased_until IS NULL OR leased_until <= ?)
       ORDER BY
         CASE WHEN last_used_at IS NULL THEN 0 ELSE 1 END,
         COALESCE(last_used_at, 0) ASC,
         created_at ASC
       LIMIT 1
     )`
  ).bind(
    leaseId, expiresAt, jobId, purpose, targetType, targetId, now,
    provider, poolType, now, now
  ).run();

  if (Number(claim?.meta?.changes || 0) !== 1) {
    throw new Error("NO_API_POOL_KEY_AVAILABLE");
  }

  const row = await db.prepare(
    "SELECT * FROM api_pool_keys WHERE lease_id = ? AND key_id IS NOT NULL LIMIT 1"
  ).bind(leaseId).first();

  if (!row) throw new Error("API_POOL_LEASE_CLAIM_READBACK_FAILED");

  return {
    lease_id: leaseId,
    key_id: row.key_id,
    provider: row.provider,
    pool_type: row.pool_type,
    api_key: await decryptSecret(row.encrypted_key),
    expires_at: expiresAt
  };
}

export async function leaseApiKey(db, options = {}) {
  return claimApiPoolKey(db, options);
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
  const claim = await db.prepare(
    `UPDATE api_pool_keys
     SET lease_id = ?,
         leased_until = ?,
         lease_job_id = NULL,
         lease_purpose = ?,
         lease_target_type = ?,
         lease_target_id = ?,
         updated_at = ?
     WHERE key_id = ?
       AND status IN ('AVAILABLE','ERROR','DISABLED')
       AND (leased_until IS NULL OR leased_until <= ?)`
  ).bind(
    leaseId, expiresAt, purpose, targetType, targetId, now, keyId, now
  ).run();

  if (Number(claim?.meta?.changes || 0) !== 1) {
    throw new Error("API_POOL_KEY_NOT_HEALTH_CHECKABLE");
  }

  const row = await db.prepare(
    "SELECT * FROM api_pool_keys WHERE key_id = ? AND lease_id = ? LIMIT 1"
  ).bind(keyId, leaseId).first();

  if (!row) throw new Error("API_POOL_LEASE_CLAIM_READBACK_FAILED");

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
         updated_at = ?
     WHERE lease_id = ?`
  ).bind(now, leaseId).run();
}

function prepareUsageInsert(db, { keyId, provider = PROVIDER, poolType = null, endpoint = null, targetType = null, targetId = null, jobId = null, purpose = null, httpStatus = null, requestCount = 1, measuredQuota = null, measuredRemaining = null, estimated = 0, now }) {
  const usageId = crypto.randomUUID();
  const resolvedPoolType = poolType || "SYSTEM_GENERAL";
  return db.prepare(
    "INSERT INTO api_pool_usage (usage_id, key_id, provider, pool_type, endpoint, target_type, target_id, job_id, purpose, http_status, request_count, measured_quota, measured_remaining, estimated, used_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(usageId, keyId, provider, resolvedPoolType, endpoint, targetType, targetId, jobId, purpose, httpStatus, requestCount, measuredQuota, measuredRemaining, estimated ? 1 : 0, now, now);
}

function prepareLeaseClear(db, leaseId, now) {
  return db.prepare(
    `UPDATE api_pool_keys
     SET lease_id = NULL,
         leased_until = NULL,
         lease_job_id = NULL,
         lease_purpose = NULL,
         lease_target_type = NULL,
         lease_target_id = NULL,
         updated_at = ?
     WHERE lease_id = ?`
  ).bind(now, leaseId);
}

export async function recordApiPoolSuccess(db, { keyId, leaseId, poolType = null, endpoint = null, targetType = null, targetId = null, jobId = null, purpose = null, httpStatus = 200, remainingMinute = null, remainingDay = null, quotaResetAt = null } = {}) {
  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    db.prepare(
      "UPDATE api_pool_keys SET status = 'AVAILABLE', cooldown_until = NULL, remaining_minute = COALESCE(?, remaining_minute), remaining_day = COALESCE(?, remaining_day), quota_reset_at = COALESCE(?, quota_reset_at), last_used_at = ?, last_success_at = ?, last_error_code = NULL, last_error_message = NULL, updated_at = ? WHERE key_id = ? AND lease_id = ?"
    ).bind(remainingMinute, remainingDay, quotaResetAt, now, now, now, keyId, leaseId),
    prepareUsageInsert(db, { keyId, provider: PROVIDER, poolType, endpoint, targetType, targetId, jobId, purpose, httpStatus, measuredRemaining: remainingDay, now }),
    prepareLeaseClear(db, leaseId, now)
  ]);
}

export async function recordApiPoolFailure(db, { keyId, leaseId, poolType = null, endpoint = null, targetType = null, targetId = null, jobId = null, purpose = null, httpStatus = 0, errorCode = null, errorMessage = null, cooldownSeconds = 0, disable = false, keepAvailable = false } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const status = disable ? "DISABLED" : cooldownSeconds > 0 ? "COOLDOWN" : keepAvailable ? "AVAILABLE" : "ERROR";
  const cooldownUntil = cooldownSeconds > 0 ? now + cooldownSeconds : null;

  await db.batch([
    db.prepare(
      "UPDATE api_pool_keys SET status = ?, cooldown_until = ?, last_used_at = ?, last_error_at = ?, last_error_code = ?, last_error_message = ?, updated_at = ? WHERE key_id = ? AND lease_id = ?"
    ).bind(status, cooldownUntil, now, now, errorCode, truncate(errorMessage, 500), now, keyId, leaseId),
    prepareUsageInsert(db, { keyId, provider: PROVIDER, poolType, endpoint, targetType, targetId, jobId, purpose, httpStatus, now }),
    prepareLeaseClear(db, leaseId, now)
  ]);
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

async function encryptSecret(secret) {
  const key = await deriveEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(secret));
  return "v1." + toBase64(iv) + "." + toBase64(new Uint8Array(ciphertext));
}

async function decryptSecret(value) {
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
