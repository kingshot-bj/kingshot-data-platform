import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { clientTelemetryScript, handleClientTelemetry } from "../src/client-telemetry.js";
import { getSystemEventLog } from "../src/system-log.js";

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

test("diagnostic JSON includes bounded kingdom watchlist System Log events", async () => {
  const diagnostics = await readFile(new URL("../src/diagnostics.js", import.meta.url), "utf8");
  assert.match(diagnostics, /const systemEventsResult = await db\.prepare\(/);
  assert.match(diagnostics, /service = 'watchlist' AND feature = 'kingdom_watchlist'/);
  assert.match(diagnostics, /systemEvents\s*\n\s*\};/);
});

test("watchlist Cron summary is persisted for the diagnostic JSON", async () => {
  const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(source, /eventType: "SCHEDULER_RUN"/);
  assert.match(source, /operation: "WATCHLIST_CRON"/);
  assert.match(source, /jobsAttempted,/);
  assert.match(source, /capacityWaits,/);
});


function telemetryRequest(events) {
  return new Request("https://eagleeye.example/api/client-telemetry", {
    method: "POST",
    headers: { "content-type": "application/json", "origin": "https://eagleeye.example" },
    body: JSON.stringify({ events })
  });
}

function telemetryDb({ fail = false } = {}) {
  return {
    prepare() {
      return {
        bind() {
          return {
            async run() {
              if (fail) throw new Error("simulated D1 write failure");
              return { success: true, meta: { changes: 1 } };
            }
          };
        }
      };
    }
  };
}

test("client telemetry returns 503 when persistence fails instead of claiming acceptance", async () => {
  const response = await handleClientTelemetry(telemetryRequest([
    { eventId: "evt-fail-1", type: "CLICK", operation: "test button", page: "/test" }
  ]), { DB: telemetryDb({ fail: true }) });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, accepted: 0, failed: 1 });
});

test("client telemetry reports successfully persisted events as accepted", async () => {
  const response = await handleClientTelemetry(telemetryRequest([
    { eventId: "evt-ok-1", type: "CLICK", operation: "test button", page: "/test" }
  ]), { DB: telemetryDb() });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, accepted: 1, failed: 0 });
});

test("browser telemetry retries failed batches and reuses event IDs", () => {
  const script = clientTelemetryScript();
  assert.match(script, /if\(!e\.eventId\)e\.eventId=/);
  assert.match(script, /queue=events\.concat\(queue\)\.slice\(-100\)/);
  assert.match(script, /TELEMETRY_HTTP_/);
  assert.doesNotMatch(script, /navigator\.sendBeacon/);
});


test("system log browser filters use exact SQL predicates and bind values in order", async () => {
  let capturedSql = "";
  let capturedBinds = [];
  const db = {
    prepare(sql) {
      capturedSql = sql;
      return { bind(...values) { capturedBinds = values; return { async all() { return { results: [] }; } }; } };
    }
  };
  await getSystemEventLog(db, {
    limit: 20,
    since: 100,
    until: 200,
    service: "browser",
    feature: "client_telemetry",
    eventType: "CLICK"
  });
  assert.match(capturedSql, /created_at>=\?/);
  assert.match(capturedSql, /created_at<=\?/);
  assert.match(capturedSql, /service=\?/);
  assert.match(capturedSql, /feature=\?/);
  assert.match(capturedSql, /event_type=\?/);
  assert.deepEqual(capturedBinds, [100, 200, "browser", "client_telemetry", "CLICK", 20]);
});

test("system log filters remain optional for existing callers", async () => {
  let capturedSql = "";
  let capturedBinds = [];
  const db = {
    prepare(sql) {
      capturedSql = sql;
      return { bind(...values) { capturedBinds = values; return { async all() { return { results: [] }; } }; } };
    }
  };
  await getSystemEventLog(db, { limit: 5 });
  assert.doesNotMatch(capturedSql, /service=\?|feature=\?|event_type=\?/);
  assert.deepEqual(capturedBinds, [5]);
});
