# MightPulse API Minor Compatibility Handoff — 2026-11-11

## Status

- Branch: `fix/mightpulse-api-minor-compat-2026-11-11`
- Base: `main` (observed HEAD before work: `7db098ecd0c291a90dc6fe3c82ec961aa73709b4`)
- Changes committed directly to the feature branch.
- **Not merged to main. Not deployed to Cloudflare.**
- This work was performed by ChatGPT through the GitHub integration while Cloud/Claude usage was unavailable.
- Main implementation commits:
  - `45f69fba3ff7f9627383159977ef12ef7cd90454` — MightPulse player freshness options + HTTP-date Retry-After
  - `473d6ccb5c32a26002b8627fa2aaaf446ecb6f4e` — pass optional freshness controls through guarded collection

## Official API reference checked

https://api.mightpulse.com/

Relevant documented behavior:
- Player/alliance responses include response fields such as `fresh`, `refresh`, and `retry_after`.
- Request options include `wait` (0–60 seconds) and `max_age` (60–604800 seconds).
- `202` can indicate a new player lookup is pending and includes `pending: true` plus a `Retry-After` header.
- `Retry-After` is used for rate limiting / pending follow-up timing.
- `include=members_base` and `include=members_full` are documented alliance options; `/v1/players?ids=` supports up to 50 IDs.

Important correction:
- `fresh:false` is a **response value**, not a request parameter. Do not add `fresh=false` to requests.
- The current implementation already treats any successful 2xx response, including HTTP 202, as an HTTP-level success and returns its body/status/headers. Do not describe 202 as currently rejected. A later task may add explicit pending-state orchestration if needed.

## Changes made

### 1. `src/mightpulse.js`

- `getMightPulsePlayer()` now accepts optional `wait` and `maxAge` options.
- These are mapped to query parameters `wait` and `max_age`.
- Existing callers are unchanged because both options default to `null`; therefore the default request behavior does not change.
- `retryDelay()` now supports both valid Retry-After formats:
  - delta seconds (existing behavior)
  - HTTP-date (new)
- Retry delay remains capped at 30 seconds, matching the existing local retry safety cap.

### 2. `src/data-collection-engine.js`

- `collectPlayerDetail()` now accepts optional `wait` and `maxAge`, forwarding them as `wait` and `max_age` through the existing guarded collection primitive.
- `collectAllianceDetail()` now accepts:
  - optional `include` (default remains `info,roster`)
  - optional `wait`
  - optional `maxAge`
- API Pool leasing, global collection semaphore, success/failure accounting, and D1 transient retry behavior remain in the existing shared guard path.
- Existing call sites preserve their previous behavior unless they explicitly pass the new options.

## Deliberately not changed

1. **Alliance default include was not switched from `roster` to `members_base`.**
   The new API supports `members_base`, but the current application has consumers that may expect the legacy `members` / `roster` shape. Before changing the default, trace every consumer and verify the actual response shape against production-like data. The new `include` option makes this migration possible per call site without changing all existing behavior.

2. **Bulk player endpoint was not introduced.**
   `GET /v1/players?ids=...` can fetch up to 50 IDs in one request, but EagleEye's current per-player collection path includes per-target API Pool lease/accounting, persistence, and diagnostics. A bulk implementation needs deliberate per-player result handling and must not bypass those protections.

3. **No explicit 202 polling/background-refresh workflow was added.**
   The low-level fetch already returns 202 responses as successful results. A full pending/retry orchestration must interpret `pending`, `refresh`, and `retry_after` without incorrectly recording pending data as completed player data.

4. No default `wait` or `max_age` was forced onto existing calls. This avoids unexpectedly holding Workers open or changing freshness/cost behavior.

## Validation still required by Cloud/Claude

Before merge/deploy:
1. Inspect the branch diff and confirm no unrelated changes.
2. Run the repository's relevant MightPulse and collection-engine tests (identify the current test command from package scripts).
3. Add/verify unit tests for `Retry-After` delta seconds, HTTP-date, expired date, malformed header, and no-header fallback.
4. Verify query forwarding:
   - `collectPlayerDetail(..., { wait: 30, maxAge: 600 })` sends `wait=30&max_age=600`.
   - `collectAllianceDetail(..., { include: "info,members_base", wait: 30, maxAge: 600 })` sends the same options while retaining the API Pool guard.
5. Confirm HTTP 202 body and headers are preserved end-to-end and not treated as a fully refreshed player record by higher-level handlers.
6. Only after tests pass, open/review PR, merge to main, then deploy Cloudflare separately.

## Suggested next small migration

After checking all roster consumers, trial `include=info,members_base` at one isolated call site and verify:
- member array field name and member object keys
- persistence mapping
- downstream UI/API consumers
- whether `members_fresh` / `members_pending` should be surfaced

Do not globally replace `roster` until those checks pass.
