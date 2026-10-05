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
