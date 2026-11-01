import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { EAGLEEYE_THEMES, eagleEyeThemesCss, renderThemePickerPage, EAGLEEYE_SKIN_BOOT_SCRIPT } from "../src/themes.js";
import { normalizeLegacyPalette } from "../src/eagleeye-ui.js";

test("each colour theme sets the shared tokens in dark mode only", () => {
  const css = eagleEyeThemesCss();
  for (const t of EAGLEEYE_THEMES.filter(t => t.tokens)) {
    assert.ok(css.includes(`html[data-ee-skin="${t.id}"]:not([data-eagle-theme="light"]){--ee-bg:${t.tokens.bg}`), t.id);
    assert.ok(css.includes(`--ee-cyan:${t.tokens.accent}`), t.id + " accent");
  }
  assert.ok(EAGLEEYE_THEMES.length >= 6);
  assert.equal(new Set(EAGLEEYE_THEMES.map(t => t.id)).size, EAGLEEYE_THEMES.length, "unique ids");
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
