// APIキーの混み具合：使用率の見張り（50%超で1日1回DM）、キーが取れなかった回数、裏の収集はユーザー用の枠を残す、招待特典の上限。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runApiPoolUsageAlert, recordPoolPressure, apiPoolAlertMessage, resetApiPoolPressureSchemaCache, BACKGROUND_KEY_RESERVE, API_POOL_ALERT_RATIO } from "../src/api-pool-pressure.js";
import { renderApiPoolCard } from "../src/traffic-stats.js";
import { getWatchBonus, resetReferralSchemaCache, INVITE_BONUS_CAP } from "../src/referrals.js";

function fakeDb({ used = 0, quota = 155000, keys = 28, contributors = 8 } = {}) {
  const state = new Map(); const pressure = new Map(); const dms = [];
  const stmt = (sql, a = []) => ({
    bind: (...x) => stmt(sql, x),
    async run() {
      if (sql.startsWith("INSERT INTO api_pool_pressure")) { const k = a[0] + "|" + a[1]; pressure.set(k, (pressure.get(k) || 0) + 1); }
      if (sql.startsWith("INSERT INTO ops_alert_state")) state.set(a[0], a[1]);
      if (sql.startsWith("INSERT OR IGNORE INTO announcement_dm_queue")) dms.push({ key: a[0], content: a[2] });
      return { meta: { changes: 1 } };
    },
    async first() {
      if (sql.startsWith("SELECT value FROM ops_alert_state")) return state.has(a[0]) ? { value: state.get(a[0]) } : null;
      if (sql.includes("FROM api_pool_usage")) return { used };
      if (sql.includes("FROM api_pool_keys")) return { keys, contributors, quota };
      return null;
    },
    async all() {
      if (sql.includes("FROM api_pool_pressure")) return { results: [...pressure].filter(([k]) => k.startsWith(a[0] + "|")).map(([k, n]) => ({ kind: k.split("|")[1], n })) };
      if (sql.includes("role = 'OWNER'")) return { results: [{ discord_id: "owner1" }] };
      return { results: [] };
    }
  });
  return { state, pressure, dms, prepare: sql => stmt(sql) };
}

test("50%以下はDMしない、超えたら1日1回だけDM", async () => {
  resetApiPoolPressureSchemaCache();
  const t = Date.UTC(2026, 10, 7, 3);
  const low = fakeDb({ used: 6000 });
  const r1 = await runApiPoolUsageAlert({ DB: low }, { nowMs: t });
  assert.equal(r1.alerted, false);
  assert.equal(low.dms.length, 0);
  assert.equal(r1.reserve, BACKGROUND_KEY_RESERVE);
  const high = fakeDb({ used: 155000 * API_POOL_ALERT_RATIO + 1 });
  assert.equal((await runApiPoolUsageAlert({ DB: high, PUBLIC_ORIGIN: "https://eagleeye-ks.com" }, { nowMs: t })).alerted, true);
  assert.equal(high.dms.length, 1);
  assert.match(high.dms[0].content, /77,501回/);
  assert.match(high.dms[0].content, /https:\/\/eagleeye-ks\.com\/owner\/traffic/);
  assert.equal((await runApiPoolUsageAlert({ DB: high }, { nowMs: t + 30 * 60e3 })).reason, "RECENTLY_CHECKED", "1時間に1回");
  await runApiPoolUsageAlert({ DB: high }, { nowMs: t + 2 * 3600e3 });
  assert.equal(high.dms.length, 1, "同じ日は1回だけ");
});

test("キーが取れなかった回数を日ごと・種類ごとに数え、オーナー画面に出す", async () => {
  resetApiPoolPressureSchemaCache();
  const db = fakeDb();
  const t = Date.UTC(2026, 10, 7, 3);
  await recordPoolPressure(db, "interactive_no_key", t);
  await recordPoolPressure(db, "interactive_no_key", t);
  await recordPoolPressure(db, "background_yielded", t);
  const r = await runApiPoolUsageAlert({ DB: db }, { nowMs: t, force: true });
  assert.deepEqual(r.pressure, { interactive_no_key: 2, background_yielded: 1 });
  const html = renderApiPoolCard(r);
  assert.match(html, /APIキーの使用（直近24時間）/);
  assert.match(html, /ユーザー操作でキーが取れなかった回数<\/th><td>2</);
  assert.match(html, /常に4本を空けています/);
  assert.match(renderApiPoolCard(null), /まだ確認していません/);
  assert.doesNotMatch(apiPoolAlertMessage({ used: 1, quota: 2, keys: 1, contributors: 1 }), /kss_/);
});

test("配線：裏の収集はユーザー用に枠を残す、ユーザー操作の失敗を数える、cron・オーナー画面", () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(index, /const reserveApiKeys = apiLimiter \? Math\.max\(0, Number\(options\?\.reserveApiKeys\) \|\| 0\) : Math\.max\(BACKGROUND_KEY_RESERVE,/);
  assert.equal((index.match(/if \(!apiLimiter\) await recordPoolPressure\(env\.DB, "background_yielded"\);/g) || []).length, 2);
  const player = index.slice(index.indexOf("async function fetchPlayerThroughApiPool"), index.indexOf("async function handlePlayerApi"));
  assert.match(player, /await recordPoolPressure\(env\.DB, "interactive_no_key"\);/);
  assert.doesNotMatch(player, /reserveAvailableKeys/, "ユーザー操作は枠を残さず使える");
  assert.match(index, /await runApiPoolUsageAlert\(env\);/);
  assert.match(index, /renderOwnerTrafficPage\(\{ active, cf, d1, apiPool \}\)/);
  const engine = readFileSync(new URL("../src/data-collection-engine.js", import.meta.url), "utf8");
  assert.match(engine, /reserveAvailableKeys: Math\.floor\(reserveKeys\)/);
  assert.match(readFileSync(new URL("../src/kvk-mystic.js", import.meta.url), "utf8"), /purpose: "KVK_MYSTIC_BOARDS", reserveKeys: BACKGROUND_KEY_RESERVE/);
  assert.match(readFileSync(new URL("../src/kingdom-catalog.js", import.meta.url), "utf8"), /reserveKeys: BACKGROUND_KEY_RESERVE/);
});

test("招待のウォッチ枠の上乗せは合計30まで", async () => {
  resetReferralSchemaCache();
  const db = { prepare: sql => ({ bind: () => ({ run: async () => ({}), first: async () => ({ n: 55 }) }), run: async () => ({}) }) };
  assert.equal(INVITE_BONUS_CAP, 30);
  assert.equal(await getWatchBonus(db, "u"), 30);
});
