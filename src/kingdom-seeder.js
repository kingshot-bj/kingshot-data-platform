import { collectMightPulseThroughGuards } from "./data-collection-engine.js";
import { recordSystemEvent, systemTraceId } from "./system-log.js";
import { recordDiagnostic } from "./diagnostics.js";
import { archiveKingdomCatalogSnapshot } from "./r2-archive.js";

const DEFAULT_TARGETS_PER_RUN = 2;
const DISCOVERY_KEY = "MIGHTPULSE_KINGDOMS";

function now() { return Math.floor(Date.now() / 1000); }

function extractObject(payload) {
  if (!payload || typeof payload !== "object") return {};
  if (payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) return payload.data;
  return payload;
}

export async function runKingdomSeeder(env, {
  maxTargets = DEFAULT_TARGETS_PER_RUN
} = {}) {
  if (!env?.DB) throw new Error("DB_NOT_CONFIGURED");
  const safeMax = Math.min(5, Math.max(1, Number(maxTargets) || DEFAULT_TARGETS_PER_RUN));
  const startedAt = now();
  const traceId = systemTraceId("kingdom-seeder");

  const state = await env.DB.prepare("SELECT catalog_cursor FROM kingdom_seeder_state WHERE state_key = ?").bind("KINGDOM_SEEDER").first();
  const cursor = Number(state?.catalog_cursor || 0);
  const targets = await env.DB.prepare(
    "SELECT kid, name, status, last_seen_at FROM kingdom_catalog ORDER BY kid LIMIT ? OFFSET ?"
  ).bind(safeMax, cursor).all();

  const rows = targets.results || [];
  const result = { ok: true, targets: rows.length, success: 0, failed: 0, skipped: 0 };

  await recordSystemEvent(env.DB, {
    traceId,
    eventType: "START",
    service: "kingdom_seeder",
    feature: "kingdom_seed",
    operation: "SEED_BATCH",
    status: "STARTED",
    targetType: "KINGDOM_BATCH",
    metadata: { maxTargets: safeMax, targetCount: rows.length }
  });

  for (const row of rows) {
    const kid = Number(row.kid);
    const targetTrace = systemTraceId("kingdom-seed");
    try {
      const detail = await collectMightPulseThroughGuards(env, {
        path: `/kingdoms/${encodeURIComponent(kid)}?include=boards&limit=100`,
        endpoint: "/kingdoms/:kid?include=boards&limit=100",
        targetType: "KINGDOM",
        targetId: String(kid),
        purpose: "KINGDOM_SEED"
      });

      const payload = extractObject(detail.result?.data);
      const observedAt = now();
      const archive = await archiveKingdomCatalogSnapshot(env.ARCHIVE, {
        kid,
        payload,
        observedAt
      });
      if (!archive?.key) throw new Error("KINGDOM_CATALOG_R2_ARCHIVE_FAILED");
      await env.DB.prepare(
        "UPDATE kingdom_catalog SET name = COALESCE(?, name), status = COALESCE(?, status), region = COALESCE(?, region), language = COALESCE(?, language), raw_json = NULL, boards_json = NULL, boards_observed_at = ?, source_observed_at = ?, last_seen_at = ?, updated_at = ?, r2_latest_key = ? WHERE kid = ?"
      ).bind(
        payload.name ?? payload.kingdom_name ?? null,
        payload.status ?? null,
        payload.region ?? payload.zone ?? null,
        payload.language ?? payload.lang ?? null,
        observedAt,
        Number(payload.source_observed_at ?? payload.observed_at ?? 0) || null,
        observedAt,
        observedAt,
        archive.key,
        kid
      ).run();

      await recordDiagnostic(env.DB, {
        service: "kingdom_seeder",
        feature: "kingdom_seed",
        operation: "SEED_KINGDOM",
        status: "SUCCESS",
        provider: "MIGHTPULSE",
        targetType: "KINGDOM",
        targetId: String(kid),
        rowsReceived: 1,
        rowsSaved: 1,
        elapsedMs: Math.max(0, Date.now() - startedAt),
        message: "王国current state取得成功。",
        metadata: { endpoint: "/kingdoms/:kid" }
      });
      await recordSystemEvent(env.DB, {
        traceId: targetTrace,
        eventType: "COMPLETE",
        service: "kingdom_seeder",
        feature: "kingdom_seed",
        operation: "SEED_KINGDOM",
        status: "SUCCESS",
        targetType: "KINGDOM",
        targetId: String(kid)
      });
      result.success++;
    } catch (error) {
      result.failed++;
      await recordDiagnostic(env.DB, {
        service: "kingdom_seeder",
        feature: "kingdom_seed",
        operation: "SEED_KINGDOM",
        status: "FAILED",
        errorCode: String(error?.code || error?.message || "KINGDOM_SEED_FAILED").split(":")[0],
        provider: "MIGHTPULSE",
        targetType: "KINGDOM",
        targetId: String(kid),
        message: String(error?.message || error).slice(0, 2000)
      }).catch(() => {});
      await recordSystemEvent(env.DB, {
        traceId: targetTrace,
        eventType: "ERROR",
        service: "kingdom_seeder",
        feature: "kingdom_seed",
        operation: "SEED_KINGDOM",
        status: "FAILED",
        targetType: "KINGDOM",
        targetId: String(kid),
        errorCode: error?.code || "KINGDOM_SEED_FAILED",
        message: String(error?.message || error).slice(0, 2000)
      }).catch(() => {});
    }
  }

  const countResult = await env.DB.prepare("SELECT COUNT(*) AS count FROM kingdom_catalog").first();
  const total = Number(countResult?.count || 0);
  const nextCursor = rows.length && cursor + rows.length < total ? cursor + rows.length : 0;
  await env.DB.prepare("UPDATE kingdom_seeder_state SET catalog_cursor = ?, processed_runs = processed_runs + 1, success_count = success_count + ?, failed_count = failed_count + ?, last_kid = ?, last_success_at = CASE WHEN ? > 0 THEN ? ELSE last_success_at END, last_failure_at = CASE WHEN ? > 0 THEN ? ELSE last_failure_at END, last_error = ?, updated_at = ? WHERE state_key = ?").bind(nextCursor, result.success, result.failed, rows[rows.length - 1]?.kid ?? null, result.success, startedAt, result.failed, startedAt, result.failed ? "one or more kingdoms failed" : null, now(), "KINGDOM_SEEDER").run();

  await recordSystemEvent(env.DB, {
    traceId,
    eventType: "COMPLETE",
    service: "kingdom_seeder",
    feature: "kingdom_seed",
    operation: "SEED_BATCH",
    status: result.failed ? "WARNING" : "SUCCESS",
    metadata: { ...result }
  });
  return result;
}
