// マイルストーン①：EagleEye編（使い方の一歩ずつ）と成長編（ゲーム内の到達点）。
// 判定は表示時に、すでにD1にあるデータ（players・kingdom_ranking_current・ウォッチ数）だけで行う。
// MightPulse への新しい呼び出しはしない。一度達成したら記録（user_milestones）に残り、戦力が下がっても消えない。
// 読み取りは1回あたり数十行（主キー・索引で引く）。

const ROLE_RANK = { BASIC: 0, ADVANCED: 1, VIP: 2, ADMIN: 3, OWNER: 4 };
// 秘境の試練のステージ系ボード（値＝オフセット＋通算ステージ番号。1章10ステージ）。
export const MYSTIC_STAGE_BOARDS = Object.freeze({ coliseum: 10000, forest_of_life: 20000, crystal_cave: 30000, knowledge_nexus: 40000, molten_fort: 50000, radiant_spire: 60000 });
const RANK_BOARDS = ["personal_power", ...Object.keys(MYSTIC_STAGE_BOARDS)];

const fmtPower = n => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v >= 1e8 ? (Math.floor(v / 1e6) / 100).toFixed(2).replace(/\.?0+$/, "") + "億" : v >= 1e4 ? Math.floor(v / 1e4).toLocaleString("ja-JP") + "万" : String(v);
};
// 役場の値：35=黄金1、40=黄金2…（town-center-level.js と同じ）。
export const goldLevelOf = level => {
  const n = Number(level);
  return Number.isFinite(n) && n >= 35 ? Math.floor((n - 35) / 5) + 1 : 0;
};
const goldTarget = g => 35 + (g - 1) * 5;

// ctx: { linked, role, watchCount, shared, player: { power, town_center_level }, powerRank, mysticChapter, visible }
export const MILESTONES = Object.freeze([
  { key: "first_step", group: "eagleeye", icon: "👣", title: "はじめの一歩", desc: "Discordでログインする", check: () => ({ done: true }) },
  { key: "governor_link", group: "eagleeye", icon: "🪪", title: "領主の証", desc: "マイKingShotで自分の領主IDを登録する", href: "/my-player", check: c => ({ done: Boolean(c.linked) }) },
  { key: "observer", group: "eagleeye", icon: "🔭", title: "観測者", desc: "APIキーを登録してADVANCEDになる", href: "/my-player", check: c => ({ done: (ROLE_RANK[String(c.role || "").toUpperCase()] ?? 0) >= ROLE_RANK.ADVANCED }) },
  { key: "watcher", group: "eagleeye", icon: "👀", title: "見張り番", desc: "プレイヤーを3人ウォッチする", href: "/players", check: c => ({ done: Number(c.watchCount) >= 3, now: Math.min(3, Number(c.watchCount) || 0), goal: 3, label: `${Math.min(3, Number(c.watchCount) || 0)} / 3人` }) },
  { key: "herald", group: "eagleeye", icon: "📣", title: "伝令", desc: "プレイヤー比較の画像を作って共有する", href: "/players", check: c => ({ done: Boolean(c.shared) }) },
  ...[1, 5, 8].map(g => ({
    key: "gold_" + g, group: "growth", icon: "🏅", title: `黄金${g}`, desc: `役場を黄金${g}にする`, needsPlayer: true, sensitive: "base_power",
    check: c => {
      const cur = goldLevelOf(c.player?.town_center_level);
      const lv = Number(c.player?.town_center_level) || 0;
      return { done: lv >= goldTarget(g), now: Math.max(0, Math.min(lv, goldTarget(g)) - 30), goal: goldTarget(g) - 30, label: cur ? `いま 黄金${cur}` : lv ? `いま Lv.${Math.min(lv, 30)}` : "" };
    }
  })),
  ...[[1e8, "戦力1億"], [5e8, "戦力5億"], [1e9, "戦力10億"]].map(([v, t]) => ({
    key: "power_" + v / 1e8 + "e8", group: "growth", icon: "💪", title: t, desc: `個人戦力${t.slice(2)}に到達する`, needsPlayer: true, sensitive: "base_power",
    check: c => {
      const p = Number(c.player?.power) || 0;
      return { done: p >= v, now: Math.min(p, v), goal: v, label: p ? "いま " + fmtPower(p) : "" };
    }
  })),
  ...[30, 50, 60].map(ch => ({
    key: "mystic_" + ch, group: "growth", icon: "🏔️", title: `秘境 ${ch}章`, desc: `秘境の試練のどれかで${ch}章に到達する`, needsPlayer: true, sensitive: "ranks_core",
    check: c => {
      const cur = Number(c.mysticChapter) || 0;
      return { done: cur >= ch, now: Math.min(cur, ch), goal: ch, label: cur ? `いま ${cur}章` : "王国内TOP100に入ると記録されます" };
    }
  })),
  { key: "kingdom_top10", group: "growth", icon: "👑", title: "王国の十傑", desc: "自分の王国で個人戦力TOP10に入る", needsPlayer: true, sensitive: "ranks_core",
    check: c => ({ done: Number(c.powerRank) > 0 && Number(c.powerRank) <= 10, label: Number(c.powerRank) > 0 ? `いま 王国内${c.powerRank}位` : "" }) }
]);

