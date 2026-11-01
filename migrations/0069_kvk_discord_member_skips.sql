-- Users Discord refused to add to a KvK thread (e.g. 50001, not in the server); retried after retry_after.
CREATE TABLE IF NOT EXISTS kvk_discord_member_skips (
  kid INTEGER NOT NULL,
  discord_id TEXT NOT NULL,
  retry_after INTEGER NOT NULL,
  error_code INTEGER,
  PRIMARY KEY (kid, discord_id)
);
