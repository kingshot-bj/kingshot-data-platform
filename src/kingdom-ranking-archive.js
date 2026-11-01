// Archive of stale per-kingdom rankings (kingdom_ranking_current).
//
// Kingdoms nobody follows keep a one-off snapshot of 26 boards x 100 rows in
// D1. Once such a kingdom has not been updated for STALE_DAYS and is not
// followed (kingdom watchlist, a user's registered kingdom, or the kingdom of
// a watched player), its rows are written to R2, verified, mirrored to Google
// Drive and verified, and only then deleted from D1 (archiveBatchThenDelete).
// Pages read the R2 copy when D1 has no rows for that kingdom; Drive is a
// cold backup only and is never read for serving.

import { archiveBatchThenDelete } from "./retention.js";

export const KINGDOM_RANKING_ARCHIVE_STALE_DAYS = 14;
const ARCHIVE_PREFIX = "archive/v1/kingdom_ranking_current/kid/";
const READ_CACHE_TTL_MS = 10 * 60 * 1000;
const READ_CACHE_MAX = 64;
const readCache = new Map();

export function kingdomRankingArchiveKey(kid, lastUpdatedAt) {
  return `${ARCHIVE_PREFIX}${Number(kid)}/${Number(lastUpdatedAt) || 0}.ndjson.gz`;
}

export function kingdomRankingArchivePointerKey(kid) {
  return `${ARCHIVE_PREFIX}${Number(kid)}/latest.json`;
}

export function resetKingdomRankingArchiveCache() {
  readCache.clear();
}

async function readBodyText(object) {
  let body = object.body;
  if (String(object.httpMetadata?.contentEncoding || "").toLowerCase() === "gzip" && typeof DecompressionStream !== "undefined") {
    body = body.pipeThrough(new DecompressionStream("gzip"));
  }
  return new Response(body).text();
}

// Returns { rows, archivedAt, lastUpdatedAt, key } or null when the kingdom
// has no archive. Results (including "no archive") are cached per isolate.
export async function loadArchivedKingdomRankings(bucket, kid) {
  const id = Number(kid);
  if (!bucket || !Number.isInteger(id) || id < 1) return null;
  const cached = readCache.get(id);
  if (cached && Date.now() - cached.at < READ_CACHE_TTL_MS) return cached.value;

  let value = null;
  const pointerObject = await bucket.get(kingdomRankingArchivePointerKey(id));
  if (pointerObject) {
    const pointer = JSON.parse(await new Response(pointerObject.body).text());
    const object = pointer?.key ? await bucket.get(pointer.key) : null;
    if (object) {
      const text = await readBodyText(object);
      const rows = text.split("\n").filter(Boolean).map(line => {
        const { _eagleeye_archive_version, _source_table, rowid, ...row } = JSON.parse(line);
        return row;
      });
      value = {
        rows,
        key: pointer.key,
        archivedAt: Number(pointer.archivedAt) || null,
        lastUpdatedAt: Number(pointer.lastUpdatedAt) || null
      };
    }
  }

  if (readCache.size >= READ_CACHE_MAX) readCache.delete(readCache.keys().next().value);
  readCache.set(id, { at: Date.now(), value });
  return value;
}

// Use D1 rows when present; otherwise fall back to the R2 archive, filtered
// and sorted like the original query. `archived` is non-null only when the
// archive was used, so pages can label the data with its date.
export async function withArchivedRankings(env, kid, d1Result, { filter = null, limit = null } = {}) {
  const results = d1Result?.results || [];
  if (results.length) return { results, archived: null };
  let archive = null;
  try {
    archive = await loadArchivedKingdomRankings(env?.ARCHIVE, kid);
  } catch (error) {
    console.error("kingdom_ranking_archive_read_failed", Number(kid), error?.message || error);
  }
  if (!archive) return { results, archived: null };
  let rows = filter ? archive.rows.filter(filter) : archive.rows.slice();
  rows.sort((a, b) => String(a.board).localeCompare(String(b.board)) || Number(a.rank) - Number(b.rank));
  if (limit) rows = rows.slice(0, limit);
  return { results: rows, archived: { archivedAt: archive.archivedAt, lastUpdatedAt: archive.lastUpdatedAt } };
}

export function formatArchiveDate(unixSeconds) {
  const n = Number(unixSeconds);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return new Date(n * 1000).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric" });
}

async function getFollowedKingdomIds(db) {
  const result = await db.prepare(
    `SELECT kid FROM kingdom_watchlists WHERE enabled = 1
     UNION SELECT kingdom_id AS kid FROM user_player_links WHERE status = 'ACTIVE' AND kingdom_id IS NOT NULL
     UNION SELECT p.kid AS kid FROM player_watchlists w INNER JOIN players p ON p.governor_id = w.governor_id WHERE w.enabled = 1 AND p.kid IS NOT NULL`
  ).all();
  return new Set((result.results || []).map(row => Number(row.kid)).filter(Number.isFinite));
}

