import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { exportToGoogleSheet, googleSheetsTransport } from "../src/google-sheets.js";

const driveEnv = { GOOGLE_OAUTH_CLIENT_ID: "id", GOOGLE_OAUTH_CLIENT_SECRET: "s-SECRET", GOOGLE_DRIVE_OAUTH_REDIRECT_URI: "https://e.test/cb", GOOGLE_DRIVE_REFRESH_TOKEN: "r-SECRET" };

function fakeR2() {
  const objects = new Map();
  return { objects, async get(k) { return objects.has(k) ? { body: new Response(objects.get(k)).body } : null; }, async put(k, v) { objects.set(k, String(v)); } };
}

function installGoogle() {
  const original = globalThis.fetch;
  const calls = [];
  const sheets = new Map(); // spreadsheetId -> {tabs: Map(title -> rows)}
  let created = 0;
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url), method = options.method || "GET";
    calls.push(method + " " + u.replace("https://sheets.googleapis.com/v4/spreadsheets", ""));
    if (u.startsWith("https://oauth2.googleapis.com/token")) return Response.json({ access_token: "access-SECRET" });
    assert.equal(new Headers(options.headers).get("authorization"), "Bearer access-SECRET");
    const path = u.replace("https://sheets.googleapis.com/v4/spreadsheets", "");
    if (path === "" && method === "POST") { const id = "sheet" + (++created); sheets.set(id, new Map()); return Response.json({ spreadsheetId: id }); }
    const id = decodeURIComponent(path.split(/[/?:]/)[1]);
    const book = sheets.get(id);
    if (path.includes("?fields=sheets")) return Response.json({ sheets: [...book.keys()].map((title, i) => ({ properties: { sheetId: i, title } })) });
    if (path.endsWith(":batchUpdate")) { const title = JSON.parse(options.body).requests[0].addSheet.properties.title; book.set(title, []); return Response.json({ replies: [{ addSheet: { properties: { sheetId: 9, title } } }] }); }
    if (path.includes(":append")) { const title = decodeURIComponent(path.split("/values/")[1].split("!")[0]); const vals = JSON.parse(options.body).values; book.get(title).push(...vals); return Response.json({ updates: { updatedRows: vals.length, updatedCells: vals.flat().length } }); }
    if (path.includes("/values/")) { const title = decodeURIComponent(path.split("/values/")[1].split("!")[0]); return Response.json({ values: (book.get(title) || []).slice(0, 1) }); }
    throw new Error("unexpected " + method + " " + u);
  };
  return { calls, sheets, restore: () => { globalThis.fetch = original; } };
}

test("transport selection prefers explicit setups and falls back to the Drive connection", () => {
  assert.equal(googleSheetsTransport({}), null);
  assert.equal(googleSheetsTransport(driveEnv), "drive-oauth");
  assert.equal(googleSheetsTransport({ ...driveEnv, GOOGLE_SERVICE_ACCOUNT_EMAIL: "a", GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "k", GOOGLE_SHEETS_SPREADSHEET_ID: "x" }), "service-account");
  assert.equal(googleSheetsTransport({ ...driveEnv, GOOGLE_SHEETS_WEBAPP_URL: "u", GOOGLE_SHEETS_WEBAPP_SECRET: "s", GOOGLE_SHEETS_SPREADSHEET_ID: "x" }), "apps-script-webapp");
});

test("Drive connection creates the EagleEye Export spreadsheet once and reuses it", async () => {
  const g = installGoogle();
  try {
    const env = { ...driveEnv, ARCHIVE: fakeR2() };
    const first = await exportToGoogleSheet(env, { sheetTitle: "プロフィール", headers: ["領主ID", "名前"], rows: [{ "領主ID": "1", "名前": "A" }] });
    assert.equal(first.transport, "drive-oauth");
    assert.equal(first.spreadsheetId, "sheet1");
    assert.ok(first.url.endsWith("/sheet1/edit"));
    const second = await exportToGoogleSheet(env, { sheetTitle: "プロフィール", headers: ["領主ID", "名前"], rows: [{ "領主ID": "2", "名前": "B" }] });
    assert.equal(second.spreadsheetId, "sheet1", "spreadsheet remembered in R2");
    assert.deepEqual(g.sheets.get("sheet1").get("プロフィール"), [["領主ID", "名前"], ["1", "A"], ["2", "B"]], "header written once");
    assert.equal(g.calls.filter(c => c === "POST ").length, 1, "created only once");
    assert.ok(!JSON.stringify(first).includes("SECRET"));
  } finally { g.restore(); }
});

test("status page and diagnostics use the shared transport detection", async () => {
  const index = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  assert.ok(index.includes('const transport = googleSheetsTransport(env);'));
  assert.ok(index.includes('["Google Sheets 出力", sheetsTransportLabels[googleSheetsTransport(env)]'));
  assert.ok(!index.includes('["Google Sheets Service Account"'));
});
