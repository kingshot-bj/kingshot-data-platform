// ホームの「あなたの領主」は3時間より古ければ裏で取り直す。連打防止つき。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { claimMeAutoRefresh, ME_AUTO_REFRESH_AFTER_SECONDS } from "../src/home-summary.js";

const now = 1_800_000_000;
const nowMs = now * 1000;

test("3時間ちょうどまでは取り直さない、超えたら取り直す", () => {
  assert.equal(ME_AUTO_REFRESH_AFTER_SECONDS, 3 * 3600);
  const attempts = new Map();
  assert.equal(claimMeAutoRefresh({ governor_id: "1", observed_at: now - 3 * 3600 + 1 }, { now, nowMs, attempts }), false);
  assert.equal(claimMeAutoRefresh({ governor_id: "1", observed_at: now - 3 * 3600 - 1 }, { now, nowMs, attempts }), true);
});

test("データが無い場合も取りに行く。領主未登録なら何もしない", () => {
  assert.equal(claimMeAutoRefresh({ governor_id: "2", observed_at: null }, { now, nowMs, attempts: new Map() }), true);
  assert.equal(claimMeAutoRefresh(null, { now, nowMs, attempts: new Map() }), false);
});

test("同じ領主は10分以内に再試行しない（取得失敗時の連打防止）", () => {
  const attempts = new Map();
  const me = { governor_id: "3", observed_at: now - 5 * 3600 };
  assert.equal(claimMeAutoRefresh(me, { now, nowMs, attempts }), true);
  assert.equal(claimMeAutoRefresh(me, { now, nowMs: nowMs + 9 * 60 * 1000, attempts }), false);
  assert.equal(claimMeAutoRefresh(me, { now, nowMs: nowMs + 11 * 60 * 1000, attempts }), true);
  assert.equal(claimMeAutoRefresh({ governor_id: "4", observed_at: null }, { now, nowMs, attempts }), true);
});

test("ホームAPIは waitUntil で裏取得し、画面は一度だけ再読み込みする", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /handleHomeSummary\(request, env, executionContext\)/);
  assert.match(src, /claimMeAutoRefresh\(summary\.me\)/);
  assert.match(src, /executionContext\.waitUntil\(/);
  assert.match(src, /fetchPlayerThroughApiPool\(env, governorId, "HOME_AUTO_REFRESH", "base"\)/);
  assert.match(src, /if\(d\.me&&d\.me\.refreshing&&!homeMeRetried\)\{homeMeRetried=true;setTimeout\(loadSummary,8000\)\}/);
});
