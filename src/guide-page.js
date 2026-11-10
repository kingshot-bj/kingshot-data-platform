// EagleEye の使い方（トリセツ）。だれでも見られる説明ページ。
// 数字や「ADVANCEDで増えること」は、ほかの画面と同じ定数から作る（説明と実際がずれないように）。
import { renderLegalPage } from "./legal-pages.js";
import { ADVANCED_BENEFITS } from "./role-upgrade.js";
import { INVITE_BONUS, INVITE_BONUS_CAP } from "./referrals.js";
import { PLAYER_COMPARE_MAX } from "./player-compare.js";
import { ALLIANCE_COMPARE_MAX } from "./alliance-compare.js";

export const GUIDE_UPDATED_AT = "2026年11月10日";
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const li = items => "<ul>" + items.map(t => `<li>${t}</li>`).join("") + "</ul>";

export const GUIDE_SECTIONS = Object.freeze([
  {
    title: "EagleEyeとは",
    body: `<p>EagleEye（イーグルアイ）は、キングショット（KingShot）の王国・同盟・プレイヤーのデータを見られる<b>非公式ファンサービス</b>です。ランキングや戦力の変化、KvK、聖剣争奪の下見などに使えます。</p>
<p>データは MightPulse を通して集めています。ゲームの公式サービスではありません。</p>`
  },
  {
    title: "はじめかた（3ステップ）",
    body: `<ol>
<li><b>Discordでログイン</b>：右上の「ログイン」から。ログインしなくても、王国の一覧・ランキング・英雄カタログ・計算ツールは見られます。</li>
<li><b>領主IDを登録</b>：<a href="/my-player">マイKingShot</a>で自分の領主IDを入れます（約30秒）。ホームに自分の戦力やウォッチ中の変化が出るようになります。</li>
<li><b>MightPulseのAPIキーを登録</b>：同じ<a href="/my-player">マイKingShot</a>で登録します（無料・約1分）。登録すると <b>ADVANCED</b> に上がります。</li>
</ol>`
  },
  {
    title: "権限（BASIC・ADVANCED・VIP）",
    body: `<p><b>BASIC</b>：ログインしただけの状態です。</p>
<p><b>ADVANCED</b>：領主IDとAPIキーを登録すると、無料でなれます。増えること：</p>${li(ADVANCED_BENEFITS.map(esc))}
<p>同盟比較もADVANCED以上の機能です。</p>
<p><b>VIP</b>：MightPulseのMighty対応のAPIキーを登録するとなれます（プレイヤーのCSV出力など）。</p>`
  },
  {
    title: "画面の下のメニュー",
    body: li([
      `<b>ホーム</b>：自分の領主・ウォッチ中の変化・お知らせ・開催中のイベント（KvK・聖剣争奪）の入口。`,
      `<b>ランキング</b>：王国ごとのランキング（戦力・撃破数・英雄・秘境の試練など）。右上の「ランキング設定」で見たい種類を選べます。`,
      `<b>検索</b>：領主名・領主ID・王国番号・同盟名・同盟タグで探せます。まだEagleEyeにない領主IDも、その場で取りに行きます。`,
      `<b>ウォッチ</b>：気になるプレイヤーや王国を登録して、変化を追いかけます。`,
      `<b>その他</b>：下で説明する機能の一覧です。`
    ])
  },
  {
    title: "比べる",
    body: li([
      `<b>プレイヤー比較</b>：プレイヤーウォッチリストで最大${PLAYER_COMPARE_MAX}人を選んで比べます。秘境の試練のステージ別の比較もあります。「画像で共有」でカードにできます。`,
      `<b>同盟比較</b>（ADVANCED以上）：違う王国の同盟どうしも比べられます（${ALLIANCE_COMPARE_MAX}同盟まで）。王国番号と同盟タグを入れてください。各同盟の上位3人の秘境の試練を、ステージごとに進んでいる順に並べます。自分が比べている同盟にいるときは「あなた」として、同盟の中で何位か・相手の同盟なら何位相当かも出ます。`,
      `<b>王国比較</b>：王国どうしの総戦力・伸び・領主数などを比べます。`
    ])
  },
  {
    title: "イベント",
    body: li([
      `<b>KvK</b>：対戦相手・スコアの推移・秘境の試練のステージ別比較（ADVANCED以上）。終わったあとも、メニューと<a href="/kvk">KvKのページ</a>から見られます。`,
      `<b>聖剣争奪</b>：開催中は、ホームに入口が出ます。組み合わせはゲームの外からは分からないので、同盟のR4・R5（ADVANCED以上）の人が対戦相手を登録します。登録が分かれたときは、多く登録された方を表示します。相手が決まったら同盟比較で下見できます。`
    ])
  },
  {
    title: "そのほかの機能",
    body: li([
      `<b>王国カタログ・王国ウォッチ</b>：王国の情報と、気になる王国の動き。`,
      `<b>英雄カタログ</b>：英雄の情報。`,
      `<b>計算ツール</b>：欠片計算・黄金計算・黄金研究計算。`,
      `<b>友だち招待</b>：招待リンクから来た人が初めてログインすると、その人のウォッチ枠が+${INVITE_BONUS.invitedSignup}。ADVANCEDになると+${INVITE_BONUS.invitedAdvanced}、招待した人も1人ごとに+${INVITE_BONUS.perQualifiedInvite}（招待でもらえる枠は合計${INVITE_BONUS_CAP}まで）。`,
      `<b>着せ替え</b>：サイトの色を変えられます（ダーク・ライトも選べます）。ゴールドとワインレッドは運営招待の限定カラーです。`,
      `<b>お知らせ・システム状況・サポート</b>：運営からのお知らせ、サービスの状態、困ったときの問い合わせ先。`
    ])
  },
  {
    title: "表示の見かた",
    body: li([
      `<b>100位圏外</b>：王国ランキング（上位100人）に入っていないので、値が分からないことを表します。`,
      `<b>取得中</b>：いま裏でデータを取りに行っているところです。少し待って開き直すと出ます。`,
      `<b>王国内◯位</b>：その人の王国のランキングでの本当の順位です。`,
      `<b>明るい枠・👑</b>：その項目でいちばん良い値です。`
    ])
  },
  {
    title: "困ったときは",
    body: `<p>うまく動かないとき・分からないときは、<a href="/support">サポート</a>（EagleEye SupportのDiscordサーバー）からお問い合わせください。サービスの状態は<a href="/status">システム状況</a>で確認できます。</p>`
  }
]);

export function renderGuidePage(origin = "") {
  return renderLegalPage({
    title: "使い方（トリセツ）",
    description: "EagleEye（キングショット非公式データサービス）の使い方。はじめかた、権限、ランキング・検索・ウォッチ・比較・KvK・聖剣争奪などの機能の説明。",
    canonical: origin ? origin + "/guide" : "",
    updatedAt: GUIDE_UPDATED_AT,
    sections: GUIDE_SECTIONS,
    related: '関連：<a href="/about">運営者情報</a>・<a href="/terms">利用規約</a>・<a href="/privacy">プライバシーポリシー</a>'
  });
}
