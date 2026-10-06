# EagleEye 引き継ぎ — 2026-10-06 王国Catalog D1/R2移行

## 現在地

対象リポジトリ: `kingshot-bj/kingshot-data-platform`  
ブランチ: `main`

今回の方針:
- 王国CatalogはD1を「検索・一覧用の軽量インデックス」として維持。
- 詳細な王国レスポンスはR2へアーカイブ。
- 既存データを一気に移行・削除せず、**小さいバッチで再開可能な手動バックフィル**にする。
- R2保存成功を確認するまでD1の詳細JSONを消さない。
- Cronで自動バックフィルしない。D1/API負荷を避ける。

## 直近までに実装済み

### 1. Catalog Discovery
`src/kingdom-catalog.js`
- MightPulse `/kingdoms?page=&size=` を1ページずつ取得。
- 1回あたり最大24件。
- 同一ページ内のkidを重複排除。
- 既存kidは更新せず、新規kidだけCatalogへINSERT。
- 5分Cronで1ページずつ継続走査。
- 1サイクル終了後は即page=1へ戻る。
- 24時間停止待ちは廃止。
- 現在の約2,540王国なら概算9時間程度/サイクル。
- 「24時間更新」の意味は「新王国が追加された場合、24時間以内にCatalogへ入ること」と定義。

関連SHA:
- `src/kingdom-catalog.js`: `2fcc845eb8c7103022b08ab708ad773d7aeb38b4`
- `src/kingdom-catalog-scheduler.js`: `20c4c43f9b0633848b5deb7c14bdea67b789fd20`

### 2. D1 Catalog軽量化の準備
Migration:
`migrations/0048_kingdom_catalog_r2_index.sql`

内容:
- `kingdom_catalog.r2_latest_key` 追加
- `idx_kingdom_catalog_r2_latest` 追加

SHA:
`414bad05ed456bdd3a86f97ff18cc236783b2512`

**重要: 0048はまだ本番適用済みではない。**
既存のGitHub Actions migration workflowはworkflow_dispatch式だが、この環境にはdispatch操作がない。
ユーザー側でActionsを手動実行できる。

### 3. R2 Catalog Archive
`src/r2-archive.js`

追加:
`archiveKingdomCatalogSnapshot(bucket, { kid, payload, observedAt })`

保存形式:
`catalog/v1/<kid>/<timestamp>/<uuid>.json.gz`

R2保存後に返されるkeyをD1の`r2_latest_key`へ記録する設計。

SHA:
`f1c00ce208942a1796a564a51d1a43d1adc88082`

### 4. Kingdom Seeder
`src/kingdom-seeder.js`

詳細Kingdom取得成功時:
1. MightPulse詳細payloadをR2へarchive
2. R2保存成功を確認
3. D1 `kingdom_catalog` の検索用項目を更新
4. `raw_json=NULL`
5. `boards_json=NULL`
6. `r2_latest_key` にR2 keyを保存

R2保存失敗時:
- D1の詳細JSONを削除/更新しない。
- 安全側に倒す。

SHA:
`1ccb6ec9f583d96041e24b8fe383d931816fc794`

**ただし0048未適用の本番でSeederを実行すると`r2_latest_key`列がないため更新SQLが失敗する。**
したがって0048本番適用を先に行うこと。

### 5. Data Coverage UI
`src/admin-data-coverage.js`
- 「Catalog登録王国」等の表現を整理。
- 「把握済み王国」はCatalog存在数。
- 「取得済み王国」は実際に完全収集成功した王国。
- Catalog DiscoveryとCollection Coverageを混同しない。

## これから行う作業

### 最優先: 既存Catalog詳細JSONのR2バックフィル

対象:
`kingdom_catalog` に既に存在する古い行の
- `raw_json`
- `boards_json`

をR2へ退避し、R2保存成功後のみD1詳細JSONをNULL化する。

安全条件:
- 1バッチは小さくする（推奨10件程度）。
- `kid`昇順カーソル方式。
- 毎回全件SCANしない。
- R2成功前にD1を変更しない。
- 途中失敗しても次回から再開できる。
- 完了後もD1の検索用項目は残す。
- 自動Cronでは実行しない。
- Owner専用の手動操作にする。
- 実行状況をSystem Event / Diagnosticsで確認可能にする。

