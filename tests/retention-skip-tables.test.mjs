// 保持期間の掃除：api_observations は1時間に1回だけ調べる（5分ごとに約2.5万行読んで何も消さなかった）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runRetentionCleanup } from "../src/retention.js";

function fakeDb() {
  const selects = [];
  return {
    selects,
    prepare(sql) {
      const st = { sql, args: [], bind(...a) { this.args = a; return this; } };
      st.first = async () => (/data_retention_settings/.test(sql) ? { settings_id: 1, api_observations_days: 7, change_events_days: 730 } : { count: 0, n: 0 });
      st.all = async () => { if (/^SELECT rowid/.test(sql.trim())) selects.push(sql); return { results: [] }; };
      st.run = async () => ({ meta: { changes: 0 } });
      return st;
    },
    batch: async () => []
  };
}

test("skipTables に入れた表は調べない", async () => {
  const db = fakeDb();
  await runRetentionCleanup(db, { skipTables: ["api_observations"] });
  assert.ok(!db.selects.some(sql => /FROM api_observations/.test(sql)));
  assert.ok(db.selects.some(sql => /FROM change_events/.test(sql)), "他の表は従来どおり");
  const db2 = fakeDb();
  await runRetentionCleanup(db2, {});
  assert.ok(db2.selects.some(sql => /FROM api_observations/.test(sql)));
});

test("cronでは毎時の最初の1回だけ api_observations を調べる", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /skipTables: firstTickOfHour \? \[\] : \["api_observations"\]/);
});
