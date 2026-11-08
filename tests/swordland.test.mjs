// 聖剣争奪：日程は Mighty 対応のキーで1日1回、開催中だけホームに入口。登録は ADVANCED 以上で同盟の R4・R5。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractEvents, runSwordlandEventsRefresh, isOfficer, canRegisterRole, compareUrl, renderSwordlandPage, resetSwordlandSchemaCache, SWORDLAND_EVENT_NAME } from "../src/swordland.js";
import { renderRobotsTxt } from "../src/public-pages.js";

const payload = { categories: [
  { name: "Swordland Summit League", events: [{ name: "Summit Contest", begin_ts: 1793318400, end_ts: 1797292800 }] },
  { name: "Events", events: [{ name: "Swordland Showdown", begin_ts: 1792972800, end_ts: 1793577600 }, { name: "Hero Rally", begin_ts: 1792972800, end_ts: 1794182400 }, { name: "bad", begin_ts: 5, end_ts: 1 }] }
] };

test("日程：categories[].events[] から名前と期間を取り出す（終わりが始まりより前のものは捨てる）", () => {
  const e = extractEvents(payload);
  assert.deepEqual(e.map(x => x.name), ["Summit Contest", "Swordland Showdown", "Hero Rally"]);
  assert.equal(SWORDLAND_EVENT_NAME, "Swordland Showdown");
});

test("日程の取得：1時間に1回・登録ユーザーの王国・聖剣のイベントだけ保存・Mighty対応のキー", async () => {
  resetSwordlandSchemaCache();
  const writes = [], collects = [];
  const db = { batch: async () => [], prepare: sql => { const st = { bind: (...a) => { st.args = a; return st; }, run: async () => { writes.push([sql, st.args]); return {}; }, all: async () => ({ results: sql.includes("FROM user_player_links") ? [{ kid: 1524 }] : [] }), first: async () => null }; return st; } };
  const collect = async (env, opts) => { collects.push(opts); return { result: { data: payload } }; };
  const at = Date.parse("2026-11-09T01:02:00Z");
  const r = await runSwordlandEventsRefresh({ DB: db }, { nowMs: at, collect });
  assert.equal(r.kingdoms, 1);
  assert.equal(collects[0].path, "/kingdoms/1524/events");
  assert.equal(collects[0].purpose, "SWORDLAND_EVENTS");
  const saved = writes.filter(w => w[0].startsWith("INSERT INTO swordland_events")).map(w => w[1][1]);
  assert.deepEqual(saved, ["Swordland Showdown"], "聖剣以外（Summit Contest・Hero Rally）は保存しない… Summit は名前に Swordland を含まない");
  assert.equal((await runSwordlandEventsRefresh({ DB: db }, { nowMs: at + 600 * 1000, collect })).skipped, "NOT_THIS_TICK");
  const src = readFileSync(new URL("../src/swordland.js", import.meta.url), "utf8");
  assert.match(src, /import \{ collectMightyOnly \} from "\.\/data-collection-engine\.js";/);
});

test("登録できる人：ADVANCED以上、メンバー表で R4・R5", () => {
  assert.ok(canRegisterRole("ADVANCED")); assert.ok(canRegisterRole("OWNER")); assert.ok(!canRegisterRole("BASIC"));
  const members = [{ id: "1", role: 5 }, { id: "2", role: 4 }, { id: "3", role: 3 }, { id: "4", role: null }];
  assert.ok(isOfficer(members, "1")); assert.ok(isOfficer(members, "2"));
  assert.ok(!isOfficer(members, "3")); assert.ok(!isOfficer(members, "4")); assert.ok(!isOfficer(members, "9"));
  assert.equal(compareUrl(1524, "Pen", 1537, "LOL"), "/alliance/compare?a=1524%3APen&a=1537%3ALOL");
});

test("登録ページ：開催外・領主未登録・登録できる・登録できない（R3以下）で出し分ける。文字はエスケープ", () => {
  assert.match(renderSwordlandPage({ state: {} }), /開催期間ではありません/);
  const showdown = { begin_ts: 1792972800, end_ts: 1793577600 };
  assert.match(renderSwordlandPage({ state: { showdown, mine: { kid: 1524 } } }), /マイKingShotで領主を登録すると/);
  const reg = renderSwordlandPage({ state: { showdown, mine: { kid: 1524, alliance_abbr: "Pen" }, canRegister: true } });
  assert.match(reg, /<form method="post" action="\/swordland"/);
  const view = renderSwordlandPage({ state: { showdown, mine: { kid: 1524, alliance_abbr: "Pen" }, canRegister: false, canCompare: true, matchup: { opp_kid: 1537, opp_tag: "LOL<b>", count: 2, disputed: true } } });
  assert.doesNotMatch(view, /<form/);
  assert.match(view, /王国1537の LOL&lt;b&gt;<\/b>（2人が登録・登録が分かれています）/);
  assert.match(view, /R4以上の人が登録すると、こことホームに表示されます/);
});

test("配線：ホームの入口（ログイン中だけ・開催中だけ表示）、登録は同じサイトからのPOSTだけ・R4/R5を確かめる、毎時の日程取得、検索に載せない", () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(index, /\$\{session \? `<a class="ee-onboard" id="homeSword" href="\/swordland" hidden>/);
  assert.match(index, /fetch\('\/api\/swordland\/home'/);
  assert.ok(index.includes("if(!d||!d.active)return;"), "開催中でなければ出さない");
  const page = index.slice(index.indexOf("async function handleSwordlandPage("), index.indexOf("async function servePublicCached("));
  assert.match(page, /if \(!isSameOriginRequest\(request\)\) return json\(\{ ok: false, error: "ORIGIN_NOT_ALLOWED" \}, 403\);/);
  assert.match(page, /if \(!state\.canRegister\) return/);
  const st = index.slice(index.indexOf("async function loadSwordlandState("), index.indexOf("async function handleSwordlandPage("));
  assert.match(st, /state\.canRegister = Boolean\(a && !a\.error && isOfficer\(a\.members, mine\.governor_id\)\)/);
  assert.match(index, /await runSwordlandEventsRefresh\(env\);/);
  assert.match(renderRobotsTxt("https://eagleeye-ks.com"), /Disallow: \/swordland/);
});

test("メニュー：「その他」に聖剣争奪と同盟比較。開催期間外の聖剣ページから同盟比較へ", async () => {
  const { EAGLEEYE_OTHER_MENU } = await import("../src/eagleeye-ui.js");
  const keys = EAGLEEYE_OTHER_MENU.map(x => [x.key, x.href]);
  assert.ok(keys.some(([k, h]) => k === "swordland" && h === "/swordland"));
  assert.ok(keys.some(([k, h]) => k === "allianceCompare" && h === "/alliance/compare"));
  assert.match(renderSwordlandPage({ state: {} }), /href="\/alliance\/compare">⚔️ 同盟比較はいつでも使えます/);
});
