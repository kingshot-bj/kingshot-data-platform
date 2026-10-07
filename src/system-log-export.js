const SYSTEM_LOG_EXPORT_RANGES = Object.freeze({
  "15m": 15 * 60,
  "30m": 30 * 60,
  "1h": 60 * 60,
  "3h": 3 * 60 * 60,
  "12h": 12 * 60 * 60,
  "24h": 24 * 60 * 60
});

const EXPORT_PREFIX = "exports/system-log/";
const BATCH_SIZE = 500;

function resolveRange(value) {
  const key = String(value || "24h").trim().toLowerCase();
  const safeKey = Object.prototype.hasOwnProperty.call(SYSTEM_LOG_EXPORT_RANGES, key) ? key : "24h";
  return { key: safeKey, seconds: SYSTEM_LOG_EXPORT_RANGES[safeKey] };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store"
    }
  });
}

function buildTraceFilter(traceId) {
  if (!traceId) return { sql: "", binds: [] };
  return {
    sql: ` AND (trace_id IN (
      WITH RECURSIVE trace_tree(trace_id,depth) AS (
        SELECT ?,0
        UNION
        SELECT e.trace_id, trace_tree.depth+1
        FROM system_event_log e
        JOIN trace_tree ON e.parent_trace_id=trace_tree.trace_id
        WHERE trace_tree.depth<16
      )
      SELECT trace_id FROM trace_tree
    ) OR parent_trace_id IN (
      WITH RECURSIVE trace_tree(trace_id,depth) AS (
        SELECT ?,0
        UNION
        SELECT e.trace_id, trace_tree.depth+1
        FROM system_event_log e
        JOIN trace_tree ON e.parent_trace_id=trace_tree.trace_id
        WHERE trace_tree.depth<16
      )
      SELECT trace_id FROM trace_tree
    ))`,
    binds: [String(traceId), String(traceId)]
  };
}

function rowToEvent(row) {
  let metadata = null;
  if (row.metadata_json) {
    try { metadata = JSON.parse(row.metadata_json); } catch { metadata = null; }
  }
  return { ...row, metadata };
}

