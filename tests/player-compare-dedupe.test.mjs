import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// 2026-11-16：2人の比較なのに「BJにゃん vs BJにゃん」「4人を比較」になっていた／開発用の表示（API値・rank_type）が出ていた。
const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const enh = readFileSync(new URL("../src/player-compare-enhancements.js", import.meta.url), "utf8");

test("比較：描き直すときに前のプレイヤーカードを消す・カードにプレイヤーIDを持たせる", () => {
  assert.match(index, /box\.querySelectorAll\(\\"\.compare-player-cards\\"\)\.forEach\(el=>el\.remove\(\)\);const mobileCards=/);
  assert.match(index, /card\.className=\\"compare-player-card\\";card\.dataset\.governorId=String\(p\.governor_id\|\|\\"\\"\);/);
});

test("追加ランキング：同じプレイヤーを2回数えない", () => {
  assert.match(enh, /const who=playerCard\.dataset\.governorId\|\|name\|\|String\(cardIndex\);/);
  assert.match(enh, /const dedupe=label\+'\|'\+who;if\(seenPlayerLabel\.has\(dedupe\)\)return;seenPlayerLabel\.add\(dedupe\);/);
  // 実際に動かして確かめる：同じ2人のカードが2組あっても2人として数える
  const body = enh.slice(enh.indexOf(" const candidateRows=new Map();"), enh.indexOf(" const candidates="));
  const card = (id, name, score) => ({ dataset: { governorId: id }, querySelector: () => ({ textContent: name }), querySelectorAll: () => [{ getAttribute: () => "ランキング：秘境の試練", dataset: { rankScore: String(score) } }] });
  const cards = [card("1", "BJ", 1286), card("2", "Eddy", 735), card("1", "BJ", 1286), card("2", "Eddy", 735)];
  const run = new Function("document", "safeText", body + "; return candidateRows;");
  const rows = run({ querySelectorAll: () => cards }, el => el?.textContent || "");
  assert.deepEqual(rows.get("ランキング：秘境の試練").map(x => x.name), ["BJ", "Eddy"]);
});

test("秘境の試練のカード：API値・rank_type などの開発用の表示を出さない", () => {
  assert.doesNotMatch(index, /\\"rank_type: \\"/);
  assert.doesNotMatch(index, /rawLabel\.textContent=\\"API値: \\"/);
  assert.doesNotMatch(index, /API値はステージ表記を符号化した生データです/);
});

test("リング：秘境の試練の合計は%を出さない・ステージはオフセットを引いて比べる・元の値は隠し属性から読む", () => {
  assert.match(index, /score\.dataset\.api=entry\.value\.score==null\?\\"\\":String\(entry\.value\.score\);/, "API値の表示を消しても、レーダー・リングが元の値を読めるように");
  assert.match(enh, /const apiText=n&&n\.dataset\.api\?String\(n\.dataset\.api\)/);
  assert.match(enh, /const NO_PERCENT=new Set\(\['秘境の試練'\]\);/);
  // leaderOf を取り出して動かす
  const src = enh.slice(enh.indexOf(" const STAGE_OFFSETS="), enh.indexOf(" function renderCard(card){"));
  const make = new Function("safeText", src + "; return leaderOf;");
  const leaderOf = make(el => el?.textContent || "");
  const card = title => ({ querySelector: () => ({ textContent: title }) });
  assert.deepEqual(leaderOf(card("秘境の試練"), [{ name: "BJ", score: 1286 }, { name: "Eddy", score: 735 }]), { title: "👑BJ", note: "記録が上" });
  assert.equal(leaderOf(card("闘技場"), [{ name: "BJ", score: 10256 }, { name: "Eddy", score: 10134 }]).note, "+122ステージ リード");
  assert.equal(leaderOf(card("総力"), [{ name: "A", score: 200 }, { name: "B", score: 100 }]).note, "+100% リード");
});
