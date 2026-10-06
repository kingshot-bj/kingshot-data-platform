# EagleEye 開発引き継ぎ書 — 2026-10-05

## 0. 次スレ最優先事項

OWNER「王国Watchlist実処理負荷テスト」の本番E2Eがまだ成功していない。
最重要課題は、20王国・top10の負荷テストで、開始要求 → run/job作成 → processKingdomWatchlistJob起動 → API Pool lease → MightPulse API実行、まで実際に到達しているかを確定すること。

## 1. 負荷テスト固定仕様
- 20王国
- top10 Player Detail
- 26 ranking boards / kingdom
- Ranking: 20 × 26 = 520
- Player Detail: 20 × 10 = 200
- 合計: 720
- 720件を同時送信する意味ではない。
- API Pool leaseで空いた枠を次リクエストへ回す。
- 通常利用保護は1 key。
- API Pool available keysがNならLoad Test API concurrencyは原則N-1。
- 26固定上限を全体API concurrencyへ使わない。
- 26は1王国のranking board数であり、全体API concurrency上限ではない。

## 2. 直近のSafety Gate修正
Load Test開始時のplannedRequestsを全720件として評価すると、Safety Gateが720件を即時消費すると誤解して開始前にブロックする。
現在は plannedRequests = 1 とし、開始時Safety Gateは1 request相当で判定。実行中のAPI容量はAPI Pool lease + Load Test limiter等で制御する方針。
ただし、本番でSafety Gateを通過して実処理が開始したことは未確認。
関連commit: 37a751b9baa61015177449fa76cf9f5f9d58ed77 / 5e7b77b130328ea7ffadca6c92042a34c234726a

## 3. Dynamic Semaphore / Load Test
- 708d901fbe610b31d0592c13fb7d84e00f58c411: DEFAULT_CAPACITY 26 → 1000
- 37767382419f1f96b91d9161e53b9b76a09387af: Load TestのMAX_API_CONCURRENCY=26を削除
- ccbbe6a4cc50c1df1d380a58edcfb9002f572fff: migration 0034 capacity 26 → 1000
- 4d365fe31714f71e748f4c9368519d99abdc92ff: migration 0036 slot 26 → 1000
- 16b10618a0f5fd6579462b7758f9bc7363fe1fd8: reconcile scriptで1000 slots/capacityを保証
- 本番D1 schema reconciliation workflowはユーザー操作で全step greenを確認済み。
- ただしschema reconciliation成功だけでは最新Load Test runの開始成功を意味しない。

## 4. 現在のLoad Test limiter
src/admin-kingdom-load-test.js:
- apiLimiter=createLoadTestApiLimiter(apiConcurrency)
- apiLimiter.globalLimiter=null
- Load Test側local limiterをAPI concurrencyの正本とする。
- D1 Global Collection SemaphoreをLoad Test内で二重取得しない。

src/index.js:
- Load Test用apiLimiterがある場合、ranking/player concurrencyはapiLimiter.capacityを基準に決定。
- globalCollectionLimiterはLoad Testではnull。
- fetchWithLoadTestApiLimiter()でlocal limiter取得後にworkerを実行。
- NO_API_POOL_KEY_AVAILABLE等の場合は最大20回retry。

直近commit: 59df116f51fa45ba2b6c16f28196aadea3596ef5 / 9bc952d92d9a7852ec02ab74f61fb26fbe214be2 / b350e5e7dac39b34af4a42ea072d0066d031b22b

## 5. UI 0/520の解釈
画面がAPIクエスト 0 / 520のままでも、0/520だけではAPI未実行の証拠にならない。
理由: onProgressはprocessJobが1ステップを返した後に更新され、ランキング最初のbatchが終わるまでprogressが0の可能性がある。
ただし今回ユーザー側ではAPI Pool/API使用量も動いていないように見えており、実際にAPIへ到達していない可能性を優先して調査する。

## 6. 過去の起動障害
HTTP RouterでrequestTraceId未定義、executionContext未受け渡しの問題があった。
修正 commit: f8a668549bc83e6a79ff6bd33ca39f8651cec9f0
- fetch(request, env, executionContext)
- requestTraceId生成
- /api/owner/kingdom-load-testへexecutionContextを渡す

開始失敗理由をUI表示する修正: d5c64cd082a7f0600f85a5da

## 7. status-36.jsonの旧run
対象: status-36.json / Files file id file_00000000d9c48206814937ee5f0785df

旧run:
- runId: 8886a230-f399-4470-9b30-9246b6f424e3
- COMPLETED_WITH_ERRORS
- 20/20 kingdoms failed
- success_count=0 / failed_count=20
- elapsed_ms=3676
- concurrency=13
- api_concurrency=13
- available_pool_keys=14
- reserved_for_normal_use=1
- max_expected_ranking_rows=52000
- failure: D1_ERROR: no such table: collection_semaphore_slots: SQLITE_ERROR

これはschema不足時の旧run。D1 reconciliation後の現在runと混同しない。

## 8. status-36.jsonで次に確定すべきこと
24時間混在ログの可能性があるため、同じrun_id・同じ時刻帯で以下を相関する。
1. Load Test開始要求のSystem Log
2. run_id発行
3. kingdom_load_test_runs作成相当
4. LOAD_TEST:<run_id> Jobの存在/更新
5. processKingdomWatchlistJob相当の進行
6. API Pool lease / lease_job_id=run_id
7. MightPulse request
8. API成功/失敗

開始要求だけ存在してJob/APIイベントがないなら、開始APIまでは来ているがWorker/background job起動以降で停止している。

## 9. API Pool decrypt経路の重点監査
src/api-pool.jsのclaimApiPoolKeyはatomic UPDATE後、encrypted_keyをdecryptしてleaseを返す。
decryptはv1.<iv>.<ciphertext>形式、EagleEye API Pool Encryption v1: + pool secretからAES-GCM keyを導出し、configureApiPoolEncryption(env.EAGLEEYE_SESSION_SECRET)が必要。
decrypt失敗時はleaseがcallerへ返らず、MightPulse fetchまで到達しない可能性がある。
Job開始済みなのにAPI Pool/MightPulseがゼロなら、decrypt / session secret / encrypted_key形式を重点監査する。

## 10. 実行経路
handleOwnerKingdomLoadTestApi
→ runKingdomWatchlistLoad
→ processKingdomWatchlistJob
→ fetchWithLoadTestApiLimiter
→ fetchKingdomRankingThroughApiPool
→ fetchThroughWatchlistApiPool
→ leaseApiKey
→ mightPulseFetch
→ MightPulse API

## 11. 次スレ最初の実施順
Step 1: 現在runの起動事実をstatus JSON / System Log / Job状態から確定。
Step 2: 起動済みならJob → API Pool lease → lease_job_id → run_idを突合。
Step 3: leaseがあるのにMightPulseがない場合、decrypt / mightPulseFetch境界を監査。
Step 4: 必要な観測点だけ追加し、無条件でSafety Gateを緩めない。

## 12. 本番E2E成功条件
- Start API 200
- run_id発行
- kingdom_load_test_runs作成
- 20 kingdom jobs作成
- JobがRUNNING/進行状態
- API Pool lease発生
- MightPulse ranking API実行
- 520 ranking requests処理
- top10 Player Detail処理
- 720 total progress完了
- D1 Current更新
- Change Events
- R2 history
- System Log / System Status / System JSON
- API Pool lease最終解放
- Load Test History表示
- cancel安全停止
- reload後run state復元

この全体を確認するまで「負荷テスト成功」と言わない。

## 13. 絶対ルール
- 本番未確認を本番確認済みと言わない。
- code実装 / main / deploy / production E2Eを分離。
- ranking_snapshots広範囲readを復活させない。
- R2_ONLYを維持。
- D1 Rows Read/Write削減を優先。
- API key / secret / refresh tokenをUI・JSON・handoffへ出さない。
- 新機能はSystem Status + System JSON + System Logで観測可能にする。
- Load TestでもSafety Gateを無視しない。
- OWNERでも安全装置を突破できない。
- 通常利用保護1 key。
- API Pool concurrencyを26固定へ戻さない。
- 本番負荷テストの最小対象は20王国。

## 14. 次スレ冒頭
「2026-10-05 handoffから継続。まず現在のLoad Test runがジョブ開始まで到達しているかをstatus-36.jsonのrun_id相関で確定し、その後Job→API Pool→MightPulseの順で実行経路を潰す。0/520だけを根拠にAPI未実行とは判断しない。」

現時点では負荷テスト本番成功扱いではない。

## 15. 2026-10-05 System Log 相関・時刻観測の実装
今回、負荷テストの「開始 → Job → API Pool lease → MightPulse → 完了」をJSON/System Logだけで追えるよう、以下をmainへ実装した。

### 相関ID
- Load Test: `run_id` + Load Test root `trace_id`
- Kingdom Job: `job_id` + Job `trace_id`、parent = Load Test trace
- 個別API request: request `trace_id`、parent = Job trace
- API Pool: `lease_id`、`lease_job_id=job_id`、`runId`、`traceId`、`parentTraceId`
- MightPulse: 同一request `trace_id`、parent = Job trace、metadataに `runId/jobId/leaseId`

### 時刻
- System Log既存の `started_at / completed_at / elapsed_ms / created_at` を維持。
- MightPulseイベントは実リクエスト開始時刻・完了時刻を記録。
- API Pool success/failureイベントも実リクエスト開始時刻・完了時刻を記録。
- 相関IDはmetadataにも正規化して保存するため、System JSONから直接抽出可能。

