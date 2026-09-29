-- EagleEye / D1
-- Migration 0020: retain login and OWNER audit history in R2 before D1 cleanup

ALTER TABLE data_retention_settings
  ADD COLUMN login_history_days INTEGER NOT NULL DEFAULT 90;

ALTER TABLE data_retention_settings
  ADD COLUMN owner_audit_log_days INTEGER NOT NULL DEFAULT 730;

CREATE INDEX IF NOT EXISTS idx_login_history_logged_in_at
  ON login_history (logged_in_at);

CREATE INDEX IF NOT EXISTS idx_owner_audit_created
  ON owner_audit_log (created_at DESC);
