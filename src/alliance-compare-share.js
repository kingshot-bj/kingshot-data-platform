import { shareCardPalettes } from "./themes.js";
import { topByPower, rankTopPlayersByStage, MYSTIC_COMPARE_BOARDS, MYSTIC_TOP } from "./alliance-compare.js";
// 同盟比較を画像（カード）で共有する。画像はスマホの中で canvas で作るので、サーバー・D1の負担は増えない。
// ・同盟ごとの見出し（タグ・王国・勝ち数）、項目ごとに良い方を光らせて👑
// ・秘境の試練：各同盟の戦力上位3人を集めて、ステージごとにいちばん進んでいる人
// ・BJにゃん・EagleEye・QR・メンバー表の日付
// ・ログイン中なら共有するURLに本人の招待コード（?ref=）を付ける（/api/invite。未ログインなら付けない）

export const ALLIANCE_SHARE_METRICS = Object.freeze([
  // [キー, 表示名, 書式, 大きい方が良いか]
  ["power", "同盟総戦力", "big", true],
  ["power_rank", "王国内順位", "rank", false],
  ["members", "メンバー数", "int", true],
  ["top_sum", "上位3人の合計", "big", true],
  ["top_avg", "上位3人の平均", "big", true]
]);

const stageLabel = (v, off) => { const x = Math.round(Number(v) - off); return Number.isFinite(x) && x >= 1 ? (Math.floor((x - 1) / 10) + 1) + "-" + ((x - 1) % 10 + 1) : null; };

// 画像に使うデータ（サーバーで作ってページに埋め込む）。
export function allianceShareData(alliances, dateText = "") {
  const list = (alliances || []).slice(0, 4);
  const items = list.map(a => {
    const top = topByPower(a.members, MYSTIC_TOP);
    const sum = top.length ? top.reduce((s, m) => s + Number(m.power), 0) : null;
    return { abbr: String(a.abbr || a.tag || ""), kid: a.kid, v: { power: a.power ?? null, power_rank: a.power_rank ?? null, members: (a.members || []).length || null, top_sum: sum, top_avg: sum == null ? null : sum / top.length } };
  });
  const mystic = list.some(a => a.mystic) ? MYSTIC_COMPARE_BOARDS.map(([key, label, off]) => {
    const lead = rankTopPlayersByStage(list, key)[0];
    if (!lead || lead.score == null) return { label, ai: null, name: "", value: "" };
    return { label, ai: lead.ai, name: String(lead.name || ""), value: off ? (stageLabel(lead.score, off) || "") : Number(lead.score).toLocaleString("ja-JP") };
  }) : [];
  return { date: dateText, alliances: items, mystic };
}

