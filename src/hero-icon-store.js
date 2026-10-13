const HERO_ICON_PREFIX = "hero-icons/v1/";
const HERO_ICON_ASSET_PREFIX = "/hero-icons/assets/";
const MAX_HERO_ICON_BYTES = 2 * 1024 * 1024;
const MAX_HERO_ICON_BATCH = 100;

function normalizeIconUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol === "http:" &&
          (parsed.hostname === "mightpulse.com" || parsed.hostname.endsWith(".mightpulse.com"))) {
        parsed.protocol = "https:";
      }
      return parsed.toString();
    } catch {
      return "";
    }
  }
  return "https://api.mightpulse.com" + (raw.startsWith("/") ? raw : "/" + raw);
}

function supportedIconHost(url) {
  return url.protocol === "https:" &&
    (url.hostname === "mightpulse.com" || url.hostname.endsWith(".mightpulse.com")) && !url.username && !url.password;
}

async function hashHeroId(heroId) {
  const bytes = new TextEncoder().encode(String(heroId));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function contentTypeExtension(contentType) {
  const type = String(contentType || "").split(";")[0].trim().toLowerCase();
  const map = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif"
  };
  return map[type] ? { type, extension: map[type] } : null;
}

function safeAssetName(value) {
  const name = String(value || "").split("/").pop() || "";
  return /^[a-f0-9]{64}\.(?:png|jpg|webp|gif|avif)$/.test(name) ? name : "";
}

/**
 * Queue icon URLs already present in a MightPulse player response.
 * A stable hero ID is required; we never infer identity from a name alone.
 */
export async function queueHeroIconCandidates(db, heroes, resolveHeroName = value => value) {
  if (!db || !Array.isArray(heroes) || heroes.length === 0) return { queued: 0 };
  const candidatesById = new Map();

  for (const hero of heroes.slice(0, MAX_HERO_ICON_BATCH)) {
    const heroId = String(hero?.id ?? "").trim();
    const sourceUrl = normalizeIconUrl(hero?.icon);
    if (!heroId || !String(hero?.name ?? "").trim() || !sourceUrl) continue;
    let heroName = "";
    try {
      heroName = String(resolveHeroName(hero.name) || "").trim();
    } catch {
      heroName = String(hero.name || "").trim();
    }
    if (!heroName || heroName === "-") continue;
    candidatesById.set(heroId, { heroId, heroName, sourceUrl });
  }

  const candidates = [...candidatesById.values()];
  if (!candidates.length) return { queued: 0 };

  const existingResult = await db.prepare(
    "SELECT hero_id, source_url, status FROM hero_icon_assets WHERE hero_id IN (" +
    candidates.map(() => "?").join(",") + ")"
  ).bind(...candidates.map(item => item.heroId)).all();
  const existing = new Map((existingResult.results || []).map(row => [String(row.hero_id), row]));
  const now = Math.floor(Date.now() / 1000);
  const statements = [];

  for (const item of candidates) {
    const row = existing.get(item.heroId);
    if (row?.status === "SAVED") continue;
    if (row && String(row.source_url) === item.sourceUrl) continue;

    if (!row) {
      statements.push(db.prepare(
        "INSERT INTO hero_icon_assets (hero_id, hero_name, source_url, status, attempts, created_at, updated_at) VALUES (?, ?, ?, 'PENDING', 0, ?, ?)"
      ).bind(item.heroId, item.heroName, item.sourceUrl, now, now));
    } else {
      statements.push(db.prepare(
        "UPDATE hero_icon_assets SET hero_name = ?, source_url = ?, status = 'PENDING', attempts = 0, last_error = NULL, updated_at = ? WHERE hero_id = ? AND status != 'SAVED' AND source_url != ?"
      ).bind(item.heroName, item.sourceUrl, now, item.heroId, item.sourceUrl));
    }
  }

  if (statements.length) await db.batch(statements);
  return { queued: statements.length };
}

