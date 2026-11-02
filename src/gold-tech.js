// 黄金テクノロジー研究（T11）計算. Three branches (歩兵・騎兵・弓兵) share the
// same tree and costs. Costs per level are from the community "T11 COST" table
// (credit: Pandafather); every column adds up to the table's total row.
// Resources: 黄金微粒子 (dust) and コイン (the table lists coins in thousands).

import { goldIconSvg } from "./gold-calculator.js";

export const DUST_NAME = "黄金微粒子";
export const COIN_NAME = "コイン";
export const TECH_BRANCHES = Object.freeze([["infantry", "歩兵"], ["cavalry", "騎兵"], ["archer", "弓兵"]]);

// Nodes in tree order. Names the game shows are used; the rest are named by position.
// dust: per level, coinK: per level (×1000 coins), time: total raw research time for all levels.
const L8_DUST = [40, 56, 74, 102, 136, 184, 248, 334], L8_COIN = [10, 14, 18, 25, 34, 46, 62, 83];
const L12S_DUST = [54, 66, 81, 97, 118, 145, 178, 216, 270, 324, 388, 480], L12S_COIN = [15, 18, 22, 27, 33, 40, 49, 60, 75, 90, 100, 130];
const L10_DUST = [102, 137, 188, 255, 341, 459, 612, 836, 1122, 1530], L10_COIN = [30, 40, 55, 75, 100, 130, 180, 240, 330, 450];
export const TECH_NODES = Object.freeze([
  { key: "base", name: "最初の研究", dust: [16, 25, 41, 68, 102], coinK: [5, 8, 13, 21, 33], time: "5日10時間" },
  { key: "tier2_left", name: "2段目・左", dust: L8_DUST, coinK: L8_COIN, time: "24日11時間" },
  { key: "tier2_right", name: "2段目・右", dust: L8_DUST, coinK: L8_COIN, time: "24日11時間" },
  { key: "legion", name: "黄金軍団", dust: [83, 102, 125, 150, 184, 225, 276, 334, 418, 502, 602, 744], coinK: [23, 28, 34, 41, 51, 62, 76, 93, 110, 130, 160, 200], time: "54日19時間" },
  { key: "tier4_left", name: "4段目・左", dust: L12S_DUST, coinK: L12S_COIN, time: "35日8時間" },
  { key: "tier4_right", name: "4段目・右", dust: L12S_DUST, coinK: L12S_COIN, time: "35日8時間" },
  { key: "unlock", name: "黄金{兵}（解放）", dust: [2236], coinK: [1000], time: "91日8時間" },
  { key: "heal", name: "黄金{兵}治療", dust: L10_DUST, coinK: L10_COIN, time: "114日1時間" },
  { key: "train", name: "黄金{兵}訓練", dust: L10_DUST, coinK: L10_COIN, time: "114日1時間" },
  { key: "aid", name: "黄金{兵}救急", dust: [51, 68, 94, 127, 170, 229, 306, 418, 561, 765], coinK: [15, 20, 27, 37, 50, 67, 90, 120, 160, 220], time: "57日0時間" }
].map(n => Object.freeze({ ...n, max: n.dust.length })));
// Table total row (dust, coin K) per node.
export const TECH_TOTALS = Object.freeze({ base: [252, 80], tier2_left: [1174, 292], tier2_right: [1174, 292], legion: [3745, 1008], tier4_left: [2417, 659], tier4_right: [2417, 659], unlock: [2236, 1000], heal: [5582, 1630], train: [5582, 1630], aid: [2789, 806] });

