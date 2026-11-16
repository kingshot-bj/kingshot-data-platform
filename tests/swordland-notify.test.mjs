import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runSwordlandOfficerNotify, isNotifyTick, swordlandNotifyText, resetSwordlandNotifySchemaCache, renderNotificationSettingsPage } from "../src/swordland-notify.js";
import { resetSwordlandSchemaCache, WEEK_SECONDS } from "../src/swordland.js";

// 2026-11-16：聖剣争奪・頂上リーグで対戦相手が登録されないと、ホームに相手が出ない。R4・R5 に個チャで知らせる。
const week = Date.parse("2026-11-16T00:00:00Z") / 1000; // 11/16(月) 9:00 JST
const at = (week + 5 * 3600 + 6 * 60) * 1000;          // 14:06 JST（毎時5〜9分）

function makeDb({ officers, events, matchups = [], log = [] }) {
  const logged = new Map(log.map(l => [l.season + ":" + l.user_id, l]));
  const db = {
    logged,
    batch: async () => [],
    prepare: sql => {
      const st = { args: [], bind: (...a) => { st.args = a; return st; },
        all: async () => {
          if (sql.startsWith("SELECT DISTINCT kid FROM swordland_events")) return { results: [...new Set(events.map(e => e.kid))].map(kid => ({ kid })) };
          if (sql.includes("FROM users u")) return { results: officers };
          if (sql.includes("FROM swordland_matchups")) { const [season, kid, aid] = st.args; return { results: matchups.filter(m => m.season === season && m.kid === kid && m.aid === aid).map(m => ({ opp_kid: 1546, opp_tag: "MIT", n: 1, at: 1 })) }; }
          return { results: [] };
        },
        first: async () => {
          if (sql.includes("FROM swordland_events")) { const [kid, name, now] = st.args; return events.find(e => e.kid === kid && e.name === name && e.begin_ts <= now && e.end_ts >= now) || null; }
          if (sql.includes("FROM swordland_notify_log")) return logged.has(st.args[0] + ":" + st.args[1]) ? { x: 1 } : null;
          return null;
        },
        run: async () => { if (sql.startsWith("INSERT INTO swordland_notify_log")) { const [season, user_id, kid, aid, sent_at, status] = st.args; const k = season + ":" + user_id; if (!logged.has(k)) logged.set(k, { season, user_id, kid, aid, status }); } return {}; } };
      return st;
    }
  };
  return db;
}

const league = { kid: 1524, name: "Swordland Summit League", begin_ts: 1793318400, end_ts: 1797292800 };
const officer = (n, aid = "153300205") => ({ user_id: "u" + n, discord_id: "10000000000000000" + n, kid: 1524, alliance_aid: aid, alliance_abbr: "PAN" });

function fakeRequest(behave = () => null) {
  const calls = [];
  const fn = async (env, path, opt) => {
    calls.push([path, opt]);
    if (path === "/users/@me/channels") { const id = JSON.parse(opt.body).recipient_id; const e = behave(id); if (e) throw e; return { id: "dm-" + id }; }
    return {};
  };
  fn.calls = calls;
  return fn;
}

test("送る：未登録の同盟の R4・R5 に個チャ（1回の回につき1人1回）・本文にリンクと止め方", async () => {
  resetSwordlandSchemaCache(); resetSwordlandNotifySchemaCache();
  const db = makeDb({ officers: [officer(1), officer(2)], events: [league] });
  const request = fakeRequest();
  const r = await runSwordlandOfficerNotify({ DB: db, DISCORD_BOT_TOKEN: "x" }, { nowMs: at, request });
  assert.equal(r.sent, 2);
  const msgs = request.calls.filter(c => c[0].startsWith("/channels/")).map(c => JSON.parse(c[1].body));
  assert.match(msgs[0].content, /⚔️ 聖剣頂上リーグ（11\/16〜11\/23）/);
  assert.match(msgs[0].content, /PAN の今週の対戦相手がまだ登録されていません/);
  assert.match(msgs[0].content, /https:\/\/eagleeye-ks\.com\/swordland/);
  assert.match(msgs[0].content, /通知を止める：https:\/\/eagleeye-ks\.com\/settings\/notifications/);
  assert.deepEqual(msgs[0].allowed_mentions, { parse: [] });
  assert.equal([...db.logged.values()][0].season, week + 1, "頂上リーグの回");
  // 2回目は送らない
  const again = fakeRequest();
  assert.equal((await runSwordlandOfficerNotify({ DB: db, DISCORD_BOT_TOKEN: "x" }, { nowMs: at + 3600 * 1000, request: again })).sent, 0);
  assert.equal(again.calls.length, 0);
});

