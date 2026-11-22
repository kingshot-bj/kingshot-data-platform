import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeLegacyPalette } from "../src/eagleeye-ui.js";

test("the 2nd place silver medal keeps its metallic colours after theme normalisation", () => {
  const src = readFileSync(new URL("../src/kingdom-portal.js", import.meta.url), "utf8");
  const rule = src.match(/\.rank-silver \.rank-position\{[^}]*\}/)[0];
  const out = normalizeLegacyPalette("<style>" + rule + "</style>");
  assert.ok(!out.includes("var(--ee-"), "silver is not remapped to a theme surface");
  assert.match(out, /rgb\(148,163,184\)/);
});
