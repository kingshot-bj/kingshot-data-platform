# EagleEye 開発引き継ぎ書
## 2026-09-28 / $5 Paid緊急運用・Free復帰対応

この文書は、KingShot Data Platform EagleEye の次スレッドへ正確に引き継ぐための追加基準文書。既存の docs/EAGLEEYE_HANDOFF_2026-09-27.md を土台とし、2026-09-28 の $5 Paid監視実装以降を記録する。

## 1. 最重要方針
- 今回のCloudflare Workers Paid $5化は恒久運用ではなく一時的な緊急処置。
- 目的はD1 Freeの1日上限で開発・実測が止まる状態を回避し、開発を継続すること。
- $5期間中にD1/R2の最適化を進め、最終的にはFreeへ戻してFree枠内で実用運用できる状態にする。
- 最終目標は「Free枠でも余裕を持ってEagleEyeを運用できること」。

## 2. 背景
直近の実測ではD1 Rows WrittenがFree上限を大きく圧迫していた。代表的な実測はRows Read 約570,397、Rows Written 約106,358 / 100,000。ranking_snapshots INSERTが大半の書き込みを占有していた。
根本対策として、ランキング履歴・プレイヤー履歴・プレイヤー順位履歴をR2へ逃がし、D1はcurrent state、Watchlist、軽量な変更情報などを中心にする。

## 3. Paid $5枠の比較
Cloudflare公式のPaid included allocationを基準に監視する。
- D1 Rows Read: 25,000,000,000 / 月
- D1 Rows Written: 50,000,000 / 月
- D1 Storage: 5GB
- Workers Requests: 10,000,000 / 月
- Workers CPU: 30,000,000 CPU-ms / 月
- R2はWorkers $5枠とは別。StandardのFree includedはStorage 10GB、Class A 1,000,000、Class B 10,000,000 / 月。

30日換算の目安ではPaid D1はRows Read 約8.33億/日相当、Rows Written 約166.7万/日相当。

## 4. Monitoring Profile
環境変数 CLOUDFLARE_MONITORING_PROFILE で切替。
- PAID_5USD = Paid用月次監視
- FREE = 従来のFree監視

現在の wrangler.jsonc は一時的に PAID_5USD。
Free復帰時は FREE に変更して再デプロイする。Paid用コードは削除せず、プロファイル切替として残す。

## 5. 90%安全ライン
Paid included allocationの90%をEagleEye監視上限としている。
- D1 Rows Read: 22,500,000,000
- D1 Rows Written: 45,000,000
- D1 Storage: 4,500,000,000 bytes
- Workers Requests: 9,000,000
- Workers CPU: 27,000,000 CPU-ms
目的はincluded allocationを100%まで使い切る前に警告できるようにすること。

## 6. System Status 本番確認
ユーザー提供の本番スクリーンショットで、System StatusにPAID_5USD監視が実際に表示されていることを確認済み。
表示値:
- Workers Paid $5 envelope
- $5 Paid枠・安全上限の最大使用率: 36.2%
- 推定月額: 5.0000
- 推定超過: 0.0000
- Rows Read: 12,983,644 / 22,500,000,000
- Rows Written: 326,388 / 45,000,000
- D1 Storage: 17,227,776 / 4,500,000,000 bytes
- Worker Requests: 4,052 / 9,000,000
- R2 Includedも正常表示

注意: これはSystem Status画面の確認。推定月額はCloudflare Billingの実請求額そのものではない。

## 7. 円表示の要望
ユーザーから、推定月額・推定超過を円表記にできないか要望あり。
候補表示:
- 推定月額 ¥xxx
- （USD $5.00 / 参考換算）
- 推定超過 ¥0

円換算を実装する場合、為替レートを固定するか外部取得するかを検討。外部取得する場合は依存・負荷を考慮する。実請求額との混同を避け「参考換算」と明記する。

## 8. 推定コストの注意
Workers CPUはGraphQL Analyticsで取得できるcpuTimeP50を使い、requests × cpuTimeP50で月間CPU-msを推定している。
これは請求額そのものではない。Cloudflare Billingが実際の請求額のauthoritative source。

Paid modeではD1 read/write、Workers request/CPUの超過を使ってestimatedOverageUsdを計算し、$5 base + overageをestimatedMonthlyCostUsdとして表示する。

## 9. R2履歴移行
R2_ONLYでは、ranking history、player history、player rank historyをR2へarchiveし、成功時はD1 history INSERTをスキップする。
R2失敗時はHistory Emergency Bufferへ退避し、cronでdrainする。
絶対条件: R2_ONLYなのにD1へ大量historyを書き戻してFree枠を消費する設計には戻さない。

