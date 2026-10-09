# EagleEye 本体 引き継ぎ — 2026-10-09 全コード監査継続

## このMDの目的

次スレッドで、KingShot Data Platform EagleEye 本体の全コード監査を途中から継続するための引き継ぎ書。現在までの詳細な指摘は、必ず次の監査記録を参照すること。

- **監査記録／機能台帳：** [EAGLEEYE_FEATURE_INVENTORY_2026-10-09.md](./EAGLEEYE_FEATURE_INVENTORY_2026-10-09.md)
- リポジトリ：`kingshot-bj/kingshot-data-platform`
- 監査対象ブランチ：`main`

## 現在の状態

- **全コード監査は未完了。** 次スレでは「続き」から再開し、最初からやり直したり、完了扱いにしたりしない。
- 監査MDはGitHub `main` に更新済み。2026-10-09時点のチェックポイントを監査記録末尾に追加した。
- 直近の監査記録更新コミット：`167fbf253005a6cfe9587587215be1a6755e42fe`
- 監査記録URL：<https://github.com/kingshot-bj/kingshot-data-platform/blob/main/docs/EAGLEEYE_FEATURE_INVENTORY_2026-10-09.md>
- 本文のコード、Migration、Workflowの修正・本番デプロイ・本番DB更新・収集ジョブや負荷テスト起動は行っていない。所見は基本的に静的監査による候補であり、本番で再現済みとは限らない。

## 監査の進め方

1. `main` の実コードを読み、ルート・ハンドラー・DB SQL・Migration・Cron/Queue・R2・UIの接続を確認する。
2. 確認できた指摘は、監査記録に「根拠／影響／確度・未確認事項／対応方針」を書いて追記する。既存項目との重複を避ける。
3. 静的に確認したこと、実行経路から推測したこと、シナリオ試算、本番で実測したことを明確に区別する。
4. 全体を一巡するまでは、アプリの修正やデプロイを始めない。全体監査完了後に重大度順の修正計画を作る。

## 次スレで最初に行うこと

### 1. Workerの全ルート・認証・セッションを網羅する

`src/index.js` のルーティングを一覧化し、各ルートについて次を照合する。

- ハンドラー定義またはimport先が存在するか
- 対応するUI/APIが実際につながっているか
- HTTPメソッド制限があるか
- 未認証／BASIC／ADVANCED／VIP／ADMIN／OWNERの境界が正しいか
- ユーザーアカウントのACTIVE/DISABLED状態を適切に確認するか
- 状態変更GET、副作用を持つGET、CSRF/Origin対策の不足がないか
- Cookie/sessionのSecure、HttpOnly、SameSite、期限、失効、再発行、署名検証が整合しているか
- 不正なCookieや不正入力で500にならないか

既に記録済みの未定義レンダラー、認証チェック不足候補、Owner APIのmethod制限、GET副作用は監査MDを参照し、同じ内容を重複して追加しない。

### 2. Migration・SQL・インデックスを照合する

- `migrations/` の初期Migrationから最新までを一覧化し、テーブル・列・UNIQUE制約・インデックスと現行SQLを対応づける。
- `0008` の番号重複など既知の懸念は、実際の適用履歴が未確認の段階で即座に不具合と断定しない。
- `CREATE TABLE/INDEX` をリクエスト時に実行する箇所とMigrationとの二重管理を確認する。
- 読み取りコストが大きいSQLは、WHERE/JOIN/ORDER BYとインデックスの整合性を確認する。Query Planや本番Insightsを見ていない場合は未確認と明記する。

### 3. Cron / Queue / R2 / collection経路を照合する

- `scheduled()` から各定期処理が実際に呼ばれるか、Cron頻度と処理時間・タイムアウト・リトライが適切か確認する。
- import/定義されているだけのローラー、Retention、診断、Watchlist Scheduler、緊急履歴バッファ排出を「稼働中」と扱わない。
- `wrangler.jsonc` のbinding名、Queue名、環境別リソースがコードの参照と一致するか確認する。
- R2保存失敗時、D1 fallback、削除、再試行、並行実行時の整合性を確認する。
- UIポーリングがバックグラウンドジョブ継続を担っている機能は、画面を閉じたときの挙動も検討する。

## 現在の重要な問題候補（監査MDに詳細あり）

