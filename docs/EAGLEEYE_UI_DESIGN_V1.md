# EagleEye UI Redesign Design v1

更新: 2026-10-08
ブランチ: ui-redesign/bjnyan-v2

## 1. 設計ゴール

EagleEyeを「機能が多い管理画面」から「KingShotデータプラットフォーム」として見やすく、スマホでも操作しやすいUIへ刷新する。

重要なのは、UI刷新をバックエンド刷新と混ぜないこと。

- D1 / R2 / MightPulse / API Pool / Cron / Watchlistの既存処理は原則変更しない。
- 既存APIレスポンスをUIのデータ契約として利用する。
- UI変更でD1 Readが増えないよう、表示目的の新規APIは原則追加しない。
- 共通テーマは一箇所で管理する。
- 別スレで機能コードが更新されても、最新mainとの差分を確認してからUIを追従させる。

## 2. 情報設計

### PC

左サイドバー:
1. ホーム
2. ランキング
3. プレイヤー検索
4. 王国検索
5. 王国ウォッチリスト
6. プレイヤーウォッチリスト
7. システム状況
8. データ取得状況
9. 障害・メンテナンス

管理系は下段へ:
- 管理画面
- Owner Control（OWNERのみ）

右上:
- グローバル検索
- 通知
- Discordユーザー
- 現在ロール
- テーマ切替

### モバイル

上部:
- EagleEyeロゴ
- 通知
- ハンバーガー

下部固定ナビ:
- ホーム
- ランキング
- 検索
- ウォッチリスト
- その他

「その他」から王国検索 / システム状況 / データ取得 / 管理系へ遷移。

## 3. 共通ビジュアル

### カラー

- Main Navy: #081324
- Panel: #0F1F35
- Raised Panel: #162A45
- Border: #27425F
- Text: #E5F2FF
- Subtext: #94A3B8
- Primary Cyan: #22D3EE
- Secondary Blue: #60A5FA
- Brand Gold: #FCD34D
- Success: #22C55E
- Warning: #FBBF24
- Error: #EF4444

ゴールドはブランド・VIP・重要ランキングのみ。画面全体を金色にしない。

## 4. 共通Shell

DOM概念:

<div class="ee-app">
  <aside class="ee-sidebar">...</aside>
  <div class="ee-main">
    <header class="ee-header">...</header>
    <main class="ee-content">...</main>
  </div>
  <nav class="ee-mobile-nav">...</nav>
</div>

既存HTMLを一気にこのDOMへ書き換えない。
まず共通CSS/JSとシェル生成処理を作り、ページ単位で段階移行する。

## 5. 共通Header

左:
- ページタイトル / パンくず

中央:
- プレイヤー名 / 王国名 / IDのグローバル検索

右:
- 通知
- Discordユーザー
- ロールバッジ
- テーマ切替

既存の全画面共通ロールバーは、新Header内のロール表示へ段階的に統合する。
ただし権限判定ロジックは変更しない。

## 6. ロール表示

階層:
BASIC → ADVANCED → VIP → ADMIN → OWNER

現在ロールのみ強調。

VIP:
- ゴールド文字
- ゴールドborder
- 小さなglow
- ⚡ VIP

ADMIN / OWNER:
- 管理者用アクセント

「Mightyユーザーですか？」の自己申告は使わない。
VIP判定は既存 /api/me/vip/mighty-check を維持する。

## 7. BJにゃん運用ルール

BJにゃんは「画面を埋める装飾」ではなく、状態・機能を伝えるUIマスコットとして使う。

### 主画面

ホーム:
033_dashboard

ランキング:
011_ranking_check

プレイヤー:
012_player_research

王国:
013_kingdom_research

Watchlist:
014_watchlist_monitoring

システム状況:
026_system_monitoring

分析:
034_analysis

ネットワーク/API:
037_network_status

### 状態

処理中:
010_data_fetching / 002_processing

成功:
003_success / 021_data_complete / 032_finished

全体正常:
023_all_green

警告:
004_warning

エラー:
005_error

変化:
016_change_found

成長:
015_growth_found

新着:
030_new_data

通知:
017_notification