R2 gzip問題では「Provided readable stream must have a known length」が発生したため、gzip payloadをArrayBuffer化してbucket.putする修正済み。
commit: 7f5fcfa393e0ebf04f3e7a471eff537b6b7b8e41

以前R2 objectCount 0 / storage 0だった問題がある。R2が本番で本当に保存されているかは引き続き確認すること。

## 10. History Emergency Buffer
migration: migrations/0015_history_emergency_buffer.sql
commit: 201f314fee56cca623c9282adb013c1d980bb537
最大50 rows、最大8MB、payload約1.5MB。RANKING / PLAYER / PLAYER_RANKに対応。
cron drain commit: 1227c3dafe6a2c32b90bbc148f5fc266d13b7206
System Status JSONにもbuffer状態を追加。commit: 5ec288185ec906dda93118b8947e52dbcc91fd9d

## 11. D1で絶対に復活させないもの
ranking_snapshotsの広範囲取得を絶対に復活させない。
禁止例: ranking_snapshotsから最新100/1000/5000件などをまとめて取得する方式。
順位変動などはログインユーザーのwatchlist、governor_id、kid、必要board、対象player、直近2観測に限定する。
D1 Rows Read削減は今後も最優先。

## 12. 重要コミット
- b4ac602fadfcf2fbd01c818475dfec9a36f3f7eb : paid/free monitoring profile 初期実装
- c52d4a30ce7cf9ec0dcf61be2ed018d2f7964705 : $5 billing metrics基準へ修正
- bc6d45f1724c9156866d59a2b9fc2dc662950a14 : CPU推定をrequests × cpuTimeP50へ変更
- 94752aee8332430e54096a96818ab42ce4576152 : $5使用率とoverage cost estimateを分離
- ef42b0874f66a9d860c7f462c72dbbb46307f3f0 : System Statusへprofile / $5 safety usage表示
- dd6439925295ea36f87a4040d9a083fbc006f825 : estimated monthly cost / overage表示
- b1fb1350cdf751c0a977676a6e62407439d013a5 : wrangler.jsoncを一時PAID_5USDへ変更
- eb425ebe8650da036956e2817089473f7819a25f : 既存handoffへ$5監視切替を記録

## 13. Production確認ルール
ユーザーの絶対ルール: 「本番環境で確認できていないことは、確認済みとは言わない。」
コード上は実装済み、deploy済み、本番で実画面/API/Cloudflare metrics確認済みを必ず区別する。
今回のPAID_5USD表示はユーザー提供スクリーンショットにより本番System Statusで確認済み。
ただしCloudflare Billingとの完全一致、R2 archive全件成功、Free復帰後の正常運用、長時間Watchlist運用時の枠消費は未確認。

## 14. 次スレッドで最初にやること
1. GitHub mainの最新HEAD確認
2. 最新コミットと本書を照合
3. src/cloudflare-analytics.js 最終コード確認
4. src/index.js System Status確認
5. wrangler.jsonc のPAID_5USD確認
6. R2 archiveの本番保存確認
7. 必要なら円換算表示を実装
8. その後D1/R2最適化へ戻る

## 15. Free復帰の最終条件
最適化が進んだら CLOUDFLARE_MONITORING_PROFILE=FREE に戻してdeployし、System Statusが従来のFree監視へ戻ることを本番確認する。
Freeで実用運用できることを実測してからPaid緊急運用を終了する。

## 16. 次スレッドへの伝言
今は$5 Paid監視が本番画面に出るところまで来た。$5は緊急避難であってゴールではない。円表示を必要なら整え、その後は本丸のR2/D1最適化へ戻る。最終的にFree枠で余裕を持って運用できるところまで詰める。

## 17. 2026-09-28 後半スレッド：Watchlist削除後の実測とD1 Query Insights調査

### 17-1. 時刻表示ルール
ユーザーの明示ルール：**時間はファイル名に統一する。**
- status(20260928-170316).json → 17:03:16
- status(20260928-171008).json → 17:10:08
- status(20260928-171652).json → 17:16:52
内部JSONの created_at / completed_at / retrieved_at / Unix epoch 等を画面上の時刻として使用しない。

### 17-2. 今回実際に確認した3ファイル
ユーザーが新規提供した以下3ファイルを実在確認し、比較した。
- status(20260928-170316).json
- status(20260928-171008).json
- status(20260928-171652).json
以前、存在確認していないファイル名を推測してしまった経緯があるため、今後は**ファイル名を絶対に推測しない**。実際に提供・検索確認できたファイルだけを扱う。

