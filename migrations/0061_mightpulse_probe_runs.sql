-- Probe execution metadata only. Raw responses live in R2 to minimize D1 storage and read/write usage.
CREATE TABLE IF NOT EXISTS mightpulse_probe_runs (
  request_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  user_id TEXT,
  actor_discord_id TEXT,
  actor_label TEXT,
  actor_role TEXT,
  command_type TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  status TEXT NOT NULL,
  http_status INTEGER,
  elapsed_ms INTEGER,
  response_bytes INTEGER,
  r2_object_key TEXT,
  error_code TEXT,
  trigger_reason TEXT NOT NULL DEFAULT 'MANUAL'
);
CREATE INDEX IF NOT EXISTS idx_mightpulse_probe_runs_created
  ON mightpulse_probe_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mightpulse_probe_runs_status_created
  ON mightpulse_probe_runs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mightpulse_probe_runs_actor_created
  ON mightpulse_probe_runs(actor_discord_id, created_at DESC);
