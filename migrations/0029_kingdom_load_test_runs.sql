CREATE TABLE IF NOT EXISTS kingdom_load_test_runs (
  run_id TEXT PRIMARY KEY,
  target_count INTEGER NOT NULL,
  kids_json TEXT NOT NULL,
  start_kid INTEGER NOT NULL,
  end_kid INTEGER NOT NULL,
  top_n INTEGER NOT NULL CHECK (top_n IN (5,10)),
  requested_concurrency INTEGER NOT NULL,
  concurrency INTEGER NOT NULL,
  available_pool_keys INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING','COMPLETED','CANCELLED','FAILED')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_kingdom_load_test_runs_status
  ON kingdom_load_test_runs (status, updated_at DESC);