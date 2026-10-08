import { execFileSync } from "node:child_process";

const DB = process.env.D1_DATABASE || "eagleeye-db";
const MIGRATION = "0053_player_visibility_min_role.sql";

function run(sql) {
  const out = execFileSync(
    "wrangler",
    ["d1", "execute", DB, "--remote", "--json", "--command", sql],
    { encoding: "utf8" }
  );
  const parsed = JSON.parse(out);
  return parsed?.[0]?.results ?? [];
}

function write(sql) {
  execFileSync(
    "wrangler",
    ["d1", "execute", DB, "--remote", "--command", sql],
    { stdio: "inherit" }
  );
}

const recorded =
  run(
    "SELECT COUNT(*) AS c FROM d1_migrations WHERE name='" + MIGRATION + "'"
  )[0]?.c ?? 0;

const tableExists =
  run(
    "SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='player_visibility_settings'"
  )[0]?.c ?? 0;

if (Number(recorded) > 0) {
  console.log(MIGRATION + " is already recorded; no reconciliation needed.");
  process.exit(0);
}

if (Number(tableExists) === 0) {
  console.log(
    MIGRATION +
      " is not recorded and its target table is missing; leaving it pending for normal migration application."
  );
  process.exit(0);
}

const hasMinRole =
  run(
    "SELECT COUNT(*) AS c FROM pragma_table_info('player_visibility_settings') WHERE name='min_role'"
  )[0]?.c ?? 0;

if (Number(hasMinRole) === 0) {
  console.log(
    MIGRATION +
      " is not recorded and min_role is missing; leaving it pending for normal migration application."
  );
  process.exit(0);
}

// 0053 may be reconciled only when the later VIP/API-Pool migrations have
// not already left physical schema behind. If they have, stop rather than
// guessing which migration history was lost.
const laterSchema = run(
  "SELECT " +
    "(SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='user_mighty_credentials') AS mighty_table, " +
    "(SELECT COUNT(*) FROM pragma_table_info('api_pool_keys') WHERE name='mighty_capable') AS mighty_capable, " +
    "(SELECT COUNT(*) FROM pragma_table_info('api_pool_keys') WHERE name='mighty_checked_at') AS mighty_checked_at, " +
    "(SELECT COUNT(*) FROM pragma_table_info('api_pool_keys') WHERE name='mighty_check_status') AS mighty_check_status, " +
    "(SELECT COUNT(*) FROM pragma_table_info('api_pool_keys') WHERE name='mighty_last_error_code') AS mighty_last_error_code"
)[0] ?? {};

if (
  Number(laterSchema.mighty_table) > 0 ||
  Number(laterSchema.mighty_capable) > 0 ||
  Number(laterSchema.mighty_checked_at) > 0 ||
  Number(laterSchema.mighty_check_status) > 0 ||
  Number(laterSchema.mighty_last_error_code) > 0
) {
  throw new Error(
    "Cannot reconcile 0053 safely: later VIP/API-Pool schema already exists without recorded 0053-0057 history. Stop and investigate migration drift first."
  );
}

console.log(
  "Detected known production drift: " +
    MIGRATION +
    " schema change already exists without a migration-history record."
);

// Apply the data normalization that 0053 would have performed.
// This is safe to repeat and preserves the existing min_role column.
write(
  "UPDATE player_visibility_settings SET min_role = CASE item_key " +
    "WHEN 'base_identity' THEN 'BASIC' " +
    "WHEN 'base_power' THEN 'BASIC' " +
    "WHEN 'base_kills' THEN 'BASIC' " +
    "WHEN 'base_activity' THEN 'BASIC' " +
    "WHEN 'alliance_identity' THEN 'BASIC' " +
    "ELSE 'ADVANCED' END " +
    "WHERE min_role = 'OWNER'"
);

write(
  "INSERT INTO d1_migrations(name, applied_at) VALUES ('" +
    MIGRATION +
    "', CURRENT_TIMESTAMP)"
);

const verify =
  run(
    "SELECT COUNT(*) AS c FROM d1_migrations WHERE name='" + MIGRATION + "'"
  )[0]?.c ?? 0;

if (Number(verify) !== 1) {
  throw new Error(
    "Failed to record " + MIGRATION + " after reconciling its existing schema."
  );
}

console.log("Recorded " + MIGRATION + " as reconciled.");