export function allianceShareClient(cfg) {
  var dataEl = document.getElementById("acShareData");
  var host = document.getElementById("acShare");
  if (!dataEl || !host) return;
  var data; try { data = JSON.parse(dataEl.textContent); } catch (e) { return; }
  var ks = (data.alliances || []).slice(0, 4);
  if (ks.length < 2) return;
  var FONT = '-apple-system,"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif';
  var PALS = cfg.palettes || {};
  function currentPalette() { var id = document.documentElement.getAttribute("data-ee-skin") || "navy"; return PALS[id] || PALS.navy || { bg: "#0b1424", panel: "#0f1f36", raised: "#13263d", border: "#1d344d", text: "#e8f3ff", subtext: "#91a7bf", accent: "#22d3ee" }; }
  var P = currentPalette();
  function alpha(hex, a) { var n = parseInt(String(hex).slice(1), 16); return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; }
  var COLORS = [P.accent, "rgb(251,191,36)", "rgb(244,114,182)", "rgb(163,230,53)"];
  host.innerHTML = '<button type="button" id="acImg">📤 画像で共有</button><button type="button" id="acLink">リンクをコピー</button><span id="acMsg" aria-live="polite"></span>';
  var msg = document.getElementById("acMsg");
  function say(t) { msg.textContent = t; if (t) setTimeout(function () { if (msg.textContent === t) msg.textContent = ""; }, 4000); }
  var refPromise = null;
  function shareUrl() {
    if (!refPromise) refPromise = fetch("/api/invite", { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var m = d && d.ok && String(d.link || "").match(/[?&]ref=([a-z0-9]{8})/); return m ? m[1] : null;
    }).catch(function () { return null; });
    return refPromise.then(function (ref) { var u = new URL(location.href); if (ref) u.searchParams.set("ref", ref); return u.toString(); });
  }
  var title = ks.map(function (k) { return k.abbr + "（王国" + k.kid + "）"; }).join(" vs ");
  document.getElementById("acLink").addEventListener("click", function () {
    shareUrl().then(function (u) {
      var text = title + "｜EagleEyeで同盟比較 " + u;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { say("リンクをコピーしました"); }, function () { prompt("コピーしてください", text); });
      else prompt("コピーしてください", text);
    });
  });
  function fmt(v, f) {
    var n = Number(v); if (v == null || !isFinite(n)) return "—";
    if (f === "rank") return n.toLocaleString("ja-JP") + "位";
    if (f === "big") { var a = Math.abs(n); return a >= 1e8 ? (n / 1e8).toFixed(a >= 1e10 ? 0 : 1) + "億" : a >= 1e4 ? Math.round(n / 1e4).toLocaleString("ja-JP") + "万" : n.toLocaleString("ja-JP"); }
    return Math.round(n).toLocaleString("ja-JP") + (f === "int" ? "人" : "");
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function loadImg(src) { return new Promise(function (ok) { var im = new Image(); im.onload = function () { ok(im); }; im.onerror = function () { ok(null); }; im.src = src; }); }
  function clip(c, t, w) { t = String(t); if (c.measureText(t).width <= w) return t; while (t.length > 1 && c.measureText(t + "…").width > w) t = t.slice(0, -1); return t + "…"; }

  async function build() {
    P = currentPalette(); COLORS[0] = P.accent;
    var n = ks.length, W = 1080, PAD = 48, LBL = 230, colW = (W - PAD * 2 - LBL) / n;
    var rows = cfg.metrics.filter(function (m) { return ks.some(function (k) { return k.v[m[0]] != null; }); });
    var wins = ks.map(function () { return 0; });
    var bests = rows.map(function (m) {
      var vals = ks.map(function (k) { var v = k.v[m[0]]; return v == null ? null : Number(v); });
      var ok = vals.filter(function (v) { return v != null && isFinite(v); });
      if (ok.length < 2) return null;
      var b = m[3] ? Math.max.apply(null, ok) : Math.min.apply(null, ok);
      if (ok.filter(function (v) { return v === b; }).length !== 1) return null;
      var idx = vals.indexOf(b); wins[idx]++; return idx;
    });
    var MY = (data.mystic || []).filter(function (s) { return s.ai != null; });
    MY.forEach(function (s) { if (s.ai < wins.length) wins[s.ai]++; });
    var ROW = 84, GAP = 10, MROW = 66;
    var H = PAD + 60 + 200 + rows.length * (ROW + GAP) + (MY.length ? 90 + MY.length * (MROW + 8) : 0) + 110 + 220;
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var c = cv.getContext("2d");
    var bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, P.panel); bg.addColorStop(1, P.bg); c.fillStyle = bg; c.fillRect(0, 0, W, H);
    var glow = c.createRadialGradient(W * .5, 120, 0, W * .5, 120, W * .6); glow.addColorStop(0, "rgba(250,204,21,.14)"); glow.addColorStop(1, "rgba(250,204,21,0)"); c.fillStyle = glow; c.fillRect(0, 0, W, H);
    c.textBaseline = "alphabetic"; c.textAlign = "left"; c.fillStyle = P.accent; c.font = "800 26px " + FONT; c.fillText("キングショット 同盟比較", PAD, PAD + 30);
    if (P.reward) { c.textAlign = "right"; c.fillStyle = P.accent; c.font = "900 22px " + FONT; c.fillText("👑 " + (P.name || "") + " EDITION", W - PAD, PAD + 30); c.textAlign = "left"; }
    var y = PAD + 60;
    var topWins = Math.max.apply(null, wins), champ = wins.filter(function (w) { return w === topWins; }).length === 1 ? wins.indexOf(topWins) : -1;
    ks.forEach(function (k, i) {
      var cx = PAD + LBL + colW * i + colW / 2;
      c.save(); rr(c, cx - colW / 2 + 6, y, colW - 12, 170, 22); c.fillStyle = P.raised; c.fill(); c.lineWidth = 4; c.strokeStyle = COLORS[i]; c.stroke(); c.restore();
      c.textAlign = "center"; c.fillStyle = P.subtext; c.font = "700 24px " + FONT; c.fillText("王国" + k.kid, cx, y + 46);
      c.fillStyle = P.text; c.font = "900 " + (n > 3 ? 44 : 56) + "px " + FONT; c.fillText(clip(c, k.abbr, colW - 40), cx, y + 110);
      c.fillStyle = i === champ ? "rgb(253,230,138)" : P.subtext; c.font = "800 24px " + FONT; c.fillText((i === champ ? "👑 " : "") + wins[i] + "勝", cx, y + 152);
    });
    if (n === 2) { var vx = PAD + LBL + colW, vy = y + 85; c.beginPath(); c.arc(vx, vy, 34, 0, Math.PI * 2); c.fillStyle = P.bg; c.fill(); c.lineWidth = 3; c.strokeStyle = "rgb(250,204,21)"; c.stroke(); c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "rgb(250,204,21)"; c.font = "900 28px " + FONT; c.fillText("VS", vx, vy + 1); c.textBaseline = "alphabetic"; }
    y += 200;
    rows.forEach(function (m, r) {
      c.textAlign = "left"; c.textBaseline = "middle"; c.fillStyle = P.subtext; c.font = "700 26px " + FONT; c.fillText(m[1], PAD + 6, y + ROW / 2);
      ks.forEach(function (k, i) {
        var x = PAD + LBL + colW * i, isBest = bests[r] === i;
        c.save(); rr(c, x + 6, y, colW - 12, ROW, 16); c.fillStyle = P.raised; c.fill(); if (isBest) { c.fillStyle = alpha(P.accent, .3); c.fill(); c.lineWidth = 3; c.strokeStyle = P.accent; c.stroke(); } c.restore();
        c.textAlign = "center"; c.fillStyle = P.text; c.font = "800 " + (n > 3 ? 26 : 32) + "px " + FONT;
        c.fillText((isBest ? "👑 " : "") + fmt(k.v[m[0]], m[2]), x + colW / 2, y + ROW / 2);
      });
      c.textBaseline = "alphabetic"; y += ROW + GAP;
    });
    if (MY.length) {
      y += 24; c.textAlign = "left"; c.fillStyle = "rgb(253,230,138)"; c.font = "800 28px " + FONT; c.fillText("秘境の試練（各同盟の上位3人でいちばん進んでいる人）", PAD + 6, y + 30); y += 66;
      MY.forEach(function (s) {
        c.save(); rr(c, PAD, y, W - PAD * 2, MROW, 14); c.fillStyle = P.raised; c.fill(); c.fillStyle = COLORS[s.ai % 4]; rr(c, PAD, y, 10, MROW, 5); c.fill(); c.restore();
        c.textBaseline = "middle"; c.textAlign = "left"; c.fillStyle = P.subtext; c.font = "700 24px " + FONT; c.fillText(s.label, PAD + 26, y + MROW / 2);
        c.fillStyle = P.text; c.font = "800 26px " + FONT; c.fillText(clip(c, s.name + "（" + (ks[s.ai] ? ks[s.ai].abbr : "") + "）", 400), PAD + 300, y + MROW / 2);
        c.textAlign = "right"; c.fillStyle = COLORS[s.ai % 4]; c.font = "900 32px " + FONT; c.fillText(s.value, W - PAD - 24, y + MROW / 2);
        c.textBaseline = "alphabetic"; y += MROW + 8;
      });
    }
    y += 20; c.textAlign = "left"; c.fillStyle = P.subtext; c.font = "500 21px " + FONT;
    c.fillText("👑 = その項目でいちばん良い同盟　メンバー表：" + (data.date || ""), PAD + 6, y + 24);
    y += 70; c.strokeStyle = P.border; c.lineWidth = 1.5; c.beginPath(); c.moveTo(PAD, y); c.lineTo(W - PAD, y); c.stroke(); y += 24;
    var imgs = await Promise.all([loadImg(cfg.bj), loadImg(cfg.qr)]);
    if (imgs[0]) c.drawImage(imgs[0], PAD, y, 130, 130 * imgs[0].height / imgs[0].width);
    c.textAlign = "left"; c.fillStyle = P.text; c.font = "900 38px " + FONT; c.fillText("EagleEye", PAD + 150, y + 50);
    c.fillStyle = P.accent; c.font = "700 25px " + FONT; c.fillText(location.host, PAD + 150, y + 88);
    c.fillStyle = P.subtext; c.font = "500 20px " + FONT; c.fillText("聖剣争奪の相手と比べてみよう", PAD + 150, y + 122);
    if (imgs[1]) { c.fillStyle = "#fff"; rr(c, W - PAD - 150, y - 6, 150, 150, 12); c.fill(); c.drawImage(imgs[1], W - PAD - 140, y + 4, 130, 130); }
    return cv;
  }

  function preview(blob) {
    var url = URL.createObjectURL(blob), box = document.createElement("div");
    box.id = "acPreview";
    box.innerHTML = '<p>画像を長押しして保存・共有できます</p><img alt="同盟比較の画像"><button type="button">閉じる</button>';
    box.querySelector("img").src = url;
    box.querySelector("button").onclick = function () { box.remove(); URL.revokeObjectURL(url); };
    document.body.appendChild(box);
  }
  window.__acBuild = build;
  document.getElementById("acImg").addEventListener("click", async function () {
    var btn = this; btn.disabled = true; say("画像を作成中…");
    try {
      var cv = await build();
      var blob = await new Promise(function (ok) { cv.toBlob(ok, "image/png"); });
      if (!blob) throw new Error("画像を作れませんでした");
      var file = new File([blob], "eagleeye-alliances.png", { type: "image/png" });
      var u = await shareUrl();
      try { fetch("/api/milestones/share", { method: "POST", credentials: "same-origin" }).catch(function () {}); } catch (e) {}
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        say("");
        try { await navigator.share({ files: [file], text: title + "｜EagleEyeで同盟比較 " + u }); } catch (e) { if (e && e.name !== "AbortError") preview(blob); }
      } else { say(""); preview(blob); }
    } catch (e) { say(e && e.message ? e.message : "画像を作れませんでした"); }
    finally { btn.disabled = false; }
  });
}

