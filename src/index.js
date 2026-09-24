const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
const DISCORD_ME_URL = "https://discord.com/api/users/@me";
const CALLBACK_PATH = "/api/auth/callback";
const DEFAULT_DISCORD_REDIRECT_URI = "https://kingshot-data-platform.black-jack-kingshot.workers.dev/api/auth/callback";
const SESSION_COOKIE = "eagleeye_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

import { getMightPulsePlayer } from "./mightpulse.js";
import { observationEnvelope } from "./mightpulse-normalizer.js";
import { saveApiObservation } from "./api-observations.js";
import { getLatestPlayerObservation, materializePlayer, getPlayer } from "./player-store.js";
import { configureApiPoolEncryption, addApiPoolKey, listApiPoolKeys, leaseApiKey, recordApiPoolSuccess, recordApiPoolFailure, getPoolStats } from "./api-pool.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/auth/discord") return await startDiscordLogin(request, env);
      if (url.pathname === CALLBACK_PATH) return await handleDiscordCallback(request, env);
      if (url.pathname === "/api/auth/logout") return logout(request);
      if (url.pathname === "/api/me") return await handleMe(request, env);
      if (url.pathname === "/api/admin/mightpulse/player") return await handleMightPulsePlayerTest(request, env);
      if (url.pathname === "/api/admin/api-pool/keys") return await handleApiPoolKeys(request, env);
      if (url.pathname === "/api/admin/api-pool/add") return await handleApiPoolAdd(request, env);
      if (url.pathname === "/api/admin/api-pool/test-player") return await handleApiPoolTestPlayer(request, env);
      if (url.pathname === "/admin/api-pool") return new Response(await renderApiPoolAdminPage(request, env), {
        headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" }
      });
      if (url.pathname === "/api/player") return await handlePlayerApi(request, env);
      if (url.pathname === "/api/player/history") return await handlePlayerHistoryApi(request, env);
      if (url.pathname === "/api/player/changes") return await handlePlayerChangesApi(request, env);
      if (url.pathname === "/players") return new Response(await renderPlayerSearchPage(request, env), {
        headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" }
      });
      if (url.pathname === "/player/history") return new Response(await renderPlayerHistoryPage(request, env), {
        headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" }
      });
      if (url.pathname === "/player/changes") return new Response(await renderPlayerChangesPage(request, env), {
        headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" }
      });
      if (url.pathname === "/player") return new Response(await renderPlayerPage(request, env), {
        headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" }
      });
      return new Response(await renderHome(request, env), { headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" } });
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
    sessionSecret: env.EAGLEEYE_SESSION_SECRET,
    redirectUri: env.DISCORD_REDIRECT_URI || DEFAULT_DISCORD_REDIRECT_URI
  };
}

async function startDiscordLogin(request, env) {
  const config = getConfig(env);
  if (!config.clientId || !config.sessionSecret) {
    return json({ ok: false, error: "DISCORD_AUTH_NOT_CONFIGURED" }, 503);
  }

  const redirectUri = config.redirectUri;
  const state = await createStateToken(config.sessionSecret);
  const authorize = new URL(DISCORD_AUTHORIZE_URL);
  authorize.searchParams.set("client_id", config.clientId);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("scope", "identify");
  authorize.searchParams.set("state", state);

  return new Response(null, {
    status: 302,
    headers: {
      "Location": authorize.toString(),
      "Cache-Control": "no-store"
    }
  });
}

