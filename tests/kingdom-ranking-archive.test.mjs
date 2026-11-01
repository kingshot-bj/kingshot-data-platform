import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createDriveSession } from "../src/retention.js";
import { resetGoogleDriveFolderCache } from "../src/google-drive.js";
import {
  archiveStaleKingdomRankings,
  withArchivedRankings,
  restoreArchivedKingdomRankingsIfMissing,
  resetKingdomRankingArchiveCache,
  kingdomRankingArchivePointerKey
} from "../src/kingdom-ranking-archive.js";

const NOW = 1793500000;
const DAY = 86400;
const driveEnv = {
  GOOGLE_OAUTH_CLIENT_ID: "id", GOOGLE_OAUTH_CLIENT_SECRET: "secret-SECRET",
  GOOGLE_DRIVE_OAUTH_REDIRECT_URI: "https://example.test/cb", GOOGLE_DRIVE_REFRESH_TOKEN: "refresh-SECRET",
  GOOGLE_DRIVE_FOLDER_ID: "folder"
};

function rankingRows(kid, updatedAt, startRowid) {
  const rows = [];
  let rowid = startRowid;
  for (const board of ["personal_power", "alliance_power", "single_hero"]) {
    for (let rank = 1; rank <= 40; rank++) {
      const alliance = board === "alliance_power";
      rows.push({
        rowid: rowid++, kid, board, target_type: alliance ? "ALLIANCE" : "PLAYER",
        target_id: alliance ? "A" + rank : String(9000 + rank), rank, previous_rank: null, score: 1000 - rank,
        uid: null, governor_id: alliance ? null : String(9000 + rank), nick_name: alliance ? null : "P" + rank,
        aid: alliance ? "A" + rank : null, abbr: alliance ? "T" + rank : null, name: alliance ? "Alliance " + rank : null,
        observed_at: updatedAt, source_observed_at: null, source_observation_id: null, updated_at: updatedAt
      });
    }
  }
  return rows;
}

// In-memory D1 covering the statements used by the archive module.
function fakeDb(rows, { followed = [] } = {}) {
  const state = { rows, deleteBatches: 0, inserted: 0, log: [] };
  const run = (sql, args) => {
    state.log.push(sql);
    if (sql.includes("FROM kingdom_watchlists")) return { results: followed.map(kid => ({ kid })) };
    if (sql.startsWith("SELECT kid FROM kingdom_ranking_current WHERE kid > ?")) {
      const next = state.rows.map(r => r.kid).filter(k => k > args[0]).sort((a, b) => a - b)[0];
      return next === undefined ? null : { kid: next };
    }
    if (sql.startsWith("SELECT MAX(updated_at)")) {
      const list = state.rows.filter(r => r.kid === args[0]);
      return { last_updated_at: Math.max(...list.map(r => r.updated_at)) };
    }
    if (sql.startsWith("SELECT rowid, * FROM kingdom_ranking_current WHERE kid = ?")) return { results: state.rows.filter(r => r.kid === args[0]) };
    if (sql.startsWith("SELECT 1 AS present")) return state.rows.some(r => r.kid === args[0]) ? { present: 1 } : null;
    throw new Error("unexpected SQL " + sql);
  };
  return {
    state,
    prepare(sql) {
      return {
        first: async () => run(sql, []),
        all: async () => run(sql, []),
        bind(...args) {
          if (args.length > 100) throw new Error("D1_ERROR: too many SQL variables");
          return { sql, args, first: async () => run(sql, args), all: async () => run(sql, args) };
        }
      };
    },
    async batch(statements) {
      for (const stmt of statements) {
        if (stmt.sql.startsWith("DELETE FROM kingdom_ranking_current")) {
          const ids = new Set(stmt.args);
          state.rows = state.rows.filter(r => !ids.has(r.rowid));
        } else if (stmt.sql.startsWith("INSERT OR IGNORE INTO kingdom_ranking_current")) {
          state.inserted++;
        } else throw new Error("unexpected batch SQL " + stmt.sql);
      }
      if (statements[0]?.sql.startsWith("DELETE")) state.deleteBatches++;
      return statements.map(s => ({ meta: { changes: s.args.length } }));
    }
  };
}

function fakeR2() {
  const objects = new Map();
  const toStream = bytes => new Response(bytes).body;
  return {
    objects,
    putOrder: [],
    async put(key, body, options = {}) {
      const bytes = typeof body === "string" ? Buffer.from(body) : Buffer.from(new Uint8Array(body));
      objects.set(key, { bytes, httpMetadata: options.httpMetadata || {}, customMetadata: options.customMetadata || {}, etag: createHash("md5").update(bytes).digest("hex") });
      this.putOrder.push(key);
    },
    async head(key) { const o = objects.get(key); return o ? { size: o.bytes.length, etag: o.etag, customMetadata: o.customMetadata } : null; },
    async get(key) {
      const o = objects.get(key);
      if (!o) return null;
      return { size: o.bytes.length, etag: o.etag, httpMetadata: o.httpMetadata, body: toStream(o.bytes), arrayBuffer: async () => o.bytes.buffer.slice(o.bytes.byteOffset, o.bytes.byteOffset + o.bytes.length) };
    }
  };
}

