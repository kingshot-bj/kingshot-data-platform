// Discord OAuth support-guild join and configuration checks.
//
// Discord only accepts PUT /guilds/{guild}/members/{user} when the user's
// OAuth2 access token was issued to the same application that owns the bot
// token. A mismatch returns HTTP 403 / code 50025 ("Invalid OAuth2 access
// token"), which is what production hit while DISCORD_CLIENT_ID pointed at a
// different application than DISCORD_BOT_TOKEN. This module detects that
// mismatch before calling Discord, bounds every Discord call with a timeout so
// login is never held up, and never returns or logs token values.

const DISCORD_API_BASE = "https://discord.com/api/v10";
const DEFAULT_TIMEOUT_MS = 5000;
const APPLICATION_CACHE_TTL_MS = 10 * 60 * 1000;
const USER_AGENT = "EagleEye/1.0 (support)";

let applicationCache = null;

export function resetDiscordApplicationCache() {
  applicationCache = null;
}

function normalizeDiscordId(value) {
  const id = String(value ?? "").trim();
  return /^\d{15,25}$/.test(id) ? id : null;
}

function codedError(code, message = code, extra = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, extra);
  return error;
}

async function discordFetch(fetchImpl, path, { method = "GET", headers = {}, body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  try {
    return await fetchImpl(DISCORD_API_BASE + path, {
      method,
      headers: { "User-Agent": USER_AGENT, ...headers },
      body,
      signal: AbortSignal.timeout(Math.max(500, Number(timeoutMs) || DEFAULT_TIMEOUT_MS))
    });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    throw codedError(timedOut ? "DISCORD_API_TIMEOUT" : "DISCORD_API_NETWORK_ERROR",
      timedOut ? "Discord API request timed out" : "Discord API network error");
  }
}

async function readJson(response) {
  const text = await response.text().catch(() => "");
  try { return text ? JSON.parse(text) : null; } catch { return null; }
}

// Returns the application that owns DISCORD_BOT_TOKEN. Cached per isolate so a
// normal login adds no extra Discord round-trip; secrets changes deploy a new
// isolate, which naturally clears the cache.
export async function getBotApplication(env, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, useCache = true } = {}) {
  const botToken = String(env?.DISCORD_BOT_TOKEN || "").trim();
  if (!botToken) throw codedError("DISCORD_BOT_TOKEN_NOT_CONFIGURED");
  const now = Date.now();
  if (useCache && applicationCache && now - applicationCache.at < APPLICATION_CACHE_TTL_MS) {
    return { ...applicationCache.value, cached: true };
  }
  const response = await discordFetch(fetchImpl, "/applications/@me", {
    headers: { Authorization: `Bot ${botToken}` },
    timeoutMs
  });
  const data = await readJson(response);
  if (!response.ok) {
    throw codedError("DISCORD_BOT_APPLICATION_LOOKUP_FAILED",
      `Discord bot application lookup failed (HTTP ${response.status})`,
      { status: response.status, discord: data ? { code: data.code ?? null } : null });
  }
  const value = {
    httpStatus: response.status,
    id: normalizeDiscordId(data?.id),
    verifyKey: typeof data?.verify_key === "string" ? data.verify_key.trim().toLowerCase() : null,
    interactionsEndpointUrl: typeof data?.interactions_endpoint_url === "string" ? data.interactions_endpoint_url : null
  };
  applicationCache = { at: now, value };
  return { ...value, cached: false };
}

async function lookupOAuthTokenInfo(fetchImpl, userAccessToken, timeoutMs) {
  try {
    const response = await discordFetch(fetchImpl, "/oauth2/@me", {
      headers: { Authorization: "Bearer " + userAccessToken },
      timeoutMs
    });
    const data = response.ok ? await readJson(response) : null;
    return {
      oauthInfoHttpStatus: response.status,
      oauthApplicationId: normalizeDiscordId(data?.application?.id),
      oauthScopes: Array.isArray(data?.scopes) ? data.scopes.filter(x => typeof x === "string") : []
    };
  } catch (error) {
    return { oauthInfoHttpStatus: null, oauthInfoError: error?.code || "DISCORD_API_ERROR" };
  }
}

