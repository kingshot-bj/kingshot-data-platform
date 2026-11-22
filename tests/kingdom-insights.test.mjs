// 2026-11-15：AdSense「有用性の低いコンテンツ」対応。王国ページに、手元の集計から計算したその王国だけの分析を出す。
// 空の欄・意味が未確認の「戦力順位」は出さない。どこにも当たらない URL は 404（ソフト404をやめる）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadAllKingdomStats, computeKingdomInsights, renderKingdomInsights, resetKingdomInsightsCache, COHORT_DAYS } from "../src/kingdom-insights.js";
import { renderNotFoundPage } from "../src/public-pages.js";

const compact = v => (Math.round(v / 1e8) / 10) + "B";
const rows = [
  { kid: 1, power: 300e9, gain: 10e9, age: 570, players: 5000 },
  { kid: 2, power: 200e9, gain: 12e9, age: 560, players: 4000 },
  { kid: 3, power: 100e9, gain: -2e9, age: 565, players: 3000 },
  { kid: 4, power: 150e9, gain: 1e9, age: 555, players: 3500 },
  { kid: 5, power: 120e9, gain: 3e9, age: 580, players: 3200 },
  { kid: 6, power: 50e9, gain: 5e9, age: 100, players: 900 }
];

test("全王国の中の順位・開設時期が近い王国の中の順位・総力が近い王国", () => {
  const ins = computeKingdomInsights(4, rows);
  assert.equal(ins.total, 6);
  assert.equal(ins.powerRank, 3);
  assert.equal(ins.gainRank, 5);
  assert.equal(ins.cohort.size, 5, `開設が前後${COHORT_DAYS}日の王国だけ（王国6は入らない）`);
  assert.equal(ins.cohort.powerRank, 3);
  assert.equal(ins.cohort.medianPower, 150e9);
  assert.deepEqual(ins.nearPower.map(r => r.kid), [1, 2, 5, 3, 6]);
  assert.equal(computeKingdomInsights(999, rows), null, "データの無い王国は分析しない");
});

test("文章は実際の数字から。戦力が減っていればそう書く。同じ時期の王国が少なければ比べない", () => {
  const html = renderKingdomInsights(3, computeKingdomInsights(3, rows), compact);
  assert.match(html, /<h2>王国3の分析<\/h2>/);
  assert.match(html, /強さとは比例しません。順位は規模の目安です/, "総力の順位を強さの順位として見せない");
  assert.match(html, /総力は全6王国中 <b>5位<\/b>/);
  assert.match(html, /7日間で総力が <b>減っています<\/b>（伸びは全6王国中6位）/);
  assert.match(html, /開設時期が近い王国（開設535〜595日・5王国）の中で、総力は <b>5位<\/b>・中央値より33%少ない/);
  const lonely = renderKingdomInsights(6, computeKingdomInsights(6, rows), compact);
  assert.doesNotMatch(lonely, /開設時期が近い王国（/, "比べる相手が5王国未満なら出さない");
  assert.equal(renderKingdomInsights(1, null, compact), "");
});

test("全王国の一覧は1時間だけ覚えて、ページごとには読まない", async () => {
  resetKingdomInsightsCache();
  let reads = 0;
  const db = { prepare: sql => ({ all: async () => { reads++; assert.match(sql, /^SELECT kid, power, power_gain_7d, age_days, player_count, observed_at FROM kingdom_stats_current$/); return { results: [{ kid: 1, power: 5, power_gain_7d: 1, age_days: 10, player_count: 3 }] }; } }) };
  const t = 1_800_000_000_000;
  await loadAllKingdomStats(db, t);
  await loadAllKingdomStats(db, t + 59 * 60 * 1000);
  assert.equal(reads, 1);
  await loadAllKingdomStats(db, t + 61 * 60 * 1000);
  assert.equal(reads, 2);
});

test("どこにも当たらない URL は 404・noindex・canonical なし（広告タグは canonical のあるページにしか入らない）", () => {
  const html = renderNotFoundPage();
  assert.match(html, /<meta name="robots" content="noindex/);
  assert.doesNotMatch(html, /rel="canonical"/);
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(index, /if \(url\.pathname === "\/"\) return eagleEyeHtmlResponse\(await renderHome\(request, env\)\);/);
  assert.match(index, /return eagleEyeHtmlResponse\(renderNotFoundPage\(\), 404\);/);
  assert.doesNotMatch(index, /\n      return eagleEyeHtmlResponse\(await renderHome\(request, env\)\);\n    \} catch/, "最後にトップページを返さない");
});

import { kingdomTrend, renderKingdomTrend } from "../src/kingdom-insights.js";
test("この30日の動き：総力・領主数・撃破数の変化と、いちばん伸びた項目（成長の記録から）", () => {
  const growth = { latest: { power: 145e9, player_count: 4400, kills: 6.2e9, research_power: 4.2e9, troop_power: 36.9e9, hero_power: 0.972e9, building_power: 1.0e9 },
    comparisons: [{ label: "7日前", snapshot: { power: 149.1e9 } }, { label: "30日前", snapshot: { power: 145.66e9, player_count: 4221, kills: 5.8e9, research_power: 3.931e9, troop_power: 36.05e9, hero_power: 0.9245e9, building_power: 0.9941e9 } }] };
  const t = kingdomTrend(growth);
  assert.equal(t.parts[0].key, "research_power");
  assert.equal(t.parts.at(-1).key, "building_power");
  const html = renderKingdomTrend(154, t, compact);
  assert.match(html, /<h2>王国154のこの30日の動き<\/h2>/);
  assert.match(html, /総力は30日で <b>−0\.7B<\/b>（−0\.5%）、そのうち直近7日で −4\.1B。/);
  assert.match(html, /領主数は30日で \+179人。/);
  assert.match(html, /撃破数は30日で <b>\+0\.4B<\/b>/);
  assert.match(html, /いちばん伸びた項目は「研究戦力」（\+6\.8%）/);
  assert.match(html, /強さをそのまま表すものではありません/);
  assert.equal(renderKingdomTrend(1, kingdomTrend({ latest: { power: 1 }, comparisons: [] }), compact), "", "30日前の記録が無ければ出さない");
});
