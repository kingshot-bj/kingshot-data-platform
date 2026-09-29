# EagleEye service_events 引き継ぎ — 2026-09-29

## 目的
EagleEyeの主要なユーザー操作を `SERVICE_USAGE` として収集し、D1を使わず、Cloudflare Queue → R2へバッチ保存する。
将来的にR2からGoogle Driveへ長期アーカイブし、SERVICE_USAGE専用管理サイトで利用状況・保存状況を確認できるようにする。

ユーザー希望:
- 設計は1論点ずつ質問→回答→確定事項として固定。
- 勝手に先回りして未確定事項を確定しない。
- 本番環境で確認できていないことを「確認済み」と言わない。

## 絶対条件
- service_eventsはD1に書かない。
- service_eventsはR2へ保存するイベントストリーム。
- D1 Free-tierの行読み書きを増やさない。
- 1イベント=1 R2 objectは避ける。
- 単なるHTTPアクセス、内部API処理、MightPulse取得、D1処理、cron等は初期のSERVICE_USAGE対象にしない。
- 明確な主要ユーザー操作だけを記録する。
- 必要になったイベントは後から追加できる構成にする。
- Google Driveへの長期退避はservice_eventsの一次保存とは分離し、後段処理として実装する。

## 確定アーキテクチャ

### イベント保存経路
ユーザーの明確な操作
→ SERVICE_USAGEイベント生成
→ Cloudflare Queue
→ Consumerでバッチ化
→ gzip NDJSON
→ R2

R2は中間/保険層として使い、Google Driveは長期アーカイブ用途。

### SERVICE_USAGE専用管理サイト
EagleEye本体の既存管理画面とは分離した、SERVICE_USAGE専用の管理サイトを用意する。

主な役割:
- 利用状況の集計・分析
- 日別/期間別の利用状況
- feature / operation別集計
- ユーザー別利用状況
- 人気プレイヤー・人気王国の集計
- ウォッチリスト利用状況
- Export等の利用状況
- R2/Queueの保存状況
- Queue滞留状況
- エラー/リトライ/DLQ状況
- 任意タイミングの手動Flush
- 任意タイミングの手動アーカイブ

SERVICE_USAGE管理サイト上で利用状況の集計表示と保存基盤の運用状態確認を行う。

## service_eventsと既存ログの責務
- SERVICE_USAGE → R2 service_events
- LOGIN → D1 login_history
- OWNER操作 → D1 owner_audit_log
- DIAGNOSTIC → D1 diagnostic_events
- API使用 → D1 api_pool_usage

service_eventsへ全HTTPアクセスや内部処理を入れない。

## SERVICE_USAGE基本形

```
SERVICE_USAGE
├─ event_id
├─ occurred_at
├─ actor_user_id
├─ feature
├─ operation
├─ target_type
├─ target_id
└─ metadata
```

### actor
- `actor_user_id` のみ保存。
- Discord ID、username、global_name等はservice_eventsへ保存しない。
- 必要ならD1 usersと後から照合する。

### target
- `target_type` / `target_id` を基本フィールドとして持つ。
- 対象がないイベントではNULL。
- 例: PLAYER_VIEW → target_type=PLAYER, target_id=governor_id
- 例: KINGDOM_VIEW → target_type=KINGDOM, target_id=2102

### metadata
- JSON metadataを持つ。
- ただし自由形式ではなく、イベントごとに許可項目を実装側で定義する。
- 例: PLAYER_SEARCH → search_type
- 例: PLAYER_EXPORT → format
- 具体的な全metadata一覧は実装時に確定する。

## 初期イベント種類（第7問・確定）
main branchの実コードを棚卸しし、現在ユーザーが明確に行える主要操作を基準に以下を初期イベントとして採用する。

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

除外/整理:
- PLAYER_RANK_HISTORY_VIEW: 現在APIは存在するが、ユーザー向けUI上の明確な操作として確認できないため初期イベントには含めない。
- KINGDOM_RANK_HISTORY_VIEW: 同様に初期イベントには含めない。
- GOOGLE_SHEETS_EXPORT: 独立イベントにはせず、PLAYER_EXPORT / KINGDOM_EXPORTのmetadata（例: format）で表現する。
- RANKING_VIEWという曖昧な共通イベント名は使わず、KINGDOM_RANKING_VIEWに具体化する。

## 第8問：event_id / 重複排除（確定）
- event_idはUUID v4。
- 生成はユーザー操作をSERVICE_USAGEイベント化する時点で`crypto.randomUUID()`を1回だけ呼ぶ。
- Queue投入後も同じevent_idを保持する。
- Consumerのリトライ時にevent_idを再生成しない。
- R2/後段処理でも同じevent_idを追跡キーとして使用する。
- 既存コードのchange_eventsでもcrypto.randomUUID()を使用しているため、既存実装思想とも整合する。

## 第9問：Queue/R2バッチ条件（確定）
### 通常保存
- 12時間ごとにR2へバッチ保存。
- 前半: 00:00〜11:59
- 後半: 12:00〜23:59
- gzip NDJSON。
- Queueはイベント単位で受け付け、Consumer側でバッチ化する。

