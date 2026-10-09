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
