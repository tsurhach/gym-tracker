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
  return o.sessions.every(
    (s) =>
      isObj(s) &&
      Array.isArray(s.entries) &&
      s.entries.every(
        (e) =>
          isObj(e) &&
          Array.isArray(e.sets) &&
          e.sets.every(
            (t) =>
              isObj(t) &&
              typeof t.weight === "number" &&
              typeof t.reps === "number",
          ),
      ),
  );
}

export function createStore(storage) {
  return {
    load() {
      let raw = null;
      try {
        raw = storage.getItem(KEY);
      } catch {
        return { state: emptyState(), recovered: false };
      }
      if (raw == null) return { state: emptyState(), recovered: false };
      try {
        const parsed = JSON.parse(raw);
        if (isValidState(parsed)) return { state: parsed, recovered: false };
      } catch {}
      try {
        storage.setItem(CORRUPT_KEY, raw); // keep the bad data for manual rescue
      } catch {}
      return { state: emptyState(), recovered: true };
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