### 17-3. 17:03:16 の実測
D1:
- storagePercent: 0.4413667555555555
- databaseSizeBytes: 19,861,504
- writeQueries: 71,287
- readQueries: 27,791
- rowsRead: 13,371,398
- rowsWritten: 360,766

Workers:
- requests: 4,849
- subrequests: 2,661
- cpuTimeMs: 11,724,882
- errors: 372

Query Insights:
- queryCount: 282
- Ranking Snapshot: count 37,807 / rowsRead 12,627,370 / rowsWritten 267,913
- Other Write: count 33,782 / rowsRead 2,316,344 / rowsWritten 58,116
- API Pool: count 9,307 / rowsRead 20,089 / rowsWritten 13,554
- Watchlist Job: count 9,522 / rowsRead 32,748 / rowsWritten 4,896
- Diagnostics: count 2,715 / rowsRead 16,700 / rowsWritten 1,574
- Player Observation: count 653 / rowsRead 182 / rowsWritten 502
- Player Snapshot: count 317 / rowsRead 142 / rowsWritten 255
- Other: count 5,518 / rowsRead 382,114 / rowsWritten 105
- Change Event: count 101 / rowsRead 325 / rowsWritten 8

Watchlist:
- total 1
- enabled 1
- latestSuccessAtあり
- latestJob: COMPLETED / playerRows 5 / rankingRows 2600 / lastError null
- enabledErrors 0

### 17-4. 17:10:08 の実測
D1:
- storagePercent: 0.4413667555555555（変化なし）
- databaseSizeBytes: 19,861,504（変化なし）
- writeQueries: 73,710
- readQueries: 28,016
- rowsRead: 13,379,634
- rowsWritten: 363,600

Workers:
- requests: 4,865
- subrequests: 2,673
- cpuTimeMs: 11,724,650
- errors: 372

Query Insights:
- queryCount: 282
- Ranking Snapshot: 変化なし
- Other Write: count 35,665 / rowsRead 2,318,227 / rowsWritten 60,039
- API Pool: count 9,445 / rowsRead 21,316 / rowsWritten 14,229
- Watchlist Job: count 10,084 / rowsRead 33,296 / rowsWritten 5,445
- Diagnostics: 変化なし
- Player Observation: 変化なし
- Player Snapshot: 変化なし
- Other: count 5,545 / rowsRead 382,148 / rowsWritten 105
- Change Event: 変化なし

Watchlist:
- total 1
- enabled 1
- latestJobは17:03:16時点と同じ COMPLETED / playerRows 5 / rankingRows 2600 / lastError null
- enabledErrors 0

### 17-5. 17:16:52 の実測
D1:
- storagePercent: 0.4413667555555555（変化なし）
- databaseSizeBytes: 19,861,504（変化なし）
- writeQueries: 73,710（17:10:08から変化なし）
- readQueries: 28,029
- rowsRead: 13,379,858
- rowsWritten: 363,600（17:10:08から変化なし）

Workers:
- requests: 4,867
- subrequests: 2,678
- cpuTimeMs: 11,748,938
- errors: 372

Query Insights:
- Ranking Snapshot: 変化なし
- Other Write: 変化なし
- API Pool: count +3 / rowsRead +12 / rowsWritten +0
- Watchlist Job: count +2 / rowsRead +8 / rowsWritten +0
- Other: count +8 / rowsRead +6 / rowsWritten +0
- その他主要カテゴリ変化なし

Watchlist:
- total 0
- enabled 0
- latestSuccessAt null
- latestUpdatedAt null
- latestJobは過去のCOMPLETED job（playerRows 5 / rankingRows 2600 / lastError null）
- enabledErrors 0

### 17-6. 3ファイル間の差分
17:03:16 → 17:10:08:
- Rows Read +8,236
- Rows Written +2,834
- Read Queries +225
- Write Queries +2,423
- Worker Requests +16
- Subrequests +12
- CPUは -232ms（Analytics集計の揺らぎとして扱う）
- Ranking Snapshotは完全に変化なし
- Other Write: count +1,883 / rowsRead +1,883 / rowsWritten +1,923
- API Pool: count +138 / rowsRead +1,227 / rowsWritten +675
- Watchlist Job: count +562 / rowsRead +548 / rowsWritten +549

17:10:08 → 17:16:52:
- Rows Read +224
- Rows Written 0
- Read Queries +13
- Write Queries 0
- Worker Requests +2
- Subrequests +5
- Ranking Snapshot変化なし
- Watchlist Job +2 queries / +8 rowsRead / +0 rowsWritten
- API Pool +3 queries / +12 rowsRead / +0 rowsWritten

