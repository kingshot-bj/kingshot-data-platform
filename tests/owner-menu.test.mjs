// オーナー管理の整理：機能は1つも消さない（16個すべてがメニューのどこかにある）。
// 入口は重いユーザー一覧を読まない。ユーザー・権限管理と監査ログは /owner/users。どちらもオーナーだけ。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const groups = JSON.parse(index.match(/const OWNER_MENU_GROUPS = Object\.freeze\((\[[\s\S]*?\])\);/)[1]);

test("メニュー：4つのまとまり。整理前の16個の機能がすべて残っている（重複なし）", () => {
  assert.deepEqual(groups.map(g => g.title), ["成長・集客", "データ", "運用・トラブル対応", "開発・調査用"]);
  const hrefs = groups.flatMap(g => g.links.map(l => l.href));
  const before = ["/owner/social", "/owner/growth", "/owner/traffic", "/owner/discord-diagnostics", "/admin/api-pool", "/admin/google-drive", "/admin/diagnostics", "/admin/data-coverage", "/admin/api-raw-data", "/owner/kingdom-load-test", "/owner/kingdom-catalog-r2-backfill", "/admin/kingdom-rankings", "/admin/data-retention", "/admin/player-visibility", "/players", "/kingdom-watchlist"];
  assert.deepEqual([...hrefs].sort(), [...before].sort());
  assert.equal(new Set(hrefs).size, hrefs.length);
  assert.deepEqual(groups[0].links.map(l => l.href), ["/owner/growth", "/owner/traffic", "/owner/social"], "毎日見るものが一番上");
  assert.equal(groups[3].open, false, "開発・調査用は折りたたむ");
  assert.ok(groups.slice(0, 3).every(g => g.open));
});

test("入口とユーザー管理：オーナー以外には見せない。入口はユーザー一覧を読まない", async () => {
  assert.match(index, /if \(url\.pathname === "\/owner\/users"\) return eagleEyeHtmlResponse\(await renderOwnerAdminPage\(request, env, \{ view: "users" \}\)\);/);
  const fn = index.slice(index.indexOf("async function renderOwnerAdminPage("), index.indexOf("async function renderOwnerAdminPage(") + 900);
  assert.ok(fn.indexOf("if(guard.error)") < fn.indexOf('if(view==="menu")return renderOwnerMenuPage(env);'), "権限チェックが先");
  const menu = index.slice(index.indexOf("async function renderOwnerMenuPage("), index.indexOf("async function renderOwnerAdminPage("));
  assert.doesNotMatch(menu, /login_history|owner_audit_log|kingdom_watchlists/, "入口では重い一覧を読まない");
  assert.match(menu, /href="\/owner\/users"/);
  const worker = (await import("../src/index.js")).default;
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  for (const path of ["/owner", "/owner/users"]) {
    const html = await (await worker.fetch(new Request("https://eagleeye-ks.com" + path), { DB: { prepare: () => { const s = { bind: () => s, first: async () => null, all: async () => ({ results: [] }), run: async () => ({}) }; return s; } } }, ctx)).text();
    assert.match(html, /OWNER権限が必要です/, path);
    assert.doesNotMatch(html, /OWNER_MENU_GROUPS|ユーザー・権限管理<\/h1>/, path);
  }
});
