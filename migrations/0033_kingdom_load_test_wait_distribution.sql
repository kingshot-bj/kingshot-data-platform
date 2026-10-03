ALTER TABLE kingdom_load_test_runs ADD COLUMN api_wait_min_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE kingdom_load_test_runs ADD COLUMN api_wait_max_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE kingdom_load_test_runs ADD COLUMN api_wait_buckets_json TEXT NOT NULL DEFAULT '{}';
