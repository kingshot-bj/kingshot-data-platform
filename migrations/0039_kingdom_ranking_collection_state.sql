CREATE TABLE IF NOT EXISTS kingdom_ranking_collection_state (
  state_key TEXT PRIMARY KEY,
  catalog_cursor INTEGER NOT NULL DEFAULT 0,
  board_cursor INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'IDLE',
  processed_runs INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  last_kid INTEGER,
  last_board TEXT,
  last_success_at INTEGER,
  last_failure_at INTEGER,
  last_error TEXT,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO kingdom_ranking_collection_state
(state_key, updated_at) VALUES ('KINGDOM_RANKING_ROLLER', strftime('%s','now'));
