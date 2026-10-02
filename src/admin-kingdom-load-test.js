import { getApiPoolAvailability } from "./api-pool.js";
import { recordServiceUsage } from "./service-usage.js";
import { recordSystemEvent, systemTraceId } from "./system-log.js";

const MAX_KINGDOMS = 1000;
const MAX_CONCURRENCY = 50;
const DEFAULT_CONCURRENCY = 1;
const LOAD_TEST_LOCK_KEY = "OWNER_KINGDOM_LOAD_TEST";
const LOAD_TEST_LOCK_TTL_SECONDS = 60 * 60 * 2;

async function ensureLoadTestStateSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS api_request_locks (
      lock_key TEXT PRIMARY KEY,
      lock_token TEXT NOT NULL,
      lock_until INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `).run();
}

async function acquireLoadTestState(db, runId) {
  await ensureLoadTestStateSchema(db);
  const now = Math.floor(Date.now() / 1000);
  const lockUntil = now + LOAD_TEST_LOCK_TTL_SECONDS;
  const result = await db.prepare(`
    INSERT INTO api_request_locks (lock_key, lock_token, lock_until, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(lock_key) DO UPDATE SET
      lock_token = excluded.lock_token,
      lock_until = excluded.lock_until,
      updated_at = excluded.updated_at
    WHERE api_request_locks.lock_until <= ?
  `).bind(LOAD_TEST_LOCK_KEY, runId, lockUntil, now, now).run();
  return result?.meta?.changes === 1;
}

async function releaseLoadTestState(db, runId) {
  if (!db || !runId) return;
  await db.prepare(
    "DELETE FROM api_request_locks WHERE lock_key = ? AND lock_token = ?"
  ).bind(LOAD_TEST_LOCK_KEY, runId).run();
}

async function isLoadTestCancelled(db, runId) {
  if (!db || !runId) return false;
  const row = await db.prepare(
    "SELECT lock_token FROM api_request_locks WHERE lock_key = ? AND lock_token = ? AND lock_until > ? LIMIT 1"
  ).bind("LOAD_TEST_CANCEL", "CANCEL:" + runId, Math.floor(Date.now() / 1000)).first();
  return Boolean(row);
}

async function clearLoadTestCancellation(db, runId) {
  if (!db || !runId) return;
  await db.prepare(
    "DELETE FROM api_request_locks WHERE lock_key = ? AND lock_token = ?"
  ).bind("LOAD_TEST_CANCEL", "CANCEL:" + runId).run().catch(() => {});
}

export async function handleOwnerKingdomLoadTestCancelApi(request, env, auth) {
  if (!auth || auth.role !== "OWNER" || auth.status !== "ACTIVE") return new Response(JSON.stringify({ok:false,error:"OWNER_REQUIRED"}), {status:403,headers:{"content-type":"application/json"}});
  if (request.method !== "POST") return new Response(JSON.stringify({ok:false,error:"METHOD_NOT_ALLOWED"}), {status:405,headers:{"content-type":"application/json"}});
  try {
    const now = Math.floor(Date.now() / 1000);
    const row = await env.DB.prepare(
      "SELECT lock_token, lock_until FROM api_request_locks WHERE lock_key = ? AND lock_until > ? LIMIT 1"
    ).bind(LOAD_TEST_LOCK_KEY, now).first();
    if (!row?.lock_token) return new Response(JSON.stringify({ok:false,error:"LOAD_TEST_NOT_RUNNING"}), {status:409,headers:{"content-type":"application/json"}});
    const runId = String(row.lock_token);
    await env.DB.prepare(
      "INSERT INTO api_request_locks (lock_key, lock_token, lock_until, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(lock_key) DO UPDATE SET lock_token = excluded.lock_token, lock_until = excluded.lock_until, updated_at = excluded.updated_at"
    ).bind("LOAD_TEST_CANCEL", "CANCEL:" + runId, now + 60 * 60 * 2, now).run();
    return new Response(JSON.stringify({ok:true,run_id:runId,status:"CANCEL_REQUESTED"}), {headers:{"content-type":"application/json","cache-control":"no-store"}});
  } catch (error) {
    return new Response(JSON.stringify({ok:false,error:"LOAD_TEST_CANCEL_FAILED",message:error?.message||String(error)}), {status:500,headers:{"content-type":"application/json"}});
  }
}

export async function handleOwnerKingdomLoadTestStatusApi(request, env) {
  if (request.method !== "GET") return new Response(JSON.stringify({ ok:false, error:"METHOD_NOT_ALLOWED" }), { status:405, headers:{"content-type":"application/json; charset=UTF-8","cache-control":"public, max-age=5"} });
  try {
    const now = Math.floor(Date.now() / 1000);
    const row = await env.DB.prepare(
      "SELECT lock_token, lock_until, updated_at FROM api_request_locks WHERE lock_key = ? AND lock_until > ? LIMIT 1"
    ).bind(LOAD_TEST_LOCK_KEY, now).first();
    return new Response(JSON.stringify({
      ok: true,
      active: Boolean(row),
      started_at: row?.updated_at || null,
      expires_at: row?.lock_until || null
    }), { headers:{"content-type":"application/json; charset=UTF-8","cache-control":"public, max-age=5"} });
  } catch (error) {
    console.error("owner_kingdom_load_test_status_failed", error?.message || error);
    return new Response(JSON.stringify({ ok:false, active:false, error:"LOAD_TEST_STATUS_UNAVAILABLE" }), { status:503, headers:{"content-type":"application/json; charset=UTF-8","cache-control":"public, max-age=5"} });
  }
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[char]));
}

function parseKids(raw) {
  return [...new Set(String(raw || "")
    .split(/[\s,、]+/)
    .map(value => value.trim())
    .filter(value => /^\d+$/.test(value))
    .map(Number)
    .filter(value => value > 0))];
}

async function runWithConcurrency(items, concurrency, worker, onComplete = null) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runner() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      const result = await worker(items[index], index);
      results[index] = result;
      if (onComplete) await onComplete(result, index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runner()));
  return results;
}

async function runKingdomWatchlistLoad(env, kid, topN, runId, processJob, onProgress = null) {
  const startedAt = Date.now();
  if (typeof processJob !== "function") return { run_id:runId, kid:Number(kid), ok:false, error:"KINGDOM_WATCHLIST_PROCESSOR_UNAVAILABLE", elapsed_ms:Date.now()-startedAt };

  const jobId = crypto.randomUUID();
  const watchlistId = "LOAD_TEST:" + runId;
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare("INSERT INTO kingdom_watchlist_jobs (job_id, watchlist_id, kid, top_n, status, board_index, player_cursor, player_ids_json, observed_at, source_first_at, source_last_at, ranking_rows, player_rows, created_at, updated_at) VALUES (?, ?, ?, ?, 'RANKINGS', 0, 0, '[]', ?, NULL, NULL, 0, 0, ?, ?)").bind(jobId, watchlistId, Number(kid), Number(topN), now, now, now).run();

  try {
    let iterations = 0;
    while (iterations++ < 200) {
      if (await isLoadTestCancelled(env.DB, runId)) {
        return { run_id:runId, job_id:jobId, kid:Number(kid), ok:false, cancelled:true, status:"CANCELLED", error:"LOAD_TEST_CANCELLED", elapsed_ms:Date.now()-startedAt };
      }
      const job = await env.DB.prepare("SELECT * FROM kingdom_watchlist_jobs WHERE job_id = ? LIMIT 1").bind(jobId).first();
      if (!job) throw new Error("LOAD_TEST_JOB_NOT_FOUND");
      if (job.status === "FAILED") throw new Error(String(job.last_error || "KINGDOM_WATCHLIST_JOB_FAILED"));
      if (job.status === "COMPLETED") return { run_id:runId, job_id:jobId, kid:Number(kid), ok:true, status:"COMPLETED", ranking_rows:Number(job.ranking_rows||0), player_rows:Number(job.player_rows||0), board_index:Number(job.board_index||0), elapsed_ms:Date.now()-startedAt };
      const step = await processJob(env, job);
      if (onProgress) {
        await onProgress({
          run_id: runId,
          job_id: jobId,
          kid: Number(kid),
          phase: String(step?.phase || job.status || "RANKINGS"),
          board_index: Number(step?.board_index ?? job.board_index ?? 0),
          total_boards: 26,
          player_cursor: Number(step?.playerCursor ?? job.player_cursor ?? 0),
          player_count: Number(step?.playerCount ?? (() => {
            try { return JSON.parse(job.player_ids_json || "[]").length; } catch { return 0; }
          })()),
          ranking_rows: Number(step?.rankingRows ?? job.ranking_rows ?? 0),
          player_rows: Number(step?.playerRows ?? job.player_rows ?? 0),
          completed: Boolean(step?.completed)
        });
      }
    }
    throw new Error("KINGDOM_WATCHLIST_LOAD_TEST_ITERATION_LIMIT");
  } catch (error) {
    return { run_id:runId, job_id:jobId, kid:Number(kid), ok:false, status:"FAILED", error:String(error?.message||error||"KINGDOM_WATCHLIST_JOB_FAILED").slice(0,1000), elapsed_ms:Date.now()-startedAt };
  } finally {
    await env.DB.prepare("DELETE FROM kingdom_watchlist_jobs WHERE job_id = ?").bind(jobId).run().catch(error => console.error("owner_kingdom_load_test_job_cleanup_failed", {jobId,kid,message:error?.message||String(error)}));
  }
}
export async function handleOwnerKingdomLoadTestApi(request, env, auth, requestTraceId = null, processJob = null) {
  if (!auth || auth.role !== "OWNER" || auth.status !== "ACTIVE") return new Response(JSON.stringify({ok:false,error:"OWNER_REQUIRED"}), {status:403,headers:{"content-type":"application/json"}});
  if (request.method !== "GET") return new Response(JSON.stringify({ok:false,error:"METHOD_NOT_ALLOWED"}), {status:405,headers:{"content-type":"application/json"}});
  const url=new URL(request.url), kids=parseKids(url.searchParams.get("kids"));
  const requestedConcurrency=Math.min(Math.max(Number(url.searchParams.get("concurrency")||DEFAULT_CONCURRENCY),1),MAX_CONCURRENCY);
  const topN=Number(url.searchParams.get("top_n")||10)===5?5:10;
  if(typeof processJob!=="function")return new Response(JSON.stringify({ok:false,error:"KINGDOM_WATCHLIST_PROCESSOR_UNAVAILABLE"}),{status:503,headers:{"content-type":"application/json"}});
  if(!kids.length)return new Response(JSON.stringify({ok:false,error:"KINGDOMS_REQUIRED"}),{status:400,headers:{"content-type":"application/json"}});
  if(kids.length>MAX_KINGDOMS)return new Response(JSON.stringify({ok:false,error:"TOO_MANY_KINGDOMS",max:MAX_KINGDOMS}),{status:400,headers:{"content-type":"application/json"}});
  const startedAt=Date.now(),runId=crypto.randomUUID(),traceId=requestTraceId||systemTraceId("load");
  const poolAvailability=await getApiPoolAvailability(env.DB,{poolTypes:["SYSTEM_WATCHLIST","SYSTEM_GENERAL","USER_CONTRIBUTED"]});
  const availablePoolKeys=Number(poolAvailability?.totals?.available||0);
  if(availablePoolKeys<2)return new Response(JSON.stringify({ok:false,error:"API_POOL_TEST_CAPACITY_INSUFFICIENT",message:"通常利用保護のため、ロードテストには少なくとも2本の利用可能なAPIキーが必要です。",available_pool_keys:availablePoolKeys,reserved_for_normal_use:1}),{status:409,headers:{"content-type":"application/json; charset=UTF-8","cache-control":"no-store"}});
  const concurrency=Math.min(requestedConcurrency,Math.max(1,Math.min(MAX_CONCURRENCY,availablePoolKeys-1)));
  if(!await acquireLoadTestState(env.DB,runId))return new Response(JSON.stringify({ok:false,error:"LOAD_TEST_ALREADY_RUNNING",message:"現在、別の王国負荷テストが実行中です。"}),{status:409,headers:{"content-type":"application/json; charset=UTF-8","cache-control":"no-store"}});
  const encoder=new TextEncoder(),stream=new TransformStream(),writer=stream.writable.getWriter();
  const send=async payload=>writer.write(encoder.encode(JSON.stringify(payload)+"\n"));
  const run=(async()=>{try{
    await send({type:"start",run_id:runId,target_count:kids.length,concurrency,requested_concurrency:requestedConcurrency,available_pool_keys:availablePoolKeys,reserved_for_normal_use:1,mode:"KINGDOM_WATCHLIST_PIPELINE",top_n:topN,completed:0,success:0,failed:0});
    let completed=0,success=0,failed=0;
    const results=await runWithConcurrency(kids,concurrency,kid=>runKingdomWatchlistLoad(env,kid,topN,runId,processJob,async progress=>{await send({type:"job_progress",target_count:kids.length,completed,success,failed,percent:Math.round(completed/kids.length*100),progress});}),async result=>{completed++;if(result.ok)success++;else failed++;await send({type:"progress",run_id:runId,target_count:kids.length,completed,success,failed,percent:Math.round(completed/kids.length*100),result});});
    const successfulResults=results.filter(item=>item?.ok),failedResults=results.filter(item=>!item?.ok),cancelledResults=results.filter(item=>item?.cancelled);
    const rankingRowsSaved=successfulResults.reduce((sum,item)=>sum+Number(item.ranking_rows||0),0),playerRowsSaved=successfulResults.reduce((sum,item)=>sum+Number(item.player_rows||0),0);
    const latencies=successfulResults.map(item=>Number(item.elapsed_ms)).filter(Number.isFinite),failureCodes={};
    for(const item of failedResults){const code=String(item?.error||"UNKNOWN");failureCodes[code]=(failureCodes[code]||0)+1;}
    const summary={run_id:runId,kingdom_count:kids.length,start_kid:Math.min(...kids),end_kid:Math.max(...kids),mode:"KINGDOM_WATCHLIST_PIPELINE",top_n:topN,concurrency,requested_concurrency:requestedConcurrency,available_pool_keys:availablePoolKeys,reserved_for_normal_use:1,elapsed_ms:Date.now()-startedAt,success_count:success,failed_count:failed,ranking_rows_saved:rankingRowsSaved,player_rows_saved:playerRowsSaved,max_expected_ranking_rows:kids.length*26*100,latency_min_ms:latencies.length?Math.min(...latencies):null,latency_max_ms:latencies.length?Math.max(...latencies):null,latency_avg_ms:latencies.length?Math.round(latencies.reduce((a,b)=>a+b,0)/latencies.length):null,failure_codes:failureCodes,result_sample:failedResults.slice(0,50).map(item=>({kid:item.kid,error:item.error}))};
    await recordServiceUsage(env,{operation:"OWNER_KINGDOM_LOAD_TEST",actorUserId:auth.user_id,targetType:"USER",targetId:auth.user_id,metadata:summary});
    await recordSystemEvent(env.DB,{traceId,eventType:"LOAD_TEST",service:"load_test",feature:"owner_kingdom_load_test",operation:"COMPLETE",status:failed?"COMPLETED_WITH_ERRORS":"COMPLETED",actorType:"OWNER",actorId:auth.user_id,targetType:"KINGDOM_BATCH",targetId:String(kids.length),elapsedMs:summary.elapsed_ms,message:failed?"OWNER王国Watchlist実処理負荷テスト完了（一部失敗あり）":"OWNER王国Watchlist実処理負荷テスト完了",metadata:summary});
    await send({type:cancelledResults.length?"cancelled":"complete",run_id:runId,ok:true,cancelled:Boolean(cancelledResults.length),target_count:kids.length,concurrency,top_n:topN,elapsed_ms:summary.elapsed_ms,success,failed,cancelled_count:cancelledResults.length,ranking_rows_saved:rankingRowsSaved,player_rows_saved:playerRowsSaved,max_expected_ranking_rows:summary.max_expected_ranking_rows,results});
  }catch(error){await recordSystemEvent(env.DB,{traceId,eventType:"LOAD_TEST",service:"load_test",feature:"owner_kingdom_load_test",operation:"RUN",status:"FAILED",actorType:"OWNER",actorId:auth.user_id,targetType:"KINGDOM_BATCH",targetId:String(kids.length),elapsedMs:Date.now()-startedAt,errorCode:error?.code||"LOAD_TEST_FAILED",message:error?.message||"王国Watchlist実処理負荷テスト失敗",metadata:{runId,targetCount:kids.length,mode:"KINGDOM_WATCHLIST_PIPELINE",topN}});await send({type:"error",run_id:runId,ok:false,error:String(error?.message||error||"LOAD_TEST_FAILED").slice(0,1000)});}finally{await clearLoadTestCancellation(env.DB,runId);await releaseLoadTestState(env.DB,runId).catch(error=>console.error("owner_kingdom_load_test_state_release_failed",error?.message||error));await writer.close();}})();
  return new Response(stream.readable,{headers:{"content-type":"application/x-ndjson; charset=UTF-8","cache-control":"no-store, no-cache, must-revalidate","x-accel-buffering":"no"}});
}
export function renderOwnerKingdomLoadTestPage() {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EagleEye 王国Watchlist実処理負荷テスト</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:760px;margin:auto;padding:28px 16px 48px}.back{color:#94a3b8;text-decoration:none}.badge{display:inline-block;margin-top:16px;padding:6px 10px;border:1px solid #f59e0b;border-radius:999px;color:#fbbf24;background:#241a08;font-size:12px;font-weight:900}.card{margin-top:18px;padding:18px;border:1px solid #334155;border-radius:16px;background:#162238}.hint{color:#94a3b8;line-height:1.7;font-size:13px}label{display:block;margin-top:14px;color:#cbd5e1;font-size:13px}input,select{width:100%;margin-top:7px;padding:12px;border-radius:9px;border:1px solid #334155;background:#0b1220;color:#fff}button{margin-top:16px;padding:12px 16px;border:0;border-radius:9px;background:#f59e0b;color:#111827;font-weight:900}button:disabled{opacity:.58;cursor:not-allowed}.warning{margin-top:14px;padding:12px;border-radius:10px;border:1px solid #7c5b13;background:#211a0a;color:#f8d27a;font-size:12px;line-height:1.7}#progress{display:none;margin-top:16px}.progress{margin:14px 0;padding:15px;border:1px solid #334155;border-radius:14px;background:#0b1220;display:grid;gap:5px}.progress b{font-size:14px}.progress span{font-size:23px;font-weight:950;color:#f59e0b}.progress small{color:#94a3b8}.progress-track{height:7px;border-radius:999px;background:#334155;overflow:hidden;margin-top:4px}.progress-fill{height:100%;border-radius:999px;background:#f59e0b;transition:width .2s}.active-jobs{display:grid;gap:0;max-height:520px;overflow:auto}#result{white-space:pre-wrap;overflow:auto;margin-top:16px;padding:14px;border-radius:10px;background:#0b1220;color:#cbd5e1;font-size:12px;line-height:1.6}</style></head><body><main class="wrap"><a class="back" href="/admin/api-pool">← API Pool管理へ戻る</a><div class="badge">OWNER ONLY</div><h1>王国Watchlist実処理負荷テスト</h1><p class="hint">実際の王国ウォッチリスト更新と同じ取得・比較・保存パイプラインを実行します。ランキング26ボード、上位プレイヤー取得、D1現在値更新、Change Event、R2履歴保存まで本番と同じ処理を通します。</p><div class="warning">テストで生成されたランキング・プレイヤー・履歴データは削除しません。後からユーザーが検索した場合にそのまま利用できるようにします。テスト用の一時Jobだけ終了後に削除します。</div><div class="card"><label>開始王国番号<input id="startKid" type="number" min="1" step="1" value="1500"></label><label>取得王国数<select id="kidCount"><option value="20" selected>20王国</option><option value="40">40王国</option><option value="60">60王国</option><option value="80">80王国</option><option value="100">100王国</option><option value="200">200王国</option><option value="300">300王国</option><option value="400">400王国</option><option value="500">500王国</option><option value="600">600王国</option><option value="700">700王国</option><option value="800">800王国</option><option value="900">900王国</option><option value="1000">1000王国</option></select></label><button type="button" onclick="window.__eagleEyeBuildKids()" style="background:#334155;color:#fff">王国範囲を生成</button><div id="selectedKids" style="margin-top:10px;color:#cbd5e1;font-size:12px;line-height:1.7"></div><label>王国番号（直接入力可）<input id="kids" placeholder="1500,1501,1502"></label><label>上位プレイヤー取得数<select id="topN"><option value="5">5人</option><option value="10" selected>10人</option></select></label><label>王国Job同時実行数<select id="concurrency"><option value="1" selected>1</option><option value="2">2</option><option value="3">3</option><option value="5">5</option><option value="10">10</option><option value="15">15</option><option value="20">20</option><option value="26">26</option><option value="30">30</option><option value="40">40</option><option value="50">50</option></select></label><button type="button" id="run" onclick="window.__eagleEyeRunLoadTest()">王国Watchlist実処理を実行</button><button type="button" id="cancel" onclick="window.__eagleEyeCancelLoadTest()" style="display:none;background:#7f1d1d;color:#fff;margin-left:8px">負荷テストを中止</button><div id="progress"><div class="progress"><b id="progressTitle">全体進捗</b><span id="progressCount">0 / 0</span><div class="progress-track"><div class="progress-fill" id="progressFill"></div></div><small id="progressMeta">処理状況を取得中…</small></div><div id="activeJobs"></div></div><div id="result">結果はここに表示されます。</div></div><script>(function(){function parseKids(raw){return [...new Set(String(raw||"").split(/[\\s,、]+/).map(function(v){return v.trim();}).filter(function(v){return /^\\d+$/.test(v);}).map(Number).filter(function(v){return v>0;}))];}function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(ch){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch];});}function phaseText(p){return p==="RANKINGS"?"ランキング":p==="PLAYERS"?"プレイヤー":"完了";}
function renderJobProgress(j){
  var boardTotal=Number(j.total_boards||26);
  var board=Number(j.board_index||0);
  var playerCount=Number(j.player_count||0);
  var cursor=Number(j.player_cursor||0);
  if(j.phase==="PLAYERS"){
    var playerPct=playerCount?Math.min(100,Math.round(cursor/playerCount*100)):0;
    return "<div class='progress'><b>王国 "+esc(j.kid)+"　更新中：プレイヤー</b><span>"+esc(cursor)+" / "+esc(playerCount)+"</span><div class='progress-track'><div class='progress-fill' style='width:"+playerPct+"%'></div></div><small>プレイヤーデータ取得 "+esc(j.player_rows||0)+"件</small></div>";
  }
  var pct=boardTotal?Math.min(100,Math.round(board/boardTotal*100)):0;
  return "<div class='progress'><b>王国 "+esc(j.kid)+"　更新中：ランキング</b><span>"+esc(board)+" / "+esc(boardTotal)+"</span><div class='progress-track'><div class='progress-fill' style='width:"+pct+"%'></div></div><small>ランキング取得 "+esc(j.ranking_rows||0)+"件</small></div>";
}
function renderProgress(data,active){
  var box=document.getElementById("progress"),count=document.getElementById("progressCount"),fill=document.getElementById("progressFill"),meta=document.getElementById("progressMeta"),title=document.getElementById("progressTitle"),list=document.getElementById("activeJobs");
  box.style.display="block";
  var total=Number(data.target_count||0),done=Number(data.completed||0),pct=total?Math.min(100,Math.round(done/total*100)):0;
  count.textContent=done+" / "+total;
  fill.style.width=pct+"%";
  title.textContent="全体進捗";
  meta.textContent="成功 "+Number(data.success||0)+" / 失敗 "+Number(data.failed||0)+"　Job同時実行 "+Number(data.concurrency||0);
  var rows=Object.keys(active).map(function(k){return active[k];}).filter(function(x){return !x.completed;}).sort(function(a,b){return Number(a.kid)-Number(b.kid);});
  list.innerHTML=rows.length?rows.map(renderJobProgress).join(""):"";
}
window.__eagleEyeBuildKids=function(){var start=Math.max(1,Number(document.getElementById("startKid").value||0)),count=Math.max(1,Number(document.getElementById("kidCount").value||20)),values=[];for(var i=0;i<count;i++)values.push(start+i);document.getElementById("kids").value=values.join(",");document.getElementById("selectedKids").textContent=values.join(", ");};window.__eagleEyeCancelLoadTest=async function(){try{var response=await fetch("/api/owner/kingdom-load-test/cancel",{method:"POST",credentials:"same-origin",cache:"no-store"});var data=await response.json();if(!response.ok)throw new Error(data.message||data.error||"CANCEL_FAILED");document.getElementById("result").textContent="中止要求を送信しました。現在のAPI処理完了後、安全に停止します。";document.getElementById("cancel").disabled=true;}catch(e){document.getElementById("result").textContent="中止要求失敗: "+e.message;}};window.__eagleEyeRunLoadTest=async function(){var trace=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():"client-"+Date.now(),run=document.getElementById("run"),cancel=document.getElementById("cancel"),result=document.getElementById("result"),active={};try{var kids=parseKids(document.getElementById("kids").value);if(!kids.length){window.__eagleEyeBuildKids();kids=parseKids(document.getElementById("kids").value);}if(!kids.length)throw new Error("王国番号を入力してください。");var topN=document.getElementById("topN").value||"10",concurrency=document.getElementById("concurrency").value||"1";run.disabled=true;run.textContent="実行中…";cancel.style.display="inline-block";cancel.disabled=false;result.textContent="処理開始…";document.getElementById("progress").style.display="block";document.getElementById("progressCount").textContent="0 / "+kids.length;document.getElementById("progressFill").style.width="0%";document.getElementById("activeJobs").innerHTML="";var response=await fetch("/api/owner/kingdom-load-test?kids="+encodeURIComponent(kids.join(","))+"&top_n="+topN+"&concurrency="+concurrency,{cache:"no-store",credentials:"same-origin",headers:{"x-eagle-eye-trace-id":trace}});if(!response.ok){var detail="HTTP "+response.status;try{var body=await response.json();detail=body.message||body.error||detail;}catch(e){}throw new Error(detail);}var reader=response.body.getReader(),decoder=new TextDecoder(),buffer="";while(true){var chunk=await reader.read();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true});var lines=buffer.split("\\n");buffer=lines.pop()||"";for(var i=0;i<lines.length;i++){if(!lines[i].trim())continue;var data=JSON.parse(lines[i]);if(data.type==="start"){result.textContent="処理開始…\\n"+data.target_count+"王国 / Job同時 "+data.concurrency+" / 上位"+data.top_n+"人";renderProgress(data,active);}else if(data.type==="job_progress"){active[String(data.progress.kid)]=data.progress;renderProgress(data,active);}else if(data.type==="progress"){active[String(data.result.kid)]=Object.assign({},active[String(data.result.kid)]||{},data.result,{completed:true,phase:"COMPLETED"});renderProgress(data,active);result.textContent="処理中… "+data.percent+"%\\n"+data.completed+" / "+data.target_count+"王国\\n成功 "+data.success+" / 失敗 "+data.failed+"\\n直近: 王国"+data.result.kid+" / ranking "+data.result.ranking_rows+" / player "+data.result.player_rows;}else if(data.type==="cancelled"){result.textContent="負荷テスト中止
完了 "+data.success+" / 失敗 "+data.failed+" / 中止 "+data.cancelled_count+"王国
経過 "+data.elapsed_ms+"ms";var finalData=Object.assign({},data,{completed:data.target_count,success:data.success,failed:data.failed,concurrency:data.concurrency});renderProgress(finalData,active);document.getElementById("progressTitle").textContent="中止";document.getElementById("progressMeta").textContent="完了 "+data.success+" / 失敗 "+data.failed+" / 中止 "+data.cancelled_count+"　Job同時実行 "+data.concurrency;}else if(data.type==="complete"){result.textContent="処理完了\\n成功 "+data.success+" / 失敗 "+data.failed+"\\n経過 "+data.elapsed_ms+"ms\\nランキング保存 "+data.ranking_rows_saved+" rows\\nプレイヤー保存 "+data.player_rows_saved+" rows\\n最大想定ランキング "+data.max_expected_ranking_rows+" rows\\n\\n"+JSON.stringify(data,null,2);var finalData=Object.assign({},data,{completed:data.target_count,success:data.success,failed:data.failed,concurrency:data.concurrency});renderProgress(finalData,active);document.getElementById("progressTitle").textContent="✓ 更新完了";document.getElementById("progressMeta").textContent="成功 "+data.success+" / 失敗 "+data.failed+"　Job同時実行 "+data.concurrency;}else if(data.type==="error")throw new Error(data.error||"LOAD_TEST_FAILED");}}}finally{run.disabled=false;run.textContent="王国Watchlist実処理を実行";cancel.style.display="none";cancel.disabled=false;}};window.__eagleEyeBuildKids();})();</script></main></body></html>`;
}