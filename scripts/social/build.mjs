// 今週のSNS投稿セットを作る（GitHub Actions で毎週実行）。
// 1. EagleEye の /social/pack.json（実データから作ったネタ・投稿文）を読む
// 2. /social/card/{id}/{story|square} と /social/cover を Chromium で撮影して PNG にする
// 3. 表紙＋各ネタの縦長画像をつないで、ショート動画（1080×1920・無音トラック付き）を ffmpeg で作る
// 4. manifest.json（週・ファイル一覧）を書く
// 使い方：node scripts/social/build.mjs <出力フォルダ>   （環境変数 EAGLEEYE_ORIGIN で取得先を変えられる）
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const OUT = process.argv[2] || "social-out";
const ORIGIN = (process.env.EAGLEEYE_ORIGIN || "https://eagleeye-ks.com").replace(/\/$/, "");
const SECONDS_PER_SLIDE = 4;
mkdirSync(OUT, { recursive: true });

const res = await fetch(ORIGIN + "/social/pack.json", { headers: { "user-agent": "EagleEyeSocialBuilder/1.0" } });
if (!res.ok) throw new Error("pack.json HTTP " + res.status);
const pack = await res.json();
if (!pack.items?.length) throw new Error("今週のネタがありません");
writeFileSync(join(OUT, "pack.json"), JSON.stringify(pack, null, 2));

const { chromium } = await import("playwright");
const browser = await chromium.launch();
const files = ["pack.json"];
async function shot(path, name, width, height) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const r = await page.goto(ORIGIN + path, { waitUntil: "networkidle" });
  if (!r || !r.ok()) throw new Error(path + " HTTP " + (r && r.status()));
  await page.screenshot({ path: join(OUT, name) });
  await page.close();
  files.push(name);
}
await shot("/social/cover", "cover.png", 1080, 1920);
for (const it of pack.items) {
  await shot(`/social/card/${it.id}/story`, `${it.id}-story.png`, 1080, 1920);
  await shot(`/social/card/${it.id}/square`, `${it.id}-square.png`, 1080, 1080);
}
await browser.close();

// ショート動画：表紙 → 各ネタ（縦長）を順に表示。BGMは付けない（著作権の心配をしない）。無音の音声トラックだけ入れる。
const slides = ["cover.png", ...pack.items.map(it => `${it.id}-story.png`)];
const list = slides.map(s => `file '${s}'\nduration ${SECONDS_PER_SLIDE}`).join("\n") + `\nfile '${slides[slides.length - 1]}'\n`;
writeFileSync(join(OUT, "slides.txt"), list);
execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", "slides.txt", "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
  "-vf", "fps=30,format=yuv420p,scale=1080:1920", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-shortest", "-movflags", "+faststart", "shorts.mp4"], { cwd: OUT, stdio: "inherit" });
files.push("shorts.mp4");

const manifest = { week: pack.week, createdAt: Math.floor(Date.now() / 1000), files, items: pack.items.map(it => ({ id: it.id, title: it.title })), posts: {} };
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("built", pack.week, files.length, "files");
