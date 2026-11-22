// Google AdSense site code. The publisher id comes from ADSENSE_PUBLISHER_ID
// (production only), so previews never load ads. The script is added only to
// public pages (those with a canonical link: home, kingdoms, heroes, tools,
// legal pages), never to signed-in tool / admin pages. Ad units are not placed
// automatically; auto ads stay off in the AdSense console.

let publisherId = "";

export function normalizeAdsensePublisherId(value) {
  const id = String(value || "").trim().replace(/^ca-/, "");
  return /^pub-\d{10,20}$/.test(id) ? id : "";
}

export function configureAdsense(env) {
  publisherId = normalizeAdsensePublisherId(env?.ADSENSE_PUBLISHER_ID);
}

export function adsenseScriptTag(id = publisherId) {
  return id ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-${id}" crossorigin="anonymous"></script>` : "";
}

export function injectAdsense(html, id = publisherId) {
  if (!id || typeof html !== "string") return html;
  if (!html.includes('rel="canonical"') || html.includes("adsbygoogle.js")) return html;
  return html.includes("</head>") ? html.replace("</head>", adsenseScriptTag(id) + "</head>") : html;
}
