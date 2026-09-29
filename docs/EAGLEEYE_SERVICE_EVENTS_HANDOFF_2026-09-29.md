# EagleEye SERVICE_USAGE 設計・引き継ぎ統合仕様 — 2026-09-29

## 目的

EagleEyeの主要なユーザー操作を `SERVICE_USAGE` として収集し、D1を使わず Cloudflare Queue → R2 へバッチ保存する。
R2は短期・中間・保険層、Google Driveは最終的な長期保管庫とする。
SERVICE_USAGE専用の独立管理サイトから利用状況・保存基盤・障害復旧を管理できるようにする。

### ユーザー運用ルール
- 設計は原則1論点ずつ質問→回答→確定。
- 未確定事項を勝手に確定しない。
- 本番環境で確認できていないことを「確認済み」と言わない。
- Free-tier-firstを基本方針とする。Paid $5は必要になった場合のフォールバックであり、現時点で有料前提とはしない。

---

# Q1〜Q6｜初期設計の確定事項

## Q1｜保存経路

確定:
```
ユーザーの明確な操作
  ↓
SERVICE_USAGE event
  ↓
Cloudflare Queue
  ↓
Consumerでバッチ化
  ↓
gzip NDJSON
  ↓
R2
```

理由:
- 小さいユーザー操作を個別Queue messageとして受けられる。
- 1イベント=1 R2 objectを避ける。
- Queueのretryを利用できる。
- 後段でGoogle Driveへ長期アーカイブしやすい。

## Q2｜初期の記録範囲

記録する:
- ユーザーが明確に実行した主要操作。

初期対象外:
- 単なるHTTPアクセス
- 内部API処理
- MightPulse取得
- D1処理
- cron
- システム内部の細かい処理
- 画面遷移を網羅する行動追跡

必要になったユーザー操作だけ後から追加できる構成にする。

## Q3｜service_eventsの目的

採用する目的:
- EagleEye全体の利用状況
- 機能ごとの利用量
- ユーザーごとの利用頻度
- 人気プレイヤー
- 人気王国
- ウォッチリスト利用状況
- Export等の利用状況

完全な行動経路追跡は初期実装では行わない。

## Q4｜target

基本フィールドとして `target_type` / `target_id` を持つ。

- 対象あり: target_type / target_idを設定
- 対象なし: NULL
- PLAYER: target_id = governor_id
- KINGDOM: target_id = kid

## Q5｜actor

`actor_user_id` のみ保存。

service_eventsには以下を保存しない:
- Discord ID
- username
- global_name
- その他不要なユーザー識別情報

必要な場合はD1 users等と後から照合する。

## Q6｜metadata

JSON metadataを持つ。

ただし自由形式ではなく、**イベントごとに許可項目を実装側で定義する固定スキーマ方式**とする。

例:
- PLAYER_SEARCH → search_type
- PLAYER_EXPORT → format

---

# Q7｜初期イベント種類

main branchの実コードを棚卸しし、現在ユーザーが明確に行える主要操作として以下15種類を初期採用。

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

除外:
- PLAYER_RANK_HISTORY_VIEW: APIは存在するが、現時点で明確なユーザー向けUI操作として扱わない。
- KINGDOM_RANK_HISTORY_VIEW: 同様。
- GOOGLE_SHEETS_EXPORT: 独立イベントにせず PLAYER_EXPORT / KINGDOM_EXPORT の metadata.format で表現。
- RANKING_VIEWという曖昧な共通イベント名は使わない。

---

# Q8｜event_id / 重複排除

- UUID v4。
- `crypto.randomUUID()` をユーザー操作をイベント化する時点で1回だけ生成。
- Queue → Consumer → R2 → Driveまで同じevent_idを保持。
- retryで再生成しない。
- event_idをイベント単位の冪等性・重複排除キーとして利用する。

---

# Q9｜Queue / R2通常バッチ

## 通常Flush

12時間ごと:
- 00:00〜11:59
- 12:00〜23:59

**12時間境界はJST**。

eventの `occurred_at` 自体はUTCで保存する。

形式:
- gzip NDJSON
- Queueはイベント単位
- Consumerでバッチ化

## 手動Flush

SERVICE_USAGE専用管理サイトから任意タイミングで実行可能。

