// 同盟カード（同盟のページを画像で共有・2026-11-19）。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { allianceShareData, allianceShareEmbed, allianceShareClient } from "../src/alliance-share.js";

const members = [
  { id: "1", name: "BJにゃん", power: 300000000, role: 5 },
  { id: "2", name: "Bさん", power: 120000000, role: 4 },
  { id: "3", name: "Cさん", power: null, role: 3 },
  ...Array.from({ length: 12 }, (_, i) => ({ id: "x" + i, name: "メンバー" + i, power: 1000000 * (i + 1), role: 1 }))
];

test("カードのデータ：平均戦力は分かる人だけ・役職の内訳・戦力 TOP10・VIP は見られる人だけ", () => {
  const vips = new Map([["1", { vip: 14, at: 1 }]]);
  const d = allianceShareData({ kid: 1524, tag: "Pen", name: "Penguins", power: 5e9, powerRank: 3, memberCount: 15, members, vips, date: "2026/11/19" });
  assert.equal(d.top.length, 10);
  assert.equal(d.top[0].name, "BJにゃん");
  assert.equal(d.top[0].role, "R5");
  assert.equal(d.top[0].vip, 14);
  assert.deepEqual(d.roles, [[5, 1], [4, 1], [3, 1], [1, 12]]);
  assert.equal(d.avg, Math.round((300000000 + 120000000 + 78000000) / 14));
  const noVip = allianceShareData({ kid: 1524, tag: "Pen", members, vips: null });
  assert.equal(noVip.showVip, false);
  assert.equal(noVip.top[0].vip, null, "VIP を見られない人のカードには VIP を載せない");
});

test("埋め込み：ボタンの置き場所・データ（< はエスケープ）・スクリプト。スクリプトは外の変数を使わない", () => {
  const html = allianceShareEmbed({ kid: 1524, tag: "<x>", name: "</script>", members });
  assert.match(html, /<div id='ashShare'><\/div>/);
  assert.doesNotMatch(html.slice(html.indexOf("id='ashData'"), html.indexOf("</script>", html.indexOf("id='ashData'"))), /<\/script>|<x>/);
  assert.doesNotThrow(() => new Function("return (" + allianceShareClient.toString() + ")"));
  assert.match(allianceShareClient.toString(), /new URL\("\/alliance", location\.origin\)/);
  assert.match(allianceShareClient.toString(), /\/api\/invite/);
});

test("配線：同盟のページに同盟カードを入れる（VIP は showVip のときだけ）", () => {
  const src = readFileSync(new URL("../src/kingdom-portal.js", import.meta.url), "utf8");
  assert.match(src, /allianceShareEmbed\(\{ kid, tag: allianceAbbr \|\| tag, name: allianceName, power: alliancePower, powerRank, memberCount, members: normalized, vips: opts\.showVip \? vips : null/);
});
