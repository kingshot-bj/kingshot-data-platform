-- Batches keep only execution metadata and pending command descriptors in D1.
-- Full upstream responses remain in R2.
ALTER TABLE mightpulse_probe_runs ADD COLUMN batch_id TEXT;
ALTER TABLE mightpulse_probe_runs ADD COLUMN sequence_no INTEGER;
ALTER TABLE mightpulse_probe_runs ADD COLUMN discovered_from TEXT;
ALTER TABLE mightpulse_probe_runs ADD COLUMN response_count INTEGER;
ALTER TABLE mightpulse_probe_runs ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mightpulse_probe_runs ADD COLUMN save_destination TEXT;
CREATE INDEX IF NOT EXISTS idx_mightpulse_probe_runs_batch_sequence
  ON mightpulse_probe_runs(batch_id, sequence_no);

CREATE TABLE IF NOT EXISTS mightpulse_probe_batches (
  batch_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  user_id TEXT,
  state TEXT NOT NULL,
  batch_type TEXT NOT NULL,
  total_commands INTEGER NOT NULL DEFAULT 0,
  completed_commands INTEGER NOT NULL DEFAULT 0,
  pending_json TEXT NOT NULL DEFAULT '[]',
  seen_json TEXT NOT NULL DEFAULT '[]',
  next_sequence INTEGER NOT NULL DEFAULT 1,
  concurrency INTEGER NOT NULL DEFAULT 2,
  max_commands INTEGER NOT NULL DEFAULT 30,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_mightpulse_probe_batches_updated
  ON mightpulse_probe_batches(updated_at DESC);
