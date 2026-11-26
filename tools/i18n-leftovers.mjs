// Lists user-visible English literals still in js/ outside js/i18n/ (heuristic). `node tools/i18n-leftovers.mjs`
// Allow-list: tools/i18n-allow.json = [{ "file": "js/x.js", "text": "substring of the literal", "why": "..." }].
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const allowFile = join(ROOT, "tools/i18n-allow.json");
const allow = existsSync(allowFile)
  ? JSON.parse(readFileSync(allowFile, "utf8"))
  : [];

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === "i18n" ? [] : walk(p);
    return e.name.endsWith(".js") ? [p] : [];
  });
}
// Blanks comments (not "//" inside strings such as URLs) and ${...} expressions.
const BS = String.fromCharCode(92);
const lineComment = new RegExp(
  "(^|[^:\"'`" + BS + BS + "])//[^" + BS + "n]*",
  "g",
);
const strip = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(lineComment, "$1")
    .replace(/\$\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/g, "\u0001");
const WORD = /[A-Za-z]{2,}/;

const noExpr = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(lineComment, "$1");
const EXPR = /\$\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/g;

export function leftovers(file, raw) {
  const out = [];
  // Literals inside ${...} (ternaries and the like): "Capitalised words" that are not t("...") arguments.
  const clean = noExpr(raw);
  for (const e of clean.matchAll(EXPR))
    for (const m of e[0].matchAll(/(["'`])([A-Z][a-z]+(?: [a-z]+)*)\1/g)) {
      if (/\b(?:t|tr|tk)\(\s*$/.test(e[0].slice(0, m.index))) continue;
      out.push({ file, line: clean.slice(0, e.index).split("\n").length, text: m[2] });
    }
  strip(raw)
    .split("\n")
    .forEach((line, i) => {
      const hit = (text) =>
        out.push({ file, line: i + 1, text: text.trim().slice(0, 100) });
      for (const m of line.matchAll(/>([^<>\u0001"`]*)</g))
        if (WORD.test(m[1])) hit(m[1]); // text between tags
      for (const m of line.matchAll(
        /\b(?:aria-label|title|placeholder|alt|aria-description)="([^"\u0001]*)"/g,
      ))
        if (WORD.test(m[1])) hit(m[0]);
      for (const m of line.matchAll(
        /\b(?:textContent|innerText|placeholder|title|label|message)\s*[:=]\s*["`]([^"`\u0001]*)["`]/g,
      ))
        if (WORD.test(m[1]) && /[A-Z]|\s/.test(m[1])) hit(m[0]);
      for (const m of line.matchAll(
        /\b(?:showBanner|confirmSheet|infoSheet|alert|Error|prompt)\(\s*["`']([^"`'\u0001]*)["`']/g,
      ))
        if (WORD.test(m[1])) hit(m[0]);
      for (const m of line.matchAll(
        /setAttribute\("aria-label",\s*["`]([^"`\u0001]*)["`]/g,
      ))
        if (WORD.test(m[1])) hit(m[0]);
      for (const m of line.matchAll(
        /^\s*["`]([A-Z][a-z]+(?: [A-Za-z,.'-]+)+[.!?]?)["`],?\s*$/g,
      ))
        hit(m[1]); // a sentence alone on a line
      if (!/^\s*import /.test(line))
        for (const m of line.matchAll(
          /(["'`])([A-Z][a-z]+(?: [A-Za-z][^"'`\n\\\u0001]*)+)\1/g,
        ))
          hit(m[2]); // any capitalised multi-word literal
    });
  return out.filter(
    (o) =>
      !allow.some(
        (a) => (a.file === "*" || o.file === a.file) && o.text.includes(a.text),
      ),
  );
}

export function scanAll() {
  return walk(join(ROOT, "js")).flatMap((p) =>
    leftovers(relative(ROOT, p).replaceAll("\\", "/"), readFileSync(p, "utf8")),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = scanAll();
  for (const o of r) console.log(`${o.file}:${o.line}  ${o.text}`);
  console.log(`${r.length} leftover(s)`);
}
