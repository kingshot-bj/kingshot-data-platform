// 成長の計測（オーナー用）。
// ・ページビュー（PV）：ブラウザでページを開いたとき1回だけ /api/pv に送る（JSが動くブラウザだけ＝ボットの多くは数えない）。
// ・訪問者・セッション・再訪：ブラウザの localStorage に「最後に来た日・週・月」を残し、初回だけ印を付けて送る。
//   サーバーは個人を区別するIDを保存しない。日ごとの回数だけを traffic_daily に足す。
// ・D1の負担：1回のPVで1文（多くて数行の書き込み）。読み取りはオーナー画面を開いたときだけ。
// ・ログインユーザーの DAU/WAU/MAU・継続率は既存の user_daily_active から計算する（追加の書き込みなし）。
// ・収益の試算は「仮定のRPM」と「オーナーが入力した実際の収益から出したRPM」を分けて表示する。

const RETENTION_DAYS = 400;
const jstDay = ms => new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = n => Number(n || 0).toLocaleString("ja-JP");
const fixed = (n, d = 1) => Number.isFinite(n) ? n.toFixed(d) : "—";
const pct = (a, b) => b > 0 ? Math.round(a / b * 1000) / 10 + "%" : "—";

export const GOAL_YEN = 100000;
export const ASSUMED_RPMS = Object.freeze([100, 200, 300]);

// ページの種類（ここにないものは other）。広告を出さない画面（オーナー・管理・ログイン）は revenue: false。
export const ROUTE_GROUPS = Object.freeze([
  { key: "home", label: "ホーム", match: p => p === "/" },
  { key: "my_player", label: "自分の領主", match: p => p.startsWith("/my-player") },
  { key: "watchlist", label: "ウォッチリスト", match: p => p.startsWith("/watchlist") || p.startsWith("/player-watchlist") || p.startsWith("/kingdom-watchlist") },
  { key: "players", label: "プレイヤー", match: p => p.startsWith("/players") || p.startsWith("/player") || p.startsWith("/compare") },
  { key: "kvk", label: "KvK", match: p => p.startsWith("/kvk") },
  { key: "kingdom", label: "王国", match: p => p.startsWith("/kingdom") || p.startsWith("/alliance") || p.startsWith("/k/") || p.startsWith("/a/") },
  { key: "hero", label: "英雄", match: p => p.startsWith("/hero") },
  { key: "tools", label: "計算ツール", match: p => p.startsWith("/tools") || p.startsWith("/gold") },
  { key: "news", label: "お知らせ", match: p => p.startsWith("/news") },
  { key: "milestones", label: "マイルストーン", match: p => p.startsWith("/milestones") || p.startsWith("/invite") },
  { key: "settings", label: "設定", match: p => p.startsWith("/settings") || p.startsWith("/account") },
  { key: "guide", label: "使い方・規約", match: p => p.startsWith("/guide") || p.startsWith("/help") || p.startsWith("/privacy") || p.startsWith("/terms") || p.startsWith("/about") || p.startsWith("/support") || p.startsWith("/status") },
  { key: "login", label: "ログイン", revenue: false, match: p => p.startsWith("/login") || p.startsWith("/auth") },
  { key: "staff", label: "オーナー・管理", revenue: false, match: p => p.startsWith("/owner") || p.startsWith("/admin") }
]);
const GROUP_KEYS = new Set([...ROUTE_GROUPS.map(g => g.key), "other"]);
const NO_REVENUE = new Set(ROUTE_GROUPS.filter(g => g.revenue === false).map(g => g.key));

export function routeGroupOf(path) {
  const p = String(path || "/").split("?")[0].toLowerCase();
  return ROUTE_GROUPS.find(g => g.match(p))?.key || "other";
}

// 来た元（新しいセッションの始まりだけ数える）。保存するのは分類の名前だけで、URLやホスト名は保存しない。
export const TRAFFIC_SOURCES = Object.freeze([
  { key: "search", label: "検索（Google・Yahoo!・Bingなど）" },
  { key: "x", label: "X（Twitter）" },
  { key: "discord", label: "Discord" },
  { key: "line", label: "LINE" },
  { key: "youtube", label: "YouTube" },
  { key: "reddit", label: "Reddit" },
  { key: "tiktok", label: "TikTok" },
  { key: "instagram", label: "Instagram" },
  { key: "social", label: "そのほかのSNS" },
  { key: "ai", label: "AI（ChatGPTなど）" },
  { key: "site", label: "ほかのサイト" },
  { key: "tagged", label: "告知リンク（?ref= 付き）" },
  { key: "direct", label: "直接・ブックマーク・アプリ" }
]);
const SOURCE_KEYS = new Set(TRAFFIC_SOURCES.map(x => x.key));
const HOST_RULES = [
  ["ai", /(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com)$/],
  ["search", /(^|\.)(google\.[a-z.]+|bing\.com|yahoo\.co\.jp|yahoo\.com|duckduckgo\.com|baidu\.com|naver\.com|yandex\.[a-z.]+|ecosia\.org|smartnews\.com)$/],
  ["x", /(^|\.)(t\.co|x\.com|twitter\.com)$/],
  ["discord", /(^|\.)(discord\.com|discordapp\.com|discord\.gg)$/],
  ["line", /(^|\.)(line\.me|line-apps\.com)$/],
  ["youtube", /(^|\.)(youtube\.com|youtu\.be)$/],
  ["reddit", /(^|\.)reddit\.com$/],
  ["tiktok", /(^|\.)tiktok\.com$/],
  ["instagram", /(^|\.)instagram\.com$/],
  ["social", /(^|\.)(facebook\.com|threads\.net|bsky\.app|note\.com|5ch\.net)$/]
];
// ?ref=discord のような告知リンクの印（決まった名前だけ受け付ける。ほかは「告知リンク」にまとめる）。
export const TAG_TO_SOURCE = { discord: "discord", x: "x", twitter: "x", line: "line", youtube: "youtube", yt: "youtube", reddit: "reddit", tiktok: "tiktok", tt: "tiktok", instagram: "instagram", ig: "instagram" };
// SNSから来た人の新規登録を数えるための印（Cookie）。SNSの ?ref= で来たときだけ、SNSの名前（分類名）を30日残す。
// 個人を特定する情報は入れない。新規ログインのとき funnel_daily に「new_src:SNS名」を1つ足して消す（src/funnel.js）。
export const SIGNUP_SOURCE_COOKIE = "ee_src";
export const SIGNUP_SOURCES = Object.freeze([...new Set(Object.values(TAG_TO_SOURCE))]);
export function classifyTrafficSource({ refHost = "", tag = "", selfHost = "" } = {}) {
  const t = String(tag || "").toLowerCase();
  if (t) return TAG_TO_SOURCE[t] || "tagged";
  const host = String(refHost || "").toLowerCase().replace(/^www\./, "").slice(0, 120);
  if (!host || host === String(selfHost || "").toLowerCase().replace(/^www\./, "")) return "direct";
  if (!/^[a-z0-9.-]+$/.test(host)) return "site";
  for (const [key, re] of HOST_RULES) if (re.test(host)) return key;
  return "site";
}

