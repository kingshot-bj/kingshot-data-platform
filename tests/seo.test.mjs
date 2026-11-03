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
  const ownOut = enhanceSeo(own);
  assert.equal((ownOut.match(/name="robots"/g) || []).length, 1, "既存のrobots指定は変えない");
  assert.match(ownOut, /content="noindex,nofollow"/);
  assert.equal(enhanceSeo(ownOut), ownOut, "idempotent");
});

test("Japanese search term キングショット in titles; structured data on tools and home", () => {
  assert.match(renderGoldCalculatorPage({ origin: "https://x" }), /<title>キングショット /);
  assert.match(renderGoldCalculatorPage({ origin: "https://x" }), /"@type":"WebApplication"/);
  assert.match(renderHeroShardPage({ origin: "https://x" }), /"@type":"BreadcrumbList"/);
  assert.match(websiteJsonLd("https://x"), /"@type":"WebSite"/);
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /<title>キングショット（KingShot）分析・攻略ツール｜王国・プレイヤー観測 \| EagleEye<\/title>/);
  assert.match(src, /class="ee-home-tools"/, "home links the free tools");
  for (const href of ["/tools/hero-shards", "/tools/gold", "/tools/gold-tech", "/hero-catalog"]) assert.ok(src.includes('<a href="' + href + '"><h3 class="ee-h"><b>'), href);
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

test("ホームに本物のH1がある（CSSの疑似要素の文字は検索エンジンに見えない）", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /<h1 class="ee-welcome-h1">キングショット 分析・攻略ダッシュボード<\/h1>/);
  assert.match(src, /\.ee-welcome-copy:before\{content:none!important/);
});

test("全ページにファビコン・ホーム画面アイコン・theme-color（既にあれば足さない）", async () => {
  const { existsSync } = await import("node:fs");
  const out = enhanceSeo("<html><head><title>x</title></head><body></body></html>");
  assert.match(out, /<link rel="icon" href="\/favicon\.ico" sizes="48x48">/);
  assert.match(out, /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png">/);
  assert.match(out, /<meta name="theme-color" content="#0b1424">/);
  const has = '<html><head><link rel="icon" href="/x.png"><meta name="theme-color" content="#fff"><link rel="canonical" href="https://eagleeye-ks.com/"></head></html>';
  const o2 = enhanceSeo(has);
  assert.equal((o2.match(/rel="icon"/g) || []).length, 1);
  assert.equal((o2.match(/theme-color/g) || []).length, 1);
  for (const f of ["favicon.ico", "apple-touch-icon.png", "assets/eagleeye/icons/icon-192.png", "assets/eagleeye/icons/favicon-48.png"]) assert.ok(existsSync(new URL("../public/" + f, import.meta.url)), f);
});

test("王国一覧：日本語H1と構造化データ（パンくず）", async () => {
  const { renderPublicKingdomsIndex } = await import("../src/public-pages.js");
  const html = renderPublicKingdomsIndex([1, 2, 1524], { origin: "https://eagleeye-ks.com" });
  assert.match(html, /<h1>キングショット 王国一覧<\/h1>/);
  assert.match(html, /"@type":"BreadcrumbList"/);
});

test("ホームの見出し構造：H1→H2（主要メニュー・ツール）→H3（各メニュー・各ツール）、分析・攻略のキーワード", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /<h2 class="ee-h"><b>主要メニュー<\/b><\/h2>/);
  assert.equal((src.match(/<h3 class="ee-h"><strong>/g) || []).length, 6, "主要メニュー6つ");
  assert.match(src, /<a href="\/tools\/gold"><h3 class="ee-h"><b>黄金計算<\/b><\/h3>/);
  assert.match(src, /content="キングショット（KingShot）の分析・攻略に役立つ/);
});
