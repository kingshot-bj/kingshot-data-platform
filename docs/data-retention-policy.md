# EagleEye Data Retention Policy

## Purpose
EagleEye stores current-state data and historical observations. Retention is configurable from the admin screen so storage growth can be controlled without changing application code.

## Data classes
| Data | Default | Purpose |
|---|---:|---|
| API観測データ | 14日 | MightPulse raw observation payload |
| プレイヤースナップショット | 90日 | Player state history |
| ランキングスナップショット | 180日 | Kingdom ranking position/score history |
| プレイヤーランキング履歴 | 180日 | Personal ranking history |
| 変更イベント | 2年 | Detected rank/power/state changes |
| API Pool使用履歴 | 90日 | API key usage/audit records（R2アーカイブ） |\n| プレイヤー名称履歴 | 90日 | Player name/identity transition history（R2アーカイブ） |

`0 = 永久保存`.

## Cleanup
The Worker scheduled job runs every hour and performs bounded cleanup (default 1,000 rows per table per run). This prevents a large historical backlog from creating one oversized delete operation.
For raw `api_observations`, the newest observation for each target is retained even after its normal retention period. This protects the current source record used by EagleEye's materialized state.
Retention changes take effect on the next cleanup run.

## Admin
Admin/Owner:
- `/admin/data-retention`
- Settings are stored in `data_retention_settings`.
- Allowed periods are 7 days through 10 years, or permanent.
- Change history itself is not separately versioned; the current setting and updater are recorded.

## Initial production migration
Apply `migrations/0008_data_retention.sql` to the production D1 database before using the settings screen.

## R2 archive-backed history

The following history classes are archived to the private R2 archive before their D1 retention cleanup:

- API Pool使用履歴 (`api_pool_usage`)
- プレイヤー名称履歴 (`player_identity_history`)
- API観測データ (`api_observations`)
- プレイヤースナップショット (`player_snapshots`)
- ランキングスナップショット (`ranking_snapshots`)
- プレイヤーランキング履歴 (`player_rank_snapshots`)
- 変更イベント (`change_events`)
- ログイン履歴 (`login_history`)
- OWNER監査ログ (`owner_audit_log`)

The D1 row is deleted only after the R2 write succeeds. Google Drive long-term transfer is a separate later stage; until that is implemented and verified, R2 remains the archive source of truth.
