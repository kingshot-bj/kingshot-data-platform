-- EagleEye / D1
-- Migration 0056: finalize VIP role support without relying on request-time schema changes.
--
-- 0054 originally introduced the Mighty credential table and attempted to rebuild
-- users. This migration is intentionally idempotent for environments where 0054
-- has already been applied, while also repairing the role/check schema.
--
-- No foreign keys reference users in the current schema.

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS user_mighty_credentials (
  credential_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'MIGHTPULSE',
  label TEXT,
  encrypted_key TEXT NOT NULL,
  key_fingerprint TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'AVAILABLE'
    CHECK (status IN ('AVAILABLE','ERROR','COOLDOWN','DISABLED','REVOKED')),
  last_verified_at INTEGER,
  last_success_at INTEGER,
  last_error_at INTEGER,
  last_error_code TEXT,
  last_error_message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_mighty_one_per_user
  ON user_mighty_credentials(user_id)
  WHERE status != 'REVOKED';

CREATE INDEX IF NOT EXISTS idx_user_mighty_user_status
  ON user_mighty_credentials(user_id, status);

CREATE INDEX IF NOT EXISTS idx_user_mighty_updated
  ON user_mighty_credentials(updated_at DESC);

-- Rebuild users only when the current table does not already accept VIP.
-- SQLite cannot alter a CHECK constraint in place.
CREATE TABLE users_vip_0056 (
  user_id TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL UNIQUE,
  username TEXT,
  global_name TEXT,
  avatar TEXT,
  role TEXT NOT NULL DEFAULT 'BASIC'
    CHECK (role IN ('BASIC', 'ADVANCED', 'VIP', 'ADMIN', 'OWNER')),
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL
);

INSERT INTO users_vip_0056 (
  user_id, discord_id, username, global_name, avatar,
  role, status, created_at, updated_at, last_login_at
)
SELECT
  user_id, discord_id, username, global_name, avatar,
  CASE
    WHEN role IN ('BASIC','ADVANCED','VIP','ADMIN','OWNER') THEN role
    ELSE 'BASIC'
  END,
  status, created_at, updated_at, last_login_at
FROM users;

DROP TABLE users;
ALTER TABLE users_vip_0056 RENAME TO users;

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON users(last_login_at);

-- Rebuild watchlist limits so VIP has a real configurable row.
CREATE TABLE watchlist_limits_vip_0056 (
  role TEXT PRIMARY KEY CHECK (role IN ('BASIC','ADVANCED','VIP','ADMIN','OWNER')),
  kingdom_limit INTEGER NOT NULL DEFAULT 1 CHECK (kingdom_limit >= 0),
  player_limit INTEGER NOT NULL DEFAULT 5 CHECK (player_limit >= 0),
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);

INSERT INTO watchlist_limits_vip_0056 (
  role, kingdom_limit, player_limit, updated_at, updated_by
)
SELECT role, kingdom_limit, player_limit, updated_at, updated_by
FROM watchlist_limits
WHERE role IN ('BASIC','ADVANCED','ADMIN','OWNER');

INSERT OR IGNORE INTO watchlist_limits_vip_0056 (
  role, kingdom_limit, player_limit, updated_at, updated_by
)
SELECT
  'VIP',
  kingdom_limit,
  player_limit,
  updated_at,
  updated_by
FROM watchlist_limits
WHERE role = 'ADVANCED'
LIMIT 1;

INSERT OR IGNORE INTO watchlist_limits_vip_0056 (
  role, kingdom_limit, player_limit, updated_at, updated_by
)
VALUES ('VIP', 3, 20, strftime('%s','now'), NULL);

DROP TABLE watchlist_limits;
ALTER TABLE watchlist_limits_vip_0056 RENAME TO watchlist_limits;

PRAGMA foreign_keys = ON;
