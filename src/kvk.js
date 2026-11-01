// KvK (Kingdom vs Kingdom) collection and page.
//
// Collection (Cron, every 5 minutes):
// - /kvk/matchups at most every 6 hours; D1/R2 are written only when the
//   response changes (sha256), so a whole season costs a handful of writes.
// - /kingdoms/:kid/kvk/scores for kingdoms of registered users and their
//   opponents. Hourly only while a KvK is running, otherwise every 6-24 hours.
//   At most KVK_SCORE_MAX_PER_HOUR kingdoms per hour, a few per Cron run, and
//   nothing at all when the Mighty keys' remaining daily quota is low.
// Page (/kvk): ADVANCED+ sees their own kingdoms, VIP+ any kingdom and the
// full matchup table. Viewing a stale kingdom fetches it once per hour at most.

import { collectMightyOnly } from "./data-collection-engine.js";
import { EAGLEEYE_THEME_BASE_CSS } from "./eagleeye-ui.js";

export const KVK_MATCHUPS_INTERVAL_SECONDS = 6 * 3600;
export const KVK_SCORE_ACTIVE_INTERVAL_SECONDS = 3600;
export const KVK_SCORE_IDLE_INTERVAL_SECONDS = 6 * 3600;
export const KVK_SCORE_ENDED_INTERVAL_SECONDS = 24 * 3600;
export const KVK_SCORE_MAX_PER_HOUR = 20;
export const KVK_SCORE_MAX_PER_RUN = 2;
export const KVK_MIGHTY_DAILY_RESERVE = 2000;
const ROLE_RANK = { BASIC: 0, ADVANCED: 1, VIP: 2, ADMIN: 3, OWNER: 4 };
const MATCHUP_ROWS_PER_STATEMENT = 20;

let schemaPromise = null;
export function resetKvkSchemaCache() { schemaPromise = null; }

export async function ensureKvkSchema(db) {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    await db.prepare(`CREATE TABLE IF NOT EXISTS kvk_matchups (
      season INTEGER NOT NULL, kid INTEGER NOT NULL, opponent INTEGER, kingdom_name TEXT, opponent_name TEXT,
      PRIMARY KEY (season, kid))`).run();
    await db.prepare(`CREATE TABLE IF NOT EXISTS kvk_scores (
      kid INTEGER PRIMARY KEY, season INTEGER, stage TEXT, opponent INTEGER, score INTEGER, opponent_score INTEGER,
      days_json TEXT, source_updated_at TEXT, payload_sha TEXT, fetched_at INTEGER NOT NULL, changed_at INTEGER)`).run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_kvk_scores_fetched ON kvk_scores(fetched_at)").run();
    await db.prepare(`CREATE TABLE IF NOT EXISTS kvk_state (
      key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER NOT NULL)`).run();
  })().catch(error => { schemaPromise = null; throw error; });
  return schemaPromise;
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function claimLock(db, key, seconds, now) {
  const result = await db.prepare(
    `INSERT INTO api_request_locks (lock_key, lock_token, lock_until, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(lock_key) DO UPDATE SET lock_token = excluded.lock_token, lock_until = excluded.lock_until, updated_at = excluded.updated_at
     WHERE api_request_locks.lock_until <= ?`
  ).bind(key, crypto.randomUUID(), now + seconds, now, now).run();
  return Number(result?.meta?.changes || 0) === 1;
}

async function getState(db, key) {
  const row = await db.prepare("SELECT value FROM kvk_state WHERE key = ?").bind(key).first();
  if (!row?.value) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}

