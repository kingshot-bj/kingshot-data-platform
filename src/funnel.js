// 登録までの流れ（オーナー用）。どこで人が離れているかを見る。
// ・ログインボタンを押した回数、Discordの画面で取り消した回数、新規ログイン・再ログインの回数を日ごと（日本時間）に数える
// ・直近の新規ユーザーのうち、領主IDを登録した人・APIキーを登録した人・ADVANCED以上になった人の数
// 個人を特定する情報は記録しない（日ごとの回数だけ）。

export const FUNNEL_STEPS = Object.freeze([
  { key: "login_start", label: "Discordへ" },
  { key: "google_start", label: "Googleへ" },
  { key: "login_cancelled", label: "Discordで取消" },
  { key: "login_new", label: "新規ログイン" },
  { key: "login_returning", label: "再ログイン" },
  // どこで離れたか：Discord・Google の画面から戻ってきたか、戻ってきて失敗したか（11/10〜）
  { key: "discord_return", label: "Discordから戻った" },
  { key: "google_return", label: "Googleから戻った" },
  { key: "google_done", label: "Googleで完了" },
  { key: "login_error", label: "ログイン失敗" },
  { key: "upgrade_popup_shown", label: "昇格案内を表示" },
  { key: "upgrade_popup_click", label: "昇格案内を押した" }
]);
// 画面から送ってよい段階（ログインの段階はサーバーだけが数える）。
export const CLIENT_FUNNEL_STEPS = Object.freeze(["upgrade_popup_shown", "upgrade_popup_click"]);

const jstDay = ms => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);

let schemaReady = null;
export function resetFunnelSchemaCache() { schemaReady = null; }
async function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = db.prepare("CREATE TABLE IF NOT EXISTS funnel_daily (day TEXT NOT NULL, step TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, step))").run()
      .catch(error => { schemaReady = null; throw error; });
  }
  return schemaReady;
}

// 失敗してもログインは止めない。
export async function recordFunnel(db, step, nowMs = Date.now()) {
  if (!db || !FUNNEL_STEPS.some(s => s.key === step)) return;
  try {
    await ensureSchema(db);
    await db.prepare("INSERT INTO funnel_daily (day, step, n) VALUES (?, ?, 1) ON CONFLICT(day, step) DO UPDATE SET n = n + 1").bind(jstDay(nowMs), step).run();
  } catch (error) {
    console.warn("funnel_record_failed", error?.message || error);
  }
}

export async function loadFunnel(db, { days = 14, nowMs = Date.now() } = {}) {
  await ensureSchema(db);
  const since = jstDay(nowMs - (days - 1) * 86400 * 1000);
  const sinceSec = Math.floor(Date.parse(since + "T00:00:00+09:00") / 1000);
  const [rows, cohort] = await Promise.all([
    db.prepare("SELECT day, step, n FROM funnel_daily WHERE day >= ?").bind(since).all(),
    db.prepare(
      "SELECT COUNT(*) AS users, " +
      "SUM(EXISTS (SELECT 1 FROM user_player_links l WHERE l.user_id = u.user_id AND l.status = 'ACTIVE')) AS linked, " +
      "SUM(EXISTS (SELECT 1 FROM api_pool_keys k WHERE k.contributed_by_user_id = u.user_id)) AS keyed, " +
      "SUM(u.role IN ('ADVANCED','VIP','ADMIN','OWNER')) AS advanced " +
      "FROM users u WHERE u.created_at >= ? AND u.status = 'ACTIVE'"
    ).bind(sinceSec).first()
  ]);
  const byDay = new Map();
  for (const r of rows?.results || []) {
    const d = byDay.get(r.day) || {};
    d[r.step] = Number(r.n) || 0;
    byDay.set(r.day, d);
  }
  const daily = [];
  for (let i = 0; i < days; i++) {
    const day = jstDay(nowMs - i * 86400 * 1000);
    daily.push({ day, ...Object.fromEntries(FUNNEL_STEPS.map(s => [s.key, byDay.get(day)?.[s.key] || 0])) });
  }
  const totals = Object.fromEntries(FUNNEL_STEPS.map(s => [s.key, daily.reduce((a, d) => a + d[s.key], 0)]));
  return {
    days, since, daily, totals,
    cohort: { users: Number(cohort?.users) || 0, linked: Number(cohort?.linked) || 0, keyed: Number(cohort?.keyed) || 0, advanced: Number(cohort?.advanced) || 0 }
  };
}

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (a, b) => b > 0 ? Math.round(a / b * 100) + "%" : "—";

export function renderFunnelCard(f) {
  if (!f) return `<div class="card"><h2>登録までの流れ</h2><p class="muted">読み込めませんでした。</p></div>`;
  const t = f.totals, c = f.cohort;
  const steps = [
    ["ログインに進んだ（Discord＋Google）", t.login_start + t.google_start, ""],
    ["新しくログインした", t.login_new, pct(t.login_new, t.login_start + t.google_start)],
    ["Discordの画面から戻ってきた", t.discord_return, pct(t.discord_return, t.login_start)],
    ["Googleの画面から戻ってきた", t.google_return, pct(t.google_return, t.google_start)],
    ["戻ってきたがログイン失敗", t.login_error, pct(t.login_error, t.discord_return + t.google_return)],
    ["領主IDを登録", c.linked, pct(c.linked, c.users)],
    ["APIキーを登録", c.keyed, pct(c.keyed, c.users)],
    ["ADVANCED以上", c.advanced, pct(c.advanced, c.users)]
  ];
  const rows = f.daily.filter(d => FUNNEL_STEPS.some(s => d[s.key])).map(d => `<tr><td>${esc(d.day.slice(5))}</td>${FUNNEL_STEPS.map(s => `<td>${d[s.key]}</td>`).join("")}</tr>`).join("");
  return `<div class="card"><h2>登録までの流れ（直近${f.days}日）</h2>
<table><tbody>${steps.map(([label, n, p]) => `<tr><th>${esc(label)}</th><td>${Number(n) || 0}</td><td class="muted">${esc(p)}</td></tr>`).join("")}</tbody></table>
<p class="muted">新しくログインした人の割合は「ボタンを押した回数」に対して（再ログインも押した回数に含まれます）。領主ID・APIキー・ADVANCEDの割合は、この期間に初めてログインした${c.users}人に対して。Discordの画面で取り消した回数：${t.login_cancelled}回。</p>
${rows ? `<table><thead><tr><th>日付</th>${FUNNEL_STEPS.map(s => `<th>${esc(s.label)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>` : `<p class="muted">まだ記録がありません（この機能の公開後から数えます）。</p>`}</div>`;
}
