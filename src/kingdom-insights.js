// 王国ページの「この王国の分析」。すでに D1 にある王国の集計（kingdom_stats_current）だけで計算する（MightPulse は呼ばない）。
// ・全王国の中での位置（総力・7日の伸び）と、開設時期が近い王国（±30日）の中での位置。
// ・「総力が近い王国」も同じ一覧から出す（意味が未確認の power_rank は使わない）。
// ・全王国の一覧（約2,600行）は isolate ごとと Cloudflare のキャッシュ（共有）に1時間だけ覚えておき、ページを開くたびには読まない。
// ・文章は実際の数字から組み立てる。数字が無いところは書かない（水増しの文章は作らない）。

export const INSIGHTS_CACHE_MS = 60 * 60 * 1000;

// 2026-11-17：isolate ごとに覚えるだけだと、クローラーなどでインスタンスが増えると全王国（約2,600行）を何百回も読み直していた。
// Cloudflare のキャッシュ（同じデータセンターの全インスタンスで共有）にも1時間置く。キャッシュが使えない環境では今までどおり D1 を読む。
const SHARED_CACHE_BASE = "https://eagleeye-shared-cache.internal/";
export async function sharedJsonCache(key, ttlSeconds, load, { cacheStore = globalThis.caches?.default } = {}) {
  const req = cacheStore ? new Request(SHARED_CACHE_BASE + key) : null;
  if (cacheStore) {
    const hit = await cacheStore.match(req).catch(() => null);
    if (hit) { try { return await hit.json(); } catch {} }
  }
  const value = await load();
  if (cacheStore && value != null) await cacheStore.put(req, new Response(JSON.stringify(value), { headers: { "content-type": "application/json", "cache-control": "public, max-age=" + ttlSeconds } })).catch(() => {});
  return value;
}
export const COHORT_DAYS = 30;
let cache = { at: 0, rows: null };
export function resetKingdomInsightsCache() { cache = { at: 0, rows: null }; }

export async function loadAllKingdomStats(db, nowMs = Date.now(), { cacheStore } = {}) {
  if (cache.rows && nowMs - cache.at < INSIGHTS_CACHE_MS) return cache.rows;
  const rows = await sharedJsonCache("kingdom-stats-v1", INSIGHTS_CACHE_MS / 1000, () => loadAllKingdomStatsFromDb(db), cacheStore === undefined ? {} : { cacheStore });
  cache = { at: nowMs, rows };
  return rows;
}
async function loadAllKingdomStatsFromDb(db) {
  const res = await db.prepare("SELECT kid, power, power_gain_7d, age_days, player_count, observed_at FROM kingdom_stats_current").all();
  return (res?.results || []).map(r => ({ kid: Number(r.kid), power: num(r.power), gain: num(r.power_gain_7d), age: num(r.age_days), players: num(r.player_count), at: num(r.observed_at) })).filter(r => Number.isInteger(r.kid));
}
const num = v => v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);

