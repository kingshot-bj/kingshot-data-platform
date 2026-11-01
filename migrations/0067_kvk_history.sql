-- KvK intraday score points (kept 60 days) and final results per season.
CREATE TABLE IF NOT EXISTS kvk_score_points (
  kid INTEGER NOT NULL,
  season INTEGER NOT NULL,
  at INTEGER NOT NULL,
  score INTEGER,
  opponent_score INTEGER,
  PRIMARY KEY (kid, season, at)
);

CREATE INDEX IF NOT EXISTS idx_kvk_score_points_at ON kvk_score_points(at);

CREATE TABLE IF NOT EXISTS kvk_season_results (
  kid INTEGER NOT NULL,
  season INTEGER NOT NULL,
  opponent INTEGER,
  score INTEGER,
  opponent_score INTEGER,
  result TEXT,
  finalized_at INTEGER NOT NULL,
  PRIMARY KEY (kid, season)
);
