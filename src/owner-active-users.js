// オーナー：その日に EagleEye を使ったログインユーザーの一覧（/owner/users/active）。2026-11-17
// ・「使った」は user_daily_active（ログインして画面を開いた日・1人1日1行・90日分）。新しく書き込みはしない。
// ・ログイン回数は login_history（その日にログインし直した回数）。登録日は users.created_at。
// ・領主はマイKingShotのメイン（ゲーム内の名前・王国・同盟・役職）。プレイヤーのオンライン状態や最終活動などのゲーム側の活動情報は使わない。
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const jstDay = (ms = Date.now()) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
const jstStartSec = day => Math.floor(Date.parse(day + "T00:00:00+09:00") / 1000);
const shiftDay = (day, n) => new Date(Date.parse(day + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);

export function normalizeDay(value, nowMs = Date.now()) {
  const d = String(value || "");
  const today = jstDay(nowMs);
  if (!DAY.test(d) || d > today || d < shiftDay(today, -89)) return today;
  return d;
}

export async function loadActiveUsers(db, day, nowMs = Date.now()) {
  const start = jstStartSec(day), end = start + 86400;
  const week = shiftDay(day, -6);
  const rows = (await db.prepare(
    "SELECT u.user_id, COALESCE(NULLIF(u.global_name, ''), u.username) AS name, u.role, u.created_at, " +
    "(SELECT COUNT(*) FROM user_daily_active d2 WHERE d2.user_id = u.user_id AND d2.day BETWEEN ? AND ?) AS days7, " +
    "(SELECT COUNT(*) FROM login_history h WHERE h.user_id = u.user_id AND h.logged_in_at >= ? AND h.logged_in_at < ?) AS logins, " +
    "p.nick_name, p.kid, p.alliance_abbr, p.alliance_rank_label " +
    "FROM user_daily_active d JOIN users u ON u.user_id = d.user_id " +
    "LEFT JOIN user_player_links l ON l.user_id = u.user_id AND l.status = 'ACTIVE' AND l.account_type = 'MAIN' " +
    "LEFT JOIN players p ON p.governor_id = l.governor_id " +
    "WHERE d.day = ? ORDER BY u.created_at DESC"
  ).bind(week, day, start, end, day).all().catch(() => ({ results: [] })))?.results || [];
  // 同じ人が複数のメイン（王国ごと）を持つことがあるので、1人1行にまとめる
  const byUser = new Map();
  for (const r of rows) {
    const u = byUser.get(r.user_id) || { userId: r.user_id, name: r.name || "（名前なし）", role: r.role, createdAt: Number(r.created_at) || 0, days7: Number(r.days7) || 0, logins: Number(r.logins) || 0, governors: [] };
    if (r.nick_name || r.kid) u.governors.push({ name: r.nick_name || "", kid: r.kid, abbr: r.alliance_abbr || "", rank: r.alliance_rank_label || "" });
    byUser.set(r.user_id, u);
  }
  const users = [...byUser.values()].map(u => ({ ...u, isNew: u.createdAt >= start && u.createdAt < end }));
  const counts = (await db.prepare("SELECT day, COUNT(*) AS n FROM user_daily_active WHERE day BETWEEN ? AND ? GROUP BY day ORDER BY day").bind(shiftDay(day, -13), day).all().catch(() => ({ results: [] })))?.results || [];
  return { day, users, counts: counts.map(c => ({ day: c.day, n: Number(c.n) || 0 })) };
}

const ROLE_JA = { OWNER: "オーナー", ADMIN: "管理者", VIP: "VIP", ADVANCED: "ADVANCED", BASIC: "BASIC" };
const date = sec => sec ? new Date(sec * 1000 + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "/") : "—";

import { topOps } from "./usage-rollup.js";

// usage：その日の操作の集計（user_id → { actions, ops }）。無ければ「—」。
export function renderActiveUsersPage({ day, users = [], counts = [], usage = {} } = {}, nowMs = Date.now()) {
  const today = jstDay(nowMs);
  const chips = Array.from({ length: 7 }, (_, i) => shiftDay(today, -i)).map(d => `<a class="chip${d === day ? " on" : ""}" href="/owner/users/active?day=${d}">${d === today ? "今日" : d.slice(5).replace("-", "/")}</a>`).join("");
  const max = Math.max(1, ...counts.map(c => c.n));
  const bars = counts.map(c => `<a class="bar${c.day === day ? " on" : ""}" href="/owner/users/active?day=${c.day}" title="${c.day}：${c.n}人"><i style="height:${Math.round(c.n / max * 100)}%"></i><small>${c.day.slice(8)}</small></a>`).join("");
  const newCount = users.filter(u => u.isNew).length;
  const rows = users.map(u => `<tr><td><b>${esc(u.name)}</b>${u.isNew ? ' <span class="new">新規</span>' : ""}<small>${esc(ROLE_JA[u.role] || u.role || "")}・登録 ${esc(date(u.createdAt))}</small></td>
<td>${u.governors.length ? u.governors.map(g => `${esc(g.name || "（名前未取得）")}<small>王国${esc(g.kid ?? "?")}${g.abbr ? "・" + esc(g.abbr) : ""}${g.rank ? "・" + esc(g.rank) : ""}</small>`).join("") : '<small class="muted">領主の登録なし</small>'}</td>
<td class="num">${esc(u.logins)}</td><td class="num">${esc(u.days7)}日</td><td>${usage[u.userId] ? `<small>${esc(topOps(usage[u.userId].ops, 3))}</small>` : '<small class="muted">—</small>'}</td></tr>`).join("");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>使ったユーザー | EagleEye</title><style>
body{margin:0;font-family:system-ui,-apple-system,"Hiragino Sans",sans-serif;background:var(--ee-bg,#0a1424);color:var(--ee-text,#e8f3ff)}.wrap{max-width:900px;margin:0 auto;padding:20px 16px 110px}a{color:var(--ee-cyan,#22d3ee)}
h1{font-size:22px;margin:10px 0 4px}.lead,.muted,small{color:var(--ee-subtext,#91a7bf)}.lead{font-size:13px;margin:0 0 12px}
.card{border:1px solid var(--ee-border-soft,#223b57);border-radius:14px;background:var(--ee-panel,#0f2035);padding:14px;margin:12px 0}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{padding:6px 11px;border-radius:999px;border:1px solid var(--ee-border-soft,#223b57);text-decoration:none;font-size:13px;color:inherit}.chip.on{background:var(--ee-cyan,#22d3ee);color:#04202a;font-weight:800}
.sum{display:flex;gap:18px;flex-wrap:wrap;font-size:14px;margin:10px 0 0}.sum b{font-size:22px}
.bars{display:flex;align-items:flex-end;gap:4px;height:90px}.bar{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;text-decoration:none}.bar i{display:block;width:100%;min-height:2px;border-radius:4px 4px 0 0;background:var(--ee-border-soft,#223b57)}.bar.on i{background:var(--ee-cyan,#22d3ee)}.bar small{font-size:10px}
.tbl{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:8px 6px;border-bottom:1px solid var(--ee-border-soft,#223b57);text-align:left;vertical-align:top}td small{display:block;font-size:11px}th{font-size:11px;color:var(--ee-subtext,#91a7bf);font-weight:700}.num{text-align:right;white-space:nowrap}.new{display:inline-block;padding:0 6px;border-radius:999px;background:#22c55e33;color:#4ade80;font-size:11px;font-weight:800}
</style></head><body><main class="wrap"><a href="/owner/users">← ユーザー管理</a>
<h1>使ったユーザー</h1><p class="lead"><a href="/owner/usage">📈 月ごと・年間の推移 →</a></p><p class="lead">その日に EagleEye を開いたログインユーザー（1人1日1回の記録・90日分）。ログイン回数はその日にログインし直した回数です。</p>
<section class="card"><div class="chips">${chips}</div><div class="sum"><span>この日 <b>${users.length}</b> 人</span><span>うち新規 <b>${newCount}</b> 人</span></div></section>
<section class="card"><div class="bars" aria-label="直近14日の人数">${bars}</div><p class="muted" style="font-size:12px;margin:6px 0 0">直近14日（棒を押すとその日を表示）</p></section>
<section class="card"><div class="tbl"><table><thead><tr><th>ユーザー</th><th>領主（メイン）</th><th class="num">ログイン</th><th class="num">直近7日</th><th>よく使った機能</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="muted">この日に使ったログインユーザーはいません。</td></tr>'}</tbody></table></div></section>
</main></body></html>`;
}
