import test from "node:test";
import assert from "node:assert/strict";
import { renderKingdomRankingsPage, normalizeAllianceId } from "../src/kingdom-portal.js";

// Personal boards only carry the alliance id; the tag must come from the
// player row or this kingdom's alliance boards, never the bare number.
function fakeDb() {
  const run = (sql) => {
    if (sql.includes("FROM kingdom_catalog")) return { first: { kid: 1524, name: "1524" } };
    if (sql.includes("FROM kingdom_ranking_board_state")) return { all: [{ board: "personal_power" }] };
    if (sql.includes("FROM kingdom_ranking_current r LEFT JOIN players")) return { all: [
      { rank: 15, target_type: "PLAYER", target_id: "1", governor_id: "1", nick_name: "まったり", score: 40949140, aid: "153300015.0", abbr: null, alliance_abbr: null },
      { rank: 16, target_type: "PLAYER", target_id: "2", governor_id: "2", nick_name: "みきまーむ", score: 39165347, aid: "153300050.0", abbr: null, alliance_abbr: "Pen" },
      { rank: 17, target_type: "PLAYER", target_id: "3", governor_id: "3", nick_name: "不明", score: 1, aid: "999.0", abbr: null, alliance_abbr: null }
    ] };
    if (sql.includes("target_type = 'ALLIANCE' AND abbr IS NOT NULL")) return { all: [{ aid: "153300015", abbr: "TNC" }] };
    return { first: null, all: [] };
  };
  const stmt = sql => ({ bind: () => stmt(sql), first: async () => run(sql).first ?? null, all: async () => ({ results: run(sql).all ?? [] }), run: async () => ({ meta: { changes: 0 } }) });
  return { prepare: stmt };
}

test("ranking rows show the alliance tag, resolved from alliance boards, never a bare id", async () => {
  const res = await renderKingdomRankingsPage(new Request("https://ee.example/kingdom/rankings?kid=1524&board=personal_power"), { DB: fakeDb() });
  const html = typeof res === "string" ? res : await res.text();
  assert.match(html, /\[TNC\]/, "tag resolved from the alliance board (float id normalised)");
  assert.match(html, /\[Pen\]/, "stored player tag still wins");
  assert.ok(!/\[153300015\.0\]|\[999\.0\]|\[999\]/.test(html), "no numeric alliance ids");
});

test("alliance ids are normalised", () => {
  assert.equal(normalizeAllianceId("153300015.0"), "153300015");
  assert.equal(normalizeAllianceId(153300015), "153300015");
});
