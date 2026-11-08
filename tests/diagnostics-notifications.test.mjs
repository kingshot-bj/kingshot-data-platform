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
