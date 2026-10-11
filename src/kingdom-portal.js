import { collectMightPulseThroughGuards, collectMightyOnly, collectUserMightyOnly, collectAllianceDetail } from "./data-collection-engine.js";
import { archiveAllianceHistoryBatch, listAllianceHistoryFromR2 } from "./r2-archive.js";
import { evaluateVipEligibility } from "./user-eligibility.js";
import { recordSystemEvent, systemTraceId } from "./system-log.js";
import { RANKING_BOARD_LABELS } from "./kingdom-terminology.js";
import { EAGLEEYE_ROLE_AVATAR_CSS, normalizeAllianceRole } from "./eagleeye-ui.js";

const BOARD_ORDER = [
  "personal_power","kills","town_center","hero_total","troop_power","building_power","research_power",
  "hero_no_equip","hero_equip","gov_gear","gov_charm","pet_power","island_prosperity","migrant_score",
  "mystic_trial","coliseum","forest_of_life","crystal_cave","knowledge_nexus","molten_fort","radiant_spire",
  "master_power","rebel_conquest","single_hero","alliance_power","alliance_kills"
];
const BOARDS = BOARD_ORDER.map(board => [board, RANKING_BOARD_LABELS[board] || board]);

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
    "SELECT kid,name,status,region,language,raw_json,boards_json,source_observed_at,first_seen_at,last_seen_at,updated_at,r2_latest_key FROM kingdom_catalog WHERE kid = ? LIMIT 1"
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
  let legacy = null;
  if (!archived?.payload && (row.raw_json || row.boards_json)) {
    try { legacy = row.raw_json ? JSON.parse(row.raw_json) : null; } catch {}
  }
  const payload = archived?.payload || legacy || {};
  const detail = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  const boards = await env.DB.prepare(
    "SELECT board, MAX(checked_rows) AS rows, MAX(changed_rows) AS changed_rows, MAX(last_checked_at) AS last_checked_at, MAX(source_observed_at) AS source_observed_at FROM kingdom_ranking_board_state WHERE kid = ? GROUP BY board ORDER BY board"
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
    return "<a class='board' href='/kingdom/rankings?kid="+encodeURIComponent(kid)+"&board="+encodeURIComponent(r.board)+"'><span>"+esc(label)+"</span><small>"+num(r.rows)+"行 · 変更 "+num(r.changed_rows)+" · "+esc(ts(r.last_checked_at))+"</small></a>";
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

export async function renderKingdomRankingsPage(request, env, auth = null) {
  const url = new URL(request.url);
  let pref = null, linked = null;
  if (auth?.status === "ACTIVE" && env.DB) {
    pref = await env.DB.prepare("SELECT kid, boards_json, primary_board FROM user_kingdom_ranking_preferences WHERE user_id = ? LIMIT 1").bind(String(auth.user_id)).first().catch(() => null);
    linked = await env.DB.prepare("SELECT kingdom_id FROM user_player_links WHERE user_id = ? AND status = 'ACTIVE' ORDER BY CASE account_type WHEN 'MAIN' THEN 0 ELSE 1 END, created_at ASC LIMIT 1").bind(String(auth.user_id)).first().catch(() => null);
  }
  const requestedKid = String(url.searchParams.get("kid") || "").trim();
  const savedKid = Number(pref?.kid || linked?.kingdom_id || 0);
  const kid = /^\d+$/.test(requestedKid) ? Number(requestedKid) : savedKid;
  const storedBoards = (() => { try { const a = JSON.parse(pref?.boards_json || "[]"); return Array.isArray(a) ? a.filter(b => BOARDS.some(x => x[0] === b)) : []; } catch { return []; } })();
  const selected = String(url.searchParams.get("board") || pref?.primary_board || storedBoards[0] || "personal_power");
  const selectedBoards = storedBoards.length ? storedBoards : [selected];
  if (!Number.isInteger(kid) || kid < 1) {
    const options = BOARDS.map(([b,l]) => "<label class='board-option'><input type='checkbox' name='boards' value='"+esc(b)+"' "+(b==="personal_power"?"checked":"")+"><span>"+esc(l)+"</span></label>").join("");
    return page("王国ランキング", "<main class='wrap'><h1>ランキング</h1><form class='rank-settings' method='get' action='/kingdom/rankings'><label>王国ID<input name='kid' type='number' min='1' inputmode='numeric' placeholder='王国ID' required></label><details open><summary>表示するランキング</summary><div class='board-options'>"+options+"</div></details><button type='submit'>ランキングを表示</button></form><p class='empty'>登録済み領主から王国を特定できません。王国IDを選択してください。</p></main>");
  }
  const row = await catalogRow(env.DB,kid);
  if (!row) return page("王国ランキング","<main class='wrap'><h1>王国ランキング</h1><div class='empty'>王国が見つかりません。王国IDを確認してください。</div><a href='/kingdom-catalog'>王国カタログ</a></main>");
  const boards = await env.DB.prepare("SELECT board FROM kingdom_ranking_board_state WHERE kid = ? ORDER BY board").bind(kid).all();
  const available = (boards.results||[]).map(x=>x.board);
  const board = available.includes(selected) ? selected : (available.includes(selectedBoards[0]) ? selectedBoards[0] : (available[0]||selected));
  const rows = await env.DB.prepare("SELECT r.rank,r.target_type,r.target_id,r.governor_id,r.nick_name,r.score,r.aid,r.abbr,r.name,r.previous_rank,p.avatar_url,p.alliance_abbr,p.alliance_rank,p.alliance_rank_label FROM kingdom_ranking_current r LEFT JOIN players p ON p.governor_id = COALESCE(NULLIF(r.governor_id,''),r.target_id) WHERE r.kid = ? AND r.board = ? ORDER BY r.rank ASC LIMIT 100").bind(kid,board).all();
  const label=BOARDS.find(x=>x[0]===board)?.[1]||board;
  const boardSelectOptions=BOARDS.filter(([b])=>!storedBoards.length||storedBoards.includes(b)).map(([b,l])=>({key:b,label:l}));
  const body=(rows.results||[]).map(r=>{
    const player=String(r.target_type||"PLAYER")==="PLAYER";
    const href=player?"/player?governor_id="+encodeURIComponent(r.governor_id||r.target_id):"/alliance?kid="+kid+"&tag="+encodeURIComponent(r.abbr||r.target_id);
    const rankNumber=Number(r.rank);
    const rankClass=rankNumber===1?"rank-gold":rankNumber===2?"rank-silver":rankNumber===3?"rank-bronze":"";
    const star=player?" <button class='star' type='button' aria-label='ウォッチリストに追加' aria-pressed='false' data-g='"+esc(r.governor_id||r.target_id)+"'>☆</button>":"";
    const playerName=String(r.nick_name||r.name||r.abbr||r.target_id||"");const role=player?normalizeAllianceRole(r.alliance_rank,r.alliance_rank_label):null;const roleAttr=role? " data-role='"+role+"'":"";const avatar=r.avatar_url?"<img class='rank-avatar ee-role-avatar'"+roleAttr+" src='"+esc(r.avatar_url)+"' alt='' loading='lazy' decoding='async' referrerpolicy='no-referrer'>":"<span class='rank-avatar ee-role-avatar rank-avatar-fallback'"+roleAttr+" aria-hidden='true'>"+esc(playerName.slice(0,1)||"？")+"</span>";const allianceTag=String(r.alliance_abbr||r.abbr||r.aid||"");const allianceHref="/alliance?kid="+encodeURIComponent(kid)+"&tag="+encodeURIComponent(allianceTag);const alliance=player&&allianceTag?"<a class='rank-alliance' href='"+allianceHref+"' aria-label='同盟 "+esc(allianceTag)+" の詳細'>["+esc(allianceTag)+"]</a>":"";return "<article class='rank-row "+rankClass+"'><div class='rank-position'><span>"+esc(r.rank)+"</span><small>位</small></div><div class='rank-player'><a class='rank-player-link' href='"+href+"'>"+avatar+"<span class='rank-player-name'>"+esc(playerName)+"</span></a>"+alliance+"</div><div class='rank-score'><small>スコア</small><strong>"+num(r.score)+"</strong></div><div class='rank-change'>"+rankDelta(r.previous_rank,r.rank)+"</div>"+star+"</article>";
  }).join("");
  const options=BOARDS.map(([b,l])=>"<label class='board-option'><input type='checkbox' name='boards' value='"+esc(b)+"' "+(selectedBoards.includes(b)?"checked":"")+"><span>"+esc(l)+"</span></label>").join("");
  const settings="<div class='rank-settings' id='rank-settings' hidden><div class='settings-title'>表示対象ランキング</div><form id='rank-pref-form'><label>王国ID<input name='kid' type='number' min='1' value='"+kid+"' required></label><div class='board-options'>"+options+"</div><button type='submit'>設定を保存</button><span id='pref-status' role='status'></span></form></div>";
  const html="<main class='wrap'><div class='rank-head'><a class='back' href='/kingdom?kid="+kid+"'>← 王国 "+kid+"</a><button type='button' id='open-rank-settings'>ランキング設定</button></div><h1>"+esc(label)+"</h1>"+settings+"<div class='actions'><a href='/kingdom/changes?kid="+kid+"&board="+encodeURIComponent(board)+"'>順位変化を見る →</a></div><div class='rank-switch'><span class='rank-switch-label'>ランキング切替</span><div class='rank-picker' id='rank-picker'><button type='button' class='rank-picker-trigger' id='rank-picker-trigger' aria-haspopup='listbox' aria-expanded='false'><span>"+esc(label)+"</span><span class='rank-picker-chevron'>⌄</span></button><div class='rank-picker-menu' id='rank-picker-menu' role='listbox' aria-label='ランキング切替' hidden>"+boardSelectOptions.map(o=>"<button type='button' role='option' aria-selected='"+(o.key===board?"true":"false")+"' data-board='"+esc(o.key)+"' class='rank-picker-option "+(o.key===board?"is-selected":"")+"'><span>"+esc(o.label)+"</span>"+(o.key===board?"<span class='rank-picker-check'>✓</span>":"")+"</button>").join("")+"</div></div></div><div class='list'>"+(body||"<div class='empty'>このランキングのデータはまだありません。</div>")+"</div><style>.rank-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:4px 0 18px} .rank-head .back{color:#9bb0c8;text-decoration:none;font-size:13px} .rank-head button,.rank-settings button{border:1px solid #244b68;border-radius:12px;background:linear-gradient(135deg,#12334b,#0c2438);color:#e7f7ff;font-weight:800;padding:10px 14px} .wrap>h1{margin:8px 0 14px;font-size:clamp(23px,5vw,30px);line-height:1.2;letter-spacing:-.02em;color:#f0f8ff} .rank-settings{margin:14px 0;padding:14px;border:1px solid #25415f;border-radius:16px;background:linear-gradient(145deg,#0d1b2d,#091625);color:#dceaf7} .rank-settings[hidden]{display:none}.settings-title{font-size:15px;font-weight:850;color:#e7f7ff;margin-bottom:10px} .rank-settings label{display:block;margin:12px 0;color:#a9bed3;font-size:12px} .rank-settings input[type=number],.rank-settings select{box-sizing:border-box;display:block;width:100%;margin-top:7px;padding:12px;border:1px solid #2c4d69;border-radius:10px;background:#071525;color:#edf7ff;font:inherit} .board-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0} .board-option{display:flex!important;align-items:center;gap:8px;margin:0!important;padding:10px;border:1px solid #25415f;border-radius:10px;background:#0b1b2c;font-size:12px;color:#dceaf7} .board-option input{accent-color:#22d3ee} .rank-settings form{margin-top:12px} #pref-status{display:block;color:#fbbf24;font-size:12px;margin-top:8px} .actions{display:flex;gap:8px;margin:14px 0;overflow-x:auto;padding-bottom:3px} .actions a{flex:0 0 auto;padding:10px 13px;border:1px solid #25415f;border-radius:11px;background:#0c1c2d;color:#9eeeff;text-decoration:none;font-size:12px;font-weight:750} .rank-switch{display:flex;align-items:center;gap:10px;margin:12px 0 16px;padding:10px 12px;border:1px solid #203b55;border-radius:13px;background:#0b1b2c}.rank-switch-label{flex:0 0 auto;color:#91a9c0;font-size:12px;font-weight:750}.rank-picker{position:relative;flex:1;min-width:0}.rank-picker-trigger{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-width:0;padding:10px 12px;border:1px solid #2c4d69;border-radius:10px;background:linear-gradient(135deg,#10263b,#091827);color:#e8f7ff;font:inherit;font-size:14px;font-weight:800;text-align:left}.rank-picker-trigger span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rank-picker-chevron{color:#75e6f5;font-size:18px;line-height:1}.rank-picker-menu{position:absolute;z-index:30;left:0;right:0;top:calc(100% + 7px);max-height:min(46vh,360px);overflow-y:auto;padding:6px;border:1px solid #2c526f;border-radius:13px;background:#091827;box-shadow:0 14px 36px rgba(0,0,0,.45)}.rank-picker-menu[hidden]{display:none}.rank-picker-option{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:11px 10px;border:0;border-bottom:1px solid rgba(44,77,105,.45);border-radius:7px;background:transparent;color:#b8cce0;font:inherit;font-size:13px;text-align:left}.rank-picker-option:last-child{border-bottom:0}.rank-picker-option.is-selected{background:#103047;color:#8feeff;font-weight:850}.rank-picker-check{color:#75e6f5;font-size:16px;font-weight:900}.list{display:grid;gap:8px;margin:4px 0 24px} .rank-row{box-sizing:border-box;display:grid;grid-template-columns:42px minmax(0,1fr) auto;grid-template-areas:\"position player star\" \"position score change\";align-items:center;column-gap:10px;row-gap:5px;min-width:0;padding:11px 10px;border:1px solid #203b55;border-radius:14px;background:linear-gradient(120deg,#0d1d2f,#091625);box-shadow:0 3px 10px rgba(0,0,0,.12)} .rank-position{grid-area:position;display:flex;flex-direction:column;align-items:center;justify-content:center;align-self:stretch;min-height:43px;border-radius:10px;background:#12283d;color:#b8d2e8} .rank-position span{font-size:18px;line-height:1.1;font-weight:900;font-variant-numeric:tabular-nums} .rank-position small{font-size:10px;font-weight:750;margin-top:2px} .rank-gold .rank-position{background:linear-gradient(145deg,#6c5421,#3b301b);color:#ffe49a} .rank-silver .rank-position{background:linear-gradient(145deg,#394b5c,#202e3d);color:#e1edf7} .rank-bronze .rank-position{background:linear-gradient(145deg,#69462e,#39281f);color:#ffd0a8} .rank-player{grid-area:player;display:flex;align-items:center;gap:7px;min-width:0;overflow-wrap:anywhere;color:#edf6ff;font-size:14px;font-weight:800;line-height:1.35}.rank-player-link{display:flex;align-items:center;gap:8px;min-width:0;color:#edf6ff;text-decoration:none}.rank-avatar{display:block;flex:0 0 30px;width:30px;height:30px;object-fit:cover;border-radius:9px;border:1px solid #294963;background:#10243a}.rank-avatar-fallback{display:flex;align-items:center;justify-content:center;color:#8fa9c1;font-size:13px;font-weight:850}.rank-player-name{min-width:0;overflow-wrap:anywhere}.rank-alliance{display:inline-flex;align-items:center;flex:0 0 auto;padding:2px 5px;border:1px solid #2a4d67;border-radius:5px;background:#10243a;color:#91a9c0;font-size:10px;font-weight:800;line-height:1.2;white-space:nowrap;text-decoration:none}.rank-alliance:hover,.rank-alliance:focus-visible{border-color:#75e6f5;color:#75e6f5}align-items:center;flex:0 0 auto;padding:2px 5px;border:1px solid #2a4d67;border-radius:5px;background:#10243a;color:#91a9c0;font-size:10px;font-weight:800;line-height:1.2;white-space:nowrap} .rank-score{grid-area:score;display:flex;align-items:baseline;gap:6px;min-width:0} .rank-score small{color:#7f9ab3;font-size:10px;white-space:nowrap} .rank-score strong{color:#75e6f5;font-size:14px;font-weight:850;font-variant-numeric:tabular-nums;overflow-wrap:anywhere} .rank-change{grid-area:change;justify-self:end;color:#9aafc3;font-size:11px;text-align:right;white-space:nowrap} .rank-row .star{grid-area:star;justify-self:end;align-self:center;display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:34px;height:32px;margin:0;padding:0;border:1px solid #254b67;border-radius:10px;background:#10243a;color:#7fe8f6;font-family:Arial,sans-serif;font-size:20px;line-height:1;text-align:center} .rank-row .star:disabled{opacity:.55}.rank-row .star.is-watched{background:#103047;border-color:#24708a;color:#75e6f5;box-shadow:inset 0 0 0 1px rgba(117,230,245,.12)}.rank-row .star.is-watched:focus-visible{outline:2px solid #75e6f5;outline-offset:2px} .empty{padding:20px;border:1px dashed #2a4965;border-radius:14px;background:#0b1b2c;color:#9bb0c8} @media(min-width:600px){.rank-row{grid-template-columns:48px minmax(0,1fr) auto auto;grid-template-areas:\"position player score star\" \"position change change star\";padding:13px 14px}.rank-change{justify-self:start}.rank-position span{font-size:20px}} @media(max-width:520px){.board-options{grid-template-columns:1fr}.rank-row{grid-template-columns:38px minmax(0,1fr) auto;column-gap:8px;padding:10px 8px}.rank-player{font-size:13px;gap:5px}.rank-player-link{gap:6px}.rank-avatar{flex-basis:28px;width:28px;height:28px}.rank-player-meta{gap:4px}.rank-alliance{font-size:9px;padding:2px 4px}.rank-score strong{font-size:13px}.rank-change{font-size:10px}.rank-row .star{width:30px;height:30px}}</style><script>const picker=document.getElementById('rank-picker');const pickerTrigger=document.getElementById('rank-picker-trigger');const pickerMenu=document.getElementById('rank-picker-menu');pickerTrigger.onclick=()=>{const opening=pickerMenu.hidden;pickerMenu.hidden=!opening;pickerTrigger.setAttribute('aria-expanded',String(opening))};pickerMenu.querySelectorAll('[data-board]').forEach(option=>option.onclick=()=>{const nextBoard=option.dataset.board;if(nextBoard)location.href='/kingdom/rankings?kid="+kid+"&board='+encodeURIComponent(nextBoard)});document.addEventListener('click',e=>{if(!picker.contains(e.target)){pickerMenu.hidden=true;pickerTrigger.setAttribute('aria-expanded','false')}});document.addEventListener('keydown',e=>{if(e.key==='Escape'){pickerMenu.hidden=true;pickerTrigger.setAttribute('aria-expanded','false')}});const sf=document.getElementById('rank-settings');const settingsButton=document.getElementById('open-rank-settings');settingsButton.onclick=()=>{sf.hidden=!sf.hidden;settingsButton.textContent=sf.hidden?'ランキング設定':'閉じる';if(!sf.hidden)sf.scrollIntoView({behavior:'smooth',block:'start'})};document.getElementById('rank-pref-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;const boards=[...f.querySelectorAll('input[name=boards]:checked')].map(x=>x.value);const status=document.getElementById('pref-status');if(!boards.length){status.textContent='ランキングを1つ以上選択してください';return}const currentBoard=document.getElementById('ranking-board-select').value;const primary=boards.includes(currentBoard)?currentBoard:boards[0];try{const r=await fetch('/api/kingdom-rankings/preferences',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({kid:Number(f.elements.kid.value),boards,primary_board:primary})});const d=await r.json();if(r.status===401){location.href='/api/auth/discord';return}if(!r.ok||!d.ok)throw new Error(d.message||d.error||'保存に失敗しました');location.href='/kingdom/rankings?kid='+encodeURIComponent(f.elements.kid.value)+'&board='+encodeURIComponent(primary)}catch(err){status.textContent=err.message||'保存に失敗しました'}};const starButtons=[...document.querySelectorAll('.star')];const setStarState=(b,active)=>{b.setAttribute('aria-pressed',String(active));b.classList.toggle('is-watched',active);b.textContent=active?'★':'☆';b.setAttribute('aria-label',active?'ウォッチリストから解除':'ウォッチリストに追加')};(async()=>{if(!starButtons.length)return;try{const r=await fetch('/api/player-watchlist',{credentials:'same-origin',cache:'no-store'});if(r.status===401)return;if(!r.ok)return;const d=await r.json();const watched=new Set((d.watchlist||[]).filter(x=>x.enabled===true||Number(x.enabled)===1).map(x=>String(x.governor_id)));starButtons.forEach(b=>setStarState(b,watched.has(String(b.dataset.g))))}catch{}})();starButtons.forEach(b=>b.onclick=async()=>{if(b.disabled)return;const wasActive=b.getAttribute('aria-pressed')==='true';b.disabled=true;try{const gid=encodeURIComponent(b.dataset.g);const r=wasActive?await fetch('/api/player-watchlist?governor_id='+gid,{method:'DELETE',credentials:'same-origin'}):await fetch('/api/player-watchlist',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({governor_id:b.dataset.g})});const d=await r.json().catch(()=>({}));if(r.status===401){location.href='/api/auth/discord';return}if(!r.ok||d.ok===false)throw new Error(d.message||(wasActive?'解除に失敗しました':'登録に失敗しました'));setStarState(b,!wasActive)}catch(e){alert(e.message||'ウォッチリストの更新に失敗しました')}finally{b.disabled=false}})</script></main>";
  return page("王国ランキング", html);
}

export async function renderAllianceListPage(request, env) {
  const url=new URL(request.url); const kid=Number(url.searchParams.get("kid"));
  if(!Number.isInteger(kid)||kid<1) return page("同盟一覧","<div class='empty'>kidを指定してください。</div>");
  let rows=await env.DB.prepare("SELECT kid,aid,abbr,name,power,member_count,power_rank,last_seen_at,r2_latest_key FROM alliance_catalog WHERE kid = ? ORDER BY COALESCE(power_rank,999999), name ASC LIMIT 100").bind(kid).all();
  if (!(rows.results || []).length) {
    rows = await env.DB.prepare(
      "SELECT kid,target_id,aid,abbr,name,score AS power,rank AS power_rank FROM kingdom_ranking_current WHERE kid=? AND board='alliance_power' AND target_type='ALLIANCE' ORDER BY rank ASC LIMIT 100"
    ).bind(kid).all();
  }
  const body=(rows.results||[]).map(r=>"<a class='row' href='/alliance?kid="+kid+"&tag="+encodeURIComponent(r.abbr||r.aid||r.target_id||"")+"'><b>#"+esc(r.power_rank??"—")+"</b><span>"+esc(r.name||r.abbr||r.aid||r.target_id)+"</span><em>"+num(r.power)+"</em><small>"+(r.member_count!=null?num(r.member_count)+"人":"ランキングcurrent")+"</small></a>").join("");
  return page("同盟一覧","<main class='wrap'><a class='back' href='/kingdom?kid="+kid+"'>← 王国 "+kid+"</a><h1>同盟一覧</h1><div class='list'>"+(body||"<div class='empty'>同盟ランキングデータがありません。</div>")+"</div></main>");
}

export async function renderAlliancePage(request, env) {
  const url = new URL(request.url);
  const kid = Number(url.searchParams.get("kid"));
  const tag = String(url.searchParams.get("tag") || "").trim();
  const requestedRefresh = url.searchParams.get("refresh") === "1";
  if (!Number.isInteger(kid) || !tag) return page("同盟詳細", "<div class='empty'>王国と同盟タグを指定してください。</div>");

  let row = await env.DB.prepare("SELECT * FROM alliance_catalog WHERE kid=? AND (abbr=? OR aid=?) LIMIT 1").bind(kid,tag,tag).first();
  if (!row) row = await env.DB.prepare("SELECT kid,aid,abbr,name,score AS power,rank AS power_rank FROM kingdom_ranking_current WHERE kid=? AND board='alliance_power' AND target_type='ALLIANCE' AND (abbr=? OR aid=? OR target_id=?) LIMIT 1").bind(kid,tag,tag,tag).first();
  if (!row) return page("同盟詳細","<main class='wrap'><a class='back' href='/kingdom?kid="+kid+"'>← 王国 "+kid+"</a><div class='empty'>指定された同盟が見つかりません。</div></main>");

  let archived = null;
  try { archived = await readR2Json(env.ARCHIVE,row.r2_latest_key); } catch {}
  let payload = archived?.payload || {};
  const getAlliance = p => p?.alliance || p?.data?.alliance || p?.data?.data?.alliance || p?.payload?.alliance || p?.payload?.data?.alliance || p || {};
  const getMembers = p => {
    const a = getAlliance(p);
    const candidates = [p?.roster,p?.members,p?.data?.roster,p?.data?.members,p?.data?.data?.roster,p?.data?.data?.members,a?.roster,a?.members,a?.member_list];
    return candidates.find(Array.isArray) || [];
  };
  let alliance = getAlliance(payload);
  let members = getMembers(payload);
  const now = Math.floor(Date.now()/1000);
  const lastAttempt = Number(row.updated_at || row.last_seen_at || 0);
  const canFetch = Boolean(env.ARCHIVE) && now-lastAttempt>=600;
  const shouldFetch = canFetch && (members.length===0 || requestedRefresh);
  let statusMessage = requestedRefresh && !canFetch ? "前回の取得から10分未満のため更新を保留しました。" : "";
  if (shouldFetch) {
    try {
      const collected = await collectAllianceDetail(env,kid,row.abbr||tag,{purpose:"ALLIANCE_DETAIL_ON_DEMAND"});
      const fetched = collected?.result?.data ?? collected?.result ?? collected?.data ?? collected;
      const fetchedPayload = fetched?.data && typeof fetched.data==="object" ? fetched.data : fetched;
      const fetchedMembers = getMembers(fetchedPayload);
      if (fetchedMembers.length) {
        const observedAt = Math.floor(Date.now()/1000);
        const aid = String(fetchedPayload?.alliance?.aid ?? fetchedPayload?.data?.alliance?.aid ?? fetchedPayload?.aid ?? row.aid ?? tag);
        const archive = await archiveAllianceHistoryBatch(env.ARCHIVE,{kid,aid,observedAt,sourceObservedAt:Number(fetchedPayload?.source_observed_at ?? fetchedPayload?.observed_at ?? 0)||null,payload:fetched});
        if (!archive?.key) throw new Error("ALLIANCE_R2_ARCHIVE_FAILED");
        await env.DB.prepare("UPDATE alliance_catalog SET r2_latest_key=?,member_count=COALESCE(?,member_count),last_seen_at=?,updated_at=? WHERE kid=? AND aid=?").bind(archive.key,fetchedMembers.length,observedAt,observedAt,kid,aid).run();
        row = {...row, r2_latest_key:archive.key, member_count:fetchedMembers.length, last_seen_at:observedAt, updated_at:observedAt, aid};
        archived = {payload:fetched};
        payload = fetchedPayload;
        alliance = getAlliance(payload);
        members = fetchedMembers;
        statusMessage = "最新情報を取得しました。";
      } else {
        await env.DB.prepare("UPDATE alliance_catalog SET updated_at=? WHERE kid=? AND aid=?").bind(now,row.kid,row.aid).run().catch(()=>{});
        statusMessage = "APIからメンバー情報が返りませんでした。";
      }
    } catch (error) {
      await env.DB.prepare("UPDATE alliance_catalog SET updated_at=? WHERE kid=? AND aid=?").bind(now,row.kid,row.aid).run().catch(()=>{});
      console.error("alliance_roster_on_demand_failed",{kid,tag,message:error?.message||String(error)});
      statusMessage = "取得に失敗しました。時間をおいて再試行してください。";
    }
  } else if (!members.length && !statusMessage) {
    statusMessage = "Rosterがありません。取得は10分間隔で再試行します。";
  }

  const allianceName = String(alliance.name || row.name || tag);
  const allianceAbbr = String(alliance.abbr || row.abbr || tag);
  const allianceAid = String(alliance.aid || row.aid || tag);
  const alliancePower = alliance.power ?? alliance.score ?? row.power ?? row.score;
  const displayNum = value => value === null || value === undefined || value === "" ? "—" : num(value);
  const memberCount = Number(alliance.count ?? alliance.member_count ?? row.member_count ?? members.length ?? 0);
  const rankingResult = await env.DB.prepare("SELECT board,rank,score,previous_rank FROM kingdom_ranking_current WHERE kid=? AND target_type='ALLIANCE' AND (aid=? OR abbr=? OR target_id=?) AND board IN ('alliance_power','alliance_kills') ORDER BY board LIMIT 2").bind(kid,allianceAid,allianceAbbr,allianceAid).all().catch(()=>({results:[]}));
  const ranking = new Map((rankingResult.results||[]).map(r=>[String(r.board),r]));
  const powerRank = ranking.get("alliance_power")?.rank ?? alliance.power_rank ?? row.power_rank ?? row.rank;
  const killsRank = ranking.get("alliance_kills")?.rank ?? alliance.kills_rank;
  const parsePower = value => {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const text = String(value).trim().replace(/,/g, "").replace(/\s+/g, "");
    const match = text.match(/^(-?\d+(?:\.\d+)?)([KMB])?$/i);
    if (!match) {
      const parsed = Number(text);
      return Number.isFinite(parsed) ? parsed : null;
    }
    const magnitude = match[2] ? ({K:1e3,M:1e6,B:1e9}[match[2].toUpperCase()] || 1) : 1;
    const result = Number(match[1]) * magnitude;
    return Number.isFinite(result) ? result : null;
  };
  const normalized = members.map((m,i)=>{
    const name=String(m?.nick_name||m?.name||m?.governor_id||m?.uid||m?.id||"名前未取得");
    const id=String(m?.governor_id||m?.uid||m?.id||"");
    const rawPower=m?.power??m?.personal_power??m?.score;
    const power=parsePower(rawPower);
    const tc=m?.town_center_level??m?.town_center??m?.tc_level;
    const image=m?.avatar_url||m?.avatar||m?.icon_url||"";
    // MightPulse Alliance Roster fields: alliance_rank / alliance_rank_label.
    // Prefer the documented fields; retain legacy aliases as fallbacks.
    const roleRaw=m?.alliance_rank??m?.alliance_role??m?.member_role??m?.role??m?.position??"";
    const roleLabelRaw=m?.alliance_rank_label??m?.alliance_role_label??m?.role_label??m?.label??"";
    // alliance_rank may be a member's ordinal rank (e.g. 1), not the R1-R5 tier.
    // Prefer the human-readable label when resolving the role tier.
    const roleText=String(roleLabelRaw||"").trim();
    const roleName=roleText.toLowerCase();
    const labelMatch=roleText.match(/(?:^|\\D)R([1-5])(?:$|\\D)/i);
    const rawMatch=String(roleRaw).trim().match(/^R?([1-5])$/i);
    const roleByName=/(leader|president|chief|盟主|会長)/i.test(roleName)?5:/(officer|vice|副盟主|副会長)/i.test(roleName)?4:null;
    const role=labelMatch?Number(labelMatch[1]):roleByName??(rawMatch?Number(rawMatch[1]):null);
    const displayRole=role!==null?"R"+role+(role===5?"（盟主）":""):roleText;
    return {raw:m,name,id,power,tc,role,roleRaw:String(roleRaw),roleLabel:String(displayRole||""),image:/^https?:\/\//i.test(String(image))?String(image):"",rank:m?.rank??m?.power_rank??i+1};
  });
  const powerSorted = normalized.slice().sort((a,b)=>{
    if (a.power === null && b.power === null) return a.name.localeCompare(b.name,"ja");
    if (a.power === null) return 1;
    if (b.power === null) return -1;
    return b.power-a.power;
  });
  const sorted = normalized.slice().sort((a,b)=>{
    const ar=a.role??0, br=b.role??0;
    if (ar!==br) return br-ar;
    if (a.power===null&&b.power===null) return a.name.localeCompare(b.name,"ja");
    if (a.power===null) return 1;
    if (b.power===null) return -1;
    return b.power-a.power;
  });
  const known = normalized.filter(m=>m.power!==null);
  const totalPower = known.reduce((n,m)=>n+m.power,0);
  const average = known.length ? Math.round(totalPower/known.length) : null;
  const topTenShare = totalPower>0 ? Math.round(powerSorted.slice(0,10).reduce((n,m)=>n+(m.power??0),0)/totalPower*100) : null;
  const compact = value => {
    if (value === null || value === undefined || value === "") return "—";
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    const abs = Math.abs(n);
    const unit = abs >= 1e9 ? [1e9,"B"] : abs >= 1e6 ? [1e6,"M"] : abs >= 1e3 ? [1e3,"K"] : null;
    if (!unit) return n.toLocaleString("ja-JP");
    const scaled = n / unit[0];
    const decimals = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
    return scaled.toFixed(decimals).replace(/\.?0+$|\.$/, "") + unit[1];
  };
  const townCenterDisplay = value => {
    if (value === null || value === undefined || value === "") return "—";
    const level = Number(value);
    if (!Number.isFinite(level)) return String(value);
    if (level <= 30) return "Lv." + level;
    if (level <= 34) return "Lv.30-" + (level - 30);
    const goldLevel = Math.floor((level - 35) / 5) + 1;
    const stage = ((level - 35) % 5) + 1;
    return "<span class='tc-gold'>黄金" + goldLevel + "<small> " + stage + "/5</small></span>";
  };
  const bucketSize = 100_000_000;
  const buckets = [
    { min: 0, max: bucketSize, label: "100M未満", count: 0 },
    { min: bucketSize, max: bucketSize * 2, label: "100M〜200M", count: 0 },
    { min: bucketSize * 2, max: bucketSize * 3, label: "200M〜300M", count: 0 },
    { min: bucketSize * 3, max: bucketSize * 4, label: "300M〜400M", count: 0 },
    { min: bucketSize * 4, max: Infinity, label: "400M以上", count: 0 }
  ];
  known.forEach(m => {
    const bucket = buckets.find((b, i) => m.power >= b.min && (m.power < b.max || i === buckets.length - 1));
    if (bucket) bucket.count++;
  });
  const palette = ["#42c5e8","#3189d5","#6c7be8","#a16be8","#e59a52"];
  let distribution = "<div class='empty'>戦力分布を計算できるデータがありません。</div>";
  if (known.length) {
    let cursor = 0;
    const stops = buckets.map((b,i) => {
      const begin = cursor;
      cursor += b.count / known.length * 100;
      return palette[i] + " " + begin.toFixed(3) + "% " + cursor.toFixed(3) + "%";
    }).join(",");
    distribution = "<div class='distribution'><div class='dist-chart-wrap'><div class='dist-donut' style='background:conic-gradient("+stops+")'><div class='dist-donut-hole'><strong>"+num(known.length)+"</strong><span>戦力取得人数</span></div></div><div class='dist-legend'>"+buckets.map((b,i)=>"<div class='dist-legend-row'><i style='background:"+palette[i]+"'></i><span>"+esc(b.label)+"</span><b>"+num(b.count)+"人</b><small>"+Math.round(b.count/known.length*100)+"%</small></div>").join("")+"</div></div><p class='dist-note'>固定戦力帯で分類 · 戦力取得 "+num(known.length)+"人</p></div>";
  }

  let history = [];
  try { history = await listAllianceHistoryFromR2(env.ARCHIVE,{kid,aid:allianceAid,limit:12}); } catch (error) { console.error("alliance_history_read_failed",{kid,aid:allianceAid,message:error?.message||String(error)}); }
  const snapshots = history.map(h=>({at:Number(h.observed_at||0),payload:h.payload||{}})).filter(h=>h.at>0);
  if (payload && Object.keys(payload).length) snapshots.push({at:Number(row.last_seen_at||row.updated_at||now),payload});
  const deduped = Array.from(new Map(snapshots.map(s=>[String(s.at),s])).values()).sort((a,b)=>a.at-b.at).slice(-12);
  const getPower = p => {const a=getAlliance(p);const v=a.power??a.score??a.alliance_power;return v===null||v===undefined||v===""||!Number.isFinite(Number(v))?null:Number(v);};
  const powerHistory = deduped.map(s=>({at:s.at,power:getPower(s.payload)})).filter(s=>s.power!==null);
  const maxHistoryPower = Math.max(1,...powerHistory.map(s=>s.power));
  const historyHtml = powerHistory.length>1 ? "<div class='history'>"+powerHistory.map(s=>"<div><i style='height:"+Math.max(4,Math.round(s.power/maxHistoryPower*100))+"%'></i><b>"+num(s.power)+"</b><small>"+esc(ts(s.at))+"</small></div>").join("")+"</div>" : "<div class='empty'>複数回の履歴が保存されると戦力推移を表示します。</div>";

  const rosterData = s => getMembers(s.payload).map(m=>({id:String(m?.governor_id||m?.uid||m?.id||""),name:String(m?.nick_name||m?.name||m?.governor_id||m?.uid||m?.id||"名前未取得"),power:Number(m?.power??m?.personal_power??m?.score)})).filter(m=>m.id);
  let changeHtml = "<div class='empty'>比較可能なRoster履歴が蓄積すると加入・脱退を表示します。</div>";
  let memberPowerChangesHtml = "<div class='empty'>比較可能なRoster履歴が蓄積するとメンバー戦力の増減を表示します。</div>";
  const rosterHistory = deduped.map(s=>({at:s.at,members:rosterData(s)})).filter(s=>s.members.length);
  if (rosterHistory.length>1) {
    const previous=rosterHistory[rosterHistory.length-2], current=rosterHistory[rosterHistory.length-1];
    const before=new Map(previous.members.map(m=>[m.id,m])), after=new Map(current.members.map(m=>[m.id,m]));
    const joined=[...after.values()].filter(m=>!before.has(m.id)), left=[...before.values()].filter(m=>!after.has(m.id));
    changeHtml="<div class='change-counts'><div>加入 <b>+"+joined.length+"</b></div><div>脱退 <b>−"+left.length+"</b></div></div><div class='change-cols'><div><h3>加入メンバー</h3>"+(joined.length?joined.slice(0,20).map(m=>"<p>"+esc(m.name)+"</p>").join(""):"<small>変化なし</small>")+"</div><div><h3>脱退メンバー</h3>"+(left.length?left.slice(0,20).map(m=>"<p>"+esc(m.name)+"</p>").join(""):"<small>変化なし</small>")+"</div></div><small class='muted'>"+esc(ts(previous.at))+" → "+esc(ts(current.at))+"</small>";
    const powerChanges=[...after.values()].map(m=>({ ...m, delta:m.power-before.get(m.id)?.power })).filter(m=>before.has(m.id)&&Number.isFinite(m.delta)&&m.delta!==0).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)).slice(0,20);
    memberPowerChangesHtml=powerChanges.length?"<div class='power-changes'>"+powerChanges.map(m=>"<div><span>"+esc(m.name)+"</span><b class='"+(m.delta>0?"up":"down")+"'>"+(m.delta>0?"+":"")+num(m.delta)+"</b></div>").join("")+"</div><small class='muted'>"+esc(ts(previous.at))+" → "+esc(ts(current.at))+" · 戦力が取得できた同一メンバーを比較</small>":"<div class='empty'>比較期間内に戦力変化がないか、比較可能な戦力データがありません。</div>";
  }

  const memberRow = (m,i) => {
    const avatar=m.image?"<img class='member-avatar ee-role-avatar' src='"+esc(m.image)+"' alt='' loading='lazy' referrerpolicy='no-referrer'>":"<span class='member-avatar ee-role-avatar fallback'>"+esc(m.name.slice(0,1)||"？")+"</span>";
    const href=m.id?"/player?governor_id="+encodeURIComponent(m.id):"#";
    const roleLabel=m.roleLabel|| (m.role?"R"+m.role:"役職不明");
    const roleClass=m.role===5?"role-r5":m.role===4?"role-r4":m.role===3?"role-r3":m.role===2?"role-r2":m.role===1?"role-r1":"role-unknown";
    return "<a class='member' href='"+href+"' data-name='' data-power='"+esc(m.power??-1)+"' data-tc='"+esc(m.tc??-1)+"' data-role='"+esc(m.role??0)+"' style='--name-length:"+Math.min(1,18/Math.max(1,[...m.name].length)).toFixed(3)+"'>"+avatar+"<span class='member-info'><strong>"+esc(m.name)+"</strong><small class='member-tc'>役場 "+townCenterDisplay(m.tc)+"</small><small class='member-role "+roleClass+"'>"+esc(roleLabel)+"</small></span><b class='member-power'>"+compact(m.power)+"</b></a>";
  };
  const rosterHtml=sorted.slice(0,100).map(memberRow).join("");
  const topMembers=powerSorted.slice(0,5).map(memberRow).join("");
  const rankCards=[
    ["戦力順位",powerRank,ranking.get("alliance_power")?.score??alliancePower,ranking.get("alliance_power")?rankDelta(ranking.get("alliance_power").previous_rank,ranking.get("alliance_power").rank):""],
    ["撃破数順位",killsRank,ranking.get("alliance_kills")?.score??alliance.kills,ranking.get("alliance_kills")?rankDelta(ranking.get("alliance_kills").previous_rank,ranking.get("alliance_kills").rank):""]
  ].map(([label,rank,score,delta])=>"<div class='metric'><small>"+esc(label)+"</small><strong>"+(rank==null?"順位データなし":esc(rank)+"位")+"</strong><span>"+(score==null?"—":compact(score))+(delta?" · "+esc(delta):"")+"</span></div>").join("");
  const mark = alliance.avatar_url||alliance.icon_url||alliance.image_url||"";
  const emblem = /^https?:\/\//i.test(String(mark)) ? "<img class='emblem' src='"+esc(mark)+"' alt='' loading='lazy' referrerpolicy='no-referrer'>" : "<span class='emblem fallback'>"+esc(allianceAbbr.slice(0,3))+"</span>";
  const refreshUrl="/alliance?kid="+encodeURIComponent(kid)+"&tag="+encodeURIComponent(tag)+"&refresh=1";
  const html="<main class='wrap alliance-page'><a class='back' href='/kingdom?kid="+kid+"'>← 王国 "+kid+"</a>"+
    "<header class='alliance-hero'>"+emblem+"<div class='alliance-heading'><div class='eyebrow'>ALLIANCE PROFILE</div><h1>"+esc(allianceName)+"</h1><p>["+esc(allianceAbbr)+"] · 王国 "+kid+"</p><small>同盟ID："+esc(allianceAid)+"</small></div><a class='refresh' href='"+refreshUrl+"'>↻ 最新情報を取得</a></header>"+
    (statusMessage?"<div class='notice'>"+esc(statusMessage)+"</div>":"")+
    "<section><div class='section-title'><h2>同盟概要</h2><small>取得 "+esc(ts(row.last_seen_at||row.updated_at))+"</small></div><div class='metrics'>"+
      "<div class='metric'><small>同盟戦力</small><strong>"+compact(alliancePower)+"</strong><span>"+(powerRank==null?"順位データなし":"戦力順位 "+esc(powerRank)+"位")+"</span></div>"+
      "<div class='metric'><small>メンバー数</small><strong>"+num(memberCount||members.length)+"</strong><span>Roster取得 "+num(members.length)+"人</span></div>"+
      "<div class='metric'><small>平均メンバー戦力</small><strong>"+compact(average)+"</strong><span>戦力取得 "+num(known.length)+"人</span></div>"+
      "<div class='metric'><small>上位10人の戦力比</small><strong>"+(topTenShare===null?"—":topTenShare+"%")+"</strong><span>取得済みメンバー内</span></div>"+rankCards+"</div></section>"+
    "<section><h2>メンバー戦力分布</h2>"+distribution+"</section>"+
    "<section><div class='section-title'><h2>上位メンバー</h2><small>戦力順</small></div><div class='list'>"+(topMembers||"<div class='empty'>メンバー情報がありません。</div>")+"</div></section>"+
    "<section><div class='section-title'><h2>メンバー一覧</h2><small>最大100人表示</small></div><div class='tools'><input id='member-search' type='search' placeholder='メンバー名で検索'><select id='member-sort'><option value='role'>役職順（R5→R1）</option><option value='power'>戦力が高い順</option><option value='power-asc'>戦力が低い順</option><option value='name'>名前順</option><option value='tc'>役場レベル順</option></select></div><div class='list member-grid' id='member-list'>"+(rosterHtml||"<div class='empty'>"+esc(statusMessage||"Roster詳細はまだありません。")+"</div>")+"</div><div class='empty' id='no-members' hidden>一致するメンバーがいません。</div></section>"+
    "<section><h2>同盟戦力の推移</h2>"+historyHtml+"</section><section><h2>メンバー戦力の増減</h2>"+memberPowerChangesHtml+"</section><section><h2>メンバーの加入・脱退</h2>"+changeHtml+"</section>"+
    "<section><h2>データ状況</h2><div class='data-status'><div><small>最終保存</small><b>"+esc(ts(row.last_seen_at||row.updated_at))+"</b></div><div><small>履歴スナップショット</small><b>"+num(history.length)+"件</b></div><div><small>R2</small><b>"+(row.r2_latest_key?"保存あり":"未保存")+"</b></div></div><p class='muted'>履歴分析は保存済みデータがある場合のみ表示します。メンバー一覧は取得済みRosterの先頭100人です。</p></section>"+
    "<div class='actions'><a href='/kingdom/alliances?kid="+kid+"'>← 同盟一覧</a><a href='/kingdom/rankings?kid="+kid+"&board=alliance_power'>同盟戦力ランキング</a><a href='/kingdom/rankings?kid="+kid+"&board=alliance_kills'>撃破数ランキング</a></div>"+
    " <style>"+EAGLEEYE_ROLE_AVATAR_CSS+".alliance-page{padding-bottom:60px}.alliance-hero{display:flex;align-items:center;gap:12px;margin:14px 0;padding:15px;border:1px solid #294763;border-radius:18px;background:linear-gradient(135deg,#12263b,#0b1727)}.emblem{width:58px;height:58px;flex:0 0 58px;border-radius:14px;object-fit:cover;border:1px solid #3b5c78}.emblem.fallback{display:grid;place-items:center;background:#18334c;color:#8de9ff;font-weight:950}.alliance-heading{min-width:0;flex:1}.alliance-heading .eyebrow{margin:0;font-size:10px}.alliance-heading h1{overflow-wrap:anywhere;font-size:clamp(21px,5vw,29px);margin:4px 0}.alliance-heading p{margin:0;color:#a8c4db}.alliance-heading small{display:block;color:#6f8ca5;margin-top:4px;font-size:10px}.refresh{padding:9px;border:1px solid #28627d;border-radius:10px;background:#0d2c40;color:#9deaff;text-decoration:none;font-size:11px;font-weight:850;white-space:nowrap}.notice{margin:10px 0;padding:10px;border:1px solid #36516a;border-radius:10px;background:#10263a;color:#b9d7eb;font-size:12px}.section-title{display:flex;align-items:center;justify-content:space-between;gap:8px}.section-title small,.muted{color:#7892a9;font-size:10px}.metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.metric{min-width:0;padding:11px;border:1px solid #29445e;border-radius:12px;background:linear-gradient(140deg,#122238,#0b1727)}.metric small{display:block;color:#8ea8c0;font-size:10px}.metric strong{display:block;margin:5px 0 2px;font-size:clamp(17px,4vw,22px);overflow-wrap:anywhere}.metric span{display:block;color:#8be9f8;font-size:10px}.distribution{display:grid;gap:10px;padding:14px;border:1px solid #29445e;border-radius:14px;background:#0c1a2b}.dist-chart-wrap{display:grid;grid-template-columns:minmax(120px, .85fr) minmax(0,1.5fr);align-items:center;gap:18px}.dist-donut{width:min(100%,190px);aspect-ratio:1;border-radius:50%;display:grid;place-items:center;margin:auto;position:relative}.dist-donut-hole{width:61%;height:61%;border-radius:50%;background:#0c1a2b;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.dist-donut-hole strong{font-size:25px;line-height:1.1;color:#f0f8ff}.dist-donut-hole span{font-size:9px;color:#91abc2;margin-top:4px}.dist-legend{display:grid;gap:10px;min-width:0}.dist-legend-row{display:grid;grid-template-columns:9px minmax(0,1fr) auto auto;gap:6px;align-items:center;color:#a8c4db;font-size:10px}.dist-legend-row i{width:8px;height:8px;border-radius:3px}.dist-legend-row span{overflow-wrap:anywhere}.dist-legend-row b{color:#e5f3ff;white-space:nowrap}.dist-legend-row small{color:#8be9f8;text-align:right;min-width:32px}.dist-note{margin:0;color:#7892a9;font-size:10px}.tc-gold{color:#f6c84b;font-weight:900;text-shadow:0 0 10px rgba(246,200,75,.18);white-space:nowrap}.tc-gold small{color:#d5ae42;font-size:9px}@media(max-width:380px){.dist-chart-wrap{grid-template-columns:1fr}.dist-donut{width:150px}.dist-legend{gap:8px}}.list{display:grid;gap:7px}.member-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;align-items:stretch}.member{display:grid;grid-template-columns:30px minmax(0,1fr) auto;grid-template-rows:auto;column-gap:7px;align-items:center;padding:9px;border:1px solid #213c55;border-radius:11px;background:#0d1d2f;color:#edf7ff;text-decoration:none;min-width:0;min-height:70px}.member-avatar{grid-column:1;grid-row:1;width:30px;height:30px;border-radius:8px;object-fit:cover;background:#19324a;border:2px solid rgba(196,224,247,.72);box-shadow:0 0 0 2px #071321, inset 0 1px 2px rgba(255,255,255,.24), 0 2px 5px rgba(0,0,0,.42)}.member-avatar.fallback{display:grid;place-items:center;color:#a5e9f7;font-weight:900;border-color:rgba(141,233,255,.82)}.member[data-role='5'] .member-avatar{border-color:#f0c75e;box-shadow:0 0 0 2px #071321,inset 0 1px 2px rgba(255,244,198,.55),0 0 9px rgba(240,199,94,.68),0 2px 5px rgba(0,0,0,.42)}.member[data-role='4'] .member-avatar{border-color:#bca0ff;box-shadow:0 0 0 2px #071321,inset 0 1px 2px rgba(239,226,255,.48),0 0 9px rgba(188,160,255,.58),0 2px 5px rgba(0,0,0,.42)}.member[data-role='3'] .member-avatar{border-color:#70dfff;box-shadow:0 0 0 2px #071321,inset 0 1px 2px rgba(220,248,255,.48),0 0 9px rgba(112,223,255,.56),0 2px 5px rgba(0,0,0,.42)}.member[data-role='2'] .member-avatar{border-color:#79e5a5;box-shadow:0 0 0 2px #071321,inset 0 1px 2px rgba(222,255,234,.44),0 0 9px rgba(121,229,165,.5),0 2px 5px rgba(0,0,0,.42)}.member[data-role='1'] .member-avatar{border-color:#a9bacb;box-shadow:0 0 0 2px #071321,inset 0 1px 2px rgba(255,255,255,.38),0 0 8px rgba(169,186,203,.38),0 2px 5px rgba(0,0,0,.42)}.member-info{grid-column:2;grid-row:1;min-width:0;align-self:center}.member strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:clamp(8px,2.8vw,11px);line-height:1.3;letter-spacing:-.02em}.member small{display:block;margin-top:3px;font-size:9px;line-height:1.25;overflow-wrap:anywhere}.member-tc{color:#829bb1}.member-role{width:fit-content;padding:2px 5px;border:1px solid transparent;border-radius:5px;font-weight:850}.role-r5{color:#ffd978;background:#3c2e12;border-color:#856626}.role-r4{color:#c9b5ff;background:#2b2147;border-color:#65509a}.role-r3{color:#82dfff;background:#103448;border-color:#286783}.role-r2{color:#91edb5;background:#123528;border-color:#28694a}.role-r1{color:#c4d1df;background:#202d3b;border-color:#41556a}.role-unknown{color:#91a9c0;background:#172638;border-color:#2a4157}.member-power{grid-column:3;grid-row:1;justify-self:end;text-align:right;font-size:13px;white-space:nowrap;font-variant-numeric:tabular-nums;color:#e5f4ff;padding-left:2px}.member[hidden]{display:none}@media(max-width:390px){.member-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.member{min-height:70px}}.tools{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0}.tools input,.tools select{width:100%;min-width:0;padding:11px;border:1px solid #2b4b66;border-radius:10px;background:#091727;color:#eaf6ff;font:inherit;font-size:12px}.history{display:grid;grid-auto-columns:minmax(65px,1fr);grid-auto-flow:column;gap:8px;overflow-x:auto;padding:12px;border:1px solid #29445e;border-radius:12px;background:#0c1a2b}.history>div{height:130px;display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0}.history>div>i{align-self:center;margin-top:auto;width:22px;min-height:4px;border-radius:5px 5px 0 0;background:linear-gradient(180deg,#66e5f6,#11779a)}.history>div>b{font-size:10px;text-align:center;overflow-wrap:anywhere}.history>div>small{color:#7d96ad;font-size:9px;text-align:center}.change-counts,.change-cols{display:grid;grid-template-columns:1fr 1fr;gap:8px}.change-counts>div,.change-cols>div{padding:11px;border:1px solid #29445e;border-radius:11px;background:#0d1d2f}.change-counts b{font-size:20px;margin-left:8px}.power-changes{display:grid;gap:6px}.power-changes>div{display:flex;justify-content:space-between;gap:10px;padding:9px 10px;border:1px solid #29445e;border-radius:9px;background:#0d1d2f;font-size:11px}.power-changes span{overflow-wrap:anywhere}.power-changes b{white-space:nowrap;font-variant-numeric:tabular-nums}.power-changes .up{color:#5ee5a5}.power-changes .down{color:#f6a3a3}.change-cols h3{font-size:12px;margin:0 0 8px}.change-cols p{font-size:11px;overflow-wrap:anywhere;border-bottom:1px solid #20384e;padding-bottom:5px}.data-status{display:grid;gap:7px}.data-status>div{display:flex;justify-content:space-between;gap:10px;padding:10px;border:1px solid #29445e;border-radius:10px;background:#0d1d2f}.data-status small{color:#8ea8c0}.data-status b{text-align:right;font-size:11px}.actions{display:flex;flex-wrap:wrap;gap:7px}.actions a{padding:10px;border:1px solid #25415f;border-radius:11px;background:#0c1c2d;color:#9eeeff;text-decoration:none;font-size:11px;font-weight:750}@media(max-width:520px){.alliance-hero{flex-wrap:wrap;align-items:flex-start}.alliance-heading{width:calc(100% - 74px)}.refresh{margin-left:auto}.tools{grid-template-columns:1fr}.change-cols{grid-template-columns:1fr}}@media(min-width:720px){.metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.data-status{grid-template-columns:repeat(3,minmax(0,1fr))}}</style>"+
    "<script>(function(){const list=document.getElementById('member-list'),search=document.getElementById('member-search'),sort=document.getElementById('member-sort'),empty=document.getElementById('no-members');if(!list)return;const rows=Array.from(list.querySelectorAll('.member'));function apply(){const q=(search?.value||'').trim().toLowerCase(),mode=sort?.value||'power';const visible=rows.filter(r=>(r.dataset.name||r.textContent.toLowerCase()).includes(q));visible.sort((a,b)=>mode==='name'?a.textContent.localeCompare(b.textContent,'ja'):mode==='tc'?Number(b.dataset.tc||-1)-Number(a.dataset.tc||-1):mode==='role'?Number(b.dataset.role||0)-Number(a.dataset.role||0)||Number(b.dataset.power||-1)-Number(a.dataset.power||-1):mode==='power-asc'?Number(a.dataset.power||-1)-Number(b.dataset.power||-1):Number(b.dataset.power||-1)-Number(a.dataset.power||-1));visible.forEach(r=>{r.hidden=false;list.appendChild(r)});rows.filter(r=>!visible.includes(r)).forEach(r=>r.hidden=true);if(empty)empty.hidden=visible.length>0;}rows.forEach(r=>{r.dataset.name=(r.querySelector('strong')?.textContent||'').toLowerCase();r.dataset.tc=r.dataset.tc||-1;r.dataset.power=r.dataset.power||-1;r.dataset.role=r.dataset.role||0});search?.addEventListener('input',apply);sort?.addEventListener('change',apply);apply()})();</script>"+
    "</main>";
  return page("同盟 "+allianceAbbr,html);
}
export async function renderKingdomComparePage(request, env) {
  const url = new URL(request.url);
  const kids = [...new Set(
    url.searchParams.getAll("kid")
      .flatMap(value => String(value).split(","))
      .map(Number)
      .filter(value => Number.isInteger(value) && value > 0)
  )].slice(0, 4);

  if (kids.length < 2) {
    return page("王国比較", "<main class='wrap'><h1>王国比較</h1><p>URLに ?kid=1&kid=2 のように2王国以上を指定してください。</p></main>");
  }

  const placeholders = kids.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    "SELECT kid,name,status,raw_json,source_observed_at,last_seen_at,r2_latest_key FROM kingdom_catalog WHERE kid IN (" + placeholders + ") ORDER BY kid"
  ).bind(...kids).all();

  const details = await Promise.all((rows.results || []).map(async row => {
    let archived = null;
    try { archived = await readR2Json(env.ARCHIVE, row.r2_latest_key); } catch {}
    let legacy = null;
    if (!archived?.payload && row.raw_json) {
      try { legacy = JSON.parse(row.raw_json); } catch {}
    }
    const payload = archived?.payload || legacy || {};
    const detail = payload?.data && typeof payload.data === "object" ? payload.data : payload;
    return { ...row, detail };
  }));

  const cards = details.map(row => {
    const d = row.detail || {};
    const metrics = [
      ["Power", d.power],
      ["平均Power", d.avg_power],
      ["領主数", d.player_count],
      ["Active 7d", d.active_7d],
      ["Active 30d", d.active_30d],
      ["Power Gain 7d", d.power_gain_7d],
      ["TC Pushers 7d", d.tc_pushers_7d],
      ["Health", d.health],
      ["同盟数", d.alliance_count],
      ["Hero Power", d.hero_power],
      ["Troop Power", d.troop_power],
      ["Research Power", d.research_power]
    ];
    return "<article class='compare'><h2>王国 " + esc(row.kid) + "</h2><p>" + esc(row.name || d.name || "名称未取得") + "</p>" +
      "<div class='compare-meta'>最終取得 " + esc(ts(row.last_seen_at)) + " / Provider観測 " + esc(ts(row.source_observed_at || d.source_observed_at)) + "</div>" +
      "<div class='compare-metrics'>" + metrics.map(([label,value]) =>
        "<div><small>" + esc(label) + "</small><strong>" + esc(num(value)) + "</strong></div>"
      ).join("") + "</div></article>";
  }).join("");

  return page("王国比較",
    "<main class='wrap'><a class='back' href='/kingdom-catalog'>← 王国カタログ</a><h1>王国比較</h1><p>最大4王国。現在値と7日成長指標を比較します。詳細payloadは選択した王国だけR2から読み込みます。</p><div class='comparegrid'>" +
    (cards || "<div class='empty'>比較対象がありません。</div>") +
    "</div></main>"
  );
}

