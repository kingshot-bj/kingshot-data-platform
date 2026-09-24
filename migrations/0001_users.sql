-- EagleEye / D1
-- Migration 0001: core users table

CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL UNIQUE,
  username TEXT,
  global_name TEXT,
  avatar TEXT,
  role TEXT NOT NULL DEFAULT 'BASIC'
    CHECK (role IN ('BASIC', 'ADVANCED', 'ADMIN')),
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON users(last_login_at);
