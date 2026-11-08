// 同盟比較：上位3人の秘境の試練（プレイヤー比較と同じ王国ランキングの値）を比べる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadTopMystic, topByPower, renderAllianceComparePage, MYSTIC_COMPARE_BOARDS } from "../src/alliance-compare.js";

const members = [
  { name: "A1", id: "11", power: 300 }, { name: "A2", id: "12", power: 500 }, { name: "A3", id: "13", power: 400 },
  { name: "A4", id: "14", power: 100 }, { name: "x", id: "", power: 999 }, { name: "y", id: "15", power: null }
];

test("上位3人は戦力順（IDと戦力がある人だけ）", () => {
  assert.deepEqual(topByPower(members).map(m => m.id), ["12", "13", "11"]);
});

test("D1は同盟あたり2本だけ読み、取得済みの種類と値を返す", async () => {
  const calls = [];
  const db = { prepare: sql => ({ bind: (...a) => ({ all: async () => {
    calls.push([sql, a]);
    if (sql.includes("kingdom_ranking_current")) return { results: [{ board: "coliseum", target_id: "12", score: 10605 }, { board: "mystic_trial", target_id: "12", score: 2400 }] };
    return { results: [{ board: "coliseum" }, { board: "mystic_trial" }] };
  } }) }) };
  const r = await loadTopMystic(db, { kid: 1524, members });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0][1].slice(0, 1), [1524]);
  assert.deepEqual(calls[0][1].slice(-3), ["12", "13", "11"], "上位3人だけ");
  assert.deepEqual(r.values, { "12": { coliseum: 10605, mystic_trial: 2400 } });
  assert.deepEqual(r.checked.sort(), ["coliseum", "mystic_trial"]);
  assert.deepEqual(await loadTopMystic(db, { kid: 1, members: [] }), { checked: [], values: {} });
});

test("画面：上位3人の秘境の試練を1位どうし・2位どうし…で比べる（章-ステージ、100位圏外、取得中）", () => {
  const a = { kid: 1524, abbr: "Pen", members, mystic: { checked: ["coliseum", "mystic_trial"], values: { "12": { coliseum: 10605, mystic_trial: 2400 } } } };
  const b = { kid: 1537, abbr: "LOL", members: [{ name: "B1", id: "21", power: 600 }], mystic: { checked: ["coliseum"], values: { "21": { coliseum: 10520 } } } };
  const html = renderAllianceComparePage({ alliances: [a, b], targets: [{ kid: 1524, tag: "Pen" }, { kid: 1537, tag: "LOL" }], top: 3 });
  // 画面のスクリプトを小さな偽のdocumentで動かして、出来上がった表を読む
  const dataJson = html.match(/<script id="acData" type="application\/json">([\s\S]*?)<\/script>/)[1];
  const script = html.match(/<script>(\(function\(\)\{\nvar A=[\s\S]*?)<\/script>/)[1];
  const body = { innerHTML: "" };
  const document = { getElementById: id => id === "acData" ? { textContent: dataJson } : id === "acBody" ? body : { querySelectorAll: () => [], addEventListener() {} } };
  new Function("document", "location", "history", script)(document, { href: "https://x/" }, { replaceState() {} });
  const text = body.innerHTML.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(text, /上位3人の秘境の試練/);
  assert.match(text, /1位どうし/);
  assert.match(text, /闘技場 61-5 52-10/, "種別の分を引いて章-ステージ");
  assert.match(body.innerHTML, /<td class="best">61-5<\/td>/, "上のほうを明るく");
  assert.match(text, /2位どうし[\s\S]*?闘技場 100位圏外 —/, "取得済みで名前が無ければ100位圏外、相手がいなければ—");
  assert.match(text, /秘境の試練（総合） 2,400 取得中/, "総合は数字そのまま（2.4Kのように丸めない）");
  assert.match(text, /生命の森 取得中/, "まだ取っていない種類は取得中");
  assert.equal(MYSTIC_COMPARE_BOARDS.length, 7);
});

test("配線：表示の権限はプレイヤー比較と同じ（ranks_leaderboards）。足りない王国ランキングは裏で取りに行く", () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const route = index.slice(index.indexOf('if (url.pathname === "/alliance/compare") {'), index.indexOf('if (url.pathname === "/alliance") {'));
  assert.match(route, /visibilityEnabled\(await getPlayerVisibilitySettings\(env\.DB\), "ranks_leaderboards", auth\.role\)/);
  assert.match(route, /loadTopMystic\(env\.DB, a\)/);
  assert.match(route, /scheduleKingdomRankingFetch\(env, executionContext, found\.map\(a => a\.kid\), MYSTIC_COMPARE_BOARDS\.map\(b => b\[0\]\)\)/);
});
