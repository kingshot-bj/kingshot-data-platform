-- 0056: Staged, idempotent storage for hero portrait icons.
-- Image bytes live under hero-icons/v1/ in R2; this table contains only metadata.
CREATE TABLE IF NOT EXISTS hero_icon_assets (
  hero_id TEXT PRIMARY KEY,
  hero_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  object_key TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SAVING', 'SAVED', 'FAILED', 'UNSUPPORTED_HOST')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  saved_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_hero_icon_assets_status_updated
  ON hero_icon_assets(status, updated_at);
