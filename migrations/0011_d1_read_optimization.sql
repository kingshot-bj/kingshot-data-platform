-- EagleEye / D1
-- Migration 0011: reduce row reads for ranking/player history lookups

-- Ranking change detection asks for a previous snapshot by
-- kid + board + target_id, ordered by observed_at DESC.
CREATE INDEX IF NOT EXISTS idx_ranking_snapshots_target_history
  ON ranking_snapshots (kid, board, target_id, observed_at DESC);

-- Latest/current ranking reads filter by kid + board + observed_at
-- and then order by rank.
CREATE INDEX IF NOT EXISTS idx_ranking_snapshots_current
  ON ranking_snapshots (kid, board, observed_at DESC, rank ASC);

-- Player history pages filter by governor_id and order by observed_at.
CREATE INDEX IF NOT EXISTS idx_player_snapshots_governor_history
  ON player_snapshots (governor_id, observed_at DESC);

-- Player rank history uses the same access pattern.
CREATE INDEX IF NOT EXISTS idx_player_rank_snapshots_governor_history
  ON player_rank_snapshots (governor_id, observed_at DESC);

-- Change-event history commonly filters by target and time.
CREATE INDEX IF NOT EXISTS idx_change_events_target_time
  ON change_events (target_type, target_id, detected_at DESC);

-- API observation history commonly filters by target and time.
CREATE INDEX IF NOT EXISTS idx_api_observations_target_time
  ON api_observations (target_type, target_id, observed_at DESC);