### 手動Flush
SERVICE_USAGE専用管理サイトから任意タイミングでFlushできる。
- 通常の12時間スケジュールは変更しない。
- Flushは未保存イベントを対象に即時保存する。
- 同一イベントの二重保存を避けるためevent_idベースの冪等性を確保する。
- R2側では12時間単位の正規ファイルとして整理できるようにする。

## 第10問：R2 / Google Driveのファイル構成（確定）
### R2
R2は12時間単位の正規ファイルを基本とする。

概念:
```
service-events/
  2026/09/29/00-12.ndjson.gz
  2026/09/29/12-24.ndjson.gz
```

- R2では手動Flushごとに無制限に小ファイルを増やす設計にはしない。
- 手動Flush分は対象12時間枠の正規データへ安全に統合できる形で扱う。
- R2 objectへのappend前提にはしない。必要な場合は新しい完成済みobjectを書き換える/置換する方式を検討する。
- 実装時は同時Flush/通常Consumerで競合しないよう冪等性・排他・世代管理を設計する。

### Google Drive
Google Driveは長期アーカイブ時に日付単位で整理する。
通常バッチと手動Flushの履歴を追跡できる構造にする。

概念:
```
SERVICE_USAGE/
  2026/
    09/
      29/
        00-12/
          batch.ndjson.gz
          flush-001.ndjson.gz
        12-24/
          batch.ndjson.gz
          flush-001.ndjson.gz
```

Google Driveへの自動退避は後段フェーズで実装する。

## 第11問：Queue/R2障害・retry・DLQ（確定）
R2保存失敗時は「C方式」。

```
SERVICE_USAGE
  ↓
Queue
  ↓
R2
  ├─ 成功 → 完了
  └─ 失敗
      ↓
    自動retry
      ↓
    規定回数失敗
      ↓
     DLQ
      ↓
SERVICE_USAGE管理サイトへエラー表示
      ↓
     手動再処理
```

要件:
- 一時的なR2障害はQueue retryで吸収する。
- 規定回数失敗したイベント/バッチはDLQへ送る。
- 管理サイトで失敗状態を確認できる。
- 管理サイトから手動再処理できる。
- SERVICE_USAGE保存失敗が本来のユーザー操作の失敗扱いにならないよう、イベント記録は非同期にする。

## 第12問：Google Driveアーカイブ頻度（確定）
### 通常
- R2: 12時間ごと
- Google Drive: 1日1回
- 前日のR2データをGoogle Driveへアーカイブする。

概念:
```
毎日
SERVICE_USAGE
  ↓
Queue
  ↓
R2（12時間単位）

翌日
前日のR2データ
  ↓
Google Drive
  ↓
保存成功を確認
  ↓
R2から削除
```

### 重要な保全ルール
- Google Driveへの保存成功を確認するまでR2を削除しない。
- Drive側で失敗した場合、R2データは保持する。
- R2削除は「Drive保存成功確認後」に限定する。
- 管理サイトから任意タイミングで手動アーカイブ可能にする。
- Google Driveは長期保管場所、R2は短期の中間/保険層とする。

## 全体像

```
[EagleEyeユーザー操作]
        ↓
[SERVICE_USAGE event]
        ↓
[Cloudflare Queue]
        ↓
[12時間単位 Consumer Batch]
        ↓
[gzip NDJSON]
        ↓
[R2]
   ↙          ↘
通常保持       管理サイト
                ├─ 利用状況集計
                ├─ 保存状況
                ├─ Queue/DLQ
                ├─ 手動Flush
                └─ 手動アーカイブ

[R2 前日分]
        ↓ 1日1回
[Google Drive]
        ↓ 保存成功確認
[R2削除]
```

## 実装前に残っている設計確認
第7〜12問は確定済み。
次はこの仕様を実装仕様へ落とし込み、以下を具体化する。

- event schemaの型・必須/任意・timestamp形式
- 15イベントそれぞれのmetadata許可項目
- Queue message schema
- Queue retry回数 / backoff / DLQ構成
- R2 objectの確定命名
- 12時間バッチの確定境界とタイムゾーン
- 手動Flushと通常Consumerの競合制御
- Google Driveアーカイブの具体的なジョブ/実行基盤
- SERVICE_USAGE管理サイトの認証・権限
- 集計をR2上でどう行うか、必要なら別の集計用データ構造をどう持つか
- 実装後のテスト項目と本番確認項目

## 重要な既存アーキテクチャ
- Cloudflare Workers + D1 + R2 + MightPulse API
- GitHub repo: kingshot-bj/kingshot-data-platform
- main branch
- Worker: https://kingshot-data-platform.black-jack-kingshot.workers.dev
- ranking_snapshotsの広範な取得クエリは絶対に復活させない。
- ranking readsは原則kingdom_ranking_currentへ寄せる。
- Google Drive primitiveは既存src/google-drive.jsに存在するが、service_events自動退避にはまだ未接続。

## 次の進め方
第7〜12問の確定内容をこのMDを基準として扱う。
次は実装仕様の詳細化を一問ずつ進める。
未確定事項を実装者判断で勝手に確定しない。
