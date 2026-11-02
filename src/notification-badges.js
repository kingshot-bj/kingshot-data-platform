// Navigation badges that behave like notifications: they show only what is new
// since the user last looked, and disappear once seen.
//   watch: changes of watched players since the user last opened the watchlist
//   news : announcements (お知らせ) posted since the user last opened /news
// "Last seen" is stored per Discord account in D1, so every device agrees.
// The first time a user is seen, both marks start at "now" (no backlog flood).

const MAX_WATCHED = 100;
const MAX_COUNTED = 99;

let schemaReady = null;
export function resetBadgeSchemaCache() { schemaReady = null; }

export async function ensureBadgeSchema(db) {
  if (!schemaReady) {
    schemaReady = db.batch([
      db.prepare("CREATE TABLE IF NOT EXISTS user_badge_state (discord_id TEXT PRIMARY KEY, watch_seen_at INTEGER NOT NULL, news_seen_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)"),
      db.prepare("CREATE TABLE IF NOT EXISTS announcements (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL, created_by TEXT)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements(created_at DESC)")
    ]).then(async () => {
      // Scheduling + approval columns (added in place; existing rows stay published).
      const info = await db.prepare("PRAGMA table_info(announcements)").all();
      const have = new Set((info?.results || []).map(c => c.name));
      const add = [];
      if (!have.has("status")) add.push("ALTER TABLE announcements ADD COLUMN status TEXT NOT NULL DEFAULT 'PUBLISHED'");
      if (!have.has("publish_at")) add.push("ALTER TABLE announcements ADD COLUMN publish_at INTEGER");
      if (!have.has("reviewed_by")) add.push("ALTER TABLE announcements ADD COLUMN reviewed_by TEXT");
      if (!have.has("reviewed_at")) add.push("ALTER TABLE announcements ADD COLUMN reviewed_at INTEGER");
      for (const sql of add) await db.prepare(sql).run();
      if (add.length) await db.prepare("UPDATE announcements SET publish_at = created_at WHERE publish_at IS NULL").run();
    }).catch(error => { schemaReady = null; throw error; });
  }
  return schemaReady;
}

async function readState(db, discordId, now) {
  const row = await db.prepare("SELECT watch_seen_at, news_seen_at FROM user_badge_state WHERE discord_id = ?").bind(discordId).first();
  if (row) return row;
  await db.prepare("INSERT OR IGNORE INTO user_badge_state (discord_id, watch_seen_at, news_seen_at, updated_at) VALUES (?, ?, ?, ?)").bind(discordId, now, now, now).run();
  return { watch_seen_at: now, news_seen_at: now, fresh: true };
}

// deps.changeVisible(changeRow) applies the player visibility settings.
export async function getBadgeCounts(db, auth, deps = {}) {
  const now = deps.now ?? Math.floor(Date.now() / 1000);
  if (!db || !auth?.discord_id) return { watch: 0, news: 0 };
  await ensureBadgeSchema(db);
  const state = await readState(db, String(auth.discord_id), now);
  if (state.fresh) return { watch: 0, news: 0 };

  const news = await db.prepare(
    "SELECT COUNT(*) AS n FROM announcements WHERE status = 'PUBLISHED' AND COALESCE(publish_at, created_at) > ? AND COALESCE(publish_at, created_at) <= ?"
  ).bind(Number(state.news_seen_at), now).first();
  // OWNER also sees ADMIN posts waiting for approval on the same badge.
  const pending = String(auth.role || "").toUpperCase() === "OWNER"
    ? await db.prepare("SELECT COUNT(*) AS n FROM announcements WHERE status = 'PENDING'").first()
    : null;

  let watch = 0;
  const watched = await db.prepare(
    "SELECT governor_id FROM player_watchlists WHERE discord_id = ? AND enabled = 1 LIMIT " + MAX_WATCHED
  ).bind(String(auth.discord_id)).all();
  const ids = (watched?.results || []).map(r => String(r.governor_id));
  if (ids.length) {
    const rows = await db.prepare(
      "SELECT field_name, change_type FROM change_events WHERE target_type = 'PLAYER' AND target_id IN (" + ids.map(() => "?").join(",") +
      ") AND detected_at > ? ORDER BY detected_at DESC LIMIT " + (MAX_COUNTED + 1)
    ).bind(...ids, Number(state.watch_seen_at)).all();
    const visible = typeof deps.changeVisible === "function" ? deps.changeVisible : () => true;
    watch = (rows?.results || []).filter(visible).length;
  }
  return { watch: Math.min(watch, MAX_COUNTED + 1), news: Math.min(Number(news?.n || 0) + Number(pending?.n || 0), MAX_COUNTED + 1) };
}