想定SELECT:
```sql
SELECT kid,name,status,region,language,
       raw_json,boards_json,
       source_observed_at,last_seen_at,updated_at
FROM kingdom_catalog
WHERE kid > ?
  AND (raw_json IS NOT NULL OR boards_json IS NOT NULL)
ORDER BY kid ASC
LIMIT ?
```

移行状態テーブル案:
`kingdom_catalog_r2_migration`

保持する状態:
- migration_key
- last_kid
- state
- batches_run
- rows_archived
- last_batch_count
- last_batch_at
- last_success_at
- last_error
- updated_at

### 0049について
現在、`migrations/0049_kingdom_catalog_r2_backfill.sql` を作成しようとしたが、GitHub update_fileは新規ファイルなので失敗した。
**0049はまだGitHubに作成されていない。**
次スレではcreate_fileを使って作成すること。

予定SQL:
```sql
CREATE TABLE IF NOT EXISTS kingdom_catalog_r2_migration (
  migration_key TEXT PRIMARY KEY,
  last_kid INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'IDLE'
    CHECK (state IN ('IDLE','RUNNING','PAUSED','FAILED','COMPLETE')),
  batches_run INTEGER NOT NULL DEFAULT 0,
  rows_archived INTEGER NOT NULL DEFAULT 0,
  last_batch_count INTEGER NOT NULL DEFAULT 0,
  last_batch_at INTEGER,
  last_success_at INTEGER,
  last_error TEXT,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO kingdom_catalog_r2_migration (
  migration_key,last_kid,state,batches_run,rows_archived,
  last_batch_count,last_batch_at,last_success_at,last_error,updated_at
) VALUES (
  'KINGDOM_CATALOG_R2_BACKFILL',0,'IDLE',0,0,0,NULL,NULL,NULL,
  strftime('%s','now')
);

CREATE INDEX IF NOT EXISTS idx_kingdom_catalog_r2_backfill_cursor
  ON kingdom_catalog(kid,r2_latest_key);
```

## 絶対に守ること

- 0048を本番適用するまで、Seederを本番で新規実行しない。
- 既存`raw_json`/`boards_json`を一括DELETEしない。
- R2保存失敗時にD1詳細データをNULL化しない。
- D1全件取得でバックフィルしない。
- Catalog Discoveryの5分Cronにバックフィル処理を混ぜない。
- API Poolのlease/returnロジックを変更しない。
- `ranking_snapshots` の広範囲読み取りを復活させない。
- Preview環境が現在本番D1/R2を共有している問題は未解決。Previewで破壊的処理を実行しない。

## 関連既存コミット

- Change Event複合Index: `4e04f16ceff1574dd93f966490d481fbc7882396`
- Load Test検証/Change Event内訳/elapsed修正:
  - `7c5df21719c1dff0c7e8f262df2a76d0ac8407cf`
  - `a3fbd1fafc2dbf5fcc25363d8af216f746ed9624`
  - `7247c8439953c26920643206124fba0759ce92f2`
  - `f9bbf426ee34e0e91a11d38038e5610ab3107455`
- Collection Stats:
  - migration 0046
  - backfill 0047: `950bf75ed904221d8c6978ce109ff41aff4b2cf7`
- Catalog pagination:
  - `5844c08b7d18d2926becaffac69ee551fa899b9e`
  - `e25b06b9f01c5c45cf399af3298ebac06f819c79`
- Catalogをユーザーホームへ:
  - `9ba071fa3ed08eade92721f12b14432854cac50b`
- 「把握済み王国」表記:
  - `bb20087024b4028fa92a7588173f384d60dcac4c`
- Catalog/R2方針UI:
  - `ecf1d938d16efe6a1f4c43ac831c7da8dbc397a`

## 現在の判断

ここまでのD1/R2設計変更は本番データを削除しない安全な準備段階。
次スレでは、
1. 0048本番適用確認
2. 0049作成・適用
3. Owner専用の小バッチR2バックフィル実装
4. System Status/JSONで進捗確認
5. 実機で1バッチ検証
の順で進める。
