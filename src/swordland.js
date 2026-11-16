// 聖剣争奪（Swordland Showdown）・聖剣頂上リーグ（Swordland Summit League）：対戦相手の登録と表示。
// ・MightPulse では組み合わせは取れない（/kingdoms/:kid/events は日程だけ）。日程は Mighty 対応のキーで1日1回取り、
//   開催期間中だけホームに入口を出す。
// ・対戦相手を登録できるのは ADVANCED 以上で、その同盟の R4・R5 の人だけ（同盟のメンバー表で確かめる）。
// ・同じ同盟の仲間には「今回の相手」を表示する。登録が割れたら多い方を出し、人数も出す。
// ・記録するのはシーズン・同盟・相手・登録した人だけ。

import { collectMightyOnly } from "./data-collection-engine.js";

export const SWORDLAND_EVENT_NAME = "Swordland Showdown";
// 聖剣頂上リーグ（2026-11-16）：API では分類名が「Swordland Summit League」、中のイベント名は Summit Contest などで Swordland を含まない。
// 分類の期間（いちばん早い開始〜いちばん遅い終了）をこの名前で保存する。相手は毎週変わるので、月曜 9:00（日本時間）で区切った1週間を1回分とする。
export const SWORDLAND_LEAGUE_NAME = "Swordland Summit League";
export const GOVERNOR_DUEL_NAME = "Governor Duel";
export const WEEK_SECONDS = 7 * 24 * 3600;
const MONDAY_0900_JST = 4 * 24 * 3600; // 1970-01-05 00:00 UTC（月曜 9:00 JST）
export function leagueWeekStart(nowSec) { return MONDAY_0900_JST + Math.floor((nowSec - MONDAY_0900_JST) / WEEK_SECONDS) * WEEK_SECONDS; }
export const SWORDLAND_EVENTS_STALE_SECONDS = 24 * 3600;
export const SWORDLAND_EVENTS_PER_RUN = 3;
export const SWORDLAND_REGISTER_ROLES = Object.freeze(["ADVANCED", "VIP", "ADMIN", "OWNER"]);

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const normAid = v => String(v ?? "").trim().replace(/^(\d+)\.0+$/, "$1");

let schemaReady = null;
export function resetSwordlandSchemaCache() { schemaReady = null; }
export async function ensureSwordlandSchema(db) {
  if (!schemaReady) {
    schemaReady = db.batch([
      db.prepare("CREATE TABLE IF NOT EXISTS swordland_events (kid INTEGER NOT NULL, name TEXT NOT NULL, begin_ts INTEGER NOT NULL, end_ts INTEGER NOT NULL, fetched_at INTEGER NOT NULL, PRIMARY KEY (kid, name, begin_ts))"),
      db.prepare("CREATE TABLE IF NOT EXISTS swordland_fetch_state (kid INTEGER PRIMARY KEY, fetched_at INTEGER NOT NULL, status TEXT)"),
      db.prepare("CREATE TABLE IF NOT EXISTS swordland_matchups (season INTEGER NOT NULL, kid INTEGER NOT NULL, aid TEXT NOT NULL, reporter_user_id TEXT NOT NULL, opp_kid INTEGER NOT NULL, opp_tag TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (season, kid, aid, reporter_user_id))")
    ]).catch(error => { schemaReady = null; throw error; });
  }
  return schemaReady;
}

// /kingdoms/:kid/events の中から、イベント名と期間を取り出す（categories[].events[]）。category は分類名。
export function extractEvents(payload) {
  const out = [];
  for (const c of Array.isArray(payload?.categories) ? payload.categories : []) {
    for (const e of Array.isArray(c?.events) ? c.events : []) {
      const begin = Number(e?.begin_ts), end = Number(e?.end_ts);
      if (e?.name && Number.isFinite(begin) && Number.isFinite(end) && end > begin) out.push({ name: String(e.name).slice(0, 80), category: String(c?.name || "").slice(0, 80), begin_ts: Math.floor(begin), end_ts: Math.floor(end) });
    }
  }
  return out;
}

