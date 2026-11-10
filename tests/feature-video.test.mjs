// 機能紹介動画のスクリプト：場面・鍵の扱い・映さないものを確かめる（撮影そのものは手元／Actionsで行う）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../scripts/social/feature-video.mjs", import.meta.url), "utf8");

test("鍵は EagleEye のページへのリクエストにだけ付ける（ほかのサイトに送らない）", () => {
  assert.match(src, /ctx\.route\(u => u\.host === host, route => route\.continue\(\{ headers: \{ \.\.\.route\.request\(\)\.headers\(\), authorization: "Bearer " \+ token \} \}\)\)/);
  assert.doesNotMatch(src, /extraHTTPHeaders/, "全リクエストに付く設定は使わない");
  assert.doesNotMatch(src, /console\.log\([^)]*token/, "鍵をログに出さない");
});

test("映さないもの：活動情報（オンライン・最終活動）、ログイン表示、CSV出力ボタン", () => {
  assert.match(src, /オンライン\|最終活動\|最終ログイン/);
  assert.match(src, /\.ee-profile,\.ee-login-trigger,\.section-export\{visibility:hidden!important\}/);
});

test("「登録するとできること」はサイトと同じ定数から。ログインが必要な場面は中身が出なければ飛ばす", () => {
  assert.match(src, /import \{ ADVANCED_BENEFITS \} from "\.\.\/\.\.\/src\/role-upgrade\.js"/);
  assert.match(src, /sc\.login && \/ログインしてください\|ログインが必要\//);
  const wf = readFileSync(new URL("../.github/workflows/feature-video.yml", import.meta.url), "utf8");
  assert.match(wf, /EAGLEEYE_VIDEO_TOKEN: \$\{\{ secrets\.EAGLEEYE_VIDEO_TOKEN \}\}/);
  assert.match(wf, /workflow_dispatch/);
});
