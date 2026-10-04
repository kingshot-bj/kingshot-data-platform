import { collectMightPulseThroughGuards } from "./data-collection-engine.js";
import { getKingdomCatalogDiscoveryStatus } from "./kingdom-catalog.js";
import { recordSystemEvent, systemTraceId } from "./system-log.js";
import { recordDiagnostic } from "./diagnostics.js";

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

  const targets = await env.DB.prepare(
    "SELECT kid, name, status, last_seen_at FROM kingdom_catalog ORDER BY CASE WHEN status = 'ACTIVE' THEN 0 ELSE 1 END, last_seen_at DESC LIMIT ?"
  ).bind(safeMax).all();

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
      await env.DB.prepare(
        "UPDATE kingdom_catalog SET name = COALESCE(?, name), status = COALESCE(?, status), region = COALESCE(?, region), language = COALESCE(?, language), raw_json = ?, boards_json = ?, boards_observed_at = ?, source_observed_at = ?, last_seen_at = ?, updated_at = ? WHERE kid = ?"
      ).bind(
        payload.name ?? payload.kingdom_name ?? null,
        payload.status ?? null,
        payload.region ?? payload.zone ?? null,
        payload.language ?? payload.lang ?? null,
        JSON.stringify(payload),
        JSON.stringify(payload.boards ?? payload.ranking_boards ?? payload.leaderboards ?? []),
        observedAt,
        Number(payload.source_observed_at ?? payload.observed_at ?? 0) || null,
        observedAt,
        observedAt,
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