### 最優先候補
- 領主所有権移管で、新所有者のACTIVE行をINSERTしてから旧所有者をDISABLEDにしているため、ACTIVE `governor_id` のUNIQUE制約と衝突する可能性。
- Safety GateでCloudflare使用量の欠落値 `null` が0扱いになり、NORMAL判定へ落ちる可能性。
- RetentionがR2 bucket未指定で呼ばれた場合に、archiveせずDELETEする分岐がある。R2_ONLYの期待動作との整合性を確認する。

### 高優先度候補
- 収集ローラーなどがWorker入口から未接続に見える。接続前にR2 binding名 `R2_ARCHIVE` と `ARCHIVE` の不一致を解消・確認する必要がある。
- Retention、診断、緊急履歴バッファ排出、Watchlist Schedulerの自動実行経路が未確認。
- 公開 `/status` が60秒ごとにD1ステータス取得と直近24時間のAPI Pool使用量集計を繰り返す可能性。
- Watchlist Scheduler接続前に、全有効watchlist走査・直近24時間の使用量再集計・ACTIVEユーザー確認を設計する必要がある。
- Discord通知が候補を固定件数で取得し、claim済みイベントをSQL側で除外しないため、大量イベント時に後続通知が漏れる可能性。
- R2履歴APIが対象件数を絞る前にオブジェクト一覧を全ページ取得し、ランキング履歴では多数の本文をGETする可能性。
- Collection Semaphoreのリース期限延長関数が利用されていないように見え、長時間処理時に同時実行上限を超える可能性。
- Cloudflare Analyticsの固定limit超過時に部分集計を検知できない可能性。

### 中優先度以下の候補
- API Pool暗号化鍵にセッションSecretを共有利用しており、Secretローテーション時に復号不能になる可能性。
- API Pool leaseの非冪等リトライ、期限切れlease表示、Mighty判定の古い状態。
- Owner APIの監査ログ不整合、領主サポート申請の重複・状態遷移競合。
- API Raw Inspectorのpayloadサイズ上限不足。
- テストの標準的な自動実行入口を確認できていない。
- `/player/compare` やその他未定義レンダラー参照の候補。実際の定義・import・ビルド時の挙動を再確認する。

上記は優先度を示すための要約であり、根拠や条件は監査記録を読むこと。静的所見を本番障害と断定しない。

## D1 / ランキングに関する絶対条件

- **D1 Freeの読み取り量を最重要視する。**
- **`ranking_snapshots` の広範囲読み取りクエリを絶対に復活させない。**
- ランキング履歴・差分の設計は、対象キーで絞った既存クエリ、`kingdom_ranking_current`、R2アーカイブ、小さな索引などを優先して検討する。D1の全履歴SELECTで置き換えない。
- 数字の負荷試算は「シナリオ試算」と書き、実測と混同しない。

## 作業制約

- ユーザーから別途許可されるまで、アプリコード・Migration・Workflowの修正、デプロイ、本番DBの更新、APIキー再登録、収集・ロードテストの実行を行わない。
- Secret値、APIキー、Cookie等の機密値を監査MDや会話に書かない。
- 次スレでは、まずこの引き継ぎMDと監査記録の両方を読んでから続ける。

## 次スレ開始時の指示文

「`docs/EAGLEEYE_HANDOFF_2026-10-09_AUDIT_CONTINUATION.md` と `docs/EAGLEEYE_FEATURE_INVENTORY_2026-10-09.md` を読んで、全コード監査の続きから開始。まず `src/index.js` の全ルートと認証/sessionの網羅確認を進め、確認済み所見を監査MDに追記する。コード修正・デプロイはまだ行わない。D1 Free読み取り量を最優先し、`ranking_snapshots` の広範囲読み取りを絶対に復活させない。」


---

## 2026-10-09 継続監査追記（OAuth/session）

- 直近の監査記録更新コミット：`fb2370b6202a7d57f07cc5e57162d041c7a2786e`
- 監査記録：[`EAGLEEYE_FEATURE_INVENTORY_2026-10-09.md`](./EAGLEEYE_FEATURE_INVENTORY_2026-10-09.md)
- 今回、`src/index.js` のDiscord OAuth開始/callback、Cookie発行、`getAuthenticatedUser()`、Owner管理APIの一部を再確認。
- 新規追加した要確認事項：
  1. OAuth stateはHMAC署名と10分の時刻確認があるが、開始ブラウザとの照合と一度きりの消費が見当たらず、ログインCSRFの可能性がある。実攻撃は未実施。
  2. D1のユーザー保存失敗を捕捉した後もセッションCookieを発行するため、callbackはログイン完了に見えても後続のD1ユーザー照会で未認証になる可能性がある。D1障害試験は未実施。
