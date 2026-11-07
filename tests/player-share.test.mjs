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
  // 見られる項目は全部載せる（VIP・座標も）。オンライン状態・最終ログイン・シールド/炎上の終了時刻は載せない
  const limited = playerShareData({ nick_name: "X", x: 1, y: 2, vip: 10, online: true, last_active_at: 111, last_login: 222 }, { shield_endtime: 333, burn_endtime: 444, language: "ja", office: "宰相", alliance: { rank: 4 } });
  assert.equal(limited.power, null);
  assert.equal(limited.gid, null);
  assert.equal(limited.vip, 10);
  assert.equal(limited.coords, "1, 2");
  assert.equal(limited.language, "ja");
  assert.equal(limited.office, "宰相");
  assert.equal(limited.allianceRole, "R4");
  assert.deepEqual(limited.mystic, []);
  const text = JSON.stringify(limited);
  for (const v of ["online", "last_active", "last_login", "shield", "burn", "111", "222", "333", "444"]) assert.ok(!text.includes(v), v);
});

test("ランキング・英雄：見られる分だけ、英雄は戦力順に6人・日本語名", () => {
  const d = playerShareData({ nick_name: "A" }, {
    ranks: { town_center_rank: 7, migrant_score: 12345, migrant_rank: 30, mystic_trial: 2431, mystic_rank: 5 },
    hero_rankings: [{ board: "single_hero", rank: 2, score: 9e7 }, { board: "unknown", rank: 1 }],
    heroes: Array.from({ length: 8 }, (_, i) => ({ name: "h" + i, level: 50 + i, power: i === 0 ? 1e9 : i * 1000, star_label: "5" })),
    gov_gear: { items: [{}, {}, {}] }
  }, { heroName: n => n.toUpperCase() });
  assert.deepEqual(d.ranks.map(r => [r.label, r.rank]), [["役場", 7], ["移民スコア", 30], ["秘境の試練（総合）", 5], ["英雄総力", 2]]);
  assert.equal(d.heroes.length, 6);
  assert.deepEqual(d.heroes[0], { name: "H0", level: 50, stars: "5" });
  assert.equal(d.heroes[1].name, "H7");
  assert.equal(d.heroCount, 8);
  assert.equal(d.govGear, 3);
  const none = playerShareData({ nick_name: "A" }, { gov_gear: { hidden: true, items: [{}] } });
  assert.deepEqual(none.ranks, []);
  assert.deepEqual(none.heroes, []);
  assert.equal(none.govGear, null);
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
  assert.match(shell, /\$\{playerShareEmbed\(p, profile, \{ heroName: localizeHeroName \}\)\}/);
  // renderPlayerShell に渡すのはロールで絞ったデータ
  assert.match(index, /return renderPlayerShell\("", governorId, visiblePlayer, observation\.payload, null, visibleProfile,/);
});
