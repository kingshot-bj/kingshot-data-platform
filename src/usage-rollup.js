// 利用の集計（長期）。2026-11-17
// ・操作ごとの記録は、すでに Queue 経由で R2 に保存されている（service-events/YYYY/MM/DD/00-12・12-24.ndjson.gz、消さない）。
//   ここではそれを毎晩1日分だけ読み、R2 に「日ごと」と「月ごと」の集計を作る（usage-rollup/）。D1 には書かない。
// ・その日に使った人（user_daily_active、D1 に90日分）と新規登録の数も一緒に月の集計へ残すので、90日を過ぎても年単位で見られる。
// ・月の集計は「日ごとの数」「ユーザーごとの利用日数・操作数・機能別の回数」「機能別の回数」。1年分でも12ファイル。
const JST = 9 * 3600 * 1000;
export const ROLLUP_PREFIX = "usage-rollup/";
export const ROLLUP_BACKFILL_DAYS = 89;
export const ROLLUP_PER_RUN = 6;

export const jstDay = (ms = Date.now()) => new Date(ms + JST).toISOString().slice(0, 10);
const shiftDay = (day, n) => new Date(Date.parse(day + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const startSec = day => Math.floor(Date.parse(day + "T00:00:00+09:00") / 1000);
const monthKey = month => `${ROLLUP_PREFIX}monthly/${month}.json`;
const dailyKey = day => `${ROLLUP_PREFIX}daily/${day}.json`;

export const OPERATION_LABELS = Object.freeze({
  PLAYER_SEARCH: "プレイヤー検索", PLAYER_VIEW: "プレイヤー詳細", PLAYER_REFRESH: "プレイヤーの最新取得", PLAYER_HISTORY_VIEW: "プレイヤーの推移",
  PLAYER_CHANGES_VIEW: "プレイヤーの変化", PLAYER_COMPARE_VIEW: "プレイヤー比較", PLAYER_WATCHLIST_VIEW: "ウォッチ（プレイヤー）",
  PLAYER_WATCHLIST_ADD: "ウォッチに追加", PLAYER_WATCHLIST_REMOVE: "ウォッチから外す", KINGDOM_WATCHLIST_VIEW: "ウォッチ（王国）",
  KINGDOM_WATCHLIST_ADD: "王国ウォッチに追加", KINGDOM_WATCHLIST_REMOVE: "王国ウォッチから外す", KINGDOM_WATCHLIST_REFRESH: "王国ウォッチの更新",
  KINGDOM_RANKING_VIEW: "王国ランキング", PLAYER_EXPORT: "プレイヤーの出力", KINGDOM_EXPORT: "王国の出力",
  KINGSHOT_ID_REGISTER: "領主IDの登録", KINGSHOT_ID_CHANGE: "領主IDの変更", KINGSHOT_ID_REMOVE: "領主IDの削除", ADVANCED_PROMOTED: "ADVANCED になった",
  MIGHTPULSE_API_KEY_CONTRIBUTE: "APIキーの登録"
});
export const operationLabel = op => OPERATION_LABELS[op] || op;

async function gunzipText(body) {
  const stream = new Blob([body]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).text();
}

// その日（日本時間）の操作の記録を R2 から読む（半日ごとの2ファイル）。
export async function readDayEvents(bucket, day) {
  const [y, m, d] = day.split("-");
  const out = [];
  for (const half of ["00-12", "12-24"]) {
    const obj = await bucket.get(`service-events/${y}/${m}/${d}/${half}.ndjson.gz`).catch(() => null);
    if (!obj) continue;
    const text = await gunzipText(await obj.arrayBuffer()).catch(() => "");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try { const e = JSON.parse(line); if (e?.actor_user_id && e?.operation) out.push(e); } catch {}
    }
  }
  return out;
}

export function summarizeEvents(events) {
  const users = {}, ops = {};
  for (const e of events) {
    const u = String(e.actor_user_id), op = String(e.operation);
    const row = users[u] || (users[u] = { actions: 0, ops: {} });
    row.actions++; row.ops[op] = (row.ops[op] || 0) + 1;
    ops[op] = (ops[op] || 0) + 1;
  }
  return { users, ops, actions: events.length };
}

export async function buildDailyRollup(env, day) {
  const db = env.DB, start = startSec(day);
  const [events, activeRows, newRow] = await Promise.all([
    readDayEvents(env.ARCHIVE, day),
    db.prepare("SELECT user_id, role FROM user_daily_active WHERE day = ?").bind(day).all().then(r => r?.results || []).catch(() => []),
    db.prepare("SELECT COUNT(*) AS n FROM users WHERE created_at >= ? AND created_at < ?").bind(start, start + 86400).first().catch(() => null)
  ]);
  const s = summarizeEvents(events);
  const active = [...new Set([...activeRows.map(r => String(r.user_id)), ...Object.keys(s.users)])];
  return { day, active, roles: Object.fromEntries(activeRows.map(r => [String(r.user_id), r.role || null])), newUsers: Number(newRow?.n) || 0, actions: s.actions, ops: s.ops, users: s.users };
}

export function mergeIntoMonth(month, daily) {
  const m = month || { month: daily.day.slice(0, 7), days: {}, users: {}, ops: {} };
  if (m.days[daily.day]) return { month: m, changed: false }; // 同じ日を2回足さない
  m.days[daily.day] = { active: daily.active.length, actions: daily.actions, newUsers: daily.newUsers };
  for (const u of daily.active) {
    const row = m.users[u] || (m.users[u] = { activeDays: 0, actions: 0, ops: {} });
    row.activeDays++;
    const d = daily.users[u];
    if (d) { row.actions += d.actions; for (const [op, n] of Object.entries(d.ops)) row.ops[op] = (row.ops[op] || 0) + n; }
  }
  for (const [op, n] of Object.entries(daily.ops)) m.ops[op] = (m.ops[op] || 0) + n;
  return { month: m, changed: true };
}

async function readJson(bucket, key) {
  const obj = await bucket.get(key).catch(() => null);
  if (!obj) return null;
  try { return await obj.json(); } catch { return null; }
}

// 毎晩（日本時間 0時台の5分ごとの回）、まだ集計していない日を古い順でなく新しい順に最大6日分。force はオーナーの手動実行。
export async function runUsageRollup(env, { nowMs = Date.now(), force = false, perRun = ROLLUP_PER_RUN } = {}) {
  if (!env?.DB || !env?.ARCHIVE) return { skipped: "NO_BINDING" };
  const jstHour = new Date(nowMs + JST).getUTCHours();
  if (!force && jstHour !== 0) return { skipped: "NOT_THIS_TICK" };
  const yesterday = shiftDay(jstDay(nowMs), -1);
  const months = new Map();
  const done = [];
  for (let i = 0; i <= ROLLUP_BACKFILL_DAYS && done.length < perRun; i++) {
    const day = shiftDay(yesterday, -i), mk = day.slice(0, 7);
    if (!months.has(mk)) months.set(mk, { data: await readJson(env.ARCHIVE, monthKey(mk)), dirty: false });
    const entry = months.get(mk);
    if (entry.data?.days?.[day]) continue;
    const daily = await buildDailyRollup(env, day);
    await env.ARCHIVE.put(dailyKey(day), JSON.stringify(daily), { httpMetadata: { contentType: "application/json" } });
    const merged = mergeIntoMonth(entry.data, daily);
    entry.data = merged.month; entry.dirty = entry.dirty || merged.changed;
    done.push(day);
  }
  for (const [mk, entry] of months) if (entry.dirty) await env.ARCHIVE.put(monthKey(mk), JSON.stringify(entry.data), { httpMetadata: { contentType: "application/json" } });
  return { rolledUp: done };
}

export async function loadYear(bucket, year) {
  const months = await Promise.all(Array.from({ length: 12 }, (_, i) => readJson(bucket, monthKey(`${year}-${String(i + 1).padStart(2, "0")}`))));
  return months.map((m, i) => ({ month: `${year}-${String(i + 1).padStart(2, "0")}`, data: m }));
}

// 今日の分（まだ集計していない日）は R2 の記録をその場で読む。集計済みの日は日ごとの集計を読む。
export async function loadDayUsage(bucket, day, today) {
  if (day < today) { const d = await readJson(bucket, dailyKey(day)); if (d) return d.users || {}; }
  return summarizeEvents(await readDayEvents(bucket, day)).users;
}

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = n => Number(n || 0).toLocaleString("ja-JP");

export function topOps(ops, n = 3) {
  return Object.entries(ops || {}).sort((a, b) => b[1] - a[1]).slice(0, n).map(([op, c]) => `${operationLabel(op)} ${c}`).join("・");
}

export function renderUsageYearPage({ year, months, names = {}, thisYear }) {
  const rows = months.map(({ month, data }) => {
    if (!data) return `<tr><td>${esc(month.slice(5))}月</td><td colspan="4" class="muted">集計なし</td></tr>`;
    const days = Object.values(data.days || {});
    const unique = Object.keys(data.users || {}).length;
    const actions = days.reduce((a, d) => a + (d.actions || 0), 0), newUsers = days.reduce((a, d) => a + (d.newUsers || 0), 0);
    const avg = days.length ? (days.reduce((a, d) => a + (d.active || 0), 0) / days.length).toFixed(1) : "—";
    return `<tr><td>${esc(month.slice(5))}月<small>${days.length}日分</small></td><td class="num">${num(unique)}</td><td class="num">${esc(avg)}</td><td class="num">${num(newUsers)}</td><td class="num">${num(actions)}</td></tr>`;
  }).join("");
  const yearOps = {}, yearUsers = {};
  for (const { data } of months) {
    if (!data) continue;
    for (const [op, n] of Object.entries(data.ops || {})) yearOps[op] = (yearOps[op] || 0) + n;
    for (const [u, r] of Object.entries(data.users || {})) { const y = yearUsers[u] || (yearUsers[u] = { activeDays: 0, actions: 0, ops: {} }); y.activeDays += r.activeDays || 0; y.actions += r.actions || 0; for (const [op, n] of Object.entries(r.ops || {})) y.ops[op] = (y.ops[op] || 0) + n; }
  }
  const opRows = Object.entries(yearOps).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([op, n]) => `<tr><td>${esc(operationLabel(op))}</td><td class="num">${num(n)}</td></tr>`).join("");
  const userRows = Object.entries(yearUsers).sort((a, b) => b[1].activeDays - a[1].activeDays || b[1].actions - a[1].actions).slice(0, 30).map(([u, r]) => `<tr><td>${esc(names[u] || "（退会・不明）")}</td><td class="num">${num(r.activeDays)}日</td><td class="num">${num(r.actions)}</td><td><small>${esc(topOps(r.ops))}</small></td></tr>`).join("");
  const years = Array.from({ length: Math.max(1, thisYear - 2025) }, (_, i) => thisYear - i).map(y => `<a class="chip${y === year ? " on" : ""}" href="/owner/usage?year=${y}">${y}年</a>`).join("");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>利用の推移 | EagleEye</title><style>
body{margin:0;font-family:system-ui,-apple-system,"Hiragino Sans",sans-serif;background:var(--ee-bg,#0a1424);color:var(--ee-text,#e8f3ff)}.wrap{max-width:900px;margin:0 auto;padding:20px 16px 110px}a{color:var(--ee-cyan,#22d3ee)}h1{font-size:22px;margin:10px 0 4px}h2{font-size:16px;margin:0 0 8px}.lead,.muted,small{color:var(--ee-subtext,#91a7bf)}.lead{font-size:13px}
.card{border:1px solid var(--ee-border-soft,#223b57);border-radius:14px;background:var(--ee-panel,#0f2035);padding:14px;margin:12px 0}.chips{display:flex;gap:6px;flex-wrap:wrap}.chip{padding:6px 11px;border-radius:999px;border:1px solid var(--ee-border-soft,#223b57);text-decoration:none;color:inherit;font-size:13px}.chip.on{background:var(--ee-cyan,#22d3ee);color:#04202a;font-weight:800}
.tbl{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:7px 6px;border-bottom:1px solid var(--ee-border-soft,#223b57);text-align:left;vertical-align:top}th{font-size:11px;color:var(--ee-subtext,#91a7bf)}td small{display:block;font-size:11px}.num{text-align:right;white-space:nowrap}
</style></head><body><main class="wrap"><a href="/owner/users/active">← 使ったユーザー</a>
<h1>利用の推移（${esc(year)}年）</h1><p class="lead">毎晩、前日の分を R2 に集計して残しています（D1 は使いません）。使った人は「ログインして EagleEye を開いた人」、操作は検索・詳細・比較・ウォッチなどの記録です。</p>
<section class="card"><div class="chips">${years}</div></section>
<section class="card"><h2>月ごと</h2><div class="tbl"><table><thead><tr><th>月</th><th class="num">使った人（のべでなく人数）</th><th class="num">1日平均</th><th class="num">新規登録</th><th class="num">操作</th></tr></thead><tbody>${rows}</tbody></table></div></section>
<section class="card"><h2>よく使われた機能</h2><div class="tbl"><table><tbody>${opRows || '<tr><td class="muted">まだ記録がありません</td></tr>'}</tbody></table></div></section>
<section class="card"><h2>よく使ったユーザー（上位30人）</h2><div class="tbl"><table><thead><tr><th>ユーザー</th><th class="num">利用日数</th><th class="num">操作</th><th>よく使った機能</th></tr></thead><tbody>${userRows || '<tr><td class="muted">まだ記録がありません</td></tr>'}</tbody></table></div></section>
</main></body></html>`;
}
