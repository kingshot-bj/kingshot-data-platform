import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { getBadgeCounts, markBadgeSeen, createAnnouncement, deleteAnnouncement, listAnnouncements, listQueuedAnnouncements, reviewAnnouncement, renderNewsPage, resetBadgeSchemaCache } from "../src/notification-badges.js";
import { renderEagleEyeNavigation, renderEagleEyeOtherMenu, EAGLEEYE_DRAWER_INIT } from "../src/eagleeye-ui.js";

function d1() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE player_watchlists (watchlist_id TEXT PRIMARY KEY, discord_id TEXT, governor_id TEXT, enabled INTEGER);
    CREATE TABLE change_events (event_id TEXT PRIMARY KEY, target_type TEXT, target_id TEXT, change_type TEXT, field_name TEXT, detected_at INTEGER);`);
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
  return { raw: db, prepare, batch: async list => { const out = []; for (const s of list) out.push(await s.run()); return out; } };
}

const auth = { discord_id: "111", role: "BASIC" };

test("badges start at zero for a new user, then count only what is new since last seen", async () => {
  resetBadgeSchemaCache();
  const db = d1();
  db.raw.exec("INSERT INTO player_watchlists VALUES ('w1','111','901',1),('w2','111','902',0)");
  assert.deepEqual(await getBadgeCounts(db, auth, { now: 1000 }), { watch: 0, news: 0 }, "first visit: no backlog");
  db.raw.exec(`INSERT INTO change_events VALUES ('e1','PLAYER','901','POWER_CHANGED','power',1500),('e2','PLAYER','901','X','online',1600),('e3','PLAYER','902','POWER_CHANGED','power',1700),('e4','PLAYER','901','POWER_CHANGED','power',900)`);
  await createAnnouncement(db, { title: "t", body: "b", now: 1200 });
  const counts = await getBadgeCounts(db, auth, { now: 2000, changeVisible: c => c.field_name !== "online" });
  assert.deepEqual(counts, { watch: 1, news: 1 }, "disabled watchlists, old and hidden changes are not counted");
  await markBadgeSeen(db, "111", "watch", 2000);
  assert.deepEqual(await getBadgeCounts(db, auth, { now: 2001, changeVisible: () => true }), { watch: 0, news: 1 });
  await markBadgeSeen(db, "111", "news", 2001);
  assert.deepEqual(await getBadgeCounts(db, auth, { now: 2002 }), { watch: 0, news: 0 });
});

test("announcements can be created, listed and deleted; the news page escapes content", async () => {
  resetBadgeSchemaCache();
  const db = d1();
  await assert.rejects(createAnnouncement(db, { title: "", body: "x" }), /TITLE_AND_BODY_REQUIRED/);
  const a = await createAnnouncement(db, { title: "<b>新機能</b>", body: "1行目\n2行目", now: 50 });
  const items = await listAnnouncements(db);
  assert.equal(items.length, 1);
  const html = renderNewsPage(items, { canPost: false, unreadSince: 10 });
  assert.match(html, /&lt;b&gt;新機能&lt;\/b&gt;/);
  assert.match(html, /1行目<br>2行目/);
  assert.match(html, /news-new/);
  assert.ok(!html.includes("news-submit"), "only ADMIN / OWNER see the post form");
  assert.ok(renderNewsPage(items, { canPost: true }).includes("news-submit"));
  assert.equal(await deleteAnnouncement(db, a.id), true);
});

test("navigation badges are hidden by default and filled from /api/badges, not the watchlist size", () => {
  const nav = renderEagleEyeNavigation({});
  assert.match(nav, /data-badge="watch"[^>]*hidden/);
  assert.match(nav, /data-badge="news"[^>]*hidden/);
  assert.match(renderEagleEyeOtherMenu({}), /href="\/news"[\s\S]*?data-badge="news"/);
  assert.match(EAGLEEYE_DRAWER_INIT, /fetch\("\/api\/badges"/);
  assert.ok(!EAGLEEYE_DRAWER_INIT.includes('fetch("/api/player-watchlist"'), "no watchlist read just for the badge");
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(index, /url\.pathname === "\/watchlist" \|\| url\.pathname === "\/player-watchlist"\) await markWatchBadgeSeen/);
  assert.match(index, /await markBadgeSeen\(env\.DB, auth\.discord_id, "news"\)/);
  assert.match(index, /url\.pathname === "\/api\/admin\/announcements" \|\| url\.pathname === "\/api\/owner\/announcements"\) return await handleAnnouncementsApi/);
  assert.match(index, /async function handleAnnouncementsApi[\s\S]*?requireAdmin\(request, env\)/);
  assert.match(index, /const canPost = auth\.role === "OWNER" \|\| auth\.role === "ADMIN";/);
  assert.match(index, /if \(guard\.auth\?\.role !== "OWNER"\) return json\(\{ ok: false, error: "OWNER_REQUIRED" \}, 403\)/);
});

test("scheduled posts appear only when due; ADMIN posts wait for OWNER approval", async () => {
  resetBadgeSchemaCache();
  const db = d1();
  const owner = { discord_id: "1", role: "OWNER" }, admin = { discord_id: "2", role: "ADMIN" }, user = { discord_id: "3", role: "BASIC" };
  await getBadgeCounts(db, user, { now: 100 });
  await getBadgeCounts(db, owner, { now: 100 });
  const scheduled = await createAnnouncement(db, { title: "予約", body: "b", createdBy: "1", role: "OWNER", publishAt: 500, now: 200 });
  assert.equal(scheduled.status, "PUBLISHED");
  assert.equal((await listAnnouncements(db, 30, 300)).length, 0, "not visible before its time");
  assert.equal((await getBadgeCounts(db, user, { now: 300 })).news, 0);
  assert.equal((await listAnnouncements(db, 30, 600)).length, 1, "visible once due");
  assert.equal((await getBadgeCounts(db, user, { now: 600 })).news, 1);
  const pending = await createAnnouncement(db, { title: "依頼", body: "b", createdBy: "2", role: "ADMIN", publishAt: 400, now: 300 });
  assert.equal(pending.status, "PENDING");
  assert.equal((await listAnnouncements(db, 30, 1000)).length, 1, "pending posts are not public");
  assert.equal((await getBadgeCounts(db, owner, { now: 1000 })).news, 2, "OWNER badge includes the approval request");
  assert.deepEqual((await listQueuedAnnouncements(db, admin, 1000)).map(x => x.status), ["PENDING"]);
  assert.equal((await listQueuedAnnouncements(db, { discord_id: "9", role: "ADMIN" }, 1000)).length, 0, "other admins do not see it");
  assert.equal(await deleteAnnouncement(db, pending.id, { discord_id: "9", role: "ADMIN" }), false, "admins delete only their own posts");
  assert.equal(await reviewAnnouncement(db, { id: pending.id, approve: true, reviewer: "1", now: 1000 }), true);
  const visible = await listAnnouncements(db, 30, 1000);
  assert.equal(visible.length, 2);
  assert.equal(visible.find(x => x.id === pending.id).publish_at, 1000, "past requested time publishes now");
  assert.equal(await reviewAnnouncement(db, { id: pending.id, approve: false, reviewer: "1", now: 1001 }), false, "only pending posts can be reviewed");
  await assert.rejects(createAnnouncement(db, { title: "t", body: "b", publishAt: 10 + 400 * 86400, now: 10 }), /PUBLISH_AT_TOO_FAR/);
  const page = renderNewsPage([], { canPost: true, isOwner: false, queued: [{ ...pending, status: "PENDING" }], viewerId: "2" });
  assert.match(page, /承認待ち/);
  assert.match(page, /承認を依頼する/);
  assert.ok(!page.includes('class="news-approve'), "only OWNER gets approve buttons");
  assert.match(renderNewsPage([], { canPost: true, isOwner: true, queued: [{ ...pending, status: "PENDING" }], viewerId: "1" }), /news-approve/);
});
