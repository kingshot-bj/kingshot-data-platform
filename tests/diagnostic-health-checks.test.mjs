import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const index = await readFile(new URL("../src/index.js", import.meta.url), "utf8");

test("health probes run from Cron (at most every 10 minutes) so services are not 未確認", () => {
  const scheduled = index.slice(index.indexOf("async scheduled(event, env, executionContext)"));
  assert.ok(scheduled.includes("'DIAG_HEALTH_CHECK'") && scheduled.includes("await runDiagnosticHealthChecks(env);"));
  assert.ok(scheduled.includes("nowSec + 600"));
});

test("health probes use indexed per-service lookups, not a full-table GROUP BY", () => {
  const fn = index.slice(index.indexOf("async function runDiagnosticHealthChecks"), index.indexOf("async function", index.indexOf("async function runDiagnosticHealthChecks") + 10));
  assert.ok(!fn.includes("GROUP BY service"));
  assert.ok(fn.includes('SELECT MAX(created_at) AS created_at FROM diagnostic_events WHERE service = ?'));
  assert.ok(fn.includes('if (due("notifications"))'), "notification system is probed too");
});

test("a ranking save without a MightPulse source time is not reported as a warning", () => {
  assert.ok(!index.includes('status: sourceObservedAt ? "SUCCESS" : "WARNING"'));
  assert.ok(index.includes("sourceTimeMissing: !sourceObservedAt"));
});
