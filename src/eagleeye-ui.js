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
/**
 * Shared navigation sizing contract.
 * Keep icon and label sizes stable across pages and viewport heights.
 * Navigation layout/route logic remains owned by each page.
 */
export const EAGLEEYE_NAV_TOKENS = Object.freeze({
  desktopIconSize: 23,
  mobileIconSize: 24,
  labelSize: 10,
  badgeSize: 17,
  mobileBreakpoint: 600
});

/**
 * Applied after page CSS on every HTML response, including the home page.
 * Fixed type sizes prevent short viewport media queries from shrinking nav text/icons.
 */
export const EAGLEEYE_NAV_CSS = `
.ee-nav a,.ee-nav button,.ee-global-nav a,.ee-global-nav button{
  font-size:10px!important;
}
.ee-nav-icon,.ee-global-nav .ee-global-nav-icon{
  font-size:23px!important;
  line-height:1.05!important;
}
.ee-nav-badge{font-size:9px!important;min-width:17px!important;height:17px!important}
@media(max-width:600px){
  .ee-nav-icon,.ee-global-nav .ee-global-nav-icon{font-size:24px!important}
}
`;
