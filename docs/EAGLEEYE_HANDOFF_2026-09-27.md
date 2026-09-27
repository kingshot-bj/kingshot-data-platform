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
766332d96db2b4329a222b1d7c89eda76c7e4f94
fix: correct watchlist ranking out-of-range direction

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
