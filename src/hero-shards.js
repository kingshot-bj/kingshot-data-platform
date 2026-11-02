// Hero shard calculator. Each star has six steps; MightPulse reports a hero's
// progress as `star` = completed steps (0–30, 30 = 5★ max). Costs per step were
// checked against kingshot.net, kingshotdata.com and kingshotalmanach.com
// (all agree; total 1,065 to max) and confirmed in game by the operator.

import { HERO_SKILLS_JA } from "./hero-skills-ja.js";

export const SHARD_STEP_COSTS = Object.freeze([
  Object.freeze([1, 1, 2, 2, 2, 2]),        // ★1 (10)
  Object.freeze([5, 5, 5, 5, 5, 15]),       // ★2 (40)
  Object.freeze([15, 15, 15, 15, 15, 40]),  // ★3 (115)
  Object.freeze([40, 40, 40, 40, 40, 100]), // ★4 (300)
  Object.freeze([100, 100, 100, 100, 100, 100]) // ★5 (600)
]);
export const SHARD_STEPS = Object.freeze(SHARD_STEP_COSTS.flat());
export const MAX_STEPS = SHARD_STEPS.length; // 30
// Heroes that only take their own (hero-specific) shards.
export const DEDICATED_SHARD_HEROES = Object.freeze(["Amadeus", "Helga", "アマデウス", "ヘルガ"]);

const clampSteps = value => Math.max(0, Math.min(MAX_STEPS, Math.floor(Number(value) || 0)));

// Shards needed to go from `fromSteps` completed steps to `toSteps`.
export function shardsBetween(fromSteps, toSteps) {
  const a = clampSteps(fromSteps), b = clampSteps(toSteps);
  let total = 0;
  for (let i = a; i < b; i++) total += SHARD_STEPS[i];
  return total;
}

export function describeProgress(steps) {
  const s = clampSteps(steps);
  if (s >= MAX_STEPS) return { star: 5, step: 0, label: "★5（最大）" };
  return { star: Math.floor(s / 6), step: s % 6, label: `★${Math.floor(s / 6)} 段階${s % 6}` };
}

