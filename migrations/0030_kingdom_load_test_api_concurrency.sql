-- Load Test API concurrency is derived from the real API Pool availability.
-- The existing concurrency column remains the kingdom-job concurrency (1).
ALTER TABLE kingdom_load_test_runs ADD COLUMN api_concurrency INTEGER NOT NULL DEFAULT 0;
