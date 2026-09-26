# EagleEye Diagnostic System

## Purpose
EagleEye uses a unified diagnostic layer so that an operation being technically executed is not automatically treated as a successful data refresh.

## Diagnostic states
- SUCCESS: expected data was obtained and persisted.
- WARNING: operation completed but a non-fatal condition exists, such as missing upstream source timestamp.
- FAILED: expected data could not be obtained, parsed, or persisted.

## Core event fields
- trace_id
- service
- feature
- operation
- status
- error_code
- message
- provider
- target_type / target_id
- started_at / completed_at / elapsed_ms
- source_observed_at
- rows_received / rows_saved
- metadata

Diagnostic recording is best-effort and must never break the primary operation.

## Current system-status services
- API Pool
- MightPulse API
- Ranking
- Player
- Kingdom Watchlist
- D1 Database
- Discord
- Google Sheets
- Notifications

## Current implementation
src/diagnostics.js provides ensureDiagnosticSchema, diagnosticTraceId, recordDiagnostic, and getSystemDiagnostics.
Admin routes: /admin/diagnostics and /api/admin/diagnostics

## Kingdom Watchlist rule
A ranking board returning zero parsed entries is now treated as FAILED with error code RANKING_ENTRIES_EMPTY.
The watchlist job does not advance to player processing and must not be marked as a successful refresh.
A ranking saved successfully without a recognized MightPulse source timestamp is WARNING with error code SOURCE_TIME_UNAVAILABLE.

## Next expansion
Extend the same diagnostic events to API Pool health checks, player refresh, ranking test endpoints, Discord authentication, Google Sheets export, notification delivery, and D1 read/write health checks.
The system-status page should expose service health and drill-down trace details without exposing raw sensitive API payloads.