import { shareCardPalettes } from "./themes.js";
// 同盟のページを1枚の画像（同盟カード）にして共有する（2026-11-19）。画像は端末内の canvas で作るので、サーバー・D1 の負担は増えない。
// ・同盟名・タグ・王国・同盟戦力（王国内の順位）・メンバー数・平均戦力・役職の内訳・戦力 TOP10（VIP は見られる人だけ）・データの日付・BJにゃん・QR
// ・ログイン中なら共有する URL に本人の招待コード（?ref=）を付ける
const num = v => v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);

// 同盟のページの値 → カードのデータ。members は normalizeAllianceMember の形（name・power・role・roleLabel・id）。
export function allianceShareData({ kid, tag, name, power, powerRank, memberCount, members = [], vips = null, date = "" } = {}) {
  const ms = (members || []).filter(m => m && m.name);
  const known = ms.filter(m => num(m.power) != null);
  const total = known.reduce((s, m) => s + Number(m.power), 0);
  const roles = [5, 4, 3, 2, 1].map(r => [r, ms.filter(m => Number(m.role) === r).length]).filter(([, n]) => n > 0);
  const top = known.slice().sort((a, b) => Number(b.power) - Number(a.power)).slice(0, 10).map(m => ({
    name: String(m.name).slice(0, 24), power: Number(m.power), role: Number(m.role) >= 1 && Number(m.role) <= 5 ? "R" + Number(m.role) : "",
    vip: vips && vips.get(String(m.id)) ? vips.get(String(m.id)).vip : null
  }));
  return {
    kid: num(kid), tag: String(tag || "").slice(0, 24), name: String(name || "").slice(0, 40),
    power: num(power), powerRank: num(powerRank), memberCount: num(memberCount) ?? ms.length,
    avg: known.length ? Math.round(total / known.length) : null, roles, top, showVip: Boolean(vips), date: String(date || "")
  };
}

