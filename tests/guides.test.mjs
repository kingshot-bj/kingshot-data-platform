// 読み物：イベントの基本（/guides・2026-11-19）。
import test from "node:test";
import assert from "node:assert/strict";
import { renderGuidesIndex, renderGuide, GUIDE_LIST, GUIDE_PATHS } from "../src/guides.js";
import { renderSitemapXml, renderRobotsTxt } from "../src/public-pages.js";

const origin = "https://eagleeye-ks.com";

test("一覧と3本の記事が出る（canonical・パンくず・記事の構造化データ・出典の注記）", () => {
  assert.equal(GUIDE_LIST.length, 3);
  const index = renderGuidesIndex({ origin });
  for (const g of GUIDE_LIST) assert.match(index, new RegExp(`href="/guides/${g.slug}"`));
  for (const g of GUIDE_LIST) {
    const html = renderGuide(g.slug, { origin });
    assert.match(html, new RegExp(`<link rel="canonical" href="${origin}/guides/${g.slug}">`));
    assert.match(html, /"@type":"Article"/);
    assert.match(html, /"@type":"BreadcrumbList"/);
    assert.match(html, /読み比べ、一致している内容をまとめたもの/);
    assert.match(html, /ゲーム内のイベントの案内（ルール）で確かめてください/);
    assert.doesNotMatch(html, /総戦力/);
    assert.doesNotMatch(html, /勝てます|必ず勝/, "勝敗を言い切らない");
  }
  assert.equal(renderGuide("nope", { origin }), null);
});

test("サイトマップに入り、robots で止めない", () => {
  const map = renderSitemapXml(origin, []);
  for (const p of GUIDE_PATHS) assert.match(map, new RegExp(`<loc>${origin}${p}</loc>`));
  const rules = renderRobotsTxt(origin).split("\n").filter(l => l.startsWith("Disallow: ")).map(l => l.slice(10));
  const blocked = p => rules.some(r => r.endsWith("$") ? p === r.slice(0, -1) : p.startsWith(r));
  for (const p of GUIDE_PATHS) assert.equal(blocked(p), false, p);
});