async function setState(db, key, value, now) {
  await db.prepare("INSERT INTO kvk_state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(key, JSON.stringify(value), now).run();
}

function payloadOf(collected) {
  const r = collected?.result;
  const data = r?.data ?? r;
  return data && typeof data === "object" ? data : {};
}

// Remaining daily requests across confirmed Mighty keys that can be leased now.
export async function getMightyRemainingDay(db, now = Math.floor(Date.now() / 1000)) {
  const result = await db.prepare(
    `SELECT k.quota_per_day,
            COALESCE((SELECT SUM(u.request_count) FROM api_pool_usage u WHERE u.key_id = k.key_id AND u.used_at >= ? AND u.used_at <= ?), 0) AS used_day
     FROM api_pool_keys k
     WHERE k.provider = 'MIGHTPULSE' AND k.mighty_capable = 1 AND k.mighty_check_status = 'CONFIRMED'
       AND k.status IN ('AVAILABLE', 'COOLDOWN')`
  ).bind(now - 86400, now).all();
  return (result.results || []).reduce((sum, key) => {
    const quota = Math.max(10000, Number(key.quota_per_day) || 0);
    return sum + Math.max(0, quota - Math.max(0, Number(key.used_day) || 0));
  }, 0);
}

export function isKvkScoreActive(score, currentSeason = null) {
  if (!score) return false;
  const days = Array.isArray(score.days) ? score.days : [];
  const running = days.length > 0 && days.some(d => String(d?.status || "").toLowerCase() !== "ended");
  return running && (currentSeason == null || Number(score.season) === Number(currentSeason));
}

// Seconds until a kingdom's score should be fetched again.
export function kvkScoreInterval(score, matchupState) {
  const currentSeason = matchupState?.season ?? null;
  if (isKvkScoreActive(score, currentSeason)) return KVK_SCORE_ACTIVE_INTERVAL_SECONDS;
  const scoreSeason = Number(score?.season || 0);
  const stage = String(matchupState?.stage || "").toLowerCase();
  // Matchups say a season has moved past prediction but scores have not switched yet.
  if (currentSeason != null && scoreSeason < Number(currentSeason) && stage && stage !== "prediction") return KVK_SCORE_ACTIVE_INTERVAL_SECONDS;
  if (currentSeason != null && scoreSeason === Number(currentSeason)) return KVK_SCORE_ENDED_INTERVAL_SECONDS;
  return KVK_SCORE_IDLE_INTERVAL_SECONDS;
}

export async function refreshKvkMatchups(env, { now = Math.floor(Date.now() / 1000), force = false, collect = collectMightyOnly } = {}) {
  const db = env.DB;
  if (!force && !(await claimLock(db, "KVK_MATCHUPS", KVK_MATCHUPS_INTERVAL_SECONDS, now))) return { status: "SKIPPED", reason: "NOT_DUE" };
  const collected = await collect(env, { path: "/kvk/matchups", endpoint: "/kvk/matchups", targetType: "GLOBAL", targetId: "kvk_matchups", purpose: "KVK_MATCHUPS", timeoutMs: 15000, maxRetries: 1 });
  const payload = payloadOf(collected);
  const season = Number(payload.season);
  const matchups = Array.isArray(payload.matchups) ? payload.matchups : [];
  if (!Number.isFinite(season) || !matchups.length) return { status: "EMPTY" };
  const normalized = matchups.map(m => ({ kid: Number(m.kingdom), opponent: m.opponent == null ? null : Number(m.opponent), kingdom_name: m.kingdom_name ?? null, opponent_name: m.opponent_name ?? null }))
    .filter(m => Number.isInteger(m.kid)).sort((a, b) => a.kid - b.kid);
  const stage = String(payload.stage || "");
  const sha = await sha256Hex(JSON.stringify({ season, stage, matchups: normalized }));
  const previous = await getState(db, "matchups");
  if (previous?.sha === sha) {
    await setState(db, "matchups", { ...previous, checkedAt: now }, now);
    return { status: "UNCHANGED", season, stage, count: normalized.length };
  }
  if (env.ARCHIVE) {
    await env.ARCHIVE.put(`kvk/v1/matchups/season-${season}/${now}.json`, JSON.stringify({ fetched_at: now, payload }), { httpMetadata: { contentType: "application/json" } });
  }
  const statements = [db.prepare("DELETE FROM kvk_matchups WHERE season = ?").bind(season)];
  for (let i = 0; i < normalized.length; i += MATCHUP_ROWS_PER_STATEMENT) {
    const chunk = normalized.slice(i, i + MATCHUP_ROWS_PER_STATEMENT);
    statements.push(db.prepare("INSERT OR REPLACE INTO kvk_matchups (season, kid, opponent, kingdom_name, opponent_name) VALUES " + chunk.map(() => "(?, ?, ?, ?, ?)").join(", "))
      .bind(...chunk.flatMap(m => [season, m.kid, m.opponent, m.kingdom_name, m.opponent_name])));
  }
  await db.batch(statements);
  await setState(db, "matchups", { sha, season, stage, count: normalized.length, changedAt: now, checkedAt: now }, now);
  return { status: "CHANGED", season, stage, count: normalized.length };
}

function parseScoreRow(row) {
  if (!row) return null;
  let days = [];
  try { days = JSON.parse(row.days_json || "[]"); } catch {}
  return { ...row, days };
}

export async function getKvkScore(db, kid) {
  return parseScoreRow(await db.prepare("SELECT * FROM kvk_scores WHERE kid = ?").bind(Number(kid)).first());
}

export async function fetchKvkScore(env, kid, { now = Math.floor(Date.now() / 1000), purpose = "KVK_SCORES", collect = collectMightyOnly } = {}) {
  const db = env.DB;
  const id = Number(kid);
  let payload;
  try {
    payload = payloadOf(await collect(env, { path: `/kingdoms/${id}/kvk/scores`, endpoint: "/kingdoms/:kid/kvk/scores", targetType: "KINGDOM", targetId: String(id), purpose, timeoutMs: 15000, maxRetries: 1 }));
  } catch (error) {
    const status = Number(error?.status || 0);
    if (status === 404 || status === 400) {
      // No KvK data for this kingdom: remember the attempt so it is not retried every run.
      await db.prepare("INSERT INTO kvk_scores (kid, fetched_at) VALUES (?, ?) ON CONFLICT(kid) DO UPDATE SET fetched_at = excluded.fetched_at").bind(id, now).run();
      return { status: "NO_DATA" };
    }
    throw error;
  }
  const days = Array.isArray(payload.days) ? payload.days.map(d => ({ day: d.day, name: d.name, status: d.status, kingdom_score: d.kingdom_score, opponent_score: d.opponent_score, begin_ts: d.begin_ts, end_ts: d.end_ts })) : [];
  const row = {
    season: Number.isFinite(Number(payload.season)) ? Number(payload.season) : null,
    stage: payload.stage == null ? null : String(payload.stage),
    opponent: Number.isFinite(Number(payload.opponent)) ? Number(payload.opponent) : null,
    score: Number.isFinite(Number(payload.score)) ? Number(payload.score) : null,
    opponent_score: Number.isFinite(Number(payload.opponent_score)) ? Number(payload.opponent_score) : null,
    source_updated_at: payload.updated_at == null ? null : String(payload.updated_at)
  };
  const sha = await sha256Hex(JSON.stringify({ ...row, days }));
  const existing = await db.prepare("SELECT payload_sha FROM kvk_scores WHERE kid = ?").bind(id).first();
  if (existing?.payload_sha === sha) {
    await db.prepare("UPDATE kvk_scores SET fetched_at = ? WHERE kid = ?").bind(now, id).run();
    return { status: "UNCHANGED", ...row, days };
  }
  if (env.ARCHIVE && row.season != null) {
    await env.ARCHIVE.put(`kvk/v1/scores/${id}/season-${row.season}/${now}.json`, JSON.stringify({ fetched_at: now, payload }), { httpMetadata: { contentType: "application/json" } });
  }
  await db.prepare(
    `INSERT INTO kvk_scores (kid, season, stage, opponent, score, opponent_score, days_json, source_updated_at, payload_sha, fetched_at, changed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(kid) DO UPDATE SET season = excluded.season, stage = excluded.stage, opponent = excluded.opponent, score = excluded.score,
       opponent_score = excluded.opponent_score, days_json = excluded.days_json, source_updated_at = excluded.source_updated_at,
       payload_sha = excluded.payload_sha, fetched_at = excluded.fetched_at, changed_at = excluded.changed_at`
  ).bind(id, row.season, row.stage, row.opponent, row.score, row.opponent_score, JSON.stringify(days), row.source_updated_at, sha, now, now).run();
  return { status: "CHANGED", ...row, days };
}

// Registered users' kingdoms plus their current opponents.
export async function getKvkTargetKingdoms(db, season) {
  const own = ((await db.prepare("SELECT DISTINCT kingdom_id AS kid FROM user_player_links WHERE status = 'ACTIVE' AND kingdom_id IS NOT NULL").all()).results || [])
    .map(r => Number(r.kid)).filter(Number.isInteger);
  const targets = new Set(own);
  if (season != null && own.length) {
    for (let i = 0; i < own.length; i += 90) {
      const chunk = own.slice(i, i + 90);
      const rows = (await db.prepare(`SELECT opponent FROM kvk_matchups WHERE season = ? AND kid IN (${chunk.map(() => "?").join(",")})`).bind(Number(season), ...chunk).all()).results || [];
      for (const r of rows) if (Number.isInteger(Number(r.opponent))) targets.add(Number(r.opponent));
    }
  }
  return [...targets].sort((a, b) => a - b);
}

export async function runKvkCollection(env, { now = Math.floor(Date.now() / 1000), collect = collectMightyOnly } = {}) {
  const db = env?.DB;
  if (!db) return { skipped: true, reason: "DB_NOT_CONFIGURED" };
  await ensureKvkSchema(db);
  const summary = { matchups: null, scores: [], skipped: false };
  const remaining = await getMightyRemainingDay(db, now);
  if (remaining < KVK_MIGHTY_DAILY_RESERVE) return { ...summary, skipped: true, reason: "MIGHTY_QUOTA_LOW", remaining };

  try { summary.matchups = await refreshKvkMatchups(env, { now, collect }); }
  catch (error) {
    summary.matchups = { status: "FAILED", error: String(error?.code || error?.message || error).slice(0, 120) };
    // Retry in 15 minutes instead of waiting for the full 6-hour interval.
    await db.prepare("UPDATE api_request_locks SET lock_until = ? WHERE lock_key = 'KVK_MATCHUPS'").bind(now + 900).run().catch(() => {});
  }

  const matchupState = await getState(db, "matchups");
  const usedThisHour = Number((await db.prepare("SELECT COUNT(*) AS c FROM kvk_scores WHERE fetched_at > ?").bind(now - 3600).first())?.c || 0);
  let budget = Math.min(KVK_SCORE_MAX_PER_RUN, Math.max(0, KVK_SCORE_MAX_PER_HOUR - usedThisHour));
  if (!budget) return { ...summary, reason: "HOURLY_CAP" };

  const targets = await getKvkTargetKingdoms(db, matchupState?.season ?? null);
  const due = [];
  for (let i = 0; i < targets.length; i += 90) {
    const chunk = targets.slice(i, i + 90);
    const rows = (await db.prepare(`SELECT kid, season, days_json, fetched_at FROM kvk_scores WHERE kid IN (${chunk.map(() => "?").join(",")})`).bind(...chunk).all()).results || [];
    const byKid = new Map(rows.map(r => [Number(r.kid), parseScoreRow(r)]));
    for (const kid of chunk) {
      const score = byKid.get(kid) || null;
      const last = Number(score?.fetched_at || 0);
      if (now - last >= kvkScoreInterval(score, matchupState)) due.push({ kid, last });
    }
  }
  due.sort((a, b) => a.last - b.last || a.kid - b.kid);
  for (const { kid } of due) {
    if (budget <= 0) break;
    budget--;
    try {
      const result = await fetchKvkScore(env, kid, { now, collect });
      summary.scores.push({ kid, status: result.status });
    } catch (error) {
      summary.scores.push({ kid, status: "FAILED", error: String(error?.code || error?.message || error).slice(0, 120) });
      if (error?.code === "NO_API_POOL_KEY_AVAILABLE") break;
    }
  }
  summary.due = due.length;
  return summary;
}

// ---------- Page ----------

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function num(v) { const n = Number(v); return Number.isFinite(n) ? n.toLocaleString("ja-JP") : "—"; }
function compact(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  return a >= 1e9 ? (n / 1e9).toFixed(2) + "B" : a >= 1e6 ? (n / 1e6).toFixed(1) + "M" : a >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n);
}
function ts(v) { const n = Number(v); return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "—"; }
const STAGE_LABELS = { prediction: "組み合わせ発表", armament: "対戦" };
export function kvkStageLabel(stage) { const s = String(stage || "").toLowerCase(); return STAGE_LABELS[s] || (stage ? String(stage) : "—"); }

