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


## フェーズA-2 追加 — 公開Statusページの内部エラー文面表示（優先度: 中・秘匿情報レビュー）

対象: `src/index.js` の `renderPublicStatusPage()`、`src/status-ops.js` の `getOperationalStatus()`。

公開ルート `/status` は、Cloudflare使用量の詳細をADMIN/OWNER以外には隠す分岐がある一方、公開ページ自体は `getOperationalStatus(env.DB)` と `getSystemDiagnostics()` の結果を取得する。

確認したHTML生成では、次の内部エラー文面がエスケープされたうえで公開ページに表示される。

- API Poolの最新キーに紐づく `lastErrorMessage`
- 王国ウォッチリストの最新ジョブに紐づく `lastError`
- MightPulse診断イベントの `last_error_code` または `last_message`

HTMLエスケープはHTML注入対策であり、内容の秘匿化とは別である。エラー文面が一般化された固定メッセージか、上流レスポンスや内部識別子を含みうる文字列かを確認する必要がある。公開Statusの運用方針として状態・件数を見せること自体は意図的だが、詳細エラー文面まで公開する必要があるかは別途判断する。

- 現時点でAPIキー本体が表示されている事実は確認していない。
- 直ちに秘密情報の漏えいと断定せず、公開応答に含まれる可能性のある情報をレビュー対象として記録する。
- 次の確認: `recordApiPoolFailure()`、ウォッチリスト失敗処理、診断ログの全メッセージ生成元を追跡し、token/key/Discord ID/内部ID/生レスポンスの混入有無を確認する。公開表示はエラーコードと定型文に限定する案を検討する。

| 日付 | 対象 | 結果 | 次のアクション |
|---|---|---|---|
| 2026-10-09 | 公開 `/status` エラー文面 | Cloudflare使用量の詳細はADMIN/OWNERに制限されるが、Pool/Watchlist/MightPulseの一部エラー文面は公開HTMLに表示されることを確認。 | メッセージ生成元を追跡し、公開表示に内部情報が含まれないか確認する。 |


## フェーズA-1/ B — GETリクエストによる高コスト処理の起動（優先度: 高）

対象: `src/admin-kingdom-load-test.js` の `handleOwnerKingdomLoadTestApi()`、`src/index.js` の `handleAdminKingdomRankingApi()`、`handlePlayerApi()`。

### 確認できたコード上の挙動

- `handleOwnerKingdomLoadTestApi()` は `request.method !== "GET"` を405で拒否する一方、王国リストを受け取り、Safety Gateを評価し、Run/Jobレコードを作成し、Load Test Queueへメッセージを送る。つまり、負荷テスト開始という副作用を持つ処理がGETで起動される。
- `handleAdminKingdomRankingApi()` は `refresh=1` をGETクエリで受け取り、MightPulseからランキングを取得し、D1/R2の保存処理を実行する。
- `handlePlayerApi()` は `refresh=1` をGETクエリで受け取り、API Pool経由でMightPulseから取得し、観測データとプレイヤー状態を保存する。
- `handlePlayerRefresh()` はメソッド制限を持たず、対象IDがあれば取得・保存処理へ進む。

### リスク評価

GETはブラウザーのリンク遷移・プリフェッチ等から意図せず呼ばれやすい。Owner/Adminの認証があることだけでは、状態変更や外部API消費を伴うGETのCSRF/誤起動リスクは解消しない。特にLoad Testは最大1000王国を受け付けるため、意図しない起動がAPI Pool・D1・Queueを消費する可能性がある。

現行UIがGETで呼び出している経路もあるため、サーバーだけをPOSTへ変えるのではなく、UI呼び出し・CSRF対策・Safety Gate・Queue起動を一体で確認する必要がある。

### 次の作業

1. Load Test開始をPOSTへ移し、bodyでパラメータを受け取る設計を検討する。認証Cookieを使うため、Origin/CSRFトークン等の検証方針も確認する。
2. ランキングrefreshとプレイヤーrefreshも、読み取りGETと更新POSTを分離する方針を検討する。
3. 実装変更前に、既存UI・iPhone Safari・同一Run二重起動防止・Safety Gate・Queue失敗時の回復を回帰テスト項目にする。

### 判定

コード上のHTTPメソッドと副作用の不一致は確認済み。実際のCSRF再現、外部サイトからの起動、ブラウザープリフェッチによる起動は未実施。コード修正・デプロイは行っていない。

| 日付 | 対象 | 結果 | 次のアクション |
|---|---|---|---|
| 2026-10-09 | GETで起動されるLoad Test/refresh | Load Test開始、ランキング更新、プレイヤー更新がGET経路で実行されうることを確認。 | UIと連動してメソッド・CSRF対策を設計し、別工程で修正する。 |


## 監査追記：運用ジョブ・ロードテスト・外部連携・Migration（2026-10-09 続き）

### 監査対象
- `src/index.js`（全9,024行を取得し、import・ルーティング・scheduled/queue実行経路を照合）
- `src/admin-kingdom-load-test.js`
- `src/kingdom-catalog-r2-backfill.js` / `src/kingdom-catalog-r2-backfill-page.js` / `src/kingdom-catalog-r2-backfill-verify.js`
- `src/api-pool.js` / `src/safety-gate.js` / `src/collection-semaphore.js` / `src/data-collection-engine.js`
- `src/status-ops.js` / `src/diagnostics.js` / `src/history-emergency-buffer.js`
- `src/google-drive.js` / `src/google-sheets.js` / `src/discord-notifications.js` / `src/service-usage-archive.js` / `src/system-event-queue.js`
- D1 migrations 0001〜0058、D1 migration関連GitHub Actions workflow、`wrangler.jsonc`

### 追加所見

#### [高] 緊急履歴バッファの排出関数はimportのみで、実行呼び出しがない
- `src/index.js` は `drainHistoryEmergencyBuffer` をimportしているが、関数呼び出しは確認できない。
- `scheduled()` はAPI Pool自動復旧、王国カタログ定期更新、Discord通知を実行するが、緊急履歴バッファ排出を実行していない。
- `queue()` もSystem Event、ロードテスト、Service Usageを処理するが、緊急履歴バッファ排出を実行していない。
- R2保存失敗時にバッファへ退避した履歴が、自動復旧後も排出されず残り続ける可能性がある。実DBのPENDING/DRAINING/FAILED件数は未確認。
- 既記録の「FAILED行が容量判定から除外される」問題と合わせ、履歴保全の運用上の優先確認項目とする。

#### [高] データRetentionと診断プローブの自動実行経路が見当たらない
- `src/index.js` に `runDataRetentionJob(env)` と `runDiagnosticHealthChecks(env)` が定義されているが、実行呼び出しを確認できない。
- `scheduled()` にも両関数の呼び出しはない。現状のCron設定は5分ごとだが、設定されていることと各処理が実行されることは別。
- 管理APIからRetention設定の取得・変更はできるが、設定変更とRetentionクリーンアップの実行は別処理。自動実行されない場合、設定された保持期間を超える履歴がD1に残る可能性がある。
- System Event Logのアーカイブ処理もRetentionジョブ内の経路に依存しているかを追加確認する。関数が存在することだけで定期実行済みとは判定しない。
- 本番での最終実行時刻、削除件数、R2アーカイブ件数は未確認。

