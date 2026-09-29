-- EagleEye / D1
-- Migration 0026: multi-account KingShot links
-- Free plan: up to 2 kingdoms, and 1 MAIN + 1 SUB per kingdom.
-- The schema intentionally supports future paid expansion without exposing it yet.

-- When migrations are applied to a fresh database, 0022 may not have created the table yet.
-- Create the legacy shape first so the copy below is safe; the table is replaced by v2 immediately after.
CREATE TABLE IF NOT EXISTS user_player_links (
  link_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  governor_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  verification_method TEXT NOT NULL DEFAULT 'SELF_CLAIM' CHECK (verification_method IN ('SELF_CLAIM', 'ADMIN_VERIFIED', 'API_VERIFIED', 'GAME_CODE')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  verified_at INTEGER,
  official_verified_at INTEGER,
  official_verified_by_user_id TEXT
);

CREATE TABLE IF NOT EXISTS user_player_links_v2 (
  link_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  governor_id TEXT NOT NULL,
  kingdom_id INTEGER NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'MAIN'
    CHECK (account_type IN ('MAIN', 'SUB')),
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'DISABLED')),
  verification_method TEXT NOT NULL DEFAULT 'SELF_CLAIM'
    CHECK (verification_method IN ('SELF_CLAIM', 'ADMIN_VERIFIED', 'API_VERIFIED', 'GAME_CODE')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  verified_at INTEGER,
  official_verified_at INTEGER,
  official_verified_by_user_id TEXT
);

INSERT INTO user_player_links_v2 (
  link_id, user_id, governor_id, kingdom_id, account_type, status,
  verification_method, created_at, updated_at, verified_at,
  official_verified_at, official_verified_by_user_id
)
SELECT
  link_id,
  user_id,
  governor_id,
  COALESCE((SELECT kid FROM players WHERE players.governor_id = user_player_links.governor_id LIMIT 1), 0),
  'MAIN',
  status,
  verification_method,
  created_at,
  updated_at,
  verified_at,
  official_verified_at,
  official_verified_by_user_id
FROM user_player_links;

DROP TABLE user_player_links;
ALTER TABLE user_player_links_v2 RENAME TO user_player_links;

CREATE INDEX IF NOT EXISTS idx_user_player_links_user_status
  ON user_player_links(user_id, status, kingdom_id, account_type);

CREATE INDEX IF NOT EXISTS idx_user_player_links_governor_status
  ON user_player_links(governor_id, status);

CREATE INDEX IF NOT EXISTS idx_user_player_links_kingdom
  ON user_player_links(user_id, kingdom_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_player_links_active_governor
  ON user_player_links(governor_id)
  WHERE status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_player_links_active_user_governor
  ON user_player_links(user_id, governor_id)
  WHERE status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_player_links_active_main
  ON user_player_links(user_id, kingdom_id)
  WHERE status = 'ACTIVE' AND account_type = 'MAIN';
