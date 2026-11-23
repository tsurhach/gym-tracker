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

// Every file under img/ex (the sw prefetches these into its own cache), sorted, as root-relative paths.
export function imageFiles(root = ROOT, dir = "img/ex/") {
  return readdirSync(new URL(dir, root), { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((e) => (e.isDirectory() ? imageFiles(root, `${dir}${e.name}/`) : [`${dir}${e.name}`]));
}

function hashFiles(files, root) {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file + "|", "latin1");
    hash.update(readFileSync(new URL(file, root)).toString("latin1").replaceAll(String.fromCharCode(13), ""), "latin1");
  }
  return hash.digest("hex").slice(0, 12);
}

// Hash of the exercise drawings only; names the image cache so changed drawings are re-downloaded.
export const computeImageVersion = (root = ROOT) => hashFiles(imageFiles(root), root);

// SHA-256 over every precached file in list order plus every img/ex file, CRLF-normalised; first 12 hex chars.
export function computeVersion(swText, root = ROOT) {
  const files = precacheList(swText).map((u) => (u === "./" ? "index.html" : u));
  return hashFiles([...files, ...imageFiles(root)], root);
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
