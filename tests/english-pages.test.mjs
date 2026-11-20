// 英語版のページ（/en/〇〇・辞書で英語に）：日本語が残っていない・スクリプトが壊れていない（2026-11-20）。
// 日本語のページの文を変えたら、src/i18n-en-*.js の辞書にも足す（このテストが止める）。
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { japaneseLeft, translateHtmlToEnglish, enHref } from "../src/i18n-en.js";
import { heroPagePaths } from "../src/hero-pages.js";

const worker = (await import("../src/index.js")).default;
const secret = "s".repeat(40), b64 = b => Buffer.from(b).toString("base64url");
const body = b64(JSON.stringify({ sub: "123456789012345678", global_name: "Tester", exp: Math.floor(Date.now() / 1000) + 3600 }));
const token = body + "." + b64(crypto.createHmac("sha256", secret).update(body).digest());
const st = sql => { const s = { bind: () => s, first: async () => sql.includes("FROM users WHERE discord_id") ? { user_id: "u1", discord_id: "123456789012345678", username: "BJ", global_name: "Tester", role: "ADMIN", status: "ACTIVE" } : null, all: async () => ({ results: [] }), run: async () => ({ meta: { changes: 0 } }) }; return s; };
const env = { DB: { prepare: st, batch: async () => [] }, EAGLEEYE_SESSION_SECRET: secret, DISCORD_CLIENT_ID: "x", DISCORD_CLIENT_SECRET: "y" };
const open = path => worker.fetch(new Request("https://eagleeye-ks.com" + path, { headers: { cookie: "eagleeye_session=" + token, "user-agent": "Mozilla/5.0" } }), env, { waitUntil() {}, passThroughOnException() {} });
const scriptsOf = h => [...h.matchAll(/<script(?![^>]*type=["']?application\/(?:ld\+)?json)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim());
const broken = h => scriptsOf(h).filter(code => { try { new Function(code); return false; } catch { return true; } }).length;

export const EN_TEST_PAGES = ["/en/kingdoms", "/en/k/1524", "/en/kvk/s23", "/en/tools/gold", "/en/tools/gold-tech", "/en/tools/hero-shards", "/en/kingdom-timeline",
  // ログイン後の画面（2026-11-20）
  "/en/my-player", "/en/player?governor_id=249629710", "/en/players", "/en/alliance?kid=1524&tag=Pen", "/en/alliance/compare?a=1524%3APen&a=1546%3AMIT", "/en/watchlist", "/en/player-watchlist",
  "/en/kingdom-watchlist", "/en/swordland", "/en/kvk", "/en/news", "/en/settings/notifications", "/en/invite", "/en/milestones", "/en/kingdom?kid=1524", "/en/kingdom/rankings?kid=1524",
  "/en/kingdom/alliances?kid=1524", "/en/kingdom/compare?kid=1524&kid=1546", "/en/kingdom-catalog", "/en/settings/theme", "/en/player/compare?governor_id=249629710",
  // 英雄カタログ・英雄ページ（2026-11-20）
  "/en/hero-catalog", ...heroPagePaths().map(p => "/en" + p)];

test("データの画面・ログイン後の画面：英語で開ける・日本語が残っていない・スクリプトが日本語版より壊れていない", async () => {
  for (const p of EN_TEST_PAGES) {
    const res = await open(p);
    assert.ok(res.status === 200 || res.status === 404, p + " " + res.status);
    const h = await res.text();
    assert.match(h, /<html lang="en"/, p);
    assert.deepEqual(japaneseLeft(h), [], p + " に日本語が残っている");
    const ja = await (await open(p.slice(3))).text();
    assert.ok(broken(h) <= broken(ja), p + " のスクリプトが壊れた");
  }
});

test("訳文の ' はスクリプトを壊さないよう ’ に・ページ内のリンクは /en に（管理画面・API などは除く）", () => {
  const out = translateHtmlToEnglish("<html lang=\"ja\"><head></head><body><script>var a='<button>しばらく表示しない</button>';</script><a href=\"/k/1524\">x</a><a href=\"/api/x\">y</a><a href=\"/admin\">z</a><a href=\"/\">h</a></body></html>");
  assert.doesNotThrow(() => new Function(out.match(/<script>([\s\S]*?)<\/script>/)[1]));
  assert.match(out, /href="\/en\/k\/1524"/);
  assert.match(out, /href="\/api\/x"/);
  assert.match(out, /href="\/admin"/);
  assert.match(out, /href="\/en"/);
  assert.equal(enHref("/assets/a.png"), "/assets/a.png");
  assert.match(out, /<meta name="robots" content="noindex">/, "公開前は noindex");
});

test("英雄スキル：日本語版と同じ数・順番で英訳がある・スキル名はスキルカードの中だけで置き換える", async () => {
  const { HERO_SKILLS_JA } = await import("../src/hero-skills-ja.js");
  const { HERO_SKILLS_EN, heroSkillValueEn } = await import("../src/hero-skills-en.js");
  const ja = Object.values(HERO_SKILLS_JA).flatMap(h => h.groups.flatMap(g => g.skills));
  assert.equal(HERO_SKILLS_EN.length, ja.length);
  for (const [name, desc] of HERO_SKILLS_EN) { assert.ok(name && desc); assert.doesNotMatch(name + desc, /[぀-ヿ一-鿿]/); }
  // 「信頼」はスキル名（Trust）だが、ふつうの文の中では書き換えない
  const out = translateHtmlToEnglish('<html lang="ja"><head></head><body><h4>信頼</h4><p>信頼</p></body></html>');
  assert.match(out, /<h4>Trust<\/h4>/);
  assert.match(out, /<p>信頼<\/p>/);
  assert.equal(heroSkillValueEn("集結部隊の攻撃力+15%"), "Rally Attack+15%");
  assert.equal(heroSkillValueEn("8回ごと / 0.2秒眩暈"), "every 8 hits / 0.2s stun");
  assert.equal(heroSkillValueEn("160%"), "160%");
});
