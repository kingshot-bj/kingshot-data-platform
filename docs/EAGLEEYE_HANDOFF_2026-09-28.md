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