function installDrive(r2, { fail = false } = {}) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.startsWith("https://oauth2.googleapis.com/token")) return Response.json({ access_token: "access-SECRET" });
    if (u.startsWith("https://www.googleapis.com/drive/v3/files/")) return Response.json({ id: "folder", mimeType: "application/vnd.google-apps.folder", trashed: false });
    if (u.startsWith("https://www.googleapis.com/drive/v3/files?")) return Response.json({ files: [] });
    if (u.startsWith("https://www.googleapis.com/upload/drive/v3/files")) {
      if (fail) return Response.json({ error: { message: "quota" } }, { status: 403 });
      const last = [...r2.objects.entries()].filter(([k]) => k.endsWith(".ndjson.gz")).at(-1)[1];
      return Response.json({ id: "drive-file", size: String(last.bytes.length), md5Checksum: last.etag });
    }
    throw new Error("unexpected fetch " + u);
  };
  return () => { globalThis.fetch = original; };
}

test.beforeEach(() => { resetKingdomRankingArchiveCache(); resetGoogleDriveFolderCache(); });

test("archives only stale, unfollowed kingdoms and writes the pointer before deleting", async () => {
  const rows = [
    ...rankingRows(100, NOW - 20 * DAY, 1),      // stale, unfollowed -> archive
    ...rankingRows(200, NOW - 20 * DAY, 1000),   // stale but followed -> keep
    ...rankingRows(300, NOW - 2 * DAY, 2000)     // fresh -> keep
  ];
  const db = fakeDb(rows, { followed: [200] });
  const r2 = fakeR2();
  const restore = installDrive(r2);
  try {
    const env = { DB: db, ARCHIVE: r2 };
    const result = await archiveStaleKingdomRankings(env, createDriveSession(driveEnv), { now: NOW });
    assert.equal(result.archivedKingdoms, 1);
    assert.equal(result.deletedRows, 120);
    assert.deepEqual([...new Set(db.state.rows.map(r => r.kid))].sort(), [200, 300]);
    const pointerKey = kingdomRankingArchivePointerKey(100);
    const pointer = JSON.parse(r2.objects.get(pointerKey).bytes.toString());
    assert.equal(pointer.rowCount, 120);
    assert.equal(pointer.lastUpdatedAt, NOW - 20 * DAY);
    assert.ok(r2.objects.has(pointer.key));
    assert.ok(r2.putOrder.indexOf(pointerKey) > r2.putOrder.indexOf(pointer.key), "pointer after data object");
    assert.ok(db.state.log.every(sql => !sql.includes("GROUP BY")), "must not scan the whole table");
    assert.ok(!JSON.stringify(result).includes("SECRET"));
  } finally { restore(); }
});

test("Drive failure keeps the kingdom rows and writes no pointer", async () => {
  const db = fakeDb(rankingRows(100, NOW - 20 * DAY, 1));
  const r2 = fakeR2();
  const restore = installDrive(r2, { fail: true });
  try {
    const result = await archiveStaleKingdomRankings({ DB: db, ARCHIVE: r2 }, createDriveSession(driveEnv), { now: NOW });
    assert.equal(result.archivedKingdoms, 0);
    assert.equal(db.state.rows.length, 120);
    assert.ok(!r2.objects.has(kingdomRankingArchivePointerKey(100)));
  } finally { restore(); }
});

test("pages fall back to the R2 archive with the same filtering and a date", async () => {
  const db = fakeDb(rankingRows(100, NOW - 20 * DAY, 1));
  const r2 = fakeR2();
  const restore = installDrive(r2);
  try {
    const env = { DB: db, ARCHIVE: r2 };
    await archiveStaleKingdomRankings(env, createDriveSession(driveEnv), { now: NOW });
    const top = await withArchivedRankings(env, 100, { results: [] }, { filter: r => r.board === "personal_power" && r.target_type === "PLAYER", limit: 10 });
    assert.equal(top.results.length, 10);
    assert.deepEqual(top.results.map(r => r.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.ok(top.results.every(r => r.rowid === undefined && r._source_table === undefined));
    assert.equal(top.archived.lastUpdatedAt, NOW - 20 * DAY);
    const live = await withArchivedRankings(env, 100, { results: [{ rank: 1 }] });
    assert.equal(live.archived, null, "D1 rows win over the archive");
    const none = await withArchivedRankings(env, 999, { results: [] });
    assert.deepEqual(none, { results: [], archived: null });
  } finally { restore(); }
});

test("re-followed kingdom gets its archived rows restored before the first fetch", async () => {
  const db = fakeDb(rankingRows(100, NOW - 20 * DAY, 1));
  const r2 = fakeR2();
  const restore = installDrive(r2);
  try {
    const env = { DB: db, ARCHIVE: r2 };
    await archiveStaleKingdomRankings(env, createDriveSession(driveEnv), { now: NOW });
    const restored = await restoreArchivedKingdomRankingsIfMissing(env, 100);
    assert.equal(restored.restored, 120);
    assert.equal(db.state.inserted, 120);
  } finally { restore(); }
});

test("archive job is wired into Cron, restore into new watchlist jobs, and pages use the fallback", async () => {
  const index = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  const portal = await readFile(new URL("../src/kingdom-portal.js", import.meta.url), "utf8");
  assert.ok(index.includes("await archiveStaleKingdomRankings(env, drive, { maxKingdoms: 3, maxChecks: 10, now });"));
  assert.ok(index.includes("await restoreArchivedKingdomRankingsIfMissing(env, row.kid);"));
  assert.ok(index.includes("async function getLatestPlayerHeroRankings(env, kid, governorId)"));
  assert.ok((portal.match(/withArchivedRankings\(env, kid/g) || []).length >= 7);
  assert.ok(portal.includes("時点のデータ（アーカイブ）です"));
});
