import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TECH_NODES, TECH_TOTALS, techBetween, renderGoldTechPage } from "../src/gold-tech.js";
import { renderSitemapXml } from "../src/public-pages.js";
import { renderEagleEyeOtherMenu } from "../src/eagleeye-ui.js";

test("every research adds up to the table's total row (T11 COST)", () => {
  for (const n of TECH_NODES) {
    assert.equal(n.dust.reduce((a, b) => a + b, 0), TECH_TOTALS[n.key][0], n.key + " dust");
    assert.equal(n.coinK.reduce((a, b) => a + b, 0), TECH_TOTALS[n.key][1], n.key + " coin");
  }
  // The table's 13,415 / 3,990 is the first six researches plus the unlock.
  const keys = ["base", "tier2_left", "tier2_right", "legion", "tier4_left", "tier4_right", "unlock"];
  assert.equal(keys.reduce((a, k) => a + TECH_TOTALS[k][0], 0), 13415);
  assert.equal(keys.reduce((a, k) => a + TECH_TOTALS[k][1], 0), 3990);
});

test("techBetween: dust and coins (table coins are thousands)", () => {
  assert.deepEqual(techBetween("legion", 0, 12), { dust: 3745, coin: 1008000 });
  assert.deepEqual(techBetween("heal", 9, 10), { dust: 1530, coin: 450000 });
  assert.deepEqual(techBetween("unlock", 0, 1), { dust: 2236, coin: 1000000 });
  assert.deepEqual(techBetween("base", 3, 3), { dust: 0, coin: 0 });
  assert.deepEqual(techBetween("base", 0, 99), { dust: 252, coin: 80000 }, "clamped to max level");
});

test("page: names from the game, branches, wiring", () => {
  const html = renderGoldTechPage({ origin: "https://eagleeye-ks.com" });
  assert.match(html, /<title>キングショット 黄金テクノロジー研究（T11）計算ツール \| EagleEye<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/eagleeye-ks\.com\/tools\/gold-tech">/);
  for (const t of ["黄金微粒子", "コイン", "黄金軍団", "黄金〇兵治療", "data-br=\"cavalry\"", "Pandafather"]) assert.ok(html.includes(t), t);
  assert.doesNotMatch(html, /#[0-9a-f]{6}"/i);
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /url\.pathname === "\/tools\/gold-tech"\) return await servePublicCached/);
  assert.match(renderSitemapXml("https://x", []), /<loc>https:\/\/x\/tools\/gold-tech<\/loc>/);
  assert.match(renderEagleEyeOtherMenu({}), /href="\/tools\/gold-tech"/);
});
