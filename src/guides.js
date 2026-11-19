// 読み物：イベントの基本（/guides）。2026-11-19
// ・複数の攻略サイト・公式ヘルプの説明を読み比べ、一致している事実だけを EagleEye の言葉でまとめたもの（文章の転載・直訳はしない）。
// ・解説によって違う点は「解説によって違う」と書き、ゲーム内の案内で確かめるよう書く。数字の言い切りはしない。
// ・総力は強さと比例しない（docs/KINGSHOT_GAME_KNOWLEDGE.md）。勝敗の予想はしない。
// ・EagleEye のデータで分かることは、データの日付つきで書く（独自の内容）。
import { shell } from "./public-pages.js";
import { GUIDE_PATHS, GUIDE_SLUGS } from "./guides-paths.js";
import { GUIDES_EN } from "./guides-en.js";

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const GUIDE_DATE = "2026-11-19";
const NOTE = `<p class="gnote">この記事は、公開されている攻略サイトや公式ヘルプの説明を EagleEye が読み比べ、一致している内容をまとめたものです（${GUIDE_DATE} 時点）。イベントの決まりはアップデートで変わることがあります。いちばん新しい内容は、ゲーム内のイベントの案内（ルール）で確かめてください。EagleEye はキングショットの非公式サービスです。</p>`;

