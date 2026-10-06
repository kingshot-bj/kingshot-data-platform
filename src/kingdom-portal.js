import { collectMightPulseThroughGuards } from "./data-collection-engine.js";
import { recordSystemEvent, systemTraceId } from "./system-log.js";

const BOARDS = [
  ["personal_power","個人総力"],["kills","個人撃破"],["town_center","役場Lv."],["hero_total","英雄全体総力"],
  ["troop_power","部隊総力"],["building_power","建物総力"],["research_power","研究総力"],["hero_no_equip","英雄総力（装備なし）"],
  ["hero_equip","英雄総力（装備あり）"],["gov_gear","領主装備"],["gov_charm","領主チャーム"],["pet_power","ペット総力"],
  ["island_prosperity","島の繁栄"],["migrant_score","移民スコア"],["mystic_trial","神秘試練"],["coliseum","コロシアム"],
  ["forest_of_life","生命の森"],["crystal_cave","クリスタル洞窟"],["knowledge_nexus","知識の核"],["molten_fort","溶融要塞"],
  ["radiant_spire","輝きの尖塔"],["master_power","マスター総力"],["rebel_conquest","反乱軍討伐"],["single_hero","単英雄総力"],
  ["alliance_power","同盟総力"],["alliance_kills","同盟撃破"]
];

