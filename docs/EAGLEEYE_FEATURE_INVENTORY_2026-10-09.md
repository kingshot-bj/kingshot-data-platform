# EagleEye 機能台帳・全体監査計画 — 2026-10-09

## 目的

EagleEye 本体の現行コードを基準に、搭載機能・実装箇所・依存関係・検証状況を一覧化する。
以降はこの台帳を更新しながら、機能を1つずつ監査・改善・テストする。

この文書は監査の起点であり、一覧に記載された機能すべてが正常動作すると保証するものではない。コード上の実装、テストでの確認、本番環境での確認を分けて記録する。

## 監査ルール

1. 対象ブランチは `main`。調査時点のコードを確認して記録する。
2. 「コードあり」と「動作確認済み」と「本番E2E確認済み」を混同しない。
3. 実際に確認できていない項目は「未確認」とする。推測で完了扱いにしない。
4. 変更前に関連ルート・共通関数・DBテーブル・Cron・外部APIへの影響を確認する。
5. 機能ごとに、調査 → 問題一覧 → 修正方針 → 実装 → テスト → 回帰確認の順で進める。
6. D1の読み書き量、API Poolの消費、R2保存の整合性、権限境界を必ず確認する。
7. 既存の安全制御（Safety Gate等）を迂回・弱体化しない。
8. 本番環境の変更・migration適用・デプロイは、実行と確認が取れた場合に限り完了として記録する。
9. 秘密情報、APIキー、トークン、個人情報を台帳やログに記載しない。
10. 1機能の変更が共通処理を通じて他機能に及ぼす場合、影響範囲を回帰テスト対象に含める。

## 状態の定義

- **未調査**: 現行コードの確認が終わっていない。
- **コード確認中**: 関連ファイルや処理の流れを調査中。
- **実装あり・未検証**: コード上の実装は確認できたが、期待動作のテストが未完了。
- **一部確認**: 一部の経路・条件のみ確認できた。
- **テスト確認済み**: 明示したテスト条件で結果を確認できた。
- **本番E2E確認済み**: 本番環境で実際の利用経路を最後まで確認できた。
- **要修正**: 不具合、欠落、設計上の問題が確認された。
- **対象外**: 現在の仕様では対象にしない。理由を記録する。

## 機能台帳

> 初期分類。ファイル単位の全コード監査・テストを終えるまでは、各項目の状態を確定しない。

| ID | 分類 | 機能・監査対象 | 主な確認観点 | 状態 |
|---|---|---|---|---|
| UI-01 | UI共通基盤 | 共通ページレイアウト、共通CSS、ナビゲーション | 共通化範囲、各画面の独自スタイル、モバイル表示、エラー表示 | 未調査 |
| UI-02 | UI共通基盤 | UIトークン・BJにゃん画像・共通アセット | `src/eagleeye-ui.js`、アセット参照、未使用・重複定義 | コード確認中 |
| UI-03 | UI拡張 | テーマファイルによる着せ替え | CSS変数化、テーマ定義形式、既定テーマへのフォールバック、設定保存、権限 | 未調査 |
| AUTH-01 | 認証・権限 | ログイン、ユーザー状態、ロール判定 | BASIC / ADVANCED / VIP / ADMIN / OWNERの実際の定義と各APIでの認可 | 未調査 |
| PLAYER-01 | プレイヤー | プレイヤー検索・詳細表示 | 入力検証、API呼び出し、取得失敗・未発見・不完全データの扱い | 未調査 |
| PLAYER-02 | プレイヤー | プレイヤー登録・アカウント連携 | 重複登録、所有者判定、登録時の自動判定、権限更新 | 未調査 |
| PLAYER-03 | プレイヤー | プレイヤー情報・英雄情報 | データの取得元、項目の整合性、更新日時、欠損時の表示 | 未調査 |
| WATCH-01 | ウォッチリスト | プレイヤーウォッチリスト | 追加・削除、再取得、順位変動、重複処理、負荷 | 未調査 |
| WATCH-02 | ウォッチリスト | 王国ウォッチリスト | 対象管理、ジョブ起動、再試行、失敗記録、負荷 | 未調査 |
| RANK-01 | ランキング | 王国ランキング・ランキングボード | ボード一覧、取得・保存、順位とラベル、ページ表示 | 未調査 |
| RANK-02 | ランキング | ユーザー別ランキング設定 | `user_kingdom_ranking_preferences`、保存・読込、既定値、認証 | 実装あり・未検証 |
| DATA-01 | データ基盤 | MightPulse API連携 | キー選択、応答検証、タイムアウト、レート制限、再試行 | 未調査 |
| DATA-02 | データ基盤 | API Pool | キーリース、並列数、通常利用枠、枯渇時の挙動、キー別計測 | 未調査 |
| DATA-03 | データ基盤 | D1データベース | クエリ、インデックス、読み書き量、重複処理、migration整合性 | 未調査 |
| DATA-04 | データ基盤 | R2アーカイブ | 保存形式、最新キー参照、失敗時の安全性、D1 fallback | 未調査 |
| DATA-05 | データ基盤 | 王国Catalog / Seeder | 新規王国発見、詳細収集、Catalog更新、D1/R2整合性 | 実装あり・未検証 |
| JOB-01 | 自動処理 | Cron・定期処理 | スケジュール、重複起動、再実行、停止・失敗時の記録 | 未調査 |
| JOB-02 | 自動処理 | バックフィル・大量取得ジョブ | 小分け実行、再開、進捗保持、中止、API/D1消費 | 未調査 |
| NOTIFY-01 | 通知 | Discord通知・タイムライン | 発火条件、重複通知、送信失敗、権限・秘匿情報 | 未調査 |
| ADMIN-01 | 管理 | System Status / 診断 | API Pool、MightPulse、Watchlist、D1、R2、Cron等の表示の正確性 | 未調査 |
| ADMIN-02 | 管理 | システムログ・JSONログ | 24時間分の記録、時刻、容量、欠落、機密情報の除外 | 未調査 |
| ADMIN-03 | 管理 | 負荷テスト | Safety Gate、実ジョブ到達、進捗・中止・再開、消費量、結果整合性 | 一部確認・本番E2E未確定 |
| EXPORT-01 | 外部連携 | Google Sheets等への出力 | ロール制限、データ整合性、失敗時の表示 | 未調査 |
| OPS-01 | 運用 | D1 migration / デプロイ | migration定義と本番適用の区別、デプロイ結果、ロールバック可能性 | 未調査 |

## 初期に確認できている関連ファイル・構造

- `src/index.js`: Workerの主要ルーティングおよび複数のAPI・画面処理。全ルートの棚卸しが必要。
- `src/eagleeye-ui.js`: BJにゃんの画面別アセット参照とUIトークン定義が存在する。全画面がこれらを使っているかは未確認。
- `src/kingdom-portal.js`: 王国ランキング画面を構成する処理が存在する。共通レイアウト・独自スタイルの範囲を追加調査する。
- `migrations/0058_user_kingdom_ranking_preferences.sql`: ユーザー別王国ランキング設定に関するmigration定義。
- `docs/EAGLEEYE_HANDOFF_2026-10-05.md`: 負荷テスト・Safety Gate等の既知課題と検証上の注意。
- `docs/EAGLEEYE_HANDOFF_2026-10-06_R2_CATALOG_BACKFILL.md`: 王国CatalogのD1/R2移行方針と未完了作業。

上記のファイル存在は、関連機能が本番で正常動作していることを意味しない。migrationの本番適用、Workerのデプロイ、本番E2Eはそれぞれ独立して確認する。

## 監査の進め方

### フェーズA — 全体マッピング

- [ ] `src/index.js` の全ルート、画面、APIを一覧化
- [ ] `src/` の全モジュールと呼び出し元・呼び出し先を整理
- [ ] `migrations/` のテーブル・インデックスと利用コードを対応付ける
- [ ] Cron / Queue / Scheduled処理の起点と実行先を整理
- [ ] `public/` の画面アセットと利用箇所を整理
- [ ] 外部API、D1、R2、Discord、Google連携のデータフローを整理
- [ ] ロールごとの画面表示とサーバー側認可を対応付ける
- [ ] 重複実装、未使用コード、エラー処理の不統一を抽出する

