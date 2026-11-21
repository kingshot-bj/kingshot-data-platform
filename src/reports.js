// データレポート（/reports）。EagleEye が集めた数字から分かったことをまとめた読み物（2026-11-16）。
// ・攻略記事ではない。ゲームのやり方は書かず、数字とその読み方だけを書く。勝敗の予想はしない。
// ・総力は強さと比例しない（docs/KINGSHOT_GAME_KNOWLEDGE.md）。ただし数字が示す関係は正直に書く（言い過ぎない）。
// ・数字は 2026-11-16 に D1 の集計（kingdom_stats_current・kvk_mystic_summary・kingdom_mystic_current・kvk_matchups）から出したもの。
//   ページを開くたびには計算しない（静的）。更新するときは数字と日付をまとめて直す。
import { shell } from "./public-pages.js";
import { stageLabelFromValue } from "./kvk-mystic.js";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const st = v => stageLabelFromValue(Math.round(v)) || "—";
const pct = (a, b) => Math.round(a / b * 1000) / 10 + "%";
const nf = n => Number(n).toLocaleString("ja-JP");

export const REPORT_DATE = "2026-11-16";
const SOURCE_NOTE = `<p class="rnote">データ：EagleEye が MightPulse から集めたゲーム内の公開データ（王国の集計は ${REPORT_DATE} 時点、秘境の試練は KvK シーズン23 の組み合わせ用に 11/3〜11/7 に集めた記録と、11/16 に追加で集めた記録）。EagleEye はキングショットの公式サイトではありません。数字の読み方は EagleEye の見方で、ゲームの仕様を断定するものではありません。</p>`;

// ---- 集計した数字（2026-11-16）----
export const MYSTIC_STATS = Object.freeze([
  { key: "coliseum", label: "闘技場", n: 2582, max: 1008, p99: 950, p90: 859, p50: 658, le180: 380, d181: 582, gt365: 762, rho: 0.717 },
  { key: "forest_of_life", label: "生命の森", n: 2506, max: 478, p99: 460, p90: 405, p50: 259, le180: 117.2, d181: 212.2, gt365: 341.2, rho: 0.661 },
  { key: "crystal_cave", label: "水晶鉱山", n: 2582, max: 512, p99: 507, p90: 437, p50: 348, le180: 230.9, d181: 335.8, gt365: 382.4, rho: 0.735 },
  { key: "knowledge_nexus", label: "知識の枢軸", n: 2582, max: 518, p99: 481, p90: 370, p50: 282, le180: 150.3, d181: 240.2, gt365: 325.2, rho: 0.696 },
  { key: "molten_fort", label: "溶岩要塞", n: 2582, max: 527, p99: 525, p90: 484, p50: 409, le180: 325.7, d181: 403.5, gt365: 439, rho: 0.716 },
  { key: "radiant_spire", label: "輝光の塔", n: 2582, max: 1190, p99: 1109, p90: 949, p50: 691, le180: 338.1, d181: 588.9, gt365: 836.3, rho: 0.709 }
]);
// 開設500〜600日の王国（520王国）だけで比べた輝光の塔
export const COHORT = Object.freeze({ from: 500, to: 600, n: 520, rho: 0.693, mysticTop10: 52, mysticTop10PowerBelowMedian: 7, powerTop10: 52, powerTop10MysticBelowMedian: 3 });
export const COHORT_EXAMPLES = Object.freeze([
  { kid: 66, age: 595, power: 65.2e9, powerRank: 414, v: 1063, mysticRank: 47 },
  { kid: 67, age: 594, power: 48.6e9, powerRank: 483, v: 1060, mysticRank: 50 },
  { kid: 120, age: 579, power: 52.5e9, powerRank: 462, v: 1005, mysticRank: 102 },
  { kid: 217, age: 557, power: 237.5e9, powerRank: 24, v: 882, mysticRank: 277 },
  { kid: 181, age: 565, power: 227.6e9, powerRank: 33, v: 878, mysticRank: 288 },
  { kid: 444, age: 520, power: 171.4e9, powerRank: 114, v: 822, mysticRank: 362 }
]);
export const KVK_S23 = Object.freeze({ season: 23, pairs: 1219, even: 146, close: 194, sweep: 319, decided: 1073, powerLeaderAlsoMystic: 481, powerLeaderBehind: 592, powerLeaderBehind20: 360, avgPowerRatio: 1.38 });
export const GROWTH_BUCKETS = Object.freeze([
  { label: "0〜30日", n: 62, power: 14.6, gain: 3.39, gainPct: 46.3, max: 6.5 },
  { label: "31〜60日", n: 62, power: 31.1, gain: 2.55, gainPct: 9.1, max: 4.2 },
  { label: "61〜90日", n: 70, power: 53.5, gain: 2.99, gainPct: 6.0, max: 4.2 },
  { label: "91〜120日", n: 89, power: 55.8, gain: 3.35, gainPct: 6.4, max: 6.1 },
  { label: "121〜180日", n: 257, power: 52.0, gain: 2.45, gainPct: 5.0, max: 4.9 },
  { label: "181〜365日", n: 786, power: 84.0, gain: 3.71, gainPct: 4.8, max: 9.9 },
  { label: "366日〜", n: 1295, power: 112.0, gain: 4.99, gainPct: 4.9, max: 17.3 }
]);