結論：17:03:16→17:10:08の大量D1活動は**新しいRanking Snapshot書き込みではない**。主にOther Write / API Pool / Watchlist Jobが増えている。17:10:08→17:16:52ではD1 writeは発生していない。17:10:08から17:16:52の間にWatchlistが1 enabled→0 enabledになっており、削除と整合する。

重要な注意：この約6分44秒だけでは「Cronが永久に停止した」とは証明できない。ただし、この観測区間では削除後のWatchlist D1 writeが発生していないことは確認できる。

### 17-7. Watchlist削除処理の確認
DELETE pathは以下。
```js
await env.DB.batch([
  env.DB.prepare("DELETE FROM kingdom_watchlist_jobs WHERE watchlist_id = ?").bind(watchlistId),
  env.DB.prepare("DELETE FROM kingdom_watchlist_locks WHERE watchlist_id = ?").bind(watchlistId),
  env.DB.prepare("DELETE FROM kingdom_watchlists WHERE watchlist_id = ? AND discord_id = ?").bind(watchlistId, auth.discord_id)
]);
```

Cronはenabled watchlistだけをSELECTする。削除されたjobsは後続Cronで拾われない。既にin-flightのHTTP/API処理そのものを強制abortする設計ではない。

### 17-8. 今回の本丸：Watchlist Job +562 の正体を調べる
17:03:16→17:10:08でQuery Insightsの「Watchlist Job」が+562になったが、status JSONのカテゴリ集計だけではSQLごとの内訳を把握していない状態だった。

そこで次スレッドでは、**実際のstatus JSON内の queryInsights.queries をSQL単位で比較する**。
見る項目:
- query
- count
- rowsRead
- rowsWritten
- rowsReturned
- durationMs
- category

目的は+562を、例えば以下のどれが何回発生したかまで分解すること。
- SELECT ... kingdom_ranking_current
- INSERT/UPDATE ... kingdom_ranking_current
- UPDATE ... kingdom_watchlist_jobs
- INSERT/UPDATE ... kingdom_ranking_board_state
- INSERT ... change_events
- その他Watchlist関連SQL

### 17-9. 重要：src/cloudflare-analytics.js は既にSQL単位情報を取得する実装済み
2026-09-28後半にmainの `src/cloudflare-analytics.js` を実コード確認した。

D1_QUERY_INSIGHTS_QUERY は以下をCloudflare GraphQLから取得している:
- count
- rowsRead
- rowsWritten
- rowsReturned
- queryDurationMs
- dimensions.databaseId
- dimensions.query

summarizeD1QueryInsights() は各queryを以下に変換する:
- query
- count
- rowsRead
- rowsWritten
- rowsReturned
- durationMs
- category

さらにreturn値は:
- queryCount
- queries（**全query一覧**）
- topWriteQueries
- topReadQueries
- categories

そしてgetCloudflareD1Usage()のreturnにqueryInsightsをそのまま含めている。
コードコメントにも「complete query list available to the status JSON」「machine-readable status endpoint must not silently discard query-level metrics」と明記されている。

したがって、現時点では**status JSONへ情報を追加するパッチは不要**。既にstatus JSONへSQL単位情報を出す設計になっている。

今回の問題は実装不足ではなく、**既に出ているqueryInsights.queriesを3つの実status JSONでまだ全件比較していなかったこと**。

### 17-10. 次スレッドの最初の作業
1. ユーザーが提供済みの実ファイル名を再確認する。ファイル名を推測しない。
2. status(20260928-170316).json と status(20260928-171008).json の `queryInsights.queries` を全件取得。
3. SQL文字列を正規化して同一SQLを対応付ける。
4. count / rowsRead / rowsWritten / rowsReturned / durationMs の差分を計算。
5. 特にcategory=Watchlist Jobを全件抽出し、+562の内訳を確定する。
6. そのSQLをmainの `src/index.js`, `src/ranking-store.js`, `src/api-pool.js`, `src/diagnostics.js` の実装箇所と1対1で照合する。
7. 「固定コスト」「変更行数依存」「プレイヤー数依存」「API request依存」に分解する。
8. その後、Free枠削減率を具体的に試算する。

### 17-11. 重要な実装・分析上の注意
- `ranking_snapshots` の広範囲SELECTを絶対に復活させない。
- R2_ONLYを維持する。
- 「コード上実装済み」「deploy済み」「本番確認済み」を混同しない。
- 本番未確認を「確認済み」と言わない。
- Cloudflare Analyticsには集計遅延があり得るため、瞬間値だけで因果関係を断定しない。
- status JSONの内部 `retrievedAt` 等を表示時刻として使わず、**ファイル名の時刻だけを使う**。

