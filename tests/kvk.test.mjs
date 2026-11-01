import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import {
  runKvkCollection, renderKvkPage, ensureKvkSchema, resetKvkSchemaCache, kvkScoreInterval, getKvkScore,
  KVK_SCORE_MAX_PER_HOUR, KVK_SCORE_ACTIVE_INTERVAL_SECONDS, KVK_SCORE_IDLE_INTERVAL_SECONDS
} from "../src/kvk.js";

const NOW = 1793600000;

// Minimal D1 facade over an in-memory SQLite database.
function d1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE api_request_locks (lock_key TEXT PRIMARY KEY, lock_token TEXT, lock_until INTEGER, updated_at INTEGER);
    CREATE TABLE api_pool_keys (key_id TEXT PRIMARY KEY, provider TEXT, status TEXT, mighty_capable INTEGER, mighty_check_status TEXT, quota_per_day INTEGER);
    CREATE TABLE api_pool_usage (key_id TEXT, used_at INTEGER, request_count INTEGER);
    CREATE TABLE user_player_links (user_id TEXT, kingdom_id INTEGER, status TEXT, account_type TEXT);
  `);
  let writes = 0;
  const stmt = (sql, args = []) => ({
    sql, args,
    bind: (...a) => stmt(sql, a),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
    run: async () => { if (args.length > 100) throw new Error("too many SQL variables"); writes++; const r = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; }
  });
  return {
    sqlite,
    get writes() { return writes; },
    prepare: sql => stmt(sql),
    batch: async list => { const out = []; for (const s of list) out.push(await s.run()); return out; }
  };
}

function fakeR2() {
  const objects = new Map();
  return { objects, async put(key, body) { objects.set(key, String(body)); } };
}

function fakeMightPulse(responses) {
  const calls = [];
  const collect = async (env, { path }) => {
    calls.push(path);
    const value = typeof responses[path] === "function" ? responses[path]() : responses[path];
    if (value instanceof Error) throw value;
    if (value === undefined) { const e = new Error("not found"); e.status = 404; throw e; }
    return { result: { data: value } };
  };
  return { calls, collect };
}

const matchups = (season = 23, stage = "prediction") => ({ ok: true, season, stage, count: 3, matchups: [
  { kingdom: 1523, kingdom_name: "Les gaulois", opponent: 1524, opponent_name: null },
  { kingdom: 1524, kingdom_name: null, opponent: 1523, opponent_name: "Les gaulois" },
  { kingdom: 2000, kingdom_name: null, opponent: null, opponent_name: null }
] });
const scores = (kid, opp, { season = 23, status = "Ongoing" } = {}) => ({ ok: true, season, stage: "armament", kingdom: kid, opponent: opp, score: 600, opponent_score: 400, updated_at: "2026-11-01T00:00:00Z",
  days: [{ day: 1, name: "I", status: "Ended", kingdom_score: 300, opponent_score: 100, begin_ts: 1, end_ts: 2 }, { day: 2, name: "II", status, kingdom_score: 300, opponent_score: 300, begin_ts: 2, end_ts: 3 }] });

function setup({ mightyUsed = 0, users = [["u1", 1524, "MAIN"]] } = {}) {
  resetKvkSchemaCache();
  const db = d1();
  db.sqlite.prepare("INSERT INTO api_pool_keys VALUES ('k1','MIGHTPULSE','AVAILABLE',1,'CONFIRMED',10000)").run();
  if (mightyUsed) db.sqlite.prepare("INSERT INTO api_pool_usage VALUES ('k1', ?, ?)").run(NOW - 10, mightyUsed);
  for (const [u, k, t] of users) db.sqlite.prepare("INSERT INTO user_player_links VALUES (?, ?, 'ACTIVE', ?)").run(u, k, t);
  return { db, env: { DB: db, ARCHIVE: fakeR2() } };
}

test("matchups are stored once and rewritten only when the response changes", async () => {
  const { db, env } = setup();
  const mp = fakeMightPulse({ "/kvk/matchups": matchups(), "/kingdoms/1524/kvk/scores": scores(1524, 1523), "/kingdoms/1523/kvk/scores": scores(1523, 1524) });
  const first = await runKvkCollection(env, { now: NOW, collect: mp.collect });
  assert.equal(first.matchups.status, "CHANGED");
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) c FROM kvk_matchups WHERE season=23").get().c, 3);
  assert.equal([...env.ARCHIVE.objects.keys()].filter(k => k.startsWith("kvk/v1/matchups/")).length, 1);
  // Not due again for 6 hours.
  const soon = await runKvkCollection(env, { now: NOW + 600, collect: mp.collect });
  assert.equal(soon.matchups.status, "SKIPPED");
  // Same content after 6 hours: no new R2 object, rows untouched.
  const later = await runKvkCollection(env, { now: NOW + 6 * 3600 + 1, collect: mp.collect });
  assert.equal(later.matchups.status, "UNCHANGED");
  assert.equal([...env.ARCHIVE.objects.keys()].filter(k => k.startsWith("kvk/v1/matchups/")).length, 1);
});

test("scores cover registered kingdoms and their opponents, within per-run and hourly caps", async () => {
  const { db, env } = setup();
  const mp = fakeMightPulse({ "/kvk/matchups": matchups(), "/kingdoms/1524/kvk/scores": scores(1524, 1523), "/kingdoms/1523/kvk/scores": scores(1523, 1524) });
  const run = await runKvkCollection(env, { now: NOW, collect: mp.collect });
  assert.deepEqual(run.scores.map(s => s.kid).sort(), [1523, 1524], "own kingdom and opponent");
  const saved = await getKvkScore(db, 1524);
  assert.equal(saved.score, 600);
  assert.equal(saved.days.length, 2);
  // Active KvK: not fetched again within the hour, fetched again after it.
  const again = await runKvkCollection(env, { now: NOW + 1200, collect: mp.collect });
  assert.equal(again.scores.length, 0);
  const hourLater = await runKvkCollection(env, { now: NOW + KVK_SCORE_ACTIVE_INTERVAL_SECONDS + 1, collect: mp.collect });
  assert.equal(hourLater.scores.length, 2);
  assert.ok(hourLater.scores.every(s => s.status === "UNCHANGED"), "unchanged payload only touches fetched_at");
  assert.equal([...env.ARCHIVE.objects.keys()].filter(k => k.startsWith("kvk/v1/scores/")).length, 2, "R2 copy only on change");
});

test("hourly cap stops score fetches", async () => {
  const users = Array.from({ length: 30 }, (_, i) => ["u" + i, 3000 + i, "MAIN"]);
  const { db, env } = setup({ users });
  const responses = { "/kvk/matchups": matchups() };
  for (const [, k] of users) responses[`/kingdoms/${k}/kvk/scores`] = scores(k, 1);
  const mp = fakeMightPulse(responses);
  for (let i = 0; i < 20; i++) await runKvkCollection(env, { now: NOW + i * 60, collect: mp.collect });
  const fetchedLastHour = db.sqlite.prepare("SELECT COUNT(*) c FROM kvk_scores WHERE fetched_at > ?").get(NOW + 19 * 60 - 3600).c;
  assert.equal(fetchedLastHour, KVK_SCORE_MAX_PER_HOUR);
  assert.equal(mp.calls.filter(c => c.includes("/scores")).length, KVK_SCORE_MAX_PER_HOUR);
});

test("nothing is fetched when Mighty daily quota is low", async () => {
  const { env } = setup({ mightyUsed: 9000 });
  const mp = fakeMightPulse({ "/kvk/matchups": matchups() });
  const result = await runKvkCollection(env, { now: NOW, collect: mp.collect });
  assert.equal(result.reason, "MIGHTY_QUOTA_LOW");
  assert.equal(mp.calls.length, 0);
});

test("score interval: hourly only while running, slower otherwise", () => {
  const state = { season: 23, stage: "prediction" };
  assert.equal(kvkScoreInterval({ season: 23, days: [{ status: "Ongoing" }] }, state), KVK_SCORE_ACTIVE_INTERVAL_SECONDS);
  assert.equal(kvkScoreInterval({ season: 22, days: [{ status: "Ended" }] }, state), KVK_SCORE_IDLE_INTERVAL_SECONDS, "previous season, matchups only announced");
  assert.equal(kvkScoreInterval({ season: 22, days: [{ status: "Ended" }] }, { season: 23, stage: "armament" }), KVK_SCORE_ACTIVE_INTERVAL_SECONDS, "new season started, waiting for scores");
  assert.ok(kvkScoreInterval({ season: 23, days: [{ status: "Ended" }] }, state) > KVK_SCORE_IDLE_INTERVAL_SECONDS, "finished season");
  assert.equal(kvkScoreInterval(null, null), KVK_SCORE_IDLE_INTERVAL_SECONDS);
});

test("page access: login, ADVANCED for own kingdom, VIP for others and the full table", async () => {
  const { db, env } = setup();
  const mp = fakeMightPulse({ "/kvk/matchups": matchups(), "/kingdoms/1524/kvk/scores": scores(1524, 1523), "/kingdoms/1523/kvk/scores": scores(1523, 1524), "/kingdoms/77/kvk/scores": scores(77, 78) });
  await runKvkCollection(env, { now: NOW, collect: mp.collect });
  const page = (path, auth) => renderKvkPage(new Request("https://e.test" + path), env, auth, { collect: mp.collect, now: NOW + 60, loginUrl: "/api/auth/discord?next=%2Fkvk" });

  assert.ok((await page("/kvk", null)).includes("/api/auth/discord?next=%2Fkvk"));
  assert.ok((await page("/kvk", { status: "ACTIVE", role: "BASIC", user_id: "u1" })).includes("ADVANCED以上"));

  const adv = await page("/kvk", { status: "ACTIVE", role: "ADVANCED", user_id: "u1" });
  assert.ok(adv.includes("シーズン 23 の対戦相手") && adv.includes("Les gaulois"));
  assert.ok(adv.includes("日ごとのスコア推移"));
  assert.ok(!adv.includes("全対戦表"), "full table is VIP only");
  assert.ok((await page("/kvk?kid=77", { status: "ACTIVE", role: "ADVANCED", user_id: "u1" })).includes("VIP以上で見られます"));
  assert.ok(!mp.calls.includes("/kingdoms/77/kvk/scores"), "ADVANCED cannot trigger fetches for other kingdoms");

  const vip = await page("/kvk?kid=77", { status: "ACTIVE", role: "VIP", user_id: "u1" });
  assert.ok(mp.calls.includes("/kingdoms/77/kvk/scores"), "VIP on-demand fetch");
  assert.ok(vip.includes("全対戦表を表示"));
  const callsBefore = mp.calls.length;
  await page("/kvk?kid=77", { status: "ACTIVE", role: "VIP", user_id: "u1" });
  assert.equal(mp.calls.length, callsBefore, "cached for an hour");

  const all = await page("/kvk?all=1", { status: "ACTIVE", role: "VIP", user_id: "u1" });
  assert.ok(all.includes("全体の対戦表（2組）"), "pairs are de-duplicated");
  assert.ok((await page("/kvk?kid=abc", { status: "ACTIVE", role: "VIP", user_id: "u1" })).includes("王国番号が正しくありません"));
  assert.ok(!(await page("/kvk?kid=1524", { status: "ACTIVE", role: "VIP", user_id: "u1" })).includes("<script>alert"));
});

test("schema helper, migration, cron wiring and home entry exist", async () => {
  const { db } = setup();
  await ensureKvkSchema(db);
  const migration = await readFile(new URL("../migrations/0066_kvk.sql", import.meta.url), "utf8");
  const index = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  for (const table of ["kvk_matchups", "kvk_scores", "kvk_state"]) assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS " + table));
  assert.ok(index.includes("const kvk = await runKvkCollection(env);"));
  assert.ok(index.includes('if (url.pathname === "/kvk") { const auth = await getAuthenticatedUser(request, env);'));
  assert.ok(index.includes('<a class="ee-milestone-card ee-kvk-card" href="/kvk">'));
});
