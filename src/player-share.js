import { shareCardPalettes } from "./themes.js";
import { formatTownCenterLevel } from "./town-center-level.js";
// プレイヤー詳細を1枚の画像（領主カード）にして共有する。画像は端末内の canvas で作るので、サーバー・D1の負担は増えない。
// ・載せるのは、見ている人のロールで見られる項目だけ（渡す前に filterPlayerForRole / filterPlayerProfileForRole 済みのデータを使う）
// ・名前・王国・同盟・戦力・役場・撃破数・秘境の試練（6ステージ）・データの日付・BJにゃん・QR
// ・ログイン中なら共有するURLに本人の招待コード（?ref=）を付ける

export const MYSTIC_STAGES = Object.freeze([
  ["coliseum", "闘技場", 21, 10000], ["forest_of_life", "生命の森", 22, 20000], ["crystal_cave", "水晶鉱山", 23, 30000],
  ["knowledge_nexus", "知識の枢軸", 24, 40000], ["molten_fort", "溶岩要塞", 25, 50000], ["radiant_spire", "輝光の塔", 26, 60000]
]);
const STAGE_ALIASES = Object.fromEntries(MYSTIC_STAGES.flatMap(([key, ja]) => [[key, key], [key.replace(/_/g, ""), key], [ja, key]]));
Object.assign(STAGE_ALIASES, { "forest of life": "forest_of_life", "crystal cave": "crystal_cave", "knowledge nexus": "knowledge_nexus", "molten fort": "molten_fort", "radiant spire": "radiant_spire" });

const numOrNull = v => v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);

// 秘境の試練の値（例 60605）→「61-5」。ラベルがあればそれを使う。
export function mysticStageLabel(score, offset, valueLabel) {
  if (valueLabel) return String(valueLabel).slice(0, 12);
  const v = numOrNull(score);
  if (v == null) return null;
  const n = Math.round(v > offset ? v - offset : v);
  return n >= 1 && n < 10000 ? (Math.floor((n - 1) / 10) + 1) + "-" + ((n - 1) % 10 + 1) : null;
}

export function mysticFromLeaderboards(list) {
  const out = [];
  if (!Array.isArray(list)) return out;
  const seen = new Set();
  for (const b of list) {
    if (!b || typeof b !== "object") continue;
    const byType = MYSTIC_STAGES.find(s => s[2] === Number(b.rank_type));
    const names = [b.key, b.board, b.id, b.name, b.label].filter(v => v != null).map(v => String(v).trim().toLowerCase());
    const key = byType?.[0] || names.map(n => STAGE_ALIASES[n] || STAGE_ALIASES[n.replace(/[^a-z0-9_]/g, "")]).find(Boolean);
    if (!key || seen.has(key)) continue;
    const stage = MYSTIC_STAGES.find(s => s[0] === key);
    const label = mysticStageLabel(b.value ?? b.score ?? b.rank_value, stage[3], b.value_label);
    const rank = numOrNull(b.rank ?? b.ranking ?? b.rank_no);
    if (!label && rank == null) continue;
    seen.add(key);
    out.push({ key, name: stage[1], stage: label, rank });
  }
  return MYSTIC_STAGES.map(s => out.find(o => o.key === s[0])).filter(Boolean);
}

// 画面に出している（＝見てよい）値だけで共有データを作る。
export function playerShareData(player, profile = null) {
  const p = player || {};
  const r = profile?.ranks && typeof profile.ranks === "object" ? profile.ranks : {};
  const tc = numOrNull(p.town_center_level);
  const data = {
    name: p.nick_name ? String(p.nick_name).slice(0, 40) : null,
    gid: p.governor_id != null ? String(p.governor_id) : null,
    kid: numOrNull(p.kid),
    alliance: p.alliance_name ? (p.alliance_abbr ? "[" + String(p.alliance_abbr).slice(0, 8) + "] " : "") + String(p.alliance_name).slice(0, 30) : null,
    avatar: p.avatar_url ? String(p.avatar_url) : null,
    power: numOrNull(p.power),
    powerRank: numOrNull(r.power_rank),
    tc: tc == null ? null : formatTownCenterLevel(tc),
    gold: tc != null && tc >= 35 ? Math.floor((tc - 35) / 5) + 1 : null,
    kills: numOrNull(p.kills),
    killsRank: numOrNull(r.kills_rank),
    mystic: mysticFromLeaderboards(r.leaderboards),
    date: p.observed_at ? new Date((Number(p.observed_at) + 9 * 3600) * 1000).toISOString().slice(0, 10) : ""
  };
  return data;
}

