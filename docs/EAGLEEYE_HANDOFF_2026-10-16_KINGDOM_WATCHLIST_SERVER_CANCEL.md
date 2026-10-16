# EagleEye Handoff — Kingdom Watchlist Server Cancellation

Updated: 2026-10-16
Repository: https://github.com/kingshot-bj/kingshot-data-platform
Branch: fix/kingdom-watchlist-server-cancel-2026-10-16
Previous PR: https://github.com/kingshot-bj/kingshot-data-platform/pull/98

## Required operating rules
- Do not declare the issue fixed based on code presence or CI alone.
- Do not ask the user to use Preview for acceptance testing.
- Flow: branch -> tests/CI -> PR -> merge to main -> verify automatic production deployment separately.
- Report progress in 10% increments.
- Respect D1 read/write budgets. Clearly distinguish measured, estimated, and unavailable D1 usage.
- Keep API request concurrency and batch size based on actual API Pool capacity; do not restore a fixed player batch.

## PR #98 status
PR #98 was merged to main at commit `a8097046eb304c735d16f01789dbd5bf40cad877`.
It prevents browser polling from sending another `action=refresh` after a cancel request. The MightPulse Probe checks workflow passed. This does not prove production behavior and does not solve server-side cancellation races or scheduling fairness.

## Existing behavior confirmed in main
- `wrangler.jsonc` schedules Cron every 5 minutes (`*/5 * * * *`).
- `runKingdomWatchlistJobs(env)` already runs from the scheduled handler, so server-side continuation exists independently of an open browser.
- Scheduler iterates enabled watchlists in order and processes each eligible watchlist serially during one Cron invocation. The scheduler has no explicit per-invocation work budget; with many watchlists, a single run may become long and later watchlists may be delayed.
- `processKingdomWatchlistJob` sizes ranking/player batches from API Pool capacity using `getWatchlistApiConcurrency`; maximum guard is 26. Do not replace this with fixed batches.
- D1 lock TTL is 600 seconds. Lock protects the same watchlist from simultaneous scheduler/manual refresh execution, but does not deduplicate data collection across different users watching the same kingdom.
- Cancel API marks active job rows `FAILED` with `USER_CANCELLED:` and updates the watchlist's last error.
- Before this branch, scheduler/manual refresh failure handlers could unconditionally update a job to `FAILED` with a retry marker after a concurrent cancel, potentially overwriting `USER_CANCELLED:` and making the cancelled job eligible for retry again.
- Ranking phase cursor writes were not consistently guarded by the active `RANKINGS` state, and fetched ranking batches could proceed to persistence after a cancel arrived while the upstream calls were in flight.
- `ランキングを見る` is rendered with a link to `/kingdom/rankings?kid=<registered kingdom id>`; existence of this markup is not real-device verification.

## Changes on this branch
- Guard failure-path job updates so they only transition active `RANKINGS` / `PLAYERS` jobs. A late failure should not overwrite a durable cancellation.
- Guard ranking cursor writes by the `RANKINGS` phase.
- After a ranking fetch batch settles, reread the job status and stop before persisting that batch if a cancellation was recorded.
- Add regression tests for cancel/failure races, phase-guarded cursor writes, and ranking-button target.

## Remaining work
1. Run `node --test tests/kingdom-watchlist-race.test.mjs tests/kingdom-watchlist-registration-ux.test.mjs tests/kingdom-watchlist-retry-state.test.mjs` and the relevant full CI workflow.
2. Inspect the branch diff carefully for accidental SQL/status-guard changes.
3. Audit fairness and duplicate work across users: the current scheduler serially walks enabled watchlists, and multiple watchlist IDs for the same `kid` can independently request the same ranking boards. Design any deduplication with safe freshness semantics and bounded D1 reads.
4. Add a bounded, fair scheduler policy driven by real API Pool availability and resumable state, rather than an arbitrary fixed kingdom/user cap.
5. Confirm the deployed production Worker revision after merge; do not use Preview as user acceptance testing.
6. One real-device run should record trace ID, watchlist ID, job ID, kingdom ID, request/action, status transition, ranking rows saved, player rows saved, API Pool availability/capacity wait, and elapsed time. Never log API keys or unnecessary personal data.
7. Verify the ranking view opens the registered kingdom and cancellation remains terminal after any in-flight request settles.
8. Distinguish D1 usage: Cloudflare Analytics measured value vs code-derived estimate vs unavailable. Do not invent usage values.

## Current verification status
- PR #98: merged.
- PR #98's MightPulse Probe checks: passed.
- This branch's new tests/CI: pending.
- Production deployment of the latest source: not verified here.
- Real-device verification: not yet performed.
