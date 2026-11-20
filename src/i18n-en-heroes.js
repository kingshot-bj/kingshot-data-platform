// 英語版の辞書：英雄カタログ（/hero-catalog）と英雄ページ（/heroes/〇〇）。2026-11-20
// スキル名・説明・数値は hero-skills-en.js（スキルカードの中だけで置き換える）。
// 英雄名のあとに「の」「は」が続く文（例：「ルナの個別ページ」）は、短い名前が区切りの判定で訳されないため、先に名前だけ英語にする。
import { HERO_SLUGS } from "./hero-slugs.js";
import { HERO_NAME_ALIASES } from "./hero-shards.js";
import { HERO_NAMES_EN } from "./i18n-en-data.js";

const NAME_EN = new Map(HERO_NAMES_EN);
for (const [alias, canonical] of Object.entries(HERO_NAME_ALIASES)) {
  const en = NAME_EN.get(canonical) || NAME_EN.get(alias);
  if (en) { NAME_EN.set(alias, en); NAME_EN.set(canonical, en); }
}
NAME_EN.set("レン&amp;ロン", "Wee &amp; Woo");
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NAMES = [...NAME_EN.keys()].sort((a, b) => b.length - a.length).map(reEsc).join("|");
const nameEn = n => NAME_EN.get(n) || n;
const RARITY = { "レジェンド": "Legendary", "エピック": "Epic", "レア": "Rare" };
const TROOP = { "歩兵": "Infantry", "騎兵": "Cavalry", "弓兵": "Archer" };
const days = (a, b) => b ? `days ${a}–${b}` : `day ${a}`;
// 一覧の丸いアイコンの文字（画像がない英雄だけ）：日本語名の頭2文字 → 英語名の頭2文字
const INITIALS = new Map([...NAME_EN].map(([ja, en]) => [[...ja].slice(0, 2).join(""), en.slice(0, 2)]));

