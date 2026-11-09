// Colour themes ("着せ替え"). Every page draws its colours from the shared
// --ee-* tokens, so a theme is just one set of token values. The choice is kept
// in the browser (localStorage "eagleeye-skin") and applied before first paint.
// Themes apply in dark mode; the light mode keeps its own light tokens.
//
// To add a theme: add one entry below (id, name, description, tokens).

export const EAGLEEYE_THEMES = Object.freeze([
  { id: "navy", name: "ネイビー", description: "EagleEye標準", tokens: null, light: "#0891b2" },
  { id: "midnight", name: "ミッドナイトパープル", description: "落ち着いた紫",
    tokens: { bg: "#120d1f", panel: "#1c1530", deep: "#150f26", raised: "#261d40", border: "#3d3163", soft: "#2a2247", text: "#efe9ff", subtext: "#b3a6d6", muted: "#8a7fae", accent: "#a78bfa", rival: "#fbbf24" }, light: "#7c3aed" },
  { id: "sakura", name: "さくら", description: "やわらかいピンク",
    tokens: { bg: "#1a0f14", panel: "#26161e", deep: "#1f1218", raised: "#331d28", border: "#5a3346", soft: "#3d2431", text: "#fff0f5", subtext: "#e0b3c6", muted: "#b58a9c", accent: "#f472b6", rival: "#60a5fa" }, light: "#db2777" },
  { id: "forest", name: "フォレスト", description: "深い緑",
    tokens: { bg: "#0c1712", panel: "#13241b", deep: "#0f1d16", raised: "#1a3125", border: "#2f5240", soft: "#213a2d", text: "#eafff3", subtext: "#a6cdb8", muted: "#7fa592", accent: "#34d399", rival: "#f87171" }, light: "#059669" },
  { id: "ember", name: "サンセット", description: "あたたかいオレンジ",
    tokens: { bg: "#1a120a", panel: "#261a10", deep: "#1f150c", raised: "#33231a", border: "#5a3d24", soft: "#3d2a19", text: "#fff5eb", subtext: "#e3c3a3", muted: "#b8987a", accent: "#fb923c", rival: "#60a5fa" }, light: "#ea580c" },
  { id: "graphite", name: "グラファイト", description: "色を抑えたモノトーン",
    tokens: { bg: "#111214", panel: "#1a1c1f", deep: "#151618", raised: "#232529", border: "#3a3d43", soft: "#2a2c31", text: "#f2f3f5", subtext: "#b0b4bb", muted: "#868a91", accent: "#93c5fd", rival: "#f87171" }, light: "#2563eb" },
  // 限定：運営（オーナー）の招待で来た人だけが選べる（user_rewards の theme_gold）。
  { id: "gold", name: "ゴールド", description: "運営招待の限定カラー", reward: "theme_gold",
    tokens: { bg: "#0d0a04", panel: "#1a1408", deep: "#140f06", raised: "#251c0b", border: "#8c6a1f", soft: "#3b2d12", text: "#fff5d6", subtext: "#e6c98a", muted: "#a88f5c", accent: "#f5c542", rival: "#60a5fa" }, light: "#b45309",
    // 色を変えるだけでなく「金属の金」に見せる仕上げ（ダークモードのみ）。
    effects: "gold" },
  // 限定：あまね（オーナー）の特別招待で来た人とオーナーだけが選べる（user_rewards の theme_wine）。
  // ゴールドと同じ豪華な仕上げ（光沢・光る縁・きらめき）を、ワインレッドで。
  { id: "wine", name: "ワインレッド", description: "運営招待の限定カラー", reward: "theme_wine",
    tokens: { bg: "#14050a", panel: "#22090f", deep: "#1a070c", raised: "#2e0d16", border: "#6e1a2b", soft: "#3a1019", text: "#f8ecee", subtext: "#d9b3b9", muted: "#9c7a80", accent: "#d9576a", rival: "#60a5fa" }, light: "#8e1a2e",
    effects: "wine" }
]);

