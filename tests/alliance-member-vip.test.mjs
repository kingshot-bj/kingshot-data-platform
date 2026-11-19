// 同盟メンバーの VIP（2026-11-19）：メンバー表に VIP が無いので、保存済みのプレイヤー情報から出す。ADMIN・OWNER は全員分を今取れる。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { loadMemberVips, vipSummaryHtml, extractRosterMembers } from "../src/kingdom-portal.js";

function d1() {
  const raw = new DatabaseSync(":memory:");
  raw.exec("CREATE TABLE players (governor_id TEXT PRIMARY KEY, vip INTEGER, observed_at INTEGER)");
  const prepare = sql => { let a = []; const st = { bind: (...x) => { a = x; return st; }, all: async () => ({ results: raw.prepare(sql).all(...a) }) }; return st; };
  return { raw, prepare };
}

test("保存済みの VIP をメンバーごとに読む（VIP が無い人は入れない・100人超えも分けて読む）", async () => {
  const db = d1();
  for (let i = 0; i < 120; i++) db.raw.prepare("INSERT INTO players VALUES (?, ?, ?)").run(String(1000000 + i), i % 3 === 0 ? null : 10, 100 + i);
  const map = await loadMemberVips(db, Array.from({ length: 120 }, (_, i) => String(1000000 + i)));
  assert.equal(map.size, 80);
  assert.deepEqual(map.get("1000001"), { vip: 10, at: 101 });
});

test("人数の表示と、取り直しボタンは ADMIN・OWNER（canFetch）だけ", () => {
  const members = [{ id: "1" }, { id: "2" }, { id: "3" }];
  const vips = new Map([["1", { vip: 12, at: 1763341200 }]]);
  const html = vipSummaryHtml(members, vips, { canFetch: true, kid: 1524, tag: "Pen" });
  assert.match(html, /VIP が分かるのは 3人中 1人/);
  assert.match(html, /メンバー全員の VIP を今取る（MightPulse を最大3回使います）/);
  assert.match(html, /data-tag='Pen'/);
  assert.doesNotMatch(vipSummaryHtml(members, vips, { canFetch: false }), /今取る/);
});

test("メンバー表の取り出し（いくつかの形）", () => {
  assert.equal(extractRosterMembers({ roster: [{ id: 1 }] }).length, 1);
  assert.equal(extractRosterMembers({ data: { alliance: { members: [{ id: 1 }, { id: 2 }] } } }).length, 2);
  assert.equal(extractRosterMembers({ alliance: { members: [{ id: 1 }, { id: 2 }] } }).length, 2);
});

test("配線：取り直しは ADMIN 以上・同じサイトから・メンバーは保存済みのメンバー表から・30分に1回・6時間以内に取った人は取らない", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const route = src.slice(src.indexOf('url.pathname === "/api/alliance/member-vips"'), src.indexOf('url.pathname === "/api/alliance/member-vips"') + 900);
  assert.match(route, /requireAdmin\(request, env\)/);
  assert.match(route, /isSameOriginRequest/);
  assert.match(src, /const \{ row, ids \} = await loadAllianceRosterIds\(env, kid, tag\);/);
  assert.match(src, /ALLIANCE_VIP_REFRESH_GAP_SECONDS = 30 \* 60/);
  assert.match(src, /freshSeconds = 6 \* 3600/);
  assert.match(src, /visibilityEnabled\(vipSettings, "base_vip", auth\.role\)/);
});
