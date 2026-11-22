// データレポートの英語版（/en/reports・/en/reports/〇〇）。2026-11-20
// 数字は日本語版（reports.js）と同じ定数を使う。文は英語で書いたもの（辞書で切れ切れに訳さない）。
// 日本語版の文を直したら、ここも同じように直す。
import { shell } from "./public-pages.js";
import { stageLabelFromValue } from "./kvk-mystic.js";
import { REPORTS, REPORTS_CSS, REPORT_DATE, MYSTIC_STATS, COHORT, COHORT_EXAMPLES, KVK_S23, GROWTH_BUCKETS } from "./reports.js";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const st = v => stageLabelFromValue(Math.round(v)) || "—";
const pct = (a, b) => Math.round(a / b * 1000) / 10 + "%";
const nf = n => Number(n).toLocaleString("en-US");
// 秘境の試練の種類：MightPulse のキーの英語名
const TRIAL_EN = { coliseum: "Coliseum", forest_of_life: "Forest of Life", crystal_cave: "Crystal Cave", knowledge_nexus: "Knowledge Nexus", molten_fort: "Molten Fort", radiant_spire: "Radiant Spire" };
const trial = s => TRIAL_EN[s.key] || s.key;
const ageLabel = label => String(label).replace(/^(\d+)〜(\d+)日$/, "$1–$2 days").replace(/^(\d+)日〜$/, "$1+ days");
const bar = (label, value, max, text) => `<div class="rbar"><span>${esc(label)}</span><i style="width:${Math.max(2, Math.round(value / max * 100))}%"></i><b>${esc(text)}</b></div>`;
const kLink = kid => `<a href="/k/${kid}">Kingdom ${kid}</a>`;

const SOURCE_NOTE = `<p class="rnote">Data: public in-game data EagleEye collected from MightPulse (kingdom totals as of ${REPORT_DATE}; Mystic Trial records collected Nov 3–7 for KvK Season 23 matchups, plus records collected on Nov 16). EagleEye is not an official Kingshot site. How the numbers are read is EagleEye's view, not a statement about how the game works.</p>`;

function body1() {
  const rows = MYSTIC_STATS.map(s => `<tr><th>${esc(trial(s))}</th><td>${esc(st(s.p50))}</td><td>${esc(st(s.p90))}</td><td>${esc(st(s.p99))}</td><td><b>${esc(st(s.max))}</b></td><td>${nf(s.n)}</td></tr>`).join("");
  const rs = MYSTIC_STATS.find(s => s.key === "radiant_spire");
  return `<p>Mystic Trial is PvE where you progress through six kinds of stages: Coliseum, Forest of Life, Crystal Cave, Knowledge Nexus, Molten Fort and Radiant Spire. EagleEye collects the records of each kingdom's top 10 players. This article looks at how far <b>each kingdom's best record</b> has got, trial by trial. Records are written as "chapter-stage" (a chapter has 10 stages).</p>
<h2>Distribution by trial (each kingdom's best record)</h2>
<div class="rtable"><table><thead><tr><th>Trial</th><th>Median kingdom</th><th>Top 10%</th><th>Top 1%</th><th>Furthest</th><th>Kingdoms</th></tr></thead><tbody>${rows}</tbody></table></div>
<p>"Median kingdom" is the best record of the kingdom exactly in the middle when sorted by record. For Radiant Spire, for example, half of all kingdoms have a best record beyond ${esc(st(rs.p50))}, and the top 10% of kingdoms are past ${esc(st(rs.p90))}. The furthest is ${esc(st(rs.max))}.</p>
<h2>Each trial progresses differently</h2>
<p>In Coliseum and Radiant Spire, even the median kingdom is past chapter 60. Forest of Life and Knowledge Nexus are in the 20s and 30s. Because some trials are easier to progress than others, <b>numbers can't be compared across trials</b>. When comparing kingdoms, compare the same trial.</p>
<h2>Differences by kingdom age (average best record)</h2>
${MYSTIC_STATS.map(s => bar(trial(s) + " (≤180 days)", s.le180, s.max, st(s.le180)) + bar(trial(s) + " (181–365 days)", s.d181, s.max, st(s.d181)) + bar(trial(s) + " (366+ days)", s.gt365, s.max, st(s.gt365))).join("")}
<p>In every trial, older kingdoms have further best records. Between kingdoms up to 180 days old and those 366+ days old, the Radiant Spire average differs from ${esc(st(rs.le180))} to ${esc(st(rs.gt365))}. <b>When looking at your kingdom's record, compare it with kingdoms of a similar age.</b> Kingdom pages show the rank among all kingdoms for each trial.</p>
<p class="rlinks">Your kingdom's records: pick your kingdom from <a href="/kingdoms">Kingdoms</a> and see the "Mystic Trial (a guide to strength)" section.</p>`;
}