export function heroShardPlan(steps) {
  const s = clampSteps(steps);
  const nextStar = s >= MAX_STEPS ? MAX_STEPS : (Math.floor(s / 6) + 1) * 6;
  return {
    steps: s,
    progress: describeProgress(s),
    nextStep: s >= MAX_STEPS ? 0 : SHARD_STEPS[s],
    nextStar: shardsBetween(s, nextStar),
    max: shardsBetween(s, MAX_STEPS)
  };
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---- Hero list for the free picker -------------------------------------
// Names follow the in-game Japanese names used by the player data (HERO_NAME_JA
// in index.js). The skill catalog spells a couple of them differently.
export const HERO_NAME_ALIASES = Object.freeze({ "マリン": "マーリン", "アイヴァ": "エヴァ" });
const EXTRA_HEROES = ["セス"];
const ICON_FILE = /^[a-f0-9]{64}\.(?:png|jpg|webp|gif|avif)$/;

export function canonicalHeroName(name) {
  const n = String(name ?? "").trim();
  return HERO_NAME_ALIASES[n] || n;
}

export function isDedicatedShardHero(name) {
  return DEDICATED_SHARD_HEROES.includes(String(name ?? "")) || DEDICATED_SHARD_HEROES.includes(canonicalHeroName(name));
}

// [{ n: name, i: icon file or "", d: dedicated }] — identical for every viewer
// so the public page stays cacheable.
export function shardHeroList(iconByName = {}) {
  const reverse = Object.fromEntries(Object.entries(HERO_NAME_ALIASES).map(([a, b]) => [b, a]));
  const seen = new Set();
  const out = [];
  for (const raw of [...Object.keys(HERO_SKILLS_JA), ...EXTRA_HEROES]) {
    const n = canonicalHeroName(raw);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    const file = [iconByName?.[n], iconByName?.[raw], iconByName?.[reverse[n]]].find(v => typeof v === "string" && ICON_FILE.test(v)) || "";
    out.push({ n, i: file, d: isDedicatedShardHero(n) });
  }
  return out;
}

// Shard illustration: a tilted orange jigsaw piece like the in-game hero shard
// (inline SVG; rgb() so the theme normalizer leaves it alone).
const PUZZLE_PATH = "M4 6H8.6C8.6 5 7.8 4.6 7.8 3.4A3.2 3.2 0 0 1 14.2 3.4C14.2 4.6 13.4 5 13.4 6H18V10.6C19 10.6 19.4 9.8 20.6 9.8A3.2 3.2 0 0 1 20.6 16.2C19.4 16.2 19 15.4 18 15.4V20H13.4C13.4 21 14.2 21.4 14.2 22.6A3.2 3.2 0 0 1 7.8 22.6C7.8 21.4 8.6 21 8.6 20H4V15.4C5 15.4 5.4 16.2 6.6 16.2A3.2 3.2 0 0 0 6.6 9.8C5.4 9.8 5 10.6 4 10.6Z";
export function shardIconSvg(size = 22) {
  return `<svg class="shard-ico" width="${size}" height="${size}" viewBox="-1.5 -1 30 30" aria-hidden="true"><defs><linearGradient id="shg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(255,206,92)"/><stop offset="1" stop-color="rgb(246,142,24)"/></linearGradient></defs><g transform="rotate(-22 13.5 13.5)"><path d="${PUZZLE_PATH}" transform="translate(.4 1.6)" fill="rgb(176,78,8)" stroke="rgb(140,58,6)" stroke-width="1.4" stroke-linejoin="round"/><path d="${PUZZLE_PATH}" fill="url(#shg)" stroke="rgb(176,78,8)" stroke-width="1.4" stroke-linejoin="round"/><path d="M6 8.2H10.4M15.6 8.2H16.4" stroke="rgb(255,240,190)" stroke-width="1.2" stroke-linecap="round" opacity=".8"/><circle cx="11" cy="3.6" r="1.1" fill="rgb(255,240,190)" opacity=".8"/></g></svg>`;
}

// Client side of the calculator. Serialized with toString(), so it must not
// reference anything outside its own body.
function shardClient(cfg) {
  var S = cfg.steps, H = cfg.heroes, KEY = "eagleeye-shard-plan-v1";
  var byName = {};
  H.forEach(function (h) { byName[h.n] = h; });
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function clamp(v, a, b) { v = Math.floor(Number(v) || 0); return Math.max(a, Math.min(b, v)); }
  function need(from, to) { var n = 0; for (var i = from; i < to; i++) n += S[i]; return n; }
  function fmt(n) { return Number(n).toLocaleString("ja-JP"); }
  function norm(e) { return { n: String(e && e.n || ""), s: clamp(e && e.s, 0, 30), t: clamp(e && e.t || 5, 1, 5), h: clamp(e && e.h, 0, 999999) }; }
  function load() { try { var v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && Array.isArray(v.list)) return v.list; } catch (e) {} return null; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ list: list })); } catch (e) {} }
  function dedicated(n) { return byName[n] ? byName[n].d : false; }
  function avatar(n) {
    var h = byName[n];
    return h && h.i ? '<img class="av" src="/hero-icons/assets/' + esc(h.i) + '" alt="" loading="lazy">' : '<span class="av av-txt">' + esc(n.charAt(0)) + "</span>";
  }
  var mine = (cfg.mine || []).map(norm).filter(function (e) { return e.n; });
  var saved = load();
  var list = (saved || mine).map(norm).filter(function (e) { return e.n; });
  function find(n) { for (var i = 0; i < list.length; i++) if (list[i].n === n) return i; return -1; }
  function opts(from, to, sel, label) { var o = ""; for (var i = from; i <= to; i++) o += '<option value="' + i + '"' + (i === sel ? " selected" : "") + ">" + label(i) + "</option>"; return o; }
  function result(e) {
    var to = e.t * 6;
    if (e.s >= to) return '<span class="ok">目標に到達済み</span>';
    var n = need(e.s, to), rest = Math.max(0, n - e.h);
    return '必要 <b>' + fmt(n) + "</b>" + (e.h ? ' ・ あと <b class="rest">' + fmt(rest) + "</b>" + (rest === 0 ? ' <span class="ok">足りています</span>' : "") : "") + "";
  }
  function card(e, i) {
    var cs = Math.floor(e.s / 6), cp = e.s >= 30 ? 0 : e.s % 6;
    return '<div class="hcard" data-i="' + i + '"><div class="hhead">' + avatar(e.n) + '<b class="hn">' + esc(e.n) + "</b>" + (dedicated(e.n) ? '<small class="ded">専用欠片</small>' : "") +
      '<button type="button" class="rm" data-act="rm" aria-label="' + esc(e.n) + 'を外す">×</button></div>' +
      '<div class="hgrid"><label>今の★<select data-k="cs">' + opts(0, 5, cs, function (n) { return "★" + n; }) + "</select></label>" +
      '<label>段階<select data-k="cp"' + (cs >= 5 ? " disabled" : "") + ">" + opts(0, 5, cp, function (n) { return "段階" + n; }) + "</select></label>" +
      '<label>目標<select data-k="t">' + opts(1, 5, e.t, function (n) { return "★" + n; }) + "</select></label>" +
      '<label>持っている欠片<input data-k="h" type="number" min="0" inputmode="numeric" placeholder="0" value="' + (e.h || "") + '"></label></div>' +
      '<div class="hres">' + cfg.icon + "<span>" + result(e) + "</span></div></div>";
  }
  function totals() {
    var n = 0, rest = 0, ded = 0;
    list.forEach(function (e) { var x = need(e.s, Math.max(e.s, e.t * 6)); if (dedicated(e.n)) { ded++; return; } n += x; rest += Math.max(0, x - e.h); });
    $("total").innerHTML = list.length ? cfg.iconLg + '<div><div>汎用の欠片 合計 <b>' + fmt(n) + "</b> 個</div>" + (rest !== n ? '<div>持っている分を引くと あと <b>' + fmt(rest) + "</b> 個</div>" : "") + (ded ? '<small>専用欠片の英雄（' + ded + "人）は合計に含めていません</small>" : "") + "</div>" : "";
  }
  function picker() {
    $("pgrid").innerHTML = H.map(function (h) {
      var on = find(h.n) >= 0;
      return '<button type="button" class="pk' + (on ? " on" : "") + '" data-n="' + esc(h.n) + '" aria-pressed="' + on + '">' + avatar(h.n) + "<span>" + esc(h.n) + "</span></button>";
    }).join("");
  }
  function render() {
    $("hlist").innerHTML = list.length ? list.map(card).join("") : '<div class="empty">下の「英雄を追加」から計算したい英雄を選んでください。</div>';
    totals(); picker();
  }
  $("hlist").addEventListener("input", function (ev) {
    var t = ev.target, c = t.closest(".hcard"); if (!c || !t.dataset.k) return;
    var e = list[Number(c.dataset.i)]; if (!e) return;
    var cs = Number(c.querySelector('[data-k="cs"]').value), cp = Number(c.querySelector('[data-k="cp"]').value);
    if (t.dataset.k === "cs" || t.dataset.k === "cp") { e.s = cs >= 5 ? 30 : cs * 6 + cp; c.querySelector('[data-k="cp"]').disabled = cs >= 5; if (cs >= 5) c.querySelector('[data-k="cp"]').value = "0"; }
    if (t.dataset.k === "t") e.t = clamp(t.value, 1, 5);
    if (t.dataset.k === "h") e.h = clamp(t.value, 0, 999999);
    c.querySelector(".hres span").innerHTML = result(e);
    totals(); save();
  });
  $("hlist").addEventListener("click", function (ev) {
    var b = ev.target.closest('[data-act="rm"]'); if (!b) return;
    list.splice(Number(b.closest(".hcard").dataset.i), 1); save(); render();
  });
  $("pgrid").addEventListener("click", function (ev) {
    var b = ev.target.closest(".pk"); if (!b) return;
    var n = b.dataset.n, i = find(n);
    if (i >= 0) list.splice(i, 1); else list.push(norm({ n: n, s: 0, t: 5 }));
    save(); render();
  });
  var imp = $("import");
  if (imp) imp.addEventListener("click", function () {
    mine.forEach(function (m) { var i = find(m.n); if (i >= 0) list[i].s = m.s; else list.push(norm({ n: m.n, s: m.s, t: 5 })); });
    save(); render();
    imp.textContent = "読み込みました";
  });
  var clr = $("clear");
  if (clr) clr.addEventListener("click", function () { if (!list.length || confirm("選んだ英雄をすべて外しますか？")) { list = []; save(); render(); } });
  render();
}

