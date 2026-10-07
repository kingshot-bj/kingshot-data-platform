# EagleEye 引き継ぎ — 2026-10-07 / status 20h取得問題・次スレ調査開始

## 1. 今回の結論

ユーザーは iPhone ショートカットから以下を実行している。

`https://kingshot-data-platform.black-jack-kingshot.workers.dev/api/gateway/v1/status?range=20h`

手順:
1. URLの内容を取得
2. 「URLの内容」を保存
3. 保存ファイルを「システムログ.json」として取得

スクリーンショットでもURLが明確に `range=20h` になっているため、**20時間を指定する操作自体は正しい**。

しかし実際にChatGPTへ届いた最新JSONは:
- `status-55.json`
- 約216KB（215,888 bytes）
- 20時間分の巨大な履歴ファイルではなく、現在時点のStatus snapshot

したがって次スレでは、**「iPhone側の取得方法」ではなく、EagleEyeコード側で `range=20h` がなぜ約216KB程度のレスポンスになるのかを最優先で調査する。**

## 2. 取得済みファイル

最新:
- `status-55.json`
- 215,888 bytes
- gateway retrieved_at: 2026-10-07T10:02:30.853Z UTC
- System overall: DEGRADED
- load test active: false
- collection semaphore: active 0 / capacity 1000
- emergency buffer: pending 0
- API Pool: AVAILABLE 17 / ERROR 0 / REVOKED 6 / cooldown 0 / disabled 0
- latest watchlist job: COMPLETED
- kingdom catalog: IDLE / kingdomsSeen 2542
- kingdomRankingRoller / playerRoller / allianceRoller: IDLE / processedRuns 0

ただし、これは20時間履歴そのものではない。

## 3. 重要な比較材料

`status-53.json`:
- 約45MB
- 6時間取得は成功
- 実際のLoad Testイベント履歴を大量に含む

`status-55.json`:
- 約216KB
- 現在のStatus snapshotとしては正常
- 20時間のイベント履歴を期待したサイズ・構造ではない

つまり、
**6hでは大量データを返せるのに、20h指定では約216KBしか返らない**
という差が重要。

## 4. 次スレで最初にコード調査する対象

優先順位:

### A. `/api/gateway/v1/status` のrange処理
- `range=6h`
- `range=20h`
- その他range
- range値のparse
- 許可されるrange一覧
- 未対応rangeのfallback
- 最大期間へのclamp
- default rangeへのfallback

### B. System Log取得処理
- `system_event_log` のWHERE条件
- created_at / timestamp条件
- lookback秒数への変換
- LIMIT
- pagination/cursor
- 取得件数上限
- 「完全な期間」と「最新N件」の混在

### C. Status JSONのレスポンス生成
- systemLog
- event history
- loadTest history
- diagnostics
- queryInsights
- D1 usage
- R2
- API Pool
など各セクションの取得範囲を確認。

特に、
**range=20hを指定してもsystemLogだけ15分/一定件数しか返していない可能性**
をコード上で確認する。

### D. レスポンスサイズ制限・切り詰め
- Worker側のJSON生成
- Cloudflare Workers response制限
- 自前のMAX_BYTES / MAX_EVENTS / MAX_RESULTS
- truncate / slice / limit
- JSON stringify前後のサイズ制御
- status endpointの安全用上限

### E. 「20h」と「6h」で処理経路が変わる箇所
- range別分岐
- heavy query防止
- event log queryの上限
- historical aggregation
- status export専用処理
- timeout対策

### F. iPhoneショートカット側は最後
今回のスクショで `range=20h` を指定していることは確認できているため、まずサーバー側コードを調査する。
必要ならその後、Safari/ショートカットがHTTPレスポンスを保存する際の制約を切り分ける。

## 5. 既に判明している重要なStatus Query Insights

`status-55.json` では、過去のコード監査では「request-time DDLなし」と認識していたにもかかわらず、以下がQuery Insightsに出ている。

