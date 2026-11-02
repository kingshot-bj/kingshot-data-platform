import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderPrivacyPolicyPage, renderTermsPage, renderAboutPage } from "../src/legal-pages.js";
import { renderAdsTxt, renderSitemapXml } from "../src/public-pages.js";
import { renderHeroCatalogPage } from "../src/hero-catalog-page.js";
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
  const route = 'if (url.pathname === "/privacy" || url.pathname === "/privacy-policy") return eagleEyeHtmlResponse(renderPrivacyPolicyPage(publicOrigin(request, env)));';
  assert.ok(index.includes(route));
  assert.ok(index.indexOf(route) < index.indexOf('if (url.pathname === "/api/auth/discord")'), "must be served without login");
  assert.ok(renderEagleEyeOtherMenu({ auth: null, compact: true }).includes('href="/privacy"'));
  assert.ok(renderEagleEyeOtherMenu({ auth: null, compact: false }).includes('href="/privacy"'));
});

test("terms page is public, complete and cross-linked", async () => {
  const terms = renderTermsPage();
  assert.ok(terms.includes("<title>利用規約 | EagleEye</title>"));
  for (const heading of ["本サービスの位置づけ", "MightPulse APIキーの提供", "禁止事項", "利用の制限・停止", "免責事項", "規約の変更"]) {
    assert.ok(terms.includes(heading), "missing section " + heading);
  }
  assert.ok(terms.includes('href="/privacy"'));
  assert.ok(html.includes('href="/terms"'));
  const index = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  const route = 'if (url.pathname === "/terms") return eagleEyeHtmlResponse(renderTermsPage(publicOrigin(request, env)));';
  assert.ok(index.includes(route));
  assert.ok(index.indexOf(route) < index.indexOf('if (url.pathname === "/api/auth/discord")'));
  assert.ok(renderEagleEyeOtherMenu({ auth: null, compact: true }).includes('href="/terms"'));
});

test("AdSense readiness: ad / external-transmission disclosure, about page, ads.txt", async () => {
  // Privacy policy discloses third-party ad cookies, opt-out and external transmission.
  for (const text of ["Google AdSense", "第三者配信事業者", "adssettings.google.com", "policies.google.com/technologies/ads", "外部送信", "Google LLC"]) {
    assert.ok(html.includes(text), "privacy policy must mention " + text);
  }
  assert.ok(!html.includes("広告やトラッキングを目的としたCookieは使用しません"), "outdated no-ads sentence removed");
  assert.match(html, /<h2>1\. このポリシーについて<\/h2>/);
  assert.match(renderPrivacyPolicyPage("https://eagleeye-ks.com"), /<link rel="canonical" href="https:\/\/eagleeye-ks\.com\/privacy">/);
  // About page: operator and contact.
  const about = renderAboutPage("https://eagleeye-ks.com");
  assert.match(about, /<title>運営者情報 \| EagleEye<\/title>/);
  assert.match(about, /運営者<\/b>：BJ/);
  assert.match(about, /href="\/support"/);
  assert.match(about, /関係がありません/);
  assert.match(about, /<link rel="canonical" href="https:\/\/eagleeye-ks\.com\/about">/);
  assert.ok(renderEagleEyeOtherMenu({ auth: null, compact: true }).includes('href="/about"'));
  // ads.txt only with a valid publisher id.
  assert.equal(renderAdsTxt(""), null);
  assert.equal(renderAdsTxt("ca-pub-123"), null);
  assert.equal(renderAdsTxt("pub-1234567890123456"), "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n");
  const index = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  const aboutRoute = 'if (url.pathname === "/about") return eagleEyeHtmlResponse(renderAboutPage(publicOrigin(request, env)));';
  assert.ok(index.includes(aboutRoute));
  assert.ok(index.indexOf(aboutRoute) < index.indexOf('if (url.pathname === "/api/auth/discord")'), "about must be public");
  assert.ok(index.includes('const ads = renderAdsTxt(env.ADSENSE_PUBLISHER_ID)'));
  // Sitemap and hero catalog SEO.
  assert.match(renderSitemapXml("https://x", []), /<loc>https:\/\/x\/about<\/loc>/);
  const catalog = await renderHeroCatalogPage({}, { origin: "https://eagleeye-ks.com" }).text();
  assert.match(catalog, /<meta name="description" content="キングショット（KingShot）の英雄のスキル一覧/);
  assert.match(catalog, /<link rel="canonical" href="https:\/\/eagleeye-ks\.com\/hero-catalog">/);
});

test("every page carries a footer with policy / operator / contact links", async () => {
  const index = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(index, /const EAGLEEYE_SITE_FOOTER = '<footer id="ee-site-footer"/);
  for (const href of ["/terms", "/privacy", "/about", "/support"]) assert.ok(index.includes('<a href="' + href + '">'), href);
  assert.match(index, /if \(!html\.includes\('id="ee-site-footer"'\)\)/);
});
