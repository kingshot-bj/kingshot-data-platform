import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import {
  runKvkCollection, renderKvkPage, ensureKvkSchema, resetKvkSchemaCache, kvkScoreInterval, getKvkScore,
  KVK_SCORE_MAX_PER_HOUR, KVK_SCORE_ACTIVE_INTERVAL_SECONDS, KVK_SCORE_IDLE_INTERVAL_SECONDS
} from "../src/kvk.js";
import { resetKvkDiscordSchemaCache } from "../src/kvk-discord.js";

const NOW = 1793600000;

// Minimal D1 facade over an in-memory SQLite database.
function d1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE api_request_locks (lock_key TEXT PRIMARY KEY, lock_token TEXT, lock_until INTEGER, updated_at INTEGER);
    CREATE TABLE api_pool_keys (key_id TEXT PRIMARY KEY, provider TEXT, status TEXT, mighty_capable INTEGER, mighty_check_status TEXT, quota_per_day INTEGER);
    CREATE TABLE api_pool_usage (key_id TEXT, used_at INTEGER, request_count INTEGER);
    CREATE TABLE user_player_links (user_id TEXT, kingdom_id INTEGER, status TEXT, account_type TEXT, governor_id TEXT);
    CREATE TABLE players (governor_id TEXT PRIMARY KEY, kid INTEGER);
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
  resetKvkDiscordSchemaCache();
  const db = d1();
  db.sqlite.prepare("INSERT INTO api_pool_keys VALUES ('k1','MIGHTPULSE','AVAILABLE',1,'CONFIRMED',10000)").run();
  if (mightyUsed) db.sqlite.prepare("INSERT INTO api_pool_usage VALUES ('k1', ?, ?)").run(NOW - 10, mightyUsed);
  for (const [u, k, t] of users) db.sqlite.prepare("INSERT INTO user_player_links (user_id, kingdom_id, status, account_type) VALUES (?, ?, 'ACTIVE', ?)").run(u, k, t);
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

test("intraday points are stored only while a KvK is running and only when the score changes", async () => {
  const { db, env } = setup();
  let score = 600;
  const live = () => ({ ...scores(1524, 1523), score });
  const mp = fakeMightPulse({ "/kvk/matchups": matchups(23, "armament"), "/kingdoms/1524/kvk/scores": live, "/kingdoms/1523/kvk/scores": scores(1523, 1524) });
  await runKvkCollection(env, { now: NOW, collect: mp.collect });
  await runKvkCollection(env, { now: NOW + 3601, collect: mp.collect }); // unchanged
  score = 900;
  await runKvkCollection(env, { now: NOW + 7202, collect: mp.collect });
  const points = db.sqlite.prepare("SELECT at, score FROM kvk_score_points WHERE kid = 1524 ORDER BY at").all();
  assert.deepEqual(points.map(p => p.score), [600, 900]);
  // Finished season: no new points.
  const ended = fakeMightPulse({ "/kingdoms/1524/kvk/scores": scores(1524, 1523, { status: "Ended" }) });
  const { fetchKvkScore } = await import("../src/kvk.js");
  await fetchKvkScore(env, 1524, { now: NOW + 9000, collect: ended.collect });
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) c FROM kvk_score_points WHERE kid = 1524").get().c, 2);
});

test("final season results are kept for both kingdoms", async () => {
  const { db, env } = setup();
  const { fetchKvkScore } = await import("../src/kvk.js");
  await ensureKvkSchema(db);
  const mp = fakeMightPulse({ "/kingdoms/1524/kvk/scores": scores(1524, 1485, { season: 22, status: "Ended" }) });
  await fetchKvkScore(env, 1524, { now: NOW, collect: mp.collect });
  const rows = db.sqlite.prepare("SELECT kid, season, opponent, score, opponent_score, result FROM kvk_season_results ORDER BY kid").all();
  assert.deepEqual(rows.map(r => [r.kid, r.opponent, r.result]), [[1485, 1524, "LOSS"], [1524, 1485, "WIN"]]);
  // A running season is not recorded as a result.
  const running = fakeMightPulse({ "/kingdoms/1524/kvk/scores": scores(1524, 1523, { season: 23 }) });
  await fetchKvkScore(env, 1524, { now: NOW + 10, collect: running.collect });
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) c FROM kvk_season_results WHERE season = 23").get().c, 0);
});

test("countdown targets the running day's end, then the next day's start", async () => {
  const { kvkCountdownTarget } = await import("../src/kvk.js");
  const days = [{ day: 1, name: "I", status: "Ended", begin_ts: 100, end_ts: 200 }, { day: 2, name: "II", status: "Ongoing", begin_ts: 200, end_ts: 300 }, { day: 3, name: "III", status: "Upcoming", begin_ts: 300, end_ts: 400 }];
  assert.deepEqual(kvkCountdownTarget(days, 250), { kind: "END", at: 300, name: "II" });
  assert.deepEqual(kvkCountdownTarget(days.map(d => ({ ...d, status: d.day === 2 ? "Ended" : d.status })), 50), { kind: "START", at: 100, name: "I" });
  assert.equal(kvkCountdownTarget(days.map(d => ({ ...d, status: "Ended" })), 500), null);
});

