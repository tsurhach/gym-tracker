import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchExercise, planFromFile } from "../js/planfile.js";
import { linkCustomsToLibrary } from "../js/migrate.js";

const lib = JSON.parse(readFileSync(new URL("../data/exercises.json", import.meta.url), "utf8"));
const id = (n) => matchExercise(n, lib)?.id ?? null;

test("owner's names and common spellings match the library", () => {
  const want = {
    "close-grip lat pulldown": "close-grip-front-lat-pulldown",
    "Close Grip Lat Pull Down": "close-grip-front-lat-pulldown",
    "dumbbell lateral raises": "lateral-raise",
    "dumbbell bicep curls": "dumbbell-bicep-curl",
    "DB Biceps Curls": "dumbbell-bicep-curl",
    crunches: "crunch",
    "rope triceps pushdown": "rope-triceps-pushdown",
    "Rope Tricep Pushdowns": "rope-triceps-pushdown",
    "rope pushdown": "rope-triceps-pushdown",
    "BB bench press": "bench-press",
    "Bench Press Barbell": "bench-press",
    "hammer curls": "hammer-curl",
    "sit ups": "sit-up",
    "pull down wide grip lat": "wide-grip-lat-pulldown",
    "incline cable flyes": "incline-cable-flye",
  };
  for (const [n, e] of Object.entries(want)) assert.equal(id(n), e, n);
});

test("names that are not in the library stay custom", () => {
  for (const n of ["bicep curl", "curl", "Bicep Curls", "Reverse Curl Machine", "פשט", "נשיאה", "Zottman Curl", "Cable Crunch Twist"])
    assert.equal(id(n), null, n);
  const p = planFromFile(
    { format: "gym-tracker-plan", version: 1, name: "P", goal: "muscle", days: [{ name: "D", exercises: [{ name: "Bicep Curls", sets: 3, reps: [8, 10] }] }] },
    lib,
  );
  if (p.ok) assert.equal(p.days[0].exercises[0].kind, "new");
});

const set = (reps) => ({ weight: 10, reps, done: true });
const base = () => ({
  version: 1,
  settings: { goal: "muscle" },
  customExercises: [
    { id: "c1", name: "Dumbbell Bicep Curls", primary: "Biceps", secondary: [] },
    { id: "c2", name: "Zottman Curl", primary: "Biceps", secondary: [] },
    { id: "c3", name: "Crunches", primary: "Abs", secondary: [] },
  ],
  workouts: [
    { id: "w", name: "A", muscles: [], items: [
      { exerciseId: "c1", sets: 3, repMin: 8, repMax: 10, step: 2, restSec: 90, plates: false },
      { exerciseId: "c2", sets: 3, repMin: 8, repMax: 10, step: 2 },
      { exerciseId: "crunch", sets: 3, repMin: 8, repMax: 10, step: 2 },
      { exerciseId: "c3", sets: 3, repMin: 8, repMax: 10, step: 2 },
    ] },
  ],
  active: { workoutName: "A", startedAt: 1, entries: [{ exerciseId: "c1", name: "x", primary: "Biceps", sets: [set(5)] }] },
  sessions: [
    { id: "s", startedAt: 1, entries: [
      { exerciseId: "c1", name: "x", primary: "Biceps", sets: [set(8)] },
      { exerciseId: "c3", name: "y", primary: "Abs", sets: [set(12)] },
      { exerciseId: "crunch", name: "Crunch", primary: "Abs", sets: [set(15)] },
    ] },
  ],
});

test("migration rewrites ids everywhere, merges duplicates, keeps every set", () => {
  const s = base();
  assert.deepEqual(linkCustomsToLibrary(s, lib, new Set()), [
    { from: "Dumbbell Bicep Curls", to: "Dumbbell Bicep Curl" },
    { from: "Crunches", to: "Crunch" },
  ]);
  assert.deepEqual(s.customExercises.map((c) => c.id), ["c2"]);
  assert.deepEqual(s.workouts[0].items.map((i) => i.exerciseId), ["dumbbell-bicep-curl", "c2", "crunch"]);
  assert.equal(s.workouts[0].items[0].restSec, 90);
  assert.equal(s.active.entries[0].exerciseId, "dumbbell-bicep-curl");
  assert.equal(s.active.entries[0].name, "Dumbbell Bicep Curl");
  const e = s.sessions[0].entries;
  assert.deepEqual(e.map((x) => x.exerciseId), ["dumbbell-bicep-curl", "crunch"]);
  assert.deepEqual(e[1].sets.map((t) => t.reps), [12, 15]);
});

test("migration is a no-op the second time, skips customs with media, and ignores plain data", () => {
  const s = base();
  linkCustomsToLibrary(s, lib, new Set());
  const once = JSON.stringify(s);
  assert.deepEqual(linkCustomsToLibrary(s, lib, new Set()), []);
  assert.equal(JSON.stringify(s), once);

  const m = base();
  assert.deepEqual(linkCustomsToLibrary(m, lib, new Set(["c1", "c3"])), []);
  assert.deepEqual(m, base());

  const none = { version: 1, settings: {}, customExercises: [], workouts: [], active: null, sessions: [] };
  assert.deepEqual(linkCustomsToLibrary(none, lib, new Set()), []);
  assert.deepEqual(none.workouts, []);
});

test("a custom exactly named like an old alias (Squat) is left alone", () => {
  const s = base();
  s.customExercises.push({ id: "c9", name: "Squat", primary: "Quads", secondary: [] });
  linkCustomsToLibrary(s, lib, new Set());
  assert.ok(s.customExercises.some((c) => c.id === "c9"));
});
