// 週1回の領主の変化の個チャ（2026-11-17）。
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { lastWeekRange, isWeeklyTick, summarizeChanges, weeklyReportText, runWeeklyReport, setWeeklyReportOn, isWeeklyReportOn, resetWeeklyReportSchemaCache } from "../src/weekly-report.js";
import { renderNotificationSettingsPage } from "../src/swordland-notify.js";

const MON_1100_JST = Date.parse("2026-11-16T11:05:00+09:00") / 1000; // 月曜

function d1() {
  const raw = new DatabaseSync(":memory:");
  raw.exec(`CREATE TABLE users (user_id TEXT, discord_id TEXT, status TEXT);
    CREATE TABLE user_player_links (user_id TEXT, governor_id TEXT, status TEXT, account_type TEXT, created_at INTEGER);
    CREATE TABLE players (governor_id TEXT, nick_name TEXT, kid INTEGER, alliance_abbr TEXT);
    CREATE TABLE change_events (target_type TEXT, target_id TEXT, field_name TEXT, old_value_json TEXT, new_value_json TEXT, detected_at INTEGER);`);
  const prepare = sql => { let a = []; const st = { bind: (...x) => { a = x; return st; }, all: async () => ({ results: raw.prepare(sql).all(...a) }), first: async () => raw.prepare(sql).get(...a) ?? null, run: async () => { raw.prepare(sql).run(...a); return {}; } }; return st; };
  return { raw, prepare, batch: async list => { for (const s of list) await s.run(); return []; } };
}

test("先週の月曜〜日曜（日本時間）と、月曜11時台だけ動く", () => {
  const r = lastWeekRange(MON_1100_JST);
  assert.equal(r.week, "2026-11-09");
  assert.equal(r.from, Date.parse("2026-11-09T00:00:00+09:00") / 1000);
  assert.equal(r.to, Date.parse("2026-11-16T00:00:00+09:00") / 1000);
  assert.equal(isWeeklyTick(MON_1100_JST), true);
  assert.equal(isWeeklyTick(MON_1100_JST - 3600), false, "10時台は聖剣の通知の時間");
  assert.equal(isWeeklyTick(MON_1100_JST + 86400), false, "火曜");
});

test("変化は項目ごとに週のはじめ→終わり。行き来して元に戻ったもの・対象外の項目は出さない", () => {
  const ev = (f, o, n, t) => ({ field_name: f, old_value_json: JSON.stringify(o), new_value_json: JSON.stringify(n), detected_at: t });
  const c = summarizeChanges([ev("power", 100, 150, 2), ev("power", 150, 180, 3), ev("rank", 5, 3, 1), ev("vip", 5, 6, 1), ev("vip", 6, 5, 2), ev("town_center_level", 24, 25, 1)]);
  assert.deepEqual(c.map(x => [x.field, x.from, x.to]), [["power", 100, 180], ["town_center_level", 24, 25]]);
  const text = weeklyReportText({ name: "BJにゃん", kid: 1524, abbr: "PAN", governorId: "123", changes: c, range: lastWeekRange(MON_1100_JST) });
  assert.match(text, /今週のあなたの領主（11\/9〜11\/15）/);
  assert.match(text, /総力：100 → \*\*180\*\*（\+80）/);
  assert.doesNotMatch(text, /総戦力/);
  assert.match(text, /受け取りをやめる：https:\/\/eagleeye-ks\.com\/settings\/notifications/);
});

test("希望した人だけ・変化がある人だけ送る・同じ週は1回だけ", async () => {
  resetWeeklyReportSchemaCache();
  const db = d1();
  db.raw.exec(`INSERT INTO users VALUES ('u1','100000000000000001','ACTIVE'),('u2','100000000000000002','ACTIVE'),('u3','100000000000000003','ACTIVE');
    INSERT INTO user_player_links VALUES ('u1','g1','ACTIVE','MAIN',1),('u2','g2','ACTIVE','MAIN',1),('u3','g3','ACTIVE','MAIN',1);
    INSERT INTO players VALUES ('g1','ネコ',1524,'PAN');`);
  const t = Date.parse("2026-11-12T12:00:00+09:00") / 1000;
  db.raw.exec(`INSERT INTO change_events VALUES ('PLAYER','g1','power','1000','2000',${t}),('PLAYER','g3','power','1','2',${t})`);
  await setWeeklyReportOn(db, "u1", true);
  await setWeeklyReportOn(db, "u2", true); // 変化なし
  assert.equal(await isWeeklyReportOn(db, "u3"), false, "はじめは受け取らない");
  const sent = [];
  const request = async (env, path, init) => { if (path === "/users/@me/channels") return { id: "c" + JSON.parse(init.body).recipient_id }; sent.push(JSON.parse(init.body).content); return {}; };
  const env = { DB: db, DISCORD_BOT_TOKEN: "x" };
  const r1 = await runWeeklyReport(env, { nowMs: MON_1100_JST * 1000, request, gapMs: 0 });
  assert.equal(r1.sent, 1);
  assert.equal(r1.quiet, 1);
  assert.equal(sent.length, 1);
  assert.match(sent[0], /ネコ・王国1524・PAN/);
  const r2 = await runWeeklyReport(env, { nowMs: (MON_1100_JST + 300) * 1000, request, gapMs: 0 });
  assert.equal(r2.users, 0, "同じ週はもう送らない");
  assert.equal((await runWeeklyReport(env, { nowMs: (MON_1100_JST + 86400) * 1000, request })).skipped, "NOT_THIS_TICK");
});

test("通知の設定ページに週1回の切り替えがある", () => {
  assert.match(renderNotificationSettingsPage({ weeklyOn: false }), /name="weekly" value="on"/);
  assert.match(renderNotificationSettingsPage({ weeklyOn: true }), /name="weekly" value="off"/);
});
