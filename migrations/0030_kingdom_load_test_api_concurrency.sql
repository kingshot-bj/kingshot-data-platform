-- Load Test API concurrency is derived from the real API Pool availability.
-- The existing concurrency column remains the derived maximum concurrent kingdom-job count.
ALTER TABLE kingdom_load_test_runs ADD COLUMN api_concurrency INTEGER NOT NULL DEFAULT 0;
