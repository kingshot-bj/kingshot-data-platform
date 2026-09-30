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
- ファイル名・ログ時刻を扱う場合、ユーザー指定のルールに従い、status JSON内部時刻を表示時刻として勝手に使わない。

---

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

今回、Discord SupportのSecretが本番環境から消える事故が発生した。

## 37-1. 原因

原因は、wrangler.jsonc の vars / previews.vars に以下のSupport設定を空文字で定義していたこと。

- DISCORD_SUPPORT_GUILD_ID
- DISCORD_SUPPORT_CATEGORY_ID
- DISCORD_SUPPORT_ROLE_ID
- DISCORD_SUPPORT_ARCHIVE_CATEGORY_ID

これらはCloudflare Secretとして設定していたにもかかわらず、deploy時の設定に空文字の同名変数が存在したため、Secret側の値を空文字設定で上書き・消失させる結果になった。

これは今回実際に本番で発生した。

## 37-2. 修正済み

wrangler.jsonc から上記4項目の空文字設定を vars / previews.vars の両方から削除した。

修正commit:
- 2bd7287e4c399d3965ec5aff80a1734a06fdd459
- message: fix: stop deploy config from overwriting Discord support secrets

**今後、これら4項目を wrangler.jsonc の vars / previews.vars に再追加してはならない。**

## 37-3. Secretとして扱うもの

以下はSecret管理を前提とする。

- DISCORD_CLIENT_SECRET
- DISCORD_BOT_TOKEN
- DISCORD_PUBLIC_KEY（現在はSecretとして設定済み）
- DISCORD_SUPPORT_GUILD_ID
- DISCORD_SUPPORT_CATEGORY_ID
- DISCORD_SUPPORT_ROLE_ID
- DISCORD_SUPPORT_ARCHIVE_CATEGORY_ID
- EAGLEEYE_SESSION_SECRET

特に、**Secret名と同名の空文字 vars を作らないこと。**

## 37-4. デプロイ前チェック

Discord Support関連を変更する場合、deploy前に必ず以下を確認する。

1. wrangler.jsonc にSupport Secret名が vars / previews.vars として存在しないこと。
2. DISCORD_SUPPORT_* を空文字で定義していないこと。
3. Secretをコード・MD・ログへ直接書かないこと。
4. deploy後、EagleEyeの /admin/diagnostics → 「Discord Support 設定」で全項目が「設定済み」になっていることを本番で確認する。
5. 1項目でも「未設定」になった場合、**SupportのE2Eテストへ進まず、Secret状態を復旧して原因を確認する。**

## 37-5. 今回の復旧状態

2026-09-30現在、ユーザーが以下4つをSecretとして再設定し、本番の /admin/diagnostics で全て「設定済み」を確認済み。

- Support Server ID: 1554824550859153448
- Support Category ID: 1554828614359318568
- Support Role ID: 1554826025895206982
- Archive Category ID: 1554828896233332826

※これらの値は今後コード・公開ドキュメントへ再掲せず、必要な場合は既存の本番設定を参照すること。
