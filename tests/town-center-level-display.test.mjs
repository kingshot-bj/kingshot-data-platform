// 役場レベル表記はゲーム内（30 → 黄金バッジ1〜、間は5マスの進行バー）に合わせる。API値は35=黄金1から5刻み。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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

const serverFmt = new Function(extract(indexSrc, /function formatTownCenterLevel\(/) + "; return formatTownCenterLevel;")();
const clientFmt = new Function(extract(indexSrc, /function tc\(v\)\{/) + "; return tc;")();
const portalFmt = new Function("return (" + extract(portalSrc, /const townCenterDisplay = value => \{/).replace(/^const townCenterDisplay = /, "") + ");")();
const plain = s => String(s).replace(/<[^>]+>/g, "");

const cases = [
  [25, "Lv.25"], [30, "Lv.30"], [32, "Lv.30（2/5）"],
  [35, "黄金1"], [40, "黄金2"], [55, "黄金5"], [57, "黄金5（2/5）"], [43, "黄金2（3/5）"], [70, "黄金8"]
];

for (const [level, expected] of cases) {
  test(`役場 ${level} → ${expected}`, () => {
    assert.equal(serverFmt(level), expected);
    assert.equal(clientFmt(level), expected);
    assert.equal(plain(portalFmt(level)), expected);
  });
}

test("旧表記（黄金5-1）やちょうどのレベルでの（n/5）を出さない", () => {
  for (const fmt of [serverFmt, clientFmt, v => plain(portalFmt(v))]) {
    for (let l = 30; l <= 70; l++) {
      assert.doesNotMatch(String(fmt(l)), /-\d|\+/);
      if (l % 5 === 0) assert.doesNotMatch(String(fmt(l)), /\/5/);
    }
  }
});
