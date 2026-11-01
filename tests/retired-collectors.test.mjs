import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

test("never-scheduled background collectors are retired, their status rows say so", () => {
  for (const name of ["runKingdomSeeder", "runKingdomRankingRoller", "runAllianceRoller", "runPlayerRoller"]) assert.ok(!index.includes(name), name + " is gone");
  assert.equal(existsSync(new URL("../src/kingdom-seeder.js", import.meta.url)), false);
  assert.equal(existsSync(new URL("../src/kingdom-ranking-roller.js", import.meta.url)), false);
  for (const label of ["Kingdom Seeder", "Alliance Roller", "Player Roller", "Ranking Roller"]) assert.match(index, new RegExp('label: "' + label + '", state: "RETIRED"'));
  assert.match(index, /item\.state === "RETIRED"\s*\? \{ tone:"neutral", label:"廃止" \}/);
});

test("status getters still work for the operations JSON", async () => {
  const { getPlayerRollerStatus } = await import("../src/player-roller.js");
  const { getAllianceRollerStatus } = await import("../src/alliance-catalog.js");
  const db = { prepare: () => ({ bind: () => ({ first: async () => ({ state: "IDLE" }) }) }) };
  assert.equal((await getPlayerRollerStatus(db)).state, "IDLE");
  assert.equal((await getAllianceRollerStatus(db)).state, "IDLE");
});
