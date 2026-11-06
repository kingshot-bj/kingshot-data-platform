// /kingdom/changes：change_events を全件なめるクエリ（1回約85万行、D1読み取りの97%）を再発させない。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadBoardChangeEvents, BOARD_CHANGE_ID_CHUNK } from "../src/kingdom-portal.js";

function fakeDb() {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const st = { sql, args: [], bind(...a) { this.args = a; return this; } };
      st.first = async () => (/kingdom_ranking_board_state/.test(sql) ? { last_checked_at: 500 } : null);
      st.all = async () => { calls.push({ sql, args: st.args }); const ids = st.args.slice(1, -1); return { results: ids.slice(0, 2).map((id, i) => ({ target_id: id, detected_at: 1000 + Number(id) + i })) }; };
      return st;
    }
  };
}

test("対象（その王国・ボードのtarget_id）だけを、bind上限に収まる単位で引く", async () => {
  const db = fakeDb();
  const ids = Array.from({ length: 100 }, (_, i) => String(i + 1));
  const r = await loadBoardChangeEvents(db, 1524, "personal_power", "PLAYER", ids);
  assert.equal(db.calls.length, 2, "100件 → 90 + 10 の2回");
  for (const c of db.calls) {
    assert.match(c.sql, /WHERE target_type = \? AND target_id IN \(/);
    assert.match(c.sql, /AND detected_at >= \? ORDER BY detected_at DESC LIMIT 100/);
    assert.doesNotMatch(c.sql, /SELECT COALESCE\(last_checked_at/, "サブクエリで時刻を渡さない");
    assert.ok(c.args.length <= 100, "D1のbind上限");
    assert.equal(c.args[0], "PLAYER");
    assert.equal(c.args.at(-1), 500, "最後のチェック時刻");
  }
  assert.equal(BOARD_CHANGE_ID_CHUNK, 90);
  const times = r.results.map(x => x.detected_at);
  assert.deepEqual(times, [...times].sort((a, b) => b - a), "新しい順");
});

test("対象が無ければ D1 を読まない", async () => {
  const db = fakeDb();
  assert.deepEqual(await loadBoardChangeEvents(db, 1, "kills", "PLAYER", []), { results: [] });
  assert.equal(db.calls.length, 0);
});

test("全件スキャンの旧クエリが残っていない・ボットは /kingdom/changes を読まない", async () => {
  const src = readFileSync(new URL("../src/kingdom-portal.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /change_events WHERE target_type=\? AND detected_at >= \(SELECT/);
  const { renderRobotsTxt } = await import("../src/public-pages.js");
  assert.match(renderRobotsTxt("https://eagleeye-ks.com"), /Disallow: \/kingdom\/changes/);
});