export const ALLIANCE_SHARE_CSS = "#acShare{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:12px 0}#acShare button{border:1px solid var(--ee-cyan,#22d3ee)!important;background:var(--ee-panel-raised,#172a40)!important;color:var(--ee-text,#e8f3ff)!important;border-radius:11px;padding:10px 14px;font:inherit;font-size:14px;font-weight:800}#acShare button:first-child{background:var(--ee-cyan,#22d3ee)!important;color:#05202a!important}#acShare button[disabled]{opacity:.6}#acMsg{font-size:12px;color:var(--ee-subtext,#91a7bf)}#acPreview{position:fixed;inset:0;z-index:9999;background:rgba(2,6,23,.92);display:flex;flex-direction:column;align-items:center;gap:10px;padding:16px;overflow:auto}#acPreview img{max-width:100%;border-radius:12px}#acPreview p{color:#e2e8f0;font-size:13px;margin:0}#acPreview button{border:0;border-radius:10px;padding:9px 18px;font-weight:700}";

// 同盟比較ページに埋め込む部分（データ・ボタンの置き場所・スクリプト）。
export function allianceShareEmbed(alliances, dateText) {
  const json = JSON.stringify(allianceShareData(alliances, dateText)).replace(/</g, "\\u003c");
  const cfg = JSON.stringify({ palettes: shareCardPalettes(), metrics: ALLIANCE_SHARE_METRICS, bj: "/assets/eagleeye/bjnyan/poses/common.webp", qr: "/assets/eagleeye/qr-share.svg" }).replace(/</g, "\\u003c");
  return "<div id='acShare'></div><style>" + ALLIANCE_SHARE_CSS + "</style><script type='application/json' id='acShareData'>" + json + "</script>" +
    "<script>var __name=function(f){return f};(" + allianceShareClient.toString() + ")(" + cfg + ");</script>";
}
