// 今週のSNS投稿セットを各SNSへ投稿する（GitHub Actions で build.mjs の後に実行）。
// 鍵は GitHub の Secrets から環境変数で受け取る。鍵がないSNSは「未設定」として飛ばす（失敗にしない）。
// 鍵の値はログに出さない。結果は manifest.json の posts に書く（オーナー画面に表示）。
// 使い方：node scripts/social/publish.mjs <出力フォルダ>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] || "social-out";
const pack = JSON.parse(readFileSync(join(OUT, "pack.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(OUT, "manifest.json"), "utf8"));
const posts = manifest.posts || {};
const item = pack.items[0]; // 毎週いちばん上のネタ（今週いちばん伸びた王国）を投稿する

// Discord：Webhook に投稿文と画像（縦長1枚＋正方形）を送る。
async function postDiscord() {
  const url = process.env.SOCIAL_DISCORD_WEBHOOK_URL;
  if (!url) return { status: "未設定", note: "Secrets に SOCIAL_DISCORD_WEBHOOK_URL がありません" };
  if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(url)) return { status: "失敗", note: "Webhook URL の形が正しくありません" };
  const form = new FormData();
  form.append("payload_json", JSON.stringify({ content: item.captions.discord, allowed_mentions: { parse: [] } }));
  form.append("files[0]", new Blob([readFileSync(join(OUT, `${item.id}-square.png`))], { type: "image/png" }), `${item.id}.png`);
  const r = await fetch(url, { method: "POST", body: form });
  return r.ok ? { status: "投稿済み", note: item.title } : { status: "失敗", note: "HTTP " + r.status };
}

// X・YouTube・TikTok・Instagram は、各SNSの開発者登録（と審査）が済んで鍵を Secrets に入れた後で有効にする。
const later = (name, keys) => async () => keys.every(k => process.env[k]) ? { status: "準備中", note: "鍵はあります。投稿処理は次の段階で追加します" } : { status: "未設定", note: `Secrets に ${keys.join("・")} がありません` };
const platforms = {
  discord: postDiscord,
  x: later("x", ["SOCIAL_X_API_KEY", "SOCIAL_X_API_SECRET", "SOCIAL_X_ACCESS_TOKEN", "SOCIAL_X_ACCESS_SECRET"]),
  youtube: later("youtube", ["SOCIAL_YOUTUBE_CLIENT_ID", "SOCIAL_YOUTUBE_CLIENT_SECRET", "SOCIAL_YOUTUBE_REFRESH_TOKEN"]),
  tiktok: later("tiktok", ["SOCIAL_TIKTOK_CLIENT_KEY", "SOCIAL_TIKTOK_CLIENT_SECRET", "SOCIAL_TIKTOK_REFRESH_TOKEN"]),
  instagram: later("instagram", ["SOCIAL_INSTAGRAM_USER_ID", "SOCIAL_INSTAGRAM_ACCESS_TOKEN"])
};
for (const [name, fn] of Object.entries(platforms)) {
  try { posts[name] = await fn(); } catch (e) { posts[name] = { status: "失敗", note: String(e?.message || e).slice(0, 160) }; }
  console.log(name, posts[name].status, posts[name].note);
}
manifest.posts = posts;
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
