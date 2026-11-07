// プレイヤー詳細の共有：見られる項目だけ載せる、秘境の章の計算、スクリプトの構文、ページへの配線。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { playerShareData, playerShareEmbed, mysticFromLeaderboards, mysticStageLabel } from "../src/player-share.js";

test("秘境の試練：値から「章-ステージ」、日本語名・rank_type でも拾う", () => {
  assert.equal(mysticStageLabel(60605, 60000), "61-5");
  assert.equal(mysticStageLabel(20227, 20000), "23-7");
  assert.equal(mysticStageLabel(null, 0), null);
  assert.equal(mysticStageLabel(1, 0, "12-3"), "12-3");
  const m = mysticFromLeaderboards([
    { key: "radiant_spire", score: 60605, rank: 12 },
    { name: "生命の森", value: 20227 },
    { rank_type: 23, value: 30101, rank: 3 },
    { key: "radiant_spire", score: 1 }, // 重複は最初だけ
    { key: "mystic_trial", score: 2431 }, // 総合値は章ではない
    { key: "coliseum" } // 値も順位もない
  ]);
  assert.deepEqual(m.map(x => [x.key, x.stage, x.rank]), [["forest_of_life", "23-7", null], ["crystal_cave", "11-1", 3], ["radiant_spire", "61-5", 12]]);
});

test("共有データ：渡された（見てよい）値だけを使い、無い項目は null", () => {
  const full = playerShareData(
    { nick_name: "BJ", governor_id: "123", kid: 1524, alliance_name: "Eagles", alliance_abbr: "EGL", power: 5.2e8, town_center_level: 57, kills: 1234567, avatar_url: "https://got-global-avatar.akamaized.net/a.png", observed_at: 1794000000 },
    { ranks: { power_rank: 4, kills_rank: 9, leaderboards: [{ key: "radiant_spire", score: 60605 }] } }
  );
  assert.equal(full.alliance, "[EGL] Eagles");
  assert.equal(full.tc, "黄金5（2/5）");
  assert.equal(full.gold, 5);
  assert.equal(full.powerRank, 4);
  assert.equal(full.mystic.length, 1);
  assert.match(full.date, /^\d{4}-\d{2}-\d{2}$/);
  // ロールで消された項目（座標・VIP・オンライン状態など）は元から入らない
  const limited = playerShareData({ nick_name: "X", x: 1, y: 2, vip: 10, online: true, last_active_at: 1 }, null);
  assert.equal(limited.power, null);
  assert.equal(limited.gid, null);
  assert.deepEqual(limited.mystic, []);
  const keys = Object.keys(limited).sort();
  for (const k of ["x", "y", "vip", "online", "last_active_at", "last_login"]) assert.ok(!keys.includes(k), k);
});

test("埋め込み：スクリプトが動く形・</script> を閉じさせない・招待コード付きURL", () => {
  const html = playerShareEmbed({ nick_name: "</script><b>x", governor_id: "1", kid: 2 }, null);
  assert.doesNotMatch(html.slice(html.indexOf("pshData"), html.indexOf("</script>", html.indexOf("pshData"))), /<\/script><b>/);
  assert.match(html, /\\u003c\/script>/);
  const body = html.slice(html.lastIndexOf("<script>") + 8, html.lastIndexOf("</script>"));
  assert.doesNotThrow(() => new Function(body));
  assert.match(html, /\/api\/invite/);
  assert.match(html, /new URL\("\/player", location\.origin\)/);
  assert.match(html, /\/api\/milestones\/share", \{ method: "POST"/);
  assert.match(html, /\/api\/avatar\?u=/);
});

test("プレイヤー詳細ページ：見られる値（filterPlayerForRole 後）で共有ボタンを出す", () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(index, /import \{ playerShareEmbed \} from "\.\/player-share\.js";/);
  const shell = index.slice(index.indexOf("function renderPlayerShell("), index.indexOf("function renderPlayerShell(") + 4000);
  assert.match(shell, /\$\{playerShareEmbed\(p, profile\)\}/);
  // renderPlayerShell に渡すのはロールで絞ったデータ
  assert.match(index, /return renderPlayerShell\("", governorId, visiblePlayer, observation\.payload, null, visibleProfile,/);
});