// 大きい方が上の順位（同じ値は同じ順位）。
function rankOf(list, value) {
  if (value == null) return null;
  let above = 0;
  for (const v of list) if (v != null && v > value) above++;
  return above + 1;
}
function median(list) {
  const v = list.filter(x => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function computeKingdomInsights(kid, rows) {
  const me = (rows || []).find(r => r.kid === Number(kid));
  if (!me || me.power == null) return null;
  const all = rows.filter(r => r.power != null);
  const out = {
    total: all.length,
    powerRank: rankOf(all.map(r => r.power), me.power),
    gainTotal: all.filter(r => r.gain != null).length,
    gainRank: rankOf(all.map(r => r.gain), me.gain),
    gain: me.gain, power: me.power, age: me.age, cohort: null, nearPower: []
  };
  if (me.age != null) {
    const peers = all.filter(r => r.age != null && Math.abs(r.age - me.age) <= COHORT_DAYS);
    if (peers.length >= 5) {
      const medPower = median(peers.map(r => r.power)), medGain = median(peers.map(r => r.gain));
      out.cohort = {
        size: peers.length, fromAge: Math.max(0, me.age - COHORT_DAYS), toAge: me.age + COHORT_DAYS,
        powerRank: rankOf(peers.map(r => r.power), me.power),
        gainRank: me.gain == null ? null : rankOf(peers.map(r => r.gain), me.gain),
        medianPower: medPower, medianGain: medGain,
        powerVsMedian: medPower ? me.power / medPower - 1 : null
      };
    }
  }
  // 総力が近い王国：自分の上と下から3つずつ。
  const sorted = all.slice().sort((a, b) => b.power - a.power || a.kid - b.kid);
  const i = sorted.findIndex(r => r.kid === me.kid);
  out.nearPower = [...sorted.slice(Math.max(0, i - 3), i), ...sorted.slice(i + 1, i + 4)].map(r => ({ kid: r.kid, power: r.power }));
  return out;
}

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = v => Number(v).toLocaleString("ja-JP");
// 順位の割合。下位の王国に「上位100%」と出さないよう、半分より下は「下位N%」で書く（最下位は下位1%）。
export function rankPercentText(rank, total) {
  rank = Number(rank); total = Number(total);
  if (!total || !rank) return "";
  if (rank / total <= 0.5) return `上位${Math.max(1, Math.ceil(rank / total * 100))}%`;
  return `下位${Math.max(1, Math.ceil((total - rank + 1) / total * 100))}%`;
}

// 表示用：数字がある項目だけ。compact は数字を 1.2B のように短くする関数（王国ページと同じもの）。
export function renderKingdomInsights(kid, ins, compact) {
  if (!ins) return "";
  const items = [];
  items.push(`総力は全${esc(nf(ins.total))}王国中 <b>${esc(ins.powerRank)}位</b>（${esc(rankPercentText(ins.powerRank, ins.total))}）`);
  if (ins.gainRank != null) {
    // 金額は上の数字タイル（成長の記録）と出どころが違うので、ここでは順位だけを書く。
    items.push(ins.gain < 0
      ? `7日間で総力が <b>減っています</b>（伸びは全${esc(nf(ins.gainTotal))}王国中${esc(ins.gainRank)}位）`
      : `7日間の伸びは全${esc(nf(ins.gainTotal))}王国中 <b>${esc(ins.gainRank)}位</b>（${esc(rankPercentText(ins.gainRank, ins.gainTotal))}）`);
  }
  const c = ins.cohort;
  if (c) {
    const vs = c.powerVsMedian == null ? "" : Math.abs(c.powerVsMedian) < 0.05 ? "中央値とほぼ同じ" : `中央値より${Math.round(Math.abs(c.powerVsMedian) * 100)}%${c.powerVsMedian > 0 ? "多い" : "少ない"}`;
    items.push(`開設時期が近い王国（開設${esc(c.fromAge)}〜${esc(c.toAge)}日・${esc(c.size)}王国）の中で、総力は <b>${esc(c.powerRank)}位</b>${vs ? `・${esc(vs)}` : ""}`);
    if (c.gainRank != null) items.push(`同じ時期の王国の中で、7日間の伸びは <b>${esc(c.gainRank)}位</b>（中央値 ${esc(compact(c.medianGain))}）`);
  }
  return `<h2>王国${esc(kid)}の分析</h2><ul class="insights">${items.map(t => `<li>${t}</li>`).join("")}</ul><p class="note" style="margin-top:6px">総力は兵士の数や建物の強化でも大きく増えるので、強さとは比例しません。順位は規模の目安です。全王国の毎日の集計から EagleEye が計算しています。開設時期が近い王国＝開設日数が前後${COHORT_DAYS}日以内の王国。</p>`;
}

// 王国一覧の「王国ランキング」：総力・7日の伸び・開設180日以内の伸び（各 n 位まで）。全王国の一覧（キャッシュ）から作る。
export const YOUNG_KINGDOM_DAYS = 180;
export function kingdomLeaderboards(rows, n = 10) {
  const ok = (rows || []).filter(r => r && Number.isInteger(r.kid) && r.power != null);
  const at = Math.max(0, ...ok.map(r => Number(r.at) || 0));
  const withGain = ok.filter(r => r.gain != null);
  const byGain = (a, b) => b.gain - a.gain || a.kid - b.kid;
  return {
    total: ok.length,
    observedAt: at || null,
    power: ok.slice().sort((a, b) => b.power - a.power || a.kid - b.kid).slice(0, n),
    gain: withGain.slice().sort(byGain).slice(0, n),
    young: withGain.filter(r => r.age != null && r.age <= YOUNG_KINGDOM_DAYS).sort(byGain).slice(0, n)
  };
}

// ---- 秘境の試練（強さの目安・2026-11-15）----
// 総力は強さと比例しない（docs/KINGSHOT_GAME_KNOWLEDGE.md）。秘境の試練は月〜土を同じ兵士で挑むので育成の差が出やすい。
// KvK の組み合わせ用に、シーズンごとに王国ごとの上位10人の記録を集めている（kvk_mystic_summary・新しい API は使わない）。
// 一番新しいシーズンの全王国分（約2,400行）を isolate で1時間だけ覚えて、王国ごとの順位を出す。
import { MYSTIC_STAGE_KEYS, stageLabelFromValue } from "./kvk-mystic.js";
export const MYSTIC_LABELS = Object.freeze({ coliseum: "闘技場", forest_of_life: "生命の森", crystal_cave: "水晶鉱山", knowledge_nexus: "知識の枢軸", molten_fort: "溶岩要塞", radiant_spire: "輝光の塔" });
let mysticCache = { at: 0, value: null };
export function resetKingdomMysticCache() { mysticCache = { at: 0, value: null }; }

export async function loadAllMysticSummaries(db, nowMs = Date.now(), { cacheStore } = {}) {
  if (mysticCache.value && nowMs - mysticCache.at < INSIGHTS_CACHE_MS) return mysticCache.value;
  // 共有キャッシュ（Map は配列にして保存）
  const stored = await sharedJsonCache("mystic-summaries-v1", INSIGHTS_CACHE_MS / 1000, async () => {
    const v = await loadAllMysticSummariesFromDb(db);
    return { season: v.season, entries: [...v.map.entries()] };
  }, cacheStore === undefined ? {} : { cacheStore });
  mysticCache = { at: nowMs, value: { season: stored?.season ?? null, map: new Map((stored?.entries || []).map(([k, v]) => [Number(k), v])) } };
  return mysticCache.value;
}
async function loadAllMysticSummariesFromDb(db) {
  // KvK 用（シーズンごと）と、月1回の取り直し（kingdom_mystic_current）の新しい方を使う。
  const [res, cur] = await Promise.all([
    db.prepare("SELECT kid, season, boards_json, fetched_at FROM kvk_mystic_summary WHERE status = 'OK' AND season = (SELECT MAX(season) FROM kvk_mystic_summary WHERE status = 'OK')").all(),
    db.prepare("SELECT kid, boards_json, fetched_at FROM kingdom_mystic_current WHERE status = 'OK'").all().catch(() => ({ results: [] }))
  ]);
  const map = new Map();
  let season = null;
  const put = (r, s) => {
    try {
      const at = Number(r.fetched_at) || 0, prev = map.get(Number(r.kid));
      if (prev && (prev.fetchedAt || 0) >= at) return;
      map.set(Number(r.kid), { boards: JSON.parse(r.boards_json || "{}"), fetchedAt: at || null, season: s });
    } catch {}
  };
  for (const r of res?.results || []) { put(r, Number(r.season)); season = Number(r.season); }
  for (const r of cur?.results || []) put(r, null);
  return { season, map };
}

export function computeMysticInsights(kid, all) {
  const mine = all?.map?.get(Number(kid));
  if (!mine) return null;
  const stages = [];
  for (const key of MYSTIC_STAGE_KEYS) {
    const b = mine.boards?.[key];
    if (!b || b.best == null) continue;
    let above = 0, count = 0;
    for (const other of all.map.values()) {
      const v = other.boards?.[key]?.best;
      if (v == null) continue;
      count++;
      if (v > b.best) above++;
    }
    stages.push({ key, label: MYSTIC_LABELS[key], best: b.best, bestLabel: (Array.isArray(b.labels) && b.labels[0]) || stageLabelFromValue(b.best), rank: above + 1, count, top10: b.top10 ?? null, top10Label: b.top10 != null ? stageLabelFromValue(Math.round(b.top10)) : null });
  }
  if (!stages.length) return null;
  return { season: mine.season ?? null, fetchedAt: mine.fetchedAt, stages };
}

export function renderMysticInsights(kid, m) {
  if (!m) return "";
  const top10pct = m.stages.filter(s => s.count && s.rank / s.count <= 0.1).length;
  const lead = `6種類のうち <b>${m.stages.length}種類</b>の記録があり、そのうち <b>${top10pct}種類</b>で1位の記録が全王国の上位10%に入っています。`;
  const rows = m.stages.map(s => `<tr><th>${esc(s.label)}</th><td><b>${esc(s.bestLabel || "—")}</b></td><td>${esc(s.rank)}位<small>/${esc(s.count)}</small></td><td>${esc(s.top10Label || "—")}</td></tr>`).join("");
  const when = m.fetchedAt ? new Date(m.fetchedAt * 1000 + 9 * 3600 * 1000).toISOString().slice(0, 10) : "";
  return `<h2>王国${esc(kid)}の秘境の試練（強さの目安）</h2><p class="lead" style="margin-top:-4px">${lead}</p>
<div class="mys-wrap"><table class="mys"><thead><tr><th>種類</th><th>1位の記録</th><th>全王国中</th><th>上位10人の平均</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="note" style="margin-top:6px">秘境の試練は月〜土を全員同じ兵士で挑むので、兵士の数ではなく英雄・装備・研究などの育成の差が出やすい記録です。KvK や聖剣争奪は集結を主催するトップ層の強さで決まりやすいため、1位の記録を中心に見ています。記録は「章-ステージ」。${m.season ? `KvKシーズン${esc(m.season)}の組み合わせ用に` : ""}${when ? esc(when) + " ごろ" : ""}取得したものです（毎月取り直しています）（<a href="/kvk/matchups">KvK の組み合わせ</a>でも比べられます）。</p>`;
}

// ---- この30日の動き（2026-11-16）----
// R2 の成長の記録（7日前・30日前との比較）から、その王国の動きを文章にする。API は使わない。
// 項目ごとの値の意味（合計が総力と一致しない）は未確認なので、項目の「内訳」としては扱わず、同じ項目どうしの増え方だけを比べる。
const TREND_PARTS = Object.freeze([["hero_power", "英雄戦力"], ["troop_power", "兵士戦力"], ["research_power", "研究戦力"], ["governor_gear_power", "領主装備戦力"], ["governor_charm_power", "領主宝石戦力"], ["pet_power", "ペット戦力"], ["building_power", "建築戦力"]]);
const signed = (v, f) => (v > 0 ? "+" : v < 0 ? "−" : "±") + f(Math.abs(v));
// 基数が極端に小さいと「+156100.8%」のような意味のない数字になるので、10倍以上（+1000%）は出さない。
const pctText = (d, base) => base && Math.abs(d) / base < 10 ? `${d >= 0 ? "+" : "−"}${(Math.round(Math.abs(d) / base * 1000) / 10)}%` : "";
const pctParen = (d, base) => { const t = pctText(d, base); return t ? `（${t}）` : ""; };

export function kingdomTrend(growth) {
  const latest = growth?.latest;
  const c30 = (growth?.comparisons || []).find(c => c.label === "30日前")?.snapshot;
  if (!latest || !c30) return null;
  const c7 = (growth?.comparisons || []).find(c => c.label === "7日前")?.snapshot;
  const out = { power: null, players: null, kills: null, parts: [] };
  if (latest.power != null && c30.power != null) out.power = { d30: latest.power - c30.power, base: c30.power, d7: c7?.power != null ? latest.power - c7.power : null };
  if (latest.player_count != null && c30.player_count != null) out.players = latest.player_count - c30.player_count;
  if (latest.kills != null && c30.kills != null) out.kills = latest.kills - c30.kills;
  for (const [key, label] of TREND_PARTS) {
    const a = latest[key], b = c30[key];
    if (a != null && b != null && b > 0) out.parts.push({ key, label, rate: (a - b) / b });
  }
  out.parts.sort((x, y) => y.rate - x.rate);
  return out;
}

export function renderKingdomTrend(kid, t, compact) {
  if (!t) return "";
  const items = [];
  if (t.power) items.push(`総力は30日で <b>${esc(signed(t.power.d30, compact))}</b>${esc(pctParen(t.power.d30, t.power.base))}${t.power.d7 != null ? `、そのうち直近7日で ${esc(signed(t.power.d7, compact))}` : ""}。${t.power.d7 != null && t.power.d7 < 0 && t.power.d30 >= 0 ? "直近の1週間は減っています。" : ""}`);
  if (t.players != null) items.push(`領主数は30日で ${esc(signed(t.players, v => Number(v).toLocaleString("ja-JP")))}人。`);
  if (t.kills != null && t.kills > 0) items.push(`撃破数は30日で <b>+${esc(compact(t.kills))}</b>（戦闘で倒した兵士の数なので、戦いが多い時期ほど増えます）。`);
  if (t.parts.length >= 3) {
    const top = t.parts[0], low = t.parts[t.parts.length - 1];
    items.push(`30日でいちばん伸びた項目は「${esc(top.label)}」${esc(pctParen(top.rate, 1))}、いちばん伸びが小さかったのは「${esc(low.label)}」${esc(pctParen(low.rate, 1))}。`);
  }
  if (!items.length) return "";
  return `<h2>王国${esc(kid)}のこの30日の動き</h2><ul class="insights">${items.map(x => `<li>${x}</li>`).join("")}</ul><p class="note" style="margin-top:6px">毎日の記録の、30日前・7日前との比較です。総力は兵士を失うなどで減ることもあります。どの項目も、強さをそのまま表すものではありません。</p>`;
}
