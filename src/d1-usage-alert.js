// D1 読み取り量の見張り。1時間に1回だけ Cloudflare GraphQL で「今日（UTC）の読み取り行数」を
// 確認し、目安を超えたらオーナーへ Discord DM（1日1回）。結果はオーナー用ページで見られる。
// 2026-11 に1つのクエリが1日約40億行を読み、請求額で初めて気づいた件の再発防止。
// 使うのは既存の CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_ANALYTICS_TOKEN / CLOUDFLARE_D1_DATABASE_ID。
// トークンはログや画面に出さない。

export const D1_READ_ALERT_DEFAULT_ROWS = 300_000_000;
export const D1_READ_CHECK_INTERVAL_SECONDS = 3600;
const STATE_KEY = "d1_read_usage";

let schemaReady = null;
async function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = db.prepare("CREATE TABLE IF NOT EXISTS ops_alert_state (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER NOT NULL)").run()
      .catch(error => { schemaReady = null; throw error; });
  }
  return schemaReady;
}

export function d1ReadAlertThreshold(env) {
  const v = Number(env?.D1_READ_ALERT_DAILY_ROWS);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : D1_READ_ALERT_DEFAULT_ROWS;
}

export async function getD1UsageState(db) {
  if (!db) return null;
  await ensureSchema(db);
  const row = await db.prepare("SELECT value FROM ops_alert_state WHERE key = ?").bind(STATE_KEY).first().catch(() => null);
  try { return JSON.parse(row?.value || "null"); } catch { return null; }
}

async function fetchTodayRowsRead(env, day, fetchImpl) {
  const res = await fetchImpl("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + String(env.CLOUDFLARE_ANALYTICS_TOKEN).trim() },
    body: JSON.stringify({
      query: "query($accountTag:String!,$day:Date,$databaseId:String){viewer{accounts(filter:{accountTag:$accountTag}){d1AnalyticsAdaptiveGroups(limit:100,filter:{date_geq:$day,date_leq:$day,databaseId:$databaseId}){sum{rowsRead rowsWritten readQueries}}}}}",
      variables: { accountTag: String(env.CLOUDFLARE_ACCOUNT_ID).trim(), day, databaseId: String(env.CLOUDFLARE_D1_DATABASE_ID).trim() }
    })
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || (body.errors && body.errors.length)) throw new Error(String(body?.errors?.[0]?.message || "HTTP " + res.status).slice(0, 160));
  const groups = body?.data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups || [];
  return groups.reduce((acc, g) => ({
    rowsRead: acc.rowsRead + Number(g?.sum?.rowsRead || 0),
    rowsWritten: acc.rowsWritten + Number(g?.sum?.rowsWritten || 0),
    readQueries: acc.readQueries + Number(g?.sum?.readQueries || 0)
  }), { rowsRead: 0, rowsWritten: 0, readQueries: 0 });
}

export function d1AlertMessage({ day, rowsRead, threshold, origin }) {
  const fmt = n => Number(n).toLocaleString("ja-JP");
  return [
    "⚠️ **EagleEye：D1の読み取りが目安を超えています**",
    `今日（${day} UTC）の読み取り：**${fmt(rowsRead)}行**（目安 ${fmt(threshold)}行）`,
    "Cloudflare → D1 → eagleeye-db → クエリ を「読み取り行数」の多い順で確認してください。",
    origin ? `オーナー用：${origin}/owner/traffic` : ""
  ].filter(Boolean).join("\n");
}

// 戻り値は確認結果（テスト・ログ用）。失敗してもcronを止めない。
export async function runD1UsageAlert(env, { nowMs = Date.now(), fetchImpl = fetch, force = false } = {}) {
  const db = env?.DB;
  if (!db) return { skipped: true, reason: "NO_DB" };
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_ANALYTICS_TOKEN || !env.CLOUDFLARE_D1_DATABASE_ID) return { skipped: true, reason: "NOT_CONFIGURED" };
  await ensureSchema(db);
  const now = Math.floor(nowMs / 1000);
  const prev = await getD1UsageState(db);
  if (!force && prev?.checkedAt && now - Number(prev.checkedAt) < D1_READ_CHECK_INTERVAL_SECONDS) return { skipped: true, reason: "RECENTLY_CHECKED" };
  const day = new Date(nowMs).toISOString().slice(0, 10);
  const threshold = d1ReadAlertThreshold(env);
  const state = { checkedAt: now, day, threshold, alertedDay: prev?.alertedDay || null, rowsRead: null, rowsWritten: null, readQueries: null, error: null };
  try {
    Object.assign(state, await fetchTodayRowsRead(env, day, fetchImpl));
  } catch (error) {
    state.error = String(error?.message || error).slice(0, 160);
  }
  let alerted = false;
  if (state.rowsRead != null && state.rowsRead > threshold && state.alertedDay !== day) {
    const owners = (await db.prepare("SELECT discord_id FROM users WHERE role = 'OWNER' AND status = 'ACTIVE'").all().catch(() => ({ results: [] })))?.results || [];
    const content = d1AlertMessage({ day, rowsRead: state.rowsRead, threshold, origin: String(env.PUBLIC_ORIGIN || "").replace(/\/$/, "") });
    for (const o of owners) {
      await db.prepare("INSERT OR IGNORE INTO announcement_dm_queue (message_key, discord_id, content, created_at) VALUES (?, ?, ?, ?)")
        .bind(`d1-read-alert:${day}:${o.discord_id}`, String(o.discord_id), content, now).run();
    }
    state.alertedDay = day;
    alerted = owners.length > 0;
    console.error("d1_read_alert", day, state.rowsRead, threshold);
  }
  await db.prepare("INSERT INTO ops_alert_state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(STATE_KEY, JSON.stringify(state), now).run();
  return { ...state, alerted };
}
