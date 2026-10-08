-- API Pool contributor / Mighty capability metadata
ALTER TABLE api_pool_keys ADD COLUMN mighty_capable INTEGER NOT NULL DEFAULT 0;
ALTER TABLE api_pool_keys ADD COLUMN mighty_checked_at INTEGER;
ALTER TABLE api_pool_keys ADD COLUMN mighty_check_status TEXT NOT NULL DEFAULT 'UNCONFIRMED';
ALTER TABLE api_pool_keys ADD COLUMN mighty_last_error_code TEXT;