- 通常の12時間スケジュールは変更しない。
- 未保存イベントを即時Flush。
- event_idで冪等性を確保。
- 手動Flushごとに無制限な小ファイルを作らない。
- 対象12時間枠の正規データへ安全に統合できる形にする。
- R2 objectへのappendを前提にしない。
- 通常Consumerと手動Flushの競合を排他/世代管理等で防止する。

---

# Q10｜R2 / Google Driveの役割と構造

## R2

R2は**短期・中間・保険層**。

概念:
```
service-events/
  2026/09/29/00-12.ndjson.gz
  2026/09/29/12-24.ndjson.gz
```

R2では12時間単位の正規ファイルを基本とし、手動Flushによる小ファイル乱立を避ける。

## Google Drive

Google Driveは**最終・長期保管庫**。

通常時:
```
R2 12時間バッチ
  ↓
翌日Google Driveへアーカイブ
  ↓
保存成功確認
  ↓
R2から削除
```

Drive側は最終的に通常バッチも緊急退避データも、整理された正式アーカイブ構造になることを目標とする。

---

# Q11｜Queue/R2障害・Retry・DLQ

基本経路:
```
Queue
  ↓
R2
  ├─ 成功 → 完了
  └─ 失敗
      ↓ Retry ×5
      ↓ DLQ
```

確定:
- Retryは5回。
- 同じevent_idを保持。
- DLQは捨て場ではなく未処理イベントの保留場所。
- 保存失敗が本来のユーザー操作失敗にならないよう非同期処理。
- 管理サイトでDLQ状態を確認できる。
- 手動再処理可能。

---

# Q12｜Google Drive通常アーカイブ

- R2: 12時間ごと
- Google Drive: 1日1回
- 前日分をアーカイブ。
- Drive保存成功確認前にR2を削除しない。
- Drive失敗時はR2を保持。
- 管理サイトから手動アーカイブ可能。
- Google Driveが最終保管庫、R2が短期保険層。

---

# Q13｜occurred_at

`occurred_at` は **ISO 8601 UTC**。

例:
`2026-09-29T14:30:00.000Z`

- 内部保存: UTC
- 管理画面表示: JST
- R2の12時間バッチ境界: JST

---

# Q14｜SERVICE_USAGE Collection Catalog

収集項目は3層で管理する。

## Layer 1: 必須Envelope
- event_id
- occurred_at
- actor_user_id
- feature
- operation
- target_type
- target_id

## Layer 2: 軽量分析metadata
イベントごとに許可項目を定義。
例:
- PLAYER.POWER
- PLAYER.TOWN_CENTER_LEVEL
- PLAYER.VIP
- PLAYER.KILLS
- PLAYER.X
- PLAYER.Y
- PLAYER.ALLIANCE.ID
- PLAYER.ALLIANCE.ABBR
- PLAYER.ALLIANCE.NAME
- PLAYER.ALLIANCE.RANK
- PLAYER.ALLIANCE.POWER
- PLAYER.RANKING.*
- watchlist counts
- result counts
- observed_at等

## Layer 3: 詳細ゲームsnapshot
必要な調査期間だけ個別ON可能。
例:
- PLAYER.HEROES
- PLAYER.HEROES.LEVEL
- PLAYER.HEROES.STAR
- PLAYER.HEROES.POWER
- PLAYER.HEROES.SKILLS
- PLAYER.GOV_GEAR
- PLAYER.GOV_GEAR.SLOT
- PLAYER.GOV_GEAR.TIER
- PLAYER.GOV_GEAR.QUALITY
- PLAYER.GOV_GEAR.STAR
- PLAYER.GOV_GEAR.ENHANCEMENT
- PLAYER.GOV_GEAR.SCORE
- PLAYER.GOV_GEAR.POWER
- PLAYER.GOV_GEAR.GEMS
- PLAYER.RANKING.*各ランキング

### イベント別collection方針

PLAYER_SEARCH:
- search_type
- result_count
- result_has_match
- selected_result
- direct_lookup
- **raw search queryは保存しない**

PLAYER_VIEW:
- source
- view_section
- 必要に応じて軽量player state

PLAYER_REFRESH:
- source
- refresh_reason
- previous/new observed_at
- previous/new source_observed_at
- upstream_fresh
- upstream_age_seconds
- 必要に応じて詳細player state

PLAYER_HISTORY_VIEW:
- period
- limit
- history_type
- display_mode
- displayed snapshot count
- oldest/newest observed_at

PLAYER_CHANGES_VIEW:
- period
- change_type
- field_name
- result_count
- change categories

