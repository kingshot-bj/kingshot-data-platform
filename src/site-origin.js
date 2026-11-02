// Site origin for the custom-domain move.
//
// Until PUBLIC_ORIGIN is configured everything behaves exactly as before:
// canonical / sitemap / robots use the URL the request came in on, and the
// legacy workers.dev host is never redirected.
//
// After the move:
// - PUBLIC_ORIGIN (e.g. https://eagleeye-ks.com) is the only origin used in
//   canonical links, the sitemap, robots.txt and OGP URLs.
// - LEGACY_REDIRECT ("302" while checking, then "301") sends page views on the
//   legacy workers.dev host to the same path on PUBLIC_ORIGIN. /api/* is never
//   redirected: Discord interactions, the ChatGPT gateway and OAuth callbacks
//   are registered with the legacy URL and redirects would break them.

export const LEGACY_HOST = "kingshot-data-platform.black-jack-kingshot.workers.dev";
const NEVER_REDIRECT = [/^\/api(?:\/|$)/, /^\/hero-icons\/assets\//];

export function configuredPublicOrigin(env) {
  const raw = String(env?.PUBLIC_ORIGIN || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    if (url.pathname !== "/" || url.search || url.hash) return "";
    return url.origin;
  } catch {
    return "";
  }
}

export function siteOrigin(request, env) {
  const configured = configuredPublicOrigin(env);
  if (configured) return configured;
  try { return new URL(request.url).origin; } catch { return ""; }
}

export function isPreviewEnv(env) {
  return String(env?.EAGLEEYE_ENV || "").toLowerCase() === "preview";
}

// Returns a redirect Response for page views on the legacy host, or null.
export function legacyHostRedirect(request, env) {
  const mode = String(env?.LEGACY_REDIRECT || "").trim();
  const status = mode === "301" ? 301 : mode === "302" ? 302 : 0;
  if (!status || isPreviewEnv(env)) return null;
  const target = configuredPublicOrigin(env);
  if (!target) return null;
  const method = String(request.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return null;
  let url;
  try { url = new URL(request.url); } catch { return null; }
  if (url.hostname !== LEGACY_HOST) return null;
  if (new URL(target).hostname === LEGACY_HOST) return null;
  if (NEVER_REDIRECT.some(re => re.test(url.pathname))) return null;
  return new Response(null, { status, headers: { Location: target + url.pathname + url.search, "Cache-Control": status === 301 ? "public, max-age=3600" : "no-store" } });
}
