import { getApiPoolAvailability, getApiPoolBudgetSnapshot } from "./api-pool.js";
import { recordServiceUsage } from "./service-usage.js";
import { recordSystemEvent, systemTraceId } from "./system-log.js";
import { evaluateSafetyGate } from "./safety-gate.js";
import { getCloudflareD1Usage } from "./cloudflare-analytics.js";
import { createCollectionSemaphoreLimiter } from "./collection-semaphore.js";

const MAX_KINGDOMS = 1000;
const MAX_API_CONCURRENCY = 26;
const LOAD_TEST_NORMAL_RESERVE = 1;
const LOAD_TEST_LOCK_KEY = "OWNER_KINGDOM_LOAD_TEST";
const LOAD_TEST_LOCK_TTL_SECONDS = 60 * 60 * 2;

async function acquireLoadTestState(db, runId) {
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

async function refreshLoadTestState(db, runId) {
  if (!db || !runId) return false;
  const now = Math.floor(Date.now() / 1000);
  const lockUntil = now + LOAD_TEST_LOCK_TTL_SECONDS;
  const result = await db.prepare(
    "UPDATE api_request_locks SET lock_until = ?, updated_at = ? WHERE lock_key = ? AND lock_token = ? AND lock_until > ?"
  ).bind(lockUntil, now, LOAD_TEST_LOCK_KEY, runId, now).run();
  return result?.meta?.changes === 1;
}

async function releaseLoadTestState(db, runId) {
  if (!db || !runId) return;
  await db.prepare(
    "DELETE FROM api_request_locks WHERE lock_key = ? AND lock_token = ?"
  ).bind(LOAD_TEST_LOCK_KEY, runId).run();
}

async function persistLoadTestMetrics(db,runId,apiLimiter,force=false){if(!db||!runId||!apiLimiter)return;const nowMs=Date.now(),snapshot=apiLimiter.snapshot(),last=Number(apiLimiter.__lastPersistAt||0);if(!force&&nowMs-last<3000)return;apiLimiter.__lastPersistAt=nowMs;const now=Math.floor(nowMs/1000);await db.prepare("UPDATE kingdom_load_test_runs SET api_active_count=?,api_waiting_count=?,api_pool_waiting_count=?,api_wait_events=?,api_pool_wait_events=?,api_wait_ms=?,api_pool_wait_ms=?,api_wait_min_ms=?,api_wait_max_ms=?,api_wait_buckets_json=?,last_activity_at=?,updated_at=? WHERE run_id=?").bind(Number(snapshot.active||0),Number(snapshot.waiting||0),Number(snapshot.pool_waiting||0),Number(snapshot.wait_events||0),Number(snapshot.pool_wait_events||0),Number(snapshot.total_wait_ms||0),Number(snapshot.pool_wait_ms||0),Number(snapshot.min_wait_ms||0),Number(snapshot.max_wait_ms||0),JSON.stringify(snapshot.wait_buckets||{}),now,now,runId).run().catch(()=>{});}
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
    const runMeta = await env.DB.prepare(
      "SELECT run_id FROM kingdom_load_test_runs WHERE run_id = ? LIMIT 1"
    ).bind(runId).first().catch(() => null);
    if(!runMeta){
      await env.DB.prepare(
        "DELETE FROM api_request_locks WHERE lock_key = ? AND lock_token = ?"
      ).bind(LOAD_TEST_LOCK_KEY, runId).run();
      await clearLoadTestCancellation(env.DB, runId);
      return new Response(JSON.stringify({ok:true,run_id:runId,status:"STALE_STARTUP_CANCELLED"}), {headers:{"content-type":"application/json","cache-control":"no-store"}});
    }
    await env.DB.prepare(
      "INSERT INTO api_request_locks (lock_key, lock_token, lock_until, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(lock_key) DO UPDATE SET lock_token = excluded.lock_token, lock_until = excluded.lock_until, updated_at = excluded.updated_at"
    ).bind("LOAD_TEST_CANCEL", "CANCEL:" + runId, now + 60 * 60 * 2, now).run();
    return new Response(JSON.stringify({ok:true,run_id:runId,status:"CANCEL_REQUESTED"}), {headers:{"content-type":"application/json","cache-control":"no-store"}});
  } catch (error) {
    return new Response(JSON.stringify({ok:false,error:"LOAD_TEST_CANCEL_FAILED",message:error?.message||String(error)}), {status:500,headers:{"content-type":"application/json"}});
  }
}

export async function handleOwnerKingdomLoadTestHistoryApi(request, env) {
  if (request.method !== "GET") return new Response(JSON.stringify({ok:false,error:"METHOD_NOT_ALLOWED"}), {status:405,headers:{"content-type":"application/json; charset=UTF-8"}});
  try {
    const url = new URL(request.url);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 20)));
    const rows = await env.DB.prepare("SELECT run_id,target_count,start_kid,end_kid,top_n,concurrency,api_concurrency,available_pool_keys,status,created_at,updated_at,completed_at,success_count,failed_count,ranking_rows_saved,player_rows_saved,elapsed_ms,api_active_count,api_waiting_count,api_pool_waiting_count,api_wait_events,api_pool_wait_events,api_wait_ms,api_pool_wait_ms,api_wait_min_ms,api_wait_max_ms,api_wait_buckets_json,last_activity_at FROM kingdom_load_test_runs ORDER BY created_at DESC LIMIT ?").bind(limit).all();
    const rawRuns=rows.results||[];
    const legacyRuns=rawRuns.filter(row=>String(row.status||"")!=="RUNNING"&&Number(row.success_count||0)===0&&Number(row.failed_count||0)===0);
    const legacySummary=new Map();
    if(legacyRuns.length){
      const placeholders=legacyRuns.map(()=>"?").join(",");
      const summaryRows=await env.DB.prepare("SELECT watchlist_id,SUM(CASE WHEN status='COMPLETED' THEN 1 ELSE 0 END) AS success_count,SUM(CASE WHEN status='FAILED' THEN 1 ELSE 0 END) AS failed_count,SUM(ranking_rows) AS ranking_rows_saved,SUM(player_rows) AS player_rows_saved FROM kingdom_watchlist_jobs WHERE watchlist_id IN ("+placeholders+") GROUP BY watchlist_id").bind(...legacyRuns.map(row=>"LOAD_TEST:"+String(row.run_id))).all();
      for(const summary of (summaryRows.results||[])) legacySummary.set(String(summary.watchlist_id),summary);
    }
    return new Response(JSON.stringify({ok:true,runs:rawRuns.map(row=>{
      const fallback=legacySummary.get("LOAD_TEST:"+String(row.run_id));
      const successCount=Number(row.success_count||0)||Number(fallback?.success_count||0);
      const failedCount=Number(row.failed_count||0)||Number(fallback?.failed_count||0);
      const rankingRows=Number(row.ranking_rows_saved||0)||Number(fallback?.ranking_rows_saved||0);
      const playerRows=Number(row.player_rows_saved||0)||Number(fallback?.player_rows_saved||0);
      const elapsed=row.elapsed_ms==null?((row.completed_at&&row.created_at)?(Number(row.completed_at)-Number(row.created_at))*1000:null):Number(row.elapsed_ms);
      return {run_id:String(row.run_id),target_count:Number(row.target_count||0),start_kid:Number(row.start_kid||0),end_kid:Number(row.end_kid||0),top_n:Number(row.top_n||0),concurrency:Number(row.concurrency||0),api_concurrency:Number(row.api_concurrency||0),available_pool_keys:Number(row.available_pool_keys||0),status:String(row.status||"UNKNOWN"),created_at:Number(row.created_at||0),updated_at:Number(row.updated_at||0),completed_at:row.completed_at==null?null:Number(row.completed_at),success_count:successCount,failed_count:failedCount,ranking_rows_saved:rankingRows,player_rows_saved:playerRows,elapsed_ms:elapsed,api_active_count:Number(row.api_active_count||0),api_waiting_count:Number(row.api_waiting_count||0),api_pool_waiting_count:Number(row.api_pool_waiting_count||0),api_wait_events:Number(row.api_wait_events||0),api_pool_wait_events:Number(row.api_pool_wait_events||0),api_wait_ms:Number(row.api_wait_ms||0),api_pool_wait_ms:Number(row.api_pool_wait_ms||0),api_wait_min_ms:Number(row.api_wait_min_ms||0),api_wait_max_ms:Number(row.api_wait_max_ms||0),api_wait_buckets_json:String(row.api_wait_buckets_json||"{}"),last_activity_at:Number(row.last_activity_at||0)};
    })}),{headers:{"content-type":"application/json; charset=UTF-8","cache-control":"no-store"}});
  } catch(error) {
    console.error("owner_kingdom_load_test_history_failed",error?.message||error);
    return new Response(JSON.stringify({ok:false,error:"LOAD_TEST_HISTORY_UNAVAILABLE"}),{status:503,headers:{"content-type":"application/json; charset=UTF-8","cache-control":"no-store"}});
  }
}

