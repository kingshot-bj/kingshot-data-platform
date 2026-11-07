// Public legal pages. Content must describe what the code actually does;
// update this page whenever data handling changes.

export const PRIVACY_POLICY_UPDATED_AT = "2026年11月2日";

const PRIVACY_SECTIONS = [
  {
    title: "このポリシーについて",
    body: `<p>EagleEye（以下「本サービス」）は、ゲーム「KingShot」のデータを集約・分析するための非公式のファン向けサービスです。本サービスはCentury Games、KingShotの運営会社、MightPulseとは関係がありません。</p>
<p>このページでは、本サービスが取得する情報、その使い方、保存期間、外部サービスとの関係を説明します。</p>`
  },
  {
    title: "取得する情報",
    body: `<ul>
<li><b>Discordアカウント情報</b>：Discordでログインした際の、DiscordユーザーID・ユーザー名・表示名・アバター。ログイン日時の履歴。</li>
<li><b>登録した領主ID</b>：マイKingShotで登録したKingShotの領主ID・王国・区分（メイン／サブ）。</li>
<li><b>提供されたMightPulse APIキー</b>：利用者が任意で提供したキー。暗号化して保存し、画面には照合用の先頭部分のみ表示します。</li>
<li><b>KingShotの公開データ</b>：MightPulse API経由で取得するプレイヤー・王国・同盟・ランキング等のゲーム内公開情報と、その変化の履歴。</li>
<li><b>招待の記録</b>：招待リンクから登録した場合の、招待した人と招待された人の対応、登録日時、ADVANCEDになった日時。招待した人には、招待された人のゲーム内の名前と状態だけを表示します（Discordの情報は表示しません）。招待ランキングには、招待した人のゲーム内の名前・王国・人数を表示します。</li>
<li><b>お問い合わせ内容</b>：お問い合わせフォームに入力された内容。EagleEye SupportのDiscordサーバー内の専用チャンネルに送られます。</li>
<li><b>利用・動作の記録</b>：機能の利用記録、サーバーの処理ログ、ブラウザで発生したエラーや通信結果（表示中のページ、操作した要素の種類、HTTPステータス等）。</li>
</ul>
<p>パスワード、メールアドレス、決済情報は取得しません。</p>`
  },
  {
    title: "利用目的",
    body: `<ul>
<li>ログイン状態の維持と、ロール（BASIC／ADVANCED／VIP／ADMIN／OWNER）に応じた機能の提供</li>
<li>プレイヤー・王国・ランキング・ウォッチリスト等の表示と、変化の記録</li>
<li>提供されたAPIキーを使った、本サービス全体でのデータ取得（API Pool）</li>
<li>お問い合わせへの対応。Discordでログインすると、お問い合わせ用のEagleEye SupportのDiscordサーバーに自動で参加します（Discordの<code>guilds.join</code>権限を使用。サーバーからはいつでも退出できます）</li>
<li>KvK通知。EagleEye SupportのDiscordサーバー内で、登録した領主IDの王国のKvK通知スレッド（同じ王国の登録ユーザーと運営者だけが見られる非公開スレッド）に自動で追加します。追加されたときは、BotからDiscordのDMで一度だけお知らせします。王国の登録を解除すると、スレッドからも外れます</li>
<li>障害の調査、不正利用の防止、サービスの改善</li>
</ul>`
  },
  {
    title: "Cookieとブラウザ保存",
    body: `<ul>
<li><b>ログイン用Cookie</b>（<code>eagleeye_session</code>）：ログイン状態を保つための署名付きCookieです。有効期間は7日間です。</li>
<li><b>招待用Cookie</b>（<code>ee_ref</code>）：招待リンクを開いたときに招待コードを最長30日間保存し、初めてのログイン時に招待した人と結びつけるために使います。ログイン後に削除します。</li>
<li><b>ブラウザ内の保存（localStorage）</b>：表示テーマや比較画面の表示設定など、画面の設定を保存します。サーバーには送信しません。</li>
<li><b>広告用のCookie</b>：広告を表示するページでは、Googleなどの第三者配信事業者がCookieを使用し、利用者の本サービスや他のウェブサイトへの過去のアクセス情報に基づいて広告を配信することがあります（詳しくは「広告の配信について」をご覧ください）。</li>
</ul>
<p>本サービス自身が、利用者を追跡する目的のCookieを発行することはありません。</p>`
  },
  {
    title: "外部サービス",
    body: `<ul>
<li><b>Cloudflare</b>：本サービスの実行基盤とデータの保存（データベース・ファイル保存）</li>
<li><b>Discord</b>：ログイン、EagleEye Supportサーバーへの参加、お問い合わせ</li>
<li><b>MightPulse</b>：KingShotの公開データの取得元</li>
<li><b>Google AdSense</b>：一部の公開ページでの広告の配信</li>
<li><b>Google Drive</b>：保存期間を過ぎたデータのバックアップ先（運営者のGoogle Drive）。本サービスはGoogle Driveのうち、本サービス自身が作成したファイルにのみアクセスします（<code>drive.file</code>権限）。利用者のGoogleアカウントやGoogle Driveにはアクセスしません。</li>
</ul>
<p>法令に基づく場合を除き、取得した情報を第三者に販売・提供することはありません。</p>`
  },
  {
    title: "広告の配信について",
    body: `<p>本サービスは、第三者配信の広告サービス「Google AdSense」を利用して、一部の公開ページに広告を表示する場合があります。</p>
<ul>
<li>Googleなどの第三者配信事業者は、Cookieを使用して、利用者の本サービスや他のウェブサイトへの過去のアクセス情報に基づいて広告を配信します。</li>
<li>Googleは広告Cookieを使用することにより、利用者の本サービスや他のサイトへのアクセス情報に基づいて、適切な広告を表示できます。</li>
<li>パーソナライズ広告は、<a href="https://adssettings.google.com/" target="_blank" rel="noopener noreferrer">Googleの広告設定</a>で無効にできます。また、<a href="https://www.aboutads.info/choices/" target="_blank" rel="noopener noreferrer">www.aboutads.info</a> にアクセスすると、第三者配信事業者のCookieを無効にできます。</li>
<li>Googleによる情報の取り扱いは、<a href="https://policies.google.com/technologies/ads?hl=ja" target="_blank" rel="noopener noreferrer">Googleの広告に関するポリシー</a>をご覧ください。</li>
</ul>`
  },
  {
    title: "外部送信について",
    body: `<p>広告を表示するページでは、利用者の端末から次の事業者へ情報が送信されます（電気通信事業法の外部送信規律に基づく公表事項）。</p>
<ul>
<li><b>送信先</b>：Google LLC（Google AdSense）</li>
<li><b>送信される情報</b>：Cookie等の識別子、閲覧したページのURL、IPアドレス、ブラウザや端末の種類、閲覧日時など</li>
<li><b>利用目的</b>：広告の配信、効果の測定、不正なクリックの防止</li>
<li><b>停止する方法</b>：上記「広告の配信について」の広告設定から、パーソナライズ広告を無効にできます。</li>
</ul>`
  },
  {
    title: "保存期間",
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
    title: "情報の管理",
    body: `<ul>
<li>通信はすべて暗号化（HTTPS）されています。</li>
<li>提供されたAPIキーは暗号化して保存し、全体を画面やログに表示しません。</li>
<li>管理機能は、ADMIN／OWNERロールの運営者のみが利用できます。</li>
</ul>`
  },
  {
    title: "登録の解除・削除の依頼",
    body: `<p>領主IDの登録は、マイKingShotからいつでも解除できます。アカウント情報や提供したAPIキーの削除、その他の開示・訂正のご依頼は、<a href="/support">お問い合わせ</a>からご連絡ください。</p>`
  },
  {
    title: "改定",
    body: `<p>このポリシーは、必要に応じて改定することがあります。重要な変更がある場合は、本サービス上でお知らせします。</p>`
  },
  {
    title: "お問い合わせ",
    body: `<p>このポリシーに関するお問い合わせは、<a href="/support">お問い合わせ</a>ページ（EagleEye SupportのDiscordサーバー）からお願いします。</p>`
  }
];