#### [中] D1 Migrationファイルの番号「0008」が重複
- `migrations/0008_data_retention.sql` と `migrations/0008_kingdom_watchlist_jobs.sql` が共存している。
- ファイル名の重複番号だけで適用障害とは断定しない。WranglerがMigration名を個別管理することを前提に、実環境の `d1_migrations` とファイル一覧の照合が必要。
- 0017以降には、本番スキーマとMigration履歴の乖離を検査・修復する専用workflowが存在する。Migration適用前に本番の適用済み一覧と実スキーマを確認し、未確認のまま再適用しない。
- `eagleeye-d1-load-test-schema-recovery.yml` は明示的にdeprecatedとして停止する設計。旧Recovery経路を再利用せず、Schema Reconciliation workflowを正規経路として扱う。

#### [中] 王国カタログR2バックフィルはOwner専用・手動起動・最大100件のバッチ
- `/api/admin/kingdom-catalog-r2-backfill` は `requireOwner()` によりACTIVEなOWNERを要求し、POST以外の変更要求は拒否する。
- バックフィル関数は1回あたり最大100件で、Cronから呼ばない設計。R2保存成功後にD1側の処理済みポインタを更新する順序を確認。
- UIの「全件実行」表示は一度の無制限実行ではなく、単回のバッチサイズを100にする実装。継続実行は操作の反復が必要。
- 画面表示時に未アーカイブ候補の `COUNT(*)` を実行するため、カタログが大きくなった後のD1読み取り負荷はインデックス・Query Insightsで確認する。現時点では実測未実施。

#### [中] Ownerロードテストの保護策は実装されているが、本番負荷テストは未実施
- `src/admin-kingdom-load-test.js` にはOWNER確認、HTTPメソッド制限、実行ロック、キャンセルマーカー、進捗・メトリクス保存、最大対象件数制限、Safety Gate、通常API利用向けキー予約の実装がある。
- 対象王国数の上限は1,000。API呼び出しは共通の収集ガード/API Poolを経由する設計。
- ただし、キャンセル直後の停止時間、Queue再試行、Worker中断後の状態復旧、Cloudflare消費量の計測精度、長時間実行の挙動はコード確認だけでは保証できない。実機/本番負荷テストの結果と照合が必要。
- 本監査では負荷テストを起動していない。

#### [中] Google Drive / Google Sheets連携は別々の認証方式で、設定・権限・失敗経路の実測が未完了
- Google DriveはOAuth/Refresh Token方式、Google SheetsはService Account JWT方式。必要な環境変数が不足する場合のエラー処理は実装されている。
- Google Driveの接続・再認証・検証操作はOwner限定であることをルートから確認。OAuth callbackはstateトークンを検証する。
- 実際のCloudflare Secret/Variablesの設定値、Google側権限、トークン更新、R2からDriveへのアップロード成功は本監査からは確認できない。Secretの値は調査記録へ出力しない。

#### [確認継続] D1コスト・権限・実運用
- `handleOwnerUsersApi` は王国/プレイヤーウォッチリスト数の付与のため、各ウォッチリストテーブルを全件GROUP BYするクエリを実行する。利用者数・ウォッチリスト件数が増えた場合の読み取り量を要確認。
- ウォッチリストの最新ジョブを個別に取得するN+1候補、`change_events` を参照するプレイヤーウォッチリストAPIも継続調査対象。
- `ranking_snapshots` の広範囲読み取りは復活させない。現行/集計テーブルを使い、必要な場合も対象・期間・件数を限定する。
- Migration 58本のファイル存在と主な適用workflowを確認したが、本番D1の適用済みMigration一覧・全テーブル/列/インデックスとの完全一致はまだ未確認。
- 本追記はコードとworkflowの静的監査であり、本番API・本番DB・E2Eの実行結果ではない。

### この時点の監査状態
- ルーティング/主要モジュール/定期処理/Queue/Migration workflowの一次照合を継続中。
- コード修正・Migration適用・本番操作・デプロイは実施していない。
- 次に残る作業：全ルートと認可/HTTPメソッドの照合、SQLとMigration/インデックスの照合、残りのsrc/public/scripts/toolsの棚卸し、テスト構成・CIの確認、機能台帳の未確認項目を明示したうえで一巡完了判定。


## 監査追記：ルート認可・HTTPメソッド・Status/D1負荷（2026-10-09 続き）

### APIルート一次照合

#### [高] 王国ウォッチリスト関連の一部APIはACTIVE状態を検証していない
- `handleKingdomRankingHistoryApi`、`handleKingdomWatchlistDataApi`、`handleKingdomWatchlistApi` は `getAuthenticatedUser()` の存在だけを確認し、`auth.status === "ACTIVE"` を統一的に確認していない。
- これらの関数は無効化ユーザーの認証情報も取得できる `getAuthenticatedUser()` の挙動と組み合わさるため、DISABLEDユーザーが履歴閲覧・ウォッチリスト操作を継続できる可能性がある。再現テスト未実施。
- 他の主要API（プレイヤーウォッチリスト、マイプレイヤー、Advanced/VIP操作等）ではACTIVE確認を実装しており、認可方針の不統一がある。

#### [中] プレイヤー更新APIでHTTPメソッド制限が見当たらない
- `handlePlayerRefresh` はACTIVE認証を確認するが、関数内に明示的なHTTPメソッド制限が見当たらず、クエリの領主IDに対して外部API取得と保存処理を実行する。
- `handlePlayerApi` もGET/POST等のメソッドを明示的に限定していない一方、`refresh=1` によってデータ更新経路に入る設計。
- ブラウザの通常操作でどのメソッドが使用されるか、想定外メソッドが実際に更新処理へ到達するかは未検証。メソッド制限・更新APIと参照APIの分離を要確認。

#### [確認済み] Ownerロードテスト / バックフィルの入口はOwnerガードを持つ
- `/api/owner/kingdom-load-test/*` のルートはOwnerガードを通し、`/api/admin/kingdom-catalog-r2-backfill` は関数内で `requireOwner()` を通す。
- Google Driveのauthorize/verify/callbackもOwner限定。Discord Supportのコマンド登録はACTIVEなADMIN/OWNERを要求。
- ただし、`/api/load-test/notice-status` や各 `/api/admin/*` の一部は専用ハンドラー内の認証で保護する方式のため、ルート行だけで認証有無を判断しない。引き続き全ハンドラー本文まで照合する。

### [高] システム状況画面の生成でウォッチリスト全件を読み込む
- `src/status-ops.js` の `getOperationalStatus()` は `kingdom_watchlists` を `ORDER BY created_at ASC` で全件取得し、Discordユーザー別に集計している。ページ表示/更新頻度と件数次第でD1 read負荷が増える。
- API Poolのリース詳細も `leased_until IS NOT NULL` の全件を取得し、`api_pool_keys` の件数に応じて増加する。
- Ownerユーザー一覧APIでも王国・プレイヤーウォッチリストの全件GROUP BYを行っており、同様に件数依存の読み取りコストがある。
- ステータス画面は60秒ごとの自動更新設定を持つ。実際のアクセス頻度は未確認だが、画面を開いている間は上記クエリが繰り返される構成となっている。
- 対応検討時は単なる表示件数制限だけでなく、集計SQL化・必要項目の限定・更新頻度/キャッシュ・Query Insightsによる実測を比較する。現時点では変更しない。

