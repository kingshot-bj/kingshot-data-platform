-- Move kingdom watchlist runtime schemas into D1 migrations.
-- Request-time code keeps only additive compatibility checks for legacy columns.

CREATE TABLE IF NOT EXISTS kingdom_watchlist_jobs (
  job_id TEXT PRIMARY KEY,
  watchlist_id TEXT NOT NULL,
  kid INTEGER NOT NULL,
  top_n INTEGER NOT NULL CHECK (top_n IN (5, 10)),
  status TEXT NOT NULL CHECK (status IN ('RANKINGS', 'PLAYERS', 'COMPLETED', 'FAILED')),
  board_index INTEGER NOT NULL DEFAULT 0,
  player_cursor INTEGER NOT NULL DEFAULT 0,
  player_ids_json TEXT NOT NULL DEFAULT '[]',
  observed_at INTEGER NOT NULL,
  source_first_at INTEGER,
  source_last_at INTEGER,
  ranking_rows INTEGER NOT NULL DEFAULT 0,
  player_rows INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_kingdom_watchlist_jobs_active
  ON kingdom_watchlist_jobs (watchlist_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kingdom_watchlist_jobs_updated
  ON kingdom_watchlist_jobs (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS kingdom_watchlist_locks (
  watchlist_id TEXT PRIMARY KEY,
  lock_token TEXT NOT NULL,
  lock_until INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kingdom_ranking_current (
  kid INTEGER NOT NULL,
  board TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  previous_rank INTEGER,
  score,
  uid TEXT,
  governor_id TEXT,
  nick_name TEXT,
  aid TEXT,
  abbr TEXT,
  name TEXT,
  observed_at INTEGER NOT NULL,
  source_observed_at INTEGER,
  source_observation_id TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (kid, board, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS kingdom_ranking_board_state (
  kid INTEGER NOT NULL,
  board TEXT NOT NULL,
  last_checked_at INTEGER NOT NULL,
  source_observed_at INTEGER,
  checked_rows INTEGER NOT NULL DEFAULT 0,
  changed_rows INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (kid, board)
);
