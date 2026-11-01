import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { handleClientTelemetry, isSameOriginRequest } from "../src/client-telemetry.js";

const read = name => readFile(new URL("../src/" + name, import.meta.url), "utf8");

function req(headers) {
  return new Request("https://eagleeye.example/api/client-telemetry", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ events: [{ type: "JS_ERROR", page: "/", message: "x" }] })
  });
}

test("client telemetry only accepts same-origin browser requests", async () => {
  assert.equal(isSameOriginRequest(req({ origin: "https://eagleeye.example" })), true);
  assert.equal(isSameOriginRequest(req({ referer: "https://eagleeye.example/player" })), true);
  assert.equal(isSameOriginRequest(req({})), false, "no Origin/Referer (curl) is rejected");
  assert.equal(isSameOriginRequest(req({ origin: "https://evil.example" })), false);
  assert.equal(isSameOriginRequest(req({ origin: "https://eagleeye.example", "sec-fetch-site": "cross-site" })), false);
  let writes = 0;
  const env = { DB: { prepare: () => ({ bind: () => ({ run: async () => { writes++; return {}; } }) }) } };
  const response = await handleClientTelemetry(req({}), env);
  assert.equal(response.status, 403);
  assert.equal(writes, 0);
});

test("public ranking API no longer writes a system-log row per request", async () => {
  const portal = await read("kingdom-portal.js");
  assert.ok(!portal.includes('operation: "READ_CURRENT_RANKING"'));
});

test("kingdom portal escapes single quotes used in attributes", async () => {
  const portal = await read("kingdom-portal.js");
  assert.ok(portal.includes(`.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]))`));
});

test("alliance page fetches upstream only for signed-in users, throttled per alliance", async () => {
  const portal = await read("kingdom-portal.js");
  const index = await read("index.js");
  assert.ok(index.includes('if (url.pathname === "/alliance") { const auth = await getAuthenticatedUser(request, env); return eagleEyeHtmlResponse(await renderAlliancePage(request, env, auth)); }'));
  assert.ok(portal.includes('const signedIn = Boolean(auth && auth.status === "ACTIVE");'));
  assert.ok(portal.includes("await claimAllianceRefresh(env.DB, kid, row.aid || row.abbr || tag, now)"));
  assert.ok(portal.includes("WHERE api_request_locks.lock_until <= ?"));
});

test("data coverage lists VIP users", async () => {
  const index = await read("index.js");
  const coverage = await read("admin-data-coverage.js");
  assert.ok(index.includes('["OWNER", "ADMIN", "VIP", "ADVANCED", "BASIC"].includes(role)'));
  assert.ok(coverage.includes('data-role="VIP"'));
});
