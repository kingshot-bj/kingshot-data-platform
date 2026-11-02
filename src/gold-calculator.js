// 黄金（英語版の Truegold）必要数計算. Costs per building and TG level come
// from the community table the operator supplied (each column adds up to the
// table's total row; Town Center TG1–5 also match kingshotguide.org).
// TG6–8 additionally need the refined material (英語版 Tempered Truegold).

import { webAppJsonLd, breadcrumbJsonLd } from "./seo.js";

export const GOLD_NAME = "黄金";
// Japanese in-game name of Tempered Truegold (confirmed in game by the operator).
export const REFINED_GOLD_NAME = "精製黄金";
export const MAX_TG = 8;

// [gold, refined] for TG1..TG8. null = no cost recorded (War Academy has no TG1).
export const GOLD_COSTS = Object.freeze({
  town_center: { label: "役場", costs: [[660, 0], [790, 0], [1190, 0], [1400, 0], [1675, 0], [900, 60], [1080, 90], [1080, 120]] },
  infantry: { label: "歩兵", costs: [[295, 0], [355, 0], [535, 0], [630, 0], [750, 0], [405, 25], [486, 37], [486, 54]] },
  cavalry: { label: "騎舎", costs: [[295, 0], [355, 0], [535, 0], [630, 0], [750, 0], [405, 25], [486, 37], [486, 54]] },
  archer: { label: "弓兵", costs: [[295, 0], [355, 0], [535, 0], [630, 0], [750, 0], [405, 25], [486, 37], [486, 54]] },
  embassy: { label: "大使館", costs: [[165, 0], [195, 0], [295, 0], [350, 0], [415, 0], [225, 13], [270, 19], [270, 30]] },
  command_center: { label: "指揮所", costs: [[130, 0], [155, 0], [235, 0], [280, 0], [335, 0], [180, 13], [216, 19], [216, 24]] },
  infirmary: { label: "病院", costs: [[130, 0], [155, 0], [235, 0], [280, 0], [335, 0], [180, 13], [216, 19], [216, 24]] },
  war_academy: { label: "戦争学院", costs: [null, [355, 0], [535, 0], [630, 0], [750, 0], [405, 25], [486, 37], [486, 54]] }
});
export const GOLD_TOTALS = Object.freeze([[1970, 0], [2715, 0], [4095, 0], [4830, 0], [5760, 0], [3105, 199], [3726, 295], [3726, 414]]);

const clampTg = v => Math.max(0, Math.min(MAX_TG, Math.floor(Number(v) || 0)));

