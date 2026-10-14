import test from "node:test";
import assert from "node:assert/strict";
import { validateManualProbeCommand, redactProbeSecrets, archiveMightPulseProbeRecord } from "../src/mightpulse-probe.js";

test("manual command accepts a relative MightPulse path and scalar query values", () => {
  assert.deepEqual(
    validateManualProbeCommand({ path: "/players/225623582", query: { include: "base,ranks", limit: 20, fresh: false } }),
    { path: "/players/225623582", query: { include: "base,ranks", limit: 20, fresh: false } }
  );
});

test("manual command rejects external URLs, host-relative paths, traversal and nested values", () => {
  for (const path of ["https://example.com/players", "//example.com/players", "/players/../admin", "/players\\\\225623582"]) {
    assert.throws(() => validateManualProbeCommand({ path, query: {} }));
  }
  assert.throws(() => validateManualProbeCommand({ path: "/players/1", query: { include: { nested: true } } }), /PROBE_QUERY_VALUES_MUST_BE_SCALARS/);
});

test("manual command enforces bounded path and query sizes", () => {
  assert.throws(() => validateManualProbeCommand({ path: "/" + "a".repeat(501), query: {} }), /PROBE_PATH_REQUIRED_OR_TOO_LONG/);
  assert.throws(() => validateManualProbeCommand({ path: "/players/1", query: Object.fromEntries(Array.from({ length: 51 }, (_, i) => ["q" + i, "x"])) }), /PROBE_QUERY_TOO_MANY_FIELDS/);
});

test("secret-like response fields are redacted recursively", () => {
  assert.deepEqual(redactProbeSecrets({
    player: { name: "Example", api_key: "private", details: { access_token: "private-too" } },
    values: [{ password: "hidden", score: 7 }]
  }), {
    player: { name: "Example", api_key: "[REDACTED]", details: { access_token: "[REDACTED]" } },
    values: [{ password: "[REDACTED]", score: 7 }]
  });
});

test("archive writes raw record to R2 and only metadata to D1", async () => {
  let savedKey = null;
  let savedBody = null;
  let insertSql = "";
  const env = {
    ARCHIVE: { put: async (key, body) => { savedKey = key; savedBody = body; } },
    DB: { prepare: sql => ({ bind: (...args) => ({ run: async () => { insertSql = sql; assert.equal(args.length, 12); } }) }) }
  };
  const result = await archiveMightPulseProbeRecord(env, {
    request_id: "probe-test-1", command_type: "MANUAL", endpoint: "/players/1",
    status: "SUCCESS", http_status: 200, raw_payload: { player: { api_key: "must-not-persist" }, score: 10 }
  });
  assert.equal(result.r2_saved, true);
  assert.equal(result.metadata_saved, true);
  assert.match(savedKey, /^mightpulse-probe\\/);
  assert.equal(JSON.parse(savedBody).raw_payload.player.api_key, "[REDACTED]");
  assert.match(insertSql, /INSERT INTO mightpulse_probe_runs/);
  assert.ok(!insertSql.includes("raw_payload"));
});

test("archive metadata is still recorded when R2 write fails", async () => {
  let insertCount = 0;
  const env = {
    ARCHIVE: { put: async () => { throw new Error("R2 unavailable"); } },
    DB: { prepare: () => ({ bind: () => ({ run: async () => { insertCount++; } }) }) }
  };
  const result = await archiveMightPulseProbeRecord(env, {
    request_id: "probe-test-2", command_type: "MANUAL", endpoint: "/players/1", status: "FAILED"
  });
  assert.equal(result.r2_saved, false);
  assert.equal(result.metadata_saved, true);
  assert.equal(insertCount, 1);
});
