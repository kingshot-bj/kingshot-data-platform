import { runSystemOperation, createSystemTrace } from "./system-log.js";
import { archiveD1RowsToR2 } from "./r2-archive.js";
import { getGoogleDriveConnectionStatus, getGoogleDriveAccessToken, uploadR2ObjectToGoogleDrive } from "./google-drive.js";

const RETENTION_TABLES = Object.freeze([
  { key: "api_observations_days", table: "api_observations", column: "observed_at", keepLatestPerTarget: true },
  { key: "player_snapshots_days", table: "player_snapshots", column: "observed_at", keepLatestPerTarget: false },
  { key: "ranking_snapshots_days", table: "ranking_snapshots", column: "observed_at", keepLatestPerTarget: false },
  { key: "player_rank_snapshots_days", table: "player_rank_snapshots", column: "observed_at", keepLatestPerTarget: false },
  { key: "change_events_days", table: "change_events", column: "detected_at", keepLatestPerTarget: false },
  { key: "api_pool_usage_days", table: "api_pool_usage", column: "used_at", keepLatestPerTarget: false },
  { key: "login_history_days", table: "login_history", column: "logged_in_at", keepLatestPerTarget: false },
  { key: "owner_audit_log_days", table: "owner_audit_log", column: "created_at", keepLatestPerTarget: false },
  { key: "player_identity_history_days", table: "player_identity_history", column: "last_seen_at", keepLatestPerTarget: false }
]);

export async function getRetentionSettings(db) {
  let row = await db.prepare("SELECT * FROM data_retention_settings WHERE settings_id = 1").first();
  if (!row) {
    const now = Math.floor(Date.now() / 1000);
    await db.prepare(
      "INSERT INTO data_retention_settings (settings_id, updated_at) VALUES (1, ?)"
    ).bind(now).run();
    row = await db.prepare("SELECT * FROM data_retention_settings WHERE settings_id = 1").first();
  }
  return row;
}

export async function updateRetentionSettings(db, values, updatedByUserId = null) {
  const current = await getRetentionSettings(db);
  const normalized = {};
  for (const item of RETENTION_TABLES) {
    const value = Number(values[item.key] ?? current[item.key]);
    const min = item.key === "change_events_days" ? 30 : 7;
    if (!Number.isInteger(value) || value !== 0 && (value < min || value > 3650)) {
      throw new Error("INVALID_RETENTION_PERIOD");
    }
    normalized[item.key] = value;
  }
  const now = Math.floor(Date.now() / 1000);
  await db.prepare(
    "UPDATE data_retention_settings SET api_observations_days = ?, player_snapshots_days = ?, ranking_snapshots_days = ?, player_rank_snapshots_days = ?, change_events_days = ?, api_pool_usage_days = ?, login_history_days = ?, owner_audit_log_days = ?, player_identity_history_days = ?, updated_at = ?, updated_by_user_id = ? WHERE settings_id = 1"
  ).bind(
    normalized.api_observations_days,
    normalized.player_snapshots_days,
    normalized.ranking_snapshots_days,
    normalized.player_rank_snapshots_days,
    normalized.change_events_days,
    normalized.api_pool_usage_days,
    normalized.login_history_days,
    normalized.owner_audit_log_days,
    normalized.player_identity_history_days,
    now,
    updatedByUserId
  ).run();
  return getRetentionSettings(db);
}

// D1 allows at most 100 bound parameters per statement. Delete rowids in
// chunks below that limit, all chunks in one atomic D1 batch.
export const D1_DELETE_CHUNK = 90;

// Tables with a fixed retention that is not part of data_retention_settings.
const FIXED_RETENTION_TABLES = Object.freeze([
  { key: "diagnostic_events_fixed_30d", table: "diagnostic_events", column: "created_at", days: 30, keepLatestPerTarget: false }
]);

function chunk(values, size) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

export async function deleteRowidsInChunks(db, table, rowids) {
  if (!rowids.length) return 0;
  const statements = chunk(rowids, D1_DELETE_CHUNK).map(part =>
    db.prepare(`DELETE FROM ${table} WHERE rowid IN (${part.map(() => "?").join(",")})`).bind(...part)
  );
  const results = await db.batch(statements);
  return (results || []).reduce((sum, r) => sum + Number(r?.meta?.changes || 0), 0);
}

