import test from "node:test";
import assert from "node:assert/strict";
import { summarizeKingdomBoards, compareMystic, runKvkMysticCollection, resetKvkMysticSchemaCache, KVK_MYSTIC_PER_RUN } from "../src/kvk-mystic.js";

test("summarize: top-10 average per Mystic stage, offsets removed, shapes tolerated", () => {
  const entries = (base, n) => Array.from({ length: n }, (_, i) => ({ governor_id: i + 1, score: base + 30 - i }));
  const arr = summarizeKingdomBoards({ data: { boards: [{ key: "radiant_spire", entries: entries(60000, 12) }, { name: "Crystal Cave", rows: entries(30000, 3) }, { key: "personal_power", entries: [{ governor_id: 1, score: 9e9 }] }] } });
  assert.equal(arr.radiant_spire.count, 10, "top 10 only");
  assert.equal(arr.radiant_spire.best, 30);
  assert.equal(arr.radiant_spire.top10, 25.5);
  assert.equal(arr.crystal_cave.top10, 29);
  assert.equal(arr.personal_power, undefined);
  const obj = summarizeKingdomBoards({ boards: { molten_fort: entries(50000, 2) } });
  assert.equal(obj.molten_fort.best, 30);
  assert.deepEqual(summarizeKingdomBoards({ boards: [] }), {});
});

test("compare counts stages each side leads", () => {
  const a = { coliseum: { top10: 5, best: 9 }, radiant_spire: { top10: 3, best: 3 }, crystal_cave: { top10: 2, best: 9 } };
  const b = { coliseum: { top10: 4, best: 7 }, radiant_spire: { top10: 3, best: 3 }, crystal_cave: { top10: 9, best: 8 } };
  const r = compareMystic(a, b);
  assert.deepEqual([r.wins, r.losses, r.even, r.stages.length], [2, 0, 1, 3], "default: each stage's 1位");
  const t = compareMystic(a, b, { metric: "top10" });
  assert.deepEqual([t.wins, t.losses, t.even], [1, 1, 1]);
});

function fakeDb(state) {
  return {
    prepare(sql) {
      const st = { sql, args: [], bind(...a) { this.args = a; return this; } };
      st.run = async () => {
        if (/INSERT OR REPLACE INTO kvk_mystic_summary/.test(sql)) state.saved.push(st.args);
        if (/INSERT INTO kvk_mystic_state/.test(sql)) { if (st.args[0] === "breaker") state.breaker = JSON.parse(st.args[1]); else (state.kv ||= {})[st.args[0]] = JSON.parse(st.args[1]); }
        return {};
      };
      st.first = async () => {
        if (/FROM kvk_state/.test(sql)) return { value: JSON.stringify({ season: 23 }) };
        if (/FROM kvk_mystic_state/.test(sql)) { const v = st.args[0] === "breaker" ? state.breaker : state.kv?.[st.args[0]]; return v ? { value: JSON.stringify(v) } : null; }
        if (/COUNT\(\*\)/.test(sql)) return { n: state.today || 0 };
        return null;
      };
      st.all = async () => ({ results: state.todo.slice(0, st.args[1]).map(kid => ({ kid })) });
      return st;
    }
  };
}

test("collector: one call per kingdom with include=boards, normal keys, capped per run", async () => {
  resetKvkMysticSchemaCache();
  const state = { saved: [], todo: [1524, 1523, 1001] };
  const calls = [];
  const collect = async (env, opts) => { calls.push(opts); return { result: { data: { boards: [{ key: "coliseum", entries: [{ governor_id: 1, score: 10020 }] }] } } }; };
  const r = await runKvkMysticCollection({ DB: fakeDb(state) }, { collect, now: 100 });
  assert.equal(calls.length, KVK_MYSTIC_PER_RUN);
  assert.deepEqual(calls[0].query, { include: "boards", limit: 10 });
  assert.ok(!("mightyOnly" in calls[0]), "normal keys");
  assert.equal(r.fetched, 2);
  assert.equal(state.saved[0][2], "OK");
});

test("collector: breaker stops after repeated responses without Mystic boards; daily cap", async () => {
  resetKvkMysticSchemaCache();
  const state = { saved: [], todo: [1, 2, 3, 4, 5, 6, 7, 8], breaker: { season: 23, emptyStreak: 4, open: false } };
  const collect = async () => ({ result: { data: { boards: [] } } });
  await runKvkMysticCollection({ DB: fakeDb(state) }, { collect, now: 100, perRun: 2 });
  assert.equal(state.breaker.open, true);
  let called = 0;
  const r = await runKvkMysticCollection({ DB: fakeDb(state) }, { collect: async () => { called++; }, now: 200 });
  assert.equal(r.reason, "BREAKER_OPEN");
  assert.equal(called, 0);
  resetKvkMysticSchemaCache();
  const capped = await runKvkMysticCollection({ DB: fakeDb({ saved: [], todo: [1], today: 600 }) }, { collect: async () => { called++; }, now: 300 });
  assert.equal(capped.reason, "DAILY_CAP");
  assert.equal(called, 0);
});

test("summaries keep the top 10 records so the login view can show 2位以降", () => {
  const s = summarizeKingdomBoards({ boards: [{ key: "radiant_spire", entries: [{ governor_id: 1, score: 60010 }, { governor_id: 2, score: 60030 }, { governor_id: 3, score: 60020 }] }] });
  assert.deepEqual(s.radiant_spire.top, [30, 20, 10]);
  assert.equal(s.radiant_spire.best, 30);
});

