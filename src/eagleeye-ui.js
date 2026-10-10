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
  iconSize: 23,
  mobileIconSize: 24,
  labelSize: 10,
  badgeSize: 17,
  mobileBreakpoint: 600
});

/**
 * One geometry/typography contract for both the home navigation (.ee-nav)
 * and injected page navigation (.ee-global-nav). Page content and actions stay untouched.
 */
export const EAGLEEYE_NAV_CSS = `
.ee-nav,.ee-global-nav{
  box-sizing:border-box!important;
  height:72px!important;
  min-height:72px!important;
  padding:7px 8px calc(7px + env(safe-area-inset-bottom))!important;
  gap:4px!important;
  grid-template-columns:repeat(5,minmax(0,1fr))!important;
  align-items:stretch!important;
}
.ee-nav a,.ee-nav button,.ee-global-nav a,.ee-global-nav button{
  box-sizing:border-box!important;
  display:flex!important;
  flex-direction:column!important;
  align-items:center!important;
  justify-content:center!important;
  gap:4px!important;
  min-width:0!important;
  min-height:52px!important;
  padding:5px 2px!important;
  border-radius:13px!important;
  font-family:system-ui,-apple-system,sans-serif!important;
  font-size:10px!important;
  font-weight:800!important;
  line-height:1.2!important;
}
.ee-nav-icon,.ee-global-nav .ee-global-nav-icon{
  display:block!important;
  font-size:23px!important;
  line-height:1.05!important;
  transform:scale(1.08)!important;
  transform-origin:center!important;
}
.ee-nav a.active,.ee-global-nav a.active{
  color:#20d7f2!important;
  background:linear-gradient(180deg,rgba(32,215,242,.12),rgba(32,215,242,.025))!important;
}
.ee-nav a.active:before,.ee-global-nav a.active:before{
  content:""!important;
  position:absolute!important;
  top:0!important;
  left:25%!important;
  right:25%!important;
  height:3px!important;
  border-radius:4px!important;
  background:#20d7f2!important;
  box-shadow:0 0 12px rgba(32,215,242,.65)!important;
}
.ee-nav-badge,.ee-global-nav-badge{
  min-width:17px!important;
  height:17px!important;
  font-size:9px!important;
}
@media(max-width:600px){
  .ee-nav-icon,.ee-global-nav .ee-global-nav-icon{font-size:24px!important}
}
`;
