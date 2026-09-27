-- EagleEye / D1
-- Migration 0013: remove redundant ranking index that duplicated 0011.
--
-- The runtime bootstrap previously created this additional index:
--   (kid, board, observed_at DESC, rank ASC)
-- while migration 0011 already provides the equivalent access path:
--   idx_ranking_snapshots_current
-- Keeping both indexes doubles index maintenance writes for ranking snapshot
-- inserts without providing another required query path.

DROP INDEX IF EXISTS idx_ranking_snapshots_kid_board_observed_rank;
