import { collectMightPulseThroughGuards, collectMightyOnly, collectUserMightyOnly } from "./data-collection-engine.js";
import { evaluateVipEligibility } from "./user-eligibility.js";
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
  const url=new URL(request.url); const kid=Number(url.searchParams.get("kid")); const tag=String(url.searchParams.get("tag")||"").trim();
  if(!Number.isInteger(kid)||!tag) return page("同盟詳細","<div class='empty'>王国と同盟タグを指定してください。</div>");
  let row=await env.DB.prepare("SELECT * FROM alliance_catalog WHERE kid = ? AND (abbr = ? OR aid = ?) LIMIT 1").bind(kid,tag,tag).first();
  if (!row) {
    row = await env.DB.prepare(
      "SELECT kid,aid,abbr,name,score AS power,rank AS power_rank FROM kingdom_ranking_current WHERE kid=? AND board='alliance_power' AND target_type='ALLIANCE' AND (abbr=? OR aid=? OR target_id=?) LIMIT 1"
    ).bind(kid,tag,tag,tag).first();
  }
  if (!row) return page("同盟詳細","<main class='wrap'><a class='back' href='/kingdom?kid="+kid+"'>← 王国 "+kid+"</a><div class='empty'>指定された同盟が見つかりません。</div></main>");
  let archived=null; try{archived=await readR2Json(env.ARCHIVE,row?.r2_latest_key)}catch{}
  const payload=archived?.payload||{};
  const alliance=payload?.alliance||payload?.data?.alliance||payload;
  const members=Array.isArray(payload?.roster)?payload.roster:Array.isArray(payload?.members)?payload.members:Array.isArray(payload?.data?.roster)?payload.data.roster:[];
  const roster=members.slice(0,100).map(m=>"<a class='row' href='/player?governor_id="+encodeURIComponent(m.governor_id||m.uid||"")+"'><span>"+esc(m.nick_name||m.governor_id||m.uid)+"</span><em>"+num(m.power)+"</em><small>役場 "+esc(m.town_center_level??"—")+"</small></a>").join("");
  return page("同盟 "+(row?.abbr||tag),"<main class='wrap'><a class='back' href='/kingdom?kid="+kid+"'>← 王国 "+kid+"</a><h1>"+esc(alliance.name||row?.name||tag)+"</h1><p>"+esc(alliance.abbr||row?.abbr||tag)+" · Power "+esc(num(alliance.power||row?.power))+" · "+esc(num(alliance.count||row?.member_count||"—"))+"人</p><div class='actions'><a href='/kingdom/alliances?kid="+kid+"'>同盟一覧</a></div><section><h2>Roster</h2><div class='list'>"+(roster||"<div class='empty'>Roster詳細はまだR2に保存されていません。ランキングcurrentから基本情報のみ表示しています。</div>")+"</div></section></main>");
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
    end_ts: "終了日時",
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
    "</main>" +
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
