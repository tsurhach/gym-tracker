// A saved state in main's format (before accounts/sync) must load and survive unchanged,
// with sync off (plain store) and with sync on (sign-in, push, a second phone pulling it).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, isValidState, KEY } from "../js/store.js";
import { createSync } from "../js/sync.js";
import { authenticator, memServer } from "./fakepasskey.mjs";

// Realistic old data: no updatedAt stamps, no mediaRefs, no shareName, no workoutOrder. Photos live in IndexedDB
// (keyed by exercise id) and are not in this JSON at all; the old state only knows the id.
const OLD = {
  version: 1,
  settings: { goal: "strength", showPhotos: true, lastExportAt: 1700000000000, restSeconds: 90 },
  customExercises: [{ id: "custom-1", name: "Cable fly", primary: "Chest", secondary: ["Shoulders"], images: 1, ext: "jpg" }],
  workouts: [
    { id: "w1", name: "Push", muscles: ["Chest"], items: [{ exerciseId: "barbell-bench-press", sets: 4, repMin: 5, repMax: 8, step: 2.5 }, { exerciseId: "custom-1", sets: 3, repMin: 10, repMax: 15, step: 1.25 }] },
    { id: "w2", name: "Legs", muscles: [], items: [{ exerciseId: "barbell-squat", sets: 5, repMin: 5, repMax: 5, step: 5, plates: true, emptyKg: 20 }] },
  ],
  active: null,
  sessions: [
    { id: "s1", workoutName: "Push", startedAt: 1700000100000, finishedAt: 1700003700000, entries: [{ exerciseId: "barbell-bench-press", name: "Barbell Bench Press", primary: "Chest", sets: [{ weight: 60, reps: 8, done: true }, { weight: 60, reps: 7, done: true }] }] },
    { id: "s2", workoutName: "Legs", startedAt: 1700100000000, finishedAt: 1700103600000, entries: [{ exerciseId: "barbell-squat", name: "Barbell Squat", primary: "Quads", sets: [{ weight: 100, reps: 5, done: true }] }] },
  ],
  bodyWeights: [{ id: "b1", date: "2026-01-01", kg: 80.5 }],
  swapCounts: { "barbell-bench-press|dumbbell-bench-press": 2 },
};
const raw = JSON.stringify(OLD);
const mem = (init) => {
  const m = new Map(init ? [[KEY, init]] : []);
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === "updatedAt" ? undefined : v)));

test("old saved state loads unchanged and re-saves unchanged (sync off)", () => {
  assert.equal(isValidState(JSON.parse(raw)), true);
  const storage = mem(raw);
  const store = createStore(storage);
  const r = store.load();
  assert.equal(r.recovered, false);
  assert.deepEqual(r.state, OLD);
  assert.equal(store.save(r.state), true);
  assert.deepEqual(JSON.parse(storage.getItem(KEY)), OLD); // nothing stamped, nothing added
});

test("old saved state survives turning sync on and reaches a second phone (sync on)", async () => {
  const server = memServer();
  const auth = authenticator();
  const prf = crypto.getRandomValues(new Uint8Array(32));
  const dev = (state) => {
    const d = { state, key: null };
    d.sync = createSync({
      getState: () => d.state, setState: (s) => (d.state = s), isSafe: () => true, applied: () => {},
      storage: mem(), passkey: auth.device({ prf }), fetch: server.fetch,
      keys: { get: async () => d.key, set: async (k) => void (d.key = k) }, url: "https://x",
    });
    return d;
  };
  const store = createStore(mem(raw));
  const a = dev(store.load().state);
  await a.sync.enable();
  await a.sync.syncNow();
  assert.deepEqual(strip(a.state), strip(OLD)); // only stamps were added on this phone
  const b = dev(createStore(mem()).load().state); // a fresh phone
  await b.sync.signIn();
  await b.sync.syncNow();
  for (const k of ["workouts", "sessions", "customExercises", "bodyWeights", "swapCounts"])
    assert.deepEqual(strip(b.state[k]), strip(OLD[k]), k);
  assert.equal(b.state.settings.goal, "strength");
});

test("state with a schedule, notes and supersets is valid and re-saves unchanged", () => {
  const NEW = structuredClone(OLD);
  NEW.settings.schedule = { days: { 1: "w1", 3: "next" } };
  NEW.sessions[0].entries[0].note = "seat 4";
  NEW.workouts[0].supersets = [{ id: "ss-1", ids: ["barbell-bench-press", "custom-1"], rest: "round" }];
  assert.equal(isValidState(structuredClone(NEW)), true);
  const storage = mem(JSON.stringify(NEW));
  const r = createStore(storage).load();
  assert.deepEqual(r.state, NEW);
  assert.equal(createStore(storage).save(r.state), true);
  assert.deepEqual(JSON.parse(storage.getItem(KEY)), NEW);
});
