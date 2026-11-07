// Googleログイン（ログイン方法を増やす A案：仮のIDを使う）。
// ・Googleで新しく来た人には users.discord_id に「google:<Googleの番号>」という仮のIDを入れる。
//   ウォッチリスト・バッジ・セッションなど discord_id を使う仕組みは、そのまま動く。
// ・Discord専用の処理（DM・KvK通知スレッド・サポートサーバー）は isDiscordUserId() で本物のDiscord番号のときだけ動かす。
// ・取得するのは Google の番号（sub）と表示名だけ（scope: openid profile）。メールアドレスは取らない。
// ・Client Secret・トークンはログや画面に出さない。

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
export const GOOGLE_CALLBACK_PATH = "/api/auth/google/callback";
export const GOOGLE_ID_PREFIX = "google:";

// 本物のDiscordのユーザー番号か（仮のIDではないか）。
export function isDiscordUserId(id) {
  return /^\d{15,25}$/.test(String(id ?? "").trim());
}

export function googleConfigured(env) {
  return Boolean(env?.GOOGLE_OAUTH_CLIENT_ID && env?.GOOGLE_OAUTH_CLIENT_SECRET && env?.EAGLEEYE_SESSION_SECRET);
}

export function googleRedirectUri(env, requestUrl) {
  if (env?.GOOGLE_OAUTH_REDIRECT_URI) return String(env.GOOGLE_OAUTH_REDIRECT_URI);
  return new URL(GOOGLE_CALLBACK_PATH, requestUrl).toString();
}

export function googleAuthorizeUrl(env, { state, redirectUri }) {
  const u = new URL(GOOGLE_AUTH_URL);
  u.searchParams.set("client_id", String(env.GOOGLE_OAUTH_CLIENT_ID));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("scope", "openid profile");
  u.searchParams.set("state", state);
  u.searchParams.set("prompt", "select_account");
  return u.toString();
}

// code → Googleのユーザー（sub・表示名）。失敗時は code 付きの Error。
export async function fetchGoogleUser(env, { code, redirectUri, fetchImpl = fetch }) {
  const tokenRes = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: String(env.GOOGLE_OAUTH_CLIENT_ID), client_secret: String(env.GOOGLE_OAUTH_CLIENT_SECRET), grant_type: "authorization_code", code, redirect_uri: redirectUri })
  });
  if (!tokenRes.ok) { const e = new Error("GOOGLE_TOKEN_EXCHANGE_FAILED"); e.code = e.message; e.httpStatus = tokenRes.status; throw e; }
  const token = await tokenRes.json();
  const infoRes = await fetchImpl(GOOGLE_USERINFO_URL, { headers: { Authorization: "Bearer " + token.access_token } });
  if (!infoRes.ok) { const e = new Error("GOOGLE_USER_LOOKUP_FAILED"); e.code = e.message; e.httpStatus = infoRes.status; throw e; }
  const info = await infoRes.json();
  const sub = String(info?.sub || "").trim();
  if (!/^[0-9A-Za-z_-]{1,64}$/.test(sub)) { const e = new Error("GOOGLE_USER_INVALID"); e.code = e.message; throw e; }
  return { sub, name: String(info?.name || "").slice(0, 80) || null };
}

let schemaReady = null;
export function resetGoogleAuthSchemaCache() { schemaReady = null; }
async function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = db.prepare("CREATE TABLE IF NOT EXISTS user_identities (provider TEXT NOT NULL, provider_user_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, last_login_at INTEGER, PRIMARY KEY (provider, provider_user_id))").run()
      .catch(error => { schemaReady = null; throw error; });
  }
  return schemaReady;
}

