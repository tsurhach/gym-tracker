import { GOALS } from "./constants.js";

export const KEY = "gymtracker.v1";
export const CORRUPT_KEY = "gymtracker.corrupt";

export function emptyState() {
  return {
    version: 1,
    settings: { goal: "muscle", showPhotos: true, lastExportAt: null },
    customExercises: [],
    workouts: [],
    active: null,
    sessions: [],
  };
}

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

export function isValidState(o) {
  if (!isObj(o) || o.version !== 1 || !isObj(o.settings)) return false;
  if (![o.customExercises, o.workouts, o.sessions].every(Array.isArray))
    return false;
  if (!Object.hasOwn(GOALS, o.settings.goal)) return false;
  const str = (x) => typeof x === "string";
  const num = (x) => typeof x === "number";
  if (
    !o.customExercises.every(
      (c) =>
        isObj(c) &&
        [c.id, c.name, c.primary].every(str) &&
        (c.secondary === undefined || Array.isArray(c.secondary)),
    )
  )
    return false;
  // In-progress sets may hold null while being typed (weight not chosen yet, reps cleared).
  const entriesOk = (entries, draft) =>
    Array.isArray(entries) &&
    entries.every(
      (e) =>
        isObj(e) &&
        str(e.exerciseId) &&
        Array.isArray(e.sets) &&
        e.sets.every(
          (t) =>
            isObj(t) &&
            (num(t.weight) || (draft && t.weight === null)) &&
            (num(t.reps) || (draft && t.reps === null)),
        ),
    );
  const a = o.active;
  if (
    a !== null &&
    !(
      isObj(a) &&
      str(a.workoutName) &&
      num(a.startedAt) &&
      entriesOk(a.entries, true)
    )
  )
    return false;
  if (
    !o.workouts.every(
      (w) =>
        isObj(w) &&
        str(w.name) &&
        Array.isArray(w.muscles) &&
        Array.isArray(w.items) &&
        w.items.every(
          (it) =>
            isObj(it) &&
            str(it.exerciseId) &&
            [it.sets, it.repMin, it.repMax, it.step].every(num),
        ),
    )
  )
    return false;
  return o.sessions.every(
    (s) =>
      isObj(s) && str(s.id) && num(s.startedAt) && entriesOk(s.entries, false),
  );
}

export function createStore(storage) {
  return {
    load() {
      let raw = null;
      try {
        raw = storage.getItem(KEY);
      } catch {
        // Unreadable: the shell blocks saving until the user confirms, so unseen data is not overwritten.
        return { state: emptyState(), recovered: true, kept: false };
      }
      if (raw == null)
        return { state: emptyState(), recovered: false, kept: true };
      try {
        const parsed = JSON.parse(raw);
        if (isValidState(parsed))
          return { state: parsed, recovered: false, kept: true };
      } catch {}
      let kept = true;
      try {
        storage.setItem(CORRUPT_KEY, raw); // keep the bad data for manual rescue
      } catch {
        kept = false; // bad data could not be set aside; UI should warn before saving
      }
      return { state: emptyState(), recovered: true, kept };
    },
    save(state) {
      try {
        storage.setItem(KEY, JSON.stringify(state));
        return true;
      } catch {
        return false;
      }
    },
  };
}

export function exportJson(state) {
  return JSON.stringify(state, null, 2);
}

export function importJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {}
  if (!isValidState(parsed))
    throw new Error("This file is not a Gym Tracker backup.");
  return parsed;
}