function body2() {
  const ex = COHORT_EXAMPLES.map(e => `<tr><td>${kLink(e.kid)}</td><td>${e.age} days</td><td>${(e.power / 1e9).toFixed(1)}B<small> (#${e.powerRank})</small></td><td>${esc(st(e.v))}<small> (#${e.mysticRank})</small></td></tr>`).join("");
  const rhos = MYSTIC_STATS.map(s => bar(trial(s), s.rho, 1, s.rho.toFixed(2))).join("");
  return `<p>Kingshot's total power is the sum of points from troops (count and tier), buildings, research, gear, heroes and more. It also grows a lot from troop counts and building upgrades, so <b>total power isn't directly proportional to strength</b>. How closely, then, does a kingdom's total power relate to its Mystic Trial records, which are said to show differences in how far players have built up? We checked with EagleEye's data.</p>
<h2>Across all kingdoms: there is a relationship</h2>
<p>For every kingdom, we calculated how the rank by total power relates to the rank by best Mystic Trial record (the rank correlation coefficient; the closer to 1, the more the ranks line up).</p>
${rhos}
<p>Every trial is between 0.66 and 0.74, so <b>kingdoms with more total power clearly tend to be further in Mystic Trial</b>. But time plays a big part here: kingdoms that have been open longer have both more power and further records.</p>
<h2>Same kingdom age: a relationship, with many exceptions</h2>
<p>We compared Radiant Spire again using only kingdoms ${COHORT.from}–${COHORT.to} days old (${COHORT.n} kingdoms). The correlation is ${COHORT.rho.toFixed(2)}, so there is still a relationship. On the other hand, of the ${COHORT.mysticTop10} kingdoms whose best Radiant Spire record is in the top 10%, <b>${COHORT.mysticTop10PowerBelowMedian} are in the bottom half by total power</b>. Among kingdoms of the same age, some don't stand out in power yet have top-ranked best records.</p>
<div class="rtable"><table><thead><tr><th>Kingdom</th><th>Age</th><th>Total power (of ${COHORT.n})</th><th>Best Radiant Spire (of ${COHORT.n})</th></tr></thead><tbody>${ex}</tbody></table></div>
<p>The top three kingdoms rank in the 400s by power, yet their best Radiant Spire record is around #50. The bottom three are high in power, yet their record ranks around #300.</p>
<h2>Reading these numbers</h2>
<ul><li>A kingdom's total power is the <b>total for the whole kingdom</b>, while the best Mystic Trial record is <b>one top player's</b> record. They measure things of a different size.</li>
<li>KvK and Swordland Showdown are said to depend largely on the strength of the top players who lead rallies. That's why EagleEye weighs the best Mystic Trial record more than total power when comparing kingdoms.</li>
<li>Both numbers are guides. They don't predict results.</li></ul>`;
}

