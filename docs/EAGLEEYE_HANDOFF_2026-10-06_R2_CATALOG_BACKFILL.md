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

**重要: GitHub上では0048定義済み。Cloudflare本番D1への適用有無はGitHubだけでは確認できないため、Actions/本番D1の `d1_migrations` 確認が必要。**
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
**更新:** 0049は既にGitHubへ作成済み。
- Migration: `migrations/0049_kingdom_catalog_r2_backfill.sql`
- 作成コミット: `c98311057ba69e5f199bad3e9df76e731e97f4c5`
- 内容: 再開可能なバックフィル状態テーブル＋カーソル用Index
- 本番D1への適用有無は未確認。0048と合わせて本番 `d1_migrations` を確認すること。

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
ただし、次の実装は既に先行しているため、作業順を更新する。

### 現在確認できた実装済み
1. 0048 Migration定義済み
2. 0049 Migration定義済み
3. `src/kingdom-catalog-r2-backfill.js` 実装済み（最大10件、kidカーソル、R2成功後のみD1 NULL化）
4. `POST /api/admin/kingdom-catalog-r2-backfill` 実装済み、`requireOwner` によりOwner専用
5. System Event / Diagnosticへのバックフィル実行結果記録実装済み
6. System Statusへ `kingdomCatalogR2Backfill` 状態を追加済み（コミット: `279ec8577d8db446665b24c9c1e9a055f6a3bcb6`）

### 次に実施する順序
1. **0048本番適用確認** — 本番D1の `d1_migrations` と `kingdom_catalog.r2_latest_key` を確認
2. **0049本番適用確認** — 本番D1の `d1_migrations` と `kingdom_catalog_r2_migration` を確認。未適用ならActionsから適用
3. **Worker本番デプロイ確認** — Status/APIの最新コードが本番に反映されていることを確認
4. **Owner専用・小バッチR2バックフィル** — 1バッチ最大10件
5. **System Status / JSONで進捗確認** — state / last_kid / batches_run / rows_archived / last_error 等
6. **実機で1バッチ検証** — R2 key生成、D1 raw_json/boards_json NULL化、検索用項目維持を確認

**重要:** 0048/0049の「GitHubに存在すること」と「本番D1に適用済みであること」は別。ここを混同しない。


## 2026-10-06 Owner UI追加
- Owner専用ページ: `/owner/kingdom-catalog-r2-backfill`
- OWNER CONTROLから「王国Catalog R2バックフィル」で遷移可能。
- GET `/api/admin/kingdom-catalog-r2-backfill` でバックフィル状態を取得。
- POSTは従来どおり最大10件。ページから10件実行・状態更新が可能。
- R2保存成功後のみD1詳細JSONをNULL化する既存安全条件を維持。
- UI追加コミット:
  - `f358932bf98ccd98fb6e83d1b18642b1aefccb1`
  - `c926c4139c2e9d57c8a8baa5e5b349c3f7bf313d`
- 次段階: 本番Workerへ最新コードをデプロイ後、Owner UIから10件だけ実機検証する。


## 2026-10-06 操作フロー簡略化
- R2バックフィルは「10件実行」1操作で、実行直後に自動検証する方式へ変更。
- 自動検証内容: R2オブジェクト存在、D1 r2_latest_key、raw_json NULL、boards_json NULL、不整合件数。
- 「直近10件を検証」単独ボタンは廃止。
- 次回以降は同じ「10件バックフィル実行」を押すだけで、処理→検証結果表示まで完結。
- 実装コミット:
  - `0f3252faff5827630fc3f40d610c39f05798b99b`
  - `cbc2aec991a2c32c05157c634e01bd91e91da56b`


## 2026-10-06 バッチ件数選択
- Owner画面で1回のバックフィル件数を選択可能に変更。
- 選択肢: 10 / 25 / 50 / 100件。
- 初期選択: 50件。
- API側上限: 100件。
- 実行後の自動検証は選択件数に対して実施。
- UI/APIコミット:
  - `12159c88b2fe37434cd04007fae79503587f22b4`
  - `c6632f823a74b2cd4eaf0316dc6ad4f77784b3db`


