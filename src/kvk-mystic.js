// 秘境の試練 summaries for every KvK kingdom of the current season.
//
// The community compares KvK opponents by Mystic Trial stages (輝光の塔, 水晶鉱山,
// …) rather than total power. For each kingdom in the season's matchups we
// fetch all leaderboards once (GET /kingdoms/{kid}?include=boards&limit=10,
// normal keys, one call per kingdom per season) and keep only the top-10
// summary per stage in D1. A few kingdoms per Cron run; a daily cap; and a
// breaker that stops after repeated responses without Mystic boards so an
// unexpected response shape never burns API quota.

import { collectMightPulseThroughGuards } from "./data-collection-engine.js";

export const MYSTIC_STAGE_KEYS = Object.freeze(["coliseum", "forest_of_life", "crystal_cave", "knowledge_nexus", "molten_fort", "radiant_spire"]);
export const KVK_MYSTIC_PER_RUN = 2;
export const KVK_MYSTIC_DAILY_CAP = 600;
// kvk_matchups は1対戦1行（kid < opponent）なので、両側の王国を対象にする。
// 同じ対戦の2王国を続けて取り、比較がそろった組から順に出るようにする。
// EagleEye ユーザーの王国・ウォッチ中の王国がいる対戦を先に。?1 = season, ?2 = 件数。
export const KVK_MYSTIC_TODO_SQL =
  "WITH pk(kid) AS (" +
  "SELECT CAST(COALESCE(p.kid, l.kingdom_id) AS INTEGER) FROM user_player_links l LEFT JOIN players p ON p.governor_id = l.governor_id WHERE l.status = 'ACTIVE' " +
  "UNION SELECT kid FROM kingdom_watchlists WHERE enabled = 1), " +
  "sides(kid, pair, prio) AS (" +
  "SELECT m.kid, m.kid, CASE WHEN m.kid IN (SELECT kid FROM pk) OR m.opponent IN (SELECT kid FROM pk) THEN 0 ELSE 1 END FROM kvk_matchups m WHERE m.season = ?1 " +
  "UNION ALL SELECT m.opponent, m.kid, CASE WHEN m.kid IN (SELECT kid FROM pk) OR m.opponent IN (SELECT kid FROM pk) THEN 0 ELSE 1 END FROM kvk_matchups m WHERE m.season = ?1 AND m.opponent IS NOT NULL) " +
  "SELECT x.kid FROM sides x LEFT JOIN kvk_mystic_summary s ON s.season = ?1 AND s.kid = x.kid " +
  "WHERE s.kid IS NULL GROUP BY x.kid ORDER BY MIN(x.prio), MIN(x.pair), x.kid LIMIT ?2";
const BREAKER_LIMIT = 5;
// Same offsets / labels as KVK_MYSTIC_BOARDS in kvk.js (kept here to avoid a circular import).
const OFFSETS = { mystic_trial: 0, coliseum: 10000, forest_of_life: 20000, crystal_cave: 30000, knowledge_nexus: 40000, molten_fort: 50000, radiant_spire: 60000 };
const LABELS = { mystic_trial: "秘境の試練（総合）", coliseum: "闘技場", forest_of_life: "生命の森", crystal_cave: "水晶鉱山", knowledge_nexus: "知識の枢軸", molten_fort: "溶岩要塞", radiant_spire: "輝光の塔" };

let schemaReady = null;
export function resetKvkMysticSchemaCache() { schemaReady = null; }
export async function ensureKvkMysticSchema(db) {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.prepare("CREATE TABLE IF NOT EXISTS kvk_mystic_summary (season INTEGER NOT NULL, kid INTEGER NOT NULL, status TEXT NOT NULL, boards_json TEXT, fetched_at INTEGER NOT NULL, PRIMARY KEY (season, kid))").run();
      await db.prepare("CREATE TABLE IF NOT EXISTS kvk_mystic_state (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER NOT NULL)").run();
    })().catch(error => { schemaReady = null; throw error; });
  }
  return schemaReady;
}

