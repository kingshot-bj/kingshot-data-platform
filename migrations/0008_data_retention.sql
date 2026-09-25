CREATE TABLE IF NOT EXISTS data_retention_settings (
  settings_id INTEGER PRIMARY KEY CHECK (settings_id = 1),
  api_observations_days INTEGER NOT NULL DEFAULT 14 CHECK (api_observations_days = 0 OR api_observations_days BETWEEN 7 AND 3650),
  player_snapshots_days INTEGER NOT NULL DEFAULT 90 CHECK (player_snapshots_days = 0 OR player_snapshots_days BETWEEN 7 AND 3650),
  ranking_snapshots_days INTEGER NOT NULL DEFAULT 180 CHECK (ranking_snapshots_days = 0 OR ranking_snapshots_days BETWEEN 7 AND 3650),
  player_rank_snapshots_days INTEGER NOT NULL DEFAULT 180 CHECK (player_rank_snapshots_days = 0 OR player_rank_snapshots_days BETWEEN 7 AND 3650),
  change_events_days INTEGER NOT NULL DEFAULT 730 CHECK (change_events_days = 0 OR change_events_days BETWEEN 30 AND 3650),
  api_pool_usage_days INTEGER NOT NULL DEFAULT 90 CHECK (api_pool_usage_days = 0 OR api_pool_usage_days BETWEEN 7 AND 3650),
  updated_at INTEGER NOT NULL,
  updated_by_user_id TEXT
);

INSERT OR IGNORE INTO data_retention_settings (
  settings_id,
  api_observations_days,
  player_snapshots_days,
  ranking_snapshots_days,
  player_rank_snapshots_days,
  change_events_days,
  api_pool_usage_days,
  updated_at
) VALUES (1, 14, 90, 180, 180, 730, 90, strftime('%s','now'));

CREATE INDEX IF NOT EXISTS idx_api_observations_observed_at
  ON api_observations (observed_at);
CREATE INDEX IF NOT EXISTS idx_player_snapshots_observed_at
  ON player_snapshots (observed_at);
CREATE INDEX IF NOT EXISTS idx_ranking_snapshots_observed_at
  ON ranking_snapshots (observed_at);
CREATE INDEX IF NOT EXISTS idx_player_rank_snapshots_observed_at
  ON player_rank_snapshots (observed_at);
CREATE INDEX IF NOT EXISTS idx_change_events_detected_at
  ON change_events (detected_at);
CREATE INDEX IF NOT EXISTS idx_api_pool_usage_used_at
  ON api_pool_usage (used_at);
