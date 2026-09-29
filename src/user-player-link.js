let userPlayerLinkSchemaPromise = null;

async function ensureSchema(db) {
  if (userPlayerLinkSchemaPromise) return userPlayerLinkSchemaPromise;
  userPlayerLinkSchemaPromise = (async () => {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS user_player_links (
        link_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        governor_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE'
          CHECK (status IN ('ACTIVE', 'DISABLED')),
        verification_method TEXT NOT NULL DEFAULT 'SELF_CLAIM'
          CHECK (verification_method IN ('SELF_CLAIM', 'ADMIN_VERIFIED', 'API_VERIFIED', 'GAME_CODE')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        verified_at INTEGER
      )
    `).run();
    await db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_user_player_links_governor ON user_player_links(governor_id, status)"
    ).run();
    await db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_user_player_links_status ON user_player_links(status, updated_at DESC)"
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

function isUniqueGovernorConstraint(error) {
  const message = String(error?.message || error || "");
  return /UNIQUE constraint failed.*user_player_links\.governor_id/i.test(message);
}

function governorAlreadyLinkedError(owner = null) {
  const error = new Error("GOVERNOR_ID_ALREADY_LINKED");
  error.code = "GOVERNOR_ID_ALREADY_LINKED";
  error.owner = owner;
  return error;
}

export async function getUserPlayerLink(db, userId) {
  await ensureSchema(db);
  const row = await db.prepare(`
    SELECT link_id, user_id, governor_id, status, verification_method,
           created_at, updated_at, verified_at
    FROM user_player_links
    WHERE user_id = ?
    LIMIT 1
  `).bind(String(userId)).first();
  return row || null;
}

export async function findActiveGovernorOwner(db, governorId) {
  await ensureSchema(db);
  return db.prepare(`
    SELECT link_id, user_id, governor_id, status, verification_method,
           official_verified_at, official_verified_by_user_id,
           created_at, updated_at, verified_at
    FROM user_player_links
    WHERE governor_id = ? AND status = 'ACTIVE'
    LIMIT 1
  `).bind(normalizeGovernorId(governorId)).first();
}

export async function saveUserPlayerLink(db, userId, governorId) {
  await ensureSchema(db);
  const normalized = normalizeGovernorId(governorId);
  if (!normalized) {
    const error = new Error("INVALID_GOVERNOR_ID");
    error.code = "INVALID_GOVERNOR_ID";
    throw error;
  }

  const normalizedUserId = String(userId);
  const now = Math.floor(Date.now() / 1000);
  const existing = await getUserPlayerLink(db, normalizedUserId);
  const owner = await findActiveGovernorOwner(db, normalized);
  if (owner && owner.user_id !== normalizedUserId && (!existing || existing.governor_id !== normalized)) {
    throw governorAlreadyLinkedError(owner);
  }

  if (existing) {
    try {
      await db.prepare(`
        UPDATE user_player_links
        SET governor_id = ?,
            status = 'ACTIVE',
            verification_method = 'SELF_CLAIM',
            official_verified_at = NULL,
            official_verified_by_user_id = NULL,
            updated_at = ?,
            verified_at = NULL
        WHERE user_id = ?
      `).bind(normalized, now, normalizedUserId).run();
    } catch (error) {
      if (isUniqueGovernorConstraint(error)) throw governorAlreadyLinkedError();
      throw error;
    }
    return getUserPlayerLink(db, normalizedUserId);
  }

  const linkId = crypto.randomUUID();
  try {
    await db.prepare(`
      INSERT INTO user_player_links (
        link_id, user_id, governor_id, status, verification_method,
        created_at, updated_at, verified_at, official_verified_at, official_verified_by_user_id
      ) VALUES (?, ?, ?, 'ACTIVE', 'SELF_CLAIM', ?, ?, NULL, NULL, NULL)
    `).bind(linkId, normalizedUserId, normalized, now, now).run();
  } catch (error) {
    if (isUniqueGovernorConstraint(error)) throw governorAlreadyLinkedError();
    throw error;
  }

  return getUserPlayerLink(db, normalizedUserId);
}

export async function disableUserPlayerLink(db, userId) {
  await ensureSchema(db);
  const now = Math.floor(Date.now() / 1000);
  const result = await db.prepare(`
    UPDATE user_player_links
    SET status = 'DISABLED', updated_at = ?
    WHERE user_id = ? AND status = 'ACTIVE'
  `).bind(now, String(userId)).run();
  return { changed: result?.meta?.changes === 1, link: await getUserPlayerLink(db, userId) };
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

  // Precheck the destination before disabling the current owner. This prevents
  // a partial transfer if the requester already owns a different player.
  const existingNew = await getUserPlayerLink(db, normalizedNewUserId);
  if (existingNew && existingNew.governor_id !== request.governor_id) {
    const error = new Error("NEW_USER_ALREADY_HAS_DIFFERENT_PLAYER");
    error.code = "NEW_USER_ALREADY_HAS_DIFFERENT_PLAYER";
    throw error;
  }

  const now = Math.floor(Date.now() / 1000);

  await db.prepare(`
    UPDATE user_player_links
    SET status = 'DISABLED', updated_at = ?
    WHERE user_id = ? AND governor_id = ? AND status = 'ACTIVE'
  `).bind(now, normalizedOwnerUserId, request.governor_id).run();

  if (existingNew) {
    await db.prepare(`
      UPDATE user_player_links
      SET status='ACTIVE', governor_id=?, verification_method='ADMIN_VERIFIED',
          verified_at=?, official_verified_at=?, official_verified_by_user_id=?, updated_at=?
      WHERE user_id=?
    `).bind(request.governor_id, now, now, String(resolverUserId), now, normalizedNewUserId).run();
  } else {
    try {
      await db.prepare(`
        INSERT INTO user_player_links (
          link_id, user_id, governor_id, status, verification_method,
          created_at, updated_at, verified_at, official_verified_at, official_verified_by_user_id
        ) VALUES (?, ?, ?, 'ACTIVE', 'ADMIN_VERIFIED', ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(), normalizedNewUserId, request.governor_id,
        now, now, now, now, String(resolverUserId)
      ).run();
    } catch (error) {
      if (isUniqueGovernorConstraint(error)) {
        const conflict = await findActiveGovernorOwner(db, request.governor_id);
        if (conflict && conflict.user_id !== normalizedNewUserId) {
          const wrapped = governorAlreadyLinkedError(conflict);
          wrapped.code = "TRANSFER_GOVERNOR_ID_ALREADY_LINKED";
          throw wrapped;
        }
      }
      throw error;
    }
  }

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
