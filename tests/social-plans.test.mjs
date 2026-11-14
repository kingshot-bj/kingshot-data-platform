// SNS投稿の企画：SNSごとの投稿文をコピーして使う。?ref= はSNS名だけ。守ること（予想しない・活動情報に触れない・公式と誤解させない）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { SOCIAL_PLANS, SOCIAL_SERIES, SOCIAL_KINDS, PLAN_PLATFORMS, planCaptions, profileLink, renderPlansSection } from "../src/social-plans.js";
import { SOCIAL_PLATFORMS, renderSocialOwnerPage } from "../src/social-pack.js";
import { classifyTrafficSource, TRAFFIC_SOURCES } from "../src/growth.js";

test("企画30件・番号は重ならない・シリーズと形式は決まったものだけ", () => {
  assert.equal(SOCIAL_PLANS.length, 30);
  assert.equal(new Set(SOCIAL_PLANS.map(p => p.id)).size, 30);
  for (const p of SOCIAL_PLANS) {
    assert.ok(SOCIAL_SERIES[p.series], p.id);
    assert.ok(SOCIAL_KINDS[p.kind], p.id);
    assert.match(p.path, /^\/[a-z0-9/_-]*$/, `${p.id}: 機能ページへのリンク（トップページに飛ばさない）`);
    assert.notEqual(p.path, "/", p.id);
  }
});

test("SNSの並びは social-pack と同じ", () => {
  assert.deepEqual([...PLAN_PLATFORMS], [...SOCIAL_PLATFORMS]);
});

test("リンクの ?ref= はSNS名だけ。TikTok・Instagram はプロフィールのリンクへ案内", () => {
  const c = planCaptions(SOCIAL_PLANS[0]);
  assert.match(c.x, /https:\/\/eagleeye-ks\.com\/kingdoms\?ref=x(\s|$)/);
  assert.match(c.discord, /\?ref=discord(\s|$)/);
  assert.match(c.youtube.description, /\?ref=youtube(\s|$)/);
  assert.match(c.tiktok, /プロフィールのリンク/);
  assert.match(c.instagram, /プロフィールのリンク/);
  assert.equal(profileLink("tiktok"), "https://eagleeye-ks.com/?ref=tiktok");
  assert.ok(c.youtube.title.length <= 100);
});

test("?ref= のSNS名は成長ダッシュボードでSNSごとに数えられる（TikTok・Instagram も）", () => {
  for (const p of ["x", "discord", "youtube", "tiktok", "instagram"]) assert.equal(classifyTrafficSource({ tag: p }), p);
  assert.equal(classifyTrafficSource({ refHost: "www.tiktok.com" }), "tiktok");
  assert.equal(classifyTrafficSource({ refHost: "l.instagram.com" }), "instagram");
  assert.equal(classifyTrafficSource({ refHost: "facebook.com" }), "social");
  assert.ok(TRAFFIC_SOURCES.some(s => s.key === "tiktok") && TRAFFIC_SOURCES.some(s => s.key === "instagram"));
});

test("投稿文に書かないこと：勝敗予想・活動情報・公式・ログイン不要", () => {
  const all = SOCIAL_PLANS.map(p => JSON.stringify(planCaptions(p))).join("\n");
  assert.doesNotMatch(all, /勝利予想|勝つのは|有利|オンライン|最終ログイン|最終活動|公式サイト|ログイン不要/);
  assert.match(all, /非公式/);
});

test("オーナー画面：企画ごとにSNS別の投稿文とコピーボタン。スクリプトは壊れていない", () => {
  const sec = renderPlansSection();
  assert.equal((sec.match(/<details class="plan">/g) || []).length, 30);
  assert.equal((sec.match(/class="copy"/g) || []).length, 30 * 5 + 2);
  assert.match(sec, /KvK開催中だけ/);
  assert.match(sec, /本人の了解が必要/);
  assert.equal((sec.match(/画像はまだ作れない/g) || []).length, 2, "先週比・秘境の試練のランキング画像はまだ作れない");
  const html = renderSocialOwnerPage({ week: "2026-11-09", items: [], origin: "https://eagleeye-ks.com" }, null);
  assert.match(html, /id="plans"/);
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new Function(m[1]));
});
