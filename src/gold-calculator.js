// 黄金（英語版の Truegold）必要数計算. Costs per building and TG level come
// from the community table the operator supplied (each column adds up to the
// table's total row; Town Center TG1–5 also match kingshotguide.org).
// TG6–8 additionally need the refined material (英語版 Tempered Truegold).

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

// Gold nugget / refined ingot illustrations (rgb() so the theme normalizer leaves them alone).
export function goldIconSvg(size = 22, refined = false) {
  return refined
    ? `<svg class="gold-ico" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><path d="M5 20 11 9h14l2 11-6 5H9Z" fill="rgb(245,190,60)" stroke="rgb(150,90,10)" stroke-width="1.4" stroke-linejoin="round"/><path d="M11 9 9 25M25 9l-4 16M7 17h20" stroke="rgb(170,105,15)" stroke-width="1" opacity=".7"/><path d="M13 12h6" stroke="rgb(255,248,210)" stroke-width="1.6" stroke-linecap="round"/></svg>`
    : `<svg class="gold-ico" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><path d="M6 19 9 10l9-3 8 6-1 9-9 4-9-3Z" fill="rgb(222,170,85)" stroke="rgb(130,85,30)" stroke-width="1.4" stroke-linejoin="round"/><path d="M9 10l7 6 10-3M16 16l0 10" stroke="rgb(150,100,40)" stroke-width="1" opacity=".7"/><path d="M11 12l3-1" stroke="rgb(255,240,200)" stroke-width="1.6" stroke-linecap="round"/></svg>`;
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
  const tgLabel = n => n === 0 ? "TGなし" : "TG" + n;
  const rows = Object.entries(GOLD_COSTS).map(([key, b]) => `<div class="gold-row" data-b="${key}"><b class="bn">${esc(b.label)}</b><label>今<select data-k="c">${opts(0, tgLabel)}</select></label><label>目標<select data-k="t">${opts(8, tgLabel)}</select></label><div class="need"></div></div>`).join("");
  const head = Array.from({ length: MAX_TG }, (_, i) => `<th>TG${i + 1}</th>`).join("");
  const table = Object.values(GOLD_COSTS).map(b => `<tr><th>${esc(b.label)}</th>${b.costs.map(c => `<td>${c ? fmt(c[0]) + (c[1] ? `<small>+${fmt(c[1])}</small>` : "") : "—"}</td>`).join("")}</tr>`).join("")
    + `<tr class="sum"><th>合計</th>${GOLD_TOTALS.map(c => `<td>${fmt(c[0])}${c[1] ? `<small>+${fmt(c[1])}</small>` : ""}</td>`).join("")}</tr>`;
  const cfg = { costs: GOLD_COSTS, g: goldIconSvg(16), r: goldIconSvg(16, true), gLg: goldIconSvg(34), rLg: goldIconSvg(34, true), gName: GOLD_NAME, rName: REFINED_GOLD_NAME };
  const cfgJson = JSON.stringify(cfg).replace(/</g, "\\u003c");
  const body = `<nav class="crumbs"><a href="/">EagleEye</a> › ツール › ${GOLD_NAME}計算</nav>
<h1>${goldIconSvg(28)} ${GOLD_NAME} 必要数計算</h1>
<p class="lead">KingShotの建物を${GOLD_NAME}（TG）で強化するのに必要な数を計算します。建物ごとに今のTGと目標を選ぶと、必要な${GOLD_NAME}と${REFINED_GOLD_NAME}（TG6〜8で必要）の合計が出ます。入力はこの端末に保存されます。</p>
<section class="panel"><div class="all"><label>全部の「今」をまとめて<select id="allc">${opts(0, tgLabel)}</select></label><label>全部の「目標」をまとめて<select id="allt">${opts(8, tgLabel)}</select></label></div>
<div class="gold-rows">${rows}</div>
<div class="have"><label>手持ちの${GOLD_NAME}<input id="hg" type="number" min="0" inputmode="numeric" placeholder="0"></label><label>手持ちの${REFINED_GOLD_NAME}<input id="hr" type="number" min="0" inputmode="numeric" placeholder="0"></label></div>
<div id="gtotal" class="total" aria-live="polite"></div></section>
<h2>TGごとの必要数</h2><div class="tbl"><table><thead><tr><th></th>${head}</tr></thead><tbody>${table}</tbody></table></div>
<p class="note">数字は${GOLD_NAME}の必要数で、「+」は${REFINED_GOLD_NAME}です。戦争学院はTG2から。各列の合計は表の合計行と一致し、役場のTG1〜5は外部の資料（kingshotguide.org）とも一致しています。TG6〜8はコミュニティ資料の値です。ゲームの更新で変わる場合があります。</p>
<p class="note"><a href="/tools/hero-shards">英雄の欠片計算</a>・<a href="/hero-catalog">英雄カタログ</a>もどうぞ。</p>
<script>var __name=function(f){return f};(${goldClient.toString()})(${cfgJson});</script>`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${GOLD_NAME} 必要数計算ツール（TG1〜TG8） | EagleEye</title><meta name="description" content="KingShotの${GOLD_NAME}（TG）の必要数を建物ごとに計算。役場・兵舎・大使館・指揮所・病院・戦争学院のTG1〜TG8に必要な${GOLD_NAME}と${REFINED_GOLD_NAME}、手持ちからの残り数がわかります。"><link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="EagleEye"><meta property="og:title" content="${GOLD_NAME} 必要数計算ツール | EagleEye"><meta property="og:url" content="${esc(canonical)}">
<style>body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:820px;margin:0 auto;padding:18px 16px calc(96px + env(safe-area-inset-bottom))}.crumbs{font-size:12px;color:var(--ee-subtext)}.crumbs a,.note a{color:var(--ee-cyan);text-decoration:none}h1{display:flex;align-items:center;gap:8px;margin:6px 0 4px;font-size:26px}.lead{margin:0 0 14px;color:var(--ee-subtext);font-size:13px;line-height:1.6}h2{margin:22px 0 8px;font-size:17px}.gold-ico{flex:none;vertical-align:middle}
.panel{padding:12px;border:1px solid var(--ee-border-soft);border-radius:var(--ee-radius-lg,17px);background:var(--ee-panel);display:grid;gap:10px}.all,.have{display:grid;grid-template-columns:1fr 1fr;gap:8px}label{display:grid;gap:4px;font-size:12px;color:var(--ee-subtext)}select,input{width:100%;box-sizing:border-box;padding:9px;border:1px solid var(--ee-border);border-radius:11px;font:inherit;font-size:15px;background:var(--ee-panel-deep);color:var(--ee-text)}
.gold-rows{display:grid;gap:8px}.gold-row{display:grid;grid-template-columns:4.5em 1fr 1fr;gap:6px 8px;align-items:end;padding:10px;border:1px solid var(--ee-border-soft);border-radius:12px;background:var(--ee-panel-deep)}.bn{align-self:center;font-size:14px}.need{grid-column:1/-1;display:flex;align-items:center;gap:4px;flex-wrap:wrap;font-size:13px}.need b{font-size:16px;color:var(--ee-cyan);margin-right:6px}.ok{color:var(--ee-success,#22c55e);font-weight:800}
.total{display:grid;gap:8px;padding:12px;border-radius:12px;border:1px solid color-mix(in srgb,var(--ee-cyan) 45%,transparent)}.trow{display:flex;align-items:center;gap:10px;font-size:14px}.trow b{font-size:22px;color:var(--ee-cyan)}.tsub{font-size:13px;color:var(--ee-subtext)}.tsub b{font-size:16px}
.tbl{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:12px;min-width:560px}th,td{padding:7px 5px;border-bottom:1px solid var(--ee-border-soft);text-align:right;white-space:nowrap}th:first-child{text-align:left}thead th{font-size:11px;color:var(--ee-subtext)}td small{display:block;font-size:10px;color:rgb(200,140,30)}tr.sum td,tr.sum th{font-weight:900}.note{font-size:11px;color:var(--ee-subtext);line-height:1.6}</style></head><body><main class="wrap">${body}</main></body></html>`;
}
