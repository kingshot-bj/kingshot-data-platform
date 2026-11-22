// 新しく登録した人の王国の聖剣の日程を先に・すぐ取る（王国918で「開催されていません」・2026-11-19）。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { runSwordlandEventsRefresh, ensureSwordlandEventsFetched, activeSwordlandEvents, resetSwordlandSchemaCache, resetSwordlandOnDemandCache } from "../src/swordland.js";

const NOW = Date.parse("2026-11-19T02:01:00+09:00");
const nowSec = Math.floor(NOW / 1000);
function d1() {
  const raw = new DatabaseSync(":memory:");
  raw.exec(`CREATE TABLE user_player_links (user_id TEXT, governor_id TEXT, status TEXT, account_type TEXT, created_at INTEGER);
    CREATE TABLE players (governor_id TEXT, kid INTEGER);`);
  const prepare = sql => { let a = []; const st = { bind: (...x) => { a = x; return st; }, first: async () => raw.prepare(sql).get(...a) ?? null, all: async () => ({ results: raw.prepare(sql).all(...a) }), run: async () => { raw.prepare(sql).run(...a); return {}; } }; return st; };
  return { raw, prepare, batch: async list => { for (const s of list) await s.run(); return []; } };
}
const payload = { categories: [{ name: "Swordland", events: [{ name: "Swordland Showdown", begin_ts: nowSec - 3600, end_ts: nowSec + 86400 }] }] };

test("1時間ごとの取得：まだ一度も取っていない王国を先に（古い王国が多くても待たされない）", async () => {
  resetSwordlandSchemaCache();
  const db = d1();
  await runSwordlandEventsRefresh({ DB: db }, { nowMs: NOW, collect: async () => ({ result: { categories: [] } }) }); // 表を作る（王国なし）
  for (const [i, kid] of [1001, 1420, 1491, 1524, 918].entries()) db.raw.exec(`INSERT INTO user_player_links VALUES ('u${i}','g${i}','ACTIVE','MAIN',1); INSERT INTO players VALUES ('g${i}', ${kid});`);
  for (const kid of [1001, 1420, 1491, 1524]) db.raw.exec(`INSERT INTO swordland_fetch_state VALUES (${kid}, ${nowSec - 2 * 86400}, 'OK')`);
  const called = [];
  const r = await runSwordlandEventsRefresh({ DB: db }, { nowMs: NOW, collect: async (env, o) => { called.push(Number(o.targetId)); return { result: payload }; } });
  assert.equal(r.kingdoms, 3);
  assert.equal(called[0], 918, "新しい王国が最初");
});

test("聖剣のページ・ホームを開いたとき：まだ取っていない王国なら1回だけその場で取る", async () => {
  resetSwordlandSchemaCache(); resetSwordlandOnDemandCache();
  const db = d1();
  let calls = 0;
  const collect = async () => { calls++; return { result: payload }; };
  assert.equal(await ensureSwordlandEventsFetched({ DB: db }, 918, { nowMs: NOW, collect }), true);
  assert.equal((await activeSwordlandEvents(db, 918, NOW)).length, 1, "開催中になる");
  assert.equal(await ensureSwordlandEventsFetched({ DB: db }, 918, { nowMs: NOW, collect }), false);
  assert.equal(calls, 1, "2回目からは取らない");
});

test("失敗したときは記録しない（1時間ごとの取得でまた先に取る）・同じ isolate では何度も呼ばない", async () => {
  resetSwordlandSchemaCache(); resetSwordlandOnDemandCache();
  const db = d1();
  let calls = 0;
  const collect = async () => { calls++; throw Object.assign(new Error("x"), { code: "NO_API_POOL_KEY_AVAILABLE" }); };
  assert.equal(await ensureSwordlandEventsFetched({ DB: db }, 918, { nowMs: NOW, collect }), false);
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM swordland_fetch_state").get().n, 0);
  await ensureSwordlandEventsFetched({ DB: db }, 918, { nowMs: NOW, collect });
  assert.equal(calls, 1);
});

test("配線：聖剣のページとホームの API で、日程を読む前に取る", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.equal((src.match(/if \(mine\?\.kid\) await ensureSwordlandEventsFetched\(env, Number\(mine\.kid\)\)/g) || []).length, 2);
});
