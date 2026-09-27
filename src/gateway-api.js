const GATEWAY_VERSION = "v1";

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

async function handleGatewayStatus(request, env) {
  if (request.method !== "GET") return jsonResponse({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!String(env.EAGLEEYE_GATEWAY_TOKEN || "").trim()) return jsonResponse({ ok: false, error: "GATEWAY_NOT_CONFIGURED" }, 503);
  if (!isGatewayAuthorized(request, env)) return jsonResponse({ ok: false, error: "UNAUTHORIZED" }, 401);

  const [diagnosticsResult, usageResult] = await Promise.allSettled([
    getReadOnlyDiagnostics(env.DB, { recentLimit: 30 }),
    getCloudflareD1Usage(env)
  ]);

  return jsonResponse({
    ok: true,
    gateway: { version: GATEWAY_VERSION, read_only: true, retrieved_at: new Date().toISOString() },
    system: {
      overall: diagnosticsResult.status === "fulfilled" ? diagnosticsResult.value.overall : "CRITICAL",
      diagnostics: diagnosticsResult.status === "fulfilled" ? diagnosticsResult.value : { overall: "CRITICAL", counts: { failed: 1, criticalFailed: 1, warning: 0, unknown: 0, criticalUnknown: 0, healthy: 0 }, services: [], events: [], error: "DIAGNOSTICS_UNAVAILABLE" },
      cloudflare: usageResult.status === "fulfilled" ? usageResult.value : { configured: false, status: "UNKNOWN", error: "CLOUDFLARE_ANALYTICS_UNAVAILABLE" }
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
