// 読み物（/guides）の URL。サイトマップ（public-pages.js）から読み込むので、guides.js とは分けておく（読み込み合いを避ける）。
export const GUIDE_SLUGS = Object.freeze(["swordland-showdown", "swordland-summit-league", "kvk"]);
export const GUIDE_PATHS = Object.freeze(["/guides", ...GUIDE_SLUGS.map(s => "/guides/" + s)]);
export const GUIDE_PATHS_EN = Object.freeze(GUIDE_PATHS.map(p => "/en" + p));
