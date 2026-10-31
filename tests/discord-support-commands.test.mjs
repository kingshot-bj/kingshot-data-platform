import test from "node:test";
import assert from "node:assert/strict";
import { closeSupportTicket, reopenSupportTicket, describeSupportCommandFailure } from "../src/discord-support.js";

const GUILD_ID = "1554824550859153448";
const SUPPORT_CATEGORY = "1554824550859150001";
const ARCHIVE_CATEGORY = "1554824550859150002";
const ROLE_ID = "1554824550859150003";
const CHANNEL_ID = "1566160016661028904";
const USER_ID = "123456789012345678";
const TOPIC = `EagleEye Support EE-20261031-5WV9 | user=${USER_ID} | status=OPEN | category=ACCOUNT | subcategory=LOGIN`;

const env = {
  DB: null,
  DISCORD_BOT_TOKEN: "bot-token-SECRET",
  DISCORD_SUPPORT_GUILD_ID: GUILD_ID,
  DISCORD_SUPPORT_CATEGORY_ID: SUPPORT_CATEGORY,
  DISCORD_SUPPORT_ARCHIVE_CATEGORY_ID: ARCHIVE_CATEGORY,
  DISCORD_SUPPORT_ROLE_ID: ROLE_ID
};

// In-memory Discord channel that applies PATCH bodies and counts topic edits.
function installDiscordChannel(parentId) {
  const channel = {
    id: CHANNEL_ID,
    guild_id: GUILD_ID,
    parent_id: parentId,
    topic: TOPIC,
    permission_overwrites: [{ id: USER_ID, type: 1, allow: "68608", deny: "0" }]
  };
  const state = { channel, topicEdits: 0, patches: [] };
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url).replace("https://discord.com/api/v10", "");
    assert.equal(path, `/channels/${CHANNEL_ID}`);
    if ((init.method || "GET") === "PATCH") {
      const body = JSON.parse(init.body);
      state.patches.push(body);
      if ("topic" in body) {
        state.topicEdits++;
        if (state.topicEdits > 2) return new Response(JSON.stringify({ message: "The resource is being rate limited.", retry_after: 412.5, global: false }), { status: 429 });
        channel.topic = body.topic;
      }
      if (body.parent_id) channel.parent_id = body.parent_id;
      if (body.permission_overwrites) channel.permission_overwrites = body.permission_overwrites;
    }
    return new Response(JSON.stringify(channel), { status: 200 });
  };
  state.restore = () => { globalThis.fetch = original; };
  return state;
}

test("close moves the ticket to the archive category without editing the topic", async () => {
  const state = installDiscordChannel(SUPPORT_CATEGORY);
  try {
    const result = await closeSupportTicket(env, { channelId: CHANNEL_ID });
    assert.equal(result.status, "CLOSED");
    assert.equal(state.channel.parent_id, ARCHIVE_CATEGORY);
    assert.ok(!("topic" in state.patches[0]), "topic must not be edited");
    const user = state.channel.permission_overwrites.find(o => o.id === USER_ID);
    assert.equal(user.allow, "0");
    assert.equal(user.deny, "68608");
  } finally { state.restore(); }
});

test("close → reopen → close → reopen within minutes never edits the topic (no 2-per-10-min limit)", async () => {
  const state = installDiscordChannel(SUPPORT_CATEGORY);
  try {
    await closeSupportTicket(env, { channelId: CHANNEL_ID });
    await reopenSupportTicket(env, { channelId: CHANNEL_ID });
    await closeSupportTicket(env, { channelId: CHANNEL_ID });
    const reopened = await reopenSupportTicket(env, { channelId: CHANNEL_ID });
    assert.equal(reopened.status, "OPEN");
    assert.equal(state.topicEdits, 0);
    assert.equal(state.channel.parent_id, SUPPORT_CATEGORY);
    const user = state.channel.permission_overwrites.find(o => o.id === USER_ID);
    assert.equal(user.allow, "68608");
  } finally { state.restore(); }
});

test("reopen treats the archive category as closed, regardless of the legacy topic status", async () => {
  const state = installDiscordChannel(ARCHIVE_CATEGORY); // topic still says status=OPEN
  try {
    const result = await reopenSupportTicket(env, { channelId: CHANNEL_ID });
    assert.equal(result.status, "OPEN");
    assert.equal(state.channel.parent_id, SUPPORT_CATEGORY);
  } finally { state.restore(); }
});

test("reopen refuses a ticket that is still open", async () => {
  const state = installDiscordChannel(SUPPORT_CATEGORY);
  try {
    await assert.rejects(reopenSupportTicket(env, { channelId: CHANNEL_ID }), { message: "SUPPORT_TICKET_NOT_CLOSED" });
    assert.equal(state.patches.length, 0);
  } finally { state.restore(); }
});

test("rate limit failures tell the operator how long to wait", () => {
  const error = Object.assign(new Error("The resource is being rate limited."), { status: 429, discord: { retry_after: 412.5 } });
  const failure = describeSupportCommandFailure(error, "close");
  assert.equal(failure.code, "DISCORD_RATE_LIMITED");
  assert.equal(failure.retryAfterSeconds, 413);
  assert.ok(failure.content.includes("約7分後"));
});

test("missing permission failures point at the category bot permissions", () => {
  const error = Object.assign(new Error("Missing Permissions"), { status: 403, discord: { code: 50013 } });
  const failure = describeSupportCommandFailure(error, "close");
  assert.equal(failure.code, "DISCORD_MISSING_PERMISSIONS");
  assert.ok(failure.content.includes("サポート窓口クローズ"));
  assert.ok(!failure.content.includes("SECRET"));
});

test("reopen on an open ticket gets a specific message", () => {
  const failure = describeSupportCommandFailure(new Error("SUPPORT_TICKET_NOT_CLOSED"), "reopen");
  assert.equal(failure.code, "SUPPORT_TICKET_NOT_CLOSED");
  assert.ok(failure.content.includes("クローズされていない"));
});
