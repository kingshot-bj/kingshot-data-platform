import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GOLD_COSTS, GOLD_TOTALS, goldBetween, renderGoldCalculatorPage, GOLD_NAME, REFINED_GOLD_NAME } from "../src/gold-calculator.js";
import { renderSitemapXml } from "../src/public-pages.js";
import { renderEagleEyeOtherMenu } from "../src/eagleeye-ui.js";
import { KINGDOM_TIMELINE } from "../src/kingdom-timeline.js";

test("each TG column adds up to the table's total row", () => {
  for (let i = 0; i < 8; i++) {
    const sum = Object.values(GOLD_COSTS).reduce((a, b) => { const c = b.costs[i]; return c ? [a[0] + c[0], a[1] + c[1]] : a; }, [0, 0]);
    assert.deepEqual(sum, GOLD_TOTALS[i], "TG" + (i + 1));
  }
  assert.deepEqual(GOLD_COSTS.town_center.costs.slice(0, 5).map(c => c[0]), [660, 790, 1190, 1400, 1675], "matches kingshotguide.org");
  assert.equal(GOLD_COSTS.war_academy.costs[0], null, "war academy starts at TG2");
});

test("goldBetween sums the levels after the current one", () => {
  assert.deepEqual(goldBetween("town_center", 0, 8), { gold: 660 + 790 + 1190 + 1400 + 1675 + 900 + 1080 + 1080, refined: 270 });
  assert.deepEqual(goldBetween("embassy", 5, 6), { gold: 225, refined: 13 });
  assert.deepEqual(goldBetween("war_academy", 0, 2), { gold: 355, refined: 0 });
  assert.deepEqual(goldBetween("town_center", 4, 4), { gold: 0, refined: 0 });
  assert.deepEqual(goldBetween("nope", 0, 8), { gold: 0, refined: 0 });
});

test("page uses the Japanese in-game name 黄金 and runs in the browser", () => {
  const html = renderGoldCalculatorPage({ origin: "https://eagleeye-ks.com" });
  assert.equal(GOLD_NAME, "黄金");
  assert.match(html, /<title>黄金 必要数計算ツール（TG1〜TG8） \| EagleEye<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/eagleeye-ks\.com\/tools\/gold">/);
  assert.doesNotMatch(html, /トゥルーゴールド|Truegold/i);
  assert.ok(html.includes(REFINED_GOLD_NAME));
  assert.doesNotMatch(html, /#[0-9a-f]{6}"/i, "SVG colours use rgb()");
  // Run the client with a tiny fake DOM.
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const keys = Object.keys(GOLD_COSTS);
  const mkSel = () => ({ value: "0" });
  const rows = Object.fromEntries(keys.map(k => [k, { dataset: { b: k }, sel: { c: mkSel(), t: mkSel() }, need: { innerHTML: "" }, querySelector(q) { return q === ".need" ? this.need : q.includes('"c"') ? this.sel.c : this.sel.t; } }]));
  const els = { gtotal: { innerHTML: "" }, hg: { value: "", addEventListener() {} }, hr: { value: "", addEventListener() {} }, allc: { value: "0", addEventListener(t, f) { this.f = f; } }, allt: { value: "8", addEventListener(t, f) { this.f = f; } } };
  const doc = { getElementById: id => els[id], querySelector: q => { if (q === ".gold-rows") return { addEventListener() {} }; const m = q.match(/data-b="([a-z_]+)"/); return m ? rows[m[1]] : null; } };
  const store = {};
  new Function("document", "localStorage", script)(doc, { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } });
  assert.match(els.gtotal.innerHTML, /黄金 合計 <b>29,927<\/b>/, "every building TG0→TG8");
  assert.match(els.gtotal.innerHTML, /精製黄金 合計 <b>908<\/b>/);
});

test("wired into route, sitemap, menu; timeline says 黄金", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /url\.pathname === "\/tools\/gold"\) return await servePublicCached/);
  assert.match(renderSitemapXml("https://x", []), /<loc>https:\/\/x\/tools\/gold<\/loc>/);
  assert.match(renderEagleEyeOtherMenu({}), /href="\/tools\/gold"/);
  assert.ok(!JSON.stringify(KINGDOM_TIMELINE).includes("トゥルーゴールド"));
  assert.ok(JSON.stringify(KINGDOM_TIMELINE).includes("黄金解放"));
});

test("refined material uses the in-game name 精製黄金", () => {
  assert.equal(REFINED_GOLD_NAME, "精製黄金");
  assert.ok(!renderGoldCalculatorPage().includes("精錬黄金"));
  assert.ok(JSON.stringify(KINGDOM_TIMELINE).includes("精製黄金"));
});