// Lazily created per invocation so one Google access token serves every batch.
export function createDriveSession(env) {
  let tokenPromise = null;
  return {
    env,
    status: env ? null : { ready: false },
    async ready() {
      if (!this.env) return false;
      if (!this.status) this.status = await getGoogleDriveConnectionStatus(this.env);
      return Boolean(this.status.ready);
    },
    accessToken() {
      if (!tokenPromise) tokenPromise = getGoogleDriveAccessToken(this.env);
      return tokenPromise;
    }
  };
}

/**
 * Data-loss-safe archive of one batch of D1 rows:
 *   1. write the rows to R2 (gzip NDJSON)
 *   2. confirm the R2 object exists with the expected row count and size
 *   3. upload the R2 object to Google Drive and confirm size + MD5
 *   4. only then delete exactly those rows from D1
 * Any failure or a disconnected Drive leaves the D1 rows untouched; the next
 * run retries the same rows (same R2 key, Drive duplicate detection).
 */
export async function archiveBatchThenDelete(db, archiveBucket, drive, { table, rows }) {
  const base = { table, selected: rows.length, archived: 0, deleted: 0, archiveKey: null, driveFileId: null };
  if (!rows.length) return { ...base, status: "NOTHING_TO_DO" };
  if (!archiveBucket) return { ...base, status: "SKIPPED", reason: "R2_ARCHIVE_NOT_CONFIGURED" };
  if (!drive || !(await drive.ready())) return { ...base, status: "SKIPPED", reason: "GOOGLE_DRIVE_NOT_READY" };

  const rowids = rows.map(row => Number(row.rowid));
  if (rowids.some(id => !Number.isFinite(id))) return { ...base, status: "FAILED", reason: "ROWID_MISSING" };

  const archive = await archiveD1RowsToR2(archiveBucket, { table, rows });
  const head = await archiveBucket.head(archive.key);
  const r2Ok = Boolean(head) &&
    Number(head.size || 0) > 0 &&
    (!archive.byteLength || Number(head.size) === Number(archive.byteLength)) &&
    String(head.customMetadata?.rowCount || "") === String(rows.length);
  if (!r2Ok) return { ...base, archiveKey: archive.key, status: "FAILED", reason: "R2_VERIFICATION_FAILED" };

  let upload;
  try {
    upload = await uploadR2ObjectToGoogleDrive(drive.env, {
      archiveBucket,
      key: archive.key,
      mimeType: "application/gzip",
      accessToken: await drive.accessToken()
    });
  } catch (error) {
    return { ...base, archiveKey: archive.key, archived: rows.length, status: "FAILED", reason: String(error?.code || error?.message || "GOOGLE_DRIVE_UPLOAD_FAILED").split(":")[0] };
  }
  if (!upload?.verified) {
    return { ...base, archiveKey: archive.key, archived: rows.length, driveFileId: upload?.driveFileId || null, status: "FAILED", reason: "GOOGLE_DRIVE_VERIFICATION_FAILED" };
  }

  const deleted = await deleteRowidsInChunks(db, table, rowids);
  return {
    ...base,
    archiveKey: archive.key,
    archived: rows.length,
    deleted,
    driveFileId: upload.driveFileId || null,
    driveDuplicate: Boolean(upload.duplicate),
    md5Checked: Boolean(upload.md5Checked),
    status: "ARCHIVED"
  };
}

function selectExpiredRowsSql(item) {
  if (item.keepLatestPerTarget && item.table === "api_observations") {
    return `SELECT rowid, * FROM api_observations
      WHERE observed_at < ?
        AND EXISTS (
          SELECT 1 FROM api_observations newer
          WHERE newer.target_type = api_observations.target_type
            AND newer.target_id = api_observations.target_id
            AND newer.observed_at > api_observations.observed_at
        )
      ORDER BY observed_at ASC, rowid ASC
      LIMIT ?`;
  }
  return `SELECT rowid, * FROM ${item.table}
    WHERE ${item.column} < ?
    ORDER BY ${item.column} ASC, rowid ASC
    LIMIT ?`;
}

