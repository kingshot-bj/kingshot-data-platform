-- EagleEye / D1
-- Migration 0014: lightweight player identity / name history.
--
-- D1 stores only identity transitions, not every observation.
-- A new row is written on first observation and on a name transition.
-- Re-observing the same name does not create a write.
CREATE TABLE IF NOT EXISTS player_identity_history (
  identity_history_id TEXT PRIMARY KEY,
  governor_id TEXT NOT NULL,
  name TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  source_observation_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_player_identity_history_governor
  ON player_identity_history (governor_id, first_seen_at ASC);

CREATE INDEX IF NOT EXISTS idx_player_identity_history_name
  ON player_identity_history (name, governor_id);
