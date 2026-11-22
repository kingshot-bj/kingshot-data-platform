import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { summarizeKingdomGrowth, archiveKingdomGrowthRows, loadKingdomGrowthHistory, renderKingdomGrowthSection, kingdomGrowthKey } from "../src/kingdom-growth-history.js";
import { runKingdomCatalogDailyRefresh, DISCOVERY_STALE_RUNNING_SECONDS } from "../src/kingdom-catalog-scheduler.js";

function fakeR2() {
  const objects = new Map();
  return {
    objects,
    async put(key, body) { objects.set(key, String(body)); },
    async list({ prefix }) { return { objects: [...objects.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })), truncated: false }; },
    async get(key) { const v = objects.get(key); return v == null ? null : { text: async () => v }; }
  };
}

test("growth summaries keep documented power fields and drop activity fields", () => {
  const s = summarizeKingdomGrowth({ kid: 1524, power: "1000", power_gain_7d: 50, science_power: 7, located: 300, active_players: 300, active_7d: 9, active_30d: 9, name: "x" });
  assert.deepEqual(s, { power: 1000, power_gain_7d: 50, research_power: 7 });
  assert.equal(summarizeKingdomGrowth({ located: 3 }), null);
});

test("discovery rows become one object per kingdom per day and render deltas", async () => {
  const r2 = fakeR2();
  const day = n => Date.UTC(2026, 9, 31, 12) / 1000 - n * 86400;
  await archiveKingdomGrowthRows(r2, [{ kid: 1524, row: { power: 900, power_rank: 12 } }], day(8));
  await archiveKingdomGrowthRows(r2, [{ kid: 1524, row: { power: 1000, power_rank: 10 } }, { kid: 1525, row: { power: 5 } }], day(0));
  await archiveKingdomGrowthRows(r2, [{ kid: 1524, row: { power: 1100, power_rank: 9 } }], day(0) + 600);
  assert.equal(r2.objects.size, 3, "same-day pages overwrite");
  assert.equal(kingdomGrowthKey(1524, day(0)), "history/kingdom_growth/v1/1524/2026-10-31.json");
  const history = await loadKingdomGrowthHistory(r2, 1524);
  assert.equal(history.latest.power, 1100);
  assert.equal(history.comparisons[0].label, "7日前");
  const html = renderKingdomGrowthSection(history);
  assert.match(html, /成長の推移/);
  assert.match(html, /\+200/);
  assert.match(html, /<td class='up'>-3<\/td>/, "a better (smaller) rank is shown as an improvement");
  assert.doesNotMatch(html, /Active|アクティブ/);
});

function schedulerDb(state) {
  const writes = [];
  return {
    writes,
    prepare(sql) {
      const s = { bind: () => s, first: async () => sql.includes("FROM kingdom_catalog_discovery") ? state : null, all: async () => ({ results: [] }), run: async () => { writes.push(sql); return { meta: { changes: 1 } }; } };
      return s;
    }
  };
}

test("a RUNNING flag older than the stale window no longer blocks discovery forever", async () => {
  const now = Math.floor(Date.now() / 1000);
  const fresh = await runKingdomCatalogDailyRefresh({ DB: schedulerDb({ state: "RUNNING", next_page: 3, updated_at: now - 60 }) });
  assert.equal(fresh.reason, "DISCOVERY_ALREADY_RUNNING");
  const throttled = await runKingdomCatalogDailyRefresh({ DB: schedulerDb({ state: "IDLE", next_page: 3, last_page_at: now - 60, updated_at: now - 60 }) });
  assert.equal(throttled.reason, "DISCOVERY_THROTTLED");
  const failed = await runKingdomCatalogDailyRefresh({ DB: schedulerDb({ state: "FAILED", next_page: 3, last_page_at: now - 9999, updated_at: now - 60 }) });
  assert.equal(failed.reason, "DISCOVERY_THROTTLED", "failures wait one interval too");
  // Stale RUNNING proceeds to a real page fetch (which fails here without an API pool) instead of skipping.
  await assert.rejects(runKingdomCatalogDailyRefresh({ DB: schedulerDb({ state: "RUNNING", next_page: 3, updated_at: now - DISCOVERY_STALE_RUNNING_SECONDS - 5 }) }));
});

test("discovery archives growth rows and the kingdom page shows them", () => {
  const discovery = readFileSync(new URL("../src/kingdom-catalog.js", import.meta.url), "utf8");
  assert.match(discovery, /archiveKingdomGrowthRows\(env\.ARCHIVE, uniqueCandidates, now\)/);
  const portal = readFileSync(new URL("../src/kingdom-portal.js", import.meta.url), "utf8");
  assert.match(portal, /loadKingdomGrowthHistory\(env\.ARCHIVE, kid\)/);
});
