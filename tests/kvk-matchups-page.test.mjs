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

test("matchups: pairs once, Mystic tally decides order; no KvK scores, no total-power verdicts", async () => {
  const rows = [
    { kid: 1, opponent: 2, p1: 100e9, g1: 1e9, d1: 300, o1: 10, p2: 96e9, g2: 2e9, d2: 310, o2: 11 },
    { kid: 2, opponent: 1, p1: 96e9, p2: 100e9 },
    { kid: 3, opponent: 4, p1: 50e9, p2: 100e9 },
    { kid: 5, opponent: null, p1: 10e9 }
  ];
  const S = (v) => JSON.stringify({ coliseum: { top10: v[0] }, forest_of_life: { top10: v[1] }, crystal_cave: { top10: v[2] }, knowledge_nexus: { top10: v[3] }, molten_fort: { top10: v[4] }, radiant_spire: { top10: v[5] } });
  const mystic = [{ kid: 1, boards_json: S([5, 5, 5, 5, 5, 5]) }, { kid: 2, boards_json: S([4, 6, 5, 4, 4, 4]) }, { kid: 3, boards_json: S([9, 9, 9, 9, 9, 9]) }, { kid: 4, boards_json: S([1, 1, 1, 1, 1, 1]) }];
  const db = { prepare(sql) { return { bind() { return this; }, run: async () => ({}), all: async () => ({ results: /kvk_mystic_summary/.test(sql) ? mystic : rows }) }; } };
  resetKingdomStatsSchemaCache();
  const { resetKvkMysticSchemaCache } = await import("../src/kvk-mystic.js");
  resetKvkMysticSchemaCache();
  const { pairs } = await loadSeasonMatchups(db, 23);
  assert.equal(pairs.length, 3, "1-2 counted once, bye kept");
  assert.deepEqual([pairs[0].mystic.wins, pairs[0].mystic.losses, pairs[0].mystic.even], [4, 1, 1]);
  const html = renderKvkMatchupsPage({ season: 23, pairs, observedAt: 11, origin: "https://eagleeye-ks.com" });
  assert.match(html, /<title>キングショット KvK S23 組み合わせ一覧（秘境の試練で比較） \| EagleEye<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/eagleeye-ks\.com\/kvk\/s23">/);
  assert.ok(html.indexOf('data-kid="3"') < html.indexOf('data-kid="1"'), "6-0 before 4-1");
  assert.match(html, /<span class="w">4<\/span>-<span class="">1<\/span>/);
  assert.match(html, /href="\/kvk\?kid=1">内訳<\/a>/, "stage detail behind login");
  assert.doesNotMatch(html, /大差|やや差あり/, "no verdicts from total power");
  assert.match(html, /総戦力 .*（参考）/);
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

test("pairs not yet compared go to the bottom", () => {
  const pairs = [{ a: { kid: 9 }, b: { kid: 10 }, mystic: null }, { a: { kid: 1 }, b: { kid: 2 }, mystic: { wins: 3, losses: 3, even: 0, stages: [1, 2, 3, 4, 5, 6] } }];
  const html = renderKvkMatchupsPage({ season: 1, pairs });
  assert.ok(html.indexOf('data-kid="1"') < html.indexOf('data-kid="9"'));
});
