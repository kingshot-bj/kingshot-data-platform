// 動画（CM）をオーナー画面で作る：/owner/social/video
// ・台本（場面セット）はひな形（src/social-video-presets.js）か、画面で書いて R2 に保存したもの（social/videos/scenes/<name>.json）。
// ・「動画を作る」で GitHub Actions の Feature video を動かす（台本は scenes_json として渡す）。撮影・書き出しは Actions、
//   できた動画は R2（social/videos/out/<id>/video.mp4・caption.txt）に置かれ、この画面で再生・ダウンロードできる。
// ・鍵は Worker のシークレット SOCIAL_GITHUB_DISPATCH_TOKEN（SNS投稿セットの「今すぐ作る」と同じ）。D1 は使わない。
import { VIDEO_PRESETS } from "./social-video-presets.js";
import { normalizeSceneSet, SLIDE_TYPES, SCENE_LIMITS } from "./social-video-scenes.js";
import { EAGLEEYE_THEMES } from "./themes.js";
import { SOCIAL_WORKFLOW } from "./social-run.js";
import { SOCIAL_PLATFORMS } from "./social-pack.js";

export const VIDEO_WORKFLOW = "feature-video.yml";
export const VIDEO_SCENES_PREFIX = "social/videos/scenes/";
export const VIDEO_OUT_PREFIX = "social/videos/out/";
export const VIDEO_ID = /^\d{8}-\d{6}-[a-z0-9][a-z0-9-]{0,39}$/;
export const VIDEO_BGM = "scripts/social/bgm/battle.mp3";
const API = `https://api.github.com/repos/${SOCIAL_WORKFLOW.owner}/${SOCIAL_WORKFLOW.repo}/actions/workflows/${VIDEO_WORKFLOW}`;
const ACTIVE = new Set(["queued", "in_progress", "waiting", "requested", "pending"]);

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const token = env => String(env?.SOCIAL_GITHUB_DISPATCH_TOKEN || "").trim();
const ghHeaders = env => ({ authorization: `Bearer ${token(env)}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "EagleEyeSocialVideo/1.0" });
const rejected = status => status === 401 || status === 403 || status === 404 ? "GITHUB_TOKEN_REJECTED" : "GITHUB_UNAVAILABLE";

export function videoIdFor(name, nowMs = Date.now()) {
  const d = new Date(nowMs + 9 * 3600 * 1000).toISOString(); // 日本時間
  return `${d.slice(0, 10).replace(/-/g, "")}-${d.slice(11, 19).replace(/:/g, "")}-${name}`;
}

export async function loadSavedVideoSets(bucket) {
  if (!bucket) return [];
  const listed = await bucket.list({ prefix: VIDEO_SCENES_PREFIX, limit: 50 }).catch(() => null);
  const keys = (listed?.objects || []).map(o => o.key).filter(k => k.endsWith(".json"));
  const sets = await Promise.all(keys.map(async k => {
    const obj = await bucket.get(k).catch(() => null);
    const r = obj ? normalizeSceneSet(await obj.json().catch(() => null)) : null;
    return r?.ok ? r.set : null;
  }));
  return sets.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveVideoSet(bucket, input) {
  const r = normalizeSceneSet(input);
  if (!r.ok) return r;
  if (VIDEO_PRESETS[r.set.name]) return { ok: false, error: "ひな形と同じ名前は使えません。名前を変えて保存してください" };
  if (!bucket) return { ok: false, error: "保存先（R2）がありません" };
  await bucket.put(VIDEO_SCENES_PREFIX + r.set.name + ".json", JSON.stringify(r.set), { httpMetadata: { contentType: "application/json" } });
  return { ok: true, set: r.set };
}

export async function deleteVideoSet(bucket, name) {
  if (!bucket || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(String(name || ""))) return { ok: false, error: "名前が正しくありません" };
  if (VIDEO_PRESETS[name]) return { ok: false, error: "ひな形は消せません" };
  await bucket.delete(VIDEO_SCENES_PREFIX + name + ".json");
  return { ok: true };
}

// できた動画（新しい順・20本まで）。投稿文（caption.txt）も読む。
export async function loadVideos(bucket, limit = 20) {
  if (!bucket) return [];
  const listed = await bucket.list({ prefix: VIDEO_OUT_PREFIX, limit: 500 }).catch(() => null);
  const ids = [...new Set((listed?.objects || []).map(o => o.key.slice(VIDEO_OUT_PREFIX.length).split("/")[0]).filter(id => VIDEO_ID.test(id)))].sort().reverse().slice(0, limit);
  const has = new Set((listed?.objects || []).map(o => o.key));
  return Promise.all(ids.map(async id => {
    const capKey = VIDEO_OUT_PREFIX + id + "/caption.txt";
    const cap = has.has(capKey) ? await bucket.get(capKey).then(o => o ? o.text() : "").catch(() => "") : "";
    return { id, name: id.slice(16), video: has.has(VIDEO_OUT_PREFIX + id + "/video.mp4"), caption: cap.slice(0, 4000) };
  }));
}

export async function videoRunStatus(env, fetchImpl = fetch) {
  if (!token(env)) return { ok: true, configured: false, running: false, last: null };
  const res = await fetchImpl(`${API}/runs?per_page=5`, { headers: ghHeaders(env) }).catch(() => null);
  if (!res) return { ok: false, configured: true, error: "GITHUB_UNAVAILABLE" };
  if (!res.ok) return { ok: false, configured: true, error: rejected(res.status) };
  const runs = (await res.json().catch(() => ({})))?.workflow_runs || [];
  const r = runs[0];
  return { ok: true, configured: true, running: runs.some(x => ACTIVE.has(String(x.status))), last: r ? { status: String(r.status || ""), conclusion: r.conclusion == null ? null : String(r.conclusion), createdAt: String(r.created_at || ""), url: String(r.html_url || "") } : null };
}

export async function triggerVideoRun(env, input, { bgm = true, fetchImpl = fetch, nowMs = Date.now() } = {}) {
  if (!token(env)) return { ok: false, error: "NOT_CONFIGURED" };
  const r = normalizeSceneSet(input);
  if (!r.ok) return { ok: false, error: "INVALID_SCENES", message: r.error };
  const status = await videoRunStatus(env, fetchImpl);
  if (!status.ok) return { ok: false, error: status.error };
  if (status.running) return { ok: false, error: "ALREADY_RUNNING" };
  const videoId = videoIdFor(r.set.name, nowMs);
  const preset = VIDEO_PRESETS[r.set.name] ? r.set.name : "features";
  const res = await fetchImpl(`${API}/dispatches`, {
    method: "POST", headers: { ...ghHeaders(env), "content-type": "application/json" },
    body: JSON.stringify({ ref: SOCIAL_WORKFLOW.ref, inputs: { scene_set: preset, bgm: bgm ? VIDEO_BGM : "", fade: "0.4", scenes_json: JSON.stringify(r.set), video_id: videoId } })
  }).catch(() => null);
  if (!res) return { ok: false, error: "GITHUB_UNAVAILABLE" };
  if (res.status !== 204 && !res.ok) return { ok: false, error: rejected(res.status) };
  return { ok: true, videoId };
}

const PLATFORM_LABELS = { x: "X", discord: "Discord", youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram" };

export function renderSocialVideoPage({ saved = [], videos = [] } = {}) {
  const presets = Object.values(VIDEO_PRESETS);
  const data = { presets, saved, limits: SCENE_LIMITS, slides: SLIDE_TYPES, skins: EAGLEEYE_THEMES.map(t => [t.id, t.name]) };
  const videoCards = videos.length ? videos.map(v => {
    const src = `/owner/social/media/videos/out/${encodeURIComponent(v.id)}/video.mp4`;
    return `<article class="vid"><div class="vh"><b>${esc(v.name)}</b><small>${esc(v.id.slice(0, 4) + "/" + v.id.slice(4, 6) + "/" + v.id.slice(6, 8) + " " + v.id.slice(9, 11) + ":" + v.id.slice(11, 13))}</small></div>
${v.video ? `<video src="${src}" controls playsinline preload="metadata"></video><p><a href="${src}" download="eagleeye-${esc(v.name)}.mp4">ダウンロード</a></p>` : '<p class="muted">動画が見つかりません</p>'}
${v.caption ? `<div class="caps">${SOCIAL_PLATFORMS.map(p => `<button type="button" class="copy" data-p="${p}">${PLATFORM_LABELS[p] || p}用をコピー</button>`).join("")}</div><textarea readonly rows="5" class="cap">${esc(v.caption)}</textarea>` : ""}</article>`;
  }).join("") : '<p class="muted">まだ動画がありません。上で台本を選んで「動画を作る」を押してください。</p>';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>動画（CM）を作る | EagleEye</title><style>
body{margin:0;font-family:system-ui,-apple-system,"Hiragino Sans",sans-serif;background:var(--ee-bg,#0a1424);color:var(--ee-text,#e8f3ff)}.wrap{max-width:900px;margin:0 auto;padding:20px 16px 110px}
a{color:var(--ee-cyan,#22d3ee)}h1{font-size:22px;margin:10px 0 4px}h2{font-size:16px;margin:0 0 10px}.lead,.muted{color:var(--ee-subtext,#91a7bf);font-size:13px}
.card{border:1px solid var(--ee-border-soft,#223b57);border-radius:14px;background:var(--ee-panel,#0f2035);padding:14px;margin:12px 0}
label{display:block;font-size:12px;font-weight:700;margin:8px 0 3px;color:var(--ee-subtext,#91a7bf)}input,select,textarea{width:100%;box-sizing:border-box;font:14px/1.5 system-ui;padding:8px 10px;border-radius:9px;border:1px solid var(--ee-border-soft,#223b57);background:var(--ee-bg,#0a1424);color:inherit}
textarea{resize:vertical}.row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.row3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.scene{border:1px solid var(--ee-border-soft,#223b57);border-radius:12px;padding:10px;margin:8px 0;background:var(--ee-panel-raised,#172a40)}.scene-h{display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:space-between}.scene-h select{max-width:46%}.scene-h b{font-size:13px}
.btn{font:700 13px system-ui;padding:8px 12px;border-radius:9px;border:1px solid var(--ee-border-soft,#223b57);background:var(--ee-panel-raised,#172a40);color:inherit}.btn.main{background:var(--ee-cyan,#22d3ee);color:#04202a;border:0}.btn.sm{padding:4px 9px;font-size:12px}.btn:disabled{opacity:.5}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px}.chk{display:flex;gap:6px;align-items:center;font-size:13px;margin:0}.chk input{width:auto}
.msg{font-size:13px;margin-top:8px;min-height:1.2em}.err{color:#fda4af}.vids{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}.vid video{width:100%;max-height:420px;border-radius:10px;background:#000}.vh{display:flex;justify-content:space-between;gap:8px;font-size:13px;margin-bottom:6px}.vh small{color:var(--ee-subtext,#91a7bf)}
.caps{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}.copy{font:700 11px system-ui;padding:4px 8px;border-radius:8px;border:1px solid var(--ee-border-soft,#223b57);background:var(--ee-panel-raised,#172a40);color:inherit}.cap{font-size:12px}
.hint{font-size:12px;color:var(--ee-subtext,#91a7bf);line-height:1.6}
</style></head><body><main class="wrap"><a href="/owner/social">← SNS投稿セット</a>
<h1>動画（CM）を作る</h1><p class="lead">ひな形を選んで、見出し・字幕・秒数・映すページを書き換えて「動画を作る」を押すと、2〜3分で縦長の動画（1080×1920）ができます。撮影中は広告・アクセス記録・API Pool を使いません。</p>
<section class="card"><h2>台本</h2>
<label for="pick">ひな形・保存した台本</label><select id="pick"></select>
<div class="row"><div><label for="f-name">名前（半角小文字・数字・ハイフン）</label><input id="f-name" maxlength="40"></div><div><label for="f-title">タイトル（メモ）</label><input id="f-title" maxlength="60"></div></div>
<label for="f-skin">着せ替え（全体）</label><select id="f-skin"></select>
<div id="scenes"></div>
<div class="bar"><button type="button" class="btn" id="add">＋ 場面を追加</button><span class="hint" id="total"></span></div>
<label for="f-post">投稿文（{host} がサイトのアドレスになります。SNSごとの ?ref= はコピーのときに付きます）</label><textarea id="f-post" rows="6"></textarea>
<p class="hint">見出し・字幕で使える装飾は &lt;b&gt;太字&lt;/b&gt; と &lt;br&gt;（改行）だけです。ページは EagleEye の中のパス（例：/player/compare?governor_id=…）。「ログインが必要」は撮影用の鍵で開きます。</p>
<div class="bar"><button type="button" class="btn" id="save">保存</button><button type="button" class="btn" id="del" hidden>この台本を消す</button><label class="chk"><input type="checkbox" id="bgm" checked> BGM を付ける</label><button type="button" class="btn main" id="run">動画を作る</button></div>
<div class="msg" id="msg"></div></section>
<section class="card"><h2>できた動画</h2><div class="vids">${videoCards}</div></section>
<script type="application/json" id="video-data">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>
<script>${CLIENT}</script></main></body></html>`;
}

// 画面側。台本はフォームで編集し、保存・作成のときに JSON にして送る（サーバーでも normalizeSceneSet で検証）。
const CLIENT = `(()=>{const D=JSON.parse(document.getElementById("video-data").textContent);const $=id=>document.getElementById(id);
const TYPES=[["page","ページを映す"],["text","文字の画面"],["title","タイトル画面"],["signup","無料登録の説明"],["outro","最後（URL）"]];
let cur=null;const all=()=>[...D.presets.map(s=>({s,kind:"ひな形"})),...D.saved.map(s=>({s,kind:"保存"}))];
function fillPick(sel){const p=$("pick");p.innerHTML="";all().forEach(({s,kind},i)=>{const o=document.createElement("option");o.value=String(i);o.textContent="["+kind+"] "+(s.title||s.name)+"（"+s.name+"）";p.appendChild(o)});if(sel!=null)p.value=String(sel)}
const plain=v=>String(v||"").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,"&");
function sceneEl(sc,i){const box=document.createElement("div");box.className="scene";const type=sc.slide||"page";
const h=document.createElement("div");h.className="scene-h";const b=document.createElement("b");b.textContent=(i+1)+".";const sel=document.createElement("select");sel.style.width="auto";TYPES.forEach(([v,l])=>{const o=document.createElement("option");o.value=v;o.textContent=l;sel.appendChild(o)});sel.value=type;
const tools=document.createElement("span");[["↑",-1],["↓",1]].forEach(([t,d])=>{const x=document.createElement("button");x.type="button";x.className="btn sm";x.textContent=t;x.onclick=()=>{const s=read();const j=i+d;if(j<0||j>=s.scenes.length)return;[s.scenes[i],s.scenes[j]]=[s.scenes[j],s.scenes[i]];load(s)};tools.appendChild(x)});const del=document.createElement("button");del.type="button";del.className="btn sm";del.textContent="削除";del.onclick=()=>{const s=read();s.scenes.splice(i,1);load(s)};tools.appendChild(del);
const sk=document.createElement("select");sk.style.width="auto";sk.dataset.k="skin";sk.title="この場面の着せ替え";[["","（全体と同じ）"],...D.skins].forEach(([v,l])=>{const o=document.createElement("option");o.value=v;o.textContent=l;sk.appendChild(o)});sk.value=sc.skin||"";
h.append(b,sel,sk,tools);box.appendChild(h);
const field=(key,label,val,opt={})=>{const l=document.createElement("label");l.textContent=label;const inp=document.createElement(opt.area?"textarea":"input");if(opt.area)inp.rows=2;if(opt.type)inp.type=opt.type;if(opt.step)inp.step=opt.step;inp.value=val==null?"":val;inp.dataset.k=key;const w=document.createElement("div");w.append(l,inp);return w};
const body=document.createElement("div");box.appendChild(body);
const draw=()=>{body.innerHTML="";const t=sel.value;if(t==="text"){body.append(field("heading","見出し",plain(sc.heading),{area:1}),field("sub","小さい文字",plain(sc.sub)))}
if(t==="page"){body.append(field("page","ページ（/ から）",sc.page||"/"),field("caption","字幕",plain(sc.caption),{area:1}));const r=document.createElement("div");r.className="row3";r.append(field("seconds","秒数",sc.seconds||4,{type:"number",step:"0.5"}),field("scroll","スクロール(px)",sc.scroll||0,{type:"number",step:"100"}));const c=document.createElement("label");c.className="chk";const cb=document.createElement("input");cb.type="checkbox";cb.dataset.k="login";cb.checked=!!sc.login;c.append(cb,"ログインが必要");r.appendChild(c);body.appendChild(r)}
else{body.append(field("seconds","秒数",sc.seconds||3,{type:"number",step:"0.5"}))}};
sel.onchange=()=>{draw();total()};draw();box.dataset.type=type;return box}
function read(){const scenes=[...$("scenes").children].map(box=>{const t=box.querySelector(".scene-h select").value;const g=k=>{const el=box.querySelector("[data-k="+k+"]");return el?(el.type==="checkbox"?el.checked:el.value):undefined};
const sc={seconds:Number(g("seconds"))||0};if(g("skin"))sc.skin=g("skin");if(t==="page"){sc.page=g("page");sc.caption=g("caption");sc.scroll=Number(g("scroll"))||0;if(g("login"))sc.login=true}else{sc.slide=t;if(t==="text"){sc.heading=g("heading");sc.sub=g("sub")}}return sc});
const out={name:$("f-name").value.trim(),title:$("f-title").value.trim(),post:$("f-post").value.split("\\n"),scenes};if($("f-skin").value)out.skin=$("f-skin").value;return out}
function total(){const s=read();$("total").textContent="合計 "+s.scenes.reduce((a,x)=>a+(x.seconds||0),0).toFixed(1)+" 秒・"+s.scenes.length+" 場面"}
function load(s){cur=s;$("f-skin").value=s.skin||"";$("f-name").value=s.name||"";$("f-title").value=s.title||"";$("f-post").value=(s.post||[]).join("\\n");const box=$("scenes");box.innerHTML="";(s.scenes||[]).forEach((sc,i)=>box.appendChild(sceneEl(sc,i)));total()}
$("scenes").addEventListener("input",total);
$("pick").onchange=()=>{const it=all()[Number($("pick").value)];if(!it)return;load(JSON.parse(JSON.stringify(it.s)));$("del").hidden=it.kind!=="保存";msg("")};
$("add").onclick=()=>{const s=read();s.scenes.push({page:"/",caption:"",seconds:4,scroll:0});load(s)};
const msg=(t,err)=>{$("msg").textContent=t;$("msg").className="msg"+(err?" err":"")};
const post=async(url,body)=>{const r=await fetch(url,{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify(body)});return r.json().catch(()=>({ok:false}))};
$("save").onclick=async()=>{msg("保存しています…");const d=await post("/owner/social/video/scenes",{set:read()});if(d.ok){msg("保存しました");const i=D.saved.findIndex(x=>x.name===d.set.name);if(i>=0)D.saved[i]=d.set;else D.saved.push(d.set);fillPick(D.presets.length+D.saved.findIndex(x=>x.name===d.set.name));$("del").hidden=false}else msg(d.message||d.error||"保存できませんでした",1)};
$("del").onclick=async()=>{const name=$("f-name").value.trim();if(!confirm("台本「"+name+"」を消しますか？"))return;const d=await post("/owner/social/video/scenes/delete",{name});if(d.ok){D.saved=D.saved.filter(x=>x.name!==name);fillPick(0);$("pick").onchange();msg("消しました")}else msg(d.message||d.error,1)};
const ERR={NOT_CONFIGURED:"未設定：Worker のシークレットに SOCIAL_GITHUB_DISPATCH_TOKEN がありません",GITHUB_TOKEN_REJECTED:"GitHub の鍵が使えません（SOCIAL_GITHUB_DISPATCH_TOKEN を確認）",ALREADY_RUNNING:"いま別の動画を作っています。終わってからもう一度押してください",GITHUB_UNAVAILABLE:"GitHub につながりませんでした"};
let timer=null;const poll=async()=>{const d=await fetch("/owner/social/video/run",{credentials:"same-origin"}).then(r=>r.json()).catch(()=>null);if(!d||!d.ok){msg(ERR[d&&d.error]||"状態を読めませんでした",1);return}if(!d.configured){$("run").disabled=true;msg(ERR.NOT_CONFIGURED,1);return}
if(d.running){$("run").disabled=true;msg("作成中です…（終わったらこのページを再読み込みすると下に出ます）");timer=setTimeout(poll,20000)}else{$("run").disabled=false;if(d.last&&timer){msg(d.last.conclusion==="success"?"できました。再読み込みすると下に出ます":"失敗しました（GitHub の実行の詳細を確認）",d.last.conclusion!=="success")}timer=null}};
$("run").onclick=async()=>{$("run").disabled=true;msg("依頼しています…");const d=await post("/owner/social/video/run",{set:read(),bgm:$("bgm").checked});if(d.ok){msg("作り始めました（2〜3分）");timer=setTimeout(poll,20000)}else{$("run").disabled=false;msg(d.message||ERR[d.error]||"依頼できませんでした",1)}};
document.querySelectorAll(".vid").forEach(v=>{const ta=v.querySelector("textarea");v.querySelectorAll(".copy").forEach(b=>b.onclick=async()=>{const p=b.dataset.p;const t=ta.value.replace(/(https?:\\/\\/)?eagleeye-ks\\.com\\/?(?![\\w?])/g,"eagleeye-ks.com/?ref="+p);try{await navigator.clipboard.writeText(t);b.textContent="コピーしました"}catch{ta.select()}})});
[["","ネイビー（標準）"],...D.skins.filter(([v])=>v!=="navy")].forEach(([v,l])=>{const o=document.createElement("option");o.value=v;o.textContent=l;$("f-skin").appendChild(o)});
fillPick(0);$("pick").onchange();poll();})();`;
