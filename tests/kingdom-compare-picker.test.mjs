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
