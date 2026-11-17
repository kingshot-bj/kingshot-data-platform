import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeSceneSet, sanitizeRich, safePagePath } from "../src/social-video-scenes.js";
import { VIDEO_PRESETS } from "../src/social-video-presets.js";
import { triggerVideoRun, saveVideoSet, loadVideos, videoIdFor, renderSocialVideoPage, VIDEO_BGM } from "../src/social-video.js";
import { isSocialMediaKey } from "../src/social-pack.js";
import { loadSceneSetFile } from "../scripts/social/feature-video.mjs";

// 2026-11-16：動画（CM）の台本を EagleEye の画面で書き換えて作れるようにした。台本はそのまま撮影に使うので検証が大事。
test("台本の検証：<b>・<br> だけ通す／ページは EagleEye の中だけ", () => {
  assert.equal(sanitizeRich('領主<br>対決<b>⚔️</b><script>x</script><img src=x onerror=1>'), "領主<br>対決<b>⚔️</b>&lt;script&gt;x&lt;/script&gt;&lt;img src=x onerror=1&gt;");
  assert.equal(safePagePath("/player/compare?governor_id=1&governor_id=2"), "/player/compare?governor_id=1&governor_id=2");
  for (const bad of ["//evil.example", "https://evil.example", "javascript:alert(1)", "/api/me", "/owner/social", "/preview/login", "/a b", "", "/x\"><script>"]) assert.equal(safePagePath(bad), null, bad);
  const ok = normalizeSceneSet({ name: "my-cm", title: "t", post: "a\n{host}", scenes: [{ slide: "text", heading: "<b>見出し</b>", seconds: 3 }, { page: "/k/1524", caption: "x", seconds: 4, scroll: 99999, login: 1 }, { slide: "outro", seconds: 2 }] });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.set.scenes[1], { page: "/k/1524", caption: "x", seconds: 4, scroll: 20000, login: true });
  assert.deepEqual(ok.set.post, ["a", "{host}"]);
  assert.equal(ok.set.output, "eagleeye-my-cm.mp4");
  for (const [bad, re] of [[{ name: "Bad Name", scenes: [{ slide: "outro", seconds: 1 }] }, /名前/], [{ name: "a", scenes: [] }, /場面が1つも/], [{ name: "a", scenes: [{ slide: "evil", seconds: 1 }] }, /種類/], [{ name: "a", scenes: [{ page: "https://x", seconds: 1 }] }, /ページ/], [{ name: "a", scenes: [{ slide: "outro", seconds: 0 }] }, /秒数/], [{ name: "a", scenes: Array.from({ length: 6 }, () => ({ slide: "outro", seconds: 20 })) }, /合計/], [{ name: "a", scenes: [{ slide: "text", heading: "", seconds: 1 }] }, /見出し/]]) assert.match(normalizeSceneSet(bad).error || "", re);
});

test("ひな形：場面ファイルと同じ中身で、どれも検証を通る", () => {
  const dir = new URL("../scripts/social/scenes/", import.meta.url);
  const files = readdirSync(dir).filter(f => f.endsWith(".json"));
  assert.deepEqual(Object.keys(VIDEO_PRESETS).sort(), files.map(f => f.slice(0, -5)).sort(), "node scripts/social/sync-video-presets.mjs を実行");
  for (const f of files) {
    const json = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
    assert.deepEqual(VIDEO_PRESETS[json.name], json, f + "（node scripts/social/sync-video-presets.mjs）");
    assert.equal(normalizeSceneSet(json).ok, true, f);
  }
});

test("動画を作る：台本と保存先の名前を GitHub Actions に渡す・作成中は重ねない・鍵が無ければ未設定", async () => {
  const calls = [];
  const fetchImpl = async (url, opt = {}) => { calls.push([url, opt]); if (String(url).endsWith("/runs?per_page=5")) return new Response(JSON.stringify({ workflow_runs: [] }), { status: 200 }); return new Response(null, { status: 204 }); };
  const env = { SOCIAL_GITHUB_DISPATCH_TOKEN: "t" };
  const set = { name: "duel-x", scenes: [{ slide: "text", heading: "<b>a</b><script>", seconds: 2 }] };
  const now = Date.UTC(2026, 10, 16, 6, 30, 5); // 日本時間 15:30:05
  const r = await triggerVideoRun(env, set, { fetchImpl, nowMs: now });
  assert.deepEqual(r, { ok: true, videoId: "20261116-153005-duel-x" });
  const [url, opt] = calls.at(-1);
  assert.match(url, /\/actions\/workflows\/feature-video\.yml\/dispatches$/);
  const inputs = JSON.parse(opt.body).inputs;
  assert.equal(inputs.video_id, "20261116-153005-duel-x");
  assert.equal(inputs.bgm, VIDEO_BGM);
  assert.equal(JSON.parse(inputs.scenes_json).scenes[0].heading, "<b>a</b>&lt;script&gt;", "検証済みの台本を渡す");
  assert.equal((await triggerVideoRun(env, set, { fetchImpl, bgm: false })).ok, true);
  assert.equal(JSON.parse(calls.at(-1)[1].body).inputs.bgm, "");
  assert.equal((await triggerVideoRun({}, set, { fetchImpl })).error, "NOT_CONFIGURED");
  assert.equal((await triggerVideoRun(env, { name: "x", scenes: [] }, { fetchImpl })).error, "INVALID_SCENES");
  const busy = async url => String(url).endsWith("/runs?per_page=5") ? new Response(JSON.stringify({ workflow_runs: [{ status: "in_progress" }] }), { status: 200 }) : new Response(null, { status: 204 });
  assert.equal((await triggerVideoRun(env, set, { fetchImpl: busy })).error, "ALREADY_RUNNING");
  assert.equal(videoIdFor("a", now), "20261116-153005-a");
});