function shell(title, body) {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | EagleEye</title><style>:root{color-scheme:dark}*{box-sizing:border-box}${EAGLEEYE_THEME_BASE_CSS}
body{margin:0;background:var(--ee-bg,#0a1424);color:var(--ee-text,#e8f3ff);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.wrap{max-width:860px;margin:auto;padding:20px 14px 60px}.back{color:var(--ee-cyan,#22d3ee);text-decoration:none;font-size:13px}
.eyebrow{margin-top:14px;color:#f87171;font-size:11px;font-weight:900;letter-spacing:2px}h1{margin:4px 0 6px;font-size:26px}
.muted{color:var(--ee-subtext,#91a7bf);font-size:12px}.notice{margin:12px 0;padding:12px 14px;border:1px solid #2a4664;border-radius:12px;background:#0f2035;font-size:13px}
.notice a{color:#22d3ee;font-weight:800;text-decoration:none}
.vs{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;margin:14px 0;padding:16px;border:1px solid #2a4664;border-radius:16px;background:linear-gradient(135deg,#132a44,#0d1b2d)}
.side{text-align:center;min-width:0}.side a{color:#e8f3ff;text-decoration:none}.side small{display:block;color:#91a7bf;font-size:11px}.side b{display:block;font-size:22px;margin:2px 0}
.side strong{display:block;font-size:18px;color:#22d3ee;font-variant-numeric:tabular-nums}.side.opp strong{color:#f87171}.vs-mark{font-weight:900;color:#f6c84b;font-size:18px}
.bar{display:flex;height:10px;border-radius:999px;overflow:hidden;background:#1d344d;margin:4px 0 16px}.bar i{display:block;background:#22d3ee}.bar em{display:block;background:#f87171;flex:1}
h2{font-size:17px;margin:22px 0 8px}.days{display:grid;gap:8px}.day{padding:10px 12px;border:1px solid #1d344d;border-radius:12px;background:#0f2035}
.day-head{display:flex;justify-content:space-between;font-size:12px;color:#91a7bf;margin-bottom:6px}.day-row{display:grid;grid-template-columns:44px 1fr 72px;gap:8px;align-items:center;font-size:12px}
.day-row span{white-space:nowrap;font-variant-numeric:tabular-nums}.day-row span:last-child{text-align:right;font-variant-numeric:tabular-nums}.track{height:8px;border-radius:999px;background:#13243a;overflow:hidden}.track i{display:block;height:100%;background:#22d3ee}.track.opp i{background:#f87171}
.find{display:flex;gap:8px;margin:12px 0}.find input{flex:1;min-width:0;padding:11px;border:1px solid #2a4664;border-radius:10px;background:#0b192b;color:#e8f3ff;font:inherit}
.find button,.btn{padding:10px 14px;border:1px solid #2a4664;border-radius:10px;background:#172a40;color:#e8f3ff;font-weight:800;text-decoration:none;font-size:13px}
.mine{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}.mine a{padding:6px 10px;border:1px solid #2a4664;border-radius:999px;color:#9eeeff;text-decoration:none;font-size:12px}.mine a.on{border-color:#22d3ee;background:#103047}
.table{display:grid;gap:4px;margin-top:8px}.table a{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;padding:8px 10px;border:1px solid #1d344d;border-radius:9px;background:#0f2035;color:#e8f3ff;text-decoration:none;font-size:13px}
.table a span:last-child{text-align:right}.table a b{color:#f6c84b;font-size:11px}.empty{padding:16px;border:1px dashed #2a4965;border-radius:12px;color:#91a7bf}
</style></head><body>${body}</body></html>`;
}

function kidFromRequest(url) {
  const raw = url.searchParams.get("kid");
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n < 100000 ? n : NaN;
}

export async function renderKvkPage(request, env, auth, { loginUrl = "/api/auth/discord", collect = collectMightyOnly, now: nowOverride = null } = {}) {
  const url = new URL(request.url);
  const db = env.DB;
  const signedIn = Boolean(auth && auth.status === "ACTIVE");
  const rank = ROLE_RANK[String(auth?.role || "BASIC").toUpperCase()] ?? 0;
  if (!signedIn) {
    return shell("KvK", `<main class="wrap"><a class="back" href="/">← ホーム</a><div class="eyebrow">KVK</div><h1>KvK</h1><div class="notice">KvKの対戦相手やスコアを見るにはログインが必要です。 <a href="${esc(loginUrl)}">Discordでログイン →</a></div></main>`);
  }
  if (rank < ROLE_RANK.ADVANCED) {
    return shell("KvK", `<main class="wrap"><a class="back" href="/">← ホーム</a><div class="eyebrow">KVK</div><h1>KvK</h1><div class="notice">KvKはADVANCED以上のロールで利用できます。マイKingShotでMightPulseのAPIキーを提供するとADVANCEDになれます。 <a href="/my-player">マイKingShotへ →</a></div></main>`);
  }
  await ensureKvkSchema(db);
  const isVip = rank >= ROLE_RANK.VIP;
  const now = nowOverride ?? Math.floor(Date.now() / 1000);
  const mine = ((await db.prepare("SELECT DISTINCT kingdom_id AS kid FROM user_player_links WHERE user_id = ? AND status = 'ACTIVE' AND kingdom_id IS NOT NULL ORDER BY CASE account_type WHEN 'MAIN' THEN 0 ELSE 1 END, kingdom_id").bind(auth.user_id).all()).results || [])
    .map(r => Number(r.kid)).filter(Number.isInteger);
  const requested = kidFromRequest(url);
  const matchupState = await getState(db, "matchups");
  const season = matchupState?.season ?? null;

  const head = `<main class="wrap"><a class="back" href="/">← ホーム</a><div class="eyebrow">KVK</div><h1>KvK</h1><p class="muted">シーズン ${esc(season ?? "—")} · ${esc(kvkStageLabel(matchupState?.stage))}${matchupState?.checkedAt ? " · 組み合わせ確認 " + esc(ts(matchupState.checkedAt)) : ""}</p>`;
  const mineHtml = mine.length ? `<div class="mine">${mine.map(k => `<a href="/kvk?kid=${k}"${k === (requested || mine[0]) ? " class='on'" : ""}>王国 ${k}</a>`).join("")}</div>` : "";
  const finder = isVip ? `<form class="find" action="/kvk" method="get"><input name="kid" inputmode="numeric" pattern="[0-9]*" placeholder="王国番号で探す（VIP）" value="${Number.isInteger(requested) ? requested : ""}"><button type="submit">表示</button></form>` : "";

  if (Number.isNaN(requested)) return shell("KvK", head + mineHtml + finder + `<div class="notice">王国番号が正しくありません。</div></main>`);
  const kid = requested ?? mine[0] ?? null;
  if (kid == null) {
    return shell("KvK", head + finder + `<div class="notice">マイKingShotで領主IDを登録すると、自分の王国のKvKが表示されます。 <a href="/my-player">マイKingShotへ →</a></div>` + (isVip ? await allMatchupsSection(db, season, url) : "") + "</main>");
  }
  if (!mine.includes(kid) && !isVip) {
    return shell("KvK", head + mineHtml + `<div class="notice">自分の王国以外のKvKはVIP以上で見られます。</div></main>`);
  }

  let score = await getKvkScore(db, kid);
  let fetchNote = "";
  if ((!score || now - Number(score.fetched_at || 0) >= KVK_SCORE_ACTIVE_INTERVAL_SECONDS) && await claimLock(db, "KVK_SCORE_VIEW:" + kid, KVK_SCORE_ACTIVE_INTERVAL_SECONDS, now).catch(() => false)) {
    try {
      const remaining = await getMightyRemainingDay(db, now);
      if (remaining >= KVK_MIGHTY_DAILY_RESERVE) {
        await fetchKvkScore(env, kid, { now, purpose: "KVK_SCORES_VIEW", collect });
        score = await getKvkScore(db, kid);
      } else fetchNote = "Mightyキーの残り回数が少ないため、保存済みのデータを表示しています。";
    } catch (error) {
      console.error("kvk_score_view_fetch_failed", kid, error?.code || error?.message || error);
      fetchNote = "最新スコアの取得に失敗しました。保存済みのデータを表示しています。";
    }
  }
  const matchup = season != null ? await db.prepare("SELECT opponent, kingdom_name, opponent_name FROM kvk_matchups WHERE season = ? AND kid = ?").bind(season, kid).first() : null;

  let body = head + mineHtml + finder + (fetchNote ? `<div class="notice">${esc(fetchNote)}</div>` : "");
  if (matchup) {
    body += `<h2>シーズン ${esc(season)} の対戦相手</h2><div class="vs"><div class="side"><small>あなたの王国</small><b><a href="/kingdom?kid=${kid}">${kid}</a></b><small>${esc(matchup.kingdom_name || "")}</small></div><div class="vs-mark">VS</div><div class="side opp"><small>対戦相手</small><b>${matchup.opponent != null ? `<a href="/kingdom?kid=${Number(matchup.opponent)}">${Number(matchup.opponent)}</a>` : "—"}</b><small>${esc(matchup.opponent_name || "")}</small></div></div>`;
  }
  body += renderScoreSection(kid, score, season);
  if (isVip) body += await allMatchupsSection(db, season, url);
  body += `<p class="muted">データはMightPulseから取得しています。KvK期間中は1時間ごと、それ以外は数時間ごとに更新します。</p></main>`;
  return shell("KvK", body);
}

function renderScoreSection(kid, score, currentSeason) {
  if (!score || score.season == null) return `<h2>スコア</h2><div class="empty">まだKvKスコアのデータがありません。</div>`;
  const a = Number(score.score) || 0, b = Number(score.opponent_score) || 0;
  const share = a + b > 0 ? Math.round(a / (a + b) * 1000) / 10 : 50;
  const previous = currentSeason != null && Number(score.season) < Number(currentSeason);
  const days = Array.isArray(score.days) ? score.days : [];
  const max = Math.max(1, ...days.flatMap(d => [Number(d.kingdom_score) || 0, Number(d.opponent_score) || 0]));
  const dayHtml = days.length ? `<div class="days">${days.map(d => {
    const ka = Number(d.kingdom_score) || 0, kb = Number(d.opponent_score) || 0;
    const status = String(d.status || "");
    const statusLabel = status.toLowerCase() === "ended" ? "終了" : status.toLowerCase() === "ongoing" || status.toLowerCase() === "active" ? "進行中" : status || "—";
    return `<div class="day"><div class="day-head"><span>${esc(d.name || ("Day " + (d.day ?? "")))}</span><span>${esc(statusLabel)}</span></div>
<div class="day-row"><span>${kid}</span><div class="track"><i style="width:${Math.round(ka / max * 100)}%"></i></div><span>${esc(compact(ka))}</span></div>
<div class="day-row"><span>${esc(score.opponent ?? "—")}</span><div class="track opp"><i style="width:${Math.round(kb / max * 100)}%"></i></div><span>${esc(compact(kb))}</span></div></div>`;
  }).join("")}</div>` : `<div class="empty">日ごとのスコアはまだありません。</div>`;
  return `<h2>${previous ? "前回（シーズン " + esc(score.season) + "）のスコア" : "シーズン " + esc(score.season) + " のスコア"}</h2>
<div class="vs"><div class="side"><small>王国</small><b>${kid}</b><strong>${esc(compact(a))}</strong></div><div class="vs-mark">${a > b ? "優勢" : a < b ? "劣勢" : "互角"}</div><div class="side opp"><small>王国</small><b>${score.opponent != null ? `<a href="/kingdom?kid=${Number(score.opponent)}">${Number(score.opponent)}</a>` : "—"}</b><strong>${esc(compact(b))}</strong></div></div>
<div class="bar" aria-label="スコア比 ${share}%"><i style="width:${share}%"></i><em></em></div>
<p class="muted">合計 ${esc(num(a))} 対 ${esc(num(b))} · ${esc(kvkStageLabel(score.stage))} · 取得 ${esc(ts(score.fetched_at))}</p>
<h2>日ごとのスコア推移</h2>${dayHtml}`;
}

async function allMatchupsSection(db, season, url) {
  if (season == null) return `<h2>全体の対戦表</h2><div class="empty">組み合わせはまだ取得されていません。</div>`;
  if (url.searchParams.get("all") !== "1") {
    const kidParam = url.searchParams.get("kid");
    return `<h2>全体の対戦表</h2><a class="btn" href="/kvk?${kidParam ? "kid=" + encodeURIComponent(kidParam) + "&" : ""}all=1#all">シーズン ${esc(season)} の全対戦表を表示（VIP）</a>`;
  }
  const rows = (await db.prepare("SELECT kid, opponent FROM kvk_matchups WHERE season = ? ORDER BY kid").bind(season).all()).results || [];
  const seen = new Set();
  const pairs = [];
  for (const r of rows) {
    const k = Number(r.kid), o = r.opponent == null ? null : Number(r.opponent);
    const key = o == null ? String(k) : [Math.min(k, o), Math.max(k, o)].join("-");
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push([k, o]);
  }
  return `<h2 id="all">全体の対戦表（${esc(num(pairs.length))}組）</h2><input id="kvk-filter" class="find" style="width:100%;padding:11px;border:1px solid #2a4664;border-radius:10px;background:#0b192b;color:#e8f3ff;font:inherit" inputmode="numeric" placeholder="王国番号で絞り込み">
<div class="table" id="kvk-table">${pairs.map(([k, o]) => `<a href="/kvk?kid=${k}" data-k="${k} ${o ?? ""}"><span>王国 ${k}</span><b>VS</b><span>${o == null ? "不戦" : "王国 " + o}</span></a>`).join("")}</div>
<script>(function(){var f=document.getElementById("kvk-filter"),rows=[].slice.call(document.querySelectorAll("#kvk-table a"));f.addEventListener("input",function(){var q=f.value.trim();rows.forEach(function(r){r.style.display=!q||(" "+r.getAttribute("data-k")+" ").indexOf(" "+q)>=0?"":"none"})})})();</script>`;
}
