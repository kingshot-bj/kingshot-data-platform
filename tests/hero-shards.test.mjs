import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shardsBetween, heroShardPlan, describeProgress, SHARD_STEPS, renderHeroShardPage, shardHeroList, canonicalHeroName, isDedicatedShardHero } from "../src/hero-shards.js";
import { renderEagleEyeOtherMenu } from "../src/eagleeye-ui.js";

test("per-step costs (confirmed in game) add up to 1,065", () => {
  assert.equal(SHARD_STEPS.length, 30);
  assert.equal(shardsBetween(0, 30), 1065);
  assert.equal(shardsBetween(0, 6), 10);
  assert.equal(shardsBetween(6, 12), 40);
  assert.equal(shardsBetween(12, 18), 115);
  assert.equal(shardsBetween(18, 24), 300);
  assert.equal(shardsBetween(24, 30), 600);
  assert.equal(SHARD_STEPS[17], 40, "★3 step 6");
});

test("plans from MightPulse star progress (0–30)", () => {
  assert.deepEqual(describeProgress(14), { star: 2, step: 2, label: "★2 段階2" });
  const p = heroShardPlan(14);
  assert.equal(p.nextStep, 15);
  assert.equal(p.nextStar, 15 + 15 + 15 + 40);
  assert.equal(p.max, shardsBetween(14, 30));
  assert.equal(heroShardPlan(30).max, 0);
  assert.equal(describeProgress(30).label, "★5（最大）");
});

function pageConfig(html) {
  const m = html.match(/\}\)\((\{"steps".*?\})\);<\/script>/s);
  assert.ok(m, "client config embedded");
  return JSON.parse(m[1]);
}

test("free picker: every hero, aliases unified, icons only from saved hashes", () => {
  const icon = "a".repeat(64) + ".png";
  const list = shardHeroList({ "マーリン": icon, "エヴァ": "../evil.png" });
  const names = list.map(h => h.n);
  assert.ok(names.length >= 37);
  assert.equal(new Set(names).size, names.length, "no duplicates");
  assert.ok(names.includes("マーリン") && !names.includes("マリン"));
  assert.ok(names.includes("エヴァ") && !names.includes("アイヴァ"));
  assert.equal(list.find(h => h.n === "マーリン").i, icon);
  assert.equal(list.find(h => h.n === "エヴァ").i, "", "unsafe file names are dropped");
  assert.equal(canonicalHeroName("マリン"), "マーリン");
  assert.ok(isDedicatedShardHero("アマデウス") && isDedicatedShardHero("Helga") && !isDedicatedShardHero("ゾーイ"));
});

test("page: same for every anonymous viewer, login CTA, shard illustration", () => {
  const anon = renderHeroShardPage({ origin: "https://x", iconByName: { "ゾーイ": "b".repeat(64) + ".png" } });
  assert.match(anon, /<title>英雄の欠片 計算ツール/);
  assert.match(anon, /Discordでログイン/);
  assert.match(anon, /1,065/);
  assert.match(anon, /class="shard-ico"/);
  assert.match(anon, /英雄を追加/);
  const cfg = pageConfig(anon);
  assert.deepEqual(cfg.mine, []);
  assert.equal(cfg.steps.length, 30);
  assert.equal(cfg.heroes.find(h => h.n === "ゾーイ").i, "b".repeat(64) + ".png");
  assert.doesNotMatch(anon, /#[0-9a-f]{6}"/i, "SVG colours use rgb() so the theme normalizer leaves them alone");
});

test("page: signed-in arena heroes are offered for import with canonical names", () => {
  const mine = renderHeroShardPage({ signedIn: true, heroesNote: "1/1 時点", heroes: [{ name: "Marlin", displayName: "マーリン", steps: 14 }, { name: "Amadeus", displayName: "アマデウス", steps: 99 }] });
  assert.match(mine, /アリーナ編成から読み込む（2人）/);
  assert.doesNotMatch(mine, /Discordでログイン/);
  const cfg = pageConfig(mine);
  assert.deepEqual(cfg.mine, [{ n: "マーリン", s: 14, t: 5 }, { n: "アマデウス", s: 30, t: 5 }]);
});

test("client script runs: add heroes, compute, save to localStorage", async () => {
  const html = renderHeroShardPage({ signedIn: true, heroes: [{ name: "Zoe", displayName: "ゾーイ", steps: 24 }] });
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const els = {};
  const mk = id => ({ id, innerHTML: "", textContent: "", listeners: {}, addEventListener(t, f) { this.listeners[t] = f; } });
  ["hlist", "total", "pgrid", "import", "clear"].forEach(id => { els[id] = mk(id); });
  const store = {};
  const ctx = { document: { getElementById: id => els[id] || null }, localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } }, confirm: () => true };
  new Function("document", "localStorage", "confirm", script)(ctx.document, ctx.localStorage, ctx.confirm);
  assert.match(els.hlist.innerHTML, /ゾーイ/, "prefilled from the arena team");
  assert.match(els.total.innerHTML, /合計 <b>600<\/b>/);
  // Add Amadeus (dedicated) from the picker.
  els.pgrid.listeners.click({ target: { closest: () => ({ dataset: { n: "アマデウス" } }) } });
  const saved = JSON.parse(store["eagleeye-shard-plan-v1"]);
  assert.deepEqual(saved.list.map(e => e.n), ["ゾーイ", "アマデウス"]);
  assert.match(els.total.innerHTML, /合計 <b>600<\/b>/, "dedicated heroes are not in the general total");
  assert.match(els.total.innerHTML, /専用欠片の英雄（1人）/);
});

test("routes and entry points", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /url\.pathname === "\/tools\/hero-shards"\) return await renderHeroShardRoute/);
  assert.match(src, /visibilityEnabled\(settings, "heroes_list", auth\.role\)/);
  assert.match(src, /renderHeroShardPage\(\{ origin, loginHref: loginUrlFor\("\/tools\/hero-shards"\), iconByName: await loadIcons\(\) \}\)/);
  assert.match(renderEagleEyeOtherMenu({}), /href="\/tools\/hero-shards"/);
  assert.match(readFileSync(new URL("../src/hero-catalog-page.js", import.meta.url), "utf8"), /href="\/tools\/hero-shards"/);
});
