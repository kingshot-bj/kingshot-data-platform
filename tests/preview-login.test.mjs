import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyPreviewRole, previewRoleOf, safeEqual, previewLoginLimited, notePreviewLoginFailure, resetPreviewLoginFailures, renderPreviewLoginPage } from "../src/preview-login.js";

// 2026-11-16：プレビューでもログインが要る画面（限定の着せ替えなど）を見たい。Discord のログインは使えないので疑似ログイン。
test("表示する権限：プレビューのときだけ差し替える・知らない権限は無視", () => {
  const user = { user_id: 1, role: "OWNER" };
  assert.equal(applyPreviewRole(user, { preview_role: "VIP" }, true).role, "VIP");
  assert.equal(applyPreviewRole(user, { preview_role: "VIP" }, false).role, "OWNER", "本番では効かない");
  assert.equal(applyPreviewRole(user, { preview_role: "ADMIN" }, true).role, "OWNER", "許可していない権限には上げない");
  assert.equal(applyPreviewRole(user, {}, true).role, "OWNER");
  assert.equal(applyPreviewRole(null, { preview_role: "VIP" }, true), null);
  assert.equal(previewRoleOf({ preview_role: "BASIC" }), "BASIC");
});

test("合言葉：一致だけ通す・空は通さない・10回失敗で止める", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("", ""), false);
  assert.equal(safeEqual(null, undefined), false);
  resetPreviewLoginFailures();
  const t = 1_000_000;
  for (let i = 0; i < 9; i++) notePreviewLoginFailure(t);
  assert.equal(previewLoginLimited(t), false);
  notePreviewLoginFailure(t);
  assert.equal(previewLoginLimited(t), true);
  assert.equal(previewLoginLimited(t + 601_000), false, "10分たてば戻る");
  resetPreviewLoginFailures();
});

test("ログイン画面：noindex・合言葉が無いときはフォームを出さない", () => {
  const html = renderPreviewLoginPage({ configured: true });
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<form method="post" action="\/preview\/login">/);
  assert.match(html, /<option value="VIP">VIP<\/option>/);
  assert.doesNotMatch(renderPreviewLoginPage({ configured: false }), /<form/);
});

test("配線：プレビューのときだけルートがある・D1 に書かない・本番の鍵は使わない", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /if \(isPreviewEnv\(env\) && \(url\.pathname === "\/preview\/login" \|\| url\.pathname === "\/preview\/logout"\)\) return await handlePreviewLogin/);
  assert.match(src, /return applyPreviewRole\(user, session, isPreviewEnv\(env\)\) \|\| null;/);
  const handler = src.slice(src.indexOf("async function handlePreviewLogin"), src.indexOf("async function getAuthenticatedUser"));
  assert.doesNotMatch(handler, /INSERT|UPDATE|DELETE/i);
  assert.match(handler, /WHERE role = 'OWNER'/);
  const wf = readFileSync(new URL("../.github/workflows/pr-preview.yml", import.meta.url), "utf8");
  assert.match(wf, /EAGLEEYE_SESSION_SECRET:c\.randomBytes\(32\)/, "セッション鍵はデプロイごとに作る");
  assert.match(wf, /PREVIEW_LOGIN_KEY: \$\{\{ secrets\.PREVIEW_LOGIN_KEY \}\}/);
  assert.match(wf, /--secrets-file "\$RUNNER_TEMP\/preview-secrets\.json"/);
  assert.match(wf, /rm -f "\$RUNNER_TEMP\/preview-secrets\.json"/);
});
