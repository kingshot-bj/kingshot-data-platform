import { sendDiscordNotification } from "./discord-support.js";
import { recordSystemEvent, systemTraceId } from "./system-log.js";

export async function runKingdomDiscordNotifications(env, {
  lookbackSeconds = 600,
  maxEvents = 20
} = {}) {
  const db = env?.DB;
  const channelId = String(env?.DISCORD_NOTIFICATION_CHANNEL_ID || "").trim();
  if (!db || !channelId) return { enabled: false, sent: 0, skipped: 0 };
  const now = Math.floor(Date.now() / 1000);
  const since = now - Math.max(60, Number(lookbackSeconds) || 600);
  const rows = await db.prepare(
    "SELECT event_id,target_type,target_id,change_type,field_name,old_value_json,new_value_json,detected_at FROM change_events WHERE detected_at >= ? ORDER BY detected_at ASC LIMIT ?"
  ).bind(since, Math.min(50, Math.max(1, Number(maxEvents) || 20))).all();
  let sent = 0;
  let skipped = 0;
  for (const row of rows.results || []) {
    const key = "CHANGE_EVENT:" + String(row.event_id);
    const state = await db.prepare("SELECT last_event_at FROM discord_notification_state WHERE notification_key = ? LIMIT 1").bind(key).first();
    if (state) { skipped++; continue; }
    const text = [
      "EagleEye Watchlist / Change Event",
      String(row.change_type || "CHANGE"),
      String(row.target_type || "") + " " + String(row.target_id || ""),
      row.field_name ? "項目: " + String(row.field_name) : "",
      "検知: " + new Date(Number(row.detected_at || now) * 1000).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
    ].filter(Boolean).join("\n");
    try {
      await sendDiscordNotification(env, { channelId, content: text });
      await db.prepare(
        "INSERT INTO discord_notification_state(notification_key,last_event_at,updated_at) VALUES(?,?,?)"
      ).bind(key, Number(row.detected_at || now), now).run();
      sent++;
    } catch (error) {
      await recordSystemEvent(db, {
        traceId: systemTraceId("discord-notify"),
        eventType: "EXTERNAL_API",
        service: "discord_notification",
        feature: "watchlist_notification",
        operation: "SEND_CHANGE_EVENT",
        status: "FAILED",
        targetType: String(row.target_type || "CHANGE_EVENT"),
        targetId: String(row.target_id || row.event_id || ""),
        errorCode: String(error?.message || "DISCORD_NOTIFICATION_FAILED").split(":")[0],
        message: String(error?.message || error).slice(0, 1000)
      }).catch(() => {});
    }
  }
  if (sent || rows.results?.length) {
    await recordSystemEvent(db, {
      traceId: systemTraceId("discord-notify"),
      eventType: "COMPLETE",
      service: "discord_notification",
      feature: "watchlist_notification",
      operation: "DELIVER_CHANGE_EVENTS",
      status: "SUCCESS",
      metadata: { candidates: rows.results?.length || 0, sent, skipped }
    }).catch(() => {});
  }
  return { enabled: true, sent, skipped, candidates: rows.results?.length || 0 };
}
