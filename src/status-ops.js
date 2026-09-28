const API_POOL_STATUS_ORDER = ["AVAILABLE", "COOLDOWN", "ERROR", "DISABLED", "REVOKED"];

export async function getOperationalStatus(db) {
  const [poolResult, leaseResult, watchResult, jobResult, latestKeyResult] = await Promise.all([
    db.prepare(
      "SELECT pool_type, status, COUNT(*) AS count FROM api_pool_keys GROUP BY pool_type, status ORDER BY pool_type, status"
    ).all(),
    db.prepare(
      "SELECT COUNT(*) AS active_count, SUM(CASE WHEN expires_at <= ? THEN 1 ELSE 0 END) AS expired_active_count FROM api_leases WHERE status = 'ACTIVE'"
    ).bind(Math.floor(Date.now() / 1000)).first(),
    db.prepare(
      "SELECT COUNT(*) AS total_count, SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) AS enabled_count, SUM(CASE WHEN enabled = 1 AND last_error IS NOT NULL THEN 1 ELSE 0 END) AS enabled_error_count, MAX(last_success_at) AS latest_success_at, MAX(updated_at) AS latest_updated_at FROM kingdom_watchlists"
    ).first(),
    db.prepare(
      "SELECT status, last_error, updated_at, completed_at, source_last_at, ranking_rows, player_rows FROM kingdom_watchlist_jobs ORDER BY created_at DESC LIMIT 1"
    ).first(),
    db.prepare(
      "SELECT pool_type, status, label, last_success_at, last_error_at, last_error_code, last_error_message FROM api_pool_keys ORDER BY COALESCE(last_error_at, 0) DESC, updated_at DESC LIMIT 1"
    ).first()
  ]);

  const poolRows = poolResult.results || [];
  const pools = {};
  for (const row of poolRows) {
    if (!pools[row.pool_type]) {
      pools[row.pool_type] = Object.fromEntries(API_POOL_STATUS_ORDER.map(status => [status, 0]));
    }
    pools[row.pool_type][row.status] = Number(row.count || 0);
  }

  const poolTotals = Object.fromEntries(API_POOL_STATUS_ORDER.map(status => [status, 0]));
  for (const pool of Object.values(pools)) {
    for (const status of API_POOL_STATUS_ORDER) poolTotals[status] += Number(pool[status] || 0);
  }

  const latestKey = latestKeyResult || null;

  const watch = watchResult || {};
  const job = jobResult || null;

  return {
    apiPool: {
      pools,
      totals: poolTotals,
      totalKeys: API_POOL_STATUS_ORDER.reduce((sum, status) => sum + poolTotals[status], 0),
      availableKeys: poolTotals.AVAILABLE,
      activeLeases: Number(leaseResult?.active_count || 0),
      expiredActiveLeases: Number(leaseResult?.expired_active_count || 0),
      latestKey: latestKey ? {
        poolType: latestKey.pool_type,
        status: latestKey.status,
        label: latestKey.label || null,
        lastSuccessAt: latestKey.last_success_at ? Number(latestKey.last_success_at) : null,
        lastErrorAt: latestKey.last_error_at ? Number(latestKey.last_error_at) : null,
        lastErrorCode: latestKey.last_error_code || null,
        lastErrorMessage: latestKey.last_error_message || null
      } : null
    },
    watchlist: {
      total: Number(watch.total_count || 0),
      enabled: Number(watch.enabled_count || 0),
      enabledErrors: Number(watch.enabled_error_count || 0),
      latestSuccessAt: watch.latest_success_at ? Number(watch.latest_success_at) : null,
      latestUpdatedAt: watch.latest_updated_at ? Number(watch.latest_updated_at) : null,
      latestJob: job ? {
        status: job.status,
        lastError: job.last_error || null,
        updatedAt: job.updated_at ? Number(job.updated_at) : null,
        completedAt: job.completed_at ? Number(job.completed_at) : null,
        sourceLastAt: job.source_last_at ? Number(job.source_last_at) : null,
        rankingRows: Number(job.ranking_rows || 0),
        playerRows: Number(job.player_rows || 0)
      } : null
    }
  };
}
