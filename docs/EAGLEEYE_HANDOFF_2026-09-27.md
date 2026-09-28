# EagleEye 開発引き継ぎ書
## 2026-09-27 / 次スレッド継続用

この文書は、KingShot Data Platform EagleEye の開発を次スレッドへ正確に引き継ぐための基準文書。GitHubのコードだけでは「なぜその実装にしたか」「削除したもの」「次に何を実装するか」までは完全に復元できないため、新スレッド開始時は必ず本書を読む。

## 1. 基本情報
- Repository: kingshot-bj/kingshot-data-platform
- Branch: main
- Platform: Cloudflare Workers
- DB: Cloudflare D1
- Auth: Discord OAuth
- External API: MightPulse API
- API key architecture: EagleEye API Pool
- Main device target: iPhone Safari
- Cost policy: initially free tiers; later paid upgrade must not require architectural rewrite
- Never ask the user to paste a real MightPulse API key into chat.

## 2. 現在の基準コミット
直近の実装済みコミット:
5e02be7b4d3dc7b6ef668892fe4d7d666ca8c590
feat: add MightPulse Probe comparison analysis

直前:
a71f6c0fc5cd730b5cfe6c6fd1b0d3bc05610982
feat: show player watchlist field changes

直前:
02b3fd3e054eb04f71d3e694c8ed6ba6f2651137
refactor: remove legacy ranking history scans

直前:
e1785f074904ae98b599560800d70f4d88fbdd63
Update EagleEye handoff with D1 optimization progress

直前:
26fef71eea2a48c7f0eb1e76b87f33c2fa4dc9d1
feat: add player watchlist ranking changes

その直前:
f280d2e12f9421e09e4a885c6f4c0a6b301d6527
feat: add personal player watchlist

新スレッドでは、まず main の最新commitを確認し、これより新しいものがあればそれを現在状態として扱う。

## 3. EagleEyeの大枠
- プレイヤー検索 / Player Profile
- プレイヤー履歴 / Change History
- 王国ランキング
- 王国Watchlist
- 個人Player Watchlist
- API Pool
- Diagnostics / System Status
- Discord OAuth
- Player visibility / role system
- Google Sheets export
- Data retention
- 将来: Discord通知、Group/Workspace、共有監視、R2長期保存

Roleは BASIC / ADVANCED / ADMIN / OWNER。

## 4. API Pool
MightPulse APIキーを単一固定キーで扱わず、Poolとして管理する設計。
主なpool例:
- SYSTEM_GENERAL
- SYSTEM_WATCHLIST
- ADVANCEDユーザーが提供を許可した個人APIキー

管理対象には key_id, pool_type, status, last_used_at, endpoint, target_type, purpose, http_status, request_count, error, remaining等がある。
キーのhealth check、障害記録、利用状況表示、auto recoveryを考慮した構造。

## 5. D1無料枠問題
2026-09-27時点でD1 free-tier daily row read limitに到達する障害を経験。
代表エラー:
D1_ERROR: Your account has exceeded D1's free tier daily row read limit...

重要:
- 保存データが消えたわけではない。
- 無料枠のrow read上限で読み取りが失敗する。
- リセットは00:00 UTC、日本時間09:00。
- paid planへ移行すれば継続可能。
- rows_readを意識してクエリを設計する。
- deploy直後というだけで原因を断定しない。

## 6. D1最適化済み
17852cca254dc644d0493967e1d6e76fdc6cd03f
perf: reduce D1 row reads during watchlist updates
- ranking_snapshots index追加
- watchlist polling 1秒→2秒

6134fdab4028a0b1466eb222046b67dd1f0d97e7
migrations/0011_d1_read_optimization.sql
追加index:
- idx_ranking_snapshots_target_history (kid, board, target_id, observed_at DESC)
- idx_ranking_snapshots_current (kid, board, observed_at DESC, rank ASC)
- idx_player_snapshots_governor_history (governor_id, observed_at DESC)
- idx_player_rank_snapshots_governor_history (governor_id, observed_at DESC)
- idx_change_events_target_time (target_type, target_id, detected_at DESC)
- idx_api_observations_target_time (target_type, target_id, observed_at DESC)

ea06a404e0993d30e75caba3c7a7ada592f30c00
runtime bootstrapにも同系統indexを追加。
注意: ranking_snapshotsのcurrent系indexは一部重複しているため将来整理可能。

## 7. 削除済みの重要クエリ
8b807e55a501e397ff58e9371e35ee952025e182
handleKingdomWatchlistDataApiにあった広範囲ranking_observations取得を削除。

以前の考え方は、ranking_snapshotsからPLAYERを大量取得してランキング観測を返すものだった。TOP5/TOP10/上限に応じて数百〜数千行を読む可能性があり、当時UIで使用されていなかったため削除。

絶対に同じ広範囲クエリを復活させない。
将来の順位変動機能は対象playerを絞り、ranking_snapshots / change_eventsから必要な履歴だけ読む。

## 8. Kingdom Watchlist
王国Watchlistは実装済み。26 boards。
基本フロー:
1. auth
2. watchlist_id + discord_idで本人watchlist取得
3. latest job
4. boardごとの最新ranking
5. players latest
6. UI

MightPulse API Poolキー数に応じたconcurrency制御あり。
不要だったWATCHLIST_RANKING_BATCH=1等は整理済み。

## 9. ranking_snapshots
主な列:
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

重要: 次の順位変動機能では、実際の保存処理を再確認し、PLAYERのtarget_idとgovernor_idの対応を確認してからクエリを確定する。

## 10. Player Profile
主要route:
- /players
- /player?governor_id=...
- /player/history?governor_id=...
- /player/changes?governor_id=...
- /api/player

表示対象にはidentity, power, town center, VIP, coordinates, kills, activity, profile, alliance, heroes, skills, exclusive gear, normal gear, hero rankings, personal rankings, governor gearがある。

PLAYER_VISIBILITY_ITEMSで公開範囲を管理。
主要key:
base_identity, base_power, base_vip, base_coordinates, base_kills, base_activity, base_profile, alliance_identity, alliance_rank, alliance_stats, heroes_list, heroes_skills, heroes_exclusive_gear, heroes_gear, hero_rankings, ranks_core, ranks_leaderboards, gov_gear_list, gov_gear_gems

## 11. Change Events
change_eventsにはプレイヤー変更を保存。
既存type:
- POWER_CHANGED
- TOWN_CENTER_CHANGED
- ALLIANCE_CHANGED
- COORDINATES_CHANGED
- ACTIVITY_CHANGED
- KILLS_CHANGED
- PLAYER_FIELD_CHANGED

old_value_json / new_value_jsonを保持。
index: idx_change_events_target_time (target_type, target_id, detected_at DESC)

## 12. Diagnostics / Status
src/diagnostics.jsでサービス状態を管理。
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

/admin/diagnostics はADMIN/OWNER向け詳細診断。
/status は公開ページ。
公開status:
- SUCCESS = System Operational / green
- CRITICAL = Service Disruption / red
- DEGRADED = Some Services Degraded / yellow

内部エラー詳細は公開しない。
ホームの固定System Online表示は廃止し、「システム状況を確認」から/statusへ移動する。

## 13. D1障害時認証
af07299e12895703bc9d260fc08664f988bc2029
getAuthenticatedUserのD1 lookupをtry/catchし、D1障害でhomeが500にならないようにした。
Discord callbackのuser upsert失敗時もsession発行を継続。
ただしDB-backed roleが取れない場合はprotected routeをfail closed。Owner/Admin権限をsessionだけから推測しない。

## 14. Player Watchlist【直近実装済み】
f280d2e12f9421e09e4a885c6f4c0a6b301d6527
feat: add personal player watchlist

migration: migrations/0012_player_watchlist.sql
table: player_watchlists
columns:
- watchlist_id TEXT PRIMARY KEY
- discord_id TEXT NOT NULL
- governor_id TEXT NOT NULL
- label TEXT
- enabled INTEGER NOT NULL DEFAULT 1
- created_at INTEGER NOT NULL
- updated_at INTEGER NOT NULL
- UNIQUE(discord_id, governor_id)

index:
- idx_player_watchlists_user (discord_id, enabled, updated_at DESC)
- idx_player_watchlists_player (governor_id, enabled)

runtime bootstrap: ensurePlayerWatchlistSchema(db)

API: /api/player-watchlist
GET = 自分のwatchlistを取得しplayersとJOIN。
POST = governor_id / labelで追加。label最大80文字。既存ならupsert/reactivate。
PATCH = governor_id + enabledで一時停止/再開。
DELETE = governor_idで削除。

UI: /player-watchlist
プレイヤー名、profile link、kingdom、power、town center、alliance、enabled状態等を表示。

Player pageにも「☆ ウォッチリスト」ボタンを追加。
現在のUIはwatch中ならDELETEする実装。PATCHによるpause/resumeはAPIにはあるがUIから完全には使っていない。

## 15. 実装済み機能
### Player Watchlistのランキング順位変動
2026-09-27に実装済み。

目的:
Watchlist登録プレイヤーについて「前回何位 → 今回何位」を表示する。

例:
- 個人総力: 12位 → 9位
- 個人撃破: 45位 → 51位
- 役場: 8位 → 7位

## 16. 順位変動実装の絶対条件
広範囲ranking_snapshots取得を復活させない。
対象を以下に限定する:
1. ログインユーザーのplayer_watchlists
2. governor_id
3. kid
4. 必要なboard
5. 直近2観測

