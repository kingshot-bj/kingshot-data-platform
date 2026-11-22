import test from "node:test";
import assert from "node:assert/strict";
import { leaseApiKey } from "../src/api-pool.js";

async function captureNoLease(options) {
  let sql = "";
  let bindings = [];
  const db = {
    prepare(query) {
      sql = query;
      return {
        bind(...args) {
          bindings = args;
          return { first: async () => null };
        }
      };
    }
  };
  await assert.rejects(leaseApiKey(db, options), /NO_API_POOL_KEY_AVAILABLE/);
  assert.equal((sql.match(/\?/g) || []).length, bindings.length, "every SQL placeholder must have a binding");
  return { sql, bindings };
}

test("ordinary Probe lease prefers non-Mighty keys and preserves one confirmed Mighty key", async () => {
  const { sql } = await captureNoLease({
    poolTypes: ["SYSTEM_GENERAL", "SYSTEM_WATCHLIST", "USER_CONTRIBUTED"],
    purpose: "MIGHTPULSE_PROBE_MANUAL",
    reserveAvailableKeys: 1,
    reserveMightyKeys: 1,
    preferNonMighty: true,
    mightyOnly: false
  });
  assert.match(sql, /reserve_mighty\.mighty_capable = 1/);
  assert.match(sql, /reserve_mighty\.mighty_check_status = 'CONFIRMED'/);
  assert.match(sql, /CASE WHEN mighty_capable = 1 AND mighty_check_status = 'CONFIRMED' THEN 1 ELSE 0 END/);
  assert.match(sql, /COUNT\(\*\).* > \?/s);
});

test("Mighty-required Probe lease only claims confirmed Mighty keys and reserves one eligible key", async () => {
  const { sql } = await captureNoLease({
    poolTypes: ["SYSTEM_GENERAL", "SYSTEM_WATCHLIST", "USER_CONTRIBUTED"],
    purpose: "MIGHTPULSE_PROBE_BATCH",
    reserveAvailableKeys: 1,
    mightyOnly: true
  });
  assert.match(sql, /mighty_capable = 1 AND mighty_check_status = 'CONFIRMED'/);
  assert.match(sql, /reserve_keys\.mighty_capable = 1 AND reserve_keys\.mighty_check_status = 'CONFIRMED'/);
  assert.doesNotMatch(sql, /reserve_mighty\.mighty_capable/);
});
