import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/kingdom-portal.js", import.meta.url), "utf8");

test("alliance roster refresh requests MightPulse member data and waits for completion", () => {
  assert.match(source, /include:"info,members_base",wait:30/);
  assert.match(source, /include: "info,members_base", wait: 30/);
});

test("alliance refresh lock is a short in-flight lease, not a ten-minute cooldown", () => {
  assert.match(source, /ALLIANCE_REFRESH_LOCK_SECONDS = 60/);
  assert.doesNotMatch(source, /前回の取得から10分未満のため更新を保留しました/);
  assert.match(source, /同盟Rosterの取得処理中です/);
});

test("queued and running API refreshes are surfaced with retry_after", () => {
  assert.match(source, /function allianceRefreshState\(payload\)/);
  assert.match(source, /retry_after/);
  assert.match(source, /MightPulse側でRoster更新中です/);
  assert.match(source, /REFRESH_PENDING/);
});

test("failed or queued roster refresh does not advance alliance_catalog updated_at", () => {
  const detail = source.slice(source.indexOf("export async function renderAlliancePage"), source.indexOf("export const ALLIANCE_COMPARE_STALE_SECONDS"));
  assert.doesNotMatch(detail, /UPDATE alliance_catalog SET updated_at=/);
});

test("alliance comparison uses the same wait and member include behavior", () => {
  const compare = source.slice(source.indexOf("export async function loadAllianceForCompare"));
  assert.match(compare, /include: "info,members_base", wait: 30/);
  assert.match(compare, /REFRESH_IN_PROGRESS/);
});
