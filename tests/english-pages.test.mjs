// 英語版のページ（/en/〇〇・辞書で英語に）：日本語が残っていない・スクリプトが壊れていない（2026-11-20）。
// 日本語のページの文を変えたら、src/i18n-en-*.js の辞書にも足す（このテストが止める）。
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { japaneseLeft, translateHtmlToEnglish, enHref } from "../src/i18n-en.js";

const worker = (await import("../src/index.js")).default;
const secret = "s".repeat(40), b64 = b => Buffer.from(b).toString("base64url");
const body = b64(JSON.stringify({ sub: "123456789012345678", global_name: "Tester", exp: Math.floor(Date.now() / 1000) + 3600 }));
const token = body + "." + b64(crypto.createHmac("sha256", secret).update(body).digest());
const st = sql => { const s = { bind: () => s, first: async () => sql.includes("FROM users WHERE discord_id") ? { user_id: "u1", discord_id: "123456789012345678", username: "BJ", global_name: "Tester", role: "ADMIN", status: "ACTIVE" } : null, all: async () => ({ results: [] }), run: async () => ({ meta: { changes: 0 } }) }; return s; };
const env = { DB: { prepare: st, batch: async () => [] }, EAGLEEYE_SESSION_SECRET: secret, DISCORD_CLIENT_ID: "x", DISCORD_CLIENT_SECRET: "y" };
const open = path => worker.fetch(new Request("https://eagleeye-ks.com" + path, { headers: { cookie: "eagleeye_session=" + token, "user-agent": "Mozilla/5.0" } }), env, { waitUntil() {}, passThroughOnException() {} });
const scriptsOf = h => [...h.matchAll(/<script(?![^>]*type=["']?application\/(?:ld\+)?json)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim());
const broken = h => scriptsOf(h).filter(code => { try { new Function(code); return false; } catch { return true; } }).length;

export const EN_TEST_PAGES = ["/en/kingdoms", "/en/k/1524", "/en/kvk/s23", "/en/tools/gold", "/en/tools/gold-tech", "/en/tools/hero-shards", "/en/kingdom-timeline"];

test("データの画面：英語で開ける・日本語が残っていない・スクリプトが日本語版より壊れていない", async () => {
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
