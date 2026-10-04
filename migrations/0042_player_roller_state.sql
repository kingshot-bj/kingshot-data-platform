-- Phase 6: Player Roller
CREATE TABLE IF NOT EXISTS player_collection_state (
  state_key TEXT PRIMARY KEY,
  catalog_cursor INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'IDLE',
  processed_runs INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  last_kid INTEGER,
  last_governor_id TEXT,
  last_success_at INTEGER,
  last_failure_at INTEGER,
  last_error TEXT,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO player_collection_state
  (state_key, catalog_cursor, state, processed_runs, success_count, failed_count, skipped_count, updated_at)
VALUES
  ('PLAYER_ROLLER', 0, 'IDLE', 0, 0, 0, 0, strftime('%s','now'));
