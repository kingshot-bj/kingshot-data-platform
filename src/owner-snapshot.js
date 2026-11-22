// オーナー用の鍵（OWNER_READONLY_TOKEN）で、オーナー画面と同じ中身をJSONで読む（このAPIはGETだけ）。運用・設定の操作も同じ鍵で呼べる（owner-agent.js）。
// ・Claudeの作業環境から使う想定。鍵の値は Workerのシークレットと、作業環境の「シークレットの保存」にだけ置く（画面・ログに出さない）。
// ・読むだけ。変更・削除・ロール変更の口はない。使うたびに監査ログへ記録。isolateごとに1時間60回まで。
// ・ユーザー個人の情報は含めるが、Discord IDは伏せ字。APIキー・トークン・OAuthなどの秘密は返さない（列を名前で選んでいる）。

export const READONLY_MIN_TOKEN_LENGTH = 32;
export const READONLY_RATE_PER_HOUR = 60;
export const SNAPSHOT_SECTIONS = Object.freeze(["overview", "traffic", "growth", "users", "audit", "system", "coverage", "probe", "d1", "ae"]);
export const SNAPSHOT_DEFAULT_SECTIONS = Object.freeze(["overview", "traffic", "growth", "users"]);

const enc = new TextEncoder();
function timingSafeEqualStr(a, b) {
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

// 鍵が正しいか。鍵が設定されていない・短すぎるときは誰も使えない。
function bearerMatches(request, expectedValue) {
  const expected = String(expectedValue || "");
  if (expected.length < READONLY_MIN_TOKEN_LENGTH) return false;
  const header = request.headers.get("authorization") || "";
  const m = header.match(/^Bearer\s+(\S+)$/i);
  return Boolean(m) && timingSafeEqualStr(m[1], expected);
}
export function readonlyTokenOk(request, env) {
  return bearerMatches(request, env?.OWNER_READONLY_TOKEN);
}
// JARVIS（オーナーの AI 秘書）専用の鍵（2026-11-21）。Claude 用の鍵と同じ範囲を許すが、監査ログでは JARVIS として残り、
// Claude 用の鍵とは別に止められる（Cloudflare のシークレット JARVIS_AGENT_TOKEN を消せば JARVIS だけ使えなくなる）。
export function jarvisTokenOk(request, env) {
  return bearerMatches(request, env?.JARVIS_AGENT_TOKEN);
}

const hits = new Map();
let hitHour = 0;
export function readonlyRateLimited(nowMs = Date.now()) {
  const hour = Math.floor(nowMs / 3600000);
  if (hour !== hitHour) { hits.clear(); hitHour = hour; }
  const n = (hits.get("all") || 0) + 1;
  hits.set("all", n);
  return n > READONLY_RATE_PER_HOUR;
}
export function resetReadonlyRate() { hits.clear(); hitHour = 0; }

// Discord ID の伏せ字：先頭3文字と末尾3文字だけ残す。
export function maskDiscordId(v) {
  const s = String(v ?? "");
  if (!s) return null;
  return s.length <= 6 ? "*".repeat(s.length) : s.slice(0, 3) + "*".repeat(s.length - 6) + s.slice(-3);
}

export function parseSections(param) {
  if (!param) return [...SNAPSHOT_DEFAULT_SECTIONS];
  if (param === "all") return [...SNAPSHOT_SECTIONS];
  const want = String(param).split(",").map(s => s.trim()).filter(s => SNAPSHOT_SECTIONS.includes(s));
  return want.length ? [...new Set(want)] : [...SNAPSHOT_DEFAULT_SECTIONS];
}

// 秘密の可能性があるキーが混ざっていたら取り除く（念のための最後の網）。
// （「sessions」などの数字の項目は消さない）
const SECRET_KEY = /(token|secret|password|passwd|api[_-]?key|encrypted|authorization|cookie|private[_-]?key|client[_-]?secret|bearer)/i;
export function scrubSecrets(value, depth = 0) {
  if (depth > 8 || value == null) return value;
  if (Array.isArray(value)) return value.map(v => scrubSecrets(v, depth + 1));
  if (typeof value !== "object") return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (SECRET_KEY.test(k)) continue;
    out[k] = scrubSecrets(v, depth + 1);
  }
  return out;
}

// ---- 各セクションの読み取り（D1の列は名前で選ぶ） ----

