import { recordSystemEvent, systemTraceId } from "./system-log.js";

const MAX_BATCH = 20;
const MAX_TEXT = 120;
const ALLOWED_TYPES = new Set(["CLICK", "SUBMIT", "JS_ERROR", "UNHANDLED_REJECTION", "FETCH_START", "FETCH_COMPLETE", "ACTION_START", "ACTION_BLOCKED", "APP_DIAGNOSTIC"]);
const SAFE_DIAGNOSTIC_KEYS = new Set(["trace_id","stage","at","details","watchlist_id","job_id","expected_job_id","status","progress","ranking_rows","player_rows","http_status","error_code","elapsed_ms","retry_attempt","retry_after_at","last_error","count","message"]);

function clean(value, max = MAX_TEXT) {
  return String(value == null ? "" : value)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/(authorization\s*[:=]\s*bearer\s+)\S+/gi, "$1[REDACTED]")
    .replace(/((?:api[_-]?key|token|secret|password)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .slice(0, max);
}

function sanitizeDiagnostic(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (!SAFE_DIAGNOSTIC_KEYS.has(key)) continue;
    if (key === "details" && item && typeof item === "object" && !Array.isArray(item)) {
      const details = {};
      for (const [detailKey, detailValue] of Object.entries(item)) {
        if (!SAFE_DIAGNOSTIC_KEYS.has(detailKey) || /key|token|secret|password|authorization|api/i.test(detailKey)) continue;
        if (["string","number","boolean"].includes(typeof detailValue) || detailValue === null) details[detailKey] = typeof detailValue === "string" ? clean(detailValue, 300) : detailValue;
      }
      out.details = details;
    } else if (["string","number","boolean"].includes(typeof item) || item === null) out[key] = typeof item === "string" ? clean(item, 300) : item;
  }
  return out;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" }
  });
}

export function isSameOriginRequest(request) {
  const host = new URL(request.url).host;
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) return false;
  for (const header of ["Origin", "Referer"]) {
    const value = request.headers.get(header);
    if (!value) continue;
    try { return new URL(value).host === host; } catch { return false; }
  }
  return false;
}

export async function handleClientTelemetry(request, env) {
  if (request.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!env?.DB) return json({ ok: false, error: "D1_UNAVAILABLE" }, 503);
  // Browsers send Origin on same-origin POST (fetch and sendBeacon). Requests
  // without a same-origin Origin/Referer are not from EagleEye pages and are
  // rejected so anonymous scripts cannot inflate D1 writes.
  if (!isSameOriginRequest(request)) return json({ ok: false, error: "ORIGIN_NOT_ALLOWED" }, 403);
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 64 * 1024) return json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, 413);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "INVALID_JSON" }, 400); }
  const incoming = Array.isArray(body?.events) ? body.events.slice(0, MAX_BATCH) : [];
  if (!incoming.length) return json({ ok: false, error: "NO_EVENTS" }, 400);

  const traceId = systemTraceId("browser");
  let accepted = 0;
  let failed = 0;
  for (const item of incoming) {
    const type = clean(item?.type, 40).toUpperCase();
    if (!ALLOWED_TYPES.has(type)) continue;
    const page = clean(item?.page, 300);
    const operation = clean(item?.operation, 120);
    const status = type === "JS_ERROR" || type === "UNHANDLED_REJECTION" ? "FAILED"
      : type === "FETCH_COMPLETE" && Number(item?.httpStatus) >= 400 ? "FAILED" : "INFO";
    const saved = await recordSystemEvent(env.DB, {
      eventId: clean(item?.eventId, 100) || undefined,
      traceId: clean(item?.traceId, 100) || traceId,
      parentTraceId: clean(item?.parentTraceId, 100) || null,
      eventType: type,
      service: "browser",
      feature: "client_telemetry",
      operation,
      status,
      httpMethod: type === "FETCH_COMPLETE" ? clean(item?.httpMethod, 12) : null,
      httpPath: type === "FETCH_COMPLETE" ? clean(item?.httpPath, 300) : page,
      httpStatus: type === "FETCH_COMPLETE" && Number.isFinite(Number(item?.httpStatus)) ? Number(item.httpStatus) : null,
      elapsedMs: Number.isFinite(Number(item?.elapsedMs)) ? Math.max(0, Math.min(600000, Number(item.elapsedMs))) : 0,
      errorCode: status === "FAILED" ? clean(item?.errorCode || (type === "FETCH_COMPLETE" ? "HTTP_ERROR" : type), 120) : null,
      message: clean(item?.message || operation, 500),
      metadata: {
        page,
        elementTag: clean(item?.elementTag, 20),
        elementId: clean(item?.elementId, 80),
        elementRole: clean(item?.elementRole, 40),
        inputState: clean(item?.inputState, 40),
        httpStatus: type === "FETCH_COMPLETE" ? Number(item?.httpStatus) || null : null,
        ...(type === "APP_DIAGNOSTIC" ? { diagnostic: sanitizeDiagnostic(item?.diagnostic) } : {})
      }
    });
    if (saved) accepted++;
    else failed++;
  }
  return json({ ok: failed === 0, accepted, failed }, failed ? 503 : 200);
}

