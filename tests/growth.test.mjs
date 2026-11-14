// 成長の計測：PVビーコン（1文・ボット除外・同一サイトのみ）、集計、収益試算（仮定と実測を分ける）、基準の保存、オーナー限定。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  routeGroupOf, pvRows, isLikelyBot, handlePageViewBeacon, recordPageView, resetGrowthSchemaCache, pageViewBeaconScript,
  summarizeTraffic, summarizeActive, simulateRevenue, calendarVisitors, headline, loadGrowth, renderGrowthPage, saveBaseline, saveMeasuredRevenue
} from "../src/growth.js";

const NOW = Date.parse("2026-11-07T12:00:00+09:00");
const day = i => new Date(NOW + 9 * 3600e3 - i * 86400e3).toISOString().slice(0, 10);

function fakeDb({ traffic = [], active = [] } = {}) {
  const calls = [];
  const table = new Map(traffic.map(r => [r.day + "|" + r.metric + "|" + r.auth, { ...r }]));
  const baselines = [], settings = new Map();
  const stmt = (sql, args = []) => ({
    sql, args,
    bind: (...a) => stmt(sql, a),
    async run() {
      calls.push({ sql, args });
      if (sql.startsWith("INSERT INTO traffic_daily")) {
        for (let i = 0; i < args.length; i += 3) { const k = args.slice(i, i + 3).join("|"); const r = table.get(k) || { day: args[i], metric: args[i + 1], auth: args[i + 2], n: 0 }; r.n++; table.set(k, r); }
      }
      if (sql.startsWith("INSERT INTO growth_baselines")) baselines.unshift({ baseline_id: baselines.length + 1, label: args[0], created_at: args[1], summary_json: args[2] });
      if (sql.startsWith("INSERT INTO growth_settings")) settings.set("revenue_measured", args[0]);
      return { meta: {} };
    },
    async all() {
      calls.push({ sql, args });
      if (sql.includes("FROM traffic_daily")) return { results: [...table.values()].filter(r => r.day >= args[0]) };
      if (sql.includes("FROM user_daily_active")) return { results: active.filter(r => r.day >= args[0]) };
      if (sql.includes("FROM growth_baselines")) return { results: baselines };
      if (sql.includes("FROM growth_settings")) return { results: [...settings].map(([key, value]) => ({ key, value })) };
      return { results: [] };
    },
    async first() { calls.push({ sql, args }); return null; }
  });
  return { calls, table, baselines, prepare: sql => stmt(sql), async batch(list) { for (const s of list) await s.run(); return []; } };
}

const req = (body, headers = {}) => new Request("https://eagleeye-ks.com/api/pv", {
  method: "POST",
  headers: { "content-type": "application/json", origin: "https://eagleeye-ks.com", "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1", ...headers },
  body: JSON.stringify(body)
});
const sameOrigin = r => r.headers.get("origin") === "https://eagleeye-ks.com";

test("ページの種類：管理・ログインは別、知らないページは other", () => {
  assert.equal(routeGroupOf("/"), "home");
  assert.equal(routeGroupOf("/player-watchlist"), "watchlist");
  assert.equal(routeGroupOf("/player/123"), "players");
  assert.equal(routeGroupOf("/kingdom-watchlist"), "watchlist");
  assert.equal(routeGroupOf("/kingdom/1524"), "kingdom");
  assert.equal(routeGroupOf("/kvk/matchups"), "kvk");
  assert.equal(routeGroupOf("/owner/growth"), "staff");
  assert.equal(routeGroupOf("/login"), "login");
  assert.equal(routeGroupOf("/zzz"), "other");
});