- Owner管理APIのうちユーザー一覧/ロール/状態/監査ログ/ウォッチリスト関連、API Pool再割当は、ルーター直下に認可ガードがないものでもハンドラー内部の`requireOwner()`を確認。未確認の別ルートへ一般化しない。
- `/player/compare` 未定義レンダラーは既存記録にあるため重複追記していない。
- セッションCookieの不正形式についても追記確認：`parseCookie()` の `decodeURIComponent()` だけでなく、`verifyPayload()` 内の署名部分 `decodeBase64Url()` も例外捕捉前に実行されるため、不正セッションCookieが共通catch経由で500になる可能性。既存の不正Cookie所見を拡張し、重複項目は作成していない。
- 監査全体は未完了。全ルート認証・メソッド・ACTIVE状態の照合、Migration/SQL全体照合、Cron/Queue/R2の接続照合を続ける。
- 追加監査コミット：`fb2370b6202a7d57f07cc5e57162d041c7a2786e`。管理者ランキングAPI/画面/出力の王国ID正規表現に過剰エスケープ候補を確認。通常の数字IDが拒否される可能性がある。加えて、MightPulse timestamp文字列正規化とLast active表記変換にも同種の候補。いずれも静的所見で、実リクエスト/ユニットテストは未実施。
- アプリコード・Migration・Workflowの変更、デプロイ、本番DB更新、収集/負荷テスト起動は行っていない。
- **D1 Freeの読み取り量を最優先し、`ranking_snapshots` の広範囲読み取りを絶対に復活させない。**


## 2026-10-09 継続監査追記（Preview/Queue）

- 追加監査コミット：`e987f33807b375a7586f36ce7298cf5084106d77`。`wrangler.jsonc` のProduction/Preview Queue差分を確認。Previewは `SYSTEM_EVENT_QUEUE` producer bindingと3 consumer設定が欠ける一方、D1 `database_id` とR2 bucketはProductionと同じ指定。Previewのイベント処理差分および本番データ共有リスクを監査MDへ追記。実デプロイ・配送試験は未実施。
- Queue handlerの静的確認では、System EventはD1 batch成功後ack・失敗時retry、Service UsageはR2未設定/書き込み失敗時retry。Cloudflare上の実配送・再試行・DLQ移送は未検証。
- 次は全ルートのHTTP method / ACTIVE認可表を完成させ、D1 SQL・Migration・インデックスの照合へ進む。引き続きコード変更・デプロイ・本番DB更新・収集/負荷テスト起動は禁止。

## 2026-10-09 継続監査追記（System Event Queue）

- 追加監査コミット：`1bf6d58114167e56ad55cc75e71cdee3401f3a54`。`recordSystemEvent()` のQueue利用はモジュール変数 `systemEventQueue` に依存するが、`setSystemEventQueue()` の呼び出しは `queue()` 内の1箇所のみ。HTTP `fetch()` 経路でbindingを設定する箇所が見当たらず、HTTP起点のイベントがD1直接INSERTへフォールバックする可能性を静的懸念として記録。実環境の割合・Isolate挙動は未計測。
- 次はHTTP routeごとの認証・ACTIVE・HTTP method照合と、Migration/SQL/indexの対応確認を継続する。変更・デプロイ・本番DB更新・収集/負荷テスト起動は禁止。

## 2026-10-09 継続監査追記（Service Usage R2アーカイブ）

- 監査MDに `src/service-usage-archive.js` の保存方式を追加。12時間窓の同じR2オブジェクトをバッチごとに全件GET・gzip解凍・JSON parse・マージ・再gzip・PUTするため、バッチ増加に伴いR2 I/Oと処理量が増幅する構造を確認。
- 同一キーへの読み取り→マージ→上書きに排他制御/条件付き書き込みが見当たらず、Queueバッチが並行処理された場合に片方のイベントを後続PUTが消す可能性も記録。いずれも静的所見で、実際のR2欠落・並行配送・コスト影響は未検証。
- 次はHTTP routeの認証・ACTIVE・method一覧の穴埋め、またはMigration/SQL/index対応の確認を継続する。アプリコード・Migration・Workflow変更、デプロイ、本番DB更新、Queue操作、収集/負荷テストは禁止。
- **D1 Freeの読み取り量を最優先し、`ranking_snapshots` の広範囲読み取りを絶対に復活させない。**


