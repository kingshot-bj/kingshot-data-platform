import { runSystemOperation, createSystemTrace } from "./system-log.js";
import { recordDiagnostic } from "./diagnostics.js";

const DISCORD_API_BASE = "https://discord.com/api/v10";
const TICKET_ID_RE = /^EE-\d{8}-[A-Z0-9]{4}$/;

export const SUPPORT_CATALOG = [
  { key:"ACCOUNT", label:"アカウント", children:[
    {key:"LOGIN",label:"ログインできない",qa:"Discordログイン後に戻れない場合は、まずEagleEyeを再読み込みしてください。解決しない場合は問い合わせへ進めます。"},
    {key:"DISCORD",label:"Discord連携",qa:"Discord連携の状態を確認し、再ログインを試してください。"},
    {key:"ROLE",label:"権限・ロール",qa:"権限はEagleEye側のアカウント状態で決まります。表示内容を確認しても解決しない場合は問い合わせへ進めます。"},
    {key:"GOVERNOR_ID",label:"王国ID / 領主ID",qa:"マイKingShotから領主IDを登録できます。既に別アカウントに登録されている場合は専用サポートへ進めます。"},
    {key:"OTHER",label:"その他"}
  ]},
  { key:"DATA", label:"データ", children:[
    {key:"PLAYER",label:"プレイヤーデータ",qa:"対象の領主IDと、問題の項目を確認してください。最新取得時刻も自動診断に利用します。",fields:["governor_id","field","displayed_value","expected_value"]},
    {key:"KINGDOM",label:"王国データ",qa:"王国番号と問題の内容を確認します。",fields:["kid"]},
    {key:"RANKING",label:"ランキング",qa:"ランキングは取得時点・対象ボードによって表示が変わります。",fields:["kid","board"]},
    {key:"WATCHLIST",label:"ウォッチリスト",qa:"ウォッチリストの登録状態と最終取得状態を確認します。",fields:["target"]},
    {key:"STALE",label:"データが古い",qa:"EagleEyeの表示時刻と取得時刻を確認します。現在障害が検知されている場合は先に障害情報を案内します。",fields:["target"]},
    {key:"INCORRECT",label:"データが間違っている",qa:"表示値と正しいと思われる値を入力すると、サポート側で比較できます。",fields:["governor_id","field","displayed_value","expected_value"]},
    {key:"OTHER",label:"その他"}
  ]},
  { key:"API", label:"API", children:[
    {key:"MIGHTPULSE",label:"MightPulse",qa:"MightPulse側の障害・応答状態を確認します。",fields:["message"]},
    {key:"API_KEY",label:"APIキー",qa:"APIキーの登録状態やPool側の状態を確認します。キー本体は入力しないでください。"},
    {key:"FETCH_ERROR",label:"データ取得エラー",qa:"EagleEyeが検知したエラー情報を確認してから問い合わせできます。",fields:["target"]},
    {key:"OTHER",label:"その他"}
  ]},
  { key:"FEATURE", label:"機能・要望", children:[
    {key:"PLAYER_SEARCH",label:"プレイヤー検索"},
    {key:"PLAYER_WATCHLIST",label:"プレイヤーウォッチリスト"},
    {key:"KINGDOM_WATCHLIST",label:"王国ウォッチリスト"},
    {key:"MY_KINGSHOT",label:"マイKingShot"},
    {key:"RANKING",label:"ランキング"},
    {key:"OTHER",label:"その他"}
  ]},
  { key:"BUG", label:"不具合", children:[
    {key:"PAGE",label:"画面が表示されない"},
    {key:"BUTTON",label:"ボタンが動かない"},
    {key:"DATA",label:"データ取得がおかしい"},
    {key:"DISCORD",label:"Discord連携がおかしい"},
    {key:"OTHER",label:"その他"}
  ]},
  { key:"OTHER", label:"その他", children:[{key:"OTHER",label:"その他"}]}
];

function findSupportCategory(category, subcategory) {
  const parent = SUPPORT_CATALOG.find(item => item.key === String(category || "").toUpperCase());
  const child = parent?.children?.find(item => item.key === String(subcategory || "").toUpperCase());
  return parent && child ? { parent, child } : null;
}