export async function handleKingdomPortalApi(request, env) {
  const url = new URL(request.url);

  if (url.pathname === "/api/kingdom-portal/status") {
    const latest = await env.DB.prepare(
      "SELECT status,operation,created_at,error_code FROM system_event_log WHERE service = 'kingdom_portal' ORDER BY created_at DESC LIMIT 1"
    ).first();
    const catalog = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM kingdom_catalog"
    ).first();

    return Response.json({
      ok: true,
      service: "kingdom_portal",
      catalog_count: Number(catalog?.count || 0),
      latest_event: latest || null
    });
  }

  if (url.pathname !== "/api/kingdom-portal/ranking") return null;

  const kid = Number(url.searchParams.get("kid"));
  const board = String(url.searchParams.get("board") || "personal_power");

  if (!Number.isInteger(kid) || kid < 1) {
    return Response.json({ ok: false, error: "INVALID_KID" }, { status: 400 });
  }

  const allowed = BOARDS.some(x => x[0] === board);
  if (!allowed) {
    return Response.json({ ok: false, error: "INVALID_BOARD" }, { status: 400 });
  }

  const rows = await env.DB.prepare(
    "SELECT rank,target_type,target_id,governor_id,nick_name,score,aid,abbr,name,previous_rank,observed_at,source_observed_at FROM kingdom_ranking_current WHERE kid=? AND board=? ORDER BY rank ASC LIMIT 100"
  ).bind(kid, board).all();

  await recordSystemEvent(env.DB, {
    traceId: systemTraceId("kingdom-portal"),
    eventType: "COMPLETE",
    service: "kingdom_portal",
    feature: "ranking_explorer",
    operation: "READ_CURRENT_RANKING",
    status: "SUCCESS",
    targetType: "KINGDOM",
    targetId: String(kid),
    metadata: { board, rowCount: rows.results?.length || 0 }
  }).catch(() => {});

  return Response.json({
    ok: true,
    kid,
    board,
    rows: rows.results || []
  });
}

