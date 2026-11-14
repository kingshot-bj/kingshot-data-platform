// SNS投稿の企画（機能紹介・比較・ランキング・使い方・告知）。オーナー画面 /owner/social で、SNSごとの投稿文をコピーして使う。
// ・素材（画像・動画）はSNS共通。文章だけSNSに合わせて少し変える。
// ・リンクの ?ref= はSNS名だけ（discord・x・youtube・tiktok・instagram）。成長ダッシュボードの「どこから来たか」でSNSごとに数えられる。
// ・TikTok・Instagram は投稿にリンクを貼れないので「プロフィールのリンクから」と書く（プロフィールには /?ref=tiktok などを置く）。
// ・D1 は使わない。企画はこのファイルだけ（静的）。
// ・守ること：KvK の勝敗予想をしない／オンライン状態・最終ログインに触れない／作った数字を書かない／公式と誤解される言い方をしない。
//   本人の画面を映す企画（consent）は、領主本人の了解を取ってから作る。
// SNSの並び（social-pack.js の SOCIAL_PLATFORMS と同じ。テストで確かめる。読み込み合いを避けるためここにも置く）。
export const PLAN_PLATFORMS = Object.freeze(["x", "discord", "youtube", "tiktok", "instagram"]);
const PLATFORM_LABELS = { x: "X", discord: "Discord", youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram" };
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const SOCIAL_SERIES = Object.freeze({
  kd: { name: "王国ランキング・分析", tags: ["#王国ランキング"] },
  pl: { name: "プレイヤー分析", tags: ["#プレイヤー分析"] },
  kvk: { name: "KvK・戦争", tags: ["#KvK"] },
  hero: { name: "英雄・装備・計算", tags: ["#英雄"] },
  team: { name: "ウォッチ・同盟活用", tags: ["#同盟"] },
  start: { name: "はじめて・便利機能", tags: [] },
  news: { name: "新機能・更新", tags: ["#アップデート"] }
});

export const SOCIAL_KINDS = Object.freeze({ intro: "機能紹介", compare: "比較", ranking: "ランキング", howto: "使い方", news: "告知" });

const BASE_TAGS = ["#キングショット", "#KingShot"];

// noAsset: 画像を作る仕組みがまだない（数字を手で書かない）。when: "kvk" = KvK の開催中だけ使う。consent: 本人の了解が要る。template: 中身を毎回書き換える。
export const SOCIAL_PLANS = Object.freeze([
  { id: "p01", series: "kd", kind: "intro", hook: "あなたの王国、世界で何番目？", point: "王国番号を入れるだけで、総戦力と7日間の伸びが分かります。", cta: "王国番号で検索", path: "/kingdoms" },
  { id: "p02", series: "kd", kind: "intro", hook: "うちの王国、伸びてる？止まってる？", point: "王国ページで総戦力の推移をグラフで見られます。", cta: "自分の王国を見る", path: "/kingdoms" },
  { id: "p03", series: "kd", kind: "intro", hook: "開設したばかりの王国、次は何が来る？", point: "王国タイムラインで、開設日数ごとに解放されるものと今の位置が分かります。", cta: "自分の王国の位置を見る", path: "/kingdom-timeline" },
  { id: "p04", series: "kd", kind: "intro", hook: "王国内で、英雄戦力1位は誰？", point: "王国ランキングは戦力・撃破数・英雄・秘境の試練などを切り替えて見られます。", cta: "自分の王国のランキングを見る", path: "/kingdom/rankings" },
  { id: "p05", series: "pl", kind: "intro", hook: "戦力だけじゃ分からない、本当の強さ", point: "プレイヤー詳細で、英雄・部隊・王国内の本当の順位まで見られます（無料登録）。", cta: "無料登録して検索", path: "/players", consent: true },
  { id: "p06", series: "hero", kind: "intro", hook: "強い人の装備、見てみたい？", point: "ADVANCEDになると、英雄の装備・領主装備・宝石まで見られます。", cta: "APIキーを登録して解放", path: "/my-player", consent: true },
  { id: "p07", series: "team", kind: "intro", hook: "ライバルの成長、毎日チェックしてない？", point: "プレイヤーウォッチに登録すると、変化がホームにまとまって出ます。", cta: "ウォッチに登録", path: "/player-watchlist" },
  { id: "p08", series: "team", kind: "intro", hook: "移民先、ちゃんと伸びてる王国を選んでる？", point: "王国ウォッチで、気になる王国の動きを自動で追いかけられます。", cta: "王国をウォッチ", path: "/kingdom-watchlist" },
  { id: "p09", series: "hero", kind: "intro", hook: "この英雄、育てる価値ある？", point: "英雄カタログで、英雄ごとのスキルを確認できます。", cta: "英雄を調べる", path: "/hero-catalog" },
  { id: "p10", series: "kvk", kind: "intro", hook: "KvKの相手、もう決まってるよ", point: "今シーズンの対戦表と、組み合わせごとの戦力が見られます。", cta: "自分の王国を探す", path: "/kvk/matchups", when: "kvk" },
  { id: "p11", series: "team", kind: "intro", hook: "同盟の仲間を招待すると、枠が増える", point: "招待リンクから来た人も、招待した人も、ウォッチ枠が増えます。", cta: "招待リンクを作る", path: "/invite" },
  { id: "p12", series: "hero", kind: "intro", hook: "黄金、あといくつ要る？", point: "黄金計算で、足りない量がすぐ分かります。", cta: "計算してみる", path: "/tools/gold" },
  { id: "p13", series: "kd", kind: "compare", hook: "王国A vs 王国B、どこで差がついてる？", point: "王国比較で、総戦力・伸び・領主数を並べて、項目ごとの差を画像にできます。", cta: "自分の王国で比べる", path: "/kingdom/compare" },
  { id: "p14", series: "pl", kind: "compare", hook: "戦力は同じなのに、どこで差がついた？", point: "プレイヤー比較で最大6人を並べられます。秘境の試練のステージ別の比較も。", cta: "同盟の仲間と比べる", path: "/player/compare", consent: true },
  { id: "p15", series: "kvk", kind: "compare", hook: "聖剣争奪の前に、相手の主力を下見", point: "同盟比較で、各同盟の上位3人の秘境の試練をステージごとに比べられます（ADVANCED）。", cta: "同盟を比べる", path: "/alliance/compare" },
  { id: "p16", series: "kd", kind: "compare", hook: "新しい王国と古い王国、伸びるのはどっち？", point: "王国一覧で、開設日数と7日間の伸びを並べて見られます。", cta: "自分の王国を見る", path: "/kingdoms" },
  { id: "p17", series: "kd", kind: "compare", hook: "自分の王国の上位100人、どんな顔ぶれ？", point: "王国ランキングのボードを切り替えると、戦力・英雄・撃破数で上位の顔ぶれが変わります。", cta: "自分の王国のランキングを見る", path: "/kingdom/rankings" },
  { id: "p18", series: "kvk", kind: "compare", hook: "KvKの対戦表、戦力差が小さい組み合わせ", point: "対戦表で組み合わせごとの戦力差が分かります（勝敗の予想はしません）。", cta: "対戦表を見る", path: "/kvk/matchups", when: "kvk" },
  { id: "p19", series: "kd", kind: "ranking", hook: "今週いちばん伸びた王国 TOP10", point: "7日間で総戦力が伸びた王国のランキングです。", cta: "自分の王国は何位？", path: "/kingdoms" },
  { id: "p20", series: "kd", kind: "ranking", hook: "世界の総戦力 TOP10", point: "総戦力が大きい王国のランキングです。", cta: "自分の王国を探す", path: "/kingdoms" },
  { id: "p21", series: "kd", kind: "ranking", hook: "開設180日以内、伸びている新しい王国 TOP10", point: "開設180日以内の王国で、7日間の伸びが大きい順です。", cta: "自分の王国を探す", path: "/kingdoms" },
  { id: "p22", series: "kd", kind: "ranking", hook: "先週から順位が一番上がった王国", point: "総戦力の順位を先週と比べました。", cta: "自分の王国を見る", path: "/kingdoms", noAsset: true },
  { id: "p23", series: "kd", kind: "ranking", hook: "秘境の試練、いちばん進んでいる王国", point: "王国ランキングの秘境の試練の記録から集めました。", cta: "自分の王国の記録を見る", path: "/kingdom/rankings", noAsset: true },
  { id: "p24", series: "start", kind: "howto", hook: "30秒でできる：無料登録と領主IDの連携", point: "登録すると、自分の戦力・ウォッチ中の変化・開催中のイベントがホームにまとまります。", cta: "登録する", path: "/login" },
  { id: "p25", series: "pl", kind: "howto", hook: "領主名でもIDでも同盟タグでも探せる", point: "プレイヤー検索は、まだEagleEyeにない領主IDもその場で取りに行きます。", cta: "検索してみる", path: "/players" },
  { id: "p26", series: "start", kind: "howto", hook: "ADVANCEDになる方法（無料・約1分）", point: "MightPulseのAPIキーを登録すると、英雄の装備・領主装備・KvK画面が見られます。", cta: "今すぐ登録", path: "/my-player" },
  { id: "p27", series: "pl", kind: "howto", hook: "比較結果を画像にしてDiscordで共有", point: "プレイヤー比較の「画像で共有」で、そのままカードにできます。", cta: "比較して共有", path: "/player/compare" },
  { id: "p28", series: "news", kind: "news", hook: "新機能：○○", point: "（何ができるようになったかを1文で）", cta: "使ってみる", path: "/news", template: true },
  { id: "p29", series: "news", kind: "news", hook: "EagleEyeでできること、まとめて見せます", point: "王国・プレイヤー・KvK・英雄のデータを、ひとつのサイトで見られます。", cta: "使い方を見る", path: "/guide" },
  { id: "p30", series: "kvk", kind: "news", hook: "KvKが始まったら、まずここを見よう", point: "対戦相手と組み合わせごとの戦力を、始まった日から確認できます。", cta: "対戦表を見る", path: "/kvk/matchups", when: "kvk" }
]);

export function planTags(plan) {
  return [...BASE_TAGS, ...(SOCIAL_SERIES[plan.series]?.tags || [])];
}

// SNSごとの投稿文。リンクの ?ref= はSNS名だけ。
export function planCaptions(plan, { origin = "https://eagleeye-ks.com" } = {}) {
  const link = p => `${origin}${plan.path}${plan.path.includes("?") ? "&" : "?"}ref=${p}`;
  const tags = planTags(plan).join(" ");
  const out = {
    x: `${plan.hook}\n\n${plan.point}\n\n${plan.cta} → ${link("x")}\n${tags}`,
    discord: `**${plan.hook}**\n${plan.point}\n\n${plan.cta} → ${link("discord")}`,
    youtube: { title: `${plan.hook}｜キングショット`.slice(0, 95), description: `${plan.point}\n\n${plan.cta}：${link("youtube")}\n\nEagleEye はキングショットの非公式データサイトです。\n${tags} #Shorts` },
    tiktok: `${plan.hook} ${plan.point} ${plan.cta}はプロフィールのリンクから！ ${tags} #ゲーム`,
    instagram: `${plan.hook}\n\n${plan.point}\n\n${plan.cta}はプロフィールのリンク（eagleeye-ks.com）から。\n${tags} #ゲーム #スマホゲーム`
  };
  return Object.fromEntries(PLAN_PLATFORMS.map(p => [p, out[p]]));
}

// TikTok・Instagram のプロフィールに置くリンク。
export function profileLink(platform, { origin = "https://eagleeye-ks.com" } = {}) {
  return `${origin}/?ref=${platform}`;
}

// オーナー画面の「投稿企画」欄。企画ごとに折りたたみ、SNSごとの投稿文をコピーできる（コピーのボタンは画面側の共通スクリプト）。
export function renderPlansSection({ origin = "https://eagleeye-ks.com" } = {}) {
  const caption = c => typeof c === "string" ? c : `${c.title}\n\n${c.description}`;
  const badge = p => [p.when === "kvk" ? "KvK開催中だけ" : "", p.consent ? "本人の了解が必要" : "", p.template ? "書き換えて使う" : "", p.noAsset ? "画像はまだ作れない" : ""].filter(Boolean).map(t => `<span class="badge">${esc(t)}</span>`).join("");
  const plans = SOCIAL_PLANS.map(p => {
    const c = planCaptions(p, { origin });
    return `<details class="plan"><summary><b>${esc(p.id)}</b> <span class="muted">${esc(SOCIAL_KINDS[p.kind])}・${esc(SOCIAL_SERIES[p.series].name)}</span> ${esc(p.hook)} ${badge(p)}</summary>
<p class="muted">誘導先：<a href="${esc(p.path)}" target="_blank" rel="noopener">${esc(p.path)}</a></p>
<div class="caps">${PLAN_PLATFORMS.map(k => `<div class="cap"><div class="cap-h"><b>${PLATFORM_LABELS[k]}</b><button type="button" class="copy">コピー</button></div><textarea readonly rows="4">${esc(caption(c[k]))}</textarea></div>`).join("")}</div></details>`;
  }).join("");
  const profiles = ["tiktok", "instagram"].map(k => `<div class="cap"><div class="cap-h"><b>${PLATFORM_LABELS[k]} のプロフィール</b><button type="button" class="copy">コピー</button></div><textarea readonly rows="1">${esc(profileLink(k, { origin }))}</textarea></div>`).join("");
  return `<section class="card" id="plans"><h2>投稿企画（${SOCIAL_PLANS.length}件）<small>画像・動画はSNS共通。文章だけSNSごとに少し変えています。リンクの ?ref= はSNS名なので、成長ダッシュボードの「どこから来たか」でSNSごとに数えられます。</small></h2>
<p class="muted">TikTok・Instagram は投稿にリンクを貼れないので、プロフィールに下のリンクを置いてください。</p><div class="caps">${profiles}</div>${plans}</section>`;
}
