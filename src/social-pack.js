// SNS用の「今週の投稿セット」。実データ（kingdom_stats_current・KvKの組み合わせ）だけから作る。
// ・ネタ（item）ごとに、順位表・リンク先・各SNS向けの投稿文を作る。
// ・画像は /social/card/{id}/{format} のHTMLを GitHub Actions が撮影して作る（Workers では画像を作らない）。
// ・数字は公開ページに出しているものと同じ。予想や作った数字は入れない（KvKは勝敗の予想をしない）。
// ・power_rank（MightPulse の値。意味が未確認）は使わない。戦力の順位は power の値で並べる。

import { compactNumber } from "./public-pages.js";
import { currentKvkSeason, loadSeasonMatchups } from "./kvk-matchups-page.js";
import { kvkEndedAt } from "./home-summary.js";

export const SOCIAL_FORMATS = Object.freeze({ story: { w: 1080, h: 1920, rows: 10 }, square: { w: 1080, h: 1080, rows: 5 } });
export const SOCIAL_PLATFORMS = Object.freeze(["x", "discord", "youtube", "tiktok", "instagram"]);
const HASHTAGS = ["#キングショット", "#KingShot"];
export const SOCIAL_MIN_ROWS = 3;

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const jstDate = ms => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);

// 月曜はじまりの週（日本時間）。投稿セットの名前と保存先に使う。
export function socialWeekOf(nowMs = Date.now()) {
  const d = new Date(nowMs + 9 * 3600 * 1000);
  const day = (d.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}

const kingdomRow = (r, i, value, sub) => ({ rank: i + 1, label: `王国 ${r.kid}`, kid: Number(r.kid), value, sub });

// 順位表のネタ（王国の数字）。D1 は1ネタ1文（kingdom_stats_current は約2,600行）。
async function kingdomItems(db) {
  const q = sql => db.prepare(sql).all().then(r => r?.results || []).catch(() => []);
  const [gain, power, young] = await Promise.all([
    q("SELECT kid, power, power_gain_7d, age_days, observed_at FROM kingdom_stats_current WHERE power_gain_7d > 0 ORDER BY power_gain_7d DESC LIMIT 10"),
    q("SELECT kid, power, power_gain_7d, age_days, observed_at FROM kingdom_stats_current WHERE power > 0 ORDER BY power DESC LIMIT 10"),
    q("SELECT kid, power, power_gain_7d, age_days, observed_at FROM kingdom_stats_current WHERE power_gain_7d > 0 AND age_days BETWEEN 1 AND 180 ORDER BY power_gain_7d DESC LIMIT 10")
  ]);
  const at = rows => rows.reduce((a, r) => Math.max(a, Number(r.observed_at) || 0), 0);
  const age = r => r.age_days != null ? `開設${r.age_days}日` : "";
  const items = [];
  if (gain.length) items.push({
    id: "gain", title: "今週いちばん伸びた王国", subtitle: "7日間の戦力増加 TOP10", path: "/kingdoms", observedAt: at(gain),
    rows: gain.map((r, i) => kingdomRow(r, i, "+" + compactNumber(r.power_gain_7d), [age(r), "総戦力 " + compactNumber(r.power)].filter(Boolean).join("・"))),
    hook: `今週いちばん戦力が伸びたのは王国${gain[0].kid}（7日間で+${compactNumber(gain[0].power_gain_7d)}）`
  });
  if (power.length) items.push({
    id: "power", title: "総戦力ランキング", subtitle: "全王国の総戦力 TOP10", path: "/kingdoms", observedAt: at(power),
    rows: power.map((r, i) => kingdomRow(r, i, compactNumber(r.power), [age(r), r.power_gain_7d > 0 ? "7日間 +" + compactNumber(r.power_gain_7d) : ""].filter(Boolean).join("・"))),
    hook: `総戦力1位は王国${power[0].kid}（${compactNumber(power[0].power)}）`
  });
  if (young.length) items.push({
    id: "young", title: "新しい王国の成長ランキング", subtitle: "開設180日以内・7日間の戦力増加 TOP10", path: "/kingdoms", observedAt: at(young),
    rows: young.map((r, i) => kingdomRow(r, i, "+" + compactNumber(r.power_gain_7d), [age(r), "総戦力 " + compactNumber(r.power)].filter(Boolean).join("・"))),
    hook: `開設180日以内でいちばん伸びたのは王国${young[0].kid}（${age(young[0])}・+${compactNumber(young[0].power_gain_7d)}）`
  });
  return items;
}

// KvK：秘境の試練の1位記録が拮抗している組み合わせ（どちらが勝つかの予想はしない）。
export function closeKvkPairs(pairs, limit = 10) {
  return (pairs || [])
    .filter(p => p.b && p.mystic && (p.mystic.wins + p.mystic.losses + p.mystic.even) >= 4)
    .map(p => ({ p, n: p.mystic.wins + p.mystic.losses + p.mystic.even, diff: Math.abs(p.mystic.wins - p.mystic.losses) }))
    .sort((x, y) => x.diff - y.diff || y.n - x.n || x.p.a.kid - y.p.a.kid)
    .filter(x => x.diff <= 1)
    .slice(0, limit)
    .map(x => x.p);
}

async function kvkItem(db, nowMs = Date.now()) {
  const season = await currentKvkSeason(db).catch(() => null);
  if (!season) return null;
  // KvK が終わっていたら出さない（終わった組み合わせの「接戦」は意味がない）。
  // 日程（days_json）は王国ごとに同じなので、最近取った1行だけ見る（D1 の読み取りを増やさない）。
  const latest = await db.prepare("SELECT days_json FROM kvk_scores WHERE season = ? AND days_json IS NOT NULL ORDER BY fetched_at DESC LIMIT 1").bind(season).first().catch(() => null);
  if (kvkEndedAt(latest?.days_json, Math.floor(nowMs / 1000)) != null) return null;
  const { pairs, observedAt } = await loadSeasonMatchups(db, season).catch(() => ({ pairs: [], observedAt: 0 }));
  const close = closeKvkPairs(pairs);
  if (!close.length) return null;
  return {
    id: "kvk", title: `KvK S${season} 接戦の組み合わせ`, subtitle: "秘境の試練の1位記録が拮抗", path: `/kvk/s${season}`, observedAt,
    rows: close.map((p, i) => {
      const m = p.mystic, n = m.wins + m.losses + m.even;
      return { rank: i + 1, label: `王国 ${p.a.kid} vs ${p.b.kid}`, kid: p.a.kid, value: `${m.wins}-${m.losses}`, sub: `${n}ステージ中${m.even ? `・同点${m.even}` : ""}` };
    }),
    hook: `KvK S${season}、秘境の試練の記録で拮抗している組み合わせ`
  };
}

export function socialCaptions(item, { origin = "https://eagleeye-ks.com" } = {}) {
  const link = p => `${origin}${item.path}?ref=${p}`;
  const top3 = item.rows.slice(0, 3).map(r => `${r.rank}位 ${r.label} ${r.value}`).join("\n");
  const tags = [...HASHTAGS, ...(item.id === "kvk" ? ["#KvK"] : [])].join(" ");
  return {
    x: `${item.hook}📊\n\n${top3}\n\n全部はこちら\n${link("x")}\n${tags}`,
    discord: `**${item.title}**（${item.subtitle}）\n${top3}\n\n全部はこちら → ${link("discord")}`,
    youtube: { title: `${item.title}｜キングショット ${item.subtitle}`.slice(0, 95), description: `${item.hook}。\n\n${item.rows.map(r => `${r.rank}位 ${r.label} ${r.value}（${r.sub}）`).join("\n")}\n\n詳しいデータ：${link("youtube")}\nデータ：EagleEye（KingShot非公式データサイト・毎日更新）\n${tags} #Shorts` },
    tiktok: `${item.hook}📊 全部のデータはプロフィールのリンクから！ ${tags} #ゲーム`,
    instagram: `${item.hook}📊\n\n${top3}\n\n全部のデータはプロフィールのリンク（eagleeye-ks.com）から。\n${tags} #ゲーム #スマホゲーム`
  };
}

export async function loadSocialPack(env, { nowMs = Date.now(), origin = "https://eagleeye-ks.com" } = {}) {
  const db = env.DB;
  const items = [...await kingdomItems(db)];
  const kvk = await kvkItem(db, nowMs);
  if (kvk) items.push(kvk);
  // 3位まで並ばないネタは出さない（データが少ない週・シーズンの切り替わり）。
  for (let i = items.length - 1; i >= 0; i--) if (items[i].rows.length < SOCIAL_MIN_ROWS) items.splice(i, 1);
  return {
    week: socialWeekOf(nowMs),
    generatedAt: Math.floor(nowMs / 1000),
    origin,
    items: items.map(it => ({ ...it, dataDate: it.observedAt ? jstDate(it.observedAt * 1000) : null, captions: socialCaptions(it, { origin }), cards: Object.keys(SOCIAL_FORMATS).map(f => `/social/card/${it.id}/${f}`) }))
  };
}

// 画像の元になるカード（1080×1920 縦長／1080×1080 正方形）。外部のフォント・画像を読まない（撮影がすぐ終わる）。
export function renderSocialCard(item, { format = "story", week = "" } = {}) {
  const f = SOCIAL_FORMATS[format] || SOCIAL_FORMATS.story;
  const rows = item.rows.slice(0, f.rows);
  const big = format === "story";
  const rowH = big ? 122 : 128;
  // タイトルが1行に収まる大きさにする（日本語は1文字がほぼ1文字分の幅）。
  const titleLen = [...String(item.title)].length;
  const titlePx = big ? Math.max(56, Math.min(84, Math.floor(950 / Math.max(1, titleLen)))) : Math.max(44, Math.min(62, Math.floor(965 / Math.max(1, titleLen))));
  const list = rows.map(r => `<li class="${r.rank <= 3 ? "top t" + r.rank : ""}"><span class="rk">${r.rank}</span><span class="nm"><b>${esc(r.label)}</b><small>${esc(r.sub)}</small></span><span class="vl">${esc(r.value)}</span></li>`).join("");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>${esc(item.title)}</title><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${f.w}px;height:${f.h}px;overflow:hidden}
body{font-family:"Noto Sans CJK JP","Noto Sans JP","Hiragino Sans","Yu Gothic",sans-serif;color:#eaf6ff;background:radial-gradient(120% 70% at 85% 0%,#164e63 0%,rgba(22,78,99,0) 60%),linear-gradient(180deg,#0b1628 0%,#08111f 100%)}
.wrap{position:absolute;inset:0;padding:${big ? "110px 64px 90px" : "56px 56px 48px"};display:flex;flex-direction:column}
.brand{display:flex;align-items:center;gap:14px;font-size:${big ? 34 : 28}px;font-weight:800;letter-spacing:.04em;color:#7dd3fc}
.brand i{display:inline-block;width:${big ? 46 : 38}px;height:${big ? 46 : 38}px;border-radius:12px;background:linear-gradient(135deg,#22d3ee,#0ea5e9);box-shadow:0 0 30px #22d3ee66}
.brand span{margin-left:auto;font-size:${big ? 26 : 22}px;color:#94a3b8;font-weight:700}
h1{margin-top:${big ? 48 : 26}px;font-size:${titlePx}px;line-height:1.15;font-weight:900;letter-spacing:.01em}
h2{margin-top:${big ? 18 : 10}px;font-size:${big ? 38 : 30}px;color:#67e8f9;font-weight:800}
ol{list-style:none;margin-top:${big ? 54 : 26}px;display:flex;flex-direction:column;gap:${big ? 14 : 12}px}
li{height:${rowH}px;display:flex;align-items:center;gap:26px;padding:0 30px;border-radius:24px;background:#0f2238;border:2px solid #1e3a5f}
li.top{background:linear-gradient(90deg,#123047,#0f2238);border-color:#22d3ee88}
.rk{width:68px;font-size:52px;font-weight:900;color:#94a3b8;text-align:center}
.t1 .rk{color:#fcd34d}.t2 .rk{color:#e2e8f0}.t3 .rk{color:#fdba74}
.nm{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.nm b{font-size:44px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nm small{font-size:27px;color:#94a3b8;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vl{font-size:50px;font-weight:900;color:#5eead4;white-space:nowrap}
.foot{margin-top:auto;display:flex;flex-direction:column;gap:10px;font-size:${big ? 30 : 24}px;color:#94a3b8;font-weight:600}
.foot b{font-size:${big ? 44 : 34}px;color:#eaf6ff;font-weight:900;letter-spacing:.02em}
</style></head><body><div class="wrap">
<div class="brand"><i></i>EagleEye<span>${esc(item.dataDate ? item.dataDate + " 時点" : week)}</span></div>
<h1>${esc(item.title)}</h1><h2>${esc(item.subtitle)}</h2>
<ol>${list}</ol>
<div class="foot"><b>eagleeye-ks.com</b><span>キングショット非公式データサイト</span></div>
</div></body></html>`;
}

// 動画の最初に入れる表紙（今週のネタの一覧）。
export function renderSocialCover(pack) {
  const item = { title: "今週のデータまとめ", subtitle: `キングショット・${pack.week} の週`, dataDate: "", rows: pack.items.map((it, i) => ({ rank: i + 1, label: it.title, value: "", sub: it.subtitle })) };
  return renderSocialCard(item, { format: "story", week: pack.week });
}

// ---- 保存した画像・動画（GitHub Actions が R2 に置く） ----
export const SOCIAL_R2_PREFIX = "social/";
export const SOCIAL_MANIFEST_KEY = "social/latest.json";
const MEDIA_KEY = /^social\/\d{4}-\d{2}-\d{2}\/[a-z0-9_-]{1,40}\.(png|mp4|json)$/;
export function isSocialMediaKey(key) { return MEDIA_KEY.test(String(key || "")); }

export async function loadSocialManifest(bucket) {
  if (!bucket) return null;
  try { const obj = await bucket.get(SOCIAL_MANIFEST_KEY); return obj ? JSON.parse(await obj.text()) : null; } catch { return null; }
}

const PLATFORM_LABELS = { x: "X", discord: "Discord", youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram" };

// オーナー画面：今週のネタ・投稿文（コピー）・できた画像と動画・自動投稿の結果。
export function renderSocialOwnerPage(pack, manifest = null) {
  const sameWeek = manifest && manifest.week === pack.week;
  const media = name => sameWeek && (manifest.files || []).includes(name) ? `/owner/social/media/${encodeURIComponent(manifest.week)}/${encodeURIComponent(name)}` : null;
  const posts = sameWeek ? manifest.posts || {} : {};
  const caption = (it, p) => { const c = it.captions[p]; return typeof c === "string" ? c : `${c.title}\n\n${c.description}`; };
  const video = media("shorts.mp4");
  const items = pack.items.map(it => `<section class="card"><h2>${esc(it.title)}<small>${esc(it.subtitle)}・${esc(it.dataDate || "")} 時点</small></h2>
<div class="row"><div class="pvw"><iframe class="pv" src="/social/card/${esc(it.id)}/story" loading="lazy" title="${esc(it.title)}" tabindex="-1"></iframe></div>
<div class="caps">${SOCIAL_PLATFORMS.map(p => `<div class="cap"><div class="cap-h"><b>${PLATFORM_LABELS[p]}</b><button type="button" class="copy">コピー</button></div><textarea readonly rows="4">${esc(caption(it, p))}</textarea></div>`).join("")}
<p class="dl">${["story", "square"].map(f => media(`${it.id}-${f}.png`) ? `<a href="${media(`${it.id}-${f}.png`)}" download>${f === "story" ? "縦長画像" : "正方形画像"}</a>` : "").filter(Boolean).join(" ") || '<span class="muted">画像はまだ作られていません（毎週月曜に自動で作ります）</span>'}</p></div></div></section>`).join("");
  const postRows = Object.keys(posts).length ? `<table><tbody>${Object.entries(posts).map(([p, r]) => `<tr><td>${esc(PLATFORM_LABELS[p] || p)}</td><td>${esc(r.status || "")}</td><td>${esc(r.note || "")}</td></tr>`).join("")}</tbody></table>` : '<p class="muted">まだ自動投稿はしていません。</p>';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>SNS投稿セット | EagleEye</title><style>
body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:var(--ee-bg,#0a1424);color:var(--ee-text,#e8f3ff)}.wrap{max-width:980px;margin:0 auto;padding:20px 16px 100px}
a{color:var(--ee-cyan,#22d3ee)}h1{font-size:22px;margin:10px 0 4px}.lead{color:var(--ee-subtext,#91a7bf);font-size:13px;margin:0 0 14px}
.card{border:1px solid var(--ee-border-soft,#223b57);border-radius:14px;background:var(--ee-panel,#0f2035);padding:14px;margin:12px 0}.card h2{font-size:16px;margin:0 0 10px}.card h2 small{display:block;font-size:12px;color:var(--ee-subtext,#91a7bf);font-weight:600;margin-top:2px}
.row{display:flex;gap:14px;align-items:flex-start}.pvw{width:216px;height:384px;flex:none;overflow:hidden;border-radius:10px;background:#08111f}.pv{width:1080px;height:1920px;border:0;transform:scale(.2);transform-origin:0 0;pointer-events:none}
.caps{flex:1;min-width:0;display:grid;gap:8px}.cap-h{display:flex;justify-content:space-between;align-items:center;font-size:12px;margin-bottom:3px}.cap textarea{width:100%;box-sizing:border-box;font:12px/1.5 system-ui;background:var(--ee-bg,#0a1424);color:inherit;border:1px solid var(--ee-border-soft,#223b57);border-radius:8px;padding:6px;resize:vertical}
.copy{font:700 12px system-ui;padding:4px 10px;border-radius:8px;border:1px solid var(--ee-border-soft,#223b57);background:var(--ee-panel-raised,#172a40);color:inherit}
.dl a{display:inline-block;margin-right:10px;font-weight:700}.muted{color:var(--ee-subtext,#91a7bf);font-size:12px}table{width:100%;border-collapse:collapse;font-size:13px}td{padding:6px;border-bottom:1px solid var(--ee-border-soft,#223b57)}td:nth-child(-n+2){white-space:nowrap}
@media (max-width:640px){.row{flex-direction:column}}
</style></head><body><main class="wrap"><a href="/owner">← OWNER管理</a>・<a href="/owner/growth">成長ダッシュボード</a>
<h1>SNS投稿セット（${esc(pack.week)} の週）</h1><p class="lead">実際のデータから毎週月曜に自動で作ります。下の「今すぐ作る」でいつでも作れます（投稿はしません）。投稿文のリンクには <code>?ref=</code> が付いているので、成長ダッシュボードの「どこから来たか」で効果が分かります。</p>
<section class="card" id="run"><h2>今すぐ作る<small>最新のデータで画像・動画・投稿文を作り直します（10分ほど）。SNSへの投稿はしません。同じ週の分は上書きされます。</small></h2><button type="button" class="copy" id="run-btn" disabled>今すぐ作る</button> <span class="muted" id="run-msg">状態を確認しています…</span></section>
<section class="card"><h2>ショート動画（YouTube・TikTok・Instagram 用）</h2>${video ? `<video src="${video}" controls playsinline style="width:216px;border-radius:10px"></video><p class="dl"><a href="${video}" download>動画をダウンロード</a></p>` : '<p class="muted">まだ作られていません（毎週月曜に自動で作ります。GitHub の「SNS weekly pack」から手動でも動かせます）。</p>'}</section>
<section class="card"><h2>自動投稿の結果</h2>${postRows}</section>
${items || '<p class="muted">今週のネタを作れるデータがありません。</p>'}
<script>(()=>{const b=document.getElementById("run-btn"),m=document.getElementById("run-msg");let was=false,timer=null;
const label={success:"成功",failure:"失敗",cancelled:"中止"};
const show=d=>{if(!d||!d.ok){b.disabled=true;m.textContent=d&&d.error==="GITHUB_TOKEN_REJECTED"?"GitHub の鍵が使えません（SOCIAL_GITHUB_DISPATCH_TOKEN を確認）":"GitHub の状態を読めませんでした";return}
if(!d.configured){b.disabled=true;m.textContent="未設定：Worker のシークレットに SOCIAL_GITHUB_DISPATCH_TOKEN がありません";return}
const last=d.last?("前回 "+new Date(d.last.createdAt).toLocaleString("ja-JP")+"："+(d.running?"作成中":(label[d.last.conclusion]||d.last.conclusion||d.last.status))):"まだ実行がありません";
b.disabled=d.running;m.innerHTML="";m.append(last);if(d.last&&d.last.url&&String(d.last.url).startsWith("https://github.com/")){const a=document.createElement("a");a.href=d.last.url;a.target="_blank";a.rel="noopener";a.textContent=" 詳細";m.append(a)}
if(was&&!d.running&&d.last&&d.last.conclusion==="success"){m.append("（できました。再読み込みすると反映されます）")}
was=d.running;clearTimeout(timer);if(d.running)timer=setTimeout(load,30000)};
const load=()=>fetch("/owner/social/run",{credentials:"same-origin"}).then(r=>r.json()).then(show).catch(()=>show(null));
b.addEventListener("click",async()=>{b.disabled=true;m.textContent="依頼しています…";try{const r=await fetch("/owner/social/run",{method:"POST",credentials:"same-origin"});const d=await r.json();
if(d.ok){m.textContent="作成を始めました。10分ほどで終わります";was=true;timer=setTimeout(load,15000)}else if(d.error==="ALREADY_RUNNING"){m.textContent="いま作成中です";was=true;timer=setTimeout(load,30000)}else{show({ok:false,error:d.error})}}catch(e){show(null)}});
load()})()</script>
<script>document.querySelectorAll(".copy").forEach(b=>b.addEventListener("click",async()=>{const t=b.closest(".cap").querySelector("textarea");try{await navigator.clipboard.writeText(t.value);b.textContent="コピーしました"}catch(e){t.select();document.execCommand("copy");b.textContent="コピーしました"}setTimeout(()=>{b.textContent="コピー"},1500)}));</script>
</main></body></html>`;
}
