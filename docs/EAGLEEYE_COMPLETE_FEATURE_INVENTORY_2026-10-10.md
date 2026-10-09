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

- `wrangler.jsonc` はR2 bindingを `ARCHIVE` として定義している。
- `alliance-catalog.js`、`kingdom-ranking-roller.js`、`player-roller.js` は `env.R2_ARCHIVE` を参照している。
- そのため、これらのローラーを現在のWorker環境から直接起動した場合、R2 bucketが取得できない可能性がある。ローラーの起動経路自体が未接続候補であるため、これは「静的なbinding名不一致候補」として記録し、現時点では修正しない。
- `index.js` の既存API/Portal/履歴経路の多くは `env.ARCHIVE` を使用しており、binding名の一括置換を無条件に行わない。

### D1コストの固定条件

- D1 Free読み取り量を最優先する。
- `ranking_snapshots` の広範囲取得クエリを復活させない。
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

- `src/index.js` 自体には、直接の `CREATE TABLE/CREATE INDEX/ALTER TABLE` 文は見つからなかった。
- `src/user-player-link.js` には `ensureSchema(db)` があり、テーブルと複数Indexを `IF NOT EXISTS` で作成する。モジュールスコープのPromiseで同一Worker isolate内の初回実行を共有するため、毎リクエスト実行と断定しない。
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

- `handlePlayerWatchlistApi` はACTIVEユーザーを確認してからDB操作する。Kingdom Watchlistは認証ユーザーを要求し、所有者IDで操作対象を絞るコードを確認した。個別APIの全method/権限境界はテスト未実施。
- Kingdom Watchlist収集は `kingdom_watchlist_jobs`、`kingdom_watchlist_locks`、`api_request_locks`、`collection_semaphore_slots`と連携する経路がある。各ロックのTTL/競合/Worker停止後の回復は静的確認と実測を分ける。
- Player Watchlist GETはランキング現在値と変更イベントを取得するため、登録件数/上限が大きい場合のクエリコストを確認する。D1 Free reads優先で、取得範囲とIndex利用を評価する。
- `ensurePlayerWatchlistSchema()` は `index.js` 内で `return Boolean(db)` のみ。Migration 0012がスキーマを供給する想定で、request-time DDLは行わない。
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

- `getVipEligibility()` は `api_pool_keys` のキーを `status != 'REVOKED'` で取得し、Mighty判定を `mighty_capable=1` かつ `mighty_check_status='CONFIRMED'` で判定している。`DISABLED` 状態のキーでもMighty metadataがCONFIRMEDのままなら資格判定に残る可能性がある。
- Mighty再確認APIでは401時に `recordApiPoolFailure(... disable: status===401)` を呼ぶが、その経路で `setApiPoolMightyMetadata(... NOT_MIGHTY)` を呼ぶ処理は見当たらない。全キー401で `checked===0` の場合にUNDETERMINEDを返す分岐もあり、資格とキー状態の整合を実テストで確認する必要がある。
- これは既存監査で記録された静的候補の再整理。コード修正やロール変更は行わない。
- `user_mighty_credentials` / `user-mighty.js` は現行のキー提供/資格判定経路とは別系統に見える。`/api/me/vip`の410応答と併せ、未使用/旧実装の扱いは仕様確認まで保留する。
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

- `/owner` と `/api/owner/users*` はユーザー一覧、ロール/状態変更、Login History、各ユーザーのWatchlist参照、Owner Audit Logを提供するコードがある。主要なOwner APIはルーターまたはハンドラー内で `requireOwner()` を呼び出す。全入口の認可を個別照合する。
- `/owner/kingdom-load-test` と `/api/owner/kingdom-load-test*` はOwner限定の負荷テスト画面、開始/キャンセル/状態/履歴/System JSONに接続。`LOAD_TEST_QUEUE`のconsumerは `runKingdomLoadTestQueue` を呼ぶ。実行は外部API/D1/Cloudflare消費を伴うため未起動。
- `/api/load-test/notice-status` はOwner pathとは別ルート。handler内の認可、情報公開範囲、呼び出し頻度を個別確認する。
- `/api/owner/player-link-support` は本人確認/移管/却下のサポート案件をOwner向けに処理する。`user_player_link_support_requests`の状態遷移とプレイヤー所有権移管の整合を確認する。

### Google Sheets出力

- プレイヤーのセクション出力: `/api/admin/player-export`。`requireAdmin()`、セクション許可リスト、Player observationの取得、`exportToGoogleSheet()`、Service Usage記録を確認。
- 王国ランキング出力: `/api/admin/kingdom-ranking-export`。ADMINガード、board/kid検証、事前に取得済みのranking rows、Google Sheets連携設定確認、Service Usage記録を確認。
- Google Sheets transportはService AccountまたはApps Script Web Appを使う実装がある。認証/secret、リトライ、出力先の権限は実環境確認が必要。
- ExportはADMIN/OWNER向け機能として扱い、BASIC/ADVANCED/VIPからの直接呼び出しがhandlerでも拒否されることをHTTPテストで確認する。

### API Pool / 管理画面の未完了項目

- API PoolのUIはキー追加、Mighty判定、キー削除、Pool移動/再割当、Player/Ranking testを含む。画面のボタンとAPIのHTTP method/role guardの対応は全件テスト未完了。
- キー削除は `api_pool_usage` も消すため、監査/利用量履歴の保存ポリシーを確定してから扱う。
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

- Owner向けの開始/検証: `/api/admin/google-drive/authorize` と `/api/admin/google-drive/verify`。どちらもOWNERガードを持つ。
- Callback実装: `/api/admin/google-drive/callback`。OWNERガード、state token検証、OAuth code交換、Drive archive folder作成の経路を確認。
- **静的設定不一致候補:** `wrangler.jsonc` の `GOOGLE_DRIVE_OAUTH_REDIRECT_URI` は `/api/auth/callback` を指定している一方、Worker routerのGoogle Drive callbackは `/api/admin/google-drive/callback`。このままの設定ではGoogle OAuthがDiscord callbackへ戻る可能性がある。実OAuthフローは実行していないため、設定差分として要確認。
- `GOOGLE_DRIVE_OAUTH_REDIRECT_URI` の実環境値、Google Cloud Console側の許可Redirect URI、OAuth state/nonce、Refresh Tokenの保存先を本番変更なしで確認する必要がある。

### Discord Support

- `/support` は利用者向けサポートUI。`/api/support/context` でカテゴリ/症状に対応するコンテキストを取得し、`/api/support` で問い合わせ/チケット操作を行う。ユーザー認証情報をhandlerへ渡す。
- `/api/discord/interactions` はDiscord Interaction署名検証を含む `discord-support.js` へ接続。チケット作成/終了/再開、権限設定、通知、診断記録を実装。
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

- Detail/Rankings/Changes/Allianceは主に `kingdom_ranking_current` とCatalogを参照し、現在順位表示に `ranking_snapshots` の広範囲取得を使わない。
- Kingdom Detail/Compare/Alliance Detailは選択された王国/同盟のR2 keyを読む。R2 listで全履歴を走査する経路と、既知keyを直接getする経路を区別する。
- Kingdom PortalのMightyページはイベントAPIとKvK APIを別々に呼ぶため、ページ表示だけで外部APIを複数消費する。自動ポーリングや再読み込みを含む実使用量は未計測。
- `renderKingdomRankingsPage`は認証ユーザーの保存設定/リンク済み王国を参照するが、画面自体は公開ルートとして描画される。ログイン前後の表示・データ露出はE2Eで確認する。
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

- **HistoryのD1/R2経路差:** `/api/player/history`は `getPlayerHistory()`を使う一方、`/player/history`は `player_snapshots`を直接読む。Retention/R2 archive後にUIとAPIの結果が異なる可能性があり、データ保全観点で優先確認。
- `/player`のProfile UIが直接外部取得/Materializeを行う一方、`/api/player`と`/api/player/refresh`も存在する。重複APIが意図した外部利用向けか、現在の画面から未使用なのかを確定する。
- `/api/player/rank-history`はルートがあるが、画面上の対応する履歴リンクは見つからない。使用者/用途を確認する。
- `/player/compare`と`/api/player-compare`はルートのhandler/page参照が未解決。`player-compare.js`のロジックだけではページ/APIの入口を満たしていない。
- Player Searchの `LIKE '%q%'`条件は通常のB-tree prefix検索にならない可能性がある。検索範囲/Index/実D1読み取りはQuery Planまたは計測で確認するが、本棚卸し中は計測クエリを本番で実行しない。

### 可視性ルール

- `player_visibility_settings`と `filterPlayerForRole()` / `filterPlayerProfileForRole()` / `isChangeVisibleForRole()`が、基本プロフィール・同盟・Hero/Rank/Equipment・Change Eventsの表示範囲を制御する。
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
- `/player/history`とPlayer Changes系の画面/APIは、Retention後にR2アーカイブ済みの行を表示しない可能性がある。これは静的な経路差候補であり、データ欠落の実再現は未実施。
- `runDataRetentionJob`の起動経路自体も未接続候補なので、実際にRetentionが走っているか/どの設定値かは本番DBを変更せず別途確認する。
- 本棚卸しではR2全件listやアーカイブの全件読出しを追加しない。D1 Free読み取りを優先し、必要なR2 readbackは対象範囲・ページング・費用を明示して設計する。
## 2026-10-10 第12巡目 — Gateway API / MightPulse Probe・Research / R2 Backfill

### Gateway API

- Prefix route: `/api/gateway/v1/*`。実装されているpathは `/api/gateway/v1/status` と `/api/gateway/v1/diagnostics`。
- 両方GET限定、`EAGLEEYE_GATEWAY_TOKEN`設定必須、Bearer/token認証。read-onlyとして診断/運用状態/Cloudflare利用量/History Storage状態/System Logを返す。
- Statusの通常応答は直近500件を返す制限付きで、対象期間全件をメモリに展開しない設計。`?full=1`はstreaming log export経路を持つ。
- Gateway Statusは複数のD1/Analytics/Storage診断を並列実行するため、呼び出し頻度・range・full exportの読み取り量とWorkerメモリを確認する。実呼び出しは未実施。

### MightPulse Probe / Research / Ranking Test

| 機能 | 入口/実装 | 初期判定 |
|---|---|---|
| MightPulse Probe画面/API | `/admin/mightpulse-probe` / `/api/admin/mightpulse-probe` | Player/Kingdom/Ranking等の取得検証UIとAPI。外部API使用量を伴うためテスト未実行 |
| MightPulse Research画面/API | `/admin/mightpulse-research` / `/api/admin/mightpulse-research` | 候補endpointの調査・payload要約・候補一覧を実装。Google Apps Script署名等の連携は別途照合 |
| Ranking/Player Admin test | `/api/admin/rankings/player` / `/api/admin/rankings/board` | API Pool/MightPulseを使った個別取得テスト経路あり。role guard、response保存、D1/外部APIコストは未検証 |
| API Raw Inspector | `/admin/api-raw-data` / `/api/admin/api-raw-data` / `/api/admin/api-raw-history` | `api_observations`をもとにraw payload/history/画像参照を確認する管理者画面。secret sanitizationとlimit/retentionの確認が必要 |

### Kingdom Catalog R2 Backfill

- Owner page: `/owner/kingdom-catalog-r2-backfill`。routerで `requireOwner()` を確認し、POST action `run`/`run_all` を処理する。
- `runKingdomCatalogR2Backfill()`はD1の `r2_latest_key IS NULL` かつraw/boards payloadがある行を対象に、R2保存後にD1 payloadをNULL化する。バッチサイズは通常1–100、run_allも1回100件までで段階実行。
- 実行後は `verifyKingdomCatalogR2Backfill()`でR2 object存在、pointer、raw/boards NULL状態を確認し、失敗時はmigration stateをFAILEDへ更新する実装。
- これはOwner手動操作で外部R2書き込みとD1更新を伴うため、この棚卸しでは実行していない。対象件数、同時実行競合、進捗復帰、実R2内容の確認は未完了。

### この領域の未完了項目

- GatewayのBearer token設定/ローテーション/実環境アクセス元、full exportのサイズ制限/streaming挙動は未確認。
- MightPulse Probe/Researchの全候補、API Poolキー選択、失敗分類、再試行、出力先/研究用蓄積をAPI単位で照合する。
- R2 backfillはOwner UI/APIだけでなくMigration state、D1 pointer、R2 object catalog、再開/失敗時の状態遷移を一体で棚卸しする。
### 全ソースのAPI文字列とルーター照合（第1回）

- `src/index.js`以外の `src/`ファイル50件を対象に、静的文字列として書かれた `/api/...` 参照をルーターの完全一致パス/特殊prefixと照合した。
- この文字列抽出でルーター未登録として残ったものは `/api/owner/kingdom-load-test/export?run_id=` のみ。handler/UIリンクは存在するが、import/route接続がないことを確認済み。
- この結果は静的な文字列照合の範囲。実行時に組み立てるURL、外部クライアント、未使用の古い呼び出し元の存在までは否定しない。
### Player Visibility / Watchlist Limitsの認可不一致候補

- `/admin/player-visibility`のページレンダラー `renderPlayerVisibilityPage()` は `requireAdmin()` を使用し、ADMIN/OWNER向け画面を表示する。
- しかし対応API `/api/admin/player-visibility` の `handlePlayerVisibilityApi()` は `requireOwner()` を使用している。`requireOwner()` は `auth.role !== 'OWNER'` を403にする。
- 同API内部には `guard.auth.role === 'ADMIN'` の分岐（OWNER設定を拒否する処理）が複数あるが、`requireOwner()`を通過した後ではADMINになり得ない。画面の認可とAPIの認可が一致しない静的候補。
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
- 読み取りに見えるGETでも、`refresh=1`のように外部API取得/DB保存を伴う経路がある。GET side effectは仕様上の意図を確認し、再送/ブラウザ先読み/キャッシュの影響をテストする。
- 本棚卸しではGET refresh、Pool Health Check、MightPulse Probe、負荷テスト、R2 backfillを起動していない。
## 2026-10-10 第14巡目 — MightPulse endpoint / collection engine

| MightPulse機能 | Provider endpoint | 呼び出し/用途 | 棚卸し判定 |
|---|---|---|---|
| Player base/rich | `/players/:governorId` with include=base/heroes/ranks/gov_gear | `getMightPulsePlayer`。Player Profile/Search/refreshとAPI Pool経由の詳細取得 | 実装あり。include差で外部API payload量が変わる |
| Player ranks | `/players/:governorId` with include=ranks | `getMightPulsePlayerRanks`。Hero ranking等の取得候補 | 実装あり。現在の表示経路/鮮度を個別照合 |
| Kingdom ranking board | `/kingdoms/:kid/ranks?board=...&limit=...` | `getMightPulseKingdomRanks`。limit 1–100を検証 | 実装あり。API Pool経由でD1 current rankingへ保存 |
| Kingdom all boards | `/kingdoms/:kid?include=boards` | `getMightPulseKingdomAllRankings`。返却dataの存在を検証 | 実装あり。大きなpayload/boardsの保存・正規化を照合 |
| Top Alliances | `/kingdoms/:kid/ranks?board=alliance_power` | `getMightPulseTopKingdomAlliances`。上位1–100の同盟要約を抽出 | 実装あり。レスポンスのrank/aid/abbr/name/score fallbackあり |
| Alliance roster | `/alliances/:kid/:tag?include=info,roster` | `getMightPulseAlliance` / `getMightPulseTopKingdomAllianceRosters` | 実装あり。Top roster helperは各同盟ごとに逐次API呼び出し（N+1）を行うため、起動する場合のAPI Pool消費に注意 |
| Kingdom detail | `/kingdoms/:kid?include=...` | `getMightPulseKingdom`。Catalog detailやall boards取得に使用 | 実装あり。include/limitを絞ること |
| Mighty Events | `/kingdoms/:kid/events` | `getMightPulseKingdomEvents` / `collectUserMightyOnly` | VIP/ADMIN/OWNERのMighty資格経路で取得 |
| KvK / KvK Scores | `/kingdoms/:kid/kvk` / `/kingdoms/:kid/kvk/scores` | `getMightPulseKingdomKvk`、`getMightPulseKingdomKvkScores` | 実装あり。UIはKvK endpointを呼ぶ。scoresのUI接続は未確認 |

### API Pool/Collection Guard

