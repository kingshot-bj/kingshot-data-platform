// お知らせ ↔ Discord (EagleEye Support server).
//
// - Published announcements are posted to a read-only #お知らせ channel when
//   they become due (scheduled posts within one cron run of their time).
// - An ADMIN post waiting for approval sends a DM to every OWNER.
// - Approving / rejecting sends a DM to the author.
//
// DMs are queued in announcement_dm_queue and sent in small batches from the
// cron, so Discord outages never block posting on EagleEye.

import { discordApiRequest } from "./discord-support.js";
import { kvkPublicOrigin } from "./kvk-discord.js";
import { ensureBadgeSchema } from "./notification-badges.js";

export const ANNOUNCE_CHANNEL_NAME = "📢お知らせ";
const MAX_CALLS_PER_RUN = 8;

const P = { VIEW_CHANNEL: 1n << 10n, SEND_MESSAGES: 1n << 11n, READ_MESSAGE_HISTORY: 1n << 16n, SEND_MESSAGES_IN_THREADS: 1n << 38n, CREATE_PUBLIC_THREADS: 1n << 35n, CREATE_PRIVATE_THREADS: 1n << 36n, ADD_REACTIONS: 1n << 6n };
const bits = (...list) => list.reduce((a, b) => a | b, 0n).toString();
const normalizeId = value => { const id = String(value ?? "").trim(); return /^\d{15,25}$/.test(id) ? id : ""; };

export function announceChannelOverwrites({ guildId, botUserId, supportRoleId }) {
  const list = [
    // Everyone reads; only the bot posts.
    { id: guildId, type: 0, allow: bits(P.VIEW_CHANNEL, P.READ_MESSAGE_HISTORY, P.ADD_REACTIONS), deny: bits(P.SEND_MESSAGES, P.SEND_MESSAGES_IN_THREADS, P.CREATE_PUBLIC_THREADS, P.CREATE_PRIVATE_THREADS) },
    { id: botUserId, type: 1, allow: bits(P.VIEW_CHANNEL, P.SEND_MESSAGES, P.READ_MESSAGE_HISTORY), deny: "0" }
  ];
  if (supportRoleId) list.push({ id: supportRoleId, type: 0, allow: bits(P.VIEW_CHANNEL, P.READ_MESSAGE_HISTORY), deny: "0" });
  return list;
}

let schemaReady = null;
export function resetAnnouncementDiscordSchemaCache() { schemaReady = null; }
export async function ensureAnnouncementDiscordSchema(db) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await ensureBadgeSchema(db);
      await db.prepare("CREATE TABLE IF NOT EXISTS announcement_dm_queue (message_key TEXT PRIMARY KEY, discord_id TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL, sent_at INTEGER, status TEXT)").run();
      await db.prepare("CREATE TABLE IF NOT EXISTS announcement_discord_state (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER NOT NULL)").run();
      const info = await db.prepare("PRAGMA table_info(announcements)").all();
      const have = new Set((info?.results || []).map(c => c.name));
      if (!have.has("discord_posted_at")) {
        await db.prepare("ALTER TABLE announcements ADD COLUMN discord_posted_at INTEGER").run();
        // Announcements that already exist are not re-posted.
        await db.prepare("UPDATE announcements SET discord_posted_at = created_at WHERE discord_posted_at IS NULL AND status = 'PUBLISHED' AND COALESCE(publish_at, created_at) <= ?").bind(Math.floor(Date.now() / 1000)).run();
      }
    })().catch(error => { schemaReady = null; throw error; });
  }
  return schemaReady;
}

