// 同盟の公開ページ（/a/{王国}/{同盟ID}）と、そのための全王国の同盟一覧の収集。
// ・収集は「余裕がある日だけ」：今月のD1の読み書きが日割りの枠の8割以内、APIキーの使用が直近24時間で3割未満、
//   前回の一巡から7日以上。条件を満たした時間だけ、1回100王国ずつ進める（既存の1時間ごとの処理の中で動く。新しいcronはない）。
// ・1王国につきMightPulseを1回（同盟戦力ランキング上位50）。保存は alliance_directory に1同盟1行。
// ・公開ページに出すメンバー名は、王国の戦力上位10人に入っている人だけ（王国ページで公開済みの範囲）。ほかは人数だけ。

export const ALLIANCE_SWEEP_PER_RUN = 100;
export const ALLIANCE_SWEEP_TOP = 50;
export const ALLIANCE_SWEEP_INTERVAL_SECONDS = 7 * 86400;
export const ALLIANCE_SITEMAP_TOP = 10;
const STATE_KEY = "alliance_sweep";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const normAid = v => String(v ?? "").trim().replace(/^(\d+)\.0+$/, "$1");
export function compactNumber(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e11 ? 0 : 1) + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e8 ? 0 : 1) + "M";
  if (a >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
}

let schemaReady = null;
export function resetAllianceDirectorySchemaCache() { schemaReady = null; }
export async function ensureAllianceDirectorySchema(db) {
  if (!schemaReady) {
    schemaReady = db.batch([
      db.prepare("CREATE TABLE IF NOT EXISTS alliance_directory (kid INTEGER NOT NULL, aid TEXT NOT NULL, abbr TEXT, name TEXT, power INTEGER, rank INTEGER, updated_at INTEGER NOT NULL, PRIMARY KEY (kid, aid))"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_alliance_directory_kid_rank ON alliance_directory (kid, rank)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_alliance_directory_rank ON alliance_directory (rank, kid, aid)"),
      db.prepare("CREATE TABLE IF NOT EXISTS ops_alert_state (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER NOT NULL)")
    ]).catch(error => { schemaReady = null; throw error; });
  }
  return schemaReady;
}

// 余裕があるか。d1 は使用量の見張りの結果（今月の合計つき）、api は APIキー使用量の見張りの結果。
// 見張りの結果が古い・取れていないときは「余裕なし」として動かない（安全側）。
export function sweepBudget({ d1, api, quota, nowMs = Date.now() }) {
  const now = Math.floor(nowMs / 1000);
  if (!d1 || d1.error || d1.monthRowsRead == null || now - Number(d1.checkedAt || 0) > 3 * 3600) return { ok: false, reason: "D1_USAGE_UNKNOWN" };
  const d = new Date(nowMs);
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  const share = d.getUTCDate() / daysInMonth; // 今日までに使ってよい割合（日割り）
  if (Number(d1.monthRowsRead) > quota.reads * share * 0.8) return { ok: false, reason: "D1_READS_TIGHT", used: Number(d1.monthRowsRead), allowed: Math.floor(quota.reads * share * 0.8) };
  if (Number(d1.monthRowsWritten || 0) > quota.writes * share * 0.8) return { ok: false, reason: "D1_WRITES_TIGHT", used: Number(d1.monthRowsWritten), allowed: Math.floor(quota.writes * share * 0.8) };
  if (!api || !(Number(api.quota) > 0) || now - Number(api.checkedAt || 0) > 3 * 3600) return { ok: false, reason: "API_USAGE_UNKNOWN" };
  if (Number(api.used) / Number(api.quota) >= 0.3) return { ok: false, reason: "API_BUSY" };
  return { ok: true };
}

async function getState(db) {
  const row = await db.prepare("SELECT value FROM ops_alert_state WHERE key = ?").bind(STATE_KEY).first().catch(() => null);
  try { return JSON.parse(row?.value || "null") || {}; } catch { return {}; }
}
async function setState(db, value, now) {
  await db.prepare("INSERT INTO ops_alert_state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(STATE_KEY, JSON.stringify(value), now).run();
}
export async function getAllianceSweepState(db) { if (!db) return null; await ensureAllianceDirectorySchema(db); return getState(db); }

export function allianceRowsFromEntries(entries, top = ALLIANCE_SWEEP_TOP) {
  const out = [], seen = new Set();
  for (const e of entries || []) {
    const aid = normAid(e?.aid ?? e?.alliance_id ?? e?.allianceId ?? e?.target_id ?? e?.id);
    if (!aid || seen.has(aid)) continue;
    const rank = Number(e?.rank ?? e?.ranking ?? e?.rank_no);
    const power = Number(e?.score ?? e?.value ?? e?.power);
    seen.add(aid);
    out.push({ aid, abbr: String(e?.abbr ?? e?.alliance_abbr ?? e?.tag ?? "").slice(0, 16) || null, name: String(e?.name ?? e?.alliance_name ?? "").slice(0, 60) || null, rank: Number.isFinite(rank) ? rank : null, power: Number.isFinite(power) ? Math.round(power) : null });
    if (out.length >= top) break;
  }
  return out;
}

// 1時間ごとの処理から呼ぶ。collect は APIキー枠を守る取得（collectMightPulseThroughGuards）、extractEntries はランキングの行を取り出す関数。
export async function runAllianceSweep(env, { collect, extractEntries, d1, api, quota, nowMs = Date.now(), perRun = ALLIANCE_SWEEP_PER_RUN } = {}) {
  const db = env?.DB;
  if (!db || !collect || !extractEntries) return { skipped: true, reason: "NOT_CONFIGURED" };
  await ensureAllianceDirectorySchema(db);
  const now = Math.floor(nowMs / 1000);
  const state = await getState(db);
  if (state.completedAt && now - Number(state.completedAt) < ALLIANCE_SWEEP_INTERVAL_SECONDS && !state.cursor) return { skipped: true, reason: "RECENTLY_COMPLETED" };
  const budget = sweepBudget({ d1, api, quota, nowMs });
  if (!budget.ok) {
    if (state.lastReason !== budget.reason || now - Number(state.lastCheckedAt || 0) > 6 * 3600) await setState(db, { ...state, lastReason: budget.reason, lastCheckedAt: now }, now);
    return { skipped: true, reason: budget.reason };
  }
  const cursor = Number(state.cursor) || 0;
  const kids = ((await db.prepare("SELECT kid FROM kingdom_catalog WHERE kid > ? ORDER BY kid ASC LIMIT ?").bind(cursor, perRun).all())?.results || []).map(r => Number(r.kid)).filter(Number.isInteger);
  if (!kids.length) {
    await setState(db, { ...state, cursor: 0, completedAt: now, lastRunAt: now, lastReason: "COMPLETED", lastCheckedAt: now }, now);
    return { completed: true };
  }
  const summary = { kingdoms: 0, alliances: 0, failed: 0, from: kids[0] };
  let last = cursor;
  for (const kid of kids) {
    let rows = [];
    try {
      const collected = await collect(env, { path: `/kingdoms/${encodeURIComponent(kid)}/ranks`, endpoint: "/kingdoms/:kid/ranks", targetType: "KINGDOM", targetId: String(kid), purpose: "ALLIANCE_DIRECTORY", query: { board: "alliance_power", limit: ALLIANCE_SWEEP_TOP } });
      rows = allianceRowsFromEntries(extractEntries(collected?.result?.data ?? collected?.result ?? collected));
    } catch (error) {
      if (Number(error?.status) !== 404) { summary.failed++; console.error("alliance_sweep_fetch_failed", kid, error?.code || error?.message || error); break; } // 次の回に同じ王国から
    }
    if (rows.length) {
      const values = rows.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ");
      await db.batch([
        db.prepare(`INSERT INTO alliance_directory (kid, aid, abbr, name, power, rank, updated_at) VALUES ${values} ON CONFLICT(kid, aid) DO UPDATE SET abbr = excluded.abbr, name = excluded.name, power = excluded.power, rank = excluded.rank, updated_at = excluded.updated_at`)
          .bind(...rows.flatMap(r => [kid, r.aid, r.abbr, r.name, r.power, r.rank, now])),
        db.prepare("DELETE FROM alliance_directory WHERE kid = ? AND updated_at < ?").bind(kid, now)
      ]);
    }
    summary.kingdoms++; summary.alliances += rows.length; last = kid;
  }
  await setState(db, { ...state, cursor: last, lastRunAt: now, lastReason: "RUNNING", lastCheckedAt: now, startedAt: state.cursor ? state.startedAt : now }, now);
  return summary;
}

// ---- 公開ページ ----

export async function loadPublicAlliance(db, kid, aid) {
  await ensureAllianceDirectorySchema(db);
  const id = normAid(aid);
  if (!Number.isInteger(kid) || kid < 1 || !/^\d{1,20}$/.test(id)) return null;
  const [dir, ranked, peers, members] = await Promise.all([
    db.prepare("SELECT kid, aid, abbr, name, power, rank, updated_at FROM alliance_directory WHERE kid = ? AND aid = ?").bind(kid, id).first().catch(() => null),
    db.prepare("SELECT board, rank, score, abbr, name, observed_at FROM kingdom_ranking_current WHERE kid = ? AND target_type = 'ALLIANCE' AND board IN ('alliance_power','alliance_kills') AND (target_id = ? OR aid = ? OR aid = ?)").bind(kid, id, id, id + ".0").all().catch(() => ({ results: [] })),
    db.prepare("SELECT aid, abbr, name, power, rank FROM alliance_directory WHERE kid = ? ORDER BY rank ASC LIMIT 20").bind(kid).all().catch(() => ({ results: [] })),
    db.prepare("SELECT rank, nick_name FROM kingdom_ranking_current WHERE kid = ? AND board = 'personal_power' AND target_type = 'PLAYER' AND (aid = ? OR aid = ?) ORDER BY rank ASC LIMIT 100").bind(kid, id, id + ".0").all().catch(() => ({ results: [] }))
  ]);
  const byBoard = Object.fromEntries((ranked?.results || []).map(r => [r.board, r]));
  const power = byBoard.alliance_power, kills = byBoard.alliance_kills;
  if (!dir && !power) return null;
  const memberRows = members?.results || [];
  return {
    kid, aid: id,
    abbr: power?.abbr || dir?.abbr || null,
    name: power?.name || dir?.name || null,
    power: power?.score ?? dir?.power ?? null,
    powerRank: power?.rank ?? dir?.rank ?? null,
    killsRank: kills?.rank ?? null,
    kills: kills?.score ?? null,
    updatedAt: Math.max(Number(power?.observed_at || 0), Number(dir?.updated_at || 0)) || null,
    inTop100: memberRows.length,
    // 名前を出すのは王国の上位10人に入っている人だけ
    topMembers: memberRows.filter(m => Number(m.rank) <= 10).map(m => ({ rank: Number(m.rank), name: String(m.nick_name || "") })),
    hasMemberData: memberRows.length > 0,
    peers: (peers?.results || []).filter(p => normAid(p.aid) !== id).slice(0, 12)
  };
}

export function allianceLabel(a) { return (a?.name || a?.abbr || "同盟") + (a?.abbr && a?.name ? `［${a.abbr}］` : ""); }

export function renderPublicAlliancePage(a, { origin = "", signedIn = false, shell }) {
  const canonical = `${origin}/a/${a.kid}/${a.aid}`;
  const label = allianceLabel(a);
  const title = `${label}の戦力・ランキング（王国${a.kid}）｜キングショット | EagleEye`;
  const description = `キングショット（KingShot）王国${a.kid}の同盟「${label}」。同盟戦力${compactNumber(a.power)}${a.powerRank ? "（王国内" + a.powerRank + "位）" : ""}${a.inTop100 ? "、王国の戦力TOP100にメンバー" + a.inTop100 + "人" : ""}。`;
  const stat = (k, v) => `<div class="stat"><small>${esc(k)}</small><b>${esc(v)}</b></div>`;
  const members = a.hasMemberData
    ? `<h2>メンバー</h2><div class="stats">${stat("王国の戦力TOP100に入っている人", a.inTop100 + "人")}</div>${a.topMembers.length ? `<p class="lead">王国の戦力上位10人のうち、この同盟のメンバー：</p><div class="list">${a.topMembers.map(m => `<div class="row"><b>${esc(m.rank)}</b><span>${esc(m.name || "-")}</span><em></em></div>`).join("")}</div>` : ""}`
    : "";
  const peers = a.peers.length ? `<h2>王国${esc(a.kid)}のほかの同盟</h2><div class="related"><div class="rel-group">${a.peers.map(p => `<a href="/a/${encodeURIComponent(a.kid)}/${encodeURIComponent(normAid(p.aid))}">${esc(p.abbr || p.name || "同盟")}<em>${p.rank ? esc(p.rank) + "位・" : ""}${esc(compactNumber(p.power))}</em></a>`).join("")}</div></div>` : "";
  const more = signedIn ? `/alliance?kid=${encodeURIComponent(a.kid)}&tag=${encodeURIComponent(a.abbr || a.aid)}` : `/login?next=${encodeURIComponent(`/alliance?kid=${a.kid}&tag=${a.abbr || a.aid}`)}`;
  const body = `<nav class="crumbs"><a href="/">EagleEye</a> › <a href="/kingdoms">王国一覧</a> › <a href="/k/${esc(a.kid)}">王国 ${esc(a.kid)}</a> › ${esc(a.abbr || a.name || "同盟")}</nav>
<h1>${esc(label)}</h1>
<p class="lead">KingShot 王国${esc(a.kid)}の同盟。${a.updatedAt ? new Date(a.updatedAt * 1000).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" }) + " 時点。" : ""}</p>
<div class="stats">${stat("同盟戦力", compactNumber(a.power))}${stat("戦力の王国内順位", a.powerRank ? a.powerRank + "位" : "—")}${a.killsRank ? stat("撃破の王国内順位", a.killsRank + "位") : ""}${a.kills != null ? stat("撃破数", compactNumber(a.kills)) : ""}</div>
${members}
<div class="cta"><h2>メンバー全員と推移を見る</h2><p>名簿・役職・メンバーごとの戦力の推移は、ログインすると見られます（無料）。</p><a href="${esc(more)}">${signedIn ? "同盟の詳細を開く →" : "Discordでログインして見る →"}</a></div>
${peers}
<p><a href="/k/${esc(a.kid)}">王国${esc(a.kid)}のページへ →</a></p>
<p class="note">データ提供：MightPulse。ゲーム内の公開ランキングをもとに集計しています。KingShotの公式サイトではありません。</p>`;
  const jsonLd = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "EagleEye", item: origin + "/" },
    { "@type": "ListItem", position: 2, name: "王国 " + a.kid, item: origin + "/k/" + a.kid },
    { "@type": "ListItem", position: 3, name: label, item: canonical }
  ] };
  return shell({ title, description, canonical, body, jsonLd, origin });
}

// サイトマップ：各王国の上位10同盟だけ（索引 rank,kid,aid だけで読む）。
export async function loadAllianceSitemapPaths(db) {
  await ensureAllianceDirectorySchema(db);
  const rows = await db.prepare("SELECT kid, aid FROM alliance_directory WHERE rank <= ? ORDER BY kid, rank LIMIT 45000").bind(ALLIANCE_SITEMAP_TOP).all().catch(() => ({ results: [] }));
  return (rows?.results || []).map(r => `/a/${r.kid}/${normAid(r.aid)}`);
}
