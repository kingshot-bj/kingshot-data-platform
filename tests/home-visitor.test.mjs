// 2026-11-15：AdSense「有用性の低いコンテンツ」対応。ログインしていない人のトップを、何のサイトか分かる中身にする。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderVisitorHome, homeHighlights, HOME_TOP_N, YOUNG_DAYS } from "../src/home-visitor.js";

const rows = [
  { kid: 1, power: 300e9, gain: 10e9, age: 600, at: 1795100000 },
  { kid: 2, power: 200e9, gain: 20e9, age: 500, at: 1795190400 },
  { kid: 3, power: 100e9, gain: -2e9, age: 400, at: 1795100000 },
  { kid: 4, power: 50e9, gain: 6e9, age: 100, at: 1795100000 },
  { kid: 5, power: 40e9, gain: 7e9, age: 20, at: 1795100000 },
  { kid: 6, power: 30e9, gain: 1e9, age: 180, at: 1795100000 },
  { kid: 7, power: null, gain: null, age: 5, at: null }
];

test("今週のデータ：7日で伸びた王国・開設180日以内で伸びた王国（実際の数字から）", () => {
  const h = homeHighlights(rows);
  assert.equal(h.total, 6);
  assert.deepEqual(h.gain.map(r => r.kid), [2, 1, 5, 4, 6].slice(0, HOME_TOP_N));
  assert.deepEqual(h.young.map(r => r.kid), [5, 4, 6], `開設${YOUNG_DAYS}日以内だけ`);
  assert.equal(h.observedAt, 1795190400);
});

test("ページ：何のサイトか・王国番号の検索・ツール・今週のデータ・KvK・できること・出典・登録", () => {
  const html = renderVisitorHome({ origin: "https://eagleeye-ks.com", highlights: homeHighlights(rows), kvkSeason: 23 });
  assert.match(html, /<link rel="canonical" href="https:\/\/eagleeye-ks\.com\/">/);
  assert.doesNotMatch(html, /noindex/);
  assert.match(html, /<h1>キングショットの王国・KvK・英雄を、データで比べる<\/h1>/);
  assert.match(html, /全6王国の戦力と成長/);
  assert.match(html, /<h2>ツール<\/h2>/);
  for (const href of ["/tools/hero-shards", "/tools/gold", "/tools/gold-tech", "/hero-catalog", "/kingdom-timeline", "/guide"]) assert.ok(html.includes(`href="${href}"`), href);
  assert.match(html, /<a class="rk" href="\/k\/2"><i>1<\/i>/);
  assert.match(html, /2026-11-21 時点/);
  assert.match(html, /href="\/kvk\/s23"/);
  assert.match(html, /MightPulse/);
  assert.match(html, /公式サイトではありません/);
  assert.match(html, /href="\/login">無料で登録する/);
  // ログインは一番上にもある（下までスクロールしないと無かった）。
  assert.ok(html.indexOf('class="hlogin" href="/login"') > 0 && html.indexOf('class="hlogin"') < html.indexOf('class="hero"'), "ログインボタンが説明より上にある");
  assert.doesNotMatch(html, /ログインなしで使えるツール|通信中|ウォッチ中のプレイヤー/, "ログインしていないと意味のない表示は出さない");
});

test("データが無くても壊れない（今週のデータ・KvK の欄を出さない）", () => {
  const html = renderVisitorHome({ origin: "", highlights: null, kvkSeason: null });
  assert.doesNotMatch(html, /今週のデータ|<h2>KvK<\/h2>/);
  assert.match(html, /全王国の戦力と成長/);
});

test("配線：ログインしていない人だけ。数字は全王国の一覧（キャッシュ）から。MightPulse は呼ばない", () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const fn = index.slice(index.indexOf("async function renderHome("), index.indexOf("async function renderHome(") + 4000);
  assert.match(fn, /if \(!session\) \{\n    const \[stats, kvkSeason\] = await Promise\.all\(\[loadAllKingdomStats\(env\.DB\)/);
  assert.match(fn, /return renderVisitorHome\(\{ origin: publicOrigin\(request, env\), highlights: stats \? homeHighlights\(stats\) : null, kvkSeason, inviteBanner \}\);/);
  const src = readFileSync(new URL("../src/home-visitor.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /fetch\(|prepare\(|collect[A-Z]\w*\(|import .*mightpulse/i, "通信も D1 の読み込みもしない（出典の説明に MightPulse の名前は出る）");
});
