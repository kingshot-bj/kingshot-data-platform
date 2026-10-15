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
