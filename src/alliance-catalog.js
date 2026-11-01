// The background alliance roller was retired (never scheduled; the alliance page fetches its roster on demand and keeps R2 history).
// Only its last recorded state is kept for the operations status page.
const STATE_KEY = "ALLIANCE_ROLLER";

export async function getAllianceRollerStatus(db) {
  return db.prepare(
    "SELECT state_key, state, catalog_cursor, processed_runs, success_count, failed_count, skipped_count, last_kid, last_aid, last_success_at, last_failure_at, last_error, updated_at FROM alliance_collection_state WHERE state_key = ?"
  ).bind(STATE_KEY).first();
}
