import { EAGLEEYE_THEME_BASE_CSS } from "./eagleeye-ui.js";
export async function renderKingdomCatalogPage(request, env) {
  const url = new URL(request.url);
  const pageSize = 50;
  const rawPage = Number(url.searchParams.get("page") || "1");
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const q = String(url.searchParams.get("q") || "").trim().slice(0, 80);
  const suggest = url.searchParams.get("suggest") === "1";
  if (suggest) {
    const term = q;
    const suggestionRows = q ? await env.DB.prepare("SELECT kid,name,status,region,language,last_seen_at,r2_latest_key FROM kingdom_catalog WHERE (CAST(kid AS TEXT) LIKE ? OR name LIKE ?) ORDER BY CASE WHEN CAST(kid AS TEXT) = ? THEN 0 WHEN CAST(kid AS TEXT) LIKE ? THEN 1 ELSE 2 END, kid ASC LIMIT 50")
      .bind(term + "%", "%" + term + "%", q, term + "%").all() : { results: [] };
    return new Response(JSON.stringify({ ok: true, kingdoms: (suggestionRows.results || []).map(row => ({ kid: row.kid, name: row.name || "", status: row.status || "", region: row.region || "", language: row.language || "", last_seen_at: row.last_seen_at || null, has_r2: !!row.r2_latest_key })) }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  }
  const status = String(url.searchParams.get("status") || "").trim().slice(0, 40);
  const sortRaw = String(url.searchParams.get("sort") || "kid");
  const sortMap = { kid:"kid ASC", kid_desc:"kid DESC", name:"name COLLATE NOCASE ASC", updated:"last_seen_at DESC, kid ASC" };
  const orderBy = sortMap[sortRaw] || sortMap.kid;
  const where = [];
  const binds = [];
  if (status) { where.push("status = ?"); binds.push(status); }
  if (q) {
    if (/^\d+$/.test(q)) { where.push("kid = ?"); binds.push(Number(q)); }
    else { where.push("(name LIKE ? OR CAST(kid AS TEXT) LIKE ?)"); binds.push("%"+q+"%","%"+q+"%"); }
  }
  const whereSql = where.length ? " WHERE " + where.join(" AND ") : "";
  const currentPage = page;
  const offset = (currentPage - 1) * pageSize;
  const rows = await env.DB.prepare("SELECT kid,name,status,region,language,last_seen_at,r2_latest_key FROM kingdom_catalog"+whereSql+" ORDER BY "+orderBy+" LIMIT ? OFFSET ?").bind(...binds,pageSize + 1,offset).all();
  const rawRows = rows.results || [];
  const hasNext = rawRows.length > pageSize;
  const kingdoms = rawRows.slice(0,pageSize);
  const catalogSummary = await env.DB.prepare("SELECT MAX(kid) AS max_kid FROM kingdom_catalog").first();
  const catalogMaxKid = Number(catalogSummary?.max_kid || 0);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const fmt = value => value ? new Date(Number(value)*1000).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}) : "—";
  const query = p => { const x=new URLSearchParams(); if(q)x.set("q",q); if(status)x.set("status",status); if(sortRaw!=="kid")x.set("sort",sortRaw); x.set("page",String(p)); return "?"+x.toString(); };

  const cards = kingdoms.map(row => "<article class='card'><div class='head'><div><a class='kid' href='/kingdom?kid="+encodeURIComponent(row.kid)+"'>王国 "+esc(row.kid)+"</a><div class='name'>"+esc(row.name||"名称未取得")+"</div></div><span class='status'>"+esc(row.status||"—")+"</span></div><div class='meta'><span>"+esc(row.region||"—")+"</span><span>"+esc(row.language||"—")+"</span><span>最終更新 "+esc(fmt(row.last_seen_at))+"</span><span>"+(row.r2_latest_key?"詳細R2あり":"詳細未保存")+"</span></div><div class='actions'><a href='/kingdom?kid="+encodeURIComponent(row.kid)+"'>王国詳細 →</a><button type='button' data-kid='"+esc(row.kid)+"'>＋ウォッチリスト</button></div></article>").join("");
  const prev = currentPage>1 ? "<a class='pager-btn' href='"+query(currentPage-1)+"'>← 前へ</a>" : "<span class='pager-btn disabled'>← 前へ</span>";
  const next = hasNext ? "<a class='pager-btn' href='"+query(currentPage+1)+"'>次へ →</a>" : "<span class='pager-btn disabled'>次へ →</span>";
  const kingdomCatalogClientScript = String.raw`(function(){
const input=document.getElementById('kingdom-query'),form=input&&input.form,list=document.querySelector('.list'),count=document.querySelector('.count'),pager=document.querySelector('.pager');
if(!input||!form||!list||!count)return;
let timer=0,controller=null,lastQuery=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>v?new Date(Number(v)*1000).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
function card(x){return "<article class='card'><div class='head'><div><a class='kid' href='/kingdom?kid="+encodeURIComponent(x.kid)+"'>王国 "+esc(x.kid)+"</a><div class='name'>"+esc(x.name||"名称未取得")+"</div></div><span class='status'>"+esc(x.status||"—")+"</span></div><div class='meta'><span>"+esc(x.region||"—")+"</span><span>"+esc(x.language||"—")+"</span><span>最終更新 "+esc(fmt(x.last_seen_at))+"</span><span>"+(x.has_r2?"詳細R2あり":"詳細未保存")+"</span></div><div class='actions'><a href='/kingdom?kid="+encodeURIComponent(x.kid)+"'>王国詳細 →</a><button type='button' data-kid='"+esc(x.kid)+"'>＋ウォッチリスト</button></div></article>";}
function restore(){if(lastQuery===null)return;location.href='/kingdom-catalog'+(new URLSearchParams({q:lastQuery}).toString()?('?q='+encodeURIComponent(lastQuery)):'');}
function filter(){
clearTimeout(timer);if(controller)controller.abort();
const q=input.value.trim();
if(!q){if(lastQuery!==null)location.href='/kingdom-catalog';return;}
lastQuery=q;
timer=setTimeout(async()=>{
controller=new AbortController();
try{
const response=await fetch('/kingdom-catalog?suggest=1&q='+encodeURIComponent(q),{signal:controller.signal,headers:{accept:'application/json'},cache:'no-store'});
if(!response.ok)throw new Error('HTTP '+response.status);
const data=await response.json();if(input.value.trim()!==q)return;
const rows=Array.isArray(data.kingdoms)?data.kingdoms:[];
rows.sort((a,b)=>String(a.kid)===q?-1:String(b.kid)===q?1:Number(a.kid)-Number(b.kid));
list.innerHTML=rows.length?rows.map(card).join(''):"<div class='empty'>条件に一致する王国はありません。</div>";
count.textContent='検索結果 '+rows.length+'王国'+(rows.length===50?'以上':'');
if(pager)pager.style.display='none';
}catch(e){if(e.name!=='AbortError'&&input.value.trim()===q){count.textContent='検索結果を取得できません。検索ボタンで検索してください。';}}
},160);
}
input.addEventListener('input',filter);
input.addEventListener('compositionend',filter);
form.addEventListener('submit',()=>{if(pager)pager.style.display='';});
document.addEventListener('click',function(e){if(e.target.closest('#kingdom-suggestions'))e.preventDefault();});
})();
document.querySelectorAll('[data-kid]').forEach(function(button){button.addEventListener('click',async function(){button.disabled=true;try{const r=await fetch('/api/kingdom-watchlist?action=create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kid:Number(button.dataset.kid),top_n:10,interval_hours:6})});const d=await r.json();if(r.status===401){location.href='/api/auth/discord';return}if(!r.ok||!d.ok)throw new Error(d.message||d.error||'登録に失敗しました');button.textContent='✓ 登録済み';}catch(e){alert(e.message||e);button.disabled=false;}})});`;
  return "<!doctype html><html lang='ja'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>王国カタログ | EagleEye</title><style>:root{color-scheme:dark}*{box-sizing:border-box}"+EAGLEEYE_THEME_BASE_CSS+"body{margin:0;background:#0a1424;color:#e8f3ff;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.wrap{max-width:820px;margin:auto;padding:24px 14px 48px}.back{color:#94a3b8;text-decoration:none}.eyebrow{margin-top:24px;color:#22d3ee;font-size:11px;font-weight:900;letter-spacing:2px}.title{margin:5px 0 8px;font-size:30px}.sub{color:#94a3b8;line-height:1.6}.search{display:flex;gap:7px;margin-top:16px}.query-wrap{position:relative;min-width:0;flex:1}.query-wrap input{width:100%}.suggestions{position:absolute;z-index:20;top:calc(100% + 5px);left:0;right:0;max-height:300px;overflow:auto;border:1px solid #2a4664;border-radius:12px;background:#0b192b;box-shadow:0 12px 28px #0008}.suggestions[hidden]{display:none}.suggestion{display:block;width:100%;padding:11px 12px;border:0;border-bottom:1px solid #23364d;background:transparent;color:#e8f3ff;text-align:left}.suggestion:last-child{border-bottom:0}.suggestion strong{display:block;font-size:14px}.suggestion small{display:block;margin-top:3px;color:#94a3b8;font-size:12px}.suggestion:focus,.suggestion:hover{background:#15314a;outline:none}.search input,.search select{min-width:0;flex:1;padding:10px;border:1px solid #2a4664;border-radius:9px;background:#0b192b;color:#fff}.search button{border:0;border-radius:9px;background:#22d3ee;color:#062033;font-weight:900;padding:10px 14px}.count{margin-top:14px;color:#cbd5e1;font-size:13px}.count{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px}.catalog-max{padding:3px 8px;border:1px solid var(--ee-border)!important;border-radius:999px;color:var(--ee-subtext)!important;font-size:11px}.page-count{margin-left:auto;color:var(--ee-subtext)!important;font-size:11px}@media(max-width:420px){.page-count{width:100%;margin-left:0}}.list{display:grid;gap:10px;margin-top:12px}.card{padding:15px;border:1px solid #334155;border-radius:14px;background:#0f2035}.head{display:flex;justify-content:space-between;gap:12px}.kid{font-size:17px;font-weight:900;color:#fff;text-decoration:none}.name{margin-top:3px;color:#cbd5e1;font-size:13px}.status{padding:4px 8px;border:1px solid #475569;border-radius:999px;color:#cbd5e1;font-size:10px;font-weight:800}.meta{display:flex;flex-wrap:wrap;gap:7px 14px;margin-top:10px;color:#64748b;font-size:11px}.actions{display:flex;gap:7px;margin-top:12px}.actions a,.actions button{padding:7px 10px;border:1px solid #475569;border-radius:8px;background:#111c31;color:#cbd5e1;text-decoration:none;font-size:11px;font-weight:800}.pager{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:18px}.pager-btn{display:inline-block;padding:8px 12px;border:1px solid #475569;border-radius:9px;color:#cbd5e1;text-decoration:none;font-size:12px;font-weight:800}.pager-btn.disabled{opacity:.35}.pager-info{color:#64748b;font-size:11px}.empty{margin-top:18px;padding:20px;border:1px dashed #475569;border-radius:14px;color:#94a3b8;text-align:center}@media(max-width:600px){.search{flex-wrap:wrap}.search input{flex-basis:100%}}\n/* Shared-theme alignment: page layout stays local; surfaces and controls use EagleEye tokens. */\nbody{background:var(--ee-bg)!important;color:var(--ee-text)!important}\n.back{color:var(--ee-subtext)!important}\n.eyebrow{color:var(--ee-cyan)!important}\n.sub,.count,.pager-info{color:var(--ee-subtext)!important}\n.search input,.search select{font-size:16px!important;line-height:1.4; border-color:var(--ee-border)!important;background:var(--ee-panel-deep)!important;color:var(--ee-text)!important;border-radius:var(--ee-radius-sm)!important}\n/* iOS Safari zooms the page when a focused form control uses text smaller than 16px. */\n.search input,.search select{font-size:16px!important;-webkit-text-size-adjust:100%}\n.search button,.actions a,.actions button,.pager-btn{border:1px solid var(--ee-border)!important;border-radius:var(--ee-radius-sm)!important;background:var(--ee-panel-raised)!important;color:var(--ee-text)!important;font-weight:800!important}\n.search button{background:var(--ee-cyan)!important;border-color:var(--ee-cyan)!important;color:#062033!important}\n.card{border-color:var(--ee-border-soft)!important;border-radius:var(--ee-radius-md)!important;background:var(--ee-panel)!important;color:var(--ee-text)!important}\n.kid{color:var(--ee-text)!important}\n.name,.meta,.empty{color:var(--ee-subtext)!important}\n.status{border-color:var(--ee-border)!important;color:var(--ee-subtext)!important}\n.actions a:hover,.actions button:hover,.pager-btn:hover{border-color:var(--ee-cyan)!important;filter:brightness(1.06)}\n.suggestions{max-height:min(260px,42vh)!important;border:1px solid var(--ee-border)!important;border-radius:12px!important;background:var(--ee-panel)!important;box-shadow:0 10px 24px #0009!important;overflow-y:auto!important;overscroll-behavior:contain}.suggestion{min-height:0!important;padding:9px 12px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;border-bottom:1px solid var(--ee-border-soft)!important;background:var(--ee-panel)!important;color:var(--ee-text)!important;text-align:left!important}.suggestion strong{flex:0 0 auto!important;font-size:14px!important;font-weight:800!important;white-space:nowrap}.suggestion small{min-width:0!important;margin:0!important;font-size:11px!important;color:var(--ee-subtext)!important;text-align:right!important;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.suggestion:focus,.suggestion:hover,.suggestion.active{background:var(--ee-panel-raised)!important;box-shadow:inset 3px 0 var(--ee-cyan)!important;outline:none!important}.suggestion:only-child{justify-content:flex-start!important}.suggestion:only-child small{text-align:left!important;white-space:normal!important}@media(max-width:600px){.suggestions{max-height:250px!important}.suggestion{padding:10px 12px!important;min-height:48px!important}.suggestion small{max-width:58%!important}}\n</style></head><body><main class='wrap'><a class='back' href='/'>← EagleEye</a><div class='eyebrow'>KINGDOM PORTAL</div><h1 class='title'>王国カタログ</h1><p class='sub'>KID・王国名で検索し、王国詳細からランキング・同盟・Watchlistへ進みます。</p><form class='search' method='get' action='/kingdom-catalog' autocomplete='off'><div class='query-wrap'><input id='kingdom-query' name='q' value='"+esc(q)+"' placeholder='KID / 王国名' aria-label='KID / 王国名' aria-autocomplete='list' aria-controls='kingdom-suggestions' aria-expanded='false'><div id='kingdom-suggestions' hidden></div></div><input name='status' value='"+esc(status)+"' placeholder='Status（任意）'><select name='sort'><option value='kid'>KID昇順</option><option value='kid_desc'"+(sortRaw==='kid_desc'?" selected":"")+">KID降順</option><option value='name'"+(sortRaw==='name'?" selected":"")+">名前順</option><option value='updated'"+(sortRaw==='updated'?" selected":"")+">最終更新順</option></select><button>検索</button></form><div class='count'><span class='catalog-max'>最大王国番号：KID "+(catalogMaxKid?catalogMaxKid.toLocaleString("ja-JP"):"—")+"</span><span class='page-count'>表示 "+kingdoms.length+"王国 / "+currentPage+"ページ"+(hasNext?" / 次ページあり":"")+"</span></div><div class='list'>"+(cards||"<div class='empty'>条件に一致する王国はありません。</div>")+"</div>"+(kingdoms.length||currentPage>1?"<div class='pager'>"+prev+"<span class='pager-info'>"+currentPage+"ページ</span>"+next+"</div>":"")+"</main><script>"+kingdomCatalogClientScript+"</script></body></html>";
}