候補クエリは以下だが、実装前に実schemaと保存処理を確認すること:
WHERE kid = ? AND board = ? AND target_type = 'PLAYER' AND governor_id = ? ORDER BY observed_at DESC LIMIT 2

target_idとgovernor_idの実際の関係を確認してからindex利用を決定する。

## 17. 順位変動UI
Player Watchlist一覧の各プレイヤーにランキング変動を表示。

例:
個人総力  12位 → 9位  ↑3
個人撃破  45位 → 51位 ↓6
役場Lv.   8位 → 7位   ↑1

変動なしは12位 → 12位。
前回なしは9位（初回）。
順位外も圏外 → 85位、85位 → 圏外などを扱えるようにする。

## 18. 順位変動API【実装済み】
専用の別endpointは作らず、既存の GET /api/player-watchlist が summary.ranking_changes を返す方式にした。

各 ranking_changes 要素:
- board
- label
- current
- previous
- delta
- observed_at

board名・labelは既存RANKING_BOARD_LABELSをそのまま使用。新しいランキング名称は追加していない。

## 19. D1負荷対策【実装済み】
watchlist GETのランキング取得は、ログインユーザーの enabled watchlist と players の kid だけを起点にする。

ranking_snapshots側は:
- PLAYERのみ
- kid固定
- board固定
- target_id = governor_id
- boardごとの最新観測時刻をcurrent境界に使用
- target playerのcurrent/previousだけを相関サブクエリで取得

広範囲の ranking_snapshots SELECT は復活させていない。
全ranking_snapshotsから最新100/1000/5000件を取る方式は禁止。
専用endpointや追加pollingも増やしていない。

## 20. 次のロードマップ
DONE: Player Watchlist → ランキング順位変動
NEXT: 戦力/役場/同盟等の変更表示
THEN: 通知ON/OFF
THEN: Discord通知
THEN: Group/Workspace
THEN: 共有監視最適化 / R2長期アーカイブ等

## 21. Discord通知
基本は監視対象のみ通知。
将来設定できる対象:
- 順位変動
- 戦力変動
- 同盟変更
- 座標変更
- その他Change Event

## 22. Group / Workspace
将来実装。
現在: User → Personal Watchlist → Player/Kingdom Monitor
将来: User → Personal / Group Workspace → Watchlist → Monitor

GroupにはOwner/Admin/Member、invite link/code、shared watchlistを想定。
同じ対象を複数ユーザーが監視してもMightPulse/API Pool/D1処理を重複させない共有監視へ発展させる。

## 23. Google Sheets
ADMIN/OWNER向けexport。
player section:
- profile
- alliance
- heroes
- rankings
- gov_gear

D1容量節約も目的。

## 24. Data Retention
/admin/data-retention
対象:
- api_observations_days
- player_snapshots_days
- ranking_snapshots_days
- player_rank_snapshots_days
- change_events_days
- api_pool_usage_days

現在UIに推奨初期値としてAPI14日、player90日、ranking180日、player ranking180日、change events2年、API Pool90日を記載。
永久保存も可能。

## 25. 過去のSQL variable問題
過去に D1_ERROR: too many SQL variables at offset 308 が発生。
大量INSERTが原因。
change_events等はchunkを約50件に分割済み。
今後大量INSERTを追加する場合も同じ問題を起こさない。

## 26. UI方針
- iPhone Safari優先
- dark EagleEye基調
- card UI
- 大きめのタップ領域
- mobile overflowを避ける
- 数値は必要箇所でK/M/B表示
- 同盟略称などは既存仕様に合わせる
- Kingshot日本語ゲーム用語を優先
- Town Center = 役場
- Governor Charm等も既に決めた日本語用語を維持

## 27. 開発ルール
「実装して」と言われた場合は説明だけで終わらない。
1. GitHub current codeを確認
2. 関連schema/functionを読む
3. 実装
4. commit
5. commit hashを報告

既存機能を不用意に壊さない。特にAPI Pool、D1、Diagnostics、Discord OAuth、Player Profile、Kingdom Watchlist。

D1では「取れるから取る」クエリを禁止。必要な対象・期間・列だけ読む。

本番Cloudflareを実際に確認していない場合は「コード上は実装済み」「deploy後の本番確認は未実施」を区別する。

## 28. 新スレッド開始時の確認項目
まずGitHub mainを確認:
1. 最新commit
2. src/index.js
3. migrations/0012_player_watchlist.sql
4. ranking_snapshots schemaと保存処理
5. change_events schemaと保存処理
6. Player Watchlist API
7. Player Watchlist UI
8. RANKING_BOARD_LABELS
9. 最新diagnostics / D1 optimization

その後、Player Watchlistの「前回何位 → 今回何位」の実装から継続する。

## 29. 重要コミット
- 17852cca254dc644d0493967e1d6e76fdc6cd03f : D1 read optimization
- 6134fdab4028a0b1466eb222046b67dd1f0d97e7 : migration 0011 indexes
- ea06a404e0993d30e75caba3c7a7ada592f30c00 : runtime indexes
- 8b807e55a501e397ff58e9371e35ee952025e182 : unused broad ranking query removal
- c046df8dc284223b37b259630f2042b865374291 : watchlist ranking player links
- 1c13ddc3b940e7ade760cded01674ebf4181c208 : diagnostic severity
- 32caa5cdd46deaf2343202c93cdb010dfaf84ad4 : critical red status
- 2bbd614ce4f7fd88a7cc2d306d56ada563fa0142 : public status
- 609162592b0ec92563cb5b0da17ccc052a6112e8 : async syntax fix
- e88fdcd28c99ff3fd0ecc445b771d90da15dd6f6 : renderHome async fix
- 32a915dcbc04bf718fe28a27a7d0edf15b64715d : Response double-wrap fix
- af07299e12895703bc9d260fc08664f988bc2029 : auth D1 degradation
- bcee1df2dbedfacb1af27505b2f17e0f121f7b20 : diagnostics links
- 8f953637bb16244c4a5c51d721479e2f02964cf6 : future Group/Workspace
- f280d2e12f9421e09e4a885c6f4c0a6b301d6527 : personal Player Watchlist

## 30. 最重要
EagleEyeを最初から設計し直さない。
このhandoffと最新mainを基準に、実装済みのPlayer Watchlist順位変動を維持し、次は「戦力/役場/同盟等の変更表示」へ進む。

## 31. 2026-09-27追加：D1実測・広告運営方針

今後の運営方針として、EagleEyeは原則無料利用を維持し、まずは最低限の広告で運営費を賄う方向を検討する。現時点では月額課金を前提にしない。

MightPulse APIはEagleEyeにとってAPI利用料の主要コストではなく無料利用を前提とする。ただしAPIキーごとのrate/day制限とAPI Pool容量は引き続き管理する。

D1無料枠を超えた場合はCloudflare Paidへの移行を候補とする。Paid化してもアプリケーションを作り直さず継続できる構造を維持する。

広告は「最大収益化」ではなく「サービス維持に必要な最低限」を目標とする。広告過多によるUX悪化を避ける。

明日D1制限解除後に、以下を実測する:
- D1 rows_read
- D1 rows_written
- Workers request/CPU
- MightPulse API request数
- Kingdom Watchlistの1回あたり負荷
- Player Watchlistの1回あたり負荷
- 両Watchlist併用時の負荷

LIGHT / NORMAL / HEAVYの利用シナリオを作り、10〜10,000ユーザー規模でFree/Paidの負荷をシミュレーションする。

さらに月間PV・広告表示数・広告RPMを使って広告収益をシミュレーションし、「必要最低限の広告量」を逆算する。

詳細な計測項目・シナリオ・計算方法は:
docs/EAGLEEYE_COST_AND_AD_MONITORING_PLAN.md

この計画は実測前の方針であり、実測値・本番値とは区別する。


## 32. 2026-09-27追加：MightPulse Probe【実装済み】

### 目的
MightPulseの `cached_at` を「元データの観測時刻」とみなしてよいかを推測ではなく実測で検証するためのADMIN/OWNER専用診断機能。

公式APIドキュメントではPlayerレスポンスに `fresh`, `cached_at`, `age_seconds` があること、Player/Allianceのレスポンスが最大60分古い場合があることは確認できる。しかし `cached_at` が「ゲーム側の元データ観測時刻」を意味するとは明記されていない。そのため、EagleEye側で意味を確定させるまで `cached_at` を `source_observed_at` と同一視しない。

### 実装
- ADMIN/OWNER専用ページ: `/admin/mightpulse-probe`
- API: `/api/admin/mightpulse-probe`
- API Pool経由でMightPulseへアクセス
- APIキー本体は表示・保存しない
- 生レスポンスも保存しない
- Probe履歴はブラウザのlocalStorageのみ
- D1へのProbe専用保存は行わない

### 調査対象
1. Player `include=base`
2. Player `include=base,ranks`
3. Player `include=base,heroes,ranks,gov_gear`
4. Kingdom
5. Kingdom Ranking

### Probeで取得する情報
- EagleEye request start
- EagleEye response received
- elapsed_ms
- HTTP status
- `fresh`
- `cached_at`
- `age_seconds`
- HTTP headers:
  - Date
  - Age
  - ETag
  - Last-Modified
  - Cache-Control
  - Expires
  - CF-Cache-Status
  - CF-Ray
  - X-Cache
  - Via
  - rate-limit remaining
