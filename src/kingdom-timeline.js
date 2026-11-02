// Kingdom timeline: what a kingdom unlocks as it ages, and where a given
// kingdom stands. Milestones follow the community "Kingdom Journey (Server
// Timeline)" chart (last update 2026-05-25, credits: K162 Pandafather, K1 Sgt
// Slayer and contributors). Days are approximate and vary by server.
//
// The kingdom age comes from MightPulse (age_days on the kingdom list / detail),
// recorded daily with the growth history, and is advanced by the days elapsed
// since that record.

export const KINGDOM_TIMELINE_SOURCE = "コミュニティ資料「Kingdom Journey (Server Timeline)」（2026-05-25更新、作成：K162 Pandafather / K1 Sgt Slayer ほか）";

// [fromDay, toDay, category, title, detail]
export const KINGDOM_TIMELINE = Object.freeze([
  [0, 0, "hero", "第1世代 SSR英雄", "アマデウス・ヘルガ・ジェベル・サロ（ほか SR・R 英雄）"],
  [40, 50, "hero", "第2世代 SSR英雄", "ゾーイ・ヒルデ・マーリン"],
  [55, 60, "pet", "第1世代ペット", "グレイウルフ・リンクス・バイソン"],
  [70, 70, "truegold", "トゥルーゴールド解放（TG1〜3）", "トゥルーゴールドの時代"],
  [70, 80, "event", "王国の力（Kingdom of Power）", "参加資格の目安"],
  [75, 80, "pet", "第2世代ペット", "チーター・ムース"],
  [95, 115, "hero", "マスター", "パン・ヴァローラ・カシア・ローマン"],
  [105, 115, "pet", "第3世代ペット", "ライオン・グリズリー"],
  [105, 120, "hero", "第3世代 SSR英雄", "エリック・ペーラ・イェーガー"],
  [150, 150, "truegold", "トゥルーゴールド TG4・TG5", "トゥルーゴールド坩堝"],
  [190, 200, "hero", "第4世代 SSR英雄", "アルカ・マーゴ・ローザ"],
  [195, 200, "pet", "第4世代ペット", "ジャイアントライノ・マイティバイソン"],
  [220, 220, "truegold", "戦争学院 T11", "T11兵士の研究が解放"],
  [270, 280, "hero", "第5世代 SSR英雄", "龍飛・スルード・ビビアン"],
  [280, 280, "pet", "第5世代ペット", "グレートムース・アルファブラックパンサー"],
  [315, 315, "truegold", "TG6・TG7・TG8（精錬トゥルーゴールド）", "超精錬"],
  [350, 350, "pet", "第6世代ペット", "アイアンクラッド戦象・リーガルホワイトライオン"],
  [350, 360, "hero", "第6世代 SSR英雄", "トリトン・ソフィア・ヤン"],
  [440, 440, "hero", "第7世代 SSR英雄", "チャールズ・エヴァ・レン&ロン"],
  [440, 440, "pet", "第7世代ペット", "アイアンクラッド戦熊"]
].map(([from, to, category, title, detail]) => Object.freeze({ from, to, category, title, detail })));

const CATEGORY_LABEL = { hero: "英雄", pet: "ペット", truegold: "TG・研究", event: "イベント" };

// Current age in days, advanced from the recorded value.
export function currentKingdomAge(ageDays, recordedAt, now = Math.floor(Date.now() / 1000)) {
  if (ageDays == null || ageDays === "") return null;
  const base = Number(ageDays);
  if (!Number.isFinite(base) || base < 0) return null;
  const elapsed = Number.isFinite(Number(recordedAt)) && Number(recordedAt) > 0 ? Math.max(0, Math.floor((now - Number(recordedAt)) / 86400)) : 0;
  return Math.floor(base) + elapsed;
}

