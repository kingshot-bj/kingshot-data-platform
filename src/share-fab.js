// 共有ボタンを見つけやすくする（2026-11-17）。共有カードを使っている人が6人だけで、ボタンが下の方にあって気づかれていなかった。
// ・ページの「画像で共有」ボタンが画面に見えていないあいだ、右下（下のメニューの上）に「📤 画像で共有」を浮かべる。押すと元のボタンを押す。
// ・初めて見た人には1回だけ「この比較を画像にして Discord や X に貼れます」と吹き出しで案内（ブラウザに覚える）。
// ・対象：プレイヤー比較・プレイヤー詳細・同盟比較・王国比較（それぞれの共有ボタンの id）。サーバーは何も読まない。
export const SHARE_BUTTON_IDS = Object.freeze(["eeShareImg", "pshImg", "acImg", "kcmpImg"]);
export const SHARE_HINT_KEY = "eagleeye-share-hint-v1";

export function pageHasShareButton(html) {
  const s = String(html || "");
  return SHARE_BUTTON_IDS.some(id => s.includes(id)) || s.includes('id="pshShare"') || s.includes("id='acShare'") || s.includes("id='kcmpShare'");
}

function client(ids, hintKey) {
  var fab = null, target = null, visible = true;
  function find() { for (var i = 0; i < ids.length; i++) { var el = document.getElementById(ids[i]); if (el) return el; } return null; }
  function build() {
    if (fab || !target) return;
    var st = document.createElement("style");
    st.textContent = "#eeShareFab{position:fixed;right:14px;bottom:calc(88px + env(safe-area-inset-bottom));z-index:40;display:none;align-items:center;gap:6px;padding:11px 15px;border-radius:999px;border:1px solid var(--ee-cyan,#22d3ee);background:var(--ee-panel-raised,#172a40);color:var(--ee-text,#e8f3ff);font:800 14px system-ui,-apple-system,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.45)}#eeShareFab.on{display:inline-flex}#eeShareHint{position:fixed;right:14px;bottom:calc(140px + env(safe-area-inset-bottom));z-index:41;max-width:240px;padding:10px 12px;border-radius:12px;background:var(--ee-cyan,#22d3ee);color:#04202a;font:700 13px/1.5 system-ui,-apple-system,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.4)}#eeShareHint:after{content:'';position:absolute;right:28px;bottom:-6px;border:6px solid transparent;border-bottom:0;border-top-color:var(--ee-cyan,#22d3ee)}";
    document.head.appendChild(st);
    fab = document.createElement("button");
    fab.type = "button"; fab.id = "eeShareFab"; fab.textContent = "📤 画像で共有";
    fab.addEventListener("click", function () { var t = find(); if (t) t.click(); });
    document.body.appendChild(fab);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { visible = es[0] && es[0].isIntersecting; fab.classList.toggle("on", !visible); }).observe(target);
    } else fab.classList.add("on");
    hint();
  }
  function hint() {
    try { if (localStorage.getItem(hintKey)) return; localStorage.setItem(hintKey, "1"); } catch (e) { return; }
    var h = document.createElement("div");
    h.id = "eeShareHint"; h.setAttribute("role", "status");
    h.textContent = "この比較を画像にして、Discord や X にそのまま貼れます📤";
    document.body.appendChild(h);
    setTimeout(function () { if (h.parentNode) h.parentNode.removeChild(h); }, 7000);
    h.addEventListener("click", function () { if (h.parentNode) h.parentNode.removeChild(h); });
  }
  function tick() { target = find(); if (target) { build(); return true; } return false; }
  if (!tick()) {
    // 共有ボタンは画面側のスクリプトがあとから作るので、出てくるまで見張る（最長20秒）。
    var mo = new MutationObserver(function () { if (tick()) mo.disconnect(); });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(function () { mo.disconnect(); }, 20000);
  }
}

export function shareFabScript() {
  // __name：バンドラが関数名を残すために差し込む呼び出しの受け皿（ほかの画面と同じ対策）。
  return `<script id="ee-share-fab">(function(){var __name=function(f){return f};(${client.toString()})(${JSON.stringify(SHARE_BUTTON_IDS)},${JSON.stringify(SHARE_HINT_KEY)});})();</script>`;
}