### 17-12. このスレッドでの重要な訂正
一度、「status JSONにSQL単位情報がないのでパッチが必要」という方向で回答しかけたが、mainの `src/cloudflare-analytics.js` を確認した結果、それは誤りだった。
正しくは、SQL単位の `queryInsights.queries` は既に実装・返却されている。次スレッドでは新規パッチを作る前に、**既存のstatus JSONを最後まで読み切ってから判断する**こと。


---

## 18. 2026-09-29 SERVICE_USAGE実装・EagleEye Management分離・次工程

### 18-1. SERVICE_USAGE実装
SERVICE_USAGEはD1に保存せず、EagleEye本体からCloudflare Queueへ送信する。

実装:
- `src/service-usage.js`
- 15イベント定義
- event_id = `crypto.randomUUID()`
- occurred_at = UTC ISO8601
- actor_user_id = `users.user_id` のみ
- target_type = PLAYER / KINGDOM
- target_id = PLAYERならgovernor_id、KINGDOMならkid
- metadataはイベントごとのallow-list
- PLAYER_SEARCHではraw search queryを保存しない
- Queue送信失敗はユーザー操作を失敗させない

15イベント:
1. PLAYER_SEARCH
2. PLAYER_VIEW
3. PLAYER_REFRESH
4. PLAYER_HISTORY_VIEW
5. PLAYER_CHANGES_VIEW
6. PLAYER_WATCHLIST_VIEW
7. PLAYER_WATCHLIST_ADD
8. PLAYER_WATCHLIST_REMOVE
9. KINGDOM_WATCHLIST_VIEW
10. KINGDOM_WATCHLIST_ADD
11. KINGDOM_WATCHLIST_REMOVE
12. KINGDOM_WATCHLIST_REFRESH
13. KINGDOM_RANKING_VIEW
14. PLAYER_EXPORT
15. KINGDOM_EXPORT

主要commit:
- 336d4fbdb8fef882d7aeaed370ee2a5f27747812 — event schema / queue producer
- ba79d6ea4c5e80a8f3209f6dbf519bf1dfe32954 — player events
- bfd2f2d084ed046bdf319750fd5966ea76463df4 — kingdom watchlist events
- d211e5746955aa26c61c268b2b1fdcce4483ae27 — kingdom target_id correction
- 42df8fe48b26cb3658a3419dc20d28f8c6ca415e — view/export tracking

### 18-2. Queue / R2 SERVICE_USAGE archive
Queue:
- `eagleeye-service-usage`
- DLQ: `eagleeye-service-usage-dlq`
- max_batch_size 100
- max_batch_timeout 30s
- max_retries 5
- max_concurrency 1

R2実装:
- `src/service-usage-archive.js`
- gzip NDJSON
- JST基準のcanonical key:
  - `service-events/YYYY/MM/DD/00-12.ndjson.gz`
  - `service-events/YYYY/MM/DD/12-24.ndjson.gz`
- event_idで重複排除
- Consumer writeはserialize済み

主要commit:
- 0a48b27beaed84802426d18e17968dd1c1b25d2f
- 6d778344a3cee09602cd93a4e094099c2b663333
- 2b94a4758595d19907d6f1515b93b8c55cfb0c7a
- ef5bf3ded7f28569a8913715e69860e815becf33

本番deployについて:
- Queue作成・Producer bindingはユーザー提供deploy logで確認済み。
- 後続Consumerを含むdeploy成功も確認済み。
- ただし **Queue → Consumer → R2の実データ処理が本番で成功したとはまだ扱わない。**

### 18-3. SERVICE_USAGE設計上の正式ルール
- SERVICE_USAGE本文をD1へ保存しない。
- event_id + batch_idの二重idempotency。
- event_idはQueue→Consumer→R2→Driveで同一値を維持。
- 通常R2 archiveは12h単位。
- Google Driveは長期・最終archive。
- R2削除はDrive upload成功だけでは許可しない。verification後に判断。
- DLQは5 retries後。
- DLQ自動retryは6hごと、最大500 events。
- 手動retryは個別または最大500件。「全件再処理」は作らない。
- 6h自動retryでも失敗した場合はDrive emergency archiveを開始する設計。
- DiscordはDLQ発生時即時通知、未解決時の再通知、recovery通知を行う設計。

### 18-4. EagleEye Managementは別Project / 別repo
SERVICE_USAGEの管制・分析を行う **EagleEye Management** はEagleEye本体とは分離する。

本体:
- repo: `kingshot-bj/kingshot-data-platform`
- SERVICE_USAGE生成
- Queue producer
- EagleEye本体機能
- MightPulse取得
- Watchlist処理
- 実際のGoogle Drive / Discord連携処理

