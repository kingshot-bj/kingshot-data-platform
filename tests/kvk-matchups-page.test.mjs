import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { powerGap, gapLabel, compactPower, renderKvkMatchupsPage, loadSeasonMatchups } from "../src/kvk-matchups-page.js";
import { kingdomStatsRow, saveKingdomStats, resetKingdomStatsSchemaCache } from "../src/kingdom-stats.js";
import { renderSitemapXml } from "../src/public-pages.js";
import { ogImagePath } from "../src/seo.js";

test("power gap and labels", () => {
  assert.equal(powerGap(100, 96), 4);
  assert.equal(powerGap(50, 100), 50);
  assert.equal(powerGap(0, 100), null);
  assert.equal(gapLabel(null), "データ待ち");
  assert.equal(gapLabel(4.9), "互角");
  assert.equal(gapLabel(40), "大差");
  assert.equal(compactPower(56_300_000_000), "56.3B");
  assert.equal(compactPower(null), "—");
});

test("kingdom stats rows: headline numbers only, chunked under the bind limit", async () => {
  assert.deepEqual(kingdomStatsRow(1524, { power: 56.3e9, power_gain_7d: 1.2e9, power_rank: 300, age_days: 120, player_count: 900, active_7d: 400, online: 5 }, 1000), [1524, 56300000000, 1200000000, 300, 120, 900, 1000]);
  assert.equal(kingdomStatsRow(1, {}, 1), null);
  resetKingdomStatsSchemaCache();
  const statements = [];
  const db = { prepare(sql) { return { sql, bind(...a) { this.args = a; return this; }, run: async () => ({}) }; }, batch: async st => { statements.push(...st); } };
  const items = Array.from({ length: 24 }, (_, i) => ({ kid: i + 1, row: { power: 1e9 + i } }));
  assert.equal(await saveKingdomStats(db, items, 99), 24);
  assert.equal(statements.length, 2);
  assert.ok(statements.every(s => s.args.length <= 100));
  assert.doesNotMatch(statements[0].sql, /active|online|last_/);
});

test("matchups: pairs once, sorted by gap; no KvK scores on the public page", async () => {
  const rows = [
    { kid: 1, opponent: 2, p1: 100e9, g1: 1e9, d1: 300, o1: 10, p2: 96e9, g2: 2e9, d2: 310, o2: 11 },
    { kid: 2, opponent: 1, p1: 96e9, p2: 100e9 },
    { kid: 3, opponent: 4, p1: 50e9, p2: 100e9 },
    { kid: 5, opponent: null, p1: 10e9 }
  ];
  const db = { prepare() { return { bind() { return this; }, run: async () => ({}), all: async () => ({ results: rows }) }; } };
  resetKingdomStatsSchemaCache();
  const { pairs } = await loadSeasonMatchups(db, 23);
  assert.equal(pairs.length, 3, "1-2 counted once, bye kept");
  const html = renderKvkMatchupsPage({ season: 23, pairs, observedAt: 11, origin: "https://eagleeye-ks.com" });
  assert.match(html, /<title>キングショット KvK S23 組み合わせ一覧と戦力差 \| EagleEye<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/eagleeye-ks\.com\/kvk\/s23">/);
  assert.ok(html.indexOf('data-kid="3"') < html.indexOf('data-kid="1"'), "bigger gap first");
  assert.match(html, /互角/);
  assert.match(html, /不戦/);
  assert.doesNotMatch(html, /score|スコア \d/i, "no KvK scores");
});

test("wiring: routes, sitemap, links, share card", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /url\.pathname === "\/kvk\/matchups"/);
  assert.match(src, /url\.pathname\.match\(\/\^\\\/kvk\\\/s\(\\d\{1,4\}\)\\\/\?\$\/\)/);
  assert.match(src, /<a href="\/kvk\/matchups"><b>KvK組み合わせ<\/b>/);
  assert.match(readFileSync(new URL("../src/kingdom-catalog.js", import.meta.url), "utf8"), /saveKingdomStats\(env\.DB, uniqueCandidates, now\)/);
  assert.match(renderSitemapXml("https://x", [], undefined, ["/kvk/s23"]), /<loc>https:\/\/x\/kvk\/s23<\/loc>/);
  assert.equal(ogImagePath("/kvk/s23"), "/assets/og/kingdoms.jpg");
});
