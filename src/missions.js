// 今日の作戦（デイリー3つ・ウィークリー3つ・連続日数）。公開まではオーナーだけ（milestonesAvailableFor）。
// ・判定は「その日にEagleEyeのどの機能を使ったか」だけ。広告の表示やクリックは条件にしない。
// ・記録はPV計測（/api/pv）のついでに、ログイン中の人だけ1人1日1行（bit を OR で足す）。
//   同じ isolate では同じ日・同じ機能を2回書かない。ユーザーのDB読み取りはしない（セッションの discord_id で記録）。
// ・読むのは作戦カード・マイルストーン画面を開いたときだけ（直近70日分の1人の行）。

export const MISSION_ACTIONS = Object.freeze([
  // [キー, bit, 作戦の文, 行き先]
  { key: "my_player", bit: 1, title: "自分の領主をチェック", href: "/my-player" },
  { key: "watchlist", bit: 2, title: "ウォッチ中の変化を確認", href: "/watchlist" },
  { key: "kingdom", bit: 4, title: "王国ランキングを見る", href: "/kingdom/rankings" },
  { key: "kvk", bit: 8, title: "KvKの組み合わせを確認", href: "/kvk" },
  { key: "compare", bit: 16, title: "プレイヤーを比べる", href: "/player-watchlist" },
  { key: "player", bit: 32, title: "気になる領主を調べる", href: "/players" },
  { key: "hero", bit: 64, title: "英雄・計算ツールを使う", href: "/hero-catalog" },
  { key: "news", bit: 128, title: "お知らせを読む", href: "/news" },
  { key: "share", bit: 256, title: "画像で共有する", href: "/player-watchlist" }
]);
const BY_KEY = Object.fromEntries(MISSION_ACTIONS.map(a => [a.key, a]));
const DAILY_POOL = ["watchlist", "kingdom", "kvk", "compare", "player", "hero", "news"];

export const WEEKLY_MISSIONS = Object.freeze([
  { key: "w_days", title: "5日 EagleEyeを開く", goal: 5 },
  { key: "w_variety", title: "6種類の機能を使う", goal: 6 },
  { key: "w_share", title: "1回 画像で共有する", goal: 1 }
]);

export const jstDay = ms => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
const addDays = (day, n) => new Date(Date.parse(day + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
export function weekStart(day) { const dow = (new Date(day + "T00:00:00Z").getUTCDay() + 6) % 7; return addDays(day, -dow); }

export function missionActionForPath(path) {
  const p = String(path || "").split("?")[0].toLowerCase();
  if (p.startsWith("/my-player")) return "my_player";
  if (p.startsWith("/player/compare")) return "compare";
  if (p.startsWith("/watchlist") || p.startsWith("/player-watchlist") || p.startsWith("/kingdom-watchlist")) return "watchlist";
  if (p.startsWith("/kvk")) return "kvk";
  if (p.startsWith("/kingdom") || p.startsWith("/alliance")) return "kingdom";
  if (p === "/player" || p.startsWith("/players")) return "player";
  if (p.startsWith("/hero") || p.startsWith("/tools")) return "hero";
  if (p.startsWith("/news")) return "news";
  return null;
}

function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }

// その日の作戦3つ：1つ目は「自分の領主」（領主ID未登録なら「気になる領主を調べる」）、残り2つは人と日で決まる日替わり。
export function dailyMissionsFor(discordId, day, { linked = true } = {}) {
  const first = linked ? "my_player" : "player";
  const pool = DAILY_POOL.filter(k => k !== first);
  const picks = [];
  let seed = hash(discordId + ":" + day);
  while (picks.length < 2) { const k = pool[seed % pool.length]; if (!picks.includes(k)) picks.push(k); seed = Math.imul(seed ^ (seed >>> 13), 2654435761) >>> 0 || 1; }
  return [first, ...picks];
}

let schemaReady = null;
export function resetMissionSchemaCache() { schemaReady = null; memo.clear(); memoDay = ""; ownerCache = null; }
async function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = db.prepare("CREATE TABLE IF NOT EXISTS user_mission_daily (discord_id TEXT NOT NULL, day TEXT NOT NULL, actions INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (discord_id, day))").run()
      .catch(error => { schemaReady = null; throw error; });
  }
  return schemaReady;
}

const memo = new Map();
let memoDay = "";
// 戻り値：D1に書いたら true。
export async function recordMissionAction(db, discordId, actionKey, { nowMs = Date.now() } = {}) {
  const action = BY_KEY[actionKey];
  if (!db || !discordId || !action) return false;
  const day = jstDay(nowMs);
  if (day !== memoDay) { memo.clear(); memoDay = day; }
  const k = String(discordId);
  const have = memo.get(k) || 0;
  if (have & action.bit) return false;
  memo.set(k, have | action.bit);
  try {
    await ensureSchema(db);
    await db.prepare("INSERT INTO user_mission_daily (discord_id, day, actions) VALUES (?, ?, ?) ON CONFLICT(discord_id, day) DO UPDATE SET actions = actions | excluded.actions").bind(k, day, action.bit).run();
    return true;
  } catch (error) {
    memo.set(k, (memo.get(k) || 0) & ~action.bit);
    console.warn("mission_record_failed", error?.message || error);
    return false;
  }
}

