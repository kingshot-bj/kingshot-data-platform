-- Track durable Kingdom collection coverage without touching existing collection/history rows.
-- One row per kingdom. Successful collection only advances the counters.
CREATE TABLE IF NOT EXISTS kingdom_collection_stats (
  kid INTEGER PRIMARY KEY,
  first_collected_at INTEGER,
  last_collected_at INTEGER,
  total_collection_count INTEGER NOT NULL DEFAULT 0,
  operator_collection_count INTEGER NOT NULL DEFAULT 0,
  user_collection_count INTEGER NOT NULL DEFAULT 0,
  last_source TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

ALTER TABLE kingdom_watchlist_jobs ADD COLUMN collection_source TEXT NOT NULL DEFAULT 'OPERATOR';

CREATE INDEX IF NOT EXISTS idx_kingdom_collection_stats_last_collected
  ON kingdom_collection_stats(last_collected_at DESC);

CREATE INDEX IF NOT EXISTS idx_kingdom_collection_stats_source
  ON kingdom_collection_stats(last_source, last_collected_at DESC);
