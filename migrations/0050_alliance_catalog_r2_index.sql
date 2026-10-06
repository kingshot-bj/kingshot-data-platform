-- Phase 2: keep Alliance Catalog details in R2 and D1 as a lightweight current index.
ALTER TABLE alliance_catalog ADD COLUMN r2_latest_key TEXT;

CREATE INDEX IF NOT EXISTS idx_alliance_catalog_r2_latest
  ON alliance_catalog(r2_latest_key);
