import { loadAllKingdomStats, computeKingdomInsights, renderKingdomInsights, kingdomLeaderboards, YOUNG_KINGDOM_DAYS } from "./kingdom-insights.js";
import { loadArchivedKingdomRankings, formatArchiveDate } from "./kingdom-ranking-archive.js";
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
import { currentKingdomAge, renderKingdomTimelineSection, renderKingdomTimelineTable, KINGDOM_TIMELINE_CSS } from "./kingdom-timeline.js";
import { readR2Json } from "./kingdom-portal.js";
import { siteOrigin } from "./site-origin.js";
import { heroPagePaths } from "./hero-pages.js";

export const PUBLIC_CACHE_SECONDS = 300;
// 公開ページをWorkerのキャッシュに置く時間（ログインしていない人向けの同じHTML）。
// ・王国・同盟・KvK組み合わせ：データは1日1回＋KvK中のスコア → 1時間
// ・英雄・ツール・タイムライン：中身はデプロイの時しか変わらない → 6時間
export const PUBLIC_CACHE_TTL = Object.freeze({ data: 3600, static: 21600 });

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

// Canonical origin: PUBLIC_ORIGIN when configured, otherwise the request URL.
export function publicOrigin(request, env = null) {
  return siteOrigin(request, env);
}

// noindex: 検索に載せない（canonical・OGを出さず robots noindex）。存在しない王国・データがまだない王国に使う。
export function shell({ title, description, canonical, body, jsonLd = null, origin = "", noindex = false }) {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>${noindex ? '<meta name="robots" content="noindex">' : `<meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="EagleEye"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(canonical)}">`}
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
.kingdom-timeline h2{margin:22px 0 8px;font-size:17px}
${KINGDOM_TIMELINE_CSS}
.lbs{display:grid;gap:10px}@media(min-width:760px){.lbs{grid-template-columns:repeat(3,minmax(0,1fr))}}.lb{border:1px solid var(--ee-border-soft);border-radius:14px;background:var(--ee-panel);padding:10px 12px 4px}.lb h3{margin:0 0 4px;font-size:14px}.lb-row{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:8px;align-items:center;padding:7px 0;border-top:1px solid var(--ee-border-soft);color:var(--ee-text);text-decoration:none}.lb h3+.lb-row{border-top:0}.lb-row i{font-style:normal;font-weight:900;color:var(--ee-subtext);text-align:center}.lb-row b{font-size:14px}.lb-row small{display:block;font-size:11px;color:var(--ee-subtext)}.lb-row em{font-style:normal;font-weight:800}
.howto{margin:0;display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:13px;line-height:1.6}.howto dt{font-weight:800}.howto dd{margin:0;color:var(--ee-subtext)}@media(max-width:480px){.howto{grid-template-columns:1fr}.howto dd{margin-bottom:6px}}
.insights{margin:0;padding-left:20px;display:grid;gap:6px;font-size:14px;line-height:1.6}.insights b{color:var(--ee-text)}
.note{margin-top:20px;font-size:11px;color:var(--ee-subtext);line-height:1.6}
.related{display:grid;gap:10px}.rel-group{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.rel-group small{flex:0 0 100%;font-size:12px;color:var(--ee-subtext)}.rel-group a{padding:8px 10px;border:1px solid var(--ee-border-soft);border-radius:10px;background:var(--ee-panel);color:var(--ee-text);text-decoration:none;font-weight:800;font-size:13px}.rel-group a em{display:block;font-style:normal;font-weight:600;font-size:11px;color:var(--ee-subtext)}
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
  const [catalog, players, alliances, matchup, score, growth, near, allStats] = await Promise.all([
    db.prepare("SELECT kid, name, status, region, language, last_seen_at, r2_latest_key FROM kingdom_catalog WHERE kid = ? LIMIT 1").bind(kid).first().catch(() => null),
    db.prepare("SELECT rank, nick_name, score, aid, abbr FROM kingdom_ranking_current WHERE kid = ? AND board = 'personal_power' AND target_type = 'PLAYER' ORDER BY rank ASC LIMIT 10").bind(kid).all().catch(() => ({ results: [] })),
    db.prepare("SELECT rank, abbr, name, score, COALESCE(target_id, aid) AS aid FROM kingdom_ranking_current WHERE kid = ? AND board = 'alliance_power' AND target_type = 'ALLIANCE' ORDER BY rank ASC LIMIT 5").bind(kid).all().catch(() => ({ results: [] })),
    db.prepare("SELECT season, opponent, opponent_name FROM kvk_matchups WHERE kid = ? ORDER BY season DESC LIMIT 1").bind(kid).first().catch(() => null),
    db.prepare("SELECT season, stage, opponent, score, opponent_score FROM kvk_scores WHERE kid = ? LIMIT 1").bind(kid).first().catch(() => null),
    env.ARCHIVE ? loadKingdomGrowthHistory(env.ARCHIVE, kid).catch(() => null) : null,
    // 関連王国：近い番号（主キーの範囲で最大8行）
    db.prepare("SELECT kid FROM kingdom_catalog WHERE kid BETWEEN ? AND ? AND kid <> ? ORDER BY kid ASC").bind(kid - 4, kid + 4, kid).all().catch(() => ({ results: [] })),
    // 王国の分析と「総戦力が近い王国」：全王国の集計（isolate で1時間覚える）から計算する。
    loadAllKingdomStats(db).catch(() => null)
  ]);
  // power_rank（戦力順位）は意味が未確認なので使わない（2026-11-15）。近い王国は総戦力の並びで出す。
  const insights = allStats ? computeKingdomInsights(kid, allStats) : null;
  const similar = insights?.nearPower || [];
  // Personal boards carry only the alliance id; resolve tags from the alliance boards.
  let playerRows = players?.results || [];
  let allianceRows = alliances?.results || [];
  // 誰もウォッチしていない王国のランキングは、14日で R2 に移して D1 から消している（kingdom-ranking-archive.js）。
  // 公開ページも R2 の写しを読む（isolate で10分覚える）。日付をはっきり出す（2026-11-15）。
  let rankingsAsOf = null, archiveTags = null, playersFromArchive = false;
  if ((!playerRows.length || !allianceRows.length) && env.ARCHIVE) {
    const arch = await loadArchivedKingdomRankings(env.ARCHIVE, kid).catch(() => null);
    if (arch?.rows?.length) {
      const pick = (board, type, n) => arch.rows.filter(r => r.board === board && r.target_type === type).sort((a, b) => Number(a.rank) - Number(b.rank)).slice(0, n);
      const norm = v => String(v ?? "").trim().replace(/^(\d+)\.0+$/, "$1");
      archiveTags = new Map(arch.rows.filter(r => r.target_type === "ALLIANCE" && r.abbr && r.aid != null).map(r => [norm(r.aid), String(r.abbr)]));
      if (!playerRows.length) {
        playerRows = pick("personal_power", "PLAYER", 10).map(r => ({ rank: r.rank, nick_name: r.nick_name, score: r.score, aid: r.aid, abbr: r.abbr || archiveTags.get(norm(r.aid)) || null }));
        if (playerRows.length) { rankingsAsOf = arch.lastUpdatedAt || arch.archivedAt || null; playersFromArchive = true; }
      }
      if (!allianceRows.length) {
        allianceRows = pick("alliance_power", "ALLIANCE", 5).map(r => ({ rank: r.rank, abbr: r.abbr, name: r.name, score: r.score, aid: r.target_id ?? r.aid }));
        if (allianceRows.length && !rankingsAsOf) rankingsAsOf = arch.lastUpdatedAt || arch.archivedAt || null;
      }
    }
  }
  if (!playersFromArchive && playerRows.some(p => !p.abbr && p.aid)) {
    const tags = await db.prepare("SELECT aid, abbr FROM kingdom_ranking_current WHERE kid = ? AND target_type = 'ALLIANCE' AND abbr IS NOT NULL AND abbr <> '' AND aid IS NOT NULL").bind(kid).all().catch(() => ({ results: [] }));
    const norm = v => String(v ?? "").trim().replace(/^(\d+)\.0+$/, "$1");
    const byAid = new Map((tags?.results || []).map(t => [norm(t.aid), String(t.abbr)]));
    playerRows = playerRows.map(p => p.abbr || !p.aid ? p : { ...p, abbr: byAid.get(norm(p.aid)) || null });
  }
  // Kingdom age: daily growth record first, else the last stored kingdom snapshot.
  let age = null;
  if (growth?.latest?.age_days != null) age = currentKingdomAge(growth.latest.age_days, growth.latest.observed_at);
  else if (env.ARCHIVE && catalog?.r2_latest_key) {
    try {
      const snap = await readR2Json(env.ARCHIVE, catalog.r2_latest_key);
      const detail = snap?.payload?.data && typeof snap.payload.data === "object" ? snap.payload.data : snap?.payload;
      age = currentKingdomAge(detail?.age_days, snap?.observed_at);
    } catch { age = null; }
  }
  // ウォッチされていない王国は、裏で集めた同盟一覧（alliance_directory）から上位5を出す。
  let allianceList = allianceRows;
  if (!allianceList.length) {
    const dir = await db.prepare("SELECT rank, abbr, name, power AS score, aid FROM alliance_directory WHERE kid = ? ORDER BY rank ASC LIMIT 5").bind(kid).all().catch(() => ({ results: [] }));
    allianceList = dir?.results || [];
  }
  return { catalog, players: playerRows, alliances: allianceList, rankingsAsOf, matchup, score, growth, age, nearKids: (near?.results || []).map(r => Number(r.kid)).filter(Number.isInteger), similar, insights };
}

// 存在しない王国番号（カタログにない）は404にする。どんな番号でも中身のないページを返すと、検索エンジンに「中身のないページが無限にある」と見られる。
export async function publicKingdomExists(db, kid) {
  if (!Number.isInteger(kid) || kid <= 0) return false;
  const row = await db.prepare("SELECT 1 AS ok FROM kingdom_catalog WHERE kid = ? LIMIT 1").bind(kid).first().catch(() => ({ ok: 1 }));
  return Boolean(row);
}

export function renderPublicKingdomNotFound(kid) {
  const body = `<nav class="crumbs"><a href="/">EagleEye</a> › <a href="/kingdoms">王国一覧</a></nav>
<h1>王国 ${esc(kid)} は見つかりません</h1>
<p class="lead">この番号の王国はまだ記録されていません。新しい王国は毎日自動で取得しています。</p>
<p><a href="/kingdoms">王国一覧から探す →</a></p>`;
  return shell({ title: `王国${kid}は見つかりません | EagleEye`, description: "", canonical: "", body, noindex: true });
}

// どのページにも当たらない URL。トップページを 200 で返すと「中身が同じページが無限にある」（ソフト404）と見られるので、
// 404・noindex・canonical なし（＝広告タグも入らない）で返す（2026-11-15・AdSense の品質対応）。
export function renderNotFoundPage() {
  const body = `<nav class="crumbs"><a href="/">EagleEye</a></nav>
<h1>ページが見つかりません</h1>
<p class="lead">URL が間違っているか、ページが移動しました。</p>
<p><a href="/">トップページへ →</a>　<a href="/kingdoms">王国一覧 →</a>　<a href="/guide">使い方 →</a></p>`;
  return shell({ title: "ページが見つかりません | EagleEye", description: "", canonical: "", body, noindex: true });
}

export function renderPublicTimelinePage({ origin = "" } = {}) {
  const canonical = origin + "/kingdom-timeline";
  const body = `<nav class="crumbs"><a href="/">EagleEye</a> › 王国タイムライン</nav>
<h1>キングショット 王国タイムライン</h1>
<p class="lead">王国の開設から何日目に、英雄・ペット・黄金・研究が解放されるかの目安です。自分の王国の開設日数は<a href="/kingdoms">王国ページ</a>で見られます。</p>
${renderKingdomTimelineTable()}`;
  return shell({ title: "キングショット 王国タイムライン（英雄・ペット・黄金の解放時期） | EagleEye", description: "キングショット（KingShot）の王国開設からの日数ごとに、新しい英雄・ペット・黄金・研究が解放される時期の目安をまとめた一覧。", canonical, body, origin , jsonLd: { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "EagleEye", item: origin + "/" }, { "@type": "ListItem", position: 2, name: "王国タイムライン", item: canonical }] } });
}

