# EagleEye Data Architecture — D1 Minimum / R2 History / Future Drive

## Purpose

EagleEye keeps Cloudflare D1 focused on the minimum state required to operate the application and calculate the next change.

The long-term rule is:

- D1 = current state, watchlists, system state, and lightweight semantic identity/change data.
- R2 = historical observations and archive batches.
- Google Drive = future permanent archive layer.
- Google Sheets = future research/search/export/index layer.

Google Drive and Sheets are intentionally not required for this migration phase.

## D1 principles

1. Do not use D1 as a permanent raw-data warehouse.
2. Do not restore broad ranking_snapshots reads.
3. Do not write an unchanged observation merely because it was fetched.
4. Store identity transitions only when the identity actually changes.
5. Keep existing history readers until their R2 replacements are implemented and verified.
6. Remove or reduce old history tables only after the corresponding UI/API has a working R2 reader.
7. A production behavior is not considered verified until it is actually checked in production.

## Current transition

### Implemented in this phase

In addition to lightweight identity history, Player History and Ranking History now have an R2 dual-archive bridge. Existing D1 history writes/readers remain active, so this phase does not reduce D1 usage yet. The R2 archive is intentionally non-fatal: an R2 archive failure does not break the existing D1 path.

player_identity_history is a lightweight D1 identity timeline.

A row is created:
- on the first observed player name;
- when the player name changes.

A row is not written when the same name is observed again.

This makes name history useful to humans without turning every Player observation into another D1 write.

The identity key remains governor_id. Users do not need to remember that ID to understand the history; the UI exposes the historical names.

### Intentionally not changed yet

The following D1 history paths remain in place during migration:

- player_snapshots
- ranking_snapshots
- player_rank_snapshots
- api_observations

They are still required by existing history/API behavior. Removing them before R2 readers exist would risk breaking current functionality.

## Target architecture

MightPulse
→ Observation / Diff Engine
→
├─ D1 Current / Change / Identity
└─ R2 History
   → Google Drive (future permanent archive)
   → Google Sheets (future research/index/export)

## Migration order

1. Add lightweight D1 identity/change state.
2. Add R2 history writers/readers behind stable interfaces. (Direct dual-archive writers are now in place for Player History and Ranking History.)
3. Move Player History reads from player_snapshots to R2.
4. Move Ranking History reads from ranking_snapshots to R2.
5. Move Player Ranking History reads from player_rank_snapshots to R2.
6. Move raw API observation archive to R2 where appropriate.
7. Measure D1 rows read/written again under equivalent watchlist workloads.
8. Only after the replacement paths are verified, reduce D1 history writes/retention.
9. Add Google Drive as the permanent archive sink.
10. Add Google Sheets as research/index/export tooling.

## Safety rule

No phase may remove a D1 write or table solely because R2/Drive is planned.

The replacement reader/writer must exist, be exercised, and preserve the existing user-visible behavior first.

## 永久保管・アーカイブの大前提（2026-09-29確定）

EagleEyeの履歴データは、D1に永久保存しない。D1はアプリケーションが高速に参照するための運用DBとして扱い、長期履歴はアーカイブ層へ移す。

### 保存階層

| 層 | 役割 | 方針 |
|---|---|---|
| D1 | 現行データ・直近履歴の高速参照 | テーブルごとのRetention期間を設定し、古い行を削除 |
| R2 | アーカイブ中継・障害復旧用バックアップ | Google Driveへの転送が成功するまで保持し、成功後も一定期間保持 |
| Google Drive | 長期・永久保管 | サービス開始時からの履歴を原則永久保存 |

### 永久保管の原則

- **Google Driveを最終的な永久保管先とする。**
- R2はGoogle Driveへ正常に転送されたことを確認するまでの保護層、および一定期間の復旧用バックアップとして使用する。
- R2上のアーカイブを削除するのは、Google Drive側への保存成功を確認した後のみとする。
- Google Driveへの転送失敗・未確認の場合、R2上の対象データを削除してはならない。
- D1からの履歴削除も、まずR2へのアーカイブが正常に完了していることを条件とする。
- サービス開始時からの履歴を失わないことを最優先とし、D1のFree Tier消費を抑えるためにD1から長期履歴を段階的に外部保管へ移す。

### 対象となる監査・ログ履歴

少なくとも以下はサービス開始時からの履歴を永久保管対象とする。

- `login_history`
- `owner_audit_log`

今後、他の履歴テーブルについても同じ原則を適用できるように設計する。

### Google Drive連携時の処理順序

`D1 → R2 → Google Drive` の順序を基本とする。

1. D1のRetention対象行を取得
2. R2へアーカイブ
3. R2保存成功を確認
4. D1から対象行を削除
5. Google DriveへR2アーカイブを転送
6. Google Drive側の保存成功を確認
7. R2は設定されたバックアップ保持期間を経過するまで保持
8. 保持期間経過後にR2上の対象アーカイブを削除可能とする

Google Driveへの転送は冗長化・障害復旧を考慮し、**R2から直接削除することを成功条件にしてはならない**。