const GUIDES = [
  {
    slug: "swordland-showdown",
    title: "聖剣争奪とは？ 流れ・ポイントの稼ぎ方・準備しておくこと",
    lead: "同盟どうしが1時間で戦う「聖剣争奪」の流れと、勝ち負けの決まり方、始まる前に準備しておくことをまとめました。",
    points: ["同盟と同盟が1時間で戦い、終わった時点のポイントが多い方が勝ち", "建物を取って持ち続けるのが中心。撃破や輸送隊・地下の施設でもポイントが入る", "始まる時に部隊が城に戻って空いていないと参加できない"],
    body: () => `
<h2>どんなイベント？</h2>
<p>聖剣争奪（Swordland Showdown）は、<b>同盟と同盟が専用の戦場で1時間戦う</b>イベントです。開催はおおむね2週間に1回で、日曜に戦いがある、とする解説が多くあります。</p>
<p>参加できるのは、<b>同盟総力が上位の同盟</b>（上位20同盟とする解説が多い）です。同盟は「レギオン」という部隊の単位で登録し、1つの同盟から2つまで出せる、1つのレギオンは出場30人＋控え10人、とする解説があります。</p>

<h2>始まるまでの流れ</h2>
<ol>
<li><b>参加の登録</b>：同盟のリーダーや R4 が、出場するメンバーをレギオンに登録します。メンバーは1つのレギオンにだけ入れます。</li>
<li><b>組み合わせ</b>：登録が終わると対戦相手が決まります。決め方は解説によって違い、「登録メンバーの上位の部隊の戦力」「勝率」「選んだ時間帯」などが挙げられています。</li>
<li><b>戦い（1時間）</b>：選んだ時間帯に始まります。</li>
</ol>
<p>投票・登録・組み合わせがそれぞれ2日ずつある、とする解説もあります。日程は王国や回によって違うことがあるので、ゲーム内の案内で確かめてください。</p>

<h2>勝ち負けの決まり方</h2>
<p>1時間が終わった時点で、<b>ポイント（レリックポイント）が多い同盟の勝ち</b>です。ポイントの主な入り方は、どの解説でもおおむね共通しています。</p>
<ul>
<li><b>建物を取って持ち続ける</b>：戦場には建物がいくつもあり、取っている間ポイントが入ります。時間がたつと新しい建物が開き、<b>真ん中の大きな建物がいちばんポイントが大きい</b>（最初のしばらくは取れない）とする解説が多くあります。</li>
<li><b>輸送隊（Baggage Train）を襲う</b>：戦場を動く輸送隊からもポイントが取れます。</li>
<li><b>地下の施設（Undercellar）</b>：後半に戦場のどこかに現れ、早く取るとまとまったポイントになります。</li>
<li><b>敵の部隊を倒す</b>：倒した分もポイントになります。ただし、撃破のポイントは個人の分だけ、同盟の勝ち負けには建物が大事、とする解説もあります。</li>
</ul>
<p>解説の多くが、<b>「たくさん戦うより、建物を取る時間と集結の動きをそろえる方が大事」</b>とまとめています。</p>

<h2>兵士は減る？</h2>
<p>聖剣争奪では、倒された兵士は負傷の扱いで、戦場を出るときに無料で治る、とする解説があります。ふだんの戦闘より気軽に参加しやすいイベントです（細かい決まりはゲーム内のルールで確かめてください）。</p>

<h2>報酬</h2>
<p>同盟の報酬は<b>1つめのレギオンの結果</b>で決まり、個人の報酬は<b>個人のポイントの順位</b>で決まる、とする解説があります。負けても報酬（聖剣争奪のショップで使えるもの）はもらえます。</p>

<h2>始まる前に準備しておくこと</h2>
<ul>
<li><b>開始の時に部隊を城に戻しておく</b>：行軍中・治療中・援軍中の部隊は参加できません。</li>
<li><b>同盟から抜けない</b>：登録が終わるまでに同盟にいる必要があります。登録したのに来ないと、組み合わせに影響するとされています。</li>
<li><b>集結の役割を決めておく</b>：どの建物を誰が取りに行くか、集結を誰が主催するかを先に決めておくと動きやすくなります。集結の強さは主催する人の英雄・装備で決まりやすいので、強い人が主催するのが基本です。</li>
</ul>

<h2>EagleEye での使い方</h2>
<ul>
<li><b>開催中かどうか</b>：<a href="/swordland">聖剣のページ</a>とホームに、自分の王国の聖剣争奪の期間が出ます（MightPulse の日程から1日1回確認）。</li>
<li><b>対戦相手の登録</b>：組み合わせはゲームの外からは分からないので、同盟の R4・R5 に相手を登録してもらいます（R4・R5 が EagleEye を使っていない同盟はメンバーも登録できます）。登録すると、同盟のメンバー全員のホームに相手が出ます。</li>
<li><b>相手と比べる</b>：<a href="/alliance/compare">同盟比較</a>で、相手の同盟の上位の人を並べて比べられます。比較は「画像で共有」で同盟の Discord に貼れます。</li>
<li><b>過去の相手</b>：聖剣のページに、これまでの対戦相手が残ります。</li>
</ul>
<p class="gwarn">総力（同盟総力・個人の総力）は規模の数字で、強さとそのまま比例しません。相手の総力が大きくても、集結を主催するトップ層の育成で結果は大きく変わります（<a href="/reports/power-vs-mystic-2026-11">総力と秘境の試練の関係</a>）。</p>`
  },
  {
    slug: "swordland-summit-league",
    title: "聖剣頂上リーグとは？ ふつうの聖剣争奪との違いとシーズンの流れ",
    lead: "聖剣争奪をリーグ戦にした「聖剣頂上リーグ」のしくみを、ふつうの聖剣争奪との違いと、EagleEye で確認できた開催の傾向とあわせてまとめました。",
    points: ["聖剣争奪のしくみで、毎週対戦するシーズン制のリーグ", "EagleEye で日程を確認できた王国では、今のシーズンは 10/30〜12/15（約6週間）", "開催のない王国もある（EagleEye で確認できた範囲では新しい王国）"],
    body: () => `
<h2>どんなイベント？</h2>
<p>聖剣頂上リーグ（Swordland Summit League）は、<b>聖剣争奪の戦い方のまま、シーズンを通して毎週対戦するリーグ戦</b>です。1回の戦いは聖剣争奪と同じく1時間、とする解説が多くあります。</p>

<h2>ふつうの聖剣争奪との違い</h2>
<ul>
<li><b>毎週ある</b>：聖剣争奪はおおむね2週間に1回ですが、頂上リーグはシーズン中、毎週対戦があります。</li>
<li><b>ほかの王国の同盟とも当たる</b>：いくつかの王国をまとめた範囲（ゾーン）で組み合わせが決まります。公式ヘルプでは、リーグが開かれるには、その範囲に登録したレギオンが一定数（16）以上必要と説明されています。</li>
<li><b>実力の近いグループに分かれる</b>：レギオンは部隊の戦力の順位で、いくつかの段階（ティア）に分けられる、とする解説があります。段階の名前は解説によって違います。</li>
<li><b>勝ち負けでリーグのポイントがたまる</b>：勝っても負けてもポイントが入り（勝つ方が多い）、シーズンの順位につながる、とする解説があります。予選で負けたレギオンも、別のポイント戦に回ってシーズンを続けられる、とする解説もあります。</li>
</ul>

<h2>シーズンの長さと日程</h2>
<p>シーズンはおよそ6週間で、前半が予選、後半が決勝、とする解説があります。一方で、日程はいつも同じではなく、前もって公開されないとも言われています。</p>
<p><b>EagleEye で確認できたこと（${GUIDE_DATE} 時点）</b>：EagleEye に登録している人の王国のうち、頂上リーグの日程が出ている王国では、今のシーズンは<b>10月30日〜12月15日（約6週間半）</b>でした。毎週の対戦は月曜の9:00（日本時間）で区切られます。</p>

<h2>参加できる王国・同盟</h2>
<p>役場のレベルなど、参加には条件があります（条件の細かい数字は公式ヘルプやゲーム内の案内で確かめてください）。1つの同盟から2つまでレギオンを出せる、とする解説があります。</p>
<p><b>EagleEye で確認できたこと（${GUIDE_DATE} 時点・16王国）</b>：頂上リーグの日程が出ていたのは王国番号 1524 以下の王国で、1910 以降の王国では出ていませんでした。新しい王国はまだリーグの対象になっていない可能性があります（調べた王国の数が少ないので、目安として見てください）。</p>

<h2>準備しておくこと</h2>
<ul>
<li>聖剣争奪と同じく、<b>開始の時に部隊を城に戻しておく</b>こと、<b>集結の役割を決めておく</b>ことが大事です。</li>
<li>毎週あるので、<b>出場メンバーと控えを毎週そろえる</b>のが続けるコツです。</li>
</ul>

<h2>EagleEye での使い方</h2>
<ul>
<li><a href="/swordland">聖剣のページ</a>に、頂上リーグは聖剣争奪とは別の枠で出ます（同時に開催しているときは2つ並びます）。対戦相手は<b>毎週</b>登録し直します。</li>
<li>相手を登録すると、<a href="/alliance/compare">同盟比較</a>で相手の同盟と比べられます。ほかの王国の同盟とも比べられます。</li>
<li>聖剣のページの「過去の対戦相手」に、これまでの週の相手が残ります。</li>
</ul>`
  },
  {
    slug: "kvk",
    title: "KvK（王国対抗戦）とは？ 準備フェーズと戦闘フェーズの流れ",
    lead: "2つの王国が戦う KvK の流れを、準備フェーズ・戦闘フェーズに分けてまとめました。EagleEye で相手王国を見る方法も紹介します。",
    points: ["2つの王国が組み合わされ、まず準備フェーズでポイントを競う", "準備フェーズに勝った王国だけが、相手の王城を攻められる", "王城は同盟ごとの占領時間で勝ち負けが決まる"],
    body: () => `
<h2>どんなイベント？</h2>
<p>KvK（Kingdom of Power／王国対抗戦）は、<b>2つの王国が組み合わされて戦う</b>イベントです。大きく<b>準備フェーズ</b>と<b>戦闘フェーズ</b>に分かれます。参加には王国の開設からの日数や役場のレベルの条件がある、とする解説があります。</p>

<h2>組み合わせ</h2>
<p>相手の王国は、王国の戦力や活動の度合いなどをもとに決まる、とされています（決め方の細かい説明は解説によって違います）。</p>
<p><b>EagleEye で分かったこと</b>：KvK シーズン23の全1,219組を調べたところ、総力が大きい方の王国が秘境の試練でも上とは限りませんでした（<a href="/reports/kvk-s23-matchups">KvK シーズン23の組み合わせ分析</a>）。総力だけで相手の強さは決まりません。</p>

<h2>準備フェーズ</h2>
<p>数日間（約5日とする解説が多い）、日替わりのお題（建設・訓練・研究・消費など）をこなしてポイントを集め、王国どうしで合計を競います。<b>準備フェーズに勝った王国が、戦闘フェーズで相手の王城を攻める側になります</b>。負けた王国の王城は攻められる側です。</p>
<p>そのため、<b>準備フェーズの勝ち負けがとても大事</b>です。加速アイテムや資源を、その日のお題に合わせて使うのが基本です。</p>

<h2>戦闘フェーズ</h2>
<ul>
<li>準備フェーズに勝った王国は、決められた時間の間、相手の王国へ移動して攻められます。</li>
<li>勝ち負けは<b>相手の王城の占領時間</b>で決まります。占領時間は<b>同盟ごと</b>に数えられる、とする解説があります（同じ王国の2つの同盟が分けて占領するより、1つの同盟が長く持つ方が有利）。</li>
<li>王城のまわりの砲台を取ると有利になる、とする解説があります。</li>
<li>失った兵士の一部は、あとで回復できるしくみがある、とする解説があります。</li>
</ul>
<p>開始時刻や時間の長さは解説によって違うので、ゲーム内の案内で確かめてください。</p>

<h2>準備しておくこと</h2>
<ul>
<li>準備フェーズのお題に合わせて、<b>加速アイテム・資源をためておく</b>。</li>
<li>戦闘フェーズに向けて、<b>兵士を育てる・病院の容量を確かめる</b>。</li>
<li>攻められる側になったら、<b>シールド（保護）の時間</b>を確かめておく。</li>
</ul>

<h2>EagleEye での使い方</h2>
<ul>
<li><a href="/kvk">KvK のページ</a>で、自分の王国の今の相手・スコアの推移・過去の結果が見られます（ADVANCED 以上）。</li>
<li>相手王国と<b>秘境の試練の1位の記録</b>を比べられます。総力より、集結を主催するトップ層の育成に近い目安です。</li>
<li>「📤 相手王国と比べて画像で共有」で、<a href="/kingdom/compare">王国比較</a>を画像にして王国の Discord に貼れます。</li>
<li>全王国の組み合わせは <a href="/kvk/matchups">KvK の組み合わせ</a>で見られます。</li>
</ul>
<p class="gwarn">EagleEye は KvK の勝ち負けを予想しません。数字は相手を知るための材料として使ってください。</p>`
  }
];
if (GUIDES.map(g => g.slug).join(",") !== GUIDE_SLUGS.join(",")) throw new Error("GUIDE_SLUGS mismatch");
export const GUIDE_LIST = Object.freeze(GUIDES.map(({ slug, title, lead, points }) => ({ slug, title, lead, points })));
if (GUIDES_EN.map(g => g.slug).join(",") !== GUIDE_SLUGS.join(",")) throw new Error("GUIDES_EN slugs mismatch");
export const GUIDE_LIST_EN = Object.freeze(GUIDES_EN.map(({ slug, title, lead, points }) => ({ slug, title, lead, points })));
const NOTE_EN = `<p class="gnote">EagleEye compared publicly available guides and the official help, and summarized the points they agree on (as of ${GUIDE_DATE}). Event rules can change with updates — always check the in-game event info for the latest rules. EagleEye is an unofficial Kingshot service.</p>`;

