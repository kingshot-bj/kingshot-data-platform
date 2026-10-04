const SYSTEM_LOG_MAX_MESSAGE = 2000;
const SYSTEM_LOG_MAX_METADATA_BYTES = 12000;

let systemLogSchemaPromise = null;

async function ensureSystemLogSchema(db) {
  // Schema is provisioned by migrations/0028_system_event_log.sql.
  // Request-time logging must never perform DDL or index creation.
  return Boolean(db);
}

export function systemTraceId(prefix = "ee") { return prefix + "-" + crypto.randomUUID(); }
function safeJson(value) {
  if (value == null) return null;
  try { const text = JSON.stringify(value); if (text.length <= SYSTEM_LOG_MAX_METADATA_BYTES) return text; return JSON.stringify({ truncated:true, preview:text.slice(0,SYSTEM_LOG_MAX_METADATA_BYTES) }); }
  catch { return JSON.stringify({ serialization_error:true }); }
}
function clean(value, max = SYSTEM_LOG_MAX_MESSAGE) { return value == null ? null : String(value).slice(0,max); }

export async function recordSystemEvent(db, input = {}) {
  if (!db) return null;
  try {
    await ensureSystemLogSchema(db);
  } catch (error) {
    console.error("system_event_log_schema_ensure_failed", error?.message || error);
    return null;
  }
  const now = Math.floor(Date.now()/1000);
  const startedAt = Number(input.startedAt || now);
  const completedAt = input.completedAt == null ? now : Number(input.completedAt);
  const event = { eventId:input.eventId||crypto.randomUUID(), traceId:input.traceId||systemTraceId(), parentTraceId:input.parentTraceId||null,
    eventType:clean(input.eventType||"EVENT",80), service:clean(input.service||"system",120), feature:clean(input.feature,160), operation:clean(input.operation,160),
    status:clean(input.status||"INFO",40), actorType:clean(input.actorType,80), actorId:clean(input.actorId,160), targetType:clean(input.targetType,80), targetId:clean(input.targetId,200),
    httpMethod:clean(input.httpMethod,16), httpPath:clean(input.httpPath,300), httpStatus:input.httpStatus==null?null:Number(input.httpStatus), startedAt, completedAt,
    elapsedMs:input.elapsedMs==null?Math.max(0,(completedAt-startedAt)*1000):Number(input.elapsedMs), errorCode:clean(input.errorCode,160), message:clean(input.message), metadataJson:safeJson({ ...(input.metadata && typeof input.metadata === "object" ? input.metadata : {}), ...(input.runId != null ? { runId:String(input.runId) } : {}), ...(input.jobId != null ? { jobId:String(input.jobId) } : {}), ...(input.leaseId != null ? { leaseId:String(input.leaseId) } : {}) }), createdAt:now };
  try {
    await db.prepare("INSERT INTO system_event_log (event_id,trace_id,parent_trace_id,event_type,service,feature,operation,status,actor_type,actor_id,target_type,target_id,http_method,http_path,http_status,started_at,completed_at,elapsed_ms,error_code,message,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(
      event.eventId,event.traceId,event.parentTraceId,event.eventType,event.service,event.feature,event.operation,event.status,event.actorType,event.actorId,event.targetType,event.targetId,event.httpMethod,event.httpPath,event.httpStatus,event.startedAt,event.completedAt,event.elapsedMs,event.errorCode,event.message,event.metadataJson,event.createdAt).run();
    return event;
  } catch(error) { console.error("system_event_log_write_failed",error?.message||error); return null; }
}

export function createSystemTrace({ traceId = null, parentTraceId = null, actorType = null, actorId = null, targetType = null, targetId = null, metadata = null } = {}) {
  return {
    traceId: traceId || systemTraceId("op"),
    parentTraceId: parentTraceId || null,
    actorType: actorType || null,
    actorId: actorId || null,
    targetType: targetType || null,
    targetId: targetId || null,
    metadata: metadata || null
  };
}

export function childSystemTrace(parent, input = {}) {
  const base = parent || {};
  return createSystemTrace({
    traceId: input.traceId || systemTraceId("op"),
    parentTraceId: base.traceId || input.parentTraceId || null,
    actorType: input.actorType ?? base.actorType ?? null,
    actorId: input.actorId ?? base.actorId ?? null,
    targetType: input.targetType ?? base.targetType ?? null,
    targetId: input.targetId ?? base.targetId ?? null,
    metadata: input.metadata ?? base.metadata ?? null
  });
}

