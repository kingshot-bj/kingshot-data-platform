// 総力の短い表示で、整数の末尾の0を消していた（329,637,495 → 「33M」）。2026-11-19
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compactPower } from "../src/kingdom-portal.js";
import { formatCompactNumber } from "../src/index.js";

for (const [name, f] of [["同盟のページ", compactPower], ["管理画面など", formatCompactNumber]]) {
  test(name + "：100以上の整数の0は消さない・小数点の後ろの0だけ消す", () => {
    assert.equal(f(329637495), "330M");
    assert.equal(f(210164007), "210M");
    assert.equal(f(260035695), "260M");
    assert.equal(f(179834637), "180M");
    assert.equal(f(100000000), "100M");
    assert.equal(f(494339313), "494M");
    assert.equal(f(46552786), "46.6M");
    assert.equal(f(18997025), "19M");
    assert.equal(f(20000000), "20M");
    assert.equal(f(1250000000), "1.25B");
    assert.equal(f(12083827049), "12.1B");
    assert.equal(f(2000), "2K");
  });
}

test("同じ書き方（整数にも末尾の0を消す正規表現をかける）がほかに残っていない", () => {
  for (const file of ["index.js", "kingdom-portal.js"]) {
    assert.doesNotMatch(readFileSync(new URL("../src/" + file, import.meta.url), "utf8"), /toFixed\(decimals\)\.replace\(\/\\\.\?0\+\$\|\\\.\$\//, file);
  }
});
