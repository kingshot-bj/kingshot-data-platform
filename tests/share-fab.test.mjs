import test from "node:test";
import assert from "node:assert/strict";
import { pageHasShareButton, shareFabScript, SHARE_BUTTON_IDS } from "../src/share-fab.js";
import { normalizeSceneSet } from "../src/social-video-scenes.js";
import { swordlandNotifyText } from "../src/swordland-notify.js";
import { BLOCK_PATHS } from "../scripts/social/feature-video.mjs";

// 2026-11-17：共有カードを使ったのは6人だけ。ボタンが下の方で気づかれていなかった。
test("浮かぶ共有ボタン：共有ボタンがあるページだけ・4種類の画面", () => {
  assert.deepEqual([...SHARE_BUTTON_IDS], ["eeShareImg", "pshImg", "acImg", "kcmpImg"]);
  assert.equal(pageHasShareButton("<div id='kcmpShare'></div>"), true);
  assert.equal(pageHasShareButton('<div id="pshShare"></div>'), true);
  assert.equal(pageHasShareButton("<script>document.getElementById('eeShareImg')</script>"), true);
  assert.equal(pageHasShareButton("<main>王国ページ</main>"), false);
  const s = shareFabScript();
  assert.match(s, /^<script id="ee-share-fab">\(function\(\)\{var __name=function\(f\)\{return f\};/);
  assert.match(s, /IntersectionObserver/, "元のボタンが見えているときは出さない");
  assert.match(s, /eagleeye-share-hint-v1/, "案内は1回だけ");
});

test("聖剣の通知に共有の1行・動画の台本で「押す」場面・撮影中は共有を記録しない", () => {
  assert.match(swordlandNotifyText({ label: "聖剣頂上リーグ", league: true, begin_ts: 1794700800, end_ts: 1795305600 }), /「画像で共有」で同盟の Discord にそのまま貼れます📤/);
  const r = normalizeSceneSet({ name: "x", scenes: [{ page: "/player/compare", caption: "", seconds: 3, click: ["#eeShareImg", "button[onclick=evil]", ".ok-1", "#a", "#b"], afterClickMs: 99999 }] });
  assert.deepEqual(r.set.scenes[0].click, ["#eeShareImg", ".ok-1", "#a"], "#id か .class だけ・3つまで");
  assert.equal(r.set.scenes[0].afterClickMs, 10000);
  assert.ok(BLOCK_PATHS.test("/api/milestones/share"));
});
