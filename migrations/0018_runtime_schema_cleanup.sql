-- Move stable runtime configuration schemas/seeds into migrations.
-- These tables are configuration/state, not request-time schema.

CREATE TABLE IF NOT EXISTS watchlist_limits (
  role TEXT PRIMARY KEY CHECK (role IN ('BASIC','ADVANCED','ADMIN','OWNER')),
  kingdom_limit INTEGER NOT NULL DEFAULT 1 CHECK (kingdom_limit >= 0),
  player_limit INTEGER NOT NULL DEFAULT 5 CHECK (player_limit >= 0),
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);

INSERT INTO watchlist_limits (role, kingdom_limit, player_limit, updated_at, updated_by)
VALUES
  ('BASIC', 1, 5, strftime('%s','now'), NULL),
  ('ADVANCED', 3, 20, strftime('%s','now'), NULL),
  ('ADMIN', 10, 50, strftime('%s','now'), NULL),
  ('OWNER', 50, 200, strftime('%s','now'), NULL)
ON CONFLICT(role) DO NOTHING;

CREATE TABLE IF NOT EXISTS diagnostic_events (
  event_id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  service TEXT NOT NULL,
  feature TEXT NOT NULL,
  operation TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('SUCCESS','WARNING','FAILED')),
  error_code TEXT,
  message TEXT,
  provider TEXT,
  target_type TEXT,
  target_id TEXT,
  started_at INTEGER NOT NULL,
  completed_at INTEGER NOT NULL,
  elapsed_ms INTEGER NOT NULL DEFAULT 0,
  source_observed_at INTEGER,
  rows_received INTEGER,
  rows_saved INTEGER,
  metadata_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_events_created
  ON diagnostic_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_diagnostic_events_service
  ON diagnostic_events(service, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_diagnostic_events_trace
  ON diagnostic_events(trace_id);
