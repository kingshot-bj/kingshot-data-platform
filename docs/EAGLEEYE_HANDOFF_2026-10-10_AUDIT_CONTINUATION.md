# EagleEye 本体・全機能監査 引き継ぎ — 2026-10-10

## 1. この引き継ぎの目的

次スレッドで、EagleEye本体の全機能棚卸し・静的コード監査を中断地点から再開するための作業指示書。監査はまだ完了していない。最初からやり直さず、機能台帳の既存記録を読み、未完了領域を続けること。

- Repository: `kingshot-bj/kingshot-data-platform`
- Branch: `main`
- 機能台帳（最優先で読む）: [EAGLEEYE_COMPLETE_FEATURE_INVENTORY_2026-10-10.md](./EAGLEEYE_COMPLETE_FEATURE_INVENTORY_2026-10-10.md)
- 機能台帳URL: https://github.com/kingshot-bj/kingshot-data-platform/blob/main/docs/EAGLEEYE_COMPLETE_FEATURE_INVENTORY_2026-10-10.md
- 本引き継ぎURL: https://github.com/kingshot-bj/kingshot-data-platform/blob/main/docs/EAGLEEYE_HANDOFF_2026-10-10_AUDIT_CONTINUATION.md
- 直近の台帳更新コミット: `c42afdd203255790613c866ee0d2bcb53967e29b`

## 2. 進捗と報告ルール

### 現在の進捗

機能台帳のチェックリスト方式では **6/9項目 = 66.7%（表示67%）**。これはチェックリスト項目の完了割合であり、全機能の実装率・正常率・本番適用率ではない。台帳内に残る過去の重み付き概算44%などとは算定方法が異なるため、直接比較しない。

完了済みの初期チェック:
- [x] `src/`全ファイル名と責務の初期分類
- [x] `src/index.js`の完全一致ルートと特殊prefix/callback/fallback
- [x] `migrations/`全ファイル名と0008番号重複
- [x] `wrangler.jsonc`の主要binding/Cron/Queue/Preview差分
- [x] Workflow・スクリプト・公開アセット一覧
- [x] ルート呼び出し名・import・対象モジュールのexportを静的照合（候補を台帳化。実行時確認は未実施）

未完了の4項目:
- [ ] 全Migrationのテーブル/列/制約/Indexと現行SQLの双方向照合完了
- [ ] 全画面のUI機能、ボタン、フォーム、API呼び出し、権限、空/失敗状態の棚卸し完了
- [ ] 実装あり/未接続/重複/未実装/仕様未確定を機能ごとに確定
- [ ] テスト可能性と本番E2E確認項目を機能ごとに定義

### 10%ずつ進める約束

ユーザーの指示は「10パーセントずつやって、10パーセント終わったら教えて」。監査を継続し、次の進捗報告の目標は**現在67%から約77%相当**。未完了のチェック項目を完了したと見せかけて率を上げないこと。進捗が10ポイント進んだら、その時点でユーザーに報告する。進捗率を報告する際は、チェックリストの分子/分母、今回完了した作業、未完了事項を明示する。

## 3. 次に実施する監査

優先順位1: **Migrationと現行SQLの双方向照合を継続する。**

1. `migrations/`の全ファイルを番号だけでなくファイル名単位で並べる。番号0008の重複に注意。
2. Migration 0001から最新まで、CREATE/ALTER/DROP、テーブル再構築、列追加/削除/改名、UNIQUE/CHECK/FOREIGN KEY、Index、データ移行を追い、各テーブルの最終スキーマを作る。
3. `src/`全体のSQL文字列・SQL helperについてSELECT/INSERT/UPDATE/DELETEの列、JOIN、WHERE、ORDER BY、UPSERT条件と最終スキーマを照合する。
4. DDLがリクエスト中に実行される箇所（特に `src/user-player-link.js` の `ensureSchema()`）をMigrationとの二重管理として確認する。
5. Indexの存在だけでD1読み取り削減を断定しない。実Query Planや本番Insightsを見ていない場合は未確認と明記する。
6. 確認済み所見を台帳へ追記し、根拠・影響候補・確度・未確認事項・修正前に必要な確認を記載する。

優先順位2: 全画面のUI操作→API→認可→DB/R2→成功/失敗表示の対応表を完成させる。特にmethod、role guard、ACTIVE/DISABLED状態、空データ、APIエラー、二重押し、外部サービス失敗、Retention後の読み戻しを確認する。

優先順位3: 機能ごとの状態分類とテスト行列を確定する。ソースに関数が存在することと、実際に起動・接続されること、正常動作することを混同しない。

## 4. 既知の要確認事項 — 重複調査を避けて継続

