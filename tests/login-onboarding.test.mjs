// ログイン直後の領主登録の案内（2026-11-17）。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { postLoginPath, onboardingPath, welcomeBannerHtml } from "../src/login-onboarding.js";

const db = linked => ({ prepare: () => { const st = { bind: () => st, first: async () => (linked ? { x: 1 } : null) }; return st; } });

test("領主未登録の新しい人は、元のページを覚えたままマイKingShotの登録欄へ", async () => {
  assert.equal(await postLoginPath(db(false), { userId: "u", isNew: true, returnPath: "/alliance/compare?a=1" }), "/my-player?welcome=1&next=%2Falliance%2Fcompare%3Fa%3D1");
  assert.equal(await postLoginPath(db(false), { userId: "u", isNew: true, returnPath: null }), "/my-player?welcome=1");
});

test("前からの人は、ホームに戻るときだけ案内。共有リンクなどはそのページへ", async () => {
  assert.equal(await postLoginPath(db(false), { userId: "u", isNew: false, returnPath: "/" }), "/my-player?welcome=1");
  assert.equal(await postLoginPath(db(false), { userId: "u", isNew: false, returnPath: "/kvk" }), "/kvk");
});

test("登録済みの人はいつも元のページ", async () => {
  assert.equal(await postLoginPath(db(true), { userId: "u", isNew: true, returnPath: "/kvk" }), "/kvk");
  assert.equal(await postLoginPath(db(true), { userId: "u", isNew: false, returnPath: null }), "/");
});

test("マイKingShot へ戻る場合は next を付けない・案内の戻るリンクはエスケープ", () => {
  assert.equal(onboardingPath("/my-player"), "/my-player?welcome=1");
  assert.match(welcomeBannerHtml('/x?a="b"'), /href="\/x\?a=&quot;b&quot;"/);
  assert.ok(!welcomeBannerHtml(null).includes("元のページへ"));
});

test("Discord・Google の両方のログインで案内を通す／マイKingShot の next は自サイトのパスだけ", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.equal((src.match(/await postLoginPath\(env\.DB, \{ userId: /g) || []).length, 2);
  assert.match(src, /welcomeBannerHtml\(sanitizeLoginReturnPath\(url\.searchParams\.get\("next"\)\)\)/);
});

test("案内はマイKingShot の見出しと説明のすぐ後に入る（差し込み先が変わったら気づける）", () => {
  const src = readFileSync(new URL("../src/my-player-page.js", import.meta.url), "utf8");
  assert.match(src, /<h1 class="title">マイKingShot<\/h1><p class="sub">[^<]*<\/p>/);
});