const bar = (label, value, max, text) => `<div class="rbar"><span>${esc(label)}</span><i style="width:${Math.max(2, Math.round(value / max * 100))}%"></i><b>${esc(text)}</b></div>`;
const kLink = kid => `<a href="/k/${kid}">王国${kid}</a>`;

function body1() {
  const rows = MYSTIC_STATS.map(s => `<tr><th>${esc(s.label)}</th><td>${esc(st(s.p50))}</td><td>${esc(st(s.p90))}</td><td>${esc(st(s.p99))}</td><td><b>${esc(st(s.max))}</b></td><td>${nf(s.n)}</td></tr>`).join("");
  const rs = MYSTIC_STATS.find(s => s.key === "radiant_spire");
  return `<p>秘境の試練は、闘技場・生命の森・水晶鉱山・知識の枢軸・溶岩要塞・輝光の塔の6種類のステージを進めていく PvE です。EagleEye は、各王国の上位10人の記録を集めています。この記事では、そのうち<b>各王国の1位の記録</b>が全体でどこまで進んでいるかを、種類ごとにまとめました。記録は「章-ステージ」（1章は10ステージ）で書いています。</p>
<h2>種類ごとの分布（各王国の1位の記録）</h2>
<div class="rtable"><table><thead><tr><th>種類</th><th>真ん中の王国</th><th>上位10%</th><th>上位1%</th><th>いちばん先</th><th>王国数</th></tr></thead><tbody>${rows}</tbody></table></div>
<p>「真ん中の王国」は、記録の順に並べてちょうど真ん中の王国の1位の記録です。たとえば輝光の塔では、半分の王国の1位が ${esc(st(rs.p50))} より先まで進んでいて、上位10%の王国は ${esc(st(rs.p90))} を超えています。いちばん先は ${esc(st(rs.max))} です。</p>
<h2>種類によって進み方が違う</h2>
<p>闘技場と輝光の塔は、真ん中の王国でも60章を超えています。生命の森と知識の枢軸は20〜30章台です。種類によって進みやすさが違うので、<b>種類をまたいで数字の大きさを比べることはできません</b>。王国どうしを比べるときは、同じ種類どうしで比べてください。</p>
<h2>開設日数による違い（各王国の1位の記録の平均）</h2>
${MYSTIC_STATS.map(s => bar(s.label + "（〜180日）", s.le180, s.max, st(s.le180)) + bar(s.label + "（181〜365日）", s.d181, s.max, st(s.d181)) + bar(s.label + "（366日〜）", s.gt365, s.max, st(s.gt365))).join("")}
<p>どの種類でも、開設から時間がたった王国ほど1位の記録は先に進んでいます。開設180日以内の王国と366日以上の王国では、輝光の塔の平均で ${esc(st(rs.le180))} と ${esc(st(rs.gt365))} の差があります。<b>自分の王国の記録を見るときは、開設日数が近い王国と比べる</b>のがおすすめです。王国ページでは、全王国の中での順位を種類ごとに出しています。</p>
<p class="rlinks">自分の王国の記録：<a href="/kingdoms">王国一覧</a>から王国を選ぶと、「秘境の試練（強さの目安）」の欄で見られます。</p>`;
}

