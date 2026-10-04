-- Crash-safe global collection semaphore slots.
-- Each permit is an individually leased slot. A crashed Worker leaves only
-- its slot lease behind; the next acquire can atomically reclaim expired slots.
CREATE TABLE IF NOT EXISTS collection_semaphore_slots (
  semaphore_key TEXT NOT NULL,
  slot_id INTEGER NOT NULL,
  lease_token TEXT,
  lease_until INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (semaphore_key, slot_id)
);

INSERT INTO collection_semaphore_slots (semaphore_key, slot_id, lease_token, lease_until, updated_at)
VALUES
 ('GLOBAL_API',1,NULL,NULL,strftime('%s','now')),
 ('GLOBAL_API',2,NULL,NULL,strftime('%s','now')),
 ('GLOBAL_API',3,NULL,NULL,strftime('%s','now')),
 ('GLOBAL_API',4,NULL,NULL,strftime('%s','now')),
 ('GLOBAL_API',5,NULL,NULL,strftime('%s','now')),
 ('GLOBAL_API',6,NULL,NULL,strftime('%s','now')),
 ('GLOBAL_API',7,NULL,NULL,strftime('%s','now')),
 ('GLOBAL_API',8,NULL,NULL,strftime('%s','now')),
 ('GLOBAL_API',9,NULL,NULL,strftime('%s','now')),
 ('GLOBAL_API',10,NULL,NULL,strftime('%s','now')),
 ('GLOBAL_API',11,NULL,NULL,strftime('%s','now')),
 ('GLOBAL_API',12,NULL,NULL,strftime('%s','now')),
 ('GLOBAL_API',13,NULL,NULL,strftime('%s','now')),
 ('GLOBAL_API',14,NULL,NULL,strftime('%s','now')),
 ('GLOBAL_API',15,NULL,NULL,strftime('%s','now')),
 ('GLOBAL_API',16,NULL,NULL,strftime('%s','now')),
 ('GLOBAL_API',17,NULL,NULL,strftime('%s','now')),
 ('GLOBAL_API',18,NULL,NULL,strftime('%s','now')),
 ('GLOBAL_API',19,NULL,NULL,strftime('%s','now')),
 ('GLOBAL_API',20,NULL,NULL,strftime('%s','now')),
 ('GLOBAL_API',21,NULL,NULL,strftime('%s','now')),
 ('GLOBAL_API',22,NULL,NULL,strftime('%s','now')),
 ('GLOBAL_API',23,NULL,NULL,strftime('%s','now')),
 ('GLOBAL_API',24,NULL,NULL,strftime('%s','now')),
 ('GLOBAL_API',25,NULL,NULL,strftime('%s','now')),
 ('GLOBAL_API',26,NULL,NULL,strftime('%s','now'))
ON CONFLICT(semaphore_key, slot_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_collection_semaphore_slots_lease
  ON collection_semaphore_slots (semaphore_key, lease_until);
