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
