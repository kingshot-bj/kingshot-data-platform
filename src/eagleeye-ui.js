/**
 * EagleEye UI foundation.
 * UI-only tokens and semantic mascot mapping. Backend/API/DB contracts stay unchanged.
 */
export const EAGLEEYE_BJNYAN = Object.freeze({
  dashboard:"/assets/eagleeye/bjnyan/15_search_complete.png",
  ranking:"/assets/eagleeye/bjnyan/12_kingdom_found.png",
  player:"/assets/eagleeye/bjnyan/01_player_search.png",
  kingdom:"/assets/eagleeye/bjnyan/11_kingdom_search.png",
  watchlist:"/assets/eagleeye/bjnyan/10_player_recheck.png",
  system:"/assets/eagleeye/bjnyan/03_player_searching_data.png",
  success:"/assets/eagleeye/bjnyan/04_player_found.png",
  warning:"/assets/eagleeye/bjnyan/09_player_data_incomplete.png",
  error:"/assets/eagleeye/bjnyan/08_player_not_found.png"
});

export const EAGLEEYE_UI_TOKENS = Object.freeze({
  navy:"#07111f",
  panel:"#0d1b2d",
  panelRaised:"#13263d",
  border:"#25415f",
  text:"#e8f3ff",
  subtext:"#8fa4ba",
  cyan:"#22d3ee",
  blue:"#60a5fa",
  gold:"#f7c948",
  success:"#22c55e",
  warning:"#f59e0b",
  error:"#ef4444"
});

/**
 * Shared navigation design tokens.
 * Page-specific markup and navigation actions remain owned by each page.
 * Keep icon and label sizing centralized so future page shells can consume the same values.
 */
export const EAGLEEYE_NAV_TOKENS = Object.freeze({
  desktopIconSize: 23,
  mobileIconSize: 24,
  desktopLabelSize: 10,
  mobileLabelSize: 10,
  badgeSize: 17,
  mobileBreakpoint: 600
});

/**
 * Shared navigation CSS. This is intentionally limited to presentation;
 * route destinations, active-state logic, and badge data remain page-owned.
 */
export const EAGLEEYE_NAV_CSS = `
.ee-nav{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px}
.ee-nav a,.ee-nav button{position:relative;display:grid;place-items:center;align-content:center;gap:4px;border:0;background:transparent;border-radius:12px;font-size:var(--ee-nav-label-size,10px);font-weight:900;letter-spacing:.03em}
.ee-nav-icon{display:block;font-size:var(--ee-nav-icon-size,23px);line-height:1.05;transform:scale(1.08);transform-origin:center}
.ee-nav-badge{position:absolute;top:5px;margin-left:24px;min-width:17px;height:17px;padding:0 4px;border-radius:99px;font-size:9px;display:grid;place-items:center}
@media(max-width:600px){.ee-nav{--ee-nav-icon-size:24px;--ee-nav-label-size:10px}}
`;