// 保存するもの：名前に Swordland を含むイベント、領主対決、Swordland の分類（頂上リーグ）は分類全体の期間。
export function eventsToSave(events) {
  const out = events.filter(e => /swordland/i.test(e.name) || e.name === GOVERNOR_DUEL_NAME).map(({ name, begin_ts, end_ts }) => ({ name, begin_ts, end_ts }));
  const byCat = new Map();
  for (const e of events) {
    if (!/swordland/i.test(e.category || "") || /swordland/i.test(e.name)) continue;
    const r = byCat.get(e.category) || { name: e.category, begin_ts: e.begin_ts, end_ts: e.end_ts };
    r.begin_ts = Math.min(r.begin_ts, e.begin_ts); r.end_ts = Math.max(r.end_ts, e.end_ts);
    byCat.set(e.category, r);
  }
  return [...out, ...byCat.values()];
}

// 1日1回：登録ユーザーの王国のイベント日程を取る（1回の実行で最大3王国。Mighty対応のキー）。
export async function runSwordlandEventsRefresh(env, { nowMs = Date.now(), collect = collectMightyOnly, force = false } = {}) {
  const db = env?.DB;
  if (!db) return { skipped: "NO_DB" };
  const now = Math.floor(nowMs / 1000);
  if (!force && now % 3600 >= 300) return { skipped: "NOT_THIS_TICK" }; // 1時間に1回（毎時の最初の5分）。オーナーの手動実行（force）はいつでも
  await ensureSwordlandSchema(db);
  const kids = ((await db.prepare(
    "SELECT DISTINCT p.kid AS kid FROM user_player_links l JOIN players p ON p.governor_id = l.governor_id " +
    "LEFT JOIN swordland_fetch_state s ON s.kid = p.kid WHERE l.status = 'ACTIVE' AND p.kid IS NOT NULL AND (s.fetched_at IS NULL OR s.fetched_at < ?) LIMIT ?"
  ).bind(force ? now + 1 : now - SWORDLAND_EVENTS_STALE_SECONDS, force ? 10 : SWORDLAND_EVENTS_PER_RUN).all().catch(() => ({ results: [] })))?.results || []).map(r => Number(r.kid)).filter(k => k > 0);
  let saved = 0; const errors = [];
  for (const kid of kids) {
    let status = "OK";
    try {
      const collected = await collect(env, { path: `/kingdoms/${kid}/events`, endpoint: "/kingdoms/:kid/events", targetType: "KINGDOM", targetId: String(kid), purpose: "SWORDLAND_EVENTS", timeoutMs: 15000, maxRetries: 1 });
      const r = collected?.result; const data = r?.data ?? r;
      const events = eventsToSave(extractEvents(data));
      for (const e of events) {
        await db.prepare("INSERT INTO swordland_events (kid, name, begin_ts, end_ts, fetched_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(kid, name, begin_ts) DO UPDATE SET end_ts = excluded.end_ts, fetched_at = excluded.fetched_at").bind(kid, e.name, e.begin_ts, e.end_ts, now).run();
        saved++;
      }
    } catch (error) {
      status = String(error?.code || error?.message || "FAILED").slice(0, 40); errors.push({ kid, status });
      if (/NO_API_POOL_KEY_AVAILABLE|NO_MIGHTY/i.test(status)) { await markFetched(db, kid, now, status); break; }
    }
    await markFetched(db, kid, now, status);
  }
  return { kingdoms: kids.length, saved, errors };
}
async function markFetched(db, kid, now, status) {
  await db.prepare("INSERT INTO swordland_fetch_state (kid, fetched_at, status) VALUES (?, ?, ?) ON CONFLICT(kid) DO UPDATE SET fetched_at = excluded.fetched_at, status = excluded.status").bind(kid, now, status).run().catch(() => {});
}

// 今開催中の聖剣争奪（その王国）。シーズンの印は開始時刻。
// 聖剣争奪が無いときは、聖剣頂上リーグの「今週」（月曜 9:00〜）を返す（league: true）。label は画面の見出し。
export async function activeShowdown(db, kid, nowMs = Date.now()) {
  if (!kid) return null;
  await ensureSwordlandSchema(db);
  const now = Math.floor(nowMs / 1000);
  const showdown = await activeEvent(db, kid, SWORDLAND_EVENT_NAME, now);
  if (showdown) return { ...showdown, label: "聖剣争奪" };
  const league = await activeEvent(db, kid, SWORDLAND_LEAGUE_NAME, now);
  if (!league) return null;
  const week = Math.max(league.begin_ts, leagueWeekStart(now));
  return { name: league.name, begin_ts: week, end_ts: Math.min(league.end_ts, leagueWeekStart(now) + WEEK_SECONDS), season_end_ts: league.end_ts, league: true, label: "聖剣頂上リーグ" };
}