export async function markBadgeSeen(db, discordId, kind, now = Math.floor(Date.now() / 1000)) {
  if (!db || !discordId || (kind !== "watch" && kind !== "news")) return false;
  await ensureBadgeSchema(db);
  const column = kind === "watch" ? "watch_seen_at" : "news_seen_at";
  await db.prepare(
    "INSERT INTO user_badge_state (discord_id, watch_seen_at, news_seen_at, updated_at) VALUES (?, ?, ?, ?) " +
    "ON CONFLICT(discord_id) DO UPDATE SET " + column + " = excluded." + column + ", updated_at = excluded.updated_at"
  ).bind(String(discordId), now, now, now).run();
  return true;
}

const COLS = "id, title, body, created_at, created_by, status, COALESCE(publish_at, created_at) AS publish_at, reviewed_by, reviewed_at";

// Published and due: what every signed-in user sees.
export async function listAnnouncements(db, limit = 30, now = Math.floor(Date.now() / 1000)) {
  await ensureBadgeSchema(db);
  const rows = await db.prepare(
    "SELECT " + COLS + " FROM announcements WHERE status = 'PUBLISHED' AND COALESCE(publish_at, created_at) <= ? ORDER BY COALESCE(publish_at, created_at) DESC LIMIT ?"
  ).bind(now, Math.min(100, Math.max(1, Number(limit) || 30))).all();
  return rows?.results || [];
}

// Not yet visible: scheduled, waiting for approval, or rejected. OWNER sees all;
// ADMIN sees scheduled posts and their own pending / rejected ones.
export async function listQueuedAnnouncements(db, auth, now = Math.floor(Date.now() / 1000)) {
  await ensureBadgeSchema(db);
  const owner = String(auth?.role || "").toUpperCase() === "OWNER";
  const rows = await db.prepare(
    "SELECT " + COLS + " FROM announcements WHERE (status = 'PUBLISHED' AND COALESCE(publish_at, created_at) > ?) OR (status IN ('PENDING','REJECTED') AND (? = 1 OR created_by = ?)) ORDER BY COALESCE(publish_at, created_at) ASC LIMIT 50"
  ).bind(now, owner ? 1 : 0, String(auth?.discord_id || "")).all();
  return rows?.results || [];
}

export async function createAnnouncement(db, { title, body, createdBy = null, role = "OWNER", publishAt = null, now = Math.floor(Date.now() / 1000) }) {
  const t = String(title || "").trim().slice(0, 120);
  const b = String(body || "").trim().slice(0, 4000);
  if (!t || !b) { const e = new Error("TITLE_AND_BODY_REQUIRED"); e.code = "TITLE_AND_BODY_REQUIRED"; throw e; }
  let at = publishAt == null || publishAt === "" ? now : Math.floor(Number(publishAt));
  if (!Number.isFinite(at)) { const e = new Error("PUBLISH_AT_INVALID"); e.code = "PUBLISH_AT_INVALID"; throw e; }
  if (at < now) at = now;
  if (at > now + 366 * 86400) { const e = new Error("PUBLISH_AT_TOO_FAR"); e.code = "PUBLISH_AT_TOO_FAR"; throw e; }
  // ADMIN posts wait for OWNER approval; OWNER posts are published (or scheduled).
  const status = String(role || "").toUpperCase() === "OWNER" ? "PUBLISHED" : "PENDING";
  await ensureBadgeSchema(db);
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO announcements (id, title, body, created_at, created_by, status, publish_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, t, b, now, createdBy, status, at).run();
  return { id, title: t, body: b, created_at: now, status, publish_at: at };
}

