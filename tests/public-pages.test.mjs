import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderPublicKingdomPage, renderPublicKingdomsIndex, renderRobotsTxt, renderSitemapXml, compactNumber } from "../src/public-pages.js";

const data = {
  catalog: { kid: 1524, name: "1524" },
  players: [{ rank: 1, nick_name: "<script>x</script>", score: 9876543210, abbr: "TNC" }],
  alliances: [{ rank: 1, abbr: "TNC", name: "にゃっぷ", score: 13600000000 }],
  matchup: { season: 23, opponent: 1530 },
  score: null,
  growth: { latest: { power: 123456789012, power_rank: 10, power_gain_7d: 2000000000, player_count: 900 }, latestAt: 1793577600, comparisons: [{ label: "7日前", snapshot: { power: 120000000000, power_rank: 12 } }] }
};

test("public kingdom page: SEO tags, escaped content, KvK link and a login call to action", () => {
  const html = renderPublicKingdomPage(1524, data, { origin: "https://eagleeye-ks.com" });
  assert.match(html, /<title>王国1524の戦力・ランキング・KvK情報 \| EagleEye<\/title>/);
  assert.match(html, /<meta name="description" content="KingShot 王国1524の総戦力123B/);
  assert.match(html, /<link rel="canonical" href="https:\/\/eagleeye-ks\.com\/k\/1524">/);
  assert.match(html, /application\/ld\+json[\s\S]*BreadcrumbList/);
  assert.ok(!html.includes("<script>x</script>"), "player names are escaped");
  assert.match(html, /href="\/k\/1530">王国 1530/);
  assert.match(html, /7日 −2位|7日 \+?−?2/);
  assert.match(html, /Discordでログイン/);
  assert.match(html, /APIキー/);
  assert.match(renderPublicKingdomPage(1524, data, { origin: "", signedIn: true }), /\/kingdom\?kid=1524/);
});

test("pages without data still render helpful text", () => {
  const html = renderPublicKingdomPage(9, { catalog: null, players: [], alliances: [], matchup: null, score: null, growth: null }, {});
  assert.match(html, /集計データはまだありません/);
  assert.match(html, /ウォッチリストに入ると自動で取得/);
});

test("index, robots and sitemap", () => {
  const index = renderPublicKingdomsIndex([1, 2, 101, 1524], { origin: "https://x" });
  assert.match(index, /王国 1〜100[\s\S]*href="\/k\/2"/);
  assert.match(index, /王国 1501〜1600[\s\S]*href="\/k\/1524"/);
  const robots = renderRobotsTxt("https://x");
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Sitemap: https:\/\/x\/sitemap\.xml/);
  const sm = renderSitemapXml("https://x", [1524], "2026-11-02");
  assert.match(sm, /<loc>https:\/\/x\/k\/1524<\/loc><lastmod>2026-11-02<\/lastmod>/);
  assert.equal(compactNumber(123456789012), "123B");
});

test("routes are public and cached for signed-out visitors", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /url\.pathname === "\/robots\.txt"/);
  assert.match(src, /url\.pathname === "\/sitemap\.xml"/);
  assert.match(src, /url\.pathname === "\/kingdoms"\) return await servePublicPage/);
  assert.match(src, /\\\/k\\\/\(\\d\{1,6\}\)/);
  assert.match(src, /async function servePublicPage[\s\S]*?if \(auth\?\.status === "ACTIVE"\) return eagleEyeHtmlResponse\(await render\(true\)\)[\s\S]*?return servePublicCached/);
  assert.match(src, /response\.headers\.set\("cache-control", "public, max-age=" \+ maxAge\)/);
});