### 実装commit
- `1d78703f449a8434a0cf01ca971e65e312a3fe91` — System Log correlation metadata normalization
- `6943cef496d4c89034f520d36dffb76533cf9bb4` — API Pool lease correlation
- `534991910b23748492810271f58a6a31f4f70dd8` / `b7f9fd9fb43db54d44d8d259de283f228de71669` / `d17ec23c8f8549e9f80d2385b52460219dca763e` — MightPulse correlation/timestamp logging
- `02d1c05db4273125a317c84288cdffca46cf891a` / `9f02805bae368a23718ad35fe0e6a9c8a9fa05c6 ` — Load Test context propagation
- `13bcc7475db1e819f01dd4ca59120cbda525ee20` / `70dbd01c9e776bead289f9fd051033868fcff14f` / `c89145f2530d4c4f36797b524b5b4754045602f8` — Job start/completion correlation
- `32854551b229feb2af4852dbc2e15bef791a4712` / `ea822f8bc22dd3511380899cb275b0a55264b1372` / `a5101dbb51416a733fbdb6b2f46c205045c10e3f` / `70e1f05fa2be797bb319670af7c40c492e67d3b9` — API Pool timestamp/trace propagation

### 注意
- これはコード実装完了であり、Cloudflare本番deploy・本番E2E成功確認とは別。
- 次はdeploy後に新しい20王国runを実行し、同一run_id/trace_idで Job → lease → MightPulse が連続して出ることを確認する。


## 2026-10-05 — 公開負荷テスト通知をOWNER詳細画面から分離

- OWNER専用の `/api/owner/kingdom-load-test/status` は詳細進捗取得用として維持。
- 全ユーザー共通のトップ画面通知用に、認証・権限不要の軽量 `GET /api/load-test/notice-status` を新設。
- 通知APIは `api_request_locks` の `OWNER_KINGDOM_LOAD_TEST` が現在有効かだけを確認し、runId・Job・API Pool情報などの内部情報は返さない。
- トップ画面 `renderHome()` は10秒ごとに通知APIをポーリングし、負荷テスト中だけ「現在、システム負荷テストを実施しています」を表示。終了・ロック消失で自動非表示。
- 通知API障害時は `active:false` 相当で処理し、公開トップ画面を壊さない。
- 実装コミット: `a0dd575b6e97afd7ad776547451c66e9f83a834c`（通知API）、`27c8b0b0d43fb82d93173117a09c2951aea48215`（トップ画面）。


---

## 2026-10-05 追加：System LogのGoogle Driveミラー + Gateway遡及時間選択

### Google Drive
- `src/retention.js` のSystem Log R2アーカイブ後、同じR2 `.ndjson.gz` オブジェクトをGoogle Driveへミラーする処理を追加。
- R2を一次保管とし、R2保存成功後にGoogle Driveへアップロードする。
- Google Drive側は既存の重複検出・サイズ検証を利用。
- Google Driveミラー失敗時もR2を保持したまま処理を継続し、System Log診断をWARNINGとして記録。
- `runDataRetentionJob()` から `googleDriveEnv: env` を渡すよう変更。
- `wrangler.jsonc` のrequired secretsに `GOOGLE_OAUTH_CLIENT_SECRET` / `GOOGLE_DRIVE_REFRESH_TOKEN` を明示。
- 実際のOAuth refresh tokenの有無・接続成功は本番環境で別途確認が必要。コードだけでユーザーOAuth同意を代行してはいけない。

### Gateway
- `/api/gateway/v1/status` のSystem Log遡及時間を選択式に変更。
- 対応プリセット：`15m`, `1h`, `6h`, `24h`
- デフォルトは `15m`。既存のショートカットはURL自体を変更せず、そのまま最新15分ログを取得可能。
- 24時間ログが必要なショートカットは `?range=24h` を付ければよい。
- 例：
  - 最新15分：`/api/gateway/v1/status`
  - 1時間：`/api/gateway/v1/status?range=1h`
  - 6時間：`/api/gateway/v1/status?range=6h`
  - 24時間：`/api/gateway/v1/status?range=24h`
- UI側の選択機能を追加しても、機械取得用URLは固定したままにする方針。iPhoneショートカットの操作性を落とさない。

### Commits
- `ddcffe9516b064f247011d2493a102106ac14eb5` — Google Drive mirror
- `7ed22aaacf863a6dc1d984838329c9794ae27002` — retention cronからGoogle Drive環境を渡す
- `3243ee642bcd8f0bd72e83429fd3c07a0634f904` — Google Driveミラー失敗をWARNING化
- `cf15daf53f9461a62fdc86acbd04e5de8babb59e` — Google Drive required secrets明示
- `c6b3c9f0328c02ba1106b649d0e3a79ed3aaca88` — Gateway遡及時間プリセット


## 2026-10-05 — OWNER負荷テストのCloudflare消費量履歴保存

### 目的
OWNERの王国Watchlist実処理負荷テストについて、各RunごとにCloudflareリソースの「開始前 → 終了後」差分を保存し、過去Runと比較できるようにする。

### 重要方針
- 履歴として保存するのは**プラン非依存の実測差分**。
- 「$5 Paidプラン前提」で消費率を保存しない。
- Run実行時点のCloudflare監視profileは参考情報として保持するが、保存値の割合計算には使用しない。
- Free / Paid $5等の比較基準は、履歴を表示するときに選択して再計算する。
- 将来別プランを追加しても、過去Runの実測データを作り直す必要はない。

### 保存対象
- D1 Rows Read
- D1 Rows Written
- D1 storage bytesの変化
- Workers Requests
- Workers CPU time（Cloudflare Analyticsから取得した値）
- R2 Class A operations
- R2 Class B operations
- R2 storage bytesの変化

Runには以下のJSONを保存する。
- `cloudflare_before_json`
- `cloudflare_after_json`
- `cloudflare_delta_json`

差分JSONにはリソースの**生の差分値のみ**を保存し、プラン別のlimit / percentageは保存しない。

### UI
OWNER負荷テスト履歴にはCloudflare消費量を既存履歴内で小さく表示する。
- 小型の `Free / Paid $5` 切替ボタンを用意。
- 選択した比較基準に応じて、保存済み実測値から表示時に割合を再計算する。
- $5 Paidを常時前提にはしない。
- 将来の別プラン追加時も比較基準だけ追加できる構造。

### System JSON / System Log
- Load Test COMPLETEイベントのmetadataに `cloudflareUsage` を追加。
- これによりSystem Log / GatewayのSystem JSONからRun単位のCloudflare消費量を追跡可能。
- API key等の秘密情報は保存しない。

### Queue対応
Queueが20王国単位で分割されても、開始前スナップショットはRun作成時に1回取得し、最終Queue chunk完了時に終了後スナップショットを取得する。
複数Queue chunkをまたぐRunの `elapsed_ms` はRun作成時刻から算出する。

### Migration / Commits
- `0044_kingdom_load_test_cloudflare_usage.sql`
- `2828698ae8c8176f39f5374ec2487f5563b1ca7d` — Cloudflare usage snapshot/delta persistence
- `57b30c6eae9949a7e0bd36f8294d321d4eae2096` — history UI rendering fix
- `1214dee66004390a8363e73e597eefcf9596bfbd1` — Queue chunk跨ぎのtotal elapsed修正
- `731c3fe2346657ecea92413a8a5521aee263a2f1` — Run start timestamp基準へ補正
- `3f9923b318e50840d2a51ad402ce864f08e5944c` — 初期migration実装
- `f70fcbd984040f67dba1f78e0aca79829ef91deb` — 履歴をプラン非依存化 + 小型Free/Paid $5比較切替

### 現在の注意
- コード上はCloudflare履歴の割合計算を固定$5保存方式から、表示時のプラン選択方式へ変更済み。
- ただし本番D1への `0044_kingdom_load_test_cloudflare_usage.sql` 適用確認はまだ必要。
- **本番E2E成功扱いにはしていない。**
- 次回負荷テスト前にmigration適用を確認し、100王国本番負荷テストでは20王国単位のRunを基準にCloudflare実測値を比較する。


## 2026-10-05 — Cloudflare監視期間を実請求サイクル基準へ変更

### 変更理由
- 旧実装のPaid監視は `UTC月初 → 現在` のカレンダー月集計だった。
- CloudflareのWorkers Paid / usage-based billingは実際の請求サイクルに沿って集計する必要がある。
- Cloudflare Billing APIは `billing_cycle_anchor_timestamp` を返せるため、これを正本としてEagleEye側の集計期間を決定する。

### 実装
- `src/cloudflare-analytics.js`
- Cloudflare Billing API:
  - `GET /accounts/{account_id}/billable-usage/info`
  - active subscriptionの `billing_cycle_anchor_timestamp` を取得。
- 現在時刻から、そのanchorに対応する「今回の請求期間開始」と「次回の請求期間開始」を算出。
- Paid (`PAID_5USD`) の以下を請求サイクル基準へ変更：
  - D1 Rows Read / Written
  - D1 Query Insights
  - Workers Requests / CPU
  - R2 Operations / Storage / Bandwidth
