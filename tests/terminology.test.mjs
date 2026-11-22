import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const files = (await readdir(new URL("../src/", import.meta.url))).filter(f => f.endsWith(".js"));
const sources = await Promise.all(files.map(async f => [f, await readFile(new URL("../src/" + f, import.meta.url), "utf8")]));

test("user-facing wording is consistent", () => {
  for (const [f, src] of sources) {
    for (const legacy of ["マイKingshot", "王国Watchlist", "プレイヤーWatchlist", "人をサインアウトさせ", 'placeholder="Governor ID"']) {
      assert.ok(!src.includes(legacy), f + " still says " + legacy);
    }
  }
});

test("page titles read '<page> | EagleEye'", () => {
  for (const [f, src] of sources) {
    for (const m of src.matchAll(/<title>([^<$"'+]+)<\/title>/g)) {
      if (m[1] === "EagleEye") continue; // home page
      assert.match(m[1], / \| EagleEye$/, f + ": " + m[1]);
    }
  }
});
