-- Resumable state for the one-batch-at-a-time kingdom catalog R2 backfill.
-- This table does not touch existing catalog data.
CREATE TABLE IF NOT EXISTS kingdom_catalog_r2_migration (
  migration_key TEXT PRIMARY KEY,
  last_kid INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'IDLE' CHECK (state IN ('IDLE','RUNNING','PAUSED','FAILED','COMPLETE')),
  batches_run INTEGER NOT NULL DEFAULT 0,
  rows_archived INTEGER NOT NULL DEFAULT 0,
  last_batch_count INTEGER NOT NULL DEFAULT 0,
  last_batch_at INTEGER,
  last_success_at INTEGER,
  last_error TEXT,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO kingdom_catalog_r2_migration (
  migration_key, last_kid, state, batches_run, rows_archived,
  last_batch_count, last_batch_at, last_success_at, last_error, updated_at
) VALUES (
  'KINGDOM_CATALOG_R2_BACKFILL', 0, 'IDLE', 0, 0,
  0, NULL, NULL, NULL, strftime('%s','now')
);

CREATE INDEX IF NOT EXISTS idx_kingdom_catalog_r2_backfill_cursor
  ON kingdom_catalog(kid, r2_latest_key);
