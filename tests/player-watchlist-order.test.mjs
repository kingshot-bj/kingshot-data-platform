// プレイヤーウォッチリスト：王国ごとに分け、王国内は秘境の試練の王国内順位順（順位なしは後ろで戦力順）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const line = name => { const m = src.match(new RegExp("const " + name + "=.*;\\n")); assert.ok(m, name); return m[0]; };

test("王国内は秘境の試練の順位順、順位なしは戦力順で後ろ", () => {
  const fn = new Function(line("mysticRank") + line("byStrength") + "return byStrength;")();
  const p = (id, rank, power) => ({ id, power, summary: { ranking_changes: rank == null ? [] : [{ board: "mystic_trial", current: rank }] } });
  const list = [p("a", null, 900), p("b", 5, 100), p("c", 2, 50), p("d", null, 1000)].sort(fn).map(x => x.id);
  assert.deepEqual(list, ["c", "b", "d", "a"]);
});

test("王国ごとに見出し付きで表示し、人数の多い王国が先", () => {
  assert.match(src, /kingdomOrder=\[\.\.\.groups\.keys\(\)\]\.sort\(\(a,b\)=>\(groups\.get\(b\)\.length-groups\.get\(a\)\.length\)/);
  assert.match(src, /<section class="kingdom-group"><h2 class="kingdom-head">/);
  assert.match(src, /秘境の試練の王国内順位順/);
});
