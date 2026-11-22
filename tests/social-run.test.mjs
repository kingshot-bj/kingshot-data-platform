// SNS投稿セットを「今すぐ作る」：オーナー画面のボタンから GitHub Actions を動かす。投稿はしない・重ねて動かさない・鍵を出さない・D1 を使わない。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { socialRunStatus, triggerSocialRun, SOCIAL_WORKFLOW } from "../src/social-run.js";
import { renderSocialOwnerPage } from "../src/social-pack.js";

const SECRET = "ghp_test_secret_value";
const env = { SOCIAL_GITHUB_DISPATCH_TOKEN: SECRET };
function fakeFetch({ runs = [], runsStatus = 200, dispatchStatus = 204 } = {}) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith("/dispatches")) return new Response(null, { status: dispatchStatus });
    return new Response(JSON.stringify({ workflow_runs: runs }), { status: runsStatus });
  };
  f.calls = calls;
  return f;
}
const run = (status, conclusion = null) => ({ status, conclusion, event: "workflow_dispatch", created_at: "2026-11-14T03:24:11Z", html_url: "https://github.com/kingshot-bj/kingshot-data-platform/actions/runs/1" });

test("鍵が無ければ GitHub に問い合わせず「未設定」", async () => {
  const f = fakeFetch();
  assert.deepEqual(await socialRunStatus({}, f), { ok: true, configured: false, running: false, last: null });
  assert.deepEqual(await triggerSocialRun({}, f), { ok: false, error: "NOT_CONFIGURED" });
  assert.equal(f.calls.length, 0);
});

test("作成中なら重ねて動かさない", async () => {
  const f = fakeFetch({ runs: [run("in_progress")] });
  const r = await triggerSocialRun(env, f);
  assert.equal(r.error, "ALREADY_RUNNING");
  assert.ok(!f.calls.some(c => c.url.endsWith("/dispatches")));
});

test("動かすときは main で、投稿はしない（post: false 固定）。このリポジトリのこのワークフローだけ", async () => {
  const f = fakeFetch({ runs: [run("completed", "success")] });
  assert.deepEqual(await triggerSocialRun(env, f), { ok: true });
  const d = f.calls.find(c => c.url.endsWith("/dispatches"));
  assert.equal(d.url, "https://api.github.com/repos/kingshot-bj/kingshot-data-platform/actions/workflows/social-weekly.yml/dispatches");
  assert.equal(d.init.method, "POST");
  assert.deepEqual(JSON.parse(d.init.body), { ref: "main", inputs: { post: false } });
  assert.equal(d.init.headers.authorization, `Bearer ${SECRET}`);
  assert.equal(SOCIAL_WORKFLOW.workflow, "social-weekly.yml");
});

test("鍵が拒否された・GitHub が落ちている：分かるエラーにする。返す内容に鍵の値を入れない", async () => {
  assert.equal((await triggerSocialRun(env, fakeFetch({ runsStatus: 401 }))).error, "GITHUB_TOKEN_REJECTED");
  assert.equal((await triggerSocialRun(env, fakeFetch({ dispatchStatus: 403 }))).error, "GITHUB_TOKEN_REJECTED");
  assert.equal((await triggerSocialRun(env, fakeFetch({ dispatchStatus: 500 }))).error, "GITHUB_UNAVAILABLE");
  const down = async () => { throw new Error("network"); };
  assert.equal((await socialRunStatus(env, down)).error, "GITHUB_UNAVAILABLE");
  assert.equal((await triggerSocialRun(env, down)).error, "GITHUB_UNAVAILABLE");
  const status = await socialRunStatus(env, fakeFetch({ runs: [run("completed", "failure")] }));
  assert.equal(status.last.conclusion, "failure");
  assert.ok(!JSON.stringify(status).includes(SECRET));
});

test("D1 を使わない・鍵をログに出さない", () => {
  const src = readFileSync(new URL("../src/social-run.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /env\.DB|\.prepare\(/);
  assert.doesNotMatch(src, /console\./);
});

test("ルート：オーナーだけ。POST は同じサイトからだけ", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const line = src.split("\n").find(l => l.includes('url.pathname === "/owner/social/run"'));
  assert.ok(line, "ルートがある");
  assert.ok(line.indexOf("requireOwner") < line.indexOf("triggerSocialRun"));
  assert.ok(line.indexOf("isSameOriginRequest") < line.indexOf("triggerSocialRun"));
});

test("オーナー画面：「今すぐ作る」ボタンがあり、スクリプトが壊れていない", () => {
  const html = renderSocialOwnerPage({ week: "2026-11-09", items: [] }, null);
  assert.match(html, /id="run-btn"/);
  assert.match(html, /投稿はしません/);
  for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new Function(m[1]), "スクリプトの文法");
  assert.doesNotMatch(html, /SOCIAL_GITHUB_DISPATCH_TOKEN[^<]*ghp_/);
});
