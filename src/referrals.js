// マイルストーン②：招待。
// ・招待リンク：/?ref=コード（コードはユーザーごとに1つ、ランダム8文字）
// ・リンクから来た人のブラウザに30日間だけ招待コードを覚える（Cookie、DBは読まない）
// ・その人が「初めて」Discordでログインしたときに招待者と結びつける（既存ユーザーは対象外・自分自身は不可）
// ・招待された人が ADVANCED 以上になった時点で「達成」。その月（日本時間）のシーズンに数える
// ・招待者には招待した人のゲーム内の名前を見せる（ユーザー名・Discord情報は見せない）

export const REF_COOKIE = "ee_ref";
export const REF_COOKIE_MAX_AGE = 30 * 86400;
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // 紛らわしい文字（i,l,o,0,1）なし
export const isReferralCode = v => typeof v === "string" && /^[a-hjkmnp-z2-9]{8}$/.test(v);

// 生涯の招待数で付く称号（ADVANCEDになった人数）。
export const INVITE_TITLES = Object.freeze([
  { n: 1, key: "invite_1", icon: "✉️", title: "招待者" },
  { n: 3, key: "invite_3", icon: "🧭", title: "案内人" },
  { n: 5, key: "invite_5", icon: "📯", title: "伝道師" },
  { n: 10, key: "invite_10", icon: "🎖️", title: "大使" }
]);

// 月ごとの報酬（オーナーが月ごとに変えられるよう、今は初回シーズンの仮の内容）。
export const DEFAULT_SEASON_REWARDS = Object.freeze([
  { n: 3, text: "称号「今月の案内人」" },
  { n: 5, text: "称号＋翌月のウォッチ枠+10" },
  { n: 10, text: "称号＋ウォッチ枠＋ホームで紹介" }
]);

// 日本時間の「年-月」（シーズン）。
export function seasonOf(unixSeconds) {
  const d = new Date((Number(unixSeconds) + 9 * 3600) * 1000);
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0");
}

export function randomReferralCode(rand = () => crypto.getRandomValues(new Uint32Array(1))[0]) {
  let s = "";
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[rand() % CODE_ALPHABET.length];
  return s;
}

let schemaReady = null;
export function resetReferralSchemaCache() { schemaReady = null; }
export async function ensureReferralSchema(db) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.prepare("CREATE TABLE IF NOT EXISTS referral_codes (user_id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL)").run();
      await db.prepare("CREATE TABLE IF NOT EXISTS referrals (invitee_user_id TEXT PRIMARY KEY, inviter_user_id TEXT NOT NULL, code TEXT NOT NULL, created_at INTEGER NOT NULL, qualified_at INTEGER, season TEXT)").run();
      await db.prepare("CREATE INDEX IF NOT EXISTS idx_referrals_inviter ON referrals(inviter_user_id, qualified_at)").run();
      await db.prepare("CREATE INDEX IF NOT EXISTS idx_referrals_season ON referrals(season, inviter_user_id)").run();
    })().catch(error => { schemaReady = null; throw error; });
  }
  return schemaReady;
}

export async function getOrCreateReferralCode(db, userId, now = Math.floor(Date.now() / 1000), makeCode = randomReferralCode) {
  await ensureReferralSchema(db);
  const row = await db.prepare("SELECT code FROM referral_codes WHERE user_id = ?").bind(String(userId)).first();
  if (row?.code) return row.code;
  for (let i = 0; i < 5; i++) {
    const code = makeCode();
    const r = await db.prepare("INSERT OR IGNORE INTO referral_codes (user_id, code, created_at) VALUES (?, ?, ?)").bind(String(userId), code, now).run();
    if (r?.meta?.changes) return code;
    const again = await db.prepare("SELECT code FROM referral_codes WHERE user_id = ?").bind(String(userId)).first();
    if (again?.code) return again.code;
  }
  throw new Error("REFERRAL_CODE_FAILED");
}

// 初回ログイン時に呼ぶ。既存ユーザー・自分のコード・知らないコードは何もしない。
export async function attributeReferral(db, { inviteeUserId, code, isNewUser, now = Math.floor(Date.now() / 1000) }) {
  if (!db || !isNewUser || !inviteeUserId || !isReferralCode(code)) return { attributed: false };
  await ensureReferralSchema(db);
  const owner = await db.prepare("SELECT user_id FROM referral_codes WHERE code = ?").bind(code).first();
  if (!owner?.user_id || String(owner.user_id) === String(inviteeUserId)) return { attributed: false };
  const r = await db.prepare("INSERT OR IGNORE INTO referrals (invitee_user_id, inviter_user_id, code, created_at) VALUES (?, ?, ?, ?)")
    .bind(String(inviteeUserId), String(owner.user_id), code, now).run();
  return { attributed: Boolean(r?.meta?.changes), inviterUserId: String(owner.user_id) };
}

