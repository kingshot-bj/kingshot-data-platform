-- Stable runtime coordination lock used by OWNER Load Test and cancellation recovery.
-- Request-time code must not perform schema DDL.
CREATE TABLE IF NOT EXISTS api_request_locks (
  lock_key TEXT PRIMARY KEY,
  lock_token TEXT NOT NULL,
  lock_until INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_request_locks_until
  ON api_request_locks(lock_until);
