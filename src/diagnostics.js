const DIAGNOSTIC_SERVICES = [
  ["api_pool", "API Pool", "CRITICAL"],
  ["mightpulse", "MightPulse API", "CRITICAL"],
  ["ranking", "ランキング取得", "DEGRADED"],
  ["player", "プレイヤー取得", "DEGRADED"],
  ["watchlist", "王国ウォッチリスト", "DEGRADED"],
  ["d1", "D1 Database", "CRITICAL"],
  ["discord", "Discord認証", "DEGRADED"],
  ["google_sheets", "Google Sheets", "DEGRADED"],
  ["notifications", "通知システム", "DEGRADED"]
];

export async function ensureDiagnosticSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS diagnostic_events (
      event_id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL,
      service TEXT NOT NULL,
      feature TEXT NOT NULL,
      operation TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('SUCCESS','WARNING','FAILED')),
      error_code TEXT,
      message TEXT,
      provider TEXT,
      target_type TEXT,
      target_id TEXT,
      started_at INTEGER NOT NULL,
      completed_at INTEGER NOT NULL,
      elapsed_ms INTEGER NOT NULL DEFAULT 0,
      source_observed_at INTEGER,
      rows_received INTEGER,
      rows_saved INTEGER,
      metadata_json TEXT,
      created_at INTEGER NOT NULL
    )
  `).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_diagnostic_events_created ON diagnostic_events(created_at DESC)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_diagnostic_events_service ON diagnostic_events(service, created_at DESC)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_diagnostic_events_trace ON diagnostic_events(trace_id)").run();
}

export function diagnosticTraceId(prefix = "ee") {
  return prefix + "-" + crypto.randomUUID();
}

export async function recordDiagnostic(db, input = {}) {
  if (!db) return null;
  try {
    await ensureDiagnosticSchema(db);
    const now = Math.floor(Date.now() / 1000);
    const startedAt = Number(input.startedAt || now);
    const completedAt = Number(input.completedAt || now);
    const event = {
      eventId: input.eventId || crypto.randomUUID(),
      traceId: input.traceId || diagnosticTraceId(),
      service: String(input.service || "system"),
      feature: String(input.feature || "unknown"),
      operation: String(input.operation || "unknown"),
      status: ["SUCCESS","WARNING","FAILED"].includes(String(input.status)) ? String(input.status) : "WARNING",
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