- Free profileは従来どおりUTC日次windowを使用。
- System JSONの `usagePeriod` と `monitoring.billingCycle` に以下を出力：
  - `cycleStart`
  - `cycleEnd`
  - `anchorTimestamp`
  - `billingDayUtc`
  - `periodBasis`
  - `subscriptionId`
- 請求サイクル取得失敗時は黙って「請求期間」と表示しない。
  - 現在は明示的に `CALENDAR_MONTH_FALLBACK_BILLING_UNAVAILABLE` として状態JSONに残し、WARNING化。
  - これは最終状態ではなく、Billing Read権限を設定した本番環境で `CLOUDFLARE_BILLING_CYCLE` が実際に取れることを確認する。

### Cloudflare API Token
- Billing API呼び出しにはCloudflareのAccount > Billing > Read権限が必要。
- 実装は `CLOUDFLARE_BILLING_TOKEN` が設定されていればそれを使用し、未設定なら既存の `CLOUDFLARE_ANALYTICS_TOKEN` をBilling APIにも試す。
- 推奨はAnalytics用とBilling用を分離し、Billing専用tokenにBilling Readだけを付与すること。
- token自体やsecret値はUI / JSON / handoffへ出さない。

### 実装コミット
- `a6b005b5e2f1b05d6ed690ebb976388b418aac10` — Billing cycle基準化
- `74face772aefbb1da5b502db4dd04aa2bd9dd065` — Billing cycle取得失敗時WARNING化
- `a67058be1ca1a28745d1bf0c6850f92e7b3346bf` — R2 bandwidthも請求期間基準へ統一

### 本番確認
- まだdeploy / 本番Status確認はしていない。
- 本番確認時は、Paid監視JSONで `usagePeriod.basis = CLOUDFLARE_BILLING_CYCLE` になっていることを確認する。
- `cycleStart` が実際のCloudflare請求日と一致することも確認する。
- Billing APIが403等の場合は、既存Analytics tokenにBilling Readを付与するか、`CLOUDFLARE_BILLING_TOKEN` を設定する。

- `5845c1258f251457757d5af3295b57c1f91f1c96` / `c13ef77fb04c0f4c368486a3f83d878f4fdb399` — System Status UIに実請求サイクル表示を追加。Paid時は `CLOUDFLARE_BILLING_CYCLE` を表示し、取得失敗時はフォールバック中であることを明示。


## 2026-10-05 — 負荷テスト検証・Change Event Read最適化（安全実装）

### 実装内容
- migrations/0045_change_events_player_lookup.sql
  - change_events に target_type / target_id / change_type / detected_at / created_at の複合Indexを追加。
  - データ行のINSERT/UPDATE/DELETEは行わず、既存データを破壊しないRead最適化。
- src/admin-kingdom-load-test.js
  - Queue完了時に kingdom_watchlist_jobs の件数・terminal状態・ranking/player rows合計をRun集計値と照合する検証情報をSystem Log metadataへ保存。
  - Run開始時刻から終了時刻までの change_events を target_type / change_type 別に集計し、Change Event内訳をSystem Log metadataへ保存。
  - Change Event内訳は同時間帯の通常利用イベントが混在する可能性があるため、metadataに changeEventBreakdownBasis を明示。既存Change Event自体は変更・削除しない。
  - Queue consumerの finally で、Run全体の elapsed_ms をconsumerチャンク時間で上書きしないよう修正。kingdom_load_test_runs.created_at をRun経過時間の正本として使用。
- totalElapsedMs の本番/main差分確認：
  - Queue完了分岐には既にRun開始基準計算が存在した。
  - ただし最終 finally UPDATE が Date.now()-startedAt で上書きする経路を確認したため、今回修正した。
  - これにより20王国単位Queue chunkを跨ぐRunでも、履歴の経過時間はRun全体を表す。

### データ安全性
- change_events の既存行は変更・削除しない。
- kingdom_load_test_runs / kingdom_watchlist_jobs の集計値は検証用SELECTのみで取得。
- Change Event内訳もSELECT集計のみ。
- 既存ランキング保存、previous_rank、removedTargets、R2_ONLY、API Pool lease/return処理には変更を加えない。
- 0045 migrationはIndex追加のみで、既存データ欠損を発生させるDMLを含まない。

### 実装コミット
- 4e04f16ceff1574dd93f966490d481fbc7882396 — Change Event複合Index追加
- 7c5df21719c1dff0c7e8f262df2a76d0ac8407cf — Load Test検証集計 + Change Event内訳 + elapsed修正
- a3fbd1fafc2dbf5fcc25363d8af216f746ed9624 — Load Test final elapsed更新の修復
- 7247c8439953c26920643206124fba0759ce92f2 — Change Event内訳集計を既存Index利用へ変更
- f9bbf426ee34e0e91a11d38038e5610ab3107455 — target_type別内訳を取りこぼさない集計へ修正

### 次の本番確認
1. 0045 migrationを本番D1へ適用。
2. Workerをdeploy。
3. 20王国負荷テストを実行。
4. System Log / System JSONで verification.summaryMatches = true を確認。
5. changeEventBreakdown の内訳とRun時間帯を確認。
6. elapsed_ms がRun開始からの全体時間になっていることを確認。
7. Change Event件数・ranking/player rowsとCloudflare実測差分を既存履歴と比較する。


## 2026-10-05 — 王国コレクション実績・取得済み管理（実装）

### 実装内容
- migrations/0046_kingdom_collection_stats.sql
  - kingdom_collection_stats を追加。
  - 王国ごとに初回取得、最終成功取得、累計成功取得、運営取得、ユーザー取得、最終取得元を保持。
  - 既存のランキング・Player・Change Event履歴は変更しない。
  - kingdom_watchlist_jobs.collection_source を追加し、Watchlist経由の取得元を OPERATOR / USER としてジョブ単位で保持。
- src/kingdom-collection-stats.js
  - 成功した王国取得だけを原子的にカウント。
  - 取得途中・失敗・キャンセルは「取得済み」にしない。
- src/index.js
  - 王国Watchlistの完全成功時にコレクション実績を記録。
  - Cron/System Watchlistは OPERATOR。
  - ユーザーの追加直後・手動更新は USER。
  - 既存ジョブ再開時も保存済み collection_source を使用するため、途中でCronへ引き継がれても元の取得主体を維持。
- src/kingdom-ranking-roller.js
  - 最終ランキングボードまで全成功した王国だけ OPERATOR として記録。
  - 部分ボード実行では取得済み扱いにしない。
- src/kingdom-seeder.js
  - 王国詳細取得成功時に OPERATOR として記録。
- src/admin-data-coverage.js
  - Adminのデータ登録状況に「Catalog登録王国 / 取得済み / 未取得 / 累計成功取得 / 運営取得 / ユーザー取得」を追加。

### 取得済み判定
- kingdom_catalog の登録王国数を母数とする。
- kingdom_collection_stats に1行存在する王国を取得済みとする。
- 成功完了時のみ1カウント。
- 既存履歴から過去の全取得回数を推定・再構築する処理は行わず、この実装以降の成功取得を正確に蓄積する。

### D1負荷・安全性
- カバレッジ画面は既存Catalogの件数と小さな集計テーブルだけを読む。
- players / kingdom_ranking_current を王国ごとに再走査する方式ではない。
- 既存のAPI Pool lease/return、ランキング比較、previous_rank、removedTargets、R2_ONLYの挙動は変更しない。
- 0046は既存データを削除・更新する移行ではなく、新規管理テーブルとJobの取得元列を追加する。

### 本番反映前の確認
1. 0046をD1へ適用。
2. WorkerをDeploy。
3. 小規模の王国Watchlist実処理を1件成功させる。
4. Admin「データ登録状況」で取得済み王国が1増えることを確認。
5. 同一王国を再取得し、取得済み王国数は増えず、累計成功取得だけ+1になることを確認。
6. 手動更新ではユーザー取得+1、Cron/ローラー/Seederでは運営取得+1になることを確認。
7. 失敗・中止では取得済み数・累計成功取得が増えないことを確認。

## 2026-10-05 — Load Test Run台帳を一次情報化・ログ取得経路を改善

### 背景
- status JSON / System LogにはQueue consumer、個別王国Job、API処理、D1処理などが同じrunId系列で混在するため、ログ検索だけでは「100王国Run全体の開始〜終了」を安全に復元しにくかった。
- 実際の100王国テストでも、20王国単位のQueue consumerが複数回記録され、consumer単位のelapsed_msをRun全体時間と誤認し得る状態だった。
- そのため、Run全体の計測・状態・完了時刻は kingdom_load_test_runs を一次情報とし、System LogはそのRunの開始・完了・失敗を補助記録する構成へ強化した。

### 実装
- src/admin-kingdom-load-test.js
  - Run作成直後に親Runの LOAD_TEST / RUN / STARTED System Eventを記録。
  - kingdom_load_test_runs.created_at をRun開始時刻の正本として使用。
  - Queue consumerが20王国単位で分割されても、各consumerのelapsed_msをRun全体時間として扱わない。
  - 全JobがterminalになったconsumerだけがRun完了を確定。
  - UPDATE ... WHERE status='RUNNING' の変更件数で完了確定権を1回に限定し、最後のconsumerが複数競合しても完了System Eventを重複記録しない。
  - consumer失敗時も、全JobがterminalならRunをFAILEDとして確定し、Run全体elapsed_msを finishedAt - created_at で保存。
  - 他consumerがまだ動いている場合はRunをFAILEDへ早期確定せず、残りのconsumerが継続できるようにする。
  - Change Event内訳のbasis表記を実際の検索条件 detected_at に修正。
