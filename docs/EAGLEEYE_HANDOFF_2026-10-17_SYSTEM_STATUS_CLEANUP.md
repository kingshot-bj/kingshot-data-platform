# EagleEye System Status Cleanup Handoff — 2026-10-17

## Current basis
Reviewed the production System Status PDF uploaded on 2026-10-17. This records what the snapshot shows; it does not prove the underlying cause of every warning.

## Confirmed code issues found and patched on a working branch
Branch: `fix/system-status-unconfigured-items-2026-10-17`
PR: https://github.com/kingshot-bj/kingshot-data-platform/pull/142

1. **R2 archive object inventory check fails in the browser**
   - Snapshot error: `Can't find variable: escapeHtml`.
   - The inline browser script referenced server-side helpers. Added browser-local `escapeHtml` and `formatBytes`; the latter would otherwise fail once object rows are rendered.
2. **MightPulse Base URL diagnostic checks the wrong variable**
   - API client reads `MIGHTPULSE_API_BASE_URL` and falls back to `https://api.mightpulse.com/v1`.
   - System Status was checking `MIGHTPULSE_BASE_URL`, which can falsely show “未設定”.
   - Changed the diagnostic to check `MIGHTPULSE_API_BASE_URL`. An unset optional override is not necessarily a service failure because a default URL exists.
3. **Billing token visibility**
   - Added a Runtime / Configuration row for `CLOUDFLARE_BILLING_TOKEN`; this is separate from the Analytics token and must have Billing Read permission for actual cycle boundaries.
4. **D1 status color**
   - D1 `UNKNOWN` / `WAITING` no longer uses the healthy green style.
5. **Kingdom Watchlist validation feedback / CI regression**
   - Completed the stale-validation feedback when the kingdom number input changes, while keeping the raw entered number out of diagnostics.
   - Fixed two test assertions to account for backslash escaping inside the HTML template literal; runtime regex behavior is preserved.

## Snapshot items still to investigate
- **Cloudflare billing cycle:** Billing API anchor not obtained; page falls back to calendar-month estimation. Check API response/permissions and do not present fallback as confirmed billing-cycle data.
- **Worker Version Tag:** Version ID and timestamp exist, tag is missing. Determine whether tag is expected to be supplied by the deployed version metadata or whether the field is optional.
- **D1 Database status:** Database is shown as `UNKNOWN` while storage data is available. Inspect the status-probe classification before changing it.
- **Worker Errors:** 317 errors in the UTC-day snapshot. Pull error/event breakdown and correlate to real failures before deciding severity.
- **Google Sheets:** Apps Script Web App and Service Account integration both show unconfigured. Determine which export path is intended; do not invent or commit credentials.
- **Cloudflare config / Secrets:** Any real resource creation, secret changes, OAuth setup, or Google configuration must be performed by the account owner. Code and diagnostics can be prepared independently.

## Resource observations from the snapshot
- API Pool: 24/24 keys AVAILABLE; 0 active leases.
- Kingdom Watchlist: 10/10 active, 0 active monitor errors; latest job reported ranking 2,300 / player 0.
- D1 Rows Written: 30.6% of the displayed Paid $5 envelope; Rows Read: 2.9%.
- R2: 138,940 operations reported, 138,603 successes, 0 failed in the aggregate panel; the detailed list includes userError entries, so reconcile aggregate semantics rather than assuming there are no object-level errors.
- Query Insights: 506 unique query groups. `system_event_log` insert activity and API Pool update/read activity merit efficiency review after the status issues are resolved.

