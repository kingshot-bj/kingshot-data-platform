// 機能紹介の縦長動画（1080×1920・字幕つき）を作る。撮影から書き出しまで、人の手もClaudeも要らない。
// 使い方：node scripts/social/feature-video.mjs <出力フォルダ> [--set features] [--bgm <音楽ファイル>] [--fade 0.4]
// ・場面は scripts/social/scenes/<set>.json（ページ・字幕・秒数・スクロール量など）。順番や内容はこのファイルを直すだけ。
// ・本番サイト（EAGLEEYE_BASE、既定 https://eagleeye-ks.com）を開き、少しずつスクロールしながら1秒10枚撮って、ffmpeg でつなぐ。
// ・ログインが必要な画面は、鍵が付く環境でだけ撮れる（付かなければその場面は飛ばす）。
//   Claude の作業環境では通信の途中で自動で付く。GitHub Actions では Secrets の EAGLEEYE_VIDEO_TOKEN を EagleEye のページにだけ付ける。
// ・撮影中は「撮影の印」（X-EagleEye-Video: 1）を EagleEye のページにだけ付ける。鍵と一緒のときだけサーバーが見て、
//   裏で MightPulse（API Pool）に取りに行かない。広告・アクセス記録の通信は止める（広告の表示やPVに数えない）。
// ・オンライン状態・最終活動などの活動情報の欄は映さない。ログイン表示（右上）と、VIP以上だけのCSV出力ボタンは撮影中だけ隠す。
// ・「登録するとできること」は ADVANCED_BENEFITS（サイトのほかの画面と同じ定数）から作る。
// ・鍵の値はログ・動画・ファイルに出さない。
import { createRequire } from "node:module";
import { mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { ADVANCED_BENEFITS } from "../../src/role-upgrade.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FPS = 10;
const W = 360, H = 640, SCALE = 3; // 画面 360×640 を3倍で撮る → 1080×1920

// 撮影中に止める通信：広告・解析（表示の水増しを防ぐ）と、EagleEye のアクセス記録（PV・ログインの流れ）。
export const BLOCK_HOSTS = /(^|\.)(googlesyndication\.com|doubleclick\.net|googleadservices\.com|adservice\.google\.com|adtrafficquality\.google|fundingchoicesmessages\.google\.com|google-analytics\.com|googletagmanager\.com)$/i;
export const BLOCK_PATHS = /^\/api\/(pv|funnel-event|client-error|telemetry)(\/|$)/;

export function parseArgs(argv) {
  const opt = { out: "feature-video-out", set: "features", bgm: "", fade: 0.4 };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--set") opt.set = argv[++i];
    else if (a === "--bgm") opt.bgm = argv[++i] || "";
    else if (a === "--fade") opt.fade = Math.max(0, Math.min(1.5, Number(argv[++i]) || 0));
    else rest.push(a);
  }
  if (rest[0]) opt.out = rest[0];
  if (!/^[a-z0-9-]{1,40}$/.test(opt.set)) throw new Error("場面セットの名前が正しくありません: " + opt.set);
  return opt;
}

export function loadSceneSet(name) {
  const set = JSON.parse(readFileSync(join(HERE, "scenes", name + ".json"), "utf8"));
  if (!Array.isArray(set.scenes) || !set.scenes.length) throw new Error("場面がありません: " + name);
  for (const sc of set.scenes) {
    if (!sc.slide && !(typeof sc.page === "string" && sc.page.startsWith("/"))) throw new Error("page は / から始めてください");
    if (!(Number(sc.seconds) > 0 && Number(sc.seconds) <= 20)) throw new Error("seconds は 0〜20 秒");
  }
  return set;
}

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const SLIDE_CSS = `*{box-sizing:border-box}body{margin:0;width:${W}px;height:${H}px;overflow:hidden;font-family:"Noto Sans CJK JP","Hiragino Sans",sans-serif;color:#e8f3ff;
background:radial-gradient(120% 60% at 50% 0%,rgba(34,211,238,.25),rgba(34,211,238,0) 60%),linear-gradient(180deg,#0f2035,#060d18);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px;text-align:center}
.k{color:#22d3ee;font-weight:800;font-size:15px;letter-spacing:2px}h1{font-size:30px;line-height:1.35;margin:10px 0 14px}img{width:170px;margin:6px 0}
.box{width:100%;text-align:left;background:rgba(15,32,53,.9);border:1px solid #2a4664;border-radius:16px;padding:14px 16px;margin:8px 0;font-size:15px;line-height:1.7}
.box b{color:#fde68a}.box ol,.box ul{margin:4px 0;padding-left:1.3em}.url{font-size:24px;font-weight:900;color:#22d3ee;margin-top:8px}.s{font-size:13px;color:#91a7bf}`;

