// 機能紹介の縦長動画（1080×1920・字幕つき・無音トラックつき）を作る。
// 使い方：node scripts/social/feature-video.mjs <出力フォルダ>
// ・本番サイト（EAGLEEYE_BASE、既定 https://eagleeye-ks.com）を自動で開き、少しずつスクロールしながら撮影して、ffmpeg でつなぐ。
// ・ログインが必要な画面は、鍵（Authorization）が付く環境でだけ撮れる（付かなければその場面は飛ばす）。
//   Claude の作業環境では通信の途中で自動で付く。GitHub Actions では Secrets の EAGLEEYE_VIDEO_TOKEN を EagleEye のページにだけ付ける。
// ・オンライン状態・最終活動などの活動情報の欄は映さない。ログイン表示（右上）と、VIP以上だけのCSV出力ボタンは撮影中だけ隠す。
// ・「登録するとできること」は ADVANCED_BENEFITS（サイトのほかの画面と同じ定数）から作る。
import { createRequire } from "node:module";
import { mkdirSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { ADVANCED_BENEFITS } from "../../src/role-upgrade.js";
const { chromium } = createRequire(import.meta.url)("playwright");

const OUT = process.argv[2] || "feature-video-out";
const BASE = (process.env.EAGLEEYE_BASE || "https://eagleeye-ks.com").replace(/\/$/, "");
const FPS = 10;
const W = 360, H = 640, SCALE = 3; // 画面 360×640 を3倍で撮る → 1080×1920

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 場面。page：サイトの画面（scroll は下までスクロールする量px）、slide：文字だけの画面。
export const SCENES = [
  { slide: "title", seconds: 3 },
  { page: "/", caption: "キングショットの王国・プレイヤーのデータが<b>無料</b>で見られる", seconds: 4, scroll: 500 },
  { page: "/kingdom/rankings?kid=1524&board=hero_total", caption: "王国ランキング<br>戦力・英雄・秘境の試練など", seconds: 4, scroll: 700 },
  { page: "/kvk", caption: "KvKの対戦相手とスコアの推移", seconds: 4, scroll: 500 },
  { page: "/player?governor_id=222916605", caption: "<b>無料登録</b>で、英雄の装備・領主装備まで見られる", seconds: 5, scroll: 1400, login: true },
  { page: "/player/compare?governor_id=222916605&governor_id=227081160&governor_id=224984906&governor_id=228822223&governor_id=227052663&governor_id=227331459", caption: "最大6人を比較して、画像で共有", seconds: 5, scroll: 900, login: true },
  { page: "/alliance/compare?a=1524:Pen&a=1537:LOL", caption: "同盟比較で<b>聖剣争奪</b>の下見<br>秘境の試練をステージごとに", seconds: 6, scroll: 2600, login: true },
  { page: "/settings/theme", caption: "着せ替えで好きな色に", seconds: 3, scroll: 300 },
  { slide: "signup", seconds: 5 },
  { slide: "outro", seconds: 3 }
];

const SLIDE_CSS = `*{box-sizing:border-box}body{margin:0;width:${W}px;height:${H}px;overflow:hidden;font-family:"Noto Sans CJK JP","Hiragino Sans",sans-serif;color:#e8f3ff;
background:radial-gradient(120% 60% at 50% 0%,rgba(34,211,238,.25),rgba(34,211,238,0) 60%),linear-gradient(180deg,#0f2035,#060d18);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px;text-align:center}
.k{color:#22d3ee;font-weight:800;font-size:15px;letter-spacing:2px}h1{font-size:30px;line-height:1.35;margin:10px 0 14px}img{width:170px;margin:6px 0}
.box{width:100%;text-align:left;background:rgba(15,32,53,.9);border:1px solid #2a4664;border-radius:16px;padding:14px 16px;margin:8px 0;font-size:15px;line-height:1.7}
.box b{color:#fde68a}.box ol,.box ul{margin:4px 0;padding-left:1.3em}.url{font-size:24px;font-weight:900;color:#22d3ee;margin-top:8px}.s{font-size:13px;color:#91a7bf}`;

function slideHtml(kind) {
  const bj = BASE + "/assets/eagleeye/bjnyan/poses/common.webp";
  if (kind === "title") return `<div class="k">キングショット</div><h1>EagleEye で<br>できること</h1><img src="${bj}" alt=""><div class="s">王国・同盟・プレイヤーのデータ（非公式ファンサービス）</div>`;
  if (kind === "signup") return `<div class="k">無料登録でできること</div>
<div class="box"><ol><li>Discordでログイン</li><li>領主IDを登録（約30秒）</li><li>MightPulseのAPIキーを登録（無料・約1分）</li></ol></div>
<div class="box"><b>ADVANCEDになると</b><ul>${ADVANCED_BENEFITS.map(t => `<li>${esc(t)}</li>`).join("")}</ul></div>`;
  return `<img src="${bj}" alt=""><h1>今すぐ無料で</h1><div class="url">${esc(new URL(BASE).host)}</div><div class="s">「使い方」ページで全部の機能を説明しています</div>`;
}

// 撮影中だけ足す：字幕と、ログイン表示を隠すCSS。
const overlay = caption => `(() => {
  const s = document.createElement("style");
  s.textContent = ".ee-profile,.ee-login-trigger,.section-export{visibility:hidden!important}#__cap{position:fixed;left:12px;right:12px;bottom:86px;z-index:2147483647;padding:12px 14px;border-radius:14px;background:rgba(2,6,23,.82);color:#fff;font:800 19px/1.45 'Noto Sans CJK JP','Hiragino Sans',sans-serif;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.18)}#__cap b{color:#fde68a}";
  document.head.appendChild(s);
  const d = document.createElement("div"); d.id = "__cap"; d.innerHTML = ${JSON.stringify(caption)}; document.body.appendChild(d);
  // 活動情報（オンライン・最終活動）の欄は映さない
  for (const el of document.querySelectorAll("tr,div,li,.row")) { const t = (el.firstElementChild?.textContent || "").trim(); if (/^(オンライン|最終活動|最終ログイン)/.test(t) && el.textContent.length < 80) el.style.visibility = "hidden"; }
})()`;

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  const frames = join(OUT, "frames");
  mkdirSync(frames, { recursive: true });
  const browser = await chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {});
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE, ignoreHTTPSErrors: true, locale: "ja-JP" });
  await ctx.addInitScript(() => { try { localStorage.setItem("eagleeye-theme", "dark"); } catch (e) {} });
  // GitHub Actions では Secrets の鍵（EAGLEEYE_VIDEO_TOKEN）を、EagleEye のページへのリクエストにだけ付ける（ほかのサイトには送らない）。
  const token = process.env.EAGLEEYE_VIDEO_TOKEN || "";
  if (token) {
    const host = new URL(BASE).host;
    await ctx.route(u => u.host === host, route => route.continue({ headers: { ...route.request().headers(), authorization: "Bearer " + token } }));
  }
  const page = await ctx.newPage();
  let n = 0, used = [];
  const snap = async () => { await page.screenshot({ path: join(frames, String(n++).padStart(5, "0") + ".jpg"), type: "jpeg", quality: 88 }); };
  for (const sc of SCENES) {
    const count = Math.round(sc.seconds * FPS);
    if (sc.slide) {
      await page.setContent(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>${SLIDE_CSS}</style></head><body>${slideHtml(sc.slide)}</body></html>`);
      await page.waitForTimeout(800);
      for (let i = 0; i < count; i++) await snap();
      used.push(sc.slide); continue;
    }
    const res = await page.goto(BASE + sc.page, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
    await page.waitForTimeout(3500);
    // 読み込み中の表示が消えるまで待つ（最大25秒）
    for (let i = 0; i < 25 && /読み込み中|取得中です/.test(await page.textContent("body").catch(() => "")); i++) await page.waitForTimeout(1000);
    // ログインが必要な画面で中身が出ていなければ飛ばす（ログイン案内の画面を宣伝に使わない）
    if (!res || res.status() >= 400 || (sc.login && /ログインしてください|ログインが必要/.test(await page.textContent("body").catch(() => "")))) { console.log("skip", sc.page); continue; }
    await page.evaluate(overlay(sc.caption));
    const max = Math.min(sc.scroll || 0, await page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - innerHeight)));
    const hold = Math.round(count * 0.25);
    for (let i = 0; i < count; i++) {
      const t = i < hold ? 0 : (i - hold) / Math.max(1, count - hold - 1);
      const eased = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      await page.evaluate(y => window.scrollTo(0, y), Math.round(max * eased));
      await page.waitForTimeout(30);
      await snap();
    }
    used.push(sc.page);
  }
  await browser.close();
  const mp4 = join(OUT, "eagleeye-features.mp4");
  execFileSync("ffmpeg", ["-y", "-framerate", String(FPS), "-i", join(frames, "%05d.jpg"), "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-vf", "scale=1080:1920:flags=lanczos,format=yuv420p", "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-shortest", "-movflags", "+faststart", mp4], { stdio: "inherit" });
  writeFileSync(join(OUT, "caption.txt"), [
    "キングショットの王国・同盟・プレイヤーのデータが無料で見られる「EagleEye」。",
    "ランキング・KvK・プレイヤー比較・聖剣争奪の同盟比較まで。",
    new URL(BASE).host, "", "#キングショット #KingShot #聖剣争奪"
  ].join("\n") + "\n");
  console.log("scenes:", used.join(" | "));
  console.log("frames:", readdirSync(frames).length, "→", mp4);
  rmSync(frames, { recursive: true, force: true });
}

main().catch(e => { console.error(e); process.exit(1); });
