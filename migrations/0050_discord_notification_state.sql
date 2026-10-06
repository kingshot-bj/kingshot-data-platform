CREATE TABLE IF NOT EXISTS discord_notification_state (
  notification_key TEXT PRIMARY KEY,
  last_event_at INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_discord_notification_state_updated
  ON discord_notification_state(updated_at);
