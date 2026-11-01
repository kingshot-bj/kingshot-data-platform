import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import {
  runKvkDiscordSync, buildKvkScoreNotifications, buildKvkMatchupNotifications, enqueueKvkNotifications,
  kvkParentOverwrites, resetKvkDiscordSchemaCache, KVK_PARENT_CHANNEL_NAME
} from "../src/kvk-discord.js";

const NOW = 1793600000;
const GUILD = "111111111111111111", BOT = "222222222222222222", ROLE = "333333333333333333";
const A = "444444444444444441", B = "444444444444444442", C = "444444444444444443";

function d1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE users (user_id TEXT, discord_id TEXT, status TEXT);
    CREATE TABLE user_player_links (user_id TEXT, kingdom_id INTEGER, status TEXT, account_type TEXT, governor_id TEXT);
    CREATE TABLE players (governor_id TEXT PRIMARY KEY, kid INTEGER);`);
  const stmt = (sql, args = []) => ({ sql, bind: (...a) => stmt(sql, a), first: async () => sqlite.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }), run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }) });
  return { sqlite, prepare: sql => stmt(sql), batch: async l => { for (const s of l) await s.run(); return []; } };
}

function fakeDiscord({ failAdd = new Set() } = {}) {
  const calls = [];
  let n = 0;
  const request = async (env, path, options = {}) => {
    const method = options.method || "GET";
    calls.push({ method, path, body: options.body ? JSON.parse(options.body) : null });
    if (method === "GET" && path === `/guilds/${GUILD}/channels`) return [];
    if (method === "POST" && path === `/guilds/${GUILD}/channels`) return { id: "900000000000000001" };
    if (method === "POST" && path.endsWith("/threads")) return { id: "91000000000000000" + (++n) };
    if (method === "PUT" && path.includes("/thread-members/")) {
      const id = path.split("/").pop();
      if (failAdd.has(id)) { const e = new Error("Unknown Member"); e.status = 404; e.discord = { code: 10007 }; throw e; }
      return null;
    }
    return {};
  };
  return { calls, request };
}

function setup(links) {
  resetKvkDiscordSchemaCache();
  const db = d1();
  for (const [user, discord, kid] of links) {
    db.sqlite.prepare("INSERT INTO users VALUES (?, ?, 'ACTIVE')").run(user, discord);
    db.sqlite.prepare("INSERT INTO user_player_links (user_id, kingdom_id, status, account_type) VALUES (?, ?, 'ACTIVE', 'MAIN')").run(user, kid);
  }
  const env = { DB: db, DISCORD_BOT_TOKEN: "token-SECRET", DISCORD_SUPPORT_GUILD_ID: GUILD, DISCORD_CLIENT_ID: BOT, DISCORD_SUPPORT_ROLE_ID: ROLE };
  return { db, env };
}

test("parent channel: everyone can view but not post or create threads; operators manage threads", () => {
  const ow = kvkParentOverwrites({ guildId: GUILD, supportRoleId: ROLE, botUserId: BOT });
  const everyone = ow.find(o => o.id === GUILD), role = ow.find(o => o.id === ROLE);
  const has = (v, bit) => (BigInt(v) & (1n << BigInt(bit))) !== 0n;
  assert.ok(has(everyone.allow, 10) && has(everyone.deny, 38) && has(everyone.deny, 36) && has(everyone.deny, 35) && has(everyone.deny, 11));
  assert.ok(has(role.allow, 34), "support role has Manage Threads (sees all private threads)");
});

test("creates one private thread per kingdom with users and adds only that kingdom's users", async () => {
  const { db, env } = setup([["u1", A, 1524], ["u2", B, 1524], ["u3", C, 777]]);
  const dc = fakeDiscord();
  const r = await runKvkDiscordSync(env, { now: NOW, request: dc.request });
  assert.equal(r.created, 2);
  const parent = dc.calls.find(c => c.method === "POST" && c.path === `/guilds/${GUILD}/channels`);
  assert.equal(parent.body.name, KVK_PARENT_CHANNEL_NAME);
  const threads = dc.calls.filter(c => c.path.endsWith("/threads"));
  assert.ok(threads.every(t => t.body.type === 12 && t.body.invitable === false), "private, members cannot invite");
  const adds = dc.calls.filter(c => c.method === "PUT").map(c => c.path);
  const t1524 = db.sqlite.prepare("SELECT thread_id FROM kvk_discord_threads WHERE kid = 1524").get().thread_id;
  const t777 = db.sqlite.prepare("SELECT thread_id FROM kvk_discord_threads WHERE kid = 777").get().thread_id;
  assert.deepEqual(adds.sort(), [`/channels/${t1524}/thread-members/${A}`, `/channels/${t1524}/thread-members/${B}`, `/channels/${t777}/thread-members/${C}`].sort());
  assert.ok(!JSON.stringify(r).includes("SECRET"));
  // Parent channel is remembered.
  const again = fakeDiscord();
  await runKvkDiscordSync(env, { now: NOW + 60, request: again.request });
  assert.ok(!again.calls.some(c => c.path === `/guilds/${GUILD}/channels`));
});

test("users who leave the kingdom are removed; users not in the server are retried later", async () => {
  const { db, env } = setup([["u1", A, 1524], ["u2", B, 1524]]);
  await runKvkDiscordSync(env, { now: NOW, request: fakeDiscord({ failAdd: new Set([B]) }).request });
  assert.deepEqual(db.sqlite.prepare("SELECT discord_id FROM kvk_discord_members").all().map(r => r.discord_id), [A]);
  db.sqlite.prepare("UPDATE user_player_links SET kingdom_id = 999 WHERE user_id = 'u1'").run();
  const dc = fakeDiscord();
  await runKvkDiscordSync(env, { now: NOW + 31 * 60, request: dc.request });
  const t = db.sqlite.prepare("SELECT thread_id FROM kvk_discord_threads WHERE kid = 1524").get().thread_id;
  assert.ok(dc.calls.some(c => c.method === "DELETE" && c.path === `/channels/${t}/thread-members/${A}`));
  assert.ok(dc.calls.some(c => c.method === "PUT" && c.path === `/channels/${t}/thread-members/${B}`), "retried");
});

test("API calls per run are capped", async () => {
  const links = Array.from({ length: 30 }, (_, i) => ["u" + i, String(500000000000000000n + BigInt(i)), 2000 + i]);
  const { env } = setup(links);
  const dc = fakeDiscord();
  await runKvkDiscordSync(env, { now: NOW, request: dc.request, maxCalls: 12 });
  assert.ok(dc.calls.length <= 12);
});

test("outbox messages go to the kingdom's thread once, without mentions", async () => {
  const { db, env } = setup([["u1", A, 1524]]);
  await enqueueKvkNotifications(db, [{ key: "K1", kid: 1524, content: "hello @everyone" }, { key: "K2", kid: 4242, content: "nobody here" }], NOW);
  await enqueueKvkNotifications(db, [{ key: "K1", kid: 1524, content: "dup" }], NOW);
  const dc = fakeDiscord();
  const r = await runKvkDiscordSync(env, { now: NOW, request: dc.request });
  const posts = dc.calls.filter(c => c.method === "POST" && c.path.endsWith("/messages"));
  assert.equal(posts.length, 1);
  assert.equal(posts[0].body.content, "hello @everyone");
  assert.deepEqual(posts[0].body.allowed_mentions, { parse: [] });
  assert.equal(r.dropped, 1, "kingdom without users is dropped");
  const second = fakeDiscord();
  await runKvkDiscordSync(env, { now: NOW + 60, request: second.request });
  assert.equal(second.calls.filter(c => c.path.endsWith("/messages")).length, 0);
});

test("disabled when Discord is not configured", async () => {
  const { env } = setup([]);
  assert.deepEqual(await runKvkDiscordSync({ DB: env.DB }, { request: async () => { throw new Error("no"); } }), { enabled: false });
});

test("notification rules: day result, lead change, matchups; quiet on first sighting", () => {
  const day = (d, s, a, b) => ({ day: d, name: ["I", "II", "III"][d - 1], status: s, kingdom_score: a, opponent_score: b });
  const prev = { season: 23, score: 100, opponent_score: 50, days: [day(1, "Ongoing", 100, 50)] };
  const cur = { season: 23, opponent: 1523, score: 150, opponent_score: 200, days: [day(1, "Ended", 120, 80), day(2, "Ongoing", 30, 120)] };
  const msgs = buildKvkScoreNotifications(1524, prev, cur, NOW, "https://ee.example");
  assert.ok(msgs.some(m => m.key === "KVK:DAY:23:1524:1" && m.content.includes("勝利") && m.content.includes("https://ee.example/kvk?kid=1524")));
  assert.ok(msgs.some(m => m.key.startsWith("KVK:LEAD:23:1524:") && m.content.includes("劣勢")));
  assert.deepEqual(buildKvkScoreNotifications(1524, null, cur, NOW), [], "first fetch after deploy stays quiet");
  assert.deepEqual(buildKvkScoreNotifications(1524, cur, cur, NOW).filter(m => m.key.startsWith("KVK:DAY")), [], "already-ended days are not repeated");
  const mu = buildKvkMatchupNotifications(23, "prediction", [{ kid: 1524, opponent: 1523, opponent_name: "Les gaulois" }, { kid: 5, opponent: 6 }], [1524], "");
  assert.equal(mu.length, 1);
  assert.ok(mu[0].content.includes("王国1524 vs 王国1523（Les gaulois）"));
});

test("wired into Cron and the collector; migration exists", async () => {
  const index = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  const kvk = await readFile(new URL("../src/kvk.js", import.meta.url), "utf8");
  const migration = await readFile(new URL("../migrations/0068_kvk_discord.sql", import.meta.url), "utf8");
  assert.ok(index.includes("const discord = await runKvkDiscordSync(env);"));
  assert.ok(kvk.includes("buildKvkScoreNotifications(id, previous,") && kvk.includes("buildKvkMatchupNotifications(season, stage, normalized, own,"));
  for (const t of ["kvk_discord_threads", "kvk_discord_members", "kvk_discord_outbox"]) assert.ok(migration.includes("CREATE TABLE IF NOT EXISTS " + t));
});

test("a transferred governor moves to the new kingdom's thread (governor ID stays the same)", async () => {
  const { db, env } = setup([["u1", A, 1524]]);
  db.sqlite.prepare("UPDATE user_player_links SET governor_id = 'G1' WHERE user_id = 'u1'").run();
  db.sqlite.prepare("INSERT INTO players VALUES ('G1', 1524)").run();
  await runKvkDiscordSync(env, { now: NOW, request: fakeDiscord().request });
  db.sqlite.prepare("UPDATE players SET kid = 1530 WHERE governor_id = 'G1'").run();
  const dc = fakeDiscord();
  await runKvkDiscordSync(env, { now: NOW + 31 * 60, request: dc.request });
  const old = db.sqlite.prepare("SELECT thread_id FROM kvk_discord_threads WHERE kid = 1524").get().thread_id;
  const neu = db.sqlite.prepare("SELECT thread_id FROM kvk_discord_threads WHERE kid = 1530").get().thread_id;
  assert.ok(dc.calls.some(c => c.method === "PUT" && c.path === `/channels/${neu}/thread-members/${A}`), "added to new kingdom");
  assert.ok(dc.calls.some(c => c.method === "DELETE" && c.path === `/channels/${old}/thread-members/${A}`), "removed from old kingdom");
  assert.equal(db.sqlite.prepare("SELECT kingdom_id FROM user_player_links WHERE user_id = 'u1'").get().kingdom_id, 1524, "registration itself is not rewritten");
});

test("a user who cannot be added does not block other users or other kingdoms", async () => {
  const D = "444444444444444444";
  const { db, env } = setup([["u1", A, 1524], ["u2", B, 1524], ["u3", C, 1524], ["u4", D, 1001]]);
  const calls = [];
  let n = 0;
  const request = async (e, path, options = {}) => {
    const method = options.method || "GET";
    calls.push(method + " " + path);
    if (method === "GET") return [];
    if (path === `/guilds/${GUILD}/channels`) return { id: "900000000000000001" };
    if (path.endsWith("/threads")) return { id: "91000000000000000" + (++n) };
    if (method === "PUT" && path.endsWith("/" + B)) { const err = new Error("Missing Permissions"); err.status = 403; err.discord = { code: 50013 }; throw err; }
    return null;
  };
  const r = await runKvkDiscordSync(env, { now: NOW, request });
  assert.equal(r.created, 2, "1001's thread is created too");
  assert.deepEqual(db.sqlite.prepare("SELECT kid, discord_id FROM kvk_discord_members ORDER BY kid, discord_id").all().map(x => x.kid + ":" + x.discord_id), [`1001:${D}`, `1524:${A}`, `1524:${C}`]);
  assert.equal(r.skippedMembers, 1);
  assert.ok(db.sqlite.prepare("SELECT member_sync_at FROM kvk_discord_threads WHERE kid = 1524").get().member_sync_at, "sync completes; the skipped user is retried next time");
});
