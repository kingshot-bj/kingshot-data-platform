import { archiveD1RowsToR2 } from "./r2-archive.js";

const RETENTION_TABLES = Object.freeze([
  { key: "api_observations_days", table: "api_observations", column: "observed_at", keepLatestPerTarget: true },
  { key: "player_snapshots_days", table: "player_snapshots", column: "observed_at", keepLatestPerTarget: false },
  { key: "ranking_snapshots_days", table: "ranking_snapshots", column: "observed_at", keepLatestPerTarget: false },
  { key: "player_rank_snapshots_days", table: "player_rank_snapshots", column: "observed_at", keepLatestPerTarget: false },
  { key: "change_events_days", table: "change_events", column: "detected_at", keepLatestPerTarget: false },
  { key: "api_pool_usage_days", table: "api_pool_usage", column: "used_at", keepLatestPerTarget: false }
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
    "UPDATE data_retention_settings SET api_observations_days = ?, player_snapshots_days = ?, ranking_snapshots_days = ?, player_rank_snapshots_days = ?, change_events_days = ?, api_pool_usage_days = ?, updated_at = ?, updated_by_user_id = ? WHERE settings_id = 1"
  ).bind(
    normalized.api_observations_days,
    normalized.player_snapshots_days,
    normalized.ranking_snapshots_days,
    normalized.player_rank_snapshots_days,
    normalized.change_events_days,
    normalized.api_pool_usage_days,
    now,
    updatedByUserId
  ).run();
  return getRetentionSettings(db);
}

export async function runRetentionCleanup(db, { batchSize = 1000, archiveBucket = null } = {}) {
  const settings = await getRetentionSettings(db);
  const now = Math.floor(Date.now() / 1000);
  const result = {};
  const archived = {};

  for (const item of RETENTION_TABLES) {
    const days = Number(settings[item.key]);
    if (!days) {
      result[item.table] = 0;
      archived[item.table] = 0;
      continue;
    }

    const cutoff = now - days * 86400;
    const shouldArchive = archiveBucket && [
      "api_observations",
      "player_snapshots",
      "ranking_snapshots",
      "player_rank_snapshots",
      "change_events"
    ].includes(item.table);

    let selectSql;
    if (item.keepLatestPerTarget && item.table === "api_observations") {
      selectSql = `SELECT rowid, * FROM api_observations
        WHERE observed_at < ?
          AND EXISTS (
            SELECT 1 FROM api_observations newer
            WHERE newer.target_type = api_observations.target_type
              AND newer.target_id = api_observations.target_id
              AND newer.observed_at > api_observations.observed_at
          )
        ORDER BY observed_at ASC, rowid ASC
        LIMIT ?`;
    } else {
      selectSql = `SELECT rowid, * FROM ${item.table}
        WHERE ${item.column} < ?
        ORDER BY ${item.column} ASC, rowid ASC
        LIMIT ?`;
    }

    if (shouldArchive) {
      const rows = (await db.prepare(selectSql).bind(cutoff, batchSize).all()).results || [];
      if (!rows.length) {
        result[item.table] = 0;
        archived[item.table] = 0;
        continue;
      }

      const archiveResult = await archiveD1RowsToR2(archiveBucket, {
        table: item.table,
        rows
      });

      const rowids = rows.map(row => Number(row.rowid)).filter(Number.isFinite);
      if (!rowids.length) throw new Error(`RETENTION_ARCHIVE_ROWID_MISSING:${item.table}`);

      const placeholders = rowids.map(() => "?").join(",");
      const deleted = await db.prepare(
        `DELETE FROM ${item.table} WHERE rowid IN (${placeholders})`
      ).bind(...rowids).run();

      result[item.table] = Number(deleted?.meta?.changes || 0);
      archived[item.table] = Number(archiveResult?.rowCount || rows.length);
      continue;
    }

    let sql;
    if (item.keepLatestPerTarget && item.table === "api_observations") {
      sql = `DELETE FROM api_observations
        WHERE rowid IN (
          SELECT rowid FROM api_observations a
          WHERE a.observed_at < ?
            AND EXISTS (
              SELECT 1 FROM api_observations newer
              WHERE newer.target_type = a.target_type
                AND newer.target_id = a.target_id
                AND newer.observed_at > a.observed_at
            )
          ORDER BY a.observed_at ASC
          LIMIT ?
        )`;
    } else {
      sql = `DELETE FROM ${item.table}
        WHERE rowid IN (
          SELECT rowid FROM ${item.table}
          WHERE ${item.column} < ?
          ORDER BY ${item.column} ASC
          LIMIT ?
        )`;
    }
    const deleted = await db.prepare(sql).bind(cutoff, batchSize).run();
    result[item.table] = Number(deleted?.meta?.changes || 0);
    archived[item.table] = 0;
  }

  return { settings, deleted: result, archived };
}
