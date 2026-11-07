// マイルストーン①：判定（純粋関数）、記録の固定（一度達成したら消えない）、既読、読み取りの軽さ、画面の配線。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateMilestones, mysticChapterFromRanks, goldLevelOf, loadMilestones, recordMilestone, resetMilestoneSchemaCache, renderMilestonesPage, MILESTONES } from "../src/milestones.js";

const byKey = items => Object.fromEntries(items.map(i => [i.key, i]));

test("EagleEye編：ログイン・領主ID・ADVANCED・ウォッチ3人・共有", () => {
  const a = byKey(evaluateMilestones({ linked: false, role: "BASIC", watchCount: 1, shared: false, player: null }));
  assert.equal(a.first_step.done, true);
  assert.equal(a.governor_link.done, false);
  assert.equal(a.observer.done, false);
  assert.equal(a.watcher.done, false);
  assert.equal(a.watcher.label, "1 / 3人");
  assert.ok(Math.abs(a.watcher.progress - 1 / 3) < 1e-9);
  assert.equal(a.gold_1.label, "領主IDの登録が必要です");
  const b = byKey(evaluateMilestones({ linked: true, role: "ADVANCED", watchCount: 5, shared: true, player: {} }));
  for (const k of ["governor_link", "observer", "watcher", "herald"]) assert.equal(b[k].done, true, k);
  assert.equal(b.watcher.progress, undefined);
});

test("成長編：黄金・戦力・秘境の章・王国TOP10", () => {
  assert.equal(goldLevelOf(34), 0);
  assert.equal(goldLevelOf(35), 1);
  assert.equal(goldLevelOf(55), 5);
  assert.equal(goldLevelOf(70), 8);
  const ch = mysticChapterFromRanks([{ board: "forest_of_life", score: 20227 }, { board: "radiant_spire", score: 60605 }, { board: "mystic_trial", score: 2431 }, { board: "personal_power", score: 5e8 }]);
  assert.equal(ch, 61); // 605 → 61-5（mystic_trial の総合値は章ではないので無視）
  const r = byKey(evaluateMilestones({ linked: true, role: "BASIC", watchCount: 0, player: { power: 5.2e8, town_center_level: 57 }, powerRank: 8, mysticChapter: 52 }));
  assert.equal(r.gold_1.done, true);
  assert.equal(r.gold_5.done, true);
  assert.equal(r.gold_8.done, false);
  assert.equal(r.gold_8.label, "いま 黄金5");
  assert.equal(r.power_1e8.done, true);
  assert.equal(r.power_5e8.done, true);
  assert.equal(r.power_10e8.done, false);
  assert.equal(r.power_10e8.label, "いま 5.2億");
  assert.equal(r.mystic_50.done, true);
  assert.equal(r.mystic_60.done, false);
  assert.equal(r.kingdom_top10.done, true);
  assert.equal(byKey(evaluateMilestones({ linked: true, player: {}, powerRank: 11 })).kingdom_top10.done, false);
});

test("見られない項目の値は出さない（判定はする）", () => {
  const r = byKey(evaluateMilestones({ linked: true, player: { power: 3e8, town_center_level: 40 }, visible: key => key !== "base_power" }));
  assert.equal(r.power_1e8.done, true);
  assert.equal(r.power_5e8.label, "");
  assert.equal(r.power_5e8.progress, undefined);
});

test("記録済みは戦力が下がっても達成のまま", () => {
  const stored = new Map([["power_1e8", { achieved_at: 100, seen: 1 }]]);
  const r = byKey(evaluateMilestones({ linked: true, player: { power: 9e7 } }, stored));
  assert.equal(r.power_1e8.done, true);
  assert.equal(r.power_1e8.achieved_at, 100);
});

function fakeDb({ stored = [], link = null, watch = 0, ranks = [] } = {}) {
  const calls = [];
  const rows = new Map(stored.map(r => [r.key, { ...r }]));
  const stmt = (sql, args = []) => ({
    sql, args,
    bind: (...a) => stmt(sql, a),
    async run() {
      calls.push(sql);
      if (sql.startsWith("INSERT OR IGNORE INTO user_milestones")) { if (rows.has(args[1])) return { meta: { changes: 0 } }; rows.set(args[1], { key: args[1], achieved_at: args[2], seen: args[3] ?? 0 }); return { meta: { changes: 1 } }; }
      if (sql.startsWith("UPDATE user_milestones SET seen = 1")) for (const r of rows.values()) r.seen = 1;
      return { meta: { changes: 0 } };
    },
    async all() { calls.push(sql); if (sql.includes("FROM user_milestones")) return { results: [...rows.values()] }; if (sql.includes("kingdom_ranking_current")) return { results: ranks }; return { results: [] }; },
    async first() { calls.push(sql); if (sql.includes("user_player_links")) return link; if (sql.includes("player_watchlists")) return { n: watch }; return null; }
  });
  return { calls, rows, prepare: sql => stmt(sql), async batch(list) { for (const s of list) await s.run(); return []; } };
}