// 領主対決の開催中（その王国）。
export async function activeGovernorDuel(db, kid, nowMs = Date.now()) {
  if (!kid) return null;
  await ensureSwordlandSchema(db);
  return activeEvent(db, kid, GOVERNOR_DUEL_NAME, Math.floor(nowMs / 1000));
}

async function activeEvent(db, kid, name, now) {
  return await db.prepare("SELECT name, begin_ts, end_ts FROM swordland_events WHERE kid = ? AND name = ? AND begin_ts <= ? AND end_ts >= ? ORDER BY begin_ts DESC LIMIT 1").bind(kid, name, now, now).first().catch(() => null);
}

// ログイン中の人の「メイン領主」と同盟（players の最新）。
export async function myAlliance(db, userId) {
  return await db.prepare(
    "SELECT p.governor_id, p.kid, p.alliance_aid, p.alliance_abbr, p.alliance_name FROM user_player_links l JOIN players p ON p.governor_id = l.governor_id " +
    "WHERE l.user_id = ? AND l.status = 'ACTIVE' ORDER BY CASE l.account_type WHEN 'MAIN' THEN 0 ELSE 1 END, l.created_at ASC LIMIT 1"
  ).bind(String(userId)).first().catch(() => null);
}

// その同盟の今シーズンの相手（多く登録された方）。
export async function currentMatchup(db, season, kid, aid) {
  const rows = (await db.prepare("SELECT opp_kid, opp_tag, COUNT(*) AS n, MAX(updated_at) AS at FROM swordland_matchups WHERE season = ? AND kid = ? AND aid = ? GROUP BY opp_kid, lower(opp_tag) ORDER BY n DESC, at DESC LIMIT 2")
    .bind(season, kid, normAid(aid)).all().catch(() => ({ results: [] })))?.results || [];
  if (!rows.length) return null;
  return { opp_kid: Number(rows[0].opp_kid), opp_tag: rows[0].opp_tag, count: Number(rows[0].n), disputed: rows.length > 1 };
}

// 登録できるか：ADVANCED以上で、メンバー表でその人の領主が R4・R5。
export function canRegisterRole(role) { return SWORDLAND_REGISTER_ROLES.includes(String(role || "").toUpperCase()); }
export function isOfficer(members, governorId) {
  const me = (members || []).find(m => String(m.id) === String(governorId));
  return Boolean(me && Number(me.role) >= 4);
}

export async function saveMatchup(db, { season, kid, aid, userId, oppKid, oppTag, nowMs = Date.now() }) {
  const now = Math.floor(nowMs / 1000);
  await ensureSwordlandSchema(db);
  await db.prepare("INSERT INTO swordland_matchups (season, kid, aid, reporter_user_id, opp_kid, opp_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(season, kid, aid, reporter_user_id) DO UPDATE SET opp_kid = excluded.opp_kid, opp_tag = excluded.opp_tag, updated_at = excluded.updated_at")
    .bind(season, kid, normAid(aid), String(userId), oppKid, String(oppTag).slice(0, 24), now, now).run();
}

