// Public per-hero pages: /heroes/{slug}. One page per hero with its skills,
// rarity, troop type, when it unlocks in a kingdom, shard cost and related
// heroes. Same content for every visitor (cacheable), linked from the hero
// catalog and the sitemap.

import { HERO_SKILLS_JA } from "./hero-skills-ja.js";
import { HERO_TROOPS_JA, skillCard, skillGroupLabel, heroSourceLinksHtml } from "./hero-catalog-page.js";
import { HERO_SLUGS } from "./hero-slugs.js";
export { HERO_SLUGS };
import { canonicalHeroName, heroRarity, isDedicatedShardHero, MAX_STEPS, shardsBetween } from "./hero-shards.js";
import { KINGDOM_TIMELINE } from "./kingdom-timeline.js";

const BY_SLUG = Object.fromEntries(Object.entries(HERO_SLUGS).map(([name, slug]) => [slug, name]));
const RARITY_JA = { M: "レジェンド", E: "エピック", R: "レア" };
const ICON_FILE = /^[a-f0-9]{64}\.(?:png|jpg|webp|gif|avif)$/;

export function heroSlug(name) { return HERO_SLUGS[name] || ""; }
export function heroNameBySlug(slug) { return BY_SLUG[String(slug || "").toLowerCase()] || ""; }
export function heroPagePaths() { return Object.keys(HERO_SKILLS_JA).filter(heroSlug).map(name => "/heroes/" + heroSlug(name)); }

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Which kingdom-timeline milestone introduces this hero (SSR generations only).
export function heroGeneration(name) {
  const display = canonicalHeroName(name);
  const m = KINGDOM_TIMELINE.find(item => item.category === "hero" && /世代/.test(item.title) && item.detail.split(/[・（）、 ]/).includes(display));
  if (!m) return null;
  const gen = (m.title.match(/第(\d+)世代/) || [])[1];
  return { generation: gen ? Number(gen) : null, title: m.title, from: m.from, to: m.to, peers: m.detail.split(/[・（）、 ]/).filter(n => n && n !== display && !/英雄|ほか|SR|R$/.test(n)) };
}

function iconFor(name, iconByName) {
  const candidates = [iconByName?.[name], iconByName?.[canonicalHeroName(name)]];
  return candidates.find(v => typeof v === "string" && ICON_FILE.test(v)) || "";
}

function heroLink(name) {
  const slug = heroSlug(name) || heroSlug(Object.keys(HERO_SLUGS).find(k => canonicalHeroName(k) === name) || "");
  return slug ? `<a class="chip" href="/heroes/${slug}">${esc(canonicalHeroName(name))}</a>` : "";
}

export function heroSummary(name) {
  const display = canonicalHeroName(name);
  const rarity = RARITY_JA[heroRarity(name)];
  const troop = HERO_TROOPS_JA[name] || HERO_TROOPS_JA[display] || "";
  const gen = heroGeneration(name);
  const parts = [`${display}は${gen?.generation ? `第${gen.generation}世代の` : ""}${rarity}英雄${troop ? `（${troop}）` : ""}です。`];
  if (gen) parts.push(gen.from === 0 ? "王国の開設直後から登場します。" : `王国の開設から${gen.from === gen.to ? gen.from : `${gen.from}〜${gen.to}`}日目ごろに登場します。`);
  parts.push(isDedicatedShardHero(name) ? "星上げには専用の欠片だけが使えます。" : `星上げには${rarity}共通の欠片も使えます。`);
  return parts.join("");
}

