// Cleanup of the stale MightPulse activity fields (online / last_active_at /
// last_login), which EagleEye must not use. Two separate OWNER actions:
//
//   1. backup: the values (plus the row identifiers) are exported to a CSV,
//      saved to R2 and copied to Google Drive; the Drive copy is verified
//      byte-for-byte (MD5) and a manifest is stored in R2.
//   2. purge: only after a verified backup that still covers the current
//      data, the values are removed from D1 in small batches.
//
// Nothing is deleted by the backup step. R2 history objects are not touched.

export const STALE_BACKUP_MANIFEST_KEY = "config/stale-activity-backup.json";
export const STALE_BACKUP_MAX_AGE_SECONDS = 7 * 86400;
const PAGE = 2000;
const PURGE_BATCH = 500;
const PURGE_MAX_ROUNDS = 200;

const JSON_PATHS = ["$.online", "$.last_active_at", "$.last_login", "$.player.online", "$.player.last_active_at", "$.player.last_login"];
const jsonHas = column => "(" + JSON_PATHS.map(p => "json_type(" + column + ",'" + p + "') IS NOT NULL").join(" OR ") + ")";
const jsonValue = (column, field) => "COALESCE(json_extract(" + column + ",'$." + field + "'),json_extract(" + column + ",'$.player." + field + "'))";

// Tables holding the fields. `id` is the row key used for keyset paging.
export const STALE_TARGETS = Object.freeze([
  {
    table: "players", id: "governor_id", governor: "governor_id",
    where: "(COALESCE(online,0) <> 0 OR last_active_at IS NOT NULL OR last_login IS NOT NULL)",
    select: "online AS online, last_active_at AS last_active_at, last_login AS last_login",
    purge: "UPDATE players SET online = 0, last_active_at = NULL, last_login = NULL"
  },
  {
    table: "api_observations", id: "observation_id", governor: "target_id",
    where: "target_type = 'PLAYER' AND json_valid(payload_json) AND " + jsonHas("payload_json"),
    select: jsonValue("payload_json", "online") + " AS online, " + jsonValue("payload_json", "last_active_at") + " AS last_active_at, " + jsonValue("payload_json", "last_login") + " AS last_login",
    purge: "UPDATE api_observations SET payload_json = json_remove(payload_json," + JSON_PATHS.map(p => "'" + p + "'").join(",") + ")"
  },
  {
    table: "player_snapshots", id: "snapshot_id", governor: "governor_id",
    where: "json_valid(payload_json) AND " + jsonHas("payload_json"),
    select: jsonValue("payload_json", "online") + " AS online, " + jsonValue("payload_json", "last_active_at") + " AS last_active_at, " + jsonValue("payload_json", "last_login") + " AS last_login",
    purge: "UPDATE player_snapshots SET payload_json = json_remove(payload_json," + JSON_PATHS.map(p => "'" + p + "'").join(",") + ")"
  },
  {
    table: "history_emergency_buffer", id: "buffer_id", governor: "governor_id",
    where: "history_type = 'PLAYER' AND json_valid(payload_json) AND " + jsonHas("payload_json"),
    select: jsonValue("payload_json", "online") + " AS online, " + jsonValue("payload_json", "last_active_at") + " AS last_active_at, " + jsonValue("payload_json", "last_login") + " AS last_login",
    purge: "UPDATE history_emergency_buffer SET payload_json = json_remove(payload_json," + JSON_PATHS.map(p => "'" + p + "'").join(",") + ")"
  }
]);

