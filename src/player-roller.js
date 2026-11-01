// The background player roller was retired (never scheduled; watchlists refresh top players and player pages fetch on demand).
// Only its last recorded state is kept for the operations status page.
const STATE_KEY = "PLAYER_ROLLER";

export async function getPlayerRollerStatus(db) {
  return db.prepare(
    "SELECT state_key, state, catalog_cursor, processed_runs, success_count, failed_count, skipped_count, last_kid, last_governor_id, last_success_at, last_failure_at, last_error, updated_at FROM player_collection_state WHERE state_key = ?"
  ).bind(STATE_KEY).first();
}