### フェーズB — リスク優先の監査

- [ ] API Poolの枯渇・二重リース・通常利用への影響
- [ ] D1の読み書き量と広範囲クエリ
- [ ] R2保存失敗時のデータ保全とfallback
- [ ] OWNER / ADMIN等の権限チェックとSafety Gate
- [ ] ジョブの重複起動、再試行、進捗・中止・再開
- [ ] migrationの適用前後で発生するスキーマ不整合
- [ ] ログ・診断情報における秘密情報の露出

### フェーズC — 機能ごとの改善

機能ごとに以下を記録し、合格後に次へ進む。

1. 対象機能と利用者の期待動作
2. 関連ファイル、ルート、テーブル、Cron、外部API
3. 現状の処理フロー
4. 問題点と再現条件
5. 修正方針・影響範囲
6. 実装コミット
7. テスト条件と結果
8. 回帰テスト結果
9. 本番確認の有無
10. 残課題と次の作業

## 監査記録

| 日付 | 対象 | 結果 | 次のアクション |
|---|---|---|---|
| 2026-10-09 | 初期台帳作成 | 機能分類と監査ルールを定義。全コード監査は未完了。 | フェーズAの全体マッピングを実施し、コード根拠で状態を更新する。 |
| 2026-10-09 | `src/index.js` ルート棚卸し | 主ルーターの画面/API入口とWorkerイベント入口を分類。ハンドラー内部の認可・入力検証・本番動作は未確認。 | scheduled/queue処理の追跡と、ルート単位の権限監査へ進む。 |

## 完了条件

- 全画面・API・定期処理・外部連携が台帳に登録されている。
- 各機能の主要ファイル、DB、依存先が追跡できる。
- 実装状況とテスト・本番確認状況が分離されている。
- 未確認事項、既知不具合、重複処理、負荷リスクが明示されている。
- 修正ごとにテスト結果と関連コミットが追記されている。


## フェーズA-1 — `src/index.js` ルート棚卸し（2026-10-09）

対象: `main` の `src/index.js`。主ルーターの `fetch()`、`scheduled()`、`queue()` を確認。
この一覧はルーターに明示された入口をまとめたもの。各ハンドラー内部のサブルート、HTTPメソッド別の挙動、認可の正しさ、実際の稼働可否は別途確認が必要。

### Worker入口

| 入口 | 現行コード上の処理 |
|---|---|
| HTTP `fetch(request, env, executionContext)` | URL pathnameでルーティング。未一致はホーム画面へ。例外はログ出力後に500 JSON |
| Scheduled `scheduled(event, env, executionContext)` | API Pool自動復旧、王国Catalog更新、王国Discord通知を個別try/catchで実行 |
| Queue `queue(batch, env)` | メッセージを `SYSTEM_EVENT`、`KINGDOM_LOAD_TEST_RUN`、その他（Service Usage）に分類。各処理の後半を含め追加追跡が必要 |

### ページ・画面ルート

| パス | 画面・目的 |
|---|---|
| `/` および未一致パス | ホーム画面（renderHome） |
| `/players` | プレイヤー検索 |
| `/player` | プレイヤー詳細 |
| `/player/history` | プレイヤー履歴 |
| `/player/changes` | プレイヤー変動 |
| `/player/compare` | プレイヤー比較 |
| `/my-player` | マイプレイヤー・登録/連携 |
| `/player-watchlist` | プレイヤーウォッチリスト |
| `/kingdom-watchlist` | 王国ウォッチリスト |
| `/kingdom-watchlist/analytics` | 王国ウォッチリスト分析 |
| `/kingdom-catalog` | 王国Catalog |
| `/kingdom` | 王国詳細 |
| `/kingdom/rankings` | 王国ランキング |
| `/kingdom/alliances` | 王国同盟一覧 |
| `/alliance` | 同盟詳細 |
| `/kingdom/compare` | 王国比較 |
| `/kingdom/mighty` | 王国Mighty情報 |
| `/kingdom/changes` | 王国変動 |
| `/status` | 公開システム状況 |
| `/status-json-comparator`, `/status-json-comparator.html` | Status JSON比較用静的アセット |
| `/support` | サポート画面 |
| `/admin` | 管理画面 |
| `/admin/google-drive` | Google Drive接続設定 |
| `/admin/data-retention` | データ保持設定 |
| `/admin/player-visibility` | プレイヤー項目表示設定 |
| `/admin/kingdom-rankings` | 王国ランキング管理 |
| `/admin/diagnostics` | システム診断 |
| `/admin/system-log` | システムログ |
| `/admin/data-coverage` | データ収集カバレッジ |
| `/admin/mightpulse-probe` | MightPulse接続プローブ |
| `/admin/api-raw-data` | API生データ確認 |
| `/admin/mightpulse-research` | MightPulse調査 |
| `/admin/api-pool` | API Pool管理 |
| `/owner` | Owner管理画面 |
| `/owner/player-link-support` | プレイヤー連携サポート管理 |
| `/owner/kingdom-load-test` | 王国負荷テスト |
| `/owner/kingdom-catalog-r2-backfill` | 王国Catalog R2バックフィル |

### APIルート — 認証・ユーザー・プレイヤー

- `/api/auth/discord`, `/api/auth/callback`, `/api/auth/logout`
- `/api/me`, `/api/me/player`, `/api/me/advanced`, `/api/me/mightpulse-key`, `/api/me/vip`, `/api/me/vip/mighty-check`
- `/api/player`, `/api/player/refresh`, `/api/player/history`, `/api/player/rank-history`, `/api/player/changes`, `/api/player-compare`
- `/api/player-watchlist`
- `/api/debug/player-gear`, `/api/debug/player-icons`

### APIルート — 王国・ランキング・ウォッチリスト

- `/api/kingdom-rankings/preferences`
- `/api/kingdom-portal/ranking`, `/api/kingdom-portal/status`
- `/api/kingdom-watchlist`, `/api/kingdom-watchlist/data`, `/api/kingdom-watchlist/history`

### APIルート — 管理・データ基盤

- `/api/admin/mightpulse/player`, `/api/admin/mightpulse-probe`, `/api/admin/mightpulse-research`
- `/api/admin/rankings/player`, `/api/admin/rankings/board`
- `/api/admin/data-retention`, `/api/admin/kingdom-catalog-r2-backfill`
- `/api/admin/player-visibility`, `/api/admin/player-export`
- `/api/admin/kingdom-rankings`, `/api/admin/kingdom-ranking-export`
- `/api/admin/diagnostics`, `/api/admin/system-log`, `/api/admin/system-log/export`, `/api/admin/system-log/export/download`
- `/api/admin/discord/roles`, `/api/admin/discord-support/register-command`
- `/api/admin/monitoring-profile`, `/api/admin/r2-archive-objects`
- `/api/admin/api-pool/keys`, `/api/admin/api-pool/add`, `/api/admin/api-pool/move`, `/api/admin/api-pool/revoke`, `/api/admin/api-pool/delete`, `/api/admin/api-pool/mighty-check`, `/api/admin/api-pool/health-check`, `/api/admin/api-pool/test-player`, `/api/admin/api-pool/test-ranking`
- `/api/admin/api-raw-data`, `/api/admin/api-raw-history`
- `/api/admin/google-drive/authorize`, `/api/admin/google-drive/verify`, `/api/admin/google-drive/callback`

### APIルート — Owner・サポート・外部API

- `/api/owner/kingdom-load-test`, `/api/owner/kingdom-load-test/status`, `/api/owner/kingdom-load-test/history`, `/api/owner/kingdom-load-test/cancel`, `/api/owner/kingdom-load-test/system-json`
- `/api/owner/users`, `/api/owner/users/watchlists`, `/api/owner/users/role`, `/api/owner/users/status`, `/api/owner/users/login-history`, `/api/owner/audit-log`
- `/api/owner/player-link-support`, `/api/owner/api-pool/reassign`
- `/api/load-test/notice-status`
- `/api/support`, `/api/support/context`, `/api/discord/interactions`
- `/api/gateway/v1/*`（gateway handlerへ委譲）

### ルート棚卸しで見えた注意点（要追加監査）

