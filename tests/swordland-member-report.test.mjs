// R4・R5 が EagleEye を使っていない同盟は、メンバーも対戦相手を登録できる（2026-11-19）。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { currentMatchup, allianceHasOfficerUser, saveMatchup, renderSwordlandPage, resetSwordlandSchemaCache } from "../src/swordland.js";

function d1() {
  const raw = new DatabaseSync(":memory:");
  raw.exec(`CREATE TABLE users (user_id TEXT, status TEXT);
    CREATE TABLE user_player_links (user_id TEXT, governor_id TEXT, status TEXT, account_type TEXT, created_at INTEGER);
    CREATE TABLE players (governor_id TEXT, nick_name TEXT, kid INTEGER, alliance_aid TEXT, alliance_rank INTEGER);`);
  const prepare = sql => { let a = []; const st = { bind: (...x) => { a = x; return st; }, first: async () => raw.prepare(sql).get(...a) ?? null, all: async () => ({ results: raw.prepare(sql).all(...a) }), run: async () => { raw.prepare(sql).run(...a); return {}; } }; return st; };
  return { raw, prepare, batch: async list => { for (const s of list) await s.run(); return []; } };
}
function user(db, id, rank, aid = "153300205.0") {
  db.raw.exec(`INSERT INTO users VALUES ('${id}','ACTIVE'); INSERT INTO user_player_links VALUES ('${id}','g${id}','ACTIVE','MAIN',1); INSERT INTO players VALUES ('g${id}','${id}さん',1524,'${aid}',${rank});`);
}
const S = 1763341200;

test("EagleEye を使っている R4・R5 がいるかどうか（保存済みの役職・同じ同盟だけ）", async () => {
  const db = d1();
  user(db, "m1", 3);
  user(db, "o9", 5, "999.0"); // 別の同盟の R5
  assert.equal(await allianceHasOfficerUser(db, 1524, "153300205"), false);
  user(db, "o1", 4);
  assert.equal(await allianceHasOfficerUser(db, 1524, "153300205"), true);
});

test("メンバーだけの登録は「メンバーの報告」。R4・R5 が登録したらそちらを優先（人数が少なくても）", async () => {
  resetSwordlandSchemaCache();
  const db = d1();
  user(db, "m1", 3); user(db, "m2", 2); user(db, "o1", 4);
  await saveMatchup(db, { season: S, kid: 1524, aid: "153300205", userId: "m1", oppKid: 1600, oppTag: "AAA" });
  await saveMatchup(db, { season: S, kid: 1524, aid: "153300205", userId: "m2", oppKid: 1600, oppTag: "aaa" });
  let m = await currentMatchup(db, S, 1524, "153300205");
  assert.equal(m.opp_tag.toLowerCase(), "aaa");
  assert.equal(m.memberReported, true);
  assert.equal(m.count, 2);
  await saveMatchup(db, { season: S, kid: 1524, aid: "153300205", userId: "o1", oppKid: 1700, oppTag: "BBB" });
  m = await currentMatchup(db, S, 1524, "153300205");
  assert.equal(m.opp_tag, "BBB", "R4 の登録が優先");
  assert.equal(m.memberReported, false);
  assert.equal(m.disputed, false, "メンバーだけの別の登録は「分かれている」に数えない");
});

test("表示：メンバーの報告の印・メンバーが登録できるときの説明", () => {
  const ev = { kind: "showdown", label: "聖剣争奪", begin_ts: S, end_ts: S + 86400 * 2 };
  const mine = { kid: 1524, alliance_abbr: "PAN", alliance_aid: "153300205" };
  const reported = renderSwordlandPage({ state: { mine, events: [{ event: ev, matchup: { opp_kid: 1600, opp_tag: "AAA", count: 2, memberReported: true, reporters: [] } }], canRegister: false } });
  assert.match(reported, /2人が登録・メンバーの報告/);
  const member = renderSwordlandPage({ state: { mine, events: [{ event: ev, matchup: null }], canRegister: true, memberMode: true } });
  assert.match(member, /R4・R5 がいないので、メンバーも登録できます/);
  const officer = renderSwordlandPage({ state: { mine, events: [{ event: ev, matchup: null }], canRegister: true } });
  assert.doesNotMatch(officer, /メンバーも登録できます（「メンバーの報告」/);
});

test("配線：R4・R5 でなくても、同盟に R4・R5 のユーザーがいなければ登録できる（ADVANCED 以上）", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /if \(checkOfficer && !state\.canRegister && canRegisterRole\(auth\.role\) && mine\.alliance_abbr && !\(await allianceHasOfficerUser\(env\.DB, Number\(mine\.kid\), mine\.alliance_aid\)\)\)/);
  assert.match(src, /memberReported: Boolean\(m\.memberReported\)/);
});
