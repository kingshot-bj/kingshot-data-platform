const CLOUDFLARE_GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";

const D1_FREE_LIMITS = {
  rowsRead: 5_000_000,
  rowsWritten: 100_000,
  storageBytes: 5_000_000_000
};


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
  const rules = [
    ["Ranking Snapshot", ["RANKING_SNAPSHOTS", "PLAYER_RANK_SNAPSHOTS"]],
    ["Player Observation", ["API_OBSERVATIONS", "PLAYER_OBSERVATIONS"]],
    ["Player Snapshot", ["PLAYER_SNAPSHOTS"]],
    ["API Pool", ["API_POOL"]],
    ["Diagnostics", ["DIAGNOSTIC_EVENTS"]],
    ["Watchlist Job", ["KINGDOM_WATCHLIST_JOBS", "KINGDOM_WATCHLIST_LOCKS", "KINGDOM_WATCHLISTS"]],
    ["Change Event", ["CHANGE_EVENTS", "CHANGE_EVENT"]],
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
        category: classifyD1Query(query)
      };
    })
    .filter(item => item.query);

  queries.sort((a, b) => b.rowsWritten - a.rowsWritten);

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
    topWriteQueries: queries.slice(0, 10),
    categories: [...categories.values()].sort((a, b) => b.rowsWritten - a.rowsWritten)
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

export async function getCloudflareD1Usage(env, { now = new Date() } = {}) {
  const accountTag = String(env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const token = String(env.CLOUDFLARE_ANALYTICS_TOKEN || "").trim();
  const databaseId = String(env.CLOUDFLARE_D1_DATABASE_ID || "").trim();

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
        end: date,
        databaseId
      }
    })
  });

  const payload = await response.json().catch(() => null);  if (!response.ok) {
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
  const databaseMetrics = sumMetrics(analyticsGroups);

  let queryInsights = { queryCount: 0, topWriteQueries: [], categories: [], available: false };
  try {
    const insightsResponse = await fetch(CLOUDFLARE_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query: D1_QUERY_INSIGHTS_QUERY,
        variables: { accountTag, start: date, end: date, databaseId }
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
  const databaseSizeBytes = maxStorage(storageGroups, databaseId);

  const rowsReadPercent = percent(databaseMetrics.rowsRead, D1_FREE_LIMITS.rowsRead);
  const rowsWrittenPercent = percent(databaseMetrics.rowsWritten, D1_FREE_LIMITS.rowsWritten);
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
      rowsRead: databaseMetrics.rowsRead,
      rowsWritten: databaseMetrics.rowsWritten,
      readQueries: databaseMetrics.readQueries,
      writeQueries: databaseMetrics.writeQueries,
      rowsReadPercent,
      rowsWrittenPercent,
      rowsReadState: resourceState(rowsReadPercent),
      rowsWrittenState: resourceState(rowsWrittenPercent)
    },
    queryInsights,
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
