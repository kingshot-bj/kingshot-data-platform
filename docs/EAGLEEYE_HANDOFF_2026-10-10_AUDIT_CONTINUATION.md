# EagleEye 本体・全機能監査 引き継ぎ — 2026-10-10

## 1. この引き継ぎの目的

次スレッドで、EagleEye本体の全機能棚卸し・静的コード監査の成果物を引き継ぎ、隔離環境での検証フェーズへ進むための作業指示書。静的監査の成果物は20/20で完成しているが、実機/本番の動作確認は未完了。最初からやり直さず、機能台帳の分類・P0テスト計画から進めること。

- Repository: `kingshot-bj/kingshot-data-platform`
- Branch: `main`
- 機能台帳（最優先で読む）: [EAGLEEYE_COMPLETE_FEATURE_INVENTORY_2026-10-10.md](./EAGLEEYE_COMPLETE_FEATURE_INVENTORY_2026-10-10.md)
- 機能台帳URL: https://github.com/kingshot-bj/kingshot-data-platform/blob/main/docs/EAGLEEYE_COMPLETE_FEATURE_INVENTORY_2026-10-10.md
- 本引き継ぎURL: https://github.com/kingshot-bj/kingshot-data-platform/blob/main/docs/EAGLEEYE_HANDOFF_2026-10-10_AUDIT_CONTINUATION.md
- 最新の台帳更新コミット（100%到達時点）: `1acde2be2796637075ec76bd6970e7417442ebc1`

## 2. 進捗と報告ルール

### 現在の進捗

最新の進捗は末尾の「90%到達時点」を参照。旧10項目チェックリストは、作業量の大きく異なる「全Migration/全SQL照合」と単純な一覧確認が同じ1項目だったため、成果物ベースの20作業パッケージへ詳細化した。最新は **20/20 = 100%（静的監査成果物の完成率）**。これは監査作業の進捗であり、全機能の実装率・正常率・本番適用率ではない。過去の70%報告は当時の10項目基準のチェックポイントとして履歴に残す。

完了済みの初期チェック:
- [x] `src/`全ファイル名と責務の初期分類
- [x] `src/index.js`の完全一致ルートと特殊prefix/callback/fallback
- [x] `migrations/`全ファイル名と0008番号重複
- [x] `wrangler.jsonc`の主要binding/Cron/Queue/Preview差分
- [x] Workflow・スクリプト・公開アセット一覧
- [x] ルート呼び出し名・import・対象モジュールのexportを静的照合（候補を台帳化。実行時確認は未実施）

完了した2項目:
- [x] 実装あり/未接続候補/重複・経路差/仕様未確定/外部検証待ちを機能ごとに分類
- [x] テスト可能性と本番E2E確認項目を機能ごとに定義（実機E2E自体は未実施）

### 10%ずつ進める約束

ユーザーの指示は進捗を10ポイントずつ進め、指定到達点で報告すること。現在は20作業パッケージの20/20 = 100%に到達（静的監査成果物の完成率）。作業パッケージは成果物ベースで定義し、未完了作業を完了扱いにしない。進捗率を報告する際は、チェックリストの分子/分母、今回完了した作業、未完了事項を明示する。

## 3. 次フェーズの作業

静的監査成果物は20/20で完成。次はコード修正ではなく、明示されたテストレーンに沿って検証する。

1. **P0/B1から開始:** build/import/route resolutionと、4件のSQL列不一致候補、Player Compare、Player Visibility、Load Test export routeを確認する。
2. **隔離環境必須:** Migration適用、SQL prepare、D1 fixture、mock provider、R2 fixtureで検証する。本番と同じD1/R2/Queueを使う可能性があるPreviewは、分離が確認できるまで使わない。
3. **本番操作は別承認:** Production D1のread/write、Queue、Retention、収集/負荷テスト、外部API/OAuth/Discord/Google実操作は今回未実施で、静的監査完了によって許可されたことにはならない。
4. 各テストの結果を「未実施/合格/失敗/ブロック/本番確認待ち」に分け、D1 Free readsへの影響と根拠を記録する。広範囲な `ranking_snapshots` 取得クエリは追加・復活させない。

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