function body2() {
  const ex = COHORT_EXAMPLES.map(e => `<tr><td>${kLink(e.kid)}</td><td>${e.age}日</td><td>${(e.power / 1e9).toFixed(1)}B<small>（${e.powerRank}位）</small></td><td>${esc(st(e.v))}<small>（${e.mysticRank}位）</small></td></tr>`).join("");
  const rhos = MYSTIC_STATS.map(s => bar(s.label, s.rho, 1, s.rho.toFixed(2))).join("");
  return `<p>キングショットの「総力」は、兵士の数や段階、建物、研究、装備、英雄などの点数を足した数字です。兵士の数や建物の強化でも大きく増えるので、<b>総力は強さとそのまま比例はしません</b>。では、王国の総力と、育成の差が出やすいと言われる秘境の試練の記録は、どれくらい関係しているのでしょうか。EagleEye のデータで確かめました。</p>
<h2>全王国で見ると：関係はある</h2>
<p>全王国について、総力の順位と、秘境の試練の1位の記録の順位の関係（順位の相関係数。1に近いほど順位がそろう）を計算しました。</p>
${rhos}
<p>どの種類も 0.66〜0.74 で、<b>総力が大きい王国ほど秘境の試練も進んでいる傾向は、はっきりあります</b>。ただしこれには、開設から長い王国ほど総力も記録も大きい、という時間の影響が強く入っています。</p>
<h2>開設時期をそろえても：関係はあるが、例外が多い</h2>
<p>開設${COHORT.from}〜${COHORT.to}日の王国（${COHORT.n}王国）だけで、輝光の塔を比べ直しました。相関係数は ${COHORT.rho.toFixed(2)} で、やはり関係はあります。一方で、輝光の塔の1位の記録が上位10%に入る${COHORT.mysticTop10}王国のうち<b>${COHORT.mysticTop10PowerBelowMedian}王国は、総力が下半分</b>でした。同じ時期の王国の中で、総力では目立たないのに、トップの記録は上位にいる王国があるということです。</p>
<div class="rtable"><table><thead><tr><th>王国</th><th>開設</th><th>総力（${COHORT.n}王国中）</th><th>輝光の塔の1位（${COHORT.n}王国中）</th></tr></thead><tbody>${ex}</tbody></table></div>
<p>上の3王国は総力が400位台なのに、輝光の塔の1位の記録は50位前後です。下の3王国は総力が上位なのに、記録は300位前後です。</p>
<h2>読み方の注意</h2>
<ul><li>王国の総力は<b>王国全体の合計</b>、秘境の試練の1位の記録は<b>その王国のトップ1人</b>の記録です。比べているものの大きさが違います。</li>
<li>KvK や聖剣争奪は、集結を主催するトップ層の強さで決まりやすいと言われます。そのため EagleEye では、王国どうしを比べるときに総力より秘境の試練の1位の記録を重く見ています。</li>
<li>どちらの数字も「目安」です。勝敗を予想するものではありません。</li></ul>`;
}