// 公開前は「作戦の対象の人」だけ記録する。オーナーの discord_id は isolate ごとに10分おぼえる（1回の読み取り）。
let ownerCache = null;
export async function isMissionUser(db, discordId, { isPublic = false, nowMs = Date.now() } = {}) {
  if (isPublic) return Boolean(discordId);
  if (!db || !discordId) return false;
  if (!ownerCache || nowMs - ownerCache.at > 600000) {
    try {
      const rows = await db.prepare("SELECT discord_id FROM users WHERE role = 'OWNER' AND status = 'ACTIVE'").all();
      ownerCache = { at: nowMs, ids: new Set((rows?.results || []).map(r => String(r.discord_id))) };
    } catch { return false; }
  }
  return ownerCache.ids.has(String(discordId));
}

const bits = n => MISSION_ACTIONS.filter(a => n & a.bit).length;

// 連続日数：その日のデイリー3つを全部達成した日を数える。1日だけの休みは途切れない（数にも入れない）。今日が未達成なら昨日までで数える。
export function computeStreak(doneDays, today) {
  const done = new Set(doneDays);
  let day = done.has(today) ? today : addDays(today, -1);
  let streak = 0, misses = 0, restUsed = false, pendingMiss = false;
  for (let i = 0; i < 400; i++) {
    if (done.has(day)) { streak++; if (pendingMiss) restUsed = true; pendingMiss = false; misses = 0; }
    else { misses++; if (misses >= 2) break; pendingMiss = true; }
    day = addDays(day, -1);
  }
  return { streak, restUsed };
}

export function bestStreak(doneDays) {
  const sorted = [...new Set(doneDays)].sort();
  let best = 0;
  for (const d of sorted) best = Math.max(best, computeStreak(sorted.filter(x => x <= d), d).streak);
  return best;
}

export async function loadMissions(db, discordId, { nowMs = Date.now(), linked = true } = {}) {
  if (!db || !discordId) return null;
  await ensureSchema(db);
  const today = jstDay(nowMs);
  const since = addDays(today, -69);
  const rows = await db.prepare("SELECT day, actions FROM user_mission_daily WHERE discord_id = ? AND day >= ?").bind(String(discordId), since).all();
  const byDay = new Map((rows?.results || []).map(r => [String(r.day), Number(r.actions) || 0]));
  const dailyDone = day => dailyMissionsFor(discordId, day, { linked }).every(k => (byDay.get(day) || 0) & BY_KEY[k].bit);
  const todayActions = byDay.get(today) || 0;
  const daily = dailyMissionsFor(discordId, today, { linked }).map(k => ({ key: k, title: BY_KEY[k].title, href: BY_KEY[k].href, done: Boolean(todayActions & BY_KEY[k].bit) }));
  const ws = weekStart(today);
  let weekDays = 0, weekBits = 0;
  for (let d = ws; d <= today; d = addDays(d, 1)) { const a = byDay.get(d) || 0; if (a) weekDays++; weekBits |= a; }
  const weekly = WEEKLY_MISSIONS.map(w => {
    const now = w.key === "w_days" ? weekDays : w.key === "w_variety" ? bits(weekBits) : (weekBits & BY_KEY.share.bit ? 1 : 0);
    return { key: w.key, title: w.title, goal: w.goal, now: Math.min(now, w.goal), done: now >= w.goal };
  });
  const doneDays = [...byDay.keys()].filter(dailyDone);
  const { streak, restUsed } = computeStreak(doneDays, today);
  return {
    day: today,
    daily,
    dailyDone: daily.filter(m => m.done).length,
    weekly,
    weeklyDone: weekly.filter(m => m.done).length,
    weekStart: ws,
    streak,
    restUsed,
    best: Math.max(streak, bestStreak(doneDays)),
    weeklyClears: countWeeklyClears(byDay, today)
  };
}

// 直近で「週の作戦を全部達成」した週の数（今週も含む）。
function countWeeklyClears(byDay, today) {
  let clears = 0;
  for (let w = weekStart(today), i = 0; i < 10; i++, w = addDays(w, -7)) {
    let days = 0, b = 0;
    for (let d = w, j = 0; j < 7; j++, d = addDays(d, 1)) { const a = byDay.get(d) || 0; if (a) days++; b |= a; }
    if (days >= 5 && bits(b) >= 6 && (b & BY_KEY.share.bit)) clears++;
  }
  return clears;
}

// オーナー画面用：日ごとの作戦の利用（人数・3つ全部達成した人数）。
export async function loadMissionStats(db, { nowMs = Date.now(), days = 14 } = {}) {
  await ensureSchema(db);
  const today = jstDay(nowMs);
  const rows = await db.prepare("SELECT discord_id, day, actions FROM user_mission_daily WHERE day >= ?").bind(addDays(today, -(days - 1))).all();
  const out = new Map();
  for (const r of rows?.results || []) {
    const d = out.get(r.day) || { day: r.day, users: 0, cleared: 0 };
    d.users++;
    if (dailyMissionsFor(r.discord_id, r.day).every(k => Number(r.actions) & BY_KEY[k].bit) || dailyMissionsFor(r.discord_id, r.day, { linked: false }).every(k => Number(r.actions) & BY_KEY[k].bit)) d.cleared++;
    out.set(r.day, d);
  }
  return [...out.values()].sort((a, b) => b.day.localeCompare(a.day));
}
