import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { joinDiscordSupportGuild, getDiscordConfigCheck, resetDiscordApplicationCache } from "../src/discord-oauth.js";

const BOT_TOKEN = "bot-token-SECRET-value";
const USER_TOKEN = "user-access-token-SECRET-value";
const PUBLIC_KEY = "ab".repeat(32);
const APP_ID = "1554817307988205618";
const OTHER_APP_ID = "1552660062063829093";
const GUILD_ID = "1554824550859153448";
const USER_ID = "123456789012345678";

const baseEnv = {
  DISCORD_CLIENT_ID: APP_ID,
  DISCORD_BOT_TOKEN: BOT_TOKEN,
  DISCORD_SUPPORT_GUILD_ID: GUILD_ID,
  DISCORD_PUBLIC_KEY: PUBLIC_KEY
};

function jsonResponse(status, body) {
  return new Response(body === undefined ? "" : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// Routes Discord API calls to handlers and records every request.
function mockDiscord(routes) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const path = String(url).replace("https://discord.com/api/v10", "");
    const method = init.method || "GET";
    calls.push({ method, path, init });
    const handler = routes[method + " " + path];
    if (!handler) throw new Error("unexpected Discord call " + method + " " + path);
    return handler(init);
  };
  return { fetchImpl, calls };
}

const appRoute = (id = APP_ID) => () => jsonResponse(200, { id, verify_key: PUBLIC_KEY, interactions_endpoint_url: "https://example.workers.dev/api/discord/interactions" });
const memberPath = `/guilds/${GUILD_ID}/members/${USER_ID}`;

function assertNoSecrets(value) {
  const text = JSON.stringify(value);
  assert.ok(!text.includes(BOT_TOKEN), "bot token must not appear");
  assert.ok(!text.includes(USER_TOKEN), "user token must not appear");
  assert.ok(!text.includes(PUBLIC_KEY), "public key must not be echoed");
}

test.beforeEach(() => resetDiscordApplicationCache());

test("app mismatch skips the guild join request and reports a dedicated code", async () => {
  const { fetchImpl, calls } = mockDiscord({ "GET /applications/@me": appRoute(APP_ID) });
  const env = { ...baseEnv, DISCORD_CLIENT_ID: OTHER_APP_ID };
  await assert.rejects(joinDiscordSupportGuild(env, USER_ID, USER_TOKEN, { fetchImpl }), error => {
    assert.equal(error.code, "DISCORD_OAUTH_BOT_APP_MISMATCH");
    assert.equal(error.oauthDiagnostics.botApplicationId, APP_ID);
    assert.equal(error.oauthDiagnostics.configuredClientId, OTHER_APP_ID);
    assert.equal(error.oauthDiagnostics.clientIdMatchesBotApplication, false);
    assertNoSecrets({ message: error.message, diagnostics: error.oauthDiagnostics });
    return true;
  });
  assert.equal(calls.filter(c => c.method === "PUT").length, 0, "must not call the join endpoint");
});

test("matching app joins, verifies membership and reports ADDED", async () => {
  const { fetchImpl, calls } = mockDiscord({
    "GET /applications/@me": appRoute(),
    ["PUT " + memberPath]: () => jsonResponse(201, { user: { id: USER_ID } }),
    ["GET " + memberPath]: () => jsonResponse(200, { user: { id: USER_ID } })
  });
  const result = await joinDiscordSupportGuild(baseEnv, USER_ID, USER_TOKEN, { fetchImpl });
  assert.equal(result.result, "ADDED");
  assert.equal(result.membershipVerified, true);
  assert.equal(result.oauthDiagnostics.joinHttpStatus, 201);
  assert.equal(result.oauthDiagnostics.membershipVerifyHttpStatus, 200);
  assert.equal(result.oauthDiagnostics.clientIdMatchesBotApplication, true);
  assert.ok(!calls.some(c => c.path === "/oauth2/@me"), "token-info lookup is only for failures");
  const put = calls.find(c => c.method === "PUT");
  assert.equal(JSON.parse(put.init.body).access_token, USER_TOKEN);
  assert.equal(put.init.headers.Authorization, "Bot " + BOT_TOKEN);
  assertNoSecrets(result);
});

test("existing member is reported as ALREADY_MEMBER", async () => {
  const { fetchImpl } = mockDiscord({
    "GET /applications/@me": appRoute(),
    ["PUT " + memberPath]: () => new Response(null, { status: 204 }),
    ["GET " + memberPath]: () => jsonResponse(200, { user: { id: USER_ID } })
  });
  const result = await joinDiscordSupportGuild(baseEnv, USER_ID, USER_TOKEN, { fetchImpl });
  assert.equal(result.result, "ALREADY_MEMBER");
});

test("bot application lookup is cached across logins", async () => {
  const { fetchImpl, calls } = mockDiscord({
    "GET /applications/@me": appRoute(),
    ["PUT " + memberPath]: () => new Response(null, { status: 204 }),
    ["GET " + memberPath]: () => jsonResponse(200, {})
  });
  await joinDiscordSupportGuild(baseEnv, USER_ID, USER_TOKEN, { fetchImpl });
  await joinDiscordSupportGuild(baseEnv, USER_ID, USER_TOKEN, { fetchImpl });
  assert.equal(calls.filter(c => c.path === "/applications/@me").length, 1);
});