function body3() {
  const k = KVK_S23;
  return `<p>KvK シーズン${k.season}の全${nf(k.pairs)}組について、組み合わせごとに秘境の試練の6種類の1位の記録を比べました（EagleEye の <a href="/kvk/s${k.season}">KvK 組み合わせ</a>と同じ比べ方です）。あわせて、どちらの王国の総力が大きいかとの関係も見ました。</p>
<h2>組み合わせの内訳</h2>
${bar("6種類すべてで片方が上（6-0）", k.sweep, k.pairs, nf(k.sweep) + "組")}${bar("3-3 の互角", k.even, k.pairs, nf(k.even) + "組")}${bar("差が1種類以内（3-3 を含む）", k.close, k.pairs, nf(k.close) + "組")}
<p>全${nf(k.pairs)}組のうち、6種類すべてで片方の王国が上回っている組が${nf(k.sweep)}組（${pct(k.sweep, k.pairs)}）ありました。3-3 の互角は${nf(k.even)}組（${pct(k.even, k.pairs)}）です。</p>
<h2>総力が大きい王国は、秘境の試練でも上か</h2>
<p>3-3 以外の${nf(k.decided)}組で、総力が大きい方の王国が、秘境の試練でも上回っていたかを数えました。</p>
${bar("総力が大きい方が、秘境の試練でも上", k.powerLeaderAlsoMystic, k.decided, `${nf(k.powerLeaderAlsoMystic)}組（${pct(k.powerLeaderAlsoMystic, k.decided)}）`)}${bar("総力が小さい方が、秘境の試練で上", k.powerLeaderBehind, k.decided, `${nf(k.powerLeaderBehind)}組（${pct(k.powerLeaderBehind, k.decided)}）`)}
<p><b>総力が大きい方が秘境の試練でも上だった組は、半分に届きませんでした</b>（${pct(k.powerLeaderAlsoMystic, k.decided)}）。総力に2割以上の差があるのに、総力が小さい方が秘境の試練で上回っていた組も${nf(k.powerLeaderBehind20)}組ありました。</p>
<p>組み合わせの2王国は、総力の差が平均${k.avgPowerRatio}倍と、全王国の中での差よりずっと近い王国どうしです。全王国で見たとき（<a href="/reports/power-vs-mystic-2026-11">総力と秘境の試練の関係</a>）は総力と記録に関係がありましたが、<b>総力が近い王国どうしでは、総力の大小からトップ層の記録の差はほとんど分からない</b>結果になりました。</p>
<h2>読み方の注意</h2>
<ul><li>総力は ${REPORT_DATE} 時点、秘境の試練は 11/3〜11/7 ごろの記録です。KvK の最中の数字ではありません。</li>
<li>KvK の勝敗は、準備フェーズのポイントや戦闘フェーズの王城の取り合いで決まり、秘境の試練の記録で決まるわけではありません。この記事は勝敗を予想するものではなく、比べ方の目安を示すものです。</li></ul>
<p class="rlinks"><a href="/kvk/s${k.season}">KvK シーズン${k.season}の全組み合わせを見る</a></p>`;
}

function body4() {
  const maxPct = Math.max(...GROWTH_BUCKETS.map(b => b.gainPct));
  const rows = GROWTH_BUCKETS.map(b => `<tr><th>${esc(b.label)}</th><td>${nf(b.n)}</td><td>${b.power.toFixed(1)}B</td><td>${b.gain.toFixed(2)}B</td><td><b>${b.gainPct.toFixed(1)}%</b></td><td>${b.max.toFixed(1)}B</td></tr>`).join("");
  return `<p>新しい王国は、開設からどれくらいのペースで総力が増えていくのでしょうか。集計時点（2026年11月）の2,621王国を開設日数で分けて、7日間の総力の増え方を比べました。</p>
<h2>開設日数ごとの7日間の総力増加（平均）</h2>
${GROWTH_BUCKETS.map(b => bar(b.label, b.gainPct, maxPct, b.gainPct.toFixed(1) + "%")).join("")}
<div class="rtable"><table><thead><tr><th>開設日数</th><th>王国数</th><th>総力（平均）</th><th>7日間の増加（平均）</th><th>増加の割合</th><th>増加が一番多い王国</th></tr></thead><tbody>${rows}</tbody></table></div>
<h2>分かったこと</h2>
<ul><li><b>開設30日以内の王国は、1週間で総力が平均46%増えています</b>。この時期は総力そのものがまだ小さい（平均14.6B）ので、同じくらいの量が増えても割合は大きくなります。</li>
<li>31〜60日で9%、61日以降は<b>5〜6%前後でほぼ一定</b>になります。</li>
<li>増える量（B）は、古い王国ほど大きくなります（366日以上で平均約5.0B）。総力そのものが大きいので、割合は同じくらいでも量は増えます。</li>
<li>開設180日以内では、増加の量は0〜30日（平均3.39B）と91〜120日（平均3.35B）が多めでした。</li></ul>
<h2>読み方の注意</h2>
<ul><li>「7日間の総力増加」は MightPulse の値です。集計した2,621王国にマイナスの値は1つもなかったので、<b>増えた分の合計で、減った分は差し引かれていない</b>と考えられます（総力そのものは、兵士を失うなどで減ることがあります）。</li>
<li>総力は強さとそのまま比例しません。増え方が速い王国が強いとは限りません（<a href="/reports/power-vs-mystic-2026-11">総力と秘境の試練の関係</a>）。</li></ul>
<p class="rlinks">今週伸びている王国は <a href="/kingdoms">王国一覧</a> の「王国ランキング」で見られます。</p>`;
}

