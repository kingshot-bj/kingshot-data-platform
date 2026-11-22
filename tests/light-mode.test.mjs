import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeLegacyPalette, EAGLEEYE_LIGHT_TOKENS_CSS } from "../src/eagleeye-ui.js";
import { eagleEyeThemesCss, renderThemePickerPage, EAGLEEYE_SKIN_BOOT_SCRIPT } from "../src/themes.js";

const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

test("display mode: auto follows the device, light/dark are explicit choices, applied before first paint", () => {
  assert.match(EAGLEEYE_SKIN_BOOT_SCRIPT, /eagleeye-theme/);
  assert.match(EAGLEEYE_SKIN_BOOT_SCRIPT, /prefers-color-scheme: light/);
  assert.match(EAGLEEYE_SKIN_BOOT_SCRIPT, /setAttribute\("data-eagle-theme",m\)/);
  const page = renderThemePickerPage();
  for (const mode of ['data-mode="auto"', 'data-mode="light"', 'data-mode="dark"']) assert.ok(page.includes(mode), mode);
  assert.match(page, /表示モード/);
});

test("light tokens include a readable accent and on-accent text; the old paint-everything rules are gone", () => {
  assert.match(EAGLEEYE_LIGHT_TOKENS_CSS, /--ee-cyan:#0891b2/);
  assert.match(EAGLEEYE_LIGHT_TOKENS_CSS, /--ee-on-accent:#ffffff/);
  assert.ok(!index.includes('html[data-eagle-theme="light"] button{background:#22d3ee'), "buttons are not all painted cyan");
  assert.ok(!index.includes('html:not([data-eagle-theme="light"]) .ee-global-nav{'), "nav surfaces are token based in both modes");
  assert.match(index, /html\[data-eagle-theme="light"\] :where\(\.ee-global-nav-links a/);
});

test("colour themes also apply in light mode with a dark enough accent and opponent colour", () => {
  const css = eagleEyeThemesCss();
  assert.match(css, /html\[data-ee-skin="sakura"\]\[data-eagle-theme="light"\]\{--ee-rival:#2563eb;--ee-cyan:#db2777/);
  assert.match(css, /html\[data-ee-skin="forest"\]\[data-eagle-theme="light"\]\{--ee-rival:#dc2626;--ee-cyan:#059669/);
});

test("page-local colours follow the tokens by lightness, including page colour variables", () => {
  const out = normalizeLegacyPalette("<style>:root{--bg:#050b14;--text:#eff8ff;--line:#23415f;--gold:#f6c84b}.a{color:#f0f8ff;background:#12263b}.b{background:#ef4444;color:#fff}.c{color:#8be9f8}.d{background:#321b2a;color:#ffb4bc}</style>");
  assert.match(out, /--bg:var\(--ee-bg,#050b14\)/);
  assert.match(out, /--text:var\(--ee-text,#eff8ff\)/);
  assert.match(out, /--line:var\(--ee-border-soft,#23415f\)/);
  assert.match(out, /--gold:#f6c84b/, "accents stay");
  assert.match(out, /\.a\{color:var\(--ee-text,#f0f8ff\);background:var\(--ee-panel,#12263b\)\}/);
  assert.match(out, /\.b\{background:#ef4444;color:#fff\}/, "text on an accent background keeps its colour");
  assert.match(out, /\.c\{color:var\(--ee-cyan,#8be9f8\)\}/);
  assert.match(out, /\.d\{background:#321b2a;color:#ffb4bc\}/, "warm danger surfaces are not remapped");
  assert.equal(normalizeLegacyPalette(out), out);
});
