// 同盟比較：違う王国の同盟どうし、ADVANCED以上、最初は上位3人、メンバー表は同盟詳細と同じしくみで読む。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseAllianceCompareTargets, canUseAllianceCompare, summarizeTop, powerBands, renderAllianceComparePage, ALLIANCE_COMPARE_DEFAULT_TOP } from "../src/alliance-compare.js";
import { loadAllianceForCompare } from "../src/kingdom-portal.js";

test("同盟の指定：王国番号:タグ、最大4つ、重複と形の違うものは捨てる", () => {
  assert.deepEqual(parseAllianceCompareTargets(["1537:LOL", "1524:Pen", "1537:lol", "abc", "1:A,2:B,3:C"]), [{ kid: 1537, tag: "LOL" }, { kid: 1524, tag: "Pen" }, { kid: 1, tag: "A" }, { kid: 2, tag: "B" }]);
  assert.deepEqual(parseAllianceCompareTargets(["1524：Pen"]), [{ kid: 1524, tag: "Pen" }], "全角コロンも受け付ける");
});

test("使える人：ADVANCED以上。最初は上位3人", () => {
  for (const r of ["ADVANCED", "VIP", "ADMIN", "OWNER"]) assert.ok(canUseAllianceCompare(r), r);
  assert.ok(!canUseAllianceCompare("BASIC"));
  assert.equal(ALLIANCE_COMPARE_DEFAULT_TOP, 3);
});

test("集計：上位N人の合計・平均（戦力不明は数えない）、戦力帯", () => {
  const members = [{ power: 6e8 }, { power: 4e8 }, { power: 2e8 }, { power: 5e7 }, { power: null }];
  const t3 = summarizeTop(members, 3);
  assert.equal(t3.count, 3); assert.equal(t3.sum, 12e8); assert.equal(t3.avg, 4e8);
  assert.equal(summarizeTop(members, 0).count, 4, "0は全員");
  assert.deepEqual(powerBands(members).map(b => b.count), [1, 1, 1, 1]);
});

test("読み込み：保存済みのメンバー表を使い、ランキングの戦力・順位で補う。取得してよくなければ取りに行かない", async () => {
  const roster = { roster: [{ nick_name: "987a", governor_id: "1", power: 4.98e8, alliance_rank_label: "R5" }, { nick_name: "foryard", governor_id: "2", power: "353.4M", alliance_rank_label: "R4" }] };
  const calls = [];
  const db = { prepare: sql => { calls.push(sql); const s = { bind: () => s,
    first: async () => sql.includes("FROM alliance_catalog") ? { kid: 1537, aid: "154600017", abbr: "LOL", name: "LegionOfLegends", power: null, power_rank: null, r2_latest_key: "k", updated_at: Math.floor(Date.now() / 1000) - 100 } : sql.includes("FROM kingdom_ranking_current") ? { kid: 1537, aid: "154600017.0", abbr: "LOL", name: "LegionOfLegends", power: 15.57e9, power_rank: 2 } : null,
    run: async () => ({}), all: async () => ({ results: [] }) }; return s; } };
  const env = { DB: db, ARCHIVE: { get: async () => ({ body: new Response(JSON.stringify({ payload: roster })).body }) } };
  const a = await loadAllianceForCompare(env, 1537, "LOL", { canFetch: false });
  assert.equal(a.abbr, "LOL"); assert.equal(a.power, 15.57e9); assert.equal(a.power_rank, 2);
  assert.equal(a.members.length, 2);
  assert.equal(a.members[1].power, 353.4e6, "\"353.4M\" も数値にする");
  assert.equal(a.fetched, false);
  assert.ok(!calls.some(s => s.includes("api_request_locks") || s.includes("alliance_refresh")), "取りに行かない");
});

test("画面：2つ以上で比較、切り替えは3・10・20・30・全員、目安の注記、検索に載せない、文字はエスケープ", () => {
  const al = (kid, abbr, n) => ({ kid, abbr, name: abbr + "<x>", power: 1e10, power_rank: 2, observedAt: 1794100000, members: Array.from({ length: n }, (_, i) => ({ name: abbr + i, power: (n - i) * 1e8, roleLabel: "R4" })) });
  const html = renderAllianceComparePage({ alliances: [al(1537, "LOL", 5), al(1524, "Pen", 4)], targets: [{ kid: 1537, tag: "LOL" }, { kid: 1524, tag: "Pen" }] });
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /data-n="3">上位3人<\/button>/); assert.match(html, /data-n="0">全員<\/button>/);
  assert.match(html, /部隊戦闘力とは違うので目安/);
  assert.match(html, /cur=3,/);
  assert.doesNotMatch(html, /LOL<x>/); assert.match(html, /LOL\\u003cx>/);
  const one = renderAllianceComparePage({ alliances: [al(1537, "LOL", 2), { kid: 9, tag: "ZZZ", error: "NOT_FOUND" }], targets: [] });
  assert.match(one, /見つからなかった同盟：王国9の「ZZZ」/);
  assert.match(one, /2つ以上の同盟を入れると比較が表示されます/);
});

test("配線：ログイン必須・ADVANCED以上・入口（同盟詳細・同盟一覧）・メンバー表の取得は同盟詳細と同じ10分制限", () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(index, /if \(url\.pathname === "\/alliance\/compare"\) \{/);
  assert.match(index, /if \(!canUseAllianceCompare\(auth\.role\)\) return eagleEyeHtmlResponse\(renderAllianceComparePage\(\{ message:/);
  assert.match(index, /loadAllianceForCompare\(env, t\.kid, t\.tag, \{ canFetch: true \}\)/);
  const portal = readFileSync(new URL("../src/kingdom-portal.js", import.meta.url), "utf8");
  assert.match(portal, /href='\/alliance\/compare\?a="\+encodeURIComponent\(kid\+":"\+\(allianceAbbr\|\|tag\)\)/);
  assert.match(portal, /<a href='\/alliance\/compare'>⚔️ 同盟を比べる/);
  const fn = portal.slice(portal.indexOf("export async function loadAllianceForCompare"));
  assert.match(fn, /canFetch && stale && env\.ARCHIVE && await claimAllianceRefresh\(db,/);
});