- payload top-level keys
- timestamp-like fieldsを再帰的に抽出
- response SHA-256
- 主要sectionごとのSHA-256

### 実験手順
同一Player・同一includeを固定して、T0 / T+30秒 / T+60秒 / T+120秒程度で同じProbeを繰り返す。

観察ポイント:
- `cached_at` が固定されたまま `age_seconds` だけ増える
- `cached_at` がリクエスト時刻に追従する
- response hashが変化したのに `cached_at` が変化しない
- `Date` / `Age` / `Last-Modified` 等のHTTPヘッダーが存在するか
- `last_active_at` 等、payload内部に実際の時刻候補が存在するか
- includeを変えたとき `cached_at` / `age_seconds` / section hash がどう変化するか

### 判定ルール
確実な時刻:
- `eagleeye_observed_at`: EagleEyeがレスポンスを受信した時刻

意味未確定:
- `mightpulse_cached_at`: MightPulseの `cached_at`
- `mightpulse_age_seconds`: MightPulseの `age_seconds`

検証後にのみ設定:
- `source_observed_at`: 元データの観測時刻として意味を確認できたフィールド

**重要:** Probeの結果が出るまではUIの「MightPulseデータ基準時刻」表示に `cached_at` を使う根拠がない。必要なら次の実装でこの表示を一旦「MightPulse cached_at」へ変更する。


## 33. 2026-09-27追加：ランキングCurrent化 / D1負荷削減の最新状態

今回、ランキングを「毎回全件保存」から「current state + change history」へ分離する実装を進めた。

### 新テーブル
- `kingdom_ranking_current`: 現在ランキング状態
- `kingdom_ranking_board_state`: boardごとの最終チェック時刻・件数

`kingdom_ranking_current`には `previous_rank` を追加し、更新時に直前rankを保持する。

### 保存ルール
- 変化なし: board_stateのlast_checked_atのみ更新。大量Snapshot INSERTはしない。
- 変化あり: changed rowだけcurrentをUPSERTし、ranking_snapshotsへ変更履歴を保存。
- Top100脱落: currentからDELETE。
- 再ランクイン: currentへINSERT。

### Read削減
Player Watchlistのランキング取得を、過去の `ranking_snapshots` に対する複数相関サブクエリから、
`kingdom_ranking_current` + `kingdom_ranking_board_state` の直接JOINへ変更。

`getLatestPlayerHeroRankings()` も `ranking_snapshots` のwindow functionを廃止し、`kingdom_ranking_current` を直接参照する方式へ変更済み。

### 関連最新コミット
- `a2ff2238bb545a5e9e3d8df417ca01ddf537bd73` — Read hero rankings from current ranking state
- `c6da4746dbe97b01ad56fd76d5ffbf787e6c7446` — Use current ranking state for hero ranking reads
- `9babf6de1bfa5bb2ea88ee54823f8e3bea8fda67` — Track previous ranking position in current state
- `f1c237de24350ca34effbd000ec48896d5f3d4fd` — Avoid ranking history scans in player watchlist reads
- `c8b0e90022cf912389b8663f97a5de8b1dbe708f` — Use current ranking state for admin reads and refreshes
- `b6ab1887326bebfa77ed0e418b67fdbb99969035` — Preserve original ranking positions in delta snapshots
- `bdadc29c7d7a51826791255842c0dd1451dbf8ad` — Use current ranking state and show last check time
- `d5c8edb20e842b49fa68b4b9578f787c367ef64a` — Separate current ranking state from change snapshots

### Cloudflare監視
`src/cloudflare-analytics.js` とstatus UIに以下を追加済み:
- D1 Rows Read / Written / Storage
- D1 Query Insights
- 上位Read SQL
- 上位Write SQL
- Workers Requests
- Workers CPU P99 / Subrequestsの近似的な制限監視
- R2 Class A / Class B / Storage

関連コミット:
- `ec3b55b49cd2883a7db27bc6f0ce69eff9aab605`
- `e1c7787e41871e24085f21683bca599abe45ce1c`
- `ac7c6369afdde25624f4712f9fcd654d65352467`
- `ad3e0f170000e5a92a71671d5a0962e468dd1adf`

### 2026-09-27の実測
日付変更後まもないCloudflare画面で、D1 Rows Read約51.8%、Rows Written 100%、Storage約0.2%を確認。D1 Query Insightsは76 queries。
以前のWrite InsightsではTotal Rows Written約111,478、Ranking Snapshot約95,850（約86%）。

### 現時点の削減予測（未実測）
- Ranking Snapshot由来Write: 約90〜99%削減余地
- D1全体Write: 約80〜90%削減可能性
- D1全体Read: 約30〜70%削減可能性

上記はあくまで予測。明日のD1制限解除後、変更前後のAnalytics実測値で確定する。

### 2026-09-27追加：旧ranking履歴走査関数の整理

現行フローでは使用されていなかった以下の旧関数を src/ranking-store.js から削除した:
- detectRankingChangesForBoards()
- detectRankingChanges()

どちらも ranking_snapshots を広範囲に走査する旧方式を前提としていたため、current state方式との混在・誤再利用を防ぐ目的で整理。
履歴表示用の getRankingHistory() は維持する。

関連コミット:
- 02b3fd3e054eb04f71d3e694c8ed6ba6f2651137 — refactor: remove legacy ranking history scans

### 2026-09-27追加：Player Watchlistの戦力・役場・同盟変更表示

Player Watchlist APIのsummaryに以下を追加:
- power_change（既存）
- town_center_change
- alliance_change

change_eventsからログインユーザーのenabled watch対象だけを対象に、最新のTOWN_CENTER_CHANGED / ALLIANCE_CHANGEDを取得する。
UIの「前回からの変化」に戦力・役場・同盟を表示し、既存のランキング順位変動表示と併用する。

関連コミット:
- a71f6c0fc5cd730b5cfe6c6fd1b0d3bc05610982 — feat: show player watchlist field changes

### 2026-09-27追加：MightPulse Probe比較分析

Probe画面を、単発結果の表示だけでなく同一対象・同一Probe種別の過去結果との比較にも対応。
比較する主な項目:
- cached_atの変化
- age_secondsの変化
- response SHA-256の変化
- Probe間の経過時間

画面上では、cached_at固定＋age_seconds増加、cached_at変化、レスポンス変化なし等の観測パターンを「可能性」として整理する。
これはcached_atの意味を断定するものではなく、source_observed_at採用判断のための観測補助。

関連コミット:
- 5e02be7b4d3dc7b6ef668892fe4d7d666ca8c590 — feat: add MightPulse Probe comparison analysis

### 未確認 / 次にやること
1. D1が書ける状態で自動デプロイ後のWatchlist実動作確認。
2. 変化なし時にlast_checked_atだけ更新されること。
3. changed rowsだけcurrent/Snapshotへ保存されること。
4. previous_rankが正しいこと。
5. Top100脱落・再ランクインの整合性。
6. D1 Read/Write削減率をAnalyticsで実測。
7. `ranking-store.js` の `detectRankingChangesForBoards()` / `detectRankingChanges()` が現行フローで未使用か呼び出し元を確認。未使用なら旧Read処理として整理候補。
8. `getRankingHistory()` は履歴表示用途なので基本的に残す。

### 次スレッドでの開始文
「GitHubの `docs/EAGLEEYE_HANDOFF_2026-09-27.md` を読んで、最新mainも確認してEagleEye開発を続けて。」


## 34. 2026-09-27追加：MightPulse Research Lab

今回の研究構想に対応し、MightPulseの公開仕様にない可能性があるPlayer APIの追加include候補を正規のAPI Pool経由で検証するADMIN/OWNER専用Research Labを追加。

- UI: /admin/mightpulse-research
- API: /api/admin/mightpulse-research
- 実装: src/mightpulse-research.js
- 候補: pet, pets, mail, messages, inbox, record, records, battle, battles, battle_report, battle_reports, combat, combat_report, combat_reports, report, reports, event, events, history, activity
- 方式: /players/{governor_id}?include=base,<candidate> を1候補ずつ検証
- 保存: 研究結果・生レスポンスはD1へ保存しない。API Pool利用履歴のみ既存機構で記録。
- セキュリティ: APIキー本体・生レスポンスはUIに表示しない。認証回避やアクセス制御突破は行わない。
- 「全候補を調査」は最大20 API requestsを順番に実行するため、rate/day制限を考慮してADMIN/OWNERの明示操作のみ。

調査目的は「Battle Reportという名前のEndpointを探す」だけではなく、Mail / Record / Combat / Event等の別データモデルとしてBattle情報が返る可能性を確認すること。公開APIドキュメント上は現時点でPlayer/Alliance/Kingdom/Ranking系が明示されており、Battle Report/Mail系Endpointは掲載されていない。一方、MightPulse Web UIにはPlayerの「Record」タブが存在するため、公開APIと内部Webデータモデルの差分は今後も研究対象とする。

関連コミット:
- 810267dc574ddcbaae429b5ca84f7ec435daf146 — feat: add MightPulse research candidate probe
- 82d500c751baa3d00af90fd08c099526dbbf733a — feat: add MightPulse Research Lab
- e21d005aeb5d62172ee7afb921fd10f1aec5d1f0 — fix: compare MightPulse Probe with prior result


## 35. 2026-09-27追加：D1 / R2データアーキテクチャ検討【次スレッドの本丸】

今回の次スレッドでは、EagleEye本体のD1/R2データ保管設計を正式に固める。

### 基本方針

