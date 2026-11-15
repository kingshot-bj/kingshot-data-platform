// 2026-11-15：同盟比較に「最新を取得」。今まではメンバー表・秘境の試練とも24時間より古いときだけ取りに行っていた。
// ボタンでは、メンバー表は10分・秘境の試練は1時間より古いものだけ取り直す（API Pool を使いすぎない下限）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderAllianceComparePage } from "../src/alliance-compare.js";
import { loadAllianceForCompare, ALLIANCE_COMPARE_REFRESH_MIN_AGE_SECONDS, ALLIANCE_COMPARE_STALE_SECONDS } from "../src/kingdom-portal.js";

const alliance = (kid, abbr) => ({ kid, abbr, name: abbr, power: 1e9, observedAt: 1794100000, members: [{ id: "1", name: "a", power: 1e8 }] });

test("ページ：2つ以上の同盟があるときだけ「最新を取得」。押すと同じ比較の URL に POST", () => {
  const targets = [{ kid: 1524, tag: "Pen" }, { kid: 1537, tag: "LOL" }];
  const html = renderAllianceComparePage({ alliances: [alliance(1524, "Pen"), alliance(1537, "LOL")], targets, top: 10 });
  assert.match(html, /<form class="card ac-refresh" method="post" action="\/alliance\/compare\?a=1524%3APen&amp;a=1537%3ALOL&amp;top=10"/);
  assert.match(html, /最新を取得/);
  assert.match(html, /メンバー表は10分、秘境の試練は1時間より古いもの/);
  assert.match(renderAllianceComparePage({ alliances: [alliance(1524, "Pen"), alliance(1537, "LOL")], targets, refreshed: true }), /秘境の試練は裏で取得中/);
  assert.doesNotMatch(renderAllianceComparePage({ alliances: [alliance(1524, "Pen")], targets: targets.slice(0, 1) }), /class="card ac-refresh"/);
});

test("取り直す下限：メンバー表10分（同じ同盟は10分に1回のロックと同じ）。ふだんの表示は今までどおり24時間", () => {
  assert.equal(ALLIANCE_COMPARE_REFRESH_MIN_AGE_SECONDS, 600);
  assert.equal(ALLIANCE_COMPARE_STALE_SECONDS, 24 * 3600);
  const src = readFileSync(new URL("../src/kingdom-portal.js", import.meta.url), "utf8");
  assert.match(src, /now - observedAt > maxAgeSeconds/);
});

test("取得しない設定（canFetch:false）なら、古くても MightPulse には行かない", async () => {
  const db = { prepare: () => { const s = { bind: () => s, first: async () => ({ kid: 1, aid: "9", abbr: "Pen", name: "Pen", updated_at: 1 }), all: async () => ({ results: [] }), run: async () => ({}) }; return s; } };
  const out = await loadAllianceForCompare({ DB: db, ARCHIVE: null }, 1, "Pen", { canFetch: false, maxAgeSeconds: 600 });
  assert.notEqual(out.fetched, true);
});

test("ルート：POST はADVANCED以上・同じサイトから。メンバー表10分・秘境の試練1時間の下限を渡して、同じページに戻す", () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const route = index.slice(index.indexOf('if (url.pathname === "/alliance/compare") {'), index.indexOf('if (url.pathname === "/alliance") {'));
  const post = route.slice(route.indexOf('if (request.method === "POST")'), route.indexOf("const targets = parseAllianceCompareTargets", route.indexOf('if (request.method === "POST")') + 400));
  assert.ok(post.indexOf("canUseAllianceCompare") < post.indexOf("loadAllianceForCompare"));
  assert.ok(post.indexOf("isSameOriginRequest") < post.indexOf("loadAllianceForCompare"));
  assert.match(post, /maxAgeSeconds: ALLIANCE_COMPARE_REFRESH_MIN_AGE_SECONDS/);
  assert.match(post, /staleSeconds: ALLIANCE_COMPARE_RANKING_REFRESH_SECONDS/);
  assert.match(post, /isQuietAgentRequest\(request, auth\)/, "撮影・Claude の確認用アクセスでは取りに行かない");
  assert.match(post, /status: 303/);
  assert.match(index, /const ALLIANCE_COMPARE_RANKING_REFRESH_SECONDS = 3600;/);
});
