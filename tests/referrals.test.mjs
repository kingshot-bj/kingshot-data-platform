// マイルストーン②：招待コード・初回ログインでの結びつけ・ADVANCEDでの達成・月（日本時間）・ランキング・配線。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getUserRewards, OWNER_INVITE_BONUS, INVITE_BONUS_CAP } from "../src/referrals.js";
import { seasonOf, isReferralCode, randomReferralCode, getOrCreateReferralCode, attributeReferral, markReferralQualified, loadMyReferrals, getWatchBonus, inviterNameForCode, resetReferralSchemaCache, INVITE_TITLES, INVITE_BONUS } from "../src/referrals.js";
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
  const t = { codes: new Map(), refs: new Map(), roles: new Map(), names: new Map(), bonus: new Map() };
  const stmt = (sql, a = []) => ({
    bind: (...x) => stmt(sql, x),
    async run() {
      if (sql.startsWith("INSERT OR IGNORE INTO referral_codes")) { if (t.codes.has(a[0]) || [...t.codes.values()].includes(a[1])) return { meta: { changes: 0 } }; t.codes.set(a[0], a[1]); return { meta: { changes: 1 } }; }
      if (sql.startsWith("INSERT OR IGNORE INTO referrals")) { if (t.refs.has(a[0])) return { meta: { changes: 0 } }; t.refs.set(a[0], { invitee_user_id: a[0], inviter_user_id: a[1], code: a[2], created_at: a[3], qualified_at: null, season: null }); return { meta: { changes: 1 } }; }
      if (sql.startsWith("UPDATE referrals SET qualified_at = ?, season = ? WHERE invitee_user_id")) { const r = t.refs.get(a[2]); if (!r || r.qualified_at != null) return { meta: { changes: 0 } }; r.qualified_at = a[0]; r.season = a[1]; return { meta: { changes: 1 } }; }
      if (sql.startsWith("INSERT OR IGNORE INTO user_rewards")) { t.rewards = t.rewards || new Map(); t.rewards.set(a[0] + "|" + a[1], a[2]); return { meta: { changes: 1 } }; }
      if (sql.startsWith("INSERT OR IGNORE INTO user_watch_bonus")) { const k = a[0] + "|" + a[1]; if (t.bonus.has(k)) return { meta: { changes: 0 } }; t.bonus.set(k, a[2]); return { meta: { changes: 1 } }; }
      return { meta: { changes: 0 } };
    },
    async first() {
      if (sql.startsWith("SELECT code FROM referral_codes")) return t.codes.has(a[0]) ? { code: t.codes.get(a[0]) } : null;
      if (sql.startsWith("SELECT c.user_id, u.role FROM referral_codes")) { for (const [u, c] of t.codes) if (c === a[0]) return { user_id: u, role: t.roles.get(u) || "BASIC" }; return null; }
      if (sql.startsWith("SELECT r.inviter_user_id, u.role FROM referrals")) { const r = t.refs.get(a[0]); return r ? { inviter_user_id: r.inviter_user_id, role: t.roles.get(r.inviter_user_id) || "BASIC" } : null; }
      if (sql.startsWith("SELECT reward FROM user_rewards")) return null;
      if (sql.startsWith("SELECT COALESCE(SUM(CASE")) { let n = 0, special = 0; for (const [k, v] of t.bonus) if (k.startsWith(a[0] + "|")) { if (k.slice(a[0].length + 1).startsWith("owner_")) special += v; else n += v; } return { n, special }; }
      if (sql.startsWith("SELECT c.user_id, (SELECT role")) { for (const [u, c] of t.codes) if (c === a[0]) return { user_id: u, role: t.roles.get(u) || "BASIC", nick_name: t.names.get(u) || null }; return null; }
      if (sql.startsWith("SELECT c.user_id")) { for (const [u, c] of t.codes) if (c === a[0]) return { user_id: u, nick_name: t.names.get(u) || null }; return null; }
      return null;
    },
    async all() {
      if (sql.startsWith("SELECT reward FROM user_rewards")) return { results: [...(t.rewards || new Map())].filter(([k]) => k.startsWith(a[0] + "|")).map(([k]) => ({ reward: k.split("|")[1] })) };
      if (sql.includes("r.qualified_at IS NULL AND u.role IN")) return { results: [...t.refs.values()].filter(r => r.inviter_user_id === a[0] && r.qualified_at == null && ["ADVANCED", "VIP", "ADMIN", "OWNER"].includes(t.roles.get(r.invitee_user_id))).map(r => ({ invitee_user_id: r.invitee_user_id })) };
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
  // 特典：B・CはログインとADVANCEDで +2+5、Dはログインの +2、招待したAは2人分 +5×2
  assert.equal(await getWatchBonus(db, "B"), INVITE_BONUS.invitedSignup + INVITE_BONUS.invitedAdvanced);
  assert.equal(await getWatchBonus(db, "C"), 7);
  assert.equal(await getWatchBonus(db, "D"), INVITE_BONUS.invitedSignup);
  assert.equal(await getWatchBonus(db, "A"), INVITE_BONUS.perQualifiedInvite * 2);
  assert.equal(mine.bonus, 10);
  await loadMyReferrals(db, "A", { now: nov + 200 });
  assert.equal(await getWatchBonus(db, "A"), 10, "2回目に開いても増えない");
  assert.deepEqual(await inviterNameForCode(db, code), { name: "怪盗BJにゃん", special: false });
  assert.equal(await inviterNameForCode(db, "zzzzzzzz"), null);
  assert.equal(await inviterNameForCode(db, "share"), null);
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
  assert.match(index, /url\.pathname === "\/invite"\) return eagleEyeHtmlResponse\(renderInvitePage\(\)\)/);
  assert.match(index, /url\.pathname === "\/api\/invite"\) return await handleInviteApi/);
  // 招待はマイルストーンの公開状態と関係なく、ログインした全員が使える
  const inviteApi = index.slice(index.indexOf("async function handleInviteApi"), index.indexOf("async function handleHomeSummary"));
  assert.doesNotMatch(inviteApi, /milestonesAvailableFor/);
  assert.match(index, /<a class="ee-milestone-card ee-milestone-live ee-invite-card" href="\/invite">/);
  const ui = readFileSync(new URL("../src/eagleeye-ui.js", import.meta.url), "utf8");
  assert.match(ui, /key: "invite", href: "\/invite", label: "友だち招待"/);
  assert.doesNotMatch(index, /loadReferralRanking/, "ランキングは外した");
  // ウォッチ上限：上限のあるロールにだけ招待の特典を足す（追加とPATCHの両方）
  assert.equal((index.match(/roleLimit > 0 \? roleLimit \+ await getWatchBonus\(env\.DB, auth\.user_id\) : roleLimit/g) || []).length, 2);
  // 未ログインで招待コードがあるときだけ招待者の名前を出す（ホームはno-storeなので他人に混ざらない）
  assert.match(index, /const refCode = !session \? parseCookie/);
  assert.match(index, /\$\{inviteBanner\}<a class="ee-onboard"/);
  const elig = readFileSync(new URL("../src/user-eligibility.js", import.meta.url), "utf8");
  assert.equal((elig.match(/await markReferralQualified\(db, normalizedUserId, now\)\.catch/g) || []).length, 2);
  const legal = readFileSync(new URL("../src/legal-pages.js", import.meta.url), "utf8");
  assert.match(legal, /<b>招待の記録<\/b>/);
  assert.match(legal, /<code>ee_ref<\/code>/);
});

