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

export async function saveUserPlayerLink(db, userId, governorId) {
  await ensureSchema(db);
  const normalized = normalizeGovernorId(governorId);
  if (!normalized) {
    const error = new Error("INVALID_GOVERNOR_ID");
    error.code = "INVALID_GOVERNOR_ID";
    throw error;
  }

  const now = Math.floor(Date.now() / 1000);
  const existing = await getUserPlayerLink(db, userId);
  if (existing) {
    await db.prepare(`
      UPDATE user_player_links
      SET governor_id = ?,
          status = 'ACTIVE',
          verification_method = 'SELF_CLAIM',
          updated_at = ?,
          verified_at = NULL
      WHERE user_id = ?
    `).bind(normalized, now, String(userId)).run();
    return getUserPlayerLink(db, userId);
  }

  const linkId = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO user_player_links (
      link_id, user_id, governor_id, status, verification_method,
      created_at, updated_at, verified_at
    ) VALUES (?, ?, ?, 'ACTIVE', 'SELF_CLAIM', ?, ?, NULL)
  `).bind(linkId, String(userId), normalized, now, now).run();

  return getUserPlayerLink(db, userId);
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