async function runRetentionCleanupInternal(db, { batchSize = 500, maxBatches = 2, archiveBucket = null, googleDriveEnv = null, drive = null } = {}) {
  // Bound each pass: batch size and number of batches per invocation.
  const safeBatchSize = Math.min(1000, Math.max(1, Number(batchSize) || 500));
  let budget = Math.max(1, Math.min(10, Number(maxBatches) || 2));
  const session = drive || createDriveSession(googleDriveEnv);
  const settings = await getRetentionSettings(db);
  const now = Math.floor(Date.now() / 1000);
  const deleted = {};
  const archived = {};
  const batches = [];

  const targets = [
    ...RETENTION_TABLES.map(item => ({ ...item, days: Number(settings[item.key]) })),
    ...FIXED_RETENTION_TABLES
  ];
  for (const item of targets) {
    deleted[item.table] = 0;
    archived[item.table] = 0;
    if (!item.days || budget <= 0) continue;
    const cutoff = now - item.days * 86400;
    const rows = (await db.prepare(selectExpiredRowsSql(item)).bind(cutoff, safeBatchSize).all()).results || [];
    if (!rows.length) continue;
    budget--;
    const result = await archiveBatchThenDelete(db, archiveBucket, session, { table: item.table, rows });
    deleted[item.table] = result.deleted;
    archived[item.table] = result.archived;
    batches.push(result);
    // Without a verified backup path nothing can be deleted; stop early.
    if (result.status === "SKIPPED") break;
  }

  return { settings, deleted, archived, batches };
}


const SYSTEM_LOG_RETENTION_SECONDS = 24 * 60 * 60;

async function archiveExpiredSystemEventLog(db, archiveBucket, batchSize = 1000, googleDriveEnv = null, { maxBatches = 1, drive = null } = {}) {
  if (!db || !archiveBucket) {
    return { selected: 0, archived: 0, deleted: 0, pending: null, skipped: true, reason: "R2_ARCHIVE_NOT_CONFIGURED" };
  }

  const cutoff = Math.floor(Date.now() / 1000) - SYSTEM_LOG_RETENTION_SECONDS;
  const safeBatchSize = Math.min(Math.max(Number(batchSize) || 1000, 1), 1000);
  const session = drive || createDriveSession(googleDriveEnv);
  const totals = { selected: 0, archived: 0, deleted: 0, batches: [], cutoff };

  for (let i = 0; i < Math.max(1, Math.min(10, Number(maxBatches) || 1)); i++) {
    const rows = (await db.prepare(
      `SELECT rowid, event_id, trace_id, parent_trace_id, event_type, service, feature,
        operation, status, actor_type, actor_id, target_type, target_id,
        http_method, http_path, http_status, started_at, completed_at, elapsed_ms,
        error_code, message, metadata_json, created_at
       FROM system_event_log
       WHERE created_at < ?
       ORDER BY created_at ASC, rowid ASC
       LIMIT ?`
    ).bind(cutoff, safeBatchSize).all()).results || [];
    if (!rows.length) break;
    const result = await archiveBatchThenDelete(db, archiveBucket, session, { table: "system_event_log", rows });
    totals.selected += result.selected;
    totals.archived += result.archived;
    totals.deleted += result.deleted;
    totals.batches.push(result);
    if (result.status !== "ARCHIVED") {
      totals.skipped = result.status === "SKIPPED";
      totals.reason = result.reason;
      break;
    }
  }

  // Bounded backlog indicator: never count more than 10,000 expired rows.
  const remaining = await db.prepare(
    "SELECT COUNT(*) AS count FROM (SELECT 1 FROM system_event_log WHERE created_at < ? LIMIT 10001)"
  ).bind(cutoff).first();
  totals.pending = Number(remaining?.count || 0);
  totals.pendingCapped = totals.pending > 10000;
  return totals;
}

export async function archiveSystemEventLog(db, archiveBucket, options = {}) {
  const trace = createSystemTrace({ targetType: "SYSTEM_EVENT_LOG" });
  return runSystemOperation(db, trace, {
    eventType: "RETENTION",
    service: "system_log",
    feature: "system_log_archive",
    operation: "ARCHIVE_EXPIRED_SYSTEM_EVENTS",
    targetType: "SYSTEM_EVENT_LOG"
  }, () => archiveExpiredSystemEventLog(
    db,
    archiveBucket,
    options.batchSize,
    options.googleDriveEnv || null,
    { maxBatches: options.maxBatches, drive: options.drive || null }
  ));
}


export async function runRetentionCleanup(db, options = {}) {
  const trace = createSystemTrace({ targetType: "RETENTION" });
  return runSystemOperation(db, trace, {
    eventType: "RETENTION", service: "retention",
    feature: "retention", operation: "RUN_RETENTION_CLEANUP",
    targetType: "RETENTION"
  }, () => runRetentionCleanupInternal(db, options));
}
