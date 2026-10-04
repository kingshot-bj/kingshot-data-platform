import { collectAllianceDetail } from "./data-collection-engine.js";
import { recordSystemEvent, systemTraceId } from "./system-log.js";
import { recordDiagnostic } from "./diagnostics.js";

const STATE_KEY = "ALLIANCE_ROLLER";
const DEFAULT_TARGETS_PER_RUN = 5;

function now() {
  return Math.floor(Date.now() / 1000);
}

function extractPayload(collected) {
  return collected?.result?.data ?? collected?.result ?? collected?.data ?? collected;
}

function extractAlliance(payload) {
  if (!payload || typeof payload !== "object") return {};
  return payload.alliance ?? payload.data?.alliance ?? payload.result?.alliance ?? payload;
}

export async function runAllianceRoller(env, {
  maxTargets = DEFAULT_TARGETS_PER_RUN
} = {}) {
  const db = env?.DB;
  if (!db) throw new Error("DB_NOT_CONFIGURED");

  const limit = Math.min(26, Math.max(1, Number(maxTargets) || DEFAULT_TARGETS_PER_RUN));
  const startedAt = now();
  const traceId = systemTraceId("alliance-roller");

  const state = await db.prepare(
    "SELECT catalog_cursor, last_kid, last_aid FROM alliance_collection_state WHERE state_key = ?"
  ).bind(STATE_KEY).first();

  const lastKid = Number(state?.last_kid || 0);
  const lastAid = String(state?.last_aid || "");

  const candidates = await db.prepare(
    "SELECT kid, target_id AS aid, MAX(abbr) AS abbr, MAX(name) AS name, MAX(score) AS power, MIN(rank) AS power_rank " +
    "FROM kingdom_ranking_current " +
    "WHERE target_type = 'ALLIANCE' AND board IN ('alliance_power','alliance_kills') " +
    "AND abbr IS NOT NULL AND TRIM(abbr) <> '' " +
    "AND (kid > ? OR (kid = ? AND target_id > ?)) " +
    "GROUP BY kid, target_id " +
    "ORDER BY kid ASC, target_id ASC LIMIT ?"
  ).bind(lastKid, lastKid, lastAid, limit).all();

  const rows = candidates.results || [];

  if (!rows.length) {
    await db.prepare(
      "UPDATE alliance_collection_state SET catalog_cursor = 0, last_kid = NULL, last_aid = NULL, state = 'IDLE', updated_at = ? WHERE state_key = ?"
    ).bind(startedAt, STATE_KEY).run();

    await recordSystemEvent(db, {
      traceId,
      eventType: "COMPLETE",
      service: "alliance_roller",
      feature: "alliance_catalog",
      operation: "COLLECT_BATCH",
      status: "SUCCESS",
      targetType: "ALLIANCE_BATCH",
      metadata: { targets: 0, reset: true }
    }).catch(() => {});

    return { ok: true, targets: 0, success: 0, failed: 0, skipped: 0, reset: true };
  }

  await recordSystemEvent(db, {
    traceId,
    eventType: "START",
    service: "alliance_roller",
    feature: "alliance_catalog",
    operation: "COLLECT_BATCH",
    status: "STARTED",
    targetType: "ALLIANCE_BATCH",
    metadata: { targets: rows.length, cursor: { kid: lastKid, aid: lastAid } }
  }).catch(() => {});

  const candidateStatements = rows.map(row => db.prepare(
    "INSERT INTO alliance_catalog (kid, aid, abbr, name, power, power_rank, first_seen_at, last_seen_at, updated_at, status) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE') " +
    "ON CONFLICT(kid, aid) DO UPDATE SET " +
    "abbr=COALESCE(excluded.abbr, alliance_catalog.abbr), " +
    "name=COALESCE(excluded.name, alliance_catalog.name), " +
    "power=COALESCE(excluded.power, alliance_catalog.power), " +
    "power_rank=COALESCE(excluded.power_rank, alliance_catalog.power_rank), " +
    "status='ACTIVE', updated_at=excluded.updated_at " +
    "WHERE COALESCE(alliance_catalog.abbr,'') <> COALESCE(excluded.abbr,'') " +
    "OR COALESCE(alliance_catalog.name,'') <> COALESCE(excluded.name,'') " +
    "OR COALESCE(alliance_catalog.power,'') <> COALESCE(excluded.power,'') " +
    "OR COALESCE(alliance_catalog.power_rank,-1) <> COALESCE(excluded.power_rank,-1)"
  ).bind(
    Number(row.kid),
    String(row.aid),
    String(row.abbr),
    row.name ?? null,
    row.power ?? null,
    row.power_rank == null ? null : Number(row.power_rank),
    startedAt,
    startedAt,
    startedAt
  ));
  if (candidateStatements.length) await db.batch(candidateStatements);

  const results = await Promise.allSettled(rows.map(async row => {
    const collected = await collectAllianceDetail(env, row.kid, row.abbr, {
      purpose: "ALLIANCE_ROLLER"
    });
    const payload = extractPayload(collected);
    const alliance = extractAlliance(payload);
    const observedAt = now();
    const aid = String(alliance.aid ?? row.aid);
    const abbr = String(alliance.abbr ?? row.abbr);
    const members = Array.isArray(payload?.members)
      ? payload.members
      : Array.isArray(payload?.roster)
        ? payload.roster
        : Array.isArray(payload?.data?.members)
          ? payload.data.members
          : null;

    await db.prepare(
      "UPDATE alliance_catalog SET abbr = ?, name = ?, power = ?, member_count = ?, leader_name = ?, leader_uid = ?, leader_governor_id = ?, flag_url = ?, power_rank = ?, raw_json = ?, source_observed_at = ?, last_seen_at = ?, updated_at = ?, status = 'ACTIVE' WHERE kid = ? AND aid = ?"
    ).bind(
      abbr,
      alliance.name ?? row.name ?? null,
      alliance.power ?? row.power ?? null,
      alliance.count == null ? (members ? members.length : null) : Number(alliance.count),
      alliance.leader_name ?? null,
      alliance.leader_uid ?? null,
      alliance.leader_governor_id ?? null,
      alliance.flag_url ?? null,
      alliance.power_rank == null ? (row.power_rank == null ? null : Number(row.power_rank)) : Number(alliance.power_rank),
      JSON.stringify(payload ?? {}),
      Number(payload?.source_observed_at ?? payload?.observed_at ?? 0) || null,
      observedAt,
      observedAt,
      Number(row.kid),
      aid
    ).run();

    return { kid: Number(row.kid), aid, abbr, memberCount: members?.length ?? null };
  }));

  let success = 0;
  let failed = 0;

  for (let i = 0; i < results.length; i++) {
    const row = rows[i];
    const result = results[i];
    if (result.status === "fulfilled") {
      success++;
      await recordDiagnostic(db, {
        service: "alliance_roller",
        feature: "alliance_catalog",
        operation: "COLLECT_ALLIANCE",
        status: "SUCCESS",
        provider: "MIGHTPULSE",
        targetType: "ALLIANCE",
        targetId: String(result.value.aid),
        rowsReceived: result.value.memberCount ?? 0,
        rowsSaved: 1,
        elapsedMs: Math.max(0, Date.now() - startedAt),
        message: "Alliance info / roster取得・Catalog保存成功。",
        metadata: { kid: result.value.kid, abbr: result.value.abbr }
      }).catch(() => {});
    } else {
      failed++;
      const error = result.reason;
      await recordDiagnostic(db, {
        service: "alliance_roller",
        feature: "alliance_catalog",
        operation: "COLLECT_ALLIANCE",
        status: "FAILED",
        errorCode: String(error?.code || error?.message || "ALLIANCE_COLLECTION_FAILED").split(":")[0],
        provider: "MIGHTPULSE",
        targetType: "ALLIANCE",
        targetId: String(row.kid) + ":" + String(row.abbr),
        message: String(error?.message || error).slice(0, 2000),
        metadata: { kid: Number(row.kid), abbr: row.abbr }
      }).catch(() => {});
    }
  }

  const last = rows[rows.length - 1];
  await db.prepare(
    "UPDATE alliance_collection_state SET catalog_cursor = catalog_cursor + ?, processed_runs = processed_runs + 1, success_count = success_count + ?, failed_count = failed_count + ?, last_kid = ?, last_aid = ?, last_success_at = CASE WHEN ? > 0 THEN ? ELSE last_success_at END, last_failure_at = CASE WHEN ? > 0 THEN ? ELSE last_failure_at END, last_error = ?, updated_at = ? WHERE state_key = ?"
  ).bind(
    rows.length,
    success,
    failed,
    Number(last.kid),
    String(last.aid),
    success,
    startedAt,
    failed,
    startedAt,
    failed ? "one or more alliance collections failed" : null,
    now(),
    STATE_KEY
  ).run();

  await recordSystemEvent(db, {
    traceId,
    eventType: "COMPLETE",
    service: "alliance_roller",
    feature: "alliance_catalog",
    operation: "COLLECT_BATCH",
    status: failed ? "WARNING" : "SUCCESS",
    targetType: "ALLIANCE_BATCH",
    metadata: { targets: rows.length, success, failed }
  }).catch(() => {});

  return {
    ok: failed === 0,
    targets: rows.length,
    success,
    failed,
    skipped: 0,
    lastKid: Number(last.kid),
    lastAid: String(last.aid)
  };
}

export async function getAllianceRollerStatus(db) {
  return db.prepare(
    "SELECT state_key, catalog_cursor, processed_runs, success_count, failed_count, skipped_count, last_kid, last_aid, last_success_at, last_failure_at, last_error, updated_at FROM alliance_collection_state WHERE state_key = ?"
  ).bind(STATE_KEY).first();
}
