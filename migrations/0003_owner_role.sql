-- EagleEye / D1
-- Migration 0003: OWNER role
-- OWNER is the EagleEye owner account authority above ADMIN.

PRAGMA foreign_keys = OFF;

ALTER TABLE users RENAME TO users_legacy_0003;

CREATE TABLE users (
  user_id TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL UNIQUE,
  username TEXT,
  global_name TEXT,
  avatar TEXT,
  role TEXT NOT NULL DEFAULT 'BASIC'
    CHECK (role IN ('BASIC', 'ADVANCED', 'ADMIN', 'OWNER')),
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
FROM users_legacy_0003;

DROP TABLE users_legacy_0003;

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON users(last_login_at);

PRAGMA foreign_keys = ON;
