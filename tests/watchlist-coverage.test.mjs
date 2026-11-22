import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { watchlistCovers, findCoveringWatchlist } from "../src/watchlist-coverage.js";

const now = 1_800_000_000;
const w = (id, kid, top_n, interval_hours, extra = {}) => ({ watchlist_id: id, kid, top_n, interval_hours, created_at: 100, last_success_at: null, ...extra });

test("an hourly top10 watchlist covers 6h/12h top10 and hourly top5 of the same kingdom", () => {
  const hourly = w("a", 1524, 10, 1);
  assert.equal(watchlistCovers(hourly, w("b", 1524, 10, 6)), true);
  assert.equal(watchlistCovers(hourly, w("c", 1524, 10, 12)), true);
  assert.equal(watchlistCovers(hourly, w("d", 1524, 5, 1)), true);
});

test("no coverage across kingdoms, for larger top_n, or for shorter intervals", () => {
  assert.equal(watchlistCovers(w("a", 1524, 10, 1), w("b", 1525, 10, 6)), false);
  assert.equal(watchlistCovers(w("a", 1546, 5, 1), w("b", 1546, 10, 6)), false);
  assert.equal(watchlistCovers(w("a", 1546, 10, 6), w("b", 1546, 5, 1)), false);
});

test("identical watchlists never cover each other, so one always fetches", () => {
  const a = w("a", 1524, 10, 1, { created_at: 100 });
  const b = w("b", 1524, 10, 1, { created_at: 200 });
  assert.equal(watchlistCovers(a, b), true);
  assert.equal(watchlistCovers(b, a), false);
  const c = w("c", 1524, 10, 1, { created_at: 100 });
  assert.notEqual(watchlistCovers(a, c), watchlistCovers(c, a));
});

test("a covering watchlist is used only when it succeeded within the covered interval", () => {
  const sixHour = w("b", 1524, 10, 6);
  const fresh = w("a", 1524, 10, 1, { last_success_at: now - 1800 });
  assert.equal(findCoveringWatchlist(sixHour, [fresh, sixHour], now)?.watchlist_id, "a");
  const stale = w("a", 1524, 10, 1, { last_success_at: now - 7 * 3600 });
  assert.equal(findCoveringWatchlist(sixHour, [stale, sixHour], now), null, "a failing cover lets the watchlist fetch itself");
  const never = w("a", 1524, 10, 1);
  assert.equal(findCoveringWatchlist(sixHour, [never, sixHour], now), null);
});

test("the cron skips covered watchlists before creating a job and keeps them marked successful", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const cron = src.slice(src.indexOf("async function runKingdomWatchlistJobs"), src.indexOf("async function processKingdomWatchlistJob"));
  const skip = cron.indexOf("findCoveringWatchlist(row");
  assert.ok(skip > 0, "coverage check present");
  assert.ok(skip < cron.indexOf("acquireKingdomWatchlistLock"), "checked before locking / fetching");
  assert.match(cron, /w\.last_success_at, w\.created_at/);
  assert.match(cron.slice(skip, skip + 600), /last_success_at = \?/);
});