- `data-collection-engine.js`に `collectMightPulseThroughGuards`、`collectUserMightyOnly`、`collectMightyOnly`、`collectKingdomRanking`、`collectPlayerDetail`、`collectAllianceDetail`があり、API Pool/Safety Gate/Service Usage/traceを伴う取得経路を提供する。
- `mightpulse.js`には共通fetch、timeout/retry/backoff、エラー分類、endpoint helperがある。endpoint helperの存在と、ローラーが定期起動されることは別判定。
- `getMightPulseTopKingdomAllianceRosters`は同盟ランキングを取得した後、各同盟のrosterを逐次取得する。上位10同盟なら少なくともランキング1回+roster最大10回となるため、API Pool枠/外部API制限を踏まえた利用上限が必要。
- Seeder/Roller群は現行Worker起動経路未接続候補。機能を有効化する前に、R2 binding名（`env.R2_ARCHIVE` vs `env.ARCHIVE`）、Semaphore、retry、D1 reads/writes、途中停止後の再開をまとめて確認する。

### Endpoint棚卸しの未完了項目

- 各endpointの現行呼び出し元、キーPool選択（通常/Mighty/USER_CONTRIBUTED）、成功時保存先、失敗時metadata更新、retry回数、外部APIの実際の契約/レスポンスはまだ全件照合していない。
- `/kingdom/mighty`はevents/KvKを別々に取得する。Top alliance rosters helperはN+1 APIコールのため、現行ローラーを接続する前に消費モデルを定義する。
## 2026-10-10 第15巡目 — 共通UI基盤 / ロールバー / 二重操作防止

| 共通機能 | 実装位置 | 静的確認結果 | 未確認点 |
|---|---|---|---|
| テーマ切替 | `EAGLEEYE_THEME_CSS` / `EAGLEEYE_THEME_SCRIPT` / `applyEagleEyeTheme` | localStorageの`eagleeye-theme`とOS設定からlight/darkを選択。ページHTMLのhead/bodyへ共通CSS/JSを挿入 | 全ルートのHTMLが`eagleEyeHtmlResponse`または同等のwrapperを通るかは全件未確認 |
| Previewバナー | 共通Theme Script | production hostname以外ではPREVIEW bannerを表示 | Preview hostの判定条件が今後の独自ドメイン/環境追加に合うか要確認 |
| 常時ロールバー | 共通Theme Script/CSS | BASIC/ADVANCED/VIP/ADMIN/OWNERを固定上部に表示し、`/api/me/advanced` GETのroleで現在ロールを強調 | 匿名/Disabled/API失敗時の表示、全ページ適用を実機確認していない |
| Mutating fetch二重送信防止 | `installMutatingRequestGuard` | POST/PUT/PATCH/DELETEをmethod+URL+bodyでキー化し、同一requestの実行中重複を拒否 | fetch wrapperを使わないフォーム/別window/直接submit、タイムアウト後再試行の動作を確認する |
| ボタン/フォーム二重操作防止 | `installGlobalActionGuard` | click captureでbuttonをlockし、form submit重複も抑止。処理中表示/解除ロジックあり | 既存画面の独自disabled処理との競合、リンク遷移、エラー時の解除をE2Eで確認する |
| モバイル対応 | 各画面CSS + 共通UI | Player Profile、API Pool、Watchlist、Portal等に狭幅向けmedia queryあり | iPhone Safariで全画面の横はみ出し/フォーム/ボタン/固定ロールバーを実機確認していない |

### 共通UIの適用範囲

- `eagleEyeHtmlResponse(html)`は `applyEagleEyeTheme(html)`を通し、HTMLに`<html`が含まれる場合にテーマCSS/JSを挿入する。
- ルート/ページの一部は直接 `Response`を返し、他は`eagleEyeHtmlResponse`を使う。すべての画面に共通UIが適用されると断定せず、全ルートのreturn経路を確認する。
- 二重送信防止のコードが存在することと、全画面の全操作が確実に保護されていることは別。HTML formの通常POST、fetch、外部リンク、独自イベント処理を個別照合する。
## 2026-10-10 第16巡目 — Owner User Management / Player Link Support

| 機能 | API/認可 | 主な動作 | 初期判定 |
|---|---|---|---|
| ユーザー一覧/検索 | `/api/owner/users`、OWNER | username/global_name/Discord IDの部分一致、role順/最終ログイン順、login count、Watchlist件数を返す | 実装あり。検索はLIKE部分一致とlogin_history join/集計を含むため、ユーザー数増加時のD1コスト確認が必要 |
| ロール変更 | `/api/owner/users/role` POST、OWNER | BASIC/ADVANCED/VIP/ADMIN/OWNERを許可。VIPは資格確認し、Owner Audit Logへ記録 | 実装あり。VIP資格判定/ロール更新の同時実行は未検証 |
| ユーザー状態変更 | `/api/owner/users/status` POST、OWNER | ACTIVE/DISABLED。自分自身の停止とOWNER停止を拒否し、Audit Logへ記録 | 実装あり。Disabled userの既存セッション/API拒否はE2E未確認 |
| ユーザーWatchlist管理 | `/api/owner/users/watchlists`、OWNER | GETで対象ユーザーの王国/プレイヤーWatchlistを取得、DELETEで指定listを削除。王国側はjob/lockも削除しAudit Log記録 | 実装あり。自己管理は禁止。削除後の実行中job/競合は未検証 |
| Login History | `/api/owner/users/login-history`、OWNER | `login_history`から対象ユーザーの最新最大500件 | 実装あり。R2 archive後の読み取りはD1中心で、古い履歴の検索要件を確認 |
| Owner Audit Log | `/api/owner/audit-log`、OWNER | `owner_audit_log`の最新最大250件 | 実装あり。Retention後のR2 readbackは未確認 |
| Player Link Support | `/owner/player-link-support` / `/api/owner/player-link-support`、OWNER | 申請者/競合者の情報、公式確認、所有権移管、旧リンク無効化、サポート案件状態を扱う | 実装あり。公式確認・移管・拒否の状態遷移と監査証跡は実テスト未実施 |

### Owner管理の境界/未確認事項

- `requireOwner()`はACTIVEかつrole OWNERのみを通す。主要Owner APIの個別handlerでこのguardを呼ぶ。
- Role APIはVIPを直接設定する前に `evaluateVipEligibility()`を実行し、適格でなければ409を返す。
- Owner UI/APIが `owner_audit_log`に記録する操作と、記録しない閲覧操作を区別する。全ての管理操作に監査記録があるとはまだ断定しない。
- User一覧は `login_history`をjoinしてlogin countを算出し、別クエリで全Watchlist件数を集計する。D1 Free read制約下では検索頻度/ユーザー数/Indexの影響を確認する。
- Login History / Owner Audit LogはRetentionでR2へ移行される対象。長期保管が要件なら、アーカイブ後の閲覧/Export要件を明確にする。
## 2026-10-10 第17巡目 — Discord Support ticket lifecycle

| 操作 | 入口/認証 | 処理 | 状態 |
|---|---|---|---|
| Support context | `/api/support/context` GET、ACTIVEユーザー | `getSupportIncidentContext`で障害/サービスの文脈を返す | 接続あり。表示に必要な診断情報の最小化を確認 |
| Ticket作成 | `/support` → `/api/support` POST、ACTIVEユーザー | 入力検証/カテゴリ解決、Discordチャンネル作成、初期メッセージ/permission overwrites、チャンネルtopicへticket ID/user/statusを記録 | 実装あり。D1の専用ticket tableは確認できず、Discord channel/topicが状態管理の中心 |
| Discord close/reopen interaction | `/api/discord/interactions` POST | Ed25519署名とtimestampを検証。設定Support roleを確認し、channel topicのstatusをCLOSED/OPENへ変更 | 実装あり。署名・ロール・実際のDiscord権限は未検証 |
| Slash command registration | `/api/admin/discord-support/register-command` POST、ACTIVE ADMIN/OWNER相当 | Discord Application Commandsを登録/更新 | 実装あり。外部Discord APIへ登録はしていない |
| Support diagnostics | `discord-support.js` | 作成/終了/再開の成功失敗をdiagnostic eventとして記録、必要に応じ通知 | 接続あり。失敗後再試行と診断イベント保持は未検証 |

### Ticket lifecycleの確認ポイント

- Ticket ID形式検証、カテゴリ/サブカテゴリ検証、重複案件409、チャンネル作成失敗時の後片付け、Close/Reopen時のchannel topic更新を実装。
- Ticket stateの主保存先がDiscord channel/topicで、専用D1 ticket tableを確認できない。Discord channel削除/権限変更/Topic改変時の復旧・監査方法を仕様として確認する。
- Interactionは署名検証あり。close/reopenの権限がDiscord member role IDsと `DISCORD_SUPPORT_ROLE_ID` に依存するため、実Guild/Role configの確認が必要。
- 本棚卸しではDiscordチャンネル作成/更新、slash command登録、通知を実行していない。
## 2026-10-10 第18巡目 — Safety Gate / Service Usage / Collection Coverage

### Safety Gate

- `safety-gate.js`はCloudflare利用率、API Pool reserve、分単位/日単位のremaining quota、operation priorityを使ってNORMAL/CAUTION/WARNING/CRITICAL/HARD_STOPと許可可否を評価する。HARD_STOPはforceでも迂回不可。
- PriorityはWATCHLIST 100、NORMAL 80、FORCED 60、CATALOG 50、SEEDER 40、ALLIANCE_ROLLER 30、PLAYER_ROLLER 20、LOAD_TEST 10。CRITICALではWATCHLIST未満を止める設計。
- **静的な欠損メトリクス候補:** `maxUsagePercent()`は有効なCloudflare値がなければ`null`を返すが、`getSafetyState(null)`が`Number(null) === 0`としてNORMALへ評価される経路がある。Cloudflare metricsが全欠損のときSafety GateがCAUTION/UNKNOWNでなくNORMAL扱いになる可能性がある。未計測/欠損と0%を区別するテストが必要。
- Safety Gateの実使用経路、全呼び出し元がCloudflare metricsを渡すか、欠損時のfail-safe方針は未完了。

### Service Usage Queue / R2 Archive

- `recordServiceUsage()`はeventを作成して `SERVICE_USAGE_QUEUE`へ非同期送信する。Worker `queue()`はLoad Test/System Event以外のメッセージをService Usage consumerへ渡す。
- `service-usage-archive.js`はR2の既存オブジェクトを読み、イベントをmergeしてgzip NDJSONとして再書き込みする。Queue設定はbatch size 100、timeout 30秒、retry 5、concurrency 1、DLQあり。
- Queueが未設定/送信失敗の場合、`enqueueServiceUsage()`は `queued:false`を返す経路がある。呼び出し側が戻り値を無視する場合はService Usageイベントが失われる可能性がある。
- R2のread-modify-writeは同じアーカイブwindowに対する読み書きが増え、同時更新があればlost update候補となる。Queue concurrency=1の設定はあるが、Worker/再試行を含む実行競合は未検証。
- Service UsageをD1へ全件書き込む設計ではなく、Queue→R2へ集約する方式。R2 object size、読み書き回数、再試行/DLQを確認する。

### Kingdom Collection Coverage

- `kingdom_collection_stats`は初回/最終収集時刻、総収集回数、operator/user別回数、last_sourceを保持。`recordKingdomCollectionSuccess()`はupsertで累積値を更新する。
- 現行呼び出し箇所は王国Watchlist job completionに結びついているように見えるため、Statsが全王国収集を意味するのか、Watchlist収集のみを意味するのかを仕様確認する。
- `/admin/data-coverage`と `getKingdomCollectionCoverage()`はCatalog総数と統計表の件数/収集回数を表示する。0047のbackfill対象条件と実際のカバレッジ定義を照合する。

### この領域の未完了項目

- Safety Gate欠損値の扱いは優先度高。0%、UNKNOWN、未取得の意味を分ける仕様を先に決める。
- Service Usage queue unavailable/Archive unavailable時の通知・復旧・DLQ消化方法を確認する。棚卸し中にQueueを手動操作しない。
- Collection Coverageは統計テーブルに記録される対象イベントを特定し、UIの説明と数字の意味を一致させる。
## 2026-10-10 第19巡目 — 実際の収集パイプラインとデータ鮮度

| パイプライン | 起動元 | 処理内容 | 初期判定 |
|---|---|---|---|
| Kingdom Catalog discovery | 5分Cronの`scheduled()` → `runKingdomCatalogDailyRefresh()` | `runKingdomCatalogDiscovery()`がMightPulse経由で王国Catalogを発見/更新し、`kingdom_catalog_discovery`のcursor/stateを更新 | 実際のscheduled接続あり。daily refresh内でSeeder/Rollerを呼んでいない |
| Kingdom Seeder | 起動経路未確認 | `runKingdomSeeder()`がCatalogを順次処理し、詳細payloadを取得してCatalog保存 | 実装あり・未接続候補 |
| Kingdom Ranking Roller | 起動経路未確認 | `runKingdomRankingRoller()`がCatalog cursor/board cursorを進め、`kingdom_ranking_current`等へ保存 | 実装あり・未接続候補 |
| Alliance Roller | 起動経路未確認 | `runAllianceRoller()`がcurrent alliance rankingから対象を決め、同盟詳細/rosterを取得しCatalog/Change Eventsを更新 | 実装あり・未接続候補 |
| Player Roller | 起動経路未確認 | `runPlayerRoller()`がランキング対象Playerを取得して`players`/observation等を保存 | 実装あり・未接続候補 |
| Kingdom Watchlist collection | ユーザーAPIのcreate/refreshとLoad Test Queueから呼出 | job/lock/cursorでランキングと上位Playerを取得。`kingdom_collection_stats`を更新する経路あり | 実装あり。通常Watchlist refreshは同期HTTP await経路も持つ |
| Player Profile lookup/refresh | ユーザーが`/player`やAPIを呼ぶ | キャッシュ/observationを確認し、必要時にAPI Pool経由でMightPulse取得・Materialize | 実装あり。ユーザー操作が外部API使用量を発生させる |
| Admin ranking refresh | ADMINが`/api/admin/kingdom-rankings?refresh=1`を呼ぶ | MightPulse取得、順位差分計算、current/history/change event保存 | 実装あり。GET side effectとして要注意 |
| Load Test collection | OWNERが開始 → `LOAD_TEST_QUEUE` | 王国/ランキング/上位Playerの収集・保存・Cloudflare消費量計測 | Queue接続あり。実行は本棚卸しで行っていない |

### 収集網羅性に関する重要な未確定点

- `scheduled()`が直接起動するのはAPI Pool recovery、Catalog daily refresh、Discord notificationsの3処理。Catalog daily refreshはDiscoveryのみを呼び、Seeder/Ranking Roller/Alliance Roller/Player Rollerを連鎖起動しない。
- そのため、Catalogに王国が登録されていることは、その王国のランキング/同盟/Playerデータが定期収集されていることを意味しない。非Watchlist王国の鮮度/網羅性は別に確認する。
- Watchlistが実質的な通常収集経路なのか、ローラーは将来用/Owner手動用なのか、機能仕様を確定する必要がある。ローラーを接続する場合はAPI Pool reserve、Semaphore、R2 binding、D1 reads/writes、停止復帰を先に検証する。
- `kingdom_collection_stats`はWatchlist collection successに結びついているように見えるため、Coverage UIの数値を「全王国収集済み」と解釈しない。指標の定義を確認する。

### SQL列名の不一致候補 — Admin Kingdom Ranking

- `src/index.js` の `getLatestAdminKingdomRankingSnapshot()` は、`SELECT ranking_snapshot_id, ... FROM kingdom_ranking_current`を実行する。
- Migration 0019の `kingdom_ranking_current`には `ranking_snapshot_id`列がなく、リポジトリ内のMigrationにも同テーブルへの追加定義は見つからない。`ranking_snapshot_id`は `ranking_snapshots`側の主キー名。
- このため、`/api/admin/kingdom-rankings`のrefresh=1/通常読出しがこの関数を通ると、SQLのno-such-columnエラーになる可能性が高い。静的なSQL/schema不一致候補として優先度高で記録する。実D1へのクエリ実行や修正は未実施。
- 次のSQL列照合では、このような「列が別テーブルに属している」ケースを中心に、各SELECT/INSERT/UPDATEとMigrationの最終スキーマを確認する。
## 2026-10-10 第20巡目 — GitHub Actions / Schema Reconciliation / Asset Workflows

