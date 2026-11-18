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
test("plate settings survive export/import and are optional", () => {
  const s = sample();
  assert.equal(importJson(exportJson(s)).settings.plates, undefined);
  s.settings.plates = [20, 10];
  s.workouts.push({ id: "w", name: "W", muscles: [], items: [{ exerciseId: "x", sets: 3, repMin: 8, repMax: 12, step: 2.5, plates: true, emptyKg: 0 }] });
  assert.deepEqual(importJson(exportJson(s)), s);
});

// ---- sync groundwork: updatedAt stamps and tombstones ----
import { readBackup, fullHead, FULL_TAIL } from "../js/backup.js";
import { isValidState } from "../js/store.js";

const legacy = () => ({
  ...sample(),
  customExercises: [{ id: "c1", name: "X", primary: "Chest" }],
  bodyWeights: [{ id: "b1", date: "2026-01-01", kg: 80 }],
});
const loaded = (state = legacy()) => {
  const m = new Map([[KEY, JSON.stringify(state)]]);
  const store = createStore(mem(m));
  return { store, m, state: store.load().state };
};
const saved = (m) => JSON.parse(m.get(KEY));

test("legacy data loads untouched and a save without edits stamps nothing", () => {
  const { store, m, state } = loaded();
  assert.deepEqual(state, legacy());
  store.save(state);
  assert.deepEqual(saved(m), legacy());
  assert.equal("deleted" in saved(m), false);
});

test("stamps updatedAt only on changed records", () => {
  const { store, m, state } = loaded();
  state.sessions[0].finishedAt = 99;
  store.save(state);
  const s = saved(m);
  assert.equal(typeof s.sessions[0].updatedAt, "number");
  assert.equal(s.workouts[0].updatedAt, undefined);
  assert.equal(s.customExercises[0].updatedAt, undefined);
  assert.equal(s.bodyWeights[0].updatedAt, undefined);
  assert.equal(s.settings.updatedAt, undefined);
});

test("settings edit stamps settings; lastExportAt and active do not", () => {
  const { store, m, state } = loaded();
  state.settings.lastExportAt = 5;
  state.active = { workoutName: "A", startedAt: 1, entries: [] };
  store.save(state);
  assert.equal(saved(m).settings.updatedAt, undefined);
  state.settings.goal = "strength";
  store.save(state);
  assert.equal(typeof saved(m).settings.updatedAt, "number");
});

test("updatedAt never goes backwards", () => {
  const { store, state } = loaded();
  state.sessions[0].finishedAt = 3;
  state.sessions[0].updatedAt = Date.now() + 1e9;
  store.save(state);
  const before = state.sessions[0].updatedAt;
  state.sessions[0].finishedAt = 4;
  store.save(state);
  assert.equal(state.sessions[0].updatedAt, before + 1);
});

test("removed record leaves a tombstone; kept ones do not", () => {
  const { store, m, state } = loaded();
  state.sessions.pop();
  state.bodyWeights = [];
  store.save(state);
  const s = saved(m);
  assert.deepEqual(Object.keys(s.deleted).sort(), ["b1", "s1"]);
  assert.equal(typeof s.deleted.s1, "number");
});

test("first load, empty load and corrupt load create no tombstones", () => {
  const { store, m, state } = loaded();
  store.save(state);
  assert.equal(saved(m).deleted, undefined);
  const e = createStore(mem(fake()));
  const r = e.load();
  e.save(r.state);
  const c = createStore(mem(new Map([[KEY, "{bad"]])));
  const rc = c.load();
  assert.equal(rc.recovered, true);
  assert.equal(c.save(rc.state), true);
  assert.equal(rc.state.deleted, undefined);
});

test("save before load invents nothing", () => {
  const st = mem(fake());
  const store = createStore(st);
  const s = sample();
  store.save(s);
  assert.deepEqual(JSON.parse(st.getItem(KEY)), sample());
});

test("resetSnapshot swap creates no tombstones and no stamps", () => {
  const { store, m } = loaded();
  const other = { ...emptyState(), sessions: [] };
  store.save(other, { resetSnapshot: true });
  assert.equal(saved(m).deleted, undefined);
  other.sessions.push({ id: "n", startedAt: 1, entries: [] });
  store.save(other);
  assert.equal(saved(m).deleted, undefined);
  assert.equal(typeof saved(m).sessions[0].updatedAt, "number");
});

test("a failed write does not move the snapshot", () => {
  const m = new Map([[KEY, JSON.stringify(legacy())]]);
  let fail = false;
  const store = createStore({
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => (fail ? (() => { throw new Error("full"); })() : void m.set(k, v)),
  });
  const state = store.load().state;
  state.sessions.pop();
  fail = true;
  assert.equal(store.save(state), false);
  fail = false;
  assert.equal(store.save(state), true);
  assert.ok(JSON.parse(m.get(KEY)).deleted.s1);
});

test("stamping keeps object identity (screens hold references)", () => {
  const { store, state } = loaded();
  const s0 = state.sessions[0];
  const settings = state.settings;
  s0.finishedAt = 7;
  store.save(state);
  assert.equal(state.sessions[0], s0);
  assert.equal(state.settings, settings);
});

test("workout days without an id get a stable one", () => {
  const old = legacy();
  delete old.workouts[0].id;
  const m = new Map([[KEY, JSON.stringify(old)]]);
  const store = createStore(mem(m));
  const a = store.load().state;
  const id = a.workouts[0].id;
  assert.ok(id);
  store.save(a);
  assert.equal(store.save(a) && JSON.parse(m.get(KEY)).workouts[0].id, id);
  assert.equal(createStore(mem(m)).load().state.workouts[0].id, id);
  assert.equal(JSON.parse(m.get(KEY)).workouts[0].updatedAt, undefined);
});

test("state with updatedAt and deleted is valid; old state still is", () => {
  const s = legacy();
  assert.equal(isValidState(s), true);
  s.deleted = { x: 1 };
  s.settings.updatedAt = 2;
  s.sessions[0].updatedAt = 3;
  assert.equal(isValidState(s), true);
  for (const bad of [
    (o) => (o.deleted = []),
    (o) => (o.deleted = { x: "1" }),
    (o) => (o.settings.updatedAt = "1"),
    (o) => (o.sessions[0].updatedAt = "1"),
  ]) {
    const o = structuredClone(s);
    bad(o);
    assert.equal(isValidState(o), false);
  }
});

test("stamped data survives save and reload, and the old validator shape accepts it", () => {
  const { store, m, state } = loaded();
  state.sessions.pop();
  state.workouts[0].name = "B";
  store.save(state);
  const again = createStore(mem(m)).load();
  assert.equal(again.recovered, false);
  assert.deepEqual(again.state, state);
  // Older app versions only check version, settings, arrays and known fields: extras are ignored.
  assert.equal(again.state.version, 1);
});

test("full backup round-trips stamps and tombstones", async () => {
  const { store, state } = loaded();
  state.sessions.pop();
  state.workouts[0].name = "B";
  store.save(state);
  const text = fullHead(state) + FULL_TAIL;
  const r = readBackup(text);
  assert.deepEqual(r.state, state);
  assert.deepEqual(importJson(exportJson(state)), state);
});
