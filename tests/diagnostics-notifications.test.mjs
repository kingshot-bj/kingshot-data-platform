// システム状況の「通知システム」：設定を確かめる処理は1つだけ。
// （以前は何も確かめずに毎回「注意」を書く仮置きの処理が残っていて、同じ秒に書かれた方しだいで「注意」と表示されていた）
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("通知システムの点検は1か所だけ。設定がそろっていれば正常、足りなければ注意", () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.equal((index.match(/due\("notifications"\)/g) || []).length, 1);
  assert.doesNotMatch(index, /NOTIFICATION_PROBE_NOT_CONFIGURED/);
  const i = index.indexOf('due("notifications")');
  const block = index.slice(i, index.indexOf("\n    }\n", i));
  assert.match(block, /const configured = Boolean\(env\.DISCORD_BOT_TOKEN && env\.DISCORD_SUPPORT_GUILD_ID && env\.DISCORD_CLIENT_ID\);/);
  assert.match(block, /status:configured \? "SUCCESS" : "WARNING"/);
});

test("想定どおりの記録（未解放ランキングのスキップ等）は、サービスの状態を「注意」にしない（一覧には残る）", async () => {
  const { getSystemDiagnostics, INFORMATIONAL_ERROR_CODES } = await import("../src/diagnostics.js");
  assert.ok(INFORMATIONAL_ERROR_CODES.has("RANKING_ENTRIES_EMPTY_SKIPPED"));
  assert.ok(INFORMATIONAL_ERROR_CODES.has("KVK_MEMBER_NOT_IN_SERVER"));
  const events = [
    { service: "ranking", status: "WARNING", error_code: "RANKING_ENTRIES_EMPTY_SKIPPED", created_at: 300 },
    { service: "ranking", status: "SUCCESS", error_code: null, created_at: 200 },
    { service: "notifications", status: "WARNING", error_code: "KVK_MEMBER_NOT_IN_SERVER", created_at: 300 },
    { service: "notifications", status: "SUCCESS", error_code: null, created_at: 100 },
    { service: "player", status: "WARNING", error_code: "SOMETHING_REAL", created_at: 300 }
  ];
  const db = { prepare: sql => ({ bind: () => ({ all: async () => ({ results: sql.includes("FROM diagnostic_events") ? events : [] }) }), all: async () => ({ results: [] }) }) };
  const d = await getSystemDiagnostics(db);
  const st = Object.fromEntries(d.services.map(s => [s.key, s.status]));
  assert.equal(st.ranking, "SUCCESS");
  assert.equal(st.notifications, "SUCCESS");
  assert.equal(st.player, "WARNING", "本当の注意はそのまま出す");
  assert.equal(d.events.length, events.length, "記録の一覧には残る");
});

test("KvKスレッドの同期は「通知システム」として記録（Discord認証ではない）。サーバーにいない人だけなら想定どおりの印", () => {
  const src = readFileSync(new URL("../src/kvk-discord.js", import.meta.url), "utf8");
  assert.match(src, /service: "notifications", feature: "kvk_threads", operation: "SYNC_KVK_THREADS"/);
  assert.match(src, /e\.where === "add_member" && Number\(e\.code\) === 50001\) \? "KVK_MEMBER_NOT_IN_SERVER"/);
  assert.doesNotMatch(src, /service: "discord", feature: "kvk_threads"/);
});

test("ホーム：ウォッチの件数はログインしている人だけ取りに行く（未ログインに401を返さない）", () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(index, /\$\{session \? "loadCounts\(\);" : ""\}/);
  assert.doesNotMatch(index, /\n  loadCounts\(\);\n/);
});