PLAYER_WATCHLIST_VIEW:
- watchlist_count
- enabled_count
- disabled_count
- max_limit
- remaining_slots
- sort/filter/page/display_count

PLAYER_WATCHLIST_ADD/REMOVE:
- source
- watchlist size before/after
- limit
- remaining slots
- enabled
- target player state
- 必要に応じてhero/ranking/gov_gear詳細

KINGDOM_WATCHLIST_VIEW:
- watchlist_count
- enabled_count
- top_n
- interval_hours
- page
- sort

KINGDOM_WATCHLIST_ADD/REMOVE:
- kid
- top_n
- interval_hours
- watchlist size before/after
- enabled

KINGDOM_WATCHLIST_REFRESH:
- user actionのみ記録
- source
- refresh_scope
- top_n
- target kingdom
- 内部job情報はservice_eventsに入れない

KINGDOM_RANKING_VIEW:
- kid
- board
- limit
- page
- sort
- source
- observed_at
- source_observed_at
- display_count/rank_range

PLAYER_EXPORT:
- format
- section
- row_count
- column_count
- target_player_count
- success

KINGDOM_EXPORT:
- format
- kid
- board
- limit
- row_count
- success

---

# Q15｜Queue Retry回数

**5回 → DLQ**。

- Free-tier-first。
- Paid $5は必要になった場合のフォールバック。
- 無限retryは禁止。

---

# Q16｜DLQ自動再処理間隔

**6時間ごと**。

高頻度のretryでFree-tier資源を消費しない。

---

# Q17｜DLQ自動再処理バッチサイズ

**1回最大500イベント**。

例:
10,000件あっても一度に全部ではなく500件ずつ。

---

# Q18｜手動DLQ再処理

**個別選択 + 最大500件の一括選択**。

「全件再処理」は提供しない。

手動再処理失敗時はDLQに残す。

---

# Q19｜DLQ保持

Cloudflare Queue Freeの保持制約を前提に、長期DLQ保管はしない。

**DLQは24時間以内に救出する設計**。

- 即時Discord通知
- 6時間ごとの自動再処理
- 必要に応じてGoogle Driveへ緊急退避

30日等の長期Queue保持は採用しない。

---

# Q20｜Google Drive緊急退避

通常のR2→Driveアーカイブとは別に、DLQ救出用の緊急退避経路を持つ。

確定フロー:
```
Queue失敗
 ↓ Retry ×5
 ↓ DLQ
 ↓ Discord通知
 ↓ 6時間後 自動再処理
   ├─ 成功 → R2/通常アーカイブへ
   └─ 失敗
       ↓
     Google Drive緊急退避
```

既存 `src/google-drive.js` のR2 object→Drive upload primitiveを拡張して利用する。
現時点ではservice_events自動退避には未接続であり、実装・連携が必要。

---

# Q21｜Discord通知・復旧通知

通知方針:

1. DLQに1件でも入ったら**即時通知**
2. 1時間経過して未解消なら**再通知**
3. その後も未解消なら**6時間ごとに定期通知**
4. 復旧したら**復旧通知**
5. 復旧通知後は、その障害に対する定期通知状態をリセット

通知内容には可能な範囲で:
- DLQ件数
- 最古のDLQ発生時刻
- 最古イベントのevent_id
- 最終自動再処理時刻
- 再処理結果
- Google Drive退避状態
- 次回自動再処理予定
- 復旧方法
- 復旧までの経過時間

を含める。

同一障害で通知を無限に個別イベント単位発行しない。

---

# Q22｜Google Drive緊急退避の発動条件

**6時間後の自動DLQ再処理が失敗した時点でGoogle Drive緊急退避を開始**。

Drive保存結果に応じて通知:
- 保存成功 → Drive退避完了通知
- 保存失敗 → Drive退避失敗通知

「保存できた」と確認する前に成功扱いにはしない。

---

# Q23｜Driveに退避されたデータの最終的な扱い

Google Driveは単なる一時避難場所ではなく、**最終保管庫**。

障害時:
```
R2/Queue障害
 ↓
Driveへ緊急退避
 ↓
Drive上で保管
 ↓
障害復旧後に正式アーカイブへ整理
```

DriveからR2へ戻すことを通常復旧の目的にはしない。

---

# Q24｜緊急退避データの正式アーカイブ化

**C: 原則自動 + 異常時手動**。

