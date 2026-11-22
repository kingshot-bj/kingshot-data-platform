// ログインしていない人（と検索エンジン・AdSense の審査）に見せるトップページ。2026-11-15。
// ・何のサイトか、王国番号の検索、ツール、今週のデータ（実際の数字）、KvK、できること、データの出典、登録の入口。
// ・ログインしている人のトップ（renderHome のダッシュボード）は変えない。
// ・数字は王国ページの分析と同じ「全王国の一覧」（kingdom-insights.js・isolate で1時間覚える）から作る。MightPulse は呼ばない。
// ・「0人」「通信中」のような、ログインしていないと意味のない表示は出さない。
import { shell } from "./public-pages.js";
import { REPORTS } from "./reports.js";
import { GUIDE_LIST, GUIDE_LIST_EN } from "./guides.js";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = n => Number(n).toLocaleString("ja-JP");
export const HOME_TOP_N = 5;
export const YOUNG_DAYS = 180;

function compact(v) {
  const n = Number(v), a = Math.abs(n);
  const f = (x, u) => (Math.round(x * 10) / 10).toString().replace(/\.0$/, "") + u;
  return a >= 1e9 ? f(n / 1e9, "B") : a >= 1e6 ? f(n / 1e6, "M") : a >= 1e3 ? f(n / 1e3, "K") : String(Math.round(n));
}
const jstDate = sec => new Date(sec * 1000 + 9 * 3600 * 1000).toISOString().slice(0, 10);

// 今週のデータ：7日で伸びた王国・開設180日以内で伸びた王国（それぞれ上位5）。
export function homeHighlights(rows) {
  const ok = (rows || []).filter(r => r && Number.isInteger(r.kid) && r.power != null && r.gain != null);
  const byGain = (a, b) => b.gain - a.gain || a.kid - b.kid;
  const at = Math.max(0, ...ok.map(r => Number(r.at) || 0));
  return {
    total: (rows || []).filter(r => r && r.power != null).length,
    observedAt: at || null,
    gain: ok.slice().sort(byGain).slice(0, HOME_TOP_N),
    young: ok.filter(r => r.age != null && r.age <= YOUNG_DAYS).sort(byGain).slice(0, HOME_TOP_N)
  };
}

function rankCard(title, icon, list, moreHref, moreLabel, lang = "ja") {
  if (list.length < 3) return "";
  const en = lang === "en";
  const rows = list.map((r, i) => `<a class="rk" href="/k/${encodeURIComponent(r.kid)}"><i>${i + 1}</i><span><b>${en ? "Kingdom" : "王国"} ${esc(r.kid)}</b><small>${r.age != null ? (en ? `Day ${esc(r.age)} · ` : `開設${esc(r.age)}日・`) : ""}${en ? "Power" : "総力"} ${esc(compact(r.power))}</small></span><em class="${r.gain < 0 ? "down" : "up"}">${r.gain < 0 ? "" : "+"}${esc(compact(r.gain))}</em></a>`).join("");
  return `<div class="hcard"><h3>${icon} ${esc(title)}</h3>${rows}<a class="more" href="${esc(moreHref)}">${esc(moreLabel)} →</a></div>`;
}

const TOOLS = [
  ["/tools/hero-shards", "💎", "英雄の欠片計算", "★5までの必要数"],
  ["/tools/gold", "🪙", "黄金計算", "建物ごとのG1〜8"],
  ["/tools/gold-tech", "🔬", "黄金研究計算", "T11研究の必要数"],
  ["/hero-catalog", "🦸", "英雄カタログ", "全英雄のスキル"],
  ["/kingdom-timeline", "🗓️", "王国タイムライン", "開設何日目に何が解放されるか"],
  ["/guide", "📖", "使い方", "ページの見方・用語集・よくある質問"]
];