| Workflow/Script | Trigger/Guard | 処理 | 運用上の判定 |
|---|---|---|---|
| `eagleeye-d1-apply-pending-migrations.yml` | 手動`workflow_dispatch`。Cloudflare API Tokenをsecretから利用 | Remote D1の列/表と`d1_migrations`を先に検査し、drift条件に合わない場合にpending migrationをapply。適用後にmigration history/slot countを検証 | Production D1を書き換えるワークフロー。今回実行していない |
| `eagleeye-d1-schema-reconciliation.yml` | 手動`workflow_dispatch`。入力値に`RECONCILE_PRODUCTION`を要求 | Time Travel情報を記録し、`scripts/reconcile-d1-schema.mjs --apply`を実行。主要テーブル/Index/collection semaphore slots等を補修後に検証 | Production schemaを変更し得る。今回は実行していない |
| `eagleeye-d1-load-test-schema-recovery.yml` | 手動だがdeprecated | Production schemaとmigration historyが乖離し得るため、workflow自身がエラー終了してreconciliationを案内 | 無効化済みの旧経路として維持 |
| `hero-gear-assets.yml` | 手動workflow_dispatch。source/inspect-only入力あり | `scripts/collect-hero-gear-assets.mjs`を実行してヒーロー装備アセットを収集/検査 | 実行するとGitHub内のasset更新を伴う可能性。未実行 |
| `status-comparator-pages.yml` | 対象ファイルへのpushと手動dispatch | Status JSON comparatorをGitHub Pagesへ公開 | pushで自動deployされ得る。今回workflowを起動していない |

### Schema reconciliation scriptの範囲

- `scripts/reconcile-d1-schema.mjs`はverify-onlyと `--apply`を分け、`write()`はapply時のみSQLを実行する設計。required migration listは0043までで止まり、現行Migration 0044–0058を全件対象にしていない。API Pool lease列/Index、watchlist limits、diagnostic/system log、watchlist jobs/locks、current ranking tables、user_player_links/support、load-test schema、Semaphore slots、Catalog/Roller state、Alliance/Player stateなど、旧来の既知driftを対象にする。
- このスクリプトはMigrationを再実行するだけでなく、既存データの変換/不足schemaの補修を含む。Productionへ適用する場合は入力確認、Time Travel bookmark、schema/migration history差分、実行後検証を一体で扱う。
- `scripts/reconcile-0053-production-drift.mjs`もRemote D1を対象にするため、実行前にread-only/modifyの両方の挙動を確認する。今回どのスクリプトも実行していない。
- Workflow一覧を確認したことは、ProductionのMigration適用済み状態を確認したことを意味しない。実際の `d1_migrations` とスキーマは未取得。

### Secrets/権限の確認項目

- GitHub Actionsの `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`はGitHub Secrets参照。secret値自体は取得/表示していない。
- Production D1変更Workflowのdispatch権限、Environment protection、required reviewers、Time Travel復旧手順を確認する。YAML上の文字列入力確認だけで承認フロー全体の安全性を断定しない。
### Schema Reconciliationの適用範囲に関する注意

- `scripts/reconcile-d1-schema.mjs`は名前上はSchema Reconciliationだが、実装は特定の既知drift（API Pool lease列/Index、Watchlist/Diagnostics/System Log、User Player Link、Load Test、Semaphore、Catalog/Roller state等）を検査/補修するリスト型の処理。
- 現行スクリプト内に `mighty_capable` / `mighty_checked_at` / `mighty_check_status` / `mighty_last_error_code` の追加/検証、Migration 0058の `user_kingdom_ranking_preferences`、Migration 0054/0056の `user_mighty_credentials`、Migration 0048/0050/0051の `kingdom_catalog` / `alliance_catalog` / `players` の `r2_latest_key` と専用Index、Migration 0052の `discord_notification_state` の検証は見当たらない。
- よってこのWorkflowを実行したことだけで、全Migration 0001–0058のスキーマが現行コードと一致したと判定しない。実行前後にmigration historyと全重要テーブルの列/Indexを独立に検証する必要がある。
- この指摘はスクリプトの現行範囲についての静的確認。意図的に対象を絞っている可能性があり、直ちに不具合/変更要求とはしない。
### 主要テーブルの制約/Indexと利用SQLの照合（部分完了）

| テーブル | 主キー/一意制約 | 主なIndex（Migrationで確認） | SQL/機能との対応 | 状態 |
|---|---|---|---|---|
| `users` | `user_id` PK、`discord_id` UNIQUE、role/status CHECK（0056最終形） | `idx_users_role`、`idx_users_status`、`idx_users_last_login_at` | OAuth、me API、Owner User Management、role eligibility | 列/基本Indexは確認。全SQLの列単位照合は未完了 |
| `api_pool_keys` | `key_id` PK | pool/status、provider/status、cooldown、user_contributed、lease composite Index | API Pool lease/health/usage/Mighty metadata、VIP eligibility | 0006+0017+0025+0057を重ねて最終形を照合中 |
| `players` | `governor_id` PK | kid、alliance、power、nick_name、R2 latest pointer | Player Search/Profile/Watchlist、roller、R2 payload | 0004+0051。部分一致LIKEのIndex効率は未確認 |
| `player_snapshots` | `snapshot_id` PK | player/time、governor/time、observed_at | Player History API/画面、Retention/R2 archive | 0004+0011。画面/APIのD1/R2経路差あり |
| `kingdom_ranking_current` | composite PK (`kid, board, target_type, target_id`) | PK中心。現在順位はkid+board+rankで絞るSQLあり | Portal/Watchlist/Admin ranking refresh | Admin read helperが存在しない`ranking_snapshot_id`列をSELECTする候補 |
| `kingdom_catalog` | `kid` PK | `idx_kingdom_catalog_status`、`idx_kingdom_catalog_r2_latest` | Discovery/Detail/Compare/Backfill | 0037+0038+0048。R2 pointer/boardsの列照合中 |
| `alliance_catalog` | composite PK (`kid, aid`) | kid+abbr、last_seen、R2 latest pointer | Alliance list/detail/roller/notifications | 0041+0050。通知target_idの意味/形式も要確認 |
| `kingdom_watchlists` | `watchlist_id` PK | owner、due/enabled | list/create/refresh/cancel/toggle/delete | 0007+後続。job/lock cleanupと所有者境界を確認中 |
| `player_watchlists` | `watchlist_id` PK | user/discord、governor/player | list/add/toggle/delete、Player Profile | 0012。上限チェックと同時登録は未テスト |
| `user_player_links` | active governor、active user+governor、active MAIN per user+kingdomにpartial UNIQUE | user/status、governor/status、kingdom | My Player MAIN/SUB・ownership transfer | 0022–0026とensureSchemaの最終形を照合中 |
| `system_event_log` | `event_id` PK | created_at、trace/created_at、operation/created_at、status/created_at | System Log/Diagnostics/Export/Retention | 0028と現行SQLの列を照合中 |
| `change_events` | `event_id` PK | target/time、type/time、player/type/time | Player/Kingdom changes、Discord notification、Retention | D1/R2 readbackとtarget_id形式に要確認点あり |

- この表は主要テーブルの部分照合。全MigrationのCHECK/UNIQUE/foreign key/Index列・列順・query planまで完了したという意味ではない。
- Indexが存在することは、実際のquery planがそのIndexを使うことの証明ではない。D1 Free readsを優先し、本番での無制限EXPLAIN/COUNT/SELECTは実施しない。
### Preview/Productionのリソース・Queue共有に関するリスク

- `wrangler.jsonc`のPreview環境は、Productionと同じD1 database IDおよびR2 bucketを指定している。`EAGLEEYE_ENV=preview`だけではCloudflare bindingの実リソースを分離しない。
- PreviewのQueue producersには`SERVICE_USAGE_QUEUE`と`LOAD_TEST_QUEUE`があり、同じqueue名を参照する。一方、consumer設定はtop-levelのProduction構成にあり、PreviewのLoad Test producerから送信されたメッセージがProduction consumerで処理される可能性がある。
- Previewには`SYSTEM_EVENT_QUEUE` producerがない。`recordSystemEvent()`はQueueがない場合/送信失敗時にD1へ直接INSERTするため、Previewのイベントが共有D1（Production database ID）へ書かれる可能性がある。
- これは設定ファイル/コード経路からの静的リスク。Cloudflare上のqueue namespace/binding実挙動や本番データ影響は実測していない。
- **PreviewからLoad Test/収集API/Service Usage/System Eventを起動する前に、D1/R2/Queueの分離を確認する。** 今回はPreview/Productionの操作を一切行っていない。
## F. 既知の接続・完成度確認ポイント（全機能棚卸しの現時点）

以下は静的コード上の所見。実行時に再現した不具合とは限らない。修正・削除の判断前に、仕様・呼び出し元・本番設定・再現テストを確認する。

### P0候補 — 機能入口/権限/保全に直接影響

1. **Player Compare route未解決:** `/api/player-compare` → `handlePlayerCompareApi`、`/player/compare` → `renderPlayerComparePage`。定義/importが見つからず、比較ロジックだけが存在する。
2. **Load Test CSV export route未登録:** UI/handler `handleOwnerKingdomLoadTestExportApi` はあるが、`/api/owner/kingdom-load-test/export` のimport/routeがない。接続する場合はOWNER guardが必須。
3. **Player Visibility role mismatch:** pageはADMIN/OWNERを許可するが、`/api/admin/player-visibility` はOWNER限定。ADMINがAPIを使えない可能性。
4. **Player History D1/R2 mismatch:** APIはD1/R2履歴関数を使うが、画面は`player_snapshots`をD1直接SELECT。Retention後に結果が異なる可能性。
5. **Change Events archive readback:** `change_events`はRetentionでR2保存後にD1削除されるが、Player/Kingdom Changesの画面/APIはD1直接参照で、専用R2 readbackが確認できない。
6. **Google Drive OAuth redirect mismatch候補:** `wrangler.jsonc`のredirectは`/api/auth/callback`、Google Drive handler routeは`/api/admin/google-drive/callback`。
7. **Retention/Emergency Bufferの起動経路:** `runDataRetentionJob`は呼び出し元がなく、`drainHistoryEmergencyBuffer`もWorkerイベントから呼ばれていないように見える。実際にRetention/Buffer drainが走るか未確定。
8. **Safety Gate missing metrics:** 全Cloudflare metrics欠損で`maxUsagePercent()`がnullを返し、`getSafetyState(null)`が0%/NORMAL扱いになる可能性。
9. **VIP資格とDisabled API key:** Mighty metadataがCONFIRMEDのまま`api_pool_keys.status='DISABLED'`となったキーが、VIP資格判定に残る可能性。
11. **Preview/Production環境分離リスク:** PreviewはProductionと同じD1/R2 IDを指定し、Service Usage/Load Test producerは同名Queue、System Event Queueは未設定。Preview操作がProduction DB/Queue consumerへ影響する可能性がある。
10. **Admin Kingdom Ranking SQL列不一致:** `getLatestAdminKingdomRankingSnapshot()`が`kingdom_ranking_current`から`ranking_snapshot_id`をSELECTするが、Migration 0019の同テーブルにはその列がない。管理者ランキングの通常読出し/refreshとGoogle Sheets exportがSQLエラーとなる可能性。

### P1候補 — 収集/通知/コスト/設定整合

10. **Seeder/Roller群の未接続:** `runKingdomSeeder`、`runKingdomRankingRoller`、`runAllianceRoller`、`runPlayerRoller`は実装があるがscheduled/queueからの呼び出しが見つからない。Catalog discoveryは動くが、それだけで全王国のランキング/同盟/Playerが定期収集されるわけではない。
11. **R2 binding名:** 上記Roller群の一部が`env.R2_ARCHIVE`を参照する一方、`wrangler.jsonc`は`ARCHIVE` bindingを定義。
12. **Alliance Discord notification target_id:** `alliance-catalog.js`が`kid:aid`、ランキング側が`aid`中心でtarget_idを生成し、通知側が完全一致比較する候補。実データ/通知送信未確認。
13. **Collection Coverageの意味:** `kingdom_collection_stats`がWatchlist collection successに結びついているように見え、全王国収集カバレッジを表すか未確定。
14. **R2 Service Usage read-modify-write:** 既存オブジェクト読出し→merge→再書込のためI/O増幅/競合候補。Queue concurrency=1の設定はあるが実際の競合/再試行は未検証。
15. **R2 backfill concurrency:** Catalog backfillのUPDATE結果行数/CASを確認せず進捗counterを進める可能性があり、並列実行で重複/カウンターずれ候補。
16. **Preview/Production resource sharing:** PreviewもProductionと同じD1/R2 resource IDを指定し、Queue bindingにも差分がある。
17. **User Mighty legacy path:** `user_mighty_credentials` / `user-mighty.js`は現行API Poolベース資格判定とは別系統。削除判断は保留。
18. **API method side effects:** `/api/admin/kingdom-rankings?refresh=1`はGET経路で外部API取得/D1保存を行う。ブラウザ先読み/再送/キャッシュ影響を確認。
19. **Player Search D1 cost:** `LIKE '%q%'`の部分一致検索はIndexを活用しにくい可能性がある。Query Plan/計測未実施。
20. **API/画面の重複候補:** `/player`サーバー画面と`/api/player`/`/api/player/refresh`、Player History/Changesの画面とAPI、`/api/player/rank-history`の利用画面がそれぞれ重複/未接続候補。

### 既知の固定条件

- D1 Free読み取り量を最優先。
- `ranking_snapshots`の広範囲取得クエリは絶対に復活させない。
- これらは機能棚卸しで検出した候補。コード修正・本番DB更新・デプロイ・Queue操作・負荷/外部APIテストは未実施。
- Migration番号0008は2ファイルあるため、番号だけでなく完全なファイル名で管理する。


## G. 棚卸しの完了条件

- [x] `src/` の全ファイル名と責務の初期分類を記録
- [x] `src/index.js` の完全一致ルートと特殊prefix/callback/fallbackを記録
- [x] `migrations/` の全ファイル名と番号重複を記録
- [x] `wrangler.jsonc` の主要binding・Cron・Queue・Preview差分を記録
- [x] Workflow・スクリプト・公開アセットを列挙
- [x] src/index.js のルート呼び出し名・import・対象モジュールのexport照合（不一致候補を台帳化。実行時確認は未実施）
- [x] 全Migrationのテーブル/列/制約/indexと現行SQLの静的双方向照合を一巡（候補未解決あり）
- [x] 全画面のUI機能、ボタン/フォーム、API呼び出し、権限、空/失敗状態を静的に一巡（実機未検証）
- [x] 実装あり/未接続候補/重複・経路差/仕様未確定/外部検証待ちを機能ごとに分類
- [x] テスト可能性と本番E2E確認項目を機能ごとに定義（実施は別途）

## 次の作業

1. **主要Migration列/制約/Indexと現行SQLの双方向照合**。まず`users`、`api_pool_keys`、`players/player_snapshots`、`kingdom_catalog`、`kingdom_ranking_current`、Watchlists、`system_event_log`を完了させる。
2. **各画面のボタン/フォーム/イベント/API対応を完了**。特に外部モジュール内UI、Owner/User管理、MightPulse Probe/Research、R2 backfill、Data Coverage。
3. **認可/HTTP method matrixを完成**。ADMIN/OWNER差、ACTIVE/DISABLED、GET副作用、handler側guard、外部APIを呼ぶGET経路を全件確認する。
4. **R2 retention/readback matrixを完成**。どのテーブルをアーカイブ後も画面/APIから読むのか、D1に残すのか、cold archiveとして保存するだけかを確定する。
5. 各機能を「実装あり・接続済み」「実装あり・未接続候補」「未実装/未解決参照」「重複」「仕様未確定」「未検証」に分類し、再現テストを定義する。
6. 棚卸し完了までは修正を始めない。修正が必要な候補は、仕様確認→影響範囲→テスト→実装の順に進める。


## 初回記録

- 対象: `main`。取得時点: 2026-10-10。
- 作成内容: 画面/API入口、ソースモジュール、Migration、Cloudflare設定、Workflow、スクリプト、アセット、機能領域の初期マッピング。
- この時点で「全機能棚卸し完了」とは判定しない。上記の未完了チェックがすべて埋まった後にのみ完了とする。


## 2026-10-10 進捗記録 — 第2回・進捗率の算定

### 全体進捗：23%（静的棚卸し）

この率はファイル数/行数ではなく、以下の作業領域の重み付き概算。初回マッピングを完了扱いにしても、画面/API/DB接続や実動作確認が終わっていないため、まだ初期段階とする。

