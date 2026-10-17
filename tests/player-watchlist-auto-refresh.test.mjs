import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const migration = readFileSync(new URL("../migrations/0066_player_watchlist_refresh_state.sql", import.meta.url), "utf8");

test("player watchlist auto refresh is scheduled by the existing cron", () => {
  assert.match(source, /await runPlayerWatchlistAutoRefresh\(env\)/);
  assert.match(source, /player_watchlist_auto_refresh_scheduler_failed/);
});

test("refresh interval and batch size are bounded by real API Pool availability", () => {
  assert.match(source, /PLAYER_WATCHLIST_AUTO_REFRESH_INTERVAL_SECONDS = 6 \* 60 \* 60/);
  assert.match(source, /PLAYER_WATCHLIST_AUTO_REFRESH_MAX_PER_TICK = 26/);
  assert.match(source, /Math\.min\(PLAYER_WATCHLIST_AUTO_REFRESH_MAX_PER_TICK, available\)/);
  assert.match(source, /LIMIT \?[\s\S]{0,40}\.bind\(now, now, concurrency\)/);
});

test("only enabled, distinct watched players are eligible and least-recently refreshed players go first", () => {
  assert.match(source, /SELECT DISTINCT governor_id\s+FROM player_watchlists\s+WHERE enabled = 1/);
  assert.match(source, /ORDER BY COALESCE\(s\.last_success_at, 0\) ASC/);
  assert.match(source, /w\.governor_id ASC/);
});

test("API Pool availability is a planning signal and each player still obtains its own lease", () => {
  assert.match(source, /poolTypes: \["SYSTEM_GENERAL", "USER_CONTRIBUTED"\]/);
  assert.match(source, /fetchPlayerThroughApiPool\(\s*env,\s*governorId,\s*"PLAYER_WATCHLIST_AUTO_REFRESH",\s*"base"/);
  assert.match(source, /if \(concurrency < 1\)[\s\S]{0,250}NO_API_POOL_CAPACITY/);
});

test("refresh state has a lease, retry time, and one global row per governor", () => {
  assert.match(migration, /governor_id TEXT PRIMARY KEY/);
  assert.match(migration, /next_refresh_at INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration, /lease_until INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration, /failure_count INTEGER NOT NULL DEFAULT 0/);
});