export function renderPublicKingdomPage(kid, data, { origin = "", signedIn = false } = {}) {
  const { catalog, players, alliances, matchup, score, growth } = data;
  const latest = growth?.latest || null;
  const week = (growth?.comparisons || []).find(c => c.label === "7日前")?.snapshot || null;
  const canonical = origin + "/k/" + kid;
  const name = catalog?.name && String(catalog.name) !== String(kid) ? `（${catalog.name}）` : "";
  const title = `王国${kid}${name}の戦力・ランキング・KvK情報｜キングショット | EagleEye`;
  const powerText = latest?.power != null ? `総戦力${compactNumber(latest.power)}` : "";
  const description = `キングショット（KingShot）王国${kid}の${[powerText, latest?.power_gain_7d != null ? "7日間の戦力増加" + compactNumber(latest.power_gain_7d) : "", players.length ? "戦力ランキング上位" : "", matchup?.opponent ? `KvKシーズン${matchup.season}の対戦相手は王国${matchup.opponent}` : "", data.age != null ? `開設${data.age}日目` : ""].filter(Boolean).join("、")}。毎日更新のKingShot王国データ。`;

  const stat = (label, key, rank = false) => {
    if (!latest || latest[key] == null) return "";
    const diff = week && week[key] != null ? latest[key] - week[key] : null;
    const better = rank ? diff < 0 : diff > 0;
    const diffHtml = diff == null ? "" : `<em class="${diff === 0 ? "" : better ? "up" : "down"}">7日 ${rank ? signed(diff, v => String(v)) : signed(diff)}</em>`;
    return `<div class="stat"><small>${esc(label)}</small><b>${esc(rank ? latest[key] + "位" : compactNumber(latest[key]))}</b>${diffHtml}</div>`;
  };
  const stats = latest ? `<div class="stats">${stat("総戦力", "power")}${stat("7日間の戦力増加", "power_gain_7d")}${stat("7日間の役場上昇", "tc_pushers_7d")}${stat("領主数", "player_count")}${stat("平均戦力", "avg_power")}${stat("英雄戦力", "hero_power")}${stat("秘境の試練", "mystic_trial")}</div>`
    : `<div class="empty">この王国の集計データはまだありません（毎日自動で取得しています）。</div>`;

  const playerRows = players.length ? `<div class="list">${players.map(p => `<div class="row"><b>${esc(p.rank)}</b><span>${esc(p.nick_name || "-")}${p.abbr ? `<small>[${esc(p.abbr)}]</small>` : ""}</span><em>${esc(compactNumber(p.score))}</em></div>`).join("")}</div>`
    : "";
  const allianceRows = alliances.length ? `<div class="list">${alliances.map(a => { const aid = String(a.aid ?? "").replace(/^(\d+)\.0+$/, "$1"); const label = `${esc(a.name || a.abbr || "-")}${a.abbr && a.name ? `<small>[${esc(a.abbr)}]</small>` : ""}`; return `<div class="row"><b>${esc(a.rank)}</b><span>${/^\d+$/.test(aid) ? `<a href="/a/${encodeURIComponent(kid)}/${aid}" style="color:inherit">${label}</a>` : label}</span><em>${esc(compactNumber(a.score))}</em></div>`; }).join("")}</div>` : "";

  let kvk = "";
  if (matchup?.opponent) {
    const live = score && Number(score.season) === Number(matchup.season) && Number(score.opponent) === Number(matchup.opponent);
    kvk = `<h2>KvK</h2><div class="kvk">シーズン${esc(matchup.season)}の対戦相手：<a href="/k/${encodeURIComponent(matchup.opponent)}">王国 ${esc(matchup.opponent)}</a>（<a href="/kvk/s${encodeURIComponent(matchup.season)}">全組み合わせと戦力差</a>）${live && score.score != null ? `<br>スコア ${esc(compactNumber(score.score))} : ${esc(compactNumber(score.opponent_score))}` : ""}</div>`;
  }

  // R2 に移したランキングを使ったときは、その時点の日付を見出しに出す（今のデータと誤解されないように）。
  const asOfLabel = data.rankingsAsOf ? `<small style="display:block;font-size:12px;font-weight:600;color:var(--ee-subtext)">${esc(formatArchiveDate(data.rankingsAsOf))}時点（この王国は毎月取り直しています）</small>` : "";
  const nearKids = data.nearKids || [], similar = data.similar || [];
  const related = nearKids.length || similar.length ? `<h2>関連する王国</h2><div class="related">${similar.length ? `<div class="rel-group"><small>総戦力が近い王国</small>${similar.map(k => `<a href="/k/${encodeURIComponent(k.kid)}">王国 ${esc(k.kid)}<em>${esc(compactNumber(k.power))}</em></a>`).join("")}</div>` : ""}${nearKids.length ? `<div class="rel-group"><small>近い番号の王国（開設時期が近い）</small>${nearKids.map(k => `<a href="/k/${k}">王国 ${k}</a>`).join("")}</div>` : ""}</div>` : "";
  const body = `<nav class="crumbs"><a href="/">EagleEye</a> › <a href="/kingdoms">王国一覧</a> › 王国 ${esc(kid)}</nav>
<h1>キングショット 王国 ${esc(kid)}${esc(name)}</h1>
<p class="lead">KingShot 王国${esc(kid)}の戦力・成長・ランキング・KvK情報。${growth?.latestAt ? esc(fmtDate(growth.latestAt)) + " 時点。" : ""}データは毎日更新されます。</p>
${stats}
${renderKingdomInsights(kid, data.insights, compactNumber)}
${playerRows ? `<h2>戦力ランキング（上位10人）${asOfLabel}</h2>${playerRows}` : ""}
${allianceRows ? `<h2>同盟ランキング（上位5）${asOfLabel}</h2>${allianceRows}` : ""}
${kvk}
${related}
${data.age != null ? renderKingdomTimelineSection(data.age, { kid, fullHref: "/kingdom-timeline" }) : ""}
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
  // データがまだない王国は検索に載せない（ページは見られる）。
  const noindex = !latest && !players.length;
  return shell({ title, description, canonical, body, jsonLd, origin, noindex });
}

export async function loadPublicKingdomIds(db) {
  const rows = await db.prepare("SELECT kid FROM kingdom_catalog WHERE kid > 0 ORDER BY kid ASC LIMIT 5000").all().catch(() => ({ results: [] }));
  return (rows?.results || []).map(r => Number(r.kid)).filter(Number.isInteger);
}

// 王国一覧の上に出す「王国ランキング」と「数字の見方」（2026-11-15・AdSense の品質対応）。数字は全王国の一覧（キャッシュ）から。
function kingdomBoard(title, list, kind) {
  if (list.length < 3) return "";
  const rows = list.map((r, i) => {
    const main = kind === "power" ? compactNumber(r.power) : `${r.gain < 0 ? "" : "+"}${compactNumber(r.gain)}`;
    const sub = [r.age != null ? `開設${r.age}日` : "", kind === "power" ? (r.gain != null ? `7日 ${r.gain < 0 ? "" : "+"}${compactNumber(r.gain)}` : "") : `総戦力 ${compactNumber(r.power)}`].filter(Boolean).join("・");
    return `<a class="lb-row" href="/k/${encodeURIComponent(r.kid)}"><i>${i + 1}</i><span><b>王国 ${esc(r.kid)}</b><small>${esc(sub)}</small></span><em class="${kind !== "power" && r.gain < 0 ? "down" : kind === "power" ? "" : "up"}">${esc(main)}</em></a>`;
  }).join("");
  return `<section class="lb"><h3>${esc(title)}</h3>${rows}</section>`;
}
function kingdomsIntro(boards) {
  if (!boards || !boards.total) return "";
  const asOf = boards.observedAt ? new Date(boards.observedAt * 1000 + 9 * 3600 * 1000).toISOString().slice(0, 10) + " 時点・" : "";
  const lb = kingdomBoard("総戦力が大きい王国", boards.power, "power") + kingdomBoard("7日間でいちばん伸びた王国", boards.gain, "gain") + kingdomBoard(`開設${YOUNG_KINGDOM_DAYS}日以内で伸びている王国`, boards.young, "gain");
  return `${lb ? `<h2>王国ランキング</h2><p class="lead" style="margin-top:-4px">${esc(asOf)}毎日更新。王国を押すと、その王国の分析が見られます。</p><div class="lbs">${lb}</div>` : ""}
<h2>数字の見方</h2><dl class="howto">
<dt>総戦力</dt><dd>王国の全領主の戦力（ゲーム内の総力）の合計です。総力は兵士の数・兵士の段階・建物・研究などを足した点数なので、<b>強さとは比例しません</b>。総力が近くても、英雄・装備・兵種の組み合わせで戦闘の強さは大きく変わります。強さの目安には、<a href="/kvk/matchups">KvK の組み合わせ</a>で使っている秘境の試練の記録のほうが近いです。</dd>
<dt>7日間の伸び</dt><dd>1週間前と比べて増えた総戦力です。減っているときはマイナスになります。</dd>
<dt>開設日数</dt><dd>王国ができてからの日数です。新しい英雄や黄金が解放される目安になります（<a href="/kingdom-timeline">王国タイムライン</a>）。</dd>
<dt>開設時期が近い王国</dt><dd>開設日数が前後30日以内の王国です。王国ページでは、同じくらいの時期に始まった王国の中で何位かを出しています。</dd>
</dl>`;
}

export function renderPublicKingdomsIndex(kids, { origin = "", stats = null } = {}) {
  const groups = new Map();
  for (const kid of kids) {
    const start = Math.floor((kid - 1) / 100) * 100 + 1;
    if (!groups.has(start)) groups.set(start, []);
    groups.get(start).push(kid);
  }
  const sections = [...groups.entries()].map(([start, list]) => `<section class="range"><h2>王国 ${start}〜${start + 99}</h2><div class="grid">${list.map(k => `<a href="/k/${k}">${k}</a>`).join("")}</div></section>`).join("");
  const body = `<nav class="crumbs"><a href="/">EagleEye</a> › 王国一覧</nav>
<h1>キングショット 王国一覧</h1>
<p class="lead">KingShotの全${kids.length.toLocaleString("ja-JP")}王国の総戦力・7日間の伸び・開設日数を毎日集めています。王国番号を押すと、その王国の分析（全王国の中の順位、開設時期が近い王国との比較、上位10人など）が見られます。</p>
<form class="search" action="/kingdoms" method="get" onsubmit="var v=this.kid.value.trim();if(/^\\d+$/.test(v)){location.href='/k/'+v;return false}"><input name="kid" inputmode="numeric" placeholder="王国番号（例：1524）"><button type="submit">表示</button></form>
${kingdomsIntro(stats ? kingdomLeaderboards(stats, 10) : null)}
${sections ? `<h2>王国番号から探す</h2>${sections}` : '<div class="empty">王国データを読み込めませんでした。</div>'}
<p class="note">データ提供：MightPulse。KingShotの公式サイトではありません。</p>`;
  return shell({ title: "キングショット 王国一覧・戦力ランキング | EagleEye", description: `キングショット（KingShot）の全${kids.length}王国の戦力・成長・ランキング・KvK対戦相手を毎日更新。王国番号から検索できます。`, canonical: origin + "/kingdoms", body, origin, jsonLd: origin ? { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "EagleEye", item: origin + "/" }, { "@type": "ListItem", position: 2, name: "王国一覧", item: origin + "/kingdoms" }] } : null });
}

// ログインしないと中身が出ないページは、すべてのクローラーに来ないよう指定する。
// （ClaudeBot が /player・/alliance などのログイン画面を1日30万回以上読んでいた。公開ページ /k/・/kingdoms・/kvk/s… などは今まで通り）
export const ROBOTS_LOGIN_ONLY_PATHS = Object.freeze([
  "/player", "/alliance", "/kingdom?", "/kingdom/", "/kingdom-catalog", "/kingdom-watchlist", "/kvk?", "/kvk$",
  "/watchlist", "/news", "/settings", "/milestones", "/invite", "/login", "/status-json-comparator", "/social/", "/swordland"
]);

export function renderRobotsTxt(origin, { preview = false } = {}) {
  // Preview deployments must never be indexed.
  if (preview) return "User-agent: *\nDisallow: /\n";
  return `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\nDisallow: /owner\nDisallow: /my-player\nDisallow: /account\nDisallow: /kingdom/changes\n${ROBOTS_LOGIN_ONLY_PATHS.map(p => "Disallow: " + p + "\n").join("")}\nSitemap: ${origin}/sitemap.xml\n`;
}

// ads.txt for Google AdSense. ADSENSE_PUBLISHER_ID (pub-…) is set after approval;
// until then /ads.txt is a 404 so no unauthorised seller line is ever published.
export function renderAdsTxt(publisherId) {
  const id = String(publisherId || "").trim().replace(/^ca-/, "");
  if (!/^pub-\d{10,20}$/.test(id)) return null;
  return `google.com, ${id}, DIRECT, f08c47fec0942fa0\n`;
}

// 更新日（lastmod）は本当に毎日変わるページ（王国・KvK・同盟・ホーム・王国一覧）にだけ付ける。
// 英雄・ツール・タイムラインなどデプロイの時しか変わらないページには付けない
// （全部「今日」にすると、検索エンジンが更新日を信用しなくなる）。changefreq は Google が使わないので出さない。
export function renderSitemapXml(origin, kids, today = new Date().toISOString().slice(0, 10), extraPaths = []) {
  const daily = [...extraPaths, "/", "/kingdoms", ...kids.map(k => `/k/${k}`)];
  const fixed = ["/guide", "/hero-catalog", "/tools/hero-shards", "/tools/gold", "/tools/gold-tech", "/about", "/kingdom-timeline", ...heroPagePaths()];
  const urls = [...daily.map(p => `<url><loc>${esc(origin + p)}</loc><lastmod>${today}</lastmod></url>`), ...fixed.map(p => `<url><loc>${esc(origin + p)}</loc></url>`)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

export { KINGDOM_GROWTH_FIELDS };
