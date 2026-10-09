-- EagleEye / D1
-- Migration 0058: per-user kingdom ranking preferences

CREATE TABLE IF NOT EXISTS user_kingdom_ranking_preferences (
  user_id TEXT PRIMARY KEY,
  kid INTEGER NOT NULL,
  boards_json TEXT NOT NULL DEFAULT '["personal_power"]',
  primary_board TEXT NOT NULL DEFAULT 'personal_power',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_kingdom_ranking_preferences_kid
  ON user_kingdom_ranking_preferences(kid);
