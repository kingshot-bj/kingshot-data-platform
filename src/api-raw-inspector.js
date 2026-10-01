function isSecretKey(key) {
  return /(?:api[_-]?key|authorization|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|cookie|private[_-]?key)/i.test(String(key || ""));
}

function sanitizeRaw(value, parentKey = "") {
  if (isSecretKey(parentKey)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map(item => sanitizeRaw(item, parentKey));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, child] of Object.entries(value)) out[key] = sanitizeRaw(child, key);
    return out;
  }
  if (typeof value === "string" && /^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      for (const key of [...url.searchParams.keys()]) {
        if (/(?:token|key|secret|signature|sig|auth)/i.test(key)) url.searchParams.set(key, "[REDACTED]");
      }
      return url.toString();
    } catch {}
  }
  return value;
}

function collectImageRefs(value, path = "$", out = []) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^data:image\//i.test(trimmed)) {
      out.push({ path, value: trimmed, kind: "data-uri" });
    } else if (/^https?:\/\//i.test(trimmed) && /\.(?:png|jpe?g|webp|gif|svg|avif)(?:[?#].*)?$/i.test(trimmed)) {
      out.push({ path, value: trimmed, kind: "url" });
    }
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectImageRefs(item, path + "[" + index + "]", out));
    return out;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, child]) => collectImageRefs(child, path + "." + key, out));
  }
  return out;
}

export async function handleApiRawDataApi(request, env, auth) {
  if (!auth || auth.status !== "ACTIVE" || !["ADMIN", "OWNER"].includes(String(auth.role || "").toUpperCase())) {
    return Response.json({ ok: false, error: "ADMIN_REQUIRED" }, { status: 403 });
  }
  if (request.method !== "GET") return Response.json({ ok: false, error: "METHOD_NOT_ALLOWED" }, { status: 405 });
  if (!env?.DB) return Response.json({ ok: false, error: "D1_NOT_CONFIGURED" }, { status: 500 });

  const url = new URL(request.url);
  const governorId = String(url.searchParams.get("governor_id") || "").trim();
  const observationId = String(url.searchParams.get("observation_id") || "").trim();
  if (!/^\d{1,30}$/.test(governorId)) {
    return Response.json({ ok: false, error: "INVALID_GOVERNOR_ID" }, { status: 400 });
  }

  try {
    let row;
    if (observationId) {
      row = await env.DB.prepare(
        `SELECT observation_id, provider, endpoint, target_type, target_id, observed_at, source_observed_at, http_status, payload_json, created_at
         FROM api_observations
         WHERE provider = 'MIGHTPULSE' AND target_type = 'PLAYER' AND target_id = ? AND observation_id = ?
         LIMIT 1`
      ).bind(governorId, observationId).first();
    } else {
      row = await env.DB.prepare(
        `SELECT observation_id, provider, endpoint, target_type, target_id, observed_at, source_observed_at, http_status, payload_json, created_at
         FROM api_observations
         WHERE provider = 'MIGHTPULSE' AND target_type = 'PLAYER' AND target_id = ?
         ORDER BY observed_at DESC
         LIMIT 1`
      ).bind(governorId).first();
    }
    if (!row) return Response.json({ ok: false, error: "OBSERVATION_NOT_FOUND" }, { status: 404 });

    let payload;
    try {
      payload = JSON.parse(row.payload_json);
    } catch {
      return Response.json({ ok: false, error: "INVALID_STORED_JSON" }, { status: 500 });
    }

    const safePayload = sanitizeRaw(payload);
    const images = collectImageRefs(safePayload);
    return Response.json({
      ok: true,
      observation: {
        observation_id: row.observation_id,
        provider: row.provider,
        endpoint: row.endpoint,
        target_type: row.target_type,
        target_id: row.target_id,
        observed_at: row.observed_at,
        source_observed_at: row.source_observed_at,
        http_status: row.http_status,
        created_at: row.created_at
      },
      payload: safePayload,
      image_refs: images.slice(0, 200)
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, error: "API_RAW_DATA_FAILED", message: String(error?.message || error).slice(0, 300) }, { status: 500 });
  }
}