async function handleDiscordCallback(request, env) {
  const config = getConfig(env);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!config.clientId || !config.clientSecret || !config.sessionSecret) {
    return json({ ok: false, error: "DISCORD_AUTH_NOT_CONFIGURED" }, 503);
  }
  if (!code || !state) {
    return json({ ok: false, error: "INVALID_OAUTH_STATE", reason: "missing_callback_state" }, 400);
  }
  if (!(await verifyStateToken(state, config.sessionSecret))) {
    return json({ ok: false, error: "INVALID_OAUTH_STATE", reason: "invalid_state_signature" }, 400);
  }

  const redirectUri = config.redirectUri;
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
  if (env.DB) {
    const userResult = await upsertUser(env.DB, discordUser, now);
    if (userResult?.status === "DISABLED") {
      return json({ ok: false, error: "USER_DISABLED" }, 403);
    }
  }

  const session = await signPayload(sessionPayload, config.sessionSecret);

  const responseHeaders = new Headers({
    Location: new URL("/", request.url).toString(),
    "Cache-Control": "no-store"
  });
  responseHeaders.append("Set-Cookie", serializeCookie(SESSION_COOKIE, session, {
    maxAge: SESSION_MAX_AGE, httpOnly: true, secure: true, sameSite: "Lax", path: "/"
  }));
  return new Response(null, {
    status: 302,
    headers: responseHeaders
  });
}
async function upsertUser(db, discordUser, now) {
  const discordId = String(discordUser.id);
  const existing = await db.prepare(
    `SELECT user_id, status FROM users WHERE discord_id = ? LIMIT 1`
  ).bind(discordId).first();

  if (existing?.status === "DISABLED") {
    return { status: "DISABLED" };
  }

  const userId = existing?.user_id || crypto.randomUUID();
  await db.prepare(
    `INSERT INTO users (
      user_id, discord_id, username, global_name, avatar, role, status,
      created_at, updated_at, last_login_at
    ) VALUES (?, ?, ?, ?, ?, 'BASIC', 'ACTIVE', ?, ?, ?)
    ON CONFLICT(discord_id) DO UPDATE SET
      username = excluded.username,
      global_name = excluded.global_name,
      avatar = excluded.avatar,
      updated_at = excluded.updated_at,
      last_login_at = excluded.last_login_at`
  ).bind(
    userId,
    discordId,
    discordUser.username || null,
    discordUser.global_name || null,
    discordUser.avatar || null,
    now,
    now,
    now
  ).run();

  return { status: "ACTIVE", user_id: userId };
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

async function handleMightPulsePlayerTest(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (auth.status !== "ACTIVE") return json({ ok: false, error: "USER_DISABLED" }, 403);
  if (auth.role !== "ADMIN" && auth.role !== "OWNER") return json({ ok: false, error: "ADMIN_REQUIRED" }, 403);

  const url = new URL(request.url);
  const governorId = url.searchParams.get("governor_id");
  if (!governorId) return json({ ok: false, error: "GOVERNOR_ID_REQUIRED" }, 400);

  try {
    const result = await getMightPulsePlayer(env, governorId, { include: "base" });
    if (env.DB) {
      const observation = observationEnvelope({
        endpoint: "/players/:governor_id",
        httpStatus: result.status,
        raw: result.data
      });
      await saveApiObservation(env.DB, observation);
    }
    return json({
      ok: true,
      provider: "MIGHTPULSE",
      target_type: "PLAYER",
      target_id: governorId,
      upstream_status: result.status,
      saved_observation: Boolean(env.DB)
    });
  } catch (error) {
    return json({
      ok: false,
      error: error?.code || "MIGHTPULSE_REQUEST_FAILED",
      status: error?.status || 0,
      diagnostic: {
        name: error?.name || null,
        message: error?.message || null,
        details: error?.details || null
      }
    }, error?.status && error.status >= 400 && error.status < 600 ? error.status : 502);
  }
}


async function requireAdmin(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") return { error: json({ ok: false, error: "UNAUTHORIZED" }, 401) };
  if (auth.role !== "ADMIN" && auth.role !== "OWNER") return { error: json({ ok: false, error: "ADMIN_REQUIRED" }, 403) };
  if (!env.DB) return { error: json({ ok: false, error: "DB_NOT_CONFIGURED" }, 503) };
  configureApiPoolEncryption(env.EAGLEEYE_SESSION_SECRET);
  return { auth };
}

async function handleApiPoolKeys(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  try {
    const keys = await listApiPoolKeys(env.DB);
    return json({ ok: true, keys: keys.map(k => ({
      ...k,
      key_fingerprint: k.key_fingerprint ? String(k.key_fingerprint).slice(0, 16) + "…" : null,
      last_error_message: k.last_error_message || null
    })), stats: await getPoolStats(env.DB) });
  } catch (error) {
    console.error("API pool list error:", error);
    return json({ ok: false, error: "API_POOL_READ_FAILED" }, 500);
  }
}

async function handleApiPoolAdd(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  try {
    const contentType = request.headers.get("content-type") || "";
    let body = {};
    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      const form = await request.formData();
      body = Object.fromEntries(form.entries());
    }
    const poolType = String(body.pool_type || "SYSTEM_GENERAL");
    const result = await addApiPoolKey(env.DB, {
      poolType,
      label: String(body.label || "").trim() || null,
      apiKey: String(body.api_key || "").trim(),
      contributedByUserId: poolType === "USER_CONTRIBUTED" ? guard.auth.user_id : null,
      consentVersion: poolType === "USER_CONTRIBUTED" ? "v1" : null
    });
    if (contentType.includes("application/json")) return json({ ok: true, key: result }, 201);
    return new Response(null, { status: 302, headers: { Location: "/admin/api-pool", "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("API pool add error:", error);
    return json({ ok: false, error: error?.message || "API_POOL_ADD_FAILED" }, 400);
  }
}

async function handleApiPoolTestPlayer(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return guard.error;
  const url = new URL(request.url);
  const governorId = String(url.searchParams.get("governor_id") || "").trim();
  if (!governorId) return json({ ok: false, error: "GOVERNOR_ID_REQUIRED" }, 400);

  let lease = null;
  try {
    lease = await leaseApiKey(env.DB, {
      poolType: "SYSTEM_GENERAL",
      purpose: "ADMIN_TEST",
      targetType: "PLAYER",
      targetId: governorId
    });
    const result = await getMightPulsePlayer(env, governorId, { include: "base", apiKey: lease.api_key });
    await recordApiPoolSuccess(env.DB, {
      keyId: lease.key_id,
      leaseId: lease.lease_id,
      endpoint: "/players/:governor_id",
      targetType: "PLAYER",
      targetId: governorId,
      purpose: "ADMIN_TEST",
      httpStatus: result.status,
      remainingMinute: parseHeaderNumber(result.headers, "x-ratelimit-remaining")
    });
    return json({ ok: true, provider: "MIGHTPULSE", target_type: "PLAYER", target_id: governorId, upstream_status: result.status, key_id: lease.key_id });
  } catch (error) {
    if (lease) {
      const cooldown = error?.status === 429 ? 60 : error?.status >= 500 || error?.code === "MIGHTPULSE_TIMEOUT" ? 15 : 0;
      const disable = error?.status === 401;
      await recordApiPoolFailure(env.DB, {
        keyId: lease.key_id,
        leaseId: lease.lease_id,
        endpoint: "/players/:governor_id",
        targetType: "PLAYER",
        targetId: governorId,
        purpose: "ADMIN_TEST",
        httpStatus: error?.status || 0,
        errorCode: error?.code || "MIGHTPULSE_REQUEST_FAILED",
        errorMessage: error?.message || null,
        cooldownSeconds: cooldown,
        disable
      });
    }
    return json({
      ok: false,
      error: error?.code || "MIGHTPULSE_REQUEST_FAILED",
      status: error?.status || 0
    }, error?.status >= 400 && error.status < 600 ? error.status : 502);
  }
}

function parseHeaderNumber(headers, name) {
  const value = headers?.get?.(name);
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function renderApiPoolAdminPage(request, env) {
  const guard = await requireAdmin(request, env);
  if (guard.error) return "<!DOCTYPE html><html lang='ja'><body style='background:#0f172a;color:white;font-family:system-ui;padding:32px'><h1>管理者権限が必要です</h1></body></html>";
  const keys = await listApiPoolKeys(env.DB);
  const stats = await getPoolStats(env.DB);
  const rows = keys.map(k => "<tr><td>" + escapeHtml(k.pool_type) + "</td><td>" + escapeHtml(k.label || "-") + "</td><td>" + escapeHtml(k.status) + "</td><td>" + escapeHtml(k.key_fingerprint ? String(k.key_fingerprint).slice(0,16) + "…" : "-") + "</td><td>" + escapeHtml(k.remaining_minute ?? "-") + "</td><td>" + escapeHtml(formatUnix(k.last_used_at)) + "</td></tr>").join("");
  const statText = stats.map(s => s.pool_type + ": " + s.status + "=" + s.count).join(" / ");
  return "<!DOCTYPE html><html lang='ja'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>EagleEye API Pool</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.wrap{max-width:900px;margin:auto;padding:24px 16px}.back{color:#94a3b8}.title{font-size:28px}.card{padding:16px;margin-top:14px;border:1px solid #334155;border-radius:14px;background:#162238}.hint{color:#94a3b8;font-size:13px;line-height:1.7}input,select{width:100%;padding:12px;margin-top:7px;border-radius:9px;border:1px solid #334155;background:#0b1220;color:white}button{margin-top:12px;padding:12px 16px;border:0;border-radius:9px;background:#f59e0b;color:#111827;font-weight:900}table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}th,td{text-align:left;padding:9px;border-bottom:1px solid #334155;white-space:nowrap} .scroll{overflow:auto}label{display:block;margin-top:10px;font-size:12px;color:#cbd5e1}</style></head><body><main class='wrap'><a class='back' href='/'>← EagleEye</a><h1 class='title'>API Pool 管理</h1><div class='card'><b>Pool Status</b><div class='hint'>" + escapeHtml(statText || "登録キーなし") + "</div></div><div class='card'><b>APIキー登録</b><div class='hint'>キー本体は保存時に暗号化され、画面には表示しません。</div><form method='post' action='/api/admin/api-pool/add'><label>Pool<select name='pool_type'><option>SYSTEM_GENERAL</option><option>SYSTEM_WATCHLIST</option><option>USER_CONTRIBUTED</option></select></label><label>ラベル<input name='label' placeholder='例: Main Key'></label><label>MightPulse API Key<input name='api_key' type='password' autocomplete='off' required></label><button type='submit'>登録</button></form></div><div class='card'><b>登録済みキー</b><div class='scroll'><table><thead><tr><th>Pool</th><th>Label</th><th>Status</th><th>Fingerprint</th><th>Remaining/min</th><th>Last Used</th></tr></thead><tbody>" + (rows || "<tr><td colspan='6'>なし</td></tr>") + "</tbody></table></div></div><div class='card'><b>テスト</b><form onsubmit=&quot;event.preventDefault();fetch('/api/admin/api-pool/test-player?governor_id='+encodeURIComponent(document.getElementById('gid').value)).then(r=>r.json()).then(x=>document.getElementById('out').textContent=JSON.stringify(x,null,2)).catch(e=>document.getElementById('out').textContent=e.message)&quot;><label>Governor ID<input id='gid' placeholder='223636495' required></label><button>Pool経由で取得</button></form><pre id='out' class='hint'></pre></div></main></body></html>";
}

async function handlePlayerApi(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (auth.status !== "ACTIVE") return json({ ok: false, error: "USER_DISABLED" }, 403);

  const url = new URL(request.url);
  const governorId = String(url.searchParams.get("governor_id") || "").trim();
  if (!governorId) return json({ ok: false, error: "GOVERNOR_ID_REQUIRED" }, 400);

  if (!env.DB) return json({ ok: false, error: "DB_NOT_CONFIGURED" }, 503);

  try {
    let player = await getPlayer(env.DB, governorId);
    let observation = await getLatestPlayerObservation(env.DB, governorId);

    if (!observation) {
      return json({ ok: false, error: "PLAYER_NOT_OBSERVED" }, 404);
    }

    if (!player || String(player.source_observation_id) !== String(observation.observation_id)) {
      player = await materializePlayer(env.DB, observation);
    }

    const visiblePlayer = filterPlayerForRole(player, auth.role);

    return json({
      ok: true,
      player: visiblePlayer,
      freshness: {
        provider: "MIGHTPULSE",
        fresh: observation.payload?.fresh ?? null,
        cached_at: observation.payload?.cached_at ?? null,
        age_seconds: observation.payload?.age_seconds ?? null,
        eagleeye_observed_at: observation.observed_at
      }
    });
  } catch (error) {
    console.error("Player API error:", error);
    return json({
      ok: false,
      error: "PLAYER_READ_FAILED",
      diagnostic: { message: error?.message || null }
    }, 500);
  }
}

async function renderPlayerSearchPage(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") {
    return \`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EagleEye Player Search</title></head><body style="background:#0f172a;color:white;font-family:system-ui;padding:32px"><h1>ログインが必要です</h1><a href="/api/auth/discord" style="color:#f59e0b">Discordでログイン</a></body></html>\`;
  }

  const url = new URL(request.url);
  const q = String(url.searchParams.get("q") || "").trim();
  let rows = [];

  if (q && env.DB) {
    const like = \`%\${q}%\`;
    rows = await env.DB.prepare(
      \`SELECT governor_id, nick_name, kid, power, town_center_level, alliance_name, observed_at
       FROM players
       WHERE governor_id LIKE ?
          OR nick_name LIKE ?
          OR CAST(kid AS TEXT) LIKE ?
          OR alliance_name LIKE ?
       ORDER BY power DESC
       LIMIT 30\`
    ).bind(like, like, like, like).all();
  }

  const results = rows.map(row => \`
    <a class="result" href="/player?governor_id=\${encodeURIComponent(row.governor_id)}">
      <div class="result-main">
        <div class="name">\${escapeHtml(row.nick_name || "Unknown Player")}</div>
        <div class="sub">Governor ID \${escapeHtml(row.governor_id)} · K\${escapeHtml(row.kid ?? "-")}</div>
        <div class="sub">\${escapeHtml(row.alliance_name || "同盟なし")}</div>
      </div>
      <div class="power">\${escapeHtml(formatNumber(row.power))}</div>
    </a>\`).join("");

  const body = q
    ? (results || \`<div class="empty">該当するプレイヤーが見つかりません。</div>\`)
    : \`<div class="hint">プレイヤー名、Governor ID、KID、同盟名から検索できます。</div>\`;

  return \`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EagleEye Player Search</title><style>
  :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:760px;margin:0 auto;padding:28px 18px}.back{color:#94a3b8;text-decoration:none}.eyebrow{margin-top:24px;color:#f59e0b;font-size:11px;font-weight:800;letter-spacing:2px}.title{margin:5px 0 8px;font-size:30px}.desc{color:#94a3b8;margin:0 0 18px}.search{display:flex;gap:8px}.search input{flex:1;min-width:0;padding:14px;border-radius:12px;border:1px solid #334155;background:#0b1220;color:white;font-size:16px}.search button{padding:14px 17px;border:0;border-radius:12px;background:#f59e0b;color:#111827;font-weight:900}.results{margin-top:18px;display:grid;gap:10px}.result{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px;border:1px solid #334155;border-radius:14px;background:#162238;color:white;text-decoration:none}.result:active{transform:translateY(1px)}.name{font-size:17px;font-weight:800;overflow-wrap:anywhere}.sub{margin-top:4px;color:#94a3b8;font-size:12px;overflow-wrap:anywhere}.power{font-weight:900;color:#f59e0b;white-space:nowrap}.hint,.empty{margin-top:18px;padding:18px;border:1px solid #334155;border-radius:14px;background:#111c31;color:#94a3b8}.empty{color:#fca5a5}
  </style></head><body><main class="wrap"><a class="back" href="/">← EagleEye</a><div class="eyebrow">PLAYER DATABASE</div><h1 class="title">プレイヤー検索</h1><p class="desc">名前・Governor ID・KID・同盟名から検索</p><form class="search" method="get" action="/players"><input name="q" value="\${escapeHtml(q)}" placeholder="プレイヤー名 / Governor ID / KID / 同盟"><button>検索</button></form><div class="results">\${body}</div></main></body></html>\`;
}


async function handlePlayerHistoryApi(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const url = new URL(request.url);
  const governorId = String(url.searchParams.get("governor_id") || "").trim();
  if (!governorId) return json({ ok: false, error: "GOVERNOR_ID_REQUIRED" }, 400);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 30), 1), 100);
  if (!env.DB) return json({ ok: false, error: "DB_NOT_CONFIGURED" }, 503);
  try {
    const result = await env.DB.prepare(
      'SELECT snapshot_id, governor_id, observation_id, observed_at, payload_json FROM player_snapshots WHERE governor_id = ? ORDER BY observed_at DESC LIMIT ?'
    ).bind(governorId, limit).all();
    const snapshots = (result.results || []).map(row => {
      let payload = {};
      try { payload = JSON.parse(row.payload_json); } catch {}
      return { snapshot_id: row.snapshot_id, governor_id: row.governor_id, observation_id: row.observation_id, observed_at: row.observed_at, player: filterPlayerForRole(payload, auth.role) };
    });
    return json({ ok: true, governor_id: governorId, snapshots });
  } catch (error) {
    console.error("Player history API error:", error);
    return json({ ok: false, error: "PLAYER_HISTORY_READ_FAILED" }, 500);
  }
}


async function handlePlayerChangesApi(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  const url = new URL(request.url);
  const governorId = String(url.searchParams.get("governor_id") || "").trim();
  if (!governorId) return json({ ok: false, error: "GOVERNOR_ID_REQUIRED" }, 400);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 100);
  if (!env.DB) return json({ ok: false, error: "DB_NOT_CONFIGURED" }, 503);

  try {
    const result = await env.DB.prepare(
      `SELECT event_id, target_type, target_id, change_type, field_name,
              old_value_json, new_value_json, observation_id, detected_at, created_at
       FROM change_events
       WHERE target_type = 'PLAYER' AND target_id = ?
       ORDER BY detected_at DESC, created_at DESC
       LIMIT ?`
    ).bind(governorId, limit).all();

    const changes = (result.results || []).map(row => {
      let oldValue = null;
      let newValue = null;
      try { oldValue = JSON.parse(row.old_value_json); } catch {}
      try { newValue = JSON.parse(row.new_value_json); } catch {}
      return {
        event_id: row.event_id, target_type: row.target_type, target_id: row.target_id,
        change_type: row.change_type, field_name: row.field_name,
        old_value: oldValue, new_value: newValue, observation_id: row.observation_id,
        detected_at: row.detected_at, created_at: row.created_at
      };
    }).filter(change => isChangeVisibleForRole(change, auth.role));

    return json({ ok: true, governor_id: governorId, changes });
  } catch (error) {
    console.error("Player changes API error:", error);
    return json({ ok: false, error: "PLAYER_CHANGES_READ_FAILED" }, 500);
  }
}

async function renderPlayerChangesPage(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") {
    return '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>EagleEye</title></head><body style="background:#0f172a;color:white;font-family:system-ui;padding:32px"><h1>ログインが必要です</h1><a href="/api/auth/discord" style="color:#f59e0b">Discordでログイン</a></body></html>';
  }
  const url = new URL(request.url);
  const governorId = String(url.searchParams.get("governor_id") || "").trim();
  if (!governorId) return renderChangesShell("Governor IDを指定してください。", "");
  if (!env.DB) return renderChangesShell("データベースが設定されていません。", governorId);

  try {
    const result = await env.DB.prepare(
      `SELECT event_id, target_type, target_id, change_type, field_name,
              old_value_json, new_value_json, observation_id, detected_at, created_at
       FROM change_events
       WHERE target_type = 'PLAYER' AND target_id = ?
       ORDER BY detected_at DESC, created_at DESC
       LIMIT 100`
    ).bind(governorId).all();

    const changes = (result.results || []).map(row => {
      let oldValue = null;
      let newValue = null;
      try { oldValue = JSON.parse(row.old_value_json); } catch {}
      try { newValue = JSON.parse(row.new_value_json); } catch {}
      return { ...row, oldValue, newValue };
    }).filter(change => isChangeVisibleForRole(change, auth.role));

    if (!changes.length) return renderChangesShell("このプレイヤーの変更履歴はまだありません。", governorId);

    const cards = changes.map(change => {
      const label = changeFieldLabel(change.field_name);
      const oldText = formatChangeValue(change.field_name, change.oldValue);
      const newText = formatChangeValue(change.field_name, change.newValue);
      return `<article class="change"><div class="time">${escapeHtml(formatUnix(change.detected_at))}</div><div class="headline"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(changeTypeLabel(change.change_type))}</span></div><div class="transition"><span class="old">${escapeHtml(oldText)}</span><span class="arrow">→</span><span class="new">${escapeHtml(newText)}</span></div></article>`;
    }).join("");

    return renderChangesShell("", governorId, cards);
  } catch (error) {
    console.error("Player changes page error:", error);
    return renderChangesShell("変更履歴の読み込みに失敗しました。", governorId);
  }
}

function renderChangesShell(message, governorId, cards = "") {
  const content = cards ? '<div class="timeline">' + cards + '</div>' : '<div class="message">' + escapeHtml(message) + '</div>';
  return '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EagleEye Change History</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:760px;margin:0 auto;padding:28px 18px}.back{color:#94a3b8;text-decoration:none}.eyebrow{margin-top:24px;color:#f59e0b;font-size:11px;font-weight:800;letter-spacing:2px}.title{margin:5px 0 8px;font-size:27px}.sub{color:#94a3b8}.timeline{margin-top:20px;display:grid;gap:10px}.change{padding:16px;border:1px solid #334155;border-radius:14px;background:#162238}.time{color:#94a3b8;font-size:12px}.headline{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:7px}.headline strong{font-size:17px}.headline span{font-size:11px;color:#94a3b8;padding:4px 7px;border-radius:7px;background:#0b1220}.transition{display:flex;align-items:center;gap:10px;margin-top:12px;min-width:0}.old,.new{padding:9px 10px;border-radius:9px;overflow-wrap:anywhere;word-break:break-word}.old{background:#0b1220;color:#94a3b8}.new{background:#182f25;color:#bbf7d0;font-weight:800}.arrow{color:#f59e0b;font-weight:900}.message{margin-top:22px;padding:20px;border:1px solid #334155;border-radius:14px;background:#111c31;color:#94a3b8}@media(max-width:520px){.transition{align-items:stretch}.old,.new{flex:1}.arrow{align-self:center}}</style></head><body><main class="wrap"><a class="back" href="/player?governor_id=' + encodeURIComponent(governorId) + '">← プレイヤー詳細</a><div class="eyebrow">CHANGE EVENTS</div><h1 class="title">変更履歴</h1><div class="sub">Governor ID ' + escapeHtml(governorId) + '</div>' + content + '</main></body></html>';
}

function isChangeVisibleForRole(change, role) {
  if (role === "ADVANCED" || role === "ADMIN" || role === "OWNER") return true;
  return !["vip", "x", "y"].includes(String(change.field_name || ""));
}

function changeTypeLabel(value) {
  const labels = { POWER_CHANGED:"戦力変更", TOWN_CENTER_CHANGED:"役場変更", ALLIANCE_CHANGED:"同盟変更", COORDINATES_CHANGED:"座標変更", ACTIVITY_CHANGED:"活動状況変更", KILLS_CHANGED:"撃破数変更", PLAYER_FIELD_CHANGED:"プレイヤー情報変更" };
  return labels[value] || value || "変更";
}

function changeFieldLabel(field) {
  const labels = { power:"戦力", town_center_level:"役場", vip:"VIP", x:"X座標", y:"Y座標", kills:"撃破数", online:"オンライン", last_active_at:"最終活動", alliance_aid:"同盟ID", alliance_name:"同盟", alliance_rank:"同盟ランク", alliance_power:"同盟戦力", alliance_count:"同盟人数" };
  return labels[field] || field || "不明";
}

function formatChangeValue(field, value) {
  if (value === null || value === undefined || value === "") return "-";
  if (["power","kills","alliance_power","alliance_count","alliance_aid"].includes(field)) return formatNumber(value);
  if (field === "town_center_level") return formatTownCenterLevel(value);
  if (field === "online") return Number(value) ? "オンライン" : "オフライン";
  if (field === "last_active_at") return formatRelativeActivity(value);
  if (field === "x" || field === "y") return formatNumber(value);
  return String(value);
}

async function renderPlayerHistoryPage(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") return '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>EagleEye</title></head><body style="background:#0f172a;color:white;font-family:system-ui;padding:32px"><h1>ログインが必要です</h1><a href="/api/auth/discord" style="color:#f59e0b">Discordでログイン</a></body></html>';
  const url = new URL(request.url);
  const governorId = String(url.searchParams.get("governor_id") || "").trim();
  if (!governorId) return renderHistoryShell("Governor IDを指定してください。", "");
  if (!env.DB) return renderHistoryShell("データベースが設定されていません。", governorId);
  try {
    const result = await env.DB.prepare(
      'SELECT snapshot_id, governor_id, observation_id, observed_at, payload_json FROM player_snapshots WHERE governor_id = ? ORDER BY observed_at DESC LIMIT 100'
    ).bind(governorId).all();
    const rows = (result.results || []).map(row => {
      let p = {};
      try { p = filterPlayerForRole(JSON.parse(row.payload_json), auth.role); } catch {}
      return { ...row, player: p };
    });
    if (!rows.length) return renderHistoryShell("このプレイヤーの履歴はまだありません。", governorId);
    const cards = rows.map((row, index) => {
      const p = row.player || {};
      const previous = rows[index + 1]?.player || null;
      const powerDiff = previous && p.power != null && previous.power != null ? Number(p.power) - Number(previous.power) : null;
      return '<article class="snapshot"><div class="time">' + escapeHtml(formatUnix(row.observed_at)) + '</div><div class="headline"><span>戦力</span><strong>' + escapeHtml(formatNumber(p.power)) + '</strong>' + (powerDiff !== null ? '<em class="' + (powerDiff > 0 ? 'up' : powerDiff < 0 ? 'down' : '') + '">' + (powerDiff > 0 ? '+' : '') + escapeHtml(formatNumber(powerDiff)) + '</em>' : '') + '</div><div class="details"><span>役場 ' + escapeHtml(formatTownCenterLevel(p.town_center_level)) + '</span><span>撃破数 ' + escapeHtml(formatNumber(p.kills)) + '</span><span>同盟 ' + escapeHtml(p.alliance_name || '-') + '</span></div></article>';
    }).join("");
    return renderHistoryShell("", governorId, cards);
  } catch (error) {
    console.error("Player history page error:", error);
    return renderHistoryShell("履歴の読み込みに失敗しました。", governorId);
  }
}

function renderHistoryShell(message, governorId, cards = "") {
  const content = cards ? '<div class="timeline">' + cards + '</div>' : '<div class="message">' + escapeHtml(message) + '</div>';
  return '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EagleEye Player History</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:760px;margin:0 auto;padding:28px 18px}.back{color:#94a3b8;text-decoration:none}.eyebrow{margin-top:24px;color:#f59e0b;font-size:11px;font-weight:800;letter-spacing:2px}.title{margin:5px 0 8px;font-size:27px}.sub{color:#94a3b8}.timeline{margin-top:20px;display:grid;gap:10px}.snapshot{padding:16px;border:1px solid #334155;border-radius:14px;background:#162238}.time{color:#94a3b8;font-size:12px}.headline{display:flex;align-items:baseline;gap:10px;margin-top:8px}.headline span{color:#94a3b8;font-size:13px}.headline strong{font-size:21px}.headline em{font-style:normal;font-size:13px}.up{color:#86efac}.down{color:#fca5a5}.details{display:flex;flex-wrap:wrap;gap:8px;margin-top:11px;color:#cbd5e1;font-size:12px}.details span{padding:5px 8px;border-radius:8px;background:#0b1220}.message{margin-top:22px;padding:20px;border:1px solid #334155;border-radius:14px;background:#111c31;color:#94a3b8}</style></head><body><main class="wrap"><a class="back" href="/player?governor_id=' + encodeURIComponent(governorId) + '">← プレイヤー詳細</a><div class="eyebrow">PLAYER HISTORY</div><h1 class="title">プレイヤー履歴</h1><div class="sub">Governor ID ' + escapeHtml(governorId) + '</div>' + content + '</main></body></html>';
}

async function renderPlayerPage(request, env) {
  const auth = await getAuthenticatedUser(request, env);
  if (!auth || auth.status !== "ACTIVE") {
    return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EagleEye</title></head><body style="background:#0f172a;color:white;font-family:system-ui;padding:32px"><h1>ログインが必要です</h1><a href="/api/auth/discord" style="color:#f59e0b">Discordでログイン</a></body></html>`;
  }

  const url = new URL(request.url);
  const governorId = String(url.searchParams.get("governor_id") || "").trim();
  if (!governorId) {
    return renderPlayerShell("Governor IDを指定してください。", "");
  }

  try {
    let observation = await getLatestPlayerObservation(env.DB, governorId);
    if (!observation) return renderPlayerShell("プレイヤーデータがまだありません。", governorId);

    let player = await getPlayer(env.DB, governorId);
    if (!player || String(player.source_observation_id) !== String(observation.observation_id)) {
      player = await materializePlayer(env.DB, observation);
    }

    return renderPlayerShell("", governorId, filterPlayerForRole(player, auth.role), observation.payload);
  } catch (error) {
    console.error("Player page error:", error);
    return renderPlayerShell("プレイヤーデータの読み込みに失敗しました。", governorId);
  }
}

function filterPlayerForRole(player, role) {
  if (!player) return player;
  if (role === "ADVANCED" || role === "ADMIN" || role === "OWNER") return player;

  const visible = { ...player };
  delete visible.vip;
  delete visible.x;
  delete visible.y;
  return visible;
}

function renderPlayerShell(message, governorId, player = null, payload = null) {
  const p = player || {};
  const freshness = payload || {};
  const esc = escapeHtml;
  const content = player ? `
    <div class="hero"><div><div class="eyebrow">PLAYER PROFILE</div><h1>${esc(p.nick_name || "Unknown Player")}</h1><div class="sub">Governor ID ${esc(p.governor_id)}</div></div><div class="kid">K${esc(p.kid ?? "-")}</div></div>
    <div class="grid">
      ${card("戦力", formatNumber(p.power))}
      ${card("役場", formatTownCenterLevel(p.town_center_level))}
      ${card("VIP", p.vip ?? "-")}
      ${card("撃破数", formatNumber(p.kills))}
      ${card("座標", p.x != null && p.y != null ? `${p.x}, ${p.y}` : "-")}
      ${card("オンライン", p.online ? "ONLINE" : "OFFLINE")}
      ${card("最終活動", formatRelativeActivity(p.last_active_at, p.last_login))}
      ${card("同盟", p.alliance_name || "-")}
    </div>
    <div class="actions"><a class="action" href="/player/history?governor_id=${encodeURIComponent(governorId)}">スナップショット履歴</a><a class="action" href="/player/changes?governor_id=${encodeURIComponent(governorId)}">変更履歴</a></div>
    <div class="meta">
      <div><b>データ鮮度</b> ${freshness.age_seconds != null ? Math.round(freshness.age_seconds / 3600) + "時間前" : "不明"}</div>
      <div><b>Fresh</b> ${freshness.fresh === true ? "YES" : "NO / cached"}</div>
      <div><b>観測時刻</b> ${formatUnix(p.observed_at)}</div>
    </div>` : `<div class="message">${esc(message)}</div>`;

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EagleEye Player</title><style>
  :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:760px;margin:0 auto;padding:28px 18px}.back{color:#94a3b8;text-decoration:none}.hero{margin-top:22px;padding:22px;border:1px solid #334155;border-radius:18px;background:#111c31;display:flex;justify-content:space-between;gap:16px}.eyebrow{color:#f59e0b;font-size:11px;font-weight:800;letter-spacing:2px}.hero h1{margin:5px 0;font-size:26px;overflow-wrap:anywhere}.sub{color:#94a3b8}.kid{font-size:22px;font-weight:900;color:#f59e0b}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:14px}.card{padding:16px;border:1px solid #334155;border-radius:14px;background:#162238}.label{font-size:12px;color:#94a3b8}.value{font-size:19px;font-weight:800;margin-top:5px;overflow-wrap:anywhere}.meta{margin-top:14px;padding:15px;border-radius:14px;background:#0b1220;color:#94a3b8;font-size:13px;line-height:1.9}.meta b{color:#e2e8f0}.message{margin-top:24px;padding:22px;border:1px solid #334155;border-radius:16px;background:#111c31}.search{margin-top:18px;display:flex;gap:8px}.search input{flex:1;padding:12px;border-radius:10px;border:1px solid #334155;background:#0b1220;color:white}.search button{padding:12px 15px;border:0;border-radius:10px;background:#f59e0b;color:#111827;font-weight:900}@media(max-width:520px){.hero{display:block}.kid{margin-top:12px}.grid{grid-template-columns:1fr}}
  </style></head><body><main class="wrap"><a class="back" href="/">← EagleEye</a><form class="search" method="get" action="/player"><input name="governor_id" value="${esc(governorId)}" placeholder="Governor ID"><button>検索</button></form>${content}</main></body></html>`;
}

function card(label, value) {
  return `<div class="card"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`;
}

function formatTownCenterLevel(value) {
  if (value === null || value === undefined || value === "") return "-";
  const level = Number(value);
  if (!Number.isFinite(level)) return String(value);
  if (level <= 30) return \`Lv.\${level}\`;
  const goldLevel = Math.floor((level - 31) / 5) + 1;
  const stage = ((level - 31) % 5) + 1;
  return \`黄金\${goldLevel}（\${stage}/5）\`;
}

function formatRelativeActivity(lastActiveAt, fallback = null) {
  if (lastActiveAt !== null && lastActiveAt !== undefined && lastActiveAt !== "") {
    const timestamp = Number(lastActiveAt);
    if (Number.isFinite(timestamp)) {
      const diffSeconds = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);
      if (diffSeconds < 60) return "1分未満前";
      if (diffSeconds < 3600) return \`\${Math.floor(diffSeconds / 60)}分前\`;
      if (diffSeconds < 86400) return \`\${Math.floor(diffSeconds / 3600)}時間前\`;
      if (diffSeconds < 86400 * 30) return \`\${Math.floor(diffSeconds / 86400)}日前\`;
      if (diffSeconds < 86400 * 365) return \`\${Math.floor(diffSeconds / (86400 * 30))}か月前\`;
      return \`\${Math.floor(diffSeconds / (86400 * 365))}年前\`;
    }
  }
  return fallback ? translateLastLogin(fallback) : "-";
}

function translateLastLogin(value) {
  return String(value)
    .replace(/^Last active (\\d+)d ago$/i, "$1日前")
    .replace(/^Last active (\\d+)h ago$/i, "$1時間前")
    .replace(/^Last active (\\d+)m ago$/i, "$1分前")
    .replace(/^Last active (just now)$/i, "直近");
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "-";
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("ja-JP") : String(value);
}

function formatUnix(value) {
  if (!value) return "-";
  const date = new Date(Number(value) * 1000);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

async function getAuthenticatedUser(request, env) {
  const secret = env.EAGLEEYE_SESSION_SECRET;
  const token = parseCookie(request.headers.get("Cookie") || "")[SESSION_COOKIE];
  if (!token || !secret) return null;
  const session = await verifyPayload(token, secret);
  if (!session) return null;

  if (!env.DB) return { discord_id: session.sub, status: "ACTIVE", role: "ADMIN" };

  const user = await env.DB.prepare(
    "SELECT user_id, discord_id, role, status FROM users WHERE discord_id = ? LIMIT 1"
  ).bind(session.sub).first();
  return user || null;
}

async function handleMe(request, env) {
  const secret = env.EAGLEEYE_SESSION_SECRET;
  const token = parseCookie(request.headers.get("Cookie") || "")[SESSION_COOKIE];
  if (!token || !secret) return json({ ok: true, authenticated: false });

  const session = await verifyPayload(token, secret);
  if (!session) return json({ ok: true, authenticated: false });

  const dbUser = env.DB
    ? await env.DB.prepare(
        "SELECT user_id, discord_id, role, status FROM users WHERE discord_id = ? LIMIT 1"
      ).bind(session.sub).first()
    : null;

  return json({
    ok: true,
    authenticated: true,
    user: {
      discord_id: session.sub,
      username: session.username,
      global_name: session.global_name,
      avatar: session.avatar,
      role: dbUser?.role || "BASIC",
      status: dbUser?.status || "ACTIVE"
    }
  });
}

async function renderHome(request, env) {
  const configured = Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.EAGLEEYE_SESSION_SECRET);
  const token = parseCookie(request.headers.get("Cookie") || "")[SESSION_COOKIE];
  const session = configured && token ? await verifyPayload(token, env.EAGLEEYE_SESSION_SECRET) : null;

  const auth = session ? await getAuthenticatedUser(request, env) : null;
  const authUi = session
    ? `
      <section class="account">
        <div class="account-avatar">${session.avatar ? `<img src="https://cdn.discordapp.com/avatars/${encodeURIComponent(session.sub)}/${encodeURIComponent(session.avatar)}.png?size=128" alt="">` : "<span>BJ</span>"}</div>
        <div class="account-info">
          <div class="account-label">DISCORD CONNECTED</div>
          <div class="account-name">${escapeHtml(session.global_name || session.username || "Discord User")}</div>
          <div class="account-tag">@${escapeHtml(session.username || "")}</div>
        </div>
        <a class="logout" href="/api/auth/logout">ログアウト</a>
      </section>
      <nav class="nav"><a href="/players">プレイヤー検索</a>${auth && (auth.role === "ADMIN" || auth.role === "OWNER") ? '<a href="/admin/api-pool">API Pool管理</a>' : ""}</nav>`
    : `
      <a class="login" href="/api/auth/discord">Discordでログイン</a>`;

  const note = configured ? "" : '<p class="note">Discord認証はCloudflare側の設定後に有効になります。</p>';

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>KingShot Data Platform — EagleEye</title><style>
  :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;color:white;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.container{text-align:center;padding:32px 24px;max-width:680px;width:100%}h1{font-size:clamp(28px,7vw,42px);line-height:1.15;margin:0 0 12px}.subtitle{font-size:18px;font-weight:800;letter-spacing:5px;color:#f59e0b;margin-bottom:24px;text-transform:uppercase}p{color:#94a3b8;font-size:16px;line-height:1.7}.status{display:inline-block;margin-top:20px;padding:10px 16px;border-radius:999px;background:#14532d;color:#86efac;font-weight:700}.login,.logout{display:inline-flex;align-items:center;justify-content:center;margin-top:28px;padding:13px 22px;border-radius:10px;color:white;text-decoration:none;font-weight:800}.login{background:#5865f2}.login:active,.logout:active{transform:translateY(1px)}.account{margin:28px auto 0;max-width:460px;padding:18px;display:flex;align-items:center;gap:14px;text-align:left;background:rgba(30,41,59,.78);border:1px solid #334155;border-radius:16px;box-shadow:0 12px 30px rgba(0,0,0,.2)}.account-avatar{width:58px;height:58px;flex:0 0 58px;border-radius:50%;overflow:hidden;background:#1e293b;display:flex;align-items:center;justify-content:center;color:#f59e0b;font-weight:900}.account-avatar img{width:100%;height:100%;object-fit:cover}.account-info{min-width:0;flex:1}.account-label{font-size:11px;letter-spacing:1.5px;color:#86efac;font-weight:800}.account-name{font-size:17px;font-weight:800;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.account-tag{font-size:13px;color:#94a3b8;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.logout{margin:0;padding:10px 14px;background:#334155;border:1px solid #475569;font-size:13px;flex:0 0 auto}.logout:hover{background:#475569}.nav{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:16px}.nav a{padding:10px 13px;border:1px solid #334155;border-radius:10px;background:#162238;color:#e2e8f0;text-decoration:none;font-size:13px;font-weight:800}.note{font-size:13px;margin-top:18px}
  </style></head><body><main class="container"><h1>KingShot Data Platform</h1><div class="subtitle">EagleEye</div><p>KingShotのデータを集約・分析するプラットフォーム</p><div class="status">● System Online</div>${authUi}${note}</main></body></html>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
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