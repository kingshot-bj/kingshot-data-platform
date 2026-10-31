import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const moduleSource = await readFile(new URL("../src/player-compare-enhancements.js", import.meta.url), "utf8");
const indexSource = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
const start = moduleSource.indexOf("String.raw`") + "String.raw`".length;
const end = moduleSource.lastIndexOf("`;");
assert.ok(start > 0 && end > start, "enhancement HTML template should be present");
const html = moduleSource.slice(start, end);
const script = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)?.[1];
assert.ok(script, "enhancement script should be present");

test("player compare enhancement script parses", () => {
  assert.doesNotThrow(() => new Function(script));
});

test("chart modes and preference persistence are present", () => {
  for (const mode of ["ring", "bar", "radar"]) assert.ok(script.includes("'" + mode + "'"));
  assert.ok(!script.includes("'number'"));
  assert.ok(!script.includes("ee-compare-numeric"));
  assert.ok(script.includes("eagleeye-player-compare-chart-v1"));
  assert.ok(script.includes("prefers-reduced-motion"));
});

test("additional ranking candidates require saved numeric scores for both players", () => {
  assert.ok(indexSource.includes("dataset.rankScore=String(score)"));
  assert.ok(script.includes("metric.dataset.rankScore"));
  assert.ok(script.includes("items.length>=2"));
  assert.ok(script.includes("eagleeye-player-compare-custom-rankings-v1"));
  assert.ok(script.includes("eagleeye-player-compare-order-v1"));
});

test("radar mode applies the agreed Mystic Trial offset scale", () => {
  assert.ok(script.includes("function renderRadar()"));
  assert.ok(script.includes("秘境の試練の比較対象5項目すべてのAPI値がそろう"));
  assert.ok(script.includes("const offsets={"));
  assert.ok(script.includes("let maxPerAxis="));
  assert.ok(script.includes("createElementNS(ns,'polygon')"));
});

test("details collapsing cannot move a wrapper into its own descendant", () => {
  assert.ok(script.includes("el.contains(panel)"));
  assert.ok(script.includes("panel.contains(el)"));
  assert.ok(!script.includes("['.panel','.power-showcase-wrap'"));
});

test("mobile chart layout keeps bars proportional and radar notice global", () => {
  assert.ok(script.includes("setProperty('width'"));
  assert.ok(script.includes("fill.style.setProperty('width'"));
  assert.ok(script.includes("function renderRadar()"));
  assert.ok(script.includes("fill.style.setProperty('width'"));
  assert.ok(script.includes("radarHost.append(svg,legend,totals)"));
  assert.ok(script.includes("view.appendChild(wrap)"));
});
test("successful compare render removes the stale loading status", () => {
  assert.ok(indexSource.includes("function render(d){box.querySelectorAll('.status').forEach(el=>el.remove());"));
});

test("remaining chart modes render every player supplied to the chart", () => {
  assert.ok(script.includes("const players=available"));
  assert.ok(script.includes("players.forEach((e,i)=>{const row"));
  assert.ok(!script.includes("}}).slice(0,2)"));
});

test("ring, bar, and custom ranking modes retain up to four players", () => {
  assert.ok(script.includes("const players=available"));
  assert.ok(script.includes("players.forEach((e,i)=>{const row"));
  assert.ok(script.includes("items.slice(0,4)"));
  assert.ok(script.includes("players.length+'人'"));
});


const compareApiStart = indexSource.indexOf("async function handlePlayerCompareApi");
const compareApiEnd = indexSource.indexOf("async function renderPlayerComparePage", compareApiStart);
const comparePageEnd = indexSource.indexOf("async function handlePlayerChangesApi", compareApiEnd);
const compareApiSource = indexSource.slice(compareApiStart, compareApiEnd);
const comparePageSource = indexSource.slice(compareApiEnd, comparePageEnd);

test("compare API uses bounded current ranking lookup and avoids ranking history scans", () => {
  assert.ok(compareApiSource.includes("FROM kingdom_ranking_current WHERE kid = ? AND board IN ("));
  assert.ok(compareApiSource.includes("target_id IN ("));
  assert.ok(compareApiSource.includes("rankTypeBoardKeys"));
  assert.ok(!compareApiSource.includes("ranking_snapshots"));
});

test("stage-encoded value_label entries are not passed to numeric custom ranking charts", () => {
  assert.ok(indexSource.includes("score.dataset.target=(entry.value.label||entry.value.score==null)?"));
  assert.ok(indexSource.includes("metric&&score!=null&&Number.isFinite(Number(score))&&!(board&&board.value_label)"));
  assert.ok(indexSource.includes("const display=board&&board.value_label?board.value_label"));
  assert.ok(indexSource.includes("const displayScore=Number.isFinite(numericScore)?numericScore:String(rawScore)"));
  assert.ok(indexSource.includes("const scoreValue = Number.isFinite(numericScore) ? numericScore : String(row.score)"));
});

test("compare API and page functions parse after ranking enrichment", () => {
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  assert.doesNotThrow(() => new AsyncFunction(compareApiSource));
  assert.doesNotThrow(() => new AsyncFunction(comparePageSource));
});

test("stored ranking values appear in desktop table and retain per-board observation time", () => {
  assert.ok(indexSource.includes("leaderboardRows.forEach(row=>{h+="));
  assert.ok(indexSource.includes("EagleEye保存 "));
  assert.ok(indexSource.includes("（王国 "));
});

