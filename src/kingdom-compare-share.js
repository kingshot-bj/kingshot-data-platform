// 王国比較を画像（カード）で共有する。画像はスマホの中で canvas で作るので、サーバー・D1の負担は増えない。
// ・見出し「王国 A vs 王国 B」、項目ごとに良い方を光らせて👑、項目ごとの勝ち数
// ・BJにゃん・EagleEye・QR・データの日付
// ・ログイン中なら共有するURLに本人の招待コード（?ref=）を付ける（/api/invite。未ログインなら付けない）

export const KINGDOM_SHARE_METRICS = Object.freeze([
  // [キー, 表示名, 書式, 大きい方が良いか（null は優劣なし）]
  ["power", "総戦力", "big", true],
  ["power_rank", "戦力順位", "rank", false],
  ["gain", "7日間の伸び", "big", true],
  ["gain_pct", "伸び率（7日）", "pct", true],
  ["players", "領主数", "int", true],
  ["avg", "1人あたり戦力", "big", true],
  ["age", "開設からの日数", "int", null]
]);

export function kingdomShareClient(cfg) {
  var dataEl = document.getElementById("kcmpData");
  var host = document.getElementById("kcmpShare");
  if (!dataEl || !host) return;
  var data; try { data = JSON.parse(dataEl.textContent); } catch (e) { return; }
  var ks = (data.kingdoms || []).slice(0, 4);
  if (ks.length < 2) return;
  var FONT = '-apple-system,"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif';
  var COLORS = ["rgb(34,211,238)", "rgb(251,191,36)", "rgb(244,114,182)", "rgb(163,230,53)"];
  host.innerHTML = '<button type="button" id="kcmpImg">📤 画像で共有</button><button type="button" id="kcmpLink">リンクをコピー</button><span id="kcmpMsg" aria-live="polite"></span>';
  var msg = document.getElementById("kcmpMsg");
  function say(t) { msg.textContent = t; if (t) setTimeout(function () { if (msg.textContent === t) msg.textContent = ""; }, 4000); }
  var refPromise = null;
  function shareUrl() {
    if (!refPromise) refPromise = fetch("/api/invite", { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var m = d && d.ok && String(d.link || "").match(/[?&]ref=([a-z0-9]{8})/); return m ? m[1] : null;
    }).catch(function () { return null; });
    return refPromise.then(function (ref) { var u = new URL(location.href); u.searchParams.delete("fetched"); if (ref) u.searchParams.set("ref", ref); return u.toString(); });
  }
  var title = ks.map(function (k) { return "王国" + k.kid; }).join(" vs ");
  document.getElementById("kcmpLink").addEventListener("click", function () {
    shareUrl().then(function (u) {
      var text = title + "｜EagleEyeで王国比較 " + u;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { say("リンクをコピーしました"); }, function () { prompt("コピーしてください", text); });
      else prompt("コピーしてください", text);
    });
  });

  function fmt(v, f) {
    var n = Number(v); if (v == null || !isFinite(n)) return "—";
    if (f === "pct") return (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
    if (f === "rank") return n.toLocaleString("ja-JP") + "位";
    if (f === "big") { var a = Math.abs(n); return a >= 1e8 ? (n / 1e8).toFixed(a >= 1e10 ? 0 : 1) + "億" : a >= 1e4 ? Math.round(n / 1e4).toLocaleString("ja-JP") + "万" : n.toLocaleString("ja-JP"); }
    return Math.round(n).toLocaleString("ja-JP");
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function loadImg(src) { return new Promise(function (ok) { var im = new Image(); im.onload = function () { ok(im); }; im.onerror = function () { ok(null); }; im.src = src; }); }

  async function build() {
    var n = ks.length, W = 1080, PAD = 48, LBL = 230, colW = (W - PAD * 2 - LBL) / n;
    var rows = cfg.metrics.filter(function (m) { return ks.some(function (k) { return k.v[m[0]] != null; }); });
    var wins = ks.map(function () { return 0; });
    var bests = rows.map(function (m) {
      var vals = ks.map(function (k) { var v = k.v[m[0]]; return v == null ? null : Number(v); });
      var ok = vals.filter(function (v) { return v != null && isFinite(v); });
      if (m[3] == null || ok.length < 2) return null;
      var b = m[3] ? Math.max.apply(null, ok) : Math.min.apply(null, ok);
      if (ok.filter(function (v) { return v === b; }).length !== 1) return null;
      var idx = vals.indexOf(b); wins[idx]++; return idx;
    });
    var ROW = 84, GAP = 10, H = PAD + 60 + 200 + rows.length * (ROW + GAP) + 110 + 220;
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var c = cv.getContext("2d");
    var bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "rgb(15,31,54)"); bg.addColorStop(1, "rgb(11,20,36)"); c.fillStyle = bg; c.fillRect(0, 0, W, H);
    var glow = c.createRadialGradient(W * .5, 120, 0, W * .5, 120, W * .6); glow.addColorStop(0, "rgba(250,204,21,.14)"); glow.addColorStop(1, "rgba(250,204,21,0)"); c.fillStyle = glow; c.fillRect(0, 0, W, H);
    c.textBaseline = "alphabetic"; c.textAlign = "left"; c.fillStyle = "rgb(125,211,252)"; c.font = "800 26px " + FONT; c.fillText("キングショット 王国比較", PAD, PAD + 30);
    var y = PAD + 60;
    // 見出し：王国番号（勝ち数が一番多い王国に👑）
    var topWins = Math.max.apply(null, wins), champ = wins.filter(function (w) { return w === topWins; }).length === 1 ? wins.indexOf(topWins) : -1;
    ks.forEach(function (k, i) {
      var cx = PAD + LBL + colW * i + colW / 2;
      c.save(); rr(c, cx - colW / 2 + 6, y, colW - 12, 170, 22); c.fillStyle = "rgb(19,38,61)"; c.fill(); c.lineWidth = 4; c.strokeStyle = COLORS[i]; c.stroke(); c.restore();
      c.textAlign = "center"; c.fillStyle = "rgb(145,167,191)"; c.font = "700 24px " + FONT; c.fillText("王国", cx, y + 46);
      c.fillStyle = "rgb(232,243,255)"; c.font = "900 " + (n > 3 ? 48 : 60) + "px " + FONT; c.fillText(String(k.kid), cx, y + 112);
      c.fillStyle = i === champ ? "rgb(253,230,138)" : "rgb(145,167,191)"; c.font = "800 24px " + FONT; c.fillText((i === champ ? "👑 " : "") + wins[i] + "勝", cx, y + 152);
    });
    if (n === 2) { var vx = PAD + LBL + colW, vy = y + 85; c.beginPath(); c.arc(vx, vy, 34, 0, Math.PI * 2); c.fillStyle = "rgb(11,20,36)"; c.fill(); c.lineWidth = 3; c.strokeStyle = "rgb(250,204,21)"; c.stroke(); c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "rgb(250,204,21)"; c.font = "900 28px " + FONT; c.fillText("VS", vx, vy + 1); c.textBaseline = "alphabetic"; }
    y += 200;
    rows.forEach(function (m, r) {
      c.textAlign = "left"; c.textBaseline = "middle"; c.fillStyle = "rgb(145,167,191)"; c.font = "700 26px " + FONT; c.fillText(m[1], PAD + 6, y + ROW / 2);
      ks.forEach(function (k, i) {
        var x = PAD + LBL + colW * i, isBest = bests[r] === i;
        c.save(); rr(c, x + 6, y, colW - 12, ROW, 16); c.fillStyle = isBest ? "rgb(14,81,96)" : "rgb(19,38,61)"; c.fill(); if (isBest) { c.lineWidth = 3; c.strokeStyle = "rgb(34,211,238)"; c.stroke(); } c.restore();
        c.textAlign = "center"; c.fillStyle = isBest ? "rgb(165,243,252)" : "rgb(232,243,255)"; c.font = "800 " + (n > 3 ? 26 : 32) + "px " + FONT;
        c.fillText((isBest ? "👑 " : "") + fmt(k.v[m[0]], m[2]), x + colW / 2, y + ROW / 2);
      });
      c.textBaseline = "alphabetic"; y += ROW + GAP;
    });
    y += 20; c.textAlign = "left"; c.fillStyle = "rgb(145,167,191)"; c.font = "500 21px " + FONT;
    c.fillText("👑 = その項目でいちばん良い王国　データ：" + (data.date || ""), PAD + 6, y + 24);
    y += 70; c.strokeStyle = "rgb(29,52,77)"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(PAD, y); c.lineTo(W - PAD, y); c.stroke(); y += 24;
    var imgs = await Promise.all([loadImg(cfg.bj), loadImg(cfg.qr)]);
    if (imgs[0]) c.drawImage(imgs[0], PAD, y, 130, 130 * imgs[0].height / imgs[0].width);
    c.textAlign = "left"; c.fillStyle = "rgb(232,243,255)"; c.font = "900 38px " + FONT; c.fillText("EagleEye", PAD + 150, y + 50);
    c.fillStyle = "rgb(125,211,252)"; c.font = "700 25px " + FONT; c.fillText(location.host, PAD + 150, y + 88);
    c.fillStyle = "rgb(145,167,191)"; c.font = "500 20px " + FONT; c.fillText("あなたの王国も比べてみよう", PAD + 150, y + 122);
    if (imgs[1]) { c.fillStyle = "#fff"; rr(c, W - PAD - 150, y - 6, 150, 150, 12); c.fill(); c.drawImage(imgs[1], W - PAD - 140, y + 4, 130, 130); }
    return cv;
  }

  function preview(blob) {
    var url = URL.createObjectURL(blob), box = document.createElement("div");
    box.id = "kcmpPreview";
    box.innerHTML = '<p>画像を長押しして保存・共有できます</p><img alt="王国比較の画像"><button type="button">閉じる</button>';
    box.querySelector("img").src = url;
    box.querySelector("button").onclick = function () { box.remove(); URL.revokeObjectURL(url); };
    document.body.appendChild(box);
  }
  window.__kcmpBuild = build;
  document.getElementById("kcmpImg").addEventListener("click", async function () {
    var btn = this; btn.disabled = true; say("画像を作成中…");
    try {
      var cv = await build();
      var blob = await new Promise(function (ok) { cv.toBlob(ok, "image/png"); });
      if (!blob) throw new Error("画像を作れませんでした");
      var file = new File([blob], "eagleeye-kingdoms.png", { type: "image/png" });
      var u = await shareUrl();
      try { fetch("/api/milestones/share", { method: "POST", credentials: "same-origin" }).catch(function () {}); } catch (e) {}
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        say("");
        try { await navigator.share({ files: [file], text: title + "｜EagleEyeで王国比較 " + u }); } catch (e) { if (e && e.name !== "AbortError") preview(blob); }
      } else { say(""); preview(blob); }
    } catch (e) { say(e && e.message ? e.message : "画像を作れませんでした"); }
    finally { btn.disabled = false; }
  });
}

