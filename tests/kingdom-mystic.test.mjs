// 2026-11-15：総力は強さと比例しない。王国ページに、強さの目安として秘境の試練（KvK 用に集めた上位10人の記録）を出す。新しい API は使わない。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadAllMysticSummaries, computeMysticInsights, renderMysticInsights, resetKingdomMysticCache } from "../src/kingdom-insights.js";

const k154 = { coliseum: { top10: 800.2, best: 884, count: 10 }, radiant_spire: { top10: 860.2, best: 995, count: 10 }, mystic_trial: { best: 3538 } };
const k1524 = { coliseum: { top10: 477.2, best: 597, count: 10, labels: ["60-7"] }, radiant_spire: { top10: 485.6, best: 622, count: 10, labels: ["63-2"] } };
const all = { season: 23, map: new Map([[154, { boards: k154, fetchedAt: 1793651182 }], [1524, { boards: k1524, fetchedAt: 1793686497 }], [9, { boards: { coliseum: { best: 1000 } }, fetchedAt: 1 }]]) };

test("6種類ごとに1位の記録・全王国中の順位・上位10人の平均。総合（mystic_trial）は使わない", () => {
  const m = computeMysticInsights(154, all);
  assert.equal(m.season, 23);
  assert.deepEqual(m.stages.map(s => s.key), ["coliseum", "radiant_spire"]);
  const col = m.stages[0];
  assert.equal(col.bestLabel, "89-4", "ラベルが無ければ値から「章-ステージ」");
  assert.equal(col.rank, 2);
  assert.equal(col.count, 3);
  assert.equal(computeMysticInsights(1524, all).stages[0].bestLabel, "60-7", "ゲームと同じラベルがあればそれを使う");
  assert.equal(computeMysticInsights(777, all), null);
});

test("表示：強さの目安として出す。総力とは別。取得した時期を書く", () => {
  const html = renderMysticInsights(154, computeMysticInsights(154, all));
  assert.match(html, /<h2>王国154の秘境の試練（強さの目安）<\/h2>/);
  assert.match(html, /<tr><th>闘技場<\/th><td><b>89-4<\/b><\/td><td>2位<small>\/3<\/small><\/td>/);
  assert.match(html, /兵士の数ではなく英雄・装備・研究などの育成の差が出やすい記録/);
  assert.match(html, /KvKシーズン23の組み合わせ用に2026-11-0\d ごろ取得/);
  assert.equal(renderMysticInsights(1, null), "");
});

test("全王国分は一番新しいシーズンだけ・1時間だけ覚える", async () => {
  resetKingdomMysticCache();
  let reads = 0;
  const db = { prepare: sql => ({ all: async () => { reads++; assert.match(sql, /season = \(SELECT MAX\(season\) FROM kvk_mystic_summary WHERE status = 'OK'\)/); return { results: [{ kid: 154, season: 23, boards_json: JSON.stringify(k154), fetched_at: 1 }] }; } }) };
  const t = 1_800_000_000_000;
  await loadAllMysticSummaries(db, t);
  await loadAllMysticSummaries(db, t + 30 * 60 * 1000);
  assert.equal(reads, 1);
});

test("配線：王国ページで分析の下に出す", () => {
  const src = readFileSync(new URL("../src/public-pages.js", import.meta.url), "utf8");
  assert.match(src, /loadAllMysticSummaries\(db\)\.catch\(\(\) => null\)/);
  assert.match(src, /\$\{renderKingdomInsights\(kid, data\.insights, compactNumber\)\}\n\$\{renderMysticInsights\(kid, data\.mystic\)\}/);
});
