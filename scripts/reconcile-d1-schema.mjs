import { execFileSync } from "node:child_process";

const DB = process.env.D1_DATABASE || "eagleeye-db";
const APPLY = process.argv.includes("--apply");

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
  if (!APPLY) {
    console.log("[DRY-RUN]", sql);
    return;
  }
  execFileSync("wrangler", ["d1", "execute", DB, "--remote", "--command", sql], {
    stdio: "inherit",
  });
}

function esc(value) {
  return value.replaceAll("'", "''");
}

function tableExists(name) {
  return run(
    "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='" +
      esc(name) +
      "' LIMIT 1"
  ).length > 0;
}

function columns(name) {
  return run("PRAGMA table_info('" + esc(name) + "')").map((row) => row.name);
}

function hasColumn(table, column) {
  return columns(table).includes(column);
}

function requireTable(name, requiredColumns = []) {
  if (!tableExists(name)) {
    throw new Error("Required table is missing: " + name);
  }
  const got = new Set(columns(name));
  const missing = requiredColumns.filter((column) => !got.has(column));
  if (missing.length) {
    throw new Error(
      "Required columns missing from " + name + ": " + missing.join(", ")
    );
  }
}

function addColumn(table, column, definition) {
  if (!hasColumn(table, column)) {
    write("ALTER TABLE " + table + " ADD COLUMN " + column + " " + definition);
  }
}

function ensureIndex(name, sql) {
  const exists = run(
    "SELECT 1 AS ok FROM sqlite_master WHERE type='index' AND name='" +
      esc(name) +
      "' LIMIT 1"
  ).length > 0;
  if (!exists) write(sql);
}

const MIGRATIONS = [
  "0017_api_pool_atomic_lease.sql",
  "0018_runtime_schema_cleanup.sql",
  "0019_watchlist_runtime_schema.sql",
  "0020_audit_history_r2_retention.sql",
  "0021_api_pool_identity_r2_retention.sql",
  "0022_user_player_links.sql",
  "0023_player_link_support.sql",
  "0024_user_player_link_unique.sql",
  "0025_api_pool_user_contributed_index.sql",
  "0026_user_player_links_multi_account.sql",
  "0027_diagnostic_status_created_index.sql",
  "0028_system_event_log.sql",
  "0029_kingdom_load_test_runs.sql",
  "0030_kingdom_load_test_api_concurrency.sql",
  "0031_kingdom_load_test_history.sql",
  "0032_kingdom_load_test_api_wait_metrics.sql",
  "0033_kingdom_load_test_wait_distribution.sql",
  "0034_global_collection_semaphore.sql",
  "0035_api_request_locks.sql",
  "0036_collection_semaphore_slots.sql",
  "0037_kingdom_catalog.sql",
  "0038_kingdom_catalog_boards.sql",
  "0039_kingdom_ranking_collection_state.sql",
  "0040_kingdom_seeder_state.sql",
  "0041_alliance_catalog.sql",
  "0042_player_roller_state.sql",
  "0043_alliance_collection_state.sql",
];

console.log("EagleEye D1 schema reconciliation:", DB, APPLY ? "APPLY" : "VERIFY");

requireTable("api_pool_keys", ["provider", "pool_type", "status"]);
for (const [column, definition] of [
  ["lease_id", "TEXT"],
  ["leased_until", "INTEGER"],
  ["lease_job_id", "TEXT"],
  ["lease_purpose", "TEXT"],
  ["lease_target_type", "TEXT"],
  ["lease_target_id", "TEXT"],
]) {
  addColumn("api_pool_keys", column, definition);
}
ensureIndex(
  "idx_api_pool_keys_lease",
  "CREATE INDEX IF NOT EXISTS idx_api_pool_keys_lease ON api_pool_keys(provider,pool_type,status,leased_until,cooldown_until,last_used_at,created_at)"
);

