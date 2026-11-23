// Stamps sw.js with a content hash of the precached files: `npm run stamp`.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const ROOT = new URL("../", import.meta.url);

export function precacheList(swText) {
  const body = swText.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1];
  return JSON.parse(body.replace(/,\s*\]$/, "]"));
}

// SHA-256 over every precached file in list order, CRLF-normalised; first 12 hex chars.
export function computeVersion(swText, root = ROOT) {
  const hash = createHash("sha256");
  for (const u of precacheList(swText)) {
    const file = u === "./" ? "index.html" : u;
    hash.update(readFileSync(new URL(file, root)).toString("latin1").replace(/\r/g, ""), "latin1");
  }
  return hash.digest("hex").slice(0, 12);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = new URL("sw.js", ROOT);
  const sw = readFileSync(path, "utf8");
  const version = computeVersion(sw);
  const out = sw
    .replace(/const VERSION = "[^"]*";/, `const VERSION = "${version}";`)
    .replace(/const IMG_VERSION = "[^"]*";/, `const IMG_VERSION = "${computeImageVersion()}";`);
  if (out !== sw) writeFileSync(path, out);
  console.log(`sw.js VERSION = ${version}`);
}
