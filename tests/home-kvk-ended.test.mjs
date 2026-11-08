// ホームのKvKカード：最中はスコア、終了後3日は結果だけ、それより後は隠す（主要メニューの「KvK」・/kvk からは見られる）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kvkEndedAt } from "../src/home-summary.js";

const days = JSON.stringify([{ day: 1, end_ts: 1000 }, { day: 2, end_ts: 2000 }]);

test("終了の判定：全日程の最後の終わりを過ぎたら終了（時刻を返す）。日程が無ければ判定しない", () => {
  assert.equal(kvkEndedAt(days, 1999), null);
  assert.equal(kvkEndedAt(days, 2000), 2000);
  assert.equal(kvkEndedAt("[]", 5000), null);
  assert.equal(kvkEndedAt("not json", 5000), null);
});

test("ホーム：終了から3日より後はカードを隠し、3日以内は「終了」と勝敗、最中は今まで通り。メニューのKvKは残る", () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.ok(index.includes('if(k.ended&&k.ended_at&&Date.now()/1000-Number(k.ended_at)>3*86400){if(card)card.hidden=true}'));
  assert.ok(index.includes('" 終了 · 王国 "'));
  assert.ok(index.includes('st.textContent=has?(w>l?"勝利":w<l?"敗北":"引き分け"):"終了"'));
  assert.ok(index.includes('st.textContent=has?(w>l?"リード中":w<l?"追う展開":"互角")'));
  assert.match(index, /<a class="ee-tile primary" href="\/kvk">/, "主要メニューのKvKは残す");
  const hs = readFileSync(new URL("../src/home-summary.js", import.meta.url), "utf8");
  assert.match(hs, /ended: endedAt != null, ended_at: endedAt/);
});
