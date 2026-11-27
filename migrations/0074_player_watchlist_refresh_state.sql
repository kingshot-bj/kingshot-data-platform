-- EagleEye / D1
-- Migration 0066: player watchlist automatic refresh state.
-- A governor watched by multiple users is refreshed once per cycle.

CREATE TABLE IF NOT EXISTS player_watchlist_refresh_state (
  governor_id TEXT PRIMARY KEY,
  last_attempt_at INTEGER,
  last_success_at INTEGER,
  next_refresh_at INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_player_watchlist_refresh_due
  ON player_watchlist_refresh_state(next_refresh_at, lease_until, last_success_at);