/**
 * Execute one logical operation and emit exactly one terminal System Log event.
 * This is intentionally terminal-only to avoid doubling D1 writes with START/COMPLETE pairs.
 * Nested operations receive childSystemTrace(parent) and therefore remain queryable as one trace tree.
 */
export async function runSystemOperation(db, trace, input = {}, handler) {
  const startedAt = Date.now();
  const context = trace || createSystemTrace();
  try {
    const result = await handler(context);
    await recordSystemEvent(db, {
      ...input,
      traceId: context.traceId,
      parentTraceId: context.parentTraceId,
      actorType: input.actorType ?? context.actorType,
      actorId: input.actorId ?? context.actorId,
      targetType: input.targetType ?? context.targetType,
      targetId: input.targetId ?? context.targetId,
      startedAt: Math.floor(startedAt / 1000),
      completedAt: Math.floor(Date.now() / 1000),
      elapsedMs: Date.now() - startedAt,
      status: input.successStatus || "COMPLETED"
    });
    return result;
  } catch (error) {
    await recordSystemEvent(db, {
      ...input,
      traceId: context.traceId,
      parentTraceId: context.parentTraceId,
      actorType: input.actorType ?? context.actorType,
      actorId: input.actorId ?? context.actorId,
      targetType: input.targetType ?? context.targetType,
      targetId: input.targetId ?? context.targetId,
      startedAt: Math.floor(startedAt / 1000),
      completedAt: Math.floor(Date.now() / 1000),
      elapsedMs: Date.now() - startedAt,
      status: input.failureStatus || "FAILED",
      errorCode: error?.code || input.errorCode || "OPERATION_FAILED",
      message: error?.message || input.message || "Operation failed"
    });
    throw error;
  }
}

export async function getSystemEventLog(db, {
  limit = 200,
  traceId = null,
  since = null,
  until = null,
  pageSize = 500
} = {}) {
  if (!db) return [];
  await ensureSystemLogSchema(db);

  const requestedLimit = limit == null ? null : Math.min(Math.max(Number(limit) || 200, 1), 500);
  const safePageSize = Math.min(Math.max(Number(pageSize) || 500, 1), 500);

  const events = [];
  let cursorCreatedAt = null;
  let cursorEventId = null;

  while (true) {
    if (requestedLimit != null && events.length >= requestedLimit) break;

    const batchLimit = requestedLimit == null
      ? safePageSize
      : Math.min(safePageSize, requestedLimit - events.length);

    let sql = `SELECT event_id,trace_id,parent_trace_id,event_type,service,feature,operation,status,
      actor_type,actor_id,target_type,target_id,http_method,http_path,http_status,started_at,
      completed_at,elapsed_ms,error_code,message,metadata_json,created_at
      FROM system_event_log WHERE 1=1`;
    const binds = [];

    if (traceId) {
      sql = `WITH RECURSIVE trace_tree(trace_id,depth) AS (
        SELECT ?,0
        UNION
        SELECT e.trace_id,trace_tree.depth+1
        FROM system_event_log e
        JOIN trace_tree ON e.parent_trace_id=trace_tree.trace_id
        WHERE trace_tree.depth<16
      ) ` + sql.replace(
        "WHERE 1=1",
        "WHERE (trace_id IN (SELECT trace_id FROM trace_tree) OR parent_trace_id IN (SELECT trace_id FROM trace_tree))"
      );
      binds.push(String(traceId));
    }

    if (since != null) {
      sql += " AND created_at>=?";
      binds.push(Number(since));
    }

    if (until != null) {
      sql += " AND created_at<=?";
      binds.push(Number(until));
    }

    if (cursorCreatedAt != null) {
      sql += " AND (created_at < ? OR (created_at = ? AND event_id < ?))";
      binds.push(cursorCreatedAt, cursorCreatedAt, cursorEventId);
    }

    sql += " ORDER BY created_at DESC, event_id DESC LIMIT ?";
    binds.push(batchLimit);

    const result = await db.prepare(sql).bind(...binds).all();
    const rows = result.results || [];
    if (!rows.length) break;

    for (const row of rows) {
      events.push({
        ...row,
        metadata: row.metadata_json
          ? (() => {
              try { return JSON.parse(row.metadata_json); }
              catch { return null; }
            })()
          : null
      });
    }

    if (rows.length < batchLimit) break;

    const last = rows[rows.length - 1];
    cursorCreatedAt = Number(last.created_at);
    cursorEventId = String(last.event_id);
  }

  return requestedLimit == null ? events : events.slice(0, requestedLimit);
}
