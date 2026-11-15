import { isDiscordUserId } from "./google-auth.js";
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

export async function handleSupportMembershipApi(request, env, auth) {
  if (!auth?.user_id || !auth?.discord_id || auth.status !== "ACTIVE") return supportJson({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (request.method !== "GET") return supportJson({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  const guildId = normalizeDiscordId(env.DISCORD_SUPPORT_GUILD_ID);
  if (!guildId) return supportJson({ ok: false, error: "DISCORD_SUPPORT_GUILD_ID_NOT_CONFIGURED" }, 503);
  try {
    const member = await getGuildMember(env, guildId, auth.discord_id);
    return supportJson({ ok: true, member: Boolean(member) });
  } catch (error) {
    console.error("support_membership_check_failed", { discord_id: String(auth.discord_id), status: Number(error?.status || 0), discord_code: error?.discord?.code || null });
    return supportJson({ ok: false, error: "DISCORD_MEMBERSHIP_CHECK_FAILED" }, 503);
  }
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

export { discordRequest as discordApiRequest };

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
  // Googleなどでログインした人（仮のID）はDiscordのサーバーにいない。Discordには問い合わせない。
  if (!isDiscordUserId(discordUserId)) return null;
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

  // Ticket state is the channel's category (archive = CLOSED). Do not edit the
  // topic: Discord allows only 2 name/topic edits per channel per 10 minutes,
  // so close → reopen → close would be rate limited. Category moves and
  // permission overwrites are not subject to that limit.
  const payload = {
    permission_overwrites: overwrites,
    parent_id: archiveCategoryId
  };

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
  if (!configuredGuildId || String(channel?.guild_id || "") !== configuredGuildId) throw new Error("SUPPORT_CHANNEL_WRONG_GUILD");
  if (!topicTicket) throw new Error("NOT_EAGLEEYE_SUPPORT_CHANNEL");
  if (![supportCategoryId, archiveCategoryId].filter(Boolean).includes(String(channel?.parent_id || ""))) {
    throw new Error("SUPPORT_CHANNEL_WRONG_CATEGORY");
  }
  if (String(channel?.parent_id || "") !== String(archiveCategoryId)) throw new Error("SUPPORT_TICKET_NOT_CLOSED");

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
    const failure = describeSupportCommandFailure(error, commandName);
    await recordSupportDiagnostic(env, {
      operation: commandName === "close" ? "CLOSE_TICKET" : "REOPEN_TICKET",
      status: "FAILED",
      errorCode: failure.code,
      message: String(error?.message || error).slice(0, 2000),
      targetType: "CHANNEL",
      targetId: channelId,
      metadata: { httpStatus: Number(error?.status || 0) || null, discordCode: error?.discord?.code ?? null, retryAfterSeconds: failure.retryAfterSeconds }
    });
    console.error(`support_${commandName}_failed`, failure.code, Number(error?.status || 0) || null);
    return interactionJson(4, { content: failure.content, flags: 64 });
  }
}

// Maps a /close or /reopen failure to a diagnostic code and an operator-facing
// message. Never includes token values; only Discord status/code are used.
export function describeSupportCommandFailure(error, commandName) {
  const action = commandName === "close" ? "クローズ" : "リオープン";
  const status = Number(error?.status || 0);
  const discordCode = Number(error?.discord?.code || 0);
  const message = String(error?.message || "");
  if (status === 429) {
    const retryAfter = Number(error?.discord?.retry_after);
    const retryAfterSeconds = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : null;
    const wait = retryAfterSeconds
      ? (retryAfterSeconds >= 60 ? "約" + Math.ceil(retryAfterSeconds / 60) + "分後" : retryAfterSeconds + "秒後")
      : "しばらくしてから";
    return { code: "DISCORD_RATE_LIMITED", retryAfterSeconds, content: "Discordの回数制限中のため" + action + "できませんでした。" + wait + "に再実行してください。" };
  }
  if (discordCode === 50013 || message === "Missing Permissions") {
    return { code: "DISCORD_MISSING_PERMISSIONS", retryAfterSeconds: null, content: "Botの権限が不足しているため" + action + "できませんでした。カテゴリー「サポート窓口」「サポート窓口クローズ」でBotの権限（チャンネルを見る・チャンネルの管理・権限の管理）を確認してください。" };
  }
  if (message === "SUPPORT_TICKET_NOT_CLOSED") {
    return { code: message, retryAfterSeconds: null, content: "この問い合わせはクローズされていないため、リオープンできません。" };
  }
  if (["NOT_EAGLEEYE_SUPPORT_CHANNEL", "SUPPORT_CHANNEL_WRONG_CATEGORY", "SUPPORT_CHANNEL_WRONG_GUILD"].includes(message)) {
    return { code: message, retryAfterSeconds: null, content: "このチャンネルはEagleEyeの問い合わせチャンネルではないため、" + action + "できません。" };
  }
  return { code: message.split(":")[0] || "SUPPORT_COMMAND_FAILED", retryAfterSeconds: null, content: "問い合わせの" + action + "に失敗しました。" };
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

export async function sendDiscordNotification(env, { channelId, content, embeds = null } = {}) {
  const id = normalizeDiscordId(channelId);
  const message = String(content || "").trim();
  if (!id || !message) throw new Error("DISCORD_NOTIFICATION_INPUT_INVALID");
  return discordRequest(env, `/channels/${encodeURIComponent(id)}/messages`, {
    method: "POST",
    body: JSON.stringify({ content: message.slice(0, 2000), embeds: Array.isArray(embeds) ? embeds.slice(0,10) : undefined })
  });
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

// ---- ログインしていない人の問い合わせ（2026-11-15）----
// ・受け取る場所は今までと同じ Discord のサポートサーバー。運営ロールだけが見る共有チャンネル「web問い合わせ」に1件ずつ投稿する
//   （サポートのカテゴリの中に、無ければ Bot が作る）。相手の Discord アカウントは分からないので、返信先は任意で書いてもらう。
// ・いたずら対策：同じ IP（ハッシュだけ使い、保存はしない）からは10分に1件、全体で1日50件まで。URL は2個まで。隠し項目（website）に何か入っていたら捨てる。
// ・Discord の @everyone などは鳴らさない（allowed_mentions: none）。
export const GUEST_SUPPORT_CHANNEL_NAME = "web問い合わせ";
export const GUEST_SUPPORT_LIMITS = Object.freeze({ perIpSeconds: 600, perDay: 50, maxUrls: 2, contactMax: 200 });
let guestChannelCache = null;
export function resetGuestSupportCache() { guestChannelCache = null; }

export function validateGuestInquiry(body) {
  if (String(body?.website || "").trim()) return { error: "SPAM" };
  const category = String(body?.category || "").trim().toUpperCase();
  const parent = SUPPORT_CATALOG.find(x => x.key === category);
  if (!parent) return { error: "INVALID_CATEGORY" };
  const subject = String(body?.subject || "").trim();
  const message = String(body?.message || "").trim();
  const contact = String(body?.contact || "").trim();
  if (!subject) return { error: "SUBJECT_REQUIRED" };
  if (subject.length > 120) return { error: "SUBJECT_TOO_LONG" };
  if (!message) return { error: "MESSAGE_REQUIRED" };
  if (message.length > 4000) return { error: "MESSAGE_TOO_LONG" };
  if (contact.length > GUEST_SUPPORT_LIMITS.contactMax) return { error: "CONTACT_TOO_LONG" };
  const urls = (subject + " " + message + " " + contact).match(/https?:\/\//gi) || [];
  if (urls.length > GUEST_SUPPORT_LIMITS.maxUrls) return { error: "TOO_MANY_LINKS" };
  return { category, categoryLabel: parent.label, subject, message, contact };
}

async function guestRateLimit(db, ipHash, now) {
  if (!db) return { ok: false, error: "DB_NOT_CONFIGURED" };
  const lock = await db.prepare(
    "INSERT INTO api_request_locks (lock_key, lock_token, lock_until, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(lock_key) DO UPDATE SET lock_token = excluded.lock_token, lock_until = excluded.lock_until, updated_at = excluded.updated_at WHERE api_request_locks.lock_until <= ?"
  ).bind("SUPPORT_GUEST:" + ipHash, crypto.randomUUID(), now + GUEST_SUPPORT_LIMITS.perIpSeconds, now, now).run();
  if (Number(lock?.meta?.changes || 0) !== 1) return { ok: false, error: "RATE_LIMITED" };
  const day = new Date(now * 1000 + 9 * 3600 * 1000).toISOString().slice(0, 10);
  await db.prepare("CREATE TABLE IF NOT EXISTS support_guest_daily (day TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0)").run();
  const row = await db.prepare("INSERT INTO support_guest_daily (day, n) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET n = n + 1 RETURNING n").bind(day).first();
  if (Number(row?.n || 0) > GUEST_SUPPORT_LIMITS.perDay) return { ok: false, error: "DAILY_LIMIT" };
  return { ok: true };
}

async function resolveGuestChannel(env) {
  if (guestChannelCache) return guestChannelCache;
  const guildId = normalizeDiscordId(env.DISCORD_SUPPORT_GUILD_ID);
  const botUserId = normalizeDiscordId(env.DISCORD_CLIENT_ID);
  if (!guildId) throw new Error("DISCORD_SUPPORT_GUILD_ID_NOT_CONFIGURED");
  if (!botUserId) throw new Error("DISCORD_CLIENT_ID_NOT_CONFIGURED");
  const { categoryId, supportRoleId } = await resolveSupportDiscordConfig(env, guildId);
  const channels = await discordRequest(env, `/guilds/${guildId}/channels`);
  const found = (Array.isArray(channels) ? channels : []).find(c => Number(c?.type) === 0 && String(c?.name) === GUEST_SUPPORT_CHANNEL_NAME && String(c?.parent_id || "") === String(categoryId));
  if (found?.id) return (guestChannelCache = String(found.id));
  const created = await discordRequest(env, `/guilds/${guildId}/channels`, {
    method: "POST",
    body: JSON.stringify({
      name: GUEST_SUPPORT_CHANNEL_NAME, type: 0, parent_id: categoryId,
      topic: "EagleEye：ログインしていない人からの問い合わせ（サイトのフォームから。返信は返信先が書いてあるときだけ）",
      permission_overwrites: [
        permissionOverwrite(guildId, 0, "0", "1024"),
        permissionOverwrite(supportRoleId, 0, "68608", "0"),
        permissionOverwrite(botUserId, 1, "68608", "0")
      ]
    })
  });
  if (!created?.id) throw new Error("GUEST_CHANNEL_CREATE_FAILED");
  return (guestChannelCache = String(created.id));
}

export function buildGuestInquiryMessage(input, { at = new Date() } = {}) {
  const line = s => String(s).replace(/```/g, "'''");
  return [
    `📮 **web問い合わせ**（ログインなし）`,
    `**種類：** ${line(input.categoryLabel)}`,
    `**件名：** ${line(input.subject)}`,
    `**返信先：** ${input.contact ? line(input.contact) : "（なし）"}`,
    `**受付：** ${at.toISOString().replace("T", " ").slice(0, 16)} UTC`,
    "```",
    line(input.message).slice(0, 1800),
    "```"
  ].join("\n").slice(0, 1990);
}

// POST /api/support/guest。ipHash は呼び出し側で作る（IP そのものは渡さない・保存しない）。
export async function handleGuestSupportApi(request, env, { ipHash, now = Math.floor(Date.now() / 1000) } = {}) {
  if (request.method !== "POST") return supportJson({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (Number(request.headers.get("content-length") || 0) > 16000) return supportJson({ ok: false, error: "TOO_LARGE" }, 413);
  let body;
  try { body = await request.json(); } catch { return supportJson({ ok: false, error: "INVALID_JSON" }, 400); }
  const input = validateGuestInquiry(body);
  if (input.error === "SPAM") return supportJson({ ok: true }, 200); // いたずらには成功したように見せて捨てる
  if (input.error) return supportJson({ ok: false, error: input.error }, 400);
  const limit = await guestRateLimit(env.DB, String(ipHash || "unknown"), now).catch(() => ({ ok: false, error: "RATE_LIMIT_UNAVAILABLE" }));
  if (!limit.ok) return supportJson({ ok: false, error: limit.error }, 429);
  try {
    const channelId = await resolveGuestChannel(env);
    await discordRequest(env, `/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify({ content: buildGuestInquiryMessage(input, { at: new Date(now * 1000) }), allowed_mentions: { parse: [] } }) });
    await recordSupportDiagnostic(env, { operation: "GUEST_INQUIRY", status: "SUCCESS", targetType: "CHANNEL", targetId: channelId, message: "ログインなしの問い合わせを受付", metadata: { category: input.category } });
    return supportJson({ ok: true }, 201);
  } catch (error) {
    guestChannelCache = null;
    const code = String(error?.message || "GUEST_INQUIRY_FAILED");
    await recordSupportDiagnostic(env, { operation: "GUEST_INQUIRY", status: "FAILED", errorCode: code.split(":")[0], message: code.slice(0, 500) });
    return supportJson({ ok: false, error: "SEND_FAILED" }, 503);
  }
}

// ログインしていない人向けの /support。ログインしている人は今までどおりの画面（専用チャンネル）。
export function renderGuestSupportPage() {
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const options = SUPPORT_CATALOG.map(x => `<option value="${esc(x.key)}">${esc(x.label)}</option>`).join("");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>お問い合わせ | EagleEye</title><style>
body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:var(--ee-bg,#0a1424);color:var(--ee-text,#e8f3ff)}.wrap{max-width:640px;margin:0 auto;padding:18px 16px 110px}a{color:var(--ee-cyan,#22d3ee)}
h1{font-size:22px;margin:8px 0 6px}.lead{font-size:13px;line-height:1.7;color:var(--ee-subtext,#91a7bf);margin:0 0 12px}
.card{border:1px solid var(--ee-border-soft,#223b57);border-radius:14px;background:var(--ee-panel,#0f2035);padding:14px;margin:12px 0}
label{display:block;font-size:13px;font-weight:700;margin:12px 0 5px}label small{font-weight:400;color:var(--ee-subtext,#91a7bf)}
input,select,textarea{width:100%;box-sizing:border-box;padding:10px;border-radius:10px;border:1px solid var(--ee-border-soft,#223b57);background:var(--ee-bg,#0a1424);color:inherit;font:15px system-ui}textarea{min-height:140px;resize:vertical}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
button{margin-top:14px;width:100%;padding:12px;border:0;border-radius:11px;background:var(--ee-cyan,#22d3ee);color:#04202a;font:800 15px system-ui}button:disabled{opacity:.6}
.msg{margin-top:12px;padding:10px 12px;border-radius:10px;font-size:13px;line-height:1.6}.ok{border:1px solid var(--ee-success,#22c55e)}.ng{border:1px solid var(--ee-danger,#f87171)}.note{font-size:12px;color:var(--ee-subtext,#91a7bf);line-height:1.7}
</style></head><body><main class="wrap"><a href="/">← ホーム</a>
<h1>お問い合わせ</h1><p class="lead">ご質問・不具合の報告・データの削除依頼などは、このフォームから送れます（ログイン不要）。返事が必要な場合は返信先を書いてください。ログインすると、Discord の専用チャンネルで運営とやり取りできます（<a href="/login">ログイン</a>）。</p>
<form class="card" id="gf"><label for="gc">種類</label><select id="gc" name="category" required>${options}</select>
<label for="gs">件名</label><input id="gs" name="subject" maxlength="120" required>
<label for="gm">内容</label><textarea id="gm" name="message" maxlength="4000" required></textarea>
<label for="gt">返信先 <small>（任意・メールアドレスや Discord のユーザー名など）</small></label><input id="gt" name="contact" maxlength="200">
<div class="hp" aria-hidden="true"><label>website<input name="website" tabindex="-1" autocomplete="off"></label></div>
<button type="submit" id="gb">送信する</button><div id="gr" role="status"></div></form>
<p class="note">送られた内容は運営だけが見る場所に届きます。返信先を書いた場合だけ、そこに連絡することがあります。</p>
<script>(function(){var f=document.getElementById("gf"),b=document.getElementById("gb"),r=document.getElementById("gr");var M={RATE_LIMITED:"続けて送れません。10分ほどあけてから送ってください。",DAILY_LIMIT:"今日の受付の上限に達しました。明日もう一度お試しください。",TOO_MANY_LINKS:"リンク（URL）は2つまでにしてください。",SUBJECT_REQUIRED:"件名を入れてください。",MESSAGE_REQUIRED:"内容を入れてください。",SEND_FAILED:"送信できませんでした。時間をおいてもう一度お試しください。"};
f.addEventListener("submit",function(e){e.preventDefault();b.disabled=true;b.textContent="送信中…";var d={};new FormData(f).forEach(function(v,k){d[k]=v});
fetch("/api/support/guest",{method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify(d)}).then(function(x){return x.json().catch(function(){return {ok:false}})}).then(function(j){if(j&&j.ok){r.className="msg ok";r.textContent="送信しました。ありがとうございます。";f.reset();}else{r.className="msg ng";r.textContent=M[j&&j.error]||"送信できませんでした。入力を確かめてください。";}}).catch(function(){r.className="msg ng";r.textContent=M.SEND_FAILED}).finally(function(){b.disabled=false;b.textContent="送信する"})})})()</script>
</main></body></html>`;
}
