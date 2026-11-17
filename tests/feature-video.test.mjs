// 機能紹介動画：場面ファイル・通信の振り分け・つなぎ方・サーバー側の「静かに見る」を確かめる（撮影そのものは手元／Actionsで行う）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { parseArgs, loadSceneSet, routeDecision, ffmpegConcatArgs, slideHtml } from "../scripts/social/feature-video.mjs";
import { isQuietAgentRequest } from "../src/owner-agent.js";

const src = readFileSync(new URL("../scripts/social/feature-video.mjs", import.meta.url), "utf8");

test("場面ファイル：どのセットも読める（ページは / から、秒数は20秒まで）", () => {
  const sets = readdirSync(new URL("../scripts/social/scenes/", import.meta.url)).filter(f => f.endsWith(".json")).map(f => f.slice(0, -5));
  assert.ok(sets.includes("features") && sets.includes("alliance-compare") && sets.includes("governor-duel"));
  // 場面セットを足したら、Actions の選択肢にも足す（2026-11-16 領主対決）
  const wf = readFileSync(new URL("../.github/workflows/feature-video.yml", import.meta.url), "utf8");
  for (const name of sets) assert.match(wf, new RegExp("options: \\[[^\\]]*\\b" + name + "\\b"), name);
  for (const name of sets) { const set = loadSceneSet(name); assert.equal(set.name, name); assert.ok(set.output.endsWith(".mp4")); }
  assert.deepEqual(parseArgs(["out", "--set", "alliance-compare", "--fade", "9"]), { out: "out", set: "alliance-compare", bgm: "", fade: 1.5, scenesFile: "" });
  assert.throws(() => parseArgs(["--set", "../x"]), /名前/);
});

test("通信：広告・解析・アクセス記録は止める。撮影の印と鍵は EagleEye のページにだけ付ける", () => {
  const host = "eagleeye-ks.com";
  assert.equal(routeDecision("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js", host), "block");
  assert.equal(routeDecision("https://googleads.g.doubleclick.net/pagead/ads", host), "block");
  assert.equal(routeDecision("https://ep1.adtrafficquality.google/getconfig", host), "block");
  assert.equal(routeDecision("https://eagleeye-ks.com/api/pv", host), "block");
  // アイコンは EagleEye の中継から（撮影環境でゲームの画像サーバーにつながらなくても映るように）
  assert.equal(routeDecision("https://got-global-avatar.akamaized.net/avatar/2026/07/09/EQREDv_1783592533.png", host), "avatar");
  assert.equal(routeDecision("https://got-global-avatar.akamaized.net/avatar/x.svg", host), "pass");
  assert.equal(routeDecision("https://eagleeye-ks.com/api/funnel-event", host), "block");
  assert.equal(routeDecision("https://eagleeye-ks.com/player?governor_id=1", host), "eagle");
  assert.equal(routeDecision("https://cdn.example.com/x.js", host), "pass");
  assert.match(src, /if \(decision === "eagle"\) \{\n\s+const headers = \{ \.\.\.route\.request\(\)\.headers\(\), "x-eagleeye-video": "1" \};\n\s+if \(token\) headers\.authorization = "Bearer " \+ token;/);
  assert.doesNotMatch(src, /extraHTTPHeaders/, "全リクエストに付く設定は使わない");
  assert.doesNotMatch(src, /console\.log\([^)]*token/, "鍵をログに出さない");
});

test("映さないもの：活動情報・ログイン表示・CSV出力ボタン。登録特典はサイトと同じ定数", () => {
  assert.match(src, /オンライン\|最終活動\|最終ログイン/);
  assert.match(src, /\.ee-profile,\.ee-login-trigger,\.section-export,\.ac-refresh \.note,#acPreview p,#acPreview button,#eeSharePreview p,#eeSharePreview button\{visibility:hidden!important\}#eeShareHint\{display:none!important\}/, "オーナーだけの説明・共有画像の見本の説明・案内の吹き出しも隠す（2026-11-17）");
  assert.match(slideHtml({ slide: "signup" }, "https://eagleeye-ks.com"), /ADVANCEDになると/);
});

test("つなぎ方：フェードの位置、BGMあり／なし、長さ", () => {
  const a = ffmpegConcatArgs(["a.mp4", "b.mp4", "c.mp4"], [3, 4, 5], { fade: 0.5, out: "o.mp4" });
  assert.equal(a.total, 11);
  const f = a.args[a.args.indexOf("-filter_complex") + 1];
  assert.match(f, /xfade=transition=fade:duration=0\.5:offset=2\.50\[x1\];\[x1\]\[2:v\]xfade=transition=fade:duration=0\.5:offset=6\.00\[v\]/);
  assert.match(f, /anullsrc|anull\[a\]/);
  const b = ffmpegConcatArgs(["a.mp4"], [3], { fade: 0, bgm: "music.mp3", out: "o.mp4" });
  assert.ok(b.args.includes("music.mp3") && b.args.includes("-stream_loop"));
  assert.match(b.args[b.args.indexOf("-filter_complex") + 1], /volume=0\.7,afade=t=out:st=1\.50:d=1\.5\[a\]/);
});

test("サーバー：撮影の印は Claude 用の鍵と一緒のときだけ効く（普通のユーザーには関係しない）", () => {
  const req = h => new Request("https://eagleeye-ks.com/x", { headers: h });
  assert.equal(isQuietAgentRequest(req({ "x-eagleeye-video": "1" }), { agent: true }), true);
  assert.equal(isQuietAgentRequest(req({ "x-eagleeye-video": "1" }), { user_id: "u" }), false, "普通のユーザーが印を付けても効かない");
  assert.equal(isQuietAgentRequest(req({}), { agent: true }), false);
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.equal((index.match(/if \(!observation && isQuietAgentRequest\(request, auth\)\) return json\(\{ ok: false, error: "PLAYER_NOT_STORED" \}, 404\);/g) || []).length, 2, "プレイヤー：保存済みのデータだけ");
  assert.match(index, /if \(!quiet\) await scheduleKingdomRankingFetch\(env, executionContext, found\.map\(a => a\.kid\), MYSTIC_COMPARE_BOARDS/);
  assert.match(index, /if \(auth\.agent\) return; \/\/ Claude 用の鍵は利用者ではないので、利用の記録に数えない/);
  const wf = readFileSync(new URL("../.github/workflows/feature-video.yml", import.meta.url), "utf8");
  assert.match(wf, /EAGLEEYE_VIDEO_TOKEN: \$\{\{ secrets\.EAGLEEYE_VIDEO_TOKEN \}\}/);
  assert.match(wf, /workflow_dispatch/);
});

test("BGM：既定の曲がリポジトリにある（自作・make-bgm.py で作り直せる）", async () => {
  const { existsSync } = await import("node:fs");
  const wf = readFileSync(new URL("../.github/workflows/feature-video.yml", import.meta.url), "utf8");
  const def = wf.match(/default: "(scripts\/social\/bgm\/[^"]+)"/)?.[1];
  assert.ok(def, "BGM の既定");
  assert.ok(existsSync(new URL("../" + def, import.meta.url)), def);
  assert.ok(existsSync(new URL("../scripts/social/bgm/make-bgm.py", import.meta.url)));
});