現時点の方向性:

```
MightPulse
   ↓
API Pool
   ↓
EagleEye
   ├── D1 = operational database
   └── R2 = long-term data archive / data lake
```

これは方向性であり、最終確定設計ではない。
次スレッドでは、既存コード・schema・保存/読込処理を棚卸しした上で最終決定する。

### D1の役割

D1は「現在のEagleEyeが認証・判断・表示・監視するために必要なデータ」を保持する。

候補:
- users / sessions / auth
- roles / permissions
- API Pool state / health
- Player current state
- kingdom_ranking_current
- kingdom_ranking_board_state
- 最新player ranking state
- player_watchlists
- kingdom_watchlists
- Group / Workspace
- notification settings
- 直近Change Events
- 最新API observations
- diagnosticsに必要なoperational state

D1を長期履歴の倉庫にはしない。

### R2の役割

R2は「大量・長期・履歴・アーカイブ」を担当する方向。

候補:
- ranking history
- player snapshots
- player rank snapshots
- 古いchange events
- API observationsの長期履歴
- analytics dataset
- 長期export source
- 必要に応じたraw / normalized archive

基本概念:

```
D1 = Operational Database
R2 = Data Lake / Archive
```

### 重要な考え方

現在のランキング最適化で採用した:

```
CURRENT → D1
HISTORY → archive候補
```

という分離を、他の大量履歴データにも適用する。

ただし、直近履歴をUIで頻繁に読むデータまで即R2へ移すとは限らない。

想定:

```
Hot History → D1
Cold History → R2
```

### 現在のD1問題

2026-09-27時点でD1 free-tier daily row read limitに到達した。

代表エラー:

`D1_ERROR: Your account has exceeded D1's free tier daily row read limit...`

保存データが消えたわけではなく、row read上限による読み取り失敗。

日次リセット:
- 00:00 UTC
- 日本時間09:00

Paid化は可能だが、先にD1 read/write構造を最適化する。

### 過去の実測

Cloudflare Analyticsで確認した値:

- D1 Rows Read 約51.8%
- D1 Rows Written 100%
- D1 Storage 約0.2%
- D1 Query Insights 76 queries
- Total Rows Written 約111,478
- Ranking Snapshot 約95,850
- Ranking SnapshotだけでWriteの約86%

したがって、現時点の主要課題は単純なStorage容量ではなく、**D1 row read / write operation**。

### 現在の削減予測

まだ変更後の実測ではない。

予測:
- Ranking Snapshot由来Write: 約90〜99%削減余地
- D1全体Write: 約80〜90%削減可能性
- D1全体Read: 約30〜70%削減可能性

D1復旧後にAnalyticsで実測し、予測値を確定値へ更新する。

### R2移行候補

優先的に検討:

1. ranking_snapshotsの古い履歴
2. player_snapshots
3. player_rank_snapshots
4. 古いchange_events
5. api_observationsの長期履歴
6. 将来のanalytics dataset

現在のcurrent stateはD1に残す。

### ranking_snapshots

現在の列例:
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

ランキングは既に、
「毎回全件保存」
から
「current state + change history」
へ移行済み。

新テーブル:
- kingdom_ranking_current
- kingdom_ranking_board_state

保存ルール:
- 変化なし → board_stateのlast_checked_atのみ更新
- 変化あり → changed rowだけcurrent UPSERT + ranking_snapshots history
- Top100脱落 → current DELETE
- 再ランクイン → current INSERT

R2移行は、このcurrent化によるD1 write削減を確認してから設計・実装する。

### Change Events

現在のtype:
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

方向性:
- 直近の監視/通知用 → D1
- 古い長期履歴 → R2

Data Retention UIの現在の「change events 2年」等はR2設計確定前の暫定値として扱う。

### Player Snapshots

主な履歴系:
- player_snapshots
- player_rank_snapshots

既存index:
- idx_player_snapshots_governor_history
- idx_player_rank_snapshots_governor_history

これらはR2 archive候補。

Player History UIのために必要な直近期間をD1へ残し、それ以前をR2へ移すhot/cold方式を検討する。

### API Observations

候補:

D1:
- 最新観測
- diagnostics
- current freshness
- Watchlist判断に必要な情報

R2:
- 長期API observation
- 長期分析
- 監査/検証用履歴

raw responseをR2へ保存するかは未決定。
「取得できるから全部保存」は禁止。

### R2保存形式

未決定。次スレッドで比較する:

- JSON
- JSONL
- JSON.gz
- Parquet
- raw response + normalized index

判断軸:
- Cloudflare Workersからの読み出し
- archive書き込みコスト
- 圧縮率
- 将来Analytics
- 復元性
- デバッグ容易性
- object数

## 38. 2026-09-28追加：永久保存層 / EagleEye Library 構想【将来アーキテクチャ】

今回、D1/R2の先にある長期保存と研究利用の構想を正式に追加する。

### 基本思想

EagleEyeの現役運用データと、研究のための永久保存データを同じ場所に抱え続けない。

想定する大枠:

```
MightPulse
   ↓
API Pool
   ↓
EagleEye
   ├── D1 = Operational / Current / Hot History
   └── R2 = Archive / Data Lake
                ↓
          Permanent Archive
                ↓
          EagleEye Library
           ├── Research Lab
           ├── JARVIS / ChatGPT
           └── 将来の別研究プロジェクト
```

### 永久保存層

R2よりさらにデータを逃がし、EagleEye本体の運用寿命やD1/R2の容量・料金事情から切り離した長期保存層を将来的に設ける。

重要方針:
- 原則として取得済みの価値ある履歴データを永久保存する。
- 「永久保存」はD1に永久保持する意味ではない。
- EagleEyeの現在状態と長期原本を分離する。
- 将来サービスや保存先を変更しても再利用できる標準的なデータ形式を優先する。
- 保存先の無料性は保証ではなく、将来有料化・仕様変更してもデータを移行できることを優先する。

### Google Sheets / Google Driveの役割

Google Sheetsを永久保存庫そのものにはしない。

理由:
- 1ファイルのセル数制限がある。
- 大量履歴をDBとして検索する用途に向かない。
- APIクォータがある。
- Googleの無料サービス仕様を「永遠に無料」と仮定できない。

一方で、Google Driveは永久保存層の候補として検討する。

想定:
- 原本: Google Drive等へ圧縮NDJSON / JSONL / 将来的にParquet等で保存。
- Google Sheets: 人間向けのLibrary Index（図書目録）として利用。

つまり:

```
Google Drive = 本そのもの / 書庫
Google Sheets = 図書目録
Library API = 司書
Research Lab = 研究者
```

### Library Index

「Library Index」は既存の外部サービス名ではない。
EagleEye側で作る「永久保存資料がどこにあり、何のデータなのか」を管理する目録を指す。

Google Sheetsを初期実装候補とするが、将来SQLite/D1/JSON等へ置き換え可能な疎結合設計にする。

例:
- dataset_id
- data_type
- period
- kingdom / target
- description
- format
- archive_location
- file/object identifier
- schema version
- checksum/hash
- record count
- created/archive timestamp

### Library API

Library APIは既存サービスではなく、将来EagleEye側で開発する自作の読み取りAPI。

目的:
- 永久保存データを研究者が直接ストレージ操作せず利用できるようにする。
- Library Indexから資料を検索する。
- 必要なデータセットだけ取得する。
- 権限・アクセス範囲を制御する。
- 将来保存先をGoogle Driveから別ストレージへ移しても利用者側の仕様を極力変えない。

重要:
- ChatGPT / Research LabからGoogle Drive全体を直接見せる構造にはしない。
- Library APIを境界として設ける。
- R2を検索DBとして全件scanする設計にはしない。

### Research Labとの関係

Research LabはLibraryの唯一の利用者ではない。

Libraryは将来的に、
- MightPulse Research Lab
- JARVIS / ChatGPT
- 将来追加される研究プロジェクト
が必要な資料を取りに来られる共通研究資料基盤とする。

Research Labは「図書館を利用する研究者」であり、永久保存データそのものを所有する役割ではない。

### EagleEye / Gateway / Libraryの分離

将来的には少なくとも以下を論理分離する。

```
EagleEye Gateway
  → 現在のSystem Status / Diagnostics / 必要な現在データ

Library API
  → 過去の永久保存資料 / 研究資料
```

ChatGPTが現在状態を見る場合はEagleEye Gatewayを使い、過去データを研究する場合はLibrary APIを使う。

### コスト原則

「研究のためにEagleEyeのD1/R2へデータを二重保存し続ける」ことを避ける。

また、永久保存層へ逃がしたデータをResearch Lab専用に複製しない。
一度保存した資料を共通Libraryから必要な研究者が参照する。

### 39. 2026-09-28追加：直近の実装判断 — System Log取得API

上記の将来構想を前提として、現在は永久保存層やLibrary APIを先に実装しない。

**直近で実装対象とするのは、ChatGPTからEagleEyeのSystem Status / Diagnostics等を読み取るためのRead-Only Gateway API。**

理由:
- 現在の運用でシステムログ・状態をChatGPTが直接確認できる必要がある。
- 将来のResearch Lab / Library構想とは役割が異なる。
- 現在データと過去研究資料の境界を最初から明確にできる。
- 後からLibrary APIへ拡張できるよう、API境界・認証・レスポンス形式を最初から分離する。

### Gateway APIの基本方針

