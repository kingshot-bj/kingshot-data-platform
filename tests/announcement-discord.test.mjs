import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { resetBadgeSchemaCache, createAnnouncement, reviewAnnouncement } from "../src/notification-badges.js";
import { runAnnouncementDiscordSync, enqueueApprovalRequestDms, enqueueReviewResultDm, resetAnnouncementDiscordSchemaCache, ensureAnnouncementDiscordSchema, announceChannelOverwrites, ANNOUNCE_CHANNEL_NAME } from "../src/announcement-discord.js";

function d1() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE users (discord_id TEXT, username TEXT, global_name TEXT, role TEXT, status TEXT);
    INSERT INTO users VALUES ('100000000000000001','owner','オーナー','OWNER','ACTIVE'),('100000000000000002','admin','アドミン','ADMIN','ACTIVE'),('100000000000000003','u','ユーザー','BASIC','ACTIVE');`);
  const prepare = sql => {
    let args = [];
    const st = {
      bind: (...a) => { args = a; return st; },
      first: async () => db.prepare(sql).get(...args) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...args) }),
      run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; }
    };
    return st;
  };
  return { raw: db, prepare, batch: async list => { for (const s of list) await s.run(); return []; } };
}

function fakeDiscord() {
  const calls = [];
  const request = async (env, path, options = {}) => {
    calls.push({ path, method: options.method || "GET", body: options.body ? JSON.parse(options.body) : null });
    if (path === "/users/@me/channels") return { id: "dm-" + JSON.parse(options.body).recipient_id };
    if (path.endsWith("/channels") && (options.method || "GET") === "GET") return [];
    if (path.endsWith("/channels") && options.method === "POST") return { id: "900000000000000001" };
    return { id: "m1" };
  };
  return { calls, request };
}

const env = db => ({ DB: db, DISCORD_SUPPORT_GUILD_ID: "800000000000000001", DISCORD_BOT_TOKEN: "x", DISCORD_CLIENT_ID: "700000000000000001", DISCORD_REDIRECT_URI: "https://ee.example/api/auth/callback" });

test("existing announcements are not re-posted; due ones go to a read-only #お知らせ channel once", async () => {
  resetBadgeSchemaCache(); resetAnnouncementDiscordSchemaCache();
  const db = d1();
  const old = await createAnnouncement(db, { title: "昔の", body: "b", role: "OWNER", now: 100 });
  await ensureAnnouncementDiscordSchema(db);
  const fresh = await createAnnouncement(db, { title: "新機能", body: "本文", role: "OWNER", now: Math.floor(Date.now() / 1000) });
  const later = await createAnnouncement(db, { title: "予約", body: "b", role: "OWNER", publishAt: Math.floor(Date.now() / 1000) + 3600, now: Math.floor(Date.now() / 1000) });
  const d = fakeDiscord();
  const summary = await runAnnouncementDiscordSync(env(db), { request: d.request, now: Math.floor(Date.now() / 1000) + 10 });
  assert.equal(summary.posted, 1);
  const created = d.calls.find(c => c.method === "POST" && c.path.endsWith("/channels"));
  assert.equal(created.body.name, ANNOUNCE_CHANNEL_NAME);
  const post = d.calls.find(c => c.path === "/channels/900000000000000001/messages");
  assert.match(post.body.content, /新機能/);
  assert.match(post.body.content, /https:\/\/ee\.example\/news/);
  assert.deepEqual(post.body.allowed_mentions, { parse: [] });
  assert.ok(!d.calls.some(c => c.body?.content?.includes("昔の")), "old announcement not posted");
  const d2 = fakeDiscord();
  assert.equal((await runAnnouncementDiscordSync(env(db), { request: d2.request, now: Math.floor(Date.now() / 1000) + 20 })).posted, 0, "posted once");
  assert.equal((await runAnnouncementDiscordSync(env(db), { request: d2.request, now: Math.floor(Date.now() / 1000) + 3700 })).posted, 1, "scheduled post goes out when due");
  void old; void fresh; void later;
});

test("an ADMIN post DMs the OWNERs; approve / reject DMs the author", async () => {
  resetBadgeSchemaCache(); resetAnnouncementDiscordSchemaCache();
  const db = d1();
  await ensureAnnouncementDiscordSchema(db);
  const item = await createAnnouncement(db, { title: "依頼", body: "b", createdBy: "100000000000000002", role: "ADMIN", now: 1000 });
  assert.equal(await enqueueApprovalRequestDms(env(db), { ...item, created_by: "100000000000000002" }, { now: 1000 }), 1, "one OWNER");
  await reviewAnnouncement(db, { id: item.id, approve: true, reviewer: "100000000000000001", now: 1100 });
  assert.equal(await enqueueReviewResultDm(env(db), item.id, true, { now: 1100 }), true);
  const d = fakeDiscord();
  const summary = await runAnnouncementDiscordSync(env(db), { request: d.request, now: 1200 });
  assert.equal(summary.dms, 2);
  const dmTo = d.calls.filter(c => c.path === "/users/@me/channels").map(c => c.body.recipient_id);
  assert.deepEqual(dmTo.sort(), ["100000000000000001", "100000000000000002"]);
  const texts = d.calls.filter(c => c.path.startsWith("/channels/dm-")).map(c => c.body.content).join("\n");
  assert.match(texts, /承認依頼[\s\S]*アドミン さんが「依頼」/);
  assert.match(texts, /承認されました/);
  assert.match(texts, /https:\/\/ee\.example\/news/);
});

test("channel permissions: everyone reads, only the bot posts; cron and API are wired", () => {
  const ow = announceChannelOverwrites({ guildId: "1", botUserId: "2" });
  const everyone = ow.find(o => o.id === "1");
  assert.ok((BigInt(everyone.deny) & (1n << 11n)) !== 0n, "@everyone cannot send");
  assert.ok((BigInt(ow.find(o => o.id === "2").allow) & (1n << 11n)) !== 0n, "bot can send");
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(index, /await runAnnouncementDiscordSync\(env\)/);
  assert.match(index, /if \(item\.status === "PENDING"\) await enqueueApprovalRequestDms/);
  assert.match(index, /if \(done\) await enqueueReviewResultDm\(env, body\.id, body\.action === "approve"\)/);
});