test("1回のPVで足す行：初回だけ訪問者・再訪の印、管理画面とスタッフは PV だけ", () => {
  assert.deepEqual(pvRows({ path: "/kvk", signedIn: true, flags: {} }), [["pv:kvk", "in"]]);
  const first = pvRows({ path: "/", signedIn: false, ads: true, flags: { v: true, w: true, m: true, s: true, r: 1 } });
  assert.deepEqual(first, [["pv:home", "out"], ["adpv", "out"], ["session", "out"], ["visitor", "out"], ["ret:1d", "out"], ["visitor_w", "out"], ["visitor_m", "out"]]);
  assert.deepEqual(pvRows({ path: "/", flags: { v: true, r: -1 } }).map(r => r[0]), ["pv:home", "visitor", "ret:new"]);
  assert.deepEqual(pvRows({ path: "/", flags: { v: true, r: 40 } }).map(r => r[0]), ["pv:home", "visitor", "ret:old"]);
  assert.deepEqual(pvRows({ path: "/owner", flags: { v: true, s: true } }), [["pv:staff", "out"]]);
  assert.deepEqual(pvRows({ path: "/", ads: true, staff: true, flags: { v: true, s: true } }), [["pv:staff", "out"]]);
});

test("ビーコン：1文だけ書く・ボットと他サイトは書かない・APIのパスは数えない", async () => {
  resetGrowthSchemaCache();
  const db = fakeDb();
  const env = { DB: db };
  let res = await handlePageViewBeacon(req({ p: "/kvk", a: 0, f: { v: 1, s: 1, r: 3 } }, { cookie: "eagleeye_session=x" }), env, { isSameOrigin: sameOrigin, nowMs: NOW });
  assert.equal(res.status, 200);
  const writes = db.calls.filter(c => c.sql.startsWith("INSERT INTO traffic_daily"));
  assert.equal(writes.length, 1, "1回のPVで INSERT は1文");
  assert.match(writes[0].sql, /ON CONFLICT\(day, metric, auth\) DO UPDATE SET n = n \+ 1/);
  assert.equal(db.table.get(day(0) + "|pv:kvk|in").n, 1);
  assert.equal(db.table.get(day(0) + "|ret:7d|in").n, 1);
  // 2回目のPV（同じ日）は掃除の DELETE をしない
  const before = db.calls.length;
  await handlePageViewBeacon(req({ p: "/kvk", f: {} }), env, { isSameOrigin: sameOrigin, nowMs: NOW });
  assert.equal(db.calls.slice(before).filter(c => c.sql.startsWith("DELETE")).length, 0);
  assert.equal(db.table.get(day(0) + "|pv:kvk|out").n, 1);

  const n = db.calls.length;
  assert.equal((await handlePageViewBeacon(req({ p: "/" }, { "user-agent": "Googlebot/2.1" }), env, { isSameOrigin: sameOrigin, nowMs: NOW })).status, 200);
  assert.equal((await handlePageViewBeacon(req({ p: "/" }, { origin: "https://evil.example" }), env, { isSameOrigin: sameOrigin, nowMs: NOW })).status, 403);
  assert.equal((await handlePageViewBeacon(req({ p: "/api/me" }), env, { isSameOrigin: sameOrigin, nowMs: NOW })).status, 400);
  assert.equal((await handlePageViewBeacon(new Request("https://eagleeye-ks.com/api/pv"), env, { isSameOrigin: sameOrigin })).status, 405);
  assert.equal(db.calls.length, n, "はじいたときは D1 に触らない");
  assert.equal(isLikelyBot(""), true);
});

