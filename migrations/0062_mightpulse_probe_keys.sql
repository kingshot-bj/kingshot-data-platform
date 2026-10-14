-- Dedicated Probe keys are isolated from production API Pool keys.
CREATE TABLE IF NOT EXISTS mightpulse_probe_keys (
  key_id TEXT PRIMARY KEY,
  label TEXT,
  encrypted_key TEXT NOT NULL,
  key_fingerprint TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'AVAILABLE'
    CHECK (status IN ('AVAILABLE','COOLDOWN','ERROR','DISABLED','REVOKED')),
  mighty_capable INTEGER NOT NULL DEFAULT 0,
  mighty_check_status TEXT NOT NULL DEFAULT 'UNCONFIRMED',
  mighty_checked_at INTEGER,
  last_used_at INTEGER,
  last_success_at INTEGER,
  last_error_at INTEGER,
  last_error_code TEXT,
  cooldown_until INTEGER,
  lease_id TEXT,
  leased_until INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_mightpulse_probe_keys_available
  ON mightpulse_probe_keys(status, mighty_capable, leased_until, last_used_at);
CREATE INDEX IF NOT EXISTS idx_mightpulse_probe_keys_fingerprint
  ON mightpulse_probe_keys(key_fingerprint);