const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|monitor|curl|wget|python|axios|node-fetch|go-http/i;
export function isLikelyBot(ua) { return !ua || BOT_UA.test(ua); }

// 1回のPVで足す行。flags：v=今日初めて, w=今週初めて, m=今月初めて, s=新しいセッション, r=前回来た日からの日数（初回は -1）
// staff：オーナー・管理者のブラウザ（管理画面を開いたことがある）。どのページでも pv:staff だけに数える。
export function pvRows({ path, signedIn, ads, flags = {}, staff = false, source = "" }) {
  const auth = signedIn ? "in" : "out";
  const grp = staff ? "staff" : routeGroupOf(path);
  const rows = [["pv:" + grp, auth]];
  if (grp === "staff") return rows; // 管理画面は訪問者・セッションに数えない（オーナー自身の利用で膨らませない）
  if (ads) rows.push(["adpv", auth]); // 広告のスクリプトを読み込んだページ（いまは公開ページだけ）
  if (flags.s) {
    rows.push(["session", auth]);
    // 来た元と最初に開いたページの種類（どちらも決まった名前だけ）
    if (SOURCE_KEYS.has(source)) rows.push(["src:" + source, auth], ["land:" + grp, auth]);
  }
  if (flags.v) {
    rows.push(["visitor", auth]);
    const r = Number(flags.r);
    rows.push([!Number.isFinite(r) || r < 0 ? "ret:new" : r <= 1 ? "ret:1d" : r <= 7 ? "ret:7d" : r <= 30 ? "ret:30d" : "ret:old", auth]);
  }
  if (flags.w) rows.push(["visitor_w", auth]);
  if (flags.m) rows.push(["visitor_m", auth]);
  return rows;
}

let schemaReady = null;
let cleanedDay = "";
export function resetGrowthSchemaCache() { schemaReady = null; cleanedDay = ""; }
async function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = db.batch([
      db.prepare("CREATE TABLE IF NOT EXISTS traffic_daily (day TEXT NOT NULL, metric TEXT NOT NULL, auth TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, metric, auth))"),
      db.prepare("CREATE TABLE IF NOT EXISTS growth_baselines (baseline_id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL, created_at INTEGER NOT NULL, summary_json TEXT NOT NULL)"),
      db.prepare("CREATE TABLE IF NOT EXISTS growth_settings (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER NOT NULL)")
    ]).catch(error => { schemaReady = null; throw error; });
  }
  return schemaReady;
}

// 同じ isolate からの連打をはじく（IPごと1分60回まで）。
const rate = new Map();
let rateMinute = 0;
function rateLimited(ip, nowMs) {
  const minute = Math.floor(nowMs / 60000);
  if (minute !== rateMinute) { rate.clear(); rateMinute = minute; }
  const n = (rate.get(ip) || 0) + 1;
  rate.set(ip, n);
  return n > 60;
}

export async function recordPageView(db, input, { nowMs = Date.now() } = {}) {
  const rows = pvRows(input);
  const day = jstDay(nowMs);
  await ensureSchema(db);
  const values = rows.map(() => "(?, ?, ?, 1)").join(", ");
  await db.prepare(`INSERT INTO traffic_daily (day, metric, auth, n) VALUES ${values} ON CONFLICT(day, metric, auth) DO UPDATE SET n = n + 1`)
    .bind(...rows.flatMap(([metric, auth]) => [day, metric, auth])).run();
  if (cleanedDay !== day) {
    cleanedDay = day;
    await db.prepare("DELETE FROM traffic_daily WHERE day < ?").bind(jstDay(nowMs - RETENTION_DAYS * 86400 * 1000)).run().catch(() => {});
  }
  return rows.length;
}

const pvJson = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" } });