export function kingdomTimelineStatus(age, timeline = KINGDOM_TIMELINE) {
  if (!Number.isFinite(Number(age))) return null;
  const a = Number(age);
  const reached = [], upcoming = [], inWindow = [];
  for (const m of timeline) {
    if (a >= m.to) reached.push(m);
    else if (a >= m.from) inWindow.push(m);
    else upcoming.push({ ...m, daysLeft: m.from - a });
  }
  return { age: a, reached, inWindow, upcoming };
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const dayRange = m => m.from === m.to ? `${m.from}日目` : `${m.from}〜${m.to}日目`;

export function renderKingdomTimelineSection(age, { kid = "" } = {}) {
  const status = kingdomTimelineStatus(age);
  if (!status) return "";
  const item = (m, note) => `<li class="tl-item tl-${esc(m.category)}"><span class="tl-tag">${esc(CATEGORY_LABEL[m.category] || "")}</span><b>${esc(m.title)}</b><small>${esc(m.detail)}</small><em>${note}</em></li>`;
  const next = status.upcoming.slice(0, 3);
  const now = status.inWindow;
  const last = status.reached.slice(-3).reverse();
  const all = KINGDOM_TIMELINE.map(m => item(m, esc(dayRange(m)) + (status.age >= m.to ? " ✓" : ""))).join("");
  return `<section class="kingdom-timeline"><h2>王国タイムライン</h2>
<div class="tl-age">王国${esc(kid)}は<strong>開設${esc(status.age)}日目</strong></div>
${now.length ? `<h3>いま解放の時期</h3><ul class="tl-list">${now.map(m => item(m, esc(dayRange(m)))).join("")}</ul>` : ""}
${next.length ? `<h3>次に解放されるもの</h3><ul class="tl-list">${next.map(m => item(m, "あと" + esc(m.daysLeft) + "日（" + esc(dayRange(m)) + "）")).join("")}</ul>` : `<p class="tl-note">資料にある解放はすべて到達済みです。</p>`}
${last.length ? `<h3>最近解放済み</h3><ul class="tl-list tl-done">${last.map(m => item(m, esc(dayRange(m)) + " ✓")).join("")}</ul>` : ""}
<details class="tl-all"><summary>タイムライン全体を見る</summary><ul class="tl-list">${all}</ul></details>
<p class="tl-note">日数は目安で、サーバーにより前後します。出典：${esc(KINGDOM_TIMELINE_SOURCE)}。開設日数はMightPulseの王国データより。</p></section>`;
}

export const KINGDOM_TIMELINE_CSS = ".kingdom-timeline .tl-age{padding:12px 14px;border:1px solid var(--ee-border-soft,#1d344d);border-radius:var(--ee-radius-md,13px);background:var(--ee-panel,#0f2035);font-size:14px}.kingdom-timeline .tl-age strong{font-size:18px;color:var(--ee-cyan,#22d3ee)}.kingdom-timeline h3{margin:14px 0 6px;font-size:13px;color:var(--ee-subtext,#94a3b8)}.tl-list{list-style:none;margin:0;padding:0;display:grid;gap:6px}.tl-item{display:grid;grid-template-columns:auto minmax(0,1fr);gap:2px 8px;padding:9px 12px;border:1px solid var(--ee-border-soft,#1d344d);border-radius:var(--ee-radius-md,13px);background:var(--ee-panel,#0f2035)}.tl-item b{font-size:14px}.tl-item small{grid-column:2;font-size:12px;color:var(--ee-subtext,#94a3b8)}.tl-item em{grid-column:2;font-style:normal;font-size:12px;font-weight:800;color:var(--ee-cyan,#22d3ee)}.tl-done .tl-item em{color:var(--ee-success,#22c55e)}.tl-tag{grid-row:1/4;align-self:start;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:900;background:var(--ee-panel-raised,#172a40);color:var(--ee-subtext,#94a3b8)}.tl-hero .tl-tag{background:#7c3aed;color:#fff}.tl-pet .tl-tag{background:#059669;color:#fff}.tl-truegold .tl-tag{background:#b45309;color:#fff}.tl-event .tl-tag{background:#be123c;color:#fff}.tl-all{margin-top:10px}.tl-all summary{cursor:pointer;font-size:13px;color:var(--ee-cyan,#22d3ee)}.tl-all .tl-list{margin-top:8px}.tl-note{font-size:11px;color:var(--ee-subtext,#94a3b8);line-height:1.6;margin-top:8px}";
