import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const moduleSource = await readFile(new URL("../src/player-compare-enhancements.js", import.meta.url), "utf8");
const indexSource = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
const start = moduleSource.indexOf("String.raw`") + "String.raw`".length;
const end = moduleSource.lastIndexOf("`;");
assert.ok(start > 0 && end > start, "enhancement HTML template should be present");
const html = moduleSource.slice(start, end);
const script = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)?.[1];
assert.ok(script, "enhancement script should be present");

test("player compare enhancement script parses", () => {
  assert.doesNotThrow(() => new Function(script));
});

test("chart modes and preference persistence are present", () => {
  for (const mode of ["ring", "bar", "radar", "number"]) assert.ok(script.includes("'" + mode + "'"));
  assert.ok(script.includes("eagleeye-player-compare-chart-v1"));
  assert.ok(script.includes("prefers-reduced-motion"));
});

test("additional ranking candidates require saved numeric scores for both players", () => {
  assert.ok(indexSource.includes("dataset.rankScore=String(score)"));
  assert.ok(script.includes("metric.dataset.rankScore"));
  assert.ok(script.includes("items.length>=2"));
  assert.ok(script.includes("eagleeye-player-compare-custom-rankings-v1"));
  assert.ok(script.includes("eagleeye-player-compare-order-v1"));
});

test("radar does not fabricate a cross-ranking aggregate", () => {
  assert.ok(script.includes("評価尺度の同一性が未確認"));
  assert.ok(script.includes("同じ単位・同じ評価ルール"));
});

test("details collapsing cannot move a wrapper into its own descendant", () => {
  assert.ok(script.includes("el.contains(panel)"));
  assert.ok(script.includes("panel.contains(el)"));
  assert.ok(!script.includes("['.panel','.power-showcase-wrap'"));
});
