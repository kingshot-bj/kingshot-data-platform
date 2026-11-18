import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runSwordlandOfficerNotify, isNotifyTick, swordlandNotifyText, resetSwordlandNotifySchemaCache, renderNotificationSettingsPage } from "../src/swordland-notify.js";
import { resetSwordlandSchemaCache, WEEK_SECONDS } from "../src/swordland.js";

// 2026-11-16：聖剣争奪・頂上リーグで対戦相手が登録されないと、ホームに相手が出ない。R4・R5 に個チャで知らせる。
const week = Date.parse("2026-11-16T00:00:00Z") / 1000; // 11/16(月) 9:00 JST
const at = (week + 6 * 60) * 1000;                     // 9:06 JST（朝・毎時5〜9分）

function makeDb({ officers, events, matchups = [], log = [] }) {
  // 送った記録：新しい表（回・人・王国・同盟）は logged、前の表（回・人ごと）は oldLog（2026-11-18）
  const logged = new Map();
  const oldLog = new Map(log.map(l => [[l.season, l.user_id, l.kid, l.aid].join(":"), l]));
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
          if (sql.includes("FROM swordland_notify_sent")) { const a = st.args; return logged.has(a.slice(0, 4).join(":")) || oldLog.has(a.slice(4, 8).join(":")) ? { x: 1 } : null; }
          return null;
        },
        run: async () => { if (sql.startsWith("INSERT INTO swordland_notify_sent")) { const [season, user_id, kid, aid, sent_at, status] = st.args; const k = [season, user_id, kid, aid].join(":"); if (!logged.has(k)) logged.set(k, { season, user_id, kid, aid, status }); } return {}; } };
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
  const r = await runSwordlandOfficerNotify({ DB: db, DISCORD_BOT_TOKEN: "x" }, { nowMs: at, request, gapMs: 0 });
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
  assert.equal((await runSwordlandOfficerNotify({ DB: db, DISCORD_BOT_TOKEN: "x" }, { nowMs: at + 3600 * 1000, gapMs: 0, request: again })).sent, 0);
  assert.equal(again.calls.length, 0);
});

test("送らない：同盟の誰かが登録済み・個チャを拒否は記録して次へ・最大5人・429 で止める", async () => {
  resetSwordlandSchemaCache(); resetSwordlandNotifySchemaCache();
  const reg = makeDb({ officers: [officer(1)], events: [league], matchups: [{ season: week + 1, kid: 1524, aid: "153300205" }] });
  const r1 = await runSwordlandOfficerNotify({ DB: reg, DISCORD_BOT_TOKEN: "x" }, { nowMs: at, request: fakeRequest() });
  assert.equal(r1.sent, 0); assert.equal(r1.skippedRegistered, 1);
  const closedErr = Object.assign(new Error("closed"), { status: 403, discord: { code: 50007 } });
  const db2 = makeDb({ officers: [officer(1), officer(2)], events: [league] });
  const r2 = await runSwordlandOfficerNotify({ DB: db2, DISCORD_BOT_TOKEN: "x" }, { nowMs: at, gapMs: 0, request: fakeRequest(id => id.endsWith("1") ? closedErr : null) });
  assert.equal(r2.closed, 1); assert.equal(r2.sent, 1);
  assert.deepEqual([...db2.logged.values()].map(l => l.status).sort(), ["DM_CLOSED", "SENT"]);
  const many = makeDb({ officers: Array.from({ length: 9 }, (_, i) => officer(i)), events: [league] });
  const { SWORDLAND_NOTIFY_MAX_DMS, SWORDLAND_NOTIFY_GAP_MS } = await import("../src/swordland-notify.js");
  assert.equal(SWORDLAND_NOTIFY_MAX_DMS, 20); assert.equal(SWORDLAND_NOTIFY_GAP_MS, 1500);
  const waits = [];
  assert.equal((await runSwordlandOfficerNotify({ DB: many, DISCORD_BOT_TOKEN: "x" }, { nowMs: at, request: fakeRequest(), maxDms: 6, sleep: async ms => waits.push(ms) })).sent, 6);
  assert.deepEqual(waits, [1500, 1500, 1500, 1500, 1500], "1人ごとに1.5秒あける（最初の1人は待たない）");
  const rl = makeDb({ officers: [officer(1), officer(2)], events: [league] });
  const r4 = await runSwordlandOfficerNotify({ DB: rl, DISCORD_BOT_TOKEN: "x" }, { nowMs: at, gapMs: 0, request: fakeRequest(() => Object.assign(new Error("rl"), { status: 429 })) });
  assert.equal(r4.rateLimited, true); assert.equal(rl.logged.size, 0, "429 のときは記録しない（あとで送る）");
});