- 既存の履歴APIは kingdom_load_test_runs.elapsed_ms を優先して返すため、今後の所要時間確認はログ時刻の推測ではなくRun台帳の値を使用できる。

### 計測上のルール
1. Run開始 = kingdom_load_test_runs.created_at
2. Run終了 = kingdom_load_test_runs.completed_at
3. Run所要時間 = kingdom_load_test_runs.elapsed_ms
4. Queue consumerの開始/終了時刻は「バッチ処理時間」であり、Run全体時間ではない。
5. System Logの LOAD_TEST / RUN / STARTED と COMPLETE/FAILED はRun台帳を監査・診断する補助記録。
6. status JSON / History APIはRun台帳を優先して表示する。

### 安全性
- 既存のランキング保存、Change Event生成、API Pool lease/return、R2保存、previous_rank、removedTargetsには変更を加えていない。
- 新しい処理はRunメタデータとSystem Logの記録・確定処理のみ。
- 個別Jobのデータを再取得したり、過去ログを再構築したりする処理は追加していない。


## 2026-10-05 — Kingdom Catalog方針確定

### 方針
- Kingdom Catalogは「既存D1から推定復元」ではなく、MightPulseの正規 /kingdoms Discoveryで一度取得して正式なマスターとして確立する方針。
- kingdom_catalog は単なる取得済み王国一覧ではなく、kid / name / status / region / language / raw_json / source_observed_at / first_seen_at / last_seen_at を持つ王国マスターとして設計済み。
- 既存の players / ranking から復元できるのは主にkid・観測時刻等で、status/region/raw_json等は正確な正規値として復元できない。
- 正式サービス開始前なので、今の段階で正規ソースからCatalogを確立する。

### リソース方針
- API使用量だけでなく、Cloudflare D1 Reads / Writes / Storage、Workers CPU / Requests、R2等の総リソースを考慮する。
- /kingdoms Discoveryは既存実装が1ページ最大24件のbounded処理。
- 初回Catalog構築後は、既存kidは更新、新規kidはINSERTという通常のCatalog運用にする。
- 不要な再全件Writeを前提にしない。

### 負荷テスト方針
- Catalog専用の新しい負荷テスト機能は作らない。
- Catalog初期化後は、現在の王国Watchlist実処理負荷テストをそのまま利用する。
- 負荷テスト対象は取得済み/未取得で除外せず、指定王国を実際に取得する。
- 既存/未取得を混在させ、実運用に近い負荷を測定する。
- 既存のRun台帳、Cloudflare使用量履歴、System Log、System JSON、Change Event内訳、Job完了検証を利用する。

### CatalogとCollection Statsの役割
- kingdom_catalog = EagleEyeが認識する王国マスター。
- kingdom_collection_stats = その王国を実際に取得した成功実績。
- Catalog登録済みでも未取得はあり得る。
- 0047の歴史的バックフィルはCollection Coverageの復元であり、Catalogそのものの復元ではない。

### 現在の状態
- 0046/0047は本番D1へ適用済み。
- kingdom_collection_stats は既存データから134王国をOPERATORの初回実績としてバックフィル済み。
- Admin「データ登録状況」で、Catalog登録王国=0、取得済み=134、累計成功取得=134、運営取得=134、ユーザー取得=0、ランキングデータが存在する王国=135を確認済み。
- Catalog登録0は kingdom_catalog がまだ正式Discoveryされていないため。

### 次スレ実施順
1. kingdom_catalog の現行migration/schemaとDiscovery実装を最終確認。
2. MightPulse /kingdoms Discoveryを正規経路で実行しCatalogを初期化。
3. D1/Workers/API等のCloudflare実測消費を確認。
4. Catalog初期化後、既存の王国Watchlist負荷テストを取得済み/未取得関係なく実行。
5. Run台帳・Cloudflare使用量履歴・System JSON・System Logで実負荷を評価。
6. 新規専用テスト機能は追加しない。

### 注意
- Catalog初期化前に既存D1から推定CatalogをINSERTする処理は追加しない。
- /kingdoms Discoveryは既存API Pool/Guard/Safety Gateを迂回しない。
- 取得済み/未取得判定を理由に負荷テスト対象を自動除外しない。
- 本番E2Eが成功するまで「負荷テスト成功」と断定しない。

## 2026-10-05 — MightPulse王国存在数の24時間更新

### 目的
- 「未取得王国」をEagleEye内のランキング保有数ではなく、MightPulseが返す実在・掲載王国数を母数として計算できるようにする。
- Catalog 0件を理由に「未取得0王国」と誤表示する状態を解消する。
- 既存の負荷テストや王国ウォッチリスト取得とは独立して、王国Catalogを24時間周期で更新する。

### 実装
- 既存 `runKingdomCatalogDiscovery()` を再利用。
- 新規 `src/kingdom-catalog-scheduler.js` を追加。
- Worker Cronは既存の5分トリガーを利用し、毎回APIを叩くのではなく、以下の条件で1ページだけ処理する。
  - Catalog更新サイクル未完了（`next_page != 1`）なら次ページを処理。
  - 完了済みで24時間未経過ならスキップ。
  - 24時間経過後はpage 1から次の全件走査を開始。
- 1回のCronで1ページ（最大24王国）のみ取得するため、1 Worker実行に大量APIリクエストを発生させない。
- `/kingdoms?page=N&size=24` は既存API Pool / Guard経由で取得する。
- 全ページ走査が完了して `next_page=1` に戻った時点で、`kingdom_catalog` 件数を記録した完了System Eventを追加。

### 未取得王国の母数
- `kingdom_collection_stats` の取得済み王国数を取得済みとして使用。
- `kingdom_catalog` の件数をMightPulse確認済み王国数として使用。
- Catalog更新完了後は、
  `未取得王国 = MightPulse確認王国数 - 取得済み王国数`
  として表示される。
- したがってCatalogが0件の初期状態では、未取得数は実際の母数がまだ取得できていない状態。Catalog Discovery完了後に正しい値になる。

### 安全性
- 新しい外部APIエンドポイントは追加していない。
- 既存の `/kingdoms` Discovery実装を再利用。
- 既存のランキング取得、プレイヤー取得、Change Event、API Pool lease/return、Load Test処理には変更を加えていない。
- 1ページ単位のBounded Discoveryを維持。
- MightPulse APIは1 Cronあたり最大1リクエストなので、5分Cronでも最大288リクエスト/日。全件走査完了後は24時間スキップする。

## 2026-10-06 — 王国Catalog / Collection Coverageの定義統一

### 目的
- UIの「把握済み王国」「取得済み王国」「未取得王国」の意味を明確化。
- 「取得済み王国」は、ランキングだけ・王国Seederだけの部分取得ではなく、EagleEyeの王国Watchlist処理でランキング取得から対象プレイヤー詳細取得まで到達した完全成功を意味する。
- 未取得王国は、ユーザー指定どおり **MightPulseで存在を把握した王国数 − EagleEye取得済み王国数** とする。

### 変更
- `src/kingdom-ranking-roller.js`
  - ランキング26ボード完了だけでは `kingdom_collection_stats` を増やさない。
  - ランキングRollerはランキングデータの収集状態だけを担当する。
- `src/kingdom-seeder.js`
  - `/kingdoms/:kid` の王国詳細取得成功だけでは `kingdom_collection_stats` を増やさない。
  - SeederはCatalog/王国current情報の更新だけを担当する。
- `src/index.js`
  - 既存の完全なRANKINGS→PLAYERSフローがterminal成功した箇所だけで `recordKingdomCollectionSuccess()` を実行する。
  - 失敗・中止・途中状態は取得済みにしない。
- `src/kingdom-catalog-page.js`
  - 全件SELECTを廃止。
  - 1ページ50王国のページング表示に変更し、カタログが増えても1画面で全件をD1から読むことを避ける。

### 既存データ
- `0047` でバックフィル済みの134王国は、その時点の既存ランキング＋Player実データを根拠とする歴史的OPERATOR実績として維持する。
- 今回の修正では既存のcollection_stats行を削除・再計算しない。
- 今後の部分取得では取得済み件数を増やさず、完全成功した王国だけが増える。

### Catalog更新周期
- MightPulse `/kingdoms` Discoveryは既存どおり5分Cronごとに1ページ（最大24王国）のbounded処理を継続する。
- 全ページ完了後、24時間経過するまで次の全件走査を開始しない。
- これはAPI/D1負荷を抑えるための安全設計であり、全件走査の所要時間は王国数に応じて変動する。
- Catalog Discoveryの外部API経路、API Pool、Guard、Safety Gateは変更しない。

### 安全性
- ranking_snapshotsの広域Readは復活させない。
- API Pool lease/return、Watchlistのランキング比較、previous_rank、removedTargets、Change Event生成、R2保存には変更なし。
- 既存Catalog / Collection Statsのデータ削除・破壊的migrationは行わない。


## 2026-10-06 — Catalog D1軽量Index + R2詳細保存 / 既存データBackfill

### 方針確定
- kingdom_catalog は検索・一覧・存在確認のためのD1軽量Indexとして維持する。
- 詳細な王国payloadはR2を正本アーカイブとする。
- kingdom_catalog.r2_latest_key から最新詳細アーカイブを参照できる。
- Discoveryは新規王国の追加検知を目的とし、既存Catalog行を毎回詳細更新しない。
- 既存行の詳細JSONは、別のbounded backfillで段階的にR2へ退避する。

