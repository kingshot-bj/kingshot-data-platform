// Daily kingdom growth history. The kingdom catalog discovery already pages
// through GET /v1/kingdoms (24 kingdoms per request), and MightPulse documents
// the same kingdom field set for list items as for the detail endpoint
// (power, power_gain_7d, tc_pushers_7d, gov_power, ...). Each discovered row is
// summarised into one small R2 object per kingdom per UTC day:
//   history/kingdom_growth/v1/<kid>/<YYYY-MM-DD>.json
// so growth history costs no extra MightPulse calls. Activity-style fields
// (located / active_players / active_7d / active_30d) are deliberately not kept.

export const KINGDOM_GROWTH_PREFIX = "history/kingdom_growth/v1/";

export const KINGDOM_GROWTH_FIELDS = Object.freeze([
  ["power", "総戦力"],
  ["avg_power", "平均戦力"],
  ["player_count", "領主数"],
  ["power_rank", "戦力順位"],
  ["power_gain_7d", "7日間の戦力増加"],
  ["tc_pushers_7d", "7日間の役場上昇人数"],
  ["gov_power", "領主戦力"],
  ["alliance_power", "同盟戦力"],
  ["kills", "撃破数"],
  ["hero_power", "英雄戦力"],
  ["troop_power", "兵士戦力"],
  ["building_power", "建築戦力"],
  ["research_power", "研究戦力"],
  ["pet_power", "ペット戦力"],
  ["governor_gear_power", "領主装備戦力"],
  ["governor_charm_power", "領主宝石戦力"],
  ["mystic_trial", "秘境の試練"],
  ["migrant_score", "移民スコア"]
]);

const ALIASES = { research_power: ["science_power"], governor_gear_power: ["lord_equip"], governor_charm_power: ["lord_gem"] };

export function summarizeKingdomGrowth(row) {
  if (!row || typeof row !== "object") return null;
  const out = {};
  for (const [key] of KINGDOM_GROWTH_FIELDS) {
    let value = row[key];
    if (value == null) for (const alias of ALIASES[key] || []) if (row[alias] != null) { value = row[alias]; break; }
    const n = Number(value);
    if (value != null && value !== "" && Number.isFinite(n)) out[key] = n;
  }
  return Object.keys(out).length ? out : null;
}

export function kingdomGrowthKey(kid, observedAt) {
  return KINGDOM_GROWTH_PREFIX + String(kid) + "/" + new Date(Number(observedAt) * 1000).toISOString().slice(0, 10) + ".json";
}

// Best effort: archives what it can and returns the number of objects written.
export async function archiveKingdomGrowthRows(bucket, rows, observedAt) {
  if (!bucket || !Array.isArray(rows) || !rows.length) return 0;
  let written = 0;
  await Promise.all(rows.map(async ({ kid, row }) => {
    const summary = summarizeKingdomGrowth(row);
    if (!summary || !Number.isFinite(Number(kid))) return;
    try {
      await bucket.put(kingdomGrowthKey(kid, observedAt), JSON.stringify({ kid: Number(kid), observed_at: Number(observedAt), ...summary }), {
        httpMetadata: { contentType: "application/json" }
      });
      written++;
    } catch (error) {
      console.error("kingdom_growth_archive_failed", kid, error?.message || error);
    }
  }));
  return written;
}

const DAY = 86400;