| 作業領域 | 重み | 現在の達成度 | 加重点 | 根拠 |
|---|---:|---:|---:|---|
| リポジトリ/構成/入口の初期台帳 | 10% | 100% | 10.0% | src、Migration、route、Worker、Workflow、設定の初回列挙を記録済み |
| Route→handler/page→定義/importの照合 | 20% | 35% | 7.0% | 110 path入口の照合と未解決参照候補の記録。全モジュールの呼出元確認は未完了 |
| 画面UI→API→処理の対応付け | 25% | 10% | 2.5% | index.jsのUI要素/API文字列を初回抽出。ボタンごとのmethod・認可・成功/失敗状態の対応表は未完成 |
| Migration/SQL→テーブル・列・Indexの双方向照合 | 25% | 0% | 0% | ファイル名/概要の列挙のみ。列・制約・Indexと全SQLの照合は未完了 |
| Worker/Cron/Queue/権限/外部連携の接続照合 | 15% | 20% | 3.0% | scheduled/queue入口と一部認可・OAuth・外部連携を静的確認。全呼出元と実設定の照合は未完了 |
| テスト観点・本番確認条件の整理 | 5% | 0% | 0% | 一部の未確認事項を記録したが、機能別の完全なテスト行列は未完成 |
| **合計** | **100%** |  | **22.5% ≒ 23%** | 概算。対象範囲/分母は以後の発見により更新し、率の変更理由を記録する |

### 今回の追加確認（index.jsと関連モジュール）

- `src/index.js`: 9,024行。静的なHTML/JS生成コード内にbuttonタグ70件、formタグ7件、inputタグ19件、inline `onclick` 29件、`addEventListener` 19件を検出。
- `fetch()`呼び出し37箇所、文字列として静的に抽出できたURLは21種類。テンプレート文字列/動的生成/他モジュールの呼出は単純抽出で漏れるため、これはUI対応表の完成数ではない。
- `handleOwnerKingdomLoadTestExportApi` は `src/admin-kingdom-load-test.js` で定義され、`src/index.js` にimportされているが、ルート分岐の接続は確認できない。UI側に `/api/owner/kingdom-load-test/export?run_id=` の参照もあるため、**未接続候補として維持**。handlerにOWNER guardがない可能性もあるため、接続するなら認可確認が必要。変更/実行確認は未実施。
- `runKingdomSeeder`、`runKingdomRankingRoller`、`runAllianceRoller`、`runPlayerRoller` は各モジュールでexport定義がある。`src/index.js` にはimportがあるが、Workerイベント入口からの呼出しは見つかっていない。別モジュールからの呼出/外部トリガーの有無は引き続き確認が必要。
- `runDataRetentionJob` は `src/index.js` 内に定義され、内部でRetention cleanupとSystem Log archiveを呼ぶが、同ファイル内の起動呼出しは見つかっていない。Retentionの起動経路は未確定として扱う。
- `drainHistoryEmergencyBuffer` はexport/importを確認したが、Workerイベント入口からの呼出しは見つかっていない。別呼出元がないと確定するにはrepo-wide照合が必要。
- プレイヤー比較の `/api/player-compare` と `/player/compare` は、引き続き未解決参照候補。ビルド/HTTPによる再現は未実施。

### 次に行う作業

1. 画面のHTML生成関数単位でボタン/フォーム/イベント/API URLを抽出し、route一覧と突合する。まずWatchlist、Player、API Pool、Owner/Load Test、System Status/Diagnosticsを対象にする。
2. 未接続候補の関数について、定義・import・全ソース内の呼出元・Workerイベント入口を区別して追跡する。
3. Migrationの各ファイルからCREATE/ALTER/DROP、列、Index、制約を抽出し、SQL側のSELECT/INSERT/UPDATE/DELETEと双方向照合する。
4. 未解決候補を「静的に未接続」「定義未発見」「実行時未確認」に分け、根拠のないバグ断定をしない。

この進捗率は**コードの静的棚卸し**の進み具合であり、本番機能の正常率ではない。コード変更、Migration適用、デプロイ、Queue操作、外部API/負荷テストは引き続き行っていない。
## 2026-10-10 進捗記録 — 第3回・画面操作と認可の初回突合

### 今回確認したUI→APIの接続

- 王国Watchlist画面: 一覧/再読込、今すぐ更新/中断、ランキング表示、有効/停止、削除の操作を生成。主要APIとして `/api/kingdom-watchlist` と関連actionを呼ぶ。更新中は4秒間隔で状態を再取得する経路があるため、polling頻度と終了条件を別途照合する。
- Player Watchlist画面: 追加/解除と比較対象選択を生成し、`/api/player-watchlist` と `?governor_id=` を呼ぶ。比較選択は最大4人という画面表示を確認。比較先のページ/APIルートは別途未解決候補が残る。
- `/my-player`: 領主ID追加/解除、MightPulse APIキー登録、Mighty判定のUIと、`/api/me/player`、`/api/me/mightpulse-key`、`/api/me/vip/mighty-check` の呼出しを確認。成功/失敗表示とボタンdisable処理はあるが、実ブラウザでの競合/二重送信は未確認。
- `/admin/player-visibility`: role別公開設定とWatchlist上限の更新が `/api/admin/player-visibility` POSTへ接続。handler/routeの認可を別途確認対象に維持。
- `/admin/api-pool`: キー追加、Mighty判定、削除、Owner専用提供者再割当のUIを確認。API Poolのlist/add/move/delete/reassign handlerにはそれぞれADMIN/OWNERガードが存在する静的コードを確認。HTTPで拒否結果を実証したわけではない。
- `/status` の一部に監視Profile切替・R2オブジェクト確認のUIがあるが、API側 `handleMonitoringProfileApi` と `handleR2ArchiveObjectsApi` はACTIVEかつADMIN/OWNERをhandler内で要求する。UIが表示されることとAPIが操作を許可することを区別できている。

### ルート接続/認可の追加所見

- `handleOwnerKingdomLoadTestExportApi` はimportされ、`src/admin-kingdom-load-test.js` 内で定義される。画面側のCSV export URLも見つかる一方、Worker routerに該当pathの分岐がない。**CSV exportは未接続候補**。handlerにOWNERガードがあるかも未確認のため、ルート追加や実行はせず、先にhandler全体の認可/HTTP method/出力を照合する。
- `/api/admin/monitoring-profile` と `/api/admin/r2-archive-objects` はrouter行だけを見ると共通guardが見えないが、各handler冒頭にACTIVE + ADMIN/OWNERチェックがあるため、現時点では認可漏れと断定しない。
- `/api/admin/api-pool/keys`、`/api/admin/api-pool/add` は `requireAdmin()`、`/api/admin/api-pool/delete` と `/api/owner/api-pool/reassign` は `requireOwner()` をhandler内で呼ぶ。権限境界の静的確認を記録。未ログイン/一般ロールの実HTTP試験は未実施。

### この巡回の限界

- HTML文字列を組み立てるコードが多く、単純な `<button>` / `fetch()` 検索だけでは動的生成・イベント委譲・フォーム遷移を完全には数えられない。今回の項目は代表的な画面の初回突合であり、全ボタンの監査完了ではない。
- 現時点の全体進捗は前回記録の**23%**を維持。今回の作業は発見/分類の拡張で、画面全操作のAPI/権限/DBまでの対応表は未完成のため、完了率を上げる段階には達していない。

### 次の対象

1. Owner Load Test画面の各操作を、route/handler/OWNER guard/Queue/System JSON/履歴/CSV exportまで突合する。
2. Player Profile/History/Changes/Watchlistを画面→API→D1/R2→Retentionで追跡し、画面とAPIの重複・アーカイブ後の読み出し差を確定する。
3. API Pool全操作についてHTTP method、handler guard、DB副作用、外部API消費、二重押し防止を一覧化する。
4. その後、Migrationと全SQLの列/Index単位照合へ進む。


## 2026-10-10 進捗記録 — 第3回・全機能棚卸し進捗

### 全体進捗：39%（静的棚卸し・概算）

この進捗率は機能領域の棚卸し作業に対する概算であり、実装完成率/本番正常率ではない。前回23%から、Watchlist、Player Profile、Kingdom Portal、API Pool、Owner管理、System/Diagnostics、Google/Discord連携、Retention/R2、Safety Gate、収集経路のマッピングを追加した。

| 作業領域 | 重み | 現在の達成度 | 加重点 | 根拠 |
|---|---:|---:|---:|---|
| リポジトリ/構成/入口の初期台帳 | 10% | 100% | 10.0% | src 51件、Migration 59件、route 110件、Workflow 5件、assets 17件を列挙 |
| Route→handler/page→定義/importの照合 | 20% | 45% | 9.0% | 全exact routeと静的API文字列を照合。未解決/未登録候補3件。全method/guard/外部トリガーの照合は未完了 |
| 画面UI→API→処理の対応付け | 25% | 30% | 7.5% | 19領域の機能経路を追加。index.jsのrender関数抽出済みだが、全ボタン/フォーム/失敗状態の対応は未完成 |
| Migration/SQL→テーブル・列・Indexの双方向照合 | 25% | 15% | 3.75% | 主要テーブル、Retention/R2 readback、DDL差分候補を記録。全列/制約/Index/全SQLの双方向照合は未完了 |
| Worker/Cron/Queue/権限/外部連携の接続照合 | 15% | 50% | 7.5% | scheduled/queue、ローラー未接続候補、認可不一致、OAuth redirect、API Pool/Safety Gateを静的確認 |
| テスト観点・本番確認条件の整理 | 5% | 20% | 1.0% | 優先確認候補と一部E2E条件を記録。全機能のテスト行列は未完成 |
| **合計** | **100%** |  | **38.75% ≒ 39%** | 重み/達成度は概算。対象範囲が増えたら根拠を更新する |

### 現時点の主要発見（静的候補）

- ルート/接続の要確認候補3件: Player Compare handler/page未解決2件、Load Test CSV exportの未登録route 1件。
- Worker起動未接続候補: Seeder、Kingdom Ranking Roller、Alliance Roller、Player Roller、Retention parent job、History Emergency Buffer drain。
- 設定/権限候補: Google Drive OAuth redirect不一致、Player Visibility page/APIのADMIN/OWNER差、RollerのR2 binding名不一致。
- データ経路候補: Player History画面とAPIのD1/R2差、Change EventsのR2 archive後readback不足、VIP資格とDISABLED keyの状態不整合。
- Safety/コスト候補: Cloudflare metrics欠損時のSafety GateがNORMAL扱いとなる可能性、Player Searchの部分一致、GETでのAdmin ranking refresh副作用、Service Usage R2 read-modify-write。
- これらはすべて静的所見。再現/本番確認は未実施。

### 次の巡回

1. 主要Migration列/制約/IndexとSQLの双方向照合。
2. 全画面のボタン/フォーム/イベント/HTTP method/role guard/成功・失敗状態の対応表を完成。
3. R2 archive/readbackとRetentionの対象/閲覧仕様を確定。
4. 未接続候補を「現仕様で必要」「意図的な旧実装」「将来用」「未実装」に分類。
5. 本番変更なしで実施可能なテストと、Owner承認が必要な本番テストを分離。


## 2026-10-10 進捗記録 — 第4回・Owner Load Test画面の接続追跡

### 画面→API→Queue/DBの静的対応

| UI/操作 | 呼出先 | 静的確認結果 |
|---|---|---|
| Load Test開始 | `/api/owner/kingdom-load-test?kids=...&top_n=...` | UIはOwner開始APIへGET。routerで`requireOwner()`を適用し、handlerはジョブ開始/Queue経路へ接続するコードあり。未実行 |
| 中止 | `/api/owner/kingdom-load-test/cancel` POST | routerで`requireOwner()`、handlerはcancel処理へ接続。未実行 |
| 状態/進捗 | `/api/owner/kingdom-load-test/status` | routerで`requireOwner()`。handlerはstale run recovery後に状態を返すコードあり。UIは状態pollingを行う |
| 履歴 | `/api/owner/kingdom-load-test/history?limit=20` | routerで`requireOwner()`。UIは最大20件を読み込む。未実行 |
| System JSON | `/api/owner/kingdom-load-test/system-json?run_id=...` | routerで`requireOwner()`。handlerはGET限定、run_id必須、R2 `ARCHIVE`優先・DB生成fallbackを持つ |
| CSV Export | `/api/owner/kingdom-load-test/export?run_id=...` | UIリンクとexport handler定義は存在するがrouter分岐が見つからない。handler自身はGET/run_id確認のみでOWNER認可なし。**ルート接続欠落候補に加えて、認可欠落候補**。未接続状態を修正/試験していない |
| 公開負荷テスト通知 | `/api/load-test/notice-status` | router/handlerにOwner guardはないが、返す値はactive/updated_at/expires_at等の稼働通知。公開前提の範囲と情報最小化を別途確認 |

### この領域の優先候補

1. **CSV Export:** 現状のrouterに接続されていない。接続する場合はOWNER認可を必須にし、`run_id`の所有/参照権限、CSVに含める列、未認証時の拒否をテストする必要がある。現時点ではルート接続・コード変更を行わない。
2. **System JSON / CSVのR2/DB fallback:** System JSONは`env.ARCHIVE`の既知keyを直接getし、なければDBから生成する。R2 binding名、D1読み取り量、出力内容の一致を静的照合し、実オブジェクトや本番DBを触らず確認できる範囲を先に洗う。
3. **Pollingとキャンセル:** UIは開始後に状態を複数回取得し、cancel時に保存中run IDを使う。再読込後の復帰・polling停止・cancel raceは未実行。静的コード上の存在だけで正常とは判定しない。
4. **Load Testの本番実行は棚卸し中に行わない。** この領域の確認はコード/接続の追跡のみ。

### 進捗率

全体進捗は**23%**を維持。Owner Load Testの主要経路を一覧化したが、機能単位の画面/API/認可/DB/R2までの照合は全画面で終わっておらず、Migration/SQL双方向照合も未着手のため。
## 2026-10-10 進捗記録 — 第5回・Migration 0050–0058と現行SQLの部分照合

### 対象範囲

Migration 0050–0058の9ファイルを読み、主要な追加/再構築対象を現行コード内のSQL参照と照合した。これはMigration全59ファイルと全SQLの双方向照合ではなく、後半9ファイルの部分確認。

| Migration | スキーマ変更 | 現行コードとの照合 | 状態/残り |
|---|---|---|---|
| 0050 `alliance_catalog.r2_latest_key` | 列追加 + `idx_alliance_catalog_r2_latest` | この巡回では列を使う全SQL/Index利用を未確認 | 部分確認 |
| 0051 `players.r2_latest_key` | 列追加 + `idx_players_r2_latest` | この巡回では列を使う全SQL/Index利用を未確認 | 部分確認 |
| 0052 `discord_notification_state` | テーブルと`updated_at` index | `discord-notifications.js`との列単位照合は未実施 | 部分確認 |
| 0053 `player_visibility_settings.min_role` | CHECKはBASIC/ADVANCED/ADMIN/OWNER。既存行の値をUPDATE | 後続0055がVIPを許容するCHECKにテーブル再構築する順序を確認 | 後続Migration込みで判定が必要 |
| 0054 `user_mighty_credentials` | 個人Mighty資格情報と3つのIndex | `src/user-mighty.js`でSELECT/INSERT/UPDATE/REVOKE参照あり。主な列名は対応 | 接続あり（全列/制約は未完了） |
| 0055 `player_visibility_settings` | テーブル再構築。`min_role` CHECKにVIPを追加 | 現行visibility handlerとの列/ロール値の全照合は未完了 | 接続候補あり |
| 0056 `users` / `watchlist_limits` | ロールCHECKにVIPを追加。Watchlist limitsへVIP行を追加 | 現行ロール更新/limit読出しとの全照合は未完了 | 接続候補あり |
| 0057 `api_pool_keys` Mighty列4つ | `mighty_capable`、`mighty_checked_at`、`mighty_check_status`、`mighty_last_error_code`追加 | `src/api-pool.js`、`src/user-eligibility.js`、`src/index.js`で参照/更新を確認 | 接続あり（全SQL/Indexは未完了） |
| 0058 `user_kingdom_ranking_preferences` | ユーザーごとのkid/boards/primary board設定とkid index | `src/index.js`でINSERT/UPSERT、`src/kingdom-portal.js`でSELECTを確認 | 接続あり（全バリデーション/列照合は未完了） |

### 今回の注意点

- Migration 0053単体ではVIPが`min_role`のCHECKに含まれないが、0055で同テーブルを再構築してVIPを許容する。0053だけを見て現行スキーマ不整合と断定しない。
- `user_mighty_credentials`はMigration上の孤立テーブルではなく、`src/user-mighty.js`に現行SQL参照がある。`api_pool_keys`のMighty判定列とは別の資格情報モデルなので、同じものとして扱わない。
- Migration 0057のMighty判定列は、API Pool一覧・資格判定・更新処理で参照されている。列の存在と本番DBへのMigration適用済み状態は別なので、本番適用はこの静的確認では断定しない。
- Migration 0058はKingdom Ranking preferencesの保存/読出しと接続する。ルート側POSTの入力検証、ユーザー認証、kid/boardの許可リスト、DBエラー時の応答は機能追跡の続きで確認する。
- 今回はCREATE/ALTER/DROPと主要参照を部分照合しただけで、全テーブル・全列・全Index・全SQLの網羅性は保証しない。