const SLUG_ALIASES = { coliseum: ["coliseum", "colosseum", "arena"], forest_of_life: ["forest_of_life", "forest"], crystal_cave: ["crystal_cave", "crystal"], knowledge_nexus: ["knowledge_nexus", "knowledge", "nexus"], molten_fort: ["molten_fort", "molten", "lava"], radiant_spire: ["radiant_spire", "radiant", "spire"], mystic_trial: ["mystic_trial", "mystic"] };
function boardKeyOf(wrapper) {
  const text = [wrapper?.key, wrapper?.slug, wrapper?.board, wrapper?.board_key, wrapper?.name, wrapper?.label, wrapper?.type_key]
    .filter(v => typeof v === "string").map(v => v.toLowerCase().replace(/[\s-]+/g, "_")).join(" ");
  if (!text) return "";
  for (const [key, aliases] of Object.entries(SLUG_ALIASES)) if (aliases.some(a => text.includes(a))) return key;
  return "";
}
function rowsOf(wrapper) {
  for (const k of ["entries", "rows", "ranks", "rankings", "items", "list", "top", "data"]) if (Array.isArray(wrapper?.[k])) return wrapper[k];
  return [];
}

// 「最高クリアステージ」の表示用ラベル（例 "60-7"）。章ごとにステージ数が違うので数値からは作れない。
export function stageLabelOf(row) {
  for (const k of ["value_label", "score_label", "display_value", "display_score", "stage_label"]) {
    const v = row?.[k];
    if (typeof v === "string" && /^\d{1,3}\s*-\s*\d{1,3}$/.test(v.trim())) return v.trim().replace(/\s+/g, "");
  }
  return null;
}

// 数値（オフセット除去後）→「章-ステージ」。1章10ステージ（API の value_label と一致を確認：605→61-5、520→52-10）。
export function stageLabelFromValue(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 1) return null;
  return (Math.floor((n - 1) / 10) + 1) + "-" + ((n - 1) % 10 + 1);
}

// boards: { coliseum: { top10, best, count }, ... } from a kingdom ?include=boards payload.
export function summarizeKingdomBoards(payload) {
  const root = payload?.data && typeof payload.data === "object" && !Array.isArray(payload.data) ? payload.data : payload;
  let wrappers = root?.boards ?? root?.kingdom?.boards ?? root?.leaderboards ?? [];
  if (wrappers && !Array.isArray(wrappers) && typeof wrappers === "object") wrappers = Object.entries(wrappers).map(([key, v]) => (Array.isArray(v) ? { key, entries: v } : { key, ...v }));
  const out = {};
  for (const w of Array.isArray(wrappers) ? wrappers : []) {
    const key = boardKeyOf(w);
    if (!key || out[key]) continue;
    const offset = OFFSETS[key] || 0;
    const items = rowsOf(w).filter(r => r && (r.governor_id != null || r.uid != null || r.nick_name != null))
      .map(r => ({ v: Number(r.score ?? r.value) - offset, label: stageLabelOf(r) })).filter(x => Number.isFinite(x.v) && x.v >= 0).slice(0, 10);
    if (!items.length) continue;
    const values = items.map(x => x.v);
    const sorted = [...items].sort((a, b) => b.v - a.v);
    const top = sorted.map(x => x.v);
    out[key] = { top10: Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10, best: top[0], count: values.length, top };
    // ゲームと同じ「60-7」表記（API が表示用ラベルを返す時だけ）。並びは top と同じ。
    if (sorted.some(x => x.label)) out[key].labels = sorted.map(x => x.label || null);
  }
  return out;
}

// Stage-by-stage comparison: { wins, losses, even, stages: [{ key, label, a, b }] }.
// metric "best" (1位, default: rally leaders decide KvK) or "top10" (上位10人平均).
export function compareMystic(a, b, { metric = "best" } = {}) {
  const stages = [];
  let wins = 0, losses = 0, even = 0;
  for (const key of MYSTIC_STAGE_KEYS) {
    const x = a?.[key]?.[metric], y = b?.[key]?.[metric];
    if (x == null || y == null) continue;
    if (x > y) wins++; else if (x < y) losses++; else even++;
    stages.push({ key, label: LABELS[key] || key, a: x, b: y });
  }
  return { wins, losses, even, stages };
}

