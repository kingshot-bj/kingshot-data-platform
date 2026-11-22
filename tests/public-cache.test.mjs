// 公開ページのキャッシュ：キャッシュがある時は D1 を読まずに返す。見つからないページ（404）はキャッシュしない。
// 種類ごとのキャッシュ時間（王国などは1時間、英雄・ツールは6時間）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { PUBLIC_CACHE_TTL } from "../src/public-pages.js";

function fakeCaches() {
  const store = new Map();
  return { store, default: { async match(req) { const r = store.get(new URL(req.url).toString()); return r ? r.clone() : undefined; }, async put(req, res) { store.set(new URL(req.url).toString(), res.clone()); } } };
}
function countingDb() {
  const db = { calls: 0 };
  const stmt = () => ({ bind: () => stmt(), first: async () => null, all: async () => ({ results: [] }), run: async () => ({ meta: {} }) });
  db.prepare = () => { db.calls++; return stmt(); };
  db.batch = async () => [];
  return db;
}
const ctx = { waitUntil() {}, passThroughOnException() {} };

test("キャッシュ時間：王国など（毎日更新）1時間、英雄・ツール（デプロイ時だけ変わる）6時間", () => {
  assert.equal(PUBLIC_CACHE_TTL.data, 3600);
  assert.equal(PUBLIC_CACHE_TTL.static, 21600);
});

test("英雄カタログ：2回目はキャッシュから返し D1 を読まない。キャッシュ時間は6時間", async () => {
  const caches = fakeCaches(); globalThis.caches = caches;
  try {
    const worker = (await import("../src/index.js")).default;
    const env = { DB: countingDb() };
    const first = await worker.fetch(new Request("https://eagleeye-ks.com/hero-catalog"), env, ctx);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("cache-control"), "public, max-age=21600");
    assert.ok(caches.store.has("https://eagleeye-ks.com/hero-catalog"));
    const before = env.DB.calls;
    const second = await worker.fetch(new Request("https://eagleeye-ks.com/hero-catalog"), env, ctx);
    assert.equal(second.status, 200);
    assert.equal(env.DB.calls, before, "キャッシュがある時は D1 を読まない");
  } finally { delete globalThis.caches; }
});

test("王国ページ：キャッシュがある時は存在確認の D1 も読まない。存在しない王国の404はキャッシュしない", async () => {
  const caches = fakeCaches(); globalThis.caches = caches;
  try {
    const worker = (await import("../src/index.js")).default;
    const env = { DB: countingDb() };
    caches.store.set("https://eagleeye-ks.com/k/1", new Response("<html>cached</html>", { status: 200, headers: { "content-type": "text/html" } }));
    const before = env.DB.calls;
    const hit = await worker.fetch(new Request("https://eagleeye-ks.com/k/1"), env, ctx);
    assert.equal(await hit.text(), "<html>cached</html>");
    assert.equal(env.DB.calls, before, "キャッシュがある時は kingdom_catalog を読まない");
    const nf = await worker.fetch(new Request("https://eagleeye-ks.com/k/99999"), env, ctx);
    assert.equal(nf.status, 404);
    assert.match(await nf.text(), /name="robots" content="noindex"/);
    assert.equal(nf.headers.get("cache-control"), "no-store", "404 はブラウザにもキャッシュさせない");
    assert.ok(!caches.store.has("https://eagleeye-ks.com/k/99999"), "404 はキャッシュに置かない");
  } finally { delete globalThis.caches; }
});