// 共有カード（canvas）用の色。使っている着せ替えの色で画像を作る（ライトモードでも画像は濃い色）。
export function shareCardPalettes(themes = EAGLEEYE_THEMES) {
  const out = { navy: { bg: "#0b1424", panel: "#0f1f36", raised: "#13263d", border: "#1d344d", text: "#e8f3ff", subtext: "#91a7bf", accent: "#22d3ee", name: "ネイビー" } };
  for (const t of themes) if (t.tokens && SAFE_ID_SHARE.test(t.id)) out[t.id] = { bg: t.tokens.bg, panel: t.tokens.panel, raised: t.tokens.raised, border: t.tokens.border, text: t.tokens.text, subtext: t.tokens.subtext, accent: t.tokens.accent, name: t.name, reward: t.reward || null };
  return out;
}
const SAFE_ID_SHARE = /^[a-z][a-z0-9-]{1,30}$/;

const TOKEN_VARS = { bg: "--ee-bg", panel: "--ee-panel", deep: "--ee-panel-deep", raised: "--ee-panel-raised", border: "--ee-border", soft: "--ee-border-soft", text: "--ee-text", subtext: "--ee-subtext", muted: "--ee-muted", accent: "--ee-cyan", rival: "--ee-rival" };
const SAFE_ID = /^[a-z][a-z0-9-]{1,30}$/;
const SAFE_COLOR = /^#[0-9a-fA-F]{6}$/;

// 豪華カラーの特別な仕上げ（金属の光沢・光る縁・粉のきらめき）。CSSは固定の文字列で、利用者の入力は入らない。
// ゴールドとワインレッドは同じ仕上げで、色だけが違う。
const LUXE_TITLES = "h1,.ee-brand span,.ee-welcome-h1,.eyebrow,.ee-h b,.ee-tile strong,.ee-home-tools-grid b,.ee-me-name,.ee-milestone-copy strong,.ms-copy b,.inv-box>b";
// ホーム以外のページ（その他メニュー・検索・ランキング・ウォッチ）のカードも同じ光る縁にそろえる。
const LUXE_CARDS = ".ee-tile,.ee-me-card,.ee-welcome,.ee-milestone-card,.ee-home-tools-grid a,.card,.panel,.inv-box,.ms-card,.cmp-pick,.cmp-table-wrap,.ee-change,.ee-stat," +
  ".ee-global-nav-links a,.ee-global-nav-links button,.search-panel,.search-intro,.search-state,.player-result,.player-lookup,.watch-option,.rank-row,.rank-switch,.rank-settings";
