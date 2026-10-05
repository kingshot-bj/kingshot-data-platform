const CLOUDFLARE_GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";
const CLOUDFLARE_API_ENDPOINT = "https://api.cloudflare.com/client/v4";

const D1_FREE_LIMITS = {
  rowsRead: 5_000_000,
  rowsWritten: 100_000,
  storageBytes: 5_000_000_000
};

const WORKERS_FREE_LIMITS = {
  requestsPerDay: 100_000,
  cpuTimeMsPerInvocation: 10,
  subrequestsPerInvocation: 50
};

const R2_FREE_LIMITS = {
  storageBytes: 10_000_000_000,
  classAOperationsPerMonth: 1_000_000,
  classBOperationsPerMonth: 10_000_000
};

// Workers Paid starts at $5/month. The included allocations below are the
// Cloudflare-published monthly allowances. EagleEye deliberately monitors a
// 90% safety ceiling so the system does not intentionally consume the full
// included allowance and accidentally cross into usage-based overage.
// The profile is selected by CLOUDFLARE_MONITORING_PROFILE:
//   FREE       = existing daily/monthly Free-plan monitoring
//   PAID_5USD  = monthly Paid-plan monitoring within the $5 base-plan envelope
const D1_PAID_INCLUDED = {
  rowsRead: 25_000_000_000,
  rowsWritten: 50_000_000,
  storageBytes: 5_000_000_000
};

const WORKERS_PAID_INCLUDED = {
  requestsPerMonth: 10_000_000,
  cpuTimeMsPerMonth: 30_000_000,
  subrequestsPerInvocation: 10_000
};

const R2_PAID_INCLUDED = {
  storageBytes: 10_000_000_000,
  classAOperationsPerMonth: 1_000_000,
  classBOperationsPerMonth: 10_000_000
};

const PAID_SAFETY_FACTOR = 0.90;
const DEFAULT_USD_JPY_RATE = 157.5;

function getCloudflareMonitoringProfile(env, profileOverride = null) {
  const usdJpyRate = Number(env.CLOUDFLARE_USD_JPY_RATE || DEFAULT_USD_JPY_RATE);
  const requested = String(profileOverride || env.CLOUDFLARE_MONITORING_PROFILE || "FREE").trim().toUpperCase();
  if (requested === "PAID_5USD") {
    return {
      key: "PAID_5USD",
      label: "Workers Paid $5 envelope",
      budgetUsd: 5,
      period: "CLOUDFLARE_BILLING_CYCLE",
      safetyFactor: PAID_SAFETY_FACTOR,
      usdJpyRate: Number.isFinite(usdJpyRate) && usdJpyRate > 0 ? usdJpyRate : DEFAULT_USD_JPY_RATE,
      d1: Object.fromEntries(Object.entries(D1_PAID_INCLUDED).map(([key, value]) => [key, Math.floor(value * PAID_SAFETY_FACTOR)])),
      workers: Object.fromEntries(Object.entries(WORKERS_PAID_INCLUDED).map(([key, value]) => [key, Math.floor(value * PAID_SAFETY_FACTOR)])),
      r2: Object.fromEntries(Object.entries(R2_PAID_INCLUDED).map(([key, value]) => [key, Math.floor(value * PAID_SAFETY_FACTOR)]))
    };
  }
  return {
    key: "FREE",
    label: "Workers Free",
    budgetUsd: 0,
    period: "CURRENT_FREE_LIMIT_WINDOW",
    safetyFactor: 1,
    usdJpyRate: Number.isFinite(usdJpyRate) && usdJpyRate > 0 ? usdJpyRate : DEFAULT_USD_JPY_RATE,
    d1: D1_FREE_LIMITS,
    workers: WORKERS_FREE_LIMITS,
    r2: R2_FREE_LIMITS
  };
}

const R2_CLASS_A_OPERATIONS = new Set([
  "ListBuckets", "PutBucket", "ListObjects", "PutObject", "CopyObject",
  "CompleteMultipartUpload", "CreateMultipartUpload", "LifecycleStorageTierTransition",
  "ListMultipartUploads", "UploadPart", "UploadPartCopy", "ListParts",
  "PutBucketEncryption", "PutBucketCors", "PutBucketLifecycleConfiguration"
]);

const R2_CLASS_B_OPERATIONS = new Set([
  "HeadBucket", "HeadObject", "GetObject", "UsageSummary",
  "GetBucketEncryption", "GetBucketLocation", "GetBucketCors",
  "GetBucketLifecycleConfiguration"
]);


const WORKERS_USAGE_QUERY = `
query EagleEyeWorkersUsage(
  $accountTag: String!
  $start: Time
  $end: Time
  $scriptName: String
) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      workersInvocationsAdaptive(
        limit: 1000
        filter: {
          datetime_geq: $start
          datetime_leq: $end
          scriptName: $scriptName
        }
      ) {
        sum {
          requests
          errors
          subrequests
        }
        quantiles {
          cpuTimeP50
          cpuTimeP90
          cpuTimeP99
        }
        dimensions {
          scriptName
        }
      }
    }
  }
}
`;

