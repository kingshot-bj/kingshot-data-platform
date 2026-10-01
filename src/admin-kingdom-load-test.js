import { getMightPulseKingdomRanks } from "./mightpulse.js";
import { configureApiPoolEncryption, leaseApiKey, recordApiPoolSuccess, recordApiPoolFailure } from "./api-pool.js";

const MAX_KINGDOMS = 20;
const MAX_CONCURRENCY = 5;
const DEFAULT_CONCURRENCY = 3;

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[char]));
}

function parseKids(raw) {
  return [...new Set(String(raw || "")
    .split(/[\\s,、]+/)
    .map(value => value.trim())
    .filter(value => /^\\d+$/.test(value))
    .map(Number)
    .filter(value => value > 0))];
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runner() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runner()));
  return results;
}

async function runKingdomLoad(env, kid, board) {
  let lease = null;
  try {
    configureApiPoolEncryption(env.EAGLEEYE_SESSION_SECRET);
    let poolType = "SYSTEM_WATCHLIST";
    try {
      lease = await leaseApiKey(env.DB, {
        poolType,
        purpose: "OWNER_LOAD_TEST",
        targetType: "KINGDOM",
        targetId: String(kid)
      });
    } catch (error) {
      if (error?.message !== "NO_API_POOL_KEY_AVAILABLE") throw error;
      poolType = "SYSTEM_GENERAL";
      lease = await leaseApiKey(env.DB, {
        poolType,
        purpose: "OWNER_LOAD_TEST",
        targetType: "KINGDOM",
        targetId: String(kid)
      });
    }

    const startedAt = Date.now();
    const result = await getMightPulseKingdomRanks(env, String(kid), {
      board,
      limit: 100,
      apiKey: lease.api_key
    });
    const elapsedMs = Date.now() - startedAt;
    const payload = result?.data || {};
    const entries = Array.isArray(payload?.data) ? payload.data.length :
      Array.isArray(payload?.rankings) ? payload.rankings.length :
      Array.isArray(payload?.results) ? payload.results.length : null;

    await recordApiPoolSuccess(env.DB, {
      keyId: lease.key_id,
      leaseId: lease.lease_id,
      poolType: lease.pool_type,
      endpoint: "/kingdoms/:kid/ranks",
      targetType: "KINGDOM",
      targetId: String(kid),
      purpose: "OWNER_LOAD_TEST",
      httpStatus: result.status
    });

    return {
      kid: Number(kid),
      ok: true,
      status: result.status,
      pool_type: poolType,
      entry_count: entries,
      elapsed_ms: elapsedMs
    };
  } catch (error) {
    if (lease) {
      const status = Number(error?.status || 0);
      const cooldown = status === 429 ? 60 : status >= 500 || error?.code === "MIGHTPULSE_TIMEOUT" || error?.code === "MIGHTPULSE_NETWORK_ERROR" ? 15 : 0;
      const disable = status === 401 || status === 403;
      const keepAvailable = !disable && cooldown === 0 && (status === 400 || status === 404);
      await recordApiPoolFailure(env.DB, {
        keyId: lease.key_id,
        leaseId: lease.lease_id,
        poolType: lease.pool_type,
        endpoint: "/kingdoms/:kid/ranks",
        targetType: "KINGDOM",
        targetId: String(kid),
        purpose: "OWNER_LOAD_TEST",
        httpStatus: status,
        errorCode: error?.code || "MIGHTPULSE_RANKING_REQUEST_FAILED",
        errorMessage: error?.message || null,
        cooldownSeconds: cooldown,
        disable,
        keepAvailable
      });
    }
    return {
      kid: Number(kid),
      ok: false,
      status: Number(error?.status || 0),
      error: error?.code || error?.message || "MIGHTPULSE_RANKING_REQUEST_FAILED"
    };
  }
}

export async function handleOwnerKingdomLoadTestApi(request, env, auth) {
  if (!auth || auth.role !== "OWNER" || auth.status !== "ACTIVE") return new Response(JSON.stringify({ok:false,error:"OWNER_REQUIRED"}), {status:403,headers:{"content-type":"application/json"}});
  if (request.method !== "GET") return new Response(JSON.stringify({ ok:false, error:"METHOD_NOT_ALLOWED" }), { status:405, headers:{"content-type":"application/json"} });

  const url = new URL(request.url);
  const kids = parseKids(url.searchParams.get("kids"));
  const board = String(url.searchParams.get("board") || "").trim();
  const concurrency = Math.min(Math.max(Number(url.searchParams.get("concurrency") || DEFAULT_CONCURRENCY), 1), MAX_CONCURRENCY);

  if (!board) return new Response(JSON.stringify({ ok:false, error:"BOARD_REQUIRED" }), { status:400, headers:{"content-type":"application/json"} });
  if (!kids.length) return new Response(JSON.stringify({ ok:false, error:"KINGDOMS_REQUIRED" }), { status:400, headers:{"content-type":"application/json"} });
  if (kids.length > MAX_KINGDOMS) return new Response(JSON.stringify({ ok:false, error:"TOO_MANY_KINGDOMS", max:MAX_KINGDOMS }), { status:400, headers:{"content-type":"application/json"} });

  const startedAt = Date.now();
  const results = await runWithConcurrency(kids, concurrency, kid => runKingdomLoad(env, kid, board));
  const elapsedMs = Date.now() - startedAt;
  const success = results.filter(item => item.ok).length;
  const failed = results.length - success;

  return new Response(JSON.stringify({
    ok: true,
    target_count: kids.length,
    concurrency,
    board,
    elapsed_ms: elapsedMs,
    success,
    failed,
    results
  }), { headers:{ "content-type":"application/json; charset=UTF-8", "cache-control":"no-store" } });
}

