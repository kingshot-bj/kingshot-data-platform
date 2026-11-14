// 登録までの流れ（オーナー用）：日ごとの回数、直近の新規ユーザーの到達数、取消時はエラー画面にしない。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { recordFunnel, loadFunnel, renderFunnelCard, resetFunnelSchemaCache } from "../src/funnel.js";
import { renderOwnerTrafficPage } from "../src/traffic-stats.js";

function fakeDb() {
  const counts = new Map();
  const stmt = (sql, a = []) => ({
    bind: (...x) => stmt(sql, x),
    async run() { if (sql.startsWith("INSERT INTO funnel_daily")) { const k = a[0] + "|" + a[1]; counts.set(k, (counts.get(k) || 0) + 1); } return {}; },
    async all() { return { results: [...counts].filter(([k]) => k.split("|")[0] >= a[0]).map(([k, n]) => ({ day: k.split("|")[0], step: k.split("|")[1], n })) }; },
    async first() { return { users: 5, linked: 1, keyed: 0, advanced: 0 }; }
  });
  return { counts, prepare: sql => stmt(sql) };
}

test("日本時間の日ごとに数え、知らない段階は数えない", async () => {
  resetFunnelSchemaCache();
  const db = fakeDb();
  const t = Date.UTC(2026, 10, 6, 15, 30); // JST 11/7 0:30
  await recordFunnel(db, "login_start", t);
  await recordFunnel(db, "login_start", t);
  await recordFunnel(db, "login_new", t);
  await recordFunnel(db, "login_cancelled", t);
  await recordFunnel(db, "something_else", t);
  assert.deepEqual([...db.counts.keys()].sort(), ["2026-11-07|login_cancelled", "2026-11-07|login_new", "2026-11-07|login_start"]);
  const f = await loadFunnel(db, { days: 14, nowMs: t });
  assert.equal(f.daily[0].day, "2026-11-07");
  assert.deepEqual(f.totals, { login_start: 2, google_start: 0, login_cancelled: 1, login_new: 1, login_returning: 0, discord_return: 0, google_return: 0, google_done: 0, login_error: 0, upgrade_popup_shown: 0, upgrade_popup_click: 0 });
  assert.deepEqual(f.cohort, { users: 5, linked: 1, keyed: 0, advanced: 0 });
  const html = renderFunnelCard(f);
  assert.match(html, /登録までの流れ（直近14日）/);
  assert.match(html, /<th>新しくログインした<\/th><td>1<\/td><td class="muted">50%<\/td>/);
  assert.match(html, /<th>領主IDを登録<\/th><td>1<\/td><td class="muted">20%<\/td>/);
  assert.match(html, /取り消した回数：1回/);
  assert.match(renderOwnerTrafficPage({ funnel: f }), /登録までの流れ/);
  assert.doesNotMatch(renderOwnerTrafficPage({}), /登録までの流れ/);
});

test("配線：ログイン開始・取消・新規/再ログインを数える、取消はエラー画面でなく元のページへ", () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(index, /if \(env\.DB\) await recordFunnel\(env\.DB, "login_start"\);/);
  assert.match(index, /await recordFunnel\(env\.DB, userResult\?\.isNew \? "login_new" : "login_returning"\);/);
  const cb = index.slice(index.indexOf("async function handleDiscordCallback"), index.indexOf("async function upsertUser"));
  const cancel = cb.slice(cb.indexOf('if (url.searchParams.get("error") && !code)'), cb.indexOf('if (!code || !state)'));
  assert.match(cancel, /recordFunnel\(env\.DB, "login_cancelled"\)/);
  assert.match(cancel, /status: 302/);
  assert.doesNotMatch(cancel, /SESSION_COOKIE/, "取消ではセッションを出さない");
  assert.match(index, /renderOwnerTrafficPage\(\{ active, cf, d1, apiPool, funnel, top, sweep \}\)/);
});

test("どこで離れたか：Discord・Googleの画面から戻った回数、Googleで完了、戻ってきて失敗を数える", () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const discord = index.slice(index.indexOf("async function handleDiscordCallback("), index.indexOf("async function handleDiscordCallback(") + 4000);
  assert.ok(discord.indexOf('recordFunnel(env.DB, "discord_return")') < discord.indexOf('recordFunnel(env.DB, "login_cancelled")'), "キャンセルも含めて戻ってきたら数える");
  assert.equal((discord.match(/recordFunnel\(env\.DB, "login_error"\)/g) || []).length, 4, "state なし・state 不正・トークン失敗・ユーザー取得失敗");
  const google = index.slice(index.indexOf("async function handleGoogleCallback("), index.indexOf("async function upsertUser("));
  assert.ok(google.indexOf('recordFunnel(env.DB, "google_return")') < google.indexOf('recordFunnel(env.DB, "login_cancelled")'));
  assert.equal((google.match(/recordFunnel\(env\.DB, "login_error"\)/g) || []).length, 2);
  assert.match(google, /await recordFunnel\(env\.DB, "google_done"\);/);
  const html = renderFunnelCard({ days: 1, daily: [], totals: { login_start: 10, google_start: 5, login_new: 3, discord_return: 4, google_return: 1, login_error: 1, google_done: 1 }, cohort: { users: 0, linked: 0, keyed: 0, advanced: 0 } });
  assert.match(html, /<th>Discordの画面から戻ってきた<\/th><td>4<\/td><td class="muted">40%<\/td>/);
  assert.match(html, /<th>Googleの画面から戻ってきた<\/th><td>1<\/td><td class="muted">20%<\/td>/);
  assert.match(html, /<th>戻ってきたがログイン失敗<\/th><td>1<\/td><td class="muted">20%<\/td>/);
});

// 2026-11-14：スマホで日ごとの表（12列）が横にはみ出し、ページ全体が横にずれていた。
test("日ごとの表：横スクロールの箱に入れ、見出しは短く（折り返さない）・日付の列は固定", async () => {
  const { renderFunnelCard, FUNNEL_STEPS } = await import("../src/funnel.js");
  const daily = [{ day: "2026-11-14", ...Object.fromEntries(FUNNEL_STEPS.map(s => [s.key, 1])) }];
  const html = renderFunnelCard({ days: 14, daily, totals: Object.fromEntries(FUNNEL_STEPS.map(s => [s.key, 1])), cohort: { users: 1, linked: 0, keyed: 0, advanced: 0 } });
  assert.match(html, /<div class="ee-funnel-scroll" style="overflow-x:auto/);
  assert.match(html, /white-space:nowrap/);
  assert.match(html, /<th style="position:sticky;left:0/);
  const heads = [...html.matchAll(/<th title="[^"]*">([^<]*)<\/th>/g)].map(m => m[1]);
  assert.equal(heads.length, FUNNEL_STEPS.length);
  assert.ok(heads.every(h => h.length <= 9), "見出しは短く: " + heads.join(","));
});
