// Colour themes ("着せ替え"). Every page draws its colours from the shared
// --ee-* tokens, so a theme is just one set of token values. The choice is kept
// in the browser (localStorage "eagleeye-skin") and applied before first paint.
// Themes apply in dark mode; the light mode keeps its own light tokens.
//
// To add a theme: add one entry below (id, name, description, tokens).

export const EAGLEEYE_THEMES = Object.freeze([
  { id: "navy", name: "ネイビー", description: "EagleEye標準", tokens: null },
  { id: "midnight", name: "ミッドナイトパープル", description: "落ち着いた紫",
    tokens: { bg: "#120d1f", panel: "#1c1530", deep: "#150f26", raised: "#261d40", border: "#3d3163", soft: "#2a2247", text: "#efe9ff", subtext: "#b3a6d6", muted: "#8a7fae", accent: "#a78bfa", rival: "#fbbf24" } },
  { id: "sakura", name: "さくら", description: "やわらかいピンク",
    tokens: { bg: "#1a0f14", panel: "#26161e", deep: "#1f1218", raised: "#331d28", border: "#5a3346", soft: "#3d2431", text: "#fff0f5", subtext: "#e0b3c6", muted: "#b58a9c", accent: "#f472b6", rival: "#60a5fa" } },
  { id: "forest", name: "フォレスト", description: "深い緑",
    tokens: { bg: "#0c1712", panel: "#13241b", deep: "#0f1d16", raised: "#1a3125", border: "#2f5240", soft: "#213a2d", text: "#eafff3", subtext: "#a6cdb8", muted: "#7fa592", accent: "#34d399", rival: "#f87171" } },
  { id: "ember", name: "サンセット", description: "あたたかいオレンジ",
    tokens: { bg: "#1a120a", panel: "#261a10", deep: "#1f150c", raised: "#33231a", border: "#5a3d24", soft: "#3d2a19", text: "#fff5eb", subtext: "#e3c3a3", muted: "#b8987a", accent: "#fb923c", rival: "#60a5fa" } },
  { id: "graphite", name: "グラファイト", description: "色を抑えたモノトーン",
    tokens: { bg: "#111214", panel: "#1a1c1f", deep: "#151618", raised: "#232529", border: "#3a3d43", soft: "#2a2c31", text: "#f2f3f5", subtext: "#b0b4bb", muted: "#868a91", accent: "#93c5fd", rival: "#f87171" } }
]);

const TOKEN_VARS = { bg: "--ee-bg", panel: "--ee-panel", deep: "--ee-panel-deep", raised: "--ee-panel-raised", border: "--ee-border", soft: "--ee-border-soft", text: "--ee-text", subtext: "--ee-subtext", muted: "--ee-muted", accent: "--ee-cyan", rival: "--ee-rival" };
const SAFE_ID = /^[a-z][a-z0-9-]{1,30}$/;
const SAFE_COLOR = /^#[0-9a-fA-F]{6}$/;

export function eagleEyeThemesCss(themes = EAGLEEYE_THEMES) {
  return themes.filter(t => t.tokens && SAFE_ID.test(t.id)).map(t => {
    const decls = Object.entries(TOKEN_VARS)
      .filter(([key]) => SAFE_COLOR.test(String(t.tokens[key] || "")))
      .map(([key, cssVar]) => `${cssVar}:${t.tokens[key]}`);
    if (t.tokens.accent && SAFE_COLOR.test(t.tokens.accent)) decls.push(`--ee-cyan-strong:${t.tokens.accent}`);
    return `html[data-ee-skin="${t.id}"]:not([data-eagle-theme="light"]){${decls.join(";")}}`;
  }).join("\n");
}