test("ブラウザ側のスクリプト：1ページ1回・個人IDは送らない・管理画面を開いたブラウザはスタッフ扱い", () => {
  const s = pageViewBeaconScript();
  assert.doesNotThrow(() => new Function(s.replace(/<\/?script>/g, "")));
  assert.match(s, /if\(window\.__eePv\)return/);
  assert.match(s, /navigator\.webdriver/);
  assert.match(s, /sendBeacon\("\/api\/pv"/);
  assert.match(s, /\/\^\\\/\(owner\|admin\)\(\\\/\|\$\)\//);
  // 個人のID（user_id・Discord のID）は送らない。SNSの名前としての "discord" は Cookie の印に使う（11/14〜）。
  assert.doesNotMatch(s, /user_id|discord_id|discordId|governor|Math\.random/);
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(index, /const telemetry = clientTelemetryScript\(\) \+ pageViewBeaconScript\(\);/);
  assert.match(index, /url\.pathname === "\/api\/pv"\) return await handlePageViewBeacon\(request, env, \{ isSameOrigin: isSameOriginRequest, onView: path => recordMissionFromView\(request, env, path\) \}\)/);
});

test("集計：PV・訪問者・再訪、管理画面は PV から除く、ページ別", () => {
  const rows = [
    { day: day(1), metric: "pv:home", auth: "out", n: 30 }, { day: day(1), metric: "pv:kvk", auth: "in", n: 20 },
    { day: day(1), metric: "pv:staff", auth: "in", n: 99 }, { day: day(1), metric: "pv:login", auth: "out", n: 5 },
    { day: day(1), metric: "adpv", auth: "out", n: 30 }, { day: day(1), metric: "visitor", auth: "out", n: 10 },
    { day: day(1), metric: "session", auth: "out", n: 12 }, { day: day(1), metric: "ret:new", auth: "out", n: 6 }, { day: day(1), metric: "ret:1d", auth: "out", n: 4 }
  ];
  const t = summarizeTraffic(rows, { days: 10, nowMs: NOW });
  const d = t.daily[1];
  assert.equal(d.pv, 55);
  assert.equal(d.pvIn, 20);
  assert.equal(d.revenuePv, 50, "ログイン画面・管理画面は広告を出さないので除く");
  assert.equal(d.adPv, 30);
  assert.equal(d.visitors, 10);
  assert.equal(t.firstDay, day(1));
  assert.deepEqual(t.groups.kvk, { in: 20, out: 0 });
});

test("ログインユーザー：DAU/WAU/MAU と翌日・7日後の継続", () => {
  const active = [];
  for (let i = 0; i < 20; i++) { active.push({ day: day(i), user_id: "a" }); if (i % 2 === 0) active.push({ day: day(i), user_id: "b" }); }
  active.push({ day: day(25), user_id: "c" });
  const a = summarizeActive(active, { nowMs: NOW });
  assert.equal(a.dauToday, 2);
  assert.equal(a.wau, 2);
  assert.equal(a.mau, 3);
  assert.ok(a.d1.base > 0 && a.d1.rate > 0 && a.d1.rate < 1);
  assert.equal(summarizeActive([], { nowMs: NOW }).d1.rate, null);
});

test("暦の週・月の訪問者：計測を始める前の期間は出さない", () => {
  const daily = Array.from({ length: 62 }, (_, i) => ({ day: day(i), weekly: i < 3 ? 2 : 1, monthly: 1 }));
  // 2026-11-07 は土曜 → 今週は月曜(11/02)から6日分
  const all = calendarVisitors(daily, day(61));
  assert.equal(all.weekVisitors, 2 * 3 + 3);
  assert.equal(all.lastWeekVisitors, 7);
  assert.equal(all.monthVisitors, 7);
  assert.equal(all.lastMonthVisitors, 31);
  const fresh = calendarVisitors(daily, day(2));
  assert.equal(fresh.lastWeekVisitors, null);
  assert.equal(fresh.lastMonthVisitors, null);
});

test("収益の試算：仮定のRPMと実測RPMを分ける", () => {
  const s = simulateRevenue({ revenuePvPerDay: 1000, adPvPerDay: 400 });
  assert.equal(s.basis, "assumed");
  assert.equal(s.measuredRpm, null);
  assert.deepEqual(s.rows.find(r => r.rpm === 200), { rpm: 200, nowAdOnly: 2400, allPages: 6000, needPvPerDay: 16667 });
  assert.equal(s.needPvPerDay, 16667);
  assert.ok(Math.abs(s.gapRatio - 16.667) < 0.01);
  const m = simulateRevenue({ revenuePvPerDay: 1000, adPvPerDay: 400, measured: { yen: 500, adPv: 10000 } });
  assert.equal(m.basis, "measured");
  assert.equal(m.measuredRpm, 50);
  assert.equal(m.needPvPerDay, 66667);
});

test("画面：実測・試算の札、基準の保存と前後比較（因果ではない注意書き）", async () => {
  resetGrowthSchemaCache();
  const traffic = [];
  for (let i = 1; i <= 8; i++) traffic.push({ day: day(i), metric: "pv:home", auth: "out", n: 100 }, { day: day(i), metric: "visitor", auth: "out", n: 40 }, { day: day(i), metric: "session", auth: "out", n: 50 });
  const db = fakeDb({ traffic });
  const g = await loadGrowth(db, { nowMs: NOW });
  const h = headline(g);
  assert.equal(h.pvPerDay, 100);
  assert.equal(h.pvPerVisitor, 2.5);
  assert.equal(h.daysWithData, 7);
  let html = renderGrowthPage(g);
  assert.match(html, /<title>成長ダッシュボード \| EagleEye<\/title>/);
  assert.match(html, /class="tag m">実測/);
  assert.match(html, /class="tag e">試算/);
  assert.match(html, /まだ基準がありません/);
  assert.doesNotMatch(html, /計測はまだ/);
  await saveBaseline(db, "作戦リリース前\n", g, NOW);
  assert.equal(db.baselines[0].label, "作戦リリース前");
  html = renderGrowthPage(await loadGrowth(db, { nowMs: NOW }));
  assert.match(html, /基準「作戦リリース前」/);
  assert.match(html, /施策の効果とは限りません/);
  await assert.rejects(() => saveMeasuredRevenue(db, { yen: -1, from: day(3), to: day(1) }), /INVALID_YEN/);
  await assert.rejects(() => saveMeasuredRevenue(db, { yen: 10, from: day(1), to: day(3) }), /INVALID_RANGE/);
  await saveMeasuredRevenue(db, { yen: 300, from: day(3), to: day(1), adPv: 3000 });
  assert.match(renderGrowthPage(await loadGrowth(db, { nowMs: NOW })), /100円/);
  // 画面を開いたときの読み取りは8文だけ（アクセス4文＋今日の成果用の小さい表4文）
  const reads = db.calls.length;
  await loadGrowth(db, { nowMs: NOW });
  assert.equal(db.calls.length - reads, 8);
});

test("オーナーだけ：画面・保存APIの入口", () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const page = index.slice(index.indexOf('url.pathname === "/owner/growth"'), index.indexOf('url.pathname === "/owner/growth"') + 300);
  assert.match(page, /await requireOwner\(request, env\)/);
  const api = index.slice(index.indexOf("async function handleOwnerGrowthApi"), index.indexOf("async function handleOwnerGrowthApi") + 600);
  assert.match(api, /request\.method !== "POST"/);
  assert.match(api, /await requireOwner\(request, env\)/);
  assert.match(api, /isSameOriginRequest\(request\)/);
  assert.match(index, /"href": "\/owner\/growth",\s*"title": "成長ダッシュボード"/, "オーナー管理メニュー（成長・集客）にある");
});

