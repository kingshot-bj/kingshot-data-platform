-- Move API Pool lease coordination onto api_pool_keys.
-- The legacy api_leases table is intentionally retained during the transition
-- so existing rows can expire naturally before the table is retired.

ALTER TABLE api_pool_keys ADD COLUMN lease_id TEXT;
ALTER TABLE api_pool_keys ADD COLUMN leased_until INTEGER;
ALTER TABLE api_pool_keys ADD COLUMN lease_job_id TEXT;
ALTER TABLE api_pool_keys ADD COLUMN lease_purpose TEXT;
ALTER TABLE api_pool_keys ADD COLUMN lease_target_type TEXT;
ALTER TABLE api_pool_keys ADD COLUMN lease_target_id TEXT;

CREATE INDEX IF NOT EXISTS idx_api_pool_keys_lease
  ON api_pool_keys(provider, pool_type, status, leased_until, cooldown_until, last_used_at, created_at);