const R2_USAGE_QUERY = `
query EagleEyeR2Usage(
  $accountTag: String!
  $start: Time
  $end: Time
) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      r2OperationsAdaptiveGroups(
        limit: 10000
        filter: {
          datetime_geq: $start
          datetime_leq: $end
        }
      ) {
        sum {
          requests
        }
        dimensions {
          actionType
          actionStatus
          bucketName
        }
      }
      r2StorageAdaptiveGroups(
        limit: 10000
        filter: {
          datetime_geq: $start
          datetime_leq: $end
        }
        orderBy: [datetime_DESC]
      ) {
        max {
          payloadSize
          metadataSize
          objectCount
          uploadCount
        }
        dimensions {
          datetime
          bucketName
        }
      }
    }
  }
}

`;

const R2_BANDWIDTH_QUERY = `
query EagleEyeR2Bandwidth(
  $accountTag: String!
  $start: Time
  $end: Time
) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      r2BandwidthUsageAdaptiveGroups(
        limit: 10000
        filter: {
          datetime_geq: $start
          datetime_leq: $end
        }
      ) {
        sum {
          bytesUpload
          bytesDownload
        }
        dimensions {
          bucketName
          datetimeHour
        }
      }
    }
  }
}
`;

const D1_QUERY_INSIGHTS_QUERY = `
query EagleEyeD1QueryInsights(
  $accountTag: String!
  $start: Date
  $end: Date
  $databaseId: String
) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      d1QueriesAdaptiveGroups(
        limit: 1000
        filter: {
          date_geq: $start
          date_leq: $end
          databaseId: $databaseId
        }
      ) {
        count
        sum {
          rowsRead
          rowsWritten
          rowsReturned
          queryDurationMs
        }
        dimensions {
          databaseId
          query
        }
      }
    }
  }
}
`;

function classifyD1Query(query) {
  const sql = String(query || "").toUpperCase().replace(/\s+/g, " ");
  // Keep this mapping aligned with EagleEye feature areas so the machine-readable
  // status JSON can tell which newly-added feature is consuming D1.
  const rules = [
    ["Data Coverage", ["COUNT(DISTINCT KID)"]],
    ["User Accounts", ["FROM USERS", "INTO USERS", "UPDATE USERS", "DELETE FROM USERS"]],
    ["Player Watchlist", ["PLAYER_WATCHLIST", "PLAYER_WATCHLISTS"]],
    ["Kingdom Watchlist", ["KINGDOM_WATCHLIST_JOBS", "KINGDOM_WATCHLIST_LOCKS", "KINGDOM_WATCHLISTS"]],
    ["Current Ranking", ["KINGDOM_RANKING_CURRENT", "KINGDOM_RANKING_BOARD_STATE"]],
    ["Player Compare", ["PLAYER_COMPARE"]],
    ["Player Observation", ["API_OBSERVATIONS", "PLAYER_OBSERVATIONS"]],
    ["Player Snapshot", ["PLAYER_SNAPSHOTS"]],
    ["Player DB", ["FROM PLAYERS", "INTO PLAYERS", "UPDATE PLAYERS", "DELETE FROM PLAYERS"]],
    ["API Pool", ["API_POOL"]],
    ["Service Usage", ["SERVICE_USAGE"]],
    ["Diagnostics", ["DIAGNOSTIC_EVENTS"]],
    ["Change Event", ["CHANGE_EVENTS", "CHANGE_EVENT"]],
    ["Support", ["SUPPORT_"]],
    ["Retention", ["RETENTION"]],
    ["Ranking Snapshot", ["RANKING_SNAPSHOTS", "PLAYER_RANK_SNAPSHOTS"]],
  ];
  for (const [label, needles] of rules) {
    if (needles.some(needle => sql.includes(needle))) return label;
  }
  if (/\\b(INSERT|UPDATE|DELETE|REPLACE|UPSERT)\\b/.test(sql)) return "Other Write";
  return "Other";
}
function summarizeD1QueryInsights(groups) {
  const queries = (groups || [])
    .map(group => {
      const sum = group?.sum || {};
      const query = String(group?.dimensions?.query || "").trim();
      return {
        query,
        count: normalizeNumber(group?.count),
        rowsRead: normalizeNumber(sum.rowsRead),
        rowsWritten: normalizeNumber(sum.rowsWritten),
        rowsReturned: normalizeNumber(sum.rowsReturned),
        durationMs: normalizeNumber(sum.queryDurationMs),
        category: classifyD1Query(query),
        feature: classifyD1Query(query)
      };
    })
    .filter(item => item.query);

  const topWriteQueries = [...queries].sort((a, b) => b.rowsWritten - a.rowsWritten).slice(0, 10);
  const topReadQueries = [...queries].sort((a, b) => b.rowsRead - a.rowsRead).slice(0, 10);

  const categories = new Map();
  for (const item of queries) {
    const current = categories.get(item.category) || { category: item.category, rowsWritten: 0, count: 0, rowsRead: 0 };
    current.rowsWritten += item.rowsWritten;
    current.count += item.count;
    current.rowsRead += item.rowsRead;
    categories.set(item.category, current);
  }

  return {
    queryCount: queries.length,
    // Keep the complete query list available to the status JSON. The UI may
    // choose to show only a compact subset, but the machine-readable status
    // endpoint must not silently discard query-level metrics.
    queries,
    topWriteQueries,
    topReadQueries,
    categories: [...categories.values()].sort((a, b) => b.rowsWritten - a.rowsWritten),
    // Feature coverage is derived from the complete query list; no query groups are dropped.
    featuresSeen: [...new Set(queries.map(item => item.feature).filter(Boolean))].sort()
  };
}