// Gold / refined needed to take one building from TG `from` to TG `to`.
export function goldBetween(building, from, to) {
  const row = GOLD_COSTS[building];
  if (!row) return { gold: 0, refined: 0 };
  let gold = 0, refined = 0;
  for (let tg = clampTg(from) + 1; tg <= clampTg(to); tg++) {
    const c = row.costs[tg - 1];
    if (!c) continue;
    gold += c[0]; refined += c[1];
  }
  return { gold, refined };
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const fmt = n => Number(n).toLocaleString("ja-JP");

// Item icons drawn after the in-game ones (orange item tile): 黄金 = pale gold
// rock, 精製黄金 = yellow cube with bronze corner studs, 黄金微粒子 = gold dust
// on a wooden tray. rgb() so the theme normalizer leaves the colours alone.
const GOLD_TILE = '<defs><linearGradient id="gtile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(226,128,30)"/><stop offset="1" stop-color="rgb(252,196,110)"/></linearGradient></defs><rect x=".8" y=".8" width="30.4" height="30.4" rx="7" fill="url(#gtile)" stroke="rgb(240,170,80)" stroke-width="1.2"/>';
const GOLD_ART = {
  gold: '<g stroke="rgb(85,62,35)" stroke-width="1.1" stroke-linejoin="round"><path d="M6.5 20.5 9 17l3 1.5-.5 4.5-3.5 1Z" fill="rgb(214,180,100)"/><path d="M9.5 11 15 7.5l8 1 3 4.5-1 9-6.5 4-8.5-2-2-6Z" fill="rgb(226,192,108)"/><path d="M9.5 11 15 7.5l8 1 3 4.5-8 1Z" fill="rgb(250,232,160)"/><path d="M18 14l8-1-1 9-6.5 4Z" fill="rgb(192,150,68)"/><path d="M21 22.5 24.5 21l2 3-3 2Z" fill="rgb(206,168,88)"/></g><path d="M12.5 10.2l4-2" stroke="rgb(255,250,230)" stroke-width="1.2" stroke-linecap="round"/><path d="M11 15.5l5 .8M12 19.5l4-1" stroke="rgb(170,140,85)" stroke-width=".8"/>',
  refined: '<g stroke="rgb(95,52,20)" stroke-width="1" stroke-linejoin="round"><path d="M8 12h14v13H8Z" fill="rgb(250,212,55)"/><path d="M8 12l4.5-4.5h14L22 12Z" fill="rgb(255,238,140)"/><path d="M22 12l4.5-4.5v13L22 25Z" fill="rgb(222,165,25)"/></g><path d="M10 15h6" stroke="rgb(255,250,215)" stroke-width="1.4" stroke-linecap="round"/><g fill="rgb(120,66,28)" stroke="rgb(70,38,14)" stroke-width=".7" stroke-linejoin="round"><path d="M6 10.5 9.5 11 8.5 14Z"/><path d="M24 10.5 20.5 11.2 22.5 14Z"/><path d="M6 26.5 9.5 25.5 8.5 22.5Z"/><path d="M23.5 26.8 20.8 25 23 22.8Z"/><path d="M11 5.5 14 8l-3 1.5Z"/><path d="M28.5 5.5 25 7.5l3 2Z"/><path d="M28.3 22 25.5 20.5l2.5-2.5Z"/></g>',
  dust: '<path d="M5.5 22Q9 13 13 9.5Q16 7 19 9.5Q23 13 26.5 22Z" fill="rgb(245,212,100)" stroke="rgb(175,130,40)" stroke-width="1" stroke-linejoin="round"/><path d="M12 12.5Q16 9 20 12.5" stroke="rgb(255,238,170)" stroke-width="1.2" fill="none" stroke-linecap="round"/><g fill="rgb(255,240,175)"><circle cx="14" cy="13" r=".9"/><circle cx="17.5" cy="16" r=".8"/><circle cx="12" cy="18" r=".8"/><circle cx="19.5" cy="19.5" r=".8"/><circle cx="15.5" cy="10" r=".7"/></g><g fill="rgb(205,160,60)"><circle cx="16" cy="19" r=".6"/><circle cx="11" cy="20.5" r=".6"/><circle cx="20.5" cy="14.5" r=".6"/></g><path d="M4 21.5h24l-2 5.5H6Z" fill="rgb(78,56,38)" stroke="rgb(40,28,18)" stroke-width="1" stroke-linejoin="round"/><path d="M6 23.5h20" stroke="rgb(120,90,60)" stroke-width=".8"/><rect x="3" y="22.5" width="2.6" height="2" rx=".6" fill="rgb(110,80,52)" stroke="rgb(40,28,18)" stroke-width=".6"/>'
};
export function goldIconSvg(size = 22, kind = "gold") {
  const art = GOLD_ART[kind === true ? "refined" : kind] || GOLD_ART.gold;
  return `<svg class="gold-ico" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">${GOLD_TILE}${art}</svg>`;
}

function goldClient(cfg) {
  var C = cfg.costs, KEY = "eagleeye-gold-plan-v1", keys = Object.keys(C);
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { v = Math.floor(Number(v) || 0); return Math.max(a, Math.min(b, v)); }
  function fmt(n) { return Number(n).toLocaleString("ja-JP"); }
  function between(k, from, to) { var g = 0, r = 0; for (var t = from + 1; t <= to; t++) { var c = C[k].costs[t - 1]; if (!c) continue; g += c[0]; r += c[1]; } return [g, r]; }
  var state = { b: {}, hg: 0, hr: 0 };
  try { var v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && v.b) state = v; } catch (e) {}
  keys.forEach(function (k) { var s = state.b[k] || {}; state.b[k] = { c: clamp(s.c, 0, 8), t: clamp(s.t == null ? 8 : s.t, 0, 8) }; });
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function render() {
    var tg = 0, tr = 0;
    keys.forEach(function (k) {
      var s = state.b[k], row = document.querySelector('[data-b="' + k + '"]'), n = between(k, s.c, Math.max(s.c, s.t));
      row.querySelector('[data-k="c"]').value = s.c; row.querySelector('[data-k="t"]').value = s.t;
      row.querySelector(".need").innerHTML = s.t <= s.c ? '<span class="ok">完了</span>' : cfg.g + "<b>" + fmt(n[0]) + "</b>" + (n[1] ? " " + cfg.r + "<b>" + fmt(n[1]) + "</b>" : "");
      tg += n[0]; tr += n[1];
    });
    var rg = Math.max(0, tg - state.hg), rr = Math.max(0, tr - state.hr);
    $("gtotal").innerHTML = '<div class="trow">' + cfg.gLg + '<div><div>' + cfg.gName + ' 合計 <b>' + fmt(tg) + '</b></div>' + (state.hg ? '<div class="tsub">手持ちを引くと あと <b>' + fmt(rg) + '</b>' + (rg === 0 ? ' <span class="ok">足りています</span>' : "") + '</div>' : "") + '</div></div>' +
      '<div class="trow">' + cfg.rLg + '<div><div>' + cfg.rName + ' 合計 <b>' + fmt(tr) + '</b></div>' + (state.hr ? '<div class="tsub">手持ちを引くと あと <b>' + fmt(rr) + '</b>' + (rr === 0 ? ' <span class="ok">足りています</span>' : "") + '</div>' : "") + '</div></div>';
    $("hg").value = state.hg || ""; $("hr").value = state.hr || "";
  }
  document.querySelector(".gold-rows").addEventListener("change", function (ev) {
    var t = ev.target, row = t.closest("[data-b]"); if (!row || !t.dataset.k) return;
    state.b[row.dataset.b][t.dataset.k] = clamp(t.value, 0, 8); save(); render();
  });
  ["hg", "hr"].forEach(function (id) { $(id).addEventListener("input", function () { state[id] = clamp($(id).value, 0, 99999999); save(); render(); }); });
  $("allc").addEventListener("change", function () { var v = clamp($("allc").value, 0, 8); keys.forEach(function (k) { state.b[k].c = v; }); save(); render(); });
  $("allt").addEventListener("change", function () { var v = clamp($("allt").value, 0, 8); keys.forEach(function (k) { state.b[k].t = v; }); save(); render(); });
  render();
}