export const MILESTONE_GROUPS = Object.freeze([
  { key: "eagleeye", title: "EagleEye編", lead: "EagleEyeを使いこなす5つの一歩" },
  { key: "growth", title: "成長編", lead: "ゲーム内の到達点（記録されたデータで自動判定）" }
]);

// 純粋関数：ctx から各マイルストーンの判定結果を作る。stored は達成済みの記録（Map key -> {achieved_at, seen}）。
export function evaluateMilestones(ctx, stored = new Map()) {
  const visible = typeof ctx.visible === "function" ? ctx.visible : () => true;
  return MILESTONES.map(m => {
    const r = m.needsPlayer && !ctx.player ? { done: false, label: "領主IDの登録が必要です" } : m.check(ctx);
    const rec = stored.get(m.key);
    const out = { key: m.key, group: m.group, icon: m.icon, title: m.title, desc: m.desc, href: m.href || null, done: Boolean(rec) || Boolean(r.done), achieved_at: rec?.achieved_at ?? null, label: r.label || "" };
    if (r.goal && !out.done) out.progress = Math.max(0, Math.min(1, Number(r.now) / r.goal));
    if (m.sensitive && !visible(m.sensitive) && ctx.player) { out.label = ""; delete out.progress; }
    return out;
  });
}

// 秘境のステージ系ボードの値（オフセット込み）から、到達した章（一番進んでいるもの）を返す。
export function mysticChapterFromRanks(rows) {
  let best = 0;
  for (const r of rows || []) {
    const off = MYSTIC_STAGE_BOARDS[r.board];
    if (off == null) continue;
    const v = Number(r.score) - off;
    if (Number.isFinite(v) && v >= 1 && v < 10000) best = Math.max(best, Math.floor((v - 1) / 10) + 1);
  }
  return best;
}

let schemaReady = null;
export function resetMilestoneSchemaCache() { schemaReady = null; }
export async function ensureMilestoneSchema(db) {
  if (!schemaReady) {
    schemaReady = db.prepare("CREATE TABLE IF NOT EXISTS user_milestones (user_id TEXT NOT NULL, key TEXT NOT NULL, achieved_at INTEGER NOT NULL, seen INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, key))").run()
      .catch(error => { schemaReady = null; throw error; });
  }
  return schemaReady;
}

// 比較画像の共有など、表示時に判定できないものを記録する。
export async function recordMilestone(db, userId, key, now = Math.floor(Date.now() / 1000)) {
  if (!db || !userId || !MILESTONES.some(m => m.key === key)) return false;
  await ensureMilestoneSchema(db);
  const r = await db.prepare("INSERT OR IGNORE INTO user_milestones (user_id, key, achieved_at, seen) VALUES (?, ?, ?, 0)").bind(String(userId), key, now).run();
  return Boolean(r?.meta?.changes);
}

