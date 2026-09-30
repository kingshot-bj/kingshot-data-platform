-- Support incident lookup: find the newest WARNING/FAILED event without scanning recent SUCCESS rows.
CREATE INDEX IF NOT EXISTS idx_diagnostic_events_status_created
  ON diagnostic_events(status, created_at DESC);
