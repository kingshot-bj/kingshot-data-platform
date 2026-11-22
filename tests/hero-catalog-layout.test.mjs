import test from "node:test";
import assert from "node:assert/strict";
import { renderHeroCatalogPage } from "../src/hero-catalog-page.js";

test("skills with long values put the values on their own row (name keeps its width)", async () => {
  const html = await renderHeroCatalogPage({}).text();
  assert.match(html, /skill-card-top long"><div><span class="skill-kind">SKILL<\/span><h4>カラーセンス<\/h4>/);
  assert.match(html, /\.skill-card-top\.long\{display:flex!important;flex-direction:column/);
  assert.match(html, /skill-card-top"><div><span class="skill-kind">SKILL<\/span><h4>クール&amp;ホット<\/h4>/, "short values keep the side-by-side layout");
});
