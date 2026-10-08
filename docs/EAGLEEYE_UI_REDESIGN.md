# EagleEye UI Redesign — BJにゃん v2

## 方針

- 既存のD1 / R2 / MightPulse / API Pool / Watchlist / Ranking APIを変更せず、UIレイヤーを刷新する。
- PCは左サイドバー、スマホは下部ナビを基本シェルとする。
- 共通Headerにユーザー名・ロール・通知を集約する。
- VIPは既存仕様どおりゴールド系で強調する。
- BJにゃんは画面の意味・状態に合わせて選択し、常時大量表示しない。
- 別スレで機能追加が進んでも、UI実装前にmain最新状態を確認して追従する。

## BJにゃん v2 マッピング

| UI | 素材 |
|---|---|
| ホーム / ダッシュボード | 033_dashboard |
| ランキング | 011_ranking_check |
| プレイヤー検索 | 012_player_research |
| 王国検索 | 013_kingdom_research |
| プレイヤー/王国Watchlist | 014_watchlist_monitoring |
| 成長検出 | 015_growth_found |
| 順位・状態変化 | 016_change_found |
| 通知 | 017_notification |
| システム状況 | 026_system_monitoring |
| ネットワーク/API | 037_network_status |
| 分析 | 034_analysis |
| データ確認 | 039_data_review |
| データ取得中 | 010_data_fetching |
| 同期 | 019_syncing |
| 完了 | 021_data_complete / 032_finished |
| 正常 | 023_all_green |
| 警告 | 004_warning |
| エラー | 005_error |
| 障害分析 | 024_error_analysis |
| 復旧 | 022_recovery |
| メンテナンス | 007_maintenance |
| ログイン | 027_login |
| 権限不足 | 028_permission_denied |
| 接続エラー | 029_connection_error |
| 新着データ | 030_new_data |
| ヘルプ | 031_help |
| 特別な成功 | 040_celebration |

## 実装順

1. UI Shell（共通Header / PC Sidebar / Mobile Bottom Nav）
2. Home Dashboard
3. Ranking
4. Player Search / Detail
5. Player Watchlist
6. Kingdom / Kingdom Watchlist
7. System Status / Data Collection
8. ロール/VIP表示の新シェルへの統合
9. 実機レスポンシブ確認
10. Preview → 本番

## 現在

- src/eagleeye-ui.js を追加。
- BJにゃん v2の意味別アセットマッピングとデザイントークンを定義。
- 既存ページの挙動はまだ変更していない。
- PNG本体は次のアセット導入コミットで public/assets/eagleeye/bjnyan/ に配置する。
