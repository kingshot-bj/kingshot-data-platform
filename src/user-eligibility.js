import { runSystemOperation, createSystemTrace } from "./system-log.js";
import { addApiPoolKey } from "./api-pool.js";
import { ensureSchema as ensureUserPlayerLinkSchema } from "./user-player-link.js";
import { mightPulseFetch } from "./mightpulse.js";
const ADVANCED_ROLE = "ADVANCED";
const VIP_ROLE = "VIP";
export const MAX_USER_CONTRIBUTED_MIGHTPULSE_KEYS = Number.POSITIVE_INFINITY;

async function registerUserMightPulseApiKeyInternal(db, {
  env,
  userId,
  apiKey,
  label = "ユーザー提供MightPulseキー"
} = {}) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    const error = new Error("USER_ID_REQUIRED");
    error.code = "USER_ID_REQUIRED";
    throw error;
  }

  if (!env) {
    const error = new Error("ENV_REQUIRED");
    error.code = "ENV_REQUIRED";
    throw error;
  }

  const key = String(apiKey || "").trim();
  if (!key) {
    const error = new Error("MIGHTPULSE_API_KEY_REQUIRED");
    error.code = "MIGHTPULSE_API_KEY_REQUIRED";
    throw error;
  }

  const existingKeys = await db.prepare(
    "SELECT key_id, key_fingerprint, status, contributed_at FROM api_pool_keys WHERE provider = 'MIGHTPULSE' AND pool_type = 'USER_CONTRIBUTED' AND contributed_by_user_id = ? AND status != 'REVOKED' ORDER BY contributed_at ASC"
  ).bind(normalizedUserId).all();
  const activeKeys = existingKeys.results || [];
  // User-contributed MightPulse keys are intentionally not capped.
  // Mighty users are a separate, prioritized pool, so each user may register
  // as many valid non-duplicate keys as needed. Duplicate fingerprints and
  // revoked-key exclusion remain enforced below.
  // Validate the contributed key independently of the user's KingShot link.
  // A user may contribute an API key before registering any player account.
  try {
    await mightPulseFetch(env, "/kingdoms", {
      query: { page: 1, size: 1 },
      apiKey: key,
      timeoutMs: 15000,
      maxRetries: 1
    });
  } catch (error) {
    const status = Number(error?.status || 0);
    const wrapped = new Error("MIGHTPULSE_API_KEY_VALIDATION_FAILED");
    wrapped.code =
      status === 401 || status === 403 ? "MIGHTPULSE_API_KEY_INVALID" :
      status === 429 ? "MIGHTPULSE_API_KEY_RATE_LIMITED" :
      status >= 500 || error?.retryable ? "MIGHTPULSE_API_TEMPORARY_ERROR" :
      "MIGHTPULSE_API_KEY_VALIDATION_FAILED";
    wrapped.userMessage =
      wrapped.code === "MIGHTPULSE_API_KEY_INVALID"
        ? "MightPulse APIキーが無効、または認証に失敗しました。キーを確認してください。"
        : wrapped.code === "MIGHTPULSE_API_KEY_RATE_LIMITED"
        ? "MightPulse APIがレート制限中です。少し時間を置いて再試行してください。"
        : "MightPulseへの疎通確認に失敗しました。APIキーは登録していません。しばらくしてから再試行してください。";
    throw wrapped;
  }

  const fingerprint = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const fingerprintHex = Array.from(new Uint8Array(fingerprint), b => b.toString(16).padStart(2, "0")).join("");
  if (activeKeys.some(row => String(row.key_fingerprint || "") === fingerprintHex)) {
    const error = new Error("MIGHTPULSE_API_KEY_ALREADY_REGISTERED");
    error.code = "MIGHTPULSE_API_KEY_ALREADY_REGISTERED";
    error.userMessage = "このMightPulse APIキーはすでに登録されています。";
    throw error;
  }

  const added = await addApiPoolKey(db, {
    provider: "MIGHTPULSE",
    poolType: "USER_CONTRIBUTED",
    label,
    apiKey: key,
    contributedByUserId: normalizedUserId,
    consentVersion: "USER_CONTRIBUTED_V1"
  });



  return added;
}

