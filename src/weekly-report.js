// 週1回、自分の領主の1週間の変化を Discord の個チャで届ける（希望した人だけ・2026-11-17）。
// ・いつ：月曜の日本時間 11時台（5分ごとの cron の毎回・1回20人まで・1人ごとに1.5秒あける）。聖剣の通知（8〜10時）とずらす。
// ・中身：マイKingShot のメイン領主の、先週月曜〜日曜の変化（総力・役場・撃破数・同盟・同盟内の役職・VIP）。
//   データは保存済みの変化の記録（change_events）だけ。API Pool は使わない。変化が1つも無い週は送らない。
// ・止める・受け取る：/settings/notifications。受け取る人は自分で選ぶ（はじめは受け取らない）。
import { discordApiRequest } from "./discord-support.js";

export const WEEKLY_REPORT_MAX_DMS = 20;
export const WEEKLY_REPORT_GAP_MS = 1500;
export const WEEKLY_REPORT_JST_HOUR = 11;
const FIELDS = Object.freeze({ power: "総力", town_center_level: "役場", kills: "撃破数", alliance_name: "同盟", alliance_rank: "同盟内の役職", vip: "VIP" });

let ready = null;
export function resetWeeklyReportSchemaCache() { ready = null; }
export async function ensureWeeklyReportSchema(db) {
  if (!ready) {
    ready = db.batch([
      db.prepare("CREATE TABLE IF NOT EXISTS weekly_report_optin (user_id TEXT PRIMARY KEY, created_at INTEGER NOT NULL)"),
      db.prepare("CREATE TABLE IF NOT EXISTS weekly_report_log (week TEXT NOT NULL, user_id TEXT NOT NULL, sent_at INTEGER NOT NULL, status TEXT NOT NULL, PRIMARY KEY (week, user_id))")
    ]).catch(error => { ready = null; throw error; });
  }
  return ready;
}

// 先週の月曜 0:00〜今週の月曜 0:00（日本時間）。week は先週月曜の日付。
export function lastWeekRange(nowSec) {
  const jst = nowSec + 9 * 3600;
  const dayStart = jst - (jst % 86400);
  const dow = new Date(dayStart * 1000).getUTCDay(); // 0=日
  const thisMonday = dayStart - ((dow + 6) % 7) * 86400;
  const from = thisMonday - 7 * 86400;
  return { week: new Date(from * 1000).toISOString().slice(0, 10), from: from - 9 * 3600, to: thisMonday - 9 * 3600 };
}

export function isWeeklyTick(nowSec) {
  const jst = nowSec + 9 * 3600;
  return new Date(jst * 1000).getUTCDay() === 1 && Math.floor((jst % 86400) / 3600) === WEEKLY_REPORT_JST_HOUR;
}

const parse = v => { try { return JSON.parse(v); } catch { return v ?? null; } };
const short = n => { const x = Number(n); if (!Number.isFinite(x)) return String(n ?? "—"); const a = Math.abs(x); return a >= 1e9 ? (x / 1e9).toFixed(2) + "B" : a >= 1e6 ? (x / 1e6).toFixed(1) + "M" : a >= 1e3 ? (x / 1e3).toFixed(1) + "K" : String(x); };
const RANK = v => { const n = Number(v); return Number.isFinite(n) && n >= 1 && n <= 5 ? "R" + n : String(v ?? "—"); };

// 変化の記録（古い順）→ 項目ごとに「週のはじめ → 週の終わり」。
export function summarizeChanges(events) {
  const byField = new Map();
  for (const e of [...(events || [])].sort((a, b) => Number(a.detected_at) - Number(b.detected_at))) {
    if (!FIELDS[e.field_name]) continue;
    const cur = byField.get(e.field_name);
    if (cur) cur.to = parse(e.new_value_json); else byField.set(e.field_name, { field: e.field_name, from: parse(e.old_value_json), to: parse(e.new_value_json) });
  }
  return Object.keys(FIELDS).map(f => byField.get(f)).filter(c => c && String(c.from) !== String(c.to));
}

export function weeklyReportText({ name = "", kid = null, abbr = "", governorId = "", changes = [], range, origin = "https://eagleeye-ks.com" }) {
  const md = sec => { const d = new Date((sec + 9 * 3600) * 1000); return (d.getUTCMonth() + 1) + "/" + d.getUTCDate(); };
  const line = c => {
    const label = FIELDS[c.field];
    if (c.field === "power" || c.field === "kills") { const diff = Number(c.to) - Number(c.from); return `${label}：${short(c.from)} → **${short(c.to)}**${Number.isFinite(diff) ? `（${diff >= 0 ? "+" : ""}${short(diff)}）` : ""}`; }
    if (c.field === "alliance_rank") return `${label}：${RANK(c.from)} → **${RANK(c.to)}**`;
    if (c.field === "alliance_name") return `${label}：${c.from || "なし"} → **${c.to || "なし"}**`;
    return `${label}：${c.from ?? "—"} → **${c.to ?? "—"}**`;
  };
  const who = [name || "あなたの領主", kid ? `王国${kid}` : "", abbr].filter(Boolean).join("・");
  return `**📈 今週のあなたの領主（${md(range.from)}〜${md(range.to - 1)}）**\n${who}\n${changes.map(c => "・" + line(c)).join("\n")}\n\n詳しく：${origin}/player?governor_id=${encodeURIComponent(governorId)}\n受け取りをやめる：${origin}/settings/notifications`;
}

