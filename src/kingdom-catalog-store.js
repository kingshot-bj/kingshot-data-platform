import { archiveKingdomCatalogSnapshot } from "./r2-archive.js";

function now() {
  return Math.floor(Date.now() / 1000);
}

function extractKingdomCatalogPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  if (value.data && typeof value.data === "object" && !Array.isArray(value.data)) return value.data;
  return value;
}

/**
 * Persist one complete Kingdom Catalog observation.
 *
 * D1 keeps only the lightweight searchable/current-state index.
 * The complete API payload is always archived to R2 first.
 */
export async function saveKingdomCatalogObservation(env, {
  kid,
  payload: rawPayload,
  observedAt = now()
} = {}) {
  if (!env?.DB) throw new Error("DB_NOT_CONFIGURED");
  if (!env?.ARCHIVE) throw new Error("R2_ARCHIVE_NOT_CONFIGURED");

  const kingdomId = Number(kid);
  if (!Number.isFinite(kingdomId)) throw new Error("KINGDOM_ID_INVALID");

  const payload = extractKingdomCatalogPayload(rawPayload);
  const archive = await archiveKingdomCatalogSnapshot(env.ARCHIVE, {
    kid: kingdomId,
    payload,
    observedAt
  });
  if (!archive?.key) throw new Error("KINGDOM_CATALOG_R2_ARCHIVE_FAILED");

  await env.DB.prepare(
    "INSERT INTO kingdom_catalog (kid, name, status, region, language, raw_json, source_observed_at, first_seen_at, last_seen_at, updated_at, boards_json, boards_observed_at, r2_latest_key) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?) ON CONFLICT(kid) DO UPDATE SET name=COALESCE(excluded.name, kingdom_catalog.name), status=COALESCE(excluded.status, kingdom_catalog.status), region=COALESCE(excluded.region, kingdom_catalog.region), language=COALESCE(excluded.language, kingdom_catalog.language), source_observed_at=excluded.source_observed_at, last_seen_at=excluded.last_seen_at, updated_at=excluded.updated_at, boards_observed_at=excluded.boards_observed_at, r2_latest_key=excluded.r2_latest_key"
  ).bind(
    kingdomId,
    payload.name ?? payload.kingdom_name ?? null,
    payload.status ?? null,
    payload.region ?? payload.zone ?? null,
    payload.language ?? payload.lang ?? null,
    Number(payload.source_observed_at ?? payload.observed_at ?? 0) || null,
    observedAt,
    observedAt,
    observedAt,
    observedAt,
    archive.key
  ).run();

  return {
    kid: kingdomId,
    r2Key: archive.key,
    observedAt,
    payload
  };
}
