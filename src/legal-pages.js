// Public legal pages. Content must describe what the code actually does;
// update this page whenever data handling changes.

export const PRIVACY_POLICY_UPDATED_AT = "2026年11月1日";

const PRIVACY_SECTIONS = [
  {
    title: "1. このポリシーについて",
    body: `<p>EagleEye（以下「本サービス」）は、ゲーム「KingShot」のデータを集約・分析するための非公式のファン向けサービスです。本サービスはCentury Games、KingShotの運営会社、MightPulseとは関係がありません。</p>
<p>このページでは、本サービスが取得する情報、その使い方、保存期間、外部サービスとの関係を説明します。</p>`
  },
  {
    title: "2. 取得する情報",
    body: `<ul>
<li><b>Discordアカウント情報</b>：Discordでログインした際の、DiscordユーザーID・ユーザー名・表示名・アバター。ログイン日時の履歴。</li>
<li><b>登録した領主ID</b>：マイKingShotで登録したKingShotの領主ID・王国・区分（メイン／サブ）。</li>
<li><b>提供されたMightPulse APIキー</b>：利用者が任意で提供したキー。暗号化して保存し、画面には照合用の先頭部分のみ表示します。</li>
<li><b>KingShotの公開データ</b>：MightPulse API経由で取得するプレイヤー・王国・同盟・ランキング等のゲーム内公開情報と、その変化の履歴。</li>
<li><b>お問い合わせ内容</b>：お問い合わせフォームに入力された内容。EagleEye SupportのDiscordサーバー内の専用チャンネルに送られます。</li>
<li><b>利用・動作の記録</b>：機能の利用記録、サーバーの処理ログ、ブラウザで発生したエラーや通信結果（表示中のページ、操作した要素の種類、HTTPステータス等）。</li>
</ul>
<p>パスワード、メールアドレス、決済情報は取得しません。</p>`
  },
  {
    title: "3. 利用目的",
    body: `<ul>
<li>ログイン状態の維持と、ロール（BASIC／ADVANCED／VIP／ADMIN／OWNER）に応じた機能の提供</li>
<li>プレイヤー・王国・ランキング・ウォッチリスト等の表示と、変化の記録</li>
<li>提供されたAPIキーを使った、本サービス全体でのデータ取得（API Pool）</li>
<li>お問い合わせへの対応。Discordでログインすると、お問い合わせ用のEagleEye SupportのDiscordサーバーに自動で参加します（Discordの<code>guilds.join</code>権限を使用。サーバーからはいつでも退出できます）</li>
<li>障害の調査、不正利用の防止、サービスの改善</li>
</ul>`
  },
  {
    title: "4. Cookieとブラウザ保存",
    body: `<ul>
<li><b>ログイン用Cookie</b>（<code>eagleeye_session</code>）：ログイン状態を保つための署名付きCookieです。有効期間は7日間です。</li>
<li><b>ブラウザ内の保存（localStorage）</b>：表示テーマや比較画面の表示設定など、画面の設定を保存します。サーバーには送信しません。</li>
</ul>
<p>広告やトラッキングを目的としたCookieは使用しません。</p>`
  },
  {
    title: "5. 外部サービス",
    body: `<ul>
<li><b>Cloudflare</b>：本サービスの実行基盤とデータの保存（データベース・ファイル保存）</li>
<li><b>Discord</b>：ログイン、EagleEye Supportサーバーへの参加、お問い合わせ</li>
<li><b>MightPulse</b>：KingShotの公開データの取得元</li>
<li><b>Google Drive</b>：保存期間を過ぎたデータのバックアップ先（運営者のGoogle Drive）。本サービスはGoogle Driveのうち、本サービス自身が作成したファイルにのみアクセスします（<code>drive.file</code>権限）。利用者のGoogleアカウントやGoogle Driveにはアクセスしません。</li>
</ul>
<p>法令に基づく場合を除き、取得した情報を第三者に販売・提供することはありません。</p>`
  },
  {
    title: "6. 保存期間",
    body: `<p>データの種類ごとに保存期間を定め、期間を過ぎたデータは定期処理でバックアップ（ファイル保存とGoogle Drive）を確認したうえで、データベースから削除します。主な目安は次のとおりです（運営上の判断で変更することがあります）。</p>
<ul>
<li>サーバーの処理ログ：24時間</li>
<li>診断記録：30日</li>
<li>ログイン履歴・API利用記録：90日</li>
<li>ゲームデータの変化の記録：最大2年</li>
<li>アカウント情報・登録した領主ID・提供されたAPIキー：登録の解除や削除依頼があるまで</li>
</ul>`
  },
  {
    title: "7. 情報の管理",
    body: `<ul>
<li>通信はすべて暗号化（HTTPS）されています。</li>
<li>提供されたAPIキーは暗号化して保存し、全体を画面やログに表示しません。</li>
<li>管理機能は、ADMIN／OWNERロールの運営者のみが利用できます。</li>
</ul>`
  },
  {
    title: "8. 登録の解除・削除の依頼",
    body: `<p>領主IDの登録は、マイKingShotからいつでも解除できます。アカウント情報や提供したAPIキーの削除、その他の開示・訂正のご依頼は、<a href="/support">お問い合わせ</a>からご連絡ください。</p>`
  },
  {
    title: "9. 改定",
    body: `<p>このポリシーは、必要に応じて改定することがあります。重要な変更がある場合は、本サービス上でお知らせします。</p>`
  },
  {
    title: "10. お問い合わせ",
    body: `<p>このポリシーに関するお問い合わせは、<a href="/support">お問い合わせ</a>ページ（EagleEye SupportのDiscordサーバー）からお願いします。</p>`
  }
];

