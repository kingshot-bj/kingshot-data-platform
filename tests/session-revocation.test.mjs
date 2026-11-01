import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { isSessionRevoked, revokeSessions, resetSessionRevocationSchemaCache } from "../src/session-revocation.js";
import { onKvkUserSignedIn, listKvkUsersNotInServer, ensureKvkDiscordSchema, resetKvkDiscordSchemaCache } from "../src/kvk-discord.js";

function d1() {
  const sqlite = new DatabaseSync(":memory:");
  const stmt = (sql, args = []) => ({ sql, bind: (...a) => stmt(sql, a), first: async () => sqlite.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }), run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }) });
  return { sqlite, prepare: sql => stmt(sql), batch: async l => { for (const s of l) await s.run(); return []; } };
}
const A = "444444444444444441", B = "444444444444444442";

test.beforeEach(() => { resetSessionRevocationSchemaCache(); resetKvkDiscordSchemaCache(); });

test("only sessions issued before the revocation are invalid", async () => {
  const db = d1();
  assert.equal(await isSessionRevoked(db, { sub: A, iat: 100 }), false, "missing table never signs anyone out");
  await revokeSessions(db, [A, "not-an-id"], { now: 1000 });
  assert.equal(await isSessionRevoked(db, { sub: A, iat: 999 }), true);
  assert.equal(await isSessionRevoked(db, { sub: A, iat: 1000 }), false, "signing in again creates a valid session");
  assert.equal(await isSessionRevoked(db, { sub: B, iat: 1 }), false, "other users are unaffected");
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) c FROM session_revocations").get().c, 1);
});

test("signing in clears the KvK back-off so the next sync adds the user", async () => {
  const db = d1();
  await ensureKvkDiscordSchema(db);
  db.sqlite.exec(`INSERT INTO kvk_discord_threads VALUES (1524, 't1', 1, 999), (777, 't2', 1, 999);
    INSERT INTO kvk_discord_member_skips VALUES (1524, '${A}', 99999999999, 50001), (777, '${B}', 99999999999, 50001);`);
  assert.deepEqual((await listKvkUsersNotInServer(db)).sort(), [A, B]);
  await onKvkUserSignedIn(db, A);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) c FROM kvk_discord_member_skips WHERE discord_id = ?").get(A).c, 0);
  assert.equal(db.sqlite.prepare("SELECT member_sync_at FROM kvk_discord_threads WHERE kid = 1524").get().member_sync_at, 0);
  assert.equal(db.sqlite.prepare("SELECT member_sync_at FROM kvk_discord_threads WHERE kid = 777").get().member_sync_at, 999, "other kingdoms untouched");
});

test("revocation is enforced everywhere a session is read; relogin API is OWNER only", async () => {
  const index = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  const auth = index.slice(index.indexOf("async function getAuthenticatedUser"), index.indexOf("async function trackServiceUsage"));
  assert.ok(auth.includes("if (await isSessionRevoked(env.DB, session)) return null;"));
  assert.ok(index.includes("if (!session || await isSessionRevoked(env.DB, session)) return json({ ok: true, authenticated: false });"));
  assert.ok(index.includes("const session = verifiedSession && !(await isSessionRevoked(env.DB, verifiedSession)) ? verifiedSession : null;"));
  assert.ok(index.includes("if (env.DB) await onKvkUserSignedIn(env.DB, String(discordUser.id));"));
  const api = index.slice(index.indexOf("async function handleKvkReloginMissingApi"), index.indexOf("// OWNER only: copy archive objects"));
  assert.ok(api.includes("await requireOwner(request, env)") && api.includes('request.method !== "POST"'));
  assert.ok(index.includes("未参加の<span id=\"kvkReloginCount\">"));
});
