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

test("Probe JSON export shares a real JSON file on iOS and falls back to a file download", () => {
  for (const snippet of [
    "p.raw_payload===undefined||p.raw_payload===null",
    "raw_payload:p.raw_payload",
    "JSON.parse(data)",
    "data.length<100",
    "new File([blob],fileName",
    "navigator.canShare({files:[file]})",
    "navigator.share({files:[file],title:fileName})",
    "document.body.appendChild(link)",
    "URL.revokeObjectURL(objectUrl)",
    "書き出し失敗"
  ]) {
    assert.ok(exportHandler.includes(snippet), `export handler includes ${snippet}`);
  }
  assert.ok(!exportHandler.includes("window.open(objectUrl,'_blank')"), "does not open JSON as a browser tab");
});