// Googleのユーザー → EagleEyeユーザー。初めてなら仮のIDで作る（ロールは BASIC）。
export async function upsertGoogleUser(db, googleUser, now = Math.floor(Date.now() / 1000), newId = () => crypto.randomUUID()) {
  await ensureSchema(db);
  const sub = String(googleUser.sub);
  const name = googleUser.name || null;
  const identity = await db.prepare("SELECT user_id FROM user_identities WHERE provider = 'google' AND provider_user_id = ?").bind(sub).first();
  let user = identity ? await db.prepare("SELECT user_id, discord_id, status FROM users WHERE user_id = ?").bind(identity.user_id).first() : null;
  if (user?.status === "DISABLED") return { status: "DISABLED" };
  let isNew = false;
  if (!user) {
    isNew = true;
    const userId = newId();
    const pseudoId = GOOGLE_ID_PREFIX + sub;
    await db.prepare(
      "INSERT INTO users (user_id, discord_id, username, global_name, avatar, role, status, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, NULL, 'BASIC', 'ACTIVE', ?, ?, ?) " +
      "ON CONFLICT(discord_id) DO UPDATE SET username = excluded.username, global_name = excluded.global_name, updated_at = excluded.updated_at, last_login_at = excluded.last_login_at"
    ).bind(userId, pseudoId, name, name, now, now, now).run();
    user = await db.prepare("SELECT user_id, discord_id, status FROM users WHERE discord_id = ?").bind(pseudoId).first();
    if (user?.user_id !== userId) isNew = false; // 対応表だけ消えていた等で、既にいた人
    await db.prepare("INSERT OR IGNORE INTO user_identities (provider, provider_user_id, user_id, created_at, last_login_at) VALUES ('google', ?, ?, ?, ?)").bind(sub, user.user_id, now, now).run();
    if (user?.status === "DISABLED") return { status: "DISABLED" };
  } else {
    await db.prepare("UPDATE users SET username = ?, global_name = ?, updated_at = ?, last_login_at = ? WHERE user_id = ?").bind(name, name, now, now, user.user_id).run();
    await db.prepare("UPDATE user_identities SET last_login_at = ? WHERE provider = 'google' AND provider_user_id = ?").bind(now, sub).run();
  }
  await db.prepare("INSERT INTO login_history (login_id, user_id, discord_id, username, global_name, logged_in_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(newId(), user.user_id, user.discord_id, name, name, now).run();
  return { status: "ACTIVE", user_id: user.user_id, discord_id: user.discord_id, isNew, name };
}

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ログイン方法を選ぶ画面（Googleが設定されているときだけ使う）。
export function renderLoginChooserPage({ next = "" } = {}) {
  const q = next ? "&next=" + encodeURIComponent(next) : "";
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>ログイン | EagleEye</title><meta name="robots" content="noindex">
<style>body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:520px;margin:0 auto;padding:28px 16px calc(96px + env(safe-area-inset-bottom))}h1{font-size:22px;margin:0 0 6px}.lead{font-size:13px;color:var(--ee-subtext);margin:0 0 18px}
.lg{display:flex;align-items:center;justify-content:center;gap:10px;margin:10px 0;padding:14px;border-radius:14px;font-size:16px;font-weight:900;text-decoration:none}.lg-d{background:#5865f2;color:#fff}.lg-g{background:#fff;color:#1f1f1f;border:1px solid #dadce0}
.note{margin-top:18px;padding:12px 14px;border:1px solid var(--ee-border-soft);border-radius:14px;background:var(--ee-panel);font-size:12px;line-height:1.7;color:var(--ee-subtext)}.note b{color:var(--ee-text)}</style></head>
<body><main class="wrap"><h1>EagleEyeにログイン</h1><p class="lead">どちらでも無料で使えます。</p>
<a class="lg lg-d" href="/api/auth/discord?direct=1${esc(q)}">Discordでログイン</a>
<a class="lg lg-g" href="/api/auth/google?x=1${esc(q)}">Googleでログイン</a>
<div class="note"><b>Discordでログインするとできること</b><br>KvK通知（王国ごとの非公開スレッド）、運営からのお知らせDM、サポートへの問い合わせ。<br>APIキー（MightPulse）の作成にもDiscordが必要なため、ADVANCEDになるにはDiscordアカウントが要ります。<br><br><b>Googleでログインした場合</b><br>ウォッチリスト・ホームの変化・マイKingShotなど、BASICの機能が使えます。</div>
</main></body></html>`;
}