if (!tableExists("watchlist_limits")) {
  write("CREATE TABLE watchlist_limits (role TEXT PRIMARY KEY CHECK(role IN ('BASIC','ADVANCED','ADMIN','OWNER')), kingdom_limit INTEGER NOT NULL DEFAULT 1, player_limit INTEGER NOT NULL DEFAULT 5, updated_at INTEGER NOT NULL, updated_by TEXT)");
  write("INSERT INTO watchlist_limits(role,kingdom_limit,player_limit,updated_at,updated_by) VALUES ('BASIC',1,5,strftime('%s','now'),NULL),('ADVANCED',3,20,strftime('%s','now'),NULL),('ADMIN',10,50,strftime('%s','now'),NULL),('OWNER',50,200,strftime('%s','now'),NULL)");
}
if (!tableExists("diagnostic_events")) {
  write("CREATE TABLE diagnostic_events (event_id TEXT PRIMARY KEY,trace_id TEXT NOT NULL,service TEXT NOT NULL,feature TEXT NOT NULL,operation TEXT NOT NULL,status TEXT NOT NULL,error_code TEXT,message TEXT,provider TEXT,target_type TEXT,target_id TEXT,started_at INTEGER NOT NULL,completed_at INTEGER NOT NULL,elapsed_ms INTEGER NOT NULL DEFAULT 0,source_observed_at INTEGER,rows_received INTEGER,rows_saved INTEGER,metadata_json TEXT,created_at INTEGER NOT NULL)");
}
ensureIndex("idx_diagnostic_events_created","CREATE INDEX IF NOT EXISTS idx_diagnostic_events_created ON diagnostic_events(created_at DESC)");
ensureIndex("idx_diagnostic_events_service","CREATE INDEX IF NOT EXISTS idx_diagnostic_events_service ON diagnostic_events(service,created_at DESC)");
ensureIndex("idx_diagnostic_events_trace","CREATE INDEX IF NOT EXISTS idx_diagnostic_events_trace ON diagnostic_events(trace_id)");
requireTable("data_retention_settings");
requireTable("login_history");
requireTable("owner_audit_log");
requireTable("api_pool_usage");
requireTable("player_identity_history");
addColumn("data_retention_settings","login_history_days","INTEGER NOT NULL DEFAULT 90");
addColumn("data_retention_settings","owner_audit_log_days","INTEGER NOT NULL DEFAULT 730");
addColumn("data_retention_settings","player_identity_history_days","INTEGER NOT NULL DEFAULT 90");

for (const [table, sql] of [
  ["kingdom_watchlist_jobs","CREATE TABLE IF NOT EXISTS kingdom_watchlist_jobs (job_id TEXT PRIMARY KEY,watchlist_id TEXT NOT NULL,kid INTEGER NOT NULL,top_n INTEGER NOT NULL,status TEXT NOT NULL,board_index INTEGER NOT NULL DEFAULT 0,player_cursor INTEGER NOT NULL DEFAULT 0,player_ids_json TEXT NOT NULL DEFAULT '[]',observed_at INTEGER NOT NULL,source_first_at INTEGER,source_last_at INTEGER,ranking_rows INTEGER NOT NULL DEFAULT 0,player_rows INTEGER NOT NULL DEFAULT 0,last_error TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,completed_at INTEGER)"],
  ["kingdom_watchlist_locks","CREATE TABLE IF NOT EXISTS kingdom_watchlist_locks (watchlist_id TEXT PRIMARY KEY,lock_token TEXT NOT NULL,lock_until INTEGER NOT NULL,updated_at INTEGER NOT NULL)"],
  ["kingdom_ranking_current","CREATE TABLE IF NOT EXISTS kingdom_ranking_current (kid INTEGER NOT NULL,board TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT NOT NULL,rank INTEGER NOT NULL,previous_rank INTEGER,score,uid TEXT,governor_id TEXT,nick_name TEXT,aid TEXT,abbr TEXT,name TEXT,observed_at INTEGER NOT NULL,source_observed_at INTEGER,source_observation_id TEXT,updated_at INTEGER NOT NULL,PRIMARY KEY(kid,board,target_type,target_id))"],
  ["kingdom_ranking_board_state","CREATE TABLE IF NOT EXISTS kingdom_ranking_board_state (kid INTEGER NOT NULL,board TEXT NOT NULL,last_checked_at INTEGER NOT NULL,source_observed_at INTEGER,checked_rows INTEGER NOT NULL DEFAULT 0,changed_rows INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL,PRIMARY KEY(kid,board))"],
]) {
  if (!tableExists(table)) write(sql);
}