export async function loadSnapshotUsers(db) {
  const rows = await db.prepare(
    "SELECT u.user_id, u.discord_id, u.username, u.global_name, u.role, u.status, u.created_at, u.last_login_at, " +
    "(SELECT COUNT(*) FROM player_watchlists p WHERE p.discord_id = u.discord_id) AS player_watch, " +
    "(SELECT COUNT(*) FROM kingdom_watchlists k WHERE k.discord_id = u.discord_id) AS kingdom_watch, " +
    "(SELECT COUNT(*) FROM user_player_links l WHERE l.user_id = u.user_id AND l.status = 'ACTIVE') AS linked " +
    "FROM users u ORDER BY u.created_at DESC LIMIT 300"
  ).all();
  return (rows?.results || []).map(u => ({
    user_id: u.user_id, discord_id: maskDiscordId(u.discord_id), username: u.username, global_name: u.global_name,
    role: u.role, status: u.status, created_at: u.created_at, last_login_at: u.last_login_at,
    player_watch: Number(u.player_watch) || 0, kingdom_watch: Number(u.kingdom_watch) || 0, linked: Number(u.linked) || 0
  }));
}

export async function loadSnapshotAudit(db) {
  const rows = await db.prepare("SELECT action, actor_discord_id, target_discord_id, details_json, created_at FROM owner_audit_log ORDER BY created_at DESC LIMIT 50").all().catch(() => ({ results: [] }));
  return (rows?.results || []).map(r => {
    let details = null;
    try { details = scrubSecrets(JSON.parse(r.details_json || "null")); } catch { details = null; }
    return { action: r.action, actor: maskDiscordId(r.actor_discord_id), target: maskDiscordId(r.target_discord_id), details, created_at: r.created_at };
  });
}

export async function loadSnapshotSystem(db, nowMs = Date.now()) {
  const since = Math.floor(nowMs / 1000) - 86400;
  const rows = await db.prepare("SELECT service, feature, error_code, COUNT(*) AS n FROM system_event_log WHERE status = 'FAILED' AND created_at >= ? GROUP BY service, feature, error_code ORDER BY n DESC LIMIT 30").bind(since).all().catch(error => ({ error: String(error?.message || error).slice(0, 160) }));
  return rows?.error ? { error: rows.error } : { failures24h: rows?.results || [] };
}

export async function loadSnapshotCoverage(db) {
  const q = sql => db.prepare(sql).first().then(r => Number(r?.n) || 0).catch(() => null);
  const [players, kingdoms, alliances, playerWatch, kingdomWatch, users] = await Promise.all([
    q("SELECT COUNT(*) AS n FROM players"), q("SELECT COUNT(*) AS n FROM kingdom_catalog"), q("SELECT COUNT(*) AS n FROM alliance_directory"),
    q("SELECT COUNT(*) AS n FROM player_watchlists WHERE enabled = 1"), q("SELECT COUNT(*) AS n FROM kingdom_watchlists"), q("SELECT COUNT(*) AS n FROM users")
  ]);
  return { players, kingdoms, alliances, playerWatch, kingdomWatch, users };
}

// MightPulse Probe（調査ツール）の保存結果。一覧は最近40件の記録だけ（誰がどのキーで実行したかは返さない）。
// probe_id を指定したときだけ、その1件の保存結果（R2・保存時に秘密は除去済み）を返す。読むだけ。
export const PROBE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROBE_MAX_BYTES = 300000;
export async function loadSnapshotProbe(db, bucket, { probeId = "" } = {}) {
  const rows = await db.prepare(
    "SELECT request_id, created_at, actor_role, command_type, endpoint, status, http_status, elapsed_ms, response_bytes, error_code, trigger_reason, response_count, save_destination, key_source, r2_object_key FROM mightpulse_probe_runs ORDER BY created_at DESC LIMIT 40"
  ).all().catch(() => ({ results: [] }));
  const runs = (rows?.results || []).map(r => ({ ...r, archived: Boolean(r.r2_object_key), r2_object_key: undefined }));
  const out = { runs };
  if (probeId) {
    if (!PROBE_ID.test(String(probeId))) return { ...out, detail: { error: "INVALID_PROBE_ID" } };
    const row = await db.prepare("SELECT request_id, endpoint, created_at, r2_object_key FROM mightpulse_probe_runs WHERE request_id = ? LIMIT 1").bind(String(probeId)).first().catch(() => null);
    if (!row) return { ...out, detail: { error: "NOT_FOUND" } };
    if (!row.r2_object_key || !String(row.r2_object_key).startsWith("mightpulse-probe/") || !bucket?.get) return { ...out, detail: { error: "NOT_ARCHIVED", request_id: row.request_id } };
    const obj = await bucket.get(row.r2_object_key).catch(() => null);
    if (!obj) return { ...out, detail: { error: "R2_OBJECT_MISSING", request_id: row.request_id } };
    const text = await obj.text();
    if (text.length > PROBE_MAX_BYTES) return { ...out, detail: { error: "TOO_LARGE", bytes: text.length, request_id: row.request_id } };
    let record = null;
    try { record = scrubSecrets(JSON.parse(text)); } catch { record = { raw: text.slice(0, 2000) }; }
    // 誰がどのキーで実行したかは返さない（一覧と同じ）。
    if (record && typeof record === "object") for (const k of ["user_id", "actor_discord_id", "actor_label", "key_id", "key_owner_user_id"]) delete record[k];
    out.detail = { request_id: row.request_id, endpoint: row.endpoint, created_at: row.created_at, record };
  }
  return out;
}

