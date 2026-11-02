import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderEagleEyeOtherMenu } from "../src/eagleeye-ui.js";
import { renderSitemapXml } from "../src/public-pages.js";

test("英雄カタログ is reachable from the menu, themed like other pages and listed in the sitemap", () => {
  assert.match(renderEagleEyeOtherMenu({}), /href="\/hero-catalog"[^>]*>[\s\S]*?英雄カタログ/);
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /return eagleEyeHtmlResponse\(await renderHeroCatalogPage\(iconByName\)\.text\(\)\)/);
  assert.match(renderSitemapXml("https://x", []), /<loc>https:\/\/x\/hero-catalog<\/loc>/);
});
