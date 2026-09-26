-- EagleEye / D1
-- Migration 0012: personal player watchlists

CREATE TABLE IF NOT EXISTS player_watchlists (
  watchlist_id TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL,
  governor_id TEXT NOT NULL,
  label TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(discord_id, governor_id)
);

CREATE INDEX IF NOT EXISTS idx_player_watchlists_user
  ON player_watchlists(discord_id, enabled, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_player_watchlists_player
  ON player_watchlists(governor_id, enabled);
