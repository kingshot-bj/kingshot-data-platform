-- EagleEye / D1
-- Migration 0055: allow VIP as a player-visibility role threshold

PRAGMA foreign_keys = OFF;

ALTER TABLE player_visibility_settings RENAME TO player_visibility_settings_legacy_0055;

CREATE TABLE player_visibility_settings (
  item_key TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  basic_enabled INTEGER NOT NULL DEFAULT 0,
  advanced_enabled INTEGER NOT NULL DEFAULT 0,
  admin_enabled INTEGER NOT NULL DEFAULT 1,
  owner_enabled INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  updated_by TEXT,
  min_role TEXT NOT NULL DEFAULT 'OWNER'
    CHECK (min_role IN ('BASIC','ADVANCED','VIP','ADMIN','OWNER'))
);

INSERT INTO player_visibility_settings (
  item_key, category, label, description,
  basic_enabled, advanced_enabled, admin_enabled, owner_enabled,
  updated_at, updated_by, min_role
)
SELECT
  item_key, category, label, description,
  basic_enabled, advanced_enabled, admin_enabled, owner_enabled,
  updated_at, updated_by,
  CASE
    WHEN min_role IN ('BASIC','ADVANCED','VIP','ADMIN','OWNER') THEN min_role
    ELSE 'OWNER'
  END
FROM player_visibility_settings_legacy_0055;

DROP TABLE player_visibility_settings_legacy_0055;

PRAGMA foreign_keys = ON;