### Migration / SQL / schema
- `getLatestAdminKingdomRankingSnapshot()` が `kingdom_ranking_current.ranking_snapshot_id` をSELECTしている一方、Migration 0019のテーブル定義に列が見当たらない。Admin Ranking表示/refreshやGoogle Sheets exportへの影響候補。静的照合のみ。
- Migration 0008の `kingdom_watchlist_jobs` 定義とMigration 0019の `CREATE TABLE IF NOT EXISTS` 定義に `source_first_at` / `source_last_at` の差がある。後続ALTERの有無と現行SQLを追う。実D1状態は未確認。
- `src/user-player-link.js` の `ensureSchema()` が実行時DDLを行う。Migration 0022/0023/0026との関係と、リクエスト時に実行される条件を確認する。
- `scripts/reconcile-d1-schema.mjs` のrequired migration listは0043までで、現行0044–0058全体のschema一致を保証しない。Production script/workflowは実行しない。
- Migrationファイルは59件、0008番号重複あり。番号の大小だけで実際の適用順・本番適用済み状態を断定しない。

### Route / handler接続
- `/api/player-compare` が呼ぶ `handlePlayerCompareApi` は `src/index.js`で定義/importが見当たらず、`src/player-compare.js`にもhandler exportが見当たらない。
- `/player/compare` が呼ぶ `renderPlayerComparePage` は定義/importが見当たらず、`src/player-compare.js`にもpage exportが見当たらない。
- `handleOwnerKingdomLoadTestExportApi` とUI上の `/api/owner/kingdom-load-test/export?run_id=` URLがあるが、`src/index.js`にimport/router分岐が見当たらない。handler接続を検討する場合はOWNER認可が必要。修正・接続はしない。

### データ保持・読み戻し
- `/api/player/history` は `getPlayerHistory()` 経由でD1/R2を読む一方、`/player/history`は `player_snapshots` をD1から直接読む。Retention後に画面/API結果が異なる可能性。
- `change_events`はR2 archive対象だが専用R2 readbackが見当たらず、Player/Kingdom ChangesはD1直接参照のように見える。Retention後の古いイベント表示は未確認。
- `runDataRetentionJob`、Seeder、Kingdom Ranking Roller、Alliance Roller、Player Roller、history emergency buffer排出などは、Workerイベント入口からの起動が見当たらない候補。実行されていると断定しない。

### 権限・副作用・運用
- `/admin/player-visibility`の画面はADMINを許可する一方、`/api/admin/player-visibility`はOWNER guardに見える。仕様上の権限境界を確認する。
- `/api/admin/kingdom-rankings?refresh=1`はGETで外部API取得・順位差分計算・D1保存を行う候補。副作用を実行して確認しない。
- Safety GateでCloudflare metrics欠損の`null`が0扱いになりNORMAL判定へ落ちる可能性。
- Preview設定はProductionと同じD1 database ID/R2 bucketを指定している。PreviewのQueue namespace/consumer分離は未確認で、Previewから副作用処理を起動しない。
- `GOOGLE_DRIVE_OAUTH_REDIRECT_URI` とGoogle Drive callback routeの不一致候補。実OAuthを実行しない。
- R2 binding名 `R2_ARCHIVE` とWranglerの `ARCHIVE` の参照差候補。環境設定を実行変更せず、静的照合で確かめる。

上記は既存台帳に根拠や詳細がある。ここでは要約のみ。必ず機能台帳内の該当節を読んでから追跡し、同じ候補を別名で重複登録しないこと。

## 5. 絶対に守る制約

- **D1 Freeの読み取り量を最優先する。**
- **広範囲な `ranking_snapshots` 取得クエリを絶対に復活させない。**
- ユーザーの明示許可がない限り、アプリコード、Migration、Workflowを変更しない。
- デプロイ、本番D1更新、Queue操作、収集ジョブ、ロードテスト、外部API呼び出しを行わない。
- 本番Migration履歴/Cloudflare実設定を取得済みのように表現しない。
- Secret、APIキー、Cookieなどの機密値を記録しない。
- ビルド/HTTP/E2Eを実行していない場合は「静的監査のみ」と明記する。
- 発見した候補を確定バグと言い切らず、再現確認の有無と確度を分ける。

## 6. 台帳更新と作業報告

各まとまりの作業後に `docs/EAGLEEYE_COMPLETE_FEATURE_INVENTORY_2026-10-10.md` を更新する。根拠、影響、確度、未確認事項、次に必要な確認を残す。次スレ終了時には本引き継ぎも追記・更新し、台帳と引き継ぎの進捗率を一致させる。

ユーザーへは10ポイント相当の進捗に達した時点で報告する。報告内容:
- 現在の進捗率と算定方式
- 今回完了したまとまり
- 新しく見つけた重要候補
- 未完了項目
- 次の監査対象
- コード変更/本番操作を行っていないこと

