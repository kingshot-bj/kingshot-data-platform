// Return-to-page after Discord login. Only same-site page paths are allowed,
// so the value can never send the browser to another origin (open redirect).

export const LOGIN_RETURN_COOKIE = "eagleeye_login_return";
export const LOGIN_RETURN_MAX_AGE = 600;

export function sanitizeLoginReturnPath(value) {
  const path = String(value ?? "");
  if (!path || path.length > 512) return null;
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(path)) return null;
  if (path === "/api" || path.startsWith("/api/")) return null;
  try {
    const resolved = new URL(path, "https://eagleeye.invalid");
    if (resolved.origin !== "https://eagleeye.invalid") return null;
    return resolved.pathname + resolved.search;
  } catch {
    return null;
  }
}

export function loginUrlFor(path) {
  const safe = sanitizeLoginReturnPath(path);
  return safe ? "/api/auth/discord?next=" + encodeURIComponent(safe) : "/api/auth/discord";
}
