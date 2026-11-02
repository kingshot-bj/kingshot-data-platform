// Public, search-engine friendly pages (no login needed):
//   /kingdoms      every kingdom, grouped by number, with a search box
//   /k/{kid}       one kingdom: power & growth, top players / alliances, KvK
//   /robots.txt, /sitemap.xml
// They show kingdom-level information only (plus the in-game public top 10),
// and lead visitors to log in (watchlists, player details, full rankings) and
// to contribute a MightPulse API key (ADVANCED). Reads are cheap indexed D1
// queries plus at most a few small R2 objects; responses are cacheable.

import { loadKingdomGrowthHistory, KINGDOM_GROWTH_FIELDS } from "./kingdom-growth-history.js";
import { loginUrlFor } from "./login-return.js";

export const PUBLIC_CACHE_SECONDS = 300;

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function compactNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  const a = Math.abs(n);
  const f = (d, s) => (n / d).toFixed(a / d >= 100 ? 0 : 1).replace(/\.0$/, "") + s;
  if (a >= 1e12) return f(1e12, "T");
  if (a >= 1e9) return f(1e9, "B");
  if (a >= 1e6) return f(1e6, "M");
  if (a >= 1e3) return f(1e3, "K");
  return n.toLocaleString("ja-JP");
}

function signed(value, formatter = compactNumber) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return "±0";
  return (n > 0 ? "+" : "−") + formatter(Math.abs(n));
}

export function publicOrigin(request) {
  try { return new URL(request.url).origin; } catch { return ""; }
}

