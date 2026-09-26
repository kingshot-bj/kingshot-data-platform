# EagleEye Data Archive / Research Architecture

## Purpose

EagleEye separates operational data from long-term research data.

- D1: operational database
- R2: long-term raw/archive storage
- Google Sheets: human-facing research and analysis dataset

## Data flow

MightPulse
  -> Worker
  -> D1 (current/operational data)
  -> R2 (long-term archive)
  -> Google Sheets (research dataset)

Google Sheets is not the source of truth for EagleEye operations.

## R2 archive

Retention cleanup archives these D1 tables before deletion:

- api_observations
- player_snapshots
- ranking_snapshots
- player_rank_snapshots
- change_events

Archive format:

- gzip-compressed NDJSON
- one D1 row per JSON line
- includes source table and archive version metadata
- object key contains table, time range, and rowid range

Safety rule:

1. Select rows due for retention.
2. Write the selected rows to R2.
3. Only after a successful R2 write, delete those exact D1 rowids.
4. If R2 write fails, do not delete those rows.

This prevents the retention job from becoming a destructive operation when the archive destination is unavailable.

## Research Sheets

Google Sheets is intended for datasets such as:

- player time-series observations
- kingdom ranking history
- hero observations
- governor gear observations
- change events
- watchlist observations

The existing src/google-sheets.js implementation should be reused.

The current Google Cloud service-account JSON-key route is blocked by the project's inherited iam.disableServiceAccountKeyCreation policy. Do not remove or duplicate the existing Sheets implementation while the authentication method is being resolved.

## Future research export

The preferred research workflow is:

1. Keep raw historical data in R2.
2. Select/transform the desired research dataset in the Worker.
3. Append structured research rows to Google Sheets.
4. Keep D1 focused on current operational workloads.

This allows the research dataset to grow without making D1 the permanent historical warehouse.