test("台本の保存（R2）：ひな形の名前は使えない／できた動画を新しい順に", async () => {
  const store = new Map();
  const bucket = { put: async (k, v) => store.set(k, v), get: async k => store.has(k) ? { text: async () => String(store.get(k)), json: async () => JSON.parse(store.get(k)) } : null, list: async ({ prefix }) => ({ objects: [...store.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }), delete: async k => store.delete(k) };
  assert.match((await saveVideoSet(bucket, { name: "governor-duel", scenes: [{ slide: "outro", seconds: 1 }] })).error, /ひな形/);
  assert.equal((await saveVideoSet(bucket, { name: "mine", scenes: [{ slide: "outro", seconds: 1 }] })).ok, true);
  assert.ok(store.has("social/videos/scenes/mine.json"));
  store.set("social/videos/out/20261116-100000-a/video.mp4", "v");
  store.set("social/videos/out/20261116-100000-a/caption.txt", "cap A");
  store.set("social/videos/out/20261117-090000-b/video.mp4", "v");
  store.set("social/videos/out/../evil/video.mp4", "x");
  const vids = await loadVideos(bucket);
  assert.deepEqual(vids.map(v => [v.id, v.name, v.caption]), [["20261117-090000-b", "b", ""], ["20261116-100000-a", "a", "cap A"]]);
});

test("動画の配信：作った動画のキーだけ通す・iPhone 用に部分読み込みに対応", () => {
  assert.equal(isSocialMediaKey("social/videos/out/20261116-153005-duel-x/video.mp4"), true);
  assert.equal(isSocialMediaKey("social/videos/out/20261116-153005-duel-x/caption.txt"), true);
  for (const bad of ["social/videos/scenes/a.json", "social/videos/out/../x/video.mp4", "social/videos/out/20261116-153005-a/other.mp4"]) assert.equal(isSocialMediaKey(bad), false, bad);
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /const obj = await env\.ARCHIVE\.get\(key, range \? \{ range \} : undefined\);/);
  assert.match(src, /"accept-ranges": "bytes"/);
  assert.match(src, /return new Response\(obj\.body, \{ status: 206, headers: h \}\)/);
  const fn = src.slice(src.indexOf("function parseByteRange"), src.indexOf("async function getAuthenticatedUser"));
  const parse = new Function(fn + "; return parseByteRange;")();
  assert.deepEqual(parse("bytes=0-1"), { offset: 0, length: 2 });
  assert.deepEqual(parse("bytes=100-"), { offset: 100 });
  assert.deepEqual(parse("bytes=-500"), { suffix: 500 });
  assert.equal(parse("bytes=-"), null);
  assert.equal(parse("items=0-1"), null);
});

test("画面：noindex・台本の文字でタグを閉じさせない・オーナーだけ", () => {
  const html = renderSocialVideoPage({ saved: [{ name: "x", title: "</script><script>alert(1)</script>", post: [], scenes: [{ slide: "outro", seconds: 1 }] }], videos: [] });
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(html, /<\/script><script>alert/);
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /url\.pathname === "\/owner\/social\/video" \|\| url\.pathname\.startsWith\("\/owner\/social\/video\/"\)\) \{\n        const guard = await requireOwner\(request, env\);/);
  assert.match(src, /if \(!isSameOriginRequest\(request\)\) return json\(\{ ok: false, error: "ORIGIN_NOT_ALLOWED" \}, 403\);\n        const body = await request\.json\(\)/);
});

