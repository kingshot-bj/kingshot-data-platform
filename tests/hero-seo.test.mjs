// 英雄カタログ・英雄個別ページのSEO：登録データとslugの対応、固有のtitle/description、
// 実データと一致する説明文、カードから個別ページへの直接リンク、サイトマップ。
import { test } from "node:test";
import assert from "node:assert/strict";
import { HERO_SKILLS_JA } from "../src/hero-skills-ja.js";
import { HERO_SLUGS } from "../src/hero-slugs.js";
import { renderHeroPage, heroPagePaths, heroNameBySlug } from "../src/hero-pages.js";
import { renderHeroCatalogPage, skillGroupLabel } from "../src/hero-catalog-page.js";
import { canonicalHeroName } from "../src/hero-shards.js";
import { renderSitemapXml } from "../src/public-pages.js";

const NAMES = Object.keys(HERO_SKILLS_JA);
const get = (html, re) => (html.match(re) || [])[1];
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

test("登録データとslug：全英雄にslug、重複なし、余分なslugなし、slugから名前に戻せる", () => {
  assert.ok(NAMES.length > 0);
  for (const n of NAMES) assert.ok(HERO_SLUGS[n], "slugがない: " + n);
  assert.deepEqual(Object.keys(HERO_SLUGS).filter(n => !HERO_SKILLS_JA[n]), [], "データにない英雄のslug");
  const slugs = Object.values(HERO_SLUGS);
  assert.equal(new Set(slugs).size, slugs.length, "slugの重複");
  for (const n of NAMES) assert.equal(heroNameBySlug(HERO_SLUGS[n]), n);
  for (const s of slugs) assert.match(s, /^[a-z-]{2,40}$/, "ルートに合わないslug: " + s);
});

test("個別ページ：全英雄で固有のtitle・description・canonical、H1は1つで英雄名、noindexなし", () => {
  const titles = new Set(), descs = new Set();
  for (const n of NAMES) {
    const html = renderHeroPage(n, { origin: "https://eagleeye-ks.com" });
    assert.ok(html, n);
    const title = get(html, /<title>([^<]+)<\/title>/), desc = get(html, /<meta name="description" content="([^"]+)"/);
    titles.add(title); descs.add(desc);
    assert.ok(title.includes(esc(canonicalHeroName(n))), n);
    assert.equal(get(html, /rel="canonical" href="([^"]+)"/), "https://eagleeye-ks.com/heroes/" + HERO_SLUGS[n]);
    const h1 = [...html.matchAll(/<h1[^>]*>([^<]+)<\/h1>/g)].map(m => m[1]);
    assert.deepEqual(h1, [esc(canonicalHeroName(n))], n);
    assert.doesNotMatch(html, /name="robots" content="noindex/, n);
    assert.match(html, /href="\/hero-catalog"/, "カタログへ戻るリンク");
    assert.match(html, /href="\/tools\/hero-shards\?hero=/, "関連ツール（欠片計算）");
  }
  assert.equal(titles.size, NAMES.length, "titleが重複");
  assert.equal(descs.size, NAMES.length, "descriptionが重複");
});

test("説明文とカードは実際に載っているスキルの種類だけを書く（専用装備のデータがない英雄に「専用装備」と書かない）", async () => {
  const noExclusive = NAMES.filter(n => !(HERO_SKILLS_JA[n].groups || []).some(g => /専用装備/.test(g.type) && (g.skills || []).length));
  assert.ok(noExclusive.length > 0, "前提：専用装備のない英雄がいる");
  const catalog = await renderHeroCatalogPage({}).text();
  for (const n of NAMES) {
    const label = skillGroupLabel(HERO_SKILLS_JA[n]);
    const desc = get(renderHeroPage(n, { origin: "" }), /<meta name="description" content="([^"]+)"/);
    assert.ok(desc.includes(label + "のスキル"), n + ": " + desc);
    if (noExclusive.includes(n)) assert.doesNotMatch(desc, /専用装備/, n);
    const card = catalog.slice(catalog.indexOf(`data-hero="${esc(n.toLowerCase())}`));
    assert.match(card.slice(0, 900), new RegExp("スキル · " + label + "</small>"), n);
  }
});

test("カタログ：全英雄のカードに個別ページへの直接リンク（開閉の summary の外）。検索は正式名でも当たる", async () => {
  const html = await renderHeroCatalogPage({}).text();
  const items = html.split('<div class="hero-item"').slice(1);
  assert.equal(items.length, NAMES.length);
  for (const n of NAMES) {
    const item = items.find(x => x.includes(`<strong>${esc(n)}</strong>`));
    assert.ok(item, n);
    const link = `<a class="hero-go" href="/heroes/${HERO_SLUGS[n]}"`;
    assert.ok(item.includes(link), n);
    assert.ok(item.indexOf(link) > item.indexOf("</details>"), "リンクは details の外: " + n);
  }
  assert.match(html, /data-hero="アイヴァ エヴァ"/, "アイヴァはエヴァでも検索できる（表記は変えない）");
  assert.match(html, /cards=\[\.\.\.document\.querySelectorAll\("\.hero-item"\)\]/);
  assert.match(html, /cards\[i\]\.classList\.toggle\("is-open",d\.open\)/);
  assert.equal((html.match(/<div class="hero-item"/g) || []).length, (html.match(/<\/details><a class="hero-go"/g) || []).length);
});

test("サイトマップ：英雄ページは登録データから全員分、重複なし、canonicalと同じURL", () => {
  const paths = heroPagePaths();
  assert.equal(paths.length, NAMES.length);
  assert.equal(new Set(paths).size, paths.length);
  const xml = renderSitemapXml("https://eagleeye-ks.com", []);
  for (const n of NAMES) assert.ok(xml.includes(`<loc>https://eagleeye-ks.com/heroes/${HERO_SLUGS[n]}</loc>`), n);
  assert.ok(xml.includes("<loc>https://eagleeye-ks.com/hero-catalog</loc>"));
});
