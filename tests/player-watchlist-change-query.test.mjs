// プレイヤーウォッチリストの「最新の変化」：change_events を JOIN + ROW_NUMBER で全件なめていた
// （1回約85万行×2本、ウォッチリスト・ホームを開くたび）。索引が効く形を保つ。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

test("最新の変化は target_id IN（ウォッチ対象）＋相関MAXの1本で取る", () => {
  assert.match(src, /c\.target_id IN \(SELECT governor_id FROM player_watchlists WHERE discord_id = \? AND enabled = 1\)/);
  assert.match(src, /c\.detected_at = \(SELECT MAX\(c2\.detected_at\) FROM change_events c2 WHERE c2\.target_type = 'PLAYER' AND c2\.target_id = c\.target_id AND c2\.change_type = c\.change_type\)/);
});

test("全件スキャンになっていた旧クエリが残っていない", () => {
  assert.doesNotMatch(src, /FROM change_events ce\s+INNER JOIN player_watchlists w/);
  assert.doesNotMatch(src, /ce\.field_name = 'power'/);
});
