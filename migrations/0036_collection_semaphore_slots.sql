-- Crash-safe global collection semaphore slots.
-- Each permit is an individually leased slot. A crashed Worker leaves only
-- its slot lease behind; the next acquire can atomically reclaim expired slots.
-- Keep a generous pre-provisioned slot pool so request-time code never needs
-- DDL/INSERTs when the API Pool grows.
CREATE TABLE IF NOT EXISTS collection_semaphore_slots (
  semaphore_key TEXT NOT NULL,
  slot_id INTEGER NOT NULL,
  lease_token TEXT,
  lease_until INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (semaphore_key, slot_id)
);

WITH RECURSIVE seq(slot_id) AS (
  SELECT 1
  UNION ALL
  SELECT slot_id + 1 FROM seq WHERE slot_id < 1000
)
INSERT INTO collection_semaphore_slots (semaphore_key, slot_id, lease_token, lease_until, updated_at)
SELECT 'GLOBAL_API', slot_id, NULL, NULL, strftime('%s','now')
FROM seq
ON CONFLICT(semaphore_key, slot_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_collection_semaphore_slots_lease
  ON collection_semaphore_slots (semaphore_key, lease_until);
