# EagleEye Management — 開発引き継ぎ書

作成日: 2026-09-29
対象: EagleEye Management
関連システム: KingShot Data Platform / EagleEye
関連リポジトリ: kingshot-bj/kingshot-data-platform
Management専用GitHubリポジトリ: **新規作成する（推奨名: `eagleeye-management`）**

## 1. 目的
EagleEye Management は EagleEye 本体とは分離した独立管理システム。SERVICE_USAGE の利用状況分析、Queue/R2/DLQ/Google Drive の監視・復旧、Collection Catalog、Owner/Admin 権限、監査を担当する。

重要な責任分界:
- EagleEye 本体: ユーザー操作を SERVICE_USAGE イベント化して Queue に送る。
- EagleEye Management: Queue、R2、DLQ、Drive、分析、復旧、設定、権限を管理する。
- EagleEye の /admin/diagnostics に Management 機能を詰め込まない。

## 2. 現在の EagleEye 本体
- Worker: https://kingshot-data-platform.black-jack-kingshot.workers.dev
- GitHub: kingshot-bj/kingshot-data-platform
- Cloudflare Workers / D1 / R2 / Queues
- R2 binding: ARCHIVE → eagleeye-archive
- D1 binding: DB
- MightPulse API / Google Drive / Discord

## 3. SERVICE_USAGE 保存経路
```text
EagleEye user action
  ↓
SERVICE_USAGE event
  ↓
Cloudflare Queue
  ↓
Queue Consumer
  ↓
gzip NDJSON
  ↓
R2 service-events/
  ↓
Google Drive long-term archive
```

SERVICE_USAGE の event 本体を D1 に保存しない。D1 は LOGIN、OWNER、DIAGNOSTIC、API usage 等の別用途に使用する。

## 4. 実装済みイベント
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

## 5. イベント仕様
必須 envelope: event_id / occurred_at / actor_user_id / feature / operation / target_type / target_id

- event_id: UUID v4。生成はイベント作成時の1回だけ。Queue、Consumer、R2、Driveで同一値を維持する。
- occurred_at: UTC ISO8601。UIではJST表示。
- actor_user_id: users.user_id のみ。Discord ID、username、global_name は保存しない。
- PLAYER target_id: governor_id。
- KINGDOM target_id: kid。
- metadata はイベントごとの allow-list。任意JSONを自由に保存しない。
- PLAYER_SEARCH では raw search query を保存しない。

## 6. Queue
- Queue: eagleeye-service-usage
- DLQ: eagleeye-service-usage-dlq
- max_batch_size: 100
- max_batch_timeout: 30秒
- max_retries: 5
- max_concurrency: 1
- dead_letter_queue: eagleeye-service-usage-dlq

2026-09-29 時点で、ユーザーが共有した本番 deploy log により Queue 作成と Producer binding、および後続 Consumer を含むデプロイ成功を確認している。
ただし Queue → Consumer → R2 の実データ処理までを本番で確認済みとは扱わない。

## 7. R2 archive
実装: src/service-usage-archive.js

canonical key:
```text
service-events/YYYY/MM/DD/00-12.ndjson.gz
service-events/YYYY/MM/DD/12-24.ndjson.gz
```

JST基準、gzip NDJSON。event_id で重複排除する。

現在の実装は Consumer batch ごとに canonical 12h object を更新するため、厳密な意味で12時間に1回だけR2へ書く構成ではない。Free-tier / operation cost を考慮し、将来的に staging → 12h consolidation へ改善する余地がある。

## 8. Google Drive
既存 primitive: src/google-drive.js の uploadR2ObjectToGoogleDrive。
環境変数: GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY / GOOGLE_DRIVE_FOLDER_ID

Drive は最終 archive。R2 → Drive のアップロード成功を検証してから R2 を削除する。Drive 失敗時は R2 を残す。
Service Account の容量・権限・実アップロードは本番確認が必要。大容量 upload では resumable upload を検討する。

## 9. DLQ / Recovery
通常経路: Queue → 最大5 retry → DLQ。

- DLQ 発生時は Discord alert。
- 6時間ごとに最大500 events を自動 retry。
- 手動 retry は個別、または最大500件。
- 全件一括再処理は作らない。
- 失敗イベントは DLQ に残す。

6時間の自動 retry でも失敗した場合は Google Drive emergency archive を開始する。

## 10. Discord 通知
設計:
- DLQ発生時に即時通知。
- 1時間 unresolved なら再通知。
- 以降6時間ごとに通知。
- recovery 時に recovery notification。
- recovery 後は recurring notification state を reset。

通知には DLQ count、oldest DLQ time、oldest event_id、last retry、result、Drive fallback state、next retry、recovery method、elapsed time を含める。無限の per-event spam は避ける。

## 11. Idempotency
event_id と batch_id の二重 idempotency。
- event_id: 個々のイベント重複防止。
- batch_id: batch生成そのものの重複防止。

## 12. Management 認証・権限
EagleEye Admin と EagleEye Management Admin は別物。Discord Login + Management 専用 permission model とする。

Owner:
- 全機能。

Admin:
- Owner が許可した機能のみ。

feature-level permissions:
- Admin access
- usage analytics
- detailed analysis
- manual Flush
- DLQ reprocess
- Drive recovery/cleanup
- Collection settings
- permission management

権限変更 audit: changer / target / before / after / timestamp

## 13. Collection Catalog
3層:
- Layer 1 required envelope
- Layer 2 lightweight analysis metadata
- Layer 3 detailed game snapshot

