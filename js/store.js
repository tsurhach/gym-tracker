import { GOALS } from "./constants.js";
import { localDate } from "./weight.js";

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
  if (
    o.bodyWeights !== undefined &&
    !(
      Array.isArray(o.bodyWeights) &&
      o.bodyWeights.every(
        (w) =>
          isObj(w) &&
          str(w.id) &&
          /^\d{4}-\d{2}-\d{2}$/.test(w.date) &&
          Number.isFinite(w.kg),
      )
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

const csvCell = (v) =>
  /[",\r\n]/.test(String(v))
    ? `"${String(v).replaceAll('"', '""')}"`
    : String(v);

// Names only: a leading = + - @ would run as a formula in a spreadsheet, so mark it as text.
const txt = (v) => (/^[=+\-@]/.test(String(v)) ? `'${v}` : v);

// One row per confirmed set of finished workouts, for a spreadsheet.
export function exportCsv(state) {
  const rows = [["date", "workout", "exercise", "set", "weight_kg", "reps"]];
  for (const s of state.sessions)
    for (const e of s.entries)
      e.sets
        .filter((x) => x.done)
        .forEach((x, i) =>
          rows.push([
            localDate(new Date(s.startedAt)),
            txt(s.workoutName),
            txt(e.name),
            i + 1,
            x.weight,
            x.reps,
          ]),
        );
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
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
