import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderPrivacyPolicyPage } from "../src/legal-pages.js";
import { renderEagleEyeOtherMenu } from "../src/eagleeye-ui.js";

const html = renderPrivacyPolicyPage();

test("privacy policy page renders the required sections", () => {
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(html.includes("<title>プライバシーポリシー | EagleEye</title>"));
  for (const heading of ["取得する情報", "利用目的", "Cookieとブラウザ保存", "外部サービス", "保存期間", "登録の解除・削除の依頼", "お問い合わせ"]) {
    assert.ok(html.includes(heading), "missing section " + heading);
  }
});

test("privacy policy matches actual data handling", async () => {
  const index = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  // Session cookie name and lifetime
  assert.ok(index.includes('const SESSION_COOKIE = "eagleeye_session";'));
  assert.ok(index.includes("const SESSION_MAX_AGE = 60 * 60 * 24 * 7;"));
  assert.ok(html.includes("eagleeye_session") && html.includes("7日間"));
  // Discord guild auto-join and Drive scope are disclosed
  assert.ok(index.includes('authorize.searchParams.set("scope", "identify guilds.join");'));
  assert.ok(html.includes("guilds.join"));
  const drive = await readFile(new URL("../src/google-drive.js", import.meta.url), "utf8");
  assert.ok(drive.includes('GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"'));
  assert.ok(html.includes("drive.file"));
  // Not affiliated disclaimer
  assert.ok(html.includes("関係がありません"));
});

test("privacy policy is public and linked from the other menu", async () => {
  const index = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  const route = 'if (url.pathname === "/privacy" || url.pathname === "/privacy-policy") return eagleEyeHtmlResponse(renderPrivacyPolicyPage());';
  assert.ok(index.includes(route));
  assert.ok(index.indexOf(route) < index.indexOf('if (url.pathname === "/api/auth/discord")'), "must be served without login");
  assert.ok(renderEagleEyeOtherMenu({ auth: null, compact: true }).includes('href="/privacy"'));
  assert.ok(renderEagleEyeOtherMenu({ auth: null, compact: false }).includes('href="/privacy"'));
});
