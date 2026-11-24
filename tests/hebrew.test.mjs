import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import en from "../js/i18n/en.js";
import he from "../js/i18n/he.js";
import enCommon from "../js/i18n/en/common.js";
import enTrain from "../js/i18n/en/train.js";
import enPlan from "../js/i18n/en/plan.js";
import enSocial from "../js/i18n/en/social.js";
import enExtra from "../js/i18n/en/extra.js";
import heCommon from "../js/i18n/he/common.js";
import heTrain from "../js/i18n/he/train.js";
import hePlan from "../js/i18n/he/plan.js";
import heSocial from "../js/i18n/he/social.js";
import { checkArea } from "../tools/he-check.mjs";
import { HE_READY, translate, normHe, setExHe, setLang, exName, exTwo, exHowto, heMatch } from "../js/i18n/index.js";
import { searchExercises } from "../js/planbuild.js";
import lib from "../data/exercises.json" with { type: "json" };
import heEx from "../data/exercises.he.json" with { type: "json" };

const sum = (...o) => o.reduce((n, x) => n + Object.keys(x).length, 0);

test("no duplicate key across the en/* area files or the he/* area files", () => {
  assert.equal(Object.keys(en).length, sum(enCommon, enTrain, enPlan, enSocial, enExtra) + 5); // + 5 settings keys in en.js
  assert.equal(Object.keys(he).length, sum(heCommon, heTrain, hePlan, heSocial) + 5);
});

test("Hebrew has every English key; placeholders, html and plural shapes match", async () => {
  for (const [a, e, h] of [["common", enCommon, heCommon], ["train", enTrain, heTrain], ["plan", enPlan, hePlan], ["social", enSocial, heSocial]])
    assert.deepEqual(await checkArea(e, h), [], a);
  for (const k of Object.keys(en)) assert.ok(k in he, `he lacks ${k}`);
  for (const k of Object.keys(he)) assert.ok(k in en || /\.(m|f)$/.test(k) && k.slice(0, -2) in en, `extra ${k}`);
});

test("Hebrew plurals use one/two/other", () => {
  const D = { en, he };
  for (const [k, v] of Object.entries(en)) {
    if (typeof v !== "object") continue;
    const h = he[k];
    assert.ok(h.one && h.two && h.other, k);
    const out = [1, 2, 5].map((n) => translate(D, "he", "neutral", k, { n }));
    assert.equal(new Set(out).size >= 2, true, k);
  }
  assert.match(translate({ he }, "he", "neutral", "today.exercises", { n: 2 }), /2|שני/);
});

test("gender variants: every .m has .f and a neutral base, at most 30", () => {
  const ms = Object.keys(he).filter((k) => k.endsWith(".m"));
  assert.ok(ms.length <= 30, `${ms.length} variants`);
  for (const m of ms) {
    const base = m.slice(0, -2);
    assert.ok(base in he && base + ".f" in he, m);
  }
  for (const f of Object.keys(he).filter((k) => k.endsWith(".f"))) assert.ok(f.slice(0, -2) + ".m" in he, f);
  assert.notEqual(translate({ en, he }, "he", "male", "people.typeCode"), translate({ en, he }, "he", "female", "people.typeCode"));
});

test("exercises.he.json covers every library id and nothing else", () => {
  const ids = new Set(lib.map((e) => e.id));
  assert.deepEqual(Object.keys(heEx).filter((k) => !ids.has(k)), []);
  for (const e of lib) {
    const x = heEx[e.id];
    assert.ok(x, e.id);
    assert.ok(x.he.trim() && x.howto.trim() && Array.isArray(x.aliases) && x.aliases.length >= 1, e.id);
    assert.ok(/[\u0590-\u05FF]/.test(x.he) && /[\u0590-\u05FF]/.test(x.howto), e.id);
  }
  assert.equal(new Set(lib.map((e) => heEx[e.id].he)).size, lib.length, "Hebrew names are unique");
});

test("normHe: niqqud, final letters, geresh and spacing", () => {
  assert.equal(normHe("פּוֹלִי"), "פולי");
  assert.equal(normHe("סקוואט"), normHe("סקוואט"));
  assert.equal(normHe("מכרעים"), normHe("מכרעים"));
  assert.equal(normHe("פרנץ' פרס"), "פרנצ פרס");
  assert.equal(normHe("ג׳ים"), "גימ");
  assert.equal(normHe("  שכיבות   סמיכה "), "שכיבות סמיכה");
  assert.equal(normHe("אמות"), normHe("אמות"));
  assert.equal(normHe("ךםןףץ"), "כמנפצ");
});

test("search finds by Hebrew name or alias, in both languages; English still works", () => {
  setExHe(heEx);
  for (const lang of ["en", "he"]) {
    setLang(lang);
    assert.ok(searchExercises(lib, "פולי").some((e) => e.id === "wide-grip-lat-pulldown"), lang);
    assert.ok(searchExercises(lib, "סקוואט").some((e) => e.id === "barbell-squat"), lang);
    assert.ok(searchExercises(lib, "bench").some((e) => e.id === "bench-press"), lang);
    assert.deepEqual(searchExercises(lib, "זזזזזזז"), []);
  }
  const first = searchExercises(lib, heEx["pec-deck-fly"].he)[0];
  assert.equal(first.id, "pec-deck-fly");
  assert.equal(heMatch("pull-up", "מתח") !== null, true);
  setLang("en");
});

test("exercise display helpers: Hebrew name with English small underneath, English unchanged", () => {
  setExHe(heEx);
  setLang("en");
  assert.equal(exName("bench-press", "Bench Press"), "Bench Press");
  assert.equal(exTwo("bench-press", "Bench Press"), "Bench Press");
  assert.equal(exHowto("bench-press", "x"), "x");
  setLang("he");
  assert.equal(exName("bench-press", "Bench Press"), heEx["bench-press"].he);
  assert.match(exTwo("bench-press", "Bench Press"), /<small class="en-sub" dir="ltr" lang="en">Bench Press<\/small>/);
  assert.equal(exHowto("bench-press", "x"), heEx["bench-press"].howto);
  assert.equal(exTwo("custom-1", "My <lift>"), "My &lt;lift&gt;"); // custom: no Hebrew, escaped
  setLang("en");
});

test("service worker caches the Hebrew files and writes the push text in Hebrew", () => {
  const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  for (const f of ["data/exercises.he.json", "js/i18n/he/common.js", "js/i18n/he/train.js", "js/i18n/he/plan.js", "js/i18n/he/social.js"]) assert.ok(sw.includes(`./${f}`), f);
  assert.ok(sw.includes("המנוחה הסתיימה") && sw.includes("הזמן לסט הבא."));
});

test("index.html head script HE_READY equals the exported flag", () => {
  const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.equal(html.match(/var HE_READY = (true|false);/)[1], String(HE_READY));
  assert.ok(html.includes("HE_READY || /[?&]he=1"));
});
