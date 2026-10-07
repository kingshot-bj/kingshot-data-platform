# BJ Merch / BJにゃんグッズ販売システム 実装計画書
## 2026-10-07 調査版

対象: kingshot-bj/kingshot-data-platform
ブランチ: main

## 1. 目的
BJにゃんの画像を1枚投入するだけで、画像受付、グッズ用画像検証・加工、商品情報生成、Amazon Merch on Demand Creator Dashboardへの自動投入、Amazon公開確認、Amazon URL/識別情報取得、EagleEye内BJにゃんSHOPへの自動掲載までを可能な限り自動化する。

目標は大量出品ではなく、画像1枚 → 1商品 → Amazon販売 → EagleEye SHOP掲載を極力無操作で完了させること。

## 2. 調査結果
### 2.1 Amazon Merch on Demand
Amazon公式では、artworkを提供し、商品タイプとカラーを選択し、価格を設定すると、Amazonが商品ページ作成・製造・発送・カスタマーサービスを担当する。先行費用や在庫をこちらで持つ必要がない。
公式: https://developer.amazon.com/apps-and-games/merch

### 2.2 専用商品登録API
現時点で公開されているAmazon公式資料から、Merch on Demand専用の商品新規登録APIは確認できない。
そのためAmazon連携を抽象化し、将来公式APIが提供された場合にもDashboard操作方式から差し替え可能な構造にする。

### 2.3 Amazon Agent Policy
Amazonは2026-03-04から、Amazon Servicesへアクセス・操作するAgentについて新しいAgent Policyを適用している。
主な要件は、Agentであることを明示すること、Agent名をUser-Agentに含めること、人間の操作を偽装しないこと、CAPTCHA等を回避しないこと、Amazon側のアクセス制限を回避しないこと、Amazonから停止要求があった場合は停止すること。
公式: https://sellercentral.amazon.com/help/hub/reference/external/GS83KH2MA7HM69PH
したがって本システムは、検知回避型ブラウザBotではなく、明示的なAmazon Agentとして設計する。

### 2.4 既存EagleEyeとの整合性
現在のEagleEyeにはCloudflare Workers、D1、R2、Queue、Job/Run管理、System Event/System Log、Status/Diagnostics、Owner権限、R2を一次保管とする設計が既にある。
BJ Merchは既存の王国収集処理へ混ぜず、独立した業務モジュールとして追加する。

## 3. 全体アーキテクチャ
EagleEye
├─ 既存機能
│  ├─ 王国
│  ├─ Player
│  ├─ Watchlist
│  ├─ Load Test
│  └─ System Status
└─ BJ Merch
   ├─ BJにゃん素材管理
   ├─ 商品管理
   ├─ 商品生成Job
   ├─ Amazon連携Agent
   ├─ Amazon公開確認
   └─ BJにゃんSHOP
          └─ Amazon商品ページ

## 4. 重要な設計原則
### 4.1 既存EagleEyeの収集処理を変更しない
MightPulse API Pool、Collection Semaphore、Watchlist、Ranking、Player収集、ranking_snapshotsの広範囲読み取り、既存R2_ONLY設計、Load Testには変更を加えない。

### 4.2 D1は軽量な管理情報
D1には商品メタデータ、Amazon識別情報、R2キー、状態、Job状態などを保存する。元画像・生成画像・プレビューなど大きなデータはR2へ保存する。

### 4.3 秘密情報をD1/R2/UIへ保存しない
Amazonログイン情報、セッションCookie、アクセストークン等をD1、R2、System Log、System JSON、GitHubへ保存しない。

## 5. Phase 0 — Amazon実機調査
実装前に実際のMerch Creator Dashboardで以下を確認する。
- 日本からの登録・利用条件
- 現在の参加/審査条件
- Creator DashboardのURL
- 商品登録画面
- 商品タイプ
- カラー選択
- 画像アップロード方式
- 画像ファイル形式
- 最大ファイルサイズ
- 必要画像解像度
- 商品ごとの画像テンプレート
- タイトル、ブランド、説明文、キーワード、価格の入力欄
- 保存/公開ボタン
- 商品公開後に取得できる識別情報
- 商品URL
- エラー表示
- CAPTCHA等のAgent判定機構
- Dashboard側にAgent操作を許可/拒否する設定の有無

Amazon公式Product Templatesを取得し、推測値ではなく現行テンプレートを正本として画像変換仕様を決める。

## 6. Phase 1 — BJ Merchデータモデル
新規Migrationを作成する。

### 6.1 bj_merch_products
想定項目: id, product_id, title, description, brand, product_type, color, price, currency, source_asset_key, artwork_key, preview_key, amazon_url, amazon_identifier, amazon_marketplace, status, published_at, created_at, updated_at, last_error_code, last_error_message

