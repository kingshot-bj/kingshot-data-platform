// 2026-11-16：AdSense 対応。トリセツにページの見方・用語集・よくある質問を足す（ゲームの仕様は断定しない）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderGuidePage, GUIDE_SECTIONS } from "../src/guide-page.js";

test("トリセツ：ページの見方・用語集・よくある質問がある", () => {
  const titles = GUIDE_SECTIONS.map(s => s.title);
  for (const t of ["ログインしなくても見られるページ", "王国ページの見方", "KvK の組み合わせの見方", "用語集", "よくある質問"]) assert.ok(titles.includes(t), t);
  const html = renderGuidePage("https://eagleeye-ks.com");
  assert.match(html, /<link rel="canonical" href="https:\/\/eagleeye-ks\.com\/guide">/);
  assert.match(html, /強さとはそのまま比例しません/);
  assert.match(html, /1章は10ステージで、「60-7」は60章の7ステージ目です/);
  assert.match(html, /ログインなしで送れます/);
  assert.doesNotMatch(html, /総戦力|勝利予想/);
  assert.ok(html.replace(/<[^>]+>/g, "").length > 4000, "中身のある長さ");
});