### 0048
- migrations/0048_kingdom_catalog_r2_index.sql を追加。
- r2_latest_key と検索Indexのみを追加する非破壊migration。
- **本番D1への適用は未確認。** GitHub Actionsのmanual migration applyが必要。

### 0049 / Backfill
- migrations/0049_kingdom_catalog_r2_backfill.sql を追加。
- kingdom_catalog_r2_migration にcursor・状態・累計退避件数を保持し、途中失敗から再開可能。
- src/kingdom-catalog-r2-backfill.js は1回最大10王国だけ処理する。
- 各王国について **R2保存成功 → D1のraw_json/boards_jsonをNULL化** の順序を厳守。
- R2保存失敗時はD1詳細データを削除しない。
- Cronから自動実行しない。Owner専用 POST /api/admin/kingdom-catalog-r2-backfill から明示的に1バッチずつ実行する。
- 既にR2キーが設定された行は対象外。
- 0048/0049の本番適用前にBackfill APIを実行してはいけない。

### Discovery周期の意味
- 「24時間更新」は「既存Catalogを24時間ごとに全件更新」ではない。
- **新しく追加された王国が24時間以内にCatalogへ入ること**を目的とする。
- 現在は5分Cronごとに1ページ（最大24王国）を連続走査し、最終ページ後はpage 1へ戻る。
- 2540王国規模では通常約9時間の1周となるため、24時間以内の新規検知を満たす余裕がある。
- 外部APIは既存のPool/Guard経由のみ。Discoveryは1 Cronあたり最大1リクエスト。

### 安全性
- ranking_snapshots の広域Readを復活させない。
- 既存のRanking/Watchlist/API Pool lease/return/Change Event処理を変更しない。
- Backfillは最大10件/回のbounded処理で、R2成功前にD1データを消さない。
- 0048/0049本番適用完了を確認するまで、既存Catalogの詳細JSONを削除しない。
## 2026-10-06 — EagleEye機能拡張計画（全項目採用・実装進捗台帳）

### 目的
今回の現行コード全体監査、MightPulse公式API仕様、公開サイト確認を踏まえ、前スレで提案した機能を**すべて採用**する。
この章はユーザー向け資料というより、今後の実装セッションで「何を採用し、どこまで進んだか」をモデル自身が把握するための実装台帳として扱う。

状態は必ず以下を区別する。
- 未着手
- 実装中
- コード実装済み
- migration済み
- deploy済み
- 本番E2E確認済み
- 完了

コード実装済みだけでは完了扱いにしない。

# 1. 最終プロダクト方針

EagleEyeを単なるMightPulseデータ表示画面にはしない。

最終形は、
**王国 → 同盟 → プレイヤー → ランキング → 変化 → 履歴 → Watchlist → 通知**
を相互に辿れる調査・監視プラットフォームとする。

MightPulseはデータ供給元。
EagleEye独自価値は、横断検索、現在値、履歴、Watchlist、Change Event、ランキング変動、王国比較、同盟調査、Player調査、freshness、通知、API/Cloudflare消費管理に置く。

# 2. 採用機能一覧

## K01 Kingdom Catalog → Kingdom Portal
状態: 未着手

Catalogを王国探索の入口へ昇格。
- KID検索
- 王国名検索
- status/activity/power等のフィルタ
- ソート
- 50件ページング維持
- Catalogカード→王国詳細
- Catalogカード→王国Watchlist追加
- Watchlist登録状態表示
- 把握済み/取得済み/未取得表示

D1全件SELECTは禁止。検索は軽量Catalog Index、詳細はR2を利用する。

## K02 KID検索
状態: 未着手
KID完全一致検索を最優先で追加。D1の検索Indexを使用。

## K03 王国名検索
状態: 未着手
王国名検索を追加。部分一致等はD1負荷を考慮して実装。

## K04 Catalog Filter / Sort
状態: 未着手
活動度、Power、status等、Catalogに実際に保持している項目だけを対象にする。大量行をWorker側へ読み込んでから絞る方式は禁止。

## K05 Kingdom Detail
状態: 未着手

MightPulse /kingdoms/{kid} で確認できる値を中心に王国詳細を作る。
候補:
- KID / name
- opened_on / age_days
- power / avg_power
- player_count / active_players / active_7d / active_30d
- alliance_count
- health
- power_rank / activity_rank
- power_gain_7d / tc_pushers_7d
- gov_power / alliance_power / alliance_kills / kills
- hero_power / hero_total
- troop_power / building_power / research_power
- hero_no_equip / hero_equip
- governor_gear_power / governor_charm_power
- pet_power / island_prosperity
- migrant_score / mystic_trial / master_power
- board_totals

導線:
- Watchlist追加/解除
- 26ランキング
- 同盟一覧
- Top Player
- 王国比較
- Events（Mighty）
- KvK（Mighty）
- freshness

APIに存在しない値を推測で追加しない。公開サイトだけにある表示もAPI payloadで裏付けられない限り依存しない。

## K06 Kingdom Watchlist直追加
状態: 未着手
Catalog/Detailから1操作で追加。登録済みなら状態表示。
初回取得は既存Watchlist Job / Queue / API Pool / Safety Gateを再利用する。

## K07 Kingdom Ranking Explorer
状態: 未着手

26 boards:
alliance_power, alliance_kills, personal_power, kills, town_center, rebel_conquest, single_hero, hero_total, troop_power, building_power, research_power, hero_no_equip, hero_equip, gov_gear, gov_charm, pet_power, island_prosperity, migrant_score, mystic_trial, coliseum, forest_of_life, crystal_cave, knowledge_nexus, molten_fort, radiant_spire, master_power

Kingdom×boardの共有データとして扱う。Playerごとに26回取得しない。
Ranking行→Player Detail、Player Watchlist追加を可能にする。

## K08 Ranking → Player
状態: 未着手
ランキング行からPlayer Detailへ遷移。Governor ID/UID、name、alliance等を利用。

## K09 Ranking → Player Watchlist
状態: 未着手
ランキング行から直接Player Watchlist追加。既存Watchlist APIを再利用。

## K10 Player → Kingdom / Alliance
状態: 未着手
既存Player Detailから王国詳細・同盟詳細へ相互リンク。Playerを孤立ページにしない。

## P01 Player Watchlist統合
状態: 部分実装 / 拡張未着手
Kingdom/Ranking/Allianceから追加可能にする。
既存Change Event / previous_rankを利用して、
- 前回順位→今回順位
- UP/DOWN
- IN/OUT
- 変動幅
- 大幅上昇/下降
を表示。

## A01 Alliance List
状態: 未着手
Kingdomから同盟一覧。

## A02 Alliance Detail
状態: 未着手
API: /v1/alliances/{kid}/{tag}?include=info,roster
表示候補:
aid/name/abbr/kid/power/count/leader_name/leader_uid/leader_governor_id/flag_url/power_rank

## A03 Alliance Roster
状態: 未着手
RosterのUID/governor_id/fid/nick_name/power/town_center_level/kills/alliance_rank/label/kid/avatar_url/last_active_at/onlineを表示。
Roster→Player Watchlist追加。

## A04 Alliance相互導線
状態: 未着手
Alliance→Player、Player→Alliance、Kingdom→Alliance、Alliance→Kingdomを実装。

## C01 Kingdom Comparison
状態: 未着手
2王国以上を比較。
Power、Average Power、Player Count、Active、Alliance Count、Health、Rank、Power Gain 7d、TC Pushers 7d、各種power、Migrant Score、Mystic Trial、Master Power等。
履歴がある場合は成長差も比較。

## C02 Kingdom Momentum / Growth
状態: 未着手
power_gain_7d、tc_pushers_7d、active_7d、active_30d、health、Power、Activity Rankを使い「強い」だけでなく「伸びている」を可視化。
将来Score化する場合も各指標と計算根拠を表示。

## R01 Ranking Change Explorer
状態: 基盤あり / UI未着手
既存Change Event / previous_rankを使用。
前回→今回、UP/DOWN/IN/OUT、変動幅、最近動いたPlayerを表示。
過去ranking_snapshotsの広域SELECTは禁止。

## R02 Rank IN / OUT
状態: 基盤あり / UI未着手
圏外→圏内、圏内→圏外を明示。既存Change Eventを利用。

## F01 Freshness / Observation Status
状態: 未着手

EagleEye取得時刻とMightPulse側観測時刻を分離。
- EagleEye fetched_at
- provider observation timestamp
- section freshness
- last successful fetch
- stale/fresh/unavailable

MightPulseはPlayer/Allianceの各include sectionごとに鮮度判定され、最大60分程度古いデータが返る場合がある。stale sectionでは最大約90秒待つ場合がある。同一Player/Allianceへの同時要求は結果共有される。
したがって「EagleEyeが今取得した」と「MightPulse側で今観測された」を同一視しない。

## P02 Player Detail段階取得
状態: 未着手

現状の base,heroes,ranks,gov_gear 一括取得を監査。
base先行、ranks/heroes/gov_gearの必要時取得を検討。
ただし一括取得が安全なケースもあるため、API数だけで機械的に分割せず、
stale wait、API Pool占有時間、Worker CPU、D1、実測時間を比較して決める。

