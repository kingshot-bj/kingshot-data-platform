// マイルストーン②：招待コード・初回ログインでの結びつけ・ADVANCEDでの達成・月（日本時間）・ランキング・配線。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonOf, isReferralCode, randomReferralCode, getOrCreateReferralCode, attributeReferral, markReferralQualified, loadMyReferrals, loadReferralRanking, resetReferralSchemaCache, INVITE_TITLES } from "../src/referrals.js";
import { evaluateMilestones } from "../src/milestones.js";

test("シーズンは日本時間の月", () => {
  assert.equal(seasonOf(Date.UTC(2026, 10, 30, 14, 59) / 1000), "2026-11"); // JST 11/30 23:59
  assert.equal(seasonOf(Date.UTC(2026, 10, 30, 15, 0) / 1000), "2026-12"); // JST 12/1 0:00
});

test("コードは8文字・紛らわしい文字なし、share などは招待コード扱いしない", () => {
  let i = 0;
  const code = randomReferralCode(() => i++ * 7);
  assert.ok(isReferralCode(code), code);
  for (const bad of ["share", "abcdefg1", "ABCDEFGH", "abcdefgh9", "", null]) assert.equal(isReferralCode(bad), false, String(bad));
});

function fakeDb() {
  const t = { codes: new Map(), refs: new Map(), roles: new Map(), names: new Map() };
  const stmt = (sql, a = []) => ({
    bind: (...x) => stmt(sql, x),
    async run() {
      if (sql.startsWith("INSERT OR IGNORE INTO referral_codes")) { if (t.codes.has(a[0]) || [...t.codes.values()].includes(a[1])) return { meta: { changes: 0 } }; t.codes.set(a[0], a[1]); return { meta: { changes: 1 } }; }
      if (sql.startsWith("INSERT OR IGNORE INTO referrals")) { if (t.refs.has(a[0])) return { meta: { changes: 0 } }; t.refs.set(a[0], { invitee_user_id: a[0], inviter_user_id: a[1], code: a[2], created_at: a[3], qualified_at: null, season: null }); return { meta: { changes: 1 } }; }
      if (sql.startsWith("UPDATE referrals SET qualified_at = ?, season = ? WHERE invitee_user_id")) { const r = t.refs.get(a[2]); if (!r || r.qualified_at != null) return { meta: { changes: 0 } }; r.qualified_at = a[0]; r.season = a[1]; return { meta: { changes: 1 } }; }
      if (sql.startsWith("UPDATE referrals SET qualified_at = ?, season = ? WHERE inviter_user_id")) { let n = 0; for (const r of t.refs.values()) if (r.inviter_user_id === a[2] && r.qualified_at == null && ["ADVANCED", "VIP", "ADMIN", "OWNER"].includes(t.roles.get(r.invitee_user_id))) { r.qualified_at = a[0]; r.season = a[1]; n++; } return { meta: { changes: n } }; }
      return { meta: { changes: 0 } };
    },
    async first() {
      if (sql.startsWith("SELECT code FROM referral_codes")) return t.codes.has(a[0]) ? { code: t.codes.get(a[0]) } : null;
      if (sql.startsWith("SELECT user_id FROM referral_codes")) { for (const [u, c] of t.codes) if (c === a[0]) return { user_id: u }; return null; }
      return null;
    },
    async all() {
      if (sql.includes("WHERE r.inviter_user_id = ?")) return { results: [...t.refs.values()].filter(r => r.inviter_user_id === a[0]).map(r => ({ ...r, nick_name: t.names.get(r.invitee_user_id) || null })) };
      if (sql.includes("WHERE r.season = ?")) {
        const m = new Map();
        for (const r of t.refs.values()) if (r.season === a[0] && r.qualified_at != null) { const x = m.get(r.inviter_user_id) || { inviter_user_id: r.inviter_user_id, n: 0, last_at: 0 }; x.n++; x.last_at = Math.max(x.last_at, r.qualified_at); m.set(r.inviter_user_id, x); }
        return { results: [...m.values()].sort((x, y) => y.n - x.n || x.last_at - y.last_at).slice(0, a[1]).map(x => ({ ...x, nick_name: t.names.get(x.inviter_user_id) || null, kid: 1524 })) };
      }
      return { results: [] };
    }
  });
  return { t, prepare: sql => stmt(sql) };
}

