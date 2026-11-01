import test from "node:test";
import assert from "node:assert/strict";
import { materializePlayer, stripStaleActivityFields, STALE_ACTIVITY_FIELDS } from "../src/player-store.js";

// MightPulse marks online / last_active_at / last_login as stale. EagleEye
// must never store them in D1 or in the R2 player history.

function fakeDb() {
  const writes = [];
  const stmt = sql => {
    let args = [];
    const self = {
      bind: (...a) => { args = a; return self; },
      first: async () => null,
      all: async () => ({ results: [] }),
      run: async () => { writes.push({ sql, args }); return { meta: { changes: 1 } }; }
    };
    return self;
  };
  return { writes, prepare: stmt, batch: async list => Promise.all(list.map(s => s.run())) };
}

function fakeR2() {
  const bodies = [];
  return {
    bodies,
    async put(key, body) {
      const bytes = body instanceof ArrayBuffer ? body : await new Response(body).arrayBuffer();
      const text = await new Response(new Response(bytes).body.pipeThrough(new DecompressionStream("gzip"))).text();
      bodies.push({ key, text });
    }
  };
}

const observation = {
  observation_id: "obs-1",
  observed_at: 1760000000,
  payload: {
    player: {
      governor_id: 123456, nick_name: "Tester", kid: 1524, power: 1000,
      online: true, last_active_at: 1759999999, last_login: 1759990000,
      shield_endtime: 1760003600, x: 10, y: 20, alliance: { aid: 1, abbr: "TST", name: "Test" }
    }
  }
};

test("stripStaleActivityFields removes only the stale activity fields", () => {
  const copy = stripStaleActivityFields(observation.payload.player);
  for (const key of STALE_ACTIVITY_FIELDS) assert.equal(key in copy, false);
  assert.equal(copy.shield_endtime, 1760003600);
  assert.equal(observation.payload.player.online, true, "input object is not mutated");
});

test("materializePlayer writes online=0 and NULL timestamps to players and keeps them out of R2", async () => {
  const db = fakeDb();
  const r2 = fakeR2();
  await materializePlayer(db, observation, null, r2, "R2_ONLY");
  const insert = db.writes.find(w => w.sql.includes("INSERT INTO players"));
  assert.ok(insert, "players upsert ran");
  const cols = insert.sql.slice(insert.sql.indexOf("(") + 1, insert.sql.indexOf(")")).split(",").map(c => c.trim());
  const valueOf = name => insert.args[cols.indexOf(name)];
  assert.equal(valueOf("online"), 0);
  assert.equal(valueOf("last_active_at"), null);
  assert.equal(valueOf("last_login"), null);
  assert.equal(valueOf("shield_endtime"), 1760003600);
  assert.equal(r2.bodies.length, 1, "player history archived to R2");
  const archived = JSON.parse(r2.bodies[0].text);
  for (const key of STALE_ACTIVITY_FIELDS) assert.equal(key in archived.player, false);
  assert.equal(archived.player.nick_name, "Tester");
});
