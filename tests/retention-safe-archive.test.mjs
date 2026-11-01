import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { archiveBatchThenDelete, createDriveSession, deleteRowidsInChunks, D1_DELETE_CHUNK } from "../src/retention.js";

const driveEnv = {
  GOOGLE_OAUTH_CLIENT_ID: "client-id",
  GOOGLE_OAUTH_CLIENT_SECRET: "client-secret-SECRET",
  GOOGLE_DRIVE_OAUTH_REDIRECT_URI: "https://example.test/cb",
  GOOGLE_DRIVE_REFRESH_TOKEN: "refresh-token-SECRET",
  GOOGLE_DRIVE_FOLDER_ID: "folder-1"
};

function makeRows(n, start = 1) {
  return Array.from({ length: n }, (_, i) => ({ rowid: start + i, event_id: "e" + (start + i), created_at: 1000 + i, message: "m" }));
}

// D1 stand-in: records DELETE statements and enforces the 100-parameter limit.
function fakeDb() {
  const deletes = [];
  let batches = 0;
  return {
    deletes,
    get batchCount() { return batches; },
    prepare(sql) {
      return {
        bind(...args) {
          if (args.length > 100) throw new Error("D1_ERROR: too many SQL variables");
          return { sql, args, run: async () => ({ meta: { changes: args.length } }) };
        }
      };
    },
    async batch(statements) {
      batches++;
      return statements.map(stmt => {
        if (stmt.sql.startsWith("DELETE")) deletes.push(...stmt.args);
        return { meta: { changes: stmt.args.length } };
      });
    }
  };
}

// R2 stand-in whose etag is the MD5 of the stored bytes (as for single-part puts).
function fakeR2({ corruptHead = false } = {}) {
  const objects = new Map();
  return {
    objects,
    async put(key, body, options) {
      const bytes = Buffer.from(body instanceof ArrayBuffer ? new Uint8Array(body) : body);
      objects.set(key, { bytes, customMetadata: options?.customMetadata || {}, etag: createHash("md5").update(bytes).digest("hex") });
    },
    async head(key) {
      const o = objects.get(key);
      if (!o) return null;
      return { size: corruptHead ? o.bytes.length + 1 : o.bytes.length, etag: o.etag, customMetadata: o.customMetadata };
    },
    async get(key) {
      const o = objects.get(key);
      if (!o) return null;
      return { size: o.bytes.length, etag: o.etag, arrayBuffer: async () => o.bytes.buffer.slice(o.bytes.byteOffset, o.bytes.byteOffset + o.bytes.length) };
    }
  };
}

// Google OAuth/Drive stand-in. mode: "ok" | "upload-500" | "md5-mismatch" | "duplicate-ok"
function installDrive(mode, r2) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push(u);
    if (u.startsWith("https://oauth2.googleapis.com/token")) return Response.json({ access_token: "access-SECRET" });
    if (u.startsWith("https://www.googleapis.com/drive/v3/files?")) {
      if (mode === "duplicate-ok") {
        const [key, o] = [...r2.objects.entries()].at(-1);
        return Response.json({ files: [{ id: "dup-1", size: String(o.bytes.length), md5Checksum: o.etag, appProperties: { eagleeyeSourceKey: encodeURIComponent(key) } }] });
      }
      return Response.json({ files: [] });
    }
    if (u.startsWith("https://www.googleapis.com/upload/drive/v3/files")) {
      if (mode === "upload-500") return Response.json({ error: { message: "backend error" } }, { status: 500 });
      const o = [...r2.objects.values()].at(-1);
      return Response.json({ id: "file-1", size: String(o.bytes.length), md5Checksum: mode === "md5-mismatch" ? "0".repeat(32) : o.etag });
    }
    throw new Error("unexpected fetch " + u);
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test("deletes in chunks below the D1 100-parameter limit, in one atomic batch", async () => {
  const db = fakeDb();
  const rowids = Array.from({ length: 250 }, (_, i) => i + 1);
  const deleted = await deleteRowidsInChunks(db, "system_event_log", rowids);
  assert.equal(deleted, 250);
  assert.ok(D1_DELETE_CHUNK < 100);
  assert.equal(db.batchCount, 1);
  assert.deepEqual(db.deletes, rowids);
});

test("verified R2 + Drive copy: rows are deleted only after both checks", async () => {
  const db = fakeDb(); const r2 = fakeR2(); const drive = installDrive("ok", r2);
  try {
    const rows = makeRows(250);
    const result = await archiveBatchThenDelete(db, r2, createDriveSession(driveEnv), { table: "system_event_log", rows });
    assert.equal(result.status, "ARCHIVED");
    assert.equal(result.deleted, 250);
    assert.equal(result.md5Checked, true);
    assert.equal(r2.objects.size, 1);
    assert.deepEqual(db.deletes, rows.map(r => r.rowid));
    assert.ok(!JSON.stringify(result).includes("SECRET"));
  } finally { drive.restore(); }
});