test("ゲームと同じ「60-7」表記のラベルを、並べ替え後の順で保存する", async () => {
  const { stageLabelOf } = await import("../src/kvk-mystic.js");
  assert.equal(stageLabelOf({ value_label: "60-7" }), "60-7");
  assert.equal(stageLabelOf({ score_label: " 53 - 9 " }), "53-9");
  assert.equal(stageLabelOf({ value_label: "593" }), null);
  assert.equal(stageLabelOf({}), null);
  const s = summarizeKingdomBoards({ boards: [{ key: "coliseum", entries: [{ governor_id: 1, score: 10529, value_label: "53-9" }, { governor_id: 2, score: 10597, value_label: "60-7" }] }] });
  assert.deepEqual(s.coliseum.top, [597, 529]);
  assert.deepEqual(s.coliseum.labels, ["60-7", "53-9"]);
  const n = summarizeKingdomBoards({ boards: [{ key: "coliseum", entries: [{ governor_id: 1, score: 10529 }] }] });
  assert.equal(n.coliseum.labels, undefined, "ラベルが無ければ持たない（数値表示のまま）");
});

test("取得順：対戦の両側の王国を取り、ユーザー・ウォッチ中の王国の対戦を先に", async () => {
  const { KVK_MYSTIC_TODO_SQL } = await import("../src/kvk-mystic.js");
  assert.match(KVK_MYSTIC_TODO_SQL, /FROM user_player_links l .* WHERE l\.status = 'ACTIVE'/);
  assert.match(KVK_MYSTIC_TODO_SQL, /UNION SELECT kid FROM kingdom_watchlists WHERE enabled = 1/);
  assert.match(KVK_MYSTIC_TODO_SQL, /UNION ALL SELECT m\.opponent, m\.kid,/, "1対戦1行なので相手側（opponent）も対象にする");
  assert.match(KVK_MYSTIC_TODO_SQL, /ORDER BY MIN\(x\.prio\), MIN\(x\.pair\), x\.kid LIMIT \?2/, "同じ対戦の2王国を続けて取る");
  assert.doesNotMatch(KVK_MYSTIC_TODO_SQL.replace(/\?[12]/g, ""), /\?/, "season(?1) と件数(?2) だけ");
});

test("KvK画面はラベルがあれば「60-7」で表示する", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/kvk.js", import.meta.url), "utf8");
  assert.match(src, /const stage = \(side, i\) => \(Array\.isArray\(side\.labels\) && side\.labels\[i\]\) \|\| stageLabelFromValue\(/);
  assert.match(src, /hasLabels\(sa\.boards\)/);
});

test("取得順のSQLを実際のSQLiteで実行：相手側も取り、ユーザーの対戦が先・同じ対戦は続けて", async t => {
  let DatabaseSync;
  try { ({ DatabaseSync } = await import("node:sqlite")); } catch { t.skip("node:sqlite がない環境"); return; }
  const { KVK_MYSTIC_TODO_SQL } = await import("../src/kvk-mystic.js");
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE user_player_links(user_id, governor_id, kingdom_id, status); CREATE TABLE players(governor_id, kid); CREATE TABLE kingdom_watchlists(kid, enabled); CREATE TABLE kvk_matchups(season, kid, opponent); CREATE TABLE kvk_mystic_summary(season, kid, status);");
  db.exec("INSERT INTO user_player_links VALUES (1, 'g', 1524, 'ACTIVE'); INSERT INTO players VALUES ('g', 1524);");
  db.exec("INSERT INTO kvk_matchups VALUES (23, 1, 118), (23, 2, 189), (23, 1523, 1524), (23, 5, NULL), (22, 7, 8);");
  db.exec("INSERT INTO kvk_mystic_summary VALUES (23, 1, 'OK'), (23, 1523, 'OK');");
  const kids = db.prepare(KVK_MYSTIC_TODO_SQL).all(23, 10).map(r => r.kid);
  assert.deepEqual(kids, [1524, 118, 2, 189, 5]);
  assert.deepEqual(db.prepare(KVK_MYSTIC_TODO_SQL).all(23, 2).map(r => r.kid), [1524, 118]);
});

test("数値から「章-ステージ」：1章10ステージ（APIラベルと一致）", async () => {
  const { stageLabelFromValue } = await import("../src/kvk-mystic.js");
  for (const [v, l] of [[605, "61-5"], [520, "52-10"], [496, "50-6"], [573, "58-3"], [256, "26-6"], [597, "60-7"], [1, "1-1"], [10, "1-10"]]) assert.equal(stageLabelFromValue(v), l, String(v));
  assert.equal(stageLabelFromValue(0), null);
  assert.equal(stageLabelFromValue(null), null);
});

test("今季の全王国を取り終えたら、次のシーズンまで残りの確認もしない", async () => {
  resetKvkMysticSchemaCache();
  const state = { saved: [], todo: [] };
  let called = 0;
  const r1 = await runKvkMysticCollection({ DB: fakeDb(state) }, { collect: async () => { called++; }, now: 100 });
  assert.equal(r1.reason, "SEASON_COMPLETE");
  assert.deepEqual(state.kv.complete, { season: 23 });
  state.todo = [1];
  const r2 = await runKvkMysticCollection({ DB: fakeDb(state) }, { collect: async () => { called++; }, now: 200 });
  assert.equal(r2.reason, "SEASON_COMPLETE");
  assert.equal(called, 0);
});
