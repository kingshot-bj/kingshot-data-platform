-- KvK Discord private threads per kingdom, their members, and the message outbox (see src/kvk-discord.js).
CREATE TABLE IF NOT EXISTS kvk_discord_threads (
  kid INTEGER PRIMARY KEY,
  thread_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  member_sync_at INTEGER
);

CREATE TABLE IF NOT EXISTS kvk_discord_members (
  kid INTEGER NOT NULL,
  discord_id TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (kid, discord_id)
);

CREATE TABLE IF NOT EXISTS kvk_discord_outbox (
  message_key TEXT PRIMARY KEY,
  kid INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  status TEXT
);

CREATE INDEX IF NOT EXISTS idx_kvk_discord_outbox_pending ON kvk_discord_outbox(sent_at, created_at);
