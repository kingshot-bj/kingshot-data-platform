// すべての応答に付ける安全のための設定（2026-11-17）。
// ・他のサイトに枠で埋め込ませない（同じサイト内の埋め込みはOK：共有カードの見本）
// ・HTTPS を強制、参照元はドメインだけ渡す、ファイル形式の推測をさせない、カメラ等は使わない
export const SECURITY_HEADERS = Object.freeze({
  "strict-transport-security": "max-age=31536000",
  "x-frame-options": "SAMEORIGIN",
  "content-security-policy": "frame-ancestors 'self'",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()"
});

export function withSecurityHeaders(response) {
  if (!(response instanceof Response) || response.status === 101 || response.webSocket) return response;
  const missing = Object.keys(SECURITY_HEADERS).filter(k => !response.headers.has(k));
  if (!missing.length) return response;
  let out = response;
  try { for (const k of missing) out.headers.set(k, SECURITY_HEADERS[k]); return out; } catch {}
  out = new Response(response.body, response); // Response.redirect や fetch した応答は書き換えられないので作り直す
  for (const k of missing) out.headers.set(k, SECURITY_HEADERS[k]);
  return out;
}
