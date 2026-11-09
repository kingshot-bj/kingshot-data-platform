// 同盟比較（聖剣争奪の下見用）。違う王国の同盟どうしも比べられる。ADVANCED以上。
// ・同盟は「王国番号:同盟タグ」で2〜4個。メンバー表は同盟詳細と同じしくみで読む（古ければログイン中に取りに行く）。
// ・上位N人（3／10／20／30／全員）の合計・平均、上位どうしの並び、戦力帯ごとの人数。最初は上位3人。
// ・数字はメンバー表の「戦力（総合）」。聖剣のマッチングは部隊戦闘力なので「目安」と書く。勝敗の予想はしない。

export const ALLIANCE_COMPARE_MAX = 4;
export const ALLIANCE_COMPARE_TOP_OPTIONS = Object.freeze([3, 10, 20, 30, 0]); // 0 = 全員
export const ALLIANCE_COMPARE_DEFAULT_TOP = 3;
export const ALLIANCE_COMPARE_ROLES = Object.freeze(["ADVANCED", "VIP", "ADMIN", "OWNER"]);
// 秘境の試練：各同盟の戦力上位3人（2同盟なら6人）を集めて、ステージごとに進んでいる順に並べる。
// 値はプレイヤー比較と同じ王国ランキング（上位100人）。ステージは「種別×10000＋番号」なので種別の分を引いて「章-ステージ」に。
export const MYSTIC_TOP = 3;
export const MYSTIC_COMPARE_BOARDS = Object.freeze([
  ["mystic_trial", "秘境の試練（総合）", 0], ["coliseum", "闘技場", 10000], ["forest_of_life", "生命の森", 20000], ["crystal_cave", "水晶鉱山", 30000],
  ["knowledge_nexus", "知識の枢軸", 40000], ["molten_fort", "溶岩要塞", 50000], ["radiant_spire", "輝光の塔", 60000]
]);
const MYSTIC_KEYS = MYSTIC_COMPARE_BOARDS.map(b => b[0]);
const MYSTIC_ID_CHUNK = 80; // D1 の1文あたりの値は100個まで（王国1＋種類7＋ID80）
export function topByPower(members, n = MYSTIC_TOP) {
  return (members || []).filter(m => m && m.id && m.power !== null && Number.isFinite(Number(m.power))).sort((a, b) => Number(b.power) - Number(a.power)).slice(0, n);
}
// 戦力上位3人ぶんだけ読む（IDで絞るので、読むのは見つかった行だけ）。
// 戻り値：{ checked: [board...]（その王国で取得済みの種類）, values: { governor_id: { board: score } } }
export async function loadAllianceMystic(db, alliance) {
  const kid = Number(alliance?.kid);
  const ids = [...new Set(topByPower(alliance?.members).map(m => String(m.id)))];
  if (!db || !ids.length || !Number.isInteger(kid)) return { checked: [], values: {} };
  const ph = a => a.map(() => "?").join(",");
  const chunks = [];
  for (let i = 0; i < ids.length; i += MYSTIC_ID_CHUNK) chunks.push(ids.slice(i, i + MYSTIC_ID_CHUNK));
  const [state, ...parts] = await Promise.all([
    db.prepare("SELECT board FROM kingdom_ranking_board_state WHERE kid = ? AND board IN (" + ph(MYSTIC_KEYS) + ") AND last_checked_at IS NOT NULL").bind(kid, ...MYSTIC_KEYS).all().catch(() => ({ results: [] })),
    ...chunks.map(c => db.prepare("SELECT board, target_id, score FROM kingdom_ranking_current WHERE kid = ? AND target_type = 'PLAYER' AND board IN (" + ph(MYSTIC_KEYS) + ") AND target_id IN (" + ph(c) + ")").bind(kid, ...MYSTIC_KEYS, ...c).all().catch(() => ({ results: [] })))
  ]);
  const values = {};
  for (const part of parts) for (const r of part.results || []) {
    const sc = Number(r.score);
    if (!Number.isFinite(sc)) continue;
    (values[String(r.target_id)] ||= {})[r.board] = sc;
  }
  return { checked: [...new Set((state.results || []).map(r => r.board))], values };
}
// ステージごとに、各同盟の戦力上位3人を集めて進んでいる順に並べる（値の無い人は後ろ）。
export function rankTopPlayersByStage(alliances, board, n = MYSTIC_TOP) {
  const out = [];
  (alliances || []).forEach((a, ai) => topByPower(a?.members, n).forEach(m => {
    const v = a?.mystic?.values?.[String(m.id)]?.[board];
    out.push({ ai, name: m.name, score: v == null ? null : Number(v) });
  }));
  return out.sort((x, y) => (y.score ?? -1) - (x.score ?? -1));
}