test("Actions：台本は環境変数からファイルへ・保存先の名前を確かめてから R2 へ", () => {
  const wf = readFileSync(new URL("../.github/workflows/feature-video.yml", import.meta.url), "utf8");
  assert.match(wf, /SCENES_JSON: \$\{\{ inputs\.scenes_json \}\}/);
  assert.match(wf, /printf '%s' "\$SCENES_JSON" > "\$RUNNER_TEMP\/scenes\.json"/);
  assert.match(wf, /grep -Eq '\^\[0-9\]\{8\}-\[0-9\]\{6\}-\[a-z0-9\]\[a-z0-9-\]\{0,39\}\$'/);
  assert.match(wf, /eagleeye-archive\/social\/videos\/out\/\$VIDEO_ID\/video\.mp4/);
  // スクリプト側でも検証する
  const dir = mkdtempSync(join(tmpdir(), "scenes-"));
  writeFileSync(join(dir, "bad.json"), JSON.stringify({ name: "a", scenes: [{ page: "https://evil", seconds: 1 }] }));
  assert.throws(() => loadSceneSetFile(join(dir, "bad.json")), /台本が正しくありません/);
  writeFileSync(join(dir, "ok.json"), JSON.stringify({ name: "a", scenes: [{ slide: "text", heading: "<i>x</i>", seconds: 1 }] }));
  assert.equal(loadSceneSetFile(join(dir, "ok.json")).scenes[0].heading, "&lt;i&gt;x&lt;/i&gt;");
});

test("着せ替え：台本全体と場面ごとに指定できる・知らない名前は外す・文字の画面も着せ替えの色", async () => {
  const r = normalizeSceneSet({ name: "s", skin: "gold", scenes: [{ page: "/", caption: "", seconds: 2, skin: "wine" }, { slide: "outro", seconds: 1, skin: "evil\"><x" }, { slide: "text", heading: "a", seconds: 1, skin: "sakura" }] });
  assert.equal(r.set.skin, "gold");
  assert.equal(r.set.scenes[0].skin, "wine");
  assert.equal(r.set.scenes[1].skin, undefined);
  assert.equal(r.set.scenes[2].skin, "sakura");
  assert.equal(normalizeSceneSet({ name: "s", skin: "nope", scenes: [{ slide: "outro", seconds: 1 }] }).set.skin, undefined);
  const { slideSkinCss } = await import("../scripts/social/feature-video.mjs");
  assert.match(slideSkinCss("sakura"), /^body\{background:radial-gradient\(120% 60% at 50% 0%,#[0-9a-f]{6}40/i);
  assert.equal(slideSkinCss("navy"), "", "標準はそのまま");
  assert.equal(slideSkinCss("nope"), "");
  const src = readFileSync(new URL("../scripts/social/feature-video.mjs", import.meta.url), "utf8");
  assert.match(src, /const skin = sc\.skin \|\| set\.skin \|\| "";/);
  assert.match(src, /localStorage\.setItem\("eagleeye-skin", v\)/);
  const html = renderSocialVideoPage({});
  assert.match(html, /<select id="f-skin"><\/select>/);
  assert.match(html, /"skins":\[\["navy","ネイビー"\]/);
});

test("撮影用：作業用の鍵が付いているときだけ、ホームはログイン後の画面（Cookie が無くても）", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("async function renderHome("), src.indexOf("if (!session) {", src.indexOf("async function renderHome(")));
  assert.match(fn, /const agent = !cookieSession \? agentTokenState\(request, env\) : undefined;/);
  assert.match(fn, /const auth = cookieSession \? await getAuthenticatedUser\(request, env\) : \(agent \|\| null\);/);
  assert.match(src, /if \(url\.pathname === "\/"\) return eagleEyeHtmlResponse\(await renderHome\(request, env\)\);/, "ホームは共有キャッシュに載せない");
  assert.ok(VIDEO_PRESETS.skins.scenes.filter(s => s.page === "/").every(s => s.login === true && s.skin));
});

test("画面の色：これからはライトが標準・台本で dark も・着せ替え紹介は dark", async () => {
  const { videoMode } = await import("../scripts/social/feature-video.mjs");
  assert.equal(videoMode({}), "light");
  assert.equal(videoMode({ mode: "dark" }), "dark");
  assert.equal(videoMode({ mode: "evil" }), "light");
  assert.equal(normalizeSceneSet({ name: "a", mode: "dark", scenes: [{ slide: "outro", seconds: 1 }] }).set.mode, "dark");
  assert.equal(normalizeSceneSet({ name: "a", mode: "<x>", scenes: [{ slide: "outro", seconds: 1 }] }).set.mode, undefined);
  assert.equal(VIDEO_PRESETS.skins.mode, "dark", "着せ替えはダークのときだけ効く");
  assert.match(renderSocialVideoPage({}), /<select id="f-mode"><option value="light">ライト（標準）<\/option>/);
});

test("動画のプレイヤー比較は me=0（撮影の鍵の領主を自動で入れない）", () => {
  for (const set of Object.values(VIDEO_PRESETS)) for (const sc of set.scenes) if (String(sc.page || "").startsWith("/player/compare")) assert.match(sc.page, /[?&]me=0(&|$)/, set.name);
});