## 7. 次スレに貼り付ける開始文

以下をそのまま次スレに貼り付ける。

> EagleEye本体の全機能監査を続行してください。まず次の2ファイルをGitHub mainから読み、内容を確認してください。
>
> 1. `docs/EAGLEEYE_HANDOFF_2026-10-10_AUDIT_CONTINUATION.md`
> 2. `docs/EAGLEEYE_COMPLETE_FEATURE_INVENTORY_2026-10-10.md`
>
> 進捗はチェックリスト方式で現在67%（6/9項目）。ユーザー指示により10ポイントずつ進め、次は約77%相当まで実作業を進めてから報告してください。最初の作業はMigration 0001–最新のDDLとsrc全体のSQL列/制約/Indexの双方向照合です。既存の不一致候補を重複登録せず、ファイル名単位で確認してください。
>
> アプリコード/Migration/Workflow修正、デプロイ、本番D1更新、Queue操作、収集/負荷テスト、外部API実行は禁止です。D1 Free readsを最優先し、広範囲 `ranking_snapshots` 取得を絶対に復活させないでください。静的確認と実行時確認を区別し、根拠・影響候補・確度・未確認事項を機能台帳へ追記してください。10ポイント進んだ時点で、進捗率と完了内容をユーザーに報告してください。


## 2026-10-10 継続監査セッション追記（途中経過）

- 参照ファイルをGitHub `main` から再読込し、既存の67%チェックリスト地点から監査を継続した。最初からやり直していない。
- 機能台帳に追加証拠を追記し、コミット `0611e7cc1d612e80f49125403cf009859ebccec0` で保存した。
- 追加確認した静的根拠:
  1. `src/index.js:getLatestAdminKingdomRankingSnapshot()` は `kingdom_ranking_current.ranking_snapshot_id` をSELECTする。
  2. Migration 0019と `scripts/reconcile-d1-schema.mjs` の同テーブルCREATE定義には当該列がない。列不一致候補は強く支持されるが、本番実スキーマと実行時エラーは未確認。
  3. Migration 0008の `kingdom_watchlist_jobs` 定義には `source_first_at/source_last_at` がなく、Migration 0019にはある。`CREATE TABLE IF NOT EXISTS` は既存テーブルへ列を追加しない。schema reconcile scriptにも同テーブルのCREATE定義はあるが、該当2列を既存テーブルへADD COLUMNする処理は確認できていない。現行SQL側の参照箇所と全Migration中のALTERを引き続き検索する。
  4. `src/user-player-link.js` の `ensureSchema()` はリクエスト処理から呼ばれ、CREATE TABLE/INDEXを実行する。Migration 0022とschema reconcile scriptにも同モデルの定義/Index管理があり、三重管理の完全な同値性と実行コストは未確認。
- 進捗は引き続き **6/9 = 67%**。今回の作業は未完了のMigration/SQL双方向照合項目の途中であり、10ポイント相当の到達条件を満たしていないため、率は上げていない。
- 次の作業: 0001–0058全Migrationとsrc全体のSQLについて、既存の不一致候補を重複起票せずに列参照・DDL・Indexを照合する。次に `kingdom_watchlist_jobs` の両列の現行参照とALTER履歴、`user_player_links` の0022/0024/0026の列・CHECK・partial unique indexをファイル単位で確認する。
- 実行制約は継続: コード/Migration/Workflow変更、デプロイ、本番D1更新、Queue操作、収集/負荷テスト、外部API呼び出しなし。D1 Free reads最優先。広範囲 `ranking_snapshots` 取得クエリを復活させない。


### 追加追跡結果（source_first_at/source_last_at と user_player_links）

- `src/index.js` で `kingdom_watchlist_jobs.source_first_at/source_last_at` のINSERT/UPDATE/SELECTが複数確認できた。Watchlistの進捗/完了表示にも使われる。
- `scripts/reconcile-d1-schema.mjs` は両列を含むCREATE TABLE定義を持つが、既存テーブルへ列追加する `addColumn()` は当該2列について見つからなかった。後続Migration 0020–0058を確認してALTERの有無を確定すること。列不一致候補は現行SQL参照まで根拠が増えたが、本番D1の状態は未確認。
- `user_player_links` は0022初期形状、0023の公式確認列/サポート申請、0024のpartial UNIQUE、0026の複数アカウント対応再構築を順序込みで確認。0022の `UNIQUE(user_id)` は0026最終形状では外れるため、0022単体との比較で不一致と誤判定しない。
- 台帳をコミット `8a69d7d2ba5681411aa1a6445261532049fc5982` で更新した。
- 進捗は引き続き **67%（6/9）**。Migration/SQLの全件双方向照合は未完了であり、77%報告条件には未到達。

### 2026-10-10 追加監査：Migration横断照合・Reconcile追随範囲