- 正常時は自動で正式アーカイブへ統合。
- 統合・検証成功後、緊急退避用の一時的な重複ファイルを整理。
- 問題がある場合のみSERVICE_USAGE管理サイトから手動整理。
- 最終的なDriveは通常時と障害時で別体系にならず、綺麗な正式アーカイブ構造に揃える。

---

# Q25｜重複防止

**C: event_id + batch_idの二重冪等性**。

## event_id
イベント単位の重複排除。
Queue retry、DLQ、Drive緊急退避、通常アーカイブ、手動再処理を経ても同じevent_idは1回だけ正式保存。

## batch_id
12時間バッチ等のバッチ単位の重複排除。

これにより、
- 同じイベントの二重保存
- 同じバッチの二重生成
の両方を防ぐ。

---

# Q26｜SERVICE_USAGE管理サイトの認証

EagleEye本体とは**別サイト**にする。

認証方式:
**Discordログイン + SERVICE_USAGE専用権限**。

EagleEye本体のAdmin権限とSERVICE_USAGE管理権限を完全に同一視しない。

概念:
```
EagleEye
  └─ ゲーム情報・Watchlist等

SERVICE_USAGE管理サイト
  └─ Discord認証
  └─ SERVICE_USAGE専用権限
```

---

# Q27｜SERVICE_USAGE管理サイトの権限

Owner専用画面から、Adminごとに**機能単位のON/OFF**を変更できる。

基本:
- Owner: 全権限
- Admin: Ownerが許可した機能のみ

例:
```
Admin権限              [ ON ]
利用状況閲覧            [ ON ]
詳細分析                [ ON ]
手動Flush               [ OFF ]
DLQ再処理               [ OFF ]
Drive復旧・整理         [ OFF ]
Collection設定          [ OFF ]
権限管理                [ OFF ]
```

権限変更の監査情報:
- 変更者
- 対象ユーザー
- 変更前→変更後
- 変更日時

現在Ownerはユーザー本人のみだが、将来Owner/Adminを追加できる構造にする。

---

# Q28｜Collection Catalog設定反映

**C: 即時 + 予約**。

- 保存直後から反映可能。
- 開始日時・終了日時を指定可能。
- 将来のON/OFFを予約可能。
- 終了日時で自動OFF。
- 設定履歴を保存。

例:
```
PLAYER.POWER
ON
開始: 2026-10-01 00:00 JST
終了: 2026-10-31 23:59 JST
```

これにより調査期間だけ詳細データを収集できる。

---

# Q29｜実装後のテスト方針

**C: 本番環境で障害シナリオまで実施**。

ただし、6時間待機等をそのまま実時間で行う必要はない。
テストモード等を用意し、実際の連携先を使って一連の流れを確認する。

必要な実連携:
- Discord
- Google Drive
- Cloudflare Queue
- R2

確認する一連のシナリオ:
```
SERVICE_USAGE
 ↓
Queue
 ↓
R2
 ↓
意図的な保存障害
 ↓
Retry ×5
 ↓
DLQ
 ↓
Discord即時通知
 ↓
テスト用に短縮した自動再処理
 ↓
失敗させてDrive緊急退避
 ↓
Google Drive保存確認
 ↓
復旧
 ↓
正式アーカイブ化
 ↓
event_id / batch_id重複チェック
 ↓
最終状態確認
```

重要:
- 実装・デプロイしただけでは「確認済み」としない。
- 実際の本番環境で該当経路を確認したものだけ確認済みと報告する。
- Discord/Google Driveの連携が未設定なら、その段階では本番確認不可と明示する。

---

# Collection Catalog 共通項目カタログ

実装時に固定スキーマとして管理する。

## Player
- PLAYER.POWER
- PLAYER.TOWN_CENTER_LEVEL
- PLAYER.VIP
- PLAYER.KILLS
- PLAYER.X
- PLAYER.Y
- PLAYER.ALLIANCE.ID
- PLAYER.ALLIANCE.ABBR
- PLAYER.ALLIANCE.NAME
- PLAYER.ALLIANCE.RANK
- PLAYER.ALLIANCE.POWER
- PLAYER.HEROES
- PLAYER.HEROES.LEVEL
- PLAYER.HEROES.STAR
- PLAYER.HEROES.POWER
- PLAYER.HEROES.SKILLS
- PLAYER.GOV_GEAR
- PLAYER.GOV_GEAR.SLOT
- PLAYER.GOV_GEAR.TIER
- PLAYER.GOV_GEAR.QUALITY
- PLAYER.GOV_GEAR.STAR
- PLAYER.GOV_GEAR.ENHANCEMENT
- PLAYER.GOV_GEAR.SCORE
- PLAYER.GOV_GEAR.POWER
- PLAYER.GOV_GEAR.GEMS
- PLAYER.RANKING.*（ranking-catalogの各board）

