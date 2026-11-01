import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { normalizeLegacyPalette } from "../src/eagleeye-ui.js";

const src = readdirSync(new URL("../src/", import.meta.url)).filter(f => f.endsWith(".js")).map(f => readFileSync(new URL("../src/" + f, import.meta.url), "utf8")).join("\n");

test("single px corner radii snap to the three shared radius tokens", () => {
  const out = normalizeLegacyPalette("<style>.a{border-radius:14px}.b{border-radius:999px}.c{border-radius:50%}.d{border-radius:20px 20px 0 0}.e{border-radius:22px!important}.f{border-radius:10px}.g{border-radius:4px}</style>");
  assert.match(out, /\.a\{border-radius:var\(--ee-radius-md,13px\)\}/);
  assert.match(out, /\.e\{border-radius:var\(--ee-radius-lg,17px\)!important\}/);
  assert.match(out, /\.f\{border-radius:var\(--ee-radius-sm,9px\)\}/);
  for (const keep of [".b{border-radius:999px}", ".c{border-radius:50%}", ".d{border-radius:20px 20px 0 0}", ".g{border-radius:4px}"]) assert.ok(out.includes(keep), keep);
  assert.equal(normalizeLegacyPalette(out), out);
});

test("page labels are Japanese and the former light admin pages use theme tokens", () => {
  for (const en of [">KINGDOM PORTAL<", ">PLAYER PROFILE<", ">ALLIANCE PROFILE<", ">EagleEye System Status<", ">ACCESS LEVEL<", "Some Services Degraded", "System Operational", "KINGSHOT INTELLIGENCE"]) assert.ok(!src.includes(en), en);
  assert.ok(!src.includes("background:#f5f5f7;color:#1d1d1f"), "no light-only admin page left");
});