- migrationsディレクトリのSQLファイル59件をファイル名で確認。`0008_*.sql`が2ファイルあるため、Migration番号だけで扱わない。
- `kingdom_watchlist_jobs.source_first_at/source_last_at` はMigration 0008に存在せず0019に定義あり。0020–0058でこの2列を既存テーブルへADD COLUMNするALTERは見当たらない。0046が同テーブルへ追加する列は`collection_source`。現行src/index.jsが両列をINSERT/UPDATE/SELECTするため、列不一致候補の静的根拠は強い。実D1の列有無は未確認。
- `kingdom_ranking_current.ranking_snapshot_id` は0019の定義に存在せず、0001–0058で同列を同テーブルへ追加するDDLも見当たらない。src/index.jsのAdmin ranking helperがSELECTする。`src/ranking-store.js`の同名列使用は`ranking_snapshots`へのINSERTなので別件であり、不一致候補には含めない。
- `scripts/reconcile-d1-schema.mjs`のMIGRATIONS配列は0017–0043で終わり、0044–0058を含まない。Migration 0058の`user_kingdom_ranking_preferences`はsrc/index.jsからUPSERTされるが、reconcile scriptにテーブル名がない。0053–0057のスキーマ機能にも対応定義が見当たらない。scriptの役割が旧範囲に限定されている可能性があるため、直ちにバグと断定せず呼出元/運用目的を確認する。
- 機能台帳更新コミット: `393db6a3331de2ff4172de079867ad9a95ec8be9`、続くreconcile範囲追記: `b594328ae95ebf89719345e8f6490a412874bbd1`。
- 進捗は引き続き67%（6/9）。Migrationファイルの静的横断は進めたが、src全体の列/Index双方向照合とUI/API/DB接続の棚卸しは未完了。77%へはまだ更新しない。
- 次はreconcile scriptの呼出元/運用説明を静的検索し、`kingdom_ranking_current`を参照する全SQL、DDLとIndexの対応、Migration 0058の読出し/保存経路を追跡する。
- 安全制約を継続。コード/Migration/Workflow変更、デプロイ、本番D1更新、Queue操作、収集/負荷テスト、外部API呼び出しなし。広範囲`ranking_snapshots`取得なし。

### 追加確認：schema reconciliation Workflowの役割

- `.github/workflows/eagleeye-d1-schema-reconciliation.yml` は本番変更前に明示確認を要求し、reconcile scriptの対象0017–0043を検証している。0044–0058が同scriptの配列にないことだけで不具合とは断定しない。
- `.github/workflows/eagleeye-d1-apply-pending-migrations.yml` は別途0053 production drift scriptを呼び、通常Migration適用後に0054–0057の要素を検証する。0053–0057は別経路で扱われることを確認。0058の専用検証は確認できていないが、通常Migration適用対象である想定。本番適用状況は不明。
- `source_first_at/source_last_at` は0008が作成した既存テーブルに0019のCREATE TABLE IF NOT EXISTSでは追加されず、0020–0058にも該当ALTERが見当たらない。新規環境でも列欠落が残る可能性が高いという評価に更新。実D1の状態は未確認。
- 機能台帳の評価更新コミット: `e8dd61693164e3fbbea9c45ccf1adf105831ec2b`。
- Workflow/スクリプトは静的に読むのみ。起動、Cloudflare接続、D1変更は一切行っていない。

### Migration 0058 APIの接続追跡

- `/api/kingdom-rankings/preferences` は `handleKingdomRankingPreferencesApi()` に接続し、認証ユーザーのランキング設定を `user_kingdom_ranking_preferences` にINSERT/UPSERTする。
- `src/index.js` 全文検索では、保存値をSELECTするAPI/UI経路、またはこのAPI URLを呼び出すクライアント側fetchが見つからなかった。保存APIの呼出し/読出しが未接続の可能性を台帳に追加した（確度中、仕様/別ファイル利用は未確認）。
- 台帳更新コミット: `bbb0239060efc2958bdf478ffa749a45412f93b7`。
- 次はUI/JS資産とルート登録の接続を追跡する。静的調査のみ。進捗は67%のまま。
### 0058設定APIのUI接続を追加確認・訂正

- `src/kingdom-portal.js` でランキング設定フォームから `fetch('/api/kingdom-rankings/preferences', {method:'POST', ...})` を呼ぶこと、ランキングページ表示時に `user_kingdom_ranking_preferences` をSELECTすることを確認。
- よって直前の「保存APIのUI呼出し/読出し未接続」候補は取り下げる。静的なUI→API→DB保存→DB読出しの接続はある。ブラウザ実動作・本番Migration状態は未確認。
- 台帳訂正コミット: `8663bb0c1ad51f3c1d70738e8081cad1e267b708`。