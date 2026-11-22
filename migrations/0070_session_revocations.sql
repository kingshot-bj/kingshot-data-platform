-- Per-user session revocation (see src/session-revocation.js; also created lazily).
CREATE TABLE IF NOT EXISTS session_revocations (
  discord_id TEXT PRIMARY KEY,
  revoked_before INTEGER NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL
);
