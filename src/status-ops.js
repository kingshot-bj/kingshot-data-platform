const API_POOL_STATUS_ORDER = ["AVAILABLE", "COOLDOWN", "ERROR", "DISABLED", "REVOKED"];

export async function getOperationalStatus(db) {
  const [poolResult, leaseResult, leaseDetailResult, watchResult, watchDetailResult, jobResult, latestKeyResult] = await Promise.all([
    db.prepare(
      "SELECT pool_type, status, COUNT(*) AS count FROM api_pool_keys GROUP BY pool_type, status ORDER BY pool_type, status"
    ).all(),
    db.prepare(
      "SELECT COUNT(*) AS active_count, SUM(CASE WHEN leased_until <= ? THEN 1 ELSE 0 END) AS expired_active_count FROM api_pool_keys WHERE leased_until IS NOT NULL"
    ).bind(Math.floor(Date.now() / 1000)).first(),
    db.prepare(
      "SELECT key_id, pool_type, status, label, leased_until, lease_job_id, lease_purpose, lease_target_type, lease_target_id, updated_at FROM api_pool_keys WHERE leased_until IS NOT NULL ORDER BY leased_until DESC, pool_type, key_id"
    ).all(),
    db.prepare(
      "SELECT COUNT(*) AS total_count, SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) AS enabled_count, SUM(CASE WHEN enabled = 1 AND last_error IS NOT NULL THEN 1 ELSE 0 END) AS enabled_error_count, MAX(last_success_at) AS latest_success_at, MAX(updated_at) AS latest_updated_at FROM kingdom_watchlists"
    ).first(),
    db.prepare(
      "SELECT watchlist_id, discord_id, kid, top_n, interval_hours, enabled, last_run_at, last_success_at, last_error, created_at, updated_at FROM kingdom_watchlists ORDER BY created_at ASC"
    ).all(),
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

  const now = Math.floor(Date.now() / 1000);
  const leaseDetails = (leaseDetailResult.results || []).map(row => ({
    keyId: row.key_id,
    poolType: row.pool_type,
    status: row.status,
    label: row.label || null,
    leaseState: Number(row.leased_until || 0) > now ? "ACTIVE" : "EXPIRED",
    leasedUntil: row.leased_until ? Number(row.leased_until) : null,
    leaseJobId: row.lease_job_id || null,
    leasePurpose: row.lease_purpose || null,
    leaseTargetType: row.lease_target_type || null,
    leaseTargetId: row.lease_target_id || null,
    updatedAt: row.updated_at ? Number(row.updated_at) : null
  }));

  const leaseByPurpose = {};
  for (const lease of leaseDetails) {
    const purpose = lease.leasePurpose || "UNKNOWN";
    leaseByPurpose[purpose] = (leaseByPurpose[purpose] || 0) + 1;
  }

  const watch = watchResult || {};
  const watchDetails = (watchDetailResult.results || []).map(row => ({
    watchlistId: row.watchlist_id,
    discordId: row.discord_id || null,
    kid: row.kid !== null && row.kid !== undefined ? Number(row.kid) : null,
    topN: row.top_n !== null && row.top_n !== undefined ? Number(row.top_n) : null,
    intervalHours: row.interval_hours !== null && row.interval_hours !== undefined ? Number(row.interval_hours) : null,
    enabled: Boolean(row.enabled),
    lastRunAt: row.last_run_at ? Number(row.last_run_at) : null,
    lastSuccessAt: row.last_success_at ? Number(row.last_success_at) : null,
    lastError: row.last_error || null,
    createdAt: row.created_at ? Number(row.created_at) : null,
    updatedAt: row.updated_at ? Number(row.updated_at) : null
  }));
  const watchByDiscord = {};
  for (const item of watchDetails) {
    const id = item.discordId || "UNKNOWN";
    if (!watchByDiscord[id]) watchByDiscord[id] = { watchlistCount: 0, enabledCount: 0, kingdoms: [] };
    watchByDiscord[id].watchlistCount += 1;
    if (item.enabled) watchByDiscord[id].enabledCount += 1;
    if (item.kid !== null && !watchByDiscord[id].kingdoms.includes(item.kid)) {
      watchByDiscord[id].kingdoms.push(item.kid);
    }
  }
  const job = jobResult || null;

  // Load-test state is intentionally read-only here. The table is created lazily
  // by the OWNER load-test path, so status JSON must remain usable before the
  // first load test has ever run.
  let loadTest = {
    schemaAvailable: false,
    active: false,
    startedAt: null,
    expiresAt: null
  };
  try {
    const now = Math.floor(Date.now() / 1000);
    const loadTestRow = await db.prepare(
      "SELECT lock_token, lock_until, updated_at FROM api_request_locks WHERE lock_key = ? AND lock_until > ? LIMIT 1"
    ).bind("OWNER_KINGDOM_LOAD_TEST", now).first();
    loadTest = {
      schemaAvailable: true,
      active: Boolean(loadTestRow),
      runId: loadTestRow?.lock_token || null,
      startedAt: loadTestRow?.updated_at ? Number(loadTestRow.updated_at) : null,
      expiresAt: loadTestRow?.lock_until ? Number(loadTestRow.lock_until) : null
    };
  } catch (error) {
    // The table may not exist until the first load-test invocation. Do not make
    // the whole operational status fail just because this optional state is absent.
    loadTest = {
      schemaAvailable: false,
      active: false,
      runId: null,
      startedAt: null,
      expiresAt: null
    };
  }

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
      } : null,
      leaseDetails,
      leaseByPurpose
    },
    loadTest,
    watchlist: {
      total: Number(watch.total_count || 0),
      enabled: Number(watch.enabled_count || 0),
      enabledErrors: Number(watch.enabled_error_count || 0),
      latestSuccessAt: watch.latest_success_at ? Number(watch.latest_success_at) : null,
      latestUpdatedAt: watch.latest_updated_at ? Number(watch.latest_updated_at) : null,
      details: watchDetails,
      byDiscordId: watchByDiscord,
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