// Runs in <head> before the page paints, so there is no flash of the default colours.
export const EAGLEEYE_SKIN_BOOT_SCRIPT = `<script id="eagleeye-skin-boot">try{var s=localStorage.getItem("eagleeye-skin");if(s&&/^[a-z][a-z0-9-]{1,30}$/.test(s))document.documentElement.setAttribute("data-ee-skin",s)}catch(e){}</script>`;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Previews must show each theme's own colours, so they are written as rgb()
// which the shared palette normaliser (hex only) leaves untouched.
function rgb(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`;
}

export function renderThemePickerPage() {
  const swatch = t => {
    const raw = t.tokens || { bg: "#0a1424", panel: "#0f2035", raised: "#172a40", text: "#e8f3ff", subtext: "#91a7bf", accent: "#22d3ee", border: "#2a4664" };
    const k = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, rgb(value)]));
    return `<button type="button" class="skin" data-skin="${escapeHtml(t.id)}" style="background:${k.bg};border-color:${k.border}">
<span class="skin-card" style="background:${k.panel}"><i style="background:${k.accent}"></i><b style="color:${k.text}">${escapeHtml(t.name)}</b><small style="color:${k.subtext}">${escapeHtml(t.description)}</small></span>
<span class="skin-bar"><em style="background:${k.accent}"></em><em style="background:${k.raised}"></em><em style="background:${k.subtext}"></em></span>
<span class="skin-check">✓ 使用中</span></button>`;
  };
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>着せ替え | EagleEye</title><style>
body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.wrap{max-width:760px;margin:0 auto;padding:20px 16px calc(96px + env(safe-area-inset-bottom))}
.back{color:var(--ee-subtext);text-decoration:none;font-size:13px}
.eyebrow{margin-top:14px;color:var(--ee-cyan);font-size:11px;font-weight:900;letter-spacing:2px}
h1{margin:4px 0 6px;font-size:26px}.muted{color:var(--ee-subtext);font-size:13px;line-height:1.6}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:16px}
.skin{position:relative;display:flex;flex-direction:column;gap:8px;padding:12px;border:2px solid;border-radius:16px;text-align:left;cursor:pointer;font:inherit}
.skin-card{display:flex;flex-direction:column;gap:3px;padding:10px;border-radius:11px}
.skin-card i{display:block;width:26px;height:4px;border-radius:2px;margin-bottom:4px}
.skin-card b{font-size:14px}.skin-card small{font-size:11px}
.skin-bar{display:flex;gap:6px}.skin-bar em{flex:1;height:8px;border-radius:4px}
.skin-check{display:none;position:absolute;top:8px;right:10px;font-size:11px;font-weight:800;color:#fff;background:rgba(0,0,0,.45);padding:2px 7px;border-radius:999px}
.skin.on{outline:3px solid var(--ee-cyan);outline-offset:2px}.skin.on .skin-check{display:block}
.note{margin-top:16px;padding:12px 14px;border:1px solid var(--ee-border-soft);border-radius:12px;background:var(--ee-panel);font-size:12px;color:var(--ee-subtext);line-height:1.6}
</style></head><body><main class="wrap"><a class="back" href="/">← ホーム</a><div class="eyebrow">着せ替え</div><h1>着せ替え</h1>
<p class="muted">好きな色を選ぶと、すべてのページの色が切り替わります。選んだテーマはこの端末に保存されます。</p>
<div class="grid">${EAGLEEYE_THEMES.map(swatch).join("")}</div>
<div class="note">着せ替えはダークモードで使えます。画面右下の 🌙 / ☀️ でライトモードにしている場合は、ライトの色が優先されます。</div>
</main><script>(function(){var ids=${JSON.stringify(EAGLEEYE_THEMES.map(t => t.id))};function current(){try{var s=localStorage.getItem("eagleeye-skin");return ids.indexOf(s)>=0?s:"navy"}catch(e){return "navy"}}
function paint(){var c=current();document.querySelectorAll(".skin").forEach(function(b){b.classList.toggle("on",b.getAttribute("data-skin")===c)})}
document.querySelectorAll(".skin").forEach(function(b){b.addEventListener("click",function(){var id=b.getAttribute("data-skin");try{if(id==="navy")localStorage.removeItem("eagleeye-skin");else localStorage.setItem("eagleeye-skin",id)}catch(e){}
if(id==="navy")document.documentElement.removeAttribute("data-ee-skin");else document.documentElement.setAttribute("data-ee-skin",id);
try{if(document.documentElement.getAttribute("data-eagle-theme")==="light"){document.documentElement.setAttribute("data-eagle-theme","dark");localStorage.setItem("eagleeye-theme","dark")}}catch(e){}paint()})});paint()})();</script></body></html>`;
}
