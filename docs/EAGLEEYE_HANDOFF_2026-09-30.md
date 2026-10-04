# EagleEye 開発引き継ぎ書
## 2026-09-30 / 次スレッド継続用・統合版

この文書は、KingShot Data Platform EagleEye の次スレッドへ移行するための統合引き継ぎ書。
既存の `docs/EAGLEEYE_HANDOFF_2026-09-27.md` と `docs/EAGLEEYE_HANDOFF_2026-09-28.md` を基礎に、2026-09-29〜2026-09-30 の実装・本番確認・調査結果を追加したもの。
**次スレッドでは本書と最新 main を基準にすること。**

---

# 0. 最重要ルール

- ユーザーの絶対ルール:
  **「本番環境で確認できていないことは、確認済みとは言わない。」**
- 「コード上実装済み」「GitHub mainに存在」「deploy済み」「本番画面/APIで確認済み」を必ず区別する。
- 推測で本番確認済みと表現しない。
- D1 Rows Read / Rows Written の削減を最優先する。
- `ranking_snapshots` の広範囲取得を絶対に復活させない。
- `HISTORY_STORAGE_MODE=R2_ONLY` を維持する。
- SERVICE_USAGE を D1 に保存しない。
- APIキー本体・Refresh Token等の秘密情報をログ、UI、handoffへ書かない。
- ユーザーは主に iPhone Safari で運用するため、UIはモバイル優先。
- GitHub main → Cloudflare deployment は自動。ユーザーに手動deployを繰り返し要求しない。
- **既存機能と同じ目的・状態を表示するUIは、既存機能の実装仕様・見た目・進捗表現を確認して合わせる。機能ごとに独自UIを作って表示形式をバラバラにしない。特に進捗表示は、通常の王国ウォッチリストのプログレスバー（`.progress` / `.progress-track` / `.progress-fill`）を基準とする。**
- ファイル名・ログ時刻を扱う場合、ユーザー指定のルールに従い、status JSON内部時刻を表示時刻として勝手に使わない。

---

# 0-1. 2026-10-02 コード全体仕様統一・重複監査

2026-10-02にmain全体を横断確認。今後の実装判断基準として以下を固定する。

## 確認・修正済み
- OWNER王国並列負荷テストの進捗UIは、通常の王国ウォッチリストの進捗表示仕様を確認したうえで統一。独自形式を増やさない。
- src/cloudflare-analytics.js のD1 Query Insights分類で、KINGDOM_RANKING_CURRENT を含むクエリがData Coverageへ誤分類される問題を確認。Data Coverage判定から KINGDOM_RANKING_CURRENT を除去し、Current Ranking分類へ流れるよう修正。
- 修正コミット: d9eeb0d14a02fdb93848595c959036ed6319ec15

## 横断監査で確認した統合候補
1. ランキング定義が複数箇所に存在
   - KINGDOM_RANKING_BOARDS
   - RANKING_BOARD_LABELS
   - src/ranking-catalog.js の RANKING_CATALOG
   - 特に日本語ラベルが一致していない箇所があるため、今後は「ランキングのキー・表示名」の正本を一つに寄せる候補。変更前に現在の画面・CSV・APIで期待される名称を確認する。
2. プレイヤーウォッチリストのスキーマ定義がmigrationとruntimeの両方に存在
   - migrations/0012_player_watchlist.sql
   - src/index.js の ensurePlayerWatchlistSchema()
   - migrationが正本となる構成へ寄せ、runtime DDLは互換対応として必要な場合だけ残す候補。いきなり削除せず、本番DBのmigration適用状態を確認してから整理する。
3. src/index.js が非常に大きく、同一目的のUIヘルパー・inline CSS/JSが複数ページに分散
   - esc() は複数の独立HTML script内に存在。
   - .card .row .btn .status 等の汎用CSS名もページごとに重複。
   - ページごとの完全分離が必要な箇所もあるため、単純削除はしない。共有可能なフォーマッタ・進捗UI・共通CSSのみ段階的に抽出する候補。
4. Query Insightsの category と feature は現在同一値
   - 後方互換のため即削除しない。
   - UI/API利用箇所を確認したうえで、どちらか一方を正本にする候補。
5. migration間の重複定義は原則として履歴なので削除しない
   - 例: 0008_kingdom_watchlist_jobs → 0019_watchlist_runtime_schema
   - 0022_user_player_links → 0026_user_player_links_multi_account
   - これらは既存DBへの適用履歴を壊さないため、現行コード側の重複だけを整理対象とする。

## 今後のルール
- 新機能を追加するとき、同じデータ・状態・UIを既存機能が持っていないか先にコード検索する。
- 同じ意味の項目・ラベル・状態・進捗表示を新規追加しない。既存の正本を再利用する。
- 統合候補は「実装済み」「main反映済み」「deploy済み」「本番確認済み」を混同しない。
- D1削減のための統合であっても、既存機能の仕様を壊さないことを優先する。

# 1. 基本情報

- Repository: `kingshot-bj/kingshot-data-platform`
- Branch: `main`
- Platform: Cloudflare Workers
- DB: Cloudflare D1
- Archive: Cloudflare R2
- Auth: Discord OAuth
- External API: MightPulse API
- API key architecture: EagleEye API Pool
- Queue: Cloudflare Queue
- Main device target: iPhone Safari
- Current Worker URL:
  `https://kingshot-data-platform.black-jack-kingshot.workers.dev`
- OAuth callback:
  `https://kingshot-data-platform.black-jack-kingshot.workers.dev/api/auth/callback`

---

# 2. 現在の wrangler / runtime 状態

現在確認した `wrangler.jsonc`:

- `HISTORY_STORAGE_MODE=R2_ONLY`
- `CLOUDFLARE_MONITORING_PROFILE=PAID_5USD`
- `CLOUDFLARE_USD_JPY_RATE=157.50`
- Google OAuth Client ID / Redirect URI / Drive Folder ID が vars に入っている。
- Google OAuth Client Secret と Drive Refresh Token は Secret 管理。wrangler.jsonc に入れない。

D1:
- binding: `DB`
- database: `eagleeye-db`
- database_id: `0024b5df-4dcf-45f7-b9a7-6fa621cbb80a`

R2:
- binding: `ARCHIVE`
- bucket: `eagleeye-archive`

Queue:
- producer: `SERVICE_USAGE_QUEUE`
- queue: `eagleeye-service-usage`
- consumer:
  - max_batch_size 100
  - max_batch_timeout 30 sec
  - max_retries 5
  - max_concurrency 1
  - DLQ: `eagleeye-service-usage-dlq`

Cron:
- `*/5 * * * *`

---

# 3. D1 / R2 コスト方針

## 3-1. 最終目標

$5 Paid は恒久運用ではなく**緊急避難**。
目的は開発・実測を止めず、その間に D1/R2 を最適化して、最終的に Free 枠へ戻すこと。

最終目標:
**Free枠でも余裕を持ってEagleEyeを実用運用できること。**

## 3-2. Paid included allocation

コード上の PAID_5USD 基準:

- D1 Rows Read: 25,000,000,000 / 月
- D1 Rows Written: 50,000,000 / 月
- D1 Storage: 5GB
- Workers Requests: 10,000,000 / 月
- Workers CPU: 30,000,000 CPU-ms / 月
- R2:
  - Storage 10GB
  - Class A 1,000,000 / 月
  - Class B 10,000,000 / 月

## 3-3. EagleEye 90%安全ライン

`PAID_SAFETY_FACTOR=0.90`

監視上限:

- D1 Rows Read: 22,500,000,000
- D1 Rows Written: 45,000,000
- D1 Storage: 4,500,000,000 bytes
- Workers Requests: 9,000,000
- Workers CPU: 27,000,000 CPU-ms
- R2:
  - Storage 9GB
  - Class A 900,000
  - Class B 9,000,000

---

# 4. 「50.7%」の正体【2026-09-30重要】

ユーザーがPDFを見て、
「D1やRequestsが0.x%なのになぜ安全上限が50%なのか？」
と疑問を持った。

main の `src/cloudflare-analytics.js` を確認した結果、原因は**Workers CPU推定値**。

コードでは:

- Workers CPU monthly included = 30,000,000 CPU-ms
- 90% safety ceiling = 27,000,000 CPU-ms
- Workers Analytics の `cpuTimeP50` を取得
- Requests × cpuTimeP50 でCPU使用量を推定
- D1 / Workers / R2 の各使用率のうち最大値を `budgetUtilizationPercent` として表示

直近PDFの実測表示:
- Worker Requests: 5,616
- CPU P50: 2,439 ms / invocation
- 推定CPU: 5,616 × 2,439 = 13,697,424 CPU-ms
- 27,000,000 CPU-msに対して約50.7%

したがって表示された「安全上限の最大使用率 50.7%」は、
**$5の50.7%を使ったという意味ではない。**
また、Workers Request使用率50.7%でもない。

正確には:
**「Workers CPUをP50ベースで推定した月間使用量が、EagleEyeのCPU安全監視ラインの約50.7%」**
かつ
**各リソースの使用率の最大値が50.7%だった**
という意味。

重要:
- これは実請求額そのものではない。
- CPU推定値は P50 ベース。
- Cloudflare Billingの実請求額とは別。
- 今後UIで誤解を避けるなら「CPU推定使用率（P50基準）」等の明示を検討する。

なお「CPU使用率」という言葉にも注意。
今回50.7%は「1リクエストあたりのCPU上限の50.7%」ではなく、**月間CPU-ms安全枠に対する推定値**。

---

# 5. Cloudflare Monitoringコード上の重要事項

`src/cloudflare-analytics.js`:

- `D1_FREE_LIMITS`
- `D1_PAID_INCLUDED`
- `WORKERS_FREE_LIMITS`
- `WORKERS_PAID_INCLUDED`
- `R2_FREE_LIMITS`
- `R2_PAID_INCLUDED`
- `PAID_SAFETY_FACTOR=0.90`

`getCloudflareMonitoringProfile()` で FREE / PAID_5USD を切替。

`percent(used, limit)` で使用率計算。
`resourceState()`:
- >=100 EXHAUSTED
- >=85 CRITICAL
- >=70 WARNING
- それ未満 OK

`budgetUtilizationPercent` は複数リソースの最大値。

Paid modeの estimated overage:
- D1 read overage
- D1 write overage
- Workers request overage
- Workers CPU overage
を推定。
`estimatedMonthlyCostUsd = budgetUsd + estimatedOverageUsd`。

**Cloudflare Billingそのものではない。**

---

# 6. R2履歴保存

原則:
- D1 = current / operational state
- R2 = canonical history/archive
- Google Drive = 将来の永久保管先
- Google DriveをDB/search basisにしない

R2_ONLYでは:
- ranking history
- player history
- player rank history
をR2へarchive。
R2保存成功時はD1 history INSERTをスキップ。
R2失敗時のみ History Emergency Buffer に退避し、cronでdrain。

絶対条件:
**R2_ONLYなのに大量historyをD1へfallbackしてFree枠を恒常的に消費する設計に戻さない。**

R2 gzip問題:
- 「Provided readable stream must have a known length」
- gzip payloadをArrayBuffer化してbucket.putする修正済み。
- commit: `7f5fcfa393e0ebf04f3e7a471eff537b6b7b8e41`

ただし、以前 R2 objectCount=0 / storage=0 が出たことがあり、
**R2が本番で本当に保存され続けているかは継続確認対象。**

History Emergency Buffer:
- migration: `0015_history_emergency_buffer.sql`
- commit: `201f314fee56cca623c9282adb013c1d980bb537`
- 最大50 rows
- 最大8MB
- payload約1.5MB
- RANKING / PLAYER / PLAYER_RANK
- drain commit: `1227c3dafe6a2c32b90bbc148f5fc266d13b7206`
- status JSON追加: `5ec288185ec906dda93118b8947e52dbcc91fd9d`

---

# 7. D1最重要禁止事項

**ranking_snapshots の広範囲取得を絶対に復活させない。**

禁止例:
- 最新100件
- 最新1000件
- 最新5000件
- board全体を取ってからJSで絞る
- 王国ランキング全体を取得して特定Playerだけ探す

順位変動は:
- ログインユーザー
- player_watchlists
- governor_id
- kid
- 必要board
- 直近2観測
に限定。

以前の広範囲 ranking query は削除済み:
- commit `8b807e55a501e397ff58e9371e35ee952025e182`
  - handleKingdomWatchlistDataApi の broad ranking_observations取得を削除。

---

# 8. D1最適化 / Watchlist実測

2026-09-28実測status JSON:
- `status(20260928-170316).json`
- `status(20260928-171008).json`
- `status(20260928-171652).json`

時間は**ファイル名の時刻を基準**。
JSON内部の created_at / retrieved_at / completed_at / Unix epochを画面時刻として扱わない。

17:03:16:
- D1 storage: 19,861,504 bytes / 0.4414%
- writeQueries: 71,287
- readQueries: 27,791
- rowsRead: 13,371,398
- rowsWritten: 360,766
- Workers requests: 4,849
- subrequests: 2,661
- cpuTimeMs: 11,724,882
- errors: 372

Query Insights:
- Ranking Snapshot: 37,807 / rowsRead 12,627,370 / rowsWritten 267,913
- Other Write: 33,782 / 2,316,344 / 58,116
- API Pool: 9,307 / 20,089 / 13,554
- Watchlist Job: 9,522 / 32,748 / 4,896
- Diagnostics: 2,715 / 16,700 / 1,574
- Player Observation: 653 / 182 / 502
- Player Snapshot: 317 / 142 / 255
- Other: 5,518 / 382,114 / 105
- Change Event: 101 / 325 / 8

17:10:08:
- rowsRead: 13,379,634
- rowsWritten: 363,600
- readQueries: 28,016
- writeQueries: 73,710
- Workers requests: 4,865
- subrequests: 2,673
- cpuTimeMs: 11,724,650
- errors: 372
- Ranking Snapshot unchanged
- Other Write: count 35,665 / rowsRead 2,318,227 / rowsWritten 60,039
- API Pool: 9,445 / 21,316 / 14,229
- Watchlist Job: 10,084 / 33,296 / 5,445

17:16:52:
- rowsRead: 13,379,858
- rowsWritten: 363,600
- readQueries: 28,029
- writeQueries: 73,710
- Workers requests: 4,867
- subrequests: 2,678
- cpuTimeMs: 11,748,938
- errors: 372
- Watchlist enabled: 0
- Watchlist Job +2 queries / +8 rowsRead / +0 rowsWritten
- API Pool +3 queries / +12 rowsRead / +0 rowsWritten

17:03:16 → 17:10:08:
- Rows Read +8,236
- Rows Written +2,834
- Read Queries +225
- Write Queries +2,423
- Worker Requests +16
- Subrequests +12
- Ranking Snapshot unchanged
- Other Write +1,883 queries / +1,883 rowsRead / +1,923 rowsWritten
- API Pool +138 / +1,227 / +675
- Watchlist Job +562 / +548 / +549

17:10:08 → 17:16:52:
- Rows Read +224
- Rows Written 0
- Read Queries +13
- Write Queries 0
- Ranking Snapshot unchanged
- Watchlist Job +2 / +8 / +0

Conclusion:
- +562 Watchlist Job was not new Ranking Snapshot writing.
- Deletion resulted in no D1 write during the observed 6m44s interval.
- This does NOT prove a cron can never run again; only the observed interval.
- DELETE path deletes:
  - kingdom_watchlist_jobs
  - kingdom_watchlist_locks
  - kingdom_watchlists
- Cron SELECTs enabled watchlists only.
- In-flight API/HTTP work is not forcibly aborted by DELETE, but subsequent cron runs should not pick deleted watchlists.

---

# 9. Query Insights

Important correction:
`src/cloudflare-analytics.js` already exposes SQL-level `queryInsights.queries`.

It includes:
- query
- count
- rowsRead
- rowsWritten
- rowsReturned
- durationMs
- category

Also:
- queryCount
- queries
- topWriteQueries
- topReadQueries
- categories

Therefore:
**status JSONへのSQL単位情報追加パッチは不要。**

Next time investigating Watchlist Job +562:
1. Read actual `queryInsights.queries` from the real three JSON files.
2. Normalize SQL.
3. Diff count / rowsRead / rowsWritten / rowsReturned / durationMs.
4. Filter category=Watchlist Job.
5. Map each SQL to code.
6. Classify fixed cost / player-count dependent / ranking-row dependent / API dependent.
7. Only then modify code.

Do not infer from category totals alone.

---

# 10. SERVICE_USAGE

設計:
- SERVICE_USAGE payload/bodyはD1へ保存しない。
- Worker event → Cloudflare Queue → Consumer → R2 12-hour gzip NDJSON.
- Queue batch 100 / timeout 30 sec / retries 5 / concurrency 1 / DLQ.
- R2 canonical.
- Google Drive is future final archive.
- DLQ retry and Discord notification are intended architecture.
- formal `event_id + batch_id` double idempotency is NOT yet fully implemented.
- Production behavior of all R2_ONLY/emergency-buffer paths is not fully verified.

SERVICE_USAGEの目的:
- system usage / operational events / management reporting
- D1 query/search basisにしない
- D1 resource protection

注意:
**EagleEye本体のhandoffとEagleEye Management連携用ドキュメントを混ぜない。**
Management用に追記した内容を本体handoffへ無関係に移植しない。

---

# 11. Google Drive

Google Drive:
- Personal Google account My Drive
- Google Workspaceではない
- OAuth2 offline
- scope: `https://www.googleapis.com/auth/drive.file`

vars:
- GOOGLE_OAUTH_CLIENT_ID
- GOOGLE_OAUTH_CLIENT_SECRET (Secret)
- GOOGLE_DRIVE_OAUTH_REDIRECT_URI
- GOOGLE_DRIVE_REFRESH_TOKEN (Secret)
- GOOGLE_DRIVE_FOLDER_ID

`src/google-drive.js`:
- auth URL
- token exchange
- refresh token → access token
- folder creation
- status
- duplicate check
- R2 → Drive upload
- size verification

duplicate check:
- Drive appProperties `eagleeyeSourceKey`
- normalized via encodeURIComponent

upload:
- source size == Drive size
- `verified:true`

現状:
- transport primitiveとして実装済み
- cron / retention / R2 deletion にはまだwireされていない
- OWNER-only:
  - /api/admin/google-drive/authorize
  - /api/admin/google-drive/callback
  - /api/admin/google-drive/verify
- ADMIN+OWNER:
  - /admin/google-drive
- ADMIN read-only
- OWNER verify/re-auth

本番確認:
ユーザーが実際にOAuthを完了し、
「Google Drive Refresh Tokenの交換とDrive API接続に成功しました。フォルダ例: EagleEye」
を本番UIで確認済み。

以前Refresh Tokenがスクリーンショットに露出し、revoked済み。
**Refresh Tokenは絶対に再掲しない。**

wrangler.jsoncにGoogle non-secret varsが消える問題があり修正済み:
- commit `dcd68f739456d01ff1b615f8b198e0a9cb13f34d`

Google UI / permissions commits:
- `8ad5b4123eaa9ef222ac785b328dc8a6f82e6949`
- `55d9ad4299b1b2d995eda88f056fe60ff3adebd4`
- `d25bdccf9ea66eba1dc50b98fe2f40d021de0b`
- `5d25bbf621776f20bc6d3f80935092d2bc37dbf3`

---

# 12. KingShot ID linkage / Multi-account

旧 `user_player_links` は「Discord user ↔ KingShot governor」の所有リンク。
`player_watchlists` は「Discord userが他プレイヤーを監視」であり、own account linkageには使わない。

旧migration:
- 0022 user_player_links
- 0023 official verification/support

0026:
`migrations/0026_user_player_links_multi_account.sql`
- user_player_links_v2
- old data copy
- old table drop
- rename
- MAIN/SUB
- kingdom_id
- official verification fields
- indexes / partial unique constraints

Free public limits:
- 最大2 kingdoms
- 各kingdom MAIN 1 + SUB 1
- total max 4 accounts
- 同じ王国でMAIN 1 / SUB 1

Future paid expansion:
- backend-ready
- public exposureはまだしない
- `KINGSHOT_EXTRA_ACCOUNTS_ENABLED=true` は内部bypassでありpublic entitlementではない

Relevant commits:
- `7a6ee7...`
- `8b6185...`
- `1c468d...`
- `f1f66ab...`
- `2712f61...`
- `415424c...`
- `dbe27fd...`

Production migration incident:
- initially `no such column: kingdom_id`
- then `no such table: user_player_links`
- D1 SQL Consoleで0023/0026を手動適用
- 0026実行時「このクエリはデータを返しませんでした」はDDLとして正常
- Production `/my-player` で governor `223636495` / kingdom 1524 の登録に成功
- 表示:
  - governor 223636495
  - power 161,546,169
  - alliance Pen
  - self-claimed / unverified
  - free limits 1/2 kingdoms, 1 account
- powerが古いように見えたが、直前にplayer searchを実行して最新化されたことを確認済み。
- **この登録成功はproductionで実際に確認済み。**
- ただし全migrationの完全検証済みという意味ではない。

Support:
- duplicate governor ID across different EagleEye/Discord accountsは禁止
- rightful owner can contact official Discord support
- evidence review
- old account unlink
- rightful owner official verification mark
- unauthorized registration may warn/BAN after evidence review
- owner transfer APIにはaudit log / old-account notificationがまだ不足
- reusable official badge componentも未整備
- DISCORD_SUPPORT_URLの実URLは未提供

---

# 13. Advanced eligibility / MightPulse API key

条件:
BASIC → ADVANCED は promotion-only。
両方必要:
1. own KingShot governor IDをlink
2. MightPulse API keyをAPI Poolへ提供

API key登録は先に可能。
KingShot ID link不要。

validation:
`GET /v1/kingdoms?page=1&size=1`
- 401/403: invalid
- 429: rate limit
- 5xx/timeout: temporary
- invalid/tempは保存しない
- valid only after API success then encrypted storage

`src/api-pool.js`:
- fingerprint SHA-256
- AES-GCM encryption
- AVAILABLE insert
- raw key is not returned

`src/user-eligibility.js`:
- registerUserMightPulseApiKey
- getAdvancedEligibility
- evaluateAdvancedEligibility

Relevant commit:
- `8064e7...`
- final validation: `f8fb7366e48f95f06e52e6aed806499bdb6364a1`

Current obsolete catch branch:
`PLAYER_LINK_REQUIRED_FOR_KEY_VALIDATION` is obsolete because validation no longer requires link. It is harmless but should be cleaned if touching this flow.

Logging:
`/api/me/advanced` catch logs error code/message only, not raw API key.
Never log Authorization header or key.

MightPulse public docs previously confirmed:
- base URL `https://api.mightpulse.com/v1`
- Bearer `kss_...` / X-Api-Key
- GET /v1/players/{id}?include=base
- GET /v1/kingdoms?page=1&size=24
- 401 invalid/missing
- 404 unknown resource
- 429 rate limit
- 60 req/min
- 5000/day/key
- player/alliance response may be up to ~60 min old

---

# 14. Player Watchlist / Ranking Changes

Personal Player Watchlist:
- migration 0012
- table `player_watchlists`
- UNIQUE(discord_id, governor_id)
- GET /api/player-watchlist
- POST
- PATCH enabled
- DELETE
- UI /player-watchlist
- Player page has watch button

Ranking change feature:
- “前回何位 → 今回何位”
- 26 ranking boards
- summary.ranking_changes returned by existing GET /api/player-watchlist
- no separate endpoint
- each:
  - board
  - label
  - current
  - previous
  - delta
  - observed_at

Examples:
- 個人総力 12位 → 9位 ↑3
- 個人撃破 45位 → 51位 ↓6
- 役場 8位 → 7位 ↑1
- no previous = initial
- rank out / in supported

D1 strategy:
- user’s enabled watchlist only
- kid fixed
- board fixed
- PLAYER only
- target player only
- current/previous only
- broad ranking scan prohibited

---

# 15. Player Profile / visibility

Player data includes:
- identity
- power
- town center
- VIP
- coordinates
- kills
- activity
- profile
- alliance
- heroes
- skills
- exclusive gear
- normal gear
- hero rankings
- personal rankings
- governor gear

Role:
- BASIC
- ADVANCED
- ADMIN
- OWNER

Player activity visibility includes:
- online
- last_active_at
- last_login

---

# 16. 最重要の新規調査：最終活動が「14日前」

ユーザーが、
「自分は今日ログインしたのにEagleEyeでは最終活動14日前」
と報告。

最初にEagleEye表示処理を確認:
- `formatRelativeActivity(lastActiveAt, fallback)` はlast_active_atをUnix秒として相対表示するだけ。
- Player UIは `formatRelativeActivity(p.last_active_at, p.last_login)`
- fresh/cache/observed_atも別表示。

`materializePlayer()` の保存は:
`last_active_at: value(player, "last_active_at", existing?.last_active_at)`
で、MightPulseの値をそのまま保存する。

つまり表示変換だけで14日前にしているわけではない。

---

# 17. MightPulse Probe

ADMIN/OWNER専用:
- /admin/mightpulse-probe
- API: /api/admin/mightpulse-probe 等のProbe route
- API Pool経由
- API key本体・生レスポンスは表示/保存しない
- localStorageにProbe履歴を保持

目的:
- cached_at
- age_seconds
- fresh
- HTTP
- cache headers
- timestamp-like fields
- response hash
- section hash
- Player activity
を比較。

現在のmainコードでProbeは以下を取得:
`player_activity`
- last_active_at
- last_login
- online

また全レスポンスを再帰走査し、
key名に:
- cached
- observed
- updated
- created
- modified
- timestamp
- time
- date
- active
- login
- endtime
- opened_on
- refresh
等を含む値をtimestamp candidateとして最大120件収集。

Probe UIのPlayer include:
- base
- base,ranks
- base,heroes,ranks,gov_gear

Probe response:
- request_id
- type
- target
- endpoint
- path
- query
- pool_type
- HTTP
- request/response time
- elapsed
- fresh
- cached_at
- cached_at_unix/iso
- age_seconds
- player_activity
- headers
- payload_keys
- timestamp_like_fields
- response_sha256
- section_sha256

---

# 18. Probe本番実測：Governor 223636495

ユーザーが本番Probeで `223636495` を取得。

実測:
- HTTP 200
- fresh = true
- cached_at = 2026-09-29 17:42:38 UTC
- age_seconds = 1952（再取得時）
- player.last_active_at = Unix 1789440490
- → 2026-09-15 02:48:10 UTC
- player.last_login = `Last active 14d ago`
- online = false

別の直前Probe:
- age_seconds 662
- cached_at 2026-09-29 17:42:38 UTC
- same last_active_at
- response SHA changed between probes later, indicating response content/hash comparison works.

重要:
**MightPulse APIは9/29にfresh=true / HTTP200で応答しているが、返したlast_active_at自体が9/15。**

さらにユーザーがMightPulse公式Webで同じPlayer IDを検索:
- Web表示も `Last active 14d ago`

したがって現時点では、
**EagleEyeが14日前にしている表示バグである可能性は低い。**
MightPulse APIと公式Webの表示が一致している。

ただし、
- MightPulseの `last_active_at` が何を意味するか
- `last_login` が本当のログイン日時なのか
- 別include / 別endpointに実際の最終ログインtimestampがあるか
は未確定。

Probeの `last_login` は今回、
**日時ではなく `Last active 14d ago` という文字列**だった。

---

# 19. MightPulse開発者への問い合わせ

ユーザーはMightPulse開発者と思われるDarylにDiscordで直接質問済み。

Discord:
- Daryl
- username: `darylreznov`

ユーザーが示したDiscordプロフィール:
- Discord名 Daryl / darylreznov
- 接続GitHub: darylreznov
- GitHub / PlayStation / YouTube接続あり
- GitHub: darylreznov
- YouTube: Daryl SA:MP
- 同じプロフィール写真をGitHub/Discordで使用

GitHubプロフィール:
- 公開repositories 6
- Asiana-RPG
- md-sort
- flask
- MW3SAMP
- pc-rpg-gamemode
- Diverse-Roleplay-SA-MP-
- MightPulse本体の公開repoは見当たらない
- 多くが既存repoのFork

本人確認について:
- DiscordとGitHubの同一username/接続により同一アカウント所有者であることはかなり強く裏付けられる。
- 写真が実本人かは断定しない。
- MightPulse本体コードは公開repoから確認できていない。

送った質問の趣旨:
- 日本人で日本語のKingShotデータツールをMightPulse APIで開発している
- `last_active_at`, `last_login`, `online` を確認
- 最近ログインしたPlayerでも14d agoになる
- actual last login timestampを取得できる別field/endpointがあるか
- `last_active_at` の正式な意味は何か
- 日本のKingShot player向けなのでactivity dataを正しく解釈したい

**返信待ち。**
返信内容を受けたら、MightPulse仕様を最優先で解釈し、EagleEye側を必要以上に変更しない。

---

# 20. Google Drive / Management / SERVICE_USAGEの境界

EagleEye本体とEagleEye Managementの連携内容を混ぜない。

過去にManagement向けの追記を本体handoffに入れてしまい、ユーザーが
「それはManagementとの連携用だろ。いままで使ってたmdだよ」
と指摘した経緯あり。

今後:
- 本体の実装・D1/R2/API Pool/Player/Watchlist等 → EagleEye handoff
- Management連携専用の内容 → Management側ドキュメント
- 本体handoffには必要最小限の「境界・関連」だけを書く

---

# 21. Diagnostics / System Status

Diagnostics:
- API Pool
- MightPulse
- D1
等の健康状態。

System Statusには:
- API Pool Health
- MightPulse
- Watchlist
- Database
- R2 Archive
- Google連携
- Runtime / Cron
等を表示。

/admin/diagnostics:
- ADMIN/OWNER向け

/status:
- EagleEye全体の運用状況確認
- 公開ページ
- CRITICAL / DEGRADED / SUCCESS

System Status:
- API keys/secretsは表示しない
- latest deploy error表示
- refresh中はrefresh buttonを無効化する方針
- D1 Query Insightsは表示可能
- 各featureのD1 resource consumptionを確認できるようにする

---

# 22. 過去のD1実測と最適化方針

過去の主因:
- ranking_snapshots INSERT
- Watchlist
- API Pool
- Other Write
など。

D1 Free daily row read limitに到達した経験あり:
`D1_ERROR: Your account has exceeded D1's free tier daily row read limit...`

重要:
- data lossではない
- read quota failure
- resetは00:00 UTC / 09:00 JST
- Paid化で継続可能
- ただしPaidは緊急避難でありFree復帰が目標

D1 indexes:
migration 0011:
- idx_ranking_snapshots_target_history
- idx_ranking_snapshots_current
- idx_player_snapshots_governor_history
- idx_player_rank_snapshots_governor_history
- idx_change_events_target_time
- idx_api_observations_target_time

runtime bootstrapにも同系indexあり。
一部重複は将来整理可能。

---

# 23. Player observation / history

Change events:
- POWER_CHANGED
- TOWN_CENTER_CHANGED
- ALLIANCE_CHANGED
- COORDINATES_CHANGED
- ACTIVITY_CHANGED
- KILLS_CHANGED
- PLAYER_FIELD_CHANGED

`old_value_json` / `new_value_json`

Player history:
- player_snapshots
- player_rank_snapshots
- change_events

R2への移行を進めている。
---

# 24. Retention

/admin/data-retention

対象:
- api_observations_days
- player_snapshots_days
- ranking_snapshots_days
- player_rank_snapshots_days
- change_events_days
- api_pool_usage_days

推奨初期値:
- API 14日
- player 90日
- ranking 180日
- player ranking 180日
- change events 2年
- API Pool 90日

永久保存も可能。

---

# 25. SQL variables / bulk insert

過去:
`D1_ERROR: too many SQL variables at offset 308`

原因:
大量INSERT。

対策:
- change_events等を約50件chunkに分割。

今後大量INSERTを追加する場合も同様にchunkingする。

---

# 26. UI方針

- iPhone Safari優先
- dark EagleEye基調
- card UI
- 大きいtap area
- mobile overflow回避
- 数値は必要箇所でK/M/B
- 同盟略称表示
- Town Center = 役場
- 日本語KingShot用語を優先

---

# 27. 主要コミット一覧

D1 / ranking:
- `17852cca254dc644d0493967e1d6e76fdc6cd03f` D1 read optimization
- `6134fdab4028a0b1466eb222046b67dd1f0d97e7` migration 0011
- `ea06a404e0993d30e75caba3c7a7ada592f30c00` runtime indexes
- `8b807e55a501e397ff58e9371e35ee952025e182` broad ranking query removal

Player Watchlist:
- `f280d2e12f9421e09e4a885c6f4c0a6b301d6527` personal player watchlist
- `26fef71eea2a48c7f0eb1e76b87f33c2fa4dc9d1` player ranking changes
- `02b3fd3e054eb04f71d3e694c8ed6ba6f2651137` remove legacy ranking scans
- `a71f6c0fc5cd730b5cfe6c6fd1b0d3bc05610982` player watchlist field changes
- `5e02be7b4d3dc7b6ef668892fe4d7d666ca8c590` MightPulse Probe comparison analysis

