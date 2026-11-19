// 英語版（/en/...）：公開前はオーナー・アドミンだけ（2026-11-19）。
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { splitLang, hasEnglish, enPath, langPath, hreflangLinks, canSeeEnglish, EN_PUBLIC } from "../src/i18n.js";
import { renderSitemapXml } from "../src/public-pages.js";

const worker = (await import("../src/index.js")).default;
const secret = "s";
const b64 = b => Buffer.from(b).toString("base64url");
const body = b64(JSON.stringify({ sub: "123456789012345678", exp: Math.floor(Date.now() / 1000) + 3600 }));
const token = body + "." + b64(crypto.createHmac("sha256", secret).update(body).digest());
function db(role) {
  const stmt = sql => { const st = { bind: () => st, first: async () => (role && sql.includes("FROM users WHERE discord_id")) ? { user_id: "u1", discord_id: "123456789012345678", username: "BJ", role, status: "ACTIVE" } : null, all: async () => ({ results: [] }), run: async () => ({ meta: { changes: 0 } }) }; return st; };
  return { prepare: stmt, batch: async () => [] };
}
const get = (path, role = null) => worker.fetch(new Request("https://eagleeye-ks.com" + path, { headers: { "user-agent": "Mozilla/5.0", ...(role ? { cookie: "eagleeye_session=" + token } : {}) } }), { DB: db(role), EAGLEEYE_SESSION_SECRET: secret }, { waitUntil() {}, passThroughOnException() {} });
const visibleText = h => h.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ");

test("公開前：英語版はオーナー・アドミンだけ", () => {
  assert.equal(EN_PUBLIC, false, "公開はオーナーの指示があってから");
  assert.equal(canSeeEnglish("OWNER"), true);
  assert.equal(canSeeEnglish("ADMIN"), true);
  assert.equal(canSeeEnglish("VIP"), false);
  assert.equal(canSeeEnglish(null), false);
});

test("パスと言語：/en を付ける・英語版があるページだけ", () => {
  assert.deepEqual(splitLang("/en"), { lang: "en", path: "/" });
  assert.deepEqual(splitLang("/en/guides/kvk"), { lang: "en", path: "/guides/kvk" });
  assert.deepEqual(splitLang("/english"), { lang: "ja", path: "/english" });
  assert.equal(enPath("/"), "/en");
  assert.equal(hasEnglish("/guides/kvk"), true);
  assert.equal(hasEnglish("/k/1524"), false);
  assert.equal(langPath("en", "/k/1524"), "/k/1524");
  assert.equal(hreflangLinks("https://x", "/guides"), "", "公開前は hreflang を出さない");
});

test("ログインなし・VIP は日本語版へ。英語版は共有キャッシュに入れない", async () => {
  for (const [path, role] of [["/en", null], ["/en/guides/kvk", null], ["/en/guides", "VIP"]]) {
    const r = await get(path, role);
    assert.equal(r.status, 302, path);
    assert.equal(r.headers.get("location"), "https://eagleeye-ks.com" + splitLang(path).path, path);
  }
});

test("オーナー・アドミン：英語版が見られる（noindex・日本語へのリンク・日本語の下のメニューなし・見える日本語は「日本語」だけ）", async () => {
  // /en はログイン中ならログイン後のホームの英語版（tests/english-home.test.mjs）
  for (const role of ["OWNER", "ADMIN"]) for (const p of ["/en/guides", "/en/guides/swordland-showdown", "/en/guides/swordland-summit-league", "/en/guides/kvk"]) {
    const res = await get(p, role);
    assert.equal(res.status, 200, p);
    assert.doesNotMatch(String(res.headers.get("cache-control")), /public/, "共有キャッシュに入れない");
    const h = await res.text();
    assert.match(h, /<html lang="en">/, p);
    assert.match(h, /<meta name="robots" content="noindex">/, p);
    assert.doesNotMatch(h, /hreflang="en" href=/, p);
    assert.match(h, /lang="ja" hreflang="ja">日本語<\/a>/, p);
    assert.doesNotMatch(h, /<nav class="ee-global-nav/, p);
    const ja = [...new Set([...visibleText(h).matchAll(/[぀-ヿ一-鿿]+/g)].map(m => m[0]))];
    assert.deepEqual(ja, ["日本語"], p + "：" + ja.join(" "));
  }
  const r = await get("/en/k/1524", "OWNER");
  assert.equal(r.status, 302, "英語版がまだないページは日本語版へ");
});

test("公開前：日本語版に English のリンク・hreflang を出さない。サイトマップにも英語版を入れない", async () => {
  const h = await (await get("/guides/kvk")).text();
  assert.doesNotMatch(h, /hreflang="en"/);
  assert.doesNotMatch(h, />English<\/a>/);
  const map = renderSitemapXml("https://eagleeye-ks.com", []);
  assert.doesNotMatch(map, /<loc>https:\/\/eagleeye-ks\.com\/en/);
});
