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
- `02d1c05db4273125a317c84288cdffca46cf891a` / `9f02805bae368a23718ad35fe0e6a8c9a8fa2? ` — Load Test context propagation
- `13bcc7475db1e819f01dd4ca59120cbda525ee20` / `70dbd01c9e776bead289f9fd051033868fcff14f` / `c89145f2530d4c4f36797b524b5b4754045602f8` — Job start/completion correlation
- `32854551b229feb2af4852dbc2e15bef791a4712` / `ea822f8bc22dd3511380899cb275b0a55264b1372` / `a5101dbb51416a733fbdb6b2f46c205045c10e3f` / `70e1f05fa2be797bb319670af7c40c492e67d3b9` — API Pool timestamp/trace propagation

### 注意
- これはコード実装完了であり、Cloudflare本番deploy・本番E2E成功確認とは別。
- 次はdeploy後に新しい20王国runを実行し、同一run_id/trace_idで Job → lease → MightPulse が連続して出ることを確認する。
