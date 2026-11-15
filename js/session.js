import { GOALS, DEFAULT_STEP } from "./constants.js";
import { prefill, exerciseHistory } from "./logic.js";

export function newItem(exerciseId, goalKey) {
  const { sets, repMin, repMax } = GOALS[goalKey];
  return { exerciseId, sets, repMin, repMax, step: DEFAULT_STEP };
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
    sets: prefill(last, item).map((s) => ({ ...s, done: false })),
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

export function finishSession(state, now) {
  const a = state.active;
  if (!a) return state;
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
