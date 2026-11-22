import test from "node:test";
import assert from "node:assert/strict";
import { renderReportsIndex, REPORTS } from "../src/reports.js";
import { renderAboutPage } from "../src/legal-pages.js";
import { renderGuidePage } from "../src/guide-page.js";

// 2026-11-16：レポート一覧・使い方・運営者情報に構造化データが無かった。
const ld = html => [...String(html).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
const types = docs => docs.flatMap(d => d["@graph"] ? d["@graph"].map(g => g["@type"]) : [d["@type"]]);

test("レポート一覧：CollectionPage（全レポートの一覧）とパンくず", () => {
  const docs = ld(renderReportsIndex({ origin: "https://eagleeye-ks.com" }));
  assert.ok(types(docs).includes("CollectionPage") && types(docs).includes("BreadcrumbList"));
  const page = docs.flatMap(d => d["@graph"] || [d]).find(g => g["@type"] === "CollectionPage");
  assert.equal(page.mainEntity.itemListElement.length, REPORTS.length);
  assert.equal(page.mainEntity.itemListElement[0].url, "https://eagleeye-ks.com/reports/" + REPORTS[0].slug);
});

test("運営者情報：AboutPage・Organization（問い合わせ先）・パンくず／使い方：WebPage・パンくず", () => {
  const about = ld(renderAboutPage("https://eagleeye-ks.com"));
  assert.deepEqual(types(about).sort(), ["AboutPage", "BreadcrumbList", "Organization"]);
  const org = about[0]["@graph"].find(g => g["@type"] === "Organization");
  assert.equal(org.contactPoint.url, "https://eagleeye-ks.com/support");
  const guide = ld(renderGuidePage("https://eagleeye-ks.com"));
  assert.deepEqual(types(guide).sort(), ["BreadcrumbList", "WebPage"]);
  assert.equal(ld(renderGuidePage("")).length, 0, "origin が無いときは出さない");
});