function body3() {
  const k = KVK_S23;
  return `<p>For all ${nf(k.pairs)} matchups in KvK Season ${k.season}, we compared both kingdoms' best records in the six Mystic Trials (the same method as EagleEye's <a href="/kvk/s${k.season}">KvK matchups</a>). We also looked at how this relates to which kingdom has more total power.</p>
<h2>Breakdown of matchups</h2>
${bar("One side ahead in all 6 (6-0)", k.sweep, k.pairs, nf(k.sweep) + " pairs")}${bar("Even at 3-3", k.even, k.pairs, nf(k.even) + " pairs")}${bar("Within 1 trial (incl. 3-3)", k.close, k.pairs, nf(k.close) + " pairs")}
<p>Of all ${nf(k.pairs)} matchups, ${nf(k.sweep)} (${pct(k.sweep, k.pairs)}) had one kingdom ahead in all six trials. ${nf(k.even)} (${pct(k.even, k.pairs)}) were even at 3-3.</p>
<h2>Is the kingdom with more power also ahead in Mystic Trial?</h2>
<p>In the ${nf(k.decided)} matchups that weren't 3-3, we counted whether the kingdom with more total power was also ahead in Mystic Trial.</p>
${bar("More power, also ahead in Mystic Trial", k.powerLeaderAlsoMystic, k.decided, `${nf(k.powerLeaderAlsoMystic)} pairs (${pct(k.powerLeaderAlsoMystic, k.decided)})`)}${bar("Less power, ahead in Mystic Trial", k.powerLeaderBehind, k.decided, `${nf(k.powerLeaderBehind)} pairs (${pct(k.powerLeaderBehind, k.decided)})`)}
<p><b>The kingdom with more power was also ahead in Mystic Trial in less than half of matchups</b> (${pct(k.powerLeaderAlsoMystic, k.decided)}). In ${nf(k.powerLeaderBehind20)} matchups, the kingdom with less power was ahead in Mystic Trial despite a power gap of 20% or more.</p>
<p>The two kingdoms in a matchup differ in power by ${k.avgPowerRatio}× on average, much closer than kingdoms in general. Across all kingdoms (<a href="/reports/power-vs-mystic-2026-11">total power vs Mystic Trial</a>) power and records were related, but <b>between kingdoms with similar power, which has more power tells you almost nothing about the gap in top players' records</b>.</p>
<h2>Reading these numbers</h2>
<ul><li>Total power is as of ${REPORT_DATE}; Mystic Trial records are from around Nov 3–7. These are not numbers from during KvK.</li>
<li>KvK is decided by prep phase points and the fight for the castle in the battle phase, not by Mystic Trial records. This article doesn't predict results; it offers a guide for comparison.</li></ul>
<p class="rlinks"><a href="/kvk/s${k.season}">See all KvK Season ${k.season} matchups</a></p>`;
}

function body4() {
  const maxPct = Math.max(...GROWTH_BUCKETS.map(b => b.gainPct));
  const rows = GROWTH_BUCKETS.map(b => `<tr><th>${esc(ageLabel(b.label))}</th><td>${nf(b.n)}</td><td>${b.power.toFixed(1)}B</td><td>${b.gain.toFixed(2)}B</td><td><b>${b.gainPct.toFixed(1)}%</b></td><td>${b.max.toFixed(1)}B</td></tr>`).join("");
  return `<p>How fast does a new kingdom's total power grow after it opens? We split all 2,621 kingdoms by age and compared their 7-day power growth.</p>
<h2>7-day power growth by kingdom age (average)</h2>
${GROWTH_BUCKETS.map(b => bar(ageLabel(b.label), b.gainPct, maxPct, b.gainPct.toFixed(1) + "%")).join("")}
<div class="rtable"><table><thead><tr><th>Kingdom age</th><th>Kingdoms</th><th>Total power (avg)</th><th>7-day growth (avg)</th><th>Growth rate</th><th>Largest growth</th></tr></thead><tbody>${rows}</tbody></table></div>
<h2>What we found</h2>
<ul><li><b>Kingdoms up to 30 days old grow their total power by 46% a week on average.</b> Their total power is still small at this stage (14.6B on average), so similar amounts of growth make a large percentage.</li>
<li>It's 9% at 31–60 days, and from day 61 it <b>levels off at around 5–6%</b>.</li>
<li>The amount gained (B) is larger in older kingdoms (about 5.0B on average at 366+ days). Their total power is bigger, so a similar rate means a larger amount.</li>
<li>Among kingdoms up to 180 days old, growth was highest at 0–30 days (3.39B on average) and 91–120 days (3.35B on average).</li></ul>
<h2>Reading these numbers</h2>
<ul><li>"7-day power growth" is MightPulse's value. None of the 2,621 kingdoms had a negative value, so it appears to be <b>the total gained, with losses not subtracted</b> (total power itself can go down, for example when troops are lost).</li>
<li>Total power isn't directly proportional to strength. A kingdom that grows fast isn't necessarily strong (<a href="/reports/power-vs-mystic-2026-11">total power vs Mystic Trial</a>).</li></ul>
<p class="rlinks">See kingdoms growing this week in the kingdom ranking on <a href="/kingdoms">Kingdoms</a>.</p>`;
}

