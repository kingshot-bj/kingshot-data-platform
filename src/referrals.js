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

// 招待ページ（ログインした全員が使える。マイルストーンとは独立）。
function inviteClient() {
  var root = document.getElementById("invRoot");
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  fetch("/api/invite", { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.json().then(function (d) { return { s: r.status, d: d }; }); }).then(function (x) {
    if (x.s === 401) { root.innerHTML = '<div class="inv-box"><p>招待リンクはログインすると作られます。</p><a class="inv-login" href="/api/auth/discord?next=%2Finvite">Discordでログイン →</a></div>'; return; }
    var d = x.d; if (!d || !d.ok) throw new Error("x");
    var month = String(d.season).split("-")[1].replace(/^0/, "") + "月";
    root.innerHTML =
      '<div class="inv-link"><input readonly value="' + esc(d.link) + '" aria-label="あなたの招待リンク"><button type="button" id="invCopy">' + (navigator.share ? "共有" : "コピー") + '</button></div>' +
      '<p class="inv-lead">このリンクから<b>初めて</b>ログインした人が、APIキーを登録してADVANCEDになると1人に数えます（リンクを開いてから30日以内のログインが対象）。</p>' +
      '<div class="inv-box"><b>あなたの招待</b><div class="inv-nums"><span><em>' + d.this_season + '</em>' + esc(month) + '</span><span><em>' + d.lifetime + '</em>累計</span></div>' +
      (d.invitees.length ? '<ul>' + d.invitees.map(function (i) { return '<li>' + esc(i.name || "（領主ID未登録）") + '　' + (i.qualified ? '<span class="ok">ADVANCED ✓</span>' : '<span class="wait">登録済み・ADVANCED待ち</span>') + '</li>'; }).join("") + '</ul>' : '<p class="inv-lead">まだいません。同盟やDiscordでリンクを共有してみましょう。</p>') + '</div>' +
      '<div class="inv-box"><b>' + esc(month) + 'の招待ランキング</b>' + (d.ranking.length ? '<ol class="inv-rank">' + d.ranking.map(function (r) { return '<li' + (r.me ? ' class="me"' : '') + '><span>' + r.rank + '</span><b>' + esc(r.name) + '</b><small>' + (r.kid ? '王国' + esc(r.kid) : '') + '</small><em>' + r.count + '人</em></li>'; }).join("") + '</ol>' : '<p class="inv-lead">今月はまだ誰もいません。1人目になろう。</p>') +
      '<small class="inv-note">毎月1日（日本時間）にリセット。報酬は後日お知らせします。</small></div>';
    document.getElementById("invCopy").onclick = function () {
      var text = "KingShotの分析・攻略ツール EagleEye（無料）";
      if (navigator.share) { navigator.share({ title: "EagleEye", text: text, url: d.link }).catch(function () {}); return; }
      var btn = this; (navigator.clipboard ? navigator.clipboard.writeText(d.link) : Promise.reject()).then(function () { btn.textContent = "コピーしました"; }).catch(function () { root.querySelector("input").select(); });
    };
  }).catch(function () { root.innerHTML = '<p class="inv-lead">読み込めませんでした。時間をおいて開き直してください。</p>'; });
}

export function renderInvitePage() {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>友だち招待 | EagleEye</title><meta name="robots" content="noindex">
<style>body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:760px;margin:0 auto;padding:18px 16px calc(96px + env(safe-area-inset-bottom))}
.crumbs{font-size:12px;color:var(--ee-subtext)}.crumbs a{color:var(--ee-cyan);text-decoration:none}h1{font-size:22px;margin:8px 0 4px}.inv-lead{font-size:13px;color:var(--ee-subtext);margin:6px 0 10px}
.inv-link{display:flex;gap:8px;margin:12px 0 4px}.inv-link input{flex:1;min-width:0;padding:11px;border-radius:12px;border:1px solid var(--ee-border-soft);background:var(--ee-panel);color:var(--ee-text);font-size:13px}.inv-link button{padding:11px 18px;border:0;border-radius:12px;background:#facc15;color:#1f1300;font-weight:900;font-size:14px}
.inv-box{margin:12px 0;padding:14px;border:1px solid var(--ee-border-soft);border-radius:16px;background:var(--ee-panel);font-size:13px}.inv-box>b{display:block;margin-bottom:8px;font-size:14px}.inv-box ul{margin:8px 0 0;padding-left:1.2em;line-height:1.8}
.inv-nums{display:flex;gap:10px}.inv-nums span{flex:1;display:grid;justify-items:center;padding:8px;border-radius:12px;background:rgba(148,163,184,.08);color:var(--ee-subtext);font-size:12px}.inv-nums em{font-style:normal;font-size:24px;font-weight:900;color:#f6c84b}
.ok{color:#22c55e;font-weight:800}.wait{color:var(--ee-subtext)}.inv-note{display:block;margin-top:8px;color:var(--ee-subtext);font-size:11px}
.inv-rank{list-style:none;margin:0;padding:0;display:grid;gap:6px}.inv-rank li{display:grid;grid-template-columns:2em 1fr auto auto;gap:8px;align-items:center;padding:7px 9px;border-radius:10px;background:rgba(148,163,184,.08)}.inv-rank li.me{outline:2px solid rgba(250,204,21,.6)}.inv-rank span{font-weight:900;color:#f6c84b}.inv-rank small{color:var(--ee-subtext)}.inv-rank em{font-style:normal;font-weight:900}
.inv-login{display:inline-block;margin-top:6px;padding:9px 16px;border-radius:999px;background:#5865f2;color:#fff;font-weight:900;text-decoration:none}</style></head>
<body><main class="wrap"><nav class="crumbs"><a href="/">EagleEye</a> › 友だち招待</nav>
<h1>📨 友だち招待</h1><p class="inv-lead">あなた専用の招待リンクで、同盟の仲間やフレンドをEagleEyeに招待しよう。</p>
<div id="invRoot"><p class="inv-lead">読み込み中…</p></div>
</main><script>var __name=function(f){return f};(${inviteClient.toString()})();</script></body></html>`;
}
