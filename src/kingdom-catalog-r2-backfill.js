import { archiveKingdomCatalogSnapshot } from "./r2-archive.js";
import { recordSystemEvent, systemTraceId } from "./system-log.js";
import { recordDiagnostic } from "./diagnostics.js";

const MIGRATION_KEY = "KINGDOM_CATALOG_R2_BACKFILL";
const DEFAULT_BATCH_SIZE = 10;
const MAX_BATCH_SIZE = 100;

function now() {
  return Math.floor(Date.now() / 1000);
}

function parseJsonObject(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function buildPayload(row) {
  return {
    kid: Number(row.kid),
    name: row.name ?? null,
    status: row.status ?? null,
    region: row.region ?? null,
    language: row.language ?? null,
    source_observed_at: row.source_observed_at ?? null,
    first_seen_at: row.first_seen_at ?? null,
    last_seen_at: row.last_seen_at ?? null,
    updated_at: row.updated_at ?? null,
    raw_json: parseJsonObject(row.raw_json),
    boards_json: parseJsonObject(row.boards_json)
  };
}

/**
 * Archive at most 100 legacy catalog rows.
 *
 * Safety contract:
 * - Never clears D1 before the corresponding R2 put succeeds.
 * - Resumes by kid, so a failed batch does not repeat already archived rows.
 * - Never runs from Cron; callers must explicitly invoke this bounded operation.
 */
export async function runKingdomCatalogR2Backfill(env, {
  batchSize = DEFAULT_BATCH_SIZE
} = {}) {
  if (!env?.DB) throw new Error("DB_NOT_CONFIGURED");
  if (!env?.ARCHIVE) throw new Error("R2_ARCHIVE_NOT_CONFIGURED");

  const safeBatchSize = Math.min(MAX_BATCH_SIZE, Math.max(1, Number(batchSize) || DEFAULT_BATCH_SIZE));
  const startedAtMs = Date.now();
  const startedAt = now();
  const traceId = systemTraceId("kingdom-catalog-r2-backfill");

  const state = await env.DB.prepare(
    "SELECT * FROM kingdom_catalog_r2_migration WHERE migration_key = ?"
  ).bind(MIGRATION_KEY).first();
  const lastKid = Number(state?.last_kid || 0);

  await env.DB.prepare(
    "UPDATE kingdom_catalog_r2_migration SET state = 'RUNNING', updated_at = ? WHERE migration_key = ?"
  ).bind(startedAt, MIGRATION_KEY).run();

  await recordSystemEvent(env.DB, {
    traceId,
    eventType: "START",
    service: "kingdom_catalog",
    feature: "r2_backfill",
    operation: "BACKFILL_BATCH",
    status: "STARTED",
    targetType: "KINGDOM_CATALOG",
    metadata: { batchSize: safeBatchSize, lastKid }
  });

  try {
    const selected = await env.DB.prepare(
      "SELECT kid, name, status, region, language, raw_json, boards_json, source_observed_at, first_seen_at, last_seen_at, updated_at FROM kingdom_catalog WHERE kid > ? AND r2_latest_key IS NULL AND (raw_json IS NOT NULL OR boards_json IS NOT NULL) ORDER BY kid ASC LIMIT ?"
    ).bind(lastKid, safeBatchSize).all();
    const rows = selected.results || [];

    if (!rows.length) {
      await env.DB.prepare(
        "UPDATE kingdom_catalog_r2_migration SET state = 'COMPLETE', last_batch_count = 0, last_batch_at = ?, last_success_at = ?, last_error = NULL, updated_at = ? WHERE migration_key = ?"
      ).bind(startedAt, startedAt, startedAt, MIGRATION_KEY).run();
      await recordSystemEvent(env.DB, {
        traceId,
        eventType: "COMPLETE",
        service: "kingdom_catalog",
        feature: "r2_backfill",
        operation: "BACKFILL_BATCH",
        status: "SUCCESS",
        targetType: "KINGDOM_CATALOG",
        metadata: { batchSize: safeBatchSize, archived: 0, complete: true, lastKid }
      });
      return { ok: true, complete: true, archived: 0, nextKid: lastKid, elapsedMs: Date.now() - startedAtMs };
    }

    let archived = 0;
    let nextKid = lastKid;

    for (const row of rows) {
      const kid = Number(row.kid);
      const payload = buildPayload(row);
      const observedAt = Number(row.source_observed_at || row.updated_at || row.last_seen_at || startedAt);

      const archive = await archiveKingdomCatalogSnapshot(env.ARCHIVE, {
        kid,
        payload,
        observedAt
      });
      if (!archive?.key) throw new Error("KINGDOM_CATALOG_R2_ARCHIVE_FAILED");

      await env.DB.prepare(
        "UPDATE kingdom_catalog SET raw_json = NULL, boards_json = NULL, r2_latest_key = ?, updated_at = ? WHERE kid = ? AND r2_latest_key IS NULL"
      ).bind(archive.key, startedAt, kid).run();

      archived++;
      nextKid = kid;
    }

    const newState = await env.DB.prepare(
      "SELECT rows_archived, batches_run FROM kingdom_catalog_r2_migration WHERE migration_key = ?"
    ).bind(MIGRATION_KEY).first();
    await env.DB.prepare(
      "UPDATE kingdom_catalog_r2_migration SET last_kid = ?, state = 'IDLE', batches_run = ?, rows_archived = ?, last_batch_count = ?, last_batch_at = ?, last_success_at = ?, last_error = NULL, updated_at = ? WHERE migration_key = ?"
    ).bind(
      nextKid,
      Number(newState?.batches_run || 0) + 1,
      Number(newState?.rows_archived || 0) + archived,
      archived,
      startedAt,
      startedAt,
      startedAt,
      MIGRATION_KEY
    ).run();

    await recordDiagnostic(env.DB, {
      service: "kingdom_catalog",
      feature: "r2_backfill",
      operation: "BACKFILL_BATCH",
      status: "SUCCESS",
      targetType: "KINGDOM_CATALOG",
      rowsReceived: rows.length,
      rowsSaved: archived,
      elapsedMs: Date.now() - startedAtMs,
      message: "既存Catalog詳細データのR2退避バッチが完了しました。",
      metadata: { batchSize: safeBatchSize, lastKid, nextKid, archived }
    });
    await recordSystemEvent(env.DB, {
      traceId,
      eventType: "COMPLETE",
      service: "kingdom_catalog",
      feature: "r2_backfill",
      operation: "BACKFILL_BATCH",
      status: "SUCCESS",
      targetType: "KINGDOM_CATALOG",
      metadata: { batchSize: safeBatchSize, archived, nextKid, elapsedMs: Date.now() - startedAtMs }
    });

    return {
      ok: true,
      complete: rows.length < safeBatchSize,
      archived,
      nextKid,
      elapsedMs: Date.now() - startedAtMs
    };
  } catch (error) {
    await env.DB.prepare(
      "UPDATE kingdom_catalog_r2_migration SET state = 'FAILED', last_error = ?, updated_at = ? WHERE migration_key = ?"
    ).bind(String(error?.message || error).slice(0, 2000), now(), MIGRATION_KEY).run().catch(() => {});
    await recordDiagnostic(env.DB, {
      service: "kingdom_catalog",
      feature: "r2_backfill",
      operation: "BACKFILL_BATCH",
      status: "FAILED",
      errorCode: String(error?.code || error?.message || "KINGDOM_CATALOG_R2_BACKFILL_FAILED").split(":")[0],
      targetType: "KINGDOM_CATALOG",
      elapsedMs: Date.now() - startedAtMs,
      message: String(error?.message || error).slice(0, 2000)
    }).catch(() => {});
    await recordSystemEvent(env.DB, {
      traceId,
      eventType: "ERROR",
      service: "kingdom_catalog",
      feature: "r2_backfill",
      operation: "BACKFILL_BATCH",
      status: "FAILED",
      targetType: "KINGDOM_CATALOG",
      errorCode: error?.code || "KINGDOM_CATALOG_R2_BACKFILL_FAILED",
      message: String(error?.message || error).slice(0, 2000)
    }).catch(() => {});
    throw error;
  }
}