const LUXE_BUTTONS = ".inv-link button,.cmp-form button,.kf button,#kcmpShare button:first-child,#eeShareBar button:first-child,.ms-link button,.search-input-row button";
// 小さな部品（切替・入力・ボタン類）：細い光る縁だけ（影は控えめ）。
const LUXE_CONTROLS = ".search-mode span,.search-input-row input,.rank-picker-trigger,.actions a,.rank-head button,.rank-row .star,.ee-global-nav-panel-head button";
const LUXE = {
  gold: {
    shine: "ee-gold-shine",
    dark: { dust: "255,215,90", glow: "245,197,66", base: "#0b0803", metal: "linear-gradient(100deg,#fff4c2 0%,#f5c542 22%,#b8860b 45%,#fff0b3 60%,#d4a017 78%,#fff4c2 100%)", hl: "255,236,170", frame: "#fff3c4,#c8961c 28%,#6e4f0e 50%,#f5c542 72%,#fff3c4", line: "#f5c542,#fff3c4,#f5c542", btn: "#ffe58a,#f5c542 45%,#c8961c", btnText: "#2a1c02", btnBorder: "#fff0b3", ring: "#f5c542" },
    light: { dust: "184,134,11", glow: "245,197,66", bg: "#fff8e6,#fbf1d8", metal: "linear-gradient(100deg,#7a4f00 0%,#b8860b 25%,#e2b23a 45%,#8a5a00 62%,#c8961c 80%,#7a4f00 100%)", card: "#fffdf6,#fff4d9", frame: "#f3d27a,#b8860b 30%,#7a4f00 50%,#e2b23a 72%,#f3d27a", deep: "122,79,0", bar: "255,249,234", line: "#b8860b,#e2b23a,#b8860b", btn: "#ffe58a,#e2b23a 45%,#b8860b", btnText: "#2a1c02", btnBorder: "#8a5a00", ring: "#b8860b" }
  },
  // ワインレッド：深い赤ワインの地に、ロゼの光沢と光る縁。
  // ワインレッド：上品な深いワイン（ボルドー）の地に、シャンパン色の光沢。さくら（ピンク）と被らないよう、ピンクは使わない。
  // 見出しの光沢は、地の色に対してどの色もコントラスト4.5以上（読める）にしてある（テストで確認）。
  wine: {
    shine: "ee-wine-shine",
    dark: { dust: "230,180,160", glow: "150,20,45", base: "#12040a", metal: "linear-gradient(100deg,#f6e3d6 0%,#e8a1a8 22%,#d4656f 44%,#f3d5c8 60%,#e08a8f 78%,#f6e3d6 100%)", hl: "240,210,196", frame: "#f0d2c4,#9e1b32 28%,#4a0a16 50%,#c4495a 72%,#f0d2c4", line: "#9e1b32,#e6c3b3,#9e1b32", btn: "#c44a5c,#8e1a2e 45%,#5c0e1d", btnText: "#fff4f0", btnBorder: "#d99a9f", ring: "#b8324a" },
    light: { dust: "120,20,40", glow: "158,27,50", bg: "#fbf6f4,#f5ebe8", metal: "linear-gradient(100deg,#5c0e1d 0%,#7b1e2e 25%,#9e1b32 45%,#4a0a16 62%,#8e1a2e 80%,#5c0e1d 100%)", card: "#fffdfc,#faf3f1", frame: "#e8c6c0,#9e1b32 30%,#4a0a16 50%,#b8324a 72%,#e8c6c0", deep: "74,10,22", bar: "253,249,248", line: "#7b1e2e,#c48a8f,#7b1e2e", btn: "#b8324a,#8e1a2e 45%,#5c0e1d", btnText: "#ffffff", btnBorder: "#4a0a16", ring: "#7b1e2e" }
  }
};
const fadeLine = (rgb, mid) => `linear-gradient(90deg,rgba(${rgb},0),${mid},rgba(${rgb},0)) 1`;
function luxeDark(d, { shine, dark: c }) {
  return [
    // 背景：上からの光＋きらめく粉
    `${d} body{background:radial-gradient(rgba(${c.dust},.10) 1px,transparent 1.6px) 0 0/24px 24px,radial-gradient(rgba(${c.dust},.06) 1px,transparent 1.6px) 12px 12px/24px 24px,radial-gradient(120% 55% at 50% -6%,rgba(${c.glow},.28),rgba(${c.glow},0) 62%),${c.base}!important;background-attachment:fixed!important}`,
    // ロゴ・見出し・カードの題名：金属の光沢（ゆっくり流れる）
    `${d} :is(${LUXE_TITLES}){background:${c.metal};background-size:220% 100%;-webkit-background-clip:text;background-clip:text;color:transparent!important;-webkit-text-fill-color:transparent;animation:${shine} 5s linear infinite;filter:drop-shadow(0 0 6px rgba(${c.glow},.35))}`,
    `@keyframes ${shine}{from{background-position:0% 50%}to{background-position:220% 50%}}`,
    `@media (prefers-reduced-motion:reduce){${d} :is(${LUXE_TITLES}){animation:none}}`,
    // カード：金属の縁（グラデーションの枠）＋内側のハイライト＋光る影
    `${d} :is(${LUXE_CARDS}){border:1.5px solid transparent!important;background:linear-gradient(160deg,rgba(${c.hl},.10),rgba(${c.hl},0) 42%) padding-box,linear-gradient(var(--ee-panel),var(--ee-panel)) padding-box,linear-gradient(135deg,${c.frame}) border-box!important;box-shadow:0 0 18px rgba(${c.glow},.18),0 10px 28px rgba(0,0,0,.5)!important}`,
    `${d} :is(${LUXE_CONTROLS}){border:1px solid transparent!important;background:linear-gradient(var(--ee-panel-raised),var(--ee-panel-raised)) padding-box,linear-gradient(135deg,${c.frame}) border-box!important}`,
    // ページ全体を1枚のカードにしている所（ウォッチのトップ）は透明にして、きらめく背景を見せる
    `${d} .watch-hub{background:transparent!important}`,
    `${d} .search-mode input:checked+span{box-shadow:0 0 0 1px rgba(${c.glow},.55),0 0 12px rgba(${c.glow},.45)!important;color:var(--ee-text)!important}`,
    // ヘッダー：光るライン
    `${d} .ee-top{border-bottom:1px solid transparent!important;border-image:${fadeLine(c.glow, c.line)}!important;box-shadow:0 6px 24px rgba(${c.glow},.12)}`,
    // ボタン：金属のグラデーション
    `${d} :is(${LUXE_BUTTONS}){background:linear-gradient(180deg,${c.btn})!important;color:${c.btnText}!important;border-color:${c.btnBorder}!important;box-shadow:0 2px 12px rgba(${c.glow},.45)}`,
    // 下のナビ：光るライン、選択中は光る
    `${d} :is(.ee-nav,.ee-global-nav){border-top:1px solid transparent!important;border-image:${fadeLine(c.glow, c.line)}!important;box-shadow:0 -8px 26px rgba(${c.glow},.14)}`,
    `${d} .ee-nav a.active:before{background:${c.metal}!important;box-shadow:0 0 14px rgba(${c.glow},.9)!important}`,
    // プロフィール：光るリング
    `${d} .ee-avatar{box-shadow:0 0 0 2px ${c.ring},0 0 16px rgba(${c.glow},.6)!important}`
  ].join("\n");
}
// ライトモード：淡い背景と粉、濃い色の縁と光沢
function luxeLight(l, { shine, light: c }) {
  return [
    `${l} body{background:radial-gradient(rgba(${c.dust},.13) 1px,transparent 1.6px) 0 0/24px 24px,radial-gradient(rgba(${c.dust},.08) 1px,transparent 1.6px) 12px 12px/24px 24px,radial-gradient(120% 55% at 50% -6%,rgba(${c.glow},.35),rgba(${c.glow},0) 62%),linear-gradient(180deg,${c.bg})!important;background-attachment:fixed!important}`,
    `${l} :is(${LUXE_TITLES}){background:${c.metal};background-size:220% 100%;-webkit-background-clip:text;background-clip:text;color:transparent!important;-webkit-text-fill-color:transparent;animation:${shine} 5s linear infinite}`,
    `@media (prefers-reduced-motion:reduce){${l} :is(${LUXE_TITLES}){animation:none}}`,
    `${l} :is(${LUXE_CARDS}){border:1.5px solid transparent!important;background:linear-gradient(160deg,${c.card}) padding-box,linear-gradient(135deg,${c.frame}) border-box!important;box-shadow:0 0 0 1px rgba(${c.dust},.10),0 6px 18px rgba(${c.deep},.14),0 0 16px rgba(${c.glow},.18)!important}`,
    `${l} :is(${LUXE_CONTROLS}){border:1px solid transparent!important;background:linear-gradient(#ffffff,#ffffff) padding-box,linear-gradient(135deg,${c.frame}) border-box!important}`,
    `${l} .watch-hub{background:transparent!important}`,
    `${l} .search-mode input:checked+span{box-shadow:0 0 0 1px rgba(${c.dust},.45),0 0 10px rgba(${c.glow},.35)!important;background:linear-gradient(160deg,${c.card}) padding-box,linear-gradient(135deg,${c.frame}) border-box!important}`,
    `${l} :is(.ee-top,.ee-nav,.ee-global-nav){background:rgba(${c.bar},.94)!important}`,
    `${l} .ee-top{border-bottom:1px solid transparent!important;border-image:${fadeLine(c.dust, c.line)}!important}`,
    `${l} :is(${LUXE_BUTTONS}){background:linear-gradient(180deg,${c.btn})!important;color:${c.btnText}!important;border-color:${c.btnBorder}!important;box-shadow:0 2px 10px rgba(${c.dust},.35)}`,
    `${l} :is(.ee-nav,.ee-global-nav){border-top:1px solid transparent!important;border-image:${fadeLine(c.dust, c.line)}!important;box-shadow:0 -6px 20px rgba(${c.dust},.12)}`,
    `${l} .ee-nav a.active:before{background:${c.metal}!important;box-shadow:0 0 12px rgba(${c.dust},.7)!important}`,
    `${l} .ee-avatar{box-shadow:0 0 0 2px ${c.ring},0 0 14px rgba(${c.dust},.45)!important}`
  ].join("\n");
}
const THEME_EFFECTS = Object.fromEntries(Object.entries(LUXE).flatMap(([id, p]) => [[id, d => luxeDark(d, p)], [id + "Light", l => luxeLight(l, p)]]));

