-- EagleEye ranking snapshots
-- Covers all MightPulse kingdom leaderboard boards and preserves historical observations.

CREATE TABLE IF NOT EXISTS ranking_snapshots (
  ranking_snapshot_id TEXT PRIMARY KEY,
  kid INTEGER NOT NULL,
  board TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('PLAYER', 'ALLIANCE')),
  target_id TEXT NOT NULL,
  rank INTEGER,
  score REAL,
  uid INTEGER,
  governor_id TEXT,
  nick_name TEXT,
  aid INTEGER,
  abbr TEXT,
  name TEXT,
  observed_at INTEGER NOT NULL,
  source_observation_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ranking_snapshots_lookup
  ON ranking_snapshots (kid, board, target_type, target_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_ranking_snapshots_board
  ON ranking_snapshots (kid, board, rank);

CREATE INDEX IF NOT EXISTS idx_ranking_snapshots_governor
  ON ranking_snapshots (governor_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS player_rank_snapshots (
  player_rank_snapshot_id TEXT PRIMARY KEY,
  governor_id TEXT NOT NULL,
  uid INTEGER,
  kid INTEGER,
  power REAL,
  power_rank INTEGER,
  kills REAL,
  kills_rank INTEGER,
  town_center_level REAL,
  town_center_rank INTEGER,
  migrant_score REAL,
  migrant_rank INTEGER,
  mystic_trial REAL,
  mystic_rank INTEGER,
  leaderboards_json TEXT,
  observed_at INTEGER NOT NULL,
  source_observation_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_player_rank_snapshots_player
  ON player_rank_snapshots (governor_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS kingdom_watchlists (
  watchlist_id TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL,
  kid INTEGER NOT NULL,
  top_n INTEGER NOT NULL CHECK (top_n IN (5, 10)),
  interval_hours INTEGER NOT NULL CHECK (interval_hours IN (1, 3, 6, 12)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  last_run_at INTEGER,
  last_success_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kingdom_watchlists_owner
  ON kingdom_watchlists (discord_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kingdom_watchlists_due
  ON kingdom_watchlists (enabled, last_run_at);
