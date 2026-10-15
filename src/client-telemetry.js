import { recordSystemEvent, systemTraceId } from "./system-log.js";

const MAX_BATCH = 20;
const MAX_TEXT = 120;
const ALLOWED_TYPES = new Set(["CLICK", "SUBMIT", "JS_ERROR", "UNHANDLED_REJECTION", "FETCH_COMPLETE"]);

function clean(value, max = MAX_TEXT) {
  return String(value == null ? "" : value).replace(/[\r\n\t]+/g, " ").slice(0, max);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" }
  });
}

export async function handleClientTelemetry(request, env) {
  if (request.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!env?.DB) return json({ ok: false, error: "D1_UNAVAILABLE" }, 503);
  const origin = request.headers.get("Origin");
  if (origin) {
    try {
      if (new URL(origin).host !== new URL(request.url).host) return json({ ok: false, error: "ORIGIN_NOT_ALLOWED" }, 403);
    } catch { return json({ ok: false, error: "ORIGIN_NOT_ALLOWED" }, 403); }
  }
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "INVALID_JSON" }, 400); }
  const incoming = Array.isArray(body?.events) ? body.events.slice(0, MAX_BATCH) : [];
  if (!incoming.length) return json({ ok: false, error: "NO_EVENTS" }, 400);

  const traceId = systemTraceId("browser");
  let accepted = 0;
  for (const item of incoming) {
    const type = clean(item?.type, 40).toUpperCase();
    if (!ALLOWED_TYPES.has(type)) continue;
    const page = clean(item?.page, 300);
    const operation = clean(item?.operation, 120);
    const status = type === "JS_ERROR" || type === "UNHANDLED_REJECTION" ? "FAILED"
      : type === "FETCH_COMPLETE" && Number(item?.httpStatus) >= 400 ? "FAILED" : "INFO";
    await recordSystemEvent(env.DB, {
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
        httpStatus: type === "FETCH_COMPLETE" ? Number(item?.httpStatus) || null : null
      }
    });
    accepted++;
  }
  return json({ ok: true, accepted });
}

export function clientTelemetryScript() {
  return `<script>
(function(){
  if(window.__eeClientTelemetryInstalled)return;
  window.__eeClientTelemetryInstalled=true;
  var queue=[],timer=null;
  function clip(v,n){return String(v==null?"":v).replace(/[\\r\\n\\t]+/g," ").slice(0,n||120)}
  function page(){return location.pathname.slice(0,300)}
  function push(e){queue.push(e);if(queue.length>=10)flush();else if(!timer)timer=setTimeout(flush,1200)}
  function flush(){
    if(timer){clearTimeout(timer);timer=null}
    if(!queue.length)return;
    var events=queue.splice(0,20),payload=JSON.stringify({events:events});
    try{
      if(navigator.sendBeacon){var blob=new Blob([payload],{type:"application/json"});if(navigator.sendBeacon("/api/client-telemetry",blob))return}
    }catch(_){}
    fetch("/api/client-telemetry",{method:"POST",headers:{"content-type":"application/json"},body:payload,keepalive:true,credentials:"same-origin"}).catch(function(){});
  }
  function describe(el){
    if(!el)return {};
    var label=el.getAttribute("aria-label")||el.getAttribute("title")||el.innerText||el.textContent||"";
    return {elementTag:clip(el.tagName,20),elementId:clip(el.id,80),elementRole:clip(el.getAttribute("role"),40),operation:clip(label.replace(/\\s+/g," ").trim(),120)};
  }
  document.addEventListener("click",function(ev){
    var el=ev.target&&ev.target.closest?ev.target.closest("button,a,[role=button],input[type=button],input[type=submit]"):null;
    if(!el)return;
    var d=describe(el);push({type:"CLICK",page:page(),operation:d.operation||"click",elementTag:d.elementTag,elementId:d.elementId,elementRole:d.elementRole,message:"Browser click event"});
  },true);
  document.addEventListener("submit",function(ev){
    var f=ev.target;push({type:"SUBMIT",page:page(),operation:clip(f&&f.id||f&&f.getAttribute("name")||"form submit",120),elementTag:"FORM",elementId:clip(f&&f.id,80),message:"Browser form submit"});
  },true);
  window.addEventListener("error",function(ev){
    push({type:"JS_ERROR",page:page(),operation:"window.error",errorCode:"JAVASCRIPT_ERROR",message:clip((ev.message||"JavaScript error")+" @ "+(ev.filename||""),500)});
  });
  window.addEventListener("unhandledrejection",function(ev){
    var reason=ev.reason;push({type:"UNHANDLED_REJECTION",page:page(),operation:"unhandledrejection",errorCode:"UNHANDLED_REJECTION",message:clip(reason&&reason.message||reason||"Unhandled promise rejection",500)});
  });
  var nativeFetch=window.fetch;
  window.fetch=function(input,init){
    var url;try{url=new URL(typeof input==="string"?input:input.url,location.href)}catch(_){return nativeFetch.apply(this,arguments)}
    if(url.origin!==location.origin||url.pathname==="/api/client-telemetry")return nativeFetch.apply(this,arguments);
    var started=Date.now(),method=String(init&&init.method||(input&&input.method)||"GET").toUpperCase();
    return nativeFetch.apply(this,arguments).then(function(res){
      push({type:"FETCH_COMPLETE",page:page(),operation:method+" "+url.pathname,httpMethod:method,httpPath:url.pathname.slice(0,300),httpStatus:res.status,elapsedMs:Date.now()-started,errorCode:res.ok?"":"HTTP_"+res.status,message:"Same-origin fetch completed"});
      return res;
    },function(err){
      push({type:"FETCH_COMPLETE",page:page(),operation:method+" "+url.pathname,httpMethod:method,httpPath:url.pathname.slice(0,300),httpStatus:0,elapsedMs:Date.now()-started,errorCode:"FETCH_FAILED",message:clip(err&&err.message||"Fetch failed",500)});
      throw err;
    });
  };
  window.addEventListener("pagehide",flush);
})();
</script>`;
}
