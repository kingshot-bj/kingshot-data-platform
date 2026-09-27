# EagleEye 開発引き継ぎ書
## 2026-09-27 / D1・R2データアーキテクチャ検討スレッド用

この文書は、KingShot Data Platform EagleEyeの本丸開発を次スレッドへ移行するための専用引き継ぎ書。
今回のスレッドでは、MightPulse未公開データ研究とは切り離し、**EagleEye本体のD1 / R2データ保管アーキテクチャ**を中心に続行する。

---

# 1. 基本情報

- Repository: `kingshot-bj/kingshot-data-platform`
- Branch: `main`
- Platform: Cloudflare Workers
- Primary DB: Cloudflare D1
- Object storage candidate / intended archive: Cloudflare R2
- Auth: Discord OAuth
- External API: MightPulse API
- API key architecture: EagleEye API Pool
- Main device: iPhone Safari
- Cost policy: まず無料運用を目指す。必要になればCloudflare Paidへ移行。ただしアプリを作り直さない。
- Real MightPulse API keyをチャットに要求・保存しない。

---

# 2. 現在の最新main

今回のスレッド開始時点で確認した最新の重要commit:

`b25c66aba0b25c77c3d94c777de1cab48097174f`
- `docs: add MightPulse research project record`

これはResearch Project文書追加のみ。

Research Lab関連:
- `810267dc574ddcbaae429b5ca84f7ec435daf146`
- `82d500c751baa3d00af90fd08c099526dbbf733a`
- `e21d005aeb5d62172ee7afb921fd10f1aec5d1f0`

EagleEye本体の主要最新実装:
- `a71f6c0fc5cd730b5cfe6c6fd1b0d3bc05610982`
  Player Watchlistの戦力・役場・同盟変更表示
- `02b3fd3e054eb04f71d3e694c8ed6ba6f2651137`
  旧ranking history scans削除
- `d5c8edb20e842b49fa68b4b9578f787c367ef64a`
  current ranking stateとchange snapshotsの分離
- `c8b0e90022cf912389b8663f97a5de8b1dbe708f`
  admin ranking reads/refreshをcurrent state化
- `f1c237de24350ca34effbd000ec48896d5f3d4fd`
  Player Watchlistのranking history scans削減

次スレッドでは必ずmainの最新commitを再確認する。

---

# 3. EagleEyeの現在の主要機能

- Player Search / Player Profile
- Player History / Change History
- Kingdom Ranking
- Kingdom Watchlist
- Personal Player Watchlist
- API Pool
- Diagnostics / System Status
- Discord OAuth
- Role / visibility
- Google Sheets export
- Data retention
- MightPulse Probe
- MightPulse Research Lab
- 将来: Discord通知
- 将来: Group / Workspace
- 将来: R2長期アーカイブ

Role:
- BASIC
- ADVANCED
- ADMIN
- OWNER

---

# 4. 今回の本丸テーマ

## D1とR2の役割分担を正式設計する。

現在の方向性:

```
MightPulse
   ↓
API Pool
   ↓
EagleEye
   ├── D1 = current state / operational database
   └── R2 = history / archive / large data
```

この方針はまだ「最終確定設計」ではない。

次スレッドでは、以下を具体化してから実装する。

1. D1に残すテーブル
2. R2へ移すテーブル / データ
3. currentとhistoryの境界
4. D1→R2 archiveのタイミング
5. R2 object naming
6. JSON / JSONL / Parquet等の保存形式
7. 圧縮方式
8. R2からの検索・復元方法
9. D1 retention
10. R2 retention
11. Cloudflare無料枠での運用可能性
12. Paid移行時の構造
13. Google Sheetsとの役割分担
14. 障害時の復旧方法
15. Watchlist / Change Eventとの整合性

---

# 5. D1の基本役割

D1は「今のEagleEyeが判断・表示・認証・監視するために必要なデータ」を持つ。

候補:

## Core

- users
- sessions / auth
- roles / permissions
- API Pool
- API Pool health
- API Pool usageの必要な直近情報

## Current State

- player current
- kingdom ranking current
- kingdom ranking board state
- 必要な最新player ranking state

## User State

- player_watchlists
- kingdom_watchlists
- Group / Workspace
- notification settings

## Operational

- change_eventsの直近期間
- 最新API observations
- diagnosticsに必要な状態

D1は長期履歴の保管庫にしない。

---

# 6. R2の基本役割

R2は「大量・長期・履歴・アーカイブ」を担当する方向。

候補:

- ranking history
- player snapshots
- player rank snapshots
- 古いchange events
- API observationsの長期履歴
- 長期分析用データ
- 大容量export source
- 将来のanalytics dataset
- 必要に応じてraw/normalized archive

概念:

```
D1 = operational database
R2 = data lake / archive
```

---

