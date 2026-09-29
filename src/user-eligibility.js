import { addApiPoolKey } from "./api-pool.js";
import { ensureSchema as ensureUserPlayerLinkSchema } from "./user-player-link.js";
import { getMightPulsePlayer } from "./mightpulse.js";

const ADVANCED_ROLE = "ADVANCED";

export async function registerUserMightPulseApiKey(db, {
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

  await ensureUserPlayerLinkSchema(db);
  const playerLink = await db.prepare(
    "SELECT governor_id FROM user_player_links WHERE user_id = ? AND status = 'ACTIVE' ORDER BY CASE account_type WHEN 'MAIN' THEN 0 ELSE 1 END, created_at ASC LIMIT 1"
  ).bind(normalizedUserId).first();
  if (!playerLink?.governor_id) {
    const error = new Error("PLAYER_LINK_REQUIRED_FOR_KEY_VALIDATION");
    error.code = "PLAYER_LINK_REQUIRED_FOR_KEY_VALIDATION";
    error.userMessage = "先にKingShot領主IDを登録してください。登録済みの領主IDを使ってMightPulse APIキーの疎通確認を行います。";
    throw error;
  }

  let validation;
  try {
    validation = await getMightPulsePlayer(env, playerLink.governor_id, {
      include: "base",
      apiKey: key
    });
  } catch (error) {
    const status = Number(error?.status || 0);
    const wrapped = new Error("MIGHTPULSE_API_KEY_VALIDATION_FAILED");
    wrapped.code =
      status === 401 || status === 403 ? "MIGHTPULSE_API_KEY_INVALID" :
      status === 404 ? "MIGHTPULSE_PLAYER_NOT_AVAILABLE" :
      status === 429 ? "MIGHTPULSE_API_KEY_RATE_LIMITED" :
      status >= 500 || error?.retryable ? "MIGHTPULSE_API_TEMPORARY_ERROR" :
      "MIGHTPULSE_API_KEY_VALIDATION_FAILED";
    wrapped.userMessage =
      wrapped.code === "MIGHTPULSE_API_KEY_INVALID"
        ? "MightPulse APIキーが無効、または認証に失敗しました。キーを確認してください。"
        : wrapped.code === "MIGHTPULSE_PLAYER_NOT_AVAILABLE"
        ? "登録済みの領主IDをMightPulseで確認できませんでした。APIキーは登録していません。"
        : wrapped.code === "MIGHTPULSE_API_KEY_RATE_LIMITED"
        ? "MightPulse APIがレート制限中です。少し時間を置いて再試行してください。"
        : "MightPulseへの疎通確認に失敗しました。APIキーは登録していません。しばらくしてから再試行してください。";
    throw wrapped;
  }

  const verifiedGovernorId = String(validation?.data?.governor_id || validation?.data?.player?.governor_id || "");
  if (verifiedGovernorId && verifiedGovernorId !== String(playerLink.governor_id)) {
    const error = new Error("MIGHTPULSE_PLAYER_MISMATCH");
    error.code = "MIGHTPULSE_PLAYER_MISMATCH";
    error.userMessage = "MightPulseから返された領主IDが登録済みの領主IDと一致しません。APIキーは登録していません。";
    throw error;
  }

  return addApiPoolKey(db, {
    provider: "MIGHTPULSE",
    poolType: "USER_CONTRIBUTED",
    label,
    apiKey: key,
    contributedByUserId: normalizedUserId,
    consentVersion: "USER_CONTRIBUTED_V1"
  });
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
      "SELECT key_id, status, contributed_at FROM api_pool_keys WHERE provider = 'MIGHTPULSE' AND pool_type = 'USER_CONTRIBUTED' AND contributed_by_user_id = ? AND status != 'REVOKED' ORDER BY contributed_at DESC LIMIT 1"
    ).bind(normalizedUserId).first()
  ]);

  const hasPlayerLink = Boolean(playerLink);
  const hasMightPulseKey = Boolean(apiKey);
  const eligible = hasPlayerLink && hasMightPulseKey;

  return {
    eligible,
    hasPlayerLink,
    hasMightPulseKey,
    role: user?.role || null,
    userStatus: user?.status || null,
    playerLink: playerLink || null,
    apiKey: apiKey ? {
      key_id: apiKey.key_id,
      status: apiKey.status,
      contributed_at: apiKey.contributed_at
    } : null
  };
}

export async function evaluateAdvancedEligibility(db, userId) {
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
