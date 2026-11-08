// Public KvK matchup list: /kvk/s{season}.
// Players judge KvK opponents by 秘境の試練 stages, not total power (troop count
// inflates power while march capacity limits who fights). Each pair shows the
// stage tally by each stage's 1位 ("A 4 / B 2") publicly; the stage-by-stage detail is behind login
// on /kvk. Total power is shown only as a reference. No KvK scores here.

import { ensureKingdomStatsSchema } from "./kingdom-stats.js";
import { loadMysticSummaries, compareMystic } from "./kvk-mystic.js";
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
  const mystic = await loadMysticSummaries(db, season, pairs.flatMap(p => [p.a.kid, p.b?.kid]).filter(v => v != null));
  for (const p of pairs) if (p.b) {
    const a = mystic.get(p.a.kid), b = mystic.get(p.b.kid);
    p.mystic = a && b ? compareMystic(a, b) : null;
  }
  return { pairs, observedAt };
}

export const KVK_INITIAL_ROWS = 60;

// 1組のHTML（サーバーと画面側で同じものを使う。toString で埋め込むので外の変数を使わない）。
// r = [王国A, 戦力A, 開設日数A, 王国B, 戦力B, 開設日数B, 勝ち, 負け, ステージ数]
export function kvkPairHtml(r) {
  var e = function (v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var has = r[8] > 0, aUp = has && r[6] > r[7], bUp = has && r[7] > r[6];
  var side = function (kid, pow, age, up) {
    if (kid == null) return '<div class="sd bye">不戦（対戦相手なし）</div>';
    return '<a class="sd' + (up ? " up" : "") + '" href="/k/' + e(kid) + '"><b>王国 ' + e(kid) + '</b><small>総戦力 ' + e(pow || "—") + '（参考）・開設' + (age != null ? e(age) + "日" : "—") + '</small></a>';
  };
  var mid = r[3] == null ? "—" : has ? '<b class="tally"><span class="' + (aUp ? "w" : "") + '">' + e(r[6]) + '</span>-<span class="' + (bUp ? "w" : "") + '">' + e(r[7]) + '</span></b><small>' + e(r[8]) + 'ステージ中</small><a class="more" href="/kvk?kid=' + e(r[0]) + '" rel="nofollow">2位以降を見る</a>' : '<small>集計中</small>';
  return '<li class="pair">' + side(r[0], r[1], r[2], aUp) + '<div class="vs"><span>VS</span>' + mid + '</div>' + side(r[3], r[4], r[5], bUp) + '</li>';
}

// 検索・並べ替え・もっと見る（全組のデータから必要な分だけ描く）。
export function kvkMatchupsClient(initial, pairHtml) {
  var q = document.getElementById("q"), s = document.getElementById("sort"), l = document.getElementById("list"), btn = document.getElementById("moreBtn"), el = document.getElementById("kvkRows");
  if (!l || !el) return;
  var rows; try { rows = JSON.parse(el.textContent); } catch (x) { return; }
  var shown = initial;
  var lead = function (r) { return r[8] > 0 ? Math.abs(r[6] - r[7]) : -1; };
  function list() {
    var v = q.value.trim(), m = s.value;
    var out = rows.filter(function (r) { return !v || String(r[0]).indexOf(v) === 0 || (r[3] != null && String(r[3]).indexOf(v) === 0); });
    if (m === "kid") out.sort(function (a, b) { return a[0] - b[0]; });
    else if (m === "even") out.sort(function (a, b) { var x = lead(a), y = lead(b); if (x < 0) return 1; if (y < 0) return -1; return x - y; });
    return out;
  }
  function render() {
    var out = list(), v = q.value.trim();
    var n = v ? out.length : Math.min(shown, out.length);
    l.innerHTML = out.slice(0, n).map(pairHtml).join("");
    if (btn) { var rest = out.length - n; btn.hidden = rest <= 0; btn.textContent = "残り" + rest + "組を表示"; }
  }
  q.addEventListener("input", render);
  s.addEventListener("change", function () { shown = initial; render(); });
  if (btn) btn.addEventListener("click", function () { shown += 200; render(); });
}


export function renderKvkMatchupsPage({ season, pairs = [], observedAt = 0, origin = "" } = {}) {
  const canonical = `${origin}/kvk/s${season}`;
  const lead = p => p.mystic ? p.mystic.wins - p.mystic.losses : null;
  const rank = p => { const l = lead(p); return l == null ? -1 : Math.abs(l); };
  const sorted = [...pairs].sort((x, y) => rank(y) - rank(x));
  const ready = pairs.filter(p => p.mystic && p.mystic.stages.length).length;
  const even = pairs.filter(p => p.mystic && p.mystic.stages.length && p.mystic.wins === p.mystic.losses).length;
  const asOf = observedAt ? new Date(observedAt * 1000).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" }) : "";
  // 最初の60組だけHTMLで出し、残りは小さなデータ（1組 約40バイト）で渡して、検索・並べ替え・「もっと見る」のときに画面側で表示する。
  // 以前は全1,200組以上をHTMLで出して約680KBあった（スマホで重い）。
  const rows = sorted.map(p => {
    const m = p.mystic && p.mystic.stages.length ? p.mystic : null;
    const sideRow = s => s ? [s.kid, compactPower(s.power), s.age ?? null] : [null, null, null];
    return [...sideRow(p.a), ...sideRow(p.b), m ? m.wins : null, m ? m.losses : null, m ? m.stages.length : 0];
  });
  const cards = rows.slice(0, KVK_INITIAL_ROWS).map(kvkPairHtml).join("");
  const title = `キングショット KvK S${season} 組み合わせ一覧（秘境の試練で比較） | EagleEye`;
  const description = `キングショット（KingShot）KvK シーズン${season}の全${pairs.length}組の組み合わせ。秘境の試練（輝光の塔・水晶鉱山など6ステージ）の1位の記録で両王国を比べ、何ステージで上回っているかを表示。王国番号で検索できます。`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(canonical)}">
${origin ? breadcrumbJsonLd(origin, [["EagleEye", "/"], [`KvK S${season} 組み合わせ`, `/kvk/s${season}`]]) : ""}
<style>body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:860px;margin:0 auto;padding:18px 16px calc(96px + env(safe-area-inset-bottom))}.crumbs{font-size:12px;color:var(--ee-subtext)}.crumbs a,.note a{color:var(--ee-cyan);text-decoration:none}h1{margin:6px 0 4px;font-size:24px}.lead{margin:0 0 12px;color:var(--ee-subtext);font-size:13px;line-height:1.6}
.bar{display:grid;grid-template-columns:1fr auto;gap:8px;margin:10px 0}.bar input,.bar select{padding:10px;border:1px solid var(--ee-border);border-radius:11px;font:inherit;font-size:15px;background:var(--ee-panel-deep);color:var(--ee-text);min-width:0}
.facts{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}.facts span{padding:3px 10px;border-radius:999px;border:1px solid var(--ee-border-soft);font-size:12px;color:var(--ee-subtext)}.facts b{color:var(--ee-text)}
.list{list-style:none;margin:0;padding:0;display:grid;gap:8px}.pair{display:grid;grid-template-columns:minmax(0,1fr) 76px minmax(0,1fr);gap:6px;align-items:stretch}.sd{display:grid;gap:2px;padding:10px;border:1px solid var(--ee-border-soft);border-radius:12px;background:var(--ee-panel);color:var(--ee-text);text-decoration:none;min-width:0}.sd b{font-size:15px}.sd small{font-size:11px;color:var(--ee-subtext)}.sd.up{border-color:color-mix(in srgb,var(--ee-cyan) 55%,transparent)}.sd.up b{color:var(--ee-cyan)}.bye{color:var(--ee-subtext);font-size:13px;place-items:center}
.vs{display:grid;place-items:center;align-content:center;gap:2px;text-align:center;font-size:11px;color:var(--ee-subtext)}.vs>span{font-weight:900;letter-spacing:.1em}.tally{font-size:20px;color:var(--ee-text)}.tally .w{color:var(--ee-cyan)}.more{font-size:11px;color:var(--ee-cyan);text-decoration:none;border:1px solid var(--ee-border);border-radius:999px;padding:1px 8px}
.note{font-size:11px;color:var(--ee-subtext);line-height:1.6;margin-top:12px}.more-btn{display:block;width:100%;margin:10px 0 0;padding:12px;border:1px solid var(--ee-border);border-radius:12px;background:var(--ee-panel);color:var(--ee-text);font:inherit;font-weight:800}.empty{padding:20px;text-align:center;color:var(--ee-subtext)}</style></head><body><main class="wrap">
<nav class="crumbs"><a href="/">EagleEye</a> › KvK 組み合わせ</nav>
<h1>KvK シーズン${esc(season)} 組み合わせ</h1>
<p class="lead">キングショットのKvK（王国対抗戦）シーズン${esc(season)}の全組み合わせです。総戦力は兵士の数で大きく変わり、実際の戦闘力とは一致しないため、秘境の試練の6ステージ（闘技場・生命の森・水晶鉱山・知識の枢軸・溶岩要塞・輝光の塔）の1位の記録で比べています。KvKは集結を主催するトップ層の強さで決まりやすいためです。真ん中の「4-2」は、それぞれが上回っているステージの数です。</p>
<div class="facts"><span>組み合わせ <b>${pairs.length}</b>組</span><span>比較済み <b>${ready}</b>組</span><span>互角 <b>${even}</b>組</span></div>
<div class="bar"><input id="q" inputmode="numeric" placeholder="王国番号で探す（例：1524）" aria-label="王国番号で探す"><select id="sort" aria-label="並び順"><option value="gap">差がついている順</option><option value="even">互角な順</option><option value="kid">王国番号順</option></select></div>
${pairs.length ? `<ul class="list" id="list">${cards}</ul>${rows.length > KVK_INITIAL_ROWS ? `<button type="button" class="more-btn" id="moreBtn">残り${rows.length - KVK_INITIAL_ROWS}組を表示</button>` : ""}` : '<div class="empty">組み合わせはまだ発表されていません。</div>'}
<p class="note">ステージごとの1位の記録と上位10人の平均、KvKのスコアや日ごとの戦況は、ログインすると<a href="/kvk">KvKページ</a>（各組み合わせの「2位以降を見る」）で見られます。秘境の試練のデータはシーズン中に王国ごとに1回取得し、順次そろっていきます（「集計中」はまだ取得していない組み合わせです）。比較は目安で、勝敗の予想ではありません。総戦力・開設日数はMightPulseの王国データ（毎日更新）${asOf ? "、" + esc(asOf) + "時点" : ""}です。</p>
<script type="application/json" id="kvkRows">${JSON.stringify(rows).replace(/</g, "\\u003c")}</script>
<script>var __name=function(f){return f};(${kvkMatchupsClient.toString()})(${KVK_INITIAL_ROWS},${kvkPairHtml.toString()});</script>
</main></body></html>`;
}
