// 王国ページの「この王国の分析」。すでに D1 にある王国の集計（kingdom_stats_current）だけで計算する（MightPulse は呼ばない）。
// ・全王国の中での位置（総戦力・7日の伸び）と、開設時期が近い王国（±30日）の中での位置。
// ・「総戦力が近い王国」も同じ一覧から出す（意味が未確認の power_rank は使わない）。
// ・全王国の一覧（約2,600行）は isolate ごとに1時間だけ覚えておき、ページを開くたびには読まない。
// ・文章は実際の数字から組み立てる。数字が無いところは書かない（水増しの文章は作らない）。

export const INSIGHTS_CACHE_MS = 60 * 60 * 1000;
export const COHORT_DAYS = 30;
let cache = { at: 0, rows: null };
export function resetKingdomInsightsCache() { cache = { at: 0, rows: null }; }

export async function loadAllKingdomStats(db, nowMs = Date.now()) {
  if (cache.rows && nowMs - cache.at < INSIGHTS_CACHE_MS) return cache.rows;
  const res = await db.prepare("SELECT kid, power, power_gain_7d, age_days, player_count, observed_at FROM kingdom_stats_current").all();
  const rows = (res?.results || []).map(r => ({ kid: Number(r.kid), power: num(r.power), gain: num(r.power_gain_7d), age: num(r.age_days), players: num(r.player_count), at: num(r.observed_at) })).filter(r => Number.isInteger(r.kid));
  cache = { at: nowMs, rows };
  return rows;
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
  // 総戦力が近い王国：自分の上と下から3つずつ。
  const sorted = all.slice().sort((a, b) => b.power - a.power || a.kid - b.kid);
  const i = sorted.findIndex(r => r.kid === me.kid);
  out.nearPower = [...sorted.slice(Math.max(0, i - 3), i), ...sorted.slice(i + 1, i + 4)].map(r => ({ kid: r.kid, power: r.power }));
  return out;
}

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pctTop = (rank, total) => total ? Math.max(1, Math.ceil(rank / total * 100)) : null;

// 表示用：数字がある項目だけ。compact は数字を 1.2B のように短くする関数（王国ページと同じもの）。
export function renderKingdomInsights(kid, ins, compact) {
  if (!ins) return "";
  const items = [];
  items.push(`総戦力は全${esc(ins.total)}王国中 <b>${esc(ins.powerRank)}位</b>（上位${esc(pctTop(ins.powerRank, ins.total))}%）`);
  if (ins.gainRank != null) {
    // 金額は上の数字タイル（成長の記録）と出どころが違うので、ここでは順位だけを書く。
    items.push(ins.gain < 0
      ? `7日間で総戦力が <b>減っています</b>（伸びは全${esc(ins.gainTotal)}王国中${esc(ins.gainRank)}位）`
      : `7日間の伸びは全${esc(ins.gainTotal)}王国中 <b>${esc(ins.gainRank)}位</b>（上位${esc(pctTop(ins.gainRank, ins.gainTotal))}%）`);
  }
  const c = ins.cohort;
  if (c) {
    const vs = c.powerVsMedian == null ? "" : Math.abs(c.powerVsMedian) < 0.05 ? "中央値とほぼ同じ" : `中央値より${Math.round(Math.abs(c.powerVsMedian) * 100)}%${c.powerVsMedian > 0 ? "多い" : "少ない"}`;
    items.push(`開設時期が近い王国（開設${esc(c.fromAge)}〜${esc(c.toAge)}日・${esc(c.size)}王国）の中で、総戦力は <b>${esc(c.powerRank)}位</b>${vs ? `・${esc(vs)}` : ""}`);
    if (c.gainRank != null) items.push(`同じ時期の王国の中で、7日間の伸びは <b>${esc(c.gainRank)}位</b>（中央値 ${esc(compact(c.medianGain))}）`);
  }
  return `<h2>王国${esc(kid)}の分析</h2><ul class="insights">${items.map(t => `<li>${t}</li>`).join("")}</ul><p class="note" style="margin-top:6px">全王国の毎日の集計から EagleEye が計算しています。開設時期が近い王国＝開設日数が前後${COHORT_DAYS}日以内の王国。</p>`;
}

// 王国一覧の「王国ランキング」：総戦力・7日の伸び・開設180日以内の伸び（各 n 位まで）。全王国の一覧（キャッシュ）から作る。
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
