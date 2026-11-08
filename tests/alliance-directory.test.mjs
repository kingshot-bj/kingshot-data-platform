// 同盟の公開ページと、余裕がある日だけ動く全王国の同盟一覧の収集。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  sweepBudget, allianceRowsFromEntries, runAllianceSweep, loadPublicAlliance, renderPublicAlliancePage,
  loadAllianceSitemapPaths, resetAllianceDirectorySchemaCache, ALLIANCE_SWEEP_INTERVAL_SECONDS
} from "../src/alliance-directory.js";
import { shell, renderPublicKingdomPage } from "../src/public-pages.js";

const QUOTA = { reads: 25e9, writes: 5e7 };
const NOW = Date.parse("2026-12-10T05:00:00Z"); // 31日の月の10日目
const now = Math.floor(NOW / 1000);
const d1 = (read, write = 0) => ({ checkedAt: now - 600, monthRowsRead: read, monthRowsWritten: write });
const api = (used, quota = 165000) => ({ checkedAt: now - 600, used, quota });

test("余裕の判定：今月のD1が日割りの枠の8割以内・APIキー3割未満のときだけ。分からないときは動かない", () => {
  const allowed = 25e9 * (10 / 31) * 0.8; // 約64.5億
  assert.deepEqual(sweepBudget({ d1: d1(5e9), api: api(1000), quota: QUOTA, nowMs: NOW }), { ok: true });
  assert.equal(sweepBudget({ d1: d1(allowed + 1), api: api(1000), quota: QUOTA, nowMs: NOW }).reason, "D1_READS_TIGHT");
  assert.equal(sweepBudget({ d1: d1(26e9), api: api(1000), quota: QUOTA, nowMs: NOW }).reason, "D1_READS_TIGHT", "月の枠を超えた月は止まる");
  assert.equal(sweepBudget({ d1: d1(1e9, 2e7), api: api(1000), quota: QUOTA, nowMs: NOW }).reason, "D1_WRITES_TIGHT");
  assert.equal(sweepBudget({ d1: d1(1e9), api: api(60000), quota: QUOTA, nowMs: NOW }).reason, "API_BUSY");
  assert.equal(sweepBudget({ d1: null, api: api(1), quota: QUOTA, nowMs: NOW }).reason, "D1_USAGE_UNKNOWN");
  assert.equal(sweepBudget({ d1: { ...d1(1), error: "x" }, api: api(1), quota: QUOTA, nowMs: NOW }).reason, "D1_USAGE_UNKNOWN");
  assert.equal(sweepBudget({ d1: { ...d1(1), checkedAt: now - 5 * 3600 }, api: api(1), quota: QUOTA, nowMs: NOW }).reason, "D1_USAGE_UNKNOWN", "古い確認結果では動かない");
  assert.equal(sweepBudget({ d1: d1(1), api: null, quota: QUOTA, nowMs: NOW }).reason, "API_USAGE_UNKNOWN");
});

test("ランキングの行から同盟を取り出す（重複・IDなしは除く、上位50まで）", () => {
  const rows = allianceRowsFromEntries([{ aid: "153300050.0", abbr: "TNC", name: "にゃっぷ！", rank: 1, score: 1.39e10 }, { aid: "153300050", rank: 1 }, { abbr: "X" }, { alliance_id: 7, alliance_abbr: "Pen", alliance_name: "はんぺん", ranking: 2, value: 1.1e10 }]);
  assert.deepEqual(rows, [{ aid: "153300050", abbr: "TNC", name: "にゃっぷ！", rank: 1, power: 13900000000 }, { aid: "7", abbr: "Pen", name: "はんぺん", rank: 2, power: 11000000000 }]);
  assert.equal(allianceRowsFromEntries(Array.from({ length: 80 }, (_, i) => ({ aid: i + 1, rank: i + 1 }))).length, 50);
});

