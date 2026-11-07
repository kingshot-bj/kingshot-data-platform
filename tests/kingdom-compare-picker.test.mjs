// 王国比較：番号の指定が足りないときに「URLに?kid=…」の説明ではなく、選ぶ画面を出す。
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderKingdomComparePage } from "../src/kingdom-portal.js";

const db = { prepare: sql => ({ bind: () => ({ first: async () => sql.includes("kvk_matchups") ? { kid: 1523, opponent: 1524 } : null, all: async () => ({ results: [] }) }), first: async () => sql.includes("kvk_state") ? { value: JSON.stringify({ season: 23 }) } : null }) };
const render = q => renderKingdomComparePage(new Request("https://eagleeye-ks.com/kingdom/compare" + q), { DB: db });

test("王国の指定なし：番号を入れて追加できる（URLの書き方は見せない）", async () => {
  const html = await render("");
  assert.doesNotMatch(html, /\?kid=1&kid=2/);
  assert.match(html, /<form class='cmp-form' method='get' action='\/kingdom\/compare'>/);
  assert.match(html, /placeholder='王国の番号（例：1524）'/);
});

test("1王国だけ：選んだ王国を残したまま追加、KvK相手と番号が近い王国をおすすめ", async () => {
  const html = await render("?kid=1524");
  assert.match(html, /<input type='hidden' name='kid' value='1524'>/);
  assert.match(html, /href='\/kingdom\/compare\?kid=1524&amp;kid=1523'><b>\+ 王国 1523<\/b>　今季のKvK相手/);
  assert.match(html, /\+ 王国 1525<\/b>　番号が近い/);
  assert.match(html, /もう1つ王国を追加すると比較が表示されます/);
  assert.match(html, /href='\/kingdom\/compare\?' aria-label='王国1524を外す'>×/);
});

test("4王国そろったら追加欄の代わりに案内、英語のラベルは日本語に", async () => {
  const html = await render("?kid=1&kid=2&kid=3&kid=4");
  assert.doesNotMatch(html, /<form class='cmp-form'/);
  assert.match(html, /比較できるのは4王国までです/);
  assert.doesNotMatch(html, /詳細payload|Provider観測/);
});

test("比較の数字は毎日の集計（kingdom_stats_current）から出し、表で良い方に色を付ける", async () => {
  const stats = [{ kid: 1523, power: 79228615776, power_gain_7d: 5604704559, power_rank: 38, age_days: 300, player_count: 4747, observed_at: 1794024346 }, { kid: 1524, power: 61332674138, power_gain_7d: 5241979188, power_rank: 2392, age_days: 300, player_count: 1935, observed_at: 1794024346 }];
  const db2 = { prepare: sql => ({ bind: () => ({ first: async () => null, all: async () => ({ results: sql.includes("kingdom_stats_current") ? stats : [] }) }), first: async () => null }) };
  const html = await renderKingdomComparePage(new Request("https://eagleeye-ks.com/kingdom/compare?kid=1524&kid=1523"), { DB: db2 });
  assert.match(html, /<th>総戦力<\/th><td>613億<\/td><td class='best'>792億<\/td>/);
  assert.match(html, /<th>戦力順位（全王国）<\/th><td>2,392位<\/td><td class='best'>38位<\/td>/);
  assert.match(html, /<th>1人あたりの戦力<\/th><td class='best'>3,170万<\/td>/);
  assert.match(html, /<th>開設からの日数<\/th><td>300<\/td><td>300<\/td>/, "優劣のない項目は色を付けない");
  assert.doesNotMatch(html, /<th>英雄戦力<\/th>/, "どの王国にも値の無い項目は出さない");
  assert.doesNotMatch(html, /名称未取得/);
});
