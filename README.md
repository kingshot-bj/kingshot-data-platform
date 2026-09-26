# EagleEye — KingShot Data Platform

KingShot のデータを集約・分析・監視するための EagleEye 基盤。

## Current architecture

- Runtime: Cloudflare Workers
- Database: Cloudflare D1
- Repository: GitHub
- Production branch: `main`
- Worker entrypoint: `src/index.js`
- Cloudflare configuration: `wrangler.jsonc`
- D1 database: `eagleeye-db`
- D1 binding: `DB`

## Development policy

EagleEye is designed for browser-only development and operation.

- No local Node.js requirement
- No Docker requirement
- No local database requirement
- Secrets are never committed to Git
- External API keys are stored as Cloudflare secrets / encrypted server-side resources
- Browser clients never call external data providers directly

## Current implementation status

### I-0 — Development foundation
- Repository and Cloudflare Worker foundation established.
- Browser/cloud-only development policy documented.

### I-1 — Discord authentication
- Discord OAuth2 login/logout implemented.
- Stateless signed OAuth state implemented for mobile/Safari compatibility.
- Signed session cookie implemented.

### I-2 — D1 database foundation
- D1 database `eagleeye-db` created.
- Worker D1 binding `DB` configured.
- `users` table and indexes created.
- Discord users are persisted on login.
- Existing users are updated instead of duplicated.
- Disabled users are not automatically reactivated.

### I-3 — MightPulse API integration
- Server-side MightPulse client foundation implemented in `src/mightpulse.js`.
- Player, Alliance, and Kingdom client methods prepared.
- Timeout, retry, 429, 5xx, and upstream error classification implemented.
- API key remains Cloudflare Secret-only.
- Public player API route and API Pool integration are intentionally deferred to later steps.

## Implementation roadmap

The implementation follows the approved EagleEye A-series architecture:

1. I-0 — Development foundation
2. I-1 — Discord authentication / users
3. I-2 — D1 database foundation
4. I-3 — MightPulse API integration
5. I-4 — Player search / detail
6. I-5 — API Pool / Admin
7. I-6 — Watchlist
8. I-7 — Change Events / Timeline
9. I-8 — Discord notifications
10. I-9 — Admin completion
11. I-10 — Integration testing / release

The existing EagleEye prototype UI is retained as the starting point and will be expanded incrementally.

## 2026-09-26 引き継ぎ基準（EagleEye / Player Profile / Google Sheets）

このセクションは、チャットをまたいで開発を再開するときのマスター引き継ぎ情報。以後の実装は、まず実コード・実データ・本READMEを確認し、推測で既存仕様を変更しない。

### 1. 現在のリポジトリと実行基盤
- Repository: `kingshot-bj/kingshot-data-platform`
- Branch: `main`
- Worker entrypoint: `src/index.js`
- Runtime: Cloudflare Workers
- Database: Cloudflare D1
- D1 DB: `eagleeye-db`
- D1 binding: `DB`
- External data provider: MightPulse API
- BrowserからMightPulseを直接呼ばず、Worker側からAPI Pool経由で取得する。
- SecretsはGitへcommitしない。

### 2. EagleEyeの設計思想
EagleEyeは「KingShotデータを集約・分析・監視する基盤」。
A-seriesの設計文書（EagleEye設計憲章・A-1〜A-7）を上位仕様として扱う。
API上の英語項目は、画面上では可能な限り公式日本語名称へ正規化する。
データ取得とユーザーへの表示・アクセス権を分離する。
Watchlist等の監視対象は、必要なものだけ通知する方針。

### 3. 現行のPlayer Profile
`/player?governor_id=...` でプレイヤー詳細を表示。
最上部の「PLAYER PROFILE」に基本プロフィールを集約する。
現在は以下のような基本項目を保持・表示できる：
- アバター
- プレイヤー名
- 王国
- 戦力
- 役場レベル
- VIP
- 撃破数
- 座標
- オンライン状態
- 最終活動
- 同盟
- 言語などのプロフィール補助情報

重要なUI方針：
- 「プロフィール詳細」という独立セクションに言語等を置くのではなく、プロフィール系情報は最上部のPLAYER PROFILEへ統合する。
- 同盟情報は折りたたみ式`<details>`で表示し、タップ時に下へ詳細を展開する。
- プレイヤーアバターはPLAYER PROFILEヘッダー側に統合済み。
- テーマはEagleEye全体でライト/ダーク切替を持つ。
- アイコンは過大表示しない。現在の目安はプレイヤー48px、英雄42px、同盟旗24px程度。

### 4. Player Profileのデータ可視性
`player_visibility_settings` により項目単位で表示可否を管理する。
主なキー：
- `base_identity`
- `base_power`
- `base_vip`
- `base_coordinates`
- `base_kills`
- `base_activity`
- `base_profile`
- `alliance_identity`
- `alliance_rank`
- `alliance_stats`
- `heroes_list`
- `heroes_skills`
- `heroes_exclusive_gear`
- `heroes_gear`
- `hero_rankings`
- `ranks_core`
- `ranks_leaderboards`
- `gov_gear_list`
- `gov_gear_gems`