# 7. なぜR2を使うのか

現在D1で問題になっているのは、単純なStorage容量だけではない。

特に問題:

- D1 Rows Read
- D1 Rows Written
- 大量履歴のscan
- Snapshotの大量INSERT
- 長期保存によるtable肥大
- historyを読むたびにD1 rowsを消費する構造

過去の実測:

- D1 Rows Read 約51.8%
- D1 Rows Written 100%
- Storage 約0.2%
- Query Insights 76 queries
- Total Rows Written 約111,478
- Ranking Snapshot 約95,850
- Ranking SnapshotだけでWriteの約86%

したがって、Storage容量よりも**D1 operation cost / row read/write**が重要。

---

# 8. すでに実施したランキング最適化

ランキングは既に、

**毎回全ランキングをhistory snapshotとして保存する設計**

から、

**current state + change history**

へ移行している。

新しい概念:

- `kingdom_ranking_current`
- `kingdom_ranking_board_state`
- `ranking_snapshots` = change history

## 保存ルール

変化なし:
- board_stateのlast_checked_atだけ更新
- 大量Snapshot INSERTなし

変化あり:
- changed rowだけcurrent UPSERT
- changed rowだけranking_snapshotsへ保存

Top100脱落:
- currentからDELETE

再ランクイン:
- currentへINSERT

---

# 9. current state方式をR2設計にも継承する

今後は、

```
CURRENT
    ↓
D1

HISTORY
    ↓
R2
```

という分離を基本原則として検討する。

ただし、直近履歴をUIで頻繁に必要とするものまで即座にR2へ移すとは限らない。

例えば:

- 直近数件のChange Event → D1
- 古いChange Event → R2

のようなhot / cold分離を検討する。

---

# 10. Change Eventsの扱い

現在:

- POWER_CHANGED
- TOWN_CENTER_CHANGED
- ALLIANCE_CHANGED
- COORDINATES_CHANGED
- ACTIVITY_CHANGED
- KILLS_CHANGED
- PLAYER_FIELD_CHANGED

old_value_json / new_value_jsonを保持。

index:
`idx_change_events_target_time (target_type, target_id, detected_at DESC)`

現在の方向性:

### D1
Watchlist・UI・通知に必要な直近Change Event

### R2
長期Change Event archive

ただし「何日D1に残すか」はまだ最終決定していない。

Data Retention UIでは現状:
- change events: 2年
などの推奨値があるが、これは**R2を含めた最終アーキテクチャ決定前の暫定値**。

---

# 11. Player Snapshots

現在D1には以下のような履歴系テーブルが存在する。

- player_snapshots
- player_rank_snapshots

既存index:

- `idx_player_snapshots_governor_history (governor_id, observed_at DESC)`
- `idx_player_rank_snapshots_governor_history (governor_id, observed_at DESC)`

これらは今後R2へ移行する主要候補。

ただし、Player History画面で「直近履歴」を頻繁に見るなら、

- D1にhot history
- R2にcold history

という二層構造を検討する。

---

# 12. ranking_snapshots

現在:

- kid
- board
- target_type
- target_id
- rank
- score
- uid
- governor_id
- nick_name
- aid
- abbr
- name
- observed_at
- source_observed_at

既存index:

- `idx_ranking_snapshots_target_history`
- `idx_ranking_snapshots_current`

ランキングhistoryはR2への移行候補として非常に優先度が高い。

ただし、現在のcurrent化によりsnapshot write自体を大幅削減しているため、

**「D1最適化 → その後R2 archive」**

の順序で進める。

---

# 13. API Observations

`api_observations` / 関連index:

`idx_api_observations_target_time (target_type, target_id, observed_at DESC)`

候補:

### D1
- 最新観測
- diagnostics
- current freshness
- Watchlistの判断に必要なもの

### R2
- 長期API observation
- 分析用履歴
- 長期監査用データ

raw responseをR2に保存するかは別途決定。

---

# 14. R2に何を保存するかは「生JSONを全部入れる」ではない

重要。

R2へ移行するからといって、

```
MightPulse raw response
→ 全部R2
```

を無条件に採用しない。

検討対象:

### Option A
Normalized JSON

### Option B
JSONL

### Option C
圧縮JSON

### Option D
Parquet

### Option E
Raw response + normalized index

EagleEyeの利用目的・Cloudflare Workersでの読み出しコスト・将来Analyticsを考慮して決定する。

---

# 15. R2 Object Key設計

まだ未確定。

候補:

```
players/{kid}/{governor_id}/YYYY/MM/DD/{timestamp}.json.gz

ranking/{kid}/{board}/YYYY/MM/DD/{timestamp}.json.gz

change-events/{kid}/{governor_id}/YYYY/MM/DD/{timestamp}.json.gz

api-observations/{target_type}/{target_id}/YYYY/MM/DD/{timestamp}.json.gz
```