### [要確認] ユーザー提供MightPulseキー数の仕様
- `src/user-eligibility.js` では `MAX_USER_CONTRIBUTED_MIGHTPULSE_KEYS = Number.POSITIVE_INFINITY` とし、ユーザー提供キー数を意図的に上限なしとするコメントがある。
- 以前の運用要件として認識している「MightPulse APIキー数の上限」と対象が同じかは未確定（システム共有キーとユーザー提供キーは別プール）。要件の対象・上限値を機能台帳で明確にし、コード上の仕様と照合する。現段階で仕様違反とは断定しない。

### ルート監査の残件
- 全APIのACTIVE確認、ロール条件、HTTPメソッド、ユーザー所有権照合、外部API実行の制限をルート単位で完了させる。
- `/api/kingdom-watchlist/history` / `data` の権限不足候補、`/api/player/refresh` のメソッド制限不足候補は優先度高めで要再現確認。
- D1使用量はコードからの推定にとどまる。Query Insights、本番メトリクス、実際のテーブル件数なしに消費量を断定しない。


## フェーズA-3 — リポジトリ構成・migrationの初回全件棚卸し（2026-10-09）

### リポジトリ構成

- `src/` は51個のJavaScriptモジュールを確認。Worker入口、データ取得、API Pool、D1/R2保存、ランキング、Catalog、UI、Owner管理、Discord/Google連携、診断・ログ・負荷テストに分類して監査を継続中。
- `migrations/` は59個のSQLファイルを確認（連番0001〜0058に加え、同じ0008番号の別migrationが存在）。
- `.github/workflows/` にはD1 migration適用、D1 schema reconciliation、0053 production drift repair、Status JSON比較、ヒーロー装備アセット収集等のworkflowが存在する。
- リポジトリルートには `package.json` と `tests/` ディレクトリが見当たらず、今回の構成確認時点では標準的な自動テストスイートを確認できなかった。scriptsにはD1 schema reconciliation、production drift reconciliation、hero gear asset collectionがある。実行可能なテスト手段の全容は未確認。

### migration初回照合で確認したこと

- 0001〜0058のDDLを初回棚卸しし、主要テーブル・インデックス・ALTER TABLE・テーブル再構築・データ移行の存在を分類した。
- 0003、0026、0055、0056などにはSQLiteの制約変更のためのテーブル再構築がある。過去migrationとしての定義確認であり、これらを再実行する指示ではない。
- 0011/0012/0045などにはプレイヤー履歴、ウォッチリスト、変更イベントの検索用インデックスがある。ウォッチリスト変更イベントの負荷は、インデックスが存在しないと決めつけず、実行計画と実データ量で判断する。
- 0034/0036はグローバルSemaphoreを作成・初期化し、0036では1000スロットを事前生成する。
- 0048〜0051はCatalog/Alliance/PlayerのR2最新キー参照列とインデックスを追加し、0049はCatalogバックフィル状態テーブルを追加する。
- 0053〜0056は表示権限・VIPロール/Watchlist上限のスキーマ整合性に関する変更を含む。0056ではusersとwatchlist_limitsを再構築するため、本番適用状態とmigration記録の一致が重要。
- 0058はユーザー別ランキング設定テーブルを作成する。

### 未確認事項

- 本番D1で59ファイルすべてが適用済みか、適用順序が正常か、手動schema修復との不整合がないかは、Cloudflare D1への本番照会結果なしでは確定できない。
- migration workflowは手動起動であり、ファイルがmainにあることは本番適用済みを意味しない。
- 全テーブルの全カラム・全インデックスを利用コードと一対一で対応付ける作業は未完了。次のフェーズで高頻度クエリ・R2 pointer・collection state・Owner audit・retentionの順に利用コードと照合する。

| 日付 | 対象 | 結果 | 次のアクション |
|---|---|---|---|
| 2026-10-09 | src/migrations/workflows初回棚卸し | src 51モジュール、migration 59ファイル、主要workflowの構成を確認。DDLの初回分類を実施したが、本番適用状態と全テーブル利用コードの対応は未完了。 | 残りモジュールの依存関係を整理し、主要テーブル/インデックスとクエリを対応付ける。 |


## 監査追記：OAuth設定・Status公開経路・重複資産（2026-10-09 続き）

### [高 / 設定不一致] Google Drive OAuth Redirect URIが専用Callbackルートと一致していない
- `wrangler.jsonc` の本番・Preview設定で、`GOOGLE_DRIVE_OAUTH_REDIRECT_URI` がDiscord用と同じ `/api/auth/callback` になっている。
- Google Drive認証コード交換も同じ環境変数を `redirect_uri` に使用する一方、専用Callbackハンドラーは `/api/admin/google-drive/callback` にルーティングされている。
- この設定のままでは、Googleからの認証応答がDiscord Callbackへ送られ、Google Driveのstate検証・認証コード交換に到達しない可能性が高い。OAuth設定画面のURLを実際に確認する前提で、設定とGoogle Cloud側の登録URIを修正計画の最優先候補とする。
- 本番のCloudflare Variables/SecretsおよびGoogle Cloud Consoleの実設定は参照していないため、Wranglerファイル外で上書きされている可能性は未確認。コード変更・OAuth接続テストは未実施。

### [高 / D1負荷] 公開Statusページがアクセスのたびに診断と運用状況を問い合わせる
- `/status` は公開ルートで、アクセスごとに `getSystemDiagnostics(... recentLimit: 100)` と `getOperationalStatus()` を実行する。
- `getOperationalStatus()` は複数のD1集計に加え、ウォッチリスト詳細・有効なAPI Poolリース詳細などを取得する。前記の通りウォッチリスト全件読み込みも含む。
- ページには60秒ごとの自動更新があり、匿名アクセスでも診断・運用状況のD1クエリが発生する構成。アクセス頻度・Cloudflareキャッシュ設定・実行回数制限は未確認。
- D1 Free読み取り量の方針上、公開画面向けに必要最小限の集計を返す経路、キャッシュ、レート制限、診断詳細取得の分離を優先検討する。現時点では読み取り量を実測していない。

### [中] Status JSON Comparatorの公開用コピーが2系統あり、内容が大きく異なる
- Workerの `/status-json-comparator` は `public/status-json-comparator.html` を配信する。
- GitHub Pages workflow `.github/workflows/status-comparator-pages.yml` は `tools/status-json-comparator.html` を `index.html` として公開する。
- 現在、`public/` 側は約24 KB / 387行、`tools/` 側は約9.5 KB / 151行で、内容が大きく異なる。両者が意図的に別バージョンなのか、旧版が残っているのかは不明。
- D1/Cloudflare利用量JSONの比較結果がアクセス先によって違う可能性があるため、正本を決めて同期するか、意図した機能差を明文化する必要がある。自動同期テストは見当たらない。

