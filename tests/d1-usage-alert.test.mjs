// D1読み取り量の見張り：1時間に1回だけ確認、目安超えでオーナーへDM（1日1回）、トークンを出さない。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runD1UsageAlert, d1ReadAlertThreshold, d1AlertMessage, D1_READ_ALERT_DEFAULT_ROWS } from "../src/d1-usage-alert.js";
import { renderOwnerTrafficPage } from "../src/traffic-stats.js";

function fakeDb() {
  const state = { value: null, dms: [] };
  return {
    state,
    prepare(sql) {
      const st = { sql, args: [], bind(...a) { this.args = a; return this; } };
      st.run = async () => {
        if (/INSERT INTO ops_alert_state/.test(sql)) state.value = st.args[1];
        if (/announcement_dm_queue/.test(sql) && !state.dms.some(d => d[0] === st.args[0])) state.dms.push(st.args);
        return {};
      };
      st.first = async () => (/FROM ops_alert_state/.test(sql) && state.value ? { value: state.value } : null);
      st.all = async () => ({ results: /FROM users/.test(sql) ? [{ discord_id: "111" }] : [] });
      return st;
    }
  };
}
const env = db => ({ DB: db, CLOUDFLARE_ACCOUNT_ID: "acc", CLOUDFLARE_ANALYTICS_TOKEN: "secret-token-zz", CLOUDFLARE_D1_DATABASE_ID: "dbid", PUBLIC_ORIGIN: "https://eagleeye-ks.com" });
const cf = rowsRead => { const calls = []; const f = async (url, init) => { calls.push(init); return new Response(JSON.stringify({ data: { viewer: { accounts: [{ d1AnalyticsAdaptiveGroups: [{ sum: { rowsRead, rowsWritten: 10, readQueries: 5 } }] }] } } }), { status: 200 }); }; f.calls = calls; return f; };
const t0 = Date.UTC(2026, 10, 6, 12, 0, 0);

test("目安以下なら記録だけ、DMしない", async () => {
  const db = fakeDb();
  const r = await runD1UsageAlert(env(db), { nowMs: t0, fetchImpl: cf(1000) });
  assert.equal(r.rowsRead, 1000);
  assert.equal(r.alerted, false);
  assert.equal(db.state.dms.length, 0);
});

test("目安を超えたらオーナーへDM（同じ日は1回だけ）、1時間以内は再確認しない", async () => {
  const db = fakeDb();
  const f = cf(5_000_000_000);
  const r1 = await runD1UsageAlert(env(db), { nowMs: t0, fetchImpl: f });
  assert.equal(r1.alerted, true);
  assert.equal(db.state.dms.length, 1);
  assert.match(db.state.dms[0][0], /^d1-read-alert:2026-11-06:111$/);
  assert.match(db.state.dms[0][2], /5,000,000,000行/);
  assert.equal((await runD1UsageAlert(env(db), { nowMs: t0 + 600_000, fetchImpl: f })).reason, "RECENTLY_CHECKED");
  const r3 = await runD1UsageAlert(env(db), { nowMs: t0 + 3_700_000, fetchImpl: f });
  assert.equal(r3.alerted, false, "同じ日は二度送らない");
  assert.equal(db.state.dms.length, 1);
  assert.equal(f.calls[0].headers.authorization, "Bearer secret-token-zz");
  assert.doesNotMatch(db.state.value, /secret-token-zz/, "状態にトークンを残さない");
});

test("未設定ならCloudflareを呼ばない／目安は環境変数で変えられる", async () => {
  const f = cf(1);
  assert.equal((await runD1UsageAlert({ DB: fakeDb() }, { fetchImpl: f })).reason, "NOT_CONFIGURED");
  assert.equal(f.calls.length, 0);
  assert.equal(d1ReadAlertThreshold({}), D1_READ_ALERT_DEFAULT_ROWS);
  assert.equal(d1ReadAlertThreshold({ D1_READ_ALERT_DAILY_ROWS: "1000" }), 1000);
});

test("オーナー用ページに今日の読み取りと目安を表示、cronに組み込み済み", () => {
  const html = renderOwnerTrafficPage({ active: [], d1: { day: "2026-11-06", rowsRead: 400_000_000, threshold: 300_000_000, checkedAt: 1 } });
  assert.match(html, /D1の読み取り（今日 2026-11-06 UTC）/);
  assert.match(html, /を超えています/);
  assert.match(d1AlertMessage({ day: "d", rowsRead: 1, threshold: 2, origin: "https://x" }), /https:\/\/x\/owner\/traffic/);
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /await runD1UsageAlert\(env\);\n[\s\S]{0,200}const announce = await runAnnouncementDiscordSync/);
});
