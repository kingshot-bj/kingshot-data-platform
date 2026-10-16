import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const exportHandlerStart = source.indexOf("var downloadButton=document.getElementById('downloadLatestProbe')");
const exportHandlerEnd = source.indexOf("async function manualProbe()", exportHandlerStart);
const exportHandler = source.slice(exportHandlerStart, exportHandlerEnd);

test("Probe JSON export includes complete diagnostic metadata and raw payload", () => {
  assert.ok(exportHandlerStart >= 0, "export button handler exists");
  assert.ok(exportHandlerEnd > exportHandlerStart, "export handler has a clear end");
  for (const field of [
    "request_id", "target_type", "request_started_at_iso", "player_activity",
    "payload_keys", "timestamp_like_fields", "response_sha256", "section_sha256",
    "diagnostic_payload", "field_dictionary", "raw_payload", "archive"
  ]) {
    assert.ok(exportHandler.includes(field), `export includes ${field}`);
  }
});

test("Probe JSON export supports iOS share sheets and a browser fallback", () => {
  assert.match(exportHandler, /navigator\.share&&navigator\.canShare/);
  assert.match(exportHandler, /navigator\.canShare\(\{files:\[file\]\}\)/);
  assert.match(exportHandler, /window\.open\(objectUrl,'_blank'\)/);
  assert.match(exportHandler, /document\.body\.appendChild\(link\)/);
  assert.match(exportHandler, /URL\.revokeObjectURL\(objectUrl\)/);
  assert.match(exportHandler, /書き出し失敗/);
  assert.doesNotMatch(exportHandler, /setTimeout\(function\(\)\{URL\.revokeObjectURL\(url\);\},1000\)/);
});
