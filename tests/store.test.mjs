import test from "node:test";
import assert from "node:assert/strict";
import {
  KEY,
  CORRUPT_KEY,
  emptyState,
  createStore,
  exportJson,
  importJson,
} from "../js/store.js";

const fake = () => new Map([]);
const mem = (m = new Map()) => ({
  getItem: (k) => (m.has(k) ? m.get(k) : null),
  setItem: (k, v) => void m.set(k, v),
});
const MSG = "This file is not a Gym Tracker backup.";

const sample = () => ({
  ...emptyState(),
  workouts: [
    {
      id: "w1",
      name: "A",
      muscles: ["Chest"],
      items: [{ exerciseId: "e1", sets: 3, repMin: 8, repMax: 12, step: 2.5 }],
    },
  ],
  sessions: [
    {
      id: "s1",
      workoutId: "w1",
      workoutName: "A",
      startedAt: 1,
      finishedAt: 2,
      entries: [
        {
          exerciseId: "e1",
          name: "Bench Press",
          primary: "Chest",
          sets: [{ weight: 60, reps: 10, done: true }],
        },
      ],
    },
  ],
});

test("constants and emptyState", () => {
  assert.equal(KEY, "gymtracker.v1");
  assert.equal(CORRUPT_KEY, "gymtracker.corrupt");
  assert.deepEqual(emptyState(), {
    version: 1,
    settings: { goal: "muscle", showPhotos: true, lastExportAt: null },
    customExercises: [],
    workouts: [],
    active: null,
    sessions: [],
  });
});

test("load on empty storage", () => {
  const r = createStore(mem(fake())).load();
  assert.deepEqual(r, { state: emptyState(), recovered: false });
});

test("save then load round-trips", () => {
  const st = mem(fake());
  const store = createStore(st);
  assert.equal(store.save(sample()), true);
  assert.deepEqual(store.load(), { state: sample(), recovered: false });
});

test("corrupt JSON is preserved and replaced", () => {
  const m = new Map([[KEY, "{not json"]]);
  const r = createStore(mem(m)).load();
  assert.deepEqual(r, { state: emptyState(), recovered: true });
  assert.equal(m.get(CORRUPT_KEY), "{not json");
});

test("parses but invalid is treated as corrupt", () => {
  const m = new Map([[KEY, '{"version":2}']]);
  assert.equal(createStore(mem(m)).load().recovered, true);
  assert.equal(m.get(CORRUPT_KEY), '{"version":2}');
});

test("save returns false when setItem throws", () => {
  const store = createStore({
    getItem: () => null,
    setItem() {
      throw new Error("quota");
    },
  });
  assert.equal(store.save(emptyState()), false);
});

test("importJson rejects invalid input with exact message", () => {
  const badSessions = { ...emptyState(), sessions: {} };
  const badWeight = sample();
  badWeight.sessions[0].entries[0].sets[0].weight = "60";
  for (const text of [
    "hello",
    "{}",
    '{"version":2,"workouts":[],"sessions":[]}',
    JSON.stringify(badSessions),
    JSON.stringify(badWeight),
  ]) {
    assert.throws(() => importJson(text), { message: MSG });
  }
});

test("export/import round-trips", () => {
  assert.deepEqual(importJson(exportJson(sample())), sample());
});
