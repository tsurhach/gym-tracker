import { GOALS, DEFAULT_STEP } from "./constants.js";
import { prefill, exerciseHistory, pairKey } from "./logic.js";

export function newItem(exerciseId, goalKey) {
  const { sets, repMin, repMax } = GOALS[goalKey];
  return { exerciseId, sets, repMin, repMax, step: DEFAULT_STEP };
}

// Set the goal; with applyToAll, also give every plan item the goal's sets and reps (step is kept).
export function applyGoal(state, goalKey, applyToAll) {
  state.settings.goal = goalKey;
  if (applyToAll) {
    const { sets, repMin, repMax } = GOALS[goalKey];
    for (const w of state.workouts)
      for (const it of w.items) Object.assign(it, { sets, repMin, repMax });
  }
  return state;
}

// Remove a custom exercise and every plan item that uses it. Sessions and the active
// workout keep their entries (name and primary are copied into each entry).
export function deleteCustomExercise(state, id) {
  state.customExercises = state.customExercises.filter((c) => c.id !== id);
  for (const w of state.workouts)
    w.items = w.items.filter((it) => it.exerciseId !== id);
  return state;
}

function makeEntry(state, item, lookup) {
  const ex = lookup(item.exerciseId);
  if (!ex) return null;
  const history = exerciseHistory(state.sessions, item.exerciseId);
  const last = history.length ? history[history.length - 1].sets : null;
  return {
    exerciseId: ex.id,
    name: ex.name,
    primary: ex.primary,
    sets: prefill(last, item, ex, state.settings).map((s) => ({ ...s, done: false })),
  };
}

export function startSession(state, workoutId, lookup, now) {
  const workout = state.workouts.find((w) => w.id === workoutId);
  if (state.active || !workout) return state;
  state.active = {
    id: crypto.randomUUID(),
    workoutId,
    workoutName: workout.name,
    startedAt: now,
    finishedAt: null,
    entries: workout.items
      .map((it) => makeEntry(state, it, lookup))
      .filter(Boolean),
  };
  return state;
}

export function addEntry(state, exerciseId, lookup) {
  const a = state.active;
  if (!a || a.entries.some((e) => e.exerciseId === exerciseId)) return state;
  const entry = makeEntry(
    state,
    newItem(exerciseId, state.settings.goal),
    lookup,
  );
  if (entry) a.entries.push(entry);
  return state;
}

// Swap an exercise in today's workout. The new entry takes the old one's plan targets (kept on
// entry.target, read by itemFor). Done sets stay on the old entry; the new one gets the remaining sets.
// inPlan: also replace the exercise in the workout's plan (unless the new one is already there).
export function swapEntry(state, oldId, newId, lookup, { inPlan = false } = {}) {
  const a = state.active;
  const i = a?.entries.findIndex((e) => e.exerciseId === oldId) ?? -1;
  if (i < 0 || oldId === newId || a.entries.some((e) => e.exerciseId === newId)) return state;
  const old = a.entries[i];
  const w = state.workouts.find((x) => x.id === a.workoutId);
  const pi = w?.items.find((it) => it.exerciseId === oldId);
  const { sets, repMin, repMax, step } = old.target ?? pi ?? newItem(oldId, state.settings.goal);
  const done = old.sets.filter((s) => s.done);
  const left = done.length ? Math.max(1, sets - done.length) : sets;
  const entry = makeEntry(state, { exerciseId: newId, sets: left, repMin, repMax, step }, lookup);
  if (!entry) return state;
  entry.target = { sets, repMin, repMax, step };
  if (done.length) a.entries.splice(i, 1, { ...old, sets: done }, entry);
  else a.entries[i] = entry;
  const k = pairKey(oldId, newId);
  state.swapCounts = { ...state.swapCounts, [k]: (state.swapCounts?.[k] ?? 0) + 1 };
  if (inPlan && pi && !w.items.some((it) => it.exerciseId === newId)) pi.exerciseId = newId;
  return state;
}

export function finishSession(state, now) {
  const a = state.active;
  if (!a) return state;
  delete a.rest; // the rest timer is not part of a saved session
  a.entries = a.entries
    .map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) }))
    .filter((e) => e.sets.length > 0);
  if (a.entries.length > 0) {
    a.finishedAt = now;
    state.sessions.push(a);
  }
  state.active = null;
  return state;
}

export function discardSession(state) {
  state.active = null;
  return state;
}

export function deleteSession(state, sessionId) {
  state.sessions = state.sessions.filter((s) => s.id !== sessionId);
  return state;
}

// Delete one logged set. An entry left with no sets is removed; a session left with
// no entries is deleted. Unknown ids or indexes change nothing.
export function removeSet(state, sessionId, entryIndex, setIndex) {
  const ses = state.sessions.find((s) => s.id === sessionId);
  const entry = ses?.entries[entryIndex];
  if (!entry?.sets[setIndex]) return state;
  entry.sets.splice(setIndex, 1);
  if (entry.sets.length === 0) ses.entries.splice(entryIndex, 1);
  if (ses.entries.length === 0) deleteSession(state, sessionId);
  return state;
}
