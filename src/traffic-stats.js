import { renderFunnelCard } from "./funnel.js";
// オーナー用「アクセス状況」。
// - ログインユーザー：1人1日1行だけ D1 に記録（同じ isolate 内はメモで2回目以降を書かない）。90日で削除。
// - 全訪問者：Cloudflare の集計（GraphQL Analytics API）から読む。D1 には何も書かない。
//   CF_ANALYTICS_TOKEN（シークレット、Analytics:Read）と CF_ZONE_ID があるときだけ表示。
//   Web Analytics（ブラウザ計測）は CF_ACCOUNT_ID もあれば表示。トークンは画面・ログに出さない。

const RETENTION_DAYS = 90;
const memo = new Set();
let memoDay = "";
let schemaReady = null;

export function jstDay(ms = Date.now()) {
  return new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

async function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = db.prepare("CREATE TABLE IF NOT EXISTS user_daily_active (day TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT, PRIMARY KEY (day, user_id))").run()
      .catch(error => { schemaReady = null; throw error; });
  }
  return schemaReady;
}

// 戻り値：D1に書いたら true（テスト用）。失敗してもログインを止めない。
export async function recordDailyActive(db, user, { nowMs = Date.now() } = {}) {
  if (!db || !user?.user_id || user.status !== "ACTIVE") return false;
  const day = jstDay(nowMs);
  if (day !== memoDay) { memo.clear(); memoDay = day; }
  const key = day + ":" + user.user_id;
  if (memo.has(key)) return false;
  memo.add(key);
  try {
    await ensureSchema(db);
    await db.prepare("INSERT OR IGNORE INTO user_daily_active (day, user_id, role) VALUES (?, ?, ?)").bind(day, String(user.user_id), user.role || null).run();
    if (memo.size === 1) {
      const cutoff = jstDay(nowMs - RETENTION_DAYS * 86400 * 1000);
      await db.prepare("DELETE FROM user_daily_active WHERE day < ?").bind(cutoff).run();
    }
    return true;
  } catch (error) {
    memo.delete(key);
    console.warn("daily_active_record_failed", error?.message || error);
    return false;
  }
}

export async function loadDailyActive(db, { days = 14, nowMs = Date.now() } = {}) {
  await ensureSchema(db);
  const since = jstDay(nowMs - (days - 1) * 86400 * 1000);
  const rows = await db.prepare("SELECT day, role, COUNT(*) AS n FROM user_daily_active WHERE day >= ? GROUP BY day, role ORDER BY day DESC").bind(since).all();
  const byDay = new Map();
  for (const r of rows?.results || []) {
    const d = byDay.get(r.day) || { day: r.day, total: 0, roles: {} };
    d.roles[r.role || "BASIC"] = (d.roles[r.role || "BASIC"] || 0) + Number(r.n);
    d.total += Number(r.n);
    byDay.set(r.day, d);
  }
  const out = [];
  for (let i = 0; i < days; i++) {
    const day = jstDay(nowMs - i * 86400 * 1000);
    out.push(byDay.get(day) || { day, total: 0, roles: {} });
  }
  return out;
}

async function cfGraphql(token, query, variables, fetchImpl) {
  const res = await fetchImpl("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + token },
    body: JSON.stringify({ query, variables })
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || (body.errors && body.errors.length)) {
    const message = body?.errors?.[0]?.message || ("HTTP " + res.status);
    throw new Error(String(message).slice(0, 200));
  }
  return body.data;
}