// オーナーだけ：全同盟の登録済みの対戦相手（直近 days 日に登録・更新されたもの）。登録した人は出さない（人数だけ）。
// 読むのは swordland_matchups を1文（期間で絞る・最大300組）。
export const SWORDLAND_OWNER_LIST_DAYS = 14;
export async function loadAllMatchupsForOwner(db, { nowMs = Date.now(), days = SWORDLAND_OWNER_LIST_DAYS, limit = 300 } = {}) {
  await ensureSwordlandSchema(db);
  const since = Math.floor(nowMs / 1000) - days * 86400;
  const rows = (await db.prepare(
    "SELECT m.season, m.kid, m.aid, m.opp_kid, m.opp_tag, COUNT(*) AS n, MAX(m.updated_at) AS at, " +
    "(SELECT c.abbr FROM alliance_catalog c WHERE c.kid = m.kid AND (c.aid = m.aid OR c.aid = m.aid || '.0') LIMIT 1) AS abbr, " +
    "(SELECT c.name FROM alliance_catalog c WHERE c.kid = m.kid AND (c.aid = m.aid OR c.aid = m.aid || '.0') LIMIT 1) AS name " +
    "FROM swordland_matchups m WHERE m.updated_at >= ? GROUP BY m.season, m.kid, m.aid, m.opp_kid, lower(m.opp_tag) ORDER BY at DESC LIMIT ?"
  ).bind(since, limit).all().catch(() => ({ results: [] })))?.results || [];
  // 同じ同盟・同じ回で相手が割れていたら印を付ける（多い方を先に）。
  const groups = new Map();
  for (const r of rows) {
    const k = r.season + ":" + r.kid + ":" + r.aid;
    if (!groups.has(k)) groups.set(k, { season: Number(r.season), kid: Number(r.kid), aid: String(r.aid), abbr: r.abbr || "", name: r.name || "", at: 0, opps: [] });
    const g = groups.get(k);
    g.opps.push({ opp_kid: Number(r.opp_kid), opp_tag: String(r.opp_tag), count: Number(r.n) || 0 });
    g.at = Math.max(g.at, Number(r.at) || 0);
  }
  return [...groups.values()].map(g => ({ ...g, opps: g.opps.sort((a, b) => b.count - a.count), disputed: g.opps.length > 1 })).sort((a, b) => b.season - a.season || b.at - a.at);
}

export function renderOwnerMatchups(list) {
  if (!list) return "";
  const items = list.map(g => {
    const self = `王国${esc(g.kid)} ${esc(g.abbr || "（タグ不明 aid " + g.aid + "）")}${g.name ? `<small>${esc(g.name)}</small>` : ""}`;
    const opps = g.opps.map(o => `<li>王国${esc(o.opp_kid)} ${esc(o.opp_tag)}（${esc(o.count)}人）${g.abbr ? ` <a href="${esc(compareUrl(g.kid, g.abbr, o.opp_kid, o.opp_tag))}">比べる</a>` : ""}</li>`).join("");
    return `<div class="om"><div class="om-h"><b>${self}</b><span class="note">${esc(jstDate(g.season))}〜の回</span></div><ul>${opps}</ul>${g.disputed ? `<p class="note">登録が分かれています</p>` : ""}</div>`;
  }).join("");
  return `<section class="card"><h2 class="oh">オーナー：全同盟の対戦相手（直近${SWORDLAND_OWNER_LIST_DAYS}日・${list.length}同盟）</h2>${items || `<p class="note">直近${SWORDLAND_OWNER_LIST_DAYS}日の登録はありません。</p>`}<p class="note">登録した人は表示しません（人数だけ）。</p></section>`;
}

export function compareUrl(kid, abbr, oppKid, oppTag) {
  return "/alliance/compare?a=" + encodeURIComponent(kid + ":" + abbr) + "&a=" + encodeURIComponent(oppKid + ":" + oppTag);
}

const jstDate = sec => new Date(sec * 1000 + 9 * 3600 * 1000).toISOString().slice(5, 10).replace("-", "/");

