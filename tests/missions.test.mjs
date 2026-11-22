// 今日の作戦：機能の判定、日替わりの選び方、記録（1人1日1行・同じ機能は書かない）、連続日数（1日休みOK）、週の作戦、公開前はオーナーだけ、配線。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  missionActionForPath, dailyMissionsFor, recordMissionAction, isMissionUser, computeStreak, bestStreak,
  loadMissions, loadMissionStats, resetMissionSchemaCache, weekStart, MISSION_ACTIONS
} from "../src/missions.js";

const NOW = Date.parse("2026-11-07T12:00:00+09:00"); // 土曜
const BIT = Object.fromEntries(MISSION_ACTIONS.map(a => [a.key, a.bit]));

function fakeDb({ rows = [], owners = ["owner1"] } = {}) {
  const calls = [];
  const table = new Map(rows.map(r => [r.discord_id + "|" + r.day, { ...r }]));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    async run() {
      calls.push(sql);
      if (sql.startsWith("INSERT INTO user_mission_daily")) { const k = args[0] + "|" + args[1]; const r = table.get(k) || { discord_id: args[0], day: args[1], actions: 0 }; r.actions |= args[2]; table.set(k, r); }
      return { meta: {} };
    },
    async all() {
      calls.push(sql);
      if (sql.includes("FROM users")) return { results: owners.map(discord_id => ({ discord_id })) };
      if (sql.includes("WHERE discord_id = ?")) return { results: [...table.values()].filter(r => r.discord_id === args[0] && r.day >= args[1]) };
      if (sql.includes("FROM user_mission_daily")) return { results: [...table.values()].filter(r => r.day >= args[0]) };
      return { results: [] };
    }
  });
  return { calls, table, prepare: sql => stmt(sql) };
}

test("ページ → 使った機能", () => {
  assert.equal(missionActionForPath("/my-player"), "my_player");
  assert.equal(missionActionForPath("/player/compare?governor_id=1"), "compare");
  assert.equal(missionActionForPath("/player-watchlist"), "watchlist");
  assert.equal(missionActionForPath("/kingdom/rankings"), "kingdom");
  assert.equal(missionActionForPath("/kvk/matchups"), "kvk");
  assert.equal(missionActionForPath("/player"), "player");
  assert.equal(missionActionForPath("/hero-catalog"), "hero");
  assert.equal(missionActionForPath("/"), null);
  assert.equal(missionActionForPath("/owner/growth"), null);
});

test("デイリー3つ：1つ目は自分の領主（未登録なら領主を調べる）、残りは人と日で決まる日替わり・重複なし", () => {
  const a = dailyMissionsFor("u1", "2026-11-07");
  assert.equal(a.length, 3);
  assert.equal(a[0], "my_player");
  assert.equal(new Set(a).size, 3);
  assert.deepEqual(dailyMissionsFor("u1", "2026-11-07"), a, "同じ人・同じ日は同じ作戦");
  const days = new Set(Array.from({ length: 10 }, (_, i) => dailyMissionsFor("u1", "2026-11-" + String(10 + i)).join()));
  assert.ok(days.size > 1, "日によって変わる");
  const b = dailyMissionsFor("u2", "2026-11-07", { linked: false });
  assert.equal(b[0], "player");
  assert.ok(!b.slice(1).includes("player"));
  assert.ok(!a.includes("share"), "共有は日替わりに入れない（週の作戦だけ）");
});

test("記録：1人1日1行に bit を足す。同じ日・同じ機能は2回書かない", async () => {
  resetMissionSchemaCache();
  const db = fakeDb();
  assert.equal(await recordMissionAction(db, "owner1", "kvk", { nowMs: NOW }), true);
  assert.equal(await recordMissionAction(db, "owner1", "kvk", { nowMs: NOW }), false);
  assert.equal(await recordMissionAction(db, "owner1", "kingdom", { nowMs: NOW }), true);
  assert.equal(await recordMissionAction(db, "owner1", "nope", { nowMs: NOW }), false);
  const writes = db.calls.filter(c => c.startsWith("INSERT INTO user_mission_daily"));
  assert.equal(writes.length, 2);
  assert.match(writes[0], /ON CONFLICT\(discord_id, day\) DO UPDATE SET actions = actions \| excluded\.actions/);
  assert.equal(db.table.get("owner1|2026-11-07").actions, BIT.kvk | BIT.kingdom);
});

