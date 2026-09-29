# EagleEye Discord Support Bot / Ticket Support 設計書

## 1. 目的

EagleEyeの「マイKingShot（領主ID）」登録における所有権トラブルや、その他の個別サポートを、Discord上の専用チケットで受け付ける。

特に以下を対象とする。

- 既に別のEagleEye/Discordアカウントに登録されている領主IDの移管申請
- 領主IDの本人確認
- 登録内容に関する個別問い合わせ
- 将来的なアカウント不正利用・規約違反の確認

公開コミュニティと個別サポートを分離し、本人確認情報を含む問い合わせは非公開チケットで処理する。

## 2. 基本構成

EagleEye公式Discordサーバーを作成し、用途別にチャンネルを分ける。

例:

- 📢｜お知らせ
- 📖｜使い方
- ❓｜FAQ
- 💬｜雑談
- 🆘｜サポート
- 🔒｜運営スタッフ

通常の質問は公開チャンネル、個人情報・本人確認を扱うものは非公開チケットへ誘導する。

### チケット方式

ユーザーが「サポートを開始」を選択すると、Botがユーザー専用の非公開チャンネルまたはThreadを作成する。

閲覧・投稿権限は原則として:

- 対象ユーザー
- EagleEye Support Staff
- EagleEye Owner

のみとする。

### EagleEye本体との連携

Discord Bot単体で所有権を判定しない。

Discord User
↓
Discord Bot
↓
Support Ticket
↓
EagleEye API
↓
D1

EagleEye側を所有権・アカウント状態の正本とする。

## 3. 領主ID重複時のフロー

EagleEyeでは同一のACTIVEな領主IDを複数ユーザーへ登録することを許可しない。

ユーザーAが、既にユーザーBへ登録済みの領主IDを登録しようとした場合:

1. 登録APIが重複を検出
2. ユーザーAへ「既に登録されています」と表示
3. Discordサポートへの導線を表示
4. Botでサポートチケットを作成
5. Botが本人確認フローを開始
6. ユーザーAが指定されたゲーム内スクリーンショットを提出
7. 運営スタッフが確認
8. 所有者本人と確認できた場合のみ移管
9. 旧リンクをDISABLED
10. 新リンクをADMIN_VERIFIED
11. EagleEye公式認証を付与
12. サポートチケットをRESOLVED

本人確認できない場合は移管せず、REJECTED等で終了する。

## 4. Botによる本人確認フロー

### Step 1: 対象確認

Bot:

> 登録したい領主IDを入力してください。

EagleEye APIで対象を確認する。

確認候補:

- governor_id
- kingdom
- 現在のEagleEye登録状態
- 現在の登録ユーザー
- 対象プレイヤー情報

### Step 2: 必要スクリーンショットを案内

Botが「どの画面を、何枚」提出するかを固定テンプレートで案内する。

例:

1. ゲーム内の領主プロフィール画面
2. 領主IDが確認できる画面
3. 本人であることを確認するため運営が指定した画面

必要枚数を明示し、提出済み枚数を管理する。

※実際の画面・枚数は、KingShot側で本人性を十分に確認できる画面を調査して正式決定する。

### Step 3: 画像提出

ユーザーがDiscordチケットへ画像をアップロードする。

Botは:

- 必要枚数
- 受付済み枚数
- 必須資料の種類
- 未提出資料

を管理する。

### Step 4: 一次チェック

Botが自動確認できる範囲:

- 必要枚数を満たしているか
- 添付ファイルが画像か
- ファイルサイズ等の基本条件
- 同じ画像の重複提出
- 申請対象との基本的な整合性

ただし、画像内容だけで所有権を自動確定しない。

### Step 5: 運営審査

運営スタッフには以下を表示する。

- request_id
- requester Discord ID
- 対象 governor_id
- 現在の登録ユーザー
- 対象プレイヤー情報
- 提出資料一覧
- 受付日時
- 現在のステータス

操作:

- 本人確認済み・移管＋公式認証
- 追加資料を要求
- 却下
- 不正登録の調査対象として記録

## 5. EagleEye側の状態

既存の user_player_link_support_requests をサポート案件の正本として利用する。

状態:

- OPEN
- UNDER_REVIEW
- RESOLVED
- REJECTED
- CANCELLED

移管成功時:

旧リンク:
ACTIVE → DISABLED

新リンク:
ACTIVE / ADMIN_VERIFIED

公式認証:

- official_verified_at
- official_verified_by_user_id

を設定する。

## 6. 不正登録への対応

第三者が他人の領主IDを無断登録した可能性がある場合、単一の申告だけで自動BANしない。

運営が申告内容、提出資料、EagleEye側の登録履歴、過去のサポート履歴、必要に応じて監査記録を確認する。

必要に応じて:

- 注意
- 登録解除
- アカウント停止
- BAN

等を運営判断で行う。

モデレーション結果は監査可能な形で残す。

## 7. チケットとEagleEyeのID連携

Discord上のチケット名だけを正本にしない。

最低限、以下を紐付ける。

- support_request_id
- Discord user ID
- Discord guild ID
- Discord channel/thread ID
- EagleEye user_id
- governor_id
- status

例:

support_request_id = SR-xxxx

をBotとEagleEye APIの双方で扱う。

## 8. API設計案

ユーザー側:

- POST /api/me/player-support
- GET /api/me/player-support/:requestId

Bot側:

- サポート案件作成
- 案件状態取得
- 添付資料受付状態取得
- 追加資料要求
- 審査完了通知

Owner / Staff側は既存の:

- GET /api/owner/player-link-support
- POST /api/owner/player-link-support

を継続利用する。

BotがOwner権限APIを直接持つのではなく、Bot専用の最小権限APIを設けることを優先する。

## 9. スクリーンショット保存

