import { sendDiscordNotification } from "./discord-support.js";
import { recordSystemEvent, systemTraceId } from "./system-log.js";
import { recordDiagnostic } from "./diagnostics.js";

function eventIsWatchedSql() {
  return `(
    (ce.target_type = 'PLAYER' AND EXISTS (
      SELECT 1 FROM player_watchlists pw
      WHERE pw.governor_id = ce.target_id AND pw.enabled = 1
    ))
    OR
    (ce.target_type = 'ALLIANCE' AND EXISTS (
      SELECT 1 FROM kingdom_watchlists kw
      WHERE kw.enabled = 1
        AND kw.kid = CAST(substr(ce.target_id, 1, instr(ce.target_id, ':') - 1) AS INTEGER)
    ))
  )`;
}

export async function runKingdomDiscordNotifications(env, {
  lookbackSeconds = 600,
  maxEvents = 20
} = {}) {
  const db = env?.DB;
  const channelId = String(env?.DISCORD_NOTIFICATION_CHANNEL_ID || "").trim();
  if (!db || !channelId) return { enabled: false, sent: 0, skipped: 0 };

  const now = Math.floor(Date.now() / 1000);
  const since = now - Math.max(60, Number(lookbackSeconds) || 600);
  const limit = Math.min(50, Math.max(1, Number(maxEvents) || 20));
  const rows = await db.prepare(
    `SELECT ce.event_id,ce.target_type,ce.target_id,ce.change_type,ce.field_name,ce.old_value_json,ce.new_value_json,ce.detected_at
     FROM change_events ce
     WHERE ce.detected_at >= ?
       AND ${eventIsWatchedSql()}
     ORDER BY ce.detected_at ASC
     LIMIT ?`
  ).bind(since, limit).all();

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows.results || []) {
    const key = "CHANGE_EVENT:" + String(row.event_id);

    // Claim the event before sending so two overlapping cron invocations
    // cannot both send the same notification. If delivery fails, release
    // the claim so the next run can retry.
    const claim = await db.prepare(
      "INSERT OR IGNORE INTO discord_notification_state(notification_key,last_event_at,updated_at) VALUES(?,?,?)"
    ).bind(key, Number(row.detected_at || now), now).run();
    if (Number(claim?.meta?.changes || 0) !== 1) {
      skipped++;
      continue;
    }

    const text = [
      "EagleEye Watchlist / Change Event",
      String(row.change_type || "CHANGE"),
      String(row.target_type || "") + " " + String(row.target_id || ""),
      row.field_name ? "項目: " + String(row.field_name) : "",
      "検知: " + new Date(Number(row.detected_at || now) * 1000).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
    ].filter(Boolean).join("\n");

    try {
      await sendDiscordNotification(env, { channelId, content: text });
      sent++;
    } catch (error) {
      failed++;
      await db.prepare("DELETE FROM discord_notification_state WHERE notification_key = ?").bind(key).run().catch(() => {});
      await recordSystemEvent(db, {
        traceId: systemTraceId("discord-notify"),
        eventType: "EXTERNAL_API",
        service: "discord_notification",
        feature: "watchlist_notification",
        operation: "SEND_CHANGE_EVENT",
        status: "FAILED",
        targetType: String(row.target_type || "CHANGE_EVENT"),
        targetId: String(row.target_id || row.event_id || ""),
        errorCode: String(error?.code || error?.message || "DISCORD_NOTIFICATION_FAILED").split(":")[0],
        message: String(error?.message || error).slice(0, 1000)
      }).catch(() => {});
    }
  }

  await recordDiagnostic(db, {
    service: "notifications",
    feature: "watchlist_notification",
    operation: "DELIVER_CHANGE_EVENTS",
    status: failed ? "WARNING" : "SUCCESS",
    targetType: "CHANGE_EVENT",
    rowsReceived: rows.results?.length || 0,
    rowsSaved: sent,
    message: "Discord Change Event通知処理完了。",
    metadata: { sent, skipped, failed, candidates: rows.results?.length || 0 }
  }).catch(() => {});

  await recordSystemEvent(db, {
    traceId: systemTraceId("discord-notify"),
    eventType: "COMPLETE",
    service: "discord_notification",
    feature: "watchlist_notification",
    operation: "DELIVER_CHANGE_EVENTS",
    status: failed ? "WARNING" : "SUCCESS",
    metadata: { candidates: rows.results?.length || 0, sent, skipped, failed }
  }).catch(() => {});

  return { enabled: true, sent, skipped, failed, candidates: rows.results?.length || 0 };
}
