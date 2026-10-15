export function renderKingdomWatchlistPageReplacement() {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>王国ウォッチリスト｜EagleEye</title>
<style>
:root{color-scheme:dark;--bg:#0b1220;--panel:#162238;--line:#344154;--text:#f4f7fb;--muted:#aeb9c9;--accent:#73b7ff;--good:#71e0a2;--bad:#ff8585;--warn:#ffce73}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:16px 14px calc(28px + env(safe-area-inset-bottom))}
main{max-width:760px;margin:0 auto}.top{display:flex;justify-content:space-between;align-items:center;gap:12px}.back{color:var(--accent);text-decoration:none}.top h1{font-size:24px;margin:10px 0 4px}.muted{color:var(--muted)}.status{margin:14px 0;padding:12px;border:1px solid var(--line);border-radius:10px;background:#111a2c;overflow-wrap:anywhere}.status.good{color:var(--good)}.status.bad{color:var(--bad)}.status.busy{color:var(--warn)}
.panel,.watch{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px;margin:14px 0}.panel h2{font-size:18px;margin:0 0 12px}.fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}label{display:block;font-weight:700;font-size:14px}input,select,button{font:inherit;min-height:46px;border-radius:10px;width:100%}input,select{margin-top:6px;padding:10px;background:#0f1722;color:var(--text);border:1px solid #506079}button{border:0;padding:10px 12px;font-weight:750;background:var(--accent);color:#091321;cursor:pointer}button:disabled{opacity:.55;cursor:wait}.primary{margin-top:14px}.secondary{background:#344154;color:var(--text)}.danger{background:#783b49;color:#fff}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.actions button{width:auto;flex:1;min-width:95px}.watch h3{margin:0 0 4px;font-size:19px}.watch p{margin:6px 0}.watch .actions{margin-top:14px}.empty{padding:18px;text-align:center;border:1px dashed var(--line);border-radius:12px;color:var(--muted)}.small{font-size:13px}.progress{height:7px;background:#0d1522;border-radius:99px;overflow:hidden;margin:10px 0}.progress span{display:block;height:100%;background:var(--accent);width:0}.debug{font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto;background:#0b111b;padding:10px;border-radius:8px}
@media(max-width:520px){.fields{grid-template-columns:1fr}.top h1{font-size:21px}.panel,.watch{padding:13px}}
</style>
</head>
<body><main>
<div class="top"><div><a class="back" href="/">← EagleEye HOME</a><h1>王国ウォッチリスト</h1><div class="muted small">登録・一覧・更新状態を独立して管理します。</div></div></div>
<div id="status" class="status busy" role="status" aria-live="polite">画面を準備しています…</div>
<section class="panel">
<h2>王国を監視対象に追加</h2>
<form id="create-form" novalidate>
<div class="fields">
<label for="kid">王国番号<input id="kid" name="kid" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="例：1526" required></label>
<label for="top">取得人数<select id="top" name="top"><option value="5">上位5人</option><option value="10">上位10人</option></select></label>
<label for="interval">更新間隔<select id="interval" name="interval"><option value="1">1時間</option><option value="3" selected>3時間</option><option value="6">6時間</option><option value="12">12時間</option></select></label>
</div>
<button id="create" class="primary" type="submit">監視を登録</button>
</form>
</section>
<section class="panel"><h2>登録済みの王国 <span id="count" class="muted"></span></h2><div id="list" aria-live="polite"><div class="empty">一覧を取得しています…</div></div></section>
<section class="panel"><h2>診断情報</h2><p class="muted small">失敗時はこの欄に処理段階・HTTP状態・エラーコードを表示します。入力した王国番号は診断ログへ送信しません。</p><pre id="diagnostics" class="debug">画面初期化中</pre></section>
</main>
<script>
(function(){
"use strict";
var $=function(id){return document.getElementById(id);};
var statusNode=$("status"),listNode=$("list"),diagNode=$("diagnostics"),form=$("create-form"),createButton=$("create");
var busyCreate=false,requestSeq=0,watchTimers={},refreshing={};
function trace(){return "kw-ui-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7);}
function escapeHtml(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function report(stage,kind,message,details){
 var id=trace(); statusNode.className="status "+(kind||"");statusNode.textContent=message;
 var safe={trace_id:id,stage:stage,at:new Date().toISOString(),details:details||null};
 diagNode.textContent=JSON.stringify(safe,null,2);
 try{if(window.__eeTrackAction)window.__eeTrackAction(kind==="bad"?"ACTION_BLOCKED":"ACTION_START","KINGDOM_WATCHLIST_UI",stage);}
 catch(e){}
 try{console[kind==="bad"?"error":"info"]("[KingdomWatchlist]",safe);}
 catch(e){}
}
async function api(url,options,stage){
 var id=trace(),opts=options||{},headers=new Headers(opts.headers||{});
 headers.set("x-eagle-eye-trace-id",id);
 if(opts.body&&!headers.has("content-type"))headers.set("content-type","application/json");
 var response,controller=new AbortController(),timeout=setTimeout(function(){controller.abort();},25000);
 try{
  response=await fetch(url,Object.assign({},opts,{headers:headers,credentials:"same-origin",cache:"no-store",signal:controller.signal}));
  var text=await response.text();
 }catch(e){
  clearTimeout(timeout);
  var timedOut=!!(e&&e.name==="AbortError");
  var network=new Error(timedOut?"通信が25秒以内に完了しませんでした。処理状態を一覧で確認してください。":"通信に失敗しました: "+(e&&e.message||e));
  network.httpStatus=0;network.apiCode=timedOut?"REQUEST_TIMEOUT":"NETWORK_ERROR";network.traceId=id;throw network;
 }
 clearTimeout(timeout);
 var data;
 try{data=JSON.parse(text);}catch(e){data={message:text.slice(0,500)||"応答が空です"};}
 if(!response.ok||data&&data.ok===false){
  var err=new Error(data.message||data.error||("HTTP "+response.status));
  err.httpStatus=response.status;err.apiCode=data.error||data.code||"API_ERROR";err.traceId=id;err.stage=stage;throw err;
 }
 return {data:data,status:response.status,traceId:id};
}
function errorDetails(e,stage){return {stage:stage,http_status:Number(e&&e.httpStatus)||0,error_code:e&&e.apiCode||"CLIENT_ERROR",message:e&&e.message||String(e),trace_id:e&&e.traceId||null};}
function active(w){var s=String(w&&w.job&&w.job.status||"").toUpperCase();return ["QUEUED","RANKINGS","PLAYERS","RUNNING","PENDING","STARTED"].indexOf(s)>=0;}
function renderList(rows){
 $("count").textContent="("+rows.length+"王国)";
 if(!rows.length){listNode.innerHTML='<div class="empty">監視対象はまだありません。</div>';return;}
 listNode.innerHTML=rows.map(function(w){
  var id=String(w.watchlist_id||""),job=w.job||{},phase=String(job.status||"").toUpperCase();
  var retryWait=phase==="FAILED"&&!!job.retryable;
  var isBusy=active(w)||!!refreshing[id];
  var statusText=retryWait?"再試行待ち（自動再開予定："+new Date(Number(job.retry_after_at||0)*1000).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})+"）":
   isBusy?(job.retry_attempt?"再試行中":"取得・更新中"):
   phase==="FAILED"?"失敗："+(job.last_error||w.last_error||"原因不明"):
   phase==="COMPLETED"?"完了："+(job.completed_at?new Date(Number(job.completed_at)*1000).toLocaleString("ja-JP"):""):
   (w.last_error?"前回エラーあり":(w.last_success_at?"最終成功："+new Date(Number(w.last_success_at)*1000).toLocaleString("ja-JP"):"未取得"));
  var shownError=job.last_error||w.last_error;
  var err=shownError?'<p class="small" style="color:var(--bad)">エラー：'+escapeHtml(String(shownError).replace(/^RETRYABLE:[^:]+:\d+:/,""))+'</p>':"";
  var total=Number(job.total_boards||26),progress=phase==="PLAYERS"?total:Number(job.ranking_fetch_progress!=null?job.ranking_fetch_progress:job.board_index||0),pct=total>0?Math.min(100,Math.round(progress/total*100)):0;
  var showProgress=isBusy||retryWait;
  return '<article class="watch" data-id="'+escapeHtml(id)+'"><h3>王国 '+escapeHtml(w.kid)+'</h3><p>上位'+escapeHtml(w.top_n)+'人 ・ '+escapeHtml(w.interval_hours)+'時間ごと ・ '+(w.enabled?'<span style="color:var(--good)">稼働中</span>':'停止中')+'</p><p class="muted small">'+escapeHtml(statusText)+'</p>'+
   (showProgress?'<div class="progress"><span style="width:'+pct+'%"></span></div><p class="muted small">ランキング取得 '+escapeHtml(progress)+(total?' / '+escapeHtml(total)+'件':'')+' ・ 保存行数 '+escapeHtml(job.ranking_rows||0)+'行</p>':"")+err+
   '<div class="actions"><button type="button" data-action="refresh" data-id="'+escapeHtml(id)+'" '+(isBusy?'disabled':'')+'>今すぐ更新</button><button type="button" class="secondary" data-action="toggle" data-id="'+escapeHtml(id)+'" data-enabled="'+(w.enabled?'1':'0')+'" '+(isBusy?'disabled':'')+'>'+(w.enabled?'停止':'再開')+'</button><button type="button" class="danger" data-action="delete" data-id="'+escapeHtml(id)+'" '+(isBusy?'disabled':'')+'>削除</button></div></article>';
 }).join("");
}
async function loadList(options){
 var quiet=!!(options&&options.quiet),seq=++requestSeq;
 if(!quiet)report("LIST_START","busy","登録一覧を取得しています…");
 try{
  var result=await api("/api/kingdom-watchlist",null,"LIST");
  if(seq!==requestSeq)return;
  var rows=Array.isArray(result.data.watchlists)?result.data.watchlists:[];
  renderList(rows);
  if(!quiet)report("LIST_SUCCESS","good","一覧取得成功："+rows.length+"王国",{http_status:result.status,count:rows.length});
  return rows;
 }catch(e){
  if(seq!==requestSeq)return;
  if(!quiet)report("LIST_FAILED","bad","一覧取得に失敗しました。登録フォームは引き続き使用できます。",errorDetails(e,"LIST"));
  listNode.innerHTML='<div class="empty" style="color:var(--bad)">一覧を読み込めませんでした。<button id="retry-list" type="button" class="secondary" style="margin-top:12px">再読み込み</button></div>';
  return null;
 }
}
form.addEventListener("submit",async function(event){
 event.preventDefault();
 if(busyCreate)return;
 var kid=String($("kid").value||"").trim();
 if(!/^\d+$/.test(kid)||Number(kid)<1){report("CREATE_VALIDATION","bad","王国番号は1以上の整数で入力してください。",{field:"kid",reason:"INVALID_KINGDOM_ID"});$("kid").focus();return;}
 busyCreate=true;createButton.disabled=true;createButton.textContent="登録中…";createButton.setAttribute("aria-busy","true");
 report("CREATE_START","busy","登録APIへ送信しています…",{request:"POST /api/kingdom-watchlist?action=create"});
 try{
  var result=await api("/api/kingdom-watchlist?action=create",{method:"POST",body:JSON.stringify({kid:Number(kid),top_n:Number($("top").value),interval_hours:Number($("interval").value)})},"CREATE");
  $("kid").value="";
  report("CREATE_SUCCESS","good","登録API成功（HTTP "+result.status+"）。一覧を更新しています。",{http_status:result.status,watchlist_id:result.data.watchlist_id||null,job_id:result.data.job_id||null,initial_refresh_status:result.data.initial_refresh_status||null});
  await loadList({quiet:true});
  if(result.data.watchlist_id){refreshing[String(result.data.watchlist_id)]=true;await startInitialRefresh(String(result.data.watchlist_id),result.data.job_id||null);}
  else report("CREATE_SUCCESS_NO_ID","good","登録されました。一覧で状態を確認してください。",{http_status:result.status});
 }catch(e){report("CREATE_FAILED","bad","登録失敗（HTTP "+(Number(e.httpStatus)||0)+"）："+(e.message||"原因不明"),errorDetails(e,"CREATE"));}
 finally{busyCreate=false;createButton.disabled=false;createButton.textContent="監視を登録";createButton.removeAttribute("aria-busy");}
});
async function startInitialRefresh(id,expectedJobId){
 try{
  report("INITIAL_REFRESH_START","busy","初回データ取得を開始しています…",{watchlist_id:id});
  var accepted=await api("/api/kingdom-watchlist?action=refresh",{method:"POST",body:JSON.stringify({watchlist_id:id})},"INITIAL_REFRESH");
  report("INITIAL_REFRESH_ACCEPTED","busy","初回取得ジョブを受け付けました。進捗を確認しています。",{watchlist_id:id,job_id:accepted.data.job_id||expectedJobId||null});
  await pollJob(id,accepted.data.job_id||expectedJobId||null);
 }catch(e){
  if(e&&e.apiCode==="WATCHLIST_REFRESH_IN_PROGRESS"){report("INITIAL_REFRESH_ALREADY_RUNNING","busy","取得処理はすでに実行中です。既存ジョブの進捗を確認します。",{watchlist_id:id});await pollJob(id);return;}
  refreshing[id]=false;report("INITIAL_REFRESH_FAILED","bad","登録は成功しましたが、初回取得の開始に失敗しました。",errorDetails(e,"INITIAL_REFRESH"));
  await loadList({quiet:true});
 }
}
async function pollJob(id,expectedJobId){
 var started=Date.now(),lastUpdatedAt=0,lastProgress="";
 while(Date.now()-started<180000){
  await new Promise(function(resolve){setTimeout(resolve,4000);});
  var rows=await loadList({quiet:true});
  if(!rows)continue;
  var w=rows.find(function(x){return String(x.watchlist_id)===String(id);});
  if(!w){refreshing[id]=false;report("WATCHLIST_MISSING","bad","登録は成功しましたが一覧から対象を確認できません。",{watchlist_id:id});return;}
  var job=w.job||{},state=String(job.status||"").toUpperCase();
  var progress=state==="RANKINGS"?String(job.ranking_fetch_progress||job.board_index||0)+"/"+String(job.total_boards||26):state==="PLAYERS"?String(job.player_cursor||0)+"/"+String(job.player_count||0):state;
  var updatedAt=Number(job.updated_at||0);
  if(updatedAt&&updatedAt===lastUpdatedAt&&progress===lastProgress&&Date.now()-started>30000){
   report("JOB_STALLED","bad","取得ジョブの進捗が30秒以上変化していません。自動継続を再試行します。",{watchlist_id:id,status:state,progress:progress,job_updated_at:updatedAt});
  }
  lastUpdatedAt=updatedAt;lastProgress=progress;
  if(state==="COMPLETED"&&(!expectedJobId||String(job.job_id)===String(expectedJobId))){refreshing[id]=false;report("INITIAL_REFRESH_COMPLETE","good","今回の取得ジョブが完了しました。",{watchlist_id:id,job_id:job.job_id,status:state,ranking_rows:job.ranking_rows||0,player_rows:job.player_rows||0});await loadList({quiet:true});return;}
  if(["FAILED","CANCELLED","CANCELED"].indexOf(state)>=0){
   if(state==="FAILED"&&job.retryable){report("RETRY_WAIT","busy","取得に失敗しました。自動再試行を待っています。",{watchlist_id:id,job_id:job.job_id,retry_attempt:job.retry_attempt||0,retry_after_at:job.retry_after_at||null,last_error:job.last_error||w.last_error||null});}
   else{refreshing[id]=false;report("INITIAL_REFRESH_JOB_FAILED","bad","監視対象は登録済みですが、取得ジョブが失敗しました。",{watchlist_id:id,status:state,last_error:w.last_error||job.last_error||null});}
   return;
  }
  if(["RANKINGS","PLAYERS","RUNNING","QUEUED","PENDING","STARTED"].indexOf(state)>=0){
   try{
    var continuation=await api("/api/kingdom-watchlist?action=refresh",{method:"POST",body:JSON.stringify({watchlist_id:id})},"CONTINUE_REFRESH");
    report("CONTINUATION_ACCEPTED","busy","次の取得バッチを実行しました。",{watchlist_id:id,status:continuation.data.status||state,result:continuation.data.result||null});
   }catch(e){
    if(e&&e.apiCode==="WATCHLIST_REFRESH_IN_PROGRESS"){
     report("CONTINUATION_BUSY","busy","別の処理が取得中です。次の確認時に再試行します。",{watchlist_id:id});
    }else if(e&&e.apiCode==="WATCHLIST_NOT_FOUND"){
     // The job may have completed between the list read and continuation request.
     await loadList({quiet:true});
    }else{
     report("CONTINUATION_FAILED","bad","次の取得バッチを起動できませんでした。",errorDetails(e,"CONTINUE_REFRESH"));
     await loadList({quiet:true});
    }
   }
  }
 }
 refreshing[id]=false;report("INITIAL_REFRESH_TIMEOUT","bad","取得ジョブが3分以内に完了しませんでした。進捗と診断情報を確認してください。",{watchlist_id:id,timeout_ms:180000});await loadList({quiet:true});
}
listNode.addEventListener("click",async function(event){
 var retry=event.target.closest("#retry-list");if(retry){await loadList();return;}
 var btn=event.target.closest("button[data-action]");if(!btn)return;
 var id=btn.getAttribute("data-id"),action=btn.getAttribute("data-action");if(!id)return;
 btn.disabled=true;
 try{
  if(action==="refresh"){
   refreshing[id]=true;report("MANUAL_REFRESH_START","busy","手動更新を開始しています…",{watchlist_id:id});
   var accepted=await api("/api/kingdom-watchlist?action=refresh",{method:"POST",body:JSON.stringify({watchlist_id:id})},"MANUAL_REFRESH");
   report("MANUAL_REFRESH_ACCEPTED","good","更新を受け付けました。進捗を確認しています。",{watchlist_id:id,job_id:accepted.data.job_id||null});await loadList({quiet:true});await pollJob(id,accepted.data.job_id||null);
  }else if(action==="toggle"){
   var enabled=btn.getAttribute("data-enabled")==="1";
   await api("/api/kingdom-watchlist?action=toggle",{method:"POST",body:JSON.stringify({watchlist_id:id,enabled:!enabled})},"TOGGLE");
   report("TOGGLE_SUCCESS","good",enabled?"監視を停止しました。":"監視を再開しました。",{watchlist_id:id,enabled:!enabled});await loadList({quiet:true});
  }else if(action==="delete"){
   if(!confirm("この監視対象を削除しますか？"))return;
   await api("/api/kingdom-watchlist?watchlist_id="+encodeURIComponent(id),{method:"DELETE"},"DELETE");
   report("DELETE_SUCCESS","good","監視対象を削除しました。",{watchlist_id:id});await loadList({quiet:true});
  }
 }catch(e){refreshing[id]=false;report(action.toUpperCase()+"_FAILED","bad","操作に失敗しました（HTTP "+(Number(e.httpStatus)||0)+"）："+(e.message||"原因不明"),errorDetails(e,action.toUpperCase()));await loadList({quiet:true});}
 finally{btn.disabled=false;}
});
window.addEventListener("online",function(){report("NETWORK_ONLINE","good","ネットワークが復旧しました。一覧を再取得します。");loadList({quiet:true});});
loadList().catch(function(e){report("INIT_FAILED","bad","初期化に失敗しました。",errorDetails(e,"INIT"));});
})();
</script>
</body></html>`;
}
