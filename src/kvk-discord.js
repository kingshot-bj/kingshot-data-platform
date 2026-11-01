// KvK notifications in the EagleEye Support Discord server.
//
// One parent text channel (#kvk-通知) holds a private thread per kingdom that
// has EagleEye users. Only users who registered a governor in that kingdom are
// added to its thread (invitable=false, so members cannot invite others), and
// the support role can see every thread. The parent channel denies posting in
// threads for @everyone, so threads are notification-only for now.
//
// Messages are queued in kvk_discord_outbox by the KvK collector and sent here
// in small batches, so Discord rate limits or outages never block collection.

import { discordApiRequest } from "./discord-support.js";
import { recordDiagnostic } from "./diagnostics.js";

export const KVK_PARENT_CHANNEL_NAME = "kvk-通知";
export const KVK_DISCORD_MAX_CALLS_PER_RUN = 12;
export const KVK_THREAD_SYNC_INTERVAL_SECONDS = 30 * 60;
export const KVK_OUTBOX_MAX_AGE_SECONDS = 24 * 3600;
// A user Discord refuses to add (e.g. 50001: not in the server) is retried after this long.
export const KVK_MEMBER_RETRY_SECONDS = 6 * 3600;

// Discord permission bits.
const P = {
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  READ_MESSAGE_HISTORY: 1n << 16n,
  MANAGE_THREADS: 1n << 34n,
  CREATE_PUBLIC_THREADS: 1n << 35n,
  CREATE_PRIVATE_THREADS: 1n << 36n,
  SEND_MESSAGES_IN_THREADS: 1n << 38n
};
const bits = (...list) => list.reduce((a, b) => a | b, 0n).toString();

export function kvkParentOverwrites({ guildId, supportRoleId, botUserId }) {
  const list = [
    // Everyone can open the parent (needed to see threads they were added to) but cannot post or create threads.
    { id: guildId, type: 0, allow: bits(P.VIEW_CHANNEL, P.READ_MESSAGE_HISTORY), deny: bits(P.SEND_MESSAGES, P.SEND_MESSAGES_IN_THREADS, P.CREATE_PUBLIC_THREADS, P.CREATE_PRIVATE_THREADS) },
    { id: botUserId, type: 1, allow: bits(P.VIEW_CHANNEL, P.SEND_MESSAGES, P.READ_MESSAGE_HISTORY, P.SEND_MESSAGES_IN_THREADS, P.CREATE_PRIVATE_THREADS, P.MANAGE_THREADS), deny: "0" }
  ];
  // Operators see every private thread through Manage Threads.
  if (supportRoleId) list.push({ id: supportRoleId, type: 0, allow: bits(P.VIEW_CHANNEL, P.READ_MESSAGE_HISTORY, P.MANAGE_THREADS, P.SEND_MESSAGES_IN_THREADS), deny: "0" });
  return list;
}

function normalizeId(value) {
  const id = String(value ?? "").trim();
  return /^\d{15,25}$/.test(id) ? id : "";
}

let discordSchemaPromise = null;
export function resetKvkDiscordSchemaCache() { discordSchemaPromise = null; }

export async function ensureKvkDiscordSchema(db) {
  if (!discordSchemaPromise) discordSchemaPromise = createKvkDiscordSchema(db).catch(error => { discordSchemaPromise = null; throw error; });
  return discordSchemaPromise;
}

