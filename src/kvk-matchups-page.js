// Public KvK matchup list with power comparison: /kvk/s{season}.
// Shows kingdom numbers, total power, 7-day gain and kingdom age for both
// sides. KvK scores (Mighty data) are not shown here; they stay behind login
// on /kvk. One indexed D1 query, cached for 5 minutes.

import { ensureKingdomStatsSchema } from "./kingdom-stats.js";
import { webAppJsonLd, breadcrumbJsonLd } from "./seo.js";

function esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
export function compactPower(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e11 ? 0 : 1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + "M";
  return Math.round(n).toLocaleString("ja-JP");
}

// Power gap as % of the stronger side (0 = even). null when unknown.
export function powerGap(a, b) {
  const x = Number(a), y = Number(b);
  if (!(x > 0) || !(y > 0)) return null;
  return Math.round((Math.abs(x - y) / Math.max(x, y)) * 1000) / 10;
}
export function gapLabel(gap) {
  if (gap == null) return "データ待ち";
  if (gap < 5) return "互角";
  if (gap < 15) return "やや差あり";
  if (gap < 35) return "差あり";
  return "大差";
}

export async function currentKvkSeason(db) {
  const row = await db.prepare("SELECT value FROM kvk_state WHERE key = 'matchups'").first().catch(() => null);
  try { const v = JSON.parse(row?.value || "null"); return Number.isFinite(Number(v?.season)) ? Number(v.season) : null; } catch { return null; }
}

export async function loadSeasonMatchups(db, season) {
  await ensureKingdomStatsSchema(db);
  const rows = (await db.prepare(
    "SELECT m.kid, m.opponent, a.power AS p1, a.power_gain_7d AS g1, a.age_days AS d1, a.observed_at AS o1, b.power AS p2, b.power_gain_7d AS g2, b.age_days AS d2, b.observed_at AS o2 " +
    "FROM kvk_matchups m LEFT JOIN kingdom_stats_current a ON a.kid = m.kid LEFT JOIN kingdom_stats_current b ON b.kid = m.opponent WHERE m.season = ? ORDER BY m.kid"
  ).bind(season).all())?.results || [];
  const seen = new Set();
  const pairs = [];
  let observedAt = 0;
  for (const r of rows) {
    const k = Number(r.kid), o = r.opponent == null ? null : Number(r.opponent);
    const key = o == null ? String(k) : [Math.min(k, o), Math.max(k, o)].join("-");
    if (seen.has(key)) continue;
    seen.add(key);
    observedAt = Math.max(observedAt, Number(r.o1) || 0, Number(r.o2) || 0);
    pairs.push({ a: { kid: k, power: r.p1, gain: r.g1, age: r.d1 }, b: o == null ? null : { kid: o, power: r.p2, gain: r.g2, age: r.d2 }, gap: o == null ? null : powerGap(r.p1, r.p2) });
  }
  return { pairs, observedAt };
}

function side(s, stronger) {
  if (!s) return '<div class="sd bye">不戦（対戦相手なし）</div>';
  return `<a class="sd${stronger ? " up" : ""}" href="/k/${s.kid}"><b>王国 ${s.kid}</b><span>戦力 ${esc(compactPower(s.power))}</span><small>7日 ${s.gain > 0 ? "+" : ""}${esc(compactPower(Math.abs(Number(s.gain))))}${s.gain < 0 ? "減" : ""}・開設${s.age != null ? esc(s.age) + "日" : "—"}</small></a>`;
}

export function renderKvkMatchupsPage({ season, pairs = [], observedAt = 0, origin = "" } = {}) {
  const canonical = `${origin}/kvk/s${season}`;
  const sorted = [...pairs].sort((x, y) => (y.gap ?? -1) - (x.gap ?? -1));
  const even = pairs.filter(p => p.gap != null && p.gap < 5).length;
  const asOf = observedAt ? new Date(observedAt * 1000).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" }) : "";
  const cards = sorted.map(p => {
    const aUp = p.b && Number(p.a.power) > Number(p.b.power);
    const bUp = p.b && Number(p.b.power) > Number(p.a.power);
    return `<li class="pair" data-k=" ${p.a.kid} ${p.b?.kid ?? ""} " data-gap="${p.gap ?? -1}" data-kid="${p.a.kid}">${side(p.a, aUp)}<div class="vs"><span>VS</span><em class="g${p.gap == null ? "x" : p.gap < 5 ? "0" : p.gap < 15 ? "1" : p.gap < 35 ? "2" : "3"}">${p.b ? esc(gapLabel(p.gap)) : "—"}${p.gap != null ? `<br>${p.gap}%` : ""}</em></div>${side(p.b, bUp)}</li>`;
  }).join("");
  const title = `キングショット KvK S${season} 組み合わせ一覧と戦力差 | EagleEye`;
  const description = `キングショット（KingShot）KvK シーズン${season}の全${pairs.length}組の組み合わせ。両王国の総戦力・7日間の戦力増加・開設日数を並べ、戦力差の大きい順に表示。王国番号で検索できます。`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(canonical)}">
