import test from "node:test";
import assert from "node:assert/strict";
import { currentKingdomAge, kingdomTimelineStatus, renderKingdomTimelineSection, KINGDOM_TIMELINE } from "../src/kingdom-timeline.js";
import { summarizeKingdomGrowth } from "../src/kingdom-growth-history.js";
import { renderPublicKingdomPage } from "../src/public-pages.js";

test("kingdom age is advanced by the days since it was recorded", () => {
  assert.equal(currentKingdomAge(100, 1000, 1000 + 3 * 86400 + 5), 103);
  assert.equal(currentKingdomAge(null, 1000), null);
  assert.equal(currentKingdomAge(0, 0, 999999), 0, "no record time: use the value as is");
});

test("timeline splits milestones into reached / in window / upcoming", () => {
  const s = kingdomTimelineStatus(200);
  assert.ok(s.reached.some(m => m.title.startsWith("第4世代 SSR英雄")), "190-200 is reached at day 200");
  assert.equal(s.upcoming[0].title, "戦争学院 T11");
  assert.equal(s.upcoming[0].daysLeft, 20);
  const w = kingdomTimelineStatus(275);
  assert.ok(w.inWindow.some(m => m.title.startsWith("第5世代 SSR英雄")));
  assert.equal(KINGDOM_TIMELINE.length, 20);
});

test("timeline section shows age, next unlocks with days left, and the source", () => {
  const html = renderKingdomTimelineSection(200, { kid: 1524 });
  assert.match(html, /開設200日目/);
  assert.match(html, /戦争学院 T11[\s\S]*あと20日/);
  assert.match(html, /Pandafather/);
  assert.match(html, /目安/);
});

test("growth summary records age_days; public page shows the timeline", () => {
  assert.equal(summarizeKingdomGrowth({ power: 1, age_days: "321.0" }).age_days, 321);
  const html = renderPublicKingdomPage(1524, { catalog: null, players: [], alliances: [], matchup: null, score: null, growth: null, age: 321 }, {});
  assert.match(html, /王国タイムライン/);
  assert.match(html, /開設321日目/);
  assert.match(html, /第6世代 SSR英雄[\s\S]*あと29日/);
});
