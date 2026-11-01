-- KvK matchups and scores (see src/kvk.js; the Worker also creates these lazily).
CREATE TABLE IF NOT EXISTS kvk_matchups (
  season INTEGER NOT NULL,
  kid INTEGER NOT NULL,
  opponent INTEGER,
  kingdom_name TEXT,
  opponent_name TEXT,
  PRIMARY KEY (season, kid)
);

CREATE TABLE IF NOT EXISTS kvk_scores (
  kid INTEGER PRIMARY KEY,
  season INTEGER,
  stage TEXT,
  opponent INTEGER,
  score INTEGER,
  opponent_score INTEGER,
  days_json TEXT,
  source_updated_at TEXT,
  payload_sha TEXT,
  fetched_at INTEGER NOT NULL,
  changed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_kvk_scores_fetched ON kvk_scores(fetched_at);

CREATE TABLE IF NOT EXISTS kvk_state (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER NOT NULL
);
