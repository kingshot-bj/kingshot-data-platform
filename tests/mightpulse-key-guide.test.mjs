import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeMightPulseApiKey } from "../src/user-eligibility.js";

const indexSource = await readFile(new URL("../src/index.js", import.meta.url), "utf8");

// Render the My KingShot page template the same way the Worker does, with
// interpolations removed, so we test the HTML/JS the browser actually gets.
function renderMyPlayerTemplate() {
  const fnAt = indexSource.indexOf("async function renderMyPlayerPage");
  const start = indexSource.indexOf("return `<!doctype html>", indexSource.indexOf("return `<!doctype html>", fnAt) + 1);
  const endMarker = "</script></body></html>`";
  const end = indexSource.indexOf(endMarker, start) + endMarker.length;
  const template = indexSource.slice(start + "return ".length, end);
  assert.ok(!/\$\{/.test(template), "page template is expected to have no interpolations");
  return (0, eval)(template);
}

const html = renderMyPlayerTemplate();
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes("setupKeyGuide"));

test("server normalizes pasted MightPulse keys", () => {
  assert.equal(normalizeMightPulseApiKey("  kss_abc123\n"), "kss_abc123");
  assert.equal(normalizeMightPulseApiKey("Bearer kss_abc123"), "kss_abc123");
  assert.equal(normalizeMightPulseApiKey("Authorization: Bearer kss_abc123"), "kss_abc123");
  assert.equal(normalizeMightPulseApiKey("kss_ab c\t123"), "kss_abc123");
  assert.equal(normalizeMightPulseApiKey(null), "");
});

test("My KingShot page script parses after template rendering", () => {
  assert.ok(script, "page script with key guide should be present");
  assert.doesNotThrow(() => new Function(script));
});

test("key registration shows a Japanese step guide with a direct MightPulse link", () => {
  assert.ok(script.includes("APIキーの作り方（無料・約1分）"));
  assert.ok(script.includes("Continue with Discord"));
  assert.ok(script.includes("Create API key"));
  assert.ok(script.includes("1回だけ"));
  assert.ok(script.includes('href="https://api.mightpulse.com/" target="_blank" rel="noopener noreferrer"'));
});

test("guide is open by default only until the user has contributed a key", () => {
  assert.ok(script.includes(`<details class="key-register-details"'+(a.hasMightPulseKey?'':' open')+'>`));
});

test("paste button, format hint and return-from-MightPulse prompt are wired", () => {
  assert.ok(script.includes('id="paste-key"'));
  assert.ok(script.includes("navigator.clipboard.readText"));
  assert.ok(script.includes("入力欄を長押しして「ペースト」"), "fallback when clipboard read is not allowed");
  assert.ok(script.includes('document.addEventListener("visibilitychange"'));
  assert.ok(script.includes("ee-mp-key-guide"));
  assert.ok(script.includes("setupKeyGuide();"));
});

test("client-side key normalization keeps regex escapes after template rendering", () => {
  const normalize = new Function(script.match(/function normalizeKeyInput\(value\)\{[^\n]*\}/)[0] + ";return normalizeKeyInput;")();
  assert.equal(normalize("  Bearer kss_ab cd\n"), "kss_abcd");
  assert.ok(script.includes("/^kss_[A-Za-z0-9_-]{8,}$/"));
});

test("rate-limit and temporary MightPulse errors are not reported as 500", () => {
  assert.ok(indexSource.includes('code === "MIGHTPULSE_API_KEY_RATE_LIMITED" ? 429'));
  assert.ok(indexSource.includes('code === "MIGHTPULSE_API_TEMPORARY_ERROR" ? 503'));
  assert.ok(indexSource.includes("const apiKey = normalizeMightPulseApiKey(body?.api_key);"));
});
