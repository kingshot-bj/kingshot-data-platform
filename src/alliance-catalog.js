import { collectAllianceDetail } from "./data-collection-engine.js";
import { recordSystemEvent, systemTraceId } from "./system-log.js";
import { recordDiagnostic } from "./diagnostics.js";
import { archiveAllianceHistoryBatch } from "./r2-archive.js";
import { enqueueHistoryEmergencyBuffer } from "./history-emergency-buffer.js";

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
    "SELECT state, catalog_cursor, last_kid, last_aid FROM alliance_collection_state WHERE state_key = ?"
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

  await db.prepare("UPDATE alliance_collection_state SET state = 'RUNNING', updated_at = ? WHERE state_key = ?").bind(startedAt, STATE_KEY).run();

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
  const pairWhere = rows.map(() => "(kid = ? AND aid = ?)").join(" OR ");
  const pairBindings = rows.flatMap(row => [Number(row.kid), String(row.aid)]);
  const previousRows = await db.prepare(
    "SELECT kid, aid, abbr, name, power, member_count, leader_name, leader_uid, leader_governor_id, flag_url, power_rank, source_observed_at FROM alliance_catalog WHERE " + pairWhere
  ).bind(...pairBindings).all();
  const previousByKey = new Map((previousRows.results || []).map(row => [
    String(row.kid) + ":" + String(row.aid),
    row
  ]));

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
    const memberCount = alliance.count == null ? (members ? members.length : null) : Number(alliance.count);
    const current = {
      abbr,
      name: alliance.name ?? row.name ?? null,
      power: alliance.power ?? row.power ?? null,
      member_count: memberCount,
      leader_name: alliance.leader_name ?? null,
      leader_uid: alliance.leader_uid ?? null,
      leader_governor_id: alliance.leader_governor_id ?? null,
      flag_url: alliance.flag_url ?? null,
      power_rank: alliance.power_rank == null ? (row.power_rank == null ? null : Number(row.power_rank)) : Number(alliance.power_rank)
    };
    const previous = previousByKey.get(String(row.kid) + ":" + String(row.aid));
    const fields = ["abbr","name","power","member_count","leader_name","leader_uid","leader_governor_id","flag_url","power_rank"];
    const changes = fields.filter(field => String(previous?.[field] ?? "") !== String(current[field] ?? ""));
    const changed = !previous || changes.length > 0;
    const sourceObservedAt = Number(payload?.source_observed_at ?? payload?.observed_at ?? 0) || null;

    if (changed) {
      let archived = false;
      if (env.R2_ARCHIVE) {
        try {
          await archiveAllianceHistoryBatch(env.R2_ARCHIVE, {
            kid: Number(row.kid),
            aid,
            observedAt,
            sourceObservedAt,
            payload
          });
          archived = true;
        } catch (error) {
          console.error("alliance_history_r2_archive_failed", { kid: row.kid, aid, message: error?.message || String(error) });
        }
      }
      if (!archived) {
        await enqueueHistoryEmergencyBuffer(env.DB, {
          historyType: "ALLIANCE",
          kid: Number(row.kid),
          observedAt,
          sourceObservedAt,
          payload: { aid, data: payload }
        });
      }

      await db.prepare(
        "UPDATE alliance_catalog SET abbr = ?, name = ?, power = ?, member_count = ?, leader_name = ?, leader_uid = ?, leader_governor_id = ?, flag_url = ?, power_rank = ?, raw_json = ?, source_observed_at = ?, last_seen_at = ?, updated_at = ?, status = 'ACTIVE' WHERE kid = ? AND aid = ?"
      ).bind(
        current.abbr,
        current.name,
        current.power,
        current.member_count,
        current.leader_name,
        current.leader_uid,
        current.leader_governor_id,
        current.flag_url,
        current.power_rank,
        JSON.stringify(payload ?? {}),
        sourceObservedAt,
        observedAt,
        observedAt,
        Number(row.kid),
        aid
      ).run();
    }

    return { kid: Number(row.kid), aid, abbr, memberCount, changed, changes, current, previous, observedAt, sourceObservedAt };
  }));

  const changeStatements = [];
  for (const result of results) {
    if (result.status !== "fulfilled" || !result.value.changed) continue;
    const item = result.value;
    for (const field of item.changes) {
      changeStatements.push(db.prepare(
        "INSERT INTO change_events (event_id, target_type, target_id, change_type, field_name, old_value_json, new_value_json, observation_id, detected_at, created_at) VALUES (?, 'ALLIANCE', ?, 'ALLIANCE_CHANGED', ?, ?, ?, ?, ?, ?)"
      ).bind(
        crypto.randomUUID(),
        String(item.kid) + ":" + String(item.aid),
        field,
        JSON.stringify(item.previous?.[field] ?? null),
        JSON.stringify(item.current?.[field] ?? null),
        item.sourceObservedAt ? String(item.sourceObservedAt) : null,
        item.observedAt,
        item.observedAt
      ));
    }
  }
  if (changeStatements.length) await db.batch(changeStatements);

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
        rowsSaved: result.value.changed ? 1 : 0,
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
    "UPDATE alliance_collection_state SET catalog_cursor = catalog_cursor + ?, processed_runs = processed_runs + 1, success_count = success_count + ?, failed_count = failed_count + ?, state = ?, last_kid = ?, last_aid = ?, last_success_at = CASE WHEN ? > 0 THEN ? ELSE last_success_at END, last_failure_at = CASE WHEN ? > 0 THEN ? ELSE last_failure_at END, last_error = ?, updated_at = ? WHERE state_key = ?"
  ).bind(
    rows.length,
    success,
    failed,
    failed ? "WARNING" : "IDLE",
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
    "SELECT state_key, state, catalog_cursor, processed_runs, success_count, failed_count, skipped_count, last_kid, last_aid, last_success_at, last_failure_at, last_error, updated_at FROM alliance_collection_state WHERE state_key = ?"
  ).bind(STATE_KEY).first();
}
