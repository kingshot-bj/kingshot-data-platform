-- Persist compact Cloudflare resource snapshots for OWNER load-test history.
-- The payload intentionally excludes Analytics query-level detail and secrets.
ALTER TABLE kingdom_load_test_runs ADD COLUMN cloudflare_before_json TEXT;
ALTER TABLE kingdom_load_test_runs ADD COLUMN cloudflare_after_json TEXT;
ALTER TABLE kingdom_load_test_runs ADD COLUMN cloudflare_delta_json TEXT;
