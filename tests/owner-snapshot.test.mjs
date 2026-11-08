// オーナー閲覧専用の鍵：鍵の照合、回数制限、Discord IDの伏せ字、秘密の項目を返さない、読むだけ、監査ログ。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readonlyTokenOk, readonlyRateLimited, resetReadonlyRate, maskDiscordId, parseSections, scrubSecrets, loadSnapshotUsers, READONLY_RATE_PER_HOUR } from "../src/owner-snapshot.js";

const TOKEN = "a".repeat(40);
const req = h => new Request("https://eagleeye-ks.com/api/owner/snapshot", { headers: h });

test("鍵：正しいBearerだけ通す。鍵が未設定・短いときは誰も使えない", () => {
  assert.equal(readonlyTokenOk(req({ authorization: "Bearer " + TOKEN }), { OWNER_READONLY_TOKEN: TOKEN }), true);
  assert.equal(readonlyTokenOk(req({ authorization: "Bearer " + TOKEN + "x" }), { OWNER_READONLY_TOKEN: TOKEN }), false);
  assert.equal(readonlyTokenOk(req({ authorization: "Bearer " + "b".repeat(40) }), { OWNER_READONLY_TOKEN: TOKEN }), false);
  assert.equal(readonlyTokenOk(req({}), { OWNER_READONLY_TOKEN: TOKEN }), false);
  assert.equal(readonlyTokenOk(req({ authorization: "Bearer short" }), { OWNER_READONLY_TOKEN: "short" }), false, "短い鍵は無効");
  assert.equal(readonlyTokenOk(req({ authorization: "Bearer " }), {}), false);
});

test("回数制限：1時間に60回まで", () => {
  resetReadonlyRate();
  const t = Date.parse("2026-11-08T01:00:00Z");
  for (let i = 0; i < READONLY_RATE_PER_HOUR; i++) assert.equal(readonlyRateLimited(t), false);
  assert.equal(readonlyRateLimited(t), true);
  assert.equal(readonlyRateLimited(t + 3600e3), false, "次の1時間はまた使える");
});

test("Discord IDの伏せ字・セクションの指定・秘密の項目を落とす（数字の項目は残す）", () => {
  assert.equal(maskDiscordId("123456789012345678"), "123************678");
  assert.equal(maskDiscordId("12345"), "*****");
  assert.equal(maskDiscordId(null), null);
  assert.deepEqual(parseSections(null), ["overview", "traffic", "growth", "users"]);
  assert.deepEqual(parseSections("all").length, 8);
  assert.deepEqual(parseSections("audit,nope,audit"), ["audit"]);
  const out = scrubSecrets({ api_key: "k", nested: { access_token: "t", clientSecret: "s", encrypted_key: "e", sessions: 5, pvPerSession: 2, keys: 30 }, list: [{ password: "p", n: 1 }] });
  assert.deepEqual(out, { nested: { sessions: 5, pvPerSession: 2, keys: 30 }, list: [{ n: 1 }] });
});

test("ユーザー一覧：Discord IDは伏せ字、列は名前で選ぶ（秘密の列を読まない）", async () => {
  let sql = "";
  const db = { prepare: s => { sql = s; return { all: async () => ({ results: [{ user_id: "u1", discord_id: "123456789012345678", username: "bj", global_name: "BJ", role: "OWNER", status: "ACTIVE", created_at: 1, last_login_at: 2, player_watch: 3, kingdom_watch: 1, linked: 1 }] }) }; } };
  const users = await loadSnapshotUsers(db);
  assert.equal(users[0].discord_id, "123************678");
  assert.doesNotMatch(sql, /SELECT \*|u\.\*|api_key|token|secret/i);
  assert.deepEqual(Object.keys(users[0]).sort(), ["created_at", "discord_id", "global_name", "kingdom_watch", "last_login_at", "linked", "player_watch", "role", "status", "user_id", "username"]);
});

test("配線：GETだけ、鍵の確認が最初、回数制限、監査ログ、返す前に秘密を落とす。書き込みの口はない", () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(index, /url\.pathname === "\/api\/owner\/snapshot"\) return await handleOwnerSnapshotApi\(request, env\)/);
  const start = index.indexOf("async function handleOwnerSnapshotApi");
  const fn = index.slice(start, index.indexOf("\n}\n", start));
  assert.ok(fn.indexOf('request.method !== "GET"') < fn.indexOf("readonlyTokenOk(request, env)"));
  assert.ok(fn.indexOf("readonlyTokenOk(request, env)") < fn.indexOf("readonlyRateLimited()"));
  assert.match(fn, /writeOwnerAuditLog\(env, \{ user_id: "readonly-token", discord_id: "readonly-token" \}, "READONLY_SNAPSHOT"/);
  assert.match(fn, /return json\(scrubSecrets\(out\)\);/);
  assert.doesNotMatch(fn, /INSERT|UPDATE|DELETE|updateUserRole|setUserStatus/i);
  assert.doesNotMatch(fn, /OWNER_READONLY_TOKEN/, "鍵の値を返したりログに出したりしない");
});

test("probe：一覧は実行者・キーを返さない。probe_id の1件だけ中身を返し、秘密は除く。形の違うIDやR2の外は読まない", async () => {
  const { loadSnapshotProbe } = await import("../src/owner-snapshot.js");
  const id = "f25b2be2-f282-46a7-aaba-3617c1a88887";
  const db = { prepare: sql => ({ all: async () => ({ results: [{ request_id: id, created_at: 1, endpoint: "/kingdoms/1524/events", status: "SUCCESS", r2_object_key: "mightpulse-probe/2026-11-01/" + id + ".json" }] }), bind: () => ({ first: async () => ({ request_id: id, endpoint: "/kingdoms/1524/events", created_at: 1, r2_object_key: "mightpulse-probe/2026-11-01/" + id + ".json" }) }) }) };
  const bucket = { get: async key => ({ text: async () => JSON.stringify({ endpoint: "/kingdoms/1524/events", user_id: "u1", actor_discord_id: "1403315983871115354", actor_label: "BJ", key_id: "k1", key_owner_user_id: "u1", response: { events: [{ name: "Swordland" }] }, api_key: "SECRET", headers: { authorization: "Bearer x" } }) }) };
  const list = await loadSnapshotProbe(db, bucket);
  assert.equal(list.runs[0].endpoint, "/kingdoms/1524/events");
  assert.equal(list.runs[0].archived, true);
  assert.equal(list.runs[0].r2_object_key, undefined);
  assert.equal(list.detail, undefined, "probe_id が無ければ中身は読まない");
  const one = await loadSnapshotProbe(db, bucket, { probeId: id });
  assert.equal(one.detail.record.response.events[0].name, "Swordland");
  assert.equal(one.detail.record.api_key, undefined);
  for (const k of ["user_id", "actor_discord_id", "actor_label", "key_id", "key_owner_user_id"]) assert.equal(one.detail.record[k], undefined, k);
  assert.equal(one.detail.record.headers.authorization, undefined);
  assert.equal((await loadSnapshotProbe(db, bucket, { probeId: "../../x" })).detail.error, "INVALID_PROBE_ID");
  const src = readFileSync(new URL("../src/owner-snapshot.js", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("export async function loadSnapshotProbe"));
  assert.doesNotMatch(fn.slice(0, fn.indexOf("FROM mightpulse_probe_runs ORDER")), /actor_discord_id|key_id|user_id/, "一覧に実行者・キーを入れない");
});
