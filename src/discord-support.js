const DISCORD_API_BASE = "https://discord.com/api/v10";
const TICKET_ID_RE = /^EE-\d{8}-[A-Z0-9]{4}$/;

function supportJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store"
    }
  });
}

function normalizeDiscordId(value) {
  const id = String(value ?? "").trim();
  return /^\d{15,25}$/.test(id) ? id : null;
}

function generateTicketId() {
  const date = new Date();
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let suffix = "";
  for (const byte of bytes) suffix += alphabet[byte % alphabet.length];
  return `EE-${y}${m}${d}-${suffix}`;
}

function discordHeaders(env) {
  if (!env.DISCORD_BOT_TOKEN) throw new Error("DISCORD_BOT_TOKEN_NOT_CONFIGURED");
  return {
    "Authorization": `Bot ${env.DISCORD_BOT_TOKEN}`,
    "Content-Type": "application/json",
    "User-Agent": "EagleEye/1.0 (support)"
  };
}

async function discordRequest(env, path, options = {}) {
  const response = await fetch(DISCORD_API_BASE + path, {
    ...options,
    headers: {
      ...discordHeaders(env),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(data?.message || `Discord API HTTP ${response.status}`);
    error.status = response.status;
    error.discord = data;
    throw error;
  }
  return data;
}

async function getGuildMember(env, guildId, discordUserId) {
  try {
    return await discordRequest(env, `/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(discordUserId)}`);
  } catch (error) {
    if (Number(error?.status) === 404) return null;
    throw error;
  }
}

function validateTicketInput(body) {
  const category = String(body?.category || "OTHER").trim().toUpperCase();
  const subject = String(body?.subject || "").trim();
  const message = String(body?.message || "").trim();

  const allowedCategories = new Set([
    "BUG",
    "ACCOUNT",
    "DATA",
    "API",
    "BILLING",
    "FEATURE",
    "OTHER"
  ]);

  if (!allowedCategories.has(category)) {
    return { error: "INVALID_CATEGORY" };
  }
  if (!subject) return { error: "SUBJECT_REQUIRED" };
  if (subject.length > 120) return { error: "SUBJECT_TOO_LONG" };
  if (!message) return { error: "MESSAGE_REQUIRED" };
  if (message.length > 4000) return { error: "MESSAGE_TOO_LONG" };

  return { category, subject, message };
}

function permissionOverwrite(id, type, allow = "0", deny = "0") {
  return {
    id,
    type,
    allow,
    deny
  };
}

function buildChannelName(ticketId, subject) {
  const normalized = String(subject || "support")
    .toLowerCase()
    .replace(/[^a-z0-9\-\u3040-\u30ff\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 35);
  return normalized ? `ticket-${ticketId.toLowerCase()}-${normalized}`.slice(0, 100) : `ticket-${ticketId.toLowerCase()}`;
}

function buildInitialMessage({ ticketId, user, category, subject, message }) {
  return [
    `# EagleEye Support ${ticketId}`,
    "",
    "**Status:** OPEN",
    `**User:** <@${user.discordId}>`,
    `**Discord ID:** ${user.discordId}`,
    `**Role:** ${user.role || "UNKNOWN"}`,
    `**Category:** ${category}`,
    `**Subject:** ${subject}`,
    "",
    "**Inquiry:**",
    message,
    "",
    "_Reply in this channel. Support operators may use the channel's close workflow when the inquiry is resolved._"
  ].join("\n");
}

export async function createSupportTicket(env, {
  user,
  category,
  subject,
  message
}) {
  const guildId = normalizeDiscordId(env.DISCORD_SUPPORT_GUILD_ID);
  const categoryId = normalizeDiscordId(env.DISCORD_SUPPORT_CATEGORY_ID);
  const supportRoleId = normalizeDiscordId(env.DISCORD_SUPPORT_ROLE_ID);
  const botUserId = normalizeDiscordId(env.DISCORD_CLIENT_ID);
  const discordUserId = normalizeDiscordId(user?.discord_id);

  if (!guildId) throw new Error("DISCORD_SUPPORT_GUILD_ID_NOT_CONFIGURED");
  if (!categoryId) throw new Error("DISCORD_SUPPORT_CATEGORY_ID_NOT_CONFIGURED");
  if (!supportRoleId) throw new Error("DISCORD_SUPPORT_ROLE_ID_NOT_CONFIGURED");
  if (!botUserId) throw new Error("DISCORD_CLIENT_ID_NOT_CONFIGURED");
  if (!discordUserId) throw new Error("DISCORD_USER_ID_REQUIRED");

  const member = await getGuildMember(env, guildId, discordUserId);
  if (!member) {
    const error = new Error("DISCORD_SUPPORT_GUILD_MEMBERSHIP_REQUIRED");
    error.status = 409;
    throw error;
  }

  const ticketId = generateTicketId();
  if (!TICKET_ID_RE.test(ticketId)) throw new Error("INVALID_TICKET_ID");

  const channel = await discordRequest(env, `/guilds/${guildId}/channels`, {
    method: "POST",
    body: JSON.stringify({
      name: buildChannelName(ticketId, subject),
      type: 0,
      parent_id: categoryId,
      topic: `EagleEye Support ${ticketId} | user=${discordUserId} | status=OPEN`,
      permission_overwrites: [
        permissionOverwrite(guildId, 0, "0", "1024"),
        permissionOverwrite(discordUserId, 1, "68608", "0"),
        permissionOverwrite(supportRoleId, 0, "68608", "0"),
        permissionOverwrite(botUserId, 1, "68608", "0")
      ]
    })
  });

  try {
    const initialMessage = await discordRequest(env, `/channels/${channel.id}/messages`, {
      method: "POST",
      body: JSON.stringify({
        content: buildInitialMessage({
          ticketId,
          user: {
            discordId: discordUserId,
            role: user.role
          },
          category,
          subject,
          message
        }),
        allowed_mentions: {
          users: [discordUserId],
          roles: []
        }
      })
    });

    return {
      ticketId,
      channelId: channel.id,
      channelUrl: `https://discord.com/channels/${guildId}/${channel.id}`,
      messageId: initialMessage?.id || null
    };
  } catch (error) {
    // Do not leave an orphaned private support channel if the first message fails.
    try {
      await discordRequest(env, `/channels/${channel.id}`, { method: "DELETE" });
    } catch (cleanupError) {
      console.error("support_channel_cleanup_failed", cleanupError?.message || cleanupError);
    }
    throw error;
  }
}

export async function closeSupportTicket(env, {
  channelId
}) {
  const id = normalizeDiscordId(channelId);
  const archiveCategoryId = normalizeDiscordId(env.DISCORD_SUPPORT_ARCHIVE_CATEGORY_ID);
  const supportRoleId = normalizeDiscordId(env.DISCORD_SUPPORT_ROLE_ID);
  if (!id) throw new Error("DISCORD_CHANNEL_ID_REQUIRED");
  if (!supportRoleId) throw new Error("DISCORD_SUPPORT_ROLE_ID_NOT_CONFIGURED");

  const channel = await discordRequest(env, `/channels/${id}`);
  const overwrites = Array.isArray(channel?.permission_overwrites)
    ? channel.permission_overwrites.map(item => ({ ...item }))
    : [];

  const userOverwrite = overwrites.find(item => item.type === 1 && item.id !== env.DISCORD_CLIENT_ID);
  if (userOverwrite) {
    userOverwrite.allow = "0";
    userOverwrite.deny = "68608";
  }

  const payload = {
    topic: String(channel?.topic || "").replace(/status=(OPEN|WAITING|CLOSED)/, "status=CLOSED"),
    permission_overwrites: overwrites
  };
  if (archiveCategoryId) payload.parent_id = archiveCategoryId;

  const updated = await discordRequest(env, `/channels/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });

  return {
    channelId: id,
    status: "CLOSED",
    channelUrl: updated?.guild_id
      ? `https://discord.com/channels/${updated.guild_id}/${id}`
      : null
  };
}

export async function handleSupportApi(request, env, auth) {
  if (!auth?.user_id || !auth?.discord_id) return supportJson({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (auth.status !== "ACTIVE") return supportJson({ ok: false, error: "ACCOUNT_INACTIVE" }, 403);

  if (request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return supportJson({ ok: false, error: "INVALID_JSON" }, 400);
    }

    const input = validateTicketInput(body);
    if (input.error) return supportJson({ ok: false, error: input.error }, 400);

    try {
      const result = await createSupportTicket(env, {
        user: auth,
        category: input.category,
        subject: input.subject,
        message: input.message
      });
      return supportJson({ ok: true, ...result }, 201);
    } catch (error) {
      const status = Number(error?.status || 0);
      const code = String(error?.message || "SUPPORT_TICKET_CREATE_FAILED");
      console.error("support_ticket_create_failed", code);
      return supportJson({
        ok: false,
        error: code,
        ...(status ? { status } : {})
      }, status >= 400 && status < 600 ? status : 503);
    }
  }

  return supportJson({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
}