ロール：
- BASIC
- ADVANCED
- ADMIN
- OWNER

エクスポート権限は表示権限とは別に考える。Google SheetsエクスポートはADMIN / OWNERのみ。

### 5. 英雄ランキング／英雄総力
Kingdom ranking boardsには以下が存在する：
- `single_hero`
- `hero_total`
- `hero_no_equip`
- `hero_equip`

UIの現行ラベル：
- `single_hero` → 「英雄総力」
- `hero_total` → 「英雄全体総力」
- `hero_no_equip` → 「英雄総力（装備除外）」
- `hero_equip` → 「英雄総力（装備込み）」

重要：
- プレイヤーAPIの`heroes`から英雄戦力を単純合算する方式は採用しない。
- 英雄ランキング表示はD1の`ranking_snapshots`に保存されたランキング値を利用する。
- Kingdom boardは上位100件取得のため、100位外のプレイヤーにランキングカードが存在しないケースがある。これは現行仕様上の制約として扱い、推測で値を算出しない。
- 「最高レベル（取得データ内）」はランキング値とは別の派生表示。

### 6. 英雄・アイコン・日本語名
MightPulseのプレイヤーデータから英雄アイコンURLを取得し、Workerで正規化して表示。
hero icon、player avatar、alliance flagは`normalizeProfileAssetUrl`で絶対URL化する。
英雄日本語名は`HERO_NAME_JA`で正規化する。

注意：
- 英雄名の日本語表記は資料間で差異が確認されているものがあるため、未確認の名前を勝手に確定しない。
- 正式名称を変更する場合は、まず公式／信頼できるゲーム資料で確認してから変更する。

### 7. 領主装備
`gov_gear.items` を表示。
主な表示項目：
- スロット
- 品質
- Tier
- ★
- 強化
- スコア
- 戦闘力
- 宝石

領主装備スロットは日本語化：
- head / helmet / hat → 帽子
- necklace / accessory / ornament / decoration → 装飾
- cloak / robe / mantle → ローブ
- pants / trousers → ズボン
- ring → 指輪
- weapon / staff / rod → 杖

Tierは日本語品質名へ正規化：
- Green → グッド
- Blue → レア
- Purple → エピック
- Gold → レジェンド
- Red → 神話
T番号が存在する場合は`神話 T6`等のように保持する。

### 8. 宝石表示の重要事項
現在の`localizeGemLevel`は、直接`level` / `lv` / `gem_level`が存在する場合はそれを優先。
それらが無い場合、観測データのIDパターン`101 / 202 / 303 ...`から`1 / 2 / 3 ...`を表示するフォールバックを持つ。
例：
- 101 → Lv.1
- 202 → Lv.2
- 303 → Lv.3

ただし、これは現時点でMightPulse公式API仕様にIDとLvの対応が明記されていることを確認したものではない。
したがって、この変換を「公式仕様」として扱わず、将来実データまたは公式資料で確認できたら根拠を更新する。
UI上で「宝石、宝石」としか表示されない不具合が発生した場合、まず実payloadの型（object / string / number）を確認する。
直近ではIDが文字列・数値として入るケースを考慮するよう修正済み。

### 9. Google Sheetsエクスポート方針
今回追加する正式方針：
- D1はEagleEyeの本体DBとして維持する。
- Google Sheetsは、人間が閲覧・分析・バックアップする外部エクスポート／データ倉庫として扱う。
- D1をSheetsへ置き換えない。
- 大量履歴・分析用データをD1へ永久保存し続けることによる圧迫を避ける用途としてSheetsを利用する。

現在`src/google-sheets.js`は既に存在し、GoogleサービスアカウントJWTでSheets APIを呼び出す基盤がある。
設定環境変数：
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

既存の`exportToGoogleSheet(env, { sheetTitle, headers, rows })`は、指定Spreadsheet内にタブを作成し、ヘッダー＋行をappendする方式。

### 10. Player ProfileのSheetsエクスポート現状
`src/index.js`に既に`handlePlayerSectionExport`があり、エンドポイント：
`/api/admin/player-export?governor_id=...&section=...`

許可section：
- `profile`
- `alliance`
- `heroes`
- `rankings`
- `gov_gear`

現在のUI側では`renderPlayerAdvancedSections(profile, governorId, canExport)`からADMIN/OWNERだけに「スプレッドシート出力」リンクを出す構造へ移行中。

認可はUIだけに依存せず、Export API側でも`requireAdmin(request, env)`を実行する。
つまり：
- BASIC → export不可
- ADVANCED → export不可
- ADMIN → export可
- OWNER → export可

URL直打ちでも権限外ならエクスポートできないことが必須。