> EagleEye本体の全機能監査を続行してください。まず次の2ファイルをGitHub mainから読み、最新内容を確認してください。
>
> 1. `docs/EAGLEEYE_HANDOFF_2026-10-10_AUDIT_CONTINUATION.md`
> 2. `docs/EAGLEEYE_COMPLETE_FEATURE_INVENTORY_2026-10-10.md`
>
> 現在は成果物ベースの20作業パッケージ中16完了で80%。未完了は、全Migrationとsrc全SQLの残り双方向照合、全画面UI→API→認可→DB/R2→成功/失敗表示の棚卸し、全機能の状態分類、機能別テスト/E2E行列です。進捗は実作業が完了した作業パッケージにのみ計上してください。
>
> 最初はパッケージ17の残りスキーマ照合を継続し、既知候補を重複起票しないでください。アプリコード/Migration/Workflow修正、デプロイ、本番D1更新、Queue操作、収集/負荷テスト、外部API実行は禁止です。D1 Free readsを最優先し、広範囲な `ranking_snapshots` 取得を絶対に復活させないでください。静的確認と実行時確認を区別し、根拠・影響・確度・未確認事項を台帳へ追記してください。


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

## 2026-10-10 70%到達時点 — 次回再開用の最新状態

- **現在の進捗: 7/10 = 70%。** ユーザーから「一度70パーセントまでおわったらおしえて」と指示があり、この到達点で報告する。これは監査チェックリストの割合で、機能実装率や本番正常率ではない。
- 旧記録に「6/9」と「未完了4項目」が併記され分母に不整合があったため、作業単位が明確な10項目に整理した。過去の67%記録は履歴として残す。
- 今回完了にした項目: Migration 0022/0023/0024/0026を順序込みで確認し、`user_player_links`最終列/CHECK/Indexと`src/user-player-link.js:ensureSchema()`を静的照合。主要列・制約・6 Indexは一致。サポート申請テーブルは実行時DDLではなくMigration/reconcile経路に依存する。
- 残り: (8) 全Migrationとsrc全SQLの双方向照合、(9) 全画面のUI→API→認可→DB/R2→状態表示棚卸し、(10) 機能状態分類とテスト/E2E行列。
- 重要な未解決候補は継続: `kingdom_ranking_current.ranking_snapshot_id`の列参照差、`kingdom_watchlist_jobs.source_first_at/source_last_at`のMigration差。静的根拠は強いが、実D1 schema/実行時エラーは未確認。
- GitHub mainの静的確認のみ。コード/Migration/Workflow変更、デプロイ、本番D1更新、Queue操作、収集/負荷テスト、外部API呼び出しは行っていない。D1 Free reads優先。広範囲な`ranking_snapshots`取得なし。
- 次回再開時は台帳を先に読み、項目8の残りのテーブル/SQL照合から継続する。全監査完了と誤認しない。


## 2026-10-10 80%到達時点 — 最新の再開地点

- **現在の進捗: 16/20作業パッケージ = 80%。** 旧70%は10項目チェックリスト基準の中間報告。全Migration/全SQL照合のような大きい項目と単純な一覧確認が同じ1点だったため、成果物単位に20項目へ詳細化した。実装率・本番正常率ではない。
- 今回完了した2作業パッケージ:
  1. `kingdom_ranking_current` のMigration 0019 DDL、`src/ranking-store.js`のUPSERT/DELETE、`src/index.js`と`src/kingdom-portal.js`のRead経路を照合。Migration 0001–0058に専用secondary indexのCREATEは見当たらず、PKは(kid, board, target_type, target_id)。`WHERE kid=? AND board=? ORDER BY rank`は索引でrank順まで満たせるか未確認で、Query Plan/実消費量は測っていない。Admin helperの`ranking_snapshot_id`不一致候補は継続。
  2. Player History/Change EventsとRetention/R2 readback経路を照合。`/api/player/history`はD1/R2 merge helperを使うが、`/player/history`はD1の`player_snapshots`を直接読む。Retention後に表示差が出る可能性。Player/Kingdom ChangesはD1直接readで、`change_events`用R2 readback関数が見当たらず、Retentionで削除済みの古いイベントは現行経路から復元できない可能性。
- 継続中の重要候補:
  - `kingdom_ranking_current.ranking_snapshot_id`参照差
  - `kingdom_watchlist_jobs.source_first_at/source_last_at`のMigration差
  - Player History UI/APIのRetention後の読み戻し差
  - Change EventsのR2 archive後のreadback不足候補
  - `kingdom_ranking_current`のrank順Index/Query Plan確認
