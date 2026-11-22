// 2026-11-15：ログインしていない人もお問い合わせを送れる。届け先は同じ Discord のサポートサーバー（運営だけが見る「web問い合わせ」）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateGuestInquiry, buildGuestInquiryMessage, handleGuestSupportApi, renderGuestSupportPage, resetGuestSupportCache, GUEST_SUPPORT_CHANNEL_NAME } from "../src/discord-support.js";

const ok = { category: "ACCOUNT", subject: "ログインできない", message: "戻ってこれません", contact: "me@example.com" };

test("入力の確かめ：種類・件名・内容は必須。URL は2つまで。隠し項目に何か入っていたらいたずら", () => {
  assert.equal(validateGuestInquiry(ok).categoryLabel, "アカウント");
  assert.equal(validateGuestInquiry({ ...ok, category: "NOPE" }).error, "INVALID_CATEGORY");
  assert.equal(validateGuestInquiry({ ...ok, subject: "" }).error, "SUBJECT_REQUIRED");
  assert.equal(validateGuestInquiry({ ...ok, message: "" }).error, "MESSAGE_REQUIRED");
  assert.equal(validateGuestInquiry({ ...ok, message: "http://a http://b http://c" }).error, "TOO_MANY_LINKS");
  assert.equal(validateGuestInquiry({ ...ok, website: "spam" }).error, "SPAM");
});

test("Discord への投稿文：返信先が無ければ「なし」。コードブロックを壊さない", () => {
  const m = buildGuestInquiryMessage({ ...validateGuestInquiry({ ...ok, contact: "", message: "a```b" }) }, { at: new Date("2026-11-15T03:00:00Z") });
  assert.match(m, /\*\*返信先：\*\* （なし）/);
  assert.match(m, /a'''b/);
  assert.ok(m.length < 2000);
});

function fakeEnv({ locked = false, dayCount = 1 } = {}) {
  const calls = [];
  const db = { prepare: sql => { const s = { bind: () => s, run: async () => ({ meta: { changes: /api_request_locks/.test(sql) ? (locked ? 0 : 1) : 1 } }), first: async () => ({ n: dayCount }), all: async () => ({ results: [] }) }; return s; } };
  return { calls, env: { DB: db, DISCORD_SUPPORT_GUILD_ID: "111111111111111111", DISCORD_CLIENT_ID: "222222222222222222", DISCORD_SUPPORT_CATEGORY_ID: "333333333333333333", DISCORD_SUPPORT_ROLE_ID: "444444444444444444", DISCORD_SUPPORT_ARCHIVE_CATEGORY_ID: "555555555555555555", DISCORD_BOT_TOKEN: "x" } };
}
const req = body => new Request("https://eagleeye-ks.com/api/support/guest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("送信：共有チャンネルが無ければ運営ロールだけが見られる形で作り、@ を鳴らさずに投稿する", async () => {
  resetGuestSupportCache();
  const { env } = fakeEnv();
  const sent = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    sent.push({ url: String(url), init });
    if (String(url).endsWith("/guilds/111111111111111111/channels") && !init.method) return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    if (String(url).endsWith("/guilds/111111111111111111/channels")) return new Response(JSON.stringify({ id: "999999999999999999" }), { status: 201, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ id: "1" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const res = await handleGuestSupportApi(req(ok), env, { ipHash: "abc" });
    assert.equal(res.status, 201);
  } finally { globalThis.fetch = orig; }
  const create = sent.find(s => s.init.method === "POST" && s.url.endsWith("/guilds/111111111111111111/channels"));
  const body = JSON.parse(create.init.body);
  assert.equal(body.name, GUEST_SUPPORT_CHANNEL_NAME);
  assert.equal(body.parent_id, "333333333333333333");
  assert.deepEqual(body.permission_overwrites.map(o => [o.id, o.allow, o.deny]), [["111111111111111111", "0", "1024"], ["444444444444444444", "68608", "0"], ["222222222222222222", "68608", "0"]]);
  const post = sent.find(s => s.url.endsWith("/channels/999999999999999999/messages"));
  assert.deepEqual(JSON.parse(post.init.body).allowed_mentions, { parse: [] });
});

test("回数の制限：同じところから10分以内・1日の上限を超えたら 429。いたずらは成功に見せて捨てる", async () => {
  assert.equal((await handleGuestSupportApi(req(ok), fakeEnv({ locked: true }).env, { ipHash: "a" })).status, 429);
  assert.equal((await handleGuestSupportApi(req(ok), fakeEnv({ dayCount: 51 }).env, { ipHash: "a" })).status, 429);
  const spam = await handleGuestSupportApi(req({ ...ok, website: "x" }), fakeEnv().env, { ipHash: "a" });
  assert.equal(spam.status, 200);
});

test("画面とルート：ログインしていない人にフォーム。API は同じサイトからだけ・IP はハッシュだけ", () => {
  const html = renderGuestSupportPage();
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /name="website" tabindex="-1"/);
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new Function(m[1]));
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const route = index.slice(index.indexOf('if (url.pathname === "/api/support/guest") {'), index.indexOf('if (url.pathname === "/api/support") {'));
  assert.ok(route.indexOf("isSameOriginRequest") < route.indexOf("handleGuestSupportApi"));
  assert.match(route, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(index, /if \(!auth \|\| auth\.status !== "ACTIVE"\) return renderGuestSupportPage\(\);/);
});
