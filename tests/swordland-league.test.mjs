import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eventsToSave, extractEvents, leagueWeekStart, activeShowdown, activeSwordlandEvents, isLeagueSeason, renderOwnerMatchups, activeGovernorDuel, resetSwordlandSchemaCache, renderSwordlandPage, WEEK_SECONDS } from "../src/swordland.js";

// 2026-11-16：聖剣頂上リーグ（10/30〜12/15）が拾えずホームの聖剣カードが消えていた。実際の API の形（王国1524）。
const payload = { categories: [
  { name: "Swordland Summit League", events: [{ name: "Summit Contest", begin_ts: 1793318400, end_ts: 1797292800 }, { name: "Match Missions", begin_ts: 1793577600, end_ts: 1797206400 }] },
  { name: "Events", events: [{ name: "Governor Duel", begin_ts: 1794700800, end_ts: 1795305600 }, { name: "Hero Rally", begin_ts: 1794182400, end_ts: 1795392000 }] }
] };

test("保存するイベント：頂上リーグは分類全体の期間・領主対決・それ以外は保存しない", () => {
  assert.deepEqual(eventsToSave(extractEvents(payload)), [
    { name: "Governor Duel", begin_ts: 1794700800, end_ts: 1795305600 },
    { name: "Swordland Summit League", begin_ts: 1793318400, end_ts: 1797292800 }
  ]);
});

test("1週間の区切り：月曜 9:00（日本時間）", () => {
  const mon = Date.parse("2026-11-16T00:00:00Z") / 1000; // 11/16(月) 9:00 JST
  assert.equal(leagueWeekStart(mon), mon);
  assert.equal(leagueWeekStart(mon + 5 * 86400 + 3600), mon, "土曜でも同じ週");
  assert.equal(leagueWeekStart(mon - 1), mon - WEEK_SECONDS, "月曜 8:59 は前の週");
  assert.equal(new Date(mon * 1000).getUTCDay(), 1);
});

function fakeDb(rows) {
  return { batch: async () => [], prepare: sql => { const st = { bind: (...a) => { st.args = a; return st; }, first: async () => { const [kid, name, now] = st.args; return rows.find(r => r.kid === kid && r.name === name && r.begin_ts <= now && r.end_ts >= now) || null; } }; return st; } };
}

test("開催中：聖剣争奪があればそれ、なければ頂上リーグの今週（相手は週ごと）。領主対決も分かる", async () => {
  resetSwordlandSchemaCache();
  const at = Date.parse("2026-11-16T12:00:00Z");
  const rows = [{ kid: 1524, name: "Swordland Summit League", begin_ts: 1793318400, end_ts: 1797292800 }, { kid: 1524, name: "Governor Duel", begin_ts: 1794700800, end_ts: 1795305600 }];
  const s = await activeShowdown(fakeDb(rows), 1524, at);
  assert.equal(s.league, true);
  assert.equal(s.label, "聖剣頂上リーグ");
  assert.equal(s.begin_ts, Date.parse("2026-11-16T00:00:00Z") / 1000, "対戦相手の登録は週ごと（season＝週の始まり）");
  assert.equal(s.end_ts, s.begin_ts + WEEK_SECONDS);
  assert.equal(s.season_end_ts, 1797292800);
  const both = [...rows, { kid: 1524, name: "Swordland Showdown", begin_ts: 1794700800, end_ts: 1795305600 }];
  assert.equal((await activeShowdown(fakeDb(both), 1524, at)).label, "聖剣争奪", "1つ目は聖剣争奪");
  assert.equal(await activeShowdown(fakeDb([]), 1524, at), null);
  assert.equal((await activeGovernorDuel(fakeDb(rows), 1524, at)).name, "Governor Duel");
  const html = renderSwordlandPage({ state: { showdown: s, mine: { kid: 1524, alliance_abbr: "Pen" } } });
  assert.match(html, /<h1>⚔️ 聖剣頂上リーグ<\/h1>/);
  assert.match(html, /相手は毎週変わります/);
});

test("ホーム：見出しをイベントに合わせる・領主対決のカード", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /label: showdown\.label \|\| "聖剣争奪", league: Boolean\(showdown\.league\), duel: duelInfo/);
  assert.match(src, /var evs=\(d\.events&&d\.events\.length\)\?d\.events:\[\{label:d\.label,matchup:d\.matchup\}\];evs\.forEach\(/, "イベントごとにカード");
  assert.match(src, /<a class="ee-onboard" id="homeDuel" href="\/players" hidden><b>⚔️ 領主対決 開催中<\/b>/);
});

