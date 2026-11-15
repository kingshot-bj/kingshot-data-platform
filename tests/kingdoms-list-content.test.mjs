// 2026-11-15：AdSense 対応。王国一覧が番号の並びだけだったので、王国ランキング（実データ）と数字の見方を上に足す。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderPublicKingdomsIndex } from "../src/public-pages.js";
import { kingdomLeaderboards } from "../src/kingdom-insights.js";

const stats = [
  { kid: 1, power: 300e9, gain: 10e9, age: 600, at: 1795190400 },
  { kid: 2, power: 200e9, gain: 20e9, age: 500, at: 1795100000 },
  { kid: 3, power: 100e9, gain: -2e9, age: 400, at: 1795100000 },
  { kid: 4, power: 50e9, gain: 6e9, age: 100, at: 1795100000 },
  { kid: 5, power: 40e9, gain: 7e9, age: 20, at: 1795100000 },
  { kid: 6, power: 30e9, gain: 1e9, age: 180, at: 1795100000 }
];

test("王国ランキング：総戦力・7日の伸び・開設180日以内の伸び", () => {
  const b = kingdomLeaderboards(stats, 3);
  assert.deepEqual(b.power.map(r => r.kid), [1, 2, 3]);
  assert.deepEqual(b.gain.map(r => r.kid), [2, 1, 5]);
  assert.deepEqual(b.young.map(r => r.kid), [5, 4, 6]);
  assert.equal(b.observedAt, 1795190400);
});

test("ページ：説明・王国ランキング（日付つき）・数字の見方・番号の一覧", () => {
  const html = renderPublicKingdomsIndex(stats.map(s => s.kid), { origin: "https://eagleeye-ks.com", stats });
  assert.match(html, /総戦力・7日間の伸び・開設日数を毎日集めています/);
  assert.match(html, /<h2>王国ランキング<\/h2>/);
  assert.match(html, /2026-11-21 時点・毎日更新/);
  assert.match(html, /<a class="lb-row" href="\/k\/1"><i>1<\/i>/);
  assert.match(html, /<h3>開設180日以内で伸びている王国<\/h3>/);
  // 総力は強さと比例しない（オーナー確認・docs/KINGSHOT_GAME_KNOWLEDGE.md）。
  assert.match(html, /<dt>総戦力<\/dt><dd>王国の全領主の戦力（ゲーム内の総力）の合計です。[^<]*<b>強さとは比例しません<\/b>/);
  assert.match(html, /<h2>王国番号から探す<\/h2>/);
  assert.match(html, /href="\/k\/6">6<\/a>/);
});

test("データが読めなくても、番号の一覧は出る", () => {
  const html = renderPublicKingdomsIndex([1, 2, 3], { origin: "" });
  assert.doesNotMatch(html, /王国ランキング|数字の見方/);
  assert.match(html, /href="\/k\/3">3<\/a>/);
});

test("配線：全王国の一覧（キャッシュ）を使う", () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(index, /loadPublicKingdomIds\(env\.DB\), loadAllKingdomStats\(env\.DB\)\.catch\(\(\) => null\)\]\); return renderPublicKingdomsIndex\(kids, \{ origin: publicOrigin\(request, env\), stats \}\);/);
});
