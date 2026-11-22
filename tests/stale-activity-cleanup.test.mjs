import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { countStaleActivity, runStaleActivityBackup, runStaleActivityPurge, stalePurgeBlocker, STALE_BACKUP_MANIFEST_KEY } from "../src/stale-activity-cleanup.js";
import { stripStaleActivityFromPayloadJson } from "../src/api-observations.js";

// Real SQLite (with JSON1) behind a tiny D1-shaped adapter.
function d1() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE players (governor_id TEXT PRIMARY KEY, online INTEGER, last_active_at INTEGER, last_login TEXT, power INTEGER);
    CREATE TABLE api_observations (observation_id TEXT PRIMARY KEY, target_type TEXT, target_id TEXT, payload_json TEXT NOT NULL);
    CREATE TABLE player_snapshots (snapshot_id TEXT PRIMARY KEY, governor_id TEXT, payload_json TEXT NOT NULL);
    CREATE TABLE history_emergency_buffer (buffer_id TEXT PRIMARY KEY, history_type TEXT, governor_id TEXT, payload_json TEXT NOT NULL);`);
  const prepare = sql => {
    let args = [];
    const st = {
      bind: (...a) => { args = a; return st; },
      first: async () => db.prepare(sql).get(...args) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...args) }),
      run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; }
    };
    return st;
  };
  return { raw: db, prepare };
}

function fakeR2() {
  const objects = new Map();
  return {
    objects,
    async put(key, body) { objects.set(key, body instanceof ArrayBuffer ? new Uint8Array(body) : String(body)); },
    async get(key) { const v = objects.get(key); return v == null ? null : { text: async () => (typeof v === "string" ? v : new TextDecoder().decode(v)) }; }
  };
}

function seed(db) {
  db.raw.exec(`INSERT INTO players VALUES ('1',1,1700000000,'2026-01-01',100),('2',0,NULL,NULL,200),('3',0,1700000001,NULL,300);
    INSERT INTO api_observations VALUES ('o1','PLAYER','1','{"governor_id":1,"online":true,"last_active_at":5,"power":9}'),
      ('o2','PLAYER','2','{"player":{"governor_id":2,"last_login":"x","power":8},"heroes":[]}'),
      ('o3','PLAYER','3','{"governor_id":3,"power":7}'),('o4','KINGDOM','1524','{"online":1}');
    INSERT INTO player_snapshots VALUES ('s1','1','{"online":0,"power":1}');
    INSERT INTO history_emergency_buffer VALUES ('b1','PLAYER','1','{"player":{"online":1,"power":1}}');`);
}

test("counts every table that still holds the stale fields", async () => {
  const db = d1(); seed(db);
  assert.deepEqual(await countStaleActivity(db), { players: 2, api_observations: 2, player_snapshots: 1, history_emergency_buffer: 1, total: 6 });
});

test("backup writes a verified Drive copy and a manifest, and deletes nothing", async () => {
  const db = d1(); seed(db); const r2 = fakeR2();
  const uploads = [];
  const manifest = await runStaleActivityBackup({ db, bucket: r2, now: 1800000000, upload: async (key, name) => { uploads.push([key, name]); return { verified: true, driveFileId: "f1", webViewLink: "https://drive/x" }; } });
  assert.equal(manifest.counts.total, 6);
  assert.equal(uploads.length, 1);
  assert.ok(r2.objects.has(manifest.r2_key) && r2.objects.has(STALE_BACKUP_MANIFEST_KEY));
  assert.equal((await countStaleActivity(db)).total, 6, "nothing removed by the backup");
  await assert.rejects(runStaleActivityBackup({ db, bucket: fakeR2(), upload: async () => ({ verified: false }) }), /GOOGLE_DRIVE_VERIFICATION_FAILED/);
});

test("purge needs a fresh verified backup and the typed file name, then removes only the stale fields", async () => {
  const db = d1(); seed(db); const r2 = fakeR2();
  const now = 1800000000;
  assert.equal((await runStaleActivityPurge({ db, bucket: r2, confirm: "x", now })).error, "BACKUP_REQUIRED");
  const manifest = await runStaleActivityBackup({ db, bucket: r2, now, upload: async () => ({ verified: true }) });
  assert.equal((await runStaleActivityPurge({ db, bucket: r2, confirm: "wrong", now })).error, "CONFIRMATION_MISMATCH");
  assert.equal(stalePurgeBlocker(manifest, { ...manifest.counts, players: 99 }, now), "DATA_CHANGED_SINCE_BACKUP");
  assert.equal(stalePurgeBlocker(manifest, manifest.counts, now + 8 * 86400), "BACKUP_TOO_OLD");
  const result = await runStaleActivityPurge({ db, bucket: r2, confirm: manifest.file_name, now });
  assert.equal(result.ok, true);
  assert.equal(result.after.total, 0);
  assert.deepEqual(db.raw.prepare("SELECT governor_id, online, last_active_at, last_login, power FROM players ORDER BY governor_id").all().map(r => ({ ...r })),
    [{ governor_id: "1", online: 0, last_active_at: null, last_login: null, power: 100 }, { governor_id: "2", online: 0, last_active_at: null, last_login: null, power: 200 }, { governor_id: "3", online: 0, last_active_at: null, last_login: null, power: 300 }]);
  assert.deepEqual(JSON.parse(db.raw.prepare("SELECT payload_json FROM api_observations WHERE observation_id='o1'").get().payload_json), { governor_id: 1, power: 9 });
  assert.deepEqual(JSON.parse(db.raw.prepare("SELECT payload_json FROM api_observations WHERE observation_id='o2'").get().payload_json), { player: { governor_id: 2, power: 8 }, heroes: [] });
  assert.equal(db.raw.prepare("SELECT payload_json FROM api_observations WHERE observation_id='o4'").get().payload_json, '{"online":1}', "non-player rows untouched");
});

test("new raw player observations are stored without the stale fields", () => {
  assert.equal(stripStaleActivityFromPayloadJson("PLAYER", '{"online":true,"player":{"last_login":"x","power":1}}'), '{"player":{"power":1}}');
  assert.equal(stripStaleActivityFromPayloadJson("KINGDOM", '{"online":1}'), '{"online":1}');
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /JSON\.stringify\(stripStaleActivityFields\(raw\)\)/);
  assert.match(src, /url\.pathname === "\/api\/owner\/stale-activity"/);
  assert.match(src, /requireOwner\(request, env\);\n  if \(guard\.error\) return guard\.error;\n  if \(!env\.DB\) return json\(\{ ok: false, error: "DB_NOT_CONFIGURED" \}, 503\);\n  if \(!env\.ARCHIVE\)/);
});