// 2026-11-16：聖剣争奪と頂上リーグが同時だと片方しか出なかった。
test("同時開催：両方を返す・相手の登録は別々（頂上リーグは週の始まり＋1秒）", async () => {
  resetSwordlandSchemaCache();
  const at = Date.parse("2026-11-16T12:00:00Z");
  const week = Date.parse("2026-11-16T00:00:00Z") / 1000;
  const rows = [{ kid: 1524, name: "Swordland Summit League", begin_ts: 1793318400, end_ts: 1797292800 }, { kid: 1524, name: "Swordland Showdown", begin_ts: week, end_ts: week + WEEK_SECONDS }];
  const evs = await activeSwordlandEvents(fakeDb(rows), 1524, at);
  assert.deepEqual(evs.map(e => [e.kind, e.label, e.season]), [["showdown", "聖剣争奪", week], ["league", "聖剣頂上リーグ", week + 1]]);
  assert.notEqual(evs[0].season, evs[1].season, "同じ時刻に始まっても別の回");
  assert.ok(isLeagueSeason(week + 1) && !isLeagueSeason(week));
  const html = renderSwordlandPage({ state: { events: evs.map(event => ({ event, matchup: null })), mine: { kid: 1524, alliance_abbr: "Pen" }, canRegister: true } });
  assert.match(html, /<h1>⚔️ 聖剣争奪・聖剣頂上リーグ<\/h1>/);
  assert.equal((html.match(/<input type="hidden" name="event" value="(showdown|league)">/g) || []).length, 2);
  assert.match(renderOwnerMatchups([{ season: week + 1, kid: 1524, aid: "1", abbr: "Pen", opps: [{ opp_kid: 1546, opp_tag: "MIT", count: 1 }] }]), /聖剣頂上リーグ 11\/16〜の週/);
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /const target = state\.events\.find\(e => e\.event\.kind === String\(form\?\.get\("event"\) \|\| ""\)\) \|\| state\.events\[0\];/);
  assert.match(src, /await saveMatchup\(env\.DB, \{ season: target\.event\.season,/);
});

// 2026-11-16：誰が登録したか分かるように（ゲーム内の名前・同盟の人とオーナー）。
test("登録した人：自分の同盟のページとオーナーの一覧にゲーム内の名前", async () => {
  const { REPORTER_NAME_SQL } = await import("../src/swordland.js");
  assert.match(REPORTER_NAME_SQL, /SELECT p\.nick_name FROM user_player_links l JOIN players p/);
  assert.doesNotMatch(REPORTER_NAME_SQL, /discord|username|global_name/i, "Discord の名前は出さない");
  const ev = { kind: "league", label: "聖剣頂上リーグ", league: true, begin_ts: 1794700800, end_ts: 1795305600, season_end_ts: 1797292800, season: 1794700801 };
  const html = renderSwordlandPage({ state: { events: [{ event: ev, matchup: { opp_kid: 1546, opp_tag: "MIT", count: 3, disputed: true, reporters: ["らすかる", "<b>x</b>"], other: { opp_kid: 1547, opp_tag: "ABC", count: 1, reporters: ["エリザベス"] } } }], mine: { kid: 1524, alliance_abbr: "Pen" } } });
  assert.match(html, /登録してくれた人：らすかる、&lt;b&gt;x&lt;\/b&gt; ほか/);
  assert.match(html, /ほかの登録：王国1547の ABC（1人：エリザベス）/);
  const owner = renderOwnerMatchups([{ season: 1794700801, kid: 1524, aid: "1", abbr: "Pen", opps: [{ opp_kid: 1546, opp_tag: "MIT", count: 2, reporters: ["らすかる", "BJ"] }] }]);
  assert.match(owner, /王国1546 MIT（2人：らすかる、BJ）/);
  assert.match(owner, /登録した人はゲーム内の名前/);
  const owner2 = renderOwnerMatchups([{ season: 1794700801, kid: 1524, aid: "1", abbr: "Pen", opps: [{ opp_kid: 1546, opp_tag: "MIT", count: 1, reporters: ["らすかる"], ownerNames: ["らすかる（Discord：rasu）"] }] }]);
  assert.match(owner2, /王国1546 MIT（1人：らすかる（Discord：rasu））/);
  // 同盟の人向けのページには Discord の名前を出さない
  const { currentMatchup } = await import("../src/swordland.js");
  assert.doesNotMatch(currentMatchup.toString(), /REPORTER_DISCORD_SQL/);
});