requireTable("user_player_links",["link_id","user_id","governor_id","kingdom_id","account_type","status"]);
addColumn("user_player_links","official_verified_at","INTEGER");
addColumn("user_player_links","official_verified_by_user_id","TEXT");
if (!tableExists("user_player_link_support_requests")) {
  write("CREATE TABLE user_player_link_support_requests (request_id TEXT PRIMARY KEY,requester_user_id TEXT NOT NULL,governor_id TEXT NOT NULL,conflicting_user_id TEXT,status TEXT NOT NULL DEFAULT 'OPEN',discord_support_url TEXT,note TEXT,resolution_note TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,resolved_at INTEGER,resolved_by_user_id TEXT)");
}
ensureIndex("uq_user_player_links_active_governor","CREATE UNIQUE INDEX IF NOT EXISTS uq_user_player_links_active_governor ON user_player_links(governor_id) WHERE status='ACTIVE'");
ensureIndex("idx_user_player_links_user_status","CREATE INDEX IF NOT EXISTS idx_user_player_links_user_status ON user_player_links(user_id,status,kingdom_id,account_type)");
ensureIndex("idx_user_player_links_governor_status","CREATE INDEX IF NOT EXISTS idx_user_player_links_governor_status ON user_player_links(governor_id,status)");
ensureIndex("idx_user_player_links_kingdom","CREATE INDEX IF NOT EXISTS idx_user_player_links_kingdom ON user_player_links(user_id,kingdom_id,status)");
ensureIndex("uq_user_player_links_active_user_governor","CREATE UNIQUE INDEX IF NOT EXISTS uq_user_player_links_active_user_governor ON user_player_links(user_id,governor_id) WHERE status='ACTIVE'");
ensureIndex("uq_user_player_links_active_main","CREATE UNIQUE INDEX IF NOT EXISTS uq_user_player_links_active_main ON user_player_links(user_id,kingdom_id) WHERE status='ACTIVE' AND account_type='MAIN'");

if (!tableExists("system_event_log")) {
  write("CREATE TABLE system_event_log (event_id TEXT PRIMARY KEY,trace_id TEXT NOT NULL,parent_trace_id TEXT,event_type TEXT NOT NULL,service TEXT NOT NULL,feature TEXT,operation TEXT,status TEXT NOT NULL,actor_type TEXT,actor_id TEXT,target_type TEXT,target_id TEXT,http_method TEXT,http_path TEXT,http_status INTEGER,started_at INTEGER NOT NULL,completed_at INTEGER,elapsed_ms INTEGER,error_code TEXT,message TEXT,metadata_json TEXT,created_at INTEGER NOT NULL)");
}
for (const [name,sql] of [
  ["idx_system_event_log_created","CREATE INDEX IF NOT EXISTS idx_system_event_log_created ON system_event_log(created_at DESC)"],
  ["idx_system_event_log_trace","CREATE INDEX IF NOT EXISTS idx_system_event_log_trace ON system_event_log(trace_id,created_at)"],
  ["idx_system_event_log_operation","CREATE INDEX IF NOT EXISTS idx_system_event_log_operation ON system_event_log(operation,created_at DESC)"],
  ["idx_system_event_log_status","CREATE INDEX IF NOT EXISTS idx_system_event_log_status ON system_event_log(status,created_at DESC)"],
]) ensureIndex(name,sql);

if (!tableExists("kingdom_load_test_runs")) {
  write("CREATE TABLE kingdom_load_test_runs (run_id TEXT PRIMARY KEY,target_count INTEGER NOT NULL,kids_json TEXT NOT NULL,start_kid INTEGER NOT NULL,end_kid INTEGER NOT NULL,top_n INTEGER NOT NULL,requested_concurrency INTEGER NOT NULL,concurrency INTEGER NOT NULL,available_pool_keys INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'RUNNING',created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,completed_at INTEGER)");
}
ensureIndex("idx_kingdom_load_test_runs_status","CREATE INDEX IF NOT EXISTS idx_kingdom_load_test_runs_status ON kingdom_load_test_runs(status,updated_at DESC)");
for (const [column,definition] of [
  ["api_concurrency","INTEGER NOT NULL DEFAULT 0"],["success_count","INTEGER NOT NULL DEFAULT 0"],["failed_count","INTEGER NOT NULL DEFAULT 0"],["ranking_rows_saved","INTEGER NOT NULL DEFAULT 0"],["player_rows_saved","INTEGER NOT NULL DEFAULT 0"],["elapsed_ms","INTEGER"],["api_active_count","INTEGER NOT NULL DEFAULT 0"],["api_waiting_count","INTEGER NOT NULL DEFAULT 0"],["api_pool_waiting_count","INTEGER NOT NULL DEFAULT 0"],["api_wait_events","INTEGER NOT NULL DEFAULT 0"],["api_pool_wait_events","INTEGER NOT NULL DEFAULT 0"],["api_wait_ms","INTEGER NOT NULL DEFAULT 0"],["api_pool_wait_ms","INTEGER NOT NULL DEFAULT 0"],["last_activity_at","INTEGER NOT NULL DEFAULT 0"],["api_wait_min_ms","INTEGER NOT NULL DEFAULT 0"],["api_wait_max_ms","INTEGER NOT NULL DEFAULT 0"],["api_wait_buckets_json","TEXT NOT NULL DEFAULT '{}'"],
]) addColumn("kingdom_load_test_runs",column,definition);

