-- A batch lease prevents two Admin sessions from executing the same saved queue concurrently.
-- A stale lease expires after 180 seconds and can be reclaimed when resuming.
ALTER TABLE mightpulse_probe_batches ADD COLUMN lease_token TEXT;
ALTER TABLE mightpulse_probe_batches ADD COLUMN lease_until INTEGER;
CREATE INDEX IF NOT EXISTS idx_mightpulse_probe_batches_lease
  ON mightpulse_probe_batches(lease_until, state);
