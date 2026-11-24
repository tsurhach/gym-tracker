import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { translate, resolveLang, dirOf, t, setLang, setGender, lang, HE_READY } from "../js/i18n/index.js";
import en from "../js/i18n/en.js";
import he from "../js/i18n/he.js";
import { createStore, emptyState, KEY } from "../js/store.js";

const D = {
  en: { hi: "Hello {name}", sets: { one: "{n} set", other: "{n} sets" }, only: "English only", "ask": "Add it", "ask.f": "Add it (f)" },
  he: { hi: "שלום {name}", sets: { one: "סט אחד", two: "2 סטים", other: "{n} סטים" }, "ask": "להוסיף", "ask.m": "תוסיף", "ask.f": "תוסיפי" },
};

test("t: fallback to English, then to the key; placeholders", () => {
  assert.equal(translate(D, "he", "neutral", "hi", { name: "דנה" }), "שלום דנה");
  assert.equal(translate(D, "he", "neutral", "only"), "English only");
  assert.equal(translate(D, "he", "neutral", "nope"), "nope");
  assert.equal(translate(D, "xx", "neutral", "only"), "English only");
  assert.equal(translate(D, "en", "neutral", "hi", {}), "Hello {name}");
});

test("t: plurals (he one/two/other, en one/other)", () => {
  const he = (n) => translate(D, "he", "neutral", "sets", { n });
  assert.deepEqual([1, 2, 5, 0, 11].map(he), ["סט אחד", "2 סטים", "5 סטים", "0 סטים", "11 סטים"]);
  const en = (n) => translate(D, "en", "neutral", "sets", { n });
  assert.deepEqual([1, 2, 0].map(en), ["1 set", "2 sets", "0 sets"]);
  // a missing category falls back to other
  assert.equal(translate({ he: { s: { other: "x{n}" } } }, "he", "neutral", "s", { n: 1 }), "x1");
});

test("t: gender variants fall back to the neutral key", () => {
  assert.equal(translate(D, "he", "neutral", "ask"), "להוסיף");
  assert.equal(translate(D, "he", "male", "ask"), "תוסיף");
  assert.equal(translate(D, "he", "female", "ask"), "תוסיפי");
  assert.equal(translate(D, "he", "male", "hi", { name: "x" }), "שלום x"); // no .m variant: neutral
  assert.equal(translate(D, "en", "male", "ask"), "Add it");
  assert.equal(translate(D, "en", "female", "ask"), "Add it (f)");
  assert.equal(translate({ en: D.en, he: {} }, "he", "male", "ask"), "Add it"); // he missing: English
});

test("resolveLang: auto follows the phone, explicit wins, Hebrew needs the flag", () => {
  assert.equal(resolveLang("auto", "he-IL", true), "he");
  assert.equal(resolveLang(undefined, "he", true), "he");
  assert.equal(resolveLang("auto", "en-US", true), "en");
  assert.equal(resolveLang("en", "he-IL", true), "en");
  assert.equal(resolveLang("he", "en-US", true), "he");
  assert.equal(resolveLang("klingon", "he-IL", true), "he"); // unknown = auto
  assert.equal(resolveLang("he", "he-IL", false), "en"); // flag off: live users never see Hebrew
  assert.equal(HE_READY, false);
  assert.equal(dirOf("he"), "rtl");
  assert.equal(dirOf("en"), "ltr");
});

test("module t uses the current language and wording; English is the default", () => {
  assert.equal(lang(), "en");
  assert.equal(t("settings.wording"), "Wording");
  setLang("he");
  assert.equal(t("settings.wording"), "ניסוח");
  setGender("female");
  assert.equal(t("settings.gender.male"), "זכר");
  setLang("zz");
  setGender("zz");
  assert.equal(lang(), "en");
});

test("he.js has no keys English lacks; every t() key used in code exists in en.js", () => {
  for (const k of Object.keys(he)) assert.ok(k in en || /\.(m|f)$/.test(k) && k.slice(0, -2) in en, k);
  const files = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(d + e.name + "/") : /\.js$/.test(e.name) && !d.includes("i18n") && files.push(d + e.name)));
  walk(fileURLToPath(new URL("../js/", import.meta.url)).replaceAll("\\", "/") + "/");
  for (const f of files)
    for (const m of fs.readFileSync(f, "utf8").matchAll(/\bt\("([\w.]+)"/g)) assert.ok(m[1] in en, `${f}: ${m[1]}`);
});

// Head script: html lang/dir before first paint.
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function boot(settings, { search = "?he=1", navLang = "en-US" } = {}) {
  const root = { dataset: {} };
  vm.runInNewContext(script, {
    window: {},
    document: { documentElement: root, querySelector: () => ({}) },
    localStorage: { getItem: () => (settings === null ? null : JSON.stringify({ settings })) },
    matchMedia: () => ({ matches: false }),
    location: { search },
    navigator: { language: navLang },
  });
  return root;
}
test("head script sets html lang and dir (Hebrew only with the flag)", () => {
  assert.deepEqual([boot({ lang: "he" }).lang, boot({ lang: "he" }).dir], ["he", "rtl"]);
  assert.deepEqual([boot({ lang: "en" }, { navLang: "he-IL" }).lang, boot({ lang: "en" }).dir], ["en", "ltr"]);
  assert.equal(boot({}, { navLang: "he-IL" }).dir, "rtl"); // auto
  assert.equal(boot({ lang: "he" }, { search: "" }).dir, "ltr"); // flag off
  assert.equal(boot(null).lang, "en");
});

test("old saved state without lang/gender is untouched; bad values are dropped", () => {
  const mem = (o) => {
    const m = new Map([[KEY, JSON.stringify(o)]]);
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  };
  const old = emptyState();
  assert.deepEqual(createStore(mem(old)).load().state, old);
  const bad = { ...emptyState(), settings: { ...emptyState().settings, lang: "fr", gender: 5 } };
  const s = createStore(mem(bad)).load().state.settings;
  assert.equal(s.lang, undefined);
  assert.equal(s.gender, undefined);
  const ok = { ...emptyState(), settings: { ...emptyState().settings, lang: "he", gender: "female" } };
  const s2 = createStore(mem(ok)).load().state.settings;
  assert.deepEqual([s2.lang, s2.gender], ["he", "female"]);
});

test("styles.css: only symmetric left/right remain (everything else is logical)", () => {
  const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const found = css.split(/\r?\n/).map((l) => l.trim()).filter((l) => /\b(left|right)\b/.test(l) && !l.startsWith("/*") && !l.includes('[dir="rtl"]'));
  const allowed = new Set(["left: 0;", "right: 0;", "left: 12px;", "right: 12px;", "transform-origin: left;", "border-right: 2px solid var(--muted);", "transform-origin: right;"]);
  for (const l of found) assert.ok(allowed.has(l), l);
});
