// Kingdom watchlists store their rankings / players in shared, kingdom-keyed
// tables (kingdom_ranking_current, players, ...). When two enabled watchlists
// watch the same kingdom, the one that fetches at least as many players at
// least as often already refreshes everything the other would fetch. The
// covered watchlist then skips its own MightPulse calls and reuses the
// covering watchlist's latest success, which saves API Pool quota.

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// True when `cover` refreshes everything `row` would: same kingdom, top_n not
// smaller, interval not longer. Exact ties are broken deterministically so two
// identical watchlists never cover each other (one of them always fetches).
export function watchlistCovers(cover, row) {
  if (!cover || !row) return false;
  if (String(cover.watchlist_id) === String(row.watchlist_id)) return false;
  if (String(cover.kid) !== String(row.kid)) return false;
  const coverTop = num(cover.top_n), rowTop = num(row.top_n);
  const coverInterval = num(cover.interval_hours, Infinity), rowInterval = num(row.interval_hours, Infinity);
  if (coverTop < rowTop || coverInterval > rowInterval) return false;
  if (coverTop > rowTop || coverInterval < rowInterval) return true;
  const coverCreated = num(cover.created_at), rowCreated = num(row.created_at);
  if (coverCreated !== rowCreated) return coverCreated < rowCreated;
  return String(cover.watchlist_id) < String(row.watchlist_id);
}

// Returns the covering watchlist whose last success is recent enough to stand
// in for `row` (within row's own interval), or null when `row` must fetch.
export function findCoveringWatchlist(row, rows, now = Math.floor(Date.now() / 1000)) {
  const window = num(row?.interval_hours, 0) * 3600;
  if (!(window > 0)) return null;
  let best = null;
  for (const cover of rows || []) {
    if (!watchlistCovers(cover, row)) continue;
    const success = num(cover.last_success_at, 0);
    if (!(success > 0) || now - success >= window) continue;
    if (!best || success > num(best.last_success_at, 0)) best = cover;
  }
  return best;
}