let supportIncidentCache = { at:0, value:null };
export async function getSupportIncidentContext(env) {
  const now = Date.now();
  if (now - supportIncidentCache.at < 30000) return supportIncidentCache.value;
  if (!env?.DB) return null;
  try {
    const queryStartedAt = Date.now();
    const row = await env.DB.prepare(
      "SELECT service, feature, operation, status, error_code, message, created_at FROM diagnostic_events WHERE status IN ('FAILED','WARNING') ORDER BY created_at DESC LIMIT 1"
    ).first();
    console.log("support_incident_context_query", { elapsed_ms: Date.now() - queryStartedAt, found: Boolean(row) });
    if (!row) { supportIncidentCache={at:now,value:null}; return null; }
    const age = Math.max(0, Math.floor(Date.now()/1000)-Number(row.created_at||0));
    const active = age <= 30 * 60;
    const value = active ? {
      active:true, service:row.service, feature:row.feature, operation:row.operation,
      status:row.status, error_code:row.error_code || null, message:row.message || null,
      detected_at:Number(row.created_at||0), age_seconds:age
    } : null;
    supportIncidentCache={at:now,value};
    return value;
  } catch (error) {
    console.error("support_incident_context_failed", error?.message || error);
    supportIncidentCache={at:now,value:null};
    return null;
  }
}

export async function handleSupportContextApi(request, env, auth) {
  if (!auth?.user_id || auth.status !== "ACTIVE") return supportJson({ok:false,error:"UNAUTHORIZED"},401);
  if (request.method !== "GET") return supportJson({ok:false,error:"METHOD_NOT_ALLOWED"},405);
  return supportJson({ok:true, incident:await getSupportIncidentContext(env)});
}