// Cloudflare の日付は UTC。日本時間とは9時間ずれる点を画面に注記する。
export async function loadCloudflareTraffic(env, { days = 14, nowMs = Date.now(), fetchImpl = fetch } = {}) {
  const token = env?.CF_ANALYTICS_TOKEN;
  const zoneTag = env?.CF_ZONE_ID;
  if (!token || !zoneTag) return { configured: false };
  const until = new Date(nowMs).toISOString().slice(0, 10);
  const since = new Date(nowMs - (days - 1) * 86400 * 1000).toISOString().slice(0, 10);
  const result = { configured: true, zone: null, rum: null, zoneError: null, rumError: null };
  try {
    const data = await cfGraphql(token,
      "query($zoneTag:string,$since:Date,$until:Date){viewer{zones(filter:{zoneTag:$zoneTag}){httpRequests1dGroups(limit:31,orderBy:[date_DESC],filter:{date_geq:$since,date_leq:$until}){dimensions{date} sum{requests pageViews} uniq{uniques}}}}}",
      { zoneTag, since, until }, fetchImpl);
    result.zone = (data?.viewer?.zones?.[0]?.httpRequests1dGroups || []).map(g => ({
      date: g.dimensions?.date, uniques: g.uniq?.uniques ?? null, pageViews: g.sum?.pageViews ?? null, requests: g.sum?.requests ?? null
    }));
  } catch (error) { result.zoneError = error.message; }
  if (env.CF_ACCOUNT_ID) {
    try {
      const host = String(env.PUBLIC_ORIGIN || "https://eagleeye-ks.com").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      const data = await cfGraphql(token,
        "query($accountTag:string,$since:Date,$until:Date,$host:string){viewer{accounts(filter:{accountTag:$accountTag}){rumPageloadEventsAdaptiveGroups(limit:31,orderBy:[date_DESC],filter:{date_geq:$since,date_leq:$until,requestHost:$host}){dimensions{date} count sum{visits}}}}}",
        { accountTag: env.CF_ACCOUNT_ID, since, until, host }, fetchImpl);
      result.rum = (data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups || []).map(g => ({
        date: g.dimensions?.date, visits: g.sum?.visits ?? null, pageViews: g.count ?? null
      }));
    } catch (error) { result.rumError = error.message; }
  }
  return result;
}

// 直近24時間で多いアクセス（ページ・ボット名・回線事業者）。「人のPVは数百なのにHTMLが1日数十万回」の正体を調べる用。
// オーナー画面を開いたときだけ、Cloudflareの集計APIを3回呼ぶ（D1は読まない）。IPアドレスは出さない。
export const TOP_TRAFFIC_GROUPS = Object.freeze([
  { key: "paths", title: "多く読まれたパス", dims: "clientRequestPath edgeResponseContentTypeName", label: d => (d.clientRequestPath || "/") + (d.edgeResponseContentTypeName ? "（" + d.edgeResponseContentTypeName + "）" : "") },
  { key: "agents", title: "多いユーザーエージェント（ボットの名前）", dims: "userAgent", label: d => d.userAgent || "（なし）" },
  { key: "asns", title: "多い回線事業者（ASN）", dims: "clientAsn clientASNDescription", label: d => (d.clientASNDescription || "不明") + (d.clientAsn ? "（AS" + d.clientAsn + "）" : "") }
]);

export async function loadCloudflareTopTraffic(env, { nowMs = Date.now(), fetchImpl = fetch, limit = 12 } = {}) {
  const token = env?.CF_ANALYTICS_TOKEN, zoneTag = env?.CF_ZONE_ID;
  if (!token || !zoneTag) return { configured: false };
  const until = new Date(nowMs).toISOString();
  const since = new Date(nowMs - 24 * 3600 * 1000 + 60000).toISOString();
  const out = { configured: true, since, until, groups: {} };
  await Promise.all(TOP_TRAFFIC_GROUPS.map(async g => {
    try {
      const data = await cfGraphql(token,
        `query($zoneTag:string,$since:Time,$until:Time){viewer{zones(filter:{zoneTag:$zoneTag}){httpRequestsAdaptiveGroups(limit:${Number(limit) | 0},orderBy:[count_DESC],filter:{datetime_geq:$since,datetime_lt:$until,requestSource:"eyeball"}){count dimensions{${g.dims}}}}}}`,
        { zoneTag, since, until }, fetchImpl);
      const rows = data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
      out.groups[g.key] = { rows: rows.map(r => ({ label: String(g.label(r.dimensions || {})).slice(0, 160), count: Number(r.count) || 0 })) };
    } catch (error) {
      out.groups[g.key] = { error: error.message };
    }
  }));
  return out;
}