// heroes: [{ name, displayName, steps }] from the signed-in user's arena team, or null.
// iconByName: saved hero icons ({ 日本語名: "<sha256>.png" }).
export function renderHeroShardPage({ origin = "", signedIn = false, heroes = null, heroesNote = "", loginHref = "/api/auth/discord", iconByName = {} } = {}) {
  const canonical = origin + "/tools/hero-shards";
  const table = SHARD_STEP_COSTS.map((row, i) => `<tr><th>★${i + 1}</th>${row.map(v => `<td>${v}</td>`).join("")}<td><b>${row.reduce((a, b) => a + b, 0)}</b></td></tr>`).join("");
  const heroList = shardHeroList(iconByName);
  const mine = signedIn && Array.isArray(heroes) ? heroes.map(h => ({ n: canonicalHeroName(h.displayName || h.name), s: clampSteps(h.steps), t: 5 })).filter(h => h.n) : [];

  let account = "";
  if (signedIn && mine.length) {
    account = `<div class="acct"><button type="button" id="import" class="btn">アリーナ編成から読み込む（${mine.length}人）</button><span class="hint">MightPulseで取得した編成の★と段階を反映します。${esc(heroesNote)}</span></div>`;
  } else if (signedIn) {
    account = `<div class="acct"><span class="hint">${esc(heroesNote || "マイKingShotで領主IDを登録し、プレイヤー詳細で「詳細情報を取得」すると、アリーナ編成の英雄を読み込めます。")}</span></div>`;
  }
  const cta = signedIn ? "" : `<section class="cta"><h2>ログインすると自分の英雄を読み込めます</h2><p>EagleEyeに領主IDを登録すると、あなたの英雄の今の★と段階を読み取り、そのまま計算に使えます。</p><a class="cta-btn" href="${esc(loginHref)}">Discordでログイン</a></section>`;

  const cfg = { steps: SHARD_STEPS, heroes: heroList, mine, icon: shardIconSvg(18), iconLg: shardIconSvg(40) };
  const cfgJson = JSON.stringify(cfg).replace(/</g, "\\u003c").replace(/\u2028|\u2029/g, "");

  const body = `<nav class="crumbs"><a href="/">EagleEye</a> › <a href="/hero-catalog">英雄カタログ</a> › 欠片計算</nav>
<h1>${shardIconSvg(26)} 英雄の欠片 計算</h1>
<p class="lead">KingShotの英雄の星上げに必要な欠片の数を計算します。好きな英雄を選んで、今の★・段階と目標を入れてください。★は1つにつき6段階あり、段階ごとに必要数が違います。選んだ英雄はこの端末に保存されます。</p>
${account}
<section class="plan"><div id="hlist" class="hlist"><noscript><div class="empty">計算にはJavaScriptを有効にしてください。</div></noscript></div>
<div id="total" class="total" aria-live="polite"></div>
<details class="picker" open><summary>＋ 英雄を追加 <small>（タップで追加・もう一度で外す）</small></summary><div id="pgrid" class="pgrid"></div><button type="button" id="clear" class="btn ghost">すべて外す</button></details></section>
${cta}
<h2>段階ごとの必要数</h2><div class="tbl"><table><thead><tr><th></th><th>段階1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th>合計</th></tr></thead><tbody>${table}</tbody></table></div>
<p class="note">★5まで合計1,065個。英雄の解放には別途10個（アマデウス20個・チェンコ40個との情報あり）。アマデウスとヘルガは専用の欠片のみ使用できます。数値はコミュニティ資料（kingshot.net・kingshotdata.com ほか）で照合し、ゲーム内で確認したものです。</p>
<script>var __name=function(f){return f};(${shardClient.toString()})(${cfgJson});</script>`;

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>英雄の欠片 計算ツール（段階ごとの必要数） | EagleEye</title><meta name="description" content="KingShotの英雄の星上げに必要な欠片の数を計算。好きな英雄を選んで★1〜★5の段階ごとの必要数（★5まで合計1,065個）と、持っている欠片からの残り数がわかります。"><link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="EagleEye"><meta property="og:title" content="英雄の欠片 計算ツール | EagleEye"><meta property="og:url" content="${esc(canonical)}">
<style>body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:820px;margin:0 auto;padding:18px 16px calc(96px + env(safe-area-inset-bottom))}.crumbs{font-size:12px;color:var(--ee-subtext)}.crumbs a{color:var(--ee-cyan);text-decoration:none}h1{display:flex;align-items:center;gap:8px;margin:6px 0 4px;font-size:26px}.lead{margin:0 0 14px;color:var(--ee-subtext);font-size:13px;line-height:1.6}h2{margin:22px 0 8px;font-size:17px}
.shard-ico{flex:none;vertical-align:middle}.acct{display:grid;gap:6px;margin-bottom:12px}.btn{padding:11px 14px;border:0;border-radius:12px;background:var(--ee-cyan);color:var(--ee-on-accent,#062033);font:inherit;font-weight:900;cursor:pointer}.btn.ghost{margin-top:10px;background:transparent;border:1px solid var(--ee-border);color:var(--ee-subtext);font-weight:700;font-size:12px;padding:8px 12px}
.hlist{display:grid;gap:10px}.hcard,.cta,.total,.picker{padding:12px;border:1px solid var(--ee-border-soft);border-radius:var(--ee-radius-lg,17px);background:var(--ee-panel)}.hhead{display:flex;align-items:center;gap:10px;margin-bottom:8px}.hn{font-size:16px}.rm{margin-left:auto;width:32px;height:32px;border:1px solid var(--ee-border);border-radius:50%;background:transparent;color:var(--ee-subtext);font-size:18px;line-height:1;cursor:pointer}
.av{flex:none;width:40px;height:40px;border-radius:50%;object-fit:cover;background:var(--ee-panel-raised);border:2px solid var(--ee-border)}.av-txt{display:grid;place-items:center;font-weight:900;color:var(--ee-cyan)}
.hgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}label{display:grid;gap:4px;font-size:12px;color:var(--ee-subtext)}select,input{width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--ee-border);border-radius:11px;font:inherit;font-size:15px;background:var(--ee-panel-deep);color:var(--ee-text)}select:disabled{opacity:.45}
.hres{display:flex;align-items:center;gap:8px;margin-top:8px;padding:10px 12px;border-radius:12px;background:color-mix(in srgb,var(--ee-cyan) 10%,var(--ee-panel));font-size:14px}.hres b{font-size:20px;color:var(--ee-cyan)}.hres b.rest{color:var(--ee-warning,#f59e0b)}.ok{color:var(--ee-success,#22c55e);font-weight:800}.ded{padding:2px 7px;border-radius:999px;font-size:10px;font-weight:800;color:var(--ee-warning,#f59e0b);border:1px solid currentColor}
.total{display:flex;align-items:center;gap:12px;margin-top:10px;font-size:14px;border-color:color-mix(in srgb,var(--ee-cyan) 45%,transparent)}.total:empty{display:none}.total b{font-size:22px;color:var(--ee-cyan)}.total small{display:block;margin-top:2px;font-size:11px;color:var(--ee-subtext)}
.picker{margin-top:12px}.picker summary{cursor:pointer;font-weight:900;color:var(--ee-cyan)}.picker summary small{font-weight:400;color:var(--ee-subtext)}.pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(76px,1fr));gap:8px;margin-top:10px}.pk{display:grid;justify-items:center;gap:4px;padding:8px 4px;border:1px solid var(--ee-border-soft);border-radius:12px;background:var(--ee-panel-deep);color:var(--ee-text);font:inherit;font-size:11px;cursor:pointer}.pk .av{width:44px;height:44px}.pk.on{border-color:var(--ee-cyan);background:color-mix(in srgb,var(--ee-cyan) 16%,var(--ee-panel))}.pk.on .av{border-color:var(--ee-cyan)}
.tbl{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:7px 6px;border-bottom:1px solid var(--ee-border-soft);text-align:right;white-space:nowrap}th:first-child{text-align:left}thead th{font-size:11px;color:var(--ee-subtext)}.hint,.note{font-size:11px;color:var(--ee-subtext);line-height:1.6}.empty{font-size:13px;color:var(--ee-subtext);padding:8px 2px}
.cta{margin-top:14px;border-color:color-mix(in srgb,var(--ee-cyan) 40%,transparent)}.cta p{font-size:13px;line-height:1.6}.cta-btn{display:inline-block;padding:11px 16px;border-radius:12px;background:var(--ee-cyan);color:var(--ee-on-accent,#062033);font-weight:900;text-decoration:none}</style></head><body><main class="wrap">${body}</main></body></html>`;
}