## F02 Top Player / concentration
状態: 未着手
Kingdom DetailにTop Player等を追加。
Top 10 power share等、公開サイトだけの値はAPI payloadで確認できた場合のみ採用。

## M01 MightPulse Events
状態: 未着手
Mighty専用。
GET /v1/kingdoms/{kid}/events
Event name/category/when/begin/endを表示。
403 mighty_requiredを権限不足として扱い、頻回取得しない。

## M02 KvK
状態: 未着手
Mighty専用。
/v1/kingdoms/{kid}/kvk
/v1/kingdoms/{kid}/kvk/scores
/v1/kvk/matchups
Season、Stage、Opponent、Previous Season、Scores、Days I-V等。
403 mighty_required、404 scores_unavailableを区別。
Scoresは5分周期更新仕様。

## W01 Watchlist追加直後の初回取得
状態: 未着手
「初回取得しますか？」を提示。
新規取得機構は作らず、既存Watchlist Job / Queue / API Pool / Safety Gateを使用。
完全成功時のみCollection Statsへ記録。失敗/中止は取得済みにしない。

## N01 Watchlist Analytics
状態: 未着手
Watchlist対象の順位変化、王国変化、取得成功率、freshness等をまとめる。

## N02 Discord通知
状態: 未着手
Phase 3。
Player rank change、IN/OUT、Kingdom health/momentum change、Watchlist取得失敗、KvK/Event更新、大きなChange Event等。
通知判定はChange Event / Watchlist起点。毎回全データを取り直す方式にしない。

# 3. MightPulse仕様を実装基準として固定

認証:
- Bearer kss_...
- X-Api-Key
- Base https://api.mightpulse.com/v1

Rate limit:
- 通常 60 requests/min/key、5,000/day/key
- Mighty 120/min/key、10,000/day/key

Player:
- /players/{id}?include=base
- /players/{id}?include=base,heroes,ranks,gov_gear
- id_type=uid

Alliance:
- /alliances/{kid}/{tag}?include=info,roster

Kingdom:
- /kingdoms?page=1&size=24
- /kingdoms/{kid}
- /kingdoms/{kid}?include=boards&limit=100
- /kingdoms/{kid}/ranks?limit=100
- /kingdoms/{kid}/ranks?board=pet_power&limit=50

Errors:
401 key不正/欠落
403 権限不足
404 entity不明 / scores未公開
429 rate limit

API Poolの全体concurrencyと、MightPulseの1 key rate limitを混同しない。

# 4. 実装順序（固定）

## Phase 1 — Kingdom探索基盤
1. K02 KID検索
2. K03 王国名検索
3. K04 Filter/Sort
4. K05 Kingdom Detail
5. K06 Watchlist追加
6. K07 Ranking Explorer
7. K08 Ranking→Player
8. K09 Ranking→Player Watchlist
9. K10 Player→Kingdom/Alliance
10. K01 Portal化の最終UI統合

Phase 1完了条件:
- KIDから王国を探せる
- 王国詳細を開ける
- Watchlist追加できる
- 26 boardsを見られる
- Playerへ遷移できる
- Playerから王国/Allianceへ戻れる
- 既存取得基盤を壊していない

## Phase 2 — 調査機能
A01 → A02 → A03 → A04 → C01 → C02 → R01/R02 → F01 → P02 → F02

## Phase 3 — Mighty / Monitoring
M01 → M02 → N01 → N02

# 5. データ設計原則

D1:
現在状態、検索Index、軽量メタデータ。

R2:
詳細payload、history、archive。

Google Drive:
R2長期ミラー。

Change Events:
変化検索・通知。

Collection Stats:
Catalog登録と取得成功を分離。

絶対ルール:
- ranking_snapshots広域Readを復活させない
- D1全件SELECTをしない
- Catalogはページング
- R2保存成功前にD1詳細を消さない
- API Pool / Safety Gateを迂回しない
- OWNERでも安全装置を突破しない
- 通常利用分をAPI Poolから保護
- key単位rate limitを尊重
- 同時実行数とHTTP request数を混同しない
- stale waitを含めAPI Pool占有時間を評価
- secretをUI/JSON/Log/Handoffへ出さない

# 6. System Status / System JSON / System Log必須

今回採用する全機能は、実装時に必ず観測可能にする。

System Status:
- enabled/disabled
- last success/failure
- count
- freshness
- API Pool state
- MightPulse permission state（必要な場合）

System JSON:
- 機械検証可能な状態値
- start/end
- counters
- error code
- correlation ID

System Log:
- START
- SUCCESS
- FAILURE
- duration
- correlation ID
- relevant metadata

UIだけに状態を持たせない。

# 7. 既存実装との接続

再利用する:
- Kingdom Catalog
- Kingdom Watchlist
- Player Watchlist
- Player Detail
- Player Compare
- Kingdom Ranking
- Change Events
- API Pool
- Queue
- Collection Stats
- R2 archive
- Cloudflare usage history
- System Status
- System JSON
- System Log
- Google Drive mirror

新規主領域:
- Kingdom Detail route/UI
- Ranking Explorer UI
- Alliance routes/UI
- Kingdom Comparison
- Momentum
- Ranking Change UI
- Events/KvK client + UI
- Freshness model/UI
- Watchlist cross-links
- Discord notification

# 8. 進捗台帳

| ID | 機能 | 現在状態 | 本番確認 |
|---|---|---|---|
| K01 | Catalog Portal化 | 未着手 | 未確認 |
| K02 | KID検索 | 未着手 | 未確認 |
| K03 | 王国名検索 | 未着手 | 未確認 |
| K04 | Filter/Sort | 未着手 | 未確認 |
| K05 | Kingdom Detail | 未着手 | 未確認 |
| K06 | Watchlist直追加 | 未着手 | 未確認 |
| K07 | Ranking Explorer | 未着手 | 未確認 |
| K08 | Ranking→Player | 未着手 | 未確認 |
| K09 | Ranking→Player Watchlist | 未着手 | 未確認 |
| K10 | Player→Kingdom/Alliance | 未着手 | 未確認 |
| A01 | Alliance List | 未着手 | 未確認 |
| A02 | Alliance Detail | 未着手 | 未確認 |
| A03 | Alliance Roster | 未着手 | 未確認 |
| A04 | Alliance相互導線 | 未着手 | 未確認 |
| C01 | Kingdom Comparison | 未着手 | 未確認 |
| C02 | Kingdom Momentum | 未着手 | 未確認 |
| R01 | Ranking Change Explorer | 基盤あり/UI未着手 | 未確認 |
| R02 | Rank IN/OUT | 基盤あり/UI未着手 | 未確認 |
| P01 | Player Watchlist統合 | 部分実装 | 未確認 |
| P02 | Player段階取得 | 未着手 | 未確認 |
| F01 | Freshness | 未着手 | 未確認 |
| F02 | Top Player/concentration | 未着手 | 未確認 |
| M01 | Events | 未着手 | 未確認 |
| M02 | KvK | 未着手 | 未確認 |
| W01 | 初回取得Prompt | 未着手 | 未確認 |
| N01 | Watchlist Analytics | 未着手 | 未確認 |
| N02 | Discord通知 | 未着手 | 未確認 |
| O01 | System Status観測 | 各機能必須 | 未確認 |
| O02 | System JSON観測 | 各機能必須 | 未確認 |
| O03 | System Log観測 | 各機能必須 | 未確認 |

# 9. 実装セッションの固定手順

1. この台帳を読む。
2. 現在mainを確認。
3. 既存実装を再利用できる箇所を確認。
4. 必要最小限を実装。
5. コード検証。
6. migration確認。
7. commit。
8. deploy。
9. 本番E2E。
10. System Status / JSON / Log確認。
11. この台帳の状態を更新。
12. 次スレへ移るなら必ずhandoffへ進捗追記。

「実装したつもり」でCompletedにしない。本番E2E確認まで完了扱いにしない。

# 10. 次に着手する具体的作業

Phase 1 K01〜K10から開始する。

最初に現行mainの以下を再確認:
- src/kingdom-catalog-page.js
- src/index.js
- Kingdom Catalog route
- Kingdom Watchlist API
- Kingdom Ranking API/UI
- Player Detail route/UI
- Player Watchlist API/UI
- src/mightpulse.js
- src/data-collection-engine.js
- 関連migration/schema
- docs/mightpulse-ranking-data-map.md
- docs/I-3_MightPulse_API_Integration.md
- docs/EAGLEEYE_DATA_ARCHITECTURE.md

既存実装があるものは再実装せず、UI/route/導線を追加する。


# 2026-10-07 — Kingdom Portal / 調査・監視機能 30工程コード実装一巡

## 今回の進捗
- **全体: 30/30 コード実装一巡**
- Phase 1: Kingdom探索基盤 10/10
- Phase 2: Alliance / Comparison / Momentum / Ranking Change / Freshness / Player統合・段階取得 12/12
- Phase 3: Mighty / Watchlist初回取得 / Watchlist Analytics / Discord通知 5/5
- 横断観測: Portal System Log / Portal System JSON status / feature observability 3/3
- ただし「完了」ではない。**本番Deploy・migration適用・本番E2Eは未確認**。