### 11. Exportの対象
現在の方針：
- プロフィール
- 同盟
- 英雄
- ランキング
- 領主装備

将来的に必要なら更に項目を追加できる。
「それぞれの項目ごとにエクスポート」なので、1クリック1セクションを基本とする。
Spreadsheet内の各タブ名は日本語セクション名で統一する。

### 12. Google SheetsエクスポートとD1設計
目的は「D1を丸ごとSheetsへ置換」ではない。
推奨アーキテクチャ：
D1 = トランザクション／検索／権限／Watchlist／最新値／Change EventなどEagleEyeの実行系データ
Sheets = Admin/Owner向けの可視化・分析・バックアップ・大量エクスポート

将来、履歴を長期保存する場合も、保持期間をD1側で制御し、必要に応じてSheetsへ退避する設計を優先する。

### 13. Cloudflare D1容量についての基準
D1 Freeには容量・読み書きの制限があるため、D1を無制限の歴史データ保管庫として設計しない。
現在はRetention機能が存在する。
`src/retention.js` と`runDataRetentionJob`により、D1の古いデータを定期 cleanupできる。
今後の容量対策は：
1. 必要な最新データをD1へ保持
2. 履歴を保持期間で削除
3. 必要に応じてSheetsへエクスポート
4. 利用規模が増えたらD1有料化等を検討
の順で考える。

### 14. 現在までの重要コミット（時系列）
- `ffb4c93a88f0d6cb1b96a735bf1b8bc3a7b0dd29` — 壊れた`src/index.js`を復元した基準点
- `cc6720c6431611e181d7cfdf6be7b1fb6d08dae4` — 復旧
- `0ce2e2456ffb03908b851fa1831e1e8acaecfc16` — Watchlist job table
- `ed976d123f611bcf21b833177ccb391b14b84988` — Watchlist refresh diagnostic
- `48e13a3982d01f13bf82c857d15170f1bba8520b` — diagnostic syntax fix
- `36fbcee5008550eb0df3dda97fdfa337668f288fc` — D1 binding bug
- `4710b3d4d4b68150552d2acf9d0eb294a0df2e16` — server-side Watchlist lock
- `008a6729968b29841119cc410d8ad8d1fe358967` — duplicate-click feedback
- `54374ed35a229d17bb69ba3bd19522eb01efb68` — Watchlist progress
- `388b3903f4c6182be4a2e62232ed5233e33cb38a2` — EagleEye labels/theme
- `f5b523a8beaad69ebf22d7b3d346347e1fdc6db7` — K/M/B formatting
- `1d1caedbe76c8d685c8bb57868d0e793ff98d46e` — formatter scope fix
- `ff7df80f24e7bc7aab7c74e2335cc9cdf33e5590` — alliance abbreviations
- `44dee9cc042bedbf2977649fffa737499028af3a` — alliance abbreviation + name
- `a548e55cf0ea14e7b3173af383191accaff9ae4e` — player alliance abbreviation
- `4fb2c3d5c0f1b792f9f84a8bd1f6025852c9e30f` — abbreviation before player name
- `e5dd0a57813fc95e16b472460a6a3e600e61a956` — observed player alliance abbreviation
- `31deafb2f1b426f8cd1a5323ac7657c57d2c00d3` — resolve player alliance by governor ID / UID
- `8b0a3951286215032f66b43ee6950662d30f0fd8` — attach alliance abbreviations
- `5e94e9b` — player ranking target type fix
- `ae516177` — ranking alliance lookup SQL fix
- `adb3b7b53336b308c4a4a376f3ce2bad667801bd` — player hero totals from ranking data; removed naive hero power summation
- `987ef130ccd4006a0ac5d8ad3b7dc2609898775` — exposed unused player profile data
- `5590a429503259813ac890a6b8c9fea47506d475` — governor gear Tier / gem-level formatting
- `dec8020bfb3e37aac53ca9253480342b3010d72e` — player profile localization / readability
- `2b5db4a75d41f24dd4aa7b534cefe8763f2a57f8` — Japanese labels / player status UI
- `91679587faaed5b5e98a85f752993da891a9d488` — hero Japanese-name localization
- `40245161baf29a8f007244145576836941e9d717` — governor gear slot labels
- `40a458a3b99cfe83e1029223ddf3f470d3c4606a` — governor gear rarity localization
- `65720ab7888d118b65e246aea05f1c4163c0ed08` — temporary governor gear icon debug
- `42a17650ecc474b06dffba830fed01be8e9feb11` — temporary debug page independent of API fetch
- `031676c15a4ac31732ad88b98642a2b9340c4148` — temporary player/hero icon debug
- `8b71a39660de63f469fb97b2ef80f41300cded41` — debug regex fix
- `46f887cb7fc1cb497ec5d089b2b5631e4c009840` — compact icons / API Pool error display
- `0da85ef52120546f088461c3050298484b911017` — EagleEye-wide theme / governor gear icons
- `26327788d7fec98936095d1ae08bb2a8a7905d4` — theme syntax fix
- `67ab2ef7326ff7df3a02955f18a436c2f0f656de` — governor gear labels fully Japanese
- `9aee39f9c212901db97fe86ef0ae68a6b8a1c029` — player avatar moved into PLAYER PROFILE
- `0ee8ab5c46e385b91624e4f95b4ba9c9a8448d09` — alliance accordion / restore hero summary / gem level inference
- `101c3f355ce0aa0d9477de5eb74f8f028c449782` — gem level parser supports object/string/number input forms