- Read-only。
- D1/R2/API Poolのwrite操作を提供しない。
- MightPulse API keyを返さない。
- session secret / Discord OAuth secret / Cloudflare secretを返さない。
- 生のAPIキーや認証情報をレスポンスに含めない。
- System Status / Diagnostics / resource usage等、必要な運用情報だけ正規化して返す。
- ChatGPTからのオンデマンド取得を基本とし、不要な常時pollingを作らない。
- 専用のサーバー間認証（例: Cloudflare Secretに保存するread-only token）を候補とする。
- 実装時は既存のgetCloudflareD1Usage等を再利用し、同じ情報を別経路で二重計算しない。

### 将来拡張

V1:
```
ChatGPT
  ↓
EagleEye Read-Only Gateway
  ↓
System Status / Diagnostics
```

将来:
```
ChatGPT
  ├─ EagleEye Gateway → 現在状態
  └─ Library API      → 過去資料 / 研究資料
```

さらに将来、Library APIにResearch用データセット検索・取得を追加する。
この拡張を前提にするが、現時点では研究データの大量取得APIを作らない。

### 絶対ルール

1. LibraryはResearch Lab専用にしない。
2. 永久保存原本をGoogle Sheetsのセルだけで管理しない。
3. Sheetsは初期Library Index候補として使い、原本保存とは分離する。
4. 永久保存層の「無料永久」を保証事項として扱わない。
5. 保存形式は将来移行できる標準形式を優先する。
6. EagleEyeの現在状態取得APIとLibraryの過去資料APIを分離する。
7. ChatGPTにD1/R2への直接フルアクセスを与えない。
8. 研究用の複製・常時pollingでEagleEyeの無料枠を不必要に消費しない。
9. 直近はSystem Log取得Read-Only Gateway APIを先に実装する。
10. 永久保存層・Library APIは、このGatewayと将来接続できる境界を最初から設計しておく。

## 40. 2026-09-28追加：System Status拡張方針と直近実測【次スレッド開始時に必ず確認】

### 40-1. System Statusの方針
現行の `/status` を、EagleEye全体の運用状況を一枚で把握できる「System Status / Operations Control Tower」として拡張する。

ユーザー判断:
- Cloudflareの詳細Usage等は、これまで通り画面スクリーンショットを取得してユーザー側でPDF化する。
- EagleEye側でサーバーサイドPDF生成機能は実装しない。
- Status画面のPDF化専用機能・印刷専用UIは今回の実装対象外。

### 40-2. System Statusに追加する情報
既存のCloudflare Resource / Query Insights / Diagnosticsを維持しつつ、以下を追加する方針。

1. API Pool Health
   - Pool type別: SYSTEM_GENERAL / SYSTEM_WATCHLIST / USER_CONTRIBUTED
   - AVAILABLE / COOLDOWN / ERROR / DISABLED / REVOKED の状態数
   - AVAILABLEキー数 / 総キー数
   - ACTIVE lease数
   - 直近キーの状態
   - 直近エラー情報
   - APIキー本体・encrypted_key・secretは絶対に表示しない

2. MightPulse
   - Diagnostics上のMightPulse状態
   - 直近イベント
   - エラーコード等の運用情報
   - APIキーや生レスポンスは表示しない

3. 王国Watchlist
   - 登録数
   - 有効監視数
   - 有効監視のlast_error件数
   - 最新Watchlist Jobのstatus
   - 最新jobの更新時刻
   - ranking/player処理行数
   - 最新job error
   - 監視対象0件なら「監視なし」と表示
   - 削除済みWatchlistの過去ログだけを見て現在Watchlistが稼働中と誤認しない

4. Database
   - D1状態
   - D1 Storage等の詳細は既存Cloudflare Resource表示を利用
   - D1を長期履歴倉庫として扱わない

5. R2 Archive
   - ARCHIVE bindingの有無
   - eagleeye-archiveの運用状態
   - 現在のアーカイブ対象テーブル
   - R2使用量等は既存Cloudflare Analytics表示を利用
   - R2を検索DBとして全件scanしない

6. Google連携
   - Google Sheets設定有無
   - Apps Script Web App方式 / Service Account方式の設定状態
   - secret値そのものは表示しない
   - Google Drive永久保存層はまだ実装しない

7. Runtime / Cron
   - Worker
   - Cron設定
   - Retention実行方針
   - 実際に取得できない値を「実行成功」と断定しない
   - コード上の設定値と本番実測値を分ける

### 40-3. 全体状態判定
API Poolがキー登録済みなのにAVAILABLE=0の場合、System Status全体を障害側へ寄せる候補とする。
Watchlistに有効監視が存在しlast_errorが残っている場合は注意状態へ寄せる。

ただし、過去のdiagnostic error・削除済みWatchlistの古いerror・以前のAPI Pool errorだけを理由に「現在障害中」と断定しない。「現在状態」と「過去イベント」を分離する。

### 40-4. D1負荷への注意
`/status` は自動更新ページなので追加D1 queryを増やしすぎない。
- per-key queryを大量発行しない
- 可能なら集約queryで取得
- ranking_snapshotsを読む必要なし
- Watchlist status確認のためranking historyを読まない

D1 DiagnosticsはD1内のdiagnostic_events、Cloudflare resource usageはCloudflare GraphQL Analyticsから取得する。

### 40-5. 直近のAPI Pool実測【重要】
ユーザーが実際のEagleEye API Poolを画面から確認したところ、登録キー2本に対してAVAILABLEが0本で、API Poolでエラーが発生していた。

その後、ユーザーが手動更新を行い、登録されている2本のキーをAVAILABLEへ復旧する作業を実施した。

重要な運用上の発見:
- API Poolが存在するだけではWatchlistが動くとは限らない。
- AVAILABLE数をSystem Statusで直接確認できる価値がある。
- Watchlistの `NO_API_POOL_KEY_AVAILABLE` は、実際にAVAILABLEキーが0本だった状態と整合する可能性がある。
- ただし過去ログだけから現在も障害中とは判断しない。
- 復旧後の新しい診断ログを基準に現在状態を判断する。

### 40-6. 次スレッドで取得する新規ログ
直前ログ取得から約12分経過し、その間に行った操作はAPI Poolの2キー手動復旧のみ。

次スレッド開始時に**新しいSystem Status / Diagnosticsログを取得する価値が高い**。

理由:
1. 復旧前のAVAILABLE=0 / ERROR状態と復旧後を分離できる。
2. 復旧操作による新規diagnostic event / API Pool usage / lease状態の変化を確認できる。
3. Watchlist削除後に新しいWatchlist処理が走っていないことを確認できる。
4. D1復旧後の実測ベースラインとして使える。
5. 約12分なので「復旧操作だけを行った直後の差分」としてノイズが少ない。

新スレッドでは、ユーザーが取得した新規ログ/スクリーンショット/PDFを受け取り、**前回ログ → 約12分後 → API Pool 2キー手動復旧後**の差分として読む。

### 40-7. 今回の実装作業について
System Status拡張の実装作業を開始したが、このスレッド終了時点で本番デプロイ・本番確認は行っていない。

追加ファイル:
- `src/status-ops.js`
  - API Pool / Watchlist operational statusを集約する読み取り処理
  - API Pool key本体は返さない
  - Pool type/status集計
  - active lease数
  - Watchlist件数/有効数/error数/latest job
  - latest API Pool key health

`src/index.js` にSystem Status拡張を接続する変更作業も開始済み。
**次スレッド開始時には必ずmainの最新commitと実ファイルを確認し、途中実装が完全にコミット済みか、本番デプロイ済みかを推測しないこと。**

「実装済み」「GitHub mainにcommit済み」「本番deploy済み」「本番画面で確認済み」は別物。本番確認していないものを確認済みと言わない。不要な再デプロイを繰り返さない。

### 40-8. 次スレッド開始手順
1. このhandoffを読む。
2. GitHub `main` の最新commitを取得する。
3. `src/status-ops.js` の存在と内容を確認する。
4. `src/index.js` のSystem Status変更を確認する。
5. 直近commit履歴から途中実装/未commit/既commitを区別する。
6. ユーザーから新規取得したSystem Status / Diagnosticsログを読む。
7. 前回ログと比較してAPI Pool 2キー復旧後の実測差分を確認する。
8. 必要ならAPI Pool管理画面も再確認する。
9. System Status拡張を完成させる。
10. 完成後にcommit hashを報告する。
11. deployは必要な段階で行い、本番確認は実際に確認できた場合だけ報告する。

### 40-9. D1 Query Insights専用セクションは追加しない
ユーザー判断により、Status画面に新しい専用のD1 Query Insightsセクションを追加する必要はない。既存のCloudflare Resource / Query Insights表示を利用する。
ユーザーはCloudflare画面をスクリーンショットからPDF化して渡す運用を継続する。

### 40-10. Research Labとの分離
今回のAPI Pool実測はEagleEye本体の運用状態確認であり、MightPulse Research Labとは別目的。
- EagleEye API Pool = 本番サービス運用
- MightPulse Research Lab = ADMIN/OWNERが明示的に実行する研究
- Research結果をoperational statusに混ぜない
- System Status自動更新から研究目的の追加API requestを発生させない
- System Statusはread-only観測画面として維持する

### 40-11. 次スレッドの優先順位
最優先:
A. 新規ログ取得後のAPI Pool復旧状態の実測確認
B. System Status拡張の途中実装をmain基準で整理
C. API Pool Health表示の完成
D. Watchlist / MightPulse / R2 / Google / Runtime statusの完成
E. 本番deploy後の実機確認

