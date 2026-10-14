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

test("radar does not normalize the strongest selected player to 100% without a validated benchmark", () => {
  assert.ok(script.includes("function renderRadar()"));
  assert.ok(script.includes("固定の基準値とスコアの尺度が未検証"));
  assert.ok(script.includes("最強者＝100%"));
  assert.ok(script.includes("ランキング間の数値を直接比べないでください"));
  assert.ok(!script.includes("高いプレイヤー＝100%として相対化"));
});

test("details collapsing cannot move a wrapper into its own descendant", () => {
  assert.ok(script.includes("el.contains(panel)"));
  assert.ok(script.includes("panel.contains(el)"));
  assert.ok(!script.includes("['.panel','.power-showcase-wrap'"));
});

test("mobile chart layout keeps bars proportional and radar notice global", () => {
  assert.ok(script.includes("setProperty('width'"));
  assert.ok(script.includes("sm.textContent='スコア差'"));
  assert.ok(script.includes("function renderRadar()"));
  assert.ok(script.includes("ee-spark 3.6s ease-out var(--delay) infinite"));
  assert.ok(script.includes("ee-motion-in 1.6s"));
});
test("successful compare render removes the stale loading status", () => {
  assert.ok(indexSource.includes("function render(d){box.querySelectorAll('.status').forEach(el=>el.remove());"));
});

test("radar supports all selected players instead of only the first two", () => {
  assert.ok(script.includes("names.forEach((name,playerIndex)"));
  assert.ok(script.includes("Math.min(...rows.map(row=>row.entries.length))"));
  assert.ok(script.includes("playerCount+'人のプレイヤー比較レーダーチャート'"));
  assert.ok(!script.includes("}}).slice(0,2)"));
});

test("ring, bar, numeric, and custom ranking modes retain up to four players", () => {
  assert.ok(script.includes("const players=available"));
  assert.ok(script.includes("players.forEach((e,i)=>{const row"));
  assert.ok(script.includes("players.forEach(e=>{const cell"));
  assert.ok(script.includes("items.slice(0,4)"));
  assert.ok(script.includes("players.length+'人'"));
});
