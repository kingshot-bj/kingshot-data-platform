const DIAGNOSTIC_SERVICES = [
  ["api_pool", "API Pool", "CRITICAL"],
  ["mightpulse", "MightPulse API", "CRITICAL"],
  ["ranking", "ランキング取得", "DEGRADED"],
  ["player", "プレイヤー取得", "DEGRADED"],
  ["watchlist", "王国ウォッチリスト", "DEGRADED"],
  ["d1", "D1 Database", "CRITICAL"],
  ["discord", "Discord認証", "DEGRADED"],
  ["discord_support", "Discord Support", "DEGRADED"],
  ["google_sheets", "Google Sheets", "DEGRADED"],
  ["notifications", "通知システム", "DEGRADED"],
  ["retention", "データ保持", "DEGRADED"],
  ["history_storage", "履歴ストレージ", "DEGRADED"]
];

let diagnosticSchemaPromise = null;

export async function ensureDiagnosticSchema(db) {
  // diagnostic_events and its indexes are provisioned by D1 migrations.
  // Keep this function as a compatibility no-op for existing callers.
  return db || null;
}

export function diagnosticTraceId(prefix = "ee") {
  return prefix + "-" + crypto.randomUUID();
}

const DIAGNOSTIC_SUCCESS_THROTTLE_SECONDS = 300;
const diagnosticSuccessThrottle = new Map();

