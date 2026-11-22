// 安全のための設定が、ふつうのページ・リダイレクト・JSON のすべてに付く（2026-11-17）。
import test from "node:test";
import assert from "node:assert/strict";
import { withSecurityHeaders, SECURITY_HEADERS } from "../src/security-headers.js";

const worker = (await import("../src/index.js")).default;
const env = { EAGLEEYE_SESSION_SECRET: "x".repeat(40) };
const ctx = { waitUntil() {}, passThroughOnException() {} };

test("書き換えられない応答（リダイレクト）にも付く・既にあるものは上書きしない", () => {
  const r = withSecurityHeaders(Response.redirect("https://eagleeye-ks.com/", 302));
  assert.equal(r.status, 302);
  for (const k of Object.keys(SECURITY_HEADERS)) assert.ok(r.headers.get(k), k);
  const own = withSecurityHeaders(new Response("x", { headers: { "content-security-policy": "default-src 'none'" } }));
  assert.equal(own.headers.get("content-security-policy"), "default-src 'none'");
});

test("Worker の応答すべてに付く（他サイトへの埋め込み禁止・HTTPS 強制）", async () => {
  for (const path of ["/my-player", "/robots.txt", "/api/badges", "/tools/gold"]) {
    const res = await worker.fetch(new Request("https://eagleeye-ks.com" + path), env, ctx);
    assert.equal(res.headers.get("x-frame-options"), "SAMEORIGIN", path);
    assert.match(res.headers.get("content-security-policy") || "", /frame-ancestors 'self'/, path);
    assert.match(res.headers.get("strict-transport-security") || "", /max-age=31536000/, path);
  }
  assert.equal(typeof worker.scheduled, "function");
  assert.equal(typeof worker.queue, "function");
});