async function createKvkDiscordSchema(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS kvk_state (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER NOT NULL)").run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS kvk_discord_threads (
    kid INTEGER PRIMARY KEY, thread_id TEXT NOT NULL, created_at INTEGER NOT NULL, member_sync_at INTEGER)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS kvk_discord_members (
    kid INTEGER NOT NULL, discord_id TEXT NOT NULL, added_at INTEGER NOT NULL, PRIMARY KEY (kid, discord_id))`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS kvk_discord_outbox (
    message_key TEXT PRIMARY KEY, kid INTEGER NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL, sent_at INTEGER, status TEXT)`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_kvk_discord_outbox_pending ON kvk_discord_outbox(sent_at, created_at)").run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS kvk_discord_member_skips (
    kid INTEGER NOT NULL, discord_id TEXT NOT NULL, retry_after INTEGER NOT NULL, error_code INTEGER, PRIMARY KEY (kid, discord_id))`).run();
}

function compactScore(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  return a >= 1e9 ? (n / 1e9).toFixed(2) + "B" : a >= 1e6 ? (n / 1e6).toFixed(1) + "M" : a >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n);
}
const ended = d => String(d?.status || "").toLowerCase() === "ended";

// Notifications implied by a change of one kingdom's score.
export function kvkPublicOrigin(env) {
  try { return new URL(String(env?.DISCORD_REDIRECT_URI || "")).origin; } catch { return ""; }
}
const link = (origin, kid) => origin ? `\n${origin}/kvk?kid=${kid}` : "";

export function buildKvkScoreNotifications(kid, previous, current, now, origin = "") {
  const out = [];
  // No earlier data for this kingdom (first fetch after deploy): stay quiet instead of replaying old days.
  if (!previous || !current || current.season == null) return out;
  const season = Number(current.season);
  const opp = current.opponent ?? "—";
  const sameSeason = previous && Number(previous.season) === season;
  const prevDays = sameSeason && Array.isArray(previous.days) ? previous.days : [];
  for (const day of current.days || []) {
    if (!ended(day)) continue;
    const before = prevDays.find(d => Number(d.day) === Number(day.day));
    // Only a transition we observed (or a first sighting while the season is running) produces a message.
    if (before ? ended(before) : !sameSeason) continue;
    const a = Number(day.kingdom_score), b = Number(day.opponent_score);
    const verdict = a > b ? "勝利 🎉" : a < b ? "敗北" : "引き分け";
    out.push({ key: `KVK:DAY:${season}:${kid}:${day.day}`, kid, content: `**KvK ${day.name || "Day " + day.day} の結果**（シーズン${season}）\n王国${kid} ${compactScore(a)} vs 王国${opp} ${compactScore(b)} → **${verdict}**`+link(origin, kid) });
  }
  const running = (current.days || []).some(d => !ended(d));
  if (sameSeason && running) {
    const lead = (s, o) => { const x = Number(s), y = Number(o); return Number.isFinite(x) && Number.isFinite(y) && (x || y) ? Math.sign(x - y) : 0; };
    const was = lead(previous.score, previous.opponent_score), is = lead(current.score, current.opponent_score);
    if (was && is && was !== is) {
      out.push({ key: `KVK:LEAD:${season}:${kid}:${now}`, kid, content: `**KvK 優勢が入れ替わりました**（シーズン${season}）\n王国${kid} ${compactScore(current.score)} vs 王国${opp} ${compactScore(current.opponent_score)} → 王国${kid}が**${is > 0 ? "優勢" : "劣勢"}**に`+link(origin, kid) });
    }
  }
  return out;
}

export function buildKvkMatchupNotifications(season, stage, matchups, kingdoms, origin = "") {
  // Each pair is listed once (A -> B), so look a kingdom up on both sides.
  const out = [];
  for (const kid of new Set(kingdoms.map(Number))) {
    const asLeft = matchups.find(m => Number(m.kid) === kid);
    const asRight = asLeft ? null : matchups.find(m => m.opponent != null && Number(m.opponent) === kid);
    if (!asLeft && !asRight) continue;
    const opponent = asLeft ? asLeft.opponent : asRight.kid;
    const opponentName = asLeft ? asLeft.opponent_name : asRight.kingdom_name;
    out.push({
      key: `KVK:MATCHUP:${season}:${kid}`,
      kid,
      content: opponent == null
        ? `**KvK シーズン${season} の組み合わせ**\n王国${kid} は今回は対戦なし（不戦）です。`
        : `**KvK シーズン${season} の組み合わせが発表されました**\n王国${kid} vs 王国${opponent}${opponentName ? "（" + opponentName + "）" : ""}`+link(origin, kid)
    });
  }
  return out;
}

export async function enqueueKvkNotifications(db, items, now) {
  if (!items.length) return 0;
  await ensureKvkDiscordSchema(db);
  const statements = items.map(item => db.prepare("INSERT OR IGNORE INTO kvk_discord_outbox (message_key, kid, content, created_at) VALUES (?, ?, ?, ?)").bind(item.key, item.kid, item.content, now));
  for (let i = 0; i < statements.length; i += 50) await db.batch(statements.slice(i, i + 50));
  return items.length;
}

// A governor keeps its ID when it transfers, so the latest observed kingdom
// (players.kid) wins over the kingdom recorded at registration.
export const KVK_CURRENT_KINGDOM_SQL = "CAST(COALESCE(p.kid, l.kingdom_id) AS INTEGER)";
export const KVK_LINKS_FROM_SQL = "user_player_links l LEFT JOIN players p ON p.governor_id = l.governor_id";

// Kingdom -> Discord ids of active EagleEye users whose governor is currently there.
async function desiredMembers(db) {
  const rows = (await db.prepare(
    `SELECT DISTINCT ${KVK_CURRENT_KINGDOM_SQL} AS kid, u.discord_id
     FROM ${KVK_LINKS_FROM_SQL} JOIN users u ON u.user_id = l.user_id
     WHERE l.status = 'ACTIVE' AND COALESCE(p.kid, l.kingdom_id) IS NOT NULL AND u.status = 'ACTIVE' AND u.discord_id IS NOT NULL`
  ).all()).results || [];
  const map = new Map();
  for (const r of rows) {
    const id = normalizeId(r.discord_id);
    if (!id) continue;
    const kid = Number(r.kid);
    if (!map.has(kid)) map.set(kid, new Set());
    map.get(kid).add(id);
  }
  return map;
}

async function getParentChannelId(db, env, request, guildId, budget) {
  const row = await db.prepare("SELECT value FROM kvk_state WHERE key = 'discord_parent'").first();
  const saved = row?.value ? JSON.parse(row.value)?.channelId : null;
  if (saved) return saved;
  budget.calls++;
  const channels = await request(env, `/guilds/${guildId}/channels`);
  let channel = (channels || []).find(c => c.type === 0 && c.name === KVK_PARENT_CHANNEL_NAME);
  if (!channel) {
    budget.calls++;
    channel = await request(env, `/guilds/${guildId}/channels`, {
      method: "POST",
      body: JSON.stringify({
        name: KVK_PARENT_CHANNEL_NAME, type: 0,
        topic: "EagleEyeのKvK通知。自分の王国（EagleEyeに登録した領主ID）のスレッドだけが表示されます。",
        permission_overwrites: kvkParentOverwrites({ guildId, supportRoleId: normalizeId(env.DISCORD_SUPPORT_ROLE_ID), botUserId: normalizeId(env.DISCORD_CLIENT_ID) })
      })
    });
  }
  const now = Math.floor(Date.now() / 1000);
  await db.prepare("INSERT INTO kvk_state (key, value, updated_at) VALUES ('discord_parent', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(JSON.stringify({ channelId: channel.id }), now).run();
  return channel.id;
}

export async function runKvkDiscordSync(env, { now = Math.floor(Date.now() / 1000), request = discordApiRequest, maxCalls = KVK_DISCORD_MAX_CALLS_PER_RUN } = {}) {
  const db = env?.DB;
  const guildId = normalizeId(env?.DISCORD_SUPPORT_GUILD_ID);
  if (!db || !guildId || !env?.DISCORD_BOT_TOKEN || !normalizeId(env?.DISCORD_CLIENT_ID)) return { enabled: false };
  await ensureKvkDiscordSchema(db);
  const budget = { calls: 0 };
  const summary = { enabled: true, created: 0, added: 0, removed: 0, sent: 0, dropped: 0, errors: [] };
  const note = (error, where) => {
    if (summary.errors.length < 20) summary.errors.push({ where, status: Number(error?.status || 0) || null, code: error?.discord?.code ?? null, message: String(error?.message || error).slice(0, 120) });
  };
  // Only a rate limit or a channel-level permission problem stops the whole run.
  const stop = (error, where) => {
    note(error, where);
    return Number(error?.status) === 429 || (where !== "add_member" && where !== "remove_member" && Number(error?.discord?.code) === 50013);
  };

  try {
    const parentId = await getParentChannelId(db, env, request, guildId, budget);
    const desired = await desiredMembers(db);
    const threads = new Map(((await db.prepare("SELECT kid, thread_id, member_sync_at FROM kvk_discord_threads").all()).results || []).map(r => [Number(r.kid), r]));

    // 1) Threads for kingdoms that have users, oldest sync first.
    // Kingdoms with users, plus existing threads whose users all left (their members must be removed).
    const order = [...new Set([...desired.keys(), ...threads.keys()])].sort((a, b) => Number(threads.get(a)?.member_sync_at || 0) - Number(threads.get(b)?.member_sync_at || 0));
    for (const kid of order) {
      if (budget.calls >= maxCalls) break;
      let thread = threads.get(kid);
      if (thread && now - Number(thread.member_sync_at || 0) < KVK_THREAD_SYNC_INTERVAL_SECONDS) continue;
      if (!thread && !desired.has(kid)) continue;
      if (!thread) {
        budget.calls++;
        const created = await request(env, `/channels/${parentId}/threads`, { method: "POST", body: JSON.stringify({ name: `王国 ${kid}`, type: 12, invitable: false, auto_archive_duration: 10080 }) });
        await db.prepare("INSERT INTO kvk_discord_threads (kid, thread_id, created_at) VALUES (?, ?, ?) ON CONFLICT(kid) DO UPDATE SET thread_id = excluded.thread_id").bind(kid, created.id, now).run();
        thread = { kid, thread_id: created.id };
        summary.created++;
      }
      const current = new Set(((await db.prepare("SELECT discord_id FROM kvk_discord_members WHERE kid = ?").bind(kid).all()).results || []).map(r => r.discord_id));
      const want = desired.get(kid) || new Set();
      const skipped = new Set(((await db.prepare("SELECT discord_id FROM kvk_discord_member_skips WHERE kid = ? AND retry_after > ?").bind(kid, now).all()).results || []).map(r => r.discord_id));
      let complete = true;
      for (const id of want) {
        if (current.has(id) || skipped.has(id)) continue;
        if (budget.calls >= maxCalls) { complete = false; break; }
        budget.calls++;
        try {
          await request(env, `/channels/${thread.thread_id}/thread-members/${id}`, { method: "PUT" });
          await db.prepare("INSERT OR IGNORE INTO kvk_discord_members (kid, discord_id, added_at) VALUES (?, ?, ?)").bind(kid, id, now).run();
          await db.prepare("DELETE FROM kvk_discord_member_skips WHERE kid = ? AND discord_id = ?").bind(kid, id).run();
          summary.added++;
        } catch (error) {
          if (Number(error?.status) === 429) { complete = false; stop(error, "add_member"); break; }
          // A user who cannot be added (e.g. 50001: not in the server yet) is skipped for a while
          // so the same failures do not use up every run; other users and kingdoms continue.
          summary.skippedMembers = (summary.skippedMembers || 0) + 1;
          note(error, "add_member");
          await db.prepare("INSERT INTO kvk_discord_member_skips (kid, discord_id, retry_after, error_code) VALUES (?, ?, ?, ?) ON CONFLICT(kid, discord_id) DO UPDATE SET retry_after = excluded.retry_after, error_code = excluded.error_code")
            .bind(kid, id, now + KVK_MEMBER_RETRY_SECONDS, Number(error?.discord?.code) || null).run();
        }
      }
      for (const id of current) {
        if (want.has(id)) continue;
        if (budget.calls >= maxCalls) { complete = false; break; }
        budget.calls++;
        try { await request(env, `/channels/${thread.thread_id}/thread-members/${id}`, { method: "DELETE" }); }
        catch (error) { if (Number(error?.status) !== 404 && stop(error, "remove_member")) throw error; }
        await db.prepare("DELETE FROM kvk_discord_members WHERE kid = ? AND discord_id = ?").bind(kid, id).run();
        summary.removed++;
      }
      if (complete) await db.prepare("UPDATE kvk_discord_threads SET member_sync_at = ? WHERE kid = ?").bind(now, kid).run();
      threads.set(kid, { ...thread, member_sync_at: complete ? now : thread.member_sync_at });
    }

    // 2) Outbox: drop stale messages and those for kingdoms without a thread, send the rest.
    await db.prepare("UPDATE kvk_discord_outbox SET sent_at = ?, status = 'DROPPED' WHERE sent_at IS NULL AND created_at < ?").bind(now, now - KVK_OUTBOX_MAX_AGE_SECONDS).run();
    const pending = (await db.prepare("SELECT message_key, kid, content FROM kvk_discord_outbox WHERE sent_at IS NULL ORDER BY created_at, message_key LIMIT 20").all()).results || [];
    for (const item of pending) {
      const thread = threads.get(Number(item.kid));
      if (!thread) {
        if (!desired.has(Number(item.kid))) {
          await db.prepare("UPDATE kvk_discord_outbox SET sent_at = ?, status = 'NO_THREAD' WHERE message_key = ?").bind(now, item.message_key).run();
          summary.dropped++;
        }
        continue;
      }
      if (budget.calls >= maxCalls) break;
      budget.calls++;
      await request(env, `/channels/${thread.thread_id}/messages`, { method: "POST", body: JSON.stringify({ content: String(item.content).slice(0, 2000), allowed_mentions: { parse: [] } }) });
      await db.prepare("UPDATE kvk_discord_outbox SET sent_at = ?, status = 'SENT' WHERE message_key = ?").bind(now, item.message_key).run();
      summary.sent++;
    }
  } catch (error) {
    note(error, "run");
  }
  summary.calls = budget.calls;
  if (summary.errors.length || summary.created || summary.added || summary.removed || summary.sent) {
    await recordDiagnostic(db, {
      service: "discord", feature: "kvk_threads", operation: "SYNC_KVK_THREADS",
      status: summary.errors.some(e => e.where === "run") ? "FAILED" : summary.errors.length ? "WARNING" : "SUCCESS",
      rowsSaved: summary.added + summary.sent,
      message: "KvKスレッドの同期: 作成" + summary.created + " / 追加" + summary.added + " / 削除" + summary.removed + " / 送信" + summary.sent + (summary.skippedMembers ? " / 追加できなかったユーザー" + summary.skippedMembers : ""),
      metadata: summary
    }).catch(() => {});
  }
  return summary;
}
