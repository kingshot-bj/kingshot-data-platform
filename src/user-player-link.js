let userPlayerLinkSchemaPromise = null;

export const KINGSHOT_FREE_KINGDOM_LIMIT = 2;
export const KINGSHOT_FREE_ACCOUNTS_PER_KINGDOM = 2;
export const KINGSHOT_FREE_SUB_ACCOUNTS_PER_KINGDOM = 1;

export async function ensureSchema(db) {
  if (userPlayerLinkSchemaPromise) return userPlayerLinkSchemaPromise;
  userPlayerLinkSchemaPromise = (async () => {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS user_player_links (
        link_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        governor_id TEXT NOT NULL,
        kingdom_id INTEGER NOT NULL,
        account_type TEXT NOT NULL DEFAULT 'MAIN'
          CHECK (account_type IN ('MAIN', 'SUB')),
        status TEXT NOT NULL DEFAULT 'ACTIVE'
          CHECK (status IN ('ACTIVE', 'DISABLED')),
        verification_method TEXT NOT NULL DEFAULT 'SELF_CLAIM'
          CHECK (verification_method IN ('SELF_CLAIM', 'ADMIN_VERIFIED', 'API_VERIFIED', 'GAME_CODE')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        verified_at INTEGER,
        official_verified_at INTEGER,
        official_verified_by_user_id TEXT
      )
    `).run();
    await db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_user_player_links_user_status ON user_player_links(user_id, status, kingdom_id, account_type)"
    ).run();
    await db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_user_player_links_governor_status ON user_player_links(governor_id, status)"
    ).run();
    await db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_user_player_links_kingdom ON user_player_links(user_id, kingdom_id, status)"
    ).run();
    await db.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS uq_user_player_links_active_governor ON user_player_links(governor_id) WHERE status = 'ACTIVE'"
    ).run();
    await db.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS uq_user_player_links_active_user_governor ON user_player_links(user_id, governor_id) WHERE status = 'ACTIVE'"
    ).run();
    await db.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS uq_user_player_links_active_main ON user_player_links(user_id, kingdom_id) WHERE status = 'ACTIVE' AND account_type = 'MAIN'"
    ).run();
  })();
  try {
    return await userPlayerLinkSchemaPromise;
  } catch (error) {
    userPlayerLinkSchemaPromise = null;
    throw error;
  }
}

function normalizeGovernorId(value) {
  const raw = String(value ?? "").trim();
  if (!/^\d{7,12}$/.test(raw)) return null;
  return raw;
}

function normalizeAccountType(value) {
  return String(value || "MAIN").toUpperCase() === "SUB" ? "SUB" : "MAIN";
}

function isUniqueGovernorConstraint(error) {
  const message = String(error?.message || error || "");
  return /UNIQUE constraint failed.*user_player_links\.(governor_id|user_id, governor_id)/i.test(message);
}

function governorAlreadyLinkedError(owner = null) {
  const error = new Error("GOVERNOR_ID_ALREADY_LINKED");
  error.code = "GOVERNOR_ID_ALREADY_LINKED";
  error.owner = owner;
  return error;
}

function limitError(code, message, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  error.userMessage = message;
  return error;
}

export async function getUserPlayerLinks(db, userId) {
  await ensureSchema(db);
  const result = await db.prepare(`
    SELECT link_id, user_id, governor_id, kingdom_id, account_type, status,
           verification_method, created_at, updated_at, verified_at,
           official_verified_at, official_verified_by_user_id
    FROM user_player_links
    WHERE user_id = ?
    ORDER BY kingdom_id ASC, CASE account_type WHEN 'MAIN' THEN 0 ELSE 1 END, created_at ASC
  `).bind(String(userId)).all();
  return result.results || [];
}

export async function getUserPlayerLink(db, userId) {
  const links = await getUserPlayerLinks(db, userId);
  return links.find(row => row.status === "ACTIVE" && row.account_type === "MAIN")
    || links.find(row => row.status === "ACTIVE")
    || links[0]
    || null;
}

export async function getUserPlayerLinksWithPlayers(db, userId) {
  await ensureSchema(db);
  const result = await db.prepare(`
    SELECT l.link_id, l.user_id, l.governor_id, l.kingdom_id, l.account_type, l.status,
           l.verification_method, l.created_at, l.updated_at, l.verified_at,
           l.official_verified_at, l.official_verified_by_user_id,
           p.nick_name, p.kid, p.power, p.town_center_level, p.vip,
           p.alliance_abbr, p.alliance_name, p.observed_at
    FROM user_player_links l
    LEFT JOIN players p ON p.governor_id = l.governor_id
    WHERE l.user_id = ?
    ORDER BY l.kingdom_id ASC, CASE l.account_type WHEN 'MAIN' THEN 0 ELSE 1 END, l.created_at ASC
  `).bind(String(userId)).all();
  return result.results || [];
}

export async function findActiveGovernorOwner(db, governorId) {
  await ensureSchema(db);
  return db.prepare(`
    SELECT link_id, user_id, governor_id, kingdom_id, account_type, status,
           verification_method, official_verified_at, official_verified_by_user_id,
           created_at, updated_at, verified_at
    FROM user_player_links
    WHERE governor_id = ? AND status = 'ACTIVE'
    LIMIT 1
  `).bind(normalizeGovernorId(governorId)).first();
}

export async function saveUserPlayerLink(db, userId, governorId, accountType = "MAIN", { allowExtraAccounts = false } = {}) {
  await ensureSchema(db);
  const normalized = normalizeGovernorId(governorId);
  if (!normalized) {
    const error = new Error("INVALID_GOVERNOR_ID");
    error.code = "INVALID_GOVERNOR_ID";
    throw error;
  }

  const normalizedUserId = String(userId);
  const normalizedType = normalizeAccountType(accountType);
  const player = await db.prepare("SELECT governor_id, kid FROM players WHERE governor_id = ? LIMIT 1").bind(normalized).first();
  if (!player || player.kid == null) {
    throw limitError("PLAYER_NOT_FOUND", "この領主IDのプレイヤーデータがまだEagleEyeにありません。");
  }

  const kingdomId = Number(player.kid);
  const owner = await findActiveGovernorOwner(db, normalized);
  if (owner && owner.user_id !== normalizedUserId) throw governorAlreadyLinkedError(owner);

  const now = Math.floor(Date.now() / 1000);
  const existingSame = await db.prepare(
    "SELECT * FROM user_player_links WHERE user_id = ? AND governor_id = ? AND status = 'ACTIVE' LIMIT 1"
  ).bind(normalizedUserId, normalized).first();
  if (existingSame) {
    if (existingSame.account_type === normalizedType) return existingSame;
    throw limitError("GOVERNOR_ID_ALREADY_REGISTERED", "この領主IDはすでに登録されています。");
  }

  const activeRows = await db.prepare(
    "SELECT link_id, governor_id, kingdom_id, account_type FROM user_player_links WHERE user_id = ? AND status = 'ACTIVE'"
  ).bind(normalizedUserId).all();
  const active = activeRows.results || [];
  const kingdomRows = active.filter(row => Number(row.kingdom_id) === kingdomId);
  const kingdomIds = new Set(active.map(row => Number(row.kingdom_id)));

  if (!allowExtraAccounts && !kingdomIds.has(kingdomId) && kingdomIds.size >= KINGSHOT_FREE_KINGDOM_LIMIT) {
    throw limitError("KINGDOM_LIMIT_REACHED", "無料プランでは2王国まで登録できます。");
  }

  if (!allowExtraAccounts && normalizedType === "MAIN" && kingdomRows.some(row => row.account_type === "MAIN")) {
    throw limitError("MAIN_ACCOUNT_ALREADY_EXISTS", "この王国にはすでにメインアカウントが登録されています。");
  }

  if (!allowExtraAccounts && normalizedType === "SUB" && kingdomRows.filter(row => row.account_type === "SUB").length >= KINGSHOT_FREE_SUB_ACCOUNTS_PER_KINGDOM) {
    throw limitError("SUB_ACCOUNT_LIMIT_REACHED", "この王国の無料サブアカウントは1件までです。追加サブアカウントは将来の有料機能として提供予定です。");
  }

  if (!allowExtraAccounts && kingdomRows.length >= KINGSHOT_FREE_ACCOUNTS_PER_KINGDOM) {
    throw limitError("ACCOUNT_LIMIT_REACHED", "この王国では無料でメイン1件＋サブ1件まで登録できます。");
  }

  const linkId = crypto.randomUUID();
  try {
    await db.prepare(`
      INSERT INTO user_player_links (
        link_id, user_id, governor_id, kingdom_id, account_type, status, verification_method,
        created_at, updated_at, verified_at, official_verified_at, official_verified_by_user_id
      ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', 'SELF_CLAIM', ?, ?, NULL, NULL, NULL)
    `).bind(linkId, normalizedUserId, normalized, kingdomId, normalizedType, now, now).run();
  } catch (error) {
    if (isUniqueGovernorConstraint(error)) {
      const conflict = await findActiveGovernorOwner(db, normalized);
      if (conflict && conflict.user_id !== normalizedUserId) throw governorAlreadyLinkedError(conflict);
    }
    throw error;
  }

  return db.prepare("SELECT * FROM user_player_links WHERE link_id = ?").bind(linkId).first();
}

export async function disableUserPlayerLink(db, userId, governorId = null) {
  await ensureSchema(db);
  const now = Math.floor(Date.now() / 1000);
  const query = governorId
    ? "UPDATE user_player_links SET status = 'DISABLED', updated_at = ? WHERE user_id = ? AND governor_id = ? AND status = 'ACTIVE'"
    : "UPDATE user_player_links SET status = 'DISABLED', updated_at = ? WHERE user_id = ? AND status = 'ACTIVE'";
  const result = governorId
    ? await db.prepare(query).bind(now, String(userId), normalizeGovernorId(governorId)).run()
    : await db.prepare(query).bind(now, String(userId)).run();
  return { changed: Number(result?.meta?.changes || 0), links: await getUserPlayerLinks(db, userId) };
}

export function validateGovernorId(value) {
  return normalizeGovernorId(value);
}

export async function createOwnershipSupportRequest(db, {
  requesterUserId, governorId, conflictingUserId = null, discordSupportUrl = null, note = null
}) {
  const now = Math.floor(Date.now() / 1000);
  const requestId = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO user_player_link_support_requests (
      request_id, requester_user_id, governor_id, conflicting_user_id,
      status, discord_support_url, note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'OPEN', ?, ?, ?, ?)
  `).bind(
    requestId, String(requesterUserId), normalizeGovernorId(governorId),
    conflictingUserId ? String(conflictingUserId) : null,
    discordSupportUrl, note ? String(note).slice(0, 1000) : null, now, now
  ).run();
  return db.prepare("SELECT * FROM user_player_link_support_requests WHERE request_id = ?").bind(requestId).first();
}

export async function verifyAndTransferPlayerLink(db, {
  requestId, ownerUserId, newUserId, resolverUserId, resolutionNote = null
}) {
  const request = await db.prepare("SELECT * FROM user_player_link_support_requests WHERE request_id = ?").bind(requestId).first();
  if (!request) {
    const error = new Error("SUPPORT_REQUEST_NOT_FOUND");
    error.code = "SUPPORT_REQUEST_NOT_FOUND";
    throw error;
  }

  const normalizedNewUserId = String(newUserId);
  const normalizedOwnerUserId = String(ownerUserId);
  const currentOwner = await findActiveGovernorOwner(db, request.governor_id);
  if (!currentOwner || currentOwner.user_id !== normalizedOwnerUserId) {
    const error = new Error("CURRENT_GOVERNOR_OWNER_MISMATCH");
    error.code = "CURRENT_GOVERNOR_OWNER_MISMATCH";
    throw error;
  }

  const now = Math.floor(Date.now() / 1000);
  const destination = await getUserPlayerLinks(db, normalizedNewUserId);
  const destinationExisting = destination.find(row => row.status === "ACTIVE" && row.governor_id === request.governor_id);
  if (destinationExisting) {
    await db.prepare(`
      UPDATE user_player_links
      SET status='ACTIVE', account_type='MAIN', verification_method='ADMIN_VERIFIED',
          verified_at=?, official_verified_at=?, official_verified_by_user_id=?, updated_at=?
      WHERE link_id=?
    `).bind(now, now, String(resolverUserId), now, destinationExisting.link_id).run();
  } else {
    await db.prepare(`
      INSERT INTO user_player_links (
        link_id, user_id, governor_id, kingdom_id, account_type, status, verification_method,
        created_at, updated_at, verified_at, official_verified_at, official_verified_by_user_id
      ) VALUES (?, ?, ?, ?, 'MAIN', 'ACTIVE', 'ADMIN_VERIFIED', ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(), normalizedNewUserId, request.governor_id,
      Number(currentOwner.kingdom_id), now, now, now, now, String(resolverUserId)
    ).run();
  }

  await db.prepare(
    "UPDATE user_player_links SET status='DISABLED', updated_at=? WHERE user_id=? AND governor_id=? AND status='ACTIVE'"
  ).bind(now, normalizedOwnerUserId, request.governor_id).run();

  await db.prepare(`
    UPDATE user_player_link_support_requests
    SET status='RESOLVED', resolution_note=?, updated_at=?, resolved_at=?, resolved_by_user_id=?
    WHERE request_id=?
  `).bind(
    resolutionNote ? String(resolutionNote).slice(0, 1000) : null,
    now, now, String(resolverUserId), requestId
  ).run();

  return getUserPlayerLink(db, normalizedNewUserId);
}
