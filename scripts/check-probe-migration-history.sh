#!/usr/bin/env bash
set -euo pipefail

PROBE_MIGRATIONS="$(wrangler d1 execute eagleeye-db --remote --json --command "SELECT name FROM d1_migrations WHERE name IN ('0061_mightpulse_probe_runs.sql','0062_mightpulse_probe_keys.sql','0063_mightpulse_probe_batches.sql','0064_mightpulse_probe_key_audit.sql','0065_mightpulse_probe_batch_lease.sql') ORDER BY name;")"
PROBE_SCHEMA="$(wrangler d1 execute eagleeye-db --remote --json --command "SELECT
  (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='mightpulse_probe_runs') AS runs_table,
  (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='mightpulse_probe_keys') AS keys_table,
  (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='mightpulse_probe_batches') AS batches_table,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_runs') WHERE name='request_id') AS run_request_id,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_runs') WHERE name='created_at') AS run_created_at,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_runs') WHERE name='actor_discord_id') AS run_actor_discord_id,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_runs') WHERE name='command_type') AS run_command_type,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_runs') WHERE name='endpoint') AS run_endpoint,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_runs') WHERE name='status') AS run_status,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_runs') WHERE name='trigger_reason') AS run_trigger_reason,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_runs') WHERE name='batch_id') AS run_batch_id,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_runs') WHERE name='sequence_no') AS run_sequence_no,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_runs') WHERE name='discovered_from') AS run_discovered_from,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_runs') WHERE name='response_count') AS run_response_count,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_runs') WHERE name='retry_count') AS run_retry_count,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_runs') WHERE name='save_destination') AS run_save_destination,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_runs') WHERE name='key_source') AS run_key_source,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_runs') WHERE name='key_id') AS run_key_id,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_runs') WHERE name='key_owner_user_id') AS run_key_owner,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_keys') WHERE name='key_id') AS key_key_id,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_keys') WHERE name='encrypted_key') AS key_encrypted_key,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_keys') WHERE name='key_fingerprint') AS key_fingerprint,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_keys') WHERE name='mighty_capable') AS key_mighty_capable,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_keys') WHERE name='lease_id') AS key_lease_id,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_keys') WHERE name='leased_until') AS key_leased_until,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_keys') WHERE name='registered_by_user_id') AS key_registered_by,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_batches') WHERE name='batch_id') AS batch_batch_id,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_batches') WHERE name='pending_json') AS batch_pending_json,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_batches') WHERE name='seen_json') AS batch_seen_json,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_batches') WHERE name='next_sequence') AS batch_next_sequence,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_batches') WHERE name='concurrency') AS batch_concurrency,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_batches') WHERE name='max_commands') AS batch_max_commands,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_batches') WHERE name='lease_token') AS batch_lease_token,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_batches') WHERE name='lease_until') AS batch_lease_until;")"

node - "$PROBE_MIGRATIONS" "$PROBE_SCHEMA" <<'NODE'
const migrationPayload = JSON.parse(process.argv[2]);
const schemaPayload = JSON.parse(process.argv[3]);
const rows = migrationPayload?.[0]?.results ?? [];
const names = new Set(rows.map(row => String(row.name || "")));
const schema = schemaPayload?.[0]?.results?.[0] ?? {};
const has = column => Number(schema[column] || 0) > 0;
const base = [
  "0061_mightpulse_probe_runs.sql",
  "0062_mightpulse_probe_keys.sql",
  "0063_mightpulse_probe_batches.sql",
];
const auditName = "0064_mightpulse_probe_key_audit.sql";
const leaseName = "0065_mightpulse_probe_batch_lease.sql";
const missingBase = base.filter(name => !names.has(name));

if (names.has(auditName) && missingBase.length) {
  throw new Error(
    "Probe migration history is inconsistent: 0064 is recorded but earlier migrations are missing (" +
    missingBase.join(", ") +
    "). Stop before applying pending migrations and reconcile the remote D1 journal/schema manually."
  );
}

const baseTables = [
  { migration: base[0], table: "runs_table", label: "mightpulse_probe_runs" },
  { migration: base[1], table: "keys_table", label: "mightpulse_probe_keys" },
  { migration: base[2], table: "batches_table", label: "mightpulse_probe_batches" },
];
for (const item of baseTables) {
  if (names.has(item.migration) !== has(item.table)) {
    throw new Error(
      "Probe migration history is inconsistent: table " + item.label +
      " and migration " + item.migration + " do not agree. Reconcile the remote D1 journal/schema."
    );
  }
}

const baseRunColumns = [
  "run_request_id", "run_created_at", "run_actor_discord_id",
  "run_command_type", "run_endpoint", "run_status", "run_trigger_reason"
];
if (names.has(base[0]) && baseRunColumns.some(column => !has(column))) {
  throw new Error("Probe migration 0061 is recorded but required run columns are missing. Reconcile the remote D1 schema.");
}

const keyBaseColumns = [
  "key_key_id", "key_encrypted_key", "key_fingerprint",
  "key_mighty_capable", "key_lease_id", "key_leased_until"
];
if (names.has(base[1]) && keyBaseColumns.some(column => !has(column))) {
  throw new Error("Probe migration 0062 is recorded but required legacy key columns are missing. Reconcile the remote D1 schema.");
}

const batchColumns = [
  "run_batch_id", "run_sequence_no", "run_discovered_from",
  "run_response_count", "run_retry_count", "run_save_destination",
  "batch_batch_id", "batch_pending_json", "batch_seen_json",
  "batch_next_sequence", "batch_concurrency", "batch_max_commands"
];
if ((names.has(base[2]) && batchColumns.some(column => !has(column))) ||
    (!names.has(base[2]) && batchColumns.some(column => has(column)))) {
  throw new Error("Probe migration history is inconsistent: batch schema and migration 0063 do not agree. Reconcile the remote D1 journal/schema.");
}

const auditColumns = ["run_key_source", "run_key_id", "run_key_owner", "key_registered_by"];
if ((names.has(auditName) && auditColumns.some(column => !has(column))) ||
    (!names.has(auditName) && auditColumns.some(column => has(column)))) {
  throw new Error("Probe migration history is inconsistent: audit schema and migration 0064 do not agree. Reconcile the remote D1 journal/schema.");
}

const leaseColumns = ["batch_lease_token", "batch_lease_until"];
if ((names.has(leaseName) && leaseColumns.some(column => !has(column))) ||
    (!names.has(leaseName) && leaseColumns.some(column => has(column)))) {
  throw new Error("Probe migration history is inconsistent: batch lease schema and migration 0065 do not agree. Reconcile the remote D1 journal/schema.");
}

console.log("Probe migration journal/schema preflight passed.");
NODE