export function clientTelemetryScript() {
  return `<script>
(function(){
  if(window.__eeClientTelemetryInstalled)return;
  window.__eeClientTelemetryInstalled=true;
  var queue=[],timer=null,activeInteractionTraceId="",activeInteractionAt=0;
  function clip(v,n){return String(v==null?"":v).replace(/[\\r\\n\\t]+/g," ").slice(0,n||120)}
  function page(){return location.pathname.slice(0,300)}
  function traceId(){return "browser-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,12)}
  function interactionTrace(){return activeInteractionTraceId&&Date.now()-activeInteractionAt<10000?activeInteractionTraceId:""}
  function push(e){if(!e.eventId)e.eventId=traceId()+"-"+Math.random().toString(36).slice(2,10);queue.push(e);if(queue.length>=10)flush();else if(!timer)timer=setTimeout(flush,1200)}
  window.__eeTrackAction=function(type,operation,inputState){if(type!=="ACTION_START"&&type!=="ACTION_BLOCKED")return;push({type:type,traceId:interactionTrace()||traceId(),page:page(),operation:clip(operation,120),inputState:clip(inputState,40),message:type==="ACTION_BLOCKED"?"Browser action blocked by validation":"Browser action handler started"});};
  window.__eeTrackDiagnostic=function(stage,kind,diagnostic){
    var safe=diagnostic&&typeof diagnostic==="object"?diagnostic:{};
    push({type:"APP_DIAGNOSTIC",traceId:clip(safe.trace_id||traceId(),100),page:page(),operation:clip(stage,120),message:clip(kind==="bad"?"Watchlist diagnostic failure":kind==="busy"?"Watchlist diagnostic progress":"Watchlist diagnostic event",200),diagnostic:safe});
  };
  function flush(){
    if(timer){clearTimeout(timer);timer=null}
    if(!queue.length)return;
    var events=queue.splice(0,20),payload=JSON.stringify({events:events});
    fetch("/api/client-telemetry",{method:"POST",headers:{"content-type":"application/json"},body:payload,keepalive:true,credentials:"same-origin"})
      .then(function(res){if(!res.ok)throw new Error("TELEMETRY_HTTP_"+res.status);return res.json()})
      .then(function(data){if(!data||data.ok!==true)throw new Error("TELEMETRY_NOT_SAVED")})
      .catch(function(){
        queue=events.concat(queue).slice(-100);
        if(!timer)timer=setTimeout(flush,1500);
      });
  }
  function describe(el){
    if(!el)return {};
    var label=el.getAttribute("aria-label")||el.getAttribute("title")||el.innerText||el.textContent||"";
    return {elementTag:clip(el.tagName,20),elementId:clip(el.id,80),elementRole:clip(el.getAttribute("role"),40),operation:clip(label.replace(/\\s+/g," ").trim(),120)};
  }
  document.addEventListener("click",function(ev){
    var el=ev.target&&ev.target.closest?ev.target.closest("button,a,[role=button],input[type=button],input[type=submit]"):null;
    if(!el)return;
    var d=describe(el);
    if(el.id==="create"){
      var kidInput=document.getElementById("kid");
      d.inputState=kidInput?(String(kidInput.value||"").trim()?"KINGDOM_ID_PRESENT":"KINGDOM_ID_EMPTY"):"KINGDOM_INPUT_MISSING";
    }
    activeInteractionTraceId=traceId();activeInteractionAt=Date.now();push({type:"CLICK",traceId:activeInteractionTraceId,page:page(),operation:d.operation||"click",elementTag:d.elementTag,elementId:d.elementId,elementRole:d.elementRole,inputState:d.inputState||"",message:"Browser click event"});
  },true);
  document.addEventListener("submit",function(ev){
    var f=ev.target;var t=interactionTrace()||traceId();push({type:"SUBMIT",traceId:t,page:page(),operation:clip(f&&f.id||f&&f.getAttribute("name")||"form submit",120),elementTag:"FORM",elementId:clip(f&&f.id,80),message:"Browser form submit"});
  },true);
  window.addEventListener("error",function(ev){
    push({type:"JS_ERROR",traceId:interactionTrace()||traceId(),page:page(),operation:"window.error",errorCode:"JAVASCRIPT_ERROR",message:clip((ev.message||"JavaScript error")+" @ "+(ev.filename||""),500)});
  });
  window.addEventListener("unhandledrejection",function(ev){
    var reason=ev.reason;push({type:"UNHANDLED_REJECTION",traceId:interactionTrace()||traceId(),page:page(),operation:"unhandledrejection",errorCode:"UNHANDLED_REJECTION",message:clip(reason&&reason.message||reason||"Unhandled promise rejection",500)});
  });
  var nativeFetch=window.fetch;
  window.fetch=function(input,init){
    var url;try{url=new URL(typeof input==="string"?input:input.url,location.href)}catch(_){return nativeFetch.apply(this,arguments)}
    if(url.origin!==location.origin||url.pathname==="/api/client-telemetry")return nativeFetch.apply(this,arguments);
    var started=Date.now(),method=String(init&&init.method||(input&&input.method)||"GET").toUpperCase(),trace=interactionTrace()||traceId();
    push({type:"FETCH_START",traceId:trace,page:page(),operation:method+" "+url.pathname,httpMethod:method,httpPath:url.pathname.slice(0,300),message:"Same-origin fetch started"});
    return nativeFetch.apply(this,arguments).then(function(res){
      push({type:"FETCH_COMPLETE",traceId:trace,page:page(),operation:method+" "+url.pathname,httpMethod:method,httpPath:url.pathname.slice(0,300),httpStatus:res.status,elapsedMs:Date.now()-started,errorCode:res.ok?"":"HTTP_"+res.status,message:"Same-origin fetch completed"});
      return res;
    },function(err){
      push({type:"FETCH_COMPLETE",traceId:trace,page:page(),operation:method+" "+url.pathname,httpMethod:method,httpPath:url.pathname.slice(0,300),httpStatus:0,elapsedMs:Date.now()-started,errorCode:"FETCH_FAILED",message:clip(err&&err.message||"Fetch failed",500)});
      throw err;
    });
  };
  window.addEventListener("pagehide",flush);
})();
</script>`;
}
