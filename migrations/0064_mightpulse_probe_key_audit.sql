ALTER TABLE mightpulse_probe_keys ADD COLUMN registered_by_user_id TEXT;
ALTER TABLE mightpulse_probe_runs ADD COLUMN key_source TEXT;
ALTER TABLE mightpulse_probe_runs ADD COLUMN key_id TEXT;
ALTER TABLE mightpulse_probe_runs ADD COLUMN key_owner_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_mightpulse_probe_runs_key_source_created
  ON mightpulse_probe_runs(key_source, created_at DESC);