### 進捗率更新：24%

作業領域の重み付き概算を更新する。Migration/SQL照合は0%から5%へ変更（後半9ファイルの一部列と現行参照を確認）。全体は23.75%を四捨五入して**24%**。これは静的棚卸しの進捗であり、機能の正常率や本番適用率ではない。

| 作業領域 | 重み | 達成度 | 加重点 |
|---|---:|---:|---:|
| 初期台帳 | 10% | 100% | 10.0% |
| Route/handler/page照合 | 20% | 35% | 7.0% |
| UI→API→処理の対応付け | 25% | 10% | 2.5% |
| Migration/SQL双方向照合 | 25% | 5% | 1.25% |
| Worker/Cron/Queue/権限/外部連携 | 15% | 20% | 3.0% |
| テスト観点/本番確認条件 | 5% | 0% | 0% |
| **合計** | **100%** |  | **23.75% ≒ 24%** |

### 次の作業

1. Migration 0001–0049を同じ方式で確認し、テーブル/列/Index/制約の履歴を通しで作る。
2. `src/`全体のSQLからテーブル/列を抽出し、Migrationに存在しない参照・Migration後に未使用の列を候補化する。
3. 0050/0051のR2 key、0052通知状態、0053–0056ロール/可視性/上限をコード参照と追加照合する。
4. D1読み取りコストの評価は、広範囲の本番SELECTを実行せず、静的SQLと既存のIndex定義から始める。`ranking_snapshots`の広範囲取得クエリは復活させない。
## 2026-10-10 進捗記録 — 第6回・Migration 0040–0049の部分照合

### スキーマとコードの接続

| Migration | 内容 | コード上の接続/要確認 |
|---|---|---|
| 0040 | `kingdom_seeder_state` | `kingdom-seeder.js`のSeeder実装/状態保存と接続候補。Worker起動経路は未確認のまま |
| 0041 | `alliance_catalog` と `alliance_collection_state` | `alliance-catalog.js`にRoller実装あり。Worker起動経路は未確認 |
| 0042 | `player_collection_state` | `player-roller.js`にRoller実装あり。Worker起動経路は未確認 |
| 0043 | 意図的なno-op | 0041が状態テーブルを既に作成する前提の履歴整理。schema差分なし |
| 0044 | `kingdom_load_test_runs` Cloudflare before/after/delta JSON列 | Load TestのCloudflare利用量記録/履歴表示との列単位照合を続ける |
| 0045 | `change_events` player lookup複合Index | Player Change Eventsのtarget/type/time検索に対応する設計。全SQLのIndex利用確認は未完了 |
| 0046 | `kingdom_collection_stats` + `kingdom_watchlist_jobs.collection_source` | `kingdom-collection-stats.js`、Watchlist job記録、Data Coverageとの対応候補 |
| 0047 | 旧データからcollection statsをbackfill | `kingdom_ranking_current`と`players`を王国単位に集約するCTE。移行時に対象テーブル全体を読む可能性があるため、適用状況と実行コストは別途確認。棚卸し中に実行しない |
| 0048 | `kingdom_catalog.r2_latest_key` + Index | `kingdom-catalog.js` / R2 backfillのD1軽量索引と接続候補 |
| 0049 | `kingdom_catalog_r2_migration`の進捗状態 + backfill cursor Index | `kingdom-catalog-r2-backfill.js` / Owner backfill UI・状態JSONとの対応候補。処理は起動していない |

### 追加の重要な区別

- Seeder/Rollerの状態テーブルと実装関数があることは、定期実行が起動している証明ではない。現時点では `scheduled()` / `queue()` の接続が見つからない所見を維持する。
- Migration 0047のbackfillは `ranking_snapshots` を広範囲取得するクエリではなく、`kingdom_ranking_current`と`players`から統計を作る移行SQL。ただし、全件集約の実行コストと適用状況は静的ソースだけでは確定しない。
- `kingdom_catalog`、`alliance_catalog`、`players`のR2 key列は、詳細データをR2に移してD1を軽量な検索/現在値インデックスとして使う方針に対応する。R2保存済みpayloadの全読出し経路が正しいかは、画面/APIごとに別途照合する。
- `kingdom_collection_stats`は王国Watchlist jobの成功記録と接続するコードがあるが、統計が全収集処理を代表するかは仕様未確定。UIの「収集済み」表示とカウント対象を一致させる必要がある。

### 進捗率更新：25%

Migration/SQL照合の作業領域を5%から10%へ更新。0040–0058の19ファイルについてDDL/主要対象を確認したが、0001–0039、全SQLの列/Index照合、現行本番適用状態は未確認。全体の加重点は25.0%となった。

| 作業領域 | 重み | 達成度 | 加重点 |
|---|---:|---:|---:|
| 初期台帳 | 10% | 100% | 10.0% |
| Route/handler/page照合 | 20% | 35% | 7.0% |
| UI→API→処理の対応付け | 25% | 10% | 2.5% |
| Migration/SQL双方向照合 | 25% | 10% | 2.5% |
| Worker/Cron/Queue/権限/外部連携 | 15% | 20% | 3.0% |
| テスト観点/本番確認条件 | 5% | 0% | 0% |
| **合計** | **100%** |  | **25.0%** |

### 次の作業

1. Migration 0001–0039を確認し、既存テーブルの最終スキーマが後続ALTER/REBUILDを経てどうなるか履歴化する。
2. `kingdom_collection_stats` / R2 key / Roller state / Load Test historyの各列について、現行SQLで参照・更新される箇所を双方向で追跡する。
3. 次にPlayer History/ChangesのD1/R2経路差をhandlerと画面関数で照合する。
4. D1消費は静的なSQL形状とIndexから先に評価し、調査目的の全件SELECTや本番負荷テストを実行しない。

## 2026-10-10 監査進捗 — 10ポイント区切り到達（チェックリスト方式）

### ルート・handler・import/exportの静的照合

src/index.js のroute/call names -> local definitions/imports -> imported module exportsを静的照合した。

- /api/player-compare は handlePlayerCompareApi を呼ぶが、src/index.jsに定義/importがなく、src/player-compare.jsにもhandler exportがない。
- /player/compare は renderPlayerComparePage を呼ぶが、定義/importがなく、src/player-compare.jsにもpage exportがない。
- handleOwnerKingdomLoadTestExportApi は src/admin-kingdom-load-test.js でexportされ、Owner負荷テストUIからCSV URLが生成される。一方、src/index.jsのimportとroute分岐が見当たらず、CSV URLはWorker routerへ接続されていない候補。
- DIAGNOSTIC_SERVICES は src/diagnostics.js 末尾でnamed exportされていることを確認。単純な宣言検索では漏れるexport listも確認対象に含めた。
- 上記はソース静的照合による接続不一致候補であり、ビルドやHTTP実行での再現確認はしていない。修正は行っていない。

### Migration 0001–0039のDDL初回通読

- Migration 0001–0039のCREATE/ALTER/DROP、主な列、CHECK、Index、データ移行を通読した。0008は同番号ファイルが2つあるため、番号だけで順序・適用状態を断定しない。
- kingdom_ranking_current はMigration 0019で定義される一方、既存台帳に記録済みの ranking_snapshot_id 参照不一致候補がある。現行コードのSELECT/INSERT/UPDATE全列を最終スキーマへ双方向照合する作業は継続。
- Migration 0008の kingdom_watchlist_jobs 定義とMigration 0019の CREATE TABLE IF NOT EXISTS 定義には source_first_at / source_last_at の差がある。IF NOT EXISTSだけでは既存テーブルに列は追加されないため、後続ALTERの有無と実際の参照列を次の照合対象にする。現時点では静的候補として記録し、実D1で確認していない。
- src/user-player-link.js の ensureSchema() はテーブルとIndexを実行時にCREATEする。Migration 0022/0023/0026にも同じモデルの定義・再構築があるため、互換性用DDLの必要性と本番リクエストでの実行経路を確認対象にする。今回は実行していない。
- D1本番照会、Migration適用、デプロイ、Queue操作、収集/負荷テストは実施していない。ranking_snapshotsの広範囲取得クエリも追加・実行していない。

### 進捗率 — 次の10ポイント区切り

- チェックリスト方式：**6/9項目 = 66.7%（表示上67%）**。前回の56%から次の約10ポイント区切りに到達。
- 今回完了扱いにしたのは、ルート呼び出し名・import・exportの静的照合。見つかった接続不一致候補は未修正のまま明示的に記録した。
- この67%は「棚卸しチェック項目の完了割合」であり、全機能の実装率・正常率・本番適用率ではない。過去記録にある重み付き概算（23–25%等）は別方式の途中記録で、チェックリスト方式の値と直接比較しない。
- 未完了の大項目：Migrationと全SQLの列/制約/Index双方向照合、全画面のUI操作→API→認可/DB/エラー状態の対応付け、機能ごとの実装状態確定、機能別テスト/E2E確認条件。

## 2026-10-10 進捗記録 — 第4回・進捗率の更新

### 全体進捗：44%（静的棚卸し・概算）

第3回の39%以降、Owner User/Player Link Support、Discord Support、Safety Gate/Service Usage、実際の収集パイプライン、GitHub Actionsの副作用、主要SQL列とMigrationの不一致候補を追加した。

| 作業領域 | 重み | 現在の達成度 | 加重点 | 根拠 |
|---|---:|---:|---:|---|
| リポジトリ/構成/入口の初期台帳 | 10% | 100% | 10.0% | src/Migration/route/Workflow/assetsを列挙 |
| Route→handler/page→定義/importの照合 | 20% | 50% | 10.0% | 110 pathとsrc内API文字列を照合。未解決/未登録候補3件。全method/guardは未完了 |
| 画面UI→API→処理の対応付け | 25% | 35% | 8.75% | 主要機能領域の画面/API/DB経路を記録。全ボタン/フォームの成功/失敗状態は未完成 |
| Migration/SQL→テーブル・列・Indexの双方向照合 | 25% | 20% | 5.0% | 主要テーブルを確認し、Admin Rankingの列不一致候補を発見。全Migration/SQLは未照合 |
| Worker/Cron/Queue/権限/外部連携の接続照合 | 15% | 60% | 9.0% | scheduled/queue、外部OAuth、Owner/Admin guard、schema workflow、Safety Gateを整理 |
| テスト観点・本番確認条件の整理 | 5% | 25% | 1.25% | P0/P1候補、実行禁止の本番操作、E2E観点を整理。全機能テスト行列は未完成 |
| **合計** | **100%** |  | **44.0%** | 概算。実装完成率や本番正常率ではない |

### 第4回で追加した重要所見

- `getLatestAdminKingdomRankingSnapshot()`のSELECTが`kingdom_ranking_current.ranking_snapshot_id`を参照するが、Migration 0019の同テーブルに列がない。Admin Ranking読出し/refreshとGoogle Sheets exportへの影響候補。
- `scripts/reconcile-d1-schema.mjs`のrequired migration listは0043まで。現行0044–0058の完全照合/補修を保証しない。
- Safety GateのCloudflare metrics欠損時のNORMAL扱い候補、Retention後のPlayer History/Change Events readback差、Player Visibility APIのrole mismatchを継続記録。
- すべて静的確認。コード変更、実D1クエリ、デプロイ、Queue操作、外部API/負荷テストは行っていない。


## 2026-10-10 次スレ引き継ぎチェックポイント

- 現在のチェックリスト進捗は **6/9項目 = 66.7%（表示67%）**。次は未完了項目を実作業で完了させ、約10ポイント進んだ段階で報告する。進捗率はチェックリスト完了割合であり、全機能の実装率・正常率ではない。
- 現時点で未完了のチェック項目:
  1. Migration全件のテーブル/列/制約/Indexと現行SQLの双方向照合
  2. 全画面のUI機能・ボタン・フォーム→API→認可/DB/R2→成功/失敗表示の対応付け
  3. 機能単位で「実装あり/未接続/重複/未実装/仕様未確定」を確定
  4. 機能別のテスト可能性・本番E2E確認条件を定義
- 直近の重要な追加記録: PreviewとProductionが同じD1 database ID/R2 bucketを指定している。PreviewのQueue binding/consumerの実分離は未確認であり、Previewから副作用のある処理を起動しない。
- 次の作業は Migration 0001–0058のDDLをファイル名単位で最終スキーマへ整理し、src全体のSELECT/INSERT/UPDATE/DELETE列、JOIN、WHERE、ORDER BY、Indexを双方向照合する。0008は同番号ファイルが2つあるためファイル名をキーに扱う。
- 既知の要確認候補を再確認し、重複登録しないこと: `kingdom_ranking_current.ranking_snapshot_id` の列不一致、`kingdom_watchlist_jobs.source_first_at/source_last_at` のMigration間差、`src/user-player-link.js` の実行時DDL、schema reconciliation scriptが0043までしか必須Migrationを列挙しない点。
- ルート接続候補: `/api/player-compare` の `handlePlayerCompareApi`、`/player/compare` の `renderPlayerComparePage`、Owner Load Test CSV export handlerの未接続。既存記録の根拠と確度を参照し、修正はまだ行わない。
- 安全制約: アプリコード/Migration/Workflow変更、デプロイ、本番D1更新、Queue操作、収集/負荷テスト、外部API呼び出しは禁止。D1 Free reads最優先。広範囲 `ranking_snapshots` 取得クエリを絶対に復活させない。


## 2026-10-10 監査追記 — Migration/SQL双方向照合の追加証拠（静的）

### 既存候補の再確認・根拠補強（重複起票なし）

#### A. `kingdom_ranking_current.ranking_snapshot_id` 列参照

- **現行SQL側の根拠:** `src/index.js` の `getLatestAdminKingdomRankingSnapshot()` が `SELECT ranking_snapshot_id, kid, board, ... FROM kingdom_ranking_current` を発行する。
- **DDL側の根拠:** `migrations/0019_watchlist_runtime_schema.sql` の `CREATE TABLE IF NOT EXISTS kingdom_ranking_current` は `kid, board, target_type, target_id, rank, previous_rank, score, uid, governor_id, nick_name, aid, abbr, name, observed_at, source_observed_at, source_observation_id, updated_at` を定義し、`ranking_snapshot_id` は含まない。
- **補助証拠:** `scripts/reconcile-d1-schema.mjs` 内の `kingdom_ranking_current` CREATE TABLE定義にも `ranking_snapshot_id` は含まれない。
- **評価:** 静的な列不一致候補の確度は高い。Admin Kingdom Rankingの読出し経路でSQLエラーとなる可能性があり、同関数を使うrefresh/export経路への影響も追跡対象。ただし本番D1の実スキーマ、Migration適用状態、該当ルートの実行結果は未確認のため、実行時障害としては未確定。
- **修正前に必要な確認:** すべてのMigrationで列の後付けがないことを再検索し、関数の全呼び出し元・catch/HTTP応答を追跡する。修正は許可を得るまで行わない。

#### B. `kingdom_watchlist_jobs.source_first_at/source_last_at` の定義差

- **Migration 0008:** `migrations/0008_kingdom_watchlist_jobs.sql` のCREATE TABLEには `source_first_at` / `source_last_at` がない。
- **Migration 0019:** `migrations/0019_watchlist_runtime_schema.sql` のCREATE TABLEには両列があるが、`IF NOT EXISTS`のため、先に0008が適用されて既存テーブルが存在する環境へは列追加を行わない。
- **互換DDL:** `scripts/reconcile-d1-schema.mjs` のテーブル作成定義は両列を含む。ただしテーブルが既存の場合に同スクリプトが列を追加するかどうかは、該当のadditive-column処理と対象テーブルのrequired-column定義を含めて引き続き確認する必要がある。
- **評価:** Migration履歴上の差は確認済み。実DBに列がないと断定はできない。現行SQLが両列を参照する箇所と、既存テーブルへのALTER履歴の有無を次の照合対象とする。

#### C. `user_player_links` 実行時DDLとMigration

- **実行時DDL:** `src/user-player-link.js` の `ensureSchema()` は `CREATE TABLE IF NOT EXISTS user_player_links`、複数のIndex作成を実行する。取得・保存・無効化・所有権移管の関数から呼ばれるため、少なくともこれらの処理経路ではDBアクセス時にスキーマ確認DDLが発行される設計。
- **Migration側:** `migrations/0022_user_player_links.sql` に同テーブルの定義があり、後続の `scripts/reconcile-d1-schema.mjs` も `official_verified_at` / `official_verified_by_user_id` 列と複数Indexを追加・確認する構成を持つ。
- **評価:** Migrationと実行時DDL/repair scriptの三重管理が存在する。列・CHECK・Indexの完全な同値性、リクエストごとのDDL実行回数、D1読み取り/書き込みコストは未確定。今回、本番やローカルDBでDDLを実行していない。