// 英語版（/en）。ツールなどの中身はまだ日本語なので「(Japanese)」と書く。2026-11-19
const TOOLS_EN = [
  ["/tools/hero-shards", "💎", "Hero shard calculator", "Shards needed up to 5★ (Japanese)"],
  ["/tools/gold", "🪙", "Gold calculator", "G1–G8 per building (Japanese)"],
  ["/tools/gold-tech", "🔬", "Gold research calculator", "T11 research costs (Japanese)"],
  ["/hero-catalog", "🦸", "Hero catalog", "Skills of every hero (Japanese)"],
  ["/kingdom-timeline", "🗓️", "Kingdom timeline", "What unlocks on which server day (Japanese)"],
  ["/en/guides", "📖", "Event basics", "Swordland, Summit League, KvK"]
];
const FEATURES_EN = [
  ["🏰", "Kingdom analysis", "free", "Where a kingdom ranks among all kingdoms by power and 7-day growth, and against kingdoms of a similar age.", "/kingdoms"],
  ["⚔️", "KvK matchups", "free", "Every matchup compared by Mystic Trial records, not just power.", "/kvk/matchups"],
  ["👥", "Governor details and compare up to 6", "login", "Heroes, troops and Mystic Trial side by side — share as an image.", "/login?next=%2Fen"],
  ["👀", "Watchlist", "login", "Follow changes of governors and kingdoms on your home screen.", "/login?next=%2Fen"]
];

const FEATURES = [
  ["🏰", "王国の分析", "free", "総力・7日の伸びが全王国の何位か、開設時期が近い王国の中でどうか。", "/kingdoms"],
  ["⚔️", "KvK の組み合わせ", "free", "全組み合わせを秘境の試練の記録で比較。", "/kvk/matchups"],
  ["👥", "プレイヤー詳細・最大6人の比較", "login", "英雄・部隊・秘境の試練まで並べて、どこで差がついているか。画像で共有も。", "/login"],
  ["👀", "ウォッチ", "login", "気になるプレイヤー・王国の変化をホームでまとめて確認。", "/login"]
];