export const REPORTS = Object.freeze([
  { slug: "mystic-trial-distribution-2026-11", title: "集計時点の2,621王国の秘境の試練：1位の記録はどこまで進んでいる？", lead: "6種類ごとに、各王国の1位の記録の分布と、開設日数による違いをまとめました。", findings: ["真ん中の王国の1位の記録は、輝光の塔で70-1、闘技場で66-8。生命の森（26-9）・知識の枢軸（29-2）は進みが遅い。", "開設180日以内と366日以上の王国では、輝光の塔の1位の平均が34-8と84-6で大きく違う。比べるなら開設日数が近い王国どうしで。"], body: body1 },
  { slug: "power-vs-mystic-2026-11", title: "総力と秘境の試練は比例する？ 同じ時期の王国で比べてみた", lead: "王国の総力と、秘境の試練の1位の記録の関係を、全王国と開設時期をそろえた王国で確かめました。", findings: ["順位の相関は全王国で0.66〜0.74、開設500〜600日の王国だけでも0.69。関係はあるが比例ではない。", "輝光の塔の1位の記録が上位10%の52王国のうち、7王国は総力が下半分。総力400位台で記録は50位前後の王国もある。"], body: body2 },
  { slug: "kvk-s23-matchups", title: "KvK シーズン23の組み合わせ分析：総力が大きい王国は秘境の試練でも上か", lead: "全1,219組で秘境の試練の6種類を比べ、総力の大小との関係を数えました。", findings: ["総力が大きい方が秘境の試練でも上だった組は44.8%（1,073組中481組）。半分に届かない。", "6種類すべてで片方が上の組が319組（26.2%）、3-3の互角は146組（12%）。"], body: body3 },
  { slug: "young-kingdom-growth-2026-11", title: "新しい王国はどれくらい伸びる？ 開設日数ごとの総力の増え方", lead: "集計時点の2,621王国を開設日数で分けて、7日間の総力の増え方を比べました。", findings: ["開設30日以内の王国は、1週間で総力が平均46%増える。31〜60日で9%、61日以降は5〜6%前後で落ち着く。", "増える量は古い王国ほど大きい（366日以上で平均約5.0B）。"], body: body4 }
]);

export const REPORTS_CSS = `<style>.rmeta{font-size:12px;color:var(--ee-subtext)}.rbar{display:grid;grid-template-columns:minmax(0,9.5em) minmax(0,1fr) auto;gap:8px;align-items:center;font-size:12px;margin:5px 0}.rbar span{color:var(--ee-subtext);overflow-wrap:anywhere}.rbar i{display:block;height:10px;border-radius:5px;background:var(--ee-cyan)}.rbar b{font-size:12px;white-space:nowrap}
.rtable{overflow-x:auto;margin:8px 0}.rtable table{width:100%;border-collapse:collapse;font-size:13px}.rtable th,.rtable td{padding:7px 6px;border-bottom:1px solid var(--ee-border-soft);text-align:left;white-space:nowrap}.rtable thead th{font-size:11px;color:var(--ee-subtext)}.rtable small{color:var(--ee-subtext);font-size:11px;margin-left:2px}
article p,article li{font-size:14px;line-height:1.85}article ul{padding-left:20px}.rnote{margin-top:22px;font-size:11px;color:var(--ee-subtext);line-height:1.7}.rlinks{font-size:13px}.rlist{display:grid;gap:10px}.rcard{display:block;padding:14px;border:1px solid var(--ee-border-soft);border-radius:14px;background:var(--ee-panel);color:var(--ee-text);text-decoration:none}.rcard b{display:block;font-size:15px;line-height:1.5}.rcard small{display:block;margin-top:4px;font-size:12px;color:var(--ee-subtext);line-height:1.6}.rfind{margin:8px 0 0;padding-left:18px;font-size:13px;line-height:1.7}.rcard em{display:block;margin-top:6px;font-style:normal;font-size:12px;color:var(--ee-cyan)}</style>`;