Diagnostics:
- `1c13ddc3b940e7ade760cded01674ebf4181c208`
- `32caa5cdd46deaf2343202c93cdb010dfaf84ad4`
- `2bbd614ce4f7fd88a7cc2d306d56ada563fa0142`
- `609162592b0ec92563cb5b0da17ccc052a6112e8`
- `e88fdcd28c99ff3fd0ecc445b771d90da15dd6f6`
- `32a915dcbc04bf718fe28a27a7d0edf15b64715d`
- `af07299e12895703bc9d260fc08664f988bc2029`

Paid monitoring:
- `b4ac602fadfcf2fbd01c818475dfec9a36f3f7eb`
- `c52d4a30ce7cf9ec0dcf61be2ed018d2f7964705`
- `bc6d45f1724c9156866d59a2b9fc2dc662950a14`
- `94752aee8332430e54096a96818ab42ce4576152`
- `ef42b0874f66a9d860c7f462c72dbbb46307f3f0`
- `dd6439925295ea36f87a4040d9a083fbc006f825`
- `b1fb1350cdf751c0a977676a6e62407439d013a5`
- `eb425ebe8650da036956e2817089473f7819a25f`

R2:
- `7f5fcfa393e0ebf04f3e7a471eff537b6b7b8e41`
- `201f314fee56cca623c9282adb013c1d980bb537`
- `1227c3dafe6a2c32b90bbc148f5fc266d13b7206`
- `5ec288185ec906dda93118b8947e52dbcc91fd9d`

Google Drive:
- `8ad5b4123eaa9ef222ac785b328dc8a6f82e6949`
- `55d9ad4299b1b2d995eda88f056fe60ff3adebd4`
- `d25bdccf9ea66eba1dc50b98fe2f40d021de0b`
- `5d25bbf621776f20bc6d3f80935092d2bc37dbf3`
- `dcd68f739456d01ff1b615f8b198e0a9cb13f34d`

User/KingShot links:
- `7a6ee7...`
- `8b6185...`
- `1c468d...`
- `f1f66ab...`
- `2712f61...`
- `415424c...`
- `dbe27fd...`

Advanced:
- `8064e7...`
- `f8fb7366e48f95f06e52e6aed806499bdb6364a1`

---

# 28. 未確認・未完了事項

本番確認済みとは扱わない:

1. R2 archiveが全履歴で期待通り保存され続けていること
2. R2_ONLY / emergency bufferの長時間本番挙動
3. Free復帰後の実用運用
4. 長時間Watchlist運用時のD1 usage
5. Cloudflare Billing実請求額とEagleEye estimatedMonthlyCostの完全一致
6. SERVICE_USAGEのbatch_id + event_id二重idempotency
7. Google Driveをcron/retention/R2 deletionまで完全接続する運用
8. Owner transferの完全なaudit/old-account notification
9. MightPulse `last_active_at` の正式意味
10. MightPulseで本当のlast login timestampを別field/endpointから取得できるか
11. Player activityを別の正式フィールドへ置き換えるべきか
12. Watchlist Job +562のSQL単位内訳
13. 全multi-account migration/transfer edge cases
14. current mainの最新HEADとdeploy本番の完全一致

---

# 29. 次スレッド開始時の優先順位

## 最優先
1. GitHub mainの最新HEADを確認。
2. 本handoffとmainの差分を確認。
3. 直近commitを確認。
4. 本番確認済み / 未確認を再整理。

## MightPulse返信が来た場合
5. Darylからの回答を確認。
6. `last_active_at` の定義を確認。
7. 実際のlast login timestampが別field/endpointにあるか確認。
8. 仕様が確定してからEagleEyeの表示・保存方針を決定。
9. 推測でlast_active_atを改変しない。

## 返信がまだの場合
10. Probeを使って別include:
   - base
   - base,ranks
   - base,heroes,ranks,gov_gear
   を比較。
11. `timestamp_like_fields` の候補を確認。
12. D1変更はまだしない。

## D1最適化
13. 3 status JSONの `queryInsights.queries` を全件比較。
14. Watchlist Job +562の正体をSQL単位で確定。
15. 変更可能ならD1削減効果を試算。
16. ranking_snapshots broad scanを復活させない。

## コスト監視
17. CPU 50.7%表示の意味をUI上で誤解しないよう改善するか検討。
18. D1/Workers/R2各使用率を分離表示する案を検討。
19. Free復帰条件を実測で決める。

---

# 30. 次スレッドへの伝言

現在の大きな状態は、

**EagleEye本体の「最終活動14日前」は、現時点ではEagleEyeの表示バグではなさそう。**
MightPulse APIがfresh=true / HTTP200で14日前を返し、MightPulse公式Webも14日前表示。
ただし本当の最終ログイン日時を別APIから取れる可能性はまだ残っているため、MightPulse開発者への問い合わせ結果を待つ。

また、

**System Statusの50.7%はD1でもRequestでもなく、Workers CPU P50ベース推定の月間CPU安全枠使用率。**
$5を50.7%使ったという意味ではない。

そしてEagleEyeの本命は変わらない:

**$5 Paidは緊急避難。最終的にはD1/R2を最適化してFree枠へ戻す。**



---

# 31. MightPulse activity information removal — 2026-09-30

Daryl (MightPulse developer) replied regarding the activity fields:

> “The game removed the activity information about 2 weeks ago. So, that's why API returns an old data.”

Confirmed interpretation:
- KingShot removed the activity information approximately two weeks before the 2026-09-30 investigation.
- MightPulse API is therefore returning the last available activity data.
- `last_active_at` / `last_login` must not be interpreted as the player's current/latest login status.
- The previously observed “14d ago” is not an EagleEye formatting bug.

EagleEye implementation on 2026-09-30:
- Removed `last_active_at` / `last_login` from normal player-facing output.
- Removed them from normal player export output.
- Removed them from the public player visibility response.
- Stopped generating player change events from `last_active_at`.
- Database columns are intentionally retained for compatibility; no migration/drop was performed.
- MightPulse Probe retains the raw activity fields for diagnostic/research purposes only.
- `online` remains user-facing temporarily.

Pending confirmation from Daryl:
- Whether the `online` field is still maintained and reliable/current.
- Do not assume `online` is valid until this is clarified.

User-facing rule:
**Never present `last_active_at` / `last_login` as current activity or latest login information.**

## 32. MightPulse APIキー複数提供対応 — 2026-09-30

- ユーザーがMightPulse APIキーを最大3本までPoolへ提供できるよう実装。
- registerUserMightPulseApiKey() にユーザー単位の未REVOKEDキー数上限3本を追加。
- 同一キーの重複提供はSHA-256 fingerprintで検知し、MIGHTPULSE_API_KEY_ALREADY_REGISTERED として拒否。
- /api/me/advanced GET は mightPulseKeyCount / mightPulseKeyLimit / apiKeys を返すよう変更。
- /my-player のAdvanced条件UIは登録本数を n / 3 で表示し、3本未満なら追加入力欄を継続表示。
- 既存のAdvanced昇格条件は「領主IDを1つ以上」＋「MightPulse APIキーを1本以上」で維持。2本目・3本目の提供はPool容量強化として扱い、昇格条件そのものは変更しない。
- 直前の修正で /api/me/mightpulse-key に configureApiPoolEncryption(env.EAGLEEYE_SESSION_SECRET) を追加済み。今回の複数キー対応でもこの暗号化保存経路を継続利用。


---

# 33. Discord問い合わせシステム実装開始 — 2026-09-30

EagleEye本体側で、将来のEagleEye Management連携を前提としたDiscord問い合わせ基盤の実装を開始。

## 33-1. 実装済み

新規:
- `src/discord-support.js`

実装内容:
- collision-resistant ticket ID:
  - `EE-YYYYMMDD-XXXX`
- Discord Bot API v10経由のprivate support channel作成
- EagleEye Supportカテゴリへの配置
- `@everyone` のView Channel拒否
- 問い合わせユーザーへのchannel権限付与
- Support Roleへの権限付与
- Botへの権限付与
- channel topicへのticket ID / user / OPEN状態記録
- 初期問い合わせ本文の投稿
- 問い合わせユーザーがSupport Guildに所属していない場合の拒否
- 初期メッセージ投稿失敗時のchannel cleanup
- close処理の基盤
  - ユーザーの投稿権限を停止
  - status=CLOSEDへ変更
  - archive categoryが設定されていれば移動
  - channel自体は削除しない
- `POST /api/support` 用のhandler基盤
- 入力:
  - category
  - subject
  - message
- category whitelist
- subject/message length validation

## 33-2. Runtime configuration

`wrangler.jsonc` に以下の非secret設定枠を追加:
- `DISCORD_SUPPORT_GUILD_ID`
- `DISCORD_SUPPORT_CATEGORY_ID`
- `DISCORD_SUPPORT_ROLE_ID`
- `DISCORD_SUPPORT_ARCHIVE_CATEGORY_ID`

Secret:
- `DISCORD_BOT_TOKEN`
  - wrangler.jsoncへ書かない
  - Cloudflare Secretとして設定する

## 33-3. まだ未実装 / 未確認

重要:
- `src/discord-support.js` は基盤実装段階。
- 本体Workerのroute dispatcherへの接続はまだ未完了。
- ユーザー向け問い合わせフォームUIはまだ未実装。
- Discord BotのGuild / Category / Support Role / Archive Categoryの本番IDは未設定。
- Discord Bot tokenは未設定。
- `/close` slash command / Discord interaction endpointは未実装。
- Management側との実運用integrationは未実装。
- D1への問い合わせ本文保存は行わない方針。

したがって現時点で、問い合わせ機能を「実装済み」「本番利用可能」「本番確認済み」とは扱わない。

## 33-4. 設計原則

User:
EagleEye問い合わせフォーム
→ EagleEye main
→ Discord Bot
→ private Discord ticket channel

Operator future:
EagleEye Management
→ explicit integration boundary / Discord Bot
→ private Discord ticket channel
→ User

Discordを初期会話履歴の本体とし、EagleEye main D1へ会話本文を複製しない。

Managementで将来検索が必要になった場合は、Discord本文を複製するのではなくManagement-owned metadata/indexを検討する。

Ticket IDは3層共通のstable identifierとして扱う。

## 33-5. 次の実装順

1. 本体Workerのroute dispatcherへ`handleSupportApi`を接続。
2. `/support` のiPhone Safari向け問い合わせフォームを実装。
3. 送信成功時にticket ID / Discord channelへの導線を表示。
4. Discord Bot本番設定を投入。
5. Guild membership / private channel permissionを本番で確認。
6. 初期ticket作成→会話→closeのproduction test。
7. その後、Discord slash command `/close` を実装。
8. Management側Integration Requestと照合し、Management連携APIを設計。

本番確認前は必ず「コード上実装」「deploy済み」「本番確認済み」を区別する。

# 34. Discord問い合わせ接続実装 — 2026-09-30

## 34-1. GitHub側で実装済み

- `src/index.js`
  - `/support` ユーザー向け問い合わせフォームを追加
  - `POST /api/support` を `handleSupportApi` へ接続
  - ホーム画面のログイン後ナビに「お問い合わせ」を追加
  - `POST /api/discord/interactions` をDiscord Interaction endpointとして追加
  - `POST /api/admin/discord-support/register-command` を追加
    - ADMIN / OWNERのみ
    - Discord Guildへ `/close` slash commandを登録
- `src/discord-support.js`
  - Discord Interaction署名検証
  - Discord verification ping対応
  - `/close` interaction処理
  - Support Role以外のclose実行を拒否
  - EagleEye Support Guild以外を拒否
  - EagleEye Support ticket channel以外を拒否
  - Support category / Archive category以外を拒否
  - topicに記録したticket ID / user IDを基準にユーザー権限を停止
  - close後もchannelは削除せず、CLOSED + archive category移動
  - Guild-scoped `/close` command登録関数
- `wrangler.jsonc`
  - `DISCORD_PUBLIC_KEY` の非secret設定枠を追加

## 34-2. Discord側でユーザーが設定するもの

まだ本番設定・本番確認はしていない。

必要:
- Discord Application / Bot
- Bot Token → Cloudflare Secret `DISCORD_BOT_TOKEN`
- Application Public Key → `DISCORD_PUBLIC_KEY`
- Support Guild ID → `DISCORD_SUPPORT_GUILD_ID`
- Support Category ID → `DISCORD_SUPPORT_CATEGORY_ID`
- Support Role ID → `DISCORD_SUPPORT_ROLE_ID`
- Archive Category ID → `DISCORD_SUPPORT_ARCHIVE_CATEGORY_ID`
- BotをSupport Guildへ追加
- Botに必要最小限の権限を付与
- Discord Developer PortalのInteractions Endpoint URL:
  `https://kingshot-data-platform.black-jack-kingshot.workers.dev/api/discord/interactions`

## 34-3. /close command

GitHub側のcommand登録APIは実装済み。

設定後:
1. EagleEyeへBot Token / Public Key / Guild / Category / Role / Archive Category IDを投入
2. Workerをdeploy
3. ADMIN / OWNERで `POST /api/admin/discord-support/register-command` を実行
4. Support Guildで `/close` が表示されることを確認
5. Support Roleを持つ運営のみ実行可能
6. close時:
   - ユーザーの投稿権限停止
   - topic status=CLOSED
   - Archive Category設定時は移動
   - channelは削除しない

DiscordのApplication CommandsはHTTP APIで登録し、初期確認はGuild-scoped commandを使用する。

## 34-4. D1方針

問い合わせ本文・会話履歴はEagleEye D1へ保存しない。

現在の問い合わせフロー:
EagleEye /support
→ POST /api/support
→ Discord Bot
→ private ticket channel

Discordを初期会話履歴の本体とする。

将来Managementで一覧・検索が必要になった場合は、Discord本文の複製ではなくManagement-owned metadata/indexを検討する。

## 34-5. 未確認

- Discord Bot Token設定後の本番ticket作成
- Guild membership check
- private channel permission
- 初期メッセージ投稿
- /close command登録
- Discord Interaction endpoint verification
- /closeによる権限停止
- archive category移動
- iPhone Safariでの問い合わせ送信
- Discord側でユーザーとSupport Roleだけが閲覧できること

したがって現時点では「コード実装済み」であり、「本番利用可能」「本番確認済み」ではない。

# 35. Discord問い合わせリオープン対応 — 2026-09-30

## 35-1. GitHub側で実装済み

- `src/discord-support.js`
  - `reopenSupportTicket()` を追加
  - CLOSED状態のEagleEye Support ticketのみリオープン可能
  - Support Roleのみ `/reopen` を実行可能
  - アーカイブカテゴリから通常のSupportカテゴリへ戻す
  - topicの `status=CLOSED` → `status=OPEN`
  - ticket作成時に記録したユーザーのchannel permissionを復元
    - allow: `68608`
    - deny: `0`
  - channel自体は削除せず、同じticket ID / channelを継続利用
- Discord Interaction
  - `/close`
  - `/reopen`
  の2コマンドを処理。
- command登録処理
  - `/close` / `/reopen` の両方をGuild-scopedで登録
  - 既存commandがあればPATCH、なければPOST
  - 既存commandを毎回重複作成しない方式へ変更。
- `src/index.js`
  - `/api/admin/discord-support/register-command` は両commandを登録し、結果を配列で返す。

## 35-2. リオープンの状態遷移

通常:
`OPEN → CLOSED`

再開:
`CLOSED → OPEN`

CLOSED時:
- ユーザーのView/Send/History権限を停止
- Archive Categoryへ移動

REOPEN時:
- ユーザーのView/Send/History権限を復元
- Support Categoryへ移動
- statusをOPENへ戻す

会話履歴:
- 同じDiscord channelを継続使用
- EagleEye D1には保存しない

## 35-3. 安全条件

`/reopen` も `/close` と同じく:
- Support Guild限定
- Support Role限定
- EagleEye Support ticket channel限定
- Support / Archive category限定
- topic内のticket ID / user IDを検証

CLOSED以外のticketを `/reopen` しても `SUPPORT_TICKET_NOT_CLOSED` で拒否する。

## 35-4. 未確認

以下はまだ本番確認していない:
- `/reopen` commandがDiscord Guildに正常登録されること
- CLOSED → OPENでユーザー権限が正しく復元されること
- Archive → Support Category移動が成功すること
- リオープン後にユーザーが再びメッセージを投稿できること
- `/close → /reopen → /close` の往復動作
- iPhone Safari / Discord側での実運用確認

したがって現時点では「コード実装済み」であり、「本番確認済み」ではない。


## Support v2 実装（2026-09-30）

- 目的：ユーザー負担と1人運営時のサポート負担を同時に削減。
- 実装ブランチ：`feature/support-v2`
- 問い合わせを「カテゴリ → サブカテゴリ → Q&A/解決案内 → 未解決時のみ問い合わせ」のウィザード化。
- 必要な項目だけ追加収集し、自由記述を最小化。
- Discordチケット作成時にカテゴリ階層、Q&A ID、追加情報、関連する異常検知情報を初期メッセージへ引き継ぐ。
- 既存の `diagnostic_events` を参照し、直近30分以内の WARNING/FAILED をサポート画面へ表示。正式なIncidentテーブルは新設していない。
- 問い合わせ履歴をD1へ保存しない設計は維持。Q&Aカタログもコード内定義。
- サポート画面の異常コンテキストはWorker isolate内30秒キャッシュ。キャッシュミス時に `diagnostic_events` を1行参照するだけで、書き込みなし。
- チケット作成は従来通りDiscord APIのみ。
- 既存のランキング/ウォッチリスト取得処理、`ranking_snapshots` 広域読み取り、service usage書き込み経路は変更していない。
- 旧 `POST /api/support` はsubcategory省略時に `OTHER` へフォールバックし、既存category + subject + message クライアントとの互換性を維持。
- 未確認：本番Support UI、本番Discordチケット作成、本番Discord permission overwrite `68608`、本番障害発生時の案内挙動、本番D1実測値。


## 2026-09-30 Preview環境表示

- Preview版の全HTMLページに共通テーマ経由で「🧪 PREVIEW — 開発版 / 本番ユーザーには表示されません」バナーを表示する実装を追加。
- Production Workerのホスト名（kingshot-data-platform.black-jack-kingshot.workers.dev）以外ではPreview表示として判定。
- `wrangler.jsonc` に `EAGLEEYE_ENV=production` / Previewでは `EAGLEEYE_ENV=preview` を追加。
- Previewは本番D1/R2を共有する現構成のため、Preview操作が本番データへ影響し得る点は継続注意。
- 2026-09-30時点で、この変更後のPreview Build/実機動作は未確認。Build成功や本番動作確認済みとは扱わない。

# 36. Support v2 初期表示不具合の原因特定 — 2026-09-30 19時台

## 36-1. 本番確認状況

ユーザーがProductionの `/support` をiPhone Safariで確認。
- f6eba51edecbb95afaed578d837cce135f3f57dd のデプロイ完了はユーザー側で確認済み。
- しかし問い合わせ画面は、説明文の下にカテゴリ一覧が表示されず空白。
- したがって Support v2 の本番UIはまだ「動作確認済み」ではない。

重要:
**本番で確認できたのは「f6eがデプロイされたこと」と「/supportの説明HTMLが表示されること」まで。カテゴリウィザードの動作は未確認かつ現状不具合。**

## 36-2. 調査結果

原因は障害情報APIの遅延ではなく、**問い合わせページ内のブラウザJavaScript構文エラー**。

`src/index.js` の `renderSupportPage()` 内 `render3()` に、生成HTMLのinput value属性を組み立てる処理がある。

```js
html+="<div class='field'><label>"+labels[f]+"</label><input data-d='"+f+"' maxlength='1000' value=\""+(f==="governor_id"?esc(state.governorId):"")+"\"></div>";
```

この部分はWorker側のテンプレートリテラルから、さらにブラウザ側JavaScript文字列を生成している。そのためProductionで生成されたブラウザJSでは属性部分の引用符が崩れ、`render3()`を含むスクリプト全体がパースエラーになる。

生成後のSupportページJavaScriptを実際に取り出して構文解析した結果:
- `Unexpected string`
- つまりIIFE自体が実行されない
- `renderInitial()`にも到達しない
- `/api/support/context` も呼ばれない

このため画面は次の状態になる:

```text
サーバー生成HTML
  ↓
「お問い合わせ」の説明文は表示
  ↓
<script> のブラウザJSをパース
  ↓
❌ SyntaxError
  ↓
renderInitial() 実行されない
  ↓
カテゴリ一覧が表示されない
```

## 36-3. f6eで入れた「障害情報API非ブロッキング」は正しい

f6eba51... で以下を実装済み:

1. `renderInitial()` を `/api/support/context` より先に実行。
2. `/api/support/context` はカテゴリ表示後にバックグラウンド取得。
3. `diagnostic_events(status, created_at DESC)` 複合indexを追加:

```sql
CREATE INDEX IF NOT EXISTS idx_diagnostic_events_status_created
  ON diagnostic_events(status, created_at DESC);
```

4. `getSupportIncidentContext()` に `elapsed_ms` 計測ログを追加:

```js
console.log("support_incident_context_query", {
  elapsed_ms: Date.now() - queryStartedAt,
  found: Boolean(row)
});
```

ただしブラウザJSが構文エラーなので、今回の画面ではこの非ブロッキング化の効果まで到達していない。

## 36-4. 次スレッドで最初にやること

### 最優先: Support v2 JS修正

`render3()` の生成HTMLでJavaScript文字列とHTML属性引用符が衝突しないよう修正する。

推奨:
- `value='...'` のように外側のJS文字列と衝突しない引用方式へ変更する。
- あるいはDOM属性値生成を安全なescape/attribute helperへ切り出す。
- 二重にテンプレートを生成する現在の構造を考慮する。

### 修正後に必ず行う検証

1. `src/index.js` Worker側の構文確認。
2. **renderSupportPage() が生成する最終HTMLを生成し、内包される `<script>` を実際にJavaScript parserへ通す。**
3. Preview Build確認。
4. Preview `/support` をiPhone Safariで確認。
5. mainへ反映。
6. Production deploy完了確認。
7. Production `/support` でカテゴリ一覧が表示されることをユーザー実機で確認。
8. カテゴリ → サブカテゴリ → Q&A → 未解決 → 入力 → 送信まで確認。
9. その後 `/api/support/context` の `support_incident_context_query elapsed_ms` を実測し、障害情報APIが本当に遅いのかを別途評価。

**「カテゴリが表示された」ことと「障害情報APIが高速化された」ことは別々に確認する。**

## 36-5. 未実施

- この原因に対する修正コードはまだコミットしていない。
- f6eの次の修正commitはまだ存在しない。
- Production Support v2のカテゴリUIは未確認。
- `0027_diagnostic_status_created_index.sql` がProduction D1へ適用済みかは、今回の調査では確認していない。
- `support_incident_context_query` の本番実測値もまだ取得していない。

**次スレッドでは、まずブラウザJS構文エラーを修正してから、Productionで実機確認すること。**


# 37. Discord Support Secret消失防止・重要注意事項 — 2026-09-30

今回、Discord SupportのSecret状態について本番で「Archive Category IDだけ未設定」が再発した。

## 37-1. 現時点で確定している事実

本番 `/admin/diagnostics` で確認できた状態:
- DISCORD_SUPPORT_GUILD_ID: 設定済み
- DISCORD_SUPPORT_CATEGORY_ID: 設定済み
- DISCORD_SUPPORT_ROLE_ID: 設定済み
- DISCORD_SUPPORT_ARCHIVE_CATEGORY_ID: **未設定**

現在の `wrangler.jsonc` には `DISCORD_SUPPORT_*` 4項目の vars / previews.vars は存在しない。

## 37-2. 重要な原因調査の訂正

以前の本書では、空文字の同名 `vars` がSecretを「上書き・消失させた」と断定していた。これは表現を訂正する。

Cloudflare公式仕様では、通常の `wrangler deploy` で `secrets` に含まれていないSecretは前バージョンから保持される。Secretを削除するには `wrangler secret delete` / `wrangler versions secret delete`、Dashboardからの削除、またはSecret bulkで明示的に削除する操作が必要。

したがって、**今回のArchive Category IDが未設定になった直接原因は、現時点のGitHubコードだけからは特定できない。** 少なくとも現在の `wrangler.jsonc` には削除操作は存在しない。

一方、以前存在した同名空文字 `vars` は、Secretと同名の設定を置く危険な構成だったため、既に削除済みであり、今後も再追加禁止とする。

## 37-3. 再発防止をコード側へ追加

`wrangler.jsonc` にCloudflare Wranglerの `secrets.required` を追加した。

必須Secret:
- DISCORD_CLIENT_SECRET
- DISCORD_BOT_TOKEN
- DISCORD_PUBLIC_KEY
- DISCORD_SUPPORT_GUILD_ID
- DISCORD_SUPPORT_CATEGORY_ID
- DISCORD_SUPPORT_ROLE_ID
- DISCORD_SUPPORT_ARCHIVE_CATEGORY_ID
- EAGLEEYE_SESSION_SECRET

修正commit:
- a40f7c631925ce0e86d684cc95f27282cb3a277c
- fix: require Discord support secrets before deploy

これにより、上記Secretのどれかが未設定なら、Wrangler deployは成功前に失敗する仕様へ変更した。

## 37-4. デプロイ前後の確認ルール

1. `wrangler.jsonc` の `vars` / `previews.vars` に `DISCORD_SUPPORT_*` を置かない。
2. `secrets.required` 8項目が維持されていることを確認する。
3. deploy後、EagleEye `/admin/diagnostics` で全Secret項目が「設定済み」であることを本番確認する。
4. 1項目でも「未設定」ならSupport E2Eへ進まない。
5. Secret削除の直接原因を確定するにはCloudflare側のSecret操作履歴/Audit Logが必要。GitHubコードだけでは誰が・いつ削除したかまでは判定できない。

## 37-5. 今回の復旧時に使用した値

本番設定として既に確認されているSupport ID:
- Support Server ID: 1554824550859153448
- Support Category ID: 1554828614359318568
- Support Role ID: 1554826025895206982
- Archive Category ID: 1554828896233332826

※Secret値は今後コード・ログへ書かない。

# 38. 診断ログ網羅性監査・Discord Support実行ログ追加 — 2026-09-30

## 38-1. 目的

「機能として実装されているのに、障害・成功・実行結果がdiagnostic_eventsへ残らず、/statusや/admin/diagnosticsから追跡できない」箇所がないかをmainコード全体で監査。

CloudflareのWorker/D1自体のconsoleログとは別に、EagleEye内部の永続診断イベントとして追跡できることを基準とする。

## 38-2. 今回追加した永続診断ログ

### Discord Support

以下をservice=`discord_support`として記録:

- Guild自動参加
  - feature=`guild_membership`
  - operation=`GUILD_JOIN`
  - SUCCESS / FAILED
  - Discord HTTP status / Discord error codeをmetadataへ記録
  - OAuth access token / Bot Tokenは記録しない
- 問い合わせチケット作成
  - operation=`CREATE_TICKET`
  - SUCCESS / FAILED
  - ticket ID / channel ID / category / subcategory
- `/close`
  - operation=`CLOSE_TICKET`
  - SUCCESS / FAILED
- `/reopen`
  - operation=`REOPEN_TICKET`
  - SUCCESS / FAILED
- Slash command登録
  - feature=`slash_commands`
  - operation=`REGISTER_COMMANDS`
  - SUCCESS / FAILED

### Discord OAuth

既存の`discord` serviceにも以下を追加:

- OAuth token exchange failure
- Discord user lookup failure
- D1 user persistence failure

## 38-3. その他の不足ログとして実装したもの

- データ保持期間クリーンアップ
  - service=`retention`
  - feature=`data_retention`
  - operation=`CLEANUP`
  - SUCCESS / FAILED
  - deleted / archived件数をmetadataへ記録
- 履歴緊急バッファ排出
  - service=`history_storage`
  - feature=`history_emergency_buffer`
  - operation=`DRAIN`
  - SUCCESS / WARNING / FAILED
  - attempted / archived / failed / remainingを記録

## 38-4. 診断サービス一覧の拡張

`src/diagnostics.js` のDIAGNOSTIC_SERVICESへ以下を追加:

- `discord_support` — Discord Support
- `retention` — データ保持
- `history_storage` — 履歴ストレージ

これにより、イベントが存在しない場合もUNKNOWNとして/admin/diagnosticsのサービス一覧から検知できる。

## 38-5. 監査で確認した「永続diagnostic_eventsが不要なもの」

以下は機能上のHTTP/UIエラーや管理画面操作ログであり、現時点ではサービスヘルス診断イベントへ機械的に全件投入しない方針。

- プレイヤー/ランキング各画面のHTTPエラー
- API Pool管理画面のCRUDエラー
- diagnostics画面自身の表示エラー
- 一般的なHTMLページ描画エラー
- service usage queueの内部ログ

これらは必要な場合、別途request/auditログとして設計する。

## 38-6. 追加監査で対応したもの

追加確認の結果、以下もdiagnostic_eventsへ記録するよう修正済み:

- Google Sheets実データexport
  - PLAYER_EXPORT
  - KINGDOM_EXPORT
  - SUCCESS / FAILED
- Player R2 history read failure
- Player ranking R2 history read failure
- Kingdom ranking R2 history read failure

これにより、設定確認だけでなく、実際の外部保存/読込処理の失敗も追跡可能になった。

### 38-6-1. 現時点で意図的に対象外

以下は「サービスヘルス」ではなく、ユーザー操作・管理画面操作・HTTPリクエスト単位の監査に近いため、diagnostic_eventsへ全件投入しない:

- プレイヤー/ランキング各画面のHTTPエラー
- API Pool管理画面のCRUDエラー
- diagnostics画面自身の表示エラー
- 一般的なHTMLページ描画エラー
- service usage queue内部ログ
- Google Drive OAuth/設定画面の操作ログ
- 一般ユーザーのPlayer/Ranking refresh成功イベント

これらは必要になった場合、diagnostic_eventsとは別のrequest/audit/event系で扱う。

## 38-7. 重要

今回の変更はGitHub mainへ反映したコード上の実装であり、**本番Workerへdeployして実際にdiagnostic_eventsへ記録されることは、この時点では未確認**。

本番確認時は最低限:

1. Discordログアウト
2. Discord再ログイン
3. Support Guild自動参加
4. /supportからticket作成
5. /admin/diagnosticsでDiscord Supportイベント確認
6. /close
7. /reopen
8. それぞれのSUCCESS/FAILEDイベントとtrace_id確認

まで行う。

# 39. 2026-09-30 テスター実運用・API Pool/王国ウォッチリスト障害ログ引き継ぎ

## 39-1. 今回の実運用テスト

ユーザーが複数のテスターへ以下を依頼して実際に触ってもらった。

- MightPulse APIキーの提供
- 王国ウォッチリスト等、既に利用可能な機能をあらかた実操作
- その中で少なくとも1名について、王国ウォッチリスト登録時にエラー発生
- API Pool内で相当数のキーが無効化/無効状態になった
- 手動更新を行っても復旧できないキーが複数存在
- OWNER権限で一部キーを無効化処理した

今回の目的は「実ユーザーが雑に機能を触った際に、API Pool / Watchlistがどこで壊れるか」をログから洗い出すこと。

## 39-2. 最新 status-7.json で確認できた事実

最新の本番取得ログ `status-7.json`（2026-09-30 16:39:56Z作成）には、王国ウォッチリスト関連で複数の `NO_API_POOL_KEY_AVAILABLE` が記録されている。

確認できた例:

- `kingdom_watchlist / INITIAL_REFRESH / NO_API_POOL_KEY_AVAILABLE`
- `kingdom_watchlist / MANUAL_REFRESH / NO_API_POOL_KEY_AVAILABLE`
- `kingdom_watchlist / RUN / NO_API_POOL_KEY_AVAILABLE`

特に `MANUAL_REFRESH` でも `NO_API_POOL_KEY_AVAILABLE` が出ているため、
「手動更新すれば無効キーから自動復旧できる」という状態ではない。

同時刻帯には `FETCH_COMPARE_SAVE` が `rows_received=100 / rows_saved=100` で成功している王国ランキング処理も存在する。

したがって、**MightPulse全体が完全停止しているわけではなく、API Poolのキー割り当て/利用可能キー不足と、ランキング取得処理そのものを分離して調査する必要がある。**

## 39-3. Watchlist障害の時系列として読めること

status-7では、ウォッチリスト登録時の `INITIAL_REFRESH` だけでなく、その後の `MANUAL_REFRESH`、さらに定期/ジョブ系の `RUN` でも同じ `NO_API_POOL_KEY_AVAILABLE` が出ている。

例:

- 1790780317: `INITIAL_REFRESH` / `NO_API_POOL_KEY_AVAILABLE`
- 1790780321: `MANUAL_REFRESH` / `NO_API_POOL_KEY_AVAILABLE`
- 1790780375: `INITIAL_REFRESH` / `NO_API_POOL_KEY_AVAILABLE`
- 1790780399: `INITIAL_REFRESH` / `NO_API_POOL_KEY_AVAILABLE`
- 1790780413: `INITIAL_REFRESH` / `NO_API_POOL_KEY_AVAILABLE`
- 1790780424: `MANUAL_REFRESH` / `NO_API_POOL_KEY_AVAILABLE`
- 1790780443: `RUN` / `NO_API_POOL_KEY_AVAILABLE`
- 1790780615: `INITIAL_REFRESH` / `NO_API_POOL_KEY_AVAILABLE`