test("PVの記録：失敗しても例外を外へ出さない（ページ表示を止めない）", async () => {
  resetGrowthSchemaCache();
  const broken = { prepare() { throw new Error("D1 down"); }, batch() { return Promise.reject(new Error("D1 down")); } };
  const res = await handlePageViewBeacon(req({ p: "/" }), { DB: broken }, { isSameOrigin: sameOrigin, nowMs: NOW });
  assert.equal(res.status, 503);
  resetGrowthSchemaCache();
  assert.equal(await recordPageView(fakeDb(), { path: "/", flags: { v: 1 } }, { nowMs: NOW }), 3); // PV・訪問者・新規
});

test("来た元：検索・SNS・Discord・AI・ほかのサイト・直接に分ける。?ref= は決まった名前だけ", async () => {
  const { classifyTrafficSource: c } = await import("../src/growth.js");
  const self = "eagleeye-ks.com";
  assert.equal(c({ refHost: "www.google.co.jp", selfHost: self }), "search");
  assert.equal(c({ refHost: "search.yahoo.co.jp", selfHost: self }), "search");
  assert.equal(c({ refHost: "www.bing.com", selfHost: self }), "search");
  assert.equal(c({ refHost: "t.co", selfHost: self }), "x");
  assert.equal(c({ refHost: "discord.com", selfHost: self }), "discord");
  assert.equal(c({ refHost: "gemini.google.com", selfHost: self }), "ai", "Gemini は検索ではなくAI");
  assert.equal(c({ refHost: "chatgpt.com", selfHost: self }), "ai");
  assert.equal(c({ refHost: "altema.jp", selfHost: self }), "site");
  assert.equal(c({ refHost: "", selfHost: self }), "direct");
  assert.equal(c({ refHost: "eagleeye-ks.com", selfHost: self }), "direct");
  assert.equal(c({ refHost: "evil.example<script>", selfHost: self }), "site");
  assert.equal(c({ tag: "discord" }), "discord");
  assert.equal(c({ tag: "twitter", refHost: "www.google.com" }), "x", "?ref= が優先");
  assert.equal(c({ tag: "kvk-campaign" }), "tagged");
});

