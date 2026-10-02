-- Persist summary metrics so OWNER load-test history can be shown without scanning all Job rows.
ALTER TABLE kingdom_load_test_runs ADD COLUMN success_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE kingdom_load_test_runs ADD COLUMN failed_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE kingdom_load_test_runs ADD COLUMN ranking_rows_saved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE kingdom_load_test_runs ADD COLUMN player_rows_saved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE kingdom_load_test_runs ADD COLUMN elapsed_ms INTEGER;