export function renderReportsIndex({ origin = "" } = {}) {
  // 一覧にも主な結論を出す（一覧だけ見ても中身が分かるように・2026-11-16）。
  const list = REPORTS.map(r => `<a class="rcard" href="/reports/${r.slug}"><b>${esc(r.title)}</b><small>${esc(r.lead)}</small>${(r.findings || []).length ? `<ul class="rfind">${r.findings.map(f => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}<em>レポートを読む →</em></a>`).join("");
  const body = `${REPORTS_CSS}<nav class="crumbs"><a href="/">EagleEye</a> › データレポート</nav>
<h1>データレポート</h1><p class="lead">イベントの流れは <a href="/guides">イベントの基本</a> にまとめています。EagleEye が集めたキングショットの全王国のデータから、分かったことをまとめています。攻略記事ではなく、数字とその読み方の記事です。各レポートの主な結論を下に載せています。</p>
<div class="rlist">${list}</div>${SOURCE_NOTE}`;
  // 検索結果向け：レポートの一覧（CollectionPage + ItemList）とパンくず。2026-11-16
  const jsonLd = origin ? { "@context": "https://schema.org", "@graph": [
    { "@type": "CollectionPage", name: "キングショット データレポート", url: origin + "/reports", inLanguage: "ja", isPartOf: { "@type": "WebSite", name: "EagleEye", url: origin + "/" },
      mainEntity: { "@type": "ItemList", itemListElement: REPORTS.map((x, i) => ({ "@type": "ListItem", position: i + 1, url: origin + "/reports/" + x.slug, name: x.title })) } },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "EagleEye", item: origin + "/" }, { "@type": "ListItem", position: 2, name: "データレポート", item: origin + "/reports" }] }
  ] } : null;
  return shell({ title: "キングショット データレポート | EagleEye", description: "キングショット（KingShot）の全王国のデータから分かったこと。秘境の試練の記録の分布、総力との関係、KvKの組み合わせ分析、新しい王国の伸び方。", canonical: origin + "/reports", body, jsonLd, origin });
}

export function renderReport(slug, { origin = "" } = {}) {
  const r = REPORTS.find(x => x.slug === slug);
  if (!r) return null;
  const others = REPORTS.filter(x => x !== r).map(x => `<li><a href="/reports/${x.slug}">${esc(x.title)}</a></li>`).join("");
  const body = `${REPORTS_CSS}<nav class="crumbs"><a href="/">EagleEye</a> › <a href="/reports">データレポート</a></nav>
<article><h1>${esc(r.title)}</h1><p class="rmeta">${REPORT_DATE} 公開・EagleEye</p><p class="lead">${esc(r.lead)}</p>
${r.body()}
${SOURCE_NOTE}</article>
<h2>ほかのレポート</h2><ul>${others}</ul>`;
  const jsonLd = { "@context": "https://schema.org", "@type": "Article", headline: r.title, datePublished: REPORT_DATE, dateModified: REPORT_DATE, author: { "@type": "Organization", name: "EagleEye" }, publisher: { "@type": "Organization", name: "EagleEye" }, mainEntityOfPage: origin + "/reports/" + r.slug, inLanguage: "ja" };
  return shell({ title: `${r.title}｜キングショット データレポート | EagleEye`, description: r.lead, canonical: origin + "/reports/" + r.slug, body, jsonLd, origin });
}

export const REPORT_PATHS_FROM_REPORTS = Object.freeze(["/reports", ...REPORTS.map(r => "/reports/" + r.slug)]);