// auth: { user_id, discord_id, role }。markSeen=true（マイルストーン画面）なら「新しく達成」を既読にする。
export async function loadMilestones(db, auth, { visible = () => true, now = Math.floor(Date.now() / 1000), markSeen = false } = {}) {
  if (!db || !auth?.user_id) return null;
  await ensureMilestoneSchema(db);
  const userId = String(auth.user_id);
  const [storedRows, link, watch] = await Promise.all([
    db.prepare("SELECT key, achieved_at, seen FROM user_milestones WHERE user_id = ?").bind(userId).all(),
    db.prepare(
      "SELECT l.governor_id, l.kingdom_id, p.kid, p.power, p.town_center_level FROM user_player_links l LEFT JOIN players p ON p.governor_id = l.governor_id " +
      "WHERE l.user_id = ? AND l.status = 'ACTIVE' ORDER BY CASE l.account_type WHEN 'MAIN' THEN 0 ELSE 1 END, l.created_at ASC LIMIT 1"
    ).bind(userId).first(),
    auth.discord_id ? db.prepare("SELECT COUNT(*) AS n FROM player_watchlists WHERE discord_id = ? AND enabled = 1").bind(String(auth.discord_id)).first() : Promise.resolve({ n: 0 })
  ]);
  const stored = new Map((storedRows?.results || []).map(r => [String(r.key), { achieved_at: Number(r.achieved_at), seen: Number(r.seen) }]));
  const ctx = { linked: Boolean(link), role: auth.role, watchCount: Number(watch?.n) || 0, shared: stored.has("herald"), player: null, powerRank: null, mysticChapter: 0, visible };
  const kid = Number(link?.kid ?? link?.kingdom_id) || null;
  if (link && link.power != null) ctx.player = { power: link.power, town_center_level: link.town_center_level };
  if (link && kid) {
    const ranks = await db.prepare(
      "SELECT board, rank, score FROM kingdom_ranking_current WHERE kid = ? AND target_type = 'PLAYER' AND target_id = ? AND board IN (" + RANK_BOARDS.map(() => "?").join(",") + ")"
    ).bind(kid, String(link.governor_id), ...RANK_BOARDS).all().catch(() => ({ results: [] }));
    const rows = ranks?.results || [];
    ctx.powerRank = rows.find(r => r.board === "personal_power")?.rank ?? null;
    ctx.mysticChapter = mysticChapterFromRanks(rows);
    if (!ctx.player) ctx.player = {};
  }
  const items = evaluateMilestones(ctx, stored);
  const fresh = items.filter(i => i.done && !stored.has(i.key));
  if (fresh.length) {
    await db.batch(fresh.map(i => db.prepare("INSERT OR IGNORE INTO user_milestones (user_id, key, achieved_at, seen) VALUES (?, ?, ?, ?)").bind(userId, i.key, now, markSeen || i.key === "first_step" ? 1 : 0)));
    for (const i of fresh) { i.achieved_at = now; stored.set(i.key, { achieved_at: now, seen: markSeen || i.key === "first_step" ? 1 : 0 }); }
  }
  const unseen = items.filter(i => i.done && stored.get(i.key)?.seen === 0).map(i => ({ key: i.key, icon: i.icon, title: i.title }));
  if (markSeen && unseen.length) await db.prepare("UPDATE user_milestones SET seen = 1 WHERE user_id = ? AND seen = 0").bind(userId).run();
  return { items, achieved: items.filter(i => i.done).length, total: items.length, unseen };
}


function milestonesClient(cfg) {
  var root = document.getElementById("msRoot");
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function day(t) { if (!t) return ""; var d = new Date(Number(t) * 1000); return (d.getMonth() + 1) + "/" + d.getDate() + " 達成"; }
  function card(i) {
    var inner = '<span class="ms-icon" aria-hidden="true">' + esc(i.icon) + '</span><span class="ms-copy"><b>' + esc(i.title) + '</b><small>' + esc(i.desc) + '</small>' +
      (i.progress != null ? '<span class="ms-bar"><i style="width:' + Math.round(i.progress * 100) + '%"></i></span>' : '') +
      (i.label && !i.done ? '<em>' + esc(i.label) + '</em>' : '') + '</span><span class="ms-state">' + (i.done ? '✓<small>' + esc(day(i.achieved_at)) + '</small>' : '未達成') + '</span>';
    var cls = "ms-card" + (i.done ? " done" : "") + (i.fresh ? " fresh" : "");
    return i.href && !i.done ? '<a class="' + cls + '" href="' + esc(i.href) + '">' + inner + '</a>' : '<div class="' + cls + '">' + inner + '</div>';
  }
  fetch("/api/milestones?seen=1", { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.json().then(function (d) { return { s: r.status, d: d }; }); }).then(function (x) {
    if (x.s === 401) { root.innerHTML = '<div class="ms-login"><p>マイルストーンはログインすると記録されます。</p><a href="/api/auth/discord?next=%2Fmilestones">Discordでログイン →</a></div>'; return; }
    var d = x.d; if (!d || !d.ok) throw new Error("x");
    var fresh = {}; (d.unseen || []).forEach(function (u) { fresh[u.key] = 1; });
    var html = '<div class="ms-total"><b>' + d.achieved + '</b> / ' + d.total + ' 達成<span class="ms-bar"><i style="width:' + Math.round(d.achieved / Math.max(1, d.total) * 100) + '%"></i></span></div>';
    if ((d.unseen || []).length) html += '<div class="ms-new">🎉 新しく達成：' + d.unseen.map(function (u) { return esc(u.icon + " " + u.title); }).join("、") + '</div>';
    cfg.groups.forEach(function (g) {
      var items = d.items.filter(function (i) { return i.group === g.key; });
      items.forEach(function (i) { i.fresh = fresh[i.key]; });
      var n = items.filter(function (i) { return i.done; }).length;
      html += '<section class="ms-group"><h2>' + esc(g.title) + ' <small>' + n + ' / ' + items.length + '</small></h2><p class="ms-lead">' + esc(g.lead) + '</p><div class="ms-list">' + items.map(card).join("") + '</div></section>';
    });
    root.innerHTML = html;
  }).catch(function () { root.innerHTML = '<p class="ms-lead">読み込めませんでした。時間をおいて開き直してください。</p>'; });
}