export const HEROES_EARLY = [
  // 英雄ページの紹介文（heroSummary）
  [new RegExp("(" + NAMES + ")は(?:第(\\d+)世代の)?(レジェンド|エピック|レア)英雄(?:（(歩兵|騎兵|弓兵)）)?です。", "g"),
    (m, n, g, r, t) => `${nameEn(n)} is a ${g ? "Gen " + g + " " : ""}${RARITY[r]} hero${t ? " (" + TROOP[t] + ")" : ""}. `],
  [/王国の開設直後から登場します。/g, "Available from the day a kingdom opens. "],
  [/王国の開設から(\d+)(?:〜(\d+))?日目ごろに登場します。/g, (m, a, b) => `Appears around ${days(a, b)} after a kingdom opens. `],
  [/星上げには専用の欠片だけが使えます。/g, "Only its own shards can be used for star-ups."],
  [/星上げには(レジェンド|エピック|レア)共通の欠片も使えます。/g, (m, r) => `General ${RARITY[r]} shards can also be used for star-ups.`],
  [/((?:討伐|遠征|専用装備)(?:・(?:討伐|遠征|専用装備))*)のスキル(\d+)個の効果と初期値・最大値を日本語でまとめています。/g,
    (m, g, n) => ` Effects and base/max values of its ${n} ${g.replace(/討伐/, "conquest").replace(/遠征/, "expedition").replace(/専用装備/, "exclusive gear").replace(/・/g, ", ")} skills.`],
  // 一覧の世代のまとまり（heroCatalogGroup）
  [/第(\d+)世代（レジェンド）/g, "Gen $1 (Legendary)"],
  [/開設直後から · (\d+)人/g, "From kingdom launch · $1 heroes"],
  [/開設から(\d+)(?:〜(\d+))?日目ごろ · (\d+)人/g, (m, a, b, c) => `Around ${days(a, b)} · ${c} heroes`],
  [/開設から(\d+)(?:〜(\d+))?日目ごろ/g, (m, a, b) => `around ${days(a, b)}`],
  [/（開設直後）/g, " (kingdom launch)"],
  [/（開設(\d+)(?:〜(\d+))?日目ごろ）/g, (m, a, b) => ` (around ${days(a, b)})`],
  [/第(\d+)世代 SSR英雄/g, "Gen $1 SSR heroes"],
  [/>第(\d+)世代</g, ">Gen $1<"],
  [/>(\d+) スキル · /g, ">$1 skills · "],
  [/>(\d+)個</g, ">$1<"],
  [/>([\d,]+)個（専用欠片のみ）</g, ">$1 (own shards only)<"],
  [/>([\d,]+)個</g, ">$1<"],
  // 英雄名＋「の」「で〜を」
  [new RegExp("(" + NAMES + ")の個別ページ（世代・欠片・同じ兵種の英雄） →", "g"), (m, n) => `${nameEn(n)}’s page (generation, shards, same-troop heroes) →`],
  [new RegExp("(" + NAMES + ")の個別ページ（スキル・世代・欠片）", "g"), (m, n) => `${nameEn(n)}’s page (skills, generation, shards)`],
  [new RegExp("(" + NAMES + ")のページ <b>", "g"), (m, n) => `${nameEn(n)}’s page <b>`],
  [new RegExp("(" + NAMES + ")のスキルと性能｜キングショット英雄", "g"), (m, n) => `${nameEn(n)} skills and stats | Kingshot heroes`],
  [new RegExp("(" + NAMES + ")のスキルと性能", "g"), (m, n) => `${nameEn(n)} skills and stats`],
  [new RegExp("欠片計算で(" + NAMES + ")を計算する", "g"), (m, n) => `Calculate ${nameEn(n)} shards`],
  [/同じ兵種の(レジェンド|エピック|レア)英雄/g, (m, r) => `Same-troop ${RARITY[r]} heroes`],
  // 丸いアイコンの文字
  [/(<(?:span|div) class="hero-(?:avatar(?: hero-avatar-large)?|face hero-face-text)">)([^<]{1,2})(<\/(?:span|div)>)/g, (m, a, t, c) => a + (INITIALS.get(t) || t) + c],
  // 検索用の別名（data-hero）は英語の名前だけにする
  [/( data-hero=")([^"]*)(")/g, (m, a, v, c) => a + v.split(" ").map(w => NAME_EN.get(w)?.toLowerCase() || w).filter(w => !/[぀-ヿ一-鿿]/.test(w)).join(" ") + c]
];

export const HEROES_EN = [
  ["キングショット 英雄一覧・スキルカタログ | EagleEye", "Kingshot Hero List & Skill Catalog | EagleEye"],
  ["キングショット（KingShot）の英雄のスキル一覧。討伐スキル・遠征スキルの効果と初期値・最大値を英雄ごとに日本語でまとめています。", "Every Kingshot hero's skills: conquest and expedition skill effects with base and max values, hero by hero."],
  ["キングショット 英雄一覧", "Kingshot Hero List"],
  ['<p class="eyebrow">英雄</p>', '<p class="eyebrow">Hero</p>'],
  ["（KingShot）の英雄のスキル一覧。", ": every hero’s skills. "],
  ["英雄を世代ごとに並べ、討伐・遠征・専用装備のスキルをまとめています。英雄名で検索し、知りたいスキルだけを開けます。", "Heroes grouped by generation, with their conquest, expedition and exclusive gear skills. Search by name and open only the hero you need."],
  ["スキル情報は公開資料との照合記録です。ゲーム内で全件確認済みではありません。MightPulseのスキルIDとの対応が未確定のため、プレイヤー個人のスキルLvとは紐付けていません。", "Skill data is checked against public sources and not every entry is confirmed in game. Skill IDs from MightPulse aren't mapped yet, so this isn't linked to each player's skill levels."],
  ["ゲーム内の表記をもとにしたスキル情報です。アップデートで数値や説明が変わることがあります。", "Skill data based on the in-game text. Values and descriptions may change with updates."],
  ["。アップデートで数値や説明が変わることがあります。", ". Values and descriptions may change with updates."],
  ["スキル情報の出典：", "Skill data source: "],
  ["ゲーム内の表記・参考 ", "in-game text · see also "],
  ["ゲーム内の表記", "in-game text"],
  ["出典：", "Source: "],
  ["📅 英雄が登場する時期（王国タイムライン） →", "📅 When heroes appear (kingdom timeline) →"],
  ["英雄が登場する時期（王国タイムライン）", "When heroes appear (kingdom timeline)"],
  ["⭐ 英雄の欠片の必要数を計算する →", "⭐ Calculate hero shards needed →"],
  ["← 英雄カタログで全英雄を見る", "← See all heroes in the hero catalog"],
  ["一致する英雄が見つかりません。", "No matching heroes."],
  ["英雄名で検索…", "Search heroes…"], ["英雄名で検索", "Search heroes"],
  ["世代別の英雄一覧", "Heroes by generation"],
  ["そのほかのレジェンド英雄", "Other Legendary heroes"], ["エピック英雄", "Epic heroes"], ["レア英雄", "Rare heroes"],
  ["同じ世代の英雄", "Heroes of the same generation"],
  ["ログインして自分の英雄を見る", "Log in to see your heroes"],
  ["★5までの欠片", "Shards to ★5"], ["スキル数", "Skills"], ["スキル分類", "Skill types"],
  ["収録スキル", "Skills listed"], ["収録英雄", "Heroes listed"], ["英雄カタログ", "Hero catalog"],
  ["KingShot 英雄", "KingShot hero"], ["専用装備スキル", "Exclusive Gear Skill"], ["討伐スキル", "Conquest Skills"], ["遠征スキル", "Expedition Skills"],
  ["討伐・遠征・専用装備", "Conquest, Expedition, Exclusive Gear"], ["討伐・遠征", "Conquest, Expedition"],
  ["レア度", "Rarity"], ["兵種：", "Troop: "], ["レジェンド", "Legendary"], ["エピック", "Epic"],
  ["初期", "Base"], ["最大", "Max"], ["登場", "Appears"], ["詳細", "Details"]
];
