-- EagleEye / D1
-- Migration 0021: archive API Pool usage and player identity history in R2 before D1 cleanup

ALTER TABLE data_retention_settings
  ADD COLUMN player_identity_history_days INTEGER NOT NULL DEFAULT 90;

CREATE INDEX IF NOT EXISTS idx_api_pool_usage_used_at
  ON api_pool_usage (used_at);

CREATE INDEX IF NOT EXISTS idx_player_identity_history_first_seen
  ON player_identity_history (first_seen_at);
