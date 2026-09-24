const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
const DISCORD_ME_URL = "https://discord.com/api/users/@me";
const CALLBACK_PATH = "/api/auth/callback";
const SESSION_COOKIE = "eagleeye_session";
const OAUTH_STATE_COOKIE = "eagleeye_oauth_state";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/auth/discord") return await startDiscordLogin(request, env);
      if (url.pathname === CALLBACK_PATH) return await handleDiscordCallback(request, env);
      if (url.pathname === "/api/auth/logout") return logout(request);
      if (url.pathname === "/api/me") return await handleMe(request, env);
      return new Response(renderHome(env), { headers: { "content-type": "text/html; charset=UTF-8" } });
    } catch (error) {
      console.error("EagleEye request error:", error);
      return json({ ok: false, error: "INTERNAL_ERROR" }, 500);
    }
  }
};

function getConfig(env) {
  return {
    clientId: env.DISCORD_CLIENT_ID,
    clientSecret: env.DISCORD_CLIENT_SECRET,
    sessionSecret: env.EAGLEEYE_SESSION_SECRET
  };
}

async function startDiscordLogin(request, env) {
  const config = getConfig(env);
  if (!config.clientId || !config.sessionSecret) {
    return json({ ok: false, error: "DISCORD_AUTH_NOT_CONFIGURED" }, 503);
  }

  const redirectUri = new URL(CALLBACK_PATH, request.url).toString();
  const state = await createStateToken(config.sessionSecret);
  const authorize = new URL(DISCORD_AUTHORIZE_URL);
  authorize.searchParams.set("client_id", config.clientId);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("scope", "identify");
  authorize.searchParams.set("state", state);

  const headers = new Headers({
    Location: authorize.toString(),
    "Cache-Control": "no-store"
  });
  headers.append("Set-Cookie", serializeCookie(OAUTH_STATE_COOKIE, state, {
    maxAge: 600, httpOnly: true, secure: true, sameSite: "Lax", path: "/"
  }));
  return new Response(null, { status: 302, headers });
}

async function handleDiscordCallback(request, env) {
  const config = getConfig(env);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookies = parseCookie(request.headers.get("Cookie") || "");
  const storedState = cookies[OAUTH_STATE_COOKIE];

  if (!config.clientId || !config.clientSecret || !config.sessionSecret) {
    return json({ ok: false, error: "DISCORD_AUTH_NOT_CONFIGURED" }, 503);
  }
  if (!code || !state || !storedState || state !== storedState) {
    return json({ ok: false, error: "INVALID_OAUTH_STATE" }, 400);
  }
  if (!(await verifyStateToken(state, config.sessionSecret))) {
    return json({ ok: false, error: "INVALID_OAUTH_STATE" }, 400);
  }

  const redirectUri = new URL(CALLBACK_PATH, request.url).toString();
  const tokenResponse = await fetch(DISCORD_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    })
  });

  if (!tokenResponse.ok) {
    console.error("Discord token exchange failed:", tokenResponse.status);
    return json({ ok: false, error: "DISCORD_TOKEN_EXCHANGE_FAILED" }, 502);
  }

  const token = await tokenResponse.json();
  const userResponse = await fetch(DISCORD_ME_URL, {
    headers: { Authorization: "Bearer " + token.access_token }
  });

  if (!userResponse.ok) {
    console.error("Discord user lookup failed:", userResponse.status);
    return json({ ok: false, error: "DISCORD_USER_LOOKUP_FAILED" }, 502);
  }

  const discordUser = await userResponse.json();
  const now = Math.floor(Date.now() / 1000);
  const sessionPayload = {
    sub: String(discordUser.id),
    username: discordUser.username || null,
    global_name: discordUser.global_name || null,
    avatar: discordUser.avatar || null,
    iat: now,
    exp: now + SESSION_MAX_AGE
  };
  const session = await signPayload(sessionPayload, config.sessionSecret);

  const headers = new Headers({
    Location: new URL("/", request.url).toString(),
    "Cache-Control": "no-store"
  });
  headers.append("Set-Cookie", serializeCookie(SESSION_COOKIE, session, {
    maxAge: SESSION_MAX_AGE, httpOnly: true, secure: true, sameSite: "Lax", path: "/"
  }));
  headers.append("Set-Cookie", serializeCookie(OAUTH_STATE_COOKIE, "", {
    maxAge: 0, httpOnly: true, secure: true, sameSite: "Lax", path: "/"
  }));
  return new Response(null, { status: 302, headers });
}