test("招待ページ：ログイン前はログイン案内、共有ボタン、報酬は後日", async () => {
  const { renderInvitePage } = await import("../src/referrals.js");
  const html = renderInvitePage();
  assert.match(html, /<title>友だち招待 \| EagleEye<\/title>/);
  assert.match(html, /fetch\("\/api\/invite"/);
  assert.match(html, /next=%2Finvite/);
  assert.match(html, /招待の特典/);
  assert.doesNotMatch(html, /ランキング/);
});

test("運営（オーナー）の招待：特典が大きく上限の外、限定の着せ替え・バッジ、運営側には付けない", async () => {
  resetReferralSchemaCache();
  const db = fakeDb();
  db.t.roles.set("OWN", "OWNER");
  const code = await getOrCreateReferralCode(db, "OWN", 1, () => "pwnercdz");
  const r = await attributeReferral(db, { inviteeUserId: "N", code, isNewUser: true, now: 10 });
  assert.equal(r.special, true);
  assert.equal(await getWatchBonus(db, "N"), OWNER_INVITE_BONUS.invitedSignup);
  assert.deepEqual((await getUserRewards(db, "N")).sort(), ["badge_owner_invite", "theme_gold"]);
  await markReferralQualified(db, "N", 20);
  assert.equal(await getWatchBonus(db, "N"), OWNER_INVITE_BONUS.invitedSignup + OWNER_INVITE_BONUS.invitedAdvanced);
  assert.equal(await getWatchBonus(db, "OWN"), 0, "運営側には付けない");
  // 上限の外：通常の上乗せが上限いっぱいでも運営の分は足される
  for (let i = 0; i < 10; i++) db.t.bonus.set("N|x" + i, 5);
  assert.equal(await getWatchBonus(db, "N"), INVITE_BONUS_CAP + 15);
  assert.deepEqual(await inviterNameForCode(db, code), { name: null, special: true });
});

test("限定の着せ替え・特別招待の表示", async () => {
  const { EAGLEEYE_THEMES, renderThemePickerPage } = await import("../src/themes.js");
  const gold = EAGLEEYE_THEMES.find(t => t.id === "gold");
  assert.equal(gold.reward, "theme_gold");
  const html = renderThemePickerPage();
  assert.match(html, /class="skin locked" data-skin="gold" data-reward="theme_gold"/);
  assert.match(html, /fetch\("\/api\/rewards"/);
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(index, /👑 EagleEye運営からの特別招待/);
  assert.match(index, /url\.pathname === "\/api\/rewards"/);
  const page = (await import("../src/referrals.js")).renderInvitePage();
  assert.match(page, /運営の特別招待リンクです/);
});
