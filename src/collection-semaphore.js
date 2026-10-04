const DEFAULT_SEMAPHORE_KEY = "GLOBAL_API";
const DEFAULT_CAPACITY = 26;
const DEFAULT_LEASE_SECONDS = 90;

async function ensureCollectionSemaphoreSchema(db) {
  // Schema is provisioned by migrations/0034 and 0036.
  // Never perform request-time DDL/INSERTs.
  return Boolean(db);
}

export async function acquireCollectionPermit(db, options = {}) {
  if (!db) return null;
  const key = String(options.key || DEFAULT_SEMAPHORE_KEY);
  const capacity = Math.max(1, Number(options.capacity) || DEFAULT_CAPACITY);
  const leaseSeconds = Math.max(15, Number(options.leaseSeconds) || DEFAULT_LEASE_SECONDS);
  await ensureCollectionSemaphoreSchema(db);
  const now = Math.floor(Date.now() / 1000);
  const leaseUntil = now + leaseSeconds;
  const token = crypto.randomUUID();

  // One atomic UPDATE chooses one free/expired slot. No SELECT/polling.
  const result = await db.prepare("UPDATE collection_semaphore_slots SET lease_token = ?, lease_until = ?, updated_at = ? WHERE semaphore_key = ? AND slot_id = (SELECT slot_id FROM collection_semaphore_slots WHERE semaphore_key = ? AND slot_id <= ? AND (lease_token IS NULL OR lease_until IS NULL OR lease_until <= ?) ORDER BY slot_id ASC LIMIT 1)").bind(token, leaseUntil, now, key, key, capacity, now).run();

  if (Number(result?.meta?.changes || 0) !== 1) {
    const error = new Error("GLOBAL_COLLECTION_SEMAPHORE_FULL");
    error.code = "GLOBAL_COLLECTION_SEMAPHORE_FULL";
    error.status = 429;
    error.semaphoreKey = key;
    error.capacity = capacity;
    return { ok: false, error };
  }
  return { ok: true, token, key, slotId: null, acquiredAt: now, leaseUntil };
}

export async function releaseCollectionPermit(db, permit) {
  if (!db || !permit?.ok) return false;
  const result = await db.prepare("UPDATE collection_semaphore_slots SET lease_token = NULL, lease_until = NULL, updated_at = ? WHERE semaphore_key = ? AND lease_token = ?").bind(Math.floor(Date.now() / 1000), String(permit.key || DEFAULT_SEMAPHORE_KEY), String(permit.token || "")).run();
  return Number(result?.meta?.changes || 0) === 1;
}

export async function refreshCollectionPermit(db, permit, leaseSeconds = DEFAULT_LEASE_SECONDS) {
  if (!db || !permit?.ok || !permit?.token) return false;
  const now = Math.floor(Date.now() / 1000);
  const leaseUntil = now + Math.max(15, Number(leaseSeconds) || DEFAULT_LEASE_SECONDS);
  const result = await db.prepare("UPDATE collection_semaphore_slots SET lease_until = ?, updated_at = ? WHERE semaphore_key = ? AND lease_token = ? AND lease_until > ?").bind(leaseUntil, now, String(permit.key || DEFAULT_SEMAPHORE_KEY), String(permit.token), now).run();
  if (Number(result?.meta?.changes || 0) === 1) { permit.leaseUntil = leaseUntil; return true; }
  return false;
}

export async function getCollectionSemaphoreSnapshot(db, key = DEFAULT_SEMAPHORE_KEY) {
  if (!db) return null;
  await ensureCollectionSemaphoreSchema(db);
  const now = Math.floor(Date.now() / 1000);
  const row = await db.prepare("SELECT semaphore_key, COUNT(*) AS capacity, SUM(CASE WHEN lease_token IS NOT NULL AND lease_until > ? THEN 1 ELSE 0 END) AS active, MAX(lease_until) AS latest_lease_until FROM collection_semaphore_slots WHERE semaphore_key = ? GROUP BY semaphore_key").bind(now, key).first();
  if (!row) return null;
  const capacity = Math.max(1, Number(row.capacity) || DEFAULT_CAPACITY);
  const active = Math.max(0, Number(row.active) || 0);
  return { key: String(row.semaphore_key), capacity, active, available: Math.max(0, capacity - active), utilization_percent: Math.min(100, Math.round(active / capacity * 100)), latest_lease_until: row.latest_lease_until ? Number(row.latest_lease_until) : null, recovery: "EXPIRED_SLOT_RECLAIM" };
}

export const COLLECTION_SEMAPHORE_DEFAULTS = Object.freeze({ key: DEFAULT_SEMAPHORE_KEY, capacity: DEFAULT_CAPACITY, leaseSeconds: DEFAULT_LEASE_SECONDS });

export function createCollectionSemaphoreLimiter(db, capacity = DEFAULT_CAPACITY) {
  return {
    capacity: Math.max(1, Number(capacity) || DEFAULT_CAPACITY),
    async acquire() {
      const permit = await acquireCollectionPermit(db, { capacity });
      if (!permit?.ok) throw permit?.error || new Error("GLOBAL_COLLECTION_SEMAPHORE_FULL");
      let released = false;
      return async () => { if (released) return; released = true; await releaseCollectionPermit(db, permit).catch(() => {}); };
    }
  };
}
