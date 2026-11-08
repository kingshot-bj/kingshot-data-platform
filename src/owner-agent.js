// Claude 用の鍵（OWNER_READONLY_TOKEN をそのまま使う）：Claude がオーナーとして「運用＋設定の変更」の操作を呼べるようにする。
// ・Authorization: Bearer で送る（スナップショットと同じ鍵）。鍵が付いていない・違うときは今までどおり Cookie で判定。
// ・呼べないもの：ユーザーの権限変更・無効化、APIキーの登録・移動・削除・無効化、データの削除・復元、
//   ログアウトさせる操作、ログイン・本人のアカウント設定、DELETE の操作すべて。
// ・書き換えの操作（GET以外）は監査ログへ記録（1リクエスト1回）。isolate ごとに1時間300回まで。鍵の値は画面・ログに出さない。

import { readonlyTokenOk } from "./owner-snapshot.js";

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

// 拒否リストの例外（オーナーが許可したもの）。/api/me/player：作業用の領主IDの登録（ホームの表示確認用）。
export const AGENT_ALLOW = Object.freeze(["/api/me/player"]);

export function agentRouteAllowed(method, pathname) {
  const m = String(method || "GET").toUpperCase(), p = String(pathname || "/");
  if (m === "DELETE") return false;
  if (AGENT_ALLOW.includes(p)) return true;
  for (const d of AGENT_DENY) {
    const hit = p === d.path || p.startsWith(d.path.endsWith("/") ? d.path : d.path + "/");
    if (!hit) continue;
    if (d.nonGet && (m === "GET" || m === "HEAD")) continue;
    return false;
  }
  return true;
}

// undefined：Claude 用の鍵が付いていない・違う（いつもどおりCookieで判定）。null：呼べない操作（拒否）。
export function agentTokenState(request, env) {
  if (!readonlyTokenOk(request, env)) return undefined;
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

// 書き換えの操作（GET・HEAD以外）だけ、1リクエスト1回監査ログに書く（D1の書き込みを増やさない）。
const audited = new WeakSet();
export async function auditAgentRequest(request, env, writeAudit) {
  const m = String(request.method || "GET").toUpperCase();
  if (m === "GET" || m === "HEAD" || audited.has(request)) return;
  audited.add(request);
  const url = new URL(request.url);
  await Promise.resolve(writeAudit(env, AGENT_USER, "AGENT_REQUEST", null, null, { method: request.method, path: url.pathname, query: url.search.slice(0, 200) })).catch(() => {});
}