// ---- client (toString で埋め込む。外の変数を参照しない) ----
export function playerShareClient(cfg) {
  var dataEl = document.getElementById("pshData");
  var host = document.getElementById("pshShare");
  if (!dataEl || !host) return;
  var d; try { d = JSON.parse(dataEl.textContent); } catch (e) { return; }
  if (!d || (!d.name && !d.gid)) return;
  var FONT = '-apple-system,"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif';
  var PALS = cfg.palettes || {};
  function currentPalette() { var id = document.documentElement.getAttribute("data-ee-skin") || "navy"; return PALS[id] || PALS.navy || { bg: "#0b1424", panel: "#0f1f36", raised: "#13263d", border: "#1d344d", text: "#e8f3ff", subtext: "#91a7bf", accent: "#22d3ee" }; }
  var P = currentPalette();
  function alpha(hex, a) { var n = parseInt(String(hex).slice(1), 16); return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; }
  host.innerHTML = '<button type="button" id="pshImg">📤 画像で共有</button><button type="button" id="pshLink">リンクをコピー</button><span id="pshMsg" aria-live="polite"></span>';
  var msg = document.getElementById("pshMsg");
  function say(t) { msg.textContent = t; if (t) setTimeout(function () { if (msg.textContent === t) msg.textContent = ""; }, 4000); }
  var refPromise = null;
  function shareUrl() {
    if (!refPromise) refPromise = fetch("/api/invite", { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (x) {
      var m = x && x.ok && String(x.link || "").match(/[?&]ref=([a-z0-9]{8})/); return m ? m[1] : null;
    }).catch(function () { return null; });
    return refPromise.then(function (ref) {
      var u = new URL("/player", location.origin);
      var gid = d.gid || new URLSearchParams(location.search).get("governor_id");
      if (gid) u.searchParams.set("governor_id", gid);
      if (ref) u.searchParams.set("ref", ref);
      return u.toString();
    });
  }
  var title = (d.name || ("領主 " + d.gid)) + (d.kid != null ? "（王国" + d.kid + "）" : "");
  document.getElementById("pshLink").addEventListener("click", function () {
    shareUrl().then(function (u) {
      var text = title + "｜EagleEyeで領主チェック " + u;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { say("リンクをコピーしました"); }, function () { prompt("コピーしてください", text); });
      else prompt("コピーしてください", text);
    });
  });
  function big(v) { var n = Number(v); if (v == null || !isFinite(n)) return "—"; var a = Math.abs(n); return a >= 1e8 ? (n / 1e8).toFixed(a >= 1e10 ? 0 : 1) + "億" : a >= 1e4 ? Math.round(n / 1e4).toLocaleString("ja-JP") + "万" : n.toLocaleString("ja-JP"); }
  function rank(v) { return v == null ? "" : "王国内 " + Number(v).toLocaleString("ja-JP") + "位"; }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function loadImg(src) { return new Promise(function (ok) { if (!src) return ok(null); var im = new Image(); im.onload = function () { ok(im); }; im.onerror = function () { ok(null); }; im.src = src; }); }
  function fit(c, text, maxW, size, weight) { var s = size; c.font = weight + " " + s + "px " + FONT; while (s > 24 && c.measureText(text).width > maxW) { s -= 2; c.font = weight + " " + s + "px " + FONT; } return s; }

  async function build() {
    P = currentPalette();
    var W = 1080, PAD = 48, ms = d.mystic || [];
    var H = PAD + 60 + 220 + 250 + (ms.length ? 80 + Math.ceil(ms.length / 3) * 150 : 0) + 90 + 200;
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var c = cv.getContext("2d");
    var bg = c.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, P.panel); bg.addColorStop(1, P.bg); c.fillStyle = bg; c.fillRect(0, 0, W, H);
    var glow = c.createRadialGradient(W * .3, 160, 0, W * .3, 160, W * .7); glow.addColorStop(0, "rgba(250,204,21,.16)"); glow.addColorStop(1, "rgba(250,204,21,0)"); c.fillStyle = glow; c.fillRect(0, 0, W, H);
    c.textBaseline = "alphabetic"; c.textAlign = "left"; c.fillStyle = P.accent; c.font = "800 26px " + FONT; c.fillText("キングショット 領主カード", PAD, PAD + 30);
    if (P.reward) { c.textAlign = "right"; c.font = "900 22px " + FONT; c.fillText("👑 " + (P.name || "") + " EDITION", W - PAD, PAD + 30); c.textAlign = "left"; }
    var y = PAD + 60;
    // 名前の帯
    c.save(); rr(c, PAD, y, W - PAD * 2, 190, 26); c.fillStyle = P.raised; c.fill(); c.lineWidth = 3; c.strokeStyle = alpha(P.accent, .7); c.stroke(); c.restore();
    var av = await loadImg(d.avatar ? cfg.avatar + encodeURIComponent(d.avatar) : null), ax = PAD + 30, ay = y + 30, AS = 130;
    c.save(); rr(c, ax, ay, AS, AS, 24); c.clip();
    if (av) c.drawImage(av, ax, ay, AS, AS); else { c.fillStyle = P.bg; c.fillRect(ax, ay, AS, AS); c.fillStyle = P.subtext; c.font = "900 64px " + FONT; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(Array.from(d.name || "?")[0], ax + AS / 2, ay + AS / 2 + 4); }
    c.restore(); c.save(); rr(c, ax, ay, AS, AS, 24); c.lineWidth = 4; c.strokeStyle = "rgb(250,204,21)"; c.stroke(); c.restore();
    c.textAlign = "left"; c.textBaseline = "alphabetic";
    var tx = ax + AS + 30, tw = W - PAD - 30 - tx;
    c.fillStyle = P.text; fit(c, d.name || ("領主 " + d.gid), tw, 58, "900"); c.fillText(d.name || ("領主 " + d.gid), tx, y + 88);
    var sub = [d.kid != null ? "王国 " + d.kid : null, d.alliance].filter(Boolean).join("　");
    c.fillStyle = P.accent; fit(c, sub || " ", tw, 30, "800"); c.fillText(sub, tx, y + 134);
    if (d.gid) { c.fillStyle = P.subtext; c.font = "600 22px " + FONT; c.fillText("領主ID " + d.gid, tx, y + 170); }
    y += 220;
    // 3つの大きな数字
    var tiles = [["戦力", big(d.power), rank(d.powerRank)], ["役場", d.tc || "—", d.gold ? "黄金バッジ " + d.gold : ""], ["撃破数", big(d.kills), rank(d.killsRank)]];
    var tW = (W - PAD * 2 - 24) / 3;
    tiles.forEach(function (t, i) {
      var x = PAD + i * (tW + 12);
      c.save(); rr(c, x, y, tW, 220, 22); c.fillStyle = P.raised; c.fill(); if (i === 0) { c.lineWidth = 3; c.strokeStyle = P.accent; c.stroke(); } c.restore();
      c.textAlign = "center"; c.fillStyle = P.subtext; c.font = "700 26px " + FONT; c.fillText(t[0], x + tW / 2, y + 52);
      c.fillStyle = i === 1 && d.gold ? "rgb(250,214,60)" : P.text; fit(c, t[1], tW - 30, 60, "900"); c.fillText(t[1], x + tW / 2, y + 132);
      if (t[2]) { c.fillStyle = P.accent; c.font = "800 24px " + FONT; c.fillText(t[2], x + tW / 2, y + 184); }
    });
    y += 250;
    if (ms.length) {
      c.textAlign = "left"; c.fillStyle = P.text; c.font = "800 30px " + FONT; c.fillText("秘境の試練", PAD + 6, y + 40); y += 70;
      var mW = (W - PAD * 2 - 24) / 3;
      ms.forEach(function (m, i) {
        var x = PAD + (i % 3) * (mW + 12), yy = y + Math.floor(i / 3) * 150;
        c.save(); rr(c, x, yy, mW, 136, 18); c.fillStyle = P.raised; c.fill(); c.restore();
        c.textAlign = "center"; c.fillStyle = P.subtext; c.font = "700 23px " + FONT; c.fillText(m.name, x + mW / 2, yy + 38);
        c.fillStyle = P.text; c.font = "900 44px " + FONT; c.fillText(m.stage || "—", x + mW / 2, yy + 90);
        if (m.rank != null) { c.fillStyle = P.accent; c.font = "700 21px " + FONT; c.fillText(Number(m.rank).toLocaleString("ja-JP") + "位", x + mW / 2, yy + 122); }
      });
      y += Math.ceil(ms.length / 3) * 150 + 10;
    }
    c.textAlign = "left"; c.fillStyle = P.subtext; c.font = "500 21px " + FONT; c.fillText("データ：" + (d.date || "") + "　EagleEye調べ", PAD + 6, y + 30);
    y += 70; c.strokeStyle = P.border; c.lineWidth = 1.5; c.beginPath(); c.moveTo(PAD, y); c.lineTo(W - PAD, y); c.stroke(); y += 24;
    var imgs = await Promise.all([loadImg(cfg.bj), loadImg(cfg.qr)]);
    if (imgs[0]) c.drawImage(imgs[0], PAD, y, 130, 130 * imgs[0].height / imgs[0].width);
    c.textAlign = "left"; c.fillStyle = P.text; c.font = "900 38px " + FONT; c.fillText("EagleEye", PAD + 150, y + 50);
    c.fillStyle = P.accent; c.font = "700 25px " + FONT; c.fillText(location.host, PAD + 150, y + 88);
    c.fillStyle = P.subtext; c.font = "500 20px " + FONT; c.fillText("あなたの領主もチェックしよう", PAD + 150, y + 122);
    if (imgs[1]) { c.fillStyle = "#fff"; rr(c, W - PAD - 150, y - 6, 150, 150, 12); c.fill(); c.drawImage(imgs[1], W - PAD - 140, y + 4, 130, 130); }
    return cv;
  }
  function preview(blob) {
    var url = URL.createObjectURL(blob), box = document.createElement("div");
    box.id = "pshPreview";
    box.innerHTML = '<p>画像を長押しして保存・共有できます</p><img alt="領主カードの画像"><button type="button">閉じる</button>';
    box.querySelector("img").src = url;
    box.querySelector("button").onclick = function () { box.remove(); URL.revokeObjectURL(url); };
    document.body.appendChild(box);
  }
  window.__pshBuild = build;
  document.getElementById("pshImg").addEventListener("click", async function () {
    var btn = this; btn.disabled = true; say("画像を作成中…");
    try {
      var cv = await build();
      var blob = await new Promise(function (ok) { cv.toBlob(ok, "image/png"); });
      if (!blob) throw new Error("画像を作れませんでした");
      var file = new File([blob], "eagleeye-player.png", { type: "image/png" });
      var u = await shareUrl();
      try { fetch("/api/milestones/share", { method: "POST", credentials: "same-origin" }).catch(function () {}); } catch (e) {}
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        say("");
        try { await navigator.share({ files: [file], text: title + "｜EagleEyeで領主チェック " + u }); } catch (e) { if (e && e.name !== "AbortError") preview(blob); }
      } else { say(""); preview(blob); }
    } catch (e) { say(e && e.message ? e.message : "画像を作れませんでした"); }
    finally { btn.disabled = false; }
  });
}