復旧:
022_recovery

メンテナンス:
007_maintenance

### 表示ルール

- 大型ヒーローカード: 1画面1体まで。
- 通常ページ: 120〜236px程度。
- テーブル行や小カードには原則置かない。
- 状態変化時のみ差し替える。
- 画像がなくても情報が成立することを必須とする。

## 8. ホーム設計

最上段:
- EagleEyeの短いメッセージ
- BJにゃん dashboard
- 現在のシステム状態

2段目:
- 登録プレイヤー
- 登録王国
- Watchlist
- データ取得成功率

3段目:
- ランキングへの入口
- Watchlistへの入口
- プレイヤー検索
- 王国検索

4段目:
- 最近の変化
- 最近の取得
- 通知

既存APIで取れる値を優先し、新規集計APIは作らない。

## 9. ランキング設計

上部:
- ページタイトル
- 王国選択
- ランキング種別タブ
- 検索

ランキング本体:
- 順位
- 王国/同盟/プレイヤー
- 指標
- 前回比
- 詳細

上位:
- 1位: ゴールド
- 2位: シルバー系
- 3位: ブロンズ系
- 4位以降: 通常

ランキングの取得ロジックは変更しない。
特に ranking_snapshots の広範囲再取得をUIのために復活させない。

## 10. プレイヤー詳細

Hero:
- アバター
- 名前
- Governor ID
- 王国
- 同盟
- VIP
- Watchlist状態

主要指標:
- 総合戦力
- 役場
- キル
- 最終観測

Tabs:
- 基本情報
- ヒーロー
- 装備
- ランキング
- 変化履歴

変化表示:
前回 → 今回
順位:
前回何位 → 今回何位
を主役にする。

## 11. Watchlist

タブ:
- プレイヤー
- 王国

上部:
- 件数
- 追加
- 更新
- フィルター

行/カード:
- 対象
- 現在値
- 前回比
- 順位変動
- 最終観測
- 状態

変化がある場合のみBJにゃん状態画像を使う。

## 12. システム状況

最上段:
- 全体ステータス
- 最終更新
- BJにゃん system

サービスカード:
- API Pool
- MightPulse API
- データ取得ジョブ
- D1
- R2
- Google連携
- Discord連携

下段:
- 取得成功率
- 最近の診断
- 収集ジョブ状態
- エラー/警告

既存 /admin/diagnostics のデータを利用する。

## 13. レスポンシブ

Desktop:
>= 1100px: sidebar + content

Tablet:
768〜1099px: compact sidebar

Mobile:
< 768px:
- sidebar非表示
- bottom nav表示
- cards 1列
- tableは横スクロールではなく重要列優先
- BJにゃんを画面幅に応じて縮小

## 14. アクセシビリティ

- 色だけで状態を表現しない。
- statusには文字を併記。
- 画像altを設定。
- タップ領域は44px以上を目安。
- モーションは控えめ。
- prefers-reduced-motion対応。

## 15. パフォーマンス

- BJにゃん画像は必要な画面だけロード。
- 全40枚を一括ロードしない。
- loading=lazyを基本とする。
- UI導入でAPI呼び出しを増やさない。
- /api/me/advanced の共通ロール取得は将来最適化候補だが、今回のUI刷新で権限取得方式は変更しない。

## 16. 実装フェーズ

Phase 1:
共通Shell / tokens / responsive / role / header

Phase 2:
Home

Phase 3:
Ranking

Phase 4:
Player Search / Detail

Phase 5:
Watchlist

Phase 6:
Kingdom / System Status

Phase 7:
細部・アニメーション・アクセシビリティ

Phase 8:
実機確認 → Preview → 本番

## 17. 受け入れ条件

- 既存API/DB処理を壊さない。
- 新UI表示だけを理由にD1 Readが増えない。
- PC/iPhone双方で操作可能。
- BASIC/ADVANCED/VIP/ADMIN/OWNERの既存権限を維持。
- OWNER専用画面を一般ロールへ露出しない。
- BJにゃんは意味のある画面/状態でのみ表示。
- 既存機能へ到達できる。
- 別スレの機能更新をmain最新状態から取り込める。
