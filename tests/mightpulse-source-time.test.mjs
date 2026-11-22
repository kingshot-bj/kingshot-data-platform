import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const index = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
const start = index.indexOf("function normalizeMightPulseTimestamp");
const end = index.indexOf("async function ensureKingdomWatchlistFreshnessSchema");
const [normalize, sourceTime] = new Function(index.slice(start, end) + ";return [normalizeMightPulseTimestamp, getMightPulseSourceTimestamp];")();

test("numeric timestamps (seconds, milliseconds, strings) are parsed", () => {
  assert.equal(normalize("1793500000"), 1793500000);
  assert.equal(normalize("1793500000123"), 1793500000);
  assert.equal(normalize(1793500000123), 1793500000);
  assert.equal(normalize("2026-11-01T11:00:00Z"), Date.parse("2026-11-01T11:00:00Z") / 1000);
  assert.equal(normalize(""), null);
  assert.equal(normalize("not a date"), null);
});

test("ranking responses report their time in board.captured_at", () => {
  // Shape observed in production: { ok, kid, limit, boards: [{..., captured_at, rows}], board: {..., captured_at, rows} }
  assert.equal(sourceTime({ ok: true, kid: 1524, board: { key: "personal_power", captured_at: "2026-11-01T10:00:00Z", rows: [] }, boards: [] }), Date.parse("2026-11-01T10:00:00Z") / 1000);
  assert.equal(sourceTime({ boards: [{ captured_at: 1793500000 }] }), 1793500000);
  assert.equal(sourceTime({ cached_at: "1793400000" }), 1793400000, "player responses keep using cached_at");
  assert.equal(sourceTime({ ok: true }), null);
  assert.equal(sourceTime(null), null);
});