export const PLAYER_SHARE_CSS = "#pshShare{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}#pshShare button{border:1px solid var(--ee-cyan,#22d3ee)!important;background:var(--ee-panel2,#0d2035)!important;color:var(--ee-text,#e8f3ff)!important;border-radius:11px;padding:9px 14px;font:inherit;font-size:13px;font-weight:800;cursor:pointer}#pshShare button:first-child{background:var(--ee-cyan,#22d3ee)!important;color:#04111c!important}#pshShare button:disabled{opacity:.6}#pshMsg{font-size:12px;color:var(--ee-sub,#8098b0)}#pshPreview{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.85);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:16px}#pshPreview img{max-width:100%;max-height:75vh;border-radius:12px}#pshPreview p{color:#fff;margin:0;font-size:14px}#pshPreview button{border:0;border-radius:10px;padding:10px 18px;font-weight:800}";

// プレイヤー詳細ページに埋め込む部分（ボタンの置き場所・データ・スクリプト）。
export function playerShareEmbed(player, profile) {
  const data = playerShareData(player, profile);
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  const cfg = JSON.stringify({ palettes: shareCardPalettes(), avatar: "/api/avatar?u=", bj: "/assets/eagleeye/bjnyan/poses/common.webp", qr: "/assets/eagleeye/qr-share.svg" }).replace(/</g, "\\u003c");
  return "<div id='pshShare'></div><style>" + PLAYER_SHARE_CSS + "</style><script type='application/json' id='pshData'>" + json + "</script>" +
    "<script>var __name=function(f){return f};(" + playerShareClient.toString() + ")(" + cfg + ");</script>";
}
