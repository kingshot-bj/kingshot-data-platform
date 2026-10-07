-- EagleEye / D1
-- Migration 0054: VIP role + per-user Mighty API credentials

PRAGMA foreign_keys = OFF;

ALTER TABLE users RENAME TO users_legacy_0054;

CREATE TABLE users (
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

INSERT INTO users (
  user_id, discord_id, username, global_name, avatar, role, status,
  created_at, updated_at, last_login_at
)
SELECT
  user_id, discord_id, username, global_name, avatar, role, status,
  created_at, updated_at, last_login_at
FROM users_legacy_0054;

DROP TABLE users_legacy_0054;

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON users(last_login_at);

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

PRAGMA foreign_keys = ON;
