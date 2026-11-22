import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadAllKingdomStats, loadAllMysticSummaries, resetKingdomInsightsCache, sharedJsonCache } from "../src/kingdom-insights.js";

// 2026-11-17：クローラーでインスタンスが増え、全王国（約2,600行）を1日900回読み直していた。共有キャッシュに置く。
function fakeCache() {
  const m = new Map();
  return { m, match: async req => m.has(req.url) ? new Response(m.get(req.url)) : undefined, put: async (req, res) => { m.set(req.url, await res.text()); } };
}

test("共有キャッシュ：2回目以降（別のインスタンス）は D1 を読まない", async () => {
  const store = fakeCache();
  let reads = 0;
  const db = { prepare: () => ({ all: async () => { reads++; return { results: [{ kid: 1524, power: 5e10, power_gain_7d: 1e9, age_days: 600, player_count: 900, observed_at: 1 }] }; } }) };
  resetKingdomInsightsCache();
  const a = await loadAllKingdomStats(db, 0, { cacheStore: store });
  resetKingdomInsightsCache(); // 別のインスタンス
  const b = await loadAllKingdomStats(db, 0, { cacheStore: store });
  assert.equal(reads, 1);
  assert.deepEqual(a, b);
  assert.equal(a[0].kid, 1524);
  // キャッシュが使えない環境では今までどおり
  assert.equal(await sharedJsonCache("x", 60, async () => 7, { cacheStore: null }), 7);
});

test("秘境の試練の一覧：共有キャッシュから戻しても Map で使える", async () => {
  const store = fakeCache();
  let reads = 0;
  const db = { prepare: sql => ({ all: async () => { reads++; return { results: sql.includes("kvk_mystic_summary") ? [{ kid: 1524, season: 23, boards_json: '{"coliseum":{"best":10256}}', fetched_at: 5 }] : [] }; }, catch() { return this; } }) };
  resetKingdomInsightsCache();
  await loadAllMysticSummaries(db, 0, { cacheStore: store });
  const before = reads;
  resetKingdomInsightsCache();
  const v = await loadAllMysticSummaries(db, 0, { cacheStore: store });
  assert.equal(reads, before, "2回目は D1 を読まない");
  assert.equal(v.season, 23);
  assert.ok(v.map instanceof Map);
  assert.equal(v.map.get(1524).boards.coliseum.best, 10256);
});

test("kvk_matchups：王国ごとの検索用の索引（実行時と移行ファイル）", () => {
  assert.match(readFileSync(new URL("../src/kvk.js", import.meta.url), "utf8"), /CREATE INDEX IF NOT EXISTS idx_kvk_matchups_kid_season ON kvk_matchups\(kid, season\)/);
  assert.match(readFileSync(new URL("../migrations/0073_kvk_matchups_kid_season_index.sql", import.meta.url), "utf8"), /CREATE INDEX IF NOT EXISTS idx_kvk_matchups_kid_season ON kvk_matchups\(kid, season\);/);
});
