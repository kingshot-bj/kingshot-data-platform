// オーナー用アクセス状況：ログインユーザーは1人1日1行、Cloudflare集計はトークンがある時だけ・トークンを画面に出さない。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { recordDailyActive, loadDailyActive, loadCloudflareTraffic, renderOwnerTrafficPage, jstDay } from "../src/traffic-stats.js";

function fakeDb() {
  const rows = new Map();
  const calls = [];
  return {
    calls, rows,
    prepare(sql) {
      return {
        bind(...args) { this.args = args; return this; },
        async run() {
          calls.push(sql);
          if (sql.startsWith("INSERT OR IGNORE")) { const [day, uid, role] = this.args; const k = day + ":" + uid; if (!rows.has(k)) rows.set(k, { day, user_id: uid, role }); }
          if (sql.startsWith("DELETE")) { for (const [k, r] of rows) if (r.day < this.args[0]) rows.delete(k); }
          return { meta: {} };
        },
        async all() {
          const since = this.args[0]; const agg = new Map();
          for (const r of rows.values()) if (r.day >= since) { const k = r.day + "|" + r.role; agg.set(k, (agg.get(k) || 0) + 1); }
          return { results: [...agg].map(([k, n]) => { const [day, role] = k.split("|"); return { day, role, n }; }) };
        }
      };
    }
  };
}

const t0 = Date.UTC(2026, 10, 2, 16, 0, 0); // JST 11/3 01:00

test("日付は日本時間で切り替わる", () => {
  assert.equal(jstDay(Date.UTC(2026, 10, 2, 14, 59)), "2026-11-02");
  assert.equal(jstDay(Date.UTC(2026, 10, 2, 15, 0)), "2026-11-03");
});

test("同じ人は1日1回だけ書く・無効ユーザーは数えない", async () => {
  const db = fakeDb();
  const u = { user_id: "u1", role: "VIP", status: "ACTIVE" };
  assert.equal(await recordDailyActive(db, u, { nowMs: t0 }), true);
  assert.equal(await recordDailyActive(db, u, { nowMs: t0 + 60000 }), false);
  assert.equal(await recordDailyActive(db, { user_id: "u2", status: "DISABLED" }, { nowMs: t0 }), false);
  await recordDailyActive(db, { user_id: "u3", role: "BASIC", status: "ACTIVE" }, { nowMs: t0 });
  assert.equal(db.calls.filter(s => s.startsWith("INSERT")).length, 2);
  const days = await loadDailyActive(db, { days: 3, nowMs: t0 });
  assert.equal(days.length, 3);
  assert.deepEqual(days[0], { day: "2026-11-03", total: 2, roles: { VIP: 1, BASIC: 1 } });
  assert.equal(days[1].total, 0);
});

test("Cloudflare集計はトークンとゾーンIDが無ければ呼ばない", async () => {
  let called = false;
  const r = await loadCloudflareTraffic({}, { fetchImpl: async () => { called = true; } });
  assert.deepEqual(r, { configured: false });
  assert.equal(called, false);
});

test("Cloudflare集計を読み、トークンはリクエストヘッダーだけに使う", async () => {
  const sent = [];
  const fetchImpl = async (url, init) => {
    sent.push(init);
    const q = JSON.parse(init.body).query;
    const data = q.includes("rumPageload")
      ? { viewer: { accounts: [{ rumPageloadEventsAdaptiveGroups: [{ dimensions: { date: "2026-11-02" }, count: 40, sum: { visits: 12 } }] }] } }
      : { viewer: { zones: [{ httpRequests1dGroups: [{ dimensions: { date: "2026-11-02" }, sum: { requests: 900, pageViews: 300 }, uniq: { uniques: 55 } }] }] } };
    return new Response(JSON.stringify({ data }), { status: 200 });
  };
  const env = { CF_ANALYTICS_TOKEN: "secret-token-xyz", CF_ZONE_ID: "z1", CF_ACCOUNT_ID: "a1", PUBLIC_ORIGIN: "https://eagleeye-ks.com" };
  const cf = await loadCloudflareTraffic(env, { nowMs: t0, fetchImpl });
  assert.equal(sent[0].headers.authorization, "Bearer secret-token-xyz");
  assert.deepEqual(cf.zone, [{ date: "2026-11-02", uniques: 55, pageViews: 300, requests: 900 }]);
  assert.deepEqual(cf.rum, [{ date: "2026-11-02", visits: 12, pageViews: 40 }]);
  assert.match(sent[1].body, /eagleeye-ks\.com/);
  const html = renderOwnerTrafficPage({ active: [{ day: "2026-11-03", total: 2, roles: { VIP: 1, BASIC: 1 } }], cf });
  assert.doesNotMatch(html, /secret-token-xyz/);
  assert.match(html, /VIP 1・BASIC 1/);
  assert.match(html, />55</);
  assert.match(html, /noindex/);
});

