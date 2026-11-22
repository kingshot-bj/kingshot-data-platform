// ログイン後のホームの英語版（/en・オーナー・アドミンだけのテスト実装・2026-11-19）。
// 日本語のホームの文を変えたら home-en.js の辞書にも足す。このテストが「英語のホームに日本語が残っている」で止める。
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { englishSummaryTitles, MISSION_TITLES_EN } from "../src/home-en.js";
import { MISSION_ACTIONS } from "../src/missions.js";

const worker = (await import("../src/index.js")).default;
const secret = "s".repeat(40), b64 = b => Buffer.from(b).toString("base64url");
const body = b64(JSON.stringify({ sub: "123456789012345678", global_name: "Tester", exp: Math.floor(Date.now() / 1000) + 3600 }));
const token = body + "." + b64(crypto.createHmac("sha256", secret).update(body).digest());
function env(role) {
  const st = sql => { const s = { bind: () => s, first: async () => sql.includes("FROM users WHERE discord_id") ? { user_id: "u1", discord_id: "123456789012345678", username: "BJ", global_name: "Tester", role, status: "ACTIVE" } : null, all: async () => ({ results: [] }), run: async () => ({ meta: { changes: 0 } }) }; return s; };
  return { DB: { prepare: st, batch: async () => [] }, EAGLEEYE_SESSION_SECRET: secret, DISCORD_CLIENT_ID: "x", DISCORD_CLIENT_SECRET: "y" };
}
const open = (path, role) => worker.fetch(new Request("https://eagleeye-ks.com" + path, { headers: { cookie: "eagleeye_session=" + token, "user-agent": "Mozilla/5.0" } }), env(role), { waitUntil() {}, passThroughOnException() {} });
// 画面に出る文字（HTML と、画面内のスクリプトの文字列）。コメントは除く。
const japaneseLeft = h => {
  const x = h.replace(/(^|\n)\s*\/\/[^\n]*/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s\/\/\s[^\n]*[぀-ヿ一-鿿][^\n]*/g, "");
  return [...new Set([...x.matchAll(/[^<>"'`\n]*[぀-ヿ一-鿿　-〿＀-￯][^<>"'`\n]*/g)].map(m => m[0].trim()).filter(Boolean))];
};

test("オーナー・アドミンが /en を開くと、ログイン後のホームが英語（日本語が残っていない）", async () => {
  for (const role of ["OWNER", "ADMIN"]) {
    const res = await open("/en", role);
    assert.equal(res.status, 200, role);
    const h = await res.text();
    assert.match(h, /<html lang="en"/, role);
    assert.match(h, /Kingshot analysis dashboard/, role);
    assert.match(h, /fetch\("\/api\/home\/summary\?lang=en"/, role);
    assert.match(h, /'⚔️ '\+\(ev\.name\|\|'Swordland Showdown'\)/, "聖剣のイベント名は MightPulse の英語名");
    assert.deepEqual(japaneseLeft(h), [], role + " に日本語が残っている");
  }
});

test("VIP 以下が /en を開くと日本語のホームへ（英語版は非公開）", async () => {
  const res = await open("/en", "VIP");
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "https://eagleeye-ks.com/");
});

test("ミッション・マイルストーンの名前（API の ?lang=en）。ミッションは全部に英語名がある", () => {
  for (const a of MISSION_ACTIONS) assert.ok(MISSION_TITLES_EN[a.key], a.key);
  const s = englishSummaryTitles({ missions: { daily: [{ key: "kvk", title: "KvKの組み合わせを確認" }] }, milestones: { unseen: [{ key: "first_step", title: "はじめの一歩" }] } });
  assert.equal(s.missions.daily[0].title, "Check KvK matchups");
  assert.equal(s.milestones.unseen[0].title, "First step");
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /if \(new URL\(request\.url\)\.searchParams\.get\("lang"\) === "en"\) englishSummaryTitles\(summary\);/);
  assert.match(src, /label: ev\.label, name: ev\.name \|\| null/);
});
