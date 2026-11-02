import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { enhanceSeo, websiteJsonLd } from "../src/seo.js";
import { renderSitemapXml } from "../src/public-pages.js";
import { renderGoldCalculatorPage } from "../src/gold-calculator.js";
import { renderHeroShardPage } from "../src/hero-shards.js";

test("public pages get share cards; pages without canonical get noindex", () => {
  const pub = '<html><head><title>欠片計算 | EagleEye</title><meta name="description" content="説明"><link rel="canonical" href="https://eagleeye-ks.com/tools/hero-shards"></head><body></body></html>';
  const out = enhanceSeo(pub);
  for (const tag of ['property="og:title" content="欠片計算 | EagleEye"', 'property="og:description" content="説明"', 'property="og:url" content="https://eagleeye-ks.com/tools/hero-shards"', 'property="og:image" content="https://eagleeye-ks.com/assets/og/shards.jpg"', 'name="twitter:card" content="summary_large_image"', 'og:locale']) assert.ok(out.includes(tag), tag);
  assert.equal(enhanceSeo(out), out, "idempotent");
  assert.doesNotMatch(out, /noindex/);
  const priv = "<html><head><title>x</title></head><body></body></html>";
  assert.match(enhanceSeo(priv), /<meta name="robots" content="noindex"><\/head>/);
  const own = '<html><head><meta name="robots" content="noindex,nofollow"></head></html>';
  assert.equal(enhanceSeo(own), own);
});

test("Japanese search term キングショット in titles; structured data on tools and home", () => {
  assert.match(renderGoldCalculatorPage({ origin: "https://x" }), /<title>キングショット /);
  assert.match(renderGoldCalculatorPage({ origin: "https://x" }), /"@type":"WebApplication"/);
  assert.match(renderHeroShardPage({ origin: "https://x" }), /"@type":"BreadcrumbList"/);
  assert.match(websiteJsonLd("https://x"), /"@type":"WebSite"/);
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /<title>キングショット（KingShot）王国・プレイヤー観測と計算ツール \| EagleEye<\/title>/);
  assert.match(src, /class="ee-home-tools"/, "home links the free tools");
  for (const href of ["/tools/hero-shards", "/tools/gold", "/tools/gold-tech", "/hero-catalog"]) assert.ok(src.includes('<a href="' + href + '"><b>'), href);
});

test("sitemap lists only public (canonical) pages", () => {
  const map = renderSitemapXml("https://x", []);
  assert.doesNotMatch(map, /\/news</, "news needs a login");
  assert.match(map, /\/tools\/gold-tech</);
});

test("share card image per section (BJにゃん cards)", async () => {
  const { ogImagePath } = await import("../src/seo.js");
  const { existsSync } = await import("node:fs");
  const cases = { "/": "common", "/about": "common", "/tools/hero-shards": "shards", "/tools/gold": "gold", "/tools/gold-tech": "goldtech", "/hero-catalog": "heroes", "/heroes/zoe": "heroes", "/kingdoms": "kingdoms", "/k/1524": "kingdoms" };
  for (const [path, name] of Object.entries(cases)) {
    assert.equal(ogImagePath(path), `/assets/og/${name}.jpg`, path);
    assert.ok(existsSync(new URL(`../public/assets/og/${name}.jpg`, import.meta.url)), name + ".jpg exists");
  }
});
