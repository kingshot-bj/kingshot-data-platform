// BASIC→ADVANCEDの後押し：限定項目のぼかし表示、特典一覧、最初の一歩の案内。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lockedAdvancedItems, renderLockedSection, lockedInlineValue, advancedBenefitsHtml, onboardingStep, onboardingCopy, ADVANCED_TEASER_ITEMS } from "../src/role-upgrade.js";

const rank = { BASIC: 1, ADVANCED: 2, VIP: 3, ADMIN: 4, OWNER: 5 };
const isEnabled = (settings, key, role) => { const r = settings.find(s => s.item_key === key); return r ? rank[role] >= rank[r.min_role] : role === "OWNER"; };
const settings = [
  { item_key: "heroes_list", min_role: "BASIC" },
  { item_key: "heroes_skills", min_role: "ADVANCED" },
  { item_key: "gov_gear_list", min_role: "ADVANCED" },
  { item_key: "base_coordinates", min_role: "ADVANCED" },
  { item_key: "heroes_gear", min_role: "OWNER" }
];

test("BASICにはADVANCEDで見える項目だけをロック表示（OWNER限定や公開済みは出さない）", () => {
  const locked = lockedAdvancedItems(settings, "BASIC", isEnabled).map(i => i.key);
  assert.deepEqual(locked, ["heroes_skills", "gov_gear_list", "base_coordinates"]);
  assert.deepEqual(lockedAdvancedItems(settings, "ADVANCED", isEnabled), []);
  assert.ok(ADVANCED_TEASER_ITEMS.every(i => !/heroes_list|ranks/.test(i.key)), "英雄一覧・ランキングは対象外");
});

test("ぼかしセクションと座標の表示：中身はダミー、登録への導線あり", () => {
  const html = renderLockedSection(lockedAdvancedItems(settings, "BASIC", isEnabled));
  assert.match(html, /英雄スキル・領主装備/);
  assert.doesNotMatch(html, /座標/, "座標は1つの値として別に表示");
  assert.match(html, /href="\/my-player"/);
  assert.equal(renderLockedSection([]), "");
  assert.match(lockedInlineValue(), /🔒 ADVANCED/);
});

test("特典一覧と案内の文言", () => {
  const b = advancedBenefitsHtml();
  assert.match(b, /英雄スキル・英雄専用装備・英雄の装備/);
  assert.match(b, /プレイヤー3人 → 20人、王国1 → 3/);
  assert.equal(onboardingStep({ role: "BASIC", linked: false }), "link");
  assert.equal(onboardingStep({ role: "BASIC", linked: true }), "key");
  assert.equal(onboardingStep({ role: "ADVANCED", linked: true }), null);
  assert.match(onboardingCopy("link").title, /領主ID/);
  assert.match(onboardingCopy("key").title, /ADVANCED/);
});

test("配線：プレイヤー画面・マイKingShot・ホーム・全ページの帯", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /visibleProfile\.locked_advanced = lockedAdvancedItems\(visibilitySettings, auth\.role, visibilityEnabled\)/);
  assert.match(src, /\$\{renderLockedSection\(profile\?\.locked_advanced \|\| \[\]\)\}/);
  assert.ok(src.includes("(promoted?'':'" + advancedBenefitsHtml() + "')"), "マイKingShotに特典一覧（埋め込みなしの固定文字列）");
  assert.match(src, /id="homeOnboard" href="\/my-player" hidden/);
  assert.match(src, /return json\(\{ ok: true, \.\.\.counts, onboarding \}\)/);
  const ui = readFileSync(new URL("../src/eagleeye-ui.js", import.meta.url), "utf8");
  assert.match(ui, /function paintOnboarding\(step\)/);
  assert.match(ui, /location\.pathname==="\/my-player"/);
  const hs = readFileSync(new URL("../src/home-summary.js", import.meta.url), "utf8");
  assert.match(hs, /summary\.onboarding = /);
});

test("BASICへのADVANCED案内ポップアップ：しつこくしない出し方と、回数だけ数える", async () => {
  const { EAGLEEYE_DRAWER_INIT } = await import("../src/eagleeye-ui.js");
  const js = EAGLEEYE_DRAWER_INIT.replace(/<\/?script[^>]*>/g, "");
  assert.doesNotThrow(() => new Function(js));
  const fn = js.slice(js.indexOf("function paintUpgradePopup"), js.indexOf("// Pages that used to push"));
  assert.match(fn, /if\(\/\^\\\/\(my-player\|login\|owner\|admin\|auth\)\/\.test\(location\.pathname\)\)return;/, "マイKingShot・ログイン・管理画面では出さない");
  assert.match(fn, /if\(n<2\)return;/, "そのタブの1ページ目では出さない");
  assert.match(fn, /\},3000\);/, "開いて3秒後");
  assert.match(fn, /close\(3\)/);
  assert.match(fn, /close\(30\)/, "しばらく表示しない＝30日");
  assert.match(fn, /later\(3\);ping\("upgrade_popup_shown"\)/, "出したら3日は出さない");
  assert.match(fn, /href="\/my-player"/);
  assert.doesNotMatch(fn, /user_id|discord/i);
  assert.match(js, /paintOnboarding\(data\.onboarding\);paintUpgradePopup\(data\.onboarding\);/, "BASICの判定は既存の /api\/badges の結果を使う（読み取りを増やさない）");
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const ep = index.slice(index.indexOf('url.pathname === "/api/funnel-event"'), index.indexOf('url.pathname === "/api/funnel-event"') + 700);
  assert.match(ep, /isSameOriginRequest\(request\)/);
  assert.match(ep, /CLIENT_FUNNEL_STEPS\.includes\(body\?\.step\)/, "画面から送れるのは案内の2つだけ（ログインの段階は送れない）");
  const { CLIENT_FUNNEL_STEPS } = await import("../src/funnel.js");
  assert.deepEqual([...CLIENT_FUNNEL_STEPS], ["upgrade_popup_shown", "upgrade_popup_click"]);
});