export async function joinDiscordSupportGuild(env, discordUserId, userAccessToken, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const guildId = String(env?.DISCORD_SUPPORT_GUILD_ID || "").trim();
  const botToken = String(env?.DISCORD_BOT_TOKEN || "").trim();
  if (!guildId) throw codedError("DISCORD_SUPPORT_GUILD_ID_NOT_CONFIGURED");
  if (!botToken) throw codedError("DISCORD_BOT_TOKEN_NOT_CONFIGURED");
  if (!discordUserId) throw codedError("DISCORD_USER_ID_REQUIRED");
  if (!userAccessToken) throw codedError("DISCORD_USER_ACCESS_TOKEN_REQUIRED");

  const configuredClientId = normalizeDiscordId(env?.DISCORD_CLIENT_ID);
  const diagnostics = { configuredClientId };

  // 1. Same-application guard. If the bot belongs to a different application
  //    than the OAuth client, Discord would reject the join with 50025, so skip
  //    the request and record an explicit configuration error instead. A failed
  //    lookup is not a reason to block the join attempt.
  try {
    const application = await getBotApplication(env, { fetchImpl, timeoutMs });
    diagnostics.botApplicationId = application.id;
    diagnostics.botApplicationHttpStatus = application.httpStatus;
    diagnostics.clientIdMatchesBotApplication = Boolean(configuredClientId && application.id === configuredClientId);
    if (configuredClientId && application.id && application.id !== configuredClientId) {
      throw codedError("DISCORD_OAUTH_BOT_APP_MISMATCH",
        "DISCORD_CLIENT_ID and DISCORD_BOT_TOKEN belong to different Discord applications",
        { oauthDiagnostics: diagnostics });
    }
  } catch (error) {
    if (error?.code === "DISCORD_OAUTH_BOT_APP_MISMATCH") throw error;
    diagnostics.botApplicationHttpStatus = Number(error?.status || 0) || null;
    diagnostics.botApplicationError = error?.code || "DISCORD_BOT_APPLICATION_LOOKUP_FAILED";
  }

  const memberPath = `/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(discordUserId)}`;

  // 2. Join. Token-info lookup only happens on failure, to keep login fast.
  let joinResponse;
  try {
    joinResponse = await discordFetch(fetchImpl, memberPath, {
      method: "PUT",
      headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: userAccessToken }),
      timeoutMs
    });
  } catch (error) {
    error.oauthDiagnostics = diagnostics;
    throw error;
  }
  diagnostics.joinHttpStatus = joinResponse.status;
  if (!joinResponse.ok) {
    const data = await readJson(joinResponse);
    Object.assign(diagnostics, await lookupOAuthTokenInfo(fetchImpl, userAccessToken, timeoutMs));
    throw codedError("DISCORD_GUILD_JOIN_FAILED",
      data?.message || `Discord guild join failed (HTTP ${joinResponse.status})`,
      { status: joinResponse.status, discord: data ? { code: data.code ?? null, message: data.message ?? null } : null, oauthDiagnostics: diagnostics });
  }

  // 3. Verify membership with the bot so the support gate reflects reality.
  let verifyResponse;
  try {
    verifyResponse = await discordFetch(fetchImpl, memberPath, {
      headers: { Authorization: `Bot ${botToken}` },
      timeoutMs
    });
  } catch (error) {
    error.code = "DISCORD_GUILD_MEMBERSHIP_VERIFY_FAILED";
    error.oauthDiagnostics = diagnostics;
    throw error;
  }
  diagnostics.membershipVerifyHttpStatus = verifyResponse.status;
  if (!verifyResponse.ok) {
    const data = await readJson(verifyResponse);
    throw codedError(
      verifyResponse.status === 404 ? "DISCORD_GUILD_MEMBERSHIP_NOT_CONFIRMED" : "DISCORD_GUILD_MEMBERSHIP_VERIFY_FAILED",
      data?.message || `Discord guild membership verification failed (HTTP ${verifyResponse.status})`,
      { status: verifyResponse.status, discord: data ? { code: data.code ?? null } : null, oauthDiagnostics: diagnostics });
  }

  return {
    result: joinResponse.status === 201 ? "ADDED" : "ALREADY_MEMBER",
    membershipVerified: true,
    oauthDiagnostics: diagnostics
  };
}

// Owner diagnostics: compares Cloudflare configuration with the live Discord
// application. Only IDs, URLs and match flags are returned; the public key is
// compared but not echoed, and no token value ever leaves this function.
export async function getDiscordConfigCheck(env, { origin, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const configuredClientId = normalizeDiscordId(env?.DISCORD_CLIENT_ID);
  const guildId = normalizeDiscordId(env?.DISCORD_SUPPORT_GUILD_ID);
  const configuredPublicKey = String(env?.DISCORD_PUBLIC_KEY || "").trim().toLowerCase();
  const expectedInteractionsEndpointUrl = origin ? new URL("/api/discord/interactions", origin).toString() : null;
  const result = {
    configuredClientId,
    botApplication: { httpStatus: null, id: null, error: null },
    clientIdMatchesBotApplication: false,
    publicKeyConfigured: Boolean(configuredPublicKey),
    publicKeyMatches: false,
    interactionsEndpointUrl: null,
    expectedInteractionsEndpointUrl,
    interactionsEndpointMatches: false,
    commands: { httpStatus: null, close: false, reopen: false, error: null }
  };

  let application = null;
  try {
    application = await getBotApplication(env, { fetchImpl, timeoutMs, useCache: false });
    result.botApplication = { httpStatus: application.httpStatus, id: application.id, error: null };
  } catch (error) {
    result.botApplication = { httpStatus: Number(error?.status || 0) || null, id: null, error: error?.code || "DISCORD_BOT_APPLICATION_LOOKUP_FAILED" };
    return result;
  }

  result.clientIdMatchesBotApplication = Boolean(configuredClientId && application.id === configuredClientId);
  result.publicKeyMatches = Boolean(configuredPublicKey && application.verifyKey && configuredPublicKey === application.verifyKey);
  result.interactionsEndpointUrl = application.interactionsEndpointUrl;
  result.interactionsEndpointMatches = Boolean(expectedInteractionsEndpointUrl && application.interactionsEndpointUrl === expectedInteractionsEndpointUrl);

  if (application.id && guildId) {
    try {
      const response = await discordFetch(fetchImpl, `/applications/${application.id}/guilds/${guildId}/commands`, {
        headers: { Authorization: `Bot ${String(env.DISCORD_BOT_TOKEN).trim()}` },
        timeoutMs
      });
      const data = await readJson(response);
      const names = Array.isArray(data) ? data.map(command => String(command?.name || "")) : [];
      result.commands = { httpStatus: response.status, close: names.includes("close"), reopen: names.includes("reopen"), error: response.ok ? null : "DISCORD_COMMAND_LOOKUP_FAILED" };
    } catch (error) {
      result.commands = { httpStatus: null, close: false, reopen: false, error: error?.code || "DISCORD_COMMAND_LOOKUP_FAILED" };
    }
  }
  return result;
}
