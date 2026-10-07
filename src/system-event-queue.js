function normalizeSystemEvent(value) {
  if (!value || typeof value !== "object") throw new Error("SYSTEM_EVENT_INVALID_MESSAGE");
  if (!value.eventId || !value.traceId || !value.eventType || !value.service || !value.status || !value.startedAt || !value.createdAt) {
    throw new Error("SYSTEM_EVENT_INVALID_MESSAGE");
  }
  return value;
}

function buildSystemEventStatement(db, event) {
  return db.prepare(
    "INSERT OR IGNORE INTO system_event_log (event_id,trace_id,parent_trace_id,event_type,service,feature,operation,status,actor_type,actor_id,target_type,target_id,http_method,http_path,http_status,started_at,completed_at,elapsed_ms,error_code,message,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(
    event.eventId,
    event.traceId,
    event.parentTraceId ?? null,
    event.eventType,
    event.service,
    event.feature ?? null,
    event.operation ?? null,
    event.status,
    event.actorType ?? null,
    event.actorId ?? null,
    event.targetType ?? null,
    event.targetId ?? null,
    event.httpMethod ?? null,
    event.httpPath ?? null,
    event.httpStatus ?? null,
    event.startedAt,
    event.completedAt ?? null,
    event.elapsedMs ?? null,
    event.errorCode ?? null,
    event.message ?? null,
    event.metadataJson ?? null,
    event.createdAt
  );
}

export async function handleSystemEventQueue(batch, env) {
  const messages = Array.isArray(batch?.messages) ? batch.messages : [];
  if (!messages.length) return { processed: 0, ignored: 0 };

  const events = [];
  for (const message of messages) {
    try {
      events.push(normalizeSystemEvent(message.body));
    } catch (error) {
      console.error("system_event_invalid_queue_message", error?.message || error);
      message.ack();
    }
  }

  if (!events.length) return { processed: 0, ignored: messages.length };

  try {
    const statements = events.map(event => buildSystemEventStatement(env.DB, event));
    await env.DB.batch(statements);
    for (const message of messages) {
      try {
        const event = normalizeSystemEvent(message.body);
        if (events.some(item => String(item.eventId) === String(event.eventId))) message.ack();
      } catch {}
    }
    return { processed: events.length, ignored: messages.length - events.length };
  } catch (error) {
    console.error("system_event_queue_d1_batch_failed", error?.message || error);
    for (const message of messages) {
      try {
        normalizeSystemEvent(message.body);
        message.retry();
      } catch {}
    }
    throw error;
  }
}