## 2026-10-06 バッチ上限・自動検証修正
- 原因: UI/APIは100件選択を受け付けていたが、`kingdom-catalog-r2-backfill.js` の内部 `MAX_BATCH_SIZE` が10のままで、実処理が常に10件に制限されていた。
- 修正: 内部上限を100件へ変更。
- 自動検証も固定10件から、実際に処理したバッチ件数を検証する方式へ変更。
- API側のOwnerバックフィル上限も100件へ統一。
- 修正コミット:
  - `10acb11d5edb193a63fd1b281cfd0baef9441c82`
  - `87d1e92e627dd6cd680026dccf194116a61e0651`
  - `a7cbe39811928e4b6250a6cd8361ba0407f31f3a`


## 2026-10-06 結果表示改善
- バックフィル結果を生JSON中心から成功/不合格の一目判定UIへ変更。
- 成功条件: R2 / D1ポインタ / raw_json NULL / boards_json NULL が全件OKかつ不整合0。
- 成功時は「🟢 バックフィル成功」、失敗時は「🔴 バックフィル不合格」。
- 件数・各検証項目・不整合・次回KIDを簡潔に表示。
- 生JSONは「詳細ログ」に折りたたみ。
- コミット: `e0266dcec160217d8d1220b48cbe28127201f14e`


## 2026-10-06 全件バックフィル一括実行
- Owner画面の操作を「全件バックフィル開始」1回に簡略化。
- 内部では既存の安全な100件バッチを1回ずつ自動POSTして継続。
- 各バッチ完了後に自動的に次バッチへ進み、対象0件で停止。
- 各バッチのR2保存→D1 NULL化→検証という安全条件は維持。
- 途中で検証不合格/処理エラーになった場合は自動継続せず停止。
- UI上の進捗表示と組み合わせ、ユーザーは連打・手動更新不要。
- コミット:
  - `262ddbc33f4618191af59b65196b3dfade726e9d`
  - `835e5894afa7a6124eb7fc3ad6f3449757a02d18`
  - `c83f15e2a9893ea354bd820fb9943a927985b622`


### 2026-10-06 一括実行停止原因の修正
- 一括バックフィルが `1130/2528` で停止した事象を確認。
- 原因候補となる `kid > last_kid` カーソル条件を撤去。
- 未処理判定は `r2_latest_key IS NULL AND (raw_json IS NOT NULL OR boards_json IS NOT NULL)` のみを使用。
- これにより途中でKID条件により対象を取りこぼして終了することを防止。
- 0件取得時は残件数を再確認し、残件がある場合は `KINGDOM_CATALOG_R2_BACKFILL_STALLED_REMAINING` で失敗扱いにする。
- 検証不合格時は自動継続しない。
- 修正コミット:
  - `9167f4258666338070c6950fe3ab81ef4e9336f3`
  - `fa1455d48ffc264710597cf390bf8e943d514c0e`
  - `60e372ac66c69681a93b4ccac2e900fb883247a3`


## 2026-10-06 負荷テストからKingdom Catalog詳細を取得する方針へ変更
- 確認結果、既存の「王国Watchlist実処理負荷テスト」はランキング26ボード＋上位プレイヤー取得までで、`kingdom_catalog` の詳細取得は実装されていなかった。
- 一方、通常の `kingdom-seeder` は `/kingdoms/:kid?include=boards&limit=100` を取得し、R2へCatalog詳細を保存してD1 indexを更新する既存実装を持っている。
- 今後の負荷テストでは、各王国Watchlist Job完了後に同じCatalog詳細取得を追加する。
- 取得フロー:
  1. `/kingdoms/:kid?include=boards&limit=100` をMightPulse API Pool経由で取得
  2. R2へCatalog詳細JSONを保存
  3. `kingdom_catalog` の検索用indexをINSERT/UPDATE
  4. `r2_latest_key` を最新R2オブジェクトへ更新
  5. 詳細JSONはD1へ戻さず、R2を詳細データの保存先とする
- Load Test API limiterをCatalog取得にも適用し、既存のAPI同時処理上限を逸脱しない。
- System Eventへ `service=kingdom_catalog / operation=CATALOG_CAPTURE / feature=owner_kingdom_load_test` を記録するため、System JSONからRun単位で確認可能。
- Catalog取得失敗時はその王国Jobを成功扱いにせず、Load Test側の失敗として扱う。
- 実装コミット: `02144d5f60ff356e92056384d8f9f01d3ce564ac`
- これにより、今後の負荷テスト自体が「Watchlist実処理＋Catalog詳細取得」の実処理負荷試験を兼ねる。