## 今回の主な実装
### Kingdom Portal
- `src/kingdom-portal.js` 新設
- `/kingdom?kid=` Kingdom Detail
- `/kingdom/rankings?kid=&board=` 26ランキングExplorer
- `/kingdom/changes?kid=&board=` 前回順位→今回順位 / UP / DOWN / IN/OUT表示
- `/kingdom/alliances?kid=` Alliance List
- `/alliance?kid=&tag=` Alliance Detail / Roster
- `/kingdom/compare?kid=&kid=` Kingdom Comparison
- `/kingdom/mighty?kid=` Mighty Events / KvK（明示的Mighty有効化時のみ）
- `/kingdom-watchlist/analytics` Watchlist Analytics
- `/api/kingdom-portal/ranking`
- `/api/kingdom-portal/status`

### Kingdom Catalog
- `src/kingdom-catalog-page.js` を検索Portal化。
- KID完全一致、王国名部分一致。
- 50件ページング維持。
- KID / 名前 / 最終更新順ソート。
- 詳細は `/kingdom` へ遷移。
- D1全件SELECTは禁止、検索条件付き+LIMIT/OFFSETを維持。

### Player
- Player DetailからKingdom / Allianceへ戻る導線追加。
- RankingからPlayer Detailへ遷移。
- RankingからPlayer Watchlistへ直接追加。
- Player取得を段階化:
  - 通常: `include=base`
  - 明示的詳細取得: `include=base,heroes,ranks,gov_gear`
- `/player?rich=1` を詳細取得導線として追加。
- API Pool経由を維持。

### MightPulse
- `getMightPulseKingdomEvents`
- `getMightPulseKingdomKvk`
- `getMightPulseKingdomKvkScores`
- Events/KvKは `MIGHTPULSE_MIGHTY_ENABLED=true` の明示設定がない限り外部APIを呼ばない。
- 有効化時も `collectMightPulseThroughGuards` → API Pool経由。
- API Pool直接迂回なし。

### Discord通知
- migration: `0052_discord_notification_state.sql`
- `src/discord-notifications.js`
- `DISCORD_NOTIFICATION_CHANNEL_ID` が未設定なら通知処理は無効。
- Change Eventをbounded取得し、notification stateで重複送信を抑止。
- scheduled handlerへ接続。
- Discord送信は既存 `discord-support.js` の認証経路を再利用。

### 観測
- Portal ranking APIでSystem Log `service=kingdom_portal` を記録。
- `/api/kingdom-portal/status` でCatalog件数と直近Portal eventをJSON取得可能。
- Mighty / Discord notificationもSystem Logへ記録。
- 新機能は既存System Log / Gateway JSONから追跡可能。

## 主要コミット
- `a2c0a42146d49817eb436e2723c1d45651c1d3d2` Kingdom Portal基盤
- `33bf21ee105666c7ffdf15e245fd35ef402417b8` Portal route
- `fe5df48824a661a514509443f943a33023a0e640` Catalog検索
- `df7a2dbf1b875dbcc8c4a9dbaba3eb2451c8a5dc` Player逆導線
- `9d20502fcf05b001e0f53e788bb527fcbd58a43a` Ranking Change Explorer
- `db99d68c3c7ae66895877684eff66eec63c5d5c2` Ranking Change route
- `073466e81d7e98333526d673e0bdc136eeaa923c` Player staged fetch
- `3f92da83d888c8c48f63310a67efbdda4ab6f6bd` Player staged UI
- `566aa9754a8c396eef220799bd21b908f195a613` MightPulse Events/KvK client
- `74b705b750e1a49673db9e61250828f9a7525506` Discord notification helper
- `91e9ff44e3d50c7d3fe7cb7b512ed58dab63a2de` notification migration 0050
- `46ce66ae1ac8887c7d26612fdfc4305b384779f6` Discord notification worker
- `6e32fd4823ed27a1c7f8e9e6078d16467cc9c1f0` scheduled notification hook
- `4d181935bf6857da6f2707233d6d017f1657c3cd` Watchlist Analytics
- `e4a4b2a42e2f25d0e494fc442e9a5dc1354d1617` Analytics route
- `f48567248932d0ba5bac8430df1e9cb1a0af6cd1` Analytics active-user auth fix
- `10f521f9967a2a1c0df3258b527ead1107cd1137` guarded Mighty page
- `d5548c4067449e7aef8c188190a1c2be4693a6ef` Mighty route
- `8408a0092f5391edbd7c0fc72101d5cbe374e414` Mighty navigation
- `87513287f311e7b104acc98adbe6d1a71b3bd36f8` Portal observability
- `ef052241d5f8240cbc9715069787cb4d77550f8a` Portal status route

## 検証
- `src/kingdom-portal.js`: syntax-check PASS
- `src/index.js`: syntax-check PASS
- `src/mightpulse.js`: syntax-check PASS
- `src/discord-support.js`: syntax-check PASS
- `src/discord-notifications.js`: syntax-check PASS
- `src/kingdom-catalog-page.js`: syntax-check PASS
- migration SQLは非破壊のCREATE TABLE/INDEXのみ。

## 本番反映状態
- **今回のコードは本番Deployしていない。**
- Cloudflare Workers BuildsのDeploy commandはユーザー操作で `npx wrangler versions upload` に一時変更済み。
- これによりGit push時はVersion uploadのみで、Active Deploymentへ自動昇格しない運用。
- 実機負荷テストは現行Active Deploymentを対象として継続可能。
- Cloudflare公式仕様上、`versions upload` はVersionを作るが即時Deployしない方式。Deployは別操作。

## 次回、本番反映前に必ず行うこと
1. migration 0048/0049の本番適用状態を再確認。
2. migration 0050を本番適用。
3. `MIGHTPULSE_MIGHTY_ENABLED` はMighty契約・キー確認後のみ設定。
4. `DISCORD_NOTIFICATION_CHANNEL_ID` は通知先確認後のみ設定。
5. Deploy前に現在の実機Load Test Runが終了していることを確認。
6. Version upload後、Version URLでSmoke Test。
7. Active Deploymentへ手動Deploy。
8. Kingdom Catalog → Kingdom Detail → Ranking → Player → Alliance → WatchlistをE2E確認。
9. System Status / Gateway JSON / System LogでPortal観測を確認。
10. その後、既存20王国Load Testを再実行し、既存Watchlist経路にRegressionがないことを確認。
11. migration 0050未適用のまま通知channelを設定しない。
12. 本番確認までは「完了」扱いにしない。

## 絶対ルール再確認
- `ranking_snapshots` 広域Readを復活させない。
- R2_ONLYを維持。
- Catalogはbounded read。
- API Poolを迂回しない。
- Mighty機能は明示有効化なしに外部APIを呼ばない。
- Secrets/API keysをUI・JSON・Log・handoffへ出さない。
- 実機Load Testと新機能Deployを混同しない。


# 2026-10-07 — Deploy前コード総点検・ブラッシュアップ追記

## 現在の判定
- **30/30: 実装対象コードの一巡済み**
- **コード監査: 継続中**
- **本番Deploy: 未実施**
- **D1 0052 migration: 未適用**
- **本番E2E: 未実施**
- Cloudflare Workers BuildsのProduction Deploy commandはユーザー操作で `npx wrangler versions upload` に変更済み。Git pushでVersion作成は進むがActive Deploymentは更新しない運用。

## 今回の監査で修正した重要事項
1. Discord通知migrationの番号重複を修正。
   - 旧: `0050_discord_notification_state.sql`
   - 新: `0052_discord_notification_state.sql`
   - 旧ファイルは削除済み。
   - 既存 `0050_alliance_catalog_r2_index.sql` / `0051_players_r2_index.sql` を維持。
2. Kingdom Catalog
   - KID完全一致
   - 王国名検索
   - Status filter
   - Sort
   - 50件表示 + 51件先読み方式
   - `COUNT(*)` と Status DISTINCT を撤去して検索時の全Catalog row readを削減。
   - Catalogカードから直接王国Watchlist追加。
   - inline script構文エラーを修正。
3. Kingdom Portal
   - Ranking board stateの行数表示を `checked_rows` ベースへ修正。
   - Alliance rankingを `kingdom_ranking_current` から表示できるfallbackを追加。
   - Alliance DetailもCatalog未生成時にcurrent rankingから基本情報を表示。
   - 既存R2 backfill前のlegacy Catalogについて `raw_json` fallbackを追加。
   - Kingdom比較を最大4王国のR2 current payloadからPower / Active / Growth / Health等を比較するbounded処理へ変更。
   - Ranking表示で `target_type` を明示取得し、AllianceをPlayerとして誤リンクしないよう修正。
   - System Status用の誤った `system_events` テーブル参照を実在する `system_event_log` に修正。
4. Ranking Change
   - `getKingdomRankingChanges()` が計算していた `rankingChanges` をD1 `change_events`へ永続化。
   - 2回目以降のみ `RANK_IN`, `RANK_OUT`, `RANK_CHANGED` を記録。
   - 初回baselineではINイベントを発生させない。
   - R2失敗時はcurrent/event writeを実行せず、既存R2_ONLY safetyを維持。
   - Ranking Change UIはboard check timeにboundedしてChange Eventを読む。
5. Discord通知
   - Player WatchlistだけでなくKingdom Watchlist配下のPlayer/Allianceも対象。
   - `INSERT OR IGNORE` によるnotification claimを先に行い、Cron重複時の二重送信を防止。
   - Discord送信失敗時はclaimを削除して次回retry可能。
   - `DISCORD_NOTIFICATION_CHANNEL_ID` 未設定時は完全無効。
   - Diagnostic + System Logの両方へ記録。
