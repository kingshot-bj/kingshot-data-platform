const DEFAULT_SEMAPHORE_KEY = "GLOBAL_API";
const DEFAULT_CAPACITY = 26;

async function ensureCollectionSemaphoreSchema(db, capacity = DEFAULT_CAPACITY) {
  if (!db) return;
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS collection_semaphore (
      semaphore_key TEXT PRIMARY KEY,
      capacity INTEGER NOT NULL,
      active_count INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    )
  `).run();
  await db.prepare(`
    INSERT INTO collection_semaphore (semaphore_key, capacity, active_count, updated_at)
    VALUES (?, ?, 0, ?)
    ON CONFLICT(semaphore_key) DO NOTHING
  `).bind(DEFAULT_SEMAPHORE_KEY, Math.max(1, Number(capacity) || DEFAULT_CAPACITY), Math.floor(Date.now() / 1000)).run();
}

/**
 * Cross-isolate collection permit.
 *
 * Intentionally uses a single conditional UPDATE rather than SELECT+UPDATE or
 * polling. This keeps D1 reads at zero for the hot acquire path and makes
 * contention cheap: callers receive GLOBAL_COLLECTION_SEMAPHORE_FULL and can
 * retry through their existing local limiter.
 */
export async function acquireCollectionPermit(db, options = {}) {
  if (!db) return null;
  const key = String(options.key || DEFAULT_SEMAPHORE_KEY);
  const capacity = Math.max(1, Number(options.capacity) || DEFAULT_CAPACITY);
  await ensureCollectionSemaphoreSchema(db, capacity);
  const now = Math.floor(Date.now() / 1000);
  const token = crypto.randomUUID();
  const result = await db.prepare(`
    UPDATE collection_semaphore
    SET active_count = active_count + 1,
        updated_at = ?
    WHERE semaphore_key = ?
      AND active_count < capacity
  `).bind(now, key).run();

  if (Number(result?.meta?.changes || 0) !== 1) {
    const error = new Error("GLOBAL_COLLECTION_SEMAPHORE_FULL");
    error.code = "GLOBAL_COLLECTION_SEMAPHORE_FULL";
    error.status = 429;
    error.semaphoreKey = key;
    error.capacity = capacity;
    return { ok: false, error };
  }

  return {
    ok: true,
    token,
    key,
    acquiredAt: now
  };
}

export async function releaseCollectionPermit(db, permit) {
  if (!db || !permit?.ok) return false;
  const result = await db.prepare(`
    UPDATE collection_semaphore
    SET active_count = CASE WHEN active_count > 0 THEN active_count - 1 ELSE 0 END,
        updated_at = ?
    WHERE semaphore_key = ?
  `).bind(Math.floor(Date.now() / 1000), String(permit.key || DEFAULT_SEMAPHORE_KEY)).run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function getCollectionSemaphoreSnapshot(db, key = DEFAULT_SEMAPHORE_KEY) {
  if (!db) return null;
  await ensureCollectionSemaphoreSchema(db);
  const row = await db.prepare(
    "SELECT semaphore_key, capacity, active_count, updated_at FROM collection_semaphore WHERE semaphore_key = ? LIMIT 1"
  ).bind(key).first();
  if (!row) return null;
  const capacity = Math.max(1, Number(row.capacity) || DEFAULT_CAPACITY);
  const active = Math.max(0, Number(row.active_count) || 0);
  return {
    key: String(row.semaphore_key),
    capacity,
    active,
    available: Math.max(0, capacity - active),
    utilization_percent: Math.min(100, Math.round(active / capacity * 100)),
    updated_at: Number(row.updated_at || 0)
  };
}

export const COLLECTION_SEMAPHORE_DEFAULTS = Object.freeze({
  key: DEFAULT_SEMAPHORE_KEY,
  capacity: DEFAULT_CAPACITY
});