if (!tableExists("collection_semaphore")) {
  write("CREATE TABLE collection_semaphore (semaphore_key TEXT PRIMARY KEY,capacity INTEGER NOT NULL,active_count INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL)");
}
write("INSERT OR IGNORE INTO collection_semaphore(semaphore_key,capacity,active_count,updated_at) VALUES ('GLOBAL_API',26,0,strftime('%s','now'))");
if (!tableExists("collection_semaphore_slots")) {
  write("CREATE TABLE collection_semaphore_slots (semaphore_key TEXT NOT NULL,slot_id INTEGER NOT NULL,lease_token TEXT,lease_until INTEGER,updated_at INTEGER NOT NULL,PRIMARY KEY(semaphore_key,slot_id))");
}
const slotValues = Array.from({ length: 26 }, (_, index) => {
  const slotId = index + 1;
  return "('GLOBAL_API'," + slotId + ",NULL,NULL,strftime('%s','now'))";
}).join(",");
write(
  "INSERT OR IGNORE INTO collection_semaphore_slots(semaphore_key,slot_id,lease_token,lease_until,updated_at) VALUES " +
    slotValues
);;
ensureIndex("idx_collection_semaphore_slots_lease","CREATE INDEX IF NOT EXISTS idx_collection_semaphore_slots_lease ON collection_semaphore_slots(semaphore_key,lease_until)");

if (!tableExists("api_request_locks")) {
  write("CREATE TABLE api_request_locks (lock_key TEXT PRIMARY KEY,lock_token TEXT NOT NULL,lock_until INTEGER NOT NULL,updated_at INTEGER NOT NULL)");
}
ensureIndex("idx_api_request_locks_until","CREATE INDEX IF NOT EXISTS idx_api_request_locks_until ON api_request_locks(lock_until)");