// OWNER only (enforced by the caller). Approving publishes at the requested
// time, or now when that time has already passed.
export async function reviewAnnouncement(db, { id, approve, reviewer, now = Math.floor(Date.now() / 1000) }) {
  await ensureBadgeSchema(db);
  const result = await db.prepare(
    approve
      ? "UPDATE announcements SET status = 'PUBLISHED', publish_at = MAX(COALESCE(publish_at, ?), ?), reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status = 'PENDING'"
      : "UPDATE announcements SET status = 'REJECTED', reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status = 'PENDING'"
  ).bind(...(approve ? [now, now, reviewer, now, String(id || "")] : [reviewer, now, String(id || "")])).run();
  return Number(result?.meta?.changes || 0) > 0;
}

// OWNER may delete anything; ADMIN only their own posts.
export async function deleteAnnouncement(db, id, auth = { role: "OWNER" }) {
  await ensureBadgeSchema(db);
  const owner = String(auth?.role || "").toUpperCase() === "OWNER";
  const result = owner
    ? await db.prepare("DELETE FROM announcements WHERE id = ?").bind(String(id || "")).run()
    : await db.prepare("DELETE FROM announcements WHERE id = ? AND created_by = ?").bind(String(id || ""), String(auth?.discord_id || "")).run();
  return Number(result?.meta?.changes || 0) > 0;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function renderNewsPage(items, { canPost = false, isOwner = false, queued = [], viewerId = null, unreadSince = null } = {}) {
  const fmt = at => new Date(Number(at) * 1000).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const canDelete = item => canPost && (isOwner || String(item.created_by || "") === String(viewerId || ""));
  const list = items.length ? items.map(item => {
    const at = item.publish_at ?? item.created_at;
    const isNew = unreadSince != null && Number(at) > Number(unreadSince);
    return '<article class="news-item"><div class="news-head"><h2>' + (isNew ? '<span class="news-new">NEW</span>' : "") + escapeHtml(item.title) + '</h2><time>' + escapeHtml(fmt(at)) + '</time></div><p>' + escapeHtml(item.body).replace(/\n/g, "<br>") + '</p>' +
      (canDelete(item) ? '<button type="button" class="news-delete" data-id="' + escapeHtml(item.id) + '">削除</button>' : "") + '</article>';
  }).join("") : '<div class="news-empty">お知らせはまだありません。</div>';
  const statusLabel = item => item.status === "PENDING" ? '<span class="news-tag pending">承認待ち</span>' : item.status === "REJECTED" ? '<span class="news-tag rejected">却下</span>' : '<span class="news-tag scheduled">予約</span>';
  const queue = canPost && queued.length ? '<section class="news-queue"><h2>予約・承認待ち</h2>' + queued.map(item =>
    '<article class="news-item"><div class="news-head"><h2>' + statusLabel(item) + escapeHtml(item.title) + '</h2><time>公開 ' + escapeHtml(fmt(item.publish_at)) + '</time></div><p>' + escapeHtml(item.body).replace(/\n/g, "<br>") + '</p><div class="news-actions">' +
      (isOwner && item.status === "PENDING" ? '<button type="button" class="news-approve action primary" data-id="' + escapeHtml(item.id) + '">承認</button><button type="button" class="news-reject" data-id="' + escapeHtml(item.id) + '">却下</button>' : "") +
      (canDelete(item) ? '<button type="button" class="news-delete" data-id="' + escapeHtml(item.id) + '">削除</button>' : "") + '</div></article>').join("") + '</section>' : "";
  const form = canPost ? '<section class="news-post"><h2>お知らせを投稿（管理者）</h2><input id="news-title" maxlength="120" placeholder="タイトル"><textarea id="news-body" rows="5" maxlength="4000" placeholder="本文"></textarea><label class="news-label">公開日時（空欄なら今すぐ）<input id="news-at" type="datetime-local"></label>' +
    (isOwner ? '<p class="news-note">公開されるとDiscordの #📢お知らせ にも流れます。</p>' : '<p class="news-note">ADMINの投稿はOWNERの承認後に公開されます（OWNERにDiscordで通知が届きます）。公開されるとDiscordの #📢お知らせ にも流れます。</p>') +
    '<button type="button" id="news-submit" class="action primary">' + (isOwner ? "投稿する" : "承認を依頼する") + '</button><div id="news-msg" class="news-msg"></div></section>' : "";
  const script = canPost ? '<script>(function(){var msg=document.getElementById("news-msg");function call(p){return fetch("/api/admin/announcements",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify(p)}).then(function(r){return r.json().catch(function(){return {ok:false}})})}' +
    'var ERR={PUBLISH_AT_TOO_FAR:"公開日時は1年以内にしてください。",PUBLISH_AT_INVALID:"公開日時が正しくありません。",TITLE_AND_BODY_REQUIRED:"タイトルと本文を入力してください。"};' +
    'document.getElementById("news-submit").onclick=function(){var t=document.getElementById("news-title").value.trim(),b=document.getElementById("news-body").value.trim(),v=document.getElementById("news-at").value;if(!t||!b){msg.textContent=ERR.TITLE_AND_BODY_REQUIRED;return}var at=v?Math.floor(new Date(v).getTime()/1000):null;msg.textContent="送信中…";call({action:"create",title:t,body:b,publish_at:at}).then(function(d){if(d.ok)location.reload();else msg.textContent="失敗しました："+(ERR[d.error]||d.error||"")})};' +
    'function bind(sel,action,question){document.querySelectorAll(sel).forEach(function(b){b.onclick=function(){if(question&&!confirm(question))return;call({action:action,id:b.dataset.id}).then(function(d){if(d.ok)location.reload();else alert("失敗しました："+(d.error||""))})}})}' +
    'bind(".news-delete","delete","このお知らせを削除しますか？");bind(".news-approve","approve","承認して公開しますか？（公開日時を過ぎていればすぐ公開）");bind(".news-reject","reject","却下しますか？");})();</script>' : "";
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>お知らせ | EagleEye</title><style>' +
    'body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:760px;margin:0 auto;padding:20px 16px calc(96px + env(safe-area-inset-bottom))}.back{color:var(--ee-cyan);text-decoration:none;font-size:13px}.eyebrow{margin-top:14px;color:var(--ee-cyan);font-size:11px;font-weight:900;letter-spacing:.1em}h1{margin:4px 0 14px;font-size:26px}' +
    '.news-item{margin:10px 0;padding:14px 16px;border:1px solid var(--ee-border-soft);border-radius:var(--ee-radius-lg,17px);background:var(--ee-panel)}.news-head{display:flex;justify-content:space-between;gap:10px;align-items:baseline}.news-head h2{margin:0;font-size:16px}.news-head time{flex:0 0 auto;font-size:11px;color:var(--ee-subtext)}.news-item p{margin:8px 0 0;font-size:14px;line-height:1.7;color:var(--ee-text)}' +
    '.news-new{display:inline-block;margin-right:6px;padding:1px 6px;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;font-weight:900;vertical-align:2px}.news-empty{padding:20px;border:1px dashed var(--ee-border-soft);border-radius:14px;color:var(--ee-subtext);text-align:center}' +
    '.news-post,.news-queue{margin:18px 0;padding:14px;border:1px solid var(--ee-border-soft);border-radius:14px;background:var(--ee-panel)}.news-queue{background:var(--ee-panel-deep)}.news-post h2,.news-queue>h2{margin:0 0 8px;font-size:14px}.news-post input,.news-post textarea{box-sizing:border-box;width:100%;margin:4px 0 8px;padding:10px;border:1px solid var(--ee-border);border-radius:10px;font:inherit}.news-label{display:block;font-size:12px;color:var(--ee-subtext)}.news-note{font-size:12px;color:var(--ee-subtext);margin:0 0 8px}.news-msg{font-size:12px;color:var(--ee-subtext);margin-top:6px}' +
    '.news-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.news-delete,.news-reject,.news-approve{font-size:12px;padding:6px 12px}.news-tag{display:inline-block;margin-right:6px;padding:1px 7px;border-radius:999px;font-size:10px;font-weight:900;vertical-align:2px}.news-tag.pending{background:#f59e0b;color:#1f1300}.news-tag.scheduled{background:var(--ee-cyan);color:var(--ee-on-accent,#062033)}.news-tag.rejected{background:#64748b;color:#fff}' +
    '</style></head><body><main class="wrap"><a class="back" href="/">← ホーム</a><div class="eyebrow">お知らせ</div><h1>お知らせ</h1>' + form + queue + list + '</main>' + script + '</body></html>';
}
