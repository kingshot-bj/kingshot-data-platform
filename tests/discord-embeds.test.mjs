// Discord通知のカード化：色・項目・BJにゃん・リンク、送信ボディ、KvK通知への組み込み。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kvkDayEmbed, kvkLeadEmbed, kvkMatchupEmbed, kvkMysticEmbed, announcementEmbed, discordMessageBody, shareBar, EMBED_COLORS } from "../src/discord-embeds.js";
import { buildKvkScoreNotifications, buildKvkMatchupNotifications } from "../src/kvk-discord.js";
import { buildMysticNotification } from "../src/kvk-mystic.js";

const O = "https://eagleeye-ks.com";

test("各日の結果：勝ちは緑・負けは赤、差と割合バー、ここまでの勝敗", () => {
  const w = kvkDayEmbed({ season: 23, kid: 1524, opponent: 1523, dayName: "Day 3", score: 2.41e9, opponentScore: 1.98e9, wins: 2, losses: 1, origin: O });
  assert.equal(w.color, EMBED_COLORS.win);
  assert.match(w.title, /Day 3 🎉 勝利/);
  assert.equal(w.fields.find(f => f.name === "ここまで").value, "2勝 1敗");
  assert.match(w.fields.find(f => f.name === "スコア").value, /█+░+/);
  assert.equal(w.url, O + "/kvk?kid=1524");
  assert.match(w.thumbnail.url, /bjnyan\/poses\/common\.webp$/);
  assert.equal(kvkDayEmbed({ season: 23, kid: 1, opponent: 2, dayName: "D", score: 1, opponentScore: 2 }).color, EMBED_COLORS.lose);
  assert.equal(shareBar(1, 1).length, 20);
  assert.equal(shareBar(0, 0), "██████████░░░░░░░░░░");
});

test("組み合わせ・優勢入れ替わり・秘境比較・お知らせ", () => {
  const m = kvkMatchupEmbed({ season: 23, kid: 1524, opponent: 1523, opponentName: "X", power: 337e6, opponentPower: 294e6, origin: O });
  assert.equal(m.color, EMBED_COLORS.matchup);
  assert.ok(m.fields.some(f => /337\.0M/.test(f.value)));
  assert.match(kvkMatchupEmbed({ season: 23, kid: 1, opponent: null }).description, /不戦/);
  assert.match(kvkLeadEmbed({ season: 23, kid: 1, opponent: 2, score: 1, opponentScore: 5 }).title, /入れ替わり/);
  const my = kvkMysticEmbed({ season: 23, kid: 1524, opponent: 1523, wins: 5, losses: 1, stages: [{ label: "闘技場", a: "60-7", b: "61-5", win: -1 }], origin: O });
  assert.match(my.fields[0].value, /🔴 闘技場　60-7 vs \*\*61-5\*\*/);
  const a = announcementEmbed({ title: "新機能", body: "本文", image_url: O + "/assets/og/common.jpg" }, O);
  assert.match(a.title, /📢 新機能/);
  assert.equal(a.image.url, O + "/assets/og/common.jpg");
  assert.equal(announcementEmbed({ title: "t", image_url: "http://insecure" }, O).image, undefined);
});

test("送信ボディ：カードがあればembeds、無ければ文字（メンションは飛ばさない）", () => {
  assert.deepEqual(discordMessageBody("x", { title: "t" }), { embeds: [{ title: "t" }], allowed_mentions: { parse: [] } });
  assert.deepEqual(discordMessageBody("x", null), { content: "x", allowed_mentions: { parse: [] } });
});

test("KvK通知の各メッセージにカードが付く（文字版も残す）", () => {
  const day = (d, s, a, b) => ({ day: d, name: "Day " + d, status: s, kingdom_score: a, opponent_score: b });
  const msgs = buildKvkScoreNotifications(1524, { season: 23, score: 100, opponent_score: 50, days: [day(1, "Ongoing", 100, 50)] },
    { season: 23, opponent: 1523, score: 150, opponent_score: 200, days: [day(1, "Ended", 120, 80), day(2, "Ongoing", 30, 120)] }, 1000, O);
  assert.ok(msgs.every(m => m.content && m.embed && m.embed.title));
  const mu = buildKvkMatchupNotifications(23, "x", [{ kid: 1524, opponent: 1523 }], [1524], O, { 1524: 3e8, 1523: 2e8 });
  assert.ok(mu[0].embed.fields.some(f => /300\.0M/.test(f.value)));
});

test("秘境の比較通知：両国そろったら1シーズン1回、ラベル優先", () => {
  const mine = { coliseum: { best: 597, labels: ["60-7"] }, radiant_spire: { best: 622 } };
  const theirs = { coliseum: { best: 605, labels: ["61-5"] }, radiant_spire: { best: 573 } };
  const n = buildMysticNotification(23, 1524, 1523, mine, theirs, O);
  assert.equal(n.key, "KVK:MYSTIC:23:1524");
  assert.match(n.embed.description, /1勝 1敗/);
  assert.match(n.embed.fields[0].value, /60-7 vs \*\*61-5\*\*/);
  assert.match(n.embed.fields[0].value, /\*\*63-2\*\* vs 58-3/, "ラベルが無ければ数値から章-ステージ");
  assert.equal(buildMysticNotification(23, 1, 2, {}, {}, O), null);
});

test("送信時は保存した embed_json を使う／お知らせもカード", () => {
  const src = readFileSync(new URL("../src/kvk-discord.js", import.meta.url), "utf8");
  assert.match(src, /SELECT message_key, kid, content, embed_json FROM kvk_discord_outbox/);
  assert.match(src, /ALTER TABLE kvk_discord_outbox ADD COLUMN embed_json TEXT/);
  assert.match(src, /JSON\.stringify\(discordMessageBody\(item\.content, embed\)\)/);
});
