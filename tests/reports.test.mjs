// 2026-11-16：AdSense 対応。EagleEye のデータから分かったことをまとめた読み物（データレポート）。攻略記事ではない。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REPORTS, REPORT_PATHS_FROM_REPORTS, renderReport, renderReportsIndex, KVK_S23, COHORT } from "../src/reports.js";
import { REPORT_PATHS } from "../src/reports-paths.js";
import { renderSitemapXml } from "../src/public-pages.js";
import { renderVisitorHome } from "../src/home-visitor.js";

test("4本・URL の一覧はサイトマップ用と一致", () => {
  assert.equal(REPORTS.length, 4);
  assert.deepEqual([...REPORT_PATHS], [...REPORT_PATHS_FROM_REPORTS]);
  const xml = renderSitemapXml("https://eagleeye-ks.com", [1]);
  for (const p of REPORT_PATHS) assert.ok(xml.includes(`<loc>https://eagleeye-ks.com${p}</loc>`), p);
});

test("各レポート：canonical・Article の構造化データ・出典と注意書き・勝敗を予想しない・総力を強さとして書かない", () => {
  for (const r of REPORTS) {
    const html = renderReport(r.slug, { origin: "https://eagleeye-ks.com" });
    assert.match(html, new RegExp(`<link rel="canonical" href="https://eagleeye-ks\\.com/reports/${r.slug}">`));
    assert.match(html, /"@type":"Article"/);
    assert.match(html, /キングショットの公式サイトではありません/);
    assert.match(html, /ゲームの仕様を断定するものではありません/);
    assert.doesNotMatch(html, /勝利予想|勝つのは|有利|総力が強い|強い王国ランキング/);
    assert.ok(html.replace(/<[^>]+>/g, "").length > 1200, r.slug + "：中身のある長さ");
  }
  assert.equal(renderReport("nope"), null);
});

test("数字：KvK と開設時期をそろえた比較の中身", () => {
  assert.equal(KVK_S23.powerLeaderAlsoMystic + KVK_S23.powerLeaderBehind, KVK_S23.decided);
  assert.equal(KVK_S23.decided + KVK_S23.even, KVK_S23.pairs);
  const kvk = renderReport("kvk-s23-matchups");
  assert.match(kvk, /総力が大きい方が秘境の試練でも上だった組は、半分に届きませんでした<\/b>（44\.8%）/);
  const pv = renderReport("power-vs-mystic-2026-11");
  assert.match(pv, new RegExp(`${COHORT.mysticTop10PowerBelowMedian}王国は、総力が下半分`));
  assert.match(pv, /<a href="\/k\/67">王国67<\/a>/);
});

test("一覧ページとトップ・王国一覧からのリンク", () => {
  const idx = renderReportsIndex({ origin: "" });
  for (const r of REPORTS) assert.ok(idx.includes(`href="/reports/${r.slug}"`));
  const home = renderVisitorHome({ origin: "" });
  assert.match(home, /<h2>データレポート<\/h2>/);
  const src = readFileSync(new URL("../src/public-pages.js", import.meta.url), "utf8");
  assert.match(src, /<a href="\/reports">データレポート<\/a> にまとめています/);
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(index, /if \(url\.pathname === "\/reports"\) return await servePublicCached/);
});
