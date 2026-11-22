// 使う領主の切り替え（2026-11-18）。
// ・領主IDを複数登録している人が「今どの領主で EagleEye を使うか」を選べる。選ぶとホーム・聖剣・比較の「自分」・KvK・ランキングの最初の王国などがその領主になる。
// ・保存は1人1行（user_active_governor）。選んでいない人・選んだ領主の登録を外した人は今まで通り（メイン → 古い順）。
// ・ほかの人に見せる名前（聖剣の登録者名・招待など）はメインのまま。
// 表を用意するのは D1 ごとに1回（同じ isolate では2回目以降しない）。
let ready = new WeakMap();
export function resetActiveGovernorSchemaCache() { ready = new WeakMap(); }
export async function ensureActiveGovernorSchema(db) {
  if (!db) return;
  if (!ready.has(db)) ready.set(db, db.prepare("CREATE TABLE IF NOT EXISTS user_active_governor (user_id TEXT PRIMARY KEY, governor_id TEXT NOT NULL, updated_at INTEGER NOT NULL)").run().catch(error => { ready.delete(db); throw error; }));
  return ready.get(db);
}

// 「自分の領主」を1つ選ぶときの並び順（選んだ領主 → メイン → 古い順）。alias は user_player_links の別名。
// oldestFirst=false のときは「古い順」を付けない（呼び出し側で別の並びを足すとき）。
export function myGovernorOrderSql(alias = "l", { oldestFirst = true } = {}) {
  return `CASE WHEN ${alias}.governor_id = (SELECT g.governor_id FROM user_active_governor g WHERE g.user_id = ${alias}.user_id) THEN 0 ELSE 1 END, CASE ${alias}.account_type WHEN 'MAIN' THEN 0 ELSE 1 END` + (oldestFirst ? `, ${alias}.created_at ASC` : "");
}

export async function setActiveGovernor(db, userId, governorId, nowMs = Date.now()) {
  await ensureActiveGovernorSchema(db);
  const id = String(governorId || "").trim();
  const owned = await db.prepare("SELECT 1 AS x FROM user_player_links WHERE user_id = ? AND governor_id = ? AND status = 'ACTIVE' LIMIT 1").bind(String(userId), id).first();
  if (!owned) { const e = new Error("この領主IDは登録されていません。"); e.code = "GOVERNOR_NOT_LINKED"; throw e; }
  await db.prepare("INSERT INTO user_active_governor (user_id, governor_id, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET governor_id = excluded.governor_id, updated_at = excluded.updated_at")
    .bind(String(userId), id, Math.floor(nowMs / 1000)).run();
  return id;
}

// 今使っている領主（選んだ領主が登録中ならそれ、無ければメイン → 古い順）。
export async function getActiveGovernorId(db, userId) {
  await ensureActiveGovernorSchema(db);
  const row = await db.prepare(`SELECT l.governor_id FROM user_player_links l WHERE l.user_id = ? AND l.status = 'ACTIVE' ORDER BY ${myGovernorOrderSql("l")} LIMIT 1`).bind(String(userId)).first().catch(() => null);
  return row ? String(row.governor_id) : null;
}
