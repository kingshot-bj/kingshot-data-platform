# EagleEye 引き継ぎ：Discord OAuth / Support導線（Cloud Code向け）

更新日: 2026-11-01  
リポジトリ: `kingshot-bj/kingshot-data-platform`  
対象ブランチ: `main`  
直近マージ: `fe4ff9a1730d35b96cde623ec1b9c79b00a8885e`  
関連PR: #156 / #157 / #158

## 1. 次に行うこと（最優先）

Discordログイン時に発生していた `Invalid OAuth2 access token`（Discord API HTTP 403 / Discord code 50025）の原因を、実環境の新しいログと診断画面で特定し、修正・検証する。

今回の作業ではSupport問い合わせ導線とサーバー参加確認をmainへマージ済み。ただし、**Cloudflare本番デプロイ成功およびDiscord実機でのOAuth再ログイン検証は未確認**。完了扱いにしないこと。

## 2. これまでの経緯

- 2026-10-23頃、複数ユーザーからDiscordログインが遅い／失敗するとの報告。
- Cloudflare側ログで `Invalid OAuth2 access token`、HTTP 403、Discord code 50025 の診断イベントが複数回記録されていた。
- 原因切り分けのため、Discord OAuth/Bot診断、Owner専用診断画面、Supportサーバー参加確認・問い合わせ導線を段階的に実装。
- PR #156: OAuthアプリID、OAuth scope、OAuth診断HTTP情報、Bot identity/API状態を安全に記録。Tokenそのものはログ・DBに保存しない。
- PR #157: Owner専用Discord診断画面/API。設定値の有無、OAuth app/scopes、Bot/API診断を表示。秘密値は表示しない。
- PR #158: Guild参加状態の再確認、`/api/support/membership`、問い合わせ画面の参加状態表示、未参加時の再連携誘導、問い合わせ作成時のGuild membership必須チェック。
- PR #158の作業ブランチで `wrangler.jsonc` の本番・Preview `DISCORD_CLIENT_ID` を同じ値に同期し、PR #158をSquash mergeした。

## 3. 現在のmainの状態

直近mainコミット:
`fe4ff9a1730d35b96cde623ec1b9c79b00a8885e`

コミットメッセージ:
`Fix Discord Support membership flow and OAuth configuration`

含まれる主なファイル:
- `src/index.js`
- `src/discord-support.js`
- `wrangler.jsonc`

確認済み事項:
- PR #158はGitHub上でMerged。
- mainの `wrangler.jsonc` にある本番 `vars.DISCORD_CLIENT_ID` と `previews.vars.DISCORD_CLIENT_ID` は、どちらも `1554817307988205618`。
- mainの `src/discord-support.js` に `handleSupportMembershipApi` が存在。
- `/api/support/membership` のルートがmainの `src/index.js` に存在することを確認済み。
- 変更前のPRブランチ上のコミット `a954a8657f24ddea7f1b128dfaff46d1006f409f` では GitHub Actions の MightPulse Probe checks が成功していた。ただし、これはDiscord OAuth実機検証ではない。Squash merge後コミットのCI結果は別途確認すること。

未確認:
- Cloudflare Workersへの本番デプロイ完了・反映バージョン。
- Discord Developer Portal上のClient IDが上記値と一致しているか。
- Discord Developer PortalのRedirect URIが本番の `DISCORD_REDIRECT_URI` と完全一致しているか。
- Cloudflare Secretsの `DISCORD_CLIENT_SECRET` / `DISCORD_BOT_TOKEN` が対象アプリ・Botに対応しているか。
- Guild参加フロー、再ログイン、問い合わせ作成の実機動作。

## 4. 重要な実装ポイント

### Support membership API

`src/discord-support.js`:
- `handleSupportMembershipApi(request, env, auth)`
- ACTIVEかつ `user_id` / `discord_id` があるユーザーのみ利用可能。
- GETのみ許可。
- `DISCORD_SUPPORT_GUILD_ID` のGuildに対してBot tokenでDiscord API v10のGuild Member endpointを呼び出す。
- Memberが存在すれば `{ ok: true, member: true }`。
- 404なら未参加として `member: false`。
- その他のDiscord APIエラーは `DISCORD_MEMBERSHIP_CHECK_FAILED`（503）。
- ログにはDiscord user ID、HTTP status、Discord error codeのみを出し、Tokenは出さない。