const fmt = at => new Date(Number(at) * 1000).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const clip = (text, n) => { const s = String(text || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

export function announcementChannelMessage(item, origin = "") {
  return `📢 **${clip(item.title, 120)}**\n${clip(item.body, 1600)}` + (origin ? `\n\n${origin}/news` : "");
}

async function displayName(db, discordId) {
  const row = await db.prepare("SELECT global_name, username FROM users WHERE discord_id = ? LIMIT 1").bind(String(discordId || "")).first().catch(() => null);
  return row?.global_name || row?.username || "ADMIN";
}

// Called right after an ADMIN creates a post (status PENDING).
export async function enqueueApprovalRequestDms(env, item, { now = Math.floor(Date.now() / 1000) } = {}) {
  const db = env?.DB;
  if (!db || item?.status !== "PENDING") return 0;
  await ensureAnnouncementDiscordSchema(db);
  const owners = (await db.prepare("SELECT discord_id FROM users WHERE role = 'OWNER' AND status = 'ACTIVE'").all())?.results || [];
  const origin = kvkPublicOrigin(env);
  const author = await displayName(db, item.created_by);
  const content = `📝 **お知らせの承認依頼**\n${author} さんが「${clip(item.title, 120)}」を投稿しました（公開予定 ${fmt(item.publish_at)}）。` + (origin ? `\n承認・却下: ${origin}/news` : "");
  let queued = 0;
  for (const o of owners) {
    if (!normalizeId(o.discord_id) || String(o.discord_id) === String(item.created_by)) continue;
    await db.prepare("INSERT OR IGNORE INTO announcement_dm_queue (message_key, discord_id, content, created_at) VALUES (?, ?, ?, ?)").bind(`approval:${item.id}:${o.discord_id}`, String(o.discord_id), content, now).run();
    queued++;
  }
  return queued;
}

// Called after OWNER approves / rejects; tells the author.
export async function enqueueReviewResultDm(env, id, approved, { now = Math.floor(Date.now() / 1000) } = {}) {
  const db = env?.DB;
  if (!db) return false;
  await ensureAnnouncementDiscordSchema(db);
  const item = await db.prepare("SELECT id, title, created_by, COALESCE(publish_at, created_at) AS publish_at FROM announcements WHERE id = ?").bind(String(id || "")).first();
  if (!item || !normalizeId(item.created_by)) return false;
  const origin = kvkPublicOrigin(env);
  const content = approved
    ? `✅ お知らせ「${clip(item.title, 120)}」が承認されました（公開 ${fmt(item.publish_at)}）。` + (origin ? `\n${origin}/news` : "")
    : `❌ お知らせ「${clip(item.title, 120)}」は却下されました。` + (origin ? `\n${origin}/news` : "");
  await db.prepare("INSERT OR IGNORE INTO announcement_dm_queue (message_key, discord_id, content, created_at) VALUES (?, ?, ?, ?)").bind(`review:${item.id}:${approved ? "ok" : "ng"}`, String(item.created_by), content, now).run();
  return true;
}

async function getAnnounceChannelId(db, env, request, guildId, budget) {
  const row = await db.prepare("SELECT value FROM announcement_discord_state WHERE key = 'channel'").first();
  const saved = row?.value ? JSON.parse(row.value)?.channelId : null;
  if (saved) return saved;
  budget.calls++;
  const channels = await request(env, `/guilds/${guildId}/channels`);
  let channel = (channels || []).find(c => c.type === 0 && c.name === ANNOUNCE_CHANNEL_NAME);
  if (!channel) {
    budget.calls++;
    channel = await request(env, `/guilds/${guildId}/channels`, {
      method: "POST",
      body: JSON.stringify({
        name: ANNOUNCE_CHANNEL_NAME, type: 0,
        topic: "EagleEyeからのお知らせ。投稿はEagleEyeのお知らせページから自動で流れます。",
        permission_overwrites: announceChannelOverwrites({ guildId, botUserId: normalizeId(env.DISCORD_CLIENT_ID), supportRoleId: normalizeId(env.DISCORD_SUPPORT_ROLE_ID) })
      })
    });
  }
  await db.prepare("INSERT INTO announcement_discord_state (key, value, updated_at) VALUES ('channel', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(JSON.stringify({ channelId: channel.id }), Math.floor(Date.now() / 1000)).run();
  return channel.id;
}

export async function runAnnouncementDiscordSync(env, { now = Math.floor(Date.now() / 1000), request = discordApiRequest, maxCalls = MAX_CALLS_PER_RUN } = {}) {
  const db = env?.DB;
  const guildId = normalizeId(env?.DISCORD_SUPPORT_GUILD_ID);
  if (!db || !guildId || !env?.DISCORD_BOT_TOKEN) return { skipped: true };
  await ensureAnnouncementDiscordSchema(db);
  const budget = { calls: 0 };
  const summary = { posted: 0, dms: 0, errors: [] };

  // 1) Due announcements → #お知らせ
  const due = (await db.prepare(
    "SELECT id, title, body FROM announcements WHERE status = 'PUBLISHED' AND discord_posted_at IS NULL AND COALESCE(publish_at, created_at) <= ? ORDER BY COALESCE(publish_at, created_at) LIMIT 3"
  ).bind(now).all())?.results || [];
  if (due.length) {
    try {
      const channelId = await getAnnounceChannelId(db, env, request, guildId, budget);
      const origin = kvkPublicOrigin(env);
      for (const item of due) {
        if (budget.calls + 1 > maxCalls) break;
        budget.calls++;
        await request(env, `/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify({ content: announcementChannelMessage(item, origin), allowed_mentions: { parse: [] } }) });
        await db.prepare("UPDATE announcements SET discord_posted_at = ? WHERE id = ?").bind(now, item.id).run();
        summary.posted++;
      }
    } catch (error) {
      summary.errors.push({ step: "channel", status: error?.status || null, code: error?.discord?.code || null });
      // A channel that was deleted on Discord is recreated next run.
      if (Number(error?.status) === 404) await db.prepare("DELETE FROM announcement_discord_state WHERE key = 'channel'").run().catch(() => {});
    }
  }

  // 2) DMs (approval requests / review results)
  const dms = (await db.prepare("SELECT message_key, discord_id, content FROM announcement_dm_queue WHERE sent_at IS NULL ORDER BY created_at LIMIT 5").all())?.results || [];
  for (const dm of dms) {
    if (budget.calls + 2 > maxCalls) break;
    let status = "SENT";
    try {
      budget.calls++;
      const channel = await request(env, "/users/@me/channels", { method: "POST", body: JSON.stringify({ recipient_id: dm.discord_id }) });
      budget.calls++;
      await request(env, `/channels/${channel.id}/messages`, { method: "POST", body: JSON.stringify({ content: dm.content, allowed_mentions: { parse: [] } }) });
      summary.dms++;
    } catch (error) {
      if (Number(error?.status) === 429) { summary.errors.push({ step: "dm", status: 429 }); break; }
      status = Number(error?.discord?.code) === 50007 ? "DM_CLOSED" : "FAILED";
      summary.errors.push({ step: "dm", status: error?.status || null, code: error?.discord?.code || null });
    }
    await db.prepare("UPDATE announcement_dm_queue SET sent_at = ?, status = ? WHERE message_key = ?").bind(now, status, dm.message_key).run();
  }
  return summary;
}
