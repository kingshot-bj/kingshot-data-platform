import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/r2-archive.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const { archivePlayerRankHistoryBatch, getLatestPlayerRankHistoryFromR2 } = await import(moduleUrl);

function createBucket() {
  const objects = new Map();
  let etagCounter = 0;
  let listCalls = 0;

  return {
    get listCalls() { return listCalls; },
    seed(key, bytes) {
      objects.set(key, { key, bytes, etag: `etag-${++etagCounter}` });
    },
    async put(key, value, options = {}) {
      const current = objects.get(key);
      if (options.onlyIf?.etagMatches && options.onlyIf.etagMatches !== current?.etag) return null;
      let bytes = value;
      if (value instanceof ReadableStream) bytes = await new Response(value).arrayBuffer();
      else if (ArrayBuffer.isView(value)) bytes = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
      const etag = `etag-${++etagCounter}`;
      objects.set(key, { key, bytes, etag });
      return { etag };
    },
    async get(key) {
      const item = objects.get(key);
      if (!item) return null;
      const body = new Response(item.bytes).body;
      return {
        key,
        etag: item.etag,
        body,
        async json() {
          if (typeof item.bytes === "string") return JSON.parse(item.bytes);
          return JSON.parse(new TextDecoder().decode(item.bytes));
        }
      };
    },
    async list({ prefix }) {
      listCalls++;
      return {
        objects: [...objects.values()]
          .filter(item => item.key.startsWith(prefix))
          .map(item => ({ key: item.key })),
        truncated: false
      };
    },
    has(key) { return objects.has(key); }
  };
}

const latestKey = governorId => `latest/v1/player_rank_snapshots/${governorId}.json`;

test("latest pointer reads directly without listing history", async () => {
  const bucket = createBucket();
  await archivePlayerRankHistoryBatch(bucket, {
    governorId: "12345",
    ranks: { mystic_trial: 900, mystic_rank: 3, leaderboards: [] },
    observedAt: 200
  });

  const rows = await getLatestPlayerRankHistoryFromR2(bucket, { governorId: "12345" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].observed_at, 200);
  assert.equal(rows[0].mystic_trial, 900);
  assert.equal(bucket.listCalls, 0);
});

test("older snapshots do not replace the latest pointer", async () => {
  const bucket = createBucket();
  await archivePlayerRankHistoryBatch(bucket, {
    governorId: "12345",
    ranks: { mystic_trial: 900, leaderboards: [] },
    observedAt: 200
  });
  await archivePlayerRankHistoryBatch(bucket, {
    governorId: "12345",
    ranks: { mystic_trial: 100, leaderboards: [] },
    observedAt: 100
  });

  const pointer = await bucket.get(latestKey("12345"));
  const row = await pointer.json();
  assert.equal(row.observed_at, 200);
  assert.equal(row.mystic_trial, 900);
});

test("legacy history is scanned once and pointer is backfilled", async () => {
  const bucket = createBucket();
  const seedHistory = async (observedAt, score) => {
    const row = {
      _source_table: "player_rank_snapshots",
      governor_id: "67890",
      observed_at: observedAt,
      mystic_trial: score,
      leaderboards: []
    };
    const stream = new Response(JSON.stringify(row) + "\n").body
      .pipeThrough(new CompressionStream("gzip"));
    const bytes = await new Response(stream).arrayBuffer();
    bucket.seed(`history/v1/player_rank_snapshots/67890/${observedAt}/legacy-${observedAt}.ndjson.gz`, bytes);
  };
  await seedHistory(100, 1000);
  await seedHistory(200, 2000);

  const rows = await getLatestPlayerRankHistoryFromR2(bucket, { governorId: "67890" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].observed_at, 200);
  assert.equal(rows[0].mystic_trial, 2000);
  assert.equal(bucket.listCalls, 1);
  assert.equal(bucket.has(latestKey("67890")), true);

  const pointer = await bucket.get(latestKey("67890"));
  assert.equal((await pointer.json()).observed_at, 200);
});
