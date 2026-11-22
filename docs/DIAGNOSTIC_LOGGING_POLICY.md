# EagleEye Diagnostic Logging Policy

## Status

This policy applies to all future EagleEye feature work, bug fixes, refactors, API changes, scheduled jobs, and data pipeline changes. Diagnostic logging is a maintained subsystem, not a one-time implementation.

## Required review on every change

Before considering a change complete, review whether the current logs let an investigator reconstruct what happened and why. Do not assume existing event types, schemas, telemetry hooks, summaries, or exports are sufficient.

For every new or changed behavior, consider whether the following need to be added or updated:
- Browser interaction and UI state transitions, including whether a click handler ran and whether visible feedback was shown.
- Request lifecycle: request start, completion, duration, HTTP status, safe error details, retries, timeout/abort, and correlation identifiers.
- Server-side operation start/end, outcome, duration, relevant safe context, and failure stage.
- External API calls: endpoint template, pool/lease/job identifiers where applicable, attempt count, status, duration, and sanitized failure information.
- Database/cache/archive work: operation type, affected row/item counts, outcome, and storage fallback behavior.
- Background jobs and queues: enqueue/start/finish, job/trace IDs, progress counters, partial failure, and retry state.
- Cross-layer correlation from UI action through API, service/job, external request, persistence, and response.
- Diagnostic summaries, filters, time windows, pagination, export behavior, and tests.

These are review prompts, not a mandate to emit every event for every path. Add the events and fields that are necessary to diagnose that behavior. If the current scheme cannot answer a realistic failure question, change the scheme.

## Completeness and truthful reporting

- Never claim a log window is complete unless completeness is established from the actual query/stream result.
- Distinguish total event count, returned count, truncation, query failure, parse failure, and unavailable data.
- Unknown counts must be represented as unknown, not silently replaced by the number of returned events.
- Full-window exports must page through all matching records with stable ordering/cursors and report the requested time range and actual completion state.
- If an export or query fails partway through, surface that failure; do not present a partial document as a complete successful export.
- Add regression tests for event counts over the normal page limit, tied timestamps/cursor pagination, empty windows, query failures, and large exports when relevant.

## Privacy, security, and cost

- Never record passwords, session cookies, authorization headers, API keys, private request bodies, or user-entered form values by default.
- Sanitize and bound untrusted strings; avoid collecting unnecessary personal data.
- Protect diagnostic endpoints and exports with the existing authorization model.
- Keep instrumentation bounded and failure-safe. Logging failures should not silently break the primary business operation unless explicitly required for correctness.
- Consider D1 read/write cost, event volume, retention, payload size, and Worker memory/streaming constraints when changing logging.

## Definition of done

A feature is not done merely because its business logic passes tests. The change must also include an explicit logging review. When appropriate, add or update:
1. Event schema and instrumentation.
2. Trace/correlation propagation.
3. Summary fields and full-window export support.
4. Tests proving important success and failure paths are observable.
5. Documentation of any remaining blind spots.

In handoff notes, report what was added to logging, what remains unobservable, and whether the deployed environment has been verified. Do not claim production deployment or successful real-world log capture without evidence.

## Guiding rule

The logging scheme may be freely extended or redesigned when investigation needs require it. Prefer making the system self-explanatory from one authorized diagnostic export over asking the user to manually reproduce, gather several unrelated files, or explain missing context.
