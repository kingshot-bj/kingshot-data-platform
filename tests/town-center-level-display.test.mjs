// 役場レベル表記はゲーム内（30 → 黄金バッジ1〜、間は5マスの進行バー）に合わせる。API値は35=黄金1から5刻み。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatTownCenterLevel, townCenterBadgeHtml } from "../src/town-center-level.js";

const indexSrc = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const portalSrc = readFileSync(new URL("../src/kingdom-portal.js", import.meta.url), "utf8");

function extract(src, startPattern) {
  const start = src.search(startPattern);
  assert.ok(start >= 0, "function not found: " + startPattern);
  let depth = 0;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error("unterminated");
}

const clientText = new Function(extract(indexSrc, /function tc\(v\)\{/) + "; return tc;")();

const cases = [
  [25, "Lv.25"], [30, "Lv.30"], [32, "Lv.30（2/5）"],
  [35, "黄金1"], [40, "黄金2"], [43, "黄金2（3/5）"], [55, "黄金5"], [57, "黄金5（2/5）"], [70, "黄金8"]
];

for (const [level, expected] of cases) {
  test(`役場 ${level} → ${expected}`, () => {
    assert.equal(formatTownCenterLevel(level), expected);
    assert.equal(clientText(level), expected);
    assert.match(townCenterBadgeHtml(level), new RegExp(`title="${expected.replace(/[()（）]/g, "\\$&")}"`));
  });
}

test("旧表記（黄金5-1）やちょうどのレベルでの（n/5）を出さない", () => {
  for (const fmt of [formatTownCenterLevel, clientText]) {
    for (let l = 30; l <= 70; l++) {
      assert.doesNotMatch(String(fmt(l)), /-\d|\+/);
      if (l % 5 === 0) assert.doesNotMatch(String(fmt(l)), /\/5/);
    }
  }
});

test("黄金はゲーム風の金バッジ（SVG）に番号、途中は5マスのバー", () => {
  const exact = townCenterBadgeHtml(55);
  assert.match(exact, /<svg[^>]*>.*>5<\/text><\/svg>/);
  assert.equal((exact.match(/<i /g) || []).length, 0);
  const partial = townCenterBadgeHtml(43);
  assert.match(partial, />2<\/text>/);
  assert.equal((partial.match(/<i /g) || []).length, 5);
  assert.equal((partial.match(/rgb\(250,214,60\)/g) || []).length, 3);
  assert.equal(townCenterBadgeHtml(null), "-");
  assert.doesNotMatch(townCenterBadgeHtml("<x>"), /</);
});

test("クライアント埋め込み版が単体で動く（外部変数に依存しない）", () => {
  const src = "(function(){var __name=function(f){return f};return " + townCenterBadgeHtml.toString() + "})()";
  const fn = new Function("return " + src)();
  assert.equal(fn(57), townCenterBadgeHtml(57));
  assert.match(indexSrc, /var tcBadge=\$\{TC_BADGE_CLIENT_SOURCE\}/);
});

test("プレイヤー詳細・王国ポータルでバッジを使う", () => {
  assert.match(indexSrc, /townCenterBadgeHtml\(p\.town_center_level\)/);
  assert.match(portalSrc, /const townCenterDisplay = townCenterBadgeHtml;/);
});
