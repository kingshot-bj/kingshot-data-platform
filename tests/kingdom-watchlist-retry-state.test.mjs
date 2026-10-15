import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
const page = await readFile(new URL("../src/kingdom-watchlist-page.js", import.meta.url), "utf8");

test("failed kingdom watchlist jobs are eligible for bounded automatic retry", () => {
  assert.match(source, /status = 'FAILED' AND last_error LIKE 'RETRYABLE:%' AND updated_at <= \?/);
  assert.match(source, /RETRYABLE:\(RANKINGS\|PLAYERS\):/);
  assert.match(source, /Math\.min\(3600, 300 \* Math\.pow\(2,/);
  assert.match(source, /retryCount <= 5/);
});

test("retry resumes the committed job phase and cursor instead of always creating a new job", () => {
  assert.match(source, /const retryPhase = retry\[1\]/);
  assert.match(source, /status: retryPhase/);
  assert.match(source, /const retryPhase = job\.status === "PLAYERS" \? "PLAYERS" : "RANKINGS"/);
  assert.match(source, /board_index/);
});

test("retryable failed jobs can be resumed manually only while holding the watchlist lock", () => {
  const start = source.indexOf('if (request.method === "POST" && action === "refresh")', source.indexOf("async function handleKingdomWatchlistApi"));
  const end = source.indexOf('if (request.method === "POST" && action === "toggle")', start);
  const handler = source.slice(start, end < 0 ? start + 12000 : end);
  const lock = handler.indexOf("const lockToken = await acquireKingdomWatchlistLock");
  const resumeWrite = handler.indexOf("UPDATE kingdom_watchlist_jobs SET status = ?, updated_at = ? WHERE job_id = ? AND status = 'FAILED'");
  assert.ok(lock >= 0 && resumeWrite > lock, "failed-job transition must happen after acquiring the lock");
});

test("list API exposes retry timing and does not convert retryable errors into stale failures", () => {
  assert.match(source, /retry_after_at:/);
  assert.match(source, /retry_attempt:/);
  assert.match(source, /!String\(job\.last_error\)\.startsWith\("RETRYABLE:"\)/);
});

test("UI distinguishes retry wait, terminal failure, and completion", () => {
  assert.match(page, /再試行待ち（自動再開予定：/);
  assert.match(page, /phase==="FAILED"\?"失敗：/);
  assert.match(page, /phase==="COMPLETED"\?"完了：/);
  assert.match(page, /if\(state==="COMPLETED"&&\(!expectedJobId\|\|String\(job\.job_id\)===String\(expectedJobId\)\)\)/);
  assert.doesNotMatch(page, /\|\|w\.last_success_at\)/);
});

test("client requests time out instead of leaving controls busy forever", () => {
  assert.match(page, /new AbortController\(\)/);
  assert.match(page, /setTimeout\(function\(\)\{controller\.abort\(\);\},25000\)/);
  assert.match(page, /REQUEST_TIMEOUT/);
});

test("retry-wait state releases the UI busy flag so manual refresh remains available", () => {
  assert.match(page, /if\(state==="FAILED"&&job\.retryable\)\{refreshing\[id\]=false/);
});