export const POWER_BANDS = Object.freeze([[5e8, "5億以上"], [3e8, "3〜5億"], [1e8, "1〜3億"], [0, "1億未満"]]);

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// "1537:LOL" → { kid: 1537, tag: "LOL" }。形が違うものは捨てる。重複も捨てる。
export function parseAllianceCompareTargets(values) {
  const out = [], seen = new Set();
  for (const raw of values || []) {
    for (const part of String(raw || "").split(",")) {
      const m = part.trim().match(/^(\d{1,6})[:：\s]+([^\s:：,]{1,24})$/);
      if (!m) continue;
      const kid = Number(m[1]), tag = m[2];
      const key = kid + ":" + tag.toLowerCase();
      if (!kid || seen.has(key)) continue;
      seen.add(key); out.push({ kid, tag });
      if (out.length >= ALLIANCE_COMPARE_MAX) return out;
    }
  }
  return out;
}

export function canUseAllianceCompare(role) { return ALLIANCE_COMPARE_ROLES.includes(String(role || "").toUpperCase()); }

// 上位N人の集計（N=0は全員）。戦力が分からないメンバーは数えない。
export function summarizeTop(members, n) {
  const known = (members || []).filter(m => Number.isFinite(Number(m.power)) && m.power !== null).map(m => ({ ...m, power: Number(m.power) })).sort((a, b) => b.power - a.power);
  const top = n > 0 ? known.slice(0, n) : known;
  const sum = top.reduce((a, m) => a + m.power, 0);
  return { count: top.length, sum, avg: top.length ? sum / top.length : null, top };
}

export function powerBands(members) {
  const counts = POWER_BANDS.map(() => 0);
  for (const m of members || []) {
    const p = Number(m.power);
    if (!Number.isFinite(p) || m.power === null) continue;
    counts[POWER_BANDS.findIndex(([min]) => p >= min)]++;
  }
  return POWER_BANDS.map(([, label], i) => ({ label, count: counts[i] }));
}

export function compactPower(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e10 ? 1 : 2).replace(/\.?0+$/, "") + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(Math.round(n));
}

const jst = sec => sec ? new Date(sec * 1000 + 9 * 3600 * 1000).toISOString().slice(5, 16).replace("T", " ") : "—";

