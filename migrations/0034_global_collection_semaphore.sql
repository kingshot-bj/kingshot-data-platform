-- Global collection semaphore: one compact counter row protects API concurrency across Worker isolates.
CREATE TABLE IF NOT EXISTS collection_semaphore (
  semaphore_key TEXT PRIMARY KEY,
  capacity INTEGER NOT NULL,
  active_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

INSERT INTO collection_semaphore (semaphore_key, capacity, active_count, updated_at)
VALUES ('GLOBAL_API', 26, 0, strftime('%s','now'))
ON CONFLICT(semaphore_key) DO NOTHING;