export async function renderKingdomMightyPage(request, env, auth = null) {
  const url = new URL(request.url);
  const kid = Number(url.searchParams.get("kid"));
  if (!Number.isInteger(kid) || kid < 1) return page("Mighty", "<main class='wrap'><div class='empty'>王国IDを指定してください。</div></main>");

  if (!auth || auth.status !== "ACTIVE") {
    return page("Mighty", "<main class='wrap'><a class='back' href='/kingdom?kid=" + kid + "'>← 王国 " + kid + "</a><h1>Mighty機能</h1><div class='empty'>Mighty機能を利用するにはDiscordログインが必要です。</div></main>");
  }

  const eligibility = await evaluateVipEligibility(env.DB, { env, userId: auth.user_id });
  const canUseMighty = ["VIP", "ADMIN", "OWNER"].includes(String(eligibility.role || "").toUpperCase());
  if (!canUseMighty || !eligibility.eligible) {
    return page("Mighty", "<main class='wrap'><a class='back' href='/kingdom?kid=" + kid + "'>← 王国 " + kid + "</a><h1>Mighty機能</h1><div class='empty'>VIP機能です。Mighty対応のMightPulse APIキーを登録すると利用できます。<br><br>登録APIキー：" + eligibility.keyCount + "本<br>Mighty対応：" + (eligibility.hasMightyKey ? "確認済み" : "未確認") + "</div></main>");
  }

  const traceId = systemTraceId("kingdom-mighty");
  await recordSystemEvent(env.DB, {
    traceId,
    eventType: "START",
    service: "kingdom_mighty",
    feature: "mighty",
    operation: "READ_EVENTS_KVK",
    status: "STARTED",
    targetType: "KINGDOM",
    targetId: String(kid)
  }).catch(() => {});

  let events = null, kvk = null, errors = [];
  try {
    events = await collectUserMightyOnly(env, {
      userId: auth.user_id,
      path: "/kingdoms/" + encodeURIComponent(kid) + "/events",
      endpoint: "/kingdoms/:kid/events",
      targetType: "KINGDOM",
      targetId: String(kid),
      purpose: "MIGHTY_KINGDOM_EVENTS",
      timeoutMs: 15000,
      maxRetries: 2
    });
  } catch (e) {
    errors.push("イベント: " + String(e?.code || e?.message || e));
  }
  try {
    kvk = await collectUserMightyOnly(env, {
      userId: auth.user_id,
      path: "/kingdoms/" + encodeURIComponent(kid) + "/kvk",
      endpoint: "/kingdoms/:kid/kvk",
      targetType: "KINGDOM",
      targetId: String(kid),
      purpose: "MIGHTY_KINGDOM_KVK",
      timeoutMs: 15000,
      maxRetries: 2
    });
  } catch (e) {
    errors.push("KvK: " + String(e?.code || e?.message || e));
  }

  await recordSystemEvent(env.DB, {
    traceId,
    eventType: "COMPLETE",
    service: "kingdom_mighty",
    feature: "mighty",
    operation: "READ_EVENTS_KVK",
    status: errors.length ? "WARNING" : "SUCCESS",
    targetType: "KINGDOM",
    targetId: String(kid),
    message: errors.length ? errors.join(" | ") : "Mighty Events / KvK取得完了"
  }).catch(() => {});

  const eventPayload = events?.result?.data || events?.result || {};
  const kvkPayload = kvk?.result?.data || kvk?.result || {};
  const eventData = eventPayload && typeof eventPayload === "object" ? eventPayload : {};
  const categories = Array.isArray(eventData.categories) ? eventData.categories : [];

  const eventCategoryNames = {
    Deals: "お得情報",
    Events: "イベント",
    Deal: "お得情報"
  };
  const eventNames = {
    "Hero Rally": "英雄ラリー",
    "Hero Roulette": "英雄ルーレット",
    "Treasure Cove": "トレジャーコーブ"
  };

  const labelMap = {
    ok: "状態",
    kid: "王国",
    date: "対象日",
    count: "イベント数",
    categories: "カテゴリ",
    events: "イベント",
    name: "名称",
    category: "カテゴリ",
    when: "開催期間",
    begin_ts: "開始日時",
    end_ts: "終了日時",
    date_ts: "日時",
    kingdom: "王国",
    kingdom_id: "王国番号",
    opponent: "対戦相手",
    opponents: "対戦相手",
    matchup: "対戦組み合わせ",
    matchups: "対戦組み合わせ",
    round: "ラウンド",
    start: "開始",
    end: "終了",
    start_ts: "開始日時",
    status: "状態"
  };

  const translateLabel = key => {
    const raw = String(key || "");
    if (labelMap[raw]) return labelMap[raw];
    return raw.replace(/_/g, " ").replace(/(^| )([a-z])/g, (_, p, ch) => p + ch.toUpperCase());
  };

  const fmtDate = value => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return new Date(n * 1000).toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const fmtDateOnly = value => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "—";
    return new Date(n * 1000).toLocaleDateString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  };

  const eventStatus = (begin, end) => {
    const now = Math.floor(Date.now() / 1000);
    const b = Number(begin || 0), e = Number(end || 0);
    if (b && e && now >= b && now < e) return { cls: "live", label: "開催中" };
    if (b && now < b) return { cls: "upcoming", label: "開催予定" };
    if (e && now >= e) return { cls: "ended", label: "終了" };
    return { cls: "unknown", label: "期間不明" };
  };

  const eventRows = categories.map(category => {
    const categoryName = eventCategoryNames[category?.name] || String(category?.name || "イベント");
    const rows = (Array.isArray(category?.events) ? category.events : []).map(event => {
      const title = eventNames[event?.name] || String(event?.name || "名称未取得");
      const original = event?.name && eventNames[event.name] ? "<small class='original-name'>" + esc(event.name) + "</small>" : "";
      const status = eventStatus(event?.begin_ts, event?.end_ts);
      const begin = fmtDate(event?.begin_ts);
      const end = fmtDate(event?.end_ts);
      const period = begin && end ? begin + " ～ " + end : String(event?.when || "開催期間不明");
      return "<article class='mighty-event " + status.cls + "'>" +
        "<div class='event-top'><span class='event-status " + status.cls + "'>" + status.label + "</span><span class='event-category'>" + esc(categoryName) + "</span></div>" +
        "<h3>" + esc(title) + "</h3>" + original +
        "<div class='event-period'>🗓 " + esc(period) + "</div>" +
        "</article>";
    }).join("");
    return rows ? "<section class='mighty-section'><div class='section-heading'><div><span class='section-kicker'>EVENTS</span><h2>" + esc(categoryName) + "</h2></div><span class='count-pill'>" + (Array.isArray(category?.events) ? category.events.length : 0) + "件</span></div><div class='event-grid'>" + rows + "</div></section>" : "";
  }).join("");

  const renderValue = (value, depth = 0) => {
    if (value === null || value === undefined || value === "") return "<span class='muted'>—</span>";
    if (typeof value === "boolean") return value ? "はい" : "いいえ";
    if (typeof value === "number") return Number.isInteger(value) ? num(value) : esc(value);
    if (typeof value === "string") return esc(value);

    if (Array.isArray(value)) {
      if (!value.length) return "<span class='muted'>なし</span>";
      if (depth >= 3) return "<span class='muted'>" + esc(JSON.stringify(value)) + "</span>";
      return "<div class='kvk-list'>" + value.map(item => "<div class='kvk-list-item'>" + renderValue(item, depth + 1) + "</div>").join("") + "</div>";
    }

    if (depth >= 3) return "<span class='muted'>" + esc(JSON.stringify(value)) + "</span>";

    const entries = Object.entries(value).filter(([key, val]) => val !== null && val !== undefined && val !== "");
    if (!entries.length) return "<span class='muted'>なし</span>";

    return "<div class='kvk-fields'>" + entries.map(([key, val]) => {
      const label = translateLabel(key);
      let display = renderValue(val, depth + 1);
      if (/_ts$/.test(key) && Number(val) > 0) display = esc(fmtDate(val) || String(val));
      return "<div class='kvk-field'><small>" + esc(label) + "</small><strong>" + display + "</strong></div>";
    }).join("") + "</div>";
  };

  const kvkHtml = kvkPayload && typeof kvkPayload === "object"
    ? renderValue(kvkPayload)
    : "<div class='empty'>KvKデータがありません。</div>";

  const eventDate = eventData.date ? String(eventData.date) : null;
  const eventCount = Number(eventData.count || categories.reduce((n, c) => n + (Array.isArray(c?.events) ? c.events.length : 0), 0));

  return page("Mighty Events / KvK", "<main class='wrap mighty-page'>" +
    "<a class='back' href='/kingdom?kid=" + kid + "'>← 王国 " + kid + "</a>" +
    "<div class='mighty-hero'>" +
      "<div><div class='eyebrow'>MIGHTY / KVK</div><h1>王国 " + kid + " <span>· Mighty</span></h1><p>イベント・KvK情報</p></div>" +
      "<div class='mighty-badge'>⚡ Mighty API 接続済み</div>" +
    "</div>" +
    (errors.length ? "<div class='notice warn'>⚠️ " + errors.map(esc).join("<br>") + "</div>" : "") +
    "<div class='summary-grid'>" +
      "<div class='summary-card'><small>イベント日</small><strong>" + esc(eventDate || "—") + "</strong></div>" +
      "<div class='summary-card'><small>イベント数</small><strong>" + esc(eventCount) + "<span>件</span></strong></div>" +
      "<div class='summary-card'><small>最終取得</small><strong>" + esc(new Date().toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" })) + "</strong></div>" +
    "</div>" +
    (eventRows || "<section class='mighty-section'><div class='empty'>イベントデータがありません。</div></section>") +
    "<section class='mighty-section kvk-section'><div class='section-heading'><div><span class='section-kicker'>KVK</span><h2>KvK情報</h2></div></div>" + kvkHtml + "</section>" +
    "<details class='raw-details'><summary>API原文を確認</summary><div class='raw-grid'><pre>" + esc(JSON.stringify(eventPayload, null, 2)) + "</pre><pre>" + esc(JSON.stringify(kvkPayload, null, 2)) + "</pre></div></details>" +
    "<style>" +
      ".mighty-page{padding-bottom:60px}.mighty-hero{margin-top:14px;padding:20px;border:1px solid #334155;border-radius:18px;background:linear-gradient(135deg,#17233a,#111827);display:flex;justify-content:space-between;align-items:center;gap:14px}.mighty-hero h1{margin:4px 0;font-size:28px}.mighty-hero h1 span{color:#fbbf24;font-size:18px}.mighty-hero p{margin:6px 0 0;color:#94a3b8}.mighty-badge{padding:9px 12px;border:1px solid #b45309;border-radius:999px;background:#2a1c08;color:#fbbf24;font-weight:900;font-size:12px;white-space:nowrap}.notice.warn{margin-top:12px;padding:12px 14px;border:1px solid #92400e;border-radius:12px;background:#2a1c08;color:#fde68a}.summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:12px}.summary-card{padding:13px;border:1px solid #334155;border-radius:12px;background:#111c31}.summary-card small{display:block;color:#94a3b8;font-size:11px}.summary-card strong{display:block;margin-top:4px;font-size:18px}.summary-card strong span{font-size:12px;color:#94a3b8;margin-left:3px}.mighty-section{margin-top:18px}.section-heading{display:flex;justify-content:space-between;align-items:end;gap:10px;margin-bottom:9px}.section-kicker{display:block;color:#f59e0b;font-size:10px;font-weight:900;letter-spacing:1.7px}.section-heading h2{margin:2px 0;font-size:21px}.count-pill{padding:5px 8px;border:1px solid #334155;border-radius:999px;color:#cbd5e1;font-size:11px}.event-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.mighty-event{padding:13px;border:1px solid #334155;border-left:3px solid #64748b;border-radius:12px;background:#111c31}.mighty-event.live{border-left-color:#22c55e}.mighty-event.upcoming{border-left-color:#f59e0b}.mighty-event.ended{border-left-color:#64748b;opacity:.72}.event-top{display:flex;gap:6px;justify-content:space-between;align-items:center}.event-status{padding:4px 7px;border-radius:999px;font-size:10px;font-weight:900;border:1px solid #334155}.event-status.live{color:#86efac;border-color:#166534;background:#052e16}.event-status.upcoming{color:#fde68a;border-color:#92400e;background:#2a1c08}.event-status.ended{color:#94a3b8}.event-category{color:#94a3b8;font-size:10px}.mighty-event h3{margin:10px 0 2px;font-size:16px}.original-name{color:#64748b}.event-period{margin-top:8px;color:#cbd5e1;font-size:12px;line-height:1.5}.kvk-section{padding-top:2px}.kvk-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.kvk-field{padding:11px;border:1px solid #334155;border-radius:10px;background:#111c31}.kvk-field small{display:block;color:#64748b;font-size:10px}.kvk-field strong{display:block;margin-top:4px;overflow-wrap:anywhere}.kvk-list{display:grid;gap:7px}.kvk-list-item{padding:9px;border:1px solid #334155;border-radius:9px;background:#111c31}.muted{color:#64748b}.raw-details{margin-top:18px;border:1px solid #334155;border-radius:12px;background:#0b1220}.raw-details summary{cursor:pointer;padding:12px;color:#94a3b8;font-weight:800}.raw-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 10px 10px}.raw-grid pre{margin:0;padding:10px;overflow:auto;max-height:420px;color:#cbd5e1;font-size:10px;white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:650px){.mighty-hero{align-items:flex-start;flex-direction:column}.mighty-badge{white-space:normal}.summary-grid{grid-template-columns:1fr 1fr}.summary-card:last-child{grid-column:1/-1}.event-grid,.kvk-fields,.raw-grid{grid-template-columns:1fr}}" +
    "</style>" +
    "</main>");
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
  const targetType = ["alliance_power","alliance_kills"].includes(board) ? "ALLIANCE" : "PLAYER";
  const events = await env.DB.prepare(
    "SELECT target_id,change_type,field_name,old_value_json,new_value_json,detected_at FROM change_events WHERE target_type=? AND detected_at >= (SELECT COALESCE(last_checked_at,0) FROM kingdom_ranking_board_state WHERE kid=? AND board=?) ORDER BY detected_at DESC LIMIT 100"
  ).bind(targetType,kid,board).all();
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
  return "<!doctype html><html lang='ja'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>"+esc(title)+" | EagleEye</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.wrap{max-width:980px;margin:auto;padding:24px 14px 48px}.back{color:#94a3b8;text-decoration:none}.eyebrow{margin-top:22px;color:#f59e0b;font-size:11px;font-weight:900;letter-spacing:2px}.hero{margin-top:16px;padding:20px;border:1px solid #334155;border-radius:18px;background:#111c31;display:flex;justify-content:space-between;gap:12px}.hero h1,h1{margin:4px 0;font-size:28px}.hero p{color:#94a3b8}.hero button,.actions a{border:1px solid #475569;background:#17233a;color:#f8fafc;padding:9px 12px;border-radius:10px;text-decoration:none;font-weight:800}.actions{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:9px}.card,.compare,.fresh,.momentum{padding:14px;border:1px solid #334155;border-radius:12px;background:#111c31}.card small{display:block;color:#94a3b8}.card strong{display:block;margin-top:5px;font-size:18px}.momentum{display:grid;grid-template-columns:1fr 1fr;gap:10px}.list{display:grid;gap:7px}.row{display:grid;grid-template-columns:45px 1fr auto auto;gap:8px;align-items:center;padding:11px 12px;border:1px solid #334155;border-radius:10px;background:#162238;color:#fff;text-decoration:none}.row em{font-style:normal;color:#f59e0b}.row small{color:#94a3b8}.boards{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:7px}.board,.boardtabs a{display:block;padding:10px;border:1px solid #334155;border-radius:9px;background:#111c31;color:#fff;text-decoration:none}.board small{display:block;color:#64748b;margin-top:4px}.boardtabs{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}.boardtabs a.active{border-color:#f59e0b;color:#f59e0b}.rank{display:grid;grid-template-columns:45px 1fr auto 55px 35px;gap:8px;align-items:center;padding:10px;border-bottom:1px solid #243247}.rank a{color:#fff;text-decoration:none}.rank span{color:#f59e0b}.rank small{color:#94a3b8}.star{border:0;background:none;color:#f59e0b;font-size:18px}.comparegrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px}.compare-meta{color:#64748b;font-size:11px;margin:8px 0 12px}.compare-metrics{display:grid;grid-template-columns:1fr 1fr;gap:7px}.compare-metrics div{padding:9px;border:1px solid #334155;border-radius:9px;background:#0f1a2d}.compare-metrics small{display:block;color:#94a3b8}.compare-metrics strong{display:block;margin-top:3px}.empty{padding:18px;border:1px dashed #475569;border-radius:12px;color:#94a3b8}section{margin-top:24px}section h2{font-size:18px}@media(max-width:600px){.hero{flex-direction:column}.row{grid-template-columns:35px 1fr auto}.row small{display:none}.rank{grid-template-columns:35px 1fr auto 35px 30px}}</style></head><body>"+body+"</body></html>";
}