export async function recordDiagnostic(db, input = {}) {
  if (!db) return null;
  try {
    await ensureDiagnosticSchema(db);
    const now = Math.floor(Date.now() / 1000);
    const startedAt = Number(input.startedAt || now);
    const completedAt = Number(input.completedAt || now);
    const status = ["SUCCESS","WARNING","FAILED","WAITING"].includes(String(input.status))
      ? String(input.status)
      : "WARNING";
    const throttleKey = [
      String(input.service || "system"),
      String(input.feature || "unknown"),
      String(input.operation || "unknown")
    ].join(":");

    // SUCCESS is a heartbeat, not an audit event. Keep WARNING/FAILED durable,
    // but suppress repeated SUCCESS writes within the same Worker isolate.
    if (status === "SUCCESS") {
      const lastRecordedAt = Number(diagnosticSuccessThrottle.get(throttleKey) || 0);
      if (now - lastRecordedAt < DIAGNOSTIC_SUCCESS_THROTTLE_SECONDS) return null;
      diagnosticSuccessThrottle.set(throttleKey, now);
    }

    const event = {
      eventId: input.eventId || crypto.randomUUID(),
      traceId: input.traceId || diagnosticTraceId(),
      service: String(input.service || "system"),
      feature: String(input.feature || "unknown"),
      operation: String(input.operation || "unknown"),
      status,
      errorCode: input.errorCode ? String(input.errorCode) : null,
      message: input.message ? String(input.message).slice(0, 2000) : null,
      provider: input.provider ? String(input.provider) : null,
      targetType: input.targetType ? String(input.targetType) : null,
      targetId: input.targetId != null ? String(input.targetId) : null,
      startedAt,
      completedAt,
      elapsedMs: Number(input.elapsedMs ?? Math.max(0, (completedAt - startedAt) * 1000)),
      sourceObservedAt: Number(input.sourceObservedAt) > 0 ? Number(input.sourceObservedAt) : null,
      rowsReceived: input.rowsReceived == null ? null : Number(input.rowsReceived),
      rowsSaved: input.rowsSaved == null ? null : Number(input.rowsSaved),
      metadata: input.metadata || null,
      createdAt: now
    };
    await db.prepare(`
      INSERT INTO diagnostic_events
      (event_id, trace_id, service, feature, operation, status, error_code, message, provider,
       target_type, target_id, started_at, completed_at, elapsed_ms, source_observed_at,
       rows_received, rows_saved, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      event.eventId, event.traceId, event.service, event.feature, event.operation, event.status,
      event.errorCode, event.message, event.provider, event.targetType, event.targetId,
      event.startedAt, event.completedAt, event.elapsedMs, event.sourceObservedAt,
      event.rowsReceived, event.rowsSaved, event.metadata ? JSON.stringify(event.metadata) : null,
      event.createdAt
    ).run();
    return event;
  } catch (error) {
    // Diagnostics must never break the business operation.
    console.error("diagnostic_record_failed", error?.message || error);
    return null;
  }
}

export async function getSystemDiagnostics(db, { recentLimit = 100 } = {}) {
  await ensureDiagnosticSchema(db);
  const eventsResult = await db.prepare(
    "SELECT event_id, trace_id, service, feature, operation, status, error_code, message, provider, target_type, target_id, started_at, completed_at, elapsed_ms, source_observed_at, rows_received, rows_saved, metadata_json, created_at FROM diagnostic_events ORDER BY created_at DESC LIMIT ?"
  ).bind(Math.min(Math.max(Number(recentLimit) || 100, 1), 500)).all();
  const events = (eventsResult.results || []).map(row => ({
    ...row,
    metadata: row.metadata_json ? (() => { try { return JSON.parse(row.metadata_json); } catch { return null; } })() : null
  }));

  // Include the watchlist audit trail in the downloadable diagnostic JSON.
  // Bound the query to keep D1 reads and payload size predictable.
  const systemEventsResult = await db.prepare(
    "SELECT event_id, trace_id, parent_trace_id, event_type, service, feature, operation, status, target_type, target_id, started_at, completed_at, elapsed_ms, error_code, message, metadata_json, created_at FROM system_event_log WHERE service = 'watchlist' AND feature = 'kingdom_watchlist' ORDER BY created_at DESC LIMIT ?"
  ).bind(Math.min(Math.max(Number(recentLimit) || 100, 1), 100)).all();
  const systemEvents = (systemEventsResult.results || []).map(row => ({
    ...row,
    metadata: row.metadata_json ? (() => { try { return JSON.parse(row.metadata_json); } catch { return null; } })() : null
  }));

  const latestByService = new Map();
  for (const event of events) {
    if (!latestByService.has(event.service)) latestByService.set(event.service, event);
  }

  // Operational activity is also recorded in system_event_log. If a critical
  // service has no diagnostic_events heartbeat, use its latest operational
  // event rather than reporting UNKNOWN while successful API calls are visible.
  // Keep diagnostic_events authoritative whenever it has a record for the service.
  const operationalResult = await db.prepare(
    "SELECT service, status, event_type, trace_id, error_code, message, target_id, created_at FROM system_event_log WHERE service IN ('api_pool','mightpulse') ORDER BY created_at DESC LIMIT 100"
  ).all();
  for (const event of operationalResult.results || []) {
    if (latestByService.has(event.service)) continue;
    const status = String(event.status || "").toUpperCase();
    const eventType = String(event.event_type || "").toUpperCase();
    const normalizedStatus = status === "FAILED" || eventType.includes("FAIL") ? "FAILED"
      : status === "WAITING" ? "WAITING"
      : status === "WARNING" ? "WARNING"
      : ["SUCCESS", "COMPLETED"].includes(status) ? "SUCCESS"
      : null;
    if (!normalizedStatus) continue;
    latestByService.set(event.service, {
      service: event.service,
      status: normalizedStatus,
      trace_id: event.trace_id || null,
      error_code: event.error_code || null,
      message: event.message || null,
      target_id: event.target_id || null,
      created_at: event.created_at || null
    });
  }

  const services = DIAGNOSTIC_SERVICES.map(([key, label, severity]) => {
    const latest = latestByService.get(key);
    return {
      key,
      label,
      severity,
      status: latest?.status || "UNKNOWN",
      last_event_at: latest?.created_at || null,
      last_error_code: latest?.error_code || null,
      last_message: latest?.message || null,
      last_trace_id: latest?.trace_id || null,
      last_target_id: latest?.target_id || null
    };
  });

  const failed = services.filter(item => item.status === "FAILED").length;
  const criticalFailed = services.filter(item => item.severity === "CRITICAL" && item.status === "FAILED").length;
  const warning = services.filter(item => item.status === "WARNING").length;
  const waiting = services.filter(item => item.status === "WAITING").length;
  const unknown = services.filter(item => item.status === "UNKNOWN").length;
  const criticalUnknown = services.filter(item => item.severity === "CRITICAL" && item.status === "UNKNOWN").length;
  const degraded = failed > 0 || warning > 0 || unknown > 0;

  return {
    overall: criticalFailed ? "CRITICAL" : degraded ? "DEGRADED" : waiting > 0 ? "WAITING" : "SUCCESS",
    counts: {
      failed,
      criticalFailed,
      warning,
      waiting,
      unknown,
      criticalUnknown,
      healthy: services.filter(item => item.status === "SUCCESS").length
    },
    services,
    events,
    systemEvents
  };
}

export { DIAGNOSTIC_SERVICES };