test("送らない：同盟の誰かが登録済み・個チャを拒否は記録して次へ・最大5人・429 で止める", async () => {
  resetSwordlandSchemaCache(); resetSwordlandNotifySchemaCache();
  const reg = makeDb({ officers: [officer(1)], events: [league], matchups: [{ season: week + 1, kid: 1524, aid: "153300205" }] });
  const r1 = await runSwordlandOfficerNotify({ DB: reg, DISCORD_BOT_TOKEN: "x" }, { nowMs: at, request: fakeRequest() });
  assert.equal(r1.sent, 0); assert.equal(r1.skippedRegistered, 1);
  const closedErr = Object.assign(new Error("closed"), { status: 403, discord: { code: 50007 } });
  const db2 = makeDb({ officers: [officer(1), officer(2)], events: [league] });
  const r2 = await runSwordlandOfficerNotify({ DB: db2, DISCORD_BOT_TOKEN: "x" }, { nowMs: at, request: fakeRequest(id => id.endsWith("1") ? closedErr : null) });
  assert.equal(r2.closed, 1); assert.equal(r2.sent, 1);
  assert.deepEqual([...db2.logged.values()].map(l => l.status).sort(), ["DM_CLOSED", "SENT"]);
  const many = makeDb({ officers: Array.from({ length: 8 }, (_, i) => officer(i)), events: [league] });
  assert.equal((await runSwordlandOfficerNotify({ DB: many, DISCORD_BOT_TOKEN: "x" }, { nowMs: at, request: fakeRequest() })).sent, 5);
  const rl = makeDb({ officers: [officer(1), officer(2)], events: [league] });
  const r4 = await runSwordlandOfficerNotify({ DB: rl, DISCORD_BOT_TOKEN: "x" }, { nowMs: at, request: fakeRequest(() => Object.assign(new Error("rl"), { status: 429 })) });
  assert.equal(r4.rateLimited, true); assert.equal(rl.logged.size, 0, "429 のときは記録しない（あとで送る）");
});

test("時間：毎時5〜9分・日本時間 9時〜22時台だけ／鍵が無ければ何もしない", async () => {
  assert.equal(isNotifyTick(week + 5 * 3600 + 6 * 60), true);
  assert.equal(isNotifyTick(week + 5 * 3600 + 12 * 60), false);
  assert.equal(isNotifyTick(week - 3 * 3600 + 6 * 60), false, "6時台は送らない");
  assert.equal(isNotifyTick(week + 13 * 3600 + 6 * 60), true, "22時台は送る");
  assert.equal(isNotifyTick(week + 14 * 3600 + 6 * 60), false, "23時台は送らない");
  assert.equal((await runSwordlandOfficerNotify({ DB: makeDb({ officers: [], events: [] }) }, { nowMs: at })).skipped, "NO_BOT_TOKEN");
});

test("対象の選び方：R4・R5・ADVANCED以上・止めていない人／設定ページ／cron と配線", () => {
  const src = readFileSync(new URL("../src/swordland-notify.js", import.meta.url), "utf8");
  assert.match(src, /p\.alliance_rank IN \(\$\{OFFICER_RANKS\.join\(","\)\}\)/);
  assert.match(src, /const OFFICER_RANKS = \[4, 5\];/);
  assert.match(src, /LEFT JOIN swordland_notify_optout o ON o\.user_id = u\.user_id/);
  assert.match(src, /o\.user_id IS NULL/);
  assert.match(renderNotificationSettingsPage({ off: false }), /name="swordland" value="off"/);
  assert.match(renderNotificationSettingsPage({ off: true }), /止めています/);
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(index, /await runSwordlandOfficerNotify\(env, \{ origin: env\.PUBLIC_ORIGIN \|\| "https:\/\/eagleeye-ks\.com" \}\);/);
  assert.match(index, /if \(url\.pathname === "\/settings\/notifications"\) \{\n        const auth = await getAuthenticatedUser\(request, env\);/);
  assert.match(swordlandNotifyText({ label: "聖剣争奪", begin_ts: week, end_ts: week + WEEK_SECONDS }, { abbr: "PAN" }), /PAN の今回の対戦相手/);
});
