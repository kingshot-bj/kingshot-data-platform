CREATE TABLE IF NOT EXISTS history_emergency_buffer (
  buffer_id TEXT PRIMARY KEY,
  history_type TEXT NOT NULL,
  kid INTEGER,
  board TEXT,
  governor_id TEXT,
  observed_at INTEGER NOT NULL,
  source_observed_at INTEGER,
  source_observation_id TEXT,
  payload_json TEXT NOT NULL,
  payload_bytes INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','DRAINING','FAILED')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_history_emergency_buffer_status_created
  ON history_emergency_buffer (status, created_at);