つまり今回の障害は単発の登録UIエラーではなく、**API PoolからWatchlist用途のキーを確保できない状態が継続していた**ことがログから確認できる。

## 39-4. API Poolに関してログから見える重要ポイント

status-7のQuery Insightsには以下がある。

### A. API Poolキー状態の一覧取得

`SELECT pool_type, status, label, last_success_at, last_error_at, last_error_code, last_error_message FROM api_pool_keys ...`

- count: 213
- rowsRead: 1098
- rowsReturned: 213

別クエリでは:

`SELECT COUNT(*) AS count FROM api_pool_keys WHERE provider = 'MIGHTPULSE' AND pool_type IN ('SYSTEM_WATCHLIST','SYSTEM_GENERAL') AND status = 'AVAILABLE'`

- count: 299
- rowsRead: 1042

※これらはQuery Insightsの集計値であり、「299本のAPIキーが存在する」という意味ではない。クエリ実行回数/rowsRead/rowsReturnedとDB上のCOUNT結果を混同しない。

### B. Lease取得処理

status-7には以下のlease取得SQLが存在する。

``UPDATE api_pool_keys
 SET lease_id = ?,
     leased_until = ?,
     lease_job_id = NULL,
     lease_purpose = ?,
     lease_target_type = ?,
     lease_target_id = ?,
     updated_at = ?
 WHERE key_id = ?
   AND status IN ('AVAILABLE','ERROR','DISABLED')
   AND (leased_until IS NULL OR leased_until <= ?)
 RETURNING key_id, provider, pool_type, encrypted_key``

- count: 8
- rowsRead: 16
- rowsReturned: 8
- rowsWritten: 16

ここは重要。
**現在のlease取得SQLは `AVAILABLE` だけでなく `ERROR` / `DISABLED` も対象にしている。**

これが意図した「復旧候補として再試行」なのか、
「無効化済みキーまで実処理へ貸し出してしまう」危険な条件なのかは、mainコードを次スレッドで確認すること。

### C. Lease release

`UPDATE api_leases SET status = 'RELEASED' ...`

- count: 1590
- rowsRead: 3180
- rowsWritten: 3180

また、期限切れleaseを処理する:

`UPDATE api_leases SET status = 'EXPIRED' WHERE status = 'ACTIVE' AND expires_at <= ?`

- count: 2967
- rowsRead: 2,306,267

この `api_leases` の高い読み取りは、以前から確認対象だった箇所。
今回のAPI Pool障害調査では、**「キー無効化」と「leaseの解放/期限切れ」と「次回選択条件」が正しく連動しているか**を重点確認する。

## 39-5. APIキー大量無効化について、現時点で確定していないこと

ユーザーの実運用報告として「相当数のキーが無効」「手動更新でも復旧できない」「OWNERで一部無効化」は事実として引き継ぐ。

ただし、status-7だけからは以下はまだ断定できない。

- 何本が実際にinvalidだったか
- invalid判定のHTTP status / API error codeの内訳
- invalidとquota/rate-limit/temporary failureの区別が正しいか
- 「手動更新」がどのDBフィールドを更新したのか
- OWNER無効化したキーが、その後のlease対象から完全に除外されるか
- 同じキーが短時間に何度もエラー判定されていないか
- キー提供者へ返すべき状態表示が正しいか

このため次スレッドでは、**status-7のdiagnostic_eventsだけでなく、mainのAPI Pool実装をコード確認すること。**

## 39-6. 今回、同時に確認できた別問題

status-7では王国ランキング取得について:

- `rows_received=100`
- `rows_saved=100`
- `FETCH_COMPARE_SAVE` は成功相当の処理結果
- ただし `SOURCE_TIME_UNAVAILABLE` WARNING

が複数発生している。

つまり、

**ランキング本体の取得・比較・保存は成功しているが、MightPulse基準時刻の取得だけ失敗している**

ケースが存在する。

これは今回の `NO_API_POOL_KEY_AVAILABLE` とは別系統として扱うべき。

## 39-7. R2履歴保存について

同じstatus-7には:

`R2アーカイブ成功。R2_ONLYのためD1 ranking_snapshots INSERTをスキップしました。`

が記録されている。

今回のテスター操作中にも、

- R2 archive SUCCESS
- R2_ONLY
- D1 ranking_snapshots INSERT skip

が確認できる。

これは現時点での履歴保存設計と整合している。

## 39-8. D1負荷について今回見えていること

status-7 Query Insightsには、今回のテスト期間中に以下が見える。

- API Poolの状態取得/lease/releaseがかなり多い
- diagnostic_events INSERTも多い
- Watchlist JobのUPDATEも多数
- `api_leases` EXPIRED更新のrowsReadが非常に大きい
- `kingdom_ranking_current` の広いSELECTも存在
- `ranking_snapshots` を読むクエリもまだ存在する

特に最後は重要。

status-7には:

`SELECT target_id, rank, score, observed_at FROM ranking_snapshots WHERE kid = ? AND board = ? AND target_id IN (?,?,?,?) AND observed_at < ? ORDER BY target_id ASC, observed_at DESC`

が確認されている。

これは少なくとも「target_idを限定した過去順位取得」であり、禁止している「ranking_snapshots全体を広く取得」するクエリとは同一ではない。

ただし、今回の実テストでこのqueryが何回実行され、何rowsReadになったかは、次スレッドでWatchlistのコードと合わせて評価する。
## 39-9. 次スレッドで優先して調査する項目

### 最優先: API Poolのinvalid / recovery / lease設計

1. `src/api-pool.js` のキー取得関数
2. `lease_id / leased_until / lease_job_id / lease_purpose`
3. `status IN ('AVAILABLE','ERROR','DISABLED')` の意図
4. MightPulse HTTP 401/403/429/5xx/timeoutの分類
5. invalid判定後のstatus遷移
6. 手動更新時のstatus復旧処理
7. OWNER無効化時のstatus遷移
8. DISABLEDキーが次回lease候補になる可能性
9. lease期限切れ処理とキーstatusの整合性
10. 同一キーの連続再利用/再エラー防止

### 次点: 王国ウォッチリスト登録失敗

1. `INITIAL_REFRESH`
2. `MANUAL_REFRESH`
3. `RUN`
4. `NO_API_POOL_KEY_AVAILABLE` を投げる直前のpool_type/provider/候補数
5. `SYSTEM_WATCHLIST` と `SYSTEM_GENERAL` のfallback仕様
6. 「キー不足」と「全キーinvalid」をUI上で区別できているか
7. 登録そのものを成功扱いにするのか、初回取得失敗なら登録をrollbackするのか
8. 失敗したwatchlist jobが残り続けるか
9. 同じ失敗をcronが何度も繰り返してD1 writesを増やしていないか

### 次点: API Pool UI / 運用性

1. invalid / cooldown / disabled / available の意味がユーザーに明確か
2. 手動復旧ボタンが実際に復旧可能な状態だけを対象にしているか
3. invalid keyを「再試行して復旧できるキー」と誤認させていないか
4. OWNERによる無効化後に完全に処理対象外になるか
5. 提供者本人が自分のキー状態を理解できる表示になっているか

## 39-10. 次スレッド開始時の指示

ユーザーが次スレッドで本件を再開したら、最初に:

> 「EAGLEEYE_HANDOFF_2026-09-30.md の #39『2026-09-30 テスター実運用・API Pool/王国ウォッチリスト障害ログ引き継ぎ』から続き。status-7.jsonで発生した NO_API_POOL_KEY_AVAILABLE と大量invalidキーの原因調査から開始」

と伝えれば、この文脈で再開する。

**今回のログだけで原因を断定しない。**
まずmainの `src/api-pool.js` と王国ウォッチリストの初回取得/手動更新/cron実行コードを確認し、status遷移と照合する。

# 40. 2026-10-01 API Poolリース誤認防止・王国ウォッチリスト二重登録対策

## 40-1. 実装済み

今回のテスター事象を受け、mainへ以下を実装。

### 王国ウォッチリスト二重登録
- 登録ボタンを即時disabled
- 「登録中…」表示
- クライアント側の二重POSTを防止
- サーバー側も INSERT ... SELECT ... WHERE NOT EXISTS で同一Discordユーザー＋同一王国の有効ウォッチリスト二重登録を原子的に防止
- 二重POST競合時は KINGDOM_WATCHLIST_ALREADY_EXISTS / HTTP 409 を返す
- 同一IDのrefresh lockだけに依存しない

### API Poolの「NO_API_POOL_KEY_AVAILABLE」判定強化
現在のAPI Poolでは、リース取得時にキーの status は AVAILABLE のまま、leased_until / lease_id 等で使用中を表現する。
そのためstatusだけでは「利用可能キーなし」と「全キーがリース中」を区別できない。

getApiPoolAvailability() を追加し、
- available
- leased
- cooldown
- disabled
- error
- revoked
- total
をPool別・合計で取得できるようにした。

available=0 && leased>0 の場合は exhausted_by_lease=true として扱う。

### Watchlist APIエラー表示
Watchlist経由のPool取得で全候補Poolからlease取得できなかった場合、
Pool状態を再確認して NO_API_POOL_KEY_AVAILABLE に診断情報を付加。

リース枯渇時はユーザー向けに、
「利用可能なAPIキーがすべて処理中（リース中）であり、キー自体の無効化とは限らない」
と明示する。

初回取得・手動更新のdiagnostic_eventsにも poolAvailability をmetadataとして保存する。

### API Pool管理画面
/admin/api-pool のキー一覧で leased_until が現在時刻より未来の場合、
statusとは別に「🔒 リース中」と残り秒数、purpose、targetを表示する。

### API Pool「更新」ボタン
管理画面から個別キーを更新する際、対象キーが既にリース中なら外部APIへ再実行せず、
API_POOL_KEY_LEASED / HTTP 409 を返し、
「無効キーとは限らない。処理完了またはリース期限切れ後に再試行」
と明示する。

## 40-2. main反映commit

- abd0508828208e80ae3d2ea61eda251a55f9bda — API Pool lease exhaustion diagnosis
- a63e10520418bda1dc54815d9f71c9b91091a7a4 — duplicate Kingdom Watchlist registration prevention / pool exhaustion message
- 94549473569f57fd5a438976a309a57eb9b91cd8 — expose active lease fields
- e5305bb442196563172715c82bfacb648e0ea6a1 — health-check leased-key detection
- 364e463392ef31c656ac1b96fcfdc2d8304d4442 — show active leases in API Pool admin UI
- 630f7c869e343f0923a13fe705a8d27c6bb8afe0 — record pool availability in Watchlist diagnostics

## 40-3. 注意

上記はGitHub mainへのコード実装確認であり、本番Workerへのdeploy・本番E2E確認はこの時点では未確認。

本番確認では最低限:
1. 同一王国の登録ボタンを連打しても1件/1ジョブしか作成されないこと
2. 同時登録時の2本目が409で安全に止まること
3. API Poolで実際にリース中のキーを「更新」した際に API_POOL_KEY_LEASED と表示されること
4. 全Poolがリース中の状態でWatchlist更新すると「リース中」と判定されること
5. リース解放後に通常更新へ復帰すること
6. diagnostic_eventsにpoolAvailabilityが記録されること
7. D1 Rows Read/Writeの増加を確認すること

本番で確認できるまでは「本番確認済み」と扱わない。


# 41. 2026-10-01 EagleEye全体の二重連打・二重実行防止強化

## 41-1. 方針

今後、EagleEyeでは「同じ操作を二重連打しても、外部API・D1/R2・ジョブを二重実行しない」を共通要件とする。

特に外部APIを叩く処理は以下の3層で防御する。

1. UI/ブラウザ層
2. API/サーバー層
3. Job/外部API実行層

UIのdisabledだけを安全策とはしない。

## 41-2. 今回の実装

### A. 全EagleEye HTMLの共通mutating requestガード

EAGLEEYE_THEME_SCRIPTへ共通ガードを追加。

対象:
- POST
- PUT
- PATCH
- DELETE

同一ページ/タブから同一method + URL + bodyのmutating requestが処理中の場合、2本目を送信せず CLIENT_REQUEST_IN_PROGRESS としてrejectする。

GETは対象外。

このブラウザガードは補助防御であり、別タブ・別端末・Cronには効かない。サーバー側ロックを正式な防御とする。

### B. サーバー共通API request lock

api_request_locks テーブルをlazy-createする共通ロック機構を追加。

- lock_key
- lock_token
- lock_until
- updated_at

同一 lock_key に対して有効期限内のロックが存在する場合、2本目は API_REQUEST_IN_PROGRESS / HTTP 409 で停止。

TTLはデフォルト180秒。期限切れロックは次回取得時に原子的に再取得可能。

### C. 管理者向けMightPulse/Ranking APIへ適用

以下へサーバー側ロックを適用:

- /api/admin/rankings/player
  - ADMIN_RANKING_PLAYER:<governor_id>
- /api/admin/rankings/board
  - ADMIN_RANKING_BOARD:<kid>:<board>
- /api/admin/mightpulse/player
  - ADMIN_MIGHTPULSE_PLAYER:<governor_id>
- /api/admin/mightpulse-research
  - ADMIN_MIGHTPULSE_RESEARCH:<governor_id>:<candidate|ALL>
- /api/admin/mightpulse-probe
  - ADMIN_MIGHTPULSE_PROBE:<type>:<target>:<board>:<include>

認証・入力検証後にlockを取得するため、未認証/不正リクエストによってロックを消費しない。

### D. 既存の王国ウォッチリスト防御

王国ウォッチリストは既存の専用 kingdom_watchlist_locks を継続使用。

- 登録二重実行防止
- 初回refreshロック
- 手動refreshロック
- Cronとの競合防止
- active jobとの整合

を既存実装で防御する。

## 41-3. main反映commit

- 4ebb10fbbffd3ff471c69352706c4d8340714a86 — API request lock機構と管理者APIへの二重実行防止を追加
- 87dc2ef5a89a8650d6a869265d14125029bbfadb — ロック取得位置を認証・入力検証後へ修正
- f1ea50652b917e560e7da7fa49a8526c5da96eaf — 全EagleEye HTMLのmutating request共通ガード追加

## 41-4. コード上の残調査対象

今回、外部APIを直接/間接に叩く主要経路を確認し、上記の高リスクな管理者MightPulse/Ranking経路へロックを追加した。

ただし、以下は今後も個別確認対象として残す。

- handleGatewayApi 配下の外部API操作
- Discord Supportの状態変更/外部Discord API操作
- Google Drive OAuth/Archive操作
- Google Sheets export
- API Pool CRUD
- その他POST/DELETE管理APIの「二重実行時に副作用が二重になるか」
- Cronと手動操作の境界

特に「外部APIを叩く処理」は、ブラウザガードだけでなくサーバー側の対象単位ロックを持つことを原則とする。

## 41-5. 本番確認について

今回の変更はGitHub mainへの実装確認まで。

**本番Workerへのdeploy・本番E2E確認はまだ確認していない。**

本番確認時は少なくとも:

1. 管理者MightPulse Playerを同一対象へ二重実行
2. Ranking Playerを二重実行
3. Ranking Boardを二重実行
4. MightPulse Probeを二重実行
5. Researchを二重実行
6. 同一ブラウザでmutating APIを二重連打
7. 別タブ/別クライアントから同時実行
8. lock期限切れ後に正常復帰
9. D1 Rows Read/Writeの増加量確認

本番で確認できるまでは「本番確認済み」と扱わない。

## #42 Discord認証 / Discord Support 診断分離修正（2026-09-30）

### 背景
保存済み本番ステータスJSONでは、Discord OAuth設定のヘルスチェックがSUCCESSだった一方、Discord Supportのチケット作成失敗 `Missing Access` が `service="discord"` として記録され、「Discord認証」がFAILED表示になる事象を確認した。

### 実装
- `src/discord-support.js`
  - `recordSupportDiagnostic()` の診断サービスを `discord` から `discord_support` に変更。
  - SupportのCREATE_TICKET / CLOSE_TICKET / REOPEN_TICKET等は `Discord Support` サービスとして診断される。
- `src/index.js`
  - お問い合わせ画面の障害情報サービス表示に `discord_support: "Discord Support"` を追加。
- `src/diagnostics.js`
  - 既存の `discord = Discord認証` と `discord_support = Discord Support` のサービス定義を維持。

### コミット
- `2241acfde14ec5f54d80f591a6134b14095dfe55` — Support診断をDiscord Supportへ分離
- `0e2b91b2c62f7420c217ab0286e4f434a5ef4dc7` — お問い合わせ画面のDiscord Support表示対応

### 本番確認状況
- mainへの実装反映は確認済み。
- 本番Workerへのデプロイおよび本番E2E確認は、この時点では未確認。
- したがって「本番で修正済み」とは扱わない。



---

# 43. iPhone UI刷新 / プレイヤー比較 / KingShotアセット調査（2026-10-01）

## 方針
- BJにゃん画像素材は別スレで作成するため、本体実装ではBJ素材に依存しない。
- UIはiPhoneファーストの日本人向けダークUIへ刷新していく。
- 既存バックエンド/API/D1/R2/Watchlist/権限/認証を壊さず、まず機能面を実装。
- グラフは画像ではなく、保存済み実データからブラウザ上で描画する。
- D1の広域履歴スキャンは追加しない。Player履歴は通常R2_ONLYのR2履歴を優先し、D1は既存fallbackに限定。

## 新規実装
### Player Compare
追加:
- src/player-compare.js
- /api/player-compare
- /player/compare

仕様:
- 比較対象最大4人
- governor_id または ids=... で指定
- 現在値: 総合戦力 / 戦力順位 / 役場Lv. / VIP / 撃破数 / 撃破順位
- 期間: 7日 / 30日 / 90日
- 実データグラフ: 総合戦力推移 / 戦力順位推移
- 履歴は getPlayerHistory() / getPlayerRankHistory() を使用。
- HISTORY_STORAGE_MODE=R2_ONLY + ARCHIVE が通常構成なら、比較画面の時系列取得はR2を利用。
- D1側は比較対象の現在 players を対象IDのIN検索で一括取得。

Player Watchlist UI:
- 比較チェックボックス追加
- 最大4人まで選択
- 2人以上で「選択したプレイヤーを比較」を有効化
- /player/compare?ids=... へ遷移

Player Detail:
- 「他プレイヤーと比較」リンク追加。

### KingShot画像/アセット
src/player-compare.js に extractOptionalPlayerAssets() を追加。
既知/将来提供される可能性のある:
- プロフィールアイコン
- プロフィールフレーム
- 城/都市スキン
- 行軍スキン
- プロフィールスキン
- skins / frames / cosmetics 内の画像URL
を「レスポンスに実際に存在する場合のみ」検出し、Player詳細の「プロフィール・スキン」セクションへ表示する。

既存の英雄データ:
- hero icon
- level
- star/stars/star_label
- quality
- power
- position
- skill_levels
- exclusive_gear
- hero gear
についても引き続き表示し、英雄星を ★★★... の視覚表現でも表示。

既存の領主装備:
- slot / quality / tier / star / strength / score / combat / gems / icon（payloadに存在する場合）を維持。

## MightPulse仕様調査
MightPulse公式API公開仕様ではPlayer endpointの公開includeとして base / heroes / ranks / gov_gear が確認できる。
baseにはavatar_url等、heroesにはhero icon/star/gear/exclusive gear、gov_gearにはgear icon等が記載されている。プロフィールフレーム・城スキン・行軍スキンは現時点の公開Player API仕様には記載されていない。
参照: https://api.mightpulse.com/

KingShot公式ヘルプでは、プロフィール/行軍/都市スキンが存在し、装備しなくても所持スキンの追加ステータスが重複する仕様が確認できる。
参照: https://centurygames.helpshift.com/hc/ja/140-kingshot/faq/9018-i-have-multiple-avatar-frames-marching-castle-skins-how-do-the-stat-bonuses-add-up/?s=account-issue

## 未公開include候補のResearch拡張
src/mightpulse-research.js の候補に追加:
- avatar / avatar_frame / frame / frames
- skin / skins / castle_skin / city_skin / marching_skin
- profile / cosmetics

Research Lab UIも固定20候補から MIGHTPULSE_RESEARCH_CANDIDATES を動的表示するよう変更。
これは「未公開API仕様を突破する」ものではなく、既存認証済みPlayer APIの include に追加候補を指定してレスポンス構造を観測するだけ。
まだ本番Researchを実行して、これらの候補が実際にデータを返すことは確認していない。

## 重要な本番確認ルール
- main実装はコミット済み。
- Production deploy / Production E2Eはこの作業時点で確認していない。
- よって「本番で比較機能が動作確認済み」「本番でフレーム/スキン取得済み」とは言わない。
- Production確認時は最低限:
  1. Watchlistから2〜4人選択
  2. 比較画面表示
  3. 7/30/90日切替
  4. 戦力/順位グラフ表示
  5. Player詳細の英雄星・既存画像確認
  6. Research Labでasset include候補を必要な対象に対して個別検証
  7. D1 Rows Read増加をstatus/queryInsightsで確認
- ranking_snapshots の広域読み取りを比較機能のために追加しない。

## Commits
- d940f1fda9695c40db4658fffc2e96c56f22209d — src/player-compare.js
- ce22403d3de2ad34f91cbc3a6e329b4f53f8cd0a — src/mightpulse-research.js
- ed061368e04eed39f5d0e165ca391cf278ae4179 — src/index.js Player Compare / Watchlist / optional assets / hero stars
- 1a29cb50edd739e281b53de3da81519abed00164 — Research UI dynamic candidate list

## 次の候補
1. iPhone共通UIテーマ（ネイビー/シアン/ブルー）を既存画面へ段階適用
2. 比較画面に城Lv/VIP/撃破数等の時系列グラフを追加
3. Watchlist比較からプレイヤー詳細へ戻る導線を整える
4. Research実測結果をもとに、実際に存在するフレーム/スキン/その他画像を正式フィールドとして取り込む
5. 画像/アセット表示の権限・URL安全性を本番確認


---

# 44. 大規模変更の段階分割・安全実装ルール（2026-10-01）

## 背景

Player Compare / KingShotアセット / iPhone UI等の大きな変更で、巨大な `src/index.js` を一括書き換えした際にファイル末尾が途中で切れ、Cloudflare deploy時に `Unexpected end of file` が発生した。

今回の復旧では `src/index.js` を `2d0efbd82886228f9dad89adff487177f82e3eed` 相当へ戻し、復旧commit:

- `97a923395624237e2a9d43c14fe66e316dcc53c9` — `fix: restore index.js after truncated player compare edit`

をmainへ反映した。

## 今後の原則

大きな機能変更は**一気に実装せず、最初に段階へ分割してから1段階ずつ実装する。**

基本フロー:

1. 変更全体を複数段階に分解
2. 最初に「今回は第1段階だけ」と明示
3. 第1段階を実装
4. diff / 変更ファイル / ファイル末尾 / 構文を確認
5. build / testを実行
6. 問題なければcommit
7. 完了内容と未実装範囲を報告
8. 次の段階へ進む

**1段階が完了するまで、次段階をまとめて実装しない。**

## 特に `src/index.js` について

巨大な `src/index.js` に対して、

- ファイル全体を取得
- 文字列置換で大量編集
- ファイル全体をそのまま書き戻す

という方式は原則避ける。

優先順位:

1. 小さな局所変更
2. 新規処理を別moduleへ切り出す
3. `index.js` はrouting / 画面導線など必要最小限だけ変更
4. どうしても全体更新が必要な場合は、書き戻す前に完全なファイル内容・末尾・diff・buildを確認する

## Player Compare / アセット実装への適用

現在はPlayer Compare関連の `index.js` 統合部分が復旧によりmainから外れている。

したがって再実装する場合も、以下のように分割する。

### 第1段階
バックエンド/API・helperの確認と必要最小限のrouting追加。

### 第2段階
既存Watchlist / Player Detailから比較画面への導線。

### 第3段階
比較画面UI。

### 第4段階
MightPulseから取得できる実在アセット（avatar / frame / 城・都市スキン / 行軍スキン等）の個別取り込み。

### 第5段階
Research Lab等の補助UI・細部調整。

各段階ごとにbuild確認とcommitを行う。

## 本番確認ルール

各段階について、

- GitHub mainへ反映済み
- build成功
- Cloudflare deploy成功
- Production E2E確認済み

を別々に扱う。

**mainに実装されただけでは本番確認済みとは言わない。**

今回の復旧事故についても、deploy時build failureは確認済みだが、Production Workerでこの壊れたコードが稼働したことは確認していない。



---

# 45. Player Compare 第1段階（バックエンド/API）実装（2026-10-01）

## 今回実装した範囲

大規模変更を段階分割する方針に従い、今回は**第1段階のみ**実装。

### 実装
- `src/player-compare.js` の既存helperを利用。
- `src/index.js` にPlayer Compare用APIを追加:
  - `GET /api/player-compare`
- 比較対象は2〜4人。
- `governor_id=...` 複数指定 / `ids=...` 指定を正規化。
- 期間は7 / 30 / 90日。
- 現在プレイヤー情報は対象ID限定のD1 `players` IN検索。
- 現在の個人総力順位は `kingdom_ranking_current` の `personal_power` を対象ID限定で取得。
- 時系列Player履歴は既存 `getPlayerHistory()` を使用。
- 時系列Rank履歴は既存 `getPlayerRankHistory()` を使用。
- R2_ONLY構成では既存R2履歴を優先し、既存のD1 fallback仕様を利用。
- 比較系列生成は `buildPlayerCompareSeries()` を利用。
- ロール別公開設定を既存 `filterPlayerForRole()` / `ranks_core` 設定に合わせる。
- `PLAYER_COMPARE_VIEW` のService Usageを記録。

## D1 / ranking_snapshots方針

今回追加したAPIは `ranking_snapshots` を直接検索しない。

現在順位:
- `kingdom_ranking_current` の対象Governor ID限定検索。

過去順位:
- 既存 `getPlayerRankHistory()` を利用。
- R2_ONLY + ARCHIVE構成ではR2を優先。
- R2失敗時の既存D1 fallbackはGovernor ID限定の `player_rank_snapshots` 検索。

**広域 `ranking_snapshots` 読み取りは追加していない。**

## 差分確認

`ac31774e6eabc9c4b490152e7e72cf1414f0ce89` → `c94355c30742ee16ebe69f09261757dda387245b`

- `src/index.js` のみ変更
- additions: 102
- deletions: 0
- 1 commit
- mainへ反映済み

## 検証状況

- GitHub上でファイル末尾が維持されていることを確認。
- import / handler / route の配置を確認。
- 括弧数チェックを実施し一致を確認。
- ローカル `node --check` は実行環境からGitHubへネットワーク接続できず、リポジトリをcloneできなかったため未実施。
- GitHub Actions workflow runはこのcommitについて返却なし。
- Cloudflare本番deploy / Production E2Eは未確認。

したがって、この段階は**main実装反映済み**であり、**build成功・本番動作確認済みとは扱わない。**

## 次段階

次は第2段階:
- Player Watchlistから比較対象を選択するUI
- Player Detailから比較へ入る導線

のみを実装する。

比較画面UI、アセット表示、Research UI、テーマ刷新はまだ実装しない。

# 46. Player Compare 第2段階（選択UI・導線）実装（2026-10-01）

## 実装内容
Player Compare API（第1段階）を利用する前段として、プレイヤー比較対象の選択UIとプレイヤー詳細からの導線を追加。

### プレイヤーウォッチリスト
- 「プレイヤー比較」選択バーを追加。
- 各プレイヤーに「比較対象」チェックボックスを追加。
- 最大4人まで選択可能。
- 2人未満では比較ボタンを無効化。
- URLの `?compare=<governor_id>` を受け取り、プレイヤー詳細から遷移した対象を初期選択。
- 比較実行時は `/player/compare?governor_id=...` の形式で2〜4人のIDを渡す。

### プレイヤー詳細
- 「比較対象に追加」導線を追加。
- `/player-watchlist?compare=<governor_id>` に遷移し、対象プレイヤーを初期選択する。

## D1 / データ取得方針
- 今回のUI変更では新規D1取得処理を追加していない。
- `ranking_snapshots` の広範囲取得は追加していない。
- Player Compareのデータ取得は第1段階のAPI側に限定される。

## コミット
- `b37e7b7506dd33c0dfb88d3003edf0d2e776dd79`
  - `feat: add player compare selection UI`

## 検証
- mainへの反映をGitHub上で確認。
- `src/index.js` のdiffは対象UI部分のみ。
- ファイル末尾が維持されていることを確認。
- 波括弧数は `3062 / 3062` で一致。
- ただし、この段階ではCloudflare本番Workerへのデプロイ完了・実機E2Eは未確認。
- したがって「本番で確認済み」とは扱わない。

## 次段階
- `/player/compare` の比較画面本体を実装。
- 第1段階の `/api/player-compare` を接続し、現在値・推移・順位変動を表示。
- その後、MightPulseから取得可能な英雄星・英雄アイコン・装備・アバター等を比較画面へ追加。
- フレーム・城スキン・行軍スキン等は公開仕様で確定していないため、実レスポンスを確認しながら任意フィールドとして扱う。


# 47. Player Compare 第3段階（比較画面コア）実装（2026-10-01）

## 背景
第2段階までで、プレイヤーウォッチリストから2〜4人を選択して `/player/compare?governor_id=...` へ遷移する導線を実装したが、比較画面自体のルートが未実装だった。そのため実機で比較ボタンを押すとWorkerのfallbackによりホーム画面へ戻る状態になっていた。

## 実装
`src/index.js` に以下を追加。
- `GET /player/compare` のルート
- `renderPlayerComparePage()`
- 選択された `governor_id` を現在URLから取得
- 既存の `GET /api/player-compare` をブラウザから呼び出して比較データを表示
- 期間切替：7日 / 30日 / 90日
- 現在値カード：プレイヤー名、領主ID、現在戦力、戦力順位、役場、VIP
- 戦力推移テーブル
- 戦力ランキング推移テーブル
- 再読み込み
- 比較対象が2人未満の場合の案内

## D1 / ranking_snapshots 方針
- 新しい比較画面ではD1へ直接クエリしない。
- データ取得は既存 `/api/player-compare` に集約。
- Stage 1 APIで使用している `players` / `kingdom_ranking_current` / 既存履歴取得経路をそのまま利用。
- `ranking_snapshots` の広範囲取得は追加していない。

## コミット
- `61243587d65ebbdbc7fc3ea81f3de98835649678` — `feat: add player compare page`
- `6b6acd5dac3722112713fb7c8ee728a80c7681a1` — `fix: correct player compare template syntax`

## 検証
- main上のソースで比較画面ルート・関数を確認。
- `src/index.js` の括弧数：`3120 / 3120`
- ファイル末尾は既存コードを維持。
- 変更差分は `src/index.js` のみ、+36行。
- 既存の広範囲 `ranking_snapshots` クエリは追加していない。
- **Cloudflare本番デプロイ成功は未確認。**
- **本番Workerで比較画面が表示されることは未確認。**
- したがって、現時点では「本番で修正済み」とは扱わない。

## 実機確認項目（デプロイ後）
1. ウォッチリストで2人以上選択。
2. 「選択したプレイヤーを比較」を押す。
3. ホームへ戻らず「プレイヤー比較」画面が開く。
4. 7/30/90日を切り替えられる。
5. 現在戦力・戦力順位等が表示される。
6. 履歴が存在する場合、戦力推移・戦力ランキング推移が表示される。
7. 「再読み込み」で比較APIを再取得できる。
8. 期間内履歴がない場合は「期間内の履歴データがありません。」となる。

## 次段階
- 比較画面の視認性・グラフ化
- MightPulse由来の英雄星 / アイコン / 装備等の比較表示
- 取得可能ならプロフィールフレーム / 城スキン / 行軍スキン等の任意アセット表示


# 48. Player Compare 3b（MightPulseリッチ情報・アセット表示）実装（2026-10-01）

## 実装内容
比較APIに、保存済み最新MightPulse観測から取得できる情報を追加。
- プロフィールアイコン
- 英雄アイコン、名前、レベル、星、戦力
- 既存の可視性設定を通したプロフィール情報
- extractOptionalPlayerAssets() による任意アセット検出
- 比較画面に「英雄・装備」セクションを追加。

## 取得方針
比較画面からMightPulseへ直接追加リクエストはしない。api_observations に保存済みの最新観測を利用する。APIレスポンスに実際に存在するフィールドだけ表示する。ranking_snapshots の広範囲取得は追加していない。

## D1
プレイヤーごとに保存済み最新観測を1件取得する。比較対象は最大4人なので最大4件の対象限定取得。api_observations の target_id 限定取得であり、ranking_snapshots の広範囲取得ではない。

## コミット
- 7bb41a59bc768df1f9ccb740c127e7b76da14ff6 — feat: add MightPulse player assets to compare

## 検証
main上のソース確認済み。src/index.js 括弧数 3134 / 3134。比較ルート・リッチ情報処理・アセット表示処理を確認。
**この3b変更の本番Workerデプロイ・実機表示は未確認。**

