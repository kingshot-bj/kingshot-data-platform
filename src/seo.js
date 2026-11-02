// Search / share metadata applied to every HTML response.
// - Public pages (with a canonical link) get Open Graph / Twitter card tags
//   when the page did not set them, so links shared on X / Discord show a card.
// - Pages without a canonical link (signed-in tools, login prompts, admin) get
//   noindex, so thin login screens never compete with the public pages.

export const OG_IMAGE_PATH = "/assets/eagleeye/bjnyan/hero_bjnyan.png";

function attr(html, re) { const m = html.match(re); return m ? m[1] : ""; }

export function enhanceSeo(html) {
  if (typeof html !== "string" || !html.includes("</head>")) return html;
  const canonical = attr(html, /<link rel="canonical" href="([^"]+)"/);
  if (!canonical) {
    if (/<meta name="robots"/.test(html)) return html;
    return html.replace("</head>", '<meta name="robots" content="noindex"></head>');
  }
  let origin = "";
  try { origin = new URL(canonical).origin; } catch { return html; }
  const title = attr(html, /<title>([^<]*)<\/title>/);
  const description = attr(html, /<meta name="description" content="([^"]*)"/);
  const add = [];
  if (!html.includes('property="og:title"')) add.push(`<meta property="og:title" content="${title}">`);
  if (!html.includes('property="og:description"') && description) add.push(`<meta property="og:description" content="${description}">`);
  if (!html.includes('property="og:url"')) add.push(`<meta property="og:url" content="${canonical}">`);
  if (!html.includes('property="og:type"')) add.push('<meta property="og:type" content="website">');
  if (!html.includes('property="og:site_name"')) add.push('<meta property="og:site_name" content="EagleEye">');
  if (!html.includes('property="og:image"')) add.push(`<meta property="og:image" content="${origin}${OG_IMAGE_PATH}">`);
  if (!html.includes('property="og:locale"')) add.push('<meta property="og:locale" content="ja_JP">');
  if (!html.includes('name="twitter:card"')) add.push('<meta name="twitter:card" content="summary">');
  return add.length ? html.replace("</head>", add.join("") + "</head>") : html;
}

// JSON-LD helpers (escaped for inline <script>).
export function jsonLdScript(data) {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}
export function webAppJsonLd({ origin, path, name, description }) {
  return jsonLdScript({
    "@context": "https://schema.org", "@type": "WebApplication", name, description, url: origin + path,
    applicationCategory: "GameApplication", operatingSystem: "Web", inLanguage: "ja",
    offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
    isPartOf: { "@type": "WebSite", name: "EagleEye", url: origin + "/" }
  });
}
export function breadcrumbJsonLd(origin, items) {
  return jsonLdScript({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: origin + path })) });
}
export function websiteJsonLd(origin) {
  return jsonLdScript({ "@context": "https://schema.org", "@type": "WebSite", name: "EagleEye", alternateName: ["イーグルアイ", "EagleEye キングショット"], url: origin + "/", inLanguage: "ja", description: "キングショット（KingShot）の王国・同盟・プレイヤーのデータと、英雄の欠片・黄金・T11研究の計算ツールをまとめた非公式ファンサービス" });
}
