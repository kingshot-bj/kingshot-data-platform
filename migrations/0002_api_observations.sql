-- I-3: external API observation storage
CREATE TABLE IF NOT EXISTS api_observations (
  observation_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  observed_at INTEGER NOT NULL,
  http_status INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_observations_target
  ON api_observations(provider, target_type, target_id, observed_at);

CREATE INDEX IF NOT EXISTS idx_api_observations_observed_at
  ON api_observations(observed_at);

CREATE INDEX IF NOT EXISTS idx_api_observations_provider_endpoint
  ON api_observations(provider, endpoint, observed_at);
