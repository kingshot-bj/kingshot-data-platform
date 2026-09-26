-- EagleEye / D1
-- Migration 0010: OWNER control center audit + login history

CREATE TABLE IF NOT EXISTS login_history (
  login_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  username TEXT,
  global_name TEXT,
  logged_in_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_history_user_time
  ON login_history(user_id, logged_in_at DESC);

CREATE INDEX IF NOT EXISTS idx_login_history_discord_time
  ON login_history(discord_id, logged_in_at DESC);

CREATE TABLE IF NOT EXISTS owner_audit_log (
  audit_id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  actor_discord_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_user_id TEXT,
  target_discord_id TEXT,
  details_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_owner_audit_created
  ON owner_audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_owner_audit_target
  ON owner_audit_log(target_user_id, created_at DESC);
