/**
 * EagleEye Resource Safety Gate
 *
 * Centralized, side-effect-free policy evaluation used by background collection
 * and load-test entry points. It deliberately does not bypass API Pool leases;
 * it decides whether a workload may start before a lease is attempted.
 */

export const SAFETY_STATES = Object.freeze([
  "NORMAL",
  "CAUTION",
  "WARNING",
  "CRITICAL",
  "HARD_STOP"
]);

export const SAFETY_PRIORITIES = Object.freeze({
  WATCHLIST: 100,
  NORMAL: 80,
  FORCED: 60,
  CATALOG: 50,
  SEEDER: 40,
  ALLIANCE_ROLLER: 30,
  PLAYER_ROLLER: 20,
  LOAD_TEST: 10
});

const DEFAULTS = Object.freeze({
  cloudflareWarningPercent: 70,
  cloudflareCriticalPercent: 85,
  cloudflareHardStopPercent: 100,
  apiKeyMinRemainingMinute: 5,
  apiKeyMinRemainingDay: 50,
  normalReserveKeys: 1,
  loadTestReserveKeys: 1
});

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function maxUsagePercent(cloudflare = {}) {
  const values = [
    cloudflare?.d1?.rowsReadPercent,
    cloudflare?.d1?.rowsWrittenPercent,
    cloudflare?.d1?.storagePercent,
    cloudflare?.workers?.requestsPercent,
    cloudflare?.workers?.cpuTimePercent,
    cloudflare?.r2?.storagePercent,
    cloudflare?.r2?.classAPercent,
    cloudflare?.r2?.classBPercent
  ].map(v => Number(v)).filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

export function getSafetyState(usagePercent, thresholds = {}) {
  const p = Number(usagePercent);
  if (!Number.isFinite(p)) return "CAUTION";
  const hard = finite(thresholds.hardStopPercent, DEFAULTS.cloudflareHardStopPercent);
  const critical = finite(thresholds.criticalPercent, DEFAULTS.cloudflareCriticalPercent);
  const warning = finite(thresholds.warningPercent, DEFAULTS.cloudflareWarningPercent);
  if (p >= hard) return "HARD_STOP";
  if (p >= critical) return "CRITICAL";
  if (p >= warning) return "WARNING";
  if (p > 0) return "NORMAL";
  return "NORMAL";
}

export function evaluateSafetyGate({
  operation = "UNKNOWN",
  priority = SAFETY_PRIORITIES.NORMAL,
  plannedRequests = 0,
  availablePoolKeys = 0,
  reservedKeys = DEFAULTS.normalReserveKeys,
  cloudflare = null,
  apiRemainingMinute = null,
  apiRemainingDay = null,
  force = false,
  thresholds = {}
} = {}) {
  const usagePercent = maxUsagePercent(cloudflare);
  const state = getSafetyState(usagePercent, thresholds);
  const requests = Math.max(0, Math.floor(finite(plannedRequests)));
  const available = Math.max(0, Math.floor(finite(availablePoolKeys)));
  const reserve = Math.max(0, Math.floor(finite(reservedKeys)));
  const remainingMinute = apiRemainingMinute == null ? null : finite(apiRemainingMinute, null);
  const remainingDay = apiRemainingDay == null ? null : finite(apiRemainingDay, null);

  const reasons = [];
  let allowed = true;

  if (state === "HARD_STOP") {
    allowed = false;
    reasons.push("CLOUDFLARE_HARD_STOP");
  }

  if (state === "CRITICAL" && Number(priority) < SAFETY_PRIORITIES.WATCHLIST) {
    allowed = false;
    reasons.push("BACKGROUND_PAUSED_CRITICAL");
  }

  if (available > 0 && available <= reserve) {
    if (Number(priority) < SAFETY_PRIORITIES.WATCHLIST) {
      allowed = false;
      reasons.push("API_POOL_RESERVE_PROTECTED");
    }
  }

  if (remainingMinute != null && requests > Math.max(0, remainingMinute - reserve)) {
    allowed = false;
    reasons.push("API_MINUTE_BUDGET_INSUFFICIENT");
  }

  if (remainingDay != null && requests > Math.max(0, remainingDay - reserve)) {
    allowed = false;
    reasons.push("API_DAILY_BUDGET_INSUFFICIENT");
  }

  if (force && state === "HARD_STOP") {
    allowed = false;
    reasons.push("FORCE_CANNOT_BYPASS_SAFETY");
  }

  return {
    allowed,
    state,
    operation: String(operation),
    priority: Number(priority),
    force: Boolean(force),
    plannedRequests: requests,
    availablePoolKeys: available,
    reservedKeys: reserve,
    usagePercent,
    reasons,
    blockedBy: reasons[0] || null,
    resumeCondition: reasons.length
      ? "安全枠回復後に再評価"
      : null
  };
}

export function buildSafetySnapshot({
  cloudflare = null,
  availablePoolKeys = 0,
  activeLeases = 0,
  waiting = 0,
  thresholds = {}
} = {}) {
  const usagePercent = maxUsagePercent(cloudflare);
  return {
    state: getSafetyState(usagePercent, thresholds),
    maxCloudflareUsagePercent: usagePercent,
    availablePoolKeys: Math.max(0, Math.floor(finite(availablePoolKeys))),
    activeLeases: Math.max(0, Math.floor(finite(activeLeases))),
    waiting: Math.max(0, Math.floor(finite(waiting))),
    thresholds: {
      warningPercent: finite(thresholds.warningPercent, DEFAULTS.cloudflareWarningPercent),
      criticalPercent: finite(thresholds.criticalPercent, DEFAULTS.cloudflareCriticalPercent),
      hardStopPercent: finite(thresholds.hardStopPercent, DEFAULTS.cloudflareHardStopPercent)
    }
  };
}

export { DEFAULTS as SAFETY_DEFAULTS };
