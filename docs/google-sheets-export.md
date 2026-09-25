# EagleEye Google Sheets Export

## 目的

プレイヤー詳細の各セクションを、Admin / OwnerだけがGoogleスプレッドシートへ出力できるようにする。

対象セクション:

- プロフィール
- 同盟
- 英雄
- ランキング
- 領主装備

EagleEyeの正式なDBはD1のまま維持し、Google Sheetsはエクスポート・分析・保存用として扱う。

## Google Cloud側

1. Google Cloudプロジェクトを作成/選択。
2. Google Sheets APIを有効化。
3. サービスアカウントを作成。
4. サービスアカウントのメールアドレスを取得。
5. サービスアカウントのJSONキーを作成。
6. EagleEye用のGoogleスプレッドシートを作成。
7. そのスプレッドシートをサービスアカウントのメールアドレスと共有し、編集権限を付与。

## Cloudflare Worker Secrets

以下をWorkerのSecretとして登録する。

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GOOGLE_SHEETS_SPREADSHEET_ID`

秘密鍵はJSONキーの `private_key` の値をそのままSecretに登録する。

Cloudflare Workersでは外部サービスの認証情報をSecretとして保存する方式を使用する。

## シート構成

同じスプレッドシート内に、必要になった時点で以下のタブを自動作成する。

- `プロフィール`
- `同盟`
- `英雄`
- `ランキング`
- `領主装備`

同じセクションを再度出力すると、既存タブの末尾へ追加する。

## 権限

Export APIはUI上のボタン表示だけでなくサーバー側でも権限確認する。

- BASIC: 不可
- ADVANCED: 不可
- ADMIN: 可
- OWNER: 可

## 注意

Google SheetsをEagleEyeのリアルタイムDBとして使用する設計ではない。検索・権限・Watchlist・Change Eventなどのシステム処理はD1で行い、Sheetsはデータの持ち出し/分析/保存先として使用する。