---

# SERVICE_USAGE管理サイトの予定機能

- 日別/期間別利用量
- feature / operation別集計
- ユーザー別利用状況
- 人気プレイヤー
- 人気王国
- Watchlist利用状況
- Export利用状況
- R2状態
- Queue状態
- Queue backlog
- Retry
- DLQ
- エラー
- 手動Flush
- 手動アーカイブ
- 手動DLQ再処理
- Google Driveアーカイブ状態
- Collection Catalog設定
- Collection設定履歴
- OwnerによるAdmin/機能権限管理

---

# 既存コードとの重要な整合条件

- Cloudflare Workers + D1 + R2 + MightPulse API
- GitHub repo: `kingshot-bj/kingshot-data-platform`
- main branch
- Worker: https://kingshot-data-platform.black-jack-kingshot.workers.dev
- `ranking_snapshots` の広範な取得クエリは**絶対に復活させない**。
- ranking readsは原則 `kingdom_ranking_current` に寄せる。
- `getLatestPlayerHeroRankings()` もranking_snapshots直接読みを避け、current側への移行方針を維持。
- 既存 `src/google-drive.js` はR2 object→Google Drive upload primitiveを持つが、SERVICE_USAGE自動退避には未接続。
- `docs/EAGLEEYE_R2_GOOGLE_DRIVE_PREP.md` の思想を維持し、Drive保存成功確認前にR2を削除しない。
- `wrangler.jsonc` に `CLOUDFLARE_MONITORING_PROFILE: "PAID_5USD"` が存在しても、これを実際の課金状態の証拠として扱わない。プロジェクト方針はFree-tier-first。
- Google DriveのService Account運用は、実際の保存先/権限構成を確認してから本番接続する。
- 5MB超のDriveアップロード等が必要になった場合はresumable uploadを検討する。

---

# 既存ログとの責務分離

- SERVICE_USAGE → R2 service_events
- LOGIN → D1 login_history
- OWNER操作 → D1 owner_audit_log
- DIAGNOSTIC → D1 diagnostic_events
- API使用 → D1 api_pool_usage

SERVICE_USAGEへ全HTTP/internal processingを入れない。

---

# 現時点の全体アーキテクチャ

```
[EagleEyeユーザー操作]
        ↓
[SERVICE_USAGE event]
        ↓
[Cloudflare Queue]
        ↓
[Consumer]
        ↓
[12h JST batch / gzip NDJSON]
        ↓
[R2]
   ├─ 正常
   │    ↓
   │  翌日Google Drive
   │    ↓
   │  保存確認
   │    ↓
   │  R2削除
   │
   └─ R2保存失敗
        ↓ Retry ×5
        ↓ DLQ
        ↓ Discord即時通知
        ↓ 6h自動再処理
          ├─ 成功 → 正常フローへ
          └─ 失敗 → Google Drive緊急退避
                     ↓
                  Discord結果通知
                     ↓
                  復旧後自動整理
                     ↓
                  正式Driveアーカイブ
```

---

# 実装進捗（2026-09-29）

## Phase 1 完了

実装済み:
- `src/service-usage.js` を追加。
- SERVICE_USAGE 15イベントの固定allow-listを定義。
- event_id = `crypto.randomUUID()`。
- occurred_at = ISO 8601 UTC。
- actor_user_idのみ保存する設計。
- target_type / target_idをPLAYER / KINGDOMで分離。
- metadataをイベント別allow-listで制限。
- raw search queryは収集しない。
- Queue未接続時も元のユーザー操作を失敗させないfail-safeを実装。
- Player Search / Player View / Player Refreshを接続。
- Player Watchlist View / Add / Removeを接続。
- Kingdom Watchlist View / Add / Remove / Refreshを接続。

### Phase 1 コミット
- `336d4fbdb8fef882d7aeaed370ee2a5f27747812` — SERVICE_USAGE event schema / queue producer
- `ba79d6ea4c5e80a8f3209f6dbf519bf1dfe32954` — core player SERVICE_USAGE events
- `bfd2f2d084ed046bdf319750fd5966ea76463df4` — kingdom watchlist SERVICE_USAGE events
- `d211e5746955aa26c61c268b2b1fdcce4483ae27` — kingdom target_id correction

