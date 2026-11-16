// プレビュー（EAGLEEYE_ENV=preview）は本番と同じ D1・R2 を使うので、読むだけにする。
// ・D1：書き込みの SQL は実行せず「0件変更」を返す（読み込みはそのまま）
// ・R2：put / delete などは実行しない（get / head / list はそのまま）
// ・Queue：送らない（本番の consumer が D1 に書くため）
// ・外部への fetch：止める（MightPulse＝API Pool の消費、Discord・Google への投稿などを防ぐ）
// プレビューではログインもできない（セッションを書けないため）。ログインなしの画面の確認用。

const WRITE_HEAD = /^\s*(?:(?:--[^\n]*\n|\/\*[\s\S]*?\*\/)\s*)*(insert|update|delete|replace|upsert|create|drop|alter|vacuum|reindex|analyze|attach|detach|begin|commit|rollback|savepoint|release)\b/i;
const PRAGMA_SET = /^\s*pragma\s+[\w.]+\s*=/i;
const CTE_WRITE = /^\s*with\b[\s\S]*\)\s*(insert|update|delete|replace)\b/i;

export function isWriteSql(sql) {
  const s = String(sql || "");
  return WRITE_HEAD.test(s) || PRAGMA_SET.test(s) || CTE_WRITE.test(s);
}

const fakeRun = () => ({ success: true, results: [], meta: { changes: 0, last_row_id: 0, rows_written: 0, rows_read: 0, preview_readonly: true } });

function wrapStatement(stmt, write) {
  return {
    __inner: stmt,
    __write: write,
    bind(...args) { return wrapStatement(stmt.bind(...args), write); },
    async first(col) { return write ? null : stmt.first(col); },
    async all() { return write ? fakeRun() : stmt.all(); },
    async run() { return write ? fakeRun() : stmt.run(); },
    async raw(opts) { return write ? [] : stmt.raw(opts); }
  };
}

export function readOnlyD1(db) {
  if (!db || db.__previewReadOnly) return db;
  const wrapped = {
    __previewReadOnly: true,
    prepare(sql) { return wrapStatement(db.prepare(sql), isWriteSql(sql)); },
    async batch(stmts) {
      const list = stmts || [];
      if (list.every(s => !s.__write)) return db.batch(list.map(s => s.__inner || s));
      return Promise.all(list.map(s => s.__write ? fakeRun() : (s.__inner || s).all()));
    },
    async exec(sql) {
      const parts = String(sql || "").split(";").map(x => x.trim()).filter(Boolean);
      if (parts.some(isWriteSql)) return { count: 0, duration: 0 };
      return db.exec(sql);
    },
    async dump() { return db.dump(); }
  };
  if (typeof db.withSession === "function") wrapped.withSession = (...a) => readOnlyD1(db.withSession(...a));
  return wrapped;
}

export function readOnlyR2(bucket) {
  if (!bucket || bucket.__previewReadOnly) return bucket;
  return {
    __previewReadOnly: true,
    get: (...a) => bucket.get(...a),
    head: (...a) => bucket.head(...a),
    list: (...a) => bucket.list(...a),
    async put() { return null; },
    async delete() { return undefined; },
    async createMultipartUpload() { throw new Error("preview is read-only"); },
    resumeMultipartUpload() { throw new Error("preview is read-only"); }
  };
}

const noQueue = { __previewReadOnly: true, async send() {}, async sendBatch() {} };

const R2_BINDINGS = ["ARCHIVE"];
const QUEUE_BINDINGS = ["SERVICE_USAGE_QUEUE", "LOAD_TEST_QUEUE", "SYSTEM_EVENT_QUEUE"];
const cache = new WeakMap();

export function previewReadOnlyEnv(env) {
  if (!env || typeof env !== "object" || env.__previewReadOnly) return env;
  if (cache.has(env)) return cache.get(env);
  const out = { ...env, __previewReadOnly: true };
  if (env.DB) out.DB = readOnlyD1(env.DB);
  for (const k of R2_BINDINGS) if (env[k]) out[k] = readOnlyR2(env[k]);
  for (const k of QUEUE_BINDINGS) if (env[k]) out[k] = noQueue;
  cache.set(env, out);
  return out;
}

// 外部への fetch を止める（同じ Worker の静的ファイルは env.ASSETS 経由なので影響しない）。
export function installPreviewFetchGuard(scope = globalThis) {
  if (scope.__eePreviewFetchGuard) return;
  const original = scope.fetch;
  scope.__eePreviewFetchGuard = true;
  scope.fetch = async (input) => {
    let host = "";
    try { host = new URL(typeof input === "string" ? input : input?.url || String(input)).host; } catch {}
    return new Response(JSON.stringify({ ok: false, error: "PREVIEW_READ_ONLY", host }), { status: 503, headers: { "content-type": "application/json" } });
  };
  scope.__eePreviewOriginalFetch = original;
}
