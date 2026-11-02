import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HERO_SKILLS_JA } from "../src/hero-skills-ja.js";
import { HERO_SLUGS, heroNameBySlug, heroPagePaths, heroGeneration, heroSummary, renderHeroPage } from "../src/hero-pages.js";
import { renderSitemapXml } from "../src/public-pages.js";
import { renderHeroCatalogPage } from "../src/hero-catalog-page.js";

test("every catalog hero has a unique slug and a page", () => {
  const names = Object.keys(HERO_SKILLS_JA);
  const slugs = names.map(n => HERO_SLUGS[n]);
  assert.ok(slugs.every(Boolean), "missing slug: " + names.filter(n => !HERO_SLUGS[n]).join(","));
  assert.equal(new Set(slugs).size, slugs.length);
  for (const n of names) {
    assert.equal(heroNameBySlug(HERO_SLUGS[n]), n);
    const html = renderHeroPage(n, { origin: "https://eagleeye-ks.com" });
    assert.match(html, /<title>.+ \| EagleEye<\/title>/, n);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://eagleeye-ks.com/heroes/${HERO_SLUGS[n]}">`));
  }
  assert.equal(heroNameBySlug("nope"), "");
  assert.equal(renderHeroPage("存在しない"), null);
});

test("hero facts come from the timeline, rarity and shard data", () => {
  assert.equal(heroGeneration("ゾーイ").generation, 2);
  assert.deepEqual(heroGeneration("マリン").peers, ["ゾーイ", "ヒルデ"], "catalog spelling マリン maps to マーリン");
  assert.equal(heroGeneration("ファハド"), null, "epic heroes are not in the SSR timeline");
  assert.match(heroSummary("アマデウス"), /開設直後/);
  assert.match(heroSummary("アマデウス"), /専用の欠片だけ/);
  assert.match(heroSummary("ファハド"), /エピック英雄（騎兵）/);
  const zoe = renderHeroPage("ゾーイ", { origin: "https://x" });
  assert.match(zoe, /<h1>ゾーイ<\/h1>/);
  assert.match(zoe, /1,065個/);
  assert.match(zoe, /href="\/heroes\/hilde"/, "same-generation links");
  assert.match(zoe, /href="\/tools\/hero-shards\?hero=%E3%82%BE%E3%83%BC%E3%82%A4"/, "jumps into the shard calculator");
  assert.match(zoe, /"@type":"BreadcrumbList"/);
  assert.match(zoe, /ログインして自分の英雄を見る/);
  assert.doesNotMatch(renderHeroPage("ゾーイ", { signedIn: true }), /ログインして自分の英雄を見る/);
});

test("wired into routes, sitemap, catalog and the shard calculator", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /url\.pathname\.match\(\/\^\\\/heroes\\\/\(\[a-z-\]\{2,40\}\)\\\/\?\$\/\)/);
  assert.match(src, /servePublicPage\(request, env, executionContext, async signedIn => \{ let iconByName = \{\}/);
  const map = renderSitemapXml("https://x", []);
  assert.equal(heroPagePaths().length, Object.keys(HERO_SKILLS_JA).length);
  assert.match(map, /<loc>https:\/\/x\/heroes\/zoe<\/loc>/);
  assert.match(readFileSync(new URL("../src/hero-shards.js", import.meta.url), "utf8"), /new URLSearchParams\(location\.search\)\.get\("hero"\)/);
});

test("catalog links to each hero page", async () => {
  const html = await renderHeroCatalogPage({}).text();
  assert.match(html, /href="\/heroes\/zoe">ゾーイの個別ページ/);
});

test("unknown hero slugs are a 404 page, not the home page", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /return eagleEyeHtmlResponse\(renderHeroNotFoundPage\(\), 404\);/);
});
