import { newItem } from "./session.js";
import { ltrText, t } from "./i18n/index.js";
import { ALIAS_LIST } from "./planfile.js";

// Pure helpers for building a plan: gym-word search, adding many exercises at once, duplicating a day,
// reordering, and "recent" exercises. No DOM, so they are unit tested.

// Gym shorthand a lifter types -> words that appear in exercise names. Keys are single typed words.
export const SYNONYMS = {
  ohp: "overhead press",
  rdl: "romanian deadlift",
  sldl: "stiff leg deadlift",
  db: "dumbbell",
  dbs: "dumbbell",
  bb: "barbell",
  kb: "kettlebell",
  ez: "ez-bar",
  bw: "body only",
  chinup: "chin up",
  chinups: "chin up",
  pullup: "pull up",
  pullups: "pull up",
  pushup: "push up",
  pushups: "push up",
  situp: "sit up",
  situps: "sit up",
  tri: "triceps",
  tris: "triceps",
  bi: "biceps",
  bis: "biceps",
  quad: "quadriceps",
  hams: "hamstring",
  delt: "shoulder",
  delts: "shoulder",
  skullcrusher: "skull crusher",
  skullcrushers: "skull crusher",
};

const words = (s) => String(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const squash = (s) => words(s).join("");
const stem = (w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);

// 0 = best. null = no match. Space, hyphen and case never matter ("pullup" finds "Pull-Up");
// otherwise every typed word (after the synonyms) must start a word of the name, in any order.
export function matchRank(name, query) {
  const q = squash(query);
  if (!q) return 0;
  const n = squash(name);
  if (n.startsWith(q)) return 0;
  if (words(query).length > 1 && n.includes(q)) return 1; // "push down" finds "Pushdown"
  const nw = words(name);
  const want = words(query).flatMap((w) => words(SYNONYMS[w] ?? w));
  return want.every((w) => nw.some((x) => x.startsWith(w) || x.startsWith(stem(w)))) ? 2 : null;
}

// Name match, or the best match over the plan-file aliases of that exercise ("bosu sit up" finds Bosu Ball Crunch). Aliases rank after names.
function rankWithAliases(e, query) {
  const r = matchRank(e.name, query);
  if (r !== null) return r;
  const hit = (ALIAS_LIST[e.id] ?? []).some((a) => matchRank(a, query) !== null);
  return hit ? 3 : null;
}

// The exercises that match, best first (ties keep the library order). An empty query returns the list as is.
export function searchExercises(list, query) {
  if (!squash(query)) return list;
  return list
    .map((e, i) => ({ e, i, r: rankWithAliases(e, query) }))
    .filter((x) => x.r !== null)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.e);
}

// Add exercises to a day in the given order, skipping ones already there (and repeats in ids).
// Each gets the goal's sets and reps. Returns how many were added.
export function addMany(workout, ids, goalKey) {
  let n = 0;
  for (const id of ids) {
    if (workout.items.some((it) => it.exerciseId === id)) continue;
    workout.items.push(newItem(id, goalKey));
    n++;
  }
  return n;
}

// A copy of a day, added at the END of the plan (so the Today rotation is not disturbed), with a new id and a free name ("Push copy", "Push copy 2").
export function duplicateWorkout(state, w, newId = crypto.randomUUID()) {
  const names = new Set(state.workouts.map((x) => x.name));
  const base = t("planbuild.copy", { name: w.name.slice(0, 33) });
  let name = base;
  for (let k = 2; names.has(name); k++) name = `${base} ${k}`;
  const copy = { ...structuredClone(w), id: newId, name };
  state.workouts.push(copy);
  return copy;
}

// Swap arr[i] with its neighbour (d = -1 up, +1 down). Out of range does nothing.
export function moveItem(arr, i, d) {
  const j = i + d;
  if (i < 0 || i >= arr.length || j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

// Items in the order given by exercise ids (after a drag). Ids not given keep their relative order at the end.
export function orderItems(items, ids) {
  const rank = (it) => {
    const k = ids.indexOf(it.exerciseId);
    return k < 0 ? ids.length : k;
  };
  return items.map((it, i) => ({ it, i })).sort((a, b) => rank(a.it) - rank(b.it) || a.i - b.i).map((x) => x.it);
}

// Supersets: w.supersets = [{ id, ids: [exerciseId, ...] (alternation order), rest: "round" | "each" }]. Every reader
// goes through this, so junk, missing ids and deleted exercises never need clean-up: it keeps only ids present,
// each id in its first group only, groups of 2+, rest "round" unless "each".
export function supersetsOf(list, presentIds) {
  if (!Array.isArray(list)) return [];
  const present = new Set(presentIds);
  const used = new Set();
  const out = [];
  for (const g of list) {
    if (!g || !Array.isArray(g.ids)) continue;
    const ids = [];
    for (const id of g.ids) if (typeof id === "string" && present.has(id) && !used.has(id) && !ids.includes(id)) ids.push(id);
    if (ids.length < 2) continue;
    ids.forEach((id) => used.add(id));
    out.push({ id: typeof g.id === "string" ? g.id : "", ids, rest: g.rest === "each" ? "each" : "round" });
  }
  return out;
}

// Members (items whose exerciseId is in ids) sit together, in ids order, where the first member was. Others keep their order.
export function groupItems(items, ids) {
  const mem = ids.map((id) => items.find((it) => it.exerciseId === id)).filter(Boolean);
  if (mem.length < 2) return items.slice();
  const first = items.findIndex((it) => mem.includes(it));
  const out = [];
  items.forEach((it, i) => {
    if (!mem.includes(it)) out.push(it);
    else if (i === first) out.push(...mem);
  });
  return out;
}

// A new list with oldId replaced by newId inside every group (a swap).
export function renameInSupersets(list, oldId, newId) {
  if (!Array.isArray(list)) return list;
  return list.map((g) => (g && Array.isArray(g.ids) ? { ...g, ids: g.ids.map((id) => (id === oldId ? newId : id)) } : g));
}

// Exercises done in recent workouts, newest first, limited to the given muscles (all if none).
export function recentIds(sessions, muscles, limit = 6) {
  const out = [];
  for (let i = sessions.length - 1; i >= 0 && out.length < limit; i--)
    for (const e of sessions[i].entries ?? [])
      if (!out.includes(e.exerciseId) && (!muscles?.length || muscles.includes(e.primary)) && out.length < limit)
        out.push(e.exerciseId);
  return out;
}

export const summaryText = (it) => ltrText(`${it.sets} × ${it.repMin === it.repMax ? it.repMin : `${it.repMin}–${it.repMax}`}`);
