-- Phase 2: Alliance Roller state hardening
ALTER TABLE alliance_collection_state ADD COLUMN state TEXT NOT NULL DEFAULT 'IDLE';
