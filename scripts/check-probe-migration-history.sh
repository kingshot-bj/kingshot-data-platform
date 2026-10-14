#!/usr/bin/env bash
set -euo pipefail

PROBE_MIGRATIONS="$(wrangler d1 execute eagleeye-db --remote --json --command "SELECT name FROM d1_migrations WHERE name IN ('0061_mightpulse_probe_runs.sql','0062_mightpulse_probe_keys.sql','0063_mightpulse_probe_batches.sql','0064_mightpulse_probe_key_audit.sql','0065_mightpulse_probe_batch_lease.sql') ORDER BY name;")"
PROBE_SCHEMA="$(wrangler d1 execute eagleeye-db --remote --json --command "SELECT
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_runs') WHERE name='batch_id') AS run_batch_id,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_runs') WHERE name='sequence_no') AS run_sequence_no,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_runs') WHERE name='discovered_from') AS run_discovered_from,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_runs') WHERE name='response_count') AS run_response_count,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_runs') WHERE name='retry_count') AS run_retry_count,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_runs') WHERE name='save_destination') AS run_save_destination,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_runs') WHERE name='key_source') AS run_key_source,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_runs') WHERE name='key_id') AS run_key_id,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_runs') WHERE name='key_owner_user_id') AS run_key_owner,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_keys') WHERE name='registered_by_user_id') AS key_registered_by,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_batches') WHERE name='lease_token') AS batch_lease_token,
  (SELECT COUNT(*) FROM pragma_table_info('mightpulse_probe_batches') WHERE name='lease_until') AS batch_lease_until;")"

node - "$PROBE_MIGRATIONS" "$PROBE_SCHEMA" <<'NODE'
const migrationPayload = JSON.parse(process.argv[2]);
const schemaPayload = JSON.parse(process.argv[3]);
const rows = migrationPayload?.[0]?.results ?? [];
const names = new Set(rows.map(row => String(row.name || "")));
const schema = schemaPayload?.[0]?.results?.[0] ?? {};
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
const batchColumns = ["run_batch_id","run_sequence_no","run_discovered_from","run_response_count","run_retry_count","run_save_destination"];
if (!names.has(base[2]) && batchColumns.some(column => Number(schema[column] || 0) > 0)) {
  throw new Error("Probe migration history is inconsistent: batch columns exist but migration 0063 is not recorded. Stop before applying pending migrations and reconcile the remote D1 schema.");
}
const auditColumns = ["run_key_source","run_key_id","run_key_owner","key_registered_by"];
if (!names.has(auditName) && auditColumns.some(column => Number(schema[column] || 0) > 0)) {
  throw new Error("Probe migration history is inconsistent: audit columns exist but migration 0064 is not recorded. Stop before applying pending migrations and reconcile the remote D1 schema.");
}
const leaseColumns = ["batch_lease_token","batch_lease_until"];
if (!names.has(leaseName) && leaseColumns.some(column => Number(schema[column] || 0) > 0)) {
  throw new Error("Probe migration history is inconsistent: batch lease columns exist but migration 0065 is not recorded. Stop before applying pending migrations and reconcile the remote D1 schema.");
}
console.log("Probe migration journal/schema preflight passed.");
NODE