## 2026-10-09 継続監査追記（進捗目安・Migration 0058・Queue指摘の訂正）

### 全体進捗目安
- **全体：約43%（暫定）**。コード行数の網羅率・本番動作確認率ではなく、監査ワークストリームの状態に基づく作業管理上の概算。
- 主ルート分類 70%、HTTPルート認証/ACTIVE/method照合 35%、Migration/SQL/index照合 25%、Cron/Queue/R2接続照合 45%、テスト基盤・実行時検証 10%を目安として記録。全体は単純平均ではなく横断監査の重みを加味した概算で、範囲拡大時は修正する。
- 進捗の詳細は監査MD末尾の「監査進捗（2026-10-09 時点・暫定）」を参照。

### 今回の確認
- Migration 0058 `user_kingdom_ranking_preferences` と `handleKingdomRankingPreferencesApi()` を確認。現行 `src/index.js` ではPOSTのUPSERT経路は見えるが、当該テーブルのSELECT/読取APIは見つからなかった。画面初期化や別モジュールでの読取有無を次に確認する。未実装とはまだ断定しない。
- **前回のSystem Event Queue指摘を訂正：** 最新 `src/index.js` のHTTP `fetch()` 入口に `setSystemEventQueue(env.SYSTEM_EVENT_QUEUE)` が存在することを確認した。「fetch経路ではbinding設定がない」という前回の静的懸念は撤回する。実際のQueue送信率・配送動作は未計測。
- 監査MDと本引き継ぎを更新し、GitHubから再取得して追記内容を検証すること。

### 次に行うこと
1. 王国ランキング設定のフロントエンド保存呼び出し・再表示時の初期化経路を追う。
2. Migration 0001〜0058を段階的に照合し、テーブル/列/UNIQUE/INDEXと現行SQLの対応を記録する。番号重複の0008は適用履歴を見ずに不具合断定しない。
3. HTTP routeごとの認証・ACTIVE・method表を継続して穴埋めする。
4. 進捗率を更新する場合は、今回確認した範囲と残作業を明示し、根拠なく数値を上下させない。

- アプリコード・Migration・Workflowの変更、デプロイ、本番DB更新、APIキー再登録、Queue操作、収集/負荷テストは許可が出るまで行わない。
- **D1 Freeの読み取り量を最優先し、`ranking_snapshots` の広範囲読み取りを絶対に復活させない。**


### 2026-10-09 追加確認（ランキング設定の読取経路を確認）
- `src/kingdom-portal.js` の `renderKingdomRankingsPage()` を調査し、`user_kingdom_ranking_preferences` のSELECTを発見。前回の監査MDに記録した「設定の読取経路が見つからない」という暫定所見は誤りのため、監査MD側で訂正した。
- 読取は `WHERE user_id = ? LIMIT 1` の単一行参照。ACTIVEユーザーに対して保存済み `kid` / `boards_json` / `primary_board` を画面初期化に使う。ルーターから認証ユーザーをページ関数へ渡す経路も確認。
- 監査範囲はMigration 0058、保存API、ルート、ページレンダラーの静的照合。ブラウザーE2E・本番のD1消費量は未確認。
- **全体進捗目安を40%から42%へ更新**。これは今回の読取経路確認と既存Migration照合を反映した作業管理上の概算。全体の網羅率ではない。
- 次はMigration 0001〜0058のテーブル・列・制約・インデックスと現行SQLの照合を続け、差分候補を記録する。コード変更・デプロイ・本番DB更新・Queue操作・収集/負荷テストは禁止。
- **D1 Freeの読み取り量を最優先し、`ranking_snapshots` の広範囲読み取りを絶対に復活させない。**