function hexToBytes(value) {
  const text = String(value || "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(text)) return null;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function hexSignatureToBytes(value) {
  const text = String(value || "").trim();
  if (!/^[0-9a-fA-F]{128}$/.test(text)) return null;
  const bytes = new Uint8Array(64);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function verifyDiscordInteractionSignature(request, rawBody, publicKeyHex) {
  const publicKeyBytes = hexToBytes(publicKeyHex);
  const signatureBytes = hexSignatureToBytes(request.headers.get("X-Signature-Ed25519"));
  const timestamp = request.headers.get("X-Signature-Timestamp");
  if (!publicKeyBytes || !signatureBytes || !timestamp) return false;
  try {
    const key = await crypto.subtle.importKey("raw", publicKeyBytes, { name: "Ed25519" }, false, ["verify"]);
    const message = new TextEncoder().encode(String(timestamp) + rawBody);
    return await crypto.subtle.verify({ name: "Ed25519" }, key, signatureBytes, message);
  } catch {
    return false;
  }
}

function interactionJson(type, data = {}) {
  return new Response(JSON.stringify({ type, data }), {
    status: 200,
    headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" }
  });
}

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
  const category = String(body?.category || "").trim().toUpperCase();
  let subcategory = String(body?.subcategory || "").trim().toUpperCase();
  if (!subcategory) subcategory = "OTHER";
  const selected = findSupportCategory(category, subcategory);
  const subject = String(body?.subject || "").trim();
  const message = String(body?.message || "").trim();
  const details = body?.details && typeof body.details === "object" ? body.details : {};
  const qnaId = String(body?.qna_id || "").trim().slice(0,80);
  if (!selected) return { error: "INVALID_CATEGORY_PATH" };
  if (!subject) return { error: "SUBJECT_REQUIRED" };
  if (subject.length > 120) return { error: "SUBJECT_TOO_LONG" };
  if (message.length > 4000) return { error: "MESSAGE_TOO_LONG" };
  const fields = Array.isArray(selected.child.fields) ? selected.child.fields : [];
  const normalizedDetails = {};
  for (const field of fields) {
    const value = String(details[field] ?? "").trim();
    if (value.length > 1000) return { error: "DETAIL_TOO_LONG" };
    if (value) normalizedDetails[field] = value;
  }
  return { category, subcategory, categoryLabel:selected.parent.label, subcategoryLabel:selected.child.label, subject, message, details:normalizedDetails, qnaId };
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

async function resolveSupportDiscordConfig(env, guildId) {
  const configuredCategoryId = normalizeDiscordId(env.DISCORD_SUPPORT_CATEGORY_ID);
  const configuredRoleId = normalizeDiscordId(env.DISCORD_SUPPORT_ROLE_ID);
  const configuredArchiveCategoryId = normalizeDiscordId(env.DISCORD_SUPPORT_ARCHIVE_CATEGORY_ID);

  // Explicit IDs remain the primary configuration. If one is missing, resolve
  // it from the configured support server by its stable human-readable name.
  if (configuredCategoryId && configuredRoleId && configuredArchiveCategoryId) {
    return {
      categoryId: configuredCategoryId,
      supportRoleId: configuredRoleId,
      archiveCategoryId: configuredArchiveCategoryId
    };
  }

  const [channels, roles] = await Promise.all([
    discordRequest(env, `/guilds/${guildId}/channels`),
    discordRequest(env, `/guilds/${guildId}/roles`)
  ]);

  const channelList = Array.isArray(channels) ? channels : [];
  const roleList = Array.isArray(roles) ? roles : [];
  const categoryId = configuredCategoryId ||
    normalizeDiscordId(channelList.find(channel =>
      Number(channel?.type) === 4 && String(channel?.name || "") === "サポート窓口"
    )?.id);
  const archiveCategoryId = configuredArchiveCategoryId ||
    normalizeDiscordId(channelList.find(channel =>
      Number(channel?.type) === 4 && String(channel?.name || "") === "サポート窓口クローズ"
    )?.id);
  const supportRoleId = configuredRoleId ||
    normalizeDiscordId(roleList.find(role =>
      !role?.managed && String(role?.name || "") === "EagleEye Support"
    )?.id);

  if (!categoryId) throw new Error("DISCORD_SUPPORT_CATEGORY_ID_NOT_CONFIGURED");
  if (!supportRoleId) throw new Error("DISCORD_SUPPORT_ROLE_ID_NOT_CONFIGURED");
  if (!archiveCategoryId) throw new Error("DISCORD_SUPPORT_ARCHIVE_CATEGORY_ID_NOT_CONFIGURED");

  return { categoryId, supportRoleId, archiveCategoryId };
}

function buildInitialMessage({ ticketId, user, category, subcategory, categoryLabel, subcategoryLabel, subject, message, details, qnaId, incident }) {
  const detailLines = Object.entries(details || {}).map(([key,value]) => `**${key}:** ${value}`);
  return [
    `# EagleEye Support ${ticketId}`, "", "**Status:** OPEN",
    `**User:** <@${user.discordId}>`, `**Discord ID:** ${user.discordId}`, `**Role:** ${user.role || "UNKNOWN"}`,
    `**Category:** ${categoryLabel} > ${subcategoryLabel}`, `**Category Key:** ${category} > ${subcategory}`,
    `**Subject:** ${subject}`, qnaId ? `**Q&A:** ${qnaId}` : "**Q&A:** 未解決",
    incident?.active ? `**Related Incident:** ${incident.service} / ${incident.status} / ${incident.error_code || "unknown"}` : "**Related Incident:** なし",
    detailLines.length ? "" : null, ...detailLines, "", "**Inquiry:**", message || "（補足なし）", "",
    "_Reply in this channel. Support operators may use the channel's close workflow when the inquiry is resolved._"
  ].filter(line => line !== null).join("\n");
}

async function createSupportTicketInternal(env, {
  user, category, subcategory, categoryLabel, subcategoryLabel, subject, message, details, qnaId, incident
}) {
  const guildId = normalizeDiscordId(env.DISCORD_SUPPORT_GUILD_ID);
  const botUserId = normalizeDiscordId(env.DISCORD_CLIENT_ID);
  const discordUserId = normalizeDiscordId(user?.discord_id);

  if (!guildId) throw new Error("DISCORD_SUPPORT_GUILD_ID_NOT_CONFIGURED");
  if (!botUserId) throw new Error("DISCORD_CLIENT_ID_NOT_CONFIGURED");
  const supportConfig = await resolveSupportDiscordConfig(env, guildId);
  const { categoryId, supportRoleId } = supportConfig;
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
      topic: `EagleEye Support ${ticketId} | user=${discordUserId} | status=OPEN | category=${category} | subcategory=${subcategory}`,
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
          category, subcategory, categoryLabel, subcategoryLabel, subject, message, details, qnaId, incident
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

async function closeSupportTicketInternal(env, {
  channelId
}) {
  const id = normalizeDiscordId(channelId);
  if (!id) throw new Error("DISCORD_CHANNEL_ID_REQUIRED");

  const configuredGuildId = normalizeDiscordId(env.DISCORD_SUPPORT_GUILD_ID);
  if (!configuredGuildId) throw new Error("DISCORD_SUPPORT_GUILD_ID_NOT_CONFIGURED");
  const supportConfig = await resolveSupportDiscordConfig(env, configuredGuildId);
  const { supportRoleId, categoryId: supportCategoryId, archiveCategoryId } = supportConfig;

  const channel = await discordRequest(env, `/channels/${id}`);
  const archiveCategoryIdForCheck = archiveCategoryId;
  const topic = String(channel?.topic || "");
  const topicTicket = topic.match(/EagleEye Support (EE-\d{8}-[A-Z0-9]{4})/);
  const topicUser = topic.match(/\buser=(\d{15,25})\b/);
  if (!configuredGuildId || String(channel?.guild_id || "") !== configuredGuildId) throw new Error("SUPPORT_CHANNEL_WRONG_GUILD");
  if (!topicTicket) throw new Error("NOT_EAGLEEYE_SUPPORT_CHANNEL");
  if (![supportCategoryId, archiveCategoryIdForCheck].filter(Boolean).includes(String(channel?.parent_id || ""))) {
    throw new Error("SUPPORT_CHANNEL_WRONG_CATEGORY");
  }

  const overwrites = Array.isArray(channel?.permission_overwrites)
    ? channel.permission_overwrites.map(item => ({ ...item }))
    : [];
  const userOverwrite = topicUser
    ? overwrites.find(item => item.type === 1 && String(item.id) === topicUser[1])
    : null;
  if (!userOverwrite) throw new Error("SUPPORT_TICKET_USER_PERMISSION_NOT_FOUND");

  userOverwrite.allow = "0";
  userOverwrite.deny = "68608";

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
    ticketId: topicTicket[1],
    status: "CLOSED",
    channelUrl: updated?.guild_id
      ? `https://discord.com/channels/${updated.guild_id}/${id}`
      : null
  };
}

async function reopenSupportTicketInternal(env, {
  channelId
}) {
  const id = normalizeDiscordId(channelId);
  if (!id) throw new Error("DISCORD_CHANNEL_ID_REQUIRED");

  const configuredGuildId = normalizeDiscordId(env.DISCORD_SUPPORT_GUILD_ID);
  if (!configuredGuildId) throw new Error("DISCORD_SUPPORT_GUILD_ID_NOT_CONFIGURED");
  const supportConfig = await resolveSupportDiscordConfig(env, configuredGuildId);
  const { supportRoleId, categoryId: supportCategoryId, archiveCategoryId } = supportConfig;

  const channel = await discordRequest(env, `/channels/${id}`);
  const topic = String(channel?.topic || "");
  const topicTicket = topic.match(/EagleEye Support (EE-\d{8}-[A-Z0-9]{4})/);
  const topicUser = topic.match(/\buser=(\d{15,25})\b/);
  const statusMatch = topic.match(/status=(OPEN|WAITING|CLOSED)/);
  if (!configuredGuildId || String(channel?.guild_id || "") !== configuredGuildId) throw new Error("SUPPORT_CHANNEL_WRONG_GUILD");
  if (!topicTicket) throw new Error("NOT_EAGLEEYE_SUPPORT_CHANNEL");
  if (!statusMatch || statusMatch[1] !== "CLOSED") throw new Error("SUPPORT_TICKET_NOT_CLOSED");
  if (![supportCategoryId, archiveCategoryId].filter(Boolean).includes(String(channel?.parent_id || ""))) {
    throw new Error("SUPPORT_CHANNEL_WRONG_CATEGORY");
  }

  const overwrites = Array.isArray(channel?.permission_overwrites)
    ? channel.permission_overwrites.map(item => ({ ...item }))
    : [];
  const userOverwrite = topicUser
    ? overwrites.find(item => item.type === 1 && String(item.id) === topicUser[1])
    : null;
  if (!userOverwrite) throw new Error("SUPPORT_TICKET_USER_PERMISSION_NOT_FOUND");

  userOverwrite.allow = "68608";
  userOverwrite.deny = "0";

  const updated = await discordRequest(env, `/channels/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      topic: String(channel?.topic || "").replace(/status=(OPEN|WAITING|CLOSED)/, "status=OPEN"),
      parent_id: supportCategoryId,
      permission_overwrites: overwrites
    })
  });

  return {
    channelId: id,
    ticketId: topicTicket[1],
    status: "OPEN",
    channelUrl: updated?.guild_id
      ? `https://discord.com/channels/${updated.guild_id}/${id}`
      : null
  };
}

async function recordSupportDiagnostic(env, input = {}) {
  if (!env?.DB) return null;
  return recordDiagnostic(env.DB, {
    service: "discord_support",
    feature: input.feature || "support_ticket",
    ...input
  });
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
        category: input.category, subcategory: input.subcategory,
        categoryLabel: input.categoryLabel, subcategoryLabel: input.subcategoryLabel,
        subject: input.subject, message: input.message, details: input.details, qnaId: input.qnaId,
        incident: await getSupportIncidentContext(env)
      });
      await recordSupportDiagnostic(env, {
        operation: "CREATE_TICKET",
        status: "SUCCESS",
        targetType: "TICKET",
        targetId: result.ticketId,
        message: "Discord問い合わせチケット作成成功",
        metadata: { channelId: result.channelId, category: input.category, subcategory: input.subcategory }
      });
      return supportJson({ ok: true, ...result }, 201);
    } catch (error) {
      const status = Number(error?.status || 0);
      const code = String(error?.message || "SUPPORT_TICKET_CREATE_FAILED");
      await recordSupportDiagnostic(env, {
        operation: "CREATE_TICKET",
        status: "FAILED",
        errorCode: code.split(":")[0],
        message: code.slice(0, 2000),
        metadata: { httpStatus: status || null }
      });
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


export async function handleSupportInteraction(request, env) {
  if (request.method !== "POST") return supportJson({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!env.DISCORD_PUBLIC_KEY) return supportJson({ ok: false, error: "DISCORD_PUBLIC_KEY_NOT_CONFIGURED" }, 503);

  const rawBody = await request.text();
  if (!(await verifyDiscordInteractionSignature(request, rawBody, env.DISCORD_PUBLIC_KEY))) {
    return supportJson({ ok: false, error: "INVALID_DISCORD_SIGNATURE" }, 401);
  }

  let interaction;
  try { interaction = JSON.parse(rawBody); } catch {
    return supportJson({ ok: false, error: "INVALID_JSON" }, 400);
  }

  if (Number(interaction?.type) === 1) return interactionJson(1);

  const commandName = String(interaction?.data?.name || "");
  if (Number(interaction?.type) !== 2 || !["close", "reopen"].includes(commandName)) {
    return interactionJson(4, { content: "このコマンドはEagleEye Supportでは使用できません。", flags: 64 });
  }

  const supportRoleId = normalizeDiscordId(env.DISCORD_SUPPORT_ROLE_ID);
  const guildId = normalizeDiscordId(env.DISCORD_SUPPORT_GUILD_ID);
  const channelId = normalizeDiscordId(interaction?.channel_id);
  const actorRoles = Array.isArray(interaction?.member?.roles) ? interaction.member.roles.map(String) : [];

  if (!supportRoleId || !guildId) {
    return interactionJson(4, { content: "EagleEye SupportのDiscord設定が未完了です。", flags: 64 });
  }
  if (String(interaction?.guild_id || "") !== guildId) {
    return interactionJson(4, { content: "このコマンドはEagleEye Supportサーバーでのみ使用できます。", flags: 64 });
  }
  if (!actorRoles.includes(supportRoleId)) {
    return interactionJson(4, { content: "Support担当者のみ実行できます。", flags: 64 });
  }
  if (!channelId) {
    return interactionJson(4, { content: "チャンネル情報を取得できませんでした。", flags: 64 });
  }

  try {
    if (commandName === "close") {
      const result = await closeSupportTicket(env, { channelId });
      await recordSupportDiagnostic(env, {
        operation: "CLOSE_TICKET",
        status: "SUCCESS",
        targetType: "TICKET",
        targetId: result.ticketId,
        message: "Discord問い合わせクローズ成功",
        metadata: { channelId: result.channelId }
      });
      return interactionJson(4, { content: "問い合わせをクローズしました。", flags: 64 });
    }

    const result = await reopenSupportTicket(env, { channelId });
    await recordSupportDiagnostic(env, {
      operation: "REOPEN_TICKET",
      status: "SUCCESS",
      targetType: "TICKET",
      targetId: result.ticketId,
      message: "Discord問い合わせリオープン成功",
      metadata: { channelId: result.channelId }
    });
    return interactionJson(4, { content: "問い合わせをリオープンしました。ユーザーが再び投稿できます。", flags: 64 });
  } catch (error) {
    await recordSupportDiagnostic(env, {
      operation: commandName === "close" ? "CLOSE_TICKET" : "REOPEN_TICKET",
      status: "FAILED",
      errorCode: String(error?.message || "SUPPORT_COMMAND_FAILED").split(":")[0],
      message: String(error?.message || error).slice(0, 2000),
      targetType: "CHANNEL",
      targetId: channelId
    });
    console.error(`support_${commandName}_failed`, error?.message || error);
    const message = commandName === "close"
      ? "問い合わせのクローズに失敗しました。"
      : "問い合わせのリオープンに失敗しました。";
    return interactionJson(4, { content: message, flags: 64 });
  }
}

async function registerOrUpdateSupportCommand(env, applicationId, guildId, command) {
  const commands = await discordRequest(
    env,
    `/applications/${applicationId}/guilds/${guildId}/commands`
  );
  const existing = Array.isArray(commands)
    ? commands.find(item => String(item?.name || "") === command.name && Number(item?.type || 1) === 1)
    : null;

  if (existing?.id) {
    return await discordRequest(
      env,
      `/applications/${applicationId}/guilds/${guildId}/commands/${existing.id}`,
      {
        method: "PATCH",
        body: JSON.stringify(command)
      }
    );
  }

  return await discordRequest(
    env,
    `/applications/${applicationId}/guilds/${guildId}/commands`,
    {
      method: "POST",
      body: JSON.stringify(command)
    }
  );
}

export async function registerSupportCommands(env) {
  const applicationId = normalizeDiscordId(env.DISCORD_CLIENT_ID);
  const guildId = normalizeDiscordId(env.DISCORD_SUPPORT_GUILD_ID);
  if (!applicationId) throw new Error("DISCORD_CLIENT_ID_NOT_CONFIGURED");
  if (!guildId) throw new Error("DISCORD_SUPPORT_GUILD_ID_NOT_CONFIGURED");

  const commands = [
    {
      name: "close",
      description: "EagleEyeの問い合わせをクローズします",
      type: 1
    },
    {
      name: "reopen",
      description: "EagleEyeのクローズ済み問い合わせを再開します",
      type: 1
    }
  ];

  const results = [];
  for (const command of commands) {
    results.push(await registerOrUpdateSupportCommand(env, applicationId, guildId, command));
  }
  return results;
}

// Backward-compatible export name for the existing admin route.
export async function registerSupportCloseCommand(env) {
  const results = await registerSupportCommands(env);
  return results.find(command => String(command?.name || "") === "close") || results[0] || null;
}


export async function createSupportTicket(env, options) {
  const trace = createSystemTrace({ actorType: "USER", actorId: options?.user?.discordId || null, targetType: "SUPPORT_TICKET", targetId: options?.ticketId || null });
  return runSystemOperation(env?.DB || null, trace, {
    eventType: "EXTERNAL_API", service: "discord_support", feature: "support",
    operation: "CREATE_SUPPORT_TICKET", targetType: "SUPPORT_TICKET", targetId: options?.ticketId || null
  }, () => createSupportTicketInternal(env, options));
}

export async function closeSupportTicket(env, options) {
  const trace = createSystemTrace({ actorType: "USER", actorId: options?.userId || null, targetType: "SUPPORT_TICKET", targetId: options?.ticketId || null });
  return runSystemOperation(env?.DB || null, trace, {
    eventType: "EXTERNAL_API", service: "discord_support", feature: "support",
    operation: "CLOSE_SUPPORT_TICKET", targetType: "SUPPORT_TICKET", targetId: options?.ticketId || null
  }, () => closeSupportTicketInternal(env, options));
}

export async function reopenSupportTicket(env, options) {
  const trace = createSystemTrace({ actorType: "USER", actorId: options?.userId || null, targetType: "SUPPORT_TICKET", targetId: options?.ticketId || null });
  return runSystemOperation(env?.DB || null, trace, {
    eventType: "EXTERNAL_API", service: "discord_support", feature: "support",
    operation: "REOPEN_SUPPORT_TICKET", targetType: "SUPPORT_TICKET", targetId: options?.ticketId || null
  }, () => reopenSupportTicketInternal(env, options));
}
