import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rankPercentText, renderKingdomTrend } from "../src/kingdom-insights.js";
import { allianceNameText } from "../src/public-pages.js";

test("プレビューのバナーに /preview/login へのリンクを出さない", () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.doesNotMatch(index, /href='\/preview\/login'/);
});

test("順位の割合：最下位近くで「上位100%」と出さない", () => {
  assert.equal(rankPercentText(1, 2630), "上位1%");
  assert.equal(rankPercentText(1315, 2630), "上位50%");
  assert.equal(rankPercentText(2609, 2630), "下位1%");
  assert.equal(rankPercentText(2630, 2630), "下位1%");
  assert.doesNotMatch(rankPercentText(2609, 2630), /100/);
});

test("基数が極端に小さいときは%を出さない", () => {
  const t = { power: { d30: 1561008, base: 1000, d7: null }, players: null, kills: null, parts: [] };
  const html = renderKingdomTrend(1, t, v => String(v));
  assert.doesNotMatch(html, /%/);
  const ok = renderKingdomTrend(1, { power: { d30: 100, base: 1000, d7: null }, players: null, kills: null, parts: [] }, v => String(v));
  assert.match(ok, /\+10%/);
});

test("取得エラーの仮の名前は「取得できず」と出す", () => {
  assert.equal(allianceNameText("ERROR [404]"), "取得できず");
  assert.equal(allianceNameText("Eagles"), "Eagles");
  assert.equal(allianceNameText(null), "");
});