- 残り4作業パッケージ:
  17. 全Migrationとsrc全SQLの残り全テーブル/列/制約/Indexの完全な双方向照合
  18. 全画面の全操作→API→認可→DB/R2→成功/失敗表示の棚卸し
  19. 全機能の状態分類（実装あり/未接続/重複/未実装/仕様未確定）
  20. 機能別テスト可能性・本番E2E確認行列
- 最新の機能台帳: `docs/EAGLEEYE_COMPLETE_FEATURE_INVENTORY_2026-10-10.md`、更新コミット`54eb2edd3672b20ac3213dc5d275264c3ea4b5a6`。
- 今回はGitHub mainの静的確認のみ。アプリコード/Migration/Workflow変更、デプロイ、本番D1更新、Queue操作、収集/負荷テスト、外部API呼び出しなし。D1 Free reads優先。広範囲な`ranking_snapshots`取得クエリを追加・復活させていない。
- 次回はまず機能台帳を読み、パッケージ17の残りスキーマ照合を続ける。全監査完了とは扱わない。


## 2026-10-10 追加監査 — api_observations / players 列定義差候補

- Migration 0001–0058のファイル名単位の静的確認を続け、以下の新規候補を台帳へ追加した。
  1. `api_observations.source_observed_at`: Migration 0002のCREATE TABLEに存在せず、同列を追加するALTERも見当たらない。一方、`src/api-observations.js` のINSERT、`src/api-raw-inspector.js` と `src/player-store.js` のSELECTで使用。
  2. `players.source_observed_at`: Migration 0004のCREATE TABLEに存在せず、同列を追加するALTERも見当たらない。一方、`src/player-store.js` のINSERT/UPSERTで使用。Migration 0051の `r2_latest_key` 追加とは別の列。
- `scripts/reconcile-d1-schema.mjs` に両列のaddColumn補修は見当たらない。静的な列定義差は高確度候補だが、本番D1 schema・実行時エラーは未確認。
- 台帳へ根拠・影響・確度・未確認事項を追記。アプリコード/Migration/Workflow変更、デプロイ、本番D1更新、Queue操作、収集/負荷テスト、外部API呼び出しは行っていない。
- 進捗は**80%（16/20）を維持**。この発見はパッケージ17「全Migrationとsrc全SQLの完全な双方向照合」の途中証拠であり、全テーブル/全列の照合を完了したとは扱わない。
- 次はパッケージ17を継続し、残りのテーブルの最終DDLと現行SQLの列・制約・Indexを照合する。全画面UI→API→認可→DB/R2→結果表示の棚卸しはパッケージ18として別途完了条件を満たす。


## 2026-10-10 90%到達時点 — 最新の再開地点

- **現在の進捗: 18/20作業パッケージ = 90%。** 80%時点からパッケージ17「Migrationと現行SQLの静的双方向照合一巡」とパッケージ18「全画面のUI→API→権限→DB/R2→結果表示の静的棚卸し」を完了扱いにした。これは監査作業の進捗であり、機能実装率・本番正常率・本番適用率ではない。
- パッケージ17は、Migration 0001–0058と現行SQLの静的照合を一巡し、確認できた不一致候補を解消せずに台帳化した。追加候補は `api_observations.source_observed_at` と `players.source_observed_at`。既知候補の `kingdom_ranking_current.ranking_snapshot_id`、`kingdom_watchlist_jobs.source_first_at/source_last_at` も継続記録。
- パッケージ18は全画面/API入口と主要機能領域の操作フローを一巡。未接続handler候補、権限差、Retention後のR2読戻し候補、成功/失敗/空状態で要実機確認の点を台帳に記録した。実ブラウザ操作/E2Eを行った意味ではない。
- 残り:
  19. 機能ごとの実装あり/未接続/重複/未実装/仕様未確定の最終分類
  20. 機能別テスト可能性・本番E2E確認行列
