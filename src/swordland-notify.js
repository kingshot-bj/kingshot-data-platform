// 聖剣争奪・聖剣頂上リーグ：同盟の R4・R5 に「対戦相手を登録して」と Discord の個チャで知らせる（2026-11-16）。
// ・対象：EagleEye に領主を登録していて（ACTIVE）、保存済みのプレイヤーデータで同盟の役職が R4・R5、権限が ADVANCED 以上の人。
//   役職は players.alliance_rank（保存済み）を使うので、API Pool は使わない。
// ・いつ：朝だけ（日本時間 8時〜10時台の毎時5〜9分の回・2026-11-16 オーナーの判断で朝に寄せた）。開催中の回ごとに、1人1回まで。
// ・送らない：同じ同盟の誰かがもう相手を登録している、本人が通知を止めている、前に送った（届かなかった場合も含む）。
// ・届かない人（サーバーにいない・個チャを拒否）は記録して次へ。1回の実行で個チャは最大6人まで（朝3回で18人・Discord の制限に配慮）。
import { discordApiRequest } from "./discord-support.js";
import { activeSwordlandEvents, ensureSwordlandSchema, currentMatchup, SWORDLAND_EVENT_NAME, SWORDLAND_LEAGUE_NAME, SWORDLAND_REGISTER_ROLES } from "./swordland.js";

export const SWORDLAND_NOTIFY_MAX_DMS = 6;
export const NOTIFY_JST_HOURS = Object.freeze([8, 9, 10]);
const OFFICER_RANKS = [4, 5];

let ready = null;
export function resetSwordlandNotifySchemaCache() { ready = null; }
export async function ensureSwordlandNotifySchema(db) {
  if (!ready) {
    ready = db.batch([
      db.prepare("CREATE TABLE IF NOT EXISTS swordland_notify_log (season INTEGER NOT NULL, user_id TEXT NOT NULL, kid INTEGER NOT NULL, aid TEXT NOT NULL, sent_at INTEGER NOT NULL, status TEXT NOT NULL, PRIMARY KEY (season, user_id))"),
      db.prepare("CREATE TABLE IF NOT EXISTS swordland_notify_optout (user_id TEXT PRIMARY KEY, created_at INTEGER NOT NULL)")
    ]).catch(error => { ready = null; throw error; });
  }
  return ready;
}

export function isNotifyTick(nowSec) {
  const minute = Math.floor((nowSec % 3600) / 60);
  const jstHour = Math.floor(((nowSec + 9 * 3600) % 86400) / 3600);
  return minute >= 5 && minute < 10 && NOTIFY_JST_HOURS.includes(jstHour);
}

const jstDate = sec => { const d = new Date(sec * 1000 + 9 * 3600 * 1000); return (d.getUTCMonth() + 1) + "/" + d.getUTCDate(); };

export function swordlandNotifyText(ev, { abbr = "", origin = "https://eagleeye-ks.com" } = {}) {
  const period = `${jstDate(ev.begin_ts)}〜${jstDate(ev.end_ts - 1)}`;
  return `**⚔️ ${ev.label}（${period}）**\n${abbr ? abbr + " の" : ""}${ev.league ? "今週の" : "今回の"}対戦相手がまだ登録されていません。ゲーム内で相手を確認して、EagleEye に登録してください（R4・R5 向けのお知らせです）。\n${origin}/swordland\n\n通知を止める：${origin}/settings/notifications`;
}

