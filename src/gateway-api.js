import { DIAGNOSTIC_SERVICES } from "./diagnostics.js";
import { getCloudflareD1Usage } from "./cloudflare-analytics.js";
import { getOperationalStatus } from "./status-ops.js";
import { getHistoryEmergencyBufferStatus } from "./history-emergency-buffer.js";
import { getSystemEventLog } from "./system-log.js";

const GATEWAY_VERSION = "v1";

const GATEWAY_LOG_RANGES = Object.freeze({
  "15m": 15 * 60,
  "30m": 30 * 60,
  "1h": 60 * 60,
  "3h": 3 * 60 * 60,
  "12h": 12 * 60 * 60,
  "24h": 24 * 60 * 60
});

function resolveGatewayLogRange(value) {
  const key = String(value || "15m").trim().toLowerCase();
  return {
    key: Object.prototype.hasOwnProperty.call(GATEWAY_LOG_RANGES, key) ? key : "15m",
    seconds: GATEWAY_LOG_RANGES[Object.prototype.hasOwnProperty.call(GATEWAY_LOG_RANGES, key) ? key : "15m"]
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store",
      "x-eagleeye-gateway": GATEWAY_VERSION
    }
  });
}

function constantTimeStringEqual(a, b) {
  const left = new TextEncoder().encode(String(a || ""));
  const right = new TextEncoder().encode(String(b || ""));
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

function isGatewayAuthorized(request, env) {
  const configuredToken = String(env.EAGLEEYE_GATEWAY_TOKEN || "").trim();
  const header = request.headers.get("Authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const providedToken = match ? match[1].trim() : "";
  return Boolean(configuredToken && providedToken) && constantTimeStringEqual(providedToken, configuredToken);
}

function sanitizeDiagnosticText(value) {
  if (value == null) return null;
  return String(value)
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/((?:api[_-]?key|token|secret|password)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .slice(0, 2000);
}

async function getReadOnlyDiagnostics(db, { recentLimit = 30 } = {}) {
  if (!db) throw new Error("D1_UNAVAILABLE");
  const limit = Math.min(Math.max(Number(recentLimit) || 30, 1), 100);
  const result = await db.prepare(
    "SELECT event_id, trace_id, service, feature, operation, status, error_code, message, provider, target_type, target_id, started_at, completed_at, elapsed_ms, source_observed_at, rows_received, rows_saved, created_at FROM diagnostic_events ORDER BY created_at DESC LIMIT ?"
  ).bind(limit).all();

  const events = (result.results || []).map(row => ({
    event_id: row.event_id,
    trace_id: row.trace_id,
    service: row.service,
    feature: row.feature,
    operation: row.operation,
    status: row.status,
    error_code: row.error_code,
    message: sanitizeDiagnosticText(row.message),
    provider: row.provider,
    target_type: row.target_type,
    target_id: row.target_id,
    started_at: row.started_at,
    completed_at: row.completed_at,
    elapsed_ms: row.elapsed_ms,
    source_observed_at: row.source_observed_at,
    rows_received: row.rows_received,
    rows_saved: row.rows_saved,
    created_at: row.created_at
  }));

  const latestByService = new Map();
  for (const event of events) if (!latestByService.has(event.service)) latestByService.set(event.service, event);

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

  return {
    overall: criticalFailed ? "CRITICAL" : (failed > 0 || warning > 0 || unknown > 0) ? "DEGRADED" : "SUCCESS",
    counts: { failed, criticalFailed, warning, unknown, criticalUnknown, healthy: services.filter(item => item.status === "SUCCESS").length },
    services,
    events
  };
}

async function getHistoryStorageStatus(env) {
  const mode = String(env.HISTORY_STORAGE_MODE || "UNSET").trim().toUpperCase();
  const bindingConfigured = Boolean(env.ARCHIVE);

  if (!bindingConfigured) {
    return {
      mode,
      archiveBindingConfigured: false,
      archiveReadProbe: "NOT_CONFIGURED",
      archiveReadOnly: true
    };
  }

  try {
    // Read-only runtime probe. head() returns null for a missing key and does not
    // create anything in R2, so this verifies the live binding without a test write.
    await env.ARCHIVE.head("__eagleeye_runtime_probe__");
    return {
      mode,
      archiveBindingConfigured: true,
      archiveReadProbe: "OK",
      archiveReadOnly: true
    };
  } catch (error) {
    return {
      mode,
      archiveBindingConfigured: true,
      archiveReadProbe: "FAILED",
      archiveReadOnly: true,
      archiveReadError: sanitizeDiagnosticText(error?.message || String(error))
    };
  }
}

async function handleGatewayStatus(request, env) {
  if (request.method !== "GET") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!String(env.EAGLEEYE_GATEWAY_TOKEN || "").trim()) return jsonResponse({ ok: false, error: "GATEWAY_NOT_CONFIGURED" }, 503);
  if (!isGatewayAuthorized(request, env)) return jsonResponse({ ok: false, error: "UNAUTHORIZED" }, 401);

  const url = new URL(request.url);
  const logRange = resolveGatewayLogRange(url.searchParams.get("range"));

  if (url.searchParams.get("full") === "1") {
    return await handleGatewayFullLogExport(request, env, logRange);
  }

  const retrievedAt = new Date();
  const retrievedAtUnix = Math.floor(retrievedAt.getTime() / 1000);
  const systemLogFromUnix = retrievedAtUnix - logRange.seconds;

  const [diagnosticsResult, usageResult, historyStorageResult, operationalResult, emergencyBufferResult, systemLogResult, systemLogCountResult] = await Promise.allSettled([
    getReadOnlyDiagnostics(env.DB, { recentLimit: 100 }),
    getCloudflareD1Usage(env),
    getHistoryStorageStatus(env),
    getOperationalStatus(env.DB),
    getHistoryEmergencyBufferStatus(env.DB),
    getSystemEventLog(env.DB, {
      limit: 500,
      since: systemLogFromUnix,
      until: retrievedAtUnix,
      pageSize: 500
    }),
    env.DB
      ? env.DB.prepare("SELECT COUNT(*) AS count FROM system_event_log WHERE created_at>=? AND created_at<=?").bind(systemLogFromUnix, retrievedAtUnix).first()
      : Promise.reject(new Error("D1_UNAVAILABLE"))
  ]);

  const systemLogEvents = systemLogResult.status === "fulfilled" ? systemLogResult.value : [];
  const systemLogError = systemLogResult.status === "rejected"
    ? sanitizeDiagnosticText(systemLogResult.reason?.message || String(systemLogResult.reason))
    : null;
  const systemLogTotalCount = systemLogCountResult.status === "fulfilled"
    ? Number(systemLogCountResult.value?.count || 0)
    : null;

  // /status intentionally returns only the newest 500 events. Full-window logs are
  // exported as one R2-backed JSON file by /api/admin/system-log/export, avoiding
  // giant Worker responses and isolate-memory pressure.
  const systemLogSummary = (() => {
    const services = {};
    const statuses = {};
    let metadataParseFailures = 0;
    let traceCount = 0;
    const traceIds = new Set();

    for (const event of systemLogEvents) {
      const service = String(event?.service || "unknown");
      const status = String(event?.status || "unknown");
      services[service] = (services[service] || 0) + 1;
      statuses[status] = (statuses[status] || 0) + 1;
      if (event?.trace_id) {
        traceIds.add(String(event.trace_id));
      }
      if (event?.metadata_json && event?.metadata == null && event.metadata_json !== "null") {
        metadataParseFailures += 1;
      }
    }

    return {
      event_count: systemLogTotalCount ?? systemLogEvents.length,
      returned_event_count: systemLogEvents.length,
      truncated: systemLogTotalCount != null ? systemLogTotalCount > systemLogEvents.length : false,
      trace_count: traceIds.size,
      services,
      statuses,
      metadata_parse_failures: metadataParseFailures,
      oldest_created_at: systemLogEvents.length
        ? systemLogEvents[systemLogEvents.length - 1]?.created_at ?? null
        : null,
      newest_created_at: systemLogEvents.length
        ? systemLogEvents[0]?.created_at ?? null
        : null,
      page_size: 500,
      complete_window_read: false,
      full_window_available_via_export: true
    };
  })();

  return jsonResponse({
    ok: true,
    gateway: {
      version: GATEWAY_VERSION,
      read_only: true,
      retrieved_at: retrievedAt.toISOString()
    },
    system: {
      overall: diagnosticsResult.status === "fulfilled" ? diagnosticsResult.value.overall : "CRITICAL",
      diagnostics: diagnosticsResult.status === "fulfilled" ? diagnosticsResult.value : { overall: "CRITICAL", counts: { failed: 1, criticalFailed: 1, warning: 0, unknown: 0, criticalUnknown: 0, healthy: 0 }, services: [], events: [], error: "DIAGNOSTICS_UNAVAILABLE" },
      cloudflare: usageResult.status === "fulfilled" ? usageResult.value : { configured: false, status: "UNKNOWN", error: "CLOUDFLARE_ANALYTICS_UNAVAILABLE" },
      historyStorage: historyStorageResult.status === "fulfilled"
        ? historyStorageResult.value
        : {
            mode: String(env.HISTORY_STORAGE_MODE || "UNSET").trim().toUpperCase(),
            archiveBindingConfigured: Boolean(env.ARCHIVE),
            archiveReadProbe: "UNKNOWN",
            archiveReadOnly: true,
            archiveReadError: "HISTORY_STORAGE_DIAGNOSTICS_UNAVAILABLE"
          },
      operational: operationalResult.status === "fulfilled"
        ? operationalResult.value
        : {
            apiPool: null,
            watchlist: null,
            error: "OPERATIONAL_STATUS_UNAVAILABLE"
          },
      historyEmergencyBuffer: emergencyBufferResult.status === "fulfilled"
        ? emergencyBufferResult.value
        : {
            pending: null,
            failed: null,
            bytes: null,
            limit: null,
            maxBytes: null,
            error: "HISTORY_EMERGENCY_BUFFER_STATUS_UNAVAILABLE"
          }
    },
    systemLog: {
      range: {
        preset: logRange.key,
        from: new Date(systemLogFromUnix * 1000).toISOString(),
        to: retrievedAt.toISOString(),
        duration_seconds: logRange.seconds
      },
      event_count: systemLogTotalCount ?? systemLogEvents.length,
      returned_event_count: systemLogEvents.length,
      truncated: systemLogTotalCount != null ? systemLogTotalCount > systemLogEvents.length : false,
      summary: systemLogSummary,
      events: systemLogEvents,
      export: {
        available: Boolean(env.ARCHIVE),
        endpoint: "/api/admin/system-log/export?range=" + encodeURIComponent(logRange.key)
      },
      error: systemLogError
    },
    runtime: {
      workerName: String(env.CLOUDFLARE_WORKER_NAME || "kingshot-data-platform"),
      historyStorageMode: String(env.HISTORY_STORAGE_MODE || "UNSET").trim().toUpperCase(),
      bindings: {
        DB: Boolean(env.DB),
        ARCHIVE: Boolean(env.ARCHIVE)
      },
      configuration: {
        CLOUDFLARE_ACCOUNT_ID: Boolean(env.CLOUDFLARE_ACCOUNT_ID),
        CLOUDFLARE_ANALYTICS_TOKEN: Boolean(env.CLOUDFLARE_ANALYTICS_TOKEN),
        CLOUDFLARE_D1_DATABASE_ID: Boolean(env.CLOUDFLARE_D1_DATABASE_ID),
        CLOUDFLARE_R2_BUCKET_NAME: Boolean(env.CLOUDFLARE_R2_BUCKET_NAME),
        MIGHTPULSE: Boolean(env.MIGHTPULSE_BASE_URL),
        DISCORD: Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.EAGLEEYE_SESSION_SECRET),
        GOOGLE_SHEETS_APPS_SCRIPT: Boolean(env.GOOGLE_SHEETS_WEBAPP_URL && env.GOOGLE_SHEETS_WEBAPP_SECRET),
        GOOGLE_SHEETS_SERVICE_ACCOUNT: Boolean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY && env.GOOGLE_SHEETS_SPREADSHEET_ID),
        GATEWAY: Boolean(env.EAGLEEYE_GATEWAY_TOKEN)
      }
    }
  });
}

