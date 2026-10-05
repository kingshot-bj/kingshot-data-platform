-- Improve Player Watchlist Change Event lookup without changing any data.
-- Existing rows remain untouched; this only adds a composite read index.
CREATE INDEX IF NOT EXISTS idx_change_events_player_type_time
  ON change_events(target_type, target_id, change_type, detected_at DESC, created_at DESC);
