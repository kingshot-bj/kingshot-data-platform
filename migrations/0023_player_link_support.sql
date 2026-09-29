-- KingShot ownership dispute / support workflow.
ALTER TABLE user_player_links ADD COLUMN official_verified_at INTEGER;
ALTER TABLE user_player_links ADD COLUMN official_verified_by_user_id TEXT;

CREATE TABLE IF NOT EXISTS user_player_link_support_requests (
  request_id TEXT PRIMARY KEY,
  requester_user_id TEXT NOT NULL,
  governor_id TEXT NOT NULL,
  conflicting_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED', 'CANCELLED')),
  discord_support_url TEXT,
  note TEXT,
  resolution_note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  resolved_at INTEGER,
  resolved_by_user_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_player_link_support_requester
  ON user_player_link_support_requests(requester_user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_player_link_support_governor
  ON user_player_link_support_requests(governor_id, status, updated_at DESC);