async function getState(db, key) { const r = await db.prepare("SELECT value FROM kvk_mystic_state WHERE key = ?").bind(key).first(); try { return JSON.parse(r?.value || "null"); } catch { return null; } }
async function setState(db, key, value, now) { await db.prepare("INSERT INTO kvk_mystic_state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(key, JSON.stringify(value), now).run(); }

export async function runKvkMysticCollection(env, { now = Math.floor(Date.now() / 1000), collect = collectMightPulseThroughGuards, perRun = KVK_MYSTIC_PER_RUN } = {}) {
  const db = env?.DB;
  if (!db) return { skipped: true, reason: "NO_DB" };
  await ensureKvkMysticSchema(db);
  const matchupState = await db.prepare("SELECT value FROM kvk_state WHERE key = 'matchups'").first().catch(() => null);
  let season = null;
  try { season = Number(JSON.parse(matchupState?.value || "null")?.season); } catch {}
  if (!Number.isFinite(season)) return { skipped: true, reason: "NO_SEASON" };
  const breaker = await getState(db, "breaker");
  if (breaker?.season === season && breaker?.open) return { skipped: true, reason: "BREAKER_OPEN", season };
  const today = await db.prepare("SELECT COUNT(*) AS n FROM kvk_mystic_summary WHERE fetched_at > ?").bind(now - 86400).first();
  if (Number(today?.n || 0) >= KVK_MYSTIC_DAILY_CAP) return { skipped: true, reason: "DAILY_CAP", season };
  // EagleEye ユーザーの王国・ウォッチ中の王国と、その対戦相手を先に取る（使われている比較から先に出す）。
  const todo = (await db.prepare(KVK_MYSTIC_TODO_SQL).bind(season, perRun).all())?.results || [];
  const summary = { season, fetched: 0, empty: 0, failed: 0 };
  let emptyStreak = Number(breaker?.season === season ? breaker.emptyStreak || 0 : 0);
  for (const { kid } of todo) {
    let status = "OK", boards = null;
    try {
      const collected = await collect(env, { path: `/kingdoms/${encodeURIComponent(kid)}`, endpoint: "/kingdoms/:kid?include=boards", targetType: "KINGDOM", targetId: String(kid), purpose: "KVK_MYSTIC_BOARDS", query: { include: "boards", limit: 10 }, timeoutMs: 15000, maxRetries: 1 });
      const payload = collected?.result?.data ?? collected?.result ?? collected;
      boards = summarizeKingdomBoards(payload);
      if (!MYSTIC_STAGE_KEYS.some(k => boards[k])) { status = "EMPTY"; summary.empty++; emptyStreak++; }
      else { summary.fetched++; emptyStreak = 0; }
    } catch (error) {
      summary.failed++;
      if (Number(error?.status) === 404) status = "NOT_FOUND";
      else { console.error("kvk_mystic_fetch_failed", kid, error?.code || error?.message || error); break; } // retry next run
    }
    await db.prepare("INSERT OR REPLACE INTO kvk_mystic_summary (season, kid, status, boards_json, fetched_at) VALUES (?, ?, ?, ?, ?)").bind(season, Number(kid), status, boards ? JSON.stringify(boards) : null, now).run();
  }
  const open = emptyStreak >= BREAKER_LIMIT;
  await setState(db, "breaker", { season, emptyStreak, open }, now);
  if (open) console.error("kvk_mystic_breaker_open", season, emptyStreak);
  return summary;
}

export async function loadMysticSummaries(db, season, kids) {
  await ensureKvkMysticSchema(db);
  const out = new Map();
  const list = [...new Set(kids.map(Number).filter(Number.isFinite))];
  for (let i = 0; i < list.length; i += 90) {
    const chunk = list.slice(i, i + 90);
    const rows = (await db.prepare(`SELECT kid, boards_json FROM kvk_mystic_summary WHERE season = ? AND status = 'OK' AND kid IN (${chunk.map(() => "?").join(",")})`).bind(season, ...chunk).all())?.results || [];
    for (const r of rows) { try { out.set(Number(r.kid), JSON.parse(r.boards_json)); } catch {} }
  }
  return out;
}
