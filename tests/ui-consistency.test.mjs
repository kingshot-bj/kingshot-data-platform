import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { normalizeLegacyPalette, EAGLEEYE_LIGHT_TOKENS_CSS } from "../src/eagleeye-ui.js";

test("legacy colours become shared tokens by role; accents, gradients and text are untouched", () => {
  const out = normalizeLegacyPalette('<style>.a{background:#0f172a;border:1px solid #334155;color:#F8FAFC}.b{color:#f6c84b}.g{background:linear-gradient(135deg,#132a44,#0d1b2d)}.btn{background:#f59e0b;color:#0f172a}</style><p>#0f172a</p>');
  assert.ok(out.includes("background:var(--ee-bg,#0f172a)"));
  assert.ok(out.includes("border:1px solid var(--ee-border,#334155)"));
  assert.ok(out.includes("color:var(--ee-text,#F8FAFC)"));
  assert.ok(out.includes(".b{color:#f6c84b}"), "accents other than the theme cyan stay unchanged");
  assert.ok(out.includes("linear-gradient(135deg,#132a44,#0d1b2d)"), "gradient stops unchanged");
  assert.ok(out.includes(".btn{background:#f59e0b;color:#0f172a}"), "dark text on an accent button stays dark");
  assert.ok(out.includes("<p>#0f172a</p>"), "plain text unchanged");
  assert.equal(normalizeLegacyPalette(out), out, "idempotent");
  assert.ok(normalizeLegacyPalette('<style>body{background:#f5f5f7}.x{color:#94a3b8}</style>').includes("color:#94a3b8"), "light-designed pages are left alone");
  assert.ok(EAGLEEYE_LIGHT_TOKENS_CSS.includes('html[data-eagle-theme="light"]{--ee-bg:'));
});

test("every page goes through the palette normaliser and light tokens", async () => {
  const index = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  const fn = index.slice(index.indexOf("function applyEagleEyeTheme(html)"));
  assert.ok(fn.slice(0, 400).includes("html = normalizeLegacyPalette(html);"));
  assert.ok(index.includes("${EAGLEEYE_THEME_BASE_CSS}\n${EAGLEEYE_LIGHT_TOKENS_CSS}"));
});

test("one shared login screen, which returns to the page; only it hides the navigation", async () => {
  const index = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  assert.equal((index.match(/<h1>ログインが必要です<\/h1>/g) || []).length, 1, "only the shared screen has the heading");
  assert.ok((index.match(/return renderLoginRequiredPage\(request, /g) || []).length >= 7);
  const helper = index.slice(index.indexOf("function renderLoginRequiredPage"), index.indexOf("async function renderMyPlayerPage"));
  assert.ok(helper.includes("loginUrlFor(returnTo)") && helper.includes('name="viewport"') && helper.includes('<meta name="ee-page" content="login-required">'));
  assert.ok(index.includes(`const isLoginRequiredPage = html.includes('<meta name="ee-page" content="login-required">');`), "pages that only offer a login link keep the bottom navigation");
});

test("back links use the same wording", async () => {
  const files = (await readdir(new URL("../src/", import.meta.url))).filter(f => f.endsWith(".js"));
  for (const f of files) {
    const src = await readFile(new URL("../src/" + f, import.meta.url), "utf8");
    for (const legacy of ["← EagleEye<", "‹ EagleEye<", "← ADMIN CONTROL", "‹ 管理画面<", "← EagleEye HOME", "← EagleEye ホーム"]) {
      assert.ok(!src.includes(legacy), f + " still has " + legacy);
    }
  }
});
