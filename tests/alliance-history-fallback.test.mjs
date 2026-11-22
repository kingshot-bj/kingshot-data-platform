import test from "node:test";
import assert from "node:assert/strict";
import { archiveAllianceHistoryBatch } from "../src/r2-archive.js";
import { renderAlliancePage } from "../src/kingdom-portal.js";

function fakeR2() {
  const objects = new Map();
  return {
    objects,
    async put(key, body, options = {}) { objects.set(key, { bytes: new Uint8Array(body instanceof ArrayBuffer ? body : await new Response(body).arrayBuffer()), httpMetadata: options.httpMetadata || {} }); },
    async list({ prefix }) { return { objects: [...objects.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })), truncated: false }; },
    async get(key) { const o = objects.get(key); return o ? { body: new Response(o.bytes).body, httpMetadata: o.httpMetadata } : null; }
  };
}

// D1 stub: the alliance is only known from rankings (no alliance_catalog row),
// with the float-looking aid that rankings store.
function fakeDb() {
  const writes = [];
  const run = sql => {
    if (sql.includes("FROM alliance_catalog")) return null;
    if (sql.includes("FROM kingdom_ranking_current") && sql.includes("alliance_power") && sql.includes("LIMIT 1"))
      return { kid: 1524, aid: "153300050.0", abbr: "TNC", name: "にゃっぷ！", power: "13600000000", power_rank: 1 };
    return null;
  };
  const stmt = sql => ({
    first: async () => run(sql), all: async () => ({ results: [] }), run: async () => { writes.push(sql); return { meta: { changes: 0 } }; },
    bind: () => stmt(sql)
  });
  return { writes, prepare: stmt };
}

const member = (id, name, power) => ({ governor_id: String(id), nick_name: name, power });

test("signed-out alliance page shows the newest saved roster instead of 0 members", async () => {
  const r2 = fakeR2();
  await archiveAllianceHistoryBatch(r2, { kid: 1524, aid: "153300050", observedAt: 1790000000, payload: { data: { alliance: { aid: "153300050", abbr: "TNC", name: "にゃっぷ！", power: 100 }, members: [member(1, "Old", 10)] } } });
  await archiveAllianceHistoryBatch(r2, { kid: 1524, aid: "153300050", observedAt: 1790100000, payload: { data: { alliance: { aid: "153300050", abbr: "TNC", name: "にゃっぷ！", power: 200 }, members: [member(1, "Alpha", 30), member(2, "Bravo", 20), member(3, "Charlie", 10)] } } });
  const db = fakeDb();
  const html = await renderAlliancePage(new Request("https://e.test/alliance?kid=1524&tag=TNC"), { DB: db, ARCHIVE: r2 }, null);
  assert.match(html, /<small>メンバー数<\/small><strong>3<\/strong>/);
  assert.ok(html.includes("Alpha") && html.includes("Bravo"), "newest snapshot roster is listed");
  assert.ok(html.includes("履歴から表示"));
  assert.ok(html.includes("同盟ID：153300050<"), "no trailing .0");
  assert.ok(html.includes("ログインして取得"));
  assert.equal(db.writes.length, 0, "signed-out view writes nothing to D1");
});

test("a fetched roster is upserted so ranking-only alliances keep their latest pointer", async () => {
  const { readFile } = await import("node:fs/promises");
  const portal = await readFile(new URL("../src/kingdom-portal.js", import.meta.url), "utf8");
  assert.ok(portal.includes("INSERT INTO alliance_catalog (kid,aid,abbr,name,member_count,r2_latest_key,first_seen_at,last_seen_at,updated_at,status)"));
  assert.ok(portal.includes("ON CONFLICT(kid,aid) DO UPDATE SET r2_latest_key=excluded.r2_latest_key"));
});