本人確認用スクリーンショットはD1へ保存しない。

原則:

Discord attachment
↓
Bot
↓
必要ならR2へ保存
↓
審査完了
↓
保持期限経過後削除

D1には画像そのものではなく、必要最小限のメタデータのみを保存する。

例:

- evidence_id
- support_request_id
- type
- submitted_at
- storage_key
- review_status

保持期間は別途Retention Policyとして決定する。

## 10. セキュリティ

### Bot権限

Botには必要最小限のDiscord権限だけを与える。

候補:

- チケット作成
- チャンネル権限設定
- メッセージ送信
- 添付ファイル参照
- チケットクローズ

不要な管理者権限は付与しない。

### EagleEye API認証

BotからEagleEye APIへ接続する場合:

- Bot専用認証情報
- 最小権限
- rate limit
- request audit
- Secret管理

を必須とする。

## 11. 自動化レベル

### Phase 1: 半自動

Bot:

- チケット作成
- 手順案内
- 必要資料チェック
- 受付完了
- スタッフ通知

スタッフ:

- スクリーンショット確認
- 本人確認
- 移管/却下

### Phase 2: EagleEye連携

- 既存登録確認
- support_request作成
- 案件状態同期
- 審査結果反映
- 公式認証反映

### Phase 3: 高度な自動化

可能な範囲で:

- 添付資料の種類判定
- 画像の基本的整合性チェック
- 不足資料の自動通知
- 審査キュー自動生成
- 未処理案件通知
- 重複・過去申請の自動照合

ただし、所有権の最終判断をAI/Botだけで自動確定しない。

## 12. 運営スタッフ画面

EagleEye Owner/Support Staff向けに、Discordチケットと同じ案件をWebでも確認できるようにする。

表示:

- 案件ID
- 申請者
- 対象領主ID
- 現在の所有者
- 提出資料
- 審査状態
- 担当者
- 作成日時
- 更新日時
- 解決内容

操作:

- 本人確認済み・移管
- 追加資料要求
- 却下
- 不正登録として記録
- チケットクローズ

移管操作は既存の verifyAndTransferPlayerLink() を利用する。

## 13. 監査

本人確認・移管は重要操作のため監査ログへ記録する。

最低限:

- support_request_id
- requester user_id
- governor_id
- old owner user_id
- new owner user_id
- resolver user_id
- resolution
- resolved_at

Discord上の会話ログだけを監査記録の正本にしない。

## 14. D1 / リソース方針

既存のEagleEye方針を維持する。

- SERVICE_USAGE本文をD1へ保存しない
- ranking_snapshotsの広範囲取得を復活させない
- サポート案件は必要なD1行だけ使用する
- スクリーンショット本体をD1へ保存しない
- Discord Botの過剰なポーリングを避ける
- イベント駆動方式を優先する

サポート機能追加によってD1 Free-tier消費を不必要に増加させない。

## 15. 公式認証マーク

本人確認済みのユーザーにはEagleEye上で:

**✓ EagleEye公式認証**

を表示する。

認証は自己申告ではなく、運営が本人確認・移管処理を完了した場合のみ付与する。

既存DBの:

- official_verified_at
- official_verified_by_user_id

を利用する。

将来的にプレイヤーカード、マイKingShot、プレイヤー検索、Watchlist等で同じバッジを表示できるようにする。

## 16. 重要な設計上の注意

### 領主ID重複

同一ACTIVE governor_idを複数ユーザーへ登録させない。

アプリケーションチェックだけでなく、D1側でもACTIVE状態を対象にしたUNIQUE制約/部分UNIQUE INDEXを追加して競合登録を防止する。

### 移管処理

旧ユーザーのリンク解除と新ユーザーへのリンク作成は、途中失敗による不整合が発生しないよう、事前検証とトランザクション等を利用して安全に行う。

### 証拠資料

スクリーンショットの提出だけで自動的に所有権確定しない。

運営が確認し、必要に応じて追加資料を要求できる設計とする。

## 17. 現時点の実装状況

既にEagleEye本体には以下が実装済み。

- user_player_links
- 領主IDの重複検出
- user_player_link_support_requests
- 所有権移管API
- Owner向けサポート案件画面
- EagleEye公式認証状態
- DiscordサポートURL導線

未実装:

- EagleEye公式Discordサーバー
- Discord Bot
- 自動チケット作成
- Bot ↔ EagleEye API連携
- スクリーンショット提出フロー
- evidence管理
- Discord ↔ support_request_idの完全同期
- Staff権限管理
- Botからの移管操作
- Discord通知
- 証拠資料Retention

現時点では設計段階であり、Discord Botによる本番サポートフローは未実装・未確認。

## 18. 次の実装順

1. EagleEye公式Discordサーバー構成を決定
2. Support Staff / OwnerのDiscord Role設計
3. Discord Botを作成
4. /support またはボタンからチケット作成
5. support_request_id発行・EagleEye API連携
6. 領主ID重複案件を自動判定
7. 本人確認テンプレートをBotへ実装
8. 必要スクリーンショットの提出管理
9. Owner/Staff向け審査UIとBotを同期
10. 移管・公式認証処理をEagleEye側へ接続
11. 監査ログ
12. 証拠資料Retention
13. 本番テスト
14. 本番運用開始

## 19. 本番確認ルール

EagleEyeの全体方針:

**本番環境で確認できていないことは、確認済みとは言わない。**

Discord Botについても:

- コード実装済み
- Bot deploy済み
- Discord接続確認済み
- テストサーバー確認済み
- EagleEye本番API接続確認済み
- 本番チケット作成確認済み
- 本人確認フロー実地確認済み

を明確に区別する。

本番で実際に確認するまでは「本番運用可能」「確認済み」とは扱わない。
