// 同盟比較：秘境の試練は各同盟の戦力上位3人（2同盟なら6人）を集めて、ステージごとに進んでいる順に並べる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadAllianceMystic, topByPower, rankTopPlayersByStage, renderAllianceComparePage, MYSTIC_COMPARE_BOARDS } from "../src/alliance-compare.js";

const members = [
  { name: "A1", id: "11", power: 300 }, { name: "A2", id: "12", power: 500 }, { name: "A3", id: "13", power: 400 },
  { name: "A4", id: "14", power: 100 }, { name: "x", id: "", power: 999 }
];

test("戦力上位3人のIDだけで読む（D1は見つかった行だけ）", async () => {
  assert.deepEqual(topByPower(members).map(m => m.id), ["12", "13", "11"]);
  const calls = [];
  const db = { prepare: sql => ({ bind: (...a) => ({ all: async () => {
    calls.push([sql, a]);
    if (sql.includes("kingdom_ranking_current")) return { results: [{ board: "coliseum", target_id: "12", score: 10605 }] };
    return { results: [{ board: "coliseum" }] };
  } }) }) };
  const r = await loadAllianceMystic(db, { kid: 1524, members });
  assert.equal(calls.length, 2, "取得状況1本＋上位3人1本");
  assert.deepEqual(calls[1][1].slice(-3), ["12", "13", "11"], "戦力上位3人だけ");
  assert.deepEqual(r.values, { "12": { coliseum: 10605 } });
  assert.deepEqual(r.checked, ["coliseum"]);
  assert.deepEqual(await loadAllianceMystic(db, { kid: 1, members: [] }), { checked: [], values: {} });
});

test("6人を集めて、ステージの進み順に並べる（値の無い人は後ろ）", () => {
  const a = { members, mystic: { values: { "11": { coliseum: 10620 }, "12": { coliseum: 10605 } } } };
  const b = { members: [{ name: "B1", id: "21", power: 600 }], mystic: { values: { "21": { coliseum: 10611 } } } };
  assert.deepEqual(rankTopPlayersByStage([a, b], "coliseum").map(r => r.name), ["A1", "B1", "A2", "A3"]);
});

test("画面：ステージごとに6人を進んでいる順に並べる（章-ステージ・名前・同盟、100位圏外、取得中）", () => {
  const a = { kid: 1524, abbr: "Pen", members, mystic: { checked: ["coliseum", "mystic_trial"], values: { "11": { coliseum: 10620 }, "12": { coliseum: 10605, mystic_trial: 2400 } } } };
  const b = { kid: 1537, abbr: "LOL", members: [{ name: "B1", id: "21", power: 600 }], mystic: { checked: ["coliseum"], values: { "21": { coliseum: 10611 } } } };
  const html = renderAllianceComparePage({ alliances: [a, b], targets: [{ kid: 1524, tag: "Pen" }, { kid: 1537, tag: "LOL" }], top: 3 });
  const dataJson = html.match(/<script id="acData" type="application\/json">([\s\S]*?)<\/script>/)[1];
  const script = html.match(/<script>(\(function\(\)\{\nvar A=[\s\S]*?)<\/script>/)[1];
  const body = { innerHTML: "" };
  const document = { getElementById: id => id === "acData" ? { textContent: dataJson } : id === "acBody" ? body : { querySelectorAll: () => [], addEventListener() {} } };
  new Function("document", "location", "history", script)(document, { href: "https://x/" }, { replaceState() {} });
  const text = body.innerHTML.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(text, /秘境の試練（各同盟の上位3人・4人を比べる）/);
  assert.match(text, /闘技場 1位 A1 Pen · 300 62-10 2位 B1 LOL · 600 62-1 3位 A2 Pen · 500 61-5 A3 Pen · 400 100位圏外/, "進み順。ランキングに無い人は後ろで100位圏外");
  assert.match(body.innerHTML, /<td class="best">62-10<\/td>/, "いちばん上を明るく");
  assert.match(text, /秘境の試練（総合） 1位 A2 Pen · 500 2,400 .*B1 LOL · 600 取得中/, "総合は数字そのまま、取っていない種類は取得中");
  assert.doesNotMatch(text, /1位どうし/);
  assert.equal(MYSTIC_COMPARE_BOARDS.length, 7);
});

test("配線：表示の権限はプレイヤー比較と同じ（ranks_leaderboards）。足りない王国ランキングは裏で取りに行く", () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const route = index.slice(index.indexOf('if (url.pathname === "/alliance/compare") {'), index.indexOf('if (url.pathname === "/alliance") {'));
  assert.match(route, /visibilityEnabled\(await getPlayerVisibilitySettings\(env\.DB\), "ranks_leaderboards", auth\.role\)/);
  assert.match(route, /loadAllianceMystic\(env\.DB, a\)/);
  assert.match(route, /scheduleKingdomRankingFetch\(env, executionContext, found\.map\(a => a\.kid\), MYSTIC_COMPARE_BOARDS\.map\(b => b\[0\]\)\)/);
});
