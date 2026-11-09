// 同盟比較：秘境の試練はステージごとに、その同盟でいちばん進んでいる3人どうしを比べる（戦力順ではない）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadAllianceMystic, topByStage, renderAllianceComparePage, MYSTIC_COMPARE_BOARDS } from "../src/alliance-compare.js";

const members = [
  { name: "A1", id: "11", power: 300 }, { name: "A2", id: "12", power: 500 }, { name: "A3", id: "13", power: 400 },
  { name: "A4", id: "14", power: 100 }, { name: "x", id: "", power: 999 }
];

test("メンバー全員のIDで絞って読む（D1は1文100個までなので80人ずつ）", async () => {
  const calls = [];
  const db = { prepare: sql => ({ bind: (...a) => ({ all: async () => {
    calls.push([sql, a]);
    if (sql.includes("kingdom_ranking_current")) return { results: a.includes("12") ? [{ board: "coliseum", target_id: "12", score: 10605 }, { board: "coliseum", target_id: "14", score: 10610 }] : [] };
    return { results: [{ board: "coliseum" }] };
  } }) }) };
  const r = await loadAllianceMystic(db, { kid: 1524, members });
  assert.equal(calls.length, 2, "取得状況1本＋メンバー1本");
  assert.deepEqual(calls[1][1].slice(-4), ["11", "12", "13", "14"], "IDの無い人は除く");
  assert.deepEqual(r.values, { "12": { coliseum: 10605 }, "14": { coliseum: 10610 } });
  assert.deepEqual(r.checked, ["coliseum"]);
  calls.length = 0;
  const many = Array.from({ length: 170 }, (_, i) => ({ name: "m" + i, id: String(1000 + i), power: 1 }));
  await loadAllianceMystic(db, { kid: 1, members: many });
  const q = calls.filter(c => c[0].includes("kingdom_ranking_current"));
  assert.equal(q.length, 3, "170人→80・80・10");
  assert.ok(q.every(c => c[1].length <= 100), "1文の値は100個まで");
  assert.deepEqual(await loadAllianceMystic(db, { kid: 1, members: [] }), { checked: [], values: {} });
});

test("ステージごとの上位3人は戦力順ではなくステージの進み順", () => {
  const a = { members, mystic: { values: { "11": { coliseum: 10620 }, "12": { coliseum: 10605 }, "14": { coliseum: 10610 }, "13": { forest_of_life: 20100 } } } };
  assert.deepEqual(topByStage(a, "coliseum").map(m => m.name), ["A1", "A4", "A2"]);
});

test("画面：ステージごとに各同盟の上位3人（章-ステージと名前）を並べ、上のほうを明るく", () => {
  const a = { kid: 1524, abbr: "Pen", members, mystic: { checked: ["coliseum", "mystic_trial"], values: { "11": { coliseum: 10620 }, "14": { coliseum: 10610, mystic_trial: 2400 } } } };
  const b = { kid: 1537, abbr: "LOL", members: [{ name: "B1", id: "21", power: 600 }], mystic: { checked: ["coliseum"], values: { "21": { coliseum: 10611 } } } };
  const html = renderAllianceComparePage({ alliances: [a, b], targets: [{ kid: 1524, tag: "Pen" }, { kid: 1537, tag: "LOL" }], top: 3 });
  const dataJson = html.match(/<script id="acData" type="application\/json">([\s\S]*?)<\/script>/)[1];
  const script = html.match(/<script>(\(function\(\)\{\nvar A=[\s\S]*?)<\/script>/)[1];
  const body = { innerHTML: "" };
  const document = { getElementById: id => id === "acData" ? { textContent: dataJson } : id === "acBody" ? body : { querySelectorAll: () => [], addEventListener() {} } };
  new Function("document", "location", "history", script)(document, { href: "https://x/" }, { replaceState() {} });
  const text = body.innerHTML.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(text, /秘境の試練（ステージごとの上位3人）/);
  assert.match(text, /闘技場 1位 62-10 A1 62-1 B1 2位 61-10 A4 — 3位 — —/, "戦力ではなくステージの進み順。いない所は—");
  assert.match(body.innerHTML, /<td class="best"><span class="mem">62-10<small>A1<\/small>/, "上のほうを明るく");
  assert.match(text, /秘境の試練（総合） 1位 2,400 A4 取得中/, "総合は数字そのまま、取っていない種類は取得中");
  assert.match(text, /生命の森 1位 取得中 取得中/);
  assert.doesNotMatch(text, /1位どうし/, "戦力の順位どうしは比べない");
  assert.equal(MYSTIC_COMPARE_BOARDS.length, 7);
});

test("配線：表示の権限はプレイヤー比較と同じ（ranks_leaderboards）。足りない王国ランキングは裏で取りに行く", () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const route = index.slice(index.indexOf('if (url.pathname === "/alliance/compare") {'), index.indexOf('if (url.pathname === "/alliance") {'));
  assert.match(route, /visibilityEnabled\(await getPlayerVisibilitySettings\(env\.DB\), "ranks_leaderboards", auth\.role\)/);
  assert.match(route, /loadAllianceMystic\(env\.DB, a\)/);
  assert.match(route, /scheduleKingdomRankingFetch\(env, executionContext, found\.map\(a => a\.kid\), MYSTIC_COMPARE_BOARDS\.map\(b => b\[0\]\)\)/);
});
