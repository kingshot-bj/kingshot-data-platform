import test from "node:test";
import assert from "node:assert/strict";
import { validateManualProbeCommand, redactProbeSecrets, archiveMightPulseProbeRecord, MIGHTPULSE_PROBE_COMMANDS, buildCatalogProbeCommand, buildProbeFieldDictionary, extractProbeReferences } from "../src/mightpulse-probe.js";

test("manual command accepts a relative MightPulse path and scalar query values", () => {
  assert.deepEqual(
    validateManualProbeCommand({ path: "/players/225623582", query: { include: "base,ranks", limit: 20, fresh: false } }),
    { path: "/players/225623582", query: { include: "base,ranks", limit: 20, fresh: false } }
  );
});

test("manual command rejects external URLs, host-relative paths, traversal and nested values", () => {
  for (const path of ["https://example.com/players", "//example.com/players", "/players/../admin", "/players/%2e%2e/admin", "/players/%2E%2E/admin", "/players/%2fadmin", "/players/%5cadmin", "/players/%ZZ", "/players\\\\225623582"]) {
    assert.throws(() => validateManualProbeCommand({ path, query: {} }));
  }
  assert.throws(() => validateManualProbeCommand({ path: "/players/1", query: { include: { nested: true } } }), /PROBE_QUERY_VALUES_MUST_BE_SCALARS/);
});

test("manual command rejects secret-like query parameter names", () => {
  assert.throws(() => validateManualProbeCommand({ path: "/players/1", query: { api_key: "do-not-log" } }), /PROBE_QUERY_SECRET_FIELD_NOT_ALLOWED/);
  assert.throws(() => validateManualProbeCommand({ path: "/players/1", query: { access_token: "do-not-log" } }), /PROBE_QUERY_SECRET_FIELD_NOT_ALLOWED/);
});

test("catalog covers documented command families and marks Mighty-only operations", () => {
  assert.ok(MIGHTPULSE_PROBE_COMMANDS.length >= 13);
  assert.equal(buildCatalogProbeCommand("player_full", { governor_id: "225623582" }).path, "/players/225623582");
  assert.equal(buildCatalogProbeCommand("alliance_detail", { kid: "1524", tag: "ABC" }).path, "/alliances/1524/ABC");
  assert.equal(MIGHTPULSE_PROBE_COMMANDS.find(item => item.id === "kingdom_events").requiresMighty, true);
});

test("field dictionary records observed paths, types and sample values", () => {
  const dictionary = buildProbeFieldDictionary({ player: { governor_id: "12345", power: 42 }, heroes: [{ name: "Hero A" }] });
  assert.ok(dictionary.some(field => field.path === "player.governor_id" && field.type === "string" && field.samples.includes("12345")));
  assert.ok(dictionary.some(field => field.path === "player.power" && field.type === "integer"));
  assert.ok(dictionary.some(field => field.path === "heroes[].name" && field.type === "string"));
});

test("reference discovery extracts only bounded player, kingdom and alliance references", () => {
  const refs = extractProbeReferences({ player: { governor_id: "12345678", kid: 1524, alliance: { abbr: "ABC" } }, extra: [{ governor_id: "98765432" }] }, { maxReferences: 10 });
  assert.ok(refs.some(ref => ref.type === "PLAYER" && ref.governor_id === "12345678"));
  assert.ok(refs.some(ref => ref.type === "KINGDOM" && ref.kid === "1524"));
  assert.ok(refs.some(ref => ref.type === "ALLIANCE" && ref.tag === "ABC"));
  assert.ok(refs.some(ref => ref.type === "PLAYER" && ref.governor_id === "98765432"));
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
    DB: { prepare: sql => ({ bind: (...args) => ({ run: async () => { insertSql = sql; assert.equal(args.length, 24); } }) }) }
  };
  const result = await archiveMightPulseProbeRecord(env, {
    request_id: "probe-test-1", command_type: "MANUAL", endpoint: "/players/1",
    status: "SUCCESS", http_status: 200, actor_discord_id: "discord-123", actor_label: "Test Admin", actor_role: "ADMIN", raw_payload: { player: { api_key: "must-not-persist" }, score: 10 }
  });
  assert.equal(result.r2_saved, true);
  assert.equal(result.metadata_saved, true);
  assert.ok(savedKey.startsWith("mightpulse-probe/"));
  assert.equal(JSON.parse(savedBody).raw_payload.player.api_key, "[REDACTED]");
  assert.match(insertSql, /INSERT INTO mightpulse_probe_runs/);
  assert.match(insertSql, /actor_discord_id, actor_label, actor_role/);
  assert.ok(!insertSql.includes("raw_payload"));
});

test("archive metadata is still recorded and marked unsaved when R2 write fails", async () => {
  let insertCount = 0;
  let savedDestination = null;
  const env = {
    ARCHIVE: { put: async () => { throw new Error("R2 unavailable: secret-value"); } },
    DB: { prepare: () => ({ bind: (...args) => ({ run: async () => { insertCount++; savedDestination = args[20]; } }) }) }
  };
  const result = await archiveMightPulseProbeRecord(env, {
    request_id: "probe-test-2", command_type: "MANUAL", endpoint: "/players/1", status: "FAILED"
  });
  assert.equal(result.r2_saved, false);
  assert.equal(result.metadata_saved, true);
  assert.equal(result.r2_error, "R2_ARCHIVE_FAILED");
  assert.equal(result.metadata_error, null);
  assert.equal(savedDestination, "NONE");
  assert.equal(insertCount, 1);
});
