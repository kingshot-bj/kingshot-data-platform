
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

export async function leaseApiKey(db, { provider = PROVIDER, poolType = "SYSTEM_GENERAL", jobId = null, purpose = "GENERAL", targetType = null, targetId = null, leaseSeconds = LEASE_SECONDS } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + Math.max(30, Number(leaseSeconds) || LEASE_SECONDS);
  await releaseExpiredLeases(db, now);

  await db.prepare(
    "UPDATE api_pool_keys SET status = 'AVAILABLE', cooldown_until = NULL, updated_at = ? WHERE provider = ? AND pool_type = ? AND status = 'COOLDOWN' AND cooldown_until IS NOT NULL AND cooldown_until <= ?"
  ).bind(now, provider, poolType, now).run();

  const row = await db.prepare(
    "SELECT k.* FROM api_pool_keys k WHERE k.provider = ? AND k.pool_type = ? AND k.status = 'AVAILABLE' AND (k.cooldown_until IS NULL OR k.cooldown_until <= ?) AND NOT EXISTS (SELECT 1 FROM api_leases l WHERE l.key_id = k.key_id AND l.status = 'ACTIVE' AND l.expires_at > ?) ORDER BY CASE WHEN k.last_used_at IS NULL THEN 0 ELSE 1 END, COALESCE(k.last_used_at, 0) ASC, k.created_at ASC LIMIT 1"
  ).bind(provider, poolType, now, now).first();

  if (!row) throw new Error("NO_API_POOL_KEY_AVAILABLE");

  const leaseId = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO api_leases (lease_id, key_id, pool_type, job_id, purpose, target_type, target_id, status, leased_at, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)"
  ).bind(leaseId, row.key_id, row.pool_type, jobId, purpose, targetType, targetId, now, expiresAt, now).run();

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
  await db.prepare("UPDATE api_leases SET status = 'RELEASED', released_at = ? WHERE lease_id = ? AND status = 'ACTIVE'").bind(now, leaseId).run();
}

export async function recordApiPoolSuccess(db, { keyId, leaseId, endpoint = null, targetType = null, targetId = null, jobId = null, purpose = null, httpStatus = 200, remainingMinute = null, remainingDay = null, quotaResetAt = null } = {}) {
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(
    "UPDATE api_pool_keys SET status = 'AVAILABLE', remaining_minute = COALESCE(?, remaining_minute), remaining_day = COALESCE(?, remaining_day), quota_reset_at = COALESCE(?, quota_reset_at), last_used_at = ?, last_success_at = ?, last_error_code = NULL, last_error_message = NULL, updated_at = ? WHERE key_id = ?"
  ).bind(remainingMinute, remainingDay, quotaResetAt, now, now, now, keyId).run();

  await recordUsage(db, { keyId, endpoint, targetType, targetId, jobId, purpose, httpStatus, measuredRemaining: remainingDay });
  await releaseApiLease(db, leaseId);
}

export async function recordApiPoolFailure(db, { keyId, leaseId, endpoint = null, targetType = null, targetId = null, jobId = null, purpose = null, httpStatus = 0, errorCode = null, errorMessage = null, cooldownSeconds = 0, disable = false, keepAvailable = false } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const status = disable ? "DISABLED" : cooldownSeconds > 0 ? "COOLDOWN" : keepAvailable ? "AVAILABLE" : "ERROR";
  const cooldownUntil = cooldownSeconds > 0 ? now + cooldownSeconds : null;

  await db.prepare(
    "UPDATE api_pool_keys SET status = ?, cooldown_until = ?, last_used_at = ?, last_error_at = ?, last_error_code = ?, last_error_message = ?, updated_at = ? WHERE key_id = ?"
  ).bind(status, cooldownUntil, now, now, errorCode, truncate(errorMessage, 500), now, keyId).run();

  await recordUsage(db, { keyId, endpoint, targetType, targetId, jobId, purpose, httpStatus });
  await releaseApiLease(db, leaseId);
}

export async function recordUsage(db, { keyId, provider = PROVIDER, poolType = null, endpoint = null, targetType = null, targetId = null, jobId = null, purpose = null, httpStatus = null, requestCount = 1, measuredQuota = null, measuredRemaining = null, estimated = 0 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const usageId = crypto.randomUUID();
  if (!poolType && keyId) {
    const key = await db.prepare("SELECT pool_type FROM api_pool_keys WHERE key_id = ? LIMIT 1").bind(keyId).first();
    poolType = key?.pool_type || "SYSTEM_GENERAL";
  }
  await db.prepare(
    "INSERT INTO api_pool_usage (usage_id, key_id, provider, pool_type, endpoint, target_type, target_id, job_id, purpose, http_status, request_count, measured_quota, measured_remaining, estimated, used_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(usageId, keyId, provider, poolType, endpoint, targetType, targetId, jobId, purpose, httpStatus, requestCount, measuredQuota, measuredRemaining, estimated ? 1 : 0, now, now).run();
}

export async function releaseExpiredLeases(db, now = Math.floor(Date.now() / 1000)) {
  await db.prepare("UPDATE api_leases SET status = 'EXPIRED' WHERE status = 'ACTIVE' AND expires_at <= ?").bind(now).run();
}

export async function getPoolStats(db) {
  const result = await db.prepare("SELECT pool_type, status, COUNT(*) AS count FROM api_pool_keys GROUP BY pool_type, status ORDER BY pool_type, status").all();
  return result.results || [];
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
