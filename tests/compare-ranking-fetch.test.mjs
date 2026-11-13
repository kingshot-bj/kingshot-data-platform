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
  assert.match(index, /const rankingPending = isQuietAgentRequest\(request, auth\) \? \[\] : await scheduleCompareRankingFetch\(env, executionContext, compareKids\);/);
  assert.match(index, /return json\(\{ok:true,players,period_days:30,rankingPending\}\);/);
  const fn = index.slice(index.indexOf("async function scheduleKingdomRankingFetch("), index.indexOf("async function handlePlayerCompareApi("));
  assert.match(fn, /refreshKingdomRankingOnDemand\(env, kid, board, options\)/);
  assert.match(fn, /maxBoards = COMPARE_RANKING_MAX_BOARDS/);
  assert.match(fn, /NO_API_POOL_KEY_AVAILABLE"\)\) break;/);
  assert.match(fn, /return scheduleKingdomRankingFetch\(env, executionContext, kidList, COMPARE_KINGDOM_ONLY_BOARDS, options\);/);
  assert.match(index, /const COMPARE_RANKING_MAX_BOARDS = 26;/);
  assert.match(index, /window\.__eeRankRetry=1/, "読み直しは1回だけ");
});

test("プレイヤー詳細：英雄ランキング・秘境ステージの王国ランキングが無い／古ければ裏で取り、「取得中」を出して1回だけ読み直す", () => {
  assert.match(index, /return eagleEyeHtmlResponse\(await renderPlayerPage\(request, env, executionContext\)\);/);
  assert.match(index, /visibleProfile\.ranking_pending = isQuietAgentRequest\(request, auth\) \? \[\] : await scheduleKingdomRankingFetch\(env, executionContext, \[heroKid\], PLAYER_PAGE_RANKING_BOARDS/);
  const boards = JSON.parse(index.match(/const PLAYER_PAGE_RANKING_BOARDS = Object\.freeze\((\[[^\]]+\])\)/)[1]);
  assert.deepEqual(boards.slice(0, 4), ["single_hero", "hero_total", "hero_no_equip", "hero_equip"]);
  assert.match(index, /if\(\/\[\?&\]rk=1\(&\|\$\)\/\.test\(location\.search\)\)return;/, "読み直しは1回だけ（rk=1）");
});

test("登録ユーザーの王国（ウォッチ外）を1日1回更新：1時間に1回・1回6種類まで・キーを空けておく", () => {
  const fn = index.slice(index.indexOf("async function runUserKingdomRankingRefresh("), index.indexOf("async function handlePlayerCompareApi("));
  assert.match(fn, /p\.kid NOT IN \(SELECT kid FROM kingdom_watchlists WHERE enabled = 1\)/);
  assert.match(fn, /now % 3600 >= 300\) return \{ skipped: "NOT_THIS_TICK" \}/);
  assert.match(fn, /todo\.slice\(0, USER_KINGDOM_RANKING_PER_RUN\), \{ nowMs, purpose: "KINGDOM_RANKING_USER_KINGDOM", reserveApiKeys: BACKGROUND_KEY_RESERVE \}/);
  assert.match(index, /const USER_KINGDOM_RANKING_PER_RUN = 6;/);
  assert.match(index, /await runUserKingdomRankingRefresh\(env\);/);
});

test("表示：取得済みのランキングに載っていなければ「100位圏外」、取得中なら「取得中」、それ以外は「—」", () => {
  assert.match(index, /p\.rankingChecked = checkedByKid\.get\(k\) \|\| \[\]; p\.rankingPending = pendingKids\.has\(k\);/);
  assert.match(index, /FROM kingdom_ranking_board_state WHERE kid IN \(" \+ checkedKids\.map\(\(\) => "\?"\)\.join\(","\) \+ "\) AND last_checked_at > \?/);
  assert.match(index, /return checked\?\\"<td class=\\\\\\"rank-out\\\\\\">100位圏外<\/td>\\":p\.rankingPending\?\\"<td>取得中<\/td>\\":\\"<td>—<\/td>\\"/);
  assert.match(index, /leaderboardRows\.set\(key,\{key,label,byId:\{\}\}\)/);
  // gov_charm（サーバー）と govcharm（表のキー）を同じものとして比べる
  assert.match(index, /String\(b\)\.toLowerCase\(\)\.replace\(\/\[\^a-z0-9\]\/g,\\"\\"\)===rk/);
});
