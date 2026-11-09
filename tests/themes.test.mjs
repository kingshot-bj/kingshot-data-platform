import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { EAGLEEYE_THEMES, eagleEyeThemesCss, renderThemePickerPage, EAGLEEYE_SKIN_BOOT_SCRIPT } from "../src/themes.js";
import { normalizeLegacyPalette } from "../src/eagleeye-ui.js";

test("each colour theme sets the shared tokens in dark mode only", () => {
  const css = eagleEyeThemesCss();
  assert.ok(EAGLEEYE_THEMES.length >= 6);
  assert.equal(new Set(EAGLEEYE_THEMES.map(t => t.id)).size, EAGLEEYE_THEMES.length, "unique ids");
  for (const t of EAGLEEYE_THEMES.filter(t => t.tokens)) {
    assert.ok(css.includes(`html[data-ee-skin="${t.id}"][data-eagle-theme="light"] .gear-stat{background:var(--ee-panel`), t.id + " light gear surface");
    assert.ok(css.includes(`html[data-ee-skin="${t.id}"][data-eagle-theme="light"] .gear-stat b{color:var(--ee-text`), t.id + " light gear value");
    assert.ok(css.includes(`html[data-ee-skin="${t.id}"][data-eagle-theme="light"] .gear-gems{background:var(--ee-panel`), t.id + " light gem surface");
    assert.ok(css.includes(`html[data-ee-skin="${t.id}"]:not([data-eagle-theme="light"]) .gear-stat b{color:var(--ee-text`), t.id + " dark gear value");
  }
});

test("unsafe theme definitions are ignored", () => {
  const css = eagleEyeThemesCss([{ id: "bad\"]{}x", tokens: { bg: "#000000" } }, { id: "ok", tokens: { bg: "red;}body{x", text: "#ffffff" } }]);
  assert.ok(!css.includes("bad"));
  assert.ok(css.includes('html[data-ee-skin="ok"]') && !css.includes("red;") && css.includes("--ee-text:#ffffff"));
});

test("picker previews keep each theme's own colours after the palette normaliser", () => {
  const page = normalizeLegacyPalette(renderThemePickerPage());
  assert.ok(page.includes('data-skin="navy" style="background:rgb(10,20,36)'), "navy preview not converted to the current theme");
  assert.ok(page.includes('data-skin="sakura"'));
  assert.ok(page.includes('localStorage.setItem("eagleeye-skin",id)'));
});

test("the saved theme is applied in <head> before paint, and the picker is linked from the menu", async () => {
  assert.ok(EAGLEEYE_SKIN_BOOT_SCRIPT.includes('localStorage.getItem("eagleeye-skin")') && EAGLEEYE_SKIN_BOOT_SCRIPT.includes("/^[a-z][a-z0-9-]{1,30}$/"));
  const index = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  assert.ok(index.includes('html.replace("<head>", "<head>" + EAGLEEYE_SKIN_BOOT_SCRIPT)'));
  assert.ok(index.includes("${eagleEyeThemesCss()}"));
  assert.ok(index.includes('if (url.pathname === "/settings/theme") return eagleEyeHtmlResponse(renderThemePickerPage());'));
  const ui = await readFile(new URL("../src/eagleeye-ui.js", import.meta.url), "utf8");
  assert.ok(ui.includes('key: "theme", href: "/settings/theme", label: "着せ替え"'));
});

test("the EagleEye cyan accent follows the theme", () => {
  assert.ok(normalizeLegacyPalette("<style>.a{color:#22d3ee;border-color:#22d3ee}</style>").includes("color:var(--ee-cyan,#22d3ee);border-color:var(--ee-cyan,#22d3ee)"));
});