export function renderTopTrafficCard(top) {
  if (!top || !top.configured) return "";
  const total = Math.max(1, ...Object.values(top.groups).flatMap(g => (g.rows || []).map(r => r.count)));
  const section = g => {
    const res = top.groups[g.key] || {};
    if (res.error) return `<h3>${esc(g.title)}</h3><p class="err">取得できませんでした（${esc(res.error)}）</p>`;
    if (!res.rows?.length) return `<h3>${esc(g.title)}</h3><p class="muted">データがありません。</p>`;
    return `<h3>${esc(g.title)}</h3><table><thead><tr><th>${g.key === "paths" ? "パス（種類）" : g.key === "agents" ? "ユーザーエージェント" : "回線事業者"}</th><th>回数</th></tr></thead><tbody>${res.rows.map(r => `<tr><td style="word-break:break-all">${esc(r.label)}</td><td>${num(r.count)}</td></tr>`).join("")}</tbody></table>`;
  };
  return `<div class="card"><h2>直近24時間で多いアクセス（Cloudflareの集計）</h2>${TOP_TRAFFIC_GROUPS.map(section).join("")}<p class="muted">ボットも含めた全部のアクセスです。数字はCloudflareのサンプリングによる推計値です。IPアドレスは表示しません。</p></div>`;
}

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = v => v === null || v === undefined ? "—" : Number(v).toLocaleString("ja-JP");
function renderD1Card(d1) {
  if (!d1) return `<div class="card"><h2>D1の読み取り（今日）</h2><p class="muted">まだ確認していません（1時間ごとに自動確認）。</p></div>`;
  const over = d1.rowsRead != null && d1.rowsRead > d1.threshold;
  const pct = d1.rowsRead != null && d1.threshold ? Math.min(100, Math.round(d1.rowsRead / d1.threshold * 100)) : 0;
  const when = d1.checkedAt ? new Date(d1.checkedAt * 1000).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "—";
  return `<div class="card"><h2>D1の読み取り（今日 ${esc(d1.day || "")} UTC）</h2>${d1.error ? `<p class="err">取得できませんでした（${esc(d1.error)}）</p>` : `<div class="bar"><span>${pct}%</span><i style="width:${pct}%;${over ? "background:#f87171" : ""}"></i><b>${num(d1.rowsRead)}</b></div><p class="${over ? "err" : "muted"}">目安 ${num(d1.threshold)}行／日${over ? " を超えています（オーナーへDM済み）" : ""}。確認 ${esc(when)}</p>`}<p class="muted">1時間ごとに自動確認し、目安を超えた日はオーナーへDiscordでお知らせします。</p></div>`;
}

// APIキー（MightPulse）の混み具合。1時間ごとの確認結果を表示する。
export function renderApiPoolCard(p) {
  if (!p) return `<div class="card"><h2>APIキーの使用（直近24時間）</h2><p class="muted">まだ確認していません（1時間ごとに自動確認）。</p></div>`;
  const pct = p.quota > 0 ? Math.min(100, Math.round(p.used / p.quota * 100)) : 0;
  const over = pct > 50;
  const when = p.checkedAt ? new Date(p.checkedAt * 1000).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "—";
  const pr = p.pressure || {};
  return `<div class="card"><h2>APIキーの使用（直近24時間）</h2><div class="bar"><span>${pct}%</span><i style="width:${pct}%;${over ? "background:#ef4444" : ""}"></i><b>${num(p.used)} / ${num(p.quota)}回</b></div>
<p class="muted">使えるキー ${num(p.keys)}本（提供者 ${num(p.contributors)}人）。裏の収集はユーザー操作のために常に${num(p.reserve)}本を空けています。</p>
<table><tbody><tr><th>今日（UTC）ユーザー操作でキーが取れなかった回数</th><td>${num(pr.interactive_no_key || 0)}</td></tr><tr><th>今日（UTC）裏の収集が空き待ちで見送った回数</th><td>${num(pr.background_yielded || 0)}</td></tr></tbody></table>
<p class="muted">50%を超えるとDiscordのDMでお知らせします（1日1回）。確認：${esc(when)}</p></div>`;
}

const ROLES = ["OWNER", "ADMIN", "VIP", "ADVANCED", "BASIC"];

function bars(rows, key) {
  const max = Math.max(1, ...rows.map(r => Number(r[key]) || 0));
  return rows.map(r => `<div class="bar"><span>${esc(String(r.day || r.date).slice(5))}</span><i style="width:${Math.round((Number(r[key]) || 0) / max * 100)}%"></i><b>${num(r[key])}</b></div>`).join("");
}

