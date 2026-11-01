import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const page = src.slice(src.indexOf("async function renderPlayerPage(request, env)"), src.indexOf("function renderPlayerFetchingPage("));

test("a never-stored player gets an instant page that fetches in the background", () => {
  const firstVisit = page.indexOf("return renderPlayerFetchingPage(governorId);");
  assert.ok(firstVisit > 0);
  assert.ok(firstVisit < page.indexOf("await fetchPlayerThroughApiPool("), "returned before any blocking MightPulse call");
  assert.match(src, /function renderPlayerFetchingPage\(governorId\)[\s\S]*?\/api\/player\/refresh\?governor_id="\+encodeURIComponent\(gid\)\+"&include=base"/);
});

test("'詳細情報を取得' refreshes in the background instead of a blocking page load", () => {
  assert.match(src, /id="player-refresh" data-governor-id=/);
  assert.match(src, /getElementById\("player-refresh"\)[\s\S]*?e\.preventDefault\(\)[\s\S]*?\/api\/player\/refresh\?governor_id="\+encodeURIComponent\(gid\)\+"&include=base,heroes,ranks,gov_gear"/);
  assert.match(src, /最大90秒/);
});

test("independent reads on the player page run in parallel", () => {
  assert.match(page, /await Promise\.all\(\[getPlayer\(env\.DB, governorId\), getPlayerVisibilitySettings\(env\.DB\)\]\)/);
  assert.match(page, /await Promise\.all\(\[nameHistoryPromise, heroRankingsPromise, buildHistoryPromise\]\)/);
});

test("shared theme script and public status script are valid JavaScript (no broken quote escapes)", () => {
  // Inside a template literal, \" becomes a bare quote and breaks the inline script.
  const start = src.indexOf("const EAGLEEYE_THEME_SCRIPT = `");
  const theme = src.slice(start, src.indexOf("`;", start));
  assert.ok(!theme.includes('\\"'), "no escaped quote inside the theme script template");
  const role = theme.match(/roleBar\.innerHTML="([^\n]*)";/);
  assert.ok(role && !role[1].includes('"'), "role bar markup uses single quotes");
  assert.ok(!src.includes('"\\"":"&quot;"'), "status page escape map uses a single-quoted key");
});