// ---- client (toString で埋め込む。外の変数を参照しない) ----
export function allianceShareClient(cfg) {
  var dataEl = document.getElementById("ashData");
  var host = document.getElementById("ashShare");
  if (!dataEl || !host) return;
  var d; try { d = JSON.parse(dataEl.textContent); } catch (e) { return; }
  if (!d || !d.tag) return;
  var FONT = '-apple-system,"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif';
  var PALS = cfg.palettes || {};
  function currentPalette() { var id = document.documentElement.getAttribute("data-ee-skin") || "navy"; return PALS[id] || PALS.navy || { bg: "#0b1424", panel: "#0f1f36", raised: "#13263d", border: "#1d344d", text: "#e8f3ff", subtext: "#91a7bf", accent: "#22d3ee" }; }
  var P = currentPalette();
  host.innerHTML = '<button type="button" id="ashImg">📤 画像で共有</button><button type="button" id="ashLink">リンクをコピー</button><span id="ashMsg"></span>';
  var msg = document.getElementById("ashMsg");
  function say(t) { msg.textContent = t; if (t) setTimeout(function () { if (msg.textContent === t) msg.textContent = ""; }, 4000); }
  var refPromise = null;
  function shareUrl() {
    if (!refPromise) refPromise = fetch("/api/invite", { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (x) {
      var m = x && x.ok && String(x.link || "").match(/[?&]ref=([a-z0-9]{8})/); return m ? m[1] : null;
    }).catch(function () { return null; });
    return refPromise.then(function (ref) {
      var u = new URL("/alliance", location.origin);
      u.searchParams.set("kid", String(d.kid)); u.searchParams.set("tag", d.tag);
      if (ref) u.searchParams.set("ref", ref);
      return u.toString();
    });
  }
  var title = "[" + d.tag + "] " + (d.name || d.tag) + "（王国" + d.kid + "）";
  document.getElementById("ashLink").addEventListener("click", function () {
    shareUrl().then(function (u) {
      var text = title + "｜EagleEyeで同盟チェック " + u;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { say("リンクをコピーしました"); }, function () { prompt("コピーしてください", text); });
      else prompt("コピーしてください", text);
    });
  });
  function big(v) { var n = Number(v); if (v == null || !isFinite(n)) return "—"; var a = Math.abs(n); return a >= 1e8 ? (n / 1e8).toFixed(a >= 1e10 ? 0 : 1) + "億" : a >= 1e4 ? Math.round(n / 1e4).toLocaleString("ja-JP") + "万" : n.toLocaleString("ja-JP"); }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function loadImg(src) { return new Promise(function (ok) { if (!src) return ok(null); var im = new Image(); im.onload = function () { ok(im); }; im.onerror = function () { ok(null); }; im.src = src; }); }
  function fit(c, text, maxW, size, weight) { var s = size; c.font = weight + " " + s + "px " + FONT; while (s > 20 && c.measureText(text).width > maxW) { s -= 2; c.font = weight + " " + s + "px " + FONT; } return s; }

  async function build() {
    P = currentPalette();
    var W = 1080, PAD = 48, top = d.top || [];
    var H = PAD + 60 + 200 + 250 + (d.roles && d.roles.length ? 90 : 0) + (top.length ? 70 + top.length * 66 + 20 : 0) + 70 + 200;
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var c = cv.getContext("2d");
    var bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, P.panel); bg.addColorStop(1, P.bg); c.fillStyle = bg; c.fillRect(0, 0, W, H);
    var glow = c.createRadialGradient(W * .3, 160, 0, W * .3, 160, W * .7); glow.addColorStop(0, "rgba(250,204,21,.16)"); glow.addColorStop(1, "rgba(250,204,21,0)"); c.fillStyle = glow; c.fillRect(0, 0, W, H);
    c.textBaseline = "alphabetic"; c.textAlign = "left"; c.fillStyle = P.accent; c.font = "800 26px " + FONT; c.fillText("キングショット 同盟カード", PAD, PAD + 30);
    if (P.reward) { c.textAlign = "right"; c.font = "900 22px " + FONT; c.fillText("👑 " + (P.name || "") + " EDITION", W - PAD, PAD + 30); c.textAlign = "left"; }
    var y = PAD + 60;
    // 同盟名の帯
    c.save(); rr(c, PAD, y, W - PAD * 2, 170, 26); c.fillStyle = P.raised; c.fill(); c.lineWidth = 3; c.strokeStyle = alpha(P.accent, .7); c.stroke(); c.restore();
    c.fillStyle = "rgb(250,204,21)"; fit(c, "[" + d.tag + "]", W - PAD * 2 - 60, 40, "900"); c.fillText("[" + d.tag + "]", PAD + 30, y + 58);
    c.fillStyle = P.text; fit(c, d.name || d.tag, W - PAD * 2 - 60, 58, "900"); c.fillText(d.name || d.tag, PAD + 30, y + 118);
    c.fillStyle = P.accent; c.font = "800 26px " + FONT; c.fillText("王国 " + d.kid, PAD + 30, y + 154);
    y += 200;
    var tiles = [["同盟戦力", big(d.power), d.powerRank != null ? "王国内 " + Number(d.powerRank).toLocaleString("ja-JP") + "位" : ""], ["メンバー", d.memberCount != null ? d.memberCount + "人" : "—", ""], ["平均戦力", big(d.avg), "1人あたり"]];
    var tW = (W - PAD * 2 - 24) / 3;
    tiles.forEach(function (t, i) {
      var x = PAD + i * (tW + 12);
      c.save(); rr(c, x, y, tW, 220, 22); c.fillStyle = P.raised; c.fill(); if (i === 0) { c.lineWidth = 3; c.strokeStyle = P.accent; c.stroke(); } c.restore();
      c.textAlign = "center"; c.fillStyle = P.subtext; c.font = "700 26px " + FONT; c.fillText(t[0], x + tW / 2, y + 52);
      c.fillStyle = P.text; fit(c, t[1], tW - 30, 60, "900"); c.fillText(t[1], x + tW / 2, y + 132);
      if (t[2]) { c.fillStyle = P.accent; c.font = "800 24px " + FONT; c.fillText(t[2], x + tW / 2, y + 184); }
    });
    y += 250;
    if (d.roles && d.roles.length) {
      var cx = PAD; c.font = "700 26px " + FONT; c.textBaseline = "middle"; c.textAlign = "left";
      d.roles.forEach(function (r) { var t = "R" + r[0] + "　" + r[1] + "人", w = c.measureText(t).width + 36; if (cx + w > W - PAD) return; c.save(); rr(c, cx, y, w, 52, 26); c.fillStyle = P.raised; c.fill(); c.lineWidth = 1.5; c.strokeStyle = r[0] >= 4 ? "rgb(250,204,21)" : P.border; c.stroke(); c.restore(); c.fillStyle = P.text; c.fillText(t, cx + 18, y + 27); cx += w + 10; });
      c.textBaseline = "alphabetic"; y += 90;
    }
    if (top.length) {
      c.textAlign = "left"; c.fillStyle = P.text; c.font = "800 30px " + FONT; c.fillText("戦力 TOP" + top.length, PAD + 6, y + 40); y += 70;
      top.forEach(function (m, i) {
        c.save(); rr(c, PAD, y, W - PAD * 2, 56, 14); c.fillStyle = i % 2 ? alpha(P.raised, .55) : P.raised; c.fill(); c.restore();
        c.textAlign = "left"; c.fillStyle = i < 3 ? "rgb(250,204,21)" : P.subtext; c.font = "900 28px " + FONT; c.fillText(String(i + 1), PAD + 22, y + 38);
        c.fillStyle = P.text; fit(c, m.name, 520, 28, "800"); c.fillText(m.name, PAD + 80, y + 38);
        var tags = [m.role, d.showVip && m.vip != null ? "VIP " + m.vip : ""].filter(Boolean).join("・");
        if (tags) { c.fillStyle = P.subtext; c.font = "700 22px " + FONT; c.fillText(tags, PAD + 620, y + 37); }
        c.textAlign = "right"; c.fillStyle = P.accent; c.font = "900 28px " + FONT; c.fillText(big(m.power), W - PAD - 22, y + 38);
        y += 66;
      });
      y += 20;
    }
    c.textAlign = "left"; c.fillStyle = P.subtext; c.font = "500 21px " + FONT; c.fillText("データ：" + (d.date || "") + "　EagleEye調べ", PAD + 6, y + 30);
    y += 70; c.strokeStyle = P.border; c.lineWidth = 1.5; c.beginPath(); c.moveTo(PAD, y); c.lineTo(W - PAD, y); c.stroke(); y += 24;
    var imgs = await Promise.all([loadImg(cfg.bj), loadImg(cfg.qr)]);
    if (imgs[0]) c.drawImage(imgs[0], PAD, y, 130, 130 * imgs[0].height / imgs[0].width);
    c.textAlign = "left"; c.fillStyle = P.text; c.font = "900 38px " + FONT; c.fillText("EagleEye", PAD + 150, y + 50);
    c.fillStyle = P.accent; c.font = "700 25px " + FONT; c.fillText(location.host, PAD + 150, y + 88);
    c.fillStyle = P.subtext; c.font = "500 20px " + FONT; c.fillText("あなたの同盟もチェックしよう", PAD + 150, y + 122);
    if (imgs[1]) { c.fillStyle = "#fff"; rr(c, W - PAD - 150, y - 6, 150, 150, 12); c.fill(); c.drawImage(imgs[1], W - PAD - 140, y + 4, 130, 130); }
    return cv;
  }
  function alpha(hex, a) { var n = parseInt(String(hex).slice(1), 16); return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; }
  function preview(blob) {
    var url = URL.createObjectURL(blob), box = document.createElement("div");
    box.id = "ashPreview";
    var touch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    var canCopy = !!(navigator.clipboard && navigator.clipboard.write && window.ClipboardItem);
    box.innerHTML = '<p></p><img alt="同盟カードの画像"><div class="ee-pv-actions" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">' + (canCopy ? '<button type="button" data-act="copy">📋 画像をコピー</button>' : '') + '<a data-act="save" download="eagleeye-alliance.png">💾 保存</a><button type="button" data-act="close">閉じる</button></div>';
    box.querySelector("p").textContent = touch ? "画像を長押しして保存・共有できます" : (canCopy ? "「画像をコピー」して、Discord や X にそのまま貼り付けられます（Ctrl+V / ⌘V）" : "「保存」して、Discord や X に貼り付けられます");
    box.querySelector("img").src = url;
    box.querySelector('[data-act="save"]').href = url;
    box.querySelector('[data-act="close"]').onclick = function () { box.remove(); URL.revokeObjectURL(url); };
    var copyBtn = box.querySelector('[data-act="copy"]');
    if (copyBtn) copyBtn.onclick = function () {
      navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]).then(function () { copyBtn.textContent = "✅ コピーしました"; }, function () { copyBtn.textContent = "コピーできませんでした（保存を使ってください）"; });
    };
    document.body.appendChild(box);
  }
  window.__ashBuild = build;
  document.getElementById("ashImg").addEventListener("click", async function () {
    var btn = this; btn.disabled = true; say("画像を作成中…");
    try {
      var cv = await build();
      var blob = await new Promise(function (ok) { cv.toBlob(ok, "image/png"); });
      if (!blob) throw new Error("画像を作れませんでした");
      var file = new File([blob], "eagleeye-alliance.png", { type: "image/png" });
      var u = await shareUrl();
      try { fetch("/api/milestones/share", { method: "POST", credentials: "same-origin" }).catch(function () {}); } catch (e) {}
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        say("");
        try { await navigator.share({ files: [file], text: title + "｜EagleEyeで同盟チェック " + u }); } catch (e) { if (e && e.name !== "AbortError") preview(blob); }
      } else { say(""); preview(blob); }
    } catch (e) { say(e && e.message ? e.message : "画像を作れませんでした"); }
    finally { btn.disabled = false; }
  });
}