6. System Status / JSON
   - `kingdomPortal`
   - `kingdomMighty`
   - `discordNotification`
   を `getOperationalStatus()` に追加。
   - 既存System Status collector UIにも表示。
   - System JSON経由でも取得可能。
7. Mighty
   - Events / KvKは `MIGHTPULSE_MIGHTY_ENABLED=true` が明示されない限りAPIを呼ばない。
   - 有効化時も `collectMightPulseThroughGuards` 経由でAPI Pool + global semaphoreを通す。
   - System Logに `kingdom_mighty` START/COMPLETEを記録。

## 構文検証
以下をGitHub mainの現行内容からimport/exportを除いたWorker JSとしてparseし、全件PASS:
- `src/kingdom-portal.js`
- `src/kingdom-catalog-page.js`
- `src/ranking-store.js`
- `src/discord-notifications.js`
- `src/status-ops.js`
- `src/index.js`

追加で通知SQL / Ranking Change SQLをSQLiteで構文・JOIN条件検証済み。

## D1 / R2安全確認
- 新規Portal / Catalog / Notificationコードから `ranking_snapshots` の広域readなし。
- Ranking historyの既存R2_ONLY pathは維持。
- Catalog詳細はR2優先、legacy raw_jsonはR2 backfill前のbounded fallbackのみ。
- Kingdom comparisonは最大4王国だけR2 GET。
- Catalog pageはCOUNT全表readをしない。
- Notification stateはprimary keyで重複claimを抑止。
- Secrets/API keysをUI/JSONへ出していない。

## Deploy前に残る必須確認
1. Production D1 `d1_migrations` の0048/0049/0050/0051適用状態を確認。
2. `0052_discord_notification_state.sql` をProductionへ適用。
3. Migration適用後に通知state table/indexを確認。
4. 現在の実機Load Test Runを終了・結果確定。
5. Workers Buildを `npx wrangler versions upload` のまま成功させ、Version URLでSmoke Test。
6. Version URLはproduction resourcesを使うため、書き込みを伴うSmoke Testは対象を限定する。
7. Kingdom Catalog → Detail → Ranking → Player → Alliance → Watchlist E2E。
8. Ranking Changeを2回目の取得でRANK_CHANGED / IN / OUTまで確認。
9. Discord通知はテストChange Eventで1回だけ送信されることを確認。
10. System Status / System JSON / System Log / Diagnosticで新機能を確認。
11. 問題なければActive Deploymentへ手動Promotion。
12. Promotion後に既存20王国Load TestをRegression実行。

## Cloudflare運用メモ
- Workers Buildsの `npx wrangler versions upload` はVersionを作成するがActive Deploymentを更新しない。
- D1 migrationはWorker Versionとは別管理なので、`0052`適用をDeploy前に別途行う。
- Version URLはproduction resourcesを使うため、Previewと同一視しない。


## 追加監査修正
- Catalog paginationをさらにread-bounded化。全件COUNT/DISTINCTを廃止し、50+1件方式へ変更。
- Kingdom Detailのranking board rowsを`checked_rows`/changed_rowsから表示。
- Alliance ranking fallbackに`target_id`を含め、Catalog未生成時でもリンク先を安定化。
- Alliance DetailはCatalog/R2がない場合もranking_currentから基本情報を表示。
- 現行BOARDS定義は26件を再確認済み。
- 現行主要6 JSの構文チェックを再実施しPASS。
- 通知/RANKING CHANGE SQLをSQLiteで再検証済み。


# 2026-10-07 — 再監査（全コード再チェック）

## 再監査結果
- mainの全ファイル棚卸し: **139 files**
- src JavaScript: 全46ファイルを対象に構文監査。import/export除去後のparse検証を分割実施し、実コード上の構文エラーは検出なし。
- `src/data-collection-engine.js` はmultiline importを含むため専用除去ロジックで再parseしPASS。
- `src/safety-gate.js` の検査時に検査用export除去処理が `DEFAULTS as SAFETY_DEFAULTS` を残す誤検出があったが、実コードの構文エラーではないことを確認。
- 新規Portal/通知/Catalogコードから `ranking_snapshots` の広域SELECTなし。Ranking historyの既存target-specific SELECTのみ確認。

## 再監査で発見・修正した実コード問題
1. `runKingdomWatchlistJobs()` のSafety Gateでループ外の `row?.top_n` を参照していた問題を修正。plannedRequestsはbounded固定値へ変更。
2. Discord Alliance通知のWatchlist判定が `kid:aid` 形式を仮定していた問題を修正。実際のranking target_idであるaidを `kingdom_ranking_current` 経由でKIDに紐付けて判定。
3. 0052 Discord notification migration番号を再確認。
4. 既存migrationには `0008_data_retention.sql` と `0008_kingdom_watchlist_jobs.sql` の同番号が存在。これは既存本番履歴との整合性確認が必要なため、今回勝手に改番しない。

## 再監査で確認した既存安全ルール
- R2_ONLY history pathを維持。
- ranking_snapshots広域Readを復活させていない。
- Catalog paginationは50+1方式。
- Portal Comparisonは最大4王国bounded R2 read。
- Watchlist Safety Gateは新規Jobのみ停止し、active resumable Jobは継続可能。
- API Pool / Global Collection Semaphore経由を維持。
- Secrets/API keysをUI/JSON/Handoffへ追加していない。

## 現在の判定
**コード監査: 継続中 → 本番Deploy未実施。**
「30/30完了」ではなく、コード実装一巡 + 再監査で不整合を修正した状態。
次の必須ゲートはProduction D1 migration履歴照合、0052適用、Version URL Smoke Test、本番E2E、Regression、Promotion。


## 再監査追加修正（Player）
- Playerの `refresh=1` が既存rich観測をbase-only観測で上書きし得る回帰を確認。
- 既存観測にheroes/ranks/gov_gearが揃っている場合、明示refreshでもrich fetchを維持するよう修正。
- `src/index.js` 構文再検証PASS。
- Alliance Discord通知はAlliance target_id=aidの実コード仕様に合わせ、`kingdom_ranking_current` 経由でKingdom Watchlistと照合するよう修正済み。


# 2026-10-07 — 全コード再チェック継続 / 次スレ引き継ぎ

## 現在位置
ユーザー指示：「再チェックのため全コードをもう一度洗って」。
全リポジトリツリーを再取得し、現行mainの全体構成を確認開始。

### 現行ファイル数（再チェック開始時点）
- Repository files: 139
- src/*.js: 46
- migrations/*.sql: 53
- 最新main: `3463f49dd80625f475d3e8c100bb997bbdc72fb` 時点から後続修正を含む現行mainを確認中。

## 重要：今回の再チェックは「主要コード6本だけ」ではなく全コード対象
対象:
- `src/` 全46 JS
- `migrations/` 全53 SQL
- `.github/workflows/`
- `wrangler.jsonc`
- 公開HTML / scripts
- 既存docsとの整合

## 既に再確認したこと
- Migration番号の重複なし。現行最新は0052。
- 0052 = `discord_notification_state`
- 0048/0049/0050/0051の存在を確認。
- Portal/Catalog/Ranking Change/Discord/Mighty/System Statusの主要コードは前スレで修正済み。
- 主要6 JS:
  - `src/kingdom-portal.js`
  - `src/kingdom-catalog-page.js`
  - `src/ranking-store.js`
  - `src/discord-notifications.js`
  - `src/status-ops.js`
  - `src/index.js`
  の構文チェックは前回PASS。
- 新規Portal/Catalog/Notificationコードから`ranking_snapshots`の広域D1 readを追加していない。
- Kingdom PortalのBOARDS定義は26件。
- Catalog paginationは全件COUNTを撤去し、50+1方式。
- Ranking ChangeはRANK_CHANGED/RANK_IN/RANK_OUTをchange_eventsへ永続化する修正済み。
- Discord通知はWatchlist対象に限定し、重複claim/retry処理を実装済み。
- System Status/JSONへPortal/Mighty/Discord状態を追加済み。
- 0052 migrationはまだProduction適用していない。
- 本番Deploy/Promotion/E2Eはまだ実施していない。

## 今回の再チェックでまだ未完了
**全46 JS / 全53 migration / workflow / wranglerを最後まで横断監査していない。**
次スレではここから再開する。

### 優先チェック順
1. 全46 JSの構文/未定義参照/import-export整合
2. 全53 migrationのSQL構文・重複番号・依存順序
3. src/index.jsの全routeと実関数接続
4. 全D1テーブル参照とmigration schemaの整合
5. R2 binding / key / archive format整合
6. API Pool / global semaphore / safety gate bypassの有無
7. MightPulse endpoint/purpose/guard整合
8. Watchlist Job → Queue → Collection → R2/D1 write path
9. System Status / JSON / Diagnostic / System Logの観測可能性
10. Wrangler / GitHub Actions / migration apply workflow
11. 30工程の実装台帳との突合
12. Deploy Candidate判定

## 絶対条件
- `ranking_snapshots` の広域readを復活させない。
- R2_ONLY方針を維持。
- Secrets/API keysをUI/JSON/logへ出さない。
- API Pool/global semaphore/safety gateを迂回しない。
- 本番Deployは再チェック完了まで行わない。
- 「コード存在」と「実装完成」「E2E確認済み」「本番反映済み」を混同しない。
- 進捗表示は何分の何で報告。
