// 監査で見つかった「行き止まり」の再発防止：番号なし・未ログイン・データなしで開いても、次にできることが出る。
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";

const worker = (await import("../src/index.js")).default;
const secret = "s";
const b64 = b => Buffer.from(b).toString("base64url");
const body = b64(JSON.stringify({ sub: "123456789012345678", exp: Math.floor(Date.now() / 1000) + 3600 }));
const token = body + "." + b64(crypto.createHmac("sha256", secret).update(body).digest());
const db = signed => { const stmt = sql => ({ bind: () => stmt(sql), first: async () => (signed && sql.includes("FROM users WHERE discord_id")) ? { user_id: "u1", discord_id: "123456789012345678", username: "BJ", role: "BASIC", status: "ACTIVE" } : null, all: async () => ({ results: [] }), run: async () => ({ meta: { changes: 0 } }) }); return { prepare: stmt, batch: async () => [] }; };
async function open(path, signed = false) {
  const waits = [];
  const res = await worker.fetch(new Request("https://eagleeye-ks.com" + path, { headers: signed ? { cookie: "eagleeye_session=" + token } : {} }), { DB: db(signed), EAGLEEYE_SESSION_SECRET: secret, DISCORD_CLIENT_ID: "x", DISCORD_CLIENT_SECRET: "y" }, { waitUntil: p => waits.push(p), passThroughOnException() {} });
  await Promise.allSettled(waits);
  return { res, text: await res.text() };
}

test("王国の番号なし：説明文ではなく番号の入力フォーム", async () => {
  for (const [path, title] of [["/kingdom", "王国の詳細"], ["/kingdom/alliances", "同盟一覧"], ["/kingdom/changes", "ランキングの変化"], ["/kingdom/mighty", "KvK・王国イベント"], ["/alliance", "同盟を探す"]]) {
    const { res, text } = await open(path);
    assert.equal(res.status, 200, path);
    assert.match(text, new RegExp("<form class='kf' method='get' action='" + (path === "/alliance" ? "/kingdom/alliances" : path) + "'>"), path);
    assert.ok(text.includes(title), path);
    assert.doesNotMatch(text, /王国IDを指定してください|kidを指定してください|同盟タグを指定してください/, path);
  }
});

test("同盟タグなし→その王国の同盟一覧、領主IDなし→プレイヤー検索", async () => {
  assert.equal((await open("/alliance?kid=1524")).res.headers.get("location"), "https://eagleeye-ks.com/kingdom/alliances?kid=1524");
  for (const p of ["/player", "/player/history", "/player/changes"]) {
    const { res } = await open(p, true);
    assert.equal(res.status, 302, p);
    assert.equal(res.headers.get("location"), "https://eagleeye-ks.com/players");
  }
});

test("未ログインでもエラーの文字（JSON）ではなくログイン画面", async () => {
  for (const p of ["/player/compare", "/kingdom-watchlist/analytics", "/kingdom-watchlist", "/support"]) {
    const { res, text } = await open(p);
    assert.match(res.headers.get("content-type") || "", /text\/html/, p);
    assert.match(text, /ログインが必要です/, p);
    assert.doesNotMatch(text, /"error":"UNAUTHORIZED"/, p);
  }
});

test("データの無い王国の同盟一覧：ログイン中は取得して再読み込み、未ログインは案内", async () => {
  assert.match((await open("/kingdom/alliances?kid=1524", true)).text, /同盟一覧の最新データを取得しています/);
  assert.match((await open("/kingdom/alliances?kid=1524")).text, /同盟一覧はまだ取得されていません。 <a href='\/api\/auth\/discord\?next=/);
});

test("英語・開発者向けの言葉を出さない（王国の詳細・変化・状況）", () => {
  const portal = readFileSync(new URL("../src/kingdom-portal.js", import.meta.url), "utf8");
  for (const w of ["Momentum", "Top Player", "Top Alliance", "Power Gain 7d", "page(\"Mighty Events / KvK\"", "Change Event", "Watchlist Analytics", "R2：", "kidを指定"]) assert.ok(!portal.includes(w), w);
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.ok(!index.includes("<b>Cloudflare Usage</b>"));
  assert.ok(!index.includes("<h2>Cloudflare リソース監視</h2>"));
});
