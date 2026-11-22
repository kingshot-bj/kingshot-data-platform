// 使い方（トリセツ）：だれでも見られる。数字はほかの画面と同じ定数から作る。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderGuidePage } from "../src/guide-page.js";
import { ADVANCED_BENEFITS } from "../src/role-upgrade.js";
import { PLAYER_COMPARE_MAX } from "../src/player-compare.js";
import { INVITE_BONUS, INVITE_BONUS_CAP } from "../src/referrals.js";

test("中身：はじめかた・権限・主な機能・表示の見かた・困ったとき", () => {
  const html = renderGuidePage("https://eagleeye-ks.com");
  assert.match(html, /<title>使い方（トリセツ） \| EagleEye<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/eagleeye-ks.com\/guide">/);
  for (const h of ["はじめかた（3ステップ）", "権限（BASIC・ADVANCED・VIP）", "比べる", "イベント", "表示の見かた", "困ったときは"]) assert.ok(html.includes(h), h);
  for (const b of ADVANCED_BENEFITS) assert.ok(html.includes(b.replace(/&/g, "&amp;")), "ADVANCEDで増えること：" + b);
  assert.ok(html.includes(`最大${PLAYER_COMPARE_MAX}人`));
  assert.ok(html.includes(`+${INVITE_BONUS.invitedSignup}`) && html.includes(`合計${INVITE_BONUS_CAP}まで`));
  for (const href of ["/my-player", "/support", "/status", "/kvk"]) assert.ok(html.includes(`href="${href}"`), href);
  assert.doesNotMatch(html, /あまね|BJにゃん/, "個人名は出さない");
});

test("配線：/guide は公開キャッシュ、その他メニュー・サイトマップに入る", async () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(index, /url\.pathname === "\/guide"\) return servePublicCached\(request, executionContext, async \(\) => eagleEyeHtmlResponse\(renderGuidePage\(/);
  const ui = readFileSync(new URL("../src/eagleeye-ui.js", import.meta.url), "utf8");
  assert.match(ui, /key: "guide", href: "\/guide", label: "使い方"/);
  const { renderSitemapXml } = await import("../src/public-pages.js");
  assert.match(renderSitemapXml("https://x", []), /<loc>https:\/\/x\/guide<\/loc>/);
});
