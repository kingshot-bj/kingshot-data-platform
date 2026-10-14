import { encryptSecret, decryptSecret } from "./api-pool.js";

const SECRET_FIELD = /(?:api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|secret|password|credential)/i;

export function validateManualProbeCommand(input = {}) {
  const rawPath = String(input.path || "").trim();
  if (!rawPath || rawPath.length > 500) throw new Error("PROBE_PATH_REQUIRED_OR_TOO_LONG");
  if (!rawPath.startsWith("/") || rawPath.startsWith("//") || rawPath.includes("\\") || /^[a-z][a-z0-9+.-]*:/i.test(rawPath)) {
    throw new Error("PROBE_PATH_MUST_BE_RELATIVE");
  }
  const pathOnly = rawPath.split("?")[0];
  if (pathOnly.split("/").some(segment => segment === "." || segment === "..")) throw new Error("PROBE_PATH_TRAVERSAL_NOT_ALLOWED");
  if (!/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/.test(pathOnly)) throw new Error("PROBE_PATH_HAS_INVALID_CHARACTERS");
  const query = input.query == null || input.query === "" ? {} : input.query;
  if (!query || typeof query !== "object" || Array.isArray(query)) throw new Error("PROBE_QUERY_MUST_BE_JSON_OBJECT");
  const entries = Object.entries(query);
  if (entries.length > 50) throw new Error("PROBE_QUERY_TOO_MANY_FIELDS");
  for (const [key, value] of entries) {
    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(key)) throw new Error("PROBE_QUERY_INVALID_FIELD_NAME");
    if (value !== null && !["string", "number", "boolean"].includes(typeof value)) throw new Error("PROBE_QUERY_VALUES_MUST_BE_SCALARS");
    if (typeof value === "string" && value.length > 2000) throw new Error("PROBE_QUERY_VALUE_TOO_LONG");
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("PROBE_QUERY_INVALID_NUMBER");
  }
  if (JSON.stringify(query).length > 12000) throw new Error("PROBE_QUERY_TOO_LARGE");
  return { path: pathOnly, query };
}

export function redactProbeSecrets(value, depth = 0) {
  if (depth > 30) return "[MAX_DEPTH]";
  if (Array.isArray(value)) return value.map(item => redactProbeSecrets(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] = SECRET_FIELD.test(key) ? "[REDACTED]" : redactProbeSecrets(child, depth + 1);
  }
  return out;
}

export async function addMightPulseProbeKey(db, { apiKey, label = null } = {}) {
  const key = String(apiKey || "").trim();
  if (!key) throw new Error("PROBE_API_KEY_REQUIRED");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const existing = await db.prepare("SELECT key_id FROM mightpulse_probe_keys WHERE key_fingerprint = ? LIMIT 1").bind(fingerprint).first();
  if (existing) throw new Error("PROBE_API_KEY_ALREADY_REGISTERED");
  const keyId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const encrypted = await encryptSecret(key);
  await db.prepare(
    "INSERT INTO mightpulse_probe_keys (key_id, label, encrypted_key, key_fingerprint, status, mighty_capable, mighty_check_status, created_at, updated_at) VALUES (?, ?, ?, ?, 'AVAILABLE', 0, 'UNCONFIRMED', ?, ?)"
  ).bind(keyId, String(label || "Probe専用キー").slice(0, 100), encrypted, fingerprint, now, now).run();
  return { key_id: keyId, label: String(label || "Probe専用キー").slice(0, 100), key_fingerprint: fingerprint.slice(0, 8), status: "AVAILABLE", mighty_capable: false, mighty_check_status: "UNCONFIRMED" };
}

export async function listMightPulseProbeKeys(db) {
  const result = await db.prepare(
    "SELECT key_id, label, key_fingerprint, status, mighty_capable, mighty_check_status, mighty_checked_at, last_used_at, last_success_at, last_error_at, last_error_code, cooldown_until, leased_until, created_at, updated_at, revoked_at FROM mightpulse_probe_keys ORDER BY created_at DESC"
  ).all();
  return (result.results || []).map(row => ({
    ...row,
    key_fingerprint: String(row.key_fingerprint || "").slice(0, 8),
    mighty_capable: Number(row.mighty_capable) === 1
  }));
}

