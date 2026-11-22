// お知らせの画像・動画（2026-11-17）の再発防止テスト。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sniffType, normalizeMediaList, handleNewsMediaUpload, serveNewsMedia, mediaHtml, NEWS_MEDIA_LIMITS } from "../src/news-media.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]);
const U = "12345678-1234-1234-1234-123456789abc";
const esc = s => String(s).replace(/[&<>"']/g, c => "&#" + c.charCodeAt(0) + ";");

function bucket() {
  const store = new Map();
  return { store,
    async put(k, v, o) { store.set(k, { bytes: new Uint8Array(v), o }); },
    async get(k, opt) {
      const e = store.get(k); if (!e) return null;
      const size = e.bytes.length, r = opt?.range;
      let body = e.bytes;
      if (r) { const s = r.suffix != null ? size - r.suffix : r.offset; const len = r.suffix != null ? r.suffix : (r.length ?? size - s); body = e.bytes.slice(s, s + len); }
      return { size, range: r, body };
    } };
}

test("sniffType は中身の先頭で形式を判定する", () => {
  assert.equal(sniffType(PNG), "image/png");
  assert.equal(sniffType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniffType(MP4), "video/mp4");
  assert.equal(sniffType(new TextEncoder().encode("<script>alert(1)</script>")), null);
});

test("normalizeMediaList は形の正しいファイル名だけ・画像4枚・動画1本まで", () => {
  const imgs = Array.from({ length: 6 }, (_, i) => ({ file: `12345678-1234-1234-1234-12345678900${i}.png` }));
  const list = normalizeMediaList([...imgs, { file: U + ".mp4" }, { file: "12345678-1234-1234-1234-123456789abd.mp4" }, { file: "../secret.png" }, { file: U + ".html" }]);
  assert.equal(list.filter(m => m.kind === "image").length, NEWS_MEDIA_LIMITS.images);
  assert.equal(list.filter(m => m.kind === "video").length, 1);
  assert.ok(list.every(m => !m.file.includes("..") && !m.file.endsWith(".html")));
});

test("アップロード：中身が違う形式・対応外の形式は断る、正しい画像は R2 に保存", async () => {
  const b = bucket();
  const req = (type, body) => new Request("https://x/api/admin/announcements/media", { method: "POST", headers: { "content-type": type }, body });
  assert.equal((await handleNewsMediaUpload(req("text/html", "<b>x</b>"), b)).status, 415);
  assert.equal((await handleNewsMediaUpload(req("image/png", new TextEncoder().encode("<svg onload=alert(1)>")), b)).body.error, "TYPE_MISMATCH");
  assert.equal((await handleNewsMediaUpload(req("image/png", MP4), b)).body.error, "TYPE_MISMATCH");
  const ok = await handleNewsMediaUpload(req("image/png", PNG), b);
  assert.equal(ok.status, 200);
  assert.match(ok.body.file, /^[0-9a-f-]{36}\.png$/);
  assert.ok(b.store.has("news-media/" + ok.body.file));
  assert.equal((await handleNewsMediaUpload(req("image/png", PNG), null)).status, 503);
});

test("表示：変なファイル名は 404、Range は 206 で部分を返す", async () => {
  const b = bucket();
  await b.put("news-media/" + U + ".mp4", MP4);
  assert.equal((await serveNewsMedia(new Request("https://x/"), b, "../x.mp4")).status, 404);
  const full = await serveNewsMedia(new Request("https://x/"), b, U + ".mp4");
  assert.equal(full.status, 200);
  assert.equal(full.headers.get("content-type"), "video/mp4");
  assert.equal(full.headers.get("x-content-type-options"), "nosniff");
  const part = await serveNewsMedia(new Request("https://x/", { headers: { range: "bytes=0-3" } }), b, U + ".mp4");
  assert.equal(part.status, 206);
  assert.equal(part.headers.get("content-range"), "bytes 0-3/16");
});

test("mediaHtml は動画と画像を /news/media/ で出す", () => {
  const html = mediaHtml([{ file: U + ".mp4" }, { file: U.replace("abc", "abd") + ".png" }], esc);
  assert.match(html, /<video src="\/news\/media\/[^"]+\.mp4" controls playsinline/);
  assert.match(html, /<img src="\/news\/media\/[^"]+\.png"/);
  assert.equal(mediaHtml([], esc), "");
});

test("配線：アップロードは ADMIN 以上・同じサイトから、Discord は1枚目の画像と動画リンク", () => {
  const index = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const route = index.slice(index.indexOf('"/api/admin/announcements/media"'), index.indexOf('"/api/admin/announcements/media"') + 600);
  assert.match(route, /requireAdmin/);
  assert.match(route, /isSameOriginRequest/);
  assert.match(index, /publishAt: body\.publish_at \?\? null, media: body\.media/);
  const discord = readFileSync(new URL("../src/announcement-discord.js", import.meta.url), "utf8");
  assert.match(discord, /SELECT id, title, body, media_json FROM announcements/);
  assert.match(discord, /"\/news\/media\/" \+ firstImage\.file/);
  assert.match(discord, /"\/news\/media\/" \+ video\.file/);
});