- ALTER TABLE data_retention_settings ADD COLUMN owner_audit_log_days...
- CREATE INDEX IF NOT EXISTS idx_system_event_log_created...
- CREATE INDEX IF NOT EXISTS idx_user_player_links_user_status...
- CREATE UNIQUE INDEX IF NOT EXISTS uq_user_player_links_active_main...
- CREATE INDEX IF NOT EXISTS idx_player_snapshots_observed_at...
- PRAGMA table_info(...)
- sqlite_master参照

これは**別モジュール/互換処理等でruntime DDLが実行されている可能性があるため、次の全コード調査で必ず追跡する。**

また:
- system_event_log INSERT: count 270,058 / rowsWritten 1,612,140
- system_event_log retention/archive SELECTも大量発生
- Other rowsRead が 140M超

このため、20h status取得問題とは別に、**System Log自体の生成・保存・取得がD1負荷へ与える影響**も確認対象。

## 6. Load Testの既知状態

Active run ID:
`62a59263-973d-4b00-a31c-ca25dfc81dd4`

6hログでは:
- targetCount 20
- topN 10
- concurrency 14
- apiConcurrency 14
- 20王国単位のWATCHLIST_JOB
- SUCCESS / FAILED / START重複 / MightPulse latencyを分析済み

主な傾向:
- API Pool hard failureよりMightPulse latencyが主要ボトルネック
- NO_API_POOL_KEY_AVAILABLEあり
- 同一job START重複あり
- 長時間MightPulse requestあり
- Global Collection Semaphore自体は1000枠で枯渇していなかった

現在のstatus-55ではload test active=false。

**ユーザーは既存パッチを当てて再テストし、症状再発するかを見る方針。Production deployは明示許可が出るまで実行しない。**

## 7. 設計上の重要ルール

- `ranking_snapshots` の広範囲読み取りを絶対に復活させない
- R2_ONLY維持
- API Pool / Global Collection Semaphore / Safety Gateを迂回しない
- 「コード実装済み」「GitHub main反映」「deploy済み」「本番確認済み」を厳密に分ける
- 本番未確認を確認済みと言わない
- D1 Rows Read / Rows Written削減を最優先
- Previewは現時点では優先しない。本番優先。

## 8. 次スレ開始時の一言

**「まず20hが216KBになる原因を実コードから調査。status endpointのrange処理 → system log取得範囲 → LIMIT/pagination → レスポンスサイズ制限 → 6hとの差分の順で洗う。」**

この問題を解決してから、20時間ログを使ったLoad Test全体分析へ進む。

## 2026-10-07 — 24h System Log single-file export implementation

- /status / Gateway の System Log は、指定期間の全件をレスポンスへ詰め込まない方式へ変更。
- Gateway のログ期間を 15m / 30m / 1h / 3h / 12h / 24h に統一。
- /status は最新500件を表示し、期間全体の件数を event_count で返す。500件を超える場合は truncated=true。
- 全期間のログ取得は管理者専用 /api/admin/system-log/export?range=24h を追加。
- D1を500件ずつカーソル取得し、R2へ 1本のJSONファイルとしてストリーム保存。巨大JSONをWorkerのレスポンスへ直接返さない。
- ダウンロード: /api/admin/system-log/export/download?key=...
- ADMIN / OWNER のみ利用可能。R2 binding が無い場合は明示的に失敗。
- 管理画面 /admin/system-log に期間選択と「24時間分を1ファイル取得」を追加。
- 既存 /api/admin/system-log に until パラメータを追加し、指定時間帯のログ取得も可能にした。
- 24h INTERNAL_ERROR の再発防止として、Gateway の全件 materialize を廃止。

### デプロイについて

- main への変更はすべてコミット済み。
- 2026-10-07 の直前ハンドオフ cd253b1... から main は7コミット先行。
- リポジトリ内には Cloudflare Workers の GitHub Actions デプロイ workflow は存在しないため、Cloudflare Dashboard 側の Git 自動デプロイ設定そのものはこのGitHub接続から変更できない。
- 今回は main へ全変更を流し込んだ状態。Cloudflare Git連携が有効ならpushをトリガーに反映される。別途GitHub Actionsを追加して二重デプロイにはしない。
