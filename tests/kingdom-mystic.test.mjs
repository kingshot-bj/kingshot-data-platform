// 2026-11-15：総力は強さと比例しない。王国ページに、強さの目安として秘境の試練（KvK 用に集めた上位10人の記録）を出す。新しい API は使わない。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadAllMysticSummaries, computeMysticInsights, renderMysticInsights, resetKingdomMysticCache } from "../src/kingdom-insights.js";

const k154 = { coliseum: { top10: 800.2, best: 884, count: 10 }, radiant_spire: { top10: 860.2, best: 995, count: 10 }, mystic_trial: { best: 3538 } };
const k1524 = { coliseum: { top10: 477.2, best: 597, count: 10, labels: ["60-7"] }, radiant_spire: { top10: 485.6, best: 622, count: 10, labels: ["63-2"] } };
const all = { season: 23, map: new Map([[154, { boards: k154, fetchedAt: 1793651182, season: 23 }], [1524, { boards: k1524, fetchedAt: 1793686497, season: 23 }], [9, { boards: { coliseum: { best: 1000 } }, fetchedAt: 1 }]]) };

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
  const db = { prepare: sql => ({ all: async () => {
    reads++;
    if (/kvk_mystic_summary/.test(sql)) { assert.match(sql, /season = \(SELECT MAX\(season\) FROM kvk_mystic_summary WHERE status = 'OK'\)/); return { results: [{ kid: 154, season: 23, boards_json: JSON.stringify(k154), fetched_at: 100 }] }; }
    assert.match(sql, /FROM kingdom_mystic_current WHERE status = 'OK'/);
    return { results: [{ kid: 154, boards_json: JSON.stringify({ coliseum: { best: 999 } }), fetched_at: 200 }, { kid: 7, boards_json: JSON.stringify({ coliseum: { best: 5 } }), fetched_at: 50 }] };
  } }) };
  const t = 1_800_000_000_000;
  const all = await loadAllMysticSummaries(db, t);
  await loadAllMysticSummaries(db, t + 30 * 60 * 1000);
  assert.equal(reads, 2, "2つの表を1回ずつ。1時間以内は読まない");
  assert.equal(all.map.get(154).boards.coliseum.best, 999, "新しい方（月1回の取り直し）を使う");
  assert.equal(all.map.get(154).season, null);
  assert.ok(all.map.has(7), "KvK に出ていない王国も月1回の取り直しで入る");
});

test("配線：王国ページで分析の下に出す", () => {
  const src = readFileSync(new URL("../src/public-pages.js", import.meta.url), "utf8");
  assert.match(src, /loadAllMysticSummaries\(db\)\.catch\(\(\) => null\)/);
  assert.match(src, /\$\{renderKingdomInsights\(kid, data\.insights, compactNumber\)\}\n\$\{renderMysticInsights\(kid, data\.mystic\)\}/);
});

import { fetchAndStoreKingdomMystic } from "../src/kvk-mystic.js";
test("月1回の秘境の試練：1回の呼び出しで6種類を取り、保存する。404 は NOT_FOUND、ほかの失敗は投げる（次の回にやり直す）", async () => {
  const saved = [];
  const env = { DB: { prepare: () => ({ bind: (...a) => ({ run: async () => { saved.push(a); return {}; } }) }) } };
  const payload = { data: { boards: { coliseum: [{ governor_id: "1", score: 10597 }, { governor_id: "2", score: 10500 }] } } };
  let opts = null;
  assert.equal(await fetchAndStoreKingdomMystic(env, 154, { now: 100, collect: async (_e, o) => { opts = o; return { result: payload }; } }), "OK");
  assert.deepEqual(opts.query, { include: "boards", limit: 10 });
  assert.equal(opts.purpose, "PUBLIC_KINGDOM_MYSTIC");
  assert.equal(saved[0][0], 154);
  assert.equal(JSON.parse(saved[0][2]).coliseum.best, 597, "オフセット（10000）を引いた値");
  const nf = Object.assign(new Error("nf"), { status: 404 });
  assert.equal(await fetchAndStoreKingdomMystic(env, 9, { now: 100, collect: async () => { throw nf; } }), "NOT_FOUND");
  await assert.rejects(fetchAndStoreKingdomMystic(env, 9, { now: 100, collect: async () => { throw new Error("NO_API_POOL_KEY_AVAILABLE"); } }), /NO_API_POOL_KEY_AVAILABLE/);
});

import { loadPublicDataProgress, renderPublicDataProgressCard } from "../src/traffic-stats.js";
test("オーナー画面：公開の王国ページのデータ集めの進み具合（30日以内に取れている割合）", async () => {
  const answers = { kingdom_stats_current: 2600, personal_power: 1300, alliance_power: 1300, kingdom_mystic_current: 2470 };
  const db = { prepare: sql => ({ bind: () => ({ first: async () => {
    if (/public_ranking_refresh_state/.test(sql)) return { value: "1200", updated_at: 1795190400 };
    const k = Object.keys(answers).find(x => sql.includes(x));
    return { n: answers[k] };
  } }) }) };
  const p = await loadPublicDataProgress(db);
  assert.deepEqual([p.total, p.personal, p.mystic, p.cursor], [2600, 1300, 2470, 1200]);
  const html = renderPublicDataProgressCard(p);
  assert.match(html, /上位10人（個人の総力）<\/span><i style="width:50%"><\/i><b>50%（1,300 \/ 2,600王国）/);
  assert.match(html, /秘境の試練<\/span><i style="width:95%"><\/i>/);
  assert.match(html, /今の周：王国1,200まで（約46.1%）/);
  assert.equal(renderPublicDataProgressCard(null), "");
});

// 2026-11-16：KvK の組み合わせページ（約2,400王国）で秘境の試練を90件ずつ28回読んでいて、表示に10秒以上かかっていた。
import { loadMysticSummaries, resetKvkMysticSchemaCache } from "../src/kvk-mystic.js";
test("秘境の試練の記録：多いときはシーズン全体を1回で読む", async () => {
  resetKvkMysticSchemaCache();
  const queries = [];
  const db = { batch: async () => [], prepare: sql => { const s = { bind: (...a) => { queries.push([sql, a.length]); return s; }, run: async () => ({}), all: async () => ({ results: [{ kid: 5, boards_json: "{\"coliseum\":{\"best\":1}}" }, { kid: 99999, boards_json: "{}" }] }), first: async () => null }; return s; } };
  const kids = Array.from({ length: 2400 }, (_, i) => i + 1);
  const out = await loadMysticSummaries(db, 23, kids);
  const reads = queries.filter(([sql]) => /FROM kvk_mystic_summary/.test(sql));
  assert.equal(reads.length, 1);
  assert.equal(reads[0][1], 1, "シーズンだけで絞る");
  assert.ok(out.has(5) && !out.has(99999), "頼まれた王国だけ返す");
});
