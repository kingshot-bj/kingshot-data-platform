-- Optimize latest-job lookups for each kingdom watchlist.
-- The existing active-job index includes status before created_at and therefore
-- cannot provide created_at ordering when the query includes all statuses.
-- This index supports:
--   WHERE watchlist_id = ? ORDER BY created_at DESC LIMIT 1
-- It is maintained on job insert/delete; normal status/progress updates do not
-- change either indexed column.
CREATE INDEX IF NOT EXISTS idx_kingdom_watchlist_jobs_latest
  ON kingdom_watchlist_jobs (watchlist_id, created_at DESC);