// 文字だけの画面。heading・sub は場面ファイルに書く（自分たちで書いた文なので、そのまま HTML として使う）。
export function slideHtml(sc, base) {
  const bj = base + "/assets/eagleeye/bjnyan/poses/common.webp";
  const host = esc(new URL(base).host);
  if (sc.slide === "title") return `<div class="k">キングショット</div><h1>EagleEye で<br>できること</h1><img src="${bj}" alt=""><div class="s">王国・同盟・プレイヤーのデータ（非公式ファンサービス）</div>`;
  if (sc.slide === "signup") return `<div class="k">無料登録でできること</div>
<div class="box"><ol><li>Discordでログイン</li><li>領主IDを登録（約30秒）</li><li>MightPulseのAPIキーを登録（無料・約1分）</li></ol></div>
<div class="box"><b>ADVANCEDになると</b><ul>${ADVANCED_BENEFITS.map(t => `<li>${esc(t)}</li>`).join("")}</ul></div>`;
  if (sc.slide === "text") return `<div class="k">キングショット</div><h1>${sc.heading || ""}</h1><img src="${bj}" alt=""><div class="s">${sc.sub || ""}</div>`;
  return `<img src="${bj}" alt=""><h1>今すぐ無料で</h1><div class="url">${host}</div><div class="s">「使い方」ページで全部の機能を説明しています</div>`;
}

// 撮影中だけ足す：字幕と、ログイン表示・CSV出力ボタンを隠すCSS。活動情報の欄も隠す。
const overlay = caption => `(() => {
  const s = document.createElement("style");
  s.textContent = ".ee-profile,.ee-login-trigger,.section-export{visibility:hidden!important}#__cap{position:fixed;left:12px;right:12px;bottom:86px;z-index:2147483647;padding:12px 14px;border-radius:14px;background:rgba(2,6,23,.82);color:#fff;font:800 19px/1.45 'Noto Sans CJK JP','Hiragino Sans',sans-serif;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.18)}#__cap b{color:#fde68a}";
  document.head.appendChild(s);
  const d = document.createElement("div"); d.id = "__cap"; d.innerHTML = ${JSON.stringify(caption || "")}; if (d.innerHTML) document.body.appendChild(d);
  for (const el of document.querySelectorAll("tr,div,li,.row")) { const t = (el.firstElementChild?.textContent || "").trim(); if (/^(オンライン|最終活動|最終ログイン)/.test(t) && el.textContent.length < 80) el.style.visibility = "hidden"; }
})()`;

// 通信の振り分け：広告・解析・アクセス記録は止める。EagleEye のページには撮影の印（と、あれば鍵）を付ける。ほかのサイトには何も付けない。
export function routeDecision(urlString, eagleHost) {
  const u = new URL(urlString);
  if (BLOCK_HOSTS.test(u.hostname)) return "block";
  if (u.host === eagleHost && BLOCK_PATHS.test(u.pathname)) return "block";
  if (u.host === eagleHost) return "eagle";
  return "pass";
}