export function techBetween(key, from, to) {
  const node = TECH_NODES.find(n => n.key === key);
  if (!node) return { dust: 0, coin: 0 };
  const a = Math.max(0, Math.min(node.max, Math.floor(Number(from) || 0))), b = Math.max(0, Math.min(node.max, Math.floor(Number(to) || 0)));
  let dust = 0, coinK = 0;
  for (let lv = a + 1; lv <= b; lv++) { dust += node.dust[lv - 1]; coinK += node.coinK[lv - 1]; }
  return { dust, coin: coinK * 1000 };
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const fmt = n => Number(n).toLocaleString("ja-JP");
const nodeName = (node, troop) => node.name.replace("{兵}", troop);

export function coinIconSvg(size = 22) {
  return `<svg class="gold-ico" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="ctile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(40,110,210)"/><stop offset="1" stop-color="rgb(110,180,245)"/></linearGradient></defs><rect x=".8" y=".8" width="30.4" height="30.4" rx="7" fill="url(#ctile)" stroke="rgb(110,170,240)" stroke-width="1.2"/><ellipse cx="16.5" cy="17" rx="9" ry="9.5" fill="rgb(190,130,30)"/><ellipse cx="15.5" cy="16" rx="9" ry="9.5" fill="rgb(248,200,70)" stroke="rgb(160,105,20)" stroke-width="1"/><ellipse cx="15.5" cy="16" rx="6.2" ry="6.6" fill="none" stroke="rgb(205,145,35)" stroke-width="1.1"/><path d="M11.5 18.5l1-5 3 2.5 3-2.5 1 5Z" fill="rgb(205,145,35)"/><path d="M10 11.5q2-2.5 4.5-3" stroke="rgb(255,245,200)" stroke-width="1.3" fill="none" stroke-linecap="round"/></svg>`;
}

function techClient(cfg) {
  var N = cfg.nodes, B = cfg.branches, KEY = "eagleeye-gold-tech-v1";
  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { v = Math.floor(Number(v) || 0); return Math.max(a, Math.min(b, v)); }
  function fmt(n) { return Number(n).toLocaleString("ja-JP"); }
  function cost(node, from, to) { var d = 0, c = 0; for (var lv = from + 1; lv <= to; lv++) { d += node.dust[lv - 1]; c += node.coinK[lv - 1]; } return [d, c * 1000]; }
  var st = { cur: "infantry", b: {}, hd: 0, hc: 0 };
  try { var v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && v.b) st = v; } catch (e) {}
  B.forEach(function (br) { var s = st.b[br[0]] || {}; st.b[br[0]] = {}; N.forEach(function (n) { var x = s[n.key] || {}; st.b[br[0]][n.key] = { c: clamp(x.c, 0, n.max), t: clamp(x.t == null ? n.max : x.t, 0, n.max) }; }); });
  if (!st.b[st.cur]) st.cur = "infantry";
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  function opts(max, sel) { var o = ""; for (var i = 0; i <= max; i++) o += '<option value="' + i + '"' + (i === sel ? " selected" : "") + ">Lv." + i + "</option>"; return o; }
  function troop() { for (var i = 0; i < B.length; i++) if (B[i][0] === st.cur) return B[i][1]; return "歩兵"; }
  function branchTotal(br) { var d = 0, c = 0; N.forEach(function (n) { var s = st.b[br][n.key], x = cost(n, s.c, Math.max(s.c, s.t)); d += x[0]; c += x[1]; }); return [d, c]; }
  function render() {
    document.querySelectorAll("[data-br]").forEach(function (t) { t.setAttribute("aria-pressed", t.dataset.br === st.cur ? "true" : "false"); });
    $("nodes").innerHTML = N.map(function (n) {
      var s = st.b[st.cur][n.key], x = cost(n, s.c, Math.max(s.c, s.t));
      return '<div class="tn" data-n="' + n.key + '"><b class="nn">' + n.name.replace("{兵}", troop()) + '</b><label>今<select data-k="c">' + opts(n.max, s.c) + '</select></label><label>目標<select data-k="t">' + opts(n.max, s.t) + '</select></label><div class="need">' + (s.t <= s.c ? '<span class="ok">完了</span>' : cfg.di + "<b>" + fmt(x[0]) + "</b> " + cfg.ci + "<b>" + fmt(x[1]) + "</b>") + "</div></div>";
    }).join("");
    var cur = branchTotal(st.cur), all = [0, 0];
    B.forEach(function (br) { var x = branchTotal(br[0]); all[0] += x[0]; all[1] += x[1]; });
    var rd = Math.max(0, all[0] - st.hd), rc = Math.max(0, all[1] - st.hc);
    $("ttotal").innerHTML = '<div class="tsub">' + troop() + 'の系統：' + cfg.dName + ' <b>' + fmt(cur[0]) + '</b>・' + cfg.cName + ' <b>' + fmt(cur[1]) + '</b></div>' +
      '<div class="trow">' + cfg.diLg + '<div><div>3兵種の合計 ' + cfg.dName + ' <b>' + fmt(all[0]) + '</b></div>' + (st.hd ? '<div class="tsub">手持ちを引くと あと <b>' + fmt(rd) + '</b>' + (rd === 0 ? ' <span class="ok">足りています</span>' : "") + "</div>" : "") + "</div></div>" +
      '<div class="trow">' + cfg.ciLg + '<div><div>3兵種の合計 ' + cfg.cName + ' <b>' + fmt(all[1]) + '</b></div>' + (st.hc ? '<div class="tsub">手持ちを引くと あと <b>' + fmt(rc) + '</b>' + (rc === 0 ? ' <span class="ok">足りています</span>' : "") + "</div>" : "") + "</div></div>";
    $("hd").value = st.hd || ""; $("hc").value = st.hc || "";
  }
  $("nodes").addEventListener("change", function (ev) { var t = ev.target, row = t.closest("[data-n]"); if (!row || !t.dataset.k) return; var n = N.filter(function (x) { return x.key === row.dataset.n; })[0]; st.b[st.cur][n.key][t.dataset.k] = clamp(t.value, 0, n.max); save(); render(); });
  document.querySelectorAll("[data-br]").forEach(function (t) { t.addEventListener("click", function () { st.cur = t.dataset.br; save(); render(); }); });
  ["hd", "hc"].forEach(function (id) { $(id).addEventListener("input", function () { st[id] = clamp($(id).value, 0, 999999999999); save(); render(); }); });
  render();
}

