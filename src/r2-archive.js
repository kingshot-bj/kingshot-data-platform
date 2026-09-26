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
