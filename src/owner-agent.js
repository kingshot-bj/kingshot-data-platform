// 作業用の鍵（OWNER_AGENT_TOKEN）：Claude がオーナーとして「運用＋設定の変更」の操作を呼べるようにする。
// ・ヘッダー X-EagleEye-Agent-Token で送る（Authorization は閲覧専用の鍵が使っている）。
// ・呼べないもの：ユーザーの権限変更・無効化、APIキーの登録・移動・削除・無効化、データの削除・復元、
//   ログアウトさせる操作、ログイン・本人のアカウント設定、DELETE の操作すべて。
// ・使うたびに監査ログへ記録（1リクエスト1回）。isolate ごとに1時間300回まで。鍵の値は画面・ログに出さない。

export const AGENT_HEADER = "x-eagleeye-agent-token";
export const AGENT_MIN_TOKEN_LENGTH = 32;
export const AGENT_RATE_PER_HOUR = 300;
export const AGENT_USER = Object.freeze({ user_id: "claude-agent", discord_id: "claude-agent", username: "claude-agent", global_name: "Claude（作業用）", role: "OWNER", status: "ACTIVE", agent: true });

// 呼べない操作（パスの前方一致。method が書いてあるものはその method だけ）。
export const AGENT_DENY = Object.freeze([
  { path: "/api/auth/" },
  { path: "/api/me" },
  { path: "/api/owner/users/role" },
  { path: "/api/owner/users/status" },
  { path: "/api/admin/api-pool/add" },
  { path: "/api/admin/api-pool/delete" },
  { path: "/api/admin/api-pool/revoke" },
  { path: "/api/admin/api-pool/move" },
  { path: "/api/owner/api-pool/reassign" },
  { path: "/api/owner/google-drive/restore" },
  { path: "/api/admin/google-drive/authorize" },
  { path: "/api/admin/google-drive/callback" },
  { path: "/api/admin/data-retention", nonGet: true },
  { path: "/api/owner/stale-activity", nonGet: true },
  { path: "/api/owner/kvk/relogin-missing", nonGet: true },
  { path: "/login" },
  { path: "/logout" }
]);

export function agentRouteAllowed(method, pathname) {
  const m = String(method || "GET").toUpperCase(), p = String(pathname || "/");
  if (m === "DELETE") return false;
  for (const d of AGENT_DENY) {
    const hit = p === d.path || p.startsWith(d.path.endsWith("/") ? d.path : d.path + "/");
    if (!hit) continue;
    if (d.nonGet && (m === "GET" || m === "HEAD")) continue;
    return false;
  }
  return true;
}

const enc = new TextEncoder();
function timingSafeEqualStr(a, b) {
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

// undefined：作業用の鍵が付いていない（いつもどおりCookieで判定）。null：鍵が違う・呼べない操作・回数超え（拒否）。
export function agentTokenState(request, env) {
  const provided = request.headers.get(AGENT_HEADER);
  if (!provided) return undefined;
  const expected = String(env?.OWNER_AGENT_TOKEN || "");
  if (expected.length < AGENT_MIN_TOKEN_LENGTH || !timingSafeEqualStr(provided.trim(), expected)) return null;
  const url = new URL(request.url);
  if (!agentRouteAllowed(request.method, url.pathname)) return null;
  return AGENT_USER;
}

const hits = new Map();
let hitHour = 0;
export function agentRateLimited(nowMs = Date.now()) {
  const hour = Math.floor(nowMs / 3600000);
  if (hour !== hitHour) { hits.clear(); hitHour = hour; }
  const n = (hits.get("all") || 0) + 1;
  hits.set("all", n);
  return n > AGENT_RATE_PER_HOUR;
}
export function resetAgentRate() { hits.clear(); hitHour = 0; }

// 1リクエスト1回だけ監査ログに書く。
const audited = new WeakSet();
export async function auditAgentRequest(request, env, writeAudit) {
  if (audited.has(request)) return;
  audited.add(request);
  const url = new URL(request.url);
  await Promise.resolve(writeAudit(env, AGENT_USER, "AGENT_REQUEST", null, null, { method: request.method, path: url.pathname, query: url.search.slice(0, 200) })).catch(() => {});
}