// 画面。alliances は loadAllianceForCompare の結果の配列。
export function renderAllianceComparePage({ alliances = [], targets = [], top = ALLIANCE_COMPARE_DEFAULT_TOP, message = "" } = {}) {
  const found = alliances.filter(a => !a.error);
  const inputs = Array.from({ length: ALLIANCE_COMPARE_MAX }, (_, i) => {
    const t = targets[i] || {};
    return `<div class="ac-in"><input name="kid" inputmode="numeric" pattern="\\d*" placeholder="王国番号" value="${esc(t.kid || "")}" aria-label="王国番号${i + 1}"><input name="tag" placeholder="同盟タグ" value="${esc(t.tag || "")}" aria-label="同盟タグ${i + 1}"></div>`;
  }).join("");
  const missing = alliances.filter(a => a.error).map(a => `王国${esc(a.kid)}の「${esc(a.tag)}」`).join("・");
  const data = found.map(a => ({ kid: a.kid, abbr: a.abbr, name: a.name, power: a.power, power_rank: a.power_rank, observedAt: a.observedAt, fetched: a.fetched, status: a.status, members: a.members, mystic: a.mystic || null }));
  const mysticBoardsJson = JSON.stringify(MYSTIC_COMPARE_BOARDS);
  const dataJson = JSON.stringify(data).replace(/</g, "\\u003c");
  const topJson = JSON.stringify(ALLIANCE_COMPARE_TOP_OPTIONS.includes(top) ? top : ALLIANCE_COMPARE_DEFAULT_TOP);
  const bandsJson = JSON.stringify(POWER_BANDS);
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>同盟比較 | EagleEye</title><style>
body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:var(--ee-bg,#0a1424);color:var(--ee-text,#e8f3ff)}.wrap{max-width:980px;margin:0 auto;padding:18px 16px 110px}
h1{font-size:22px;margin:6px 0 4px}.lead{font-size:13px;color:var(--ee-subtext,#91a7bf);margin:0 0 12px;line-height:1.6}a{color:var(--ee-cyan,#22d3ee)}
.card{border:1px solid var(--ee-border-soft,#223b57);border-radius:14px;background:var(--ee-panel,#0f2035);padding:12px;margin:12px 0}
.ac-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.ac-in{display:flex;gap:6px}.ac-in input{min-width:0;flex:1;padding:9px;border-radius:9px;border:1px solid var(--ee-border-soft,#223b57);background:var(--ee-bg,#0a1424);color:inherit;font:14px system-ui}.ac-in input[name=kid]{flex:.8}
.ac-go{grid-column:1/-1;padding:11px;border:0;border-radius:10px;background:var(--ee-cyan,#22d3ee);color:#04202a;font:800 14px system-ui}
.tops{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 10px}.tops button{padding:7px 12px;border-radius:999px;border:1px solid var(--ee-border-soft,#223b57);background:var(--ee-panel-raised,#172a40);color:inherit;font:700 13px system-ui}.tops button.on{background:var(--ee-cyan,#22d3ee);color:#04202a;border-color:transparent}
.tbl{width:100%;border-collapse:separate;border-spacing:4px;table-layout:fixed}.tbl th{font-size:11px;color:var(--ee-subtext,#91a7bf);text-align:left;font-weight:700;width:6.5em}.tbl td{background:var(--ee-panel-raised,#172a40);border-radius:9px;padding:8px 6px;text-align:center;font-weight:800;font-size:14px;overflow:hidden;text-overflow:ellipsis}
.tbl td.best{outline:2px solid var(--ee-cyan,#22d3ee)}.tbl thead td{background:none;font-size:13px;line-height:1.3}.tbl thead small{display:block;font-size:10px;color:var(--ee-subtext,#91a7bf);font-weight:600}
.mem{display:block;font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mem small{display:block;font-size:11px;color:var(--ee-subtext,#91a7bf)}
.note{font-size:11px;color:var(--ee-subtext,#91a7bf);line-height:1.6}.warn{font-size:12px;padding:8px 10px;border-radius:9px;border:1px dashed currentColor;margin:8px 0}
h2{font-size:15px;margin:4px 0 8px}.tbl.mys{margin-bottom:10px}.tbl.mys thead th{color:var(--ee-text,#e8f3ff);font-size:13px;width:auto;padding:4px 2px}.tbl.mys th{width:3em}.tbl.mys td.who{text-align:left;padding-left:10px}.tbl td.dim{font-weight:600;font-size:11px;color:var(--ee-subtext,#91a7bf)}
</style></head><body><main class="wrap"><a href="/kingdom/rankings">← ランキング</a>
<h1>同盟比較</h1><p class="lead">違う王国の同盟どうしも比べられます（聖剣争奪の下見に）。王国番号と同盟タグを2〜4組入れてください。</p>
<form class="card ac-form" method="get" action="/alliance/compare" id="acForm">${inputs}<button class="ac-go" type="submit">比べる</button></form>
${message ? `<div class="warn">${esc(message)}</div>` : ""}${missing ? `<div class="warn">見つからなかった同盟：${missing}（王国番号と同盟タグを確かめてください）</div>` : ""}
${found.length >= 2 ? `<section class="card"><div class="tops" id="acTops" role="group" aria-label="比べる人数">${ALLIANCE_COMPARE_TOP_OPTIONS.map(n => `<button type="button" data-n="${n}">${n ? "上位" + n + "人" : "全員"}</button>`).join("")}</div><div id="acBody"></div>
<p class="note">数字は各同盟のメンバー表の「戦力（総合）」です。聖剣争奪のマッチングに使われる部隊戦闘力とは違うので目安として見てください。明るい枠はその行のいちばん上です。</p></section>` : `<p class="note">2つ以上の同盟を入れると比較が表示されます。</p>`}
</main>
<script id="acData" type="application/json">${dataJson}</script>
<script>(function(){
var A=JSON.parse(document.getElementById("acData").textContent||"[]");if(A.length<2)return;
var BANDS=${bandsJson},MB=${mysticBoardsJson},MT=${MYSTIC_TOP},cur=${topJson},body=document.getElementById("acBody"),tops=document.getElementById("acTops");
function e(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function cp(v){var n=Number(v);if(!isFinite(n)||v===null)return "—";var a=Math.abs(n);if(a>=1e9)return (n/1e9).toFixed(a>=1e10?1:2).replace(/\\.?0+$/,"")+"B";if(a>=1e6)return (n/1e6).toFixed(1).replace(/\\.0$/,"")+"M";if(a>=1e3)return (n/1e3).toFixed(1).replace(/\\.0$/,"")+"K";return String(Math.round(n))}
function known(a){return (a.members||[]).filter(function(m){return m.power!==null&&isFinite(Number(m.power))}).map(function(m){return Object.assign({},m,{power:Number(m.power)})}).sort(function(x,y){return y.power-x.power})}
function at(s){if(!s)return "—";var d=new Date(s*1000+324e5).toISOString();return d.slice(5,10).replace("-","/")+" "+d.slice(11,16)}
function row(label,vals,fmt,better){var nums=vals.map(function(v){return v==null||!isFinite(Number(v))?null:Number(v)}),ok=nums.filter(function(v){return v!==null}),best=ok.length>1?(better==="min"?Math.min.apply(null,ok):Math.max.apply(null,ok)):null,uniq=best!==null&&ok.filter(function(v){return v===best}).length===1;return "<tr><th>"+e(label)+"</th>"+vals.map(function(v,i){return "<td class=\\""+(uniq&&nums[i]===best?"best":"")+"\\">"+(fmt?fmt(v):e(v==null?"—":v))+"</td>"}).join("")+"</tr>"}
function stg(v,off){var x=Math.round(Number(v)-off);if(!isFinite(x)||x<1)return null;return (Math.floor((x-1)/10)+1)+"-"+((x-1)%10+1)}
var COL=["#ffd166","#42d9ff","#a18aff","#5ee6a8"];
function top3(a){return (a.members||[]).filter(function(m){return m&&m.id&&m.power!==null&&isFinite(Number(m.power))}).sort(function(x,y){return Number(y.power)-Number(x.power)}).slice(0,MT)}
function mystic(){if(!A.some(function(a){return a.mystic}))return "";var P=A.map(top3);if(!P.some(function(t){return t.length}))return "";
var h="<h2 style=\\"margin-top:14px\\">秘境の試練（各同盟の上位"+MT+"人・"+P.reduce(function(s,t){return s+t.length},0)+"人を比べる）</h2><p class=\\"note\\">"+A.map(function(a,i){return "<b style=\\"color:"+COL[i%4]+"\\">■ "+e(a.abbr||"")+"</b>"}).join("　")+"</p>";
h+=MB.map(function(b){var rows=[];A.forEach(function(a,ai){P[ai].forEach(function(m){var my=a.mystic,v=my&&my.values&&my.values[String(m.id)]&&my.values[String(m.id)][b[0]];rows.push({ai:ai,m:m,v:v==null?null:Number(v),miss:!my?"—":((my.checked||[]).indexOf(b[0])>=0?"100位圏外":"取得中")})})});
rows.sort(function(x,y){return (y.v==null?-1:y.v)-(x.v==null?-1:x.v)});
return "<table class=\\"tbl mys\\"><colgroup><col style=\\"width:3em\\"><col><col style=\\"width:34%\\"></colgroup><thead><tr><th colspan=\\"3\\">"+e(b[1])+"</th></tr></thead><tbody>"+rows.map(function(r,i){var val=r.v==null?r.miss:(b[2]?(stg(r.v,b[2])||"—"):r.v.toLocaleString("ja-JP"));return "<tr><th>"+(r.v==null?"":(i+1)+"位")+"</th><td class=\\"who\\" style=\\"border-left:4px solid "+COL[r.ai%4]+"\\"><span class=\\"mem\\">"+e(r.m.name)+"<small>"+e(A[r.ai].abbr||"")+" · "+cp(r.m.power)+"</small></span></td><td class=\\""+(i===0&&r.v!=null?"best":"")+(r.v==null?" dim":"")+"\\">"+e(val)+"</td></tr>"}).join("")+"</tbody></table>"}).join("");
return h+"<p class=\\"note\\">各同盟の戦力上位"+MT+"人を集めて、ステージごとに進んでいる順に並べています。値は各王国のランキング（上位100人）の最高クリアステージ（章-ステージ）です。「100位圏外」はその王国のランキングに入っていない人、「取得中」はいま取りに行っているところです（少し待って開き直すと出ます）。</p>"}
function render(){
tops.querySelectorAll("button").forEach(function(b){b.classList.toggle("on",Number(b.dataset.n)===cur)});
var K=A.map(known),T=K.map(function(k){return cur>0?k.slice(0,cur):k});
var head="<thead><tr><th></th>"+A.map(function(a){return "<td>"+e(a.abbr||"")+"<small>王国"+e(a.kid)+(a.name?" · "+e(a.name):"")+"</small></td>"}).join("")+"</tr></thead>";
var label=cur>0?"上位"+cur+"人":"全員";
var h="<table class=\\"tbl\\">"+head+"<tbody>"+
row("同盟総戦力",A.map(function(a){return a.power}),cp)+
row("王国内順位",A.map(function(a){return a.power_rank}),function(v){return v==null?"—":e(v)+"位"},"min")+
row("メンバー数",A.map(function(a){return (a.members||[]).length||null}),function(v){return v==null?"—":e(v)+"人"})+
row(label+"の合計",T.map(function(t){return t.length?t.reduce(function(s,m){return s+m.power},0):null}),cp)+
row(label+"の平均",T.map(function(t){return t.length?t.reduce(function(s,m){return s+m.power},0)/t.length:null}),cp)+
"</tbody></table>";
var n=Math.max.apply(null,T.map(function(t){return t.length}));
if(n>0){h+="<h2 style=\\"margin-top:14px\\">"+e(label)+"どうし</h2><table class=\\"tbl\\"><tbody>";for(var i=0;i<n;i++){var ms=T.map(function(t){return t[i]||null}),ps=ms.map(function(m){return m?m.power:null}),ok=ps.filter(function(v){return v!==null}),best=ok.length>1?Math.max.apply(null,ok):null;h+="<tr><th>"+(i+1)+"位</th>"+ms.map(function(m){return "<td class=\\""+(m&&best!==null&&m.power===best&&ok.filter(function(v){return v===best}).length===1?"best":"")+"\\">"+(m?"<span class=\\"mem\\">"+e(m.name)+"<small>"+cp(m.power)+(m.roleLabel?" · "+e(m.roleLabel):"")+"</small></span>":"—")+"</td>"}).join("")+"</tr>"}h+="</tbody></table>"}
h+="<h2 style=\\"margin-top:14px\\">戦力帯ごとの人数（全員）</h2><table class=\\"tbl\\"><tbody>"+BANDS.map(function(b,bi){return row(b[1],K.map(function(k){return k.filter(function(m){return BANDS.findIndex(function(x){return m.power>=x[0]})===bi}).length}),function(v){return e(v)+"人"})}).join("")+"</tbody></table>";
h+=mystic();
h+="<p class=\\"note\\">メンバー表の時点："+A.map(function(a){return e(a.abbr)+" "+at(a.observedAt)+(a.fetched?"（今取得）":"")}).join(" ／ ")+"</p>";
body.innerHTML=h}
tops.addEventListener("click",function(ev){var b=ev.target.closest("button");if(!b)return;cur=Number(b.dataset.n);try{var u=new URL(location.href);u.searchParams.set("top",String(cur));history.replaceState(null,"",u)}catch(x){}render()});
render()})();</script>
<script>(function(){var f=document.getElementById("acForm");if(!f)return;f.addEventListener("submit",function(ev){ev.preventDefault();var k=f.querySelectorAll("input[name=kid]"),t=f.querySelectorAll("input[name=tag]"),q=new URLSearchParams();for(var i=0;i<k.length;i++){var a=k[i].value.trim(),b=t[i].value.trim();if(a&&b)q.append("a",a+":"+b)}location.href="/alliance/compare?"+q.toString()})})();</script>
</body></html>`;
}
