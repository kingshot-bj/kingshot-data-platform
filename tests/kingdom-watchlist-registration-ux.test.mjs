import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
const telemetry = await readFile(new URL("../src/client-telemetry.js", import.meta.url), "utf8");

test("Kingdom Watchlist records empty and invalid kingdom IDs before stopping", () => {
  const start = source.indexOf('el("create").addEventListener("click"');
  const end = source.indexOf('setInterval(function(){', start);
  const handler = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(handler, /ACTION_BLOCKED","KINGDOM_WATCHLIST_CREATE","KINGDOM_ID_EMPTY"/);
  assert.match(handler, /ACTION_BLOCKED","KINGDOM_WATCHLIST_CREATE","KINGDOM_ID_INVALID"/);
  assert.match(handler, /ACTION_START","KINGDOM_WATCHLIST_CREATE","KINGDOM_ID_PRESENT"/);
});

test("Kingdom Watchlist shows busy state while registration request is in flight", () => {
  assert.match(source, /classList\.add\("is-registering"\)/);
  assert.match(source, /setAttribute\("aria-busy","true"\)/);
  assert.match(source, /王国番号を確認中：登録処理を開始しています/);
  assert.match(source, /classList\.remove\("is-registering"\)/);
});

test("client telemetry accepts safe action lifecycle events without collecting the kingdom ID", () => {
  assert.match(telemetry, /"ACTION_START", "ACTION_BLOCKED"/);
  assert.match(telemetry, /window\.__eeTrackAction=function/);
  assert.match(source, /KINGDOM_ID_EMPTY/);
  assert.doesNotMatch(telemetry, /inputState:.*kidInput\.value/);
});

test("Kingdom Watchlist hover motion is restricted to hover-capable fine pointers", () => {
  assert.ok(source.includes("@media (hover:hover) and (pointer:fine){button:hover{filter:brightness(1.04);transform:translateY(-1px)}}"));
  assert.ok(source.includes("button:active{filter:brightness(.96);transform:none}"));
});
