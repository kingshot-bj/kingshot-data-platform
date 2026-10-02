const SYSTEM_LOG_MAX_MESSAGE = 2000;
const SYSTEM_LOG_MAX_METADATA_BYTES = 12000;

export function systemTraceId(prefix = "ee") { return prefix + "-" + crypto.randomUUID(); }
function safeJson(value) {
  if (value == null) return null;
  try { const text = JSON.stringify(value); if (text.length <= SYSTEM_LOG_MAX_METADATA_BYTES) return text; return JSON.stringify({ truncated:true, preview:text.slice(0,SYSTEM_LOG_MAX_METADATA_BYTES) }); }
  catch { return JSON.stringify({ serialization_error:true }); }
}
function clean(value, max = SYSTEM_LOG_MAX_MESSAGE) { return value == null ? null : String(value).slice(0,max); }

export async function recordSystemEvent(db, input = {}) {
  if (!db) return null;
  const now = Math.floor(Date.now()/1000);
  const startedAt = Number(input.startedAt || now);
  const completedAt = input.completedAt == null ? now : Number(input.completedAt);
  const event = { eventId:input.eventId||crypto.randomUUID(), traceId:input.traceId||systemTraceId(), parentTraceId:input.parentTraceId||null,
    eventType:clean(input.eventType||"EVENT",80), service:clean(input.service||"system",120), feature:clean(input.feature,160), operation:clean(input.operation,160),
    status:clean(input.status||"INFO",40), actorType:clean(input.actorType,80), actorId:clean(input.actorId,160), targetType:clean(input.targetType,80), targetId:clean(input.targetId,200),
    httpMethod:clean(input.httpMethod,16), httpPath:clean(input.httpPath,300), httpStatus:input.httpStatus==null?null:Number(input.httpStatus), startedAt, completedAt,
    elapsedMs:input.elapsedMs==null?Math.max(0,(completedAt-startedAt)*1000):Number(input.elapsedMs), errorCode:clean(input.errorCode,160), message:clean(input.message), metadataJson:safeJson(input.metadata), createdAt:now };
  try {
    await db.prepare("INSERT INTO system_event_log (event_id,trace_id,parent_trace_id,event_type,service,feature,operation,status,actor_type,actor_id,target_type,target_id,http_method,http_path,http_status,started_at,completed_at,elapsed_ms,error_code,message,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(
      event.eventId,event.traceId,event.parentTraceId,event.eventType,event.service,event.feature,event.operation,event.status,event.actorType,event.actorId,event.targetType,event.targetId,event.httpMethod,event.httpPath,event.httpStatus,event.startedAt,event.completedAt,event.elapsedMs,event.errorCode,event.message,event.metadataJson,event.createdAt).run();
    return event;
  } catch(error) { console.error("system_event_log_write_failed",error?.message||error); return null; }
}

export async function getSystemEventLog(db,{limit=200,traceId=null,since=null}={}) {
  if (!db) return []; const safeLimit=Math.min(Math.max(Number(limit)||200,1),500);
  let sql="SELECT event_id,trace_id,parent_trace_id,event_type,service,feature,operation,status,actor_type,actor_id,target_type,target_id,http_method,http_path,http_status,started_at,completed_at,elapsed_ms,error_code,message,metadata_json,created_at FROM system_event_log WHERE 1=1"; const binds=[];
  if(traceId){sql+=" AND (trace_id=? OR parent_trace_id=?)";binds.push(String(traceId),String(traceId));}
  if(since!=null){sql+=" AND created_at>=?";binds.push(Number(since));} sql+=" ORDER BY created_at DESC LIMIT ?";binds.push(safeLimit);
  const result=await db.prepare(sql).bind(...binds).all();
  return (result.results||[]).map(row=>({...row,metadata:row.metadata_json?(()=>{try{return JSON.parse(row.metadata_json);}catch{return null;}})():null}));
}