${origin ? breadcrumbJsonLd(origin, [["EagleEye", "/"], [`KvK S${season} 組み合わせ`, `/kvk/s${season}`]]) : ""}
<style>body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:860px;margin:0 auto;padding:18px 16px calc(96px + env(safe-area-inset-bottom))}.crumbs{font-size:12px;color:var(--ee-subtext)}.crumbs a,.note a{color:var(--ee-cyan);text-decoration:none}h1{margin:6px 0 4px;font-size:24px}.lead{margin:0 0 12px;color:var(--ee-subtext);font-size:13px;line-height:1.6}
.bar{display:grid;grid-template-columns:1fr auto;gap:8px;margin:10px 0}.bar input,.bar select{padding:10px;border:1px solid var(--ee-border);border-radius:11px;font:inherit;font-size:15px;background:var(--ee-panel-deep);color:var(--ee-text);min-width:0}
.facts{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}.facts span{padding:3px 10px;border-radius:999px;border:1px solid var(--ee-border-soft);font-size:12px;color:var(--ee-subtext)}.facts b{color:var(--ee-text)}
.list{list-style:none;margin:0;padding:0;display:grid;gap:8px}.pair{display:grid;grid-template-columns:minmax(0,1fr) 76px minmax(0,1fr);gap:6px;align-items:stretch}.sd{display:grid;gap:2px;padding:10px;border:1px solid var(--ee-border-soft);border-radius:12px;background:var(--ee-panel);color:var(--ee-text);text-decoration:none;min-width:0}.sd b{font-size:15px}.sd span{font-size:13px;font-weight:700}.sd small{font-size:11px;color:var(--ee-subtext)}.sd.up{border-color:color-mix(in srgb,var(--ee-cyan) 55%,transparent)}.sd.up span{color:var(--ee-cyan)}.bye{color:var(--ee-subtext);font-size:13px;place-items:center}
.vs{display:grid;place-items:center;text-align:center;font-size:11px;color:var(--ee-subtext)}.vs span{font-weight:900;letter-spacing:.1em}.vs em{font-style:normal;font-weight:800;line-height:1.3}.g0{color:var(--ee-success,#22c55e)}.g1{color:var(--ee-cyan)}.g2{color:var(--ee-warning,#f59e0b)}.g3{color:var(--ee-danger,#ef4444)}.gx{color:var(--ee-muted)}
.note{font-size:11px;color:var(--ee-subtext);line-height:1.6;margin-top:12px}.empty{padding:20px;text-align:center;color:var(--ee-subtext)}</style></head><body><main class="wrap">
<nav class="crumbs"><a href="/">EagleEye</a> › KvK 組み合わせ</nav>
<h1>KvK シーズン${esc(season)} 組み合わせと戦力差</h1>
<p class="lead">キングショットのKvK（王国対抗戦）シーズン${esc(season)}の全組み合わせです。両王国の総戦力を比べて、差の大きい順に並べています。王国をタップすると、その王国の戦力推移やタイムラインが見られます。</p>
<div class="facts"><span>組み合わせ <b>${pairs.length}</b>組</span><span>互角（差5%未満） <b>${even}</b>組</span>${asOf ? `<span>戦力は${esc(asOf)}時点</span>` : ""}</div>
<div class="bar"><input id="q" inputmode="numeric" placeholder="王国番号で探す（例：1524）" aria-label="王国番号で探す"><select id="sort" aria-label="並び順"><option value="gap">戦力差が大きい順</option><option value="even">互角な順</option><option value="kid">王国番号順</option></select></div>
${pairs.length ? `<ul class="list" id="list">${cards}</ul>` : '<div class="empty">組み合わせはまだ発表されていません。</div>'}
<p class="note">戦力差は総戦力どうしの差を、強いほうの戦力に対する割合で表したものです（勝敗の予想ではありません）。総戦力・7日間の増加・開設日数はMightPulseの王国データ（毎日更新）です。KvKのスコアや日ごとの戦況は、ログインすると<a href="/kvk">KvKページ</a>で見られます。</p>
<script>(function(){var q=document.getElementById("q"),s=document.getElementById("sort"),l=document.getElementById("list");if(!l)return;var items=[].slice.call(l.children);function apply(){var v=q.value.trim(),m=s.value;items.sort(function(a,b){var x=+a.dataset.gap,y=+b.dataset.gap;if(m==="kid")return a.dataset.kid-b.dataset.kid;if(m==="even"){if(x<0)return 1;if(y<0)return -1;return x-y}return y-x});items.forEach(function(it){it.style.display=!v||it.dataset.k.indexOf(" "+v)>=0?"":"none";l.appendChild(it)})}q.addEventListener("input",apply);s.addEventListener("change",apply)})();</script>
</main></body></html>`;
}
