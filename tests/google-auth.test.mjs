// Googleログイン（A案：仮のID）。未設定なら今までどおり、設定済みなら選択画面→Google→仮IDのユーザー。
// Discord専用の処理（DM・サポートサーバー）は仮IDに対して動かない。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isDiscordUserId, googleAuthorizeUrl, upsertGoogleUser, resetGoogleAuthSchemaCache, renderLoginChooserPage, fetchGoogleUser } from "../src/google-auth.js";

test("本物のDiscord番号と仮IDを見分ける", () => {
  assert.equal(isDiscordUserId("123456789012345678"), true);
  assert.equal(isDiscordUserId("google:1234567890"), false);
  assert.equal(isDiscordUserId(""), false);
  assert.equal(isDiscordUserId(null), false);
});

test("Googleには表示名と番号だけを求める（メールは取らない）", () => {
  const u = new URL(googleAuthorizeUrl({ GOOGLE_OAUTH_CLIENT_ID: "cid" }, { state: "s", redirectUri: "https://eagleeye-ks.com/api/auth/google/callback" }));
  assert.equal(u.searchParams.get("scope"), "openid profile");
  assert.doesNotMatch(u.toString(), /email/);
  assert.equal(u.searchParams.get("client_id"), "cid");
});

function memDb() {
  const users = new Map(), ids = new Map(), logins = [], funnel = [];
  const stmt = (sql, a = []) => ({
    bind: (...x) => stmt(sql, x),
    async run() {
      if (sql.startsWith("INSERT INTO users")) { if (![...users.values()].some(u => u.discord_id === a[1])) users.set(a[0], { user_id: a[0], discord_id: a[1], username: a[2], role: "BASIC", status: "ACTIVE" }); }
      else if (sql.startsWith("INSERT OR IGNORE INTO user_identities")) { if (!ids.has(a[0])) ids.set(a[0], a[1]); }
      else if (sql.startsWith("INSERT INTO login_history")) logins.push(a);
      else if (sql.startsWith("INSERT INTO funnel_daily")) funnel.push(a[1]);
      return { meta: { changes: 1 } };
    },
    async first() {
      if (sql.startsWith("SELECT user_id FROM user_identities")) return ids.has(a[0]) ? { user_id: ids.get(a[0]) } : null;
      if (sql.startsWith("SELECT user_id, discord_id, status FROM users WHERE user_id")) return users.get(a[0]) || null;
      if (sql.startsWith("SELECT user_id, discord_id, status FROM users WHERE discord_id")) return [...users.values()].find(u => u.discord_id === a[0]) || null;
      if (sql.includes("FROM users WHERE discord_id")) { const u = [...users.values()].find(x => x.discord_id === a[0]); return u ? { ...u, global_name: u.username } : null; }
      return null;
    },
    async all() { return { results: [] }; }
  });
  return { users, ids, logins, funnel, prepare: sql => stmt(sql), batch: async l => { for (const s of l) await s.run(); return []; } };
}

test("初めてのGoogleユーザーは仮IDのBASICで作り、2回目は同じ人になる", async () => {
  resetGoogleAuthSchemaCache();
  const db = memDb();
  let n = 0;
  const id = () => "id" + (++n);
  const first = await upsertGoogleUser(db, { sub: "g123", name: "ねこ" }, 100, id);
  assert.equal(first.isNew, true);
  assert.equal(first.discord_id, "google:g123");
  assert.equal(db.users.get(first.user_id).role, "BASIC");
  const again = await upsertGoogleUser(db, { sub: "g123", name: "ねこ2" }, 200, id);
  assert.equal(again.isNew, false);
  assert.equal(again.user_id, first.user_id);
  assert.equal(db.logins.length, 2);
  db.users.get(first.user_id).status = "DISABLED";
  assert.deepEqual(await upsertGoogleUser(db, { sub: "g123", name: "x" }, 300, id), { status: "DISABLED" });
});

