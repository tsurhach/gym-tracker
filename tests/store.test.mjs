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
  assert.deepEqual(r, { state: emptyState(), recovered: false, kept: true });
});

test("save then load round-trips", () => {
  const st = mem(fake());
  const store = createStore(st);
  assert.equal(store.save(sample()), true);
  assert.deepEqual(store.load(), { state: sample(), recovered: false, kept: true });
});

test("corrupt JSON is preserved and replaced", () => {
  const m = new Map([[KEY, "{not json"]]);
  const r = createStore(mem(m)).load();
  assert.deepEqual(r, { state: emptyState(), recovered: true, kept: true });
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

test("load reports kept: false when the corrupt copy cannot be written", () => {
  const store = createStore({
    getItem: () => "{not json",
    setItem() {
      throw new Error("quota");
    },
  });
  assert.deepEqual(store.load(), { state: emptyState(), recovered: true, kept: false });
});

test("importJson rejects an unknown goal, a null workout and a string item field", () => {
  const bad = [
    { ...sample(), settings: { ...sample().settings, goal: "bulk" } },
    { ...sample(), workouts: [null] },
    (() => {
      const s = sample();
      s.workouts[0].items[0].sets = "3";
      return s;
    })(),
    { ...sample(), customExercises: [{ id: "c1", name: "X" }] },
  ];
  for (const s of bad) assert.throws(() => importJson(JSON.stringify(s)), { message: MSG });
});

test("a full valid state with custom exercises still round-trips", () => {
  const s = sample();
  s.customExercises.push({ id: "custom-1", name: "Zottman", primary: "Biceps", secondary: [], images: 0 });
  assert.deepEqual(importJson(exportJson(s)), s);
});

test("backupNudgeDismissedAt is optional in settings", async () => {
  const { isValidState } = await import("../js/store.js");
  const s = emptyState();
  assert.equal(isValidState(s), true);
  s.settings.backupNudgeDismissedAt = Date.now();
  assert.equal(isValidState(s), true);
});

test("load treats a throwing getItem as unreadable and blocks overwrite", () => {
  const store = createStore({
    getItem() {
      throw new Error("denied");
    },
    setItem() {},
  });
  assert.deepEqual(store.load(), { state: emptyState(), recovered: true, kept: false });
});

test("isValidState accepts empty, fresh-plan and in-progress states (null prefilled weight)", async () => {
  const { isValidState } = await import("../js/store.js");
  assert.equal(isValidState(emptyState()), true);
  assert.equal(isValidState(sample()), true);
  const s = sample();
  s.active = {
    id: "a1",
    workoutId: "w1",
    workoutName: "A",
    startedAt: 5,
    finishedAt: null,
    entries: [
      { exerciseId: "e1", name: "Bench", primary: "Chest", sets: [{ weight: null, reps: 8, done: false }] },
    ],
  };
  assert.equal(isValidState(s), true);
  s.customExercises.push({ id: "c1", name: "Z", primary: "Biceps" }); // no secondary
  assert.equal(isValidState(s), true);
});

test("importJson rejects a bad active, a session without id and a string secondary", () => {
  const noId = sample();
  delete noId.sessions[0].id;
  const bad = [
    { ...sample(), active: 5 },
    { ...sample(), active: { entries: "x" } },
    noId,
    { ...sample(), customExercises: [{ id: "c1", name: "X", primary: "Chest", secondary: "Chest" }] },
  ];
  for (const s of bad) assert.throws(() => importJson(JSON.stringify(s)), { message: MSG });
});

test("exportCsv: header, one row per confirmed set, quoting", async () => {
  const { exportCsv } = await import("../js/store.js");
  const s = emptyState();
  s.sessions.push({
    id: "a",
    workoutName: 'Push, "A"',
    startedAt: new Date(2026, 10, 5, 0, 30).getTime(),
    entries: [
      { exerciseId: "x", name: "Bench\nPress", sets: [{ weight: 50, reps: 8, done: true }, { weight: 52.5, reps: 6, done: false }, { weight: 55, reps: 5, done: true }] },
    ],
  });
  assert.equal(
    exportCsv(s),
    'date,workout,exercise,set,weight_kg,reps\r\n2026-11-05,"Push, ""A""","Bench\nPress",1,50,8\r\n2026-11-05,"Push, ""A""","Bench\nPress",2,55,5\r\n',
  );
  assert.equal(exportCsv(emptyState()), "date,workout,exercise,set,weight_kg,reps\r\n");
});

test("exportCsv: names starting with = + - @ are made text, numbers untouched", async () => {
  const { exportCsv } = await import("../js/store.js");
  const s = emptyState();
  s.sessions.push({
    id: "a", workoutName: "=SUM(A1)", startedAt: new Date(2026, 10, 5, 12).getTime(),
    entries: [{ exerciseId: "x", name: "-Curl", sets: [{ weight: -5, reps: 8, done: true }] }],
  });
  assert.equal(exportCsv(s), "date,workout,exercise,set,weight_kg,reps\r\n2026-11-05,'=SUM(A1),'-Curl,1,-5,8\r\n");
});