1. **ルート入口だけでは認可完了と判定できない。** 例えば一部の `/api/admin/*` と `/api/owner/*` は入口で明示的な `requireAdmin` / `requireOwner` を呼ばず、各ハンドラー内の認可に依存しているように見える。各ハンドラーの認可を確認するまでは脆弱性とは断定しないが、優先監査項目とする。
2. `/api/load-test/notice-status`、Discord interaction、gateway配下、Google Drive OAuth callbackなどは公開入口としての署名・セッション・state検証の有無をハンドラー側で確認する。
3. `/api/debug/*` の本番公開要否、認証、返却情報を確認する。
4. `scheduled()` は上記3処理を直接呼び出す。その他の定期処理がQueueやCron設定経由で起動するか、`wrangler.jsonc` とQueue handlerを照合する。
5. ページHTMLは `src/index.js` 内のインライン生成と別モジュール（例：`src/kingdom-portal.js`）に分散している。全画面への共通テーマ適用は、個別のHTML生成箇所も監査してから判断する。
6. ここに記載したルートはコード上で定義されている入口であり、全ルートの正常動作・権限・本番稼働を確認したものではない。

### フェーズA-1 の進捗

- [x] `src/index.js` の主ルーターに明示されたページ/API入口を分類
- [ ] 各ルートハンドラー内部のメソッド・認証・入力検証を確認
- [ ] `scheduled()` と `queue()` の全処理を追跡
- [ ] 動的パス・クエリパラメータ・別モジュール内のサブルートを追加確認
- [ ] 台帳の監査記録を更新



### 追加確認 — 共通テーマ・全画面ガード（`src/index.js`）

ルート棚卸し中に、テーマ関連の既存実装も確認した。

- `EAGLEEYE_THEME_CSS`: ライトテーマ用の上書きCSS、テーマ切替ボタン、固定ロールバー、処理中アクションの表示スタイルを定義。
- `EAGLEEYE_THEME_SCRIPT`: `localStorage` の `eagleeye-theme` からライト/ダーク設定を読み込み、設定がない場合はOSのカラースキームを参照する。
- `installMutatingRequestGuard()`: 同一のPOST/PUT/PATCH/DELETEリクエストが処理中に重複送信されるのをクライアント側で抑制する。
- `installGlobalActionGuard()`: ボタン・フォーム送信の連打防止を行う。
- `installRoleBar()` / `loadRole()`: BASIC、ADVANCED、VIP、ADMIN、OWNERのロールバーを生成し、`/api/me/advanced` から現在のロールを反映する。
- `applyEagleEyeTheme(html)` / `eagleEyeHtmlResponse(html)`: HTMLレスポンスに共通CSS/JSを注入する仕組みがある。

**監査上の意味:** ライト/ダーク切替、全画面ロールバー、二重操作防止はコード上すでに共通実装があるため、単純に「新規実装が必要」とは扱わない。一方で、全HTMLが必ず `eagleEyeHtmlResponse` を通るわけではなく、直接Responseを返す画面や静的アセットは適用範囲を確認する必要がある。また、テーマ設定は現状ブラウザーのlocalStorageに保存されるため、テーマ定義ファイルを差し替える着せ替え機能とは別物である。

この時点ではコード上の存在を確認しただけで、全画面適用率、Safariでの挙動、連打防止の例外、テーマ切替のE2E動作は未検証。


### フェーズA-1 続き — ハンドラー内部の認証・入力検証のサンプル監査（2026-10-09）

以下は実コードを読んで確認した事実。全APIを網羅した認可監査ではない。

#### 確認できた保護・検証

- `requireAdmin(request, env)` は認証ユーザーの存在、ACTIVE状態、ADMIN/OWNERロール、D1設定を確認し、API Pool暗号化設定を初期化する。
- `requireOwner(request, env)` は認証ユーザーの存在、ACTIVE状態、OWNERロール、D1設定を確認する。
- API Poolのキー一覧・追加・移動・失効・Mighty判定・ヘルスチェック等のハンドラーは、内部でADMIN権限を確認する。キー削除とユーザーへのキー再割当はOWNER権限を確認する。
- `handlePlayerVisibilityApi` はOWNERを要求し、ロール名、表示対象キー、watchlist上限を検証する。ADMINがOWNER向け設定を変更することも拒否する。
- Ownerユーザー管理APIは内部でOWNERを確認する。ロール変更時は許可ロールを限定し、VIP昇格には `evaluateVipEligibility` を要求する。自身のOWNER降格や、自身/OWNERアカウントの停止を拒否するコードがある。
- 王国ランキング設定APIはACTIVEユーザーを要求し、王国IDの整数・Catalog存在、許可ボード、primary boardの選択範囲を検証する。
- `/api/gateway/v1/*` は別モジュールへ委譲される。確認したgateway status処理はBearer tokenを必須とし、文字列比較は一定時間比較の実装を使う。診断文面ではtoken/secret/API key等をマスクする。
- `getAuthenticatedUser` は署名済みセッションだけでなくD1のユーザーレコードを参照し、D1照会失敗時は認証なしとして扱う。保護APIがfail-closedになる設計意図がコメントに記載されている。
- Discord OAuth開始処理はstate tokenを発行し、callback側のstate検証は別途継続確認が必要。セッションCookieはHttpOnly、Secure、SameSite=Laxを指定している。

#### 継続調査・注意項目

1. **全APIの認可監査は未完了。** 今回読んだ関数では内部ガードを確認できたが、ルート全件について同じ確認をしたわけではない。特に `/api/admin/*` と `/api/owner/*` は、ルーターにガードが書かれていないものもあるため、各ハンドラーに認可があるかを1件ずつ確認する。
2. `handleApiPoolMove` は対象キーとPool種別、REVOKED状態を検証するが、コード上は実行中リースの有無を確認せずpool_typeを更新している。キー移動時にリース中の操作へ影響するか、API Pool側のlease処理との整合性を調べる。現時点では不具合と断定しない。
3. `handleApiPoolAdd` はpool_typeを文字列化して `addApiPoolKey` に渡している。許可値の検証が下位関数で確実に行われるかを確認する。
4. `handleKingdomRankingPreferencesApi` は `request.json()` の失敗を空オブジェクトとして処理するため、結果的に入力エラーを返す設計だが、共通のJSONエラー形式・サイズ上限の方針は未確認。
5. `handleDebugPlayerGear` / `handleDebugPlayerIcons` はコード上ADMIN/OWNER制限を持つ。デバッグAPIを本番で公開する方針と、返却データの必要性を別途確認する。
6. `handleDiscordSupportCommandRegistrationApi` と `handleMonitoringProfileApi` / `handleR2ArchiveObjectsApi` は、内部でACTIVE状態とADMIN/OWNERロールを確認している。
7. `/api/load-test/notice-status`、Discord interactions、OAuth callback、support API、全gateway endpointは、署名・state・認証・入力検証を個別に読み終えるまで判定保留とする。
8. ルーターのcatch-allは例外の詳細をHTTP応答へ返さず `INTERNAL_ERROR` を返す一方、consoleへ例外を出力する。個別ハンドラーが詳細な例外文面を返す経路については、機密情報や内部情報がレスポンスに露出しないかを別途確認する。

#### Scheduled / Queue の処理追跡