// 登録ページ。
export function renderSwordlandPage({ state, message = "", isOwner = false, ownerMatchups = null }) {
  const s = state || {};
  const label = s.showdown?.label || "聖剣争奪";
  const period = s.showdown ? (s.showdown.league ? `今週 ${jstDate(s.showdown.begin_ts)}〜${jstDate(s.showdown.end_ts - 1)}（シーズンは${jstDate(s.showdown.season_end_ts - 1)}まで・相手は毎週変わります）` : `${jstDate(s.showdown.begin_ts)}〜${jstDate(s.showdown.end_ts - 1)}`) : "";
  const mine = s.mine ? `王国${esc(s.mine.kid)}の ${esc(s.mine.alliance_abbr || "")}${s.mine.alliance_name ? "（" + esc(s.mine.alliance_name) + "）" : ""}` : "";
  const cur = s.matchup ? `<p class="now">今回の相手：<b>王国${esc(s.matchup.opp_kid)}の ${esc(s.matchup.opp_tag)}</b>（${esc(s.matchup.count)}人が登録${s.matchup.disputed ? "・登録が分かれています" : ""}）</p>` + (s.canCompare ? `<p><a class="btn" href="${esc(compareUrl(s.mine.kid, s.mine.alliance_abbr, s.matchup.opp_kid, s.matchup.opp_tag))}">⚔️ 上位3人を比べる</a></p>` : "") : "";
  let body;
  if (!s.showdown) body = `<p>今は聖剣争奪・聖剣頂上リーグの開催期間ではありません（日程はMightPulseから1日1回確認しています）。開催中はここで対戦相手を登録・確認できます。</p><p><a class="btn" href="/alliance/compare">⚔️ 同盟比較はいつでも使えます</a></p>`;
  else if (!s.mine?.alliance_abbr) body = `<p>マイKingShotで領主を登録すると、自分の同盟の対戦相手を登録・確認できます。</p><p><a href="/my-player">マイKingShotへ →</a></p>`;
  else if (s.canRegister) body = `${cur}<form method="post" action="/swordland" class="f"><p>相手の同盟（ゲーム内で確認したもの）を入れてください。</p><input name="opp_kid" inputmode="numeric" pattern="\\d*" placeholder="相手の王国番号" required value="${esc(s.mine?.opp_kid || "")}"><input name="opp_tag" placeholder="相手の同盟タグ" required maxlength="24"><button type="submit">登録する</button></form>`;
  else body = `${cur || `<p>まだ登録されていません。</p>`}<p class="note">対戦相手を登録できるのは、同盟のR4・R5でADVANCED以上の人です。R4以上の人が登録すると、こことホームに表示されます。</p>`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(label)} | EagleEye</title><style>
body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:var(--ee-bg,#0a1424);color:var(--ee-text,#e8f3ff)}.wrap{max-width:640px;margin:0 auto;padding:18px 16px 110px}a{color:var(--ee-cyan,#22d3ee)}
h1{font-size:22px;margin:6px 0 2px}.sub{font-size:13px;color:var(--ee-subtext,#91a7bf);margin:0 0 12px}.card{border:1px solid var(--ee-border-soft,#223b57);border-radius:14px;background:var(--ee-panel,#0f2035);padding:14px;margin:12px 0;font-size:14px;line-height:1.6}
.f{display:grid;gap:8px}.f input{padding:10px;border-radius:9px;border:1px solid var(--ee-border-soft,#223b57);background:var(--ee-bg,#0a1424);color:inherit;font:15px system-ui}.f button,.btn{display:inline-block;padding:11px 14px;border:0;border-radius:10px;background:var(--ee-cyan,#22d3ee);color:#04202a;font:800 14px system-ui;text-decoration:none;text-align:center}
.oh{font-size:15px;margin:0 0 8px}.om{border-top:1px solid var(--ee-border-soft,#223b57);padding:8px 0;overflow-wrap:anywhere}.om-h{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}.om-h small{display:block;font-size:12px;font-weight:400;color:var(--ee-subtext,#91a7bf)}.om ul{margin:4px 0 0;padding-left:18px}
.now{font-size:15px}.note{font-size:12px;color:var(--ee-subtext,#91a7bf)}.msg{padding:9px 11px;border-radius:9px;border:1px dashed currentColor;font-size:13px}
</style></head><body><main class="wrap"><a href="/">← ホーム</a><h1>⚔️ ${esc(label)}</h1><p class="sub">${period ? "開催期間 " + esc(period) : ""}${mine ? "・" + mine : ""}</p>
${message ? `<p class="msg">${esc(message)}</p>` : ""}<section class="card">${body}</section>
${isOwner ? renderOwnerMatchups(ownerMatchups) : ""}
${isOwner ? `<form method="post" action="/swordland/refresh-events" class="card"><p class="note">オーナー：登録ユーザーの王国のイベント日程（Mighty対応のキー）を今すぐ取り直します（最大10王国）。</p><button type="submit" class="btn">今すぐ日程を取得</button></form>` : ""}
<p class="note">組み合わせはゲームの外からは分からないため、同盟のR4・R5の人に登録してもらっています。登録が分かれたときは、多く登録された方を表示します。</p></main></body></html>`;
}
