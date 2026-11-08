// SNS投稿セット：実データだけで作る、KvKは予想しない、power_rank を使わない、検索に載せない、オーナー画面、R2のキー、毎週の自動実行。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadSocialPack, socialWeekOf, closeKvkPairs, socialCaptions, renderSocialCard, renderSocialCover, renderSocialOwnerPage, isSocialMediaKey, SOCIAL_PLATFORMS, SOCIAL_MIN_ROWS } from "../src/social-pack.js";
import { renderRobotsTxt } from "../src/public-pages.js";

const NOW = Date.parse("2026-11-08T12:00:00+09:00"); // 日曜
const stats = [[1085, 29.4e9, 405, 168e9], [14, 27.9e9, 608, 190e9], [232, 25.9e9, 545, 202e9], [2550, 5.1e9, 40, 40e9], [2551, 4e9, 30, 30e9], [2552, 3e9, 20, 20e9]];
function fakeDb() {
  const sqls = [];
  const db = { sqls, prepare: sql => { sqls.push(sql); const s = { bind: () => s, first: async () => null, run: async () => ({}), all: async () => {
    if (!/kingdom_stats_current/.test(sql)) return { results: [] };
    let rows = stats.map(([kid, g, a, p]) => ({ kid, power_gain_7d: g, age_days: a, power: p, observed_at: 1794100000 }));
    if (sql.includes("age_days BETWEEN 1 AND 180")) rows = rows.filter(r => r.age_days <= 180);
    rows.sort(sql.includes("ORDER BY power DESC") ? (a, b) => b.power - a.power : (a, b) => b.power_gain_7d - a.power_gain_7d);
    return { results: rows };
  } }; return s; } };
  return db;
}

test("週：月曜はじまり（日本時間）", () => {
  assert.equal(socialWeekOf(NOW), "2026-11-02");
  assert.equal(socialWeekOf(Date.parse("2026-11-09T00:30:00+09:00")), "2026-11-09");
});

test("ネタは実データから。戦力順位（power_rank）は使わない。3位まで並ばないネタは出さない", async () => {
  const db = fakeDb();
  const pack = await loadSocialPack({ DB: db }, { nowMs: NOW });
  assert.deepEqual(pack.items.map(i => i.id), ["gain", "power", "young"]);
  const gain = pack.items[0];
  assert.equal(gain.rows[0].label, "王国 1085");
  assert.equal(gain.rows[0].value, "+29.4B");
  assert.equal(gain.dataDate, "2026-11-08", "データの時点（日本時間）");
  assert.equal(pack.items[1].rows[0].label, "王国 232", "総戦力は power の値で並べる");
  assert.ok(db.sqls.every(s => !/power_rank/.test(s)), "power_rank は使わない（意味が未確認）");
  assert.ok(pack.items.every(i => i.rows.length >= SOCIAL_MIN_ROWS));
  const thin = { prepare: sql => { const s = { bind: () => s, all: async () => ({ results: /kingdom_stats_current/.test(sql) ? [{ kid: 1, power: 1e9, power_gain_7d: 1e8, age_days: 10, observed_at: 1 }] : [] }), first: async () => null }; return s; } };
  assert.deepEqual((await loadSocialPack({ DB: thin }, { nowMs: NOW })).items, []);
});

test("KvK：秘境の試練の記録が拮抗している組み合わせだけ（差1以内・4ステージ以上）。勝敗の予想はしない", () => {
  const pair = (a, b, w, l, e = 0) => ({ a: { kid: a }, b: { kid: b }, mystic: { wins: w, losses: l, even: e } });
  const out = closeKvkPairs([pair(1, 2, 6, 0), pair(3, 4, 3, 3), pair(5, 6, 2, 1), pair(7, 8, 1, 1, 1), pair(9, 10, 2, 2, 2), { a: { kid: 11 }, b: null }]);
  assert.deepEqual(out.map(p => p.a.kid), [3, 9], "差0・ステージ数の多い順。3ステージ以下・差2以上は出さない");
  const html = renderSocialCard({ id: "kvk", title: "KvK S23 接戦の組み合わせ", subtitle: "秘境の試練の1位記録が拮抗", rows: [{ rank: 1, label: "王国 9 vs 10", value: "2-2", sub: "6ステージ中・同点2" }] });
  assert.doesNotMatch(html, /勝利予想|勝つ|有利/);
});

test("投稿文：各SNS向け。リンクに ?ref= を付ける（どこから来たかで数えられる）", async () => {
  const pack = await loadSocialPack({ DB: fakeDb() }, { nowMs: NOW, origin: "https://eagleeye-ks.com" });
  const c = pack.items[0].captions;
  assert.deepEqual(Object.keys(c).sort(), [...SOCIAL_PLATFORMS].sort());
  assert.match(c.x, /https:\/\/eagleeye-ks\.com\/kingdoms\?ref=x/);
  assert.match(c.discord, /\?ref=discord/);
  assert.match(c.youtube.description, /\?ref=youtube/);
  assert.match(c.youtube.description, /#Shorts/);
  assert.ok(c.youtube.title.length <= 100);
  assert.match(c.tiktok, /プロフィールのリンク/);
  assert.match(c.x, /#キングショット/);
});

test("カード：縦長10位まで・正方形5位まで、検索に載せない、文字はエスケープ、外部の読み込みなし", () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ rank: i + 1, label: `王国 ${i}<b>`, value: "+1B", sub: "開設1日" }));
  const story = renderSocialCard({ title: "今週いちばん伸びた王国", subtitle: "7日間", rows }, { format: "story" });
  const square = renderSocialCard({ title: "今週いちばん伸びた王国", subtitle: "7日間", rows }, { format: "square" });
  assert.equal((story.match(/<li/g) || []).length, 10);
  assert.equal((square.match(/<li/g) || []).length, 5);
  assert.match(story, /width:1080px;height:1920px/);
  assert.match(square, /width:1080px;height:1080px/);
  assert.match(story, /<meta name="robots" content="noindex">/);
  assert.match(story, /王国 0&lt;b&gt;/);
  assert.doesNotMatch(story, /<(script|link|img)\b/);
  assert.match(renderSocialCover({ week: "2026-11-02", items: [{ title: "A", subtitle: "a" }] }), /今週のデータまとめ/);
});

