// 2026-11-14：/owner/users の監査ログで、空白のない長い JSON（details_json）が折り返さず、スマホでページ全体が横に広がっていた。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const css = JSON.parse(src.match(/^const OWNER_PAGE_CSS = (".*");$/m)[1]);
const rule = sel => (css.match(new RegExp("(^|})" + sel.replace(/[.]/g, "\\.") + "\\{([^}]*)\\}")) || [])[2] || "";

test("監査ログ：長い文字列も折り返す（横にはみ出さない）", () => {
  assert.match(rule(".audit"), /grid-template-columns:minmax\(0,1fr\)/, "グリッドの列が中身の幅で広がらない");
  const item = rule(".audit-item");
  assert.match(item, /min-width:0/);
  assert.match(item, /overflow-wrap:anywhere/);
});
