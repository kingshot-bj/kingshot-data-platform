-- Player current-state index keeps only scalar searchable fields; latest detailed snapshot lives in R2.
ALTER TABLE players ADD COLUMN r2_latest_key TEXT;

CREATE INDEX IF NOT EXISTS idx_players_r2_latest
  ON players(r2_latest_key);
