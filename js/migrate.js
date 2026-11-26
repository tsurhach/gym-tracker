import { looseMatch } from "./planfile.js";

// Old plank plans hold rep ranges like 8-12; now that a plank counts seconds that would mean an 8 s hold.
// Once (settings.timedFixed): plan items and the open workout's targets of built-in timed exercises
// whose top is 20 or less get the default timed range. Returns how many were changed.
export function fixTimedPlans(state, library) {
  if (state.settings.timedFixed) return 0;
  const timed = new Set(library.filter((e) => e.timed === true).map((e) => e.id));
  let n = 0;
  const fix = (o) => {
    if (o && timed.has(o.exerciseId ?? o.id) && o.repMax <= 20) {
      Object.assign(o, { repMin: 30, repMax: 45 });
      n++;
    }
  };
  for (const w of state.workouts) w.items.forEach(fix);
  for (const e of state.active?.entries ?? []) if (e.target && timed.has(e.exerciseId) && e.target.repMax <= 20) {
    Object.assign(e.target, { repMin: 30, repMax: 45 });
    n++;
  }
  state.settings.timedFixed = true;
  return n;
}

// One-time, repeat-safe clean-up: a custom exercise that an import made only because the name was spelled a
// little differently ("Dumbbell Bicep Curls") is replaced by the library exercise, so it gets its drawing.
// Customs that have photos or video (mediaKeys) or whose name is not a near-miss are left alone. Every plan
// item, the active workout and every past session moves to the library id; sets are never dropped: an
// exercise that appears twice in one list has its sets joined. Returns the links made, [{ from, to }] by name; empty means nothing changed.
export function linkCustomsToLibrary(state, library, mediaKeys) {
  const links = new Map(); // custom id -> library exercise
  const names = new Map(state.customExercises.map((c) => [c.id, c.name]));
  for (const c of state.customExercises) {
    if (mediaKeys.has(c.id)) continue;
    const lib = looseMatch(c.name, library);
    if (lib) links.set(c.id, lib);
  }
  if (!links.size) return [];

  const entries = (list) => {
    const out = [];
    const joined = new Set(); // library ids that came from a custom row
    for (const e of list) {
      const lib = links.get(e.exerciseId);
      const moved = lib ? { ...e, exerciseId: lib.id, name: lib.name, primary: lib.primary } : e;
      const same = out.find((x) => x.exerciseId === moved.exerciseId);
      if (same && (lib || joined.has(same.exerciseId))) same.sets = [...same.sets, ...moved.sets];
      else out.push(moved);
      if (lib) joined.add(lib.id);
    }
    return out;
  };
  for (const w of state.workouts) {
    const items = [];
    for (const it of w.items) {
      const lib = links.get(it.exerciseId);
      if (!lib) items.push(it);
      else if (!w.items.some((o) => o.exerciseId === lib.id) && !items.some((o) => o.exerciseId === lib.id))
        items.push({ ...it, exerciseId: lib.id }); // the library one is already there: keep it, drop the copy
    }
    w.items = items;
  }
  if (state.active) state.active.entries = entries(state.active.entries);
  for (const s of state.sessions) s.entries = entries(s.entries);
  state.customExercises = state.customExercises.filter((c) => !links.has(c.id));
  return [...links].map(([cid, lib]) => ({ from: names.get(cid), to: lib.name }));
}