## 2026-10-06 Catalog保存責務の共通化
- 王国Catalogの詳細保存処理を `src/kingdom-catalog-store.js` に集約。
- 共通処理は「R2へ完全payload保存 → R2 key確定 → D1の軽量index更新」の順序を保証する。
- `src/kingdom-seeder.js` と `src/admin-kingdom-load-test.js` は共通保存層を利用するよう変更。
- これにより通常Seederと負荷テストで保存仕様が分岐せず、D1へ詳細JSONを戻さない方針を一貫して維持。
- API取得自体は既存の `collectMightPulseThroughGuards` を継続利用し、API Pool lease/returnやGlobal Semaphoreの責務は変更していない。
- 主要コミット:
  - `dd37bc1a83cee32a1d00c56b64826e492dc0d590` 共通Catalog保存層追加
  - `84bc72c6d0ed097ec57da0d48be1328ba45aee17` Seeder接続
  - `a1bcc4ed45d95ddbfb575ff1ede47471d13c3b0f` 負荷テスト接続

### 現在の責務分離
- Kingdom Catalog: `kingdom_catalog` = 軽量検索/current index、詳細 = R2
- Player: `players` = current index、詳細/履歴 = 既存player store + R2
- Ranking: `kingdom_ranking_current` = current ranking、履歴 = R2/D1互換履歴
- API取得: `collectMightPulseThroughGuards` = 共通取得ガード
- System観測: System Event / Diagnostics = 実行状況・失敗原因の観測
- 新しい冗長な `player_catalog` / `ranking_catalog` テーブルは追加しない。


## 2026-10-06 Alliance Catalog R2化
- 横断監査で `alliance_catalog.raw_json` が詳細payloadをD1へ保持し続けていることを確認。
- Kingdom Catalogと同じ方針へ統一し、Alliance CatalogもD1を軽量current index、詳細payloadをR2とする。
- Migration `0050_alliance_catalog_r2_index.sql` を追加し、`alliance_catalog.r2_latest_key` とIndexを追加。
- `src/alliance-catalog.js` を修正:
  - Alliance詳細取得後、先にR2へ保存。
  - R2 key取得成功後のみD1 current indexを更新。
  - `raw_json` はNULL化。
  - R2保存失敗時はD1 current indexを詳細payload付きで更新しない。
  - 既存のD1緊急履歴バッファはR2障害時の履歴退避として維持。
- これにより今後のAlliance取得も「API → R2詳細 → D1軽量index」に統一。
- 既存の `alliance_catalog.raw_json` はまだバックフィル対象として残るため、Kingdom Catalog R2バックフィル完了後に同様の安全なAllianceバックフィルを実施する。
- 主なコミット:
  - Migration: `0050_alliance_catalog_r2_index.sql`
  - Code: `a74631ef6ef8ef4014bb9b4e6e66ab96805cccf4`

## 2026-10-06 Player R2 latest pointer
- Player側もKingdom / Allianceと同じ「current index + R2 detail/history」構成へ統一。
- migrations/0051_players_r2_index.sql を追加し、players.r2_latest_key と idx_players_r2_latest を追加。
- src/player-store.js のR2保存処理で archivePlayerHistoryBatch() の返却keyを受け取り、R2保存成功後に players.r2_latest_key を更新。
- R2保存に失敗した場合は既存のEmergency Buffer経路を維持し、既存の r2_latest_key を上書きしない。
- Player詳細履歴は引き続きR2を優先し、player_snapshots は互換/フォールバック履歴として維持。
- players に新しい player_catalog は作らない。既存 players がPlayer current indexの責務を持つ。
- PR #5でmainへマージ済み。Merge commit: dfcb27847d9e9c7c46c1c5de172831c3284840fb

## 2026-10-06 API Observation / legacy detail整理
- api_observations は単なるCatalog/current detail tableではなく、API取得の観測・監査台帳として利用されているため、現時点では payload_json を即時削除しない。
- Player取得では saveApiObservation() → materializePlayer() の順で観測IDを発行し、Player current/historyと紐付けている。
- getLatestPlayerObservation() はD1 api_observations.payload_json を直接読む互換APIだが、現行のPlayer roller主要経路では最新Player取得元として使っていないため、今後のR2観測移行候補として扱う。
- したがって今回、api_observations のpayloadをNULL化する変更は行わない。先に「監査メタデータ」と「詳細payload」の利用箇所を完全分離してから移行する。
- ranking_snapshots は現行ランキングの取得元に戻さない。最新ランキングは kingdom_ranking_current のみを参照する。
- ranking_snapshots / player_rank_snapshots はR2履歴保存＋D1互換/緊急退避の履歴層として残す。R2_ONLYでは正常時のD1履歴INSERTを行わない既存方針を維持。