const CSS = `<style>article h2{font-size:18px;margin:26px 0 8px}article p,article li{font-size:14px;line-height:1.9}article ul,article ol{padding-left:20px}.gmeta{font-size:12px;color:var(--ee-subtext)}.gpoints{border:1px solid var(--ee-border-soft);border-radius:12px;background:var(--ee-panel);padding:10px 14px 10px 30px;margin:12px 0}.gpoints li{font-size:13px}.gnote{margin-top:24px;font-size:11px;color:var(--ee-subtext);line-height:1.7}.gwarn{font-size:13px;padding:10px 12px;border-radius:10px;border:1px dashed var(--ee-border-soft)}.glist{display:grid;gap:10px}.gcard{display:block;padding:14px;border:1px solid var(--ee-border-soft);border-radius:12px;background:var(--ee-panel);text-decoration:none;color:inherit}.gcard b{display:block;font-size:15px;margin-bottom:4px}.gcard small{display:block;color:var(--ee-subtext);font-size:12px;line-height:1.6}.gcard em{display:inline-block;margin-top:6px;font-style:normal;font-size:12px;color:var(--ee-cyan)}</style>`;

export function renderGuidesIndex({ origin = "", lang = "ja" } = {}) {
  if (lang === "en") {
    const list = GUIDE_LIST_EN.map(g => `<a class="gcard" href="/en/guides/${g.slug}"><b>${esc(g.title)}</b><small>${esc(g.lead)}</small><em>Read →</em></a>`).join("");
    const body = `${CSS}<nav class="crumbs"><a href="/en">EagleEye</a> › Event basics</nav>
<h1>Event basics</h1><p class="lead">How the main Kingshot events work, and how to use EagleEye with them.</p>
<div class="glist">${list}</div>${NOTE_EN}`;
    const jsonLd = origin ? { "@context": "https://schema.org", "@graph": [
      { "@type": "CollectionPage", name: "Kingshot event basics", url: origin + "/en/guides", inLanguage: "en", mainEntity: { "@type": "ItemList", itemListElement: GUIDE_LIST_EN.map((g, i) => ({ "@type": "ListItem", position: i + 1, url: origin + "/en/guides/" + g.slug, name: g.title })) } },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "EagleEye", item: origin + "/en" }, { "@type": "ListItem", position: 2, name: "Event basics", item: origin + "/en/guides" }] }
    ] } : null;
    return shell({ title: "Kingshot event basics — Swordland Showdown, Summit League, KvK | EagleEye", description: "How Kingshot's Swordland Showdown, Swordland Summit League and KvK work, summarized from guides and the official help.", canonical: origin + "/en/guides", body, jsonLd, origin, lang: "en" });
  }
  const list = GUIDE_LIST.map(g => `<a class="gcard" href="/guides/${g.slug}"><b>${esc(g.title)}</b><small>${esc(g.lead)}</small><em>読む →</em></a>`).join("");
  const body = `${CSS}<nav class="crumbs"><a href="/">EagleEye</a> › イベントの基本</nav>
<h1>イベントの基本</h1><p class="lead">キングショットの主なイベントの流れと、EagleEye での使い方をまとめた読み物です。数字の分析は <a href="/reports">データレポート</a> にあります。</p>
<div class="glist">${list}</div>${NOTE}`;
  const jsonLd = origin ? { "@context": "https://schema.org", "@graph": [
    { "@type": "CollectionPage", name: "キングショット イベントの基本", url: origin + "/guides", inLanguage: "ja", mainEntity: { "@type": "ItemList", itemListElement: GUIDE_LIST.map((g, i) => ({ "@type": "ListItem", position: i + 1, url: origin + "/guides/" + g.slug, name: g.title })) } },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "EagleEye", item: origin + "/" }, { "@type": "ListItem", position: 2, name: "イベントの基本", item: origin + "/guides" }] }
  ] } : null;
  return shell({ title: "キングショット イベントの基本（聖剣争奪・頂上リーグ・KvK） | EagleEye", description: "キングショット（KingShot）の聖剣争奪・聖剣頂上リーグ・KvK の流れと準備を、攻略サイトや公式ヘルプを読み比べてまとめました。", canonical: origin + "/guides", body, jsonLd, origin });
}