const D1_USAGE_QUERY = `
query EagleEyeD1Usage(
  $accountTag: String!
  $start: Date
  $end: Date
  $databaseId: String
) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      d1AnalyticsAdaptiveGroups(
        limit: 10000
        filter: {
          date_geq: $start
          date_leq: $end
          databaseId: $databaseId
        }
      ) {
        sum {
          readQueries
          writeQueries
          rowsRead
          rowsWritten
        }
        dimensions {
          date
          databaseId
        }
      }
      d1StorageAdaptiveGroups(
        limit: 10000
        filter: {
          date_geq: $start
          date_leq: $end
          databaseId: $databaseId
        }
      ) {
        max {
          databaseSizeBytes
        }
        dimensions {
          date
          databaseId
        }
      }
    }
  }
}
`;

function monthStartUtcString(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

function daysInUtcMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function billingCycleBoundary(anchorTimestamp, date, direction = "start") {
  const anchor = new Date(anchorTimestamp);
  if (!Number.isFinite(anchor.getTime())) return null;
  const anchorDay = anchor.getUTCDate();
  const makeBoundary = (year, monthIndex) => {
    const day = Math.min(anchorDay, daysInUtcMonth(year, monthIndex));
    return new Date(Date.UTC(
      year,
      monthIndex,
      day,
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds()
    ));
  };

  let boundary = makeBoundary(date.getUTCFullYear(), date.getUTCMonth());
  if (direction === "start" && boundary > date) {
    boundary = makeBoundary(date.getUTCFullYear(), date.getUTCMonth() - 1);
  }
  if (direction === "end" && boundary <= date) {
    boundary = makeBoundary(date.getUTCFullYear(), date.getUTCMonth() + 1);
  }
  return boundary;
}

async function getCloudflareBillingCycle(env, { now = new Date(), token = "" } = {}) {
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const billingToken = String(env.CLOUDFLARE_BILLING_TOKEN || token || "").trim();
  if (!accountId || !billingToken) {
    return {
      available: false,
      state: "UNCONFIGURED",
      message: "Cloudflare Billing APIの設定が不足しています。Billing Read権限を持つトークンが必要です。"
    };
  }

  const response = await fetch(
    CLOUDFLARE_API_ENDPOINT + "/accounts/" + encodeURIComponent(accountId) + "/billable-usage/info",
    {
      method: "GET",
      headers: {
        "Authorization": "Bearer " + billingToken,
        "Content-Type": "application/json"
      }
    }
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.errors?.map(item => item?.message).filter(Boolean).join("; ");
    return {
      available: false,
      state: "ERROR",
      httpStatus: response.status,
      message: message || "Cloudflare Billing API HTTP " + response.status
    };
  }
  if (Array.isArray(payload?.errors) && payload.errors.length) {
    return {
      available: false,
      state: "ERROR",
      message: payload.errors.map(item => item?.message).filter(Boolean).join("; ") || "Cloudflare Billing API error"
    };
  }

  const subscriptions = Array.isArray(payload?.result?.subscriptions)
    ? payload.result.subscriptions
    : [];
  const activeSubscriptions = subscriptions
    .filter(item => !item?.end_timestamp)
    .sort((a, b) => String(b?.start_timestamp || "").localeCompare(String(a?.start_timestamp || "")));
  const subscription = activeSubscriptions[0] || subscriptions[0] || null;
  const anchorTimestamp = subscription?.billing_cycle_anchor_timestamp || null;
  if (!anchorTimestamp) {
    return {
      available: false,
      state: "NO_ANCHOR",
      covered: Boolean(payload?.result?.covered),
      subscriptionCount: subscriptions.length,
      message: "Cloudflare Billing APIからbilling_cycle_anchor_timestampを取得できませんでした。"
    };
  }

  const cycleStart = billingCycleBoundary(anchorTimestamp, now, "start");
  const cycleEnd = billingCycleBoundary(anchorTimestamp, now, "end");
  if (!cycleStart || !cycleEnd) {
    return {
      available: false,
      state: "INVALID_ANCHOR",
      message: "Cloudflare billing cycle anchor timestampが不正です。"
    };
  }

  return {
    available: true,
    state: "OK",
    covered: Boolean(payload?.result?.covered),
    subscriptionId: subscription?.id || null,
    subscriptionStart: subscription?.start_timestamp || null,
    anchorTimestamp,
    cycleStart: cycleStart.toISOString(),
    cycleEnd: cycleEnd.toISOString(),
    billingDayUtc: cycleStart.getUTCDate()
  };
}

function dayStartUtcString(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
}

function summarizeWorkersUsage(groups, limits) {
  const total = (groups || []).reduce((acc, group) => {
    const sum = group?.sum || {};
    acc.requests += normalizeNumber(sum.requests);
    acc.errors += normalizeNumber(sum.errors);
    acc.subrequests += normalizeNumber(sum.subrequests);
    const requests = normalizeNumber(sum.requests);
    const cpuP50 = normalizeNumber(group?.quantiles?.cpuTimeP50);
    acc.cpuTimeMs += requests * cpuP50;
    acc.cpuTimeP50 = Math.max(acc.cpuTimeP50, cpuP50);
    acc.cpuTimeP90 = Math.max(acc.cpuTimeP90, normalizeNumber(group?.quantiles?.cpuTimeP90));
    acc.cpuTimeP99 = Math.max(acc.cpuTimeP99, normalizeNumber(group?.quantiles?.cpuTimeP99));
    return acc;
  }, { requests: 0, errors: 0, subrequests: 0, cpuTimeMs: 0, cpuTimeP50: 0, cpuTimeP90: 0, cpuTimeP99: 0 });
  const requestsLimit = limits?.requestsPerDay ?? limits?.requestsPerMonth ?? WORKERS_FREE_LIMITS.requestsPerDay;
  const cpuLimit = limits?.cpuTimeMsPerMonth ?? null;
  const subrequestsLimit = limits?.subrequestsPerInvocation ?? WORKERS_FREE_LIMITS.subrequestsPerInvocation;
  const requestsPercent = percent(total.requests, requestsLimit);
  const cpuPercent = cpuLimit != null ? percent(total.cpuTimeMs, cpuLimit) : null;
  const averageSubrequests = total.requests > 0 ? total.subrequests / total.requests : 0;
  const subrequestsPercent = percent(averageSubrequests, subrequestsLimit);
  return {
    ...total,
    requestsPercent,
    requestsState: resourceState(requestsPercent),
    cpuTimeMsPercent: cpuPercent,
    cpuTimeMsState: resourceState(cpuPercent),
    cpuTimeP99Percent: percent(total.cpuTimeP99, WORKERS_FREE_LIMITS.cpuTimeMsPerInvocation),
    cpuTimeP99State: resourceState(percent(total.cpuTimeP99, WORKERS_FREE_LIMITS.cpuTimeMsPerInvocation)),
    averageSubrequests,
    averageSubrequestsPercent: subrequestsPercent,
    averageSubrequestsState: resourceState(subrequestsPercent)
  };
}

function summarizeR2Usage(operationGroups, storageGroups, bandwidthGroups) {
  let classA = 0;
  let classB = 0;
  let free = 0;
  let totalOperations = 0;
  let successfulOperations = 0;
  let failedOperations = 0;
  let payloadBytes = 0;
  let metadataBytes = 0;
  let objectCount = 0;
  let uploadCount = 0;
  let latestStorageAt = null;
  let firstStorageAt = null;
  let firstStorageBytes = null;
  let latestStorageBytes = null;
  let firstObjectCount = null;
  let latestObjectCount = null;

  const operations = [];
  const bucketMap = new Map();

  for (const group of operationGroups || []) {
    const actionType = String(group?.dimensions?.actionType || "Unknown");
    const actionStatus = String(group?.dimensions?.actionStatus || "unknown");
    const bucketName = String(group?.dimensions?.bucketName || "");
    const requests = normalizeNumber(group?.sum?.requests);

    totalOperations += requests;
    if (actionStatus.toLowerCase() === "success") successfulOperations += requests;
    else if (actionStatus.toLowerCase() === "userError" || actionStatus.toLowerCase() === "internalError") failedOperations += requests;

    if (R2_CLASS_A_OPERATIONS.has(actionType)) classA += requests;
    else if (R2_CLASS_B_OPERATIONS.has(actionType)) classB += requests;
    else free += requests;

    operations.push({ actionType, actionStatus, bucketName, requests });

    const bucket = bucketMap.get(bucketName) || {
      bucketName,
      operations: 0,
      classAOperations: 0,
      classBOperations: 0,
      freeOperations: 0,
      successfulOperations: 0,
      failedOperations: 0
    };
    bucket.operations += requests;
    if (R2_CLASS_A_OPERATIONS.has(actionType)) bucket.classAOperations += requests;
    else if (R2_CLASS_B_OPERATIONS.has(actionType)) bucket.classBOperations += requests;
    else bucket.freeOperations += requests;
    if (actionStatus.toLowerCase() === "success") bucket.successfulOperations += requests;
    else if (actionStatus.toLowerCase() === "userError" || actionStatus.toLowerCase() === "internalError") bucket.failedOperations += requests;
    bucketMap.set(bucketName, bucket);
  }

  const storageByBucket = new Map();
  for (const group of storageGroups || []) {
    const bucketName = String(group?.dimensions?.bucketName || "");
    const datetime = String(group?.dimensions?.datetime || "");
    const payloadSize = normalizeNumber(group?.max?.payloadSize);
    const metadataSize = normalizeNumber(group?.max?.metadataSize);
    const objects = normalizeNumber(group?.max?.objectCount);
    const uploads = normalizeNumber(group?.max?.uploadCount);
    const totalBytes = payloadSize + metadataSize;

    if (!firstStorageAt || datetime < firstStorageAt) {
      firstStorageAt = datetime;
      firstStorageBytes = totalBytes;
      firstObjectCount = objects;
    }
    if (!latestStorageAt || datetime > latestStorageAt) {
      latestStorageAt = datetime;
      latestStorageBytes = totalBytes;
      latestObjectCount = objects;
    }

    const current = storageByBucket.get(bucketName);
    if (!current || datetime > current.datetime) {
      storageByBucket.set(bucketName, {
        bucketName,
        datetime,
        payloadBytes: payloadSize,
        metadataBytes: metadataSize,
        storageBytes: totalBytes,
        objectCount: objects,
        uploadCount: uploads
      });
    }
  }

  for (const item of storageByBucket.values()) {
    payloadBytes += item.payloadBytes;
    metadataBytes += item.metadataBytes;
    objectCount += item.objectCount;
    uploadCount += item.uploadCount;

    const bucket = bucketMap.get(item.bucketName) || {
      bucketName: item.bucketName,
      operations: 0,
      classAOperations: 0,
      classBOperations: 0,
      freeOperations: 0,
      successfulOperations: 0,
      failedOperations: 0
    };
    Object.assign(bucket, {
      payloadBytes: item.payloadBytes,
      metadataBytes: item.metadataBytes,
      storageBytes: item.storageBytes,
      objectCount: item.objectCount,
      uploadCount: item.uploadCount
    });
    bucketMap.set(item.bucketName, bucket);
  }

  let bytesUpload = 0;
  let bytesDownload = 0;
  const bandwidthByBucket = new Map();
  for (const group of bandwidthGroups || []) {
    const bucketName = String(group?.dimensions?.bucketName || "");
    const upload = normalizeNumber(group?.sum?.bytesUpload);
    const download = normalizeNumber(group?.sum?.bytesDownload);
    bytesUpload += upload;
    bytesDownload += download;
    const current = bandwidthByBucket.get(bucketName) || { bucketName, bytesUpload: 0, bytesDownload: 0 };
    current.bytesUpload += upload;
    current.bytesDownload += download;
    bandwidthByBucket.set(bucketName, current);
  }

  for (const item of bandwidthByBucket.values()) {
    const bucket = bucketMap.get(item.bucketName) || {
      bucketName: item.bucketName,
      operations: 0,
      classAOperations: 0,
      classBOperations: 0,
      freeOperations: 0,
      successfulOperations: 0,
      failedOperations: 0
    };
    bucket.bytesUpload = item.bytesUpload;
    bucket.bytesDownload = item.bytesDownload;
    bucketMap.set(item.bucketName, bucket);
  }

  const storageBytes = payloadBytes + metadataBytes;
  const storagePercent = percent(storageBytes, R2_FREE_LIMITS.storageBytes);
  const classAPercent = percent(classA, R2_FREE_LIMITS.classAOperationsPerMonth);
  const classBPercent = percent(classB, R2_FREE_LIMITS.classBOperationsPerMonth);
  const failedPercent = percent(failedOperations, totalOperations);
  const storageDeltaBytes = latestStorageBytes != null && firstStorageBytes != null
    ? latestStorageBytes - firstStorageBytes
    : null;
  const storageDeltaPercent = firstStorageBytes > 0 && storageDeltaBytes != null
    ? (storageDeltaBytes / firstStorageBytes) * 100
    : null;
  const objectDelta = latestObjectCount != null && firstObjectCount != null
    ? latestObjectCount - firstObjectCount
    : null;

  return {
    classAOperations: classA,
    classBOperations: classB,
    freeOperations: free,
    totalOperations,
    successfulOperations,
    failedOperations,
    failedPercent,
    payloadBytes,
    metadataBytes,
    storageBytes,
    objectCount,
    uploadCount,
    storagePercent,
    classAPercent,
    classBPercent,
    storageState: resourceState(storagePercent),
    classAState: resourceState(classAPercent),
    classBState: resourceState(classBPercent),
    bytesUpload,
    bytesDownload,
    latestStorageAt,
    firstStorageAt,
    latestStorageBytes,
    firstStorageBytes,
    storageDeltaBytes,
    storageDeltaPercent,
    objectDelta,
    buckets: [...bucketMap.values()].sort((a, b) => (b.storageBytes || 0) - (a.storageBytes || 0)),
    // Keep every operation group in the machine-readable status payload.
    // The UI can still render a compact subset without losing diagnostic data.
    operations: operations.sort((a,b) => b.requests - a.requests)
  };
}

function utcDateString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function percent(used, limit) {
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return null;
  return Math.min(100, Math.max(0, (used / limit) * 100));
}

function resourceState(usagePercent) {
  if (usagePercent == null) return "UNKNOWN";
  if (usagePercent >= 100) return "EXHAUSTED";
  if (usagePercent >= 85) return "CRITICAL";
  if (usagePercent >= 70) return "WARNING";
  return "OK";
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function sumMetrics(groups) {
  return (groups || []).reduce((total, group) => {
    const sum = group?.sum || {};
    total.rowsRead += normalizeNumber(sum.rowsRead);
    total.rowsWritten += normalizeNumber(sum.rowsWritten);
    total.readQueries += normalizeNumber(sum.readQueries);
    total.writeQueries += normalizeNumber(sum.writeQueries);
    return total;
  }, {
    rowsRead: 0,
    rowsWritten: 0,
    readQueries: 0,
    writeQueries: 0,
  });
}

function maxStorage(groups, databaseId) {
  return (groups || [])
    .filter(group => !databaseId || String(group?.dimensions?.databaseId || "") === String(databaseId))
    .reduce((max, group) => Math.max(max, normalizeNumber(group?.max?.databaseSizeBytes)), 0);
}

export async function getCloudflareD1Usage(env, { now = new Date(), includeQueryInsights = true, monitoringProfile = null } = {}) {
  const monitoring = getCloudflareMonitoringProfile(env, monitoringProfile);
  const accountTag = String(env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const token = String(env.CLOUDFLARE_ANALYTICS_TOKEN || "").trim();
  const databaseId = String(env.CLOUDFLARE_D1_DATABASE_ID || "").trim();
  const workerName = String(env.CLOUDFLARE_WORKER_NAME || "kingshot-data-platform").trim();

  const configuration = {
    accountId: Boolean(accountTag),
    analyticsToken: Boolean(token),
    databaseId: Boolean(databaseId)
  };

  if (!accountTag || !token || !databaseId) {
    const missing = Object.entries(configuration)
      .filter(([, configured]) => !configured)
      .map(([key]) => key)
      .join(", ");
    return {
      configured: false,
      status: "UNCONFIGURED",
      configuration,
      message: "Cloudflare Analytics APIの設定が不足しています。未設定: " + missing
    };
  }

  const date = utcDateString(now);
  const dayStart = dayStartUtcString(now);
  const endTime = now.toISOString();
  const paidMode = monitoring.key === "PAID_5USD";

  // Paid monitoring must follow Cloudflare's actual billing cycle, not the
  // calendar month. The Billing API exposes billing_cycle_anchor_timestamp.
  // We intentionally do not silently label a calendar-month fallback as a
  // billing period.
  const billingCycle = paidMode
    ? await getCloudflareBillingCycle(env, { now, token })
    : {
        available: true,
        state: "FREE_DAILY",
        cycleStart: dayStart,
        cycleEnd: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString(),
        billingDayUtc: null
      };

  if (paidMode && !billingCycle.available) {
    console.warn("cloudflare_billing_cycle_unavailable", billingCycle.message || billingCycle.state);
  }

  const usagePeriodStart = paidMode && billingCycle.available
    ? billingCycle.cycleStart
    : paidMode
      ? monthStartUtcString(now)
      : dayStart;
  const usagePeriodEnd = paidMode && billingCycle.available
    ? billingCycle.cycleEnd
    : endTime;
  const d1Start = paidMode ? usagePeriodStart.slice(0, 10) : date;
  const d1End = date;
  const workerStart = usagePeriodStart;

  const response = await fetch(CLOUDFLARE_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query: D1_USAGE_QUERY,
      variables: { accountTag, start: d1Start, end: d1End, databaseId }
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error("Cloudflare Analytics API HTTP " + response.status);
  if (Array.isArray(payload?.errors) && payload.errors.length) {
    const message = payload.errors.map(item => item?.message).filter(Boolean).join("; ");
    throw new Error(message || "Cloudflare Analytics GraphQL error");
  }
  const account = payload?.data?.viewer?.accounts?.[0];
  if (!account) throw new Error("Cloudflare Analytics API returned no account data");

  const databaseMetrics = sumMetrics(account.d1AnalyticsAdaptiveGroups || []);
  let queryInsights = { queryCount: 0, topWriteQueries: [], topReadQueries: [], categories: [], available: false };
  if (includeQueryInsights) {
    try {
      const insightsResponse = await fetch(CLOUDFLARE_GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: D1_QUERY_INSIGHTS_QUERY,
          variables: { accountTag, start: d1Start, end: d1End, databaseId }
        })
      });
      const insightsPayload = await insightsResponse.json().catch(() => null);
      if (insightsResponse.ok && !Array.isArray(insightsPayload?.errors)) {
        const insightAccount = insightsPayload?.data?.viewer?.accounts?.[0];
        queryInsights = {
          ...summarizeD1QueryInsights(insightAccount?.d1QueriesAdaptiveGroups || []),
          available: true
        };
      }
    } catch (error) {
      console.warn("cloudflare_d1_query_insights_failed", error?.message || error);
    }
  }


  let workers = { available: false };
  try {
    const workersResponse = await fetch(CLOUDFLARE_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query: WORKERS_USAGE_QUERY,
        variables: { accountTag, start: workerStart, end: endTime, scriptName: workerName }
      })
    });
    const workersPayload = await workersResponse.json().catch(() => null);
    if (workersResponse.ok && !Array.isArray(workersPayload?.errors)) {
      const workerAccount = workersPayload?.data?.viewer?.accounts?.[0];
      workers = {
        ...summarizeWorkersUsage(workerAccount?.workersInvocationsAdaptive || [], monitoring.workers),
        available: true,
        date,
        scriptName: workerName
      };
    }
  } catch (error) {
    console.warn("cloudflare_workers_usage_failed", error?.message || error);
  }

  let r2 = { available: false };
  try {
    const [r2Response, bandwidthResponse] = await Promise.all([
      fetch(CLOUDFLARE_GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: R2_USAGE_QUERY,
          variables: { accountTag, start: usagePeriodStart, end: endTime }
        })
      }),
      fetch(CLOUDFLARE_GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: R2_BANDWIDTH_QUERY,
          variables: { accountTag, start: usagePeriodStart, end: endTime }
        })
      })
    ]);
    const r2Payload = await r2Response.json().catch(() => null);
    const bandwidthPayload = await bandwidthResponse.json().catch(() => null);
    if (r2Response.ok && !Array.isArray(r2Payload?.errors)) {
      const r2Account = r2Payload?.data?.viewer?.accounts?.[0];
      const bandwidthAccount = bandwidthPayload?.data?.viewer?.accounts?.[0];
      r2 = {
        ...summarizeR2Usage(
          r2Account?.r2OperationsAdaptiveGroups || [],
          r2Account?.r2StorageAdaptiveGroups || [],
          bandwidthAccount?.r2BandwidthUsageAdaptiveGroups || []
        ),
        available: true,
        bandwidthAvailable: bandwidthResponse.ok && !Array.isArray(bandwidthPayload?.errors),
        monthStart: usagePeriodStart,
        bucket: String(env.CLOUDFLARE_R2_BUCKET_NAME || "eagleeye-archive")
      };
    }
  } catch (error) {
    console.warn("cloudflare_r2_usage_failed", error?.message || error);
  }

  if (r2.available) {
    r2.storagePercent = percent(r2.storageBytes, monitoring.r2.storageBytes);
    r2.classAPercent = percent(r2.classAOperations, monitoring.r2.classAOperationsPerMonth);
    r2.classBPercent = percent(r2.classBOperations, monitoring.r2.classBOperationsPerMonth);
    r2.storageState = resourceState(r2.storagePercent);
    r2.classAState = resourceState(r2.classAPercent);
    r2.classBState = resourceState(r2.classBPercent);
  }

  const databaseSizeBytes = maxStorage(account.d1StorageAdaptiveGroups || [], databaseId);
  const rowsReadPercent = percent(databaseMetrics.rowsRead, monitoring.d1.rowsRead);
  const rowsWrittenPercent = percent(databaseMetrics.rowsWritten, monitoring.d1.rowsWritten);
  const storagePercent = percent(databaseSizeBytes, monitoring.d1.storageBytes);

  // $5 Paid枠の「超過率」は、EagleEyeの90%安全監視ラインではなく、
  // Cloudflareの実際の月間込み枠を基準に算出する。
  // D1 / Workers の実測・推定課金対象を合算し、基本料金$5を超える
  // 推定超過額が$5に対して何%かを表示する。
  const d1WriteOverage = Math.max(0, databaseMetrics.rowsWritten - D1_PAID_INCLUDED.rowsWritten);
  const d1ReadOverage = Math.max(0, databaseMetrics.rowsRead - D1_PAID_INCLUDED.rowsRead);
  const d1StorageOverageBytes = Math.max(0, databaseSizeBytes - D1_PAID_INCLUDED.storageBytes);
  const workerRequestOverage = workers.available && WORKERS_PAID_INCLUDED.requestsPerMonth
    ? Math.max(0, workers.requests - WORKERS_PAID_INCLUDED.requestsPerMonth)
    : 0;
  const workerCpuOverage = workers.available && WORKERS_PAID_INCLUDED.cpuTimeMsPerMonth && Number.isFinite(workers.cpuTimeMs)
    ? Math.max(0, workers.cpuTimeMs - WORKERS_PAID_INCLUDED.cpuTimeMsPerMonth)
    : 0;
  const estimatedOverageUsd = paidMode
    ? (d1ReadOverage / 1_000_000) * 0.001
      + (d1WriteOverage / 1_000_000) * 1
      + (d1StorageOverageBytes / (1024 ** 3)) * 0.75
      + (workerRequestOverage / 1_000_000) * 0.30
      + (workerCpuOverage / 1_000_000) * 0.02
    : 0;
  // PAID_5USDの「全体使用率」は、個別リソースの最大使用率ではなく、
  // $5/月の基本枠を超えて発生する推定超過額を$5に対する割合として表示する。
  // CPU P50など単一指標が「$5枠を50%使った」と誤認させない。
  const estimatedMonthlyCostUsd = monitoring.budgetUsd + estimatedOverageUsd;
  const budgetUtilizationPercent = paidMode && monitoring.budgetUsd > 0
    ? Math.max(0, (estimatedOverageUsd / monitoring.budgetUsd) * 100)
    : null;
  const budgetState = paidMode
    ? resourceState(budgetUtilizationPercent)
    : "UNKNOWN";
  const resourceStates = [
    resourceState(rowsReadPercent),
    resourceState(rowsWrittenPercent),
    resourceState(storagePercent),
    workers.available ? resourceState(workers.requestsPercent) : "UNKNOWN",
    r2.available ? resourceState(r2.classAPercent) : "UNKNOWN",
    r2.available ? resourceState(r2.classBPercent) : "UNKNOWN",
    r2.available ? resourceState(r2.storagePercent) : "UNKNOWN",
    paidMode && !billingCycle.available ? "WARNING" : "OK"
  ];
  const status = resourceStates.includes("EXHAUSTED") ? "EXHAUSTED"
    : resourceStates.includes("CRITICAL") ? "CRITICAL"
    : resourceStates.includes("WARNING") ? "WARNING"
    : "OK";

  return {
    configured: true,
    status,
    source: "Cloudflare GraphQL Analytics API + Billing API",
    date,
    retrievedAt: new Date().toISOString(),
    note: "Cloudflare Analyticsの集計値です。最新値の反映には遅延が発生する場合があります。",
    usagePeriod: {
      start: usagePeriodStart,
      end: paidMode && billingCycle.available ? billingCycle.cycleEnd : endTime,
      basis: paidMode
        ? (billingCycle.available ? "CLOUDFLARE_BILLING_CYCLE" : "CALENDAR_MONTH_FALLBACK_BILLING_UNAVAILABLE")
        : "UTC_DAY",
      billingCycle
    },
    monitoring: {
      profile: monitoring.key,
      label: monitoring.label,
      budgetUsd: monitoring.budgetUsd,
      safetyFactor: monitoring.safetyFactor,
      period: monitoring.period,
      periodStart: usagePeriodStart,
      periodEnd: paidMode && billingCycle.available ? billingCycle.cycleEnd : endTime,
      periodBasis: paidMode
        ? (billingCycle.available ? "CLOUDFLARE_BILLING_CYCLE" : "CALENDAR_MONTH_FALLBACK_BILLING_UNAVAILABLE")
        : "UTC_DAY",
      billingCycle: {
        available: Boolean(billingCycle.available),
        state: billingCycle.state || null,
        subscriptionId: billingCycle.subscriptionId || null,
        anchorTimestamp: billingCycle.anchorTimestamp || null,
        cycleStart: billingCycle.cycleStart || null,
        cycleEnd: billingCycle.cycleEnd || null,
        billingDayUtc: billingCycle.billingDayUtc ?? null,
        message: billingCycle.message || null
      },
      budgetUtilizationPercent,
      budgetState,
      estimatedOverageUsd,
      estimatedMonthlyCostUsd,
      usdJpyRate: monitoring.usdJpyRate,
      estimatedMonthlyCostJpy: Math.round(estimatedMonthlyCostUsd * monitoring.usdJpyRate),
      estimatedOverageJpy: Math.round(estimatedOverageUsd * monitoring.usdJpyRate),
      costEstimateBasis: paidMode
        ? "D1 rows + Workers requests/CPUの請求単価による推計。Cloudflare請求額そのものではなく、R2無料枠は含めない。"
        : "Free profile: billable cost estimate is not applicable.",
      d1: monitoring.d1,
      workers: monitoring.workers,
      r2: monitoring.r2
    },
    limits: {
      d1: monitoring.d1,
      workers: monitoring.workers,
      r2: monitoring.r2
    },
    account: {
      rowsRead: databaseMetrics.rowsRead,
      rowsWritten: databaseMetrics.rowsWritten,
      readQueries: databaseMetrics.readQueries,
      writeQueries: databaseMetrics.writeQueries,
      rowsReadPercent,
      rowsWrittenPercent,
      rowsReadState: resourceState(rowsReadPercent),
      rowsWrittenState: resourceState(rowsWrittenPercent)
    },
    database: {
      databaseId,
      rowsRead: databaseMetrics.rowsRead,
      rowsWritten: databaseMetrics.rowsWritten,
      readQueries: databaseMetrics.readQueries,
      writeQueries: databaseMetrics.writeQueries,
      databaseSizeBytes,
      storagePercent,
      storageState: resourceState(storagePercent)
    },
    queryInsights,
    workers,
    r2
  };
}

export function cloudflareUsageLabel(status) {
  return {
    OK: { label: "正常", tone: "good", icon: "✓" },
    WARNING: { label: "警告", tone: "warn", icon: "!" },
    CRITICAL: { label: "危険", tone: "bad", icon: "!" },
    EXHAUSTED: { label: "上限到達", tone: "bad", icon: "!" },
    UNCONFIGURED: { label: "未設定", tone: "neutral", icon: "—" },
    UNKNOWN: { label: "未確認", tone: "neutral", icon: "—" }
  }[status] || { label: "未確認", tone: "neutral", icon: "—" };
}
