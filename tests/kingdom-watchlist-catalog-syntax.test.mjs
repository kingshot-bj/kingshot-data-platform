import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const sourcePath = new URL("../src/kingdom-catalog-page.js", import.meta.url);
const source = await readFile(sourcePath, "utf8");

test("Kingdom Catalog page module parses as JavaScript", () => {
  const result = spawnSync(process.execPath, ["--check", sourcePath.pathname], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout || "node --check failed");
});

test("live Kingdom Catalog suggestions use a bounded query and no-store JSON", () => {
  assert.match(source, /url\.searchParams\.get\("suggest"\) === "1"/);
  assert.match(source, /LIMIT 8/);
  assert.match(source, /\.bind\(term \+ "%", "%" \+ term \+ "%", q, term \+ "%"\)/);
  assert.match(source, /"cache-control": "no-store"/);
});

test("inline client script is isolated from the HTML string to prevent quote-termination build errors", () => {
  assert.match(source, /const kingdomCatalogClientScript = String\.raw`/);
  assert.ok(source.includes('<script>"+kingdomCatalogClientScript+"</script>'));
});
