import { shareCardPalettes } from "./themes.js";
// プレイヤー比較を1枚の画像にして共有する（画像で共有／リンクをコピー）。
// 画像は端末内の canvas で作り、iPhone の共有メニュー（Discord・LINE・X など）へ渡す。
// アバターは別ドメイン（CORSなし）なので /api/avatar 経由で同一オリジンにして canvas を汚さない。

export const SHARE_LANDING_PATH = "/?ref=share";
const AVATAR_HOSTS = new Set(["got-global-avatar.akamaized.net"]);
const AVATAR_MAX_BYTES = 512 * 1024;

export function avatarProxyTarget(raw) {
  let u;
  try { u = new URL(String(raw || "")); } catch { return null; }
  if (u.protocol !== "https:" || !AVATAR_HOSTS.has(u.hostname) || u.username || u.password || u.port) return null;
  if (!/\.(png|jpe?g|webp|gif)$/i.test(u.pathname)) return null;
  return u.toString();
}

// ログイン不要の公開画像だけを中継（許可したホスト・画像拡張子のみ、1日キャッシュ）。
export async function handleAvatarProxy(request, { fetchImpl = fetch, cache = globalThis.caches?.default } = {}) {
  const target = avatarProxyTarget(new URL(request.url).searchParams.get("u"));
  if (!target) return new Response("bad avatar url", { status: 400 });
  const key = new Request("https://avatar-cache.eagleeye/" + encodeURIComponent(target));
  const hit = cache ? await cache.match(key).catch(() => null) : null;
  if (hit) return hit;
  let upstream;
  try { upstream = await fetchImpl(target, { cf: { cacheTtl: 86400 } }); } catch { return new Response("upstream error", { status: 502 }); }
  const type = upstream.headers.get("content-type") || "";
  if (!upstream.ok || !/^image\//i.test(type)) return new Response("not an image", { status: 502 });
  const body = await upstream.arrayBuffer();
  if (body.byteLength > AVATAR_MAX_BYTES) return new Response("too large", { status: 502 });
  const res = new Response(body, { headers: { "content-type": type, "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" } });
  if (cache) await cache.put(key, res.clone()).catch(() => {});
  return res;
}

// ---- client (serialized with toString; must not reference outer variables) ----
export function compareShareClient(cfg) {
  var STAGES = [["coliseum", "闘技場", 21], ["forest_of_life", "生命の森", 22], ["crystal_cave", "水晶鉱山", 23], ["knowledge_nexus", "知識の枢軸", 24], ["molten_fort", "溶岩要塞", 25], ["radiant_spire", "輝光の塔", 26]];
  var PALS = cfg.palettes || {};
  // 使っている着せ替えの色（画像を作る瞬間に読む）。
  function currentPalette() { var id = document.documentElement.getAttribute("data-ee-skin") || "navy"; return PALS[id] || PALS.navy || { bg: "#0b1424", panel: "#0f1f36", raised: "#13263d", border: "#1d344d", text: "#e8f3ff", subtext: "#91a7bf", accent: "#22d3ee" }; }
  var P = currentPalette();
  function alpha(hex, a) { var n = parseInt(String(hex).slice(1), 16); return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; }
  var COLORS = ["rgb(34,211,238)", "rgb(251,191,36)", "rgb(244,114,182)", "rgb(163,230,53)"];
  var FONT = '-apple-system,"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif';
  var head = document.querySelector(".head") || document.querySelector("main");
  if (!head || document.getElementById("eeShareBar")) return;
  var bar = document.createElement("div");
  bar.id = "eeShareBar";
  bar.innerHTML = '<button type="button" id="eeShareImg">画像で共有</button><button type="button" id="eeShareLink">リンクをコピー</button><span id="eeShareMsg" aria-live="polite"></span>';
  var style = document.createElement("style");
  style.textContent = "#eeShareBar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0 4px}#eeShareBar button{border:1px solid var(--cyan,#22d3ee);background:var(--raised,#172a40);color:var(--text,#e8f3ff);border-radius:11px;padding:9px 14px;font:inherit;font-size:13px;font-weight:700}#eeShareBar button:first-child{background:var(--cyan,#22d3ee);color:#05202a}#eeShareBar button[disabled]{opacity:.6}#eeShareMsg{font-size:12px;color:var(--sub,#91a7bf)}#eeSharePreview{position:fixed;inset:0;z-index:9999;background:rgba(2,6,23,.92);display:flex;flex-direction:column;align-items:center;gap:10px;padding:16px;overflow:auto}#eeSharePreview img{max-width:100%;border-radius:12px}#eeSharePreview p{color:#e2e8f0;font-size:13px;margin:0}#eeSharePreview button{border:0;border-radius:10px;padding:9px 18px;font-weight:700}";
  document.head.appendChild(style);
  head.appendChild(bar);
  var msg = document.getElementById("eeShareMsg");
  var landing = location.origin + cfg.landing;
  var shareText = "EagleEyeでプレイヤー比較｜キングショット " + landing;
  function say(t) { msg.textContent = t; if (t) setTimeout(function () { if (msg.textContent === t) msg.textContent = ""; }, 4000); }

  document.getElementById("eeShareLink").addEventListener("click", function () {
    var done = function () { say("リンクをコピーしました"); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(shareText).then(done, function () { prompt("コピーしてください", shareText); });
    else prompt("コピーしてください", shareText);
  });

  function ids() { return new URLSearchParams(location.search).getAll("governor_id").slice(0, 4); }
  function compact(n) { n = Number(n); if (!isFinite(n)) return "—"; var a = Math.abs(n); return a >= 1e9 ? (n / 1e9).toFixed(2) + "B" : a >= 1e6 ? (n / 1e6).toFixed(1) + "M" : a >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n); }
  function boardsOf(p) {
    var out = {}, map = { 21: "coliseum", 22: "forest_of_life", 23: "crystal_cave", 24: "knowledge_nexus", 25: "molten_fort", 26: "radiant_spire" };
    [p.rankings && p.rankings.leaderboards, p.profile && p.profile.leaderboards, p.player && p.player.leaderboards].forEach(function (list) {
      if (!Array.isArray(list)) return;
      list.forEach(function (b) {
        if (!b || typeof b !== "object") return;
        var raw = String(b.key != null ? b.key : b.board != null ? b.board : b.id != null ? b.id : b.name || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
        var key = map[Number(b.rank_type)] || raw.replace(/_/g, "") ;
        var hit = null;
        for (var i = 0; i < 6; i++) { var k = ["coliseum", "forest_of_life", "crystal_cave", "knowledge_nexus", "molten_fort", "radiant_spire"][i]; if (key === k || key === k.replace(/_/g, "")) hit = k; }
        if (!hit || out[hit]) return;
        var v = b.value != null ? b.value : b.score != null ? b.score : b.rank_value;
        var num = Number(v);
        if (v == null || v === "" || !isFinite(num)) return;
        var off = { coliseum: 10000, forest_of_life: 20000, crystal_cave: 30000, knowledge_nexus: 40000, molten_fort: 50000, radiant_spire: 60000 }[hit];
        var st = num > off ? num - off : num, n = Math.round(st);
        // ラベルが無い時は「章-ステージ」を計算（1章10ステージ、APIラベルと一致を確認済み）
        out[hit] = { v: num, label: b.value_label ? String(b.value_label) : (n >= 1 ? (Math.floor((n - 1) / 10) + 1) + "-" + ((n - 1) % 10 + 1) : null) };
      });
    });
    return out;
  }
  function loadImg(src) { return new Promise(function (ok) { if (!src) return ok(null); var im = new Image(); im.onload = function () { ok(im); }; im.onerror = function () { ok(null); }; im.src = src; }); }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function wrap(c, text, maxW, maxLines) {
    var lines = [], cur = "";
    Array.from(String(text)).forEach(function (ch) { if (c.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch; });
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + "…"; }
    return lines;
  }
  function badge(c, cx, cy, r, g) {
    c.save(); c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fillStyle = "rgb(222,178,78)"; c.fill(); c.lineWidth = r * .1; c.strokeStyle = "rgb(120,82,32)"; c.stroke();
    c.beginPath(); c.arc(cx, cy, r * .79, 0, Math.PI * 2); c.fillStyle = "rgb(176,128,48)"; c.fill();
    c.beginPath(); c.moveTo(cx, cy - r * .76); c.lineTo(cx + r * .76, cy); c.lineTo(cx, cy + r * .76); c.lineTo(cx - r * .76, cy); c.closePath(); c.fillStyle = "rgb(240,150,38)"; c.fill();
    c.beginPath(); c.moveTo(cx, cy - r * .76); c.lineTo(cx + r * .76, cy); c.lineTo(cx - r * .76, cy); c.closePath(); c.fillStyle = "rgb(252,196,80)"; c.fill();
    c.font = "900 " + Math.round(r * 1.15) + "px " + FONT; c.textAlign = "center"; c.textBaseline = "middle"; c.lineWidth = r * .17; c.strokeStyle = "rgb(90,52,14)"; c.strokeText(String(g), cx, cy + r * .05); c.fillStyle = "#fff"; c.fillText(String(g), cx, cy + r * .05); c.restore();
  }
  function tcText(l) { l = Number(l); if (!isFinite(l)) return null; if (l <= 30) return "Lv." + l; if (l < 35) return "Lv.30（" + (l - 30) + "/5）"; return null; }

  // 「1.2M」「#12」「3,456」「61-5」などを比べるための数字に。比べられないものは null。
  function scoreOf(t) {
    var s = String(t == null ? "" : t).trim().replace(/,/g, "").replace(/^Lv\.?\s*/i, "");
    var m = s.match(/^#?(-?\d+(?:\.\d+)?)\s*([KMB億万]?)(?:位)?$/);
    if (m) { var n = Number(m[1]); return n * ({ K: 1e3, M: 1e6, B: 1e9, "億": 1e8, "万": 1e4 }[m[2]] || 1); }
    var st = s.match(/^(\d+)-(\d+)$/); if (st) return Number(st[1]) * 100 + Number(st[2]);
    return null;
  }
  // 比較ページで「いま表示している」行（＝選んだ項目と表示中のグループ）＋追加ランキングで選んだ項目。
  // 上の基本4項目と、秘境の試練の章（上で描く）は重ねない。多すぎるとiPhoneで画像が作れないので100行まで。
  function pickedRows(d, hasMys) {
    var table = document.querySelector(".compare-table"); if (!table) return { rows: [], more: 0 };
    var all = d.players || [], keep = []; all.forEach(function (p, i) { if (!p.missing && p.player && keep.length < 4) keep.push(i); });
    var custom = {}; document.querySelectorAll("[data-ee-custom-board]").forEach(function (el) { custom[el.getAttribute("data-ee-custom-board")] = 1; });
    var skip = { "比較項目": 1, "戦力": 1, "役場レベル": 1, "役場": 1, "VIP": 1, "撃破数": 1, "王国": 1 };
    var stageNames = STAGES.map(function (s) { return "ランキング：" + s[1]; });
    var out = [], seen = {};
    table.querySelectorAll("tbody tr").forEach(function (tr) {
      var th = tr.querySelector("th"); var label = th ? th.textContent.replace(/\s+/g, " ").trim() : "";
      if (!label || skip[label] || seen[label]) return;
      if (tr.hidden && !custom[label]) return;
      if (hasMys && stageNames.some(function (n) { return label.indexOf(n) === 0; })) return;
      var tds = tr.querySelectorAll("td");
      var vals = keep.map(function (i) { var td = tds[i]; if (!td) return "—"; var v = td.querySelector(".value"); return ((v || td).textContent || "").replace(/\s+/g, " ").trim() || "—"; });
      if (vals.every(function (v) { return v === "—" || v === "データなし"; })) return;
      seen[label] = 1; out.push({ label: label, values: vals });
    });
    return { rows: out.slice(0, 100), more: Math.max(0, out.length - 100) };
  }
  window.__eeComparePicked = pickedRows;
  window.__eeCompareBuild = function (d) { return build(d); };

  async function build(d) {
    P = currentPalette();
    var ps = (d.players || []).filter(function (p) { return !p.missing && p.player; }).slice(0, 4);
    if (ps.length < 2) throw new Error("比較できるプレイヤーが2人以上必要です");
    var n = ps.length, W = 1080, PAD = 44, LBL = 190, colW = (W - PAD * 2 - LBL) / n;
    var mys = ps.map(boardsOf);
    var hasMys = STAGES.some(function (s) { return mys.some(function (m) { return m[s[0]]; }); });
    var rows = [
      ["戦力", ps.map(function (p) { return Number(p.player.power); }), function (v) { return compact(v); }, true],
      ["役場", ps.map(function (p) { return Number(p.player.town_center_level); }), null, false],
      ["VIP", ps.map(function (p) { return p.player.vip == null ? null : Number(p.player.vip); }), function (v) { return v == null ? "—" : String(v); }, true],
      ["撃破数", ps.map(function (p) { return Number(p.player.kills); }), function (v) { return compact(v); }, true]
    ];
    var picked = pickedRows(d, hasMys);
    var ROW = 74, GAP = 8, H = PAD + 70 + 250 + rows.length * (ROW + GAP) + (hasMys ? 50 + 6 * (ROW + GAP) + 600 : 0) + (picked.rows.length ? 60 + picked.rows.length * (ROW + GAP) + (picked.more ? 40 : 0) : 0) + 230;
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var c = cv.getContext("2d");
    var bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, P.panel); bg.addColorStop(1, P.bg); c.fillStyle = bg; c.fillRect(0, 0, W, H);
    var glow = c.createRadialGradient(W * .85, 0, 0, W * .85, 0, W * .5); glow.addColorStop(0, alpha(P.accent, .18)); glow.addColorStop(1, alpha(P.accent, 0)); c.fillStyle = glow; c.fillRect(0, 0, W, H);
    c.textBaseline = "alphabetic"; c.fillStyle = P.text; c.font = "900 40px " + FONT; c.textAlign = "left"; c.fillText("プレイヤー比較", PAD, PAD + 40);
    c.fillStyle = P.accent; c.font = "700 22px " + FONT; c.textAlign = "right"; c.fillText("キングショット", W - PAD, PAD + 36);
    var y = PAD + 70;
    var avatars = await Promise.all(ps.map(function (p) { return loadImg(p.player.avatar_url ? cfg.avatar + encodeURIComponent(p.player.avatar_url) : null); }));
    ps.forEach(function (p, i) {
      var cx = PAD + LBL + colW * i + colW / 2;
      c.save(); rr(c, cx - 55, y, 110, 110, 24); c.fillStyle = P.raised; c.fill(); if (avatars[i]) { c.clip(); c.drawImage(avatars[i], cx - 55, y, 110, 110); } c.restore();
      c.save(); rr(c, cx - 55, y, 110, 110, 24); c.lineWidth = 3; c.strokeStyle = COLORS[i]; c.stroke(); c.restore();
      c.textAlign = "center"; c.fillStyle = P.text; c.font = "800 25px " + FONT;
      var lines = wrap(c, p.player.nick_name || ("ID " + p.governor_id), colW - 12, 2);
      lines.forEach(function (t, k) { c.fillText(t, cx, y + 145 + k * 31); });
      c.fillStyle = P.subtext; c.font = "700 20px " + FONT;
      c.fillText("王国" + (p.player.kid != null ? p.player.kid : "—") + (p.player.alliance_abbr ? "・" + p.player.alliance_abbr : ""), cx, y + 145 + lines.length * 31 + 2);
    });
    y += 250;
    function drawRow(label, vals, fmt, higher, labels) {
      c.textAlign = "left"; c.fillStyle = P.subtext; c.font = "700 24px " + FONT; c.textBaseline = "middle"; c.fillText(label, PAD + 8, y + ROW / 2);
      var ok = vals.filter(function (v) { return v != null && isFinite(v); });
      var best = higher && ok.length ? Math.max.apply(null, ok) : null;
      var unique = best != null && ok.filter(function (v) { return v === best; }).length === 1;
      vals.forEach(function (v, i) {
        var x = PAD + LBL + colW * i, isBest = unique && v === best;
        c.save(); rr(c, x + 3, y, colW - 6, ROW, 14); c.fillStyle = P.raised; c.fill(); if (isBest) { c.fillStyle = alpha(P.accent, .3); c.fill(); c.lineWidth = 2.5; c.strokeStyle = P.accent; c.stroke(); } c.restore();
        var cx = x + colW / 2;
        if (fmt === null) { var t = tcText(v); if (t || !isFinite(v)) { c.fillStyle = P.text; c.font = "800 28px " + FONT; c.textAlign = "center"; c.fillText(t || "—", cx, y + ROW / 2); } else { var g = Math.floor((v - 35) / 5) + 1, st = (v - 35) % 5; badge(c, st ? cx - 34 : cx, y + ROW / 2, 24, g); if (st) { for (var k = 0; k < 5; k++) { c.fillStyle = k < st ? "rgb(250,214,60)" : "rgba(150,130,100,.5)"; c.fillRect(cx - 4 + k * 10, y + ROW / 2 - 6, 8, 12); } } } return; }
        c.fillStyle = P.text; c.font = "800 30px " + FONT; c.textAlign = "center";
        c.fillText(labels && labels[i] ? labels[i] : fmt(v), cx, y + ROW / 2);
      });
      c.textBaseline = "alphabetic"; y += ROW + GAP;
    }
    // 文字のまま並べる行（比較ページで選んだ項目）。数字として比べられるときだけトップを光らせる。
    function drawTextRow(label, texts) {
      c.textBaseline = "middle"; c.textAlign = "left"; c.fillStyle = P.subtext;
      var ll = wrap(c, label, LBL - 14, 2); c.font = "700 " + (ll.length > 1 || label.length > 7 ? 19 : 24) + "px " + FONT; ll = wrap(c, label, LBL - 14, 2);
      ll.forEach(function (t, k) { c.fillText(t, PAD + 8, y + ROW / 2 + (k - (ll.length - 1) / 2) * 23); });
      var nums = texts.map(scoreOf), ok = nums.filter(function (v) { return v != null; });
      var isRank = texts.some(function (t) { return /^#|位$/.test(String(t || "").trim()); });
      var best = ok.length >= 2 ? (isRank ? Math.min.apply(null, ok) : Math.max.apply(null, ok)) : null;
      var unique = best != null && ok.filter(function (v) { return v === best; }).length === 1;
      texts.forEach(function (t, i) {
        var x = PAD + LBL + colW * i, isBest = unique && nums[i] === best;
        c.save(); rr(c, x + 3, y, colW - 6, ROW, 14); c.fillStyle = P.raised; c.fill(); if (isBest) { c.fillStyle = alpha(P.accent, .3); c.fill(); c.lineWidth = 2.5; c.strokeStyle = P.accent; c.stroke(); } c.restore();
        c.fillStyle = P.text; c.textAlign = "center"; c.font = "800 26px " + FONT;
        var lines = wrap(c, t || "—", colW - 20, 2); if (lines.length > 1) { c.font = "800 21px " + FONT; lines = wrap(c, t || "—", colW - 20, 2); }
        lines.forEach(function (line, k) { c.fillText(line, x + colW / 2, y + ROW / 2 + (k - (lines.length - 1) / 2) * 25); });
      });
      c.textBaseline = "alphabetic"; y += ROW + GAP;
    }
    rows.forEach(function (r) { drawRow(r[0], r[1], r[2], r[3]); });
    if (hasMys) {
      y += 14; c.textAlign = "left"; c.fillStyle = "rgb(253,230,138)"; c.font = "800 24px " + FONT; c.fillText("秘境の試練（最高クリアステージ）", PAD + 8, y + 22); y += 36;
      STAGES.forEach(function (s) {
        drawRow(s[1], mys.map(function (m) { return m[s[0]] ? m[s[0]].v : null; }), function (v) { return v == null ? "—" : String(Math.round(v)); }, true, mys.map(function (m) { return m[s[0]] ? (m[s[0]].label || null) : null; }));
      });
      // radar
      y += 14; c.save(); rr(c, PAD, y, W - PAD * 2, 560, 20); c.fillStyle = alpha(P.raised, .6); c.fill(); c.strokeStyle = P.border; c.lineWidth = 1.5; c.stroke(); c.restore();
      var cx0 = PAD + 300, cy0 = y + 280, R = 190;
      var maxes = STAGES.map(function (s) { return Math.max.apply(null, [1].concat(mys.map(function (m) { return m[s[0]] ? m[s[0]].v : 0; }))); });
      var mins = STAGES.map(function (s) { var v = mys.map(function (m) { return m[s[0]] ? m[s[0]].v : null; }).filter(function (x) { return x != null; }); return v.length ? Math.min.apply(null, v) : 0; });
      var pt = function (i, r) { var a = -Math.PI / 2 + i * Math.PI / 3; return [cx0 + r * Math.cos(a), cy0 + r * Math.sin(a)]; };
      c.strokeStyle = P.border; c.lineWidth = 2;
      [.25, .5, .75, 1].forEach(function (f) { c.beginPath(); for (var i = 0; i < 6; i++) { var q = pt(i, R * f); i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); } c.closePath(); c.stroke(); });
      c.font = "700 24px " + FONT; c.fillStyle = P.subtext; c.textAlign = "center"; c.textBaseline = "middle";
      for (var i = 0; i < 6; i++) { var e = pt(i, R); c.beginPath(); c.moveTo(cx0, cy0); c.lineTo(e[0], e[1]); c.stroke(); var lp = pt(i, R + 44); c.fillText(STAGES[i][1], lp[0], lp[1]); }
      mys.forEach(function (m, j) {
        // 比べた中の最低を内側20%、最高を外周に（差が見えやすいように）
        var pts = STAGES.map(function (s, i) { var v = m[s[0]] ? m[s[0]].v : null; if (v == null) return pt(i, 0); var span = maxes[i] - mins[i]; var f = span > 0 ? .2 + .8 * (v - mins[i]) / span : 1; return pt(i, R * f); });
        c.beginPath(); pts.forEach(function (q, k) { k ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); }); c.closePath();
        c.fillStyle = COLORS[j].replace("rgb", "rgba").replace(")", ",.16)"); c.fill(); c.lineWidth = 4; c.strokeStyle = COLORS[j]; c.stroke();
        pts.forEach(function (q) { c.beginPath(); c.arc(q[0], q[1], 6, 0, Math.PI * 2); c.fillStyle = COLORS[j]; c.fill(); });
      });
      c.textAlign = "left"; c.textBaseline = "alphabetic"; var lx = PAD + 610, ly = y + 150;
      c.fillStyle = "rgb(253,230,138)"; c.font = "800 26px " + FONT; c.fillText("秘境の試練バランス", lx, ly);
      ps.forEach(function (p, j) { var yy = ly + 46 + j * 44; c.fillStyle = COLORS[j]; c.fillRect(lx, yy - 12, 28, 10); c.fillStyle = P.text; c.font = "700 23px " + FONT; c.fillText(wrap(c, p.player.nick_name || p.governor_id, W - PAD - lx - 44, 1)[0], lx + 40, yy - 2); });
      c.fillStyle = P.subtext; c.font = "500 18px " + FONT; wrap(c, "比べた中の最高を外周、最低を内側にしています", W - PAD - lx - 10, 3).forEach(function (t, k) { c.fillText(t, lx, ly + 66 + ps.length * 44 + k * 26); });
      y += 560;
    }
    if (picked.rows.length) {
      y += 14; c.textAlign = "left"; c.fillStyle = "rgb(253,230,138)"; c.font = "800 24px " + FONT; c.fillText("選んだ比較項目", PAD + 8, y + 22); y += 46;
      picked.rows.forEach(function (r) { drawTextRow(r.label, r.values); });
      if (picked.more) { c.textAlign = "left"; c.fillStyle = P.subtext; c.font = "600 20px " + FONT; c.fillText("ほか " + picked.more + " 項目はページで見られます", PAD + 8, y + 24); y += 40; }
    }
    y += 26; c.strokeStyle = P.border; c.lineWidth = 1.5; c.beginPath(); c.moveTo(PAD, y); c.lineTo(W - PAD, y); c.stroke(); y += 22;
    var imgs = await Promise.all([loadImg(cfg.bj), loadImg(cfg.qr)]);
    if (imgs[0]) c.drawImage(imgs[0], PAD, y, 130, 130 * imgs[0].height / imgs[0].width);
    c.textAlign = "left"; c.fillStyle = P.text; c.font = "900 36px " + FONT; c.fillText("EagleEye", PAD + 150, y + 48);
    c.fillStyle = P.accent; c.font = "700 24px " + FONT; c.fillText(location.host, PAD + 150, y + 84);
    var at = ps.map(function (p) { return Number(p.player.observed_at) || 0; }).filter(Boolean);
    var when = at.length ? new Date(Math.min.apply(null, at) * 1000) : new Date();
    var pad2 = function (v) { return (v < 10 ? "0" : "") + v; };
    c.fillStyle = P.subtext; c.font = "500 19px " + FONT;
    c.fillText(when.getFullYear() + "/" + pad2(when.getMonth() + 1) + "/" + pad2(when.getDate()) + " " + pad2(when.getHours()) + ":" + pad2(when.getMinutes()) + " 取得・明るい枠はその項目のトップ", PAD + 150, y + 118);
    if (imgs[1]) { c.fillStyle = "#fff"; rr(c, W - PAD - 150, y - 6, 150, 150, 12); c.fill(); c.drawImage(imgs[1], W - PAD - 140, y + 4, 130, 130); }
    return cv;
  }

  function preview(blob) {
    var url = URL.createObjectURL(blob), box = document.createElement("div");
    box.id = "eeSharePreview";
    box.innerHTML = '<p>画像を長押しして保存・共有できます</p><img alt="プレイヤー比較の画像"><button type="button">閉じる</button>';
    box.querySelector("img").src = url;
    box.querySelector("button").onclick = function () { box.remove(); URL.revokeObjectURL(url); };
    document.body.appendChild(box);
  }

  document.getElementById("eeShareImg").addEventListener("click", async function () {
    var btn = this; btn.disabled = true; say("画像を作成中…");
    try {
      var list = ids();
      if (list.length < 2) throw new Error("2人以上を選んでください");
      var q = new URLSearchParams(); list.forEach(function (id) { q.append("governor_id", id); });
      var r = await fetch("/api/player-compare?" + q.toString(), { credentials: "same-origin", cache: "no-store" });
      var d = await r.json();
      if (!r.ok || !d.ok) throw new Error("比較データを読み込めませんでした");
      var cv = await build(d);
      var blob = await new Promise(function (ok) { cv.toBlob(ok, "image/png"); });
      if (!blob) throw new Error("画像を作れませんでした");
      var file = new File([blob], "eagleeye-compare.png", { type: "image/png" });
      try { fetch("/api/milestones/share", { method: "POST", credentials: "same-origin" }).catch(function () {}); } catch (e) {}
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        say("");
        try { await navigator.share({ files: [file], text: shareText }); } catch (e) { if (e && e.name !== "AbortError") preview(blob); }
      } else { say(""); preview(blob); }
    } catch (e) { say(e && e.message ? e.message : "画像を作れませんでした"); }
    finally { btn.disabled = false; }
  });
}

export function compareShareScript() {
  const cfg = { landing: SHARE_LANDING_PATH, avatar: "/api/avatar?u=", bj: "/assets/eagleeye/bjnyan/poses/common.webp", qr: "/assets/eagleeye/qr-share.svg", palettes: shareCardPalettes() };
  return `<script>var __name=function(f){return f};(${compareShareClient.toString()})(${JSON.stringify(cfg)});</script>`;
}
