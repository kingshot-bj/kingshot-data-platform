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
    const status = ["SUCCESS","WARNING","FAILED"].includes(String(input.status))
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

  const latestByService = new Map();
  for (const event of events) {
    if (!latestByService.has(event.service)) latestByService.set(event.service, event);
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
  const unknown = services.filter(item => item.status === "UNKNOWN").length;
  const criticalUnknown = services.filter(item => item.severity === "CRITICAL" && item.status === "UNKNOWN").length;
  const degraded = failed > 0 || warning > 0 || unknown > 0;

  return {
    overall: criticalFailed ? "CRITICAL" : degraded ? "DEGRADED" : "SUCCESS",
    counts: {
      failed,
      criticalFailed,
      warning,
      unknown,
      criticalUnknown,
      healthy: services.filter(item => item.status === "SUCCESS").length
    },
    services,
    events
  };
}

export { DIAGNOSTIC_SERVICES };
