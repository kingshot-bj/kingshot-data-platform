// 同盟比較の共有カード：画像はスマホの中で作る。埋め込むデータ・ボタン・配線を確かめる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { allianceShareData, allianceShareEmbed, ALLIANCE_SHARE_METRICS } from "../src/alliance-compare-share.js";

const mk = (p, base) => Array.from({ length: 4 }, (_, i) => ({ name: p + i, id: p + i, power: base - i * 1e7 }));
const a = { kid: 1524, abbr: "Pen", power: 11.3e9, power_rank: 2, members: mk("a", 4e8), mystic: { checked: ["coliseum"], values: { a1: { coliseum: 10539 } } } };
const b = { kid: 1537, abbr: "LOL", power: 15.6e9, power_rank: 1, members: mk("b", 5e8), mystic: { checked: ["coliseum"], values: { b0: { coliseum: 10522, mystic_trial: 2378 } } } };

test("カードのデータ：戦力の項目と、秘境はステージごとに6人の中でいちばん進んでいる人", () => {
  const d = allianceShareData([a, b], "11-09 10:58");
  assert.equal(d.date, "11-09 10:58");
  assert.deepEqual(d.alliances.map(x => x.abbr), ["Pen", "LOL"]);
  assert.equal(d.alliances[0].v.members, 4);
  assert.equal(d.alliances[0].v.top_sum, 4e8 + 3.9e8 + 3.8e8, "戦力上位3人の合計");
  assert.equal(d.alliances[1].v.power_rank, 1);
  const col = d.mystic.find(s => s.label === "闘技場");
  assert.deepEqual(col.rows.map(r => [r.name, r.value]), [["a1", "54-9"], ["b0", "53-2"], ["a0", "圏外"], ["a2", "圏外"], ["b1", "圏外"], ["b2", "圏外"]], "6人全員を進んでいる順に。種別の分を引いた章-ステージ");
  assert.equal(col.rows[0].ai, 0);
  const total = d.mystic.find(s => s.label === "秘境の試練（総合）");
  assert.deepEqual(total.rows[0], { ai: 1, name: "b0", value: "2,378", ok: true });
  assert.equal(total.rows.find(r => r.name === "a0").value, "取得中", "取っていない種類は取得中");
  assert.equal(d.mystic.find(s => s.label === "生命の森").rows.filter(r => r.ok).length, 0);
  assert.deepEqual(allianceShareData([{ ...a, mystic: null }, { ...b, mystic: null }]).mystic, [], "秘境を見られない人のカードには秘境を入れない");
  assert.equal(ALLIANCE_SHARE_METRICS.length, 5);
});

test("埋め込み：ボタンの置き場所・データ・スクリプト（< はエスケープ）", () => {
  const html = allianceShareEmbed([{ ...a, abbr: "<x>" }, b], "");
  assert.match(html, /<div id='acShare'><\/div>/);
  assert.match(html, /<script type='application\/json' id='acShareData'>/);
  assert.doesNotMatch(html.slice(html.indexOf("acShareData")), /"abbr":"<x>"/);
  assert.match(html, /画像で共有/);
  assert.match(html, /同盟比較/);
});

test("配線：同盟比較のページに2つ以上の同盟があるときだけ共有を付ける", () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const route = index.slice(index.indexOf('if (url.pathname === "/alliance/compare") {'), index.indexOf('if (url.pathname === "/alliance") {'));
  assert.match(route, /const shareHtml = shareFound\.length >= 2 \? allianceShareEmbed\(shareFound,/);
  assert.match(route, /renderAllianceComparePage\(\{ alliances, targets, top, shareHtml \}\)/);
  const page = readFileSync(new URL("../src/alliance-compare.js", import.meta.url), "utf8");
  assert.match(page, /<div id="acBody"><\/div>\$\{shareHtml\}/);
});
