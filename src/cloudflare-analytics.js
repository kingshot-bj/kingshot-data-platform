const CLOUDFLARE_GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";

const D1_FREE_LIMITS = {
  rowsRead: 5_000_000,
  rowsWritten: 100_000,
  storageBytes: 5_000_000_000
};

const D1_USAGE_QUERY = `
query EagleEyeD1Usage(
  $accountTag: string!
  $start: Date
  $end: Date
) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      d1AnalyticsAdaptiveGroups(
        limit: 10000
        filter: { date_geq: $start, date_leq: $end }
      ) {
        sum {
          readQueries
          writeQueries
          rowsRead
          rowsWritten
          queryBatchResponseBytes
          queryBatchTimeMs
        }
        dimensions {
          date
          databaseId
        }
      }
      d1StorageAdaptiveGroups(
        limit: 10000
        filter: { date_geq: $start, date_leq: $end }
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
    total.queryBatchResponseBytes += normalizeNumber(sum.queryBatchResponseBytes);
    total.queryBatchTimeMs += normalizeNumber(sum.queryBatchTimeMs);
    return total;
  }, {
    rowsRead: 0,
    rowsWritten: 0,
    readQueries: 0,
    writeQueries: 0,
    queryBatchResponseBytes: 0,
    queryBatchTimeMs: 0
  });
}

function filterDatabaseGroups(groups, databaseId) {
  if (!databaseId) return [];
  return (groups || []).filter(group => String(group?.dimensions?.databaseId || "") === String(databaseId));
}

function maxStorage(groups, databaseId) {
  return (groups || [])
    .filter(group => !databaseId || String(group?.dimensions?.databaseId || "") === String(databaseId))
    .reduce((max, group) => Math.max(max, normalizeNumber(group?.max?.databaseSizeBytes)), 0);
}

export async function getCloudflareD1Usage(env, { now = new Date() } = {}) {
  const accountTag = String(env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const token = String(env.CLOUDFLARE_ANALYTICS_TOKEN || "").trim();
  const databaseId = String(env.CLOUDFLARE_D1_DATABASE_ID || "").trim();

  if (!accountTag || !token) {
    return {
      configured: false,
      status: "UNCONFIGURED",
      message: "Cloudflare Analytics APIの認証情報が未設定です。"
    };
  }

  const date = utcDateString(now);
  const response = await fetch(CLOUDFLARE_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query: D1_USAGE_QUERY,
      variables: {
        accountTag,
        start: date,
        end: date
      }
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error("Cloudflare Analytics API HTTP " + response.status);
  }
  if (Array.isArray(payload?.errors) && payload.errors.length) {
    const message = payload.errors.map(item => item?.message).filter(Boolean).join("; ");
    throw new Error(message || "Cloudflare Analytics GraphQL error");
  }

  const account = payload?.data?.viewer?.accounts?.[0];
  if (!account) {
    throw new Error("Cloudflare Analytics API returned no account data");
  }

  const analyticsGroups = account.d1AnalyticsAdaptiveGroups || [];
  const storageGroups = account.d1StorageAdaptiveGroups || [];
  const accountMetrics = sumMetrics(analyticsGroups);
  const databaseMetrics = sumMetrics(filterDatabaseGroups(analyticsGroups, databaseId));
  const databaseSizeBytes = maxStorage(storageGroups, databaseId);

  const rowsReadPercent = percent(accountMetrics.rowsRead, D1_FREE_LIMITS.rowsRead);
  const rowsWrittenPercent = percent(accountMetrics.rowsWritten, D1_FREE_LIMITS.rowsWritten);
  const storagePercent = percent(databaseSizeBytes, D1_FREE_LIMITS.storageBytes);
  const states = [resourceState(rowsReadPercent), resourceState(rowsWrittenPercent), resourceState(storagePercent)];

  return {
    configured: true,
    status: states.includes("EXHAUSTED") ? "EXHAUSTED"
      : states.includes("CRITICAL") ? "CRITICAL"
      : states.includes("WARNING") ? "WARNING"
      : "OK",
    source: "Cloudflare GraphQL Analytics API",
    date,
    retrievedAt: new Date().toISOString(),
    note: "Cloudflare Analyticsの集計値です。最新値の反映には遅延が発生する場合があります。",
    limits: D1_FREE_LIMITS,
    account: {
      rowsRead: accountMetrics.rowsRead,
      rowsWritten: accountMetrics.rowsWritten,
      readQueries: accountMetrics.readQueries,
      writeQueries: accountMetrics.writeQueries,
      queryBatchResponseBytes: accountMetrics.queryBatchResponseBytes,
      queryBatchTimeMs: accountMetrics.queryBatchTimeMs,
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
    }
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