### 2026-10-09 追加確認（Migration 0054〜0057）
- `0054_vip_mighty_credentials.sql` と `src/user-mighty.js` の登録/取得/失効SQL、`0055_player_visibility_vip.sql` のVIP CHECK制約、`0056_vip_role_schema_repair.sql` のusers/watchlist_limits再構築、`0057_api_pool_mighty_metadata.sql` と `src/api-pool.js` の列参照を部分照合。確認範囲で列名の明確な不一致は見つからなかった。
- `registerUserMightyKey()` はSELECT後にINSERTするため、同一ユーザー同時登録時はDBの部分UNIQUE INDEXが競合を防ぐ。競合時のAPIエラー応答は未試験のため、追加確認対象に残す。
- Migration実適用履歴・本番スキーマ・再適用試験は未確認。コード変更・デプロイ・本番DB更新は行っていない。
- **全体進捗目安を42%から43%へ更新**、Migration/SQL/index領域を25%とした。部分照合を反映した暫定値で、全体の網羅率ではない。
- 次は残りのMigrationと、API Pool/ユーザーMighty APIの競合・失敗時エラー経路を読み進める。
- **D1 Freeの読み取り量を最優先し、`ranking_snapshots` の広範囲読み取りを絶対に復活させない。**


## 2026-10-09 継続監査追記（Mighty判定APIの401経路）

- 監査台帳を更新し、`handleMyMightyCheckApi()` の401経路を追加。401ではキー失敗記録・無効化を行う一方、`transient=true` となり `checked` が増えないため、全キー401のときに `UNDETERMINED` を返す可能性を静的所見として記録した。実APIでの再現は未実施。
- 現行のユーザー提供キー登録/判定は `api_pool_keys` と `user-eligibility.js` を通る。今回確認した主要10ファイルには `src/user-mighty.js` / `user_mighty_credentials` の参照がなかったため、Migration 0054の別実装が主要経路に接続していない可能性を記録。ただし未確認ファイルが残るため、リポジトリ全体で未使用とは断定していない。
- 進捗目安を全体43%→44%、HTTP route監査35%→37%、Migration/SQL/index照合20%→27%に更新。作業管理上の概算であり、コード網羅率・本番動作確認率ではない。
- 次は401/403/429/5xx/通信障害の分岐と資格再評価の整合性、`user-mighty.js` / `user_mighty_credentials` のリポジトリ全体参照、残りMigration/SQLを継続確認する。
- コード変更・Migration変更・デプロイ・本番DB更新・APIキー再登録・Queue操作・収集/負荷テスト起動は禁止。**D1 Free読み取りを最優先し、`ranking_snapshots` の広範囲読み取りを絶対に復活させない。**


### Mighty判定APIの追加照合（401とVIP資格の整合性）

- 追加確認で、401処理は `api_pool_keys.status` をDISABLEDにする一方、`mighty_capable/mighty_check_status` を更新していないことを確認した。
- `getVipEligibility()` はREVOKED以外のキーを対象に `mighty_capable=1` かつ `mighty_check_status='CONFIRMED'` で資格判定し、キーの運用状態DISABLEDを除外しない。したがって、以前CONFIRMEDだったキーが401で無効化されても、VIP資格の根拠として残る可能性がある。401のみの場合は `transient=true` かつ `checked=0` によって `UNDETERMINED` で早期returnし、資格の再評価・降格も行われない可能性がある。
- 対応時は401を一時障害と分け、判定結果と資格ロジックの条件を統一する。今回の監査では実API呼び出し・ユーザー権限変更は行っていない。
- `src/` のJavaScript 51ファイルを検索し、`src/user-mighty.js` を除く他の50ファイルに `user-mighty.js` / `user_mighty_credentials` / 同モジュール関数名への参照がないことを確認した。Migration 0054/0056のテーブル定義は現行ソースから未接続の可能性が高い。テスト・管理スクリプト等 `src/` 外の参照は未確認のため、削除・統合はしない。
- 監査台帳を更新し、GitHubから再取得して反映を確認する。