またはpartition単位:

```
ranking/kid=123/board=power/date=2026-09-27/part-001.jsonl.gz
```

どちらがEagleEyeに適切かを次スレッドで決める。

---

# 16. R2への移行方式

候補:

## A. Write-through

取得時にD1 + R2へ同時保存。

問題:
- 毎回R2 write
- エラー処理複雑化
- R2 write数増加

## B. D1 hot → 定期archive

一旦D1に保存し、一定期間後にR2へ移動。

メリット:
- UI処理がシンプル
- R2障害が即時本番処理に影響しにくい

## C. Queue / Cron archive

Workers Cron / Queue等で定期的にD1から古いデータをR2へ移動。

有力候補。

---

# 17. 最重要: D1→R2移動後の削除

以下の順番を基本にする。

```
D1
 ↓
archive job
 ↓
R2 write成功
 ↓
R2 object existence / checksum確認
 ↓
D1 DELETE
```

R2保存成功前にD1を削除しない。

二重保存期間は許容する。

---

# 18. R2を「検索DB」として使わない

R2はオブジェクトストレージ。

大量履歴をR2に移しても、

```
R2の全ファイルを毎回scan
```

のような設計にしない。

必要なら、

- D1 metadata/index
- partitioned object
- manifest
- date/kid/target index
- 将来的なAnalytics基盤

を組み合わせる。

---

# 19. Google Sheetsとの役割

Google SheetsはDB/R2の代替ではない。

用途:

- ADMIN/OWNER export
- 人間が確認
- 外部共有
- 一時分析

基本:

```
D1/R2
   ↓
Google Sheets Export
```

Google Sheetsを本番のsystem of recordにはしない。

---

# 20. Data Retentionの再設計

現在UIには以下の設定がある。

- api_observations_days
- player_snapshots_days
- ranking_snapshots_days
- player_rank_snapshots_days
- change_events_days
- api_pool_usage_days

暫定推奨:
- API 14日
- player 90日
- ranking 180日
- player ranking 180日
- change events 2年
- API Pool 90日

しかしR2導入後は、

```
D1 retention
+
R2 retention
```

の二層にする。

例:

```
D1: 7〜30日
R2: 1年 / 2年 / 無期限
```

などを比較検討する。

---

# 21. D1無料枠問題

2026-09-27時点でD1 free-tier daily row read limitに到達。

代表エラー:

`D1_ERROR: Your account has exceeded D1's free tier daily row read limit...`

重要:

- データ消失ではない
- rows read制限
- 00:00 UTC / 日本時間09:00でリセット
- Paid化すれば継続可能
- ただしまずクエリ・保存方式を最適化する

---

# 22. 現在のD1削減予測

未実測予測:

- Ranking Snapshot由来Write: 約90〜99%削減余地
- D1全体Write: 約80〜90%削減可能性
- D1全体Read: 約30〜70%削減可能性

これらは**予測値であり確定値ではない**。

D1復旧後にCloudflare Analyticsで実測する。

---

# 23. 明日最初にやること

D1復旧後:

1. deploy状態確認
2. Watchlist実動作
3. ranking current保存確認
4. ranking snapshot保存確認
5. previous_rank確認
6. Top100脱落確認
7. 再ランクイン確認
8. D1 Rows Read確認
9. D1 Rows Written確認
10. Query Insights確認
11. Workers Requests / CPU確認
12. MightPulse API request数確認

その後にR2アーキテクチャ設計を確定する。

---

# 24. Cloudflare Analyticsで見る項目

最低限:

- D1 Rows Read
- D1 Rows Written
- D1 Storage
- D1 Query Insights
- Top Read SQL
- Top Write SQL
- Workers Requests
- Workers CPU
- Workers Subrequests
- R2 Class A
- R2 Class B
- R2 Storage

---

# 25. 既に削除した危険な方式

絶対に復活させない。

## 広範囲ranking scan

以前:

- ranking_snapshotsから大量PLAYERを取得
- TOP5/TOP10等に応じて数百〜数千rowsを読む可能性

削除済み。

関連:
`8b807e55a501e397ff58e9371e35ee952025e182`

## 旧ranking change detection

削除済み:

- detectRankingChangesForBoards()
- detectRankingChanges()

関連:
`02b3fd3e054eb04f71d3e694c8ed6ba6f2651137`

`getRankingHistory()` は履歴表示用途なので維持。

---

# 26. Player Watchlist

migration:
`migrations/0012_player_watchlist.sql`

table:
`player_watchlists`

API:
`/api/player-watchlist`

UI:
`/player-watchlist`

現在表示:
- power change
- town center change
- alliance change
- ranking changes

Ranking changes:
- board
- label
- current
- previous
- delta
- observed_at

