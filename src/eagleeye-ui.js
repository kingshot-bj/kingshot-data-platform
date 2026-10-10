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
.ee-global-nav-badge[hidden],.ee-nav-badge[hidden]{display:none!important}
@media(max-width:600px){
  .ee-nav-icon,.ee-global-nav .ee-global-nav-icon{font-size:24px!important}
}
`;


/**
 * Canonical destinations for the global "その他" menu.
 * Both the home shell and page shell consume this same list.
 * Privileged actions are supplied by the caller only after its existing auth check.
 */
export const EAGLEEYE_OTHER_MENU = Object.freeze([
  Object.freeze({ key: "kingdomWatch", href: "/kingdom-watchlist", label: "王国ウォッチ", image: EAGLEEYE_BJNYAN.watchlist }),
  Object.freeze({ key: "kingdomCatalog", href: "/kingdom-catalog", label: "王国カタログ", image: EAGLEEYE_BJNYAN.kingdom }),
  Object.freeze({ key: "myKingshot", href: "/my-player", label: "マイKingshot", image: EAGLEEYE_BJNYAN.dashboard }),
  Object.freeze({ key: "support", href: "/support", label: "サポート", image: EAGLEEYE_BJNYAN.error }),
  Object.freeze({ key: "status", href: "/status", label: "システム状況", image: EAGLEEYE_BJNYAN.system }),
  Object.freeze({ key: "diagnostics", href: "/admin/diagnostics", label: "診断", image: EAGLEEYE_BJNYAN.system, minRole: "ADMIN" })
]);

export function renderEagleEyeOtherMenu({ auth = null, includeAccount = true, compact = false } = {}) {
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
  const roleRank = { BASIC: 0, ADVANCED: 1, VIP: 2, ADMIN: 3, OWNER: 4 };
  const currentRank = auth ? (roleRank[auth.role] ?? 0) : 0;
  const links = EAGLEEYE_OTHER_MENU.filter(item => !item.minRole || currentRank >= (roleRank[item.minRole] ?? 99)).map(item => compact
    ? `<a href="${item.href}" data-other-key="${item.key}">${esc(item.label)}</a>`
    : `<a href="${item.href}" data-other-key="${item.key}"><img src="${item.image}" alt=""><span>${esc(item.label)}</span></a>`
  ).join("");
  const privileged = [];
  if (auth && (auth.role === "ADMIN" || auth.role === "OWNER")) {
    privileged.push(compact
      ? '<a href="/admin" data-other-key="admin">管理</a>'
      : '<a href="/admin" data-other-key="admin"><img src="' + EAGLEEYE_BJNYAN.system + '" alt=""><span>管理</span></a>');
  }
  if (auth && auth.role === "OWNER") {
    privileged.push(compact
      ? '<a href="/owner" data-other-key="owner">Owner Control</a>'
      : '<a href="/owner" data-other-key="owner"><img src="' + EAGLEEYE_BJNYAN.dashboard + '" alt=""><span>Owner Control</span></a>');
  }
  if (includeAccount && auth) {
    privileged.push(compact
      ? '<a href="/account" data-other-key="account">アカウント</a><a href="/api/auth/logout" data-other-key="logout">ログアウト</a>'
      : '<a href="/account" data-other-key="account"><span>アカウント</span></a><a href="/api/auth/logout" data-other-key="logout"><span>ログアウト</span></a>');
  }
  return links + privileged.join("") + (compact
    ? '<button class="ee-drawer-milestone" type="button" disabled aria-disabled="true"><span>マイルストーン</span><small>近日公開予定</small></button>'
    : '<button class="ee-drawer-milestone" type="button" disabled aria-disabled="true"><span>✦</span><span>マイルストーン<small>近日公開予定</small></span></button>');
}


/** Canonical five-item navigation markup shared by home and all page shells. */
export function renderEagleEyeNavigation({ active = "", badgeId = "globalNavBadge", home = false } = {}) {
  const cls = home ? "ee-global-nav ee-nav" : "ee-global-nav";
  const iconClass = home ? "ee-nav-icon" : "ee-global-nav-icon";
  const badgeClass = home ? "ee-nav-badge" : "ee-global-nav-badge";
  const items = [
    { key: "home", href: "/", label: "ホーム", icon: "⌂" },
    { key: "ranking", href: "/kingdom/rankings", label: "ランキング", icon: "♛" },
    { key: "search", href: "/players", label: "検索", icon: "⌕" },
    { key: "watch", href: "/watchlist", label: "ウォッチ", icon: "◌" }
  ];
  return '<nav class="' + cls + '" aria-label="メインナビゲーション">' +
    items.map(item => '<a href="' + item.href + '" data-nav-path="' + item.href + '"' +
      (active === item.key ? ' class="active" aria-current="page"' : '') +
      ' aria-label="' + item.label + '"><span class="' + iconClass + '">' + item.icon + '</span><span>' + item.label + '</span>' +
      (item.key === "watch" ? '<span class="' + badgeClass + '" id="' + badgeId + '" aria-label="監視中のプレイヤー数">0</span>' : '') +
      '</a>').join("") +
    '<button id="' + (home ? "navMore" : "globalNavMore") + '" type="button" class="' + (home ? "" : "ee-global-nav-more") + '" aria-haspopup="dialog" aria-expanded="false"><span class="' + iconClass + '">☰</span><span>その他</span></button></nav>';
}


/**
 * Shared browser-side drawer behavior. Works with either the home drawer IDs
 * or the global page-shell classes; count loading and dashboard stats remain page-owned.
 */
export const EAGLEEYE_DRAWER_INIT = `
(function(){
  var drawer=document.getElementById("moreDrawer")||document.querySelector(".ee-global-nav-drawer");
  var triggers=Array.prototype.slice.call(document.querySelectorAll("#navMore,#globalNavMore,.ee-global-nav-more,#moreButton"));
  var closeButton=document.getElementById("closeMore")||(drawer&&drawer.querySelector("[data-close]"));
  if(!drawer||!triggers.length)return;
  // Navigation and drawer controls are UI toggles, not form actions; keep them
  // outside the global double-submit guard so they remain immediately usable.
  triggers.forEach(function(trigger){trigger.dataset.eagleNoGuard="1";});
  if(closeButton)closeButton.dataset.eagleNoGuard="1";
  // Keep active-tab behavior in the shared shell rather than duplicating route checks per page.
  var path=location.pathname||"/";
  document.querySelectorAll(".ee-global-nav [data-nav-path]").forEach(function(link){
    var target=link.getAttribute("data-nav-path");
    var active=(target==="/"&&(path==="/"||path==="/home"))||
      (target==="/kingdom/rankings"&&(path.indexOf("/kingdom/rankings")===0||path.indexOf("/rankings")===0))||
      (target==="/players"&&(path==="/players"||path==="/player"||path==="/player-compare"||path.indexOf("/player/")===0||path.indexOf("/players/")===0))||
      (target==="/watchlist"&&(path==="/watchlist"||path.indexOf("/player-watchlist")===0||path.indexOf("/kingdom-watchlist")===0));
    if(active){link.classList.add("active");link.setAttribute("aria-current","page");}
  });
  // Home already loads these counts together with its dashboard stats; avoid a duplicate API read there.
  if(!document.getElementById("playerCount")){
    fetch("/api/player-watchlist",{credentials:"same-origin",cache:"no-store"})
      .then(function(response){if(!response.ok)throw new Error("watchlist_count_unavailable");return response.json();})
      .then(function(data){
        var count=(data.watchlist||[]).filter(function(item){return item.enabled!==false;}).length;
        ["globalNavBadge","navBadge","playerBadge"].forEach(function(id){
          var badge=document.getElementById(id);if(!badge)return;
          badge.textContent=count>99?"99+":String(count);badge.hidden=false;
        });
      }).catch(function(){
        ["globalNavBadge","navBadge","playerBadge"].forEach(function(id){var badge=document.getElementById(id);if(badge)badge.hidden=true;});
      });
  }
  var links=drawer.querySelector(".ee-global-nav-links");
  // The home drawer already renders account links server-side, so only generic
  // page drawers need the extra auth-state request.
  if(links)fetch("/api/auth/ui-state",{credentials:"same-origin",cache:"no-store"})
    .then(function(response){if(!response.ok)throw new Error("auth_state_unavailable");return response.json();})
    .then(function(state){
      if(!state.authenticated)return;
      function addLink(href,label,key){
        if(links.querySelector('[data-other-key="'+key+'"]'))return;
        var a=document.createElement("a");a.href=href;a.textContent=label;a.setAttribute("data-other-key",key);links.appendChild(a);
      }
      addLink("/account","アカウント","account");
      if(state.role==="ADMIN"||state.role==="OWNER"){
        addLink("/admin/diagnostics","診断","diagnostics");
        addLink("/admin","管理","admin");
      }
      if(state.role==="OWNER")addLink("/owner","Owner Control","owner");
      addLink("/api/auth/logout","ログアウト","logout");
    }).catch(function(){});
  var activeTrigger=null;
  function open(trigger){
    activeTrigger=trigger||activeTrigger||triggers[0];
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden","false");
    triggers.forEach(function(item){item.setAttribute("aria-expanded","true");});
    if(closeButton&&typeof closeButton.focus==="function")closeButton.focus();
  }
  function close(){
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden","true");
    triggers.forEach(function(item){item.setAttribute("aria-expanded","false");});
    if(activeTrigger&&typeof activeTrigger.focus==="function")activeTrigger.focus();
    activeTrigger=null;
  }
  triggers.forEach(function(trigger){trigger.addEventListener("click",function(){if(drawer.classList.contains("open"))close();else open(trigger);});});
  if(closeButton)closeButton.addEventListener("click",close);
  drawer.addEventListener("click",function(event){if(event.target===drawer)close();});
  document.addEventListener("keydown",function(event){if(event.key==="Escape")close();});
})();
`;