その後:
F. D1 reset後の実測値取得
G. D1 read/write削減率の確定
H. R2/D1 archive設計の確定
I. 永久保存層 / EagleEye Library設計
J. ChatGPT / JARVISからのLibrary利用設計

## 41. 2026-09-28追加：ウォッチリスト上限実装とD1 Rows Written実測【次スレッド最優先】

### 41-1. 今回実装したウォッチリスト上限
ユーザー要望:
- 王国ウォッチリスト / プレイヤーウォッチリストをロールごとに無制限登録できる状態はD1/API負荷上危険。
- 既存の「プレイヤーデータ公開設定」に、各ロールのウォッチリスト登録上限を追加する。
- 上限は管理画面から随時変更できる仕組みにする。

実装済みコミット:
- 00387812886e11973080ac9af2e1c6cfed918144 : feat: manage watchlist limits in visibility settings API
- b0359e0dac8483f2d00717717fe96569d7905f84 : feat: add watchlist limit controls to visibility page
- 28e2d982fc82661a13998227bdf8d9074462425e : feat: add player watchlist star shortcut to rankings
- a02c5de54b68444af537a70e0754d2fc2aaf8491 : fix: enforce watchlist limits on reactivation
- 69f604a4e0f73d1a2e36ea783258b68345b39d04 : fix: repair watchlist limit settings script syntax
- 2216a9c75f9bb01ded8fd0304eb43ab2aa4ddc1c : fix: escape limit settings selector quotes
- 1ef86fba5c79aae68b61ecaed7b3b2d78b3b6dcb : fix: expose ranking watch shortcut handler
- 849b9a7f1aba6ff1fac60952f2450365b9f6543a : feat: complete watchlist limits admin controls

現在のmain最新commitは 849b9a7f1aba6ff1fac60952f2450365b9f6543a。

実装内容:
- BASIC / ADVANCED / ADMIN / OWNERごとに、王国 / プレイヤーの上限を個別設定。
- 初期値:
  - BASIC: 王国1 / プレイヤー5
  - ADVANCED: 王国3 / プレイヤー20
  - ADMIN: 王国10 / プレイヤー50
  - OWNER: 王国50 / プレイヤー200
- 管理画面から数値変更可能。
- ADMINはOWNERの設定変更不可。
- 登録時にサーバー側でも上限を強制。
- プレイヤーウォッチリストは再有効化時にも上限チェック。
- 既存登録の再利用時に不要な重複登録を避ける。
- 0は現状「無制限」として扱う仕様。D1保護を目的とするため、将来0を許可しない仕様に変更するかは別途判断。
- 王国ランキング画面からプレイヤーを☆/★でPlayer Watchlistへ追加・解除できるショートカットを追加。
- ranking APIではログインユーザーのenabled player_watchlistsだけを対象にwatched状態を付与する。広域watchlist読取ではない。

### 41-2. 重要：今回の実測ログ
ユーザーが動作確認後に取得した /status PDFおよびstatus JSONを2026-09-28 12:21 JST時点の実測資料として受領。

PDF/JSONの実測:
- D1 Rows Read: 317,266 / 5,000,000 = 6.3%
- D1 Rows Written: 52,305 / 100,000 = 52.3%
- D1 Storage: 12,984,320 bytes = 約12.4 MB / 5 GB
- Worker Requests: 393 / 100,000
- R2 Class A: 15 / 1,000,000
- R2 Class B: 386 / 10,000,000
- Watchlist: 王国watchlist 有効1 / 登録1、現在の有効監視エラー0
- 最新watchlist job: COMPLETED、ranking 2,600 / player 5

出典ファイル:
- システム状況 EagleEye(6).pdf
- status(4).json

### 41-3. D1 Query Insightsで判明したRows Writtenの主因
今回のstatus JSONのQuery Insightsでは、書き込みの大部分がランキング処理に集中している。

カテゴリ集計:
- Ranking Snapshot: 4,546 queries / Rows Written 35,976
- Other Write: 5,953 queries / Rows Written 9,542
- Watchlist Job: 1,013 queries / Rows Written 417
- API Pool: 1,147 queries / Rows Written 189
- Diagnostics: 184 queries / Rows Written 100
- Player Snapshot: 22 queries / Rows Written 20
- Player Observation: 65 queries / Rows Written 12
- Other: 735 queries / Rows Written 6
- Change Event: 16 queries / Rows Read 56 / Rows Written 0

D1全体:
- Rows Written 52,305
- Write queries 11,259
- Read queries 2,473

特に上位Write query:
1. INSERT INTO ranking_snapshots ...
   - Query count: 4,497
   - Rows Written: 35,976
   - Rows Read: 0
   - 平均的に1 queryあたり8 rows程度の書き込みとして集計されている。

2. INSERT INTO kingdom_ranking_current ... ON CONFLICT ...
   - Query count: 5,122
   - Rows Read: 2,547
   - Rows Written: 7,697

3. INSERT INTO api_leases ...
   - Query count: 329
   - Rows Written: 1,645

このため、「Writtenが跳ねる」問題は実際に存在する。Storage容量ではなく、D1 Rows Writtenの消費速度が現在の実用化上の重要課題。

### 41-4. ここでの重要な認識
現在のランキングcurrent化により、ランキング表示・現在状態については kingdom_ranking_current を読む方向へ移行している。
ただし、ランキング変更履歴として ranking_snapshots へのINSERT自体はまだ残っている。

今回の実測では、ranking_snapshots が35,976 rows writtenで、D1全体52,305 rows writtenの大部分を占めている。

したがって、次スレッドでは「current化したからWriteも十分減っている」とは考えず、実際の saveKingdomRankingBoard / ranking history保存条件をコードから再確認すること。

重要:
- ranking_snapshots の広範囲SELECTを復活させない。
- 現在表示は kingdom_ranking_current を優先。
- 履歴保存は本当に必要な変更だけになっているかを確認。
- 「変更あり」の判定粒度が細かすぎて、ほぼ毎回snapshotを保存していないか確認。
- previous_rank / current state / change_eventsとの役割重複を確認。

### 41-5. 次スレッドで最初に調査する箇所
最優先でmainの実コードを確認する。

1. saveKingdomRankingBoard() の完全な実装
   - ranking_snapshots INSERT条件
   - kingdom_ranking_current UPSERT条件
   - 変更なし時の処理
   - Top100脱落時の処理
   - 再ランクイン時の処理

2. getKingdomRankingChanges()
   - 何を「changed」と判定しているか
   - rank以外のscore/identity等の変化でsnapshot保存されていないか
   - currentとの差分判定が適切か

3. kingdom_ranking_current
   - current row数
   - previous_rankの更新頻度
   - UPSERTが本当に必要な変更時だけか

4. ranking_snapshots
   - 1回のwatchlist更新で何board × 何rowがhistory保存されるか
   - retention / archiveとの役割分担

5. change_events
   - ranking_snapshotsと重複して同じ順位変動を保持していないか

### 41-6. 実測値からの暫定評価
2026-09-28 12:21 JSTの実測では、D1 Rows Written 52.3%まで進んでいる一方、Rows Readは6.3%に留まっている。

つまり現時点では、以前の「D1 Readが最大問題」という状態から、今回のランキングcurrent化後はWrite側も独立した重要課題として実測確認する段階に入った。

ただし、この1回のログだけで1日分の最終消費量や1ユーザー/1watchlistあたりの恒常負荷を確定してはいけない。Cloudflare Analyticsには反映遅延があるため、同条件で複数回測定して基準値を作る。

### 41-7. 実用化に向けた目標
次スレッドでは、単純に「無料枠の52%だからOK」と判断しない。

見るべき指標:
- 1回の王国Watchlist更新あたり Rows Written
- 1回のPlayer取得あたり Rows Written
- API Pool 1 requestあたりのRows Written
- Diagnostics 1 eventあたりのRows Written
- Watchlist 1件 × 1 intervalあたりのRows Written
- 1日あたりのWatchlist更新回数
- ユーザー数増加時の線形/非線形増加

最終的には「Free Tierで何ユーザーまで安全に運用できるか」を実測で出す。

### 41-8. 次スレッドの優先順位
A. saveKingdomRankingBoard() と getKingdomRankingChanges() の完全確認
B. ranking_snapshots へのWriteが35,976 rowsになった理由を特定
C. 不要なhistory writeがあれば削減。ただし順位履歴機能を壊さない
D. kingdom_ranking_current / previous_rank / change_events / ranking_snapshots の責務を整理
E. 同じテスト条件で再計測
F. その後にPlayer Watchlist / Kingdom Watchlistの上限機能を実機確認

### 41-9. 絶対ルール
- 本番確認していないものを「本番確認済み」と言わない。
- D1 free-tierを守ることを最優先。
- ranking_snapshots の広域SELECTを復活させない。
- 「Write削減」のために履歴を勝手に消す・順位変動機能を壊す変更はしない。
- まず保存責務と必要性を確認してから削減する。
- D1のRows WrittenだけでなくRows Readも同時に追う。
- 既存のcurrent state設計を尊重し、全面作り直しはしない。

### 41-10. 新スレッド開始時の一言
次スレッドでは、以下から開始する:

「前スレの引き継ぎ読んで。まずmain最新を確認して、今回のstatusログでWrittenが跳ねた原因を saveKingdomRankingBoard() / getKingdomRankingChanges() から特定しよう。ranking_snapshotsの広域SELECTは絶対に復活させない。」

