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
  // 名前は1行につき1回だけ調べてから GROUP_CONCAT する（2026-11-17・速さのため）
  assert.match(q[0][0], /\(SELECT p\.nick_name FROM user_player_links l JOIN players p[^]*AS pn/);
  assert.match(q[0][0], /GROUP_CONCAT\(r\.pn, char\(31\)\)/);
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

test("全同盟の対戦相手：SQL が本物の SQLite で動き、名前・Discord 名・同盟タグが入る（2026-11-17）", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { loadAllMatchupsForOwner, resetSwordlandSchemaCache } = await import("../src/swordland.js");
  const raw = new DatabaseSync(":memory:");
  raw.exec(`CREATE TABLE users (user_id TEXT, global_name TEXT, username TEXT);
    CREATE TABLE user_player_links (user_id TEXT, governor_id TEXT, status TEXT, account_type TEXT, created_at INTEGER);
    CREATE TABLE players (governor_id TEXT, nick_name TEXT);
    CREATE TABLE alliance_catalog (kid INTEGER, aid TEXT, abbr TEXT, name TEXT);
    CREATE TABLE swordland_events (kid INTEGER, name TEXT, begin_ts INTEGER, end_ts INTEGER, season INTEGER);
    INSERT INTO users VALUES ('u1','ネコ','neko'),('u2','','inu');
    INSERT INTO user_player_links VALUES ('u1','g1','ACTIVE','MAIN',1);
    INSERT INTO players VALUES ('g1','BJにゃん');
    INSERT INTO alliance_catalog VALUES (1524,'77.0','PAN','Pandora');`);
  const db = { prepare: sql => { let a = []; const st = { bind: (...x) => { a = x; return st; }, all: async () => ({ results: raw.prepare(sql).all(...a) }), first: async () => raw.prepare(sql).get(...a) ?? null, run: async () => { raw.prepare(sql).run(...a); return {}; } }; return st; },
    batch: async list => { for (const s of list) await s.run(); return []; } };
  resetSwordlandSchemaCache?.();
  const now = Date.now();
  await loadAllMatchupsForOwner(db, { nowMs: now }); // 表を作る
  raw.exec(`INSERT INTO swordland_matchups VALUES (5, 1524, '77', 'u1', 1600, 'ABC', ${Math.floor(now / 1000)}, ${Math.floor(now / 1000)}), (5, 1524, '77', 'u2', 1600, 'abc', ${Math.floor(now / 1000)}, ${Math.floor(now / 1000)})`);
  const list = await loadAllMatchupsForOwner(db, { nowMs: now });
  assert.equal(list.length, 1);
  assert.equal(list[0].abbr, "PAN");
  assert.equal(list[0].opps[0].count, 2);
  assert.deepEqual(list[0].opps[0].reporters, ["BJにゃん"]);
  assert.deepEqual(list[0].opps[0].ownerNames, ["BJにゃん（Discord：ネコ）", "（領主未登録）（Discord：inu）"]);
});