### 問い合わせ作成

- 問い合わせ作成時にもGuild membershipをサーバー側で確認する。
- 未参加の場合は `DISCORD_SUPPORT_GUILD_MEMBERSHIP_REQUIRED`（409）。
- フロント側の表示制御だけでなく、サーバー側のチェックを維持すること。

### OAuth/Bot diagnostics

- #156/#157で追加された診断イベント・Owner専用画面を利用して、OAuth user tokenとBot tokenの問題を切り分ける。
- Token値、Client Secret、Bot Token、Session Secret等をログ・画面・Issue・この引き継ぎに絶対に記載しない。
- 診断データの追加時も秘密値を保存しない。必要な場合は存在有無、HTTP status、Discord error code、scope名などに限定する。

## 5. Cloudflare設定・デプロイ時の注意

`wrangler.jsonc` は `./public` をAssets directoryとして使用する。
本番・Previewの `DISCORD_CLIENT_ID` は現在どちらも `1554817307988205618`。

注意:
- この値がDiscord Developer Portalの正しいApplication Client IDであることは、まだ独立に照合していない。Portalで必ず確認する。
- `DISCORD_REDIRECT_URI` は現在 `https://kingshot-data-platform.black-jack-kingshot.workers.dev/api/auth/callback`。Discord Developer Portal側の登録値と完全一致を確認する。
- `DISCORD_CLIENT_SECRET` 等はWranglerのsecret管理対象。wrangler.jsoncに値を追加しない。
- 直近の会話ではCloudflare deploy時にAssets upload session関連の `10013` エラーが話題になったが、このエラーの原因は確定していない。アプリコードが原因と決めつけない。
- Cloudflare側のデプロイ失敗が再発したら、まずGitHub Actionsのログ、Wrangler version、失敗フェーズ、Cloudflare request ID / error bodyを記録。不要な設定変更やClient IDの再変更をしない。
- 本番デプロイはユーザーがCloudflare側で結果を確認する運用。デプロイ成功をログなしで断定しない。

## 6. Cloud Codeでの作業手順

1. リポジトリを開き、必ず最新の `main` を取得する。
2. この引き継ぎとPR #156/#157/#158、直近マージコミットのdiffを読む。
3. `src/index.js` のDiscord OAuth callback / Guild join処理、診断イベント記録箇所を確認する。
4. `src/discord-support.js` のmembership APIと問い合わせ作成処理を確認する。
5. `wrangler.jsonc`、GitHub Actions workflow、関連テストを確認する。
6. 新しいログを取得できる状態にしてから、テスト用DiscordアカウントでOAuthログインを再現する。
7. Owner専用診断画面でOAuth app ID / scopes / HTTP status / Discord code / Bot identityの結果を確認する。
8. 原因を「OAuth user token」「Bot token」「Guild参加処理」「Redirect URI / Client ID」「Cloudflare環境変数・Secrets」に分類する。
9. 原因が確定してから最小差分で修正し、回帰テストを追加・実行する。
10. PRを作成し、CI成功・差分・影響範囲を確認してからmainへマージする。
11. Cloudflare本番デプロイ後、実ユーザー相当のログインとSupport問い合わせまで検証する。

## 7. 完了条件

- [ ] Discord Developer PortalのApplication Client IDと本番/Preview設定が一致
- [ ] Redirect URIがPortalとWrangler設定で完全一致
- [ ] Bot tokenが正しいGuildに所属するBotのもの
- [ ] OAuthログインでHTTP 403 / Discord code 50025が再発しない
- [ ] Guild参加処理が成功し、Guild member endpointで参加状態を確認できる
- [ ] 未参加ユーザーには再連携・参加案内が表示される
- [ ] 参加済みユーザーはSupport問い合わせを作成できる
- [ ] 未参加ユーザーはAPI側でも問い合わせ作成を拒否される
- [ ] TokenやSecretがログ・画面・DBに露出しない
- [ ] CI成功
- [ ] Cloudflare本番デプロイ成功
- [ ] iPhone Safariを含む実機検証完了

## 8. Cloud Codeへの最初の指示