- 最新台帳: [EAGLEEYE_COMPLETE_FEATURE_INVENTORY_2026-10-10.md](https://github.com/kingshot-bj/kingshot-data-platform/blob/main/docs/EAGLEEYE_COMPLETE_FEATURE_INVENTORY_2026-10-10.md)
- 安全制約は継続。コード/Migration/Workflow変更、デプロイ、本番D1更新、Queue操作、収集/負荷テスト、外部API呼び出しなし。D1 Free reads最優先。広範囲な `ranking_snapshots` 取得クエリを追加・復活させない。静的監査と本番確認を混同しない。


## 2026-10-10 100%到達 — 最終引き継ぎ状態

- **監査成果物の進捗: 20/20 = 100%。** パッケージ19「機能別状態分類」とパッケージ20「機能別テスト可能性/E2E確認行列」を台帳へ追加し、チェックリストを同期した。
- この100%は**静的監査の成果物完成率**。全機能が正常稼働・実装済み・本番確認済みという意味ではない。スキーマ差、未接続、権限差、Retention/R2 readback、起動経路、コスト/安全性の候補は未解決として残している。
- 機能分類は24領域（F01–F24）で実装あり・静的接続あり/未接続候補/経路差/仕様未確定/外部・本番検証待ちを分類。P0候補と次のテスト順を明示した。
- 機能別テスト行列はRoute/import、Migration/schema、Players/Observations、Watchlists、Compare、History/Changes、Ranking/preferences、Visibility、API Pool, Catalog/Rollers、Retention/Buffer、Safety Gate/Service Usage、Load Test、Google、Discord、Diagnostics/Logs、UI/Safari、Gateway/export、Preview isolationを対象に、確認内容・成功条件・失敗ケース・テストレーンを定義した。
- **未実施:** build、route smoke、isolated D1 Migration適用、Query Plan、browser/Safari E2E、Preview integration、Cloudflare実D1/R2/Queue状態、Production read/write、外部API/OAuth/Discord/Google実操作。いずれも静的監査完了だけでは承認されない。
- 固定条件: D1 Free reads最優先。広範囲な `ranking_snapshots` 取得クエリを追加・復活させない。アプリ/Migration/Workflow修正、デプロイ、本番D1更新、Queue操作、収集/負荷テスト、外部API呼び出しなし。
- 次に再開する場合は、台帳の「パッケージ20 優先順（テスト計画）」に従い、P0/B1から隔離環境の確認計画を作る。まずは既知のSQL列不一致候補とroute/importを確認するが、コード変更は仕様確認と明示許可後に行う。
- 最新の機能台帳: https://github.com/kingshot-bj/kingshot-data-platform/blob/main/docs/EAGLEEYE_COMPLETE_FEATURE_INVENTORY_2026-10-10.md
- 本引き継ぎ: https://github.com/kingshot-bj/kingshot-data-platform/blob/main/docs/EAGLEEYE_HANDOFF_2026-10-10_AUDIT_CONTINUATION.md


## 2026-10-10 再開監査の進捗 — 20%

今回の優先方針はUI刷新ではなく、機能の接続・DB整合性・権限・データ保全の確認。

### 20%時点で確認した静的候補
- `api_observations.source_observed_at`: Migration 0002初期定義に列なし、INSERTで使用。
- `players.source_observed_at`: Migration 0004初期定義に列なし、INSERT/UPSERTで使用。
- `kingdom_ranking_current.ranking_snapshot_id`: Migration 0019定義に列なし、`src/index.js`でSELECT。
- Player Compare: route branchが存在する一方、handler/render関数がimport/定義されていないように見える（helpersのみimport）。実行時の未定義参照候補。
- Owner Load Test export: handler importとUI参照はあるが、対応するrouter branchが見当たらない。
- `kingdom_watchlist_jobs.source_first_at/source_last_at`: 0008初期定義にはなく、0019のCREATE TABLE IF NOT EXISTSだけでは既存テーブルに列追加されない。

### 隔離環境に関する重要な確認
`wrangler.jsonc` のPreview設定がProductionと同じD1 database IDおよびR2 bucketを参照する。Previewからテストを実行せず、別のD1/R2/Queueを使う隔離環境を確立するまで実行テストは保留。

### 次の作業
1. 既知のSQL列候補を全Migration・schema reconciliation・現行SQLで再照合し、追加ALTERや起動時ensureSchemaによる補完がないか確定する。
2. Player CompareとLoad Test exportの実際のhandler定義・route接続を確定する。
3. Player Visibilityの画面/API権限差、Retention後のR2読戻し、change events、Safety Gate null metricsを静的追跡する。
4. 変更は仕様・影響範囲を固めてから。現時点ではアプリコード、Migration、Workflow変更なし。

進捗はこの監査フェーズ内の20%であり、システム完成率ではない。build/route smoke/isolated D1/Browser E2E/Preview/Production testsはいずれも未実施。D1 Free readsを最優先し、広範囲な `ranking_snapshots` retrievalを復活させない。


## 2026-10-10 機能信頼性監査 — 30%到達

追加照合で次を確認した。
- `scripts/reconcile-d1-schema.mjs` に `players.source_observed_at` / `api_observations.source_observed_at` の追加補修が見当たらない。
- `kingdom_ranking_current` のMigration/reconcile定義に `ranking_snapshot_id` がないが、`src/index.js` のSELECTで参照。
- `kingdom_watchlist_jobs` の旧Migration 0008定義には `source_first_at/source_last_at` がない。後続Migration 0019とreconcileは列付きCREATE TABLE IF NOT EXISTSを持つだけで、既存表に対するADD COLUMNが見当たらない。
- Player Compareのrouteはあるが、`handlePlayerCompareApi` / `renderPlayerComparePage` はindex.jsに定義もimportも確認できない。helper関数のimportは存在。
- Owner Load Test CSV handlerは実装・import済みだが、対応API routeがない。
- Player Visibilityの画面はADMINを許可し、APIはOWNER限定。

現在 **30%**。次はRetention後のR2読戻し、change events、Safety Gateの欠損メトリクス、API Poolの無効キー適格性を静的追跡する。アプリ/Migration修正やデプロイはしない。


## 2026-10-10 機能信頼性監査 — 40%到達

- Safety Gateの `maxUsagePercent()` は `Number(v)` 後に有限値を選ぶため、nullが0%として扱われる可能性を確認。欠損メトリクス時の安全判定を追加確認する。
- Retentionはchange_eventsをR2 archive後にD1から削除する。削除済み履歴のChanges API側R2 readbackがあるか未確定。
- Player履歴はR2_ONLY保存失敗時のEmergency Buffer退避、読み取り時のR2参照を確認。Buffer drainの起動元・再試行・復旧経路を追跡中。
- API Poolの通常貸出はAVAILABLE/COOLDOWN対象。Mighty確認成功時のAVAILABLEへの更新がDISABLED/REVOKEDキーを意図せず復活させないか、呼び出し元を追跡する。
- 進捗 **40%**。次はchange event readback、buffer drain起動経路、Mighty metadata更新条件、Safety Gateの欠損データ分岐を確認する。


## 2026-10-10 機能信頼性監査 — 50%到達

- Safety Gateはメトリクスが全て不明で `maxUsagePercent()` がnullを返す場合、`getSafetyState(null)` 内の `Number(null) === 0` によりNORMAL判定へ進む経路がある。欠損時は安全側に倒れるべきか、仕様・呼び出し側を含めて確認する。
- `drainHistoryEmergencyBuffer` はindex.jsでimportされるが呼び出し元を確認できず。Bufferに退避したデータの再処理起動経路が欠落していないか調査を継続。
- Change EventsはRetentionでR2 archive後にD1から削除される一方、index.jsにD1直接参照の履歴クエリがある。R2 readback未接続なら古い履歴が画面/APIから消える可能性。
- ユーザー提供APIキーのMighty再判定は `status != 'REVOKED'` を対象とし、成功時のmetadata更新がAVAILABLEへ戻すため、DISABLED/ERRORの意図しない再有効化がないか確認する。
- 進捗 **50%**。次は各候補の呼び出し経路を確定し、Retention/Buffer/Queue/Safety Gate/API Poolの起動・状態遷移を追う。


## 2026-10-10 機能信頼性監査 — 60%到達

- `drainHistoryEmergencyBuffer` のimportとモジュール実装はあるが、`src/index.js` 全体に関数呼び出しが見当たらない。Workerのscheduled/queue/request経路から呼ばれていない可能性が高いため、repo全体の呼び出し・外部triggerを確認する。
- Player Change APIはD1 `change_events` を直接SELECTする。Retention後のR2読戻しがその経路に見当たらず、古いイベントがAPI/画面から欠ける候補。
- Mighty判定成功時のmetadata更新はstatusをAVAILABLEへ戻す。再判定対象にREVOKED以外が含まれるため、DISABLED/ERRORが成功時に復活する可能性。管理者による無効化を尊重すべきか仕様確認する。
- Safety Gateのnull使用率がNORMALに分類される経路を再確認。未修正。
- 進捗 **60%**。次はQueue/Cronと他モジュールを横断し、Buffer起動・Retention復旧・Safety Gate呼び出し・API Pool状態遷移の接続を確定する。


## 2026-10-10 機能信頼性監査 — 80%到達 / 次の継続点

- **現在: 80%（70%地点からCron/Queue起動経路横断を完了）**。実装率・本番正常率ではない。静的監査のみ。
- `src/index.js` の `scheduled()` は `runApiPoolAutoRecovery`、`runKingdomCatalogDailyRefresh`、`runKingdomDiscordNotifications` を呼ぶ。ここに `runKingdomWatchlistJobs`、`runDataRetentionJob`、`drainHistoryEmergencyBuffer`、Seeder/Roller群の呼出しがない。
- Repo-wide静的検索でも、`runKingdomWatchlistJobs`、`runDataRetentionJob`、`drainHistoryEmergencyBuffer`、`runKingdomSeeder`、`runKingdomRankingRoller`、`runAllianceRoller`、`runPlayerRoller` は定義/import以外のWorker起動呼出しが見つからない。未接続候補として台帳へ追記。別外部triggerは未確認。
- PreviewはProductionと同じD1 database ID / R2 bucketを参照し、Queue設定もProductionと一致しない。隔離が成立していないためPreviewテストは禁止を継続。
- Queue consumerの静的振り分けは確認したが、実Queue配送、ack/retry/DLQ、Cloudflare実設定は未確認。
- 次は監査残り20%として、候補の優先度と重複を統合し、各候補に根拠ファイル/行・影響・確度・未確認点を揃え、隔離環境で実行すべきテスト行列を最終化する。コード修正は行わない。
- 未実施: build、route smoke、isolated D1 Migration/fixtures、Query Plan、browser/Safari E2E、Preview integration、Production read/write、Queue操作、外部API/OAuth/Discord/Google実操作。
- 制約: D1 Free reads最優先。広範囲な `ranking_snapshots` 取得クエリを追加・復活させない。コード/Migration/Workflow修正、デプロイ、本番D1更新、Queue操作、収集/負荷テスト、外部API呼び出しなし。


## 2026-10-10 機能信頼性監査 — 90%到達

- **現在: 90%**。今回、Safety Gateの実呼出し、Owner Load Test開始経路、Mighty再確認→health-check lease→API Pool状態更新、System Event Queueのack/retry構造を静的に追跡し、既知候補を優先度順に統合した。
- Safety Gate: Cloudflare metrics全欠損でusagePercent=null、`getSafetyState(null)`がNORMALになる候補。特に低優先度Load Test開始時のメトリクス欠損を安全側に扱えるか要確認。コード未修正。
- Mighty key: Mighty再確認対象はREVOKED以外。health-check leaseはDISABLED/ERRORも許可し、成功時の`recordApiPoolSuccess`はlease一致キーをAVAILABLEにする。管理者のDISABLED指定を成功確認が解除してよいか仕様未確認。
- System Event Queueは無効メッセージをack、有効メッセージのD1 batch失敗時はthrowしてretry可能にする静的実装。実Queue/DLQ/Retryの動作は未確認。
- P0候補: SQL列不一致、Player Compare route-handler、Watchlist Cron起動、Retention/Buffer起動、PreviewのD1/R2共有、Safety Gate欠損値。P1候補: Change Events R2 readback、Seeder/Roller接続、Load Test export route、Mighty DISABLED状態、Player Visibility認可差。詳細根拠は機能台帳。
- 残り10%: 全候補の確度・影響・未確認を最終統合し、隔離環境用テスト行列と再開手順を整える。build/実行テスト/Productionは未実施。
- 禁止事項を継続: アプリ/Migration/Workflow変更、デプロイ、本番D1更新、Queue操作、収集/負荷テスト、外部API呼び出しなし。Previewは本番D1/R2を共有しているため実行しない。D1 Free reads最優先、広範囲な`ranking_snapshots`取得なし。
