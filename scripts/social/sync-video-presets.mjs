// scripts/social/scenes/*.json を src/social-video-presets.js に写す（Worker から読めるように）。
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { normalizeSceneSet } from "../../src/social-video-scenes.js";
const dir = new URL("./scenes/", import.meta.url);
const out = {};
for (const f of readdirSync(dir).filter(f => f.endsWith(".json")).sort()) {
  const s = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
  const r = normalizeSceneSet(s);
  if (!r.ok) throw new Error(f + ": " + r.error);
  out[s.name] = s;
}
writeFileSync(new URL("../../src/social-video-presets.js", import.meta.url), "// 動画（CM）のひな形。scripts/social/scenes/*.json と同じ中身（tests/social-video.test.mjs で一致を確かめる）。\n// 場面ファイルを足したら：node scripts/social/sync-video-presets.mjs\nexport const VIDEO_PRESETS = Object.freeze(" + JSON.stringify(out, null, 1) + ");\n");
console.log(Object.keys(out).join(","));
