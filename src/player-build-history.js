// Daily build history for a player: arena defence heroes (level, star, skill
// levels, exclusive gear level, gear enhancement / refine) and governor gear
// (quality, tier, star, strength). The data comes from the
// /players/{id}?include=heroes,gov_gear responses EagleEye already fetches
// (watchlists, player page refresh), so it costs no extra MightPulse calls.
//
// Storage: one small JSON object per player per UTC day in R2
//   history/player_build/v1/<governor_id>/<YYYY-MM-DD>.json
// A later fetch on the same day overwrites that day's object, so a player
// costs at most one object per day. Reading lists that player's prefix only.
//
// Notes: MightPulse documents `heroes` as the arena defence team, not rally
// formations, and the UI says so. Hidden governor gear is stored as hidden.

export const PLAYER_BUILD_HISTORY_PREFIX = "history/player_build/v1/";
export const PLAYER_BUILD_HISTORY_VERSION = 1;

const num = value => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

function pickHeroes(payload) {
  const player = payload?.player && typeof payload.player === "object" ? payload.player : null;
  if (Array.isArray(payload?.heroes)) return payload.heroes;
  if (Array.isArray(player?.heroes)) return player.heroes;
  return null;
}

function pickGovGear(payload) {
  const player = payload?.player && typeof payload.player === "object" ? payload.player : null;
  if (payload?.gov_gear && typeof payload.gov_gear === "object") return payload.gov_gear;
  if (player?.gov_gear && typeof player.gov_gear === "object") return player.gov_gear;
  return null;
}

// Compact, stable summary of the documented build fields. Returns null when the
// payload has neither heroes nor governor gear (e.g. a base-only fetch).
export function summarizePlayerBuild(payload) {
  const heroes = pickHeroes(payload);
  const gear = pickGovGear(payload);
  if (!heroes && !gear) return null;
  const summary = { v: PLAYER_BUILD_HISTORY_VERSION };
  if (heroes) {
    summary.heroes = heroes.filter(h => h && typeof h === "object" && h.id != null).map(h => ({
      id: String(h.id),
      name: h.name ?? null,
      position: num(h.position),
      level: num(h.level),
      star: num(h.star),
      stars: num(h.stars),
      skills: Array.isArray(h.skill_levels) ? h.skill_levels.map(s => ({ id: String(s?.id ?? ""), level: num(s?.level) })) : [],
      exclusive_level: num(h.exclusive_gear?.level ?? h.exclusive_gear_level),
      gear: Array.isArray(h.gear) ? h.gear.map(g => ({
        slot: g?.slot ?? String(g?.sid ?? ""),
        name: g?.name ?? null,
        quality: num(g?.quality),
        enhancement: num(g?.enhancement_level),
        refine: num(g?.refine_level)
      })) : []
    }));
  }
  if (gear) {
    summary.gov_gear = gear.hidden
      ? { hidden: true, items: [] }
      : {
          hidden: false,
          items: (Array.isArray(gear.items) ? gear.items : []).map(item => ({
            slot: item?.slot ?? null,
            name: item?.name ?? null,
            quality: num(item?.quality),
            tier: num(item?.tier),
            star: num(item?.star),
            strength_level: num(item?.strength_level),
            score: num(item?.score)
          }))
        };
  }
  return summary;
}

export function playerBuildHistoryKey(governorId, observedAt) {
  const day = new Date(Number(observedAt) * 1000).toISOString().slice(0, 10);
  return PLAYER_BUILD_HISTORY_PREFIX + String(governorId) + "/" + day + ".json";
}

export async function archivePlayerBuild(bucket, { governorId, observedAt, payload }) {
  if (!bucket || !governorId || !Number.isFinite(Number(observedAt))) return null;
  const summary = summarizePlayerBuild(payload);
  if (!summary) return null;
  const key = playerBuildHistoryKey(governorId, observedAt);
  await bucket.put(key, JSON.stringify({ governor_id: String(governorId), observed_at: Number(observedAt), ...summary }), {
    httpMetadata: { contentType: "application/json" }
  });
  return { key };
}

const DAY = 86400;

