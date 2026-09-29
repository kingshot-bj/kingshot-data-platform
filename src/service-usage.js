const SERVICE_USAGE_VERSION = 1;

export const SERVICE_USAGE_EVENTS = Object.freeze({
  PLAYER_SEARCH: "PLAYER_SEARCH",
  PLAYER_VIEW: "PLAYER_VIEW",
  PLAYER_REFRESH: "PLAYER_REFRESH",
  PLAYER_HISTORY_VIEW: "PLAYER_HISTORY_VIEW",
  PLAYER_CHANGES_VIEW: "PLAYER_CHANGES_VIEW",
  PLAYER_WATCHLIST_VIEW: "PLAYER_WATCHLIST_VIEW",
  PLAYER_WATCHLIST_ADD: "PLAYER_WATCHLIST_ADD",
  PLAYER_WATCHLIST_REMOVE: "PLAYER_WATCHLIST_REMOVE",
  KINGDOM_WATCHLIST_VIEW: "KINGDOM_WATCHLIST_VIEW",
  KINGDOM_WATCHLIST_ADD: "KINGDOM_WATCHLIST_ADD",
  KINGDOM_WATCHLIST_REMOVE: "KINGDOM_WATCHLIST_REMOVE",
  KINGDOM_WATCHLIST_REFRESH: "KINGDOM_WATCHLIST_REFRESH",
  KINGDOM_RANKING_VIEW: "KINGDOM_RANKING_VIEW",
  PLAYER_EXPORT: "PLAYER_EXPORT",
  KINGDOM_EXPORT: "KINGDOM_EXPORT"
});

const TARGET_TYPES = new Set(["PLAYER", "KINGDOM"]);

const METADATA_KEYS = Object.freeze({
  PLAYER_SEARCH: [
    "search_type", "result_count", "result_has_match", "selected_result", "direct_lookup"
  ],
  PLAYER_VIEW: [
    "source", "view_section", "kid", "power", "town_center_level", "vip", "alliance_aid",
    "alliance_abbr", "alliance_name", "alliance_rank", "kills", "x", "y", "online",
    "observed_at", "cached_at", "age_seconds"
  ],
  PLAYER_REFRESH: [
    "source", "refresh_reason", "previous_observed_at", "new_observed_at",
    "previous_source_observed_at", "new_source_observed_at", "upstream_fresh",
    "upstream_age_seconds", "kid", "power", "town_center_level", "vip", "alliance_aid",
    "alliance_abbr", "alliance_name", "alliance_rank", "kills", "x", "y", "online",
    "observed_at", "source_observed_at"
  ],
  PLAYER_HISTORY_VIEW: [
    "period", "limit", "history_type", "display_mode", "displayed_snapshot_count",
    "oldest_observed_at", "newest_observed_at"
  ],
  PLAYER_CHANGES_VIEW: [
    "period", "change_type", "field_name", "result_count", "change_categories"
  ],
  PLAYER_WATCHLIST_VIEW: [
    "watchlist_count", "enabled_count", "disabled_count", "max_limit", "remaining_slots",
    "sort", "filter", "page", "display_count"
  ],
  PLAYER_WATCHLIST_ADD: [
    "source", "watchlist_size_before", "watchlist_size_after", "watchlist_limit",
    "remaining_slots_after", "enabled", "kid", "nick_name", "power", "town_center_level",
    "vip", "alliance_aid", "alliance_abbr", "alliance_name", "alliance_rank", "kills",
    "x", "y", "observed_at", "source_observed_at", "hero_total_power",
    "hero_highest_level", "main_hero", "hero_equipment_summary", "gov_gear_power",
    "ranking"
  ],
  PLAYER_WATCHLIST_REMOVE: [
    "source", "watchlist_size_before", "watchlist_size_after", "watchlist_limit",
    "remaining_slots_after", "enabled", "watch_duration_seconds", "watch_duration_days"
  ],
  KINGDOM_WATCHLIST_VIEW: [
    "watchlist_count", "enabled_count", "top_n", "interval_hours", "page", "sort"
  ],
  KINGDOM_WATCHLIST_ADD: [
    "top_n", "interval_hours", "watchlist_size_before", "watchlist_size_after", "enabled"
  ],
  KINGDOM_WATCHLIST_REMOVE: [
    "top_n", "interval_hours", "watchlist_size_before", "watchlist_size_after", "enabled"
  ],
  KINGDOM_WATCHLIST_REFRESH: [
    "source", "refresh_scope", "top_n"
  ],
  KINGDOM_RANKING_VIEW: [
    "kid", "board", "limit", "page", "sort", "source", "observed_at",
    "source_observed_at", "display_count", "rank_range"
  ],
  PLAYER_EXPORT: [
    "format", "section", "row_count", "column_count", "target_player_count", "success"
  ],
  KINGDOM_EXPORT: [
    "format", "kid", "board", "limit", "row_count", "success"
  ]
});