test("Googleの応答が変なときは止める（トークンは外に出さない）", async () => {
  const env = { GOOGLE_OAUTH_CLIENT_ID: "cid", GOOGLE_OAUTH_CLIENT_SECRET: "secret-value" };
  await assert.rejects(fetchGoogleUser(env, { code: "c", redirectUri: "r", fetchImpl: async () => new Response("no", { status: 400 }) }), e => e.code === "GOOGLE_TOKEN_EXCHANGE_FAILED" && !String(e.message).includes("secret-value"));
  const bad = async url => String(url).includes("token") ? Response.json({ access_token: "at" }) : Response.json({ sub: "../x" });
  await assert.rejects(fetchGoogleUser(env, { code: "c", redirectUri: "r", fetchImpl: bad }), e => e.code === "GOOGLE_USER_INVALID");
});

test("選択画面：DiscordとGoogle、戻り先を引き継ぐ、Discordでしかできないことを説明", () => {
  const html = renderLoginChooserPage({ next: "/watchlist" });
  assert.match(html, /href="\/api\/auth\/discord\?direct=1&amp;next=%2Fwatchlist"/);
  assert.match(html, /href="\/api\/auth\/google\?x=1&amp;next=%2Fwatchlist"/);
  assert.match(html, /KvK通知/);
});

