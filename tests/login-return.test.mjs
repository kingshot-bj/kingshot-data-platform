import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { sanitizeLoginReturnPath, loginUrlFor, LOGIN_RETURN_COOKIE } from "../src/login-return.js";

const index = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
const portal = await readFile(new URL("../src/kingdom-portal.js", import.meta.url), "utf8");

test("only same-site page paths are accepted as the login return target", () => {
  assert.equal(sanitizeLoginReturnPath("/alliance?kid=1524&tag=TNC&refresh=1"), "/alliance?kid=1524&tag=TNC&refresh=1");
  assert.equal(sanitizeLoginReturnPath("/kingdom?kid=1524#top"), "/kingdom?kid=1524");
  for (const bad of ["https://evil.example/", "//evil.example/x", "/\\evil.example", "/\\/evil", "javascript:alert(1)",
    "evil", "", null, undefined, "/api/auth/discord", "/api/me", "/ok\r\nSet-Cookie: x=1", "/" + "a".repeat(600)]) {
    assert.equal(sanitizeLoginReturnPath(bad), null, String(bad));
  }
});

test("login link carries the encoded return path, or none when unsafe", () => {
  assert.equal(loginUrlFor("/alliance?kid=1&tag=A B"), "/api/auth/discord?next=" + encodeURIComponent("/alliance?kid=1&tag=A%20B"));
  assert.equal(loginUrlFor("https://evil.example/"), "/api/auth/discord");
});

test("OAuth start stores the return path in a short-lived HttpOnly cookie and the callback consumes it", () => {
  assert.equal(LOGIN_RETURN_COOKIE, "eagleeye_login_return");
  assert.ok(index.includes('const returnPath = sanitizeLoginReturnPath(new URL(request.url).searchParams.get("next"));'));
  assert.ok(index.includes("maxAge: returnPath ? LOGIN_RETURN_MAX_AGE : 0, httpOnly: true, secure: true, sameSite: \"Lax\""));
  assert.ok(index.includes("returnPath = sanitizeLoginReturnPath(parseCookie(request.headers.get(\"Cookie\") || \"\")[LOGIN_RETURN_COOKIE]);"));
  assert.ok(index.includes('Location: new URL(returnPath || "/", request.url).toString(),'));
  assert.ok(index.includes('serializeCookie(LOGIN_RETURN_COOKIE, "", { maxAge: 0'), "return cookie is cleared after login");
});

test("signed-out alliance page offers a login shortcut that returns to the refresh", () => {
  assert.ok(portal.includes("const loginHref=loginUrlFor(refreshUrl);"));
  assert.ok(portal.includes("ログインして取得"));
  assert.ok(portal.includes("Discordでログイン →"));
  assert.ok(portal.includes('let statusMessage = !signedIn ? "最新情報の取得にはログインが必要です。"'));
  assert.ok(portal.includes('.replace(/^(\\d+)\\.0+$/, "$1")'), "alliance id is shown without a trailing .0");
});
