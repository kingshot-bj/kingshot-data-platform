import { mightPulseFetch } from "./mightpulse.js";

const PROVIDER = "MIGHTPULSE";

function now() {
  return Math.floor(Date.now() / 1000);
}

function fingerprintKey(apiKey) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKey))
    .then(bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join(""));
}

function base64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(value || "").length + 3) % 4);
  const binary = atob(normalized);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function deriveKey(secret) {
  if (!secret) throw new Error("MIGHTY_ENCRYPTION_SECRET_NOT_CONFIGURED");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("EagleEye Mighty Credential Encryption v1:" + secret)
  );
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptKey(apiKey, secret) {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(apiKey)
  );
  return "v1." + base64(iv) + "." + base64(new Uint8Array(ciphertext));
}

async function decryptKey(value, secret) {
  const parts = String(value || "").split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("INVALID_ENCRYPTED_MIGHTY_KEY");
  const key = await deriveKey(secret);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(parts[1]) },
    key,
    fromBase64(parts[2])
  );
  return new TextDecoder().decode(plaintext);
}

function credentialError(code, userMessage) {
  const error = new Error(code);
  error.code = code;
  error.userMessage = userMessage;
  return error;
}

async function validateMightyKey(env, apiKey) {
  try {
    // /kvk/matchups is Mighty-only and does not require a kingdom/player id.
    return await mightPulseFetch(env, "/kvk/matchups", {
      apiKey,
      timeoutMs: 15000,
      maxRetries: 1
    });
  } catch (error) {
    const status = Number(error?.status || 0);
    if (status === 401) throw credentialError("MIGHTY_API_KEY_INVALID", "Mighty APIキーが無効です。");
    if (status === 403) throw credentialError("MIGHTY_API_KEY_REQUIRED", "登録したキーはMighty APIキーとして認証されませんでした。");
    if (status === 429) throw credentialError("MIGHTY_API_KEY_RATE_LIMITED", "Mighty APIがレート制限中です。少し時間を置いて再試行してください。");
    if (status >= 500 || error?.retryable) throw credentialError("MIGHTY_API_TEMPORARY_ERROR", "MightPulseへの疎通確認に失敗しました。しばらくしてから再試行してください。");
    throw credentialError("MIGHTY_API_KEY_VALIDATION_FAILED", "Mighty APIキーの確認に失敗しました。");
  }
}

export async function registerUserMightyKey(db, { env, userId, apiKey, label = "Mighty APIキー" } = {}) {
  const normalizedUserId = String(userId || "").trim();
  const key = String(apiKey || "").trim();
  if (!normalizedUserId) throw credentialError("USER_ID_REQUIRED", "ユーザー情報がありません。");
  if (!key) throw credentialError("MIGHTY_API_KEY_REQUIRED", "Mighty APIキーを入力してください。");
  if (!env?.EAGLEEYE_SESSION_SECRET) throw credentialError("MIGHTY_ENCRYPTION_SECRET_NOT_CONFIGURED", "Mighty APIキーを保存できる設定がありません。");

  const existing = await db.prepare(
    "SELECT credential_id, status FROM user_mighty_credentials WHERE user_id = ? AND status != 'REVOKED' LIMIT 1"
  ).bind(normalizedUserId).first();
  if (existing) throw credentialError("MIGHTY_API_KEY_ALREADY_REGISTERED", "Mighty APIキーはすでに登録されています。");

  const fingerprint = await fingerprintKey(key);
  const duplicate = await db.prepare(
    "SELECT credential_id FROM user_mighty_credentials WHERE key_fingerprint = ? LIMIT 1"
  ).bind(fingerprint).first();
  if (duplicate) throw credentialError("MIGHTY_API_KEY_ALREADY_REGISTERED", "このMighty APIキーはすでに登録されています。");

  await validateMightyKey(env, key);

  const timestamp = now();
  const credentialId = crypto.randomUUID();
  const encrypted = await encryptKey(key, env.EAGLEEYE_SESSION_SECRET);
  await db.prepare(
    "INSERT INTO user_mighty_credentials (credential_id,user_id,provider,label,encrypted_key,key_fingerprint,status,last_verified_at,created_at,updated_at) VALUES (?,?,?,?,? ,?,'AVAILABLE',?,?,?)"
  ).bind(
    credentialId, normalizedUserId, PROVIDER, String(label || "Mighty APIキー").slice(0, 100),
    encrypted, fingerprint, timestamp, timestamp, timestamp
  ).run();

  return { credential_id: credentialId, status: "AVAILABLE", last_verified_at: timestamp };
}

export async function getUserMightyCredential(db, { env, userId, includeSecret = false } = {}) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return null;
  const row = await db.prepare(
    "SELECT credential_id,user_id,provider,label,key_fingerprint,status,last_verified_at,last_success_at,last_error_at,last_error_code,last_error_message,created_at,updated_at,revoked_at,encrypted_key FROM user_mighty_credentials WHERE user_id = ? AND status != 'REVOKED' ORDER BY created_at DESC LIMIT 1"
  ).bind(normalizedUserId).first();
  if (!row) return null;
  const result = {
    credential_id: row.credential_id,
    user_id: row.user_id,
    provider: row.provider,
    label: row.label,
    key_fingerprint: row.key_fingerprint ? String(row.key_fingerprint).slice(-8) : null,
    status: row.status,
    last_verified_at: row.last_verified_at,
    last_success_at: row.last_success_at,
    last_error_at: row.last_error_at,
    last_error_code: row.last_error_code,
    last_error_message: row.last_error_message,
    created_at: row.created_at,
    updated_at: row.updated_at,
    revoked_at: row.revoked_at
  };
  if (includeSecret) {
    if (!env?.EAGLEEYE_SESSION_SECRET) throw new Error("MIGHTY_ENCRYPTION_SECRET_NOT_CONFIGURED");
    result.api_key = await decryptKey(row.encrypted_key, env.EAGLEEYE_SESSION_SECRET);
  }
  return result;
}

export async function revokeUserMightyKey(db, userId) {
  const timestamp = now();
  const result = await db.prepare(
    "UPDATE user_mighty_credentials SET status='REVOKED', revoked_at=?, updated_at=? WHERE user_id=? AND status != 'REVOKED'"
  ).bind(timestamp, timestamp, String(userId || "").trim()).run();
  return { changed: Number(result?.meta?.changes || 0) > 0 };
}
