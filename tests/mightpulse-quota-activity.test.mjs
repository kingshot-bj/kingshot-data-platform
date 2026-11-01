import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { recordApiPoolSuccess } from "../src/api-pool.js";
import { savePlayerChangeEvents } from "../src/player-store.js";
import { MIGHTPULSE_PROBE_COMMANDS, buildCatalogProbeCommand } from "../src/mightpulse-probe.js";

const srcDir = new URL("../src/", import.meta.url);
const indexSource = await readFile(new URL("index.js", srcDir), "utf8");

// Minimal D1 stand-in that records every bound statement.
function recordingDb() {
  const statements = [];
  const db = {
    statements,
    prepare(sql) {
      return {
        bind(...args) {
          const stmt = { sql, args, run: async () => ({ meta: { changes: 1 } }), first: async () => null, all: async () => ({ results: [] }) };
          statements.push(stmt);
          return stmt;
        }
      };
    },
    batch: async list => list
  };
  return db;
}

test("rate-limit headers use the documented MightPulse names everywhere", async () => {
  for (const name of await readdir(srcDir)) {
    if (!name.endsWith(".js")) continue;
    const source = await readFile(new URL(name, srcDir), "utf8");
    assert.ok(!source.includes('"x-ratelimit-remaining"'), name + " reads undocumented x-ratelimit-remaining");
    assert.ok(!source.includes('"x-ratelimit-day-remaining"'), name + " reads undocumented x-ratelimit-day-remaining");
  }
  assert.ok(indexSource.includes('"x-ratelimit-remaining-minute"'));
  assert.ok(indexSource.includes('"x-ratelimit-remaining-day"'));
  assert.ok(indexSource.includes('"x-ratelimit-reset-day"'), "probe captures all documented rate-limit headers");
});

test("quota-free calls are logged with request_count 0, normal calls with 1", async () => {
  const db = recordingDb();
  await recordApiPoolSuccess(db, { keyId: "k1", leaseId: "l1", endpoint: "/usage", countsAgainstQuota: false });
  await recordApiPoolSuccess(db, { keyId: "k1", leaseId: "l2", endpoint: "/kvk/matchups" });
  const inserts = db.statements.filter(s => s.sql.includes("INSERT INTO api_pool_usage"));
  assert.equal(inserts.length, 2);
  const requestCountIndex = 10; // usage_id, key_id, provider, pool_type, endpoint, target_type, target_id, job_id, purpose, http_status, request_count
  assert.equal(inserts[0].args[requestCountIndex], 0);
  assert.equal(inserts[1].args[requestCountIndex], 1);
});

test("probe treats /usage as quota-free and lists it in the catalog", () => {
  assert.ok(indexSource.includes("countsAgainstQuota: !isQuotaFreeMightPulsePath(options.endpoint)"));
  assert.ok(indexSource.includes('return pathOnly === "/usage" || pathOnly === "/v1/usage";'));
  const usage = MIGHTPULSE_PROBE_COMMANDS.find(c => c.id === "api_usage");
  assert.ok(usage && usage.requiresMighty === false && usage.category === "Usage");
  assert.equal(buildCatalogProbeCommand("api_usage").path, "/usage");
  assert.ok(indexSource.includes("order=['Usage','Player'"), "Usage group must be rendered in the probe catalog");
  assert.ok(indexSource.includes("labels={Usage:'API使用量'"));
});

test("ordinary collection leases prefer non-Mighty keys", async () => {
  const engine = await readFile(new URL("data-collection-engine.js", srcDir), "utf8");
  assert.ok(engine.includes("leaseApiKey(env.DB, { poolTypes, purpose, targetType, targetId, preferNonMighty: true })"));
  const watchlistLease = indexSource.slice(indexSource.indexOf("async function fetchThroughWatchlistApiPool"), indexSource.indexOf("async function fetchKingdomRankingThroughApiPool"));
  assert.ok(watchlistLease.includes("preferNonMighty: true"));
  const playerLease = indexSource.slice(indexSource.indexOf("async function fetchPlayerThroughApiPool"), indexSource.indexOf("async function handlePlayerApi"));
  assert.ok(playerLease.includes("preferNonMighty: true"));
});

test("stale online values no longer create change events", async () => {
  const db = recordingDb();
  const previous = { governor_id: "1", power: 100, online: 0 };
  const current = { governor_id: "1", power: 100, online: true };
  await savePlayerChangeEvents(db, previous, current, { observation_id: "o1", observed_at: 1, payload: {} });
  assert.equal(db.statements.length, 0, "an online-only difference must not write change_events");

  const db2 = recordingDb();
  await savePlayerChangeEvents(db2, { governor_id: "1", power: 100, online: 0 }, { governor_id: "1", power: 200, online: true }, { observation_id: "o2", observed_at: 1, payload: {} });
  assert.equal(db2.statements.length, 1);
  assert.equal(db2.statements[0].args[2], "POWER_CHANGED");
});

test("online is not shown, exported or exposed in player responses", () => {
  assert.ok(!indexSource.includes('card("オンライン"'));
  assert.ok(!indexSource.includes('"オンライン": p.online'));
  assert.ok(!indexSource.includes("visible.online = player.online"));
  assert.ok(!indexSource.includes("online: player?.online"));
  assert.ok(indexSource.includes('if (field === "online" || field === "last_active_at" || field === "last_login") return false;'));
  const filter = indexSource.slice(indexSource.indexOf("function filterPlayerForRole"), indexSource.indexOf("function renderPlayerShell"));
  assert.ok(filter.includes("  delete visible.online;\n"), "online is removed for every role");
});
