import { collectKingdomRanking } from "./data-collection-engine.js";
import { saveKingdomRankingBoard } from "./ranking-store.js";
import { RANKING_CATALOG } from "./ranking-catalog.js";
import { recordSystemEvent, systemTraceId } from "./system-log.js";
import { recordDiagnostic } from "./diagnostics.js";

const STATE_KEY = "KINGDOM_RANKING_ROLLER";
const DEFAULT_KINGDOMS_PER_RUN = 1;
const DEFAULT_BOARDS_PER_RUN = 2;

function now() { return Math.floor(Date.now() / 1000); }

function extractEntries(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  for (const key of ["ranks", "rankings", "items", "results", "data"]) {
    if (Array.isArray(payload[key])) return payload[key];
    if (payload[key] && typeof payload[key] === "object") {
      for (const nested of ["ranks", "rankings", "items", "results"]) {
        if (Array.isArray(payload[key][nested])) return payload[key][nested];
      }
    }
  }
  return [];
}

export async function runKingdomRankingRoller(env, {
  kingdomsPerRun = DEFAULT_KINGDOMS_PER_RUN,
  boardsPerRun = DEFAULT_BOARDS_PER_RUN
} = {}) {
  const db = env?.DB;
  if (!db) throw new Error("DB_NOT_CONFIGURED");
  const kingdomLimit = Math.min(2, Math.max(1, Number(kingdomsPerRun) || 1));
  const boardLimit = Math.min(3, Math.max(1, Number(boardsPerRun) || 2));
  const traceId = systemTraceId("kingdom-ranking-roller");
  const startedAt = now();

  const state = await db.prepare(
    "SELECT catalog_cursor, board_cursor FROM kingdom_ranking_collection_state WHERE state_key = ?"
  ).bind(STATE_KEY).first();
  const catalog = await db.prepare(
    "SELECT kid FROM kingdom_catalog ORDER BY kid LIMIT ? OFFSET ?"
  ).bind(kingdomLimit, Number(state?.catalog_cursor || 0)).all();
  const kingdoms = catalog.results || [];
  if (!kingdoms.length) {
    await db.prepare(
      "UPDATE kingdom_ranking_collection_state SET catalog_cursor = 0, board_cursor = 0, state = 'IDLE', updated_at = ? WHERE state_key = ?"
    ).bind(startedAt, STATE_KEY).run();
    return { ok: true, targets: 0, success: 0, failed: 0, skipped: 0, reset: true };
  }

  let boardCursor = Number(state?.board_cursor || 0);
  const boards = RANKING_CATALOG.slice(boardCursor, boardCursor + boardLimit);
  let success = 0;
  let failed = 0;

  await recordSystemEvent(db, {
    traceId, eventType: "START", service: "kingdom_ranking_roller",
    feature: "kingdom_ranking", operation: "COLLECT_BATCH", status: "STARTED",
    targetType: "KINGDOM_BATCH",
    metadata: { kingdomsPerRun: kingdomLimit, boardsPerRun: boardLimit, boardCursor }
  });

  for (const kingdom of kingdoms) {
    for (const board of boards) {
      try {
        const collected = await collectKingdomRanking(env, kingdom.kid, board.key, {
          limit: 100,
          purpose: "KINGDOM_RANKING_ROLLER"
        });
        const payload = collected?.result?.data ?? collected?.result ?? collected?.data ?? collected;
        const entries = extractEntries(payload);
        const observedAt = now();
        await saveKingdomRankingBoard(db, {
          kid: Number(kingdom.kid),
          board: board.key,
          entries,
          observedAt,
          sourceObservedAt: Number(payload?.source_observed_at ?? payload?.observed_at ?? 0) || null,
          sourceObservationId: payload?.source_observation_id ?? null,
          archiveBucket: env.R2_ARCHIVE,
          historyMode: String(env.HISTORY_STORAGE_MODE || "R2_ONLY")
        });
        success++;
        await recordDiagnostic(db, {
          service: "kingdom_ranking_roller", feature: "kingdom_ranking",
          operation: "COLLECT_BOARD", status: "SUCCESS", provider: "MIGHTPULSE",
          targetType: "KINGDOM", targetId: String(kingdom.kid),
          rowsReceived: entries.length, rowsSaved: entries.length,
          elapsedMs: Math.max(0, Date.now() - startedAt),
          message: "王国ランキング取得・current保存成功。",
          metadata: { board: board.key }
        });
      } catch (error) {
        failed++;
        await recordDiagnostic(db, {
          service: "kingdom_ranking_roller", feature: "kingdom_ranking",
          operation: "COLLECT_BOARD", status: "FAILED",
          errorCode: String(error?.code || error?.message || "KINGDOM_RANKING_FAILED").split(":")[0],
          provider: "MIGHTPULSE", targetType: "KINGDOM", targetId: String(kingdom.kid),
          message: String(error?.message || error).slice(0, 2000),
          metadata: { board: board.key }
        }).catch(() => {});
      }
    }
  }

  const nextBoard = boardCursor + boards.length;
  const nextKingdomCursor = nextBoard >= RANKING_CATALOG.length
    ? Number(state?.catalog_cursor || 0) + kingdoms.length
    : Number(state?.catalog_cursor || 0);
  const normalizedBoard = nextBoard >= RANKING_CATALOG.length ? 0 : nextBoard;
  const maxCatalog = await db.prepare("SELECT COUNT(*) AS count FROM kingdom_catalog").first();
  const totalCatalog = Number(maxCatalog?.count || 0);
  const finalCatalogCursor = nextKingdomCursor >= totalCatalog ? 0 : nextKingdomCursor;

  await db.prepare(
    "UPDATE kingdom_ranking_collection_state SET catalog_cursor = ?, board_cursor = ?, state = ?, processed_runs = processed_runs + 1, success_count = success_count + ?, failed_count = failed_count + ?, last_kid = ?, last_board = ?, last_success_at = CASE WHEN ? > 0 THEN ? ELSE last_success_at END, last_failure_at = CASE WHEN ? > 0 THEN ? ELSE last_failure_at END, last_error = ?, updated_at = ? WHERE state_key = ?"
  ).bind(
    finalCatalogCursor, normalizedBoard, failed ? "WARNING" : "IDLE",
    success, failed, kingdoms[kingdoms.length - 1]?.kid ?? null,
    boards[boards.length - 1]?.key ?? null,
    success, startedAt, failed, startedAt,
    failed ? "one or more board collections failed" : null, now(), STATE_KEY
  ).run();

  await recordSystemEvent(db, {
    traceId, eventType: "COMPLETE", service: "kingdom_ranking_roller",
    feature: "kingdom_ranking", operation: "COLLECT_BATCH",
    status: failed ? "WARNING" : "SUCCESS",
    metadata: { kingdoms: kingdoms.length, boards: boards.length, success, failed }
  });
  return { ok: failed === 0, targets: kingdoms.length * boards.length, success, failed, skipped: 0 };
}