「この引き継ぎを読み、まず最新mainのコードと関連PRの差分を調査してください。すぐにコードを書き換えず、Discord OAuthのInvalid OAuth2 access token（HTTP 403 / Discord code 50025）の発生箇所と、#156/#157で追加した診断情報から原因を切り分ける調査計画を提示してください。Cloudflare本番デプロイとDiscord実機検証は未完了です。既存のGuild membership gateと秘密情報をログに出さない方針を壊さないでください。調査後、原因・根拠・最小修正案・テスト計画を提示してから実装に進んでください。」

---

この文書は作業引き継ぎであり、Cloudflare本番反映・Discord実機検証の完了報告ではない。

---

## 9. 調査結果（2026-11-01 Cloud Code 追記）

### 原因（確定）
- `PUT /guilds/{guild}/members/{user}` は、ユーザーのOAuthアクセストークンとBotトークンが**同じDiscordアプリ**のものでないと HTTP 403 / code 50025 を返す。
- 本番D1 `diagnostic_events` の記録: 10/23〜10/31 の失敗はすべて OAuth App `1552660062063829093`（旧）／Bot `1554817307988205618`。#158 で `DISCORD_CLIENT_ID` を `…618` に揃えた後は失敗が出ていない。
- 2026-11-01 03:35 JST、サーバー未参加のテストアカウントで `result=ADDED` / 参加HTTP 201 / 参加確認HTTP 200 を確認。
- 同日、iPhone Safari から問い合わせを作成し、チケットチャンネル作成・メッセージ送受信を確認。

### 追加で判明したこと
- `/close`・`/reopen` が候補に出ない: スラッシュコマンドが `…618` アプリに未登録だった（登録APIは手動POSTのみで、旧Client ID時代は登録不能だった）。
- 対応: Owner専用 `/owner/discord-diagnostics` に「接続チェック」（Client ID↔Botアプリ一致、Public Key一致、Interactions Endpoint URL、コマンド登録状態）と「コマンド登録」ボタンを追加。iPhoneのみで確認・登録できる。

### 再発防止
- `src/discord-oauth.js`: 参加APIの前にBot所属アプリとClient IDを照合し、不一致なら参加を呼ばず `DISCORD_OAUTH_BOT_APP_MISMATCH` を記録。Discord呼び出しに5秒タイムアウト。トークン情報照会は失敗時のみ（通常ログインのDiscord往復を削減）。
- `tests/discord-oauth.test.mjs` をCIに追加。

### 完了条件の状況
- [x] Client IDとBotアプリの一致（D1診断で確認）
- [x] Redirect URI（本番で認可→コールバック成功）
- [x] Botが正しいGuildに所属（参加・参加確認が成功）
- [x] 50025 が再発しない（#158 以降）
- [x] Guild参加処理と参加確認の成功
- [x] 参加済みユーザーが問い合わせを作成できる（iPhone Safari）
- [ ] 未参加ユーザーはAPI側でも問い合わせ作成を拒否される（任意確認）
- [x] Token/Secretがログ・画面・DBに露出しない
- [x] `/close`・`/reopen` の登録と動作（#159 デプロイ後、診断画面から登録。iPhoneで成功を確認）
- [x] #159 のCI成功・本番デプロイ

## 10. /close・/reopen の追加対応（2026-11-01）

- 初回の `/close` は `Missing Permissions`（Discord 50013）。カテゴリー「サポート窓口クローズ」でBotに権限（チャンネルを見る・チャンネルの管理・権限の管理・メッセージを送信・メッセージ履歴を読む）を付与して解消。
- close → reopen → close を数分以内に行うと `The resource is being rate limited.`（429）。Discordのチャンネル名・トピック変更は1チャンネル10分2回までのため、トピックの `status=` 書き換えが原因。
- 対応: チケット状態をカテゴリーで判定（「サポート窓口クローズ」にある＝CLOSED）し、トピックは作成時以降書き換えない。カテゴリー移動と権限上書きはこの制限の対象外。
- 失敗時の返答を具体化（回数制限は待ち時間、権限不足は確認すべきカテゴリーと権限を表示）。診断にHTTP status / Discord code / retry_afterを記録（秘密値なし）。
- 既存チケットのトピックに残る `status=` は参照しない（表示用の初期値として残るだけ）。
- テスト: `tests/discord-support-commands.test.mjs`（連続 close/reopen でトピック編集0回、旧トピック値に依存しない、エラー文言）。