### 15. 既知の注意点
- 本番デプロイ済みかどうかは、最新の`wrangler deploy`成功ログで確認するまで「デプロイ済み」と断定しない。
- 一時debug endpointは本番機能と混同しない。不要になったら削除候補。
- MightPulse APIの公式仕様にない値を勝手に算出しない。
- ランキング順位はboard配列順を順位として保存しているため、APIが返す順序を根拠にしている。APIが明示順位を返しているわけではない点に注意。
- `players`テーブルだけでは古いranking snapshotに存在する上位プレイヤーを必ずしも解決できない。
- 変更は必ず実コードを読んでから行う。既存の仕様と重複した新処理を作らない。

### 16. 次に再開するときの実装タスク
直近のユーザー要求は以下：
1. 「プロフィール詳細」の言語などプロフィール補助情報を最上部PLAYER PROFILEへ完全統合。
2. 項目ごとのGoogle Sheetsエクスポートを実装・整理。
3. エクスポート可能なのはADMIN / OWNERのみ。
4. エクスポートAPI側でも認可する。
5. 既存`src/google-sheets.js`の実装を再利用し、無駄に別のSheets実装を作らない。
6. エクスポート各タブの列名・データ範囲を既存Player Profileの表示仕様と一致させる。
7. 実装後、GitHub上の実コードを再読込し、構文・ルート・権限・表示の整合性を確認してからデプロイへ進む。

### 16-1. 王国ランキング（ADMIN / OWNER向け）
- API Pool管理画面の「テスト」とは分離し、`/admin/kingdom-rankings` に管理者向けの実運用画面を追加。
- ADMIN / OWNERが王国番号（鯖番号）とランキング種別を選択し、必要なランキングだけを取得・閲覧できる。
- 表示件数は10 / 50 / 100位から選択。
- 取得時は既存のWatchlist用API Pool処理を再利用し、`SYSTEM_WATCHLIST` → `SYSTEM_GENERAL` の順で利用可能なAPIキーを取得。
- 取得したランキングは`ranking_snapshots`へ保存し、画面はD1の最新スナップショットを表示。
- 同じランキングの全26種を一括取得する機能ではなく、「必要なランキングだけを都度取得する」用途。
- ADMIN / OWNERは取得済みランキングを既存のGoogle Sheets連携へ出力可能。
- Google Sheets出力は`/api/admin/kingdom-ranking-export`から行い、D1の本体DBをSheetsへ置換しない。
- Player Section exportも仕様どおりADMIN / OWNERを許可。
- `extractKingdomRankingEntries`は同期関数。MightPulseランキングpayloadから配列候補を抽出する。
- 2026-09-26時点では本機能のコードはGitHubへcommit済みだが、本番デプロイ成功は別途確認すること。
### 17. 作業ルール
- 「推測しない」。まずコード、DB、API実データ、既存設計を確認。
- 確認できないことは「未確認」と明示する。
- 仕様を変更するときは、既存実装との重複を避ける。
- 一つの大きな変更を入れた後は、commit → 実コード再取得 → 必要ならdeploy/production確認の順で進める。
- ユーザーがスクリーンショットを提示した場合、その画面から確認できる事実を優先してUIを調整する。


### 18. チャット継続時の最重要引き継ぎルール

**GitHub上のコードだけを読んでも、直前のチャットで決めた仕様・判断理由・未確定事項までは完全には復元できない。**
そのため、新しいスレッドでEagleEye開発を再開する場合は、コードだけを見て仕様を推測せず、必ずこのREADMEの引き継ぎ情報を確認する。

特に以下は「コードに実装されている事実」と「チャット上で決めた設計方針」を区別して扱うこと。

#### 18-1. チャット上で確定したUI方針

- 「プロフィール詳細」という独立セクションは不要。
- 言語・役職・シールド終了・炎上終了などのプロフィール補助情報も、最上部の「PLAYER PROFILE」に統合する。
- 同盟情報は折りたたみ式にする。通常時は小さく「同盟情報」だけを表示し、タップすると詳細が下方向へ展開される。
- プレイヤーアバターはPLAYER PROFILEヘッダーへ統合する。
- 英雄・領主装備などのアイコンは大きくしすぎず、モバイル画面で情報量を確保する。
- EagleEye全体にライト／ダークテーマ切替を持たせる。