// Loads the latest day plus the snapshots closest to 7 and 30 days earlier.
// One list call (bounded) and at most three gets per page view.
export async function loadPlayerBuildHistory(bucket, governorId, { now = Math.floor(Date.now() / 1000) } = {}) {
  if (!bucket || !governorId) return { latest: null, comparisons: [] };
  const prefix = PLAYER_BUILD_HISTORY_PREFIX + String(governorId) + "/";
  const keys = [];
  let cursor;
  for (let page = 0; page < 3; page++) {
    const listed = await bucket.list({ prefix, cursor, limit: 1000 });
    for (const object of listed?.objects || []) keys.push(object.key);
    if (!listed?.truncated) break;
    cursor = listed.cursor;
  }
  if (!keys.length) return { latest: null, comparisons: [] };
  const dayOf = key => Math.floor(Date.parse(key.slice(prefix.length, prefix.length + 10) + "T00:00:00Z") / 1000);
  const dated = keys.map(key => ({ key, at: dayOf(key) })).filter(item => Number.isFinite(item.at)).sort((a, b) => b.at - a.at);
  if (!dated.length) return { latest: null, comparisons: [] };
  const read = async key => {
    try {
      const object = await bucket.get(key);
      return object ? JSON.parse(await object.text()) : null;
    } catch {
      return null;
    }
  };
  const latest = await read(dated[0].key);
  const comparisons = [];
  for (const [label, days] of [["7日前", 7], ["30日前", 30]]) {
    const target = dated[0].at - days * DAY;
    // Closest snapshot at or before the target day; otherwise the oldest one.
    const candidate = dated.find(item => item.at <= target) || (dated.length > 1 ? dated[dated.length - 1] : null);
    if (!candidate || candidate.key === dated[0].key) continue;
    if (comparisons.some(c => c.key === candidate.key)) continue;
    const snapshot = await read(candidate.key);
    if (snapshot) comparisons.push({ label, key: candidate.key, at: candidate.at, snapshot });
  }
  return { latest, latestAt: dated[0].at, days: dated.length, comparisons, now };
}