test("来た元は新しいセッションの時だけ、分類の名前と最初のページの種類だけを記録（スタッフは数えない）", async () => {
  const { pvRows, summarizeTraffic, sourcesCard, pageViewBeaconScript } = await import("../src/growth.js");
  assert.deepEqual(pvRows({ path: "/k/1", signedIn: false, flags: { s: true }, source: "search" }), [["pv:kingdom", "out"], ["session", "out"], ["src:search", "out"], ["land:kingdom", "out"]]);
  assert.deepEqual(pvRows({ path: "/k/1", signedIn: false, flags: {}, source: "search" }), [["pv:kingdom", "out"]], "セッションの途中は記録しない");
  assert.deepEqual(pvRows({ path: "/k/1", signedIn: false, flags: { s: true }, source: "https://x.example/" }), [["pv:kingdom", "out"], ["session", "out"]], "決まった名前以外は保存しない");
  assert.deepEqual(pvRows({ path: "/owner", signedIn: true, flags: { s: true }, source: "search", staff: true }), [["pv:staff", "in"]]);
  const nowMs = Date.parse("2026-11-08T12:00:00+09:00");
  const t = summarizeTraffic([
    { day: "2026-11-08", metric: "src:search", auth: "out", n: 3 }, { day: "2026-11-08", metric: "src:discord", auth: "out", n: 2 },
    { day: "2026-10-20", metric: "src:search", auth: "out", n: 5 }, { day: "2026-11-08", metric: "land:kingdom", auth: "out", n: 4 }
  ], { days: 62, nowMs });
  assert.deepEqual(t.sources.last7, { search: 3, discord: 2 });
  assert.deepEqual(t.sources.all, { search: 8, discord: 2 });
  assert.deepEqual(t.landing.last7, { kingdom: 4 });
  const card = sourcesCard(t);
  assert.match(card, /検索（Google・Yahoo!・Bingなど）<\/td><td>3<\/td><td>60%<\/td><td>8<\/td>/);
  assert.match(card, /<td>王国<\/td><td>4<\/td>/);
  // ブラウザからはホスト名だけ（URLの残りは送らない）、新しいセッションの時だけ
  const js = pageViewBeaconScript();
  assert.match(js, /if\(f\.s\)\{try\{var rh=document\.referrer\?new URL\(document\.referrer\)\.hostname:""/);
  assert.doesNotMatch(js, /o\.rh=document\.referrer/);
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(index, /sources: growth\.traffic\?\.sources, landing: growth\.traffic\?\.landing/);
});

test("ページの種類：公開の王国ページ /k/・同盟ページ /a/ は「王国」、英雄ページ /heroes は「英雄」", async () => {
  const { routeGroupOf } = await import("../src/growth.js");
  assert.equal(routeGroupOf("/k/1524"), "kingdom");
  assert.equal(routeGroupOf("/a/1524/153300050"), "kingdom");
  assert.equal(routeGroupOf("/kingdoms"), "kingdom");
  assert.equal(routeGroupOf("/heroes/alcar"), "hero");
  assert.equal(routeGroupOf("/kvk/s23"), "kvk");
  assert.equal(routeGroupOf("/about"), "guide");
});

test("プライバシーポリシー：アクセスの集計（来た元はホスト名だけ送り、回数だけ保存）を書いている", () => {
  const legal = readFileSync(new URL("../src/legal-pages.js", import.meta.url), "utf8");
  assert.match(legal, /<b>アクセスの集計<\/b>：/);
  assert.match(legal, /来た元のURLやホスト名、個人を区別するIDは保存しません。検索した言葉などURLの中身は送信しません。/);
  assert.doesNotMatch(legal, /画面の設定を保存します。サーバーには送信しません。/);
});

test("今日の成果：今日・昨日・7日平均、登録まわりとログインの流れ。作業用アカウントは数えない", async () => {
  const { loadDailyEvents, todaySummary } = await import("../src/growth.js");
  const today = day(0), y = day(1);
  const calls = [];
  const db = { prepare: sql => ({ bind: (...a) => ({ all: async () => {
    calls.push(sql);
    if (sql.includes("FROM users")) return { results: [{ d: today, n: 3 }, { d: y, n: 1 }] };
    if (sql.includes("user_player_links")) return { results: [{ d: today, n: 2 }] };
    if (sql.includes("api_pool_keys")) return { results: [{ d: today, n: 1 }] };
    if (sql.includes("funnel_daily")) return { results: [{ d: today, step: "login_start", n: 5 }, { d: today, step: "google_start", n: 1 }, { d: today, step: "discord_return", n: 3 }, { d: today, step: "login_new", n: 2 }, { d: today, step: "login_returning", n: 1 }, { d: today, step: "login_error", n: 1 }] };
    return { results: [] };
  } }) }) };
  const ev = await loadDailyEvents(db, { nowMs: NOW });
  assert.equal(calls.length, 4, "小さい表を4文だけ");
  assert.ok(calls.filter(q => /FROM users|user_player_links/.test(q)).every(q => q.includes("<> 'claude-agent'")), "作業用アカウントは数えない");
  assert.deepEqual([ev[today].signup, ev[today].linked, ev[today].keyed, ev[y].signup], [3, 2, 1, 1]);
  const daily = Array.from({ length: 8 }, (_, i) => ({ day: day(i), pv: i === 0 ? 50 : 70, visitors: i === 0 ? 9 : 10, pvIn: 0, ret1: 0, ret7: 0, ret30: 0, retOld: 0 }));
  const t = todaySummary({ traffic: { daily }, events: ev });
  assert.deepEqual(t.signup, { today: 3, yesterday: 1, avg7: 1 / 7 });
  assert.deepEqual(t.pv, { today: 50, yesterday: 70, avg7: 70 });
  assert.deepEqual(t.funnel, { start: 6, back: 3, done: 3, error: 1 });
  const html = renderGrowthPage({ traffic: { daily: daily.concat(Array.from({ length: 54 }, (_, i) => ({ day: day(i + 8), pv: 0, visitors: 0, pvIn: 0, ret1: 0, ret7: 0, ret30: 0, retOld: 0, weekly: 0, monthly: 0, sessions: 0, revenuePv: 0, adPv: 0 }))), groups: {}, sources: { all: {}, last7: {} }, landing: { all: {}, last7: {} } }, active: { dauToday: 0, dauAvg7: 0, wau: 0, mau: 0, d1: { kept: 0, base: 0, rate: null }, d7: { kept: 0, base: 0, rate: null } }, events: ev, baselines: [], nowMs: NOW });
  assert.match(html, /id="today"><h2>今日の成果/);
  assert.match(html, /<small>新規登録<\/small><b class="up">3<\/b><em>昨日 1・7日平均 0\.1/, "7日平均より多ければ緑");
  assert.match(html, /押した <b>6<\/b><\/span>→<span>画面から戻った <b>3<\/b><\/span>→<span>完了 <b>3<\/b><\/span><span class="down">失敗 <b>1<\/b>/);
  assert.ok(html.indexOf('id="today"') < html.indexOf('id="week"'), "今日の成果がいちばん上");
  assert.match(html, /<details class="card"><summary>広告収益の試算/, "収益・比較・作戦は閉じておく");
});
