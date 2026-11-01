import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("optional items are not reported as 未設定 on the status page", async () => {
  const index = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
  assert.ok(index.includes('["Worker Version Tag", workerVersion?.tag || "タグなし（任意項目）", true],'));
  assert.ok(index.includes('["MightPulse", env.MIGHTPULSE_API_BASE_URL ? "Base URL（カスタム）" : "Base URL（既定値 api.mightpulse.com を使用）", true],'));
  const mp = await readFile(new URL("../src/mightpulse.js", import.meta.url), "utf8");
  assert.ok(mp.includes('const DEFAULT_BASE_URL = "https://api.mightpulse.com/v1";'), "the default really exists");
});