test("時間：朝だけ（日本時間 8〜10時台・5分ごとの毎回）／鍵が無ければ何もしない", async () => {
  assert.equal(isNotifyTick(week - 3600 + 6 * 60), true, "8時台");
  assert.equal(isNotifyTick(week + 6 * 60), true, "9時台");
  assert.equal(isNotifyTick(week + 3600 + 6 * 60), true, "10時台");
  assert.equal(isNotifyTick(week + 3600 + 52 * 60), true, "10時台なら何分でも（5分ごとに送る）");
  assert.equal(isNotifyTick(week - 2 * 3600 + 6 * 60), false, "7時台は送らない");
  assert.equal(isNotifyTick(week + 2 * 3600 + 6 * 60), false, "11時台は送らない");
  assert.equal(isNotifyTick(week + 13 * 3600 + 6 * 60), false, "夜は送らない");
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


test("領主を複数登録している人：R4・R5 の同盟ごとに1通・どの領主か本文に書く・同じ同盟は1通（2026-11-18）", async () => {
  resetSwordlandSchemaCache(); resetSwordlandNotifySchemaCache();
  const a = { user_id: "u1", discord_id: "100000000000000001", kid: 1524, alliance_aid: "153300205", alliance_abbr: "PAN", nick_name: "BJにゃん" };
  const b = { user_id: "u1", discord_id: "100000000000000001", kid: 1524, alliance_aid: "153300999", alliance_abbr: "SUB", nick_name: "サブにゃん" };
  const dup = { ...a, nick_name: "同じ同盟のサブ" };
  const db = makeDb({ officers: [a, b, dup], events: [league] });
  const request = fakeRequest();
  const r = await runSwordlandOfficerNotify({ DB: db, DISCORD_BOT_TOKEN: "x" }, { nowMs: at, request, gapMs: 0 });
  assert.equal(r.sent, 2, "同盟2つに1通ずつ");
  const msgs = request.calls.filter(c => c[0].startsWith("/channels/")).map(c => JSON.parse(c[1].body).content);
  assert.match(msgs[0], /領主：BJにゃん（王国1524）\nPAN の/);
  assert.match(msgs[1], /領主：サブにゃん（王国1524）\nSUB の/);
  const again = fakeRequest();
  assert.equal((await runSwordlandOfficerNotify({ DB: db, DISCORD_BOT_TOKEN: "x" }, { nowMs: at + 300000, request: again, gapMs: 0 })).sent, 0, "同じ回はもう送らない");
  // 前の記録（回・人ごとの表）に同じ同盟の記録があれば送らない。別の同盟には送る
  resetSwordlandNotifySchemaCache();
  const old = makeDb({ officers: [a, b], events: [league], log: [{ season: week + 1, user_id: "u1", kid: 1524, aid: "153300205" }] });
  const r3 = await runSwordlandOfficerNotify({ DB: old, DISCORD_BOT_TOKEN: "x" }, { nowMs: at, request: fakeRequest(), gapMs: 0 });
  assert.equal(r3.sent, 1);
});

test("領主が1つの人の本文には領主名を書かない（今まで通り）", () => {
  const ev = { label: "聖剣争奪", begin_ts: 1793318400, end_ts: 1793318400 + 86400 * 2 };
  assert.doesNotMatch(swordlandNotifyText(ev, { abbr: "PAN" }), /領主：/);
});
