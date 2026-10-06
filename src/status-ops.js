import { getSystemEventLog } from "./system-log.js";
import { getCollectionSemaphoreSnapshot } from "./collection-semaphore.js";
import { getApiPoolBudgetSnapshot } from "./api-pool.js";
import { getKingdomCatalogDiscoveryStatus } from "./kingdom-catalog.js";
import { getAllianceRollerStatus } from "./alliance-catalog.js";
import { getPlayerRollerStatus } from "./player-roller.js";
const API_POOL_STATUS_ORDER = ["AVAILABLE", "COOLDOWN", "ERROR", "DISABLED", "REVOKED"];

export async function getOperationalStatus(db) {
  const [poolResult, leaseResult, leaseDetailResult, watchResult, watchDetailResult, jobResult, latestKeyResult, systemLogResult, semaphoreResult, budgetResult, kingdomCatalogResult, kingdomSeederResult, kingdomSeederStateResult, kingdomRankingRollerResult, allianceRollerResult, playerRollerResult, kingdomR2BackfillResult] = await Promise.all([
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
    ).first(),
    getSystemEventLog(db, { limit: 100 }),
    getCollectionSemaphoreSnapshot(db).catch(() => null),
    getApiPoolBudgetSnapshot(db, { provider: "MIGHTPULSE", poolTypes: ["SYSTEM_WATCHLIST", "SYSTEM_GENERAL", "USER_CONTRIBUTED"] }).catch(() => null),
    getKingdomCatalogDiscoveryStatus(db).catch(() => null),
    db.prepare("SELECT COUNT(*) AS total, MAX(updated_at) AS latest_updated_at FROM kingdom_catalog").first().catch(() => null),
    db.prepare("SELECT catalog_cursor, processed_runs, success_count, failed_count, last_kid, last_success_at, last_failure_at, last_error, updated_at FROM kingdom_seeder_state WHERE state_key = 'KINGDOM_SEEDER'").first().catch(() => null),
    db.prepare("SELECT state, catalog_cursor, board_cursor, processed_runs, success_count, failed_count, skipped_count, last_kid, last_board, last_success_at, last_failure_at, last_error, updated_at FROM kingdom_ranking_collection_state WHERE state_key = 'KINGDOM_RANKING_ROLLER'").first().catch(() => null),
    getAllianceRollerStatus(db).catch(() => null),
    getPlayerRollerStatus(db).catch(() => null),
    db.prepare("SELECT migration_key, last_kid, state, batches_run, rows_archived, last_batch_count, last_batch_at, last_success_at, last_error, updated_at FROM kingdom_catalog_r2_migration WHERE migration_key = 'KINGDOM_CATALOG_R2_BACKFILL' LIMIT 1").first().catch(() => null)
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
  const latestEventByService = new Map();
  for (const event of systemLogResult) {
    const service = String(event.service || "");
    if (!latestEventByService.has(service)) latestEventByService.set(service, event);
  }
  const portalEvent = latestEventByService.get("kingdom_portal") || null;
  const mightyEvent = latestEventByService.get("kingdom_mighty") || null;
  const discordNotificationEvent = latestEventByService.get("discord_notification") || null;


  // Load-test state is read-only here. The coordination table is provisioned
  // by migrations, so status does not create or alter schema.
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

  const recentLoadTestEvents = systemLogResult.filter(event => event.feature === "owner_kingdom_load_test" || event.operation === "GET /api/owner/kingdom-load-test").slice(0, 100);
  const latestLoadTestEvent = recentLoadTestEvents[0] || null;
  loadTest.lastRun = latestLoadTestEvent ? {
    traceId: latestLoadTestEvent.trace_id || null,
    eventType: latestLoadTestEvent.event_type || null,
    status: latestLoadTestEvent.status || null,
    operation: latestLoadTestEvent.operation || null,
    runId: latestLoadTestEvent.target_id || latestLoadTestEvent.metadata?.runId || null,
    createdAt: latestLoadTestEvent.created_at || null,
    errorCode: latestLoadTestEvent.error_code || null,
    message: latestLoadTestEvent.message || null,
    metadata: latestLoadTestEvent.metadata || null
  } : null;

  return {
    apiPool: {
      pools,
      totals: poolTotals,
      totalKeys: API_POOL_STATUS_ORDER.reduce((sum, status) => sum + poolTotals[status], 0),
      availableKeys: poolTotals.AVAILABLE,
      activeLeases: Number(leaseResult?.active_count || 0),
      expiredActiveLeases: Number(leaseResult?.expired_active_count || 0),
      budget: budgetResult ? {
        checkedAt: Number(budgetResult.checkedAt || 0),
        keyCount: Number(budgetResult.keyCount || 0),
        availableKeys: Number(budgetResult.availableKeys || 0),
        remainingMinute: Number(budgetResult.remainingMinute || 0),
        remainingDay: Number(budgetResult.remainingDay || 0),
        minRemainingMinute: Number(budgetResult.minRemainingMinute || 0),
        minRemainingDay: Number(budgetResult.minRemainingDay || 0),
        measuredReserveMinute: Number(budgetResult.measuredReserveMinute || 0),
        measuredReserveDay: Number(budgetResult.measuredReserveDay || 0),
        measuredPeakMinuteRequests: Number(budgetResult.measuredPeakMinuteRequests || 0),
        measuredUsedDayRequests: Number(budgetResult.measuredUsedDayRequests || 0),
        measuredReserveCheckedAt: Number(budgetResult.measuredReserveCheckedAt || 0)
      } : null,
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
    collectionSemaphore: semaphoreResult || { key: "GLOBAL_API", capacity: 26, active: null, available: null, state: "UNAVAILABLE" },
    kingdomCatalog: kingdomCatalogResult ? {
      discoveryKey: kingdomCatalogResult.discovery_key || "MIGHTPULSE_KINGDOMS",
      nextPage: Number(kingdomCatalogResult.next_page || 1),
      pageSize: Number(kingdomCatalogResult.page_size || 24),
      state: kingdomCatalogResult.state || "UNKNOWN",
      pagesChecked: Number(kingdomCatalogResult.pages_checked || 0),
      kingdomsSeen: Number(kingdomCatalogResult.kingdoms_seen || 0),
      catalogTotal: Number(kingdomCatalogResult.catalog_total || 0),
      catalogActive: Number(kingdomCatalogResult.catalog_active || 0),
      lastPageAt: kingdomCatalogResult.last_page_at ? Number(kingdomCatalogResult.last_page_at) : null,
      lastSuccessAt: kingdomCatalogResult.last_success_at ? Number(kingdomCatalogResult.last_success_at) : null,
      lastError: kingdomCatalogResult.last_error || null,
      updatedAt: kingdomCatalogResult.updated_at ? Number(kingdomCatalogResult.updated_at) : null
    } : {
      state: "UNAVAILABLE",
      nextPage: 1,
      pageSize: 24,
      pagesChecked: 0,
      kingdomsSeen: 0,
      catalogTotal: 0,
      catalogActive: 0,
      lastPageAt: null,
      lastSuccessAt: null,
      lastError: null,
      updatedAt: null
    },
    kingdomRankingRoller: {
      state: kingdomRankingRollerResult?.state || "UNKNOWN",
      catalogCursor: Number(kingdomRankingRollerResult?.catalog_cursor || 0),
      boardCursor: Number(kingdomRankingRollerResult?.board_cursor || 0),
      processedRuns: Number(kingdomRankingRollerResult?.processed_runs || 0),
      successCount: Number(kingdomRankingRollerResult?.success_count || 0),
      failedCount: Number(kingdomRankingRollerResult?.failed_count || 0),
      skippedCount: Number(kingdomRankingRollerResult?.skipped_count || 0),
      lastKid: kingdomRankingRollerResult?.last_kid ?? null,
      lastBoard: kingdomRankingRollerResult?.last_board ?? null,
      lastSuccessAt: kingdomRankingRollerResult?.last_success_at ? Number(kingdomRankingRollerResult.last_success_at) : null,
      lastFailureAt: kingdomRankingRollerResult?.last_failure_at ? Number(kingdomRankingRollerResult.last_failure_at) : null,
      lastError: kingdomRankingRollerResult?.last_error || null,
      updatedAt: kingdomRankingRollerResult?.updated_at ? Number(kingdomRankingRollerResult.updated_at) : null
    },
    allianceRoller: {
      state: allianceRollerResult?.state || "UNKNOWN",
      catalogCursor: Number(allianceRollerResult?.catalog_cursor || 0),
      processedRuns: Number(allianceRollerResult?.processed_runs || 0),
      successCount: Number(allianceRollerResult?.success_count || 0),
      failedCount: Number(allianceRollerResult?.failed_count || 0),
      skippedCount: Number(allianceRollerResult?.skipped_count || 0),
      lastKid: allianceRollerResult?.last_kid ?? null,
      lastAid: allianceRollerResult?.last_aid ?? null,
      lastSuccessAt: allianceRollerResult?.last_success_at ? Number(allianceRollerResult.last_success_at) : null,
      lastFailureAt: allianceRollerResult?.last_failure_at ? Number(allianceRollerResult.last_failure_at) : null,
      lastError: allianceRollerResult?.last_error || null,
      updatedAt: allianceRollerResult?.updated_at ? Number(allianceRollerResult.updated_at) : null
    },
    playerRoller: {
      state: playerRollerResult?.state || "UNKNOWN",
      catalogCursor: Number(playerRollerResult?.catalog_cursor || 0),
      processedRuns: Number(playerRollerResult?.processed_runs || 0),
      successCount: Number(playerRollerResult?.success_count || 0),
      failedCount: Number(playerRollerResult?.failed_count || 0),
      skippedCount: Number(playerRollerResult?.skipped_count || 0),
      lastKid: playerRollerResult?.last_kid ?? null,
      lastGovernorId: playerRollerResult?.last_governor_id ?? null,
      lastSuccessAt: playerRollerResult?.last_success_at ? Number(playerRollerResult.last_success_at) : null,
      lastFailureAt: playerRollerResult?.last_failure_at ? Number(playerRollerResult.last_failure_at) : null,
      lastError: playerRollerResult?.last_error || null,
      updatedAt: playerRollerResult?.updated_at ? Number(playerRollerResult.updated_at) : null
    },
    kingdomCatalogR2Backfill: {
      available: Boolean(kingdomR2BackfillResult),
      migrationKey: kingdomR2BackfillResult?.migration_key || "KINGDOM_CATALOG_R2_BACKFILL",
      state: kingdomR2BackfillResult?.state || "UNAVAILABLE",
      lastKid: kingdomR2BackfillResult?.last_kid != null ? Number(kingdomR2BackfillResult.last_kid) : 0,
      batchesRun: Number(kingdomR2BackfillResult?.batches_run || 0),
      rowsArchived: Number(kingdomR2BackfillResult?.rows_archived || 0),
      lastBatchCount: Number(kingdomR2BackfillResult?.last_batch_count || 0),
      lastBatchAt: kingdomR2BackfillResult?.last_batch_at ? Number(kingdomR2BackfillResult.last_batch_at) : null,
      lastSuccessAt: kingdomR2BackfillResult?.last_success_at ? Number(kingdomR2BackfillResult.last_success_at) : null,
      lastError: kingdomR2BackfillResult?.last_error || null,
      updatedAt: kingdomR2BackfillResult?.updated_at ? Number(kingdomR2BackfillResult.updated_at) : null
    },
    kingdomSeeder: {
      catalogRows: Number(kingdomSeederResult?.total || 0),
      latestUpdatedAt: kingdomSeederResult?.latest_updated_at ? Number(kingdomSeederResult.latest_updated_at) : null,
      catalogCursor: Number(kingdomSeederStateResult?.catalog_cursor || 0),
      processedRuns: Number(kingdomSeederStateResult?.processed_runs || 0),
      successCount: Number(kingdomSeederStateResult?.success_count || 0),
      failedCount: Number(kingdomSeederStateResult?.failed_count || 0),
      lastKid: kingdomSeederStateResult?.last_kid ?? null,
      lastSuccessAt: kingdomSeederStateResult?.last_success_at ? Number(kingdomSeederStateResult.last_success_at) : null,
      lastFailureAt: kingdomSeederStateResult?.last_failure_at ? Number(kingdomSeederStateResult.last_failure_at) : null,
      lastError: kingdomSeederStateResult?.last_error || null,
      state: kingdomSeederStateResult ? "AVAILABLE" : "UNKNOWN"
    },
    kingdomPortal: {
      state: portalEvent?.status || "UNKNOWN",
      lastEventAt: portalEvent?.created_at ? Number(portalEvent.created_at) : null,
      lastOperation: portalEvent?.operation || null,
      lastErrorCode: portalEvent?.error_code || null
    },
    kingdomMighty: {
      state: mightyEvent?.status || "UNKNOWN",
      lastEventAt: mightyEvent?.created_at ? Number(mightyEvent.created_at) : null,
      lastOperation: mightyEvent?.operation || null,
      lastErrorCode: mightyEvent?.error_code || null
    },
    discordNotification: {
      state: discordNotificationEvent?.status || "UNKNOWN",
      lastEventAt: discordNotificationEvent?.created_at ? Number(discordNotificationEvent.created_at) : null,
      lastOperation: discordNotificationEvent?.operation || null,
      lastErrorCode: discordNotificationEvent?.error_code || null
    },
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