export const TERMS_UPDATED_AT = "2026年11月1日";

const TERMS_SECTIONS = [
  {
    title: "この規約について",
    body: `<p>この利用規約（以下「本規約」）は、EagleEye（以下「本サービス」）の利用条件を定めるものです。本サービスを利用した時点で、本規約と<a href="/privacy">プライバシーポリシー</a>に同意したものとみなします。</p>`
  },
  {
    title: "本サービスの位置づけ",
    body: `<p>本サービスは、ゲーム「KingShot」のデータを集約・分析するための非公式のファン向けサービスです。Century Games、KingShotの運営会社、MightPulseとは関係がなく、これらの会社が本サービスを提供・保証するものではありません。</p>`
  },
  {
    title: "アカウントとロール",
    body: `<ul>
<li>本サービスはDiscordアカウントでログインして利用します。</li>
<li>利用できる機能はロール（BASIC／ADVANCED／VIP／ADMIN／OWNER）によって異なります。ロールの条件や内容は、運営上の判断で変更することがあります。</li>
<li>領主IDは、ご自身が管理するアカウントのものだけを登録してください。</li>
</ul>`
  },
  {
    title: "MightPulse APIキーの提供",
    body: `<ul>
<li>APIキーの提供は任意です。提供されたキーは、本サービス全体のデータ取得（API Pool）に使用します。提供した時点で、この使い方に同意したものとみなします。</li>
<li>ご自身が正当に取得したキーのみを提供してください。</li>
<li>キーの利用停止・削除を希望する場合は、<a href="/support">お問い合わせ</a>からご連絡ください。MightPulse側でキーを無効にすることでも、本サービスでの利用は止まります。</li>
</ul>`
  },
  {
    title: "禁止事項",
    body: `<ul>
<li>他人の領主IDやアカウントを、本人の許可なく登録すること</li>
<li>本サービスや外部サービスに過度な負荷をかける行為（自動化ツールによる大量アクセスなど）</li>
<li>不正アクセス、脆弱性の悪用、他の利用者の情報を不正に取得する行為</li>
<li>本サービスで得た情報を使った嫌がらせや、法令・公序良俗に反する行為</li>
<li>その他、運営者が不適切と判断する行為</li>
</ul>`
  },
  {
    title: "利用の制限・停止",
    body: `<p>本規約に違反した場合や、運営上必要と判断した場合は、事前の通知なく、ロールの変更、利用の制限、アカウントの停止を行うことがあります。</p>`
  },
  {
    title: "免責事項",
    body: `<ul>
<li>表示するデータは外部サービスから取得したもので、正確さ・最新性・完全性を保証しません。最大で1時間程度前のデータを含みます。</li>
<li>本サービスは予告なく内容の変更、一時停止、終了をすることがあります。</li>
<li>本サービスの利用、または利用できなかったことによって生じた損害について、運営者は責任を負いません。</li>
</ul>`
  },
  {
    title: "規約の変更",
    body: `<p>本規約は、必要に応じて変更することがあります。重要な変更がある場合は、本サービス上でお知らせします。変更後に本サービスを利用した時点で、変更後の規約に同意したものとみなします。</p>`
  },
  {
    title: "お問い合わせ",
    body: `<p>本規約に関するお問い合わせは、<a href="/support">お問い合わせ</a>ページ（EagleEye SupportのDiscordサーバー）からお願いします。</p>`
  }
];