// ADVANCED 以上になったときに呼ぶ（昇格処理から）。招待された人でなければ何も起きない（主キー1行）。
export async function markReferralQualified(db, inviteeUserId, now = Math.floor(Date.now() / 1000)) {
  if (!db || !inviteeUserId) return false;
  await ensureReferralSchema(db);
  const r = await db.prepare("UPDATE referrals SET qualified_at = ?, season = ? WHERE invitee_user_id = ? AND qualified_at IS NULL")
    .bind(now, seasonOf(now), String(inviteeUserId)).run();
  return Boolean(r?.meta?.changes);
}

const ADVANCED_PLUS = "('ADVANCED','VIP','ADMIN','OWNER')";

// 招待者本人の画面用：自分のコード・招待した人の一覧（ゲーム内の名前）・生涯数・今月数。
export async function loadMyReferrals(db, userId, { now = Math.floor(Date.now() / 1000) } = {}) {
  await ensureReferralSchema(db);
  const uid = String(userId);
  const code = await getOrCreateReferralCode(db, uid, now);
  // 昇格処理の呼び出し漏れ（昔の昇格・手動変更）を拾う。対象は自分が招待した未達成の人だけ。
  await db.prepare(
    "UPDATE referrals SET qualified_at = ?, season = ? WHERE inviter_user_id = ? AND qualified_at IS NULL AND invitee_user_id IN (SELECT user_id FROM users WHERE role IN " + ADVANCED_PLUS + " AND status = 'ACTIVE')"
  ).bind(now, seasonOf(now), uid).run();
  const rows = (await db.prepare(
    "SELECT r.invitee_user_id, r.created_at, r.qualified_at, r.season, " +
    "(SELECT p.nick_name FROM user_player_links l JOIN players p ON p.governor_id = l.governor_id WHERE l.user_id = r.invitee_user_id AND l.status = 'ACTIVE' ORDER BY CASE l.account_type WHEN 'MAIN' THEN 0 ELSE 1 END LIMIT 1) AS nick_name " +
    "FROM referrals r WHERE r.inviter_user_id = ? ORDER BY r.created_at DESC LIMIT 100"
  ).bind(uid).all())?.results || [];
  const season = seasonOf(now);
  const invitees = rows.map(r => ({ name: r.nick_name || null, joined_at: Number(r.created_at), qualified: r.qualified_at != null, qualified_at: r.qualified_at ?? null }));
  const lifetime = invitees.filter(i => i.qualified).length;
  const thisSeason = rows.filter(r => r.qualified_at != null && r.season === season).length;
  return { code, invitees, lifetime, season, thisSeason };
}

// 月間ランキング（ADVANCEDになった招待数・上位10人）。名前はゲーム内の名前のみ。
export async function loadReferralRanking(db, season, limit = 10) {
  await ensureReferralSchema(db);
  const rows = (await db.prepare(
    "SELECT r.inviter_user_id, COUNT(*) AS n, MAX(r.qualified_at) AS last_at, " +
    "(SELECT p.nick_name FROM user_player_links l JOIN players p ON p.governor_id = l.governor_id WHERE l.user_id = r.inviter_user_id AND l.status = 'ACTIVE' ORDER BY CASE l.account_type WHEN 'MAIN' THEN 0 ELSE 1 END LIMIT 1) AS nick_name, " +
    "(SELECT p.kid FROM user_player_links l JOIN players p ON p.governor_id = l.governor_id WHERE l.user_id = r.inviter_user_id AND l.status = 'ACTIVE' ORDER BY CASE l.account_type WHEN 'MAIN' THEN 0 ELSE 1 END LIMIT 1) AS kid " +
    "FROM referrals r WHERE r.season = ? AND r.qualified_at IS NOT NULL GROUP BY r.inviter_user_id ORDER BY n DESC, last_at ASC LIMIT ?"
  ).bind(String(season), Math.max(1, Math.min(50, Number(limit) || 10))).all())?.results || [];
  return rows.map((r, i) => ({ rank: i + 1, user_id: String(r.inviter_user_id), name: r.nick_name || "（領主未登録）", kid: r.kid ?? null, count: Number(r.n) }));
}