test("Drive not configured: nothing is archived or deleted", async () => {
  const db = fakeDb(); const r2 = fakeR2();
  const result = await archiveBatchThenDelete(db, r2, createDriveSession({ ...driveEnv, GOOGLE_DRIVE_REFRESH_TOKEN: "" }), { table: "system_event_log", rows: makeRows(10) });
  assert.equal(result.status, "SKIPPED");
  assert.equal(result.reason, "GOOGLE_DRIVE_NOT_READY");
  assert.equal(db.deletes.length, 0);
  assert.equal(r2.objects.size, 0);
});

test("no R2 bucket: nothing is deleted (no unbacked deletes)", async () => {
  const db = fakeDb();
  const result = await archiveBatchThenDelete(db, null, createDriveSession(driveEnv), { table: "change_events", rows: makeRows(5) });
  assert.equal(result.status, "SKIPPED");
  assert.equal(db.deletes.length, 0);
});

test("Drive upload failure keeps the D1 rows", async () => {
  const db = fakeDb(); const r2 = fakeR2(); const drive = installDrive("upload-500", r2);
  try {
    const result = await archiveBatchThenDelete(db, r2, createDriveSession(driveEnv), { table: "system_event_log", rows: makeRows(20) });
    assert.equal(result.status, "FAILED");
    assert.equal(result.deleted, 0);
    assert.equal(db.deletes.length, 0);
    assert.equal(result.driveError.step, "UPLOAD");
    assert.equal(result.driveError.httpStatus, 500);
    assert.equal(result.driveError.message, "backend error");
    assert.ok(!JSON.stringify(result).includes("SECRET"));
  } finally { drive.restore(); }
});

test("Drive MD5 mismatch keeps the D1 rows", async () => {
  const db = fakeDb(); const r2 = fakeR2(); const drive = installDrive("md5-mismatch", r2);
  try {
    const result = await archiveBatchThenDelete(db, r2, createDriveSession(driveEnv), { table: "system_event_log", rows: makeRows(20) });
    assert.equal(result.status, "FAILED");
    assert.equal(db.deletes.length, 0);
  } finally { drive.restore(); }
});

test("R2 verification failure keeps the D1 rows and skips Drive", async () => {
  const db = fakeDb(); const r2 = fakeR2({ corruptHead: true }); const drive = installDrive("ok", r2);
  try {
    const result = await archiveBatchThenDelete(db, r2, createDriveSession(driveEnv), { table: "system_event_log", rows: makeRows(20) });
    assert.equal(result.reason, "R2_VERIFICATION_FAILED");
    assert.equal(db.deletes.length, 0);
    assert.ok(!drive.calls.some(u => u.includes("/upload/")), "must not upload an unverified R2 object");
  } finally { drive.restore(); }
});

test("retry after an earlier partial run reuses the verified Drive duplicate", async () => {
  const db = fakeDb(); const r2 = fakeR2();
  const rows = makeRows(30);
  // Simulate the R2 object already written by a previous attempt.
  const first = installDrive("upload-500", r2);
  try { await archiveBatchThenDelete(db, r2, createDriveSession(driveEnv), { table: "system_event_log", rows }); } finally { first.restore(); }
  assert.equal(db.deletes.length, 0);
  const second = installDrive("duplicate-ok", r2);
  try {
    const result = await archiveBatchThenDelete(db, r2, createDriveSession(driveEnv), { table: "system_event_log", rows });
    assert.equal(result.status, "ARCHIVED");
    assert.equal(result.driveDuplicate, true);
    assert.equal(db.deletes.length, 30);
  } finally { second.restore(); }
});

test("retention job is scheduled, bounded, and never deletes without a backup path", async () => {
  const index = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  const retention = await readFile(new URL("../src/retention.js", import.meta.url), "utf8");
  const scheduled = index.slice(index.indexOf("async scheduled(event, env, executionContext)"), index.indexOf("async queue(batch, env)"));
  assert.ok(scheduled.includes("await runDataRetentionJob(env);"), "retention must run from Cron");
  assert.ok(index.includes("batchSize: 500,\n      maxBatches: 2,"));
  assert.ok(index.includes("batchSize: 1000,\n      maxBatches: 3,"));
  assert.ok(!/DELETE FROM \$\{item\.table\}\s+WHERE rowid IN \(\s*SELECT/.test(retention), "no direct delete path without archive");
  assert.ok(retention.includes("SELECT COUNT(*) AS count FROM (SELECT 1 FROM system_event_log WHERE created_at < ? LIMIT 10001)"), "backlog count must be bounded");
  assert.ok(retention.includes('table: "diagnostic_events", column: "created_at", days: 30'));
});

test("Google Drive OAuth returns to the Drive callback, not the Discord login callback", async () => {
  const wrangler = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  const uris = [...wrangler.matchAll(/"GOOGLE_DRIVE_OAUTH_REDIRECT_URI":\s*"([^"]+)"/g)].map(m => m[1]);
  assert.ok(uris.length >= 2, "production and preview must both define the Drive redirect URI");
  for (const uri of uris) assert.ok(uri.endsWith("/api/admin/google-drive/callback"), uri);
  const index = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  assert.ok(index.includes('url.pathname === "/api/admin/google-drive/callback") return await handleGoogleDriveOAuthCallback(request, env);'));
});