function renderLegalPage({ title, description, updatedAt, sections, related, canonical = "" }) {
  const body = sections.map((section, i) =>
    `<section class="legal-section"><h2>${i + 1}. ${section.title}</h2>${section.body}</section>`
  ).join("");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | EagleEye</title><meta name="description" content="${description}">${canonical ? `<link rel="canonical" href="${canonical}">` : ""}
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
.legal-section a,.legal-related a{color:#8fdcff}
.legal-related{margin-top:18px;font-size:13px;color:#91a7bf}
html[data-eagle-theme="light"] body{background:#f3f6fb;color:#172033}
html[data-eagle-theme="light"] .legal-section{background:#fff;border-color:#d6deea}
html[data-eagle-theme="light"] .legal-section h2{color:#0e7490}
html[data-eagle-theme="light"] .legal-section code{background:#f1f5f9;color:#92400e}
html[data-eagle-theme="light"] .legal-back,html[data-eagle-theme="light"] .legal-section a,html[data-eagle-theme="light"] .legal-related a{color:#0369a1}
</style></head><body><main class="legal-wrap">
<a class="legal-back" href="/">← ホーム</a>
<h1>${title}</h1>
<p class="legal-updated">最終更新日：${updatedAt}</p>
${body}
<p class="legal-related">${related}</p>
</main></body></html>`;
}

export function renderPrivacyPolicyPage(origin = "") {
  return renderLegalPage({
    title: "プライバシーポリシー",
    description: "EagleEyeのプライバシーポリシー。取得する情報、Cookie、広告の配信、外部送信、保存期間について。",
    canonical: origin ? origin + "/privacy" : "",
    updatedAt: PRIVACY_POLICY_UPDATED_AT,
    sections: PRIVACY_SECTIONS,
    related: '関連：<a href="/terms">利用規約</a>・<a href="/about">運営者情報</a>'
  });
}

export function renderTermsPage(origin = "") {
  return renderLegalPage({
    title: "利用規約",
    description: "EagleEyeの利用規約",
    canonical: origin ? origin + "/terms" : "",
    updatedAt: TERMS_UPDATED_AT,
    sections: TERMS_SECTIONS,
    related: '関連：<a href="/privacy">プライバシーポリシー</a>・<a href="/about">運営者情報</a>'
  });
}

// 運営者情報（AdSense審査・利用者向けに、運営者と問い合わせ先を明記する）
export const ABOUT_UPDATED_AT = "2026年11月2日";
const ABOUT_SECTIONS = [
  {
    title: "EagleEyeについて",
    body: `<p>EagleEyeは、ゲーム「KingShot」の王国・同盟・プレイヤーのデータを集めて、ランキングの推移、KvKの戦況、英雄の育成に役立つ情報を見やすくまとめる、非公式のファン向けサービスです。</p>
<ul>
<li>王国ごとの戦力推移・タイムライン（<a href="/kingdoms">王国一覧</a>）</li>
<li>英雄のスキル（<a href="/hero-catalog">英雄カタログ</a>）と星上げの欠片計算（<a href="/tools/hero-shards">欠片計算</a>）</li>
<li>ログインすると、プレイヤー詳細、ウォッチリスト、KvKの通知などが使えます</li>
</ul>`
  },
  {
    title: "運営者",
    body: `<ul>
<li><b>サービス名</b>：EagleEye（イーグルアイ）</li>
<li><b>運営者</b>：BJ</li>
<li><b>URL</b>：https://eagleeye-ks.com</li>
</ul>`
  },
  {
    title: "お問い合わせ",
    body: `<p>ご質問・不具合の報告・データの削除依頼などは、<a href="/support">お問い合わせ</a>ページからお送りください。お問い合わせはEagleEye SupportのDiscordサーバー内の専用チャンネルで対応します。</p>`
  },
  {
    title: "データの出典",
    body: `<p>ゲーム内の公開データは、<a href="https://www.mightpulse.com/" target="_blank" rel="noopener noreferrer">MightPulse</a>のAPIを通じて取得しています。王国タイムラインなど一部の情報は、出典を明記したうえでコミュニティ資料を参考にしています。表示するデータは最大で1時間程度前のものを含み、正確さを保証するものではありません。</p>`
  },
  {
    title: "非公式サービスであること",
    body: `<p>本サービスはCentury Games、KingShotの運営会社、MightPulseとは関係がありません。ゲーム内の名称・画像の権利は、それぞれの権利者に帰属します。</p>`
  },
  {
    title: "広告について",
    body: `<p>本サービスは運営費をまかなうため、一部の公開ページに広告（Google AdSense）を表示する場合があります。広告とCookieの扱いは<a href="/privacy">プライバシーポリシー</a>をご覧ください。</p>`
  }
];

export function renderAboutPage(origin = "") {
  return renderLegalPage({
    title: "運営者情報",
    description: "EagleEye（KingShot非公式データサービス）の運営者情報とお問い合わせ先。",
    canonical: origin ? origin + "/about" : "",
    updatedAt: ABOUT_UPDATED_AT,
    sections: ABOUT_SECTIONS,
    related: '関連：<a href="/privacy">プライバシーポリシー</a>・<a href="/terms">利用規約</a>'
  });
}
