-- Optimize per-user Advanced eligibility checks without broad API pool scans.
CREATE INDEX IF NOT EXISTS idx_api_pool_keys_user_contributed
  ON api_pool_keys(provider, pool_type, contributed_by_user_id, contributed_at DESC);
