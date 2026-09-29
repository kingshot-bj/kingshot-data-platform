# EagleEye service_events 引き継ぎ — 2026-09-29

## 目的
次スレッドで service_events 設計の一問一答を継続するための引き継ぎ。
ユーザー希望: 1論点ずつ質問→回答→確定事項として固定。勝手に先回りして設計を確定しない。

## 絶対条件
- service_events は D1に書かない。
- service_events は R2へ直接保存するためのイベントストリーム。
- Google Driveへの長期退避は後で実装。現段階ではその手前まで。
- D1 Free-tierの行読み書きを増やさない。
- 本番環境で確認できていないことを「確認済み」と言わない。
- 初期実装は過剰な行動追跡をしない。
- 必要になったイベントだけ後から追加できる構成にする。

## 確定事項

### 1. 保存経路
Queue → バッチ → gzip NDJSON → R2 を採用。

概念:
ユーザーの明確な操作
→ SERVICE_USAGEイベント生成
→ Cloudflare Queue
→ Consumerでバッチ化
→ gzip NDJSON
→ R2

理由:
- 小さい操作1件でもQueueに投入できる。
- R2の1イベント=1オブジェクトを避ける。
- Queueの再試行を利用する。
- 後からR2→Google Driveへ退避しやすい。

Queueの具体的なバッチ件数・時間・retry/DLQ等は未確定。

### 2. 初期の記録範囲
ユーザーが明確に行った主要操作だけを記録。
記録しない: 単なるHTTPアクセス、内部API処理、MightPulse取得、D1処理、cron、システム内部の細かい処理。
画面遷移を網羅する詳細行動ログは初期実装では不要。必要な箇所だけ後から追加。

### 3. service_eventsの目的
Bを採用。
- EagleEye全体の利用状況
- どの機能がどの程度使われているか
- ユーザーごとの利用頻度
- 人気プレイヤー
- 人気王国
- ウォッチリスト利用状況
- エクスポート等の利用状況
行動経路を完全追跡するCは初期実装ではやらない。

### 4. target
target_type / target_id を基本フィールドとして持つ。対象がないイベントではNULL。
例: PLAYER_VIEW → target_type=PLAYER, target_id=governor_id。
例: KINGDOM_VIEW → target_type=KINGDOM, target_id=2102。

### 5. actor
Aを採用。actor_user_id のみ保存。
Discord ID、username、global_name等はservice_eventsへ保存しない。
必要ならD1 users と後から照合する。

### 6. metadata
Bを採用。
JSON metadataは持つ。ただし自由に何でも入れず、イベントごとに許可項目を実装側で定義する。
例: PLAYER_SEARCH → search_type、PLAYER_EXPORT → format。
具体的なmetadata一覧は未確定。

## 現在のイベント基本形
SERVICE_USAGE
├─ event_id
├─ occurred_at
├─ actor_user_id
├─ feature
├─ operation
├─ target_type
├─ target_id
└─ metadata
型、timestamp形式、必須/任意は未確定。

## 第7問の状態
ユーザーは「今のGitHubコードを読み取って、現在存在する主要なユーザー操作を元にイベント種類を決める」方針にOK。
方針は B: 今のEagleEyeに実際に存在する、ユーザーが明確に行う主要操作を一通り記録する。

会話中の候補:
- PLAYER_SEARCH
- PLAYER_VIEW
- PLAYER_HISTORY_VIEW
- PLAYER_RANK_HISTORY_VIEW
- PLAYER_CHANGES_VIEW
- PLAYER_WATCHLIST_ADD
- PLAYER_WATCHLIST_REMOVE
- KINGDOM_WATCHLIST_ADD
- KINGDOM_WATCHLIST_REMOVE
- KINGDOM_WATCHLIST_VIEW
- RANKING_VIEW
- PLAYER_EXPORT
- KINGDOM_EXPORT
- GOOGLE_SHEETS_EXPORT

ただし上記は候補であり、まだ確定一覧ではない。
次スレでは main branch の現在コードを実際に棚卸しし、存在するユーザー操作を確定すること。存在しない機能を想像で追加しない。

## 次に決める論点
7. GitHubコードから初期イベント種類を確定 ← 次スレ開始時に実施
8. event_id / 重複排除
9. Queueバッチ条件（件数・時間）
10. R2オブジェクト命名規則
11. R2/Queue失敗・再試行・DLQ等
12. 保持期間・Google Drive退避前提
必要なら最終的に実装仕様書へ整理。

## 重要な既存アーキテクチャ
- Cloudflare Workers + D1 + R2 + MightPulse API
- GitHub repo: kingshot-bj/kingshot-data-platform
- main branch
- Worker: https://kingshot-data-platform.black-jack-kingshot.workers.dev
- ranking_snapshotsの広範な取得クエリは絶対に復活させない。
- ranking readsは原則 kingdom_ranking_currentへ寄せる。
- Google Drive primitiveは既存 src/google-drive.js に存在するが、service_events自動退避にはまだ未接続。
- R2は将来的にDriveへ退避する中間/保険層という設計思想。

## service_eventsと既存ログの責務
- SERVICE_USAGE → R2 service_events
- LOGIN → D1 login_history
- OWNER操作 → D1 owner_audit_log
- DIAGNOSTIC → D1 diagnostic_events
- API使用 → D1 api_pool_usage
service_eventsへ全HTTPアクセスや内部処理を入れない。

## R2設計上の既知の懸念
- 1イベント=1 R2 objectは避ける。
- R2 objectへのappend前提にしない。
- Queue Consumerでバッチ化する。
- gzip NDJSONを使う。
- event_idによる重複排除が必要。
- Queue再試行時の冪等性が必要。
- R2保存失敗で本来のユーザー操作を失敗扱いにしない。
- Google Driveへの退避成功確認後にR2を削除する設計を後で作る。
- R2容量よりもobject数・operation数・安全な退避の方が重要。

## 次スレでの進め方
このファイルを最初に読んでから続行。
第7問として main branch のコードを棚卸ししてイベント種類を確定する。
その後、一問ずつ設計を確定する。