status例: DRAFT / ASSET_READY / READY_TO_PUBLISH / PUBLISHING / AMAZON_PENDING / PUBLISHED / EAGLEEYE_PUBLISHED / FAILED / PAUSED

### 6.2 bj_merch_jobs
1商品の処理履歴。job_id, product_id, job_type, status, started_at, completed_at, elapsed_ms, attempt_count, current_step, error_code, error_message, trace_id, metadata_json を保持する。

### 6.3 bj_merch_settings
Owner設定。デフォルト商品タイプ、デフォルト価格、ブランド名、Amazon Marketplace、自動公開ON/OFF、EagleEye自動掲載ON/OFFなどを保持する。

## 7. Phase 2 — R2素材管理
R2 prefix案:
bj-merch/v1/assets/<product_id>/
bj-merch/v1/artwork/<product_id>/
bj-merch/v1/preview/<product_id>/
bj-merch/v1/logs/<job_id>/
原画像とAmazon用加工画像を分離する。元画像は変更しない。

## 8. Phase 3 — 画像処理
画像投入後に自動実行する。
チェック対象: ファイル形式、解像度、アスペクト比、透明背景、印刷範囲、余白、画像破損、色空間、ファイルサイズ。
Amazon現行Product Templateに合わない場合は自動補正できるものだけ補正し、補正不能ならFAILEDとして理由を表示する。

## 9. Phase 4 — 商品情報生成
BJにゃん画像/設定から商品名、商品説明、ブランド、キーワード、価格候補を生成する。
禁止語・第三者商標・ゲーム固有名称などを検査する。販売用BJにゃんへ無許諾の第三者キャラクター、ロゴ、商標等を混入させない。

## 10. Phase 5 — Amazon Agent
Merch専用APIがないため、第一実装ではDashboard操作Agentを採用する。
Agentの役割: Amazon Creator Dashboardへアクセス、商品作成画面へ移動、商品タイプ選択、カラー選択、artworkアップロード、商品情報入力、価格入力、保存/公開、公開結果確認、商品URL/識別情報をEagleEyeへ返す。
安全条件: Agentであることを隠さない、Amazon Agent Policyに従う、CAPTCHAを突破しない、CAPTCHAが出たらPAUSED、Amazon側のブロックを回避しない、画面構造が変わった場合に無理やり送信しない、想定外の画面では停止、1商品単位でJobを分離、同一商品の二重公開を防止する。

## 11. Amazon Agentの実行場所
第一候補はAmazonログイン情報をEagleEye Workerへ直接持たせない構成。
EagleEye WorkerがJob指示を出し、BJ Merch Agentがユーザー側または許可された実行環境のAmazonセッションでDashboardを操作し、EagleEyeにはJob ID、Product ID、実行結果、Amazon URL、Amazon identifier、エラー情報だけを返す。

## 12. Phase 6 — Amazon公開確認
登録完了だけではEagleEye SHOPへ公開しない。Amazon登録成功、Amazon商品識別情報取得、商品URL取得、Amazon側公開状態確認を満たしてからPUBLISHED、EAGLEEYE_PUBLISHEDへ進める。

## 13. Phase 7 — EagleEye BJにゃんSHOP
公開URL第一候補: /shop
一般ユーザー画面: BJにゃんSHOP、商品一覧、商品画像、商品名、価格、新着、商品詳細、Amazonで購入。
決済はEagleEyeで行わずAmazonの商品ページへ遷移する。決済、在庫、製造、発送、返品、カスタマーサービスはAmazon側に任せる。

## 14. Phase 8 — Owner管理画面
Owner専用: /owner/bj-merch
表示: 商品数、Amazon公開済み、EagleEye掲載済み、処理中、エラー、最終Job、最終成功、最終失敗。
操作: 商品作成、画像アップロード、商品生成、Amazon登録開始、一時停止、再実行、EagleEye掲載/非掲載、商品非公開。

## 15. Phase 9 — System Status / System JSON
新機能を追加したら必ずSystem Status/JSONで確認できるようにする。
bjMerchの状態として status、activeJobs、queuedJobs、publishedProducts、failedJobs、lastSuccessAt、lastFailureAt、amazonAgent status/lastRunAt/lastError 等を追加する。
System Event例: ASSET_UPLOAD、PRODUCT_GENERATE、AMAZON_PUBLISH_START、AMAZON_PUBLISH_SUCCESS、AMAZON_PUBLISH_FAILED、AMAZON_PUBLISH_PAUSED、EAGLEEYE_PUBLISH_SUCCESS。