export async function loadKingdomGrowthHistory(bucket, kid) {
  if (!bucket || !Number.isFinite(Number(kid))) return { latest: null, comparisons: [] };
  const prefix = KINGDOM_GROWTH_PREFIX + String(kid) + "/";
  const keys = [];
  let cursor;
  for (let page = 0; page < 3; page++) {
    const listed = await bucket.list({ prefix, cursor, limit: 1000 });
    for (const object of listed?.objects || []) keys.push(object.key);
    if (!listed?.truncated) break;
    cursor = listed.cursor;
  }
  const dated = keys.map(key => ({ key, at: Math.floor(Date.parse(key.slice(prefix.length, prefix.length + 10) + "T00:00:00Z") / 1000) }))
    .filter(item => Number.isFinite(item.at)).sort((a, b) => b.at - a.at);
  if (!dated.length) return { latest: null, comparisons: [] };
  const read = async key => { try { const o = await bucket.get(key); return o ? JSON.parse(await o.text()) : null; } catch { return null; } };
  const latest = await read(dated[0].key);
  const comparisons = [];
  for (const [label, days] of [["7日前", 7], ["30日前", 30]]) {
    const target = dated[0].at - days * DAY;
    const candidate = dated.find(item => item.at <= target) || (dated.length > 1 ? dated[dated.length - 1] : null);
    if (!candidate || candidate.key === dated[0].key || comparisons.some(c => c.key === candidate.key)) continue;
    const snapshot = await read(candidate.key);
    if (snapshot) comparisons.push({ label, key: candidate.key, at: candidate.at, snapshot });
  }
  return { latest, latestAt: dated[0].at, days: dated.length, comparisons };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function compact(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  const a = Math.abs(n);
  const fmt = (d, s) => (n / d).toFixed(1).replace(/\.0$/, "") + s;
  if (a >= 1e12) return fmt(1e12, "T");
  if (a >= 1e9) return fmt(1e9, "B");
  if (a >= 1e6) return fmt(1e6, "M");
  if (a >= 1e3) return fmt(1e3, "K");
  return n.toLocaleString("ja-JP");
}

export function renderKingdomGrowthSection(history) {
  const head = "<section class='growth'><h2>成長の推移</h2>";
  if (!history?.latest) return head + "<div class='empty'>成長の記録はまだありません。王国カタログの巡回で1日1件ずつ記録されます。</div></section>";
  const day = at => new Date(at * 1000).toISOString().slice(0, 10);
  const cols = history.comparisons || [];
  const header = "<tr><th></th><th>" + escapeHtml(day(history.latestAt)) + "</th>" + cols.map(c => "<th>" + escapeHtml(c.label) + "比</th>").join("") + "</tr>";
  const rows = KINGDOM_GROWTH_FIELDS.filter(([key]) => history.latest[key] != null).map(([key, label]) => {
    const now = history.latest[key];
    const cells = cols.map(c => {
      const before = c.snapshot?.[key];
      if (before == null) return "<td class='muted'>-</td>";
      const diff = now - before;
      // A smaller rank number is better.
      const better = key === "power_rank" ? diff < 0 : diff > 0;
      const cls = diff === 0 ? "" : better ? "up" : "down";
      const sign = diff > 0 ? "+" : "";
      return "<td class='" + cls + "'>" + (diff === 0 ? "±0" : sign + escapeHtml(key === "power_rank" ? diff : compact(diff))) + "</td>";
    }).join("");
    return "<tr><th>" + escapeHtml(label) + "</th><td>" + escapeHtml(key === "power_rank" ? now + "位" : compact(now)) + "</td>" + cells + "</tr>";
  }).join("");
  const note = cols.length
    ? "記録日数：" + history.days + "日。MightPulseの王国集計値を1日1回保存しています（リアルタイムではありません）。"
    : "記録は1日分です。翌日以降の記録が増えると変化を表示します。";
  return head + "<div class='growth-table'><table>" + header + rows + "</table></div><p class='growth-note'>" + escapeHtml(note) + "</p></section>";
}

export const KINGDOM_GROWTH_CSS = ".growth-table{overflow-x:auto}.growth table{width:100%;border-collapse:collapse;font-size:13px}.growth th,.growth td{padding:8px 6px;border-bottom:1px solid var(--ee-border-soft,#1d344d);text-align:right;white-space:nowrap}.growth th:first-child{text-align:left;color:var(--ee-subtext,#94a3b8);font-weight:700}.growth tr:first-child th{color:var(--ee-subtext,#94a3b8);font-size:11px}.growth td.up{color:var(--ee-success,#22c55e);font-weight:800}.growth td.down{color:var(--ee-danger,#f87171);font-weight:800}.growth td.muted{color:var(--ee-muted,#64748b)}.growth-note{font-size:12px;color:var(--ee-subtext,#94a3b8)}";