function assertString(value, name) {
  if (value === null || value === undefined || value === "") {
    throw new Error(`SERVICE_USAGE: ${name} is required`);
  }
  return String(value);
}

function sanitizeMetadata(operation, metadata) {
  const allowed = METADATA_KEYS[operation];
  if (!allowed) throw new Error(`SERVICE_USAGE: unsupported operation ${operation}`);

  const source = metadata && typeof metadata === "object" ? metadata : {};
  const result = {};

  for (const key of allowed) {
    if (source[key] === undefined) continue;
    const value = source[key];

    // Keep metadata JSON-safe and bounded. Raw search text and arbitrary objects
    // are intentionally excluded by the allow-list above.
    if (typeof value === "string") {
      result[key] = value.length > 500 ? value.slice(0, 500) : value;
    } else if (
      value === null ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      Array.isArray(value) ||
      (typeof value === "object" && value !== null)
    ) {
      result[key] = value;
    }
  }

  return result;
}

export function createServiceUsageEvent({
  operation,
  actorUserId,
  targetType = null,
  targetId = null,
  metadata = {}
}) {
  const normalizedOperation = assertString(operation, "operation");

  if (!Object.prototype.hasOwnProperty.call(SERVICE_USAGE_EVENTS, normalizedOperation)) {
    throw new Error(`SERVICE_USAGE: unsupported operation ${normalizedOperation}`);
  }

  const normalizedActor = assertString(actorUserId, "actor_user_id");

  if (targetType !== null && !TARGET_TYPES.has(String(targetType))) {
    throw new Error(`SERVICE_USAGE: invalid target_type ${targetType}`);
  }

  if (targetType !== null && (targetId === null || targetId === undefined || targetId === "")) {
    throw new Error("SERVICE_USAGE: target_id is required when target_type is set");
  }

  const event = {
    schema_version: SERVICE_USAGE_VERSION,
    event_id: crypto.randomUUID(),
    occurred_at: new Date().toISOString(),
    actor_user_id: normalizedActor,
    feature: normalizedOperation.startsWith("PLAYER_") ? "PLAYER" : "KINGDOM",
    operation: normalizedOperation,
    target_type: targetType === null ? null : String(targetType),
    target_id: targetId === null || targetId === undefined ? null : String(targetId),
    metadata: sanitizeMetadata(normalizedOperation, metadata)
  };

  return Object.freeze(event);
}

export async function enqueueServiceUsage(env, event) {
  if (!event || typeof event !== "object") {
    throw new Error("SERVICE_USAGE: event is required");
  }

  const queue = env?.SERVICE_USAGE_QUEUE;
  if (!queue || typeof queue.send !== "function") {
    // Logging must never break the user's original operation.
    console.warn("service_usage_queue_unavailable", event.event_id);
    return { ok: false, queued: false, reason: "QUEUE_UNAVAILABLE", event_id: event.event_id };
  }

  try {
    await queue.send(event);
    return { ok: true, queued: true, event_id: event.event_id };
  } catch (error) {
    // SERVICE_USAGE is deliberately asynchronous. The originating user action
    // must not fail merely because usage logging is unavailable.
    console.error("service_usage_enqueue_failed", event.event_id, error?.message || error);
    return { ok: false, queued: false, reason: "QUEUE_SEND_FAILED", event_id: event.event_id };
  }
}

export async function recordServiceUsage(env, input) {
  const event = createServiceUsageEvent(input);
  const result = await enqueueServiceUsage(env, event);
  return { ...result, event };
}

export function getServiceUsageMetadataKeys(operation) {
  return [...(METADATA_KEYS[operation] || [])];
}