/** Process a small, bounded number of queued image assets per cron invocation. */
export async function runHeroIconAssetWorker(env, { limit = 1 } = {}) {
  if (!env?.DB || !env?.ARCHIVE) return { skipped: true, reason: "STORAGE_NOT_CONFIGURED" };
  const safeLimit = Math.min(Math.max(Number(limit) || 1, 1), 3);
  const now = Math.floor(Date.now() / 1000);
  let processed = 0;
  let saved = 0;
  let failed = 0;

  for (let index = 0; index < safeLimit; index++) {
    const row = await env.DB.prepare(
      "SELECT hero_id, hero_name, source_url, status, attempts, updated_at FROM hero_icon_assets " +
      "WHERE (status = 'PENDING' OR (status = 'FAILED' AND attempts < 3 AND updated_at <= ?) " +
      "OR (status = 'SAVING' AND updated_at <= ?)) " +
      "ORDER BY CASE status WHEN 'PENDING' THEN 0 WHEN 'SAVING' THEN 1 ELSE 2 END, updated_at ASC LIMIT 1"
    ).bind(now - 300, now - 900).first();
    if (!row) break;

    const claim = await env.DB.prepare(
      "UPDATE hero_icon_assets SET status = 'SAVING', attempts = attempts + 1, updated_at = ? " +
      "WHERE hero_id = ? AND status = ? AND updated_at = ?"
    ).bind(now, row.hero_id, row.status, row.updated_at).run();
    if (claim?.meta?.changes !== 1) continue;
    processed++;

    try {
      const digest = await hashHeroId(row.hero_id);
      if (row.status === "SAVING") {
        const existingObjects = await env.ARCHIVE.list({ prefix: HERO_ICON_PREFIX + digest, limit: 5 });
        const existingObject = (existingObjects.objects || []).find(item => safeAssetName(item.key));
        if (existingObject) {
          const savedAt = Math.floor(Date.now() / 1000);
          await env.DB.prepare(
            "UPDATE hero_icon_assets SET status = 'SAVED', object_key = ?, saved_at = ?, last_error = NULL, updated_at = ? WHERE hero_id = ? AND status = 'SAVING'"
          ).bind(existingObject.key, savedAt, savedAt, row.hero_id).run();
          saved++;
          continue;
        }
      }

      const url = new URL(String(row.source_url || ""));
      if (!supportedIconHost(url)) {
        await env.DB.prepare(
          "UPDATE hero_icon_assets SET status = 'UNSUPPORTED_HOST', last_error = ?, updated_at = ? WHERE hero_id = ? AND status = 'SAVING'"
        ).bind("画像ホストが許可リスト外です。", Math.floor(Date.now() / 1000), row.hero_id).run();
        failed++;
        continue;
      }

      const response = await fetch(url.toString(), {
        method: "GET",
        redirect: "manual",
        headers: { "accept": "image/avif,image/webp,image/png,image/jpeg,image/gif" }
      });
      if (!response.ok) throw new Error("IMAGE_HTTP_" + response.status);
      const contentInfo = contentTypeExtension(response.headers.get("content-type"));
      if (!contentInfo) throw new Error("UNSUPPORTED_IMAGE_CONTENT_TYPE");
      const declaredLength = Number(response.headers.get("content-length") || 0);
      if (declaredLength > MAX_HERO_ICON_BYTES) throw new Error("IMAGE_TOO_LARGE");

      const body = await response.arrayBuffer();
      if (!body.byteLength || body.byteLength > MAX_HERO_ICON_BYTES) throw new Error("IMAGE_SIZE_INVALID");

      const objectKey = HERO_ICON_PREFIX + digest + contentInfo.extension;
      await env.ARCHIVE.put(objectKey, body, {
        httpMetadata: {
          contentType: contentInfo.type,
          cacheControl: "public, max-age=31536000, immutable",
          contentDisposition: "inline"
        },
        customMetadata: {
          heroId: String(row.hero_id),
          heroName: String(row.hero_name || ""),
          source: "MIGHTPULSE"
        }
      });

      const savedAt = Math.floor(Date.now() / 1000);
      await env.DB.prepare(
        "UPDATE hero_icon_assets SET status = 'SAVED', object_key = ?, saved_at = ?, last_error = NULL, updated_at = ? WHERE hero_id = ? AND status = 'SAVING'"
      ).bind(objectKey, savedAt, savedAt, row.hero_id).run();
      saved++;
    } catch (error) {
      const message = String(error?.message || error || "HERO_ICON_SAVE_FAILED").slice(0, 500);
      await env.DB.prepare(
        "UPDATE hero_icon_assets SET status = 'FAILED', last_error = ?, updated_at = ? WHERE hero_id = ? AND status = 'SAVING'"
      ).bind(message, Math.floor(Date.now() / 1000), row.hero_id).run();
      failed++;
    }
  }

  return { skipped: false, processed, saved, failed };
}

/** Build an exact-name catalog map; ambiguous duplicate names are deliberately omitted. */
export async function getSavedHeroIconMap(db) {
  if (!db) return {};
  const result = await db.prepare(
    "SELECT hero_name, object_key FROM hero_icon_assets WHERE status = 'SAVED' AND object_key IS NOT NULL ORDER BY updated_at DESC LIMIT 100"
  ).all();
  const map = {};
  const ambiguous = new Set();
  for (const row of result.results || []) {
    const name = String(row.hero_name || "").trim();
    const objectKey = String(row.object_key || "");
    const assetName = safeAssetName(objectKey);
    if (!name || !assetName) continue;
    if (Object.prototype.hasOwnProperty.call(map, name) && map[name] !== assetName) {
      delete map[name];
      ambiguous.add(name);
    } else if (!ambiguous.has(name)) {
      map[name] = assetName;
    }
  }
  return map;
}

/** Serve only generated R2 object names, never arbitrary bucket keys. */
export async function serveHeroIconAsset(request, env, pathname) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const assetName = safeAssetName(pathname.slice(HERO_ICON_ASSET_PREFIX.length));
  if (!assetName || !env?.ARCHIVE) return new Response("Not Found", { status: 404 });
  const object = await env.ARCHIVE.get(HERO_ICON_PREFIX + assetName);
  if (!object) return new Response("Not Found", { status: 404, headers: { "Cache-Control": "public, max-age=60" } });

  const headers = new Headers();
  headers.set("Content-Type", object.httpMetadata?.contentType || "application/octet-stream");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  if (object.size != null) headers.set("Content-Length", String(object.size));
  return new Response(request.method === "HEAD" ? null : object.body, { status: 200, headers });
}
