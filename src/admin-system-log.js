import { getSystemEventLog } from "./system-log.js";

export async function handleAdminSystemLogApi(request, env, auth) {
  if (!auth || !["ADMIN", "OWNER"].includes(auth.role) || auth.status !== "ACTIVE") {
    return new Response(JSON.stringify({ ok:false, error:"ADMIN_REQUIRED" }), { status:403, headers:{ "content-type":"application/json; charset=UTF-8", "cache-control":"no-store" } });
  }
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ ok:false, error:"METHOD_NOT_ALLOWED" }), { status:405, headers:{ "content-type":"application/json; charset=UTF-8" } });
  }
  try {
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 200), 1), 500);
    const traceId = url.searchParams.get("trace_id") || null;
    const since = url.searchParams.get("since");
    const until = url.searchParams.get("until");
    const events = await getSystemEventLog(env.DB, {
      limit,
      traceId,
      since: since == null || since === "" ? null : Number(since),
      until: until == null || until === "" ? null : Number(until)
    });
    return new Response(JSON.stringify({ ok:true, count:events.length, events }), {
      headers:{ "content-type":"application/json; charset=UTF-8", "cache-control":"no-store" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok:false, error:"SYSTEM_LOG_UNAVAILABLE", message:String(error?.message || error).slice(0,500) }), {
      status:503, headers:{ "content-type":"application/json; charset=UTF-8", "cache-control":"no-store" }
    });
  }
}

export function renderAdminSystemLogPage() {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EagleEye システムログ</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:1200px;margin:auto;padding:22px 16px 48px}.nav{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.nav a{color:#f59e0b;text-decoration:none;font-weight:800}.muted{color:#94a3b8}.toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}.toolbar input,.toolbar select,.toolbar button{padding:10px;border:1px solid #334155;border-radius:9px;background:#111c30;color:#fff}.toolbar button{cursor:pointer;font-weight:800}.event{border:1px solid #334155;border-radius:12px;background:#111c30;padding:13px;margin:8px 0}.head{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}.type{font-weight:900}.ok{color:#86efac}.bad{color:#fca5a5}.meta{color:#94a3b8;font-size:12px;margin-top:5px}.msg{margin-top:7px;white-space:pre-wrap;word-break:break-word}.json{margin-top:7px;white-space:pre-wrap;overflow:auto;background:#0b1220;border-radius:8px;padding:8px;font-size:11px;color:#cbd5e1}.trace{font-family:ui-monospace,monospace;font-size:11px}</style></head><body><main class="wrap"><nav class="nav"><a href="/admin">← ADMIN CONTROL</a><a href="/status">システム状況</a></nav><h1>システムログ</h1><p class="muted">EagleEye全体の実行イベントを時系列で確認します。APIキー・リクエスト本文などの秘密情報は記録しません。</p><div class="toolbar"><select id="limit"><option>100</option><option selected>200</option><option>500</option></select><input id="trace" placeholder="Trace ID（任意）"><button id="refresh">更新</button><select id="exportRange"><option>15分</option><option>30分</option><option>1時間</option><option>3時間</option><option>12時間</option><option selected>24時間</option></select><button id="export">24時間分を1ファイル取得</button></div><div id="summary" class="muted">読み込み中…</div><section id="events"></section></main><script>
(function(){
  var eventsEl=document.getElementById("events"),summary=document.getElementById("summary");
  function esc(v){return String(v==null?"":v).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
  function render(events){
    summary.textContent=events.length+"件";
    eventsEl.innerHTML=events.map(function(e){
      var status=String(e.status||"");
      var cls=status.indexOf("FAILED")>=0||status==="HTTP_ERROR"?"bad":"ok";
      var meta=[e.created_at?new Date(Number(e.created_at)*1000).toLocaleString("ja-JP"):"",e.service,e.feature,e.operation,e.target_type&&e.target_id?(e.target_type+":"+e.target_id):"",e.http_status?"HTTP "+e.http_status:"",e.elapsed_ms!=null?(e.elapsed_ms+"ms"):""].filter(Boolean).join(" · ");
      var details=e.metadata?JSON.stringify(e.metadata,null,2):"";
      return "<article class='event'><div class='head'><span class='type "+cls+"'>"+esc(e.event_type)+" / "+esc(status)+"</span><span class='trace'>"+esc(e.trace_id)+"</span></div><div class='meta'>"+esc(meta)+"</div>"+(e.error_code?"<div class='meta'>ERROR: "+esc(e.error_code)+"</div>":"")+(e.message?"<div class='msg'>"+esc(e.message)+"</div>":"")+(details?"<details class='json'><summary>metadata</summary>"+esc(details)+"</details>":"")+"</article>";
    }).join("");
  }
  async function load(){
    summary.textContent="読み込み中…";
    var q="?limit="+encodeURIComponent(document.getElementById("limit").value);
    var trace=document.getElementById("trace").value.trim();if(trace)q+="&trace_id="+encodeURIComponent(trace);
    try{
      var r=await fetch("/api/admin/system-log"+q,{credentials:"same-origin",cache:"no-store"});
      var d=await r.json().catch(function(){return{}});
      if(!r.ok||!d.ok)throw new Error(d.error||("HTTP "+r.status));
      render(d.events||[]);
    }catch(e){summary.textContent="読み込み失敗: "+(e.message||String(e));eventsEl.innerHTML="";}
  }
  document.getElementById("refresh").onclick=load;
  document.getElementById("export").onclick=async function(){
    var button=document.getElementById("export");
    var rangeMap={"15分":"15m","30分":"30m","1時間":"1h","3時間":"3h","12時間":"12h","24時間":"24h"};
    var range=rangeMap[document.getElementById("exportRange").value]||"24h";
    button.disabled=true;button.textContent="24時間ログ生成中…";
    try{
      var q="?range="+encodeURIComponent(range);
      var trace=document.getElementById("trace").value.trim();if(trace)q+="&trace_id="+encodeURIComponent(trace);
      var r=await fetch("/api/admin/system-log/export"+q,{credentials:"same-origin",cache:"no-store"});
      var d=await r.json().catch(function(){return{}});
      if(!r.ok||!d.ok)throw new Error(d.message||d.error||("HTTP "+r.status));
      button.textContent="ダウンロード開始…";
      window.location.href=d.export.downloadPath;
    }catch(e){
      alert("ログ書き出しに失敗しました: "+(e.message||String(e)));
    }finally{
      button.disabled=false;button.textContent="24時間分を1ファイル取得";
    }
  };
  load();
})();
</script></body></html>`;
}
