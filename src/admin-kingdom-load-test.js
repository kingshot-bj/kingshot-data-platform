import { getMightPulseKingdomRanks, getMightPulseKingdomAllRankings } from "./mightpulse.js";
import { configureApiPoolEncryption, leaseApiKey, recordApiPoolSuccess, recordApiPoolFailure, recordUsage, getApiPoolAvailability } from "./api-pool.js";
import { recordServiceUsage } from "./service-usage.js";
import { childSystemTrace, runSystemOperation, systemTraceId } from "./system-log.js";

const MAX_KINGDOMS = 1000;
const MAX_CONCURRENCY = 50;
const DEFAULT_CONCURRENCY = 10;
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

async function runKingdomLoad(env, kid, board, allRankings = false, runId = null, parentTraceId = null) {
  const trace = childSystemTrace(parentTraceId ? { traceId: parentTraceId } : null, {
    targetType: "KINGDOM",
    targetId: String(kid)
  });
  let lease = null;
  return runSystemOperation(env.DB, trace, {
    eventType: "KINGDOM_REQUEST",
    service: "load_test",
    feature: "owner_kingdom_load_test",
    operation: "MIGHTPULSE_KINGDOM_RANKING",
    actorType: "OWNER",
    targetType: "KINGDOM",
    targetId: String(kid),
    message: "王国ランキング取得完了",
    successStatus: "COMPLETED",
    failureStatus: "FAILED",
    metadata: { runId, board: allRankings ? "ALL" : board, allRankings }
  }, async () => {
    try {
      configureApiPoolEncryption(env.EAGLEEYE_SESSION_SECRET);
      const poolTypes = ["SYSTEM_WATCHLIST", "SYSTEM_GENERAL", "USER_CONTRIBUTED"];
      lease = await leaseApiKey(env.DB, {
        poolTypes,
        jobId: runId,
        purpose: "OWNER_LOAD_TEST",
        targetType: "KINGDOM",
        targetId: String(kid)
      });

      const startedAt = Date.now();
      const result = allRankings
        ? await getMightPulseKingdomAllRankings(env, String(kid), { limit: 100, apiKey: lease.api_key, traceId: trace.traceId, parentTraceId: trace.parentTraceId })
        : await getMightPulseKingdomRanks(env, String(kid), { board, limit: 100, apiKey: lease.api_key, traceId: trace.traceId, parentTraceId: trace.parentTraceId });
      const elapsedMs = Date.now() - startedAt;
      const payload = result?.data || {};
      const entries = Array.isArray(payload?.data) ? payload.data.length :
        Array.isArray(payload?.rankings) ? payload.rankings.length :
        Array.isArray(payload?.results) ? payload.results.length : null;
      const boardCount = allRankings && payload?.boards && typeof payload.boards === "object" && !Array.isArray(payload.boards)
        ? Object.keys(payload.boards).length
        : null;
      const endpoint = allRankings ? "/kingdoms/:kid?include=boards" : "/kingdoms/:kid/ranks";

      await recordApiPoolSuccess(env.DB, {
        keyId: lease.key_id,
        leaseId: lease.lease_id,
        poolType: lease.pool_type,
        endpoint,
        targetType: "KINGDOM",
        targetId: String(kid),
        jobId: runId,
        purpose: "OWNER_LOAD_TEST",
        httpStatus: result.status,
        traceId: trace.traceId
      });
      await recordUsage(env.DB, {
        keyId: lease.key_id,
        provider: lease.provider,
        poolType: lease.pool_type,
        endpoint,
        targetType: "KINGDOM",
        targetId: String(kid),
        jobId: runId,
        purpose: "OWNER_LOAD_TEST",
        httpStatus: result.status,
        requestCount: 1
      });

      return {
        run_id: runId,
        kid: Number(kid),
        ok: true,
        status: result.status,
        pool_type: lease.pool_type,
        entry_count: entries,
        board_count: boardCount,
        elapsed_ms: elapsedMs
      };
    } catch (error) {
      if (lease) {
        const status = Number(error?.status || 0);
        const cooldown = status === 429 ? 60 : status >= 500 || error?.code === "MIGHTPULSE_TIMEOUT" || error?.code === "MIGHTPULSE_NETWORK_ERROR" ? 15 : 0;
        const disable = status === 401 || status === 403;
        const keepAvailable = !disable && cooldown === 0 && (status === 400 || status === 404);
        const endpoint = allRankings ? "/kingdoms/:kid?include=boards" : "/kingdoms/:kid/ranks";
        await recordApiPoolFailure(env.DB, {
          keyId: lease.key_id,
          leaseId: lease.lease_id,
          poolType: lease.pool_type,
          endpoint,
          targetType: "KINGDOM",
          targetId: String(kid),
          jobId: runId,
          purpose: "OWNER_LOAD_TEST",
          httpStatus: status,
          errorCode: error?.code || "MIGHTPULSE_RANKING_REQUEST_FAILED",
          errorMessage: error?.message || null,
          cooldownSeconds: cooldown,
          disable,
          keepAvailable,
          traceId: trace.traceId
        });
        await recordUsage(env.DB, {
          keyId: lease.key_id,
          provider: lease.provider,
          poolType: lease.pool_type,
          endpoint,
          targetType: "KINGDOM",
          targetId: String(kid),
          jobId: runId,
          purpose: "OWNER_LOAD_TEST",
          httpStatus: status,
          requestCount: 1
        });
      }
      throw error;
    }
  });
}