広範囲history scanは禁止。

---

# 27. Current Ranking State

新テーブル:

- `kingdom_ranking_current`
- `kingdom_ranking_board_state`

currentにはprevious_rankを保持。

これが今後のD1/R2分離設計の重要な基準。

---

# 28. API Pool

Pool例:

- SYSTEM_GENERAL
- SYSTEM_WATCHLIST
- ADVANCED user contributed keys

管理:

- key_id
- pool_type
- status
- last_used_at
- endpoint
- target_type
- purpose
- http_status
- request_count
- error
- remaining

Research LabもAPI Poolを使用するが、Researchは別プロジェクトとして扱う。

---

# 29. MightPulse Research Projectとの分離

MightPulse未公開データ調査は別文書:

`docs/MIGHTPULSE_RESEARCH_PROJECT_2026-09-27.md`

今回のEagleEye本体スレッドでは、その研究を本丸開発と混ぜない。

Research Lab:
- `/admin/mightpulse-research`
- `/api/admin/mightpulse-research`

研究結果は別管理。

---

# 30. Diagnostics

`src/diagnostics.js`

CRITICAL:
- API Pool
- MightPulse
- D1

DEGRADED:
- ranking
- player
- watchlist
- Discord
- Google Sheets
- notifications

公開:
`/status`

ADMIN:
`/admin/diagnostics`

D1障害でもhomeが500にならないようauth lookupをtry/catch済み。
protected routeはroleがDBから取得できない場合fail closed。

---

# 31. 開発ルール

「実装して」と言われたら:

1. GitHub mainの最新commit確認
2. 関連コード確認
3. schema確認
4. 現行保存/読込フロー確認
5. 実装
6. commit
7. commit hash報告

特にD1/R2では、先に設計を確定してからmigration / runtime実装する。

---

# 32. D1/R2設計で絶対に守ること

### 1
D1を長期データ倉庫にしない。

### 2
R2を検索DBとして無理に使わない。

### 3
current stateとhistoryを分離する。

### 4
R2 archive成功前にD1を削除しない。

### 5
D1からR2へ移したことでUIが大量R2 scanする構造を作らない。

### 6
「取れるから保存する」をしない。

### 7
必要なデータ・期間・列だけ保存する。

### 8
無料枠だけを前提にしすぎず、Paid化しても構造を変えない。

---

# 33. 次スレッドで決めること

優先順:

## A. データ分類

全テーブルを:

- D1 Core
- D1 Current
- D1 Hot History
- R2 Archive
- 外部Export

へ分類。

## B. R2保存フォーマット

比較:

- JSON
- JSONL
- JSON.gz
- Parquet

## C. Object Key

kid / governor_id / board / date / timestamp等のpartition設計。

## D. Archive方式

比較:

- Cron
- Queue
- Workers scheduled job
- request-time async

## E. R2 metadata/index

R2だけで検索できないため、D1側に何を残すか決める。

## F. Retention

D1:
- 何日

R2:
- 何年 / 無期限

## G. 復旧

R2 archiveからD1 current/historyを復元できるか。

## H. 実装順

設計 → migration → archive job → R2 write → verification → D1 cleanup → UI/history read。

---

# 34. 次スレッド開始時の確認

新スレッドでは最初に:

1. GitHub mainの最新commit
2. 本文書
3. `src/index.js`
4. D1 migrations
5. ranking-store
6. player-store / snapshot保存
7. change-events
8. API Pool
9. cloudflare-analytics
10. R2関連コードの現状

を確認する。

その上で、

**「D1/R2の最終データアーキテクチャを設計してから実装」**

を開始する。

---

# 35. 次スレッド開始用メッセージ

以下をそのまま新スレッドへ送ればよい。

> GitHubの `docs/EAGLEEYE_HANDOFF_2026-09-27_D1_R2.md` を読んで、最新mainも確認してEagleEye本体の開発を続けて。
>
> 今回のテーマはD1/R2のデータアーキテクチャ。
> まず現在の全D1テーブル・保存処理・読み取り処理を確認して、D1 Core / Current / Hot History / R2 Archiveに分類しよう。
> その後、R2の保存形式・Object Key・archive方式・retention・復旧方式まで設計を固めてから実装する。
>
> MightPulse Research Projectは別プロジェクトなので混ぜない。

---

# 36. 最重要

EagleEyeを作り直さない。

現在の:

- API Pool
- Player Profile
- Kingdom Ranking
- Kingdom Watchlist
- Player Watchlist
- Change Events
- Diagnostics
- Discord OAuth
- current ranking state

を維持しながら、

**D1 = operational database**
**R2 = long-term data archive**

へ段階的に進化させる。

今回の次スレッドでは、いきなりR2実装を始めず、まず既存D1全体をコードから棚卸ししてから設計する。