function fakeDb({ kids = [1, 2, 3], state = null } = {}) {
  const calls = [], dir = new Map();
  let st = state;
  const stmt = (sql, args = []) => ({
    sql, args, bind: (...a) => stmt(sql, a),
    async run() {
      calls.push(sql);
      if (sql.startsWith("INSERT INTO ops_alert_state")) st = JSON.parse(args[1]);
      if (sql.startsWith("INSERT INTO alliance_directory")) for (let i = 0; i < args.length; i += 7) dir.set(args[i] + ":" + args[i + 1], { kid: args[i], aid: args[i + 1], abbr: args[i + 2], name: args[i + 3], power: args[i + 4], rank: args[i + 5], updated_at: args[i + 6] });
      return { meta: {} };
    },
    async first() { calls.push(sql); if (sql.includes("FROM ops_alert_state")) return st ? { value: JSON.stringify(st) } : null; if (sql.includes("FROM alliance_directory WHERE kid = ? AND aid = ?")) return dir.get(args[0] + ":" + args[1]) || null; return null; },
    async all() {
      calls.push(sql);
      if (sql.includes("FROM kingdom_catalog WHERE kid > ?")) return { results: kids.filter(k => k > args[0]).slice(0, args[1]).map(kid => ({ kid })) };
      if (sql.includes("FROM alliance_directory WHERE kid = ? ORDER BY rank")) return { results: [...dir.values()].filter(r => r.kid === args[0]).sort((a, b) => a.rank - b.rank) };
      if (sql.includes("FROM alliance_directory WHERE rank <= ?")) return { results: [...dir.values()].filter(r => r.rank <= args[0]) };
      return { results: [] };
    }
  });
  return { calls, dir, get state() { return st; }, prepare: sql => stmt(sql), async batch(list) { for (const s of list) await s.run(); return []; } };
}

test("収集：余裕がある時間だけ100王国ずつ進み、一巡したら7日待つ。余裕がなければAPIを呼ばない", async () => {
  resetAllianceDirectorySchemaCache();
  const db = fakeDb({ kids: [1, 2, 3] });
  const env = { DB: db };
  const called = [];
  const collect = async (_env, req) => { called.push(req); return { result: { data: { boards: [{ aid: req.targetId + "01", abbr: "A" + req.targetId, name: "同盟" + req.targetId, rank: 1, score: 100 }] } } }; };
  const extractEntries = p => p.boards;
  // 余裕なし → APIを呼ばない
  let r = await runAllianceSweep(env, { collect, extractEntries, d1: d1(26e9), api: api(1), quota: QUOTA, nowMs: NOW });
  assert.equal(r.reason, "D1_READS_TIGHT");
  assert.equal(called.length, 0);
  assert.equal(db.state.lastReason, "D1_READS_TIGHT");
  // 余裕あり → 2王国ずつ
  r = await runAllianceSweep(env, { collect, extractEntries, d1: d1(1e9), api: api(1), quota: QUOTA, nowMs: NOW, perRun: 2 });
  assert.equal(r.kingdoms, 2);
  assert.deepEqual(called.map(c => [c.path, c.query.board, c.query.limit, c.purpose]), [["/kingdoms/1/ranks", "alliance_power", 50, "ALLIANCE_DIRECTORY"], ["/kingdoms/2/ranks", "alliance_power", 50, "ALLIANCE_DIRECTORY"]]);
  assert.equal(db.state.cursor, 2);
  assert.equal(db.dir.get("1:101").name, "同盟1");
  r = await runAllianceSweep(env, { collect, extractEntries, d1: d1(1e9), api: api(1), quota: QUOTA, nowMs: NOW + 3600e3, perRun: 2 });
  assert.equal(r.kingdoms, 1);
  r = await runAllianceSweep(env, { collect, extractEntries, d1: d1(1e9), api: api(1), quota: QUOTA, nowMs: NOW + 7200e3, perRun: 2 });
  assert.equal(r.completed, true);
  assert.equal(db.state.cursor, 0);
  const before = called.length;
  r = await runAllianceSweep(env, { collect, extractEntries, d1: d1(1e9), api: api(1), quota: QUOTA, nowMs: NOW + 3 * 86400e3 });
  assert.equal(r.reason, "RECENTLY_COMPLETED");
  const later = NOW + 7200e3 + ALLIANCE_SWEEP_INTERVAL_SECONDS * 1000 + 1000;
  r = await runAllianceSweep(env, { collect, extractEntries, d1: { ...d1(1e9), checkedAt: Math.floor(later / 1000) - 600 }, api: { ...api(1), checkedAt: Math.floor(later / 1000) - 600 }, quota: QUOTA, nowMs: later, perRun: 2 });
  assert.equal(r.kingdoms, 2, "7日たったら次の一巡");
  assert.ok(called.length > before);
  // 取得に失敗したら、その王国から次の回にやり直す
  const failing = async () => { const e = new Error("boom"); e.status = 503; throw e; };
  const db2 = fakeDb({ kids: [5, 6] });
  r = await runAllianceSweep({ DB: db2 }, { collect: failing, extractEntries, d1: d1(1e9), api: api(1), quota: QUOTA, nowMs: NOW });
  assert.equal(r.failed, 1);
  assert.equal(db2.state.cursor, 0);
});