test("page shows countdown, trend chart and past results", async () => {
  const { db, env } = setup();
  const t = NOW;
  const running = () => ({ ...scores(1524, 1523), days: [{ day: 1, name: "I", status: "Ongoing", kingdom_score: 1, opponent_score: 2, begin_ts: t - 100, end_ts: t + 5000 }] });
  let n = 0;
  const mp = fakeMightPulse({ "/kvk/matchups": matchups(23, "armament"), "/kingdoms/1524/kvk/scores": () => ({ ...running(), score: 600 + (n++) * 100 }), "/kingdoms/1523/kvk/scores": scores(1523, 1524) });
  await runKvkCollection(env, { now: t, collect: mp.collect });
  await runKvkCollection(env, { now: t + 3601, collect: mp.collect });
  db.sqlite.prepare("INSERT INTO kvk_season_results VALUES (1524, 22, 1485, 1628386587, 4040581707, 'LOSS', ?)").run(t);
  const html = await renderKvkPage(new Request("https://e.test/kvk"), env, { status: "ACTIVE", role: "ADVANCED", user_id: "u1" }, { collect: mp.collect, now: t + 3700 });
  assert.ok(html.includes("I の終了まで") && html.includes(`data-at="${t + 5000}"`));
  assert.ok(html.includes("時間ごとのスコア推移") && html.includes("<svg"));
  assert.ok(html.includes("過去のKvK戦績") && html.includes("0勝 1敗") && html.includes("王国 1485"));
  const migration = await readFile(new URL("../migrations/0067_kvk_history.sql", import.meta.url), "utf8");
  assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS kvk_score_points") && migration.includes("CREATE TABLE IF NOT EXISTS kvk_season_results"));
});

test("matchups listed once per pair (1523 -> 1524) are found from either side", async () => {
  const { db, env } = setup();
  const oneWay = { ok: true, season: 23, stage: "prediction", count: 2, matchups: [
    { kingdom: 1523, kingdom_name: "Les gaulois", opponent: 1524, opponent_name: null },
    { kingdom: 2000, kingdom_name: null, opponent: null, opponent_name: null }
  ] };
  const mp = fakeMightPulse({ "/kvk/matchups": oneWay, "/kingdoms/1524/kvk/scores": scores(1524, 1523), "/kingdoms/1523/kvk/scores": scores(1523, 1524) });
  const run = await runKvkCollection(env, { now: NOW, collect: mp.collect });
  assert.deepEqual(run.scores.map(s => s.kid).sort(), [1523, 1524], "opponent found although 1524 is only on the right side");
  const html = await renderKvkPage(new Request("https://e.test/kvk"), env, { status: "ACTIVE", role: "ADVANCED", user_id: "u1" }, { collect: mp.collect, now: NOW + 60 });
  assert.ok(html.includes("シーズン 23 の対戦相手"));
  assert.ok(html.includes('<a href="/kingdom?kid=1523">1523</a>') && html.includes("Les gaulois"), "opponent and its name shown from 1524's side");
  const queued = db.sqlite.prepare("SELECT content FROM kvk_discord_outbox WHERE message_key = 'KVK:MATCHUP:23:1524'").get();
  assert.ok(queued && queued.content.includes("王国1524 vs 王国1523（Les gaulois）"));
});

test("KvK page follows a transferred governor and says so", async () => {
  const { db, env } = setup();
  db.sqlite.prepare("UPDATE user_player_links SET governor_id = 'G1' WHERE user_id = 'u1'").run();
  db.sqlite.prepare("INSERT INTO players VALUES ('G1', 1523)").run();
  const mp = fakeMightPulse({ "/kvk/matchups": matchups(), "/kingdoms/1523/kvk/scores": scores(1523, 1524), "/kingdoms/1524/kvk/scores": scores(1524, 1523) });
  const run = await runKvkCollection(env, { now: NOW, collect: mp.collect });
  assert.ok(run.scores.some(s => s.kid === 1523));
  const html = await renderKvkPage(new Request("https://e.test/kvk"), env, { status: "ACTIVE", role: "ADVANCED", user_id: "u1" }, { collect: mp.collect, now: NOW + 60 });
  assert.ok(html.includes("移民を検知しました：登録時 王国1524 → 現在 王国1523"));
  assert.ok(html.includes('<a href="/kvk?kid=1523" class=\'on\'>王国 1523</a>'), "current kingdom is the default");
});
