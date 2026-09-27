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