/**
 * Archive up to `maxKingdoms` stale, unfollowed kingdoms per run. Uses the
 * (kid, board, ...) primary key to walk kingdoms in order, so each step reads
 * only one kingdom's rows. Stops early when the backup path is unavailable.
 */
export async function archiveStaleKingdomRankings(env, drive, {
  maxKingdoms = 3,
  maxChecks = 10,
  staleDays = KINGDOM_RANKING_ARCHIVE_STALE_DAYS,
  now = Math.floor(Date.now() / 1000)
} = {}) {
  const db = env?.DB;
  const summary = { checked: 0, archivedKingdoms: 0, deletedRows: 0, batches: [] };
  if (!db || !env?.ARCHIVE) return { ...summary, skipped: true, reason: "R2_ARCHIVE_NOT_CONFIGURED" };

  const followed = await getFollowedKingdomIds(db);
  const staleBefore = now - Math.max(1, Number(staleDays) || KINGDOM_RANKING_ARCHIVE_STALE_DAYS) * 86400;
  let cursor = 0;

  while (summary.checked < maxChecks && summary.archivedKingdoms < maxKingdoms) {
    const next = await db.prepare(
      "SELECT kid FROM kingdom_ranking_current WHERE kid > ? ORDER BY kid LIMIT 1"
    ).bind(cursor).first();
    if (!next) break;
    const kid = Number(next.kid);
    cursor = kid;
    if (followed.has(kid)) continue;
    summary.checked++;

    const state = await db.prepare(
      "SELECT MAX(updated_at) AS last_updated_at FROM kingdom_ranking_current WHERE kid = ?"
    ).bind(kid).first();
    const lastUpdatedAt = Number(state?.last_updated_at || 0);
    if (lastUpdatedAt >= staleBefore) continue;

    const rows = (await db.prepare(
      "SELECT rowid, * FROM kingdom_ranking_current WHERE kid = ? ORDER BY board, rank"
    ).bind(kid).all()).results || [];
    if (!rows.length) continue;

    const key = kingdomRankingArchiveKey(kid, lastUpdatedAt);
    const result = await archiveBatchThenDelete(db, env.ARCHIVE, drive, {
      table: "kingdom_ranking_current",
      rows,
      key,
      // The pointer must exist before D1 rows disappear, so pages never lose data.
      beforeDelete: async ({ driveFileId }) => {
        await env.ARCHIVE.put(kingdomRankingArchivePointerKey(kid), JSON.stringify({
          kid,
          key,
          rowCount: rows.length,
          lastUpdatedAt,
          archivedAt: now,
          driveFileId: driveFileId || null
        }), { httpMetadata: { contentType: "application/json", cacheControl: "private, no-store" } });
        readCache.delete(kid);
      }
    });
    summary.batches.push({ kid, ...result });
    if (result.status !== "ARCHIVED") {
      summary.skipped = result.status === "SKIPPED";
      summary.reason = result.reason;
      break;
    }
    summary.archivedKingdoms++;
    summary.deletedRows += Number(result.deleted || 0);
  }
  return summary;
}

// When a kingdom becomes followed again, put its archived rows back into D1
// before the first fetch so change detection compares against real ranks
// instead of reporting every entry as new.
export async function restoreArchivedKingdomRankingsIfMissing(env, kid) {
  const db = env?.DB;
  const id = Number(kid);
  if (!db || !env?.ARCHIVE || !Number.isInteger(id)) return { restored: 0 };
  const existing = await db.prepare("SELECT 1 AS present FROM kingdom_ranking_current WHERE kid = ? LIMIT 1").bind(id).first();
  if (existing) return { restored: 0 };
  readCache.delete(id);
  const archive = await loadArchivedKingdomRankings(env.ARCHIVE, id);
  if (!archive?.rows?.length) return { restored: 0 };
  const columns = ["kid", "board", "target_type", "target_id", "rank", "previous_rank", "score", "uid", "governor_id", "nick_name", "aid", "abbr", "name", "observed_at", "source_observed_at", "source_observation_id", "updated_at"];
  const sql = `INSERT OR IGNORE INTO kingdom_ranking_current (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
  const statements = archive.rows.map(row => db.prepare(sql).bind(...columns.map(column => row[column] ?? null)));
  for (let i = 0; i < statements.length; i += 100) await db.batch(statements.slice(i, i + 100));
  readCache.delete(id);
  return { restored: statements.length };
}
