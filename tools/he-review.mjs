// Owner review page: node tools/he-review.mjs [--inline] [out.html]
// Every key (English | Hebrew | .m/.f) grouped by screen, then every exercise. One running row number per row, so replies can say "row 123: ...".
// --inline embeds the first drawing of each exercise as a data URI (for publishing); default links ./img/ex/... (docs/he-review.html).
import fs from "node:fs";
import en from "../js/i18n/en.js";
import he from "../js/i18n/he.js";

const args = process.argv.slice(2);
const inline = args.includes("--inline");
const out = args.find((a) => !a.startsWith("--")) ?? "docs/he-review.html";
const lib = JSON.parse(fs.readFileSync(new URL("../data/exercises.json", import.meta.url), "utf8"));
const heEx = JSON.parse(fs.readFileSync(new URL("../data/exercises.he.json", import.meta.url), "utf8"));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const plain = (s) => String(s).replace(/<\/(li|p|ol|ul)>/g, "\n").replace(/<li>/g, "• ").replace(/<[^>]+>/g, "").replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/\n{2,}/g, "\n").trim();
const show = (v) => (typeof v === "object" ? Object.entries(v).map(([c, s]) => `${c}: ${plain(s)}`).join("\n") : plain(v));
const cell = (s, dir) => `<div dir="${dir}" class="${dir === "rtl" ? "he" : "en"}">${esc(s).replace(/\n/g, "<br>")}</div>`;

const SCREEN = { muscle: "Muscles and equipment", equip: "Muscles and equipment", goal: "Muscles and equipment", help: "Help guide", ui: "Shared", friendly: "Shared", store: "Shared", app: "App messages", tab: "Tabs", logic: "Advice and plates", cal: "Calendar", today: "Today", workout: "Workout", muscles: "Muscles screen", weight: "Body weight", planbuild: "Plan", proposal: "Setup and programs", exercise: "Exercise screen", history: "History", rest: "Rest timer", picker: "Exercise picker", swap: "Swap exercise", super: "Supersets", setup: "Setup and programs", import: "Import", pf: "Plan file messages", plan: "Plan", sync: "Sync", passkey: "Sync", backup: "Backup", media: "Media", share: "People and sharing", person: "People and sharing", people: "People and sharing", settings: "Settings" };
const groups = new Map();
for (const k of Object.keys(en)) {
  const g = SCREEN[k.split(".")[0]] ?? k.split(".")[0];
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(k);
}

let n = 0;
const sections = [];
for (const [g, keys] of groups) {
  const rows = keys.map((k) => {
    n++;
    const variants = ["m", "f"].filter((x) => `${k}.${x}` in he).map((x) => `<div class="var"><b>${x === "m" ? "male" : "female"}:</b> ${cell(show(he[`${k}.${x}`]), "rtl")}</div>`).join("");
    return `<tr id="r${n}"><td class="n">${n}</td><td><code>${esc(k)}</code>${cell(show(en[k]), "ltr")}</td><td>${cell(show(he[k] ?? ""), "rtl")}${variants}</td></tr>`;
  });
  sections.push(`<details open><summary>${esc(g)} <span class="cnt">${keys.length}</span></summary><table>${rows.join("")}</table></details>`);
}

const exRows = lib.map((e) => {
  n++;
  const x = heEx[e.id];
  const ext = e.ext ?? "svg";
  let img = `./img/ex/${e.id}/0.${ext}`;
  if (inline && e.images) img = `data:image/${ext === "svg" ? "svg+xml" : ext};base64,` + fs.readFileSync(new URL(`../img/ex/${e.id}/0.${ext}`, import.meta.url)).toString("base64");
  return `<tr id="r${n}"><td class="n">${n}</td><td class="thumb">${e.images ? `<img src="${img}" alt="" loading="lazy">` : ""}</td>
  <td><div class="en"><b>${esc(e.name)}</b></div><div class="en how">${esc(e.howto)}</div></td>
  <td><div class="he"><b>${esc(x.he)}</b></div><div class="he alias">${esc((x.aliases ?? []).join(" · "))}</div><div class="he how">${esc(x.howto)}</div></td></tr>`;
});
sections.push(`<details open><summary>Exercises <span class="cnt">${lib.length}</span></summary><table class="ex">${exRows.join("")}</table></details>`);

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hebrew review</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
:root{--bg:#fafaf7;--fg:#1c1c1a;--muted:#6b6b66;--card:#fff;--line:#e3e3dc;--acc:#1a6b4a;--chip:#eef3ef}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#141413;--fg:#ecece8;--muted:#9a9a93;--card:#1d1d1b;--line:#33332f;--acc:#6fcf9f;--chip:#23302a}}
:root[data-theme="dark"]{--bg:#141413;--fg:#ecece8;--muted:#9a9a93;--card:#1d1d1b;--line:#33332f;--acc:#6fcf9f;--chip:#23302a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;padding-block:16px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
h1{font-size:22px;margin:0 0 4px}p.lead{margin:0 0 12px;color:var(--muted)}
.bar{position:sticky;top:0;background:var(--bg);padding:8px 0;z-index:2}
input{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--fg);font:inherit}
details{margin:14px 0;border:1px solid var(--line);border-radius:12px;background:var(--card);overflow:hidden}
summary{cursor:pointer;padding:12px 14px;font-weight:600}.cnt{color:var(--muted);font-weight:400;margin-inline-start:6px}
table{width:100%;border-collapse:collapse}td{vertical-align:top;padding:10px 12px;border-top:1px solid var(--line)}
td.n{width:44px;color:var(--acc);font-weight:700;font-variant-numeric:tabular-nums}
code{font-size:11px;color:var(--muted);display:block;direction:ltr;overflow-wrap:anywhere}
.he{direction:rtl;text-align:right;unicode-bidi:plaintext;white-space:normal}.en{direction:ltr;text-align:left}
.var{margin-top:6px;padding:6px 8px;background:var(--chip);border-radius:8px;font-size:13px}
.how{font-size:13px;color:var(--muted);margin-top:4px}.alias{font-size:13px;color:var(--acc)}
.thumb img{width:64px;height:64px;object-fit:contain;background:#fff;border-radius:8px}
tr.hide{display:none}
@media (max-width:640px){td{padding:8px}table,tbody,tr,td{display:block}tr{border-top:1px solid var(--line);padding:6px 4px}td{border:0;padding:4px 8px}td.n{width:auto}}
</style></head><body>
<h1>Hebrew review</h1>
<p class="lead">${n} rows. Reply with the row number and the fix, for example "row 123: ...". Neutral wording is the default; male and female variants are shown under the row when they exist.</p>
<div class="bar"><input id="q" type="search" placeholder="Filter rows (English or Hebrew)" autocomplete="off"></div>
${sections.join("\n")}
<script>
const q=document.getElementById("q");
q.addEventListener("input",()=>{const v=q.value.trim().toLowerCase();document.querySelectorAll("tr").forEach(r=>r.classList.toggle("hide",!!v&&!r.textContent.toLowerCase().includes(v)))});
</script></body></html>
`;
const body = inline ? page.split(String.fromCharCode(10)).filter((l) => !/^<!doctype|^<html|^<meta charset|^<meta name="viewport"/.test(l)).join(String.fromCharCode(10)).replace("</head><body>", "").replace("</body></html>", "") : page;
fs.mkdirSync(new URL("../docs/", import.meta.url), { recursive: true });
fs.writeFileSync(out, body);
console.log(`${out}: ${n} rows, ${(page.length / 1024) | 0} KB`);
