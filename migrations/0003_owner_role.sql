-- EagleEye / D1
-- Migration 0003: OWNER role
-- OWNER is the EagleEye owner account authority above ADMIN.

CREATE TABLE IF NOT EXISTS _eagleeye_owner_role_marker (
  marker_id INTEGER PRIMARY KEY CHECK (marker_id = 1)
);

-- SQLite cannot alter an existing CHECK constraint in place.
-- Production D1 should apply this migration by rebuilding users while
-- preserving all existing rows and indexes.