## 2026-10-09 追加監査：Discord通知
- `alliance-catalog.js` stores alliance change target IDs as `kid:aid`, while `discord-notifications.js` compares the ranking target ID directly to that composite ID. If ranking target IDs are aid-only, alliance notifications may be omitted. Static finding; runtime test not performed.
- `discord_notification_state` keeps successful dedupe keys and is not included in the inspected retention table list, so its rows may accumulate. Actual row count is unknown.
- Reviewed migrations 0050-0053 in part. Migration 0053's role CHECK lacks VIP but later migration 0055 updates that constraint; do not treat 0053 alone as final schema.
- Next: audit migrations 0040-0049, reconcile alliance target ID formats, and continue route auth/ACTIVE/method review. No code changes, deploys, production DB updates, queue operations, or collection/load tests. Keep D1 reads low; never restore broad `ranking_snapshots` reads.


## 2026-10-09 継続監査追記（Migration 0040〜0049・進捗50%）

- 機能台帳を更新し、GitHubから再取得して反映を検証した。監査台帳コミット：50aeafb4704b717960abb0d2f63ff3876ed9b853
- **全体進捗目安：50%**。作業管理上の概算であり、全コード網羅率や本番動作確認率ではない。機能台帳の最新進捗表が過去の44%記録を更新する基準。
- Migration 0040〜0049をSQL定義と関連ソースで部分照合。0040 Seeder state、0041 alliance catalog/state、0042 player roller state、0043 no-op、0044 load-test usage columns、0045 change_events lookup index、0046 collection stats/source、0047 conservative baseline backfill、0048 R2 latest pointer、0049 resumable R2 backfill stateを確認。実Migration適用履歴、本番スキーマ、Query Planは未確認。
- 同盟通知IDの不一致候補を3ファイルで照合：alliance-catalog.jsはchange_events.target_idをkid:aidで保存、ranking-store.jsはALLIANCE target_idを原則aid/entry.id/abbrから作り、discord-notifications.jsは文字列の完全一致で比較する。aid単体の場合に通知対象漏れの可能性が高いが、実データ・送信試験は未実施。
- R2 Catalog backfillはR2保存成功後にD1 payloadをNULL化する安全順序。ただし並行実行のロック/Compare-And-Swapが見当たらず、D1 UPDATEの変更行数を確認せずarchivedを加算しているため、同時実行時の二重保存/カウンター過大計上候補を記録した。データ消失を確認したわけではなく、並行実行試験も未実施。
- kingdom_collection_statsの集計呼び出しは確認したindex.jsの王国ウォッチリストjob完了経路。全体収集Coverageを意図するなら、Seeder/Roller等が加算されない可能性があり仕様確認が必要。
- runKingdomSeeder / runAllianceRoller / runPlayerRoller はindex.jsからimportされているが、確認したscheduled()とHTTP route範囲では呼び出しを確認できていない。リポジトリ全体の参照調査は未完了で、未接続と断定しない。次の優先調査。
- 0040 SeederはOFFSET paginationのためCatalogが変化したときのskip/duplicate可能性を要確認。0047はランキングとplayers双方が存在する王国のみ初期統計に含める保守的設計。
- 次：ローラー/Seederのリポジトリ全体の起動経路、Cron/Queue接続、残りMigrationとSQL/インデックス、HTTP routeの認証・ACTIVE・method照合を継続する。
- コード変更・Migration変更・Workflow変更、デプロイ、本番DB更新、APIキー再登録、Queue操作、収集/負荷テスト起動は禁止を維持。**D1 Freeの読み取り量を最優先し、ranking_snapshotsの広範囲読み取りを絶対に復活させない。**


## 2026-10-09 継続監査追記（Migration 0030〜0039・進捗60%）

