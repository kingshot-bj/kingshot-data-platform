// プレイヤー比較の「画像で共有」：アバター中継は許可ホストの画像だけ・共有スクリプトが単体で動く・配線。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { avatarProxyTarget, handleAvatarProxy, compareShareScript, compareShareClient, SHARE_LANDING_PATH } from "../src/compare-share.js";

test("アバター中継は got-global-avatar の https 画像だけ", () => {
  assert.equal(avatarProxyTarget("https://got-global-avatar.akamaized.net/avatar/2026/11/02/a.png"), "https://got-global-avatar.akamaized.net/avatar/2026/11/02/a.png");
  for (const bad of ["http://got-global-avatar.akamaized.net/a.png", "https://evil.example/a.png", "https://got-global-avatar.akamaized.net/a.html",
    "https://got-global-avatar.akamaized.net.evil.example/a.png", "https://user:pw@got-global-avatar.akamaized.net/a.png", "https://got-global-avatar.akamaized.net:8443/a.png", "", null, "javascript:alert(1)"]) {
    assert.equal(avatarProxyTarget(bad), null, String(bad));
  }
});

test("中継：不正URLは400、画像以外・大きすぎは502、成功はキャッシュして返す", async () => {
  const req = u => new Request("https://eagleeye-ks.com/api/avatar?u=" + encodeURIComponent(u));
  assert.equal((await handleAvatarProxy(req("https://evil.example/a.png"), { cache: null })).status, 400);
  const html = async () => new Response("<html>", { headers: { "content-type": "text/html" } });
  assert.equal((await handleAvatarProxy(req("https://got-global-avatar.akamaized.net/a.png"), { fetchImpl: html, cache: null })).status, 502);
  const big = async () => new Response(new Uint8Array(600 * 1024), { headers: { "content-type": "image/png" } });
  assert.equal((await handleAvatarProxy(req("https://got-global-avatar.akamaized.net/a.png"), { fetchImpl: big, cache: null })).status, 502);
  const store = new Map();
  const cache = { match: async k => store.get(k.url), put: async (k, v) => { store.set(k.url, v); } };
  let calls = 0;
  const ok = async () => { calls++; return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } }); };
  const r1 = await handleAvatarProxy(req("https://got-global-avatar.akamaized.net/a.png"), { fetchImpl: ok, cache });
  assert.equal(r1.status, 200);
  assert.equal(r1.headers.get("content-type"), "image/png");
  assert.equal(r1.headers.get("x-content-type-options"), "nosniff");
  await handleAvatarProxy(req("https://got-global-avatar.akamaized.net/a.png"), { fetchImpl: ok, cache });
  assert.equal(calls, 1);
});

test("共有スクリプトは構文が正しく、外の変数に依存しない", () => {
  const html = compareShareScript();
  const js = html.replace(/^<script>|<\/script>$/g, "");
  assert.doesNotThrow(() => new Function(js));
  assert.doesNotMatch(compareShareClient.toString(), /`/, "テンプレート文字列を使わない（ページ側のテンプレートで壊れないように）");
  assert.match(html, /"landing":"\/\?ref=share"/);
  assert.equal(SHARE_LANDING_PATH, "/?ref=share");
  assert.match(js, /画像で共有/);
  assert.match(js, /リンクをコピー/);
  assert.match(js, /navigator\.share\(\{ files: \[file\], text: shareText \}\)/);
  assert.match(js, /value_label/);
});

test("比較画面に組み込まれ、/api/avatar がつながり、QR画像がある", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /PLAYER_COMPARE_ENHANCEMENTS \+ compareShareScript\(\) \+ "<\/body>"/);
  assert.match(src, /url\.pathname === "\/api\/avatar"\) return await handleAvatarProxy\(request\)/);
  const qr = new URL("../public/assets/eagleeye/qr-share.svg", import.meta.url);
  assert.ok(existsSync(qr));
  assert.match(readFileSync(qr, "utf8"), /^<svg width="236" height="236"/);
});

test("プレイヤー比較の共有：ページで選んだ項目（表示中の行・追加ランキング）を画像に載せる", async () => {
  const { compareShareClient } = await import("../src/compare-share.js");
  const src = compareShareClient.toString();
  assert.match(src, /function pickedRows\(d, hasMys\)/);
  assert.match(src, /document\.querySelectorAll\("\.compare-player-card"\)/, "スマホはプレイヤーごとのカードから読む");
  assert.match(src, /document\.getElementById\("eeCompareTableData"\)/, "表にしかない項目（英雄スキルなど）は控えから読む");
  assert.match(src, /window\.__eeCompareShown/, "表示するかはページの選択（項目＋グループ）に合わせる");
  assert.match(src, /if \(skip\[label\] \|\| !r\.visible \|\|/, "チェックしていない項目は載せない");
  assert.match(src, /add\(label, shown \? shown\(label\) : !m\.hidden,/, "カードの行もページの選択で決める");
  assert.doesNotMatch(src, /custom\[label\]/, "追加ランキング（グラフ用）の選択で項目を足さない");
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(index, /tableData\.id=\\"eeCompareTableData\\";tableData\.innerHTML=h;box\.appendChild\(tableData\);/);
  assert.match(index, /window\.__eeCompareShown=function\(label\)\{const g=compareGroupForLabel\(label\);/);
  assert.match(src, /"戦力": 1, "役場レベル": 1/, "上で描く基本項目は重ねない");
  assert.match(src, /"EagleEye取得": 1, "元データ時刻": 1/);
  assert.match(src, /rows: out\.slice\(0, 100\)/, "iPhoneで作れる大きさに抑える");
  assert.match(src, /選んだ比較項目/);
  // 数字として比べる（順位は小さい方、Lv・億/万・M・章-ステージ）
  const scoreSrc = src.slice(src.indexOf("function scoreOf"), src.indexOf("function pickedRows"));
  const scoreOf = new Function(scoreSrc + "; return scoreOf;")();
  assert.equal(scoreOf("1.2M"), 1.2e6);
  assert.equal(scoreOf("#12"), 12);
  assert.equal(scoreOf("Lv.10"), 10);
  assert.equal(scoreOf("3,456"), 3456);
  assert.equal(scoreOf("5.2億"), 5.2e8);
  assert.equal(scoreOf("61-5"), 6105);
  assert.equal(scoreOf("伝説★2"), null);
});
