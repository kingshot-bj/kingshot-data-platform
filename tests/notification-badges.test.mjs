import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { getBadgeCounts, markBadgeSeen, createAnnouncement, deleteAnnouncement, listAnnouncements, renderNewsPage, resetBadgeSchemaCache } from "../src/notification-badges.js";
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
  assert.ok(!html.includes("news-submit"), "only OWNER sees the post form");
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
  assert.match(index, /url\.pathname === "\/api\/owner\/announcements"\) return await handleAnnouncementsApi/);
  assert.match(index, /async function handleAnnouncementsApi[\s\S]*?requireOwner\(request, env\)/);
});