test("Cloudflareがエラーでもページは出る（エラー文は短く・エスケープ）", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ errors: [{ message: "<b>not authorized</b>" }] }), { status: 200 });
  const cf = await loadCloudflareTraffic({ CF_ANALYTICS_TOKEN: "t", CF_ZONE_ID: "z" }, { nowMs: t0, fetchImpl });
  assert.equal(cf.zone, null);
  const html = renderOwnerTrafficPage({ active: [], cf });
  assert.match(html, /&lt;b&gt;not authorized/);
});

test("未設定なら設定方法を案内し、OWNER専用ルートとリンクがある", () => {
  assert.match(renderOwnerTrafficPage({ active: [] }), /CF_ANALYTICS_TOKEN/);
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /url\.pathname === "\/owner\/traffic"\) \{\n\s+const guard = await requireOwner/);
  assert.match(src, /href="\/owner\/traffic"/);
  assert.match(src, /if \(user\) await recordDailyActive\(env\.DB, user\);/);
});

test("直近24時間で多いアクセス：ページ・ボット名・国。IPは出さない。失敗した表だけエラー表示", async () => {
  const { loadCloudflareTopTraffic, renderTopTrafficCard } = await import("../src/traffic-stats.js");
  assert.deepEqual(await loadCloudflareTopTraffic({}), { configured: false });
  const queries = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    queries.push(body);
    assert.equal(init.headers.authorization, "Bearer tok");
    if (body.query.includes("userAgent")) return new Response(JSON.stringify({ data: { viewer: { zones: [{ httpRequestsAdaptiveGroups: [{ count: 300000, dimensions: { userAgent: "Mozilla/5.0 (compatible; SomeBot/1.0)" } }] }] } } }));
    if (body.query.includes("clientCountryName")) return new Response(JSON.stringify({ errors: [{ message: "unknown field clientCountryName" }] }));
    return new Response(JSON.stringify({ data: { viewer: { zones: [{ httpRequestsAdaptiveGroups: [{ count: 250000, dimensions: { clientRequestPath: "/k/1524", edgeResponseContentTypeName: "html" } }] }] } } }));
  };
  const top = await loadCloudflareTopTraffic({ CF_ANALYTICS_TOKEN: "tok", CF_ZONE_ID: "z" }, { nowMs: Date.parse("2026-11-08T10:00:00Z"), fetchImpl });
  assert.equal(queries.length, 3);
  for (const q of queries) {
    assert.match(q.query, /httpRequestsAdaptiveGroups\(limit:12,orderBy:\[count_DESC\],filter:\{datetime_geq:\$since,datetime_lt:\$until,requestSource:"eyeball"\}\)/);
    assert.doesNotMatch(q.query, /clientIP/);
  }
  assert.equal(queries[0].variables.until, "2026-11-08T10:00:00.000Z");
  const html = renderTopTrafficCard(top);
  assert.match(html, /\/k\/1524（html）/);
  assert.match(html, /250,000/);
  assert.match(html, /SomeBot\/1\.0/);
  assert.match(html, /取得できませんでした（unknown field clientCountryName）/);
  assert.doesNotMatch(html, /tok/);
  assert.equal(renderTopTrafficCard({ configured: false }), "");
});