export function renderMilestonesPage() {
  const cfg = JSON.stringify({ groups: MILESTONE_GROUPS }).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>マイルストーン | EagleEye</title><meta name="robots" content="noindex">
<style>body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:760px;margin:0 auto;padding:18px 16px calc(96px + env(safe-area-inset-bottom))}
.crumbs{font-size:12px;color:var(--ee-subtext)}.crumbs a{color:var(--ee-cyan);text-decoration:none}h1{font-size:22px;margin:8px 0 4px}.lead,.ms-lead{font-size:13px;color:var(--ee-subtext);margin:4px 0 10px}
.ms-total{display:grid;gap:6px;padding:12px 14px;border:1px solid rgba(246,200,75,.35);border-radius:16px;background:linear-gradient(110deg,rgba(48,39,18,.45),var(--ee-panel));font-size:14px}.ms-total b{font-size:26px;color:#f6c84b}
.ms-new{margin:10px 0;padding:10px 12px;border-radius:12px;background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.4);font-size:13px;font-weight:800}
.ms-group{margin-top:18px}.ms-group h2{font-size:16px;margin:0}.ms-group h2 small{font-size:12px;color:var(--ee-subtext);font-weight:700}
.ms-list{display:grid;gap:8px}.ms-card{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--ee-border-soft);border-radius:14px;background:var(--ee-panel);color:var(--ee-text);text-decoration:none}
.ms-card:not(.done) .ms-icon{filter:grayscale(1);opacity:.55}.ms-card.done{border-color:rgba(246,200,75,.45);background:linear-gradient(110deg,rgba(48,39,18,.35),var(--ee-panel))}.ms-card.fresh{box-shadow:0 0 0 2px rgba(34,197,94,.55)}
.ms-icon{flex:0 0 42px;display:grid;place-items:center;width:42px;height:42px;border-radius:12px;border:1px solid rgba(246,200,75,.35);font-size:22px}
.ms-copy{flex:1;min-width:0;display:grid;gap:3px}.ms-copy b{font-size:14px}.ms-copy small{font-size:12px;color:var(--ee-subtext)}.ms-copy em{font-style:normal;font-size:11px;color:var(--ee-cyan)}
.ms-bar{display:block;height:6px;border-radius:3px;background:rgba(148,163,184,.25);overflow:hidden}.ms-bar i{display:block;height:100%;background:linear-gradient(90deg,#f6c84b,#facc15)}
.ms-state{flex:0 0 auto;text-align:right;font-size:12px;font-weight:900;color:var(--ee-subtext)}.done .ms-state{color:#f6c84b;font-size:18px}.ms-state small{display:block;font-size:10px;font-weight:700;color:var(--ee-subtext)}
.ms-login{padding:16px;border:1px solid var(--ee-border-soft);border-radius:14px;background:var(--ee-panel)}.ms-login a{display:inline-block;margin-top:6px;padding:9px 16px;border-radius:999px;background:#5865f2;color:#fff;font-weight:900;text-decoration:none}</style></head>
<body><main class="wrap"><nav class="crumbs"><a href="/">EagleEye</a> › マイルストーン</nav>
<h1>✦ マイルストーン</h1><p class="lead">EagleEyeの使い方とゲーム内の成長で、バッジが増えていきます。判定はEagleEyeに記録されたデータで自動で行います（一度達成したら消えません）。</p>
<div id="msRoot"><p class="ms-lead">読み込み中…</p></div>
</main><script>var __name=function(f){return f};(${milestonesClient.toString()})(${cfg});</script></body></html>`;
}