export async function handleApiRawHistoryApi(request, env, auth) {
  if (!auth || auth.status !== "ACTIVE" || !["ADMIN", "OWNER"].includes(String(auth.role || "").toUpperCase())) {
    return Response.json({ ok: false, error: "ADMIN_REQUIRED" }, { status: 403 });
  }
  if (request.method !== "GET") return Response.json({ ok: false, error: "METHOD_NOT_ALLOWED" }, { status: 405 });
  if (!env?.DB) return Response.json({ ok: false, error: "D1_NOT_CONFIGURED" }, { status: 500 });
  const governorId = String(new URL(request.url).searchParams.get("governor_id") || "").trim();
  if (!/^\d{1,30}$/.test(governorId)) return Response.json({ ok: false, error: "INVALID_GOVERNOR_ID" }, { status: 400 });
  try {
    const result = await env.DB.prepare(
      `SELECT observation_id, observed_at, source_observed_at, http_status, endpoint, created_at
       FROM api_observations
       WHERE provider = 'MIGHTPULSE' AND target_type = 'PLAYER' AND target_id = ?
       ORDER BY observed_at DESC
       LIMIT 20`
    ).bind(governorId).all();
    return Response.json({
      ok: true,
      governor_id: governorId,
      observations: (result.results || []).map(row => ({
        observation_id: row.observation_id,
        observed_at: row.observed_at,
        source_observed_at: row.source_observed_at,
        http_status: row.http_status,
        endpoint: row.endpoint,
        created_at: row.created_at
      }))
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, error: "API_RAW_HISTORY_FAILED", message: String(error?.message || error).slice(0, 300) }, { status: 500 });
  }
}

