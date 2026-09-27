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
- R2 Class A/B operations

### R2 Object Key

候補:

```
players/{kid}/{governor_id}/YYYY/MM/DD/{timestamp}.json.gz

ranking/{kid}/{board}/YYYY/MM/DD/{timestamp}.json.gz

change-events/{kid}/{governor_id}/YYYY/MM/DD/{timestamp}.json.gz

api-observations/{target_type}/{target_id}/YYYY/MM/DD/{timestamp}.json.gz
```

またはpartition方式:

```
ranking/kid=123/board=power/date=2026-09-27/part-001.jsonl.gz
```

最終方式は未決定。

### Archive方式

比較対象:

#### A. Write-through
取得時にD1 + R2へ同時保存。

問題:
- R2 writeが毎回発生
- エラー処理複雑化

#### B. D1 hot → 定期archive
一定期間D1へ保持し、古いデータをR2へ移動。

#### C. Queue / Cron archive
Workers Cron / Queue / Scheduled Job等で古いD1データをR2へ移動。

現時点ではB/Cを有力候補として検討する。

### D1→R2削除順序

必ず:

```
D1
 ↓
archive job
 ↓
R2 write成功
 ↓
R2 object確認 / checksum等
 ↓
D1 DELETE
```

R2保存成功前にD1を削除しない。

一時的な二重保存は許容する。

### R2を検索DBにしない

R2へ移した後に、

「R2内の全オブジェクトをscanして履歴検索」

という構造は作らない。

必要なら:
- D1 metadata/index
- partition
- manifest
- date/kid/target index
- 将来Analytics基盤

などを組み合わせる。

### Google Sheetsとの役割

Google Sheetsは本番DB/R2の代替ではない。

用途:
- ADMIN/OWNER export
- 人間による確認
- 外部共有
- 一時分析

基本:

```
D1 / R2
   ↓
Google Sheets Export
```

### Retentionの再設計

現在の暫定設定:
- API observations 14日
- player snapshots 90日
- ranking snapshots 180日
- player ranking snapshots 180日
- change events 2年
- API Pool usage 90日

R2導入後は、

```
D1 retention
+
R2 retention
```

の二層設計にする。

例:
- D1: 7〜30日
- R2: 1年 / 2年 / 無期限

ただし最終値はデータ量・利用頻度・Cloudflareコスト実測後に決定。

### 復旧設計

R2 archiveからD1へ戻せる構造を最初から考える。

最低限:
- schema version
- object metadata
- archive timestamp
- source observed timestamp
- object checksum/hash
- record count
- partition情報

を検討。

### 無料運用 / Paid移行

EagleEyeは原則無料利用を目指し、最低限の広告で運営費を賄う方向。

D1/R2は無料枠を意識するが、無料枠だけに依存した設計にはしない。

Cloudflare Paidへ移行しても、
- schema
- object key
- archive flow
- application logic

を大きく作り直さなくて済む構造を目指す。

### D1/R2設計の絶対ルール

1. D1を長期データ倉庫にしない。
2. R2を検索DBとして無理に使わない。
3. current stateとhistoryを分離する。
4. R2 archive成功前にD1を削除しない。
5. R2移行後にUIが大量R2 scanする構造を作らない。
6. 「取れるから保存する」をしない。
7. 必要なデータ・期間・列だけ保存する。
8. Paid化しても構造を変えない。

### 次スレッドで最初にやること

いきなりR2実装を始めない。

まずGitHub mainから現在の実装を棚卸しする。

確認対象:
1. 全D1 migrations
2. 全D1 tables
3. 全D1 indexes
4. Player保存処理
5. Player snapshot保存処理
6. ranking保存処理
7. change_events保存処理
8. api_observations保存処理
9. API Pool usage
10. Data Retention
11. D1 read queries
12. D1 write queries
13. 現在のR2コード/設定
14. Google Sheets export

その後、全データを以下へ分類:

- D1 Core
- D1 Current
- D1 Hot History
- R2 Archive
- External Export

分類後に、
R2 format → object key → archive方式 → retention → restore方式
の順に設計する。

設計が固まってからmigration / archive job / R2 write / cleanupを実装する。

### 次スレッド開始文

