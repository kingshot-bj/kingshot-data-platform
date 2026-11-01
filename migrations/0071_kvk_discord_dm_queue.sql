-- One welcome DM per user added to a KvK thread (see src/kvk-discord.js; also created lazily).
CREATE TABLE IF NOT EXISTS kvk_discord_dm_queue (
  kid INTEGER NOT NULL,
  discord_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  status TEXT,
  PRIMARY KEY (kid, discord_id)
);