代表項目:
- PLAYER.POWER
- PLAYER.TOWN_CENTER_LEVEL
- PLAYER.VIP
- PLAYER.KILLS
- PLAYER.X / PLAYER.Y
- PLAYER.ALLIANCE.ID / ABBR / NAME / RANK / POWER
- PLAYER.HEROES / LEVEL / STAR / POWER / SKILLS
- PLAYER.GOV_GEAR / SLOT / TIER / QUALITY / STAR / ENHANCEMENT / SCORE / POWER / GEMS
- PLAYER.RANKING.*

設定は C案: 即時 + scheduled。各項目について ON/OFF、開始日時、終了日時、自動終了、履歴を持たせる。

## 14. Management UI
```text
EagleEye Management
├─ Dashboard
├─ Usage Analytics
│  ├─ Daily / Period
│  ├─ Feature / Operation
│  ├─ User Usage
│  ├─ Popular Players / Kingdoms
│  ├─ Watchlist Usage
│  └─ Export Usage
├─ Queue / R2
│  ├─ Queue Status
│  ├─ Backlog
│  ├─ R2 Archive
│  └─ Manual Flush
├─ DLQ / Recovery
├─ Google Drive
├─ Collection Catalog
├─ Permissions
└─ Audit Log
```

## 15. Manual Flush
Normal Consumer と Manual Flush が競合しない排他制御が必要。
必要項目: batch_id、event_id dedupe、status、start/end、success/failure、operator、audit。
無制限に小さい R2 object を増やす設計は禁止。

## 16. 本番 failure test
Q29 の最終試験:
```text
SERVICE_USAGE → Queue → R2 → intentional failure → retry ×5 → DLQ
→ Discord alert → shortened auto retry → Drive emergency
→ Drive verification → recovery → formal archive
→ event_id / batch_id dedupe → final state
```

実際に確認できていないものを「本番確認済み」「正常動作確認済み」と表現しない。

## 17. EagleEye 本体側の重要注意
- D1 Free-tier row read を最優先。
- broad ranking_snapshots retrieval を絶対に復活させない。
- current ranking は kingdom_ranking_current を優先。
- getLatestPlayerHeroRankings() は ranking_snapshots 直接読みに依存しない形へ移行予定。
- SERVICE_USAGE のために D1 を保存先として追加しない。

## 18. 関連コミット
- 336d4fbdb8fef882d7aeaed370ee2a5f27747812 — event schema / queue producer
- ba79d6ea4c5e80a8f3209f6dbf519bf1dfe32954 — player events
- bfd2f2d084ed046bdf319750fd5966ea76463df4 — kingdom watchlist events
- d211e5746955aa26c61c268b2b1fdcce4483ae27 — kingdom target_id correction
- 0a48b27beaed84802426d18e17968dd1c1b25d2f — queue → R2 archive
- 6d778344a3cee09602cd93a4e094099c2b663333 — Queue / DLQ config
- 2b94a4758595d19907d6f1515b93b8c55cfb0c7a — Queue consumer
- 42df8fe48b26cb3658a3419dc20d28f8c6ca415e — view/export tracking
- ef5bf3ded7f28569a8913715e69860e815becf33 — serialized R2 consumer writes
- 901fa4445acc36c6cf13485e2eff2db86872a595a — latest docs/progress

## 19. Management のGitHub / Project構成
EagleEye Management は EagleEye 本体と同じリポジトリに実装しない。**新規ChatGPT Project + 新規GitHub repository** で独立して開始する。

推奨GitHub repository名:
- `eagleeye-management`

構成イメージ:
```text
kingshot-bj/
├─ kingshot-data-platform   # EagleEye本体
└─ eagleeye-management      # EagleEye Management
```

責任分界:
- `kingshot-data-platform`: SERVICE_USAGEイベント生成・Queue送信、EagleEye本体機能。
- `eagleeye-management`: SERVICE_USAGEの監視・分析、Queue/R2/DLQ/Drive管理、Recovery、Collection Catalog、Permissions、Audit。

Management側からEagleEye本体を直接改造する前提にはしない。必要な連携はAPI / Cloudflare resource permissions等の明確な境界を設ける。

**新規GitHub repositoryは、Management Project開始時に作成してから実装を開始する。**

## 20. Management Project の開始順
Phase 0: repository / architecture / auth / API boundary / permissions。
Phase 1: read-only monitoring。Queue、backlog、R2、DLQ、Drive。
Phase 2: usage analytics。
Phase 3: manual Flush / DLQ retry / Drive recovery。
Phase 4: Collection Catalog。
Phase 5: permissions / audit。
Phase 6: production failure test。

## 21. 新Projectで最初に確認すること
1. **新規GitHub repository `eagleeye-management` を作成する。**
2. Cloudflare Worker / Pages / domain 構成。
3. Management Discord OAuth callback。
4. EagleEye 本体から公開する API / endpoint。
5. Queue / R2 / DLQ / Drive の read/write 権限。
6. Management 側 D1 の用途。SERVICE_USAGE event 本体保存には使わない。

## 22. 最重要伝言
1. EagleEye Management は EagleEye 本体と別システム。
2. SERVICE_USAGE は R2 を中心に運用する。
3. Queue / R2 / DLQ / Drive を Management 側で管制する。
4. EagleEye Admin と Management Admin を同一視しない。
5. Free-tier を最優先する。
6. event_id + batch_id の二重 idempotency を守る。
7. Drive は最終 archive、R2 は短期/intermediate/insurance。
8. Manual 操作には audit を残す。
9. Owner が Admin 権限を制御する。
10. 本番未確認事項を確認済みと断言しない。

---
この文書を EagleEye Management の新規 ChatGPT Project に最初の引き継ぎ資料として使用する。