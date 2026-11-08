// 作業用の鍵：決められた操作だけオーナーとして通す。権限変更・無効化・APIキー・削除・復元・ログアウト・ログイン・本人設定・DELETE は拒否。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { agentRouteAllowed, agentTokenState, agentRateLimited, resetAgentRate, AGENT_RATE_PER_HOUR } from "../src/owner-agent.js";

const TOKEN = "a".repeat(40);
const req = (path, method = "GET", token = TOKEN) => new Request("https://eagleeye-ks.com" + path, { method, headers: token ? { authorization: "Bearer " + token } : {} });

test("呼べる操作：運用と設定の変更。呼べない：権限変更・無効化・APIキー・削除・復元・ログアウト・ログイン・本人設定・DELETE", () => {
  for (const [m, p] of [["POST", "/swordland/refresh-events"], ["GET", "/api/owner/snapshot"], ["POST", "/api/admin/announcements"], ["POST", "/api/admin/player-visibility"], ["GET", "/api/admin/data-retention"], ["POST", "/api/admin/api-pool/health-check"], ["GET", "/owner/social"], ["GET", "/api/members"], ["GET", "/api/me/player"], ["POST", "/api/me/player"]]) assert.ok(agentRouteAllowed(m, p), m + " " + p);
  for (const [m, p] of [["POST", "/api/owner/users/role"], ["POST", "/api/owner/users/status"], ["POST", "/api/admin/api-pool/add"], ["POST", "/api/admin/api-pool/delete"], ["POST", "/api/admin/api-pool/revoke"], ["POST", "/api/admin/api-pool/move"], ["POST", "/api/owner/api-pool/reassign"], ["POST", "/api/owner/google-drive/restore"], ["POST", "/api/admin/data-retention"], ["POST", "/api/owner/stale-activity"], ["POST", "/api/owner/kvk/relogin-missing"], ["GET", "/api/auth/discord"], ["GET", "/api/me"], ["POST", "/api/me/mightpulse-key"], ["DELETE", "/api/me/player"], ["POST", "/api/me/player/x"], ["DELETE", "/api/kingdom-watchlist"], ["GET", "/login"]]) assert.ok(!agentRouteAllowed(m, p), m + " " + p);
});

test("鍵の判定：付いていない・違う・短いときは今までどおり（undefined）、呼べない操作は拒否（null）", () => {
  const env = { OWNER_READONLY_TOKEN: TOKEN };
  assert.equal(agentTokenState(req("/swordland", "GET", null), env), undefined);
  assert.equal(agentTokenState(req("/swordland", "GET", "b".repeat(40)), env), undefined, "他のBearer（gatewayなど）はそのまま通す");
  assert.equal(agentTokenState(req("/swordland", "GET", "short"), { OWNER_READONLY_TOKEN: "short" }), undefined, "サーバー側の鍵が短ければ誰も使えない");
  assert.equal(agentTokenState(req("/api/owner/users/role", "POST"), env), null);
  const ok = agentTokenState(req("/swordland/refresh-events", "POST"), env);
  assert.equal(ok.role, "OWNER"); assert.equal(ok.user_id, "claude-agent");
});

test("回数制限：1時間300回まで", () => {
  resetAgentRate();
  const t = Date.parse("2026-11-09T00:00:00Z");
  for (let i = 0; i < AGENT_RATE_PER_HOUR; i++) assert.equal(agentRateLimited(t), false);
  assert.equal(agentRateLimited(t), true);
  assert.equal(agentRateLimited(t + 3600 * 1000), false);
  resetAgentRate();
});

test("配線：鍵が付いていればCookieは見ない。使うたびに監査ログ。拒否された操作は通らない", async () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const fn = index.slice(index.indexOf("async function getAuthenticatedUser("), index.indexOf("async function getAuthenticatedUser(") + 600);
  assert.match(fn, /const agent = agentTokenState\(request, env\);/);
  assert.match(fn, /if \(!agent \|\| agentRateLimited\(\) \|\| !env\.DB\) return null;/);
  assert.match(fn, /await auditAgentRequest\(request, env, writeOwnerAuditLog\);/);
  resetAgentRate();
  const worker = (await import("../src/index.js")).default;
  const audits = [];
  const stmt = (sql, a = []) => ({ bind: (...x) => stmt(sql, x), first: async () => null, all: async () => ({ results: [] }), run: async () => { if (sql.includes("INSERT INTO owner_audit_log")) audits.push(a); return { meta: {} }; } });
  const env = { DB: { prepare: sql => stmt(sql), batch: async () => [] }, OWNER_READONLY_TOKEN: TOKEN };
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const denied = await worker.fetch(new Request("https://eagleeye-ks.com/api/owner/users/role", { method: "POST", headers: { authorization: "Bearer " + TOKEN, origin: "https://eagleeye-ks.com", "content-type": "application/json" }, body: "{}" }), env, ctx);
  assert.ok([401, 403].includes(denied.status), "権限変更は通らない: " + denied.status);
  const ok = await worker.fetch(new Request("https://eagleeye-ks.com/owner/growth", { headers: { authorization: "Bearer " + TOKEN } }), env, ctx);
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /成長ダッシュボード/);
  assert.ok(!audits.some(a => a.includes("AGENT_REQUEST")), "見るだけの操作は監査ログに書かない（D1の書き込みを増やさない）");
  const before = audits.length;
  await worker.fetch(new Request("https://eagleeye-ks.com/swordland/refresh-events", { method: "POST", headers: { authorization: "Bearer " + TOKEN, origin: "https://eagleeye-ks.com" } }), env, ctx);
  assert.ok(audits.slice(before).some(a => a.includes("AGENT_REQUEST")), "書き換えの操作は監査ログに記録");
});
