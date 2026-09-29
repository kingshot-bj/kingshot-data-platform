-- EagleEye / D1
-- Migration 0022: Discord user ↔ KingShot player self-claim links
--
-- This is intentionally separate from player_watchlists:
-- user_player_links = "my KingShot player"
-- player_watchlists = "players I monitor"

CREATE TABLE IF NOT EXISTS user_player_links (
  link_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  governor_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'DISABLED')),
  verification_method TEXT NOT NULL DEFAULT 'SELF_CLAIM'
    CHECK (verification_method IN ('SELF_CLAIM', 'ADMIN_VERIFIED', 'API_VERIFIED', 'GAME_CODE')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  verified_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_user_player_links_governor
  ON user_player_links(governor_id, status);

CREATE INDEX IF NOT EXISTS idx_user_player_links_status
  ON user_player_links(status, updated_at DESC);
