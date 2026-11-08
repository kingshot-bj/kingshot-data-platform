# EagleEye Discord統合構想（保留中）

2026-11-08 時点の main（6525f16）を調べた結果と計画。**まだ実装しない（保留）**。
再開するときは、まず現在のコードを確認し直すこと（ここに書いた内容は調査時点のもの）。

## 再開の目安（どれかが揃ったら検討）
- 毎日使う人が数十人を超える
- D1 の月の読み取りが上限（250億行）の内側で安定する
- ユーザーから「Discordで見たい」「通知が欲しい」という声が出る

## 調査時点の事実（コードで確認）
- Discordログイン：`src/index.js` `startDiscordLogin` / `handleDiscordCallback`。scope は `identify guilds.join`。
  `users.discord_id` に Discord ID をそのまま保存（セッションの sub も同じ）→ Bot を押した人の ID でそのままアカウントが引ける。
  Googleログインの人は `google:…` の仮IDなので Discord とは繋がらない。OAuthトークンは保存していない。
- Discord のロール・サーバー一覧は取得していない。EagleEye の権限は `users.role`（OWNER/ADMIN/VIP/ADVANCED/BASIC）。
- 過去の 50025（Invalid OAuth2 access token）はログイン用アプリとBotのアプリが別だったため。今後もログインとBotは同じアプリにする。
- Interactions Endpoint は本番稼働中：`/api/discord/interactions` → `handleSupportInteraction`（`src/discord-support.js`）。
  Ed25519 署名検証あり。対応は `/close` `/reopen` のみ、Supportサーバー・Supportロール限定。ボタン等（type 3/5）は未対応。
  **署名のタイムスタンプの古さは見ていない** → 再開時に5分以上前を拒否する処理を足す。
- Discord への送信は Bot Token（`discordApiRequest`）。Webhook は未使用。
  お知らせ（`announcement-discord.js`）・KvK通知（`kvk-discord.js`）は outbox＋cron で少しずつ送る方式。
  ウォッチ通知（`discord-notifications.js`）は `DISCORD_NOTIFICATION_CHANNEL_ID` の1チャンネル固定。
- 公開API層は無い（`gateway-api.js` は診断用）。`/api/player` などは Cookie 認証と一体。
  プレイヤーは D1 優先、無い時・更新時だけ API Pool（`fetchPlayerThroughApiPool`）。
- プレイヤー検索は `players` を `LIKE '%…%'`（全件読み、調査時 11,377行）。
- 決済の仕組みは無い。ADVANCED は「領主登録＋MightPulseキー提供」で解放（`getAdvancedEligibility`）。
- 調査時の数字：ユーザー23人、11月のD1読み取り約444億行（上限超過、ClaudeBot分）、API Pool 7,700/165,000回/日。

## 方針（案）
- **Interactions Endpoint 方式**（Workers だけで完結。追加サーバー不要）。Gateway 方式は常駐サーバーが要るので使わない。
- 画面は `/eagleeye` 1つから、ボタン・セレクト・モーダルで操作。本人だけに見えるメッセージ（ephemeral）で、ボタンを押したら上書き（type 7）。
  画面の状態は custom_id（100文字）に入れ、DBに保存しない。時間のかかる処理は先に「考え中」（type 5/6）→ waitUntil で後から更新。
- データ取得は共通の関数に切り出す（`src/services/`：player / search / kingdom / watchlist。`(env, actor)` を受け取る）。
  権限判定（`filterPlayerForRole` 等）と API Pool を使う判定は Web と同じ1か所。
- Discord から MightPulse を自動で呼ばない。呼ぶのは「最新取得」ボタンだけ（本人ごとの回数制限、`BACKGROUND_KEY_RESERVE` の内側）。
- 通知は既存の `change_events` → outbox に入れて送るだけ。通知のために新しく収集しない。
- 1人あたり・サーバーあたりの回数制限。検索結果の短時間キャッシュ。
- Discord の各カードに「Webで詳しく」。リンク先は公開ページ（`/k/{kid}` `/a/{kid}/{aid}` `/heroes/{slug}` `/kvk/matchups`）を優先（SEO・広告）。
  プレイヤー詳細はログインが必要なページなので注意。広告のために Discord の情報を隠すことはしない。

## 段階
1. Bot基盤：入口で type 3/5 を受ける、タイムスタンプ確認、`/eagleeye` 登録、ホーム画面（既存の /close /reopen を壊さない）
2. 基本画面：プレイヤー検索・王国・ランキング・Webリンク、共通関数の切り出し
3. 分析：比較・ウォッチ登録/解除・最新取得（回数制限）
4. 通知：DM／チャンネル、頻度・まとめ（outbox の migration）
5. 有料化：Free / Advanced / Alliance、契約・期限切れ、決済（Stripe か Discord Premium Apps。日本で使えるか要確認）、特商法の表記・規約

## 最初のMVP（案）
Supportサーバー内だけで、`/eagleeye` → 自分の領主カード・王国の概要・Webで開く。D1を読むだけ、API Pool・migration なし。
押された回数を数えてから広げる。

## 再開前に決めること
1. 公開Botにするか、まずSupportサーバー内だけか
2. Googleログインの人に Discord の紐付けを足すか
3. 有料化と「キー提供でADVANCED」の関係
4. 決済の方法
5. 通知の初期値と1日の上限
6. D1が月の上限を超えている時に Discord 機能を絞るか
