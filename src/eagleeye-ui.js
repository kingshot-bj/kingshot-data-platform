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
  color:var(--ee-cyan,#20d7f2)!important;
  background:linear-gradient(180deg,color-mix(in srgb,var(--ee-cyan,#20d7f2) 12%,transparent),color-mix(in srgb,var(--ee-cyan,#20d7f2) 2.5%,transparent))!important;
}
.ee-nav a.active:before,.ee-global-nav a.active:before{
  content:""!important;
  position:absolute!important;
  top:0!important;
  left:25%!important;
  right:25%!important;
  height:3px!important;
  border-radius:4px!important;
  background:var(--ee-cyan,#20d7f2)!important;
  box-shadow:0 0 12px color-mix(in srgb,var(--ee-cyan,#20d7f2) 65%,transparent)!important;
}
.ee-nav-badge,.ee-global-nav-badge{
  min-width:17px!important;
  height:17px!important;
  font-size:9px!important;
}
.ee-global-nav-badge[hidden],.ee-nav-badge[hidden]{display:none!important}
.ee-global-nav button .ee-global-nav-badge,.ee-nav button .ee-nav-badge{position:absolute;top:1px;left:calc(50% + 6px);margin-left:0;display:grid;place-items:center;padding:0 4px;border-radius:99px;background:#ef4444;color:#fff;font-weight:800}
.ee-global-nav-links a,.ee-drawer-grid a{position:relative}
.ee-menu-badge{position:absolute;top:6px;right:8px;min-width:18px;height:18px;padding:0 5px;border-radius:99px;background:#ef4444;color:#fff;font-size:10px;font-weight:900;display:grid;place-items:center}
[data-badge][hidden]{display:none!important}
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
  Object.freeze({ key: "news", href: "/news", label: "お知らせ", image: EAGLEEYE_BJNYAN.success, badge: "news" }),
  Object.freeze({ key: "kingdomWatch", href: "/kingdom-watchlist", label: "王国ウォッチ", image: EAGLEEYE_BJNYAN.watchlist }),
  Object.freeze({ key: "kingdomCatalog", href: "/kingdom-catalog", label: "王国カタログ", image: EAGLEEYE_BJNYAN.kingdom }),
  Object.freeze({ key: "heroCatalog", href: "/hero-catalog", label: "英雄カタログ", image: EAGLEEYE_BJNYAN.player }),
  Object.freeze({ key: "myKingshot", href: "/my-player", label: "マイKingShot", image: EAGLEEYE_BJNYAN.dashboard }),
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
    : `<a href="${item.href}" data-other-key="${item.key}"><img src="${item.image}" alt=""><span>${esc(item.label)}</span>${item.badge ? '<b class="ee-menu-badge" data-badge="' + item.badge + '" hidden>0</b>' : ""}</a>`
  ).join("");
  const privileged = [];
  if (auth && (auth.role === "ADMIN" || auth.role === "OWNER")) {
    privileged.push(compact
      ? '<a href="/admin" data-other-key="admin">管理</a>'
      : '<a href="/admin" data-other-key="admin"><img src="' + EAGLEEYE_BJNYAN.system + '" alt=""><span>管理</span></a>');
  }
  if (auth && auth.role === "OWNER") {
    privileged.push(compact
      ? '<a href="/owner" data-other-key="owner">オーナー管理</a>'
      : '<a href="/owner" data-other-key="owner"><img src="' + EAGLEEYE_BJNYAN.dashboard + '" alt=""><span>オーナー管理</span></a>');
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
      (item.key === "watch" ? '<span class="' + badgeClass + '" id="' + badgeId + '" data-badge="watch" aria-label="ウォッチ中のプレイヤーの新しい変化" hidden>0</span>' : '') +
      '</a>').join("") +
    '<button id="' + (home ? "navMore" : "globalNavMore") + '" type="button" class="' + (home ? "" : "ee-global-nav-more") + '" aria-haspopup="dialog" aria-expanded="false"><span class="' + iconClass + '">☰</span><span>その他</span><span class="' + badgeClass + '" data-badge="news" aria-label="未読のお知らせ" hidden>0</span></button></nav>';
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
  // Badges work like notifications: only what is new since the user last
  // looked (watched players' changes / unread お知らせ), hidden when zero.
  function paintBadges(counts){
    document.querySelectorAll("[data-badge]").forEach(function(badge){
      var n=Number(counts&&counts[badge.getAttribute("data-badge")]||0);
      badge.textContent=n>99?"99+":String(n);
      badge.hidden=!(n>0);
    });
  }
  window.__eagleEyePaintBadges=paintBadges;
  // Pages that used to push the watchlist size into the badge keep working; the
  // size is no longer shown as a badge.
  window.__eagleEyeSetPlayerWatchlistCount=function(){};
  roleStatePromise.then(function(state){
    if(!state||!state.ok){paintBadges(null);return;}
    return fetch("/api/badges",{credentials:"same-origin",cache:"no-store"})
      .then(function(response){return response.ok?response.json():null;})
      .then(function(data){paintBadges(data&&data.ok?data:null);});
  }).catch(function(){paintBadges(null);});
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
      if(state.role==="OWNER")addLink("/owner","オーナー管理","owner");
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
body{background-color:var(--ee-bg);color:var(--ee-text)}
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
  "--ee-text": ["f8fafc", "e8f3ff", "f1f8ff", "edf6ff", "e2e8f0", "e7f7ff", "f0f8ff", "eff8ff", "e7edf5"],
  "--ee-subtext": ["94a3b8", "91a7bf", "9bb0c8", "91a9c0", "a9bed3", "cbd5e1", "9db4c8", "8da2b8", "8098b0"],
  "--ee-muted": ["64748b", "7f9ab3", "71869e", "718aa2", "7089a1", "7892aa"],
  // EagleEye cyan accent: follows the chosen colour theme.
  "--ee-cyan": ["22d3ee", "20d7f2", "20c8e8", "66e7f6"]
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

// Translucent legacy colours (rgba) inside <style> blocks. Only clear cases are
// mapped, by role: the EagleEye cyan accent anywhere, dark navy surfaces in
// background declarations, and navy-blue lines in border declarations. They
// become color-mix() over the theme token with the same opacity, so they follow
// the colour theme and the light/dark switch. Inline scripts are not touched.
function rgbaRole(r, g, b) {
  if (r <= 40 && g >= 195 && b >= 225) return "accent";
  const max = Math.max(r, g, b);
  if (max <= 70 && b >= r && b >= g - 4) return r <= 5 && g <= 12 ? "bg" : max <= 30 ? "deep" : max <= 50 ? "surface" : "raised";
  if (r <= 90 && g >= 60 && g <= 120 && b >= 95 && b <= 150 && b > g && g > r) return "line";
  return null;
}
const RGBA_TOKEN = { accent: "--ee-cyan", bg: "--ee-bg", deep: "--ee-panel-deep", surface: "--ee-panel", raised: "--ee-panel-raised", line: "--ee-border" };
const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const CSS_DECL = /(^|[{;\s])(--[a-z0-9-]+|[a-z-]+)\s*:\s*([^;{}]*)/gi;
const RGBA = /rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0?\.\d+|1(?:\.0+)?|0)\s*\)/g;
// Corner radii: pages used ~20 slightly different values. Single px values
// are snapped to the three shared radius tokens (pills / circles / tiny radii
// and multi-value shorthands are left alone).
const RADIUS_DECL = /(^|[{;\s])border-radius\s*:\s*(\d{1,2})px(\s*!important)?(?=\s*[;}])/g;
function radiusToken(px) {
  if (px >= 8 && px <= 11) return "var(--ee-radius-sm,9px)";
  if (px >= 12 && px <= 15) return "var(--ee-radius-md,13px)";
  if (px >= 16 && px <= 28) return "var(--ee-radius-lg,17px)";
  return null;
}
function normalizeRadiiInCss(css) {
  return css.replace(RADIUS_DECL, (match, lead, px, important) => {
    const token = radiusToken(Number(px));
    return token ? lead + "border-radius:" + token + (important || "") : match;
  });
}
function normalizeRgbaInCss(css) {
  return css.replace(CSS_DECL, (match, lead, property, value) => {
    if (!value.includes("rgba(")) return match;
    const prop = property.toLowerCase();
    const isBackground = prop.startsWith("background");
    const isLine = prop.startsWith("border") || prop.startsWith("outline");
    const replaced = value.replace(RGBA, (m, r, g, b, a) => {
      const role = rgbaRole(Number(r), Number(g), Number(b));
      if (!role) return m;
      const ok = role === "accent" ? true : role === "line" ? isLine : isBackground;
      if (!ok) return m;
      const pct = Math.round(Math.min(1, Math.max(0, Number(a))) * 1000) / 10;
      return "color-mix(in srgb,var(" + RGBA_TOKEN[role] + ") " + pct + "%,transparent)";
    });
    return replaced === value ? match : lead + property + ":" + replaced;
  });
}

// Generic colour roles by lightness (beyond the fixed legacy list): inside a
// CSS rule, near-white text becomes --ee-text, mid greys --ee-subtext, very
// dark blue/grey backgrounds the surface tokens and dark blue/grey borders the
// border tokens. Rules painted on a saturated accent background (buttons,
// badges) keep their own text colour. Already converted values are skipped.
function hexInfo(hex) {
  const h = hex.length === 3 ? hex.split("").map(c => c + c).join("") : hex;
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return { r, g, b, lum, sat: max ? (max - min) / max : 0 };
}
function roleToken(kind, hex) {
  // The curated legacy list wins when its token has the matching role.
  const legacy = hex.length === 6 ? LEGACY_TO_TOKEN.get(hex.toLowerCase()) : null;
  if (legacy) {
    const role = TOKEN_ROLE[legacy];
    if (role === "accent" || (kind === "bg" && role === "surface") || (kind === "line" && role === "line") || (kind === "text" && role === "text")) return legacy;
  }
  const c = hexInfo(hex);
  const coolOrGrey = c.b >= c.r - 6;
  if (kind === "text") {
    // Light cyan accent text (#75e6f5, #8be9f8, ...) follows the theme accent.
    if (c.g > c.r + 40 && c.b > c.r + 40 && c.sat > 0.3 && c.lum > 0.3) return "--ee-cyan";
    if (c.lum > 0.72 && c.sat < 0.22) return "--ee-text";
    if (c.lum > 0.2 && c.lum <= 0.72 && c.sat < 0.4 && coolOrGrey) return "--ee-subtext";
    return null;
  }
  if (kind === "bg") {
    if (!coolOrGrey || c.lum >= 0.1) return null;
    return c.lum < 0.006 ? "--ee-bg" : c.lum < 0.012 ? "--ee-panel-deep" : c.lum < 0.025 ? "--ee-panel" : "--ee-panel-raised";
  }
  if (kind === "line") {
    if (!coolOrGrey || c.lum < 0.012 || c.lum > 0.16 || c.sat > 0.75) return null;
    return c.lum < 0.04 ? "--ee-border-soft" : "--ee-border";
  }
  return null;
}
const CSS_RULE = /([^{}]+)\{([^{}]*)\}/g;
const DECL_IN_RULE = /(^|;)(\s*)(color|background|background-color|background-image|border|border-color|border-(?:top|bottom|left|right)(?:-color)?|outline|outline-color)(\s*:\s*)([^;]*)/gi;
const BARE_HEX = /(?<!var\(--[a-z0-9-]+,)#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
function accentBackground(body) {
  const m = body.match(/background(?:-color)?\s*:[^;]*?#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/i);
  if (!m) return false;
  const c = hexInfo(m[1]);
  return c.sat > 0.45 && c.lum > 0.08;
}
// Page-local colour variables (e.g. :root{--bg:#050b14;--text:#eff8ff}) are
// tied to the shared tokens by their name and lightness.
const ROOT_VAR = /(^|;)(\s*)(--(?!ee-)[a-z0-9-]+)(\s*:\s*)#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b(?=\s*(?:;|$))/gi;
function rootVarToken(name, hex) {
  const n = name.toLowerCase();
  const c = hexInfo(hex);
  if (/cyan|accent|primary|brand/.test(n)) return c.b > c.r && c.g > c.r && c.sat > 0.4 ? "--ee-cyan" : null;
  if (/line|border|stroke|divider/.test(n)) return roleToken("line", hex);
  if (/text|fg|ink|sub|muted|dim|label|soft-text/.test(n)) return roleToken("text", hex);
  if (/bg|panel|card|surface|base|deep|raised|back/.test(n)) return roleToken("bg", hex);
  return null;
}
function normalizeRootVars(body) {
  return body.replace(ROOT_VAR, (decl, sep, ws, name, colon, hex) => {
    const token = rootVarToken(name, hex);
    return token ? sep + ws + name + colon + "var(" + token + ",#" + hex + ")" : decl;
  });
}
function normalizeRuleColors(css) {
  return css.replace(CSS_RULE, (rule, selector, body) => {
    if (/^\s*:root\s*$/.test(selector) || /^\s*html\s*$/.test(selector)) {
      const vars = normalizeRootVars(body);
      if (vars !== body) body = vars; else if (/^\s*:root\s*$/.test(selector)) return rule;
      if (/^\s*:root\s*$/.test(selector)) return selector + "{" + body + "}";
    }
    if (/^\s*@|:root|data-eagle-theme|data-ee-skin/.test(selector)) return rule;
    const onAccent = accentBackground(body);
    const next = body.replace(DECL_IN_RULE, (decl, sep, ws, prop, colon, value) => {
      const p = prop.toLowerCase();
      const kind = p === "color" ? "text" : p.startsWith("background") ? "bg" : "line";
      if (kind === "text" && onAccent) return decl;
      const v = value.replace(BARE_HEX, (m, hex) => {
        const token = roleToken(kind, hex);
        return token ? "var(" + token + ",#" + hex + ")" : m;
      });
      return v === value ? decl : sep + ws + prop + colon + v;
    });
    return next === body ? rule : selector + "{" + next + "}";
  });
}

export function normalizeLegacyPalette(html) {
  if (typeof html !== "string") return html;
  // Pages intentionally designed in the light Apple style keep their own colours.
  if (html.includes("background:#f5f5f7")) return html;
  html = html.replace(STYLE_BLOCK, (block, css) => {
    let next = normalizeRuleColors(normalizeRadiiInCss(css));
    if (next.includes("rgba(")) next = normalizeRgbaInCss(next);
    return next === css ? block : block.replace(css, () => next);
  });
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
export const EAGLEEYE_LIGHT_TOKENS_CSS = `html[data-eagle-theme="light"]{--ee-bg:#f3f6fb;--ee-panel:#ffffff;--ee-panel-deep:#f8fafc;--ee-panel-raised:#eef2f7;--ee-border:#cbd5e1;--ee-border-soft:#dbe3ee;--ee-text:#172033;--ee-subtext:#55657a;--ee-muted:#7b8899;--ee-cyan:#0891b2;--ee-cyan-strong:#0e7490;--ee-on-accent:#ffffff;--ee-success:#15803d;--ee-warning:#b45309;--ee-danger:#dc2626;--ee-rival:#dc2626}`;
