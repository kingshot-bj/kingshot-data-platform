# EagleEye D1 / Cloudflare Free Tier Resource Audit — 2026-09-27

## Purpose

Prevent another development stoppage caused by exhausting a Cloudflare Free daily limit.

This audit is code-based against `main` and is intentionally separate from production measurement. Production `meta.rows_read` / `meta.rows_written` must still be measured after D1 access is restored.

## Cloudflare Free limits that matter

As of 2026-09-27:

- D1: 5,000,000 rows read/day.
- D1: 100,000 rows written/day.
- D1 database size: 500 MB per database.
- D1 queries per Worker invocation: 50.
- Workers requests: 100,000/day.
- Workers CPU: 10 ms/invocation.
- Workers external subrequests: 50/request.
- Free Workers Logs: 200,000 log events/day.
- D1 limits reset at 00:00 UTC.

D1 rows are counted by rows scanned/written, not merely rows returned. Index maintenance adds written rows for indexed columns.

## Confirmed code-level WRITE amplification

### 1. Player visibility initialization
Previously, every read path iterated 19 visibility settings and issued an unconditional UPDATE for each row.

Status: **fixed**.

The current code also memoizes schema initialization per Worker isolate, so the 19-row bootstrap is not repeated on every request.

### 2. Redundant ranking index
A runtime index duplicated the migration 0011 current-ranking index.

Status: **fixed in code** and migration 0013 exists.

Remote migration still needs to be applied:
`npx wrangler d1 migrations apply eagleeye-db --remote`

### 3. Ranking snapshot fan-out
One ranking entry is not necessarily one D1 write. `ranking_snapshots` has several indexes. Each indexed write can add index-row writes.

At 100 rows per board and 26 boards, the raw table insert alone is up to 2,600 rows per complete ranking refresh. Index maintenance makes the actual D1 `rows_written` substantially higher.

The hard 100-entry cap is now enforced before persistence.

### 4. API Pool per-request persistence
A normal API Pool request currently performs multiple persistent operations:

- lease INSERT
- key state UPDATE
- usage-history INSERT
- lease release UPDATE

`api_pool_usage` itself has three indexes, and `api_leases` has three indexes.

This is a major remaining WRITE amplification target.

### 5. Diagnostic persistence
Routine successful ranking operations currently write `diagnostic_events`.

Each diagnostic row has three indexes.

Status: **not yet removed** because diagnostics are useful, but routine-success persistence should be evaluated against production measurements.

### 6. Watchlist job progress
Ranking processing updates `kingdom_watchlist_jobs` after each board.

This is intentionally retained because it makes the 26-board job resumable without re-fetching completed boards.

However, job/source-range writes should be minimized where correctness permits.

### 7. Watchlist scheduler lock
The scheduler previously acquired and released a D1 lock even for an idle watchlist that was not due.

Status: **fixed**.

Idle watchlists are now checked before acquiring the lock.

### 8. Watchlist idle status update
The scheduler previously wrote `kingdom_watchlists.last_error = NULL` every time an active job was merely progressing.

Status: **fixed**.

## Confirmed READ risks

### 1. Player search
`/players` uses multiple predicates with leading-wildcard LIKE:

`%query%`

This can require a full scan of `players`.

This is a direct Free D1 row-read risk as the player table grows.

### 2. Ranking history / latest-ranking queries
Several ranking queries operate over historical `ranking_snapshots`.

The current index set is helpful for board-specific reads, but queries that group by board or resolve latest snapshots across all boards can still scan a large historical dataset.

These queries need `EXPLAIN QUERY PLAN` and production `rows_read` measurement before adding more indexes, because every additional index also increases future WRITE cost.

### 3. Correlated ranking abbreviation fallback
Some ranking UI queries use correlated subqueries against `ranking_snapshots` and `players` to recover alliance abbreviations.

This can multiply reads per candidate ranking row.

This is a high-priority READ optimization target.

### 4. Ranking change detection
For each board, change detection reads the current snapshot set and then historical rows for target IDs.

The current batching avoids parameter-limit errors, but the actual rows scanned depend on history depth and index selectivity.

### 5. Player visibility initialization
Before the memoization fix, this performed repeated PRAGMA + per-item SELECTs.

Status: **hot-path repetition fixed by isolate-level initialization caching**.

## Other Free-tier failure modes

### Workers requests
The application has many HTTP API/page routes. Free Workers allows 100,000 requests/day.

This is independent of D1. A sudden crawler, refresh loop, or client polling bug can exhaust it.

### Workers CPU
Free Workers allows only 10 ms CPU per invocation.

Large HTML rendering, JSON parsing, ranking normalization, CSV generation, and complex filtering can hit this even when D1 usage is healthy.

### 50 subrequests per invocation
D1 calls count as Worker subrequests. A Watchlist invocation contains many D1 operations plus external API calls.

This limit must be treated separately from D1 rows-read/write quotas.

### D1 database storage
Free D1 has a 500 MB per-database limit.

The biggest growth sources are:

- `api_observations.payload_json`
- `player_snapshots.payload_json`
- `ranking_snapshots`
- `player_rank_snapshots`
- `change_events`
- `api_pool_usage`
- indexes on those tables

Retention exists, but storage growth must be measured.

### Workers Logs
Free Workers Logs allows 200,000 log events/day.

Excessive per-board/per-player `console.log` output can become another independent daily resource limit.

## Preventive policy for implementation

1. No new D1 hot-path schema creation/index creation.
2. No unconditional UPDATE on read paths.
3. No routine telemetry INSERT unless its operational value justifies its write cost.
4. Every historical table must have an explicit retention policy.
5. Every new index must justify its READ reduction against its permanent WRITE amplification.
6. Ranking and player history queries must be checked with `EXPLAIN QUERY PLAN`.
7. Production measurements must record/inspect D1 `meta.rows_read` and `meta.rows_written`.
8. Watchlist processing must stay resumable without re-fetching already completed boards.
9. Free-tier operation must have explicit resource budgets for D1, Workers requests, CPU, subrequests, and storage.
10. Development testing must not rely on guessing D1 consumption.

## Next measurement gate

Once D1 is available again, run exactly one controlled Watchlist cycle and compare:

- total D1 rows read
- total D1 rows written
- D1 queries
- Worker subrequests
- Worker CPU
- database size

Then repeat after each optimization.

The goal is not merely "make it work"; it is to establish a measured per-watchlist resource budget so EagleEye cannot silently consume a full day's Free quota during normal development/testing.