async function record(set, opt, base) {
  const { chromium } = createRequire(import.meta.url)("playwright");
  const browser = await chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {});
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE, ignoreHTTPSErrors: true, locale: "ja-JP" });
  await ctx.addInitScript(() => { try { localStorage.setItem("eagleeye-theme", "dark"); } catch (e) {} });
  const token = process.env.EAGLEEYE_VIDEO_TOKEN || "";
  const eagleHost = new URL(base).host;
  let blocked = 0;
  await ctx.route("**/*", route => {
    const decision = routeDecision(route.request().url(), eagleHost);
    if (decision === "block") { blocked++; return route.abort(); }
    if (decision === "eagle") {
      const headers = { ...route.request().headers(), "x-eagleeye-video": "1" };
      if (token) headers.authorization = "Bearer " + token;
      return route.continue({ headers });
    }
    return route.continue();
  });
  const page = await ctx.newPage();
  const segments = [];
  for (const [idx, sc] of set.scenes.entries()) {
    const dir = join(opt.out, "frames", String(idx).padStart(2, "0"));
    mkdirSync(dir, { recursive: true });
    let n = 0;
    const snap = () => page.screenshot({ path: join(dir, String(n++).padStart(5, "0") + ".jpg"), type: "jpeg", quality: 88 });
    const count = Math.round(sc.seconds * FPS);
    if (sc.slide) {
      await page.setContent(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>${SLIDE_CSS}</style></head><body>${slideHtml(sc, base)}</body></html>`);
      await page.waitForTimeout(800);
      for (let i = 0; i < count; i++) await snap();
      segments.push({ dir, label: sc.slide, seconds: count / FPS });
      continue;
    }
    const res = await page.goto(base + sc.page, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
    await page.waitForTimeout(3000);
    if (sc.waitFor) await page.waitForSelector(sc.waitFor, { timeout: 20000 }).catch(() => {});
    for (let i = 0; i < 25 && /読み込み中|取得中です/.test(await page.textContent("body").catch(() => "")); i++) await page.waitForTimeout(1000);
    if (!res || res.status() >= 400 || (sc.login && /ログインしてください|ログインが必要/.test(await page.textContent("body").catch(() => "")))) { console.log("skip", sc.page); rmSync(dir, { recursive: true, force: true }); continue; }
    for (const sel of sc.click || []) { await page.click(sel, { timeout: 5000 }).catch(() => console.log("click failed", sel)); await page.waitForTimeout(800); }
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
    segments.push({ dir, label: sc.page, seconds: count / FPS });
  }
  await browser.close();
  return { segments, blocked };
}

// つなぎ方：場面ごとに動画にして、xfade でフェードしながらつなぐ。音は BGM（任意）か無音。
export function ffmpegConcatArgs(segFiles, seconds, { fade = 0.4, bgm = "", out }) {
  const args = ["-y"];
  for (const f of segFiles) args.push("-i", f);
  const total = seconds.reduce((a, b) => a + b, 0) - fade * Math.max(0, segFiles.length - 1);
  let filter = "", last = "[0:v]";
  if (segFiles.length > 1 && fade > 0) {
    let offset = 0;
    for (let i = 1; i < segFiles.length; i++) {
      offset += seconds[i - 1] - fade;
      const label = i === segFiles.length - 1 ? "[v]" : `[x${i}]`;
      filter += `${last}[${i}:v]xfade=transition=fade:duration=${fade}:offset=${offset.toFixed(2)}${label};`;
      last = label;
    }
  } else if (segFiles.length > 1) {
    filter += segFiles.map((_, i) => `[${i}:v]`).join("") + `concat=n=${segFiles.length}:v=1:a=0[v];`;
    last = "[v]";
  } else { filter += "[0:v]null[v];"; last = "[v]"; }
  const audioIndex = segFiles.length;
  if (bgm) {
    args.push("-stream_loop", "-1", "-i", bgm);
    filter += `[${audioIndex}:a]volume=0.35,afade=t=out:st=${Math.max(0, total - 1.5).toFixed(2)}:d=1.5[a]`;
  } else {
    args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
    filter += `[${audioIndex}:a]anull[a]`;
  }
  args.push("-filter_complex", filter, "-map", "[v]", "-map", "[a]", "-t", total.toFixed(2), "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", out);
  return { args, total };
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const set = loadSceneSet(opt.set);
  const base = (process.env.EAGLEEYE_BASE || "https://eagleeye-ks.com").replace(/\/$/, "");
  if (opt.bgm && !existsSync(opt.bgm)) throw new Error("BGMのファイルが見つかりません: " + opt.bgm);
  rmSync(opt.out, { recursive: true, force: true });
  mkdirSync(opt.out, { recursive: true });
  const started = Date.now();
  const { segments, blocked } = await record(set, opt, base);
  if (!segments.length) throw new Error("撮れた場面がありません");
  const segFiles = segments.map((s, i) => {
    const f = join(opt.out, "frames", `seg${String(i).padStart(2, "0")}.mp4`);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(s.dir, "%05d.jpg"), "-vf", "scale=1080:1920:flags=lanczos,format=yuv420p", "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", f]);
    return f;
  });
  const mp4 = join(opt.out, set.output || ("eagleeye-" + set.name + ".mp4"));
  const { args, total } = ffmpegConcatArgs(segFiles, segments.map(s => s.seconds), { fade: opt.fade, bgm: opt.bgm, out: mp4 });
  execFileSync("ffmpeg", ["-loglevel", "error", ...args]);
  const host = new URL(base).host;
  writeFileSync(join(opt.out, "caption.txt"), (set.post || []).map(l => l.replace("{host}", host)).join("\n") + "\n");
  writeFileSync(join(opt.out, "scenes.txt"), segments.map(s => s.label).join("\n") + "\n");
  rmSync(join(opt.out, "frames"), { recursive: true, force: true });
  console.log(`set=${set.name} scenes=${segments.length}/${set.scenes.length} length=${total.toFixed(1)}s blocked_requests=${blocked} bgm=${opt.bgm ? "on" : "off"} time=${Math.round((Date.now() - started) / 1000)}s → ${mp4}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(e => { console.error(e?.message || e); process.exit(1); });