## Validation / release status
- Static source inspection performed for the code fixes.
- GitHub Actions run `39028531693` passed on commit `36c832c0facf5cbafb4ad2f23dba795ca7bc9c49`: syntax check, diagnostic telemetry, Probe unit tests, API Pool quota tests, Kingdom Watchlist registration UX tests, and Kingdom Watchlist regression tests all passed.
- PR #142 was squash-merged into `main` as `87450981c3dab63df066c8591fbbb6a48434291f`.
- The PR checks passed, including the full MightPulse Probe checks suite. After merge, `Worker Build Validation` on main failed in four Player Compare enhancement tests (`mobile chart layout`, `redundant growth comparison section`, `growth comparison collapsed/radar SVG`, `Mystic Trial radar scale`); the compile-without-deploy step was skipped. These failures were present on the prior main baseline as well and are outside this cleanup patch. Do not claim a successful production deploy from this run.
- Not merged and not deployed to production.
- Keep production D1/API traffic low while investigating; no ranking/watchlist load test is required for these fixes.

## Next order
1. Confirm PR #142 checks and inspect diff.
2. Fix or classify billing-cycle and D1 status diagnostics based on actual code/API evidence.
3. Investigate the 317 Worker errors and detailed R2 userError counts.
4. Decide the intended Google Sheets export method, then document the exact account-owner setup needed.
5. Recheck all System Status “未設定 / 未取得 / UNKNOWN” items against runtime code so diagnostic labels match actual configuration.


## Follow-up: Google Sheets diagnostics — 2026-10-17

- Found a second mismatch: the System Status page could label Apps Script as configured when `GOOGLE_SHEETS_SPREADSHEET_ID` was missing, but the actual exporter requires the Spreadsheet ID for either transport.
- Updated the Apps Script mode check and Runtime / Configuration row to require the Spreadsheet ID.
- Updated the export error message to document both valid transports:
  - Service Account: `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
  - Apps Script: `GOOGLE_SHEETS_WEBAPP_URL` + `GOOGLE_SHEETS_WEBAPP_SECRET`
  - Both transports require `GOOGLE_SHEETS_SPREADSHEET_ID`.
- PR #144 merged into `main` as `aa2acff28e300a6b9b34754028d4de9fcfe14b81`. PR checks and Cloudflare preview build passed.

## Release caveat

- Main's `Worker Build Validation` remains blocked by four Player Compare enhancement test failures unrelated to these System Status changes. The workflow skipped its compile-without-deploy step after those failures.
- No production deployment has been verified. Do not report these changes as live until the production Worker version is checked after a successful release.


## Cloudflare billing cost accuracy follow-up — 2026-10-17

Branch: `fix/cloudflare-billing-cost-accuracy-2026-10-17`

- The Billing API token is now treated as a separate secret. `CLOUDFLARE_ANALYTICS_TOKEN` is no longer silently reused for Billing API calls; this makes the runtime diagnostic row truthful and preserves least-privilege separation.
- Added a separate read of Cloudflare's Billable Usage endpoint (`GET /accounts/{account_id}/billable-usage`) when Paid monitoring is selected and the Billing token plus real billing-cycle anchor are available.
- The API-reported `BilledCost` totals are returned under `monitoring.billableUsage`, grouped by currency and product. They are intentionally not added to the estimated overage/monthly cost because they represent API-reported billed amounts, not a forecast of the final invoice.
- The existing local rate model is explicitly described as an estimate; it omits R2 overage, taxes, contract-specific pricing, and other adjustments, and must not be represented as actual Cloudflare charges.
- If the token or billing-cycle anchor is missing, the Billable Usage API result is explicitly unavailable instead of substituting Analytics credentials or fabricating a cost.
- No Cloudflare secrets were created or changed, and no production deployment or load test was run.

Official references checked:
- https://developers.cloudflare.com/api/resources/billing/subresources/usage/methods/paygo_info/
- https://developers.cloudflare.com/api/python/resources/billing/subresources/usage/methods/get_account_usage_v1/
- https://blog.cloudflare.com/billable-usage-api/ (2026-08-03)

Validation note: verify the returned `BilledCost` schema and date coverage against the user's account after a Billing Read token is configured. The API is marked Alpha in the docs; until confirmed, keep its values separate from final invoice claims.


- The System Status UI now renders the Cloudflare API-reported billed-cost field separately from the local estimate. If the API has no records or the call is unavailable, it shows `—` / an explicit unavailable reason rather than implying zero cost.
