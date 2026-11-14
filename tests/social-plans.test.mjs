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

// 2026-11-14：SNS別の新規登録を数える（来訪は数えていたが、登録はSNSと結びついていなかった）。
import { pageViewBeaconScript, SIGNUP_SOURCES, SIGNUP_SOURCE_COOKIE, signupsBySource, sourcesCard } from "../src/growth.js";
import { recordSignupSource } from "../src/funnel.js";
import { readFileSync } from "node:fs";

test("SNSの ?ref= で来たら、SNSの名前だけを Cookie に30日残す", () => {
  const s = pageViewBeaconScript().replace(/<\/?script>/g, "");
  const run = search => {
    const jar = [];
    const doc = { visibilityState: "visible", referrer: "", querySelector: () => null };
    Object.defineProperty(doc, "cookie", { set: v => jar.push(v), get: () => "" });
    const win = {};
    const fn = new Function("window", "document", "location", "navigator", "localStorage", "Blob", "fetch", s);
    const ls = { m: {}, getItem(k) { return this.m[k] ?? null; }, setItem(k, v) { this.m[k] = String(v); } };
    fn(win, doc, { pathname: "/kingdoms", search, hostname: "eagleeye-ks.com" }, { webdriver: false, sendBeacon: () => true }, ls, function () {}, () => {});
    return jar;
  };
  assert.deepEqual(run("?ref=tt").map(c => c.split(";")[0]), ["ee_src=tiktok"]);
  assert.match(run("?ref=x")[0], /max-age=2592000/);
  assert.deepEqual(run("?ref=abcd1234"), [], "招待コードやほかの文字列では付けない");
  assert.deepEqual(run(""), []);
  assert.equal(SIGNUP_SOURCE_COOKIE, "ee_src");
  for (const k of ["x", "discord", "youtube", "tiktok", "instagram"]) assert.ok(SIGNUP_SOURCES.includes(k));
});

test("新規ログインのとき、決まったSNS名だけ funnel_daily に1つ足す", async () => {
  const runs = [];
  const db = { prepare: sql => ({ bind: (...a) => ({ run: async () => { runs.push([sql, a]); return {}; } }), run: async () => { runs.push([sql, []]); return {}; } }) };
  assert.equal(await recordSignupSource(db, "tiktok", SIGNUP_SOURCES, Date.parse("2026-11-14T12:00:00+09:00")), true);
  const insert = runs.find(([sql]) => sql.startsWith("INSERT INTO funnel_daily"));
  assert.deepEqual(insert[1], ["2026-11-14", "new_src:tiktok"]);
  assert.equal(await recordSignupSource(db, "evil';--", SIGNUP_SOURCES), false);
  assert.equal(await recordSignupSource(db, "", SIGNUP_SOURCES), false);
});

test("ログイン処理：新規のときだけ数えて、Cookie を消す（Discord・Google の両方）", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.equal((src.match(/isNew\)? await recordSignupSource\(env\.DB, /g) || []).length, 2);
  assert.equal((src.match(/serializeCookie\(SIGNUP_SOURCE_COOKIE, "", \{ maxAge: 0/g) || []).length, 2);
});

test("成長ダッシュボード：SNSごとの新規登録（7日）と登録率", () => {
  const events = { "2026-11-14": { funnel: { "new_src:tiktok": 2, login_new: 5 } }, "2026-11-13": { funnel: { "new_src:tiktok": 1, "new_src:x": 1 } } };
  assert.deepEqual(signupsBySource(events), { tiktok: 3, x: 1 });
  const card = sourcesCard({ sources: { all: { tiktok: 30, search: 50 }, last7: { tiktok: 30, search: 50 } }, landing: { all: {}, last7: {} } }, events);
  assert.match(card, /新規登録（7日）/);
  assert.match(card, /<td>TikTok<\/td><td>30<\/td><td>[^<]*<\/td><td>30<\/td><td>3<\/td><td>10%<\/td>/);
  assert.match(card, /検索[^<]*<\/td>(<td>[^<]*<\/td>){3}<td>—<\/td><td>—<\/td>/, "SNS以外は登録を数えない");
});
