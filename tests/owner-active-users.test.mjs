import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadActiveUsers, renderActiveUsersPage, normalizeDay, jstDay } from "../src/owner-active-users.js";

// 2026-11-17：今日ログインした人と詳細を見たい。user_daily_active（1人1日1行）と login_history を読むだけ。
test("日付：今日から90日前まで・それ以外は今日", () => {
  const now = Date.parse("2026-11-17T03:00:00Z");
  assert.equal(jstDay(now), "2026-11-17");
  assert.equal(normalizeDay("2026-11-10", now), "2026-11-10");
  for (const bad of ["2026-11-18", "2025-01-01", "x", "", "2026-11-17'--"]) assert.equal(normalizeDay(bad, now), "2026-11-17", bad);
});

test("一覧：1人1行（メインが複数でもまとめる）・新規の印・名前はエスケープ", async () => {
  const day = "2026-11-17", start = Date.parse(day + "T00:00:00+09:00") / 1000;
  const rows = [
    { user_id: "u1", name: "<b>あさ</b>", role: "BASIC", created_at: start + 100, days7: 1, logins: 1, nick_name: "asa", kid: 2398, alliance_abbr: "HNB", alliance_rank_label: "R4" },
    { user_id: "u2", name: "BJ", role: "OWNER", created_at: 1, days7: 7, logins: 0, nick_name: "BJにゃん", kid: 1524, alliance_abbr: "Pen", alliance_rank_label: "R4" },
    { user_id: "u2", name: "BJ", role: "OWNER", created_at: 1, days7: 7, logins: 0, nick_name: "サブ", kid: 1001, alliance_abbr: "", alliance_rank_label: "" }
  ];
  const binds = [];
  const db = { prepare: sql => ({ bind: (...a) => { binds.push([sql, a]); return { all: async () => ({ results: sql.includes("GROUP BY day") ? [{ day, n: 2 }] : rows }) }; } }) };
  const r = await loadActiveUsers(db, day);
  assert.equal(r.users.length, 2);
  assert.equal(r.users.find(u => u.userId === "u2").governors.length, 2);
  assert.equal(r.users.find(u => u.userId === "u1").isNew, true);
  assert.deepEqual(binds[0][1], ["2026-11-11", day, start, start + 86400, day]);
  const html = renderActiveUsersPage(r, Date.parse("2026-11-17T03:00:00Z"));
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /この日 <b>2<\/b> 人<\/span><span>うち新規 <b>1<\/b> 人/);
  assert.match(html, /&lt;b&gt;あさ&lt;\/b&gt;/);
  assert.doesNotMatch(html, /online|last_active|last_login|最終ログイン|オンライン/i, "活動情報の欄は使わない");
});

test("配線：オーナーだけ・入口とユーザー管理からのリンク", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /if \(url\.pathname === "\/owner\/users\/active"\) \{ const guard = await requireOwner\(request, env\);/);
  assert.match(src, /<a class="link" href="\/owner\/users\/active"><b>使ったユーザー<\/b>/);
  assert.doesNotMatch(readFileSync(new URL("../src/owner-active-users.js", import.meta.url), "utf8"), /last_login_at/);
});
