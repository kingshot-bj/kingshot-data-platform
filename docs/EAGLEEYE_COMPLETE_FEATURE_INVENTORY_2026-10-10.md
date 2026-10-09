# EagleEye 全機能棚卸し — 2026-10-10

## 目的と判定ルール

この文書は `main` の現行コードから、画面/API・モジュール・DB Migration・Worker設定・Workflow・スクリプト・静的アセットを機能単位で照合するための台帳。既存の長文監査ログとは分け、機能の存在・接続・検証状態を追跡する。

- 「入口/実装あり」はコード上の定義を確認した意味であり、正常動作・本番利用可能を保証しない。
- 「接続未確認」は実装があるが、ルート/Cron/Queue/UIから実際に呼ばれることを確認できていない状態。
- 「未定義参照候補」はルートから呼び出される名前について、該当定義の存在を別途確認する必要がある状態。
- 本番Migration履歴、Cloudflareの実設定、実行時テストはこの静的棚卸しでは確定しない。
- D1 Freeの読み取り量を最優先し、`ranking_snapshots` の広範囲取得クエリは絶対に復活させない。
- 本棚卸しではアプリコード、Migration、Workflowの変更、デプロイ、本番DB更新、Queue操作、収集/負荷テスト起動を行わない。

## 初回スコープ計数

- `src/`: **51ファイル**（`index.js` を含む）
- `migrations/`: **59ファイル**（番号0008のファイルが2つあるため、番号ではなくファイル名で管理）
- `src/index.js` の完全一致パス入口: **110件**（うちAPI入口はパス分類上の集計で後続確認）
- `.github/workflows/`: **5件**
- BJにゃん静的画像: **17件**
- Workerイベント入口: HTTP `fetch`、Cron `scheduled`（5分ごと）、Queue `queue`。Queue consumer/Preview設定は別途差分確認が必要。

## A. ユーザー向け画面・API入口一覧

`src/index.js` の pathname分岐から自動抽出した入口。各行の「コード行」は監査時点の `main` における行番号で、今後の変更で変わり得る。`CALLBACK_PATH` と `/api/gateway/v1/` のprefix、未一致時のホーム画面はこの完全一致一覧とは別扱い。

| パス | 分類 | 呼び出し先（同一行から抽出） | 状態 | 行 |
|---|---|---|---|---:|
| `/status-json-comparator` | Status JSON比較ツール | `eagleEyeHtmlResponse` | コード上の入口あり・動作未検証 | 3992 |
| `/status-json-comparator.html` | Status JSON比較ツール | `eagleEyeHtmlResponse` | コード上の入口あり・動作未検証 | 3992 |
| `/api/kingdom-rankings/preferences` | 王国/同盟/Catalog/ランキング | `handleKingdomRankingPreferencesApi` | コード上の入口あり・動作未検証 | 3994 |
| `/api/kingdom-portal/ranking` | 王国/同盟/Catalog/ランキング | `handleKingdomPortalApi` | コード上の入口あり・動作未検証 | 3995 |
| `/api/kingdom-portal/status` | 王国/同盟/Catalog/ランキング | `handleKingdomPortalApi` | コード上の入口あり・動作未検証 | 3996 |
| `/api/player-watchlist` | プレイヤー検索・詳細・履歴・比較・連携 | `handlePlayerWatchlistApi` | コード上の入口あり・動作未検証 | 3997 |
| `/player-watchlist` | プレイヤー検索・詳細・履歴・比較・連携 | `eagleEyeHtmlResponse, renderPlayerWatchlistPage` | コード上の入口あり・動作未検証 | 3998 |
| `/api/kingdom-watchlist/history` | ウォッチリスト | `handleKingdomRankingHistoryApi` | コード上の入口あり・動作未検証 | 3999 |
| `/api/kingdom-watchlist/data` | ウォッチリスト | `handleKingdomWatchlistDataApi` | コード上の入口あり・動作未検証 | 4000 |
| `/api/kingdom-watchlist` | ウォッチリスト | `handleKingdomWatchlistApi` | コード上の入口あり・動作未検証 | 4001 |
| `/kingdom-watchlist` | ウォッチリスト | `eagleEyeHtmlResponse, renderKingdomWatchlistPage` | コード上の入口あり・動作未検証 | 4002 |
| `/api/auth/discord` | Discord認証/セッション | `startDiscordLogin` | コード上の入口あり・動作未検証 | 4003 |
| `/api/auth/logout` | Discord認証/セッション | `行内処理/要追跡` | 行内処理あり・動作未検証 | 4005 |
| `/api/admin/google-drive/authorize` | Google Drive連携 | `handleGoogleDriveAuthorizeApi` | コード上の入口あり・動作未検証 | 4006 |
| `/api/admin/google-drive/verify` | Google Drive連携 | `handleGoogleDriveVerifyApi` | コード上の入口あり・動作未検証 | 4007 |
| `/api/admin/google-drive/callback` | Google Drive連携 | `handleGoogleDriveOAuthCallback` | コード上の入口あり・動作未検証 | 4008 |
| `/api/debug/player-gear` | 共通/その他 | `handleDebugPlayerGear` | コード上の入口あり・動作未検証 | 4009 |
| `/api/debug/player-icons` | 共通/その他 | `handleDebugPlayerIcons` | コード上の入口あり・動作未検証 | 4010 |
| `/api/discord/interactions` | 共通/その他 | `handleSupportInteraction` | コード上の入口あり・動作未検証 | 4011 |
| `/api/admin/discord-support/register-command` | サポート/Discord Support | `handleDiscordSupportCommandRegistrationApi` | コード上の入口あり・動作未検証 | 4012 |
| `/api/support` | サポート/Discord Support | `handleSupportApi, handleSupportContextApi` | コード上の入口あり・動作未検証 | 4013 |
| `/api/support/context` | サポート/Discord Support | `handleSupportContextApi` | コード上の入口あり・動作未検証 | 4013 |
| `/api/me` | 自分のアカウント/資格 | `handleMe` | コード上の入口あり・動作未検証 | 4014 |
| `/api/admin/mightpulse/player` | MightPulse/ランキング管理 | `handleMightPulsePlayerTest` | コード上の入口あり・動作未検証 | 4015 |
| `/api/admin/mightpulse-probe` | MightPulse/ランキング管理 | `handleMightPulseProbeApi` | コード上の入口あり・動作未検証 | 4016 |
| `/api/admin/mightpulse-research` | MightPulse/ランキング管理 | `handleMightPulseResearchApi` | コード上の入口あり・動作未検証 | 4017 |
| `/api/admin/rankings/player` | MightPulse/ランキング管理 | `handleRankingPlayerTest` | コード上の入口あり・動作未検証 | 4018 |
| `/api/admin/rankings/board` | MightPulse/ランキング管理 | `handleRankingBoardTest` | コード上の入口あり・動作未検証 | 4019 |
| `/api/admin/data-retention` | Retention設定 | `handleDataRetentionApi` | コード上の入口あり・動作未検証 | 4020 |
| `/api/admin/kingdom-catalog-r2-backfill` | 王国/同盟/Catalog/ランキング | `handleKingdomCatalogR2BackfillApi` | コード上の入口あり・動作未検証 | 4021 |
| `/api/admin/player-visibility` | データ可視性設定 | `handlePlayerVisibilityApi` | コード上の入口あり・動作未検証 | 4022 |
| `/api/admin/player-export` | データ出力 | `handlePlayerSectionExport` | コード上の入口あり・動作未検証 | 4023 |
| `/api/admin/kingdom-rankings` | 王国/同盟/Catalog/ランキング | `handleAdminKingdomRankingApi` | コード上の入口あり・動作未検証 | 4024 |
| `/api/admin/kingdom-ranking-export` | 王国/同盟/Catalog/ランキング | `handleAdminKingdomRankingExport` | コード上の入口あり・動作未検証 | 4025 |
| `/api/admin/diagnostics` | システム状態/ログ/診断 | `handleAdminDiagnosticsApi` | コード上の入口あり・動作未検証 | 4026 |
| `/api/admin/system-log` | システム状態/ログ/診断 | `handleAdminSystemLogApi` | コード上の入口あり・動作未検証 | 4027 |
| `/api/admin/system-log/export` | システム状態/ログ/診断 | `handleAdminSystemLogExportApi` | コード上の入口あり・動作未検証 | 4028 |
| `/api/admin/system-log/export/download` | システム状態/ログ/診断 | `handleAdminSystemLogExportDownloadApi` | コード上の入口あり・動作未検証 | 4029 |
| `/api/admin/discord/roles` | 共通/その他 | `handleDiscordRolesLookupApi` | コード上の入口あり・動作未検証 | 4030 |
| `/api/admin/monitoring-profile` | 共通/その他 | `handleMonitoringProfileApi` | コード上の入口あり・動作未検証 | 4031 |
| `/api/admin/r2-archive-objects` | 共通/その他 | `handleR2ArchiveObjectsApi` | コード上の入口あり・動作未検証 | 4032 |
| `/api/admin/api-pool/keys` | API Pool管理 | `handleApiPoolKeys` | コード上の入口あり・動作未検証 | 4033 |
| `/api/admin/api-pool/add` | API Pool管理 | `handleApiPoolAdd` | コード上の入口あり・動作未検証 | 4034 |
| `/api/admin/api-raw-data` | API生データ確認 | `handleApiRawDataApi` | コード上の入口あり・動作未検証 | 4035 |
| `/api/admin/api-raw-history` | API生データ確認 | `handleApiRawHistoryApi` | コード上の入口あり・動作未検証 | 4036 |
| `/api/admin/api-pool/move` | API Pool管理 | `handleApiPoolMove` | コード上の入口あり・動作未検証 | 4037 |
| `/api/admin/api-pool/revoke` | API Pool管理 | `handleApiPoolRevoke` | コード上の入口あり・動作未検証 | 4038 |
| `/api/admin/api-pool/mighty-check` | API Pool管理 | `handleApiPoolMightyCheck` | コード上の入口あり・動作未検証 | 4039 |
| `/api/admin/api-pool/health-check` | API Pool管理 | `handleApiPoolHealthCheck` | コード上の入口あり・動作未検証 | 4040 |
| `/api/admin/api-pool/delete` | API Pool管理 | `handleApiPoolDelete` | コード上の入口あり・動作未検証 | 4041 |
| `/api/admin/api-pool/test-player` | API Pool管理 | `handleApiPoolTestPlayer` | コード上の入口あり・動作未検証 | 4042 |
| `/api/admin/api-pool/test-ranking` | API Pool管理 | `handleApiPoolTestRanking` | コード上の入口あり・動作未検証 | 4043 |
| `/api/owner/kingdom-load-test/system-json` | 王国/同盟/Catalog/ランキング | `handleOwnerKingdomLoadTestSystemJsonApi` | コード上の入口あり・動作未検証 | 4044 |
| `/api/owner/kingdom-load-test/history` | 王国/同盟/Catalog/ランキング | `handleOwnerKingdomLoadTestHistoryApi` | コード上の入口あり・動作未検証 | 4045 |
| `/api/owner/kingdom-load-test/status` | 王国/同盟/Catalog/ランキング | `handleOwnerKingdomLoadTestStatusApi` | コード上の入口あり・動作未検証 | 4046 |
| `/api/load-test/notice-status` | Owner負荷テスト | `handleLoadTestNoticeStatusApi` | コード上の入口あり・動作未検証 | 4047 |
| `/api/owner/kingdom-load-test/cancel` | 王国/同盟/Catalog/ランキング | `handleOwnerKingdomLoadTestCancelApi` | コード上の入口あり・動作未検証 | 4048 |
| `/api/owner/kingdom-load-test` | 王国/同盟/Catalog/ランキング | `handleOwnerKingdomLoadTestApi` | コード上の入口あり・動作未検証 | 4049 |
| `/api/owner/users` | Owner管理 | `handleOwnerUsersApi` | コード上の入口あり・動作未検証 | 4050 |
| `/api/owner/users/watchlists` | ウォッチリスト | `handleOwnerUserWatchlistsApi` | コード上の入口あり・動作未検証 | 4051 |
| `/api/owner/users/role` | Owner管理 | `handleOwnerUserRoleApi` | コード上の入口あり・動作未検証 | 4052 |
| `/api/owner/users/status` | Owner管理 | `handleOwnerUserStatusApi` | コード上の入口あり・動作未検証 | 4053 |
| `/api/owner/users/login-history` | Owner管理 | `handleOwnerLoginHistoryApi` | コード上の入口あり・動作未検証 | 4054 |
| `/api/owner/audit-log` | Owner管理 | `handleOwnerAuditLogApi` | コード上の入口あり・動作未検証 | 4055 |
| `/owner` | 共通/その他 | `eagleEyeHtmlResponse, renderOwnerAdminPage` | コード上の入口あり・動作未検証 | 4056 |
| `/owner/player-link-support` | サポート/Discord Support | `eagleEyeHtmlResponse, renderOwnerPlayerLinkSupportPage` | コード上の入口あり・動作未検証 | 4057 |
| `/admin` | 共通/その他 | `eagleEyeHtmlResponse, renderAdminControlPage` | コード上の入口あり・動作未検証 | 4058 |
| `/admin/google-drive` | Google Drive連携 | `renderGoogleDriveSetupPage` | コード上の入口あり・動作未検証 | 4059 |
| `/admin/data-retention` | Retention設定 | `eagleEyeHtmlResponse, renderDataRetentionPage` | コード上の入口あり・動作未検証 | 4060 |
| `/admin/player-visibility` | データ可視性設定 | `eagleEyeHtmlResponse, renderPlayerVisibilityPage` | コード上の入口あり・動作未検証 | 4061 |
| `/admin/kingdom-rankings` | 王国/同盟/Catalog/ランキング | `eagleEyeHtmlResponse, renderAdminKingdomRankingsPage` | コード上の入口あり・動作未検証 | 4062 |
| `/support` | サポート/Discord Support | `eagleEyeHtmlResponse, renderSupportPage` | コード上の入口あり・動作未検証 | 4063 |
| `/status` | システム状態/ログ/診断 | `renderPublicStatusPage` | コード上の入口あり・動作未検証 | 4064 |
| `/admin/diagnostics` | システム状態/ログ/診断 | `renderAdminDiagnosticsPage` | コード上の入口あり・動作未検証 | 4065 |
| `/admin/system-log` | システム状態/ログ/診断 | `eagleEyeHtmlResponse, renderAdminSystemLogPage` | コード上の入口あり・動作未検証 | 4066 |
| `/admin/data-coverage` | 共通/その他 | `eagleEyeHtmlResponse, renderAdminDataCoveragePage` | コード上の入口あり・動作未検証 | 4067 |
| `/kingdom-catalog` | 王国/同盟/Catalog/ランキング | `eagleEyeHtmlResponse, renderKingdomCatalogPage` | コード上の入口あり・動作未検証 | 4068 |
| `/kingdom` | 王国/同盟/Catalog/ランキング | `eagleEyeHtmlResponse, renderKingdomDetailPage` | コード上の入口あり・動作未検証 | 4069 |
| `/kingdom/rankings` | 王国/同盟/Catalog/ランキング | `eagleEyeHtmlResponse, renderKingdomRankingsPage` | コード上の入口あり・動作未検証 | 4070 |
| `/kingdom/alliances` | 王国/同盟/Catalog/ランキング | `eagleEyeHtmlResponse, renderAllianceListPage` | コード上の入口あり・動作未検証 | 4071 |
| `/alliance` | 王国/同盟/Catalog/ランキング | `eagleEyeHtmlResponse, renderAlliancePage` | コード上の入口あり・動作未検証 | 4072 |
| `/kingdom/compare` | 王国/同盟/Catalog/ランキング | `eagleEyeHtmlResponse, renderKingdomComparePage` | コード上の入口あり・動作未検証 | 4073 |
| `/kingdom/mighty` | 王国/同盟/Catalog/ランキング | `eagleEyeHtmlResponse, renderKingdomMightyPage` | コード上の入口あり・動作未検証 | 4074 |
| `/kingdom/changes` | 王国/同盟/Catalog/ランキング | `eagleEyeHtmlResponse, renderKingdomChangesPage` | コード上の入口あり・動作未検証 | 4075 |
| `/kingdom-watchlist/analytics` | ウォッチリスト | `eagleEyeHtmlResponse, renderKingdomWatchlistAnalyticsPage` | コード上の入口あり・動作未検証 | 4076 |
| `/admin/mightpulse-probe` | MightPulse/ランキング管理 | `eagleEyeHtmlResponse, renderMightPulseProbePage` | コード上の入口あり・動作未検証 | 4077 |
| `/admin/api-raw-data` | API生データ確認 | `eagleEyeHtmlResponse, renderApiRawDataPage` | コード上の入口あり・動作未検証 | 4078 |
| `/admin/mightpulse-research` | MightPulse/ランキング管理 | `eagleEyeHtmlResponse, renderMightPulseResearchPage` | コード上の入口あり・動作未検証 | 4079 |
| `/admin/api-pool` | API Pool管理 | `eagleEyeHtmlResponse, renderApiPoolAdminPage` | コード上の入口あり・動作未検証 | 4080 |
| `/owner/kingdom-load-test` | 王国/同盟/Catalog/ランキング | `eagleEyeHtmlResponse, renderOwnerKingdomLoadTestPage` | コード上の入口あり・動作未検証 | 4081 |
| `/owner/kingdom-catalog-r2-backfill` | 王国/同盟/Catalog/ランキング | `行内処理/要追跡` | 複数行処理・認可/起動を要追跡 | 4082 |
| `/api/me/player` | 自分のアカウント/資格 | `handleMyPlayerApi` | コード上の入口あり・動作未検証 | 4106 |
| `/api/me/advanced` | 自分のアカウント/資格 | `handleMyAdvancedApi` | コード上の入口あり・動作未検証 | 4107 |
| `/api/me/mightpulse-key` | MightPulse/ランキング管理 | `handleMyAdvancedApi` | コード上の入口あり・動作未検証 | 4107 |
| `/api/me/vip/mighty-check` | 自分のアカウント/資格 | `handleMyMightyCheckApi` | コード上の入口あり・動作未検証 | 4108 |
| `/api/me/vip` | 自分のアカウント/資格 | `handleMyVipApi` | コード上の入口あり・動作未検証 | 4109 |
| `/api/owner/player-link-support` | サポート/Discord Support | `handleOwnerPlayerLinkSupportApi` | コード上の入口あり・動作未検証 | 4110 |
| `/api/owner/api-pool/reassign` | Owner管理 | `handleOwnerApiPoolReassign` | コード上の入口あり・動作未検証 | 4111 |
| `/api/player/refresh` | プレイヤー検索・詳細・履歴・比較・連携 | `handlePlayerRefresh` | コード上の入口あり・動作未検証 | 4112 |
| `/api/player` | プレイヤー検索・詳細・履歴・比較・連携 | `handlePlayerApi` | コード上の入口あり・動作未検証 | 4113 |
| `/api/player/history` | プレイヤー検索・詳細・履歴・比較・連携 | `handlePlayerHistoryApi` | コード上の入口あり・動作未検証 | 4114 |
| `/api/player/rank-history` | プレイヤー検索・詳細・履歴・比較・連携 | `handlePlayerRankHistoryApi` | コード上の入口あり・動作未検証 | 4115 |
| `/api/player/changes` | プレイヤー検索・詳細・履歴・比較・連携 | `handlePlayerChangesApi` | コード上の入口あり・動作未検証 | 4116 |
| `/my-player` | プレイヤー検索・詳細・履歴・比較・連携 | `eagleEyeHtmlResponse, renderMyPlayerPage` | コード上の入口あり・動作未検証 | 4117 |
| `/players` | プレイヤー検索・詳細・履歴・比較・連携 | `eagleEyeHtmlResponse, renderPlayerSearchPage` | コード上の入口あり・動作未検証 | 4118 |
| `/api/player-compare` | プレイヤー検索・詳細・履歴・比較・連携 | `handlePlayerCompareApi` | 定義接続を要確認（既知候補） | 4119 |
| `/player/history` | プレイヤー検索・詳細・履歴・比較・連携 | `eagleEyeHtmlResponse, renderPlayerHistoryPage` | コード上の入口あり・動作未検証 | 4120 |
| `/player/changes` | プレイヤー検索・詳細・履歴・比較・連携 | `eagleEyeHtmlResponse, renderPlayerChangesPage` | コード上の入口あり・動作未検証 | 4121 |
| `/player/compare` | プレイヤー検索・詳細・履歴・比較・連携 | `eagleEyeHtmlResponse, renderPlayerComparePage` | 定義接続を要確認（既知候補） | 4122 |
| `/player` | プレイヤー検索・詳細・履歴・比較・連携 | `eagleEyeHtmlResponse, renderPlayerPage` | コード上の入口あり・動作未検証 | 4123 |
| `/api/auth/callback`（`CALLBACK_PATH`） | Discord OAuth callback | `handleDiscordCallback` | 定数経由・動作未検証 | `CALLBACK_PATH` 参照 |
| `/api/gateway/v1/*`（prefix） | Gateway API | `handleGatewayApi` | prefix routeあり・各サブルート未検証 | 3993付近 |
| `/` および未一致パス | ホーム/フォールバック | `renderHome`（要ルーター確認） | フォールバックあり | `fetch`末尾 |