async function handleGatewayFullLogExport(request, env, logRange) {
  const retrievedAt = new Date();
  const retrievedAtUnix = Math.floor(retrievedAt.getTime() / 1000);
  const systemLogFromUnix = retrievedAtUnix - logRange.seconds;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let cursorCreatedAt = null;
      let cursorEventId = null;
      let first = true;
      const enqueueText = value => controller.enqueue(encoder.encode(value));

      try {
        enqueueText(JSON.stringify({
          ok: true,
          format: "eagleeye-system-log-v1",
          range: {
            preset: logRange.key,
            from: new Date(systemLogFromUnix * 1000).toISOString(),
            to: retrievedAt.toISOString(),
            duration_seconds: logRange.seconds
          },
          events: []
        }).replace('"events":[]', '"events":['));

        while (true) {
          let sql = `SELECT event_id,trace_id,parent_trace_id,event_type,service,feature,operation,status,
            actor_type,actor_id,target_type,target_id,http_method,http_path,http_status,started_at,
            completed_at,elapsed_ms,error_code,message,metadata_json,created_at
            FROM system_event_log
            WHERE created_at>=? AND created_at<=?`;
          const binds = [systemLogFromUnix, retrievedAtUnix];

          if (cursorCreatedAt != null) {
            sql += " AND (created_at < ? OR (created_at = ? AND event_id < ?))";
            binds.push(cursorCreatedAt, cursorCreatedAt, cursorEventId);
          }

          sql += " ORDER BY created_at DESC, event_id DESC LIMIT ?";
          binds.push(500);

          const result = await env.DB.prepare(sql).bind(...binds).all();
          const rows = result.results || [];
          if (!rows.length) break;

          for (const row of rows) {
            const event = {
              ...row,
              metadata: row.metadata_json
                ? (() => { try { return JSON.parse(row.metadata_json); } catch { return null; } })()
                : null
            };
            delete event.metadata_json;
            enqueueText((first ? "" : ",") + JSON.stringify(event));
            first = false;
          }

          if (rows.length < 500) break;
          const last = rows[rows.length - 1];
          cursorCreatedAt = Number(last.created_at);
          cursorEventId = String(last.event_id);
        }

        enqueueText("]}");
        controller.close();
      } catch (error) {
        console.error("gateway_full_system_log_export_failed", error?.message || error);
        controller.error(error);
      }
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store",
      "content-disposition": 'attachment; filename="system-log.json"',
      "x-eagleeye-gateway": GATEWAY_VERSION,
      "x-eagleeye-system-log-export": "stream"
    }
  });
}

async function handleGatewayDiagnostics(request, env) {
  if (request.method !== "GET") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!String(env.EAGLEEYE_GATEWAY_TOKEN || "").trim()) return jsonResponse({ ok: false, error: "GATEWAY_NOT_CONFIGURED" }, 503);
  if (!isGatewayAuthorized(request, env)) return jsonResponse({ ok: false, error: "UNAUTHORIZED" }, 401);

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 100);
  try {
    const diagnostics = await getReadOnlyDiagnostics(env.DB, { recentLimit: limit });
    return jsonResponse({
      ok: true,
      gateway: { version: GATEWAY_VERSION, read_only: true, retrieved_at: new Date().toISOString() },
      diagnostics
    });
  } catch (error) {
    console.error("gateway_diagnostics_read_failed", error?.message || error);
    return jsonResponse({ ok: false, error: "DIAGNOSTICS_UNAVAILABLE" }, 503);
  }
}

export async function handleGatewayApi(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/gateway/v1/status") return await handleGatewayStatus(request, env);
  if (url.pathname === "/api/gateway/v1/diagnostics") return await handleGatewayDiagnostics(request, env);
  return jsonResponse({ ok: false, error: "NOT_FOUND" }, 404);
}