test("同盟の公開ページ：名前を出すのは王国の上位10人だけ、ほかは人数。ログイン後の詳細へ案内", () => {
  const a = { kid: 1524, aid: "153300050", abbr: "TNC", name: "にゃっぷ！", power: 1.39e10, powerRank: 1, killsRank: 3, kills: 5e8, updatedAt: 1794099356, inTop100: 30, topMembers: [{ rank: 1, name: "おーとオートAUTO！" }, { rank: 3, name: "<b>x</b>" }], hasMemberData: true, peers: [{ aid: "153300205.0", abbr: "Pen", name: "はんぺん", power: 1.18e10, rank: 2 }] };
  const html = renderPublicAlliancePage(a, { origin: "https://eagleeye-ks.com", shell });
  assert.match(html, /<title>にゃっぷ！［TNC］の戦力・ランキング（王国1524）｜キングショット \| EagleEye<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/eagleeye-ks\.com\/a\/1524\/153300050">/);
  assert.match(html, /王国の戦力TOP100に入っている人<\/small><b>30人/);
  assert.match(html, /おーとオートAUTO！/);
  assert.ok(!html.includes("<b>x</b>"), "名前はエスケープ");
  assert.match(html, /href="\/a\/1524\/153300205">Pen/);
  assert.match(html, /\/login\?next=%2Falliance%3Fkid%3D1524%26tag%3DTNC/);
  assert.match(renderPublicAlliancePage(a, { origin: "", signedIn: true, shell }), /href="\/alliance\?kid=1524&amp;tag=TNC">同盟の詳細を開く/);
  // メンバーのデータがない王国（ウォッチされていない）では、メンバー欄を出さない
  assert.doesNotMatch(renderPublicAlliancePage({ ...a, hasMemberData: false, inTop100: 0, topMembers: [] }, { origin: "", shell }), /<h2>メンバー<\/h2>/);
});

test("loadPublicAlliance：上位10人より下のメンバーの名前は渡さない", async () => {
  resetAllianceDirectorySchemaCache();
  const members = Array.from({ length: 30 }, (_, i) => ({ rank: i * 3 + 1, nick_name: "p" + i }));
  const db = { prepare: sql => ({ bind: () => ({
    first: async () => sql.includes("FROM alliance_directory WHERE kid = ? AND aid = ?") ? { kid: 1524, aid: "9", abbr: "T", name: "N", power: 5, rank: 4, updated_at: 1 } : null,
    all: async () => ({ results: sql.includes("personal_power") ? members : [] })
  }), run: async () => ({}) }), batch: async () => [] };
  const a = await loadPublicAlliance(db, 1524, "9");
  assert.equal(a.inTop100, 30);
  assert.deepEqual(a.topMembers.map(m => m.name), ["p0", "p1", "p2", "p3"]);
  assert.equal(await loadPublicAlliance(db, 1524, "abc"), null);
});

test("配線：/a/ のルート（見つからなければ404・noindex）、王国ページからのリンク、サイトマップ、1時間ごとの処理、オーナー画面", async () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(index, /url\.pathname\.match\(\/\^\\\/a\\\/\(\\d\{1,6\}\)\\\/\(\\d\{1,20\}\)\\\/\?\$\/\)/);
  assert.match(index, /async signedIn => \{ const data = await loadPublicAlliance\(env\.DB, kid, m\[2\]\)\.catch\(\(\) => null\); if \(!data\) return eagleEyeHtmlResponse\(publicShell\([\s\S]*?noindex: true \}\), 404\); return renderPublicAlliancePage/);
  assert.match(index, /loadAllianceSitemapPaths\(env\.DB\)/);
  assert.match(index, /runAllianceSweep\(env, \{ collect: collectMightPulseThroughGuards, extractEntries: extractKingdomRankingEntries, d1, api, quota: d1MonthlyQuota\(env\) \}\)/);
  assert.match(index, /renderOwnerTrafficPage\(\{ active, cf, d1, apiPool, funnel, top, sweep \}\)/);
  const kp = renderPublicKingdomPage(1524, { catalog: { kid: 1524 }, players: [], alliances: [{ rank: 1, abbr: "TNC", name: "にゃっぷ！", score: 1e10, aid: "153300050.0" }], matchup: null, score: null, growth: null }, { origin: "" });
  assert.match(kp, /href="\/a\/1524\/153300050"/);
  resetAllianceDirectorySchemaCache();
  const db = fakeDb();
  db.dir.set("1:5", { kid: 1, aid: "5", rank: 3 });
  db.dir.set("1:6", { kid: 1, aid: "6", rank: 11 });
  assert.deepEqual(await loadAllianceSitemapPaths(db), ["/a/1/5"]);
  const robots = (await import("../src/public-pages.js")).renderRobotsTxt("https://x");
  assert.doesNotMatch(robots, /Disallow: \/a\b/);
});
