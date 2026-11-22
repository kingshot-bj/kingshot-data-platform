// ADMIN・OWNER は領主IDを合わせて4件まで・使う領主の切り替え（2026-11-18）。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { saveUserPlayerLink, maxAccountsForRole, resetUserPlayerLinkSchemaCache } from "../src/user-player-link.js";
import { setActiveGovernor, getActiveGovernorId, myGovernorOrderSql, resetActiveGovernorSchemaCache } from "../src/active-governor.js";
import { MY_PLAYER_PAGE_HTML } from "../src/my-player-page.js";

function d1() {
  resetUserPlayerLinkSchemaCache();
  const raw = new DatabaseSync(":memory:");
  raw.exec("CREATE TABLE players (governor_id TEXT PRIMARY KEY, kid INTEGER)");
  for (const [g, k] of [["90000001", 1], ["90000002", 1], ["90000003", 2], ["90000004", 3], ["90000005", 4], ["90000006", 5]]) raw.prepare("INSERT INTO players VALUES (?, ?)").run(g, k);
  const prepare = sql => { let a = []; const st = { bind: (...x) => { a = x; return st; }, first: async () => raw.prepare(sql).get(...a) ?? null, all: async () => ({ results: raw.prepare(sql).all(...a) }), run: async () => { const r = raw.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; } }; return st; };
  return { raw, prepare, batch: async list => { for (const s of list) await s.run(); return []; } };
}
const save = (db, gid, type, role) => saveUserPlayerLink(db, "u1", gid, type, { maxAccounts: maxAccountsForRole(role) });

test("ADMIN・OWNER だけ4件まで。ほかの役職は今まで通り", () => {
  assert.equal(maxAccountsForRole("ADMIN"), 4);
  assert.equal(maxAccountsForRole("owner"), 4);
  assert.equal(maxAccountsForRole("VIP"), null);
  assert.equal(maxAccountsForRole("BASIC"), null);
});

test("ADMIN：4つの王国でも、同じ王国に3件以上でも、合わせて4件まで。各王国のメインは1つ", async () => {
  const db = d1();
  await save(db, "90000001", "MAIN", "ADMIN");
  await assert.rejects(save(db, "90000002", "MAIN", "ADMIN"), { code: "MAIN_ACCOUNT_ALREADY_EXISTS" });
  await save(db, "90000002", "SUB", "ADMIN");
  await save(db, "90000003", "MAIN", "ADMIN");
  await save(db, "90000004", "MAIN", "ADMIN"); // 3つ目の王国（BASIC だと2王国まで）
  await assert.rejects(save(db, "90000005", "MAIN", "ADMIN"), { code: "ACCOUNT_LIMIT_REACHED" });
});

test("BASIC は今まで通り2王国まで", async () => {
  const db = d1();
  await save(db, "90000001", "MAIN", "BASIC");
  await save(db, "90000003", "MAIN", "BASIC");
  await assert.rejects(save(db, "90000004", "MAIN", "BASIC"), { code: "KINGDOM_LIMIT_REACHED" });
});

test("切り替え：選んだ領主が「自分の領主」になる。選んでいなければメイン。登録していない領主は選べない", async () => {
  resetActiveGovernorSchemaCache();
  const db = d1();
  await save(db, "90000001", "MAIN", "ADMIN");
  await save(db, "90000003", "MAIN", "ADMIN");
  await save(db, "90000002", "SUB", "ADMIN");
  db.raw.exec("UPDATE user_player_links SET created_at = created_at - 100 WHERE governor_id = '90000001'"); // 最初に登録したメイン
  assert.equal(await getActiveGovernorId(db, "u1"), "90000001", "はじめは最初のメイン");
  await setActiveGovernor(db, "u1", "90000002");
  assert.equal(await getActiveGovernorId(db, "u1"), "90000002");
  const row = db.raw.prepare(`SELECT l.governor_id FROM user_player_links l WHERE l.user_id = 'u1' AND l.status = 'ACTIVE' ORDER BY ${myGovernorOrderSql("l")} LIMIT 1`).get();
  assert.equal(row.governor_id, "90000002", "ほかの画面と同じ並び順");
  await assert.rejects(setActiveGovernor(db, "u1", "90000006"), { code: "GOVERNOR_NOT_LINKED" });
  db.raw.exec("UPDATE user_player_links SET status = 'DISABLED' WHERE governor_id = '90000002'");
  assert.equal(await getActiveGovernorId(db, "u1"), "90000001", "選んだ領主の登録を外したらメインに戻る");
});

test("配線：切り替えの API・マイKingShot のボタン・ホームのリンク・各画面の「自分」", () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const route = index.slice(index.indexOf('url.pathname === "/api/me/active-governor"'), index.indexOf('url.pathname === "/api/me/active-governor"') + 700);
  assert.match(route, /isSameOriginRequest/);
  assert.match(route, /setActiveGovernor\(env\.DB, auth\.user_id, body\?\.governor_id\)/);
  assert.match(index, /maxAccounts: maxAccountsForRole\(auth\.role\)/);
  assert.match(index, /使う領主を切り替える/);
  assert.match(MY_PLAYER_PAGE_HTML, /fetch\("\/api\/me\/active-governor"/);
  assert.match(MY_PLAYER_PAGE_HTML, /この領主を使う/);
  assert.match(MY_PLAYER_PAGE_HTML, /使用中/);
  for (const f of ["home-summary.js", "swordland.js", "milestones.js", "kingdom-portal.js", "kvk.js"]) {
    assert.match(readFileSync(new URL("../src/" + f, import.meta.url), "utf8"), /myGovernorOrderSql\("l"/, f);
  }
  // ほかの人に見せる名前（聖剣の登録者）はメインのまま
  assert.match(readFileSync(new URL("../src/swordland.js", import.meta.url), "utf8"), /REPORTER_NAME_SQL = "\(SELECT p\.nick_name FROM user_player_links l JOIN players p ON p\.governor_id = l\.governor_id WHERE l\.user_id = m\.reporter_user_id AND l\.status = 'ACTIVE' ORDER BY CASE l\.account_type WHEN 'MAIN'/);
});
