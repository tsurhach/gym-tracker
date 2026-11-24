import en from "./en.js";
import he from "./he.js";

const DICTS = { en, he };

// Hebrew stays hidden from live users until chunk 4 flips this. `?he=1` in the address turns it on for testing.
export const HE_READY = false;
export const heEnabled = (search = globalThis.location?.search ?? "") => HE_READY || /[?&]he=1(&|$)/.test(search);

export const LANGS = ["auto", "en", "he"];
export const GENDERS = ["neutral", "male", "female"];

// settings.lang + the phone's language -> "en" | "he". Unknown/missing = auto; Hebrew only when enabled.
export function resolveLang(setting, navLang = "", enabled = heEnabled()) {
  const pick = setting === "en" || setting === "he" ? setting : String(navLang).toLowerCase().startsWith("he") ? "he" : "en";
  return pick === "he" && enabled ? "he" : "en";
}
export const dirOf = (lang) => (lang === "he" ? "rtl" : "ltr");

// Pure lookup (tests pass their own dictionaries). Order: language (gender variant, then neutral), then English, then the key.
export function translate(dicts, lang, gender, key, vars = {}) {
  const suffix = gender === "male" ? ".m" : gender === "female" ? ".f" : null;
  let v;
  for (const l of [lang, "en"]) {
    const d = dicts[l] ?? {};
    v = (suffix && d[key + suffix]) ?? d[key];
    if (v !== undefined) break;
  }
  if (v === undefined) return key;
  if (typeof v === "object") {
    let cat = "other";
    try {
      if (vars.n !== undefined) cat = new Intl.PluralRules(lang).select(Number(vars.n));
    } catch {}
    v = v[cat] ?? v.other ?? key;
  }
  return String(v).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

let current = "en";
let currentGender = "neutral";
export const lang = () => current;
export const setLang = (l) => void (current = DICTS[l] ? l : "en");
export const setGender = (g) => void (currentGender = GENDERS.includes(g) ? g : "neutral");
export const t = (key, vars) => translate(DICTS, current, currentGender, key, vars);

// Western digits in both languages.
export const fmtNum = (n) => Number(n).toLocaleString("en-US");

// Numbers, units and timers keep their left-to-right order inside a Hebrew sentence. Pass text already escaped.
export const ltr = (html) => `<bdi dir="ltr">${html}</bdi>`;

// The page language and direction (the head script sets the same before first paint).
export function applyLang(settings, navLang = globalThis.navigator?.language, doc = globalThis.document) {
  setLang(resolveLang(settings?.lang, navLang));
  setGender(settings?.gender);
  if (doc) {
    doc.documentElement.lang = current;
    doc.documentElement.dir = dirOf(current);
  }
  rememberLang();
  return current;
}

// The service worker reads this to write the rest notification in the right language.
function rememberLang() {
  try {
    globalThis.caches?.open("gym-prefs").then((c) => c.put("./__lang", new Response(current))).catch(() => {});
  } catch {}
}