export async function runWeeklyReport(env, { nowMs = Date.now(), request = discordApiRequest, maxDms = WEEKLY_REPORT_MAX_DMS, gapMs = WEEKLY_REPORT_GAP_MS, sleep = ms => new Promise(r => setTimeout(r, ms)), force = false, origin = "https://eagleeye-ks.com" } = {}) {
  const db = env?.DB;
  if (!db) return { skipped: "NO_DB" };
  if (!env?.DISCORD_BOT_TOKEN) return { skipped: "NO_BOT_TOKEN" };
  const now = Math.floor(nowMs / 1000);
  if (!force && !isWeeklyTick(now)) return { skipped: "NOT_THIS_TICK" };
  await ensureWeeklyReportSchema(db);
  const range = lastWeekRange(now);
  // まだこの週の分を処理していない、受け取る人（メイン領主つき）
  const users = ((await db.prepare(
    "SELECT o.user_id, u.discord_id, (SELECT l.governor_id FROM user_player_links l WHERE l.user_id = o.user_id AND l.status = 'ACTIVE' ORDER BY CASE l.account_type WHEN 'MAIN' THEN 0 ELSE 1 END, l.created_at ASC LIMIT 1) AS governor_id " +
    "FROM weekly_report_optin o JOIN users u ON u.user_id = o.user_id LEFT JOIN weekly_report_log g ON g.week = ? AND g.user_id = o.user_id " +
    "WHERE u.status = 'ACTIVE' AND g.user_id IS NULL LIMIT ?"
  ).bind(range.week, maxDms).all().catch(() => ({ results: [] })))?.results || []);
  let sent = 0, quiet = 0, failed = 0, attempted = 0;
  for (const u of users) {
    let status = "SENT";
    if (!u.governor_id || !/^\d{5,25}$/.test(String(u.discord_id || ""))) status = "NO_TARGET";
    else {
      const events = (await db.prepare(
        "SELECT field_name, old_value_json, new_value_json, detected_at FROM change_events WHERE target_type = 'PLAYER' AND target_id = ? AND detected_at >= ? AND detected_at < ? ORDER BY detected_at ASC LIMIT 200"
      ).bind(String(u.governor_id), range.from, range.to).all().catch(() => ({ results: [] })))?.results || [];
      const changes = summarizeChanges(events);
      if (!changes.length) status = "NO_CHANGE";
      else {
        const p = await db.prepare("SELECT nick_name, kid, alliance_abbr FROM players WHERE governor_id = ?").bind(String(u.governor_id)).first().catch(() => null);
        if (attempted > 0 && gapMs > 0) await sleep(gapMs);
        attempted++;
        try {
          const channel = await request(env, "/users/@me/channels", { method: "POST", body: JSON.stringify({ recipient_id: String(u.discord_id) }) });
          await request(env, `/channels/${channel.id}/messages`, { method: "POST", body: JSON.stringify({ content: weeklyReportText({ name: p?.nick_name || "", kid: p?.kid, abbr: p?.alliance_abbr || "", governorId: u.governor_id, changes, range, origin }), allowed_mentions: { parse: [] } }) });
        } catch (error) {
          if (Number(error?.status) === 429) return { users: users.length, sent, quiet, failed, rateLimited: true };
          status = Number(error?.discord?.code) === 50007 ? "DM_CLOSED" : "FAILED";
        }
      }
    }
    if (status === "SENT") sent++; else if (status === "NO_CHANGE" || status === "NO_TARGET") quiet++; else failed++;
    await db.prepare("INSERT INTO weekly_report_log (week, user_id, sent_at, status) VALUES (?, ?, ?, ?) ON CONFLICT(week, user_id) DO NOTHING").bind(range.week, String(u.user_id), now, status).run().catch(() => {});
  }
  return { week: range.week, users: users.length, sent, quiet, failed };
}

export async function isWeeklyReportOn(db, userId) {
  await ensureWeeklyReportSchema(db);
  return Boolean(await db.prepare("SELECT 1 AS x FROM weekly_report_optin WHERE user_id = ?").bind(String(userId)).first().catch(() => null));
}
export async function setWeeklyReportOn(db, userId, on, nowMs = Date.now()) {
  await ensureWeeklyReportSchema(db);
  if (on) await db.prepare("INSERT INTO weekly_report_optin (user_id, created_at) VALUES (?, ?) ON CONFLICT(user_id) DO NOTHING").bind(String(userId), Math.floor(nowMs / 1000)).run();
  else await db.prepare("DELETE FROM weekly_report_optin WHERE user_id = ?").bind(String(userId)).run();
}