export function renderOwnerTrafficPage({ active = [], cf = { configured: false }, d1 = null, apiPool = null, funnel = undefined, top = null } = {}) {
  const activeRows = active.map(d => ({ ...d, roleText: ROLES.filter(r => d.roles[r]).map(r => r + " " + d.roles[r]).join("・") }));
  const activeHtml = `<div class="bars">${bars(activeRows, "total")}</div><table><thead><tr><th>日付（日本時間）</th><th>人数</th><th>ロール内訳</th></tr></thead><tbody>${activeRows.map(d => `<tr><td>${esc(d.day)}</td><td>${num(d.total)}</td><td>${esc(d.roleText || "—")}</td></tr>`).join("")}</tbody></table>`;
  let cfHtml;
  if (!cf.configured) {
    cfHtml = `<p class="muted">Cloudflareの集計を表示するには、Workerの設定に <code>CF_ANALYTICS_TOKEN</code>（シークレット）と <code>CF_ZONE_ID</code> を追加してください。Web Analyticsの数字も出す場合は <code>CF_ACCOUNT_ID</code> も追加します。</p>`;
  } else {
    const rum = cf.rum ? `<h3>実際の訪問（Web Analytics・ブラウザで開いた人）</h3><div class="bars">${bars(cf.rum, "visits")}</div><table><thead><tr><th>日付（UTC）</th><th>訪問</th><th>ページビュー</th></tr></thead><tbody>${cf.rum.map(r => `<tr><td>${esc(r.date)}</td><td>${num(r.visits)}</td><td>${num(r.pageViews)}</td></tr>`).join("")}</tbody></table>`
      : cf.rumError ? `<p class="err">Web Analytics：取得できませんでした（${esc(cf.rumError)}）</p>` : "";
    const zone = cf.zone ? `<h3>サイト全体へのアクセス（ボット含む）</h3><div class="bars">${bars(cf.zone, "uniques")}</div><table><thead><tr><th>日付（UTC）</th><th>ユニーク訪問者</th><th>ページビュー</th><th>リクエスト</th></tr></thead><tbody>${cf.zone.map(r => `<tr><td>${esc(r.date)}</td><td>${num(r.uniques)}</td><td>${num(r.pageViews)}</td><td>${num(r.requests)}</td></tr>`).join("")}</tbody></table>`
      : cf.zoneError ? `<p class="err">サイト全体：取得できませんでした（${esc(cf.zoneError)}）</p>` : "";
    cfHtml = rum + zone + `<p class="muted">Cloudflareの日付はUTC（日本時間の朝9時で日付が変わる）です。</p>`;
  }
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>アクセス状況 | EagleEye</title>
<style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0f172a;color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:900px;margin:auto;padding:24px 16px 96px}a{color:#38bdf8}.card{background:#111c33;border:1px solid #1e2b47;border-radius:16px;padding:16px;margin:14px 0}h1{font-size:22px;margin:8px 0}h2{font-size:17px;margin:0 0 10px}h3{font-size:14px;margin:16px 0 8px;color:#cbd5e1}.bars{display:grid;gap:4px;margin:6px 0 12px}.bar{display:grid;grid-template-columns:3.2em 1fr 4em;gap:8px;align-items:center;font-size:12px}.bar i{display:block;height:10px;border-radius:5px;background:linear-gradient(90deg,#0ea5e9,#22d3ee);min-width:2px}.bar b{text-align:right;font-weight:700}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:6px 4px;border-bottom:1px solid #1e2b47;text-align:left}td:nth-child(n+2),th:nth-child(n+2){text-align:right}td:last-child{text-align:right}.muted{color:#94a3b8;font-size:12px;line-height:1.6}.err{color:#fca5a5;font-size:12px}code{background:#0b1222;padding:1px 4px;border-radius:4px}</style></head>
<body><main class="wrap"><a href="/owner">← OWNER管理</a><h1>アクセス状況</h1>
${funnel === undefined ? "" : renderFunnelCard(funnel)}${renderD1Card(d1)}${renderApiPoolCard(apiPool)}<div class="card"><h2>ログインして使った人（1日あたり）</h2>${activeHtml}<p class="muted">1人1日1回だけ数えます。記録は90日で消えます。</p></div>
<div class="card"><h2>訪問者（Cloudflareの集計）</h2>${cfHtml}</div>${renderTopTrafficCard(top)}</main></body></html>`;
}