test("初回ログインだけ結びつく：既存ユーザー・自分のコード・知らないコードは無視", async () => {
  resetReferralSchemaCache();
  const db = fakeDb();
  const code = await getOrCreateReferralCode(db, "A", 1, () => "abcdefgh");
  assert.equal(code, "abcdefgh");
  assert.equal(await getOrCreateReferralCode(db, "A", 2, () => "zzzzzzzz"), "abcdefgh", "同じ人は同じコード");
  assert.equal((await attributeReferral(db, { inviteeUserId: "B", code, isNewUser: false })).attributed, false);
  assert.equal((await attributeReferral(db, { inviteeUserId: "A", code, isNewUser: true })).attributed, false);
  assert.equal((await attributeReferral(db, { inviteeUserId: "B", code: "zzzzzzzz", isNewUser: true })).attributed, false);
  assert.equal((await attributeReferral(db, { inviteeUserId: "B", code, isNewUser: true, now: 10 })).attributed, true);
  assert.equal((await attributeReferral(db, { inviteeUserId: "B", code, isNewUser: true, now: 11 })).attributed, false, "2回目は無し");
});

test("ADVANCEDで達成→その月に数える、昇格の呼び出し漏れも招待者の画面で拾う、名前はゲーム内の名前", async () => {
  resetReferralSchemaCache();
  const db = fakeDb();
  const code = await getOrCreateReferralCode(db, "A", 1, () => "abcdefgh");
  for (const u of ["B", "C", "D"]) await attributeReferral(db, { inviteeUserId: u, code, isNewUser: true, now: 5 });
  db.t.names.set("B", "ねこ").set("A", "怪盗BJにゃん");
  const nov = Date.UTC(2026, 10, 7) / 1000;
  assert.equal(await markReferralQualified(db, "B", nov), true);
  assert.equal(await markReferralQualified(db, "B", nov + 1), false);
  assert.equal(await markReferralQualified(db, "Z", nov), false, "招待されていない人は何もしない");
  db.t.roles.set("C", "VIP"); // 昇格処理を通らずにVIPになった
  const mine = await loadMyReferrals(db, "A", { now: nov + 100 });
  assert.equal(mine.lifetime, 2);
  assert.equal(mine.thisSeason, 2);
  assert.equal(mine.season, "2026-11");
  assert.deepEqual(mine.invitees.map(i => [i.name, i.qualified]).sort(), [["ねこ", true], [null, false], [null, true]].sort());
  const rank = await loadReferralRanking(db, "2026-11");
  assert.deepEqual(rank.map(r => [r.rank, r.name, r.count]), [[1, "怪盗BJにゃん", 2]]);
  assert.deepEqual(await loadReferralRanking(db, "2026-12"), []);
});

test("招待編の称号：1・3・5・10人", () => {
  assert.deepEqual(INVITE_TITLES.map(t => t.n), [1, 3, 5, 10]);
  const r = Object.fromEntries(evaluateMilestones({ invites: 3 }).map(i => [i.key, i]));
  assert.equal(r.invite_1.done, true);
  assert.equal(r.invite_3.done, true);
  assert.equal(r.invite_5.done, false);
  assert.equal(r.invite_5.label, "いま 3人");
});

test("配線：招待リンクのCookie、初回ログインでの結びつけ、昇格フック、API、プライバシーポリシー", () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(index, /isReferralCode\(ref\) && !url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(index, /if \(refCode && userResult\?\.isNew\) await attributeReferral/);
  assert.match(index, /return \{ status: "ACTIVE", user_id: userId, isNew: !existing \};/);
  assert.match(index, /url\.pathname === "\/api\/milestones\/invite"/);
  assert.match(index, /me: r\.user_id === String\(auth\.user_id\)/, "ランキングは user_id を出さない");
  assert.doesNotMatch(index, /ranking: await loadReferralRanking/);
  const elig = readFileSync(new URL("../src/user-eligibility.js", import.meta.url), "utf8");
  assert.equal((elig.match(/await markReferralQualified\(db, normalizedUserId, now\)\.catch/g) || []).length, 2);
  const legal = readFileSync(new URL("../src/legal-pages.js", import.meta.url), "utf8");
  assert.match(legal, /<b>招待の記録<\/b>/);
  assert.match(legal, /<code>ee_ref<\/code>/);
});
