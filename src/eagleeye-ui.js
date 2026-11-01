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
  navy:"#0a1424",
  panel:"#0f2035",
  panelRaised:"#172a40",
  border:"#2a4664",
  text:"#e8f3ff",
  subtext:"#91a7bf",
  cyan:"#22d3ee",
  blue:"#60a5fa",
  gold:"#f0c75e",
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
  Object.freeze({ key: "theme", href: "/settings/theme", label: "着せ替え", image: EAGLEEYE_BJNYAN.success }),
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
  const privacy = compact
    ? '<a href="/terms" data-other-key="terms">利用規約</a><a href="/privacy" data-other-key="privacy">プライバシーポリシー</a>'
    : '<a href="/terms" data-other-key="terms"><span>利用規約</span></a><a href="/privacy" data-other-key="privacy"><span>プライバシーポリシー</span></a>';
  return links + privileged.join("") + privacy + (compact
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
  // Share the role/eligibility request with the role bar and use it to avoid
  // fetching a user-specific watchlist for visitors who are not authenticated.
  var roleStatePromise=window.__eagleEyeRoleStatePromise;
  if(!roleStatePromise){
    roleStatePromise=fetch("/api/me/advanced",{credentials:"same-origin",cache:"no-store"})
      .then(function(response){return response.ok?response.json():null;})
      .catch(function(){return null;});
    window.__eagleEyeRoleStatePromise=roleStatePromise;
  }
  // Reuse page-owned watchlist data when a page already fetches this endpoint.
  // Do not add a second D1-backed request on the player-watchlist or player detail pages.
  function setPlayerWatchlistBadgeCount(count){
    if(count===null||count===undefined||!Number.isFinite(Number(count))){
      window.__eagleEyePlayerWatchlistCount=null;
      ["globalNavBadge","navBadge","playerBadge"].forEach(function(id){var badge=document.getElementById(id);if(badge)badge.hidden=true;});
      return;
    }
    count=Math.max(0,Number(count));
    window.__eagleEyePlayerWatchlistCount=count;
    ["globalNavBadge","navBadge","playerBadge"].forEach(function(id){
      var badge=document.getElementById(id);if(!badge)return;
      badge.textContent=count>99?"99+":String(count);badge.hidden=false;
    });
  }
  window.__eagleEyeSetPlayerWatchlistCount=setPlayerWatchlistBadgeCount;
  if(typeof window.__eagleEyePlayerWatchlistCount==="number")setPlayerWatchlistBadgeCount(window.__eagleEyePlayerWatchlistCount);
  else if(window.__eagleEyePlayerWatchlistCount===null)setPlayerWatchlistBadgeCount(null);
  var pageLoadsPlayerWatchlist=path==="/player-watchlist"||(path==="/player"&&Boolean(document.getElementById("player-watchlist-toggle")));
  if(!document.getElementById("playerCount")&&!pageLoadsPlayerWatchlist&&typeof window.__eagleEyePlayerWatchlistCount!=="number"){
    roleStatePromise.then(function(state){
      if(!state||!state.ok){setPlayerWatchlistBadgeCount(null);return;}
      return fetch("/api/player-watchlist",{credentials:"same-origin",cache:"no-store"})
        .then(function(response){if(!response.ok)throw new Error("watchlist_count_unavailable");return response.json();})
        .then(function(data){
          if(!data||data.ok===false)throw new Error("watchlist_count_unavailable");
          setPlayerWatchlistBadgeCount((data.watchlist||[]).filter(function(item){return item.enabled!==false;}).length);
        });
    }).catch(function(){setPlayerWatchlistBadgeCount(null);});
  }
  var links=drawer.querySelector(".ee-global-nav-links");
  // The home drawer already renders account links server-side, so only generic
  // page drawers need the extra auth-state request.
  if(links){
    // Use the same server-verified role state for menu links and the role bar.
    roleStatePromise.then(function(state){
      if(!state||!state.ok)return;
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
  }
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

/**
 * Shared player-avatar role frame.
 * Role colors are applied only when an explicit alliance role/tier is known.
 */
export function normalizeAllianceRole(value, label = "") {
  const text = String(label ?? "").trim();
  const named = text.match(/(?:^|\D)R([1-5])(?:$|\D)/i);
  if (named) return Number(named[1]);
  const lower = text.toLowerCase();
  if (/(leader|president|chief|盟主|会長)/i.test(lower)) return 5;
  if (/(officer|vice|副盟主|副会長)/i.test(lower)) return 4;
  const raw = String(value ?? "").trim().match(/^R([1-5])$/i);
  return raw ? Number(raw[1]) : null;
}

export const EAGLEEYE_ROLE_AVATAR_CSS = `
.ee-role-avatar{box-sizing:border-box;border:2px solid var(--ee-role-frame,#b7c8d8);box-shadow:0 0 0 2px rgba(4,13,25,.88),inset 0 1px 2px rgba(255,255,255,.32),0 2px 5px rgba(0,0,0,.38)}
.ee-role-avatar[data-role="5"],.member[data-role="5"] .ee-role-avatar{--ee-role-frame:#f0c75e;border-color:#f0c75e!important;box-shadow:0 0 0 2px rgba(4,13,25,.88),inset 0 1px 2px rgba(255,244,198,.55),0 0 9px rgba(240,199,94,.68),0 2px 5px rgba(0,0,0,.42)!important}
.ee-role-avatar[data-role="4"],.member[data-role="4"] .ee-role-avatar{--ee-role-frame:#bca0ff;border-color:#bca0ff!important;box-shadow:0 0 0 2px rgba(4,13,25,.88),inset 0 1px 2px rgba(239,226,255,.48),0 0 9px rgba(188,160,255,.58),0 2px 5px rgba(0,0,0,.42)!important}
.ee-role-avatar[data-role="3"],.member[data-role="3"] .ee-role-avatar{--ee-role-frame:#70dfff;border-color:#70dfff!important;box-shadow:0 0 0 2px rgba(4,13,25,.88),inset 0 1px 2px rgba(220,248,255,.48),0 0 9px rgba(112,223,255,.56),0 2px 5px rgba(0,0,0,.42)!important}
.ee-role-avatar[data-role="2"],.member[data-role="2"] .ee-role-avatar{--ee-role-frame:#79e5a5;border-color:#79e5a5!important;box-shadow:0 0 0 2px rgba(4,13,25,.88),inset 0 1px 2px rgba(222,255,234,.44),0 0 9px rgba(121,229,165,.5),0 2px 5px rgba(0,0,0,.42)!important}
.ee-role-avatar[data-role="1"],.member[data-role="1"] .ee-role-avatar{--ee-role-frame:#a9bacb;border-color:#a9bacb!important;box-shadow:0 0 0 2px rgba(4,13,25,.88),inset 0 1px 2px rgba(255,255,255,.38),0 0 8px rgba(169,186,203,.38),0 2px 5px rgba(0,0,0,.42)!important}
`;

/** Shared page background, color tokens and semantic control styles. */
export const EAGLEEYE_THEME_BASE_CSS = `
/* Canonical EagleEye visual foundation. Keep behavior and page-specific layouts outside this layer. */
:root{
  --ee-bg:#0a1424;
  --ee-panel:#0f2035;
  --ee-panel-raised:#172a40;
  --ee-panel-deep:#0b192b;
  --ee-border:#2a4664;
  --ee-border-soft:#1d344d;
  --ee-text:#e8f3ff;
  --ee-subtext:#91a7bf;
  --ee-muted:#71869e;
  --ee-cyan:#22d3ee;
  --ee-cyan-strong:#20d7f2;
  --ee-blue:#60a5fa;
  --ee-gold:#f0c75e;
  --ee-success:#22c55e;
  --ee-warning:#f59e0b;
  --ee-danger:#ef4444;
  --ee-radius-sm:9px;
  --ee-radius-md:13px;
  --ee-radius-lg:17px;
}
html:not([data-eagle-theme="light"]) body{background-color:var(--ee-bg);color:var(--ee-text)}
/* Shared surface hierarchy: avoid pure-black canvases and inconsistent page cards. */
:where(.ee-page,.wrap,.page-shell){color:var(--ee-text)}
:where(.ee-card,.card,.item,.panel,.profile-section,.compare-toolbar,.hero-card,.mini-card,.stat,.change-box,.compare-metrics div){
  border-color:var(--ee-border-soft);
  background-color:var(--ee-panel);
  color:var(--ee-text);
}
:where(.ee-muted,.muted,.sub,.hint,.label,.meta-label){color:var(--ee-subtext)}
:where(.ee-link,.back,.text-link){color:var(--ee-cyan)}
:where(.ee-button,.action,.btn,.pager-btn){
  border:1px solid var(--ee-border)!important;
  border-radius:var(--ee-radius-sm)!important;
  background:var(--ee-panel-raised)!important;
  color:var(--ee-text)!important;
  font-weight:800;
  -webkit-tap-highlight-color:transparent;
  touch-action:manipulation;
  transition:background-color .12s ease,border-color .12s ease,filter .12s ease,transform .12s ease;
}
:where(.ee-button-primary,.action.primary,.btn-primary){
  border-color:var(--ee-cyan)!important;
  background:var(--ee-cyan)!important;
  color:#062033!important;
}
:where(.ee-button-danger,.action.danger,.btn-danger){
  border-color:#713944!important;
  background:#321b2a!important;
  color:#ffb4bc!important;
}
:where(input:not([type="checkbox"]):not([type="radio"]),select,textarea){
  accent-color:var(--ee-cyan);
}
:where(input:not([type="checkbox"]):not([type="radio"]),select,textarea):focus-visible{
  outline:2px solid var(--ee-cyan)!important;
  outline-offset:1px;
  border-color:var(--ee-cyan)!important;
}
`;

// ---------- Legacy palette normalisation ----------
// Pages were written over time with ~30 slightly different navy/grey hex values.
// Before a page is sent, colours from that legacy set that appear in CSS
// declarations are mapped onto the shared theme tokens, so every page uses one
// palette and follows the light/dark switch. Accent colours are left alone.
const LEGACY_PALETTE = {
  "--ee-bg": ["0f172a", "050b14", "0a1424", "0b1120"],
  "--ee-panel": ["162238", "111c31", "111c30", "0f2035", "0d1b2d", "0c1c2d", "0b1b2c", "132238", "111827", "0d1d2f"],
  "--ee-panel-deep": ["0b1220", "0b192b", "071525", "091625", "0b1626"],
  "--ee-panel-raised": ["172a40", "12283d", "10243a", "1e293b", "12334b"],
  "--ee-border": ["334155", "2a4664", "25415f", "294763", "2c4d69", "2a4965", "475569"],
  "--ee-border-soft": ["1d344d", "203b55", "23415f", "1e3a5f"],
  "--ee-text": ["f8fafc", "e8f3ff", "f1f8ff", "edf6ff", "e2e8f0", "e7f7ff", "f0f8ff"],
  "--ee-subtext": ["94a3b8", "91a7bf", "9bb0c8", "91a9c0", "a9bed3", "cbd5e1"],
  "--ee-muted": ["64748b", "7f9ab3", "71869e"],
  // EagleEye cyan accent: follows the chosen colour theme.
  "--ee-cyan": ["22d3ee", "20d7f2", "20c8e8"]
};
const TOKEN_ROLE = {
  "--ee-bg": "surface", "--ee-panel": "surface", "--ee-panel-deep": "surface", "--ee-panel-raised": "surface",
  "--ee-border": "line", "--ee-border-soft": "line",
  "--ee-text": "text", "--ee-subtext": "text", "--ee-muted": "text",
  "--ee-cyan": "accent"
};
const LEGACY_TO_TOKEN = new Map(Object.entries(LEGACY_PALETTE).flatMap(([token, hexes]) => hexes.map(h => [h, token])));
// A legacy colour inside a CSS colour declaration. Colours right after "," or "("
// (gradient stops, or the fallback inside an already converted var()) are skipped,
// so a page is never converted twice.
const CSS_COLOR_DECL = /((?:background|background-color|color|border|border-color|border-(?:top|bottom|left|right)(?:-color)?|outline|outline-color)\s*:\s*[^;"'{}<>(,]*?)#([0-9a-fA-F]{6})\b/g;

export function normalizeLegacyPalette(html) {
  if (typeof html !== "string") return html;
  // Pages intentionally designed in the light Apple style keep their own colours.
  if (html.includes("background:#f5f5f7")) return html;
  return html.replace(CSS_COLOR_DECL, (match, prefix, hex) => {
    const token = LEGACY_TO_TOKEN.get(hex.toLowerCase());
    if (!token) return match;
    // Only map a colour onto a token of the same role, e.g. dark text on an amber
    // button ("color:#0f172a") must stay dark in the light theme too.
    const property = prefix.trim().split(":")[0].trim().toLowerCase();
    const role = TOKEN_ROLE[token];
    const allowed = role === "accent" ? true : property.startsWith("background") ? role === "surface" : property.startsWith("border") || property.startsWith("outline") ? role === "line" : role === "text";
    return allowed ? prefix + "var(" + token + ",#" + hex + ")" : match;
  });
}

// Light theme values for the shared tokens (dark values are the defaults in :root).
export const EAGLEEYE_LIGHT_TOKENS_CSS = `html[data-eagle-theme="light"]{--ee-bg:#f3f6fb;--ee-panel:#ffffff;--ee-panel-deep:#f8fafc;--ee-panel-raised:#eef2f7;--ee-border:#cbd5e1;--ee-border-soft:#dbe3ee;--ee-text:#172033;--ee-subtext:#55657a;--ee-muted:#7b8899}`;