### [中 / 保守性] 未参照の可能性がある実装ファイル
- `src/index.js` には `src/user-mighty.js` のimport/関数呼び出しが見当たらず、同モジュールのMighty資格情報処理とは別に、現在は `src/user-eligibility.js` を経由するMightPulseキー登録・Mighty判定処理が存在する。
- 同様に `src/d1-retry.js` の `withD1TransientRetry` / `isD1TransientError` は `src/index.js` から参照されていない。
- これらはindex.js以外から参照されている可能性があるため、現時点では「リポジトリ全体で未使用」と断定しない。全モジュール間のimport参照を照合し、旧実装・重複実装・未接続機能として機能台帳に分類する。

### [確認制限] 自動テスト・CI
- ルートの一覧には `package.json`、専用testディレクトリ、一般的なテスト実行workflowが見当たらず、確認できたworkflowは手動Migration/Schema Reconciliation、Status Comparator Pages、Hero Gear Asset収集が中心。
- これはテストが存在しないことの完全な証明ではないが、本監査で自動テストを起動して全ルート・SQL・UIを検証できる仕組みは確認できていない。
- 今回はGitHub上の静的コード確認のみ。構文検査、ユニットテスト、E2E、実API、本番DB、OAuth接続テストは実施していない。

### 追加確認事項
- Google Drive OAuth URIはコード上の明確な不一致として最優先で扱う。ただし本番実設定が別途上書きされているかを先に確認し、監査中は修正しない。
- 公開Statusは「サービス稼働状況の公開」と「内部詳細・D1コスト」の境界を再点検する。
- Status Comparatorの正本・同期方式、未参照モジュールの全体参照、テスト手段を機能台帳の残件として管理する。


## 監査追記：D1 Schema ReconciliationのMigration/Index完全性（2026-10-09 続き）

### [中〜高 / 本番スキーマ照合の抜け候補] Migration履歴をまとめて記録する一方、一部インデックスを再構成していない
- `scripts/reconcile-d1-schema.mjs` は `--apply` 時に `0017_api_pool_atomic_lease.sql` から `0043_alliance_collection_state.sql` までを `d1_migrations` に `INSERT OR IGNORE` する。
- 同スクリプトはテーブル・列・主要インデックスの一部を補修するが、ソース確認上、少なくとも以下のMigration由来インデックスを明示的に `ensureIndex()` していない：
  - `0019_watchlist_runtime_schema.sql`: `idx_kingdom_watchlist_jobs_active`, `idx_kingdom_watchlist_jobs_updated`
  - `0020_audit_history_r2_retention.sql`: `idx_login_history_logged_in_at`, `idx_owner_audit_created`
  - `0021_api_pool_identity_r2_retention.sql`: `idx_api_pool_usage_used_at`, `idx_player_identity_history_last_seen`
  - `0023_player_link_support.sql`: `idx_player_link_support_requester`, `idx_player_link_support_governor`
  - `0025_api_pool_user_contributed_index.sql`: `idx_api_pool_keys_user_contributed`
  - `0027_diagnostic_status_created_index.sql`: `idx_diagnostic_events_status_created`
- これらのインデックスが本番に既に存在すれば問題は顕在化しない。ただし、物理スキーマから欠落している場合でもMigration履歴だけ記録されると通常の `wrangler d1 migrations apply` が再実行しないため、欠落が残る可能性がある。
- 実際の本番インデックス一覧は未取得のため、欠落確定ではない。Reconciliation実行前に上記インデックスを含む全DDLを現行Migrationと比較し、スクリプトの補修対象と事後検証項目を完全一致させる必要がある。Reconciliation/本番変更は今回実施していない。

### [中 / 旧スキーマ残存候補] コレクションSemaphoreの旧カウンターテーブル
- `0034_global_collection_semaphore.sql` は `collection_semaphore` カウンターテーブルを作成し、`0036_collection_semaphore_slots.sql` はスロット方式の `collection_semaphore_slots` を追加する。
- 現在の `src/collection-semaphore.js` は `collection_semaphore_slots` を利用する。旧 `collection_semaphore` はReconciliationスクリプトにも保持・初期化処理が残っている。
- 互換性/復旧用途で意図的に残している可能性があるため削除候補と断定しない。実際の参照箇所、移行履歴、復旧手順を照合し、未使用テーブルかレガシー復旧用かを機能台帳で明確にする。


## 監査追記：Hero Gear Asset Collectorの正規表現（2026-10-09 続き）

### [中 / スクリプト機能不全候補] HTML画像抽出用正規表現のバックスラッシュ過剰エスケープ
- `scripts/collect-hero-gear-assets.mjs` の `extractImageUrls()` で、画像タグ検出が `/<img\\\\b.../`、OG画像メタタグ検出が `/<meta\\\\b.../` 相当のソースになっている。通常のHTMLタグで使う単語境界 `\b` ではなく、バックスラッシュを含む文字列を探す正規表現になっている可能性が高い。
- srcset候補の分割にも `split(/\\\\s+/)` 相当があり、空白文字ではなくバックスラッシュを含む文字列にしか一致しない可能性がある。
- 通常の `<img src="...">` / `<meta property="og:image"...>` を拾えず、srcset候補もdescriptor付きURLを正しく分離できないおそれがある。
- GitHub ActionsのHero Gear Asset Collectorは手動実行workflowで、今回起動していない。HTMLのサンプル入力に対する単体テストを作ってから修正する候補として記録。コード変更・workflow実行は未実施。

### 正規表現監査の横断メモ
- `src/index.js` にも同種の過剰エスケープ候補があり、`normalizeMightPulseTimestamp()` の数字/小数文字列判定、管理王国ランキングAPI/CSV・Google Sheets出力の王国番号判定、管理ランキング画面の表示条件、`Last active Nd ago` 翻訳に影響する可能性がある。
- これらは単にソース上の文字列だけでなく、JavaScript正規表現として実際に数字へ一致するかをテストで確定する。現時点では未修正。


## 監査追記：Worker設定・Preview差分・Owner APIメソッド（2026-10-09 続き）

### [中 / Preview構成差分] SYSTEM_EVENT_QUEUEのPreview bindingがない
- 本番の `wrangler.jsonc` には `SYSTEM_EVENT_QUEUE` producerと `eagleeye-system-events` consumerがあるが、`previews.queues.producers` にはSERVICE_USAGE_QUEUEとLOAD_TEST_QUEUEのみでSYSTEM_EVENT_QUEUEがない。またPreview側にはconsumer設定もない。
- Previewでsystem event記録がキュー送信を前提とする経路に入ると、本番と異なるフォールバック/失敗挙動になる可能性がある。
- PreviewでのQueue送信時に直接D1へフォールバックするか、エラーになるかは実行未確認。Previewは本番D1/R2を参照する設定にもなっているため、Previewを本番データから隔離する必要性も含めて別途確認する。今回Previewを起動していない。

### [中 / メソッド制限の不統一] API Pool管理の変更ハンドラー
- `handleApiPoolAdd`、`handleApiPoolMove`、`handleApiPoolRevoke`、`handleApiPoolHealthCheck` などはADMINガードを持つが、関数冒頭でPOST等の明示的メソッド制限が見当たらない。
- JSON/FormDataのボディを受け取るため、想定外のPUT/PATCH等でも処理経路に到達する可能性がある。ADMIN/OWNER権限自体は検証しているが、HTTPメソッドの契約・監査ログ・二重送信防止の観点で統一が必要。
- GETで実際に更新が成立するとは確認していない。メソッド別の実行テストは未実施であり、現段階では実装不統一として記録する。

