# EagleEye Release Readiness — 2026-10-16

## Purpose and decision

The ChatGPT/API/browser automation foundation is **on hold**. The immediate objective is to establish the remaining work for the first stable EagleEye release without delaying it further.

This is a source-and-repository audit, not proof of production health. No production D1/R2/Queue operation, external API call, deployment, or live user-facing write test was performed for this inventory.

## Snapshot

- Repository: `kingshot-bj/kingshot-data-platform`
- Main SHA observed: `79b675550c1bda4574bd9826f1c477849bf587ee`
- Latest open PR at audit time: [#93 — preserve kingdom validation regex](https://github.com/kingshot-bj/kingshot-data-platform/pull/93)
- PR #93 CI run observed failing: [MightPulse Probe checks #38877291344](https://github.com/kingshot-bj/kingshot-data-platform/actions/runs/38877291344)
- Existing feature inventory: [EAGLEEYE_COMPLETE_FEATURE_INVENTORY_2026-10-10.md](EAGLEEYE_COMPLETE_FEATURE_INVENTORY_2026-10-10.md). Its static findings must be reconciled with current main before being treated as current work.
- Worker name/config: `kingshot-data-platform`; D1 binding `DB` / `eagleeye-db`; R2 binding `ARCHIVE` / `eagleeye-archive`.
- Wrangler preview configuration points at the same D1 database ID and R2 bucket as production. **Do not use Preview as an isolated test environment.**
- The repo has a manual workflow for applying pending D1 migrations. Its existence does not prove that migrations have been applied to production.

## Release blockers / gates

### P0 — Fix CI before merging the active kingdom-number validation PR

- PR: [#93](https://github.com/kingshot-bj/kingshot-data-platform/pull/93)
- Latest observed PR #93 head at audit update: `c4074e35f3ea4b1ae036f64e67a93aea2da7a1de`.
- Failing CI runs observed: [#38880221760](https://github.com/kingshot-bj/kingshot-data-platform/actions/runs/38880221760) and [#38877291344](https://github.com/kingshot-bj/kingshot-data-platform/actions/runs/38877291344).
- The Worker syntax check and earlier test groups passed, but `tests/kingdom-watchlist-registration-ux.test.mjs` failed to parse with `SyntaxError: Unexpected token ')'` around line 75 in the first run; the latest observed run still fails at the Kingdom Watchlist registration UX test step. The kingdom-watchlist regression suite is skipped after that failure.
- Acceptance: fix the test source, rerun the affected test and full PR CI, inspect the diff, then merge only when checks pass. Do not treat the feature fix as validated while its regression test cannot run.

### P0 — Verify the normal production Kingdom Watchlist user journey

Several registration UX, telemetry, retry, and API Pool capacity changes have merged (#84–#92). Those merges and passing CI do not prove the live production journey works.

Verify, in the normal production UI:
1. Empty/invalid kingdom input shows actionable feedback and does not submit a create request.
2. A valid kingdom number triggers the create request once and returns a watchlist/job identifier.
3. The UI continues from registration into the initial refresh/job lifecycle.
4. Job status progresses correctly, including temporary API Pool capacity wait and retry.
5. Ranking rows and player rows are actually saved and shown; a generic job-complete message alone is not sufficient.
6. The result and diagnostic events correlate to the same user action/job.

This test changes production state and may invoke MightPulse/API Pool. Obtain explicit authorization for the specific test target before running it. Do not use Preview as a substitute.

### P0 — Establish deployment status independently of GitHub merge/CI

- Main merges are expected to trigger automatic Cloudflare deployment, but this audit did not verify the currently serving Worker version.
- Acceptance: confirm the latest intended main revision is deployed, then verify the production page/API actually serves the expected revision. Record main SHA, deployment result, and live smoke-test result separately.
- Do not claim production is fixed based on a merged PR or successful GitHub Actions run alone.

## P1 — Data correctness and operational reliability

### P1.1 — Diagnose API Pool / MightPulse failures as separate incidents

The latest handoff records distinct observations:
- Kingdom 1526: `NO_API_POOL_KEY_AVAILABLE` for `alliance_power`.
- Kingdom 2471: MightPulse HTTP 521.
- A player request: HTTP 522 and 526 observations.

Do not collapse these into one root cause. Reconstruct each request using its JST timestamp, trace/job ID, candidate key eligibility at that time, lease/cooldown state, endpoint, and Worker error/CPU telemetry. Later AVAILABLE-key counts do not prove a key was eligible at the failure time.

### P1.2 — Verify production D1 migration journal and actual schema

- Current main contains Probe migrations `0061` through `0065`, and the manual workflow includes a preflight guard for Probe migration history/schema drift.
- Production `d1_migrations` and the actual table/column layout were not read during this audit.
- Acceptance: read-only preflight against production, compare the journal with actual tables/columns and current SQL, then prepare a safe reconciliation plan for any mismatch. Do not blindly run pending migrations or use Preview, which shares production D1/R2.
- Review the current SQL references for `source_first_at`, `source_last_at`, `source_observed_at`, and ranking-current identifiers against the actual production schema before diagnosing related runtime errors.

### P1.3 — Verify Retention and history emergency-buffer execution paths

Static review of current `src/index.js` found:
- `runDataRetentionJob` has a definition but no invocation in this file.
- `drainHistoryEmergencyBuffer` is imported but no invocation was found.
- The scheduled handler currently invokes API Pool recovery, Kingdom Catalog refresh, hero icon asset work, Kingdom Watchlist jobs, and Discord notifications.

Confirm whether Retention and emergency-buffer draining are intentionally triggered elsewhere. If no external trigger exists, this is a data-retention/history-recovery wiring gap and should be fixed before relying on automated cleanup or recovery. Test archive-before-delete, retry/idempotency, and post-retention readback in an isolated environment.

### P1.4 — Verify Owner load-test export route wiring

- `handleOwnerKingdomLoadTestExportApi` is imported, and the export path appears in request-progress labeling.
- A dedicated router dispatch to that handler was not found in the current `src/index.js` scan.
- Confirm the route contract and whether a generic dispatch handles it. If not, add the route plus Owner authorization and a regression test. This is an Admin/Owner tooling issue, not necessarily a first-release user-flow blocker.

## P2 — Feature verification / release scope

### P2.1 — Player Compare production verification

- The current main has `handlePlayerCompareApi` and `renderPlayerComparePage`; the older inventory's “missing handler” candidate is stale.
- A prior handoff records an iPhone Safari screen stuck at “比較データを読み込み中…” and uncertainty about whether later main fixes were deployed.
- Verify the current production HTML, API response/error path, loading timeout/error UI, selected-player handling, chart data validity, and the actual iPhone Safari experience. Do not use unvalidated benchmark normalization or infer unprovided score scales.

### P2.2 — MightPulse Probe completeness and production migration

- Probe is now merged into main; PR #63 is closed/merged, so the older handoff statement that it had not merged is stale.
- The documented command catalog was 21 entries at the earlier audit and was not claimed to cover every official command. Full API command coverage is an enhancement, not a blocker for stabilizing the main user journeys.
- Before relying on Probe batch/history functions in production, verify the D1 migrations/schema as described in P1.2 and confirm API Pool reserve-key safeguards under test.

### P2.3 — Triage stale open PRs

The open-PR list includes older work such as #33 (player comparison blueprint), #30 and #27 (global progress UI), and #22 (star styling). Review each against current main:
- merge only if the work is still needed, current, and independently tested;
- close or supersede obsolete PRs rather than merging stale diffs.
Do not treat “open PR” as automatically “unfinished release work.”

### P2.4 — Broad feature smoke test

The old inventory enumerates many pages and API routes but labels most as code-present / runtime-unverified. Once P0 gates are cleared, run a scoped smoke-test matrix for the release's actual promised user journeys:
- authentication/session and role-based access;
- home/navigation and common mobile shell;
- player search/profile/history/compare;
- kingdom catalog/detail/rankings/alliance;
- player and kingdom Watchlists, including refresh/retry;
- Admin/Owner API Pool, Probe, diagnostics, export, and load-test routes;
- notification/support paths that are part of the intended release;
- retention/history restoration and migration-dependent paths.

Prioritize actual release scope rather than trying to certify all 110+ route entries at once.

## P1 — External integrations and deployment configuration (new audit scope)

The earlier inventory focused too heavily on code paths. The following items must be tracked separately as **configured**, **verified against provider settings**, and **tested end-to-end**. The Git repository cannot reveal whether Cloudflare Secrets are actually populated or whether Discord/Google consoles match the repository configuration.

### Discord Support / inquiry tickets

Static code/config evidence:
- `src/discord-support.js` implements ticket creation, private channel permission overwrites, incident context, diagnostic logging, and `/close` / `/reopen` guild commands.
- `src/index.js` routes `/api/discord/interactions`, `/api/admin/discord-support/register-command`, `/api/support`, and `/api/support/context`.
- `wrangler.jsonc` lists these required secrets: `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_SUPPORT_GUILD_ID`, `DISCORD_SUPPORT_CATEGORY_ID`, `DISCORD_SUPPORT_ROLE_ID`, and `DISCORD_SUPPORT_ARCHIVE_CATEGORY_ID`. `DISCORD_CLIENT_ID` is a non-secret Worker var.
- Code can resolve category/role IDs by exact names when category/role IDs are missing, but it still requires a usable support guild and archive category. The interaction handler directly checks configured support role and guild IDs.
- Code existence does **not** prove that the bot is installed in the intended guild, has the needed permissions, the Interaction Endpoint URL is configured, the public key matches, or the slash commands are registered.

Required verification:
1. Confirm each required Cloudflare secret exists in the production Worker (never print secret values).
2. Verify Discord Developer Portal application ID/public key, bot installation/scopes, interaction endpoint URL `https://kingshot-data-platform.black-jack-kingshot.workers.dev/api/discord/interactions`, and required channel/role permissions.
3. Verify support guild, open category, archive category, and support role IDs resolve to the intended objects.
4. Run the admin command-registration endpoint with an authorized account; then verify `/close` and `/reopen` exist in the guild.
5. With an approved test account, create one ticket, verify only the user/support role/bot can access it, verify the first message and diagnostic trace, close it, confirm the user loses access and the channel archives, then reopen it and verify access returns.
6. Check failure behavior for missing config, non-member users, Discord API permission failures, and failed first-message cleanup.

### Google Drive OAuth / archive integration

Static code/config evidence:
- `src/google-drive.js` requires `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_DRIVE_OAUTH_REDIRECT_URI`, `GOOGLE_DRIVE_REFRESH_TOKEN`, and `GOOGLE_DRIVE_FOLDER_ID`.
- `wrangler.jsonc` currently sets `GOOGLE_DRIVE_OAUTH_REDIRECT_URI` to `https://kingshot-data-platform.black-jack-kingshot.workers.dev/api/auth/callback`, while the route inventory identifies a separate handler at `/api/admin/google-drive/callback`. This is a **static callback-path mismatch candidate** that must be reconciled against the actual intended OAuth flow and Google Cloud Console authorized redirect URIs before claiming Drive OAuth works.
- `src/google-drive.js` documents the R2-to-Drive upload function as an explicit primitive that is not wired to cron, retention, or automatic R2 deletion. Do not assume Google Drive archiving is automatic.
- Required secrets listed in `wrangler.jsonc` include `GOOGLE_OAUTH_CLIENT_SECRET` and `GOOGLE_DRIVE_REFRESH_TOKEN`; presence in the list does not prove they are set or valid.

Required verification:
1. Resolve the correct redirect URI and make the Worker config, callback handler, and Google Cloud Console URI list agree.
2. Verify secret presence without exposing values, refresh-token validity, OAuth scope/consent, target Drive account, folder ID, and write access.
3. Run the existing connection verification endpoint, then a controlled upload/readback test against a designated test object/folder.
4. Decide explicitly whether Drive is optional/manual or part of release acceptance. Until code is wired to a scheduled/archive workflow, label it manual/experimental and do not claim automatic backup.

### Cloudflare / GitHub deployment and service prerequisites

- `wrangler.jsonc` defines production bindings for D1, R2, three Queue producers/consumers, Cron (every 5 minutes), assets, and version metadata. The Preview section does not mirror all production Queue bindings and points to the same D1 database/R2 bucket; do not use it as an isolated acceptance environment.
- The migration workflow expects GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Their presence/permissions and the latest production deployment were not verified by this source audit.
- Secrets/vars to verify against actual deployment include Discord, Google OAuth/Drive, `EAGLEEYE_SESSION_SECRET`, MightPulse API Pool credentials/keys, and any credentials consumed by admin diagnostics/Cloudflare usage. Never copy secret values into docs, logs, or screenshots.
- Confirm that Queue names and dead-letter queues exist in Cloudflare and match `wrangler.jsonc`; confirm Cron actually runs and the currently serving Worker revision matches intended main.
- Confirm Discord notification channel configuration and delivery path separately from the Discord Support ticket bot. Notification code existing is not evidence that the target channel IDs/configuration or delivery are valid.

### Other external-service readiness checklist

Track each as `configured` / `provider-verified` / `end-to-end-tested` / `not-in-release-scope`:
- Discord OAuth login and callback, bot token, interactions/public key, guild/category/role IDs, slash-command registration, support ticket lifecycle, notification destinations.
- Google OAuth redirect URI, OAuth client/secret, refresh token, Drive folder permissions, and whether archive upload is manual or automated.
- Cloudflare Worker secrets/vars, deployed version, Cron, D1 migrations/schema, R2 bucket, Queue producers/consumers/dead-letter queues, and required API token permissions.
- MightPulse API keys, API Pool eligibility/lease/cooldown, key reserve policy, and health-check behavior.
- GitHub Actions secrets and permissions for deploy/migration workflows; workflow success and production deployment must be recorded separately.
- Google Sheets export/OAuth if still in release scope, including the exact credential path and a real authorized export test.
- User-facing links, redirects, callback URLs, custom domains (if any), CORS/security headers, and mobile Safari behavior for OAuth and support flows.

## Recommended execution order

1. Fix PR #93's test syntax error and get CI green.
2. Verify the current main revision's Cloudflare production deployment.
3. With explicit approval, run one controlled end-to-end Kingdom Watchlist registration and initial-collection test in production; collect correlated diagnostics.
4. Investigate the separate API Pool/MightPulse failures from their timestamps and traces.
5. Read-only production D1 migration/schema preflight; do not apply migrations until the discrepancy report is understood.
6. Confirm Retention/emergency-buffer triggers and Owner export route wiring; fix only confirmed gaps.
7. Run the scoped smoke-test matrix and decide the release boundary.
8. Keep ChatGPT/API/browser automation infrastructure on hold until release blockers are resolved or the measured time savings clearly justify parallel investment.

## Non-negotiable constraints

- Never reintroduce broad `ranking_snapshots` history scans; prioritize D1 Free reads.
- Do not use Preview for user acceptance testing or as an isolated environment while it shares production D1/R2.
- Do not perform production D1 writes, Queue actions, load tests, or MightPulse calls without explicit authorization for that operation.
- Report code change, test/CI, merge, deployment, and live production verification as separate states.
- Distinguish confirmed evidence from static candidates and unverified assumptions.
