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
        if (/INSERT INTO kvk_mystic_state/.test(sql)) state.breaker = JSON.parse(st.args[1]);
        return {};
      };
      st.first = async () => {
        if (/FROM kvk_state/.test(sql)) return { value: JSON.stringify({ season: 23 }) };
        if (/FROM kvk_mystic_state/.test(sql)) return state.breaker ? { value: JSON.stringify(state.breaker) } : null;
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