function logout(request) {
  const headers = new Headers({
    Location: new URL("/", request.url).toString(),
    "Cache-Control": "no-store"
  });
  headers.append("Set-Cookie", serializeCookie(SESSION_COOKIE, "", {
    maxAge: 0, httpOnly: true, secure: true, sameSite: "Lax", path: "/"
  }));
  return new Response(null, { status: 302, headers });
}

async function handleMe(request, env) {
  const secret = env.EAGLEEYE_SESSION_SECRET;
  const token = parseCookie(request.headers.get("Cookie") || "")[SESSION_COOKIE];
  if (!token || !secret) return json({ ok: true, authenticated: false });

  const session = await verifyPayload(token, secret);
  if (!session) return json({ ok: true, authenticated: false });

  return json({
    ok: true,
    authenticated: true,
    user: {
      discord_id: session.sub,
      username: session.username,
      global_name: session.global_name,
      avatar: session.avatar
    }
  });
}

function renderHome(env) {
  const configured = Boolean(env.DISCORD_CLIENT_ID && env.EAGLEEYE_SESSION_SECRET);
  const note = configured ? "" : '<p class="note">Discord認証はCloudflare側のSecret設定後に有効になります。</p>';
  return '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>KingShot Data Platform — EagleEye</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;color:white;font-family:system-ui,-apple-system,sans-serif}.container{text-align:center;padding:32px;max-width:680px}h1{font-size:32px;margin-bottom:12px}.subtitle{font-size:18px;font-weight:700;letter-spacing:4px;color:#f59e0b;margin-bottom:24px;text-transform:uppercase}p{color:#94a3b8;font-size:16px;line-height:1.7}.status{display:inline-block;margin-top:20px;padding:10px 16px;border-radius:999px;background:#14532d;color:#86efac}.login{display:inline-block;margin-top:28px;padding:13px 22px;border-radius:10px;background:#5865f2;color:white;text-decoration:none;font-weight:700}.note{font-size:13px;margin-top:18px}</style></head><body><main class="container"><h1>KingShot Data Platform</h1><div class="subtitle">EagleEye</div><p>KingShotのデータを集約・分析するプラットフォーム</p><div class="status">● System Online</div><br><a class="login" href="/api/auth/discord">Discordでログイン</a>' + note + '</main></body></html>';
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" }
  });
}

function serializeCookie(name, value, options = {}) {
  const parts = [name + "=" + encodeURIComponent(value)];
  if (options.maxAge !== undefined) parts.push("Max-Age=" + options.maxAge);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) parts.push("SameSite=" + options.sameSite);
  if (options.path) parts.push("Path=" + options.path);
  return parts.join("; ");
}

function parseCookie(header) {
  const result = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return result;
}

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64urlEncodeText(text) {
  return base64url(new TextEncoder().encode(text));
}

function base64urlDecodeText(text) {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  return new TextDecoder().decode(Uint8Array.from(atob(padded), char => char.charCodeAt(0)));
}

async function hmac(input, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input)));
}

async function signPayload(payload, secret) {
  const body = base64urlEncodeText(JSON.stringify(payload));
  return body + "." + base64url(await hmac(body, secret));
}

async function verifyPayload(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const body = parts[0];
  const provided = decodeBase64Url(parts[1]);
  const expected = await hmac(body, secret);
  if (!constantTimeEqual(expected, provided)) return null;
  try {
    const payload = JSON.parse(base64urlDecodeText(body));
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function createStateToken(secret) {
  const body = Date.now() + "." + crypto.randomUUID();
  return base64urlEncodeText(body) + "." + base64url(await hmac(body, secret));
}

async function verifyStateToken(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  let body;
  try {
    body = base64urlDecodeText(parts[0]);
  } catch {
    return false;
  }
  const provided = decodeBase64Url(parts[1]);
  const expected = await hmac(body, secret);
  if (!constantTimeEqual(expected, provided)) return false;
  const timestamp = Number(body.split(".")[0]);
  return Number.isFinite(timestamp) && Date.now() - timestamp < 10 * 60 * 1000;
}

function decodeBase64Url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