export function eagleEyeThemesCss(themes = EAGLEEYE_THEMES) {
  return themes.filter(t => t.tokens && SAFE_ID.test(t.id)).map(t => {
    const decls = Object.entries(TOKEN_VARS)
      .filter(([key]) => SAFE_COLOR.test(String(t.tokens[key] || "")))
      .map(([key, cssVar]) => `${cssVar}:${t.tokens[key]}`);
    if (t.tokens.accent && SAFE_COLOR.test(t.tokens.accent)) decls.push(`--ee-cyan-strong:${t.tokens.accent}`);
    return `html[data-ee-skin="${t.id}"]:not([data-eagle-theme="light"]){${decls.join(";")}}`;
  }).concat(themes.filter(t => t.tokens && SAFE_ID.test(t.id) && SAFE_COLOR.test(String(t.light || ""))).map(t => {
    // Light mode keeps light surfaces with a faint tint of the theme colour.
    const a = t.light;
    // KvK opponent colour, darkened for light backgrounds.
    const rival = { "#60a5fa": "#2563eb", "#fbbf24": "#d97706" }[String(t.tokens.rival || "").toLowerCase()] || "#dc2626";
    return `html[data-ee-skin="${t.id}"][data-eagle-theme="light"]{--ee-rival:${rival};--ee-cyan:${a};--ee-cyan-strong:${a};--ee-bg:color-mix(in srgb,${a} 5%,#f5f7fb);--ee-panel-raised:color-mix(in srgb,${a} 7%,#ffffff);--ee-border-soft:color-mix(in srgb,${a} 14%,#e2e8f0);--ee-border:color-mix(in srgb,${a} 22%,#cbd5e1)}`;
  })).concat(themes.filter(t => t.tokens && SAFE_ID.test(t.id)).map(t => {
    // Dark mode keeps the theme surface; light mode matches the shared light card palette.
    const dark = `html[data-ee-skin="${t.id}"]:not([data-eagle-theme="light"])`;
    const light = `html[data-ee-skin="${t.id}"][data-eagle-theme="light"]`;
    return `${dark} .gear-stat{background:var(--ee-panel-raised,#232529);color:var(--ee-subtext,#b0b4bb)}${dark} .gear-stat b{color:var(--ee-text,#f2f3f5)}${dark} .gear-gems{background:var(--ee-panel-raised,#232529);color:var(--ee-subtext,#b0b4bb)}${dark} .gear-gems b{color:var(--ee-text,#f2f3f5)}${light} .gear-stat{background:var(--ee-panel,#fff);color:var(--ee-subtext,#55657a);border:1px solid var(--ee-border-soft,#dbe3ee)}${light} .gear-stat b{color:var(--ee-text,#172033)}${light} .gear-gems{background:var(--ee-panel,#fff);color:var(--ee-subtext,#55657a);border:1px solid var(--ee-border-soft,#dbe3ee)}${light} .gear-gems b{color:var(--ee-text,#172033)}`;
  })).concat(themes.filter(t => t.effects && THEME_EFFECTS[t.effects] && SAFE_ID.test(t.id)).map(t => THEME_EFFECTS[t.effects](`html[data-ee-skin="${t.id}"]:not([data-eagle-theme="light"])`)))
    .concat(themes.filter(t => t.effects && THEME_EFFECTS[t.effects + "Light"] && SAFE_ID.test(t.id)).map(t => THEME_EFFECTS[t.effects + "Light"](`html[data-ee-skin="${t.id}"][data-eagle-theme="light"]`))).join("\n");
}