## 33. 2026-09-28追加：D1最小化アーキテクチャ移行開始

ユーザー方針:
- D1 free-tierを最優先し、D1は必要最低限のCurrent/Change/System Stateに統一する。
- R2をHistory/Archiveの本体にする。
- Google Driveは将来の永久保存先。
- Google Sheetsは将来のResearch/検索/Export/Index用途。
- Drive/SheetsのGoogle API連携はまだ未実装であり、後から接続できる境界を維持する。
- 既存機能を壊さないことを最優先し、履歴の読み先をR2へ切り替える前にD1の既存履歴書き込みを削除しない。

### 今回実装済み
commit:
- 8ffb08186f1b136abe881221a2247498b8e5dd8f
  feat: add lightweight player name history storage
- 377b785ba24dad53fb56ba7f7ddd2c238c1e9397
  feat: record player name history only on identity changes
- 6478aebe58a2dfc1c4ca4160a979d0dde6e887e7
  feat: expose lightweight player name history reader
- 47215fd71890b60042fd13948b90f7be6ac94255
  feat: show player name history without snapshot reads
- 37a2dd9725183ad7040dcb065e2c2190ee686461
  docs: define D1 minimum and archive migration architecture
- 0420d3a4b3d3ab86ac7f0ee3d699b6ce59ef1a54
  fix: bootstrap player name history table safely

### Player Identity History
runtime bootstrapも実装し、migrationが先に適用されていない環境でもPlayer本体の取得が壊れないようにした。履歴保存はテーブル準備後に行う。

migration:
- migrations/0014_player_identity_history.sql

table:
- player_identity_history

保存ルール:
- 初回観測時に1件作成。
- 名前が同じ再観測ではD1 writeなし。
- 名前変更時のみ旧名のlast_seen_at更新 + 新名1件追加。
- governor_idを内部の同一人物キーとして使用。
- UI/APIから過去名を確認できる。
- これはPlayer Snapshotの代替ではなく、軽量なIdentity History。

### 重要な安全措置
まだ以下は削除・停止していない:
- player_snapshots
- ranking_snapshots
- player_rank_snapshots
- api_observations

理由:
既存のPlayer History / Ranking History / API機能がこれらを参照しているため。R2 readerを先に完成させ、既存UI/APIと同等の挙動を確認してからD1 history writeを縮小する。

### 次の実装候補
1. R2 Historyの共通reader/writer境界を作る。
2. Player HistoryをR2 readerへ移行。
3. Ranking HistoryをR2 readerへ移行。
4. Player Ranking HistoryをR2 readerへ移行。
5. API raw observationのR2化。
6. 同一条件でD1 rows_read / rows_writtenを再計測。
7. その後に不要なD1 history writes/retentionを縮小。
8. 最後にGoogle Drive / Google Sheets API連携を追加。

詳細設計:
docs/EAGLEEYE_DATA_ARCHITECTURE.md

本番確認について:
- 上記はGitHub上のコード変更であり、本番Cloudflareでの動作確認をまだ意味しない。
- 本番で確認していない事項を「確認済み」と表現しない。

## 2026-09-28 D1最小化移行の追加進捗

### 今回の実装
- src/r2-archive.js
  - Ranking History の直接R2保存 archiveRankingHistoryBatch()
  - Ranking History のR2読取 listRankingHistoryFromR2()
  - Player History の直接R2保存 archivePlayerHistoryBatch()
  - Player History のR2読取 listPlayerHistoryFromR2()
- src/ranking-store.js
  - saveKingdomRankingBoard() に archiveBucket を追加。
  - 既存のD1 ranking_snapshots 保存後、同じ論理履歴をR2へ並行保存。
  - R2保存失敗は既存D1動作を壊さないため非致命。
- src/player-store.js
  - materializePlayer() に archiveBucket を追加。
  - 既存のD1 player_snapshots 保存後、同じ観測をR2へ並行保存。
  - R2保存失敗は既存D1動作を壊さないため非致命。
- src/index.js
  - Watchlist / Admin Ranking Test / Player取得経路から env.ARCHIVE を渡すよう変更。

### 重要
- この段階ではD1使用量はまだ減っていない。
- ranking_snapshots / player_snapshots のD1書込みはまだ生きている。
- 本番テストはまだ依頼しない。
- 次の目標は、R2 readerを実際の既存History API/UIと比較できる状態にしてから、D1 history writeを段階的に止めること。
- 本番確認済みとは一切扱わない。R2 dual-writeも未デプロイ・未本番確認。

### 次の実装順
1. R2 Player History readerを既存 getPlayerHistory 相当のAPI/UIへ接続可能な比較層として仕上げる。
2. R2 Ranking History readerを既存 getRankingHistory 相当へ接続可能な比較層として仕上げる。
3. Player Ranking HistoryもR2化。
4. 既存UI/APIとの出力差分を確認。
5. R2が同等結果を返せることを確認してからD1 history write削減へ進む。
6. 同一条件でD1 Rows Writtenを再計測し、そこで初めて本番テストを依頼する。

## 2026-09-28 R2履歴Reader移行ブリッジ実装

今回、R2へのdual-writeだけで止まっていたPlayer History / Ranking Historyについて、既存APIからR2を参照できる互換Readerを追加した。