Management:
- 新規repo予定: `kingshot-bj/eagleeye-management`
- Dashboard
- Usage Analytics
- Queue / R2 / DLQ monitoring
- Recovery control
- Drive archive state monitoring
- Collection Catalog
- Management permissions
- Audit

重要:
**ManagementはEagleEye本体を直接編集しない。**
ただし本体の最新main branchは積極的に読む。連携仕様は古い資料ではなくmainの実装を正本として確認する。

関連docs:
- `docs/EAGLEEYE_MANAGEMENT_HANDOFF_2026-09-29.md`
- `docs/EAGLEEYE_MANAGEMENT_INTEGRATION_REQUEST_2026-09-29.md`

### 18-5. Google Drive連携 — 次の本体側作業
ここからの本丸は **EagleEye本体のR2 → Google Drive連携**。

既存:
- `src/google-drive.js`
- `uploadR2ObjectToGoogleDrive(env, { archiveBucket, key, fileName, mimeType, folderId })`

環境変数:
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GOOGLE_DRIVE_FOLDER_ID`

既存準備doc:
- `docs/EAGLEEYE_R2_GOOGLE_DRIVE_PREP.md`

現在は:
- `src/index.js` 未接続
- cron未接続
- retention未接続
- R2自動削除なし
- D1追加保存なし
- 正本はR2

次スレッドでは、まずmainの実コードを読み直してから実装する:
1. `src/google-drive.js`
2. `src/service-usage-archive.js`
3. `wrangler.jsonc`
4. 関連migration
5. SERVICE_USAGE関連コード
6. Google Drive関連docs

目標:
```
SERVICE_USAGE
  ↓
Queue
  ↓
R2 canonical gzip NDJSON
  ↓
Google Drive
  ↓
verification
  ├─ size
  ├─ checksum
  ├─ record count
  ├─ batch_id
  └─ duplicate prevention
  ↓
archive confirmed
```

重要:
- Drive upload成功とverification済みを分離する。
- verification失敗時はR2を保持。
- **本番確認前にR2削除を実装しない。**
- 1 event = 1 Drive fileは禁止。
- gzip NDJSON batchを使用。
- 大容量uploadが必要ならresumable uploadを検討。
- D1へSERVICE_USAGE本文を保存しない。
- D1 Free-tier row readを最優先。

### 18-6. 本番確認ルール
引き続き絶対条件:
**「本番環境で確認できていないことは、確認済みとは言わない。」**

特に未確認として扱う:
- Queue → Consumer → R2実データ処理
- R2 → Google Drive実アップロード
- Drive verification
- DLQ recovery
- Discord notification
- Management integration API

deploy成功・build成功・コード存在だけではproduction-confirmedとしない。

### 18-7. 次スレッド開始時の指示
**「前スレの引き継ぎを読んだ。Google Drive連携を開始。まずmainの既存実装を全部確認してから進めて。」**

なお、この引き継ぎはEagleEye本体側の継続資料であり、Management専用の引き継ぎではない。


### 18-8. Google Drive認証方式の方針転換（2026-09-29）

Google Drive連携について、当初のService Account方式から**個人GoogleアカウントのOAuth 2.0方式へ方針転換**する。

背景:
- EagleEyeではGoogle Workspaceを利用しない。
- Google Driveの保存先はEagleEye専用として用意済みの個人Googleアカウントのマイドライブを使用する方針。
- Service Accountはプログラム用のGoogle IDであり、個人ユーザーのマイドライブをそのまま所有者として利用する方式には制約がある。
- Workspaceの共有ドライブを前提にする必要はない。
- Google Drive APIの追加料金を目的としてWorkspaceを導入する方針ではない。

新方針:
```text
EagleEye Worker
  ↓
Google OAuth 2.0
  ↓
EagleEye専用の個人Googleアカウント
  ↓
