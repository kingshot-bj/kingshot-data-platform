import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cloudflareUsageLabel } from "../src/cloudflare-analytics.js";

// 2026-11-16：$5枠で D1 の読み取りが今月の込み枠を超えただけで「障害が発生しています」と出ていた（12件すべて正常なのに）。
test("込み枠の超過：$5枠では「障害」にせず「込み枠超過（従量課金）」、Free枠は従来どおり", () => {
  assert.deepEqual(cloudflareUsageLabel("EXHAUSTED", { paid: true }), { label: "込み枠超過（従量課金）", tone: "warn", icon: "!" });
  assert.equal(cloudflareUsageLabel("CRITICAL", { paid: true }).tone, "warn");
  assert.equal(cloudflareUsageLabel("EXHAUSTED").label, "上限到達");
  assert.equal(cloudflareUsageLabel("EXHAUSTED").tone, "bad");
  assert.equal(cloudflareUsageLabel("OK", { paid: true }).label, "正常");
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /const usageCritical = usageOver && !paidProfile;/);
  assert.match(src, /label:"正常に稼働中（込み枠を超過）"/);
  assert.match(src, /const usageLabel = cloudflareUsageLabel\(usage\.status, \{ paid: paidProfile \}\);/);
});
