import { runKingdomCatalogDiscovery } from "./kingdom-catalog.js";
import { recordSystemEvent, systemTraceId } from "./system-log.js";

const DISCOVERY_KEY = "MIGHTPULSE_KINGDOMS";
export const DISCOVERY_STALE_RUNNING_SECONDS = 15 * 60;
export const DISCOVERY_PAGE_INTERVAL_SECONDS = 10 * 60 - 30;

export async function runKingdomCatalogDailyRefresh(env) {
  if (!env?.DB) return { ok: false, skipped: true, reason: "DB_NOT_CONFIGURED" };

  const now = Math.floor(Date.now() / 1000);
  const state = await env.DB.prepare(
    "SELECT discovery_key, next_page, page_size, state, last_page_at, last_success_at, last_error, updated_at FROM kingdom_catalog_discovery WHERE discovery_key = ?"
  ).bind(DISCOVERY_KEY).first();

  if (!state) {
    return { ok: false, skipped: true, reason: "DISCOVERY_STATE_NOT_FOUND" };
  }

  // A worker that is stopped mid-page (CPU / time limit) cannot reset the
  // RUNNING flag. Treat RUNNING older than the stale window as abandoned, so
  // discovery does not stay stopped forever (it was stuck for weeks once).
  const updatedAt = Number(state.updated_at || 0);
  if (String(state.state || "") === "RUNNING" && now - updatedAt < DISCOVERY_STALE_RUNNING_SECONDS) {
    return { ok: true, skipped: true, reason: "DISCOVERY_ALREADY_RUNNING", nextPage: Number(state.next_page || 1) };
  }
  // One list page (24 kingdoms) per interval: ~1 full catalog cycle per day,
  // which is what the daily growth history needs, at ~144 requests/day.
  // A failed page also waits one interval (no tight retry loop on errors).
  const lastPageAt = Math.max(Number(state.last_page_at || 0), String(state.state || "") === "FAILED" ? updatedAt : 0);
  if (String(state.state || "") !== "RUNNING" && lastPageAt && now - lastPageAt < DISCOVERY_PAGE_INTERVAL_SECONDS) {
    return { ok: true, skipped: true, reason: "DISCOVERY_THROTTLED", nextPage: Number(state.next_page || 1) };
  }

  const nextPage = Math.max(1, Number(state.next_page || 1));


  const result = await runKingdomCatalogDiscovery(env, {
    page: nextPage,
    pageSize: Number(state.page_size || 24)
  });

  if (result?.nextPage === 1) {
    const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM kingdom_catalog").first();
    await recordSystemEvent(env.DB, {
      traceId: systemTraceId("kingdom-catalog-cycle"),
      eventType: "COMPLETE",
      service: "kingdom_catalog",
      feature: "kingdom_discovery",
      operation: "DISCOVERY_CYCLE",
      status: "SUCCESS",
      targetType: "CATALOG",
      targetId: "MIGHTPULSE_KINGDOMS",
      message: "王国Catalogの探索サイクルが完了しました。次のサイクルを継続します。",
      metadata: {
        catalogTotal: Number(count?.total || 0),
        page: Number(result.page || nextPage),
        rowsReceived: Number(result.rowsReceived || 0),
        newKingdoms: Number(result.rowsSaved || 0)
      }
    }).catch(() => {});
  }

  return {
    ok: true,
    skipped: false,
    ...result
  };
}