### [確認済み] Migration Reconciliationの安全停止策
- 本番D1 Schema Reconciliation workflowは手動起動のみで、`RECONCILE_PRODUCTION` の明示入力を要求し、事前のD1 Time Travel bookmarkとMigration状態を記録する。
- 旧Load Test Schema Recovery workflowはdeprecatedで、実行時に明示的に失敗終了する。
- ただし前節のとおり、Reconciliation後の検証はSemaphoreスロット数とMigration履歴中心で、全インデックスの完全一致までは検証していない。


#### [高・コード上で確定] Google Drive OAuthのRedirect URIと実装コールバックルートが不一致
- `wrangler.jsonc` の `GOOGLE_DRIVE_OAUTH_REDIRECT_URI`（通常varsおよびpreview vars）は `https://kingshot-data-platform.black-jack-kingshot.workers.dev/api/auth/callback` を指定している。
- `src/index.js` ではGoogle Driveのコールバック処理を `/api/admin/google-drive/callback` にルーティングし、Discordログイン用の `/api/auth/callback` は別処理としている。
- `src/google-drive.js` はOAuth認可URL生成と認可コード交換の両方に `GOOGLE_DRIVE_OAUTH_REDIRECT_URI` をそのまま使う。このため、現在の設定値のままGoogle Drive認証を行うと、GoogleからDiscordログイン用コールバックへ戻り、Google Drive用の認可コード交換処理に到達しない可能性が高い。Google Cloud側の実際の登録値・本番動作は未確認だが、リポジトリ内の設定と実装の不一致は確認済み。
- 修正は今回行わない。対応時はCloudflare vars/preview vars、Google Cloud OAuthクライアントの許可済みRedirect URI、`/api/admin/google-drive/callback` の3点を同時に合わせ、認証成功・拒否・state不正のテストを実施する。


## 監査追記：正規表現の実動作・API Pool更新メソッド・テスト構成（2026-10-09 続き）

### [高] 既存記録の正規表現問題を別モジュールにも確認
実ソースの正規表現リテラルを確認したところ、文字クラス等を意図したバックスラッシュが二重になっている候補が複数あり、単なる表示上のエスケープではない可能性が高い。未修正・未実行テスト。

- `src/index.js:569`：`normalizeMightPulseTimestamp()` の `/^\\d+(?:\\.\\d+)?$/` は、数字だけの文字列や小数文字列を想定どおり認識しない可能性がある。数値型のタイムスタンプは別分岐だが、APIから文字列で来る場合に日時正規化が失敗し得る。
- `src/index.js:7550台〜7690台`：王国ID検証 `/^\\d+$/` が管理ランキングAPI、CSV出力、管理ランキング画面で使われる。数字だけの王国IDが拒否され、取得・出力が動かない可能性がある。
- `src/index.js:7304-7306`：`Last active 12d ago` 等を翻訳する `/^(...) (\\d+)d ago$/` 系の正規表現が数値部分にマッチしない可能性がある。
- `src/index.js:1382`：短縮数値の末尾ゼロを除去する `replace(/\\.?0+$|\\.$/,...)` も意図した小数表記を処理しない可能性がある。
- これらは共通の回帰テストで、整数文字列・小数文字列・ISO日時・秒/ミリ秒タイムスタンプ・Last active各単位・短縮表示を検証してから一括修正すべき項目。コード監査だけでは本番影響の範囲は確定していない。

### [高・補助スクリプト] ヒーロー装備アセット収集スクリプトのHTML抽出正規表現に過剰エスケープ候補
- `scripts/collect-hero-gear-assets.mjs` の `extractImageUrls()` では、画像タグの境界を探す `/<img\\b.../`、metaタグの `/<meta\\b.../`、srcset分割の `/\\s+/` が二重バックスラッシュを含む形で記述されている。
- JavaScriptの正規表現リテラルとしてこの記述が実行される場合、通常のHTMLタグ境界や空白にマッチせず、画像候補を抽出できない可能性が高い。GitHub Actionsの `hero-gear-assets.yml` から手動起動される補助ツールであり、本番Workerのリクエスト処理とは別系統。
- スクリプト実行は行っていない。修正時は外部取得を伴わない小さなHTML fixtureで `img` / `srcset` / `og:image` の単体テストを用意する。

### [中] API Poolの一部更新/検証ハンドラーに明示的HTTPメソッド制限がない
- `handleApiPoolAdd`、`handleApiPoolMove`、`handleApiPoolRevoke`、`handleApiPoolDelete`、`handleApiPoolHealthCheck`、`handleApiPoolTestPlayer`、`handleApiPoolTestRanking` は関数冒頭でHTTPメソッドを限定していない。一方、`handleApiPoolMightyCheck` はPOSTのみを明示している。
- 多くはADMIN/OWNER認証を行うが、JSON本文を読む経路ではPOST以外のメソッドでも処理へ入る可能性がある。権限のない利用者からの直接操作が可能と断定するものではないが、HTTP契約と副作用を伴う操作の保護方針が不統一。
- 各ルートのUIが実際に使用するメソッド、GET/PUT/PATCH等での到達可否、CSRF対策・Cookie属性を確認する。今回、APIキーの追加/移動/失効/削除、外部API検証は実行していない。

### テストとCIの確認状況
- リポジトリのルートには `package.json` と独立した `tests/` ディレクトリが見当たらず、現時点で一般的な `npm test` / `npm run lint` を実行できる構成は確認できていない。
- GitHub ActionsはD1 Migration/Reconciliation、補助アセット収集、Status JSON ComparatorのPages公開が中心。今回の確認範囲では、Worker全体の自動単体テスト・API/E2E回帰テストを実行するworkflowは見当たらない。
- これは「テストが一切存在しない」と断定するものではない。リポジトリ内に標準的なテスト入口が見当たらないという監査結果であり、今後は実行可能なテストの所在とリリース前検証手順を確認する。

### 監査継続方針
- 正規表現候補は同じ原因で複数機能に波及している可能性があるため、単発修正ではなく、実ソースを対象に検索・fixtureテスト・呼び出し元確認をまとめて行う。
- `ranking_snapshots` の広範囲取得を復活させない。履歴Retentionの処理は対象期間・バッチ件数を限定しているが、履歴表示APIやランキング取得経路は引き続き別途確認する。
- 本追記は静的コード監査。テスト実行、本番API呼び出し、DB変更、デプロイは未実施。


## 監査追記：Google Sheets署名とCloudflare Query Insights分類（2026-10-09 続き）

### [高] Google Sheets Web App連携のHMAC署名をBase64URL化する正規表現に過剰エスケープ
- `src/google-sheets.js` の `base64urlFromBytes()` は、署名バイト列をBase64化した後、`replace(/\\+/g, "-")` と `replace(/\\//g, "_")` でURLセーフ文字へ変換する実装になっている。
- ソース上の正規表現リテラルが二重バックスラッシュになっているため、通常のBase64文字 `+` / `/` ではなくバックスラッシュ文字を探してしまう可能性が高い。HMAC-SHA256署名に `+` または `/` が含まれるとBase64URL変換が不足し、Google Apps Script側の署名検証に失敗する可能性がある。
- 同ファイル内のService Account JWT用 `base64url()` は別の正規表現を使用しているため、署名処理の経路を分けて回帰テストする必要がある。
- 実際のGoogle Sheets/Web Appへの送信は実行していない。修正時は既知の署名入力に対するBase64URL出力と、送信側/受信側のHMAC一致テストを用意する。