export async function handleOwnerKingdomLoadTestApi(request, env, auth, requestTraceId = null) {
  if (!auth || auth.role !== "OWNER" || auth.status !== "ACTIVE") return new Response(JSON.stringify({ok:false,error:"OWNER_REQUIRED"}), {status:403,headers:{"content-type":"application/json"}});
  if (request.method !== "GET") return new Response(JSON.stringify({ ok:false, error:"METHOD_NOT_ALLOWED" }), { status:405, headers:{"content-type":"application/json"} });

  const url = new URL(request.url);
  const kids = parseKids(url.searchParams.get("kids"));
  const board = String(url.searchParams.get("board") || "").trim();
  const allRankings = url.searchParams.get("all_rankings") === "1";
  const requestedConcurrency = Math.min(Math.max(Number(url.searchParams.get("concurrency") || DEFAULT_CONCURRENCY), 1), MAX_CONCURRENCY);

  if (!allRankings && !board) return new Response(JSON.stringify({ ok:false, error:"BOARD_REQUIRED" }), { status:400, headers:{"content-type":"application/json"} });
  if (!kids.length) return new Response(JSON.stringify({ ok:false, error:"KINGDOMS_REQUIRED" }), { status:400, headers:{"content-type":"application/json"} });
  if (kids.length > MAX_KINGDOMS) return new Response(JSON.stringify({ ok:false, error:"TOO_MANY_KINGDOMS", max:MAX_KINGDOMS }), { status:400, headers:{"content-type":"application/json"} });

  const startedAt = Date.now();
  const runId = crypto.randomUUID();
  const traceId = requestTraceId || systemTraceId("load");

  const poolAvailability = await getApiPoolAvailability(env.DB, {
    poolTypes: ["SYSTEM_WATCHLIST", "SYSTEM_GENERAL", "USER_CONTRIBUTED"]
  });
  const availablePoolKeys = Number(poolAvailability?.totals?.available || 0);
  const maxTestConcurrency = Math.max(0, availablePoolKeys - 1);
  if (maxTestConcurrency < 1) {
    return new Response(JSON.stringify({
      ok:false,
      error:"API_POOL_TEST_CAPACITY_INSUFFICIENT",
      message:"通常利用保護のため、ロードテストには少なくとも2本の利用可能なAPIキーが必要です。",
      available_pool_keys: availablePoolKeys,
      reserved_for_normal_use: 1
    }), { status:409, headers:{"content-type":"application/json; charset=UTF-8","cache-control":"no-store"} });
  }
  const concurrency = Math.min(requestedConcurrency, maxTestConcurrency);
  if (!await acquireLoadTestState(env.DB, runId)) {
    return new Response(JSON.stringify({
      ok:false,
      error:"LOAD_TEST_ALREADY_RUNNING",
      message:"現在、別の王国負荷テストが実行中です。"
    }), { status:409, headers:{"content-type":"application/json; charset=UTF-8","cache-control":"no-store"} });
  }
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const send = async payload => {
    await writer.write(encoder.encode(JSON.stringify(payload) + "\n"));
  };

  const run = (async () => {
    try {
      console.log("eagleeye_owner_kingdom_load_test_start", { run_id: runId, actor_user_id: auth.user_id, actor_role: auth.role, target_count: kids.length, start_kid: Math.min(...kids), end_kid: Math.max(...kids), board_mode: allRankings ? "ALL" : "SINGLE", board: allRankings ? "ALL" : board, requested_concurrency: requestedConcurrency, concurrency, available_pool_keys: availablePoolKeys, reserved_for_normal_use: 1 });
      await send({
        type: "start",
        run_id: runId,
        target_count: kids.length,
        concurrency,
        requested_concurrency: requestedConcurrency,
        available_pool_keys: availablePoolKeys,
        reserved_for_normal_use: 1,
        board: allRankings ? "ALL" : board,
        all_rankings: allRankings,
        completed: 0,
        success: 0,
        failed: 0
      });

      let completed = 0;
      let success = 0;
      let failed = 0;

      const results = await runWithConcurrency(
        kids,
        concurrency,
        kid => runKingdomLoad(env, kid, board, allRankings, runId, traceId),
        async result => {
          completed++;
          if (result.ok) success++;
          else failed++;
          await send({
            type: "progress",
            run_id: runId,
            target_count: kids.length,
            completed,
            success,
            failed,
            percent: Math.round((completed / kids.length) * 100),
            result
          });
        }
      );

      const successfulResults = results.filter(item => item?.ok);
      const failedResults = results.filter(item => !item?.ok);
      const latencies = successfulResults.map(item => Number(item.elapsed_ms)).filter(Number.isFinite);
      const httpStatusCounts = {};
      for (const item of results) { const status = String(item?.status ?? 0); httpStatusCounts[status] = (httpStatusCounts[status] || 0) + 1; }
      const failureCodes = {};
      for (const item of failedResults) { const code = String(item?.error || "UNKNOWN"); failureCodes[code] = (failureCodes[code] || 0) + 1; }
      const summary = {
        run_id: runId,
        kingdom_count: kids.length,
        start_kid: Math.min(...kids),
        end_kid: Math.max(...kids),
        board_mode: allRankings ? "ALL" : "SINGLE",
        board: allRankings ? "ALL" : board,
        concurrency,
        requested_concurrency: requestedConcurrency,
        available_pool_keys: availablePoolKeys,
        reserved_for_normal_use: 1,
        elapsed_ms: Date.now() - startedAt,
        success_count: success,
        failed_count: failed,
        http_status_counts: httpStatusCounts,
        failure_codes: failureCodes,
        latency_min_ms: latencies.length ? Math.min(...latencies) : null,
        latency_max_ms: latencies.length ? Math.max(...latencies) : null,
        latency_avg_ms: latencies.length ? Math.round(latencies.reduce((a,b) => a+b, 0) / latencies.length) : null,
        peak_in_flight: concurrency,
        result_sample: failedResults.slice(0, 50).map(item => ({ kid:item.kid, status:item.status, error:item.error }))
      };
      await recordServiceUsage(env, {
        operation: "OWNER_KINGDOM_LOAD_TEST",
        actorUserId: auth.user_id,
        targetType: "USER",
        targetId: auth.user_id,
        metadata: summary
      });
      await recordSystemEvent(env.DB, {
        traceId,
        eventType: "LOAD_TEST",
        service: "load_test",
        feature: "owner_kingdom_load_test",
        operation: "COMPLETE",
        status: failed ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
        actorType: "OWNER",
        actorId: auth.user_id,
        targetType: "KINGDOM_BATCH",
        targetId: String(kids.length),
        elapsedMs: summary.elapsed_ms,
        message: failed ? "OWNER王国並列負荷テスト完了（一部失敗あり）" : "OWNER王国並列負荷テスト完了",
        metadata: summary
      });
      console.log("eagleeye_owner_kingdom_load_test_complete", { actor_user_id: auth.user_id, actor_role: auth.role, ...summary });

      await send({
        type: "complete",
        run_id: runId,
        ok: true,
        target_count: kids.length,
        concurrency,
        board: allRankings ? "ALL" : board,
        all_rankings: allRankings,
        elapsed_ms: summary.elapsed_ms,
        success,
        failed,
        results
      });
    } catch (error) {
      await recordSystemEvent(env.DB, {
        traceId,
        eventType: "LOAD_TEST",
        service: "load_test",
        feature: "owner_kingdom_load_test",
        operation: "RUN",
        status: "FAILED",
        actorType: "OWNER",
        actorId: auth.user_id,
        targetType: "KINGDOM_BATCH",
        targetId: String(kids.length),
        elapsedMs: Date.now() - startedAt,
        errorCode: error?.code || "LOAD_TEST_FAILED",
        message: error?.message || "王国並列負荷テスト失敗",
        metadata: { runId, targetCount: kids.length }
      });
      await send({
        type: "error",
        run_id: runId,
        ok: false,
        error: String(error?.message || error || "LOAD_TEST_FAILED").slice(0, 1000)
      });
    } finally {
      await releaseLoadTestState(env.DB, runId).catch(error => console.error("owner_kingdom_load_test_state_release_failed", error?.message || error));
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "content-type": "application/x-ndjson; charset=UTF-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      "x-accel-buffering": "no"
    }
  });
}

