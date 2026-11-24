import { GOALS } from "./constants.js";
import { localDate } from "./weight.js";
import { t } from "./i18n/index.js";

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
  // Photo and sound references used by sync: { [mediaKey]: { id: sealed-file id or null (deleted), updatedAt } }.
  if (
    o.mediaRefs !== undefined &&
    !(isObj(o.mediaRefs) && Object.values(o.mediaRefs).every((m) => isObj(m) && (m.id === null || str(m.id)) && num(m.updatedAt)))
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
  // Sync groundwork (all optional, so data from before them stays valid).
  if (
    o.deleted !== undefined &&
    !(isObj(o.deleted) && Object.values(o.deleted).every(num))
  )
    return false;
  if (o.settings.updatedAt !== undefined && !num(o.settings.updatedAt))
    return false;
  // Sharing (all optional): the name others see, and the one switch for body weight to a coach.
  if (o.settings.shareName !== undefined && !str(o.settings.shareName)) return false;
  if (o.settings.shareWeight !== undefined && typeof o.settings.shareWeight !== "boolean") return false;
  // Calendar subscription (optional): feed id + write token, and the person's time choice. Extra keys are tolerated.
  const cal = o.settings.calendar;
  if (
    cal !== undefined &&
    !(
      isObj(cal) &&
      /^[A-Za-z0-9_-]{22}$/.test(cal.id) &&
      /^[A-Za-z0-9_-]{43}$/.test(cal.token) &&
      (cal.time === null || (str(cal.time) && /^([01]\d|2[0-3]):[0-5]\d$/.test(cal.time))) &&
      Number.isInteger(cal.mins) && cal.mins >= 15 && cal.mins <= 240 &&
      typeof cal.autoMins === "boolean" &&
      typeof cal.alarm === "boolean"
    )
  )
    return false;
  if (o.swapCounts !== undefined && !isObj(o.swapCounts)) return false;
  if (
    o.workoutOrder !== undefined &&
    !(isObj(o.workoutOrder) && Array.isArray(o.workoutOrder.ids) && (o.workoutOrder.updatedAt === undefined || num(o.workoutOrder.updatedAt)))
  )
    return false;
  if (o.swapCounts?.updatedAt !== undefined && !num(o.swapCounts.updatedAt))
    return false;
  const stamped = [
    o.customExercises,
    o.workouts,
    o.sessions,
    o.bodyWeights ?? [],
  ];
  if (
    !stamped.every((c) =>
      c.every(
        (r) => !isObj(r) || r.updatedAt === undefined || num(r.updatedAt),
      ),
    )
  )
    return false;
  return o.sessions.every(
    (s) =>
      isObj(s) && str(s.id) && num(s.startedAt) && entriesOk(s.entries, false),
  );
}

const COLLECTIONS = ["customExercises", "workouts", "sessions", "bodyWeights"];
// What counts as "changed": the record's JSON. Its updatedAt is in it but only written here, so it
// matches the snapshot unless the record changed. Settings skip the per-device export time.
// No replacer function: it made every save about 5x slower on a large history.
const sig = (r) => JSON.stringify(r);
const settingsSig = (s) => JSON.stringify({ ...s, lastExportAt: undefined });

// id -> signature of every syncable record, plus "settings". Given the previous snapshot it first
// stamps changed records and tombstones removed ones, all in place (screens hold references).
function snapshotOf(state, prev = null) {
  const now = Date.now();
  const m = new Map();
  m.upd = new Map(); // id -> updatedAt as last saved, so a tombstone can beat it
  const add = (id, r, f) => {
    let s = f(r);
    if (prev && prev.get(id) !== s) {
      r.updatedAt = Math.max(now, (r.updatedAt ?? 0) + 1);
      s = f(r);
    }
    m.set(id, s);
    m.upd.set(id, r.updatedAt ?? 0);
  };
  add("settings", state.settings, settingsSig);
  // Plan-day order: one small record {ids, updatedAt}, written only when the plan's days changed
  // (added, removed or reordered) since the last save. The later reorder wins on merge.
  const ids = state.workouts.map((w) => w.id).filter(Boolean);
  m.order = sig(ids);
  if (prev && prev.order !== m.order)
    state.workoutOrder = { ids, updatedAt: Math.max(now, (state.workoutOrder?.updatedAt ?? 0) + 1) };
  // swapCounts is one small map, synced like settings (whole map, later edit wins); created on first swap.
  if (state.swapCounts) add("swapCounts", state.swapCounts, sig);
  for (const c of COLLECTIONS)
    for (const r of state[c] ?? []) if (r && r.id) add(r.id, r, sig);
  if (prev)
    for (const id of prev.keys())
      if (!m.has(id))
        (state.deleted ??= {})[id] = Math.max(now, (prev.upd?.get(id) ?? 0) + 1, state.deleted?.[id] ?? 0);
  return m;
}

export function createStore(storage) {
  let snap = null; // null until load()/first save: then nothing is stamped or tombstoned
  return {
    load() {
      let raw = null;
      try {
        raw = storage.getItem(KEY);
      } catch {
        // Unreadable: the shell blocks saving until the user confirms, so unseen data is not overwritten.
        return { state: emptyState(), recovered: true, kept: false };
      }
      if (raw == null) {
        snap = snapshotOf(emptyState());
        return { state: emptyState(), recovered: false, kept: true };
      }
      try {
        const parsed = JSON.parse(raw);
        if (isValidState(parsed)) {
          for (const w of parsed.workouts) w.id ??= crypto.randomUUID();
          // Unknown language or wording values count as "not set" (Auto / neutral).
          if (parsed.settings.lang !== undefined && !["auto", "en", "he"].includes(parsed.settings.lang)) delete parsed.settings.lang;
          if (parsed.settings.gender !== undefined && !["neutral", "male", "female"].includes(parsed.settings.gender)) delete parsed.settings.gender;
          snap = snapshotOf(parsed);
          return { state: parsed, recovered: false, kept: true };
        }
      } catch {}
      let kept = true;
      try {
        storage.setItem(CORRUPT_KEY, raw); // keep the bad data for manual rescue
      } catch {
        kept = false; // bad data could not be set aside; UI should warn before saving
      }
      snap = snapshotOf(emptyState());
      return { state: emptyState(), recovered: true, kept };
    },
    // resetSnapshot: the state was swapped wholesale (backup restore), so nothing counts as deleted or edited.
    save(state, { resetSnapshot = false } = {}) {
      try {
        const next = snapshotOf(state, resetSnapshot ? null : snap);
        storage.setItem(KEY, JSON.stringify(state));
        snap = next; // only after a successful write
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
    throw new Error(t("store.notBackup"));
  return parsed;
}
