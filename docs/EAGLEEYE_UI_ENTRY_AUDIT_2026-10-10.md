# EagleEye UI入口監査 — 2026-10-10

## 目的とルール

全24機能領域について、ユーザーが画面から機能に到達できるか、UI操作がAPIへ接続されるか、バックグラウンド機能はWorker/Cron/Queue等の起動経路があるかを監査する。

- 「入口あり」はリンク/ボタン/フォーム/route呼出しが静的に見つかったことを示し、正常動作を保証しない。
- 「接続確認」は静的なコード上の接続のみ。実ブラウザ/E2Eを実施した意味ではない。
- 自動処理はUI入口の有無ではなく、イベント/Cron/Queueからの起動経路を確認する。
- コード修正、Migration変更、デプロイ、本番D1更新、Queue操作、収集/負荷テスト、外部API呼び出しは行わない。
- D1 Free readsを優先し、広範囲な `ranking_snapshots` 取得クエリは追加・復活させない。

## 判定ラベル

- **UI入口あり・静的接続あり**: UIからリンク/操作先まで静的に追える。実動作は未確認。
- **UI入口あり・接続不一致候補**: UIはあるが、route/handler/import/APIの接続に疑義。
- **UI入口を確認できず**: 確認範囲ではUIリンクや操作を見つけられない。サブ画面からの到達可能性は別途調べる。
- **UI入口不要・起動経路要確認**: Cron/Queue/内部処理など利用者向けUIを必須としない機能。
- **未確認**: 対象画面・関連JS・動的リンクをさらに追跡する必要がある。

## 進捗の数え方

全24機能領域を10段階に分けて照合する。各10%到達時にユーザーへ報告し、根拠を本書に追記する。パーセントはこのUI入口監査の作業進捗であり、機能完成率ではない。

## 10%到達 — ホームナビゲーションとF01〜F03

### ホーム画面の入口

現行 `src/index.js` の `renderHome()` を静的に確認。

**主要メニュー（6）**
- `/kingdom/rankings` — ランキング
- `/player-watchlist` — プレイヤーウォッチリスト
- `/players` — プレイヤー検索
- `/kingdom` — 王国検索
- `/status` — システム状況
- `/my-player` — マイKingShot

**下部ナビゲーション（5枠）**
- ホーム `/`
- ランキング `/kingdom/rankings`
- 検索 `/players`
- ウォッチ `/player-watchlist`
- その他ドロワーを開くボタン

**「その他の機能」ドロワー**
- `/kingdom-watchlist` — 王国監視
- `/support` — サポート
- ADMIN/OWNERの場合のみ `/admin` — 管理
- OWNERの場合のみ `/owner` — Owner Control

**初回所見:** ホームに全24領域を個別に並べる設計ではなく、主要6項目＋ドロワー＋各機能内のサブリンクで入口を構成している。したがって、ホームに直接出ていないことだけで「入口なし」とは判定しない。各サブ画面、管理画面、機能間リンクを続けて追跡する必要がある。

### F01 — Discord OAuth / Session / Roles

- UI入口: 未ログイン時のホームプロフィールから `/api/auth/discord`。管理/Ownerメニューは認証ユーザーのロールに応じて表示。
- 静的判定: **UI入口あり・静的接続あり**。
- 未確認: Discord OAuth実行、callback、session cookie、ACTIVE/DISABLEDと各ロールの実HTTP挙動。

### F02 — Player Search / Profile / Refresh

- UI入口: ホーム主要メニュー `/players`。検索結果から `/player?governor_id=...` への遷移経路あり。Player ShellからウォッチリストやExport関連の操作がある。
- 静的判定: **UI入口あり・静的接続あり**。
- 未確認: 検索/詳細/refresh APIの実応答、空データ、API Pool枯渇、画面エラー状態。

### F03 — Player Compare

- UI入口: Player Watchlistで比較対象を選択し、`/player/compare?... `へ遷移するコードあり。ルーターにも `/player/compare` と `/api/player-compare` の分岐がある。
- 接続不一致候補: `src/index.js` の先頭で `normalizeCompareGovernorIds`、`buildPlayerCompareSeries` 等は `player-compare.js` からimportされるが、`handlePlayerCompareApi` と `renderPlayerComparePage` のimport/定義を確認できていない。未定義参照であれば当該routeの実行時に失敗する可能性がある。
- 静的判定: **UI入口あり・接続不一致候補**。比較画面の入口がない問題ではなく、遷移先ハンドラーの接続問題候補。
- 未確認: build/import、比較対象0/1/複数、片側欠損、認証なしの実行テスト。

## ここまでの結論

- ホームは主要機能への入口を持つが、全機能をホームへ直接並べる設計ではない。ドロワーとサブ画面リンクを含めて監査する。
- F01/F02は静的な入口を確認。
- F03はUI入口を確認したが、比較画面/APIの実装接続に重大な疑義がある。
- これは10%地点の部分結果であり、F04〜F24および全サブメニューの監査は継続する。
- 実行テスト・本番検証は未実施。


## 監査方針変更 — UI全面刷新を優先し、入口監査を停止

2026-10-10、ユーザー判断により、既存UIの入口・メニュー配置を網羅する監査はここで停止する。UIを全面的に作り直す計画があるため、現行UIの入口構成を細かく棚卸しする投資対効果が低い。

### 引き続き残す事項
- 本書の10%地点までの記録は、既存UIの参考資料として保持する。
- UI入口監査の進捗をこれ以上増やさない。全24機能領域をUI入口の有無で網羅する作業は行わない。
- 既存機能のroute/import/handler/API/DB/R2接続不備候補は、UIの配置問題とは分けて機能監査・テスト計画へ残す。
- Player Compareのhandler定義/import接続疑義は、UI刷新とは無関係な機能接続候補として既存の機能台帳に残す。
- UI刷新時は、現行の画面配置を引き継ぐことを前提にせず、機能台帳を根拠に新しい情報設計・画面構成を設計する。

### 次の優先対象
現行UIの入口網羅ではなく、静的監査で残ったP0候補を隔離環境で検証する準備に戻る。まず build/import/route resolution と、DDL/SQL列不一致候補、Player Compareの接続、Player Visibility認可、Owner Load Test export routeを優先する。

### 安全境界
コード変更、Migration適用、本番D1更新、デプロイ、Queue操作、データ収集/負荷テスト、外部API呼び出しは、この方針変更だけを理由に実行しない。ユーザーの明示承認と隔離環境確認を先に行う。D1 Free readsを優先し、広範囲な `ranking_snapshots` 取得クエリを復活させない。
