CREATE TABLE IF NOT EXISTS system_event_log (
  event_id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  parent_trace_id TEXT,
  event_type TEXT NOT NULL,
  service TEXT NOT NULL,
  feature TEXT,
  operation TEXT,
  status TEXT NOT NULL,
  actor_type TEXT,
  actor_id TEXT,
  target_type TEXT,
  target_id TEXT,
  http_method TEXT,
  http_path TEXT,
  http_status INTEGER,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  elapsed_ms INTEGER,
  error_code TEXT,
  message TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_system_event_log_created ON system_event_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_event_log_trace ON system_event_log(trace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_system_event_log_operation ON system_event_log(operation, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_event_log_status ON system_event_log(status, created_at DESC);
