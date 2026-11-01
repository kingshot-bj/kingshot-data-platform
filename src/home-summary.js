// Home page summary: the signed-in user's main governor, recent changes of the
// players they watch, and their kingdom's KvK score. Cheap indexed reads only
// (no MightPulse calls); every field respects the player visibility settings.

const ROLE_RANK = { BASIC: 0, ADVANCED: 1, VIP: 2, ADMIN: 3, OWNER: 4 };
const CHANGE_WINDOW_SECONDS = 7 * 86400;
const MAX_WATCHED_FOR_CHANGES = 50;
const MAX_CHANGES = 6;

// deps: { visible(key) -> bool, changeVisible(change) -> bool, now }
export async function buildHomeSummary(db, auth, deps) {
  const now = deps.now ?? Math.floor(Date.now() / 1000);
  const visible = deps.visible;
  const summary = { me: null, changes: [], kvk: null };
  if (!db || !auth?.user_id) return summary;

  const link = await db.prepare(
    "SELECT l.governor_id, l.kingdom_id, p.nick_name, p.kid, p.power, p.town_center_level, p.alliance_abbr, p.alliance_name, p.observed_at " +
    "FROM user_player_links l LEFT JOIN players p ON p.governor_id = l.governor_id " +
    "WHERE l.user_id = ? AND l.status = 'ACTIVE' ORDER BY CASE l.account_type WHEN 'MAIN' THEN 0 ELSE 1 END, l.created_at ASC LIMIT 1"
  ).bind(auth.user_id).first();
  if (link) {
    const kid = Number(link.kid ?? link.kingdom_id) || null;
    summary.me = {
      governor_id: String(link.governor_id),
      nick_name: visible("base_identity") ? (link.nick_name || null) : null,
      kid,
      power: visible("base_power") ? (link.power ?? null) : null,
      town_center_level: visible("base_power") ? (link.town_center_level ?? null) : null,
      alliance: visible("alliance_identity") ? (link.alliance_abbr || link.alliance_name || null) : null,
      observed_at: link.observed_at ?? null
    };
    const rank = ROLE_RANK[String(auth.role || "BASIC").toUpperCase()] ?? 0;
    if (kid && rank >= ROLE_RANK.ADVANCED) {
      const score = await db.prepare(
        "SELECT kid, season, stage, opponent, score, opponent_score, fetched_at FROM kvk_scores WHERE kid = ? LIMIT 1"
      ).bind(kid).first().catch(() => null);
      if (score && score.opponent) summary.kvk = { kid, season: score.season, stage: score.stage, opponent: score.opponent, score: score.score, opponent_score: score.opponent_score, fetched_at: score.fetched_at };
    }
  }

  if (auth.discord_id) {
    const watched = await db.prepare(
      "SELECT w.governor_id, COALESCE(w.label, p.nick_name) AS name FROM player_watchlists w LEFT JOIN players p ON p.governor_id = w.governor_id " +
      "WHERE w.discord_id = ? AND w.enabled = 1 ORDER BY w.updated_at DESC LIMIT " + MAX_WATCHED_FOR_CHANGES
    ).bind(auth.discord_id).all();
    const rows = watched?.results || [];
    if (rows.length) {
      const names = new Map(rows.map(r => [String(r.governor_id), r.name]));
      const ids = [...names.keys()];
      const placeholders = ids.map(() => "?").join(",");
      const events = await db.prepare(
        "SELECT target_id, change_type, field_name, old_value_json, new_value_json, detected_at FROM change_events " +
        "WHERE target_type = 'PLAYER' AND target_id IN (" + placeholders + ") AND detected_at >= ? ORDER BY detected_at DESC LIMIT 40"
      ).bind(...ids, now - CHANGE_WINDOW_SECONDS).all();
      const parse = value => { try { return JSON.parse(value); } catch { return value ?? null; } };
      for (const event of events?.results || []) {
        if (!deps.changeVisible(event)) continue;
        summary.changes.push({
          governor_id: String(event.target_id),
          name: visible("base_identity") ? (names.get(String(event.target_id)) || null) : null,
          field: event.field_name,
          from: parse(event.old_value_json),
          to: parse(event.new_value_json),
          at: event.detected_at
        });
        if (summary.changes.length >= MAX_CHANGES) break;
      }
    }
  }
  return summary;
}
