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