# 49. Player Detail 3b（MightPulseリッチ情報・追加アセット表示）実装（2026-10-01）

## 目的
Player Compare 3bで追加したMightPulseリッチ情報・任意アセット表示を、比較画面だけでなく既存のプレイヤー詳細画面でも利用できるようにする。

## 実装内容
- `renderPlayerPage()` で既に取得している最新 `api_observations` payload から `extractOptionalPlayerAssets()` を実行。
- 追加のMightPulse APIリクエストは行わない。
- Player Detailに「プロフィール素材」セクションを追加。
- payloadに実在する場合のみ以下の任意素材を表示:
  - プロフィールフレーム
  - 城 / 都市スキン
  - 行軍スキン
  - プロフィール素材
  - その他 `skins / frames / cosmetics` 内で検出された画像
- 素材画像は既存の `normalizeProfileAssetUrl()` を使用。
- 既存の英雄:
  - アイコン
  - レベル
  - 星 / star_label
  - 品質
  - 戦力
  - スキル
  - 専用装備
  - 通常装備
  をそのまま詳細画面で表示。
- 既存の領主装備:
  - アイコン
  - slot
  - quality
  - tier
  - star
  - strength
  - score
  - combat
  - gems
  をそのまま維持。

## D1 / API方針
- Player Detailは元々最新 `api_observations` を取得しているため、今回のアセット表示追加のために新規D1観測取得を追加していない。
- MightPulseへの追加直接リクエストも追加していない。
- `ranking_snapshots` の広範囲読み取りは追加していない。
- フレーム / 城スキン / 行軍スキンは公開API仕様で確定していないため、レスポンスに実際に存在する場合のみ表示する。

## コミット
- `cc32a919348000d7ac0c47a703b50735653d7acf`
  - `feat: show MightPulse optional assets on player detail`

## 検証
- 7bb41a59bc768df1f9ccb740c127e7b76da14ff6 → cc32a919348000d7ac0c47a703b50735653d7acf の差分を確認。
- 変更ファイル:
  - `src/index.js`
  - 本handoff
- Player Detailへの任意アセット表示処理を確認。
- 括弧数は編集前後で整合するよう検証済み。
- **Cloudflare本番Workerへのdeploy成功は未確認。**
- **本番Player Detailで追加アセットが表示されることは未確認。**
- したがって「本番で確認済み」とは扱わない。

## 次段階
1. 本番deploy後にPlayer Detailを実機確認。
2. 実際のpayloadでプロフィールフレーム / 城スキン / 行軍スキンが検出されるか確認。
3. 検出されなかった場合はResearch結果を使って、実際に存在するフィールドだけ正式対応する。

# 50. 2026-10-02 追加監査・Player Compare / Diagnostics

## Service Usage operation 定義監査

コード上の trackServiceUsage 呼び出しと src/service-usage.js のoperation定義を照合した。
不足していたoperationを追加。

追加:
- PLAYER_COMPARE_VIEW
- ADVANCED_PROMOTED
- MIGHTPULSE_API_KEY_CONTRIBUTE

これらで使用される targetType=USER を許可。
feature分類も PLAYER_* / KINGDOM_* / その他(Account) に整理。

Commit:
- 370d30766017f805d798c7b0e8d3a1a86731ae55

## Player Compare timing telemetry

PLAYER_COMPARE_VIEW に以下を記録するよう追加。
- duration_ms
- data_read_duration_ms
- observation_duration_ms
- history_sample_limit

Commit:
- 5d2f8931d3c7b89d23be82d11a01fb53af24d5f6

注意:
data_read_duration_ms はD1だけでなく、D1 + history取得を含むデータ読み込み時間。D1単独のdurationとは表現しない。

## Status JSON Comparator / Query Duration

Cloudflare D1 Query Insightsに存在するquery durationをComparatorでも扱えるよう修正。

Commits:
- e58842ccae56c023ae376b58fcec5758956cc52b
  - duration capture / aggregation / diff / filter
- 866fcec49833404702ae44b8d02c1df4b6daabda
  - Query Duration 差分 sort
- 6c90300a7151a1acf870e0869667f5893c0d7d35
  - duration欠落時の0 fallback / NaN防止

## JSON / Diagnosticsで追える範囲

現在コード上で追跡可能:
- D1 Rows Read / Written
- D1 Query Count
- D1 Query Insights / SQL
- D1 Query Duration
- Worker Requests / CPU / Errors
- R2 Class A/B / storage / object inventory
- API Pool
- Watchlist Job
- MightPulse / Player / Ranking diagnostics
- History Storage
- Google / Discord / Retention / Emergency Buffer
- Player Compare Service Usage

まだrequest-levelで直接追えない:
- R2 individual GET duration
- R2 LIST duration
- exact end-to-end HTTP request duration
- browser / iPhone UI rendering time
- iPhone network wait
- Compare全体のper-MightPulse request durationの統合trace

必要になった場合も、R2 GETごとにD1へdiagnostic rowを書くのではなく、1 request内でin-memory集計して最後に1件へまとめる方向を優先する。

---

# 51. Player Compare R2負荷対策（2026-10-02）

Player Compare APIは、Player HistoryとRank HistoryをR2_ONLY構成で取得する際、比較人数が少なくても多数のR2 object GETを発生させ得た。

対策:

const historySampleLimit =
  governorIds.length === 2 ? 8 :
  governorIds.length === 3 ? 6 : 4;

Commit:
- 3a876ae8b9bfb6cdd4c1ee80c6ecd89702736113

これにより比較対象数に応じて履歴サンプル量を抑制する。

mainへ反映済みだが、この変更のCloudflare本番E2Eはまだ確認していない。

Production確認時:
1. iPhoneで2〜4人比較
2. 比較データが実際に表示されるか確認
3. status JSON取得
4. D1 Query Insights確認
5. Service Usage timing確認

必要ならブラウザ側にAbortController timeoutを追加し、API待ちのまま「比較データを読み込み中…」が永久表示されないようにする。

---



### 追加更新: OWNER王国並列負荷テストの取得進捗表示

- `/admin/kingdom-load-test` は、従来は全王国の取得完了後に結果JSONを返す方式だった。
- 実際の王国ごとの完了をブラウザへNDJSONストリームで送信する方式へ変更。
- 画面上で `0% → 完了件数/対象件数 → 成功/失敗 → 100%` をリアルタイム表示。
- 通常の王国ウォッチリストと同様、実際に完了した取得件数を進捗として表示する。
- 進捗状態をD1へ保存する方式は採用していないため、負荷テストの進捗表示自体によるD1計測への余計な書き込みを避ける。
- 最終的な全結果JSONも完了時に表示する。
- 本番Worker / iPhone実機でストリーミング進捗が実際に表示されることは未確認。

実装コミット:
- `ce6e18413b7196ab3eac0856818eff58c40ceff6`

# 52. 2026-10-02 OWNER / ADMIN 登録規模確認ページ【実装済み・本番UI確認済み】

## 要望

OWNER / ADMIN向け管理画面に、現在EagleEyeへ登録されているデータ規模を確認できるページを追加。

最低限:
- 登録プレイヤー数
- 登録王国数

を確認できるようにする。

## 実装済み

### 新規module

- `src/admin-data-coverage.js`
- `renderAdminDataCoveragePage(env, auth)`

### Routing

`src/index.js` に追加済み:

- `/admin/data-coverage`

既存の `requireAdmin()` を通すため、権限は:
- ADMIN: 閲覧可能
- OWNER: 閲覧可能
- BASIC / ADVANCED: 閲覧不可

### ADMIN CONTROL

`/admin` に「データ登録状況」カードを追加済み。

### 表示項目

現在表示する項目:

- EagleEye登録アカウント数
- OWNER / ADMIN / ADVANCED / BASIC の各ロール人数

### 追加機能: OWNER専用王国並列負荷テスト

### 追加更新: 王国プリセット / status JSON機能カバレッジ

- 王国並列負荷テストに1000〜3000を100刻みで選べるプルダウンを追加。
- 選択した王国はチップ表示し、複数選択可能。直接入力も引き続き可能。
- status JSONのD1 Query Insightsは全Query Groupを保持しているため、新機能追加後も生SQLの取得自体は可能。
- ただし従来のカテゴリ分類が新機能を「Other」にまとめる可能性があったため、以下のfeature/categoryを追加:
  - Data Coverage
  - User Accounts
  - Player Watchlist
  - Kingdom Watchlist
  - Current Ranking
  - Player Compare
  - Player DB
  - API Pool
  - Service Usage
  - Support
  - Retention
- 各queryに`feature`を付与し、`queryInsights.featuresSeen`としてJSONにも出力。
- 既存の全Query Group / rowsRead / rowsWritten / rowsReturned / durationMs は維持。
- 本番JSONログでの新カテゴリ実データ確認は未確認。

実装コミット:
- `75f8e0651e33b0aff6087cdb8c80f3bf32449c9a`
- `220787b2efb70c48e3ce6a6ee76f95b11285c963`


API Pool管理内からOWNER専用の王国並列負荷テストへ移動できるようにした。

- ページ: `/owner/kingdom-load-test`
- API: `/api/owner/kingdom-load-test`
- OWNERのみ実行可能
- 王国番号をカンマ・改行・空白区切りで複数指定
- 最大20王国
- 同時実行数は1〜5、デフォルト3
- 指定王国ごとにAPI PoolからリースしてMightPulse王国ランキングを取得
- 成功/失敗、HTTP status、Pool、取得件数、各取得時間、全体時間を結果表示
- API Poolのリース競合やMightPulse側の同時取得挙動を確認する用途
- APIキー本体は画面・結果に表示しない
- 本番負荷テストはまだ未実施

実装コミット:
- `20a554f06e9c5f50a6367770dbc716c13367ec15`
- `f0d6fed367c59603ae2ee263ca24fa0ddf863981`
- `9078c3c5af21d766fec5598ecc364aa25b9de4db`
- `52d61cca79a4b01cd453ba84478a4b87982a19ea`


- 登録プレイヤー数
- 登録王国数
- ランキングデータが存在する王国数
- 有効な王国ウォッチリスト数
- ウォッチ対象のユニーク王国数
- 取得時刻（日本時間）
- 集計処理時間

### 「登録」の定義

mainのschema / 実装を確認した上で以下の定義を採用。

**登録プレイヤー**
- `players` テーブルの現在行数
- `governor_id` 単位で1プレイヤー
- 実装上は `governor_id IS NOT NULL` を条件にCOUNT

**登録王国**
- `players` に存在する `kid` のユニーク数
- ランキングだけ存在する王国とは分離して表示

**ランキングデータが存在する王国**
- `kingdom_ranking_current` の `kid` ユニーク数

### D1方針

一覧取得は行わず、COUNT系SQLで集計。

主なquery:

```sql
SELECT COUNT(*) AS player_count,
       COUNT(DISTINCT kid) AS kingdom_count
FROM players
WHERE governor_id IS NOT NULL
```

および:

```sql
SELECT COUNT(DISTINCT kid)
FROM kingdom_ranking_current
```

ウォッチリストもCOUNT / COUNT(DISTINCT)で集計。

全playersをWorkerへ読み出して数える方式は採用していない。

### 実装コミット

- `bff0ea01055c2ce0d7dd3f74f23b0ab4796f8786`
  - `feat: add admin data coverage page`
- `288484b02258b0aab34927238ffc1ec0d25142bb`
  - `feat: add data coverage admin page`

mainには反映済み。

### デプロイ障害と修正

初回のデータ登録状況ページ実装では、`src/admin-data-coverage.js` のHTMLテンプレートリテラルに不要なエスケープが入り、Cloudflare buildで:

