import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeCompareGovernorIds } from "../src/player-compare.js";

// 2026-11-16：自分と比べるのにウォッチリストに自分を入れる必要があった。自分の領主を自動で最初に入れる。
const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const page = src.slice(src.indexOf("async function renderPlayerComparePage"), src.indexOf("async function handlePlayerChangesApi"));

test("比較ページ：自分の領主（メイン）を最初に入れる・me=0 で外す・6人まで", () => {
  assert.match(page, /if \(pageUrl\.searchParams\.get\("me"\) !== "0" && env\.DB && auth\.user_id\)/);
  assert.match(page, /ORDER BY CASE account_type WHEN 'MAIN' THEN 0 ELSE 1 END, created_at ASC LIMIT 1/);
  assert.match(page, /ids = normalizeCompareGovernorIds\(\[own, \.\.\.others\]\);/);
  // 7人目以降は落ちる（自分が先頭なので自分は必ず残る）
  assert.deepEqual(normalizeCompareGovernorIds(["1000001", "2000001", "3000001", "4000001", "5000001", "6000001", "7000001"]).length, 6);
});

test("共有したリンクを開いた人の領主が勝手に入らない：アドレスを全員＋me=0 に書き換える", () => {
  assert.match(page, /fixed\.searchParams\.set\("me", "0"\);/);
  assert.match(page, /history\.replaceState\(null,"",/);
  assert.match(page, /<h1>プレイヤー比較<\/h1>'\+meNote\+'/);
});

test("プレイヤー詳細：「自分と比べる」ボタン", () => {
  const share = readFileSync(new URL("../src/player-share.js", import.meta.url), "utf8");
  assert.match(share, /<button type="button" id="pshCmp">⚔️ 自分と比べる<\/button>/);
  assert.match(share, /location\.href = "\/player\/compare\?governor_id=" \+ encodeURIComponent\(String\(d\.gid\)\)/);
});
