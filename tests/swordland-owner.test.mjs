// 2026-11-15：オーナーだけ、全同盟の聖剣争奪の対戦相手を見られるようにする（登録した人は出さない）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadAllMatchupsForOwner, renderOwnerMatchups, renderSwordlandPage, resetSwordlandSchemaCache, SWORDLAND_OWNER_LIST_DAYS } from "../src/swordland.js";

function fakeDb(rows) {
  const seen = [];
  const db = {
    seen,
    batch: async () => [],
    prepare: sql => { const s = { bind: (...a) => { seen.push([sql, a]); return s; }, run: async () => ({}), all: async () => ({ results: /FROM swordland_matchups/.test(sql) ? rows : [] }), first: async () => null }; return s; }
  };
  return db;
}

test("全同盟の対戦相手：同盟ごとにまとめ、相手が割れていたら印。期間で絞って1文だけ読む", async () => {
  resetSwordlandSchemaCache();
  const rows = [
    { season: 1794000000, kid: 1524, aid: "77", opp_kid: 1537, opp_tag: "LOL", n: 3, at: 1794100000, abbr: "Pen", name: "Penguins" },
    { season: 1794000000, kid: 1524, aid: "77", opp_kid: 1600, opp_tag: "ABC", n: 1, at: 1794090000, abbr: "Pen", name: "Penguins" },
    { season: 1794000000, kid: 1530, aid: "88", opp_kid: 1524, opp_tag: "Pen", n: 2, at: 1794050000, abbr: "", name: "" }
  ];
  const db = fakeDb(rows);
  const nowMs = 1794200000 * 1000;
  const list = await loadAllMatchupsForOwner(db, { nowMs });
  assert.equal(list.length, 2);
  assert.equal(list[0].abbr, "Pen");
  assert.equal(list[0].disputed, true);
  assert.deepEqual(list[0].opps.map(o => o.opp_tag), ["LOL", "ABC"], "多い方が先");
  assert.equal(list[1].disputed, false);
  const q = db.seen.filter(([sql]) => /FROM swordland_matchups/.test(sql));
  assert.equal(q.length, 1);
  assert.equal(q[0][1][0], 1794200000 - SWORDLAND_OWNER_LIST_DAYS * 86400);
  // 2026-11-16 オーナーの判断：登録した人をゲーム内の名前で出す（Discord の名前・ID は出さない）。
  assert.match(q[0][0], /GROUP_CONCAT\(\(SELECT p\.nick_name FROM user_player_links l JOIN players p/);
  // オーナーの一覧だけ Discord の表示名も（オーナーしか見られない）。Discord の ID は出さない。
  assert.match(q[0][0], /COALESCE\(NULLIF\(u\.global_name, ''\), u\.username\)/);
  assert.doesNotMatch(q[0][0], /discord_id/);
  const html = renderOwnerMatchups(list);
  assert.match(html, /王国1524 Pen<small>Penguins<\/small>/);
  assert.match(html, /王国1537 LOL（3人） <a href="\/alliance\/compare\?a=1524%3APen&amp;a=1537%3ALOL">比べる<\/a>/);
  assert.match(html, /登録が分かれています/);
  assert.match(html, /タグ不明 aid 88/);
});

test("オーナー以外の画面には出さない", () => {
  const list = [{ season: 1794000000, kid: 1, aid: "1", abbr: "A", name: "", at: 1, opps: [{ opp_kid: 2, opp_tag: "B", count: 1 }], disputed: false }];
  assert.doesNotMatch(renderSwordlandPage({ state: {}, isOwner: false, ownerMatchups: list }), /全同盟の対戦相手/);
  assert.match(renderSwordlandPage({ state: {}, isOwner: true, ownerMatchups: list }), /全同盟の対戦相手/);
});

test("ルート：オーナーのときだけ読む", () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(index, /isOwner \? loadAllMatchupsForOwner\(env\.DB\)\.catch\(\(\) => \[\]\) : null/);
});
