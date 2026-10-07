-- EagleEye / D1
-- Migration 0054: per-user Mighty API credentials.
--
-- VIP role/check-constraint and watchlist schema repair are handled by
-- 0056_vip_role_schema_repair.sql so this migration remains additive.

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
