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
    ]).catch(error => { schemaReady = null; throw error; });
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

  const news = await db.prepare("SELECT COUNT(*) AS n FROM announcements WHERE created_at > ?").bind(Number(state.news_seen_at)).first();

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
  return { watch: Math.min(watch, MAX_COUNTED + 1), news: Math.min(Number(news?.n || 0), MAX_COUNTED + 1) };
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

export async function listAnnouncements(db, limit = 30) {
  await ensureBadgeSchema(db);
  const rows = await db.prepare("SELECT id, title, body, created_at FROM announcements ORDER BY created_at DESC LIMIT ?").bind(Math.min(100, Math.max(1, Number(limit) || 30))).all();
  return rows?.results || [];
}

export async function createAnnouncement(db, { title, body, createdBy = null, now = Math.floor(Date.now() / 1000) }) {
  const t = String(title || "").trim().slice(0, 120);
  const b = String(body || "").trim().slice(0, 4000);
  if (!t || !b) { const e = new Error("TITLE_AND_BODY_REQUIRED"); e.code = "TITLE_AND_BODY_REQUIRED"; throw e; }
  await ensureBadgeSchema(db);
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO announcements (id, title, body, created_at, created_by) VALUES (?, ?, ?, ?, ?)").bind(id, t, b, now, createdBy).run();
  return { id, title: t, body: b, created_at: now };
}

export async function deleteAnnouncement(db, id) {
  await ensureBadgeSchema(db);
  const result = await db.prepare("DELETE FROM announcements WHERE id = ?").bind(String(id || "")).run();
  return Number(result?.meta?.changes || 0) > 0;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function renderNewsPage(items, { canPost = false, unreadSince = null } = {}) {
  const fmt = at => new Date(Number(at) * 1000).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const list = items.length ? items.map(item => {
    const isNew = unreadSince != null && Number(item.created_at) > Number(unreadSince);
    return '<article class="news-item"><div class="news-head"><h2>' + (isNew ? '<span class="news-new">NEW</span>' : "") + escapeHtml(item.title) + '</h2><time>' + escapeHtml(fmt(item.created_at)) + '</time></div><p>' + escapeHtml(item.body).replace(/\n/g, "<br>") + '</p>' +
      (canPost ? '<button type="button" class="news-delete" data-id="' + escapeHtml(item.id) + '">削除</button>' : "") + '</article>';
  }).join("") : '<div class="news-empty">お知らせはまだありません。</div>';
  const form = canPost ? '<section class="news-post"><h2>お知らせを投稿（OWNER）</h2><input id="news-title" maxlength="120" placeholder="タイトル"><textarea id="news-body" rows="5" maxlength="4000" placeholder="本文"></textarea><button type="button" id="news-submit" class="action primary">投稿する</button><div id="news-msg" class="news-msg"></div></section>' : "";
  const script = canPost ? '<script>(function(){var msg=document.getElementById("news-msg");function call(p){return fetch("/api/owner/announcements",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify(p)}).then(function(r){return r.json().catch(function(){return {ok:false}})})}' +
    'document.getElementById("news-submit").onclick=function(){var t=document.getElementById("news-title").value.trim(),b=document.getElementById("news-body").value.trim();if(!t||!b){msg.textContent="タイトルと本文を入力してください。";return}msg.textContent="投稿中…";call({action:"create",title:t,body:b}).then(function(d){if(d.ok)location.reload();else msg.textContent="投稿に失敗しました："+(d.error||"")})};' +
    'document.querySelectorAll(".news-delete").forEach(function(b){b.onclick=function(){if(!confirm("このお知らせを削除しますか？"))return;call({action:"delete",id:b.dataset.id}).then(function(d){if(d.ok)location.reload();else alert("削除に失敗しました")})}})})();</script>' : "";
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>お知らせ | EagleEye</title><style>' +
    'body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:760px;margin:0 auto;padding:20px 16px calc(96px + env(safe-area-inset-bottom))}.back{color:var(--ee-cyan);text-decoration:none;font-size:13px}.eyebrow{margin-top:14px;color:var(--ee-cyan);font-size:11px;font-weight:900;letter-spacing:.1em}h1{margin:4px 0 14px;font-size:26px}' +
    '.news-item{margin:10px 0;padding:14px 16px;border:1px solid var(--ee-border-soft);border-radius:var(--ee-radius-lg,17px);background:var(--ee-panel)}.news-head{display:flex;justify-content:space-between;gap:10px;align-items:baseline}.news-head h2{margin:0;font-size:16px}.news-head time{flex:0 0 auto;font-size:11px;color:var(--ee-subtext)}.news-item p{margin:8px 0 0;font-size:14px;line-height:1.7;color:var(--ee-text)}' +
    '.news-new{display:inline-block;margin-right:6px;padding:1px 6px;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;font-weight:900;vertical-align:2px}.news-empty{padding:20px;border:1px dashed var(--ee-border-soft);border-radius:14px;color:var(--ee-subtext);text-align:center}' +
    '.news-post{margin:18px 0;padding:14px;border:1px solid var(--ee-border-soft);border-radius:14px;background:var(--ee-panel)}.news-post h2{margin:0 0 8px;font-size:14px}.news-post input,.news-post textarea{box-sizing:border-box;width:100%;margin:4px 0 8px;padding:10px;border:1px solid var(--ee-border);border-radius:10px;font:inherit}.news-msg{font-size:12px;color:var(--ee-subtext);margin-top:6px}.news-delete{margin-top:8px;font-size:12px;padding:6px 10px}' +
    '</style></head><body><main class="wrap"><a class="back" href="/">← ホーム</a><div class="eyebrow">お知らせ</div><h1>お知らせ</h1>' + form + list + '</main>' + script + '</body></html>';
}