test("loadMilestones：新しい達成を記録し、ホームでは未読、画面で既読", async () => {
  resetMilestoneSchemaCache();
  const db = fakeDb({ link: { governor_id: "9", kingdom_id: 1524, kid: 1524, power: 1.2e8, town_center_level: 36 }, watch: 3, ranks: [{ board: "personal_power", rank: 4, score: 1.2e8 }] });
  const home = await loadMilestones(db, { user_id: "u1", discord_id: "d1", role: "BASIC" }, { now: 500 });
  assert.equal(home.total, MILESTONES.filter(m => !m.hiddenUntilDone).length, "持っていない限定バッジは数に入れない");
  const unseen = home.unseen.map(u => u.key).sort();
  assert.deepEqual(unseen, ["gold_1", "governor_link", "kingdom_top10", "power_1e8", "watcher"].sort());
  assert.equal(db.rows.get("first_step").seen, 1); // ログインだけでは「新しく達成」に出さない
  // 秘境・TOP10は1クエリ（主キーで引く）
  const rankQ = db.calls.filter(s => s.includes("kingdom_ranking_current"));
  assert.equal(rankQ.length, 1);
  assert.match(rankQ[0], /WHERE kid = \? AND target_type = 'PLAYER' AND target_id = \? AND board IN/);
  const page = await loadMilestones(db, { user_id: "u1", discord_id: "d1", role: "BASIC" }, { now: 600, markSeen: true });
  assert.equal(page.unseen.length, 5); // 画面ではこの回だけ「新しく達成」を見せる
  const again = await loadMilestones(db, { user_id: "u1", discord_id: "d1", role: "BASIC" }, { now: 700 });
  assert.equal(again.unseen.length, 0);
  assert.equal(byKey(again.items).power_1e8.achieved_at, 500);
});

test("共有の記録は1回だけ、知らないキーは記録しない", async () => {
  resetMilestoneSchemaCache();
  const db = fakeDb();
  assert.equal(await recordMilestone(db, "u1", "herald", 10), true);
  assert.equal(await recordMilestone(db, "u1", "herald", 11), false);
  assert.equal(await recordMilestone(db, "u1", "nope", 11), false);
  const r = await loadMilestones(db, { user_id: "u1", role: "BASIC" }, { now: 20 });
  assert.equal(byKey(r.items).herald.done, true);
});

test("画面・ホーム・メニュー・共有ボタンの配線", () => {
  const html = renderMilestonesPage();
  assert.match(html, /<title>マイルストーン \| EagleEye<\/title>/);
  assert.match(html, /\/api\/milestones\?seen=1/);
  assert.match(html, /next=%2Fmilestones/);
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(index, /url\.pathname === "\/milestones"\) return eagleEyeHtmlResponse\(renderMilestonesPage\(\)\)/);
  assert.match(index, /milestonesAvailableFor\(role\) \? `<a class="ee-milestone-card ee-milestone-live" href="\/milestones"/);
  assert.match(index, /<span class="ee-milestone-status">準備中<\/span>/);
  assert.doesNotMatch(index, /デイリー・累計目標と報酬/);
  const ui = readFileSync(new URL("../src/eagleeye-ui.js", import.meta.url), "utf8");
  assert.match(ui, /href="\/milestones" data-other-key="milestones"/);
  assert.match(ui, /milestonesAvailableFor\(auth\.role\)/);
  const share = readFileSync(new URL("../src/compare-share.js", import.meta.url), "utf8");
  assert.match(share, /\/api\/milestones\/share", \{ method: "POST"/);
});

test("公開前：オーナーだけ見られ、ほかは準備中（API 403・メニューは押せない）", async () => {
  const { milestonesAvailableFor, MILESTONES_PUBLIC } = await import("../src/milestones.js");
  const { renderEagleEyeOtherMenu } = await import("../src/eagleeye-ui.js");
  assert.equal(MILESTONES_PUBLIC, false);
  assert.equal(milestonesAvailableFor("OWNER"), true);
  for (const r of ["BASIC", "ADVANCED", "VIP", "ADMIN", null]) assert.equal(milestonesAvailableFor(r), false, String(r));
  assert.match(renderEagleEyeOtherMenu({ auth: { role: "OWNER" } }), /href="\/milestones"/);
  const basic = renderEagleEyeOtherMenu({ auth: { role: "ADVANCED" } });
  assert.doesNotMatch(basic, /href="\/milestones"/);
  assert.match(basic, /準備中/);
  assert.doesNotMatch(renderEagleEyeOtherMenu({ auth: null }), /href="\/milestones"/);
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(index, /if \(!milestonesAvailableFor\(auth\.role\)\) return json\(\{ ok: false, error: "COMING_SOON" \}, 403\)/);
  assert.match(renderMilestonesPage(), /x\.s === 403/);
});

test("ホームの主要メニュー：ログイン中は下のバーと重ならない6つ、自分の領主を先に", () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const signed = index.slice(index.indexOf('data-menu="signed-in"'), index.indexOf("</section>", index.indexOf('data-menu="signed-in"')));
  for (const href of ["/my-player", "/kvk", "/kingdom-catalog", "/watchlist", "/settings/theme", "/news"]) assert.ok(signed.includes(`href="${href}"`), href);
  for (const href of ["/kingdom/rankings", "/players", "/status", "/hero-catalog"]) assert.ok(!signed.includes(`href="${href}"`), href);
  assert.ok(index.indexOf('id="homeMe"') < index.indexOf('data-menu="signed-in"'), "ログイン中は自分の領主が先");
  assert.match(index, /<section class="ee-home-tools" id="tools"/);
  assert.match(index, /ee-welcome-link\$\{session \? " ee-welcome-slim" : ""\}/);
});
