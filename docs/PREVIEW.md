# PR プレビュー

PR を出すと GitHub Actions（`.github/workflows/pr-preview.yml`）が `wrangler preview --name pr-<番号>` でプレビューを作り、URL を PR にコメントする。PR を閉じると消える。

- プレビューは本番の D1・R2 を**読むだけ**（`src/preview-readonly.js`）。D1 の書き込み・R2 の put/delete・Queue・外部 fetch（MightPulse＝API Pool、Discord、Google）は止まる。cron・Queue は動かない。
- **疑似ログイン**：`/preview/login` で合言葉（GitHub シークレット `PREVIEW_LOGIN_KEY`）を入れると、本番のオーナーのアカウントとして見られる。「表示する権限」で VIP・ADVANCED・BASIC の見え方も確認できる。D1 には書かない。セッション鍵はデプロイごとに作り直す（本番の鍵とは別）。
- 保存する操作は画面上は成功しても保存されない。MightPulse からの取得もしない（API Pool を使わない）。
- 画面の上に「🧪 PREVIEW」の帯が出る。robots.txt は全拒否。
- 鍵：GitHub シークレット `CLOUDFLARE_PREVIEW_API_TOKEN`（Cloudflare の権限は「Workers スクリプト：編集」だけ）。無いときは何もしない。
