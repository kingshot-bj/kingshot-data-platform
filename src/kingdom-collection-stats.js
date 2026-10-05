const SOURCES = new Set(["OPERATOR", "USER"]);

export async function recordKingdomCollectionSuccess(db, {
  kid,
  source = "OPERATOR",
  collectedAt = Math.floor(Date.now() / 1000)
} = {}) {
  if (!db) throw new Error("DB_NOT_CONFIGURED");
  const kingdomId = Number(kid);
  if (!Number.isInteger(kingdomId) || kingdomId <= 0) {
    throw new Error("KINGDOM_ID_REQUIRED");
  }

  const normalizedSource = String(source || "OPERATOR").toUpperCase();
  if (!SOURCES.has(normalizedSource)) {
    throw new Error("KINGDOM_COLLECTION_SOURCE_INVALID");
  }

  const at = Math.floor(Number(collectedAt));
  if (!Number.isFinite(at) || at <= 0) {
    throw new Error("KINGDOM_COLLECTION_TIME_INVALID");
  }

  await db.prepare(
    `INSERT INTO kingdom_collection_stats
      (kid, first_collected_at, last_collected_at, total_collection_count,
       operator_collection_count, user_collection_count, last_source, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)
     ON CONFLICT(kid) DO UPDATE SET
       first_collected_at = CASE
         WHEN kingdom_collection_stats.first_collected_at IS NULL
           OR excluded.first_collected_at < kingdom_collection_stats.first_collected_at
         THEN excluded.first_collected_at
         ELSE kingdom_collection_stats.first_collected_at
       END,
       last_collected_at = CASE
         WHEN kingdom_collection_stats.last_collected_at IS NULL
           OR excluded.last_collected_at > kingdom_collection_stats.last_collected_at
         THEN excluded.last_collected_at
         ELSE kingdom_collection_stats.last_collected_at
       END,
       total_collection_count = kingdom_collection_stats.total_collection_count + 1,
       operator_collection_count = kingdom_collection_stats.operator_collection_count + excluded.operator_collection_count,
       user_collection_count = kingdom_collection_stats.user_collection_count + excluded.user_collection_count,
       last_source = excluded.last_source,
       updated_at = excluded.updated_at`
  ).bind(
    kingdomId,
    at,
    at,
    normalizedSource === "OPERATOR" ? 1 : 0,
    normalizedSource === "USER" ? 1 : 0,
    normalizedSource,
    at,
    at
  ).run();

  return {
    kid: kingdomId,
    source: normalizedSource,
    collectedAt: at
  };
}

export async function getKingdomCollectionCoverage(db) {
  if (!db) throw new Error("DB_NOT_CONFIGURED");

  const [catalog, collected] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS total FROM kingdom_catalog").first(),
    db.prepare("SELECT COUNT(*) AS collected, COALESCE(SUM(total_collection_count), 0) AS collection_count, COALESCE(SUM(operator_collection_count), 0) AS operator_collection_count, COALESCE(SUM(user_collection_count), 0) AS user_collection_count, MAX(last_collected_at) AS last_collected_at FROM kingdom_collection_stats").first()
  ]);

  const catalogTotal = Number(catalog?.total || 0);
  const collectedCount = Number(collected?.collected || 0);

  return {
    catalogTotal,
    collectedCount,
    uncollectedCount: Math.max(0, catalogTotal - collectedCount),
    collectionCount: Number(collected?.collection_count || 0),
    operatorCollectionCount: Number(collected?.operator_collection_count || 0),
    userCollectionCount: Number(collected?.user_collection_count || 0),
    lastCollectedAt: collected?.last_collected_at == null ? null : Number(collected.last_collected_at)
  };
}