### 今回の監査境界

- GitHub `main` の静的ファイルのみを根拠とした。実D1のschema、Migration適用履歴、Query Plan、Cloudflare Insightsは確認していない。
- D1 Free reads最優先。全件データSELECTや本番クエリは実行していない。
- `ranking_snapshots` の広範囲取得を追加・復活させていない。既存の履歴参照は特定kid/board/target_idとLIMITで絞られている箇所を確認したが、全SQL網羅確認の完了を意味しない。
- アプリコード、Migration、Workflowの変更、デプロイ、本番DB更新、Queue操作、収集/負荷テスト、外部API呼び出しは行っていない。


### D. `kingdom_watchlist_jobs.source_first_at/source_last_at` — 現行SQL参照まで確認

- **現行SQL側:** `src/index.js` 内で両列をINSERT、UPDATE、SELECTし、Watchlistの進捗・完了レスポンスや画面表示に渡している。少なくともWatchlistジョブ開始、ランキング収集後の更新、プレイヤー収集後の更新、状態取得で参照される。
- **Migration側:** 0008定義には両列がなく、0019定義にはある。後続Migration群で既存テーブルに両列を追加するALTERが必要。
- **Reconciliation script:** `scripts/reconcile-d1-schema.mjs` は両列を含む `CREATE TABLE IF NOT EXISTS` 定義を持つが、同スクリプトの該当箇所には `kingdom_watchlist_jobs` の既存テーブルへ両列を追加する `addColumn()` 呼び出しが見当たらない。既存テーブルならCREATE文が既存定義を更新しないため、スクリプトがこの差を自動補修するとは確認できない。
- **影響/確度:** 既存DBが0008形状のままで0019相当の列追加が適用されていない場合、Watchlist jobのINSERT/UPDATE/SELECTがSQLエラーとなる可能性がある。コード上の参照とDDL差は高確度、実DBに列が欠落しているか・本番で発生するかは未確認。
- **安全な次確認:** Migration 0020–0058をファイル名単位で確認し、両列へのALTERが後続に存在しないことを確認する。Production DB・reconcile scriptは実行しない。

### E. `user_player_links` — Migration再構築順序の列/制約照合

- **0022:** 初期形状に `user_id TEXT NOT NULL UNIQUE`、`governor_id`、status/verification_method CHECKを定義。
- **0023:** `official_verified_at` / `official_verified_by_user_id` を追加し、所有権サポート申請テーブルと2 Indexを作成。
- **0024:** ACTIVE状態の `governor_id` を一意にするpartial UNIQUE Indexを追加。
- **0026:** 旧テーブルを `user_player_links_v2` に移行し、`kingdom_id`、`account_type`、verification列を含む最終形状へ再構築。旧 `UNIQUE(user_id)` 制約は複数アカウント対応のため最終形状から外れ、代わりにACTIVE governor/user-governor/main-account用partial UNIQUE Indexを作成する。
- **現行コードとの関係:** `src/user-player-link.js` の `ensureSchema()` は最終形状相当のテーブルと複数Indexを作成するが、`user_player_link_support_requests` はこの関数内では作成しない。サポート申請テーブルはMigration 0023/reconcile scriptに依存するように見える。Migration未適用環境での挙動は未確認。
- **判定:** Migration 0022だけを最終形状として比較すると誤判定になるため、0023/0024/0026を順序込みで評価する必要がある。現在の最終スキーマとIndexの完全一致、実適用状態、リクエスト時DDLの頻度は未確認。


### F. Migration 0001–0058横断検索 — 2候補の履歴照合結果

- **対象範囲:** `migrations/` 内のSQLファイル59件（`0008_*.sql`が2ファイル存在するため番号ではなくファイル名で識別）。現行ファイル名一覧では0001〜0058を確認。
- **`source_first_at/source_last_at`:** 0008の `0008_kingdom_watchlist_jobs.sql` にはなく、0019に定義あり。0020〜0058のMigration群を確認した範囲で、両列を `ALTER TABLE kingdom_watchlist_jobs ADD COLUMN` する履歴は見当たらない。0046が同テーブルへ追加するのは `collection_source` 列で、source時刻列ではない。よって「Migration履歴に既存テーブル向け列追加が見当たらない」という静的根拠は強い。実DBに列がないとまでは断定しない。
- **`ranking_snapshot_id`:** 0001〜0058のMigrationを確認した範囲で、`kingdom_ranking_current` に当該列を追加するDDLは見当たらない。0019のCREATE定義にも存在しない。一方、`src/index.js:getLatestAdminKingdomRankingSnapshot()` が `kingdom_ranking_current` からSELECTしているため、列不一致候補は高確度。
- **重要な区別:** `src/ranking-store.js` の `buildKingdomRankingInsertStatements()` が `ranking_snapshot_id` を使うのは別テーブル `ranking_snapshots` へのINSERTであり、それ自体は不一致ではない。問題候補は `kingdom_ranking_current` を読むAdmin ranking helper側に限定して記録する。
- **制限:** これはMigrationファイルと確認したSQLコードの静的照合。適用済みMigrationの実履歴、実DB schema、ルート実行結果は未確認。修正は行っていない。


### G. `scripts/reconcile-d1-schema.mjs` とMigration 0044–0058の対応範囲

- **静的根拠:** reconcile scriptの `MIGRATIONS` 配列は `0017_api_pool_atomic_lease.sql` から `0043_alliance_collection_state.sql` までを列挙し、0044–0058を含まない。
- **機能例:** Migration 0058は `user_kingdom_ranking_preferences` と `idx_user_kingdom_ranking_preferences_kid` を作成し、`src/index.js` は同テーブルへINSERT/UPSERTする。reconcile scriptには同テーブル名の参照がない。
- **他の未掲載候補:** 0057のAPI Pool Mighty metadata列、0054/0056のMighty credentials、0053/0055のPlayer Visibility role/schema変更などもreconcile scriptの文字列検索では対応定義が見当たらない。
- **評価:** このscriptが0044–0058の新しいスキーマを再構築/修復する役割も担う想定なら、現状のMigrationリストとDDL補修対象の追随不足候補。scriptが過去スキーマの限定的な照合専用である可能性もあるため、運用上の目的・呼出元を確認するまでは確定バグ扱いしない。
- **未確認:** scriptの運用手順、CI/Workflowからの呼出し、本番で使われているか、0058のテーブルが実DBにあるか。実行はしていない。

### H. Reconcile workflowの役割確認 — 0044–0058の未掲載を単独バグと断定しない

- `.github/workflows/eagleeye-d1-schema-reconciliation.yml` は明示的な本番確認文字列を要求し、`scripts/reconcile-d1-schema.mjs --apply` を実行する設計。検証も0017–0043を対象にしている。よって同scriptの0017–0043範囲は意図的な限定範囲の可能性が高く、0044–0058が列挙されない事実だけで不具合とは断定しない。
- `.github/workflows/eagleeye-d1-apply-pending-migrations.yml` は別途 `scripts/reconcile-0053-production-drift.mjs` を実行し、通常Migration適用後に0054–0057のスキーマ要素を検証する。0053–0057については別経路が存在することを確認。
- ただしMigration 0058の `user_kingdom_ranking_preferences` はreconcile scriptおよび確認したWorkflowの専用検証に見当たらず、通常のpending Migration適用で作成される想定。Migration未適用状態でAPIが呼ばれた場合の動作や本番適用履歴は未確認。
- `scripts/reconcile-0053-production-drift.mjs` と上記Workflowは本番D1を変更し得る。今回、内容を静的に読むのみで、Workflow起動・スクリプト実行・Cloudflareアクセスは行っていない。

### I. `kingdom_watchlist_jobs` の列不一致評価を更新

- 0008 `kingdom_watchlist_jobs` DDLで作成された既存テーブルに対し、0019は `CREATE TABLE IF NOT EXISTS` で同テーブルを再定義するだけであり列追加はしない。0020–0058のMigrationにも `source_first_at/source_last_at` をADD COLUMNするALTERは見当たらない。
- よって、Migrationを番号順に新規適用しただけの環境でも、初回作成時の0008形状が残る可能性が高く、現行コードのINSERT/UPDATE/SELECTと不整合になる。これは静的なMigration設計上の高確度候補（新規DBへの適用時も問題になり得る）として扱う。本番D1の実状態・適用済みMigration・実行時障害は未確認。


### J. Migration 0058の保存API接続 — 読出し経路は未確認

- Migration 0058は `user_kingdom_ranking_preferences` を作成する。`src/index.js` には `handleKingdomRankingPreferencesApi()` と `/api/kingdom-rankings/preferences` のルートがあり、認証済みユーザーの `kid/boards_json/primary_board` をINSERT/UPSERTする。
- `src/index.js` 全文の文字列検索では、このテーブルをSELECTする処理、GETで保存済み設定を返す処理、または同API URLを呼ぶクライアント側fetchは確認できなかった。現時点で「保存APIはあるが、保存値の読出し/UIからの呼出しが未接続の可能性」を候補として追加する。
- 確度は中。UIが別ファイル/別経路でAPIを呼ぶ可能性、ユーザー設定をまだ書き込み専用で提供している仕様の可能性が残る。HTML生成部分、関連JS資産、APIルートの利用者を次に確認する。実行時のネットワーク検証は行っていない。


### Jの再確認・訂正：ランキング設定APIはUIと接続済み

- `src/kingdom-portal.js` を追加確認し、ランキング設定フォーム `#rank-pref-form` から `fetch('/api/kingdom-rankings/preferences', {method:'POST', ...})` が呼ばれることを確認。`/kingdom/rankings` 表示時には `user_kingdom_ranking_preferences` をSELECTし、保存済み `boards_json/primary_board` を利用する。
- したがって「保存APIのUI呼出し/読出しが未接続」という前の候補は取り下げる。APIルート→UI保存処理→DB保存→ランキングページのDB読出しという静的な接続は確認済み。認証状態、DBデータ、実際のブラウザ操作での成功は未確認。
- この訂正によりMigration 0058の機能接続候補は解消扱いとし、残る確認はMigration適用/実DB schemaの整合性のみ。



### 2026-10-10 継続監査：user_player_links 最終スキーマ照合と70%到達点

- Migration 0022（初期形状）→0023（公式確認列・サポート申請テーブル）→0024（ACTIVE governor partial UNIQUE）→0026（複数アカウント対応の再構築）の順序で比較した。
- Migration 0026の最終テーブル列と `src/user-player-link.js:ensureSchema()` は、link_id/user_id/governor_id/kingdom_id/account_type/status/verification_method/created_at/updated_at/verified_at/official_verified_at/official_verified_by_user_id の点で一致。account_type/status/verification_methodのCHECK制約も一致。
- 主要3通常Index（user/status、governor/status、user/kingdom/status）と3 partial UNIQUE Index（ACTIVE governor、ACTIVE user/governor、ACTIVE MAIN per user/kingdom）は、名前・列・WHERE条件がMigration 0026と実行時DDLで一致。0022のUNIQUE(user_id)は0026で意図的に外れるため、最終形状の不一致ではない。
- `user_player_link_support_requests` はMigration 0023で作られるが、`ensureSchema()`では作られない。サポート申請機能はMigration/reconcile経路に依存する。実D1状態と実行時動作は未確認。
- `ensureSchema()`はモジュール内Promiseで同一isolate内の初回実行を共有し、失敗時にリセットする。cold isolateごとにDDL確認が発生する可能性はあるが、実際のD1消費量は未測定。
- **進捗基準を10項目へ整理し、現在7/10 = 70%。** 旧記録に「6/9」と「未完了4項目」が併記され分母不整合があったため、作業単位を明示して再構成した。これは監査チェックリストの完了割合であり、実装率・本番正常率ではない。
  1. [x] srcファイル一覧・責務の初期分類
  2. [x] index.jsルート一覧・特殊prefix/callback/fallback
  3. [x] Migrationファイル一覧・重複番号把握
  4. [x] wrangler.jsonc主要binding/Cron/Queue/Preview差分
  5. [x] Workflow・スクリプト・公開アセット一覧
  6. [x] ルート呼出名/import/exportの静的照合（実行時未検証）
  7. [x] user_player_linksの最終スキーマと実行時DDL/Index照合
  8. [ ] 全Migrationとsrc全SQLの双方向照合（他テーブル/列/制約/Index）
  9. [ ] 全画面のUI操作→API→認可→DB/R2→成功/失敗表示の棚卸し
  10. [ ] 機能状態分類と機能別テスト/E2E確認行列
- 既知候補：`kingdom_ranking_current.ranking_snapshot_id`の列参照差、`kingdom_watchlist_jobs.source_first_at/source_last_at`のMigration差。静的根拠は強いが、本番D1の実schema・実行時エラーは未確認。
- GitHub mainの静的確認のみ。アプリコード/Migration/Workflow変更、デプロイ、本番D1更新、Queue操作、収集/負荷テスト、外部API呼び出しはなし。D1 Free reads優先。広範囲な `ranking_snapshots` 取得クエリは追加・復活させていない。


### 2026-10-10 継続監査：ランキングcurrentと履歴Retention経路の追加照合

#### I. `kingdom_ranking_current` のDDL・Read/Write・Index照合

- **DDL:** Migration 0019の `kingdom_ranking_current` は複合PRIMARY KEY `(kid, board, target_type, target_id)`。列は `kid/board/target_type/target_id/rank/previous_rank/score/uid/governor_id/nick_name/aid/abbr/name/observed_at/source_observed_at/source_observation_id/updated_at`。
- **Write:** `src/ranking-store.js` は同じ列群へINSERT ... ON CONFLICTでcurrent値を更新し、除外対象を `kid+board+target_type+target_id` でDELETEする。DDLとの列名対応に目立つ差は見つからなかった。
- **Read:** `src/ranking-store.js`、`src/index.js`、`src/kingdom-portal.js`からkid/boardで絞りrank順に読む経路、top-N、board stateとのJOIN、alliance/playerランキング表示などを確認。Admin helperの `ranking_snapshot_id` 参照は前記の列不一致候補として継続管理し、今回も重複起票しない。
- **Index:** Migration 0001–0058をファイル名単位で検索した結果、`kingdom_ranking_current` に対する専用secondary indexのCREATEは見当たらず、Migration 0019の複合PRIMARY KEYが確認できる主な索引定義。既存の `idx_ranking_snapshots_*` は別テーブル `ranking_snapshots` 用で、current tableのIndexとして数えない。
- **性能上の確認候補:** 多数の読み取り経路が `WHERE kid=? AND board=? ORDER BY rank` を使う。複合PRIMARY KEYはkid/boardでの絞り込みに合う一方、rank順まで同じ索引で満たすとは限らず、ソートが必要となる可能性がある。実Query Plan/Cloudflare D1 read consumptionは確認していないため、Index追加を即提案・実施せず、計測前の性能候補として記録する。D1 Free readsへの影響を推測だけで断定しない。
- **列不一致候補:** `src/index.js:getLatestAdminKingdomRankingSnapshot()` の `ranking_snapshot_id` SELECTと、Migration 0019のcurrent DDLに同列がない点は継続。Migration 0001–0058でcurrent tableに同列を追加するDDLも見当たらない。実D1 schema/ルート実行結果は未確認。

#### J. Player History / Change Events / Retention後の読戻し経路

- **Player History API:** `/api/player/history` は `getPlayerHistory(env.DB, governorId, limit, env.ARCHIVE)` を使う。helperはD1 `player_snapshots` とR2履歴を読み、`observation_id`で重複を統合し、時刻順に返す。R2読出し失敗は診断記録/ログに出し、R2_ONLY条件下でD1 fallbackを試みるコードがある。
- **Player History画面:** `/player/history` の `renderPlayerHistoryPage()` は `player_snapshots` をD1から直接SELECTし、R2 readback helperを呼んでいない。RetentionはR2アーカイブ成功後にD1行を削除するため、保持期間を超えてD1から削除された履歴はAPIと画面で表示結果が異なる可能性がある。コード上の経路差は確認済み、実データでの再現は未確認。
- **Change Events:** `/api/player/changes` と `/player/changes` は `change_events` をD1から直接SELECTする。R2 archive moduleには `change_events` 用の専用list/readback関数が見当たらない。Retentionが `change_events` をR2保存後にD1削除する設定の場合、削除済み古いイベントは現行のAPI/画面から復元されない可能性がある。
- **Retentionの安全順序:** `src/retention.js` は対象行を選択し、`archiveD1RowsToR2()` 成功後にrowidでD1削除する実装。これは「アーカイブ確認前に削除しない」設計だが、アーカイブされた全テーブルに対してアプリ側readbackが実装済みであることまでは意味しない。
- **未確認:** Retention jobが本番で定期起動されているか、設定値/実行結果、実際に削除された行、R2 objectの中身、Cloudflare環境での挙動は未確認。今回、Retention処理やDB/R2操作を実行していない。