Google Drive / My Drive
```

設計上の重要事項:
- `src/google-drive.js` のR2→Driveアップロード処理は再利用可能性を確認する。
- Service Account固有の認証処理はOAuth方式へ置き換える対象。
- Google OAuthのrefresh token等の秘密情報はCloudflare Secrets等へ安全に保存する。
- GoogleアカウントのパスワードをWorkerへ保存しない。
- OAuth認証・refresh token取得・Drive API権限・Worker無人運用の具体設計を確定してから実装する。
- Google DriveをDBや検索基盤にはしない。R2をcanonical sourceとして維持する。
- Drive upload成功とverification済みを分離する。
- 本番でR2→Drive実アップロードが確認できるまでは「Drive連携確認済み」と扱わない。
- 本番確認前にR2削除を実装しない。
- SERVICE_USAGE本文をD1へ保存しない。

今回の変更は**認証・保存先の方針変更であり、現時点ではまだ実装変更を行っていない**。

### 18-9. Google Drive OAuth接続実装開始（2026-09-29）

方針転換に基づき、本体側に個人GoogleアカウントOAuth接続の初期実装を追加した。

実装:
- `src/google-drive.js` をService Account JWT方式からユーザーOAuth refresh token方式へ変更。
- OAuth scopeは `https://www.googleapis.com/auth/drive.file`。
- `/admin/google-drive` をOWNER専用の設定画面として追加。
- `/api/admin/google-drive/authorize` をOWNER専用OAuth開始エンドポイントとして追加。
- `/api/admin/google-drive/callback` をOWNER専用OAuth callbackとして追加。
- OAuth stateは既存のEagleEye HMAC state tokenで検証。
- 初回OAuth callback時、access tokenでEagleEyeフォルダを作成する。
- callback画面でRefresh TokenとFolder IDを一度だけ表示し、Cloudflareへ手動登録する方式。
- `GOOGLE_DRIVE_REFRESH_TOKEN` はCloudflare Secretとして扱う。
- `GOOGLE_DRIVE_FOLDER_ID` はEagleEyeフォルダIDとして設定する。
- `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` / `GOOGLE_DRIVE_OAUTH_REDIRECT_URI` をOAuth設定に使用。
- Admin ControlからGoogle Drive設定画面へ遷移できる。
- System StatusのRuntime ConfigurationにもGoogle Drive OAuth設定状態を追加。

R2→Drive transport:
- R2 objectを取得。
- `appProperties.eagleeyeSourceKey` で同一R2 objectの重複転送を検出。
- Drive multipart upload。
- source sizeとDrive sizeを比較しverificationする。
- duplicate時もsizeを再確認する。
- verification成功を `verified: true` として返す。

まだ未実装:
- cronからの自動R2→Drive転送。
- retentionとのDrive連携。
- Library Index。
- 完全なchecksum verification。
- record count verification。
- batch_id。
- R2自動削除。

重要:
- Google DriveはDB/search basisにしない。
- R2がcanonical source。
- Drive upload成功だけではR2削除条件を満たさない。
- 本番R2→Drive実データ処理が確認されるまでproduction-confirmedとは言わない。
- SERVICE_USAGE本文をD1へ保存しない。
- Google OAuth同意画面がTestingの場合、refresh tokenが7日で失効するため長期運用前にGoogle Cloud側の公開状態を確認する。

現時点ではコード実装まで。Google Cloud OAuth client作成、Cloudflare Secret/Variable設定、OAuth認証実行、R2→Drive本番実アップロードはまだ未確認。

### 18-10. 実装確認（2026-09-29）

最新main HEADは `9daee207726a57352e95e01ea37be4ceaf89f9ee`。
Google Drive OAuth実装の構文確認を実施し、`src/google-drive.js` / `src/index.js` ともに構文エラーなし。

主要コミット:
- `e4d4ecd9f8355898d0765ba4d757e6d9ed3ff459` — Drive transportをUser OAuthへ変更
- `0585e9f6fcadff93960649fdc94479d2366f0ec1` — OAuth setup flow
- `76d7d5230ed64cd1e30296bebe5584c94b0ea6ee` — Admin ControlへDrive設定導線
- `00aaa0f07e3df555b707736b1de95b806891fc86` — System StatusへOAuth設定状態
- `aefe34f4f834c5d42e23459abe851dcb54655a89` — Drive prep更新
- `f2e4d797e6c6e407361f4a45534b14fe4a1020d0` — handoff更新
- `9daee207726a57352e95e01ea37be4ceaf89f9ee` — Drive duplicate key normalization

注意: GitHub mainへのコード反映と構文確認はできているが、Cloudflare本番deploy、Google Cloud OAuth client設定、OAuth認証、Refresh Token設定、R2→Drive実データuploadは未確認。


## 追記：開発・デプロイ運用ルール（2026-09-30）

### GitHub → Cloudflare 自動デプロイ
- EagleEye本体は **GitHub main へのコミットを起点にCloudflareへ自動デプロイ**される運用。
- 手動でCloudflareへデプロイする前提ではない。
- したがって、コード変更をmainへコミットした後は、Cloudflare側の自動デプロイ完了を待って本番確認する。

### 本番確認の表現ルール
- **コミット済み／コード上で修正済み** と **本番デプロイ成功／本番動作確認済み** を必ず区別する。
- ユーザーからCloudflare自動デプロイ成功のログ・画面が提示されるまでは、本番デプロイ成功とは断定しない。
- 本番環境で実際に確認していない機能について「確認済み」「動作確認済み」と表現しない。
- 次スレッドでもこのルールを前提として扱い、ユーザーに毎回再説明を求めない。