async function createSystemLogExport(db, bucket, { range = "24h", traceId = null } = {}) {
  if (!db) throw new Error("D1_UNAVAILABLE");
  if (!bucket) throw new Error("R2_ARCHIVE_NOT_CONFIGURED");

  const resolved = resolveRange(range);
  const toUnix = Math.floor(Date.now() / 1000);
  const fromUnix = toUnix - resolved.seconds;
  const trace = buildTraceFilter(traceId);

  const countResult = await db.prepare(
    `SELECT COUNT(*) AS count FROM system_event_log
     WHERE created_at>=? AND created_at<=?${trace.sql}`
  ).bind(fromUnix, toUnix, ...trace.binds).first();
  const eventCount = Number(countResult?.count || 0);

  const timestamp = new Date(toUnix * 1000).toISOString().replace(/[:.]/g, "-");
  const key = `${EXPORT_PREFIX}${resolved.key}/system-log-${timestamp}-${crypto.randomUUID()}.json`;
  const encoder = new TextEncoder();

  let cursorCreatedAt = null;
  let cursorEventId = null;
  let done = false;
  let firstChunk = true;

  const stream = new ReadableStream({
    async pull(controller) {
      if (done) return;
      try {
        if (firstChunk) {
          firstChunk = false;
          controller.enqueue(encoder.encode(JSON.stringify({
            ok: true,
            format: "eagleeye-system-log-v1",
            range: {
              preset: resolved.key,
              from: new Date(fromUnix * 1000).toISOString(),
              to: new Date(toUnix * 1000).toISOString(),
              duration_seconds: resolved.seconds
            },
            event_count: eventCount,
            events: null
          }).replace(\"\\\"events\\\":null\", \"\\\"events\\\":[\")));
          return;
        }

        let sql = `SELECT event_id,trace_id,parent_trace_id,event_type,service,feature,operation,status,
          actor_type,actor_id,target_type,target_id,http_method,http_path,http_status,started_at,
          completed_at,elapsed_ms,error_code,message,metadata_json,created_at
          FROM system_event_log
          WHERE created_at>=? AND created_at<=?${trace.sql}`;
        const binds = [fromUnix, toUnix, ...trace.binds];

        if (cursorCreatedAt != null) {
          sql += " AND (created_at < ? OR (created_at = ? AND event_id < ?))";
          binds.push(cursorCreatedAt, cursorCreatedAt, cursorEventId);
        }

        sql += " ORDER BY created_at DESC, event_id DESC LIMIT ?";
        binds.push(BATCH_SIZE);

        const rows = (await db.prepare(sql).bind(...binds).all()).results || [];
        if (!rows.length) {
          controller.enqueue(encoder.encode("\n]}"));
          controller.close();
          done = true;
          return;
        }

        const payload = rows.map(rowToEvent).map((event, index) =>
          (cursorCreatedAt === null && index === 0 ? "" : ",") + JSON.stringify(event)
        ).join("");
        controller.enqueue(encoder.encode(payload));

        const last = rows[rows.length - 1];
        cursorCreatedAt = Number(last.created_at);
        cursorEventId = String(last.event_id);

        if (rows.length < BATCH_SIZE) {
          controller.enqueue(encoder.encode("\n]}"));
          controller.close();
          done = true;
        }
      } catch (error) {
        done = true;
        controller.error(error);
      }
    }
  });

  await bucket.put(key, stream, {
    httpMetadata: {
      contentType: "application/json",
      cacheControl: "private, no-store"
    },
    customMetadata: {
      source: "system_event_log",
      range: resolved.key,
      from: String(fromUnix),
      to: String(toUnix),
      eventCount: String(eventCount),
      traceId: traceId ? String(traceId) : ""
    }
  });

  return {
    key,
    range: resolved,
    from: fromUnix,
    to: toUnix,
    eventCount,
    downloadPath: "/api/admin/system-log/export/download?key=" + encodeURIComponent(key)
  };
}

export async function handleAdminSystemLogExportApi(request, env, auth) {
  if (!auth || !["ADMIN", "OWNER"].includes(auth.role) || auth.status !== "ACTIVE") {
    return json({ ok: false, error: "ADMIN_REQUIRED" }, 403);
  }
  if (request.method !== "GET") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const url = new URL(request.url);
    const result = await createSystemLogExport(env.DB, env.ARCHIVE, {
      range: url.searchParams.get("range") || "24h",
      traceId: url.searchParams.get("trace_id") || null
    });
    return json({ ok: true, export: result });
  } catch (error) {
    console.error("system_log_export_failed", error?.message || error);
    return json({
      ok: false,
      error: "SYSTEM_LOG_EXPORT_FAILED",
      message: String(error?.message || error).slice(0, 500)
    }, 503);
  }
}

export async function handleAdminSystemLogExportDownloadApi(request, env, auth) {
  if (!auth || !["ADMIN", "OWNER"].includes(auth.role) || auth.status !== "ACTIVE") {
    return json({ ok: false, error: "ADMIN_REQUIRED" }, 403);
  }
  if (request.method !== "GET") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!env.ARCHIVE) return json({ ok: false, error: "R2_ARCHIVE_NOT_CONFIGURED" }, 503);

  try {
    const url = new URL(request.url);
    const key = String(url.searchParams.get("key") || "");
    if (!key.startsWith(EXPORT_PREFIX) || key.includes("..") || key.includes("\\0")) {
      return json({ ok: false, error: "INVALID_EXPORT_KEY" }, 400);
    }

    const object = await env.ARCHIVE.get(key);
    if (!object?.body) return json({ ok: false, error: "EXPORT_NOT_FOUND" }, 404);

    const filename = key.split("/").pop() || "system-log.json";
    return new Response(object.body, {
      headers: {
        "content-type": "application/json; charset=UTF-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "private, no-store"
      }
    });
  } catch (error) {
    console.error("system_log_export_download_failed", error?.message || error);
    return json({ ok: false, error: "SYSTEM_LOG_EXPORT_DOWNLOAD_FAILED" }, 503);
  }
}