export function renderOwnerKingdomLoadTestPage() {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EagleEye 王国並列負荷テスト</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:760px;margin:auto;padding:28px 16px 48px}.back{color:#94a3b8;text-decoration:none}.badge{display:inline-block;margin-top:16px;padding:6px 10px;border:1px solid #f59e0b;border-radius:999px;color:#fbbf24;background:#241a08;font-size:12px;font-weight:900}.card{margin-top:18px;padding:18px;border:1px solid #334155;border-radius:16px;background:#162238}.hint{color:#94a3b8;line-height:1.7;font-size:13px}label{display:block;margin-top:14px;color:#cbd5e1;font-size:13px}input,select{width:100%;margin-top:7px;padding:12px;border-radius:9px;border:1px solid #334155;background:#0b1220;color:#fff}button{margin-top:16px;padding:12px 16px;border:0;border-radius:9px;background:#f59e0b;color:#111827;font-weight:900}button:disabled{opacity:.58;cursor:not-allowed}.progress{margin:14px 0;padding:15px;border:1px solid #334155;border-radius:14px;background:#0b1220;display:grid;gap:5px}.progress b{font-size:14px}.progress span{font-size:23px;font-weight:950;color:#f59e0b}.progress small{color:#94a3b8}.progress-track{height:7px;border-radius:999px;background:#334155;overflow:hidden;margin-top:4px}.progress-fill{height:100%;border-radius:999px;background:#f59e0b;transition:width .2s}#result{white-space:pre-wrap;overflow:auto;margin-top:16px;padding:14px;border-radius:10px;background:#0b1220;color:#cbd5e1;font-size:12px;line-height:1.6}</style></head><body><main class="wrap"><a class="back" href="/admin/api-pool">← API Pool管理へ戻る</a><div class="badge">OWNER ONLY</div><h1>王国並列負荷テスト</h1><p class="hint">指定した複数王国へMightPulse王国ランキング取得を並列実行します。API Poolのリース・MightPulse応答・Worker処理時間を確認するためのOWNER専用テストです。</p><div class="card"><label>開始王国番号<input id="startKid" type="number" min="1" step="1" value="1500" placeholder="1500"></label><label>取得王国数<select id="kidCount"><option value="20" selected>20王国</option><option value="40">40王国</option><option value="60">60王国</option><option value="80">80王国</option><option value="100">100王国</option><option value="200">200王国</option><option value="300">300王国</option><option value="400">400王国</option><option value="500">500王国</option><option value="600">600王国</option><option value="700">700王国</option><option value="800">800王国</option><option value="900">900王国</option><option value="1000">1000王国</option></select></label><button type="button" id="buildKids" onclick="window.__eagleEyeBuildKids()" style="background:#334155;color:#fff">王国範囲を生成</button><div id="selectedKids" style="display:flex;flex-wrap:wrap;gap:7px;margin-top:10px"></div><label>王国番号（直接入力も可・カンマ/改行/空白区切り）<input id="kids" placeholder="1500,1501,1502"></label><label>ランキング<select id="boardMode" onchange="window.__eagleEyeToggleBoardMode()"><option value="all" selected>全ランキング（boards）</option><option value="single">単一ランキング</option></select></label><label id="boardLabel" style="display:none">ランキング<select id="board"><option value="personal_power">個人総力</option><option value="kills">個人撃破</option><option value="town_center">役場Lv.</option><option value="hero_total">英雄全体総力</option><option value="troop_power">部隊総力</option></select></label><label>同時実行数<select id="concurrency"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="5">5</option><option value="10" selected>10</option><option value="15">15</option><option value="20">20</option><option value="26">26</option><option value="30">30</option><option value="40">40</option><option value="50">50</option></select></label><button type="button" id="run" onclick="window.__eagleEyeRunLoadTest()">並列取得テストを実行</button><div id="result">結果はここに表示されます。</div></div><script>
(function(){
  function parseKids(raw){
    return [...new Set(String(raw||"").split(/[\\s,、]+/).map(function(v){return v.trim();}).filter(function(v){return /^\\d+$/.test(v);}).map(Number).filter(function(v){return v>0;}))];
  }
  window.__eagleEyeBuildKids=function(){
    var start=Math.max(1,Number(document.getElementById("startKid").value||0));
    var count=Math.max(1,Number(document.getElementById("kidCount").value||20));
    var values=[];
    for(var i=0;i<count;i++) values.push(start+i);
    document.getElementById("kids").value=values.join(",");
    document.getElementById("selectedKids").textContent=values.join(", ");
  };
  window.__eagleEyeToggleBoardMode=function(){
    var mode=document.getElementById("boardMode").value;
    document.getElementById("boardLabel").style.display=mode==="single"?"block":"none";
  };
  window.__eagleEyeRunLoadTest=async function(){
    var clientTraceId=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():"client-"+Date.now()+"-"+Math.random().toString(36).slice(2);
    var run=document.getElementById("run");
    var result=document.getElementById("result");
    try{
      var kidsInput=document.getElementById("kids");
      var kids=parseKids(kidsInput.value);
      if(!kids.length){
        window.__eagleEyeBuildKids();
        kids=parseKids(kidsInput.value);
      }
      if(!kids.length) throw new Error("王国番号を入力するか、王国範囲を生成してください。");
      var allRankings=document.getElementById("boardMode").value==="all";
      var board=allRankings?"":document.getElementById("board").value;
      var concurrency=document.getElementById("concurrency").value||"10";
      run.disabled=true;
      run.textContent="実行中…";
      result.textContent="取得開始…\\n王国数: "+kids.length+" / 同時実行数: "+concurrency;
      var url="/api/owner/kingdom-load-test?kids="+encodeURIComponent(kids.join(","))+"&board="+encodeURIComponent(board)+"&all_rankings="+(allRankings?"1":"0")+"&concurrency="+encodeURIComponent(concurrency);
      var response=await fetch(url,{cache:"no-store",credentials:"same-origin",headers:{"x-eagle-eye-trace-id":clientTraceId}});
      if(!response.ok){
        var detail="HTTP "+response.status;
        try{var body=await response.json();detail=body.message||body.error||detail;}catch(e){}
        throw new Error(detail);
      }
      if(!response.body) throw new Error("ストリーミング応答に対応していません。");
      var reader=response.body.getReader();
      var decoder=new TextDecoder();
      var buffer="";
      var completed=0,success=0,failed=0,target=kids.length;
      while(true){
        var chunk=await reader.read();
        if(chunk.done) break;
        buffer+=decoder.decode(chunk.value,{stream:true});
        var lines=buffer.split("\\n");
        buffer=lines.pop()||"";
        for(var i=0;i<lines.length;i++){
          if(!lines[i].trim()) continue;
          var data=JSON.parse(lines[i]);
          if(data.type==="start"){
            target=Number(data.target_count||target);
            result.textContent="取得開始…\\n王国数: "+target+" / 同時実行数: "+data.concurrency;
          }else if(data.type==="progress"){
            completed=Number(data.completed||0);
            success=Number(data.success||0);
            failed=Number(data.failed||0);
            result.textContent="取得中… "+(data.percent||0)+"%\\n"+completed+" / "+target+" 王国\\n成功: "+success+" / 失敗: "+failed+(data.result?"\\n直近: 王国 "+data.result.kid+" — "+(data.result.ok?"成功":"失敗"):"");
          }else if(data.type==="complete"){
            result.textContent="取得完了\\n成功: "+data.success+" / 失敗: "+data.failed+"\\n経過時間: "+data.elapsed_ms+" ms\\n\\n"+JSON.stringify(data,null,2);
          }else if(data.type==="error"){
            throw new Error(data.error||"LOAD_TEST_FAILED");
          }
        }
      }
      if(buffer.trim()){
        var last=JSON.parse(buffer);
        if(last.type==="complete") result.textContent="取得完了\\n成功: "+last.success+" / 失敗: "+last.failed+"\\n経過時間: "+last.elapsed_ms+" ms\\n\\n"+JSON.stringify(last,null,2);
      }
    }catch(error){
      result.textContent="取得停止\\nERROR: "+(error&&error.message?error.message:String(error));
    }finally{
      run.disabled=false;
      run.textContent="並列取得テストを実行";
    }
  };
  window.__eagleEyeToggleBoardMode();
})();
</script></main></body></html>`;
}