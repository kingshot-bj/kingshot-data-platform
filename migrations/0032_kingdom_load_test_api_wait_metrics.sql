-- Persist OWNER Load Test API limiter / API Pool wait metrics.
ALTER TABLE kingdom_load_test_runs ADD COLUMN api_active_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE kingdom_load_test_runs ADD COLUMN api_waiting_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE kingdom_load_test_runs ADD COLUMN api_pool_waiting_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE kingdom_load_test_runs ADD COLUMN api_wait_events INTEGER NOT NULL DEFAULT 0;
ALTER TABLE kingdom_load_test_runs ADD COLUMN api_pool_wait_events INTEGER NOT NULL DEFAULT 0;
ALTER TABLE kingdom_load_test_runs ADD COLUMN api_wait_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE kingdom_load_test_runs ADD COLUMN api_pool_wait_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE kingdom_load_test_runs ADD COLUMN last_activity_at INTEGER NOT NULL DEFAULT 0;
