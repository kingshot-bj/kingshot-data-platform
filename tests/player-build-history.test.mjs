import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  summarizePlayerBuild, archivePlayerBuild, loadPlayerBuildHistory, diffPlayerBuild,
  renderPlayerBuildHistorySection, playerBuildHistoryKey
} from "../src/player-build-history.js";
import { materializePlayer } from "../src/player-store.js";

function fakeR2() {
  const objects = new Map();
  return {
    objects,
    async put(key, body) { objects.set(key, typeof body === "string" ? body : await new Response(body).text()); },
    async list({ prefix }) { return { objects: [...objects.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })), truncated: false }; },
    async get(key) { const v = objects.get(key); return v == null ? null : { text: async () => v, body: new Response(v).body }; }
  };
}

const hero = (level, enh, skill) => ({
  id: 50021, name: "Zoe", level, star: 30, position: 1,
  skill_levels: [{ id: 500211, level: skill }],
  exclusive_gear: { level: 10 },
  gear: [{ slot: "Gloves", enhancement_level: enh, refine_level: 10 }]
});
const payload = (level, enh, skill, strength) => ({
  player: { governor_id: 1 },
  heroes: [hero(level, enh, skill)],
  gov_gear: { hidden: false, items: [{ slot: "Hat", quality: 5, tier: 2, star: 3, strength_level: strength, score: 1 }] }
});

test("summaries keep only documented build fields and respect hidden gov gear", () => {
  const s = summarizePlayerBuild(payload(80, 70, 5, 10));
  assert.equal(s.heroes[0].level, 80);
  assert.equal(s.heroes[0].gear[0].enhancement, 70);
  assert.equal(s.gov_gear.items[0].strength_level, 10);
  assert.equal(summarizePlayerBuild({ player: { governor_id: 1 } }), null, "base-only payloads are not archived");
  const hidden = summarizePlayerBuild({ heroes: [], gov_gear: { hidden: true, items: [{ slot: "x" }] } });
  assert.deepEqual(hidden.gov_gear, { hidden: true, items: [] });
});

test("one object per player per UTC day; same-day fetches overwrite", async () => {
  const r2 = fakeR2();
  const day = Date.UTC(2026, 9, 1, 3) / 1000;
  await archivePlayerBuild(r2, { governorId: 1, observedAt: day, payload: payload(79, 60, 4, 8) });
  await archivePlayerBuild(r2, { governorId: 1, observedAt: day + 3600, payload: payload(80, 60, 4, 8) });
  assert.equal(r2.objects.size, 1);
  assert.equal(playerBuildHistoryKey(1, day), "history/player_build/v1/1/2026-10-01.json");
  assert.equal(JSON.parse([...r2.objects.values()][0]).heroes[0].level, 80);
});

test("history compares latest with ~7 and ~30 days earlier and lists changes", async () => {
  const r2 = fakeR2();
  const d = n => Date.UTC(2026, 9, 31, 12) / 1000 - n * 86400;
  await archivePlayerBuild(r2, { governorId: 1, observedAt: d(30), payload: payload(70, 50, 3, 5) });
  await archivePlayerBuild(r2, { governorId: 1, observedAt: d(7), payload: payload(78, 60, 4, 8) });
  await archivePlayerBuild(r2, { governorId: 1, observedAt: d(0), payload: payload(80, 70, 5, 10) });
  const history = await loadPlayerBuildHistory(r2, 1);
  assert.equal(history.days, 3);
  assert.deepEqual(history.comparisons.map(c => c.label), ["7日前", "30日前"]);
  const changes = diffPlayerBuild(history.comparisons[0].snapshot, history.latest);
  assert.ok(changes.some(c => c.field === "レベル" && c.from === 78 && c.to === 80));
  assert.ok(changes.some(c => c.field === "Gloves 強化" && c.to === 70));
  assert.ok(changes.some(c => c.kind === "gov_gear" && c.field === "強化" && c.to === 10));
  const html = renderPlayerBuildHistorySection(history, { heroes: true, govGear: true });
  assert.match(html, /育成の推移/);
  assert.match(html, /アリーナ防衛編成/);
  assert.match(html, /78 → 80/);
});

test("visibility settings hide the matching changes", () => {
  const older = summarizePlayerBuild(payload(70, 50, 3, 5));
  const newer = summarizePlayerBuild(payload(80, 70, 5, 10));
  const changes = diffPlayerBuild(older, newer, { heroes: true, heroList: true, heroSkills: false, heroExclusive: false, heroGear: false, govGear: false });
  assert.ok(changes.every(c => c.kind === "hero" && (c.field === "レベル" || c.field === "星")));
  assert.equal(renderPlayerBuildHistorySection({ latest: newer }, { heroes: false, govGear: false }), "");
});

test("materializePlayer archives the build from an observation that already carries heroes", async () => {
  const r2 = fakeR2();
  const db = { prepare: () => { const s = { bind: () => s, first: async () => null, all: async () => ({ results: [] }), run: async () => ({ meta: { changes: 1 } }) }; return s; }, batch: async () => [] };
  await materializePlayer(db, { observation_id: "o", observed_at: 1760000000, payload: payload(80, 70, 5, 10) }, null, r2, "R2_ONLY");
  assert.ok([...r2.objects.keys()].some(k => k.startsWith("history/player_build/v1/1/")));
});

test("the player page renders the build history section", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /loadPlayerBuildHistory\(env\.ARCHIVE, governorId\)/);
  assert.match(src, /\$\{buildHistoryHtml\}/);
  assert.match(src, /\$\{PLAYER_BUILD_HISTORY_CSS\}<\/style>/);
});
