-- Keep the D1 kingdom catalog as a lightweight searchable index.
-- Detailed kingdom payloads are archived in R2.
ALTER TABLE kingdom_catalog ADD COLUMN r2_latest_key TEXT;

CREATE INDEX IF NOT EXISTS idx_kingdom_catalog_r2_latest
  ON kingdom_catalog(r2_latest_key);