## 2026-10-06 現時点のD1/R2責務
1. Kingdom Catalog: D1軽量current/search index + R2詳細
2. Alliance Catalog: D1軽量current/search index + R2詳細
3. Player: D1 current index + R2詳細/履歴 + r2_latest_key
4. Ranking current: kingdom_ranking_current、履歴はR2中心 + D1互換/緊急退避
5. API Observation: 取得監査台帳。詳細payloadは現時点では互換性のためD1保持。将来R2化する場合は利用箇所を分離してから実施

絶対に守ること:
- ranking_snapshots の広範囲読み取りを復活させない。
- R2保存前にcurrent indexのR2 pointerを更新しない。
- player_catalog / ranking_catalog のような冗長テーブルを増やさない。

## 2026-10-06 負荷テスト Catalog取得後の確認事項（次スレ最優先）

### 実施した負荷テスト
- 対象: KID 1〜20
- 上位プレイヤー: 10人
- ユーザー確認では、実行は最終的に20王国すべて成功。
- 途中経過の15/20・成功14/失敗1は実行途中のスナップショットであり、最終結果と混同しない。
- 過去履歴には「成功34 / 失敗1」と表示されており、今回20王国の最終結果と一致しないため、負荷テスト履歴/集計も確認・修正対象。

### Catalog取得処理
- 負荷テストにはCatalog詳細取得処理が実装済み。
- Watchlist Job完了後に `/kingdoms/:kid?include=boards&limit=100` を取得し、saveKingdomCatalogObservation() を通してR2へ保存、その後D1 kingdom_catalog の軽量indexを更新する。
- 実装コミット: 02144d5f60ff356e92056384d8f9f01d3ce564ac / dd37bc1a83cee32a1d00c56b64826e492dc0d590 / 84bc72c6d0ed097ec57da0d48be1328ba45aee17 / a1bcc4ed45d95ddbfb575ff1ede47471d13c3b0f
- Catalog保存はR2保存成功後にD1 indexを更新する。

### 現在判明しているUI上の問題
- 負荷テスト後、/kingdom-catalog でKID 1〜20を確認したところ、王国1〜3等が「名称未取得」、王国4は「Kraaa-pocalypse」と表示された。
- 次スレで今回Runの最終DB状態とR2実体を確認し、Catalog取得済みデータが実際に利用可能かを確定する。
- 最優先確認: kingdom_watchlist_jobs 20件の最終status、system_event_log の CATALOG_CAPTURE 成否、KID 1〜20の kingdom_catalog.r2_latest_key、各R2 objectの実在とpayload、payload内name階層、D1 nameが空になる理由、履歴の「成功34 / 失敗1」の集計元。
- src/kingdom-catalog-store.js は現在 payload.name ?? payload.kingdom_name のみをD1 nameへ入れるため、実APIレスポンスのname階層が異なる場合は原因候補。ただし推測で修正せず実データ確認後に修正する。

### 負荷テスト進捗パッチ
- src/admin-kingdom-load-test.js にCatalogを含めたクエスト総数・進捗表示の修正を適用。コミット: 8206e61f38c0646de781a9327c5150440fa1da9a
- このコミットは主にUI/Status側の進捗計算を補正したもので、Job statusをCATALOGフェーズとして永続化する本格的な完了判定修正は未完了。
- 現コードはWatchlist JobがCOMPLETEDになった後にCatalog取得を行うため、Catalog処理中にStatus/履歴側から完了と見える窓がある。
- 本格修正時はCATALOGを明示的な非終端フェーズとして扱い、runKingdomWatchlistLoad、Status API、Queue完了判定、History/System JSONを横断して整合させる。既存status利用箇所を先に全検索する。

### 注意
- さきほどの会話で「成功14王国」と扱った説明は途中経過と最終結果を混同した誤り。次スレではユーザー確認済みの最終20/20成功を前提に調査する。
- 対象はKID 1〜20。1500番台ではない。