// d1：今日（UTC）と前日の D1 の読み取りが多いクエリ（Cloudflare Analytics。D1 は読まない）。2026-11-17
// 「今日 D1 の読み取りが多い」ときに原因の SQL を特定するため。SQL は先頭 300 文字だけ（値はバインドなので含まれない）。
export async function loadSnapshotD1(env, { nowMs = Date.now(), fetchImpl = fetch, limit = 15 } = {}) {
  const token = String(env?.CLOUDFLARE_ANALYTICS_TOKEN || "").trim(), account = String(env?.CLOUDFLARE_ACCOUNT_ID || "").trim(), db = String(env?.CLOUDFLARE_D1_DATABASE_ID || "").trim();
  if (!token || !account || !db) return { configured: false };
  const day = new Date(nowMs).toISOString().slice(0, 10), prev = new Date(nowMs - 86400000).toISOString().slice(0, 10);
  const query = "query($a:String!,$s:Date,$e:Date,$d:String){viewer{accounts(filter:{accountTag:$a}){d1QueriesAdaptiveGroups(limit:1000,filter:{date_geq:$s,date_leq:$e,databaseId:$d}){count sum{rowsRead rowsWritten} dimensions{date query}}}}}";
  const res = await fetchImpl("https://api.cloudflare.com/client/v4/graphql", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ query, variables: { a: account, s: prev, e: day, d: db } }) });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.errors?.length) return { configured: true, error: String(body?.errors?.[0]?.message || "HTTP " + res.status).slice(0, 160) };
  const groups = body?.data?.viewer?.accounts?.[0]?.d1QueriesAdaptiveGroups || [];
  const summarize = d => {
    const rows = groups.filter(g => g?.dimensions?.date === d);
    const total = rows.reduce((a, g) => a + Number(g?.sum?.rowsRead || 0), 0);
    const top = rows.map(g => ({ rowsRead: Number(g?.sum?.rowsRead || 0), rowsWritten: Number(g?.sum?.rowsWritten || 0), count: Number(g?.count || 0), query: String(g?.dimensions?.query || "").replace(/\s+/g, " ").slice(0, 300) }))
      .sort((a, b) => b.rowsRead - a.rowsRead).slice(0, limit)
      .map(q => ({ ...q, share: total ? Math.round(q.rowsRead / total * 1000) / 10 : 0, rowsPerQuery: q.count ? Math.round(q.rowsRead / q.count) : 0 }));
    return { day: d, rowsRead: total, queries: rows.length, top };
  };
  return { configured: true, today: summarize(day), yesterday: summarize(prev) };
}

// ae：分析用のトークンで Analytics Engine の集計（SQL API）を読めるか確かめる（2026-11-17）。読むだけ・トークンの値は返さない。
export async function loadSnapshotAnalyticsEngine(env, { fetchImpl = fetch } = {}) {
  const token = String(env?.CLOUDFLARE_ANALYTICS_TOKEN || "").trim(), account = String(env?.CLOUDFLARE_ACCOUNT_ID || "").trim();
  if (!token || !account) return { configured: false };
  const res = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/analytics_engine/sql`, { method: "POST", headers: { authorization: "Bearer " + token, "content-type": "text/plain" }, body: "SHOW TABLES" }).catch(() => null);
  if (!res) return { configured: true, ok: false, error: "NETWORK" };
  const text = await res.text().catch(() => "");
  let tables = null;
  try { const j = JSON.parse(text); tables = Array.isArray(j?.data) ? j.data.map(r => r.dataset || r.name || Object.values(r)[0]).slice(0, 20) : null; } catch {}
  return { configured: true, ok: res.ok, status: res.status, tables, error: res.ok ? null : text.replace(/\s+/g, " ").slice(0, 200) };
}
