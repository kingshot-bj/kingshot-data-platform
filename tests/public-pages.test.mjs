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
  assert.match(html, /<title>王国1524の戦力・ランキング・KvK情報｜キングショット \| EagleEye<\/title>/);
  assert.match(html, /<meta name="description" content="キングショット（KingShot）王国1524の総戦力123B/);
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

test("SEO：存在しない王国は404・検索に載せない。データがない王国も載せない", async () => {
  const { publicKingdomExists, renderPublicKingdomNotFound } = await import("../src/public-pages.js");
  const db = rows => ({ prepare: () => ({ bind: () => ({ first: async () => rows }) }) });
  assert.equal(await publicKingdomExists(db({ ok: 1 }), 1524), true);
  assert.equal(await publicKingdomExists(db(null), 99999), false);
  assert.equal(await publicKingdomExists(db(null), 0), false);
  const nf = renderPublicKingdomNotFound(99999);
  assert.match(nf, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(nf, /rel="canonical"/);
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(index, /if \(!\(await publicKingdomExists\(env\.DB, kid\)\)\) return eagleEyeHtmlResponse\(renderPublicKingdomNotFound\(kid\), 404\);/);
  const empty = renderPublicKingdomPage(9, { catalog: { kid: 9 }, players: [], alliances: [], matchup: null, score: null, growth: null }, { origin: "https://eagleeye-ks.com" });
  assert.match(empty, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(empty, /rel="canonical"/);
  assert.match(renderPublicKingdomPage(1524, data, { origin: "https://eagleeye-ks.com" }), /rel="canonical"/);
});

test("SEO：タイムラインの全体表は専用ページへ（王国ページで全ページ同じ文章を出さない）", async () => {
  const { renderPublicTimelinePage } = await import("../src/public-pages.js");
  const html = renderPublicKingdomPage(1524, { ...data, age: 301 }, { origin: "https://eagleeye-ks.com" });
  assert.match(html, /<a href="\/kingdom-timeline">タイムライン全体/);
  assert.doesNotMatch(html, /<details class="tl-all">/);
  assert.match(html, /次に解放されるもの/);
  const page = renderPublicTimelinePage({ origin: "https://eagleeye-ks.com" });
  assert.match(page, /<link rel="canonical" href="https:\/\/eagleeye-ks\.com\/kingdom-timeline">/);
  assert.match(page, /第7世代 SSR英雄/);
  assert.match(renderSitemapXml("https://eagleeye-ks.com", [1]), /<loc>https:\/\/eagleeye-ks\.com\/kingdom-timeline<\/loc>/);
  // ログイン後の王国ページは従来どおりページ内で全体を開ける
  const portal = readFileSync(new URL("../src/kingdom-portal.js", import.meta.url), "utf8");
  assert.match(portal, /renderKingdomTimelineSection\(timelineAge, \{ kid \}\)/);
});

test("SEO：関連する王国（戦力順位が近い・近い番号）へのリンク。読み取りは主キーと索引の範囲だけ", async () => {
  const html = renderPublicKingdomPage(1524, { ...data, nearKids: [1520, 1523, 1525], similar: [{ kid: 1530, power: 1.2e11, power_rank: 9 }] }, { origin: "" });
  assert.match(html, /<h2>関連する王国<\/h2>/);
  assert.match(html, /href="\/k\/1530">王国 1530<em>9位/);
  assert.match(html, /href="\/k\/1523">王国 1523<\/a>/);
  assert.doesNotMatch(renderPublicKingdomPage(1524, data, { origin: "" }), /関連する王国/);
  const src = readFileSync(new URL("../src/public-pages.js", import.meta.url), "utf8");
  assert.match(src, /FROM kingdom_catalog WHERE kid BETWEEN \? AND \? AND kid <> \?/);
  assert.match(src, /FROM kingdom_stats_current WHERE power_rank BETWEEN \? AND \? AND kid <> \? ORDER BY power_rank ASC LIMIT 6/);
  const mig = readFileSync(new URL("../migrations/0072_kingdom_stats_power_rank_index.sql", import.meta.url), "utf8");
  assert.match(mig, /CREATE INDEX IF NOT EXISTS idx_kingdom_stats_current_power_rank ON kingdom_stats_current \(power_rank\)/);
  const stats = readFileSync(new URL("../src/kingdom-stats.js", import.meta.url), "utf8");
  assert.match(stats, /idx_kingdom_stats_current_power_rank/);
});

test("robots.txt：ログイン必須のページはクローラーに来させない。公開ページ・サイトマップのURLは止めない", () => {
  const robots = renderRobotsTxt("https://eagleeye-ks.com");
  const rules = robots.split("\n").filter(l => l.startsWith("Disallow: ")).map(l => l.slice(10));
  // Google の解釈：前方一致、末尾の $ は「ここで終わり」
  const blocked = path => rules.some(r => r.endsWith("$") ? path === r.slice(0, -1) : path.startsWith(r));
  for (const p of ["/player?governor_id=1", "/players", "/player-watchlist", "/player/compare?governor_id=1", "/alliance?kid=1&tag=A", "/kingdom?kid=1524", "/kingdom/rankings", "/kingdom/alliances", "/kvk", "/kvk?kid=1", "/watchlist", "/news", "/kingdom-watchlist", "/kingdom-catalog"]) assert.ok(blocked(p), "blocked: " + p);
  for (const p of ["/", "/k/1524", "/kingdoms", "/kingdom-timeline", "/kvk/s23", "/kvk/matchups", "/hero-catalog", "/heroes/amadeus", "/tools/gold", "/tools/hero-shards", "/about", "/privacy", "/terms", "/support", "/status"]) assert.ok(!blocked(p), "allowed: " + p);
  const sitemap = renderSitemapXml("https://eagleeye-ks.com", [1, 1524], undefined, ["/kvk/s23"]);
  for (const loc of sitemap.match(/<loc>[^<]+<\/loc>/g)) assert.ok(!blocked(loc.slice(5, -6).replace("https://eagleeye-ks.com", "")), loc);
});