if (!tableExists("kingdom_catalog")) {
  write("CREATE TABLE kingdom_catalog (kid INTEGER PRIMARY KEY,name TEXT,status TEXT,region TEXT,language TEXT,raw_json TEXT,source_observed_at INTEGER,first_seen_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)");
}
ensureIndex("idx_kingdom_catalog_status","CREATE INDEX IF NOT EXISTS idx_kingdom_catalog_status ON kingdom_catalog(status,last_seen_at DESC)");
if (!tableExists("kingdom_catalog_discovery")) {
  write("CREATE TABLE kingdom_catalog_discovery (discovery_key TEXT PRIMARY KEY,next_page INTEGER NOT NULL DEFAULT 1,page_size INTEGER NOT NULL DEFAULT 24,state TEXT NOT NULL DEFAULT 'IDLE',pages_checked INTEGER NOT NULL DEFAULT 0,kingdoms_seen INTEGER NOT NULL DEFAULT 0,last_page_at INTEGER,last_success_at INTEGER,last_error TEXT,updated_at INTEGER NOT NULL)");
}
write("INSERT OR IGNORE INTO kingdom_catalog_discovery(discovery_key,next_page,page_size,state,updated_at) VALUES ('MIGHTPULSE_KINGDOMS',1,24,'IDLE',strftime('%s','now'))");
addColumn("kingdom_catalog","boards_json","TEXT");
addColumn("kingdom_catalog","boards_observed_at","INTEGER");
if (!tableExists("kingdom_ranking_collection_state")) {
  write("CREATE TABLE kingdom_ranking_collection_state (state_key TEXT PRIMARY KEY,catalog_cursor INTEGER NOT NULL DEFAULT 0,board_cursor INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL DEFAULT 'IDLE',processed_runs INTEGER NOT NULL DEFAULT 0,success_count INTEGER NOT NULL DEFAULT 0,failed_count INTEGER NOT NULL DEFAULT 0,skipped_count INTEGER NOT NULL DEFAULT 0,last_kid INTEGER,last_board TEXT,last_success_at INTEGER,last_failure_at INTEGER,last_error TEXT,updated_at INTEGER NOT NULL)");
}
write("INSERT OR IGNORE INTO kingdom_ranking_collection_state(state_key,updated_at) VALUES ('KINGDOM_RANKING_ROLLER',strftime('%s','now'))");
if (!tableExists("kingdom_seeder_state")) {
  write("CREATE TABLE kingdom_seeder_state (state_key TEXT PRIMARY KEY,catalog_cursor INTEGER NOT NULL DEFAULT 0,processed_runs INTEGER NOT NULL DEFAULT 0,success_count INTEGER NOT NULL DEFAULT 0,failed_count INTEGER NOT NULL DEFAULT 0,skipped_count INTEGER NOT NULL DEFAULT 0,last_kid INTEGER,last_success_at INTEGER,last_failure_at INTEGER,last_error TEXT,updated_at INTEGER NOT NULL)");
}
write("INSERT OR IGNORE INTO kingdom_seeder_state(state_key,updated_at) VALUES ('KINGDOM_SEEDER',strftime('%s','now'))");
if (!tableExists("alliance_catalog")) {
  write("CREATE TABLE alliance_catalog (kid INTEGER NOT NULL,aid TEXT NOT NULL,abbr TEXT,name TEXT,power TEXT,member_count INTEGER,leader_name TEXT,leader_uid TEXT,leader_governor_id TEXT,flag_url TEXT,power_rank INTEGER,raw_json TEXT,source_observed_at INTEGER,first_seen_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'ACTIVE',PRIMARY KEY(kid,aid))");
}
ensureIndex("idx_alliance_catalog_kid_abbr","CREATE INDEX IF NOT EXISTS idx_alliance_catalog_kid_abbr ON alliance_catalog(kid,abbr)");
ensureIndex("idx_alliance_catalog_last_seen","CREATE INDEX IF NOT EXISTS idx_alliance_catalog_last_seen ON alliance_catalog(last_seen_at)");
if (!tableExists("alliance_collection_state")) {
  write("CREATE TABLE alliance_collection_state (state_key TEXT PRIMARY KEY,catalog_cursor INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL DEFAULT 'IDLE',processed_runs INTEGER NOT NULL DEFAULT 0,success_count INTEGER NOT NULL DEFAULT 0,failed_count INTEGER NOT NULL DEFAULT 0,skipped_count INTEGER NOT NULL DEFAULT 0,last_kid INTEGER,last_aid TEXT,last_success_at INTEGER,last_failure_at INTEGER,last_error TEXT,updated_at INTEGER NOT NULL)");
}
write("INSERT OR IGNORE INTO alliance_collection_state(state_key,updated_at) VALUES ('ALLIANCE_ROLLER',strftime('%s','now'))");
if (!tableExists("player_collection_state")) {
  write("CREATE TABLE player_collection_state (state_key TEXT PRIMARY KEY,catalog_cursor INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL DEFAULT 'IDLE',processed_runs INTEGER NOT NULL DEFAULT 0,success_count INTEGER NOT NULL DEFAULT 0,failed_count INTEGER NOT NULL DEFAULT 0,skipped_count INTEGER NOT NULL DEFAULT 0,last_kid INTEGER,last_governor_id TEXT,last_success_at INTEGER,last_failure_at INTEGER,last_error TEXT,updated_at INTEGER NOT NULL)");
}
write("INSERT OR IGNORE INTO player_collection_state(state_key,updated_at) VALUES ('PLAYER_ROLLER',strftime('%s','now'))");

const slots = run("SELECT COUNT(*) AS c FROM collection_semaphore_slots WHERE semaphore_key='GLOBAL_API' AND slot_id BETWEEN 1 AND 26")[0]?.c ?? 0;
if (APPLY && Number(slots) !== 26) {
  throw new Error("GLOBAL_API slot verification failed after reconciliation: " + slots);
}

if (!tableExists("d1_migrations") || !hasColumn("d1_migrations","name") || !hasColumn("d1_migrations","applied_at")) {
  throw new Error("Unexpected d1_migrations schema; refusing to rewrite migration history.");
}

if (APPLY) {
  const values = MIGRATIONS.map((name) => "('" + esc(name) + "',CURRENT_TIMESTAMP)").join(",");
  write("INSERT OR IGNORE INTO d1_migrations(name,applied_at) VALUES " + values);
}

console.log("Schema reconciliation finished.");
