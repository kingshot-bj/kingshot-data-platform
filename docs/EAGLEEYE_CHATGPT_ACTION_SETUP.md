# EagleEye ChatGPT Action 接続手順

## 目的

EagleEye の Read-Only Gateway を、ChatGPT から直接呼び出せる状態にする。

これは iPhone から JSON を保存して ChatGPT にアップロードする方式ではない。
ChatGPT の Action が Gateway API を直接 HTTPS 呼び出しする構成を採用する。

## 現在の前提

- Gateway: https://kingshot-data-platform.black-jack-kingshot.workers.dev
- OpenAPI: `docs/EAGLEEYE_GATEWAY_OPENAPI.yaml`
- 認証: Bearer API key
- Cloudflare Worker Secret: `EAGLEEYE_GATEWAY_TOKEN`
- Gateway は read-only
- Gateway 自身は D1/R2 に Gateway 用のログを書かない
- MightPulse / API Pool を呼ばない
- トークンは GitHub・チャット・URL クエリへ絶対に出さない

## ChatGPT 側の設定

1. Web の GPT editor を開く。
2. Action / アクションの設定を開く。
3. 新しい Action を作成する。
4. Authentication / 認証で API Key → Bearer を選択する。
5. Value / API Key の値には、Cloudflare に保存済みの `EAGLEEYE_GATEWAY_TOKEN` と同じ値を直接入力する。
   - ChatGPT の会話欄には入力しない。
   - GitHub に保存しない。
6. OpenAPI schema は URL から読み込む。
7. 次の Raw GitHub URL を指定する。

   `https://raw.githubusercontent.com/kingshot-bj/kingshot-data-platform/main/docs/EAGLEEYE_GATEWAY_OPENAPI.yaml`

8. 認識された Action が以下の2つであることを確認する。
   - `getEagleEyeSystemStatus`
   - `getEagleEyeDiagnostics`
9. Preview で次を実行する。
   - 「EagleEyeの現在のシステム状態を取得して」
   - 「EagleEyeの最新診断ログを取得して」
10. Action の実行ログで、Worker URL に HTTPS リクエストが送られ、Bearer 認証後に JSON が返ることを確認する。

## 期待する動作

ChatGPT → Action → EagleEye Gateway → D1 / Cloudflare Analytics

成功時は Gateway が `ok: true` を返す。

未認証なら `401 UNAUTHORIZED`。
Secret 未設定なら `503 GATEWAY_NOT_CONFIGURED`。

## セキュリティ

Gateway token は EagleEye の内部認証情報。
以下をしないこと。

- チャットへ貼る
- GitHub にコミットする
- OpenAPI に直接書く
- URL query parameter に入れる
- スクリーンショットへ写す
- JSON の保存ファイルへ含めて共有する

## 現在のテスト状況

iPhone Shortcuts から Authorization ヘッダーを付けた Gateway 呼び出しが成功している。
したがって Worker URL、Gateway route、Bearer 認証、Secret、JSON 応答までは実動確認済み。

未確認なのは ChatGPT Action 側からの直接呼び出しだけ。

## 注意

OpenAI の Action は GPT editor 側で設定する。
現在の通常チャットから、この設定なしに任意の外部 URL + Bearer token を直接呼べるわけではない。

また、Action が使える GPT / モード / ワークスペース条件は ChatGPT 側の現在の提供状況に依存する。