### 進捗チェックリストの粒度を詳細化 — 80%到達時点（履歴）

従来の10項目チェックリストは「全Migration/全SQL照合」など作業量の大きい項目と、一覧確認の項目が同じ1点として扱われていたため、監査作業パッケージを20項目に詳細化した。旧70%はその時点の10項目基準による履歴として保持する。この見出しは80%到達時点の履歴。最新は末尾の「100%到達」の記録を参照。100%は静的監査成果物の完成率であり、アプリの実装率・本番正常率・本番適用率ではない。

1. [x] srcファイル一覧の確定
2. [x] srcモジュール責務の初期分類
3. [x] index.jsの完全一致ルート一覧
4. [x] prefix/callback/fallbackなど特殊ルーティングの棚卸し
5. [x] Migration全ファイル名の一覧化
6. [x] Migration番号重複・履歴上の主要変更点の初期整理
7. [x] wrangler.jsoncの主要binding/Cron/Queue確認
8. [x] PreviewとProductionの設定差分候補確認
9. [x] Workflow一覧と静的な役割確認
10. [x] scripts・公開アセット一覧の確認
11. [x] route呼出し/import/exportの静的照合
12. [x] 未定義handler/未接続route候補の台帳化
13. [x] user_player_links最終列/CHECK/Indexと実行時DDLの照合
14. [x] ranking preferencesのUI→API→DB接続とschema reconcileの役割確認
15. [x] kingdom_ranking_currentのDDL・read/write・Index利用パターン照合
16. [x] Player History / Change EventsのRetention・R2 readback経路照合
17. [x] 全Migrationとsrc全SQLの静的双方向照合を一巡（不一致候補は未解決として台帳化）
18. [x] 全画面のUI操作→API→権限→DB/R2→成功/失敗表示を静的に一巡（実ブラウザ未検証）
19. [x] 全機能を実装あり/未接続候補/重複・経路差/仕様未確定/外部検証待ちに分類
20. [x] 機能別テスト可能性・本番E2E確認行列を作成（E2E自体は未実施）

### 今回の実施境界

- GitHub `main`の静的ソースとMigrationのみ確認。ビルド、ブラウザE2E、実D1 schema、Query Plan、Cloudflare Insights、実R2データは未確認。
- アプリコード/Migration/Workflowの変更、デプロイ、本番D1更新、Queue操作、収集/負荷テスト、外部API呼び出しなし。
- D1 Free readsを優先。広範囲な `ranking_snapshots` 取得クエリは追加・復活させていない。


### 2026-10-10 継続監査追記 — API Observations / Players の列定義差候補

#### K. `api_observations.source_observed_at`

- **Migration側:** `migrations/0002_api_observations.sql` の `api_observations` CREATE TABLE定義に `source_observed_at` はない。Migration 0001–0058を確認した範囲で、同テーブルへ当該列を追加するALTERは見当たらない。
- **現行SQL側:** `src/api-observations.js` のINSERT列リストに `source_observed_at` がある。`src/api-raw-inspector.js` は同列をSELECTし、`src/player-store.js` の最新Observation取得でも同列を読む。
- **Reconcile側:** `scripts/reconcile-d1-schema.mjs` の該当するaddColumn処理に、この列の補修は見当たらない。
- **影響/確度:** Migration 0002形状のDBに対してこのINSERT/SELECTが実行されると、列不存在によるSQLエラーとなる可能性が高い。DDLとSQLの静的な不一致候補は高確度。実D1 schema、当該SQLの本番実行、実際のエラーは未確認。

#### L. `players.source_observed_at`

- **Migration側:** `migrations/0004_players.sql` の `players` CREATE TABLE定義に `source_observed_at` はない。Migration 0001–0058を確認した範囲で、同列を `players` へ追加するALTERは見当たらない。`migrations/0051_players_r2_index.sql` が追加するのは `r2_latest_key` であり、source時刻列ではない。
- **現行SQL側:** `src/player-store.js` の `INSERT INTO players`、UPSERT更新句で `source_observed_at` を使用する。ほかに `r2_latest_key` は0051で追加されるため別扱い。
- **Reconcile側:** `scripts/reconcile-d1-schema.mjs` で `players.source_observed_at` を追加する `addColumn()` は見当たらない。
- **影響/確度:** Migration 0004形状のDBではPlayer materializationのINSERT/UPDATEが失敗する可能性が高い。静的な列定義差は高確度。実D1 schema、実行時エラー、本番への影響は未確認。

#### 2候補に関する注意

- これはMigrationファイルと現行コードの静的照合結果であり、Cloudflare D1へ接続してschemaを読んだ結果ではない。
- 既知の `kingdom_ranking_current.ranking_snapshot_id`、`kingdom_watchlist_jobs.source_first_at/source_last_at` と同様、修正はせず台帳に候補として記録する。
- 次の確認では、`api_observations` と `players` の全INSERT/UPDATE/SELECT列をMigrationの最終形と照合し、他テーブルの未確認差分を引き続き追う。


## 2026-10-10 90%到達チェックポイント — 静的監査一巡完了

- **進捗: 18/20作業パッケージ = 90%。** 80%時点の16/20から、パッケージ17・18を静的監査の一巡完了として記録。これは静的監査の作業完了率であり、機能実装率・本番正常率・本番適用率ではない。
- 最新チェックリスト状態: [x] 1–18（静的監査パッケージ）、[ ] 19（機能状態分類）、[ ] 20（テスト/E2E行列）。実機・本番確認の未実施は別途残る。
- **パッケージ17完了:** Migration 0001–0058（重複番号0008はファイル名で区別）と現行SQLを一巡し、主要なテーブル定義・列参照・UPSERT/DELETE・Index・Retention/R2の保存/読出し経路を突合。列定義差、未接続の可能性、Index/Query Plan要確認を解消済みとはせず、すべて候補として台帳化。実DB schemaの取得やSQL実行はしていない。
- **追加で記録した高優先度の列差候補:**
  - `api_observations.source_observed_at`: Migration 0002定義にないが、INSERT/SELECTで使用。
  - `players.source_observed_at`: Migration 0004定義にないが、Player UPSERTで使用。
  - 既知の `kingdom_ranking_current.ranking_snapshot_id`、`kingdom_watchlist_jobs.source_first_at/source_last_at` も継続候補。
- **パッケージ18完了:** 全画面・API入口一覧と、ユーザー画面、Watchlist、Kingdom Portal、Player/History/Changes、My Player/VIP、API Pool、Admin/Owner、Diagnostics/Logs、Google連携、Discord Support、Retention/R2 Backfill、Load Testの操作フローを静的に一巡。UI→API→権限→DB/R2の接続が確認できたものと、handler未接続候補・権限差・エラー/空状態・R2読戻しの不足候補を区別して記録した。実際のブラウザ操作やE2Eは行っていない。
- **残り2パッケージ:**
  19. 全機能を「実装あり/未接続/重複/未実装/仕様未確定」に機能単位で最終分類。
  20. 機能別テスト可能性・本番E2E確認行列を完成。
- **次に優先すること:** P0候補を機能分類へ集約し、どのテストで何を確定できるかを整理する。現時点でコード修正・Migration修正・Workflow修正はしない。
- **未実施:** Cloudflare実D1 schema確認、Query Plan/Insights、ビルド、HTTP、ブラウザE2E、R2実データ確認。本番の稼働状況や発生済み障害を断定しない。
- **固定制約:** D1 Free reads最優先。広範囲な `ranking_snapshots` 取得クエリは追加・復活させない。デプロイ、本番D1更新、Queue操作、収集/負荷テスト、外部API呼び出しなし。


## 2026-10-10 パッケージ19 — 全機能の状態分類（静的監査基準）

### 判定ラベル

- **実装あり・接続経路あり（実行未検証）**: 画面/API/関数間の静的接続が読める。正常動作を意味しない。
- **未接続/不一致候補**: route/import/export/DDL/権限/データ保存・読出しの接続差が疑われる。
- **重複/経路差候補**: 同じ情報を別経路で扱う、またはUI/APIで処理が異なる。
- **仕様/運用未確定**: 呼出元、運用スケジュール、期待仕様、保持方針がコードだけでは確定できない。
- **外部/本番検証待ち**: 実D1/R2/Queue、外部API、OAuth、ブラウザ、Cloudflare runtimeの実動作が必要。

### 機能領域別の最終分類

| ID | 機能領域 | 分類 | 根拠・未解決事項 | 優先度 |
|---|---|---|---|---|
| F01 | Discord OAuth / Session / User roles | 実装あり・接続経路あり、外部/本番検証待ち | OAuth state/cookie/失敗遷移、ACTIVE/DISABLED、各role guardは実ブラウザ/認証で未確認 | P1 |
| F02 | Player Search / Profile / Refresh | 実装あり・接続経路あり、スキーマ差候補あり | `players.source_observed_at`と`api_observations.source_observed_at`のMigration差候補。部分一致検索のQuery Plan未確認 | P0 |
| F03 | Player Compare | 未接続候補 | `/api/player-compare` → `handlePlayerCompareApi`、`/player/compare` → `renderPlayerComparePage`の定義/import接続を静的確認で確定できず。実行/build未検証 | P0 |
| F04 | Player History | 経路差候補 | APIはD1/R2 merge helper、画面はD1直接読出し。Retention後の結果差は未再現 | P0 |
| F05 | Player/Kingdom Change Events | Retention後readback不足候補 | 画面/APIはD1直接参照、`change_events`専用R2 readback経路が見当たらない | P0 |
| F06 | Player/Kingdom Watchlist | 実装あり・接続経路あり、schema差候補あり | `kingdom_watchlist_jobs.source_first_at/source_last_at`のDDL差候補。Cron/Queue起動・再試行・実消費は未検証 | P0 |
| F07 | Kingdom Catalog / Discovery / Seeder / Roller | 実装あり・運用接続未確定 | Seeder/rollerのWorker起動接続候補、R2 binding名差候補。全王国収集が定期実行されるか未確認 | P0 |
| F08 | Kingdom Ranking / Portal / Preferences | 実装あり・一部SQL不一致候補 | `kingdom_ranking_current.ranking_snapshot_id`参照差候補。rank順Index/Query Plan未確認。Preferences UI/API/DB静的接続あり | P0 |
| F09 | Alliance Catalog / Notification | 実装あり・識別子整合候補 | `target_id`形式の生成・通知側比較の差候補。実通知/dedupe未確認 | P1 |
| F10 | MightPulse endpoints / normalizer / research | 実装あり・外部検証待ち | endpoint別response shape、rate limit、retry、API Poolキー選択、実応答は未検証 | P1 |
| F11 | API Pool / Mighty key classification | 実装あり・状態整合候補 | DISABLEDキーとVIP資格判定、lease/expiry/並列競合、キー上限は実DB/外部応答未検証 | P0 |
| F12 | My Player / player links / support requests | 実装あり・接続経路あり | Migration 0022→0023→0024→0026と`ensureSchema()`の主要列/制約/Indexは静的に整合。support tableはMigration依存、所有権/移管/E2E未検証 | P1 |
| F13 | Player Visibility | 権限不一致候補 | ページ側ADMIN/OWNER許可とAPI側OWNER限定の差候補 | P0 |
| F14 | Retention / R2 archive / Emergency Buffer | 実装あり・起動/readback未確定 | retention job / buffer drainの呼出元候補、archive後のreadback範囲、失敗時保全をruntimeで未検証 | P0 |
| F15 | Diagnostics / System Status / Logs / Trace | 実装あり・コスト/露出候補 | 公開statusのD1 read量、null metricsのSafety Gate判定、24h範囲/Export/Queue経路未検証 | P1 |
| F16 | Safety Gate / Service Usage / Queue / R2 | 実装あり・運用結果未検証 | metrics欠損時のNORMAL判定候補、R2 read-modify-writeの競合/IO増幅候補 | P0 |
| F17 | Owner Kingdom Load Test | 実装あり・route接続候補あり | CSV export UI/handlerはあるがroute接続候補。Safety Gate、cancel/resume、progress、usageは実行未検証。実行禁止 | P0 |
| F18 | Google Drive OAuth / Google Sheets export | 実装あり・設定/権限不一致候補 | redirect URIの不一致候補、token refresh/Owner/Admin export guardは実OAuth未検証 | P1 |
| F19 | Discord Support / ticket lifecycle | 実装あり・外部検証待ち | Interactions署名/時刻、ticket state transition、channel権限、audit logは実Discord未検証 | P1 |
| F20 | UI shared shell / role bar / double-submit guard | 一部実装あり・適用範囲未確定 | `eagleeye-ui.js`とindex内wrapperの全画面適用、iPhone Safari/連打/失敗状態は未実機検証 | P2 |
| F21 | User Mighty credentials legacy path | 仕様未確定・削除保留 | `user-mighty.js`/`user_mighty_credentials`とAPI Pool資格系の採用関係が未確定。不要と断定せず保持 | P2 |
| F22 | Schema reconciliation / migration workflows | ツール実装あり・本番適用未確認 | Scriptの対象範囲は複数経路。実適用履歴・Production driftは未照会。実行は本番変更の可能性があるため未実施 | P0 |
| F23 | Gateway API / data export / raw inspector | 実装あり・外部/権限検証待ち | prefix routeはある。各subrouteのrole/method/payload/limitと実応答は未検証 | P1 |
| F24 | Kingdom Collection Coverage / R2 backfill | 実装あり・指標/並列実行候補 | coverageが全王国収集を表すか未確定。Backfill counter/CAS、R2存在確認、並列実行は実行未検証 | P1 |

### P0候補の集約（修正前に再確認が必要）

1. Schema/SQL差候補: `api_observations.source_observed_at`, `players.source_observed_at`, `kingdom_watchlist_jobs.source_first_at/source_last_at`, `kingdom_ranking_current.ranking_snapshot_id`。
2. 接続/権限候補: Player Compare route、Load Test export route、Player Visibility ADMIN/API role差。
3. 保全/読出し候補: Player History UI/API差、Change Events archive readback、Retention/Buffer drainの起動接続。
4. 収集/コスト候補: Seeder/Roller起動接続、R2 binding差、Safety Gate null metrics、Preview/Production resource sharing、Ranking current rank-order Query Plan。
5. API Pool資格候補: DISABLED keyがVIP資格判定に残る可能性。

これらは**静的監査での候補分類**であり、実行時障害の確定診断ではない。コード修正・Migration修正・Workflow修正は本タスクでは行わない。

## 2026-10-10 パッケージ20 — 機能別テスト可能性・確認行列

### テストレーン

- **S (Static)**: ソース/Migration/設定を読む。今回実施した範囲。
- **B (Build/Local)**: build/import/route smoke/SQL prepare等をローカルまたは隔離Previewで実行。今回未実施。
- **P (Preview)**: 明示的に分離されたPreviewリソースを用いる統合テスト。設定上Preview/Production resource sharing候補があるため、分離確認が済むまでは禁止。
- **R (Production read-only)**: 本番状態を読むだけの確認。権限・データコスト・個人情報を事前に確認し、明示許可がある場合のみ。
- **W (Production write / External side effects)**: 本番DB変更、Queue操作、収集、外部API、OAuth/Discord/Google実操作、負荷テスト。明示許可と実施計画がない限り実施しない。

