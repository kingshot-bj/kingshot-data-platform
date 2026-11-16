import test from "node:test";
import assert from "node:assert/strict";
import { loadSnapshotD1, SNAPSHOT_SECTIONS } from "../src/owner-snapshot.js";

// 2026-11-17：「今日 D1 の読み取りが多い」原因を探すため、今日と前日の重いクエリを Cloudflare Analytics から（D1 は読まない）。
test("d1：今日と前日の読み取りが多いクエリ・割合・1回あたり", async () => {
  assert.ok(SNAPSHOT_SECTIONS.includes("d1"));
  assert.deepEqual(await loadSnapshotD1({}), { configured: false });
  const now = Date.parse("2026-11-17T03:00:00Z");
  let sent;
  const fetchImpl = async (url, opt) => { sent = JSON.parse(opt.body); return new Response(JSON.stringify({ data: { viewer: { accounts: [{ d1QueriesAdaptiveGroups: [
    { count: 10, sum: { rowsRead: 900, rowsWritten: 0 }, dimensions: { date: "2026-11-17", query: "SELECT  *\n FROM big" } },
    { count: 100, sum: { rowsRead: 100, rowsWritten: 5 }, dimensions: { date: "2026-11-17", query: "SELECT 1" } },
    { count: 1, sum: { rowsRead: 50, rowsWritten: 0 }, dimensions: { date: "2026-11-16", query: "SELECT y" } }
  ] }] } } }), { status: 200 }); };
  const r = await loadSnapshotD1({ CLOUDFLARE_ANALYTICS_TOKEN: "t", CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_D1_DATABASE_ID: "d" }, { nowMs: now, fetchImpl });
  assert.deepEqual(sent.variables, { a: "a", s: "2026-11-16", e: "2026-11-17", d: "d" });
  assert.equal(r.today.rowsRead, 1000);
  assert.deepEqual(r.today.top[0], { rowsRead: 900, rowsWritten: 0, count: 10, query: "SELECT * FROM big", share: 90, rowsPerQuery: 90 });
  assert.equal(r.yesterday.rowsRead, 50);
});