```
Syntax error "`"
src/admin-data-coverage.js:7:12
```

となりデプロイに失敗した。

修正コミット:
- `bb8339ce613ee79a7cf296893de2b59b6c71cb4b`
  - `fix: repair data coverage page template syntax`
- `d314870d80f036a3c05b0a09f08d912c1c7c9fd5`
  - `feat: show registered accounts and role counts`

修正後、main上のファイルを再取得して:
- \`\\` / \`\\${\` の誤エスケープ残存なし
- 正しいJavaScript template literalであること
を確認済み。

## 本番確認状況

**本番UI表示確認済み（OWNER / iPhone実機）。**

2026-10-02、OWNERアカウントで本番Worker上の `/admin/data-coverage` をiPhone実機から開き、ページ表示を確認。
スクリーンショットで確認できた本番表示:
- ROLE: OWNER
- 登録プレイヤー: **97人**
- 登録王国: **15王国**
- ランキングデータが存在する王国: **13王国**
- 有効な王国ウォッチリスト: **3件**

これにより、少なくとも以下は本番実機で確認済み:
- `/admin/data-coverage` のrouting
- OWNER権限でのアクセス
- データ登録状況ページUIの表示
- 本番D1から件数を取得して表示できること

※ユーザー・ロール集計の追加実装はmain反映済みだが、追加後のCloudflare本番デプロイ・実機表示は未確認。

未確認:
- ADMINロールでの実機表示
- 各件数の独立したDB照合による数値正確性
- ページ下部の「ウォッチ対象のユニーク王国」「取得時刻」「集計処理時間」まで含む全項目の実機確認

したがって、**「OWNERで本番UI表示確認済み」までは確定**とし、ページ全項目・ADMIN権限・件数の独立照合まで「本番確認済み」とは扱わない。

# 53. 次スレッド開始時の最優先タスク

1. docs/EAGLEEYE_HANDOFF_2026-09-30.md（本書）と最新mainを基準にする。
2. OWNER / ADMIN登録規模ページの本番確認残項目を整理。
3. 必要ならADMINロールでの実機表示を確認。
4. 必要なら本番D1件数との独立照合を行う。
5. 次のEagleEye開発項目へ進む。
6. main反映、deploy、production E2Eを別扱いで報告する。
7. ユーザーが実機で確認していない項目は本番確認済みとは言わない。

# 54. 最新状態の厳守事項

- ranking_snapshots の広範囲取得を復活させない。
- R2_ONLY方針を維持。
- D1へ大量historyを戻さない。
- SERVICE_USAGE event本体をD1へ保存しない。
- R2 objectごとのdiagnostic D1 INSERTを増やさない。
- 巨大な src/index.js を一括書き換えしない。
- 大規模変更は段階分割し、各段階ごとに検証・commitする。
- main反映、deploy、production E2Eを明確に分離して報告する。
- API key / Refresh Token等のsecretをログ・UI・handoffへ出さない。
- **既存機能との仕様重複がある新機能は、実装前に既存機能のコードを確認し、同じ仕様・状態遷移・UI表現に合わせる。既存と異なる表現を採用する場合は理由を明確にする。**

# 55. 2026-10-02 プレイヤー検索のAPI仕様確認

## 調査結果

本番iPhone実機で「プレイヤー検索」に名前（例: たぬき）を入力しても「該当するプレイヤーが見つかりません」と表示される件をコードとMightPulse API仕様で再確認した。

現在の /players?q=... は EagleEye D1 の players テーブルを検索する実装。

検索対象:
- governor_id
- nick_name
- kid
- alliance_name

D1に該当行がない場合、名前・王国・同盟名についてMightPulse APIへフォールバックする処理は現時点では存在しない。

一方、領主IDの直接検索は既にAPI取得へ接続済み。

既存実装:
- fetchPlayerThroughApiPool()
- API PoolからSYSTEM_GENERALキーをlease
- MightPulse GET /v1/players/{governor_id}?include=base
- Observation保存
- materializePlayer()
- Player Detail表示

関連コミット:
- d15adfc50bfd355e9022842c9720ae3aa63aa5b2
  - connect player search to pooled data display
- ca1d8666357b8553013568287067f3d865c072c8
  - fix player search detail fetch persistence
- 7e0db530d127510c6681e5f12a1f4e4a2acbf09e
  - Make numeric player ID search direct

## MightPulse APIの現在の公開仕様

2026-10-02時点のMightPulse API公式ドキュメントで確認できるPlayer APIは:

GET /v1/players/{id}?include=base
GET /v1/players/{id}?include=base,heroes,ranks,gov_gear
GET /v1/players/{id}?id_type=uid

公式APIドキュメントには、名前・キーワード・同盟名からプレイヤーを検索する公開APIエンドポイントは記載されていない。

MightPulse本体Webサイトには「Name or governor ID…」「Search by name, governor ID, or keyword」という検索UI自体は存在するが、これは公開API仕様とは別であり、EagleEyeから未公開のWeb内部エンドポイントを推測して直接叩く実装は採用しない。

## 結論

現時点では:

- 領主ID検索 → 実装可能・既存実装済み
- D1保存済みの名前/王国/同盟検索 → 実装済み
- D1に存在しない名前/キーワードをMightPulse公開APIで検索 → 公開API仕様上は実装根拠なし
- MightPulse Webの未公開検索エンドポイントを推測して利用 → 採用しない

したがって、今回の「たぬき」がD1に存在しないケースを、MightPulse APIへ名前検索フォールバックさせる変更は、現時点では安全に実装可能とは判断しない。

今後MightPulse側が名前検索APIを公開した場合は、既存のAPI Pool / Observation / materializePlayerフローを再利用して統合する。

## 重要な再発防止ルール

「MightPulse APIを使う」と「MightPulse Webサイトが検索できる」は同義ではない。

外部APIの仕様に存在しない検索エンドポイントを、Web UIの動作から推測して実装しない。



# 56. 2026-10-02 王国取得時の同盟TOP10→Roster収集実装準備

- プレイヤー検索の補完策として、王国取得時に「同盟戦力ランキングTOP10を特定 → 各同盟のRosterを取得」できる共通API層を追加した。
- MightPulse公式API仕様に基づき、alliance_power の王国ランキングを最大10件取得し、各同盟の abbr を使って /alliances/{kid}/{tag}?include=info,roster を呼び出す。
- src/mightpulse.js に追加したもの:
  - getMightPulseTopKingdomAlliances()
  - getMightPulseTopKingdomAllianceRosters()
  - getMightPulseAlliance() に apiKey 引数を追加
- 現時点では**本番でTOP10同盟Roster取得を実行・検証したとは扱わない**。今回の変更は共通取得ロジックの実装のみ。
- 取得結果を players / D1へ大量保存する処理はまだ追加していない。先に既存の複数王国・上位100位取得負荷テストでCloudflare/D1/API Pool消費量を実測し、その結果を基準に保存方式を決める。
- TOP10同盟取得を実際の王国取得フローへ組み込む際も、同盟ごとの個別API呼び出し数、重複プレイヤー、D1 write/read、API Pool消費を計測可能にすること。
- 公式API仕様上、王国ランキングは limit 最大100、同盟ランキングには aid/abbr/name/score が含まれ、同盟Rosterには governor_id/nick_name/power/town_center_level/kills 等が含まれる。


# 57. 2026-10-02 OWNER王国負荷テスト拡張（実装済み・本番未実施）

## 目的
20王国を起点に、MightPulseの王国「全ランキング（boards）」取得を実際に負荷テストできるよう、OWNER専用王国並列負荷テストを拡張。

## 実装
- 開始王国番号を指定可能。
- 王国数プリセット:
  - 20 / 40 / 60 / 80 / 100
  - 200〜1000を100刻み
- 王国範囲を自動生成し、従来の個別王国チップ/直接入力も維持。
- 「全ランキング（boards）」モードを追加。
- 全ランキングモードでは既存の `getMightPulseKingdomAllRankings()` を使用し、1王国につき `/kingdoms/:kid?include=boards&limit=100` を1リクエストとして取得する。
- 単一ランキング取得モードも従来どおり残す。
- 同時実行数を1〜50へ拡張。
- 選択肢: 1 / 2 / 3 / 5 / 10 / 15 / 20 / 26 / 30 / 40 / 50。
- デフォルト同時実行数: 10。
- OWNER専用・APIキー本体は画面/結果に表示しない。
- 既存のNDJSONストリーミング進捗表示を維持。

## 重要な負荷テスト定義

今回の全ランキングモードは、ランキング結果を `kingdom_ranking_current` へ保存しない。
目的はまず、**MightPulse upstream取得負荷 / API Pool lease競合 / Worker処理時間 / 応答量**を分離して測ること。

20王国 × 全ランキングの場合、APIリクエスト数は「1王国1リクエスト」の実装なので20リクエスト。
レスポンス内部には複数のランキングboardが含まれるため、board数に応じてレスポンスデータ量は増える。

「26ランキング × 20王国 = 520 HTTP requests」の負荷を測る方式とは別物。
必要になった場合は、26 boardを個別選択して各boardを個別endpointで取得するモードを追加する。

## 実装コミット
- `6c1cf177d5794b46f736a0c867811405390b504a`
  - feat: expand kingdom load test for range, all rankings, and concurrency

## 本番確認状況
- GitHub main反映: 済み。
- Cloudflare本番deploy: main→自動deploy対象だが、この変更のdeploy完了はこの時点では未確認。
- 本番20王国・全ランキング負荷テスト: **未実施**。
- 本番D1 / Workers / API Pool / MightPulse使用量への影響: **未実測**。

## 次の実機テスト
最初の実測は安全側から:
1. 20王国
2. 全ランキング（boards）
3. 同時実行数 5
4. 結果・失敗数・各王国elapsed_msを確認
5. status JSONでD1 Rows Read/Written、Workers Requests/CPU、API Poolを取得
6. 問題なければ10 → 20 → 26…と段階的に同時実行数を上げる

API Poolの実キー数・lease可能数が実効並列数を制約するため、「設定値50 = 実効50」とは扱わない。
実効並列数は実測結果で判断する。


### 57-1. 追加修正
- 王国数上限を20→1000へ拡張。20王国から段階的に40/60/80/100/200…と負荷を上げられる。
- 直接入力の王国番号パーサーも空白・カンマ・読点区切りを正しく扱うよう修正。
- 全ランキングモードの結果に `board_count` を記録できるよう追加。
- 実装コミット: `1079fe2cef108e14dc951a9429e49038a7b0ecff`


### 57-2. テスター利用時の実行者・挙動追跡ログを追加（2026-10-02）

テスターがOWNER王国負荷テストを実行するため、「誰が・何を・どの条件で実行し・どういう結果になったか」を後から相関できるようにした。

#### 追加した追跡情報
- 1回のテストごとに `run_id`（UUID）を発行。
- NDJSONの `start / progress / complete / error` に `run_id` を付与。
- 各王国結果にも `run_id` を付与。
- Workerログに以下を構造化出力:
  - `actor_user_id`
  - `actor_role`
  - `run_id`
  - 対象王国数 / 開始王国 / 終了王国
  - 全ランキング / 単一ランキング
  - board
  - concurrency
  - 完了時の成功数 / 失敗数
  - HTTP status集計
  - failure code集計
  - latency min / max / avg
  - 失敗王国のサンプル（最大50件）

#### SERVICE_USAGEとの連携
`OWNER_KINGDOM_LOAD_TEST` イベントを追加し、テスト完了時にQueueへ非同期送信する。

保存する主体:
- `actor_user_id` = 実行者のusers.user_id
- `target_type` = USER
- `target_id` = 実行者のusers.user_id
- metadata = run_id / 条件 / 実行時間 / 成功失敗 / HTTP status / failure code / latency / 失敗サンプル等

**SERVICE_USAGE event本体はD1へ保存しない。** 既存のQueue→R2アーカイブ経路を利用する。

これにより、後からR2のSERVICE_USAGEログとWorkerログを `run_id` で突合し、テスターごとの負荷テスト実行履歴と挙動を追跡できる。

#### セキュリティ
- APIキー本体、refresh token、secretはログへ出さない。
- `actor_user_id` は実行者を特定するための内部IDであり、APIキーとは別物。
- API Poolの既存 `OWNER_LOAD_TEST` 記録と `run_id` を直接DBで結び付ける変更はまだ行っていないため、API Pool詳細とSERVICE_USAGE/Workerログの相関は現時点では `purpose=OWNER_LOAD_TEST` + 実行時刻 + 対象王国を併用する。

#### 実装コミット
- d3cd72d874c60402e46b6382f1fc75c2122acfcd
  - feat: track owner kingdom load tests in service usage
- b9a2fb4c3f55f408546dbb6ce5fbba06f9cfab14
  - feat: add actor and run correlation to kingdom load test logs

#### 本番確認状況
- GitHub main反映: **済み**。
- Cloudflare本番deploy完了: **未確認**。
- テスター実行による本番E2E: **未確認**。
- SERVICE_USAGE Queue→R2でこの新イベントが実際に保存されたこと: **未確認**。

本番でテストを実施した後、必ず以下を確認する:
1. `run_id` がstart→progress→completeで一貫していること。
2. 実行者が正しい `actor_user_id` として記録されること。
3. SERVICE_USAGEの `OWNER_KINGDOM_LOAD_TEST` がQueue→R2へ到達すること。
4. status JSONのD1/Workers/R2/API Pool実測と、同一run_idのテスト条件・結果を突合できること。
5. APIキー本体等のsecretが一切出ていないこと。


### 57-3. 通常利用保護 + テスト中表示（2026-10-02）

OWNER王国負荷テストが、Poolキーの少ない環境で通常ユーザーの利用を圧迫しないよう安全装置を追加。

#### API Pool保護
- テスト開始時に `getApiPoolAvailability()` で `SYSTEM_WATCHLIST` + `SYSTEM_GENERAL` の現在利用可能キー数を取得。
- ロードテストの最大実効並列数を **利用可能キー数 - 1** に制限。
- 1本しか利用可能キーがない場合はテスト開始を拒否。
- UIで50並列を選んでも、Pool実態が10本なら最大9並列までに自動制限。
- これは「テストが使えるキー数」を制限するものであり、通常ユーザーが同時にキーを使用している場合は実効的な空き数がさらに変動する。
- ロードテストの実行条件には `requested_concurrency` / 実効 `concurrency` / `available_pool_keys` / `reserved_for_normal_use=1` を記録。

#### テスト状態の共有
- 既存の `api_request_locks` を利用し、`OWNER_KINGDOM_LOAD_TEST` の実行中状態をD1上で共有。
- 同時に複数のOWNERロードテストを起動することを防止。
- 通常完了/エラー時は状態を削除。
- 異常終了時にも最大2時間で期限切れになる。

#### テスター向け表示
一般ユーザー向けホーム画面に、ロードテスト中だけ以下の警告を表示:

> ⚠ 現在、システム負荷テストを実施しています
> 一部の機能で通常より応答が遅くなる場合があります。テスト終了後は通常速度に戻ります。

- 30秒ごとに状態を確認。
- 一般ユーザーには実行者・run_id・対象王国等の内部情報を表示しない。
- 状態APIは公開情報として `active / started_at / expires_at` のみ返す。
- 状態APIレスポンスは短時間キャッシュ可能にして、毎回のD1負荷を抑える。

#### 実装コミット
- `acf6451ff7e0c386eacfaaedd7c6d4003315b256`
  - feat: protect one API pool key during owner load tests
- `f8ab8ceb902c6807398c032e3e28dca662ffc067`
  - fix: keep public load test status read-only
- `6e4685e866a07c8e8f33e79ce02ea701245db691`
  - fix: repair load test status route formatting

#### 本番確認状況
- GitHub main反映: **済み**。
- Cloudflare本番deploy完了: **未確認**。
- 本番でPool数→実効並列数-1の制限が動作したこと: **未確認**。
- 本番一般ユーザー画面で負荷テスト中バナーが表示されたこと: **未確認**。
- 本番でテスト終了後にバナーが消えること: **未確認**。

本番確認時は、少なくとも以下を確認する:
1. 利用可能Poolキー数を確認。
2. OWNERがそれより1少ない並列数で実行されることを確認。
3. 1本しかない場合にテスト開始が拒否されることを確認。
4. テスト中に一般ユーザー画面へ警告が表示されることを確認。
5. テスト完了後に警告が消えることを確認。
6. status JSONでD1 / Workers / API Poolの負荷を確認する。


# 58. 2026-10-02 System Status JSONへのOWNER負荷テスト状態追加

## 実装

System Statusの運用JSONに、OWNER王国負荷テストの現在状態を追加した。

`getOperationalStatus()` の返却値に以下の `loadTest` を追加:

- `schemaAvailable`
- `active`
- `startedAt`
- `expiresAt`

ロードテスト実行中の場合、同じD1ロック状態を参照して:
- 実行中か
- 開始時刻
- ロック期限
をstatus JSONから確認できる。

### セキュリティ
- `lock_token` はstatus JSONへ出さない。
- APIキー、secret、refresh tokenは出さない。
- status側はSELECTのみで、ロック作成・更新・削除を行わない。
- 初回ロードテスト前など `api_request_locks` テーブルがまだ存在しない場合でも、System Status全体を失敗させず `schemaAvailable=false / active=false` とする。

### JSONログ解析上の意味

これにより、同じstatus JSONで取得できるCloudflare/D1/Workers/API Pool等の実測値と、「その時点でOWNER王国負荷テストが実行中だったか」を突合できる。

ただし、テスト完了後は実行ロックが削除されるため、status JSONだけから過去のロードテスト履歴を復元するものではない。過去の実行条件・結果は `run_id` 付きのWorkerログ / SERVICE_USAGE → R2側で追跡する。

## 実装コミット
- `af0c09b4342632b5f0f9e01c160c11a42cbcffab`
  - feat: expose load test state in operational status

## 本番確認状況
- GitHub main反映: **済み**。
- Cloudflare本番deploy: **未確認**。
- 本番status JSONで `loadTest` が実際に返ること: **未確認**。
- 本番ロードテスト実行中に `active=true` となること: **未確認**。

本番で確認する際は、既存の負荷テスト確認と合わせて:
1. テスト開始前のstatus JSONを保存。
2. テスト実行中のstatus JSONを保存し、`loadTest.active=true` と `startedAt/expiresAt` を確認。
3. テスト完了後のstatus JSONを保存し、`active=false` を確認。
4. 同じrun_idのSERVICE_USAGE / Workerログとstatus JSONを突合する。
5. D1 Rows Read/Written、Workers CPU、API Poolの値を同じ時系列で比較する。

## 58-1. 2026-10-02 API Pool lease詳細をSystem Status JSONへ追加

status JSONだけでは従来「activeLeases: 6 / expiredActiveLeases: 6」の件数までしか分からず、どの処理がキーをleaseしているかを特定できなかったため、api_pool_keys のleaseメタデータをJSONへ追加。

追加:
- apiPool.leaseDetails[]
  - keyId
  - poolType
  - status
  - label
  - leaseState: ACTIVE / EXPIRED
  - leasedUntil
  - leaseJobId
  - leasePurpose
  - leaseTargetType
  - leaseTargetId
  - updatedAt
- apiPool.leaseByPurpose
  - purpose別のlease本数集計

これにより、status JSON取得時点で「どの用途（watchlist / general / health check / OWNER負荷テスト等）がどのleaseを保持しているか」を、APIキー本体を露出せず追跡できる。

重要:
- APIキー本体、encrypted_key、fingerprint等のsecret情報は出さない。
- contributed_by_user_id は「キー提供者」であり現在の利用者ではないため、このJSONには出さない。
- leaseJobId / leasePurpose / leaseTargetType / leaseTargetId は処理主体・対象を特定するための相関情報。
- status JSON取得自体はSELECTのみで、leaseの作成・更新・解放は行わない。
- D1追加readはlease metadataの一覧1クエリ。キー数規模に応じた小規模readで、APIキー本体取得はしない。

## 本番確認状況
- GitHub main反映: **済み**。
- Cloudflare本番deploy: **未確認**。
- 本番status JSONで apiPool.leaseDetails / leaseByPurpose が実際に返ること: **未確認**。
- 本番で「誰が/何の処理がleaseしているか」をこのJSONだけで相関できること: **未確認**。

本番確認時は、テスト前status JSONを保存し、
1. leaseDetails のACTIVE/EXPIREDを確認。
2. leasePurpose / leaseJobId / target情報から利用処理を特定。
3. OWNER負荷テスト実行時は OWNER_LOAD_TEST 等のpurposeとrun_idログを突合。
4. テスト後にleaseが解放され、不要なEXPIRED leaseが残らないことを確認。

**コード実装済みと本番確認済みは分離して扱う。**


## 58-2. 2026-10-02 王国ウォッチリスト所有者・対象王国をSystem Status JSONへ追加

status JSONだけで「有効な王国ウォッチリスト3件が誰のものか／どの王国を対象にしているか」を追跡できるよう、getOperationalStatus() に以下を追加。

### 追加JSON

- watchlist.details[]
  - watchlistId
  - discordId
  - kid
  - topN
  - intervalHours
  - enabled
  - lastRunAt
  - lastSuccessAt
  - lastError
  - createdAt
  - updatedAt
- watchlist.byDiscordId
  - Discord IDごとの登録watchlist数
  - enabled数
  - 登録王国一覧

これにより、API Poolの leasePurpose / leaseTargetType / leaseTargetId と組み合わせて、王国ウォッチリスト処理について「誰の、どの王国の処理がAPI利用につながっているか」をstatus JSONから追跡できる。

### セキュリティ・負荷

- APIキー、encrypted_key、fingerprint等は出さない。
- discordId は内部OWNER/ADMIN向けのSystem Status JSONで相関確認するために出す。
- status JSONは既存どおりDB更新を行わずSELECTのみ。
- 王国ウォッチリスト一覧は登録件数規模を前提とした1クエリ。
- 大量のプレイヤー本体を取得する処理は追加しない。

### 本番確認状況

- GitHub main反映: **済み**。
- Cloudflare本番deploy完了: **未確認**。
- 本番status JSONで watchlist.details / watchlist.byDiscordId が返ること: **未確認**。
- 本番で実際の3件のDiscord ID・王国番号とAPI Pool lease情報を突合したこと: **未確認**。

本番確認時は、status JSON取得時点で:
1. enabled watchlist件数と details 件数が一致すること。
2. 各 discordId と kid の対応を確認すること。
3. API Pool leasePurpose / leaseTargetId と王国watchlistの対象を突合すること。
4. D1 Rows Read/Writtenへの追加影響を確認すること。

**実装済みと本番確認済みは分離して扱う。**


## 58-3. 2026-10-02 OWNER負荷テストとAPI Poolのrun_id相関を強化

### 実装
OWNER王国負荷テストの `run_id` を API Pool lease / usage まで引き継ぐよう修正。

- `src/admin-kingdom-load-test.js`
  - `leaseApiKey()` に `jobId: runId` を渡す。
  - SYSTEM_WATCHLIST → SYSTEM_GENERAL のフォールバック時も同じ `runId` を渡す。
  - 成功時の `recordApiPoolSuccess()` に `jobId: runId` を渡す。
  - 失敗時の `recordApiPoolFailure()` に `jobId: runId` を渡す。
  - 既存の `api_pool_usage` へOWNER負荷テスト1リクエスト単位の使用記録を追加し、`job_id=run_id` で突合可能にした。
  - 記録項目は既存API Pool usage schemaを使用し、APIキー本体やsecretは保存・出力しない。

### 相関方法
同一負荷テストについて:

`run_id`
→ Worker NDJSON / console log
→ API Pool `lease_job_id`
→ API Pool usage `job_id`
→ SERVICE_USAGE `metadata.run_id`

という追跡経路を持つ。

System Status JSONの `apiPool.leaseDetails[].leaseJobId` でも、負荷テスト実行中のleaseについて `run_id` を確認できる。

System Status JSONの `loadTest.runId` には実行中ロックのrun_idを出す。

### D1負荷
負荷テストの各王国リクエストについてAPI Pool usageを1件記録するため、テスト対象王国数と同程度のD1 writeが追加される。
これは通常のユーザー処理へ常時追加するものではなく、OWNER負荷テスト時だけ発生する。
負荷テスト自身のD1消費をstatus JSONで実測する。

### セキュリティ
- APIキー本体 / encrypted_key / fingerprint / refresh token / secretはJSON・Workerログ・SERVICE_USAGE metadataへ出さない。
- `run_id` は相関用UUID。
- `leaseJobId` は処理相関用IDであり、APIキー本体ではない。

### 本番確認状況
- GitHub main反映: **済み**。
- Cloudflare本番deploy: **未確認**。
- 本番負荷テストで `run_id` → API Pool lease → API Pool usage → SERVICE_USAGE/R2 が一貫して追跡できること: **未確認**。
- 本番status JSONで `loadTest.runId` / `apiPool.leaseDetails[].leaseJobId` が同じrun_idになること: **未確認**。

本番確認時:
1. テスト開始前status JSONを保存。
2. 負荷テストを実行し、NDJSONのrun_idを記録。
3. テスト中status JSONで `loadTest.active=true` と `loadTest.runId` を確認。
4. 同時刻の `apiPool.leaseDetails[].leaseJobId` とrun_idが一致することを確認。
5. テスト後、API Pool usageの `job_id` とSERVICE_USAGE/R2の `metadata.run_id` が一致することを確認。
6. D1 Rows Read/Written増分を確認。


# 59. 2026-10-02 OWNER王国並列負荷テスト「実行ボタンが反応しない」継続調査

## 59-1. 実機事象

OWNER Control / ADMIN Controlから開ける「王国並列負荷テスト」ページで、「並列取得テストを実行」を押しても、ユーザー実機では期待する進捗表示・取得処理が始まらない。

重要:
- ユーザーから7198まで本番deploy済みと明示された。
- 84b890も本番deploy完了をユーザー実機で確認済み。
- よって今回の調査では「最新コードがdeployされていない」を原因の前提にしない。
- 本番で挙動が変化していないことはユーザー実機で確認済み。
- ただし、ブラウザから負荷テストAPIへ実際にGETが送信されたかは未確認。

## 59-2. 7198での修正

コミット: 71986c64257f44a917ef2367b65d6dde0c447bb5

内容:
- kids入力が空なら開始王国番号 + 王国数から自動生成。
- それでも空なら画面にエラー表示。
- fetchにcredentials: same-originを追加。
- HTTP非200時にJSONのmessage/errorを画面表示。

7198のdeploy後も実機挙動は変化なし。

## 59-3. 84b890で発見した不具合

コミット: 84b8905370b22dcfdc5f022d1342f679be2916e3
message: fix: parse kingdom load test NDJSON stream correctly

ブラウザ側NDJSON解析が、実際の改行文字ではなく文字列の\\nを分割対象にしていたため、Workerからのstart/progress/complete行を正しく処理できない可能性があった。

修正後:
- buffer.split("\\n")

ユーザーは84b890のdeploy完了を確認したが、実機挙動は変化なし。
したがって84b890は実在する不具合候補を修正したものの、今回の症状の唯一の原因ではない。

## 59-4. 現在mainのブラウザコードを再読した結果

src/admin-kingdom-load-test.jsをmainから再取得して確認済み。

存在を確認したもの:
- run / result / kids / selectedKids / startKid / kidCount / buildKids / boardMode / boardLabelのDOM取得。
- buildKidsのclick handler。
- boardModeのchange handler。
- runのclick handler。
- esc関数。未定義ではない。
- kids空欄時の自動生成。
- クリック後のrun disabled。
- クリック後の「取得開始…」表示。
- fetch URL /api/owner/kingdom-load-test。
- credentials same-origin。
- HTTPエラー表示。
- response.body.getReader()。
- NDJSONのbuffer.split("\\n")。
- start/progress/complete/error処理。
- finallyでボタン再有効化。

現時点の未確認点:
- 本番HTMLが本当に現在mainのrender結果を返しているか。
- production browserでscript parse errorがないか。
- DOM取得時にnullが発生していないか。
- click handlerが実際に発火しているか。
- fetchが実際に発生しているか。
- fetchが発生した場合のHTTP status / response stream。

## 59-5. サーバー側API確認結果

handleOwnerKingdomLoadTestApiはmainに存在。

OWNERかつACTIVEであることを要求。
入力:
- kidsをparse。
- boardを取得。
- all_rankings=1で全ランキング。
- concurrencyを1〜50にclamp。
- kidsなしは400 KINGDOMS_REQUIRED。
- 1000王国超は400。
- 単一ランキングでboardなしは400 BOARD_REQUIRED。

開始処理:
1. SYSTEM_WATCHLIST + SYSTEM_GENERALのavailable API key数を取得。
2. 通常利用保護としてavailable - 1を最大テスト並列数にする。
3. 1本以下なら409 API_POOL_TEST_CAPACITY_INSUFFICIENT。
4. api_request_locksで二重実行防止。
5. runIdをUUID発行。
6. NDJSON TransformStream開始。
7. start / progress / complete / errorを返す。

各王国:
- SYSTEM_WATCHLISTを優先lease。
- 枯渇時SYSTEM_GENERALへfallback。
- leaseにjobId=runId、purpose=OWNER_LOAD_TEST、targetType=KINGDOM、targetId=王国番号。
- all rankingsではgetMightPulseKingdomAllRankingsを1王国1HTTP requestとして実行。
- API Pool success/failureを記録。
- api_pool_usageにも1王国1件のusageを記録。

## 59-6. status-15.jsonの最新事実

ユーザー提供status-15.jsonを解析済み。
retrieved_at: 2026-10-02T05:01:49.373Z

loadTest:
- active=false
- runId=null
- startedAt=null
- expiresAt=null
- schemaAvailable=false

API Pool:
- SYSTEM_GENERAL AVAILABLE 0 / REVOKED 1
- USER_CONTRIBUTED AVAILABLE 13 / REVOKED 5
- total AVAILABLE 13 / REVOKED 6
- activeLeases 6
- expiredActiveLeases 6
- leaseDetailsにはOWNER_LOAD_TESTのleaseは確認できない。
- 既存leaseはKINGDOM_WATCHLIST_RANKING、target 1526、expired/revoked。

Query Insightsカテゴリ:
- Current Ranking: 176,285 queries / rowsRead 607,600 / rowsWritten 174,967
- API Pool: 10,460 / rowsRead 110,149 / rowsWritten 27,940
- Diagnostics: 2,593 / 1,454,432 / 10,415
- Player Observation: 625 / 69 / 3,138
- Player DB: 1,280 / 4,660 / 2,999
- Change Event: 427 / 2 / 2,550
- Kingdom Watchlist: 1,704 / 8,740 / 1,325
- Other: 1,337 / 2,654 / 36
- User Accounts: 557 / 2,541 / 14
- Player Watchlist: 370 / 628,013 / 8
- Data Coverage: 9 / 134,306 / 0
- Ranking Snapshot: 187 / 85 / 0
- Retention: 32 / 32 / 0

注意: status JSONのloadTest.active=falseだけでは、過去に完了した負荷テストがなかったとは断定できない。ロックは完了時に削除される。ただし今回のstatus-15にはOWNER_LOAD_TESTの明確な相関痕跡は確認できていない。

## 59-7. 次スレでの原因切り分け優先順位

A. ブラウザ側click handlerが実行されていない。
- 現在のコードにはinline scriptがありDOMContentLoadedによる遅延bindではない。
- script parse/binding/DOM取得失敗の可能性を確認する。

B. 本番HTMLが想定したmainのrender結果と異なる。
- deploy済みでもbrowser cache/CDN cache等を含め、実際のHTML取得内容を比較する。

C. clickは発火するがfetch前に例外。
- kidsInput.value、startKid、kidCount、renderSelected、board、boardMode等のnull/例外を確認。

D. fetchは発生しているがAPIが即時拒否。
- Networkで403 OWNER_REQUIRED、400 BOARD_REQUIRED、400 KINGDOMS_REQUIRED、409 API_POOL_TEST_CAPACITY_INSUFFICIENT、409 LOAD_TEST_ALREADY_RUNNING等を確認。

E. fetch後のstream処理で失敗。
- response.body、reader、JSON.parse、renderLoadProgressを確認。
- NDJSON splitは84b890で修正済み。

## 59-8. 次スレで必ず実施する調査

1. 本番 /owner/kingdom-load-test の実HTMLを取得してmainのrender結果と比較。
2. ブラウザConsoleのparse error / runtime error有無を確認。
3. click handlerの最初に診断用の画面表示を置き、click発火を確認。
4. fetch直前の診断表示を置く。
5. NetworkでGET /api/owner/kingdom-load-testの有無を確認。
6. GETがあればHTTP statusとresponseを確認。
7. response stream受信開始を診断。
8. start/progress/complete/error各段階を診断。
9. 必要ならDOMContentLoaded安全化とrunボタンへのtype=button明示を実施。
10. 修正後はmain commit → deploy → production E2Eの順で確認。
11. production E2Eで確認していないものは確認済みと表現しない。

## 59-9. 再発防止

- ページ全体のHTML/script/event binding/route/APIを通しで確認してから「修正済み」と判断する。
- NDJSON等のescapeを含むコードはGitHub上の表現とブラウザ実行時の意味を区別する。
- status JSONは完了済みテストの履歴ではなく、その取得時点の状態なのでactive=falseだけで過去実行を否定しない。
- deploy済みとproduction E2E verifiedを分離する。

## 59-10. 関連コミット

- 6c1cf177d5794b46f736a0c867811405390b504a: 王国範囲/全ランキング/並列数拡張
- 1079fe2cef108e14dc951a9429e49038a7b0ecff: 1000王国上限、parser、board_count
- d3cd72d874c60402e46b6382f1fc75c2122acfcd: OWNER_KINGDOM_LOAD_TEST SERVICE_USAGE
- b9a2fb4c3f55f408546db6bce5fbba06f9cfab14: actor/run correlation
- acf6451ff7e0c386eacfaaedd7c6d4003315b256: API Pool保護
- f8ab8ceb902c6807398c032e3e28dca662ffc067: public load test status read-only
- af0c09b4342632b5f0f9e01c160c11a42cbcffab: status JSON loadTest
- cc889db4e0640c0c1d793cfb0cbceb62d0a3e: API Pool leaseDetails JSON
- 53b21ccf242d579e23ee282d8b6e8385e811937d: watchlist details JSON
- 7e1095ed95879d34b24ea60f5d2b9569d5baee4e: API Pool usage run_id correlation初回
- 4fb4f421cd55e1bfc9a4afb401152fc4faf18607: API Pool fallback側run_id修正
- c36b68a5153ad5332eff2462b92e5800fb512a1c: loadTest runId status追加
- 8c8811e386e196c936c12e3a4963c07f9bfe60cd: status側lock_token select修正
- 71986c64257f44a917ef2367b65d6dde0c447bb5: click handler自動kids生成/HTTPエラー表示
- 84b8905370b22dcfdc5f022d1342f679be2916e3: NDJSON split修正

最新実機事実: 7198 deploy済み、84b890 deploy済みだが、ユーザー実機でボタン操作時の挙動は変化なし。次スレは59-8から再開。


## 60. API Poolの基本原則：Pool Typeは「属性」であり、通常取得時の利用プールを分断しない（2026-10-02）

### 60-1. 原則確定
EagleEyeのMightPulse APIキーについて、以下を基本原則とする。

- `SYSTEM_GENERAL`
- `SYSTEM_WATCHLIST`
- `USER_CONTRIBUTED`

は、**通常のMightPulse取得リソースとしては分けて考えない**。
3つの `pool_type` は、キーの管理・出所・用途を識別するための**属性（メタデータ）**であり、利用可能なAPIキーを機能ごとに分断するための壁ではない。

通常のMightPulse取得・テスト・研究・診断等では、原則として上記3種類を**1つの共有API Poolとして扱い、利用可能なキーを横断してリースする**。

### 60-2. 運用ルール
- キー選択時は3種類を横断して `AVAILABLE` / 利用可能な `COOLDOWN` を選択する。
- `last_used_at` を基準とした既存のLRU選択ロジックを維持する。
- リース後は実際に選択されたキーの `pool_type` を記録する。
- `USER_CONTRIBUTED` だから通常取得から除外する、という実装は禁止。
- `SYSTEM_WATCHLIST` → `SYSTEM_GENERAL` → `USER_CONTRIBUTED` のような優先順位付きfallbackも原則禁止。3種類を最初から同一候補集合として扱う。
- `pool_type` による集計・表示・監査・所有者管理は維持してよい。これは「属性の可視化」であり、取得リソースの分断ではない。

### 60-3. 例外
以下は「取得リソースを分断する」こととは意味が異なるため、現状のまま維持する。

- `USER_CONTRIBUTED` の登録者ごとの登録本数上限・同意情報・出所管理。
- 個別APIキーのHealth Checkなど、特定の1キーを対象にする操作。
- API Pool管理画面での `pool_type` 表示・監査情報。
- `recordApiPoolSuccess/Failure` 等で、実際に使ったキーの `pool_type` を履歴へ記録すること。

これらはキーの「属性・管理情報」であり、通常のAPI取得可能数を制限する目的ではない。

### 60-4. 2026-10-02の修正
以下を共有Pool利用へ統一した。

- `src/api-pool.js`
  - `leaseApiKey()` が `poolTypes` を受け取り、複数Pool Typeを1つの候補集合として原子的にLRU leaseできるよう変更。
- `src/admin-kingdom-load-test.js`
  - OWNERロードテストを3 Pool Type横断の共有Poolへ変更。
  - 容量計算も3種類のAVAILABLE合計を使用。
- `src/index.js`
  - MightPulse probe
  - Admin player test
  - Admin kingdom ranking test
  - Watchlist系API取得
  - Player lookup
  を3 Pool Type横断へ変更。
- `src/mightpulse-research.js`
  - MightPulse Researchも3 Pool Type横断へ変更。

関連コミット:
- `82fedb1f0e081206c2061a70baec01114f6bb141` — shared API pool leasing
- `e5b81d4fd1c0aee4f415be8fe060a45d7da3b2b1` — OWNER load test shared pool
- `bd44fca0d66e839fae9588273534c4b23d440452` — all normal MightPulse retrievals shared pool
- `b3e4602355552fbcba84c1538276747a4bfa04eb` — research shared pool

### 60-5. 再確認ルール
今後MightPulse取得機能を追加・修正する際は、`leaseApiKey()` に単一の `poolType` を渡して利用可能キーを限定していないか確認すること。

**「USER_CONTRIBUTEDはユーザー提供であることを示す属性であり、利用可能なAPIリソースとして分けない」ことをEagleEye本体の設計原則とする。**

なお、2026-10-02時点では上記変更の本番E2E確認は未実施。デプロイ済みと本番確認済みを混同しない。


# 61. System Logを「システム全体の実行履歴」として再設計（2026-10-02）

## 61-1. 基本原則
EagleEyeのSystem Logは、単なるhealth checkや障害一覧ではない。

**「その時点でシステム全体で何が起きたのかを、後から時系列・相関ID付きで追跡できること」**を目的とする。

したがって、ボタン/APIが呼ばれたか、どの処理が開始したか、どの対象を処理したか、成功したか、失敗したか、どのエラーコードだったか、どのrun_id / trace_idでつながるか、スケジュール処理・Queue処理で何が起きたか、OWNER負荷テストの各王国リクエストがどうなったかをSystem Logから確認できる設計とする。

## 61-2. diagnostic_eventsとの役割分離
- diagnostic_events: サービスの健康状態・heartbeat・障害状態の要約。
- system_event_log: 実行履歴・操作履歴・処理開始/進捗/完了/失敗の時系列ログ。

SUCCESSのhealth checkを間引く既存throttleはSystem Logには適用しない。System Logは監査・相関用の履歴であり、「同じ成功だから省略する」ものではない。

## 61-3. System Log schema
追加:
- migrations/0028_system_event_log.sql
- src/system-log.js

主な項目:
- event_id
- trace_id / parent_trace_id
- event_type
- service / feature / operation
- status
- actor_type / actor_id
- target_type / target_id
- http_method / http_path / http_status
- started_at / completed_at / elapsed_ms
- error_code / message
- metadata_json
- created_at

APIキー、encrypted_key、fingerprint、cookie、token、refresh token、raw request body等のsecretは記録しない。

## 61-4. 全HTTPリクエスト
WorkerのHTTP入口でrequest traceを生成し、System Logへ記録する。

これにより、負荷テストページを開いた、status JSONを取得した、負荷テストAPIを叩いた等のHTTP入口到達自体を後から確認できる。

## 61-5. OWNER王国負荷テスト
負荷テストはHTTP request traceをrun traceとして引き継ぐ。

相関:
HTTP request → trace_id → OWNER_KINGDOM_LOAD_TEST START → KINGDOM_REQUEST PROGRESS → OWNER_KINGDOM_LOAD_TEST COMPLETE/ERROR → API Pool lease (lease_job_id) → API Pool usage (job_id) → SERVICE_USAGE (metadata.run_id)

これにより「ボタンを押したのにシステム側で何も起きていない」のか、「APIまで到達したが途中で失敗した」のかをSystem Logから切り分ける。

## 61-6. Scheduler / Queue
HTTP以外の主要実行経路もSystem Logへ記録する。
- Scheduled/cron開始・完了・失敗
- Queue batch開始・完了・失敗

## 61-7. System Status JSON
System Status JSONに systemLog を追加。
- 最新200イベント
- trace_id
- event_type
- service
- feature
- operation
- status
- actor / target
- HTTP情報
- error
- metadata

さらに loadTest.lastRun を追加し、負荷テストの最新System Logイベントから直近実行の相関情報を確認できる。

これにより、負荷テスト完了後に active=false / runId=null だけを見て「実行されていない」と誤判定しない。

## 61-8. 運用ルール
今後新機能を追加するときは、HTTP入口、主処理START、対象単位のPROGRESS、COMPLETE、ERROR、外部API / Queue / Scheduler / 非同期処理との相関をSystem Logへ記録する。

**「コード上で処理しているのにSystem Logから追えない処理」を新規機能で作らない。**

なお、今回の実装はGitHub mainへの反映まで。Cloudflare本番deployおよび実機E2EでSystem Logが実際に負荷テストを捕捉することは、別途確認する。


## 61-9. 2026-10-02 継続実装: System Logトレース基盤の再設計へ移行

2026-10-02、System Logを既存イベントの継ぎ足しではなく、EagleEye全体で共通利用する実行トレース基盤として再設計する方針を確定。

### 設計原則
- System Logはhealth check一覧ではなく、システム全体の実行履歴・相関情報を追跡する。
- 既存イベントを無秩序に追加せず、共通Trace Contextを中心に各処理を接続する。
- 同一処理についてSTART/COMPLETEの2行を機械的に書く方式は、D1書き込み増加と重複を招くため基本採用しない。
- 1つの論理Operationは原則として終端イベント1件（COMPLETED / FAILED）を記録する。
- 子処理は `childSystemTrace()` で親Traceと接続する。
- 外部API、API Pool、D1、R2、Queue、Google、Discord等のイベントも、可能な限り親Operationから辿れるTraceとして記録する。
- 既存のrun_id等の業務相関IDは削除せず、Traceとは役割を分離して併用する。
- 過去のSystem Logデータは削除せず、コード上の重複するイベント生成を整理する。

### 2026-10-02時点の新基盤実装
- `src/system-log.js`
  - `createSystemTrace()` を追加。
  - `childSystemTrace()` を追加。
  - `runSystemOperation()` を追加。
  - `runSystemOperation()` は論理Operationを実行し、成功時または失敗時に終端イベントを1件記録する。
  - System Log書き込み失敗は本処理を壊さない既存方針を維持。
- `src/admin-kingdom-load-test.js`
  - 王国単位処理を共通 `runSystemOperation()` へ移行。
  - 王国ごとに親Traceから子Traceを生成。
  - 旧 `LOAD_TEST / START` の重複System Logイベントを削除。
  - 王国単位の `KINGDOM_REQUEST` は終端イベントとして1件記録。
  - API Pool Success/Failureへ王国単位Traceを渡す。
- `src/api-pool.js`
  - `recordApiPoolSuccess()` / `recordApiPoolFailure()` に任意の `traceId` を追加。
  - 指定されたTraceを優先してSystem Logへ記録できるよう変更。
  - 既存の `jobId` 相関はSERVICE_USAGE/API Pool用途のため維持。

### 現在のTrace構造

```
HTTP request
  trace_id = requestTrace
      |
      +-- OWNER load test
      |      |
      |      +-- KINGDOM_REQUEST(kid=XXXX)
      |      |      +-- API_POOL success/failure
      |      |
      |      +-- KINGDOM_REQUEST(kid=YYYY)
      |             +-- API_POOL success/failure
      |
      +-- その他の内部Operation
```

### まだ移行していない主要処理
以下はコード上の明示的System Log接続が未整備であり、今後共通Traceへ移行する対象。

- MightPulse本体 / Research
- Player Store
- Ranking Store
- API Observation
- R2 Archive
- History Emergency Buffer
- Retention
- SERVICE_USAGE / Service Usage Archive
- Google Drive / Google Sheets
- Discord Support
- User Player Link
- User Eligibility
- Gateway API
- 各Admin / Owner mutation
- Watchlist / Player Watchlist内部処理
- Auth / OAuth内部処理

### 本番確認状況
- GitHub main反映: **済み**
- Cloudflare本番deploy: **未確認**
- OWNER負荷テスト実機E2E: **未確認**
- 新しいTrace基盤での本番Trace相関: **未確認**

### 次の作業
1. 全HTTP route→内部Operationの呼び出し関係を確定。
2. MightPulseを共通Trace対応。
3. Player / Ranking / Observation / R2 / Emergency Bufferを共通Trace対応。
4. SERVICE_USAGE / Queue / Archiveを共通Trace対応。
5. Google / Discord / Auth / User Player Link / Admin mutationを共通Trace対応。
6. 既存の重複System Logを整理。
7. System Log UIをTrace treeとして確認できる形へ整理。
8. D1書き込み量を測定し、必要な保持・アーカイブ設計を決定。
9. deploy後にOWNER負荷テストで1本のTraceを実機検証。

# 62. System Log JSONの統合取得仕様（2026-10-02・最重要固定仕様）

## 62-1. 既存の「システムログJSON」を取得口として継続利用する
EagleEyeでは、現在運用しているショートカットが `GET /api/gateway/v1/status` を手動取得し、そのJSONを「システムログ」としてテスト前後に保存・比較している。

この取得方法を変更しない。

**新しいSystem Log専用取得URLを追加して、ショートカット側で2つのJSONを取得させる設計にはしない。**

今後も以下を唯一の取得口とする。

```
/api/gateway/v1/status
        ↓
既存のシステムログJSON
```

## 62-2. 1回の取得で「現在状態＋過去24時間の全System Log」を返す
`/api/gateway/v1/status` のレスポンスを拡張し、現在のStatus情報を維持したまま、**取得時点を基準に過去24時間のSystem Logを同じJSONへ統合する。**

最終的な1ファイルには少なくとも以下を含める。

- 現在のシステム状態
- Diagnostics
- Cloudflare使用量
- API Pool状態
- Watchlist状態
- Load Test状態
- R2 / History Storage状態
- Emergency Buffer状態
- Runtime / binding / configuration情報（secret値は除外）
- 過去24時間に発生したSystem Event
- `trace_id` / `parent_trace_id`
- event_type / service / feature / operation / status
- actor / target
- HTTP method / path / status
- elapsed time
- error code / message
- 安全なmetadata

したがって、ユーザーのショートカットは**URL変更なし・取得操作変更なし**で、取得できる情報だけが増える。

## 62-3. 24時間の基準
「過去24時間」は固定日付ではなく、**JSON取得リクエストを受けた時刻を終端**とする。

例:
- 2026-10-02 23:00に取得 → 2026-10-01 23:00以降を対象
- 取得ごとに対象期間は動的に決まる

レスポンスには、解析時に範囲を明確にできるよう `retrieved_at` と `systemLog.range.from / to` 相当の情報を持たせる。

## 62-4. 「EagleEye全体」の定義
System Log JSONはhealth checkだけを対象にしない。

24時間範囲内のEagleEyeの主要な実行経路を、共通Traceで追跡できることを完成条件とする。

対象例:
- HTTP request
- OWNER王国負荷テスト
- MightPulse API通信
- API Pool lease / success / failure
- Player取得・保存
- Ranking取得・保存
- API Observation
- Watchlist / Player Watchlist
- D1を伴う主要処理
- R2 archive
- History Emergency Buffer
- Queue producer / consumer / DLQ関連処理
- SERVICE_USAGE
- Cron / Scheduler
- Google Drive / Google Sheets
- Discord Support
- Auth / OAuth
- User Player Link / User Eligibility
- Admin / Owner mutation
- Research
- その他EagleEye内部Operation

ただし、D1の低レベルSELECTを無差別に1クエリ1イベントとして記録する設計にはしない。
**「システム全体の論理Operationを後から復元できること」と「System Log自身が大量のD1 Rows Writtenを発生させないこと」を両立する。**

## 62-5. Trace設計
既存のTrace基盤を全機能へ拡張する。

```
HTTP request
  trace_id
    ├─ logical operation
    │    ├─ child operation
    │    │    ├─ external API
    │    │    ├─ API Pool
    │    │    └─ storage / queue
    │    └─ ...
    └─ ...
```

- 1つの論理Operationは原則1終端イベント。
- 子処理は `parent_trace_id` で接続。
- `run_id` 等の既存業務相関IDは維持。
- secret / token / raw body等はログへ出さない。

## 62-6. 長期保存とJSON取得は役割を分離する
System Log JSONの手動取得と、長期アーカイブは同じものとして扱わない。

- `/api/gateway/v1/status`: ユーザーがテスト前後に1回取得する「現在状態＋直近24時間」のJSON。
- 長期アーカイブ: 既存のR2 → Google Drive構想を維持し、必要な履歴を長期保存する。
- 24時間JSONを5年・10年分まとめてD1へ保持する設計にはしない。

**取得するJSONは1個のまま、保存基盤だけを長期運用向けに分離する。**

## 62-7. テスト前後比較の完成形
既存運用:

```
テスト前
  ↓
/api/gateway/v1/status を手動取得
  ↓
system-log-before.json
  ↓
テスト実行
  ↓
/api/gateway/v1/status を手動取得
  ↓