test("ワインレッド：あまねの運営招待とオーナーだけの豪華カラー。ゴールドと同じ仕上げ（光沢・光る縁・きらめき）をダーク・ライト両方に", () => {
  const wine = EAGLEEYE_THEMES.find(t => t.id === "wine");
  assert.ok(wine, "ワインレッドがある");
  assert.equal(wine.name, "ワインレッド");
  assert.equal(wine.reward, "theme_wine", "限定");
  assert.equal(wine.effects, "wine");
  const css = eagleEyeThemesCss();
  const dark = 'html[data-ee-skin="wine"]:not([data-eagle-theme="light"])';
  const light = 'html[data-ee-skin="wine"][data-eagle-theme="light"]';
  assert.ok(css.includes(`${dark}{--ee-bg:#170a10`), "ダークの色");
  assert.ok(css.includes(`${dark} body{background:radial-gradient`), "背景のきらめき");
  assert.match(css, /@keyframes ee-wine-shine/);
  assert.ok(css.includes(`animation:ee-wine-shine 5s linear infinite`), "見出しの光沢が流れる");
  assert.ok(css.includes(`${dark} .ee-avatar{box-shadow:0 0 0 2px #e2b23a`), "光るリング");
  assert.ok(css.includes(`${light} body{background:radial-gradient(rgba(160,110,20`), "ライトモードの仕上げ");
  assert.ok(css.includes(`@media (prefers-reduced-motion:reduce){${dark}`), "動きを減らす設定では止める");
  assert.doesNotMatch(css, /data:image\/svg/, "ハートの模様は入れない");
  const sakura = EAGLEEYE_THEMES.find(t => t.id === "sakura");
  assert.notEqual(wine.tokens.accent, sakura.tokens.accent, "さくらと色を被らせない");
  // ゴールドの仕上げはそのまま
  assert.ok(css.includes('animation:ee-gold-shine 5s linear infinite'));
  const page = renderThemePickerPage();
  assert.match(page, /data-skin="wine"/);
  assert.match(page, /data-skin="wine" data-reward="theme_wine"/);
  assert.equal((page.match(/🔒 運営からの招待で解放/g) || []).length, 2, "ゴールドと同じ表示");
  assert.doesNotMatch(page, /あまね/, "画面に個人の名前は出さない");
});

test("豪華カラー：ホーム以外（その他メニュー・検索・ランキング・ウォッチ）のカードも光る縁にそろえる", () => {
  const css = eagleEyeThemesCss();
  for (const id of ["gold", "wine"]) {
    for (const mode of [':not([data-eagle-theme="light"])', '[data-eagle-theme="light"]']) {
      const sel = `html[data-ee-skin="${id}"]${mode}`;
      const card = css.split("\n").find(l => l.startsWith(`${sel} :is(.ee-tile`));
      assert.ok(card, id + mode);
      for (const c of [".ee-global-nav-links a", ".search-panel", ".search-intro", ".rank-row", ".rank-switch", ".watch-option"]) assert.ok(card.includes(c), id + " " + c);
      assert.ok(css.includes(`${sel} :is(.search-mode span,.search-input-row input,.rank-picker-trigger,.actions a,.rank-head button`), id + " 小さな部品の縁");
      assert.ok(css.includes(`${sel} .watch-hub{background:transparent!important}`), id + " ウォッチのトップは背景を見せる");
    }
  }
  assert.match(css, /\.ms-link button,\.search-input-row button\)\{background:linear-gradient\(180deg,#9e2a40/, "検索ボタンもワインの金属ボタン");
});

test("豪華カラー：見出しの光沢は、どの色の所でも地の色に対して読める（コントラスト4.5以上）", () => {
  const lum = h => { const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(1 + i, 3 + i), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const css = eagleEyeThemesCss();
  const wine = EAGLEEYE_THEMES.find(t => t.id === "wine");
  const stops = sel => { const line = css.split("\n").find(l => l.startsWith(sel + " :is(h1,")); return [...line.match(/background:linear-gradient\(100deg,([^)]*)\)/)[1].matchAll(/#[0-9a-f]{6}/gi)].map(m => m[0]); };
  for (const c of stops('html[data-ee-skin="wine"]:not([data-eagle-theme="light"])')) assert.ok(ratio(c, wine.tokens.panel) >= 4.5, "ダーク " + c);
  for (const c of stops('html[data-ee-skin="wine"][data-eagle-theme="light"]')) assert.ok(ratio(c, "#fffdf8") >= 4.5, "ライト " + c);
});