export function renderGoldCalculatorPage({ origin = "" } = {}) {
  const canonical = origin + "/tools/gold";
  const opts = (sel, label) => Array.from({ length: MAX_TG + 1 }, (_, n) => `<option value="${n}"${n === sel ? " selected" : ""}>${label(n)}</option>`).join("");
  const tgLabel = n => n === 0 ? "なし" : "G" + n;
  const rows = Object.entries(GOLD_COSTS).map(([key, b]) => `<div class="gold-row" data-b="${key}"><b class="bn">${esc(b.label)}</b><label>今<select data-k="c">${opts(0, tgLabel)}</select></label><label>目標<select data-k="t">${opts(8, tgLabel)}</select></label><div class="need"></div></div>`).join("");
  const head = Array.from({ length: MAX_TG }, (_, i) => `<th>G${i + 1}</th>`).join("");
  const table = Object.values(GOLD_COSTS).map(b => `<tr><th>${esc(b.label)}</th>${b.costs.map(c => `<td>${c ? fmt(c[0]) + (c[1] ? `<small>+${fmt(c[1])}</small>` : "") : "—"}</td>`).join("")}</tr>`).join("")
    + `<tr class="sum"><th>合計</th>${GOLD_TOTALS.map(c => `<td>${fmt(c[0])}${c[1] ? `<small>+${fmt(c[1])}</small>` : ""}</td>`).join("")}</tr>`;
  const cfg = { costs: GOLD_COSTS, g: goldIconSvg(16), r: goldIconSvg(16, "refined"), gLg: goldIconSvg(34), rLg: goldIconSvg(34, "refined"), gName: GOLD_NAME, rName: REFINED_GOLD_NAME };
  const cfgJson = JSON.stringify(cfg).replace(/</g, "\\u003c");
  const body = `<nav class="crumbs"><a href="/">EagleEye</a> › ツール › ${GOLD_NAME}計算</nav>
<h1>${goldIconSvg(28)} ${GOLD_NAME} 必要数計算</h1>
<p class="lead">KingShotの建物を${GOLD_NAME}（G1〜G8）で強化するのに必要な数を計算します。建物ごとに今のGと目標を選ぶと、必要な${GOLD_NAME}と${REFINED_GOLD_NAME}（G6〜8で必要）の合計が出ます。入力はこの端末に保存されます。</p>
<section class="panel"><div class="all"><label>全部の「今」をまとめて<select id="allc">${opts(0, tgLabel)}</select></label><label>全部の「目標」をまとめて<select id="allt">${opts(8, tgLabel)}</select></label></div>
<div class="gold-rows">${rows}</div>
<div class="have"><label>手持ちの${GOLD_NAME}<input id="hg" type="number" min="0" inputmode="numeric" placeholder="0"></label><label>手持ちの${REFINED_GOLD_NAME}<input id="hr" type="number" min="0" inputmode="numeric" placeholder="0"></label></div>
<div id="gtotal" class="total" aria-live="polite"></div></section>
<h2>Gごとの必要数</h2><div class="tbl"><table><thead><tr><th></th>${head}</tr></thead><tbody>${table}</tbody></table></div>
<p class="note">数字は${GOLD_NAME}の必要数で、「+」は${REFINED_GOLD_NAME}です。戦争学院はG2から。各列の合計は表の合計行と一致し、役場のG1〜5は外部の資料（kingshotguide.org）とも一致しています。G6〜8はコミュニティ資料の値です。ゲームの更新で変わる場合があります。</p>
<p class="note"><a href="/tools/gold-tech">黄金テクノロジー研究（T11）計算</a>・<a href="/tools/hero-shards">英雄の欠片計算</a>・<a href="/hero-catalog">英雄カタログ</a>もどうぞ。</p>
<script>var __name=function(f){return f};(${goldClient.toString()})(${cfgJson});</script>`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>キングショット ${GOLD_NAME} 必要数計算ツール（G1〜G8） | EagleEye</title><meta name="description" content="キングショット（KingShot）の${GOLD_NAME}（G・英語版のTG）の必要数を建物ごとに計算。役場・兵舎・大使館・指揮所・病院・戦争学院のG1〜G8に必要な${GOLD_NAME}と${REFINED_GOLD_NAME}、手持ちからの残り数がわかります。"><link rel="canonical" href="${esc(canonical)}">${origin ? webAppJsonLd({ origin, path: "/tools/gold", name: GOLD_NAME + " 必要数計算ツール", description: "キングショットの建物ごとの黄金（G1〜G8）の必要数を計算" }) + breadcrumbJsonLd(origin, [["EagleEye", "/"], [GOLD_NAME + "計算", "/tools/gold"]]) : ""}
<meta property="og:type" content="website"><meta property="og:site_name" content="EagleEye"><meta property="og:title" content="${GOLD_NAME} 必要数計算ツール | EagleEye"><meta property="og:url" content="${esc(canonical)}">
<style>body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:820px;margin:0 auto;padding:18px 16px calc(96px + env(safe-area-inset-bottom))}.crumbs{font-size:12px;color:var(--ee-subtext)}.crumbs a,.note a{color:var(--ee-cyan);text-decoration:none}h1{display:flex;align-items:center;gap:8px;margin:6px 0 4px;font-size:26px}.lead{margin:0 0 14px;color:var(--ee-subtext);font-size:13px;line-height:1.6}h2{margin:22px 0 8px;font-size:17px}.gold-ico{flex:none;vertical-align:middle}
.panel{padding:12px;border:1px solid var(--ee-border-soft);border-radius:var(--ee-radius-lg,17px);background:var(--ee-panel);display:grid;gap:10px}.all,.have{display:grid;grid-template-columns:1fr 1fr;gap:8px}label{display:grid;gap:4px;font-size:12px;color:var(--ee-subtext)}select,input{width:100%;box-sizing:border-box;padding:9px;border:1px solid var(--ee-border);border-radius:11px;font:inherit;font-size:15px;background:var(--ee-panel-deep);color:var(--ee-text)}
.gold-rows{display:grid;gap:8px}.gold-row{display:grid;grid-template-columns:4.5em 1fr 1fr;gap:6px 8px;align-items:end;padding:10px;border:1px solid var(--ee-border-soft);border-radius:12px;background:var(--ee-panel-deep)}.bn{align-self:center;font-size:14px}.need{grid-column:1/-1;display:flex;align-items:center;gap:4px;flex-wrap:wrap;font-size:13px}.need b{font-size:16px;color:var(--ee-cyan);margin-right:6px}.ok{color:var(--ee-success,#22c55e);font-weight:800}
.total{display:grid;gap:8px;padding:12px;border-radius:12px;border:1px solid color-mix(in srgb,var(--ee-cyan) 45%,transparent)}.trow{display:flex;align-items:center;gap:10px;font-size:14px}.trow b{font-size:22px;color:var(--ee-cyan)}.tsub{font-size:13px;color:var(--ee-subtext)}.tsub b{font-size:16px}
.tbl{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:12px;min-width:560px}th,td{padding:7px 5px;border-bottom:1px solid var(--ee-border-soft);text-align:right;white-space:nowrap}th:first-child{text-align:left}thead th{font-size:11px;color:var(--ee-subtext)}td small{display:block;font-size:10px;color:rgb(200,140,30)}tr.sum td,tr.sum th{font-weight:900}.note{font-size:11px;color:var(--ee-subtext);line-height:1.6}</style></head><body><main class="wrap">${body}</main></body></html>`;
}