function esc(v) {
  return String(v ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("ja-JP") : "—";
}
function ts(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"}) : "—";
}
async function readR2Json(bucket, key) {
  if (!bucket || !key) return null;
  const obj = await bucket.get(key);
  if (!obj?.body) return null;
  let body = obj.body;
  if (String(obj.httpMetadata?.contentEncoding || "").toLowerCase() === "gzip" && typeof DecompressionStream !== "undefined") {
    body = body.pipeThrough(new DecompressionStream("gzip"));
  }
  const text = await new Response(body).text();
  const line = text.split("\n").find(Boolean);
  if (!line) return null;
  return JSON.parse(line);
}
async function catalogRow(db, kid) {
  return db.prepare(
    "SELECT kid,name,status,region,language,source_observed_at,first_seen_at,last_seen_at,updated_at,r2_latest_key FROM kingdom_catalog WHERE kid = ? LIMIT 1"
  ).bind(Number(kid)).first();
}

export async function renderKingdomDetailPage(request, env) {
  const url = new URL(request.url);
  const kidText = String(url.searchParams.get("kid") || "").trim();
  if (!/^\d+$/.test(kidText)) return page("王国詳細", "<div class='empty'>王国IDを指定してください。</div>");
  const kid = Number(kidText);
  const row = await catalogRow(env.DB, kid);
  if (!row) return page("王国詳細", "<div class='empty'>王国カタログに該当王国がありません。<a href='/kingdom-catalog'>王国カタログへ</a></div>");

  let archived = null;
  try { archived = await readR2Json(env.ARCHIVE, row.r2_latest_key); } catch {}
  const payload = archived?.payload || {};
  const detail = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  const boards = await env.DB.prepare(
    "SELECT board, COUNT(*) AS rows, MAX(last_checked_at) AS last_checked_at, MAX(source_observed_at) AS source_observed_at FROM kingdom_ranking_board_state WHERE kid = ? GROUP BY board ORDER BY board"
  ).bind(kid).all();
  const topPlayers = await env.DB.prepare(
    "SELECT rank,target_id,governor_id,nick_name,score,aid,abbr,name,previous_rank FROM kingdom_ranking_current WHERE kid = ? AND board = 'personal_power' AND target_type = 'PLAYER' ORDER BY rank ASC LIMIT 10"
  ).bind(kid).all();
  const topAlliances = await env.DB.prepare(
    "SELECT rank,target_id,aid,abbr,name,score,previous_rank FROM kingdom_ranking_current WHERE kid = ? AND board = 'alliance_power' AND target_type = 'ALLIANCE' ORDER BY rank ASC LIMIT 10"
  ).bind(kid).all();

  const fields = [
    ["Power",detail.power],["平均Power",detail.avg_power],["領主数",detail.player_count],["Active",detail.active_players],
    ["Active 7d",detail.active_7d],["Active 30d",detail.active_30d],["同盟数",detail.alliance_count],["Health",detail.health],
    ["Power Rank",detail.power_rank],["Activity Rank",detail.activity_rank],["Power Gain 7d",detail.power_gain_7d],
    ["TC Pushers 7d",detail.tc_pushers_7d],["Governor Power",detail.gov_power],["Alliance Power",detail.alliance_power],
    ["Hero Power",detail.hero_power],["Troop Power",detail.troop_power],["Building Power",detail.building_power],
    ["Research Power",detail.research_power],["Pet Power",detail.pet_power],["Migrant Score",detail.migrant_score],
    ["Mystic Trial",detail.mystic_trial],["Master Power",detail.master_power]
  ].filter(([,v]) => v !== undefined && v !== null);

  const playerRows=(topPlayers.results||[]).map(r=>"<a class='row' href='/player?governor_id="+encodeURIComponent(r.governor_id||r.target_id||"")+"'><b>#"+esc(r.rank)+"</b><span>"+esc(r.nick_name||r.governor_id||r.target_id)+"</span><em>"+num(r.score)+"</em><small>"+rankDelta(r.previous_rank,r.rank)+"</small></a>").join("");
  const allianceRows=(topAlliances.results||[]).map(r=>"<a class='row' href='/alliance?kid="+encodeURIComponent(kid)+"&tag="+encodeURIComponent(r.abbr||r.target_id||"")+"'><b>#"+esc(r.rank)+"</b><span>"+esc(r.name||r.abbr||r.target_id)+"</span><em>"+num(r.score)+"</em><small>"+rankDelta(r.previous_rank,r.rank)+"</small></a>").join("");
  const boardRows=(boards.results||[]).map(r=>{
    const label=BOARDS.find(x=>x[0]===r.board)?.[1]||r.board;
    return "<a class='board' href='/kingdom/rankings?kid="+encodeURIComponent(kid)+"&board="+encodeURIComponent(r.board)+"'><span>"+esc(label)+"</span><small>"+num(r.rows)+"行 · "+esc(ts(r.last_checked_at))+"</small></a>";
  }).join("");

  const html = "<main class='wrap'><a class='back' href='/kingdom-catalog'>← 王国カタログ</a><div class='hero'><div><div class='eyebrow'>KINGDOM PORTAL</div><h1>王国 "+esc(kid)+"</h1><p>"+esc(row.name||detail.name||"名称未取得")+"</p></div><button id='watch' data-kid='"+esc(kid)+"'>＋王国ウォッチリスト</button></div>"+
    "<div class='actions'><a href='/kingdom/rankings?kid="+kid+"'>26ランキングを見る</a><a href='/kingdom/compare?kid="+kid+"'>王国比較</a><a href='/kingdom/alliances?kid="+kid+"'>同盟一覧</a><a href='/kingdom/mighty?kid="+kid+"'>Mighty Events / KvK</a></div>"+
    "<section><h2>基本情報</h2><div class='grid'>"+fields.map(([k,v])=>"<div class='card'><small>"+esc(k)+"</small><strong>"+esc(num(v))+"</strong></div>").join("")+"</div></section>"+
    "<section><h2>Momentum</h2><div class='momentum'><b>Power Gain 7d</b><span>"+esc(num(detail.power_gain_7d))+"</span><b>TC Pushers 7d</b><span>"+esc(num(detail.tc_pushers_7d))+"</span><b>Active 7d / 30d</b><span>"+esc(num(detail.active_7d))+" / "+esc(num(detail.active_30d))+"</span><b>Health</b><span>"+esc(num(detail.health))+"</span></div></section>"+
    "<section><h2>Top Player</h2><div class='list'>"+(playerRows||"<div class='empty'>現在のランキングデータなし</div>")+"</div></section>"+
    "<section><h2>Top Alliance</h2><div class='list'>"+(allianceRows||"<div class='empty'>現在の同盟ランキングデータなし</div>")+"</div></section>"+
    "<section><h2>ランキングボード</h2><div class='boards'>"+(boardRows||"<div class='empty'>ランキング未取得</div>")+"</div></section>"+
    "<section><h2>データ鮮度</h2><div class='fresh'>EagleEye取得："+esc(ts(row.last_seen_at))+"<br>MightPulse観測："+esc(ts(row.source_observed_at || detail.source_observed_at || detail.cached_at))+"<br>R2："+esc(row.r2_latest_key ? "最新アーカイブあり" : "未保存")+"</div></section>"+
    "</main><script>document.getElementById('watch')?.addEventListener('click',async function(){this.disabled=true;try{const r=await fetch('/api/kingdom-watchlist?action=create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kid:Number(this.dataset.kid),top_n:10,interval_hours:6})});const d=await r.json();if(r.status===401){location.href='/api/auth/discord';return}if(!r.ok||!d.ok)throw new Error(d.message||d.error||'登録失敗');this.textContent='✓ ウォッチリスト登録済み';}catch(e){alert(e.message||e);this.disabled=false}});</script>";
  return page("王国 "+kid, html);
}

export async function renderKingdomRankingsPage(request, env) {
  const url = new URL(request.url);
  const kid = Number(url.searchParams.get("kid"));
  const selected = String(url.searchParams.get("board") || "personal_power");
  if (!Number.isInteger(kid) || kid < 1) return page("王国ランキング","<div class='empty'>kidを指定してください。</div>");
  const row = await catalogRow(env.DB,kid);
  if (!row) return page("王国ランキング","<div class='empty'>王国が見つかりません。</div>");
  const boards = await env.DB.prepare("SELECT board FROM kingdom_ranking_board_state WHERE kid = ? ORDER BY board").bind(kid).all();
  const available = (boards.results||[]).map(x=>x.board);
  const board = available.includes(selected) ? selected : (available[0]||selected);
  const rows = await env.DB.prepare("SELECT rank,target_type,target_id,governor_id,nick_name,score,aid,abbr,name,previous_rank FROM kingdom_ranking_current WHERE kid = ? AND board = ? ORDER BY rank ASC LIMIT 100").bind(kid,board).all();
  const label=BOARDS.find(x=>x[0]===board)?.[1]||board;
  const boardLinks=BOARDS.map(([b,l])=>"<a class='"+(b===board?"active":"")+"' href='/kingdom/rankings?kid="+kid+"&board="+encodeURIComponent(b)+"'>"+esc(l)+"</a>").join("");
  const body=(rows.results||[]).map(r=>{
    const player=String(r.target_type||"PLAYER")==="PLAYER";
    const href=player?"/player?governor_id="+encodeURIComponent(r.governor_id||r.target_id):"/alliance?kid="+kid+"&tag="+encodeURIComponent(r.abbr||r.target_id);
    const star=player?" <button class='star' data-g='"+esc(r.governor_id||r.target_id)+"'>☆</button>":"";
    return "<div class='rank'><b>#"+esc(r.rank)+"</b><a href='"+href+"'>"+esc(r.nick_name||r.name||r.abbr||r.target_id)+"</a><span>"+num(r.score)+"</span><small>"+rankDelta(r.previous_rank,r.rank)+"</small>"+star+"</div>";
  }).join("");
  return page("王国ランキング", "<main class='wrap'><a class='back' href='/kingdom?kid="+kid+"'>← 王国 "+kid+"</a><h1>"+esc(label)+"</h1><div class='actions'><a href='/kingdom/changes?kid="+kid+"&board="+encodeURIComponent(board)+"'>順位変化を見る →</a></div><div class='boardtabs'>"+boardLinks+"</div><div class='list'>"+(body||"<div class='empty'>データなし</div>")+"</div><script>document.querySelectorAll('.star').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const r=await fetch('/api/player-watchlist',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({governor_id:b.dataset.g})});if(r.status===401){location.href='/api/auth/discord';return}if(!r.ok)throw new Error('登録に失敗しました');b.textContent='★'}catch(e){alert(e.message);b.disabled=false}})</script></main>");
}

export async function renderAllianceListPage(request, env) {
  const url=new URL(request.url); const kid=Number(url.searchParams.get("kid"));
  if(!Number.isInteger(kid)||kid<1) return page("同盟一覧","<div class='empty'>kidを指定してください。</div>");
  const rows=await env.DB.prepare("SELECT kid,aid,abbr,name,power,member_count,power_rank,last_seen_at,r2_latest_key FROM alliance_catalog WHERE kid = ? ORDER BY COALESCE(power_rank,999999), name ASC LIMIT 100").bind(kid).all();
  const body=(rows.results||[]).map(r=>"<a class='row' href='/alliance?kid="+kid+"&tag="+encodeURIComponent(r.abbr||r.aid)+"'><b>#"+esc(r.power_rank??"—")+"</b><span>"+esc(r.name||r.abbr||r.aid)+"</span><em>"+num(r.power)+"</em><small>"+num(r.member_count)+"人</small></a>").join("");
  return page("同盟一覧","<main class='wrap'><a class='back' href='/kingdom?kid="+kid+"'>← 王国 "+kid+"</a><h1>同盟一覧</h1><div class='list'>"+(body||"<div class='empty'>Catalogに同盟データがありません。</div>")+"</div></main>");
}

export async function renderAlliancePage(request, env) {
  const url=new URL(request.url); const kid=Number(url.searchParams.get("kid")); const tag=String(url.searchParams.get("tag")||"").trim();
  if(!Number.isInteger(kid)||!tag) return page("同盟詳細","<div class='empty'>王国と同盟タグを指定してください。</div>");
  const row=await env.DB.prepare("SELECT * FROM alliance_catalog WHERE kid = ? AND (abbr = ? OR aid = ?) LIMIT 1").bind(kid,tag,tag).first();
  let archived=null; try{archived=await readR2Json(env.ARCHIVE,row?.r2_latest_key)}catch{}
  const payload=archived?.payload||{};
  const alliance=payload?.alliance||payload?.data?.alliance||payload;
  const members=Array.isArray(payload?.roster)?payload.roster:Array.isArray(payload?.members)?payload.members:Array.isArray(payload?.data?.roster)?payload.data.roster:[];
  const roster=members.slice(0,100).map(m=>"<a class='row' href='/player?governor_id="+encodeURIComponent(m.governor_id||m.uid||"")+"'><span>"+esc(m.nick_name||m.governor_id||m.uid)+"</span><em>"+num(m.power)+"</em><small>役場 "+esc(m.town_center_level??"—")+"</small></a>").join("");
  return page("同盟 "+(row?.abbr||tag),"<main class='wrap'><a class='back' href='/kingdom?kid="+kid+"'>← 王国 "+kid+"</a><h1>"+esc(alliance.name||row?.name||tag)+"</h1><p>"+esc(alliance.abbr||row?.abbr||tag)+" · Power "+esc(num(alliance.power||row?.power))+" · "+esc(num(alliance.count||row?.member_count))+"人</p><div class='actions'><a href='/kingdom/alliances?kid="+kid+"'>同盟一覧</a></div><section><h2>Roster</h2><div class='list'>"+(roster||"<div class='empty'>Roster履歴がありません。</div>")+"</div></section></main>");
}

export async function renderKingdomComparePage(request, env) {
  const url=new URL(request.url);
  const kids=[...new Set(url.searchParams.getAll("kid").flatMap(v=>String(v).split(",")).map(Number).filter(n=>Number.isInteger(n)&&n>0))].slice(0,4);
  if(kids.length<2) return page("王国比較","<main class='wrap'><h1>王国比較</h1><p>URLに ?kid=1&kid=2 のように2王国以上を指定してください。</p></main>");
  const placeholders=kids.map(k=>"?").join(",");
  const rows=await env.DB.prepare("SELECT kid,name,status,source_observed_at,last_seen_at FROM kingdom_catalog WHERE kid IN ("+placeholders+") ORDER BY kid").bind(...kids).all();
  const current=await env.DB.prepare("SELECT kid,board,rank,score FROM kingdom_ranking_current WHERE kid IN ("+placeholders+") AND board = 'personal_power' AND target_type='PLAYER' ORDER BY kid,rank LIMIT 10").bind(...kids).all();
  const top=new Map(); for(const r of current.results||[]){const a=top.get(r.kid)||[];a.push(r);top.set(r.kid,a);}
  const cards=(rows.results||[]).map(r=>"<article class='compare'><h2>王国 "+esc(r.kid)+"</h2><p>"+esc(r.name||"名称未取得")+"</p><div>最終取得 "+esc(ts(r.last_seen_at))+"</div><div>Top1 Power "+esc(num(top.get(r.kid)?.[0]?.score))+"</div></article>").join("");
  return page("王国比較","<main class='wrap'><a class='back' href='/kingdom-catalog'>← 王国カタログ</a><h1>王国比較</h1><div class='comparegrid'>"+cards+"</div></main>");
}

export async function handleKingdomPortalApi(request, env) {
  const url=new URL(request.url);
  if(url.pathname==="/api/kingdom-portal/status") {
    const latest=await env.DB.prepare("SELECT status,operation,created_at,error_code FROM system_event_log WHERE service = 'kingdom_portal' ORDER BY created_at DESC LIMIT 1").first();
    const catalog=await env.DB.prepare("SELECT COUNT(*) AS count FROM kingdom_catalog").first();
    return Response.json({ok:true,service:"kingdom_portal",catalog_count:Number(catalog?.count||0),latest_event:latest||null});
  }
  if(url.pathname!=="/api/kingdom-portal/ranking") return null;
  const kid=Number(url.searchParams.get("kid")); const board=String(url.searchParams.get("board")||"personal_power");
  if(!Number.isInteger(kid)||kid<1) return Response.json({ok:false,error:"INVALID_KID"},{status:400});
  const allowed=BOARDS.some(x=>x[0]===board); if(!allowed) return Response.json({ok:false,error:"INVALID_BOARD"},{status:400});
  const rows=await env.DB.prepare("SELECT rank,target_type,target_id,governor_id,nick_name,score,aid,abbr,name,previous_rank,observed_at,source_observed_at FROM kingdom_ranking_current WHERE kid=? AND board=? ORDER BY rank ASC LIMIT 100").bind(kid,board).all();
  await recordSystemEvent(env.DB,{traceId:systemTraceId("kingdom-portal"),eventType:"COMPLETE",service:"kingdom_portal",feature:"ranking_explorer",operation:"READ_CURRENT_RANKING",status:"SUCCESS",targetType:"KINGDOM",targetId:String(kid),metadata:{board,rowCount:rows.results?.length||0}}).catch(()=>{});
  return Response.json({ok:true,kid,board,rows:rows.results||[]});
}


export async function renderKingdomMightyPage(request, env) {
  const url=new URL(request.url);
  const kid=Number(url.searchParams.get("kid"));
  if(!Number.isInteger(kid)||kid<1) return page("Mighty","<main class='wrap'><div class='empty'>kidを指定してください。</div></main>");
  if(String(env?.MIGHTPULSE_MIGHTY_ENABLED||"").toLowerCase()!=="true") {
    return page("Mighty","<main class='wrap'><a class='back' href='/kingdom?kid="+kid+"'>← 王国 "+kid+"</a><h1>Mighty機能</h1><div class='empty'>Events / KvK はMightPulse Mightyキーを明示的に有効化した場合のみ取得します。現在はAPI呼び出しを行っていません。</div></main>");
  }
  let events=null,kvk=null,errors=[];
  try { events=await collectMightPulseThroughGuards(env,{path:"/kingdoms/"+encodeURIComponent(kid)+"/events",endpoint:"/kingdoms/:kid/events",targetType:"KINGDOM",targetId:String(kid),purpose:"KINGDOM_MIGHTY_EVENTS"}); } catch(e){ errors.push("Events: "+String(e?.code||e?.message||e)); }
  try { kvk=await collectMightPulseThroughGuards(env,{path:"/kingdoms/"+encodeURIComponent(kid)+"/kvk",endpoint:"/kingdoms/:kid/kvk",targetType:"KINGDOM",targetId:String(kid),purpose:"KINGDOM_MIGHTY_KVK"}); } catch(e){ errors.push("KvK: "+String(e?.code||e?.message||e)); }
  return page("Mighty","<main class='wrap'><a class='back' href='/kingdom?kid="+kid+"'>← 王国 "+kid+"</a><h1>Mighty Events / KvK</h1>"+(errors.length?"<div class='empty'>"+errors.map(esc).join("<br>")+"</div>":"")+"<section><h2>Events</h2><pre>"+esc(JSON.stringify(events?.result?.data||events?.result||{},null,2))+"</pre></section><section><h2>KvK</h2><pre>"+esc(JSON.stringify(kvk?.result?.data||kvk?.result||{},null,2))+"</pre></section></main>");
}

export async function renderKingdomWatchlistAnalyticsPage(request, env, auth) {
  if (!auth || auth.status !== "ACTIVE") return page("Watchlist Analytics","<main class='wrap'><div class='empty'>ログインが必要です。</div></main>");
  const watches = await env.DB.prepare(
    "SELECT w.kid,w.top_n,w.interval_hours,w.enabled,w.last_run_at,w.last_success_at,w.last_error,c.name,c.status,c.source_observed_at,c.last_seen_at FROM kingdom_watchlists w LEFT JOIN kingdom_catalog c ON c.kid=w.kid WHERE w.discord_id=? ORDER BY w.created_at DESC LIMIT 100"
  ).bind(auth.discord_id).all();
  const rows=(watches.results||[]).map(r=>{
    const freshness=r.source_observed_at&&r.last_seen_at?Math.max(0,Number(r.last_seen_at)-Number(r.source_observed_at)):null;
    return "<div class='row'><b>王国 "+esc(r.kid)+"</b><span>"+esc(r.name||"名称未取得")+"</span><em>"+(Number(r.enabled)===1?"監視中":"停止")+"</em><small>最終成功 "+esc(ts(r.last_success_at))+" / 鮮度差 "+esc(freshness==null?"—":Math.round(freshness/60)+"分")+"</small></div>";
  }).join("");
  return page("Watchlist Analytics","<main class='wrap'><a class='back' href='/kingdom-watchlist'>← 王国Watchlist</a><h1>Watchlist Analytics</h1><p>登録王国ごとの取得成功・鮮度・直近状態を一覧します。</p><div class='list'>"+(rows||"<div class='empty'>王国Watchlistはありません。</div>")+"</div></main>");
}

export async function renderKingdomChangesPage(request, env) {
  const url = new URL(request.url);
  const kid = Number(url.searchParams.get("kid"));
  const board = String(url.searchParams.get("board") || "personal_power");
  if (!Number.isInteger(kid) || kid < 1) return page("ランキング変化","<main class='wrap'><div class='empty'>kidを指定してください。</div></main>");
  const current = await env.DB.prepare(
    "SELECT rank,target_type,target_id,governor_id,nick_name,score,abbr,name,previous_rank,observed_at FROM kingdom_ranking_current WHERE kid=? AND board=? ORDER BY rank ASC LIMIT 100"
  ).bind(kid,board).all();
  const events = await env.DB.prepare(
    "SELECT target_id,change_type,field_name,old_value_json,new_value_json,detected_at FROM change_events WHERE target_type='PLAYER' AND target_id IN (SELECT target_id FROM kingdom_ranking_current WHERE kid=? AND board=?) ORDER BY detected_at DESC LIMIT 100"
  ).bind(kid,board).all();
  const eventMap = new Map((events.results||[]).map(r=>[String(r.target_id),r]));
  const rows=(current.results||[]).map(r=>{
    const d=Number(r.previous_rank)-Number(r.rank);
    const movement=Number.isFinite(d)&&d!==0?(d>0?"UP":"DOWN"):"FLAT";
    const ev=eventMap.get(String(r.target_id));
    return "<div class='rank'><b>#"+esc(r.rank)+"</b><a href='/player?governor_id="+encodeURIComponent(r.governor_id||r.target_id)+"'>"+esc(r.nick_name||r.governor_id||r.target_id)+"</a><span>"+(movement==="UP"?"↑"+d:movement==="DOWN"?"↓"+Math.abs(d):"→")+" / 前回 "+esc(r.previous_rank??"—")+"</span><small>"+esc(ts(r.observed_at))+"</small></div>";
  }).join("");
  const inOut=(events.results||[]).filter(r=>["RANK_IN","RANK_OUT","RANKING_IN","RANKING_OUT"].includes(String(r.change_type))).map(r=>"<div class='row'><span>"+esc(r.change_type)+"</span><span>"+esc(r.target_id)+"</span><small>"+esc(ts(r.detected_at))+"</small></div>").join("");
  return page("ランキング変化","<main class='wrap'><a class='back' href='/kingdom/rankings?kid="+kid+"&board="+encodeURIComponent(board)+"'>← ランキング</a><h1>ランキング変化</h1><p>前回順位 → 今回順位。現在値とChange Eventだけを使用しています。</p><section><h2>順位変動</h2><div class='list'>"+(rows||"<div class='empty'>変動データなし</div>")+"</div></section><section><h2>IN / OUT</h2><div class='list'>"+(inOut||"<div class='empty'>直近IN / OUTなし</div>")+"</div></section></main>");
}

function rankDelta(prev,current){
  const p=Number(prev), c=Number(current);
  if(!Number.isFinite(p)||!Number.isFinite(c)||p===c)return "—";
  const d=p-c; return d>0?"↑"+d:d<0?"↓"+Math.abs(d):"→";
}
function page(title, body){
  return "<!doctype html><html lang='ja'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>"+esc(title)+" | EagleEye</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.wrap{max-width:980px;margin:auto;padding:24px 14px 48px}.back{color:#94a3b8;text-decoration:none}.eyebrow{margin-top:22px;color:#f59e0b;font-size:11px;font-weight:900;letter-spacing:2px}.hero{margin-top:16px;padding:20px;border:1px solid #334155;border-radius:18px;background:#111c31;display:flex;justify-content:space-between;gap:12px}.hero h1,h1{margin:4px 0;font-size:28px}.hero p{color:#94a3b8}.hero button,.actions a{border:1px solid #475569;background:#17233a;color:#f8fafc;padding:9px 12px;border-radius:10px;text-decoration:none;font-weight:800}.actions{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:9px}.card,.compare,.fresh,.momentum{padding:14px;border:1px solid #334155;border-radius:12px;background:#111c31}.card small{display:block;color:#94a3b8}.card strong{display:block;margin-top:5px;font-size:18px}.momentum{display:grid;grid-template-columns:1fr 1fr;gap:10px}.list{display:grid;gap:7px}.row{display:grid;grid-template-columns:45px 1fr auto auto;gap:8px;align-items:center;padding:11px 12px;border:1px solid #334155;border-radius:10px;background:#162238;color:#fff;text-decoration:none}.row em{font-style:normal;color:#f59e0b}.row small{color:#94a3b8}.boards{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:7px}.board,.boardtabs a{display:block;padding:10px;border:1px solid #334155;border-radius:9px;background:#111c31;color:#fff;text-decoration:none}.board small{display:block;color:#64748b;margin-top:4px}.boardtabs{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}.boardtabs a.active{border-color:#f59e0b;color:#f59e0b}.rank{display:grid;grid-template-columns:45px 1fr auto 55px 35px;gap:8px;align-items:center;padding:10px;border-bottom:1px solid #243247}.rank a{color:#fff;text-decoration:none}.rank span{color:#f59e0b}.rank small{color:#94a3b8}.star{border:0;background:none;color:#f59e0b;font-size:18px}.comparegrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.empty{padding:18px;border:1px dashed #475569;border-radius:12px;color:#94a3b8}section{margin-top:24px}section h2{font-size:18px}@media(max-width:600px){.hero{flex-direction:column}.row{grid-template-columns:35px 1fr auto}.row small{display:none}.rank{grid-template-columns:35px 1fr auto 35px 30px}}</style></head><body>"+body+"</body></html>";
}