system-log-after.json
```

この運用を変更しない。

アップデート後は、before / afterの各1ファイルに、現在状態だけでなく取得時点から過去24時間のEagleEye実行履歴が含まれるため、**テストによって何が起きたかを同じJSONで前後比較できる**状態を目標とする。

## 62-8. 実装時の禁止事項
- 新しいSystem Log専用URLを作ってショートカットを2本化しない。
- 既存 `/api/gateway/v1/status` の現在Status情報を削除・縮小しない。
- 「System Log = diagnostics」としない。
- OWNERロードテスト等の実処理をstatus JSONから追えない状態に戻さない。
- 全D1クエリを機械的に1件ずつSystem Eventへ変換しない。
- 24時間範囲を固定時刻で決めない。
- 本番未確認の内容を確認済みと記載しない。

## 62-9. 完成条件
以下をすべて満たした時点をこのアップデートの完成とする。

1. `/api/gateway/v1/status` が従来のStatus情報を維持する。
2. 同じレスポンスに取得時点から過去24時間のSystem Eventを含む。
3. EagleEye主要機能の論理OperationがTraceで追跡できる。
4. OWNER王国負荷テストの実行・各王国処理・外部API・API Pool等を同じTrace系統から追える。
5. 成功・失敗・例外を追跡できる。
6. secret / token等がJSONへ漏れない。
7. System Log自身によるD1負荷が過剰にならない。
8. 既存ショートカットを変更せず、1回の取得で完結する。
9. GitHub main反映・deploy・production E2E確認をそれぞれ別々に記録する。


# 63. System Log JSON Phase 3実装状況（2026-10-02）

- 3/7「EagleEye主要処理のTrace接続」を実装。
- 既存の `runSystemOperation()` / `createSystemTrace()` を利用し、論理処理単位でterminal eventを記録する方式を維持。
- 接続済み主要処理:
  - API Observation保存
  - Player materialization
  - Player Rank Snapshot保存
  - Kingdom Ranking Board保存
  - History Emergency Buffer enqueue / drain
  - Retention Cleanup
  - SERVICE_USAGE Queue enqueue
  - User Player Link登録 / 無効化
  - Ownership Support Request作成 / Player Link transfer
  - User提供MightPulse API Key登録 / Advanced Eligibility評価
  - Google Sheets export
  - Discord Support ticket create / close / reopen
- 既存接続済みのMightPulse / API Pool / OWNER Kingdom Load Test / HTTP / Watchlist / Queue / CronのTrace設計は維持。
- R2 ArchiveそのものはD1 System Logの親traceを確実に渡せる形にする必要があるため、Phase 4でSystem Log R2 archiveと併せて接続する。ダミーのSystem Logは生成しない。
- 低レベルD1 SELECT単位のイベント大量生成は行わない。
- 次工程: 4/7 System Log R2 archival。


# 64. System Log JSON Phase 4実装状況（2026-10-02）

- 4/7「System Log R2 archival」を実装。
- `system_event_log` を既存の共通 `archiveD1RowsToR2()` のアーカイブ対象へ追加。
- 24時間を超えたSystem EventをRetention CronからR2へ退避。
- アーカイブ順序を **R2 PUT成功 → D1 DELETE** に固定。
- R2保存失敗時はD1削除を実行せず、次回Cronで再試行可能な状態を維持。
- 1回のCronでは最大1000件を処理し、残件数を結果へ返す。
- R2 object keyは既存のarchive形式を利用し、source table / row count / rowid範囲をmetadataへ記録。
- System Log自身のarchive operationも共通Traceで記録。ただし現在の実行直後のイベントは24時間未満なので同じ処理で即削除されない。
- 既存の他テーブルRetention設定とは分離し、System Logだけは固定24時間保持として扱う。
- 低レベルSELECTごとのSystem Event生成は追加していない。
- 本番deploy / R2実機保存確認は未実施。
- 次工程: 5/7 System Log retentionの運用整合性確認・Cron処理の整理。


# 65. System Log JSON Phase 5実装状況（2026-10-02）

- 5/7「System Log retention」を運用面まで整理。
- System Logの保持期間は設定可能な他テーブルとは分離し、固定24時間。
- 5分Cronの各実行で24時間超過分を最大1000件ずつR2へ退避。
- **R2保存成功前のD1削除は禁止**。
- R2未設定時はskip扱いとし、D1 System Logは削除しない。
- 通常のデータRetentionが失敗してもSystem Log Retentionは独立して実行する。
- System Log Retention自身の診断結果を `diagnostic_events` に記録。
- R2 PUT成功後にD1 DELETEが失敗した場合も、次回実行時に同じarchive keyへ再PUTされるため、同一batchの二重オブジェクト増殖を避けられる既存key設計を利用。
- 24時間は「厳密に24時間経過した時点で即削除」ではなく、5分Cronによる最初の実行時点で24時間超過分を処理するため、実運用上の保持上限は約24時間+Cron間隔。
- 本番Cron/R2実機確認は未実施。


# 66. System Log JSON Phase 6実装状況（2026-10-02）

- /api/gateway/v1/status のSystem Log取得は既存の1回の24時間D1読み取り結果を再利用し、整合性サマリー算出のための追加D1クエリを発行しない。
- System Log summaryとして event_count / trace_count / services / statuses / metadata_parse_failures / oldest_created_at / newest_created_at / page_size / complete_window_read をJSONへ追加。
- 取得処理はpageSize=500のkeyset paginationを継続し、24時間分をlimit=nullで最後まで取得する。
- D1の過去ranking_snapshots等を横断取得する処理は追加していない。
- metadata_jsonはSystem Log取得時にJSON化済みの値を利用し、実際のparse failureだけをカウントする。
- System Logの大量化に対して、summary算出で追加readを発生させない構造を維持。
- この段階でコード上のD1/R2整合性経路を確認済みだが、実本番での24時間イベント件数・JSON実サイズ・D1 row read/R2 operation実測は未実施。


# 66. 次スレッド引き継ぎ（2026-10-02・Phase 5完了後）

## 現在地点

System Log JSON統合仕様の実装は **5/7まで完了**。

- [✓] 1/7 System Log取得基盤
- [✓] 2/7 `/api/gateway/v1/status` への24時間System Log統合
- [✓] 3/7 EagleEye主要処理Trace接続
- [✓] 4/7 System Log R2アーカイブ
- [✓] 5/7 System Log retention
- [ ] 6/7 D1/R2負荷・整合性確認
- [ ] 7/7 本番E2E

## 次スレッドで開始する内容

**6/7から開始し、7/7まで進める。**

### 6/7 D1/R2負荷・整合性確認

確認対象：

1. `/api/gateway/v1/status` が返す24時間System Logの件数・JSONサイズ。
2. System Log取得時のD1 read量。
3. System Log記録によるD1 write量。
4. 24時間分のイベント取得が200件などの旧上限に戻っていないこと。
5. keyset pagingが正常に機能すること。
6. System Logのtrace_id / parent_trace_idによる追跡整合性。
7. R2 archive objectのrowCount / firstRowid / lastRowidとD1削除件数の整合性。
8. R2保存失敗時にD1イベントが残ること。
9. 1000件を超えるexpired System Logが複数Cron回で正常に消化されること。
10. 既存のD1/R2負荷に対してSystem Log追加分が許容範囲か確認すること。
11. secrets / token / raw request bodyがSystem Log JSONへ混入していないこと。

※ D1の無料枠・read消費を重視する既存方針を維持する。低レベルSELECTをSystem Logへ大量記録する設計には戻さない。

### 7/7 本番E2E

既存のiPhone Shortcutを**変更しない**。

既存取得経路：

`GET /api/gateway/v1/status`

テスト手順：

1. テスト前に既存ShortcutでSystem Log JSON取得 → before JSON。
2. EagleEye上で対象操作を実行。
3. テスト後に同じShortcutでSystem Log JSON取得 → after JSON。
4. before / afterを比較。
5. 実行した操作がSystem Logに記録されていることを確認。
6. trace_id / parent_trace_idから処理経路を追跡。
7. `/status`の既存status情報が維持されていることを確認。
8. R2 archive対象イベントについて、R2保存成功→D1削除の実挙動を確認。
9. R2保存失敗ケースではD1イベントが削除されないことを確認できる範囲で検証。
10. Watchlist / Player Watchlist / MightPulse / Player Store / Ranking Store / API Observation / Queue等、主要処理のtraceが実際に残ることを確認。
11. 実機・本番で確認できた項目だけを「本番確認済み」として記録する。

## 重要な固定仕様

- System Logの取得URLは `/api/gateway/v1/status` のまま。
- iPhone Shortcutは変更しない。
- System Log専用の第二取得Endpointは作らない。
- 1つのJSONに「現在のシステム状態」と「直近24時間の論理System Event履歴」を同居させる。
- 24時間範囲は取得時刻を `to`、そこから24時間前を `from` とする。
- 「全ログ」は低レベルD1 SELECTを全部記録する意味ではなく、EagleEyeの主要な論理処理・実行経路を追跡できることを意味する。
- System Log D1 retentionは固定24時間。
- 24時間超過分はR2へアーカイブし、**R2保存成功後のみD1から削除**。
- R2失敗時はD1を残す。
- System Log retentionは通常Retentionと独立して実行する。
- 1回最大1000件、残件は次回Cronへ繰り越す。
- 既存Cronは5分間隔。
- 長期保管はR2 / Google Drive側の既存方針に従う。
- 本番確認していない項目を推測で「確認済み」としない。

## 直近コミット

Phase 5関連：

- `da4aa72372c01a7783205262a97e05696a27bbf4`
  - `fix: isolate system log retention from other cleanup failures`
  - 通常Retention失敗がSystem Log Retentionを停止させないよう分離。

- `2f5615f9198e6eadb16944450d60142a5b996e46`
  - `docs: record system log phase 5 retention`
  - 本セクションを含む引き継ぎ更新。

Phase 4以前の主要コミットは #64およびそれ以前の引き継ぎ内容を参照。

## 次スレ開始時の一言

`#66の引き継ぎから続き。System Log JSONの6/7 D1/R2負荷・整合性確認を開始して、7/7本番E2Eまで進める。`

# 67. System Log JSON Phase 6/7 実施状況（2026-10-02）

## Phase 6/7 D1/R2負荷・整合性確認

### GitHub mainで確認できたこと
- latest main HEAD: `19b2f7385b05bb5d047fa15a67cebb2437d661d3`
- Phase 6 implementation commits:
- `14e8bc82031a488aa34ca15f6bb6d0e688d312e3`: getSystemEventLog() keyset pagination, pageSize 500, since/until, limit=null complete read.
- `3130e2adc86e3d4f77700a7ac41d617be22854cd`: /api/gateway/v1/status system log summary from already materialized events; no summary-only D1 reads.
- `87c7371c78ee8a7f5d6d085c3d96f92c09c017e1`: metadata parse failure count corrected.

### 実装上のD1/R2評価
- System Log取得は最大500件単位のkeyset pagination。
- summary算出のための追加COUNT queryなし。
- 1論理Operation=terminal event 1件を基本としSTART/COMPLETE二重書き込みを避ける。
- retentionはR2 PUT成功後のみD1 DELETE。
- 1回のSystem Log retention batchは最大1000件。
- R2 metadataにsourceTable / rowCount / firstRowid / lastRowidを保持。
- R2保存失敗時はD1削除しない。
- ranking_snapshotsの広範囲取得は追加していない。

### 本番実測値
GitHub接続だけでは以下の本番実測は取得できないため未確認。
- 24h event_count
- response JSON byte size
- status 1回のD1 Rows Read差分
- System Log記録によるD1 Rows Written差分
- 本番R2 object数
- 本番archive metadata実値
- 1000件超の複数Cron消化実績
- R2 failure時のD1保持実機結果
- 本番Trace tree実データ

### Phase 6判定
- [✓] コード構造
- [✓] keyset pagination
- [✓] summary追加readなし
- [✓] R2 PUT→D1 DELETE
- [✓] R2 failure時D1保持
- [✓] 1000件batch上限
- [✓] secret/token秘匿設計
- [ ] 本番D1/R2メトリクス実測
- [ ] 本番R2 object整合性実測

**Phase 6 = コード検証完了・本番実測未完了。**

## Phase 7/7 本番E2E

既存iPhone Shortcutは変更しない。

1. 本番テスト前に既存Shortcutで `GET /api/gateway/v1/status` を取得しbefore JSONを保存。
2. OWNER権限で対象操作を1回実行。推奨対象はOWNER王国負荷テスト。
3. 終了後、同じShortcutでafter JSONを取得。
4. before/afterの `gateway.systemLog.events` と `gateway.systemLog.summary` を比較。
5. 実行操作のSystem Event増加を確認。
6. `trace_id` / `parent_trace_id` から親子処理とAPI Pool等の追跡を確認。
7. `gateway.systemLog.range.from/to` の24時間窓を確認。
8. 既存Status項目が維持されていることを確認。
9. API key / token / raw body等のsecret漏洩がないことを確認。
10. 可能な範囲でR2 archive metadataとD1削除件数を照合。
11. 本番で確認できた項目だけを本番確認済みとして更新。

### Phase 7完了条件
- [ ] before JSON取得
- [ ] 本番操作実行
- [ ] after JSON取得
- [ ] System Event差分確認
- [ ] Trace親子関係確認
- [ ] status既存情報維持確認
- [ ] secret漏洩なし確認
- [ ] R2/D1 retention実機確認
- [ ] handoffへ本番確認結果追記

## 現時点の最終ステータス
- Phase 1/7: ✓
- Phase 2/7: ✓
- Phase 3/7: ✓
- Phase 4/7: ✓（コード）
- Phase 5/7: ✓（コード）
- Phase 6/7: △ コード検証完了 / 本番メトリクス未実測
- Phase 7/7: 未完了 / 本番E2E待ち



# 68. OWNER王国負荷テスト再設計（2026-10-02）

## 背景

2026-10-02の実機テストで、旧OWNER王国並列負荷テストが「複数王国へMightPulseランキングAPIを並列実行するだけ」であり、実際の王国Watchlist利用時に発生する比較・保存・履歴化・上位プレイヤー取得まで含む本番負荷を再現していないことが判明した。

旧実装は getMightPulseKingdomAllRankings() を使って王国単位のbulk responseを取得し、レスポンス件数を数えてAPI Pool/Worker負荷を測るだけだった。

これは「MightPulse取得負荷テスト」であり、「EagleEyeでユーザーが王国Watchlistを利用した場合の負荷テスト」ではないため、設計を変更した。

## 新しい固定仕様

OWNER負荷テストは、各対象王国について実際の processKingdomWatchlistJob() をそのまま実行する。

テスト用の一時 kingdom_watchlist_jobs 行を作成し、以下の本番処理を同じコード経路へ通す。

1. 王国ランキング26ボード取得
2. API Pool lease / MightPulse応答
3. ランキングレスポンス解析
4. getKingdomRankingChanges() による前回値比較
5. saveKingdomRankingBoard() による kingdom_ranking_current 更新
6. Change Event生成
7. R2履歴アーカイブ（R2_ONLY時はranking_snapshotsへの通常履歴INSERTを行わない）
8. personal_power上位プレイヤー抽出
9. 実際の王国Watchlistと同じPlayer取得
10. api_observations保存
11. materializePlayer()
12. Player rank snapshot保存
13. Job完了

テスト終了後に削除するのは負荷テスト用の一時Job行だけとする。

ランキング、Player、Observation、Current、Change Event、R2履歴等の実データは削除しない。

したがって、テストで取得されたデータは、その後ユーザーが同じ王国を検索・利用した際に通常データとして再利用できる。

## テストUI

- 開始王国番号
- 取得王国数（最大1000）
- 上位プレイヤー取得数（5 / 10）
- 王国Job同時実行数（1〜50）

旧「全ランキングbulk取得 / 単一ランキング」モードは廃止。

同時実行数の意味も変更し、APIリクエスト数ではなく、王国Watchlist Jobを何件同時に処理するかを表す。

各Job内部のランキング26ボード並列数は、本番Watchlistと同じ getWatchlistApiConcurrency() に委譲する。

## 負荷の意味

100王国・26ボード・各100件の場合、理論最大ランキング行は

100 × 26 × 100 = 260,000 rows

となる。

ただし毎回260,000行を必ずD1へINSERTするわけではない。

本番と同じ比較ロジックを通すため、

- 初回取得: 新規Current / R2履歴等の保存が発生
- 再取得: 変更分中心の更新
- 変更なし: 不要な保存を抑制

となる。

この性質を維持することで、負荷テスト自体がデータウォームアップとして機能し、ユーザーによる「初回検索・初回取得」の発生を減らせる。

## 実装コミット

- c82eabc56c33bbb2c62aede4d702a6e11a565cba
  - OWNER王国負荷テストを王国Watchlist実処理へ接続する再設計
- 02ea1798b698318514045e8e2c5d60d9243327ff
  - OWNER負荷テストから本番 processKingdomWatchlistJob を受け取る接続
- cd5c482bb71d63c1bacc4a898f0ab5b32910e22c
  - 1王国の失敗を全体テスト中断にせず、王国単位FAILEDとして継続

## 未確認

コード変更はmainへ反映済みだが、以下は本番E2E未確認。

- 100王国での実機実行
- 26ボード×100件の実受信/保存量
- 上位プレイヤー取得の実件数
- D1 rowsRead / rowsWritten増加量
- R2 object / payload増加量
- API Pool最大同時lease
- Worker CPU / subrequests
- 初回実行と2回目実行の差
- テスト後に通常の王国Watchlist検索が保存済みデータを再利用できること

次の実機テストでは、まず少数王国（例: 1〜3王国）で本番Watchlistと同一処理経路・保存結果を確認してから、100王国へ拡大する。


---

## 69. OWNER王国Watchlist実処理負荷テストの進捗可視化修正（2026-10-02）

### 背景
OWNERの王国Watchlist実処理負荷テストは、実際の王国Watchlist処理と同じ `processKingdomWatchlistJob()` を実行する設計になっている。一方、負荷テスト画面は従来、王国単位の処理が完了した時点でのみ `progress` を返していたため、通常の王国Watchlist画面にある「ランキング 何 / 26」「プレイヤー 何 / N」のような途中進捗を表示できなかった。

### 実装
- `src/admin-kingdom-load-test.js` を更新。
- 各一時王国Jobの `processKingdomWatchlistJob()` 1ステップ完了ごとに `job_progress` をNDJSONストリームへ送信。
- 進捗データ:
  - 王国番号
  - phase（RANKINGS / PLAYERS / COMPLETED）
  - `board_index / total_boards`（ランキングは26ボード）
  - `player_cursor / player_count`
  - ranking_rows
  - player_rows
- OWNER画面に全体進捗バーを追加:
  - `完了王国数 / 対象王国数`
  - 全体%
  - 成功 / 失敗
  - Job同時実行数
- 同時実行中の王国について、通常Watchlistと同様に「ランキング X / 26」「プレイヤー X / N」を表示。
- 王国単位の完了イベントと合わせて全体進捗を更新。
- 完了時は最終結果を維持。

### コミット
- `52d2ebc157d938804cb69ca2d0f47b88d26bb926`
- `feat: show kingdom load test progress like watchlist`

### 注意
この修正は新しいデプロイ後の負荷テストから有効。既に実行中の100王国テストには遡及しない。


---

# 70. 2026-10-02 / 王国Watchlist実処理負荷テストの進捗UIを通常Watchlistと同一化

- ユーザー要求：「数字・中身は負荷テスト用に異なってよいが、通常の王国Watchlist取得と同じUIで進捗を可視化する」。
- 直前実装では、通常Watchlistと同じ進捗情報（ランキング X/26、プレイヤー X/N、保存件数）を独自UIで表示していたが、見た目・DOM構造・CSSは完全一致ではなかった。
- 2026-10-02、src/admin-kingdom-load-test.js を修正し、通常Watchlistの進捗UIと同じ .progress / .progress-track / .progress-fill 構造・サイズ・表示形式を使用するよう変更。
- 王国ごとの進捗も通常Watchlistと同じ形式で、ランキング時は「更新中：ランキング」「X / 26」「ランキング取得 X件」、プレイヤー時は「更新中：プレイヤー」「X / N」「プレイヤーデータ取得 X件」を表示。
- 負荷テスト固有の「全体進捗」「成功 / 失敗」「Job同時実行数」は同じprogressコンポーネント内に追加表示するが、通常Watchlistの進捗カード自体の見た目を別物にしない。
- コミット: 7bd4b80bf2171208b2e4c1955bfb37cb45633b17 / fix: reuse watchlist progress UI for kingdom load test
- 本番デプロイ・実機表示は未確認。GitHub mainへの実装反映まで確認済み。


---

# 71. 2026-10-02 / 王国Watchlist実処理負荷テストに安全な中止機能を追加

- OWNER負荷テスト実行中に途中中止できるよう実装。
- 実行中のみ「負荷テストを中止」ボタンを表示。
- 中止API: `/api/owner/kingdom-load-test/cancel`。OWNER認証必須。
- 中止要求は `LOAD_TEST_CANCEL` のキャンセルフラグとしてD1へ保存し、各王国Jobの次の処理ループ開始前に検知。
- 現在進行中のAPIリクエストを強制終了せず、次の処理へ進まない安全停止方式。
- 中止された一時 `kingdom_watchlist_jobs` は既存finally処理でcleanup。
- すでに保存されたランキング・プレイヤー・Change Event・R2履歴などの本番利用可能データは削除しない。
- ロードテストの実行ロックとキャンセルフラグは終了時にcleanup。
- コミット: `f3eff57271f11d5927cdb045e56f038de7dd0e3c`（中止機能本体）、`76d6ec94f0a95b7c4eb0f1e049735a037b1d0d04`（キャンセルフラグ参照修正）、`a7deb3b50779e62d6b83f636bbb185cee675011a`（index.jsへcancel route追加）。
- 本番デプロイ・実機での中止確認は未実施。


---

# 72. 2026-10-02 / 負荷テスト画面リロード時の実行状態復旧

- 負荷テストはHTTPストリーム表示とサーバー側の実処理が分離しているため、ページをリロードしてもサーバー側のロードテスト自体は継続し得る。リロード前の進捗表示だけがブラウザから消える。
- `/api/owner/kingdom-load-test/status` は実行ロックを確認できるため、負荷テスト画面初期化時にこのstatus APIを確認し、実行中なら画面を「実行中」に復旧する処理を追加。
- リロード後はストリームが再接続されないため、過去の詳細なランキング/プレイヤー進捗を復元する機能ではなく、「実行中であること」と「安全に中止できること」を復旧する。
- 実行中なら「負荷テストを中止」ボタンを再表示し、再実行ボタンを無効化する。
- コミット: `35733970118d43cf6592ebc435075c12b9fc956d`。
- なお、ed16c1a のページ内JavaScript構文修正を含む最新mainが本番へデプロイされているかは別途確認が必要。


---

# 73. 2026-10-02 / 負荷テスト進捗を通常王国Watchlistと同じD1永続Job方式へ修正

- ユーザー要求どおり、負荷テストの進捗状態も通常の王国Watchlistと同じく `kingdom_watchlist_jobs` を正本とする方式へ変更。
- 以前は負荷テストJobを完了時に即DELETEしており、ブラウザのNDJSONストリームが切れると進捗表示を復元できなかった。これは通常Watchlistと異なるため修正。
- 負荷テストJobは `LOAD_TEST:<run_id>` の `watchlist_id` でD1に保持し、`board_index`、`player_cursor`、`player_ids_json`、`ranking_rows`、`player_rows`、`status`、`updated_at` 等を通常Watchlistと同様に永続化。
- 終了時に即DELETEせず、通常の bounded retention cleanup に任せる。
- 中止時はJobを `CANCELLED` に更新して状態を残す。
- `/api/owner/kingdom-load-test/status` は実行ロックだけでなく、該当runの `kingdom_watchlist_jobs` を読み、各王国の現在フェーズ・ランキング進捗・プレイヤー進捗・保存件数を返す。
- ページリロード時はstatus APIからD1のJob状態を復元し、その後2秒間隔で再取得して表示を更新する。ブラウザのストリームに依存しない。
- これにより、リロードしてもサーバー側の進捗表示をD1から再構築でき、通常Watchlistと同じ永続状態ベースの運用になる。
- コミット: `f7f8ac2f526c4038a29890c8040277d84a164878`。
- 本番デプロイ・実機確認は未実施。


---

# 74. 2026-10-02 / 負荷テスト全体進捗のrun単位永続化

- D1 Job復元だけでは、完了済み王国Jobが存在しない場合に対象数を誤復元する問題が判明。
- `migrations/0029_kingdom_load_test_runs.sql` を追加し、負荷テストrun単位で対象数、対象王国一覧、top_n、並列数、状態、開始・完了時刻をD1に永続化。
- status APIはrun metadataを正本として全体対象数を復元し、個別 `kingdom_watchlist_jobs` から各王国の現在進捗・完了状態を復元する。
- 完了済みJobがcleanupされても、run全体の対象母数を失わない。
- 既存のJobテーブルの制約を壊さないため、中止Jobは `FAILED + last_error=LOAD_TEST_CANCELLED` として保存し、status API上で `CANCELLED` に正規化する。
- 旧runでmetadataが存在しない場合は残存Job件数をfallbackとして使用するため、過去runの消失済み完了Jobの元々の総数までは復元できない。
- コミット: `96b9bbf19892d84af0c95c5dd827b0e818b6a20a`。
- Migration: `0029_kingdom_load_test_runs.sql`。
- 本番デプロイ・実機確認は未実施。


## 75. 2026-10-02 — Load Test reload後に進捗が消える問題を修正

### 発生事象
- 0029で `kingdom_load_test_runs` に対象王国数・対象KID一覧を保存するようにした後、新規テストを開始してリロード確認を実施。
- リロード後に画面が初期状態へ戻り、進捗が消えた。
- 原因は進捗保存そのものではなく、`/api/owner/kingdom-load-test/status` が `api_request_locks` の実行中ロックだけを見ており、テスト完了時にロックを解放すると、保存済みの `kingdom_load_test_runs` を参照せず `active:false` を返していたこと。

### 修正
- Commit: `369a5fbe908f5d840a298c56b81711d4d1499e4e`
- `handleOwnerKingdomLoadTestStatusApi()` を修正。
  - 実行中ロックがある場合は従来どおりそのrunを取得。
  - ロックがない場合も `kingdom_load_test_runs ORDER BY created_at DESC LIMIT 1` から直近runを復元。
  - `run_status` を返却し、`RUNNING` の場合はロックが無くても実行中として復元可能。
  - 完了後も保存済みJobから `X / target_count` を再構成できる。
- ページ側の `recoverRunningLoadTest()` も、`active:true` のときだけでなく、直近の完了/中止runも復元するよう修正。
  - 完了済みなら「✓ 更新完了」
  - 中止済みなら「中止」
  - 実行中なら従来どおり2秒間隔でD1保存済み進捗を再取得。
- 併せて画面上の説明文を、実装と一致する「テスト用Jobも通常Jobと同じくD1へ保存し、24時間保持後に通常の保持期限処理で削除」に修正。

### 次回確認
1. 新規テストを開始。
2. 実行中にリロード → `X / 元の対象王国数` と各王国の `26` ボード進捗が復元されること。
3. テスト完了後にリロード → 完了状態と `X / 元の対象王国数` が残ること。
4. その後、新規テスト開始時に直前の完了run表示が新runの進捗表示を邪魔しないこと。



# 76. 2026-10-02 / 全体コード監査後の第一段階修正

## 監査結果
main全体を再確認し、今回のLoad Test周辺だけでなくSystem Log / Status / Route / Job状態まで横断確認した。

第一段階で修正対象とした項目：

1. System Log trace検索のD1 binding混在
2. Operational StatusのSystem Log参照欠落
3. Load Test status APIのOWNER認証抜け
4. Load Test run異常終了時のFAILED状態欠落
5. Load Test Job例外時のJob状態不整合
6. 本番でsystem_event_logが存在しない場合のSystem Log自己修復

## 実装済み

### 1. System Log binding修正
- src/system-log.js
- trace tree開始SQLを SELECT ?1,0 から匿名placeholder SELECT ?,0 に変更。
- 後続の匿名placeholderと同一binding方式へ統一。
- Commit: e268b11678ccf15548930262bade418e78c73503

### 2. Operational Status修正
- src/status-ops.js
- Promise.all() の8番目として getSystemEventLog(db, { limit: 100 }) を明示的に取得。
- これまで未定義だった systemLogResult.filter(...) を実データへ接続。
- Commit: a3f4020f24f015b258df4160fc3828c691b91f16

### 3. Load Test status API OWNER認証
- src/index.js
- /api/owner/kingdom-load-test/status に requireOwner() を追加。
- status / cancel / start のOWNER境界を統一。
- Commit: 7489e0c11496e8a83e0cc721c0a73411c474bab1

### 4. Load Test run FAILED状態
- src/admin-kingdom-load-test.js
- run全体の予期せぬ例外を runFailed として保持。
- terminal metadata更新時に CANCELLED → FAILED → COMPLETED の順で状態を判定。
- 個別王国の通常FAILEDはrun全体のFAILEDとはせず、既存の「一部失敗ありで全体継続」仕様を維持。
- Commit: c029ff4402b6a67d33ad42bd24740f61d864c6f0

### 5. Load Test Job例外状態
- src/admin-kingdom-load-test.js
- processKingdomWatchlistJob() の例外時に、該当 kingdom_watchlist_jobs を FAILED + last_error へ永続化。
- COMPLETED済みJobを例外処理でFAILEDへ戻さない条件を追加。
- Commit: 520c6073c97cef728dc3dcd88292d7d8695b5f02

### 6. system_event_log自己修復
- src/system-log.js
- system_event_logが未作成の本番DBでも、最初のSystem Log read/write時に CREATE TABLE IF NOT EXISTS と必要indexを一度だけ実行する互換層を追加。
- recordSystemEvent() / getSystemEventLog() の双方でschema ensure。
- Migration 0028_system_event_log.sql の定義と同一schema/indexを使用。
- Commit: 5a055a9c0b62154db1fd3a4bff4defa7f136b50c
- Commit: b762904bf5632de5ec330a758a1f6a63f8f7afd7

## まだ未完了の監査項目

### Previewリソース分離
- 現在の wrangler.jsonc ではPreviewのD1/R2が本番と同一リソースを参照している。
- これは現時点では完成を阻害する問題として扱わない。
- ユーザー方針として、まず本番EagleEyeの完成・本番E2E確認を優先する。
- Previewは実データ・実リソースを使った実機検証が必要な場合に現状のCloudflare Previewを利用する。
- Preview専用D1/R2への分離は完成後の運用改善項目として保留する。

### 本番DB Migration整合性
status-26では kingdom_load_test_runs は存在した一方、system_event_log が存在しないエラーが観測された。

今回System Log側に自己修復を追加したが、D1の d1_migrations 実適用状態そのものは別途確認する。

### Migrationファイル重複
現在 migrations/ に 0008_data_retention.sql と 0008_kingdom_watchlist_jobs.sql の2ファイルが存在する。

これは履歴上それぞれ別コミットで同時期に作成されたことまで確認済みだが、既存本番DBの d1_migrations 適用状況を確認せずに改名・削除してはいけない。

## 次の順番
1. 本番D1 d1_migrations の適用状況確認
2. migrationsの重複・旧schemaを、実適用状況と照合して安全に整理
3. Load Test 20件等の本番E2E再実行
4. status-26で残っていたAPI Pool旧SQL 654回の発生元を新しいStatus JSONで再確認
5. 通常Watchlist / Player Watchlistの本番E2E
6. 完成判定・最終本番確認


# 77. 2026-10-03 / Load TestのAPI同時実行をAPI Pool総数ベースへ統一

## 設計変更

これまでLoad Testは、

- 外側: 王国Job同時実行数
- 内側: 1 Jobあたりのランキング/API同時実行数

を別々に持っていた。

この構造では、外側Job数 × 内側API同時数でAPI Poolへの同時リース要求が膨らみ、実際の利用可能キー数を超えて `NO_API_POOL_KEY_AVAILABLE` が発生する余地があった。

今回、Load Testの同時実行制御を次の1本のルールへ統一した。

> **OWNERが指定するのは取得対象の王国数。API同時処理数は指定しない。実際のAPI Poolで現在AVAILABLEなキー数から通常利用保護1本を差し引いた値を、Load Test全体のAPI同時処理上限として自動利用する。**

## 実装

### 1. 通常WatchlistのAPI同時数計算をAPI Pool availabilityへ統一
- `src/index.js`
- `getWatchlistApiConcurrency()` が `api_pool_keys.status='AVAILABLE'` の単純COUNTではなく、`getApiPoolAvailability()` の実AVAILABLE数を利用するよう変更。
- Load Testからは `reserveApiKeys: 1` を渡せるようにし、AVAILABLE数 - 1 を実効API同時数として利用。
- 通常Watchlistは従来どおり最低1を維持。
- Load Testは保護枠のため、実効値が0の場合はAPI処理を開始せず待機する。

### 2. Load Testの王国Job並列を直列化
- `src/admin-kingdom-load-test.js`
- 王国Job同時実行数は常に1。
- 各王国のランキング取得・プレイヤー取得で、同じLoad Test API枠を使用。
- これにより「Job同時数 × Job内部API同時数」の二重拘束を廃止。
- 初期AVAILABLEキー数が13本なら、Load Test API枠は12本。
- 初期AVAILABLEキー数が5本なら、Load Test API枠は4本。
- 26ランキングという上限があるため、API同時処理数は最大26。

### 3. 通常利用保護中の待機
- Load TestがAPI枠を使おうとした時点で、AVAILABLEキーが保護枠しか残っていない場合は即FAILEDにせず `API_POOL_LOAD_TEST_CAPACITY_WAIT` として待機。
- 次の処理ループでAPI Pool availabilityを再確認する。
- 通常利用のために予約した1本をLoad Testが取り崩さない。

### 4. UIからJob同時実行数の手動指定を削除
- OWNER画面では「王国番号」「上位プレイヤー取得数」のみ指定。
- API同時処理数は「実際の利用可能キー数 − 通常利用保護1本」と明示。
- 画面上の進捗にも自動決定されたAPI同時処理数を表示。

### 5. Run metadataへAPI同時処理数を保存
- `migrations/0030_kingdom_load_test_api_concurrency.sql`
- `kingdom_load_test_runs.api_concurrency` を追加。
- `concurrency` は互換性のため残し、王国Job同時実行数=1として保存。
- `api_concurrency` がLoad Test開始時点の自動算出値。
- status API / reload復元時にも表示可能。

## コミット

- `e453829c55fdf60cb811e0e51c28c34f22be29f9` — Watchlist API concurrencyをPool availabilityベースへ変更
- `53f822cd0d0d1e793b7f289707627a2535afccce` — Load Test API concurrencyをPool総数ベースへ変更
- `35a89f66c3b095c5341d238815148c83b8f84852` — Load Test API concurrency metadata保存
- `793077431245a157e54656ad453f30c78484db2e` — Migration 0030追加

## 次回の本番確認

1. Migration 0030を本番D1へ適用。
2. OWNER負荷テスト画面で対象王国数だけ指定。
3. 開始時に「AVAILABLEキー数 - 1」がAPI同時処理数として表示されることを確認。
4. 実行中にAPI Poolのleased数が保護枠を除いて推移することを確認。
5. `NO_API_POOL_KEY_AVAILABLE` がLoad Test由来で発生しないことを確認。
6. 20王国以上で全対象が順番に完了し、取得データが通常Watchlistと同じ保存経路へ残ることを確認。
7. status JSON / Query Insightsで、旧「外側Job並列 × 内側API並列」の過剰リースが消えていることを確認。


# 78. 2026-10-03 / Load Testを「王国直列」からグローバルAPIセマフォ方式へ修正

## 重要: #77の直列化案を撤回

#77で一度「王国Jobを直列実行する」設計へ変更したが、これはユーザー意図と異なるため撤回。

ユーザーが求めているのは、

> 王国Jobを大量に並列で進めながら、Load Test全体で使用するAPIリクエスト数だけを「実際のAVAILABLE API Poolキー数 − 通常利用保護1本」に厳密に制御する方式。

である。

## 最終設計

### Global API Semaphore

Load Test開始時:

- AVAILABLE API Poolキー数を取得
- 通常利用保護として1本を確保
- apiConcurrency = availablePoolKeys - 1
- この値をLoad Test全体のAPI同時実行上限とする
- 26でグローバル上限を切らない
  - 26は1王国のランキングボード数
  - apiConcurrencyは全王国合計のAPI同時実行枠

例:

- Available 13 → Load Test API枠 12
- Available 5 → Load Test API枠 4
- Available 31 → Load Test API枠 30

### 王国Job

王国Jobは、

min(取得対象王国数, apiConcurrency)

件を同時に進める。

各王国は最大26件のランキングAPIリクエストを生成できるが、実際に外部APIへ飛ぶ瞬間はGlobal API Semaphoreを1枠取得する。

そのため、

- KID Aが5枠
- KID Bが3枠
- KID Cが2枠
- KID Dが2枠

のように、全王国でAPI枠を動的に共有できる。

1リクエストが完了した瞬間に枠を返却し、待機中の別王国/別リクエストへ即時再配布する。

### API Pool競合

Load Test側のAPI取得で NO_API_POOL_KEY_AVAILABLE が発生した場合は、最大20回まで500ms間隔で再試行する。

これにより、Load Test開始後に通常ユーザーが予約枠以外も一時的に使用した場合でも、一時的なPool競合を即失敗へ変換しない。

通常Watchlist側にはこのLoad Test用セマフォ/Retryを適用しない。