- `scheduled()` は `runApiPoolAutoRecovery(env, { limit: 4 })`、`runKingdomCatalogDailyRefresh(env)`、`runKingdomDiscordNotifications(env, { lookbackSeconds: 600, maxEvents: 20 })` を順に独立したtry/catchで実行する。
- `queue()` はメッセージを `SYSTEM_EVENT`、`KINGDOM_LOAD_TEST_RUN)、その他のService Usage処理に分類する。System Eventは `handleSystemEventQueue`、負荷テストは各メッセージを `runKingdomLoadTestQueue` へ渡し、成功時ack・例外時retry、残りは `handleServiceUsageQueue` へ渡す。
- これらはWorkerソース上の呼び出し確認であり、CloudflareのCron/Queue bindingが本番で正しく設定されているか、実際に発火したかは別途設定ファイルと本番ログで確認する。

### 監査記録の更新

| 日付 | 対象 | 結果 | 次のアクション |
|---|---|---|---|
| 2026-10-09 | `src/index.js` 内部ハンドラーのサンプル | 認証ヘルパー、API Pool管理、Owner管理、ランキング設定、Gatewayの保護・入力検証を一部確認。全APIの網羅確認は未完了。API Pool移動・追加の下位検証とリース整合性を要確認。 | APIルートを残りも1件ずつ確認し、Cron/Queue設定との照合を完了する。 |
| 2026-10-09 | `scheduled()` / `queue()` | 3つのScheduled処理とQueueメッセージ3分類・配送先をコード上で確認。Cloudflare側の設定・本番発火は未確認。 | `wrangler.jsonc` とworkflowを照合し、機能別モジュール一覧へ進む。 |


### フェーズA-1 — Cloudflare設定とWorkerイベント入口の照合（2026-10-09）

対象: `wrangler.jsonc`、D1 migration workflow、`src/index.js` の `scheduled()` / `queue()`、`src/kingdom-catalog-scheduler.js`。

#### コード・設定で確認したこと

- `wrangler.jsonc` のCronは `*/5 * * * *`（5分ごと）。`scheduled()` 内ではAPI Pool自動復旧、王国Catalog日次更新、Discord通知の3処理を呼び出す。Catalog側はDBの `kingdom_catalog_discovery` 状態を確認し、stateがRUNNINGなら重複実行をスキップする。
- production設定にはD1 binding `DB)、R2 binding `ARCHIVE)、静的Assets binding `ASSETS` が定義されている。履歴モードは `R2_ONLY`。
- production Queue producer/consumerには `eagleeye-service-usage`、`eagleeye-load-test`、`eagleeye-system-events` が定義され、各consumerに最大再試行5回、DLQが設定されている。Load Test consumerはbatch size 1 / concurrency 1。System EventとService Usageはbatch size 100 / concurrency 1。
- D1 migration workflowは `workflow_dispatch` による手動起動であり、コードの変更だけでは本番migration適用を意味しない。workflowには適用前のschema drift guardと、適用後の一部schema検証がある。
- `src/discord-support.js` の確認範囲では、Discord interaction署名検証用のEd25519処理があり、問い合わせ入力にはカテゴリ経路・件名長・本文長・詳細値長の検証がある。ただしinteraction handler全体の処理経路と署名検証の呼び出し位置は、完全監査としては継続確認が必要。

#### 要確認・リスク候補

1. **Preview設定とWorker Queueコードの差分:** `wrangler.jsonc` の `previews.queues.producers` には `SERVICE_USAGE_QUEUE` と `LOAD_TEST_QUEUE` しか記載されず、`SYSTEM_EVENT_QUEUE` が見当たらない。一方、Workerの `queue()` は `SYSTEM_EVENT` メッセージを処理し、`setSystemEventQueue(env.SYSTEM_EVENT_QUEUE)` を呼び出す。Preview環境でSystem Eventのenqueueが必要な場合に機能しない可能性があるため、意図した仕様か確認する。現時点ではPreviewでの実動作未確認。
2. `wrangler.jsonc` にはGoogle Drive OAuth Redirect URIとして `/api/auth/callback` が設定されている。Discord OAuth callbackも同じパスを使っているため、Google Drive OAuthの実際の開始・callback経路とredirect URIの一致を調べる。ここでは設定文字列の一致だけを確認しており、障害とは断定しない。
3. `wrangler.jsonc` のQueue定義はコード上で確認できたが、Cloudflare側で実際にQueue・DLQ・Cronが存在して有効か、直近の実行成功を示すものではない。
4. migration workflowに記載されたschema検証範囲は一部migration/テーブルに限られる。台帳にあるすべてのmigrationの本番適用状況は別途照合が必要。

### フェーズA-1 状態更新

- [x] `src/index.js` の明示ルートを分類
- [x] Scheduled/Queueの呼び出しとメッセージ分類を確認
- [x] `wrangler.jsonc` のCron・bindings・Queue構成をコードと照合
- [x] D1 migration workflowが手動起動であることを確認
- [ ] 全APIハンドラーの認証・入力検証を網羅
- [ ] Discord interaction/OAuth/Support/Gatewayの全経路を確認
- [ ] Preview/Productionの設定差分の意図と動作を確認
- [ ] フェーズAの他ファイル・DB・アセット・ロールマッピングへ進む

| 日付 | 対象 | 結果 | 次のアクション |
|---|---|---|---|
| 2026-10-09 | `wrangler.jsonc` / Workerイベント | Cron・本番Queue構成・DLQ・D1 migration workflowを確認。PreviewのSystem Event producer欠落候補とGoogle Drive callback設定を要確認として記録。実際のCloudflare側稼働は未確認。 | Preview設定の意図を確認対象に残し、残りのAPI認可監査と全体マッピングを続ける。 |


### フェーズA-1 続き — OAuth / Support / Gateway / API Pool確認（2026-10-09）

#### OAuth callback の設定不整合候補（優先度: 高）

コードと `wrangler.jsonc` を突き合わせ、次の経路を確認した。

- Discord OAuth開始・callback: `/api/auth/discord` → `/api/auth/callback` → `handleDiscordCallback()`
- Google Drive OAuth開始: `/api/admin/google-drive/authorize` → `getGoogleDriveOAuthAuthorizationUrl()`
- Google Drive callback handler: `/api/admin/google-drive/callback` → `handleGoogleDriveOAuthCallback()`
- ただし `wrangler.jsonc` の `GOOGLE_DRIVE_OAUTH_REDIRECT_URI` は `/api/auth/callback` を指している。Google Drive OAuth URL生成とtoken交換の両方がこの設定値を使用する。

**判定:** 設定上、Google OAuthの応答がDiscord callbackのルートへ到達する不整合候補を確認。Google callback handlerのルートとRedirect URIが一致していないため、Google Drive再認証フローが失敗する可能性が高い。実際のOAuth往復は未実行なので、本番障害の再現確認は未完了。設定修正・Google Cloud側の許可Redirect URI更新・本番での再認証は別作業として扱い、この監査中は変更しない。

#### Discord Support

- `/api/discord/interactions` はPOSTのみを受け付け、`DISCORD_PUBLIC_KEY` が未設定なら503、Ed25519署名検証に失敗すれば401で拒否する。
- Interactionは署名検証後にJSON解析し、Ping応答を処理する。close/reopenコマンド以外は拒否応答となる。
- close/reopenは設定済みSupport Guild内であること、Supportロールを持つこと、チャンネルID形式を満たすことを確認した上で処理する。チケットのGuild、カテゴリ、topic内チケットID、status、対象ユーザーの権限設定も内部関数で検証する。
- `/api/support` と `/api/support/context` は、ルーターで認証ユーザーを取得し、Supportモジュール側でもACTIVE状態を要求する。問い合わせ入力はカテゴリ経路、件名（120文字まで）、本文（4000文字まで）、各詳細値（1000文字まで）を検証する。
- 実際のDiscord署名付きリクエストやチケット作成・close/reopenのE2Eは未実行。

#### Gateway

- `/api/gateway/v1/status` と `/api/gateway/v1/diagnostics` はGateway専用Bearer tokenを要求し、token未設定は503、不一致は401となる。
- diagnosticsはGETのみで、取得件数を1〜100に制限。ログ・診断メッセージ内のtoken、secret、API key等をマスクする処理がある。
- Gatewayのfull log exportはストリーミングでページングし、最大500行単位で取得する実装を確認。Gateway配下の未知パスは404。
- 認証済みの実通信テスト、ストリーミング出力のJSON完全性、秘匿情報マスキングのテストは未実施。

#### API Pool 管理API

- `handleApiPoolAdd` はADMIN/OWNERを要求し、APIキー本体は下位関数で暗号化保存される。下位関数 `addApiPoolKey` は空キーと許可外pool typeを拒否する。
- `handleApiPoolMove` はADMIN/OWNERを要求し、pool typeを `SYSTEM_GENERAL` / `SYSTEM_WATCHLIST` / `USER_CONTRIBUTED` に制限し、存在しないキーとREVOKEDキーを拒否する。
- ただし `handleApiPoolMove` は更新前に現在の `leased_until` / lease情報を参照せず、Pool種別を更新している。リース中に移動されたキーが進行中の要求・成功/失敗記録・Pool統計に与える影響を調べる必要がある。即時の不具合とは断定しない。
- Add/Moveのハンドラーには明示的なHTTPメソッド制限が見当たらず、JSON/form bodyを解析した後に処理する経路がある。意図した仕様か、POST以外のリクエストを受け付けない設計に統一するか要確認。
- API Poolキー一覧では暗号化キー本体を除外し、fingerprintは短縮、prefixのみ表示する。ただしlast_error_message等は返却されるため、APIエラー文面に秘密情報が含まれないことを継続監査する。

### フェーズA-1 の追加リスク・次のアクション

1. **高優先度:** Google Drive OAuth Redirect URIと実際のcallback routeの不一致候補を修正前に再確認する。設定ファイルだけでなくGoogle Cloud OAuthクライアントの許可URIも確認する。
2. Preview設定では `SYSTEM_EVENT_QUEUE` producerが定義されていない一方、Workerコードはこのbindingを使用する。Previewでのイベント記録要件を確定する。
3. 全APIの認可監査はまだ網羅完了していない。プレイヤー・ランキング・ウォッチリスト・エクスポート・負荷テストの各handlerを引き続き確認する。
4. コード監査だけでは本番動作の確定はできない。OAuth、Discord interaction、Queue配送、Gateway exportはテスト環境で再現可能なテストケースを用意する。

| 日付 | 対象 | 結果 | 次のアクション |
|---|---|---|---|
| 2026-10-09 | OAuth / Support / Gateway / API Pool | Discord OAuth state、Support署名とロール制限、Gateway Bearer token、API Pool pool type検証を確認。Google Drive callback URI不一致候補、PreviewのSystem Event producer欠落候補、API Pool Moveのリース整合性とHTTPメソッド制限を要確認として追加。 | 高優先度のGoogle OAuth経路を設定修正前に確認し、残るプレイヤー・ランキング・ウォッチリストAPIの認可監査を継続する。 |


---

## 次スレ引き継ぎ — 機能台帳監査の続き（2026-10-09）

### 作業対象

- Repository: kingshot-bj/kingshot-data-platform
- Branch: main
- 監査台帳: docs/EAGLEEYE_FEATURE_INVENTORY_2026-10-09.md
- 主な対象: src/index.js のルート、各APIハンドラー、Workerイベント処理
- 目的: 機能の棚卸しをコード根拠で完成させ、全体像を把握した後に機能単位で監査・改善する。次スレでは新機能実装ではなく、この監査の続きから再開する。

### ここまでの確認事項

1. src/index.js の主ルーターに明示された画面/API入口を分類し、台帳に追記した。
2. scheduled() はAPI Pool自動復旧、王国Catalog日次更新、王国Discord通知の3処理を呼び出す。
3. queue() は SYSTEM_EVENT、KINGDOM_LOAD_TEST_RUN、その他Service Usageの3分類を処理する。負荷テストQueueは成功時ack、例外時retry。
4. wrangler.jsonc のCron、D1/R2/Assets binding、本番Queue/DLQ構成、手動起動のD1 migration workflowを照合した。本番Cloudflare環境での実発火・migration適用を確認したわけではない。
5. 共通テーマ処理として EAGLEEYE_THEME_CSS、EAGLEEYE_THEME_SCRIPT、applyEagleEyeTheme()、eagleEyeHtmlResponse() を確認した。ライト/ダーク切替はlocalStorageベース。ロールバーとクライアント側の重複操作防止も既存コードにある。全画面適用とE2Eは未検証。
6. Discord OAuth / Support / Gateway / API Poolの一部ハンドラーを確認した。Supportの署名検証・権限検査、GatewayのBearer token、API Poolのロール制限・pool type検証などはコード上で確認した。
7. Google Drive OAuthについて、wrangler.jsonc の GOOGLE_DRIVE_OAUTH_REDIRECT_URI が /api/auth/callback を指す一方、WorkerのGoogle Drive callback routeは /api/admin/google-drive/callback となっている不整合候補を発見した。この監査中は修正していない。設定とGoogle Cloud側の許可URIを再確認し、実際のOAuth往復は別途検証する。
8. Preview Queue設定では SYSTEM_EVENT_QUEUE producerが定義されていない可能性がある一方、Workerはこのbindingを参照する。Previewの要件・設定を要確認。
9. API PoolのMove処理では、リース中のキー移動に対する整合性とHTTPメソッド制限が要確認。即時不具合とは断定していない。
10. 各項目はコード確認であり、本番E2E確認済みを意味しない。

### 次スレで最初に行うこと

**まず既存台帳と main の現行コードを再取得し、直近の記録と重複しないようにしてから監査を続ける。**

1. src/index.js の残りのAPIハンドラーを追い、特に以下を1つずつ確認する。
   - プレイヤー検索・詳細・更新・履歴・比較API
   - プレイヤーウォッチリストAPI
   - 王国ウォッチリスト・履歴・データAPI
   - 王国ランキング・ランキング設定・エクスポートAPI
   - プレイヤー項目表示制御・データ保持API
   - Ownerのユーザー管理、ロール変更、ステータス変更、監査ログ、連携サポートAPI
   - 負荷テストとCatalog R2バックフィルAPI
2. 各APIについて、HTTPメソッド制限、認証/ロール認可、入力検証、SQL bind、エラー応答、レート・消費コスト、秘密情報の返却有無を記録する。
3. 明示的にルーターで requireAdmin / requireOwner を呼んでいないAPIは、それだけで脆弱性と断定せず、ハンドラー内部と呼び出し先で認可を確認する。
4. 動的パス、クエリパラメータ、別モジュールのルートも漏れなく拾い、入口一覧を完成させる。
5. scheduled() / queue() はWorkerコード上の流れまで確認済み。必要に応じて wrangler.jsonc と関連モジュールを照合するが、本番発火はログなしで確認済み扱いにしない。
6. 調査で問題候補が見つかった場合は、先に台帳へ根拠・影響範囲・再現条件・優先度を記録する。監査の途中で無断で修正・デプロイしない。
7. ルート監査が終わったら、フェーズAの残り（src/全モジュールの依存関係、migrationとDB利用箇所、public/アセット、ロールと画面の対応、外部連携）へ進む。

### 監査上の厳守事項

- D1の読み書き量を重視し、広範囲な ranking_snapshots 読み取りを復活させない。
- R2_ONLY方針、Safety Gate、既存の権限境界を維持する。
- APIキー、トークン、秘密情報をログやMDに書かない。
- 「コードあり」「テスト確認済み」「本番E2E確認済み」を明確に分離する。
- コード修正・mainへのコミット・デプロイ・本番E2Eは別々の作業段階として記録する。
- 次スレではこのMDを読み直し、直近の未完了項目から再開する。ユーザーに同じ情報を聞き直さない。

### 引き継ぎ時点の結論

src/index.js のルート棚卸しは途中まで進行。Workerイベント入口・Cloudflare設定・OAuth/Support/Gateway/API Poolの一部確認とリスク候補の記録は済んだが、**全APIの認可監査および全機能棚卸しは未完了**。次はプレイヤー／ランキング／ウォッチリスト系APIの内部監査を続ける。


---

## フェーズA-1 続き — プレイヤー / ウォッチリストAPI内部監査（2026-10-09）

対象: `src/index.js` の `handlePlayerApi`、`handlePlayerRefresh`、`handlePlayerHistoryApi`、`handlePlayerChangesApi`、`handlePlayerRankHistoryApi`、`handlePlayerWatchlistApi`、`handleKingdomRankingHistoryApi`、`handleKingdomWatchlistDataApi`。

### コード上で確認したこと

- プレイヤー詳細・更新・履歴・変動・順位履歴はセッションからD1のユーザーを再取得し、主要な経路でACTIVE状態を確認している。
- プレイヤー詳細・更新はMightPulse取得をAPI Pool経由で行い、取得結果を `materializePlayer()` で保存する。ロール別の表示フィルターを通してから応答する。
- プレイヤー履歴は返却前にプレイヤー/プロフィールのロール別フィルターを適用する。プレイヤー変動APIも `isChangeVisibleForRole()` で表示可能な変更だけに絞る。
- プレイヤーウォッチリストは利用者のDiscord IDで対象を絞り、追加時にロール別上限を確認する。追加は `ON CONFLICT(discord_id, governor_id)` による重複登録回避、PATCH/DELETEもDiscord IDを条件にしており、他利用者のリストを直接変更できない形になっている。
- ウォッチリストの順位サマリーは `kingdom_ranking_current` と `kingdom_ranking_board_state` を参照する。コードコメントでも旧 `ranking_snapshots` のプレイヤー×ボード単位の相関サブクエリを避ける方針が明記されている。広範囲な `ranking_snapshots` 読み取りを復活させない。
- 履歴・変動APIの件数上限は、プレイヤー履歴100、変動100、プレイヤー順位履歴200、王国順位履歴200。王国ウォッチリストデータのランキング表示はボード指定時100、複数ボード表示時は登録top_nを上限としている。
- プレイヤーウォッチリストGETは対象ユーザーの全登録行を取得し、さらにランキング状態・変更イベントのサマリーを組み立てる。返却行数自体の明示的なページング上限は確認できなかった。

### 要修正候補・追加調査事項

#### 1. ACTIVE状態チェックの不一致（優先度: 高・要再現確認）

`handleKingdomRankingHistoryApi` と `handleKingdomWatchlistDataApi` は `getAuthenticatedUser()` の結果が存在するかだけを確認し、`auth.status === "ACTIVE"` を確認していない。一方、`handlePlayerApi`、`handlePlayerRefresh`、`handlePlayerHistoryApi`、`handlePlayerChangesApi`、`handlePlayerRankHistoryApi`、`handlePlayerWatchlistApi` はACTIVE状態を確認する。

`getAuthenticatedUser()` はユーザーがDISABLEDでもDBレコード自体を返す実装のため、無効化済みアカウントの既存セッションから、上記2つの王国APIにアクセスできる可能性がある。ルート/ハンドラーのコード差分に基づく要修正候補。無効化ユーザーのセッションを用いた実リクエスト再現は未実施。

#### 2. HTTPメソッド制限の不一致（優先度: 中）

`handlePlayerApi`、`handlePlayerRefresh`、`handlePlayerHistoryApi`、`handlePlayerChangesApi`、`handlePlayerRankHistoryApi` は、対象コード内に明示的なGET/POST等のメソッド制限が見当たらない。特に `handlePlayerRefresh` はリクエストを受けるとデータ取得・保存を実行するため、GET等の意図しないメソッドでも処理される可能性がある。クライアント側の呼び出し方法と仕様を確認し、読み取り系はGET、更新系はPOST等へ明示的に制限する方針を検討する。現時点では変更していない。

#### 3. ウォッチリスト変更サマリーのD1負荷（優先度: 高・要クエリ計画確認）

`handlePlayerWatchlistApi` のGETでは、`change_events` を `player_watchlists` とJOINし、各ウォッチ対象について `TOWN_CENTER_CHANGED` / `ALLIANCE_CHANGED` / power変更の最新行を `ROW_NUMBER()` で選ぶ。クエリに時間範囲条件がなく、対象プレイヤーの過去イベントが蓄積するほど走査量が増える可能性がある。インデックス定義・実際のD1 Query Plan/Query Insights・ウォッチリスト件数別の消費量を確認する。直ちに広範囲スキャンと断定はしないが、D1 Free read最優先のため優先調査対象とする。

#### 4. ウォッチリスト上限チェックの同時実行（優先度: 中・要再現確認）

プレイヤーウォッチリストの追加は、現在の有効件数をSELECTしてからINSERT/UPSERTする。複数の追加リクエストが同時に到着すると、双方が上限未満と判定してから登録する競合が起きる可能性がある。ユーザーごとの上限を厳密に守る必要があるか、D1側で直列化/トランザクション的な制御ができるか、並列リクエストで再現確認する。

#### 5. ウォッチリストGETの全件返却（優先度: 中）

`handlePlayerWatchlistApi` GETは当該ユーザーの登録行を全件返す。上限設定は追加時に検査されるが、設定変更や既存データにより大量行が存在する場合のレスポンスサイズと追加サマリークエリの負荷は未確認。実際のロール別上限と既存件数、クエリ計画を照合する。

### この段階での判定

- ルートと主要処理のコード確認: 一部確認。
- テスト確認済み: なし（この監査では実APIリクエスト・D1 Query Plan・本番E2Eを実施していない）。
- 修正・デプロイ: なし。
- 続き: 王国ウォッチリスト全アクション、王国ランキングAPI、Owner API、エクスポートAPIの認可・メソッド・入力検証を監査し、その後migration/indexと照合する。

| 日付 | 対象 | 結果 | 次のアクション |
|---|---|---|---|
| 2026-10-09 | プレイヤー/ウォッチリストAPI内部監査 | ロール別データフィルター、利用者単位のウォッチリスト操作、ランキングのcurrent-state参照を確認。王国APIのACTIVEチェック不一致、メソッド制限の不足候補、変更イベントクエリの負荷、上限チェック競合を追加調査事項として記録。 | 王国ウォッチリストとランキング、Owner/Export APIへ進み、全体マッピングとDBインデックス照合を続ける。 |


## フェーズA-1 続き — 王国ウォッチリスト / Owner管理API監査（2026-10-09）

対象: `handleKingdomWatchlistApi`、`handleKingdomWatchlistDataApi`、`handleOwnerUsersApi`、`handleOwnerUserWatchlistsApi`、`handleOwnerUserRoleApi`、`handleOwnerUserStatusApi`、`handleOwnerLoginHistoryApi`、`handleOwnerAuditLogApi`。

### コード上で確認したこと

- 王国ウォッチリストの作成・更新・再取得・中止・有効/無効切替・削除は、ウォッチリストIDとログインユーザーのDiscord IDを照合する処理がある。
- 王国ウォッチリストの再取得は `POST` の `refresh` アクションで処理し、対象確認後にロックを取得してジョブを継続/作成する。ロック競合時は409を返す。処理失敗時はジョブとウォッチリストへ失敗内容を保存し、診断ログを記録する。
- 王国ウォッチリスト一覧では進行中ジョブのエラー/15分超過を検出してFAILEDへ回復させる実装がある。これはGETでDB状態を更新する副作用なので、並行実行や一覧アクセス時の書き込み量を今後確認する。
- Ownerのユーザー検索には取得上限1〜250、ログイン履歴には1〜500、監査ログには1〜250の上限がある。ロール変更・ステータス変更はPOSTに制限され、許可値を検証してOwner監査ログを記録する。
- Ownerのロール変更はBASIC / ADVANCED / VIP / ADMIN / OWNERを許可し、VIP設定時には `evaluateVipEligibility()` を呼び出す。自身のOWNER降格を拒否する。
- Ownerのステータス変更はACTIVE / DISABLEDに制限し、自身の停止とOWNERアカウントの停止を拒否する。
- Ownerによる他ユーザーのウォッチリスト管理は、対象ユーザーを確認し、自分自身のウォッチリスト管理を拒否する。削除時は対象Discord IDを条件にする。

### 要修正候補・追加調査事項

#### 1. 王国ウォッチリストAPIのACTIVE状態チェック不足（優先度: 高・要再現確認）

`handleKingdomWatchlistApi` は `getAuthenticatedUser()` の結果が存在することだけを確認し、`auth.status === "ACTIVE"` を確認していない。前節の `handleKingdomWatchlistDataApi` / `handleKingdomRankingHistoryApi` と同様、DISABLEDユーザーでも有効な署名済みセッションを保持していれば利用できる可能性がある。プレイヤーウォッチリストやプレイヤーAPIではACTIVEを確認しており、実装が不一致。王国ウォッチリストの全アクション（list/create/refresh/cancel/toggle/delete）に影響する可能性があるため、要修正候補として優先する。実リクエスト再現は未実施。

#### 2. 王国ウォッチリスト一覧GETでのN+1照会と状態更新（優先度: 中〜高）

一覧取得後、ウォッチリストごとに最新ジョブを個別SELECTしており、対象数に比例してD1照会回数が増える。さらに進行中ジョブの復旧判定に該当するとGETリクエスト内でUPDATEする。ユーザー単位の登録上限はあるが、実際の上限・クエリ回数・読み書き量を照合する。まとめて取得できるか、回復処理をジョブ側に集約するべきかは、負荷測定後に判断する。

#### 3. Ownerユーザー一覧の全利用者ウォッチリスト集計（優先度: 中）

`handleOwnerUsersApi` はユーザー一覧自体に最大250件の上限を設定する一方、ウォッチリスト数を付与するために `kingdom_watchlists` と `player_watchlists` をDiscord IDごとに全件GROUP BYしている。利用者数・ウォッチリスト数が増えた場合、検索語や表示件数に関係なく両テーブル全体の集計コストが発生しうる。D1 Query Plan/Query Insightsで確認し、必要なら対象ユーザーだけを集計する形を検討する。

#### 4. Owner読み取りAPIのHTTPメソッド統一（優先度: 低〜中）

`handleOwnerUsersApi`、`handleOwnerLoginHistoryApi`、`handleOwnerAuditLogApi` は読み取り処理だが、対象コード上でGET以外を明示的に拒否していない。現状では更新処理ではないため直ちに権限昇格やデータ改変を意味しないが、API仕様の明確化と一貫性のためGET限定が望ましい。Owner権限自体はハンドラー内で要求している。

#### 5. Ownerロール変更の監査ログ書き込み失敗時（優先度: 中・要エラー経路確認）

ロール/ステータス更新の後に `writeOwnerAuditLog()` を呼んでいる。ユーザー更新が成功して監査ログだけ失敗した場合、API全体がエラー応答となる可能性があるが、ロール/ステータスはすでに変更済みとなる。運用上「失敗に見えるが変更済み」の状態にならないか、D1エラー時の挙動と監査要件を確認する。トランザクション性はこのハンドラー単体では確認できなかった。

### 継続確認

- 王国ウォッチリストの `create` アクションでの王国ID・top_n・interval_hoursの許可範囲、同時登録競合、ジョブ作成とロックの順序を引き続き照合する。
- Ownerプレイヤー連携サポートAPI、Catalogバックフィル、負荷テストAPIの権限・中止・進捗・エラー応答を追跡する。
- ここまでの結果はコード監査。DISABLEDセッションでの拒否、D1負荷、D1障害時の監査ログ整合性はテスト未実施。

| 日付 | 対象 | 結果 | 次のアクション |
|---|---|---|---|
| 2026-10-09 | 王国ウォッチリスト / Owner管理API | 対象ユーザー境界、Owner権限、ロール変更時のVIP判定、自己停止防止、ログ件数上限を確認。王国APIのACTIVEチェック不足、一覧N+1照会/GET内UPDATE、Owner一覧の全件集計、読み取りメソッド制限、監査ログ失敗時の整合性を追加調査事項として記録。 | 王国ランキング・エクスポート・負荷テスト・バックフィルAPIを監査し、続いてmigration/indexと照合する。 |


## フェーズA-1 続き — 王国ランキング・入力正規表現の監査（2026-10-09）

対象: `src/index.js` の `handleAdminKingdomRankingApi`、`handleAdminKingdomRankingExport`、`renderAdminKingdomRankingsPage`、`normalizeMightPulseTimestamp`、`translateLastLogin`。

### 要修正候補 — 正規表現のバックスラッシュ過剰エスケープ（優先度: 高）

現行 `main` のソースを文字列として確認したところ、JavaScriptの正規表現リテラル内に `\\\\d`（ソース上でバックスラッシュが2つ）が使われている箇所が複数ある。正規表現リテラルでは `\\d` は数字クラスではなく、バックスラッシュと `d` にマッチするパターンになるため、通常の数字文字列とは一致しない。

確認箇所:

- `normalizeMightPulseTimestamp()` — `/^\\\\d+(?:\\\\.\\\\d+)?$/`。数値文字列として受け取ったUnix時刻を数値処理する分岐に入らず、`Date.parse()` 側へ進む可能性がある。
- `handleAdminKingdomRankingApi()` — `/^\\\\d+$/.test(kid)`。通常の数字のみの王国IDが入力検証を通過しない可能性が高い。
- `handleAdminKingdomRankingExport()` — 同じ王国ID検証。
- `renderAdminKingdomRankingsPage()` — 同じ判定で画面上の取得処理に入る条件を制限しているため、管理画面のランキング取得・更新も動作しない可能性が高い。
- `translateLastLogin()` — `Last active 12d ago` 等の文字列を変換する正規表現にも同様の過剰エスケープがあり、英語のまま残る可能性がある。

これはソース文字列から確認できた明確な不整合候補であり、通常の数字入力に対してパターンが一致しないことは正規表現の意味から判断できる。ただし、この監査では実行環境でのAPIリクエストやUIテストは行っていない。修正はまだ行わず、関連テストを用意して修正対象として優先度高で記録する。

### 管理ランキングAPIのその他の確認

- `handleAdminKingdomRankingApi` と `handleAdminKingdomRankingExport` は `requireAdmin()` でACTIVEなADMIN/OWNERを要求する。
- kidとboardを検証し、limitは1〜100に制限する。refresh時はAPI Pool経由で取得し、空のランキング配列を成功として保存せず502で返す処理がある。
- Google Sheets出力もADMIN/OWNERに制限し、対象ボードと件数に上限がある。
- ただし、kid正規表現の問題により、これらの正常経路が実際に利用可能かは未確認ではなく、コード上の入力判定に重大な問題候補が存在する状態として扱う。

### 判定と次の作業

- コード確認: 該当箇所の実ソース確認済み。
- テスト確認: 未実施。
- 修正・デプロイ: 未実施。
- 次の作業: 数字文字列/小数表現/Unix秒・ミリ秒文字列/Last active翻訳を対象とした単体テストを用意し、修正前後を確認する。ユーザーの方針に従い、今回は監査記録のみ更新し、コード変更は行わない。

| 日付 | 対象 | 結果 | 次のアクション |
|---|---|---|---|
| 2026-10-09 | 王国ランキング・正規表現 | 数値判定・日時正規化・最終活動翻訳に過剰エスケープ候補を複数確認。王国ランキング管理APIと出力の通常ID入力が拒否される可能性が高い。 | 回帰テストを用意し、後続の機能別修正フェーズで最優先に検証・修正する。 |


## フェーズA-2 — R2履歴保全・Retention実行経路の監査（2026-10-09）

対象: `src/ranking-store.js`、`src/player-store.js`、`src/history-emergency-buffer.js`、`src/retention.js`、`src/index.js` の関数参照とWorkerイベント入口。

### R2_ONLYの履歴保存・読み出しで確認したこと

- 王国ランキングの現在値は `kingdom_ranking_current` と `kingdom_ranking_board_state` に保存される。R2_ONLYではランキング履歴1行ずつを `ranking_snapshots` に書かず、R2アーカイブを試みる。
- R2保存に失敗した場合、王国ランキング・プレイヤー履歴・プレイヤー順位履歴は `history_emergency_buffer` へ退避する設計。容量は `history-emergency-buffer.js` 内で件数50件および総payload byte上限を使って制限され、容量超過時はエラーになる。
- 履歴読み出しはR2を優先する。R2_ONLYでR2読み出しに失敗し、まだD1行が読み込まれていない場合は、互換用のD1履歴を限定条件で読み出すfallbackがある。これは対象ID等で絞った履歴クエリであり、広範囲な `ranking_snapshots` 読み取りを復活させるものではない。
- R2_ONLYで緊急バッファへ退避する経路はあるが、バッファが容量上限に達した場合の挙動はエラーで停止する設計。継続運用にはR2復旧後のバッファ排出経路が必要。

### 要修正候補 — R2緊急バッファの排出処理がWorkerから呼ばれていない（優先度: 高）

- `src/index.js` は `drainHistoryEmergencyBuffer` をimportしているが、現行ファイル内で関数を呼び出している箇所は見当たらない。
- `src/history-emergency-buffer.js` には `drainHistoryEmergencyBuffer()` の実装があり、PENDING/FAILED行を取得してR2へアーカイブし、成功後にD1バッファ行を削除する処理がある。
- `scheduled()` はAPI Pool自動復旧、王国Catalog日次更新、王国Discord通知の3処理を呼び出すが、緊急バッファ排出は呼び出していない。確認した `queue()` にも排出処理はない。

**影響候補:** R2障害中に緊急バッファへ退避した履歴が、R2復旧後も自動でR2へ戻らず、未処理バッファが残り続ける可能性が高い。継続的にR2保存が失敗すると50件/byte上限に達し、その後の履歴保存がエラーになる可能性がある。コード上の呼び出し経路欠落として優先度高で記録する。実際の本番バッファ件数とR2障害復旧後の動作は未確認。

### 要修正候補 — Retentionジョブが定義されているが定期実行経路が見当たらない（優先度: 高）

- `src/index.js` には `runDataRetentionJob(env)` が定義されており、`runRetentionCleanup()` と `archiveSystemEventLog()` を呼び出す。前者は設定済み保持期間に従って各テーブルをバッチ処理し、R2アーカイブ成功後に削除する。後者は24時間を超えたSystem Event LogをR2へ保存した後にD1から削除する設計。
- 現行 `src/index.js` 全体で `runDataRetentionJob` の呼び出し箇所は定義以外に見当たらない。確認した `scheduled()` からも呼ばれていない。
- したがって、少なくともWorkerの定期実行経路からは、設定可能なデータRetentionと24時間System Logアーカイブが自動実行されない可能性が高い。別の外部起動経路があるかは未確認だが、現在のルーター/Workerコードだけでは確認できない。
- `runDiagnosticHealthChecks()` も定義されているが、現行 `src/index.js` 内で呼び出されている箇所は見当たらない。診断プローブが定期実行される前提なら、これも起動経路を確認する必要がある。

### 次に確認すること

1. `runDataRetentionJob`、`drainHistoryEmergencyBuffer`、`runDiagnosticHealthChecks` の想定実行頻度・実行元を仕様/設定/ログで確認する。
2. 呼び出し経路が本当に存在しない場合は、Cronの実行時間・バッチ件数・D1 read/write予算を考慮して、別々に小バッチ化する実装計画を立てる。監査中はまだ追加しない。
3. 緊急バッファの現在件数・bytes・FAILED件数を本番DBから確認し、未処理データが存在するかを確かめる。
4. Retentionが実行されていない場合のD1増加量と24時間ログ要件への影響を、Query Insights/テーブル件数で評価する。

### 判定

- 保存/読み出しコード: 一部確認。
- Worker内の定期起動経路: コード上、呼び出し欠落候補を確認。
- 本番バッファ件数・Retention実行履歴: 未確認。
- コード修正・デプロイ: なし。

| 日付 | 対象 | 結果 | 次のアクション |
|---|---|---|---|
| 2026-10-09 | R2_ONLY履歴 / 緊急バッファ / Retention | R2_ONLYは通常履歴をD1へ書かず、失敗時は上限付き緊急バッファへ退避する設計を確認。一方、緊急バッファ排出、Retention、24時間System Logアーカイブ、診断プローブのWorker内起動経路が見当たらない。 | 本番のバッファ状態と実行ログを確認し、起動経路欠落の有無を確定する。必要な修正は監査完了後に計画する。 |


### フェーズA-2 追加 — 緊急バッファ容量カウントの不整合（優先度: 高）

`src/history-emergency-buffer.js` の `assertEmergencyCapacity()` は件数・byte合計を `status IN ('PENDING','DRAINING')` で集計する。一方、排出対象と状態表示は `PENDING` / `FAILED` を扱い、ステータス集計は `PENDING` / `DRAINING` / `FAILED` を対象にしている。

この差分により、R2排出失敗でFAILEDになった行は、次の追加時の容量チェックから件数・bytesともに除外される。失敗行が蓄積しても上限判定が正しく働かず、緊急バッファの物理的な件数/容量が想定上限を超える可能性がある。さらに前節のとおり、Workerから排出処理を呼ぶ経路も確認できていないため、優先度を高として記録する。

- 実装根拠: `assertEmergencyCapacity()` のCOUNT/SUM条件と、排出処理・status取得処理の対象ステータスが一致していない。
- テスト: 未実施。
- 修正: 未実施。
- 次の確認: PENDING/FAILED混在時の件数・bytes計算、排出失敗→再試行→容量上限、D1緊急バッファの実データをテストする。容量判定の対象状態を統一し、排出経路を確認した後に修正する。


## フェーズA-2 追加 — バックグラウンド収集機能の接続状態 / R2 binding照合（2026-10-09）

対象: `src/index.js`、`src/kingdom-ranking-roller.js`、`src/player-roller.js`、`src/alliance-catalog.js`、`src/kingdom-seeder.js`、`wrangler.jsonc`。

### 要確認 — 実装済みローラーがWorkerの実行経路につながっていない（優先度: 高・仕様確認が必要）

`src/index.js` では次の関数をimportしているが、現行 `index.js` 内に呼び出し箇所が見当たらず、確認した `src/全モジュール` の参照検索でも定義・import以外の実行呼び出しを確認できなかった。

- `runKingdomRankingRoller()`
- `runPlayerRoller()`
- `runAllianceRoller()`
- `runKingdomSeeder()`

現在の `scheduled()` はAPI Pool自動復旧、王国Catalog日次更新、王国Discord通知のみを呼び出す。上記4つの関数はそれぞれ小バッチ・カーソル・診断ログ等を実装しているが、WorkerのCron/Queue/HTTPルートから実行されていない可能性が高い。

**判定:** これらを定期収集機能として運用する設計なら、実装だけ存在して起動経路が未接続という重要な欠落候補。一方、現在意図的に停止中・将来用の機能である可能性はコードだけでは確定できないため、仕様確認前に「障害」と断定しない。次にSystem Status表示、DBの各collection_state、過去ログ、引き継ぎ文書を照合する。

### 要修正候補 — R2 binding名の不一致（優先度: 高）

`wrangler.jsonc` のproductionおよびpreview設定で確認できるR2 binding名は `ARCHIVE`。一方、次の収集関数は `env.R2_ARCHIVE` を参照している。

- `src/kingdom-ranking-roller.js`: `saveKingdomRankingBoard()` に `archiveBucket: env.R2_ARCHIVE` を渡す。
- `src/player-roller.js`: `materializePlayer()` に `env.R2_ARCHIVE` を渡す。
- `src/alliance-catalog.js`: `env.R2_ARCHIVE` が存在する場合だけR2履歴保存を試みる。

`wrangler.jsonc` には `R2_ARCHIVE` というbindingが見当たらないため、設定ファイルどおりの環境ではこれらの処理にR2 bucketが渡らない可能性が高い。特にAlliance RollerはR2 bucketがなければ変更履歴を緊急バッファへ退避した後にエラーにする実装で、Player/Ranking RollerもR2_ONLYの履歴保存時に緊急バッファへ進む可能性がある。

ローラー自体の起動経路が現時点で確認できていないため、実際にこの不整合が本番で発火しているとは断定しない。しかし、関数を起動する設計であれば、起動接続と同時にbinding名を必ず確認・修正すべきである。実行環境にDashboard側の別bindingが設定されているかは未確認。

### 次の確認

1. 4つの収集関数が現在運用対象か、停止中/未接続の予定機能かを引き継ぎMD・Status・DB state・直近ログで確認する。
2. 運用対象なら、起動頻度・1回の件数・同時実行数・Safety Gate・D1/API消費を確認し、Cronに直接大量処理を追加せず小バッチ設計を検討する。
3. `env.ARCHIVE` と `env.R2_ARCHIVE` の全コード検索を完了し、Cloudflare設定と名称を統一する。
4. R2保存成功・失敗・緊急バッファ排出を含むE2Eテストを用意する。

| 日付 | 対象 | 結果 | 次のアクション |
|---|---|---|---|
| 2026-10-09 | ローラー/Seeder起動経路とR2 binding | 収集ローラー3種とSeederは定義/importされているが、Workerからの実行呼び出しを確認できず。コードは `R2_ARCHIVE`、Cloudflare設定は `ARCHIVE` で名称不一致を確認。 | 機能が運用対象かを確認し、実行経路・DB state・本番ログを照合する。必要なら起動接続とbinding修正を別の実装作業として計画する。 |