### [中] Cloudflare Query Insightsの書き込みクエリ分類に過剰エスケープ候補
- `src/cloudflare-analytics.js` のSQL分類処理は、他の既知ラベルに該当しないSQLについて `/\\b(INSERT|UPDATE|DELETE|REPLACE|UPSERT)\\b/` で書き込み判定を行う。
- 正規表現リテラルがソース上で二重バックスラッシュになっているため、通常の単語境界として動かず、未分類の書き込みSQLが `Other Write` ではなく `Other` に分類される可能性がある。
- D1の実使用量自体ではなく、Query Insightsの分類・可視化に影響する候補。分類器のテスト用SQL（INSERT/UPDATE/DELETE/SELECT、既知テーブル/未知テーブル）で確認する。修正・実行テストは未実施。

### [監査範囲の補足]
- `src/` の主要なAPI、認証、API Pool、プレイヤー/ランキング保存、R2アーカイブ、Retention、診断、外部連携モジュールを継続して照合中。
- 正規表現の候補は `src/index.js`、補助アセット収集スクリプト、Google Sheets署名、Cloudflare使用量分類にまたがっている。修正着手時は全リポジトリを検索し、機能別テストを追加してからまとめて直す。
- 本追記時点でも本番操作・DB変更・デプロイは未実施。


## 監査追記：ユーザー領主リンクのスキーマ処理・外部API設定（2026-10-09 続き）

### [中〜高] ユーザー領主リンク機能がリクエスト経路でDDLを実行
- `src/user-player-link.js` の `ensureSchema(db)` は、初回呼び出し時に `CREATE TABLE IF NOT EXISTS` と複数の `CREATE INDEX IF NOT EXISTS` を実行する。
- 一方、`migrations/0022_user_player_links.sql` と `migrations/0026_user_player_links_multi_account.sql` でテーブル・インデックスはMigration管理されている。現行コードでは `getUserPlayerLinks`、`getUserPlayerLinksWithPlayers`、`findActiveGovernorOwner`、登録処理などから `ensureSchema` が呼ばれる。
- Worker isolateごとにモジュール内Promiseのキャッシュが初期化されるため、コールドスタート後の最初の該当リクエストで複数DDLが実行され得る。Migration管理とリクエスト時DDLの二重管理になっており、初回遅延・スキーマ変更の追跡困難・D1負荷の観点から要整理。
- これは直ちにデータ破損を意味しない。既存MigrationとDDLの差分を比較し、必要なスキーマはMigrationへ集約し、通常リクエストからDDLを外す方針を検討する。今回は変更していない。

### [確認済み・運用上の注意] Google Sheets連携には別々の2経路がある
- `src/google-sheets.js` は、設定に応じてGoogle Apps Script Web App（HMAC署名付きPOST）またはGoogle Sheets API（Service Account JWT）を使い分ける。
- したがって、OAuth設定・Refresh TokenだけではGoogle Sheets連携の正常性を判定できない。使用する経路に応じて、`GOOGLE_SHEETS_WEBAPP_URL` / `GOOGLE_SHEETS_WEBAPP_SECRET` または `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` と、対象スプレッドシートへの共有権限を確認する必要がある。
- Web App署名のBase64URL変換に関する正規表現候補は直前の節に記録済み。どちらの経路を本番で使っているか、環境変数の値は未確認（Secret値は記録しない）。

### [中] ユーザー提供MightPulseキー数は無制限設計で、一覧取得・検証コストも件数依存
- `src/user-eligibility.js` はユーザー提供キー数を明示的に無制限としている。Advanced判定では該当ユーザーのキーを全件取得し、各キーの表示用プレフィックス復号を並列で行う。
- 登録時はMightPulse APIへ疎通確認し、キーの重複チェックと保存を行う。キー数が増えた場合、Eligibility画面のD1読み取り・復号・Promise並列数が増える可能性がある。
- 既存の「キー上限」の要件が共有API Poolだけを対象とするのか、ユーザー提供キーも対象なのかは未確定。上限仕様を確認し、必要なら件数制限・ページング・表示時の復号を見直す。今回、APIキー登録や外部API呼び出しは実行していない。

### [中] リポジトリ内のD1 schema reconciliationは安全確認を備えるが、本番状態との照合は未実施
- `eagleeye-d1-schema-reconciliation.yml` は `RECONCILE_PRODUCTION` の明示入力、Time Travel情報の取得、適用前のMigration一覧取得、適用後検証を含む。
- 通常のMigration適用workflowも、既知の本番スキーマ差分を先に検査し、適用済みMigrationの確認と0054〜0057関連のスキーマ検証を行う。
- ただし、この監査ではworkflowを起動していないため、本番のMigration履歴・実テーブル・インデックスが現在のmainと一致するかは未確定。実行済みログを見ずに「本番適用済み」とは扱わない。


### [中〜高] マイ領主登録のアカウント上限チェックに並行登録競合の余地
- `src/user-player-link.js` の `saveUserPlayerLinkInternal()` は、既存ACTIVEリンクをSELECTし、王国数・MAIN/SUB数をアプリケーション側で確認した後にINSERTする。
- Migration `0026_user_player_links_multi_account.sql` と `ensureSchema()` には、領主ID重複・同一ユーザー同一領主・同一ユーザー同一王国のMAIN重複を防ぐUNIQUE INDEXはある。一方、同一ユーザー/王国のSUB件数上限や登録王国数上限をDBレベルで原子的に保証する制約は見当たらない。
- そのため、同じユーザーがほぼ同時に別のSUBアカウントを登録した場合、両リクエストが上限チェックを通過してからINSERTし、無料上限を超える可能性がある。異なる王国を同時登録する場合も2王国上限の競合候補。
- 実際に競合を再現したわけではない。対応時は同一ユーザー単位の原子的な制御（適切なトランザクション/ロック/DB制約の組合せ）を検討し、並行登録テストを用意する。UIの二度押し防止だけでは別リクエスト・別端末からの競合を防げない。


## 監査追記：バックグラウンド処理の実行配線と王国Catalogの復旧（2026-10-09 続き）

### [高] 主要ローラー群はWorker入口から呼び出されていないように見える
- `src/index.js` には以下の関数がimportされているが、mainブランチの同ファイル内ではimport行以外に呼び出しが見当たらない。
  - `runKingdomSeeder`
  - `runKingdomRankingRoller`
  - `runAllianceRoller`
  - `runPlayerRoller`
- `scheduled()` の実行内容はAPI Pool自動復旧、王国Catalog Discovery、Discord通知の3処理であり、上記4ローラーは呼び出されていない。
- リポジトリ内の通常のWorker入口は `src/index.js` のため、これらのローラーは現状「コードは存在するが、定期実行/手動APIの実行経路に接続されていない」可能性が高い。意図的に停止中・将来用のコードかは不明。
- この状態では、王国ランキング収集、同盟Catalog更新、プレイヤー定期収集がローラー経由で自動継続すると期待してはいけない。現在の実データが別経路で更新されているか、管理APIが直接収集している範囲を別途確認する。
- 今回はルート追加やスケジュール変更を行わない。各ローラーを動かす必要性、実行間隔、1回あたり件数、Safety Gate/API Pool枠、D1/R2消費量を整理してから接続方法を決める。

