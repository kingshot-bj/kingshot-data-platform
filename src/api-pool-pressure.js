// APIキー（MightPulse）の混み具合の見張り。
// ・裏の収集（王国ウォッチ・秘境・カタログ）は、常に BACKGROUND_KEY_RESERVE 本を空けておく
//   → ユーザーが押した取得（プレイヤーの最新取得・ホームの自動更新）が待たずに走れる
// ・キーが取れなかった回数を「ユーザー操作」「裏の収集」に分けて日ごとに数える
// ・1時間に1回、直近24時間の使用回数と1日の上限を比べ、50%を超えたらオーナーへDM（1日1回）
// APIキーやトークンはログ・画面に出さない。

export const BACKGROUND_KEY_RESERVE = 4;
export const API_POOL_ALERT_RATIO = 0.5;
const CHECK_INTERVAL_SECONDS = 3600;
const STATE_KEY = "api_pool_usage";

let schemaReady = null;
export function resetApiPoolPressureSchemaCache() { schemaReady = null; }
async function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.prepare("CREATE TABLE IF NOT EXISTS ops_alert_state (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER NOT NULL)").run();
      await db.prepare("CREATE TABLE IF NOT EXISTS api_pool_pressure (day TEXT NOT NULL, kind TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, kind))").run();
    })().catch(error => { schemaReady = null; throw error; });
  }
  return schemaReady;
}

const dayOf = nowMs => new Date(nowMs).toISOString().slice(0, 10);

// kind: "interactive_no_key"（ユーザー操作でキーが取れなかった）/ "background_yielded"（裏の収集がユーザー用の枠を残して見送った）
export async function recordPoolPressure(db, kind, nowMs = Date.now()) {
  if (!db || !kind) return;
  try {
    await ensureSchema(db);
    await db.prepare("INSERT INTO api_pool_pressure (day, kind, n) VALUES (?, ?, 1) ON CONFLICT(day, kind) DO UPDATE SET n = n + 1").bind(dayOf(nowMs), String(kind)).run();
  } catch (error) {
    console.warn("api_pool_pressure_record_failed", error?.message || error);
  }
}

export async function getApiPoolUsageState(db) {
  if (!db) return null;
  await ensureSchema(db);
  const row = await db.prepare("SELECT value FROM ops_alert_state WHERE key = ?").bind(STATE_KEY).first().catch(() => null);
  try { return JSON.parse(row?.value || "null"); } catch { return null; }
}

export function apiPoolAlertMessage({ used, quota, keys, contributors, origin }) {
  const fmt = n => Number(n).toLocaleString("ja-JP");
  const pct = quota > 0 ? Math.round(used / quota * 100) : 0;
  return [
    "⚠️ **EagleEye：APIキーの使用が多くなっています**",
    `直近24時間：**${fmt(used)}回**（1日の上限 ${fmt(quota)}回の **${pct}%**）`,
    `使えるキー：${keys}本（提供者 ${contributors}人）`,
    "キーの追加提供のお願い、または裏の収集の間隔を見直してください。",
    origin ? `オーナー用：${origin}/owner/traffic` : ""
  ].filter(Boolean).join("\n");
}

export async function runApiPoolUsageAlert(env, { nowMs = Date.now(), force = false } = {}) {
  const db = env?.DB;
  if (!db) return { skipped: true, reason: "NO_DB" };
  await ensureSchema(db);
  const now = Math.floor(nowMs / 1000);
  const prev = await getApiPoolUsageState(db);
  if (!force && prev?.checkedAt && now - Number(prev.checkedAt) < CHECK_INTERVAL_SECONDS) return { skipped: true, reason: "RECENTLY_CHECKED" };
  const day = dayOf(nowMs);
  const [usage, pool, pressure] = await Promise.all([
    db.prepare("SELECT COALESCE(SUM(request_count), 0) AS used FROM api_pool_usage WHERE used_at >= ?").bind(now - 86400).first(),
    db.prepare("SELECT COUNT(*) AS keys, COUNT(DISTINCT contributed_by_user_id) AS contributors, COALESCE(SUM(quota_per_day), 0) AS quota FROM api_pool_keys WHERE provider = 'MIGHTPULSE' AND status IN ('AVAILABLE', 'COOLDOWN')").first(),
    db.prepare("SELECT kind, n FROM api_pool_pressure WHERE day = ?").bind(day).all()
  ]);
  const state = {
    checkedAt: now, day,
    used: Number(usage?.used) || 0,
    quota: Number(pool?.quota) || 0,
    keys: Number(pool?.keys) || 0,
    contributors: Number(pool?.contributors) || 0,
    reserve: BACKGROUND_KEY_RESERVE,
    pressure: Object.fromEntries((pressure?.results || []).map(r => [r.kind, Number(r.n) || 0])),
    alertedDay: prev?.alertedDay || null
  };
  let alerted = false;
  if (state.quota > 0 && state.used / state.quota > API_POOL_ALERT_RATIO && state.alertedDay !== day) {
    const owners = (await db.prepare("SELECT discord_id FROM users WHERE role = 'OWNER' AND status = 'ACTIVE'").all().catch(() => ({ results: [] })))?.results || [];
    const content = apiPoolAlertMessage({ ...state, origin: String(env.PUBLIC_ORIGIN || "").replace(/\/$/, "") });
    for (const o of owners) {
      await db.prepare("INSERT OR IGNORE INTO announcement_dm_queue (message_key, discord_id, content, created_at) VALUES (?, ?, ?, ?)")
        .bind(`api-pool-alert:${day}:${o.discord_id}`, String(o.discord_id), content, now).run();
    }
    state.alertedDay = day;
    alerted = owners.length > 0;
    console.error("api_pool_usage_alert", day, state.used, state.quota);
  }
  await db.prepare("INSERT INTO ops_alert_state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(STATE_KEY, JSON.stringify(state), now).run();
  return { ...state, alerted };
}
