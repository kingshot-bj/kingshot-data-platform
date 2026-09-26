# EagleEye R2 Archive Design v1

## 1. Purpose

R2 is the long-term raw/archive layer for EagleEye. It exists to prevent D1 from becoming a permanent historical warehouse while preserving enough raw data to support future research, analysis, reprocessing, and recovery.

The authoritative role split is:

- **MightPulse**: external primary data source
- **D1**: current/operational source of truth for EagleEye features
- **R2**: long-term raw historical archive
- **Google Sheets**: human-facing research/analysis dataset

R2 is not a replacement for D1 and Google Sheets is not a replacement for R2.

## 2. Current implementation boundary

The current implementation already provides the first archive layer:

- 'src/r2-archive.js' writes selected D1 rows to R2.
- 'src/retention.js' archives retention-due rows before deleting them from D1.
- 'wrangler.jsonc' binds R2 as 'ARCHIVE' to 'eagleeye-archive'.
- The production Worker binding has been successfully deployed after the R2 bucket was created.

The following tables are currently archive-eligible:

- 'api_observations'
- 'player_snapshots'
- 'ranking_snapshots'
- 'player_rank_snapshots'
- 'change_events'

'api_pool_usage' remains ordinary retention-only operational data and is not currently archived to R2.

## 3. Archive safety contract

The retention process must follow this order:

1. Select a bounded batch of rows that are due for retention.
2. Serialize the exact selected rows as archive records.
3. Compress the archive as gzip-compressed NDJSON.
4. Write the archive object to R2.
5. Only after the R2 write succeeds, delete the exact selected D1 rowid values.
6. If R2 write fails, do not delete the D1 rows.

This makes R2 availability a prerequisite for destructive retention deletion.

### Retry behavior

Archive object keys are deterministic for the selected table/time range/rowid range. If an R2 write succeeds but the following D1 deletion fails, a retry may write the same key again and then retry the deletion. This is intentional: the archive operation should be effectively idempotent rather than creating an uncontrolled set of duplicate objects.

## 4. Archive format

Each R2 archive object uses:

- Content type: 'application/x-ndjson'
- Content encoding: 'gzip'
- One D1 row per NDJSON line
- Archive version marker: '_eagleeye_archive_version'
- Source table marker: '_source_table'

The original D1 row fields are retained. The archive is therefore a raw historical representation rather than a research-specific projection.

Example logical record:

    {"_eagleeye_archive_version":"v1","_source_table":"player_snapshots","snapshot_id":"...","governor_id":"...","observed_at":175...,"payload_json":"..."}

The archive format must remain backward-readable. If the format changes incompatibly, increment 'ARCHIVE_VERSION' rather than silently changing the meaning of existing objects.

## 5. Object key design

Current deterministic key structure:

    archive/v1/<table>/<firstObserved>/<lastObserved>/<firstRowid>/<lastRowid>.ndjson.gz

The rowid range is part of the identity of the archive batch. This supports deterministic retries and makes the archived batch traceable back to D1.

Future revisions may introduce normalized date/hour partitions if the archive volume becomes large enough to make prefix-based research retrieval beneficial. Such a change must be versioned rather than changing existing v1 object semantics.

## 6. Batch design

Current retention batch size is 1,000 rows.

The batch is intentionally bounded so that:

- Worker memory usage remains controlled.
- R2 objects remain reasonably sized.
- A failed batch does not block an entire table indefinitely.
- Retry cost remains bounded.

Batch size may be tuned after observing real archive object sizes and Worker execution behavior. Do not increase it solely for throughput without checking memory, execution time, and R2 cost implications.

## 7. Data ownership by layer

### D1

Keep in D1:

- current player state
- authentication and authorization
- Watchlist configuration/state
- current operational indexes
- recent history required by UI/features
- Change Events for the configured retention period

### R2

Keep in R2:

- historical raw API observations
- historical player snapshots
- historical ranking snapshots
- historical player ranking snapshots
- historical Change Events after D1 retention
- future large research/raw datasets when approved

### Google Sheets

Keep in Sheets:

- selected research datasets
- human-readable analysis tables
- aggregated or transformed historical datasets
- Admin/Owner exports

Sheets should not become the raw archive of record.

## 8. Retrieval and research path

R2 retrieval is a separate concern from retention.

Preferred future path:

    R2 object -> Worker stream/read -> validate archive version -> decompress NDJSON -> filter/transform -> research dataset -> Google Sheets

Research exports should read raw history from R2 when the requested period has already left D1. They should not require restoring the entire archive back into D1.

For large research jobs, process objects in bounded batches and append to Sheets incrementally rather than loading the entire historical dataset into Worker memory.

## 9. Recovery path

A future recovery utility should support:

- listing archive objects by table and time range
- reading a selected archive object
- validating archive version/source table
- reconstructing rows into a controlled D1 import or temporary processing path

Recovery must be explicit and administrative. Normal application requests must never automatically restore large R2 archives into D1.

## 10. Integrity and observability

Future R2 operations should expose enough metadata to answer:

- Which D1 table was archived?
- How many rows were archived?
- What rowid range was included?
- What observation time range was included?
- Was the R2 write successful?
- Was the subsequent D1 deletion successful?
- When was the archive operation attempted?
- Did a retry occur?

Current object metadata already includes source table, row count, first rowid, and last rowid.

A later observability layer may add checksums, archive-job IDs, or a separate operational log if real-world recovery/testing shows they are needed. Do not add a permanent D1 archive-index table solely for convenience without first checking its storage cost and whether R2 listing/metadata is sufficient.

## 11. Failure modes

### R2 unavailable

- Do not delete D1 retention rows.
- Record/report the retention failure through the existing job diagnostics.
- Retry on a later scheduled run.

### R2 write succeeds, D1 delete fails

- Keep the archive object.
- Retry the same deterministic archive key on the next attempt.
- Retry deletion of the same selected rows.

### Partial/ambiguous request result

Treat the deterministic object key as the idempotency boundary. Before creating a second logical archive object for the same batch, use the same key semantics.

### Corrupt or unsupported archive version

- Do not import it into D1.
- Report the archive version as unsupported.
- Preserve the original R2 object for investigation.

## 12. Security

- R2 bucket remains private; public access is disabled.
- Browser clients do not access R2 directly.
- Archive access is performed server-side by the Worker or controlled administrative tooling.
- Raw archive data may contain player information and must not be exposed through public routes.
- Secrets and credentials must never be stored in archive objects.

## 13. Cost and safety policy

R2 is operated under EagleEye's general usage-safety policy:

- Monitor storage, Class A, Class B, and other applicable limits.
- Warn before important thresholds are reached.
- Normal free-tier overage does not silently stop data collection.
- Clearly abnormal growth or runaway processing may trigger an emergency stop.
- Discord-based usage alerts will be implemented together with the future Discord monitoring/notification layer.

Any future R2 feature must review storage growth, operation count, execution time, and possible runaway behavior before implementation.

## 14. Design status

### Implemented

- R2 bucket 'eagleeye-archive'
- Worker 'ARCHIVE' binding
- gzip NDJSON archive format
- retention-before-delete safety ordering
- bounded 1,000-row archive batches
- deterministic archive keys
- private bucket configuration

### Designed but not yet implemented

- R2 historical retrieval UI/API
- research export directly from R2 history
- administrative recovery/import utility
- richer archive observability/checksum support
- Discord R2 usage/cost alerts

These are intentionally separated from the initial D1->R2 retention migration so the archive foundation can be validated before adding more moving parts.