export function renderApiRawDataPage(auth) {
  const role = String(auth?.role || "").toUpperCase();
  if (!["ADMIN", "OWNER"].includes(role)) {
    return `<!doctype html><html lang="ja"><body style="background:#0f172a;color:#fff;font-family:system-ui;padding:32px"><h1>ADMIN権限が必要です</h1><a href="/" style="color:#f59e0b">EagleEyeへ戻る</a></body></html>`;
  }
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EagleEye API Raw Inspector</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:1100px;margin:auto;padding:20px 14px 50px}.top{display:flex;justify-content:space-between;align-items:center;gap:12px}.back{color:#94a3b8;text-decoration:none}.badge{padding:6px 9px;border:1px solid #f59e0b;border-radius:999px;color:#fbbf24;font-size:11px;font-weight:900}.eyebrow{margin-top:22px;color:#f59e0b;font-size:11px;font-weight:900;letter-spacing:2px}.title{margin:4px 0 8px;font-size:29px}.sub{color:#94a3b8;line-height:1.6}.card{margin-top:14px;padding:15px;border:1px solid #334155;border-radius:14px;background:#162238}.toolbar{display:flex;gap:8px}.toolbar input{flex:1;min-width:0;padding:11px;border-radius:9px;border:1px solid #475569;background:#0b1220;color:#fff}.btn{padding:10px 13px;border:0;border-radius:9px;background:#f59e0b;color:#111827;font-weight:900;cursor:pointer}.btn.secondary{background:#334155;color:#e2e8f0}.btn:disabled{opacity:.55}.meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.meta div{padding:9px;border:1px solid #334155;border-radius:9px;background:#0b1220}.meta small{display:block;color:#94a3b8;font-size:10px}.meta b{display:block;margin-top:3px;font-size:12px;overflow-wrap:anywhere}.history{display:grid;gap:7px;margin-top:10px}.history button{width:100%;text-align:left;padding:10px;border:1px solid #334155;border-radius:9px;background:#0b1220;color:#e2e8f0;cursor:pointer}.history button.active{border-color:#f59e0b}.history small{display:block;color:#94a3b8;margin-top:3px}.raw{white-space:pre-wrap;word-break:break-word;font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;background:#080d18;border:1px solid #334155;border-radius:10px;padding:12px;max-height:650px;overflow:auto}.images{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}.image-card{border:1px solid #334155;border-radius:10px;background:#0b1220;padding:9px;overflow:hidden}.image-card img{display:block;width:100%;height:170px;object-fit:contain;background:#020617;border-radius:7px}.image-card .path{margin-top:8px;color:#f8fafc;font:11px/1.4 ui-monospace,monospace;word-break:break-all}.image-card .src{margin-top:4px;color:#94a3b8;font:10px/1.35 ui-monospace,monospace;word-break:break-all}.empty{color:#94a3b8;font-size:13px}.warn{color:#fbbf24;font-size:12px;line-height:1.5}@media(max-width:650px){.wrap{padding:16px 10px 42px}.meta{grid-template-columns:1fr 1fr}.toolbar{flex-direction:column}.toolbar .btn{min-height:42px}.image-card img{height:150px}}
</style></head><body><main class="wrap"><div class="top"><a class="back" href="/admin">← ADMIN CONTROL</a><div class="badge">ADMIN / OWNER</div></div><div class="eyebrow">RAW OBSERVATION</div><h1 class="title">API Raw Inspector</h1><p class="sub">保存済みのMightPulse API観測データを、加工せず確認するための調査画面。画像参照は実画像プレビューで照合できます。</p>
<div class="card"><div class="toolbar"><input id="gov" inputmode="numeric" placeholder="Governor ID"><button class="btn" id="load">最新を表示</button></div><div class="warn" style="margin-top:9px">APIキー・Token・Secret等の認証情報だけは安全のためマスキングします。画像URLも署名系クエリはマスキングされる場合があります。</div></div>
<div class="card"><h2 style="margin-top:0">観測履歴（最新20件）</h2><div id="history" class="history"><div class="empty">Governor IDを入力してください。</div></div></div>
<div class="card"><h2 style="margin-top:0">観測メタデータ</h2><div id="meta" class="meta"><div class="empty">未選択</div></div></div>
<div class="card"><h2 style="margin-top:0">画像リソース</h2><div id="images" class="images"><div class="empty">観測を選択すると、JSON内の画像URLを自動抽出します。</div></div></div>
<div class="card"><h2 style="margin-top:0">Raw JSON</h2><div id="raw" class="raw">未選択</div></div>
</main>
<script>
(function(){
const gov=document.getElementById("gov"),load=document.getElementById("load"),history=document.getElementById("history"),meta=document.getElementById("meta"),images=document.getElementById("images"),raw=document.getElementById("raw");
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=t=>t?new Date(Number(t)*1000).toLocaleString("ja-JP",{hour12:false}):"-";
async function fetchHistory(id){const r=await fetch("/api/admin/api-raw-history?governor_id="+encodeURIComponent(id),{cache:"no-store",credentials:"same-origin"});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||"履歴取得失敗");return d.observations||[]}
async function fetchRaw(id,obs){const q="/api/admin/api-raw-data?governor_id="+encodeURIComponent(id)+(obs?"&observation_id="+encodeURIComponent(obs):"");const r=await fetch(q,{cache:"no-store",credentials:"same-origin"});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||"Raw取得失敗");return d}
function drawHistory(list,active){history.innerHTML=list.length?list.map(x=>"<button type='button' class='"+(x.observation_id===active?"active":"")+"' data-id='"+esc(x.observation_id)+"'>"+fmt(x.observed_at)+" · HTTP "+esc(x.http_status)+"<small>"+esc(x.observation_id)+" · "+esc(x.endpoint||"-")+"</small></button>").join(""):"<div class='empty'>観測データがありません。</div>";history.querySelectorAll("button").forEach(b=>b.onclick=()=>select(b.dataset.id))}
function drawMeta(o){meta.innerHTML="<div><small>Observation ID</small><b>"+esc(o.observation_id)+"</b></div><div><small>Observed At</small><b>"+fmt(o.observed_at)+"</b></div><div><small>Source Observed At</small><b>"+fmt(o.source_observed_at)+"</b></div><div><small>HTTP Status</small><b>"+esc(o.http_status)+"</b></div><div><small>Endpoint</small><b>"+esc(o.endpoint)+"</b></div><div><small>Target</small><b>"+esc(o.target_type)+" / "+esc(o.target_id)+"</b></div>"}
function drawImages(refs){images.innerHTML=refs.length?refs.map((x,i)=>"<article class='image-card'><img loading='lazy' src='"+esc(x.value)+"' alt='Raw asset "+(i+1)+"' onerror='this.style.display="none";this.nextElementSibling.innerHTML+="<br><span style=\\"color:#fbbf24\\">画像を直接表示できません（URL/アクセス制限等）</span>"'><div class='path'>"+esc(x.path)+"</div><div class='src'>"+esc(x.value)+"</div></article>").join(""):"<div class='empty'>JSON内に直接表示可能な画像URL / data:image は検出されませんでした。</div>"}
async function select(obs){try{load.disabled=true;const d=await fetchRaw(gov.value.trim(),obs);drawMeta(d.observation);drawImages(d.image_refs||[]);raw.textContent=JSON.stringify(d.payload,null,2);const list=await fetchHistory(gov.value.trim());drawHistory(list,d.observation.observation_id)}catch(e){history.innerHTML="<div class='empty'>"+esc(e.message)+"</div>"}finally{load.disabled=false}}
async function loadLatest(){const id=gov.value.trim();if(!/^[0-9]{1,30}$/.test(id)){history.innerHTML="<div class='empty'>Governor IDを入力してください。</div>";return}try{load.disabled=true;const d=await fetchRaw(id);drawMeta(d.observation);drawImages(d.image_refs||[]);raw.textContent=JSON.stringify(d.payload,null,2);try{const list=await fetchHistory(id);drawHistory(list,d.observation.observation_id)}catch(historyError){history.innerHTML="<div class='empty'>観測履歴の取得に失敗しました: "+esc(historyError.message)+"<br>最新Rawデータは表示しています。</div>"}}catch(e){history.innerHTML="<div class='empty'>Rawデータ取得失敗: "+esc(e.message)+"</div>";meta.innerHTML="<div class='empty'>取得失敗</div>";images.innerHTML="<div class='empty'>取得失敗</div>";raw.textContent=""}finally{load.disabled=false}}
load.onclick=loadLatest;gov.addEventListener("keydown",e=>{if(e.key==="Enter")loadLatest()});
const initial=new URLSearchParams(location.search).get("governor_id");if(initial){gov.value=initial;loadLatest()}
})();
</script></body></html>`;
}