## 実装コミット

- 6838cfcbe2ab33e56e4f96e7cfff4b09af1d8642 — Load Test global API semaphore
- 6cff17613e83c3931643efbf69c7a889f87d85d6 — Watchlist pipeline API limiter integration
- 9a980188343742063fd32d64e571208a19fa49ed — semaphore wiring correction

## 変更後の確認ポイント

1. 王国Jobが直列ではなく複数同時進行すること。
2. API Poolの実際のAVAILABLE数から1本を通常利用保護として除外すること。
3. 全王国合計の外部APIリクエストがGlobal API枠を超えないこと。
4. API完了後、待機中の別リクエストへ即座に枠が再利用されること。
5. 通常ユーザーのWatchlist処理はLoad Testセマフォの影響を受けないこと。
6. NO_API_POOL_KEY_AVAILABLEの一時競合がRetryで吸収されること。
7. 取得・比較・D1/R2保存経路は通常Kingdom Watchlistと同一であること。
8. 実機で20王国以上を実行し、処理時間・Pool lease数・D1 Rows Read/Writeを比較すること。

## Cloudflare実行上の注意

Cloudflare Workersでは1 invocationあたりの同時open connectionに制約があり、初期レスポンス待ち中の接続は最大6本まで同時に待機し、それを超える接続はランタイム側でキューされる。したがってAPIセマフォの値が6を超えても、コード上の共有API枠を6へ人為的に制限しない。

実測では、MightPulse応答時間・API Pool lease取得・D1保存時間を含めて最適な実効値を確認する。

## 本番確認状況

この変更はGitHub mainへの実装まで。

本番Worker deploy / 本番E2Eは未確認。


# 79. 2026-10-03 / OWNER Load Test履歴表示とRun復元の分離

## 実装

OWNERの王国Watchlist実処理負荷テストについて、現在のRun表示と過去Run履歴を分離。

### 現在Run
- Load Test実行中は現在のrun_idをUI側へ保持。
- ページ移動後に戻ってきても、保持したrun_idで同一Runを復元。
- 実行していないページ初期表示では、過去の最新Runを現在進捗として表示しない。
- これにより、過去Runの「20/20」などが新規ページ表示へ混入する問題を防止。

### 過去Run履歴
- `/api/owner/kingdom-load-test/history` を追加。
- OWNER認証で過去最大50件を取得可能。UIは直近20件を表示。
- 既存の `kingdom_load_test_runs` を履歴の基礎とし、新規履歴テーブルは作らない。
- migration 0031で以下の集計値をRun単位で永続化:
  - success_count
  - failed_count
  - ranking_rows_saved
  - player_rows_saved
  - elapsed_ms
- UIには実施日時、対象王国数、成功/失敗、API同時処理数、Pool Available、Top N、保存rows、所要時間、結果状態を表示。
- `COMPLETED` かつ `failed_count > 0` のRunは「一部失敗」と表示。

## コミット
- 866e8dd44982573eddc785afe31d238db2cb437f — Run復元/Navigation対応
- ce71d3e1726eae5b9f75f71b7eb7d222419c83b6 — History API + Run summary persistence
- 7a6e9ecf670f4e269184982b2f24d95bb7ecf886 — migration 0031 history metrics
- 8d8125f0693ad1b3f5614d98e80495ce6b68abbb — History API route
- d9f2b52b38e7cef1f58483f4355da809bb1e49a9 — History UI
- 90faa54d00f0daa34c6e567cd4264e2bcdcd3d1c — partial failure label correction

## 確認事項
- 本番Worker deploy後にmigration 0031適用を確認。
- Load Test実行→別ページへ移動→Load Testページへ戻ることで同一Run復元を確認。
- 未実行状態でページを開いた場合、過去Runが現在進捗へ混入しないことを確認。
- 過去履歴に成功/失敗/一部失敗が正しく表示されることを確認。

# 80. 2026-10-03 / OWNER Load TestのAPI待機状況可視化

## 実装目的

Load Test実行中に「進捗が止まっている」のか「API枠待ちで正常に待機している」のかをOWNER画面から判別できるようにした。

## 実装内容

### API Limiterメトリクス
- `src/admin-kingdom-load-test.js` のGlobal API Limiterへ以下を追加。
- API使用中数 / Limiter待機数 / Limiter待ち発生回数 / Limiter待ち累計時間 / 最大Limiter待ち時間
- 実API Pool枯渇待ち数 / 実API Pool枯渇待ち発生回数 / 実API Pool枯渇待ち累計時間
- `src/index.js` の `NO_API_POOL_KEY_AVAILABLE` RetryでPool待機開始/終了を記録。
- 既存の最大20回・500ms間隔Retry仕様は維持。

### Run metadata
`kingdom_load_test_runs` に以下のメトリクス列を追加する仕組みを実装。
- `api_active_count`
- `api_waiting_count`
- `api_pool_waiting_count`
- `api_wait_events`
- `api_pool_wait_events`
- `api_wait_ms`
- `api_pool_wait_ms`
- `last_activity_at`

既存DBへの互換性を考慮し、Load Test状態スキーマ初期化時に不足列を追加する方式。メトリクス更新は約3秒間隔に抑え、D1への細かい進捗書き込みを避ける。

### Status API / History API
- `/api/owner/kingdom-load-test/status` で現在のAPI使用・待機状況を取得可能。
- `/api/owner/kingdom-load-test/history` でも各Runの待機統計を確認可能。
- Run終了時には最終メトリクスを強制保存。

### OWNER UI
実行中の全体進捗に `API使用 X / Y`、`待ち X`、`Pool待ち X`、`累計待機 X秒/分`、通常利用保護1本を表示。
過去Run履歴にはAPI待機時間、待ち発生回数、Pool待ち発生回数を表示。

## 重要な意味

- `待ち > 0` はGlobal API Semaphoreの枠が埋まっており、次のリクエストが順番待ちしている状態。
- `Pool待ち > 0` はSemaphore枠を取得した後の実API Pool lease取得で一時的に `NO_API_POOL_KEY_AVAILABLE` が発生し、500ms Retry待機している状態。
- したがって、画面上で進捗数が一時停止していても、API使用中/待機数が動いていれば「処理停止」ではなくAPI枠待ちと判断できる。
- `api_wait_ms` は各待機リクエストの待機時間を累計した値であり、全体経過時間そのものではない。

## コミット
- `3705c0d7ec93546ac5c7f09560228a186ffcf9bb` — OWNER Load Test UI/API wait metrics
- `9ed293deea4b635af414e9454b3aaf61bf0c4a52` — API Pool wait retry metrics

## 本番確認

現時点ではGitHub mainへの実装・コード確認まで。Cloudflare本番WorkerへのDeploy完了、および実機Load Testで実際の待機数が表示されることは未確認。

## 次回E2E確認

1. 本番Deploy後、OWNERでLoad Test画面を開く。
2. 20王国程度で実行。
3. 実行中に `API使用 / 待ち / Pool待ち / 累計待機` が表示されることを確認。
4. API枠が埋まる条件で `待ち` が0より大きくなることを確認。
5. 通常利用側のPool使用が重なる条件で `Pool待ち` が発生する場合、その後自動復帰することを確認。
6. ページリロード後もRun復元時に待機メトリクスが表示されることを確認。
7. 完了後、履歴に待機時間・待ち発生回数・Pool待ち回数が残ることを確認。
8. D1 Query Insightsで、メトリクス保存による過剰なRows Read/Writeが発生していないことを確認。

### #80 追記 / D1 migration正式化
- 実行時 `ALTER TABLE` は撤去し、正式なD1 migrationへ変更。
- `migrations/0032_kingdom_load_test_api_wait_metrics.sql` を追加。
- migration commit: `5d305e6b6c7e03fe57edcb16146ae092315d5a49`。
- `src/admin-kingdom-load-test.js` の実行時スキーマ変更処理を撤去。
- migration 0032を本番D1へ適用してから本番Worker/E2E確認を行うこと。
- Cloudflare公式仕様上、D1 migrationは `wrangler d1 migrations apply <DATABASE> --remote` で未適用分を適用する運用。


# 81. 2026-10-03 / OWNER Load Test待機時間の最小・最大・分布・CSV Export

## 目的
#80で累計待機時間と待ち発生回数を可視化したが、累計値だけでは「実際に1リクエストがどの程度待ったか」を判断できないため、待機時間の最小・最大・分布をRun単位で保存・表示・Exportできるようにした。

## 実装
- Global API Limiterで待機リクエストごとの待機時間を計測。
- Run単位で以下を保持:
  - api_wait_min_ms
  - api_wait_max_ms
  - api_wait_buckets_json
- 分布バケット:
  - 0〜5秒
  - 5〜10秒
  - 10〜20秒
  - 20〜30秒
  - 30〜60秒
  - 60秒以上
- Status API / Progress streamへ最小・最大・分布を反映。
- OWNER画面の進捗・履歴に最小/最大待機時間を表示。
- 過去Runごとに「CSVエクスポート」ボタンを追加。
- /api/owner/kingdom-load-test/export?run_id=... はOWNER認証下でRun集計と待機分布をCSVとして出力。
- CSVにはRun条件、成功/失敗、保存rows、所要時間、待ち発生回数、Pool待ち、累計待機、最小/最大、各分布バケットを含める。

## コミット
- 5f75f399086f65b21854947b721fd373ddcad031 — Load Test待機統計・CSV Export
- fc7ab72aad02efe32de89949f6896793faec316d — Export route
- 641e4236a31291235b610afb758605d6c25a823a — Status/Progressへ最小・最大・分布を反映
- 633998bd6b35e9ffd1fb5480ae450ba7be569390 — migration 0033

## E2E確認
次回本番Deploy後、Load Testを実行して以下を確認:
1. 実行中に最小/最大待機時間が更新される。
2. 完了後、履歴のCSVエクスポートからRun集計を取得できる。
3. CSVの分布合計が待ち発生回数と一致する。
4. 12並列などAPI枠を使い切る条件で分布が実測できる。
5. D1 Rows Read/Write増加が許容範囲であることを確認。


## #82 — Load Test APIクエスト進捗・全ページリロード・System Statusテーマ修正（2026-10-03）

- OWNER「王国Watchlist実処理負荷テスト」の進捗表示を王国完了数ではなく、実処理クエスト単位へ変更。
  - 1王国 = ランキング26クエスト + 上位プレイヤー取得クエスト。
  - 実際の `board_index` / `player_cursor` を合算して `quest_completed / quest_total / quest_percent` を算出。
  - ランキング処理中に26ボード中4件だけ完了、のような途中状態も進捗率へ反映。
  - プレイヤー人数が確定した時点で、その王国の総クエスト数を実人数に補正。
  - 王国完了数は補助情報として表示。
- Load Test heartbeat は2秒間隔のライブUI更新専用とし、heartbeatごとの強制D1保存を削除。D1メトリクス保存は既存のスロットル付きmetricsTimerに集約し、不要なD1 write増加を避ける。
- Load Test status API は既存の `kingdom_watchlist_jobs` 読み取り結果からクエスト進捗を算出し、ページ再読み込み後も `quest_completed / quest_total / quest_percent` を復元。
- グローバルテーマUIを調整。
  - 既存のページ固有 `#reloadPage` がある場合はテーマボタンを下へ移動し、再読み込みボタンとの重なりを防止。
  - ページ固有の再読み込みボタンがないページにはグローバル「↻」再読み込みボタンを自動追加。
  - これにより手動リロードを共通UIとして全ページで利用可能にする。
- `/status` システム状況ページについて、既存の固定ライト色CSSをグローバルテーマで上書きし、ライト/ダーク双方で背景・カード・行・監視切替・診断表示が切り替わるよう修正。
- 関連コミット:
  - `b3ddfa5d16459aca3aea9fabe5c0b57a63fa5204` — APIクエスト進捗表示
  - `ba3dc676c76bf1b43304d473a2f0bcbb843c0bfc` — status APIのクエスト進捗復元
  - `cc098d7f36588d6a0f4df5e7c363fca417e0805c` — 完了時の進捗上書き防止
  - `3f2726df4b38e3f38ec8c5603c66083e4e49f3a3` — 初期クエスト進捗
  - `be65fe444a5dd4177a006801c82178746da1c3dc` — System Statusテーマ＋グローバルリロード
- 未実機確認: 本番Workerへの今回変更のデプロイ後、iPhoneで「APIクエスト X / Y (%)」表示、再読み込みボタンとテーマボタンの非重複、`/status` のライト/ダーク切替を確認すること。

- 追加修正: `6d6fff3e31e32b87e0bcbe5326c16d1c03bc29b9` — ランキングフェーズ中は仮のTOP Nを維持し、プレイヤー人数確定後のみ総クエスト数を実人数へ補正するよう修正。


---

## #83 王国ウォッチリスト：未解放ランキングの空レスポンスをスキップ（2026-10-04）

### 実機テスター発見
- 王国2471のウォッチリスト更新中、RANKING_ENTRIES_EMPTY:forest_of_life が発生。
- テスター確認により、対象王国では該当コンテンツ（ペット関連進行を含む）が未解放で、そのランキング自体が存在しないケースと判明。
- これはAPI障害としてジョブ全体を停止させるべきケースではなく、未解放ランキングをスキップして次のランキングへ進める必要がある。

### 実装
- src/index.js の王国ウォッチリストランキング取得処理を修正。
- ランキングAPIが正常応答（2xx）したものの抽出結果が空の場合：
  - RANKING_ENTRIES_EMPTY でジョブを停止しない。
  - RANKING_ENTRIES_EMPTY_SKIPPED の WARNING 診断イベントを記録。
  - skipped: true / reason: EMPTY_RANKING_RESPONSE をmetadataへ保存。
  - 既存の kingdom_ranking_current は削除・変更せず、そのランキングをスキップ。
  - 次のランキング処理へ継続。
- 実装コミット：e743cd0c601bc53e7fd2098c1cdf17061d013bbd

### 注意
- 空レスポンスを「未解放の可能性」として扱うため、診断イベントは WARNING のまま残す。
- HTTPエラーやAPI Poolエラー等、空レスポンス以外の失敗は従来どおりジョブ失敗として扱う。
- 実機で王国2471を再更新し、forest_of_life をスキップして crystal_cave 以降へ継続できることを確認する。


---

## #84 API Pool：現在のリース元を一覧上部で確認（2026-10-04）

- API Pool管理画面の「登録済みキー」までスクロールしないとリース状態を確認しづらかったため、画面上部に「現在リース中のキー」サマリーを追加。
- リース中キーの本数、残り秒数、用途、対象、Pool、Fingerprint先頭を一覧上部で確認可能。
- `lease_job_id` を `kingdom_watchlist_jobs` / `kingdom_watchlists` / `users` と照合し、通常の王国Watchlistについて「誰が・どの王国で・何の処理をしているか」を表示。
- OWNER負荷テストの `run_id` と一致する場合は「OWNER負荷テスト」として表示。
- Health Check等でユーザーJobに紐づかないリースは「システム処理 / 処理元不明」等として表示。
- 実装コミット：`e67c7749924b999a3156c48d5d4f94bbcb3eb1ad`

---

## #85 2026-10-04 / EagleEye次期全体構想・Data Collection Engine・Safety Gate・Kingdom Discovery 実装計画

## 85-1. この計画の目的

今後のEagleEyeは「ユーザーがWatchlistへ登録した王国だけを取得するシステム」から、**KingShot世界全体を継続的に観測・蓄積・分析するデータプラットフォーム**へ拡張する。

最終的な思想:

> MightPulse本家を単純にコピーするのではなく、MightPulseが公開するデータを観測基盤として利用し、EagleEye自身が現在・過去・変化・比較・監視・分析を蓄積する。

Watchlistは「その対象だけが存在する」という意味ではなく、**通常収集より高い優先度で継続監視する対象**という位置付けへ変更する。

---

## 85-2. 現在mainを確認したうえでの現状認識

2026-10-04時点のmain最新コミット系列を確認。

直近:
- e67c7749924b999a3156c48d5d4f94bbcb3eb1ad — API Poolの現在lease元を管理画面上部へ表示
- 449bd4040830148991a2bf0f2099fd16349c3c81 — 上記をhandoffへ記録
- ac7f30729960f59b6f85db6d9ea4903490bf9b7e — Load Test heartbeatの改行構文修正
- de0694c37b024cdb9f5ce37dd0dc79aafd64462e — Load Test routeの改行構文修正
- 9a6c4c06c3af65b257bd975a0ea340d1387a623a — 正常2xxの空ランキングだけをskipするよう補正
- e743cd0c601bc53e7fd2098c1cdf17061d013bbd — 未解放ランキングの空レスポンスskip

主要実装を横断確認した結果、現状は以下を次期設計の土台として再利用する。

### 既存の再利用対象

1. API Pool
   - key lease
   - pool availability
   - remaining minute/day
   - cooldown / error / disabled / revoked
   - lease owner表示
   - Watchlist / Load Testの共通利用基盤

2. Kingdom Watchlist
   - Kingdom単位の取得Job
   - ranking board取得
   - player detail取得
   - D1 current materialization
   - R2 history
   - change events
   - job/lock/status

3. OWNER Load Test
   - Run履歴
   - Cancel
   - status復元
   - progress heartbeat
   - API global semaphore / limiter
   - API wait metrics
   - Pool wait metrics
   - wait min/max/distribution
   - CSV export
   - OWNER専用実行

4. Current Ranking
   - kingdom_ranking_current にKID / board / rank / governor_id / nick_name / alliance情報等がある。
   - Player Indexの初期版は新規player_directoryを作らず、kingdom_ranking_currentを軽量Indexとして再利用する。

5. Detailed Player Cache
   - players
   - api_observations
   - 既存のPlayer detail取得経路

6. History
   - D1 = current / operational state
   - R2 = canonical history/archive
   - HISTORY_STORAGE_MODE=R2_ONLY を維持
   - R2 failure時はHistory Emergency Bufferへ退避
   - ranking_snapshots の広範囲readは禁止

7. System Observability
   - /status
   - System JSON
   - Query Insights
   - diagnostics
   - system log
   - API Pool status
   - Load Test status/history

---

## 85-3. 重要な設計変更: Watchlist中心からCatalog中心へ

現在:

~~~
User
 ↓
Kingdom Watchlist
 ↓
取得
 ↓
Data accumulation
~~~

次期:

~~~
                    EagleEye
                       │
                Kingdom Catalog
                       │
        ┌──────────────┼──────────────┐
        ↓              ↓              ↓
     Kingdom        Alliance        Player
      Seeder         Roller          Roller
        │              │              │
        └──────────────┼──────────────┘
                       ↓
                Data Collection
                       ↓
              Current / History / Events
                       ↓
       ┌───────────────┼───────────────┐
       ↓               ↓               ↓
   Watchlist          Search          Compare
   優先監視            横断検索          比較分析
~~~

**Watchlist外の王国・Alliance・Playerも、EagleEyeが認識できる状態を目指す。**

---

## 85-4. Kingdom Catalog

### 目的

「最大KIDはいくつか」ではなく、**MightPulseの王国一覧を基準としてEagleEyeが認識している王国集合を管理する。**

Catalog候補情報:
- kid
- kingdom name
- banner
- opened_on
- age_days
- player_count
- active_players
- active_7d
- active_30d
- alliance_count
- power
- avg_power
- health
- power_gain_7d
- その他、公式公開APIで取得可能なKingdom基本情報

### 新王国検知

王国一覧を定期同期し、前回Catalogとの差分から新規王国を検知する。

**最大KID + 1方式は禁止。**

例:

~~~
前回Catalog
2471まで認識

今回MightPulse一覧
2471
2472
2474

→ 2472 / 2474 をNEWとして検知
→ 2473の不存在を「消滅」とは推測しない
~~~

Catalog候補状態:
- first_seen_at
- last_seen_at
- status
- source
- opened_on

新規発見時:
~~~
KINGDOM_DISCOVERED
 ↓
Catalog登録
 ↓
Seeder対象化
 ↓
リソースに余裕があれば詳細収集
~~~

Discoveryと詳細収集は分離する。

---

## 85-5. Kingdom Discoveryの定期実行

新王国は日々増えるため、Catalog Syncは定期処理として設計する。

初期:
- 低コストな王国一覧取得
- 前回Catalogとの差分
- 新規KIDだけ登録
- KINGDOM_DISCOVERED event

その後:
- Kingdom Seederへ渡す
- Ranking / Player / Alliance収集はData Collection Engine側のSafety Gateを通す

重要:
**「新王国を発見すること」と「新王国の全データを一気に取得すること」を同じ処理にしない。**

新王国100件発見時でも、Discovery自体を軽量に完了できる構造にする。

---

## 85-6. Data Collection Engine

今のOWNER Load Testを単独の「テスト専用処理」として増築するのではなく、既存の取得処理を共通Engineへ整理する。

~~~
                 Data Collection Engine
                         │
          ┌──────────────┼──────────────┐
          ↓              ↓              ↓
       Normal          Forced         Load Test
       Roller          Roller          Roller
~~~

### Normal Roller
- Background収集
- Safety Gateに従う
- リソースに余裕がある場合のみ進める
- Watchlistより低優先

### Forced Roller
- OWNERが対象範囲を指定
- 即時収集を要求
- Safety Gateを無視しない
- リソース不足時は待機/縮退/停止

### Load Test
- **本番と同じRoller/Collection処理を使う**
- 大量対象・高並列条件で実行
- Safety Gateを通す
- 一般ユーザーを犠牲にして100%まで使うことは禁止
- 実際のRollerがどこまで安全に動けるかを測る

したがって:

> **Load Test = Rollerの強制・高負荷実行モード**

と定義する。

「負荷テスト専用の別取得ロジック」を新規に作らない。

---

## 85-7. 優先順位

リソース逼迫時の優先順位:

~~~
P0  一般ユーザーの現在操作
P1  Watchlist
P2  Normal Roller
P3  Forced Roller
P4  Load Test
~~~

上位を守るため、下位処理から縮退・停止する。

特にLoad Testが通常WatchlistのAPI Poolを奪い取る設計は禁止。

---

## 85-8. Safety Gate

今回の拡張で最重要の横断コンポーネント。

~~~
                  Data Collection
                         │
                   Safety Gate
                         │
       ┌─────────────────┼─────────────────┐
       ↓                 ↓                 ↓
   Cloudflare         MightPulse       EagleEye
   Resource            API Limit       Service Reserve
~~~

### Cloudflare側

最低限監視:
- D1 Rows Read
- D1 Rows Written
- D1 Storage
- Workers Requests
- Workers CPU
- R2 Storage
- R2 Class A
- R2 Class B
- 必要に応じその他リソース

現在のPAID_5USD基準:
- D1 Read 25B/month
- D1 Write 50M/month
- D1 Storage 5GB
- Workers Requests 10M/month
- Workers CPU 30M CPU-ms/month
- R2 Storage 10GB
- R2 Class A 1M/month
- R2 Class B 10M/month

EagleEye側90%安全ライン:
- D1 Read 22.5B
- D1 Write 45M
- D1 Storage 4.5GB
- Workers Requests 9M
- Workers CPU 27M CPU-ms
- R2 Storage 9GB
- R2 Class A 900k
- R2 Class B 9M

**100%到達を停止条件として利用しない。**
100%は「絶対に到達させない」境界。

### Paid / Free

~~~
PLAN PROFILE
 ├─ FREE
 └─ PAID
~~~

Paid契約中はPaid上限を基準に安全制御。

Freeへ戻った場合はFree制限へ自動的にSafety Profileを切り替え、Paid時のローラー設定をそのまま使用しない。

---

## 85-9. 一般ユーザー保護Reserve

正式サービス前なので、過去の一般ユーザー利用実績からReserveを算出することはできない。

初期版では**固定Reserve**を明示的に持つ。

~~~
Cloudflare actual limit
 ↓
EagleEye safety limit
 ↓
General Service Reserve
 ↓
Background available budget
~~~

一般ユーザーの実績が蓄積された後に:

~~~
Fixed Reserve
 ↓
Measured Reserve
 ↓
Dynamic / predictive Reserve
~~~

へ進化させる。

---

## 85-10. MightPulse APIキー安全装置

MightPulse公式公開API仕様として確認済みの基準:
- 60 requests/minute/key
- 5,000 requests/day/key

したがってCloudflareだけを見て実行量を決めてはいけない。

API Pool全体だけでなく**各APIキー単位**で:
- remainingMinute
- remainingDay
- cooldown
- lease
- status
- reserved quota
を管理する。

例:

~~~
Key A 4,900 / 5,000
Key B 4,800 / 5,000
Key C 1,000 / 5,000

Pool全体では余裕ありに見えても
A/Bはほぼ使用不可
~~~

Rollerはキーごとの安全残量を考慮する。

---

## 85-11. 予定消費量の事前判定

Roller / Forced Roller / Load Test開始前に、可能な範囲で予定取得量を算出する。

例:

~~~
対象王国数
× ranking requests
+ Player requests
+ Alliance requests
+ feature requests
~~~

そして:

~~~
current usage
+
reserved usage
+
planned usage
+
emergency buffer
~~~

がSafety Limitを超えるなら、**開始しない**。

実行中も実測値を監視し、予測を超えた場合は縮退・停止する。

---

## 85-12. Safety State

Safety GateはON/OFFだけではなく段階制御する。

初期案:

| 状態 | 動作 |
|---|---|
| NORMAL | 通常運転 |
| CAUTION | Background並列数/処理量を縮小 |
| WARNING | Background Roller停止候補 |
| CRITICAL | Forced Roller / Load Test停止 |
| HARD_STOP | Background処理停止、一般サービス保護 |

**100%ではなく、EagleEye Safety Limit到達前にBackgroundを止める。**

状態遷移はCloudflare / MightPulse / Service Reserveのうち最も危険な側に合わせる。

---

## 85-13. 予測と実測の補正

正式サービス前は消費モデルが未知なので、最初から完璧な予測は要求しない。

~~~
予測
 ↓
実行
 ↓
実測
 ↓
予測との差分
 ↓
次回予測補正
~~~

Run単位で少なくとも:
- API request count
- D1 rows read/write
- R2 operations
- Workers requests
- elapsed time
- API wait
- Pool wait
を蓄積し、後のRoller容量計算へ利用する。

---

## 85-14. Player Roller

初期版では新規player_directoryを作らない。

kingdom_ranking_current のpersonal_power等のPLAYER行を軽量Indexとして利用する。

流れ:

~~~
Kingdom
 ↓
personal_power ranking
 ↓
Top N / 対象Player
 ↓
Player detail
 ↓
players / api_observations
 ↓
R2 history / change events
~~~

Top Nだけを詳細取得する現在のWatchlist処理を、Rollerの安全な実装へ段階的に拡張する。

---

## 85-15. Alliance Catalog / Alliance Roller

MightPulse公式公開APIで確認できる範囲:
- Alliance info
- roster
- power
- count
- leader
- rank
- roster member information

ただし、**公式公開API仕様上「王国内の全Alliance一覧」を直接返すAPIは確認できていない。**

したがって初期方針:
1. Ranking / Player dataからAllianceを発見
2. Alliance Catalogへ登録
3. kid + tag等で詳細取得
4. roster取得
5. history / changesを蓄積

非公開のMightPulse Web内部APIに依存しない。

---

## 85-16. MightPulse Feature Parity Matrix

Phase 0として、本家機能を網羅的に棚卸しする。

最低限:
- Kingdom list
- Kingdom detail
- Kingdom rankings
- Player search
- Player detail
- Alliance detail
- Alliance roster
- KvK
- Momentum
- Castle Battle History
- Appointments / Ministers / Offenders
- Events
- Player Record
- その他本家Webで確認できる機能

各機能について必ず:
- MightPulse Webに存在するか
- 公式公開APIで取得可能か
- EagleEyeに実装済みか
- partialか
- missingか
- historyが必要か
- Safety/Cost impact
を記録する。

**Web UIに存在することと、公式公開APIとして利用可能であることを混同しない。**

---

## 85-17. System Status / System JSON Observabilityは必須要件

今回以降、新機能は実装だけで完了扱いにしない。

### Definition of Done

~~~
Feature implementation
 ↓
DB/API/Worker
 ↓
System Status
 ↓
System JSON
 ↓
正常/異常/停止状態
 ↓
本番E2E
~~~

### Kingdom Catalog

System Status / JSONで最低限:
- known kingdoms
- last sync
- last success
- new kingdoms found
- sync errors
- next run
- status

### Roller

- state
- current run
- target
- processed
- success
- failed
- skipped
- last target
- API usage
- D1/R2 usage
- stop reason

### Safety Gate

- current state
- Cloudflare resource state
- MightPulse pool state
- key-level quota state
- Service Reserve
- available background budget
- blocked reason
- resume condition

### Load Test

既存の:
- Run
- progress
- API concurrency
- API wait
- Pool wait
- min/max/distribution
- history
- CSV
に加え、将来的に**どのRoller/collection modeを実行したか**を明示する。

---

## 85-18. System JSONの「なぜ止まったか」を必須化

単に:

~~~
roller.status = STOPPED
~~~

だけでは不十分。

例えば:

~~~json
{
  "roller": {
    "status": "PAUSED",
    "reason": "MIGHTPULSE_DAILY_QUOTA_RESERVE",
    "blocked_by": "API_KEY_POOL",
    "resume_condition": "AVAILABLE_DAILY_QUOTA >= 500"
  }
}
~~~

のように、**原因・ブロッカー・再開条件**を機械可読にする。

同じ原則をSafety Gate / Catalog Sync / Seeder / Roller / Load Testへ適用する。

---

## 85-19. D1 / R2原則

今回のデータ量増加を前提として、既存原則を維持・強化する。

### D1
- current / operational state
- 軽量Index
- job state
- event metadata
- Safety / status state

### R2
- canonical history
- 大量履歴
- archive
- 将来Google Driveへのarchive source

### 禁止
- ranking_snapshots の広範囲read
- 「全件SELECTしてJSで絞る」方式
- Roller追加を理由にD1 historyへ大量fallbackする設計

Roller実装前に、各新規クエリのRows Read / Rows Writtenを必ず見積もる。

---

## 85-20. 実装フェーズ

### Phase 0 — MightPulse Feature Matrix
本家機能と公式API対応可否を棚卸し。

### Phase 1 — Resource Safety Architecture
- Safety Gate
- Paid / Free profile
- Cloudflare safety
- MightPulse key quota
- Service Reserve
- planned consumption
- hard stop / degradation
- System Status / JSON

**このPhaseを先に作る。**

### Phase 2 — Data Collection Engine
- 現在Watchlist取得経路を共通Engineへ抽象化
- Normal / Forced / Load Test mode
- 既存Load TestのRun/Cancel/Progress/Wait Metricsを再利用
- Watchlist優先制御

### Phase 3 — Kingdom Catalog / Discovery
- Kingdom一覧同期
- Catalog
- first_seen / last_seen
- NEW detection
- KINGDOM_DISCOVERED event
- System Status / JSON

### Phase 4 — Kingdom Seeder
- Watchlist外王国の基本情報取得
- Safety Gate経由
- bounded execution
- stop/resume
- observability

### Phase 5 — Alliance Catalog / Roller
- Alliance discovery
- info
- roster
- history / changes
- observability

### Phase 6 — Player Roller
- ranking currentをIndexとして利用
- Player detail enrichment
- API Pool / quota
- R2 history
- observability

### Phase 7 — Feature Parity
公開APIで安全に取得できる範囲から:
- KvK
- Momentum
- Castle Battle History
- Appointments
- Events
- Player Record
- その他

### Phase 8 — EagleEye独自分析
- historical comparison
- change detection
- cross-kingdom analytics
- cross-player analytics
- cross-alliance analytics
- prediction / anomaly detection
- EagleEye独自ランキング

---

## 85-21. 実装前に解消する既存コード上の注意点

今回のmain横断確認で、次期Engine化前に確認・整理すべき事項。

### A. Load Test schemaのmigration化
現在mainのsrc/admin-kingdom-load-test.jsには、wait distribution列についてruntime ALTER TABLEを行う互換コードが残っている一方、正式migration 0033も存在する。

対象:
- api_wait_min_ms
- api_wait_max_ms
- api_wait_buckets_json

次期Engine化では:
- 正式migrationを正本
- runtime DDLは原則撤去
- 本番migration適用状態を確認

### B. 既存Load Testの定数/セマフォ整理
MAX_API_CONCURRENCY=26等、旧Load Test由来の制御値とGlobal API Semaphoreの責務を整理する。

**26は「1王国のランキングboard数」と「全体API concurrency」を混同しない。**

### C. API Pool lease / quota
現在のlease / availability / remainingMinute / remainingDayをSafety Gateへ正式に接続する前に、Pool選択条件と状態遷移を再確認する。

### D. Status / System JSONのfeature分類
src/cloudflare-analytics.jsのQuery Insights分類は、今後追加するCatalog / Seeder / Roller / Safety Gateを機械的に追跡できるよう拡張する。

### E. ranking_snapshots
既存のtarget_id限定readは存在するため、次期Roller追加時に「広範囲readへ逆戻りしない」ことをコードレビューで確認する。

---

## 85-22. 開発時の絶対ルール