### 現在の直近修正
- /my-player が [object Response] と表示される問題を調査。
- 原因は /my-player ルート側ですでに eagleEyeHtmlResponse() を適用しているのに、renderMyPlayerPage() 側でも eagleEyeHtmlResponse() を返していた二重Response化。
- これを修正し、renderMyPlayerPage() はHTML文字列を返す構造に変更。
- その修正時に未ログイン分岐のテンプレートリテラル終端を誤って残したため、Cloudflare自動デプロイで Expected ";" but found ")" が発生。
- 未ログイン分岐の return `...`); を return `...`; に修正済み。
- 修正コミット：797286e301a07c0efe695943b87e0e99108964a8
- このコミット後の **本番デプロイ成功・/my-player正常表示は未確認**。

### API Pool Advanced用インデックス
- migrations/0006_api_pool.sql を確認し、api_pool_keys に contributed_by_user_id を軸にした既存インデックスがないことを確認。
- Advanced昇格判定の USER_CONTRIBUTED MightPulse APIキー検索を効率化するため、migrations/0025_api_pool_user_contributed_index.sql を追加。
- インデックス：provider, pool_type, contributed_by_user_id, contributed_at DESC
- コミット：53c4a7b70582264072f429a916671c8b9642785d
- 本番D1へのmigration適用・本番での効果確認は未実施。

### 2026-09-30 / 本番 MyKingShot `user_player_links` 未作成エラー
- 本番 `/my-player` を開くと `D1_ERROR: no such table: user_player_links` が発生した。
- 原因：`renderMyPlayerPage()` が `/api/me/player` と `/api/me/advanced` を `Promise.all()` で同時取得する一方、`user_player_links` の `ensureSchema()` は `/api/me/player` 側にしか存在せず、`/api/me/advanced` の `getAdvancedEligibility()` は直接 `user_player_links` をSELECTしていた。D1 migration未適用環境ではAdvanced側が先に失敗する。
- `user-player-link.js` の `ensureSchema()` をexportし、`user-eligibility.js` の `getAdvancedEligibility()` で先に `await ensureUserPlayerLinkSchema(db)` を実行するよう修正。
- コミット：`6bb55f1b46ab364b9f008afdf32a8b076983fcef` / `378f37ac089db122b4b519339d1bba27425ee597`
- GitHub mainへのコミット後はCloudflareへ自動デプロイされる。
- 上記修正後の本番デプロイ成功・MyKingShot正常表示は未確認。

### 2026-09-30 / マイKingShot 複数アカウント設計
- サービス開始時の公開仕様：1王国につきメイン1＋サブ1、最大2王国まで。無料枠の最大は4アカウント。
- 同一領主IDは複数EagleEyeアカウントへACTIVE登録不可。
- 将来の有料版では、同一王国の追加サブ／王国数追加を拡張できるようDB/APIを複数リンク対応へ変更した。ただし現時点では有料機能を公開しない。
- 将来拡張用の内部フラグ `KINGSHOT_EXTRA_ACCOUNTS_ENABLED` をAPIに用意。通常は未設定/falseで無料上限を適用。決済・課金機能自体は未実装。
- migration: `migrations/0026_user_player_links_multi_account.sql`
- `user_player_links` は user_id の単一UNIQUEを廃止し、`kingdom_id` / `account_type (MAIN/SUB)` を持つ複数リンク型へ変更。
- DB制約：ACTIVE governor_id一意、ACTIVE user_id+governor_id一意、ACTIVE user_id+kingdom_idのMAIN一意。
- アプリ制約：無料は最大2王国、1王国あたり最大2アカウント、SUBは1王国1件。将来有料拡張時に内部フラグ/課金資格判定へ差し替える。
- MyKingShot API/UIは複数リンク一覧、王国・メイン/サブ区分、個別解除に対応。
- Advanced昇格条件は変更なし：「領主IDを1つ以上登録」＋「MightPulse APIキーをPoolへ提供」。
- 現時点で有料化をユーザー向けに告知しないUIへ調整済み。
- main commits: `9ab352ae89729e4168ff435bba30f59a4fa61977` (migration), `0b7721ec10de759b53d9f34feb830d4731d9793e` (migration fresh DB safety), `f1f66abdb66f04377be5077c8647aa36aef4ff6a` (multi-account data/API core), `2712f61b526358bf592e2cc6f8730a1c49fc9ff6` (API), `415424c570c714a1002211df505b3ad29ab363f3` (UI), `dbe27fd99b631f05e31d991a2072b9956ec7531e` (hide future paid wording).
- 本番migration適用・本番MyKingShot複数アカウント動作確認は未実施。