// Runs in <head> before the page paints, so there is no flash of the default colours.
export const EAGLEEYE_SKIN_BOOT_SCRIPT = `<script id="eagleeye-skin-boot">try{var d=document.documentElement,s=localStorage.getItem("eagleeye-skin");if(s&&/^[a-z][a-z0-9-]{1,30}$/.test(s))d.setAttribute("data-ee-skin",s);var m=localStorage.getItem("eagleeye-theme");if(m!=="light"&&m!=="dark")m=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";d.setAttribute("data-eagle-theme",m)}catch(e){}</script>`;

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
    const lock = t.reward ? ` data-reward="${escapeHtml(t.reward)}"` : "";
    return `<button type="button" class="skin${t.reward ? " locked" : ""}" data-skin="${escapeHtml(t.id)}"${lock} style="background:${k.bg};border-color:${k.border}">
<span class="skin-card" style="background:${k.panel}"><i style="background:${k.accent}"></i><b style="color:${k.text}">${escapeHtml(t.name)}</b><small style="color:${k.subtext}">${escapeHtml(t.description)}</small></span>
<span class="skin-bar"><em style="background:${k.accent}"></em><em style="background:${k.raised}"></em><em style="background:${k.subtext}"></em></span>
<span class="skin-check">✓ 使用中</span>${t.reward ? '<span class="skin-lock">🔒 運営からの招待で解放</span>' : ""}</button>`;
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
.skin-lock{display:none;font-size:11px;font-weight:800;color:#fde68a}.skin.locked .skin-lock{display:block}.skin.locked .skin-card,.skin.locked .skin-bar{opacity:.45;filter:grayscale(.4)}.skin[data-reward]:not(.locked){box-shadow:0 0 0 2px rgba(251,191,36,.55),0 0 18px rgba(251,191,36,.35)}
.sec{margin:20px 0 8px;font-size:15px}.modes{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.mode{display:flex;flex-direction:column;align-items:center;gap:2px;padding:12px 6px;border:2px solid var(--ee-border-soft);border-radius:14px;background:var(--ee-panel);color:var(--ee-text);font:inherit;font-weight:800;font-size:14px;cursor:pointer}.mode small{font-size:10px;font-weight:600;color:var(--ee-subtext)}.mode.on{border-color:var(--ee-cyan);background:color-mix(in srgb,var(--ee-cyan) 12%,var(--ee-panel))}
.note{margin-top:16px;padding:12px 14px;border:1px solid var(--ee-border-soft);border-radius:12px;background:var(--ee-panel);font-size:12px;color:var(--ee-subtext);line-height:1.6}
</style></head><body><main class="wrap"><a class="back" href="/">← ホーム</a><div class="eyebrow">着せ替え</div><h1>着せ替え</h1>
<p class="muted">好きな色を選ぶと、すべてのページの色が切り替わります。選んだテーマはこの端末に保存されます。</p>
<h2 class="sec">表示モード</h2>
<div class="modes" role="radiogroup" aria-label="表示モード"><button type="button" class="mode" data-mode="auto" role="radio">自動<small>端末に合わせる</small></button><button type="button" class="mode" data-mode="light" role="radio">☀️ ライト</button><button type="button" class="mode" data-mode="dark" role="radio">🌙 ダーク</button></div>
<h2 class="sec">カラー</h2>
<div class="grid">${EAGLEEYE_THEMES.map(swatch).join("")}</div>
<p class="muted">ライトモードでは、選んだカラーがアクセント色と背景のほんのりした色味になります。</p>
</main><script>(function(){var ids=${JSON.stringify(EAGLEEYE_THEMES.map(t => t.id))};function current(){try{var s=localStorage.getItem("eagleeye-skin");return ids.indexOf(s)>=0?s:"navy"}catch(e){return "navy"}}
function paint(){var c=current();document.querySelectorAll(".skin").forEach(function(b){b.classList.toggle("on",b.getAttribute("data-skin")===c)})}
function curMode(){try{var m=localStorage.getItem("eagleeye-theme");return m==="light"||m==="dark"?m:"auto"}catch(e){return "auto"}}
function applyMode(){var m=curMode(),eff=m==="auto"?(window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):m;document.documentElement.setAttribute("data-eagle-theme",eff);document.querySelectorAll(".mode").forEach(function(b){var on=b.getAttribute("data-mode")===m;b.classList.toggle("on",on);b.setAttribute("aria-checked",on?"true":"false")})}
document.querySelectorAll(".mode").forEach(function(b){b.addEventListener("click",function(){var m=b.getAttribute("data-mode");try{if(m==="auto")localStorage.removeItem("eagleeye-theme");else localStorage.setItem("eagleeye-theme",m)}catch(e){}applyMode()})});applyMode();
fetch("/api/rewards",{credentials:"same-origin",cache:"no-store"}).then(function(r){return r.ok?r.json():null}).then(function(d){var got=(d&&d.rewards)||[];document.querySelectorAll(".skin[data-reward]").forEach(function(b){if(got.indexOf(b.getAttribute("data-reward"))>=0)b.classList.remove("locked")})}).catch(function(){});
document.querySelectorAll(".skin").forEach(function(b){b.addEventListener("click",function(){if(b.classList.contains("locked")){alert("この着せ替えは、EagleEye運営からの招待リンクで登録した人だけが使える限定カラーです。");return}var id=b.getAttribute("data-skin");try{if(id==="navy")localStorage.removeItem("eagleeye-skin");else localStorage.setItem("eagleeye-skin",id)}catch(e){}
if(id==="navy")document.documentElement.removeAttribute("data-ee-skin");else document.documentElement.setAttribute("data-ee-skin",id);
paint()})});paint()})();</script></body></html>`;
}
