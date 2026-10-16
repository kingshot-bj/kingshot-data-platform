import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
const page = await readFile(new URL("../src/kingdom-watchlist-page.js", import.meta.url), "utf8");

test("new kingdom watchlists are not immediately due while their initial job is being created", () => {
  const handlerStart = source.indexOf(
    'if (request.method === "POST" && action === "create")',
    source.indexOf("async function handleKingdomWatchlistApi")
  );
  const handlerEnd = source.indexOf(
    'if (request.method === "POST" && action === "refresh")',
    handlerStart
  );
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, "watchlist create handler must exist");
  const handler = source.slice(handlerStart, handlerEnd);
  assert.ok(handler.includes("SELECT ?, ?, ?, ?, ?, 1, ?, NULL, NULL, ?, ?"));
  assert.ok(handler.includes(".bind(id, auth.discord_id, kid, topN, intervalHours, now, now, now, auth.discord_id, kid).first();"));
});

test("watchlist polling retries continuation after another worker holds the refresh lock", () => {
  const start = page.indexOf("async function pollJob(id,expectedJobId)");
  const end = page.indexOf('listNode.addEventListener("click"', start);
  assert.ok(start >= 0 && end > start, "watchlist polling handler must exist");
  const continuation = page.slice(start, end);
  assert.ok(continuation.includes("WATCHLIST_REFRESH_IN_PROGRESS"));
  assert.ok(continuation.includes("CONTINUATION_BUSY"));
  assert.ok(continuation.includes("CONTINUATION_ACCEPTED"));
  assert.ok(continuation.includes("setTimeout(resolve,4000)"));
});

test("kingdom watchlist and ranking history APIs reject inactive users", () => {
  for (const name of [
    "handleKingdomRankingHistoryApi",
    "handleKingdomWatchlistDataApi",
    "handleKingdomWatchlistApi"
  ]) {
    const start = source.indexOf("async function " + name);
    assert.ok(start >= 0, "missing handler: " + name);
    const next = source.indexOf("\nasync function ", start + 10);
    const handler = source.slice(start, next < 0 ? source.length : next);
    assert.ok(
      handler.includes('if (!auth || auth.status !== "ACTIVE")'),
      name + " must reject inactive users"
    );
  }
});

test("server-side cancellation is not overwritten by a late job failure", () => {
  assert.ok(
    (source.match(/UPDATE kingdom_watchlist_jobs SET status = 'FAILED', last_error = \?, updated_at = \? WHERE job_id = \? AND status IN \('RANKINGS','PLAYERS'\)/g) || []).length >= 2,
    "scheduler and manual refresh failure paths must guard active jobs"
  );
  assert.equal(
    (source.match(/UPDATE kingdom_watchlist_jobs SET status = 'FAILED', last_error = \?, updated_at = \? WHERE job_id = \?"/g) || []).length,
    0,
    "failure handlers must not unconditionally overwrite a cancelled job"
  );
});

test("late failure handlers do not replace the watchlist-level cancellation message", () => {
  assert.equal(
    (source.match(/UPDATE kingdom_watchlists SET last_run_at = \\?, last_error = \\?, updated_at = \\? WHERE watchlist_id = \\?"/g) || []).length,
    0,
    "failure updates must verify the matching job failure is still current"
  );
  assert.ok(
    (source.match(/AND EXISTS \\(SELECT 1 FROM kingdom_watchlist_jobs WHERE job_id = \\? AND status = 'FAILED' AND last_error = \\?\\)/g) || []).length >= 2,
    "scheduler and manual failure paths must preserve USER_CANCELLED when a late error arrives"
  );
});

test("ranking phase checks durable cancellation before persisting fetched ranking boards", () => {
  const start = source.indexOf("async function processKingdomWatchlistJob");
  const end = source.indexOf("\nasync function ", start + 20);
  const processor = source.slice(start, end);
  const checkpoint = processor.indexOf("WATCHLIST_JOB_STATE_CHANGED");
  const persistence = processor.indexOf("saveKingdomRankingBoard");
  assert.ok(checkpoint >= 0, "ranking batch must check durable job state after requests settle");
  assert.ok(persistence > checkpoint, "cancelled ranking batch must stop before ranking persistence");
  assert.match(processor.slice(checkpoint - 600, persistence), /USER_CANCELLED:/);
});

test("ranking and player cursor writes are guarded by the active phase", () => {
  assert.match(source, /SET player_cursor = player_cursor \+ 1, updated_at = \? WHERE job_id = \? AND status = 'RANKINGS'/);
  assert.match(source, /SET board_index = \?, player_cursor = 0, ranking_rows = [\s\S]{0,600}WHERE job_id = \? AND status = 'RANKINGS'/);
  assert.match(source, /SET player_ids_json = \?, player_cursor = \?, player_rows = \?, status = \?[\s\S]{0,600}WHERE job_id = \? AND status = 'PLAYERS'/);
});

test("ranking view button navigates using the registered kingdom id", () => {
  assert.match(page, /if\(action==="rankings"\).*location\.href="\/kingdom\/rankings\?kid="\+encodeURIComponent\(kid\)/s);
});