export async function leaseMightPulseProbeKey(db, { mightyRequired = false, purpose = "MIGHTPULSE_PROBE", targetId = null, leaseSeconds = 120 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const leaseId = crypto.randomUUID();
  const expiresAt = now + Math.max(30, Number(leaseSeconds) || 120);
  const mightyCondition = mightyRequired ? " AND mighty_capable = 1 AND mighty_check_status = 'CONFIRMED'" : "";
  const row = await db.prepare(
    "UPDATE mightpulse_probe_keys SET lease_id = ?, leased_until = ?, updated_at = ? WHERE key_id = (SELECT key_id FROM mightpulse_probe_keys WHERE status IN ('AVAILABLE','COOLDOWN') AND (cooldown_until IS NULL OR cooldown_until <= ?) AND (leased_until IS NULL OR leased_until <= ?) AND revoked_at IS NULL" + mightyCondition + " ORDER BY COALESCE(last_used_at,0) ASC, created_at ASC LIMIT 1) RETURNING key_id, label, key_fingerprint, encrypted_key, mighty_capable"
  ).bind(leaseId, expiresAt, now, now, now).first();
  if (!row) return null;
  return {
    lease_id: leaseId, key_id: row.key_id, pool_type: "PROBE_DEDICATED",
    label: row.label, key_fingerprint: String(row.key_fingerprint || "").slice(0, 8),
    mighty_capable: Number(row.mighty_capable) === 1,
    api_key: await decryptSecret(row.encrypted_key), expires_at: expiresAt
  };
}

export async function releaseMightPulseProbeKey(db, leaseId, { status = null, errorCode = null, cooldownSeconds = 0, success = false } = {}) {
  if (!leaseId) return;
  const now = Math.floor(Date.now() / 1000);
  const cooldownUntil = cooldownSeconds > 0 ? now + cooldownSeconds : null;
  const nextStatus = status || (cooldownSeconds > 0 ? "COOLDOWN" : "AVAILABLE");
  await db.prepare(
    "UPDATE mightpulse_probe_keys SET status = ?, cooldown_until = ?, last_used_at = ?, last_success_at = CASE WHEN ? = 1 THEN ? ELSE last_success_at END, last_error_at = CASE WHEN ? IS NOT NULL THEN ? ELSE last_error_at END, last_error_code = ?, lease_id = NULL, leased_until = NULL, updated_at = ? WHERE lease_id = ?"
  ).bind(nextStatus, cooldownUntil, now, success ? 1 : 0, now, errorCode || null, now, errorCode || null, now, leaseId).run();
}

export async function revokeMightPulseProbeKey(db, keyId) {
  if (!keyId) throw new Error("PROBE_KEY_ID_REQUIRED");
  const now = Math.floor(Date.now() / 1000);
  const result = await db.prepare(
    "UPDATE mightpulse_probe_keys SET status = 'REVOKED', revoked_at = ?, lease_id = NULL, leased_until = NULL, updated_at = ? WHERE key_id = ? AND status != 'REVOKED'"
  ).bind(now, now, keyId).run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function setMightPulseProbeKeyMighty(db, keyId, { capable, status, errorCode = null } = {}) {
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(
    "UPDATE mightpulse_probe_keys SET mighty_capable = ?, mighty_check_status = ?, mighty_checked_at = ?, last_error_code = ?, updated_at = ? WHERE key_id = ?"
  ).bind(capable ? 1 : 0, status || (capable ? "CONFIRMED" : "NOT_MIGHTY"), now, errorCode, now, keyId).run();
}

export async function archiveMightPulseProbeRecord(env, record) {
  const id = String(record?.request_id || crypto.randomUUID());
  const now = Math.floor(Date.now() / 1000);
  const date = new Date(now * 1000).toISOString().slice(0, 10);
  const objectKey = "mightpulse-probe/" + date + "/" + id + ".json";
  const safeRecord = redactProbeSecrets(record);
  let r2Saved = false;
  let metadataSaved = false;
  let metadataError = null;

  if (env?.ARCHIVE?.put) {
    try {
      await env.ARCHIVE.put(objectKey, JSON.stringify(safeRecord), {
        httpMetadata: { contentType: "application/json; charset=utf-8" },
        customMetadata: {
          request_id: id,
          status: String(record?.status || "UNKNOWN").slice(0, 40),
          command_type: String(record?.command_type || "UNKNOWN").slice(0, 40),
          created_at: String(now)
        }
      });
      r2Saved = true;
    } catch (error) {
      metadataError = "R2_ARCHIVE_FAILED: " + String(error?.message || error).slice(0, 250);
    }
  }

  if (env?.DB) {
    try {
      await env.DB.prepare(
        "INSERT INTO mightpulse_probe_runs (request_id, created_at, user_id, command_type, endpoint, status, http_status, elapsed_ms, response_bytes, r2_object_key, error_code, trigger_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        id,
        now,
        record?.user_id == null ? null : String(record.user_id).slice(0, 128),
        String(record?.command_type || "UNKNOWN").slice(0, 40),
        String(record?.endpoint || "").slice(0, 500),
        String(record?.status || "UNKNOWN").slice(0, 40),
        Number.isFinite(Number(record?.http_status)) ? Number(record.http_status) : null,
        Number.isFinite(Number(record?.elapsed_ms)) ? Number(record.elapsed_ms) : null,
        JSON.stringify(safeRecord).length,
        r2Saved ? objectKey : null,
        record?.error_code == null ? null : String(record.error_code).slice(0, 100),
        String(record?.trigger_reason || "MANUAL").slice(0, 40)
      ).run();
      metadataSaved = true;
    } catch (error) {
      metadataError = String(error?.message || error).slice(0, 300);
    }
  }

  return { request_id: id, r2_saved: r2Saved, metadata_saved: metadataSaved, object_key: r2Saved ? objectKey : null, metadata_error: metadataError };
}
