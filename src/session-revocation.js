// Per-user session revocation. Sessions are signed cookies that stay valid for
// 7 days; a row here makes sessions issued before `revoked_before` invalid, so
// the user signs in again (which also re-runs the Support server auto-join).

let schemaReady = false;

async function ensureSchema(db) {
  if (schemaReady) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS session_revocations (discord_id TEXT PRIMARY KEY, revoked_before INTEGER NOT NULL, reason TEXT, created_at INTEGER NOT NULL)").run();
  schemaReady = true;
}

export function resetSessionRevocationSchemaCache() { schemaReady = false; }

// True when this session was issued before the user's revocation time.
// Any lookup error counts as "not revoked" so a D1 problem never signs everyone out.
export async function isSessionRevoked(db, session) {
  if (!db || !session?.sub) return false;
  try {
    const row = await db.prepare("SELECT revoked_before FROM session_revocations WHERE discord_id = ?").bind(String(session.sub)).first();
    return Boolean(row && Number(session.iat || 0) < Number(row.revoked_before));
  } catch {
    return false;
  }
}

export async function revokeSessions(db, discordIds, { reason = null, now = Math.floor(Date.now() / 1000) } = {}) {
  const ids = [...new Set((discordIds || []).map(id => String(id || "").trim()).filter(id => /^\d{15,25}$/.test(id)))];
  if (!ids.length) return 0;
  await ensureSchema(db);
  const statements = ids.map(id => db.prepare(
    "INSERT INTO session_revocations (discord_id, revoked_before, reason, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(discord_id) DO UPDATE SET revoked_before = excluded.revoked_before, reason = excluded.reason, created_at = excluded.created_at"
  ).bind(id, now, reason ? String(reason).slice(0, 60) : null, now));
  for (let i = 0; i < statements.length; i += 50) await db.batch(statements.slice(i, i + 50));
  return ids.length;
}