test("Worker全体：未設定なら今までどおりDiscordへ直行、設定済みならGoogleでログインできる", async () => {
  resetGoogleAuthSchemaCache();
  const worker = (await import("../src/index.js")).default;
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const base = { EAGLEEYE_SESSION_SECRET: "s", DISCORD_CLIENT_ID: "d", DISCORD_CLIENT_SECRET: "x" };
  // 未設定：/login も /api/auth/discord も Discord へ
  const r1 = await worker.fetch(new Request("https://eagleeye-ks.com/login?next=/watchlist"), { ...base, DB: memDb() }, ctx);
  assert.equal(r1.status, 302);
  assert.match(r1.headers.get("location"), /\/api\/auth\/discord\?direct=1&next=%2Fwatchlist$/);
  const r2 = await worker.fetch(new Request("https://eagleeye-ks.com/api/auth/discord"), { ...base, DB: memDb() }, ctx);
  assert.match(r2.headers.get("location"), /^https:\/\/discord\.com\//);
  // 設定済み
  const env = { ...base, DB: memDb(), GOOGLE_OAUTH_CLIENT_ID: "cid", GOOGLE_OAUTH_CLIENT_SECRET: "gsecret", GOOGLE_LOGIN_OPEN: "1" };
  const r3 = await worker.fetch(new Request("https://eagleeye-ks.com/api/auth/discord?next=/watchlist"), env, ctx);
  assert.match(r3.headers.get("location"), /\/login\?next=%2Fwatchlist$/, "まず選択画面へ");
  const r4 = await worker.fetch(new Request("https://eagleeye-ks.com/api/auth/discord?direct=1"), env, ctx);
  assert.match(r4.headers.get("location"), /^https:\/\/discord\.com\//, "選んだ後はDiscordへ");
  const r5 = await worker.fetch(new Request("https://eagleeye-ks.com/api/auth/google?x=1&next=/watchlist"), env, ctx);
  const auth = new URL(r5.headers.get("location"));
  assert.equal(auth.host, "accounts.google.com");
  const state = auth.searchParams.get("state");
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => String(url).includes("oauth2.googleapis.com/token") ? Response.json({ access_token: "at" }) : String(url).includes("userinfo") ? Response.json({ sub: "g999", name: "グーグルさん" }) : new Response("{}", { status: 404 });
  try {
    const r6 = await worker.fetch(new Request(`https://eagleeye-ks.com/api/auth/google/callback?code=c&state=${encodeURIComponent(state)}`, { headers: { cookie: "eagleeye_login_return=%2Fwatchlist" } }), env, ctx);
    assert.equal(r6.status, 302);
    assert.equal(r6.headers.get("location"), "https://eagleeye-ks.com/watchlist");
    const cookies = r6.headers.getSetCookie().join("\n");
    assert.match(cookies, /eagleeye_session=/);
    assert.doesNotMatch(cookies, /gsecret|at;/);
    const user = [...env.DB.users.values()][0];
    assert.equal(user.discord_id, "google:g999");
    assert.ok(env.DB.funnel.includes("google_start") && env.DB.funnel.includes("login_new"));
    // 取り消し
    const r7 = await worker.fetch(new Request("https://eagleeye-ks.com/api/auth/google/callback?error=access_denied"), env, ctx);
    assert.equal(r7.status, 302);
    assert.ok(env.DB.funnel.includes("login_cancelled"));
  } finally { globalThis.fetch = origFetch; }
});

test("Discord専用の処理は仮IDに対して動かない", () => {
  const support = readFileSync(new URL("../src/discord-support.js", import.meta.url), "utf8");
  assert.match(support, /async function getGuildMember\(env, guildId, discordUserId\) \{\n[^\n]*\n  if \(!isDiscordUserId\(discordUserId\)\) return null;/);
  const ann = readFileSync(new URL("../src/announcement-discord.js", import.meta.url), "utf8");
  assert.match(ann, /if \(!isDiscordUserId\(dm\.discord_id\)\) \{/);
  const kvk = readFileSync(new URL("../src/kvk-discord.js", import.meta.url), "utf8");
  assert.match(kvk, /return \/\^\\d\{15,25\}\$\/\.test\(id\) \? id : "";/, "KvKスレッドは数字のIDだけ");
  const legal = readFileSync(new URL("../src/legal-pages.js", import.meta.url), "utf8");
  assert.match(legal, /<b>Googleアカウント情報<\/b>：Googleでログインした場合の、Googleアカウントの識別番号と表示名。メールアドレスは取得しません。/);
});

test("公開中：Googleのボタンは押せる。閉じる（googleOpen:false）と「準備中」で押せない", async () => {
  const { GOOGLE_LOGIN_OPEN, googleLoginOpen } = await import("../src/google-auth.js");
  assert.equal(GOOGLE_LOGIN_OPEN, true);
  assert.equal(googleLoginOpen({}), true);
  const closed = renderLoginChooserPage({ next: "/watchlist", googleOpen: false });
  assert.doesNotMatch(closed, /href="\/api\/auth\/google/);
  assert.match(closed, /aria-disabled="true">Googleでログイン<span>準備中<\/span>/);
  assert.match(closed, /href="\/api\/auth\/discord\?direct=1&amp;next=%2Fwatchlist"/);
  resetGoogleAuthSchemaCache();
  const worker = (await import("../src/index.js")).default;
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const env = { EAGLEEYE_SESSION_SECRET: "s", DISCORD_CLIENT_ID: "d", DISCORD_CLIENT_SECRET: "x", DB: memDb(), GOOGLE_OAUTH_CLIENT_ID: "cid", GOOGLE_OAUTH_CLIENT_SECRET: "gsecret" };
  const page = await (await worker.fetch(new Request("https://eagleeye-ks.com/login?next=/watchlist"), env, ctx)).text();
  assert.doesNotMatch(page, /lg-soon/);
  assert.match(page, /<a class="lg lg-g" href="\/api\/auth\/google\?x=1/);
  const r = await worker.fetch(new Request("https://eagleeye-ks.com/api/auth/google?x=1&next=/watchlist"), env, ctx);
  assert.equal(r.status, 302);
  assert.equal(new URL(r.headers.get("location")).host, "accounts.google.com");
  assert.ok(env.DB.funnel.includes("google_start"));
  // 閉じる仕組みは残す
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /if \(!googleLoginOpen\(env\) && url\.searchParams\.get\("test"\) !== "1"\) \{/);
});