export function renderGuide(slug, { origin = "", lang = "ja" } = {}) {
  if (lang === "en") {
    const g = GUIDES_EN.find(x => x.slug === slug);
    if (!g) return null;
    const others = GUIDES_EN.filter(x => x !== g).map(x => `<li><a href="/en/guides/${x.slug}">${esc(x.title)}</a></li>`).join("");
    const body = `${CSS}<nav class="crumbs"><a href="/en">EagleEye</a> › <a href="/en/guides">Event basics</a></nav>
<article><h1>${esc(g.title)}</h1><p class="gmeta">Published ${GUIDE_DATE} · EagleEye</p><p class="lead">${esc(g.lead)}</p>
<ul class="gpoints">${g.points.map(p => `<li>${esc(p)}</li>`).join("")}</ul>
${g.body(GUIDE_DATE)}
${NOTE_EN}</article>
<h2>More guides</h2><ul>${others}</ul>`;
    const jsonLd = { "@context": "https://schema.org", "@graph": [
      { "@type": "Article", headline: g.title, description: g.lead, datePublished: GUIDE_DATE, dateModified: GUIDE_DATE, inLanguage: "en", author: { "@type": "Organization", name: "EagleEye" }, publisher: { "@type": "Organization", name: "EagleEye" }, mainEntityOfPage: origin + "/en/guides/" + g.slug },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "EagleEye", item: origin + "/en" }, { "@type": "ListItem", position: 2, name: "Event basics", item: origin + "/en/guides" }, { "@type": "ListItem", position: 3, name: g.title, item: origin + "/en/guides/" + g.slug }] }
    ] };
    return shell({ title: `${g.title} | Kingshot | EagleEye`, description: g.lead, canonical: origin + "/en/guides/" + g.slug, body, jsonLd, origin, lang: "en" });
  }
  const g = GUIDES.find(x => x.slug === slug);
  if (!g) return null;
  const others = GUIDES.filter(x => x !== g).map(x => `<li><a href="/guides/${x.slug}">${esc(x.title)}</a></li>`).join("");
  const body = `${CSS}<nav class="crumbs"><a href="/">EagleEye</a> › <a href="/guides">イベントの基本</a></nav>
<article><h1>${esc(g.title)}</h1><p class="gmeta">${GUIDE_DATE} 公開・EagleEye</p><p class="lead">${esc(g.lead)}</p>
<ul class="gpoints">${g.points.map(p => `<li>${esc(p)}</li>`).join("")}</ul>
${g.body()}
${NOTE}</article>
<h2>ほかの記事</h2><ul>${others}<li><a href="/reports">データレポート</a></li></ul>`;
  const jsonLd = { "@context": "https://schema.org", "@graph": [
    { "@type": "Article", headline: g.title, description: g.lead, datePublished: GUIDE_DATE, dateModified: GUIDE_DATE, inLanguage: "ja", author: { "@type": "Organization", name: "EagleEye" }, publisher: { "@type": "Organization", name: "EagleEye" }, mainEntityOfPage: origin + "/guides/" + g.slug },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "EagleEye", item: origin + "/" }, { "@type": "ListItem", position: 2, name: "イベントの基本", item: origin + "/guides" }, { "@type": "ListItem", position: 3, name: g.title, item: origin + "/guides/" + g.slug }] }
  ] };
  return shell({ title: `${g.title}｜キングショット | EagleEye`, description: g.lead, canonical: origin + "/guides/" + g.slug, body, jsonLd, origin });
}

export { GUIDE_PATHS };