export async function getAdvancedEligibility(db, userId) {
  const normalizedUserId = String(userId || "").trim();
  await ensureUserPlayerLinkSchema(db);
  if (!normalizedUserId) {
    return {
      eligible: false,
      hasPlayerLink: false,
      hasMightPulseKey: false,
      role: null
    };
  }

  const [user, playerLink, apiKey] = await Promise.all([
    db.prepare(
      "SELECT user_id, role, status FROM users WHERE user_id = ? LIMIT 1"
    ).bind(normalizedUserId).first(),
    db.prepare(
      "SELECT user_id, governor_id, status, verification_method FROM user_player_links WHERE user_id = ? AND status = 'ACTIVE' LIMIT 1"
    ).bind(normalizedUserId).first(),
    db.prepare(
      "SELECT key_id, key_fingerprint, status, contributed_at FROM api_pool_keys WHERE provider = 'MIGHTPULSE' AND pool_type = 'USER_CONTRIBUTED' AND contributed_by_user_id = ? AND status != 'REVOKED' ORDER BY contributed_at ASC"
    ).bind(normalizedUserId).all()
  ]);

  const contributedKeys = apiKey?.results || [];
  const hasPlayerLink = Boolean(playerLink);
  const hasMightPulseKey = contributedKeys.length > 0;
  const eligible = hasPlayerLink && hasMightPulseKey;

  return {
    eligible,
    hasPlayerLink,
    hasMightPulseKey,
    mightPulseKeyCount: contributedKeys.length,
    mightPulseKeyLimit: MAX_USER_CONTRIBUTED_MIGHTPULSE_KEYS,
    role: user?.role || null,
    userStatus: user?.status || null,
    playerLink: playerLink || null,
    apiKeys: contributedKeys.map(row => ({
      key_id: row.key_id,
      key_fingerprint: row.key_fingerprint ? String(row.key_fingerprint).slice(-8) : null,
      status: row.status,
      contributed_at: row.contributed_at
    }))
  };
}

async function evaluateAdvancedEligibilityInternal(db, userId) {
  const normalizedUserId = String(userId || "").trim();
  const eligibility = await getAdvancedEligibility(db, normalizedUserId);

  if (!eligibility.eligible || eligibility.role !== "BASIC") {
    return {
      ...eligibility,
      promoted: false
    };
  }

  const now = Math.floor(Date.now() / 1000);
  const result = await db.prepare(
    "UPDATE users SET role = ?, updated_at = ? WHERE user_id = ? AND role = 'BASIC' AND status = 'ACTIVE'"
  ).bind(ADVANCED_ROLE, now, normalizedUserId).run();

  return {
    ...eligibility,
    role: result?.meta?.changes === 1 ? ADVANCED_ROLE : eligibility.role,
    promoted: result?.meta?.changes === 1
  };
}


export async function registerUserMightPulseApiKey(db, options) {
  const trace = createSystemTrace({ actorType: "USER", actorId: options?.userId || null, targetType: "API_KEY" });
  return runSystemOperation(db, trace, {
    eventType: "D1_WRITE", service: "user_eligibility", feature: "api_key_contribution",
    operation: "REGISTER_USER_MIGHTPULSE_API_KEY", targetType: "API_KEY"
  }, () => registerUserMightPulseApiKeyInternal(db, options));
}

export async function evaluateAdvancedEligibility(db, userId) {
  const trace = createSystemTrace({ actorType: "USER", actorId: userId, targetType: "USER", targetId: userId });
  return runSystemOperation(db, trace, {
    eventType: "D1_WRITE", service: "user_eligibility", feature: "eligibility",
    operation: "EVALUATE_ADVANCED_ELIGIBILITY", targetType: "USER", targetId: userId
  }, () => evaluateAdvancedEligibilityInternal(db, userId));
}