### 現時点の未接続外部基盤
- Cloudflare Queue本体の作成
- Wrangler Queue producer binding
- Queue consumer
- R2 12時間canonical batch
- DLQ / retry / Discord通知
- Google Drive最終アーカイブ / emergency archive
- SERVICE_USAGE専用管理サイト

**重要:** Phase 1はコード実装のみ。Queue/R2/Discord/Google Driveの本番連携および本番動作確認はまだ行っていない。

# 未実装・未確認事項

この文書は**設計確定書**であり、これだけで実装済み・本番確認済みを意味しない。

今後の実装対象:
1. SERVICE_USAGE event emitter
2. Queue producer / consumer
3. Retry ×5 / DLQ
4. 6h DLQ recovery
5. Discord notification
6. Google Drive emergency archive
7. Drive正式アーカイブ整理
8. event_id / batch_id冪等性
9. SERVICE_USAGE専用管理サイト
10. Discord認証
11. 専用権限・機能別トグル
12. Collection Catalog設定UI
13. R2/Queue/Drive運用UI
14. 本番障害シミュレーション
15. 実連携確認

## 次の開発方針

Q1〜Q29の設計判断を基準として、これ以上細かい質問を無制限に増やさない。
実装上必要な細部は既存決定事項とFree-tier-first、冪等性、最終Drive保管という方針に従って合理的に設計し、ユーザーに影響する新しい仕様判断が必要な場合だけ追加確認する。


# 実装進捗追記（2026-09-29 21:xx JST）

## Phase 2 — Queue → R2 骨格

実装済み:
- `src/service-usage-archive.js` を追加。
- Queue ConsumerからSERVICE_USAGEを受け取り、R2へgzip NDJSON保存。
- R2キーはJST基準の `service-events/YYYY/MM/DD/00-12.ndjson.gz` / `12-24.ndjson.gz`。
- 同一時間枠の既存オブジェクトを読み込み、`event_id`で重複排除して再圧縮・更新。
- Queue retry時に同じevent_idを維持。
- R2書き込み失敗時は対象messageをretry。
- 不正messageはackして無限retryを避ける。
- WranglerにSERVICE_USAGE producer / consumer / DLQ設定を追加。
- max_retries=5。
- max_concurrency=1でR2同一オブジェクト更新を直列化。
- consumer batchは最大100件、最大待機60秒。

コミット:
- `0a48b27beaed84802426d18e17968dd1c1b25d2f`
- `6d778344a3cee09602cd93a4e094099c2b663333`
- `2b94a4758595d19907d6f1515b93b8c55cfb0c7a`
- `42df8fe48b26cb3658a3419dc20d28f8c6ca415e`
- `ef5bf3ded7f28569a8913715e69860e815becf33`

### 本番未確認
- Queue本体がCloudflareアカウント上に存在すること
- Queue bindingの本番publish
- Queue → Consumerの実配信
- R2への実gzip object生成
- retry / DLQ実動作
- 12時間運用でのR2使用量
- Productionでの全15イベント収集

### ユーザー操作が必要なもの
Queue自体はアカウントリソースなので、Cloudflare認証済み環境から以下を実行する必要がある:
`npx wrangler queues create eagleeye-service-usage`

その後、mainをdeployしてQueue bindingを反映する。

## Cloudflare仕様の再確認（2026-09-29）

現行Cloudflare公式ドキュメントでは、Free tierのQueue message retentionは60〜86400秒（最大24時間）としてWranglerで設定可能。一方、DLQについては現在の公式DLQ説明で「consumerなしのDLQは4日後に削除」と記載されている。

したがって、以前の「DLQは24時間」という前提は**DLQ固有の保持期間については現行公式情報と一致しないため撤回**。ただし、Free-tier Queue本体の未処理message retention上限24時間という制約は引き続き重要。

また、現実の運用設計では「DLQに入ったら4日あるから放置」ではなく、早期通知・自動救済を前提にする。

## 注意
現Phase 2のConsumerは同じ12時間正規R2 objectをバッチ到着ごとに更新する方式。12時間境界ごとに1回だけR2 writeする「完全な12h flush」ではない。
これはQueueからConsumerへ即時pushされるCloudflare仕様上、追加の一時バッファ層なしに厳密な12h flushを実現するための次段設計が必要なため。