// 日本語版と同じ slug・同じ順番
export const REPORTS_EN = Object.freeze({
  "mystic-trial-distribution-2026-11": { title: "Mystic Trial across all 2,621 kingdoms: how far have the best records got?", lead: "For each of the six trials, the distribution of each kingdom's best record and how it differs by kingdom age.", findings: ["The median kingdom's best record is 70-1 in Radiant Spire and 66-8 in Coliseum. Forest of Life (26-9) and Knowledge Nexus (29-2) progress more slowly.", "The average best Radiant Spire record is 34-8 for kingdoms up to 180 days old and 84-6 for kingdoms 366+ days old. Compare kingdoms of a similar age."], body: body1 },
  "power-vs-mystic-2026-11": { title: "Is total power proportional to Mystic Trial? A comparison of kingdoms of the same age", lead: "How a kingdom's total power relates to its best Mystic Trial record, across all kingdoms and among kingdoms of the same age.", findings: ["Rank correlation is 0.66–0.74 across all kingdoms, and 0.69 among kingdoms 500–600 days old. Related, but not proportional.", "Of the 52 kingdoms with a top-10% best Radiant Spire record, 7 are in the bottom half by power. Some rank in the 400s by power yet around #50 by record."], body: body2 },
  "kvk-s23-matchups": { title: "KvK Season 23 matchup analysis: is the kingdom with more power also ahead in Mystic Trial?", lead: "We compared the six Mystic Trials in all 1,219 matchups and counted how this relates to total power.", findings: ["The kingdom with more power was also ahead in Mystic Trial in 44.8% of matchups (481 of 1,073). Less than half.", "319 matchups (26.2%) had one side ahead in all six trials; 146 (12%) were even at 3-3."], body: body3 },
  "young-kingdom-growth-2026-11": { title: "How fast do new kingdoms grow? Power growth by kingdom age", lead: "We split all 2,621 kingdoms by age and compared their 7-day power growth.", findings: ["Kingdoms up to 30 days old grow their power by 46% a week on average. It's 9% at 31–60 days and settles at around 5–6% from day 61.", "Older kingdoms gain larger amounts (about 5.0B on average at 366+ days)."], body: body4 }
});

export function renderReportsIndexEn({ origin = "" } = {}) {
  const list = REPORTS.map(r => { const e = REPORTS_EN[r.slug]; return `<a class="rcard" href="/reports/${r.slug}"><b>${esc(e.title)}</b><small>${esc(e.lead)}</small><ul class="rfind">${e.findings.map(f => `<li>${esc(f)}</li>`).join("")}</ul><em>Read the report →</em></a>`; }).join("");
  const body = `${REPORTS_CSS}<nav class="crumbs"><a href="/">EagleEye</a> › Data reports</nav>
<h1>Data reports</h1><p class="lead">How events work is covered in <a href="/guides">Event basics</a>. Here we write up what the data EagleEye collects from every Kingshot kingdom shows. These aren't strategy guides; they're articles about numbers and how to read them. The main findings of each report are listed below.</p>
<div class="rlist">${list}</div>${SOURCE_NOTE}`;
  const jsonLd = origin ? { "@context": "https://schema.org", "@type": "CollectionPage", name: "Kingshot data reports", url: origin + "/en/reports", inLanguage: "en",
    mainEntity: { "@type": "ItemList", itemListElement: REPORTS.map((x, i) => ({ "@type": "ListItem", position: i + 1, url: origin + "/en/reports/" + x.slug, name: REPORTS_EN[x.slug].title })) } } : null;
  return shell({ title: "Kingshot Data Reports | EagleEye", description: "What the data from every Kingshot kingdom shows: Mystic Trial record distribution, its relationship with total power, KvK matchup analysis, and how new kingdoms grow.", canonical: origin + "/en/reports", body, jsonLd, origin, lang: "en" });
}

export function renderReportEn(slug, { origin = "" } = {}) {
  const e = REPORTS_EN[slug];
  if (!e) return null;
  const others = REPORTS.filter(x => x.slug !== slug).map(x => `<li><a href="/reports/${x.slug}">${esc(REPORTS_EN[x.slug].title)}</a></li>`).join("");
  const body = `${REPORTS_CSS}<nav class="crumbs"><a href="/">EagleEye</a> › <a href="/reports">Data reports</a></nav>
<article><h1>${esc(e.title)}</h1><p class="rmeta">Published ${REPORT_DATE} · EagleEye</p><p class="lead">${esc(e.lead)}</p>
${e.body()}
${SOURCE_NOTE}</article>
<h2>Other reports</h2><ul>${others}</ul>`;
  const jsonLd = { "@context": "https://schema.org", "@type": "Article", headline: e.title, datePublished: REPORT_DATE, dateModified: REPORT_DATE, author: { "@type": "Organization", name: "EagleEye" }, publisher: { "@type": "Organization", name: "EagleEye" }, mainEntityOfPage: origin + "/en/reports/" + slug, inLanguage: "en" };
  return shell({ title: `${e.title} | Kingshot data reports | EagleEye`, description: e.lead, canonical: origin + "/en/reports/" + slug, body, jsonLd, origin, lang: "en" });
}