- 機能台帳にMigration 0030〜0039と定期実行経路/Semaphoreの監査結果を追記し、raw GitHubから追記と60%表示を検証した。監査台帳コミット：54ae8e1c80d14373fe0dcf7cc42aab8eeae80f68
- **全体進捗目安：60%**。作業管理上の概算であり、コード行数の網羅率・本番動作確認率ではない。
- 0030〜0033のLoad Test履歴/待機メトリクス列、0034〜0036のCollection Semaphore/個別lease slots、0035 API request locks、0037〜0038 Kingdom Catalog、0039 Ranking Roller stateを現行ソースと部分照合。実Migration適用履歴・本番スキーマ・Query Planは未確認。
- src/index.jsのscheduled()が直接実行するのはAPI Pool自動復旧、Kingdom Catalog日次refresh、Discord通知の3経路。runKingdomSeeder / runKingdomRankingRoller / runAllianceRoller / runPlayerRollerはimportされているが、確認したscheduled()とHTTP route範囲では呼び出しを確認できていない。未接続と断定せず、全リポジトリ参照確認を継続する。
- Kingdom Catalog discoveryは開始時にstateをRUNNINGへ更新し、日次schedulerはstateがRUNNINGならスキップする。処理停止後に古いRUNNINGを回復する別経路の有無を確認する。stuck状態が実際に発生した証拠はない。
- collection-semaphore.jsのrefreshCollectionPermit()はlease延長関数だが、確認したsrc内の呼び出し経路で利用箇所を確認できていない。既定leaseは180秒で、長時間処理時にslotが再取得可能になるリスク候補。実際のlease超過・同時実行違反は未確認。
- 次：Seeder/Rollerの全参照と呼び出し元、Discoveryのstuck復旧、HTTP routeの認証/ACTIVE/method、残りMigration/SQL参照を継続する。
- コード変更・Migration/Workflow変更、デプロイ、本番DB更新、APIキー再登録、Queue操作、収集/負荷テスト起動は禁止を維持。**D1 Free読み取りを最優先し、ranking_snapshotsの広範囲読み取りを絶対に復活させない。**


## 2026-10-09 継続監査追記（Migration 0020〜0029・進捗70%）

- 機能台帳を更新し、raw GitHubから反映を検証した。台帳コミット：0d8cff1646940eb4e1f85af39edac2ff905067df
- **全体進捗目安：70%**。ユーザー希望により、100%到達までは途中の詳細報告を行わず、監査作業と台帳更新を継続する。
- Migration 0020〜0029を現行コードと部分照合。Retention設定列/時刻index、User Player Linksの単一アカウントからMAIN/SUB複数アカウントへの再構築、Support request API、API Pool user-contributed index、diagnostics index、system_event_log、load test runsを確認。
- src/user-player-link.js のensureSchema()はCREATE TABLE/INDEX IF NOT EXISTSを実行しており、Migration 0022〜0026とschema定義が重複する。呼び出し頻度と本番DDL実行は未確認。D1コスト/二重管理の観点で追跡する。
- user_player_link_support_requestsは確認したRetention table listに含まれない。長期の本人確認・所有権移管監査証跡として意図的に保持する可能性があるため、削除対象とは断定せず保持方針を確認する。
- system_event_logは別のR2アーカイブ処理でR2保存後にD1削除する経路を確認。R2 binding未設定時の運用と、scheduled側からの呼び出し条件は継続確認する。
- 次：Migration 0010〜0019と初期Migrationの照合、全ルート認証/ACTIVE/method表、定期処理起動経路、RetentionのR2/D1境界を継続する。
- コード変更・Migration/Workflow変更、デプロイ、本番DB更新、APIキー再登録、Queue操作、収集/負荷テスト起動は禁止を維持。**D1 Free読み取りを最優先し、ranking_snapshotsの広範囲読み取りを絶対に復活させない。**


## 2026-10-09 継続監査追記（Migration 0010〜0019・進捗80%）

- 機能台帳を更新し、raw GitHubから追記を検証した。台帳コミット：c6b6b1d2daa8d2675dd85cfc423eca60755a7045
- **全体進捗目安：80%**。ユーザー希望により、100%到達までは詳細な途中報告を控えて監査と台帳更新を継続する。
- Migration 0010〜0019を現行ソースと部分照合。Owner login/audit logs、D1 history indexes、Player Watchlist、identity history、History Emergency Buffer、API Pool lease移行、watchlist_limits/diagnostics、kingdom_watchlist_jobs/locks、kingdom_ranking_currentの定義を確認。
- 0018のwatchlist_limits role CHECKにVIPがない点は後続0056で修復されるため、0018単体で最終スキーマ不整合とは扱わない。0011のranking_snapshots indexは既存の限定履歴クエリ向けであり、広範囲SELECT復活の根拠にしない。
- 次：Migration 0001〜0009、Emergency BufferとAPI Pool leaseの呼び出し経路、HTTP route認証/ACTIVE/method表の最終突合せ。
- コード変更・Migration/Workflow変更、デプロイ、本番DB更新、APIキー再登録、Queue操作、収集/負荷テスト起動は禁止を維持。**D1 Free読み取りを最優先し、ranking_snapshotsの広範囲読み取りを絶対に復活させない。**
