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
| API Pool使用履歴 | 90日 | API key usage/audit records |

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