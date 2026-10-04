-- Phase 2: Alliance Catalog / Roller
CREATE TABLE IF NOT EXISTS alliance_catalog (
  kid INTEGER NOT NULL,
  aid TEXT NOT NULL,
  abbr TEXT,
  name TEXT,
  power TEXT,
  member_count INTEGER,
  leader_name TEXT,
  leader_uid TEXT,
  leader_governor_id TEXT,
  flag_url TEXT,
  power_rank INTEGER,
  raw_json TEXT,
  source_observed_at INTEGER,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (kid, aid)
);

CREATE INDEX IF NOT EXISTS idx_alliance_catalog_kid_abbr
  ON alliance_catalog(kid, abbr);

CREATE INDEX IF NOT EXISTS idx_alliance_catalog_last_seen
  ON alliance_catalog(last_seen_at);

CREATE TABLE IF NOT EXISTS alliance_collection_state (
  state_key TEXT PRIMARY KEY,
  catalog_cursor INTEGER NOT NULL DEFAULT 0,
  processed_runs INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  last_kid INTEGER,
  last_aid TEXT,
  last_success_at INTEGER,
  last_failure_at INTEGER,
  last_error TEXT,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO alliance_collection_state
  (state_key, catalog_cursor, processed_runs, success_count, failed_count, skipped_count, updated_at)
VALUES
  ('ALLIANCE_ROLLER', 0, 0, 0, 0, 0, strftime('%s','now'));