#### 18-2. Google Sheetsエクスポートの確定方針

- 「それぞれの項目ごとにスプレッドシートへエクスポートできる」機能を持たせる。
- エクスポート対象の基本単位は、プロフィール／同盟／英雄／ランキング／領主装備。
- エクスポートできるロールは **ADMIN と OWNER のみ**。
- BASIC / ADVANCED はエクスポート不可。
- UIでボタンを隠すだけでは不十分。エクスポートAPI側でも必ず認可する。
- Google SheetsはEagleEye本体DBの代替ではなく、管理者向けのエクスポート・分析・バックアップ先として扱う。
- D1をそのままGoogle Sheetsへ置き換える設計にはしない。
- D1の容量・履歴増大対策として、RetentionとSheetsへの退避を組み合わせる方向で設計する。
- 既存のGoogle Sheets実装があるため、新しいSheets連携を重複実装する前に必ず `src/google-sheets.js` と既存export処理を確認する。

#### 18-3. 宝石表示についての注意

現在、宝石が「宝石」「宝石」としか表示される問題に対して、IDが文字列・数値として入るケースも処理するよう修正済み。

ただし、
- `101 → Lv.1`
- `202 → Lv.2`
- `303 → Lv.3`

という変換は、現時点ではMightPulse公式API仕様として確認済みの定義ではない。
**このID→Lv変換を公式仕様だと断定しないこと。**
今後、実payloadまたは公式資料で対応関係を確認できた場合にのみ仕様として昇格する。

#### 18-4. 「英雄総力」に関する注意

ユーザーは「英雄総力」が画面から消えていたことを指摘しており、英雄ランキング表示を復元した経緯がある。

- `single_hero` の画面ラベルは現在「英雄総力」。
- `hero_total` は「英雄全体総力」。
- `hero_no_equip` は「英雄総力（装備除外）」。
- `hero_equip` は「英雄総力（装備込み）」。

英雄APIの `heroes[].power` を単純合算して「英雄総力」を作る方式には戻さない。
ランキングスナップショットを根拠にする。

#### 18-5. 実装確認の原則

新しいスレッドで再開した場合、最初に以下を確認する。

1. `README.md`
2. `src/index.js`
3. `src/google-sheets.js`
4. `src/mightpulse.js`
5. `src/ranking-store.js`
6. 必要に応じてA-series設計文書
7. 実際のMightPulse payload / D1データ
8. 最新commitとデプロイ結果

**「コードにないから未決定」と判断しない。**
逆に、**「チャットで決めたから実装済み」とも判断しない。**
仕様決定・実装済み・未実装・未確認を必ず分離する。

#### 18-6. 直近の実装状態

直近のコード変更：
- `0ee8ab5c46e385b91624e4f95b4ba9c9a8448d09`
  - 同盟情報を折りたたみ式へ変更
  - 英雄サマリー／ランキング表示を復元
  - 宝石Lv表示フォールバックを追加
- `101c3f355ce0aa0d9477de5eb74f8f028c449782`
  - 宝石Lv判定をobject/string/number形式に対応

最新状態を「本番反映済み」とは、`wrangler deploy` の成功ログを確認するまで断定しない。
### 19. D1 → R2 長期アーカイブ方針（2026-09-26）

D1を長期履歴の無制限保管庫にしないため、Retention cleanupとR2 archiveを連携する。

- D1 = 現在値・検索・権限・Watchlist・必要な直近履歴などの実行系データ
- R2 = 長期履歴・大量snapshot・研究用の原データ保管庫
- Google Sheets = 人間が閲覧・分析・研究するためのExport先

現在の実装：
- `src/r2-archive.js` を追加。
- `api_observations` / `player_snapshots` / `ranking_snapshots` / `player_rank_snapshots` / `change_events` をR2退避対象とする。
- Retention cleanupは、対象行をR2へgzip圧縮NDJSONとして保存してから、D1の同一rowidを削除する。
- R2への保存に失敗した場合、その対象行はD1から削除しない。
- `api_pool_usage` は運用データのため、現時点ではR2研究アーカイブ対象にせず従来どおりRetention削除する。
- R2 bindingは `ARCHIVE`、bucket名は `eagleeye-archive`。
- バケット自体の作成と本番Workerへのbinding反映は別途Cloudflare側で確認する。

### 19-1. R2アーカイブ詳細設計

R2のオブジェクト構造、保存形式、再試行、復旧、研究データ化、セキュリティ、コスト安全方針の詳細は `docs/r2-archive-design.md` を正とする。

### 20. 研究用データ蓄積（Google Sheets）

Google SheetsはD1の代替DBではなく、研究・分析用データセットの蓄積先として維持する。

想定する研究データ：
- プレイヤーの時系列スナップショット
- 王国ランキングの時系列データ
- 英雄・領主装備の観測値
- Change Event
- Watchlistで取得した観測結果

基本フロー：
R2/D1 → Workerで研究用データセット化 → Google Sheets

