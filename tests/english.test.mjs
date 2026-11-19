// 英語版（/en/...）の土台と最初のページ（2026-11-19）。
import test from "node:test";
import assert from "node:assert/strict";
import { splitLang, hasEnglish, enPath, langPath, hreflangLinks } from "../src/i18n.js";
import { renderSitemapXml, renderRobotsTxt } from "../src/public-pages.js";

const worker = (await import("../src/index.js")).default;
const env = { EAGLEEYE_SESSION_SECRET: "x".repeat(40) };
const ctx = { waitUntil() {}, passThroughOnException() {} };
const get = path => worker.fetch(new Request("https://eagleeye-ks.com" + path, { headers: { "user-agent": "Mozilla/5.0" } }), env, ctx);
const visibleText = h => h.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ");

test("パスと言語：/en を付ける・英語版があるページだけ", () => {
  assert.deepEqual(splitLang("/en"), { lang: "en", path: "/" });
  assert.deepEqual(splitLang("/en/guides/kvk"), { lang: "en", path: "/guides/kvk" });
  assert.deepEqual(splitLang("/guides/kvk"), { lang: "ja", path: "/guides/kvk" });
  assert.deepEqual(splitLang("/english"), { lang: "ja", path: "/english" });
  assert.equal(enPath("/"), "/en");
  assert.equal(hasEnglish("/guides/kvk"), true);
  assert.equal(hasEnglish("/guides"), true);
  assert.equal(hasEnglish("/k/1524"), false);
  assert.equal(langPath("en", "/k/1524"), "/k/1524", "英語版がないページは日本語版のまま");
  assert.match(hreflangLinks("https://x", "/guides"), /hreflang="ja" href="https:\/\/x\/guides".*hreflang="en" href="https:\/\/x\/en\/guides".*hreflang="x-default" href="https:\/\/x\/guides"/);
  assert.equal(hreflangLinks("https://x", "/k/1"), "");
});

test("英語版のページ：lang=en・hreflang・日本語へのリンク・日本語の下のメニューは出さない・見える日本語は「日本語」だけ", async () => {
  for (const p of ["/en", "/en/guides", "/en/guides/swordland-showdown", "/en/guides/swordland-summit-league", "/en/guides/kvk"]) {
    const res = await get(p);
    assert.equal(res.status, 200, p);
    const h = await res.text();
    assert.match(h, /<html lang="en">/, p);
    assert.match(h, /<link rel="alternate" hreflang="ja"/, p);
    assert.match(h, /<meta property="og:locale" content="en_US">/, p);
    assert.match(h, /lang="ja" hreflang="ja">日本語<\/a>/, p);
    assert.doesNotMatch(h, /<nav class="ee-global-nav/, p);
    const ja = [...new Set([...visibleText(h).matchAll(/[぀-ヿ一-鿿]+/g)].map(m => m[0]))];
    assert.deepEqual(ja, ["日本語"], p + " に日本語が残っている：" + ja.join(" "));
  }
});

test("日本語版のページ：英語版があれば hreflang と English へのリンク", async () => {
  const h = await (await get("/guides/kvk")).text();
  assert.match(h, /<html lang="ja">/);
  assert.match(h, /<link rel="alternate" hreflang="en" href="https:\/\/eagleeye-ks\.com\/en\/guides\/kvk">/);
  assert.match(h, /<a href="\/en\/guides\/kvk" lang="en" hreflang="en">English<\/a>/);
  const top = await (await get("/")).text();
  assert.match(top, /<a href="\/en" lang="en" hreflang="en">English<\/a>/);
});

test("英語版がまだないページの /en/... は日本語版へ・サイトマップに英語版・robots で止めない", async () => {
  const r = await get("/en/k/1524?x=1");
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), "https://eagleeye-ks.com/k/1524?x=1");
  const map = renderSitemapXml("https://eagleeye-ks.com", []);
  for (const p of ["/en", "/en/guides", "/en/guides/kvk"]) assert.match(map, new RegExp(`<loc>https://eagleeye-ks\\.com${p}</loc>`));
  const rules = renderRobotsTxt("https://eagleeye-ks.com").split("\n").filter(l => l.startsWith("Disallow: ")).map(l => l.slice(10));
  for (const p of ["/en", "/en/guides/kvk"]) assert.ok(!rules.some(r => r.endsWith("$") ? p === r.slice(0, -1) : p.startsWith(r)), p);
});
