// Latest headline stats per kingdom, for pages that compare many kingdoms at
// once (KvK matchups). Filled from the kingdom catalog crawl's list response
// (GET /v1/kingdoms, already fetched) — no extra MightPulse calls. One small
// row per kingdom, replaced in place; history stays in R2 (kingdom growth).
// Activity-style fields are deliberately not stored.

const COLUMNS = ["kid", "power", "power_gain_7d", "power_rank", "age_days", "player_count", "observed_at"];
const ROWS_PER_STATEMENT = 14; // 14 × 7 = 98 bind params (D1 limit 100)

let schemaReady = null;
export function resetKingdomStatsSchemaCache() { schemaReady = null; }
export async function ensureKingdomStatsSchema(db) {
  if (!schemaReady) {
    schemaReady = db.prepare("CREATE TABLE IF NOT EXISTS kingdom_stats_current (kid INTEGER PRIMARY KEY, power INTEGER, power_gain_7d INTEGER, power_rank INTEGER, age_days INTEGER, player_count INTEGER, observed_at INTEGER NOT NULL)").run()
      .then(() => db.prepare("CREATE INDEX IF NOT EXISTS idx_kingdom_stats_current_power_rank ON kingdom_stats_current (power_rank)").run())
      .catch(error => { schemaReady = null; throw error; });
  }
  return schemaReady;
}

const int = v => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : null; };

export function kingdomStatsRow(kid, row, observedAt) {
  if (!row || typeof row !== "object") return null;
  const id = int(kid);
  if (!id) return null;
  const out = [id, int(row.power), int(row.power_gain_7d), int(row.power_rank), int(row.age_days), int(row.player_count), int(observedAt)];
  return out.slice(1, 6).some(v => v != null) ? out : null;
}

// rows: [{ kid, row }] from the catalog crawl.
export async function saveKingdomStats(db, items, observedAt) {
  const rows = (items || []).map(i => kingdomStatsRow(i.kid, i.row, observedAt)).filter(Boolean);
  if (!db || !rows.length) return 0;
  await ensureKingdomStatsSchema(db);
  const statements = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_STATEMENT) {
    const chunk = rows.slice(i, i + ROWS_PER_STATEMENT);
    statements.push(db.prepare(`INSERT OR REPLACE INTO kingdom_stats_current (${COLUMNS.join(", ")}) VALUES ` + chunk.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ")).bind(...chunk.flat()));
  }
  await db.batch(statements);
  return rows.length;
}
