import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";

const root = new URL("../", import.meta.url);
const sw = readFileSync(new URL("sw.js", root), "utf8");
const listed = JSON.parse(
  sw.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1].replace(/,\s*\]$/, "]"),
);

function jsFiles(dir) {
  return readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? jsFiles(`${dir}${e.name}/`)
      : e.name.endsWith(".js")
        ? [`./${dir}${e.name}`]
        : [],
  );
}

test("every precached file exists", () => {
  for (const u of listed) {
    assert.ok(existsSync(new URL(u === "./" ? "index.html" : u, root)), u);
  }
});

test("every js file is precached", () => {
  for (const f of jsFiles("js/")) assert.ok(listed.includes(f), `missing ${f}`);
});
