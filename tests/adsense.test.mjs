import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeAdsensePublisherId, injectAdsense, adsenseScriptTag } from "../src/adsense.js";
import { renderAdsTxt } from "../src/public-pages.js";

const ID = "pub-5575661392086210";

test("publisher id is validated; ads.txt names it", () => {
  assert.equal(normalizeAdsensePublisherId(ID), ID);
  assert.equal(normalizeAdsensePublisherId("ca-" + ID), ID);
  assert.equal(normalizeAdsensePublisherId("pub-12"), "");
  assert.equal(normalizeAdsensePublisherId("<script>"), "");
  assert.equal(renderAdsTxt(ID), "google.com, pub-5575661392086210, DIRECT, f08c47fec0942fa0\n");
});

test("site code only on public pages (with canonical), once, never without an id", () => {
  const pub = '<html><head><link rel="canonical" href="https://eagleeye-ks.com/k/1"></head><body></body></html>';
  const priv = "<html><head><title>x</title></head><body></body></html>";
  const out = injectAdsense(pub, ID);
  assert.ok(out.includes('adsbygoogle.js?client=ca-pub-5575661392086210" crossorigin="anonymous"></script></head>'));
  assert.equal(injectAdsense(out, ID), out, "not added twice");
  assert.equal(injectAdsense(priv, ID), priv, "signed-in / admin pages without canonical get nothing");
  assert.equal(injectAdsense(pub, ""), pub, "preview (no id) gets nothing");
  assert.equal(adsenseScriptTag(""), "");
});

test("production config and wiring", () => {
  const conf = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  const prod = conf.slice(0, conf.indexOf('"previews"'));
  assert.match(prod, /"ADSENSE_PUBLISHER_ID": "pub-5575661392086210"/);
  assert.doesNotMatch(conf.slice(conf.indexOf('"previews"')), /ADSENSE_PUBLISHER_ID/, "previews never load ads");
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(src, /configureAdsense\(env\);/);
  assert.match(src, /const themed = injectAdsense\(enhanceSeo\(applyEagleEyeTheme\(html\)\)\);/);
  assert.match(src, /<link rel="canonical" href="\$\{publicOrigin\(request, env\)\}\/">/, "home page is public (AdSense checks it)");
});