test("公開前はオーナーだけ記録（オーナー一覧は isolate で1回だけ読む）", async () => {
  resetMissionSchemaCache();
  const db = fakeDb({ owners: ["owner1"] });
  assert.equal(await isMissionUser(db, "owner1", { nowMs: NOW }), true);
  assert.equal(await isMissionUser(db, "user2", { nowMs: NOW }), false);
  assert.equal(db.calls.filter(c => c.includes("FROM users")).length, 1);
  assert.equal(await isMissionUser(db, "user2", { isPublic: true }), true);
});

test("連続日数：3つ全部の日を数える。1日休みは途切れない、2日休むと途切れる。今日が未達成なら昨日まで", () => {
  const t = "2026-11-07";
  assert.deepEqual(computeStreak(["2026-11-07", "2026-11-06", "2026-11-05"], t), { streak: 3, restUsed: false });
  assert.deepEqual(computeStreak(["2026-11-06", "2026-11-05"], t), { streak: 2, restUsed: false });
  assert.deepEqual(computeStreak(["2026-11-07", "2026-11-05", "2026-11-04"], t), { streak: 3, restUsed: true });
  assert.deepEqual(computeStreak(["2026-11-05", "2026-11-04"], t), { streak: 2, restUsed: true });
  assert.equal(computeStreak(["2026-11-07", "2026-11-04"], t).streak, 1);
  assert.equal(computeStreak([], t).streak, 0);
  assert.equal(bestStreak(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-11-07"]), 4);
});

test("loadMissions：今日の3つ・週の作戦・連続日数（1人分の行を1回読む）", async () => {
  resetMissionSchemaCache();
  const id = "owner1";
  const full = d => dailyMissionsFor(id, d).reduce((a, k) => a | BIT[k], 0);
  const rows = ["2026-11-04", "2026-11-05", "2026-11-06"].map(day => ({ discord_id: id, day, actions: full(day) }));
  rows.push({ discord_id: id, day: "2026-11-02", actions: BIT.share | BIT.news | BIT.hero });
  rows.push({ discord_id: id, day: "2026-11-07", actions: BIT[dailyMissionsFor(id, "2026-11-07")[0]] });
  const db = fakeDb({ rows });
  const m = await loadMissions(db, id, { nowMs: NOW });
  assert.equal(db.calls.filter(c => c.includes("FROM user_mission_daily")).length, 1);
  assert.equal(m.dailyDone, 1);
  assert.equal(m.daily[0].done, true);
  assert.equal(m.streak, 3);
  assert.equal(weekStart("2026-11-07"), "2026-11-02");
  const w = Object.fromEntries(m.weekly.map(x => [x.key, x]));
  assert.equal(w.w_days.now, 5);
  assert.equal(w.w_days.done, true);
  assert.equal(w.w_share.done, true);
  assert.equal(m.best, 3);
  const stats = await loadMissionStats(db, { nowMs: NOW });
  assert.equal(stats.find(s => s.day === "2026-11-06").cleared, 1);
});

test("配線：PVのついでに記録（署名を確かめたセッション・対象者だけ）、共有、ホーム、マイルストーン、成長ダッシュボード", () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const start = index.indexOf("async function recordMissionFromView");
  const fn = index.slice(start, index.indexOf("\n}\n", start));
  assert.match(fn, /await verifyPayload\(token, env\.EAGLEEYE_SESSION_SECRET\)/);
  assert.match(fn, /isMissionUser\(env\.DB, session\.sub, \{ isPublic: MILESTONES_PUBLIC \}\)/);
  assert.doesNotMatch(fn, /getAuthenticatedUser/, "ユーザー表は読まない");
  assert.match(index, /recordMissionAction\(env\.DB, String\(auth\.discord_id\), "share"\)/);
  assert.match(index, /milestonesAvailableFor\(role\) \? `<a class="ee-milestone-card ee-milestone-live ee-mission-card" href="\/milestones#missions" id="homeMissions">/);
  assert.match(index, /if \(ms\?\.missions\) summary\.missions = /);
  assert.match(index, /loadMissionStats\(env\.DB\)/);
  const growth = readFileSync(new URL("../src/growth.js", import.meta.url), "utf8");
  assert.match(growth, /if \(onView && signedIn\) await Promise\.resolve\(onView\(path\)\)\.catch/);
  const ms = readFileSync(new URL("../src/milestones.js", import.meta.url), "utf8");
  assert.match(ms, /🎯 今日の作戦/);
  assert.match(ms, /key: "streak_" \+ n, group: "habit"/);
  // 広告の表示・クリックを作戦の条件にしない
  const missions = readFileSync(new URL("../src/missions.js", import.meta.url), "utf8");
  assert.doesNotMatch(missions, /adsbygoogle|adpv|広告をクリック|広告を見/);
});