Google Sheetsの直接API連携コードは既存の `src/google-sheets.js` を再利用する。サービスアカウントJSONキー方式はGoogle Cloud側の組織ポリシーにより現在利用できないため、Apps Script Web App + HMAC署名方式を追加した。`GOOGLE_SHEETS_WEBAPP_URL` と `GOOGLE_SHEETS_WEBAPP_SECRET` が設定されている場合はこの方式を優先し、未設定なら従来のSheets API方式へフォールバックする。

Google Sheetsを研究データの一次保管先にせず、長期原データはR2、EagleEyeの実行系データはD1を正とする。

### 21. R2 Cost / Safety Guard（Discord連携時に実装）

R2の利用量増加によって、知らないうちに処理停止したり、異常なデータ増加を見逃したりしないための安全設計。これはR2導入直後には実装せず、将来のDiscord通知・監視基盤を実装する段階で追加する。

確定方針：
- R2のストレージ使用量・Class A / Class B操作量を監視する。
- 無料枠到達前から管理者へ警告できるようにする。
- 無料枠を超えたことだけを理由に、EagleEyeのアーカイブ処理を勝手に停止しない。
- 通常の超過は「警告＋継続」を基本とし、データ収集が知らないうちに止まる状態を避ける。
- 通常値から大幅に外れた急激な容量増加・操作数増加など、明らかな異常時には緊急警告を出す。
- 本当に停止が必要なケースは、無料枠超過ではなく、無限ループや異常処理などの暴走を想定した非常停止として扱う。
- Discord連携時には、使用量・警告・異常増加・必要に応じた停止状態を通知できるようにする。

重要：Cost / Safety Guardは「コスト削減のために自動停止する仕組み」ではなく、「運用継続を維持しながら異常とコスト増加を人間へ知らせる仕組み」を基本思想とする。

### 22. D1 / R2 無料枠・容量・使用量 Safety Guard 方針

R2だけでなく、Cloudflare D1についても、無料枠・容量・読み書き量などの使用上限を超える可能性がある項目は、将来的にDiscord監視・通知基盤と連携して安全管理する。

確定方針：
- D1のストレージ容量、読み取り量、書き込み量、その他Cloudflare側で監視可能な使用量・制限項目を対象とする。
- R2についてもストレージ、Class A、Class B等の使用量を対象とする。
- 無料枠・上限に近づいた段階で管理者へ警告する。
- 無料枠を超えたことだけを理由に、EagleEyeのデータ収集・監視処理を勝手に停止しない。
- 通常の超過は「警告＋継続」を基本とする。
- 急激な増加、異常なクエリ／書き込み、無限ループ等の明らかな異常は別途異常警告・非常停止対象とする。
- 対象項目は今後のCloudflare料金・制限仕様の変更に合わせて見直す。
- Discord連携実装時に、D1/R2の使用量・上限・警告状態をまとめて管理できる監視機能として実装する。

重要：EagleEyeは「無料枠を絶対に超えないために勝手に止まる」設計ではなく、「運用を継続しながら、コスト・容量・使用量の増加を早期に人間へ知らせる」設計を基本とする。必要に応じて管理者が有料化・保持期間変更・アーカイブ方針変更等を判断する。

### 23. 今後の機能追加における使用量・コストSafety原則

今後EagleEyeへ新しい機能・外部サービス・データ保存先・定期処理・API連携等を追加する場合も、D1/R2と同じ考え方を適用する。

実装前に必ず以下を確認する：
- 無料枠・容量・API回数・読み書き量・実行時間・その他のサービス制限が存在するか。
- 利用者増加時にどの使用量が増えるか。
- 想定外のループや大量リクエスト等で使用量が急増する可能性があるか。
- 上限接近を検知・通知できるか。
- 上限超過時にサービスを勝手に停止させる必要があるか、それとも警告＋継続が適切か。
- 異常時のみ非常停止する仕組みが必要か。

新機能は「実装できるか」だけでなく、**運用時の容量・コスト・制限・暴走リスクまで含めて設計してから実装する**。

原則として、正常な無料枠超過を理由に利用者に気付かれないまま機能を停止させない。警告・可視化・管理者判断を優先し、明らかな異常動作のみ自動停止の対象とする。

### 24. MightPulse freshness / Watchlist timestamp policy（2026-09-26）

王国ウォッチリストの「更新完了時刻」と、MightPulseが返したデータの基準時刻を混同しない。

