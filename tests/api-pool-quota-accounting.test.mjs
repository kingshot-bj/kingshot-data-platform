import test from "node:test";
import assert from "node:assert/strict";
import { getApiPoolBudgetSnapshot } from "../src/api-pool.js";

function makeDb(keys, { peakMinute = 0, usedDay = 0 } = {}) {
  return {
    prepare(sql) {
      return {
        bind(...bindings) {
          return {
            all: async () => {
              if (sql.includes("FROM api_pool_keys k")) return { results: keys };
              return { results: [] };
            },
            first: async () => {
              if (sql.includes("GROUP BY minute_bucket")) return { requests: peakMinute };
              if (sql.includes("COALESCE(SUM(request_count), 0)")) return { requests: usedDay };
              return null;
            },
            run: async () => ({ success: true })
          };
        }
      };
    }
  };
}

test("budget snapshot uses published per-key quotas when response headers are absent", async () => {
  const now = 1_800_000_000;
  const db = makeDb([
    {
      key_id: "standard", pool_type: "USER_CONTRIBUTED", status: "AVAILABLE",
      cooldown_until: null, leased_until: null, quota_per_minute: null, quota_per_day: null,
      remaining_minute: null, remaining_day: null, mighty_capable: 0, mighty_check_status: "NOT_MIGHTY",
      used_minute: 7, used_day: 30, updated_at: now
    },
    {
      key_id: "mighty", pool_type: "USER_CONTRIBUTED", status: "AVAILABLE",
      cooldown_until: null, leased_until: null, quota_per_minute: null, quota_per_day: null,
      remaining_minute: null, remaining_day: null, mighty_capable: 1, mighty_check_status: "CONFIRMED",
      used_minute: 0, used_day: 0, updated_at: now
    }
  ], { peakMinute: 10, usedDay: 100 });

  const snapshot = await getApiPoolBudgetSnapshot(db, { now, poolTypes: ["USER_CONTRIBUTED"] });
  assert.equal(snapshot.availableKeys, 2);
  assert.equal(snapshot.remainingMinute, 173); // (60 - 7) + 120
  assert.equal(snapshot.remainingDay, 14_970); // (5,000 - 30) + 10,000
  assert.equal(snapshot.minRemainingMinute, 53);
  assert.equal(snapshot.minRemainingDay, 4_970);
  assert.equal(snapshot.quotaSource, "LOCAL_REQUEST_ACCOUNTING");
  assert.equal(snapshot.measuredPeakMinuteRequests, 10);
  assert.equal(snapshot.measuredUsedDayRequests, 100);
});

test("budget snapshot excludes leased and cooling-down keys from spendable quota", async () => {
  const now = 1_800_000_000;
  const db = makeDb([
    {
      key_id: "leased", pool_type: "USER_CONTRIBUTED", status: "AVAILABLE",
      cooldown_until: null, leased_until: now + 30, quota_per_minute: 60, quota_per_day: 5000,
      mighty_capable: 0, mighty_check_status: "NOT_MIGHTY", used_minute: 0, used_day: 0, updated_at: now
    },
    {
      key_id: "cooling", pool_type: "USER_CONTRIBUTED", status: "COOLDOWN",
      cooldown_until: now + 30, leased_until: null, quota_per_minute: 60, quota_per_day: 5000,
      mighty_capable: 0, mighty_check_status: "NOT_MIGHTY", used_minute: 0, used_day: 0, updated_at: now
    }
  ]);

  const snapshot = await getApiPoolBudgetSnapshot(db, { now, poolTypes: ["USER_CONTRIBUTED"] });
  assert.equal(snapshot.availableKeys, 0);
  assert.equal(snapshot.remainingMinute, 0);
  assert.equal(snapshot.remainingDay, 0);
});
