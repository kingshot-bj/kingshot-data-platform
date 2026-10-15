import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
const page = await readFile(new URL("../src/kingdom-watchlist-page.js", import.meta.url), "utf8");
const telemetry = await readFile(new URL("../src/client-telemetry.js", import.meta.url), "utf8");

test("Kingdom Watchlist route delegates to the isolated replacement page after authentication", () => {
  assert.match(source, /import \{ renderKingdomWatchlistPageReplacement \} from "\.\/kingdom-watchlist-page\.js"/);
  assert.match(source, /async function renderKingdomWatchlistPage\(request, env\)/);
  assert.match(source, /return renderKingdomWatchlistPageReplacement\(\)/);
  assert.match(source, /auth\.status !== "ACTIVE"/);
});

test("replacement page uses one native submit path and prevents duplicate submissions", () => {
  assert.match(page, /<form id="create-form" novalidate>/);
  assert.match(page, /form\.addEventListener\("submit",async function\(event\)/);
  assert.match(page, /event\.preventDefault\(\)/);
  assert.match(page, /if\(busyCreate\)return/);
  assert.match(page, /createButton\.disabled=true/);
  assert.match(page, /createButton\.removeAttribute\("aria-busy"\)/);
  assert.doesNotMatch(page, /addEventListener\("(?:click|pointerup|touchend)",[^\n]*create/);
});

test("registration, list refresh and initial refresh are separately observable", () => {
  for (const stage of ["CREATE_START", "CREATE_SUCCESS", "CREATE_FAILED", "LIST_START", "LIST_SUCCESS", "LIST_FAILED", "INITIAL_REFRESH_START", "INITIAL_REFRESH_COMPLETE", "INITIAL_REFRESH_JOB_FAILED"]) {
    assert.ok(page.includes(stage), "missing diagnostic stage: " + stage);
  }
  assert.match(page, /trace_id/);
  assert.match(page, /http_status/);
  assert.match(page, /error_code/);
});

test("list failures do not disable registration and can be retried", () => {
  assert.match(page, /一覧を読み込めませんでした。登録フォームは引き続き使用できます。/);
  assert.match(page, /id="retry-list"/);
  assert.match(page, /loadList\(\)\.catch/);
});

test("replacement preserves refresh, toggle, delete and ranking job progress actions", () => {
  for (const action of ['data-action="refresh"', 'data-action="toggle"', 'data-action="delete"', 'ranking_rows', 'last_error']) {
    assert.ok(page.includes(action), "missing functionality: " + action);
  }
});

test("telemetry does not collect the entered kingdom ID", () => {
  assert.match(telemetry, /window\.__eeTrackAction=function/);
  assert.doesNotMatch(page, /__eeTrackAction\([^\n]*kid/);
  assert.doesNotMatch(page, /inputState:.*kid\.value/);
});
