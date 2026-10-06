export function renderKingdomCatalogR2BackfillPage() {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EagleEye R2バックフィル</title>
<style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:760px;margin:auto;padding:20px 14px 48px}.nav{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}.nav a{color:#f59e0b;text-decoration:none;font-weight:800}.card{margin-top:14px;padding:16px;border:1px solid #334155;border-radius:14px;background:#162238}.muted{color:#94a3b8;font-size:13px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.stat{padding:11px;border-radius:10px;background:#0b1220;border:1px solid #334155}.stat span{display:block;color:#94a3b8;font-size:11px}.stat b{display:block;margin-top:4px;overflow-wrap:anywhere}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.actions button{min-height:44px;padding:10px 15px;border:0;border-radius:9px;background:#f59e0b;color:#111827;font-weight:900;cursor:pointer}.actions button.secondary{background:#334155;color:#f8fafc}.actions button:disabled{opacity:.55;cursor:default}.ok{color:#86efac}.bad{color:#fca5a5}.warn{color:#fbbf24}.result{margin-top:12px;padding:11px;border-radius:10px;background:#0b1220;border:1px solid #334155;white-space:pre-wrap;word-break:break-word;font-size:12px}.notice{margin-top:12px;padding:11px;border-radius:10px;background:#1e293b;color:#cbd5e1;font-size:12px;line-height:1.6}@media(max-width:560px){.grid{grid-template-columns:1fr}.actions button{width:100%}}</style></head>
<body><main class="wrap"><nav class="nav"><a href="/owner">← OWNER CONTROL</a><a href="/status">システム状況</a></nav>
<h1>王国Catalog → R2バックフィル</h1>
<p class="muted">既存の詳細JSONをR2へ退避し、成功後にD1の詳細JSONだけをNULL化します。1回の実行は最大10件です。</p>
<section class="card"><h2>現在の状態</h2><div id="summary" class="muted">読み込み中…</div><div class="grid" id="stats"></div><div class="actions"><button id="run">10件バックフィル実行</button><button id="refresh" class="secondary">状態を更新</button></div><div id="result" class="result" hidden></div></section>
<section class="card"><h2>安全条件</h2><div class="notice">R2保存が成功した行だけD1の <b>raw_json / boards_json</b> をNULL化します。失敗した場合はD1の詳細JSONを残します。自動連続実行は行わず、1回ずつ実行します。</div></section>
</main><script>
(function(){
var summary=document.getElementById("summary"),stats=document.getElementById("stats"),result=document.getElementById("result"),run=document.getElementById("run"),refresh=document.getElementById("refresh");
function esc(v){return String(v==null?"":v).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
function fmt(v){return v==null||v===""?"—":String(v);}
function show(d){
  var state=String(d.state||"UNKNOWN");
  summary.innerHTML="<b class='"+(state==="FAILED"?"bad":state==="COMPLETE"?"ok":"")+"'>"+esc(state)+"</b>";
  var rows=[
    ["Last KID",d.lastKid],["Batches",d.batchesRun],["Archived rows",d.rowsArchived],
    ["Last batch",d.lastBatchCount],["Last batch at",d.lastBatchAt?new Date(Number(d.lastBatchAt)*1000).toLocaleString("ja-JP"):"—"],
    ["Last success",d.lastSuccessAt?new Date(Number(d.lastSuccessAt)*1000).toLocaleString("ja-JP"):"—"],
    ["Last error",d.lastError||"—"],["Updated",d.updatedAt?new Date(Number(d.updatedAt)*1000).toLocaleString("ja-JP"):"—"]
  ];
  stats.innerHTML=rows.map(function(x){return "<div class='stat'><span>"+esc(x[0])+"</span><b>"+esc(fmt(x[1]))+"</b></div>";}).join("");
}
async function load(){
  refresh.disabled=true;
  try{
    var r=await fetch("/api/admin/kingdom-catalog-r2-backfill",{credentials:"same-origin",cache:"no-store"});
    var d=await r.json().catch(function(){return{}});
    if(!r.ok||!d.ok) throw new Error(d.error||("HTTP "+r.status));
    show(d);
  }catch(e){summary.innerHTML="<span class='bad'>読み込み失敗: "+esc(e.message||e)+"</span>";}
  finally{refresh.disabled=false;}
}
async function execute(){
  if(!confirm("R2バックフィルを最大10件実行します。開始しますか？")) return;
  run.disabled=true;refresh.disabled=true;result.hidden=false;result.textContent="実行中…";
  try{
    var r=await fetch("/api/admin/kingdom-catalog-r2-backfill",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({batch_size:10}),credentials:"same-origin",cache:"no-store"});
    var d=await r.json().catch(function(){return{}});
    if(!r.ok||!d.ok) throw new Error(d.error||d.message||("HTTP "+r.status));
    result.textContent=JSON.stringify(d,null,2);
    await load();
  }catch(e){result.textContent="実行失敗: "+(e.message||e);}
  finally{run.disabled=false;refresh.disabled=false;}
}
run.onclick=execute;refresh.onclick=load;load();
})();
</script></body></html>`;
}