## B. ソースモジュール全件一覧

| ファイル | 主な責務（ファイル名・関数名・利用文脈による初期分類） | 状態 |
|---|---|---|
| `src/admin-data-coverage.js` | 管理者向けデータ収集カバレッジ表示 | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/admin-kingdom-load-test.js` | Owner向け王国負荷テスト、Queue実行、進捗・履歴・キャンセル・消費量 | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/admin-system-log.js` | 管理システムログ画面/API | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/alliance-catalog.js` | 同盟Catalog収集・状態・変更イベント | 実装あり・Worker起動経路の接続確認が必要 |
| `src/api-observations.js` | 外部API観測データの保存 | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/api-pool.js` | APIキー暗号化・Pool/Lease・使用量・ヘルス・Mightyメタデータ | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/api-raw-inspector.js` | 管理者向けAPI生データ/履歴/画像参照確認 | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/cloudflare-analytics.js` | Cloudflare Workers/D1/R2利用量・Query Insights集計 | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/collection-semaphore.js` | 収集処理のグローバルSemaphore/Lease | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/d1-retry.js` | D1一時障害の再試行 | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/data-collection-engine.js` | MightPulse経由のプレイヤー/王国/同盟データ収集 | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/diagnostics.js` | 診断イベント記録・診断状態 | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/discord-notifications.js` | 変更イベントのDiscord通知と重複防止 | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/discord-support.js` | Discord Supportチケット/Interaction/署名/通知 | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/eagleeye-ui.js` | BJにゃんUI定数・UIトークン | 共通UI定数あり。全画面接続の有無を別途確認 |
| `src/gateway-api.js` | Bearer認証付きGateway status/diagnostics/log export | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/google-drive.js` | Google Drive OAuth/トークン/アーカイブ転送 | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/google-sheets.js` | Google Sheets/Apps Script経由のデータ出力 | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/history-emergency-buffer.js` | 履歴保存失敗時の緊急バッファ/排出 | 実装あり・Worker起動経路の接続確認が必要 |
| `src/index.js` | 役割の詳細を関数・呼び出し元から確定する | 全体ルーター/インライン画面/API。個別責務の分解を継続 |
| `src/kingdom-catalog-page.js` | 王国Catalog画面 | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/kingdom-catalog-r2-backfill-page.js` | Catalog R2バックフィル管理画面 | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/kingdom-catalog-r2-backfill-verify.js` | Catalog R2バックフィル検証 | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/kingdom-catalog-r2-backfill.js` | CatalogデータをR2へ段階移行 | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/kingdom-catalog-scheduler.js` | 王国Catalog日次更新スケジューラ | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/kingdom-catalog-store.js` | Catalog観測保存 | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/kingdom-catalog.js` | 新規王国発見・Catalog Discovery | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/kingdom-collection-stats.js` | 王国収集カバレッジ統計 | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/kingdom-portal.js` | 王国詳細/ランキング/同盟/比較/Mighty/変更/ウォッチ分析 | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/kingdom-ranking-roller.js` | 王国ランキング収集ローラー | 実装あり・Worker起動経路の接続確認が必要 |
| `src/kingdom-seeder.js` | 王国Catalog Seeder | 実装あり・Worker起動経路の接続確認が必要 |
| `src/mightpulse-normalizer.js` | MightPulseレスポンス正規化 | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/mightpulse-research.js` | MightPulseデータ構造の研究調査 | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/mightpulse.js` | MightPulse APIクライアント・取得エンドポイント | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/player-compare.js` | プレイヤー比較用データ系列/資産抽出ロジック | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/player-roller.js` | プレイヤー収集ローラー | 実装あり・Worker起動経路の接続確認が必要 |
| `src/player-store.js` | プレイヤー保存/履歴/名前履歴/変動イベント | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/r2-archive.js` | D1履歴・ランキング・プレイヤー・同盟履歴のR2アーカイブ/読出し | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/ranking-catalog.js` | ランキング項目キー・ラベル定義 | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/ranking-store.js` | 王国ランキング保存/現在値/履歴/変動イベント | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/retention.js` | Retention設定・期限切れデータアーカイブ/削除 | 実装あり・Worker起動経路の接続確認が必要 |
| `src/safety-gate.js` | 利用量・API Poolに基づく処理許可判定 | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/service-usage-archive.js` | Service Usage QueueイベントのR2アーカイブ | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/service-usage.js` | Service Usageイベント生成・送信 | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/status-ops.js` | 公開/管理用運用状態集約 | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/system-event-queue.js` | System Event Queueのバッチ保存 | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/system-log-export.js` | システムログの範囲抽出・エクスポート | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/system-log.js` | System Event/Trace記録とQueue接続 | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/user-eligibility.js` | ADVANCED/VIP資格・ユーザー提供MightPulseキー | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/user-mighty.js` | 旧/別系統のユーザーMighty資格情報管理 | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |
| `src/user-player-link.js` | マイプレイヤー複数アカウント連携・所有権サポート/移管 | 実装/関数群あり・呼び出し元/テスト状態は別途照合 |

## C. Migrationファイル全件一覧

以下はファイル名に基づく初期分類。テーブル・列・制約・indexの現行コード対応、重複/置換関係、実適用履歴は別フェーズで確定する。

| ファイル | 初期分類 | 状態 |
|---|---|---|
| `migrations/0001_users.sql` | users | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0002_api_observations.sql` | api observations | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0003_owner_role.sql` | owner role | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0004_players.sql` | players | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0005_change_events.sql` | change events | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0006_api_pool.sql` | api pool | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0007_rankings.sql` | rankings | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0008_data_retention.sql` | data retention | 番号重複あり。ファイル単位で管理 |
| `migrations/0008_kingdom_watchlist_jobs.sql` | kingdom watchlist jobs | 番号重複あり。ファイル単位で管理 |
| `migrations/0009_player_visibility.sql` | player visibility | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0010_owner_control.sql` | owner control | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0011_d1_read_optimization.sql` | d1 read optimization | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0012_player_watchlist.sql` | player watchlist | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0013_remove_redundant_ranking_index.sql` | remove redundant ranking index | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0014_player_identity_history.sql` | player identity history | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0015_history_emergency_buffer.sql` | history emergency buffer | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0016_api_leases_expiry_index.sql` | api leases expiry index | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0017_api_pool_atomic_lease.sql` | api pool atomic lease | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0018_runtime_schema_cleanup.sql` | runtime schema cleanup | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0019_watchlist_runtime_schema.sql` | watchlist runtime schema | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0020_audit_history_r2_retention.sql` | audit history r2 retention | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0021_api_pool_identity_r2_retention.sql` | api pool identity r2 retention | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0022_user_player_links.sql` | user player links | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0023_player_link_support.sql` | player link support | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0024_user_player_link_unique.sql` | user player link unique | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0025_api_pool_user_contributed_index.sql` | api pool user contributed index | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0026_user_player_links_multi_account.sql` | user player links multi account | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0027_diagnostic_status_created_index.sql` | diagnostic status created index | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0028_system_event_log.sql` | system event log | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0029_kingdom_load_test_runs.sql` | kingdom load test runs | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0030_kingdom_load_test_api_concurrency.sql` | kingdom load test api concurrency | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0031_kingdom_load_test_history.sql` | kingdom load test history | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0032_kingdom_load_test_api_wait_metrics.sql` | kingdom load test api wait metrics | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0033_kingdom_load_test_wait_distribution.sql` | kingdom load test wait distribution | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0034_global_collection_semaphore.sql` | global collection semaphore | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0035_api_request_locks.sql` | api request locks | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0036_collection_semaphore_slots.sql` | collection semaphore slots | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0037_kingdom_catalog.sql` | kingdom catalog | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0038_kingdom_catalog_boards.sql` | kingdom catalog boards | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0039_kingdom_ranking_collection_state.sql` | kingdom ranking collection state | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0040_kingdom_seeder_state.sql` | kingdom seeder state | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0041_alliance_catalog.sql` | alliance catalog | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0042_player_roller_state.sql` | player roller state | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0043_alliance_collection_state.sql` | alliance collection state | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0044_kingdom_load_test_cloudflare_usage.sql` | kingdom load test cloudflare usage | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0045_change_events_player_lookup.sql` | change events player lookup | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0046_kingdom_collection_stats.sql` | kingdom collection stats | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0047_backfill_legacy_kingdom_collection_stats.sql` | backfill legacy kingdom collection stats | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0048_kingdom_catalog_r2_index.sql` | kingdom catalog r2 index | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0049_kingdom_catalog_r2_backfill.sql` | kingdom catalog r2 backfill | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0050_alliance_catalog_r2_index.sql` | alliance catalog r2 index | SQL定義確認対象 |
| `migrations/0051_players_r2_index.sql` | players r2 index | SQL定義確認対象 |
| `migrations/0052_discord_notification_state.sql` | discord notification state | SQL定義確認対象 |
| `migrations/0053_player_visibility_min_role.sql` | player visibility min role | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0054_vip_mighty_credentials.sql` | vip mighty credentials | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0055_player_visibility_vip.sql` | player visibility vip | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0056_vip_role_schema_repair.sql` | vip role schema repair | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0057_api_pool_mighty_metadata.sql` | api pool mighty metadata | SQL定義確認対象。適用履歴は未確認 |
| `migrations/0058_user_kingdom_ranking_preferences.sql` | user kingdom ranking preferences | SQL定義確認対象。適用履歴は未確認 |

## D. Worker設定・自動処理・外部連携

### Worker / Cloudflare設定

- Main entry: `src/index.js`
- Cron: `*/5 * * * *`。`scheduled()` が直接起動する処理と、他の関数として実装されているジョブの接続状態は区別して確認する。
- Bindings: D1 `DB`、R2 `ARCHIVE`、Assets `ASSETS`、Queue producers `SERVICE_USAGE_QUEUE` / `LOAD_TEST_QUEUE` / `SYSTEM_EVENT_QUEUE`。
- Production consumers: Service Usage / Load Test / System Events の3系統。各Queueのbatch size、timeout、retry、concurrency、DLQを設定。
- PreviewはD1/R2の指定がProductionと同じで、Queue producer/consumer設定にも差分がある。環境分離リスクとして要対応判断。
- `HISTORY_STORAGE_MODE=R2_ONLY`、Monitoring profile `PAID_5USD` は設定値として存在。実際の本番設定値・利用量はCloudflare側で別途確認が必要。

### Workflow一覧

| Workflow | 初期責務分類 | 状態 |
|---|---|---|
| `.github/workflows/eagleeye-d1-apply-pending-migrations.yml` | 保留中D1 Migration適用 | 定義あり・実行/権限/本番影響は未検証 |
| `.github/workflows/eagleeye-d1-load-test-schema-recovery.yml` | Load Test schema recovery | 定義あり・実行/権限/本番影響は未検証 |
| `.github/workflows/eagleeye-d1-schema-reconciliation.yml` | D1 schema reconciliation | 定義あり・実行/権限/本番影響は未検証 |
| `.github/workflows/hero-gear-assets.yml` | ヒーロー装備アセット収集 | 定義あり・実行/権限/本番影響は未検証 |
| `.github/workflows/status-comparator-pages.yml` | Status comparatorのPages公開 | 定義あり・実行/権限/本番影響は未検証 |

### スクリプト・静的アセット

- `scripts/collect-hero-gear-assets.mjs`: ヒーロー装備画像アセット収集。抽出正規表現の機能不全候補を既存監査ログで指摘、実サイト再現は未実施。
- `scripts/reconcile-0053-production-drift.mjs`: Migration 0053のProduction drift照合用スクリプト。
- `scripts/reconcile-d1-schema.mjs`: D1スキーマ差分照合スクリプト。Productionに対する実行・変更は別承認が必要。
- `tools/status-json-comparator.html` と `public/status-json-comparator.html`: Status JSON比較ツールが2系統存在し、別実装/内容差が既存監査ログに記録されている。
- `public/assets/eagleeye/bjnyan/`: BJにゃんの標準画像・画面状態画像が配置されている。画面で実際に参照される全件の照合は継続対象。

## E. 機能領域ごとの棚卸し

| 機能領域 | 実装として確認できる入口/モジュール | 初期判定 | 次に確定すること |
|---|---|---|---|
| 認証・ユーザー/ロール | Discord OAuth、`/api/me*`、`users`、`requireAdmin`/`requireOwner` | 実装あり・一部経路に監査候補あり | 全ルートのACTIVE/ロール/HTTP method、OAuth state、失敗時Cookie |
| プレイヤー検索・詳細 | `/players`、`/player`、`player-store.js`、`mightpulse.js` | 実装あり | 全表示項目の取得元/欠損/鮮度/エラー処理 |
| マイプレイヤー/アカウント連携 | `/my-player`、`user-player-link.js`、Migration 0022–0026 | 実装あり | 所有権・MAIN/SUB・同時登録/移管・サポート状態遷移 |
| プレイヤー履歴/変動/比較 | `/player/history`、`/player/changes`、`/player/compare`、`player-compare.js` | 一部のルートとロジックに定義接続疑義 | `handlePlayerCompareApi`/`renderPlayerComparePage` の定義・import・build確認 |
| プレイヤー/王国Watchlist | watchlist API/画面、ジョブ/状態テーブル | 実装あり・定期実行接続に重大な疑義 | 追加/削除/refresh/失敗/再試行/実行経路とD1消費 |
| 王国Catalog/Seeder | Catalog画面/Discovery/Scheduler/Seeder | 実装あり・Seeder/rollerの起動接続未確定 | 発見→詳細収集→R2保存→状態更新の全経路 |
| 王国ランキング | Portal API/画面、ranking-store、ranking-catalog | 実装あり | ボード一覧・順位履歴・ラベル・更新権限・D1負荷 |
| 同盟Catalog/詳細/通知 | alliance-catalog、kingdom-portal、discord-notifications | 実装あり・通知ID不一致候補 | target_id形式、通知上限、dedupe/retention |
| MightPulse API/研究 | mightpulse.js、normalizer、research、API test/probe | 実装あり | 全endpoint、キー選択、失敗分類、retry/rate limit |
| API Pool/資格判定 | api-pool.js、user-eligibility.js、管理API | 実装あり・401後メタデータ不整合候補 | key statusとVIP資格、lease/expiry、キー上限、同時実行 |
| System Status/Diagnostics | status-ops、diagnostics、public status、admin diagnostics | 実装あり・公開ページのD1負荷候補 | 全件読み取り/再読込周期/情報露出/誤判定 |
| System Log/Trace/Export | system-log、system-event-queue、system-log-export | 実装あり・Retention/Queue配線を要照合 | イベント保存経路、24時間表示、export method、保存先/保持期限 |
| D1/R2履歴/Retention | r2-archive、history-emergency-buffer、retention | 実装あり・定期実行/緊急排出の接続疑義 | 保存失敗時保全、R2_ONLY、排出/cleanup呼出、データ消失防止 |
| 負荷テスト | Owner UI/API、LOAD_TEST_QUEUE、history/system JSON | 実装あり・E2E未確認 | Safety Gate、キャンセル/再開、進捗、D1/API/Cloudflare消費、export route |
| Google Drive/Sheets | google-drive.js、google-sheets.js、Admin setup/API | 実装あり・OAuth設定不一致候補 | Redirect URI、token更新、出力権限、失敗経路 |
| Discord Support | discord-support.js、Support UI/API/Interactions | 実装あり | 署名timestamp、チケット状態遷移、権限、監査ログ |
| UI基盤/テーマ/連打防止 | eagleeye-ui.js、index内CSS/JS wrapper/guards | 一部実装あり・全画面接続未確定 | 全画面適用、Safari、二重送信、アセット重複 |
| データ保持/設定 | data_retention_settings、admin UI/API、retention.js | 実装あり・自動実行経路を要確認 | 保持対象/実行スケジュール/Archive失敗時の削除条件 |
| MightPulse VIP credentials legacy | user-mighty.js、user_mighty_credentials migrations | ソース上の主要経路との接続未確認 | 全repo参照/管理画面/API接続/採用仕様。削除判断はしない |
| D1 schema reconciliation | scripts + GitHub workflows | ツールあり・本番スキーマ照合未完了 | Migration適用履歴、index再構成、破壊的変更の承認ガード |

## 2026-10-10 第2巡目 — index.js内画面コンポーネントの初期マッピング

`src/index.js` 内のトップレベル `render*` 関数34件を抽出。HTML文字列内のフォーム・ボタン・API文字列を機械抽出した。イベントリスナーを動的生成する箇所や別モジュールの画面は、この集計に含まれない場合がある。よって初期マッピングであり、機能網羅の完了判定ではない。

| render関数 | 行 | フォーム | ボタン文字列数 | API参照（抽出分） | 初期判定 |
|---|---:|---:|---:|---|---|
| `renderKingdomWatchlistPage` | 1271 | 0 | 3 | `/api/auth/discord`, `/api/kingdom-watchlist`, `/api/kingdom-watchlist?action=refresh`, `/api/kingdom-watchlist?action=cancel`, `/api/kingdom-watchlist?action=toggle`, `/api/kingdom-watchlist?watchlist_id=`, `/api/player-watchlist?governor_id=`, `/api/player-watchlist`, `/api/kingdom-watchlist/data?watchlist_id=`, `/api/kingdom-watchlist?action=create` | UI操作/API対応の個別照合が必要 |
| `renderMyPlayerPage` | 2175 | 0 | 5 | `/api/auth/discord`, `/api/me/player`, `/api/me/advanced`, `/api/me/vip`, `/api/me/vip/mighty-check`, `/api/me/mightpulse-key` | UI操作/API対応の個別照合が必要 |
| `renderPlayerWatchlistPage` | 2587 | 0 | 2 | `/api/auth/discord`, `/api/player-watchlist`, `/api/player-watchlist?governor_id=` | UI操作/API対応の個別照合が必要 |
| `renderAdminDiagnosticsPage` | 3245 | 0 | 0 | — | UI操作/API対応の個別照合が必要 |
| `renderMightPulseResearchPage` | 3372 | 0 | 21 | `/api/admin/mightpulse-research?` | UI操作/API対応の個別照合が必要 |
| `renderMightPulseProbePage` | 3727 | 0 | 4 | — | UI操作/API対応の個別照合が必要 |
| `renderPlayerActivity` | 3762 | 0 | 0 | — | UI操作/API対応の個別照合が必要 |
| `renderGoogleDriveSetupPage` | 3827 | 0 | 1 | — | UI操作/API対応の個別照合が必要 |
| `renderApiPoolRankingTestResult` | 5604 | 0 | 0 | — | UI操作/API対応の個別照合が必要 |
| `renderApiPoolTestResult` | 5617 | 0 | 0 | — | UI操作/API対応の個別照合が必要 |
| `renderPlayerVisibilityPage` | 5721 | 0 | 0 | `/api/admin/player-visibility` | UI操作/API対応の個別照合が必要 |
| `renderDataRetentionPage` | 5798 | 1 | 1 | `/api/admin/data-retention` | UI操作/API対応の個別照合が必要 |
| `renderApiPoolAdminPage` | 5831 | 3 | 6 | `/api/admin/api-pool/add`, `/api/admin/api-pool/test-player`, `/api/admin/api-pool/test-ranking` | UI操作/API対応の個別照合が必要 |
| `renderPlayerSearchPage` | 6315 | 1 | 1 | `/api/auth/discord` | UI操作/API対応の個別照合が必要 |
| `renderPlayerChangesPage` | 6455 | 0 | 0 | `/api/auth/discord` | UI操作/API対応の個別照合が必要 |
| `renderChangesShell` | 6501 | 0 | 0 | — | UI操作/API対応の個別照合が必要 |
| `renderPlayerHistoryPage` | 6541 | 0 | 0 | `/api/auth/discord` | UI操作/API対応の個別照合が必要 |
| `renderHistoryShell` | 6572 | 0 | 0 | — | UI操作/API対応の個別照合が必要 |
| `renderPlayerPage` | 6736 | 0 | 0 | `/api/auth/discord` | UI操作/API対応の個別照合が必要 |
| `renderPlayerShell` | 6851 | 1 | 2 | `/api/admin/player-export?governor_id=`, `/api/player-watchlist`, `/api/player-watchlist?governor_id=` | UI操作/API対応の個別照合が必要 |
| `renderSegmentedHeroStar` | 7043 | 0 | 0 | — | UI操作/API対応の個別照合が必要 |
| `renderPlayerOptionalAssets` | 7085 | 0 | 0 | — | UI操作/API対応の個別照合が必要 |
| `renderPlayerAdvancedSections` | 7112 | 0 | 0 | `/api/admin/player-export?governor_id=` | UI操作/API対応の個別照合が必要 |
| `renderAdminKingdomRankingsPage` | 7684 | 1 | 1 | `/api/admin/kingdom-rankings`, `/api/admin/kingdom-ranking-export?kid=` | UI操作/API対応の個別照合が必要 |
| `renderAdminControlPage` | 7748 | 0 | 0 | — | UI操作/API対応の個別照合が必要 |
| `renderOwnerPlayerLinkSupportPage` | 7915 | 0 | 2 | `/api/owner/player-link-support` | UI操作/API対応の個別照合が必要 |
| `renderOwnerAdminPage` | 7942 | 0 | 2 | — | UI操作/API対応の個別照合が必要 |
| `renderPublicStatusPage` | 8303 | 0 | 3 | `/api/admin/monitoring-profile`, `/api/admin/r2-archive-objects?limit=50` | UI操作/API対応の個別照合が必要 |
| `renderSupportPage` | 8790 | 0 | 0 | `/api/auth/discord` | UI操作/API対応の個別照合が必要 |
| `render1` | 8799 | 0 | 1 | — | UI操作/API対応の個別照合が必要 |
| `render2` | 8800 | 0 | 2 | — | UI操作/API対応の個別照合が必要 |
| `render3` | 8801 | 0 | 4 | — | UI操作/API対応の個別照合が必要 |
| `renderInitial` | 8803 | 0 | 0 | `/api/support/context` | UI操作/API対応の個別照合が必要 |
| `renderHome` | 8807 | 0 | 3 | `/api/auth/discord`, `/api/player-watchlist`, `/api/kingdom-watchlist` | UI操作/API対応の個別照合が必要 |

### 画面→APIの重点照合対象

- **王国Watchlist**: `/api/kingdom-watchlist` と `action=create/refresh/cancel/toggle`、削除の `watchlist_id`、データ取得、Player Watchlist参照。状態遷移・二重送信防止・失敗表示を確認する。
- **Player Watchlist**: `/api/player-watchlist` の一覧/追加/削除と比較画面への遷移。比較先ルートの未解決参照と、負荷テストCSV exportの未登録ルート候補を含めて確認する。
- **My Player**: `/api/me/player`、`/api/me/advanced`、`/api/me/vip`、Mighty判定。ロール・所有アカウント・APIキー提供状態の表示と更新を照合する。
- **API Pool管理**: 画面内の追加・テスト・Mighty判定・キー削除・提供者変更に対し、管理APIルートの認可とHTTP methodを確認する。
- **Retention/王国ランキング管理**: 画面のフォームと更新APIを照合し、読み取り/書き込み範囲および実行ジョブとの接続を確認する。
- **Owner管理/Player Link Support**: ロール変更、ユーザー状態変更、Watchlist管理、本人確認/移管/却下、監査ログの状態遷移を照合する。
- **Public Status**: `/api/admin/monitoring-profile` と `/api/admin/r2-archive-objects` の呼び出しが公開画面から発生する設計か、認証・情報露出・D1/R2コストの観点で個別確認する。静的な文字列だけでは安全性を断定しない。
## 2026-10-10 第3巡目 — Migrationと実SQLのテーブル層照合

MigrationのDDLと現行ソース内のSQL文字列を照合し、テーブルの作成/変更経路と利用モジュールを確認した。ここでは列・制約・Indexの完全な双方向照合までは完了していない。

| 対象 | Migration上の定義/変更 | ソース側の確認 | 初期判定 |
|---|---|---|---|
| `api_leases` | Migration 0006で作成。0017で旧ACTIVE leaseをEXPIREDにして、新lease列を`api_pool_keys`へ移行 | `src/api-pool.js`のclaim/lease/releaseは`api_pool_keys`の列を操作。`src/index.js`ではAPIキー削除時の`DELETE FROM api_leases`を確認 | 旧方式の残存テーブル候補。削除/廃止判断は保留 |
| `collection_semaphore` | Migration 0034でカウンター方式のSemaphore作成 | `src/collection-semaphore.js`は`collection_semaphore_slots`を参照。`collection_semaphore`の実行SQL参照は確認できない | 旧方式/未使用候補 |
| `collection_semaphore_slots` | Migration 0036で1000枠のlease slotを作成しIndex追加 | `src/collection-semaphore.js`のacquire/release/refresh/snapshotが参照 | 現行実装に接続 |
| `user_mighty_credentials` | Migration 0054/0056で資格情報テーブルを作成/再定義 | `src/user-mighty.js`に暗号化/登録/検証/失効ロジックあり。ただし`src/index.js`からimportされず、資格判定の`src/user-eligibility.js`は`api_pool_keys`のUSER_CONTRIBUTEDキーを使用 | 別系統の実装/未接続候補。現行VIP設計との関係を確定するまで削除禁止 |
| `kingdom_seeder_state` / `kingdom_ranking_collection_state` / `alliance_collection_state` / `player_collection_state` | Migration 0040–0043で各ローラーの進捗状態を管理 | 対応するローラー関数とSQLは存在するが、`index.js`からローラーを起動する呼び出しが見つからない | 機能実装あり・起動経路未接続候補 |
| `history_emergency_buffer` | Migration 0015で状態/作成時刻Indexを作成 | `src/history-emergency-buffer.js`にenqueue/archive/drainあり。`index.js`は`drainHistoryEmergencyBuffer`をimportするだけで呼び出しがない | drain起動経路未接続候補 |
| `data_retention_settings` / `system_event_log` | Migration 0008/0020–0021/0028で設定・ログテーブルとIndexを定義 | `index.js`に`runDataRetentionJob`はあるが、その呼び出しが見つからない。内側のcleanup/archiveもその親関数経由 | Retention定期実行が未接続の可能性。意図/外部起動経路を要確認 |
| `alliance_collection_state` | Migration 0041で作成。0043はコメント上、0041で定義済みのため意図的なno-op | 現行コードにstate参照あり | 0043自体は未適用漏れと断定しない |

### この巡回で確定した制約

- Migration番号0008は2ファイルある。台帳では番号だけでなく完全なファイル名を識別子にする。
- Migration 0017はAPI lease管理を `api_pool_keys` へ移行した旨を明記している。旧 `api_leases` は削除済みと扱わず、現行参照を確認したうえで移行履歴として管理する。
- Migration 0034の `collection_semaphore` と0036の `collection_semaphore_slots` は同じ名前の単純な置換ではない。現行実装はslot方式を参照する。
- Migration 0043は意図的なno-opと記載されているため、空に近いSQLを直ちに不具合と判定しない。
- D1の実適用履歴・本番の実スキーマ・Query Planは未取得。ソースとMigrationの整合性評価は静的範囲に限定する。

### 次に照合する項目

1. MigrationごとにCREATE/ALTER TABLEの列定義、CHECK制約、UNIQUE条件、Indexを抽出し、利用SQLが列名・条件に一致するか確認する。
2. `src/index.js`内の主要テーブル参照を機能ごとに割り当て、読み取り/書き込み/削除の全経路を照合する。
3. R2移行対象（kingdom_catalog / alliance_catalog / players / ranking・player history）のD1 payload削除順序、R2 pointer、読み取りfallbackを別表にする。
## 2026-10-10 第4巡目 — D1/R2保存・読出し経路の初期マッピング

| データ領域 | 保存/移行経路 | 読出し経路 | 棚卸し判定/注意点 |
|---|---|---|---|
| 王国Catalog | `kingdom-catalog-store.js`がR2 snapshotを保存してから`kingdom_catalog`へR2 keyを保存。`kingdom-catalog-r2-backfill.js`もR2保存成功後にD1の`raw_json/boards_json`をNULL化 | Portal/Catalog系がD1メタデータとR2 keyを利用 | 保存→D1 payload NULL化の順序を確認。R2保存失敗時にD1を消さない条件を引き続き照合 |
| 同盟Catalog/履歴 | `alliance-catalog.js`が`archiveAllianceHistoryBatch`を使い、同盟行のraw JSONをNULL化する経路あり | `r2-archive.js`に同盟履歴のアーカイブ処理あり | Rollerは未接続候補かつ`env.R2_ARCHIVE`を参照。設定ファイルは`ARCHIVE` bindingのため、仮に起動するとR2 bindingが未定義となる候補 |
| プレイヤー履歴 | `player-store.js`がplayer historyをR2 archiveし、履歴APIはD1/R2の読み取り経路を持つ | `getPlayerHistory`等にR2 bucket引数を渡す | 履歴保存失敗時の緊急バッファ/復旧起動経路と合わせて照合が必要 |
| 王国ランキング履歴 | `ranking-store.js`と`r2-archive.js`にランキング履歴のD1/R2経路あり | `getRankingHistory`がR2履歴を利用可能 | `kingdom-ranking-roller.js`は`env.R2_ARCHIVE`を参照するが、設定は`ARCHIVE`。ローラー自体もWorker起動経路未接続候補 |
| プレイヤー収集ローラー | `player-roller.js`に履歴/収集処理あり | ローラーの呼び出し元は現行Workerイベントで未確認 | `env.R2_ARCHIVE`参照と未接続候補を併記。`ranking_snapshots`の広範囲取得を追加する変更はしない |
| System Event Log | `archiveSystemEventLog`は`env.ARCHIVE`へ保存後にD1側の期限切れ行を処理する設計 | `system-log.js` / `system-log-export.js`でD1ログを参照 | 親ジョブ`runDataRetentionJob`の起動経路が見つからないため、定期アーカイブが実行されるか未確定 |
| History Emergency Buffer | `history-emergency-buffer.js`にbuffer保存・R2アーカイブ・drain処理あり | 状態取得/排出関数あり | `drainHistoryEmergencyBuffer`の起動経路未確認。滞留・再試行の運用保証は未確定 |

### R2 binding名の整合性候補

- `wrangler.jsonc` はR2 bindingを ` + tick + `ARCHIVE` + tick + ` として定義している。
- ` + tick + `alliance-catalog.js` + tick + `、` + tick + `kingdom-ranking-roller.js` + tick + `、` + tick + `player-roller.js` + tick + ` は ` + tick + `env.R2_ARCHIVE` + tick + ` を参照している。
- そのため、これらのローラーを現在のWorker環境から直接起動した場合、R2 bucketが取得できない可能性がある。ローラーの起動経路自体が未接続候補であるため、これは「静的なbinding名不一致候補」として記録し、現時点では修正しない。
- ` + tick + `index.js` + tick + ` の既存API/Portal/履歴経路の多くは ` + tick + `env.ARCHIVE` + tick + ` を使用しており、binding名の一括置換を無条件に行わない。

### D1コストの固定条件

- D1 Free読み取り量を最優先する。
- ` + tick + `ranking_snapshots` + tick + ` の広範囲取得クエリを復活させない。
- R2への移行を調査する際は、D1読み取り削減のためにR2オブジェクト全件列挙や無制限の読み込みを安易に追加しない。R2のlist/get回数とページングも確認対象にする。
### 主要テーブルの最終形・SQL対応の確認ポイント

| テーブル | Migrationで確認した最終形の重要点 | コード利用/次の確認 |
|---|---|---|
| `users` | 0001のCHECKはBASIC/ADVANCED/ADMIN。0056でBASIC/ADVANCED/VIP/ADMIN/OWNERを許可するよう再構築 | 0056を最終形として権限/ロール判定を照合する。古い0001だけで現行VIP非対応と判断しない |
| `api_pool_keys` | 0006の基本キー/クォータ列に0017のlease列、0057のMighty metadata列が追加される | `api-pool.js`と`user-eligibility.js`が参照。各SELECT/UPDATEの列名と状態遷移を列単位で照合する |
| `kingdom_ranking_current` | 0019で(kid, board, target_type, target_id)の主キー、previous_rank/observed_at/source_observed_at等を保持 | 現在順位/前回順位の取得元。D1読み取り最適化の基準とし、`ranking_snapshots`の広範囲取得を追加しない |
| `ranking_snapshots` | 0007の履歴スナップショット表。複数の検索用Indexあり | 履歴保存/必要範囲の検索に用途を限定。広範囲SELECTを復活させない |
| `kingdom_catalog` | 0037の基本列に0038のboards列、0048のR2 latest key/Indexが追加 | `kingdom-catalog-store.js`、R2 backfill、Portalの読み書きと、R2保存後にD1 payloadをNULL化する順序を照合 |
| `system_event_log` | 0028でevent/trace/operation/status/metadata列と主要Indexを作成 | `system-log.js`、Queue、export、Retentionの列互換を確認。`trace_tree`はSQL内の再帰CTE名であり、別テーブルとして扱わない |
| `user_player_links` | 0022–0026で複数アカウント、MAIN/SUB、active governor/mainの一意制約を導入 | `src/user-player-link.js`の`ensureSchema`はCREATE TABLE/INDEX IF NOT EXISTSを実行。モジュール内Promiseで初回実行を共有するが、cold isolateでのDDLとMigrationとの定義差を照合する |

### Request-time schema処理の初期確認

- ` + tick + `src/index.js` + tick + ` 自体には、直接の ` + tick + `CREATE TABLE/CREATE INDEX/ALTER TABLE` + tick + ` 文は見つからなかった。
- ` + tick + `src/user-player-link.js` + tick + ` には ` + tick + `ensureSchema(db)` + tick + ` があり、テーブルと複数Indexを ` + tick + `IF NOT EXISTS` + tick + ` で作成する。モジュールスコープのPromiseで同一Worker isolate内の初回実行を共有するため、毎リクエスト実行と断定しない。
- Migration 0022–0026の最終テーブル定義とこのensureSchema定義の完全一致、cold startでのD1操作コスト、実行時頻度は未確認。不要なスキーマ作成処理の削除/変更はこの棚卸しでは行わない。
## 2026-10-10 第5巡目 — Watchlist機能のAPI/DB接続

### Player Watchlist

| 操作 | API/HTTP method | DB/動作 | 状態 |
|---|---|---|---|
| 一覧取得 | `/api/player-watchlist` GET | `player_watchlists` と `players` をJOIN。ランキング/変更表示で `kingdom_ranking_current`・`kingdom_ranking_board_state`・`change_events` を参照 | 接続あり。読み取りSQL/認可の詳細確認は継続 |
| 登録/再有効化 | `/api/player-watchlist` POST | governor_id検証、既存行確認、enabled件数を照会し、上限確認後にUPSERT | 接続あり。上限と同時登録の競合は別途確認 |
| 更新/有効無効切替 | `/api/player-watchlist` PATCH | 登録者本人の行を対象に更新し、上限チェックあり | 接続あり。全状態遷移は未検証 |
| 削除 | `/api/player-watchlist` DELETE | 登録者本人の対象を削除 | 接続あり。実リクエスト未実施 |

### Kingdom Watchlist

| 操作 | API/HTTP method | DB/動作 | 状態 |
|---|---|---|---|
| 一覧/ジョブ状態 | `/api/kingdom-watchlist?action=list` GET | `kingdom_watchlists` と最新 `kingdom_watchlist_jobs` を参照。古い実行中jobをFAILEDにする整合処理もある | 接続あり。stale判定の時間条件は要テスト |
| 新規登録 | `/api/kingdom-watchlist?action=create` POST | `watchlist_limits` を用いたロール別上限、既存watchlist確認、`kingdom_watchlist_jobs` 作成後に初回収集処理を起動 | 接続あり。二重登録/初回失敗時の復旧は要テスト |
| 更新/再開 | `/api/kingdom-watchlist?action=refresh` POST | watchlist所有者とjobを照会し、進捗/カーソルを利用して収集処理を続行 | 接続あり。Queue経由ではなく同期HTTP経路となる場合の時間制約を確認 |
| キャンセル | `/api/kingdom-watchlist?action=cancel` POST | job/watchlist状態を照合し、対象処理の停止状態へ更新 | 接続あり。競合/二重押し/キャンセル後の再開は未検証 |
| 有効無効切替/削除 | `/api/kingdom-watchlist?action=toggle` POST / `?watchlist_id=` DELETE | watchlist所有者を基準に状態変更/削除。関連lock/job cleanupも実装 | 接続あり。各method/所有者境界をE2Eで確認する必要あり |
| データ表示 | `/api/kingdom-watchlist/data?watchlist_id=` GET | `kingdom_ranking_current` から必要順位を取得し、CTEで同盟略称を補完。Player Watchlist、上位プレイヤーID候補、`players`を参照 | 現行順位テーブル中心の読み取りを確認。広範囲`ranking_snapshots`取得なし |
| 順位履歴 | `/api/kingdom-watchlist/history` GET | `getRankingHistory`経由でD1/R2履歴を取得 | 接続あり。R2ページング/limitの実効性は要確認 |

### Watchlist共通の注意点

- ` + tick + `handlePlayerWatchlistApi` + tick + ` はACTIVEユーザーを確認してからDB操作する。Kingdom Watchlistは認証ユーザーを要求し、所有者IDで操作対象を絞るコードを確認した。個別APIの全method/権限境界はテスト未実施。
- Kingdom Watchlist収集は ` + tick + `kingdom_watchlist_jobs` + tick + `、` + tick + `kingdom_watchlist_locks` + tick + `、` + tick + `api_request_locks` + tick + `、` + tick + `collection_semaphore_slots` + tick + `と連携する経路がある。各ロックのTTL/競合/Worker停止後の回復は静的確認と実測を分ける。
- Player Watchlist GETはランキング現在値と変更イベントを取得するため、登録件数/上限が大きい場合のクエリコストを確認する。D1 Free reads優先で、取得範囲とIndex利用を評価する。
- ` + tick + `ensurePlayerWatchlistSchema()` + tick + ` は ` + tick + `index.js` + tick + ` 内で ` + tick + `return Boolean(db)` + tick + ` のみ。Migration 0012がスキーマを供給する想定で、request-time DDLは行わない。
- ここでは実際のユーザー操作や本番DB計測をしていない。UI/HTTP method、同時実行、失敗後再試行、D1 readsは未検証。
## 2026-10-10 第6巡目 — My Player / ADVANCED / VIP / Mightyの接続

| 機能 | 入口 | 実装/DB接続 | 棚卸し結果 |
|---|---|---|---|
| マイプレイヤー表示 | `/my-player` → `/api/me/player` GET | ACTIVEユーザーの `user_player_links` と `players` を取得し、MAIN/SUB・王国別の登録上限を返す | UI/API接続あり。無料枠は最大2王国、各王国MAIN 1 + SUB 1として表示 |
| 領主ID登録 | `/api/me/player` POST | 既存playersを確認。未取得の場合はAPI Pool経由でMightPulse取得→観測保存/Player materialize→user_player_links登録 | 接続あり。API Poolキー不足、404、ID競合、王国/アカウント上限を分岐処理 |
| 領主ID解除 | `/api/me/player` DELETE | 登録者のlinkをDISABLED化し、Service Usageを記録 | 接続あり。解除後のADVANCED/VIP状態更新タイミングは個別確認が必要 |
| ADVANCED状態/キー提供 | `/api/me/advanced` GET/POST と別名 `/api/me/mightpulse-key` | `api_pool_keys`へUSER_CONTRIBUTEDキーを暗号化保存。`/kingdoms`で通常キーを検証後、`/kvk/matchups`でMighty対応を自動確認 | 自動判定経路あり。登録時に通常API検証＋Mighty API検証の2段階。ユーザー提供キー数にコード上の上限なし |
| VIP資格表示 | `/api/me/vip` GET | `api_pool_keys`のMighty metadataと`users.role`を参照 | 登録済みの個別Mighty credential登録は廃止され、GET以外は410を返す実装 |
| Mighty再確認 | `/api/me/vip/mighty-check` POST | ユーザー提供キーを順にleaseし、`/kvk/matchups`を呼び、成功/失敗・Mighty metadata・資格判定を更新 | 接続あり。401/403/429/5xxと一時エラー時の状態整合を実行テストする必要あり |
| ロール昇格/降格 | `user-eligibility.js` | 領主リンクとユーザー提供キーでADVANCEDを判定。確認済みMightyキーがあればBASIC/ADVANCEDからVIPへ、VIP資格を失うとADVANCEDへ戻す。ADMIN/OWNERはロール維持 | ロール遷移ロジックあり。競合更新/disabled keyの扱いに静的確認候補あり |

### 未解決の状態整合候補

- ` + tick + `getVipEligibility()` + tick + ` は ` + tick + `api_pool_keys` + tick + ` のキーを ` + tick + `status != 'REVOKED'` + tick + ` で取得し、Mighty判定を ` + tick + `mighty_capable=1` + tick + ` かつ ` + tick + `mighty_check_status='CONFIRMED'` + tick + ` で判定している。` + tick + `DISABLED` + tick + ` 状態のキーでもMighty metadataがCONFIRMEDのままなら資格判定に残る可能性がある。
- Mighty再確認APIでは401時に ` + tick + `recordApiPoolFailure(... disable: status===401)` + tick + ` を呼ぶが、その経路で ` + tick + `setApiPoolMightyMetadata(... NOT_MIGHTY)` + tick + ` を呼ぶ処理は見当たらない。全キー401で ` + tick + `checked===0` + tick + ` の場合にUNDETERMINEDを返す分岐もあり、資格とキー状態の整合を実テストで確認する必要がある。
- これは既存監査で記録された静的候補の再整理。コード修正やロール変更は行わない。
- ` + tick + `user_mighty_credentials` + tick + ` / ` + tick + `user-mighty.js` + tick + ` は現行のキー提供/資格判定経路とは別系統に見える。` + tick + `/api/me/vip` + tick + `の410応答と併せ、未使用/旧実装の扱いは仕様確認まで保留する。
## 2026-10-10 第7巡目 — 管理者/Owner・API Pool・データ出力

### API Pool管理

| 機能 | 入口/権限 | 主な動作 | 棚卸し状態 |
|---|---|---|---|
| キー一覧/登録/Pool移動/失効 | `/admin/api-pool` と `/api/admin/api-pool/*`; handler側でADMINガード | `api_pool_keys`のキー状態、pool_type、provider、fingerprint、contributorsを表示/更新 | 接続あり。全HTTP method/二重送信/lease中操作の確認が必要 |
| Mighty判定/ヘルス確認 | ADMIN: `/api/admin/api-pool/mighty-check`、`/health-check` | Mighty専用API検証、health request、API usage/lease/status/metadata更新 | 接続あり。401/403/429/5xx後の状態遷移を確認する |
| Pool経由のプレイヤー/ランキングテスト | ADMIN: `/api/admin/api-pool/test-player`、`/test-ranking` | 指定Player/王国ランキングをPool経由で取得し、レスポンスと使用量を表示 | 接続あり。テスト起動は本番API使用量を消費するため、この棚卸しでは実行しない |
| キーの物理削除 | OWNER: `/api/admin/api-pool/delete` | `api_leases`、`api_pool_usage`、`api_pool_keys`を削除するコード | OWNER限定の経路あり。履歴/監査要件と削除の不可逆性は別途確認 |
| User-contributed key再割当 | OWNER: `/api/owner/api-pool/reassign` | USER_CONTRIBUTEDキーの登録者を変更し、旧/新ユーザーの情報を参照 | OWNER限定の経路あり。関連するロール/資格再評価と監査イベントの完全性を確認する |

### ロール/ユーザー管理・負荷テスト

- `/owner` と `/api/owner/users*` はユーザー一覧、ロール/状態変更、Login History、各ユーザーのWatchlist参照、Owner Audit Logを提供するコードがある。主要なOwner APIはルーターまたはハンドラー内で ` + tick + `requireOwner()` + tick + ` を呼び出す。全入口の認可を個別照合する。
- `/owner/kingdom-load-test` と `/api/owner/kingdom-load-test*` はOwner限定の負荷テスト画面、開始/キャンセル/状態/履歴/System JSONに接続。` + tick + `LOAD_TEST_QUEUE` + tick + `のconsumerは ` + tick + `runKingdomLoadTestQueue` + tick + ` を呼ぶ。実行は外部API/D1/Cloudflare消費を伴うため未起動。
- `/api/load-test/notice-status` はOwner pathとは別ルート。handler内の認可、情報公開範囲、呼び出し頻度を個別確認する。
- `/api/owner/player-link-support` は本人確認/移管/却下のサポート案件をOwner向けに処理する。` + tick + `user_player_link_support_requests` + tick + `の状態遷移とプレイヤー所有権移管の整合を確認する。

### Google Sheets出力

- プレイヤーのセクション出力: `/api/admin/player-export`。` + tick + `requireAdmin()` + tick + `、セクション許可リスト、Player observationの取得、` + tick + `exportToGoogleSheet()` + tick + `、Service Usage記録を確認。
- 王国ランキング出力: `/api/admin/kingdom-ranking-export`。ADMINガード、board/kid検証、事前に取得済みのranking rows、Google Sheets連携設定確認、Service Usage記録を確認。
- Google Sheets transportはService AccountまたはApps Script Web Appを使う実装がある。認証/secret、リトライ、出力先の権限は実環境確認が必要。
- ExportはADMIN/OWNER向け機能として扱い、BASIC/ADVANCED/VIPからの直接呼び出しがhandlerでも拒否されることをHTTPテストで確認する。

### API Pool / 管理画面の未完了項目

- API PoolのUIはキー追加、Mighty判定、キー削除、Pool移動/再割当、Player/Ranking testを含む。画面のボタンとAPIのHTTP method/role guardの対応は全件テスト未完了。
- キー削除は ` + tick + `api_pool_usage` + tick + ` も消すため、監査/利用量履歴の保存ポリシーを確定してから扱う。
- API Poolの実利用量/残枠は実環境で確認していない。Load TestやHealth Checkをこの棚卸し中に起動していない。
## 2026-10-10 第8巡目 — Diagnostics / System Log / Google Drive / Discord Support

### System Status / Diagnostics / Logs

| 機能 | 入口/処理 | 認可/保存先 | 初期判定 |
|---|---|---|---|
| 公開System Status | `/status` → `renderPublicStatusPage` | D1 diagnostics、運用状態、API Pool、Cloudflare Analytics、R2 probe等を集約 | 公開ページあり。60秒更新表示。詳細計測/外部API取得の読み取りコストと公開情報を確認する |
| 詳細Diagnostics | `/admin/diagnostics` / `/api/admin/diagnostics` | ページ/handler内でADMINガード。`diagnostic_events`と運用状態を参照 | ADMIN限定経路あり。各監視状態が実データと一致するかは未検証 |
| System Log | `/admin/system-log`、`/api/admin/system-log*` | Router側ADMINガード。`system_event_log`とtrace情報を参照/Export | 接続あり。24時間表示・Export範囲・Retention実行を別途確認 |
| System Event Queue | Worker `fetch()/queue()` | fetch entryで`setSystemEventQueue`、Queue consumerが`handleSystemEventQueue`を実行 | Queue経路の接続あり。DLQ/再試行は本番設定確認が必要 |
| Retention / System Log Archive | `runDataRetentionJob`内で`runRetentionCleanup`と`archiveSystemEventLog` | R2保存結果を診断イベントへ記録する実装 | 親ジョブのWorker起動経路が見つからないため、定期処理が実行されるか未確定 |

### Google Drive OAuth / Archive Mirror

- Owner向けの開始/検証: ` + tick + `/api/admin/google-drive/authorize` + tick + ` と ` + tick + `/api/admin/google-drive/verify` + tick + `。どちらもOWNERガードを持つ。
- Callback実装: ` + tick + `/api/admin/google-drive/callback` + tick + `。OWNERガード、state token検証、OAuth code交換、Drive archive folder作成の経路を確認。
- **静的設定不一致候補:** ` + tick + `wrangler.jsonc` + tick + ` の ` + tick + `GOOGLE_DRIVE_OAUTH_REDIRECT_URI` + tick + ` は `/api/auth/callback` を指定している一方、Worker routerのGoogle Drive callbackは `/api/admin/google-drive/callback`。このままの設定ではGoogle OAuthがDiscord callbackへ戻る可能性がある。実OAuthフローは実行していないため、設定差分として要確認。
- ` + tick + `GOOGLE_DRIVE_OAUTH_REDIRECT_URI` + tick + ` の実環境値、Google Cloud Console側の許可Redirect URI、OAuth state/nonce、Refresh Tokenの保存先を本番変更なしで確認する必要がある。

### Discord Support

- `/support` は利用者向けサポートUI。` + tick + `/api/support/context` + tick + ` でカテゴリ/症状に対応するコンテキストを取得し、` + tick + `/api/support` + tick + ` で問い合わせ/チケット操作を行う。ユーザー認証情報をhandlerへ渡す。
- `/api/discord/interactions` はDiscord Interaction署名検証を含む ` + tick + `discord-support.js` + tick + ` へ接続。チケット作成/終了/再開、権限設定、通知、診断記録を実装。
- `/api/admin/discord-support/register-command` はACTIVEなADMIN/OWNER相当の権限チェックとPOST method checkを持つコードを確認。Discord APIへの登録は実行していない。
- チケット状態遷移、Discord署名の実リクエスト検証、チャンネル作成、権限上書き、通知失敗時の再試行は未検証。

### この領域の未完了項目

- 公開Statusは全体状態を集約するため、ページロード/自動更新ごとのD1 reads、Cloudflare Analytics呼び出し、R2 probe回数を測る必要がある。ただし棚卸し中に本番アクセス負荷試験は行わない。
- Admin Diagnosticsは表示されるローラー状態と、実際に起動するscheduled/queue処理の差を確認する。未接続ローラーを画面に表示しているだけの可能性を区別する。
- System Logのarchive/retentionとHistory Emergency Bufferのdrainは別機能。片方が動いていることを他方の稼働証明にしない。
## 2026-10-10 第9巡目 — Kingdom Portal / Ranking / Alliance / Mighty

| 画面/機能 | データ経路 | 画面動作/制限 | 棚卸し判定 |
|---|---|---|---|
| Kingdom Catalog/Detail | `kingdom-catalog-page.js`、`kingdom-portal.js`。`kingdom_catalog`のメタデータ/R2 payloadと`kingdom_ranking_current`、`kingdom_ranking_board_state` | 王国の基本情報、Power/Activity等の指標、Top Player/Alliance、ランキングボード、取得鮮度/R2状態。詳細payloadは対象王国のR2 keyを読む | 実装あり。R2失敗時のD1 legacy fallbackとR2読み取りコストを照合 |
| Kingdom Rankings | `/kingdom/rankings` | `kingdom_ranking_current`からkid+boardで最大100行。ログイン時は`user_kingdom_ranking_preferences`と`user_player_links`から初期王国/ボードを解決 | 接続あり。設定保存APIはACTIVEユーザーのPOSTを要求 |
| Ranking preferences | `/api/kingdom-rankings/preferences` POST | `kingdom_catalog`のkid存在、許可board、primary_boardが選択済みか検証して`user_kingdom_ranking_preferences`をUPSERT | 接続あり。保存後の画面反映はUI経路あり、E2E未確認 |
| Alliance List/Detail | `/kingdom/alliances` / `/alliance` | 優先して`alliance_catalog`を読み、空なら`kingdom_ranking_current`へfallback。R2 keyがあれば同盟詳細/rosterを読み、最大100人表示 | 実装あり。alliance rollerの起動/bindingは別の未接続候補として管理 |
| Kingdom Compare | `/kingdom/compare` | queryで最大4王国を受け、`kingdom_catalog`と各王国のR2 payloadを並列読出し、現在値/7日成長指標を比較 | 実装あり。入力上限は最大4王国 |
| Ranking Changes | `/kingdom/changes` | `kingdom_ranking_current`のprevious_rank/current rankと、対象boardの`change_events`を使用。各最大100行 | 実装あり。前回順位→今回順位とIN/OUTを表示。広範囲`ranking_snapshots`取得なし |
| Kingdom Portal API | `/api/kingdom-portal/ranking`、`/api/kingdom-portal/status` | rankingはkid/boardを検証して`kingdom_ranking_current`から最大100行。statusは`system_event_log`の最新イベントとCatalog件数を返す | rankingは公開パス、statusはrouterでADMIN guard。HTTP/E2E未確認 |
| Watchlist Analytics | `/kingdom-watchlist/analytics` | ACTIVEユーザーの王国WatchlistとCatalogをJOINし、最終成功/鮮度差を表示 | ログイン必須。最大100件の一覧 |
| Mighty Events / KvK | `/kingdom/mighty` | ACTIVEユーザーを要求し、`evaluateVipEligibility`でVIP/ADMIN/OWNERかつMighty資格を確認。ユーザー提供API Poolキーでeventsとkvkを個別取得 | 実装あり。2回の外部API呼び出し、15秒timeout・最大2 retries、System Event記録。実API使用量/失敗表示は未検証 |

### Kingdom Portalのコスト/鮮度ルール

- Detail/Rankings/Changes/Allianceは主に ` + tick + `kingdom_ranking_current` + tick + ` とCatalogを参照し、現在順位表示に ` + tick + `ranking_snapshots` + tick + ` の広範囲取得を使わない。
- Kingdom Detail/Compare/Alliance Detailは選択された王国/同盟のR2 keyを読む。R2 listで全履歴を走査する経路と、既知keyを直接getする経路を区別する。
- Kingdom PortalのMightyページはイベントAPIとKvK APIを別々に呼ぶため、ページ表示だけで外部APIを複数消費する。自動ポーリングや再読み込みを含む実使用量は未計測。
- ` + tick + `renderKingdomRankingsPage` + tick + `は認証ユーザーの保存設定/リンク済み王国を参照するが、画面自体は公開ルートとして描画される。ログイン前後の表示・データ露出はE2Eで確認する。
## 2026-10-10 第10巡目 — Player Search/Profile/History/Changes/Export

| 機能 | 入口/実装 | データ/権限 | 棚卸し判定 |
|---|---|---|---|
| Player Search | `/players` | ACTIVEユーザー限定。`players`から名前/領主ID/王国/同盟名をLIKE検索し、power降順で最大30件 | 実装あり。先頭/部分一致検索のIndex利用とD1 readコストは要評価 |
| Player Profile | `/player?governor_id=...` | ACTIVEユーザー限定。`api_observations`の最新payload/playersを読み、必要時にAPI Pool経由でMightPulse取得・Materialize。role visibility設定を適用 | 実装あり。通常/refresh/rich queryで外部API取得条件が変わる |
| Player Refresh API | `/api/player/refresh` | API Poolから明示再取得、Materialize、可視性フィルタ、Service Usage記録 | route/handlerあり。現在のProfile UIは`/player?...&refresh=1`を使い、このAPIへの直接UI呼び出しは見つからない |
| Player API | `/api/player` GET相当 | cache observationを再利用し、必要時に外部取得。visibility設定に基づきフィールドを除外 | route/handlerあり。Profile UIはサーバー側で同様の処理を行うため、重複/外部利用の仕様を確認 |
| Player History API | `/api/player/history` | `getPlayerHistory`経由でD1/R2履歴を取得し、ロール別フィルタを適用。limit 1–100 | 接続あり。R2を含む履歴API |
| Player History画面 | `/player/history` | `player_snapshots`をD1から直接SELECT、最新100行を表示 | APIとは別の読出し経路。R2へ移行済み/NULL化されたpayloadは画面に反映されない可能性があるため、重要な整合候補 |
| Player Rank History API | `/api/player/rank-history` | `getPlayerRankHistory`にD1/R2 archive bucketを渡す | APIあり。対応する専用画面/現UI呼び出しは未確認 |
| Player Changes | `/player/changes` と `/api/player/changes` | `change_events`を対象Governor IDで取得し、role visibilityに基づき非表示項目を除外 | 画面/API両方あり。現画面はサーバー側で直接SELECT、APIは別実装 |
| Player Optional Assets/Hero/Equipment | `renderPlayerOptionalAssets` / `renderPlayerAdvancedSections` / `getLatestPlayerHeroRankings` | profile payloadからHeroes/Ranks/Governor Gear、name history、hero rankings等を構成。ADMIN/OWNERにはsection export linkを表示 | 実装あり。データの欠損/鮮度/日本語ラベル/画像参照のE2E確認は未完了 |
| Player Section Export | `/api/admin/player-export` | ADMIN guard、section allowlist、latest observation payload、Google Sheets export、Service Usage記録 | ADMIN限定経路あり。画面のsectionリンクとexport対象列の対応を照合する |

### Player領域の未解決/重複候補

- **HistoryのD1/R2経路差:** ` + tick + `/api/player/history` + tick + `は ` + tick + `getPlayerHistory()` + tick + `を使う一方、` + tick + `/player/history` + tick + `は ` + tick + `player_snapshots` + tick + `を直接読む。Retention/R2 archive後にUIとAPIの結果が異なる可能性があり、データ保全観点で優先確認。
- ` + tick + `/player` + tick + `のProfile UIが直接外部取得/Materializeを行う一方、` + tick + `/api/player` + tick + `と` + tick + `/api/player/refresh` + tick + `も存在する。重複APIが意図した外部利用向けか、現在の画面から未使用なのかを確定する。
- ` + tick + `/api/player/rank-history` + tick + `はルートがあるが、画面上の対応する履歴リンクは見つからない。使用者/用途を確認する。
- ` + tick + `/player/compare` + tick + `と` + tick + `/api/player-compare` + tick + `はルートのhandler/page参照が未解決。` + tick + `player-compare.js` + tick + `のロジックだけではページ/APIの入口を満たしていない。
- Player Searchの ` + tick + `LIKE '%q%'` + tick + `条件は通常のB-tree prefix検索にならない可能性がある。検索範囲/Index/実D1読み取りはQuery Planまたは計測で確認するが、本棚卸し中は計測クエリを本番で実行しない。

### 可視性ルール

- ` + tick + `player_visibility_settings` + tick + `と ` + tick + `filterPlayerForRole()` + tick + ` / ` + tick + `filterPlayerProfileForRole()` + tick + ` / ` + tick + `isChangeVisibleForRole()` + tick + `が、基本プロフィール・同盟・Hero/Rank/Equipment・Change Eventsの表示範囲を制御する。
- visibility設定取得に失敗した場合、基本フィールドを除外するfail-closed経路がある。ADMIN/OWNER用exportはAPI側でもADMINガードを持つ。
- UI表示だけでは認可/可視性を保証できないため、API直叩き時のフィールド除外・role別結果は別途HTTPテストする。
## 2026-10-10 第11巡目 — Retention対象とR2読出し機能の照合

Retentionの実装は、対象テーブルから期限切れ行をバッチ取得し、許可されたテーブルをR2へ書いた後、元のD1 rowidを削除する方式。R2への保存成功だけで、UI/APIがアーカイブ済みデータを読めるとは限らない。

| テーブル | Retention動作 | R2 readback | 現行画面/APIとの対応 |
|---|---|---|---|
| `api_observations` | 期限切れの古い観測をR2へ保存してD1削除。最新観測を保持する特別条件あり | `getLatestPlayerObservation`はD1の最新観測を読む | 最新表示の経路は残る想定。履歴全件の画面表示は別途確認 |
| `player_snapshots` | R2へアーカイブ後、元D1行を削除 | `getPlayerHistory`がR2履歴を読む | APIはD1/R2対応だが、`/player/history`画面はD1を直接読むため、アーカイブ後の履歴が画面から欠落する可能性 |
| `ranking_snapshots` | R2へアーカイブ後、元D1行を削除 | `listRankingHistoryFromR2` / `getRankingHistory`のR2経路あり | ランキング履歴API/画面のreadback経路を引き続き照合 |
| `player_rank_snapshots` | R2へアーカイブ後、元D1行を削除 | `listPlayerRankHistoryFromR2` / `getPlayerRankHistory`あり | Rank History APIはR2対応。画面/利用箇所が未確認 |
| `change_events` | R2へアーカイブ後、元D1行を削除 | アーカイブ処理は`archiveD1RowsToR2`にあるが、Change Event専用のR2 list/get関数は確認できない | `/player/changes`、`/api/player/changes`、`/kingdom/changes`はD1を直接参照。Retention後は古いイベントが表示から抜ける可能性 |
| `login_history` / `owner_audit_log` / `api_pool_usage` / `player_identity_history` | 設定日数経過後にR2へアーカイブしてD1削除する対象 | 汎用アーカイブ保存あり。画面/API側でのアーカイブ横断読出しはこの巡回では未確認 | 「長期保存」と「画面で検索可能」を区別し、Owner履歴/使用量/名前履歴の要件を確認 |

### 重要な結論

- RetentionアーカイブはD1読み取り/容量の制御に役立つが、アーカイブ済みデータの画面/API再表示は各機能がR2 readbackを実装している場合に限られる。
- ` + tick + `/player/history` + tick + `とPlayer Changes系の画面/APIは、Retention後にR2アーカイブ済みの行を表示しない可能性がある。これは静的な経路差候補であり、データ欠落の実再現は未実施。
- ` + tick + `runDataRetentionJob` + tick + `の起動経路自体も未接続候補なので、実際にRetentionが走っているか/どの設定値かは本番DBを変更せず別途確認する。
- 本棚卸しではR2全件listやアーカイブの全件読出しを追加しない。D1 Free読み取りを優先し、必要なR2 readbackは対象範囲・ページング・費用を明示して設計する。
## 2026-10-10 第12巡目 — Gateway API / MightPulse Probe・Research / R2 Backfill

### Gateway API

- Prefix route: ` + tick + `/api/gateway/v1/*` + tick + `。実装されているpathは ` + tick + `/api/gateway/v1/status` + tick + ` と ` + tick + `/api/gateway/v1/diagnostics` + tick + `。
- 両方GET限定、` + tick + `EAGLEEYE_GATEWAY_TOKEN` + tick + `設定必須、Bearer/token認証。read-onlyとして診断/運用状態/Cloudflare利用量/History Storage状態/System Logを返す。
- Statusの通常応答は直近500件を返す制限付きで、対象期間全件をメモリに展開しない設計。` + tick + `?full=1` + tick + `はstreaming log export経路を持つ。
- Gateway Statusは複数のD1/Analytics/Storage診断を並列実行するため、呼び出し頻度・range・full exportの読み取り量とWorkerメモリを確認する。実呼び出しは未実施。

### MightPulse Probe / Research / Ranking Test

| 機能 | 入口/実装 | 初期判定 |
|---|---|---|
| MightPulse Probe画面/API | `/admin/mightpulse-probe` / `/api/admin/mightpulse-probe` | Player/Kingdom/Ranking等の取得検証UIとAPI。外部API使用量を伴うためテスト未実行 |
| MightPulse Research画面/API | `/admin/mightpulse-research` / `/api/admin/mightpulse-research` | 候補endpointの調査・payload要約・候補一覧を実装。Google Apps Script署名等の連携は別途照合 |
| Ranking/Player Admin test | `/api/admin/rankings/player` / `/api/admin/rankings/board` | API Pool/MightPulseを使った個別取得テスト経路あり。role guard、response保存、D1/外部APIコストは未検証 |
| API Raw Inspector | `/admin/api-raw-data` / `/api/admin/api-raw-data` / `/api/admin/api-raw-history` | `api_observations`をもとにraw payload/history/画像参照を確認する管理者画面。secret sanitizationとlimit/retentionの確認が必要 |

### Kingdom Catalog R2 Backfill

- Owner page: ` + tick + `/owner/kingdom-catalog-r2-backfill` + tick + `。routerで ` + tick + `requireOwner()` + tick + ` を確認し、POST action ` + tick + `run` + tick + `/` + tick + `run_all` + tick + ` を処理する。
- ` + tick + `runKingdomCatalogR2Backfill()` + tick + `はD1の ` + tick + `r2_latest_key IS NULL` + tick + ` かつraw/boards payloadがある行を対象に、R2保存後にD1 payloadをNULL化する。バッチサイズは通常1–100、run_allも1回100件までで段階実行。
- 実行後は ` + tick + `verifyKingdomCatalogR2Backfill()` + tick + `でR2 object存在、pointer、raw/boards NULL状態を確認し、失敗時はmigration stateをFAILEDへ更新する実装。
- これはOwner手動操作で外部R2書き込みとD1更新を伴うため、この棚卸しでは実行していない。対象件数、同時実行競合、進捗復帰、実R2内容の確認は未完了。

### この領域の未完了項目

- GatewayのBearer token設定/ローテーション/実環境アクセス元、full exportのサイズ制限/streaming挙動は未確認。
- MightPulse Probe/Researchの全候補、API Poolキー選択、失敗分類、再試行、出力先/研究用蓄積をAPI単位で照合する。
- R2 backfillはOwner UI/APIだけでなくMigration state、D1 pointer、R2 object catalog、再開/失敗時の状態遷移を一体で棚卸しする。
### 全ソースのAPI文字列とルーター照合（第1回）

- ` + tick + `src/index.js` + tick + `以外の ` + tick + `src/` + tick + `ファイル50件を対象に、静的文字列として書かれた `/api/...` 参照をルーターの完全一致パス/特殊prefixと照合した。
- この文字列抽出でルーター未登録として残ったものは ` + tick + `/api/owner/kingdom-load-test/export?run_id=` + tick + ` のみ。handler/UIリンクは存在するが、import/route接続がないことを確認済み。
- この結果は静的な文字列照合の範囲。実行時に組み立てるURL、外部クライアント、未使用の古い呼び出し元の存在までは否定しない。
### Player Visibility / Watchlist Limitsの認可不一致候補

- ` + tick + `/admin/player-visibility` + tick + `のページレンダラー ` + tick + `renderPlayerVisibilityPage()` + tick + ` は ` + tick + `requireAdmin()` + tick + ` を使用し、ADMIN/OWNER向け画面を表示する。
- しかし対応API ` + tick + `/api/admin/player-visibility` + tick + ` の ` + tick + `handlePlayerVisibilityApi()` + tick + ` は ` + tick + `requireOwner()` + tick + ` を使用している。` + tick + `requireOwner()` + tick + ` は ` + tick + `auth.role !== 'OWNER'` + tick + ` を403にする。
- 同API内部には ` + tick + `guard.auth.role === 'ADMIN'` + tick + ` の分岐（OWNER設定を拒否する処理）が複数あるが、` + tick + `requireOwner()` + tick + `を通過した後ではADMINになり得ない。画面の認可とAPIの認可が一致しない静的候補。
- 影響候補: ADMINでページ表示できても、初期設定取得/保存のAPIが403になり、Player VisibilityとWatchlist Limitsの管理ができない。OWNERでの操作は別途実行テスト未確認。
- 修正方針はまだ決めない。まず仕様上ADMINに許可する範囲（OWNER role/OWNER-only visibility項目を除く）を確定し、API直叩き/画面操作のテストケースを定義する。
## 2026-10-10 第13巡目 — Admin設定画面・管理操作の権限/Method

| 機能 | Page/API | Method/認可 | 動作/注意 |
|---|---|---|---|
| Retention設定 | `/admin/data-retention` / `/api/admin/data-retention` | ADMIN/OWNER、GET=設定取得、POST=設定更新 | 設定保存のみ。Retention cleanup自体を実行するAPI/ボタンではない |
| Player Visibility/Watchlist Limits | `/admin/player-visibility` / `/api/admin/player-visibility` | Page=ADMIN/OWNER、API=OWNER限定 | Page/API role mismatch候補を上記に記録。APIはGET/POST、ADMINのOWNER-only項目を拒否する分岐があるが、requireOwnerでADMINが先に拒否される |
| Admin Kingdom Rankings | `/admin/kingdom-rankings` / `/api/admin/kingdom-rankings` | ADMIN/OWNERガード。handlerに明示method制限は見当たらない | `?refresh=1`で外部API Pool取得、順位変化計算、D1保存を行う。GETによる副作用/再送/プリフェッチを要確認 |
| Kingdom Ranking Export | `/api/admin/kingdom-ranking-export` | ADMIN/OWNER、kid/board検証、既存ランキング必須 | Google Sheetsへ出力してService Usageを記録 |
| Admin Diagnostics | `/admin/diagnostics` / `/api/admin/diagnostics` | Page/API双方ADMINガード | ページの自動更新間隔とAPI/DB読み取り量を確認する |
| Admin System Log | `/admin/system-log` / `/api/admin/system-log*` | RouterでADMINガード | read/export/downloadを分けている。期間/limit/R2 archiveと整合を確認 |
| Monitoring Profile | `/api/admin/monitoring-profile` | ACTIVEなADMIN/OWNER、GET/POST | cookieにprofileを保存する。Cloudflare planの実契約/請求情報と、画面のローカル表示を区別する |
| R2 Object Inventory | `/api/admin/r2-archive-objects` | ACTIVEなADMIN/OWNER、GETのみ、limit最大値/Prefixを制限 | R2 listを行うため、page size・prefix・limit・再読み込み頻度を確認する |

### 管理画面操作の横断ルール

- Pageを見られることとAPI操作が許可されることは別。特にADMIN/OWNER差、ACTIVE/DISABLED状態、HTTP method、対象user_id/key_idの所有境界を機能ごとに確認する。
- 読み取りに見えるGETでも、` + tick + `refresh=1` + tick + `のように外部API取得/DB保存を伴う経路がある。GET side effectは仕様上の意図を確認し、再送/ブラウザ先読み/キャッシュの影響をテストする。
- 本棚卸しではGET refresh、Pool Health Check、MightPulse Probe、負荷テスト、R2 backfillを起動していない。
## F. 既知の接続・完成度確認ポイント（棚卸し開始時点）

これらはコード上の所見であり、実行時に再現した不具合と同義ではない。新規の不具合判定を行う前に関連コード・定義・呼び出し元を再照合する。

1. `handlePlayerCompareApi` と `renderPlayerComparePage` のルート参照に対し、定義/importの存在が見つからないという既存所見。build/route試験は未実施。
2. `runKingdomSeeder` / `runKingdomRankingRoller` / `runAllianceRoller` / `runPlayerRoller` は実装/importがあるが、Worker起動経路への接続を確認できていない。
3. `runRetentionCleanup`、`drainHistoryEmergencyBuffer`、`releaseExpiredLeases` など、実装関数と定期実行経路の接続を個別に照合する必要がある。
4. 3つの収集ローラーが `R2_ARCHIVE` を参照する可能性があり、現行 `wrangler.jsonc` のbinding `ARCHIVE` と一致するか要確認。
5. Google Drive OAuth redirect URIの設定が実装Callbackと不一致の候補。
6. PreviewはProductionと同じD1/R2 resource IDを指定し、Queue bindingにも差分がある。
7. Watchlist scheduler / retention / emergency buffer / load-test export などに未接続候補がある。
8. `ranking_snapshots` の広範囲取得クエリは復活させない。既存のランキング履歴・R2移行経路は低コスト優先で照合する。


## 2026-10-10 第1巡目 — ルート定義・Worker起動経路の照合結果

### 1. ルート参照先の静的照合

`src/index.js` の110件の完全一致パス入口を、同ファイル内の関数定義・変数定義・46件の相対import（131個のimport名）と照合した。

- [x] 定義/importの存在を照合
- [ ] ビルド/HTTPアクセスによる実行確認（未実施）

**ルート定義/接続の要確認候補が3件残る（未解決参照2件＋UI呼び出し先未登録1件）。**

| パス | 参照名 | 静的確認結果 | 影響候補 |
|---|---|---|---|
| `/api/player-compare` | `handlePlayerCompareApi` | `index.js` 内に定義なし、importなし。`player-compare.js` にも該当ハンドラーなし | API呼び出し時にReferenceErrorとなる可能性 |
| `/player/compare` | `renderPlayerComparePage` | `index.js` 内に定義なし、importなし。`player-compare.js` にも該当画面関数なし | 画面アクセス時にReferenceErrorとなる可能性 |
| `/api/owner/kingdom-load-test/export?run_id=...` | `handleOwnerKingdomLoadTestExportApi` | `admin-kingdom-load-test.js` にCSV handlerとUIリンクあり。ただし `index.js` からimportされず、router分岐もない | CSV exportリンクが意図したCSVを返さず、fallbackへ到達する可能性 |

`admin-kingdom-load-test.js` には `handleOwnerKingdomLoadTestExportApi` が定義され、負荷テスト履歴UIも `/api/owner/kingdom-load-test/export?run_id=` を呼び出すが、Worker routerのimport/分岐に接続されていない。handler側にOWNERガードも見当たらないため、ルートを接続する場合はOWNER認可をrouterまたはhandlerで必ず適用する必要がある。現時点では接続/修正していない。

`player-compare.js` には `normalizeCompareGovernorIds`、`buildPlayerCompareSeries`、`extractOptionalPlayerAssets` の比較用ロジックはあるが、ルートが呼ぶAPIハンドラーとページレンダラーは確認できない。これは静的な接続欠落候補であり、ビルドや実リクエストによる再現はしていない。修正はまだ行わない。

### 2. Workerイベント入口と定期処理の照合

`src/index.js` の `scheduled()` と `queue()` を確認した。

| 処理 | 定義/接続 | 判定 |
|---|---|---|
| API Pool自動復旧 `runApiPoolAutoRecovery` | `scheduled()` から呼び出し | 接続あり |
| 王国Catalog日次更新 `runKingdomCatalogDailyRefresh` | `scheduled()` から呼び出し | 接続あり |
| Discord変更通知 `runKingdomDiscordNotifications` | `scheduled()` から呼び出し | 接続あり |
| System Event Queue | `queue()` から `handleSystemEventQueue` を呼び出し | 接続あり |
| Load Test Queue | `queue()` から `runKingdomLoadTestQueue` を呼び出し | 接続あり |
| Service Usage Queue | `queue()` から `handleServiceUsageQueue` を呼び出し | 接続あり |
| `runKingdomSeeder` | importのみ。呼び出し箇所なし | 未接続候補 |
| `runKingdomRankingRoller` | importのみ。呼び出し箇所なし | 未接続候補 |
| `runAllianceRoller` | importのみ。呼び出し箇所なし | 未接続候補 |
| `runPlayerRoller` | importのみ。呼び出し箇所なし | 未接続候補 |
| `runDataRetentionJob` | 関数定義のみ。呼び出し箇所なし | 未接続候補 |
| `drainHistoryEmergencyBuffer` | importのみ。呼び出し箇所なし | 未接続候補 |

補足:

- `runDataRetentionJob()` 内には `runRetentionCleanup()` と `archiveSystemEventLog()` の呼び出しがあるが、親関数 `runDataRetentionJob()` 自体が起動されていないため、これらも現在のWorkerイベント経由では到達しないように見える。
- `drainHistoryEmergencyBuffer()` の公開ラッパーは `history-emergency-buffer.js` に存在するが、`index.js` からの呼び出しは確認できない。
- これらが別の呼び出し元・外部トリガー・意図的な未使用コードなのかは未確定。削除/接続の判断はしない。
- `scheduled()` は5分ごとに動く設定だが、上表にないローラーを「Cron実装済み」とは扱わない。


### 4. 画面/API参照の初期抽出（静的）

`src/index.js` 内でWorkerの `fetch()` ルーター定義より前にあるAPI文字列を抽出した。

- API文字列参照: 27箇所
- 一意な文字列: 21件
- Queryを除いたパス: 15種類
- 抽出できた主な画面側のAPI系統: Kingdom Watchlist（create/refresh/cancel/toggle/delete/data）、Player Watchlist、マイプレイヤー（player/advanced/VIP/Mighty check）、Discordログイン、Google Drive接続検証、MightPulse調査/Probe。
- これは `index.js` 前半の文字列抽出結果に限る。後半に定義される管理画面、他モジュール、動的に組み立てるURLは別途対象。全ボタン/API対応の完了を意味しない。

### 3. この巡回での暫定優先順位

1. **最優先の接続確認候補:** プレイヤー比較の2つのルート参照。
2. **データ鮮度/保全に関わる候補:** Seeder/Roller群、Retention job、History Emergency Bufferの起動経路。
3. 次巡回で、各画面HTMLのフォーム・ボタン・`fetch()` を抽出し、対応API・認証・HTTP method・DB/外部APIまでマッピングする。
4. その後、MigrationとSQL参照をテーブル/列/Index単位で双方向照合する。

## G. 棚卸しの完了条件

- [x] `src/` の全ファイル名と責務の初期分類を記録
- [x] `src/index.js` の完全一致ルートと特殊prefix/callback/fallbackを記録
- [x] `migrations/` の全ファイル名と番号重複を記録
- [x] `wrangler.jsonc` の主要binding・Cron・Queue・Preview差分を記録
- [x] Workflow・スクリプト・公開アセットを列挙
- [ ] 各画面/APIが参照する実装関数と定義/呼び出し元の照合完了
- [ ] 全Migrationのテーブル/列/制約/indexと現行SQLの双方向照合完了
- [ ] 全画面のUI機能、ボタン、フォーム、API呼び出し、権限、空/失敗状態の棚卸し完了
- [ ] 実装あり/未接続/重複/未実装/仕様未確定を機能ごとに確定
- [ ] テスト可能性と本番E2E確認項目を機能ごとに定義

## 次の作業

1. まず `src/index.js` の各ルート参照先が定義・importされているかを網羅照合し、未定義/未接続候補を確定する。
2. 各画面のHTML生成内にあるフォーム・ボタン・fetch先を抽出し、画面→API→関数→DB/外部APIを対応付ける。
3. Migration 0001–0058をテーブル・列・制約・index単位に分解し、全SQL参照との双方向マッピングを作る。
4. Cron / Queue / UIポーリング / 手動管理画面を起点に、各ジョブの呼出経路・状態遷移・失敗時挙動を確定する。
5. 実装と接続の棚卸しが終わるまで修正は始めない。問題候補は別途、根拠・影響・再現テストを揃えて優先順位付けする。

## 初回記録

- 対象: `main`。取得時点: 2026-10-10。
- 作成内容: 画面/API入口、ソースモジュール、Migration、Cloudflare設定、Workflow、スクリプト、アセット、機能領域の初期マッピング。
- この時点で「全機能棚卸し完了」とは判定しない。上記の未完了チェックがすべて埋まった後にのみ完了とする。