「GitHubの `docs/EAGLEEYE_HANDOFF_2026-09-27.md` を読んで、最新mainも確認してEagleEye本体を続けて。
今回はD1/R2データアーキテクチャが本題。
まず全D1テーブル・保存処理・読込処理・現在のR2設定をコードから棚卸しして、D1 Core / Current / Hot History / R2 Archive / External Exportに分類しよう。
その後、R2の保存形式、Object Key、archive方式、retention、復旧方式まで設計を固めてから実装する。
MightPulse Research Projectは別プロジェクトなので混ぜない。」

---

## 37. 2026-09-27追加：引き継ぎ運用ルール

EagleEye本体の引き継ぎは、この
`docs/EAGLEEYE_HANDOFF_2026-09-27.md`
を**マスター文書として継続更新する**。

新しいEagleEye用の細分化handoffを乱立させない。

例外:
- MightPulse未公開データ研究は別プロジェクトなので `docs/MIGHTPULSE_RESEARCH_PROJECT_2026-09-27.md` に分離する。
- それ以外のEagleEye本体の設計・実装・運用決定は本書へ統合する。

今回誤って作成した
`docs/EAGLEEYE_HANDOFF_2026-09-27_D1_R2.md`
は重複文書なので削除対象。

---

## 2026-09-27追加：D1最適化 Phase A 実装完了

D1の追加最適化について、既存機能を維持できることをコード・migration横断で確認した上で、A-1〜A-5を実装した。

### A-1｜Player Watchlist schema cache
ensurePlayerWatchlistSchema() にPromise cacheを導入。player_watchlistsのDDLは初回bootstrap時のみ実行し、失敗時はPromiseを解除して次回リトライ可能。データ仕様・権限・API挙動は変更なし。

### A-2｜Kingdom Watchlist lock schema cache
kingdom_watchlist_locks のDDLを ensureKingdomWatchlistFreshnessSchema() に統合。acquireKingdomWatchlistLock() から毎回のCREATE TABLEを削除。既存DBでテーブルが無い場合も共通bootstrapが作成するため後方互換。

### A-3｜Manual Refresh schema bootstrap統一
手動refreshに残っていたinlineの kingdom_watchlist_jobs DDLを削除し、ensureKingdomWatchlistFreshnessSchema() を共通利用。cron経路とmanual refresh経路のschema初期化方式を統一。

### A-4｜API Pool completion batch
recordApiPoolSuccess() / recordApiPoolFailure() をD1 batch化。api_pool_keys状態更新、api_pool_usage利用履歴INSERT、api_leases lease解放を1 batchへ集約。Write行数・監査履歴・状態遷移は維持し、query/subrequest overheadを削減。

### A-5｜Watchlist player snapshot batch
WatchlistのPlayer取得処理で api_observations、players、player_snapshots、player_rank_snapshots を1回のD1 batchへ統合。player_rank_snapshotsのINSERT SQLは buildPlayerRankSnapshotStatement() として共通化し、既存 savePlayerRankSnapshot() の単体利用時の挙動も維持。

### 実装コミット
- db8d886134f1e3adfee521847474207c133ea1ff — A-1
- 6b64039bdf28ac58b61733a01b6395bf0c526380 — A-2
- b140162827a9a5cdba988e7e10eefa34ddbd9af8 — A-3
- 78a346a7be7ebc80a20be1258aedf4bbc1cc9771 — A-4
- 7f65921c7f994b4916e0527290d5f8df3e5602ac — A-5共通化
- 31b396f017d33f233e56a056f58ca616f7b35002 — A-5 batch利用
- 0fe62047ea998e3f36c3c29f38c6dd8b1a12a958 — A-5変数初期化順序修正

### A Phaseの効果
A-1〜A-3: 繰り返しDDL / schema metadata処理を削減。
A-4: API Pool 1回の成功/失敗処理を3 D1 operationsから1 batchへ集約。
A-5: Watchlist Player 1件あたりの4系統保存処理を1 batchへ集約。Rows Written自体は削減しないが、query/subrequest overheadを削減。

### 注意
- D1 rows writtenそのものをさらに削る変更ではない。
- api_pool_usage、player_snapshots、player_rank_snapshots等の機能データは削除していない。
- R2移行設計はまだ開始しない。
- 次段階ではD1 Analytics実測を見ながら、B候補（相関SELECT最適化、Player materializationの既取得state再利用）を個別検証する。