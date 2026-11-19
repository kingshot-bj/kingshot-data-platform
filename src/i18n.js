// 英語版（/en/...）の土台（2026-11-19）。
// ・日本語版の URL はそのまま。英語版は同じパスの前に /en を付ける（例：/guides/kvk → /en/guides/kvk、/ → /en）。
// ・英語版があるページだけを EN_PAGES に登録する。登録したページには、日本語版・英語版の両方に hreflang（ja・en・x-default）を出す。
// ・言語の切り替えリンクは、共通のフッター（index.js）が hreflang を見て出す。
// ・英語版は少しずつ増やす（公開ページとログイン後の画面を交互に）。
export const EN_PREFIX = "/en";
// 公開するまでは false：英語版はオーナー・アドミンだけが見られる（オーナーの指示・2026-11-19）。
// false の間は、hreflang・サイトマップ・日本語版のフッターの English を出さず、英語ページは noindex。
export const EN_PUBLIC = false;
export const EN_PREVIEW_ROLES = Object.freeze(["OWNER", "ADMIN"]);
export function canSeeEnglish(role) { return EN_PUBLIC || EN_PREVIEW_ROLES.includes(String(role || "").toUpperCase()); }

// 英語版があるページ（日本語版のパス）。完全一致か、末尾が "*" なら前方一致。
export const EN_PAGES = Object.freeze(["/", "/guides", "/guides/*"]);

export function hasEnglish(jaPath) {
  const p = String(jaPath || "/").replace(/\/+$/, "") || "/";
  return EN_PAGES.some(e => e.endsWith("*") ? p.startsWith(e.slice(0, -1)) && p.length > e.length - 1 : p === e);
}

// /en/... → { lang: "en", path: "/..." }。それ以外は日本語。
export function splitLang(pathname) {
  const p = String(pathname || "/");
  if (p === EN_PREFIX || p === EN_PREFIX + "/") return { lang: "en", path: "/" };
  if (p.startsWith(EN_PREFIX + "/")) return { lang: "en", path: p.slice(EN_PREFIX.length) };
  return { lang: "ja", path: p };
}

export function enPath(jaPath) {
  const p = String(jaPath || "/");
  return p === "/" ? EN_PREFIX : EN_PREFIX + p;
}

// ページの言語に合わせたパス（英語版がないページは日本語版のまま）。
export function langPath(lang, jaPath) {
  return lang === "en" && hasEnglish(jaPath) ? enPath(jaPath) : jaPath;
}

// <head> に入れる hreflang。日本語版のパスを受け取る。英語版がないページは空。
export function hreflangLinks(origin, jaPath) {
  if (!EN_PUBLIC || !origin || !hasEnglish(jaPath)) return "";
  const ja = origin + jaPath, en = origin + enPath(jaPath);
  return `<link rel="alternate" hreflang="ja" href="${ja}"><link rel="alternate" hreflang="en" href="${en}"><link rel="alternate" hreflang="x-default" href="${ja}">`;
}

export const t = (lang, ja, en) => lang === "en" ? en : ja;
