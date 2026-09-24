CREATE TABLE IF NOT EXISTS change_events (
  event_id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  change_type TEXT NOT NULL,
  field_name TEXT NOT NULL,
  old_value_json TEXT,
  new_value_json TEXT,
  observation_id TEXT,
  detected_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_change_events_target_time
  ON change_events(target_type, target_id, detected_at);

CREATE INDEX IF NOT EXISTS idx_change_events_type_time
  ON change_events(change_type, detected_at);

CREATE INDEX IF NOT EXISTS idx_change_events_observation
  ON change_events(observation_id);