export const KINGDOM_SHARE_CSS = "#kcmpShare{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:12px 0}#kcmpShare button{border:1px solid var(--ee-cyan,#22d3ee)!important;background:var(--ee-panel-raised,#172a40)!important;color:var(--ee-text,#e8f3ff)!important;border-radius:11px;padding:10px 14px;font:inherit;font-size:14px;font-weight:800}#kcmpShare button:first-child{background:var(--ee-cyan,#22d3ee)!important;color:#05202a!important}#kcmpShare button[disabled]{opacity:.6}#kcmpMsg{font-size:12px;color:var(--ee-subtext,#91a7bf)}#kcmpPreview{position:fixed;inset:0;z-index:9999;background:rgba(2,6,23,.92);display:flex;flex-direction:column;align-items:center;gap:10px;padding:16px;overflow:auto}#kcmpPreview img{max-width:100%;border-radius:12px}#kcmpPreview p{color:#e2e8f0;font-size:13px;margin:0}#kcmpPreview button{border:0;border-radius:10px;padding:9px 18px;font-weight:700}";

// 比較ページに埋め込む部分（データ・ボタンの置き場所・スクリプト）。
export function kingdomShareEmbed(details, dateText) {
  const data = { date: dateText || "", kingdoms: details.map(d => ({ kid: d.kid, v: Object.fromEntries(KINGDOM_SHARE_METRICS.map(([k]) => [k, d.v[k] ?? null])) })) };
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  const cfg = JSON.stringify({ metrics: KINGDOM_SHARE_METRICS, bj: "/assets/eagleeye/bjnyan/poses/common.webp", qr: "/assets/eagleeye/qr-share.svg" }).replace(/</g, "\\u003c");
  return "<div id='kcmpShare'></div><style>" + KINGDOM_SHARE_CSS + "</style><script type='application/json' id='kcmpData'>" + json + "</script>" +
    "<script>var __name=function(f){return f};(" + kingdomShareClient.toString() + ")(" + cfg + ");</script>";
}
