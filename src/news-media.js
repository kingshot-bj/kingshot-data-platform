// お知らせの画像・動画（2026-11-17）。
// ・ADMIN / OWNER が投稿画面から上げる → R2（news-media/<uuid>.<拡張子>）。D1 にはお知らせの行に「どの画像・動画か」だけ（media_json）。
// ・画像は 8MB・4枚まで、動画は 50MB・1本まで（mp4・mov）。中身の先頭を見て本当にその形式か確かめる（拡張子だけ信じない）。
// ・表示は /news/media/<ファイル名>（だれでも見られる・1日キャッシュ・動画は部分読み込み対応）。
export const NEWS_MEDIA_PREFIX = "news-media/";
export const NEWS_MEDIA_LIMITS = Object.freeze({ image: 8 * 1024 * 1024, video: 50 * 1024 * 1024, images: 4, videos: 1 });
export const NEWS_MEDIA_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|gif|mp4|mov)$/;
const TYPES = Object.freeze({
  "image/png": { ext: "png", kind: "image" }, "image/jpeg": { ext: "jpg", kind: "image" }, "image/webp": { ext: "webp", kind: "image" }, "image/gif": { ext: "gif", kind: "image" },
  "video/mp4": { ext: "mp4", kind: "video" }, "video/quicktime": { ext: "mov", kind: "video" }
});
const CONTENT_TYPE = Object.freeze({ png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif", mp4: "video/mp4", mov: "video/quicktime" });

// ファイルの先頭のしるし（マジックナンバー）で形式を確かめる。
export function sniffType(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const at = (i, ...v) => v.every((x, k) => b[i + k] === x);
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  if (at(4, 0x66, 0x74, 0x79, 0x70)) { const brand = String.fromCharCode(...b.slice(8, 12)); return brand === "qt  " ? "video/quicktime" : "video/mp4"; }
  return null;
}

// お知らせに付ける画像・動画の一覧を確かめる（ファイル名の形・枚数）。
export function normalizeMediaList(list) {
  const out = [];
  let images = 0, videos = 0;
  for (const m of Array.isArray(list) ? list : []) {
    const file = String(m?.file || "");
    if (!NEWS_MEDIA_FILE.test(file)) continue;
    const kind = /\.(mp4|mov)$/.test(file) ? "video" : "image";
    if (kind === "image" && images >= NEWS_MEDIA_LIMITS.images) continue;
    if (kind === "video" && videos >= NEWS_MEDIA_LIMITS.videos) continue;
    kind === "image" ? images++ : videos++;
    if (!out.some(x => x.file === file)) out.push({ file, kind });
  }
  return out;
}

export async function handleNewsMediaUpload(request, bucket) {
  if (!bucket) return { status: 503, body: { ok: false, error: "STORAGE_UNAVAILABLE" } };
  const declared = String(request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const t = TYPES[declared];
  if (!t) return { status: 415, body: { ok: false, error: "UNSUPPORTED_TYPE", message: "画像（PNG・JPEG・WebP・GIF）か動画（MP4・MOV）を選んでください。" } };
  const max = NEWS_MEDIA_LIMITS[t.kind];
  const length = Number(request.headers.get("content-length") || 0);
  if (length > max) return { status: 413, body: { ok: false, error: "TOO_LARGE", message: `${t.kind === "video" ? "動画" : "画像"}は ${Math.round(max / 1024 / 1024)}MB までです。` } };
  const buf = await request.arrayBuffer();
  if (!buf.byteLength) return { status: 400, body: { ok: false, error: "EMPTY" } };
  if (buf.byteLength > max) return { status: 413, body: { ok: false, error: "TOO_LARGE", message: `${t.kind === "video" ? "動画" : "画像"}は ${Math.round(max / 1024 / 1024)}MB までです。` } };
  const real = sniffType(new Uint8Array(buf.slice(0, 16)));
  if (!real || TYPES[real].kind !== t.kind) return { status: 415, body: { ok: false, error: "TYPE_MISMATCH", message: "ファイルの中身が画像・動画ではありません。" } };
  const ext = TYPES[real].ext;
  const file = `${crypto.randomUUID()}.${ext}`;
  await bucket.put(NEWS_MEDIA_PREFIX + file, buf, { httpMetadata: { contentType: CONTENT_TYPE[ext], cacheControl: "public, max-age=86400" } });
  return { status: 200, body: { ok: true, file, kind: TYPES[real].kind } };
}

// 「Range: bytes=a-b」→ R2 の range（iPhone の Safari は動画を部分ごとに読む）。
function parseRange(header) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || "").trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  if (m[1] === "") return { suffix: Number(m[2]) };
  const offset = Number(m[1]);
  return m[2] === "" ? { offset } : { offset, length: Math.max(1, Number(m[2]) - offset + 1) };
}

export async function serveNewsMedia(request, bucket, file) {
  if (!bucket || !NEWS_MEDIA_FILE.test(String(file || ""))) return new Response("not found", { status: 404 });
  const range = parseRange(request.headers.get("range"));
  const obj = await bucket.get(NEWS_MEDIA_PREFIX + file, range ? { range } : undefined).catch(() => null);
  if (!obj) return new Response("not found", { status: 404 });
  const ext = file.split(".").pop();
  const h = { "content-type": CONTENT_TYPE[ext] || "application/octet-stream", "cache-control": "public, max-age=86400", "accept-ranges": "bytes", "x-content-type-options": "nosniff" };
  if (range && obj.range) {
    const sfx = obj.range.suffix != null ? Math.min(obj.size, obj.range.suffix) : null;
    const start = sfx != null ? obj.size - sfx : (obj.range.offset ?? 0);
    const len = sfx != null ? sfx : Math.min(obj.range.length ?? (obj.size - start), obj.size - start);
    h["content-range"] = `bytes ${start}-${start + len - 1}/${obj.size}`; h["content-length"] = String(len);
    return new Response(obj.body, { status: 206, headers: h });
  }
  h["content-length"] = String(obj.size);
  return new Response(obj.body, { headers: h });
}

export function mediaHtml(list, escapeHtml) {
  const media = normalizeMediaList(list);
  if (!media.length) return "";
  const imgs = media.filter(m => m.kind === "image"), vids = media.filter(m => m.kind === "video");
  return '<div class="news-media">' +
    vids.map(m => '<video src="/news/media/' + escapeHtml(m.file) + '" controls playsinline preload="metadata"></video>').join("") +
    (imgs.length ? '<div class="news-imgs n' + imgs.length + '">' + imgs.map(m => '<a href="/news/media/' + escapeHtml(m.file) + '" target="_blank" rel="noopener"><img src="/news/media/' + escapeHtml(m.file) + '" alt="" loading="lazy"></a>').join("") + "</div>" : "") +
    "</div>";
}