// Field-level changes from `older` to `newer`, limited to what the viewer may
// see. Returns [{ kind: "hero" | "gov_gear", label, field, from, to }].
export function diffPlayerBuild(older, newer, visible = {}) {
  const changes = [];
  if (!older || !newer) return changes;
  const push = (kind, label, field, from, to) => {
    if (from == null || to == null || from === to) return;
    changes.push({ kind, label, field, from, to });
  };
  if (visible.heroes !== false && Array.isArray(newer.heroes) && Array.isArray(older.heroes)) {
    const before = new Map(older.heroes.map(h => [String(h.id), h]));
    for (const hero of newer.heroes) {
      const old = before.get(String(hero.id));
      if (!old) {
        if (visible.heroList !== false) changes.push({ kind: "hero", label: hero.name || hero.id, heroId: hero.id, field: "編成入り", from: null, to: null });
        continue;
      }
      const label = hero.name || hero.id;
      if (visible.heroList !== false) {
        push("hero", label, "レベル", old.level, hero.level);
        push("hero", label, "星", old.star, hero.star);
      }
      if (visible.heroSkills !== false) {
        const oldSkills = new Map((old.skills || []).map(s => [String(s.id), s.level]));
        (hero.skills || []).forEach((skill, index) => push("hero", label, "スキル" + (index + 1), oldSkills.get(String(skill.id)), skill.level));
      }
      if (visible.heroExclusive !== false) push("hero", label, "専用装備", old.exclusive_level, hero.exclusive_level);
      if (visible.heroGear !== false) {
        const oldGear = new Map((old.gear || []).map(g => [String(g.slot), g]));
        for (const g of hero.gear || []) {
          const prev = oldGear.get(String(g.slot));
          if (!prev) continue;
          push("hero", label, g.slot + " 強化", prev.enhancement, g.enhancement);
          push("hero", label, g.slot + " 精錬", prev.refine, g.refine);
        }
      }
    }
  }
  if (visible.govGear !== false && newer.gov_gear && older.gov_gear && !newer.gov_gear.hidden && !older.gov_gear.hidden) {
    const before = new Map((older.gov_gear.items || []).map(item => [String(item.slot), item]));
    for (const item of newer.gov_gear.items || []) {
      const prev = before.get(String(item.slot));
      if (!prev) continue;
      const label = String(item.slot);
      push("gov_gear", label, "品質", prev.quality, item.quality);
      push("gov_gear", label, "ティア", prev.tier, item.tier);
      push("gov_gear", label, "星", prev.star, item.star);
      push("gov_gear", label, "強化", prev.strength_level, item.strength_level);
    }
  }
  return changes;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Server-rendered section for the player page. `visible` mirrors the player
// visibility settings; `labels` localises hero names and gear slots.
export function renderPlayerBuildHistorySection(history, visible = {}, labels = {}) {
  const heroName = labels.heroName || (v => v);
  const heroSlot = labels.heroSlot || (v => v);
  const govSlot = labels.govSlot || (v => v);
  const showHeroes = visible.heroes !== false;
  const showGear = visible.govGear !== false;
  if (!showHeroes && !showGear) return "";
  const head = '<section class="profile-section build-history"><div class="section-heading"><h2>育成の推移</h2><span class="label">アリーナ防衛編成・領主装備／1日1回保存</span></div>';
  if (!history?.latest) {
    return head + '<p class="build-history-empty">履歴はまだありません。ウォッチリストや再取得で英雄・領主装備を取得した日から、1日1件ずつ記録されます。</p></section>';
  }
  const comparisons = history.comparisons || [];
  if (!comparisons.length) {
    return head + '<p class="build-history-empty">記録は1日分です（' + escapeHtml(new Date(history.latestAt * 1000).toISOString().slice(0, 10)) + '）。翌日以降の記録が増えると変化を表示します。</p></section>';
  }
  let body = "";
  for (const comparison of comparisons) {
    const changes = diffPlayerBuild(comparison.snapshot, history.latest, visible);
    const since = new Date(comparison.at * 1000).toISOString().slice(0, 10);
    body += '<div class="build-history-block"><h3>' + escapeHtml(comparison.label) + '（' + escapeHtml(since) + '）からの変化</h3>';
    if (!changes.length) {
      body += '<p class="build-history-empty">変化はありません。</p></div>';
      continue;
    }
    body += '<ul class="build-history-list">' + changes.slice(0, 40).map(change => {
      const who = change.kind === "hero" ? heroName(change.label) : govSlot(change.label);
      const field = change.kind === "hero" ? String(change.field).replace(/^(\S+) (強化|精錬)$/, (m, slot, kind) => heroSlot(slot) + " " + kind) : change.field;
      const icon = change.kind === "hero" ? "英雄" : "領主装備";
      if (change.from == null && change.to == null) {
        return '<li><span class="build-history-tag">' + icon + '</span><b>' + escapeHtml(who) + '</b> ' + escapeHtml(field) + '</li>';
      }
      const up = Number(change.to) > Number(change.from);
      return '<li><span class="build-history-tag">' + icon + '</span><b>' + escapeHtml(who) + '</b> ' + escapeHtml(field) + ' <span class="build-history-delta ' + (up ? "up" : "down") + '">' + escapeHtml(change.from) + ' → ' + escapeHtml(change.to) + '</span></li>';
    }).join("") + '</ul>' + (changes.length > 40 ? '<p class="build-history-empty">ほか ' + (changes.length - 40) + ' 件</p>' : '') + '</div>';
  }
  return head + body + '<p class="build-history-note">記録日数：' + escapeHtml(history.days) + '日。MightPulseの取得時点の値で、リアルタイムではありません。</p></section>';
}

export const PLAYER_BUILD_HISTORY_CSS = ".build-history-block{margin-top:10px}.build-history-block h3{font-size:13px;margin:8px 0 6px;color:var(--ee-muted,#94a3b8)}.build-history-list{list-style:none;margin:0;padding:0;display:grid;gap:6px}.build-history-list li{padding:8px 10px;border:1px solid var(--ee-border-soft,#334155);border-radius:10px;font-size:13px;line-height:1.5}.build-history-tag{display:inline-block;margin-right:6px;padding:1px 6px;border-radius:999px;font-size:10px;font-weight:800;background:var(--ee-panel-deep,#1e293b);color:var(--ee-muted,#94a3b8)}.build-history-delta{font-weight:800}.build-history-delta.up{color:var(--ee-success,#22c55e)}.build-history-delta.down{color:var(--ee-danger,#f87171)}.build-history-empty,.build-history-note{font-size:12px;color:var(--ee-muted,#94a3b8);margin:6px 0}";