const VISITOR_CSS = `<style>
.htop{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 12px}.hbrand{display:flex;align-items:baseline;gap:8px;font-size:15px;min-width:0}.hbrand small{font-size:11px;color:var(--ee-subtext);white-space:nowrap}.hlogin{flex:none;padding:9px 16px;border-radius:999px;background:var(--ee-cyan);color:#04202a;font:800 13px system-ui;text-decoration:none}
.hero{margin:6px 0 4px;padding:20px 16px;border:1px solid color-mix(in srgb,var(--ee-cyan) 35%,transparent);border-radius:18px;background:linear-gradient(140deg,color-mix(in srgb,var(--ee-cyan) 14%,var(--ee-panel)),var(--ee-panel))}
.hero h1{margin:0 0 8px;font-size:23px;line-height:1.35}.hero p{margin:0 0 14px;font-size:13.5px;line-height:1.7;color:var(--ee-subtext)}
.hsearch{display:flex;gap:8px}.hsearch input{flex:1;min-width:0;padding:12px;border-radius:12px;border:1px solid var(--ee-border);background:var(--ee-panel-deep,var(--ee-bg));color:var(--ee-text);font:15px system-ui}.hsearch button{padding:12px 16px;border:0;border-radius:12px;background:var(--ee-cyan);color:#04202a;font:800 14px system-ui}
.hsub{margin:-4px 0 10px;font-size:12px;color:var(--ee-subtext)}
.tools{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.tl{display:block;padding:12px;border:1px solid var(--ee-border-soft);border-radius:14px;background:var(--ee-panel);color:var(--ee-text);text-decoration:none}.tl.wide{grid-column:1/-1}.tl .ic{display:block;font-size:22px;margin-bottom:4px}.tl b{display:block;font-size:14px}.tl small{display:block;margin-top:2px;font-size:11.5px;color:var(--ee-subtext);line-height:1.5}
.hcard{border:1px solid var(--ee-border-soft);border-radius:16px;background:var(--ee-panel);padding:12px 12px 6px;margin:10px 0}.hcard.pad{padding:14px}.hcard h3{margin:0 0 6px;font-size:14px}
.rk{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px 2px;border-top:1px solid var(--ee-border-soft);color:var(--ee-text);text-decoration:none}.hcard h3+.rk{border-top:0}
.rk i{font-style:normal;font-weight:900;color:var(--ee-subtext);text-align:center}.rk b{font-size:14px}.rk small{display:block;font-size:11px;color:var(--ee-subtext)}.rk em{font-style:normal;font-weight:800}
.more{display:block;padding:8px 0 6px;font-size:12px;color:var(--ee-cyan);text-decoration:none}
.hkvk{display:flex;gap:12px;align-items:center}.hkvk .vs{font-size:28px;font-weight:900;color:var(--ee-cyan)}.hkvk p{margin:0;font-size:13px;line-height:1.6;color:var(--ee-subtext)}.hkvk p b{color:var(--ee-text)}
.hbtn{display:inline-block;margin-top:10px;padding:10px 14px;border-radius:11px;background:var(--ee-panel-raised,var(--ee-panel));border:1px solid var(--ee-border-soft);color:var(--ee-text);text-decoration:none;font-weight:800;font-size:13px}
.feats{display:grid;gap:8px}.ft{display:grid;grid-template-columns:34px minmax(0,1fr);gap:10px;padding:10px;border:1px solid var(--ee-border-soft);border-radius:13px;background:var(--ee-panel);color:var(--ee-text);text-decoration:none}.ft .ic{font-size:22px;text-align:center}.ft b{font-size:14px}.ft small{display:block;margin-top:2px;font-size:12px;color:var(--ee-subtext);line-height:1.55}
.tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800}.tag.free{background:color-mix(in srgb,var(--ee-success,#22c55e) 18%,transparent);color:var(--ee-success,#22c55e)}.tag.login{background:color-mix(in srgb,var(--ee-cyan) 18%,transparent);color:var(--ee-cyan)}
.about{font-size:12.5px;color:var(--ee-subtext);line-height:1.75;border:1px dashed var(--ee-border-soft);border-radius:13px;padding:12px}.about a{color:var(--ee-cyan)}
.hcta{margin:22px 0 8px;padding:18px 16px;border-radius:18px;background:linear-gradient(135deg,color-mix(in srgb,var(--ee-cyan) 18%,var(--ee-panel)),var(--ee-panel));border:1px solid color-mix(in srgb,var(--ee-cyan) 40%,transparent);text-align:center}.hcta b{display:block;font-size:16px;margin-bottom:6px}.hcta p{margin:0 0 12px;font-size:12.5px;color:var(--ee-subtext)}.hcta a{display:inline-block;padding:12px 22px;border-radius:12px;background:var(--ee-cyan);color:#04202a;font-weight:900;text-decoration:none}
.ee-invited{display:block;margin:0 0 12px;padding:12px 14px;border-radius:14px;border:1px solid color-mix(in srgb,var(--ee-gold,#facc15) 45%,transparent);background:color-mix(in srgb,var(--ee-gold,#facc15) 10%,var(--ee-panel));color:var(--ee-text);text-decoration:none}.ee-invited b{display:block;font-size:14px}.ee-invited span{display:block;margin-top:3px;font-size:12px;color:var(--ee-subtext)}
.hfoot{margin-top:18px;font-size:11px;color:var(--ee-subtext);text-align:center}.hfoot a{color:var(--ee-subtext)}
</style>`;

