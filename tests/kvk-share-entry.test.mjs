// KvK の相手王国と比べて画像で共有する入口（2026-11-17）。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kvkCompareHref } from "../src/kvk.js";

test("相手王国との王国比較の URL（王国比較ページの kid=A&kid=B の形）", () => {
  assert.equal(kvkCompareHref(1524, 1600), "/kingdom/compare?kid=1524&kid=1600");
});

test("KvK ページとホームの KvK カードの両方に入口がある（ホームはカードを隠す時期は出さない）", () => {
  const kvk = readFileSync(new URL("../src/kvk.js", import.meta.url), "utf8");
  assert.match(kvk, /href="\$\{kvkCompareHref\(kid, matchup\.opponent\)\}">📤 相手王国と比べて画像で共有/);
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(index, /<a class="ee-kvk-share" id="homeKvkShare" href="\/kvk" hidden>/);
  assert.match(index, /ks\.href="\/kingdom\/compare\?kid="\+encodeURIComponent\(k\.kid\)\+"&kid="\+encodeURIComponent\(k\.opponent\)/);
  assert.match(index, /!\(k\.ended&&k\.ended_at&&Date\.now\(\)\/1000-Number\(k\.ended_at\)>3\*86400\)/);
});
