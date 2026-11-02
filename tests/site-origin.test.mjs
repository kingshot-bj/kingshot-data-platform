import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { siteOrigin, configuredPublicOrigin, legacyHostRedirect, LEGACY_HOST } from "../src/site-origin.js";
import { publicOrigin, renderRobotsTxt, renderSitemapXml } from "../src/public-pages.js";

const legacy = path => new Request("https://" + LEGACY_HOST + path);
const ENV_ON = { PUBLIC_ORIGIN: "https://eagleeye-ks.com", LEGACY_REDIRECT: "301" };

test("without PUBLIC_ORIGIN nothing changes: request origin, no redirect", () => {
  assert.equal(siteOrigin(legacy("/k/1"), {}), "https://" + LEGACY_HOST);
  assert.equal(publicOrigin(legacy("/k/1")), "https://" + LEGACY_HOST, "old one-argument calls still work");
  assert.equal(legacyHostRedirect(legacy("/kingdoms"), {}), null);
  assert.equal(legacyHostRedirect(legacy("/kingdoms"), { LEGACY_REDIRECT: "301" }), null, "no target, no redirect");
  assert.equal(legacyHostRedirect(legacy("/kingdoms"), { PUBLIC_ORIGIN: "https://eagleeye-ks.com" }), null, "redirect stays off until LEGACY_REDIRECT is set");
});

test("PUBLIC_ORIGIN is validated and used for canonical / sitemap / robots", () => {
  assert.equal(configuredPublicOrigin({ PUBLIC_ORIGIN: "https://eagleeye-ks.com/" }), "https://eagleeye-ks.com");
  for (const bad of ["http://eagleeye-ks.com", "https://eagleeye-ks.com/path", "https://u:p@eagleeye-ks.com", "not a url", "https://eagleeye-ks.com/?q=1"]) {
    assert.equal(configuredPublicOrigin({ PUBLIC_ORIGIN: bad }), "", bad);
  }
  const origin = publicOrigin(legacy("/"), ENV_ON);
  assert.equal(origin, "https://eagleeye-ks.com");
  assert.match(renderRobotsTxt(origin), /Sitemap: https:\/\/eagleeye-ks\.com\/sitemap\.xml/);
  assert.match(renderSitemapXml(origin, [1]), /<loc>https:\/\/eagleeye-ks\.com\/k\/1<\/loc>/);
});

test("preview deployments are never indexed", () => {
  assert.equal(renderRobotsTxt("https://x", { preview: true }), "User-agent: *\nDisallow: /\n");
  assert.match(renderRobotsTxt("https://x"), /Allow: \//);
});

test("legacy host: pages redirect with path and query, /api and icons never do", () => {
  const r = legacyHostRedirect(legacy("/k/1524?tab=a"), ENV_ON);
  assert.equal(r.status, 301);
  assert.equal(r.headers.get("Location"), "https://eagleeye-ks.com/k/1524?tab=a");
  assert.equal(legacyHostRedirect(legacy("/k/1"), { ...ENV_ON, LEGACY_REDIRECT: "302" }).status, 302);
  for (const path of ["/api/auth/callback?code=x", "/api/discord/interactions", "/api/gateway/v1/players", "/api", "/hero-icons/assets/" + "a".repeat(64) + ".png"]) {
    assert.equal(legacyHostRedirect(legacy(path), ENV_ON), null, path);
  }
  assert.equal(legacyHostRedirect(new Request("https://" + LEGACY_HOST + "/kingdoms", { method: "POST" }), ENV_ON), null, "only GET/HEAD");
  assert.equal(legacyHostRedirect(new Request("https://eagleeye-ks.com/kingdoms"), ENV_ON), null, "the new domain itself is not redirected");
  assert.equal(legacyHostRedirect(new Request("https://abc-kingshot-data-platform.black-jack-kingshot.workers.dev/"), ENV_ON), null, "preview hosts are not redirected");
  assert.equal(legacyHostRedirect(legacy("/"), { ...ENV_ON, EAGLEEYE_ENV: "preview" }), null);
  assert.equal(legacyHostRedirect(legacy("/"), { ...ENV_ON, LEGACY_REDIRECT: "yes" }), null);
});

test("index.js wiring", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /const moved = legacyHostRedirect\(request, env\); if \(moved\) return moved;/);
  assert.doesNotMatch(src, /publicOrigin\(request\)/, "every canonical origin goes through PUBLIC_ORIGIN");
  assert.match(src, /renderRobotsTxt\(publicOrigin\(request, env\), \{ preview: isPreviewEnv\(env\) \}\)/);
  // A custom domain must not get the preview banner.
  assert.match(src, /isPreviewHost=host!==productionHost&&\(host\.slice\(-12\)===".workers.dev"/);
});