### [高] Retention・診断・緊急履歴バッファ排出もWorker入口に接続されていない
- 同じく `runDataRetentionJob`、`runDiagnosticHealthChecks`、`drainHistoryEmergencyBuffer` は `src/index.js` 内でimport/定義されているが、実行呼び出しが見当たらない。
- `scheduled()` / `queue()` のどちらにもこれらの実行はない。したがって、関数定義や管理画面が存在することだけでは、定期Retention・診断プローブ・緊急履歴の自動排出が稼働しているとは言えない。
- 3処理とも本番の最終実行時刻・処理件数・状態を実環境から確認できていない。緊急バッファ/Retentionの既記録所見とまとめて運用経路の最優先確認対象とする。

### [中〜高] 王国Catalog DiscoveryがRUNNING状態で中断すると自動復旧しない可能性
- `src/kingdom-catalog.js` は取得開始時に状態を `RUNNING` に更新し、成功時に `IDLE`、捕捉可能なエラー時に `FAILED` へ戻す。
- `src/kingdom-catalog-scheduler.js` は状態が `RUNNING` の場合、実行時間・`updated_at` を確認せず `DISCOVERY_ALREADY_RUNNING` としてスキップする。
- Workerがタイムアウト/中断し、catch処理まで到達せずに終了した場合、状態が `RUNNING` のまま残り、以降の5分Cronがずっとスキップする可能性がある。別の手動復旧処理や外部監視があるかは未確認。
- `force` オプションは現状、開始イベントのmetadataへ記録されるだけで、RUNNING状態の復旧や競合排除を行っていない。
- 対応時は実行ロック/期限切れRUNNINGの回復条件を設計し、同時実行防止とWorker中断後の回復をテストする。今回は変更していない。

### ローラー配線を修正する前に必要な判断
- 「実装済み」台帳と「本番で稼働中」台帳を分ける。関数・UIが存在すること、ルートがあること、Cron/Queueに接続されること、実環境で成功したことを別々の状態として記録する。
- ローラーを接続する場合は、D1 Free読み取り量を優先し、既存のAPI Poolと収集Semaphoreを迂回させない。特に複数王国×複数ボードの並列数を固定せず、利用可能キー数・Safety Gate・負荷上限に合わせて設計する。


### [高・潜在障害] 3つの収集ローラーが存在しないR2 binding名 `R2_ARCHIVE` を参照
- `wrangler.jsonc` のR2バインディング名は本番/previewとも `ARCHIVE`。
- 一方、`src/player-roller.js` は `materializePlayer(..., env.R2_ARCHIVE, ...)`、`src/kingdom-ranking-roller.js` は `saveKingdomRankingBoard(..., archiveBucket: env.R2_ARCHIVE, ...)`、`src/alliance-catalog.js` は `env.R2_ARCHIVE` の有無を見て同盟履歴をR2保存する。
- したがって、これらの処理を現在の `wrangler.jsonc` のまま実行した場合、R2 bucketがundefinedとなり、R2_ONLYの履歴保存に失敗する、または同盟履歴アーカイブがスキップ/失敗する可能性が高い。
- これらローラーはWorker入口から呼び出されていないように見えるため、現時点で定期実行中の障害とは断定しない。ただし、ローラー配線を有効化する前のブロッカー。既存の正しい `env.ARCHIVE` 参照と統一し、R2保存→D1更新の順序を含めてテストする必要がある。
- 今回、コード修正・ローラー起動・R2への書き込みは行っていない。


### [中・運用リスク] API Pool暗号化鍵がDiscordセッション署名用Secretと結合
- `src/index.js` の `requireAdmin()` と `src/data-collection-engine.js` は、`configureApiPoolEncryption(env.EAGLEEYE_SESSION_SECRET)` を呼び、`src/api-pool.js` はその値を使ってAPI PoolキーをAES-GCM暗号化/復号する。
- このため、`EAGLEEYE_SESSION_SECRET` を変更すると、既存の `api_pool_keys.encrypted_key` は旧鍵で暗号化されたままになり、新しいSecretでは復号できなくなる可能性が高い。Discordセッションの無効化目的のSecretローテーションがMightPulse API Pool全体の停止につながり得る。
- Secret値そのものはGitに存在せず、現時点でローテーション予定・過去の実施履歴も未確認。
- 対応時はAPI Pool専用の安定した暗号化Secretを分離するか、鍵バージョンを持たせた再暗号化手順を設計する。移行前に既存キーを安全に復号できる状態を維持し、暗号化/復号・ローテーションの検証を必須とする。今回は変更していない。


### [高] ユーザーのMighty再判定でHTTP 401時にMighty確認済みメタデータを解除しない
- `handleMyMightyCheckApi()` は `/kvk/matchups` がHTTP 403のときは `setApiPoolMightyMetadata(... mightyCapable:false, status:"NOT_MIGHTY")` を呼ぶが、HTTP 401のときは `recordApiPoolFailure(... disable:true)` のみで、`mighty_capable` / `mighty_check_status` を更新していない。
- `getVipEligibility()` はユーザー提供キーを `status != 'REVOKED'` で取得し、`mighty_capable = 1` かつ `mighty_check_status = 'CONFIRMED'` であればMightyキーありと判定する。APIキーの運用状態がDISABLED/ERRORになっても、この条件では除外されない。
- そのため、一度CONFIRMEDになったキーがHTTP 401で無効化されても、古いCONFIRMEDメタデータが残り、VIP資格判定に残り続ける可能性がある。再判定時の分岐によっては `evaluateVipEligibility()` による降格も実行されない。
- 同じユーザーに別の有効なMightyキーがある場合は資格を維持してよいが、失効/認証エラーとなったキーだけを非Mighty/ERROR扱いにし、残りのキーを評価する必要がある。429・5xx・timeout等の一時障害では既存判定を安易に解除しない方針が適切。
- 本番データでの再現・ユーザーロール変更は未実施。修正時は「CONFIRMEDキーの401」「403/MIGHTY_REQUIRED」「429/5xx一時障害」「別キーが有効」の組合せを回帰テストする。


### [低〜中・整理候補] 旧Mighty専用資格情報モジュールが現行Workerから参照されていない
- `src/user-mighty.js` には、専用のMighty APIキーを暗号化して `user_mighty_credentials` に保存する旧方式の登録・取得・失効処理が残っている。
- 現行 `src/index.js` からは `src/user-mighty.js` のimportがなく、`registerUserMightyKey` / `getUserMightyCredential` / `revokeUserMightyKey` / `callUserMightyApi` の呼び出しも見当たらない。現行のMighty判定は、ユーザー提供の通常MightPulseキーをAPI Poolへ登録し、`mighty_capable` / `mighty_check_status` で判定する方式。
- `user_mighty_credentials` テーブルと関連Migrationは存在するため、現状は「旧実装が残存している」状態と考えられる。利用中データがないと確認できるまでは削除対象にしない。
- 機能台帳では「現行経路」「未接続/旧実装」「Migration上だけ残存」を区別し、後日、参照・データ依存・ロールバック要件を確認してから整理判断する。