export function renderHeroPage(name, { origin = "", iconByName = {}, signedIn = false, loginHref = "/api/auth/discord" } = {}) {
  const data = HERO_SKILLS_JA[name];
  if (!data) return null;
  const slug = heroSlug(name);
  const display = canonicalHeroName(name);
  const rarityKey = heroRarity(name);
  const rarity = RARITY_JA[rarityKey];
  const troop = HERO_TROOPS_JA[name] || "";
  const gen = heroGeneration(name);
  const icon = iconFor(name, iconByName);
  const groups = data.groups || [];
  const skillTotal = groups.reduce((n, g) => n + (g.skills || []).length, 0);
  const canonical = origin + "/heroes/" + slug;
  const sameTroop = troop ? Object.keys(HERO_TROOPS_JA).filter(n => n !== name && HERO_TROOPS_JA[n] === troop && heroRarity(n) === rarityKey) : [];
  const peers = gen ? gen.peers : [];
  const facts = [
    ["レア度", rarity],
    troop ? ["兵種", troop] : null,
    gen ? ["登場", gen.title + (gen.from === 0 ? "（開設直後）" : `（開設${gen.from === gen.to ? gen.from : gen.from + "〜" + gen.to}日目ごろ）`)] : null,
    ["★5までの欠片", shardsBetween(0, MAX_STEPS).toLocaleString("ja-JP") + "個" + (isDedicatedShardHero(name) ? "（専用欠片のみ）" : "")],
    ["スキル数", skillTotal + "個"]
  ].filter(Boolean);
  const jsonLd = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "EagleEye", item: origin + "/" },
    { "@type": "ListItem", position: 2, name: "英雄カタログ", item: origin + "/hero-catalog" },
    { "@type": "ListItem", position: 3, name: display, item: canonical }
  ] };
  const avatar = icon
    ? `<img class="hero-face" src="/hero-icons/assets/${esc(icon)}" alt="${esc(display)}" width="88" height="88">`
    : `<span class="hero-face hero-face-text">${esc([...display].slice(0, 2).join(""))}</span>`;
  const cta = signedIn
    ? `<a class="hp-btn" href="/tools/hero-shards?hero=${encodeURIComponent(display)}">欠片計算で${esc(display)}を計算する</a>`
    : `<a class="hp-btn" href="/tools/hero-shards?hero=${encodeURIComponent(display)}">欠片計算で${esc(display)}を計算する</a><a class="hp-btn ghost" href="${esc(loginHref)}">ログインして自分の英雄を見る</a>`;
  const body = `<nav class="crumbs"><a href="/">EagleEye</a> › <a href="/hero-catalog">英雄カタログ</a> › ${esc(display)}</nav>
<header class="hero-head r-${rarityKey}">${avatar}<div><p class="eyebrow">KingShot 英雄</p><h1>${esc(display)}</h1><p class="tags"><span class="tag r">${esc(rarity)}</span>${troop ? `<span class="tag">${esc(troop)}</span>` : ""}${gen?.generation ? `<span class="tag">第${gen.generation}世代</span>` : ""}</p></div></header>
<p class="lead">${esc(heroSummary(name))}</p>
<dl class="hp-facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
<div class="actions">${cta}</div>
${groups.map(g => `<section class="skill-group"><h2>${esc(g.type)}<small>${(g.skills || []).length}個</small></h2><div class="skill-grid">${(g.skills || []).map(s => skillCard({ ...s, heroSource: data.source })).join("")}</div></section>`).join("")}
<p class="note">スキル情報は公開資料（${heroSourceLinksHtml(data)}、確認日 ${esc(data.checkedAt || "未記録")}）をもとにしています。ゲーム内の表記と異なる場合があります。</p>
${peers.length ? `<section class="related"><h2>同じ世代の英雄</h2><div class="chips">${peers.map(heroLink).join("")}</div></section>` : ""}
${sameTroop.length ? `<section class="related"><h2>同じ兵種の${esc(rarity)}英雄</h2><div class="chips">${sameTroop.map(heroLink).join("")}</div></section>` : ""}
<p class="back"><a href="/hero-catalog">← 英雄カタログで全英雄を見る</a> · <a href="/kingdom-timeline">英雄が登場する時期（王国タイムライン）</a></p>`;
  const title = `${display}のスキルと性能｜キングショット英雄 | EagleEye`;
  // 実際に載っているスキルの種類だけを書く（専用装備のデータがない英雄もいる）。
  const description = `${heroSummary(name)}${skillGroupLabel(data)}のスキル${skillTotal}個の効果と初期値・最大値を日本語でまとめています。`.slice(0, 160);
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="article"><meta property="og:site_name" content="EagleEye"><meta property="og:title" content="${esc(display)}のスキルと性能 | EagleEye"><meta property="og:url" content="${esc(canonical)}">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
<style>body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:820px;margin:0 auto;padding:18px 16px calc(96px + env(safe-area-inset-bottom))}.crumbs{font-size:12px;color:var(--ee-subtext)}.crumbs a,.note a,.back a{color:var(--ee-cyan);text-decoration:none}
.hero-head{display:flex;gap:14px;align-items:center;margin:12px 0 10px}.hero-face{flex:none;width:88px;height:88px;border-radius:18px;object-fit:cover;border:3px solid var(--rc);background:var(--ee-panel-raised)}.hero-face-text{display:grid;place-items:center;font-size:26px;font-weight:900;color:var(--rc)}.r-M{--rc:rgb(240,160,50)}.r-E{--rc:rgb(150,115,240)}.r-R{--rc:rgb(70,150,235)}
.eyebrow{margin:0;font-size:11px;letter-spacing:.08em;color:var(--ee-subtext)}h1{margin:2px 0 6px;font-size:28px}.tags{display:flex;flex-wrap:wrap;gap:6px;margin:0}.tag{padding:2px 9px;border-radius:999px;font-size:12px;font-weight:800;border:1px solid var(--ee-border);color:var(--ee-subtext)}.tag.r{border-color:var(--rc);color:var(--rc)}
.lead{font-size:14px;line-height:1.7;margin:0 0 12px}.hp-facts{background:none;padding:0;border:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:0 0 12px}.hp-facts div{padding:10px 12px;border:1px solid var(--ee-border-soft);border-radius:12px;background:var(--ee-panel)}.hp-facts dt{font-size:11px;color:var(--ee-subtext)}.hp-facts dd{margin:2px 0 0;font-size:14px;font-weight:800}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}.hp-btn{display:inline-block;padding:10px 14px;border-radius:12px;background:var(--ee-cyan);color:var(--ee-on-accent,#062033);font-weight:900;text-decoration:none;font-size:14px}.hp-btn.ghost{background:transparent;border:1px solid var(--ee-border);color:var(--ee-text)}
.skill-group h2,.related h2{display:flex;align-items:baseline;gap:8px;margin:22px 0 8px;font-size:17px}.skill-group h2 small{font-size:12px;color:var(--ee-subtext);font-weight:600}.skill-grid{display:grid;gap:10px}.skill-card{padding:12px 14px;border:1px solid var(--ee-border-soft);border-radius:14px;background:var(--ee-panel)}.skill-card-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.skill-card-top.long{flex-direction:column}.skill-kind{font-size:10px;letter-spacing:.1em;color:var(--ee-subtext)}.skill-card h4{margin:2px 0 0;font-size:15px}.skill-values{display:flex;align-items:center;gap:6px;font-size:13px}.skill-values small{display:block;font-size:10px;color:var(--ee-subtext)}.skill-values b{color:var(--ee-cyan)}.skill-values i{font-style:normal;color:var(--ee-subtext)}.skill-card p{margin:8px 0 6px;font-size:13px;line-height:1.7}.skill-source a{font-size:11px;color:var(--ee-subtext)}
.note{font-size:11px;color:var(--ee-subtext);line-height:1.6;margin-top:14px}.chips{display:flex;flex-wrap:wrap;gap:8px}.chip{padding:6px 12px;border-radius:999px;border:1px solid var(--ee-border);background:var(--ee-panel);color:var(--ee-text);text-decoration:none;font-size:13px;font-weight:700}.back{margin-top:20px;font-size:13px}</style></head><body><main class="wrap">${body}</main></body></html>`;
}

export function renderHeroNotFoundPage() {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>英雄が見つかりません | EagleEye</title><meta name="robots" content="noindex"></head><body><main class="wrap" style="max-width:820px;margin:0 auto;padding:24px 16px"><h1 style="font-size:22px">英雄が見つかりません</h1><p>URLが間違っているか、まだ掲載していない英雄です。</p><p><a href="/hero-catalog" style="color:var(--ee-cyan)">英雄カタログで探す →</a></p></main></body></html>`;
}
