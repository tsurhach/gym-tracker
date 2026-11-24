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

// Numbers, units and timers keep their left-to-right order inside a Hebrew sentence. Pass html already escaped.
// In English both return their input unchanged, so English output stays byte-for-byte what it was.
export const ltr = (html) => (current === "he" ? `<bdi dir="ltr">${html}</bdi>` : html);
// Same for text set with textContent / aria-label (uses Unicode isolates instead of an element).
export const ltrText = (s) => (current === "he" ? "⁦" + s + "⁩" : s);

const DAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_EN_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const heFmt = (opts, d) => new Intl.DateTimeFormat("he-IL", opts).format(d);
// Day of week 0 (Sunday) to 6, "short" | "long".
export const weekday = (i, style = "short") =>
  current === "he" ? heFmt({ weekday: style }, new Date(2023, 0, 1 + i)) : (style === "long" ? DAYS_EN_LONG : DAYS_EN)[i];
// "Thu 12 Nov" (local time).
export const fmtDate = (ms) => {
  const d = new Date(ms);
  return current === "he" ? heFmt({ weekday: "short", day: "numeric", month: "short" }, d) : `${DAYS_EN[d.getDay()]} ${d.getDate()} ${MONTHS_EN[d.getMonth()]}`;
};
// A key whose last part is a data value (muscle, goal, equipment): tk("muscle", "Chest"). Every value must have a key (tests check).
export const tk = (prefix, value) => t(`${prefix}.${value}`);

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

// ---- Hebrew exercise names (data/exercises.he.json: { id: { he, aliases, howto } }), loaded by app.js when Hebrew is enabled ----
let EXHE = {};
export const setExHe = (m) => void (EXHE = m && typeof m === "object" ? m : {});
export const exHe = (id) => EXHE[id];
const escH = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// Plain text name: Hebrew name in Hebrew, else the stored English name.
export const exName = (id, name) => (current === "he" && EXHE[id]?.he) || name;
// Row form: Hebrew name with the English name small underneath (English only in English). Returns escaped html.
export const exTwo = (id, name) =>
  current === "he" && EXHE[id]?.he ? `${escH(EXHE[id].he)}<small class="en-sub" dir="ltr" lang="en">${escH(name)}</small>` : escH(name);
export const exHowto = (id, howto) => (current === "he" && EXHE[id]?.howto) || howto;
// Search folding: lowercase, no niqqud/cantillation, no geresh/gershayim/quotes, final letters folded, spaces collapsed.
export const normHe = (s) =>
  String(s).toLowerCase().replace(/[\u0591-\u05C7]/g, "").replace(/[׳״'"`’]/g, "")
    .replace(/ך/g, "כ").replace(/ם/g, "מ").replace(/ן/g, "נ").replace(/ף/g, "פ").replace(/ץ/g, "צ")
    .replace(/[-־]/g, " ").replace(/\s+/g, " ").trim();
const HEB = /[\u0590-\u05FF]/;
export const hasHebrew = (s) => HEB.test(s);
// Hebrew query vs the Hebrew name and aliases of exercise `id`: 0 name, 1 alias, null none. Every typed word must start a word of the text.
export function heMatch(id, query) {
  const x = EXHE[id];
  if (!x) return null;
  const q = normHe(query).split(" ").filter(Boolean);
  const ok = (text) => {
    const w = normHe(text).split(" ");
    return q.every((p) => w.some((y) => y.startsWith(p)));
  };
  if (ok(x.he)) return 0;
  return (x.aliases ?? []).some(ok) ? 1 : null;
}
