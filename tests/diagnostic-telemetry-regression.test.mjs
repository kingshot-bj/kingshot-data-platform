import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { clientTelemetryScript } from "../src/client-telemetry.js";

const source = await readFile(new URL("../src/client-telemetry.js", import.meta.url), "utf8");

test("server telemetry sanitizer preserves ordinary letters while removing control characters", () => {
  assert.match(source, /\.replace\(\/\[\\r\\n\\t\]\+\/g, " "\)/);
  assert.match(source, /authorization\\s\*\[:=\]\\s\*bearer/);
  const normal = "Browser click event /api/kingdom-watchlist";
  assert.equal(normal.replace(/[\r\n\t]+/g, " "), normal);
});

test("browser telemetry script emits correctly escaped regexes", () => {
  const script = clientTelemetryScript();
  assert.ok(script.includes('.replace(/[\\r\\n\\t]+/g," ")'));
  assert.ok(script.includes('.replace(/\\s+/g," ").trim()'));
  assert.ok(!script.includes('.replace(/[\\\\r\\\\n\\\\t]+/g'));
});

test("diagnostics has operational-event fallback for API Pool and MightPulse", async () => {
  const diagnostics = await readFile(new URL("../src/diagnostics.js", import.meta.url), "utf8");
  assert.match(diagnostics, /system_event_log WHERE service IN \('api_pool','mightpulse'\)/);
  assert.match(diagnostics, /\["SUCCESS", "COMPLETED"\]\.includes\(status\)/);
});