| 対象 | 現時点で可能な確認 | 次に必要なテスト | 成功条件 | 失敗/空データ確認 | レーン/注意 |
|---|---|---|---|---|---|
| Route/import/export | S | B: build/import + route smoke | 全route handlerが解決し、method/guardが期待どおり | 未定義handler、404/500、権限なし | B |
| Migration/schema | S | 隔離DBで全Migration適用→PRAGMA table_info/index_list/foreign_key_list | 現行SQLの全列がDDLに存在、制約/Index一致 | 空DBからの適用、既存DB upgrade、再適用/重複番号0008 | B。Production適用は別承認 |
| API observations / Players | S | 隔離DBでINSERT/UPSERT/SELECT/refresh | source時刻列とR2 pointerが整合し失敗時も元データ保全 | 欠損source timestamp、R2失敗、既存行更新 | B。実本番schemaは未確認 |
| Watchlist jobs | S | fake provider + isolated D1でjob lifecycle | queued→running→completed/failed、cursor/count一貫 | 列欠損、API枯渇、cancel/retry、空ランキング | B/P分離必須 |
| Player Compare | S | build + GET/POST route smoke + role guard | handlerが解決し、比較ページ/APIが期待形式を返す | player not found、片側欠損、未認証 | B |
| Player History / Changes | S | D1+R2 fixtureでRetention前後を比較 | API/画面が仕様どおり同じ期間を表示しarchive後も必要データに到達 | R2 missing/corrupt/timeout、D1 cleanup済み、空履歴 | B。R2 readback仕様確定が先 |
| Ranking current/preferences | S | isolated D1でcurrent UPSERT/DELETE/preferences round-trip、EXPLAIN QUERY PLAN |列/PK/順序/設定保存読出しが整合 | 空board、同rank、board未登録、SQL列欠損 | B。広範囲ranking_snapshots読出し禁止 |
| Player Visibility | S | role matrix: BASIC/ADVANCED/VIP/ADMIN/OWNER + ACTIVE/DISABLED | UI/APIとも仕様どおりのroleが許可される | ADMIN API拒否、disabled account、設定なし | B |
| API Pool / Mighty eligibility | S | mock provider + isolated D1 lease/status transition | eligible keyのみ選択、lease重複なし、失敗status整合 | DISABLED/REVOKED/COOLDOWN、0 key、同時claim、provider 401/429 | B。実キーを使わない |
| Catalog / Seeder / Rollers | S | trigger graph + fake providerで一件/小バッチ | state/cursor/last_success/failureとR2 pointerが一貫 | empty catalog、partial failure、R2 write failure、重複起動 | B。全王国収集は行わない |
| Retention / Emergency Buffer | S | isolated D1/R2 fixtureでarchive→verify→delete順をテスト | archive成功を確認した行だけ削除、buffer drain再開可能 | R2 failure、partial batch、invalid JSON、retry exhausted | B。Production retention実行禁止 |
| Safety Gate / Service Usage | S | missing/null/stale metrics unit tests + queue fixture | 不明metricsを安全側で扱い、二重archive/欠損なし | API unavailable、metrics null、queue redelivery、R2 conflict | B。実Queue操作なし |
| Load Test | S | fake-only simulationでcancel/resume/export/status | OWNER guard、cancel状態、counts/progressが整合 | 0 target、partial fail、double-click、export route missing | B。実負荷テスト禁止 |
| Google Drive/Sheets | S | mock OAuth/token + mocked export | redirect/state/role guard/token refreshが一致 | denied consent、expired token、429、empty export | B。実OAuth/Drive writeなし |
| Discord Support/Notifications | S | signed fixture/mock Discord responses | signature/time/permissions/state transition/dedupeが正しい | invalid signature、replay、no channel permission、duplicate event | B。実Discord送信なし |
| Diagnostics/Logs/Export | S | bounded fixture + method/role tests | period limit/24h filter/export accessが仕様どおり | empty logs、malformed cursor、unauthorized、large result | B。D1 read量を測る |
| UI shell / Safari / double-submit | S | browser tests desktop + iPhone Safari | role bar/labels/disable-on-submit/restore-on-errorが一貫 | slow response、double tap、validation error、offline | B/P。実機未確認 |
| Gateway / raw data / data export | S | per-subroute method/auth/limit/PII tests | routeごとにrole/method/shape/limitが適切 | unknown route, empty payload, oversized request | B |
| Schema workflows / Preview isolation | S | workflow dry-run/config diff + separate test resources | apply target/migration range/approval gateが明確、Previewが本番と完全分離 | missing migration, drift, wrong binding/queue | B。Production workflowは実行しない |

### 優先順（テスト計画）

1. **P0 / B1:** build/import/route resolution、schema mismatch候補4件、Player Compare、Player Visibility、Load Test export routeを隔離環境で確定。
2. **P0 / B2:** History/Changes Retention後のreadback、Retention/Emergency Bufferの起動経路、Safety Gate null metrics、API Pool DISABLED-key資格。
3. **P1 / B3:** Seeder/Roller起動、R2 binding名、Queue/Service Usage、Google OAuth redirect、Discord notification target ID、Preview/Production分離。
4. **P2 / B4:** UI shared shell/Safari/連打防止、Legacy user Mighty経路の採用仕様、検索/ランキングQuery Planと実測コスト。
5. 各Bテストが合格してからのみ、Previewを使用する必要性を評価する。Production read/writeや外部サービス操作は、この静的監査の完了によって自動承認されたことにはならない。

### 100%到達の定義と限界

- 20/20は「静的監査の成果物（一覧、分類、テスト行列、引継ぎ）が完成」の意味。
- これは全機能が正常・実装済み・本番稼働中という意味ではない。候補を解消せずに残すことも監査結果の一部。
- 実D1 schema/Query Plan、build、ブラウザE2E、Preview統合、本番稼働/外部連携は未実施。各テストレーンで別途確認が必要。
- D1 Free reads優先。広範囲な `ranking_snapshots` 取得クエリは追加・復活させない。デプロイ、本番D1変更、Queue操作、収集/負荷テスト、外部API呼び出しなし。


## 2026-10-10 機能信頼性監査再開 — 20%到達

- UI入口監査は再開せず、機能の正常性・安全性を優先する監査を開始。
- `wrangler.jsonc` のPreview設定はProductionと同じD1 database ID (`0024b5df-4dcf-45f7-b9a7-6fa621cbb80a`) とR2 bucket (`eagleeye-archive`) を参照している。Previewでテストしない。隔離環境を先に用意する。
- 現行MigrationとSQLを再照合し、以下を静的根拠付き候補として再確認:
  1. `api_observations.source_observed_at`: Migration 0002のCREATE TABLEに列がない一方、`src/api-observations.js` のINSERTで使用。
  2. `players.source_observed_at`: Migration 0004のCREATE TABLEに列がない一方、`src/player-store.js` のINSERT/UPSERTで使用。
  3. `kingdom_ranking_current.ranking_snapshot_id`: Migration 0019のテーブル定義に列がない一方、`src/index.js` の `getLatestAdminKingdomRankingSnapshot()` がSELECT。
  4. Player Compare: `src/index.js` に `/api/player-compare` と `/player/compare` のroute branchがあるが、importされているのは `normalizeCompareGovernorIds`、`buildPlayerCompareSeries`、`extractOptionalPlayerAssets` のみ。handler名 `handlePlayerCompareApi` / `renderPlayerComparePage` の定義・importを確認できず、実行時の未定義参照候補。
  5. Owner Load Test export: `handleOwnerKingdomLoadTestExportApi` はimportされ、画面側のexport参照もあるが、`/api/owner/kingdom-load-test/export` のrouter branchを確認できず。
- `kingdom_watchlist_jobs.source_first_at/source_last_at` についても、Migration 0008の初期定義にはなく、0019は `CREATE TABLE IF NOT EXISTS` で追加列を保証しない。実際に既存DBへ適用済みかは未確認のまま継続。
- 現在の進捗は今回の機能信頼性監査の **20%**。静的コードの根拠を確認した段階で、build・isolated D1・ブラウザ・本番検証は未実施。
- 実施していないこと: コード/Migration修正、deploy、D1 read/write、Queue操作、外部API/OAuth、負荷テスト。
- 固定条件: D1 Free reads最優先。広範囲な `ranking_snapshots` retrievalを追加・復活させない。Previewは本番資源と分離されるまで使用しない。


## 2026-10-10 機能信頼性監査 — 30%到達

- `scripts/reconcile-d1-schema.mjs` を再確認。補修定義に `players.source_observed_at` / `api_observations.source_observed_at` の列追加が見当たらず、`kingdom_ranking_current` の定義にも `ranking_snapshot_id` はない。
- `kingdom_watchlist_jobs` のMigration 0008初期定義には `source_first_at/source_last_at` がない。0019とschema reconcile scriptは列を含む `CREATE TABLE IF NOT EXISTS` 定義を持つが、既存テーブルに列を追加するALTERが見当たらない。旧スキーマで既に作られたDBでは列不足が残る可能性がある。
- `src/index.js` 全体の静的検索で `handlePlayerCompareApi` / `renderPlayerComparePage` の定義・importを確認できず。ルート分岐は存在するため、当該URLで未定義参照となる可能性が高い。
- `handleOwnerKingdomLoadTestExportApi` は `src/admin-kingdom-load-test.js` に実装され、`src/index.js` にimportもあるが、`/api/owner/kingdom-load-test/export` のルート分岐が存在しない。
- `renderPlayerVisibilityPage()` は `requireAdmin()`、`handlePlayerVisibilityApi()` は `requireOwner()`。ADMIN画面/APIの認可差を確認。
- 進捗 **30%**。コード修正、Migration適用、build、D1実行、ブラウザテスト、本番操作は未実施。候補は静的証拠として記録し、仕様確認と隔離テスト後に修正する。


## 2026-10-10 機能信頼性監査 — 40%到達

- `src/safety-gate.js` の `maxUsagePercent()` は候補メトリクスを `Number(v)` に変換してから有限値だけを残す。JavaScriptでは `Number(null) === 0` のため、nullのメトリクスが0%として集計される可能性がある。欠損時の最終判定・呼び出し側のnull処理を要確認。静的候補であり、実行結果は未確認。
- `src/retention.js` は `change_events` をRetention対象としてR2 archive/delete対象に含める。削除後にPlayer/Kingdom Changes APIがR2から履歴を復元するかは未確認。読み戻しの接続を追加追跡する。
- `src/player-store.js` のPlayer履歴は、R2_ONLYでR2 archive失敗時にhistory emergency bufferへ退避する経路と、履歴読み取り時にR2を参照する経路を確認。Buffer drainの実行起動元・再試行・完了状態の連携は未確認。
- `src/api-pool.js` の通常貸出条件はstatus AVAILABLE/COOLDOWNを対象にする。Mighty metadataの状態更新関数 `setApiPoolMightyMetadata()` はMighty確認成功時にAVAILABLEへ更新するため、キーのDISABLED/REVOKED等を不当に再有効化しないか状態遷移の呼び出し元を追う。
- 進捗 **40%**。実行テスト、DB変更、デプロイ、外部API呼び出しは未実施。


## 2026-10-10 機能信頼性監査 — 50%到達

- Safety Gate: `maxUsagePercent()` は全メトリクスがundefinedならnullを返す。呼び出し先 `getSafetyState(usagePercent)` は `Number(null) === 0` を使いNORMALへ分類するため、使用率不明が正常判定になる経路を確認。これは実行前にコードで追える静的な不具合候補。
- History Emergency Buffer: `src/index.js` 内では `drainHistoryEmergencyBuffer` のimportはあるが、呼び出し元を確認できなかった。scheduled/queue/requestの全起動経路を引き続き確認する。bufferにPENDING/FAILEDが残ったときの再処理が起動しない可能性。
- Change Events: `src/index.js` のプレイヤー/王国変更履歴クエリはD1 `change_events` を直接参照している箇所がある。Retentionはchange_eventsをR2へアーカイブ後、D1行を削除する。R2 readbackが接続されているかは未確認で、削除後に画面/APIから見えなくなる候補。
- API Pool Mighty metadata: `src/index.js` のユーザー提供キー再判定処理は `status != 'REVOKED'` のキーを検索し、成功時に `setApiPoolMightyMetadata(... mightyCapable:true ...)` を呼ぶ。関数側は成功時にstatusをAVAILABLEへ戻すため、DISABLED/ERRORキーも再有効化される可能性。意図した状態遷移か要確認。
- 進捗 **50%**。実行テスト・コード修正・DB更新・デプロイは未実施。


## 2026-10-10 機能信頼性監査 — 60%到達

- `src/index.js` 全体の静的検索で `drainHistoryEmergencyBuffer(` の呼び出しを確認できず。importのみで、`src/history-emergency-buffer.js`内に処理本体/exportはあるが、現行Workerのscheduled/queue/request経路から呼ばれていない可能性が高い。実行経路は引き続きリポジトリ全体で確認。
- Player Change APIの一方は `src/index.js` で `change_events` を直接SELECTしており、Retention後のR2 readback呼び出しはその処理経路に見当たらない。Retentionが古いイベントをR2へarchiveしてD1から削除した後、API/画面の履歴が欠ける可能性。
- `setApiPoolMightyMetadata()` の成功分岐はstatusをAVAILABLEへ更新する。ユーザー提供キーのMighty再判定はstatus != REVOKEDの行を検索対象にしているため、DISABLED/ERRORキーを成功時にAVAILABLEへ戻す可能性がある。意図した状態遷移か、管理者の無効化を尊重すべきか仕様確認が必要。
- Safety Gate欠損メトリクスはnull→0→NORMALとなる経路を確認。修正はまだ行わず、呼び出し元と仕様を確定する。
- 進捗 **60%**。静的追跡を継続。コード/Migration/Workflow変更、build、隔離DBテスト、本番操作は未実施。


## 2026-10-10 機能信頼性監査 — 80%到達（Cron / Queue起動経路横断）

### 今回の完了範囲
- `src/index.js` のWorker入口 `scheduled()` / `queue()` と、関連モジュールのexport/import/呼び出しを再照合した。静的調査のみで、WorkerイベントやQueueは実行していない。
- `scheduled()` の本文で確認できる起動先は `runApiPoolAutoRecovery`、`runKingdomCatalogDailyRefresh`、`runKingdomDiscordNotifications`。ここから `runKingdomWatchlistJobs`、`runDataRetentionJob`、`drainHistoryEmergencyBuffer`、Seeder/Roller群を呼ぶ記述は確認できない。
- リポジトリ内参照を追跡した範囲では、`runKingdomWatchlistJobs`、`runDataRetentionJob`、`drainHistoryEmergencyBuffer`、`runKingdomSeeder`、`runKingdomRankingRoller`、`runAllianceRoller`、`runPlayerRoller` は定義/importがある一方、Workerイベントからの呼出しが見つからない。未接続候補として優先度を上げる。別の外部起動経路・別entrypointの存在は未確認。
- `wrangler.jsonc` のPreview設定はProductionと同じD1 database IDおよびR2 bucketを指定している。さらにPreviewのQueue producer設定はProductionより少なく、Preview consumersも記載されていない。Previewは隔離テスト環境として扱えない。
- Queue本体の `SYSTEM_EVENT` は `handleSystemEventQueue` へ、Load Testは個別consumerへ、残りはService Usage consumerへ振り分けられる静的経路を確認。Queue実在状態、DLQ、retry、実際の配送・ack動作は未確認。

### 追加の高優先度候補
1. **Watchlist Cron起動経路欠落候補（P0）**: `runKingdomWatchlistJobs` は定義されているが、Workerの `scheduled()` からの呼出しが見つからない。ユーザーが設定した王国ウォッチリストが定期実行されない可能性。過去の実行ログ/別triggerは未確認。
2. **Retention起動経路欠落候補（P0）**: `runDataRetentionJob` は `runRetentionCleanup` とSystem Log archiveを呼ぶが、親関数のWorker入口からの呼出しが見つからない。Retentionの自動実行が保証されない可能性。
3. **History Emergency Buffer drain起動経路欠落候補（P0）**: importと実装はあるが、Worker入口から呼ぶ箇所が見つからない。Buffer内の退避履歴が自動排出されず滞留する可能性。
4. **Seeder/Roller起動経路欠落候補（P1）**: Kingdom Seeder / Ranking Roller / Alliance Roller / Player Rollerはexport/importがあるが、Cron/Queueからの呼出しが見つからない。Catalog Discoveryが動くことは全王国データ収集の定期実行を意味しない。
5. **Preview非隔離（P0・テストブロック）**: Productionと同じD1/R2を参照。Previewテストは引き続き実施しない。

### 進捗と制約
- **機能信頼性監査: 80%**。70%から今回のCron/Queue/関数呼出しの横断照合を完了した。残り20%は発見事項の優先度統合、接続・DB・権限・保持の候補の重複整理、監査結論と隔離テスト行列の最終化。
- これは静的監査チェックリストの進捗であり、実装完成率・本番正常率ではない。
- build、HTTP smoke、D1/R2/Queue実行、Browser E2E、Preview/Production testは未実施。
- コード/Migration/Workflow修正、デプロイ、本番D1更新、Queue操作、収集/負荷テスト、外部API呼び出しは行っていない。
- D1 Free reads最優先。広範囲な `ranking_snapshots` 取得クエリは追加・復活させない。