export async function countStaleActivity(db) {
  const counts = {};
  for (const t of STALE_TARGETS) {
    const row = await db.prepare("SELECT COUNT(*) AS n FROM " + t.table + " WHERE " + t.where).first();
    counts[t.table] = Number(row?.n || 0);
  }
  counts.total = Object.values(counts).reduce((a, b) => a + b, 0);
  return counts;
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export async function buildStaleActivityCsv(db) {
  const lines = ["table,row_id,governor_id,online,last_active_at,last_login"];
  const counts = {};
  for (const t of STALE_TARGETS) {
    let after = "";
    counts[t.table] = 0;
    for (let guard = 0; guard < 1000; guard++) {
      const result = await db.prepare(
        "SELECT " + t.id + " AS row_id, " + t.governor + " AS governor_id, " + t.select +
        " FROM " + t.table + " WHERE " + t.where + " AND " + t.id + " > ? ORDER BY " + t.id + " LIMIT " + PAGE
      ).bind(after).all();
      const rows = result?.results || [];
      for (const r of rows) lines.push([t.table, r.row_id, r.governor_id, r.online, r.last_active_at, r.last_login].map(csvCell).join(","));
      counts[t.table] += rows.length;
      if (rows.length < PAGE) break;
      after = String(rows[rows.length - 1].row_id);
    }
  }
  counts.total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { csv: lines.join("\n") + "\n", counts };
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function gzip(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

export async function readStaleBackupManifest(bucket) {
  if (!bucket) return null;
  try {
    const object = await bucket.get(STALE_BACKUP_MANIFEST_KEY);
    return object ? JSON.parse(await object.text()) : null;
  } catch {
    return null;
  }
}

// upload(key, fileName) must copy the R2 object to Drive and verify it,
// returning { verified, driveFileId, webViewLink, md5Checksum }.
export async function runStaleActivityBackup({ db, bucket, upload, now = Math.floor(Date.now() / 1000) }) {
  if (!db) throw new Error("DB_NOT_CONFIGURED");
  if (!bucket) throw new Error("R2_ARCHIVE_NOT_CONFIGURED");
  const { csv, counts } = await buildStaleActivityCsv(db);
  const stamp = new Date(now * 1000).toISOString().replace(/[-:]/g, "").slice(0, 15);
  const fileName = "eagleeye-stale-activity-backup-" + stamp + ".csv.gz";
  const r2Key = "backups/stale-activity/" + fileName;
  await bucket.put(r2Key, await gzip(csv), { httpMetadata: { contentType: "application/gzip" } });
  const drive = await upload(r2Key, fileName);
  if (!drive?.verified) {
    const error = new Error("GOOGLE_DRIVE_VERIFICATION_FAILED");
    error.code = "GOOGLE_DRIVE_VERIFICATION_FAILED";
    throw error;
  }
  const manifest = {
    created_at: now,
    r2_key: r2Key,
    file_name: fileName,
    drive_file_id: drive.driveFileId || null,
    drive_link: drive.webViewLink || null,
    drive_md5: drive.md5Checksum || null,
    verified: true,
    csv_sha256: await sha256Hex(csv),
    counts
  };
  await bucket.put(STALE_BACKUP_MANIFEST_KEY, JSON.stringify(manifest), { httpMetadata: { contentType: "application/json" } });
  return manifest;
}

// Why a purge is not allowed right now, or null when it is.
export function stalePurgeBlocker(manifest, currentCounts, now = Math.floor(Date.now() / 1000)) {
  if (!manifest?.verified) return "BACKUP_REQUIRED";
  if (now - Number(manifest.created_at || 0) > STALE_BACKUP_MAX_AGE_SECONDS) return "BACKUP_TOO_OLD";
  for (const t of STALE_TARGETS) {
    if (Number(currentCounts?.[t.table] || 0) > Number(manifest.counts?.[t.table] || 0)) return "DATA_CHANGED_SINCE_BACKUP";
  }
  return null;
}

export async function runStaleActivityPurge({ db, bucket, confirm, now = Math.floor(Date.now() / 1000) }) {
  const manifest = await readStaleBackupManifest(bucket);
  const before = await countStaleActivity(db);
  const blocker = stalePurgeBlocker(manifest, before, now);
  if (blocker) return { ok: false, error: blocker, before, manifest };
  if (String(confirm || "") !== String(manifest.file_name)) return { ok: false, error: "CONFIRMATION_MISMATCH", before, manifest };
  const changed = {};
  for (const t of STALE_TARGETS) {
    changed[t.table] = 0;
    for (let round = 0; round < PURGE_MAX_ROUNDS; round++) {
      const result = await db.prepare(
        t.purge + " WHERE rowid IN (SELECT rowid FROM " + t.table + " WHERE " + t.where + " LIMIT " + PURGE_BATCH + ")"
      ).run();
      const n = Number(result?.meta?.changes || 0);
      changed[t.table] += n;
      if (n < PURGE_BATCH) break;
    }
  }
  const after = await countStaleActivity(db);
  return { ok: after.total === 0, error: after.total === 0 ? null : "PURGE_INCOMPLETE", before, after, changed, manifest };
}
