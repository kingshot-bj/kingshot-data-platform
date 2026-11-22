// 2026-11-15：AdSense 対応。ウォッチされていない王国のランキングは14日で R2 に移して D1 から消しているが、
// 公開の王国ページは D1 しか読んでおらず、約1,200王国で「データはあるのに空欄」だった。
// 公開ページも R2 の写しを読み、日付を出す。あわせて全王国の上位を月1回取り直す。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadPublicKingdom, renderPublicKingdomPage } from "../src/public-pages.js";
import { resetKingdomRankingArchiveCache } from "../src/kingdom-ranking-archive.js";
import { resetKingdomInsightsCache } from "../src/kingdom-insights.js";

function fakeEnv({ archived = true } = {}) {
  const db = { prepare: sql => { const s = { bind: () => s, first: async () => null, all: async () => ({ results: [] }), run: async () => ({}) }; return s; } };
  const rows = [
    { kid: 154, board: "personal_power", target_type: "PLAYER", target_id: "9", rank: 2, nick_name: "Bob", score: 9e8, aid: "77" },
    { kid: 154, board: "personal_power", target_type: "PLAYER", target_id: "8", rank: 1, nick_name: "Ann", score: 1e9, aid: "77" },
    { kid: 154, board: "alliance_power", target_type: "ALLIANCE", target_id: "77", rank: 1, abbr: "ABC", name: "Alpha", score: 5e10, aid: "77" },
    { kid: 154, board: "hero_total", target_type: "PLAYER", target_id: "8", rank: 1, nick_name: "Ann", score: 1 }
  ];
  const objects = new Map(archived ? [
    ["archive/v1/kingdom_ranking_current/kid/154/latest.json", JSON.stringify({ key: "a.ndjson", archivedAt: 1792000000, lastUpdatedAt: 1791305313 })],
    ["a.ndjson", rows.map(r => JSON.stringify(r)).join("\n")]
  ] : []);
  const ARCHIVE = { get: async k => objects.has(k) ? { body: objects.get(k), httpMetadata: {} } : null };
  return { DB: db, ARCHIVE };
}

test("D1 に無ければ R2 の写しから上位10人・同盟上位5を出す（タグは同盟の行から）", async () => {
  resetKingdomRankingArchiveCache(); resetKingdomInsightsCache();
  const data = await loadPublicKingdom(fakeEnv(), 154);
  assert.deepEqual(data.players.map(p => [p.rank, p.nick_name, p.abbr]), [[1, "Ann", "ABC"], [2, "Bob", "ABC"]]);
  assert.deepEqual(data.alliances.map(a => [a.rank, a.abbr]), [[1, "ABC"]]);
  assert.equal(data.rankingsAsOf, 1791305313);
  const html = renderPublicKingdomPage(154, data, { origin: "" });
  assert.match(html, /<h2>個人総力ランキング（上位10人）<small[^>]*>2026\/10\/7時点（この王国は毎月取り直しています）<\/small><\/h2>/);
  assert.match(html, /Ann/);
});

test("R2 にも無ければ、今までどおり欄を出さない", async () => {
  resetKingdomRankingArchiveCache(); resetKingdomInsightsCache();
  const data = await loadPublicKingdom(fakeEnv({ archived: false }), 154);
  assert.equal(data.players.length, 0);
  assert.equal(data.rankingsAsOf, null);
  assert.doesNotMatch(renderPublicKingdomPage(154, data, { origin: "" }), /個人総力ランキング（上位10人）/);
});

test("月1回の取り直し：5分ごとに30王国ずつ・30日より古いものだけ（ランキング2種類＋秘境の試練）・5件ずつ並べる・ユーザー用のキーを残す", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /const PUBLIC_MONTHLY_RANKING_BOARDS = Object\.freeze\(\["personal_power", "alliance_power"\]\);/);
  assert.match(src, /const PUBLIC_MONTHLY_RANKING_SECONDS = 30 \* 86400;/);
  assert.match(src, /const PUBLIC_MONTHLY_RANKING_KINGDOMS_PER_RUN = 30;/);
  assert.match(src, /const PUBLIC_MONTHLY_PARALLEL = 5;/);
  const fn = src.slice(src.indexOf("async function runPublicKingdomMonthlyRanking("), src.indexOf("async function handlePlayerCompareApi("));
  assert.match(fn, /SELECT kid FROM kingdom_stats_current WHERE kid > \? ORDER BY kid LIMIT \?/, "位置を覚えて、主キーの範囲だけ読む");
  assert.match(fn, /staleKingdomRankingBoards\(db, kids, PUBLIC_MONTHLY_RANKING_BOARDS, nowMs, PUBLIC_MONTHLY_RANKING_SECONDS\)/);
  assert.match(fn, /reserveApiKeys: BACKGROUND_KEY_RESERVE, minIntervalSeconds: PUBLIC_MONTHLY_RANKING_SECONDS, report/);
  assert.match(fn, /FROM kingdom_mystic_current WHERE kid IN \(\$\{ph\}\) AND fetched_at > \? UNION SELECT kid FROM kvk_mystic_summary/, "秘境の試練は KvK 用か月1回のどちらかが新しければ取らない");
  assert.match(fn, /fetchAndStoreKingdomMystic\(env, kid, \{ now \}\)/);
  assert.match(fn, /if \(!report\.noKey\) await db/, "キーが無いときだけ同じ場所からやり直す");
  assert.match(src, /await runPublicKingdomMonthlyRanking\(env\);/);
});
