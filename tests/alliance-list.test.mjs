// 同盟一覧：王国の同盟ランキング（全同盟）を先に使う。同盟の詳細を開いた時に入る alliance_catalog が1件あるだけで、
// 「開いた同盟1つだけ・順位—・戦力0」の一覧になっていた（王国1537で発生）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderAllianceListPage, renderAlliancePage } from "../src/kingdom-portal.js";

const ranking = [
  { kid: 1537, target_id: "154600005", aid: "154600005.0", abbr: "GAN", name: "GANgsters", power: 1.5e9, power_rank: 12 },
  { kid: 1537, target_id: "154600017", aid: "154600017.0", abbr: "LOL", name: "LegionOfLegends", power: 15.57e9, power_rank: 2 },
  { kid: 1537, target_id: "154600064", aid: "154600064.0", abbr: "TlT", name: "EATers", power: 15.14e9, power_rank: 3 }
];
const catalogRows = [
  { kid: 1537, aid: "154600017", abbr: "LOL", name: "LegionOfLegends", power: null, member_count: 87, power_rank: null },
  { kid: 1537, aid: "999", abbr: "NEW", name: "NewAlliance", power: null, member_count: 3, power_rank: null }
];
function fakeEnv({ rankingRows = ranking, catalog = catalogRows } = {}) {
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: sql.includes("FROM kingdom_ranking_current") ? [...rankingRows].sort((a, b) => a.power_rank - b.power_rank) : sql.includes("FROM alliance_catalog") ? catalog : [] }),
    first: async () => {
      if (sql.includes("FROM alliance_catalog")) return catalog.find(c => [c.abbr, c.aid].includes(args[1])) || null;
      if (sql.includes("FROM kingdom_ranking_current")) return rankingRows.find(r => [r.abbr, r.aid, r.target_id].includes(args[1])) || null;
      return null;
    },
    run: async () => ({})
  });
  return { DB: { prepare: sql => stmt(sql) } };
}
const list = async env => {
  const out = await renderAllianceListPage(new Request("https://eagleeye-ks.com/kingdom/alliances?kid=1537"), env);
  return typeof out === "string" ? out : await out.text();
};
const rowsOf = html => [...html.matchAll(/<a class='row'[^>]*><b>#([^<]*)<\/b><span>([^<]*)<\/span><em>([^<]*)<\/em>/g)].map(m => [m[1], m[2], m[3]]);

test("同盟一覧：詳細を開いた同盟が1件あっても、ランキングの全同盟を順位どおりに出す", async () => {
  const rows = rowsOf(await list(fakeEnv()));
  assert.deepEqual(rows.map(r => r[1]), ["LegionOfLegends", "EATers", "GANgsters", "NewAlliance"]);
  assert.equal(rows[0][0], "2");
  assert.notEqual(rows[0][2], "0", "戦力は0ではない");
  assert.equal(rows.filter(r => r[1] === "LegionOfLegends").length, 1, "同じ同盟を2回出さない");
  const html = await list(fakeEnv());
  assert.doesNotMatch(html, /ランキングcurrent/, "内部用の文字を出さない");
  assert.match(html, /LegionOfLegends<\/span><em>[^<]*<\/em><small>87人<\/small>/, "人数が分かる同盟は人数を出す");
  assert.match(html, /GANgsters<\/span><em>[^<]*<\/em><small><\/small>/, "人数が分からなければ空");
});

test("同盟一覧：ランキングがない王国では alliance_catalog の同盟を出す", async () => {
  const rows = rowsOf(await list(fakeEnv({ rankingRows: [] })));
  assert.deepEqual(rows.map(r => r[1]), ["LegionOfLegends", "NewAlliance"]);
});

test("同盟詳細：alliance_catalog に戦力・順位がなければ、ランキングの値で補う", async () => {
  const out = await renderAlliancePage(new Request("https://eagleeye-ks.com/alliance?kid=1537&tag=LOL"), fakeEnv(), null);
  const html = typeof out === "string" ? out : await out.text();
  assert.match(html, /LegionOfLegends/);
  assert.match(html, /15\.6B|15\.57B|155億|15,570/);
});