test("R2のキー：social/{週}/{名前}.{png|mp4|json} だけ（フォルダをさかのぼれない）", () => {
  assert.ok(isSocialMediaKey("social/2026-11-02/gain-story.png"));
  assert.ok(isSocialMediaKey("social/2026-11-02/shorts.mp4"));
  assert.ok(!isSocialMediaKey("social/2026-11-02/../../secrets.json"));
  assert.ok(!isSocialMediaKey("history/x.json"));
  assert.ok(!isSocialMediaKey("social/latest.json"));
});

test("オーナー画面：投稿文のコピー、今週分の画像・動画だけリンク、自動投稿の結果", async () => {
  const pack = await loadSocialPack({ DB: fakeDb() }, { nowMs: NOW });
  const none = renderSocialOwnerPage(pack, null);
  assert.match(none, /画像はまだ作られていません/);
  assert.match(none, /class="copy"/);
  const old = renderSocialOwnerPage(pack, { week: "2026-10-26", files: ["shorts.mp4"] });
  assert.doesNotMatch(old, /\/owner\/social\/media\//, "先週の分は出さない");
  const html = renderSocialOwnerPage(pack, { week: "2026-11-02", files: ["shorts.mp4", "gain-story.png"], posts: { discord: { status: "投稿済み", note: "今週いちばん伸びた王国" } } });
  assert.match(html, /<video src="\/owner\/social\/media\/2026-11-02\/shorts\.mp4"/);
  assert.match(html, /href="\/owner\/social\/media\/2026-11-02\/gain-story\.png" download/);
  assert.match(html, /<td>Discord<\/td><td>投稿済み<\/td>/);
});

test("ルート：/social/ は検索に載せない（x-robots-tag・robots.txt）。オーナー画面と画像はオーナーだけ", async () => {
  const worker = (await import("../src/index.js")).default;
  const ctx = { waitUntil() {}, passThroughOnException() {} };
  const env = { DB: fakeDb() };
  const r = await worker.fetch(new Request("https://eagleeye-ks.com/social/pack.json"), env, ctx);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("x-robots-tag"), "noindex, nofollow");
  const body = await r.json();
  assert.ok(body.items.length >= 1);
  const card = await worker.fetch(new Request("https://eagleeye-ks.com/social/card/gain/story"), env, ctx);
  assert.equal(card.status, 200);
  assert.match(await card.text(), /今週いちばん伸びた王国/);
  assert.equal((await worker.fetch(new Request("https://eagleeye-ks.com/social/card/nope/story"), env, ctx)).status, 404);
  const owner = await worker.fetch(new Request("https://eagleeye-ks.com/owner/social"), env, ctx);
  assert.doesNotMatch(await owner.text(), /SNS投稿セット（/, "ログインしていない人には見せない");
  const media = await worker.fetch(new Request("https://eagleeye-ks.com/owner/social/media/2026-11-02/shorts.mp4"), env, ctx);
  assert.equal(media.status, 401);
  assert.match(renderRobotsTxt("https://eagleeye-ks.com"), /Disallow: \/social\//);
});

test("毎週の自動実行：月曜9:13（日本時間）。投稿は定期実行か手動で選んだ時だけ。鍵は Secrets から、ログに出さない", () => {
  const wf = readFileSync(new URL("../.github/workflows/social-weekly.yml", import.meta.url), "utf8");
  assert.match(wf, /cron: "13 0 \* \* 1"/);
  assert.match(wf, /if: github\.event_name == 'schedule' \|\| inputs\.post/);
  assert.match(wf, /SOCIAL_DISCORD_WEBHOOK_URL: \$\{\{ secrets\.SOCIAL_DISCORD_WEBHOOK_URL \}\}/);
  assert.match(wf, /fonts-noto-cjk ffmpeg/);
  assert.match(wf, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_R2_API_TOKEN \}\}/, "R2 だけの鍵を使う（D1 用の鍵の権限を広げない）");
  const pub = readFileSync(new URL("../scripts/social/publish.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(pub, /console\.log\([^)]*process\.env/);
  assert.match(pub, /allowed_mentions: \{ parse: \[\] \}/, "Discord で @everyone などを鳴らさない");
  const build = readFileSync(new URL("../scripts/social/build.mjs", import.meta.url), "utf8");
  assert.match(build, /anullsrc/, "BGMなし（無音トラックだけ）");
});
