// コード監査：空のデータ元を読んで「機能していない」画面の再発防止。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderKingdomCatalogPage } from "../src/kingdom-catalog-page.js";

const stat = { kid: 1524, name: null, power: 61332674138, power_rank: 2392, power_gain_7d: 5241979188, player_count: 1935, age_days: 300 };
const db = sqls => ({ prepare: sql => { sqls.push(sql); return { bind: () => ({ all: async () => ({ results: [stat] }), first: async () => ({ max_kid: 2604 }) }), first: async () => ({ max_kid: 2604 }), all: async () => ({ results: [stat] }) }; } });

test("王国カタログ：空の名前・状態ではなく、毎日の集計（総戦力・順位・伸び・領主数）を表示", async () => {
  const sqls = [];
  const html = await renderKingdomCatalogPage(new Request("https://eagleeye-ks.com/kingdom-catalog?sort=power"), { DB: db(sqls) });
  const text = typeof html === "string" ? html : await html.text();
  assert.ok(sqls.some(s => s.includes("LEFT JOIN kingdom_stats_current s ON s.kid = c.kid") && s.includes("ORDER BY s.power IS NULL, s.power DESC")));
  assert.match(text, /総戦力 <b>613億<\/b>/);
  assert.match(text, /戦力 2,392位/);
  assert.match(text, /7日の伸び <b>\+52\.4億<\/b>/);
  assert.match(text, /<option value='power' selected>総戦力が多い順<\/option>/);
  assert.doesNotMatch(text, /名称未取得|詳細R2あり|詳細未保存|Status（任意）/);
});

test("候補（入力中の検索）も同じ集計を返す", async () => {
  const sqls = [];
  const res = await renderKingdomCatalogPage(new Request("https://eagleeye-ks.com/kingdom-catalog?suggest=1&q=152"), { DB: db(sqls) });
  const d = await res.json();
  assert.equal(d.kingdoms[0].power, 61332674138);
  assert.equal(d.kingdoms[0].power_rank, 2392);
});

test("プレイヤー履歴の画面は R2 に保存された履歴も読む（D1だけを読まない）", () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const page = index.slice(index.indexOf("async function renderPlayerHistoryPage"), index.indexOf("async function renderPlayerHistoryPage") + 2500);
  assert.match(page, /getPlayerHistory\(env\.DB, governorId, 50, env\.ARCHIVE, env\.HISTORY_STORAGE_MODE\)/);
  assert.doesNotMatch(page, /FROM player_snapshots/);
});
