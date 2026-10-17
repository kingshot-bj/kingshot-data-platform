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
- Static source inspection performed for the two fixes.
- GitHub Actions workflow `MightPulse Probe checks` was observed queued for the first PR commit; latest commit status still needs rechecking.
- Not merged and not deployed to production.
- Keep production D1/API traffic low while investigating; no ranking/watchlist load test is required for these fixes.

## Next order
1. Confirm PR #142 checks and inspect diff.
2. Fix or classify billing-cycle and D1 status diagnostics based on actual code/API evidence.
3. Investigate the 317 Worker errors and detailed R2 userError counts.
4. Decide the intended Google Sheets export method, then document the exact account-owner setup needed.
5. Recheck all System Status “未設定 / 未取得 / UNKNOWN” items against runtime code so diagnostic labels match actual configuration.
