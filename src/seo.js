// Search / share metadata applied to every HTML response.
// - Public pages (with a canonical link) get Open Graph / Twitter card tags
//   when the page did not set them, so links shared on X / Discord show a card.
// - Pages without a canonical link (signed-in tools, login prompts, admin) get
//   noindex, so thin login screens never compete with the public pages.

export const OG_IMAGE_PATH = "/assets/og/common.jpg";
// Share card (1200×630) per section; BJにゃん art by the operator.
const OG_BY_PATH = [
  [/^\/tools\/hero-shards/, "/assets/og/shards.jpg"],
  [/^\/tools\/gold-tech/, "/assets/og/goldtech.jpg"],
  [/^\/tools\/gold/, "/assets/og/gold.jpg"],
  [/^\/(hero-catalog|heroes\/)/, "/assets/og/heroes.jpg"],
  [/^\/(kingdoms|k\/|kvk\/)/, "/assets/og/kingdoms.jpg"]
];
export function ogImagePath(pathname) {
  const hit = OG_BY_PATH.find(([re]) => re.test(String(pathname || "")));
  return hit ? hit[1] : OG_IMAGE_PATH;
}

function attr(html, re) { const m = html.match(re); return m ? m[1] : ""; }

// サイトのアイコン（検索結果・ブラウザのタブ・iPhoneのホーム画面）と theme-color。全ページ共通。
export const HEAD_ICON_TAGS = '<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" type="image/png" sizes="192x192" href="/assets/eagleeye/icons/icon-192.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png">';
export function addHeadIcons(html) {
  if (typeof html !== "string" || !html.includes("</head>")) return html;
  let add = "";
  if (!/<link rel="(shortcut )?icon"/.test(html)) add += HEAD_ICON_TAGS;
  if (!/<meta name="theme-color"/.test(html)) add += '<meta name="theme-color" content="#0b1424">';
  return add ? html.replace("</head>", add + "</head>") : html;
}

export function shareDescription(description) {
  const text = String(description || "").trim();
  const first = text.split("。")[0];
  const short = first && first.length < text.length ? first + "。" : text;
  return short.length > 70 ? short.slice(0, 69) + "…" : short;
}

export function enhanceSeo(html) {
  html = addHeadIcons(html);
  if (typeof html !== "string" || !html.includes("</head>")) return html;
  const canonical = attr(html, /<link rel="canonical" href="([^"]+)"/);
  if (!canonical) {
    if (/<meta name="robots"/.test(html)) return html;
    return html.replace("</head>", '<meta name="robots" content="noindex"></head>');
  }
  let origin = "", pathname = "/";
  try { const u = new URL(canonical); origin = u.origin; pathname = u.pathname; } catch { return html; }
  const title = attr(html, /<title>([^<]*)<\/title>/);
  const description = attr(html, /<meta name="description" content="([^"]*)"/);
  const add = [];
  if (!html.includes('property="og:title"')) add.push(`<meta property="og:title" content="${title}">`);
  // Discord・X などの共有カードは説明文を全部出すので、共有用は最初の1文だけにする（検索用の description は長いまま）。
  if (!html.includes('property="og:description"') && description) add.push(`<meta property="og:description" content="${shareDescription(description)}">`);
  if (!html.includes('property="og:url"')) add.push(`<meta property="og:url" content="${canonical}">`);
  if (!html.includes('property="og:type"')) add.push('<meta property="og:type" content="website">');
  if (!html.includes('property="og:site_name"')) add.push('<meta property="og:site_name" content="EagleEye">');
  if (!html.includes('property="og:image"')) add.push(`<meta property="og:image" content="${origin}${ogImagePath(pathname)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">`);
  if (!html.includes('property="og:locale"')) add.push('<meta property="og:locale" content="ja_JP">');
  if (!html.includes('name="twitter:card"')) add.push('<meta name="twitter:card" content="summary_large_image">');
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