export function renderGoldTechPage({ origin = "" } = {}) {
  const canonical = origin + "/tools/gold-tech";
  const head = '<th>研究</th><th>最大Lv</th><th>' + DUST_NAME + '</th><th>' + COIN_NAME + '</th><th>研究時間</th>';
  const table = TECH_NODES.map(n => `<tr><th>${esc(nodeName(n, "〇兵"))}</th><td>${n.max}</td><td>${fmt(TECH_TOTALS[n.key][0])}</td><td>${fmt(TECH_TOTALS[n.key][1] * 1000)}</td><td>${esc(n.time)}</td></tr>`).join("");
  const sumDust = Object.values(TECH_TOTALS).reduce((a, t) => a + t[0], 0), sumCoin = Object.values(TECH_TOTALS).reduce((a, t) => a + t[1], 0) * 1000;
  const levels = TECH_NODES.map(n => `<tr><th>${esc(nodeName(n, "〇兵"))}</th><td>${n.dust.map((d, i) => `<span class="lv">Lv.${i + 1} <b>${fmt(d)}</b> / ${fmt(n.coinK[i] * 1000)}</span>`).join("")}</td></tr>`).join("");
  const cfg = { nodes: TECH_NODES, branches: TECH_BRANCHES, di: goldIconSvg(16, "dust"), ci: coinIconSvg(16), diLg: goldIconSvg(34, "dust"), ciLg: coinIconSvg(34), dName: DUST_NAME, cName: COIN_NAME };
  const cfgJson = JSON.stringify(cfg).replace(/</g, "\\u003c");
  const body = `<nav class="crumbs"><a href="/">EagleEye</a> › ツール › 黄金テクノロジー研究</nav>
<h1>${goldIconSvg(28, "dust")} 黄金テクノロジー研究 計算</h1>
<p class="lead">KingShotの黄金テクノロジー研究（T11）に必要な${DUST_NAME}と${COIN_NAME}を計算します。兵種を選び、研究ごとに今のLvと目標を選んでください。3兵種の合計と、手持ちからの残りも出ます。入力はこの端末に保存されます。</p>
<section class="panel"><div class="tabs" role="group" aria-label="兵種">${TECH_BRANCHES.map(([k, l]) => `<button type="button" data-br="${k}">${l}</button>`).join("")}</div>
<div id="nodes" class="nodes"><noscript>計算にはJavaScriptを有効にしてください。</noscript></div>
<div class="have"><label>手持ちの${DUST_NAME}<input id="hd" type="number" min="0" inputmode="numeric" placeholder="0"></label><label>手持ちの${COIN_NAME}<input id="hc" type="number" min="0" inputmode="numeric" placeholder="0"></label></div>
<div id="ttotal" class="total" aria-live="polite"></div></section>
<h2>研究ごとの合計（1兵種あたり）</h2><div class="tbl"><table><thead><tr>${head}</tr></thead><tbody>${table}<tr class="sum"><th>合計</th><td></td><td>${fmt(sumDust)}</td><td>${fmt(sumCoin)}</td><td></td></tr></tbody></table></div>
<details class="lvs"><summary>レベルごとの必要数を見る（${DUST_NAME} / ${COIN_NAME}）</summary><div class="tbl"><table><tbody>${levels}</tbody></table></div></details>
<p class="note">${DUST_NAME}は黄金テクノロジー研究画面の「交換」で${COIN_NAME}から交換できます（例：5,000${COIN_NAME}で1個、回数は週ごとにリセット）。研究時間は加速なしの合計です。数値はコミュニティ資料「T11 COST」（作成：Pandafather）によるもので、各研究の合計は資料の合計行と一致しています。3兵種とも同じコストとして計算しています。ゲーム内で名前が表示されない研究は、ツリー上の位置で表記しています。</p>
<p class="note"><a href="/tools/gold">黄金（TG）計算</a>・<a href="/tools/hero-shards">英雄の欠片計算</a>もどうぞ。</p>
<script>var __name=function(f){return f};(${techClient.toString()})(${cfgJson});</script>`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>黄金テクノロジー研究（T11）計算ツール | EagleEye</title><meta name="description" content="KingShotの黄金テクノロジー研究（T11）に必要な${DUST_NAME}と${COIN_NAME}を、歩兵・騎兵・弓兵の研究ごとに計算。黄金軍団や黄金歩兵の解放、治療・訓練・救急のレベル別必要数と研究時間がわかります。"><link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="EagleEye"><meta property="og:title" content="黄金テクノロジー研究（T11）計算 | EagleEye"><meta property="og:url" content="${esc(canonical)}">
<style>body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:820px;margin:0 auto;padding:18px 16px calc(96px + env(safe-area-inset-bottom))}.crumbs{font-size:12px;color:var(--ee-subtext)}.crumbs a,.note a{color:var(--ee-cyan);text-decoration:none}h1{display:flex;align-items:center;gap:8px;margin:6px 0 4px;font-size:24px}.lead{margin:0 0 14px;color:var(--ee-subtext);font-size:13px;line-height:1.6}h2{margin:22px 0 8px;font-size:17px}.gold-ico{flex:none;vertical-align:middle}
.panel{padding:12px;border:1px solid var(--ee-border-soft);border-radius:var(--ee-radius-lg,17px);background:var(--ee-panel);display:grid;gap:10px}.tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.tabs button{padding:10px;border:1px solid var(--ee-border);border-radius:11px;background:var(--ee-panel-deep);color:var(--ee-text);font:inherit;font-weight:800;cursor:pointer}.tabs button[aria-pressed="true"]{background:var(--ee-cyan);border-color:var(--ee-cyan);color:var(--ee-on-accent,#062033)}
.nodes{display:grid;gap:8px}.tn{display:grid;grid-template-columns:minmax(0,1.3fr) 1fr 1fr;gap:6px 8px;align-items:end;padding:10px;border:1px solid var(--ee-border-soft);border-radius:12px;background:var(--ee-panel-deep)}.nn{align-self:center;font-size:13px}label{display:grid;gap:4px;font-size:12px;color:var(--ee-subtext)}select,input{width:100%;box-sizing:border-box;padding:9px;border:1px solid var(--ee-border);border-radius:11px;font:inherit;font-size:15px;background:var(--ee-panel);color:var(--ee-text)}.need{grid-column:1/-1;display:flex;align-items:center;gap:4px;flex-wrap:wrap;font-size:13px}.need b{font-size:15px;color:var(--ee-cyan);margin-right:6px}.ok{color:var(--ee-success,#22c55e);font-weight:800}
.have{display:grid;grid-template-columns:1fr 1fr;gap:8px}.total{display:grid;gap:8px;padding:12px;border-radius:12px;border:1px solid color-mix(in srgb,var(--ee-cyan) 45%,transparent)}.trow{display:flex;align-items:center;gap:10px;font-size:14px}.trow b{font-size:20px;color:var(--ee-cyan)}.tsub{font-size:13px;color:var(--ee-subtext)}.tsub b{font-size:15px;color:var(--ee-text)}
.tbl{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:7px 5px;border-bottom:1px solid var(--ee-border-soft);text-align:right;vertical-align:top}th:first-child{text-align:left;white-space:nowrap}thead th{font-size:11px;color:var(--ee-subtext)}tr.sum td,tr.sum th{font-weight:900}.lvs summary{cursor:pointer;color:var(--ee-cyan);font-size:13px;margin:12px 0 6px}.lvs td{text-align:left}.lv{display:inline-block;margin:0 10px 4px 0;white-space:nowrap;color:var(--ee-subtext)}.lv b{color:var(--ee-text)}.note{font-size:11px;color:var(--ee-subtext);line-height:1.6}</style></head><body><main class="wrap">${body}</main></body></html>`;
}