## 16. Job状態遷移
CREATED → ASSET_VALIDATING → ASSET_READY → PRODUCT_GENERATING → READY_TO_PUBLISH → PUBLISHING → AMAZON_PENDING → PUBLISHED → EAGLEEYE_PUBLISHED
異常時はFAILED。Amazon側で人間の確認が必要な場合はPAUSED。

## 17. 冪等性
同じ画像を二回投入してもAmazonへ同じ商品を二重登録しない。
Product IDを先に発行し、source asset hash、product_id、Amazon identifier、publish statusを紐付ける。再実行時は既存状態を確認して続きを実行する。

## 18. 失敗時の安全設計
Amazon Dashboardの画面構造変更を検知した場合は停止してFAILED/PAUSEDとし、推測操作でSubmitしない。
CAPTCHAは停止。回避機能は作らない。
Amazon側エラーはJobへ保存する。
EagleEye側エラー時はAmazon商品が既に公開されている可能性を考慮し、再実行前にAmazon側状態を確認する。

## 19. ログ・監査
全Jobにjob_id、product_id、trace_id、step、started_at、completed_at、elapsed_ms、status、error_codeを付ける。
Amazon認証情報・Cookie・秘密情報は絶対にログへ出さない。

## 20. D1/R2負荷方針
BJ Merchは大量処理を目的としないため、既存EagleEyeのD1負荷を増やさない。
1商品=1 Job、商品一覧はD1軽量列のみ、画像はR2、Jobログは必要最小限、System Statusも小さな集計SELECTとし、既存Watchlist/Ranking処理と同じCronに混ぜない。

## 21. 実装フェーズ
Phase 0 Amazon実機調査
Phase 1 Migration + 商品/Jobモデル
Phase 2 R2素材管理
Phase 3 画像検証・Amazon用変換
Phase 4 商品情報生成
Phase 5 Amazon Agent
Phase 6 Amazon公開確認
Phase 7 EagleEye BJにゃんSHOP
Phase 8 Owner管理画面
Phase 9 System Status / System JSON / Diagnostics
Phase 10 実機E2E

## 22. 最初のE2E目標
最初から複数商品にはしない。BJにゃんTシャツ1商品だけ。
成功条件: 画像1枚投入、Product ID生成、R2保存、商品情報生成、Amazon Dashboardへ自動投入、Amazon側で商品公開、Amazon URL取得、EagleEye /shopへ自動掲載、System Statusに成功状態、System JSONにJob履歴、失敗時に再実行可能。

## 23. 完全自動化の最終形
ユーザー操作はBJにゃん画像をEagleEyeへ入れるだけ。
システムは画像受付 → 検証 → Amazon用画像生成 → 商品情報生成 → Amazon Agent起動 → Merch Dashboard登録 → 公開確認 → Amazon URL取得 → EagleEye SHOP公開まで実行する。

## 24. 初期版で実装しないもの
大量一括出品、複数Amazon Marketplace同時展開、売上分析、広告管理、Amazon内SEO自動最適化、価格自動変更、自動広告、外部EC決済、在庫管理、発送管理、Amazon認証情報をWorkerへ保存する構成。

## 25. 完了判定
コード実装済み、Deploy済み、Amazon E2E済み、EagleEye E2E済みを明確に分離する。
コード実装済み=GitHub main反映。Deploy済み=Cloudflare本番Worker反映。Amazon E2E済み=実Amazonアカウントで登録から公開まで成功。EagleEye E2E済み=Amazon公開確認後にEagleEye SHOPへ自動掲載まで成功。

## 26. 今回の判断
実装GO。
理由: Amazon Merch on Demandは現在も提供され、在庫・先行費用・製造・発送をAmazonへ任せられる。Merch専用公開APIは確認できないがDashboardによる商品作成フローは明確。2026年からAgent Policyが明文化されている。EagleEye側にはD1/R2/Job/System Log/Statusという必要基盤が既にある。

したがって、Merch固有部分だけを新規モジュールとして作る。

最初の実装対象は、BJにゃんTシャツ1商品を完全自動で作成し、Amazon公開後にEagleEye SHOPへ掲載するE2E。

## 27. 次の作業
1. Amazon Creator Dashboardの実機登録フロー確認
2. 現行Product Template取得
3. 画像仕様確定
4. Dashboard画面遷移をAgent実装対象として固定
5. Migration設計確定
6. BJ Merch本体
7. Amazon Agent
8. BJにゃんSHOP
9. Owner UI
10. System Status/JSON
11. テスト
12. 本番E2E

Amazon側の未確認仕様を推測で実装しない。実機で確認した値を正本としてコード化する。