- EagleEye更新完了 = EagleEye側のWatchlistジョブが完了した時刻。
- MightPulseデータ基準時刻 = MightPulseレスポンスの cached_at を正規化した時刻。
- source_observed_at をランキング・プレイヤー・スナップショット系へ保存し、D1の observed_at（EagleEye取得時刻）とは分離する。
- Watchlistジョブでは取得したMightPulseデータの基準時刻を source_first_at / source_last_at として保持する。複数のboard/sectionで鮮度が異なる可能性があるため、単一時刻に潰さず範囲として表示する。
- MightPulse公式API仕様では、Playerレスポンスに fresh / cached_at / age_seconds が存在し、各include sectionは個別に鮮度管理される。レスポンスは最大60分古い場合がある。cached_at が存在しないレスポンスではEagleEye側で推測せず「未取得」とする。
- Watchlistのライト/ダークテーマはEagleEye共通の data-eagle-theme を使用し、ページ独自のテーマ状態を持たせない。


### 25. 王国ランキング管理者機能・キャッシュ／権限設計（2026-09-26 チャット確定）

このセクションは、2026-09-26の直近スレッドで決定した仕様と未解決事項を、新しいスレッドへ引き継ぐための補足。**実装済みの事実と、チャットで決めた未実装仕様を混同しないこと。**

#### 25-1. 目的
- API Pool管理画面の「テスト」とは別に、実運用として必要な王国ランキングだけを取得して見る画面を作る。
- 王国番号（鯖番号）を指定し、26種類から必要なランキングを選択して取得・閲覧。
- D1保存済みなら条件に応じてD1から表示し、必要時のみMightPulse APIをAPI Pool経由で取得。
- 取得データはD1へ保存。ADMIN / OWNERはGoogle Sheetsへエクスポート可能。
- API Pool画面はキー管理・診断用途に限定し、実ランキング閲覧は別画面。
- iPhone/Safari前提のモバイルUI。

#### 25-2. 王国ランキングの取得ルール
1. D1に対象ランキングがない場合、BASIC / ADVANCED / ADMIN / OWNERとも初回API取得を許可し、D1へ保存して表示する。
2. D1にデータがある場合、BASICは基本的にD1保存データを表示する。古くても既存データは見せる。
3. ADVANCED以上はD1の鮮度を確認し、管理設定された「D1データ再取得間隔」を超えていればAPI取得して更新する。
4. ADVANCED以上は、最後の更新から24時間以上経過したデータをそのまま使い続けない。24時間超ならAPI取得を試みる。
5. 「最新取得」はADVANCED以上を初期許可とし、管理設定で最低権限を変更可能にする。
6. 「最新取得」はD1鮮度判定を無視してMightPulse APIへ強制問い合わせする。
7. API取得失敗時に古いD1を表示するかエラーにするかは実装時に明示決定する。推測で決めない。

#### 25-3. D1データ再取得間隔（TTL）
チャットではTTL（Time To Live）という言葉を使ったが、UIでは技術用語を避ける。設定名は「D1データ再取得間隔」などにする。
候補：15分 / 30分 / 60分 / 120分 / 180分 / 360分。30分は初期値候補。
これはMightPulseの更新周期ではなく、**EagleEyeがD1キャッシュを再利用してよい時間**。
別に「最大更新保証期間」を持たせ、ADVANCED以上は24時間を超えたデータをそのまま表示し続けない。

#### 25-4. 最新取得権限と公開設定
既存のデータ公開設定へ王国ランキングを統合する。
- データ公開最低権限
- 最新取得最低権限
を別々に設定可能にする。
権限ランクは BASIC=1 / ADVANCED=2 / ADMIN=3 / OWNER=4。
既存の「○○以上」方式と統一する。
可能ならランキングボード単位で設定する。例：戦力は公開BASIC以上・最新取得ADVANCED以上、秘境の試練は公開ADVANCED以上・最新取得ADMIN以上など。
**データ公開権限とAPI取得権限は別物。**

#### 25-5. Watchlistとの違い
Watchlistの「更新」ボタンは、既存コード上、各ランキングについてfetchKingdomRankingThroughApiPoolを呼び、API Pool経由でMightPulseへ取得しに行く。D1を読むだけではない。
現在のprocessKingdomWatchlistJobはWATCHLIST_RANKING_BATCH=8でランキングを順番に処理するため、26ボード全部の更新には複数ジョブ実行を要する。並列化は別タスク。

#### 25-6. MightPulse freshnessについての確定認識
2026-09-26時点で公式MightPulse APIドキュメントを確認した結果：
- Player / Allianceのレスポンスは最大60分古い場合がある。
- 60分を超えて古い対象sectionについて更新を最大90秒待つ仕様がある。
- それでも更新できなければ最後に保存されたデータが返る場合がある。
- Playerレスポンスにはfresh / cached_at / age_secondsがある。
- **MightPulseが毎正時に必ず更新する、1時間ごとに必ず新データになる、という仕様ではない。**
- **Kingdomランキングについては、公式ドキュメント上、Playerと同じ最大60分古いというfreshness保証を確認できていない。**
- Kingdom ranks endpoint自体は正式に存在し、board/limitを指定できる。
- EagleEyeの30分・60分等の再取得間隔は、MightPulseの更新周期ではなくEagleEyeのD1キャッシュ再利用ルール。