export function renderVisitorHome({ origin = "", highlights = null, kvkSeason = null, inviteBanner = "", lang = "ja" } = {}) {
  if (lang === "en") return renderVisitorHomeEn({ origin, highlights, kvkSeason });
  const h = highlights || { total: 0, gain: [], young: [], observedAt: null };
  const total = h.total ? `全${nf(h.total)}王国` : "全王国";
  const tools = TOOLS.map(([href, icon, name, sub, wide]) => `<a class="tl${wide ? " wide" : ""}" href="${href}"><span class="ic">${icon}</span><b>${esc(name)}</b><small>${esc(sub)}</small></a>`).join("");
  const cards = rankCard("7日間でいちばん伸びた王国", "📈", h.gain, "/kingdoms", "全王国の一覧を見る") + rankCard(`開設${YOUNG_DAYS}日以内で伸びている王国`, "🌱", h.young, "/kingdoms", "新しい王国をもっと見る");
  const week = cards ? `<h2>今週のデータ</h2><p class="hsub">${h.observedAt ? esc(jstDate(h.observedAt)) + " 時点・" : ""}毎日更新</p>${cards}` : "";
  const kvk = kvkSeason ? `<h2>KvK</h2><div class="hcard pad"><div class="hkvk"><div class="vs">⚔</div><p><b>シーズン${esc(kvkSeason)}の組み合わせ</b><br>総力ではなく、秘境の試練の6種類で両王国の1位の記録を比べています。</p></div><a class="hbtn" href="/kvk/s${encodeURIComponent(kvkSeason)}">組み合わせを見る →</a></div>` : "";
  const feats = FEATURES.map(([icon, name, kind, text, href]) => `<a class="ft" href="${href}"><span class="ic">${icon}</span><span><b>${esc(name)}</b> <span class="tag ${kind}">${kind === "free" ? "ログインなし" : "無料登録"}</span><small>${esc(text)}</small></span></a>`).join("");
  // ログインは一番上にも置く（下までスクロールしないと無かったため・2026-11-15）。
  const body = `<div class="htop"><span class="hbrand">🦅 <b>EagleEye</b><small>キングショット非公式</small></span><a class="hlogin" href="/login">ログイン</a></div>
${inviteBanner}<section class="hero">
<h1>キングショットの王国・KvK・英雄を、データで比べる</h1>
<p>${esc(total)}の戦力と成長を毎日集めて、順位や伸び、開設時期が近い王国との比較までまとめています。王国番号を入れると、その王国の分析が見られます。</p>
<form class="hsearch" action="/kingdoms" method="get" onsubmit="var k=(this.k.value||'').replace(/\\D/g,'');if(k){location.href='/k/'+k;return false}"><input name="k" placeholder="王国番号（例：1524）" inputmode="numeric" aria-label="王国番号"><button type="submit">見る</button></form>
</section>
<h2>ツール</h2><div class="tools">${tools}</div>
${week}
${kvk}
<h2>イベントの基本</h2><div class="feats">${GUIDE_LIST.map(g => `<a class="ft" href="/guides/${g.slug}"><span class="ic">📖</span><span><b>${esc(g.title)}</b><small>${esc(g.lead)}</small></span></a>`).join("")}</div><p style="margin:8px 0 0;font-size:12px"><a href="/guides">イベントの基本の一覧 →</a></p>
<h2>データレポート</h2><div class="feats">${REPORTS.map(r => `<a class="ft" href="/reports/${r.slug}"><span class="ic">📊</span><span><b>${esc(r.title)}</b><small>${esc(r.lead)}</small></span></a>`).join("")}</div><p style="margin:8px 0 0;font-size:12px"><a href="/reports" style="color:var(--ee-cyan)">レポートの一覧 →</a></p>
<h2>EagleEyeでできること</h2><div class="feats">${feats}</div>
<h2>データについて</h2><div class="about">ゲーム内の公開データを MightPulse の API から取得し、毎日更新しています。順位・比較・分析は EagleEye が計算したものです。EagleEye はキングショットの公式サイトではありません。<a href="/about">運営者情報</a></div>
<div class="hcta"><b>自分の王国をもっと詳しく</b><p>無料登録すると、プレイヤーの比較やウォッチが使えます。</p><a href="/login">無料で登録する</a></div>
<p class="hfoot"><a href="/guide">使い方</a>・<a href="/guides">イベントの基本</a>・<a href="/reports">データレポート</a>・<a href="/terms">利用規約</a>・<a href="/privacy">プライバシーポリシー</a>・<a href="/about">運営者情報</a></p>
${VISITOR_CSS}`;
  const jsonLd = { "@context": "https://schema.org", "@type": "WebSite", name: "EagleEye", url: origin + "/", inLanguage: "ja", description: "キングショット（KingShot）の王国・KvK・英雄のデータを毎日集めて比べられる非公式サイト" };
  return shell({
    title: "キングショット（KingShot）分析・攻略ツール｜王国・プレイヤー観測 | EagleEye",
    description: `キングショット（KingShot）の分析・攻略に役立つ非公式ファンサイト。${total}の戦力・7日間の伸び・開設時期が近い王国との比較、KvKの組み合わせ（秘境の試練で比較）、英雄カタログ、欠片・黄金の計算ツール。`,
    canonical: origin + "/", body, jsonLd, origin
  });
}

