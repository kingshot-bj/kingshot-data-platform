import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const index = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
const extract = name => {
  const start = index.indexOf("function " + name + "(");
  let depth = 0, i = index.indexOf("{", start);
  for (; i < index.length; i++) { if (index[i] === "{") depth++; else if (index[i] === "}" && --depth === 0) break; }
  return index.slice(start, i + 1);
};
const csvEscape = new Function(extract("csvEscape") + ";return csvEscape;")();
const escapeHtml = v => String(v);
const playerExportLinks = new Function("escapeHtml", extract("playerExportLinks") + ";return playerExportLinks;")(escapeHtml);

test("CSV cells cannot run as spreadsheet formulas", () => {
  assert.equal(csvEscape("=HYPERLINK(\"x\")"), "\"'=HYPERLINK(\"\"x\"\")\"");
  assert.equal(csvEscape("+cmd"), "\"'+cmd\"");
  assert.equal(csvEscape("@x"), "\"'@x\"");
  assert.equal(csvEscape("-5"), "\"-5\"", "plain negative numbers stay numbers");
  assert.equal(csvEscape(12345), "\"12345\"");
  assert.equal(csvEscape("にゃっぷ！"), "\"にゃっぷ！\"");
  assert.equal(csvEscape(null), "\"\"");
});

test("export buttons depend on role: VIP gets CSV, ADMIN gets CSV and the shared sheet", () => {
  const vip = playerExportLinks("123", "profile", "VIP");
  assert.ok(vip.includes("format=csv") && vip.includes("CSV出力") && !vip.includes("スプレッドシート出力"));
  const admin = playerExportLinks("123", "profile", "ADMIN");
  assert.ok(admin.includes("CSV出力") && admin.includes("スプレッドシート出力"));
  assert.equal(playerExportLinks("123", "profile", false), "");
});

test("CSV export is VIP+ while the shared Google Sheet stays ADMIN only", () => {
  const fn = index.slice(index.indexOf("async function handlePlayerSectionExport"), index.indexOf("async function renderPlayerPage"));
  assert.ok(fn.includes('const guard = wantsCsv ? await requireVipOrAbove(request, env) : await requireAdmin(request, env);'));
  assert.ok(fn.indexOf("return csvResponse(") < fn.indexOf("await exportToGoogleSheet("), "CSV returns before any Sheets call");
  assert.ok(fn.includes("filterPlayerForRole(player, guard.auth.role"), "CSV only contains what the role may see");
  const vip = extract("requireVipOrAbove");
  assert.ok(vip.includes('["VIP", "ADMIN", "OWNER"]'));
  assert.ok(index.includes('auth.role === "ADMIN" || auth.role === "OWNER" ? "ADMIN" : auth.role === "VIP" ? "VIP" : false'));
});