export async function getVipEligibility(db, { userId } = {}) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return { eligible: false, role: null, keyCount: 0, hasMightyKey: false, mightyKeyStatus: null, mightyKey: null, apiKeys: [] };

  const user = await db.prepare("SELECT user_id, role, status FROM users WHERE user_id = ? LIMIT 1").bind(normalizedUserId).first();
  const contributedKeys = (await db.prepare("SELECT key_id, key_fingerprint, status, contributed_at, mighty_capable, mighty_checked_at, mighty_check_status, mighty_last_error_code FROM api_pool_keys WHERE provider='MIGHTPULSE' AND pool_type='USER_CONTRIBUTED' AND contributed_by_user_id=? AND status != 'REVOKED' ORDER BY contributed_at ASC").bind(normalizedUserId).all()).results || [];
  const mightyKey = contributedKeys.find(row => Number(row.mighty_capable) === 1 && String(row.mighty_check_status || "").toUpperCase() === "CONFIRMED") || null;
  const hasMightyKey = Boolean(mightyKey);

  return {
    eligible: hasMightyKey,
    role: user?.role || null,
    userStatus: user?.status || null,
    keyCount: contributedKeys.length,
    hasMightyKey,
    mightyKeyStatus: mightyKey?.mighty_check_status || null,
    mightyKey: mightyKey ? { key_id: mightyKey.key_id, key_fingerprint: mightyKey.key_fingerprint ? String(mightyKey.key_fingerprint).slice(-8) : null, status: mightyKey.status, mighty_checked_at: mightyKey.mighty_checked_at, mighty_check_status: mightyKey.mighty_check_status } : null,
    apiKeys: contributedKeys.map(row => ({ key_id: row.key_id, status: row.status, contributed_at: row.contributed_at, mighty_capable: Number(row.mighty_capable) === 1, mighty_check_status: row.mighty_check_status, mighty_checked_at: row.mighty_checked_at }))
  };
}

export async function evaluateVipEligibility(db, { userId } = {}) {
  const normalizedUserId = String(userId || "").trim();
  const eligibility = await getVipEligibility(db, { userId: normalizedUserId });
  const role = String(eligibility.role || "").toUpperCase();

  if (!normalizedUserId || !role || !["BASIC","ADVANCED","VIP","ADMIN","OWNER"].includes(role)) {
    return { ...eligibility, changed: false, promoted: false, demoted: false };
  }

  // ADMIN / OWNER already outrank VIP. They must never be downgraded or
  // promoted to VIP, but confirmed Mighty eligibility should still unlock
  // the VIP/Mighty feature set.
  if (eligibility.eligible && ["ADMIN","OWNER"].includes(role)) {
    return {
      ...eligibility,
      changed: false,
      promoted: false,
      demoted: false,
      featureEligible: true
    };
  }

  const now = Math.floor(Date.now() / 1000);
  if (eligibility.eligible && role !== VIP_ROLE) {
    const result = await db.prepare(
      "UPDATE users SET role=?, updated_at=? WHERE user_id=? AND role IN ('BASIC','ADVANCED') AND status='ACTIVE'"
    ).bind(VIP_ROLE, now, normalizedUserId).run();
    return { ...eligibility, role: result?.meta?.changes === 1 ? VIP_ROLE : eligibility.role, changed: result?.meta?.changes === 1, promoted: result?.meta?.changes === 1, demoted: false, featureEligible: true };
  }

  if (!eligibility.eligible && role === VIP_ROLE) {
    const result = await db.prepare(
      "UPDATE users SET role='ADVANCED', updated_at=? WHERE user_id=? AND role='VIP' AND status='ACTIVE'"
    ).bind(now, normalizedUserId).run();
    return { ...eligibility, role: result?.meta?.changes === 1 ? "ADVANCED" : eligibility.role, changed: result?.meta?.changes === 1, promoted: false, demoted: result?.meta?.changes === 1, featureEligible: false };
  }

  return { ...eligibility, changed: false, promoted: false, demoted: false, featureEligible: Boolean(eligibility.eligible) };
}

