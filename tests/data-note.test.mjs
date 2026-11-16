import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kingdomDataNote, kingdomsIndexDataNote, kvkDataNote } from "../src/data-note.js";
import { renderAboutPage, ABOUT_UPDATED_AT } from "../src/legal-pages.js";

// 2026-11-16 AdSense 監査：集計方法・更新頻度・集計対象がページごとにばらばら／書かれていなかった。
test("データについて：取得元・更新・集計対象・算出方法を同じ形で出す", () => {
  for (const html of [kingdomDataNote({ total: 2621 }), kingdomsIndexDataNote({ total: 2621 }), kvkDataNote({ season: 23, matched: 1219, solo: 8, ready: 1219 })]) {
    assert.match(html, /<h2[^>]*>データについて<\/h2>/);
    for (const k of ["取得元", "更新", "集計対象", "算出方法"]) assert.match(html, new RegExp(`<dt[^>]*>${k}</dt>`));
    assert.match(html, /MightPulse/);
    assert.match(html, /公式サイトではありません/);
    assert.match(html, /href="\/support"/);
  }
  assert.match(kingdomDataNote({ total: 2621 }), /全2,621王国/);
  assert.match(kingdomDataNote(), /強さとは比例しません/);
  assert.match(kvkDataNote({ season: 23, matched: 1219, solo: 8, ready: 1200 }), /組み合わせ1,219組（このほか相手のいない王国が8）。両方の王国の記録がそろった1,200組/);
  assert.match(kvkDataNote({ season: 23, matched: 1219, solo: 8, ready: 1200 }), /勝敗の予想ではありません/);
});

test("データについて：王国ページ・王国一覧・KvK組み合わせに入っている", () => {
  const pub = readFileSync(new URL("../src/public-pages.js", import.meta.url), "utf8");
  assert.match(pub, /\$\{kingdomDataNote\(\{ total: data\.insights\?\.total \}\)\}/);
  assert.match(pub, /\$\{kingdomsIndexDataNote\(/);
  assert.match(readFileSync(new URL("../src/kvk-matchups-page.js", import.meta.url), "utf8"), /\$\{kvkDataNote\(\{ season, matched, solo, ready \}\)\}/);
});

test("運営者情報：正確性の方針・不具合の報告先・更新履歴", () => {
  const html = String(renderAboutPage("https://eagleeye-ks.com"));
  assert.match(html, /情報の正確性について/);
  assert.match(html, /更新履歴/);
  assert.match(html, /計算の誤りや表示の不具合[^<]*<a href="\/support">お問い合わせ<\/a>/);
  assert.match(html, /1,227組→1,219組/);
  assert.equal(ABOUT_UPDATED_AT, "2026年11月16日");
});

test("使い方への入口：データについて欄から /guide へ", () => {
  for (const html of [kingdomDataNote(), kingdomsIndexDataNote(), kvkDataNote({ season: 23 })]) assert.match(html, /<a href="\/guide">使い方（ページの見方・用語集）<\/a>/);
});
