-- EagleEye / D1
-- Migration 0004: player current state + snapshots

CREATE TABLE IF NOT EXISTS players (
  governor_id TEXT PRIMARY KEY,
  uid INTEGER,
  fid TEXT,
  nick_name TEXT,
  kid INTEGER,
  power INTEGER,
  town_center_level INTEGER,
  vip INTEGER,
  x INTEGER,
  y INTEGER,
  kills INTEGER,
  office INTEGER,
  online INTEGER,
  last_active_at INTEGER,
  last_login TEXT,
  avatar_url TEXT,
  language TEXT,
  shield_endtime INTEGER,
  burn_endtime INTEGER,
  alliance_aid INTEGER,
  alliance_abbr TEXT,
  alliance_name TEXT,
  alliance_rank INTEGER,
  alliance_rank_label TEXT,
  alliance_power INTEGER,
  alliance_count INTEGER,
  alliance_leader_name TEXT,
  observed_at INTEGER NOT NULL,
  source_observation_id TEXT,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_players_kid ON players(kid);
CREATE INDEX IF NOT EXISTS idx_players_alliance ON players(alliance_aid);
CREATE INDEX IF NOT EXISTS idx_players_power ON players(power);
CREATE INDEX IF NOT EXISTS idx_players_nick_name ON players(nick_name);

CREATE TABLE IF NOT EXISTS player_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  governor_id TEXT NOT NULL,
  observation_id TEXT,
  observed_at INTEGER NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_player_snapshots_player_time
  ON player_snapshots(governor_id, observed_at);