export async function runSwordlandOfficerNotify(env, { nowMs = Date.now(), request = discordApiRequest, maxDms = SWORDLAND_NOTIFY_MAX_DMS, force = false, origin = "https://eagleeye-ks.com" } = {}) {
  const db = env?.DB;
  if (!db) return { skipped: "NO_DB" };
  if (!env?.DISCORD_BOT_TOKEN) return { skipped: "NO_BOT_TOKEN" };
  const now = Math.floor(nowMs / 1000);
  if (!force && !isNotifyTick(now)) return { skipped: "NOT_THIS_TICK" };
  await ensureSwordlandSchema(db);
  await ensureSwordlandNotifySchema(db);
  // 開催中の聖剣争奪・頂上リーグがある王国
  const kids = ((await db.prepare("SELECT DISTINCT kid FROM swordland_events WHERE name IN (?, ?) AND begin_ts <= ? AND end_ts >= ?").bind(SWORDLAND_EVENT_NAME, SWORDLAND_LEAGUE_NAME, now, now).all().catch(() => ({ results: [] })))?.results || []).map(r => Number(r.kid)).filter(k => k > 0);
  if (!kids.length) return { kingdoms: 0, sent: 0 };
  const roles = SWORDLAND_REGISTER_ROLES.map(() => "?").join(",");
  const officers = ((await db.prepare(
    "SELECT DISTINCT u.user_id, u.discord_id, p.kid, p.alliance_aid, p.alliance_abbr FROM users u " +
    "JOIN user_player_links l ON l.user_id = u.user_id AND l.status = 'ACTIVE' JOIN players p ON p.governor_id = l.governor_id " +
    `LEFT JOIN swordland_notify_optout o ON o.user_id = u.user_id WHERE u.status = 'ACTIVE' AND u.role IN (${roles}) AND p.alliance_rank IN (${OFFICER_RANKS.join(",")}) ` +
    `AND p.alliance_aid IS NOT NULL AND o.user_id IS NULL AND p.kid IN (${kids.map(() => "?").join(",")})`
  ).bind(...SWORDLAND_REGISTER_ROLES, ...kids).all().catch(() => ({ results: [] })))?.results || []).filter(o => /^\d{5,25}$/.test(String(o.discord_id || "")));
  const eventsByKid = new Map();
  let sent = 0, closed = 0, failed = 0, skippedRegistered = 0;
  for (const o of officers) {
    if (sent + closed + failed >= maxDms) break;
    const kid = Number(o.kid);
    if (!eventsByKid.has(kid)) eventsByKid.set(kid, await activeSwordlandEvents(db, kid, nowMs));
    for (const ev of eventsByKid.get(kid)) {
      if (sent + closed + failed >= maxDms) break;
      const done = await db.prepare("SELECT 1 AS x FROM swordland_notify_log WHERE season = ? AND user_id = ?").bind(ev.season, String(o.user_id)).first().catch(() => null);
      if (done) continue;
      if (await currentMatchup(db, ev.season, kid, o.alliance_aid)) { skippedRegistered++; continue; }
      let status = "SENT";
      try {
        const channel = await request(env, "/users/@me/channels", { method: "POST", body: JSON.stringify({ recipient_id: String(o.discord_id) }) });
        await request(env, `/channels/${channel.id}/messages`, { method: "POST", body: JSON.stringify({ content: swordlandNotifyText(ev, { abbr: o.alliance_abbr || "", origin }), allowed_mentions: { parse: [] } }) });
        sent++;
      } catch (error) {
        if (Number(error?.status) === 429) return { kingdoms: kids.length, officers: officers.length, sent, closed, failed, skippedRegistered, rateLimited: true };
        status = Number(error?.discord?.code) === 50007 ? "DM_CLOSED" : "FAILED";
        if (status === "DM_CLOSED") closed++; else failed++;
      }
      await db.prepare("INSERT INTO swordland_notify_log (season, user_id, kid, aid, sent_at, status) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(season, user_id) DO NOTHING")
        .bind(ev.season, String(o.user_id), kid, String(o.alliance_aid), now, status).run().catch(() => {});
    }
  }
  return { kingdoms: kids.length, officers: officers.length, sent, closed, failed, skippedRegistered };
}

export async function isSwordlandNotifyOff(db, userId) {
  await ensureSwordlandNotifySchema(db);
  return Boolean(await db.prepare("SELECT 1 AS x FROM swordland_notify_optout WHERE user_id = ?").bind(String(userId)).first().catch(() => null));
}
export async function setSwordlandNotifyOff(db, userId, off, nowMs = Date.now()) {
  await ensureSwordlandNotifySchema(db);
  if (off) await db.prepare("INSERT INTO swordland_notify_optout (user_id, created_at) VALUES (?, ?) ON CONFLICT(user_id) DO NOTHING").bind(String(userId), Math.floor(nowMs / 1000)).run();
  else await db.prepare("DELETE FROM swordland_notify_optout WHERE user_id = ?").bind(String(userId)).run();
}

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function renderNotificationSettingsPage({ off = false, message = "" } = {}) {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>通知の設定 | EagleEye</title><style>
body{margin:0;font-family:system-ui,-apple-system,"Hiragino Sans",sans-serif;background:var(--ee-bg,#0a1424);color:var(--ee-text,#e8f3ff)}.wrap{max-width:560px;margin:0 auto;padding:20px 16px 110px}a{color:var(--ee-cyan,#22d3ee)}
h1{font-size:22px}.card{border:1px solid var(--ee-border-soft,#223b57);border-radius:14px;background:var(--ee-panel,#0f2035);padding:14px;margin:12px 0;font-size:14px;line-height:1.7}
button{padding:11px 14px;border:0;border-radius:10px;background:var(--ee-cyan,#22d3ee);color:#04202a;font:800 14px system-ui}.note{font-size:12px;color:var(--ee-subtext,#91a7bf)}.msg{padding:9px 11px;border-radius:9px;border:1px dashed currentColor;font-size:13px}
</style></head><body><main class="wrap"><a href="/">← ホーム</a><h1>通知の設定</h1>${message ? `<p class="msg">${esc(message)}</p>` : ""}
<section class="card"><b>聖剣争奪・聖剣頂上リーグの登録のお知らせ（Discord の個チャ）</b><p>同盟の R4・R5 の人に、対戦相手がまだ登録されていないときに1回だけ届きます。</p><p>今は <b>${off ? "止めています" : "受け取る"}</b></p>
<form method="post" action="/settings/notifications"><input type="hidden" name="swordland" value="${off ? "on" : "off"}"><button type="submit">${off ? "受け取るにする" : "止める"}</button></form></section>
<p class="note">KvK の通知（EagleEye Support サーバーのスレッド）は、Discord のスレッドの通知設定で変えられます。</p></main></body></html>`;
}