export const ALLIANCE_SHARE_CSS = "#ashShare{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0}#ashShare button{border:1px solid var(--ee-cyan,#22d3ee)!important;background:var(--ee-panel2,#0d2035)!important;color:var(--ee-text,#e8f3ff)!important;border-radius:10px;padding:9px 13px;font:800 13px system-ui;cursor:pointer}#ashShare button:disabled{opacity:.6}#ashMsg{font-size:12px;color:var(--ee-subtext,#91a7bf)}#ashPreview{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.82);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:16px;overflow:auto}#ashPreview p{color:#fff;font:700 14px system-ui;margin:0;text-align:center}#ashPreview img{max-width:min(100%,520px);max-height:70vh;border-radius:12px}#ashPreview a,#ashPreview button{border:0;border-radius:10px;padding:10px 14px;background:#fff;color:#04202a;font:800 13px system-ui;text-decoration:none;cursor:pointer}";

// 同盟のページに埋め込む部分（ボタンの置き場所・データ・スクリプト）。
export function allianceShareEmbed(input) {
  const data = allianceShareData(input);
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  const cfg = JSON.stringify({ palettes: shareCardPalettes(), bj: "/assets/eagleeye/bjnyan/poses/common.webp", qr: "/assets/eagleeye/qr-share.svg" }).replace(/</g, "\\u003c");
  return "<div id='ashShare'></div><style>" + ALLIANCE_SHARE_CSS + "</style><script type='application/json' id='ashData'>" + json + "</script>" +
    "<script>var __name=function(f){return f};(" + allianceShareClient.toString() + ")(" + cfg + ");</script>";
}