### Player History
- `src/player-store.js`
  - `getPlayerHistory(db, governorId, limit, archiveBucket)` を追加。
  - D1 `player_snapshots` とR2 `history/v1/player_snapshots/...\` を取得し、`observation_id` を優先して重複排除。
  - R2読取失敗時はD1結果を維持する。
  - R2にまだ履歴が存在しない場合もD1結果を返す。
- `src/index.js`
  - `/api/player/history` が `getPlayerHistory(..., env.ARCHIVE)` を利用するよう変更。
  - 既存のrole別filterを維持。

### Ranking History
- `src/ranking-store.js`
  - `getRankingHistory(..., archiveBucket)` を拡張。
  - D1 `ranking_snapshots` とR2履歴を取得し、source observation id等で重複排除。
  - R2読取失敗時はD1結果を維持する。
- `src/index.js`
  - `/api/kingdom-watchlist/history` から `env.ARCHIVE` を渡すよう変更。

### D1最小化への位置づけ
この段階でもD1の履歴読み書きは削減していない。
これは意図的であり、先に「R2が既存D1履歴と同じ意味のデータを返せる」ことを検証するための移行ブリッジである。

次に行うこと：
1. Player History / Ranking History のR2結果とD1結果の比較確認。
2. Player Ranking HistoryについてもR2 Readerを実装。
3. APIレスポンスの互換性を確認。
4. 十分に一致した後、D1履歴書き込み停止を検討。
5. その後、同一条件でD1 Rows Writtenを再計測。
6. 初めてここで本番テストを依頼する。

重要：
- 本番デプロイ・本番動作確認はまだ行っていない。
- 「R2へ移行済み」「D1使用量が削減された」とは扱わない。
- broadな `ranking_snapshots` SELECTは追加していない。
- 現在のD1履歴SELECTは対象IDを限定した既存API互換処理のみ。

## 2026-09-28 Player Ranking History R2 Reader追加

Player Ranking History（`player_rank_snapshots`）についてもR2移行ブリッジを追加した。

- `src/r2-archive.js`
  - `archivePlayerRankHistoryBatch()`
  - `listPlayerRankHistoryFromR2()`
  - 保存先: `history/v1/player_rank_snapshots/<governorId>/<observedAt>/...`
- `src/ranking-store.js`
  - `savePlayerRankSnapshot()` にR2 dual-writeを追加。
  - `getPlayerRankHistory()` を追加。
  - D1とR2を `source_observation_id` 等で重複排除。
  - R2読取失敗時はD1をフォールバック。
- `src/index.js`
  - `/api/player/rank-history` を追加。
  - Player Ranking History APIもR2 migration bridge経由で取得可能にした。

### 現在の状態
Player History / Ranking History / Player Ranking History の3系統について、
「D1を残したままR2へdual-write → R2 Reader追加 → D1 fallback」
まで揃った。

ただし、まだD1履歴書き込みは停止していない。
また本番デプロイ・本番確認も行っていない。

次段階は、3系統のD1/R2結果を比較できる状態を前提として、
- R2の履歴意味・件数・順序・フィールド互換性を確認
- 問題がなければD1履歴書き込み停止
- D1 Rows Writtenを同一条件で再計測
へ進む。

今回もbroadな`ranking_snapshots` SELECTは追加していない。

## 2026-09-28追加：R2履歴を正本化する安全切替スイッチ

現時点では、Player History / Ranking History / Player Ranking History はR2へアーカイブしつつD1履歴も残すDUAL状態を維持している。

今回、D1履歴書き込みを安全に停止できる切替を実装した。

### HISTORY_STORAGE_MODE

`env.HISTORY_STORAGE_MODE` を以下で制御する。

- 未設定 / `DUAL`
  - 従来どおりD1履歴 + R2履歴の二重保存。
  - R2障害時も既存D1動作を維持。
- `R2_ONLY`
  - R2へのアーカイブ成功後、bulk history tableへのD1 INSERTを行わない。
  - R2アーカイブ失敗時のみD1へフォールバックして履歴消失を防ぐ。
  - 現在状態を表すD1テーブル（players / kingdom_ranking_current / board_state等）は引き続きD1へ保存。
  - 履歴APIは原則R2のみを読む。
  - R2読み出し失敗時はD1履歴へフォールバックする。

### 対象

R2_ONLY対象:
- `ranking_snapshots`
- `player_snapshots`
- `player_rank_snapshots`

対象外:
- `players`
- `kingdom_ranking_current`
- `kingdom_ranking_board_state`
- `change_events`
- `api_observations`
- API Pool / watchlist / diagnostics等の運用データ

### 重要な安全条件

R2_ONLYは「D1履歴を即削除する」方式ではない。
既存D1履歴は残したまま新規履歴書き込みだけをR2中心へ切り替える。

また、R2アーカイブ成功前にD1履歴を止めることはしない。
R2障害時にはD1へフォールバックする。

### 現在の状態

- コード実装済み
- `HISTORY_STORAGE_MODE` 未設定なら従来のDUAL動作
- 本番環境へのR2_ONLY切替は未実施
- 本番デプロイ・本番動作確認は未実施
- D1 Rows Written削減効果も未実測

### 次の手順

1. mainのコードレビュー / 構文確認
2. R2_ONLY切替を本番へ適用
3. Watchlist / Player History / Ranking History / Player Ranking Historyを実動作確認
4. Cloudflare AnalyticsでD1 Rows Written / Readを同条件比較
5. R2障害時フォールバックも確認
6. 問題がなければ旧D1履歴データの扱い（保持期間 / R2永久保存 / 削除）を別途決定

**本番で確認できていないものは確認済みとしない。**


## 2026-09-28追加：Kingdom Watchlist実機テスト中に確認した処理時間の改善候補

### 観察
王国240・TOP 5・更新間隔12時間のテスト中、Kingdom Watchlist画面でランキング取得処理に時間を要していることを確認。

画面上では、
- 「更新中：ランキング」
- 26並列中 20/26 まで進行
- 「ランキング取得 2000件」
と表示された後、ランキング処理完了からPlayer取得へ進む流れになっている。

### 改善候補
現状は、Watchlistの監視対象がTOP 5であっても、ランキング取得段階では2000件規模のデータ取得が発生している。

将来的に、MightPulse APIの仕様・取得上限・rate limit・API Poolの挙動を確認したうえで、以下を検討する。

1. **TOP N監視に必要な範囲だけ取得できる方式への最適化**
   - TOP 5監視なのに2000件取得する必要があるか確認。
   - API側で上位N件指定が可能なら活用する。
   - 不可能な場合は別の取得方式を検討する。

2. **ランキング取得後のPlayer取得待ち時間の短縮**
   - TOP N確定後に必要なPlayerだけ取得する現在フローを確認。
   - API Pool / concurrency制御が許す範囲で並列化できる箇所がないか検討。
   - D1/R2への保存処理がボトルネックになっていないかも実測する。

3. **処理時間の計測**
   - ランキング取得開始 → ランキング完了
   - TOP N確定 → Player取得開始
   - Player取得開始 → 全Player完了
   - 保存処理
   - Watchlist Job全体
   を個別に計測し、どこが実際のボトルネックかを特定する。

### 今回のテストでは変更しない
今回の240王国テストは、R2_ONLY化後のD1/R2使用量を同一条件で実測することが目的。

そのため、テスト途中では取得方式・並列数・保存処理等を変更しない。

テスト完了後にシステム状況ログを取得し、今回の処理時間とD1 Rows Written / Rows Read / R2使用量を確認する。

### 注意
これは現時点での実機画面から得た「改善候補」であり、まだ性能ボトルネックの原因を特定したものではない。

特に「ランキング取得2000件」が必ずしも2000件分のAPIレスポンスをそのままD1へ書き込んでいることを意味するわけではないため、コードと実測ログを確認してから実装変更を判断する。

**本番確認済みと表現するのは、実際に本番環境で確認した範囲のみとする。**



## 2026-09-28追加：R2_ONLYアーカイブ成功とD1履歴INSERTスキップの機械証明

R2_ONLY移行後に「R2 archive成功 → D1 history INSERT skip」が実際に通ったかを推測ではなく診断イベントで確認できるようにする。

- Kingdom ranking: saveKingdomRankingBoard() のR2アーカイブ成功時、R2_ONLYなら history_storage / ARCHIVE_R2 / SUCCESS を記録。
- 成功イベントには archiveSuccess=true、d1HistoryInsertSkipped=true、filteredRows を記録する。
- R2アーカイブ失敗時は既存の R2_ARCHIVE_FAILED、ARCHIVE binding欠落時は R2_ARCHIVE_BINDING_MISSING を記録し、D1 fallbackを明示する。
- Player snapshot / Player rank snapshot も同じ証跡を持たせる方針とする。
- この診断イベント自体のD1書き込みは「履歴データの大量INSERT」と別物だが、R2_ONLYの実証用として必要最小限に限定する。
- 本番確認では、対象処理の実行後にStatus JSON/Diagnosticsで ARCHIVE_R2 / SUCCESS と d1HistoryInsertSkipped=true を確認する。これが確認できるまで「R2移行確認済み」とは扱わない。

## 2026-09-28追加：機械取得用Status JSONを「全システム情報の集約点」として固定

### 方針
EagleEyeの機械取得用Status JSON（Gateway: `/api/gateway/v1/status`）は、今後の実測・障害切り分け・性能計測で使用する**単一の機械可読なシステム状態取得口**として扱う。

「画面には表示しているがJSONでは取得できない」「既存JSONにはあるが新機能追加時に取得項目を追加し忘れる」という状態を作らない。

### 現在取得対象
Status JSONには、少なくとも以下を常に含める。

1. **Cloudflare / D1**
   - D1 Rows Read / Written
   - Read / Write Query数
   - D1 Storage
   - Free Tier上限・使用率・状態
   - D1 Query Insights
   - Queryごとのcount / rowsRead / rowsWritten / rowsReturned / durationMs / category
   - Write/Read上位クエリ
   - カテゴリ集計

2. **Workers**
   - requests
   - errors
   - subrequests
   - CPU P50 / P90 / P99
   - requests / CPU / subrequestsの使用率・状態

3. **R2**
   - Class A / Class B / free operations
   - total / successful / failed operations
   - failed percentage
   - upload / download bytes
   - storage / payload / metadata bytes
   - object count
   - upload count
   - storage増減
   - bucket別集計
   - operation別集計
   - 月次期間
   - Free Tier使用率・状態

4. **History Storage Runtime**
   - HISTORY_STORAGE_MODE
   - DB binding有無
   - ARCHIVE binding有無
   - R2 read-only runtime probe結果
   - R2 probe error
   - R2_ONLY / DUALの実行時状態

5. **Operational Status**
   - API PoolのPool別・Status別キー数
   - AVAILABLE / COOLDOWN / ERROR / DISABLED / REVOKED
   - totalKeys / availableKeys
   - activeLeases / expiredActiveLeases
   - 直近キーの状態・成功・エラー情報
   - Kingdom Watchlistの登録数・有効数・エラー数
   - latest success / update
   - 最新Watchlist Jobのstatus / error / rankingRows / playerRows / source time

6. **Diagnostics**
   - overall
   - service別status
   - last event / error code / message / trace ID / target
   - 直近診断イベント
   - metadata
   - R2 history archive失敗を含む履歴保存系診断

7. **Runtime / Configuration Presence**
   - Worker名
   - History Storage Mode
   - DB / ARCHIVE binding
   - Cloudflare Analytics設定有無
   - R2 bucket設定有無
   - MightPulse設定有無
   - Discord設定有無
   - Google Sheets連携設定有無
   - Gateway設定有無

### セキュリティ方針
Status JSONで取得するのは**設定の有無・状態・メトリクス**であり、以下は絶対に返さない。

- API Key本体
- Bearer Token
- Secret
- Password
- Private Key
- Discord Client Secret
- Google Service Account Private Key
- その他認証情報

### 今回の実装
- `src/cloudflare-analytics.js`
  - Query Insightsの完全なquery一覧をmachine-readable payloadに保持。
  - R2 operation一覧を上位20件だけで切らず、完全なoperation groupを保持。
- `src/gateway-api.js`
  - `historyStorage` を追加。
  - R2 read-only runtime probeを追加。
  - `operational` を追加。
  - `runtime` / configuration presenceを追加。
- R2アーカイブ失敗時にはranking診断イベントとして原因を保存する。

### 今後の絶対ルール
**新機能・新しい外部サービス・新しいCloudflareリソース・新しいDBテーブル・新しいAPI Pool・新しいWatchlist・新しい保存方式・新しい性能指標を追加した場合、Status JSONにも必ず取得項目を追加する。**

実装手順としては、

1. 機能本体を実装
2. その機能の「現在状態」「成功/失敗」「使用量」「性能」「エラー」「依存Binding/外部サービス」を定義
3. Gateway Status JSONにmachine-readable項目を追加
4. 必要ならDiagnosticsにもイベント/metadataを追加
5. UIはStatus JSONの全情報のうち必要なものだけ表示してよい
6. **UIに表示していないからJSONにも不要、という判断は禁止**
7. Status JSONを取得して実測ログに残せることを確認
8. 本番確認前は「本番確認済み」と表現しない

### 重要な考え方
Status画面は「JSONの代替」ではなく、**JSONが正本、画面はJSONの表示層**とする。

したがって将来、UI側に新しい診断項目だけを追加してJSON側を忘れることがないよう、機能追加時には必ずStatus JSONの契約も同時更新する。

この方針はEagleEyeの今後の全機能追加に適用する。