export async function handleOwnerKingdomLoadTestExportApi(request, env) {
  if (request.method !== "GET") return new Response(JSON.stringify({ok:false,error:"METHOD_NOT_ALLOWED"}), {status:405,headers:{"content-type":"application/json; charset=UTF-8"}});
  try {
    const runId = String(new URL(request.url).searchParams.get("run_id") || "").trim();
    if (!runId) return new Response(JSON.stringify({ok:false,error:"RUN_ID_REQUIRED"}), {status:400,headers:{"content-type":"application/json; charset=UTF-8"}});
    const row = await env.DB.prepare("SELECT run_id,target_count,start_kid,end_kid,top_n,concurrency,api_concurrency,available_pool_keys,status,created_at,completed_at,success_count,failed_count,ranking_rows_saved,player_rows_saved,elapsed_ms,api_wait_events,api_pool_wait_events,api_wait_ms,api_pool_wait_ms,api_wait_min_ms,api_wait_max_ms,api_wait_buckets_json FROM kingdom_load_test_runs WHERE run_id = ? LIMIT 1").bind(runId).first();
    if (!row) return new Response(JSON.stringify({ok:false,error:"RUN_NOT_FOUND"}), {status:404,headers:{"content-type":"application/json; charset=UTF-8"}});
    let buckets={}; try { buckets=JSON.parse(row.api_wait_buckets_json||"{}"); } catch {}
    const lines=[["metric","value"],["run_id",row.run_id],["status",row.status],["target_count",row.target_count],["start_kid",row.start_kid],["end_kid",row.end_kid],["top_n",row.top_n],["job_concurrency",row.concurrency],["api_concurrency",row.api_concurrency],["available_pool_keys",row.available_pool_keys],["success_count",row.success_count],["failed_count",row.failed_count],["ranking_rows_saved",row.ranking_rows_saved],["player_rows_saved",row.player_rows_saved],["elapsed_ms",row.elapsed_ms??""],["api_wait_events",row.api_wait_events],["api_pool_wait_events",row.api_pool_wait_events],["api_wait_ms",row.api_wait_ms],["api_pool_wait_ms",row.api_pool_wait_ms],["api_wait_min_ms",row.api_wait_min_ms],["api_wait_max_ms",row.api_wait_max_ms],["wait_bucket_0_5s",buckets["0-5s"]||0],["wait_bucket_5_10s",buckets["5-10s"]||0],["wait_bucket_10_20s",buckets["10-20s"]||0],["wait_bucket_20_30s",buckets["20-30s"]||0],["wait_bucket_30_60s",buckets["30-60s"]||0],["wait_bucket_60s_plus",buckets["60s+"]||0]];
    const csv=lines.map(row=>row.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n")+"\r\n";
    return new Response(csv,{headers:{"content-type":"text/csv; charset=UTF-8","content-disposition":'attachment; filename="eagleeye-load-test-'+runId+'.csv"',"cache-control":"no-store"}});
  } catch(error) { return new Response(JSON.stringify({ok:false,error:"LOAD_TEST_EXPORT_FAILED",message:error?.message||String(error)}),{status:500,headers:{"content-type":"application/json; charset=UTF-8"}}); }
}

export async function handleOwnerKingdomLoadTestStatusApi(request, env) {
  if (request.method !== "GET") return new Response(JSON.stringify({ ok:false, error:"METHOD_NOT_ALLOWED" }), { status:405, headers:{"content-type":"application/json; charset=UTF-8","cache-control":"no-store"} });
  try {
    const now=Math.floor(Date.now()/1000);
    const url=new URL(request.url);
    const requestedRunId=String(url.searchParams.get("run_id")||"").trim();
    const lock=await env.DB.prepare("SELECT lock_token,lock_until,updated_at FROM api_request_locks WHERE lock_key = ? AND lock_until > ? LIMIT 1").bind(LOAD_TEST_LOCK_KEY,now).first();

    // Recovery is explicit: an active lock identifies the currently running Run.
    // A completed Run can be recovered only when the UI supplies its persisted run_id.
    // Never fall back to the latest historical Run, otherwise opening the page alone
    // would display stale progress from a previous test.
    let runId=lock?.lock_token ? String(lock.lock_token) : (requestedRunId || null);
    let runMeta=null;
    if(runId){
      runMeta=await env.DB.prepare("SELECT * FROM kingdom_load_test_runs WHERE run_id = ? LIMIT 1").bind(runId).first();
      if(!runMeta && !lock?.lock_token){
        return new Response(JSON.stringify({ok:true,active:false,run_id:null,jobs:[]}),{headers:{"content-type":"application/json; charset=UTF-8","cache-control":"no-store"}});
      }
    }

    if(!runId){
      return new Response(JSON.stringify({ok:true,active:false,run_id:null,jobs:[]}),{headers:{"content-type":"application/json; charset=UTF-8","cache-control":"no-store"}});
    }

    // A startup failure can occur after the load-test lock is acquired but before
    // kingdom_load_test_runs is inserted. Keep the lock visible so the OWNER can
    // still cancel/recover it instead of seeing a false "nothing is running".
    const jobs=await env.DB.prepare("SELECT job_id,kid,top_n,status,board_index,player_cursor,player_ids_json,ranking_rows,player_rows,created_at,updated_at,last_error FROM kingdom_watchlist_jobs WHERE watchlist_id = ? ORDER BY kid ASC").bind("LOAD_TEST:"+runId).all();
    const normalizedJobs=(jobs.results||[]).map(job=>{
      let playerCount=0;try{playerCount=JSON.parse(job.player_ids_json||"[]").length;}catch{}
      const rawStatus=String(job.status||"RANKINGS");
      const phase=rawStatus==="FAILED"&&String(job.last_error||"")==="LOAD_TEST_CANCELLED"?"CANCELLED":rawStatus;
      return {job_id:job.job_id,kid:Number(job.kid),top_n:Number(job.top_n||0),phase,board_index:Number(job.board_index||0),total_boards:26,player_cursor:Number(job.player_cursor||0),player_count:playerCount,ranking_rows:Number(job.ranking_rows||0),player_rows:Number(job.player_rows||0),created_at:Number(job.created_at||0),updated_at:Number(job.updated_at||0),last_error:job.last_error||null,completed:["COMPLETED","FAILED","CANCELLED"].includes(phase)};
    });

    const targetCount=Number(runMeta?.target_count||normalizedJobs.length||0);
    const completed=normalizedJobs.filter(j=>j.completed).length;
    const success=normalizedJobs.filter(j=>j.phase==="COMPLETED").length;
    const failed=normalizedJobs.filter(j=>j.phase==="FAILED").length;
    const cancelled=normalizedJobs.filter(j=>j.phase==="CANCELLED").length;
    const topN=Number(runMeta?.top_n||0)||10;
    let questCompleted=0,questTotal=0;
    for(const job of normalizedJobs){
      const playerCount=Number(job.player_count||0);
      const playerExpected=(job.phase==="RANKINGS"&&playerCount===0)?topN:playerCount;
      questCompleted+=Math.min(26,Math.max(0,Number(job.board_index||0)))+Math.max(0,Number(job.player_cursor||0));
      questTotal+=26+playerExpected;
    }
    if(!normalizedJobs.length&&targetCount) questTotal=targetCount*(26+topN);
    const questPercent=questTotal?Math.min(100,Math.round(questCompleted/questTotal*100)):0;
    const runStatus=String(runMeta?.status|| (lock ? "RUNNING" : "UNKNOWN"));
    const active=Boolean(lock)||runStatus==="RUNNING";

    return new Response(JSON.stringify({
      ok:true,active,run_id:runId,run_status:runStatus,
      started_at:Number(runMeta?.created_at||lock?.updated_at||0),
      expires_at:lock?.lock_until||null,
      target_count:targetCount,
      completed,success,failed,cancelled,
      quest_completed:questCompleted,quest_total:questTotal,quest_percent:questPercent,
      requested_concurrency:Number(runMeta?.requested_concurrency||0),
      concurrency:Number(runMeta?.concurrency||0),
      api_concurrency:Number(runMeta?.api_concurrency||0),
      api_active_count:Number(runMeta?.api_active_count||0),api_waiting_count:Number(runMeta?.api_waiting_count||0),api_pool_waiting_count:Number(runMeta?.api_pool_waiting_count||0),api_wait_events:Number(runMeta?.api_wait_events||0),api_pool_wait_events:Number(runMeta?.api_pool_wait_events||0),api_wait_ms:Number(runMeta?.api_wait_ms||0),api_pool_wait_ms:Number(runMeta?.api_pool_wait_ms||0),api_wait_min_ms:Number(runMeta?.api_wait_min_ms||0),api_wait_max_ms:Number(runMeta?.api_wait_max_ms||0),api_wait_buckets_json:String(runMeta?.api_wait_buckets_json||"{}"),last_activity_at:Number(runMeta?.last_activity_at||runMeta?.updated_at||0),
      top_n:Number(runMeta?.top_n||0),
      kids:runMeta?.kids_json?JSON.parse(runMeta.kids_json):normalizedJobs.map(j=>j.kid),
      recovery_mode:runMeta?"RUN_METADATA":"LOCK_ONLY",
      jobs:normalizedJobs
    }),{headers:{"content-type":"application/json; charset=UTF-8","cache-control":"no-store"}});
  } catch(error) {
    console.error("owner_kingdom_load_test_status_failed",error?.message||error);
    return new Response(JSON.stringify({ok:false,active:false,error:"LOAD_TEST_STATUS_UNAVAILABLE"}),{status:503,headers:{"content-type":"application/json; charset=UTF-8","cache-control":"no-store"}});
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

function createLoadTestApiLimiter(capacity) {
  const limit = Math.max(1, Math.floor(Number(capacity) || 1));
  const waiters = [];
  let active = 0, waitEvents = 0, totalWaitMs = 0, minWaitMs = 0, maxWaitMs = 0; const waitBuckets={"0-5s":0,"5-10s":0,"10-20s":0,"20-30s":0,"30-60s":0,"60s+":0};
  let poolWaitEvents = 0, poolWaitMs = 0, poolWaitActive = 0;
  return {
    capacity: limit,
    async acquire() {
      if (active < limit) { active += 1; return () => this.release(); }
      waitEvents += 1; const startedAt = Date.now();
      await new Promise(resolve => waiters.push(resolve));
      const waitedMs = Math.max(0, Date.now() - startedAt);
      totalWaitMs += waitedMs; minWaitMs=minWaitMs===0?waitedMs:Math.min(minWaitMs,waitedMs); maxWaitMs=Math.max(maxWaitMs,waitedMs); if(waitedMs<5000)waitBuckets["0-5s"]++;else if(waitedMs<10000)waitBuckets["5-10s"]++;else if(waitedMs<20000)waitBuckets["10-20s"]++;else if(waitedMs<30000)waitBuckets["20-30s"]++;else if(waitedMs<60000)waitBuckets["30-60s"]++;else waitBuckets["60s+"]++;
      active += 1; return () => this.release();
    },
    release() { if(active>0)active-=1; const next=waiters.shift(); if(next)next(); },
    markPoolWaitStart(){poolWaitActive+=1;poolWaitEvents+=1;return Date.now();},
    markPoolWaitEnd(startedAt){poolWaitActive=Math.max(0,poolWaitActive-1);if(startedAt)poolWaitMs+=Math.max(0,Date.now()-startedAt);},
    snapshot(){return {capacity:limit,active,waiting:waiters.length,wait_events:waitEvents,total_wait_ms:totalWaitMs,min_wait_ms:minWaitMs,max_wait_ms:maxWaitMs,wait_buckets:{...waitBuckets},pool_waiting:poolWaitActive,pool_wait_events:poolWaitEvents,pool_wait_ms:poolWaitMs};},
    get active(){return active;},get waiting(){return waiters.length;}
  };
}

async function runKingdomWatchlistLoad(env, kid, topN, runId, processJob, onProgress = null, apiLimiter = null) {
  const startedAt = Date.now();
  if (typeof processJob !== "function") return { run_id:runId, kid:Number(kid), ok:false, error:"KINGDOM_WATCHLIST_PROCESSOR_UNAVAILABLE", elapsed_ms:Date.now()-startedAt };

  const jobId = crypto.randomUUID();
  const watchlistId = "LOAD_TEST:" + runId;
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare("INSERT INTO kingdom_watchlist_jobs (job_id, watchlist_id, kid, top_n, status, board_index, player_cursor, player_ids_json, observed_at, source_first_at, source_last_at, ranking_rows, player_rows, created_at, updated_at) VALUES (?, ?, ?, ?, 'RANKINGS', 0, 0, '[]', ?, NULL, NULL, 0, 0, ?, ?)").bind(jobId, watchlistId, Number(kid), Number(topN), now, now, now).run();

  try {
    let iterations = 0;
    while (iterations++ < 200) {
      // Long tests (up to 1000 kingdoms) must keep the global run lock alive.
      // Without renewal, the fixed TTL could expire while the test is still running.
      await refreshLoadTestState(env.DB, runId).catch(() => {});
      if (await isLoadTestCancelled(env.DB, runId)) {
        await env.DB.prepare("UPDATE kingdom_watchlist_jobs SET status = 'FAILED', last_error = ?, updated_at = ? WHERE job_id = ?").bind("LOAD_TEST_CANCELLED", Math.floor(Date.now()/1000), jobId).run().catch(() => {});
        return { run_id:runId, job_id:jobId, kid:Number(kid), ok:false, cancelled:true, status:"CANCELLED", error:"LOAD_TEST_CANCELLED", elapsed_ms:Date.now()-startedAt };
      }
      const job = await env.DB.prepare("SELECT * FROM kingdom_watchlist_jobs WHERE job_id = ? LIMIT 1").bind(jobId).first();
      if (!job) throw new Error("LOAD_TEST_JOB_NOT_FOUND");
      if (job.status === "FAILED") throw new Error(String(job.last_error || "KINGDOM_WATCHLIST_JOB_FAILED"));
      if (job.status === "COMPLETED") return { run_id:runId, job_id:jobId, kid:Number(kid), ok:true, status:"COMPLETED", ranking_rows:Number(job.ranking_rows||0), player_rows:Number(job.player_rows||0), board_index:Number(job.board_index||0), elapsed_ms:Date.now()-startedAt };
      let step;
      try {
        step = await processJob(env, job, { reserveApiKeys: LOAD_TEST_NORMAL_RESERVE, apiLimiter });
      } catch (error) {
        if (String(error?.code || error?.message || "") === "API_POOL_LOAD_TEST_CAPACITY_WAIT") {
          // Keep the load test out of the reserved normal-use key. Re-check on
          // the next iteration instead of converting temporary contention into
          // a failed kingdom.
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }
        throw error;
      }
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
    const message = String(error?.message || error || "KINGDOM_WATCHLIST_JOB_FAILED").slice(0,1000);
    await env.DB.prepare("UPDATE kingdom_watchlist_jobs SET status = 'FAILED', last_error = ?, updated_at = ? WHERE job_id = ? AND status <> 'COMPLETED'")
      .bind(message, Math.floor(Date.now()/1000), jobId).run().catch(() => {});
    return { run_id:runId, job_id:jobId, kid:Number(kid), ok:false, status:"FAILED", error:message, elapsed_ms:Date.now()-startedAt };
  } finally {
    // Keep the job row durable exactly like the normal Kingdom Watchlist job.
    // The standard bounded retention cleanup removes terminal rows later.
  }
}
export async function handleOwnerKingdomLoadTestApi(request, env, auth, requestTraceId = null, processJob = null, executionContext = null) {
  if (!auth || auth.role !== "OWNER" || auth.status !== "ACTIVE") return new Response(JSON.stringify({ok:false,error:"OWNER_REQUIRED"}), {status:403,headers:{"content-type":"application/json"}});
  if (request.method !== "GET") return new Response(JSON.stringify({ok:false,error:"METHOD_NOT_ALLOWED"}), {status:405,headers:{"content-type":"application/json"}});
  const url=new URL(request.url), kids=parseKids(url.searchParams.get("kids"));
  const topN=Number(url.searchParams.get("top_n")||10)===5?5:10;
  if(typeof processJob!=="function")return new Response(JSON.stringify({ok:false,error:"KINGDOM_WATCHLIST_PROCESSOR_UNAVAILABLE"}),{status:503,headers:{"content-type":"application/json"}});
  if(!kids.length)return new Response(JSON.stringify({ok:false,error:"KINGDOMS_REQUIRED"}),{status:400,headers:{"content-type":"application/json"}});
  if(kids.length>MAX_KINGDOMS)return new Response(JSON.stringify({ok:false,error:"TOO_MANY_KINGDOMS",max:MAX_KINGDOMS}),{status:400,headers:{"content-type":"application/json"}});
  const startedAt=Date.now(),runId=crypto.randomUUID(),traceId=requestTraceId||systemTraceId("load");
  const poolBudget=await getApiPoolBudgetSnapshot(env.DB,{provider:"MIGHTPULSE",poolTypes:["SYSTEM_WATCHLIST","SYSTEM_GENERAL","USER_CONTRIBUTED"]});
  const availablePoolKeys=Number(poolBudget?.availableKeys||0);
  if(availablePoolKeys<2)return new Response(JSON.stringify({ok:false,error:"API_POOL_TEST_CAPACITY_INSUFFICIENT",message:"通常利用保護のため、ロードテストには少なくとも2本の利用可能なAPIキーが必要です。",available_pool_keys:availablePoolKeys,reserved_for_normal_use:LOAD_TEST_NORMAL_RESERVE}),{status:409,headers:{"content-type":"application/json; charset=UTF-8","cache-control":"no-store"}});
  const plannedRequests = Math.max(1, kids.length * (26 + topN));
  let cloudflareSafety = null;
  try {
    cloudflareSafety = await getCloudflareD1Usage(env, { includeQueryInsights: false });
  } catch (error) {
    cloudflareSafety = null;
  }
  const safety = evaluateSafetyGate({
    operation: "OWNER_KINGDOM_LOAD_TEST",
    priority: 10,
    plannedRequests,
    availablePoolKeys,
    reservedKeys: LOAD_TEST_NORMAL_RESERVE,
    cloudflare: cloudflareSafety,
    apiRemainingMinute: poolBudget?.remainingMinute ?? null,
    apiRemainingDay: poolBudget?.remainingDay ?? null,
    apiMinRemainingMinute: poolBudget?.minRemainingMinute ?? null,
    apiMinRemainingDay: poolBudget?.minRemainingDay ?? null,
    apiReserveMinute: poolBudget?.measuredReserveMinute ?? null,
    apiReserveDay: poolBudget?.measuredReserveDay ?? null,
    force: true
  });
  if(!safety.allowed)return new Response(JSON.stringify({ok:false,error:"SAFETY_GATE_BLOCKED",message:"Safety Gateによりロードテスト開始を停止しました。",safety}),{status:409,headers:{"content-type":"application/json; charset=UTF-8","cache-control":"no-store"}});
  // Global API budget: all kingdoms share Available - 1 reserved key.
  const apiConcurrency=Math.max(1,availablePoolKeys-LOAD_TEST_NORMAL_RESERVE);
  const concurrency=Math.min(kids.length,apiConcurrency);
  if(!await acquireLoadTestState(env.DB,runId))return new Response(JSON.stringify({ok:false,error:"LOAD_TEST_ALREADY_RUNNING",message:"現在、別の王国負荷テストが実行中です。"}),{status:409,headers:{"content-type":"application/json; charset=UTF-8","cache-control":"no-store"}});
  const runNow=Math.floor(Date.now()/1000);
  try{
    await env.DB.prepare("INSERT INTO kingdom_load_test_runs (run_id,target_count,kids_json,start_kid,end_kid,top_n,requested_concurrency,concurrency,api_concurrency,available_pool_keys,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,'RUNNING',?,?)")
      .bind(runId,kids.length,JSON.stringify(kids),Math.min(...kids),Math.max(...kids),topN,apiConcurrency,concurrency,apiConcurrency,availablePoolKeys,runNow,runNow).run();
  }catch(error){
    await releaseLoadTestState(env.DB,runId).catch(()=>{});
    return new Response(JSON.stringify({ok:false,error:"LOAD_TEST_RUN_METADATA_INSERT_FAILED",message:error?.message||String(error)}),{status:500,headers:{"content-type":"application/json; charset=UTF-8","cache-control":"no-store"}});
  }
  const encoder=new TextEncoder(),stream=new TransformStream(),writer=stream.writable.getWriter();
  let streamClosed=false;
  const send=async payload=>{
    if(streamClosed)return false;
    try{
      await writer.write(encoder.encode(JSON.stringify(payload)+"\n"));
      return true;
    }catch(error){
      // The OWNER may reload/navigate away while the server-side Run continues.
      // Client stream failure must not abort the D1/API load-test work.
      streamClosed=true;
      console.warn("owner_kingdom_load_test_stream_closed",runId,error?.message||String(error));
      return false;
    }
  };
  let runFailed=false,runSummary=null;
  const run=(async()=>{try{
    await send({type:"start",run_id:runId,target_count:kids.length,concurrency,api_concurrency:apiConcurrency,requested_concurrency:apiConcurrency,available_pool_keys:availablePoolKeys,reserved_for_normal_use:LOAD_TEST_NORMAL_RESERVE,mode:"KINGDOM_WATCHLIST_PIPELINE",top_n:topN,completed:0,success:0,failed:0,quest_completed:0,quest_total:kids.length*(26+topN),quest_percent:0});
    const apiLimiter=createLoadTestApiLimiter(apiConcurrency);
    apiLimiter.globalLimiter = createCollectionSemaphoreLimiter(env.DB, MAX_API_CONCURRENCY);
    let completed=0,success=0,failed=0;
    const metricsTimer=setInterval(()=>{persistLoadTestMetrics(env.DB,runId,apiLimiter).catch(()=>{});},2000);
    const questProgressByKid=new Map(),questTotalByKid=new Map(kids.map(kid=>[Number(kid),26+topN]));
    const getQuestProgress=()=>{let completedQuests=0,totalQuests=0;for(const kid of kids){const item=questProgressByKid.get(Number(kid))||{};completedQuests+=Number(item.completed||0);totalQuests+=Number(questTotalByKid.get(Number(kid))||26+topN);}return {completed_quests:completedQuests,total_quests:totalQuests,percent:totalQuests?Math.min(100,Math.round(completedQuests/totalQuests*100)):0};};
    const heartbeatTimer=setInterval(async()=>{const m=apiLimiter.snapshot(),q=getQuestProgress();await send({type:"heartbeat",run_id:runId,target_count:kids.length,completed,success,failed,quest_completed:q.completed_quests,quest_total:q.total_quests,quest_percent:q.percent,api_concurrency:apiLimiter.capacity,api_active_count:m.active,api_waiting_count:m.waiting,api_pool_waiting_count:m.pool_waiting,api_wait_events:m.wait_events,api_pool_wait_events:m.pool_wait_events,api_wait_ms:m.total_wait_ms,api_pool_wait_ms:m.pool_wait_ms,api_wait_min_ms:m.min_wait_ms,api_wait_max_ms:m.max_wait_ms,api_wait_buckets_json:JSON.stringify(m.wait_buckets||{})});},2000);
    const results=await runWithConcurrency(
      kids,
      concurrency,
      kid => runKingdomWatchlistLoad(
        env,
        kid,
        topN,
        runId,
        processJob,
        async progress => {
          const kidNumber=Number(progress.kid);
          const boardCompleted=Math.min(26,Math.max(0,Number(progress.board_index||0)));
          const playerCompleted=Math.max(0,Number(progress.player_cursor||0));
          const playerCount=Number(progress.player_count);
          if(progress.phase!=="RANKINGS"&&Number.isFinite(playerCount)&&playerCount>=0) questTotalByKid.set(kidNumber,26+playerCount);
          questProgressByKid.set(kidNumber,{completed:boardCompleted+playerCompleted});
          await persistLoadTestMetrics(env.DB,runId,apiLimiter);
          const apiMetrics=apiLimiter.snapshot(),q=getQuestProgress();
          await send({
            type:"job_progress",
            target_count:kids.length,
            completed,
            success,
            failed,
            percent:q.percent,
            quest_completed:q.completed_quests,
            quest_total:q.total_quests,
            quest_percent:q.percent,
            progress,api_concurrency:apiLimiter.capacity,api_active_count:apiMetrics.active,api_waiting_count:apiMetrics.waiting,api_pool_waiting_count:apiMetrics.pool_waiting,api_wait_events:apiMetrics.wait_events,api_pool_wait_events:apiMetrics.pool_wait_events,api_wait_ms:apiMetrics.total_wait_ms,api_pool_wait_ms:apiMetrics.pool_wait_ms,api_wait_min_ms:apiMetrics.min_wait_ms,api_wait_max_ms:apiMetrics.max_wait_ms,api_wait_buckets_json:JSON.stringify(apiMetrics.wait_buckets||{})
          });
        },
        apiLimiter
      ),
      async result => {
        completed++;
        if(result.ok) success++;
        else failed++;
        const q=getQuestProgress();
        await send({
          type:"progress",
          run_id:runId,
          target_count:kids.length,
          completed,
          success,
          failed,
          percent:q.percent,
          quest_completed:q.completed_quests,
          quest_total:q.total_quests,
          quest_percent:q.percent,
          result,api_concurrency:apiLimiter.capacity,api_active_count:apiLimiter.active,api_waiting_count:apiLimiter.waiting,api_pool_waiting_count:apiLimiter.snapshot().pool_waiting,api_wait_events:apiLimiter.snapshot().wait_events,api_pool_wait_events:apiLimiter.snapshot().pool_wait_events,api_wait_ms:apiLimiter.snapshot().total_wait_ms,api_pool_wait_ms:apiLimiter.snapshot().pool_wait_ms
        });
      }
    );
    clearInterval(metricsTimer);clearInterval(heartbeatTimer);
    const successfulResults=results.filter(item=>item?.ok),failedResults=results.filter(item=>!item?.ok),cancelledResults=results.filter(item=>item?.cancelled);
    const rankingRowsSaved=successfulResults.reduce((sum,item)=>sum+Number(item.ranking_rows||0),0),playerRowsSaved=successfulResults.reduce((sum,item)=>sum+Number(item.player_rows||0),0);
    const latencies=successfulResults.map(item=>Number(item.elapsed_ms)).filter(Number.isFinite),failureCodes={};
    for(const item of failedResults){const code=String(item?.error||"UNKNOWN");failureCodes[code]=(failureCodes[code]||0)+1;}
    const summary={run_id:runId,kingdom_count:kids.length,start_kid:Math.min(...kids),end_kid:Math.max(...kids),mode:"KINGDOM_WATCHLIST_PIPELINE",top_n:topN,concurrency,api_concurrency:apiConcurrency,requested_concurrency:apiConcurrency,available_pool_keys:availablePoolKeys,reserved_for_normal_use:LOAD_TEST_NORMAL_RESERVE,elapsed_ms:Date.now()-startedAt,success_count:success,failed_count:failed,ranking_rows_saved:rankingRowsSaved,player_rows_saved:playerRowsSaved,max_expected_ranking_rows:kids.length*26*100,latency_min_ms:latencies.length?Math.min(...latencies):null,latency_max_ms:latencies.length?Math.max(...latencies):null,latency_avg_ms:latencies.length?Math.round(latencies.reduce((a,b)=>a+b,0)/latencies.length):null,failure_codes:failureCodes,result_sample:failedResults.slice(0,50).map(item=>({kid:item.kid,error:item.error}))};
    runSummary=summary;
    await recordServiceUsage(env,{operation:"OWNER_KINGDOM_LOAD_TEST",actorUserId:auth.user_id,targetType:"USER",targetId:auth.user_id,metadata:summary});
    await recordSystemEvent(env.DB,{traceId,eventType:"LOAD_TEST",service:"load_test",feature:"owner_kingdom_load_test",operation:"COMPLETE",status:failed?"COMPLETED_WITH_ERRORS":"COMPLETED",actorType:"OWNER",actorId:auth.user_id,targetType:"KINGDOM_BATCH",targetId:String(kids.length),elapsedMs:summary.elapsed_ms,message:failed?"OWNER王国Watchlist実処理負荷テスト完了（一部失敗あり）":"OWNER王国Watchlist実処理負荷テスト完了",metadata:summary});
    await send({type:cancelledResults.length?"cancelled":"complete",run_id:runId,ok:true,cancelled:Boolean(cancelledResults.length),target_count:kids.length,concurrency,api_concurrency:apiConcurrency,top_n:topN,elapsed_ms:summary.elapsed_ms,success,failed,cancelled_count:cancelledResults.length,ranking_rows_saved:rankingRowsSaved,player_rows_saved:playerRowsSaved,max_expected_ranking_rows:summary.max_expected_ranking_rows,results});
  }catch(error){runFailed=true;await recordSystemEvent(env.DB,{traceId,eventType:"LOAD_TEST",service:"load_test",feature:"owner_kingdom_load_test",operation:"RUN",status:"FAILED",actorType:"OWNER",actorId:auth.user_id,targetType:"KINGDOM_BATCH",targetId:String(kids.length),elapsedMs:Date.now()-startedAt,errorCode:error?.code||"LOAD_TEST_FAILED",message:error?.message||"王国Watchlist実処理負荷テスト失敗",metadata:{runId,targetCount:kids.length,mode:"KINGDOM_WATCHLIST_PIPELINE",topN}});await send({type:"error",run_id:runId,ok:false,error:String(error?.message||error||"LOAD_TEST_FAILED").slice(0,1000)});}finally{
    clearInterval(metricsTimer);
    await persistLoadTestMetrics(env.DB,runId,apiLimiter,true);
    const finalNow=Math.floor(Date.now()/1000);
    await env.DB.prepare("UPDATE kingdom_load_test_runs SET status = CASE WHEN EXISTS (SELECT 1 FROM kingdom_watchlist_jobs WHERE watchlist_id = ? AND status = 'FAILED' AND last_error = 'LOAD_TEST_CANCELLED') THEN 'CANCELLED' WHEN ? = 1 THEN 'FAILED' ELSE 'COMPLETED' END, success_count = ?, failed_count = ?, ranking_rows_saved = ?, player_rows_saved = ?, elapsed_ms = ?, updated_at = ?, completed_at = ? WHERE run_id = ?").bind("LOAD_TEST:"+runId,runFailed ? 1 : 0,Number(runSummary?.success_count||0),Number(runSummary?.failed_count||0),Number(runSummary?.ranking_rows_saved||0),Number(runSummary?.player_rows_saved||0),Date.now()-startedAt,finalNow,finalNow,runId).run().catch(()=>{});
    await clearLoadTestCancellation(env.DB,runId);await releaseLoadTestState(env.DB,runId).catch(error=>console.error("owner_kingdom_load_test_state_release_failed",error?.message||String(error)));await writer.close().catch(()=>{});
}})();
  // Keep the server-side Run alive when the iPhone Web App closes the stream on reload.
  if (executionContext?.waitUntil) executionContext.waitUntil(run);
  return new Response(stream.readable,{headers:{"content-type":"application/x-ndjson; charset=UTF-8","cache-control":"no-store, no-cache, must-revalidate","x-accel-buffering":"no"}});
}
export function renderOwnerKingdomLoadTestPage() {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EagleEye 王国Watchlist実処理負荷テスト</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:760px;margin:auto;padding:28px 16px 48px}.toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:2px}.back{color:#94a3b8;text-decoration:none}.reload-btn{margin:0;padding:8px 12px;border:1px solid #475569;border-radius:9px;background:#111827;color:#e2e8f0;font-weight:800;font-size:13px}.reload-btn:active{transform:scale(.98)}.reload-btn:disabled{opacity:.58}.badge{display:inline-block;margin-top:16px;padding:6px 10px;border:1px solid #f59e0b;border-radius:999px;color:#fbbf24;background:#241a08;font-size:12px;font-weight:900}.card{margin-top:18px;padding:18px;border:1px solid #334155;border-radius:16px;background:#162238}.hint{color:#94a3b8;line-height:1.7;font-size:13px}label{display:block;margin-top:14px;color:#cbd5e1;font-size:13px}input,select{width:100%;margin-top:7px;padding:12px;border-radius:9px;border:1px solid #334155;background:#0b1220;color:#fff}button{margin-top:16px;padding:12px 16px;border:0;border-radius:9px;background:#f59e0b;color:#111827;font-weight:900}button:disabled{opacity:.58;cursor:not-allowed}.warning{margin-top:14px;padding:12px;border-radius:10px;border:1px solid #7c5b13;background:#211a0a;color:#f8d27a;font-size:12px;line-height:1.7}#progress{display:none;margin-top:16px}.progress{margin:14px 0;padding:15px;border:1px solid #334155;border-radius:14px;background:#0b1220;display:grid;gap:5px}.progress b{font-size:14px}.progress span{font-size:23px;font-weight:950;color:#f59e0b}.progress small{color:#94a3b8}.progress-track{height:7px;border-radius:999px;background:#334155;overflow:hidden;margin-top:4px}.progress-fill{height:100%;border-radius:999px;background:#f59e0b;transition:width .2s}.active-jobs{display:grid;gap:0;max-height:520px;overflow:auto}#result{white-space:pre-wrap;overflow:auto;margin-top:16px;padding:14px;border-radius:10px;background:#0b1220;color:#cbd5e1;font-size:12px;line-height:1.6}.history{margin-top:18px;padding:15px;border:1px solid #334155;border-radius:14px;background:#0b1220}.history h2{margin:0 0 10px;font-size:16px}.history-list{display:grid;gap:9px}.history-item{padding:11px;border:1px solid #334155;border-radius:10px;background:#111b2d}.history-main{display:flex;justify-content:space-between;gap:8px;font-weight:800}.history-meta{margin-top:5px;color:#94a3b8;font-size:12px;line-height:1.6}.history-ok{color:#86efac}.history-failed{color:#fca5a5}.history-running{color:#fbbf24}</style></head><body><main class="wrap"><div class="toolbar"><a class="back" href="/admin/api-pool">← API Pool管理へ戻る</a><button type="button" id="reloadPage" class="reload-btn" onclick="window.__eagleEyeReloadPage()">↻ 再読み込み</button></div><div class="badge">OWNER ONLY</div><h1>王国Watchlist実処理負荷テスト</h1><p class="hint">実際の王国ウォッチリスト更新と同じ取得・比較・保存パイプラインを実行します。ランキング26ボード、上位プレイヤー取得、D1現在値更新、Change Event、R2履歴保存まで本番と同じ処理を通します。</p><div class="warning">テストで生成されたランキング・プレイヤー・履歴データは削除しません。後からユーザーが検索した場合にそのまま利用できるようにします。テスト用Jobも通常の王国Watchlist Jobと同じくD1へ保存し、終了後24時間の保持期間を経て通常の保持期限処理で削除します。</div><div class="card"><label>開始王国番号<input id="startKid" type="number" min="1" step="1" value="1500"></label><label>取得王国数<select id="kidCount"><option value="20" selected>20王国</option><option value="40">40王国</option><option value="60">60王国</option><option value="80">80王国</option><option value="100">100王国</option><option value="200">200王国</option><option value="300">300王国</option><option value="400">400王国</option><option value="500">500王国</option><option value="600">600王国</option><option value="700">700王国</option><option value="800">800王国</option><option value="900">900王国</option><option value="1000">1000王国</option></select></label><button type="button" onclick="window.__eagleEyeBuildKids()" style="background:#334155;color:#fff">王国範囲を生成</button><div id="selectedKids" style="margin-top:10px;color:#cbd5e1;font-size:12px;line-height:1.7"></div><label>王国番号（直接入力可）<input id="kids" placeholder="1500,1501,1502"></label><label>上位プレイヤー取得数<select id="topN"><option value="5">5人</option><option value="10" selected>10人</option></select></label><div class="hint" style="margin:8px 0">API同時処理数は自動決定：実際の利用可能キー数 − 通常利用保護1本。複数の王国Jobが同時に進み、ランキング・プレイヤーのAPIリクエストは全王国でこのAPI枠を共有します。空いた枠は完了したリクエストから即座に次の取得へ回します。</div><button type="button" id="run" onclick="window.__eagleEyeRunLoadTest()">王国Watchlist実処理を実行</button><button type="button" id="cancel" onclick="window.__eagleEyeCancelLoadTest()" disabled style="background:#7f1d1d;color:#fff;margin-left:8px">負荷テストを中止</button><div id="progress"><div class="progress"><b id="progressTitle">APIクエスト進捗</b><span id="progressCount">0 / 0</span><div class="progress-track"><div class="progress-fill" id="progressFill"></div></div><small id="progressMeta">処理状況を取得中…</small></div><div id="activeJobs"></div></div><div id="result">結果はここに表示されます。</div><div class="history"><h2>過去の負荷テスト</h2><div id="historyList" class="history-list"><div class="history-meta">履歴を取得中…</div></div></div></div><script>(function(){window.__eagleEyeLoadTestUiToken=0;function parseKids(raw){return [...new Set(String(raw||"").split(/[\\s,、]+/).map(function(v){return v.trim();}).filter(function(v){return /^\\d+$/.test(v);}).map(Number).filter(function(v){return v>0;}))];}function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(ch){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch];});}function phaseText(p){return p==="RANKINGS"?"ランキング":p==="PLAYERS"?"プレイヤー":"完了";}
function formatWaitMs(ms){ms=Number(ms||0);if(ms<1000)return ms+"ms";var sec=Math.round(ms/1000);if(sec<60)return sec+"秒";var min=Math.floor(sec/60),rest=sec%60;return min+"分"+(rest?rest+"秒":"");}
function apiMetricsText(data){var cap=Number(data.api_concurrency||0),active=Number(data.api_active_count||0),waiting=Number(data.api_waiting_count||0),poolWaiting=Number(data.api_pool_waiting_count||0);var totalWait=Number(data.api_wait_ms||0)+Number(data.api_pool_wait_ms||0);return "API使用 "+active+" / "+cap+"　待ち "+waiting+"　Pool待ち "+poolWaiting+"　累計待機 "+formatWaitMs(totalWait)+"　最小 "+formatWaitMs(data.api_wait_min_ms)+"　最大 "+formatWaitMs(data.api_wait_max_ms);}
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
  var total=Number(data.quest_total||0),done=Number(data.quest_completed||0),pct=Number.isFinite(Number(data.quest_percent))?Math.min(100,Math.max(0,Number(data.quest_percent))):(total?Math.min(100,Math.round(done/total*100)):0);
  count.textContent="APIクエスト "+done+" / "+total+"　("+pct+"%)";
  fill.style.width=pct+"%";
  title.textContent="APIクエスト進捗";
  meta.textContent="王国完了 "+Number(data.completed||0)+" / "+Number(data.target_count||0)+"　成功 "+Number(data.success||0)+" / 失敗 "+Number(data.failed||0)+"　"+apiMetricsText(data)+"　通常利用保護 "+LOAD_TEST_NORMAL_RESERVE+"本";
  var rows=Object.keys(active).map(function(k){return active[k];}).filter(function(x){return !x.completed;}).sort(function(a,b){return Number(a.kid)-Number(b.kid);});
  list.innerHTML=rows.length?rows.map(renderJobProgress).join(""):"";
}
function formatHistoryTime(ts){if(!ts)return "-";try{return new Date(Number(ts)*1000).toLocaleString("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});}catch(e){return "-";}}
function renderLoadTestHistory(runs){var list=document.getElementById("historyList");if(!list)return;if(!runs||!runs.length){list.innerHTML='<div class="history-meta">過去の負荷テストはありません。</div>';return;}list.innerHTML=runs.map(function(run){var status=String(run.status||"UNKNOWN"),label=status==="COMPLETED"&&Number(run.failed_count||0)>0?"一部失敗":status==="COMPLETED"?"成功":status==="COMPLETED_WITH_ERRORS"?"一部失敗":status==="CANCELLED"?"中止":status==="FAILED"?"失敗":status==="RUNNING"?"実行中":status;var cls=status==="COMPLETED"?"history-ok":status==="RUNNING"?"history-running":"history-failed";return '<div class="history-item"><div class="history-main"><span>'+esc(formatHistoryTime(run.created_at))+'</span><span class="'+cls+'">'+esc(label)+'</span></div><div class="history-meta">'+esc(run.target_count)+'王国（'+esc(run.start_kid)+'〜'+esc(run.end_kid)+'）　成功 '+esc(run.success_count)+' / 失敗 '+esc(run.failed_count)+'<br>API同時 '+esc(run.api_concurrency)+'　Pool Available '+esc(run.available_pool_keys)+'　上位 '+esc(run.top_n)+'人<br>ランキング '+esc(run.ranking_rows_saved)+' rows　プレイヤー '+esc(run.player_rows_saved)+' rows　所要 '+esc(run.elapsed_ms==null?"-":run.elapsed_ms+"ms")+'<br>API待機 '+esc(formatWaitMs(Number(run.api_wait_ms||0)+Number(run.api_pool_wait_ms||0)))+'　最小 '+esc(formatWaitMs(run.api_wait_min_ms))+'　最大 '+esc(formatWaitMs(run.api_wait_max_ms))+'<br>待ち発生 '+esc(run.api_wait_events||0)+'回　Pool待ち '+esc(run.api_pool_wait_events||0)+'回</div><div style="margin-top:8px"><a href="/api/owner/kingdom-load-test/export?run_id='+encodeURIComponent(run.run_id)+'" download style="display:inline-block;padding:7px 10px;border-radius:8px;background:#334155;color:#fff;text-decoration:none;font-size:12px;font-weight:800">CSVエクスポート</a></div></div>';}).join("");}
async function loadLoadTestHistory(){try{var response=await fetch("/api/owner/kingdom-load-test/history?limit=20",{cache:"no-store",credentials:"same-origin"});if(!response.ok){var detail="HTTP "+response.status;try{var body=await response.json();detail=body.message||body.error||detail;}catch(e){}throw new Error(detail);}var data=await response.json();renderLoadTestHistory(data.runs||[]);}catch(e){var list=document.getElementById("historyList");if(list)list.innerHTML='<div class="history-meta">履歴取得失敗: '+esc(e&&e.message||e)+'</div>';}}
window.__eagleEyeReloadPage=function(){var button=document.getElementById("reloadPage");if(button){button.disabled=true;button.textContent="↻ 読み込み中…";}window.location.reload();};window.__eagleEyeBuildKids=function(){var start=Math.max(1,Number(document.getElementById("startKid").value||0)),count=Math.max(1,Number(document.getElementById("kidCount").value||20)),values=[];for(var i=0;i<count;i++)values.push(start+i);document.getElementById("kids").value=values.join(",");document.getElementById("selectedKids").textContent=values.join(", ");};window.__eagleEyeCancelLoadTest=async function(){try{var response=await fetch("/api/owner/kingdom-load-test/cancel",{method:"POST",credentials:"same-origin",cache:"no-store"});var data=await response.json();if(!response.ok)throw new Error(data.message||data.error||"CANCEL_FAILED");document.getElementById("result").textContent="中止要求を送信しました。現在のAPI処理完了後、安全に停止します。";document.getElementById("cancel").disabled=true;}catch(e){document.getElementById("result").textContent="中止要求失敗: "+e.message;}};window.__eagleEyeRunLoadTest=async function(){window.__eagleEyeLoadTestUiToken++;if(window.__eagleEyeLoadTestStatusTimer){clearInterval(window.__eagleEyeLoadTestStatusTimer);window.__eagleEyeLoadTestStatusTimer=null;}var trace=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():"client-"+Date.now(),run=document.getElementById("run"),cancel=document.getElementById("cancel"),result=document.getElementById("result"),active={};try{var kids=parseKids(document.getElementById("kids").value);if(!kids.length){window.__eagleEyeBuildKids();kids=parseKids(document.getElementById("kids").value);}if(!kids.length)throw new Error("王国番号を入力してください。");var topN=document.getElementById("topN").value||"10";try{localStorage.setItem("eagleEye.loadTest.runId","");}catch(e){}run.disabled=true;run.textContent="実行中…";cancel.disabled=false;result.textContent="処理開始…";document.getElementById("progress").style.display="block";document.getElementById("progressCount").textContent="APIクエスト 0 / "+(kids.length*(26+Number(topN)))+"　(0%)";document.getElementById("progressFill").style.width="0%";document.getElementById("activeJobs").innerHTML="";var response=await fetch("/api/owner/kingdom-load-test?kids="+encodeURIComponent(kids.join(","))+"&top_n="+topN,{cache:"no-store",credentials:"same-origin",headers:{"x-eagle-eye-trace-id":trace}});if(!response.ok){var detail="HTTP "+response.status;try{var body=await response.json();detail=body.message||body.error||detail;}catch(e){}throw new Error(detail);}var reader=response.body.getReader(),decoder=new TextDecoder(),buffer="";while(true){var chunk=await reader.read();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true});var lines=buffer.split("\\n");buffer=lines.pop()||"";for(var i=0;i<lines.length;i++){if(!lines[i].trim())continue;var data=JSON.parse(lines[i]);if(data.type==="start"){try{localStorage.setItem("eagleEye.loadTest.runId",String(data.run_id||""));}catch(e){}result.textContent="処理開始…\\n"+data.target_count+"王国 / API同時 "+data.api_concurrency+" / 通常保護1本 / 上位"+data.top_n+"人";renderProgress(data,active);}else if(data.type==="job_progress"){active[String(data.progress.kid)]=data.progress;renderProgress(data,active);}else if(data.type==="heartbeat"){renderProgress(Object.assign({},data,{target_count:data.target_count,success:data.success,failed:data.failed,api_concurrency:data.api_concurrency||0}),active);
result.textContent="処理中…\\nAPIクエスト "+data.quest_completed+" / "+data.quest_total+" ("+data.quest_percent+"%)\\n王国完了 "+data.completed+" / "+data.target_count+"\\nAPI待機メトリクスを自動更新中";}else if(data.type==="progress"){active[String(data.result.kid)]=Object.assign({},active[String(data.result.kid)]||{},data.result,{completed:true,phase:"COMPLETED"});renderProgress(data,active);result.textContent="処理中… "+data.percent+"%\\n"+data.completed+" / "+data.target_count+"王国\\n成功 "+data.success+" / 失敗 "+data.failed+"\\n直近: 王国"+data.result.kid+" / ranking "+data.result.ranking_rows+" / player "+data.result.player_rows;}else if(data.type==="cancelled"){result.textContent="負荷テスト中止\\n完了 "+data.success+" / 失敗 "+data.failed+" / 中止 "+data.cancelled_count+"王国\\n経過 "+data.elapsed_ms+"ms";var finalData=Object.assign({},data,{completed:data.target_count,success:data.success,failed:data.failed,concurrency:data.concurrency});renderProgress(finalData,active);document.getElementById("progressTitle").textContent="中止";document.getElementById("progressMeta").textContent="完了 "+data.success+" / 失敗 "+data.failed+" / 中止 "+data.cancelled_count+"　API同時処理 "+Number(data.api_concurrency||0)+"　通常利用保護1本";}else if(data.type==="complete"){result.textContent="処理完了\\n成功 "+data.success+" / 失敗 "+data.failed+"\\n経過 "+data.elapsed_ms+"ms\\nランキング保存 "+data.ranking_rows_saved+" rows\\nプレイヤー保存 "+data.player_rows_saved+" rows\\n最大想定ランキング "+data.max_expected_ranking_rows+" rows\\n\\n"+JSON.stringify(data,null,2);var finalData=Object.assign({},data,{completed:data.target_count,success:data.success,failed:data.failed,concurrency:data.concurrency});renderProgress(finalData,active);document.getElementById("progressTitle").textContent="✓ 更新完了";document.getElementById("progressMeta").textContent="成功 "+data.success+" / 失敗 "+data.failed+"　API同時処理 "+Number(data.api_concurrency||0)+"　通常利用保護1本";}else if(data.type==="error")throw new Error(data.error||"LOAD_TEST_FAILED");}}}catch(error){
  // Surface HTTP/preflight failures instead of leaving the UI at "処理開始…".
  // This is especially important for Safety Gate/API Pool/D1 failures.
  result.textContent="負荷テスト開始失敗\\n"+String(error&&error.message||error||"LOAD_TEST_FAILED");
}finally{
  // Do not blindly hide the cancel button on an unexpected stream close.
  // Re-check server state first; the server-side job may still be running.
  try{
    var stateResponse=await fetch("/api/owner/kingdom-load-test/status",{cache:"no-store",credentials:"same-origin"});
    var state=stateResponse.ok?await stateResponse.json():null;
    if(state&&state.active){
      run.disabled=true;run.textContent="実行中…";cancel.disabled=false;
      result.textContent="サーバー側で処理継続中…\\n"+Number(state.completed||0)+" / "+Number(state.target_count||0)+"王国\\n中止ボタンから安全に停止できます。";
      recoverRunningLoadTest();
      return;
    }
  }catch(e){}
  run.disabled=false;run.textContent="王国Watchlist実処理を実行";cancel.disabled=true;
}};async function recoverRunningLoadTest(){
  var recoveryToken=window.__eagleEyeLoadTestUiToken;
  try{
    var storedRunId="";
    try{storedRunId=String(localStorage.getItem("eagleEye.loadTest.runId")||"").trim();}catch(e){}
    var endpoint="/api/owner/kingdom-load-test/status"+(storedRunId?"?run_id="+encodeURIComponent(storedRunId):"");
    var response=await fetch(endpoint,{cache:"no-store",credentials:"same-origin"});
    if(recoveryToken!==window.__eagleEyeLoadTestUiToken)return;
    if(!response.ok)return;
    var data=await response.json();
    if(!data.run_id)return;

    if(recoveryToken!==window.__eagleEyeLoadTestUiToken)return;
    var run=document.getElementById("run"),cancel=document.getElementById("cancel"),result=document.getElementById("result"),active={};
    (data.jobs||[]).forEach(function(job){active[String(job.kid)]=job;});
    document.getElementById("progress").style.display="block";
    renderProgress(Object.assign({},data,{concurrency:data.concurrency||0,api_concurrency:data.api_concurrency||0}),active);

    if(data.active){
      run.disabled=true;run.textContent="実行中…";cancel.disabled=false;
      result.textContent="実行中…\\n"+data.completed+" / "+data.target_count+"王国\\n成功 "+data.success+" / 失敗 "+data.failed+" / 中止 "+data.cancelled+"\\nD1保存済みの進捗を表示中";
      window.__eagleEyeLoadTestStatusTimer=setInterval(async function(){
        try{
          var r=await fetch("/api/owner/kingdom-load-test/status",{cache:"no-store",credentials:"same-origin"});if(!r.ok)return;
          var d=await r.json();
          if(recoveryToken!==window.__eagleEyeLoadTestUiToken){clearInterval(window.__eagleEyeLoadTestStatusTimer);return;}
          if(!d.run_id){clearInterval(window.__eagleEyeLoadTestStatusTimer);return;}
          active={};(d.jobs||[]).forEach(function(job){active[String(job.kid)]=job;});
          renderProgress(Object.assign({},d,{concurrency:d.concurrency||0}),active);
          if(d.active){
            result.textContent="実行中…\\n"+d.completed+" / "+d.target_count+"王国\\n成功 "+d.success+" / 失敗 "+d.failed+" / 中止 "+d.cancelled+"\\nD1保存済みの進捗を表示中";
          }else{
            result.textContent=(d.run_status==="CANCELLED"?"負荷テスト中止":"処理完了")+"\\n"+d.completed+" / "+d.target_count+"王国\\n成功 "+d.success+" / 失敗 "+d.failed+" / 中止 "+d.cancelled+"\\nD1保存済みの最終状態を表示中";
            document.getElementById("progressTitle").textContent=d.run_status==="CANCELLED"?"中止":"✓ 更新完了";
            document.getElementById("progressMeta").textContent="成功 "+d.success+" / 失敗 "+d.failed+" / 中止 "+d.cancelled+"　API同時処理 "+Number(d.api_concurrency||0);
            clearInterval(window.__eagleEyeLoadTestStatusTimer);
            run.disabled=false;run.textContent="王国Watchlist実処理を実行";cancel.disabled=true;
          }
        }catch(e){}
      },2000);
    }else{
      result.textContent=(data.run_status==="CANCELLED"?"負荷テスト中止":"処理完了")+"\\n"+data.completed+" / "+data.target_count+"王国\\n成功 "+data.success+" / 失敗 "+data.failed+" / 中止 "+data.cancelled+"\\nD1保存済みの最終状態を表示中";
      document.getElementById("progressTitle").textContent=data.run_status==="CANCELLED"?"中止":"✓ 更新完了";
      document.getElementById("progressMeta").textContent="成功 "+data.success+" / 失敗 "+data.failed+" / 中止 "+data.cancelled+"　Job同時実行 "+Number(data.api_concurrency||0);
    }
  }catch(e){}
}
window.__eagleEyeBuildKids();
loadLoadTestHistory();
recoverRunningLoadTest();})();</script></main></body></html>`;
}