export async function verifyKingdomCatalogR2Backfill(env) {
  if (!env?.DB) throw new Error("DB_NOT_CONFIGURED");
  if (!env?.ARCHIVE) throw new Error("R2_ARCHIVE_NOT_CONFIGURED");
  const state = await env.DB.prepare(
    "SELECT last_kid FROM kingdom_catalog_r2_migration WHERE migration_key = ? LIMIT 1"
  ).bind("KINGDOM_CATALOG_R2_BACKFILL").first();
  const lastKid = Number(state?.last_kid || 0);
  if (!lastKid) return { checked: 0, r2: 0, pointer: 0, rawNull: 0, boardsNull: 0, failed: 0, rows: [] };
  const selected = await env.DB.prepare(
    "SELECT kid, r2_latest_key, raw_json, boards_json FROM kingdom_catalog WHERE kid <= ? AND r2_latest_key IS NOT NULL ORDER BY kid DESC LIMIT 10"
  ).bind(lastKid).all();
  const rows = [];
  for (const row of (selected.results || [])) {
    let r2Exists = false;
    let r2Error = null;
    try {
      r2Exists = Boolean(await env.ARCHIVE.head(String(row.r2_latest_key)));
    } catch (error) {
      r2Error = String(error?.message || error).slice(0, 300);
    }
    const pointerOk = Boolean(row.r2_latest_key);
    const rawNull = row.raw_json == null;
    const boardsNull = row.boards_json == null;
    rows.push({
      kid: Number(row.kid),
      r2Key: String(row.r2_latest_key),
      r2Exists,
      pointerOk,
      rawNull,
      boardsNull,
      ok: r2Exists && pointerOk && rawNull && boardsNull,
      r2Error
    });
  }
  return {
    checked: rows.length,
    r2: rows.filter(r => r.r2Exists).length,
    pointer: rows.filter(r => r.pointerOk).length,
    rawNull: rows.filter(r => r.rawNull).length,
    boardsNull: rows.filter(r => r.boardsNull).length,
    failed: rows.filter(r => !r.ok).length,
    rows
  };
}
