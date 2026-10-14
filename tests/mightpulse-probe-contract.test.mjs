import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("Probe API includes manual, batch, resume and history without a separate key manager", async () => {
  const source = await read("src/index.js");
  for (const marker of [
    "executeManualMightPulseProbe",
    "handleMightPulseProbeBatchApi",
    "automatic_discovery",
    'url.searchParams.get("history") === "1"',
    'url.searchParams.get("request_id")',
    "leaseProbeApiKey",
    "requireOwner(request, env)",
    "production_save:productionSave"
  ]) assert.ok(source.includes(marker), "missing source contract: " + marker);
  assert.ok(source.includes("Never infer the returned player's identity from the request path alone."));
  assert.ok(!source.includes("handleMightPulseProbeKeysApi"));
  assert.ok(!source.includes("/api/admin/mightpulse-probe-keys"));
  assert.ok(!source.includes("probeKeyManager"));
  assert.ok(!source.includes("fallbackPathId"));
});

test("Probe can lease all API Pool classes while reserving one key for normal users", async () => {
  const source = await read("src/index.js");
  const start = source.indexOf("async function leaseProbeApiKey");
  const end = source.indexOf("async function releaseProbeApiKey", start);
  assert.ok(start >= 0 && end > start);
  const lease = source.slice(start, end);
  assert.ok(lease.includes('poolTypes: ["SYSTEM_GENERAL", "SYSTEM_WATCHLIST", "USER_CONTRIBUTED"]'));
  assert.ok(lease.includes("reserveAvailableKeys: 1"));
  assert.ok(lease.includes("mightyOnly: mightyRequired"));
  assert.ok(lease.includes('source_type: "API_POOL"'));
  assert.ok(!lease.includes("PROBE_DEDICATED"));
  assert.ok(!lease.includes("leaseMightPulseProbeKey"));
  assert.ok(source.includes("mightyRequired: body?.mighty_required === true"));
  assert.ok(source.includes("disable: false"));
  const pool = await read("src/api-pool.js");
  assert.ok(pool.includes("reserveAvailableKeys = 0"));
  assert.ok(pool.includes("const reserveCondition = reserve > 0"));
  assert.ok(pool.includes("COUNT(*) FROM api_pool_keys AS reserve_keys"));
  assert.ok(pool.includes(") > ?"));
});

test("Probe schema migrations cover run history, legacy key schema, batches and batch leases", async () => {
  const run = await read("migrations/0061_mightpulse_probe_runs.sql");
  const keys = await read("migrations/0062_mightpulse_probe_keys.sql");
  const batches = await read("migrations/0063_mightpulse_probe_batches.sql");
  const audit = await read("migrations/0064_mightpulse_probe_key_audit.sql");
  const batchLease = await read("migrations/0065_mightpulse_probe_batch_lease.sql");
  const index = await read("src/index.js");
  assert.ok(run.includes("CREATE TABLE IF NOT EXISTS mightpulse_probe_runs"));
  assert.ok(keys.includes("CREATE TABLE IF NOT EXISTS mightpulse_probe_keys"));
  assert.ok(batches.includes("CREATE TABLE IF NOT EXISTS mightpulse_probe_batches"));
  assert.ok(batches.includes("pending_json"));
  assert.ok(audit.includes("registered_by_user_id"));
  assert.ok(audit.includes("key_owner_user_id"));
  assert.ok(batchLease.includes("lease_token") && batchLease.includes("lease_until"));
  assert.ok(index.includes("PROBE_BATCH_ALREADY_RUNNING"));
  assert.ok(index.includes("WHERE batch_id=? AND lease_token=?"));
  assert.ok(!index.includes("handleMightPulseProbeKeysApi"));
  assert.ok(!index.includes("PROBE_DEDICATED"));
  const probeModule = await read("src/mightpulse-probe.js");
  assert.ok(!probeModule.includes("addMightPulseProbeKey"));
  assert.ok(!probeModule.includes("leaseMightPulseProbeKey"));
  assert.ok(!probeModule.includes("mightpulse_probe_keys"));
});

test("Probe catalog separates official API commands and EagleEye internal retrievals", async () => {
  const source = await read("src/mightpulse-probe.js");
  assert.ok(source.includes('category:"EagleEye Retrieval"'));
  assert.ok(source.includes('id:"eagleeye_player_refresh"'));
  assert.ok(source.includes('id:"eagleeye_kingdom_rank_refresh"'));
  assert.ok(source.includes("MIGHTPULSE_PROBE_FIELD_DICTIONARY_LIMIT"));
});


test("Probe production persistence is restricted to explicitly mapped command IDs", async () => {
  const source = await read("src/index.js");
  assert.ok(source.includes("const playerCommandIds = new Set("));
  assert.ok(source.includes('"player_base"'));
  assert.ok(source.includes('"player_full"'));
  assert.ok(source.includes('"player_ranks"'));
  assert.ok(source.includes('"eagleeye_player_refresh"'));
  assert.ok(source.includes("const rankingCommandIds = new Set("));
  assert.ok(source.includes('"eagleeye_kingdom_rank_refresh"'));
  assert.ok(!source.includes('const rankingCommandIds = new Set(["kingdom_rank_board","eagleeye_kingdom_rank_refresh","eagleeye_alliance_rosters"])'));
});

test("Probe error records redact leased keys and do not disable a shared pool key on 403", async () => {
  const source = await read("src/index.js");
  assert.ok(source.includes("function safeProbeErrorMessage(error, apiKey = null)"));
  assert.ok(source.includes("message.split(secret).join(\"[REDACTED]\")"));
  assert.ok(source.includes("error_message: safeProbeErrorMessage(error,lease?.api_key)"));
  assert.ok(source.includes("error:safeProbeErrorMessage(saveError,lease?.api_key).slice(0,300)"));
  assert.ok(!source.includes("error:String(saveError?.message||saveError).slice(0,300)"));
  assert.ok(source.includes("const keepAvailable = status === 400 || status === 403 || status === 404"));
  assert.ok(source.includes("disable: false"));
  assert.ok(!source.includes("handleMightPulseProbeKeysApi"));
});


test("Probe batch resume requires creator ownership and an exclusive lease", async () => {
  const source = await read("src/index.js");
  assert.ok(source.includes("PROBE_BATCH_OWNER_MISMATCH"));
  assert.ok(source.includes('String(row.user_id)!==String(userId)'));
  assert.ok(source.includes("PROBE_BATCH_ALREADY_RUNNING"));
  assert.ok(source.includes("WHERE batch_id=? AND lease_token=?"));
});


test("Probe player persistence rejects unconfirmed response shapes before production writes", async () => {
  const source = await read("src/index.js");
  const start = source.indexOf("async function persistKnownProbeResponse");
  const end = source.indexOf("\nfunction probeResponseCount", start);
  const persist = source.slice(start, end);
  assert.ok(persist.includes("PLAYER_PAYLOAD_SHAPE_UNCONFIRMED"));
  assert.ok(persist.includes("if (!safePayload.player || typeof safePayload.player !== \"object\" || Array.isArray(safePayload.player))"));
  assert.ok(persist.indexOf("PLAYER_PAYLOAD_SHAPE_UNCONFIRMED") < persist.indexOf("saveApiObservation(env.DB,observationData)"));
  assert.ok(persist.includes("normalizeGovernorId(playerPayload.governor_id ?? safePayload.governor_id)"));
});
