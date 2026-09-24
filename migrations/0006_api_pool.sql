CREATE TABLE IF NOT EXISTS api_pool_keys (
  key_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  pool_type TEXT NOT NULL
    CHECK (pool_type IN ('SYSTEM_GENERAL', 'SYSTEM_WATCHLIST', 'USER_CONTRIBUTED')),
  label TEXT,
  encrypted_key TEXT NOT NULL,
  key_fingerprint TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'AVAILABLE'
    CHECK (status IN ('AVAILABLE', 'COOLDOWN', 'ERROR', 'DISABLED', 'REVOKED')),
  contributed_by_user_id TEXT,
  consent_version TEXT,
  contributed_at INTEGER,
  revoked_at INTEGER,
  quota_per_minute INTEGER,
  quota_per_day INTEGER,
  remaining_minute INTEGER,
  remaining_day INTEGER,
  quota_reset_at INTEGER,
  cooldown_until INTEGER,
  last_used_at INTEGER,
  last_success_at INTEGER,
  last_error_at INTEGER,
  last_error_code TEXT,
  last_error_message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_pool_keys_pool_status
  ON api_pool_keys(pool_type, status);

CREATE INDEX IF NOT EXISTS idx_api_pool_keys_provider_status
  ON api_pool_keys(provider, status);

CREATE INDEX IF NOT EXISTS idx_api_pool_keys_cooldown
  ON api_pool_keys(cooldown_until);

CREATE TABLE IF NOT EXISTS api_pool_usage (
  usage_id TEXT PRIMARY KEY,
  key_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  pool_type TEXT NOT NULL,
  endpoint TEXT,
  target_type TEXT,
  target_id TEXT,
  job_id TEXT,
  purpose TEXT,
  http_status INTEGER,
  request_count INTEGER NOT NULL DEFAULT 1,
  measured_quota INTEGER,
  measured_remaining INTEGER,
  estimated INTEGER NOT NULL DEFAULT 0,
  used_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_pool_usage_key_time
  ON api_pool_usage(key_id, used_at);

CREATE INDEX IF NOT EXISTS idx_api_pool_usage_pool_time
  ON api_pool_usage(pool_type, used_at);

CREATE INDEX IF NOT EXISTS idx_api_pool_usage_job
  ON api_pool_usage(job_id);

CREATE TABLE IF NOT EXISTS api_leases (
  lease_id TEXT PRIMARY KEY,
  key_id TEXT NOT NULL,
  pool_type TEXT NOT NULL,
  job_id TEXT,
  purpose TEXT,
  target_type TEXT,
  target_id TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'RELEASED', 'EXPIRED')),
  leased_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  released_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_leases_active
  ON api_leases(key_id, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_api_leases_job
  ON api_leases(job_id);

CREATE INDEX IF NOT EXISTS idx_api_leases_target
  ON api_leases(target_type, target_id);
