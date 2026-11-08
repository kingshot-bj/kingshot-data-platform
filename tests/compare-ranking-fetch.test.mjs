// プレイヤー比較：王国ランキングからしか取れない項目（領主宝石・英雄総力など）が無い／古い王国は、比較を開いた時に裏で取る。
// ウォッチ中で新しい王国は取らない。1回に取るのは最大26種類。画面は「取得中」を出して1回だけ読み直す。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

test("対象のランキング：プレイヤー単体では取れない13種類だけ", () => {
  const list = JSON.parse(index.match(/const COMPARE_KINGDOM_ONLY_BOARDS = Object\.freeze\((\[[^\]]+\])\)/)[1]);
  assert.equal(list.length, 13);
  for (const b of ["gov_charm", "gov_gear", "hero_equip", "hero_total", "master_power", "research_power", "troop_power"]) assert.ok(list.includes(b), b);
  for (const b of ["personal_power", "kills", "town_center", "mystic_trial", "coliseum"]) assert.ok(!list.includes(b), "プレイヤー単体で取れるものは取らない: " + b);
});

test("配線：比較APIは王国番号（権限に関係なく）で予約し、結果に rankingPending を返す。実際の取得は既存の取り直し制限つき", () => {
  assert.match(index, /return await handlePlayerCompareApi\(request, env, executionContext\);/);
  assert.match(index, /compareKids\.push\(raw\.kid\);/);
  assert.match(index, /const rankingPending = await scheduleCompareRankingFetch\(env, executionContext, compareKids\);/);
  assert.match(index, /return json\(\{ok:true,players,period_days:30,rankingPending\}\);/);
  const fn = index.slice(index.indexOf("async function scheduleCompareRankingFetch("), index.indexOf("async function handlePlayerCompareApi("));
  assert.match(fn, /refreshKingdomRankingOnDemand\(env, kid, board, \{ nowMs \}\)/);
  assert.match(fn, /\.slice\(0, COMPARE_RANKING_MAX_BOARDS\)/);
  assert.match(fn, /NO_API_POOL_KEY_AVAILABLE"\)\) break;/);
  assert.match(index, /const COMPARE_RANKING_MAX_BOARDS = 26;/);
  assert.match(index, /window\.__eeRankRetry=1/, "読み直しは1回だけ");
});
