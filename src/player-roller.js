import { collectPlayerDetail } from "./data-collection-engine.js";
import { saveApiObservation } from "./api-observations.js";
import { materializePlayer } from "./player-store.js";
import { recordSystemEvent, systemTraceId } from "./system-log.js";
import { recordDiagnostic } from "./diagnostics.js";

const STATE_KEY = "PLAYER_ROLLER";
const DEFAULT_TARGETS_PER_RUN = 5;
const BACKGROUND_FRESHNESS_SECONDS = 3600;

function now() {
  return Math.floor(Date.now() / 1000);
}

function extractPayload(collected) {
  return collected?.result?.data ?? collected?.result ?? collected?.data ?? collected;
}

export async function runPlayerRoller(env, {
  maxTargets = DEFAULT_TARGETS_PER_RUN
} = {}) {
  const db = env?.DB;
  if (!db) throw new Error("DB_NOT_CONFIGURED");

  const limit = Math.min(26, Math.max(1, Number(maxTargets) || DEFAULT_TARGETS_PER_RUN));
  const startedAt = now();
  const traceId = systemTraceId("player-roller");
  const state = await db.prepare(
    "SELECT state, catalog_cursor, last_kid, last_governor_id FROM player_collection_state WHERE state_key = ?"
  ).bind(STATE_KEY).first();

  const lastKid = Number(state?.last_kid || 0);
  const lastGovernorId = String(state?.last_governor_id || "");

  const candidates = await db.prepare(
    "SELECT r.kid, COALESCE(r.governor_id, r.target_id) AS governor_id, r.uid, r.nick_name, p.observed_at AS player_observed_at " +
    "FROM kingdom_ranking_current r " +
    "LEFT JOIN players p ON p.governor_id = COALESCE(r.governor_id, r.target_id) " +
    "WHERE r.target_type = 'PLAYER' AND r.board = 'personal_power' " +
    "AND COALESCE(r.governor_id, r.target_id) IS NOT NULL " +
    "AND (r.kid > ? OR (r.kid = ? AND COALESCE(r.governor_id, r.target_id) > ?)) " +
    "AND (p.observed_at IS NULL OR p.observed_at <= ?) " +
    "ORDER BY r.kid ASC, COALESCE(r.governor_id, r.target_id) ASC LIMIT ?"
  ).bind(lastKid, lastKid, lastGovernorId, startedAt - BACKGROUND_FRESHNESS_SECONDS, limit).all();

  const rows = candidates.results || [];

  if (!rows.length) {
    await db.prepare(
      "UPDATE player_collection_state SET catalog_cursor = 0, last_kid = NULL, last_governor_id = NULL, updated_at = ? WHERE state_key = ?"
    ).bind(startedAt, STATE_KEY).run();

    await recordSystemEvent(db, {
      traceId,
      eventType: "COMPLETE",
      service: "player_roller",
      feature: "player_collection",
      operation: "COLLECT_BATCH",
      status: "SUCCESS",
      targetType: "PLAYER_BATCH",
      metadata: { targets: 0, reset: true }
    }).catch(() => {});

    return { ok: true, targets: 0, success: 0, failed: 0, skipped: 0, reset: true };
  }

  await db.prepare("UPDATE player_collection_state SET state = 'RUNNING', updated_at = ? WHERE state_key = ?").bind(startedAt, STATE_KEY).run();

  await recordSystemEvent(db, {
    traceId,
    eventType: "START",
    service: "player_roller",
    feature: "player_collection",
    operation: "COLLECT_BATCH",
    status: "STARTED",
    targetType: "PLAYER_BATCH",
    metadata: {
      targets: rows.length,
      cursor: { kid: lastKid, governorId: lastGovernorId },
      freshnessSeconds: BACKGROUND_FRESHNESS_SECONDS
    }
  }).catch(() => {});

  const results = await Promise.allSettled(rows.map(async row => {
    const collected = await collectPlayerDetail(env, row.governor_id, {
      purpose: "PLAYER_ROLLER"
    });
    const rawPayload = extractPayload(collected);
    const playerPayload = rawPayload?.player && typeof rawPayload.player === "object"
      ? rawPayload.player
      : rawPayload;
    const observedAt = now();
    const sourceObservedAt = Number(rawPayload?.source_observed_at ?? rawPayload?.observed_at ?? 0) || null;

    if (!playerPayload || typeof playerPayload !== "object" || !playerPayload.governor_id) {
      const error = new Error("PLAYER_PAYLOAD_INVALID");
      error.code = "PLAYER_PAYLOAD_INVALID";
      throw error;
    }

    const observation = await saveApiObservation(db, {
      provider: "MIGHTPULSE",
      endpoint: "/players/:governor_id",
      target_type: "PLAYER",
      target_id: String(playerPayload.governor_id),
      observed_at: observedAt,
      source_observed_at: sourceObservedAt,
      http_status: Number(collected?.result?.status || 200),
      payload_json: JSON.stringify(rawPayload),
      created_at: observedAt
    });

    const materialized = await materializePlayer(
      db,
      {
        ...observation,
        payload: rawPayload
      },
      undefined,
      env.R2_ARCHIVE,
      String(env.HISTORY_STORAGE_MODE || "R2_ONLY")
    );

    return {
      kid: Number(playerPayload.kid ?? row.kid),
      governorId: String(playerPayload.governor_id),
      nickName: playerPayload.nick_name ?? row.nick_name ?? null,
      observationId: observation.observation_id,
      materialized
    };
  }));

  let success = 0;
  let failed = 0;

  for (let i = 0; i < results.length; i++) {
    const row = rows[i];
    const result = results[i];

    if (result.status === "fulfilled") {
      success++;
      await recordDiagnostic(db, {
        service: "player_roller",
        feature: "player_collection",
        operation: "COLLECT_PLAYER",
        status: "SUCCESS",
        provider: "MIGHTPULSE",
        targetType: "PLAYER",
        targetId: result.value.governorId,
        rowsReceived: 1,
        rowsSaved: 1,
        elapsedMs: Math.max(0, Date.now() - startedAt),
        message: "Player詳細取得・Current materialize成功。",
        metadata: {
          kid: result.value.kid,
          nickName: result.value.nickName,
          observationId: result.value.observationId,
          include: "base,heroes,ranks,gov_gear"
        }
      }).catch(() => {});
    } else {
      failed++;
      const error = result.reason;
      await recordDiagnostic(db, {
        service: "player_roller",
        feature: "player_collection",
        operation: "COLLECT_PLAYER",
        status: "FAILED",
        errorCode: String(error?.code || error?.message || "PLAYER_COLLECTION_FAILED").split(":")[0],
        provider: "MIGHTPULSE",
        targetType: "PLAYER",
        targetId: String(row.governor_id),
        message: String(error?.message || error).slice(0, 2000),
        metadata: { kid: Number(row.kid), nickName: row.nick_name ?? null }
      }).catch(() => {});
    }
  }

  const last = rows[rows.length - 1];
  await db.prepare(
    "UPDATE player_collection_state SET catalog_cursor = catalog_cursor + ?, processed_runs = processed_runs + 1, success_count = success_count + ?, failed_count = failed_count + ?, state = ?, last_kid = ?, last_governor_id = ?, last_success_at = CASE WHEN ? > 0 THEN ? ELSE last_success_at END, last_failure_at = CASE WHEN ? > 0 THEN ? ELSE last_failure_at END, last_error = ?, updated_at = ? WHERE state_key = ?"
  ).bind(
    rows.length,
    success,
    failed,
    failed ? "WARNING" : "IDLE",
    Number(last.kid),
    String(last.governor_id),
    success,
    startedAt,
    failed,
    startedAt,
    failed ? "one or more player collections failed" : null,
    now(),
    STATE_KEY
  ).run();

  await recordSystemEvent(db, {
    traceId,
    eventType: "COMPLETE",
    service: "player_roller",
    feature: "player_collection",
    operation: "COLLECT_BATCH",
    status: failed ? "WARNING" : "SUCCESS",
    targetType: "PLAYER_BATCH",
    metadata: { targets: rows.length, success, failed, freshnessSeconds: BACKGROUND_FRESHNESS_SECONDS }
  }).catch(() => {});

  return {
    ok: failed === 0,
    targets: rows.length,
    success,
    failed,
    skipped: 0,
    lastKid: Number(last.kid),
    lastGovernorId: String(last.governor_id)
  };
}

export async function getPlayerRollerStatus(db) {
  return db.prepare(
    "SELECT state_key, state, catalog_cursor, processed_runs, success_count, failed_count, skipped_count, last_kid, last_governor_id, last_success_at, last_failure_at, last_error, updated_at FROM player_collection_state WHERE state_key = ?"
  ).bind(STATE_KEY).first();
}