function shell({ title, description, canonical, body, jsonLd = null, origin = "" }) {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="EagleEye"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${esc(origin)}/assets/eagleeye/bjnyan/hero_bjnyan.png"><meta name="twitter:card" content="summary">
${jsonLd ? '<script type="application/ld+json">' + JSON.stringify(jsonLd).replace(/</g, "\\u003c") + "</script>" : ""}
<style>
body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.wrap{max-width:820px;margin:0 auto;padding:18px 16px calc(96px + env(safe-area-inset-bottom))}
.crumbs{font-size:12px;color:var(--ee-subtext)}.crumbs a{color:var(--ee-cyan);text-decoration:none}
h1{margin:6px 0 4px;font-size:26px;line-height:1.25}.lead{margin:0 0 14px;color:var(--ee-subtext);font-size:13px;line-height:1.6}
h2{margin:22px 0 8px;font-size:17px}
.stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}@media(min-width:640px){.stats{grid-template-columns:repeat(4,minmax(0,1fr))}}
.stat{padding:11px 12px;border:1px solid var(--ee-border-soft);border-radius:var(--ee-radius-md,13px);background:var(--ee-panel)}.stat small{display:block;font-size:11px;color:var(--ee-subtext)}.stat b{display:block;margin-top:3px;font-size:18px}.stat em{display:block;font-style:normal;font-size:11px;margin-top:2px}
.up{color:var(--ee-success,#22c55e)}.down{color:var(--ee-danger,#f87171)}
.list{display:grid;gap:6px}.row{display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:8px;align-items:center;padding:10px 12px;border:1px solid var(--ee-border-soft);border-radius:var(--ee-radius-md,13px);background:var(--ee-panel)}.row b{font-size:15px;text-align:center}.row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.row small{color:var(--ee-subtext);font-size:11px;margin-left:4px}.row em{font-style:normal;font-weight:800;color:var(--ee-cyan)}
.cta{margin:18px 0;padding:16px;border:1px solid color-mix(in srgb,var(--ee-cyan) 40%,transparent);border-radius:var(--ee-radius-lg,17px);background:linear-gradient(135deg,color-mix(in srgb,var(--ee-cyan) 12%,var(--ee-panel)),var(--ee-panel))}.cta h2{margin:0 0 6px;font-size:16px}.cta ul{margin:6px 0 12px;padding-left:18px;font-size:13px;line-height:1.7}.cta .cta-btn{display:inline-block;padding:11px 16px;border-radius:12px;background:var(--ee-cyan);color:var(--ee-on-accent,#062033);font-weight:900;text-decoration:none}.cta .sub{display:block;margin-top:10px;font-size:12px;color:var(--ee-subtext)}.cta .sub a{color:var(--ee-cyan)}
.empty{padding:14px;border:1px dashed var(--ee-border-soft);border-radius:13px;color:var(--ee-subtext);font-size:13px}
.kvk{padding:14px;border:1px solid var(--ee-border-soft);border-radius:var(--ee-radius-lg,17px);background:var(--ee-panel);font-size:14px}.kvk a{color:var(--ee-cyan)}
.search{display:flex;gap:8px;margin:10px 0 16px}.search input{flex:1;min-width:0;padding:12px;border:1px solid var(--ee-border);border-radius:12px;font:inherit;background:var(--ee-panel-deep);color:var(--ee-text)}.search button{padding:12px 16px;border:0;border-radius:12px;background:var(--ee-cyan);color:var(--ee-on-accent,#062033);font-weight:900}
.range h2{font-size:14px;color:var(--ee-subtext)}.grid{display:flex;flex-wrap:wrap;gap:6px}.grid a{min-width:52px;padding:7px 8px;border:1px solid var(--ee-border-soft);border-radius:10px;background:var(--ee-panel);color:var(--ee-text);text-align:center;text-decoration:none;font-size:13px;font-variant-numeric:tabular-nums}
.note{margin-top:20px;font-size:11px;color:var(--ee-subtext);line-height:1.6}
</style></head><body><main class="wrap">${body}</main></body></html>`;
}

function loginCta(kid, signedIn) {
  if (signedIn) {
    return `<section class="cta"><h2>もっと詳しく見る</h2><ul><li>ランキング100位まで・26種類のランキング</li><li>プレイヤー詳細・育成の推移・比較</li><li>ウォッチリストで変化を追跡</li></ul><a class="cta-btn" href="/kingdom?kid=${encodeURIComponent(kid)}">王国 ${esc(kid)} の詳細ページへ</a><span class="sub">MightPulse APIキーを提供すると ADVANCED になり、KvKの詳細なども見られます → <a href="/my-player">マイKingShot</a></span></section>`;
  }
  return `<section class="cta"><h2>ログインするとできること（無料）</h2><ul><li>この王国のランキングを100位まで・26種類で表示</li><li>プレイヤーの詳細・英雄や装備の育成の推移・比較</li><li>ウォッチリストで気になるプレイヤーや王国の変化を通知</li><li>KvKの通知スレッド（Discord）</li></ul><a class="cta-btn" href="${esc(loginUrlFor("/kingdom?kid=" + encodeURIComponent(kid)))}">Discordでログイン</a><span class="sub">さらに MightPulse APIキーを提供すると ADVANCED になり、KvKの日ごとのスコアなども見られます。</span></section>`;
}

const fmtDate = at => new Date(Number(at) * 1000).toISOString().slice(0, 10);

export async function loadPublicKingdom(env, kid) {
  const db = env.DB;
  const [catalog, players, alliances, matchup, score, growth] = await Promise.all([
    db.prepare("SELECT kid, name, status, region, language, last_seen_at FROM kingdom_catalog WHERE kid = ? LIMIT 1").bind(kid).first().catch(() => null),
    db.prepare("SELECT rank, nick_name, score, aid, abbr FROM kingdom_ranking_current WHERE kid = ? AND board = 'personal_power' AND target_type = 'PLAYER' ORDER BY rank ASC LIMIT 10").bind(kid).all().catch(() => ({ results: [] })),
    db.prepare("SELECT rank, abbr, name, score FROM kingdom_ranking_current WHERE kid = ? AND board = 'alliance_power' AND target_type = 'ALLIANCE' ORDER BY rank ASC LIMIT 5").bind(kid).all().catch(() => ({ results: [] })),
    db.prepare("SELECT season, opponent, opponent_name FROM kvk_matchups WHERE kid = ? ORDER BY season DESC LIMIT 1").bind(kid).first().catch(() => null),
    db.prepare("SELECT season, stage, opponent, score, opponent_score FROM kvk_scores WHERE kid = ? LIMIT 1").bind(kid).first().catch(() => null),
    env.ARCHIVE ? loadKingdomGrowthHistory(env.ARCHIVE, kid).catch(() => null) : null
  ]);
  // Personal boards carry only the alliance id; resolve tags from the alliance boards.
  let playerRows = players?.results || [];
  if (playerRows.some(p => !p.abbr && p.aid)) {
    const tags = await db.prepare("SELECT aid, abbr FROM kingdom_ranking_current WHERE kid = ? AND target_type = 'ALLIANCE' AND abbr IS NOT NULL AND abbr <> '' AND aid IS NOT NULL").bind(kid).all().catch(() => ({ results: [] }));
    const norm = v => String(v ?? "").trim().replace(/^(\d+)\.0+$/, "$1");
    const byAid = new Map((tags?.results || []).map(t => [norm(t.aid), String(t.abbr)]));
    playerRows = playerRows.map(p => p.abbr || !p.aid ? p : { ...p, abbr: byAid.get(norm(p.aid)) || null });
  }
  return { catalog, players: playerRows, alliances: alliances?.results || [], matchup, score, growth };
}

export function renderPublicKingdomPage(kid, data, { origin = "", signedIn = false } = {}) {
  const { catalog, players, alliances, matchup, score, growth } = data;
  const latest = growth?.latest || null;
  const week = (growth?.comparisons || []).find(c => c.label === "7日前")?.snapshot || null;
  const canonical = origin + "/k/" + kid;
  const name = catalog?.name && String(catalog.name) !== String(kid) ? `（${catalog.name}）` : "";
  const title = `王国${kid}${name}の戦力・ランキング・KvK情報｜EagleEye`;
  const powerText = latest?.power != null ? `総戦力${compactNumber(latest.power)}` : "";
  const description = `KingShot 王国${kid}の${[powerText, latest?.power_gain_7d != null ? "7日間の戦力増加" + compactNumber(latest.power_gain_7d) : "", players.length ? "戦力ランキング上位" : "", matchup?.opponent ? `KvKシーズン${matchup.season}の対戦相手は王国${matchup.opponent}` : ""].filter(Boolean).join("、")}。毎日更新のKingShot王国データ。`;

  const stat = (label, key, rank = false) => {
    if (!latest || latest[key] == null) return "";
    const diff = week && week[key] != null ? latest[key] - week[key] : null;
    const better = rank ? diff < 0 : diff > 0;
    const diffHtml = diff == null ? "" : `<em class="${diff === 0 ? "" : better ? "up" : "down"}">7日 ${rank ? signed(diff, v => String(v)) : signed(diff)}</em>`;
    return `<div class="stat"><small>${esc(label)}</small><b>${esc(rank ? latest[key] + "位" : compactNumber(latest[key]))}</b>${diffHtml}</div>`;
  };
  const stats = latest ? `<div class="stats">${stat("総戦力", "power")}${stat("戦力順位", "power_rank", true)}${stat("7日間の戦力増加", "power_gain_7d")}${stat("7日間の役場上昇", "tc_pushers_7d")}${stat("領主数", "player_count")}${stat("平均戦力", "avg_power")}${stat("英雄戦力", "hero_power")}${stat("秘境の試練", "mystic_trial")}</div>`
    : `<div class="empty">この王国の集計データはまだありません（毎日自動で取得しています）。</div>`;

  const playerRows = players.length ? `<div class="list">${players.map(p => `<div class="row"><b>${esc(p.rank)}</b><span>${esc(p.nick_name || "-")}${p.abbr ? `<small>[${esc(p.abbr)}]</small>` : ""}</span><em>${esc(compactNumber(p.score))}</em></div>`).join("")}</div>`
    : `<div class="empty">個人ランキングは、この王国が誰かのウォッチリストに入ると自動で取得されます。</div>`;
  const allianceRows = alliances.length ? `<div class="list">${alliances.map(a => `<div class="row"><b>${esc(a.rank)}</b><span>${esc(a.name || a.abbr || "-")}${a.abbr && a.name ? `<small>[${esc(a.abbr)}]</small>` : ""}</span><em>${esc(compactNumber(a.score))}</em></div>`).join("")}</div>` : "";

  let kvk = "";
  if (matchup?.opponent) {
    const live = score && Number(score.season) === Number(matchup.season) && Number(score.opponent) === Number(matchup.opponent);
    kvk = `<h2>KvK</h2><div class="kvk">シーズン${esc(matchup.season)}の対戦相手：<a href="/k/${encodeURIComponent(matchup.opponent)}">王国 ${esc(matchup.opponent)}</a>${live && score.score != null ? `<br>スコア ${esc(compactNumber(score.score))} : ${esc(compactNumber(score.opponent_score))}` : ""}</div>`;
  }

  const body = `<nav class="crumbs"><a href="/">EagleEye</a> › <a href="/kingdoms">王国一覧</a> › 王国 ${esc(kid)}</nav>
<h1>王国 ${esc(kid)}${esc(name)}</h1>
<p class="lead">KingShot 王国${esc(kid)}の戦力・成長・ランキング・KvK情報。${growth?.latestAt ? esc(fmtDate(growth.latestAt)) + " 時点。" : ""}データは毎日更新されます。</p>
${stats}
<h2>戦力ランキング（上位10人）</h2>${playerRows}
${allianceRows ? `<h2>同盟ランキング（上位5）</h2>${allianceRows}` : ""}
${kvk}
${loginCta(kid, signedIn)}
<p class="note">データ提供：MightPulse。ゲーム内の公開情報をもとに集計しています。KingShotの公式サイトではありません。</p>`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "EagleEye", item: origin + "/" },
      { "@type": "ListItem", position: 2, name: "王国一覧", item: origin + "/kingdoms" },
      { "@type": "ListItem", position: 3, name: "王国 " + kid, item: canonical }
    ]
  };
  return shell({ title, description, canonical, body, jsonLd, origin });
}

export async function loadPublicKingdomIds(db) {
  const rows = await db.prepare("SELECT kid FROM kingdom_catalog WHERE kid > 0 ORDER BY kid ASC LIMIT 5000").all().catch(() => ({ results: [] }));
  return (rows?.results || []).map(r => Number(r.kid)).filter(Number.isInteger);
}

export function renderPublicKingdomsIndex(kids, { origin = "" } = {}) {
  const groups = new Map();
  for (const kid of kids) {
    const start = Math.floor((kid - 1) / 100) * 100 + 1;
    if (!groups.has(start)) groups.set(start, []);
    groups.get(start).push(kid);
  }
  const sections = [...groups.entries()].map(([start, list]) => `<section class="range"><h2>王国 ${start}〜${start + 99}</h2><div class="grid">${list.map(k => `<a href="/k/${k}">${k}</a>`).join("")}</div></section>`).join("");
  const body = `<nav class="crumbs"><a href="/">EagleEye</a> › 王国一覧</nav>
<h1>KingShot 王国一覧</h1>
<p class="lead">KingShotの全${kids.length.toLocaleString("ja-JP")}王国の戦力・成長・ランキング・KvK情報。王国番号を選ぶか、検索してください。</p>
<form class="search" action="/kingdoms" method="get" onsubmit="var v=this.kid.value.trim();if(/^\\d+$/.test(v)){location.href='/k/'+v;return false}"><input name="kid" inputmode="numeric" placeholder="王国番号（例：1524）"><button type="submit">表示</button></form>
${sections || '<div class="empty">王国データを読み込めませんでした。</div>'}
<p class="note">データ提供：MightPulse。KingShotの公式サイトではありません。</p>`;
  return shell({ title: "KingShot 王国一覧・戦力ランキング｜EagleEye", description: `KingShotの全${kids.length}王国の戦力・成長・ランキング・KvK対戦相手を毎日更新。王国番号から検索できます。`, canonical: origin + "/kingdoms", body, origin });
}

export function renderRobotsTxt(origin) {
  return `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\nDisallow: /owner\nDisallow: /my-player\nDisallow: /account\n\nSitemap: ${origin}/sitemap.xml\n`;
}

export function renderSitemapXml(origin, kids, today = new Date().toISOString().slice(0, 10)) {
  const urls = [`${origin}/`, `${origin}/kingdoms`, ...kids.map(k => `${origin}/k/${k}`)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `<url><loc>${esc(u)}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq></url>`).join("\n")}\n</urlset>\n`;
}

export { KINGDOM_GROWTH_FIELDS };