### [高・機能未接続] OwnerロードテストのエクスポートAPIが画面から呼ばれるがルート未登録
- `src/admin-kingdom-load-test.js` は `handleOwnerKingdomLoadTestExportApi()` をexportし、`renderOwnerKingdomLoadTestPage()` は `/api/owner/kingdom-load-test/export?run_id=...` へのダウンロードリンクを生成する。
- `src/index.js` はこの関数をimportしているが、`fetch()` のルーティングに `/api/owner/kingdom-load-test/export` が存在せず、関数の呼び出しも見当たらない。
- そのため、Ownerロードテスト画面の履歴エクスポートリンクは、現行mainのルーティングではエクスポートハンドラーへ到達せず、通常のホーム画面等へフォールバックする可能性が高い。
- これはソース上でルート配線の欠落を確認したもので、本番で実際に押下したテストは未実施。修正時はOwner認可、GET制限、run_idの検証、CSV/JSON出力内容、ダウンロード応答を確認してからルートを追加する。今回は変更していない。


### [中] API Poolの期限切れリース掃除関数も定期処理から未呼び出し
- `src/api-pool.js` の `releaseExpiredLeases()` は期限切れ `leased_until` のリース情報をクリアする関数で、コメントにも「scheduled maintenance」で処理する旨が記載されている。
- `src/index.js` は関数をimportしているが呼び出しは見当たらず、`scheduled()` の `runApiPoolAutoRecovery()` はERROR/COOLDOWNキーの疎通回復を対象にしており、期限切れリース全体の掃除は行っていない。
- 期限切れキーはリース取得SQLで再利用可能な条件に含まれているため、これだけでAPI Poolが永久停止するとは限らない。一方、古いリース情報が残り、Status画面の「active lease」件数・詳細や運用診断を誤解させる可能性がある。
- 対応時は期限切れリースの明示的掃除が必要かを確認し、必要ならCronに低コストの上限付き処理として接続する。今回は呼び出し追加・本番操作は行っていない。


### [高] 公開ステータス画面が60秒ごとにウォッチリスト/リースの全件読み取りを発生させる
- `/status` は未認証ユーザーにも公開され、HTMLに60秒ごとの自動再読み込みが設定されている。
- `renderPublicStatusPage()` はADMIN/OWNERかどうかにかかわらず `getOperationalStatus(env.DB)` を実行する。詳細使用量だけはロールで隠しているが、運用状況取得そのものは全アクセスで実行される。
- `src/status-ops.js` の `getOperationalStatus()` は、`kingdom_watchlists` の全件詳細を `ORDER BY created_at ASC` で読み、さらに期限情報のある `api_pool_keys` の全リース詳細を読み込む。公開ページで使うのは主に集計値・最新ジョブ・最新キー情報であり、全件配列は公開表示には不要。
- そのため、公開ステータス画面を開く人数・再読み込み頻度・ウォッチリスト件数に比例して、D1の読み取りが繰り返される。これはEagleEyeのD1 Free読み取り量を重視する方針に対して優先度の高い設計リスク。
- 公開ページ用の軽量集計関数と管理者用の詳細関数を分離し、公開側では全件配列を取得しない設計を検討する。キャッシュ/更新頻度も合わせて検討し、Query Insightsで変更前後を実測する。今回はコード変更・本番負荷試験は未実施。

### [中] 公開ステータス画面にAPI Poolのラベル/エラー詳細が表示される
- `getOperationalStatus()` は最新のAPI Poolキーの `label`、`last_error_code`、`last_error_message` を取得し、`renderPublicStatusPage()` はこれらを表示する。
- 値はHTMLエスケープされているが、ラベルや上流エラー文は内部運用情報になり得る。公開ステータスで必要なのは通常「キー利用可能数」「障害状態」等の集計であり、個別キーのラベル/エラー詳細を公開する必要性は要確認。
- 露出範囲はソース上で確認したが、本番画面を未認証で実際に開いて確認したわけではない。公開用の情報最小化を検討する。


### [中〜高] 公開ランキングAPIが参照ごとにシステムイベントを書き込む
- `/api/kingdom-portal/ranking` はルートでADMIN認証を要求せず、王国ID・ボードの検証後に `kingdom_ranking_current` の最大100件を返す公開読み取りAPI。
- 取得成功ごとに `recordSystemEvent(... operation: "READ_CURRENT_RANKING")` を呼ぶ。System Event Queueが設定されていればQueueへ送信し、その後D1へ記録される。Queueが利用できない経路ではD1へ直接記録する可能性がある。
- 公開APIのアクセス頻度に応じて、読み取りだけでなくSystem Eventの書き込み・Queue処理も増える。公開データ閲覧の全件を永続イベントに残す必要があるか、集計/サンプリング/レート制限/短期ログ化が必要かを要確認。
- また、このハンドラー自体にはHTTPメソッド制限が見当たらない。現状は読み取り中心だが、GETに限定するなどAPI契約を明確にする余地がある。
- 本番負荷・イベント発生量は未確認。今回、APIを呼び出したりコードを変更したりしていない。


### [確認済み] 現行コードにランキング履歴の広範囲な `ranking_snapshots` 読み取りは見当たらない
- `src/index.js`、`src/ranking-store.js`、`src/retention.js`、`src/r2-archive.js`、`src/admin-kingdom-load-test.js`、`src/kingdom-portal.js`、`src/status-ops.js` を対象に、`FROM/JOIN ranking_snapshots` のSQLを再照合した。
- `ranking-store.js` で確認できたD1履歴参照は `kid + board + target_id` で対象を絞り、`ORDER BY observed_at DESC LIMIT ?` を付ける形。履歴保存側には `INSERT INTO ranking_snapshots` があるが、広範囲な全件履歴取得は確認できなかった。
- この確認は上記ファイルの静的コード監査であり、将来の変更や別ファイルの新規クエリまで保証するものではない。D1読み取りコストを抑えるため、広範囲取得を復活させず、追加実装時も対象キー・期間・件数を制限する。


### [高・環境分離] Wranglerのpreview設定が本番と同じD1/R2リソースを参照
- `wrangler.jsonc` の通常設定と `previews` 設定で、D1の `database_id` が同一（`eagleeye-db`）、R2の `bucket_name` も同一（`eagleeye-archive`）になっている。preview側は `EAGLEEYE_ENV="preview"` だが、リソース自体は分離されていない。
- そのため、preview環境から実際に書き込みを伴うテストや管理操作を行うと、本番D1/R2へ影響する可能性がある。環境変数のラベルだけではデータ分離にならない。
- Cloudflareのpreview設定が本番データの共有を意図した運用かは未確認。意図しない共有であれば、専用のpreview D1/R2へ分離するか、previewでは書き込み系操作を明示的に無効化する必要がある。
- 今回、previewデプロイ・API呼び出し・DB/R2書き込みは実施していない。今後の実機テスト前に、どのWorker URL/環境がどのD1/R2 bindingへ接続されるかを先に確認する。
