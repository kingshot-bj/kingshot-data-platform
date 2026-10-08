import { collectMightPulseThroughGuards } from "./data-collection-engine.js";
import { recordSystemEvent, systemTraceId } from "./system-log.js";
import { recordDiagnostic } from "./diagnostics.js";

const DISCOVERY_KEY = "MIGHTPULSE_KINGDOMS";
const DEFAULT_PAGE_SIZE = 24;

function unixNow() {
  return Math.floor(Date.now() / 1000);
}

function extractKingdoms(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  for (const key of ["kingdoms", "items", "results", "data"]) {
    if (Array.isArray(payload[key])) return payload[key];
    if (payload[key] && typeof payload[key] === "object") {
      for (const nested of ["kingdoms", "items", "results"]) {
        if (Array.isArray(payload[key][nested])) return payload[key][nested];
      }
    }
  }
  return [];
}

function kingdomId(row) {
  const value = row?.kid ?? row?.kingdom_id ?? row?.kingdomId ?? row?.id;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function getKingdomCatalogDiscoveryStatus(db) {
  const row = await db.prepare(
    "SELECT discovery_key, next_page, page_size, state, pages_checked, kingdoms_seen, last_page_at, last_success_at, last_error, updated_at FROM kingdom_catalog_discovery WHERE discovery_key = ?"
  ).bind(DISCOVERY_KEY).first();
  const catalog = await db.prepare(
    "SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active FROM kingdom_catalog"
  ).first();
  return {
    ...(row || {
      discovery_key: DISCOVERY_KEY, next_page: 1, page_size: DEFAULT_PAGE_SIZE,
      state: "IDLE", pages_checked: 0, kingdoms_seen: 0,
      last_page_at: null, last_success_at: null, last_error: null, updated_at: null
    }),
    catalog_total: Number(catalog?.total || 0),
    catalog_active: Number(catalog?.active || 0)
  };
}

/**
 * Process exactly one bounded kingdom discovery page.
 * This intentionally does not loop through the whole catalog in one Worker run.
 */
export async function runKingdomCatalogDiscovery(env, {
  page = null,
  pageSize = DEFAULT_PAGE_SIZE,
  force = false
} = {}) {
  if (!env?.DB) throw new Error("DB_NOT_CONFIGURED");
  const now = unixNow();
  const current = await env.DB.prepare(
    "SELECT * FROM kingdom_catalog_discovery WHERE discovery_key = ?"
  ).bind(DISCOVERY_KEY).first();
  const targetPage = Number.isInteger(Number(page)) && Number(page) > 0
    ? Number(page)
    : Math.max(1, Number(current?.next_page || 1));
  const safePageSize = Math.min(24, Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE));

  await env.DB.prepare(
    "UPDATE kingdom_catalog_discovery SET state = 'RUNNING', page_size = ?, updated_at = ? WHERE discovery_key = ?"
  ).bind(safePageSize, now, DISCOVERY_KEY).run();

  const traceId = systemTraceId("kingdom-catalog");
  await recordSystemEvent(env.DB, {
    traceId,
    eventType: "START",
    service: "kingdom_catalog",
    feature: "kingdom_discovery",
    operation: "DISCOVERY_PAGE",
    status: "STARTED",
    targetType: "PAGE",
    targetId: String(targetPage),
    metadata: { page: targetPage, pageSize: safePageSize, force: Boolean(force) }
  });

  try {
    const fetched = await collectMightPulseThroughGuards(env, {
      path: "/kingdoms",
      endpoint: "/kingdoms",
      targetType: "CATALOG",
      targetId: String(targetPage),
      purpose: "KINGDOM_CATALOG_DISCOVERY",
      query: { page: targetPage, size: safePageSize }
    });
    const payload = fetched.result?.data;
    const rows = extractKingdoms(payload);
    const candidates = rows
      .map(row => ({ row, kid: kingdomId(row) }))
      .filter(item => item.kid);
    const uniqueCandidates = [...new Map(candidates.map(item => [item.kid, item])).values()];
    const existing = uniqueCandidates.length
      ? await env.DB.prepare(
          "SELECT kid, name, status, region, language, source_observed_at, last_seen_at, updated_at FROM kingdom_catalog WHERE kid IN (" + uniqueCandidates.map(() => "?").join(",") + ")"
        ).bind(...uniqueCandidates.map(item => item.kid)).all()
      : { results: [] };
    const existingByKid = new Map((existing.results || []).map(row => [Number(row.kid), row]));
    const inserts = [];
    const updates = [];
    for (const { row, kid } of uniqueCandidates) {
      const incomingName = row.name ?? row.kingdom_name ?? null;
      const incomingStatus = row.status ?? null;
      const incomingRegion = row.region ?? row.zone ?? null;
      const incomingLanguage = row.language ?? row.lang ?? null;
      const incomingObservedAt = Number(row.source_observed_at ?? row.observed_at ?? 0) || null;
      const currentRow = existingByKid.get(Number(kid));

      if (!currentRow) {
        inserts.push(env.DB.prepare(
          "INSERT INTO kingdom_catalog (kid, name, status, region, language, raw_json, source_observed_at, first_seen_at, last_seen_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(
          kid,
          incomingName,
          incomingStatus,
          incomingRegion,
          incomingLanguage,
          null,
          incomingObservedAt,
          now,
          now,
          now
        ));
        continue;
      }

      // Catalog discovery is also a metadata refresh. Only write rows whose
      // upstream metadata actually changed (or whose source observation is newer).
      // Missing upstream fields do not erase a value already known locally.
      const nextName = row.name !== undefined || row.kingdom_name !== undefined ? incomingName : currentRow.name;
      const nextStatus = row.status !== undefined ? incomingStatus : currentRow.status;
      const nextRegion = row.region !== undefined || row.zone !== undefined ? incomingRegion : currentRow.region;
      const nextLanguage = row.language !== undefined || row.lang !== undefined ? incomingLanguage : currentRow.language;
      const sourceObservedChanged = incomingObservedAt != null
        && incomingObservedAt !== Number(currentRow.source_observed_at || 0);
      const metadataChanged =
        nextName !== currentRow.name ||
        nextStatus !== currentRow.status ||
        nextRegion !== currentRow.region ||
        nextLanguage !== currentRow.language;

      if (metadataChanged || sourceObservedChanged) {
        updates.push(env.DB.prepare(
          "UPDATE kingdom_catalog SET name = ?, status = ?, region = ?, language = ?, source_observed_at = ?, last_seen_at = ?, updated_at = ? WHERE kid = ?"
        ).bind(
          nextName,
          nextStatus,
          nextRegion,
          nextLanguage,
          sourceObservedChanged ? incomingObservedAt : currentRow.source_observed_at,
          now,
          now,
          kid
        ));
      }
    }
    const statements = [...inserts, ...updates];
    if (statements.length) await env.DB.batch(statements);

    const rowsSaved = statements.length;
    const newKingdoms = inserts.length;
    const updatedKingdoms = updates.length;
    const nextPage = rows.length < safePageSize ? 1 : targetPage + 1;
    await env.DB.prepare(
      "UPDATE kingdom_catalog_discovery SET next_page = ?, state = 'IDLE', pages_checked = pages_checked + 1, kingdoms_seen = kingdoms_seen + ?, last_page_at = ?, last_success_at = ?, last_error = NULL, updated_at = ? WHERE discovery_key = ?"
    ).bind(nextPage, uniqueCandidates.length, now, now, now, DISCOVERY_KEY).run();

    await recordDiagnostic(env.DB, {
      service: "kingdom_catalog",
      feature: "kingdom_discovery",
      operation: "DISCOVERY_PAGE",
      status: "SUCCESS",
      provider: "MIGHTPULSE",
      targetType: "PAGE",
      targetId: String(targetPage),
      rowsReceived: rows.length,
      rowsSaved,
      message: "王国Catalogの1ページ取得が完了しました。",
      metadata: { page: targetPage, pageSize: safePageSize, nextPage, newKingdoms, updatedKingdoms, existingKingdoms: uniqueCandidates.length - newKingdoms - updatedKingdoms }
    });
    await recordSystemEvent(env.DB, {
      traceId,
      eventType: "COMPLETE",
      service: "kingdom_catalog",
      feature: "kingdom_discovery",
      operation: "DISCOVERY_PAGE",
      status: "SUCCESS",
      targetType: "PAGE",
      targetId: String(targetPage),
      metadata: { page: targetPage, rowsReceived: rows.length, rowsSaved: rowsSaved, nextPage, newKingdoms, updatedKingdoms, existingKingdoms: uniqueCandidates.length - newKingdoms - updatedKingdoms }
    });
    return { ok: true, page: targetPage, rowsReceived: rows.length, rowsSaved, newKingdoms, updatedKingdoms, nextPage };
  } catch (error) {
    await env.DB.prepare(
      "UPDATE kingdom_catalog_discovery SET state = 'FAILED', last_error = ?, updated_at = ? WHERE discovery_key = ?"
    ).bind(String(error?.message || error).slice(0, 2000), now, DISCOVERY_KEY).run().catch(() => {});
    await recordDiagnostic(env.DB, {
      service: "kingdom_catalog",
      feature: "kingdom_discovery",
      operation: "DISCOVERY_PAGE",
      status: "FAILED",
      errorCode: String(error?.code || error?.message || "KINGDOM_DISCOVERY_FAILED").split(":")[0],
      targetType: "PAGE",
      targetId: String(targetPage),
      message: String(error?.message || error).slice(0, 2000)
    }).catch(() => {});
    await recordSystemEvent(env.DB, {
      traceId,
      eventType: "ERROR",
      service: "kingdom_catalog",
      feature: "kingdom_discovery",
      operation: "DISCOVERY_PAGE",
      status: "FAILED",
      targetType: "PAGE",
      targetId: String(targetPage),
      errorCode: error?.code || "KINGDOM_DISCOVERY_FAILED",
      message: String(error?.message || error).slice(0, 2000)
    }).catch(() => {});
    throw error;
  }
}