export function renderPrivacyPolicyPage() {
  const sections = PRIVACY_SECTIONS.map(section =>
    `<section class="legal-section"><h2>${section.title}</h2>${section.body}</section>`
  ).join("");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>プライバシーポリシー | EagleEye</title><meta name="description" content="EagleEyeのプライバシーポリシー">
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#050b14;color:#e8f3ff;font:15px/1.8 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.legal-wrap{width:min(100%,760px);margin:0 auto;padding:22px 16px calc(48px + env(safe-area-inset-bottom))}
.legal-back{display:inline-block;color:#8fdcff;text-decoration:none;font-size:13px;margin-bottom:10px}
h1{font-size:24px;margin:4px 0 4px}
.legal-updated{color:#91a7bf;font-size:12px;margin:0 0 18px}
.legal-section{background:#0a1728;border:1px solid #23415f;border-radius:14px;padding:14px 16px;margin:12px 0}
.legal-section h2{font-size:16px;margin:0 0 8px;color:#20d7f2}
.legal-section p{margin:6px 0}
.legal-section ul{margin:6px 0;padding-left:20px}
.legal-section li{margin:4px 0}
.legal-section code{background:#0b192b;border-radius:5px;padding:1px 5px;color:#f6c84b;font-size:13px}
.legal-section a{color:#8fdcff}
html[data-eagle-theme="light"] body{background:#f3f6fb;color:#172033}
html[data-eagle-theme="light"] .legal-section{background:#fff;border-color:#d6deea}
html[data-eagle-theme="light"] .legal-section h2{color:#0e7490}
html[data-eagle-theme="light"] .legal-section code{background:#f1f5f9;color:#92400e}
html[data-eagle-theme="light"] .legal-back,html[data-eagle-theme="light"] .legal-section a{color:#0369a1}
</style></head><body><main class="legal-wrap">
<a class="legal-back" href="/">← EagleEye</a>
<h1>プライバシーポリシー</h1>
<p class="legal-updated">最終更新日：${PRIVACY_POLICY_UPDATED_AT}</p>
${sections}
</main></body></html>`;
}
