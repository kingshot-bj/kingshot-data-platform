import { runKingdomCatalogDiscovery } from "./kingdom-catalog.js";
import { recordSystemEvent, systemTraceId } from "./system-log.js";

const DISCOVERY_KEY = "MIGHTPULSE_KINGDOMS";
const REFRESH_INTERVAL_SECONDS = 24 * 60 * 60;

export async function runKingdomCatalogDailyRefresh(env) {
  if (!env?.DB) return { ok: false, skipped: true, reason: "DB_NOT_CONFIGURED" };

  const now = Math.floor(Date.now() / 1000);
  const state = await env.DB.prepare(
    "SELECT discovery_key, next_page, page_size, state, last_success_at, last_error FROM kingdom_catalog_discovery WHERE discovery_key = ?"
  ).bind(DISCOVERY_KEY).first();

  if (!state) {
    return { ok: false, skipped: true, reason: "DISCOVERY_STATE_NOT_FOUND" };
  }

  if (String(state.state || "") === "RUNNING") {
    return { ok: true, skipped: true, reason: "DISCOVERY_ALREADY_RUNNING", nextPage: Number(state.next_page || 1) };
  }

  const nextPage = Math.max(1, Number(state.next_page || 1));
  const lastSuccessAt = Number(state.last_success_at || 0);

  // Once a full pagination cycle has returned to page 1, wait 24 hours
  // before starting the next cycle. Interrupted/failed cycles continue immediately.
  if (nextPage === 1 && lastSuccessAt > 0 && now - lastSuccessAt < REFRESH_INTERVAL_SECONDS) {
    return {
      ok: true,
      skipped: true,
      reason: "REFRESH_NOT_DUE",
      nextRefreshAt: lastSuccessAt + REFRESH_INTERVAL_SECONDS,
      catalogLastPageAt: lastSuccessAt
    };
  }

  const result = await runKingdomCatalogDiscovery(env, {
    page: nextPage,
    pageSize: Number(state.page_size || 24)
  });

  if (result?.nextPage === 1) {
    const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM kingdom_catalog").first();
    await recordSystemEvent(env.DB, {
      traceId: systemTraceId("kingdom-catalog-daily"),
      eventType: "COMPLETE",
      service: "kingdom_catalog",
      feature: "kingdom_discovery",
      operation: "DAILY_REFRESH",
      status: "SUCCESS",
      targetType: "CATALOG",
      targetId: "MIGHTPULSE_KINGDOMS",
      message: "MightPulse王国Catalogの24時間更新サイクルが完了しました。",
      metadata: {
        catalogTotal: Number(count?.total || 0),
        page: Number(result.page || nextPage),
        rowsReceived: Number(result.rowsReceived || 0),
        rowsSaved: Number(result.rowsSaved || 0),
        refreshIntervalSeconds: REFRESH_INTERVAL_SECONDS
      }
    }).catch(() => {});
  }

  return {
    ok: true,
    skipped: false,
    ...result,
    refreshIntervalSeconds: REFRESH_INTERVAL_SECONDS
  };
}