1. **本番未確認を本番確認済みと言わない。**
2. 「コード実装済み / main反映済み / deploy済み / 本番E2E済み」を分離する。
3. 新機能は必ずSystem Status + System JSONへ観測点を追加する。
4. 新機能は正常 / WARNING / FAILED / PAUSED / STOPPED等の状態を観測可能にする。
5. 停止理由と再開条件を機械可読にする。
6. D1 Rows Read / Writtenを最優先で管理する。
7. ranking_snapshotsの広範囲readを復活させない。
8. R2_ONLYを維持する。
9. MightPulseの1キーminute/day quotaをSafety Gateに含める。
10. Cloudflare 100%を目指さない。
11. 一般ユーザー保護Reserveを確保する。
12. Load TestでもSafety Gateを無視しない。
13. OWNER権限でも安全装置を突破できる設計にしない。
14. Watchlist > Normal Roller > Forced Roller > Load Testの優先順位を維持する。
15. 非公開MightPulse Web APIを公式APIと同一視しない。
16. 新しいデータ収集処理を追加する前に、既存のCollection / API Pool / D1 / R2経路を再利用できないか確認する。
17. 新しいDBテーブルは「本当に既存テーブルで表現できないか」を先に確認する。
18. API Pool / Cloudflare / R2 / D1の秘密情報をUI・JSON・handoffへ出さない。

---

## 85-23. 次の実装開始順

次スレッドでは、いきなりPlayer Rollerや全王国Seederを書き始めない。

**順番を固定する。**

1. Phase 0: MightPulse Feature Matrix
2. 現行API Pool / Load Test / Cloudflare Monitoringのコード詳細監査
3. Phase 1: Safety Gate設計
4. System Status / System JSONの観測スキーマ設計
5. Phase 2: Data Collection Engine抽象化
6. Phase 3: Kingdom Catalog / Discovery
7. 以降Seeder → Alliance → Player → Feature Parity → Analytics

### 最初の実装レビューで必ず確認するもの

- src/index.js
- src/admin-kingdom-load-test.js
- src/api-pool.js
- src/cloudflare-analytics.js
- src/ranking-store.js
- src/status-ops.js
- src/system-log.js
- src/diagnostics.js
- src/mightpulse.js
- migrations/
- wrangler.jsonc

### 重要

この #85 は**実装計画であり、実装完了を意味しない。**

本セクションに記載した:
- Kingdom Catalog
- Kingdom Discovery
- Data Collection Engine
- Safety Gate
- Normal/Forced/Load Test Roller
- Alliance Roller
- Player Roller
- MightPulse Feature Parity
- 新しいSystem Status / JSON観測項目

は、**この時点では計画段階**として扱う。

---

## 85-24. この計画の成功条件

最終的に以下を満たすこと。

> **EagleEyeがWatchlistに依存せずKingShot世界を認識し、新しく生まれた王国を自動発見し、リソースに余裕がある範囲でKingdom → Alliance → Playerを継続的にRoller収集し、その処理自体をLoad Testとして強制実行できる。**

同時に、

> **Cloudflare / MightPulse API / 一般ユーザーサービスの3方向をSafety Gateで保護し、PaidでもFreeでも設定された安全枠を超えない。**

そして、

> **追加されたすべての機能について、System StatusとSystem JSONだけで「今動いているか」「何件処理したか」「何が止めているか」「いつ再開できるか」を確認できる。**

これをEagleEye次期アーキテクチャの完成条件とする。

---
# 86. 2026-10-04 現行main全体監査・次期実装計画確定版

2026-10-04時点のmainを再確認。本セクションを今後の実装計画の確定補足とする。

現行main HEAD:
- 6674c353cce86653a7752e53a83ecbd9e39932ab
- docs: add EagleEye next architecture implementation plan

## 86-1. 現行mainで確認した再利用基盤

### Kingdom / Ranking
既存:
- kingdom_ranking_current
- kingdom_ranking_board_state
- ranking-store.js
- ranking-catalog.js
- 26 ranking board定義
- Current RankingのQuery Insights分類

方針:
- kingdom_ranking_currentを軽量Current/Indexとして利用。
- Player Rollerの入口としてpersonal_power等のPLAYER行を利用。
- ranking_snapshotsは履歴用途に限定。
- ranking_snapshotsの広範囲readは絶対に復活させない。

### API Pool
src/api-pool.jsに既存:
- SYSTEM_GENERAL / SYSTEM_WATCHLIST / USER_CONTRIBUTED
- atomic lease
- leased_until / cooldown
- remaining_minute / remaining_day
- quota_per_minute / quota_per_day
- lease owner / purpose / target
- success / failure
- pool availability
- expiry release

不足:
- Safety Gateとの統合
- 開始前planned consumption判定
- Cloudflare/API/Reserve横断budget
- Normal / Forced / Load Testの優先制御
- key-level quotaを含む統合停止理由

### Watchlist Job
既存:
- kingdom_watchlist_jobs
- kingdom_watchlist_locks
- ranking → player処理
- board cursor / player cursor
- cancellation
- progress / error state

方針:
- 既存Watchlist processorをData Collection Engineへ抽象化して再利用。
- Watchlist処理をコピーしてSeeder/Rollerを別実装しない。

### OWNER Load Test
src/admin-kingdom-load-test.jsに既存:
- Watchlist実処理ベースの負荷テスト
- job concurrency
- local API concurrency limiter
- API wait / API Pool wait
- wait distribution
- Run history
- Cancel
- Progress / heartbeat / Progress recovery
- CSV export
- System Log / Service Usage

重要:
- MAX_API_CONCURRENCY=26はLoad Test内部のlocal limiter。
- EagleEye全体のGlobal Semaphoreではない。
- 26を全体API concurrencyとして再利用しない。
- 将来はGlobal Collection Semaphoreを新設し、Load Testもそこを通す。
- Load Test専用Crawlerは作らない。

### System Log / Diagnostics / Monitoring
既存:
- src/system-log.js
- src/diagnostics.js
- src/status-ops.js
- src/cloudflare-analytics.js
- SQL単位Query Insights
- Current Ranking等の分類
- Load Test / API Pool / MightPulse event
- Cloudflare D1/R2/Workers monitoring

新機能のobservabilityは既存System Log / Diagnostics / Status JSONへ統合する。

## 86-2. 現行mainにまだ存在しないもの

以下は専用実装がなく、現時点では計画段階。

- Kingdom Catalog
- Kingdom Discovery / Catalog Sync
- Kingdom Seeder
- Alliance Catalog
- Alliance Roller
- Player Roller
- Data Collection Engine
- Normal Roller
- Forced Roller
- Global Collection Semaphore
- Safety Gate
- Cloudflare/API/Reserve統合budget
- Planned Consumption Calculator
- Background Budget
- Dynamic/Measured Reserve
- Catalog/Seeder/Roller用System Status / System JSON
- MightPulse Feature Parity Matrix

src/にはcatalog / roller / collection / safety専用moduleはまだ存在しない。

## 86-3. DB / Storage方針

新規tableは、既存tableで表現できないことを確認してから追加する。

優先再利用:
- kingdom_ranking_current
- kingdom_ranking_board_state
- kingdom_watchlist_jobs
- kingdom_watchlist_locks
- api_pool_keys
- api_pool_usage
- system_event_log
- diagnostic_events
- kingdom_load_test_runs

Storage:
- current / operational state → D1
- large history / archive → R2
- HISTORY_STORAGE_MODE=R2_ONLYを維持

## 86-4. 次期アーキテクチャ

~~~text
MightPulse API
      ↓
   API Pool
      ↓
 Safety Gate
      ↓
Global Collection Semaphore
      ↓
Data Collection Engine
      ↓
Watchlist / Normal / Forced / Load Test
      ↓
Kingdom Catalog / Alliance Catalog / Player Index
      ↓
D1 Current
      ↓
R2 History / Archive

Observability:
System Log + Diagnostics + System Status + System JSON
~~~

## 86-5. 実装フェーズ確定

### Phase 0 — MightPulse Feature Matrix
本家Web機能と公式公開API対応可否を棚卸し。

記録:
- Web存在
- 公式公開API可否
- EagleEye実装状況
- partial / missing
- history必要性
- API cost
- D1/R2 cost
- Safety impact
- Status / JSON observability要件

ここでは新機能を作らない。

### Phase 1 — Resource Safety Foundation
実装:
1. Safety Gate
2. Global Collection Semaphore
3. Cloudflare safety profile
4. MightPulse key-level quota
5. Service Reserve
6. planned consumption
7. background budget
8. NORMAL / CAUTION / WARNING / CRITICAL / HARD_STOP
9. stop reason
10. resume condition

OWNERでもSafety Gateを突破不可。Load TestもSafety Gateを通す。Watchlistより下位処理を先に縮退/停止する。

### Phase 2 — Data Collection Engine
既存Watchlist処理を共通Engineへ抽象化。

Mode:
- NORMAL
- FORCED
- LOAD_TEST

共通:
- API lease
- Global Semaphore
- Safety Gate
- wait metrics
- cancellation
- progress
- run history
- observability

Load TestはEngineの高負荷実行modeとする。

### Phase 3 — Kingdom Catalog / Discovery
- MightPulse王国一覧同期
- Catalog
- first_seen_at / last_seen_at
- status / source / opened_on
- NEW detection
- KINGDOM_DISCOVERED event
- System Status / JSON

禁止:
- 最大KID+1推測
- Discoveryと詳細収集の同一処理化

### Phase 4 — Kingdom Seeder
Watchlist外王国の基本情報をSafety Gate経由でbounded収集。
planned consumption、stop/resume、progress、Status/JSON、D1/R2 usageを持つ。

### Phase 5 — Alliance Catalog / Roller
ranking / player dataからAllianceを発見しCatalog化。
info / roster / history / changesを収集。
非公開MightPulse Web内部APIには依存しない。

### Phase 6 — Player Roller
~~~
Kingdom
 ↓
personal_power / target ranking
 ↓
Top N / target players
 ↓
Player detail
 ↓
players / api_observations
 ↓
R2 history / change events
~~~

入口はkingdom_ranking_current。ranking_snapshotsの広範囲readは使用しない。

### Phase 7 — Feature Parity
公式公開APIで安全に取得可能な範囲から:
- KvK
- Momentum
- Castle Battle History
- Appointments / Ministers / Offenders
- Events
- Player Record
- その他Feature Matrixで確認した機能

### Phase 8 — EagleEye独自分析
データ蓄積後に:
- historical comparison
- cross-kingdom
- cross-alliance
- cross-player
- anomaly detection
- prediction
- EagleEye独自ranking

## 86-6. 新機能Definition of Done

~~~text
Feature
 ↓
API / Worker / DB / R2
 ↓
System Log
 ↓
System Status
 ↓
System JSON
 ↓
normal / warning / failed / paused / stopped
 ↓
reason / blocker / resume condition
 ↓
本番E2E
~~~

最低限:
- feature
- state
- current run
- target
- processed
- success
- failed
- skipped
- last target
- API usage
- D1/R2 usage
- stop reason
- blocked_by
- resume_condition
- last success
- last failure
- next run

## 86-7. 実装前に整理する既存コード

### Load Test runtime DDL
src/admin-kingdom-load-test.jsに0033 migrationと重複するruntime ALTER TABLEが存在。
対象:
- api_wait_min_ms
- api_wait_max_ms
- api_wait_buckets_json

migrationを正本とし、本番適用状態を確認後、不要なruntime DDLを撤去する。

### API concurrency
現在はLoad Test local limiter=26。
今後Global Collection Semaphoreを新設し、責務をEngine側へ移す。

### index.js
src/index.jsは巨大なmonolith。
次期Engineの新規ロジックを大量追加せず、Collection Engine / Safety / Catalog / Rollerを専用moduleへ分離する。

### Ranking定義
既存:
- KINGDOM_RANKING_BOARDS
- RANKING_BOARD_LABELS
- src/ranking-catalog.js

今後:
- key / labelの正本を整理。
- 既存UI/API/CSVの期待値を確認してから統合。
- 同じranking定義を新規作成しない。

## 86-8. 実装順の最終固定

~~~text
0. Feature Matrix
        ↓
1. Safety Foundation
        ↓
2. Data Collection Engine
        ↓
3. Kingdom Catalog / Discovery
        ↓
4. Kingdom Seeder
        ↓
5. Alliance Catalog / Roller
        ↓
6. Player Roller
        ↓
7. Feature Parity
        ↓
8. EagleEye独自分析
~~~

各Phase開始前に必ず:
- 現行mainとの重複確認
- D1/R2 cost見積り
- API Pool影響
- System Status / JSON設計
- 本番確認項目

## 86-9. 現時点の状態

### 既存・再利用可能
- Kingdom Watchlist / Player Watchlist
- kingdom_ranking_current / kingdom_ranking_board_state
- API Pool / key lease / quota tracking
- Load Test / Run History / Cancel / Progress / Recovery / Wait Metrics
- System Log / Diagnostics / Cloudflare Monitoring
- R2 History Archive / History Emergency Buffer
- Google Drive transport primitive

### 計画のみ・未実装
- Feature Matrix
- Safety Gate
- Global Collection Semaphore
- Data Collection Engine
- Kingdom Catalog / Discovery
- Kingdom Seeder
- Alliance Catalog / Roller
- Player Roller
- Planned Consumption
- Background Budget
- Measured/Dynamic Reserve
- Roller-specific System Status / JSON

この「計画のみ・未実装」に記載しただけでは、実装済みとは扱わない。

## 86-10. 次の開始点

本MDの#86を計画確定版として扱う。

次の作業は **Phase 0: MightPulse Feature Matrix作成**。

Phase 1へ入る前にAPI Pool、Load Test、Cloudflare Monitoring、System Status / System JSONの詳細を再確認し、Safety Gate設計を確定する。

この時点では新しいCrawler / Seeder / Rollerの実装を開始しない。

最終目標:
> Watchlistに依存せずKingShot世界を認識し、Kingdom → Alliance → Playerを安全に継続収集し、その収集処理をLoad Testとして検証できるData Collection基盤を構築する。

さらに:
> Cloudflare / MightPulse / 一般ユーザーサービスをSafety Gateで保護し、Paid / Freeのどちらでも安全枠を超えない。

さらに:
> 追加機能についてSystem Status + System JSONだけで、何が動いているか、どこまで進んだか、なぜ止まったか、いつ再開できるかを確認できる状態にする。

---
# 87. 2026-10-04 Phase 0 — MightPulse Feature Matrix 初版

## 87-1. 調査基準

公式MightPulse API仕様を2026-10-04時点で確認。

公式:
- https://api.mightpulse.com/
- https://www.mightpulse.com/

API仕様で確認できた範囲:
- Player
- Alliance
- Kingdom
- Kingdom Rankings
- Player base / heroes / ranks / gov_gear
- Alliance info / roster
- Kingdom list / detail / rankings
- 1 keyあたり60 requests/minute、5,000 requests/day
- Mighty連携keyは120 requests/minute、10,000 requests/day
- Player / Alliance responseは最大60分古い可能性あり
- stale sectionは更新待ち最大90秒
- 同一Player/Allianceへの同時requestは更新結果を共有
- 429はrate limit超過

このため、EagleEyeでは「Webに表示される = APIで直接取得できる」とは扱わない。
公開APIで明示されたendpoint / fieldだけをFeature Matrix上の取得可能判定とする。

## 87-2. API Feature Matrix

| Feature | MightPulse Web | 公開API | EagleEye現状 | Phase | 履歴価値 | API Cost | Safety |
|---|---|---|---|---|---|---|---|
| Kingdom一覧 / Discovery | YES | YES /v1/kingdoms | 未実装 | 3 | HIGH | 1 req/page | HIGH |
| Kingdom基本情報 | YES | YES /v1/kingdoms/{kid} | 一部Watchlist経由 | 3/4 | HIGH | 1 req | HIGH |
| Kingdom ranking | YES | YES /ranks | 実装済み | 既存/2 | HIGH | 1 req/board | HIGH |
| Kingdom board一覧 | YES | YES include=boards | 実装済み相当 | 既存/2 | HIGH | 1 req | HIGH |
| Alliance基本情報 | YES | YES /alliances/{kid}/{tag}?include=info | 一部実装 | 5 | HIGH | 1 req | HIGH |
| Alliance roster | YES | YES include=roster | 一部実装 | 5 | HIGH | 1 req | CRITICAL |
| Player base | YES | YES /players/{id}?include=base | 実装済み | 既存/2/6 | HIGH | 1 req | HIGH |
| Player heroes | YES | YES include=heroes | 実装済み/role制御あり | 既存/6 | HIGH | 1 req | CRITICAL |
| Player ranks | YES | YES include=ranks | 実装済み | 既存/6 | HIGH | 1 req | HIGH |
| Governor gear | YES | YES include=gov_gear | 実装済み/role制御あり | 既存/6 | HIGH | 1 req | CRITICAL |
| Player Record | YES | 公開API仕様で独立endpoint未確認 | 未実装 | 7 / 要再確認 | HIGH | TBD | HIGH |
| KvK | YES | Kingdom endpointの明示fieldとして未確認 | 未実装/一部Web表示のみ | 7 / 要再確認 | HIGH | TBD | HIGH |
| Momentum | YES | Kingdom endpointの明示fieldとして未確認 | 未実装 | 7 / 要再確認 | HIGH | TBD | HIGH |
| Castle Battle History | YES | 公開API仕様で独立endpoint未確認 | 未実装 | 7 / 要再確認 | HIGH | TBD | HIGH |
| Appointments / Ministers | YES | 公開API仕様で独立endpoint未確認 | 未実装 | 7 / 要再確認 | MEDIUM | TBD | HIGH |
| Offenders | YES | 公開API仕様で独立endpoint未確認 | 未実装 | 7 / 要再確認 | MEDIUM | TBD | HIGH |
| Events | YES | 公開API仕様で独立endpoint未確認 | 未実装 | 7 / 要再確認 | MEDIUM | TBD | HIGH |
| New this week | YES | 公開API仕様で独立endpoint未確認 | 未実装 | 7 / 要再確認 | MEDIUM | TBD | HIGH |
| Map / coordinates | YES | Player base x/yあり | Player baseで取得可能 | 6 | MEDIUM | player 1 req | HIGH |
| VIP | YES | Player base vipあり | 実装/visibility制御あり | 既存 | MEDIUM | player 1 req | HIGH |
| Alliance abbreviation | YES | Player base alliance.abbrあり | 実装 | 既存/6 | HIGH | player 1 req | HIGH |
| Hero total / hero power | YES | Player heroes + ranks / Kingdom board | 一部実装 | 6 | HIGH | 1 req | HIGH |
| Hero highest level | YES | heroes sectionから算出可能 | 要実装確認 | 6 | HIGH | 1 req | HIGH |
| Main hero | YES | heroes position等から判定候補 | 要実装確認 | 6 | HIGH | 1 req | HIGH |
| Hero equipment | YES | heroes.gear / exclusive_gear | 実装/role制御あり | 既存/6 | HIGH | 1 req | CRITICAL |
| Governor equipment | YES | gov_gear | 実装/role制御あり | 既存/6 | HIGH | 1 req | CRITICAL |
| Alliance power/kills ranking | YES | Kingdom ranks | 実装済み | 既存 | HIGH | 1 req/board | HIGH |
| Ranking change | YES/EagleEye | Current + history | 実装済み | 既存 | CRITICAL | current read + archive | HIGH |
| Watchlist | EagleEye独自 | API利用 | 実装済み | 既存 | CRITICAL | bounded | CRITICAL |
| Load Test | EagleEye独自 | API利用 | 実装済み | 既存/2 | LOW | HIGH | CRITICAL |
| Cross-kingdom analysis | EagleEye独自 | 複数API | 未実装 | 8 | CRITICAL | VERY HIGH | CRITICAL |
| Cross-alliance analysis | EagleEye独自 | 複数API | 未実装 | 8 | CRITICAL | HIGH | CRITICAL |
| Anomaly detection | EagleEye独自 | 蓄積データ | 未実装 | 8 | CRITICAL | LOW after data | MEDIUM |
| Prediction | EagleEye独自 | 蓄積データ | 未実装 | 8 | CRITICAL | LOW after data | MEDIUM |

## 87-3. Kingdom Rankingの公開APIと既存EagleEyeの対応

公開APIで明示されたboard:
- alliance_power
- alliance_kills
- personal_power
- kills
- town_center
- rebel_conquest
- single_hero
- hero_total
- troop_power
- building_power
- research_power
- hero_no_equip
- hero_equip
- gov_gear
- gov_charm
- pet_power
- island_prosperity
- migrant_score
- mystic_trial
- coliseum
- forest_of_life
- crystal_cave
- knowledge_nexus
- molten_fort
- radiant_spire
- master_power

既存src/ranking-catalog.jsには上記26 boardが存在。
ただし:
- VERIFIED
- PROVISIONAL

が混在しているため、Phase 0でAPI仕様との照合結果を正本として更新する。
特にPROVISIONAL項目は「API存在未確認」ではなく「EagleEye内部の検証状態」として整理する。

## 87-4. API costの基本モデル

公式仕様上、通常keyは:
- 60 req/min
- 5,000 req/day

Mighty keyは:
- 120 req/min
- 10,000 req/day

また、Player/Allianceのsectionが60分以上古い場合、MightPulse側更新待ち最大90秒が発生する。

したがってplanned consumptionは単純なrequest数だけでは不十分。

最低限:
- request count
- key count
- per-key minute quota
- per-key daily quota
- remaining_minute
- remaining_day
- expected stale-refresh risk
- endpoint type
- concurrency
- expected wait
- retry allowance
- emergency reserve

を考慮する。

特にPlayer Rollerは:
- Player base
- heroes
- ranks
- gov_gear

を1 requestにまとめられるため、section分割して4 requestにしない。
現行API仕様のinclude方式を基本とする。

## 87-5. Feature分類

### BASIC候補
- Kingdom基本情報
- Player base
- VIP
- coordinates
- alliance基本情報
- basic ranking

### ADVANCED候補
- Player ranks
- heroes
- hero equipment
- governor gear
- detailed ranking
- alliance roster

### ADMIN候補
- bulk collection
- historical aggregation
- operational monitoring
- load test
- system diagnostics

### EagleEye独自
- Kingdom Discovery
- Catalog
- Seeder
- Roller
- cross-kingdom
- cross-alliance
- historical comparison
- anomaly detection
- prediction
- ranking change analytics

実際のrole公開範囲は既存PLAYER_VISIBILITY_ITEMSと照合して決定する。
Feature Matrixとrole matrixを混同しない。

## 87-6. Phase 0で確定したこと

1. **Kingdom Discoveryは公開APIで実現可能**
   - /v1/kingdoms
   - opened_on
   - kid
   - activity/power等
   をCatalog同期のsourceとする。

2. **Kingdom Seederは公開APIだけで実現可能**
   - Kingdom detail
   - Kingdom ranks
   をbounded収集する。

3. **Alliance Rollerは公開APIで実現可能**
   - Kingdom rankingのAlliance boardから対象Allianceを発見
   - /v1/alliances/{kid}/{tag}?include=info,roster
   でinfo/roster取得。

4. **Player Rollerは公開APIで実現可能**
   - kingdom_ranking_currentから対象Playerを発見
   - /v1/players/{id}?include=base,heroes,ranks,gov_gear
   を基本request単位とする。

5. **ranking_snapshotsをPlayer discovery sourceとして使わない**
   - current tableを利用。
   - historyはR2中心。

6. **Web-only機能は現時点で公開API機能として確定しない**
   - KvK
   - Momentum
   - Castle Battle History
   - Appointments
   - Ministers
   - Offenders
   - Events
   - New this week
   - Player Record
   についてはPhase 7でendpointの正式確認を行う。

## 87-7. Phase 1 Safety Gateへの入力項目

Feature MatrixからSafety Gateへ渡す分類:

- feature_id
- endpoint
- request_weight
- expected_requests
- priority
- freshness
- history_required
- d1_write_weight
- r2_write_weight
- api_key_quota_weight
- stale_refresh_risk
- normal_allowed
- forced_allowed
- load_test_allowed
- minimum_reserve_required

優先順位:
1. Normal / Watchlist
2. User-requested Forced
3. Catalog Discovery
4. Seeder
5. Alliance Roller
6. Player Roller
7. Load Test

ただしLoad Testが安全枠を消費して通常運用を圧迫する場合はSafety Gateが停止させる。

## 87-8. Phase 0暫定判定

**Phase 0は初版完了。**

未確定として残す:
- Web-only機能の公式API endpoint
- API request単価がendpoint別に同一かどうかの実測
- 429発生条件のkey単位詳細
- Cloudflare D1/R2 write amplification
- Player full-detailの実測応答サイズ
- Alliance rosterの王国あたり件数と実測cost
- Catalog全件同期のpagination実測
- stale refresh発生率

これらはPhase 1 Safety設計前の実測項目とする。

公式API参照:
- https://api.mightpulse.com/

---
# 88. 2026-10-04 Phase 1 — Resource Safety Foundation 進捗

## 88-1. 実装済み

### Safety Gate共通module
追加:
- src/safety-gate.js

責務:
- NORMAL / CAUTION / WARNING / CRITICAL / HARD_STOP判定
- Cloudflare最大使用率評価
- API Pool available key評価
- reserved key保護
- planned request budget評価
- API minute/day remaining評価
- operation priority
- stop reason
- blocked_by
- resume_condition
- OWNER/forceでもHARD_STOPを突破しない

### System StatusへのSafety可視化
/statusのoperational JSONに:
- safety.state
- maxCloudflareUsagePercent
- availablePoolKeys
- activeLeases
- waiting
- thresholds

を追加。

既存Cloudflare monitoring:
- WARNING = 70%
- CRITICAL = 85%
- HARD_STOP = 100%

と接続。

### OWNER Load Test
Load Test開始前にSafety Gateを実行するよう変更。

plannedRequests:
- 対象王国数 × (26 ranking boards + topN player取得)

Load Testは:
- API Pool reserve
- Cloudflare safety
- planned request budget

を通過しなければ開始しない。

重要:
- OWNER権限でもSafety Gateは突破不可。
- force=trueは「Safety無視」の意味ではない。
- Load Test専用Crawlerは追加していない。

## 88-2. まだ未実装

- Watchlist通常更新へのSafety Gate適用
- Normal RollerへのSafety Gate
- Forced RollerへのSafety Gate
- Catalog/Seeder/Roller共通Engine
- Global Collection Semaphore
- API key単位のplanned consumption精度向上
- Cloudflare Reserve
- Service Reserve
- Dynamic/Measured Reserve
- Safety stop/resume eventの統一
- Status UIでのSafety詳細表示
- System JSONのplanned/actual budget詳細

## 88-3. 注意点

現在のLoad Testは既存の:
- MAX_API_CONCURRENCY=26
- LOAD_TEST_NORMAL_RESERVE=1

を維持している。

これはPhase 2のGlobal Collection Semaphore完成までの既存実装。
26はGlobal Semaphoreの最終値ではない。

また、Cloudflare Analytics取得不能時はSafety Gateを即HARD_STOPにはせずCAUTION扱いとし、API Pool側の安全判定を継続する。
この挙動はPhase 1の実測・運用結果を見て再調整する。

## 88-4. コミット

Phase 1初回実装:
- 2ae6daabe860170a0390e7e6e44d0039a6598d62 — safety-gate.js
- 5ba73915463733c3ccb4a5bf05197ed29d410495 — System Status integration
- f3ad73ee48e68f4ba03ef7d743a419d089c54c06 — Load Test Safety Gate integration



---
# 89. 2026-10-04 Phase 1 — Global Collection Semaphore / Safety統合 実装進捗

#89は#86/#88の「未実装」記載を上書きする最新状態として扱う。

## 89-1. 実装済み

### Global Collection Semaphore
追加:
- `src/collection-semaphore.js`
- `migrations/0034_global_collection_semaphore.sql`

現段階の方式:
- D1の単一カウンタ行 `collection_semaphore`
- key: `GLOBAL_API`
- 初期capacity: 26
- acquire: 条件付きUPDATE
- release: 条件付きUPDATE
- hot acquire pathではSELECTを行わない
- status表示時のみsnapshot SELECTを行う

重要:
- 既存Load Testの`MAX_API_CONCURRENCY=26`とは責務を分離。
- 26は現時点のGlobal Semaphore default値。
- 将来の実測値/Feature Matrix/API Pool状況によりcapacityを変更可能。

### Watchlist / Load Testへの接続
`src/index.js`:
- API request直前の既存Load Test limiterにGlobal Collection Semaphoreを追加。
- Load Testはlocal limiter → global limiter → API Pool leaseの順で制御。
- 通常Watchlistも同じGlobal Collection Semaphoreを経由。
- Global枠が満杯の場合は`GLOBAL_COLLECTION_SEMAPHORE_FULL`として短時間retry。
- D1をpollingして待機する方式にはしていない。

### Watchlist Safety Gate
通常Watchlist Cron開始時に:
- API Pool availability
- Cloudflare resource usage
- Safety Gate

を1回評価。

Safety Gateが停止した場合:
- 新規Watchlist jobは開始しない。
- 既に進行中のjobは途中放棄せず継続可能。
- System LogへBLOCKED/PAUSEDまたはWARNING eventを記録。
- `blocked_by`
- `resume_condition`
- `state`

を記録する。

### System Status / System JSON
`/status`へ:
- Safety Gate state
- Cloudflare max usage
- Global Collection Semaphore active/capacity/available
- API Pool状態
- Watchlist状態

を表示。

System JSONでも:
- `operational.safety`
- `operational.collectionSemaphore`

を取得可能。

### Load Test
Load Test開始前:
- Safety Gate
- API Pool reserve
- planned request estimate

を確認。

さらに実際の各API request:
- local Load Test limiter
- Global Collection Semaphore
- API Pool

を通過する。

OWNER権限/force=trueでもHARD_STOPは突破不可。

## 89-2. D1使用量方針

Global Semaphoreのacquire/releaseは1 requestにつき:
- acquire: 1 conditional UPDATE
- release: 1 UPDATE

であり、SELECT pollingは行わない。

status snapshotのみ:
- 1 SELECT

したがって「待機のためのD1 SELECTループ」は作っていない。

ただし、acquire/releaseのD1 write amplificationは今後の実測対象。
Phase 1後半で:
- 1 API requestあたりのD1 write増加
- Watchlist 26並列時のD1 write
- Load Test時のD1 write
- Cloudflare D1 Rows Written

を実測し、必要ならDurable Objects等のstateful coordinationへの移行を検討する。

## 89-3. 現段階の重要なhardening課題

現在のD1 counter方式には、Worker実行中断時に`active_count`が残る可能性がある。

そのため:
- Phase 1の「Global Semaphore完成」ではなく「Global Semaphore初版」
- production E2E前にcrash/recovery対策を確認する
- lease TTL / recovery / Durable Object等を比較する

という扱いにする。

Cloudflare公式仕様上、Durable Objectsはglobal uniquenessとstateful coordination向けの仕組みであり、今回のGlobal Semaphoreのような分散協調には適合性が高い。
ただし、D1 usage / deployment complexity / current Worker architectureを比較してから採用を決定する。

## 89-4. Status / JSON / Log Definition of Done進捗

### 完了
- Feature実装
- Worker/API接続
- D1 state
- System Log
- System Status
- System JSON
- blocked_by
- resume_condition
- stop state

### 未完了
- planned consumptionのkey-level精度
- API minute/day remainingを実際のGateへ常時入力
- Cloudflare reserve
- Service reserve
- Dynamic/Measured reserve
- Semaphore crash recovery
- 本番E2EでのD1 write amplification確認

## 89-5. Phase 1コミット

- `8a8905b1384c68180e61d1d719746825f9a264cc` — add global collection semaphore migration
- `e74a1fbbd3277f8c360872ce2f605a3945230113` — add global collection semaphore module
- `dad013475f0bf97a142509c87e1b7e3f7ceab0e7` — expose semaphore limiter adapter
- `ad6d33d1c875d4c9d2c80b873e1bb47d4730ba35` — enforce global semaphore on collection API path
- `db6532c665bbcdf2c4c07172b1378f61e2523723` — apply global semaphore to watchlist collection
- `b4a9c8bfb2dee173b2e0ac0e7c612e831df9e69f` — gate new watchlist jobs with Safety policy
- `4b1c23a89feb54cc65a69b8091f4de926230a0b4` — expose semaphore in operational status
- `b0bb8822b21c90daa592ede5c4aeb4a401b06cf5` — fix status semaphore result binding
- `48feb60ef3ea05ab5bff03e62e3f5d2185d38592` — show Safety Gate / Semaphore on system status
- `e08363665a46d5cb0df89d72d36758758c403a48` — connect Load Test to global semaphore

## 89-6. 次の実装順

1. Semaphore crash/recovery方式を確定
2. API key-level planned consumption
3. Cloudflare / Service Reserve
4. Dynamic/Measured Reserve
5. Safety stop/resume event統一
6. Phase 1 production E2E
7. Phase 2 Data Collection Engine

禁止事項:
- ranking_snapshotsの広範囲read復活
- Watchlistをコピーした別Crawler作成
- Global SemaphoreをLoad Test専用にすること
- System Status / System JSONへ載せない新機能追加

---
