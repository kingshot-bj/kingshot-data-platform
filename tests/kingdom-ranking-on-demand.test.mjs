// 王国ウォッチに登録されたことのない王国でも、ランキングを開いたら（ログイン時）そのボードだけ取得する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderKingdomRankingsPage } from "../src/kingdom-portal.js";

function env({ rows = [], checkedAt = null } = {}) {
  const db = { prepare: sql => ({ bind: () => ({
    first: async () => sql.includes("FROM kingdom_catalog") ? { kid: 1600, name: "テスト王国" } : null,
    all: async () => sql.includes("FROM kingdom_ranking_board_state") ? { results: checkedAt ? [{ board: "personal_power", last_checked_at: checkedAt }] : [] } : sql.includes("FROM kingdom_ranking_current") || sql.includes("FROM king") ? { results: rows } : { results: [] }
  }) }) };
  return { DB: db };
}
const req = q => new Request("https://eagleeye-ks.com/kingdom/rankings" + q);
const auth = { user_id: "u", status: "ACTIVE", role: "BASIC" };

test("データの無い王国：ログインしていれば裏で1ボードだけ取得し、数秒後に自動で再読み込み", async () => {
  const calls = []; const waited = [];
  const html = await renderKingdomRankingsPage(req("?kid=1600&board=personal_power"), env(), auth, { onDemand: async (kid, board) => calls.push([kid, board]), waitUntil: p => waited.push(p) });
  await Promise.all(waited);
  assert.deepEqual(calls, [[1600, "personal_power"]]);
  assert.match(html, /最新データを取得しています/);
  assert.match(html, /location\.replace\("\/kingdom\/rankings\?kid=1600&board=personal_power&fetched=1"\)/);
});

test("再読み込み後（fetched=1）はもう取りに行かない。取れなかったら理由を出す", async () => {
  const calls = [];
  const html = await renderKingdomRankingsPage(req("?kid=1600&board=personal_power&fetched=1"), env(), auth, { onDemand: async () => calls.push(1) });
  assert.equal(calls.length, 0);
  assert.match(html, /今は取得できませんでした/);
});

test("未ログインでは取りに行かず、ログインを案内（ボットに全王国を取らせない）", async () => {
  const calls = [];
  const html = await renderKingdomRankingsPage(req("?kid=1600&board=personal_power"), env(), null, { onDemand: async () => calls.push(1) });
  assert.equal(calls.length, 0);
  assert.match(html, /まだ取得されていません。 <a href='\/api\/auth\/discord\?next=/);
});

test("新しいデータがあれば取りに行かない、24時間より古ければ取り直す", async () => {
  const row = { rank: 1, target_type: "PLAYER", target_id: "1", governor_id: "1", nick_name: "A", score: 100 };
  const now = Math.floor(Date.now() / 1000);
  const calls = [];
  await renderKingdomRankingsPage(req("?kid=1600&board=personal_power"), env({ rows: [row], checkedAt: now - 3600 }), auth, { onDemand: async () => calls.push("fresh") });
  assert.equal(calls.length, 0);
  await renderKingdomRankingsPage(req("?kid=1600&board=personal_power"), env({ rows: [row], checkedAt: now - 30 * 3600 }), auth, { onDemand: async () => calls.push("stale") });
  assert.deepEqual(calls, ["stale"]);
});

test("取得側：6時間に1回まで・1ボード・100件まで・ユーザー操作として全キーを使う", () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const fn = index.slice(index.indexOf("async function refreshKingdomRankingOnDemand"), index.indexOf("async function fetchKingdomRankingThroughApiPool"));
  assert.match(fn, /RANKING_ON_DEMAND_MIN_INTERVAL_SECONDS/);
  assert.match(fn, /fetchKingdomRankingThroughApiPool\(env, kid, board, WATCHLIST_RANKING_LIMIT, "KINGDOM_RANKING_ON_DEMAND"\)/);
  assert.match(fn, /\.slice\(0, WATCHLIST_RANKING_LIMIT\)/);
  assert.match(fn, /KINGDOM_RANKING_BOARDS\.includes\(board\)/);
  assert.match(index, /renderKingdomRankingsPage\(request, env, auth, \{ onDemand: \(kid, board\) => refreshKingdomRankingOnDemand\(env, kid, board\), waitUntil:/);
});
