import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shardsBetween, heroShardPlan, describeProgress, SHARD_STEPS, renderHeroShardPage } from "../src/hero-shards.js";
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

test("page: calculator for everyone, own heroes when signed in, dedicated-shard note", () => {
  const anon = renderHeroShardPage({ origin: "https://x" });
  assert.match(anon, /<title>英雄の欠片 計算ツール/);
  assert.match(anon, /Discordでログイン/);
  assert.match(anon, /1,065/);
  const mine = renderHeroShardPage({ signedIn: true, heroes: [{ name: "Amadeus", displayName: "アマデウス", steps: 30 }, { name: "Zoe", displayName: "ゾーイ", steps: 24 }] });
  assert.match(mine, /アマデウス<small class="ded">専用欠片<\/small>/);
  assert.match(mine, /合計：<b>600<\/b>個/, "dedicated heroes are excluded from the general total");
});

test("routes and entry points", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /url\.pathname === "\/tools\/hero-shards"\) return await renderHeroShardRoute/);
  assert.match(src, /visibilityEnabled\(settings, "heroes_list", auth\.role\)/);
  assert.match(renderEagleEyeOtherMenu({}), /href="\/tools\/hero-shards"/);
  assert.match(readFileSync(new URL("../src/hero-catalog-page.js", import.meta.url), "utf8"), /href="\/tools\/hero-shards"/);
});
