-- EagleEye / D1
-- Migration 0053: add role threshold to player visibility settings.
-- Existing 0009 rows remain compatible; this migration is additive so
-- production migration history does not need to be rewritten.

ALTER TABLE player_visibility_settings
  ADD COLUMN min_role TEXT NOT NULL DEFAULT 'OWNER'
  CHECK (min_role IN ('BASIC','ADVANCED','ADMIN','OWNER'));

UPDATE player_visibility_settings
SET min_role = CASE item_key
  WHEN 'base_identity' THEN 'BASIC'
  WHEN 'base_power' THEN 'BASIC'
  WHEN 'base_kills' THEN 'BASIC'
  WHEN 'base_activity' THEN 'BASIC'
  WHEN 'alliance_identity' THEN 'BASIC'
  ELSE 'ADVANCED'
END
WHERE min_role = 'OWNER';