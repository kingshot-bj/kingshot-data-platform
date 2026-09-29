# EagleEye R2 → Google Drive 接続準備

## 目的
R2アーカイブを将来Google Driveの永久保存層へ移せるよう、接続部だけを準備する。
現時点では自動転送・cron・Retention連携・R2削除は行わない。

## 今回追加
`src/google-drive.js` に、指定したR2オブジェクトをGoogle Driveへ明示的にアップロードするtransport primitiveを追加。

利用する環境変数:
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GOOGLE_DRIVE_FOLDER_ID`

Google OAuth scope: `drive.file`。
Service Accountの秘密鍵はGitHubへ保存しない。

## 現在は未接続
- `src/index.js` から呼び出さない
- cronから呼び出さない
- retention jobから呼び出さない
- R2オブジェクトを自動削除しない
- D1へ追加保存しない

つまり現在の正本はR2のまま。

## 将来フロー

```text
D1
 ↓
R2 archive
 ↓
checksum / record count / duplicate check
 ↓
Google Drive
 ↓
Library Index
 ↓
R2削除判断
```

Driveへの転送成功だけではR2削除条件を満たさない。

## 設計上の役割
- D1 = Operational Database
- R2 = Archive / Data Lake
- Google Drive = Permanent Archive候補
- Google Sheets = Library Index候補
- Library API = 将来の読み取り境界

DriveをDBや検索基盤として扱わず、原本保管層として利用する。

## 次の実装候補
1. R2 object checksum取得
2. Drive側checksum/size検証
3. Library Index登録
4. 重複転送防止
5. 明示的なmigration job
6. 検証成功後のR2削除

これらは今回の接続準備には含めない。
## 2026-09-29 方針更新：個人Googleアカウント OAuth方式

Google Workspaceは利用しない。EagleEye専用として用意済みの個人GoogleアカウントのMy Driveを保存先にする。

従来のService Account方式は採用せず、Google OAuth 2.0のユーザー認可＋offline accessで運用する。Google公式ではoffline accessによりユーザー不在時でもrefresh tokenからaccess tokenを更新できる。

### 使用する設定
- GOOGLE_OAUTH_CLIENT_ID
- GOOGLE_OAUTH_CLIENT_SECRET（Secret）
- GOOGLE_DRIVE_OAUTH_REDIRECT_URI
- GOOGLE_DRIVE_REFRESH_TOKEN（Secret）
- GOOGLE_DRIVE_FOLDER_ID

Drive scopeは https://www.googleapis.com/auth/drive.file を使用する。これはアプリが作成したファイル、またはアプリと共有されたファイルに限定する狭い権限で、今回の専用アーカイブ用途に合わせる。

### 現在実装した接続フロー
1. OWNERが /admin/google-drive を開く。
2. Google OAuthへリダイレクト。
3. stateをEagleEyeの既存HMAC方式で検証。
4. 認可コードをtoken endpointで交換。
5. 初回認証時はOAuth access tokenでEagleEyeフォルダを作成。
6. Refresh TokenとFolder IDを画面に一度だけ表示。
7. Cloudflare Secret / Variableへ手動登録。
8. Worker再deploy後、R2→Drive transportがrefresh tokenでaccess tokenを取得して動作する。

Google OAuthのredirect URIはGoogle Cloud側の登録値と完全一致が必要。

### R2→Drive transport
src/google-drive.js は以下を実装済み。
- ユーザーOAuth refresh tokenからaccess tokenを取得
- R2 object取得
- appProperties.eagleeyeSourceKeyによる同一R2 objectの重複検出
- Drive multipart upload
- source size / Drive sizeの検証
- verification成功を verified: true として返す
- duplicate時もsizeを再確認

Drive upload成功とverification成功は分離して扱う。

### まだ実装しないもの
- cronからの自動R2→Drive転送
- retentionからのDrive連携
- Library Index
- Drive checksumを使った完全なchecksum verification
- record count verification
- batch_id実装
- verification前のR2削除
- verification後の自動R2削除

R2は引き続きcanonical source。

### OAuth token運用上の注意
Refresh TokenはGitHubへ保存しない。Cloudflare Secretへ登録する。Google公式もrefresh tokenを安全な長期保存先で管理するよう案内している。

Google Cloud OAuth同意画面をTestingのまま運用すると、テストユーザー向けrefresh tokenは7日で失効する仕様がある。長期運用前にGoogle Cloud側の公開状態を確認すること。

本番でR2→Drive実アップロードが成功するまで、Google Drive連携をproduction-confirmedとは扱わない。
