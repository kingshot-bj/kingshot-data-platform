const ARCHIVE_VERSION = "v1";
const ARCHIVE_TABLES = new Set([
  "api_observations",
  "player_snapshots",
  "ranking_snapshots",
  "player_rank_snapshots",
  "change_events"
]);

function archiveKey(table, rows) {
  const first = rows[0];
  const last = rows[rows.length - 1];
  const firstRowid = String(first?.rowid ?? "0");
  const lastRowid = String(last?.rowid ?? "0");
  const firstObserved = String(first?.observed_at ?? first?.detected_at ?? first?.created_at ?? "0");
  const lastObserved = String(last?.observed_at ?? last?.detected_at ?? last?.created_at ?? "0");
  return [
    "archive",
    ARCHIVE_VERSION,
    table,
    firstObserved,
    lastObserved,
    firstRowid,
    lastRowid
  ].join("/") + ".ndjson.gz";
}

async function gzipText(text) {
  const response = new Response(text);
  if (!response.body || typeof CompressionStream === "undefined") {
    return response.body;
  }
  return response.body.pipeThrough(new CompressionStream("gzip"));
}

export async function archiveD1RowsToR2(bucket, { table, rows }) {
  if (!bucket) throw new Error("R2_ARCHIVE_NOT_CONFIGURED");
  if (!ARCHIVE_TABLES.has(table)) throw new Error("R2_ARCHIVE_TABLE_NOT_ALLOWED");
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const lines = rows.map(row => JSON.stringify({
    _eagleeye_archive_version: ARCHIVE_VERSION,
    _source_table: table,
    ...row
  }));
  const body = await gzipText(lines.join("\n") + "\n");
  const key = archiveKey(table, rows);

  await bucket.put(key, body, {
    httpMetadata: {
      contentType: "application/x-ndjson",
      contentEncoding: "gzip",
      cacheControl: "private, no-store"
    },
    customMetadata: {
      sourceTable: table,
      rowCount: String(rows.length),
      firstRowid: String(rows[0].rowid),
      lastRowid: String(rows[rows.length - 1].rowid)
    }
  });

  return {
    key,
    rowCount: rows.length,
    firstRowid: Number(rows[0].rowid),
    lastRowid: Number(rows[rows.length - 1].rowid)
  };
}

export { ARCHIVE_TABLES };


const RANKING_HISTORY_ARCHIVE_VERSION = "v1";

function rankingHistoryArchiveKey({ kid, board, observedAt }) {
  return [
    "history",
    RANKING_HISTORY_ARCHIVE_VERSION,
    "ranking_snapshots",
    String(kid),
    encodeURIComponent(String(board)),
    String(observedAt),
    crypto.randomUUID()
  ].join("/") + ".ndjson.gz";
}

async function ungzipBody(body) {
  if (!body) return null;
  if (typeof DecompressionStream === "undefined") return body;
  return body.pipeThrough(new DecompressionStream("gzip"));
}

export async function archiveRankingHistoryBatch(bucket, {
  kid,
  board,
  entries,
  observedAt,
  sourceObservedAt = null,
  sourceObservationId = null
}) {
  if (!bucket) throw new Error("R2_ARCHIVE_NOT_CONFIGURED");
  if (!Number.isFinite(Number(kid)) || !board || !Array.isArray(entries) || entries.length === 0) return null;

  const rows = entries.map((entry, index) => ({
    _eagleeye_archive_version: RANKING_HISTORY_ARCHIVE_VERSION,
    _source_table: "ranking_snapshots",
    kid: Number(kid),
    board: String(board),
    target_type: entry?.target_type ?? null,
    target_id: entry?.target_id ?? null,
    rank: Number(entry?.__eagleeye_rank ?? entry?.rank ?? index + 1),
    score: entry?.score ?? entry?.value ?? null,
    uid: entry?.uid ?? null,
    governor_id: entry?.governor_id ?? null,
    nick_name: entry?.nick_name ?? null,
    aid: entry?.aid ?? null,
    abbr: entry?.abbr ?? null,
    name: entry?.name ?? null,
    observed_at: Number(observedAt),
    source_observed_at: sourceObservedAt,
    source_observation_id: sourceObservationId
  }));

  const body = await gzipText(rows.map(row => JSON.stringify(row)).join("\n") + "\n");
  const key = rankingHistoryArchiveKey({ kid, board, observedAt });

  await bucket.put(key, body, {
    httpMetadata: {
      contentType: "application/x-ndjson",
      contentEncoding: "gzip",
      cacheControl: "private, no-store"
    },
    customMetadata: {
      sourceTable: "ranking_snapshots",
      archiveVersion: RANKING_HISTORY_ARCHIVE_VERSION,
      kid: String(kid),
      board: String(board),
      observedAt: String(observedAt),
      rowCount: String(rows.length)
    }
  });

  return { key, rowCount: rows.length };
}

export async function listRankingHistoryFromR2(bucket, {
  kid,
  board,
  targetId,
  limit = 50
}) {
  if (!bucket) throw new Error("R2_ARCHIVE_NOT_CONFIGURED");
  if (!Number.isFinite(Number(kid)) || !board || !targetId) return [];

  const prefix = [
    "history",
    RANKING_HISTORY_ARCHIVE_VERSION,
    "ranking_snapshots",
    String(kid),
    encodeURIComponent(String(board))
  ].join("/") + "/";

  const objects = [];
  let cursor;
  do {
    const listed = await bucket.list({ prefix, cursor, limit: 1000 });
    objects.push(...(listed.objects || []));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  objects.sort((a, b) => String(b.key).localeCompare(String(a.key)));

  const result = [];
  for (const object of objects) {
    if (result.length >= Math.min(Math.max(Number(limit) || 50, 1), 200)) break;
    const response = await bucket.get(object.key);
    if (!response?.body) continue;
    const stream = await ungzipBody(response.body);
    const text = await new Response(stream).text();
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const row = JSON.parse(line);
      if (String(row.target_id) !== String(targetId)) continue;
      result.push(row);
      if (result.length >= Math.min(Math.max(Number(limit) || 50, 1), 200)) break;
    }
  }

  return result
    .sort((a, b) => Number(b.observed_at) - Number(a.observed_at))
    .slice(0, Math.min(Math.max(Number(limit) || 50, 1), 200));
}
