import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isWriteSql, readOnlyD1, readOnlyR2, previewReadOnlyEnv, installPreviewFetchGuard } from "../src/preview-readonly.js";

// 2026-11-16：プレビューは本番の D1・R2 をそのまま使うため、開くだけで本番データに書き込んでいた。読むだけにする。
test("書き込みの SQL を見分ける（SELECT・updated_at などは読み込み）", () => {
  for (const s of ["INSERT INTO t VALUES (1)", "  update t set a=1", "DELETE FROM t", "REPLACE INTO t VALUES(1)", "CREATE TABLE IF NOT EXISTS t (a)", "ALTER TABLE t ADD c", "DROP INDEX i", "-- c\nINSERT INTO t VALUES (1)", "/* x */ update t set a=1", "PRAGMA foreign_keys = ON", "WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x", "insert or ignore into t values (1)"]) assert.equal(isWriteSql(s), true, s);
  for (const s of ["SELECT * FROM t", "select updated_at, replace(name,'a','b') from t", "WITH x AS (SELECT 1) SELECT * FROM x", "PRAGMA table_info(t)", "  SELECT 1"]) assert.equal(isWriteSql(s), false, s);
});

function fakeDb() {
  const calls = [];
  const stmt = sql => ({ sql, bind(...a) { calls.push(["bind", sql, a]); return this; }, async first() { calls.push(["first", sql]); return { n: 1 }; }, async all() { calls.push(["all", sql]); return { results: [{ n: 1 }] }; }, async run() { calls.push(["run", sql]); return { meta: { changes: 1 } }; }, async raw() { calls.push(["raw", sql]); return [[1]]; } });
  return { calls, prepare: sql => stmt(sql), async batch(list) { calls.push(["batch", list.map(s => s.sql)]); return list.map(() => ({ results: [] })); }, async exec(sql) { calls.push(["exec", sql]); return { count: 1 }; } };
}

test("D1：読み込みはそのまま、書き込みは実行しない", async () => {
  const raw = fakeDb(), db = readOnlyD1(raw);
  assert.deepEqual(await db.prepare("SELECT 1").bind(1).first(), { n: 1 });
  assert.deepEqual((await db.prepare("SELECT 1").all()).results, [{ n: 1 }]);
  const r = await db.prepare("INSERT INTO t VALUES (?)").bind(1).run();
  assert.equal(r.meta.changes, 0);
  assert.equal(await db.prepare("UPDATE t SET a=1 RETURNING *").first(), null);
  await db.batch([db.prepare("INSERT INTO t VALUES (1)"), db.prepare("SELECT 2")]);
  await db.batch([db.prepare("SELECT 3")]);
  await db.exec("CREATE TABLE x (a); SELECT 1");
  const executed = raw.calls.filter(c => ["first", "all", "run", "raw", "exec"].includes(c[0])).map(c => c[1]);
  assert.ok(executed.every(sql => !isWriteSql(sql)), JSON.stringify(executed));
  assert.deepEqual(raw.calls.find(c => c[0] === "batch"), ["batch", ["SELECT 3"]]);
});

test("R2：put・delete はしない／get はする。Queue は送らない", async () => {
  const log = [];
  const bucket = { get: async k => (log.push(["get", k]), { k }), head: async () => null, list: async () => ({ objects: [] }), put: async () => log.push(["put"]), delete: async () => log.push(["delete"]) };
  const r2 = readOnlyR2(bucket);
  assert.deepEqual(await r2.get("a"), { k: "a" });
  assert.equal(await r2.put("a", "x"), null);
  await r2.delete("a");
  assert.deepEqual(log, [["get", "a"]]);
  const sent = [];
  const env = previewReadOnlyEnv({ DB: fakeDb(), ARCHIVE: bucket, SYSTEM_EVENT_QUEUE: { send: async m => sent.push(m) }, EAGLEEYE_ENV: "preview" });
  await env.SYSTEM_EVENT_QUEUE.send({ a: 1 });
  assert.deepEqual(sent, []);
  assert.equal(env.DB.__previewReadOnly, true);
  assert.equal(previewReadOnlyEnv(env), env, "二重に包まない");
});

test("外部 fetch を止める（API Pool を使わない）", async () => {
  const scope = { fetch: async () => { throw new Error("must not be called"); } };
  installPreviewFetchGuard(scope);
  const res = await scope.fetch("https://api.mightpulse.com/kingdoms/1");
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, "PREVIEW_READ_ONLY");
});

test("配線：fetch の最初で包む・cron と Queue はプレビューで動かさない", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /async fetch\(request, env, executionContext\) \{\n[^\n]*\n    if \(isPreviewEnv\(env\)\) \{ env = previewReadOnlyEnv\(env\); installPreviewFetchGuard\(\); \}\n    setSystemEventQueue/);
  assert.match(src, /async scheduled\(event, env, executionContext\) \{\n    if \(isPreviewEnv\(env\)\) return;/);
  assert.match(src, /async queue\(batch, env\) \{\n    if \(isPreviewEnv\(env\)\) return;/);
});

test("PR プレビューの workflow：EAGLEEYE_ENV=preview を必ず渡す・フォークでは動かない・鍵が無ければ何もしない", () => {
  const wf = readFileSync(new URL("../.github/workflows/pr-preview.yml", import.meta.url), "utf8");
  assert.match(wf, /preview --name "\$PREVIEW_NAME" --var EAGLEEYE_ENV:preview/);
  assert.match(wf, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(wf, /if \[ -z "\$CLOUDFLARE_API_TOKEN" \]; then echo "CLOUDFLARE_PREVIEW_API_TOKEN is not set; skipping"/);
  const cfg = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  assert.match(cfg, /"previews": \{\s*"vars": \{\s*"EAGLEEYE_ENV": "preview"/);
});
