-- Phase 2: bounded Kingdom Catalog / Discovery state.
CREATE TABLE IF NOT EXISTS kingdom_catalog (
  kid INTEGER PRIMARY KEY,
  name TEXT,
  status TEXT,
  region TEXT,
  language TEXT,
  raw_json TEXT,
  source_observed_at INTEGER,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kingdom_catalog_status
  ON kingdom_catalog(status, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS kingdom_catalog_discovery (
  discovery_key TEXT PRIMARY KEY,
  next_page INTEGER NOT NULL DEFAULT 1,
  page_size INTEGER NOT NULL DEFAULT 24,
  state TEXT NOT NULL DEFAULT 'IDLE' CHECK (state IN ('IDLE','RUNNING','PAUSED','FAILED')),
  pages_checked INTEGER NOT NULL DEFAULT 0,
  kingdoms_seen INTEGER NOT NULL DEFAULT 0,
  last_page_at INTEGER,
  last_success_at INTEGER,
  last_error TEXT,
  updated_at INTEGER NOT NULL
);

INSERT INTO kingdom_catalog_discovery
  (discovery_key, next_page, page_size, state, updated_at)
VALUES
  ('MIGHTPULSE_KINGDOMS', 1, 24, 'IDLE', strftime('%s','now'))
ON CONFLICT(discovery_key) DO NOTHING;
