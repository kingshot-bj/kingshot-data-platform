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
import { APP_EN, APP_RULES, APP_EARLY, APP2_EN, APP2_EARLY } from "./i18n-en-app.js";
import { MISC_EN } from "./i18n-en-misc.js";
import { TERMS_EN } from "./i18n-en-terms.js";
import { HERO_SKILL_EARLY } from "./hero-skills-en.js";
import { HEROES_EN, HEROES_EARLY } from "./i18n-en-heroes.js";

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
registerEnglish(APP_EN, APP_RULES, APP_EARLY);
registerEnglish(APP2_EN, [], APP2_EARLY);
registerEnglish(MISC_EN);
registerEnglish(TERMS_EN);
registerEnglish(HEROES_EN, [], [...HERO_SKILL_EARLY, ...HEROES_EARLY]);

function orderedEntries() {
  if (!ordered) {
    const seen = new Map();
    // 訳文の ' はスクリプトの文字列の区切りとぶつかるので ’ に（コードの置き換えで ' を使うものは除く）
    // 訳文の " も同じ理由で “ ” に（コードの置き換えで " を使うものは除く）
    const safe = (ja, en) => { let t = String(en); if (!ja.includes("'")) t = t.replace(/'/g, "’"); if (!ja.includes('"')) t = t.replace(/"([^"]*)"/g, "“$1”").replace(/"/g, "”"); return t; };
    for (const [ja, en] of DICTS) if (ja && !seen.has(ja)) seen.set(ja, safe(ja, en));
    ordered = [...seen.entries()].sort((a, b) => b[0].length - a[0].length);
  }
  return ordered;
}

// /en に書き換えないリンク（英語版を作らない・作れないもの）。
const NO_EN = /^\/(?:api\/|assets\/|logout|admin|owner|preview|news\/media\/|social\/|account|status-json|kingdom-watchlist-lab|en(?:\/|$)|robots\.txt|sitemap\.xml|ads\.txt|favicon)/;
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
    .replace(/\u3000/g, " ")
    .replace(/([A-Za-z0-9:.)]) ?〜 ?(?=[A-Za-z0-9])/g, "$1 – ")
    .replace(new RegExp("([" + A + "]) ?・ ?(?=[A-Za-z0-9<(])", "g"), "$1, ")
    .replace(/・(?=[A-Za-z])/g, " · ")
    .replace(new RegExp("([" + A + "])：", "g"), "$1: ")
    .replace(new RegExp("([" + A + "])）。", "g"), "$1).")
    .replace(new RegExp("([" + A + "])）", "g"), "$1)")
    .replace(new RegExp("([" + A + "]) ?（(?=[A-Za-z0-9#])", "g"), "$1 (")
    .replace(new RegExp("([" + A + "])、(?=[A-Za-z0-9])", "g"), "$1, ")
    .replace(new RegExp("([" + A + "])。", "g"), "$1.");
}

const BEFORE = "^|[>\"'\\s(（【「:：・,、/|+=\\-—–#\\]\\)\\dA-Za-z]";
const AFTER = "$|[<\"'\\s)）】」:：・,、/|.。!?！？\\-—–(（\\dA-Za-z]";
const shortRes = new Map();
function shortWordRe(ja) {
  if (!shortRes.has(ja)) shortRes.set(ja, new RegExp("(" + BEFORE + ")" + ja.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?=" + AFTER + ")", "g"));
  return shortRes.get(ja);
}

export function translateHtmlToEnglish(html) {
  let out = String(html).replace(/<html lang=["']ja["']/i, '<html lang="en"');
  out = translateProgressUi(out);
  // 順番：長い文（6文字以上）→ 数字の入る文型 → 短い語。短い語（「王国」など）を先に訳すと文型が当たらなくなるため。
  const entries = orderedEntries();
  for (const [re, to] of EARLY) out = out.replace(re, to);
  const isLong = ja => ja.length >= LONG || /\d/.test(ja);
  for (const [ja, en] of entries) if (isLong(ja) && out.includes(ja)) out = out.split(ja).join(en);
  for (const [re, to] of RULES) out = out.replace(re, to);
  // 短い語（2文字以下）は、前後が区切り（タグ・引用符・空白・記号・数字）のときだけ置き換える。
  // 日本語のまま残る部分（プレイヤー名・同盟名・管理用の表示）の途中を書き換えないため（例：「日本国同盟」「実行」）。
  for (const [ja, en] of entries) {
    if (isLong(ja) || !out.includes(ja)) continue;
    if (ja.length > 2) { out = out.split(ja).join(en); continue; }
    out = out.replace(shortWordRe(ja), (m, before) => before + en);
  }
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
  // 画面内のスクリプトが日本語のデータを読み取るための正規表現（コード）は文ではないので除く
  const isCode = t => /\.test\(|\\d|\/\^|\$\/|\.match\(/.test(t);
  return [...new Set([...x.matchAll(/[^<>"'`\n]*[぀-ヿ一-鿿　-〿＀-￯][^<>"'`\n]*/g)].map(m => m[0].trim()).filter(t => t && !isCode(t)))];
}