// 英語版のトップ（/en）。2026-11-19
function renderVisitorHomeEn({ origin = "", highlights = null, kvkSeason = null } = {}) {
  const h = highlights || { total: 0, gain: [], young: [], observedAt: null };
  const total = h.total ? `${h.total.toLocaleString("en-US")} kingdoms` : "every kingdom";
  const tools = TOOLS_EN.map(([href, icon, name, sub]) => `<a class="tl" href="${href}"><span class="ic">${icon}</span><b>${esc(name)}</b><small>${esc(sub)}</small></a>`).join("");
  const cards = rankCard("Fastest-growing kingdoms (7 days)", "📈", h.gain, "/kingdoms", "See all kingdoms (Japanese)", "en") + rankCard(`Growing kingdoms under ${YOUNG_DAYS} days old`, "🌱", h.young, "/kingdoms", "More new kingdoms (Japanese)", "en");
  const week = cards ? `<h2>This week</h2><p class="hsub">${h.observedAt ? "As of " + esc(jstDate(h.observedAt)) + " · " : ""}updated daily</p>${cards}` : "";
  const kvk = kvkSeason ? `<h2>KvK</h2><div class="hcard pad"><div class="hkvk"><div class="vs">⚔</div><p><b>Season ${esc(kvkSeason)} matchups</b><br>Both kingdoms compared by their top Mystic Trial records in all six trials — not by power.</p></div><a class="hbtn" href="/kvk/s${encodeURIComponent(kvkSeason)}">See matchups (Japanese) →</a></div>` : "";
  const feats = FEATURES_EN.map(([icon, name, kind, text, href]) => `<a class="ft" href="${href}"><span class="ic">${icon}</span><span><b>${esc(name)}</b> <span class="tag ${kind}">${kind === "free" ? "No login" : "Free sign-up"}</span><small>${esc(text)}</small></span></a>`).join("");
  const guides = GUIDE_LIST_EN.map(g => `<a class="ft" href="/en/guides/${g.slug}"><span class="ic">📖</span><span><b>${esc(g.title)}</b><small>${esc(g.lead)}</small></span></a>`).join("");
  const body = `<div class="htop"><span class="hbrand">🦅 <b>EagleEye</b><small>Unofficial Kingshot data</small></span><a class="hlogin" href="/login?next=%2Fen">Log in</a></div>
<section class="hero">
<h1>Compare Kingshot kingdoms, KvK and heroes with data</h1>
<p>We collect power and growth for ${esc(total)} every day — rankings, 7-day growth and comparisons with kingdoms of a similar age. Enter a kingdom number to see its analysis (pages are in Japanese for now).</p>
<form class="hsearch" action="/kingdoms" method="get" onsubmit="var k=(this.k.value||'').replace(/\\D/g,'');if(k){location.href='/k/'+k;return false}"><input name="k" placeholder="Kingdom number (e.g. 1524)" inputmode="numeric" aria-label="Kingdom number"><button type="submit">Go</button></form>
</section>
<h2>Event basics</h2><div class="feats">${guides}</div><p style="margin:8px 0 0;font-size:12px"><a href="/en/guides">All event guides →</a></p>
<h2>Tools</h2><div class="tools">${tools}</div>
${week}
${kvk}
<h2>What you can do</h2><div class="feats">${feats}</div>
<h2>About the data</h2><div class="about">Public in-game data is collected daily through the MightPulse API. Rankings, comparisons and analysis are calculated by EagleEye. EagleEye is not an official Kingshot site. Most pages are still in Japanese; English pages are being added step by step.</div>
<div class="hcta"><b>See more of your own kingdom</b><p>Sign up for free (Discord or Google) to compare governors and use the watchlist.</p><a href="/login?next=%2Fen">Sign up for free</a></div>
${VISITOR_CSS}`;
  const jsonLd = { "@context": "https://schema.org", "@type": "WebSite", name: "EagleEye", url: origin + "/en", inLanguage: "en", description: "Unofficial site that collects Kingshot kingdom, KvK and hero data every day so you can compare them." };
  return shell({
    title: "Kingshot analysis and tools — kingdoms, KvK, heroes | EagleEye",
    description: `Unofficial Kingshot fan site: power and 7-day growth of ${total}, comparisons with kingdoms of a similar age, KvK matchups compared by Mystic Trial, hero catalog and calculators.`,
    canonical: origin + "/en", body, jsonLd, origin, lang: "en"
  });
}
