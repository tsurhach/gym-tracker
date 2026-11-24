// Compares a Hebrew area file with its English twin: node tools/he-check.mjs common|train|plan|social
// Reports missing/extra keys, placeholder and HTML tag mismatches, bad plural shapes, bad .m/.f variants, Latin letters left in text.
export async function checkArea(en, he) {
  const bad = [];
  const ph = (s) => [...String(s).matchAll(/\{(?:[^|{}]+\|)?(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  const tags = (s) => [...String(s).matchAll(/<\/?([a-z0-9]+)[^>]*>/gi)].map((m) => m[0].toLowerCase().replace(/\s+/g, " ")).sort().join("");
  const vals = (v) => (typeof v === "object" ? Object.entries(v) : [["", v]]);
  for (const k of Object.keys(en)) if (!(k in he)) bad.push(`missing ${k}`);
  for (const [k, v] of Object.entries(he)) {
    const base = k.replace(/\.(m|f)$/, "");
    if (!(base in en)) { bad.push(`extra ${k}`); continue; }
    if (k !== base && !(base in he)) bad.push(`variant without neutral ${k}`);
    if (k.endsWith(".m") && !(base + ".f" in he)) bad.push(`.m without .f ${k}`);
    if (k.endsWith(".f") && !(base + ".m" in he)) bad.push(`.f without .m ${k}`);
    const e = en[base];
    if (typeof e === "object" !== (typeof v === "object")) { bad.push(`plural shape ${k}`); continue; }
    if (typeof v === "object") {
      for (const c of ["one", "two", "other"]) if (typeof v[c] !== "string") bad.push(`plural ${k} lacks ${c}`);
      for (const c of Object.keys(v)) if (!["one", "two", "other"].includes(c)) bad.push(`plural ${k} bad category ${c}`);
    }
    for (const [, s] of vals(v)) {
      const es = typeof e === "object" ? e.other : e;
      // plural forms may drop {n} ("a day", "two days") but must not invent placeholders
      const extraPh = ph(s).split(",").filter((p) => p && !ph(es).split(",").includes(p));
      if (extraPh.length) bad.push(`placeholder ${k}: ${extraPh}`);
      if (typeof e !== "object" && ph(s) !== ph(es)) bad.push(`placeholder ${k}: en ${ph(es)} he ${ph(s)}`);
      if (tags(s) !== tags(es)) bad.push(`html tags ${k}`);
    }
  }
  return bad;
}
if (import.meta.url === `file://${process.argv[1].replaceAll("\\", "/")}` || process.argv[1]?.endsWith("he-check.mjs")) {
  const area = process.argv[2];
  const en = (await import(`../js/i18n/en/${area}.js`)).default;
  const he = (await import(`../js/i18n/he/${area}.js`)).default;
  const bad = await checkArea(en, he);
  console.log(bad.length ? bad.join("\n") : "OK");
  const m = Object.keys(he).filter((k) => k.endsWith(".m")).length;
  console.log(`${Object.keys(he).length} keys, ${m} .m variants`);
  process.exitCode = bad.length ? 1 : 0;
}
