import test from "node:test";
import assert from "node:assert/strict";
import { heroShardExplainer, goldExplainer, goldTechExplainer } from "../src/tool-explainers.js";
import { renderGoldCalculatorPage, GOLD_TOTALS } from "../src/gold-calculator.js";
import { renderGoldTechPage } from "../src/gold-tech.js";
import { renderHeroShardPage } from "../src/hero-shards.js";

// 2026-11-16 AdSense：ツールページが入力欄と表だけだった。数字は表から計算し、表と食い違わないこと。
const text = h => h.replace(/<style>.*?<\/style>/s, "").replace(/<[^>]+>/g, "");

test("欠片：合計1,065個・後半に集中・各★の最後の段階", () => {
  const t = text(heroShardExplainer());
  assert.match(t, /★0 段階0 → ★5（最大）：1,065個/);
  assert.match(t, /600個（56%）/);
  assert.match(t, /★4の行は段階5まで40個ずつで、段階6が100個/);
});

test("黄金：全建物の合計が表の合計行と一致する", () => {
  const gold = GOLD_TOTALS.reduce((a, r) => a + r[0], 0), refined = GOLD_TOTALS.reduce((a, r) => a + r[1], 0);
  const t = text(goldExplainer());
  assert.ok(t.includes(`黄金${gold.toLocaleString("ja-JP")}・精製黄金${refined.toLocaleString("ja-JP")}です`), t);
  assert.match(t, /役場：黄金8,775・精製黄金270/);
});

test("黄金研究：1兵種27,368・3兵種82,104", () => {
  const t = text(goldTechExplainer());
  assert.match(t, /黄金微粒子27,368・コイン8,056,000/);
  assert.match(t, /黄金微粒子82,104・コイン24,168,000/);
  assert.match(t, /約15倍/);
});

test("各ツールページに入っている（攻略の優先順位は書かない）", () => {
  const pages = [renderHeroShardPage({}), renderGoldCalculatorPage({}), renderGoldTechPage({})].map(p => typeof p === "string" ? p : "");
  for (const p of pages) if (p) { assert.match(p, /<h2>計算の例と数字の読み方<\/h2>/); assert.doesNotMatch(p, /優先/); }
});