export function renderOwnerKingdomLoadTestPage() {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EagleEye 王国並列負荷テスト</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:760px;margin:auto;padding:28px 16px 48px}.back{color:#94a3b8;text-decoration:none}.badge{display:inline-block;margin-top:16px;padding:6px 10px;border:1px solid #f59e0b;border-radius:999px;color:#fbbf24;background:#241a08;font-size:12px;font-weight:900}.card{margin-top:18px;padding:18px;border:1px solid #334155;border-radius:16px;background:#162238}.hint{color:#94a3b8;line-height:1.7;font-size:13px}label{display:block;margin-top:14px;color:#cbd5e1;font-size:13px}input,select{width:100%;margin-top:7px;padding:12px;border-radius:9px;border:1px solid #334155;background:#0b1220;color:#fff}button{margin-top:16px;padding:12px 16px;border:0;border-radius:9px;background:#f59e0b;color:#111827;font-weight:900}#result{white-space:pre-wrap;overflow:auto;margin-top:16px;padding:14px;border-radius:10px;background:#0b1220;color:#cbd5e1;font-size:12px;line-height:1.6}</style></head><body><main class="wrap"><a class="back" href="/admin/api-pool">← API Pool管理へ戻る</a><div class="badge">OWNER ONLY</div><h1>王国並列負荷テスト</h1><p class="hint">指定した複数王国へMightPulse王国ランキング取得を並列実行します。API Poolのリース・MightPulse応答・Worker処理時間を確認するためのOWNER専用テストです。</p><div class="card"><label>王国番号プリセット<select id="kidPreset"><option value="">王国を追加…</option><option value="1000">1000</option><option value="1100">1100</option><option value="1200">1200</option><option value="1300">1300</option><option value="1400">1400</option><option value="1500">1500</option><option value="1600">1600</option><option value="1700">1700</option><option value="1800">1800</option><option value="1900">1900</option><option value="2000">2000</option><option value="2100">2100</option><option value="2200">2200</option><option value="2300">2300</option><option value="2400">2400</option><option value="2500">2500</option><option value="2600">2600</option><option value="2700">2700</option><option value="2800">2800</option><option value="2900">2900</option><option value="3000">3000</option></select></label><div id="selectedKids" style="display:flex;flex-wrap:wrap;gap:7px;margin-top:10px"></div><label>王国番号（直接入力も可・カンマ/改行/空白区切り）<input id="kids" placeholder="1524, 1600, 1700"></label><label>ランキング<select id="board"><option value="personal_power">個人総力</option><option value="kills">個人撃破</option><option value="town_center">役場Lv.</option><option value="hero_total">英雄全体総力</option><option value="troop_power">部隊総力</option></select></label><label>同時実行数<select id="concurrency"><option value="1">1</option><option value="2">2</option><option value="3" selected>3</option><option value="4">4</option><option value="5">5</option></select></label><button id="run">並列取得テストを実行</button><div id="result">結果はここに表示されます。</div></div><script>
const run=document.getElementById("run"), result=document.getElementById("result"), preset=document.getElementById("kidPreset"), kidsInput=document.getElementById("kids"), selected=document.getElementById("selectedKids"); const selectedKids=new Set();
function renderSelected(){selected.innerHTML=Array.from(selectedKids).map(function(kid){return "<button type=\"button\" data-kid=\""+kid+"\" style=\"margin:0;padding:7px 10px;background:#334155;color:#fff;border:1px solid #475569;border-radius:999px\">"+kid+" ×</button>";}).join("");selected.querySelectorAll("[data-kid]").forEach(function(button){button.addEventListener("click",function(){selectedKids.delete(Number(button.dataset.kid));renderSelected();});});kidsInput.value=Array.from(selectedKids).join(", ");}
preset.addEventListener("change",function(){const kid=Number(preset.value);if(kid){selectedKids.add(kid);renderSelected();}preset.value="";});
run.addEventListener("click",async()=>{const kids=kidsInput.value,board=document.getElementById("board").value,concurrency=document.getElementById("concurrency").value;run.disabled=true;run.textContent="実行中…";result.textContent="取得中…";try{const response=await fetch("/api/owner/kingdom-load-test?kids="+encodeURIComponent(kids)+"&board="+encodeURIComponent(board)+"&concurrency="+encodeURIComponent(concurrency),{cache:"no-store"});const data=await response.json();result.textContent=JSON.stringify(data,null,2);}catch(error){result.textContent="ERROR: "+error.message;}finally{run.disabled=false;run.textContent="並列取得テストを実行";}});
</script></main></body></html>`;
}
