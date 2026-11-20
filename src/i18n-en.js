// 英語版の訳す仕組み（/en/...・2026-11-20）。
// ・/en/〇〇 は、日本語の〇〇ページを作ってから、ここで英語に置き換える（ページの作りを二重にしない）。
// ・辞書（[日本語, 英語]）は長いものから順に置き換える。数字が入る文は RULES（正規表現）で置き換える。
// ・ゲームの用語は MightPulse の API の英語に合わせる（Power・Town Center・Kills・Governor ID・Mystic Trial・
//   Swordland Showdown・Swordland Summit League・Governor Duel・Kingdom of Power・TG など）。
// ・ページの中のリンクは /en/... に書き換える（ログイン・API・画像・管理画面などは除く）。
// ・訳し漏れは tests/english-pages.test.mjs が「英語のページに日本語が残っていないか」で見つける。
import { HOME_EN } from "./home-en.js";
import { EN_PUBLIC } from "./i18n.js";
import { COMMON_EN, COMMON_RULES } from "./i18n-en-common.js";
import { DATA_EN, DATA_RULES, DATA_EARLY } from "./i18n-en-data.js";

const DICTS = [];
const RULES = [];
const EARLY = []; // 数字の入る長い文：辞書より先に当てる
let ordered = null;
const LONG = 6;
// 辞書を足す（ページごとのファイルから呼ぶ）。
export function registerEnglish(entries = [], rules = [], early = []) {
  DICTS.push(...entries);
  RULES.push(...rules);
  EARLY.push(...early);
  ordered = null;
}
registerEnglish(HOME_EN);
registerEnglish(COMMON_EN, COMMON_RULES);
registerEnglish(DATA_EN, DATA_RULES, DATA_EARLY);

function orderedEntries() {
  if (!ordered) {
    const seen = new Map();
    // 訳文の ' はスクリプトの文字列の区切りとぶつかるので ’ に（コードの置き換えで ' を使うものは除く）
    for (const [ja, en] of DICTS) if (ja && !seen.has(ja)) seen.set(ja, ja.includes("'") ? en : String(en).replace(/'/g, "’"));
    ordered = [...seen.entries()].sort((a, b) => b[0].length - a[0].length);
  }
  return ordered;
}

// /en に書き換えないリンク（英語版を作らない・作れないもの）。
const NO_EN = /^\/(?:api\/|assets\/|login|logout|admin|owner|preview|news\/media\/|social\/|account|status-json|kingdom-watchlist-lab|en(?:\/|$)|robots\.txt|sitemap\.xml|ads\.txt|favicon)/;
export function enHref(path) {
  const p = String(path || "");
  if (!p.startsWith("/") || p.startsWith("//") || NO_EN.test(p) || /\.[a-z0-9]{2,5}(?:[?#]|$)/i.test(p.split("?")[0])) return p;
  return p === "/" ? "/en" : p.startsWith("/?") ? "/en" + p.slice(1) : "/en" + p;
}
export function rewriteLinks(html) {
  return String(html)
    .replace(/(\s(?:href|action)=)(["'])(\/[^"']*)\2/g, (m, a, q, p) => a + q + enHref(p) + q);
}

// 読み込み中の表示（全ページ共通・index.js が差し込む）：英語では文をまとめて「Loading…」に。
function translateProgressUi(html) {
  return html
    .replace('<span class="ee-gp-label">通信中…</span>', '<span class="ee-gp-label">Loading…</span>')
    .replace('<span class="ee-gp-time">0秒</span>', '<span class="ee-gp-time">0s</span>')
    .replace(/(<script id="eagleeye-global-progress-init">)([\s\S]*?)(<\/script>)/, (m, a, body, c) => a + body
      .replace(/function describe\(input,init\)\{[\s\S]*?\}function paint\(\)\{/, 'function describe(input,init){return "Loading…"}function paint(){')
      .replace(/\+"秒/g, '+"s')
      .replace(/" \("\+count\+"件\)"/g, '" ("+count+")"')
      .replace(/"ページの読み込みに時間がかかっています。[^"]*"/g, '"This page is taking a while to load. Please check your connection."')
      .replace(/"[^"\n]*[぀-ヿ一-鿿][^"\n]*"/g, '"Loading…"')
      .replace(/'[^'\n]*[぀-ヿ一-鿿][^'\n]*'/g, "'Loading…'") + c);
}

// 英語の間に残った全角の記号を半角に（日本語の間のものはそのまま）。
const A = "A-Za-z0-9%+)\\]>";
function englishPunctuation(s) {
  return s
    .replace(new RegExp("([" + A + "]) ?・ ?(?=[A-Za-z0-9<(])", "g"), "$1, ")
    .replace(/・(?=[A-Za-z])/g, " · ")
    .replace(new RegExp("([" + A + "])：", "g"), "$1: ")
    .replace(new RegExp("([" + A + "])）。", "g"), "$1).")
    .replace(new RegExp("([" + A + "])）", "g"), "$1)")
    .replace(new RegExp("([" + A + "]) ?（(?=[A-Za-z0-9#])", "g"), "$1 (")
    .replace(new RegExp("([" + A + "])、(?=[A-Za-z0-9])", "g"), "$1, ")
    .replace(new RegExp("([" + A + "])。", "g"), "$1.");
}

export function translateHtmlToEnglish(html) {
  let out = String(html).replace(/<html lang="ja"/i, '<html lang="en"');
  out = translateProgressUi(out);
  // 順番：長い文（6文字以上）→ 数字の入る文型 → 短い語。短い語（「王国」など）を先に訳すと文型が当たらなくなるため。
  const entries = orderedEntries();
  for (const [re, to] of EARLY) out = out.replace(re, to);
  const isLong = ja => ja.length >= LONG || /\d/.test(ja);
  for (const [ja, en] of entries) if (isLong(ja) && out.includes(ja)) out = out.split(ja).join(en);
  for (const [re, to] of RULES) out = out.replace(re, to);
  for (const [ja, en] of entries) if (!isLong(ja) && out.includes(ja)) out = out.split(ja).join(en);
  out = englishPunctuation(out);
  out = out.replace(/fetch\("\/api\/home\/summary"/g, 'fetch("/api/home/summary?lang=en"');
  out = out.replace('<meta property="og:locale" content="ja_JP">', '<meta property="og:locale" content="en_US">');
  // 公開前は検索に載せない
  if (!EN_PUBLIC && !/<meta name="robots"[^>]*noindex/.test(out)) out = out.replace(/<head>/i, '<head><meta name="robots" content="noindex">');
  return rewriteLinks(out);
}

// 画面に出る日本語（HTML と画面内のスクリプトの文字列）を拾う。コメントは除く。テストと作業用。
export function japaneseLeft(html) {
  const x = String(html)
    .replace(/(^|\n)\s*\/\/[^\n]*/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s\/\/\s[^\n]*[぀-ヿ一-鿿][^\n]*/g, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  return [...new Set([...x.matchAll(/[^<>"'`\n]*[぀-ヿ一-鿿　-〿＀-￯][^<>"'`\n]*/g)].map(m => m[0].trim()).filter(Boolean))];
}
