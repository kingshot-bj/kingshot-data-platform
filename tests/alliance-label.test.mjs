// 同盟名が無い同盟（MightPulse に名前・タグが無い・新しい王国に多い）の表示（2026-11-18）。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { allianceLabel } from "../src/kingdom-portal.js";

test("名前・タグがあればそれ、無ければ「名前未取得の同盟（ID …）」で .0 を付けない", () => {
  assert.equal(allianceLabel({ name: "Pandora", abbr: "PAN", aid: "1.0" }), "Pandora");
  assert.equal(allianceLabel({ abbr: "PAN", aid: "1.0" }), "PAN");
  assert.equal(allianceLabel({ aid: "262900001.0", target_id: "262900001" }), "名前未取得の同盟（ID 262900001）");
  assert.equal(allianceLabel({ target_id: "262900034" }), "名前未取得の同盟（ID 262900034）");
  assert.equal(allianceLabel({}), "名前未取得の同盟");
});

test("同盟一覧・王国ページ・ランキングで ID をそのまま出さない", () => {
  const src = readFileSync(new URL("../src/kingdom-portal.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /esc\(r\.name\|\|r\.abbr\|\|r\.aid\|\|r\.target_id\)/);
  assert.doesNotMatch(src, /esc\(r\.name\|\|r\.abbr\|\|r\.target_id\)/);
  assert.match(src, /playerName=String\(player\?\(r\.nick_name\|\|r\.name\|\|r\.abbr\|\|r\.target_id\|\|""\):allianceLabel\(r\)\)/);
});