test("50025 join failure collects token diagnostics without leaking secrets", async () => {
  const { fetchImpl } = mockDiscord({
    "GET /applications/@me": appRoute(),
    ["PUT " + memberPath]: () => jsonResponse(403, { code: 50025, message: "Invalid OAuth2 access token" }),
    "GET /oauth2/@me": () => jsonResponse(200, { application: { id: OTHER_APP_ID }, scopes: ["identify", "guilds.join"] })
  });
  await assert.rejects(joinDiscordSupportGuild(baseEnv, USER_ID, USER_TOKEN, { fetchImpl }), error => {
    assert.equal(error.code, "DISCORD_GUILD_JOIN_FAILED");
    assert.equal(error.status, 403);
    assert.equal(error.discord.code, 50025);
    assert.equal(error.oauthDiagnostics.oauthApplicationId, OTHER_APP_ID);
    assert.deepEqual(error.oauthDiagnostics.oauthScopes, ["identify", "guilds.join"]);
    assertNoSecrets({ message: error.message, discord: error.discord, diagnostics: error.oauthDiagnostics });
    return true;
  });
});

test("membership not confirmed after join keeps the dedicated code", async () => {
  const { fetchImpl } = mockDiscord({
    "GET /applications/@me": appRoute(),
    ["PUT " + memberPath]: () => jsonResponse(201, {}),
    ["GET " + memberPath]: () => jsonResponse(404, { code: 10007, message: "Unknown Member" })
  });
  await assert.rejects(joinDiscordSupportGuild(baseEnv, USER_ID, USER_TOKEN, { fetchImpl }), { code: "DISCORD_GUILD_MEMBERSHIP_NOT_CONFIRMED" });
});

test("failed bot application lookup does not block the join attempt", async () => {
  const { fetchImpl, calls } = mockDiscord({
    "GET /applications/@me": () => jsonResponse(500, {}),
    ["PUT " + memberPath]: () => jsonResponse(201, {}),
    ["GET " + memberPath]: () => jsonResponse(200, {})
  });
  const result = await joinDiscordSupportGuild(baseEnv, USER_ID, USER_TOKEN, { fetchImpl });
  assert.equal(result.result, "ADDED");
  assert.equal(result.oauthDiagnostics.botApplicationHttpStatus, 500);
  assert.equal(calls.filter(c => c.method === "PUT").length, 1);
});

test("hanging Discord calls time out instead of holding the login", async () => {
  const fetchImpl = (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "TimeoutError" })));
  });
  // AbortSignal.timeout timers are unref'd in Node; keep the loop alive for the test.
  const keepAlive = setInterval(() => {}, 100);
  try {
    const started = Date.now();
    await assert.rejects(joinDiscordSupportGuild(baseEnv, USER_ID, USER_TOKEN, { fetchImpl, timeoutMs: 500 }), { code: "DISCORD_API_TIMEOUT" });
    assert.ok(Date.now() - started < 3000, "timeouts must bound total latency");
  } finally {
    clearInterval(keepAlive);
  }
});

test("config check reports matches, command registration and hides the public key", async () => {
  const origin = "https://example.workers.dev";
  const { fetchImpl } = mockDiscord({
    "GET /applications/@me": appRoute(),
    [`GET /applications/${APP_ID}/guilds/${GUILD_ID}/commands`]: () => jsonResponse(200, [{ name: "close" }])
  });
  const check = await getDiscordConfigCheck(baseEnv, { origin, fetchImpl });
  assert.equal(check.botApplication.id, APP_ID);
  assert.equal(check.clientIdMatchesBotApplication, true);
  assert.equal(check.publicKeyMatches, true);
  assert.equal(check.interactionsEndpointMatches, true);
  assert.equal(check.commands.close, true);
  assert.equal(check.commands.reopen, false);
  assertNoSecrets(check);
});

test("config check flags a public key from another application", async () => {
  const { fetchImpl } = mockDiscord({
    "GET /applications/@me": appRoute(),
    [`GET /applications/${APP_ID}/guilds/${GUILD_ID}/commands`]: () => jsonResponse(200, [])
  });
  const check = await getDiscordConfigCheck({ ...baseEnv, DISCORD_PUBLIC_KEY: "cd".repeat(32) }, { origin: "https://example.workers.dev", fetchImpl });
  assert.equal(check.publicKeyConfigured, true);
  assert.equal(check.publicKeyMatches, false);
});

test("login callback keeps guild join non-blocking and the support membership gate intact", async () => {
  const index = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  const support = await readFile(new URL("../src/discord-support.js", import.meta.url), "utf8");
  assert.ok(index.includes('import { joinDiscordSupportGuild, getDiscordConfigCheck } from "./discord-oauth.js";'));
  assert.ok(!index.includes("async function joinDiscordSupportGuild("), "join logic must live in discord-oauth.js only");
  const callback = index.slice(index.indexOf("async function handleDiscordCallback("), index.indexOf("async function upsertUser("));
  const joinAt = callback.indexOf("await joinDiscordSupportGuild(");
  assert.ok(joinAt > 0);
  const tryAt = callback.lastIndexOf("try {", joinAt);
  assert.ok(tryAt > 0 && joinAt - tryAt < 120, "join must be wrapped in try/catch");
  assert.ok(callback.indexOf("} catch (error) {", joinAt) > joinAt, "join failure must be caught");
  assert.ok(callback.indexOf("signPayload(sessionPayload") > joinAt, "session is still issued after the join attempt");
  assert.ok(support.includes("DISCORD_SUPPORT_GUILD_MEMBERSHIP_REQUIRED"), "ticket creation must still require membership");
});
