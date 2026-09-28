CREATE INDEX IF NOT EXISTS idx_api_leases_status_expires_at
  ON api_leases(status, expires_at);
