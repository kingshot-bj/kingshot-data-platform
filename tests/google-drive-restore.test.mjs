import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { restoreR2ObjectFromGoogleDrive, restoreMissingR2ObjectsFromGoogleDrive, resetGoogleDriveFolderCache } from "../src/google-drive.js";

const env = { GOOGLE_OAUTH_CLIENT_ID: "id", GOOGLE_OAUTH_CLIENT_SECRET: "secret-SECRET", GOOGLE_DRIVE_OAUTH_REDIRECT_URI: "https://e.test/cb", GOOGLE_DRIVE_REFRESH_TOKEN: "refresh-SECRET", GOOGLE_DRIVE_FOLDER_ID: "folder" };
const md5 = b => createHash("md5").update(b).digest("hex");

function fakeR2(initial = {}) {
  const objects = new Map(Object.entries(initial).map(([k, v]) => [k, { bytes: Buffer.from(v), httpMetadata: {} }]));
  return {
    objects,
    async head(key) { const o = objects.get(key); return o ? { size: o.bytes.length, etag: md5(o.bytes) } : null; },
    async get(key) { const o = objects.get(key); return o ? { body: new Response(o.bytes).body } : null; },
    async put(key, body, options = {}) {
      const bytes = Buffer.from(typeof body === "string" ? body : new Uint8Array(body));
      if (options.md5 && options.md5 !== md5(bytes)) throw new Error("BadDigest");
      objects.set(key, { bytes, httpMetadata: options.httpMetadata || {} });
    }
  };
}

// Drive with archive files keyed by their R2 key; `corrupt` returns bytes that do not match md5Checksum.
function installDrive(files, { corrupt = new Set() } = {}) {
  const original = globalThis.fetch;
  const list = Object.entries(files).map(([key, content], i) => ({ id: "f" + i, name: key.split("/").pop(), size: String(Buffer.byteLength(content)), md5Checksum: md5(Buffer.from(content)), appProperties: { eagleeyeArchive: "1", eagleeyeSourceKey: encodeURIComponent(key) }, content, key }));
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.startsWith("https://oauth2.googleapis.com/token")) return Response.json({ access_token: "access-SECRET" });
    if (u.includes("?alt=media")) {
      const id = decodeURIComponent(u.split("/files/")[1].split("?")[0]);
      const f = list.find(x => x.id === id);
      return new Response(corrupt.has(f.key) ? f.content + "x" : f.content);
    }
    if (u.startsWith("https://www.googleapis.com/drive/v3/files/folder")) return Response.json({ id: "folder", mimeType: "application/vnd.google-apps.folder", trashed: false });
    if (u.startsWith("https://www.googleapis.com/drive/v3/files?")) {
      const q = new URL(u).searchParams.get("q");
      const m = /key = 'eagleeyeSourceKey' and value = '([^']+)'/.exec(q);
      const files = m ? list.filter(f => encodeURIComponent(f.key) === m[1]) : list;
      return Response.json({ files: files.map(({ content, key, ...f }) => f) });
    }
    throw new Error("unexpected fetch " + u);
  };
  return () => { globalThis.fetch = original; };
}

test.beforeEach(() => resetGoogleDriveFolderCache());

const KEY = "archive/v1/system_event_log/1/2/1/1000.ndjson.gz";
const KINGDOM_KEY = "archive/v1/kingdom_ranking_current/kid/77/1790000000.ndjson.gz";

test("restores a missing archive object from Drive with MD5 verification", async () => {
  const r2 = fakeR2();
  const restore = installDrive({ [KEY]: "gz-bytes" });
  try {
    const r = await restoreR2ObjectFromGoogleDrive(env, { archiveBucket: r2, key: KEY });
    assert.equal(r.status, "RESTORED");
    assert.equal(r2.objects.get(KEY).bytes.toString(), "gz-bytes");
    assert.equal(r2.objects.get(KEY).httpMetadata.contentEncoding, "gzip");
    assert.ok(!JSON.stringify(r).includes("SECRET"));
  } finally { restore(); }
});

test("never overwrites an existing R2 object and only restores archive keys", async () => {
  const r2 = fakeR2({ [KEY]: "original" });
  const restore = installDrive({ [KEY]: "drive-copy" });
  try {
    assert.equal((await restoreR2ObjectFromGoogleDrive(env, { archiveBucket: r2, key: KEY })).status, "ALREADY_IN_R2");
    assert.equal(r2.objects.get(KEY).bytes.toString(), "original");
    assert.equal((await restoreR2ObjectFromGoogleDrive(env, { archiveBucket: r2, key: "config/google-drive-archive-folder.json" })).status, "SKIPPED");
    assert.equal((await restoreR2ObjectFromGoogleDrive(env, { archiveBucket: r2, key: "archive/../x.ndjson.gz" })).status, "SKIPPED");
  } finally { restore(); }
});

test("corrupted download is rejected and nothing is written", async () => {
  const r2 = fakeR2();
  const restore = installDrive({ [KEY]: "gz-bytes" }, { corrupt: new Set([KEY]) });
  try {
    const r = await restoreR2ObjectFromGoogleDrive(env, { archiveBucket: r2, key: KEY });
    assert.equal(r.status, "FAILED");
    assert.ok(!r2.objects.has(KEY));
  } finally { restore(); }
});

test("scan restores only missing objects and recreates the kingdom pointer", async () => {
  const other = "archive/v1/api_observations/1/2/3/4.ndjson.gz";
  const r2 = fakeR2({ [other]: "already" });
  const restore = installDrive({ [KEY]: "a", [KINGDOM_KEY]: "b", [other]: "already" });
  try {
    const s = await restoreMissingR2ObjectsFromGoogleDrive(env, { archiveBucket: r2 });
    assert.deepEqual([s.checked, s.present, s.restored, s.failed], [3, 1, 2, 0]);
    const pointer = JSON.parse(r2.objects.get("archive/v1/kingdom_ranking_current/kid/77/latest.json").bytes.toString());
    assert.deepEqual([pointer.kid, pointer.key, pointer.lastUpdatedAt, pointer.restoredFromDrive], [77, KINGDOM_KEY, 1790000000, true]);
  } finally { restore(); }
});

test("scan caps restores per request and asks to repeat the page", async () => {
  const files = {};
  for (let i = 0; i < 4; i++) files[`archive/v1/t/${i}.ndjson.gz`] = "x" + i;
  const r2 = fakeR2();
  const restore = installDrive(files);
  try {
    const first = await restoreMissingR2ObjectsFromGoogleDrive(env, { archiveBucket: r2, maxRestores: 3 });
    assert.equal(first.restored, 3);
    assert.equal(first.repeatPage, true);
    const second = await restoreMissingR2ObjectsFromGoogleDrive(env, { archiveBucket: r2, maxRestores: 3 });
    assert.deepEqual([second.restored, second.present, second.repeatPage], [1, 3, false]);
  } finally { restore(); }
});

test("restore API is OWNER only and wired to the settings page", async () => {
  const index = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  assert.ok(index.includes('if (url.pathname === "/api/owner/google-drive/restore") return await handleGoogleDriveRestoreApi(request, env);'));
  const fn = index.slice(index.indexOf("async function handleGoogleDriveRestoreApi"), index.indexOf("async function handleGoogleDriveVerifyApi"));
  assert.ok(fn.includes("await requireOwner(request, env)") && fn.includes('request.method !== "POST"'));
  assert.ok(index.includes("照合して足りないものを復元"));
});
