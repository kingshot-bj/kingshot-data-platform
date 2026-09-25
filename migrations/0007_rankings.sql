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