// onView(path, signedIn)：記録のついでに呼ぶ（今日の作戦）。失敗してもPVの記録は成功扱い。
export async function handlePageViewBeacon(request, env, { isSameOrigin, nowMs = Date.now(), onView = null } = {}) {
  if (request.method !== "POST") return pvJson({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!env?.DB) return pvJson({ ok: false }, 503);
  if (!isSameOrigin(request)) return pvJson({ ok: false, error: "ORIGIN_NOT_ALLOWED" }, 403);
  if (isLikelyBot(request.headers.get("user-agent"))) return pvJson({ ok: true, skipped: "bot" });
  if (Number(request.headers.get("content-length") || 0) > 2048) return pvJson({ ok: false }, 413);
  if (rateLimited(request.headers.get("cf-connecting-ip") || "-", nowMs)) return pvJson({ ok: true, skipped: "rate" });
  let body;
  try { body = await request.json(); } catch { return pvJson({ ok: false, error: "INVALID_JSON" }, 400); }
  const path = String(body?.p || "/").slice(0, 200);
  if (!path.startsWith("/") || path.startsWith("/api/")) return pvJson({ ok: false }, 400);
  const signedIn = /(?:^|;\s*)eagleeye_session=/.test(request.headers.get("cookie") || "");
  const f = body?.f && typeof body.f === "object" ? body.f : {};
  const flags = { v: f.v === 1, w: f.w === 1, m: f.m === 1, s: f.s === 1, r: Number.isFinite(Number(f.r)) ? Math.max(-1, Math.min(9999, Math.floor(Number(f.r)))) : -1 };
  try {
    const source = flags.s ? classifyTrafficSource({ refHost: typeof body?.rh === "string" ? body.rh : "", tag: typeof body?.t === "string" && /^[a-z0-9_-]{1,20}$/i.test(body.t) ? body.t : "", selfHost: new URL(request.url).hostname }) : "";
    await recordPageView(env.DB, { path, signedIn, ads: body?.a === 1, flags, staff: body?.st === 1, source }, { nowMs });
    if (onView && signedIn) await Promise.resolve(onView(path)).catch(error => console.warn("pv_on_view_failed", error?.message || error));
    return pvJson({ ok: true });
  } catch (error) {
    console.warn("pv_record_failed", error?.message || error);
    return pvJson({ ok: false }, 503);
  }
}

// ブラウザ側：1ページ1回だけ。localStorage が使えないときは訪問者の印を付けない（PVだけ数える）。
export function pageViewBeaconScript() {
  return `<script>
(function(){
  if(window.__eePv)return;window.__eePv=1;
  try{if(navigator.webdriver||document.visibilityState==="prerender")return}catch(_){}
  var st=0;try{if(/^\\/(owner|admin)(\\/|$)/.test(location.pathname))localStorage.setItem("ee_staff","1");st=localStorage.getItem("ee_staff")==="1"?1:0}catch(_){}
  var f={},now=Date.now(),j=new Date(now+324e5),day=j.toISOString().slice(0,10),mon=day.slice(0,7);
  var wk=Math.floor((now+324e5-4*864e5)/6048e5); // 月曜はじまりの週番号
  try{
    var ls=localStorage,last=ls.getItem("ee_v_day");
    if(last!==day){f.v=1;f.r=last?Math.round((Date.parse(day)-Date.parse(last))/864e5):-1;ls.setItem("ee_v_day",day)}
    if(ls.getItem("ee_v_wk")!==String(wk)){f.w=1;ls.setItem("ee_v_wk",String(wk))}
    if(ls.getItem("ee_v_mon")!==mon){f.m=1;ls.setItem("ee_v_mon",mon)}
    var la=Number(ls.getItem("ee_v_last")||0);if(!la||now-la>18e5)f.s=1;ls.setItem("ee_v_last",String(now));
  }catch(_){}
  var o={p:location.pathname.slice(0,200),a:document.querySelector('script[src*="adsbygoogle.js"]')?1:0,st:st,f:f};
  // 新しいセッションの時だけ：来た元のホスト名（URLの残りは送らない）と、告知リンクの ?ref=
  if(f.s){try{var rh=document.referrer?new URL(document.referrer).hostname:"";if(rh&&rh!==location.hostname)o.rh=rh.slice(0,120)}catch(_){}try{var q=new URLSearchParams(location.search),t=q.get("ref")||q.get("utm_source")||"";if(/^[A-Za-z0-9_-]{1,20}$/.test(t))o.t=t.toLowerCase()}catch(_){}}
  // SNSの ?ref= で来たら、SNSの名前だけを Cookie に30日残す（新規登録をSNSごとに数えるため）。
  try{var sr=${JSON.stringify(TAG_TO_SOURCE)}[String(new URLSearchParams(location.search).get("ref")||"").toLowerCase()];if(sr)document.cookie="${SIGNUP_SOURCE_COOKIE}="+sr+";max-age=2592000;path=/;samesite=lax;secure"}catch(_){}
  var body=JSON.stringify(o);
  try{if(navigator.sendBeacon&&navigator.sendBeacon("/api/pv",new Blob([body],{type:"application/json"})))return}catch(_){}
  try{fetch("/api/pv",{method:"POST",headers:{"content-type":"application/json"},body:body,keepalive:true,credentials:"same-origin"})}catch(_){}
})();
</script>`;
}

// ---- 集計（オーナー画面） ----

function sumBy(rows, pred) { return rows.reduce((a, r) => a + (pred(r) ? Number(r.n) || 0 : 0), 0); }

export function summarizeTraffic(rows, { days, nowMs }) {
  const byDay = new Map();
  for (const r of rows) { const list = byDay.get(r.day) || []; list.push(r); byDay.set(r.day, list); }
  const daily = [];
  for (let i = 0; i < days; i++) {
    const day = jstDay(nowMs - i * 86400 * 1000);
    const list = byDay.get(day) || [];
    const isPv = r => r.metric.startsWith("pv:");
    const pv = sumBy(list, r => isPv(r) && r.metric !== "pv:staff");
    daily.push({
      day,
      pv,
      pvIn: sumBy(list, r => isPv(r) && r.metric !== "pv:staff" && r.auth === "in"),
      revenuePv: sumBy(list, r => isPv(r) && !NO_REVENUE.has(r.metric.slice(3))),
      adPv: sumBy(list, r => r.metric === "adpv"),
      visitors: sumBy(list, r => r.metric === "visitor"),
      sessions: sumBy(list, r => r.metric === "session"),
      weekly: sumBy(list, r => r.metric === "visitor_w"),
      monthly: sumBy(list, r => r.metric === "visitor_m"),
      retNew: sumBy(list, r => r.metric === "ret:new"),
      ret1: sumBy(list, r => r.metric === "ret:1d"),
      ret7: sumBy(list, r => r.metric === "ret:7d"),
      ret30: sumBy(list, r => r.metric === "ret:30d"),
      retOld: sumBy(list, r => r.metric === "ret:old")
    });
  }
  const groups = {};
  for (const r of rows) {
    if (!r.metric.startsWith("pv:")) continue;
    const g = r.metric.slice(3);
    const k = GROUP_KEYS.has(g) ? g : "other";
    groups[k] = groups[k] || { in: 0, out: 0 };
    groups[k][r.auth === "in" ? "in" : "out"] += Number(r.n) || 0;
  }
  const firstDay = rows.reduce((a, r) => r.metric.startsWith("pv:") && (!a || r.day < a) ? r.day : a, null);
  // 来た元・最初に開いたページ（新しいセッションの数）。直近7日（今日を含む）と全期間。
  const since7 = jstDay(nowMs - 6 * 86400 * 1000);
  const tally = prefix => {
    const all = {}, last7 = {};
    for (const r of rows) {
      if (!r.metric.startsWith(prefix)) continue;
      const k = r.metric.slice(prefix.length), n = Number(r.n) || 0;
      all[k] = (all[k] || 0) + n;
      if (r.day >= since7) last7[k] = (last7[k] || 0) + n;
    }
    return { all, last7 };
  };
  return { daily, groups, firstDay, sources: tally("src:"), landing: tally("land:") };
}

// ログインユーザーの DAU/WAU/MAU と翌日・7日後の継続（user_daily_active から）。
export function summarizeActive(rows, { nowMs }) {
  const days = new Map();
  for (const r of rows) { const s = days.get(r.day) || new Set(); s.add(String(r.user_id)); days.set(r.day, s); }
  const dayAt = i => jstDay(nowMs - i * 86400 * 1000);
  const distinct = n => { const s = new Set(); for (let i = 0; i < n; i++) for (const u of days.get(dayAt(i)) || []) s.add(u); return s.size; };
  const retention = gap => {
    let base = 0, kept = 0;
    for (let i = gap + 1; i <= gap + 7; i++) { // 結果がそろっている直近7日分のコホート
      const from = days.get(dayAt(i)), to = days.get(dayAt(i - gap));
      if (!from) continue;
      base += from.size;
      if (to) for (const u of from) if (to.has(u)) kept++;
    }
    return { base, kept, rate: base ? kept / base : null };
  };
  const dau7 = Array.from({ length: 7 }, (_, i) => days.get(dayAt(i + 1))?.size || 0);
  return {
    dauToday: days.get(dayAt(0))?.size || 0,
    dauAvg7: dau7.reduce((a, b) => a + b, 0) / 7,
    wau: distinct(7),
    mau: distinct(30),
    d1: retention(1),
    d7: retention(7)
  };
}

// 収益の試算。期間内の1日平均PV（今日を除く直近7日）から月のPVを出す。
export function simulateRevenue({ revenuePvPerDay, adPvPerDay, measured = null, rpms = ASSUMED_RPMS, goal = GOAL_YEN }) {
  const monthly = pv => pv * 30;
  const rows = rpms.map(rpm => ({
    rpm,
    nowAdOnly: Math.round(monthly(adPvPerDay) * rpm / 1000),
    allPages: Math.round(monthly(revenuePvPerDay) * rpm / 1000),
    needPvPerDay: Math.ceil(goal / rpm * 1000 / 30)
  }));
  let measuredRpm = null;
  if (measured && measured.yen > 0 && measured.adPv > 0) measuredRpm = measured.yen / measured.adPv * 1000;
  const gapRpm = measuredRpm || rpms[1];
  return {
    rows,
    measuredRpm,
    needPvPerDay: Math.ceil(goal / gapRpm * 1000 / 30),
    gapRatio: revenuePvPerDay > 0 ? Math.ceil(goal / gapRpm * 1000 / 30) / revenuePvPerDay : null,
    basis: measuredRpm ? "measured" : "assumed"
  };
}

// 登録まわりの日ごとの数（今日の成果用）。小さい表を直近8日分だけ読む（D1は4文）。
// 新規登録＝users.created_at、領主ID登録・APIキー登録（＝ADVANCEDへの最後の一歩）は「その日に初めて登録した人」の数。
// Claude の作業用アカウント（claude-agent）は数えない。
export const EVENT_KEYS = Object.freeze(["signup", "linked", "keyed"]);
export async function loadDailyEvents(db, { nowMs = Date.now(), days = 8 } = {}) {
  const sinceDay = jstDay(nowMs - (days - 1) * 86400 * 1000);
  const since = Math.floor(Date.parse(sinceDay + "T00:00:00+09:00") / 1000);
  const day = col => `date(${col} + 32400, 'unixepoch')`;
  const q = sql => db.prepare(sql).bind(since).all().then(r => r?.results || []).catch(() => []);
  const [users, links, keys, funnel] = await Promise.all([
    q(`SELECT ${day("created_at")} AS d, COUNT(*) AS n FROM users WHERE created_at >= ? AND user_id <> 'claude-agent' GROUP BY d`),
    q(`SELECT ${day("first_at")} AS d, COUNT(*) AS n FROM (SELECT user_id, MIN(created_at) AS first_at FROM user_player_links WHERE user_id <> 'claude-agent' GROUP BY user_id) WHERE first_at >= ? GROUP BY d`),
    q(`SELECT ${day("first_at")} AS d, COUNT(*) AS n FROM (SELECT contributed_by_user_id AS u, MIN(contributed_at) AS first_at FROM api_pool_keys WHERE contributed_by_user_id IS NOT NULL AND contributed_at IS NOT NULL GROUP BY u) WHERE first_at >= ? GROUP BY d`),
    db.prepare("SELECT day AS d, step, n FROM funnel_daily WHERE day >= ?").bind(sinceDay).all().then(r => r?.results || []).catch(() => [])
  ]);
  const out = {};
  for (let i = 0; i < days; i++) out[jstDay(nowMs - i * 86400 * 1000)] = { signup: 0, linked: 0, keyed: 0, funnel: {} };
  const put = (rows, key) => { for (const r of rows) if (out[r.d]) out[r.d][key] = Number(r.n) || 0; };
  put(users, "signup"); put(links, "linked"); put(keys, "keyed");
  for (const r of funnel) if (out[r.d]) out[r.d].funnel[r.step] = Number(r.n) || 0;
  return out;
}

export async function loadGrowth(db, { nowMs = Date.now(), days = 62 } = {}) {
  await ensureSchema(db);
  const since = jstDay(nowMs - (days - 1) * 86400 * 1000);
  const activeSince = jstDay(nowMs - 35 * 86400 * 1000);
  const [traffic, active, baselines, settings, events] = await Promise.all([
    db.prepare("SELECT day, metric, auth, n FROM traffic_daily WHERE day >= ?").bind(since).all(),
    db.prepare("SELECT day, user_id FROM user_daily_active WHERE day >= ?").bind(activeSince).all().catch(() => ({ results: [] })),
    db.prepare("SELECT baseline_id, label, created_at, summary_json FROM growth_baselines ORDER BY baseline_id DESC LIMIT 10").all(),
    db.prepare("SELECT key, value FROM growth_settings WHERE key IN ('revenue_measured')").all(),
    loadDailyEvents(db, { nowMs }).catch(() => ({}))
  ]);
  const t = summarizeTraffic(traffic?.results || [], { days, nowMs });
  const a = summarizeActive(active?.results || [], { nowMs });
  let measured = null;
  for (const s of settings?.results || []) if (s.key === "revenue_measured") { try { measured = JSON.parse(s.value); } catch { measured = null; } }
  return { traffic: t, active: a, measured, events: events || {}, baselines: (baselines?.results || []).map(b => ({ ...b, summary: safeParse(b.summary_json) })), nowMs };
}
const safeParse = s => { try { return JSON.parse(s); } catch { return null; } };

// 直近7日（今日を除く）の平均。前後比較の基準にもこれを保存する。
export function headline(growth) {
  const last7 = growth.traffic.daily.slice(1, 8);
  const avg = k => last7.reduce((a, d) => a + d[k], 0) / 7;
  const pv = avg("pv"), visitors = avg("visitors"), sessions = avg("sessions");
  const repeat = last7.reduce((a, d) => a + d.ret1 + d.ret7 + d.ret30 + d.retOld, 0);
  const allV = last7.reduce((a, d) => a + d.visitors, 0);
  const daysWithData = last7.filter(d => d.pv > 0).length;
  return {
    daysWithData,
    pvPerDay: pv,
    pvInPerDay: avg("pvIn"),
    revenuePvPerDay: avg("revenuePv"),
    adPvPerDay: avg("adPv"),
    visitorsPerDay: visitors,
    sessionsPerDay: sessions,
    pvPerVisitor: visitors ? pv / visitors : null,
    pvPerSession: sessions ? pv / sessions : null,
    revisitRate: allV ? repeat / allV : null,
    ...calendarVisitors(growth.traffic.daily, growth.traffic.firstDay),
    dauAvg7: growth.active.dauAvg7,
    wau: growth.active.wau,
    mau: growth.active.mau,
    pvPerActiveUser: growth.active.dauAvg7 ? avg("pvIn") / growth.active.dauAvg7 : null,
    d1: growth.active.d1.rate,
    d7: growth.active.d7.rate
  };
}

// 暦の週（月曜はじまり）・月ごとの訪問者。ブラウザが「その週・月で初めて」のときだけ印を付けるので、足すだけで重複しない。
export function calendarVisitors(daily, firstDay = null) {
  const today = daily[0]?.day;
  if (!today) return { weekVisitors: 0, lastWeekVisitors: 0, monthVisitors: 0, lastMonthVisitors: 0 };
  const dow = (new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7; // 月曜=0
  const sum = (from, to, key) => daily.slice(from, to).reduce((a, d) => a + d[key], 0);
  const month = today.slice(0, 7);
  const prevMonth = (() => { const [y, m] = month.split("-").map(Number); return m === 1 ? (y - 1) + "-12" : y + "-" + String(m - 1).padStart(2, "0"); })();
  return {
    weekVisitors: sum(0, dow + 1, "weekly"),
    lastWeekVisitors: daily.length >= dow + 8 && firstDay && firstDay <= daily[dow + 7].day ? sum(dow + 1, dow + 8, "weekly") : null,
    monthVisitors: daily.filter(d => d.day.startsWith(month)).reduce((a, d) => a + d.monthly, 0),
    lastMonthVisitors: firstDay && firstDay <= prevMonth + "-01" ? daily.filter(d => d.day.startsWith(prevMonth)).reduce((a, d) => a + d.monthly, 0) : null
  };
}

export async function saveBaseline(db, label, growth, nowMs = Date.now()) {
  await ensureSchema(db);
  const clean = String(label || "").replace(/[\r\n\t]/g, " ").trim().slice(0, 60) || jstDay(nowMs) + " の基準";
  const summary = headline(growth);
  await db.prepare("INSERT INTO growth_baselines (label, created_at, summary_json) VALUES (?, ?, ?)").bind(clean, Math.floor(nowMs / 1000), JSON.stringify(summary)).run();
  return { label: clean, summary };
}

export async function saveMeasuredRevenue(db, { yen, from, to, adPv }, nowMs = Date.now()) {
  await ensureSchema(db);
  const y = Math.floor(Number(yen));
  if (!Number.isFinite(y) || y < 0 || y > 1e9) throw new Error("INVALID_YEN");
  const isDay = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""));
  if (!isDay(from) || !isDay(to) || from > to) throw new Error("INVALID_RANGE");
  const value = JSON.stringify({ yen: y, from, to, adPv: Math.max(0, Math.floor(Number(adPv) || 0)) });
  await db.prepare("INSERT INTO growth_settings (key, value, updated_at) VALUES ('revenue_measured', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(value, Math.floor(nowMs / 1000)).run();
  return JSON.parse(value);
}

// 入力された期間の「広告を出したページ」のPV（実測RPM用）。期間は最大93日。
export async function adPvBetween(db, from, to) {
  await ensureSchema(db);
  const row = await db.prepare("SELECT COALESCE(SUM(n), 0) AS n FROM traffic_daily WHERE metric = 'adpv' AND day >= ? AND day <= ?").bind(from, to).first();
  return Number(row?.n) || 0;
}

// 今日の成果：今日（0時から今まで）と、昨日（1日分）・直近7日の1日平均（今日を除く）。
export function todaySummary(growth) {
  const d = growth.traffic?.daily || [], ev = growth.events || {};
  const days = d.map(x => x.day);
  const evOf = (day, k) => {
    const e = ev[day];
    if (!e) return 0;
    if (k === "loginDone") return (e.funnel.login_new || 0) + (e.funnel.login_returning || 0);
    if (k === "loginStart") return (e.funnel.login_start || 0) + (e.funnel.google_start || 0);
    if (k === "loginBack") return (e.funnel.discord_return || 0) + (e.funnel.google_return || 0);
    return e[k] || 0;
  };
  const val = (i, k) => k in (d[i] || {}) ? Number(d[i][k]) || 0 : evOf(days[i], k);
  const avg7 = k => { let sum = 0; for (let i = 1; i <= 7; i++) sum += val(i, k); return sum / 7; };
  const row = k => ({ today: val(0, k), yesterday: val(1, k), avg7: avg7(k) });
  return {
    day: days[0] || "",
    visitors: row("visitors"), pv: row("pv"), signup: row("signup"), loginDone: row("loginDone"),
    linked: row("linked"), keyed: row("keyed"),
    funnel: { start: val(0, "loginStart"), back: val(0, "loginBack"), done: val(0, "loginDone"), error: Number(ev[days[0]]?.funnel?.login_error) || 0 }
  };
}

// ---- 画面 ----

const COMPARE_KEYS = [
  ["pvPerDay", "PV／日", 0], ["visitorsPerDay", "訪問者／日", 1], ["pvPerVisitor", "PV／訪問者", 2], ["pvPerSession", "PV／セッション", 2],
  ["revisitRate", "再訪率", "%"], ["dauAvg7", "ログインDAU", 1], ["wau", "ログインWAU", 0], ["mau", "ログインMAU", 0], ["d1", "翌日も来た", "%"], ["d7", "7日後も来た", "%"]
];
const fmt = (v, d) => v == null || !Number.isFinite(v) ? "—" : d === "%" ? Math.round(v * 1000) / 10 + "%" : d === 0 ? num(Math.round(v)) : fixed(v, d);

function bars(daily, key) {
  const max = Math.max(1, ...daily.map(d => d[key]));
  return `<div class="bars">${daily.slice().reverse().map(d => `<i title="${esc(d.day)} ${num(d[key])}" style="height:${Math.max(2, Math.round(d[key] / max * 100))}%"></i>`).join("")}</div>`;
}

// 来た元と最初に開いたページの表（新しいセッションの数）。
// events：日ごとの登録まわりの数（loadDailyEvents。直近8日）。SNSごとの新規登録は funnel の「new_src:SNS名」。
export function signupsBySource(events, { days = 7 } = {}) {
  const out = {};
  for (const day of Object.keys(events || {}).sort().reverse().slice(0, days))
    for (const [step, n] of Object.entries(events[day]?.funnel || {}))
      if (step.startsWith("new_src:")) { const k = step.slice(8); out[k] = (out[k] || 0) + (Number(n) || 0); }
  return out;
}

// 表に出す短い名前（スマホで横にはみ出さないように）。元の名前は title に残す。
const SOURCE_SHORT = Object.freeze({ search: "検索", x: "X", social: "ほかのSNS", ai: "AI", site: "ほかのサイト", tagged: "告知リンク", direct: "直接・アプリ" });
export function sourcesCard(traffic, events = null) {
  const src = traffic?.sources || { all: {}, last7: {} }, land = traffic?.landing || { all: {}, last7: {} };
  const signup7 = signupsBySource(events);
  const signupCell = k => SIGNUP_SOURCES.includes(k) ? `<td>${num(signup7[k] || 0)}</td><td>${pct(signup7[k] || 0, src.last7[k] || 0)}</td>` : "<td>—</td><td>—</td>";
  const total7 = Object.values(src.last7).reduce((a, b) => a + b, 0), totalAll = Object.values(src.all).reduce((a, b) => a + b, 0);
  if (!totalAll) return `<div class="card"><h2>どこから来たか</h2><p class="muted">まだ記録がありません（新しいセッションの始まりに、来た元の分類だけを数えます）。</p></div>`;
  const srcRows = TRAFFIC_SOURCES.filter(x => src.all[x.key]).sort((a, b) => (src.last7[b.key] || 0) - (src.last7[a.key] || 0) || src.all[b.key] - src.all[a.key])
    .map(x => `<tr><td title="${esc(x.label)}">${esc(SOURCE_SHORT[x.key] || x.label)}</td><td>${num(src.last7[x.key] || 0)}</td><td>${pct(src.last7[x.key] || 0, total7)}</td><td>${num(src.all[x.key])}</td>${signupCell(x.key)}</tr>`).join("");
  const label = k => ROUTE_GROUPS.find(g => g.key === k)?.label || "その他";
  const landRows = Object.entries(land.all).sort((a, b) => (land.last7[b[0]] || 0) - (land.last7[a[0]] || 0) || b[1] - a[1])
    .map(([k, n]) => `<tr><td>${esc(label(k))}</td><td>${num(land.last7[k] || 0)}</td><td>${num(n)}</td></tr>`).join("");
  return `<div class="card"><h2>どこから来たか（新しいセッション）</h2><div style="overflow-x:auto;-webkit-overflow-scrolling:touch"><table style="min-width:100%"><thead><tr><th>来た元</th><th>7日</th><th>割合</th><th>62日</th><th title="新規登録（7日）">登録</th><th>登録率</th></tr></thead><tbody>${srcRows}</tbody></table></div>
<h2 style="margin-top:14px">最初に開いたページ</h2><table><thead><tr><th>ページ</th><th>7日</th><th>62日</th></tr></thead><tbody>${landRows}</tbody></table>
<p class="muted">告知するときは URL の後ろに <code>?ref=discord</code>・<code>?ref=x</code> などを付けると、ここで分けて数えられます。新規登録は、SNSのリンク（<code>?ref=</code>）から来て30日以内に初めてログインした人の数です（11/14〜）。登録率＝新規登録÷新しいセッション（7日）。</p></div>`;
}

export function renderGrowthPage(growth) {
  const h = headline(growth);
  const t = todaySummary(growth);
  const sim = simulateRevenue({ revenuePvPerDay: h.revenuePvPerDay, adPvPerDay: h.adPvPerDay, measured: growth.measured });
  const groups = Object.entries(growth.traffic.groups).sort((a, b) => (b[1].in + b[1].out) - (a[1].in + a[1].out));
  const groupTotal = groups.reduce((a, [, v]) => a + v.in + v.out, 0);
  const label = k => ROUTE_GROUPS.find(g => g.key === k)?.label || "その他";
  const enough = h.daysWithData >= 7;
  const base = growth.baselines[0];
  const kpi = (title, value, note = "", tag = "実測") => `<div class="kpi"><span class="tag ${tag === "実測" ? "m" : "e"}">${tag}</span><b>${value}</b><small>${esc(title)}</small>${note ? `<em>${esc(note)}</em>` : ""}</div>`;
  // 今日の大きな数字：昨日・7日平均と並べ、7日平均より多ければ↑
  const big = (title, r, note = "") => {
    const cls = r.today > r.avg7 ? "up" : "";
    return `<div class="big"><small>${esc(title)}</small><b class="${cls}">${num(r.today)}</b><em>昨日 ${num(r.yesterday)}・7日平均 ${fixed(r.avg7, 1)}${note ? "・" + esc(note) : ""}</em></div>`;
  };
  const m = growth.measured;
  const ev = growth.events || {};
  const evDay = day => ev[day] || { signup: 0, linked: 0, keyed: 0 };
  const now = new Date((growth.nowMs || Date.now()) + 9 * 3600 * 1000).toISOString().slice(11, 16);
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>成長ダッシュボード | EagleEye</title>
<style>*{box-sizing:border-box}body{margin:0;background:var(--ee-bg,#0f172a);color:var(--ee-text,#f8fafc);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:960px;margin:auto;padding:20px 16px 96px}a{color:var(--ee-cyan,#38bdf8)}
.card{background:var(--ee-panel,#111c33);border:1px solid var(--ee-border-soft,#1e2b47);border-radius:16px;padding:14px;margin:12px 0}h1{font-size:21px;margin:8px 0}h2{font-size:16px;margin:0 0 10px}h3{font-size:13px;margin:12px 0 6px;color:var(--ee-subtext,#94a3b8)}
.muted{color:var(--ee-subtext,#94a3b8);font-size:12px;line-height:1.6}.kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
.kpi{position:relative;background:var(--ee-panel-raised,#0b1428);border:1px solid var(--ee-border-soft,#1e2b47);border-radius:12px;padding:10px 10px 8px;display:flex;flex-direction:column;gap:2px}.kpi b{font-size:20px}.kpi small{font-size:12px;opacity:.85}.kpi em{font-style:normal;color:var(--ee-subtext,#94a3b8);font-size:11px}
.tag{position:absolute;top:6px;right:6px;font-size:10px;padding:1px 6px;border-radius:99px}.tag.m{background:#064e3b;color:#6ee7b7}.tag.e{background:#78350f;color:#fcd34d}
.today{border-width:2px;border-color:var(--ee-cyan,#38bdf8)}.bigs{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}.big{background:var(--ee-panel-raised,#0b1428);border:1px solid var(--ee-border-soft,#1e2b47);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:2px}.big small{font-size:12px;opacity:.85}.big b{font-size:30px;line-height:1.15}.big em{font-style:normal;color:var(--ee-subtext,#94a3b8);font-size:11px}
.flow{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:13px;margin-top:10px}.flow span{background:var(--ee-panel-raised,#0b1428);border:1px solid var(--ee-border-soft,#1e2b47);border-radius:99px;padding:4px 10px}.flow b{font-size:15px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:6px 4px;border-bottom:1px solid var(--ee-border-soft,#1e2b47);text-align:right}th:first-child,td:first-child{text-align:left}td:first-child{white-space:nowrap}
.bars{display:flex;align-items:flex-end;gap:2px;height:70px;margin:8px 0}.bars i{flex:1;background:linear-gradient(var(--ee-cyan,#f5c542),var(--ee-blue,#b7791f));border-radius:2px 2px 0 0;min-width:3px}
.warn{background:#3b2a07;border:1px solid #a16207;color:#fde68a;border-radius:10px;padding:8px 10px;font-size:13px}form{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px}input{background:var(--ee-panel-raised,#0b1428);color:inherit;border:1px solid var(--ee-border,#334155);border-radius:8px;padding:7px 8px;font-size:14px;min-width:0}button{background:var(--ee-cyan,#f5c542);color:#04202a;border:0;border-radius:8px;padding:8px 12px;font-weight:700;font-size:14px}
.scroll{overflow-x:auto}.up{color:#22c55e}.down{color:#ef4444}details.card>summary{cursor:pointer;font-weight:800;font-size:15px;list-style:none}details.card>summary::-webkit-details-marker{display:none}details.card>summary:before{content:"▸ ";color:var(--ee-subtext,#94a3b8)}details[open].card>summary:before{content:"▾ "}details.card[open]>summary{margin-bottom:10px}
.toc{display:flex;flex-wrap:wrap;gap:6px;font-size:12px;margin:6px 0 2px}.toc a{padding:3px 9px;border:1px solid var(--ee-border-soft,#1e2b47);border-radius:99px;text-decoration:none}</style></head>
<body><main class="wrap"><a href="/owner">← OWNER管理</a>・<a href="/owner/traffic">アクセス状況</a><h1>成長ダッシュボード</h1>
<nav class="toc"><a href="#today">今日</a><a href="#week">7日の平均</a><a href="#daily">日ごとの推移</a><a href="#sources">どこから来たか</a><a href="#more">収益・比較・作戦</a></nav>

<section class="card today" id="today"><h2>今日の成果（${esc(t.day.slice(5).replace("-", "/"))} 0:00〜${esc(now)}）</h2><div class="bigs">
${big("訪問者", t.visitors, "ブラウザ単位")}
${big("PV", t.pv)}
${big("新規登録", t.signup)}
${big("ログイン完了", t.loginDone, "新規＋再ログイン")}
${big("領主IDを登録", t.linked, "初めて登録した人")}
${big("APIキーを登録", t.keyed, "＝ADVANCEDへの最後の一歩")}
</div>
<div class="flow">ログイン：<span>押した <b>${num(t.funnel.start)}</b></span>→<span>画面から戻った <b>${num(t.funnel.back)}</b></span>→<span>完了 <b>${num(t.funnel.done)}</b></span>${t.funnel.error ? `<span class="down">失敗 <b>${num(t.funnel.error)}</b></span>` : ""}</div>
<p class="muted">今日の数は0時からいままでの途中経過です。7日平均より多い数字は緑。「昨日」は1日分なので、夜になるまでは今日の方が少なく見えます。</p></section>

${enough ? "" : `<p class="warn">PVの計測はまだ ${h.daysWithData}日分です。7日たまるまで平均・試算は小さく出ます。</p>`}
<section class="card" id="week"><h2>直近7日の1日平均（今日を除く）</h2>
<h3>アクセス</h3><div class="kpis">
${kpi("PV／日", num(Math.round(h.pvPerDay)), "ログイン中 " + num(Math.round(h.pvInPerDay)))}
${kpi("訪問者／日", fixed(h.visitorsPerDay), "ブラウザ単位")}
${kpi("セッション／日", fixed(h.sessionsPerDay), "30分あいたら別")}
${kpi("PV／訪問者", fixed(h.pvPerVisitor, 2))}
${kpi("再訪率", fmt(h.revisitRate, "%"), "前にも来たことがある訪問者")}
${kpi("今週の訪問者", num(h.weekVisitors), h.lastWeekVisitors == null ? "月曜から・ブラウザ単位" : "先週 " + num(h.lastWeekVisitors))}
${kpi("今月の訪問者", num(h.monthVisitors), h.lastMonthVisitors == null ? "1日から・ブラウザ単位" : "先月 " + num(h.lastMonthVisitors))}
</div>
<h3>ログインユーザー</h3><div class="kpis">
${kpi("ログインDAU", fixed(h.dauAvg7), "今日 " + num(growth.active.dauToday))}
${kpi("WAU／MAU", num(h.wau) + " / " + num(h.mau))}
${kpi("PV／ログインユーザー", fixed(h.pvPerActiveUser, 1))}
${kpi("翌日も来た", fmt(h.d1, "%"), growth.active.d1.kept + " / " + growth.active.d1.base + "人")}
${kpi("7日後も来た", fmt(h.d7, "%"), growth.active.d7.kept + " / " + growth.active.d7.base + "人")}
</div>
<p class="muted">「実測」はEagleEyeが数えた値、「試算」は仮定から計算した値です。PVは JavaScript が動くブラウザで開かれた回数（ボット・管理画面を除く）。日付は日本時間。</p></section>

<section class="card" id="daily"><h2>日ごとの推移</h2>${bars(growth.traffic.daily.slice(0, 35), "pv")}<p class="muted">棒グラフはPV（35日）。表は14日。</p><div class="scroll"><table><thead><tr><th>日付</th><th>訪問者</th><th>PV</th><th>新規登録</th><th>領主ID</th><th>APIキー</th><th>ログイン中PV</th><th>再訪</th></tr></thead><tbody>${growth.traffic.daily.slice(0, 14).map(d => { const e = evDay(d.day); return `<tr><td>${esc(d.day.slice(5))}</td><td>${num(d.visitors)}</td><td>${num(d.pv)}</td><td>${e.signup ? num(e.signup) : "—"}</td><td>${e.linked ? num(e.linked) : "—"}</td><td>${e.keyed ? num(e.keyed) : "—"}</td><td>${num(d.pvIn)}</td><td>${num(d.ret1 + d.ret7 + d.ret30 + d.retOld)}</td></tr>`; }).join("")}</tbody></table></div><p class="muted">新規登録・領主ID・APIキーは直近8日だけ数えます（それより前は「—」）。</p></section>

<div id="sources">${sourcesCard(growth.traffic, growth.events)}</div>
<details class="card"><summary>よく見られているページ（62日）</summary>${groups.length ? `<table><thead><tr><th>ページ</th><th>PV</th><th>割合</th><th>ログイン中</th></tr></thead><tbody>${groups.map(([k, v]) => `<tr><td>${esc(label(k))}</td><td>${num(v.in + v.out)}</td><td>${pct(v.in + v.out, groupTotal)}</td><td>${pct(v.in, v.in + v.out)}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">まだ記録がありません。</p>`}</details>

<div id="more"></div>
<details class="card"><summary>広告収益の試算（目標 月${num(GOAL_YEN)}円）</summary>
<p class="muted">月のPV＝直近7日の1日平均×30。RPM＝1000PVあたりの収益（仮定）。「いま」は広告を出している公開ページだけ、「ログイン後も」は審査後にログイン後のページにも出した場合（管理・ログイン画面は除く）。</p>
<div class="scroll"><table><thead><tr><th>RPM（仮定）</th><th>いま</th><th>ログイン後も</th><th>目標に必要なPV／日</th></tr></thead><tbody>${sim.rows.map(r => `<tr><td>${r.rpm}円</td><td>${num(r.nowAdOnly)}円</td><td>${num(r.allPages)}円</td><td>${num(r.needPvPerDay)}</td></tr>`).join("")}</tbody></table></div>
<div class="kpis" style="margin-top:10px">
${kpi("実測RPM", sim.measuredRpm ? fixed(sim.measuredRpm, 0) + "円" : "未入力", m ? `${m.from}〜${m.to} ${num(m.yen)}円 / 広告PV ${num(m.adPv)}` : "下で実際の収益を入力", sim.measuredRpm ? "実測" : "試算")}
${kpi("目標に必要なPV／日", num(sim.needPvPerDay), sim.basis === "measured" ? "実測RPMで計算" : "RPM 200円と仮定", "試算")}
${kpi("いまのPVとの差", sim.gapRatio ? "×" + fixed(sim.gapRatio, 0) : "—", "必要PV ÷ いまの1日PV", "試算")}
</div>
<form method="post" action="/api/owner/growth/revenue" id="rev"><input name="yen" inputmode="numeric" placeholder="実際の収益（円）" style="width:150px"><input name="from" type="date"><span>〜</span><input name="to" type="date"><button>保存</button></form>
<p class="muted">AdSenseの管理画面の「見積もり収益額」を期間ごと入力すると、同じ期間の「広告ありPV」から実測RPMを出します。広告のクリックや表示を目的にした仕組みは作りません。</p></details>
<details class="card"><summary>前後比較（基準との差）</summary>
${base ? `<p class="muted">基準「${esc(base.label)}」（${esc(jstDay(base.created_at * 1000))} 保存）と、いまの直近7日平均を並べます。差は施策の効果とは限りません（季節・イベント・告知などの影響も入ります）。</p><div class="scroll"><table><thead><tr><th>指標</th><th>基準</th><th>いま</th><th>差</th></tr></thead><tbody>${COMPARE_KEYS.map(([k, tt, d]) => { const b = base.summary?.[k], c = h[k]; const diff = b != null && c != null && Number.isFinite(b) && Number.isFinite(c) ? c - b : null; return `<tr><td>${esc(tt)}</td><td>${fmt(b, d)}</td><td>${fmt(c, d)}</td><td class="${diff > 0 ? "up" : diff < 0 ? "down" : ""}">${diff == null ? "—" : (diff > 0 ? "+" : "") + fmt(diff, d)}</td></tr>`; }).join("")}</tbody></table></div>` : `<p class="muted">まだ基準がありません。施策を出す前に保存しておくと、あとで前後を比べられます。</p>`}
<form method="post" action="/api/owner/growth/baseline" id="bl"><input name="label" maxlength="60" placeholder="名前（例：作戦リリース前）" style="flex:1"><button>いまの値を基準に保存</button></form>
${growth.baselines.length > 1 ? `<p class="muted">これまでの基準：${growth.baselines.map(b => esc(b.label)).join("・")}</p>` : ""}</details>
<details class="card"><summary>今日の作戦（14日）</summary>${(growth.missions || []).length ? `<table><thead><tr><th>日付</th><th>使った人</th><th>3つ全部達成</th><th>達成率</th></tr></thead><tbody>${growth.missions.map(x => `<tr><td>${esc(x.day.slice(5))}</td><td>${num(x.users)}</td><td>${num(x.cleared)}</td><td>${pct(x.cleared, x.users)}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">まだ記録がありません。</p>`}<p class="muted">公開前はオーナーだけが対象です。</p></details>
<script>
(function(){
  function send(form,url,pick){form.addEventListener("submit",function(e){e.preventDefault();var b=form.querySelector("button");b.disabled=true;fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(pick()),credentials:"same-origin"}).then(function(r){return r.json()}).then(function(x){if(x&&x.ok)location.reload();else{alert("保存できませんでした："+(x&&x.error||""));b.disabled=false}}).catch(function(){alert("保存できませんでした");b.disabled=false})})}
  var rev=document.getElementById("rev"),bl=document.getElementById("bl");
  send(rev,"/api/owner/growth/revenue",function(){return {yen:rev.yen.value,from:rev.from.value,to:rev.to.value}});
  send(bl,"/api/owner/growth/baseline",function(){return {label:bl.label.value}});
})();
</script></main></body></html>`;
}