test("player compare reports initialization failure instead of leaving the initial loading placeholder forever", () => {
  assert.ok(indexSource.includes("var startedAt=Date.now();var timer=setInterval"));
  assert.ok(indexSource.includes("比較画面の初期化が完了しませんでした"));
  assert.ok(indexSource.includes("比較画面のJavaScript初期化エラーを検出しました"));
  assert.ok(indexSource.includes('status.textContent.trim()==="比較データを読み込み中…"'));
});


test("comparison refresh handler emits valid quote escapes for include checks", () => {
  const refreshSnippet = indexSource.slice(indexSource.indexOf("rd.requested_include") - 120, indexSource.indexOf("rd.requested_include") + 120);
  assert.ok(refreshSnippet.includes(String.raw`requested_include||\"\").includes(\"ranks\")`));
  assert.ok(!refreshSnippet.includes(String.raw`requested_include||\\\"\\\"`));
});

test("redundant growth comparison section is removed while radar and detailed profile remain", () => {
  assert.ok(!script.includes("function buildGrowthComparison()"));
  assert.ok(!script.includes("className='ee-growth-comparison'"));
  assert.ok(script.includes("svg=document.createElementNS(ns,'svg')"));
  assert.ok(script.includes("オフセット補正後の値を使用"));
});
test("player compare automatic and manual refresh requests have finite timeouts", () => {
  assert.ok(indexSource.includes("async function fetchJsonWithTimeout(url,options,timeoutMs)"));
  assert.ok(indexSource.includes("setTimeout(()=>controller.abort(),timeoutMs||15000)"));
  assert.ok(indexSource.includes("/api/player/refresh?governor_id="));
  assert.ok(indexSource.includes("/api/player-compare?"));
  assert.ok(indexSource.includes("timeoutMs||15000"));
});

test("growth comparison is collapsed by default and radar mode renders an SVG polygon chart", () => {
  assert.ok(script.includes("document.createElement('details');panel.className='ee-build-compare'"));
  assert.ok(script.includes("title.textContent='育成要素の比較（詳細）'"));
  assert.ok(script.includes("svg=document.createElementNS(ns,'svg')"));
  assert.ok(script.includes("const poly=document.createElementNS(ns,'polygon')"));
  assert.ok(script.includes("オフセット補正後の値を使用"));
});


test("radar chart uses only offset-corrected Mystic Trial API values", () => {
  assert.ok(script.includes(".mystic-grid > .mystic-card.is-sub:not([data-ee-custom-board])"));
  assert.ok(script.includes("entry.score-offset"));
  assert.ok(script.includes("闘技場':10000"));
  assert.ok(script.includes("row.entries[player].corrected/maxPerAxis"));
});


test("radar chart uses Mystic Trial cards only and excludes general profile metrics", () => {
  assert.ok(script.includes(".mystic-grid > .mystic-card.is-sub:not([data-ee-custom-board])"));
  assert.ok(script.includes("秘境の試練のみ。各項目はオフセット補正後の値を使用"));
  assert.ok(!script.includes(".compare-player-cards .compare-player-card"));
  assert.ok(!script.includes(".compare-player-cards .compare-player-card"));
});

test("Mystic Trial radar keeps source offsets and uses the adjustable five-axis scale", () => {
  for (const offset of ["'闘技場':10000","'生命の森':20000","'水晶鉱山':30000","'知識の枢軸':40000","'溶岩要塞':50000","'輝光の塔':60000"]) {
    assert.ok(script.includes(offset), "missing offset " + offset);
  }
  assert.ok(script.includes("let maxPerAxis="));
  assert.ok(script.includes("sum+row.entries[player].corrected"));
  assert.ok(script.includes("fmt(maxPerAxis*5)"));
  assert.ok(script.includes(".mystic-grid > .mystic-card.is-sub:not([data-ee-custom-board])"));
  assert.ok(!script.includes(".compare-player-cards .compare-player-card"));
});

test("Mystic Trial radar reads rendered API値 small labels without regex escaping", () => {
  assert.ok(script.includes("smalls.find(el=>safeText(el).startsWith('API値:'))"));
  assert.ok(script.includes("slice('API値:'.length).replace(/,/g,'').trim()"));
  assert.ok(script.includes("score:raw"));
  assert.ok(!script.includes("/^API値\\\\s*"));
});


test("Mystic Trial radar baseline is adjustable and persisted locally with 1500 default", () => {
  assert.ok(script.includes("ee-mystic-radar-scale-v1"));
  assert.ok(script.includes("savedScale>=500&&savedScale<=3000"));
  assert.ok(script.includes(":1500"));
  assert.ok(script.includes("radarScale.min='500'"));
  assert.ok(script.includes("radarScale.max='3000'"));
  assert.ok(script.includes("radarScale.addEventListener('input'"));
  assert.ok(script.includes("fmt(maxPerAxis*5)"));
});


test("Mystic Trial radar uses the live adjustable baseline instead of a hard-coded 2000", () => {
  assert.ok(script.includes("let maxPerAxis="));
  assert.ok(script.includes("row.entries[player].corrected/maxPerAxis"));
  assert.ok(!script.includes("const maxPerAxis=2000"));
  assert.ok(script.includes("fmt(maxPerAxis*5)"));
});


test("Mystic Trial radar excludes Radiant Spire and uses five-axis baseline", () => {
  assert.ok(script.includes("const required=['闘技場','生命の森','水晶鉱山','知識の枢軸','溶岩要塞']"));
  assert.ok(!script.includes("const required=['闘技場','生命の森','水晶鉱山','知識の枢軸','溶岩要塞','輝光の塔']"));
  assert.ok(script.includes("fmt(maxPerAxis*5)"));
  assert.ok(!script.includes("fmt(maxPerAxis*6)"));
  assert.ok(script.includes("row.entries[player].corrected/maxPerAxis"));
});
