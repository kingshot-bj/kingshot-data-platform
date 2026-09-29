-- EagleEye / D1
-- Migration 0024: enforce one ACTIVE KingShot governor per EagleEye user

-- Application-level duplicate checks already exist in user-player-link.js.
-- This partial unique index is the DB-level race-condition guard.
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_player_links_active_governor
  ON user_player_links(governor_id)
  WHERE status = 'ACTIVE';