#### 25-7. 最重要：ランキング表示が古い可能性の調査
ユーザーから「2日前に名前を変えたプレイヤーがランキング表示では古い名前のまま。更新を押してAPIを取得しているのに、古いランキング表示を続けているのではないか」という疑いが出た。
これは**未確認のバグ候補**。次スレッドで最優先確認する。
確認対象：
1. Watchlist更新時にMightPulse API取得が実際に成功しているか。
2. APIレスポンスに新しい名前が入っているか。
3. saveKingdomRankingBoardが新しいsnapshotをD1へ保存しているか。
4. ランキング表示APIがMAX(observed_at)で最新snapshotを選んでいるか。
5. 表示時にplayersテーブルや古いsnapshotからnick_nameを上書きしていないか。
6. 同じkid + boardについて最新snapshotと古いsnapshotが混在していないか。
7. ranking_snapshotsのobserved_atとsource_observed_atを比較する。
8. 更新完了と画面表示の間で別の古いデータ取得APIが使われていないか。
特に現在確認できているhandleKingdomWatchlistDataApiでは、board指定時にranking_snapshotsからMAX(observed_at)を取得するSQLがある。ただし、これだけでは画面上の名前の出所まで完全には確認できていない。実コードを再読してAPI payload → save → read → renderの流れを追うこと。

#### 25-8. API Pool ranking testの実測と関連コミット
- /api/admin/api-pool/test-rankingを追加。ADMIN / OWNER、王国番号（鯖番号）＋ranking dropdown、SYSTEM_WATCHLIST → SYSTEM_GENERAL fallback、MightPulse取得時間を計測。
- 1524 / radiant_spireの実測：HTTP 200、Pool SYSTEM_GENERAL、約2391ms、entry_count 0、source基準時刻未取得。
- entry_count 0はAPIが空とは限らず、ランキングpayload parser不一致の可能性がありextractKingdomRankingEntriesを追加。
- parser修正コミット：55b5827a698b597a2c3964d00619336947a1d695（このチャット時点で本番デプロイ未確認）。
- 関連：908399c8738ae467c2e83fe7598b5b98edebd9d2 ranking test追加、960df68814bdb0a29dc8a2a44b9890d66e645432 王国番号表記、59e5d48917496bddec2a5d7187d7e12802000722 dropdown syntax fix、860bb0404c5fee43d4588704557004394c1ba24a WATCHLIST→GENERAL fallback、2992952c854a706ba2791113e9c233c64eaf65cb error diagnostics。

#### 25-9. Watchlist性能
- WATCHLIST_RANKING_BATCH=8、cronは5分ごと、26 boardsを順次処理するため複数cron実行が必要。
- getWatchlistApiConcurrencyは利用可能APIキー数を数え最大4として返すが、現状ranking loopでは並列化に未使用。
- fetchWithConcurrencyは既存。
- 将来はAPI Poolの利用可能キー数に応じてrankingを並列化し、最大26程度まで同時実行できる構造を検討。12キーなら理想的には12ランキングを同時実行して残りをキュー処理。
- ただし一部ランキングを必要時だけ取得する管理者ランキング機能とは別タスク。

#### 25-10. 新しい管理者ランキング画面の想定
API Poolのテスト画面ではなく通常の管理画面として、/admin/kingdom-rankings、/api/admin/kingdom-rankings、/api/admin/kingdom-ranking-export等を想定。
UI候補：王国番号、ランキングdropdown、表示件数、取得／表示、最新取得、結果、D1最終更新時刻、MightPulse基準時刻（取得できる場合のみ）、Sheets出力。
**実装開始前に現在のsrc/index.js / src/ranking-store.jsを再取得して既存実装と重複しないことを確認する。存在未確認の関数名を勝手に参照しない。**

#### 25-11. このスレッドで確定した最重要判断
- 王国ランキングは必要なランキングだけ取得して見る用途を持たせる。
- API Pool管理画面とは分離。
- BASICにも公開対象のD1保存ランキングを見せる。
- D1に一度もないランキングはBASICでも初回API取得を許可。
- ADVANCED以上は古いデータを放置しない。通常のD1データ再取得間隔と24時間超過時の強制再取得を使う。
- 最新取得はADVANCED以上を初期値とし、最低権限を管理設定で変更可能にする。
- データ公開最低権限と最新取得最低権限は別設定。
- 可能ならランキングボード単位で両方設定。
- D1再取得間隔は管理設定。候補15/30/60/120/180/360分。30分は初期値候補。
- Watchlist更新はAPI取得処理であり、D1表示だけではない。
- MightPulseランキングのfreshness仕様はPlayerほど明確でないため断定しない。
- 2日前の名前変更が反映されない件は、ランキング表示が古いsnapshotやplayersを参照している可能性を含めて最優先調査。
- 新スレッドではREADME → index.js → ranking-store.js → mightpulse.jsを確認し、API payload → D1 save → D1 read → renderを実データ経路で追う。
