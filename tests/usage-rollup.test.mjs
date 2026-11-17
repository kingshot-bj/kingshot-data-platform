import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readDayEvents, summarizeEvents, mergeIntoMonth, runUsageRollup, loadYear, renderUsageYearPage, topOps } from "../src/usage-rollup.js";
import { renderActiveUsersPage } from "../src/owner-active-users.js";

// 2026-11-17：年単位で利用を見たい（user_daily_active は90日で消える）。R2 の操作記録を毎晩集計して R2 に残す。D1 には書かない。
async function gz(text) { return await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer(); }
function bucket(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { m, get: async k => m.has(k) ? { arrayBuffer: async () => m.get(k), json: async () => JSON.parse(m.get(k)) } : null, put: async (k, v) => { m.set(k, v); } };
}
const ev = (u, op) => JSON.stringify({ actor_user_id: u, operation: op, occurred_at: "2026-11-16T01:00:00Z" });

test("1日分の記録を読む（半日ごとの2ファイル）・集計", async () => {
  const b = bucket({ "service-events/2026/11/16/00-12.ndjson.gz": await gz([ev("u1", "PLAYER_SEARCH"), ev("u1", "PLAYER_COMPARE_VIEW"), "broken"].join("\n")), "service-events/2026/11/16/12-24.ndjson.gz": await gz(ev("u2", "PLAYER_SEARCH") + "\n") });
  const events = await readDayEvents(b, "2026-11-16");
  assert.equal(events.length, 3);
  const s = summarizeEvents(events);
  assert.deepEqual(s.users.u1, { actions: 2, ops: { PLAYER_SEARCH: 1, PLAYER_COMPARE_VIEW: 1 } });
  assert.equal(s.ops.PLAYER_SEARCH, 2);
  assert.equal(topOps(s.users.u1.ops), "プレイヤー検索 1・プレイヤー比較 1");
});

test("月の集計：同じ日は2回足さない", () => {
  const daily = { day: "2026-11-16", active: ["u1", "u2"], newUsers: 1, actions: 3, ops: { PLAYER_SEARCH: 2 }, users: { u1: { actions: 3, ops: { PLAYER_SEARCH: 2 } } } };
  const a = mergeIntoMonth(null, daily);
  assert.equal(a.changed, true);
  assert.deepEqual(a.month.days["2026-11-16"], { active: 2, actions: 3, newUsers: 1 });
  assert.equal(a.month.users.u2.activeDays, 1);
  const b = mergeIntoMonth(a.month, daily);
  assert.equal(b.changed, false);
  assert.equal(b.month.users.u1.activeDays, 1);
});

test("毎晩の実行：日本時間0時台だけ・まだの日を最大6日・D1 には書かない", async () => {
  const b = bucket({ "service-events/2026/11/16/00-12.ndjson.gz": await gz(ev("u1", "PLAYER_SEARCH")) });
  const writes = [];
  const db = { prepare: sql => { if (!/^SELECT/.test(sql)) writes.push(sql); return { bind: () => ({ all: async () => ({ results: [{ user_id: "u1", role: "BASIC" }] }), first: async () => ({ n: 0 }) }) }; } };
  const at = Date.parse("2026-11-16T15:10:00Z"); // 11/17 0:10 JST
  assert.equal((await runUsageRollup({ DB: db, ARCHIVE: b }, { nowMs: at + 3 * 3600 * 1000 })).skipped, "NOT_THIS_TICK");
  const r = await runUsageRollup({ DB: db, ARCHIVE: b }, { nowMs: at });
  assert.equal(r.rolledUp.length, 6);
  assert.equal(r.rolledUp[0], "2026-11-16");
  assert.deepEqual(writes, []);
  const month = JSON.parse(b.m.get("usage-rollup/monthly/2026-11.json"));
  assert.deepEqual(month.days["2026-11-16"], { active: 1, actions: 1, newUsers: 0 });
  assert.ok(b.m.has("usage-rollup/daily/2026-11-16.json"));
  const again = await runUsageRollup({ DB: db, ARCHIVE: b }, { nowMs: at });
  assert.ok(!again.rolledUp.includes("2026-11-16"), "集計済みの日はやり直さない");
});

test("年のページ・使ったユーザーの「よく使った機能」・配線", async () => {
  const b = bucket({ "usage-rollup/monthly/2026-11.json": JSON.stringify({ month: "2026-11", days: { "2026-11-16": { active: 2, actions: 3, newUsers: 1 } }, users: { u1: { activeDays: 1, actions: 3, ops: { PLAYER_COMPARE_VIEW: 3 } } }, ops: { PLAYER_COMPARE_VIEW: 3 } }) });
  const months = await loadYear(b, 2026);
  const html = renderUsageYearPage({ year: 2026, months, names: { u1: "<b>BJ</b>" }, thisYear: 2026 });
  assert.match(html, /<td>11月<small>1日分<\/small><\/td><td class="num">1<\/td><td class="num">2\.0<\/td><td class="num">1<\/td><td class="num">3<\/td>/);
  assert.match(html, /&lt;b&gt;BJ&lt;\/b&gt;/);
  assert.match(html, /プレイヤー比較 3/);
  const page = renderActiveUsersPage({ day: "2026-11-17", users: [{ userId: "u1", name: "BJ", role: "OWNER", createdAt: 1, days7: 1, logins: 0, governors: [], isNew: false }], counts: [], usage: { u1: { actions: 2, ops: { PLAYER_SEARCH: 2 } } } }, Date.parse("2026-11-17T03:00:00Z"));
  assert.match(page, /プレイヤー検索 2/);
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /await runUsageRollup\(env\);/);
  assert.match(src, /if \(url\.pathname === "\/owner\/usage" \|\| url\.pathname === "\/owner\/usage\/run"\) \{\n        const guard = await requireOwner\(request, env\);/);
});
